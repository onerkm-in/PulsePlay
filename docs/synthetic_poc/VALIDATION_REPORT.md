# VALIDATION_REPORT — synthetic LATAM supply-chain POC

- Verdict: **PASS**
- Build run: `run-20260724T033052Z-423e5b81`  ·  validated run: `run-20260724T034057Z-c4e67a8a`
- Target: `workspace.databrickspractice`  ·  warehouse: `None`
- Scale: 0.01 (1% fact scale (POC))  ·  seed: 42
- Contract package hash: `7813762c8df9b9e1…`  ·  generator hash: `dcbb7bc5194a92c5…`

## Per-table checks

| table | rows | schema diff | null rates | cardinality | ranges | invariants | pass |
|---|---:|---|---|---|---|---|---|
| `tbl_pp_syn_dm_countries` | 20 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tbl_pp_syn_dm_plants` | 602 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tbl_pp_syn_dm_sales_channel` | 11 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tbl_pp_syn_fct_ofr` | 182921 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tbl_pp_syn_fct_operations` | 846 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tbl_pp_syn_fct_performance` | 177 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Relationship conformance (live, non-null keys)

| child.fk → parent | live | target | distinct | orphans | pass |
|---|---:|---:|---:|---:|---|
| `tbl_pp_syn_dm_plants.country_id` → `tbl_pp_syn_dm_countries` | 88.9% | 88.9% | 18 | 2 | ✅ |
| `tbl_pp_syn_fct_ofr.country_id` → `tbl_pp_syn_dm_countries` | 100.0% | 100.0% | 16 | 0 | ✅ |
| `tbl_pp_syn_fct_ofr.sales_channel_text` → `tbl_pp_syn_dm_sales_channel` | 100.0% | 100.0% | 7 | 0 | ✅ |
| `tbl_pp_syn_fct_ofr.plant_id` → `tbl_pp_syn_dm_plants` | 92.2% | 92.2% | 383 | 30 | ✅ |
| `tbl_pp_syn_fct_operations.country_id` → `tbl_pp_syn_dm_countries` | 92.3% | 92.3% | 13 | 1 | ✅ |
| `tbl_pp_syn_fct_operations.plant_id` → `tbl_pp_syn_dm_plants` | 98.0% | 98.0% | 49 | 1 | ✅ |
| `tbl_pp_syn_fct_performance.country_id` → `tbl_pp_syn_dm_countries` | 89.5% | 89.5% | 19 | 2 | ✅ |

Intentional design: `fct_ofr.country_channel` is reproduced as a column but NOT joined (contract resolution 0%).

## Representative aggregation queries

| query | groups | non-empty |
|---|---:|---|
| `countries_by_ou` | 5 | ✅ |
| `plants_per_country` | 5 | ✅ |
| `ofr_rows_by_year` | 3 | ✅ |
| `ofr_top_plants` | 5 | ✅ |
| `operations_by_month` | 12 | ✅ |

Sampled outputs (synthetic): OFR rows by year → 2025:61005, 2026:60942, 2027:60974 (within invariant window [2025,2027]); OFR→plant FK match 92.2% via live join.