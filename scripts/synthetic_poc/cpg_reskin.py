"""Reskin the synthetic POC tables as a realistic LATAM CPG/FMCG supply chain.

Keeps the governed schema + relationships/cardinality, but replaces masked-pattern
gibberish with believable consumer-goods values (real geography, standard trade
channels, product categories, realistic KPI magnitudes) and coherent rows
(plant names match their country; ISO codes match names). Facts also carry the
supply-chain KPI input columns so the metric views recompute realistic KPIs.

SYNTHETIC + ILLUSTRATIVE — no real company's confidential data, no brand trademarks.

Run: python -m scripts.synthetic_poc.cpg_reskin
Env: DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_NAME
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

from .contract_loader import BUILD_TARGETS, load_package
from .databricks_client import DatabricksClient
from . import sqlgen
from . import cpg_domains as D

CAT, SCH = "workspace", "databrickspractice"
REPO_ROOT = Path(__file__).resolve().parents[2]
SCALE = 0.01

# As-of anchor: data spans the last two COMPLETE calendar years plus the current
# year through the last complete month. As of 30-Jun-2026 that is:
#   2024 Jan-Dec (full) · 2025 Jan-Dec (full) · 2026 Jan-Jun (YTD).
# Rows spread evenly across every month so current-YTD vs prior-YTD comparisons
# are apples-to-apples and nothing lands after the as-of boundary.
AS_OF_YEAR, AS_OF_MONTH = 2026, 6
COMPLETE_YEARS_BACK = 2


def _periods():
    start_year = AS_OF_YEAR - COMPLETE_YEARS_BACK
    out = []
    for y in range(start_year, AS_OF_YEAR + 1):
        last_m = AS_OF_MONTH if y == AS_OF_YEAR else 12
        out += [(y, m) for m in range(1, last_m + 1)]
    return out


PERIODS = _periods()          # 12 + 12 + 6 = 30 (year, month) pairs
Y0 = PERIODS[0][0]            # first year in window (for month_order origin)


def h(*p) -> int:
    return int(hashlib.sha256("|".join(str(x) for x in p).encode()).hexdigest()[:12], 16)


def round_half_up(x: float) -> int:
    import decimal
    return int(decimal.Decimal(str(x)).quantize(0, rounding=decimal.ROUND_HALF_UP))


# ---- year-over-year trend + seasonality --------------------------------------
# A synthetic 3-year dataset should tell a story, not sit flat. These deterministic
# factors give volumes a mild growth + seasonal shape and let the rate KPIs drift
# (service up, margin up, emissions down) so prior-period comparisons are meaningful.
def _year_idx(year: int) -> int:
    return year - Y0                                   # 2024->0, 2025->1, 2026->2


def _vol_factor(year: int, month: int) -> float:
    """~6% YoY growth with a ±8% mid-year seasonal bump."""
    growth = 1.06 ** _year_idx(year)
    season = 1 + 0.08 * math.sin((month - 1) / 12.0 * 2 * math.pi)
    return growth * season


# ---- KPI input columns per fact (realistic CPG magnitudes) -------------------
def kpi_inputs(short: str, i: int, year: int = None, month: int = None) -> dict:
    yi = _year_idx(year) if year is not None else 0
    vf = _vol_factor(year, month) if year is not None else 1.0
    if short.endswith("fct_ofr"):
        ordered = round_half_up((1000 + h("ord", i) % 99000) * vf)
        lines = 5 + h("lines", i) % 195
        # fill-rate & OTIF improve ~0.8pp / 1.0pp per year (service recovery story)
        dlv_ratio = 0.95 + 0.008 * yi + (h("dlv", i) % 50) / 1000.0
        otif_ratio = 0.88 + 0.010 * yi + (h("otif", i) % 90) / 1000.0
        return {
            "ordered_qty": ("int", ordered),
            "order_lines": ("int", lines),
            "delivered_qty": ("int", round_half_up(ordered * dlv_ratio)),
            "otif_lines": ("int", round_half_up(lines * min(otif_ratio, 1.0))),
        }
    if short.endswith("fct_operations"):
        # center x trend x modest noise so trends survive the ~28-rows/period grain
        prod = round_half_up(1_000_000 * vf * (0.85 + (h("up", i) % 31) / 100.0))
        # GHG trends DOWN ~5%/yr (decarbonization), independent of volume growth
        ghg = 7500 * (0.95 ** yi) * (0.85 + (h("ghg", i) % 31) / 100.0)
        return {
            "hours_worked": ("double", round(110000 * (0.85 + (h("hrs", i) % 31) / 100.0), 1)),
            "recordable_incidents": ("int", 1 if h("ri", i) % 5 == 0 else 0),
            "lost_time_injuries": ("int", 1 if h("lti", i) % 9 == 0 else 0),
            "units_produced": ("int", prod),
            "units_planned": ("int", round_half_up(prod / (0.96 + (h("pl", i) % 40) / 1000.0))),
            "units_defect": ("int", round_half_up(prod * (50 + h("df", i) % 450) / 1_000_000.0)),
            "ghg_tco2e": ("double", round(ghg, 2)),
            "energy_kwh": ("double", round(2_500_000 * (0.97 ** yi) * (0.85 + (h("en", i) % 31) / 100.0), 1)),
        }
    # performance (177 rows -> tight noise band so the YoY/YTD trend shows)
    fc = 750_000 * vf * (0.92 + (h("fc", i) % 17) / 100.0)
    ns = 25_000_000 * vf * (0.92 + (h("ns", i) % 17) / 100.0)
    # COGS ratio falls ~1pp/yr -> gross margin trends up
    cogs_ratio = 0.44 - 0.010 * yi + (h("cg", i) % 40) / 1000.0
    return {
        "forecast_qty": ("double", round(fc + 0.0, 1)),
        "actual_qty": ("double", round(fc * (0.82 + (h("act", i) % 33) / 100.0), 1)),
        "net_sales_usd": ("double", round(ns + 0.0, 2)),
        "cogs_usd": ("double", round(ns * cogs_ratio, 2)),
        "hours_worked": ("double", round(20000 + h("hrs", i) % 180000 + 0.0, 1)),
        "lost_time_injuries": ("int", 1 if h("lti", i) % 9 == 0 else 0),
    }


# ---- dimensions --------------------------------------------------------------
def build_dims():
    countries = D.build_countries()
    channels = D.build_sales_channels()
    plants = D.build_plants(602, [c["country_id"] for c in countries])
    return {"vw_ltm_sc_dm_countries": countries,
            "vw_ltm_sc_dm_sales_channel": channels,
            "vw_ltm_sc_dm_plants": plants}


def dim_cols(package, short):
    tc = package["contracts"][short]
    return [c.name for c in tc.physical_columns], [c.type for c in tc.physical_columns]


# ---- fact value dispatch (coherent) ------------------------------------------
def fact_value(col, typ, i, ctx, y0, y1):
    n = col.lower()
    if n == "country_id":
        return ctx["country_id"]
    if n in ("country_text", "country_name"):
        return ctx["country_text"]
    if n == "ou":
        return ctx["ou"]
    if n == "plant_id":
        return ctx["plant_id"]
    if n in ("plant_name", "plant_descr", "descr"):
        return ctx["plant_descr"]
    if n in ("plant_location", "location"):
        return ctx["plant_location"]
    if n in ("plant_region", "region"):
        return ctx["plant_region"]
    if n == "loc_type":
        return ctx["loc_type"]
    if n == "sales_channel_text":
        return ctx["channel"]
    if n == "country_channel":
        return ctx["country_channel"]
    if n == "sales_channel_id":
        return f"CH{h('chid', i) % 90 + 10}"
    if n == "year":
        return ctx["year"]
    if n == "month":
        return ctx["month"]
    if n == "week":
        return ctx["week"]
    if n == "quarter":
        return ctx["quarter"]
    if n == "month_order":
        return (ctx["year"] - y0) * 12 + ctx["month"]
    if n == "quarter_name":
        return D.QUARTER_NAMES[ctx["quarter"] - 1]
    if n in ("month_name", "month_text"):
        return D.MONTH_NAMES[ctx["month"] - 1]
    if n == "month_year":
        return f"{ctx['year']:04d}-{ctx['month']:02d}-01 00:00:00"
    if n == "week_label":
        return f"W{ctx['week']:02d}"
    if n == "week_date" or typ == "timestamp":
        return f"{ctx['year']:04d}-{ctx['month']:02d}-{1 + h('d', i) % 27:02d} 00:00:00"
    if n == "source_kpi":
        return D.pick(D.KPI_FAMILIES, "kpi", i)
    if n == "period_type":
        return D.pick(D.PERIOD_TYPES, "pt", i)
    if n == "job_type":
        return D.pick(D.CATEGORIES, "cat", i)
    if n in ("reject_text",):
        return D.pick(D.REJECT_REASONS, "rej", i)
    if n == "reject_id":
        return f"R{h('rid', i) % 900 + 100}"
    if n == "material_id":
        return f"SKU{h('sku', i) % 9000 + 1000}"
    if n == "sales_office":
        return ctx["plant_region"]
    if typ in ("int", "bigint"):
        return h(n, i) % 1000
    if typ == "double":
        return round((h(n, i) % 100000) / 100.0, 2)
    return D.pick(D.CATEGORIES, n, i)  # generic string fallback


def fk_domain(rels, fk_table_short, fk_col, parent_keys):
    """Return a child-key list reproducing distinct-key integrity/orphans."""
    rel = next((r for r in rels if r.fk_table == fk_table_short and r.fk_column == fk_col), None)
    if not rel:
        return None
    distinct = max(1, rel.distinct_child_keys)
    orphan_n = min(rel.orphan_keys, distinct)
    valid_n = distinct - orphan_n
    parents = list(dict.fromkeys(parent_keys))
    valid = [parents[h("vk", fk_col, k) % len(parents)] for k in range(valid_n)]
    valid = list(dict.fromkeys(valid)) or parents[:1]
    orphans = [f"ZZ{k:02d}" for k in range(orphan_n)]  # synthetic non-parent keys
    return valid + orphans


def build_fact(package, short, dest_rows, dims, rels):
    tc = package["contracts"][short]
    y0, y1 = Y0, AS_OF_YEAR
    phys = tc.physical_columns
    ctable = {c["country_id"]: c for c in dims["vw_ltm_sc_dm_countries"]}
    ptable = {p["plant_id"]: p for p in dims["vw_ltm_sc_dm_plants"]}
    country_keys = list(ctable)
    plant_keys = list(ptable)
    channels = dims["vw_ltm_sc_dm_sales_channel"]

    dom_country = fk_domain(rels, short, "country_id", country_keys)
    dom_plant = fk_domain(rels, short, "plant_id", plant_keys) if any(c.name == "plant_id" for c in phys) else None
    dom_channel = [c["sales_channel_text"] for c in channels]

    kpi_names = list(kpi_inputs(short, 0).keys())
    kpi_types = [kpi_inputs(short, 0)[k][0] for k in kpi_names]
    names = [c.name for c in phys] + kpi_names
    types = [c.type for c in phys] + kpi_types

    rows = []
    for i in range(dest_rows):
        cid = dom_country[h("fkc", i) % len(dom_country)]
        crow = ctable.get(cid, {"country_text": f"Region {cid}", "ou": "LATAM"})
        if dom_plant:
            pid = dom_plant[h("fkp", i) % len(dom_plant)]
        else:
            pid = plant_keys[h("fkp", i) % len(plant_keys)]
        prow = ptable.get(pid, {"descr": f"Site {pid}", "location": f"{pid}", "region": "Central", "loc_type": "Plant"})
        ch = channels[h("fkch", i) % len(channels)]
        # proportional allocation over periods: each (year, month) gets an equal
        # share (+/-1 row), with any remainder spread evenly rather than clustered
        # in the tail -- so volume KPIs scale cleanly with the trend and
        # YTD-vs-prior-YTD is apples-to-apples even on the sparse (177-row) facts.
        year, month = PERIODS[i * len(PERIODS) // dest_rows]
        # week-of-year kept coherent with the month (~4.3 weeks per month)
        week = (month - 1) * 4 + 1 + h("wk", i) % 4
        ctx = {
            "country_id": cid, "country_text": crow["country_text"], "ou": crow["ou"],
            "plant_id": pid, "plant_descr": prow["descr"], "plant_location": prow["location"],
            "plant_region": prow["region"], "loc_type": prow["loc_type"],
            "channel": ch["sales_channel_text"], "country_channel": ch["country_channel"],
            "year": year, "month": month,
            "week": week, "quarter": (month - 1) // 3 + 1,
        }
        row = [fact_value(c.name, c.type, i, ctx, y0, y1) for c in phys]
        kin = kpi_inputs(short, i, ctx["year"], ctx["month"])
        row += [kin[k][1] for k in kpi_names]
        rows.append(tuple(row))
    return names, types, rows


# ---- deploy ------------------------------------------------------------------
def create_table(c, dest, names, types, rows, comment):
    lines = ",\n".join(f"  `{nm}` {ty}" for nm, ty in zip(names, types))
    c.execute(f"DROP TABLE IF EXISTS {CAT}.{SCH}.{dest}", CAT, SCH)
    c.execute(f"CREATE TABLE {CAT}.{SCH}.{dest} (\n{lines}\n) USING DELTA COMMENT '{comment}'", CAT, SCH)
    n = 0
    for stmt in sqlgen.build_insert_batches(f"{CAT}.{SCH}.{dest}", names, types, rows, batch_size=2000):
        c.execute(stmt, CAT, SCH)
        n += 1
    return n


def main():
    package = load_package(REPO_ROOT)
    rels = package["relationships"]
    c = DatabricksClient()
    print("warehouse:", c.resolve_warehouse())
    dims = build_dims()

    CM = "SYNTHETIC CPG/FMCG (LATAM) POC — realistic illustrative data, not a real company."
    # Dimensions first
    for short in ("vw_ltm_sc_dm_countries", "vw_ltm_sc_dm_sales_channel", "vw_ltm_sc_dm_plants"):
        bt = next(b for b in BUILD_TARGETS if b.contract_short_name == short)
        names, types = dim_cols(package, short)
        recs = dims[short]
        rows = [tuple(r[n] for n in names) for r in recs]
        nb = create_table(c, bt.dest_name, names, types, rows, CM)
        print(f"  dim {bt.dest_name}: {len(rows)} rows / {nb} batches")

    # Facts
    fact_targets = [(b, round_half_up(package["contracts"][b.contract_short_name].row_count * SCALE))
                    for b in BUILD_TARGETS if b.role == "fact"]
    for bt, dest_rows in fact_targets:
        names, types, rows = build_fact(package, bt.contract_short_name, dest_rows, dims, rels)
        nb = create_table(c, bt.dest_name, names, types, rows, CM)
        print(f"  fact {bt.dest_name}: {len(rows)} rows / {nb} batches")

    rebuild_views(c)
    print("reskin complete — tables + views rebuilt. Genie space unchanged (same object names).")


def rebuild_views(c: DatabricksClient):
    """Recreate the enriched join views, structural metric view, and the KPI
    metric views over the freshly-reskinned base tables."""
    P = f"{CAT}.{SCH}."
    c.execute(f"""CREATE OR REPLACE VIEW {P}vw_pp_syn_ofr_enriched AS
      SELECT f.*, cy.country_text AS dim_country_name, cy.ou AS dim_country_ou,
             p.descr AS dim_plant_name, p.region AS dim_plant_region, p.loc_type AS dim_plant_loc_type
      FROM {P}tbl_pp_syn_fct_ofr f
      LEFT JOIN {P}tbl_pp_syn_dm_countries cy ON f.country_id=cy.country_id
      LEFT JOIN {P}tbl_pp_syn_dm_plants p ON f.plant_id=p.plant_id""", CAT, SCH)
    c.execute(f"""CREATE OR REPLACE VIEW {P}vw_pp_syn_operations_enriched AS
      SELECT f.*, cy.country_text AS dim_country_name, p.descr AS dim_plant_name, p.region AS dim_plant_region
      FROM {P}tbl_pp_syn_fct_operations f
      LEFT JOIN {P}tbl_pp_syn_dm_countries cy ON f.country_id=cy.country_id
      LEFT JOIN {P}tbl_pp_syn_dm_plants p ON f.plant_id=p.plant_id""", CAT, SCH)
    c.execute(f"""CREATE OR REPLACE VIEW {P}vw_pp_syn_performance_enriched AS
      SELECT f.*, cy.country_text AS dim_country_name, cy.ou AS dim_country_ou
      FROM {P}tbl_pp_syn_fct_performance f
      LEFT JOIN {P}tbl_pp_syn_dm_countries cy ON f.country_id=cy.country_id""", CAT, SCH)
    print("  enriched views rebuilt")
    from . import supply_chain_measures as SCM
    SCM.build_metric_views(c)
    print("  KPI metric views rebuilt")


if __name__ == "__main__":
    main()
