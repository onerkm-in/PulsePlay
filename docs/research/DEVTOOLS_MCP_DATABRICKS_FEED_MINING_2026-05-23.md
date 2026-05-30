# DevTools MCP Databricks Feed Mining - 2026-05-23

> Scope: sanitized synthesis of the live DevTools MCP feed at `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed`. This doc intentionally avoids copying raw tokens, cookies, statement signatures, user IDs, and full internal workspace URLs.

## Executive Readout

The feed proves that Chrome DevTools MCP can be a serious discovery and evidence layer for PulsePlay. It captured a signed-in Azure Databricks Genie Space, safe network/API metadata, safe response bodies, screenshots, accessibility snapshots, console issues, performance traces, and a continuous capture loop. The strongest product signal is that Databricks already exposes a rich, governed conversational analytics workflow around Genie Spaces; PulsePlay should integrate through the official Genie Conversation API and use the DevTools MCP feed only as evidence for UX behavior, API shape discovery, and browser-debugging.

Most important discovery: Genie's UI is not just "ask question, get answer." It is a workflow surface with room metadata, curated questions, instructions, schema, generated SQL, progress reports, reasoning/verification attachments, tabular result retrieval, visualization specs, feedback, comments, sharing, review requests, Monitor/Benchmark tabs, and adjacent Genie Code / Model Serving / Agent surfaces.

Detailed companion: [DEVTOOLS_MCP_DATABRICKS_CAPTURE_RUNBOOK_2026-05-23.md](DEVTOOLS_MCP_DATABRICKS_CAPTURE_RUNBOOK_2026-05-23.md) records the capture ladder, artifact map, heartbeat counts, route taxonomy, and next safe mining procedure.

## Feed Inventory

Feed root:

```text
D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed
```

Important captured artifacts:

| Artifact | What it contains | PulsePlay value |
|---|---|---|
| `LATEST-CAPTURE-SUMMARY.md` | Live and comprehensive capture totals. | Entry point for future mining. |
| `capture-policy.md` | Explicit skip/redaction policy for auth/session/token traffic. | Keep this policy as the evidence standard. |
| `postlogin-full-network-summary.md` | 422 post-login requests, host/status/method/path grouping. | High-signal map of Databricks UI activity. |
| `live-capture-20260523-143054/` | 487 raw requests, 477 safe requests, 54 API calls, screenshots, trace, console. | Best single focused capture. |
| `comprehensive-20260523-141643/` | DOM, render tree, stylesheets, performance entries, screenshots, API bodies. | Broad replay/debug substrate. |
| `continuous-capture-20260523-150913/` | Iterative captures with heartbeat and API body capture. | Long-running session archaeology. |
| `chrome-debug-profile/` | Dedicated debug Chrome profile. | Enables signed-in capture without sharing credentials in chat. |
| `CAPTURE-RUNBOOK-20260523.md` / repo runbook | Detailed runbook and evidence appendix. | Shows how to mine the feed safely and what details deserve attention. |

Current continuous capture status at inspection time:

- Process: `powershell` PID `12556`
- Latest heartbeat inspected in the detailed follow-up pass: iteration `21`
- Latest heartbeat iteration: `continuous-capture-20260523-150913\iter-00021-20260523-161656`
- Iteration 21 totals: 327 raw requests, 315 safe requests, 12 skipped auth/credential requests, 106 API metadata entries, 30 safe API bodies captured, 439 console messages.
- Continuous event log inspected through 22 completed iteration events: 12,974 raw network entries, 12,598 safe entries, 376 skipped auth/credential entries, 3,573 API metadata entries, and 634 successful API body captures out of 636 attempts. These are repeated capture-volume counts, not unique API counts.

I did not stop the continuous capture process.

## What Databricks Offers: Observed Surface

The logged-in page was a Genie Space titled "Sample Superstore - Sales Performance." The accessibility snapshot exposed these usable product surfaces:

