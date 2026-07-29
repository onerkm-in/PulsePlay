# Supply-chain KPI measures (determined from standard rules)

The source contract withheld the real measure formulas **and** values, so the base facts
carry no measures. To let the POC answer real KPI questions, PulsePlay adds a clearly
labelled **synthetic measure layer**: synthetic input columns on each fact + metric views
whose measures use **textbook supply-chain formulas**.

> **These formulas are standard-domain definitions applied by PulsePlay; the inputs are
> synthetic. They are NOT the source's redacted formulas or values.** Magnitudes are
> illustrative (input ranges are arbitrary), but the formula shapes are correct and every
> rate sums additive components first, then divides (rates are never averaged).

Built by [`scripts/synthetic_poc/supply_chain_measures.py`](../../scripts/synthetic_poc/supply_chain_measures.py).

## Synthetic input columns (additive; base contract columns untouched)
Deterministic per row via `pmod(hash(<keys>, '<salt>'), range)`.

| fact | added inputs |
|---|---|
| `tbl_pp_syn_fct_ofr` | `ordered_qty`, `delivered_qty`, `order_lines`, `otif_lines` |
| `tbl_pp_syn_fct_operations` | `hours_worked`, `recordable_incidents`, `lost_time_injuries`, `units_produced`, `units_planned`, `units_defect`, `ghg_tco2e`, `energy_kwh` |
| `tbl_pp_syn_fct_performance` | `forecast_qty`, `actual_qty`, `net_sales_usd`, `cogs_usd`, `hours_worked`, `lost_time_injuries` |

## Metric views + measure formulas
### `mtr_pp_syn_ltm_sc_fct_ofr`
| measure | formula |
|---|---|
| Order Fill Rate Pct | `100 · SUM(delivered_qty) / SUM(ordered_qty)` |
| OTIF Pct | `100 · SUM(otif_lines) / SUM(order_lines)` |
| Ordered Qty / Delivered Qty / Order Lines | `SUM(...)` |

### `mtr_pp_syn_ltm_sc_fct_operations`
| measure | formula |
|---|---|
| LTIR | `200000 · SUM(lost_time_injuries) / SUM(hours_worked)` |
| TRIR | `200000 · SUM(recordable_incidents) / SUM(hours_worked)` |
| Manufacturing Fill Rate Pct | `100 · SUM(units_produced) / SUM(units_planned)` |
| Quality Complaint PPM | `1e6 · SUM(units_defect) / SUM(units_produced)` |
| GHG Emissions tCO2e | `SUM(ghg_tco2e)` |
| Energy Intensity kWh per Unit | `SUM(energy_kwh) / SUM(units_produced)` |

### `mtr_pp_syn_ltm_sc_fct_performance`
| measure | formula |
|---|---|
| Net Sales USD / COGS USD | `SUM(...)` |
| Gross Margin Pct | `100 · (SUM(net_sales_usd) − SUM(cogs_usd)) / SUM(net_sales_usd)` |
| Forecast Accuracy Pct | `100 · (1 − SUM(ABS(actual − forecast)) / SUM(actual))` |
| Forecast Bias Pct | `100 · SUM(actual − forecast) / SUM(actual)` |
| LTIR | `200000 · SUM(lost_time_injuries) / SUM(hours_worked)` |

## Verified live (MEASURE())
| KPI | by year |
|---|---|
| Order Fill Rate / OTIF | ~85.0% / ~85.6% (2025-2027) |
| Gross Margin / Forecast Accuracy | ~32-35% / ~82-85% (2024-2027) |
| Manufacturing Fill Rate | ~91-92% |

Dimensions: Year, Quarter, Month, Country (+ Plant, Sales Channel where applicable).
The three metric views replace the earlier BLOCKED status and are now exposed in the Genie
space `genie-scm-poc` with KPI example questions.
