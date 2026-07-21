#!/usr/bin/env python3
"""Extract the gazetted Johor PRN-16 Form 16 results from P.U. (B) 246/2026."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

import pdfplumber


class JohorGazetteExtractionError(ValueError):
    pass


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT / "sources/spr/state-elections/pub-246-2026.pdf"
DEFAULT_OUTPUT = ROOT / "sources/spr/state-elections/pub-246-johor-2026.json"
HEADER = re.compile(r"Constituency of (N\.\d{2})\s+([^\n]+)")
WINNER_ROW = re.compile(r"^\s*(.+?)\s{2,}(N\.\d{2})\s+(.+?)\s*$")
CANDIDATE_ROW = re.compile(r"^\s*\d+\.\s+(.+?)\s{2,}([A-Z][A-Z0-9 .()/-]*?)\s{2,}([\d,]+)\s*$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def integer(value: str) -> int:
    return int(re.sub(r"[^0-9]", "", value))


def labelled_integer(block: str, label: str) -> int:
    lines = block.splitlines()
    for index, line in enumerate(lines):
        if label not in line:
            continue
        candidates = [line, *lines[index + 1 : index + 3]]
        for candidate in candidates:
            matches = re.findall(r"(?<!\d)(\d[\d,]*)\s*$", candidate.rstrip())
            if matches:
                return integer(matches[-1])
    raise JohorGazetteExtractionError(f"Missing numeric field {label!r}.")


def extract(pdf_path: Path) -> dict[str, Any]:
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != 62:
            raise JohorGazetteExtractionError(f"Expected 62 pages, found {len(pdf.pages)}.")
        first_schedule = "\n".join((page.extract_text(layout=True) or "") for page in pdf.pages[2:4])
        form_text = "\n".join((page.extract_text(layout=True) or "") for page in pdf.pages[4:61])

    gazetted_winners: dict[str, str] = {}
    for line in first_schedule.splitlines():
        match = WINNER_ROW.match(line)
        if match:
            gazetted_winners[match.group(2)] = " ".join(match.group(1).split()).upper()
    if len(gazetted_winners) != 56:
        raise JohorGazetteExtractionError(f"Expected 56 First Schedule winners, found {len(gazetted_winners)}.")

    headers = list(HEADER.finditer(form_text))
    if len(headers) != 56:
        raise JohorGazetteExtractionError(f"Expected 56 Form 16 constituencies, found {len(headers)}.")

    results = []
    for index, header in enumerate(headers):
        block_end = headers[index + 1].start() if index + 1 < len(headers) else len(form_text)
        block = form_text[header.end() : block_end]
        dun_code = header.group(1)
        dun_name = " ".join(header.group(2).split()).upper()
        candidates = []
        for line in block.splitlines():
            match = CANDIDATE_ROW.match(line)
            if match:
                candidates.append(
                    {
                        "name": " ".join(match.group(1).split()).upper(),
                        "party": " ".join(match.group(2).split()).upper(),
                        "votes": integer(match.group(3)),
                    }
                )
        if len(candidates) < 2:
            raise JohorGazetteExtractionError(f"Expected at least two candidates for {dun_code}.")

        registered = labelled_integer(block, "A - Jumlah pemilih")
        ballots_issued = labelled_integer(block, "B - Jumlah kertas undi yang dikeluarkan dalam pengundian")
        rejected = labelled_integer(block, "D - Jumlah kertas undi yang ditolak")
        unreturned = labelled_integer(block, "E - Bilangan kertas undi yang dikeluarkan tetapi tidak dimasukkan ke dalam peti undi")
        majority = labelled_integer(block, "G - Majoriti")
        turnout_match = re.search(r"F - Peratus pengundian \(B/A x 100\)\s+([\d.]+)%", block)
        if not turnout_match:
            raise JohorGazetteExtractionError(f"Missing turnout percentage for {dun_code}.")
        turnout_pct = float(turnout_match.group(1)) / 100
        valid_votes = sum(candidate["votes"] for candidate in candidates)
        ranked = sorted(candidates, key=lambda candidate: candidate["votes"], reverse=True)
        computed_majority = ranked[0]["votes"] - ranked[1]["votes"]
        if ballots_issued != valid_votes + rejected + unreturned:
            raise JohorGazetteExtractionError(
                f"Form 16 accounting failed for {dun_code}: {ballots_issued} != {valid_votes} + {rejected} + {unreturned}."
            )
        if majority != computed_majority:
            raise JohorGazetteExtractionError(f"Majority mismatch for {dun_code}: {majority} != {computed_majority}.")
        if abs(turnout_pct - ballots_issued / registered) > 0.00006:
            raise JohorGazetteExtractionError(f"Turnout mismatch for {dun_code}.")
        if ranked[0]["name"] != gazetted_winners[dun_code]:
            raise JohorGazetteExtractionError(
                f"Winner mismatch for {dun_code}: Form 16 has {ranked[0]['name']}, First Schedule has {gazetted_winners[dun_code]}."
            )
        for candidate in candidates:
            candidate["status"] = "winner" if candidate is ranked[0] else "runner-up"
        results.append(
            {
                "dunCode": dun_code,
                "dunName": dun_name,
                "registeredVoters": registered,
                "ballotsIssued": ballots_issued,
                "validVotes": valid_votes,
                "rejectedVotes": rejected,
                "unreturnedVotes": unreturned,
                "turnoutPct": turnout_pct,
                "majorityVotes": majority,
                "candidates": candidates,
            }
        )

    candidate_count = sum(len(result["candidates"]) for result in results)
    if candidate_count != 172:
        raise JohorGazetteExtractionError(f"Expected 172 candidates, found {candidate_count}.")
    registered_total = sum(result["registeredVoters"] for result in results)
    ballots_total = sum(result["ballotsIssued"] for result in results)
    valid_total = sum(result["validVotes"] for result in results)
    rejected_total = sum(result["rejectedVotes"] for result in results)
    unreturned_total = sum(result["unreturnedVotes"] for result in results)
    if registered_total != 2_727_926:
        raise JohorGazetteExtractionError(f"Unexpected electorate total {registered_total}.")
    return {
        "version": 1,
        "metadata": {
            "title": "P.U. (B) 246 - Keputusan PRN Johor ke-16",
            "publicationDate": "2026-07-20",
            "electionDate": "2026-07-11",
            "citation": "P.U. (B) 246, Warta Kerajaan Persekutuan, 20 Julai 2026",
            "sourceSha256": sha256(pdf_path),
            "seatCount": len(results),
            "candidateCount": candidate_count,
            "registeredVoters": registered_total,
            "ballotsIssued": ballots_total,
            "validVotes": valid_total,
            "rejectedVotes": rejected_total,
            "unreturnedVotes": unreturned_total,
            "turnoutPct": ballots_total / registered_total,
        },
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract gazetted Johor PRN-16 Form 16 results.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rendered = compact(extract(args.pdf))
        if args.check:
            if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
                raise JohorGazetteExtractionError(f"{args.output} is stale. Run npm run data:state-elections:gazette.")
            print("Johor PRN-16 gazette extraction is current.")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
            value = json.loads(rendered)
            print(f"Wrote {value['metadata']['seatCount']} gazetted Johor DUN results to {args.output}.")
        return 0
    except (OSError, KeyError, TypeError, JohorGazetteExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
