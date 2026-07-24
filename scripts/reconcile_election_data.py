#!/usr/bin/env python3
"""Reconcile every published election read model and emit a release report."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "public/data/elections/index.json"
STATE_PATH = ROOT / "public/data/state-elections.json"
OUTPUT_PATH = ROOT / "public/data/reports/latest.json"


def issue(
    issues: list[dict[str, Any]],
    severity: str,
    rule_id: str,
    message: str,
    election_id: str | None = None,
    code: str | None = None,
    **details: Any,
) -> None:
    issues.append(
        {
            "severity": severity,
            "ruleId": rule_id,
            "message": message,
            "electionId": election_id,
            "constituencyCode": code,
            "details": details,
        }
    )


def near(left: float | None, right: float | None, tolerance: float = 0.000002) -> bool:
    return left is not None and right is not None and math.isclose(left, right, abs_tol=tolerance)


def reconcile_federal(edition: dict[str, Any], issues: list[dict[str, Any]]) -> dict[str, Any]:
    path = ROOT / "public/data" / edition["path"] / "election.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    election_id = edition["id"]
    seats = data.get("seats", [])
    metadata = data.get("metadata", {})
    codes = [seat.get("code") for seat in seats]
    if len(codes) != len(set(codes)):
        issue(issues, "error", "duplicate-seat-code", "Kod Parlimen berulang.", election_id)
    if metadata.get("seatCount") != len(seats):
        issue(issues, "error", "seat-count", "Jumlah kerusi metadata tidak sepadan.", election_id, expected=metadata.get("seatCount"), actual=len(seats))
    if metadata.get("boundaryVersion") != edition.get("boundaryVersion"):
        issue(issues, "error", "boundary-version", "Versi sempadan dataset tidak sepadan dengan katalog.", election_id, dataset=metadata.get("boundaryVersion"), registry=edition.get("boundaryVersion"))

    total_registered = total_turnout = total_valid = 0
    scoresheet_matches = 0
    ballot_component_seats = 0
    for seat in seats:
        code = seat.get("code")
        candidates = seat.get("candidates", [])
        candidate_votes = [int(candidate.get("votes", 0)) for candidate in candidates]
        valid = sum(candidate_votes)
        total_registered += int(seat.get("registered", 0))
        total_turnout += int(seat.get("turnout", 0))
        total_valid += valid
        if seat.get("candidateCount") != len(candidates):
            issue(issues, "error", "candidate-count", "Jumlah calon tidak sepadan.", election_id, code)
        has_ballot_components = all(seat.get(key) is not None for key in ("validVotes", "rejectedVotes", "unreturnedVotes"))
        if seat.get("validVotes") is not None and seat.get("validVotes") != valid:
            issue(issues, "error", "valid-votes", "Jumlah undi calon tidak sepadan dengan undi sah.", election_id, code, candidates=valid, published=seat.get("validVotes"))
        ordered = sorted(candidates, key=lambda item: int(item.get("votes", 0)), reverse=True)
        if ordered:
            winner = seat.get("winner", {})
            expected_margin = int(ordered[0].get("votes", 0)) - int(ordered[1].get("votes", 0)) if len(ordered) > 1 else int(ordered[0].get("votes", 0))
            if winner.get("id") != ordered[0].get("id") or winner.get("votes") != ordered[0].get("votes"):
                issue(issues, "error", "winner", "Pemenang bukan calon dengan undi tertinggi.", election_id, code)
            if seat.get("marginVotes") != expected_margin:
                issue(issues, "error", "majority", "Majoriti tidak sepadan dengan dua calon teratas.", election_id, code, expected=expected_margin, published=seat.get("marginVotes"))
            for candidate in candidates:
                expected_share = candidate.get("votes", 0) / valid if valid else 0
                if not near(candidate.get("share"), expected_share):
                    issue(issues, "warning", "candidate-share", "Bahagian undi calon di luar toleransi.", election_id, code, candidate=candidate.get("name"))
        if has_ballot_components:
            ballot_component_seats += 1
            ballot_total = int(seat["validVotes"]) + int(seat["rejectedVotes"]) + int(seat["unreturnedVotes"])
            if ballot_total != seat.get("turnout"):
                issue(issues, "error", "turnout-components", "Komponen kertas undi tidak sepadan dengan keluar mengundi.", election_id, code, expected=ballot_total, published=seat.get("turnout"))
            expected_turnout = seat.get("turnout", 0) / seat.get("registered", 1) if seat.get("registered") else 0
            if not near(seat.get("turnoutPct"), expected_turnout):
                issue(issues, "warning", "turnout-pct", "Peratus keluar mengundi di luar toleransi.", election_id, code)

        scoresheet_path = path.parent / "scoresheets" / f"{code}.json"
        if scoresheet_path.exists():
            scoresheet = json.loads(scoresheet_path.read_text(encoding="utf-8"))
            totals = scoresheet.get("totals", {})
            mismatches = {
                "registered": (scoresheet.get("registeredVoters"), seat.get("registered")),
                "turnout": (totals.get("ballotsInBox"), seat.get("turnout")),
                "valid": (totals.get("validVotes"), seat.get("validVotes")),
                "rejected": (totals.get("rejectedVotes"), seat.get("rejectedVotes")),
                "unreturned": (totals.get("unreturnedVotes"), seat.get("unreturnedVotes")),
            }
            different = {key: values for key, values in mismatches.items() if values[0] != values[1]}
            if different:
                issue(issues, "error", "scoresheet-headline", "Jumlah scoresheet tidak sepadan dengan keputusan akhir.", election_id, code, mismatches=different)
            else:
                scoresheet_matches += 1

    return {
        "electionId": election_id,
        "seats": len(seats),
        "candidates": sum(len(seat.get("candidates", [])) for seat in seats),
        "registered": total_registered,
        "turnout": total_turnout,
        "validVotes": total_valid,
        "scoresheetMatches": scoresheet_matches,
        "ballotComponentSeats": ballot_component_seats,
    }


def reconcile_state(issues: list[dict[str, Any]]) -> dict[str, Any]:
    data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    events = {event["id"]: event for event in data.get("events", [])}
    contests = data.get("contests", [])
    seen: set[tuple[str, str]] = set()
    for contest in contests:
        identity = (contest.get("eventId", ""), contest.get("dunId", ""))
        if identity in seen:
            issue(issues, "error", "duplicate-dun-contest", "Keputusan DUN berulang.", contest.get("eventId"), contest.get("dunCode"))
        seen.add(identity)
        candidates = contest.get("candidates", [])
        if candidates:
            ordered = sorted(candidates, key=lambda item: int(item.get("votes", 0)), reverse=True)
            expected = int(ordered[0].get("votes", 0)) - int(ordered[1].get("votes", 0)) if len(ordered) > 1 else int(ordered[0].get("votes", 0))
            if contest.get("majorityVotes") != expected:
                issue(issues, "error", "state-majority", "Majoriti DUN tidak sepadan.", contest.get("eventId"), contest.get("dunCode"), expected=expected, published=contest.get("majorityVotes"))
    unknown = sorted({contest.get("eventId") for contest in contests if contest.get("eventId") not in events})
    for event_id in unknown:
        issue(issues, "error", "unknown-state-event", "Keputusan merujuk acara PRN yang tidak didaftarkan.", event_id)
    return {"events": len(events), "contests": len(contests)}


def build() -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    issues: list[dict[str, Any]] = []
    federal = [reconcile_federal(edition, issues) for edition in registry.get("elections", [])]
    state = reconcile_state(issues)
    counts = {severity: sum(item["severity"] == severity for item in issues) for severity in ("error", "warning", "info")}
    status = "failed" if counts["error"] else "warning" if counts["warning"] else "passed"
    completed = datetime.now(timezone.utc)
    return {
        "version": 1,
        "releaseId": f"data-{completed.date().isoformat()}",
        "status": status,
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "completedAt": completed.isoformat().replace("+00:00", "Z"),
        "summary": {"federal": federal, "state": state, "issueCounts": counts},
        "issues": issues,
    }


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--strict-warnings", action="store_true")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()
    try:
        report = build()
        rendered = render(report)
        if args.check:
            existing = json.loads(args.output.read_text(encoding="utf-8"))
            comparable_existing = {key: value for key, value in existing.items() if key not in {"startedAt", "completedAt", "releaseId"}}
            comparable_current = {key: value for key, value in report.items() if key not in {"startedAt", "completedAt", "releaseId"}}
            if comparable_existing != comparable_current:
                raise ValueError("Reconciliation report is stale. Run npm run data:reconcile.")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf-8")
            print(f"Wrote {args.output}.")
        if report["status"] == "failed" or args.strict_warnings and report["status"] == "warning":
            print(json.dumps(report["summary"]["issueCounts"]), file=sys.stderr)
            return 1
        print(f"Election reconciliation {report['status']}: {report['summary']['issueCounts']}.")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
