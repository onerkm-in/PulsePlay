# PulsePlay SCM (synthetic) — Power BI project (PBIP/TMDL)

A **Power BI Project (PBIP)** whose semantic model points at the same synthetic SCM data the
Databricks/Genie path uses, so PulsePlay's Power BI config compares apples-to-apples with its
Databricks config. Author it → refresh → publish → tell me the IDs and I connect PulsePlay.

> ⚠️ **Hand-authored, not validated in a Power BI engine.** I can't run Power BI Desktop in my
> environment, so treat this as a best-effort project — it may need a small fix on first open. If
> Desktop reports an error, paste it to me and I'll correct the TMDL/JSON. The **DAX + M + the data
> views are proven correct** (numbers reconcile to the metric views to the decimal); the risk is only
> in PBIP file-format/indentation nuances. Fallback if you'd rather not iterate: the guided
> click-by-click build in [../../docs/synthetic_poc/PBI_APPLES_TO_APPLES.md](../../docs/synthetic_poc/PBI_APPLES_TO_APPLES.md).

## Contents
```
PulsePlay_SCM_Synthetic.pbip                 ← open THIS in Power BI Desktop
PulsePlay_SCM_Synthetic.SemanticModel/       ← the model (TMDL): 3 tables + DAX + Databricks source
  definition/model.tmdl
  definition/tables/{ofr,operations,performance}.tmdl
PulsePlay_SCM_Synthetic.Report/              ← a single blank "KPIs" page (add visuals to sanity-check)
```
- **Source:** Databricks `dbc-f88d29ce-4aa2.cloud.databricks.com`, warehouse `/sql/1.0/warehouses/6510da50329f1e85`, catalog `workspace`, schema `databrickspractice`, views `vw_pbi_scm_ofr|operations|performance` (Import mode).
- **Measures:** replicate the metric-view formulas exactly (SUM components, then `DIVIDE`).

## Open + refresh
1. Power BI Desktop → **File → Options → Preview features** → enable **"Power BI Project (.pbip) save option"** (and, if listed, **"Store semantic model using TMDL"**). Restart Desktop.
2. **File → Open** → `PulsePlay_SCM_Synthetic.pbip`.
3. It will prompt for the **Azure Databricks** connection → sign in with your Databricks/AAD account (same account that reaches this workspace). Refresh pulls the 3 views.
4. Sanity-check on the KPIs page (add a couple of cards / a by-year column) against the expected values below.

## Expected values (must match — same as the Databricks path)
| KPI | 2024 | 2025 | 2026 (YTD Jan–Jun) |
|---|---|---|---|
| Order Fill Rate Pct | 97.45 | 98.24 | 99.04 |
| OTIF Pct | 92.44 | 93.45 | 94.45 |
| Net Sales USD | 1,772.0 MM | 1,877.9 MM | 1,031.4 MM |
| Gross Margin Pct | 53.84 | 55.23 | 55.60 |
| GHG Emissions tCO2e | 2,523,750 | 2,399,415 | 1,138,707 |

## Publish + hand back
1. **Publish** to a Power BI workspace you own (name it e.g. *PulsePlay SCM (synthetic)*).
2. Send me: **workspace ID** + **dataset (semantic model) ID** (from the dataset URL / Settings) and the **auth mode** (user-refresh like `powerbi-dwd`, or a service principal).
3. I'll add a `powerbi` profile in `proxy/config.json` and re-run the headed apples-to-apples validation (Power-BI-only + hybrid) against the same SCM data.
