"""Star-schema layer over the synthetic SCM data — proper dimensions (incl. a
real date dimension) + key-form fact views, consistent for BOTH Genie/Databricks
and Power BI.

Why: the base facts carry denormalized dimension attributes and there was no date
dimension. This adds:
  * tbl_pp_syn_dm_date  — a real DATE dimension (day grain, 2024-01-01 .. 2026-06-30),
    a first-class table so the Genie space can use it too.
  * vw_pbi_dim_*        — clean conformed dimension views (date, country, plant,
    sales channel) for the Power BI model.
  * vw_pbi_fct_*        — key-form fact views (dimension keys + measure inputs, no
    denormalized attributes) so Power BI relates fact->dim in a star.

The KPI metric-view formulas are unchanged (measures still SUM the same input
columns), so every number reconciles with the Genie/metric-view path.

Run:  python -m scripts.synthetic_poc.star_schema
Env:  DATABRICKS_HOST / DATABRICKS_TOKEN  (or DATABRICKS_CONFIG_PROFILE)
"""

from __future__ import annotations

from .databricks_client import DatabricksClient

CAT, SCH = "workspace", "databrickspractice"
P = f"{CAT}.{SCH}."

# --- date dimension (real table, so Genie can use it as a conformed dim) -------
DATE_TABLE_SQL = f"""
CREATE OR REPLACE TABLE {P}tbl_pp_syn_dm_date
COMMENT 'SYNTHETIC SCM date dimension (day grain, as-of 30-Jun-2026). Conformed across Genie + Power BI.'
AS
SELECT
    d                                   AS date,
    year(d)                             AS year,
    quarter(d)                          AS quarter,
    concat('Q', quarter(d))             AS quarter_name,
    month(d)                            AS month,
    date_format(d, 'MMMM')              AS month_name,
    date_format(d, 'MMM')               AS month_short,
    trunc(d, 'MM')                      AS month_start,
    (year(d) - 2024) * 12 + month(d)    AS month_order
FROM (SELECT explode(sequence(DATE'2024-01-01', DATE'2026-06-30', INTERVAL 1 DAY)) AS d)
"""

# --- conformed dimension views for Power BI -----------------------------------
DIM_VIEWS = {
    "vw_pbi_dim_date": f"SELECT date, year, quarter, quarter_name, month, month_name, month_short, month_start, month_order FROM {P}tbl_pp_syn_dm_date",
    "vw_pbi_dim_country": f"SELECT country_id, country_text AS country, ou FROM {P}tbl_pp_syn_dm_countries",
    "vw_pbi_dim_plant": f"SELECT plant_id, descr AS plant, region, loc_type, country_id FROM {P}tbl_pp_syn_dm_plants",
    "vw_pbi_dim_sales_channel": f"SELECT DISTINCT sales_channel_text AS sales_channel FROM {P}tbl_pp_syn_dm_sales_channel",
}

# --- key-form fact views (dimension keys + measure inputs only) ---------------
FACT_VIEWS = {
    "vw_pbi_fct_ofr": f"""
        SELECT country_id, plant_id, sales_channel_text AS sales_channel,
               CAST(month_year AS DATE) AS date_month,
               ordered_qty, delivered_qty, order_lines, otif_lines
        FROM {P}tbl_pp_syn_fct_ofr""",
    "vw_pbi_fct_operations": f"""
        SELECT country_id, plant_id,
               CAST(month_year AS DATE) AS date_month,
               hours_worked, recordable_incidents, lost_time_injuries,
               units_produced, units_planned, units_defect, ghg_tco2e, energy_kwh
        FROM {P}tbl_pp_syn_fct_operations""",
    "vw_pbi_fct_performance": f"""
        SELECT country_id,
               CAST(month_year AS DATE) AS date_month,
               forecast_qty, actual_qty, net_sales_usd, cogs_usd,
               hours_worked, lost_time_injuries
        FROM {P}tbl_pp_syn_fct_performance""",
}

_NOTE = "SYNTHETIC SCM star-schema object. Illustrative synthetic data, not a real company."


def main():
    c = DatabricksClient()
    print("warehouse:", c.resolve_warehouse())

    c.execute(DATE_TABLE_SQL, CAT, SCH)
    n = c.scalar(f"SELECT COUNT(*) FROM {P}tbl_pp_syn_dm_date", CAT, SCH)
    print(f"  dim table tbl_pp_syn_dm_date: {n} rows")

    for name, body in {**DIM_VIEWS, **FACT_VIEWS}.items():
        c.execute(f"CREATE OR REPLACE VIEW {P}{name}\nCOMMENT '{_NOTE}'\nAS {body}", CAT, SCH)
        cnt = c.scalar(f"SELECT COUNT(*) FROM {P}{name}", CAT, SCH)
        print(f"  {name}: {cnt} rows")
    print("done — star schema (1 date dim table + 4 dim views + 3 key-form fact views).")


if __name__ == "__main__":
    main()
