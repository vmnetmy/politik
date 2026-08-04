import unittest
from pathlib import Path

from scripts.extract_pru14_scoresheets import build_artifacts


ROOT = Path(__file__).resolve().parents[1]


class Pru14ScoresheetExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (
            cls.manifest,
            cls.index,
            cls.places,
            cls.results,
            cls.election,
        ) = build_artifacts(
            ROOT / "sources/pru14/scoresheets",
            ROOT / "public/data/elections/pru-14/election.json",
        )

    def test_only_fully_reconciled_workbooks_are_published(self):
        metadata = self.index["metadata"]
        self.assertEqual(metadata["sourceCount"], 190)
        self.assertEqual(metadata["officialScoresheetCount"], 180)
        self.assertEqual(metadata["rejectedSourceCount"], 10)
        self.assertEqual(metadata["coveredSeats"], 180)
        self.assertEqual(metadata["totalSeats"], 222)
        self.assertEqual(metadata["totalRows"], 24_814)
        self.assertEqual(metadata["pollingDistrictCount"], 6_637)
        self.assertEqual(metadata["pollingCentreCount"], 6_981)

    def test_rejected_workbooks_are_named_with_reasons(self):
        self.assertEqual(
            [item["parliamentCode"] for item in self.manifest["rejectedSources"]],
            ["P.046", "P.047", "P.063", "P.093", "P.094", "P.144", "P.169", "P.170", "P.176", "P.180"],
        )
        self.assertTrue(all(item["reason"] for item in self.manifest["rejectedSources"]))

    def test_every_published_stream_and_aggregate_balances(self):
        seats = {seat["code"]: seat for seat in self.election["seats"]}
        for code, result in self.results.items():
            for row in result["rows"]:
                self.assertEqual(sum(row["candidateVotes"].values()), row["validVotes"])
                self.assertEqual(
                    row["ballotsInBox"],
                    row["validVotes"] + row["rejectedVotes"] + row["unreturnedVotes"],
                )
            seat = seats[code]
            self.assertEqual(seat["turnout"], result["totals"]["ballotsInBox"])
            self.assertEqual(seat["validVotes"], result["totals"]["validVotes"])
            self.assertEqual(seat["rejectedVotes"], result["totals"]["rejectedVotes"])
            self.assertEqual(seat["unreturnedVotes"], result["totals"]["unreturnedVotes"])

    def test_representative_scoresheet_and_resolved_spr_conflict(self):
        alor_setar = self.results["P.009"]
        self.assertEqual(alor_setar["registeredVoters"], 80_272)
        self.assertEqual(alor_setar["totals"]["pollingStreams"], 160)
        self.assertEqual(alor_setar["totals"]["ballotsInBox"], 65_096)
        self.assertEqual(alor_setar["totals"]["validVotes"], 63_931)
        bagan_datuk = next(seat for seat in self.election["seats"] if seat["code"] == "P.075")
        self.assertEqual(bagan_datuk["winner"]["votes"], 18_909)
        self.assertEqual(bagan_datuk["marginVotes"], 5_073)
        self.assertEqual(self.manifest["resolvedConflicts"][0]["parliamentCode"], "P.075")


if __name__ == "__main__":
    unittest.main()
