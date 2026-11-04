#!/usr/bin/env python3
"""Attach EPC floor area and £/sq ft to Land Registry sales. Never invents an area.

England and Wales certificates come from the MHCLG domestic register
(TOTAL_FLOOR_AREA, square metres). The bulk file and the search API both
require a bearer token from a GOV.UK One Login account:

  https://get-energy-performance-data.communities.gov.uk/
  Authorization: Bearer <token from the account page>

  python3 scripts/match_epc_sales.py --epc-csv /path/to/certificates.csv
  EPC_BEARER_TOKEN=... python3 scripts/match_epc_sales.py

These sales files are HM Land Registry Price Paid for Manchester, Bristol and
Cheltenham. They are not Registers of Scotland, so the Scottish EPC register
is not applied to them.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import json
import os
import re
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SALES = {
    "Manchester": ROOT / "comps" / "sales_manchester.csv",
    "Bristol": ROOT / "comps" / "sales_bristol.csv",
    "Cheltenham": ROOT / "comps" / "sales_cheltenham.csv",
}
OUT = ROOT / "comps" / "ppsqft.json"
M2_TO_SQFT = 10.7639
NEAR_DAYS = 180
MAX_M2 = 2000
API = "https://api.get-energy-performance-data.communities.gov.uk"
CREDENTIAL = {
    "service": "Get energy performance of buildings data",
    "account": "https://get-energy-performance-data.communities.gov.uk/",
    "sign_in": "GOV.UK One Login",
    "token": "Bearer token shown on the account page after sign-in",
    "header": "Authorization: Bearer <token>",
    "bulk": API + "/api/files/domestic/csv",
    "bulk_info": API + "/api/files/domestic/csv/info",
    "search": API + "/api/domestic/search?postcode=",
    "field": "TOTAL_FLOOR_AREA (m2) on a domestic certificate",
    "scotland": "https://www.scottishepcregister.org.uk/ is the Scotland source. These Price Paid files do not contain Scottish sales.",
}

ABBREV = {
    "STREET": "ST", "ROAD": "RD", "AVENUE": "AVE", "DRIVE": "DR", "LANE": "LN",
    "CLOSE": "CL", "COURT": "CT", "GARDENS": "GDNS", "GARDEN": "GDN", "PLACE": "PL",
    "TERRACE": "TER", "CRESCENT": "CRES", "SQUARE": "SQ", "GROVE": "GR",
}


def norm_postcode(value: str) -> str:
    raw = re.sub(r"[^A-Z0-9]", "", (value or "").upper())
    if len(raw) < 5:
        return raw
    return raw[:-3] + " " + raw[-3:]


def _tokens(value: str) -> list[str]:
    text = re.sub(r"[^A-Z0-9]+", " ", (value or "").upper())
    drop = {"THE", "FLAT", "APARTMENT", "APT", "UNIT", "MAISONETTE"}
    return [part for part in text.split() if part and part not in drop]


def street_key(value: str) -> str:
    words = []
    for token in _tokens(value):
        if re.fullmatch(r"\d+[A-Z]?", token):
            continue
        words.append(ABBREV.get(token, token))
    return "".join(words)


def numbers(value: str) -> list[str]:
    return re.findall(r"\d+[A-Z]?", (value or "").upper())


FULL_PC = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b", re.I)
PLACE_TAIL = re.compile(
    r",\s*(?:greater manchester|manchester|bristol|cheltenham|gloucestershire|edinburgh|glasgow|salford|stockport|bolton|oldham|wigan|warrington|lancashire|cheshire|avon|city of)\b.*$",
    re.I,
)


def sale_day(value: str) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text[:10]) and len(text) >= 10:
        return text[:10]
    if re.fullmatch(r"\d{4}-\d{2}", text[:7]):
        year, month = int(text[:4]), int(text[5:7])
        if 1 <= month <= 12:
            return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    return ""


def comp_to_sale(row: dict) -> dict | None:
    """Turn one auction comp into the same fields the Price Paid matcher uses."""
    pc = norm_postcode(row.get("postcode") or "")
    address = row.get("address") or ""
    if not re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}", pc):
        found = FULL_PC.search(address)
        pc = norm_postcode(found.group(0)) if found else ""
    if not re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}", pc):
        return None
    cleaned = re.sub(r"\([^)]*\)", " ", address)
    cleaned = FULL_PC.sub(" ", cleaned)
    cleaned = PLACE_TAIL.sub(" ", cleaned)
    nums = numbers(cleaned)
    # Three or more numbers is a range or several buildings, not one dwelling.
    if len(set(nums)) > 2 or not nums:
        return None
    date = sale_day(row.get("sold_date") or row.get("date") or "")
    price = row.get("sold_price") or row.get("price")
    if not date or not price:
        return None
    return {
        "date": date,
        "price": price,
        "postcode": pc,
        "paon": nums[-1],
        "saon": "" if len(nums) == 1 or nums[0] == nums[-1] else nums[0],
        "street": re.sub(r"\d+[A-Z]?", " ", cleaned),
    }


def sale_parts(row: dict) -> dict:
    saon_nums = numbers(row.get("saon") or "")
    paon_nums = numbers(row.get("paon") or "")
    return {
        "postcode": norm_postcode(row.get("postcode") or ""),
        "paon": paon_nums[0] if paon_nums else "",
        "saon": saon_nums[0] if saon_nums else "",
        "street": street_key(row.get("street") or ""),
    }


def epc_parts(row: dict) -> dict | None:
    row = {str(k).upper().replace("-", "_"): v for k, v in row.items()}
    area = row.get("TOTAL_FLOOR_AREA")
    try:
        metres = float(str(area).strip())
    except (TypeError, ValueError):
        return None
    if not (0 < metres <= MAX_M2):
        return None
    lodged = (row.get("LODGEMENT_DATE") or row.get("lodgement-date") or row.get("lodgement_date") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", lodged):
        return None
    # Address line 3 is usually the locality, not the street. Using it makes
    # "High Street" look like a different road from "High Street, Bedminster".
    address = " ".join(row.get(key) or "" for key in ("ADDRESS1", "ADDRESS2"))
    if not address.strip():
        address = row.get("ADDRESS") or ""
    nums = numbers(address)
    # A leading flat number plus a building number: the last number before the street is the building.
    paon = nums[-1] if nums else ""
    saon = nums[0] if len(nums) > 1 else ""
    if saon == paon:
        saon = ""
    return {
        "postcode": norm_postcode(row.get("POSTCODE") or row.get("postcode") or ""),
        "paon": paon,
        "saon": saon,
        "street": street_key(address),
        "m2": metres,
        "lodged": lodged,
    }


def _days_after(sale: str, lodged: str) -> int:
    a = datetime.strptime(sale, "%Y-%m-%d")
    b = datetime.strptime(lodged, "%Y-%m-%d")
    return (b - a).days


def choose_certificate(certs: list[dict], sale_date: str) -> dict | None:
    dated = [cert for cert in certs if cert.get("lodged")]
    before = [cert for cert in dated if cert["lodged"] <= sale_date]
    if before:
        return max(before, key=lambda cert: cert["lodged"])
    near = [cert for cert in dated if 0 < _days_after(sale_date, cert["lodged"]) <= NEAR_DAYS]
    if not near:
        return None
    return min(near, key=lambda cert: cert["lodged"])


def match_sale(sale: dict, by_postcode: dict[str, list[dict]]) -> dict | None:
    parts = sale_parts(sale)
    if not parts["postcode"] or not parts["paon"] or not parts["street"]:
        return None
    pool = by_postcode.get(parts["postcode"]) or []
    exact = []
    fuzzy = []
    for cert in pool:
        if cert["paon"] != parts["paon"]:
            continue
        if parts["saon"] and cert["saon"] and cert["saon"] != parts["saon"]:
            continue
        if parts["saon"] and not cert["saon"]:
            continue
        if not parts["saon"] and cert["saon"]:
            continue
        if cert["street"] == parts["street"]:
            exact.append(cert)
        elif cert["street"] and (cert["street"].startswith(parts["street"]) or parts["street"].startswith(cert["street"])):
            # Extra text is only a suffix or prefix, typically a locality on the certificate.
            # A street buried inside a different building name is not a confident match.
            fuzzy.append(cert)
    chosen = choose_certificate(exact, sale["date"])
    if chosen:
        return _result(sale, chosen, "exact")
    if len(fuzzy) == 1 or (fuzzy and len({(c["street"], c["saon"]) for c in fuzzy}) == 1):
        chosen = choose_certificate(fuzzy, sale["date"])
        if chosen and len(fuzzy) == 1:
            return _result(sale, chosen, "fuzzy")
        if chosen and all(c["street"] == fuzzy[0]["street"] for c in fuzzy):
            return _result(sale, chosen, "fuzzy")
    return None


def _result(sale: dict, cert: dict, confidence: str) -> dict:
    sqft = round(cert["m2"] * M2_TO_SQFT, 1)
    price = float(sale["price"])
    per = round(price / sqft, 2) if sqft else None
    return {
        "floor_area_m2": round(cert["m2"], 1),
        "floor_area_sqft": sqft,
        "price_per_sqft": per,
        "epc_match": confidence,
        "epc_date": cert["lodged"],
    }


def index_certificates(rows) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        parsed = epc_parts(row)
        if parsed:
            grouped[parsed["postcode"]].append(parsed)
    return grouped


def quantile(sorted_values, p):
    n = len(sorted_values)
    if n == 0:
        return None
    if n == 1:
        return round(sorted_values[0], 2)
    idx = (n - 1) * p
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return round(sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac, 2)


def median_block(values: list[float]) -> dict:
    ordered = sorted(values)
    n = len(ordered)
    out = {"n": n, "median_gbp_per_sqft": None}
    if n >= 5:
        out["median_gbp_per_sqft"] = quantile(ordered, 0.5)
    elif n:
        out["withheld"] = "fewer than 5 confident matches"
    return out


def read_sales(path: Path):
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def summarise(matches_by_area: dict) -> dict:
    """matches_by_area[area][type] = list of £/sq ft. type 'all' is every type."""
    areas = {}
    for area, by_type in matches_by_area.items():
        areas[area] = {typ: median_block(values) for typ, values in by_type.items()}
    return areas


def load_epc_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)


def download_domestic_csv(token: str, dest: Path) -> None:
    request = urllib.request.Request(
        API + "/api/files/domestic/csv",
        headers={"Authorization": "Bearer " + token, "Accept": "application/zip, application/octet-stream"},
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def sales_counts() -> dict:
    counts = {}
    for area, path in SALES.items():
        types: dict[str, int] = defaultdict(int)
        n = 0
        for row in read_sales(path):
            n += 1
            types[row.get("type") or ""] += 1
        counts[area] = {"sales": n, "by_type": dict(types)}
    return counts


def empty_report(reason: str) -> dict:
    counts = sales_counts()
    areas = {}
    for area, info in counts.items():
        by_type = {"all": {"sales": info["sales"], "matched": 0, "median_gbp_per_sqft": None}}
        for typ, n in sorted(info["by_type"].items()):
            by_type[typ] = {"sales": n, "matched": 0, "median_gbp_per_sqft": None}
        areas[area] = by_type
    return {
        "schema": 1,
        "status": "no_epc_file",
        "reason": reason,
        "credential": CREDENTIAL,
        "constant_m2_to_sqft": M2_TO_SQFT,
        "sales": sum(info["sales"] for info in counts.values()),
        "matched": 0,
        "areas": areas,
        "matches": {},
    }


def build_report(epc_rows) -> dict:
    grouped = index_certificates(epc_rows)
    report = empty_report("Domestic certificates were read. Unmatched sales stay blank.")
    report["status"] = "matched"
    report["reason"] = "Floor area is the certificate TOTAL_FLOOR_AREA. £/sq ft uses the sale price and m2 x 10.7639. No area was guessed."
    matches = {}
    values = {area: defaultdict(list) for area in SALES}
    for area, path in SALES.items():
        for sale in read_sales(path):
            hit = match_sale(sale, grouped)
            if not hit or hit.get("price_per_sqft") is None:
                continue
            matches[sale["id"]] = hit
            values[area]["all"].append(hit["price_per_sqft"])
            values[area][sale.get("type") or ""].append(hit["price_per_sqft"])
    report["matched"] = len(matches)
    report["matches"] = matches
    for area, by_type in values.items():
        for typ, nums in by_type.items():
            block = report["areas"][area].setdefault(typ, {"sales": 0})
            block["matched"] = len(nums)
            med = median_block(nums)
            block["median_gbp_per_sqft"] = med["median_gbp_per_sqft"]
            if med.get("withheld"):
                block["withheld"] = med["withheld"]
    return report


def api_json(token: str, url: str) -> dict:
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "User-Agent": "LauritoCapital-comps/1.0",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def certificates_for_postcodes(token: str, postcodes: set[str]) -> list[dict]:
    """Search the domestic register and read each certificate's floor area."""
    rows = []
    seen_numbers = set()
    for postcode in sorted(postcodes):
        page = 1
        while page:
            payload = api_json(token, API + "/api/domestic/search?postcode=" + urllib.parse.quote(postcode) + "&page_size=100&current_page=" + str(page))
            fresh = 0
            for item in payload.get("data") or []:
                number = item.get("certificateNumber") or item.get("certificate_number")
                if not number or number in seen_numbers:
                    continue
                seen_numbers.add(number)
                fresh += 1
                cert = api_json(token, API + "/api/certificate?certificate_number=" + urllib.parse.quote(number))
                data = cert.get("data") or cert
                if isinstance(data, list):
                    data = data[0] if data else {}
                lodged = str(data.get("registration_date") or data.get("inspection_date") or "")[:10]
                rows.append({
                    "ADDRESS1": data.get("address_line_1") or "",
                    "ADDRESS2": data.get("address_line_2") or "",
                    "POSTCODE": data.get("postcode") or postcode,
                    "TOTAL_FLOOR_AREA": data.get("total_floor_area"),
                    "LODGEMENT_DATE": lodged,
                })
            if not fresh:
                break
            page = (payload.get("pagination") or {}).get("nextPage") or 0
        print("postcode_done", postcode, "certificates", len(rows), flush=True)
    return rows


