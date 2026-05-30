# DevTools MCP Databricks Capture Runbook And Detailed Evidence Appendix - 2026-05-23

> Scope: detailed, sanitized documentation for the local capture feed at `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed`. This file records steps, evidence shape, counts, route families, and PulsePlay implications without copying raw tokens, cookies, authorization headers, statement signatures, full workspace URLs, user IDs, or endpoint IDs.

## Purpose

This is the detailed companion to [DEVTOOLS_MCP_DATABRICKS_FEED_MINING_2026-05-23.md](DEVTOOLS_MCP_DATABRICKS_FEED_MINING_2026-05-23.md). The summary doc answers "what did we learn?" This runbook answers "how was it captured, where is the evidence, what deserves attention, and how should the next mining pass be performed?"

Use this document when:

- continuing Databricks UI/product discovery from the DevTools MCP feed;
- explaining the evidence chain behind PulsePlay Databricks decisions;
- reproducing a safe browser capture against a logged-in Databricks workspace;
- deciding which observed Databricks surface should map to official APIs, PulsePlay adapters, or acceptance tests.

## Non-Negotiable Safety Rules

- Credentials are entered only by the human in the visible browser. They are never pasted into chat, scripts, logs, docs, or prompts.
- Do not capture request/response bodies for sign-in, OAuth, token, credential, cookie, session, CSRF, SAML, or logout endpoints.
- Do not treat observed `/ajax-api/...` or Databricks UI GraphQL routes as production contracts.
- Do not copy full workspace URLs, workspace IDs, user IDs, endpoint IDs, statement signatures, cookies, or bearer values into repo docs.
- If a raw file includes sensitive-looking fields, summarize the shape and business meaning only.
- The feed can be used as evidence for UI parity, debugging, and acceptance tests; production integration should use official APIs.

## Current Feed State At This Pass

Root:

```text
D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed
```

Key live state observed during this documentation pass:

| Item | Observed state |
|---|---|
| Active continuous-capture process | `powershell` PID `12556` was still running and was not stopped. |
| Latest heartbeat file inspected | `CONTINUOUS-CAPTURE-HEARTBEAT.json` |
| Heartbeat iteration inspected | Iteration 21 at `2026-05-23T16:18:44+05:30` |
| Event log depth inspected | 22 completed iteration events were present in `continuous-capture-events.ndjson`; a later iteration folder was appearing while capture continued. |
| Iteration 21 counts | 327 raw network entries, 315 safe network entries, 12 credential/auth entries skipped, 106 API metadata entries, 30/30 new API bodies captured, 439 console messages. |
| Continuous event-log aggregate through 22 events | 12,974 raw network entries, 12,598 safe entries, 376 skipped credential/auth entries, 3,573 API metadata entries, 634 successful API body captures out of 636 attempts, 6,340 console messages. |
| Important caveat | Continuous counts are not unique-product counts; the same polling routes repeat across iterations. Treat them as capture volume and stability signal. |

## Feed Anatomy

| Artifact | Role | Pay attention to |
|---|---|---|
| `session-log.md` | Chronological capture journal. | Records the actual path from initial MCP validation, Databricks login block, debug-Chrome workaround, post-login capture, live capture, and continuous capture. |
| `capture-policy.md` | Written safety boundary. | Defines what can be captured and which sensitive endpoints must be skipped. This is the evidence hygiene contract. |
| `LATEST-CAPTURE-SUMMARY.md` | Summary of the latest non-continuous live capture. | Good quick check for raw/safe/skipped network counts and API body capture completeness. |
| `postlogin-*.json/png` | First signed-in state after human login. | Good for "what does the page initially expose?" questions. |
| `comprehensive-20260523-141643` | Broad one-shot capture with sanitized DOM, network, screenshot, trace, assets, safe bodies. | Best for page anatomy and broad resource inventory. |
| `live-capture-20260523-143054` | Focused live capture after the page had real Genie conversation content. | Best for Genie Space chat, schema, curated questions, generated SQL, query results, visualization, comments, and feedback affordances. |
| `continuous-capture-20260523-150913` | Heartbeated capture loop. | Best for stability, polling, repeated route families, page navigation changes, and adjacent product cells like ML Playground / Model Serving. |
| `chrome-debug-profile` | Dedicated Chrome profile used for remote-debug capture. | Do not mine manually unless browser-level investigation is required; this is not a repo artifact. |

