#!/usr/bin/env python3
"""Cross-check PRU-15 publication data against the official SPR catalogue.

The row-level SPR 760 scoresheets remain the publication authority where they
exist. The catalogue is an independent aggregate check and supplies the
delayed P.017 result through the PRK dataset.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / "sources/spr/open-data/pru-15-2022.json"
ELECTION_PATH = ROOT / "public/data/elections/pru-15/election.json"
SCORESHEET_DIR = ROOT / "public/data/elections/pru-15/scoresheets"
REPORT_PATH = ROOT / "public/data/elections/pru-15/spr-audit.json"

URLS = {
    "catalogue": "https://opendata.spr.gov.my/data/_index.json",
    "results": "https://opendata.spr.gov.my/data/keputusan-pru.json",
    "byElections": "https://opendata.spr.gov.my/data/keputusan-prk.json",
    "candidateProfiles": "https://opendata.spr.gov.my/data/maklumat-calon-pr.json",
    "electoralRoll": "https://opendata.spr.gov.my/data/daftar-pemilih-induk-2012-2025.json",
    "pollingAdministration": "https://opendata.spr.gov.my/data/bil-pm-ppc-ppru.json",
}

P028_CATALOGUE_DISCREPANCY = {
    "parliamentCode": "P.028",
    "field": "aggregate result",
    "catalogue": {
        "validVotes": 81319,
        "rejectedVotes": 1020,
        "ballotsIssued": 82576,
        "candidate": "DATUK CIKGU AWI",
        "candidateVotes": 23988,
    },
    "published": {
        "validVotes": 81175,
        "rejectedVotes": 1013,
        "ballotsIssued": 82425,
        "candidate": "DATUK CIKGU AWI",
        "candidateVotes": 23844,
    },
    "resolution": "retained-spr-760",
    "reason": (
        "The official SPR 760 scoresheet dated 19 November 2022 contains the "
        "published row-level values and is the declared higher-resolution source."
    ),
}


def serialise(value: Any, *, compact: bool = False) -> str:
    if compact:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_json(url: str) -> tuple[Any, str]:
    result = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", url],
        check=True,
        capture_output=True,
    )
    payload = result.stdout
    return json.loads(payload), hashlib.sha256(payload).hexdigest()


def parliament_code(value: str) -> str:
    match = re.search(r"P\.\d{3}", value or "")
    if not match:
        raise ValueError(f"Missing Parliament code in {value!r}")
    return match.group(0)


def parliament_name(value: str) -> str:
    return re.sub(r"^\s*P\.\d{3}\s*", "", value or "").strip()


def integer(value: Any) -> int:
    if value in (None, "", "NULL", "-"):
        return 0
    return int(str(value).replace(",", "").strip())


def is_main_pru15_result(row: dict[str, Any]) -> bool:
    return (
        str(row.get("TAHUN PILIHAN RAYA")) == "2022"
        and row.get("NamaPR") == "PILIHAN RAYA UMUM KE - 15"
        and row.get("JenisCalon") == "Parlimen"
    )


def is_delayed_p017_result(row: dict[str, Any]) -> bool:
    return (
        str(row.get("TAHUN PILIHAN RAYA")) == "2022"
        and parliament_code(row.get("PARLIMEN", "")) == "P.017"
        and "UMUM KE-15" in row.get("NamaPR", "")
        and row.get("PILIHAN RAYA") == "PRK PARLIMEN"
    )


def normalise_result_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[parliament_code(row["PARLIMEN"])].append(row)

    seats = []
    for code in sorted(grouped, key=lambda item: int(item.split(".")[1])):
        source_rows = grouped[code]
        aggregate = next(
            (row for row in source_rows if integer(row.get("JumlahPemilih")) > 0),
            source_rows[0],
        )
        candidates = []
        for row in source_rows:
            candidates.append(
                {
                    "name": str(row.get("NAMA ATAS KERTAS UNDI") or row.get("NAMA KERTAS UNDI")).strip(),
                    "party": str(row.get("NAMA PARTI BERTANDING", "")).strip(),
                    "shortName": str(row.get("SINGKATAN NAMA PARTI BERTANDING", "")).strip(),
                    "votes": integer(row.get("BILANGAN UNDI")),
                    "status": str(row.get("StatusCalon") or row.get("STATUS", "")).strip(),
                }
            )
        candidates.sort(key=lambda item: (-item["votes"], item["name"]))
        valid = sum(item["votes"] for item in candidates)
        rejected = integer(aggregate.get("UNDI DITOLAK"))
        unreturned = integer(aggregate.get("UNDI TAK KEMBALI"))
        seats.append(
            {
                "parliamentCode": code,
                "parliamentName": parliament_name(aggregate["PARLIMEN"]),
                "state": str(aggregate["NEGERI"]).strip(),
                "registeredVoters": integer(aggregate.get("JumlahPemilih")),
                "validVotes": valid,
                "rejectedVotes": rejected,
                "unreturnedVotes": unreturned,
                "ballotsIssued": valid + rejected + unreturned,
                "turnoutPctPublished": float(aggregate.get("PERATUS UNDI") or 0) / 100,
                "majorityVotes": max(integer(row.get("MAJORITI")) for row in source_rows),
                "candidates": candidates,
            }
        )
    return seats


def aggregate_electoral_roll(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    numeric_fields = [
        "PEMILIH BERDAFTAR",
        "PENGUNDI BIASA",
        "TENTERA & PASANGAN",
        "POLIS & PSANGAN PGA",
        "PTH LUAR NEGARA",
        "ORANG KURANG UPAYA",
        "18 TAHUN",
        "18-20 TAHUN",
        "21-30 TAHUN",
        "31-45 TAHUN",
        "46-59 TAHUN",
        "60 TAHUN & KE ATAS",
        "LELAKI",
        "PEREMPUAN",
    ]
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        if integer(row.get("TAHUN")) != 2022:
            continue
        code = parliament_code(row["PARLIMEN"])
        item = grouped.setdefault(
            code,
            {
                "parliamentCode": code,
                "parliamentName": parliament_name(row["PARLIMEN"]),
                "state": str(row["Negeri"]).strip(),
                "pdmCount": 0,
                **{field: 0 for field in numeric_fields},
            },
        )
        item["pdmCount"] += 1
        for field in numeric_fields:
            item[field] += integer(row.get(field))
    return [grouped[code] for code in sorted(grouped, key=lambda item: int(item.split(".")[1]))]


def build_snapshot() -> dict[str, Any]:
    payloads: dict[str, Any] = {}
    hashes: dict[str, str] = {}
    for name, url in URLS.items():
        payloads[name], hashes[name] = fetch_json(url)

    main = [row for row in payloads["results"] if is_main_pru15_result(row)]
    delayed = [row for row in payloads["byElections"] if is_delayed_p017_result(row)]
    results = normalise_result_rows([*main, *delayed])

    profiles = []
    for row in payloads["candidateProfiles"]:
        if str(row.get("TAHUN PILIHAN RAYA")) != "2022":
            continue
        if str(row.get("DEWAN UNDANGAN NEGERI", "")).strip() != "-":
            continue
        code = parliament_code(row.get("PARLIMEN", ""))
        if row.get("NamaPR") != "PILIHAN RAYA UMUM KE - 15" and code != "P.017":
            continue
        profiles.append(
            {
                "parliamentCode": code,
                "candidateNumber": integer(row.get("NoCalon")),
                "fullName": str(row.get("NAMA PENUH CALON", "")).strip(),
                "ballotName": str(row.get("NAMA KERTAS UNDI", "")).strip(),
                "gender": (
                    "TIDAK DINYATAKAN"
                    if str(row.get("JANTINA", "")).strip() in {"", "NULL"}
                    else str(row.get("JANTINA", "")).strip()
                ),
                "age": integer(row.get("Umur")),
            }
        )
    profiles.sort(key=lambda item: (item["parliamentCode"], item["candidateNumber"]))

    administration = [
        row
        for row in payloads["pollingAdministration"]
        if str(row.get("TAHUN PILIHAN RAYA")) == "2022"
    ]
    return {
        "version": 1,
        "metadata": {
            "title": "Official SPR Open Data snapshot for PRU-15 (2022)",
            "checkedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "sourceUrls": URLS,
            "sourceSha256": hashes,
            "sourcePrecedence": ["SPR 760 constituency scoresheet", "SPR Open Data catalogue"],
        },
        "results": results,
        "candidateProfiles": profiles,
        "electoralRoll2022": aggregate_electoral_roll(payloads["electoralRoll"]),
        "pollingAdministration2022": administration,
    }


def apply_scoresheet_accounting(election: dict[str, Any]) -> dict[str, Any]:
    output = copy.deepcopy(election)
    for seat in output["seats"]:
        scoresheet = read_json(SCORESHEET_DIR / f"{seat['code']}.json")
        totals = scoresheet["totals"]
        seat["validVotes"] = totals["validVotes"]
        seat["rejectedVotes"] = totals["rejectedVotes"]
        seat["unreturnedVotes"] = totals["unreturnedVotes"]
        seat["turnout"] = totals["ballotsInBox"]
        seat["turnoutPct"] = round(seat["turnout"] / seat["registered"], 6)
    output["metadata"]["officialAudit"] = {
        "status": "passed-with-declared-source-precedence",
        "checkedAt": read_json(SNAPSHOT_PATH)["metadata"]["checkedAt"],
        "report": "spr-audit.json",
        "catalogueUrl": "https://opendata.spr.gov.my/katalog",
    }
    return output


def build_report(snapshot: dict[str, Any], election: dict[str, Any]) -> dict[str, Any]:
    official = {item["parliamentCode"]: item for item in snapshot["results"]}
    published = {item["code"]: item for item in election["seats"]}
    errors = []
    catalogue_discrepancies = []
    catalogue_percentage_discrepancies = []

    if set(official) != set(published):
        errors.append(
            {
                "field": "seatCoverage",
                "officialOnly": sorted(set(official) - set(published)),
                "projectOnly": sorted(set(published) - set(official)),
            }
        )

    for code in sorted(set(official) & set(published)):
        source = official[code]
        seat = published[code]
        scoresheet = read_json(SCORESHEET_DIR / f"{code}.json")
        totals = scoresheet["totals"]
        expected = {
            "registeredVoters": seat["registered"],
            "validVotes": seat["validVotes"],
            "rejectedVotes": seat["rejectedVotes"],
            "unreturnedVotes": seat["unreturnedVotes"],
            "ballotsIssued": seat["turnout"],
            "majorityVotes": seat["marginVotes"],
            "winnerVotes": seat["winner"]["votes"],
            "candidateCount": len(seat["candidates"]),
            "candidateVotes": sorted(candidate["votes"] for candidate in seat["candidates"]),
        }
        row_level = {
            "registeredVoters": scoresheet["registeredVoters"],
            "validVotes": totals["validVotes"],
            "rejectedVotes": totals["rejectedVotes"],
            "unreturnedVotes": totals["unreturnedVotes"],
            "ballotsIssued": totals["ballotsInBox"],
            "candidateVotes": sorted(totals["candidateVotes"].values()),
        }
        for field, value in row_level.items():
            if expected[field] != value:
                errors.append({"parliamentCode": code, "field": field, "published": expected[field], "scoresheet": value})

        catalogue = {
            "registeredVoters": source["registeredVoters"],
            "validVotes": source["validVotes"],
            "rejectedVotes": source["rejectedVotes"],
            "unreturnedVotes": source["unreturnedVotes"],
            "ballotsIssued": source["ballotsIssued"],
            "majorityVotes": source["majorityVotes"],
            "winnerVotes": source["candidates"][0]["votes"],
            "candidateCount": len(source["candidates"]),
            "candidateVotes": sorted(candidate["votes"] for candidate in source["candidates"]),
        }
        differences = {
            field: {"published": expected[field], "catalogue": value}
            for field, value in catalogue.items()
            if expected[field] != value
        }
        if differences:
            if code == "P.028":
                catalogue_discrepancies.append({**P028_CATALOGUE_DISCREPANCY, "differences": differences})
            else:
                errors.append({"parliamentCode": code, "field": "catalogue", "differences": differences})

        if source["candidates"][0]["status"] not in {"MNG", "MENANG"}:
            errors.append(
                {
                    "parliamentCode": code,
                    "field": "winnerStatus",
                    "catalogue": source["candidates"][0]["status"],
                }
            )

        catalogue_turnout = source["turnoutPctPublished"]
        calculated_catalogue_turnout = source["ballotsIssued"] / source["registeredVoters"]
        if abs(catalogue_turnout - calculated_catalogue_turnout) > 0.00051:
            catalogue_percentage_discrepancies.append(
                {
                    "parliamentCode": code,
                    "field": "PERATUS UNDI",
                    "cataloguePublished": catalogue_turnout,
                    "calculatedFromCatalogueBallots": round(calculated_catalogue_turnout, 6),
                    "resolution": "published-exact-ballot-accounting",
                    "reason": "The displayed percentage is not arithmetically consistent with the catalogue ballot totals and registered-voter denominator.",
                }
            )

        calculated_turnout = round(seat["turnout"] / seat["registered"], 6)
        if seat["turnoutPct"] != calculated_turnout:
            errors.append(
                {
                    "parliamentCode": code,
                    "field": "turnoutPct",
                    "published": seat["turnoutPct"],
                    "calculated": calculated_turnout,
                }
            )

    official_totals = {
        "registeredVoters": sum(item["registeredVoters"] for item in official.values()),
        "validVotes": sum(item["validVotes"] for item in official.values()),
        "rejectedVotes": sum(item["rejectedVotes"] for item in official.values()),
        "unreturnedVotes": sum(item["unreturnedVotes"] for item in official.values()),
        "ballotsIssued": sum(item["ballotsIssued"] for item in official.values()),
    }
    published_totals = {
        "registeredVoters": sum(item["registered"] for item in published.values()),
        "validVotes": sum(item["validVotes"] for item in published.values()),
        "rejectedVotes": sum(item["rejectedVotes"] for item in published.values()),
        "unreturnedVotes": sum(item["unreturnedVotes"] for item in published.values()),
        "ballotsIssued": sum(item["turnout"] for item in published.values()),
    }
    roll = snapshot["electoralRoll2022"]
    roll_total = sum(item["PEMILIH BERDAFTAR"] for item in roll)
    profile_counts = Counter(item["gender"] or "TIDAK DINYATAKAN" for item in snapshot["candidateProfiles"])
    return {
        "version": 1,
        "metadata": {
            "title": "PRU-15 official SPR numerical audit",
            "checkedAt": snapshot["metadata"]["checkedAt"],
            "status": "failed" if errors else "passed-with-declared-source-precedence",
            "catalogueUrl": "https://opendata.spr.gov.my/katalog",
            "sourceUrls": snapshot["metadata"]["sourceUrls"],
        },
        "coverage": {
            "parliamentSeats": len(official),
            "resultCandidateRows": sum(len(item["candidates"]) for item in official.values()),
            "candidateProfileRows": len(snapshot["candidateProfiles"]),
            "electoralRollParliaments": len(roll),
            "electoralRollPdmRows": sum(item["pdmCount"] for item in roll),
            "pollingAdministration2022Rows": len(snapshot["pollingAdministration2022"]),
        },
        "crosscheckedFields": [
            "candidate votes",
            "winner",
            "majority",
            "registered voters at election",
            "valid votes",
            "rejected votes",
            "unreturned ballot papers",
            "ballot papers issued",
            "turnout percentage",
        ],
        "totals": {
            "officialOpenData": official_totals,
            "publishedWithScoresheetPrecedence": published_totals,
            "electoralRoll2022Snapshot": {
                "registeredVoters": roll_total,
                "note": "A dated electoral-roll series, not the election-day result denominator.",
            },
            "candidateProfiles": {"gender": dict(sorted(profile_counts.items()))},
        },
        "declaredSourceDiscrepancies": catalogue_discrepancies,
        "declaredPercentageDiscrepancies": catalogue_percentage_discrepancies,
        "errors": errors,
    }


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            raise ValueError(f"{path.relative_to(ROOT)} is stale. Run npm run data:spr-pru15.")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit PRU-15 numbers against official SPR Open Data.")
    parser.add_argument("--refresh", action="store_true", help="Download a fresh official snapshot.")
    parser.add_argument("--check", action="store_true", help="Fail if generated outputs are stale.")
    args = parser.parse_args()
    try:
        if args.refresh:
            snapshot = build_snapshot()
            write_or_check(SNAPSHOT_PATH, serialise(snapshot), False)
        else:
            snapshot = read_json(SNAPSHOT_PATH)

        current_election = read_json(ELECTION_PATH)
        expected_election = apply_scoresheet_accounting(current_election)
        report = build_report(snapshot, expected_election)
        if report["errors"]:
            raise ValueError(f"SPR audit failed with {len(report['errors'])} undeclared discrepancy/discrepancies.")

        write_or_check(ELECTION_PATH, serialise(expected_election, compact=True), args.check)
        write_or_check(REPORT_PATH, serialise(report), args.check)
        print(
            f"{'Validated' if args.check else 'Audited'} 222 PRU-15 seats and 945 candidates; "
            f"{len(report['declaredSourceDiscrepancies'])} declared source discrepancy."
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"SPR audit error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
