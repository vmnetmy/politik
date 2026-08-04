import json
import unittest
from pathlib import Path

from scripts.build_data_manifest import ALL_DATA_FILES, BOUNDARY_FILES, REFERENCE_FILES, build, build_collection_manifest, render


ROOT = Path(__file__).resolve().parents[1]


class DataManifestTests(unittest.TestCase):
    def test_manifest_reproduces_published_integrity_artifact(self):
        registry = json.loads((ROOT / "public/data/elections/index.json").read_text(encoding="utf-8"))
        for edition in registry["elections"]:
            directory = ROOT / "public/data" / edition["path"]
            generated = render(build(directory, edition["capabilities"]))
            self.assertEqual(generated, (directory / "manifest.json").read_text(encoding="utf-8"))

    def test_manifest_has_sha256_for_every_governed_file(self):
        value = build(ROOT / "public/data/elections/pru-15")
        scoresheet_files = list((ROOT / "public/data/elections/pru-15/scoresheets").glob("P.*.json"))
        self.assertEqual(len(scoresheet_files), 222)
        self.assertEqual(len(value["files"]), len(ALL_DATA_FILES) + len(scoresheet_files))
        for item in value["files"].values():
            self.assertEqual(len(item["sha256"]), 64)
            self.assertGreater(item["bytes"], 0)

    def test_pru14_manifest_governs_sharded_polling_places(self):
        value = build(ROOT / "public/data/elections/pru-14")
        shards = list((ROOT / "public/data/elections/pru-14/scoresheets/places").glob("P.*.json"))
        self.assertEqual(len(shards), 180)
        self.assertNotIn("polling-places.json", value["files"])
        self.assertTrue(all(f"scoresheets/places/{path.name}" in value["files"] for path in shards))

    def test_shared_reference_manifest_is_current(self):
        directory = ROOT / "public/data/reference"
        generated = render(build_collection_manifest(directory, REFERENCE_FILES))
        self.assertEqual(generated, (directory / "manifest.json").read_text(encoding="utf-8"))

    def test_boundary_manifest_is_current(self):
        directory = ROOT / "public/data/boundaries"
        generated = render(build_collection_manifest(directory, BOUNDARY_FILES))
        self.assertEqual(generated, (directory / "manifest.json").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
