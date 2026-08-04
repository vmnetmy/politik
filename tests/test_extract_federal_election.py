import hashlib
import json
import unittest
from collections import Counter
from pathlib import Path

from scripts.extract_federal_election import build, render


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/elections/pru-14/election.json"


class FederalElectionExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = build(14)

    def test_pru14_reconciles_to_authoritative_totals(self):
        self.assertEqual(len(self.value["seats"]), 222)
        self.assertEqual(sum(seat["candidateCount"] for seat in self.value["seats"]), 687)
        self.assertEqual(sum(seat["registered"] for seat in self.value["seats"]), 14_940_624)
        self.assertEqual(self.value["metadata"]["stateCount"], 16)
        self.assertEqual(
            Counter(seat["winner"]["alliance"] for seat in self.value["seats"]),
            {
                "PAKATAN HARAPAN (PH)": 113,
                "BARISAN NASIONAL (BN)": 79,
                "GAGASAN SEJAHTERA (GS)": 18,
                "LAIN-LAIN / BEBAS": 11,
                "UNITED SABAH ALLIANCE (USA)": 1,
            },
        )

    def test_party_is_component_party_not_only_ballot_logo(self):
        padang_besar = self.value["seats"][0]
        zahidi = padang_besar["winner"]
        izizam = next(candidate for candidate in padang_besar["candidates"] if candidate["name"] == "IZIZAM BIN IBRAHIM")
        self.assertEqual(zahidi["party"], "UNITED MALAY NATIONAL ORGANIZATION (UMNO)")
        self.assertEqual(izizam["party"], "PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)")
        self.assertEqual(izizam["alliance"], "PAKATAN HARAPAN (PH)")

    def test_official_result_wins_when_supporting_source_differs(self):
        bagan_datuk = next(seat for seat in self.value["seats"] if seat["code"] == "P.075")
        self.assertEqual(bagan_datuk["winner"]["votes"], 18_909)
        self.assertEqual(bagan_datuk["marginVotes"], 5_073)

    def test_cross_election_person_identity_is_reused(self):
        larut = next(seat for seat in self.value["seats"] if seat["code"] == "P.056")
        self.assertEqual(larut["winner"]["personId"], "person:dato-seri-hamzah-zainudin")

    def test_published_file_is_reproducible(self):
        self.assertEqual(render(self.value), OUTPUT.read_text(encoding="utf-8"))

    def test_archived_source_manifests_match_bytes(self):
        for directory in [ROOT / "sources/spr/federal-elections", ROOT / "sources/meco"]:
            manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            for filename, expected in manifest["files"].items():
                path = directory / filename
                raw = path.read_bytes()
                self.assertEqual(len(raw), expected["bytes"])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), expected["sha256"])


if __name__ == "__main__":
    unittest.main()
