#!/usr/bin/env python3
"""Build the cross-election person registry from published candidacy snapshots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def build(election_paths: list[Path], existing: dict | None = None) -> dict:
    existing_people = {person["id"]: person for person in (existing or {}).get("persons", [])}
    people: dict[str, dict] = {}
    for election_path in election_paths:
        election = json.loads(election_path.read_text(encoding="utf-8"))
        for seat in election["seats"]:
            for candidate in seat["candidates"]:
                previous = existing_people.get(candidate["personId"], {})
                person = people.setdefault(candidate["personId"], {
                    "id": candidate["personId"],
                    "canonicalName": previous.get("canonicalName", candidate["name"]),
                    "aliases": previous.get("aliases", []),
                    "candidacyIds": [],
                })
                if candidate["name"] != person["canonicalName"] and candidate["name"] not in person["aliases"]:
                    person["aliases"].append(candidate["name"])
                person["candidacyIds"].append(candidate["candidacyId"])
    for person in people.values():
        person["aliases"].sort()
        person["candidacyIds"].sort()
    return {"version": 1, "persons": sorted(people.values(), key=lambda item: item["id"])}


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the shared person registry.")
    parser.add_argument("--election", type=Path, action="append", dest="elections", default=[])
    parser.add_argument("--registry", type=Path, default=Path("public/data/elections/index.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/reference/persons.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.elections:
        elections = args.elections
    else:
        registry = json.loads(args.registry.read_text(encoding="utf-8"))
        elections = [args.registry.parent.parent / edition["path"] / "election.json" for edition in registry["elections"]]
    existing = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else None
    content = render(build(elections, existing))
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != content:
            raise SystemExit(f"{args.output} is stale. Run npm run data:persons.")
        print(f"Validated shared person registry from {len(elections)} election dataset(s).")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding="utf-8")
    print(f"Wrote shared person registry from {len(elections)} election dataset(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
