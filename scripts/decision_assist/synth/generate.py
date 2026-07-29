"""Deterministic generator for the synthetic CPG/FMCG supply-chain star schema.

Domain: a LATAM-centred consumer-packaged-goods company (beverages & snacks) -
the same story the Genie space tells. Names are illustrative, not any real brand.

Pure and seeded: `generate(seed)` returns a dict of table_name -> list[row dict],
identical for a given seed (uses random.Random, no clock, no os entropy). Column
names + types match the live `main.supply_chain.*` schema exactly, so the same
detection rules fire. A fixed set of breaches is injected into the latest month so
all five SCM rules produce prompts with known severities (see BREACHES below).

Cardinality mirrors the live demo: 4 categories x 4 regions x 36 months.
"""
from __future__ import annotations

import random
from datetime import date

# ── fixed reference dimensions (match the live demo's names) ──────────────────
CATEGORIES = ["Carbonated Drinks", "Salty Snacks", "Juices & Water", "Cereals & Bars"]
REGIONS = ["APAC", "EMEA", "LATAM", "NA"]
FIRST_YEAR, N_MONTHS = 2023, 36  # 202301 .. 202512

SUB_CATEGORIES = {
    "Carbonated Drinks": [("Cola", "CO"), ("Citrus", "CI"), ("Diet", "DT")],
    "Salty Snacks": [("Potato Chips", "PC"), ("Tortilla Chips", "TC"), ("Extruded", "EX")],
    "Juices & Water": [("Nectars", "NE"), ("Still Water", "SW")],
    "Cereals & Bars": [("Oat Bars", "OB"), ("Breakfast Cereal", "BC")],
}
CAT_CODE = {"Carbonated Drinks": "CSD", "Salty Snacks": "SNK", "Juices & Water": "JUW", "Cereals & Bars": "CER"}

SUPPLIERS = [
    ("Sakura Flavours", 1, "Japan", "APAC", 2010),
    ("Rhein Packaging", 1, "Germany", "EMEA", 2005),
    ("Atlas Sweeteners", 2, "USA", "NA", 2015),
    ("Meridian Bottling", 2, "USA", "NA", 2020),
    ("Iberia Cold Chain", 2, "Spain", "EMEA", 2005),
    ("Nordic Oats", 1, "Sweden", "EMEA", 2008),
    ("Shanghai PET Resin", 2, "China", "APAC", 2013),
    ("Andes Fruit Concentrates", 3, "Chile", "LATAM", 2018),
    ("Ganges Spice Blends", 3, "India", "APAC", 2016),
    ("Copperfield Cartons", 2, "UK", "EMEA", 2007),
    ("Pacific Rim Films", 2, "Taiwan", "APAC", 2012),
    ("Volga Grain Co", 3, "Poland", "EMEA", 2019),
    ("Cascade Potato Farms", 1, "Canada", "NA", 2009),
    ("Sierra Corn Mills", 3, "Mexico", "LATAM", 2017),
    ("Kanto Tea Extracts", 2, "Japan", "APAC", 2011),
]

LOCATIONS = [
    ("DC-Chicago", "NA", "USA", "central"),
    ("DC-Dallas", "NA", "USA", "regional"),
    ("DC-Rotterdam", "EMEA", "Netherlands", "central"),
    ("DC-Singapore", "APAC", "Singapore", "central"),
    ("DC-Osaka", "APAC", "Japan", "regional"),
    ("DC-SaoPaulo", "LATAM", "Brazil", "regional"),
]

CARRIERS = [("Ground Express", "ground"), ("AirFast", "air"), ("OceanLine", "ocean"), ("RegionalHaul", "ground")]

