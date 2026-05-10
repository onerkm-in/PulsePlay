"""
DwD Multi-Domain Supervisor Agent for Databricks Mosaic AI.

Replaces the proxy's `supervisor-local` orchestration with a real
Databricks-managed agent. Each Genie space is wrapped as a `@tool`-
decorated function; an LLM picks tools and synthesises a single answer
inside a manually-built LangGraph StateGraph.

Architecture choices:

1. **Manual StateGraph (not `langgraph.prebuilt.create_react_agent`).**
   `langgraph.prebuilt.tool_node` started referencing symbols
   (`ExecutionInfo`, `ServerInfo`) from `langgraph.runtime` that don't
   exist in matching base versions. Pip's resolver couldn't land a
   coherent combination — `databricks-langchain` and `databricks-agents`
   pull `langgraph >= 0.6` transitively, which breaks the prebuilt
   import on the runtime. Manual StateGraph uses only the stable
   `langgraph.graph` API which has been unchanged across releases.

2. **`mlflow.pyfunc.ChatAgent` wrapper.** Databricks Mosaic AI Agent
   Framework requires deployed models to return `ChatCompletionResponse`
   or `StringResponse` schema. A bare LangGraph runnable returns
   `{messages: [...]}` which Databricks rejects with "schema not
   compatible with Agent Framework". Subclassing `ChatAgent` adapts the
   StateGraph's output to the Agent Framework's expected shape.

Deployed as a Mosaic AI serving endpoint via the deploy cell in
`deploy.ipynb`.

Env vars required at deploy time (set via
`agents.deploy(environment_vars=...)`):
    SALES_SPACE_ID, CUSTOMER_SPACE_ID, OPS_SPACE_ID, HSE_SPACE_ID
    SUPERVISOR_LLM_ENDPOINT  (default: databricks-meta-llama-3.1-405b-instruct)
"""
import os
from typing import Annotated, Any, Optional, Sequence, TypedDict

import mlflow
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from mlflow.pyfunc import ChatAgent
from mlflow.types.agent import ChatAgentMessage, ChatAgentResponse, ChatContext

from databricks_langchain import ChatDatabricks

# GenieAgent moved to top-level in databricks-langchain >= 0.7
try:
    from databricks_langchain import GenieAgent
except ImportError:
    from databricks_langchain.genie import GenieAgent

# ── 1. Genie space wrappers ─────────────────────────────────────────────
SALES_SPACE_ID    = os.environ["SALES_SPACE_ID"]
CUSTOMER_SPACE_ID = os.environ["CUSTOMER_SPACE_ID"]
OPS_SPACE_ID      = os.environ["OPS_SPACE_ID"]
HSE_SPACE_ID      = os.environ["HSE_SPACE_ID"]

SUPERVISOR_LLM_ENDPOINT = os.environ.get(
    "SUPERVISOR_LLM_ENDPOINT", "databricks-meta-llama-3.1-405b-instruct"
)

# Build a WorkspaceClient with explicit creds when the endpoint env supplies
# them. Defaults to the auto-injected serving-endpoint OBO token if not set.
# Pinning explicit creds (Option 3 in our deploy decision) gives a working
# demo without needing CAN_RUN grants propagated through Databricks's
# managed-identity flow, which doesn't always auto-wire for Genie spaces.
def _make_genie_client():
    host = os.environ.get("DATABRICKS_HOST")
    token = os.environ.get("DATABRICKS_TOKEN")
    if host and token:
        from databricks.sdk import WorkspaceClient
        return WorkspaceClient(host=host, token=token)
    return None  # fall through to default auto-auth


_explicit_client = _make_genie_client()


def _build_genie(space_id: str, name: str, description: str):
    """GenieAgent accepts a `client=` kwarg in databricks-langchain >= 0.4.
    Older versions only take genie_space_id/name/description; in that case
    we just rely on whatever default auth the runtime injects."""
    kwargs = dict(
        genie_space_id=space_id,
        genie_agent_name=name,
        description=description,
    )
    if _explicit_client is not None:
        try:
            return GenieAgent(**kwargs, client=_explicit_client)
        except TypeError:
            pass  # older signature — fall through
    return GenieAgent(**kwargs)


