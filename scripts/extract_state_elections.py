#!/usr/bin/env python3
"""Build the latest 13 state-election events and all 600 DUN results from SPR Open Data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


class StateElectionExtractionError(ValueError):
    pass


PARLIAMENT_CODE = re.compile(r"P\.\d{3}")
DUN_CODE = re.compile(r"N\.(\d{1,3})")
WINNER_STATUSES = {"MNG", "MENANG"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalise(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


def slug(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def integer(value: Any) -> int:
    text = str(value or "").replace(",", "").strip()
    if not text or text.upper() == "NULL":
        return 0
    try:
        return int(float(text))
    except ValueError as exc:
        raise StateElectionExtractionError(f"Invalid integer {value!r}.") from exc


def percentage(value: Any) -> float:
    text = str(value or "").replace("%", "").strip()
    if not text:
        return 0
    try:
        return float(text) / 100
    except ValueError as exc:
        raise StateElectionExtractionError(f"Invalid percentage {value!r}.") from exc


def code(value: str, pattern: re.Pattern[str], label: str) -> str:
    match = pattern.search(value)
    if not match:
        raise StateElectionExtractionError(f"Missing {label} code in {value!r}.")
    return match.group(0)


def dun_code(value: str) -> str:
    match = DUN_CODE.search(value)
    if not match:
        raise StateElectionExtractionError(f"Missing DUN code in {value!r}.")
    return f"N.{int(match.group(1)):02d}"


def area_name(value: str, pattern: re.Pattern[str]) -> str:
    return " ".join(pattern.sub("", value, count=1).split()).upper()


def dataset_rows(dataset: str, sources: dict[str, list[dict[str, Any]]], event: dict[str, Any]) -> list[dict[str, Any]]:
    if dataset == "pub-246-johor-2026":
        rows = []
        for contest in sources[dataset]["results"]:
            for candidate in contest["candidates"]:
                rows.append(
                    {
                        "TAHUN PILIHAN RAYA": event["year"], "NEGERI": event["stateName"],
                        "PARLIMEN": "", "DEWAN UNDANGAN NEGERI": f"{contest['dunCode']} {contest['dunName']}",
                        "NAMA ATAS KERTAS UNDI": candidate["name"], "NAMA PARTI BERTANDING": candidate["party"],
                        "SINGKATAN NAMA PARTI BERTANDING": candidate["party"], "BILANGAN UNDI": candidate["votes"],
                        "StatusCalon": "MENANG" if candidate["status"] == "winner" else "KALAH",
                        "MAJORITI": contest["majorityVotes"], "UNDI TAK KEMBALI": contest["unreturnedVotes"],
                        "UNDI DITOLAK": contest["rejectedVotes"], "PERATUS UNDI": f"{contest['turnoutPct'] * 100:.2f}%",
                        "JumlahPemilih": contest["registeredVoters"], "_ballotsIssued": contest["ballotsIssued"],
                        "_dataset": dataset, "_electionDate": event["electionDate"],
                    }
                )
        return rows
    if dataset.startswith("mysemak-"):
        rows = []
        for item in sources[dataset]["results"]:
            response = item["response"]
            election = response["pilihanraya"][0]
            result = election["keputusan"][0]
            for candidate in election["penamaan"]:
                party = candidate["parti"]
                if candidate.get("parti_bebas"):
                    party = {**party, "Penerangan": f"BEBAS ({candidate['parti_bebas']['Penerangan']})", "NamaSingkatan": "BEBAS"}
                rows.append(
                    {
                        "TAHUN PILIHAN RAYA": event["year"], "NEGERI": event["stateName"],
                        "PARLIMEN": f"P.{int(result['KodParlimen']):03d}", "DEWAN UNDANGAN NEGERI": response["namaDun"],
                        "NAMA ATAS KERTAS UNDI": candidate["NamaUndiCalon"], "NAMA PARTI BERTANDING": party["Penerangan"],
                        "SINGKATAN NAMA PARTI BERTANDING": party["NamaSingkatan"], "BILANGAN UNDI": candidate["BilUndi"],
                        "StatusCalon": candidate["StatusCalon"], "MAJORITI": result["Majoriti"],
                        "UNDI TAK KEMBALI": "", "UNDI DITOLAK": "", "PERATUS UNDI": "", "JumlahPemilih": "",
                        "_dataset": dataset, "_electionDate": event["electionDate"],
                    }
                )
        return rows
    rows = []
    for row in sources[dataset]:
        if normalise(row.get("NEGERI")) != normalise(event["stateName"]):
            continue
        if integer(row.get("TAHUN PILIHAN RAYA")) != event["year"]:
            continue
        if dataset == "keputusan-pru" and row.get("JenisCalon") != "DUN":
            continue
        if dataset == "keputusan-pru-dun" and normalise(row.get("JENIS PILIHAN RAYA")) != "PRU DUN":
            continue
        rows.append({**row, "_dataset": dataset, "_electionDate": event["electionDate"]})
    return rows


def source_value(rows: list[dict[str, Any]], key: str, parser) -> Any:
    values = {parser(row.get(key)) for row in rows if parser(row.get(key)) != 0}
    if len(values) > 1:
        raise StateElectionExtractionError(f"Conflicting {key} values: {sorted(values)}")
    return next(iter(values), 0)


def build(source_directory: Path, constituencies_path: Path) -> dict[str, Any]:
    source_metadata = json.loads((source_directory / "source.json").read_text(encoding="utf-8"))
    event_config = json.loads((source_directory / "events.json").read_text(encoding="utf-8"))["events"]
    tracked_sources = [*source_metadata["sources"], *source_metadata.get("references", [])]
    source_paths = {item["id"]: source_directory / item["archivedFile"] for item in source_metadata["sources"]}
    for item in tracked_sources:
        archived_path = source_directory / item["archivedFile"]
        if not archived_path.exists():
            raise StateElectionExtractionError(f"Archived source missing for {item['id']}.")
        if sha256(archived_path) != item["sha256"]:
            raise StateElectionExtractionError(f"Archived source hash changed for {item['id']}.")
    sources = {key: json.loads(path.read_text(encoding="utf-8")) for key, path in source_paths.items()}
    constituencies = json.loads(constituencies_path.read_text(encoding="utf-8"))
    states = {item["id"]: item for item in constituencies["states"]}
    parliaments = {item["code"]: item for item in constituencies["parliaments"]}
    duns_by_code = {(item["parliamentCode"], item["code"]): item for item in constituencies["duns"]}

    events: list[dict[str, Any]] = []
    contests: list[dict[str, Any]] = []
    data_issues: list[dict[str, Any]] = []
    covered_duns: set[str] = set()
    for configured_event in event_config:
        state = states.get(configured_event["stateId"])
        if not state or normalise(state["name"]) != normalise(configured_event["stateName"]):
            raise StateElectionExtractionError(f"Unknown state identity for {configured_event['id']}.")
        rows = dataset_rows(configured_event["dataset"], sources, configured_event)
        for supplement in configured_event.get("supplementDuns", []):
            supplemental = dataset_rows(supplement["dataset"], sources, configured_event)
            rows.extend(
                {**row, "_electionDate": supplement["electionDate"]}
                for row in supplemental
                if dun_code(row["DEWAN UNDANGAN NEGERI"]) == supplement["dunCode"]
            )
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            state_dun_code = dun_code(row["DEWAN UNDANGAN NEGERI"])
            if row.get("PARLIMEN"):
                parliament_code = code(row["PARLIMEN"], PARLIAMENT_CODE, "Parliament")
            else:
                matches = [item for item in constituencies["duns"] if item["stateId"] == state["id"] and item["code"] == state_dun_code]
                if len(matches) != 1:
                    raise StateElectionExtractionError(f"Cannot resolve reusable Parliament identity for {state['id']} {state_dun_code}.")
                parliament_code = matches[0]["parliamentCode"]
            grouped[(parliament_code, state_dun_code)].append(row)

        event_contests: list[dict[str, Any]] = []
        for (parliament_code, state_dun_code), candidate_rows in sorted(grouped.items()):
            parliament = parliaments.get(parliament_code)
            dun = duns_by_code.get((parliament_code, state_dun_code))
            if not parliament or parliament["stateId"] != state["id"] or not dun:
                raise StateElectionExtractionError(f"Unknown constituency {parliament_code} {state_dun_code}.")
            source_dun_name = area_name(candidate_rows[0]["DEWAN UNDANGAN NEGERI"], DUN_CODE)
            if normalise(source_dun_name) != normalise(dun["name"]):
                raise StateElectionExtractionError(f"DUN name mismatch for {dun['id']}.")
            if dun["id"] in covered_duns:
                raise StateElectionExtractionError(f"DUN appears in more than one latest event: {dun['id']}.")
            covered_duns.add(dun["id"])
            contest_id = f"{configured_event['id']}:{dun['id']}"
            candidates = []
            for index, row in enumerate(candidate_rows, start=1):
                candidate_name = " ".join(str(row.get("NAMA KERTAS UNDI") or row.get("NAMA ATAS KERTAS UNDI") or "").split()).upper()
                full_name = " ".join(str(row.get("NAMA PENUH CALON") or candidate_name).split()).upper()
                status = normalise(row.get("STATUS") or row.get("StatusCalon"))
                candidates.append(
                    {
                        "id": f"{contest_id}:candidate-{index}",
                        "name": candidate_name,
                        "fullName": full_name,
                        "party": " ".join(str(row.get("NAMA PARTI BERTANDING") or "").split()).upper(),
                        "shortName": str(row.get("SINGKATAN NAMA PARTI BERTANDING") or "").strip().upper(),
                        "votes": integer(row.get("BILANGAN UNDI")),
                        "status": "winner" if status in WINNER_STATUSES else "lost-deposit" if status in {"HD", "HILANG DEPOSIT"} else "runner-up",
                    }
                )
            winners = [item for item in candidates if item["status"] == "winner"]
            if len(winners) != 1:
                raise StateElectionExtractionError(f"Expected one winner for {contest_id}, found {len(winners)}.")
            valid_votes = sum(item["votes"] for item in candidates)
            for item in candidates:
                item["share"] = item["votes"] / valid_votes if valid_votes else 0
            ranked = sorted(candidates, key=lambda item: item["votes"], reverse=True)
            majority = ranked[0]["votes"] - ranked[1]["votes"] if len(ranked) > 1 else ranked[0]["votes"]
            official_majority = source_value(candidate_rows, "MAJORITI", integer)
            if official_majority and official_majority != majority:
                data_issues.append(
                    {
                        "contestId": contest_id,
                        "field": "majorityVotes",
                        "sourceValue": official_majority,
                        "computedValue": majority,
                        "message": "Majoriti sumber bercanggah dengan beza dua calon teratas; nilai dikira digunakan.",
                    }
                )
            has_polling_totals = not candidate_rows[0]["_dataset"].startswith("mysemak-")
            registered = source_value(candidate_rows, "JumlahPemilih", integer) if has_polling_totals else None
            rejected = source_value(candidate_rows, "UNDI DITOLAK", integer) if has_polling_totals else None
            unreturned = source_value(candidate_rows, "UNDI TAK KEMBALI", integer) if has_polling_totals else None
            official_turnout_pct = source_value(candidate_rows, "PERATUS UNDI", percentage) if has_polling_totals else 0
            official_ballots_issued = source_value(candidate_rows, "_ballotsIssued", integer)
            turnout_votes = official_ballots_issued or (valid_votes + rejected if rejected is not None else None)
            event_contests.append(
                {
                    "id": contest_id,
                    "eventId": configured_event["id"],
                    "stateId": state["id"],
                    "dunId": dun["id"],
                    "parliamentCode": parliament_code,
                    "electionDate": candidate_rows[0]["_electionDate"],
                    "registeredVoters": registered,
                    "turnoutVotes": turnout_votes,
                    "turnoutPct": official_turnout_pct or (turnout_votes / registered if registered and turnout_votes is not None else None),
                    "validVotes": valid_votes,
                    "rejectedVotes": rejected,
                    "unreturnedVotes": unreturned,
                    "majorityVotes": majority,
                    "sourceMajorityVotes": official_majority,
                    "winnerCandidateId": winners[0]["id"],
                    "sourceDataset": candidate_rows[0]["_dataset"],
                    "candidates": candidates,
                }
            )
        seat_counts = Counter(
            next(candidate for candidate in item["candidates"] if candidate["id"] == item["winnerCandidateId"])["shortName"]
            for item in event_contests
        )
        registered_total = configured_event.get("registeredVoters") or sum(item["registeredVoters"] or 0 for item in event_contests)
        has_complete_turnout = all(item["turnoutVotes"] is not None and item["turnoutPct"] is not None for item in event_contests)
        turnout_total = sum(item["turnoutVotes"] or 0 for item in event_contests) if has_complete_turnout else None
        events.append(
            {
                "id": configured_event["id"],
                "type": "state",
                "stateId": state["id"],
                "name": f"PRN {state['name'].title()} ke-{configured_event['assemblyNumber']}",
                "year": configured_event["year"],
                "assemblyNumber": configured_event["assemblyNumber"],
                "electionDate": configured_event["electionDate"],
                "contestIds": [item["id"] for item in event_contests],
                "seatCounts": dict(seat_counts.most_common()),
                "registeredVoters": registered_total,
                "turnoutVotes": turnout_total,
                "turnoutPct": turnout_total / registered_total if registered_total and turnout_total is not None else None,
            }
        )
        contests.extend(event_contests)

    expected_duns = {item["id"] for item in constituencies["duns"]}
    if covered_duns != expected_duns:
        missing = sorted(expected_duns - covered_duns)
        extra = sorted(covered_duns - expected_duns)
        raise StateElectionExtractionError(f"Latest state elections do not cover all 600 DUNs; missing={missing}, extra={extra}.")
    if len(events) != 13 or len(contests) != 600:
        raise StateElectionExtractionError(f"Expected 13 events and 600 contests, got {len(events)} and {len(contests)}.")
    return {
        "version": 1,
        "metadata": {
            "title": "Keputusan pilihan raya negeri terkini",
            "retrievedAt": source_metadata["retrievedAt"],
            "sourceUrls": [item["url"] for item in tracked_sources if item.get("url") and item["id"] != "list-dppr"],
            "sourceCitations": list(dict.fromkeys(item["citation"] for item in tracked_sources if item.get("citation"))),
            "sourceSha256": {item["id"]: item["sha256"] for item in tracked_sources},
            "eventCount": len(events),
            "stateCount": len({item["stateId"] for item in events}),
            "contestCount": len(contests),
            "candidateCount": sum(len(item["candidates"]) for item in contests),
            "coverage": "latest-complete",
            "issues": data_issues,
        },
        "events": sorted(events, key=lambda item: (item["electionDate"], item["stateId"]), reverse=True),
        "contests": sorted(contests, key=lambda item: (item["stateId"], item["dunId"])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the latest official SPR state-election results.")
    parser.add_argument("--source-directory", type=Path, default=Path("sources/spr/state-elections"))
    parser.add_argument("--constituencies", type=Path, default=Path("public/data/constituencies.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/state-elections.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rendered = compact(build(args.source_directory, args.constituencies))
        if args.check:
            if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
                raise StateElectionExtractionError(f"{args.output} is stale. Run npm run data:state-elections.")
            print("SPR state-election results are current.")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
            value = json.loads(rendered)
            print(f"Wrote {len(value['events'])} state elections and {len(value['contests'])} DUN results to {args.output}.")
        return 0
    except (OSError, KeyError, TypeError, json.JSONDecodeError, StateElectionExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
