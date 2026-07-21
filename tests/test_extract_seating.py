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

    def test_regularized_geometry_preserves_pdf_coordinates(self):
        extracted = extract(ROOT / "SeatingDR.pdf", ROOT / "public/data/election.json", DEFAULT_UNMAPPED)
        self.assertEqual(extracted["version"], 2)
        self.assertEqual(len(extracted["emptyPositions"]), 60)
        self.assertEqual({position["section"] for position in extracted["positions"]}, {"straight-left", "straight-right", "curved"})
        self.assertTrue(all("sourceX" in position and "sourceY" in position for position in extracted["positions"]))

        left = {(position["x"], position["y"]) for position in extracted["positions"] if position["section"] == "straight-left"}
        right = {(position["x"], position["y"]) for position in extracted["positions"] if position["section"] == "straight-right"}
        self.assertEqual({(1190 - x, y) for x, y in left}, right)
        self.assertEqual(len({x for x, _ in left}), 5)
        self.assertEqual(len({y for _, y in left}), 10)

    def test_name_normalisation_is_stable(self):
        self.assertEqual(normalise("P.056 - Larut"), "P056LARUT")


if __name__ == "__main__":
    unittest.main()