## Capture Ladder

### 1. Validate Chrome DevTools MCP On A Public Page

The first successful MCP path targeted `https://developer.chrome.com/`. This proved that the local Chrome DevTools MCP CLI could:

- open a page;
- take an accessibility snapshot;
- list console messages;
- list network requests;
- collect performance trace data;
- produce render/performance insights such as LCP, CLS, TTFB, render blocking, network dependency tree, DOM size, third parties, and forced reflow.

Why this matters: it separated "MCP tooling works" from "Databricks login blocks automated browsers."

### 2. Attempt Databricks Directly

The initial Databricks Genie URL redirected to workspace login. Google OAuth rejected the isolated automation browser with a browser-security warning.

Decision: do not fight the login flow in automation. Use a visible debug Chrome where the user signs in normally.

### 3. Launch Dedicated Visible Debug Chrome

The working route was a visible Chrome instance with:

- remote debugging on `127.0.0.1:9222`;
- a dedicated profile under the artifact feed;
- user-driven sign-in inside that browser.

The session then attached Chrome DevTools MCP to that browser via browser URL. This avoided putting secrets into the agent channel while still allowing post-login capture.

### 4. Capture Post-Login State

After the human completed login, the first post-login capture collected:

- current page list;
- selected page snapshot;
- console messages;
- first network page;
- screenshot;
- short live trace.

The first post-login summary observed:

- page title/name: `Sample Superstore - Sales Performance - Genie Spaces`;
- 200 network requests in the initial page slice;
- 14 console messages;
- status mix mostly `200`, with one redirect and one pending request;
- asset-heavy traffic dominated by Databricks UI assets.

### 5. Capture Full Post-Login Network Pages

Network pagination was then completed for the initial post-login state. The combined post-login network snapshot contained:

- 422 total captured network requests;
- 419 `200` responses, one `300`, one `302`, one pending;
- 378 GET requests and 44 POST requests;
- API-like paths for Genie data rooms, conversations, messages, instructions, curated questions, comments, shares, value index, folders, user activity, tag assignments, and metastore assignment;
- auth/session paths visible as metadata only and treated as sensitive.

### 6. Write Capture Policy Before Broader Body Mining

The policy was explicitly documented before broad capture/body mining. It allowed:

- page list and selected URL;
- accessibility snapshot;
- screenshot;
- sanitized DOM and render tree details;
- console messages;
- safe network metadata;
- safe request/response bodies;
- CSS/JS/HTML asset inventories where safe;
- performance trace and insights.

It disallowed:

- credential fields and password values;
- cookies, authorization headers, bearer tokens, CSRF tokens, ID/access/refresh tokens;
- OAuth/sign-in/session endpoints and their bodies;
- secret-like DOM/script values.

### 7. Run Comprehensive Capture

The comprehensive pass wrote:

- sanitized DOM and render state;
- screenshot;
- performance entries;
- safe network metadata;
- skipped credential/auth metadata;
- safe body capture batches;
- API-focused captures.

Counts from the comprehensive pass:

- 435 safe network metadata entries;
- 12 skipped auth/credential metadata entries;
- 69 API calls matched;
- 69 API bodies captured;
- zero API body failures/skips in that API-focused pass.

### 8. Run Live Capture

The live capture wrote:

- page list;
- accessibility snapshot;
- console details;
- full network metadata;
- rendered viewport screenshot;
- page-state/render/performance JSON;
- trace;
- API call metadata;
- safe API request/response bodies.

Counts from the live capture:

- 487 raw network entries;
- 477 safe/non-auth entries;
- 10 auth/credential entries skipped;
- 42 console messages;
- 54 API calls matched;
- 53 API bodies captured;
- one API body failed/skipped.

