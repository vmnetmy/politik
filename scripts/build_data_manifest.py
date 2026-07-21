#!/usr/bin/env python3
"""Build a deterministic integrity manifest for every published data artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


DATA_FILES = {
    "election.json": "seats",
    "seating.json": "positions",
    "changes.json": "changes",
    "affiliations.json": "affiliations",
    "candidate-changes.json": "candidateChanges",
    "parties.json": "parties",
    "alliances.json": "alliances",
    "constituencies.json": "duns",
    "voter-age.json": "dunRecords",
    "polling-places.json": "pollingDistricts",
    "scoresheets/index.json": "seats",
}


def build(data_directory: Path) -> dict[str, Any]:
    files: dict[str, Any] = {}
    for filename, collection_key in DATA_FILES.items():
        path = data_directory / filename
        raw = path.read_bytes()
        value = json.loads(raw)
        collection = value.get(collection_key, [])
        if not isinstance(collection, list):
            raise ValueError(f"{filename} must contain a {collection_key} array.")
        files[filename] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "records": len(collection),
        }
    scoresheet_directory = data_directory / "scoresheets"
    for path in sorted(scoresheet_directory.glob("P.*.json")):
        relative = path.relative_to(data_directory).as_posix()
        raw = path.read_bytes()
        value = json.loads(raw)
        collection = value.get("rows", [])
        if not isinstance(collection, list):
            raise ValueError(f"{relative} must contain a rows array.")
        files[relative] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "records": len(collection),
        }
    return {"version": 1, "algorithm": "sha256", "files": files}


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the published data integrity manifest.")
    parser.add_argument("--data-directory", type=Path, default=Path("public/data"))
    parser.add_argument("--output", type=Path, default=Path("public/data/manifest.json"))
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()
    try:
        rendered = render(build(args.data_directory))
        if args.stdout:
            print(rendered, end="")
            return 0
        if args.check:
            if args.output.read_text(encoding="utf-8") != rendered:
                raise ValueError(f"{args.output} is stale. Run npm run data:manifest.")
            print("Published data integrity manifest is current.")
            return 0
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Wrote integrity manifest to {args.output}.")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
