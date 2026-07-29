# SYNTHETIC_BUILD_PLAN

Deterministic (seed 42), 1% fact scale. Dimensions first, then facts; FK columns sample generated parent keys with contract-accurate orphan rates.

| # | object | role | rows | source contract |
|---|---|---|---:|---|
| 1 | `tbl_pp_syn_dm_countries` | dimension | 20 | `vw_ltm_sc_dm_countries` |
| 2 | `tbl_pp_syn_dm_plants` | dimension | 602 | `vw_ltm_sc_dm_plants` |
| 3 | `tbl_pp_syn_dm_sales_channel` | dimension | 11 | `vw_ltm_sc_dm_sales_channel` |
| 4 | `tbl_pp_syn_fct_ofr` | fact | 182,921 | `mtr_vw_ltm_sc_fct_ofr` |
| 5 | `tbl_pp_syn_fct_operations` | fact | 846 | `mtr_vw_ltm_sc_fct_operations` |
| 6 | `tbl_pp_syn_fct_performance` | fact | 177 | `mtr_vw_ltm_sc_fct_performance` |

## Blocked (semantic layer)

- `mtr_pp_syn_ltm_sc_fct_ofr` — measure formulas redacted in contract; not reproduced
- `mtr_pp_syn_ltm_sc_fct_operations` — measure formulas redacted in contract; not reproduced
- `mtr_pp_syn_ltm_sc_fct_performance` — measure formulas redacted in contract; not reproduced

## Rounding rule
`round_half_up(full_rows × 0.01)` → OFR 18,292,096→182,921 · operations 84,556→846 · performance 17,730→177. Dimensions always full.