| Surface | Observed controls / signals | PulsePlay implication |
|---|---|---|
| Genie Space chat | Chat tab, prompt input, disabled Agent/Chat controls, send button, "Always review the accuracy of responses." | PulsePlay should keep an explicit review/accuracy footnote on Databricks-backed answers. |
| Space lifecycle | `Reviewable` state, Data Room actions, Configure/Share controls. | PulsePlay can expose readiness and review state as first-class answer context. |
| Conversation history | Existing messages, edit-question buttons, message action menus. | A conversation is a durable object, not only a transient answer stream. |
| Result output | Result table, row count, "Download all rows (up to 1GB)", "Show code", collapse table. | PulsePlay should preserve result affordances: SQL, rows, download/export, row count. |
| Visualization output | Download PNG, edit visualization, widget title, generated chart spec. | PulsePlay can mirror generated visualization + editable title metadata. |
| Feedback | "Is this useful?" yes/no radios, comments endpoints. | Feedback is part of the loop and should map to PulsePlay's trust/review system. |
| Review | "Request Review" button on answers. | Important for internal governed workflows and author/SME review. |
| Suggestions | Follow-up question buttons and curated questions. | PulsePlay starter questions should be seeded from Genie curated/sample/follow-up questions where available. |
| Workspace navigation | SQL Editor, Queries, Dashboards, Genie Spaces, Alerts, Query History, SQL Warehouses, Data Ingestion, Playground, AI Gateway, Experiments, Features, Models, Serving. | Databricks-native destination map should extend beyond BI partners. |
| Adjacent AI surfaces | Additional open tabs showed Genie `DEEP_RESEARCH` and ML Playground for a `dwd-supervisor-agent` endpoint. | PulsePlay's X-axis should treat Genie, Genie Code, Model Serving, and Supervisor/agent endpoints as related but distinct integration cells. |

## What Databricks Offers: Observed Safe API Shape

The UI uses internal `ajax-api` and GraphQL routes. These are evidence, not integration contracts. PulsePlay should use official public APIs, especially the Genie Conversation API, for production.

Observed safe UI routes:

| Route family | Observed purpose | Contract posture |
|---|---|---|
| `/ajax-api/2.0/data-rooms/{space}` | Genie Space metadata, including display name, description, warehouse, tables, run-as type, suggestion description. | Evidence only. Map to official Genie Space APIs where possible. |
| `/ajax-api/2.0/data-rooms/{space}/schema` | UC table and column metadata with comments/types/masks. | Evidence only. PulsePlay should prefer UC APIs / official Genie APIs. |
| `/ajax-api/2.0/data-rooms/{space}/instructions` | Accepted/proposed Genie Space instructions and snippet metadata. | Evidence only. Useful for designing authoring UX. |
| `/ajax-api/2.0/data-rooms/{space}/curated-questions` | Exploration and sample questions. | Evidence only. Official management APIs may be the durable path. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}` | Conversation and message history. | Use official Conversation API instead. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/messages` | Create/poll message activity. | Use official Conversation API instead. |
| `/ajax-api/2.0/data-rooms/{space}/.../attachments/{attachment}/query-result` | Structured result retrieval: manifest, schema, chunks, rows. | Official Genie query-result API exists and should be used. |
| `/ajax-api/2.0/data-rooms/{space}/comments` | Thumbs and comment retrieval. | Evidence of review/feedback affordance. |
| `/ajax-api/2.0/data-rooms/{space}/column-configs` | Returned `{}` in this space. | Empty here, but likely supports local column-level configuration in richer spaces. |
| `/ajax-api/2.0/data-rooms/{space}/value-index` | Returned `{}` in this space. | Empty here, but aligns with sample-value/value-index concepts. |
| `/graphql/ConversationModelStatuses` | Model/status capability surface. | Evidence of UI orchestration, not public contract. |
| `/graphql/CustomCodeAgentsEndpoints` | Agent/model-serving endpoint discovery appeared in continuous capture metadata. | Evidence for Model Serving / custom agent endpoint UX. |
| `/ajax-api/2.0/redash-v2/config` | SQL/Redash-era config used by UI. | Evidence only. |

Observed example Genie Space metadata:

- Run-as type: `VIEWER`
- Backing warehouse present
- One UC table surfaced for the space
- Suggestion description status: `SUGGESTION_PROPOSED`
- The room description includes both capabilities and limitations.

