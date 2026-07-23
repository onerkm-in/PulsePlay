# Action Insights — Detection Engine (Python)

The Python-heavy "brain" of Action Insights: **rules detect → deterministic 10-part Decision
Prompts → Delta prompt store + audit**. LLM explanation is optional/additive; humans approve via
the serving layer. MVP action ceiling = **Level 3** (enforced at rule load).

## Layout
| File | Role |
|------|------|
| `config.py` | env-first settings, MVP-scoped table names, action-level ceiling |
| `sql_client.py` | SQL Statement Execution REST API + `truststore` (proxy-safe); parameterized queries |
| `models.py` | dataclasses: `Rule`, `Evidence`, `DecisionPrompt` |
| `rules.json` | 5 MVP rules (SCM-OTIF/FILL/FA/SUPP/INV); certified targets, severity tiers, personas, actions |
| `rules.py` | load + validate rules; **rejects action_level > 3** and unknown actions |
| `action_registry.py` | governed actions with control level + required capability |
| `detect.py` | run rules over the KPI fact; severity, confidence framing, business impact, evidence, content-hash `prompt_id`, narrative; per-rule isolation |
| `prompt_store.py` | MERGE upsert into `decision_prompts` (preserves human-set status) |
| `audit.py` | append-only audit writer |
| `cli.py` | `--selfcheck / --dry-run / --persist / --persona / --rule-id / --month / --limit` |
| `tests/` | pytest unit tests (pure logic, no DB) |

## Run
```bash
# warehouse must be running
databricks warehouses start 6510da50329f1e85 -p AgenticIntelligence

.venv/Scripts/python.exe -m action_insights.cli --selfcheck        # health + detection dry run
.venv/Scripts/python.exe -m action_insights.cli --dry-run -v       # detect + full narratives
.venv/Scripts/python.exe -m action_insights.cli --persist          # write prompts + audit
.venv/Scripts/python.exe -m pytest action_insights/tests -q        # unit tests
```

## Design guarantees
- **Deterministic:** every prompt field derives from governed SQL over `main.supply_chain.*`; no
  invented root causes/impacts/owners. `prompt_id` is a content hash over stable fields (rule,
  persona, entity, month, severity, root-cause, action, evidence signature) — excludes timestamps
  and wording, so re-running does not create duplicates or churn.
- **Confidence changes language:** high → "The issue appears to be…"; medium → "The likely root
  cause is…"; low → "A possible factor is…".
- **Governed:** action ceiling ≤ 3 enforced at load; MVP triggers are logged-only.
- **Auditable:** detection and (later) every view/action/approval append to `decision_audit`.

## Deploy
Runs as a scheduled Databricks **Job** (`python -m action_insights.cli --persist`) — a Job, not an
App, so it does not consume the single free-tier App slot. The serving layer (topology **T2**)
reads the prompt store from the PulsePlay Node proxy.
