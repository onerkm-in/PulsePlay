# Power BI ↔ Databricks apples-to-apples (synthetic SCM)

> **Update:** the model is now a proper **star schema** — see `scripts/synthetic_poc/star_schema.py`
> (date dim + conformed `vw_pbi_dim_*` dimensions + key-form `vw_pbi_fct_*` facts) and the built
> project in `enablers/pbi-scm-report/` (dim tables + facts + relationships + visuals). The flat
> `vw_pbi_scm_*` views below still exist and reconcile identically, but the star is the current design.


Goal: point a Power BI semantic model at the **same synthetic SCM data** the Genie/metric-view
path uses, so PulsePlay's Power BI config and its Databricks config compare like-for-like.

**Why views + DAX (not the metric views directly):** Power BI can't consume Databricks *metric
views* (`MEASURE()`) natively — it reads tables/views as plain columns. So we expose the same base
facts as clean views and replicate the metric-view formulas in DAX (SUM the components, then
divide — never average a rate). Verified: the SUM-based formulas over these views match the metric
views to the decimal (OFR 97.45/98.24/99.04 · net sales 1772/1877.9/1031.4 MM · GHG
2,523,750/2,399,415/1,138,707 by 2024/2025/2026).

## 1. Databricks source (already created — `scripts/synthetic_poc/pbi_views.py`)
Catalog/schema: **`workspace.databrickspractice`**. Three flat, PBI-ready views (dims are already
denormalized into each, so no relationships are required — a flat model reconciles cleanly):

| View | Grain | KPI input columns |
|---|---|---|
| `vw_pbi_scm_ofr` | country × plant × channel × month | `ordered_qty, delivered_qty, order_lines, otif_lines` |
| `vw_pbi_scm_operations` | country × plant × month | `hours_worked, recordable_incidents, lost_time_injuries, units_produced, units_planned, units_defect, ghg_tco2e, energy_kwh` |
| `vw_pbi_scm_performance` | country × month | `forecast_qty, actual_qty, net_sales_usd, cogs_usd, hours_worked, lost_time_injuries` |

Shared dims/time on every view: `country, ou, plant, region, sales_channel` (where applicable) +
`year, quarter, month, month_name, month_order, date_month` (a real DATE for time intelligence).

## 2. Connection details (Power BI Desktop → Get Data → Azure Databricks)
- **Server hostname:** `dbc-f88d29ce-4aa2.cloud.databricks.com`
- **HTTP path:** `/sql/1.0/warehouses/6510da50329f1e85`  (Serverless Starter Warehouse)
- **Catalog:** `workspace`  · **Schema:** `databrickspractice`
- Data connectivity: **Import** (simplest + fastest for this small POC).
- Pick the three `vw_pbi_scm_*` views. (Power Query: no transforms needed — the views are already
  clean. `date_month` should type as Date; `year/quarter/month` as Whole Number.)

## 3. DAX measures (paste into a dedicated "Measures" table)
These replicate the metric-view formulas exactly. `DIVIDE` handles divide-by-zero like the metric
views' `NULLIF`.

