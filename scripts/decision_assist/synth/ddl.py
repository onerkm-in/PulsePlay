"""Exact CREATE TABLE DDL for the synthetic star schema.

Column names + types mirror the live `main.supply_chain.*` schema (captured by
DESCRIBE), so the same detection SQL runs unchanged. `ddl_for(schema)` returns the
CREATE SCHEMA + CREATE TABLE statements for a target schema (default dev stand-in).
"""
from __future__ import annotations

# table -> ordered list of (column, sql_type). Matches the introspected live schema.
TABLES: dict[str, list[tuple[str, str]]] = {
    "dim_date": [
        ("month_key", "INT"), ("date_month", "DATE"), ("year", "INT"),
        ("quarter", "INT"), ("month_num", "INT"), ("month_name", "STRING"),
    ],
    "dim_product": [
        ("product_key", "INT"), ("sku", "STRING"), ("product_name", "STRING"),
        ("sub_category", "STRING"), ("category", "STRING"), ("product_family", "STRING"),
        ("unit_cost", "DECIMAL(10,2)"),
    ],
    "dim_supplier": [
        ("supplier_key", "INT"), ("supplier_name", "STRING"), ("supplier_tier", "INT"),
        ("country", "STRING"), ("region", "STRING"), ("onboarded_year", "INT"),
    ],
    "dim_location": [
        ("location_key", "INT"), ("dc_name", "STRING"), ("region", "STRING"),
        ("country", "STRING"), ("dc_type", "STRING"),
    ],
    "dim_carrier": [
        ("carrier_key", "INT"), ("carrier_name", "STRING"), ("mode", "STRING"),
    ],
    "fact_order_line": [
        ("order_line_id", "BIGINT"), ("month_key", "INT"), ("order_id", "STRING"),
        ("category", "STRING"), ("region", "STRING"), ("location_key", "INT"),
        ("primary_supplier_key", "INT"), ("units_ordered", "INT"), ("units_shipped", "INT"),
        ("on_time_flag", "BOOLEAN"), ("in_full_flag", "BOOLEAN"), ("otif_flag", "BOOLEAN"),
        ("promised_date", "DATE"), ("ship_date", "DATE"),
    ],
    "fact_inventory_monthly": [
        ("month_key", "INT"), ("category", "STRING"), ("location_key", "INT"),
        ("on_hand_units", "INT"), ("safety_stock_units", "INT"), ("days_of_supply", "DECIMAL(6,1)"),
    ],
    "fact_forecast_monthly": [
        ("month_key", "INT"), ("category", "STRING"), ("region", "STRING"),
        ("forecast_units", "INT"), ("actual_units", "INT"), ("wmape", "DECIMAL(6,2)"),
        ("bias_pct", "DECIMAL(6,2)"),
    ],
    "fact_supply_chain_kpi_monthly": [
        ("month_key", "INT"), ("category", "STRING"), ("region", "STRING"),
        ("primary_supplier_key", "INT"), ("orders_total", "INT"), ("orders_otif", "INT"),
        ("units_ordered", "INT"), ("units_shipped", "INT"), ("units_on_time", "INT"),
        ("units_in_full", "INT"), ("cases_ordered", "INT"), ("cases_shipped_on_line", "INT"),
        ("lines_ordered", "INT"), ("lines_shipped_complete", "INT"), ("shipments_total", "INT"),
        ("shipments_on_time", "INT"), ("deliveries_total", "INT"), ("deliveries_carrier_on_time", "INT"),
        ("forecast_units", "INT"), ("actual_units", "INT"), ("on_hand_units", "INT"),
        ("safety_stock_units", "INT"), ("backorder_units", "INT"), ("supplier_on_time_pct", "DECIMAL(5,2)"),
        ("expedite_cost", "DECIMAL(12,2)"), ("otif_deduction_cost", "DECIMAL(12,2)"),
        ("sla_penalty_cost", "DECIMAL(12,2)"), ("otif_pct", "DECIMAL(5,2)"),
        ("case_fill_rate_pct", "DECIMAL(5,2)"), ("line_fill_rate_pct", "DECIMAL(5,2)"),
        ("forecast_accuracy_pct", "DECIMAL(5,2)"), ("forecast_bias_pct", "DECIMAL(6,2)"),
        ("on_time_shipment_pct", "DECIMAL(5,2)"), ("carrier_on_time_pct", "DECIMAL(5,2)"),
        ("days_of_supply", "DECIMAL(6,1)"), ("load_ts", "TIMESTAMP"),
    ],
    "fact_supplier_scorecard_monthly": [
        ("month_key", "INT"), ("supplier_key", "INT"), ("orders_supplied", "INT"),
        ("on_time_pct", "DECIMAL(5,2)"), ("defect_rate_pct", "DECIMAL(5,2)"),
        ("avg_lead_time_days", "DECIMAL(6,1)"),
    ],
}

# Columns whose values must be SQL-quoted as strings on INSERT (STRING/DATE/TIMESTAMP).
STRING_LIKE = {"STRING", "DATE", "TIMESTAMP"}


def column_types(table: str) -> dict[str, str]:
    return {c: t for c, t in TABLES[table]}


def create_schema_sql(schema: str) -> str:
    return f"CREATE SCHEMA IF NOT EXISTS {schema}"


def create_table_sql(schema: str, table: str) -> str:
    cols = ",\n  ".join(f"`{c}` {t}" for c, t in TABLES[table])
    return f"CREATE TABLE IF NOT EXISTS {schema}.{table} (\n  {cols}\n) USING DELTA"


def ddl_for(schema: str) -> list[str]:
    out = [create_schema_sql(schema)]
    out += [create_table_sql(schema, t) for t in TABLES]
    return out
