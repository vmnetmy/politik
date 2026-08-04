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
            state_path = ROOT / "public/data/boundaries" / self.index["stateFiles"][state["id"]]
            artifact = json.loads(state_path.read_text(encoding="utf-8"))
            dun_total += len(artifact["layers"]["dun"]["features"])
        self.assertEqual(dun_total, EXPECTED_DUNS)

    def test_every_published_event_has_declared_state_provenance(self):
        self.assertEqual(self.registry["version"], 3)
        self.assertEqual(self.registry["defaultBoundaryVersion"], BOUNDARY_VERSION)
        for event in self.events:
            state = self.registry["stateAssemblies"][str(event["assemblyNumber"])]["states"][event["stateId"]]
            self.assertTrue(state["orderReference"])
            self.assertTrue(state["evidenceUrl"].startswith("https://"))
            if event["assemblyNumber"] == 15 and event["stateId"] == "sabah":
                self.assertEqual(state["status"], "identity-only")
                self.assertEqual(state["constituencyCount"], 60)
                self.assertNotIn("stateFile", state)
                self.assertNotIn("geometrySha256", state)
                continue
            self.assertEqual(state["status"], "exact")
            self.assertEqual(
                state["stateFile"],
                f"{state['boundaryVersion']}/atlas/states/{event['stateId']}.json",
            )
            self.assertEqual(len(state["geometrySha256"]), 64)
            self.assertTrue(
                (ROOT / "public/data/boundaries" / self.registry["stateAssemblies"][str(event["assemblyNumber"])]["snapshotFile"]).is_file()
            )

    def test_regional_effective_dates_are_explicit(self):
        states = self.registry["federal"]["pru-15"]["states"]
        self.assertEqual(states["sarawak"]["effectiveFrom"], "2015-12-19")
        self.assertEqual(states["selangor"]["effectiveFrom"], "2018-03-29")
        self.assertEqual(states["sabah"]["effectiveFrom"], "2019-08-22")
        self.assertEqual(states["sarawak"]["boundaryVersion"], "my-sarawak-2015")
        self.assertEqual(states["selangor"]["boundaryVersion"], "my-peninsula-2018")
        self.assertEqual(states["sabah"]["boundaryVersion"], "my-sabah-2019")
        self.assertEqual(self.registry["federal"]["pru-15"]["status"], "exact")
        self.assertEqual(self.registry["federal"]["pru-14"]["status"], "compatible")
        self.assertEqual(self.registry["federal"]["pru-14"]["states"]["sabah"]["status"], "compatible")
        self.assertEqual(self.registry["federal"]["pru-14"]["states"]["sarawak"]["status"], "exact")

    def test_every_snapshot_pins_physical_geometry_hashes(self):
        entries = [*self.registry["federal"].values(), *self.registry["stateAssemblies"].values()]
        for entry in entries:
            snapshot_path = ROOT / "public/data/boundaries" / entry["snapshotFile"]
            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            self.assertEqual(snapshot["coordinateReference"], "EPSG:4326")
            for state in snapshot["states"].values():
                if state["status"] == "identity-only":
                    self.assertNotIn("stateFile", state)
                    self.assertNotIn("geometrySha256", state)
                    self.assertGreater(state["constituencyCount"], 0)
                    continue
                state_path = ROOT / "public/data/boundaries" / state["stateFile"]
                self.assertTrue(state_path.is_file())
                self.assertEqual(state["geometrySha256"], __import__("hashlib").sha256(state_path.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
