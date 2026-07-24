#!/usr/bin/env python3
"""Extract governed polling-stream results from PRU-15 SPR 760 scoresheets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Any

import pdfplumber
from pypdf import PdfReader


class ScoresheetExtractionError(ValueError):
    pass


PRINT_DATE = "2022-11-19"
DISTRICT_CODE = re.compile(r"\b\d{3}/\d{2}/\d{2}\b")


def serialise(value: Any, compact: bool = False) -> str:
    if compact:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def candidate_id(seat_code: str, name: str) -> str:
    return f"{seat_code.lower().replace('.', '')}:{slug(name)}"


def normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower())


def collapse_overlay_text(value: str | None) -> str:
    if not value:
        return ""
    lines = [re.sub(r"\s+", " ", line).strip() for line in value.splitlines() if line.strip()]
    changed = True
    while changed and len(lines) % 2 == 0 and lines:
        half = len(lines) // 2
        changed = lines[:half] == lines[half:]
        if changed:
            lines = lines[:half]
    deduped: list[str] = []
    for line in lines:
        if not deduped or line != deduped[-1]:
            deduped.append(line)
    words = []
    for word in " ".join(deduped).split():
        if len(word) % 2 == 0 and all(word[index] == word[index + 1] for index in range(0, len(word), 2)):
            word = word[::2]
        words.append(word)
    return " ".join(words)


def first_number(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d[\d,]*", value)
    if not match:
        return None
    return int(match.group(0).replace(",", ""))


def numeric_groups_balance(values: list[int], width: int, candidate_count: int, postal: bool) -> bool:
    if not values or len(values) % width:
        return False
    for offset in range(0, len(values), width):
        group = values[offset : offset + width]
        if postal:
            ballots = group[0]
            votes = group[1 : 1 + candidate_count]
            valid, rejected, unreturned = group[1 + candidate_count :]
        else:
            ballots = group[1]
            votes = group[2 : 2 + candidate_count]
            valid, rejected, unreturned = group[2 + candidate_count :]
        if sum(votes) != valid or ballots != valid + rejected + unreturned:
            return False
    return True


def source_totals(reader: PdfReader, candidate_count: int) -> tuple[int, int, list[int], int, int, int]:
    lines = [line.strip() for line in (reader.pages[-1].extract_text() or "").splitlines()]
    starts = [index for index, line in enumerate(lines) if line == "JUMLAH"]
    if not starts:
        raise ScoresheetExtractionError("Final page has no JUMLAH row.")
    values: list[int] = []
    for line in lines[starts[-1] + 1 :]:
        if line.startswith("PILIHAN RAYA"):
            break
        if re.fullmatch(r"[0-9][0-9,]*", line):
            values.append(int(line.replace(",", "")))
    if len(values) != candidate_count + 5:
        raise ScoresheetExtractionError(
            f"Final total width is {len(values)}; expected {candidate_count + 5}."
        )
    streams, ballots = values[:2]
    votes = values[2 : 2 + candidate_count]
    valid, rejected, unreturned = values[2 + candidate_count :]
    return streams, ballots, votes, valid, rejected, unreturned


def candidate_headers(table: list[list[str | None]], candidate_count: int) -> list[str]:
    candidates = []
    for row in table[:10]:
        cells = [collapse_overlay_text(cell) for cell in row[5 : 5 + candidate_count]]
        score = sum(bool(cell) and not cell.lower().startswith("jumlah") for cell in cells)
        candidates.append((score, cells))
    score, headers = max(candidates, key=lambda item: item[0])
    if score != candidate_count:
        raise ScoresheetExtractionError(f"Found {score} candidate headers; expected {candidate_count}.")
    return headers


def assign_candidates(
    headers: list[str], source_votes: list[int], project_candidates: list[dict[str, Any]], seat_code: str
) -> list[dict[str, Any]]:
    count = len(headers)
    project = [
        {**candidate, "id": candidate.get("id") or candidate_id(seat_code, candidate["name"])}
        for candidate in project_candidates
    ]

    def score(column: int, candidate_index: int) -> int:
        candidate = project[candidate_index]
        similarity = SequenceMatcher(
            None, normalise_name(headers[column]), normalise_name(candidate["name"])
        ).ratio()
        exact_bonus = 1_000_000 if source_votes[column] == candidate["votes"] else 0
        return exact_bonus + round(similarity * 100_000) - min(abs(source_votes[column] - candidate["votes"]), 50_000)

    @lru_cache(maxsize=None)
    def solve(column: int, used: int) -> tuple[int, tuple[int, ...]]:
        if column == count:
            return 0, ()
        best: tuple[int, tuple[int, ...]] | None = None
        for candidate_index in range(count):
            if used & (1 << candidate_index):
                continue
            tail_score, tail = solve(column + 1, used | (1 << candidate_index))
            option = (score(column, candidate_index) + tail_score, (candidate_index, *tail))
            if best is None or option[0] > best[0]:
                best = option
        if best is None:
            raise ScoresheetExtractionError("Candidate assignment failed.")
        return best

    _, assignment = solve(0, 0)
    columns = []
    for column, project_index in enumerate(assignment):
        candidate = project[project_index]
        similarity = SequenceMatcher(
            None, normalise_name(headers[column]), normalise_name(candidate["name"])
        ).ratio()
        if source_votes[column] != candidate["votes"] and similarity < 0.35:
            raise ScoresheetExtractionError(
                f"Cannot confidently map source column {headers[column]!r} to {candidate['name']!r}."
            )
        columns.append(
            {
                "candidateId": candidate["id"],
                "candidateName": candidate["name"],
                "column": column + 1,
                "scoresheetVotes": source_votes[column],
            }
        )
    return columns


def extract_rows(
    reader: PdfReader,
    seat_code: str,
    candidate_columns: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    count = len(candidate_columns)
    rows: list[dict[str, Any]] = []
    districts: dict[str, dict[str, Any]] = {}
    centres: dict[str, dict[str, Any]] = {}
    section = "postal"
    current_district_id: str | None = None
    current_centre_id: str | None = None
    seen_rows: set[tuple[Any, ...]] = set()

    for page_number, page in enumerate(reader.pages, start=1):
        page_lines = [line.strip() for line in (page.extract_text() or "").splitlines() if line.strip()]
        header_ends = [
            index
            for index, line in enumerate(page_lines)
            if "pemilih" in line.lower()
            and "jumlah undian" in " ".join(page_lines[max(0, index - 4) : index + 1]).lower()
        ]
        if not header_ends:
            raise ScoresheetExtractionError(f"Page {page_number} has no recognisable table header.")
        content = page_lines[header_ends[-1] + 1 :]
        footer = next((index for index, line in enumerate(content) if line.startswith("PILIHAN RAYA UMUM")), len(content))
        content = content[:footer]
        context: list[str] = []
        index = 0
        while index < len(content):
            if not re.fullmatch(r"[0-9][0-9,]*", content[index]):
                context.append(content[index])
                index += 1
                continue
            end = index
            while end < len(content) and re.fullmatch(r"[0-9][0-9,]*", content[end]):
                end += 1
            numeric_run = [int(line.replace(",", "")) for line in content[index:end]]
            upper_context = " ".join(context).upper()
            postal = "UNDI POS" in upper_context
            width = count + (4 if postal else 5)
            if len(numeric_run) < width:
                context.extend(content[index:end])
                index = end
                continue
            if "JUMLAH" in upper_context:
                context = []
                index = end
                continue
            trailing_context: list[str] = []
            forced_district_code: str | None = None
            forced_district_name = ""
            if len(numeric_run) % width == 2:
                middle = numeric_run[1:-1]
                without_two_trailing = numeric_run[:-2]
                without_two_leading = numeric_run[2:]
                if numeric_groups_balance(middle, width, count, postal):
                    numeric_run = middle
                    trailing_context = [content[end - 1]]
                elif numeric_groups_balance(without_two_trailing, width, count, postal):
                    numeric_run = without_two_trailing
                    if numeric_run and numeric_run[-1] < 1_000:
                        trailing_context = [content[end - 2]]
                elif numeric_groups_balance(without_two_leading, width, count, postal):
                    numeric_run = without_two_leading
                if len(numeric_run) % width == 0 and not any(DISTRICT_CODE.search(line) for line in context):
                    future_code_index = next(
                        (position for position in range(end, len(content)) if DISTRICT_CODE.search(content[position])),
                        None,
                    )
                    if future_code_index is not None:
                        forced_district_code = DISTRICT_CODE.search(content[future_code_index]).group(0)  # type: ignore[union-attr]
                        name_lines = []
                        cursor = future_code_index - 1
                        while cursor >= end and not re.fullmatch(r"[0-9][0-9,]*", content[cursor]):
                            name_lines.append(content[cursor])
                            cursor -= 1
                        forced_district_name = " ".join(reversed(name_lines)).strip()
            elif len(numeric_run) % width == 1:
                without_trailing = numeric_run[:-1]
                without_leading = numeric_run[1:]
                trailing_balances = numeric_groups_balance(without_trailing, width, count, postal)
                leading_balances = numeric_groups_balance(without_leading, width, count, postal)
                if trailing_balances:
                    trailing_context = [content[end - 1]]
                    numeric_run = without_trailing
                elif leading_balances:
                    numeric_run = without_leading
                    future_code_index = next(
                        (position for position in range(end, len(content)) if DISTRICT_CODE.search(content[position])),
                        None,
                    )
                    if future_code_index is not None:
                        forced_district_code = DISTRICT_CODE.search(content[future_code_index]).group(0)  # type: ignore[union-attr]
                        name_lines: list[str] = []
                        cursor = future_code_index - 1
                        while cursor >= end and not re.fullmatch(r"[0-9][0-9,]*", content[cursor]):
                            name_lines.append(content[cursor])
                            cursor -= 1
                        forced_district_name = " ".join(reversed(name_lines)).strip()
                else:
                    trailing_context = [content[end - 1]]
                    numeric_run = without_trailing
            if len(numeric_run) % width:
                raise ScoresheetExtractionError(
                    f"Page {page_number} has a numeric run of {len(numeric_run)} values; expected groups of {width}."
                )

            if "UNDI AWAL" in upper_context:
                section = "early"
            if "UNDI BIASA" in upper_context:
                section = "ordinary"
            if postal:
                section = "postal"
                current_district_id = None
                current_centre_id = None
            else:
                code_indexes = [position for position, line in enumerate(context) if DISTRICT_CODE.search(line)]
                if code_indexes or forced_district_code:
                    code_index = code_indexes[-1] if code_indexes else -1
                    district_code = forced_district_code or DISTRICT_CODE.search(context[code_index]).group(0)  # type: ignore[union-attr]
                    before_code = context[:code_index] if code_indexes else []
                    district_lines = [
                        line for line in before_code
                        if not re.fullmatch(r"\d+", line)
                        and line.upper() not in {"UNDI AWAL", "UNDI BIASA"}
                    ]
                    district_name = forced_district_name or " ".join(district_lines).strip() or (
                        "UNDI AWAL" if section == "early" else district_code
                    )
                    current_district_id = f"{seat_code}:{district_code}"
                    existing = districts.get(current_district_id)
                    if existing and existing["name"] != district_name and existing["name"] != district_code:
                        raise ScoresheetExtractionError(
                            f"{current_district_id} has conflicting names {existing['name']!r} and {district_name!r}."
                        )
                    districts[current_district_id] = {
                        "id": current_district_id,
                        "code": district_code,
                        "name": district_name,
                        "parliamentCode": seat_code,
                        "section": section,
                        "pollingCentreIds": existing["pollingCentreIds"] if existing else [],
                    }
                    centre_lines = context[code_index + 1 :] if code_indexes else context
                    centre_name = " ".join(line for line in centre_lines if not re.fullmatch(r"\d+", line)).strip()
                    if centre_name:
                        current_centre_id = f"{current_district_id}:{slug(centre_name)}"
                        if current_centre_id not in centres:
                            centres[current_centre_id] = {
                                "id": current_centre_id,
                                "name": centre_name,
                                "parliamentCode": seat_code,
                                "pollingDistrictId": current_district_id,
                                "streamCount": 0,
                            }
                            districts[current_district_id]["pollingCentreIds"].append(current_centre_id)
                elif section == "early" and current_district_id is None:
                    centre_name = " ".join(
                        line for line in context
                        if not re.fullmatch(r"\d+", line)
                        and line.upper() not in {"UNDI AWAL", "UNDI BIASA"}
                    ).strip()
                    centre_name = centre_name or "PUSAT UNDI AWAL TANPA LABEL"
                    synthetic_code = "EARLY-01"
                    current_district_id = f"{seat_code}:{synthetic_code}"
                    districts[current_district_id] = {
                        "id": current_district_id,
                        "code": synthetic_code,
                        "name": "UNDI AWAL TANPA KOD",
                        "parliamentCode": seat_code,
                        "section": section,
                        "pollingCentreIds": [],
                    }
                    current_centre_id = f"{current_district_id}:{slug(centre_name)}"
                    centres[current_centre_id] = {
                        "id": current_centre_id,
                        "name": centre_name,
                        "parliamentCode": seat_code,
                        "pollingDistrictId": current_district_id,
                        "streamCount": 0,
                    }
                    districts[current_district_id]["pollingCentreIds"].append(current_centre_id)

            for offset in range(0, len(numeric_run), width):
                numeric = numeric_run[offset : offset + width]
                if postal:
                    stream = None
                    ballots = numeric[0]
                    candidate_votes = numeric[1 : 1 + count]
                    valid, rejected, unreturned = numeric[1 + count :]
                else:
                    stream = numeric[0]
                    ballots = numeric[1]
                    candidate_votes = numeric[2 : 2 + count]
                    valid, rejected, unreturned = numeric[2 + count :]
                if sum(value or 0 for value in candidate_votes) != valid:
                    raise ScoresheetExtractionError(
                        f"Page {page_number} row {len(rows) + 1}: candidate votes do not equal valid votes "
                        f"({numeric!r}; context={context!r})."
                    )
                if ballots != valid + rejected + unreturned:
                    raise ScoresheetExtractionError(
                        f"Page {page_number} row {len(rows) + 1}: A does not equal B + C + D."
                    )

                sequence = len(rows) + 1
                if section != "postal" and (current_district_id is None or current_centre_id is None):
                    raise ScoresheetExtractionError(
                        f"Page {page_number} row {sequence} has no polling district or centre context."
                    )
                row_signature = (
                    section,
                    current_district_id,
                    current_centre_id,
                    stream,
                    ballots,
                    *candidate_votes,
                    valid,
                    rejected,
                    unreturned,
                )
                if row_signature in seen_rows:
                    continue
                seen_rows.add(row_signature)
                if current_centre_id:
                    centres[current_centre_id]["streamCount"] += 1
                vote_map = {
                    candidate_columns[candidate_index]["candidateId"]: int(value or 0)
                    for candidate_index, value in enumerate(candidate_votes)
                }
                row_key = current_district_id or f"{seat_code}:postal"
                rows.append(
                    {
                        "id": f"{row_key}:{stream or sequence}",
                        "section": section,
                        "sequence": sequence,
                        "pollingDistrictId": current_district_id,
                        "pollingCentreId": current_centre_id,
                        "streamNumber": stream,
                        "ballotsInBox": ballots,
                        "candidateVotes": vote_map,
                        "validVotes": valid,
                        "rejectedVotes": rejected,
                        "unreturnedVotes": unreturned,
                    }
                )
            context = trailing_context
            index = end
    return rows, districts, centres


def extract_pdf(path: Path, seat: dict[str, Any], source_root: Path) -> dict[str, Any]:
    reader = PdfReader(path)
    registered_matches = re.findall(
        r"JUMLAH PEMILIH:\s*([0-9,]+)", reader.pages[0].extract_text() or ""
    )
    if not registered_matches:
        raise ScoresheetExtractionError("Cannot read registered-voter total.")
    registered = int(registered_matches[-1].replace(",", ""))
    if registered != seat["registered"]:
        raise ScoresheetExtractionError(
            f"Registered voters {registered:,} do not match project value {seat['registered']:,}."
        )
    count = len(seat["candidates"])
    streams, ballots, source_votes, valid, rejected, unreturned = source_totals(reader, count)
    with pdfplumber.open(path) as pdf:
        first_table = pdf.pages[0].extract_table()
        if not first_table:
            raise ScoresheetExtractionError("First page has no extractable table.")
        columns = assign_candidates(candidate_headers(first_table, count), source_votes, seat["candidates"], seat["code"])
        rows, districts, centres = extract_rows(reader, seat["code"], columns)

    if len(rows) != streams:
        raise ScoresheetExtractionError(f"Extracted {len(rows)} rows; source total reports {streams} streams.")
    fields = {
        "ballotsInBox": ballots,
        "validVotes": valid,
        "rejectedVotes": rejected,
        "unreturnedVotes": unreturned,
    }
    for field, expected in fields.items():
        actual = sum(row[field] for row in rows)
        if actual != expected:
            raise ScoresheetExtractionError(f"{field} rows total {actual}; source reports {expected}.")
    total_vote_map = {column["candidateId"]: column["scoresheetVotes"] for column in columns}
    for candidate_key, expected in total_vote_map.items():
        actual = sum(row["candidateVotes"][candidate_key] for row in rows)
        if actual != expected:
            raise ScoresheetExtractionError(
                f"Candidate {candidate_key} rows total {actual}; source reports {expected}."
            )

    source_hash = sha256(path)
    relative_source = path.relative_to(source_root).as_posix()
    result = {
        "version": 1,
        "metadata": {
            "title": f"HELAIAN MATA PRU-15 {seat['code']} {seat['name']}",
            "sourceFile": relative_source,
            "sourceSha256": source_hash,
            "sourcePages": len(reader.pages),
            "printDate": PRINT_DATE,
        },
        "parliamentCode": seat["code"],
        "registeredVoters": registered,
        "candidateColumns": columns,
        "rows": rows,
        "totals": {
            "pollingStreams": streams,
            "ballotsInBox": ballots,
            "candidateVotes": total_vote_map,
            "validVotes": valid,
            "rejectedVotes": rejected,
            "unreturnedVotes": unreturned,
        },
    }
    return {"result": result, "districts": districts, "centres": centres, "bytes": path.stat().st_size}


def apply_authoritative_results(election: dict[str, Any], extracted: dict[str, dict[str, Any]]) -> None:
    """Replace covered aggregate results with the final values from SPR 760."""
    seats = {seat["code"]: seat for seat in election["seats"]}
    for code, item in extracted.items():
        seat = seats[code]
        result = item["result"]
        source_votes = result["totals"]["candidateVotes"]
        valid_votes = result["totals"]["validVotes"]
        turnout = result["totals"]["ballotsInBox"]
        previous_winner = seat["winner"]
        candidates = []
        for candidate in seat["candidates"]:
            votes = source_votes[candidate["id"]]
            candidates.append(
                {
                    **candidate,
                    "votes": votes,
                    "share": round(votes / valid_votes, 6) if valid_votes else 0,
                }
            )
        candidates.sort(key=lambda candidate: candidate["votes"], reverse=True)
        winner_candidate = candidates[0]
        runner_up = candidates[1] if len(candidates) > 1 else None
        seat["turnout"] = turnout
        seat["validVotes"] = valid_votes
        seat["rejectedVotes"] = result["totals"]["rejectedVotes"]
        seat["unreturnedVotes"] = result["totals"]["unreturnedVotes"]
        seat["turnoutPct"] = round(turnout / seat["registered"], 6) if seat["registered"] else 0
        seat["candidates"] = candidates
        seat["winner"] = {
            **winner_candidate,
            "gender": previous_winner["gender"] if winner_candidate["id"] == previous_winner["id"] else "TIDAK DINYATAKAN",
            "ethnicity": previous_winner["ethnicity"] if winner_candidate["id"] == previous_winner["id"] else "TIDAK DINYATAKAN",
        }
        seat["marginVotes"] = winner_candidate["votes"] - (runner_up["votes"] if runner_up else 0)
        seat["marginShare"] = round(winner_candidate["share"] - (runner_up["share"] if runner_up else 0), 6)


def build_artifacts(
    source_root: Path, election_path: Path
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, dict[str, Any]], dict[str, Any]]:
    election = json.loads(election_path.read_text(encoding="utf-8"))
    seats = {seat["code"]: seat for seat in election["seats"]}
    files = sorted(source_root.rglob("*.pdf"))
    if not files:
        raise ScoresheetExtractionError(f"No PDFs found under {source_root}.")

    extracted: dict[str, dict[str, Any]] = {}
    source_files = []
    all_districts: dict[str, dict[str, Any]] = {}
    all_centres: dict[str, dict[str, Any]] = {}
    for path in files:
        code_match = re.match(r"(P\.\d{3})", path.name)
        if not code_match or code_match.group(1) not in seats:
            raise ScoresheetExtractionError(f"Unknown constituency source {path}.")
        code = code_match.group(1)
        if code in extracted:
            raise ScoresheetExtractionError(f"Duplicate scoresheet for {code}.")
        try:
            item = extract_pdf(path, seats[code], source_root)
        except ScoresheetExtractionError as exc:
            raise ScoresheetExtractionError(f"{path.relative_to(source_root)}: {exc}") from exc
        extracted[code] = item
        for key, district in item["districts"].items():
            if key in all_districts:
                raise ScoresheetExtractionError(f"Duplicate polling district ID {key}.")
            all_districts[key] = district
        for key, centre in item["centres"].items():
            if key in all_centres:
                raise ScoresheetExtractionError(f"Duplicate polling centre ID {key}.")
            all_centres[key] = centre
        result = item["result"]
        source_files.append(
            {
                "path": result["metadata"]["sourceFile"],
                "parliamentCode": code,
                "sha256": result["metadata"]["sourceSha256"],
                "bytes": item["bytes"],
                "pages": result["metadata"]["sourcePages"],
            }
        )

    apply_authoritative_results(election, extracted)
    index_entries = []
    for code in sorted(extracted, key=lambda value: int(value.split(".")[1])):
        seat = seats[code]
        result = extracted[code]["result"]
        seat_districts = [item for item in all_districts.values() if item["parliamentCode"] == code]
        seat_centres = [item for item in all_centres.values() if item["parliamentCode"] == code]
        index_entries.append(
            {
                "parliamentCode": code,
                "parliamentName": seat["name"],
                "state": seat["state"],
                "sourceFile": result["metadata"]["sourceFile"],
                "sourceSha256": result["metadata"]["sourceSha256"],
                "pages": result["metadata"]["sourcePages"],
                "rowCount": len(result["rows"]),
                "pollingDistrictCount": len(seat_districts),
                "pollingCentreCount": len(seat_centres),
                "status": "authoritative",
            }
        )

    totals = {
        field: sum(item["result"]["totals"][field] for item in extracted.values())
        for field in ("ballotsInBox", "validVotes", "rejectedVotes", "unreturnedVotes")
    }
    index = {
        "version": 1,
        "metadata": {
            "title": "Liputan helaian mata PRU-15",
            "electionDate": election["metadata"]["electionDate"],
            "printDate": PRINT_DATE,
            "sourceCount": len(files),
            "coveredSeats": len(extracted),
            "totalSeats": len(seats),
            "coveragePct": round(len(extracted) / len(seats), 6),
            "totalPages": sum(item["result"]["metadata"]["sourcePages"] for item in extracted.values()),
            "totalRows": sum(len(item["result"]["rows"]) for item in extracted.values()),
            "pollingDistrictCount": len(all_districts),
            "printedPollingDistrictCount": sum(not item["code"].startswith("EARLY-") for item in all_districts.values()),
            "syntheticPollingDistrictCount": sum(item["code"].startswith("EARLY-") for item in all_districts.values()),
            "pollingCentreCount": len(all_centres),
            **totals,
        },
        "seats": index_entries,
    }
    polling_places = {
        "version": 1,
        "metadata": {"sourceCount": len(files), "coveredSeats": len(extracted)},
        "pollingDistricts": sorted(all_districts.values(), key=lambda item: item["id"]),
        "pollingCentres": sorted(all_centres.values(), key=lambda item: item["id"]),
    }
    source_manifest = {
        "version": 1,
        "algorithm": "sha256",
        "sourceRoot": "sources/pru15/scoresheets",
        "files": source_files,
    }
    results = {code: item["result"] for code, item in extracted.items()}
    return source_manifest, index, polling_places, results, election


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            raise ScoresheetExtractionError(f"{path} is stale. Regenerate scoresheet artifacts.")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PRU-15 polling-stream scoresheets.")
    parser.add_argument("--source-root", type=Path, default=Path("sources/pru15/scoresheets"))
    parser.add_argument("--election", type=Path, default=Path("public/data/elections/pru-15/election.json"))
    parser.add_argument("--output-directory", type=Path, default=Path("public/data/elections/pru-15/scoresheets"))
    parser.add_argument("--polling-places-output", type=Path, default=Path("public/data/elections/pru-15/polling-places.json"))
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        source_manifest, index, polling_places, results, election = build_artifacts(
            args.source_root, args.election
        )
        outputs = [
            (args.election, serialise(election, compact=True)),
            (args.source_root / "manifest.json", serialise(source_manifest)),
            (args.output_directory / "index.json", serialise(index)),
            (args.polling_places_output, serialise(polling_places)),
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
            f"{action} {len(results)} scoresheets, {index['metadata']['totalRows']} polling streams, "
            f"{index['metadata']['pollingDistrictCount']} districts; covered aggregate results are authoritative."
        )
        return 0
    except (OSError, json.JSONDecodeError, ScoresheetExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
