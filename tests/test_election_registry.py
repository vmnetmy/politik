import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "public/data"
REGISTRY_PATH = DATA_ROOT / "elections/index.json"


class ElectionRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))

    def test_registry_and_every_edition_are_namespaced(self):
        editions = self.registry["elections"]
        self.assertEqual(sum(edition["isCurrentTerm"] for edition in editions), 1)
        self.assertIn(self.registry["defaultElectionId"], {edition["id"] for edition in editions})
        self.assertEqual(len({edition["id"] for edition in editions}), len(editions))
        self.assertEqual(len({edition["number"] for edition in editions}), len(editions))

        candidacy_ids = []
        for edition in editions:
            directory = DATA_ROOT / edition["path"]
            election = json.loads((directory / "election.json").read_text(encoding="utf-8"))
            metadata = election["metadata"]
            self.assertEqual(metadata["electionId"], edition["id"])
            self.assertEqual(metadata["electionNumber"], edition["number"])
            self.assertEqual(metadata["termId"], edition["termId"])
            self.assertEqual(metadata["boundaryVersion"], edition["boundaryVersion"])
            self.assertEqual(len(election["seats"]), metadata["seatCount"])

            for seat in election["seats"]:
                self.assertEqual(seat["electionId"], edition["id"])
                self.assertEqual(seat["contestId"], f"{edition['id']}:{seat['code']}")
                candidate_ids = {candidate["candidacyId"] for candidate in seat["candidates"]}
                self.assertIn(seat["winner"]["candidacyId"], candidate_ids)
                for candidate in seat["candidates"]:
                    self.assertEqual(candidate["electionId"], edition["id"])
                    self.assertTrue(candidate["candidacyId"].startswith(f"{seat['contestId']}:"))
                    self.assertTrue(candidate["personId"].startswith("person:"))
                    candidacy_ids.append(candidate["candidacyId"])

            wrappers = {
                "changes.json": ("changes", False),
                "candidate-changes.json": ("candidateChanges", False),
                "affiliations.json": ("affiliations", True),
            }
            for filename, (collection, term_scoped) in wrappers.items():
                value = json.loads((directory / filename).read_text(encoding="utf-8"))
                self.assertEqual(value["version"], 2)
                self.assertEqual(value["electionId"], edition["id"])
                self.assertIsInstance(value[collection], list)
                if term_scoped:
                    self.assertEqual(value["termId"], edition["termId"])

            capability_files = {
                "seating": ["seating.json"],
                "scoresheets": ["scoresheets/index.json", "polling-places.json"],
                "voterRoll": ["voter-roll.json"],
                "voterAge": ["voter-age.json", "constituencies.json"],
                "voterEthnicity": ["voter-ethnicity.json", "voter-age.json", "constituencies.json"],
                "geography": ["geography.json", "constituencies.json", "polling-places.json"],
            }
            for capability, filenames in capability_files.items():
                if edition["capabilities"][capability]:
                    for filename in filenames:
                        self.assertTrue((directory / filename).is_file(), f"{edition['id']} requires {filename}")

        self.assertEqual(len(candidacy_ids), len(set(candidacy_ids)))

    def test_person_registry_covers_every_published_candidacy(self):
        expected = set()
        for edition in self.registry["elections"]:
            election = json.loads((DATA_ROOT / edition["path"] / "election.json").read_text(encoding="utf-8"))
            expected.update(candidate["candidacyId"] for seat in election["seats"] for candidate in seat["candidates"])
        persons = json.loads((DATA_ROOT / "reference/persons.json").read_text(encoding="utf-8"))["persons"]
        actual = {candidacy_id for person in persons for candidacy_id in person["candidacyIds"]}
        self.assertEqual(actual, expected)
        person_ids = {person["id"] for person in persons}
        matches = json.loads((DATA_ROOT / "reference/person-matches.json").read_text(encoding="utf-8"))["matches"]
        keys = [(match["electionId"], match["seatCode"], match["candidateName"]) for match in matches]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(all(match["personId"] in person_ids for match in matches))


if __name__ == "__main__":
    unittest.main()
