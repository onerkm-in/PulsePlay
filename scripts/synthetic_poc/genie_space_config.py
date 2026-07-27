"""Configure the synthetic SCM Genie space so PulsePlay owns its behaviour.

Sets the space's general instructions (the as-of window, the star schema, the
period-comparison rules, and the "answer KPIs through the metric views" contract)
plus a curated library of example question -> SQL pairs and a few reusable SQL
"functions" (parameterised trusted queries). Idempotent: every run wipes the
existing instructions and rebuilds them from the canonical lists below, so the
space state always matches this file.

The data itself is (re)built by cpg_reskin.py; this only configures the space.

Run:  python -m scripts.synthetic_poc.genie_space_config
Env:  DATABRICKS_HOST / DATABRICKS_TOKEN  (or DATABRICKS_CONFIG_PROFILE)
"""

from __future__ import annotations

from .databricks_client import DatabricksClient

SPACE_ID = "01f1871d478a181c83cb0562607c3d8e"
CAT, SCH = "workspace", "databrickspractice"
P = f"{CAT}.{SCH}."

MTR_OFR = P + "mtr_pp_syn_ltm_sc_fct_ofr"
MTR_OPS = P + "mtr_pp_syn_ltm_sc_fct_operations"
MTR_PERF = P + "mtr_pp_syn_ltm_sc_fct_performance"

# --- general instructions (the space "system prompt") -------------------------
TEXT_INSTRUCTION = f"""\
SYNTHETIC CPG / FMCG (LATAM) SUPPLY-CHAIN DEMO — illustrative data for a
consumer-goods company (beverages & snacks portfolio) operating across Latin
America. Not a real company: no confidential data, source formulas, or brand
trademarks. KPI values are produced by PulsePlay using STANDARD supply-chain
formulas over synthetic inputs — illustrative, not a reproduction of any
proprietary logic.

AS-OF / DATE COVERAGE
- Data spans 2024-01 through 2026-06 inclusive. Treat "today" as 30 June 2026.
- 2024 and 2025 are COMPLETE calendar years (12 months each).
- 2026 is the current year to date — January through June only. The last
  complete month is June 2026. There is NO data on or after 2026-07.
- "Current year" means 2026 YTD (months 1-6). "Latest / current month" is
  June 2026.

PERIOD COMPARISON (read carefully)
- To compare the current year against the prior year, compare 2026 YTD
  (months 1-6) against the SAME period of 2025 (months 1-6). That is
  apples-to-apples. NEVER compare partial-year 2026 against a full-year 2025.
- For full calendar-year comparisons use 2024 vs 2025 (both complete).
- Illustrative trend baked into the data (so YoY deltas are real and worth
  reporting): Order Fill Rate, OTIF, Manufacturing Fill Rate, Gross Margin and
  Forecast Accuracy improve year over year; GHG emissions and emissions
  intensity decline; Net Sales and Units Produced grow ~6% per year.

STAR SCHEMA
- Dimensions: {P}tbl_pp_syn_dm_date (a DATE dimension, day grain 2024-01-01..
  2026-06-30 — columns date, year, quarter, month, month_name, month_start),
  {P}tbl_pp_syn_dm_countries (country_id),
  {P}tbl_pp_syn_dm_plants (plant_id, country_id, region, loc_type),
  {P}tbl_pp_syn_dm_sales_channel (sales_channel_text, country_channel).
- Facts: {P}tbl_pp_syn_fct_ofr (order fill / OTIF — grain
  country x plant x channel x year x month x week),
  {P}tbl_pp_syn_fct_operations (production, safety, GHG, energy — grain
  country x plant x year x month),
  {P}tbl_pp_syn_fct_performance (net sales, COGS, forecast — grain
  country x year x month).
- Joins: facts join dimensions on country_id and plant_id; ofr joins the
  channel dimension on sales_channel_text; facts join the date dimension on
  fact.month_year = tbl_pp_syn_dm_date.month_start (or use the fact year/month
  columns directly). The same star schema backs the Power BI model
  (vw_pbi_dim_* / vw_pbi_fct_* views), so Genie and Power BI are like-for-like.
- Data quality: ~8-12% of fact foreign-key values are intentional ORPHANS (no
  matching dimension row) and operations.plant_id is ~16% NULL. Use LEFT JOINs
  and do not assume 100% referential integrity.

HOW TO ANSWER KPI QUESTIONS
- ALWAYS compute KPIs through the METRIC VIEWS using MEASURE(); never SUM the
  raw input columns yourself. Rates are additive — the measure SUMs the
  components and only then divides, so never average a rate across rows.
- Measure names contain spaces: always backtick them, e.g.
  MEASURE(`Order Fill Rate Pct`). Currency is USD. Percent measures are already
  scaled x100 (97.4 means 97.4%).
- Metric views and their measures:
  * {MTR_OFR}
    measures: Ordered Qty, Delivered Qty, Order Lines,
    `Order Fill Rate Pct`, `OTIF Pct`
    dimensions: Year, Quarter, Month, Country, Plant, `Sales Channel`
  * {MTR_OPS}
    measures: Hours Worked, Units Produced, LTIR, TRIR,
    `Manufacturing Fill Rate Pct`, `Quality Complaint PPM`,
    `GHG Emissions tCO2e`, `Energy Intensity kWh per Unit`
    dimensions: Year, Quarter, Month, Country, Plant
  * {MTR_PERF}
    measures: `Net Sales USD`, `COGS USD`, `Gross Margin Pct`,
    `Forecast Accuracy Pct`, `Forecast Bias Pct`, LTIR
    dimensions: Year, Quarter, Month, Country
- For structure / count questions (record counts, distinct plants, plants per
  country) query the base tables directly.
"""