# Injected breaches, keyed on the latest month. Each entry pins a KPI cell (or a
# supplier / category aggregate) into a target severity band so a specific rule
# fires. These mirror the live demo's headline findings.
BREACHES = {
    "otif": ("Carbonated Drinks", "EMEA", 86.9),      # SCM-OTIF-001 -> high
    "fill": ("Salty Snacks", "NA", 86.1),             # SCM-FILL-001 -> high (stockout)
    "forecast": ("Juices & Water", "APAC", 67.8, 18.0),  # SCM-FA-001 -> critical, +18% bias
    "inventory_category": "Cereals & Bars",           # SCM-INV-001 -> critical (avg DoS > 110)
    "supplier_name": "Sakura Flavours",               # SCM-SUPP-001 -> critical (on-time 72%)
}


def month_keys() -> list[int]:
    out = []
    for i in range(N_MONTHS):
        y = FIRST_YEAR + i // 12
        m = i % 12 + 1
        out.append(y * 100 + m)
    return out


def _dim_date(mks: list[int]) -> list[dict]:
    rows = []
    for mk in mks:
        y, m = mk // 100, mk % 100
        rows.append({
            "month_key": mk, "date_month": date(y, m, 1).isoformat(), "year": y,
            "quarter": (m - 1) // 3 + 1, "month_num": m,
            "month_name": date(y, m, 1).strftime("%B"),
        })
    return rows


def _dim_product(rng: random.Random) -> list[dict]:
    rows, key = [], 0
    per_cat = 120 // len(CATEGORIES)  # 30 products per category -> 120 total
    for cat in CATEGORIES:
        subs = SUB_CATEGORIES[cat]
        for i in range(per_cat):
            sub_name, sub_code = subs[i % len(subs)]
            n = i // len(subs)
            rows.append({
                "product_key": key,
                "sku": f"{CAT_CODE[cat]}-{sub_code}-{n:03d}",
                "product_name": f"{sub_name} Model {n}",
                "sub_category": sub_name, "category": cat,
                "product_family": rng.choice(["Core", "Extended", "Premium"]),
                "unit_cost": round(rng.uniform(8.0, 420.0), 2),
            })
            key += 1
    return rows


def _dim_supplier() -> list[dict]:
    return [{"supplier_key": i, "supplier_name": n, "supplier_tier": t,
             "country": c, "region": r, "onboarded_year": y}
            for i, (n, t, c, r, y) in enumerate(SUPPLIERS)]


def _dim_location() -> list[dict]:
    return [{"location_key": i, "dc_name": n, "region": r, "country": c, "dc_type": t}
            for i, (n, r, c, t) in enumerate(LOCATIONS)]


def _dim_carrier() -> list[dict]:
    return [{"carrier_key": i, "carrier_name": n, "mode": m} for i, (n, m) in enumerate(CARRIERS)]


def _is_last(mk: int, mks: list[int]) -> bool:
    return mk == mks[-1]


