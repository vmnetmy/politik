import json
import unittest
from pathlib import Path

from scripts.extract_voter_roll import EDITIONS, SOURCE_FIELDS, validate_artifact


ROOT = Path(__file__).resolve().parents[1]


class VoterRollExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifacts = {
            year: json.loads((ROOT / f"public/data/elections/{election_id}/voter-roll.json").read_text(encoding="utf-8"))
            for year, election_id in EDITIONS.items()
        }

    def test_published_snapshots_pass_pipeline_validation(self):
        for year, artifact in self.artifacts.items():
            validate_artifact(artifact, year)

    def test_historical_coverage_is_complete(self):
        expected = {
            2018: {"registered": 15_033_004, "duns": 587, "pdms": 7_747},
            2022: {"registered": 21_290_400, "duns": 600, "pdms": 7_748},
        }
        for year, values in expected.items():
            artifact = self.artifacts[year]
            self.assertEqual(len(artifact["states"]), 16)
            self.assertEqual(len(artifact["parliaments"]), 222)
            self.assertEqual(len(artifact["duns"]), values["duns"])
            self.assertEqual(len(artifact["pdms"]), values["pdms"])
            self.assertEqual(artifact["national"]["registered"], values["registered"])

    def test_every_geography_level_balances(self):
        for artifact in self.artifacts.values():
            for collection in ("states", "parliaments", "duns", "pdms"):
                for record in artifact[collection]:
                    self.assertEqual(record["male"] + record["female"], record["registered"])
                    self.assertEqual(
                        sum(record[field] for field in ("ordinary", "military", "police", "overseas")),
                        record["registered"],
                    )
                    self.assertTrue(set(SOURCE_FIELDS).issubset(record))

    def test_snapshot_and_election_denominators_are_explicitly_distinct(self):
        self.assertEqual(self.artifacts[2018]["metadata"]["denominatorDifference"], 92_380)
        self.assertEqual(self.artifacts[2022]["metadata"]["denominatorDifference"], 116_762)
        for artifact in self.artifacts.values():
            metadata = artifact["metadata"]
            self.assertEqual(
                metadata["snapshotRegistered"] - metadata["electionRegistered"],
                metadata["denominatorDifference"],
            )


if __name__ == "__main__":
    unittest.main()