### 9. Start Continuous Capture

The active continuous loop uses `continuous-capture.ps1` with these important parameters:

| Parameter | Observed value / behavior |
|---|---|
| `IntervalSeconds` | 30 seconds between loop checks. |
| `MaxApiBodiesPerIteration` | Up to 30 new API bodies per iteration. |
| `TraceEveryIterations` | Trace every third iteration. |
| `TraceSeconds` | 8 second trace windows. |
| Stop mechanism | Create `STOP-CAPTURE.flag` under the feed root. |
| Heartbeat | `CONTINUOUS-CAPTURE-HEARTBEAT.json` is overwritten each completed iteration. |
| Event log | `continuous-capture-events.ndjson` appends one summary per iteration. |
| Duplicate avoidance | `captured-api-request-ids.txt` tracks API request IDs already body-captured. |

Each iteration attempts:

1. MCP status capture.
2. Page list capture.
3. Console messages up to page size 1000.
4. Network requests up to page size 1000.
5. Accessibility snapshot.
6. Screenshot.
7. Sanitized browser-state script with visible elements, sanitized HTML, and performance entries.
8. Safe network partitioning.
9. API metadata filtering.
10. Body capture for new safe API requests.
11. Optional performance trace.
12. Iteration summary, heartbeat, and event-log append.

## Observed Product Surfaces

### Databricks Workspace Navigation

The live Genie accessibility snapshot exposed these workspace areas:

| Area | Observed entries |
|---|---|
| Top navigation | Navigation toggle, Databricks workspace brand, search, Genie Code, app switcher, profile menu. |
| General side navigation | Home, Learn, Workspace, Recents, Catalog, Jobs & Pipelines, Compute, Discover, Marketplace. |
| SQL side navigation | SQL Editor, Queries, Dashboards, Genie Spaces, Alerts, Query History, SQL Warehouses. |
| Data Engineering side navigation | Runs, Data Ingestion. |
| AI/ML side navigation | Playground, AI Gateway, Experiments, Features, Models, Serving. |

PulsePlay attention: Databricks already clusters the destination surface as SQL + AI/BI + AI/ML. PulsePlay should preserve this distinction instead of collapsing everything into one "Databricks" connector.

### Genie Space Chat Surface

Observed controls and signals:

- conversation title with rename affordance;
- `Reviewable` status;
- tabs/radios for Chat, Monitor, and Benchmark;
- New chat;
- Configure and Share controls;
- Data Room actions menu;
- edit-question affordance on user prompts;
- message-actions menu;
- answer status such as "Analysis complete";
- result table expansion/collapse;
- Download all rows up to 1GB;
- Show code;
- Response actions;
- Download as PNG;
- Edit visualization;
- editable widget title;
- yes/no usefulness feedback;
- Request Review;
- Share;
- follow-up question buttons;
- prompt input;
- disabled Agent/Chat answer-inspection radios;
- "Always review the accuracy of responses."

PulsePlay attention: the answer experience is a workflow, not a single text response. PulsePlay should model an answer as a bundle containing question, natural-language answer, generated SQL, result table, visualization, feedback state, review state, and follow-up prompts.

### Genie Space Metadata

Safe response bodies showed:

| Field family | Observed detail |
|---|---|
| Space display name | `Sample Superstore - Sales Performance` |
| Run-as mode | `VIEWER` |
| Warehouse | Warehouse reference present, but not copied into docs. |
| Table count | One table backing the space. |
| Suggestion status | `SUGGESTION_PROPOSED` |
| Suggestion description | Present and long enough to describe scope/capabilities; exact text is not copied here. |

PulsePlay attention: this is high-value setup evidence. It can seed a Surface + Assistant + Business Context setup model without relying on iframe scraping.

### Genie Schema Signal

The safe schema response exposed one table, `vw_genie_sales_performance`, with 19 columns:

