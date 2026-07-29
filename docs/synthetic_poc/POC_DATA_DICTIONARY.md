# POC Data Dictionary — synthetic LATAM supply-chain clone

All objects live in `workspace.databrickspractice`. **Every value is synthetic.** Physical (non-measure) columns only; metric-view measures are NOT reproduced (formulas redacted).

## `tbl_pp_syn_fct_ofr`  ←  source `mtr_vw_ltm_sc_fct_ofr` (METRIC_VIEW)
Rows (full-scale source): 18,292,096 · physical cols: 28 · measures excluded: 25

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `period_type` | string | categorical-withheld | 0 | 2 | invent a synthetic domain of ~2 values matching masked pattern(s) [… |
| `country_id` | string | categorical-withheld | 0 | 16 | invent a synthetic domain of ~16 values matching masked pattern(s) … |
| `country_text` | string | categorical-withheld | 0 | 16 | invent a synthetic domain of ~16 values matching masked pattern(s) … |
| `ou` | string | categorical-withheld | 0 | 5 | invent a synthetic domain of ~5 values matching masked pattern(s) [… |
| `year` | int | numeric | 0 | 3 | numeric in [2025, 2027], ~3 distinct, 0 nulls; sample uniformly unl… |
| `month` | int | numeric | 0 | 12 | numeric in [1, 12], ~12 distinct, 0 nulls; sample uniformly unless … |
| `week` | int | numeric | 0 | 52 | numeric in [1, 52], ~52 distinct, 0 nulls; sample uniformly unless … |
| `quarter` | int | numeric | 0 | 4 | numeric in [1, 4], ~4 distinct, 0 nulls; sample uniformly unless in… |
| `quarter_name` | string | categorical-withheld | 0 | 4 | invent a synthetic domain of ~4 values matching masked pattern(s) [… |
| `month_name` | string | categorical-withheld | 0 | 11 | invent a synthetic domain of ~11 values matching masked pattern(s) … |
| `week_label` | string | categorical-withheld | 0 | 55 | invent a synthetic domain of ~55 values matching masked pattern(s) … |
| `month_order` | int | numeric | 0 | 24 | numeric in [202508, 202707], ~24 distinct, 0 nulls; sample uniforml… |
| `month_year` | timestamp | date | 0 | 24 | date/timestamp in [2025-08-01 00:00:00, 2027-07-01 00:00:00]; respe… |
| `material_id` | string | categorical-withheld | 0 | 6426 | invent a synthetic domain of ~6426 values matching masked pattern(s… |
| `sales_channel_id` | string | categorical-withheld | 0 | 8 | invent a synthetic domain of ~8 values matching masked pattern(s) [… |
| `sales_channel_text` | string | categorical-withheld | 479298 | 7 | invent a synthetic domain of ~7 values matching masked pattern(s) [… |
| `plant_id` | string | categorical-withheld | 0 | 390 | invent a synthetic domain of ~390 values matching masked pattern(s)… |
| `plant_name` | string | categorical-withheld | 15092 | 371 | invent a synthetic domain of ~371 values matching masked pattern(s)… |
| `plant_descr` | string | categorical-withheld | 198756 | 349 | invent a synthetic domain of ~349 values matching masked pattern(s)… |
| `plant_location` | string | categorical-withheld | 198756 | 347 | invent a synthetic domain of ~347 values matching masked pattern(s)… |
| `plant_region` | string | categorical-withheld | 198756 | 20 | invent a synthetic domain of ~20 values matching masked pattern(s) … |
| `plant_loc_type` | string | categorical-withheld | 198756 | 3 | invent a synthetic domain of ~3 values matching masked pattern(s) [… |
| `sales_office` | string | categorical-withheld | 0 | 421 | invent a synthetic domain of ~421 values matching masked pattern(s)… |
| `country_channel` | string | categorical-withheld | 0 | 68 | invent a synthetic domain of ~68 values matching masked pattern(s) … |
| `reject_id` | string | categorical-withheld | 0 | 47 | invent a synthetic domain of ~47 values matching masked pattern(s) … |
| `reject_text` | string | categorical-withheld | 0 | 48 | invent a synthetic domain of ~48 values matching masked pattern(s) … |
| `impact_fr` | string | categorical-withheld | 0 | 2 | invent a synthetic domain of ~2 values matching masked pattern(s) [… |
| `month_text` | string | categorical-withheld | 0 | 12 | invent a synthetic domain of ~12 values matching masked pattern(s) … |

## `tbl_pp_syn_fct_operations`  ←  source `mtr_vw_ltm_sc_fct_operations` (METRIC_VIEW)
Rows (full-scale source): 84,556 · physical cols: 18 · measures excluded: 91

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `source_kpi` | string | categorical-withheld | 0 | 5 | invent a synthetic domain of ~5 values matching masked pattern(s) [… |
| `period_type` | string | categorical-withheld | 0 | 2 | invent a synthetic domain of ~2 values matching masked pattern(s) [… |
| `country_id` | string | categorical-withheld | 0 | 13 | invent a synthetic domain of ~13 values matching masked pattern(s) … |
| `country_text` | string | categorical-withheld | 2 | 12 | invent a synthetic domain of ~12 values matching masked pattern(s) … |
| `ou` | string | categorical-withheld | 2 | 5 | invent a synthetic domain of ~5 values matching masked pattern(s) [… |
| `year` | int | numeric | 62 | 4 | numeric in [2024, 2027], ~4 distinct, 62 nulls; sample uniformly un… |
| `month` | int | numeric | 62 | 12 | numeric in [1, 12], ~12 distinct, 62 nulls; sample uniformly unless… |
| `quarter` | int | numeric | 62 | 4 | numeric in [1, 4], ~4 distinct, 62 nulls; sample uniformly unless i… |
| `quarter_name` | string | categorical-withheld | 62 | 4 | invent a synthetic domain of ~4 values matching masked pattern(s) [… |
| `month_name` | string | categorical-withheld | 62 | 11 | invent a synthetic domain of ~11 values matching masked pattern(s) … |
| `month_order` | int | numeric | 62 | 44 | numeric in [202401, 202707], ~44 distinct, 62 nulls; sample uniform… |
| `month_year` | timestamp | date | 62 | 44 | date/timestamp in [2024-01-01 00:00:00, 2027-07-01 00:00:00]; respe… |
| `plant_id` | string | categorical-withheld | 13900 | 48 | invent a synthetic domain of ~48 values matching masked pattern(s) … |
| `plant_descr` | string | categorical-withheld | 13908 | 49 | invent a synthetic domain of ~49 values matching masked pattern(s) … |
| `plant_location` | string | categorical-withheld | 13908 | 48 | invent a synthetic domain of ~48 values matching masked pattern(s) … |
| `plant_region` | string | categorical-withheld | 13908 | 15 | invent a synthetic domain of ~15 values matching masked pattern(s) … |
| `location_name` | string | categorical-withheld | 73296 | 58 | invent a synthetic domain of ~58 values matching masked pattern(s) … |
| `line_of_business` | string | categorical-withheld | 76380 | 2 | invent a synthetic domain of ~2 values matching masked pattern(s) [… |

## `tbl_pp_syn_fct_performance`  ←  source `mtr_vw_ltm_sc_fct_performance` (METRIC_VIEW)
Rows (full-scale source): 17,730 · physical cols: 14 · measures excluded: 71

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `source_kpi` | string | categorical-withheld | 0 | 3 | invent a synthetic domain of ~3 values matching masked pattern(s) [… |
| `period_type` | string | categorical-withheld | 0 | 2 | invent a synthetic domain of ~2 values matching masked pattern(s) [… |
| `country_id` | string | categorical-withheld | 0 | 19 | invent a synthetic domain of ~19 values matching masked pattern(s) … |
| `country_text` | string | categorical-withheld | 480 | 17 | invent a synthetic domain of ~17 values matching masked pattern(s) … |
| `ou` | string | categorical-withheld | 480 | 5 | invent a synthetic domain of ~5 values matching masked pattern(s) [… |
| `year` | int | numeric | 0 | 4 | numeric in [2024, 2027], ~4 distinct, 0 nulls; sample uniformly unl… |
| `month` | int | numeric | 0 | 12 | numeric in [1, 12], ~12 distinct, 0 nulls; sample uniformly unless … |
| `quarter` | int | numeric | 0 | 4 | numeric in [1, 4], ~4 distinct, 0 nulls; sample uniformly unless in… |
| `quarter_name` | string | categorical-withheld | 0 | 4 | invent a synthetic domain of ~4 values matching masked pattern(s) [… |
| `month_name` | string | categorical-withheld | 0 | 11 | invent a synthetic domain of ~11 values matching masked pattern(s) … |
| `month_order` | int | numeric | 0 | 49 | numeric in [202401, 202712], ~49 distinct, 0 nulls; sample uniforml… |
| `month_year` | timestamp | date | 0 | 49 | date/timestamp in [2024-01-01 00:00:00, 2027-12-01 00:00:00]; respe… |
| `job_type` | string | categorical-withheld | 4890 | 3 | invent a synthetic domain of ~3 values matching masked pattern(s) [… |
| `week_date` | timestamp | date | 17160 | 19 | date/timestamp in [2025-01-01 00:00:00, 2026-07-01 00:00:00]; respe… |

## `tbl_pp_syn_dm_countries`  ←  source `vw_ltm_sc_dm_countries` (VIEW)
Rows (full-scale source): 20 · physical cols: 7 · measures excluded: 0

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `country_id` | string | categorical-withheld | 0 | 20 | invent a synthetic domain of ~20 values matching masked pattern(s) … |
| `country_text` | string | categorical-withheld | 0 | 20 | invent a synthetic domain of ~20 values matching masked pattern(s) … |
| `ou` | string | categorical-withheld | 0 | 6 | invent a synthetic domain of ~6 values matching masked pattern(s) [… |
| `language` | string | categorical-withheld | 0 | 3 | invent a synthetic domain of ~3 values matching masked pattern(s) [… |
| `latitude` | double | numeric | 0 | 17 | numeric in [-34.0, 36.0], ~17 distinct, 0 nulls; sample uniformly u… |
| `longitude` | double | numeric | 0 | 20 | numeric in [-654512.0, -55.0], ~20 distinct, 0 nulls; sample unifor… |
| `id` | bigint | numeric | 0 | 20 | numeric in [1, 20], ~20 distinct, 0 nulls; sample uniformly unless … |

## `tbl_pp_syn_dm_plants`  ←  source `vw_ltm_sc_dm_plants` (VIEW)
Rows (full-scale source): 602 · physical cols: 10 · measures excluded: 0

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `plant_id` | string | categorical-withheld | 0 | 615 | invent a synthetic domain of ~615 values matching masked pattern(s)… |
| `descr` | string | categorical-withheld | 0 | 602 | invent a synthetic domain of ~602 values matching masked pattern(s)… |
| `location` | string | categorical-withheld | 0 | 602 | invent a synthetic domain of ~602 values matching masked pattern(s)… |
| `country_id` | string | categorical-withheld | 0 | 18 | invent a synthetic domain of ~18 values matching masked pattern(s) … |
| `region` | string | categorical-withheld | 0 | 20 | invent a synthetic domain of ~20 values matching masked pattern(s) … |
| `ou` | string | categorical-withheld | 0 | 6 | invent a synthetic domain of ~6 values matching masked pattern(s) [… |
| `loc_type` | string | categorical-withheld | 0 | 3 | invent a synthetic domain of ~3 values matching masked pattern(s) [… |
| `lat` | double | numeric | 47 | 459 | numeric in [-45.8858719, 32.601959], ~459 distinct, 47 nulls; sampl… |
| `lon` | double | numeric | 47 | 451 | numeric in [-117.025199, 86.26477051], ~451 distinct, 47 nulls; sam… |
| `pallet_cap` | double | numeric | 130 | 316 | numeric in [0.0, 40301.0], ~316 distinct, 130 nulls; sample uniform… |

## `tbl_pp_syn_dm_sales_channel`  ←  source `vw_ltm_sc_dm_sales_channel` (VIEW)
Rows (full-scale source): 11 · physical cols: 2 · measures excluded: 0

| column | type | sensitivity | null | distinct≈ | synthetic rule |
|---|---|---|---|---|---|
| `sales_channel_text` | string | categorical-withheld | 0 | 10 | invent a synthetic domain of ~10 values matching masked pattern(s) … |
| `country_channel` | string | categorical-withheld | 0 | 11 | invent a synthetic domain of ~11 values matching masked pattern(s) … |
