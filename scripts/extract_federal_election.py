#!/usr/bin/env python3
"""Build a governed parliamentary-election snapshot from archived result sources."""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS = ROOT / "sources/spr/state-elections/keputusan-pru.json"
DEFAULT_CANDIDATES = ROOT / "sources/spr/federal-elections/maklumat-calon-pr.json"
DEFAULT_STATS = ROOT / "sources/meco/headline-stats-federal.csv"
DEFAULT_BALLOTS = ROOT / "sources/meco/headline-ballots-federal.csv"
DEFAULT_PERSONS = ROOT / "public/data/reference/persons.json"
DEFAULT_MATCHES = ROOT / "public/data/reference/person-matches.json"

ELECTIONS = {
    14: {
        "year": "2018",
        "corpusElection": "GE-14",
        "date": "2018-05-09",
        "title": "Pilihan Raya Umum Malaysia ke-14",
        "boundaryVersion": "my-sarawak-2015-peninsula-2018-sabah-2019",
        "expectedSeats": 222,
        "expectedCandidates": 687,
        "expectedRegistered": 14_940_624,
    },
}

ALLIANCES = {
    "PH": ("PAKATAN HARAPAN (PH)", "PH", "#dc4b43"),
    "BN": ("BARISAN NASIONAL (BN)", "BN", "#245c9f"),
    "GS": ("GAGASAN SEJAHTERA (GS)", "GS", "#16806d"),
    "USA": ("UNITED SABAH ALLIANCE (USA)", "USA", "#a47f35"),
    "ALONE": ("LAIN-LAIN / BEBAS", "LAIN-LAIN", "#7b8580"),
}

PARTIES = {
    "AMANAH": "PARTI AMANAH NEGARA (AMANAH)",
    "ANAK-NEGERI": "PARTI KERJASAMA ANAK NEGERI (ANAK NEGERI)",
    "BEBAS": "BEBAS",
    "BERJASA": "BERJASA",
    "BERSATU": "PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)",
    "DAP": "DEMOCRATIC ACTION PARTY (DAP)",
    "GERAKAN": "PARTI GERAKAN RAKYAT MALAYSIA (GERAKAN)",
    "HR": "PARTI HARAPAN RAKYAT SABAH (HARAPAN RAKYAT)",
    "IKATAN": "PARTI IKATAN BANGSA MALAYSIA (IKATAN)",
    "LDP": "LIBERAL DEMOCRATIC PARTY (LDP)",
    "MCA": "MALAYSIAN CHINESE ASSOCIATION (MCA)",
    "MIC": "MALAYSIAN INDIAN CONGRESS (MIC)",
    "MUP": "MALAYSIA UNITED PEOPLE PARTY (MUP)",
    "MYPPP": "MYPPP",
    "PAP": "PEOPLE'S ALTERNATIVE PARTY (PAP)",
    "PAS": "PARTI ISLAM SE-MALAYSIA (PAS)",
    "PBB": "PARTI PESAKA BUMIPUTERA BERSATU SARAWAK (PBB)",
    "PBDSB": "PARTI BANSA DAYAK SARAWAK (PBDS)",
    "PBK": "PARTI BUMI KENYALANG (PBK)",
    "PBRS": "PARTI BERSATU RAKYAT SABAH (PBRS)",
    "PBS": "PARTI BERSATU SABAH (PBS)",
    "PCM": "PARTI CINTA MALAYSIA (PCM)",
    "PCS": "PARTI CINTA SABAH (PCS)",
    "PDP": "PROGRESSIVE DEMOCRATIC PARTI (PDP)",
    "PEACE": "PARTI DAMAI SABAH (PEACE)",
    "PFP": "PENANG FRONT PARTY (PFP)",
    "PKR": "PARTI KEADILAN RAKYAT (PKR)",
    "PPRS": "PARTI PERPADUAN RAKYAT SABAH (PPRS)",
    "PRM": "PARTI RAKYAT MALAYSIA (PRM)",
    "PRS": "PARTI RAKYAT SARAWAK (PRS)",
    "PSM": "PARTI SOSIALIS MALAYSIA (PSM)",
    "SAPP": "SABAH PROGRESSIVE PARTY (SAPP)",
    "STAR": "PARTI SOLIDARITI TANAH AIRKU (STARSABAH)",
    "SUPP": "SARAWAK UNITED PEOPLES' PARTY (SUPP)",
    "UMNO": "UNITED MALAY NATIONAL ORGANIZATION (UMNO)",
    "UPKO": "UNITED PROGRESSIVE KINABALU ORGANISATION (UPKO)",
    "WARISAN": "PARTI WARISAN SABAH (WARISAN)",
}

