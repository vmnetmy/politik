#!/usr/bin/env python3
"""Publish reusable 2018 and 2022 SPR electoral-roll geography snapshots."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://opendata.spr.gov.my/data/daftar-pemilih-induk-2012-2025.json"
EDITIONS = {2018: "pru-14", 2022: "pru-15"}

SOURCE_FIELDS = {
    "registered": "PEMILIH BERDAFTAR",
    "ordinary": "PENGUNDI BIASA",
    "military": "TENTERA & PASANGAN",
    "police": "POLIS & PSANGAN PGA",
    "overseas": "PTH LUAR NEGARA",
    "disabled": "ORANG KURANG UPAYA",
    "age18": "18 TAHUN",
    "age18To20": "18-20 TAHUN",
    "age21To30": "21-30 TAHUN",
    "age31To45": "31-45 TAHUN",
    "age46To59": "46-59 TAHUN",
    "age60Plus": "60 TAHUN & KE ATAS",
    "male": "LELAKI",
    "female": "PEREMPUAN",
}


class VoterRollError(ValueError):
    pass


def integer(value: Any) -> int:
    if value in (None, "", "NULL", "-"):
        return 0
    return int(str(value).replace(",", "").strip())


def slug(value: str) -> str:
    normalised = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", normalised))


def split_area(value: str, pattern: str) -> tuple[str, str]:
    match = re.match(pattern, value.strip())
    if not match:
        raise VoterRollError(f"Cannot parse constituency label {value!r}.")
    return match.group(1), match.group(2).strip()


def metrics(row: dict[str, Any]) -> dict[str, int]:
    return {name: integer(row.get(source)) for name, source in SOURCE_FIELDS.items()}


def empty_metrics() -> dict[str, int]:
    return {name: 0 for name in SOURCE_FIELDS}


def add_metrics(target: dict[str, Any], values: dict[str, int]) -> None:
    for name in SOURCE_FIELDS:
        target[name] += values[name]


def validate_metrics(values: dict[str, Any], label: str) -> None:
    registered = values["registered"]
    if values["male"] + values["female"] != registered:
        raise VoterRollError(f"Gender totals do not balance for {label}.")
    if values["ordinary"] + values["military"] + values["police"] + values["overseas"] != registered:
        raise VoterRollError(f"Voter-category totals do not balance for {label}.")
    age_total = sum(values[name] for name in ("age18", "age18To20", "age21To30", "age31To45", "age46To59", "age60Plus"))
    if age_total != registered:
        raise VoterRollError(f"Age totals do not balance for {label}.")


def fetch_source() -> tuple[list[dict[str, Any]], str]:
    result = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", SOURCE_URL],
        check=True,
        capture_output=True,
    )
    return json.loads(result.stdout), hashlib.sha256(result.stdout).hexdigest()


def build_artifact(rows: list[dict[str, Any]], year: int, source_sha256: str) -> dict[str, Any]:
    election_id = EDITIONS[year]
    election = json.loads((ROOT / f"public/data/elections/{election_id}/election.json").read_text(encoding="utf-8"))
    source_rows = [row for row in rows if integer(row.get("TAHUN")) == year]
    if not source_rows:
        raise VoterRollError(f"No official electoral-roll rows found for {year}.")

    national = empty_metrics()
    states: dict[str, dict[str, Any]] = {}
    parliaments: dict[str, dict[str, Any]] = {}
    duns: dict[str, dict[str, Any]] = {}
    pdms: dict[str, dict[str, Any]] = {}

    for row in source_rows:
        state_name = str(row["Negeri"]).strip().upper()
        state_id = slug(state_name)
        parliament_code, parliament_name = split_area(str(row["PARLIMEN"]), r"^(P\.\d{3})\s*(.*)$")
        dun_code, dun_name = split_area(str(row["DUN"]), r"^(N\.\d{2})\s*(.*)$")
        dun_id = f"{parliament_code}:{dun_code}"
        pdm_code = str(row["KOD DM"]).strip()
        pdm_id = f"{parliament_code}:{pdm_code}"
        values = metrics(row)
        validate_metrics(values, pdm_id)
        add_metrics(national, values)

        state = states.setdefault(state_id, {"id": state_id, "name": state_name, "parliamentCodes": [], **empty_metrics()})
        if parliament_code not in state["parliamentCodes"]:
            state["parliamentCodes"].append(parliament_code)
        add_metrics(state, values)

        parliament = parliaments.setdefault(
            parliament_code,
            {"code": parliament_code, "name": parliament_name, "stateId": state_id, "dunIds": [], "pdmIds": [], **empty_metrics()},
        )
        if dun_code != "N.00" and dun_id not in parliament["dunIds"]:
            parliament["dunIds"].append(dun_id)
        if pdm_id not in parliament["pdmIds"]:
            parliament["pdmIds"].append(pdm_id)
        add_metrics(parliament, values)

        if dun_code != "N.00":
            dun = duns.setdefault(
                dun_id,
                {"id": dun_id, "code": dun_code, "name": dun_name, "stateId": state_id, "parliamentCode": parliament_code, "pdmIds": [], **empty_metrics()},
            )
            if pdm_id not in dun["pdmIds"]:
                dun["pdmIds"].append(pdm_id)
            add_metrics(dun, values)

        pdms[pdm_id] = {
            "id": pdm_id,
            "code": pdm_code,
            "name": str(row["DAERAH MENGUNDI"]).strip().upper(),
            "stateId": state_id,
            "parliamentCode": parliament_code,
            "dunId": None if dun_code == "N.00" else dun_id,
            **values,
        }

    for collection in (states.values(), parliaments.values(), duns.values()):
        for item in collection:
            validate_metrics(item, item.get("id") or item.get("code"))
    validate_metrics(national, f"Malaysia {year}")

    election_registered = sum(seat["registered"] for seat in election["seats"])
    order = lambda value: tuple(integer(item) for item in re.findall(r"\d+", value))
    return {
        "version": 1,
        "metadata": {
            "title": f"Daftar Pemilih Induk SPR {year}",
            "electionId": election_id,
            "snapshotYear": year,
            "sourceUrl": SOURCE_URL,
            "sourceSha256": source_sha256,
            "sourceRowCount": len(source_rows),
            "snapshotRegistered": national["registered"],
            "electionRegistered": election_registered,
            "denominatorDifference": national["registered"] - election_registered,
            "note": "Snapshot tahunan daftar pemilih; bukan denominator keputusan pada hari pilihan raya.",
        },
        "national": national,
        "states": sorted(states.values(), key=lambda item: item["name"]),
        "parliaments": sorted(parliaments.values(), key=lambda item: order(item["code"])),
        "duns": sorted(duns.values(), key=lambda item: (order(item["parliamentCode"]), order(item["code"]))),
        "pdms": sorted(pdms.values(), key=lambda item: (order(item["parliamentCode"]), order(item["code"]))),
    }


def validate_artifact(artifact: dict[str, Any], year: int) -> None:
    if artifact.get("metadata", {}).get("snapshotYear") != year:
        raise VoterRollError(f"Wrong snapshot year for {EDITIONS[year]}.")
    if len(artifact.get("parliaments", [])) != 222:
        raise VoterRollError(f"{year} must contain 222 Parliament records.")
    if artifact["metadata"]["sourceRowCount"] != len(artifact.get("pdms", [])):
        raise VoterRollError(f"{year} source-row and PDM coverage differ.")
    for collection_name in ("states", "parliaments", "duns", "pdms"):
        collection = artifact.get(collection_name, [])
        if sum(item["registered"] for item in collection) != artifact["national"]["registered"] and collection_name in {"states", "parliaments", "pdms"}:
            raise VoterRollError(f"{year} {collection_name} totals do not reconcile.")
        for item in collection:
            validate_metrics(item, item.get("id") or item.get("code"))
    validate_metrics(artifact["national"], f"Malaysia {year}")


def output_path(year: int) -> Path:
    return ROOT / f"public/data/elections/{EDITIONS[year]}/voter-roll.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract reusable SPR voter-roll geography for PRU-14 and PRU-15.")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            for year in EDITIONS:
                artifact = json.loads(output_path(year).read_text(encoding="utf-8"))
                validate_artifact(artifact, year)
            print("Validated PRU-14 and PRU-15 voter-roll geography snapshots.")
            return 0

        rows, source_sha256 = fetch_source()
        for year in EDITIONS:
            artifact = build_artifact(rows, year, source_sha256)
            validate_artifact(artifact, year)
            path = output_path(year)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("Wrote PRU-14 and PRU-15 voter-roll geography snapshots.")
        return 0
    except (OSError, VoterRollError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"Voter-roll extraction error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
