"""Supply-chain KPI measures — DETERMINED FROM STANDARD DOMAIN RULES.

The source contract withheld both the measure formulas AND the measure values, so the
base fact tables carry no measures. This module adds a clearly-labelled SYNTHETIC measure
layer so the POC can answer real KPI questions:

  * synthetic INPUT columns are appended to each fact (base contract columns untouched);
  * metric-view measures use TEXTBOOK supply-chain formulas — additive components are
    SUM()'d and only THEN divided (rates are never averaged);
  * every object is commented as synthetic + standard-formula, NOT a reproduction of the
    source's redacted logic.

Run:  python -m scripts.synthetic_poc.supply_chain_measures
Env:  DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_NAME
"""

from __future__ import annotations

from .databricks_client import DatabricksClient

CAT, SCH = "workspace", "databrickspractice"

# Deterministic pseudo-random per row: pmod(hash(<keys>, '<salt>'), range).
# Databricks UPDATE forbids rand(); hashing row keys is deterministic + reproducible.
KEYS = {
    "tbl_pp_syn_fct_ofr": "country_id, plant_id, sales_channel_text, year, month, week",
    "tbl_pp_syn_fct_operations": "country_id, plant_id, year, month",
    "tbl_pp_syn_fct_performance": "country_id, year, month",
}


def _iexpr(K, salt, lo, hi):            # int in [lo, hi]
    return f"{lo} + pmod(hash({K}, '{salt}'), {hi - lo + 1})"


def _dexpr(K, salt, lo, hi, nd=2):      # double in [lo, hi]
    return f"ROUND({lo} + (pmod(hash({K}, '{salt}'), 100000)/100000.0)*{hi - lo}, {nd})"


# name, type, expr-builder(keys)->sql, phase (1 = independent, 2 = derived)
INPUTS = {
    "tbl_pp_syn_fct_ofr": [
        ("ordered_qty", "int", lambda K: _iexpr(K, "ord", 100, 10000), 1),
        ("order_lines", "int", lambda K: _iexpr(K, "lines", 1, 50), 1),
        ("delivered_qty", "int",
         lambda K: f"CAST(ordered_qty * (0.70 + pmod(hash({K}, 'dlv'), 31)/100.0) AS INT)", 2),
        ("otif_lines", "int",
         lambda K: f"CAST(order_lines * (0.75 + pmod(hash({K}, 'otif'), 26)/100.0) AS INT)", 2),
    ],
    "tbl_pp_syn_fct_operations": [
        ("hours_worked", "double", lambda K: _dexpr(K, "hrs", 1000, 50000, 1), 1),
        ("recordable_incidents", "int", lambda K: _iexpr(K, "ri", 0, 5), 1),
        ("lost_time_injuries", "int", lambda K: _iexpr(K, "lti", 0, 3), 1),
        ("units_produced", "int", lambda K: _iexpr(K, "up", 1000, 500000), 1),
        ("ghg_tco2e", "double", lambda K: _dexpr(K, "ghg", 10, 5000, 2), 1),
        ("energy_kwh", "double", lambda K: _dexpr(K, "en", 1000, 1000000, 1), 1),
        ("units_planned", "int",
         lambda K: f"CAST(units_produced/(0.80 + pmod(hash({K}, 'pl'), 26)/100.0) AS INT)", 2),
        ("units_defect", "int",
         lambda K: f"CAST(units_produced * (pmod(hash({K}, 'df'), 200)/10000.0) AS INT)", 2),
    ],
    "tbl_pp_syn_fct_performance": [
        ("forecast_qty", "double", lambda K: _dexpr(K, "fc", 10000, 1000000, 1), 1),
        ("net_sales_usd", "double", lambda K: _dexpr(K, "ns", 100000, 10000000, 2), 1),
        ("hours_worked", "double", lambda K: _dexpr(K, "hrs", 1000, 50000, 1), 1),
        ("lost_time_injuries", "int", lambda K: _iexpr(K, "lti", 0, 3), 1),
        ("actual_qty", "double",
         lambda K: f"ROUND(forecast_qty * (0.70 + pmod(hash({K}, 'act'), 61)/100.0), 1)", 2),
        ("cogs_usd", "double",
         lambda K: f"ROUND(net_sales_usd * (0.50 + pmod(hash({K}, 'cogs'), 36)/100.0), 2)", 2),
    ],
}