Observed schema signal:

- One table with 19 columns.
- Columns include names, Databricks types, comments, and mask objects.
- The captured table/columns were rich enough to drive PulsePlay's business-context derivation without needing the iframe DOM.

Observed message lifecycle signal:

- A message response included attachments of these kinds: `progress_report`, `hamr_result`, `query`, `examples`, another verification `query`, `final_summary`, `viz`, `text`, and another verification `query`.
- The generated query attachment included SQL, a user-facing description, cached query schema, and a thinking/verification process.
- The result endpoint returned structured rows with a manifest, typed columns, row count, chunks, and truncation flag.
- The visualization attachment included a chart definition with `widgetType: heatmap`, field encodings, title, chart library, status, and links to the source query message/attachment.

Brutal-honest note: the raw response files include statement signatures. They must stay out of committed docs. This synthesis deliberately avoids copying them.

## Official API Alignment

Official docs now make the direction clear:

- The Genie Conversation API supports stateful natural-language querying from applications and agent frameworks.
- The official API supports starting conversations, sending messages, polling message state, listing messages, and retrieving attachment query results.
- Official docs call out that responses populate incrementally: generated SQL, description, follow-up questions, and context can become available before final completion.
- Official docs state that query results are structured, and the query-result endpoint is the durable way to retrieve table output.
- For embedded dashboards, Ask Genie is available in basic embedding, but external embedding should use the Genie Conversation API.

PulsePlay should therefore:

1. Use public `/api/2.0/genie/spaces/...` APIs for app integration.
2. Use DevTools MCP observations to improve UX parity and acceptance tests.
3. Never build production logic against internal `/ajax-api/...` or Databricks UI GraphQL routes.

## What This Adds To PulsePlay Strategy

### 1. Genie Space Metadata Becomes Setup Gold

The captured Genie Space has enough metadata to auto-fill setup:

- Display name
- Business description
- Warehouse binding
- UC table identifiers
- Run-as mode
- Suggested description and status
- Table/column descriptions and data types
- Accepted instructions
- Curated/sample questions

PulsePlay's Authoring setup should treat this as higher-confidence evidence than a generic iframe scrape. If a PulsePlay user points at a Genie Space, the setup flow can derive:

- BI surface name
- Business Context seed
- Starter questions
- Metric candidates
- Dimensions and filters
- Limitations/warnings
- Governance/trust footer detail

### 2. Message Attachments Are The Real Envelope

Genie output is not one blob. The useful envelope is:

- User question
- Message status
- Progress report
- SQL query attachment
- Schema/manifest
- Query result rows
- Verification steps
- Final summary
- Visualization spec
- Follow-up examples
- Feedback/comment/review affordances

PulsePlay should normalize this into a `DatabricksAnswerEnvelope`, not force it into the older Pulse-style section-only model.

### 3. PulsePlay Can Improve On Databricks UI In One Specific Place

The captured Genie UI is powerful but dense. PulsePlay can be more approachable by presenting:

- Answer first
- Trust/review footer
- SQL and result table in a drawer
- Visualization in a clean native canvas
- Follow-ups as starter chips
- "Request review" as a visible governed action
- Clear "computed from this space/table/warehouse" context

That is an experience layer, not a replacement for Databricks.

### 4. Genie Code And Model Serving Are Adjacent, Not The Same Product Cell

The continuous feed observed:

- A Genie `DEEP_RESEARCH` conversation tab.
- ML Playground tabs for `dwd-supervisor-agent`.
- Genie Code interactions around debugging and deploying a Databricks Model Serving endpoint.
- UI references to endpoint diagnosis, failed model versions, provisioned concurrency quota, and readiness.

This confirms the X-axis should support separate Databricks cells:

| Cell | What it is | PulsePlay posture |
|---|---|---|
| Genie Space | Governed conversational analytics over curated data. | First-class target for Viewer Ask. |
| Genie Code | Developer/data-work assistant inside Databricks. | Useful for author/developer workflows, not normal Viewer UX. |
| Model Serving endpoint | Production API endpoint for custom models, external models, or agents. | Proxy connector target. |
| Supervisor/custom code agent | Agent endpoint served through Mosaic AI / Model Serving. | Advanced AI connector profile. |
| AI Gateway | Governance/monitoring/routing layer for LLM access. | Future enterprise guardrail integration. |

