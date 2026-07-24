import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_person_registry import build


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "public/data/elections/index.json"
PEOPLE = ROOT / "public/data/reference/persons.json"


class PersonRegistryTests(unittest.TestCase):
    def test_registry_is_reproducible_and_candidacies_are_unique(self):
        published = json.loads(PEOPLE.read_text(encoding="utf-8"))
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
        elections = [ROOT / "public/data" / edition["path"] / "election.json" for edition in registry["elections"]]
        generated = build(elections, published)
        self.assertEqual(generated, published)
        candidacy_ids = [item for person in published["persons"] for item in person["candidacyIds"]]
        self.assertEqual(len(candidacy_ids), 945 + 687)
        self.assertEqual(len(set(candidacy_ids)), 945 + 687)

    def test_known_current_memberships_use_stable_person_ids(self):
        affiliations = json.loads((ROOT / "public/data/elections/pru-15/affiliations.json").read_text(encoding="utf-8"))
        people = {person["id"] for person in json.loads(PEOPLE.read_text(encoding="utf-8"))["persons"]}
        self.assertTrue(all(event["personId"] in people for event in affiliations["affiliations"]))

    def test_cross_election_name_changes_become_preserved_aliases(self):
        election = {
            "seats": [{
                "candidates": [{
                    "personId": "person:example",
                    "candidacyId": "pru-14:P.001:01",
                    "name": "NAMA TANPA GELARAN",
                }],
            }],
        }
        existing = {"persons": [{
            "id": "person:example",
            "canonicalName": "DATO NAMA TANPA GELARAN",
            "aliases": [],
            "candidacyIds": ["pru-15:P.001:01"],
        }]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "election.json"
            path.write_text(json.dumps(election), encoding="utf-8")
            result = build([path], existing)
        self.assertEqual(result["persons"][0]["canonicalName"], "DATO NAMA TANPA GELARAN")
        self.assertEqual(result["persons"][0]["aliases"], ["NAMA TANPA GELARAN"])


if __name__ == "__main__":
    unittest.main()