# --- metric-view definitions (standard supply-chain formulas) -----------------
DIMS_COMMON = [
    ("Year", "year"), ("Quarter", "quarter"), ("Month", "month"),
    ("Country", "country_id"),
]
METRICS = {
    "mtr_pp_syn_ltm_sc_fct_ofr": {
        "source": "tbl_pp_syn_fct_ofr",
        "dims": DIMS_COMMON + [("Plant", "plant_id"), ("Sales Channel", "sales_channel_text")],
        "measures": [
            ("Ordered Qty", "SUM(ordered_qty)"),
            ("Delivered Qty", "SUM(delivered_qty)"),
            ("Order Lines", "SUM(order_lines)"),
            ("Order Fill Rate Pct", "100.0*SUM(delivered_qty)/NULLIF(SUM(ordered_qty),0)"),
            ("OTIF Pct", "100.0*SUM(otif_lines)/NULLIF(SUM(order_lines),0)"),
        ],
    },
    "mtr_pp_syn_ltm_sc_fct_operations": {
        "source": "tbl_pp_syn_fct_operations",
        "dims": DIMS_COMMON + [("Plant", "plant_id")],
        "measures": [
            ("Hours Worked", "SUM(hours_worked)"),
            ("Units Produced", "SUM(units_produced)"),
            ("LTIR", "200000.0*SUM(lost_time_injuries)/NULLIF(SUM(hours_worked),0)"),
            ("TRIR", "200000.0*SUM(recordable_incidents)/NULLIF(SUM(hours_worked),0)"),
            ("Manufacturing Fill Rate Pct", "100.0*SUM(units_produced)/NULLIF(SUM(units_planned),0)"),
            ("Quality Complaint PPM", "1000000.0*SUM(units_defect)/NULLIF(SUM(units_produced),0)"),
            ("GHG Emissions tCO2e", "SUM(ghg_tco2e)"),
            ("Energy Intensity kWh per Unit", "SUM(energy_kwh)/NULLIF(SUM(units_produced),0)"),
        ],
    },
    "mtr_pp_syn_ltm_sc_fct_performance": {
        "source": "tbl_pp_syn_fct_performance",
        "dims": DIMS_COMMON,
        "measures": [
            ("Net Sales USD", "SUM(net_sales_usd)"),
            ("COGS USD", "SUM(cogs_usd)"),
            ("Gross Margin Pct", "100.0*(SUM(net_sales_usd)-SUM(cogs_usd))/NULLIF(SUM(net_sales_usd),0)"),
            ("Forecast Accuracy Pct", "100.0*(1-SUM(ABS(actual_qty-forecast_qty))/NULLIF(SUM(actual_qty),0))"),
            ("Forecast Bias Pct", "100.0*SUM(actual_qty-forecast_qty)/NULLIF(SUM(actual_qty),0)"),
            ("LTIR", "200000.0*SUM(lost_time_injuries)/NULLIF(SUM(hours_worked),0)"),
        ],
    },
}

_NOTE = ("SYNTHETIC measure layer. Formulas are STANDARD supply-chain definitions applied by "
         "PulsePlay; inputs are synthetic. NOT a reproduction of the source redacted formulas or values.")


def _existing_cols(c, table):
    rows = c.rows(
        f"SELECT column_name FROM information_schema.columns "
        f"WHERE table_schema='{SCH}' AND table_name='{table}'", CAT, SCH)
    return {r[0] for r in rows}


def add_inputs(c: DatabricksClient):
    for table, cols in INPUTS.items():
        K = KEYS[table]
        have = _existing_cols(c, table)
        to_add = [(n, t) for (n, t, _e, _p) in cols if n not in have]
        if to_add:
            defs = ", ".join(f"`{n}` {t}" for n, t in to_add)
            c.execute(f"ALTER TABLE {CAT}.{SCH}.{table} ADD COLUMNS ({defs})", CAT, SCH)
        for phase in (1, 2):
            sets = ", ".join(f"`{n}` = {mk(K)}" for (n, _t, mk, p) in cols if p == phase)
            if sets:
                c.execute(f"UPDATE {CAT}.{SCH}.{table} SET {sets}", CAT, SCH)
        print(f"  inputs ready: {table} (+{len(to_add)} cols)")


def build_metric_views(c: DatabricksClient):
    for name, spec in METRICS.items():
        dims = "\n".join(f"  - name: {d}\n    expr: {e}" for d, e in spec["dims"])
        meas = "\n".join(f"  - name: {m}\n    expr: {e}" for m, e in spec["measures"])
        yaml = (f"version: 1.1\nsource: {CAT}.{SCH}.{spec['source']}\n"
                f"dimensions:\n{dims}\nmeasures:\n{meas}\n")
        ddl = (f"CREATE OR REPLACE VIEW {CAT}.{SCH}.{name}\n"
               f"COMMENT '{_NOTE}'\nWITH METRICS\nLANGUAGE YAML\nAS $$\n{yaml}$$")
        c.execute(ddl, CAT, SCH)
        print(f"  metric view: {name} ({len(spec['measures'])} measures)")


def validate(c: DatabricksClient):
    checks = [
        ("OFR fill rate / OTIF by year",
         "SELECT Year, ROUND(MEASURE(`Order Fill Rate Pct`),2), ROUND(MEASURE(`OTIF Pct`),2) "
         f"FROM {CAT}.{SCH}.mtr_pp_syn_ltm_sc_fct_ofr GROUP BY Year ORDER BY Year"),
        ("Operations LTIR / fill rate by year",
         "SELECT Year, ROUND(MEASURE(`LTIR`),3), ROUND(MEASURE(`Manufacturing Fill Rate Pct`),2) "
         f"FROM {CAT}.{SCH}.mtr_pp_syn_ltm_sc_fct_operations GROUP BY Year ORDER BY Year"),
        ("Performance margin / forecast accuracy by year",
         "SELECT Year, ROUND(MEASURE(`Gross Margin Pct`),2), ROUND(MEASURE(`Forecast Accuracy Pct`),2) "
         f"FROM {CAT}.{SCH}.mtr_pp_syn_ltm_sc_fct_performance GROUP BY Year ORDER BY Year"),
    ]
    for label, sql in checks:
        rows = c.rows(sql, CAT, SCH)
        print(f"  [{label}] -> {rows}")


def main():
    c = DatabricksClient()
    print("resolving warehouse:", c.resolve_warehouse())
    print("1) adding synthetic measure inputs")
    add_inputs(c)
    print("2) building standard-formula metric views")
    build_metric_views(c)
    print("3) validating with MEASURE()")
    validate(c)
    print("done.")


if __name__ == "__main__":
    main()
