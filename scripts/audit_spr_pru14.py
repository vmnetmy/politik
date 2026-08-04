#!/usr/bin/env python3
"""Produce a deterministic official-source audit for published PRU-14 data."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


AUDIT_DATE = "2026-08-05"


class Pru14AuditError(ValueError):
    pass


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise Pru14AuditError(f"{path} must contain a JSON object.")
    return value


def build(root: Path) -> dict[str, Any]:
    election_directory = root / "public/data/elections/pru-14"
    source_manifest = load(root / "sources/pru14/scoresheets/manifest.json")
    index = load(election_directory / "scoresheets/index.json")
    election = load(election_directory / "election.json")
    dun_directory = root / "public/data/state-election-scoresheets/prn-14"
    dun_source_manifest = load(root / "sources/pru14/dun-scoresheets/manifest.json")
    dun_index = load(dun_directory / "index.json")
    sabah_dun_directory = root / "public/data/state-election-scoresheets/prn-15"
    sabah_dun_source_manifest = load(root / "sources/pru14/sabah-assembly-15-scoresheets/manifest.json")
    sabah_dun_index = load(sabah_dun_directory / "index.json")
    official_source_search = load(root / "sources/pru14/official-source-search.json")
    state_elections = load(root / "public/data/state-elections.json")
    seats = {seat["code"]: seat for seat in election["seats"]}
    published_codes = {item["parliamentCode"] for item in index["seats"]}
    rejected_codes = {item["parliamentCode"] for item in source_manifest["rejectedSources"]}
    unavailable = {item["parliamentCode"]: item for item in index["unavailableSeats"]}

    checks: list[dict[str, Any]] = []

    def check(identifier: str, passed: bool, message: str, **details: Any) -> None:
        checks.append({"id": identifier, "status": "passed" if passed else "failed", "message": message, **details})
        if not passed:
            raise Pru14AuditError(message)

    check("seat-count", len(seats) == 222, "Official aggregate contains all 222 parliamentary seats.", actual=len(seats))
    check(
        "registered-voters",
        sum(seat["registered"] for seat in seats.values()) == 14_940_624,
        "Registered voters reconcile to the official PRU-14 electoral roll.",
        actual=sum(seat["registered"] for seat in seats.values()),
        expected=14_940_624,
    )
    check(
        "archive-accounting",
        len(source_manifest["files"]) == 190 and len(published_codes) == 180 and len(rejected_codes) == 10,
        "The supplied archive is completely classified as published or rejected.",
        archived=190,
        published=len(published_codes),
        rejected=len(rejected_codes),
    )
    check(
        "declared-gaps",
        len(unavailable) == 42
        and sum(item["category"] == "missing-source" for item in unavailable.values()) == 32
        and sum(item["category"] == "rejected-source" for item in unavailable.values()) == 10,
        "Every unpublished seat has a declared source-gap category and reason.",
        unavailable=len(unavailable),
        missingSources=32,
        rejectedSources=10,
    )

    stream_count = 0
    for code in sorted(published_codes):
        result = load(election_directory / "scoresheets" / f"{code}.json")
        seat = seats[code]
        candidate_totals = {candidate["id"]: candidate["votes"] for candidate in seat["candidates"]}
        if result["totals"]["candidateVotes"] != candidate_totals:
            raise Pru14AuditError(f"{code} scoresheet candidate totals differ from the published aggregate.")
        if result["registeredVoters"] != seat["registered"]:
            raise Pru14AuditError(f"{code} registered-voter total differs from the published aggregate.")
        for row in result["rows"]:
            if sum(row["candidateVotes"].values()) != row["validVotes"]:
                raise Pru14AuditError(f"{code} row {row['id']} candidate votes do not balance.")
            if row["ballotsInBox"] != row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"]:
                raise Pru14AuditError(f"{code} row {row['id']} ballot accounting does not balance.")
            stream_count += 1
    check(
        "stream-accounting",
        stream_count == index["metadata"]["totalRows"] == 24_814,
        "Every published polling stream passes candidate and ballot accounting.",
        streams=stream_count,
    )

    dun_stream_count = 0
    state_contests = {contest["id"]: contest for contest in state_elections["contests"]}
    for entry in dun_index["contests"]:
        result = load(dun_directory / entry["resultFile"])
        contest = state_contests[entry["contestId"]]
        if result["totals"]["candidateVotes"] != {candidate["id"]: candidate["votes"] for candidate in contest["candidates"]}:
            raise Pru14AuditError(f"{entry['contestId']} DUN totals differ from the published aggregate.")
        for row in result["rows"]:
            if sum(row["candidateVotes"].values()) != row["validVotes"]:
                raise Pru14AuditError(f"{entry['contestId']} row {row['id']} candidate votes do not balance.")
            if row["ballotsInBox"] != row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"]:
                raise Pru14AuditError(f"{entry['contestId']} row {row['id']} ballot accounting does not balance.")
            dun_stream_count += 1
    check(
        "dun-archive-accounting",
        len(dun_source_manifest["files"]) == 444
        and dun_index["metadata"]["publishedContests"] == 440
        and dun_index["metadata"]["rejectedSourceCount"] == 4
        and dun_index["metadata"]["uncontestedCount"] == 1,
        "The PRN-14 DUN archive is completely classified, including uncontested Rantau.",
        archived=444,
        published=440,
        rejected=4,
        uncontested=1,
    )
    check(
        "dun-stream-accounting",
        dun_stream_count == dun_index["metadata"]["totalRows"] == 22_449,
        "Every published PRN-14 DUN polling stream passes candidate and ballot accounting.",
        streams=dun_stream_count,
    )

    sabah_stream_count = 0
    for entry in sabah_dun_index["contests"]:
        result = load(sabah_dun_directory / entry["resultFile"])
        contest = state_contests[entry["contestId"]]
        if result["totals"]["candidateVotes"] != {candidate["id"]: candidate["votes"] for candidate in contest["candidates"]}:
            raise Pru14AuditError(f"{entry['contestId']} Sabah DUN totals differ from the published aggregate.")
        for row in result["rows"]:
            if sum(row["candidateVotes"].values()) != row["validVotes"]:
                raise Pru14AuditError(f"{entry['contestId']} row {row['id']} candidate votes do not balance.")
            if row["ballotsInBox"] != row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"]:
                raise Pru14AuditError(f"{entry['contestId']} row {row['id']} ballot accounting does not balance.")
            sabah_stream_count += 1
    check(
        "sabah-assembly-15-archive-accounting",
        len(sabah_dun_source_manifest["files"]) == 60
        and sabah_dun_index["metadata"]["publishedContests"] == 55
        and sabah_dun_index["metadata"]["rejectedSourceCount"] == 5,
        "All 60 Sabah Assembly-15 workbooks are classified against the historical PRU-14 registry.",
        archived=60,
        published=55,
        rejected=5,
    )
    check(
        "sabah-assembly-15-stream-accounting",
        sabah_stream_count == sabah_dun_index["metadata"]["totalRows"] == 2_100,
        "Every published Sabah Assembly-15 polling stream passes candidate and ballot accounting.",
        streams=sabah_stream_count,
    )
    check(
        "official-source-recovery",
        official_source_search["searchOutcome"].startswith("No official replacement"),
        "Official SPR locations were checked and unresolved source gaps remain explicitly declared.",
        checkedAt=official_source_search["checkedAt"],
        locationsChecked=len(official_source_search["officialLocationsChecked"]),
    )

    bagan_datuk = seats["P.075"]
    check(
        "p075-source-precedence",
        bagan_datuk["winner"]["votes"] == 18_909 and bagan_datuk["marginVotes"] == 5_073,
        "P.075 uses the SPR scoresheet value that reproduces SPR's published majority.",
        openDataVotes=18_908,
        scoresheetVotes=18_909,
        runnerUpVotes=13_836,
        publishedMajority=5_073,
    )

    return {
        "version": 1,
        "electionId": "pru-14",
        "status": "passed-with-declared-gaps-and-source-precedence",
        "checkedAt": AUDIT_DATE,
        "sources": {
            "openData": "https://opendata.spr.gov.my/",
            "results": "https://mysprsemak.spr.gov.my/semakan/keputusan/pru",
            "electoralRoll": "https://www.spr.gov.my/sites/default/files/HargaDPIST42017_PRU14.pdf",
            "scoresheetManifest": "sources/pru14/scoresheets/manifest.json",
            "dunScoresheetManifest": "sources/pru14/dun-scoresheets/manifest.json",
            "sabahDunScoresheetManifest": "sources/pru14/sabah-assembly-15-scoresheets/manifest.json",
            "officialSourceSearch": "sources/pru14/official-source-search.json",
        },
        "coverage": {
            "totalSeats": 222,
            "archivedSources": 190,
            "publishedSeats": 180,
            "rejectedSources": 10,
            "missingSources": 32,
            "coveragePct": 180 / 222,
            "dun": {
                "totalContests": 505,
                "archivedSources": 504,
                "publishedContests": 495,
                "rejectedSources": 9,
                "uncontested": 1,
                "coveragePct": 495 / 505,
                "assembly14": {
                    "totalContests": 445,
                    "publishedContests": 440,
                    "rejectedSources": 4,
                    "uncontested": 1
                },
                "sabahAssembly15": {
                    "totalContests": 60,
                    "publishedContests": 55,
                    "rejectedSources": 5
                },
            },
        },
        "checks": checks,
        "rejectedSources": source_manifest["rejectedSources"],
        "missingSources": [item for item in index["unavailableSeats"] if item["category"] == "missing-source"],
        "resolvedConflicts": source_manifest["resolvedConflicts"],
        "dunRejectedSources": dun_source_manifest["rejectedSources"],
        "sabahDunRejectedSources": sabah_dun_source_manifest["rejectedSources"],
        "officialSourceSearch": official_source_search,
    }


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit PRU-14 publication data against archived SPR sources.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, default=Path("public/data/elections/pru-14/spr-audit.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        content = render(build(args.root))
        output = args.output if args.output.is_absolute() else args.root / args.output
        if args.check:
            if not output.exists() or output.read_text(encoding="utf-8") != content:
                raise Pru14AuditError(f"{output} is stale. Run npm run data:spr-pru14.")
            print("PRU-14 official-source audit is current.")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(content, encoding="utf-8")
            print(f"Wrote PRU-14 official-source audit to {output}.")
        return 0
    except (OSError, KeyError, TypeError, json.JSONDecodeError, Pru14AuditError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
