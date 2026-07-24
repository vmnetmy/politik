import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reconcile_election_data.py"
SPEC = importlib.util.spec_from_file_location("reconcile_election_data", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReconciliationTests(unittest.TestCase):
    def test_all_published_elections_reconcile_without_errors(self):
        report = MODULE.build()
        self.assertEqual(report["summary"]["issueCounts"]["error"], 0)
        self.assertEqual(report["status"], "passed")
        editions = report["summary"]["federal"]
        self.assertEqual({item["electionId"] for item in editions}, {"pru-14", "pru-15"})
        self.assertEqual(next(item for item in editions if item["electionId"] == "pru-15")["scoresheetMatches"], 222)


if __name__ == "__main__":
    unittest.main()
