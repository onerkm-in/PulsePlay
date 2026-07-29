"""Unit tests for the synthetic generator — pure, no network.

Guards the two properties the demo depends on: determinism (same seed → identical
rows) and the injected breaches (so all five SCM rules keep firing at the expected
severities). Also checks cardinality matches the live schema.
"""
from __future__ import annotations

from scripts.decision_assist.synth.generate import generate, month_keys, CATEGORIES, REGIONS
from scripts.decision_assist.synth import ddl

EXPECTED_COUNTS = {
    "dim_date": 36, "dim_product": 120, "dim_supplier": 15, "dim_location": 6,
    "dim_carrier": 4, "fact_order_line": 3564, "fact_inventory_monthly": 864,
    "fact_forecast_monthly": 576, "fact_supply_chain_kpi_monthly": 576,
    "fact_supplier_scorecard_monthly": 540,
}


def test_deterministic():
    assert generate(20260723) == generate(20260723)


def test_seed_changes_data():
    assert generate(1) != generate(2)


def test_cardinality_matches_live():
    data = generate()
    assert {k: len(v) for k, v in data.items()} == EXPECTED_COUNTS


def test_month_keys():
    mks = month_keys()
    assert mks[0] == 202301 and mks[-1] == 202512 and len(mks) == 36


def _cell(kpi, mk, cat, region):
    return next(r for r in kpi if r["month_key"] == mk and r["category"] == cat and r["region"] == region)


def test_breach_otif_high():
    kpi = generate()["fact_supply_chain_kpi_monthly"]
    last = max(r["month_key"] for r in kpi)
    c = _cell(kpi, last, "Carbonated Drinks", "EMEA")
    assert 85.0 <= c["otif_pct"] < 90.0                 # 'high' band for SCM-OTIF-001
    assert c["supplier_on_time_pct"] < 85               # drives high-confidence root cause
    assert c["otif_deduction_cost"] + c["sla_penalty_cost"] > 5000  # USD impact present


def test_breach_fill_stockout():
    kpi = generate()["fact_supply_chain_kpi_monthly"]
    last = max(r["month_key"] for r in kpi)
    c = _cell(kpi, last, "Salty Snacks", "NA")
    assert 85.0 <= c["line_fill_rate_pct"] < 90.0       # 'high' band for SCM-FILL-001
    assert c["on_hand_units"] < c["safety_stock_units"]  # stockout signal
    assert c["backorder_units"] > 0


def test_breach_forecast_critical():
    kpi = generate()["fact_supply_chain_kpi_monthly"]
    last = max(r["month_key"] for r in kpi)
    c = _cell(kpi, last, "Juices & Water", "APAC")
    assert c["forecast_accuracy_pct"] < 70.0            # 'critical' for SCM-FA-001
    assert abs(c["forecast_bias_pct"]) >= 10            # persistent bias


def test_breach_inventory_category_critical():
    kpi = generate()["fact_supply_chain_kpi_monthly"]
    last = max(r["month_key"] for r in kpi)
    dos = [r["days_of_supply"] for r in kpi if r["month_key"] == last and r["category"] == "Cereals & Bars"]
    assert sum(dos) / len(dos) > 110.0                  # avg DoS 'critical' for SCM-INV-001


def test_breach_supplier_critical():
    sc = generate()["fact_supplier_scorecard_monthly"]
    last = max(r["month_key"] for r in sc)
    flavours_supplier = next(s["supplier_key"] for s in generate()["dim_supplier"] if s["supplier_name"] == "Sakura Flavours")
    row = next(r for r in sc if r["month_key"] == last and r["supplier_key"] == flavours_supplier)
    assert row["on_time_pct"] < 75.0                    # 'critical' for SCM-SUPP-001


def test_baseline_does_not_over_trigger():
    """Non-breach latest-month KPI cells stay inside target bands so only the
    injected breaches fire (no accidental extra prompts from baseline noise)."""
    kpi = generate()["fact_supply_chain_kpi_monthly"]
    last = max(r["month_key"] for r in kpi)
    breaches = {("Carbonated Drinks", "EMEA"), ("Salty Snacks", "NA"), ("Juices & Water", "APAC")}
    for r in kpi:
        if r["month_key"] != last or (r["category"], r["region"]) in breaches:
            continue
        if r["category"] == "Cereals & Bars":
            continue  # inventory breach is category-wide
        assert r["otif_pct"] >= 92.0                    # not below SCM-OTIF medium
        assert r["line_fill_rate_pct"] >= 93.0          # not below SCM-FILL medium
        assert r["forecast_accuracy_pct"] >= 82.0       # not below SCM-FA medium


def test_ddl_columns_cover_every_generated_field():
    """Every generated column must exist in the DDL (so INSERT never references an
    unknown column)."""
    data = generate()
    for table, rows in data.items():
        ddl_cols = {c for c, _ in ddl.TABLES[table]}
        gen_cols = set(rows[0].keys())
        assert gen_cols == ddl_cols, f"{table}: {gen_cols ^ ddl_cols}"