def apply_yield_matches(path: Path, epc_rows) -> dict:
    grouped = index_certificates(epc_rows)
    document = json.loads(path.read_text())
    matched = 0
    eligible = 0
    by_city = {}
    for row in document.get("rows") or []:
        sale = comp_to_sale(row)
        hit = match_sale(sale, grouped) if sale else None
        if sale:
            eligible += 1
        city = row.get("city") or "Unknown"
        slot = by_city.setdefault(city, {"comps": 0, "eligible": 0, "matched": 0})
        slot["comps"] += 1
        if sale:
            slot["eligible"] += 1
        if hit:
            matched += 1
            slot["matched"] += 1
            row["floor_area_m2"] = hit["floor_area_m2"]
            row["floor_area_sqft"] = hit["floor_area_sqft"]
            row["price_per_sqft"] = hit["price_per_sqft"]
            row["epc_match"] = hit["epc_match"]
            row["epc_date"] = hit["epc_date"]
        else:
            row["floor_area_m2"] = None
            row["floor_area_sqft"] = None
            row["price_per_sqft"] = None
            row["epc_match"] = None
            row["epc_date"] = None
    path.write_text(json.dumps(document, indent=2) + "\n")
    return {"comps": len(document.get("rows") or []), "eligible": eligible, "matched": matched, "by_city": by_city}


