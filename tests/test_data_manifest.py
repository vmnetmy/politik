import json
import unittest
from pathlib import Path

from scripts.build_data_manifest import build, render


ROOT = Path(__file__).resolve().parents[1]


class DataManifestTests(unittest.TestCase):
    def test_manifest_reproduces_published_integrity_artifact(self):
        generated = render(build(ROOT / "public/data"))
        published = (ROOT / "public/data/manifest.json").read_text(encoding="utf-8")
        self.assertEqual(generated, published)

    def test_manifest_has_sha256_for_every_governed_file(self):
        value = build(ROOT / "public/data")
        self.assertEqual(len(value["files"]), 69)
        for item in value["files"].values():
            self.assertEqual(len(item["sha256"]), 64)
            self.assertGreater(item["bytes"], 0)


if __name__ == "__main__":
    unittest.main()
