import unittest
from pathlib import Path

from scripts.extract_state_elections import build, compact


ROOT = Path(__file__).resolve().parents[1]


class StateElectionExtractionTests(unittest.TestCase):
    def setUp(self):
        self.value = build(ROOT / "sources/spr/state-elections", ROOT / "public/data/constituencies.json")

    def test_latest_assemblies_cover_every_dun_once(self):
        self.assertEqual(len(self.value["events"]), 13)
        self.assertEqual(len(self.value["contests"]), 600)
        self.assertEqual(len({item["dunId"] for item in self.value["contests"]}), 600)
        self.assertEqual(sum(len(item["candidates"]) for item in self.value["contests"]), 2233)

    def test_event_compositions_are_derived_from_winners(self):
        events = {item["id"]: item for item in self.value["events"]}
        self.assertEqual(events["prn-selangor-2023"]["seatCounts"], {"PH": 32, "PN": 22, "BN": 2})
        self.assertEqual(events["prn-sarawak-2021"]["seatCounts"], {"GPS": 76, "PSB": 4, "DAP": 2})
        self.assertEqual(events["prn-sabah-2025"]["contestIds"].__len__(), 73)
        self.assertEqual(events["prn-johor-2026"]["seatCounts"], {"BN": 48, "PH": 8})
        self.assertEqual(events["prn-johor-2026"]["registeredVoters"], 2727926)
        self.assertEqual(events["prn-johor-2026"]["turnoutVotes"], 1897668)
        self.assertAlmostEqual(events["prn-johor-2026"]["turnoutPct"], 0.6956449698415573)

    def test_published_output_is_reproducible(self):
        self.assertEqual(compact(self.value), (ROOT / "public/data/state-elections.json").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