| Column | Type |
|---|---|
| `order_id` | `string` |
| `row_id` | `bigint` |
| `order_date` | `date` |
| `order_year` | `int` |
| `order_month` | `string` |
| `region` | `string` |
| `state` | `string` |
| `city` | `string` |
| `segment` | `string` |
| `customer_name` | `string` |
| `category` | `string` |
| `sub_category` | `string` |
| `product_name` | `string` |
| `sales` | `decimal(37,17)` |
| `profit` | `decimal(37,17)` |
| `quantity` | `bigint` |
| `discount` | `decimal(22,2)` |
| `profit_margin` | `decimal(38,6)` |
| `is_returned` | `boolean` |

Every observed column carried a comment and a mask object. PulsePlay attention: comments, masks, and types are trust primitives. They should flow into generated starter prompts, confidence badges, and "what data am I using?" explainers.

### Curated And Exploration Questions

The safe curated-question responses exposed:

| Type | Observed question |
|---|---|
| Exploration | What is the distribution of sales by min, max, average, and median? |
| Exploration | What is the distribution of orders across customer segments? |
| Exploration | What is the monthly trend of total sales over time? |
| Sample question | What is return rate by category? |
| Sample question | Who are the top 10 customers by total sales? |
| Sample question | What are total sales, profit, and profit margin by region? |
| Sample question | Which sub-categories have the lowest profit margin? |
| Sample question | Show monthly sales trend by category. |

PulsePlay attention: curated questions should seed first-run UX before generic prompt suggestions. They are domain-aware and space-aware.

### Genie Message Envelope

Safe message responses showed a multi-attachment lifecycle:

| Message state | Observed attachment kinds |
|---|---|
| In progress | `progress_report`, `hamr_result`, multiple `query` attachments, `examples`, `final_summary`, `viz`, `text` |
| Completed | Same family plus additional final `text` attachment |

The completed observed message carried 10 attachments. Query attachments included:

- generated SQL;
- description of the analytical intent;
- cached schema signal;
- thinking/verification metadata;
- follow-up validation query for NULL category/region exclusions.

PulsePlay attention: do not flatten Genie responses into plain text. Normalize into an answer envelope with typed attachments.

Suggested PulsePlay envelope:

```ts
type DatabricksAnswerEnvelope = {
  question: string;
  status: "pending" | "running" | "completed" | "failed";
  naturalLanguage: string[];
  progressReports: unknown[];
  generatedQueries: Array<{
    sql: string;
    description?: string;
    cachedSchema?: unknown;
    verification?: unknown;
  }>;
  resultTables: Array<{
    columns: string[];
    rowCount?: number;
    truncated?: boolean;
    chunkCount?: number;
  }>;
  visualizations: Array<{
    chartLibrary?: string;
    type?: string;
    title?: string;
    spec?: unknown;
  }>;
  examples?: unknown[];
  feedback?: "yes" | "no" | "unset";
  reviewState?: "reviewable" | "requested" | "reviewed" | "unknown";
  followUpQuestions: string[];
};
```

### Query Results

Safe query-result responses showed:

| Query result | Columns | Row count | Chunk count | Truncated |
|---|---|---:|---:|---|
| Region aggregation | `region`, `total_sales`, `total_profit` | 4 | 1 | Not flagged as truncated |
| Category/region aggregation | `category`, `region`, `total_sales`, `total_profit` | 12 | 1 | Not flagged as truncated |

PulsePlay attention: the durable UX should support row count, table schema, chunks, export, and chart reuse. Do not depend on visible table text alone.

### Visualization Output

Observed visualization signal:

- heatmap type;
- chart-library metadata;
- status metadata;
- connection to the query message and query attachment;
- visible UI controls for PNG download, edit visualization, and widget title editing.

PulsePlay attention: visualization support should be tied to the answer envelope and not treated as an afterthought. The right local model is "query result + chart spec + editable presentation metadata."

### Model Serving / Agent Endpoint Surface

The continuous capture later selected the ML Playground page for `dwd-supervisor-agent`. Safe GraphQL responses repeatedly queried `GetInferenceEndpoint`.

Observed endpoint shape, with sensitive IDs omitted:

| Field | Observed value |
|---|---|
| Endpoint name | `dwd-supervisor-agent` |
| Task | `agent/v2/chat` |
| Ready state | `READY` |
| Config update state | `UPDATE_FAILED` |
| Suspend state | `NOT_SUSPENDED` |
| Served entities | 4 |
| Scale-to-zero | Enabled on all observed served entities |
| Traffic routes | Latest version observed at 100 percent, prior versions at 0 percent |

PulsePlay attention: Model Serving / agent endpoint health is adjacent to Genie but not the same integration cell. For PulsePlay, this belongs to the X-axis connector/agent health surface, not to the BI iframe adapter.

## Observed Safe Route Taxonomy

These routes are internal UI observations. They are useful for discovery and parity checks, not production integration.

### Genie Space / Data Room

| Sanitized route family | Observed purpose | PulsePlay posture |
|---|---|---|
| `/ajax-api/2.0/data-rooms/{space}` | Space metadata, run-as mode, warehouse reference, backing table identifiers, suggestion description/status. | Evidence only; use official Genie APIs and workspace/admin APIs where available. |
| `/ajax-api/2.0/data-rooms/{space}/schema` | Table/column schema, types, comments, masks. | Evidence only; prefer Unity Catalog and official Genie surfaces. |
| `/ajax-api/2.0/data-rooms/{space}/instructions` | Space instructions and accepted text/snippet metadata. | Evidence only; useful for setup UX parity. |
| `/ajax-api/2.0/data-rooms/{space}/curated-questions` | Exploration and sample questions. | Evidence only; use official management APIs when exposed. |
| `/ajax-api/2.0/data-rooms/{space}/column-configs` | Column configuration metadata. | Evidence only. |
| `/ajax-api/2.0/data-rooms/{space}/value-index` | Value-index support for semantic retrieval/filtering. | Evidence only; a strong signal for semantic setup. |
| `/ajax-api/2.0/data-rooms/{space}/comments` | Feedback/comment loop. | Evidence only; maps to PulsePlay feedback/review affordances. |
| `/ajax-api/2.0/data-rooms/{space}/check` | Space/check readiness. | Evidence only; maps to health/readiness UI. |

### Genie Conversations And Message Attachments

| Sanitized route family | Observed purpose | PulsePlay posture |
|---|---|---|
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}` | Conversation metadata and message collection. | Evidence only; official Genie Conversation API is the production path. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/messages` | Message creation / listing. | Evidence only; official message APIs are the production path. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/messages/{message}` | Message status, content, result, attachments, finality. | Evidence only; official message retrieval/polling should be used. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/messages/{message}/attachments/{attachment}/query-result` | Structured SQL result retrieval. | Official Genie query-result retrieval exists and should be used. |
| `/ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/shares/{share}` | Share state. | Evidence only; maps to PulsePlay share/review workflows. |

### Workspace / Account / UI GraphQL

| Route family | Observed purpose |
|---|---|
| `/graphql/ListUserPreferences` | User UI preferences. |
| `/graphql/WorkspaceLifecycleManagerGetAccount` | Workspace/account lifecycle context. |
| `/graphql/GetWorkspaceLabelV2Query` | Workspace label metadata. |
| `/graphql/GetSubscriptionQuery` | Subscription context. |
| `/graphql/GetSettingV2Query` | Workspace setting read. |
| `/graphql/GetDashboardWorkspaceThemeQuery` | Dashboard/workspace theme. |
| `/graphql/ExternalListCreditsQuery` | Credit/context data. |
| `/graphql/ConversationModelStatuses` | Conversation/model status. |
| `/graphql/CanCreateCluster` | Cluster creation eligibility. |
| `/graphql/GetThumbnailUrl` | Thumbnail metadata. |

### Model Serving / Agent / AI Gateway

