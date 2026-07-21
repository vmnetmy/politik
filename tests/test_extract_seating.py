import json
import unittest
from pathlib import Path

from scripts.extract_seating import DEFAULT_UNMAPPED, extract, normalise, serialise, source_seating_slots


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

    def test_svg_geometry_preserves_exact_coded_positions(self):
        extracted = extract(ROOT / "SeatingDR.pdf", ROOT / "public/data/election.json", DEFAULT_UNMAPPED)
        self.assertEqual(extracted["version"], 4)
        self.assertEqual(extracted["sourceSha256"], "8dd8188341dafa69493b316d7247ee64c32e8f7be3353da98796b518d4a068f4")
        self.assertEqual(extracted["layout"]["strategy"], "svg-source-rect-v3")
        self.assertEqual(extracted["layout"]["geometrySha256"], "9e3a21a3e420ef42805928b168f3b45e42389efa04350908228e4504c7427fe0")
        self.assertEqual(extracted["layout"]["rasterSha256"], "6cb79023896ab27ebe2e0d80f81387cf7ba88d7ddb56bf7eaa1f1a73e9ce0690")
        self.assertEqual(extracted["layout"]["physicalSeatCount"], 280)
        self.assertEqual(len(extracted["emptyPositions"]), 60)
        self.assertEqual({position["section"] for position in extracted["positions"]}, {"straight-left", "straight-right", "curved"})
        self.assertTrue(all("sourceX" in position and "sourceY" in position for position in extracted["positions"]))

        physical_codes = [position["physicalCode"] for position in extracted["positions"] + extracted["emptyPositions"]]
        expected_codes = [f"{letter}{number}" for letter, count in (("A", 28), ("B", 22), ("C", 60), ("D", 60), ("E", 60), ("F", 22), ("G", 28)) for number in range(1, count + 1)]
        self.assertCountEqual(physical_codes, expected_codes)
        expected_geometry = {slot["physicalCode"]: (slot["x"], slot["y"]) for slot in source_seating_slots()}
        actual_geometry = {position["physicalCode"]: (position["x"], position["y"]) for position in extracted["positions"] + extracted["emptyPositions"]}
        self.assertEqual(actual_geometry, expected_geometry)
        by_seat = {position["seatCode"]: position for position in extracted["positions"]}
        self.assertEqual((by_seat["P.056"]["physicalCode"], by_seat["P.056"]["x"], by_seat["P.056"]["y"]), ("G1", 443.0, 805.0))
        self.assertEqual((by_seat["P.020"]["physicalCode"], by_seat["P.020"]["x"], by_seat["P.020"]["y"]), ("F7", 396.0, 566.0))
        self.assertEqual((by_seat["P.173"]["physicalCode"], by_seat["P.173"]["x"], by_seat["P.173"]["y"]), ("C22", 861.0, 339.0))

        by_physical = {position["physicalCode"]: position for position in extracted["positions"] + extracted["emptyPositions"]}
        self.assertEqual((by_physical["D48"]["x"], by_physical["D48"]["y"]), (862.0, 45.0))
        self.assertTrue(all(
            position["x"] == position["sourceX"] and position["y"] == position["sourceY"]
            for position in extracted["emptyPositions"]
        ))

    def test_name_normalisation_is_stable(self):
        self.assertEqual(normalise("P.056 - Larut"), "P056LARUT")


if __name__ == "__main__":
    unittest.main()
