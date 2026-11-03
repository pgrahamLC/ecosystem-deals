#!/usr/bin/env python3
"""Matcher rules: exact and fuzzy address, date choice, and no guessed area."""
import unittest

from match_epc_sales import index_certificates, match_sale

SALE = {
    "id": "sale-1",
    "date": "2024-06-01",
    "price": "200000",
    "postcode": "m1 1ae",
    "paon": "10",
    "saon": "APARTMENT 2",
    "street": "HIGH STREET",
}


def cert(**extra):
    row = {
        "ADDRESS1": "APARTMENT 2",
        "ADDRESS2": "10 HIGH STREET",
        "POSTCODE": "M1 1AE",
        "TOTAL_FLOOR_AREA": "70",
        "LODGEMENT_DATE": "2020-01-15",
    }
    row.update(extra)
    return row


class MatchTests(unittest.TestCase):
    def test_exact_uses_latest_certificate_on_or_before_the_sale(self):
        grouped = index_certificates([
            cert(LODGEMENT_DATE="2018-01-01", TOTAL_FLOOR_AREA="60"),
            cert(LODGEMENT_DATE="2023-05-01", TOTAL_FLOOR_AREA="70"),
            cert(LODGEMENT_DATE="2025-01-01", TOTAL_FLOOR_AREA="90"),
        ])
        hit = match_sale(SALE, grouped)
        self.assertEqual(hit["epc_match"], "exact")
        self.assertEqual(hit["epc_date"], "2023-05-01")
        self.assertEqual(hit["floor_area_m2"], 70.0)
        self.assertEqual(hit["floor_area_sqft"], round(70 * 10.7639, 1))
        self.assertEqual(hit["price_per_sqft"], round(200000 / hit["floor_area_sqft"], 2))

    def test_certificate_just_after_the_sale_is_used_when_nothing_is_earlier(self):
        grouped = index_certificates([cert(LODGEMENT_DATE="2024-08-01")])
        hit = match_sale(SALE, grouped)
        self.assertEqual(hit["epc_date"], "2024-08-01")

    def test_a_later_certificate_is_not_a_guess(self):
        grouped = index_certificates([cert(LODGEMENT_DATE="2025-06-01")])
        self.assertIsNone(match_sale(SALE, grouped))

    def test_wrong_flat_is_not_matched(self):
        grouped = index_certificates([cert(ADDRESS1="APARTMENT 9")])
        self.assertIsNone(match_sale(SALE, grouped))

    def test_fuzzy_street_only_when_one_candidate(self):
        grouped = index_certificates([cert(ADDRESS2="10 HIGH STREET NORTH")])
        hit = match_sale(SALE, grouped)
        self.assertEqual(hit["epc_match"], "fuzzy")

    def test_two_different_fuzzy_streets_stay_blank(self):
        grouped = index_certificates([
            cert(ADDRESS2="10 HIGH STREET NORTH", LODGEMENT_DATE="2022-01-01"),
            cert(ADDRESS2="10 HIGH STREET SOUTH", LODGEMENT_DATE="2021-01-01", TOTAL_FLOOR_AREA="80"),
        ])
        self.assertIsNone(match_sale(SALE, grouped))

    def test_blank_or_absurd_area_is_ignored(self):
        grouped = index_certificates([
            cert(TOTAL_FLOOR_AREA=""),
            cert(TOTAL_FLOOR_AREA="0"),
            cert(TOTAL_FLOOR_AREA="9000"),
        ])
        self.assertIsNone(match_sale(SALE, grouped))


if __name__ == "__main__":
    unittest.main()
