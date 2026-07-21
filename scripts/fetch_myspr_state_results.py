#!/usr/bin/env python3
"""Archive every DUN result for a current MySPR Semak state-election event."""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


def request(opener, url: str, data: dict[str, str] | None = None) -> bytes:
    encoded = urllib.parse.urlencode(data).encode() if data else None
    headers = {"User-Agent": "politik-data-archiver/1.0", "Accept": "application/json,text/html"}
    with opener.open(urllib.request.Request(url, data=encoded, headers=headers), timeout=60) as response:
        return response.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive a complete official MySPR Semak PRU DUN event.")
    parser.add_argument("--base-url", default="https://mysemak.spr.gov.my")
    parser.add_argument("--event-id", default="DEB173C8-F8EB-4F81-B922-68D38D2895E1")
    parser.add_argument("--state-ref", default="CC43499B-6796-4069-839E-AE88640675A9")
    parser.add_argument("--event-name", default="PRU DEWAN NEGERI JOHOR KE-16")
    parser.add_argument("--output", type=Path, default=Path("sources/spr/state-elections/mysemak-johor-2026.json"))
    parser.add_argument("--insecure", action="store_true", help="Disable TLS verification only when the local trust store cannot validate SPR.")
    args = parser.parse_args()
    try:
        context = ssl._create_unverified_context() if args.insecure else ssl.create_default_context()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=context))
        base = args.base_url.rstrip("/")
        landing = request(opener, f"{base}/semakan/keputusan").decode("utf-8")
        token_match = re.search(r'name="_token" value="([^"]+)"', landing)
        if not token_match:
            raise ValueError("MySPR landing page did not contain a CSRF token.")
        event_page = request(
            opener,
            f"{base}/semakan/keputusan/terkini",
            {"_token": token_match.group(1), "Jenis": "20", "PilihanrayaId": args.event_id, "RefNegeriId": args.state_ref},
        ).decode("utf-8")
        ajax_token_match = re.search(r'"_token":\s*"([^"]+)"', event_page)
        if not ajax_token_match:
            raise ValueError("MySPR event page did not contain its request token.")
        seats = re.findall(
            r'<div id="(\d+)" class="tab-dun-item[^>]*>\s*<span id="kod-dun">([^<]+)</span>\s*<span id="nama-dun">([^<]+)</span>',
            event_page,
        )
        if not seats:
            raise ValueError("MySPR event page did not expose any DUN controls.")
        results = []
        for source_code, listed_code, listed_name in seats:
            payload = request(
                opener,
                f"{base}/semakan/keputusan/keputusanPruDun",
                {"_token": ajax_token_match.group(1), "kategori": "PRU_DUN", "PilihanrayaId": args.event_id, "RefNegeriId": args.state_ref, "kodbahagian": source_code},
            )
            value = json.loads(payload)
            if not value.get("penamaanMenang"):
                raise ValueError(f"No final result returned for {listed_code} {listed_name}.")
            results.append({"sourceCode": source_code, "listedCode": listed_code.strip(), "listedName": listed_name.strip(), "response": value})
        output = {
            "version": 1,
            "metadata": {
                "title": args.event_name,
                "retrievedAt": date.today().isoformat(),
                "sourceUrl": f"{base}/semakan/keputusan",
                "eventId": args.event_id,
                "stateRef": args.state_ref,
                "seatCount": len(results),
            },
            "results": results,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Archived {len(results)} final DUN results to {args.output}.")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
