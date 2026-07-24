import json
import unittest
from pathlib import Path

from scripts.extract_election_boundaries import validate


ROOT = Path(__file__).resolve().parents[1]
BOUNDARY_PATH = ROOT / "public/data/boundaries/semenanjung-2018/negeri-sembilan-dun.json"


class ElectionBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = json.loads(BOUNDARY_PATH.read_text(encoding="utf-8"))

    def test_negeri_sembilan_boundary_artifact_is_complete(self):
        validate(cls_value := self.value)
        self.assertEqual(cls_value["metadata"]["featureCount"], 36)
        self.assertEqual(
            {feature["code"] for feature in cls_value["features"]},
            {f"N.{number:02d}" for number in range(1, 37)},
        )

    def test_projected_paths_and_identity_joins_are_published(self):
        for feature in self.value["features"]:
            self.assertTrue(feature["path"].startswith("M"))
            self.assertGreater(len(feature["path"]), 20)
            self.assertRegex(feature["parliamentCode"], r"^P\.\d{3}$")
            self.assertEqual(len(feature["centroid"]), 2)
        rantau = next(feature for feature in self.value["features"] if feature["code"] == "N.27")
        self.assertEqual(rantau["name"], "RANTAU")
        self.assertEqual(rantau["parliamentCode"], "P.131")

    def test_source_archive_is_content_addressed(self):
        self.assertEqual(
            self.value["metadata"]["sourceSha256"],
            "1f4084554214c1ffe7fd5f20096ca049dafcb0a58facabde8bb10ff87cc78ffc",
        )


if __name__ == "__main__":
    unittest.main()
