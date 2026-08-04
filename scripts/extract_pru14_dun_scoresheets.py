#!/usr/bin/env python3
"""Extract reconciled PRU-14 DUN polling-stream results from SPR XLSX files."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

try:
    from .extract_pru14_scoresheets import (
        PRINT_DATE,
        REGISTERED_VOTERS,
        SPR_ELECTORAL_ROLL_URL,
        SPR_OPEN_DATA_URL,
        SPR_RESULTS_URL,
        as_integer,
        clean_text,
        extract_rows,
        source_totals,
        table_layout,
        workbook_rows,
    )
    from .extract_scoresheets import (
        ScoresheetExtractionError,
        assign_candidates,
        serialise,
        sha256,
        write_or_check,
    )
except ImportError:
    from extract_pru14_scoresheets import (  # type: ignore[no-redef]
        PRINT_DATE,
        REGISTERED_VOTERS,
        SPR_ELECTORAL_ROLL_URL,
        SPR_OPEN_DATA_URL,
        SPR_RESULTS_URL,
        as_integer,
        clean_text,
        extract_rows,
        source_totals,
        table_layout,
        workbook_rows,
    )
    from extract_scoresheets import (  # type: ignore[no-redef]
        ScoresheetExtractionError,
        assign_candidates,
        serialise,
        sha256,
        write_or_check,
    )


DUN_CODE = re.compile(r"\bN\.?\s*(\d{1,3})\b", re.IGNORECASE)


def source_identity(path: Path, rows: list[dict[int, Any]]) -> tuple[str, int]:
    heading = " ".join(
        clean_text(value)
        for row in rows[: min(7, len(rows))]
        for value in row.values()
    )
    code_match = DUN_CODE.search(heading)
    registered_match = REGISTERED_VOTERS.search(heading)
    if not code_match:
        raise ScoresheetExtractionError("DUN code is absent from the workbook heading.")
    if not registered_match:
        raise ScoresheetExtractionError("Registered-voter total is absent from the workbook heading.")
    return f"N.{int(code_match.group(1)):02d}", int(registered_match.group(1).replace(",", ""))


def extract_workbook(path: Path, contest: dict[str, Any], source_root: Path) -> dict[str, Any]:
    rows = workbook_rows(path)
    source_code, registered = source_identity(path, rows)
    expected_code = contest["dunId"].split(":")[-1]
    if source_code != expected_code:
        raise ScoresheetExtractionError(f"Workbook is {source_code}, expected {expected_code}.")
    if registered != contest["registeredVoters"]:
        raise ScoresheetExtractionError(
            f"Registered voters {registered:,} do not match SPR electoral-roll total {contest['registeredVoters']:,}."
        )
    total_row, base_column, valid_column, headers, candidate_count = table_layout(rows)
    streams, ballots, source_votes, valid, rejected, unreturned = source_totals(
        rows, total_row, base_column, valid_column, candidate_count
    )
    if candidate_count != len(contest["candidates"]):
        raise ScoresheetExtractionError(
            f"Workbook has {candidate_count} candidates; SPR aggregate has {len(contest['candidates'])}."
        )
    mapped = assign_candidates(headers, source_votes, contest["candidates"], contest["id"])
    official_votes = {candidate["id"]: candidate["votes"] for candidate in contest["candidates"]}
    workbook_votes = {
        mapped[index]["candidateId"]: source_votes[index]
        for index in range(candidate_count)
    }
    if workbook_votes != official_votes:
        raise ScoresheetExtractionError("Final candidate totals do not match the official SPR aggregate result.")
    extracted_rows, districts, centres = extract_rows(
        rows, total_row, base_column, valid_column, mapped, contest["id"]
    )
    accounting = {
        "pollingStreams": len(extracted_rows),
        "ballotsInBox": sum(row["ballotsInBox"] for row in extracted_rows),
        "validVotes": sum(row["validVotes"] for row in extracted_rows),
        "rejectedVotes": sum(row["rejectedVotes"] for row in extracted_rows),
        "unreturnedVotes": sum(row["unreturnedVotes"] for row in extracted_rows),
    }
    expected_accounting = {
        "pollingStreams": streams if streams is not None else len(extracted_rows),
        "ballotsInBox": ballots,
        "validVotes": valid,
        "rejectedVotes": rejected,
        "unreturnedVotes": unreturned,
    }
    if accounting != expected_accounting:
        raise ScoresheetExtractionError(
            f"Stream totals {accounting!r} do not match final JUMLAH {expected_accounting!r}."
        )
    candidate_totals = {
        candidate["candidateId"]: sum(
            row["candidateVotes"][candidate["candidateId"]] for row in extracted_rows
        )
        for candidate in mapped
    }
    if candidate_totals != workbook_votes:
        raise ScoresheetExtractionError("Stream candidate totals do not match final JUMLAH.")
    return {
        "result": {
            "version": 1,
            "metadata": {
                "title": f"Helaian mata SPR PRU-14 {contest['stateId']} {source_code}",
                "sourceType": "spr-scoresheet-xlsx",
                "sourceFile": path.relative_to(source_root).as_posix(),
                "sourceSha256": sha256(path),
                "sourceUrl": SPR_RESULTS_URL,
                "sourceStatsUrl": SPR_OPEN_DATA_URL,
                "electionDate": PRINT_DATE,
            },
            "contestId": contest["id"],
            "eventId": contest["eventId"],
            "stateId": contest["stateId"],
            "dunId": contest["dunId"],
            "dunCode": source_code,
            "registeredVoters": registered,
            "candidateColumns": mapped,
            "rows": extracted_rows,
            "pollingDistricts": sorted(districts.values(), key=lambda item: item["id"]),
            "pollingCentres": sorted(centres.values(), key=lambda item: item["id"]),
            "totals": {**accounting, "candidateVotes": candidate_totals},
        },
        "bytes": path.stat().st_size,
    }


def build_selected_artifacts(
    source_root: Path,
    state_elections_path: Path,
    *,
    event_ids: set[str],
    publication_title: str,
    source_root_label: str,
    scope_note: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    state_elections = json.loads(state_elections_path.read_text(encoding="utf-8"))
    events = {
        event["stateId"]: event
        for event in state_elections["events"]
        if event["id"] in event_ids
    }
    missing_events = sorted(event_ids - {event["id"] for event in events.values()})
    if missing_events:
        raise ScoresheetExtractionError(f"State-election events are absent: {missing_events}.")
    contests = {
        (contest["stateId"], contest["dunId"].split(":")[-1]): contest
        for contest in state_elections["contests"]
        if contest["eventId"] in {event["id"] for event in events.values()}
    }
    files = sorted(source_root.glob("*/*.xlsx"))
    if not files:
        raise ScoresheetExtractionError(f"No DUN XLSX scoresheets found under {source_root}.")
    results: dict[str, dict[str, Any]] = {}
    source_files: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for path in files:
        state_id = path.parent.name
        filename_code = DUN_CODE.search(path.stem)
        if not filename_code:
            raise ScoresheetExtractionError(f"DUN code is absent from filename {path}.")
        code = f"N.{int(filename_code.group(1)):02d}"
        contest = contests.get((state_id, code))
        if not contest:
            raise ScoresheetExtractionError(f"Unknown PRU-14 DUN contest {state_id} {code}.")
        try:
            item = extract_workbook(path, contest, source_root)
        except ScoresheetExtractionError as exc:
            record = {
                "path": path.relative_to(source_root).as_posix(),
                "contestId": contest["id"],
                "stateId": state_id,
                "dunCode": code,
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
                "status": "rejected",
                "reason": str(exc),
            }
            source_files.append(record)
            rejected.append(record)
            continue
        result = item["result"]
        results[contest["id"]] = result
        source_files.append(
            {
                "path": result["metadata"]["sourceFile"],
                "contestId": contest["id"],
                "stateId": state_id,
                "dunCode": code,
                "sha256": result["metadata"]["sourceSha256"],
                "bytes": item["bytes"],
                "status": "published",
            }
        )
    unavailable = []
    rejected_by_contest = {item["contestId"]: item for item in rejected}
    for contest in sorted(contests.values(), key=lambda item: (item["stateId"], item["dunId"])):
        if contest["id"] in results:
            continue
        rejected_item = rejected_by_contest.get(contest["id"])
        uncontested = contest["validVotes"] == 0 and len(contest["candidates"]) == 1
        unavailable.append(
            {
                "contestId": contest["id"],
                "eventId": contest["eventId"],
                "stateId": contest["stateId"],
                "dunId": contest["dunId"],
                "dunCode": contest["dunId"].split(":")[-1],
                "category": "rejected-source" if rejected_item else "uncontested" if uncontested else "missing-source",
                "reason": rejected_item["reason"] if rejected_item else "Menang tanpa bertanding; tiada pengundian atau helaian mata." if uncontested else "Tiada workbook DUN dalam arkib sumber yang dibekalkan.",
            }
        )
    totals = {
        field: sum(result["totals"][field] for result in results.values())
        for field in ("ballotsInBox", "validVotes", "rejectedVotes", "unreturnedVotes")
    }
    index = {
        "version": 1,
        "metadata": {
            "title": publication_title,
            "electionDate": PRINT_DATE,
            "sourceCount": len(files),
            "publishedContests": len(results),
            "rejectedSourceCount": len(rejected),
            "missingSourceCount": sum(item["category"] == "missing-source" for item in unavailable),
            "uncontestedCount": sum(item["category"] == "uncontested" for item in unavailable),
            "coveredContests": len(results),
            "totalContests": len(contests),
            "coveragePct": len(results) / len(contests),
            "totalRows": sum(len(result["rows"]) for result in results.values()),
            **totals,
        },
        "contests": [
            {
                "contestId": result["contestId"],
                "eventId": result["eventId"],
                "stateId": result["stateId"],
                "dunId": result["dunId"],
                "dunCode": result["dunCode"],
                "sourceFile": result["metadata"]["sourceFile"],
                "sourceSha256": result["metadata"]["sourceSha256"],
                "resultFile": f"{result['stateId']}/{result['dunCode']}.json",
                "rowCount": len(result["rows"]),
                "pollingDistrictCount": len(result["pollingDistricts"]),
                "pollingCentreCount": len(result["pollingCentres"]),
                "status": "authoritative",
            }
            for result in sorted(results.values(), key=lambda item: (item["stateId"], item["dunCode"]))
        ],
        "unavailableContests": unavailable,
    }
    manifest = {
        "version": 1,
        "algorithm": "sha256",
        "sourceRoot": source_root_label,
        "provenance": {
            "publisher": "Suruhanjaya Pilihan Raya Malaysia",
            "workbookFooter": "© SPR 2018 Versi 1.1.0 - Suruhanjaya Pilihan Raya Malaysia",
            "officialResultsUrl": SPR_RESULTS_URL,
            "officialOpenDataUrl": SPR_OPEN_DATA_URL,
            "officialElectoralRollUrl": SPR_ELECTORAL_ROLL_URL,
            "scopeNote": scope_note,
        },
        "files": source_files,
        "rejectedSources": rejected,
    }
    return manifest, index, results


def build_artifacts(
    source_root: Path, state_elections_path: Path
) -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    state_elections = json.loads(state_elections_path.read_text(encoding="utf-8"))
    event_ids = {
        event["id"]
        for event in state_elections["events"]
        if event["assemblyNumber"] == 14 and event["year"] == 2018
    }
    return build_selected_artifacts(
        source_root,
        state_elections_path,
        event_ids=event_ids,
        publication_title="Liputan helaian mata SPR DUN PRU-14",
        source_root_label="sources/pru14/dun-scoresheets",
        scope_note="Eleven Assembly-14 state elections held concurrently with PRU-14; Sabah used Assembly 15 and is published separately.",
    )


def apply_authoritative_results(state_elections: dict[str, Any], results: dict[str, dict[str, Any]]) -> None:
    contests = {contest["id"]: contest for contest in state_elections["contests"]}
    for contest_id, result in results.items():
        contest = contests[contest_id]
        totals = result["totals"]
        source_votes = totals["candidateVotes"]
        valid = totals["validVotes"]
        candidates = []
        for candidate in contest["candidates"]:
            votes = source_votes[candidate["id"]]
            candidates.append({**candidate, "votes": votes, "share": votes / valid if valid else 0})
        candidates.sort(key=lambda item: item["votes"], reverse=True)
        winner, runner_up = candidates[0], candidates[1] if len(candidates) > 1 else None
        contest.update(
            {
                "turnoutVotes": totals["ballotsInBox"],
                "turnoutPct": totals["ballotsInBox"] / contest["registeredVoters"] if contest["registeredVoters"] else None,
                "validVotes": valid,
                "rejectedVotes": totals["rejectedVotes"],
                "unreturnedVotes": totals["unreturnedVotes"],
                "majorityVotes": winner["votes"] - (runner_up["votes"] if runner_up else 0),
                "winnerCandidateId": winner["id"],
                "candidates": candidates,
            }
        )
    contests_by_event: dict[str, list[dict[str, Any]]] = {}
    for contest in state_elections["contests"]:
        contests_by_event.setdefault(contest["eventId"], []).append(contest)
    for event in state_elections["events"]:
        event_contests = contests_by_event.get(event["id"], [])
        if event_contests and all(item["turnoutVotes"] is not None for item in event_contests):
            event["turnoutVotes"] = sum(item["turnoutVotes"] for item in event_contests)
            event["turnoutPct"] = event["turnoutVotes"] / event["registeredVoters"] if event["registeredVoters"] else None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PRU-14 DUN SPR XLSX scoresheets.")
    parser.add_argument("--source-root", type=Path, default=Path("sources/pru14/dun-scoresheets"))
    parser.add_argument("--state-elections", type=Path, default=Path("public/data/state-elections.json"))
    parser.add_argument("--output-directory", type=Path, default=Path("public/data/state-election-scoresheets/prn-14"))
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest, index, results = build_artifacts(args.source_root, args.state_elections)
        state_elections = json.loads(args.state_elections.read_text(encoding="utf-8"))
        apply_authoritative_results(state_elections, results)
        outputs = [
            (args.source_root / "manifest.json", serialise(manifest)),
            (args.output_directory / "index.json", serialise(index)),
            (args.state_elections, serialise(state_elections, compact=True)),
        ]
        outputs.extend(
            (args.output_directory / result["stateId"] / f"{result['dunCode']}.json", serialise(result, compact=True))
            for result in results.values()
        )
        for path, content in outputs:
            write_or_check(path, content, args.check)
        if not args.check:
            expected = {
                f"{result['stateId']}/{result['dunCode']}.json"
                for result in results.values()
            }
            for stale in args.output_directory.glob("*/*.json"):
                if stale.relative_to(args.output_directory).as_posix() not in expected:
                    stale.unlink()
        action = "Validated" if args.check else "Wrote"
        print(
            f"{action} {len(results)} PRU-14 DUN scoresheets, "
            f"{index['metadata']['totalRows']} polling streams; "
            f"{index['metadata']['rejectedSourceCount']} sources rejected."
        )
        return 0
    except (OSError, KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError, ScoresheetExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