def main() -> None:
    parser = argparse.ArgumentParser(description="Match Price Paid sales to domestic EPC floor area.")
    parser.add_argument("--epc-csv", type=Path, help="Domestic certificate CSV with TOTAL_FLOOR_AREA and LODGEMENT_DATE")
    parser.add_argument("--yields", type=Path, help="Auction comps JSON to attach £/sq ft")
    parser.add_argument("--token-file", type=Path, help="File containing only the EPC bearer token")
    args = parser.parse_args()
    if args.yields:
        token = args.token_file.read_text().strip() if args.token_file else os.environ.get("EPC_BEARER_TOKEN", "").strip()
        if not token:
            raise SystemExit("A token file is required to read domestic certificates for the comps.")
        postcodes = set()
        for row in json.loads(args.yields.read_text()).get("rows") or []:
            sale = comp_to_sale(row)
            if not sale:
                continue
            pc = sale["postcode"]
            # This token's register is England and Wales. Scottish postcodes stay unmatched.
            if pc.startswith("EH") or (pc.startswith("G") and not pc.startswith("GL")):
                continue
            postcodes.add(pc)
        print("comp_postcodes", len(postcodes), flush=True)
        rows = certificates_for_postcodes(token, postcodes)
        summary = apply_yield_matches(args.yields, rows)
        print(json.dumps(summary))
        return
    token = os.environ.get("EPC_BEARER_TOKEN", "").strip()
    if args.epc_csv:
        report = build_report(load_epc_csv(args.epc_csv))
    elif token:
        raise SystemExit(
            "EPC_BEARER_TOKEN is set, but the domestic full file is about 2.9 GB. "
            "Download " + API + "/api/files/domestic/csv with "
            "'Authorization: Bearer <token>' and rerun with --epc-csv. "
            "A postcode-by-postcode search of 20,000 postcodes would trip the 6,000-request / 5-minute limit."
        )
    else:
        report = empty_report(
            "No domestic EPC file was read. Bulk CSV and the search API both require a GOV.UK One Login bearer token "
            "from https://get-energy-performance-data.communities.gov.uk/. "
            "The unauthenticated call returns: Access denied. Bad authentication header. "
            "Scottish EPC and Registers of Scotland were not used: these sales are England and Wales Price Paid."
        )
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "sales": report["sales"], "matched": report["matched"], "out": str(OUT)}))


if __name__ == "__main__":
    main()