## DevTools MCP Offer Confirmed By The Feed

The prior Chrome DevTools MCP tooling note was theoretical; this feed proves it works:

| Capability | Evidence in feed | Why it matters |
|---|---|---|
| Attach to signed-in browser | Dedicated Chrome debug profile succeeded after normal OAuth blocked isolated automation. | Practical route for authenticated Databricks UI research. |
| Page inventory | `pages.json` captured multiple Databricks tabs. | Lets us track UI state across Genie, Deep Research, and Playground. |
| Accessibility snapshot | Rich page tree with roles, controls, table rows, prompt boxes, nav links. | UX parity and a11y checks without raw screenshots alone. |
| Network inventory | Hundreds of requests grouped by host/status/path. | Shows what UI actually calls. |
| Safe body capture | 53/54 live API bodies captured in one pass; 30/30 per continuous iteration. | Enough for schema/result lifecycle mining. |
| Console issue capture | Quirks Mode, ARIA, form label/id issues, preload warnings. | Useful for product-quality comparisons and smoke evidence. |
| Screenshots | Viewport and full-page PNGs. | Visual QA evidence. |
| Performance traces | CLS and ForcedReflow insights captured. | Adds performance evidence to UI decisions. |
| Continuous capture | Iteration heartbeat and API body capture loop. | Good for long workflows such as login, agent deployment, and endpoint readiness. |

## Caveats

- The internal `ajax-api`/GraphQL routes are not public contracts.
- Raw artifacts can contain sensitive statement signatures, workspace hostnames, user/profile labels, and internal IDs. Do not commit raw files.
- The accessibility snapshot can capture visible personal/workspace text. Summaries should be sanitized.
- The live capture included console warnings from Databricks' own app; these are not PulsePlay bugs.
- The feed observed a Free Edition workspace and may not represent enterprise workspace capabilities, policies, or entitlements.
- The continuous capture process was still running at inspection time. Treat later files as newer evidence.

## Recommended Next Mining Loop

Navigate the signed-in debug Chrome through these specific surfaces while continuous capture runs:

1. Genie Space `Configure` tab - capture instructions, trusted assets, sample questions, benchmarks, monitor/review controls.
2. Genie Space `Monitor` and `Benchmark` tabs - learn review workflow, quality metrics, and run state.
3. AI/BI dashboard with companion Genie - compare dashboard-generated Genie vs standalone Genie Space.
4. SQL Warehouse Connection Details - capture official UI affordances for Power BI/Tableau/dbt/Python/JDBC/OAuth.
5. Model Serving endpoint page for `dwd-supervisor-agent` - capture endpoint state, traffic split, served versions, events, query UI, and errors.
6. AI Gateway page - capture governance/routing/monitoring knobs if available in Free Edition.
7. Databricks Apps listing/search - verify how Apps appear in Genie UI/search and workspace navigation.

Add a small summarizer script later that reads safe `api-call-metadata.json` and emits a sanitized endpoint map. Do not parse or persist auth/session endpoints.

## Source Ledger

Local feed:

- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\LATEST-CAPTURE-SUMMARY.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\session-log.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\capture-policy.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\postlogin-full-network-summary.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\live-capture-20260523-143054\*`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\continuous-capture-20260523-150913\*`

Official docs consulted:

- https://learn.microsoft.com/en-us/azure/databricks/genie/conversation-api
- https://learn.microsoft.com/en-us/azure/databricks/genie/
- https://learn.microsoft.com/azure/databricks/workspace/genie
- https://learn.microsoft.com/en-us/azure/databricks/dashboards/genie-spaces
- https://learn.microsoft.com/en-us/azure/databricks/genie-code/
- https://learn.microsoft.com/en-us/azure/databricks/genie-code/use-genie-code
- https://learn.microsoft.com/en-us/azure/databricks/genie-code/mcp
- https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/
- https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/custom-models
- https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/model-serving-limits
- https://learn.microsoft.com/en-us/azure/databricks/ai-bi/tools
