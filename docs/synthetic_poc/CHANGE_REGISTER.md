# File-by-file change register

All additions; **no existing repository file was modified**. All Databricks writes were
confined to `workspace.databrickspractice`.

## New source (generator package)
| file | purpose |
|---|---|
| `scripts/synthetic_poc/__init__.py` | package marker + provenance note |
| `scripts/synthetic_poc/models.py` | typed contract / column / relationship / build-target models |
| `scripts/synthetic_poc/logging_config.py` | structured JSON logger with secret redaction |
| `scripts/synthetic_poc/contract_loader.py` | load + structurally validate the contract package (fail-closed) |
| `scripts/synthetic_poc/privacy_validator.py` | contract-side + generated-side leakage checks |
| `scripts/synthetic_poc/generators.py` | deterministic masked-pattern / numeric / timestamp generation |
| `scripts/synthetic_poc/relationships.py` | table assembly with contract-accurate FK integrity/orphans |
| `scripts/synthetic_poc/sqlgen.py` | Delta DDL + batched INSERT text |
| `scripts/synthetic_poc/databricks_client.py` | SQL Statement Execution API client (env/`~/.databrickscfg`, retry, OS trust store) |
| `scripts/synthetic_poc/validate.py` | post-create validation against live objects |
| `scripts/synthetic_poc/build.py` | CLI: `--selfcheck --dry-run --create --validate --scale-factor --seed --json-output` |
| `scripts/synthetic_poc/tests/__init__.py`, `tests/conftest.py`, `tests/test_synthetic_poc.py` | 19 offline tests |

## New data / docs
| file | purpose |
|---|---|
| `data-contracts/genie-01f130be/*` | the supplied contract package (extracted from `data-contracts.zip`) |
| `docs/synthetic_poc/AVAILABILITY_GATE_REPORT.md` | Stage-1 gate results |
| `docs/synthetic_poc/SYNTHETIC_BUILD_PLAN.md` | build order, scale, rounding |
| `docs/synthetic_poc/SYNTHETIC_DEPLOYMENT_MANIFEST.json` | run id, hashes, per-object rows, created flags, validation status |
| `docs/synthetic_poc/VALIDATION_REPORT.md` | schema/row/null/cardinality/range/invariant/FK/query results |
| `docs/synthetic_poc/PRIVACY_LEAKAGE_REPORT.md` | leakage assessment |
| `docs/synthetic_poc/POC_DATA_DICTIONARY.md` | per-column dictionary |
| `docs/synthetic_poc/DDL_INVENTORY.md` | exact DDL + generation-source inventory |
| `docs/synthetic_poc/CHANGE_REGISTER.md` | this file |
| `docs/synthetic_poc/ROLLBACK_PLAN.md` | drop-only rollback for objects created by this run |

## Databricks objects created (in `workspace.databrickspractice`)
`tbl_pp_syn_dm_countries`, `tbl_pp_syn_dm_plants`, `tbl_pp_syn_dm_sales_channel`,
`tbl_pp_syn_fct_ofr`, `tbl_pp_syn_fct_operations`, `tbl_pp_syn_fct_performance`.
Not created (BLOCKED): `mtr_pp_syn_ltm_sc_fct_ofr`, `mtr_pp_syn_ltm_sc_fct_operations`,
`mtr_pp_syn_ltm_sc_fct_performance`.
