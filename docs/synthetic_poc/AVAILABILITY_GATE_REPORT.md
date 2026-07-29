# AVAILABILITY_GATE_REPORT — synthetic LATAM supply-chain POC

Stage-1 read-only assessment. Target chosen by the user: `workspace.databrickspractice`
in workspace `dbc-f88d29ce-4aa2` (o=7474646467214591). Every mandatory gate for the
six Delta tables reads `VERIFIED_RUNTIME`; the metric-view lane is `BLOCKED` by design.

| Dependency | Status | Evidence |
|---|---|---|
| Contract package | `VERIFIED_RUNTIME` | `data-contracts/genie-01f130be/` — 6 object JSONs + `_relationships.json` + `MANIFEST.md` + `GENERATION_PLAN.md`; all JSON parse-valid; package hash recorded |
| Privacy validation | `VERIFIED_RUNTIME` | every categorical `valuesWithheld:true` (A/9 masked patterns only); numerics = aggregate stats; DDL literals `<REDACTED_LITERAL>`; no secrets; `exampleSynthetic` declared synthetic |
| Databricks token | `VERIFIED_RUNTIME` | SCIM `/Me` → HTTP 200 (`onerkm@gmail.com`) |
| Workspace | `VERIFIED_RUNTIME` | `dbc-f88d29ce-4aa2` reachable |
| Warehouse | `VERIFIED_RUNTIME` | resolved by name `Serverless Starter Warehouse` → id kept in runtime config only; SQL `SELECT` → `SUCCEEDED` |
| Catalog `workspace` | `VERIFIED_RUNTIME` | present; `current_catalog()` → `workspace` |
| Schema `databrickspractice` | `VERIFIED_RUNTIME` | present; owner = `onerkm@gmail.com` |
| Required privileges | `VERIFIED_RUNTIME` | schema owner ⇒ implicit CREATE TABLE / SELECT; live CREATE + INSERT succeeded |
| Object-name collisions | `VERIFIED_RUNTIME` | none of the 9 target names pre-existed |
| Capacity | `VERIFIED_RUNTIME` | 1% scale ≈ 184k rows total; serverless XXSMALL sufficient (full OFR load completed) |
| Metric-view runtime support | `VERIFIED_RUNTIME` | a `METRIC_VIEW` object already exists in-schema (runtime supports them) |
| Metric-view reproduction | `BLOCKED` | measure aggregation formulas are redacted in the contract (`grandTotalAggregate` + comment only; no `measures:` YAML). Not reproduced — would require inventing redacted logic. |

## Environment note (source vs. target)
The **source** objects were captured from a *different* workspace — Genie space
`01f130be3444127a8d1991acfeb6f3e2`, workspace `adb-7901759384367063` (Azure `pep-snp-cdo`),
warehouse `pep-snp-cdo-dev-eus-dbsql01`. Those are **not reachable** with the current
token (source Genie space → HTTP 404 here; catalog `uc_dev_snt_supplychain_01` absent).
Per the user's direction, the synthetic clone was built in the reachable
`workspace.databrickspractice` instead. No source rows were ever read (only the supplied
contract package was used).
