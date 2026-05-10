"""
Log the PulsePlay Supervisor Agent to MLflow + Unity Catalog and deploy it
as a Databricks Mosaic AI serving endpoint.

RUN INSIDE A DATABRICKS NOTEBOOK attached to serverless or a single-user
cluster (this script imports `databricks-agents` which only works there).

Set these env vars first (use a Databricks secret scope for `*_TOKEN`
in production; plain env vars are fine for dev):

    SALES_SPACE_ID, CUSTOMER_SPACE_ID, OPS_SPACE_ID, HSE_SPACE_ID
    UC_CATALOG, UC_SCHEMA       # where to register the model
    AGENT_NAME                  # default: pulseplay_supervisor_agent
    ENDPOINT_NAME               # default: pulseplay-supervisor-agent
    SUPERVISOR_LLM_ENDPOINT     # default: databricks-meta-llama-3.1-405b-instruct
"""
import os
import mlflow
from databricks import agents

# Import the agent so MLflow can introspect signature + dependencies.
# The actual graph is rebuilt per-invocation from agent.py inside the
# serving endpoint, so env vars on the endpoint determine which spaces
# get wired in at runtime.
from agent import agent  # noqa: F401

# ── Config ──────────────────────────────────────────────────────────────
UC_CATALOG = os.environ["UC_CATALOG"]
UC_SCHEMA  = os.environ["UC_SCHEMA"]
AGENT_NAME = os.environ.get("AGENT_NAME", "pulseplay_supervisor_agent")
ENDPOINT_NAME = os.environ.get("ENDPOINT_NAME", "pulseplay-supervisor-agent")

UC_MODEL_NAME = f"{UC_CATALOG}.{UC_SCHEMA}.{AGENT_NAME}"

# Use Unity Catalog as the model registry (vs the legacy workspace registry).
mlflow.set_registry_uri("databricks-uc")

# ── Log the agent ───────────────────────────────────────────────────────
with mlflow.start_run(run_name="pulseplay-supervisor-agent"):
    logged_agent_info = mlflow.langchain.log_model(
        lc_model="agent.py",
        artifact_path="agent",
        registered_model_name=UC_MODEL_NAME,
        # input_example doubles as a smoke-test invocation when MLflow
        # validates the signature — keep it simple and cross-domain so
        # any failure in any tool surfaces immediately.
        input_example={
            "messages": [
                {
                    "role": "user",
                    "content": "Summarise sales, returns, and on-time rate for the latest year.",
                }
            ]
        },
        # Minimum-viable set — same as requirements.txt. agent.py only
        # uses langgraph.graph (StateGraph) + langchain_core.tools.@tool
        # which are stable across versions, so no need to fight pip on
        # transitives. Tight pins here previously caused ResolutionImpossible
        # on the Databricks runtime.
        pip_requirements=[
            "mlflow>=2.20",
            "databricks-langchain",
            "databricks-agents",
        ],
    )

print(f"Logged: {logged_agent_info.model_uri}")
print(f"UC: {UC_MODEL_NAME} v{logged_agent_info.registered_model_version}")

# ── Deploy as a Mosaic AI serving endpoint ──────────────────────────────
# scale_to_zero: idle endpoints cost ~$0; first request after idle has
# a ~30-60s cold-start. For an internal demo this is fine; flip to False
# if you need consistent low latency.
deployment = agents.deploy(
    model_name=UC_MODEL_NAME,
    model_version=logged_agent_info.registered_model_version,
    endpoint_name=ENDPOINT_NAME,
    scale_to_zero=True,
    environment_vars={
        "SALES_SPACE_ID":    os.environ["SALES_SPACE_ID"],
        "CUSTOMER_SPACE_ID": os.environ["CUSTOMER_SPACE_ID"],
        "OPS_SPACE_ID":      os.environ["OPS_SPACE_ID"],
        "HSE_SPACE_ID":      os.environ["HSE_SPACE_ID"],
        "SUPERVISOR_LLM_ENDPOINT": os.environ.get(
            "SUPERVISOR_LLM_ENDPOINT", "databricks-meta-llama-3.1-405b-instruct"
        ),
    },
)

print()
print("Deployment dispatched. Endpoint will become READY in ~5-10 minutes.")
print(f"Endpoint URL: {deployment.endpoint_url}")
print()
print("Update proxy/config.json supervisor profile to:")
print("---")
print(f'''  "supervisor": {{
    "type": "supervisor",
    "host": "<your-workspace-host>",
    "endpoint": "/serving-endpoints/{ENDPOINT_NAME}/invocations",
    "agentName": "PulsePlay Supervisor Agent",
    "token": "<PAT or service-principal token with CAN_USE on the endpoint>",
    "displayName": "PulsePlay Supervisor Agent",
    "dataDomain": "all helper data"
  }}''')
print("---")
print("Then restart the proxy and re-test in PulsePlay or the Pulse PBI sibling.")