```dax
-- vw_pbi_scm_ofr
Ordered Qty          = SUM ( vw_pbi_scm_ofr[ordered_qty] )
Delivered Qty        = SUM ( vw_pbi_scm_ofr[delivered_qty] )
Order Lines          = SUM ( vw_pbi_scm_ofr[order_lines] )
Order Fill Rate Pct  = DIVIDE ( 100 * SUM ( vw_pbi_scm_ofr[delivered_qty] ), SUM ( vw_pbi_scm_ofr[ordered_qty] ) )
OTIF Pct             = DIVIDE ( 100 * SUM ( vw_pbi_scm_ofr[otif_lines] ), SUM ( vw_pbi_scm_ofr[order_lines] ) )

-- vw_pbi_scm_operations
Units Produced       = SUM ( vw_pbi_scm_operations[units_produced] )
Hours Worked         = SUM ( vw_pbi_scm_operations[hours_worked] )
LTIR                 = DIVIDE ( 200000 * SUM ( vw_pbi_scm_operations[lost_time_injuries] ), SUM ( vw_pbi_scm_operations[hours_worked] ) )
TRIR                 = DIVIDE ( 200000 * SUM ( vw_pbi_scm_operations[recordable_incidents] ), SUM ( vw_pbi_scm_operations[hours_worked] ) )
Manufacturing Fill Rate Pct = DIVIDE ( 100 * SUM ( vw_pbi_scm_operations[units_produced] ), SUM ( vw_pbi_scm_operations[units_planned] ) )
Quality Complaint PPM = DIVIDE ( 1000000 * SUM ( vw_pbi_scm_operations[units_defect] ), SUM ( vw_pbi_scm_operations[units_produced] ) )
GHG Emissions tCO2e  = SUM ( vw_pbi_scm_operations[ghg_tco2e] )
Energy Intensity kWh per Unit = DIVIDE ( SUM ( vw_pbi_scm_operations[energy_kwh] ), SUM ( vw_pbi_scm_operations[units_produced] ) )

-- vw_pbi_scm_performance
Net Sales USD        = SUM ( vw_pbi_scm_performance[net_sales_usd] )
COGS USD             = SUM ( vw_pbi_scm_performance[cogs_usd] )
Gross Margin Pct     = DIVIDE ( 100 * ( SUM ( vw_pbi_scm_performance[net_sales_usd] ) - SUM ( vw_pbi_scm_performance[cogs_usd] ) ), SUM ( vw_pbi_scm_performance[net_sales_usd] ) )
Forecast Accuracy Pct = 100 * ( 1 - DIVIDE ( SUMX ( vw_pbi_scm_performance, ABS ( vw_pbi_scm_performance[actual_qty] - vw_pbi_scm_performance[forecast_qty] ) ), SUM ( vw_pbi_scm_performance[actual_qty] ) ) )
Forecast Bias Pct    = DIVIDE ( 100 * ( SUM ( vw_pbi_scm_performance[actual_qty] ) - SUM ( vw_pbi_scm_performance[forecast_qty] ) ), SUM ( vw_pbi_scm_performance[actual_qty] ) )
```

**Expected values (report should reproduce these — matches the Databricks path):**
Full-year — OFR 97.45 / 98.24 / 99.04 · OTIF 92.44 / 93.45 / 94.45 · Net Sales 1,772.0 / 1,877.9 /
1,031.4 MM · Gross Margin 53.84 / 55.23 / 55.60 · GHG 2,523,750 / 2,399,415 / 1,138,707 (2024/25/26).
2026 = Jan–Jun YTD only (as-of 30-Jun-2026).

## 4. Build + publish
1. Add a couple of visuals per KPI (a card + a by-year column) to confirm the numbers match the
   table above — that's your apples-to-apples smoke check.
2. Name the semantic model clearly (e.g. **"PulsePlay SCM (synthetic)"**).
3. **Publish** to a Power BI workspace you own.
4. Send me: the **workspace ID** and the **dataset (semantic model) ID** (from the dataset's URL /
   Settings), plus confirm the auth mode (user-refresh, as with `powerbi-dwd`, or a service
   principal). I'll then add a `powerbi` profile in `proxy/config.json` pointing at it and re-run the
   headed apples-to-apples validation (Config B Power-BI-only + Config C hybrid) against the same SCM data.

## 5. Note on PulsePlay's Power BI path
PulsePlay's `powerbi-semantic-model` path runs **deterministic DAX** (no LLM) via a no-LLM NL→DAX
template matcher over the published dataset's measures. Clear measure names (as above) help the
matcher resolve KPIs. AI Insights/Ask Pulse on this path will render **grounded tables** (not
generative narrative) — that's the by-design 0-LLM behaviour we validated; the generative layer is a
separate, parked decision.
