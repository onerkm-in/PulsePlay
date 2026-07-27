"""Create clean Power-BI-facing views over the synthetic SCM data.

Power BI cannot consume Databricks *metric views* (MEASURE()) natively — it reads
tables/views as plain columns and you define measures in DAX. To get an
apples-to-apples comparison with the Genie/metric-view path, these views expose
the SAME base facts (dimensions + time + KPI INPUT columns) in a tidy shape, and
the report defines DAX measures that replicate the metric-view formulas exactly
(SUM the components, then divide — never average a rate). See PBI_APPLES_TO_APPLES.md
for the DAX + build/publish steps.

Run:  python -m scripts.synthetic_poc.pbi_views
Env:  DATABRICKS_HOST / DATABRICKS_TOKEN  (or DATABRICKS_CONFIG_PROFILE)
"""

from __future__ import annotations

from .databricks_client import DatabricksClient

CAT, SCH = "workspace", "databrickspractice"
P = f"{CAT}.{SCH}."

_NOTE = ("PBI-facing view over SYNTHETIC SCM POC facts. Same base rows as the Genie "
         "metric views; define DAX measures that mirror the metric-view formulas for "
         "an apples-to-apples comparison. Illustrative synthetic data, not a real company.")

VIEWS = {
    "vw_pbi_scm_ofr": f"""
        SELECT country_id, country_text AS country, ou,
               plant_id, plant_descr AS plant, plant_region AS region,
               sales_channel_text AS sales_channel,
               year, quarter, month, month_name, month_order,
               CAST(month_year AS DATE) AS date_month,
               ordered_qty, delivered_qty, order_lines, otif_lines
        FROM {P}tbl_pp_syn_fct_ofr""",
    "vw_pbi_scm_operations": f"""
        SELECT country_id, country_text AS country,
               plant_id, plant_descr AS plant, plant_region AS region,
               year, quarter, month, month_name, month_order,
               CAST(month_year AS DATE) AS date_month,
               hours_worked, recordable_incidents, lost_time_injuries,
               units_produced, units_planned, units_defect, ghg_tco2e, energy_kwh
        FROM {P}tbl_pp_syn_fct_operations""",
    "vw_pbi_scm_performance": f"""
        SELECT country_id, country_text AS country, ou,
               year, quarter, month, month_name, month_order,
               CAST(month_year AS DATE) AS date_month,
               forecast_qty, actual_qty, net_sales_usd, cogs_usd,
               hours_worked, lost_time_injuries
        FROM {P}tbl_pp_syn_fct_performance""",
}


def main():
    c = DatabricksClient()
    print("warehouse:", c.resolve_warehouse())
    for name, body in VIEWS.items():
        c.execute(f"CREATE OR REPLACE VIEW {P}{name}\nCOMMENT '{_NOTE}'\nAS{body}", CAT, SCH)
        n = c.scalar(f"SELECT COUNT(*) FROM {P}{name}", CAT, SCH)
        print(f"  view {name}: {n} rows")
    print("done — 3 PBI-facing views created over the synthetic SCM facts.")


if __name__ == "__main__":
    main()
