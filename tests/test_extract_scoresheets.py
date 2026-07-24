import unittest
from pathlib import Path

from scripts.build_scoresheet_data import build_all


ROOT = Path(__file__).resolve().parents[1]


class ScoresheetExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (
            cls.source_manifest,
            cls.open_manifest,
            cls.index,
            cls.places,
            cls.results,
            cls.election,
        ) = build_all(
            ROOT / "sources/pru15/scoresheets",
            ROOT / "sources/electiondata-my/pru15",
            ROOT / "public/data/elections/pru-15/election.json",
        )

    def test_archive_coverage_and_totals(self):
        metadata = self.index["metadata"]
        self.assertEqual(metadata["sourceCount"], 58)
        self.assertEqual(metadata["coveredSeats"], 222)
        self.assertEqual(metadata["authoritativeSeats"], 56)
        self.assertEqual(metadata["supplementarySeats"], 166)
        self.assertEqual(metadata["totalPages"], 592)
        self.assertEqual(metadata["totalRows"], 39540)
        self.assertEqual(metadata["printedPollingDistrictCount"], 8259)
        self.assertEqual(metadata["syntheticPollingDistrictCount"], 19)
        self.assertEqual(metadata["ballotsInBox"], 15817156)
        self.assertEqual(metadata["validVotes"], 15613836)
        self.assertEqual(metadata["rejectedVotes"], 160333)
        self.assertEqual(metadata["unreturnedVotes"], 42987)

    def test_source_manifest_tracks_every_unique_pdf(self):
        files = self.source_manifest["files"]
        self.assertEqual(len(files), 56)
        self.assertEqual(len({item["sha256"] for item in files}), 56)
        self.assertEqual(len(self.open_manifest["files"]), 2)
        self.assertEqual(self.open_manifest["licence"], "CC0-1.0")

    def test_every_stream_balances(self):
        for result in self.results.values():
            for row in result["rows"]:
                self.assertEqual(sum(row["candidateVotes"].values()), row["validVotes"])
                self.assertEqual(
                    row["ballotsInBox"],
                    row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"],
                )

    def test_every_detailed_source_updates_its_aggregate_result(self):
        seats = {seat["code"]: seat for seat in self.election["seats"]}
        self.assertEqual(
            sum(item["status"] == "authoritative" for item in self.index["seats"]), 56
        )
        for code, result in self.results.items():
            seat = seats[code]
            self.assertEqual(seat["turnout"], result["totals"]["ballotsInBox"])
            self.assertEqual(seat["validVotes"], result["totals"]["validVotes"])
            self.assertEqual(seat["rejectedVotes"], result["totals"]["rejectedVotes"])
            self.assertEqual(seat["unreturnedVotes"], result["totals"]["unreturnedVotes"])
            self.assertEqual(
                {candidate["id"]: candidate["votes"] for candidate in seat["candidates"]},
                result["totals"]["candidateVotes"],
            )


if __name__ == "__main__":
    unittest.main()
