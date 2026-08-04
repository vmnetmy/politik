import unittest
from pathlib import Path

from scripts.extract_pru14_sabah_scoresheets import build_artifacts


ROOT = Path(__file__).resolve().parents[1]


class Pru14SabahScoresheetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.index, cls.results = build_artifacts(
            ROOT / "sources/pru14/sabah-assembly-15-scoresheets",
            ROOT / "public/data/state-elections.json",
        )

    def test_all_sixty_workbooks_are_classified(self):
        metadata = self.index["metadata"]
        self.assertEqual(metadata["sourceCount"], 60)
        self.assertEqual(metadata["publishedContests"], 55)
        self.assertEqual(metadata["rejectedSourceCount"], 5)
        self.assertEqual(metadata["missingSourceCount"], 0)
        self.assertEqual(metadata["totalContests"], 60)
        self.assertEqual(metadata["totalRows"], 2_100)

    def test_every_published_stream_balances(self):
        for result in self.results.values():
            for row in result["rows"]:
                self.assertEqual(sum(row["candidateVotes"].values()), row["validVotes"])
                self.assertEqual(row["ballotsInBox"], row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"])

    def test_rejected_workbooks_are_explicit(self):
        self.assertEqual(len(self.manifest["rejectedSources"]), 5)
        self.assertEqual(len(self.index["unavailableContests"]), 5)
        self.assertTrue(all(item["category"] == "rejected-source" for item in self.index["unavailableContests"]))


if __name__ == "__main__":
    unittest.main()
