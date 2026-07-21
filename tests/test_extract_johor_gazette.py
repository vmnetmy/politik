import json
import unittest
from pathlib import Path

from scripts.extract_johor_gazette import compact, extract


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "sources/spr/state-elections/pub-246-2026.pdf"
OUTPUT = ROOT / "sources/spr/state-elections/pub-246-johor-2026.json"


class JohorGazetteExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = extract(PDF)

    def test_extracts_every_gazetted_form_16(self):
        self.assertEqual(self.value["metadata"]["seatCount"], 56)
        self.assertEqual(self.value["metadata"]["candidateCount"], 172)
        self.assertEqual(self.value["metadata"]["sourceSha256"], "4481d13ad99bd4a879de0b3e2a8b1dd6b06ae20317d435c5d4b98577e648a25a")

    def test_publishes_complete_johor_ballot_totals(self):
        self.assertEqual(self.value["metadata"]["registeredVoters"], 2727926)
        self.assertEqual(self.value["metadata"]["ballotsIssued"], 1897668)
        self.assertEqual(self.value["metadata"]["validVotes"], 1874918)
        self.assertEqual(self.value["metadata"]["rejectedVotes"], 20655)
        self.assertEqual(self.value["metadata"]["unreturnedVotes"], 2095)

    def test_each_form_balances(self):
        for result in self.value["results"]:
            self.assertEqual(result["ballotsIssued"], result["validVotes"] + result["rejectedVotes"] + result["unreturnedVotes"])

    def test_published_extraction_is_reproducible(self):
        self.assertEqual(compact(self.value), OUTPUT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
