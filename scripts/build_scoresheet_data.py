#!/usr/bin/env python3
"""Build complete PRU-15 saluran data with SPR 760 scoresheets taking precedence."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb

if __package__:
    from .extract_scoresheets import (
        ScoresheetExtractionError,
        apply_authoritative_results,
        assign_candidates,
        build_artifacts,
        serialise,
        sha256,
        slug,
        write_or_check,
    )
else:
    from extract_scoresheets import (
        ScoresheetExtractionError,
        apply_authoritative_results,
        assign_candidates,
        build_artifacts,
        serialise,
        sha256,
        slug,
        write_or_check,
    )


BALLOTS_URL = "https://lake.electiondata.my/results_saluran/ge15_ballots.parquet"
STATS_URL = "https://lake.electiondata.my/results_saluran/ge15_stats.parquet"
CATALOGUE_URL = "https://electiondata.my/data-catalogue/saluran-ballots-ge15/"
STATS_CATALOGUE_URL = "https://electiondata.my/data-catalogue/saluran-stats-ge15/"
LICENCE = "CC0-1.0"
DM_PATTERN = re.compile(r"^(\d{3}/\d{2}/(?:\d{2}|UP))\s*(.*)$")


def combined_sha256(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()


def seat_code(value: str) -> str:
    match = re.match(r"^(P\.\d{3})\b", value)
    if not match:
        raise ScoresheetExtractionError(f"Cannot read Parliament code from {value!r}.")
    return match.group(1)


def split_dm(value: str) -> tuple[str, str]:
    match = DM_PATTERN.match(value.strip())
    if not match:
        raise ScoresheetExtractionError(f"Cannot read polling-district code from {value!r}.")
    return match.group(1), match.group(2).strip()


def section_for(code: str) -> str:
    if code.endswith("/UP"):
        return "postal"
    if code.endswith("/00"):
        return "early"
    return "ordinary"


def query_dicts(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    cursor = connection.execute(sql)
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def build_electiondata_results(
    source_root: Path,
    seats: dict[str, dict[str, Any]],
    excluded_codes: set[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, Any]]:
    ballots_path = source_root / "ge15_ballots.parquet"
    stats_path = source_root / "ge15_stats.parquet"
    for path in (ballots_path, stats_path):
        if not path.exists():
            raise ScoresheetExtractionError(f"Missing ElectionData.MY source {path}.")

    connection = duckdb.connect()
    ballot_totals = query_dicts(
        connection,
        f"""
        SELECT regexp_extract(seat, '^P\\.\\d{{3}}') AS parliament_code,
               ballot_order, name_on_ballot, SUM(votes)::BIGINT AS votes
        FROM read_parquet('{ballots_path.as_posix()}')
        GROUP BY ALL
        ORDER BY parliament_code, ballot_order
        """,
    )
    stats = query_dicts(
        connection,
        f"""
        SELECT date, seat, dm, pm, saluran, ballots_issued, ballots_not_returned,
               votes_rejected, votes_valid
        FROM read_parquet('{stats_path.as_posix()}')
        ORDER BY seat, date, dm, pm, saluran
        """,
    )
    ballots = query_dicts(
        connection,
        f"""
        SELECT seat, dm, pm, saluran, ballot_order, votes
        FROM read_parquet('{ballots_path.as_posix()}')
        ORDER BY seat, dm, pm, saluran, ballot_order
        """,
    )
    connection.close()

    totals_by_seat: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in ballot_totals:
        totals_by_seat[row["parliament_code"]].append(row)

    ballot_streams: dict[tuple[str, str, str, int], dict[int, int]] = defaultdict(dict)
    for row in ballots:
        code = seat_code(row["seat"])
        if code in excluded_codes:
            continue
        key = (code, row["dm"], row["pm"], int(row["saluran"]))
        ballot_streams[key][int(row["ballot_order"])] = int(row["votes"])

    stats_by_seat: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in stats:
        code = seat_code(row["seat"])
        if code not in excluded_codes:
            stats_by_seat[code].append(row)

    results: dict[str, dict[str, Any]] = {}
    districts: dict[str, dict[str, Any]] = {}
    centres: dict[str, dict[str, Any]] = {}
    source_hash = combined_sha256([ballots_path, stats_path])

    for code in sorted(stats_by_seat, key=lambda value: int(value.split(".")[1])):
        if code not in seats:
            raise ScoresheetExtractionError(f"ElectionData.MY contains unknown seat {code}.")
        source_columns = totals_by_seat[code]
        candidate_columns = assign_candidates(
            [item["name_on_ballot"] for item in source_columns],
            [int(item["votes"]) for item in source_columns],
            seats[code]["candidates"],
            code,
        )
        candidate_by_order = {
            item["column"]: item["candidateId"] for item in candidate_columns
        }
        rows: list[dict[str, Any]] = []
        election_dates: set[str] = set()

        for sequence, item in enumerate(stats_by_seat[code], start=1):
            election_dates.add(item["date"].isoformat())
            dm_code, dm_name = split_dm(item["dm"])
            section = section_for(dm_code)
            stream = int(item["saluran"])
            key = (code, item["dm"], item["pm"], stream)
            source_votes = ballot_streams.get(key)
            if source_votes is None or len(source_votes) != len(candidate_columns):
                raise ScoresheetExtractionError(f"Incomplete candidate votes for {key}.")
            candidate_votes = {
                candidate_by_order[order]: votes for order, votes in source_votes.items()
            }
            valid_votes = int(item["votes_valid"])
            rejected_votes = int(item["votes_rejected"])
            unreturned_votes = int(item["ballots_not_returned"])
            ballots_issued = int(item["ballots_issued"])
            if sum(candidate_votes.values()) != valid_votes:
                raise ScoresheetExtractionError(f"Candidate votes do not balance for {key}.")
            if valid_votes + rejected_votes + unreturned_votes != ballots_issued:
                raise ScoresheetExtractionError(f"Ballot accounting does not balance for {key}.")

            district_id: str | None = None
            centre_id: str | None = None
            if section != "postal":
                district_id = f"{code}:{dm_code}"
                centre_id = f"{district_id}:{slug(item['pm'])}"
                district = districts.setdefault(
                    district_id,
                    {
                        "id": district_id,
                        "code": dm_code,
                        "name": dm_name or ("UNDI AWAL" if section == "early" else item["pm"]),
                        "parliamentCode": code,
                        "section": section,
                        "pollingCentreIds": [],
                    },
                )
                if centre_id not in district["pollingCentreIds"]:
                    district["pollingCentreIds"].append(centre_id)
                centre = centres.setdefault(
                    centre_id,
                    {
                        "id": centre_id,
                        "name": item["pm"],
                        "parliamentCode": code,
                        "pollingDistrictId": district_id,
                        "streamCount": 0,
                    },
                )
                centre["streamCount"] += 1

            row_id = f"{code}:{dm_code}:{slug(item['pm'])}:{stream}"
            rows.append(
                {
                    "id": row_id,
                    "section": section,
                    "sequence": sequence,
                    "pollingDistrictId": district_id,
                    "pollingCentreId": centre_id,
                    "streamNumber": stream,
                    "ballotsInBox": ballots_issued,
                    "candidateVotes": candidate_votes,
                    "validVotes": valid_votes,
                    "rejectedVotes": rejected_votes,
                    "unreturnedVotes": unreturned_votes,
                }
            )

        if len(election_dates) != 1:
            raise ScoresheetExtractionError(f"{code} has multiple election dates: {election_dates}.")
        result_totals = {
            "pollingStreams": len(rows),
            "ballotsInBox": sum(row["ballotsInBox"] for row in rows),
            "candidateVotes": {
                column["candidateId"]: sum(
                    row["candidateVotes"][column["candidateId"]] for row in rows
                )
                for column in candidate_columns
            },
            "validVotes": sum(row["validVotes"] for row in rows),
            "rejectedVotes": sum(row["rejectedVotes"] for row in rows),
            "unreturnedVotes": sum(row["unreturnedVotes"] for row in rows),
        }
        if result_totals["candidateVotes"] != {
            item["candidateId"]: item["scoresheetVotes"] for item in candidate_columns
        }:
            raise ScoresheetExtractionError(f"Candidate totals do not balance for {code}.")
        results[code] = {
            "version": 1,
            "metadata": {
                "title": f"DATA SALURAN PRU-15 {code} {seats[code]['name']}",
                "sourceType": "electiondata-my",
                "sourceFile": "ge15_ballots.parquet + ge15_stats.parquet",
                "sourceSha256": source_hash,
                "sourcePages": 0,
                "sourceUrl": CATALOGUE_URL,
                "sourceStatsUrl": STATS_CATALOGUE_URL,
                "licence": LICENCE,
                "printDate": next(iter(election_dates)),
            },
            "parliamentCode": code,
            "registeredVoters": int(seats[code]["registered"]),
            "candidateColumns": candidate_columns,
            "rows": rows,
            "totals": result_totals,
        }

    expected = set(seats) - excluded_codes
    if set(results) != expected:
        missing = sorted(expected - set(results))
        extra = sorted(set(results) - expected)
        raise ScoresheetExtractionError(
            f"ElectionData.MY fallback coverage mismatch; missing={missing}, extra={extra}."
        )

    manifest = {
        "version": 1,
        "algorithm": "sha256",
        "publisher": "ElectionData.MY",
        "licence": LICENCE,
        "accessedAt": "2026-07-22",
        "files": [
            {
                "path": ballots_path.name,
                "url": BALLOTS_URL,
                "catalogueUrl": CATALOGUE_URL,
                "sha256": sha256(ballots_path),
                "bytes": ballots_path.stat().st_size,
                "rows": 173848,
            },
            {
                "path": stats_path.name,
                "url": STATS_URL,
                "catalogueUrl": STATS_CATALOGUE_URL,
                "sha256": sha256(stats_path),
                "bytes": stats_path.stat().st_size,
                "rows": 39537,
            },
        ],
    }
    return results, districts, centres, manifest


def build_all(
    scoresheet_root: Path,
    electiondata_root: Path,
    election_path: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, dict[str, Any]], dict[str, Any], dict[str, Any]]:
    pdf_manifest, index, places, official_results, election = build_artifacts(
        scoresheet_root, election_path
    )
    seats = {seat["code"]: seat for seat in election["seats"]}
    official_codes = set(official_results)
    fallback_results, fallback_districts, fallback_centres, open_manifest = (
        build_electiondata_results(electiondata_root, seats, official_codes)
    )
    apply_authoritative_results(
        election, {code: {"result": result} for code, result in fallback_results.items()}
    )

    for result in official_results.values():
        result["metadata"]["sourceType"] = "spr-760"
    for entry in index["seats"]:
        entry["sourceType"] = "spr-760"

    all_districts = {item["id"]: item for item in places["pollingDistricts"]}
    all_centres = {item["id"]: item for item in places["pollingCentres"]}
    for item in fallback_districts.values():
        if item["id"] in all_districts:
            raise ScoresheetExtractionError(f"Duplicate polling district {item['id']}.")
        all_districts[item["id"]] = item
    for item in fallback_centres.values():
        if item["id"] in all_centres:
            raise ScoresheetExtractionError(f"Duplicate polling centre {item['id']}.")
        all_centres[item["id"]] = item

    fallback_entries = []
    for code in sorted(fallback_results, key=lambda value: int(value.split(".")[1])):
        result = fallback_results[code]
        fallback_entries.append(
            {
                "parliamentCode": code,
                "parliamentName": seats[code]["name"],
                "state": seats[code]["state"],
                "sourceType": "electiondata-my",
                "sourceFile": result["metadata"]["sourceFile"],
                "sourceSha256": result["metadata"]["sourceSha256"],
                "sourceUrl": CATALOGUE_URL,
                "pages": 0,
                "rowCount": len(result["rows"]),
                "pollingDistrictCount": sum(
                    item["parliamentCode"] == code for item in fallback_districts.values()
                ),
                "pollingCentreCount": sum(
                    item["parliamentCode"] == code for item in fallback_centres.values()
                ),
                "status": "supplementary",
            }
        )
    index["seats"] = sorted(
        [*index["seats"], *fallback_entries],
        key=lambda item: int(item["parliamentCode"].split(".")[1]),
    )
    all_results = {**official_results, **fallback_results}
    totals = {
        field: sum(result["totals"][field] for result in all_results.values())
        for field in ("ballotsInBox", "validVotes", "rejectedVotes", "unreturnedVotes")
    }
    index["metadata"].update(
        {
            "title": "Liputan data saluran PRU-15",
            "sourceCount": len(pdf_manifest["files"]) + len(open_manifest["files"]),
            "officialScoresheetCount": len(pdf_manifest["files"]),
            "supplementaryDatasetCount": len(open_manifest["files"]),
            "authoritativeSeats": len(official_results),
            "supplementarySeats": len(fallback_results),
            "coveredSeats": len(all_results),
            "coveragePct": round(len(all_results) / len(seats), 6),
            "totalRows": sum(len(result["rows"]) for result in all_results.values()),
            "pollingDistrictCount": len(all_districts),
            "printedPollingDistrictCount": sum(
                not item["code"].startswith("EARLY-") for item in all_districts.values()
            ),
            "syntheticPollingDistrictCount": sum(
                item["code"].startswith("EARLY-") for item in all_districts.values()
            ),
            "pollingCentreCount": len(all_centres),
            **totals,
        }
    )
    places = {
        "version": 1,
        "metadata": {
            "sourceCount": index["metadata"]["sourceCount"],
            "coveredSeats": len(all_results),
        },
        "pollingDistricts": sorted(all_districts.values(), key=lambda item: item["id"]),
        "pollingCentres": sorted(all_centres.values(), key=lambda item: item["id"]),
    }
    return pdf_manifest, open_manifest, index, places, all_results, election


def main() -> int:
    parser = argparse.ArgumentParser(description="Build complete PRU-15 saluran data.")
    parser.add_argument("--scoresheet-root", type=Path, default=Path("sources/pru15/scoresheets"))
    parser.add_argument("--electiondata-root", type=Path, default=Path("sources/electiondata-my/pru15"))
    parser.add_argument("--election", type=Path, default=Path("public/data/election.json"))
    parser.add_argument("--output-directory", type=Path, default=Path("public/data/scoresheets"))
    parser.add_argument("--polling-places-output", type=Path, default=Path("public/data/polling-places.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        pdf_manifest, open_manifest, index, places, results, election = build_all(
            args.scoresheet_root, args.electiondata_root, args.election
        )
        outputs = [
            (args.election, serialise(election, compact=True)),
            (args.scoresheet_root / "manifest.json", serialise(pdf_manifest)),
            (args.electiondata_root / "manifest.json", serialise(open_manifest)),
            (args.output_directory / "index.json", serialise(index)),
            (args.polling_places_output, serialise(places)),
        ]
        outputs.extend(
            (args.output_directory / f"{code}.json", serialise(result, compact=True))
            for code, result in results.items()
        )
        for path, content in outputs:
            write_or_check(path, content, args.check)
        if not args.check:
            expected = {f"{code}.json" for code in results} | {"index.json"}
            for stale in args.output_directory.glob("*.json"):
                if stale.name not in expected:
                    stale.unlink()
        action = "Validated" if args.check else "Wrote"
        print(
            f"{action} {len(results)} seats: {index['metadata']['authoritativeSeats']} SPR 760 and "
            f"{index['metadata']['supplementarySeats']} ElectionData.MY fallbacks; "
            f"{index['metadata']['totalRows']} polling streams."
        )
        return 0
    except (OSError, json.JSONDecodeError, duckdb.Error, ScoresheetExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
