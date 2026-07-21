import unittest
from pathlib import Path

from scripts.extract_scoresheets import build_artifacts


ROOT = Path(__file__).resolve().parents[1]


class ScoresheetExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_manifest, cls.index, cls.places, cls.reconciliation, cls.results = build_artifacts(
            ROOT / "sources/pru15/scoresheets",
            ROOT / "public/data/election.json",
            ROOT / "public/data/result-reconciliation.json",
        )

    def test_archive_coverage_and_totals(self):
        metadata = self.index["metadata"]
        self.assertEqual(metadata["sourceCount"], 56)
        self.assertEqual(metadata["totalPages"], 592)
        self.assertEqual(metadata["totalRows"], 10136)
        self.assertEqual(metadata["printedPollingDistrictCount"], 2255)
        self.assertEqual(metadata["syntheticPollingDistrictCount"], 19)
        self.assertEqual(metadata["ballotsInBox"], 4219489)
        self.assertEqual(metadata["validVotes"], 4163675)
        self.assertEqual(metadata["rejectedVotes"], 44278)
        self.assertEqual(metadata["unreturnedVotes"], 11536)

    def test_source_manifest_tracks_every_unique_pdf(self):
        files = self.source_manifest["files"]
        self.assertEqual(len(files), 56)
        self.assertEqual(len({item["sha256"] for item in files}), 56)

    def test_every_stream_balances(self):
        for result in self.results.values():
            for row in result["rows"]:
                self.assertEqual(sum(row["candidateVotes"].values()), row["validVotes"])
                self.assertEqual(
                    row["ballotsInBox"],
                    row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"],
                )

    def test_known_conflicts_are_governed(self):
        self.assertEqual(
            [item["parliamentCode"] for item in self.reconciliation["conflicts"]],
            ["P.028", "P.062", "P.072", "P.087", "P.101", "P.128", "P.175"],
        )
        self.assertTrue(all(item["decision"] in {"pending", "approved", "rejected"} for item in self.reconciliation["conflicts"]))


if __name__ == "__main__":
    unittest.main()
