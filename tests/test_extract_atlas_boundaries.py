import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extract_atlas_boundaries import (  # noqa: E402
    ATLAS_DIRECTORY,
    BOUNDARY_REGISTRY_PATH,
    BOUNDARY_VERSION,
    EXPECTED_DUNS,
    EXPECTED_PARLIAMENTS,
    INDEX_PATH,
    STATE_EVENTS_PATH,
    validate_published,
)


class AtlasBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        cls.registry = json.loads(BOUNDARY_REGISTRY_PATH.read_text(encoding="utf-8"))
        cls.events = json.loads(STATE_EVENTS_PATH.read_text(encoding="utf-8"))["events"]

    def test_split_geometry_is_complete_and_compact(self):
        validate_published()
        self.assertEqual(self.index["metadata"]["parliamentFeatureCount"], EXPECTED_PARLIAMENTS)
        self.assertEqual(self.index["metadata"]["dunFeatureCount"], 0)
        self.assertLess(INDEX_PATH.stat().st_size, 220_000)
        dun_total = 0
        for state in self.index["states"]:
            state_path = ATLAS_DIRECTORY / self.index["stateFiles"][state["id"]]
            artifact = json.loads(state_path.read_text(encoding="utf-8"))
            dun_total += len(artifact["layers"]["dun"]["features"])
        self.assertEqual(dun_total, EXPECTED_DUNS)

    def test_every_published_event_has_exact_state_provenance(self):
        self.assertEqual(self.registry["version"], 2)
        self.assertEqual(self.registry["defaultBoundaryVersion"], BOUNDARY_VERSION)
        for event in self.events:
            state = self.registry["stateAssemblies"][str(event["assemblyNumber"])]["states"][event["stateId"]]
            self.assertEqual(state["status"], "exact")
            self.assertTrue(state["orderReference"])
            self.assertTrue(state["evidenceUrl"].startswith("https://"))
            self.assertEqual(state["stateFile"], f"my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/{event['stateId']}.json")

    def test_regional_effective_dates_are_explicit(self):
        states = self.registry["federal"]["pru-15"]["states"]
        self.assertEqual(states["sarawak"]["effectiveFrom"], "2015-12-19")
        self.assertEqual(states["selangor"]["effectiveFrom"], "2018-03-29")
        self.assertEqual(states["sabah"]["effectiveFrom"], "2019-08-22")
        self.assertEqual(states["sarawak"]["boundaryVersion"], "my-sarawak-2015")
        self.assertEqual(states["selangor"]["boundaryVersion"], "my-peninsula-2018")
        self.assertEqual(states["sabah"]["boundaryVersion"], "my-sabah-2019")


if __name__ == "__main__":
    unittest.main()
