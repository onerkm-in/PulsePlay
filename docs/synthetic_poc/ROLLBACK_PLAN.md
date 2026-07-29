# ROLLBACK_PLAN

Lists **only** objects created by this run. Dropping them fully reverses the deployment.
No pre-existing object is referenced. Safe to re-run (deterministic, seed 42).

## Databricks (run in `workspace.databrickspractice`)
```sql
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_fct_performance;
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_fct_operations;
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_fct_ofr;
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_dm_sales_channel;
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_dm_plants;
DROP TABLE IF EXISTS workspace.databrickspractice.tbl_pp_syn_dm_countries;
```
(No metric views were created, so none need dropping.)

## Repository
The change is entirely additive — remove the added trees to revert:
```bash
rm -rf scripts/synthetic_poc docs/synthetic_poc data-contracts/genie-01f130be
```

## Re-deploy after rollback
```bash
export DATABRICKS_HOST=… DATABRICKS_TOKEN=… DATABRICKS_WAREHOUSE_NAME="Serverless Starter Warehouse"
python -m scripts.synthetic_poc.build --selfcheck --dry-run
python -m scripts.synthetic_poc.build --create --validate --json-output
```
