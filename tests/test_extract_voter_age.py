import unittest
from pathlib import Path

from scripts.extract_voter_age import AGE_BANDS, extract, serialise


ROOT = Path(__file__).resolve().parents[1]


class VoterAgeExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.constituencies, cls.voter_age = extract(
            ROOT / "STATISTIK PRU KE_15 UMUR BY_DUN.pdf",
            ROOT / "public/data/election.json",
        )

    def test_extractor_reproduces_published_artifacts(self):
        self.assertEqual(serialise(self.constituencies), (ROOT / "public/data/constituencies.json").read_text(encoding="utf-8"))
        self.assertEqual(serialise(self.voter_age), (ROOT / "public/data/voter-age.json").read_text(encoding="utf-8"))

    def test_reusable_constituency_hierarchy_is_complete(self):
        self.assertEqual(len(self.constituencies["states"]), 16)
        self.assertEqual(len(self.constituencies["parliaments"]), 222)
        self.assertEqual(len(self.constituencies["duns"]), 600)
        self.assertEqual(len({dun["id"] for dun in self.constituencies["duns"]}), 600)
        padang_besar = next(item for item in self.constituencies["parliaments"] if item["code"] == "P.001")
        self.assertEqual(padang_besar["name"], "PADANG BESAR")
        self.assertEqual(padang_besar["dunIds"], ["P.001:N.01", "P.001:N.02", "P.001:N.03", "P.001:N.04", "P.001:N.05"])

    def test_source_totals_and_age_bands_are_consistent(self):
        self.assertEqual(tuple(self.voter_age["metadata"]["ageBands"]), AGE_BANDS)
        for collection in ("stateRecords", "parliamentRecords", "dunRecords"):
            for record in self.voter_age[collection]:
                self.assertEqual(sum(record["counts"].values()), record["total"])
        self.assertEqual(sum(self.voter_age["national"]["counts"].values()), self.voter_age["national"]["total"])

    def test_federal_territories_do_not_invent_dun_names(self):
        no_dun_codes = {item["code"] for item in self.constituencies["parliaments"] if not item["dunIds"]}
        self.assertEqual(no_dun_codes, {f"P.{number:03d}" for number in range(114, 126)} | {"P.166"})


if __name__ == "__main__":
    unittest.main()