def _kpi_fact(rng: random.Random, mks: list[int], suppliers: list[dict]) -> list[dict]:
    rows = []
    sup_by_region: dict[str, list[int]] = {}
    for s in suppliers:
        sup_by_region.setdefault(s["region"], []).append(s["supplier_key"])
    for mk in mks:
        last = _is_last(mk, mks)
        for cat in CATEGORIES:
            for region in REGIONS:
                # healthy baselines with deterministic per-cell noise + slight drift
                drift = (mk - mks[0]) / 4000.0
                otif = round(96.0 - rng.uniform(0, 3.0) - drift, 2)
                fill = round(97.0 - rng.uniform(0, 2.5), 2)
                case_fill = round(97.5 - rng.uniform(0, 2.0), 2)
                fa = round(90.0 - rng.uniform(0, 6.0), 2)
                bias = round(rng.uniform(-6.0, 6.0), 2)
                sot = round(94.0 - rng.uniform(0, 5.0), 2)
                dos = round(rng.uniform(45.0, 64.0), 1)
                on_hand = rng.randint(40_000, 120_000)
                safety = int(on_hand * rng.uniform(0.55, 0.8))
                backorder = rng.randint(0, 400)
                orders_total = rng.randint(800, 2400)
                exp_cost = round(rng.uniform(2_000, 9_000), 2)
                otif_ded = round(rng.uniform(1_500, 6_000), 2)
                sla_pen = round(rng.uniform(800, 4_000), 2)

                # ── inject breaches (latest month only) ──
                if last and BREACHES["otif"][:2] == (cat, region):
                    otif = BREACHES["otif"][2]; sot = 84.0
                    otif_ded, sla_pen = 6890.0, 3735.0   # sum ≈ $10,625 (echoes live)
                if last and BREACHES["fill"][:2] == (cat, region):
                    fill = BREACHES["fill"][2]; safety = on_hand + rng.randint(4_000, 9_000)  # stockout
                    backorder = rng.randint(3_000, 6_000)
                if last and BREACHES["forecast"][:2] == (cat, region):
                    fa = BREACHES["forecast"][2]; bias = BREACHES["forecast"][3]
                if last and cat == BREACHES["inventory_category"]:
                    dos = round(rng.uniform(118.0, 138.0), 1); on_hand = rng.randint(1_000_000, 1_400_000)

                forecast_units = rng.randint(200_000, 900_000)
                actual_units = int(forecast_units / (1 + bias / 100.0))
                units_ordered = rng.randint(300_000, 1_200_000)
                units_shipped = int(units_ordered * fill / 100.0)
                units_on_time = int(units_shipped * otif / 100.0)
                units_in_full = int(units_shipped * case_fill / 100.0)
                orders_otif = int(orders_total * otif / 100.0)

                rows.append({
                    "month_key": mk, "category": cat, "region": region,
                    "primary_supplier_key": rng.choice(sup_by_region.get(region, [0])),
                    "orders_total": orders_total, "orders_otif": orders_otif,
                    "units_ordered": units_ordered, "units_shipped": units_shipped,
                    "units_on_time": units_on_time, "units_in_full": units_in_full,
                    "cases_ordered": units_ordered // 12, "cases_shipped_on_line": units_shipped // 12,
                    "lines_ordered": orders_total * 6, "lines_shipped_complete": int(orders_total * 6 * fill / 100.0),
                    "shipments_total": orders_total, "shipments_on_time": int(orders_total * otif / 100.0),
                    "deliveries_total": orders_total, "deliveries_carrier_on_time": int(orders_total * (sot / 100.0)),
                    "forecast_units": forecast_units, "actual_units": actual_units,
                    "on_hand_units": on_hand, "safety_stock_units": safety, "backorder_units": backorder,
                    "supplier_on_time_pct": round(sot, 2), "expedite_cost": exp_cost,
                    "otif_deduction_cost": round(otif_ded, 2), "sla_penalty_cost": round(sla_pen, 2),
                    "otif_pct": round(otif, 2), "case_fill_rate_pct": round(case_fill, 2),
                    "line_fill_rate_pct": round(fill, 2), "forecast_accuracy_pct": round(fa, 2),
                    "forecast_bias_pct": round(bias, 2),
                    "on_time_shipment_pct": round(min(99.5, otif + rng.uniform(0, 3)), 2),
                    "carrier_on_time_pct": round(min(99.5, sot + rng.uniform(0, 4)), 2),
                    "days_of_supply": dos,
                    "load_ts": f"{mk // 100:04d}-{mk % 100:02d}-28T06:00:00.000+00:00",
                })
    return rows


def _supplier_scorecard(rng: random.Random, mks: list[int], suppliers: list[dict]) -> list[dict]:
    rows = []
    target_name = BREACHES["supplier_name"]
    for mk in mks:
        last = _is_last(mk, mks)
        for s in suppliers:
            on_time = round(rng.uniform(88.0, 98.0), 2)
            if last and s["supplier_name"] == target_name:
                on_time = 72.0  # SCM-SUPP-001 critical (< 75)
            rows.append({
                "month_key": mk, "supplier_key": s["supplier_key"],
                "orders_supplied": rng.randint(120, 900),
                "on_time_pct": on_time,
                "defect_rate_pct": round(rng.uniform(0.2, 4.5), 2),
                "avg_lead_time_days": round(rng.uniform(6.0, 28.0), 1),
            })
    return rows