ETHNICITIES = {
    "Malay": "MELAYU",
    "Chinese": "CINA",
    "Indian": "INDIA",
    "Bumi Sabah": "BUMIPUTERA SABAH",
    "Bumi Sarawak": "BUMIPUTERA SARAWAK",
    "Other": "LAIN-LAIN",
}


def normalise_name(value: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", ascii_name.lower()).strip()


def slug(value: str) -> str:
    return normalise_name(value).replace(" ", "-")


def split_seat(value: str) -> tuple[str, str]:
    match = re.match(r"^(P\.\d{3})\s+(.+)$", value.strip())
    if not match:
        raise ValueError(f"Invalid parliamentary seat: {value!r}")
    return match.group(1), match.group(2).strip().upper()


def load_json(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"{path} must contain a JSON array.")
    return value


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def person_lookups(persons_path: Path, matches_path: Path) -> tuple[dict[str, set[str]], dict[tuple[str, str, str], str]]:
    by_name: dict[str, set[str]] = defaultdict(set)
    if persons_path.exists():
        registry = json.loads(persons_path.read_text(encoding="utf-8"))
        for person in registry.get("persons", []):
            for name in [person.get("canonicalName", ""), *person.get("aliases", [])]:
                if name:
                    by_name[normalise_name(name)].add(person["id"])
    explicit: dict[tuple[str, str, str], str] = {}
    if matches_path.exists():
        matches = json.loads(matches_path.read_text(encoding="utf-8"))
        for match in matches.get("matches", []):
            explicit[(match["electionId"], match["seatCode"], normalise_name(match["candidateName"]))] = match["personId"]
    return by_name, explicit


def match_supporting_ballot(result: dict[str, Any], candidates: list[dict[str, str]]) -> dict[str, str]:
    votes = int(result["BILANGAN UNDI"])
    exact_votes = [candidate for candidate in candidates if int(candidate["votes"]) == votes]
    if len(exact_votes) == 1:
        return exact_votes[0]
    target = normalise_name(result["NAMA ATAS KERTAS UNDI"])
    ranked = sorted(
        candidates,
        key=lambda candidate: max(
            SequenceMatcher(None, target, normalise_name(candidate["name_on_ballot"])).ratio(),
            SequenceMatcher(None, target, normalise_name(candidate["name"])).ratio(),
        ),
        reverse=True,
    )
    if not ranked:
        raise ValueError(f"No supporting ballot for {result['PARLIMEN']} / {result['NAMA ATAS KERTAS UNDI']}")
    return ranked[0]


def build(
    election_number: int,
    results_path: Path = DEFAULT_RESULTS,
    candidates_path: Path = DEFAULT_CANDIDATES,
    stats_path: Path = DEFAULT_STATS,
    ballots_path: Path = DEFAULT_BALLOTS,
    persons_path: Path = DEFAULT_PERSONS,
    matches_path: Path = DEFAULT_MATCHES,
) -> dict[str, Any]:
    config = ELECTIONS.get(election_number)
    if not config:
        raise ValueError(f"Unsupported election: PRU-{election_number}")
    election_id = f"pru-{election_number}"
    year = config["year"]
    corpus_election = config["corpusElection"]

    result_rows = [
        row for row in load_json(results_path)
        if str(row.get("TAHUN PILIHAN RAYA")) == year and row.get("JenisCalon") == "Parlimen"
    ]
    candidate_rows = [
        row for row in load_json(candidates_path)
        if str(row.get("TAHUN PILIHAN RAYA")) == year
        and row.get("JenisPilihanraya") == "PRU"
        and str(row.get("PARLIMEN", "")).startswith("P.")
        and str(row.get("DEWAN UNDANGAN NEGERI", "")).strip() == "-"
    ]
    stats_rows = [row for row in load_csv(stats_path) if row.get("election") == corpus_election]
    ballot_rows = [row for row in load_csv(ballots_path) if row.get("election") == corpus_election]

    official_candidates = {
        (split_seat(row["PARLIMEN"])[0], normalise_name(row["NAMA KERTAS UNDI"])): row
        for row in candidate_rows
    }
    stats_by_seat = {split_seat(row["seat"])[0]: row for row in stats_rows}
    ballots_by_seat: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in ballot_rows:
        ballots_by_seat[split_seat(row["seat"])[0]].append(row)
    grouped_results: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in result_rows:
        grouped_results[split_seat(row["PARLIMEN"])[0]].append(row)

    if len(grouped_results) != config["expectedSeats"]:
        raise ValueError(f"Expected {config['expectedSeats']} seats, found {len(grouped_results)}")
    if len(result_rows) != config["expectedCandidates"]:
        raise ValueError(f"Expected {config['expectedCandidates']} candidates, found {len(result_rows)}")
    if set(grouped_results) != set(stats_by_seat) or set(grouped_results) != set(ballots_by_seat):
        raise ValueError("Result, statistics and ballot sources do not cover the same parliamentary seats.")

    people_by_name, explicit_matches = person_lookups(persons_path, matches_path)
    full_name_counts = Counter(
        slug(row["NAMA PENUH CALON"])
        for row in candidate_rows
    )
    seats: list[dict[str, Any]] = []

    for code in sorted(grouped_results, key=lambda value: int(value.split(".")[1])):
        rows = grouped_results[code]
        _, seat_name = split_seat(rows[0]["PARLIMEN"])
        stats = stats_by_seat[code]
        supporting_rows = ballots_by_seat[code]
        candidates: list[dict[str, Any]] = []
        winner_source: dict[str, Any] | None = None

        for row in rows:
            official = official_candidates.get((code, normalise_name(row["NAMA ATAS KERTAS UNDI"])))
            if official is None:
                raise ValueError(f"No official candidate profile for {code} / {row['NAMA ATAS KERTAS UNDI']}")
            supporting = match_supporting_ballot(row, supporting_rows)
            coalition = supporting["coalition"]
            if coalition not in ALLIANCES:
                raise ValueError(f"Unknown coalition {coalition!r} for {code}")
            party_code = supporting["party"]
            party = PARTIES.get(party_code, party_code)
            alliance = ALLIANCES[coalition][0]
            display_name = str(row["NAMA ATAS KERTAS UNDI"]).strip().upper()
            full_name = str(official["NAMA PENUH CALON"]).strip().upper()
            possible_ids: set[str] = set()
            for candidate_name in {display_name, full_name, supporting["name"], supporting["name_on_ballot"]}:
                possible_ids.update(people_by_name.get(normalise_name(candidate_name), set()))
            explicit_id = explicit_matches.get((election_id, code, normalise_name(display_name)))
            person_slug = slug(full_name)
            suffix = f":{code.lower().replace('.', '')}" if full_name_counts[person_slug] > 1 else ""
            person_id = explicit_id or (next(iter(possible_ids)) if len(possible_ids) == 1 else f"person:{person_slug}{suffix}")
            candidate = {
                "id": f"{code.lower().replace('.', '')}:{slug(display_name)}",
                "name": display_name,
                "alliance": alliance,
                "party": party,
                "votes": int(row["BILANGAN UNDI"]),
                "share": 0.0,
                "personId": person_id,
                "gender": "PEREMPUAN" if official["JANTINA"] == "PEREMPUAN" else "LELAKI",
                "ethnicity": ETHNICITIES.get(supporting["ethnicity"], "TIDAK DINYATAKAN"),
            }
            candidates.append(candidate)
            if row["StatusCalon"] == "MNG":
                if winner_source is not None:
                    raise ValueError(f"Multiple winners for {code}")
                winner_source = candidate

        candidates.sort(key=lambda item: (-item["votes"], item["name"]))
        valid_votes = sum(candidate["votes"] for candidate in candidates)
        for index, candidate in enumerate(candidates, start=1):
            candidate["share"] = round(candidate["votes"] / valid_votes, 6) if valid_votes else 0
            candidate["electionId"] = election_id
            candidate["candidacyId"] = f"{election_id}:{code}:{index:02d}"
        if winner_source is None:
            raise ValueError(f"No winner for {code}")
        winner = next(candidate for candidate in candidates if candidate["id"] == winner_source["id"])
        runner_up = next((candidate for candidate in candidates if candidate["id"] != winner["id"]), None)
        registered = int(stats["voters_total"])
        turnout_pct = float(stats["voter_turnout"]) / 100
        seats.append({
            "code": code,
            "state": str(rows[0]["NEGERI"]).strip().upper(),
            "name": seat_name,
            "registered": registered,
            "turnout": valid_votes,
            "turnoutPct": round(turnout_pct, 6),
            "candidateCount": len(candidates),
            "marginVotes": winner["votes"] - (runner_up["votes"] if runner_up else 0),
            "marginShare": round(winner["share"] - (runner_up["share"] if runner_up else 0), 6),
            "winner": {key: value for key, value in winner.items() if key not in {"gender", "ethnicity"}} | {
                "gender": winner["gender"],
                "ethnicity": winner["ethnicity"],
            },
            "candidates": [
                {key: value for key, value in candidate.items() if key not in {"gender", "ethnicity"}}
                for candidate in candidates
            ],
            "electionId": election_id,
            "contestId": f"{election_id}:{code}",
        })

    if sum(seat["registered"] for seat in seats) != config["expectedRegistered"]:
        raise ValueError("Registered-voter total does not reconcile with the PRU-14 electoral roll.")
    winner_counts = Counter(seat["winner"]["alliance"] for seat in seats)
    expected_winners = {
        "PAKATAN HARAPAN (PH)": 113,
        "BARISAN NASIONAL (BN)": 79,
        "GAGASAN SEJAHTERA (GS)": 18,
        "LAIN-LAIN / BEBAS": 11,
        "UNITED SABAH ALLIANCE (USA)": 1,
    }
    if dict(winner_counts) != expected_winners:
        raise ValueError(f"PRU-14 alliance result does not reconcile: {dict(winner_counts)}")

    alliances = [
        {"name": name, "shortName": short_name, "color": color}
        for name, short_name, color in ALLIANCES.values()
    ]
    return {
        "metadata": {
            "title": config["title"],
            "shortTitle": f"PRU-{election_number}",
            "electionDate": config["date"],
            "sourceFile": results_path.name,
            "seatCount": len(seats),
            "candidateCount": sum(seat["candidateCount"] for seat in seats),
            "stateCount": len({seat["state"] for seat in seats}),
            "issues": [],
            "electionId": election_id,
            "electionNumber": election_number,
            "termId": f"dr-{election_number}",
            "boundaryVersion": config["boundaryVersion"],
        },
        "alliances": alliances,
        "seats": seats,
    }


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a namespaced federal election dataset.")
    parser.add_argument("--election-number", type=int, default=14)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--stats", type=Path, default=DEFAULT_STATS)
    parser.add_argument("--ballots", type=Path, default=DEFAULT_BALLOTS)
    parser.add_argument("--persons", type=Path, default=DEFAULT_PERSONS)
    parser.add_argument("--person-matches", type=Path, default=DEFAULT_MATCHES)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = args.output or ROOT / f"public/data/elections/pru-{args.election_number}/election.json"
    content = render(build(
        args.election_number,
        args.results,
        args.candidates,
        args.stats,
        args.ballots,
        args.persons,
        args.person_matches,
    ))
    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != content:
            raise SystemExit(f"{output} is stale. Run npm run data:federal-elections.")
        print(f"Validated {output}.")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")
    print(f"Wrote {output}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
