import unittest
from pathlib import Path

from scripts.audit_spr_pru14 import build, render


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/elections/pru-14/spr-audit.json"


class SprPru14AuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = build(ROOT)

    def test_audit_passes_with_declared_gaps(self):
        self.assertEqual(self.value["status"], "passed-with-declared-gaps-and-source-precedence")
        self.assertTrue(all(item["status"] == "passed" for item in self.value["checks"]))
        self.assertEqual(self.value["coverage"]["publishedSeats"], 180)
        self.assertEqual(self.value["coverage"]["dun"]["publishedContests"], 495)
        self.assertEqual(self.value["coverage"]["dun"]["sabahAssembly15"]["publishedContests"], 55)

    def test_published_report_is_reproducible(self):
        self.assertEqual(render(self.value), OUTPUT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
