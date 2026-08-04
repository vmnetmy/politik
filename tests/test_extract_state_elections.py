import unittest
from pathlib import Path

from scripts.extract_state_elections import build, compact


ROOT = Path(__file__).resolve().parents[1]


class StateElectionExtractionTests(unittest.TestCase):
    def setUp(self):
        self.value = build(ROOT / "sources/spr/state-elections", ROOT / "public/data/elections/pru-15/constituencies.json")

    def test_latest_assemblies_cover_every_dun_once(self):
        latest_events = [item for item in self.value["events"] if item["coverage"] == "latest"]
        historical_events = [item for item in self.value["events"] if item["coverage"] == "historical"]
        latest_ids = {item["id"] for item in latest_events}
        historical_ids = {item["id"] for item in historical_events}
        latest_contests = [item for item in self.value["contests"] if item["eventId"] in latest_ids]
        historical_contests = [item for item in self.value["contests"] if item["eventId"] in historical_ids]
        self.assertEqual(len(self.value["events"]), 27)
        self.assertEqual(len(self.value["contests"]), 1197)
        self.assertEqual(len(latest_events), 13)
        self.assertEqual(len(latest_contests), 600)
        self.assertEqual(len({item["dunId"] for item in latest_contests}), 600)
        self.assertEqual(sum(len(item["candidates"]) for item in latest_contests), 2253)
        self.assertEqual(len(historical_events), 14)
        self.assertEqual(len(historical_contests), 597)
        self.assertEqual(sum(len(item["candidates"]) for item in historical_contests), 1968)
        prn14_events = [item for item in historical_events if item["assemblyNumber"] == 14]
        prn14_ids = {item["id"] for item in prn14_events}
        prn14_contests = [item for item in historical_contests if item["eventId"] in prn14_ids]
        self.assertEqual(len(prn14_events), 11)
        self.assertEqual(len(prn14_contests), 445)
        self.assertEqual(sum(len(item["candidates"]) for item in prn14_contests), 1394)

    def test_event_compositions_are_derived_from_winners(self):
        events = {item["id"]: item for item in self.value["events"]}
        self.assertEqual(events["prn-selangor-2023"]["seatCounts"], {"PH": 32, "PN": 22, "BN": 2})
        self.assertEqual(events["prn-sarawak-2021"]["seatCounts"], {"GPS": 76, "PSB": 4, "DAP": 2})
        self.assertEqual(events["prn-sabah-2025"]["contestIds"].__len__(), 73)
        self.assertEqual(events["prn-sabah-2018"]["contestIds"].__len__(), 60)
        self.assertEqual(events["prn-sabah-2018"]["registeredVoters"], 1117337)
        self.assertEqual(events["prn-sabah-2018"]["seatCounts"], {"BN": 29, "WARISAN": 21, "DAP": 6, "PKR": 2, "SOLIDARITI": 2})
        self.assertEqual(events["prn-johor-2026"]["seatCounts"], {"BN": 48, "PH": 8})
        self.assertEqual(events["prn-johor-2026"]["registeredVoters"], 2727926)
        self.assertEqual(events["prn-johor-2026"]["turnoutVotes"], 1897668)
        self.assertAlmostEqual(events["prn-johor-2026"]["turnoutPct"], 0.6956449698415573)
        self.assertEqual(events["prn-negeri-sembilan-2026"]["seatCounts"], {"BN": 18, "PH": 11, "PN": 7})
        self.assertEqual(events["prn-negeri-sembilan-2026"]["registeredVoters"], 889490)
        self.assertIsNone(events["prn-negeri-sembilan-2026"]["turnoutVotes"])
        self.assertEqual(events["prn-negeri-sembilan-2023"]["coverage"], "historical")
        self.assertEqual(events["prn-johor-2022"]["contestIds"].__len__(), 56)
        self.assertEqual(events["prn-johor-2022"]["registeredVoters"], 2597742)
        self.assertEqual(events["prn-johor-2022"]["turnoutVotes"], 1417115)
        self.assertEqual(events["prn-johor-2022"]["seatCounts"], {"BN": 40, "PH": 11, "PN": 3, "MUDA": 1, "PKR": 1})

    def test_prn14_is_complete_and_uses_the_gazetted_electoral_roll(self):
        events = {item["id"]: item for item in self.value["events"]}
        self.assertEqual(events["prn-johor-2018"]["contestIds"].__len__(), 56)
        self.assertEqual(events["prn-johor-2018"]["registeredVoters"], 1817999)
        self.assertEqual(events["prn-johor-2018"]["seatCounts"], {"PKR": 36, "BN": 19, "PAS": 1})
        self.assertEqual(events["prn-selangor-2018"]["seatCounts"], {"PKR": 51, "BN": 4, "PAS": 1})
        rantau = next(item for item in self.value["contests"] if item["id"] == "prn-negeri-sembilan-2018:P.131:N.27")
        self.assertEqual(rantau["registeredVoters"], 20472)
        self.assertEqual(rantau["validVotes"], 0)
        self.assertEqual(rantau["candidates"][0]["status"], "winner")

    def test_published_output_is_reproducible(self):
        self.assertEqual(compact(self.value), (ROOT / "public/data/state-elections.json").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
