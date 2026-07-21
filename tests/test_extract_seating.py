import json
import unittest
from pathlib import Path

from scripts.extract_seating import DEFAULT_UNMAPPED, extract, normalise, serialise


ROOT = Path(__file__).resolve().parents[1]


class SeatingExtractionTests(unittest.TestCase):
    def test_extractor_reproduces_published_artifact_exactly(self):
        extracted = extract(ROOT / "SeatingDR.pdf", ROOT / "public/data/election.json", DEFAULT_UNMAPPED)
        published = (ROOT / "public/data/seating.json").read_text(encoding="utf-8")
        self.assertEqual(serialise(extracted), published)

    def test_mapped_and_unmapped_cover_all_222_seats(self):
        extracted = extract(ROOT / "SeatingDR.pdf", ROOT / "public/data/election.json", DEFAULT_UNMAPPED)
        codes = [position["seatCode"] for position in extracted["positions"]] + extracted["unmappedSeatCodes"]
        self.assertEqual(len(codes), 222)
        self.assertEqual(len(set(codes)), 222)

    def test_name_normalisation_is_stable(self):
        self.assertEqual(normalise("P.056 - Larut"), "P056LARUT")


if __name__ == "__main__":
    unittest.main()