_sales_genie    = _build_genie(SALES_SPACE_ID,    "SalesAgent",       "Sales performance Genie space")
_customer_genie = _build_genie(CUSTOMER_SPACE_ID, "CustomerAgent",    "Customer experience Genie space")
_ops_genie      = _build_genie(OPS_SPACE_ID,      "OperationsAgent",  "Operations & targets Genie space")
_hse_genie      = _build_genie(HSE_SPACE_ID,      "HSEAgent",         "Health, safety & fulfilment Genie space")


def _ask_genie(genie_agent, question: str) -> str:
    """Invoke a GenieAgent and extract its final text answer.

    GenieAgent.invoke takes the same `{messages: [...]}` dict shape as
    a chat model and returns either a dict with `messages` or a raw
    response — handle both for forward compatibility.
    """
    result = genie_agent.invoke({"messages": [HumanMessage(content=question)]})
    if isinstance(result, dict) and "messages" in result:
        last = result["messages"][-1]
        return getattr(last, "content", str(last))
    return getattr(result, "content", str(result))


# ── 2. Tools — what the supervisor LLM picks from ───────────────────────
@tool
def query_sales(question: str) -> str:
    """Sales performance: revenue, profit, margin, category, sub-category,
    product, customer, region, year-over-year. Grain: order line-item.
    Use for any question primarily about how sales/profit moved."""
    return _ask_genie(_sales_genie, question)


@tool
def query_customer(question: str) -> str:
    """Customer experience: returns, NPS, complaints, churn risk,
    segments. Grain: order line-item with CX synthetic metrics. Use for
    questions about customer behavior, retention, satisfaction, return
    patterns."""
    return _ask_genie(_customer_genie, question)


@tool
def query_operations(question: str) -> str:
    """Operations & targets: monthly target attainment, fulfillment,
    on-time rate, HSE incidents at the operations level. Grain: region x
    category x month aggregate. NOTE: actual_sales is monthly-aggregated
    and rounded to 2dp, so values may diverge by <1% from the order-line
    Sales/Customer/HSE sources — that drift is normal."""
    return _ask_genie(_ops_genie, question)


@tool
def query_hse(question: str) -> str:
    """Health, safety & fulfilment: shipping speed, days-to-ship, delays,
    incidents, ship mode. Grain: order line-item with shipping detail.
    Use for operational delivery questions, not sales performance."""
    return _ask_genie(_hse_genie, question)


TOOLS = [query_sales, query_customer, query_operations, query_hse]
TOOL_BY_NAME = {t.name: t for t in TOOLS}


# ── 3. Supervisor LLM ───────────────────────────────────────────────────
SUPERVISOR_SYSTEM = """\
You are the supervisor for a multi-domain analytics team. You have four tools,
each scoped to its own data source:

- query_sales       — sales performance, profit, margin, category mix
- query_customer    — customer experience, returns, churn, NPS, segments
- query_operations  — monthly targets, fulfilment, on-time rate (monthly
                      aggregates rounded to 2dp, expect minor drift vs
                      order-line sources)
- query_hse         — health, safety, shipping speed, incidents

Routing rules:
1. **Bias toward calling tools, not punting.** When a question even
   *touches* a domain, call that tool. Only skip a tool if it's
   unambiguously irrelevant. The cost of an extra tool call is small;
   the cost of an unanswered cross-domain question is high.
2. **Vague / cross-domain prompts → call multiple tools in parallel.**
   Examples that need ≥2 tools (call them in one turn as parallel
   tool calls):
     - "risk snapshot", "summary", "overview", "scorecard", "briefing"
     - "which segments / regions are at risk"
     - any question mentioning two or more of:
       sales, profit, margin, customer, return, churn, target,
       attainment, fulfilment, on-time, shipping, incident, HSE
3. **Decompose composite questions before routing.** If the user asks
   "X and Y", decide what each part needs and call accordingly.
   Example: "sales growth AND on-time rate" → query_sales + query_operations.
4. If the user explicitly names a single domain ("show sales"), call
   only that one.
5. **NEVER respond with "the question is too broad" or "please rephrase."**
   If you're unsure which tool, call the most likely 2-3 in parallel and
   work with what comes back. Punting is failure.

Tool-call rephrasing:
- When you call a Genie tool, pass it a focused single-domain question.
  Don't forward the user's full cross-domain question to one tool — it'll
  fail. Example: user asks "compare sales and on-time rate", you call
  query_sales("sales by year") AND query_operations("on-time rate by year")
  in parallel, then synthesize.

Synthesis rules (apply when writing the final answer):
- Lead with the conclusion (BLUF — Bottom Line Up Front).
- Cite numbers in USD with 2 decimal places ($1,234.56 or $1.23M).
- Use percentage-points (pp) for absolute deltas, % for relative change.
  Example: "60% to 66% is +6pp (+10% relative)". Never write +10% when you
  mean +6pp.
- Flag cross-domain discrepancies only when the divergence exceeds 1%
  (operations data is monthly-rounded, so small drift is expected).
- Never invent figures the tools didn't return.
- If a tool returned no data or "I don't have that", say what's missing
  but still synthesize from what DID come back. Don't bail on the whole
  answer because one tool came up empty.
- Don't mention internal tool names ("query_sales") in the final answer —
  the user sees a unified narrative, as if you read the data directly.
- For metric direction: lower-is-better for Return Rate, Days-to-Ship;
  higher-is-better for Sales, Profit, Margin, YoY%.
"""

