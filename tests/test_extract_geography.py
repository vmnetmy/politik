import json
import tempfile
import unittest
from pathlib import Path

from scripts.extract_geography import build, compact


ROOT = Path(__file__).resolve().parents[1]


class GeographyExtractionTests(unittest.TestCase):
    def setUp(self):
        self.value = build(
            ROOT / "sources/spr/geography",
            ROOT / "public/data/elections/pru-15/constituencies.json",
            ROOT / "public/data/elections/pru-15/polling-places.json",
        )

    def test_builds_complete_official_hierarchy(self):
        self.assertEqual(self.value["metadata"]["stateCount"], 16)
        self.assertEqual(self.value["metadata"]["parliamentCount"], 222)
        self.assertEqual(self.value["metadata"]["dunCount"], 600)
        self.assertEqual(len(self.value["pdms"]), 7748)
        self.assertEqual(len({item["id"] for item in self.value["pdms"]}), 7748)

    def test_scoresheet_and_locality_joins_are_stable(self):
        by_id = {item["id"]: item for item in self.value["pdms"]}
        self.assertEqual(self.value["metadata"]["scoresheetPdmCount"], 7747)
        self.assertTrue(by_id["P.028:028/30/04"]["hasScoresheet"])
        self.assertEqual(len(by_id["P.028:028/30/04"]["localityIds"]), 7)
        self.assertEqual(len(by_id["P.028:028/30/09"]["localityIds"]), 6)

    def test_published_file_is_reproducible(self):
        published = (ROOT / "public/data/elections/pru-15/geography.json").read_text(encoding="utf-8")
        self.assertEqual(compact(self.value), published)


if __name__ == "__main__":
    unittest.main()
