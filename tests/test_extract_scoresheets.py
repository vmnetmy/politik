import unittest
from pathlib import Path

from scripts.extract_scoresheets import build_artifacts


ROOT = Path(__file__).resolve().parents[1]


class ScoresheetExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_manifest, cls.index, cls.places, cls.results, cls.election = build_artifacts(
            ROOT / "sources/pru15/scoresheets",
            ROOT / "public/data/election.json",
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

    def test_scoresheets_are_the_authoritative_aggregate_source(self):
        seats = {seat["code"]: seat for seat in self.election["seats"]}
        self.assertTrue(all(item["status"] == "authoritative" for item in self.index["seats"]))
        for code, result in self.results.items():
            seat = seats[code]
            self.assertEqual(seat["turnout"], result["totals"]["validVotes"])
            self.assertEqual(
                {candidate["id"]: candidate["votes"] for candidate in seat["candidates"]},
                result["totals"]["candidateVotes"],
            )


if __name__ == "__main__":
    unittest.main()
