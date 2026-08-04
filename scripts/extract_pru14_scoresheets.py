#!/usr/bin/env python3
"""Extract PRU-14 polling-stream results from official SPR XLSX scoresheets."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

try:
    from .extract_scoresheets import (
        ScoresheetExtractionError,
        apply_authoritative_results,
        assign_candidates,
        serialise,
        sha256,
        slug,
        write_or_check,
    )
except ImportError:
    from extract_scoresheets import (  # type: ignore[no-redef]
        ScoresheetExtractionError,
        apply_authoritative_results,
        assign_candidates,
        serialise,
        sha256,
        slug,
        write_or_check,
    )


PRINT_DATE = "2018-05-09"
SPR_OPEN_DATA_URL = "https://opendata.spr.gov.my/"
SPR_RESULTS_URL = "https://mysprsemak.spr.gov.my/semakan/keputusan/pru"
SPR_ELECTORAL_ROLL_URL = "https://www.spr.gov.my/sites/default/files/HargaDPIST42017_PRU14.pdf"
XML_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CELL_REFERENCE = re.compile(r"([A-Z]+)(\d+)")
PARLIAMENT_CODE = re.compile(r"\bP\.?\s*(\d{1,3})\b", re.IGNORECASE)
DISTRICT_CODE = re.compile(r"\b\d{3}/\d{2}/\d{2}\b")
REGISTERED_VOTERS = re.compile(r"JUMLAH\s+PEMILIH\s*:\s*([\d,]+)", re.IGNORECASE)
KNOWN_SPR_AGGREGATE_CORRECTIONS = {
    "P.075": {
        "candidate": "AHMAD ZAHID BIN HAMIDI",
        "openDataVotes": 18_908,
        "scoresheetVotes": 18_909,
        "publishedMajority": 5_073,
        "reason": (
            "The SPR open-data candidate row says 18,908, but the official SPR workbook says "
            "18,909 and 18,909 - 13,836 equals SPR's published majority of 5,073."
        ),
    }
}


def column_number(reference: str) -> int:
    match = CELL_REFERENCE.fullmatch(reference)
    if not match:
        raise ScoresheetExtractionError(f"Invalid XLSX cell reference {reference!r}.")
    value = 0
    for character in match.group(1):
        value = value * 26 + ord(character) - 64
    return value


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def as_integer(value: Any) -> int | None:
    if value is None or value == "":
        return None
    text = clean_text(value).replace(",", "")
    if not re.fullmatch(r"-?\d+(?:\.0+)?", text):
        return None
    return int(float(text))


def workbook_rows(path: Path) -> list[dict[int, Any]]:
    """Read the first XLSX worksheet without mutating the supplied workbook."""
    namespace = {"m": XML_NAMESPACE}
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si", namespace):
                shared_strings.append(
                    "".join(node.text or "" for node in item.iter(f"{{{XML_NAMESPACE}}}t"))
                )
        worksheet_names = sorted(
            name
            for name in archive.namelist()
            if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)
        )
        if not worksheet_names:
            raise ScoresheetExtractionError("Workbook has no worksheet XML.")
        worksheet = ElementTree.fromstring(archive.read(worksheet_names[0]))

    rows: list[dict[int, Any]] = []
    for row_node in worksheet.findall(".//m:sheetData/m:row", namespace):
        row_number = int(row_node.attrib["r"])
        while len(rows) < row_number:
            rows.append({})
        row: dict[int, Any] = {}
        for cell in row_node.findall("m:c", namespace):
            reference = cell.attrib["r"]
            value_node = cell.find("m:v", namespace)
            inline_node = cell.find("m:is", namespace)
            value: Any = None
            if value_node is not None:
                value = value_node.text or ""
                if cell.attrib.get("t") == "s":
                    value = shared_strings[int(value)]
            elif inline_node is not None:
                value = "".join(
                    node.text or "" for node in inline_node.iter(f"{{{XML_NAMESPACE}}}t")
                )
            row[column_number(reference)] = value
        rows[row_number - 1] = row
    return rows


def source_identity(path: Path, rows: list[dict[int, Any]]) -> tuple[str, int]:
    heading = " ".join(
        clean_text(value)
        for row in rows[: min(6, len(rows))]
        for value in row.values()
    )
    code_match = PARLIAMENT_CODE.search(heading) or PARLIAMENT_CODE.search(path.stem)
    registered_match = REGISTERED_VOTERS.search(heading)
    if not code_match:
        raise ScoresheetExtractionError("Parliament code is absent from the heading and filename.")
    if not registered_match:
        raise ScoresheetExtractionError("Registered-voter total is absent from the heading.")
    return f"P.{int(code_match.group(1)):03d}", int(registered_match.group(1).replace(",", ""))


def table_layout(rows: list[dict[int, Any]]) -> tuple[int, int, int, list[str], int]:
    total_rows = [
        index
        for index, row in enumerate(rows)
        if any(clean_text(value).upper() == "JUMLAH" for value in row.values())
    ]
    if not total_rows:
        raise ScoresheetExtractionError("Workbook has no final JUMLAH row.")
    total_row = total_rows[-1]
    header_row = next(
        (
            row
            for row in rows[: min(total_row, 12)]
            if any("JUMLAH UNDIAN OLEH PEMILIH" in clean_text(value).upper() for value in row.values())
        ),
        None,
    )
    if header_row is None:
        raise ScoresheetExtractionError("Candidate header row is absent.")
    base_column = next(
        (
            column
            for row in rows[: min(total_row, 12)]
            for column, value in row.items()
            if clean_text(value).upper() == "BIL"
        ),
        None,
    )
    if base_column is None:
        raise ScoresheetExtractionError("Table's Bil column is absent.")
    valid_column = next(
        column
        for column, value in header_row.items()
        if "JUMLAH UNDIAN OLEH PEMILIH" in clean_text(value).upper()
    )
    candidate_columns = list(range(base_column + 5, valid_column))
    headers = [clean_text(header_row.get(column)) for column in candidate_columns]
    if len(headers) < 2 or any(not header for header in headers):
        raise ScoresheetExtractionError(f"Invalid candidate headers {headers!r}.")
    return total_row, base_column, valid_column, headers, len(candidate_columns)


def source_totals(
    rows: list[dict[int, Any]], total_row: int, base_column: int, valid_column: int, candidate_count: int
) -> tuple[int | None, int, list[int], int, int, int]:
    row = rows[total_row]
    values = [as_integer(row.get(column)) for column in range(base_column + 3, valid_column + 3)]
    if any(value is None for value in values[1:]):
        raise ScoresheetExtractionError(f"Final JUMLAH row is incomplete: {values!r}.")
    streams = int(values[0]) if values[0] is not None else None
    ballots = int(values[1])
    candidate_votes = [int(value) for value in values[2 : 2 + candidate_count]]
    valid, rejected, unreturned = [int(value) for value in values[2 + candidate_count :]]
    if sum(candidate_votes) != valid:
        raise ScoresheetExtractionError("Candidate totals do not equal final valid-vote total.")
    if ballots != valid + rejected + unreturned:
        raise ScoresheetExtractionError("Final A total does not equal B + C + D.")
    return streams, ballots, candidate_votes, valid, rejected, unreturned


def is_data_row(row: dict[int, Any], base_column: int, valid_column: int, candidate_count: int) -> bool:
    expected = [
        as_integer(row.get(column))
        for column in range(base_column + 3, valid_column + 3)
    ]
    stream, ballots = expected[:2]
    if stream is None or ballots is None:
        return False
    votes = [value or 0 for value in expected[2 : 2 + candidate_count]]
    valid, rejected, unreturned = [value or 0 for value in expected[2 + candidate_count :]]
    return bool(
        stream
        and sum(votes) == valid
        and ballots == valid + rejected + unreturned
    )


def district_name(value: Any) -> str:
    text = clean_text(value)
    if text.upper() in {"UNDI POS", "UNDI AWAL", "UNDI BIASA"}:
        return text.upper()
    return text


def extract_rows(
    rows: list[dict[int, Any]],
    total_row: int,
    base_column: int,
    valid_column: int,
    candidate_columns: list[dict[str, Any]],
    seat_code: str,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    candidate_count = len(candidate_columns)
    extracted: list[dict[str, Any]] = []
    districts: dict[str, dict[str, Any]] = {}
    centres: dict[str, dict[str, Any]] = {}
    current_code: str | None = None
    current_name = ""
    pending_name = ""
    pending_context: list[dict[str, Any]] = []

    def attach_context(record: dict[str, Any], code: str, name: str) -> None:
        district_id = f"{seat_code}:{code}"
        section = record["section"]
        existing = districts.get(district_id)
        canonical_name = name or ("UNDI AWAL" if section == "early" else code)
        if existing and existing["section"] != section:
            raise ScoresheetExtractionError(f"{district_id} spans conflicting vote sections.")
        if not existing:
            districts[district_id] = {
                "id": district_id,
                "code": code,
                "name": canonical_name,
                "parliamentCode": seat_code,
                "section": section,
                "pollingCentreIds": [],
            }
        centre_name = record.pop("_centre") or canonical_name
        centre_id = f"{district_id}:{slug(centre_name)}"
        if centre_id not in centres:
            centres[centre_id] = {
                "id": centre_id,
                "name": centre_name,
                "parliamentCode": seat_code,
                "pollingDistrictId": district_id,
                "streamCount": 0,
            }
            districts[district_id]["pollingCentreIds"].append(centre_id)
        centres[centre_id]["streamCount"] += 1
        record["pollingDistrictId"] = district_id
        record["pollingCentreId"] = centre_id

    for row_index, row in enumerate(rows[:total_row], start=1):
        value_b = clean_text(row.get(base_column + 1))
        value_c = clean_text(row.get(base_column + 2))
        code_match = DISTRICT_CODE.search(value_b)
        data_row = is_data_row(row, base_column, valid_column, candidate_count)

        if code_match:
            current_code = code_match.group(0)
            current_name = pending_name or ("UNDI AWAL" if current_code.endswith("/00") else current_code)
            if pending_context:
                for record in pending_context:
                    attach_context(record, current_code, current_name)
                pending_context.clear()

        if not data_row:
            sequence = as_integer(row.get(base_column))
            if sequence is not None and value_b and not code_match:
                pending_name = district_name(value_b)
                current_code = None
                current_name = pending_name
            continue

        sequence_label = as_integer(row.get(base_column))
        if sequence_label is not None and value_b and not code_match:
            pending_name = district_name(value_b)
            current_code = None
            current_name = pending_name

        numeric = [
            int(as_integer(row.get(column)) or 0)
            for column in range(base_column + 3, valid_column + 3)
        ]
        stream, ballots = numeric[:2]
        votes = numeric[2 : 2 + candidate_count]
        valid, rejected, unreturned = numeric[2 + candidate_count :]
        upper_context = f"{value_b} {value_c} {pending_name}".upper()
        if "UNDI POS" in upper_context:
            section = "postal"
        elif "UNDI AWAL" in upper_context or (current_code and current_code.endswith("/00")):
            section = "early"
        else:
            section = "ordinary"
        vote_map = {
            candidate_columns[index]["candidateId"]: votes[index]
            for index in range(candidate_count)
        }
        record: dict[str, Any] = {
            "id": "",
            "section": section,
            "sequence": len(extracted) + 1,
            "pollingDistrictId": None,
            "pollingCentreId": None,
            "streamNumber": None if section == "postal" else stream,
            "ballotsInBox": ballots,
            "candidateVotes": vote_map,
            "validVotes": valid,
            "rejectedVotes": rejected,
            "unreturnedVotes": unreturned,
            "_centre": value_c,
            "_sourceRow": row_index,
        }
        extracted.append(record)
        if section == "postal":
            record.pop("_centre")
            record["id"] = f"{seat_code}:postal:{record['sequence']}"
        elif current_code:
            attach_context(record, current_code, current_name)
        elif section != "postal":
            pending_context.append(record)
        else:
            raise ScoresheetExtractionError(
                f"Worksheet row {row_index} has ordinary votes without a district code."
            )

    if pending_context:
        source_rows = [record["_sourceRow"] for record in pending_context]
        raise ScoresheetExtractionError(f"Vote rows have no following district code: {source_rows}.")
    for record in extracted:
        source_row = record.pop("_sourceRow")
        if record["section"] != "postal":
            record["id"] = f"{record['pollingDistrictId']}:{record['streamNumber']}:{source_row}"
        if "_centre" in record:
            raise ScoresheetExtractionError(f"Worksheet row {source_row} has no attached centre.")
    return extracted, districts, centres


def extract_workbook(
    path: Path, seat: dict[str, Any], source_root: Path
) -> dict[str, Any]:
    rows = workbook_rows(path)
    code, registered = source_identity(path, rows)
    if code != seat["code"]:
        raise ScoresheetExtractionError(f"Workbook is {code}, expected {seat['code']}.")
    if registered != seat["registered"]:
        raise ScoresheetExtractionError(
            f"Registered voters {registered:,} do not match SPR aggregate {seat['registered']:,}."
        )
    total_row, base_column, valid_column, headers, candidate_count = table_layout(rows)
    streams, ballots, source_votes, valid, rejected, unreturned = source_totals(
        rows, total_row, base_column, valid_column, candidate_count
    )
    if candidate_count != len(seat["candidates"]):
        raise ScoresheetExtractionError(
            f"Workbook has {candidate_count} candidates; SPR aggregate has {len(seat['candidates'])}."
        )
    mapped_candidates = assign_candidates(headers, source_votes, seat["candidates"], code)
    official_votes = {candidate["id"]: candidate["votes"] for candidate in seat["candidates"]}
    workbook_votes = {
        mapped_candidates[index]["candidateId"]: source_votes[index]
        for index in range(candidate_count)
    }
    known_correction = KNOWN_SPR_AGGREGATE_CORRECTIONS.get(code)
    correction_matches = False
    if known_correction:
        corrected_official = dict(official_votes)
        corrected_candidate = next(
            candidate
            for candidate in mapped_candidates
            if candidate["candidateName"] == known_correction["candidate"]
        )
        corrected_official[corrected_candidate["candidateId"]] = known_correction["scoresheetVotes"]
        correction_matches = workbook_votes == corrected_official
    if workbook_votes != official_votes and not correction_matches:
        raise ScoresheetExtractionError(
            "Final candidate totals do not match the official SPR aggregate result."
        )
    official_valid = sum(workbook_votes.values()) if correction_matches else sum(official_votes.values())
    if valid != official_valid:
        raise ScoresheetExtractionError(
            f"Final valid votes {valid:,} do not match SPR aggregate {official_valid:,}."
        )
    extracted_rows, districts, centres = extract_rows(
        rows, total_row, base_column, valid_column, mapped_candidates, code
    )
    row_totals = {
        "pollingStreams": len(extracted_rows),
        "ballotsInBox": sum(row["ballotsInBox"] for row in extracted_rows),
        "validVotes": sum(row["validVotes"] for row in extracted_rows),
        "rejectedVotes": sum(row["rejectedVotes"] for row in extracted_rows),
        "unreturnedVotes": sum(row["unreturnedVotes"] for row in extracted_rows),
    }
    source_accounting = {
        "pollingStreams": streams if streams is not None else len(extracted_rows),
        "ballotsInBox": ballots,
        "validVotes": valid,
        "rejectedVotes": rejected,
        "unreturnedVotes": unreturned,
    }
    if row_totals != source_accounting:
        raise ScoresheetExtractionError(
            f"Stream totals {row_totals!r} do not match final JUMLAH {source_accounting!r}."
        )
    candidate_totals = {
        candidate["candidateId"]: sum(
            row["candidateVotes"][candidate["candidateId"]] for row in extracted_rows
        )
        for candidate in mapped_candidates
    }
    expected_candidate_totals = {
        mapped_candidates[index]["candidateId"]: source_votes[index]
        for index in range(candidate_count)
    }
    if candidate_totals != expected_candidate_totals:
        raise ScoresheetExtractionError("Stream candidate totals do not match final JUMLAH.")
    source_file = path.relative_to(source_root).as_posix()
    result = {
        "version": 1,
        "metadata": {
            "title": f"Helaian mata SPR PRU-14 {code}",
            "sourceType": "spr-scoresheet-xlsx",
            "sourceFile": source_file,
            "sourceSha256": sha256(path),
            "sourcePages": 0,
            "sourceUrl": SPR_RESULTS_URL,
            "sourceStatsUrl": SPR_OPEN_DATA_URL,
            "printDate": PRINT_DATE,
        },
        "parliamentCode": code,
        "registeredVoters": registered,
        "candidateColumns": mapped_candidates,
        "rows": extracted_rows,
        "totals": {**row_totals, "candidateVotes": candidate_totals},
    }
    return {
        "result": result,
        "districts": districts,
        "centres": centres,
        "bytes": path.stat().st_size,
    }


def build_artifacts(
    source_root: Path, election_path: Path
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, dict[str, Any]], dict[str, Any]]:
    election = json.loads(election_path.read_text(encoding="utf-8"))
    seats = {seat["code"]: seat for seat in election["seats"]}
    candidates = sorted(source_root.rglob("*.xlsx"))
    files = [
        path
        for path in candidates
        if path.parent == source_root
        or any(
            part.upper() in {"PARLIMEN", "W.PERSEKUTUAN", "PUTRAJAYA"}
            for part in path.relative_to(source_root).parts[:-1]
        )
    ]
    if not files:
        raise ScoresheetExtractionError(f"No XLSX scoresheets found under {source_root}.")

    extracted: dict[str, dict[str, Any]] = {}
    all_districts: dict[str, dict[str, Any]] = {}
    all_centres: dict[str, dict[str, Any]] = {}
    source_files: list[dict[str, Any]] = []
    rejected_sources: list[dict[str, Any]] = []
    for path in files:
        filename_code = PARLIAMENT_CODE.search(path.stem)
        if not filename_code:
            raise ScoresheetExtractionError(f"Parliament code is absent from filename {path}.")
        code = f"P.{int(filename_code.group(1)):03d}"
        if code not in seats:
            raise ScoresheetExtractionError(f"Unknown parliamentary constituency {code} in {path}.")
        if code in extracted:
            raise ScoresheetExtractionError(f"Duplicate scoresheet for {code}.")
        try:
            item = extract_workbook(path, seats[code], source_root)
        except ScoresheetExtractionError as exc:
            rejected = {
                "path": path.relative_to(source_root).as_posix(),
                "parliamentCode": code,
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
                "sheets": 1,
                "status": "rejected",
                "reason": str(exc),
            }
            source_files.append(rejected)
            rejected_sources.append(rejected)
            continue
        extracted[code] = item
        for district_id, district in item["districts"].items():
            if district_id in all_districts:
                raise ScoresheetExtractionError(f"Duplicate polling district {district_id}.")
            all_districts[district_id] = district
        for centre_id, centre in item["centres"].items():
            if centre_id in all_centres:
                raise ScoresheetExtractionError(f"Duplicate polling centre {centre_id}.")
            all_centres[centre_id] = centre
        result = item["result"]
        source_files.append(
            {
                "path": result["metadata"]["sourceFile"],
                "parliamentCode": code,
                "sha256": result["metadata"]["sourceSha256"],
                "bytes": item["bytes"],
                "sheets": 1,
                "status": "published",
            }
        )

    apply_authoritative_results(election, extracted)
    entries = []
    for code in sorted(extracted, key=lambda value: int(value.split(".")[1])):
        seat = seats[code]
        result = extracted[code]["result"]
        entries.append(
            {
                "parliamentCode": code,
                "parliamentName": seat["name"],
                "state": seat["state"],
                "sourceFile": result["metadata"]["sourceFile"],
                "sourceSha256": result["metadata"]["sourceSha256"],
                "sourceType": "spr-scoresheet-xlsx",
                "sourceUrl": SPR_RESULTS_URL,
                "pollingPlacesFile": f"scoresheets/places/{code}.json",
                "pages": 0,
                "rowCount": len(result["rows"]),
                "pollingDistrictCount": sum(
                    district["parliamentCode"] == code for district in all_districts.values()
                ),
                "pollingCentreCount": sum(
                    centre["parliamentCode"] == code for centre in all_centres.values()
                ),
                "status": "authoritative",
            }
        )
    totals = {
        field: sum(item["result"]["totals"][field] for item in extracted.values())
        for field in ("ballotsInBox", "validVotes", "rejectedVotes", "unreturnedVotes")
    }
    rejected_by_code = {item["parliamentCode"]: item for item in rejected_sources}
    unavailable_seats = []
    for code in sorted(set(seats) - set(extracted), key=lambda value: int(value.split(".")[1])):
        seat = seats[code]
        rejected = rejected_by_code.get(code)
        unavailable_seats.append(
            {
                "parliamentCode": code,
                "parliamentName": seat["name"],
                "state": seat["state"],
                "category": "rejected-source" if rejected else "missing-source",
                "reason": rejected["reason"] if rejected else "Tiada workbook Parlimen dalam arkib sumber yang dibekalkan.",
            }
        )
    index = {
        "version": 1,
        "metadata": {
            "title": "Liputan helaian mata SPR PRU-14",
            "electionDate": election["metadata"]["electionDate"],
            "printDate": PRINT_DATE,
            "sourceCount": len(files),
            "officialScoresheetCount": len(extracted),
            "rejectedSourceCount": len(rejected_sources),
            "missingSourceCount": len(seats) - len(files),
            "supplementaryDatasetCount": 0,
            "authoritativeSeats": len(extracted),
            "supplementarySeats": 0,
            "coveredSeats": len(extracted),
            "totalSeats": len(seats),
            "coveragePct": round(len(extracted) / len(seats), 6),
            "totalPages": 0,
            "totalRows": sum(len(item["result"]["rows"]) for item in extracted.values()),
            "pollingDistrictCount": len(all_districts),
            "printedPollingDistrictCount": len(all_districts),
            "syntheticPollingDistrictCount": 0,
            "pollingCentreCount": len(all_centres),
            **totals,
        },
        "seats": entries,
        "unavailableSeats": unavailable_seats,
    }
    polling_places = {
        "version": 1,
        "metadata": {"sourceCount": len(files), "coveredSeats": len(extracted)},
        "pollingDistricts": sorted(all_districts.values(), key=lambda item: item["id"]),
        "pollingCentres": sorted(all_centres.values(), key=lambda item: item["id"]),
    }
    manifest = {
        "version": 1,
        "algorithm": "sha256",
        "sourceRoot": "sources/pru14/scoresheets",
        "provenance": {
            "publisher": "Suruhanjaya Pilihan Raya Malaysia",
            "workbookFooter": "© SPR 2018 Versi 1.1.0 - Suruhanjaya Pilihan Raya Malaysia",
            "officialResultsUrl": SPR_RESULTS_URL,
            "officialOpenDataUrl": SPR_OPEN_DATA_URL,
            "officialElectoralRollUrl": SPR_ELECTORAL_ROLL_URL,
            "coverageNote": "The supplied archive has no parliamentary scoresheets for Sarawak or W.P. Labuan.",
        },
        "resolvedConflicts": [
            {"parliamentCode": code, **details}
            for code, details in KNOWN_SPR_AGGREGATE_CORRECTIONS.items()
        ],
        "files": source_files,
        "rejectedSources": rejected_sources,
    }
    results = {code: item["result"] for code, item in extracted.items()}
    return manifest, index, polling_places, results, election


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PRU-14 SPR XLSX scoresheets.")
    parser.add_argument("--source-root", type=Path, default=Path("sources/pru14/scoresheets"))
    parser.add_argument("--election", type=Path, default=Path("public/data/elections/pru-14/election.json"))
    parser.add_argument("--output-directory", type=Path, default=Path("public/data/elections/pru-14/scoresheets"))
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def polling_place_shards(
    polling_places: dict[str, Any], results: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    return {
        code: {
            "version": 1,
            "metadata": {"sourceCount": 1, "coveredSeats": 1},
            "pollingDistricts": [
                item
                for item in polling_places["pollingDistricts"]
                if item["parliamentCode"] == code
            ],
            "pollingCentres": [
                item
                for item in polling_places["pollingCentres"]
                if item["parliamentCode"] == code
            ],
        }
        for code in results
    }


def main() -> int:
    args = parse_args()
    try:
        manifest, index, places, results, election = build_artifacts(args.source_root, args.election)
        outputs = [
            (args.election, serialise(election)),
            (args.source_root / "manifest.json", serialise(manifest)),
            (args.output_directory / "index.json", serialise(index)),
        ]
        outputs.extend(
            (args.output_directory / f"{code}.json", serialise(result, compact=True))
            for code, result in results.items()
        )
        outputs.extend(
            (args.output_directory / "places" / f"{code}.json", serialise(value, compact=True))
            for code, value in polling_place_shards(places, results).items()
        )
        for path, content in outputs:
            write_or_check(path, content, args.check)
        if not args.check:
            expected = {f"{code}.json" for code in results} | {"index.json"}
            for stale in args.output_directory.glob("*.json"):
                if stale.name not in expected:
                    stale.unlink()
            places_directory = args.output_directory / "places"
            expected_places = {f"{code}.json" for code in results}
            for stale in places_directory.glob("*.json"):
                if stale.name not in expected_places:
                    stale.unlink()
        action = "Validated" if args.check else "Wrote"
        print(
            f"{action} {len(results)} official PRU-14 scoresheets, "
            f"{index['metadata']['totalRows']} polling streams and "
            f"{index['metadata']['pollingDistrictCount']} polling districts."
        )
        return 0
    except (OSError, zipfile.BadZipFile, json.JSONDecodeError, ScoresheetExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