# --- example question -> SQL pairs (curated queries the space learns from) -----
# Every query is valid against the metric views above and reflects the
# 2024/2025 full + 2026-YTD window.
SQL_EXAMPLES = [
    ("KPI snapshot for the current year (2026 YTD, Jan-Jun): fill rate, OTIF, net sales, gross margin, GHG.",
     f"""SELECT
  ROUND((SELECT MEASURE(`Order Fill Rate Pct`) FROM {MTR_OFR} WHERE Year=2026),2)  AS order_fill_rate_pct,
  ROUND((SELECT MEASURE(`OTIF Pct`)            FROM {MTR_OFR} WHERE Year=2026),2)  AS otif_pct,
  ROUND((SELECT MEASURE(`Net Sales USD`)       FROM {MTR_PERF} WHERE Year=2026),0) AS net_sales_usd,
  ROUND((SELECT MEASURE(`Gross Margin Pct`)    FROM {MTR_PERF} WHERE Year=2026),2) AS gross_margin_pct,
  ROUND((SELECT MEASURE(`GHG Emissions tCO2e`) FROM {MTR_OPS} WHERE Year=2026),0)  AS ghg_tco2e"""),

    ("What is the Order Fill Rate and OTIF percentage by year?",
     f"""SELECT Year, ROUND(MEASURE(`Order Fill Rate Pct`),2) AS order_fill_rate,
       ROUND(MEASURE(`OTIF Pct`),2) AS otif
FROM {MTR_OFR} GROUP BY Year ORDER BY Year"""),

    ("Show net sales, COGS and gross margin percent by year.",
     f"""SELECT Year, ROUND(MEASURE(`Net Sales USD`),0) AS net_sales,
       ROUND(MEASURE(`COGS USD`),0) AS cogs,
       ROUND(MEASURE(`Gross Margin Pct`),2) AS gross_margin
FROM {MTR_PERF} GROUP BY Year ORDER BY Year"""),

    ("How do GHG emissions and energy intensity trend by year?",
     f"""SELECT Year, ROUND(MEASURE(`GHG Emissions tCO2e`),0) AS ghg_tco2e,
       ROUND(MEASURE(`Energy Intensity kWh per Unit`),3) AS energy_intensity
FROM {MTR_OPS} GROUP BY Year ORDER BY Year"""),

    ("What are the LTIR and TRIR safety rates by year?",
     f"""SELECT Year, ROUND(MEASURE(`LTIR`),3) AS ltir, ROUND(MEASURE(`TRIR`),3) AS trir
FROM {MTR_OPS} GROUP BY Year ORDER BY Year"""),

    ("Compare current year-to-date against the prior year same period: net sales and gross margin (Jan-Jun 2025 vs 2026).",
     f"""SELECT Year, ROUND(MEASURE(`Net Sales USD`),0) AS net_sales_ytd,
       ROUND(MEASURE(`Gross Margin Pct`),2) AS gross_margin
FROM {MTR_PERF} WHERE Month <= 6 AND Year IN (2025,2026)
GROUP BY Year ORDER BY Year"""),

    ("Compare order fill rate and OTIF year-to-date (Jan-Jun) for 2025 vs 2026.",
     f"""SELECT Year, ROUND(MEASURE(`Order Fill Rate Pct`),2) AS order_fill_rate,
       ROUND(MEASURE(`OTIF Pct`),2) AS otif
FROM {MTR_OFR} WHERE Month <= 6 AND Year IN (2025,2026)
GROUP BY Year ORDER BY Year"""),

    ("Show the monthly net sales trend for the current year (2026).",
     f"""SELECT Month, ROUND(MEASURE(`Net Sales USD`),0) AS net_sales
FROM {MTR_PERF} WHERE Year=2026 GROUP BY Month ORDER BY Month"""),

    ("Order fill rate by sales channel for the current year (2026).",
     f"""SELECT `Sales Channel`, ROUND(MEASURE(`Order Fill Rate Pct`),2) AS order_fill_rate
FROM {MTR_OFR} WHERE Year=2026 GROUP BY `Sales Channel` ORDER BY order_fill_rate DESC"""),

    ("Which 5 plants have the lowest manufacturing fill rate this year?",
     f"""SELECT Plant, ROUND(MEASURE(`Manufacturing Fill Rate Pct`),2) AS fill_rate
FROM {MTR_OPS} WHERE Year=2026 GROUP BY Plant ORDER BY fill_rate ASC LIMIT 5"""),

    ("Gross margin percent by country for the current year, best to worst.",
     f"""SELECT Country, ROUND(MEASURE(`Gross Margin Pct`),2) AS gross_margin
FROM {MTR_PERF} WHERE Year=2026 GROUP BY Country ORDER BY gross_margin DESC"""),

    ("Quarterly OTIF trend across all years.",
     f"""SELECT Year, Quarter, ROUND(MEASURE(`OTIF Pct`),2) AS otif
FROM {MTR_OFR} GROUP BY Year, Quarter ORDER BY Year, Quarter"""),

    ("Forecast accuracy and forecast bias by year.",
     f"""SELECT Year, ROUND(MEASURE(`Forecast Accuracy Pct`),2) AS forecast_accuracy,
       ROUND(MEASURE(`Forecast Bias Pct`),2) AS forecast_bias
FROM {MTR_PERF} GROUP BY Year ORDER BY Year"""),

    ("How many plants are in each country? Top 5.",
     f"""SELECT country_id, COUNT(*) AS plants
FROM {P}tbl_pp_syn_dm_plants GROUP BY country_id ORDER BY plants DESC LIMIT 5"""),
]


