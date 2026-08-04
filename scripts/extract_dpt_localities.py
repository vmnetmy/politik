#!/usr/bin/env python3
"""Extract SPR DPT locality rows from archived PDFs into governed JSON snapshots."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any


LOCALITY_CODE = re.compile(r"(?P<code>\d{3}/\d{2}/\d{2}/\d{3})")
TRAILING_COUNTS = re.compile(r"(?:\s+\d[\d,]*(?:\.\d+)*)+\s*$")
LEADING_ROW = re.compile(r"^\s*(?:\d+[.)]\s+|BIL\.?\s+)", flags=re.IGNORECASE)
HEADER_WORDS = {
    "KOD",
    "KOD LOKALITI",
    "LOKALITI",
    "NAMA LOKALITI",
    "SENARAI LOKALITI",
    "TEMPAT KEDIAMAN",
}


class DptLocalityError(ValueError):
    pass


def normalise(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


def clean_name(value: str) -> str:
    value = TRAILING_COUNTS.sub("", LEADING_ROW.sub("", value))
    value = re.sub(r"\s{2,}", " ", value).strip(" -:|\t")
    return value.upper()


def candidate_name(line: str, match: re.Match[str]) -> str:
    before = clean_name(line[: match.start()])
    after = clean_name(line[match.end() :])
    candidates = [
        value
        for value in (before, after)
        if len(normalise(value)) >= 3
        and normalise(value) not in HEADER_WORDS
        and not normalise(value).startswith("MUKA SURAT")
    ]
    if not candidates:
        raise DptLocalityError(f"Cannot identify a locality name beside {match.group('code')!r}.")
    return max(candidates, key=lambda value: sum(character.isalpha() for character in value))


def parse_locality_text(text: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    seen: dict[str, str] = {}
    for raw_line in text.splitlines():
        match = LOCALITY_CODE.search(raw_line)
        if not match:
            continue
        full_code = match.group("code")
        name = candidate_name(raw_line, match)
        previous = seen.get(full_code)
        if previous and normalise(previous) != normalise(name):
            raise DptLocalityError(f"Conflicting names for {full_code}: {previous!r} and {name!r}.")
        if previous:
            continue
        seen[full_code] = name
        parliament, dun, pdm, locality = full_code.split("/")
        records.append(
            {
                "fullCode": full_code,
                "parliamentCode": f"P.{parliament}",
                "dunCode": f"N.{dun}",
                "pdmCode": f"{parliament}/{dun}/{pdm}",
                "code": locality,
                "name": name,
            }
        )
    if not records:
        raise DptLocalityError("No full SPR locality codes were found in the extracted PDF text.")
    return records


def extract_pdf_text(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".txt") as output:
        try:
            subprocess.run(
                ["pdftotext", "-layout", str(path), output.name],
                check=True,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise DptLocalityError("pdftotext is required to extract DPT PDFs.") from exc
        except subprocess.CalledProcessError as exc:
            raise DptLocalityError(f"Cannot extract {path}: {exc.stderr.strip()}") from exc
        return Path(output.name).read_text(encoding="utf-8", errors="replace")


def build(source_index: dict[str, Any], source_directory: Path) -> dict[str, Any]:
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    source_lookup = {item["archivedFile"]: item for item in source_index["sources"]}
    found_files = sorted(source_directory.glob("*.pdf"))
    unknown = [path.name for path in found_files if path.name not in source_lookup]
    if unknown:
        raise DptLocalityError(f"PDFs missing from the source index: {', '.join(unknown)}.")
    for path in found_files:
        source = source_lookup[path.name]
        for record in parse_locality_text(extract_pdf_text(path)):
            grouped[(source["id"], record["pdmCode"])].append(record)

    snapshots: list[dict[str, Any]] = []
    for (source_id, pdm_code), records in sorted(grouped.items()):
        source = next(item for item in source_index["sources"] if item["id"] == source_id)
        identities = {(record["parliamentCode"], record["dunCode"]) for record in records}
        if len(identities) != 1:
            raise DptLocalityError(f"{source_id} contains inconsistent hierarchy for {pdm_code}.")
        parliament_code, dun_code = identities.pop()
        snapshots.append(
            {
                "id": f"{source_id}-{pdm_code.replace('/', '-')}",
                "url": source["url"],
                "sourceLabel": source["sourceLabel"],
                "publishedAt": source["publishedAt"],
                "parliamentCode": parliament_code,
                "dunCode": dun_code,
                "pdmCode": pdm_code,
                "localities": [
                    {"code": record["code"], "name": record["name"]}
                    for record in sorted(records, key=lambda item: item["code"])
                ],
            }
        )
    return {
        "version": 2,
        "metadata": {
            "description": "Rekod lokaliti diekstrak daripada arkib PDF DPT rasmi SPR; liputan kekal separa sehingga semua PDF sumber diperoleh.",
            "retrievedAt": source_index["retrievedAt"],
            "archivedPdfCount": len(found_files),
            "pdmSnapshotCount": len(snapshots),
        },
        "sources": snapshots,
    }


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-index", type=Path, default=Path("sources/spr/geography/dpt-source-index.json"))
    parser.add_argument("--source-directory", type=Path, default=Path("sources/spr/geography/dpt"))
    parser.add_argument("--output", type=Path, default=Path("sources/spr/geography/localities.extracted.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        source_index = json.loads(args.source_index.read_text(encoding="utf-8"))
        rendered = render(build(source_index, args.source_directory))
        if args.check:
            if not args.output.is_file() or args.output.read_text(encoding="utf-8") != rendered:
                raise DptLocalityError(f"{args.output} is stale.")
            print("Archived DPT locality extraction is current.")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
            print(f"Wrote DPT locality snapshots to {args.output}.")
        return 0
    except (OSError, KeyError, json.JSONDecodeError, DptLocalityError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
