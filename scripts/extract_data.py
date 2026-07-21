#!/usr/bin/env python3
"""Normalize the Numbers-exported PRU-15 workbook for the web dashboard.

Usage:
    python3 scripts/extract_data.py /path/to/pru15.xlsx public/data/election.json
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


ALLIANCES = {
    "PAKATAN HARAPAN (PH)": ("PH", "#dc4b43"),
    "PERIKATAN NASIONAL (PN)": ("PN", "#186a58"),
    "BARISAN NASIONAL (BN)": ("BN", "#245c9f"),
    "GABUNGAN PARTI SARAWAK (GPS)": ("GPS", "#e1a72b"),
    "PARTI GABUNGAN RAKYAT SABAH (GRS)": ("GRS", "#65a7ba"),
    "PARTI PEJUANG TANAHAIR (PEJUANG)": ("PEJUANG", "#8b744f"),
    "PARTI BUMIPUTERA PERKASA MALAYSIA (PUTRA)": ("PUTRA", "#8c5899"),
    "LAIN-LAIN / BEBAS": ("LAIN-LAIN", "#7b8580"),
}

# Source workbook rows disagree for this seat. The SPR age-by-DUN report and
# the confirmed constituency total both record 43,072 registered voters.
REGISTERED_VOTER_CORRECTIONS = {
    "P.201": 43_072,
}


def clean(value):
    return value.strip() if isinstance(value, str) else value


def alliance_name(value):
    value = clean(value)
    return value if value else "LAIN-LAIN / BEBAS"


def round_fraction(value):
    return round(float(value or 0), 6)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected input .xlsx and output .json paths")

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    workbook = load_workbook(input_path, read_only=True, data_only=True)

    results_sheet = workbook["ALL RESULT - Table 1"]
    winner_sheet = workbook["WINNERS"]

    result_rows = [
        tuple(clean(cell) for cell in row)
        for row in results_sheet.iter_rows(min_row=2, values_only=True)
        if row[1]
    ]
    winner_rows = [
        tuple(clean(cell) for cell in row)
        for row in winner_sheet.iter_rows(min_row=2, values_only=True)
        if row[1]
    ]

    winners = {row[1]: row for row in winner_rows}
    grouped = defaultdict(list)
    for row in result_rows:
        grouped[row[1]].append(row)

    seats = []
    issues = []
    for code in sorted(grouped, key=lambda item: int(item.split(".")[1])):
        rows = grouped[code]
        winner_row = winners.get(code)
        if winner_row is None:
            raise ValueError(f"No winner row for {code}")

        winner_candidate = winner_row[3]
        source_winner = next((row for row in rows if row[3] == winner_candidate), None)
        if source_winner is None:
            source_winner = max(rows, key=lambda row: row[8] or 0)

        registered_values = sorted({int(row[6]) for row in rows if row[6] is not None})
        turnout_values = sorted({int(row[7]) for row in rows if row[7] is not None})
        if (len(registered_values) > 1 or len(turnout_values) > 1) and code not in REGISTERED_VOTER_CORRECTIONS:
            issues.append(
                {
                    "seat": code,
                    "field": "registeredVoters",
                    "message": (
                        "Rekod calon mempunyai jumlah pemilih berdaftar yang bercanggah "
                        f"({', '.join(map(str, registered_values))}). Nilai pada rekod pemenang digunakan."
                    ),
                }
            )

        candidates = sorted(
            [
                {
                    "name": row[3],
                    "alliance": alliance_name(row[4]),
                    "party": row[5] or "TIDAK DINYATAKAN",
                    "votes": int(row[8] or 0),
                    "share": round_fraction(row[9]),
                }
                for row in rows
            ],
            key=lambda item: item["votes"],
            reverse=True,
        )

        runner_up = candidates[1] if len(candidates) > 1 else None
        winner = candidates[0]
        registered = REGISTERED_VOTER_CORRECTIONS.get(code, int(source_winner[6] or 0))
        turnout = int(source_winner[7] or 0)
        seats.append(
            {
                "code": code,
                "state": rows[0][0],
                "name": rows[0][2],
                "registered": registered,
                "turnout": turnout,
                "turnoutPct": round_fraction(turnout / registered if registered else 0),
                "candidateCount": len(candidates),
                "marginVotes": winner["votes"] - (runner_up["votes"] if runner_up else 0),
                "marginShare": round_fraction(
                    winner["share"] - (runner_up["share"] if runner_up else 0)
                ),
                "winner": {
                    **winner,
                    "gender": winner_row[4] or "TIDAK DINYATAKAN",
                    "ethnicity": winner_row[5] or "TIDAK DINYATAKAN",
                },
                "candidates": candidates,
            }
        )

    if len(seats) != 222:
        raise ValueError(f"Expected 222 seats, found {len(seats)}")
    if sum(len(seat["candidates"]) for seat in seats) != 945:
        raise ValueError("Candidate count does not reconcile to the source workbook")

    alliances = [
        {"name": name, "shortName": short_name, "color": color}
        for name, (short_name, color) in ALLIANCES.items()
    ]
    payload = {
        "metadata": {
            "title": "Pilihan Raya Umum Malaysia ke-15",
            "shortTitle": "PRU-15",
            "electionDate": "2022-11-19",
            "sourceFile": "DATA & STATISTIK PRU-15.numbers",
            "seatCount": len(seats),
            "candidateCount": sum(len(seat["candidates"]) for seat in seats),
            "stateCount": len({seat["state"] for seat in seats}),
            "issues": issues,
        },
        "alliances": alliances,
        "seats": seats,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"Wrote {len(seats)} seats / {payload['metadata']['candidateCount']} candidates "
        f"to {output_path}"
    )


if __name__ == "__main__":
    main()