# --- API helpers --------------------------------------------------------------
def _base(client):
    return f"/api/2.0/data-rooms/{SPACE_ID}/instructions"


def list_instructions(c: DatabricksClient) -> list[dict]:
    r = c._session.get(c._url(_base(c)), timeout=60)
    r.raise_for_status()
    return r.json().get("instructions", [])


def delete_all(c: DatabricksClient) -> int:
    existing = list_instructions(c)
    for x in existing:
        iid = x.get("instruction_id") or x.get("id")
        rd = c._session.delete(c._url(f"{_base(c)}/{iid}"), timeout=60)
        rd.raise_for_status()
    return len(existing)


def add(c: DatabricksClient, instruction_type: str, title: str, content: str,
        use_as_tool: bool = False) -> str:
    body = {
        "instruction_type": instruction_type,
        "title": title,
        "content": content,
        "use_as_tool": use_as_tool,
    }
    r = c._session.post(c._url(_base(c)), json=body, timeout=60)
    r.raise_for_status()
    j = r.json()
    return j.get("instruction_id") or j.get("id")


def main():
    c = DatabricksClient()
    print("warehouse:", c.resolve_warehouse())
    removed = delete_all(c)
    print(f"cleared {removed} existing instruction(s)")

    add(c, "TEXT_INSTRUCTION",
        "As-of window, schema, and KPI-via-metric-view rules",
        TEXT_INSTRUCTION)
    print("  + general instructions (TEXT_INSTRUCTION)")

    for i, (q, sql) in enumerate(SQL_EXAMPLES, 1):
        add(c, "SQL_INSTRUCTION", q, sql)
        print(f"  + example {i:2d}: {q[:64]}")

    total = len(list_instructions(c))
    print(f"done — space now carries {total} instruction(s) "
          f"(1 general + {len(SQL_EXAMPLES)} example queries).")


if __name__ == "__main__":
    main()
