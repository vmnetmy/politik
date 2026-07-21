#!/usr/bin/env python3
"""Build the Negeri -> Parlimen -> DUN -> PDM -> Lokaliti hierarchy from SPR sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any


class GeographyExtractionError(ValueError):
    pass


PARLIAMENT_CODE = re.compile(r"P\.\d{3}")
DUN_CODE = re.compile(r"N\.\d{2}")


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


def area_code(value: str, pattern: re.Pattern[str], label: str) -> str:
    match = pattern.search(value)
    if not match:
        raise GeographyExtractionError(f"Missing {label} code in {value!r}.")
    return match.group(0)


def area_name(value: str, pattern: re.Pattern[str]) -> str:
    return " ".join(pattern.sub("", value, count=1).split()).upper()


def integer(row: dict[str, Any], key: str) -> int:
    value = row.get(key, 0)
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise GeographyExtractionError(f"Invalid integer {key}={value!r}.") from exc


def bpr_key(row: dict[str, Any]) -> tuple[str, str, str, str]:
    return tuple(normalise(row.get(key)) for key in ("Negeri", "PARLIMEN", "DUN", "DAERAH MENGUNDI"))


def build(
    source_directory: Path,
    constituencies_path: Path,
    polling_places_path: Path,
) -> dict[str, Any]:
    dpi_path = source_directory / "dpi-2022.json"
    bpr_path = source_directory / "senarai-bpr.json"
    locality_path = source_directory / "localities.json"
    source_path = source_directory / "source.json"
    dpi = json.loads(dpi_path.read_text(encoding="utf-8"))
    bpr = json.loads(bpr_path.read_text(encoding="utf-8"))
    locality_source = json.loads(locality_path.read_text(encoding="utf-8"))
    source_metadata = json.loads(source_path.read_text(encoding="utf-8"))
    constituencies = json.loads(constituencies_path.read_text(encoding="utf-8"))
    polling_places = json.loads(polling_places_path.read_text(encoding="utf-8"))

    if len(dpi) != 7_748 or any(row.get("TAHUN") != 2022 for row in dpi):
        raise GeographyExtractionError("The archived DPI snapshot must contain exactly 7,748 rows for 2022.")
    if {bpr_key(row) for row in dpi} != {bpr_key(row) for row in bpr}:
        raise GeographyExtractionError("The 2022 DPI hierarchy no longer matches SPR's Senarai BPR.")

    parliaments = {item["code"]: item for item in constituencies["parliaments"]}
    duns = {item["id"]: item for item in constituencies["duns"]}
    states = {item["id"]: item for item in constituencies["states"]}
    polling_districts = {item["id"]: item for item in polling_places["pollingDistricts"]}

    pdms: list[dict[str, Any]] = []
    pdm_ids: set[str] = set()
    parent_slugs: set[tuple[str, str | None, str]] = set()
    for row in dpi:
        parliament_code = area_code(row["PARLIMEN"], PARLIAMENT_CODE, "Parlimen")
        parliament = parliaments.get(parliament_code)
        if not parliament:
            raise GeographyExtractionError(f"Unknown Parliament {parliament_code}.")
        if normalise(parliament["name"]) != normalise(area_name(row["PARLIMEN"], PARLIAMENT_CODE)):
            raise GeographyExtractionError(f"Parliament name mismatch for {parliament_code}.")

        dun_match = DUN_CODE.search(str(row.get("DUN", "")))
        dun_code = dun_match.group(0) if dun_match and dun_match.group(0) != "N.00" else None
        dun_id = f"{parliament_code}:{dun_code}" if dun_code else None
        if dun_id:
            dun = duns.get(dun_id)
            if not dun:
                raise GeographyExtractionError(f"Unknown DUN {dun_id}.")
            if normalise(dun["name"]) != normalise(area_name(row["DUN"], DUN_CODE)):
                raise GeographyExtractionError(f"DUN name mismatch for {dun_id}.")

        code = str(row["KOD DM"]).strip()
        expected_prefix = parliament_code.removeprefix("P.")
        if not re.fullmatch(r"\d{3}/\d{2}/\d{2}", code) or not code.startswith(f"{expected_prefix}/"):
            raise GeographyExtractionError(f"Invalid PDM code {code!r} for {parliament_code}.")
        pdm_id = f"{parliament_code}:{code}"
        if pdm_id in pdm_ids:
            raise GeographyExtractionError(f"Duplicate PDM {pdm_id}.")
        pdm_ids.add(pdm_id)
        pdm_name = " ".join(str(row["DAERAH MENGUNDI"]).split()).upper()
        pdm_slug = slug(pdm_name)
        slug_key = (parliament_code, dun_id, pdm_slug)
        if slug_key in parent_slugs:
            raise GeographyExtractionError(f"Duplicate PDM slug {pdm_slug!r} under {dun_id or parliament_code}.")
        parent_slugs.add(slug_key)
        score_record = polling_districts.get(pdm_id)
        pdms.append(
            {
                "id": pdm_id,
                "code": code,
                "name": pdm_name,
                "slug": pdm_slug,
                "stateId": parliament["stateId"],
                "parliamentCode": parliament_code,
                "dunId": dun_id,
                "registeredVoters": integer(row, "PEMILIH BERDAFTAR"),
                "voterCategories": {
                    "ordinary": integer(row, "PENGUNDI BIASA"),
                    "military": integer(row, "TENTERA & PASANGAN"),
                    "police": integer(row, "POLIS & PSANGAN PGA"),
                    "overseasAbsent": integer(row, "PTH LUAR NEGARA"),
                    "disabled": integer(row, "ORANG KURANG UPAYA"),
                },
                "ageGroups": {
                    "18-20": integer(row, "18-20 TAHUN"),
                    "21-30": integer(row, "21-30 TAHUN"),
                    "31-45": integer(row, "31-45 TAHUN"),
                    "46-59": integer(row, "46-59 TAHUN"),
                    "60+": integer(row, "60 TAHUN & KE ATAS"),
                },
                "gender": {
                    "male": integer(row, "LELAKI"),
                    "female": integer(row, "PEREMPUAN"),
                },
                "hasScoresheet": score_record is not None,
                "pollingCentreIds": score_record["pollingCentreIds"] if score_record else [],
                "localityIds": [],
            }
        )

    pdm_by_id = {item["id"]: item for item in pdms}
    localities: list[dict[str, Any]] = []
    locality_ids: set[str] = set()
    for source in locality_source["sources"]:
        parliament_code = source["parliamentCode"]
        pdm_id = f"{parliament_code}:{source['pdmCode']}"
        pdm = pdm_by_id.get(pdm_id)
        if not pdm:
            raise GeographyExtractionError(f"Locality source references unknown PDM {pdm_id}.")
        expected_dun_id = f"{parliament_code}:{source['dunCode']}"
        if pdm["dunId"] != expected_dun_id:
            raise GeographyExtractionError(f"Locality source DUN mismatch for {pdm_id}.")
        source_locality_slugs: set[str] = set()
        for item in source["localities"]:
            locality_id = f"{pdm_id}:{item['code']}"
            locality_slug = slug(item["name"])
            if locality_id in locality_ids or locality_slug in source_locality_slugs:
                raise GeographyExtractionError(f"Duplicate locality {locality_id}.")
            locality_ids.add(locality_id)
            source_locality_slugs.add(locality_slug)
            pdm["localityIds"].append(locality_id)
            localities.append(
                {
                    "id": locality_id,
                    "code": item["code"],
                    "name": item["name"],
                    "slug": locality_slug,
                    "pdmId": pdm_id,
                    "stateId": pdm["stateId"],
                    "parliamentCode": parliament_code,
                    "dunId": pdm["dunId"],
                    "sourceUrl": source["url"],
                    "sourceLabel": source["sourceLabel"],
                    "publishedAt": source["publishedAt"],
                }
            )

    represented_parliaments = {item["parliamentCode"] for item in pdms}
    represented_duns = {item["dunId"] for item in pdms if item["dunId"]}
    represented_states = {item["stateId"] for item in pdms}
    if represented_parliaments != set(parliaments) or represented_duns != set(duns) or represented_states != set(states):
        raise GeographyExtractionError("The hierarchy does not cover all reusable state, Parliament and DUN records.")

    return {
        "version": 1,
        "metadata": {
            "title": "Hierarki kawasan pilihan raya SPR",
            "snapshotYear": 2022,
            "retrievedAt": source_metadata["retrievedAt"],
            "sourceUrls": [item["url"] for item in source_metadata["sources"]],
            "sourceSha256": {
                "dpi2022": sha256(dpi_path),
                "senaraiBpr": sha256(bpr_path),
                "localities": sha256(locality_path),
            },
            "stateCount": len(represented_states),
            "parliamentCount": len(represented_parliaments),
            "dunCount": len(represented_duns),
            "pdmCount": len(pdms),
            "scoresheetPdmCount": sum(item["hasScoresheet"] for item in pdms),
            "localityCount": len(localities),
            "localityPdmCount": sum(bool(item["localityIds"]) for item in pdms),
            "localityCoverage": "partial",
        },
        "pdms": sorted(pdms, key=lambda item: item["code"]),
        "localities": sorted(localities, key=lambda item: item["id"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the official SPR geography hierarchy.")
    parser.add_argument("--source-directory", type=Path, default=Path("sources/spr/geography"))
    parser.add_argument("--constituencies", type=Path, default=Path("public/data/constituencies.json"))
    parser.add_argument("--polling-places", type=Path, default=Path("public/data/polling-places.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/geography.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rendered = compact(build(args.source_directory, args.constituencies, args.polling_places))
        if args.check:
            if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
                raise GeographyExtractionError(f"{args.output} is stale. Run npm run data:geography.")
            print("SPR geography hierarchy is current.")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
            value = json.loads(rendered)
            metadata = value["metadata"]
            print(
                f"Wrote {metadata['pdmCount']} PDM and {metadata['localityCount']} sourced localities "
                f"to {args.output}."
            )
        return 0
    except (OSError, KeyError, TypeError, json.JSONDecodeError, GeographyExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
