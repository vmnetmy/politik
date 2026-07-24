import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("audit_spr_pru15", ROOT / "scripts/audit_spr_pru15.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SprPru15AuditTests(unittest.TestCase):
    def test_official_snapshot_has_complete_pru15_coverage(self):
        snapshot = json.loads(MODULE.SNAPSHOT_PATH.read_text(encoding="utf-8"))
        self.assertEqual(len(snapshot["results"]), 222)
        self.assertEqual(sum(len(seat["candidates"]) for seat in snapshot["results"]), 945)
        self.assertEqual(len(snapshot["candidateProfiles"]), 945)
        self.assertEqual(len(snapshot["electoralRoll2022"]), 222)

    def test_published_accounting_passes_with_one_declared_source_conflict(self):
        snapshot = json.loads(MODULE.SNAPSHOT_PATH.read_text(encoding="utf-8"))
        election = json.loads(MODULE.ELECTION_PATH.read_text(encoding="utf-8"))
        expected = MODULE.apply_scoresheet_accounting(election)
        report = MODULE.build_report(snapshot, expected)
        self.assertEqual(report["errors"], [])
        self.assertEqual(report["metadata"]["status"], "passed-with-declared-source-precedence")
        self.assertEqual([item["parliamentCode"] for item in report["declaredSourceDiscrepancies"]], ["P.028"])

    def test_every_published_seat_balances_ballot_accounting(self):
        election = json.loads(MODULE.ELECTION_PATH.read_text(encoding="utf-8"))
        for seat in election["seats"]:
            self.assertEqual(sum(candidate["votes"] for candidate in seat["candidates"]), seat["validVotes"])
            self.assertEqual(seat["validVotes"] + seat["rejectedVotes"] + seat["unreturnedVotes"], seat["turnout"])
            self.assertEqual(round(seat["turnout"] / seat["registered"], 6), seat["turnoutPct"])


if __name__ == "__main__":
    unittest.main()
