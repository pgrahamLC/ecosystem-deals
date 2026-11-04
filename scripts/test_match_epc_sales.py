#!/usr/bin/env python3
"""Matcher rules: exact and fuzzy address, date choice, and no guessed area."""
import unittest

from match_epc_sales import comp_to_sale, index_certificates, match_sale

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

    def test_comp_address_uses_the_building_number_and_full_postcode(self):
        sale = comp_to_sale({
            "address": "Apartment 307, 6 Ludgate Hill, Manchester",
            "postcode": "M4 4BW",
            "sold_price": 86000,
            "sold_date": "2026-07-01",
        })
        self.assertEqual(sale["paon"], "6")
        self.assertEqual(sale["saon"], "307")
        self.assertEqual(sale["postcode"], "M4 4BW")
        grouped = index_certificates([cert(
            ADDRESS1="Apartment 307", ADDRESS2="6 Ludgate Hill", POSTCODE="M4 4BW",
            LODGEMENT_DATE="2024-01-01", TOTAL_FLOOR_AREA="55",
        )])
        hit = match_sale(sale, grouped)
        self.assertEqual(hit["epc_match"], "exact")
        self.assertEqual(hit["floor_area_m2"], 55.0)

    def test_month_precision_sale_date_uses_the_end_of_that_month(self):
        sale = comp_to_sale({
            "address": "344 Stapleton Road, Easton",
            "postcode": "BS5 0NN",
            "sold_price": 752500,
            "sold_date": "2026-04",
        })
        self.assertEqual(sale["date"], "2026-04-30")
        self.assertEqual(sale["paon"], "344")

    def test_outward_only_postcode_is_not_a_match(self):
        self.assertIsNone(comp_to_sale({
            "address": "Apartment 504, 25 Simpson Street, Manchester, M4",
            "postcode": "",
            "sold_price": 98000,
            "sold_date": "2026-10-21",
        }))

    def test_blank_or_absurd_area_is_ignored(self):
        grouped = index_certificates([
            cert(TOTAL_FLOOR_AREA=""),
            cert(TOTAL_FLOOR_AREA="0"),
            cert(TOTAL_FLOOR_AREA="9000"),
        ])
        self.assertIsNone(match_sale(SALE, grouped))


if __name__ == "__main__":
    unittest.main()