| Route family | Observed purpose |
|---|---|
| `/graphql/GetInferenceEndpoint` | Model Serving endpoint health/config state. |
| `/ajax-api/2.0/serving-endpoints` | Serving endpoint listing. |
| `/ajax-api/2.0/serving-endpoints/{endpoint}/input-example` | Input example for serving endpoint. |
| `/ajax-api/ai-gateway/v2/endpoints` | AI Gateway endpoint listing. |
| `/ajax-api/2.0/rag-studio/chains` | RAG/chain metadata. |
| `/api/2.0/popproxy/health` | Proxy/dataplane health. |
| `/dataplane_domain_auth` | Dataplane domain auth redirect path; body is not a production target. |
| `/proxy-endpoints-domain-conn-test` | Endpoint domain connectivity check. |

## High-Volume Routes In Continuous Capture

Across the continuous run through 22 iteration events, the top repeated safe route families were:

| Sanitized family | Count | Meaning |
|---|---:|---|
| `POST /telemetry` | 861 | Product telemetry noise; do not model. |
| `GET /api/2.0/popproxy/health` | 476 | Repeated health polling. |
| `GET /ajax-api/2.0/data-rooms/{space}/comments` | 372 | Conversation/comment refresh loop. |
| `POST /graphql/GetInferenceEndpoint` | 361 | ML Playground polling endpoint state. |
| `GET /ajax-api/2.0/data-rooms/{space}/conversations/{conversation}/messages/{message}` | 360 | Genie message status polling. |
| `GET /ajax-api/2.0/data-rooms/{space}/.../query-result` | 189 | Result retrieval/recheck. |
| `GET /ajax-api/2.0/data-rooms/{space}/value-index` | 178 | Semantic/value-index support. |
| `GET /ajax-api/2.0/data-rooms/{space}/instructions` | 49 | Space instruction refresh. |
| `GET /ajax-api/2.0/data-rooms/{space}/column-configs` | 37 | Column config refresh. |
| `GET /ajax-api/2.0/data-rooms/{space}` | 34 | Space metadata refresh. |
| `GET /ajax-api/2.0/data-rooms/{space}/curated-questions` | 34 | Curated/sample question refresh. |

PulsePlay attention: the UI does a lot of polling. PulsePlay should not replicate internal polling routes. Instead, it should create its own stable polling contract around official APIs and expose a compact state model to the React app.

## Console And Performance Notes

Observed console themes:

- Databricks' own warning telling users not to paste content into the console.
- jQuery migrate logging.
- repeated preload warnings for Databricks UI assets.
- accessibility/form issues in console details from prior capture passes: missing associated labels, duplicate form-field IDs, missing `aria-labelledby` targets, Quirks Mode.

Observed performance/render details from the live capture:

- title: `Sample Superstore - Sales Performance - Genie Spaces`;
- viewport around `982x695` at device pixel ratio `1.25`;
- visible element count in the sanitized render state exceeded 1,000 elements;
- performance resources in that pass were dominated by `ui-assets.cloud.databricks.com` link and script assets;
- first post-login trace observed CLS around `0.09` and insights including CLS culprits and forced reflow.

PulsePlay attention: console/performance warnings from the Databricks-hosted app are not PulsePlay bugs, but they are useful when deciding iframe sizing, loading skeletons, and whether a PulsePlay smoke failure came from the host or guest.

## Official API Alignment

The capture proves the product behavior. Official docs define the production route.

| Need | Official path to prefer |
|---|---|
| Start, continue, and poll Genie conversations | Azure Databricks Genie Conversation API |
| Retrieve generated SQL result tables | Official Genie attachment query-result endpoint |
| Expose companion Genie for dashboards / external embedding | Official dashboard + Genie guidance, with external apps using the Conversation API |
| Understand Genie Space product model | Azure Databricks Genie Space docs |
| Connect coding/agent context through MCP | Databricks Genie Code MCP docs |
| Serve custom/foundation/agent models | Mosaic AI Model Serving docs |
| Understand AI/BI positioning | Azure Databricks AI/BI tools docs |

Practical integration rule:

```text
Observed UI route -> evidence, UX parity, acceptance test clue
Official API -> production contract
PulsePlay proxy -> security boundary and stable app contract
React playground -> display/use the normalized envelope only
```

## PulsePlay Implementation Attention Map

