# Synthetic supply-chain dataset (in-repo, reproducible)

This package reproduces, in code, the star schema the Decision Assist detection
engine runs on — so the demo data is **version-controlled and regenerable**
instead of only living in the Databricks workspace.

## Why

The live demo data in `main.supply_chain.*` was built Databricks-side (the
`ai_engine` package/job); `detect.py` only *reads* it. That means it wasn't
reproducible from the repo. This generator closes that gap: a seeded, pure Python
generator whose output matches the live schema exactly and drives the same five
SCM rules.

## What it produces

Deterministic (seed `20260723` by default), matching the live cardinality:

| table | rows | | table | rows |
|---|---|---|---|---|
| dim_product | 120 | | fact_order_line | 3564 |
| dim_supplier | 15 | | fact_inventory_monthly | 864 |
| dim_location | 6 | | fact_forecast_monthly | 576 |
| dim_carrier | 4 | | fact_supply_chain_kpi_monthly | 576 |
| dim_date | 36 mo | | fact_supplier_scorecard_monthly | 540 |

4 categories (Electronics, Legacy Parts, Refrigeration, Seasonal) × 4 regions
(APAC/EMEA/LATAM/NA) × 36 months (202301–202512).

Baselines are healthy; a fixed set of **breaches** is injected into the latest
month so every rule fires with a known severity:

| rule | breach | severity |
|---|---|---|
| SCM-OTIF-001 | Refrigeration/EMEA OTIF 86.9% (+$10,625 fine/penalty) | high |
| SCM-FILL-001 | Electronics/NA line-fill 86.1% + stockout | high |
| SCM-FA-001 | Seasonal/APAC forecast accuracy 67.8%, +18% bias | critical |
| SCM-INV-001 | Legacy Parts avg days-of-supply ~130 | critical |
| SCM-SUPP-001 | Nakamura Components on-time 72% | critical |

## Use

```bash
# unit tests (pure, no network)
python -m pytest scripts/decision_assist/synth/tests/ -q

# load into a DEV stand-in schema (never the live main.supply_chain or an org schema)
python -m scripts.decision_assist.synth.load --schema main.supply_chain_synth --drop

# end-to-end proof: generate → load → run the REAL engine → assert all 5 rules fire
python scripts/decision_assist/prove_synth.py
```

Live steps read Databricks creds from `proxy/config.json` (genie profile) or the
usual `DATABRICKS_HOST/TOKEN` + `DATABRICKS_WAREHOUSE_ID` env, and require
`truststore` (in `requirements.txt`) behind a TLS-intercepting proxy.

## Guardrails

- **Non-destructive:** `load()` refuses to write `main.supply_chain` or any
  `uc_dev_snt*` (canonical org) schema — dev stand-in only.
- The formal synthetic-data lane into the canonical org serving schema
  (`uc_dev_snt_supplychain_01` + conformance GO) remains owner-gated; this
  package is the dev/demo generator, not that lane.
- No secrets in the code; coordinates come from env / the gitignored config.
