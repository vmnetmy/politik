import unittest

from scripts.extract_dpt_localities import DptLocalityError, parse_locality_text


class DptLocalityExtractionTests(unittest.TestCase):
    def test_reads_name_before_or_after_full_code(self):
        records = parse_locality_text(
            """
            ALOR PASIR                         028/30/09/001        142
            028/30/09/002    KG KELUBI                              87
            """
        )
        self.assertEqual(
            records,
            [
                {
                    "fullCode": "028/30/09/001",
                    "parliamentCode": "P.028",
                    "dunCode": "N.30",
                    "pdmCode": "028/30/09",
                    "code": "001",
                    "name": "ALOR PASIR",
                },
                {
                    "fullCode": "028/30/09/002",
                    "parliamentCode": "P.028",
                    "dunCode": "N.30",
                    "pdmCode": "028/30/09",
                    "code": "002",
                    "name": "KG KELUBI",
                },
            ],
        )

    def test_rejects_conflicting_names_in_one_snapshot(self):
        with self.assertRaises(DptLocalityError):
            parse_locality_text(
                """
                ALOR PASIR 028/30/09/001
                ALOR PASIR BARU 028/30/09/001
                """
            )


if __name__ == "__main__":
    unittest.main()
