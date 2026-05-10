# PulsePlay Supervisor Agent for Databricks Mosaic AI

This directory contains the code to build, deploy, and operate a real
**Databricks Mosaic AI Supervisor Agent** that replaces the Node proxy's
`supervisor-local` orchestration.

## Why this exists

The proxy ships with a `supervisor-local` mode that *imitates* a supervisor
by fanning out to every Genie space in parallel and merging the results
in JS. It works but has limitations:

| | `supervisor-local` (today) | Real Supervisor Agent (this folder) |
|---|---|---|
| Where orchestration runs | Node proxy on your laptop | Databricks workspace serving endpoint |
| Routing | Always calls every `spaces[]` | Agent picks which spaces per question |
| Observability | proxy.out.log only | Full MLflow tracing per run |
| Governance | None | Unity Catalog model registry |
| Rate-limit risk | High (always 4 helpers) | Low (only relevant ones) |
| Cost | Free (your laptop) | Pay-per-use serving endpoint |
| Cold-start | None | ~30-60s with `scale_to_zero=True` |

## Files

| File | Purpose |
|---|---|
| `agent.py` | Agent definition — LangGraph `create_react_agent` + 4 `GenieAgent` tools |
| `log_and_deploy.py` | MLflow log + UC register + Mosaic AI deploy (run in Databricks) |
| `requirements.txt` | Python deps (also embedded in `log_and_deploy.py`'s `pip_requirements`) |
| `config.example.env` | Env vars template — copy values into your Databricks notebook |

## Prerequisites

1. **Databricks workspace** with serverless compute or a single-user cluster
2. **Permissions**:
   - `CAN_USE` on a foundation-model serving endpoint (e.g. `databricks-meta-llama-3.1-405b-instruct`)
   - `CAN_MANAGE` on a UC catalog/schema for model registration
   - Permission to create serving endpoints
3. **PAT or service principal** that the agent uses to call its Genie-space tools (must have `CAN_RUN` on each space)

## Deploy steps

### 1. Upload this folder to Databricks

```bash
databricks workspace import-dir \
  databricks-agents/supervisor \
  /Workspace/Users/<you>/pulseplay-supervisor-agent
```

Or drag-and-drop in the Databricks UI under Workspace → Users → you.

### 2. Open `log_and_deploy.py` as a notebook

In the Databricks UI it'll open as a notebook. Set env vars at the top
(or pull from a Databricks secret scope), then run it cell-by-cell.

### 3. What the deploy script does

1. Logs `agent.py` as an MLflow LangChain model
2. Registers it in Unity Catalog at `<UC_CATALOG>.<UC_SCHEMA>.pulseplay_supervisor_agent`
3. Deploys that model version to a Mosaic AI serving endpoint (default name `pulseplay-supervisor-agent`)
4. Prints the `proxy/config.json` snippet you need

The endpoint takes ~5-10 minutes to become READY (MLflow build + container start).

### 4. Update `proxy/config.json`

Replace the existing `supervisor` profile with the snippet the deploy script printed:

```json
"supervisor": {
  "type": "supervisor",
  "host": "https://dbc-...cloud.databricks.com",
  "endpoint": "/serving-endpoints/pulseplay-supervisor-agent/invocations",
  "agentName": "PulsePlay Supervisor Agent",
  "token": "<PAT or SP token with CAN_USE on the endpoint>",
  "displayName": "PulsePlay Supervisor Agent",
  "dataDomain": "all helper data"
}
```

Fields that **disappear** vs `supervisor-local` (the agent owns these now):
- `spaces[]` — the agent decides routing
- `synthesisEndpoint` — the agent calls its own LLM internally
- `staggerMs` — the agent manages helper concurrency

### 5. Restart the proxy and test

```powershell
cd proxy ; node server.js
```

Then in PulsePlay (or the Pulse PBI sibling visual): switch the connector
profile to **Supervisor**, ask a cross-domain question (e.g. "How did
sales, returns, and on-time rate move year-over-year?"), and watch:

- The MLflow trace UI in Databricks shows which agents got called and why
- The proxy log shows a single supervisor call (no fan-out chatter)
- The visual renders the synthesised answer

## Iteration tips

- **Change supervisor behaviour** — edit `agent.py` (system prompt, tool descriptions, LLM choice) and re-run `log_and_deploy.py`. It creates a new model version and updates the endpoint.
- **Add a 5th Genie space** — add another `GenieAgent(...)` block in `agent.py` and include it in the `tools=[...]` list. Add the corresponding env var to `log_and_deploy.py`.
- **Debug routing** — the MLflow trace shows the agent's reasoning at each step. Open the run in MLflow UI → "Traces" tab.
- **Lower latency** — set `scale_to_zero=False` in `log_and_deploy.py` to keep the endpoint warm. Trade-off: higher cost during idle.

## Cost (rough)

With `scale_to_zero=True`:
- Idle: ~$0
- Per question: foundation-model invocation (typically <$0.01) + each Genie space called (Genie bills against the SQL warehouse — typically pennies per query)

For an internal demo, expect **<$1/day** of active use.

## Rollback

To revert to `supervisor-local`, just put back the original `supervisor` profile in `proxy/config.json` (with `type: supervisor-local`, `spaces[]`, `synthesisEndpoint`) and restart the proxy. The Mosaic endpoint can stay deployed (it costs ~$0 idle) — both modes can coexist on different proxy profile names if you want side-by-side comparison.