_llm = ChatDatabricks(endpoint=SUPERVISOR_LLM_ENDPOINT)
_llm_with_tools = _llm.bind_tools(TOOLS)


# ── 4. Manual StateGraph supervisor loop ────────────────────────────────
class _State(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]


def _agent_node(state: _State) -> dict:
    msgs = list(state["messages"])
    # Inject the system prompt on the first turn.
    if not msgs or getattr(msgs[0], "type", None) != "system":
        msgs = [SystemMessage(content=SUPERVISOR_SYSTEM)] + msgs
    response = _llm_with_tools.invoke(msgs)
    return {"messages": [response]}


def _tools_node(state: _State) -> dict:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    outputs: list[ToolMessage] = []
    for tc in tool_calls:
        name = tc.get("name") if isinstance(tc, dict) else tc.name
        args = tc.get("args") if isinstance(tc, dict) else tc.args
        tc_id = tc.get("id") if isinstance(tc, dict) else tc.id
        tool_fn = TOOL_BY_NAME.get(name)
        if tool_fn is None:
            outputs.append(ToolMessage(
                content=f"Unknown tool '{name}'.", tool_call_id=tc_id, name=name,
            ))
            continue
        try:
            result = tool_fn.invoke(args)
        except Exception as exc:
            result = f"Tool {name} raised: {exc!r}"
        outputs.append(ToolMessage(content=str(result), tool_call_id=tc_id, name=name))
    return {"messages": outputs}


def _should_continue(state: _State) -> str:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


_builder = StateGraph(_State)
_builder.add_node("agent", _agent_node)
_builder.add_node("tools", _tools_node)
_builder.add_edge(START, "agent")
_builder.add_conditional_edges("agent", _should_continue, {"tools": "tools", END: END})
_builder.add_edge("tools", "agent")
_graph = _builder.compile()


# ── 5. ChatAgent wrapper for Databricks Agent Framework ─────────────────
def _to_lc_message(m) -> BaseMessage:
    """Convert ChatAgentMessage (or dict) to a LangChain BaseMessage."""
    role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else "user")
    content = getattr(m, "content", None) or (m.get("content") if isinstance(m, dict) else "")
    if role == "system":
        return SystemMessage(content=content)
    if role == "assistant":
        return AIMessage(content=content)
    return HumanMessage(content=content)


class SupervisorChatAgent(ChatAgent):
    """Adapt the LangGraph StateGraph to the Mosaic AI ChatAgent contract.

    Databricks Agent Framework requires deployed models to expose a
    `predict(messages, context, custom_inputs) -> ChatAgentResponse`
    method. This class wraps the underlying _graph so the input shape
    (list of ChatAgentMessage) and output shape (ChatAgentResponse)
    match what the serving endpoint and proxy expect.
    """

    def predict(
        self,
        messages: list[ChatAgentMessage],
        context: Optional[ChatContext] = None,
        custom_inputs: Optional[dict[str, Any]] = None,
    ) -> ChatAgentResponse:
        lc_messages = [_to_lc_message(m) for m in messages]
        result = _graph.invoke({"messages": lc_messages})
        final = result["messages"][-1]
        content = getattr(final, "content", str(final))
        return ChatAgentResponse(
            messages=[
                ChatAgentMessage(
                    role="assistant",
                    content=str(content),
                    id=getattr(final, "id", None) or "supervisor-final",
                )
            ]
        )


agent = SupervisorChatAgent()

# MLflow log-as-code: register this object as the model the file exposes.
mlflow.models.set_model(agent)

__all__ = ["agent"]
