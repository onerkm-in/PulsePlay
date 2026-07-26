# Genie space — synthetic SCM POC

Created 2026-07-24 via `POST /api/2.0/genie/spaces` over the synthetic tables in
`workspace.databrickspractice`.

- **Space ID:** `01f1871d478a181c83cb0562607c3d8e`
- **Title:** PulsePlay Synthetic — LATAM Supply Chain (POC)
- **Warehouse:** `Serverless Starter Warehouse` (`6510da50329f1e85`)
- **PulsePlay profile:** `genie-scm-poc` in `proxy/config.json`

## Objects exposed to the space
| object | kind | role |
|---|---|---|
| `tbl_pp_syn_dm_countries` | table | dimension |
| `tbl_pp_syn_dm_plants` | table | dimension |
| `tbl_pp_syn_dm_sales_channel` | table | dimension |
| `tbl_pp_syn_fct_ofr` | table | fact |
| `tbl_pp_syn_fct_operations` | table | fact |
| `tbl_pp_syn_fct_performance` | table | fact |
| `mtr_pp_syn_ofr_structural` | metric view | structural counts (COUNT / COUNT DISTINCT) |

Helper join views also exist (`vw_pp_syn_ofr_enriched`, `vw_pp_syn_operations_enriched`,
`vw_pp_syn_performance_enriched`).

## Date coverage (updated 2026-07-26)
Data spans **2024-01 through 2026-06**, anchored to an as-of of **30 June 2026**:
- **2024** and **2025** are complete calendar years (12 months each).
- **2026** is the current year to date — **January through June only** (last complete month
  is June). Nothing lands on or after 2026-07.
Rows are spread evenly across every month, and a deterministic YoY trend + seasonality is
baked into the inputs (service/OTIF/margin/forecast improve, GHG intensity declines, net
sales & units grow ~6%/yr) so prior-period comparisons are meaningful. Rebuilt by
`cpg_reskin.py` (`AS_OF_YEAR/AS_OF_MONTH/COMPLETE_YEARS_BACK` at the top of the file).

## Metric view scope (honest)
Two layers exist:
- `mtr_pp_syn_ofr_structural` — row-count measures only (Record Count, Distinct Plants/Countries).
- `mtr_pp_syn_ltm_sc_fct_ofr/operations/performance` — **supply-chain KPI measures** (Order
  Fill Rate, OTIF, Forecast Accuracy, Gross Margin, LTIR/TRIR, Manufacturing Fill Rate,
  Quality PPM, GHG). Built with **standard supply-chain formulas over synthetic input
  columns** — illustrative, **not** the source's redacted formulas or values. Full catalog:
  [SUPPLY_CHAIN_MEASURES.md](SUPPLY_CHAIN_MEASURES.md).

## Space configuration (owned by PulsePlay)
Configured by **`scripts/synthetic_poc/genie_space_config.py`** (idempotent — wipes and
rebuilds the instruction set from the canonical lists on each run) via
`POST/DELETE /api/2.0/data-rooms/{space_id}/instructions`. The space carries:
- **1 general instruction (`TEXT_INSTRUCTION`)** — as-of window + period-comparison rules
  (current year = 2026 YTD; compare to 2025 same months; full-year uses 2024 vs 2025), the
  star schema + join keys, the ~8-12% FK orphan / ~16% null caveats, and the contract to
  answer KPIs through the metric views with `MEASURE()`.
- **14 example question→SQL pairs (`SQL_INSTRUCTION`)** — KPI snapshot, YoY, YTD-vs-prior-YTD,
  monthly/quarterly trends, by-channel / by-country / top-plant breakdowns, forecast metrics.

## Verified end-to-end (live, 2026-07-26)
Chain validated Tables ↔ Views ↔ Metric Views ↔ Genie space ↔ PulsePlay proxy:
| check | result |
|---|---|
| Genie NL→SQL "this year vs same period last year" | Genie filtered `Month<=6 AND Year IN (2025,2026)` via `MEASURE()`; net sales $989.3M→$1.031B, margin 55.14%→55.60% |
| PulsePlay `KPI SNAPSHOT` section (`genie-scm-poc`) | current-year KPIs **with prior-year comparison** (fill 98.23→99.04, OTIF 93.44→94.45, GHG 1.20M→1.14M) — the original "no prior period data" complaint is resolved |

## Run PulsePlay against it
```bash
# terminal 1
cd proxy && PORT=7000 node server.js
# terminal 2
cd playground && npm run dev   # http://127.0.0.1:7001
```
Then pick the **Genie: Synthetic SCM (POC)** connector (profile `genie-scm-poc`).

## Rollback (this space only)
`POST /api/2.0/genie/spaces/01f1871d478a181c83cb0562607c3d8e/trash`, and remove the
`genie-scm-poc` profile from `proxy/config.json`.
