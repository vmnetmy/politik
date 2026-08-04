import unittest
from pathlib import Path

from scripts.extract_pru14_dun_scoresheets import build_artifacts


ROOT = Path(__file__).resolve().parents[1]


class Pru14DunScoresheetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.index, cls.results = build_artifacts(
            ROOT / "sources/pru14/dun-scoresheets",
            ROOT / "public/data/state-elections.json",
        )

    def test_archive_is_completely_classified(self):
        metadata = self.index["metadata"]
        self.assertEqual(metadata["sourceCount"], 444)
        self.assertEqual(metadata["publishedContests"], 440)
        self.assertEqual(metadata["rejectedSourceCount"], 4)
        self.assertEqual(metadata["missingSourceCount"], 0)
        self.assertEqual(metadata["uncontestedCount"], 1)
        self.assertEqual(metadata["totalContests"], 445)
        self.assertEqual(metadata["totalRows"], 22_449)

    def test_every_published_stream_balances(self):
        for result in self.results.values():
            for row in result["rows"]:
                self.assertEqual(sum(row["candidateVotes"].values()), row["validVotes"])
                self.assertEqual(
                    row["ballotsInBox"],
                    row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"],
                )

    def test_unavailable_contests_are_explicit(self):
        unavailable = self.index["unavailableContests"]
        self.assertEqual(len(unavailable), 5)
        self.assertEqual(sum(item["category"] == "rejected-source" for item in unavailable), 4)
        self.assertEqual(sum(item["category"] == "uncontested" for item in unavailable), 1)
        self.assertEqual(len(self.manifest["rejectedSources"]), 4)


if __name__ == "__main__":
    unittest.main()
