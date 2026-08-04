import copy
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_data_coverage", ROOT / "scripts/validate_data_coverage.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ValidateDataCoverageTests(unittest.TestCase):
    def test_repository_coverage_is_consistent(self):
        MODULE.validate_all()

    def test_locality_parent_mismatch_is_rejected(self):
        geography = MODULE.read_json(MODULE.GEOGRAPHY_PATH)
        constituencies = MODULE.read_json(MODULE.CONSTITUENCIES_PATH)
        broken = copy.deepcopy(geography)
        broken["localities"][0]["parliamentCode"] = "P.999"
        with self.assertRaisesRegex(MODULE.CoverageValidationError, "does not match its PDM hierarchy"):
            MODULE.validate_geography(broken, constituencies)

    def test_unresolved_locality_conflict_is_rejected(self):
        geography = MODULE.read_json(MODULE.GEOGRAPHY_PATH)
        constituencies = MODULE.read_json(MODULE.CONSTITUENCIES_PATH)
        broken = copy.deepcopy(geography)
        broken["localityConflicts"] = [{"localityId": "broken"}]
        broken["metadata"]["localityConflictCount"] = 1
        with self.assertRaisesRegex(MODULE.CoverageValidationError, "must be resolved"):
            MODULE.validate_geography(broken, constituencies)


if __name__ == "__main__":
    unittest.main()