| Evidence | PulsePlay action |
|---|---|
| Genie metadata has display name, run-as mode, warehouse, backing table, suggestion description. | Add a setup/meta panel that shows Databricks space identity, run-as, table count, and confidence source. |
| Schema has comments, masks, and precise types. | Promote schema comments/masks into Business Context confidence, not just prompt decoration. |
| Curated questions exist. | Seed starter questions from Genie/space questions before generic local defaults. |
| Message lifecycle is attachment-rich. | Implement a typed Databricks answer envelope. |
| Query results are structured and chunked. | Render result tables from official query-result payloads, not from natural-language summaries. |
| Visualizations have chart metadata and UI affordances. | Preserve visualization as first-class output with title/edit/export affordances. |
| Feedback/review/share controls are built into Genie UI. | Map PulsePlay feedback and review state to Databricks answer provenance. |
| Monitor/Benchmark tabs exist. | Treat evaluation/monitoring as part of the Databricks-native product surface; defer until core chat envelope works. |
| Model Serving endpoint state is available. | Add connector health diagnostics for Databricks agent/model endpoints. |
| AI Gateway appears in navigation and API route families. | Keep AI Gateway as a future governance/traffic-control surface, not as a BI vendor adapter. |

## Next Capture Targets

Capture these deliberately, one target per named run, so the evidence remains reviewable:

| Priority | Target | Capture goal |
|---:|---|---|
| 1 | Genie Configure tab | Capture data-room instructions, accepted/rejected suggestions, table selection, warehouse binding, permission indicators. |
| 2 | Genie Monitor tab | Capture monitoring objects, review queues, benchmark links, quality indicators. |
| 3 | Genie Benchmark tab | Capture benchmark setup, evaluation dimensions, success/failure outputs. |
| 4 | AI/BI Dashboard with companion Genie | Confirm how dashboard context and Genie context connect, especially for external app posture. |
| 5 | SQL Warehouse connection details | Capture sanctioned client connection affordances for Power BI/Tableau/dbt/Python/JDBC/ODBC. |
| 6 | Model Serving endpoint detail page | Capture endpoint logs, build status, route traffic, scale-to-zero, serving error surfaces. |
| 7 | AI Gateway page | Capture endpoint/governance concepts, policies, usage, rate limiting, caching, safety controls if visible. |
| 8 | Databricks Apps list/detail | Capture app packaging/deployment signals relevant to PulsePlay-as-Databricks-destination. |

## Next Mining Procedure

1. Check `CONTINUOUS-CAPTURE-HEARTBEAT.json` and confirm the loop is alive.
2. Navigate the visible debug Chrome to exactly one target surface.
3. Wait for the target UI to settle.
4. Let at least one continuous iteration complete.
5. Record the iteration directory name and timestamp.
6. Mine `pages.json`, `accessibility-snapshot.json`, `network-safe-metadata.json`, `api-call-metadata.json`, `api-body-capture-index.json`, `console-all.json`, `page-state-render-performance.json`, and screenshot.
7. Sanitize paths by replacing IDs with `{space}`, `{conversation}`, `{message}`, `{attachment}`, `{share}`, `{endpoint}`.
8. Summarize route families and payload shapes, not raw IDs or secrets.
9. Cross-check product interpretation against official Azure Databricks docs.
10. Add findings to repo docs and mirror a sanitized summary back into the feed root.

## Stop Procedure

Only stop the continuous capture when the user asks or when the capture is no longer wanted.

Safe stop mechanism:

```powershell
New-Item -ItemType File -Path 'D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\STOP-CAPTURE.flag'
```

The loop is designed to remove `CONTINUOUS-CAPTURE.pid` when it exits. Do not kill the process unless the stop flag fails and the user approves.

## Source Ledger

Local artifacts:

- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\session-log.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\capture-policy.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\LATEST-CAPTURE-SUMMARY.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\postlogin-full-network-summary.md`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\live-capture-20260523-143054\*`
- `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed\continuous-capture-20260523-150913\*`

Official docs:

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