def _inventory_monthly(rng: random.Random, mks: list[int]) -> list[dict]:
    rows = []
    for mk in mks:
        for cat in CATEGORIES:
            for loc in range(len(LOCATIONS)):
                on_hand = rng.randint(4_000, 40_000)
                safety = int(on_hand * rng.uniform(0.5, 0.8))
                rows.append({
                    "month_key": mk, "category": cat, "location_key": loc,
                    "on_hand_units": on_hand, "safety_stock_units": safety,
                    "days_of_supply": round(rng.uniform(30.0, 130.0), 1),
                })
    return rows


def _forecast_monthly(rng: random.Random, mks: list[int]) -> list[dict]:
    rows = []
    for mk in mks:
        for cat in CATEGORIES:
            for region in REGIONS:
                fc = rng.randint(50_000, 300_000)
                bias = round(rng.uniform(-12.0, 18.0), 2)
                actual = int(fc / (1 + bias / 100.0))
                rows.append({
                    "month_key": mk, "category": cat, "region": region,
                    "forecast_units": fc, "actual_units": actual,
                    "wmape": round(abs(bias) + rng.uniform(1, 8), 2), "bias_pct": bias,
                })
    return rows


def _order_line(rng: random.Random, mks: list[int]) -> list[dict]:
    rows, oid = [], 0
    per_month = 3564 // len(mks)  # 99 lines/month -> 3564
    for mk in mks:
        y, m = mk // 100, mk % 100
        for _ in range(per_month):
            cat = rng.choice(CATEGORIES)
            region = rng.choice(REGIONS)
            units_ordered = rng.randint(50, 5000)
            on_time = rng.random() < 0.93
            in_full = rng.random() < 0.95
            units_shipped = units_ordered if in_full else int(units_ordered * rng.uniform(0.6, 0.98))
            promised = date(y, m, rng.randint(5, 25))
            ship = promised if on_time else date(y, m, min(28, promised.day + rng.randint(1, 6)))
            rows.append({
                "order_line_id": oid, "month_key": mk, "order_id": f"ORD-{mk}-{oid:05d}",
                "category": cat, "region": region, "location_key": rng.randint(0, len(LOCATIONS) - 1),
                "primary_supplier_key": rng.randint(0, len(SUPPLIERS) - 1),
                "units_ordered": units_ordered, "units_shipped": units_shipped,
                "on_time_flag": on_time, "in_full_flag": in_full, "otif_flag": on_time and in_full,
                "promised_date": promised.isoformat(), "ship_date": ship.isoformat(),
            })
            oid += 1
    return rows


def generate(seed: int = 20260723) -> dict[str, list[dict]]:
    """Return the full synthetic star schema, deterministic for `seed`."""
    rng = random.Random(seed)
    mks = month_keys()
    suppliers = _dim_supplier()
    return {
        "dim_date": _dim_date(mks),
        "dim_product": _dim_product(rng),
        "dim_supplier": suppliers,
        "dim_location": _dim_location(),
        "dim_carrier": _dim_carrier(),
        "fact_order_line": _order_line(rng, mks),
        "fact_inventory_monthly": _inventory_monthly(rng, mks),
        "fact_forecast_monthly": _forecast_monthly(rng, mks),
        "fact_supply_chain_kpi_monthly": _kpi_fact(rng, mks, suppliers),
        "fact_supplier_scorecard_monthly": _supplier_scorecard(rng, mks, suppliers),
    }


if __name__ == "__main__":
    data = generate()
    for name, rows in data.items():
        print(f"{name:36s} {len(rows):>6d} rows")
