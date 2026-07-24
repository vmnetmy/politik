#!/usr/bin/env python3
"""Extract reusable constituency identities and PRU-15 voter-age statistics."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

import pdfplumber


EXPECTED_PDF_SHA256 = "0d2f8460fa001a6f8b533b408d8dc2d34b91cee5b3315dd259aad0ebba0e349c"
EXPECTED_PARLIAMENTS = 222
EXPECTED_DUNS = 600
EXPECTED_N00_ROWS = 13
AGE_BANDS = ("18-20", "21-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90+")
STATE_NAMES = (
    "PERLIS",
    "KEDAH",
    "KELANTAN",
    "TERENGGANU",
    "PULAU PINANG",
    "PERAK",
    "PAHANG",
    "SELANGOR",
    "W.P KUALA LUMPUR",
    "W.P PUTRAJAYA",
    "NEGERI SEMBILAN",
    "MELAKA",
    "JOHOR",
    "W.P LABUAN",
    "SABAH",
    "SARAWAK",
)
KNOWN_ELECTION_DIFFERENCES = {
    "P.064": ("IPOH TIMOR", "IPOH TIMUR"),
    "P.157": ("PENGERANG", "PENGGERANG"),
    "P.166": ("W.P LABUAN", "SABAH"),
}
NUMBER = r"(?:\d{1,3}(?:,\d{3})*|\d+)"
DUN_ROW = re.compile(rf"^\s*(N\.\d{{2}})(?:\s+(.*?))?\s+({NUMBER}(?:\s+{NUMBER}){{9}})\s*$")
PARLIAMENT_TOTAL = re.compile(rf"^\s*(P\.\d{{3}})\s+(.+?)\s+Total\s+({NUMBER}(?:\s+{NUMBER}){{9}})\s*$")
PARLIAMENT_HEADING = re.compile(r"^\s*(P\.\d{3})\s+(.+?)\s*$")


class VoterAgeExtractionError(RuntimeError):
    pass


def normalise(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]", "", ascii_value.upper())


def state_id(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower().replace("w.p", "wp"))).strip("-")


def parse_values(value: str) -> tuple[int, dict[str, int]]:
    values = [int(part.replace(",", "")) for part in re.findall(NUMBER, value)]
    if len(values) != 10:
        raise VoterAgeExtractionError(f"Expected total plus nine age bands; found {len(values)} values.")
    total, *age_values = values
    counts = dict(zip(AGE_BANDS, age_values))
    if sum(counts.values()) != total:
        raise VoterAgeExtractionError(f"Age bands sum to {sum(counts.values())}, not {total}.")
    return total, counts


def read_election_parliaments(path: Path) -> dict[str, dict[str, str]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise VoterAgeExtractionError(f"Cannot read election data: {exc}") from exc
    seats = value.get("seats")
    if not isinstance(seats, list) or len(seats) != EXPECTED_PARLIAMENTS:
        raise VoterAgeExtractionError("Election data must contain 222 Parlimen records.")
    return {str(seat["code"]): {"name": str(seat["name"]), "state": str(seat["state"])} for seat in seats}


def extract(pdf_path: Path, election_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        raw = pdf_path.read_bytes()
    except OSError as exc:
        raise VoterAgeExtractionError(f"Cannot read voter-age PDF: {exc}") from exc
    source_hash = hashlib.sha256(raw).hexdigest()
    if source_hash != EXPECTED_PDF_SHA256:
        raise VoterAgeExtractionError("The voter-age PDF changed; review its table structure before regenerating data.")

    election = read_election_parliaments(election_path)
    current_state = ""
    current_parliament = ""
    state_order: list[str] = []
    parliament_order: list[str] = []
    parliament_headers: dict[str, dict[str, str]] = {}
    parliament_totals: dict[str, dict[str, Any]] = {}
    state_totals: dict[str, dict[str, Any]] = {}
    dun_records: list[dict[str, Any]] = []
    dun_identity_by_id: dict[str, dict[str, str]] = {}
    dun_ids_by_parliament: dict[str, list[str]] = defaultdict(list)
    n00_rows = 0

    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) != 71:
                raise VoterAgeExtractionError(f"Expected 71 pages; found {len(pdf.pages)}.")
            for page_number, page in enumerate(pdf.pages, 1):
                text = page.extract_text(layout=True, x_tolerance=2, y_tolerance=2) or ""
                for line in text.splitlines():
                    stripped = line.strip()
                    if stripped in STATE_NAMES:
                        current_state = stripped
                        if current_state not in state_order:
                            state_order.append(current_state)
                        continue

                    parliament_total_match = PARLIAMENT_TOTAL.match(line)
                    if parliament_total_match:
                        code, name, values = parliament_total_match.groups()
                        total, counts = parse_values(values)
                        parliament_totals[code] = {
                            "parliamentCode": code,
                            "total": total,
                            "counts": counts,
                        }
                        continue

                    parliament_match = PARLIAMENT_HEADING.match(line)
                    if parliament_match:
                        code, name = parliament_match.groups()
                        current_parliament = code
                        if not current_state:
                            raise VoterAgeExtractionError(f"{code} appears before a state heading on page {page_number}.")
                        if code not in parliament_order:
                            parliament_order.append(code)
                        parliament_headers[code] = {"name": name.strip(), "state": current_state}
                        continue

                    dun_match = DUN_ROW.match(line)
                    if dun_match:
                        code, name, values = dun_match.groups()
                        if not current_parliament:
                            raise VoterAgeExtractionError(f"{code} appears before a Parlimen heading on page {page_number}.")
                        total, counts = parse_values(values)
                        if code == "N.00":
                            n00_rows += 1
                            continue
                        clean_name = (name or "").strip()
                        if not clean_name:
                            raise VoterAgeExtractionError(f"{current_parliament} {code} has no DUN name.")
                        dun_id = f"{current_parliament}:{code}"
                        dun_identity_by_id[dun_id] = {
                            "id": dun_id,
                            "code": code,
                            "name": clean_name,
                            "stateId": state_id(current_state),
                            "parliamentCode": current_parliament,
                        }
                        dun_ids_by_parliament[current_parliament].append(dun_id)
                        dun_records.append({
                            "dunId": dun_id,
                            "total": total,
                            "counts": counts,
                        })
                        continue

                    for state_name in STATE_NAMES:
                        prefix = f"{state_name} Total"
                        if stripped.startswith(prefix):
                            total, counts = parse_values(stripped[len(prefix):].strip())
                            sid = state_id(state_name)
                            state_totals[sid] = {"stateId": sid, "total": total, "counts": counts}
                            break
    except VoterAgeExtractionError:
        raise
    except Exception as exc:
        raise VoterAgeExtractionError(f"Cannot parse voter-age PDF: {exc}") from exc

    if len(parliament_headers) != EXPECTED_PARLIAMENTS or len(parliament_totals) != EXPECTED_PARLIAMENTS:
        raise VoterAgeExtractionError(
            f"Expected 222 Parlimen headings and totals; found {len(parliament_headers)} and {len(parliament_totals)}."
        )
    if len(dun_records) != EXPECTED_DUNS or n00_rows != EXPECTED_N00_ROWS:
        raise VoterAgeExtractionError(f"Expected 600 DUN and 13 N.00 rows; found {len(dun_records)} and {n00_rows}.")
    if set(state_totals) != {state_id(name) for name in STATE_NAMES}:
        raise VoterAgeExtractionError("State totals do not cover all 16 source states and federal territories.")

    if len(dun_identity_by_id) != EXPECTED_DUNS:
        raise VoterAgeExtractionError("DUN identity IDs are not unique across their parent Parlimen records.")
    if {record["dunId"] for record in dun_records} != set(dun_identity_by_id):
        raise VoterAgeExtractionError("DUN statistics and constituency identities do not cover the same IDs.")

    parliaments: list[dict[str, Any]] = []
    for code in parliament_order:
        header = parliament_headers[code]
        election_record = election.get(code)
        if not election_record:
            raise VoterAgeExtractionError(f"{code} is missing from election.json.")
        name_matches = normalise(header["name"]) == normalise(election_record["name"])
        state_matches = header["state"] == election_record["state"]
        if (not name_matches or not state_matches) and code not in KNOWN_ELECTION_DIFFERENCES:
            raise VoterAgeExtractionError(
                f"Unexpected constituency mismatch for {code}: PDF {header}, election {election_record}."
            )
        parliaments.append({
            "code": code,
            "name": header["name"],
            "stateId": state_id(header["state"]),
            "dunIds": dun_ids_by_parliament[code],
        })

    state_parliaments: dict[str, list[str]] = defaultdict(list)
    for parliament in parliaments:
        state_parliaments[parliament["stateId"]].append(parliament["code"])
    states = [
        {"id": state_id(name), "name": name, "parliamentCodes": state_parliaments[state_id(name)]}
        for name in state_order
    ]

    for parliament in parliaments:
        records = [record for record in dun_records if record["dunId"] in parliament["dunIds"]]
        source_total = parliament_totals[parliament["code"]]
        if records:
            if sum(record["total"] for record in records) != source_total["total"]:
                raise VoterAgeExtractionError(f"DUN totals do not equal {parliament['code']} total.")
            for band in AGE_BANDS:
                if sum(record["counts"][band] for record in records) != source_total["counts"][band]:
                    raise VoterAgeExtractionError(f"DUN {band} totals do not equal {parliament['code']}.")

    national_total = sum(record["total"] for record in state_totals.values())
    national_counts = {band: sum(record["counts"][band] for record in state_totals.values()) for band in AGE_BANDS}
    if sum(national_counts.values()) != national_total:
        raise VoterAgeExtractionError("National age bands do not equal the national registered-voter total.")

    constituencies = {
        "version": 1,
        "sourceFile": pdf_path.name,
        "sourceSha256": source_hash,
        "states": states,
        "parliaments": parliaments,
        "duns": list(dun_identity_by_id.values()),
    }
    voter_age = {
        "version": 1,
        "metadata": {
            "title": "STATISTIK UMUR MENGIKUT DUN PRU-15",
            "sourceFile": pdf_path.name,
            "sourceSha256": source_hash,
            "sourceUpdatedAt": "2022-10-09",
            "electoralRollThrough": "2022-08",
            "ageBands": list(AGE_BANDS),
            "totalRegistered": national_total,
        },
        "national": {"total": national_total, "counts": national_counts},
        "stateRecords": [state_totals[state["id"]] for state in states],
        "parliamentRecords": [parliament_totals[code] for code in parliament_order],
        "dunRecords": dun_records,
    }
    return constituencies, voter_age


def serialise(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PRU-15 voter age statistics and constituency references.")
    parser.add_argument("pdf", nargs="?", type=Path, default=Path("STATISTIK PRU KE_15 UMUR BY_DUN.pdf"))
    parser.add_argument("--election", type=Path, default=Path("public/data/elections/pru-15/election.json"))
    parser.add_argument("--constituencies-output", type=Path, default=Path("public/data/elections/pru-15/constituencies.json"))
    parser.add_argument("--age-output", type=Path, default=Path("public/data/elections/pru-15/voter-age.json"))
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        constituencies, voter_age = extract(args.pdf, args.election)
        outputs = (
            (args.constituencies_output, serialise(constituencies)),
            (args.age_output, serialise(voter_age)),
        )
        if args.check:
            for path, rendered in outputs:
                if path.read_text(encoding="utf-8") != rendered:
                    raise VoterAgeExtractionError(f"{path} is stale. Regenerate the voter-age artifacts.")
            print("Validated 222 Parlimen, 600 DUN and all voter-age totals.")
            return 0
        for path, rendered in outputs:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(rendered, encoding="utf-8")
        print("Wrote reusable constituency data and voter-age statistics for 222 Parlimen and 600 DUN.")
        return 0
    except (OSError, VoterAgeExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
