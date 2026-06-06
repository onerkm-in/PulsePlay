# PulsePlay Codebase Audit — Brutal-Honest Technical Review

> ⚠️ **STALE (2026-06-06).** This audit is a point-in-time snapshot at HEAD `5e1036d` (2026-05-10) and several of its headline facts have since changed. Known drift: it claims "no playground tests exist" (now 1926, verified 2026-06-06), `server.js` "4,298 lines" (now 9,125), and "powerbi 4 stubs + 1 real" (Power BI is now a real `powerbi-client` SDK adapter). Use it for its **proxy-coupling analysis** (still Genie/Databricks-shaped), NOT for status/counts. For current status see CLAUDE.md "Status", [docs/HANDOVER.md](../HANDOVER.md), [docs/BLOCKERS.md](../BLOCKERS.md), and [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

**Audited:** 2026-05-10
**Scope:** every file under `D:\Working_Folder\Projects\PulsePlay` at HEAD (`5e1036d`).
**Method:** read-only inspection. Every claim cited with `file:line`. Unverified items marked `[UNVERIFIED]`.
**Scope-out:** runtime behaviour against a live Databricks workspace — only static analysis.

This audit is the working ground-truth reference. It is harsher than the existing review docs (`docs/PROJECT_REVIEW.md`, `docs/PULSEPLAY_CPG_REVIEW.md`, `docs/E2E_GAP_REVIEW_INITIAL.md`, `docs/FUNCTIONAL_COVERAGE_ASSESSMENT.md`, `docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md`, `docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md`, `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md`) because most of those overstate maturity in the abstract and do not link to code. This one does.

---

## 1. Repository directory map

Top-level layout from `Get-ChildItem D:\Working_Folder\Projects\PulsePlay`:

| Path | Purpose | State | Status |
|---|---|---|---|
| [README.md](../../README.md) | Front door. Calls the project "v0.1.0 — scaffold complete." Honest about stub state. | PulsePlay-native | Working |
| [CLAUDE.md](../../CLAUDE.md) | LLM collaboration guide. Admits the auto-memory state file is `.the sister project-session.state.json` carried over and "will be renamed to `.pulseplay-session.state.json` when you next touch the script." | PulsePlay-native, with inherited tooling | Stale (rename pending) |
| [.gitignore](../../.gitignore) | Both `.the sister project-session.state.json` AND `.pulseplay-session.state.json` are ignored. | PulsePlay-native | Working |
| `playground/` | Vite + React + TS frontend (the host). 7 source files total. | PulsePlay-native | Working scaffold; submit-only AI; vendor stubs |
| `bi-adapters/` | Y-axis: BI vendor adapters. 5 directories, one `index.ts` each. | PulsePlay-native (4 stubs + 1 real) | Only `generic-iframe` is real |
| `proxy/` | X-axis: AI connector backbone. Inherited verbatim from sister Pulse project cycles 1–47. **4,298-line server.js** + 8 lib modules + 12 test files. | Inherited (Pulse heritage) | Working but Pulse/Genie-shaped |
| `databricks-agents/` | Mosaic AI Supervisor Agent template. One `supervisor/` subdir with `agent.py`, `log_and_deploy.py`, `deploy.ipynb`, `requirements.txt`, `README.md`, `config.example.env`. | Inherited (Pulse heritage) | Untested in PulsePlay context; demo-domain |
| `scripts/` | LLM onboarding/wrapup, smoke helpers, deploy helper, accuracy battery, proxy auth helper. 13 files. | Inherited (mostly Pulse-shaped) | Mostly stale; some load-bearing |
| `docs/` | Mixed: 4 inherited PepPulse-titled docs, 7 PulsePlay-native docs, 8 newly-commissioned external-LLM reviews, 7 inherited ADRs that describe the Pulse PBI custom visual, 2 inherited research bibliographies. | Mixed — needs aggressive triage | Drift-heavy |
| `docs/research/` | Empty directory at audit start. This audit lives here. | New | Working |

Files NOT present that one might expect:
- No `databricks.yml` (referenced by [Deploy-DatabricksApp.ps1:15](../../scripts/Deploy-DatabricksApp.ps1#L15) — `databricks bundle validate --target dev`). The script will fail in default mode without this file.
- No `playground/index.html` content shown in source listing (the file exists at 351 bytes — minimal Vite shell). [UNVERIFIED — file exists per directory listing but contents not read in this audit]
- No tests under `playground/` — confirmed. [package.json:12](../../playground/package.json#L12) declares `"test": "vitest run"` but there are no `*.test.ts*` files.
- No CI/CD definitions (`.github/workflows/`, `azure-pipelines.yml`, etc.).
- No `LICENSE` file. [README.md:67](../../README.md#L67) says "internal/private until otherwise stated."
- No production `proxy/config.json` (correctly gitignored — see [.gitignore:13](../../.gitignore#L13)).

---

## 2. proxy/ deep dive

### 2.1 Overall posture

[`proxy/server.js`](../../proxy/server.js) is **4,298 lines** of monolithic Express code. Every backend, route, middleware, prompt, dispatch, audit, rate-limit, and SQL-generation policy lives in this one file. The lib/ subdirectory contains only the helpers that were extracted — orchestrator, validator, foundation-model client, bedrock signer, schema introspector, SQL executor, SQL preview, metric-rule heuristics. This is not a clean architecture; it's a journal. The package name is still [`unibridge-ai-proxy`](../../proxy/package.json#L2) and the description still says "for routing **Power BI** questions" ([proxy/package.json:4](../../proxy/package.json#L4)) — neither has been updated for PulsePlay.

### 2.2 Backends supported (six, all Genie-shaped)

| # | Backend | Profile `type` / detection | Code path | File:line |
|---|---|---|---|---|
| 1 | Databricks Genie (default) | profile has `spaceId`; type unset | `databricksRequest → /api/2.0/genie/spaces/...` | [server.js:1683-1711](../../proxy/server.js#L1683-L1711) start; [server.js:1714-1743](../../proxy/server.js#L1714-L1743) message; [server.js:1955-2033](../../proxy/server.js#L1955-L2033) poll |
| 2 | Azure OpenAI (chat-only) | `profile.azureOpenAiEndpoint` present | `azureOpenAiRequest()` | [server.js:2614-2637](../../proxy/server.js#L2614-L2637) |
| 3 | Azure OpenAI (analytics mode) | `profile.mode === 'analytics' && schemaContext OR (warehouseId + catalog)` | `runAnalyticsOrchestrator → orchestrateGroundedAnswer` | [server.js:2650-2679](../../proxy/server.js#L2650-L2679); [server.js:2698-2724](../../proxy/server.js#L2698-L2724) |
| 4 | AWS Bedrock RetrieveAndGenerate (KB-coupled) | `profile.bedrockKnowledgeBaseId` present | `bedrockRetrieveAndGenerate()` (inline copy) + `lib/bedrock.js` | [server.js:2805-2866](../../proxy/server.js#L2805-L2866); [bedrock.js:95-133](../../proxy/lib/bedrock.js#L95-L133) |
| 5 | AWS Bedrock InvokeModel (direct) | `profile.bedrockAccessKeyId && profile.bedrockSecretAccessKey` | `bedrockInvokeModel()` | [bedrock.js:154-214](../../proxy/lib/bedrock.js#L154-L214) |
| 6 | Foundation Model serving endpoint (Mosaic AI) | `profile.type === 'foundation-model'` + `foundationModelEndpoint` | `callFoundationModel()` | [foundationModelClient.js:125-155](../../proxy/lib/foundationModelClient.js#L125-L155); route at [server.js:3095-3167](../../proxy/server.js#L3095-L3167) |
| 7 | Supervisor (real Mosaic AI agent endpoint) | `profile.type === 'supervisor'` | inline `https.request` against `host + endpoint` | [server.js:4054-4078](../../proxy/server.js#L4054-L4078) |
| 8 | Supervisor-local (proxy-side fan-out) | `profile.type === 'supervisor-local'` | `runLocalSupervisor → askGenieProfile × N + synthesizeSupervisorAnswer` | [server.js:3509-3588](../../proxy/server.js#L3509-L3588); [server.js:3393-3495](../../proxy/server.js#L3393-L3495) |

That's **eight runtime paths**, not six. The README and `MULTI_BI_ARCHITECTURE.md` only list six.

#### Coupling to Genie/Databricks vocabulary

Even the "agnostic" backbone is heavily Genie-shaped. Examples:
- `resolveProfile()` reads `body.assistantProfile`, `query.assistantProfile`, and `header.x-genie-target-host`. The header name is "x-genie-target-host", not anything generic. [server.js:579-590](../../proxy/server.js#L579-L590).
- `errorStatusFromDatabricks()` exists as a top-level helper that every backend's catch block routes through. [server.js:948-980](../../proxy/server.js#L948-L980). Bedrock errors and OpenAI errors do NOT route through it — only Databricks-shaped ones. The naming is a tell.
- The shared-key middleware uses header `X-Genie-Key`. Not a neutral name. [server.js:1090](../../proxy/server.js#L1090).
- The CORS allowed-headers list contains `X-Genie-Target-Host`, `X-Genie-Key`, `X-Databricks-Host`, `X-Databricks-Token`, `X-Genie-Space-Id`, `X-Profile-Name` ([server.js:1076](../../proxy/server.js#L1076)) — five out of six are Databricks-vocabulary headers, only `X-Profile-Name` is generic.
- The CORS comment itself says "CORS — **Power BI Desktop WebView** requires permissive headers." [server.js:1061](../../proxy/server.js#L1061). That justification does not apply to PulsePlay; it's running in a real browser, not a PBI Desktop iframe.

**Bottom line:** the proxy was extracted from a Genie-routing project and the wires of that origin are still showing. Nothing is renamed. Every comment, every header, every error mapper, every audit message references Genie/Databricks/Power BI explicitly.

### 2.3 The orchestrator — `proxy/lib/llmOrchestrator.js`

[llmOrchestrator.js](../../proxy/lib/llmOrchestrator.js) is the closest thing the proxy has to a connector-agnostic abstraction. 584 lines. Two functions matter: `orchestrateGroundedAnswer` ([line 90](../../proxy/lib/llmOrchestrator.js#L90)) and `withRetryOnBadSql` ([line 316](../../proxy/lib/llmOrchestrator.js#L316)).

**Where it's agnostic:** the handler accepts `callLlm: (messages) => Promise<string>` as a parameter — provider-specific LLM gets injected by the caller. So OpenAI vs Bedrock vs Foundation Model all share this pipeline. See [server.js:2441-2456](../../proxy/server.js#L2441-L2456) for `_resolveCallLlmForProfile()` which wires the right call function.

**Where it's Genie-shaped:**
- Returns include `conversation_id`, `message_id`, `status: 'COMPLETED' | 'FAILED'`, `sqlQuery`, `queryResult` — the EXACT shape Genie returns ([line 238-255](../../proxy/lib/llmOrchestrator.js#L238-L255)). The orchestrator is mimicking Genie's contract so the visual / sidebar can read the same fields. Documented in the file header: "Wraps a chat-only LLM endpoint into a **Genie-equivalent** grounded answer."
- `databricksRequest` is required as a parameter ([line 95](../../proxy/lib/llmOrchestrator.js#L95)) — meaning even when the LLM is Bedrock or OpenAI, the SQL still runs against a Databricks SQL warehouse. There is no abstraction for "execute SQL against Snowflake / BigQuery / Postgres / Spark Connect." It's lakehouse-shaped.
- The narrative-pass system prompt at [line 32-39](../../proxy/lib/llmOrchestrator.js#L32-L39) is generic, but the SQL system prompt at [line 22-30](../../proxy/lib/llmOrchestrator.js#L22-L30) hard-codes "for a **Databricks SQL** warehouse."

**Module exports** (from `module.exports` at [line 566-584](../../proxy/lib/llmOrchestrator.js#L566)):
- `orchestrateGroundedAnswer`
- `extractSqlFromResponse`
- `buildNarrativePrompt`
- `renderRowsAsMarkdown`
- `SQL_SYSTEM_PROMPT`
- `NARRATIVE_SYSTEM_PROMPT`
- `withRetryOnBadSql`
- `isSyntacticSqlError`
- `__retry_internals` (test seam)
- `suggestMetricRules` (Wave 41 metric-rule LLM-or-heuristic blend)
- `buildMetricRulePrompt`
- `parseSuggestedMetricRules`
- `coerceMetricRule`
- `extractDirectionHintsFromText`
- `METRIC_RULE_SYSTEM_PROMPT`

**Retry framework** ([line 268-339](../../proxy/lib/llmOrchestrator.js#L268-L339)): a single retry on syntactic SQL failures, recognised via two regex banks `SYNTACTIC_ERROR_PATTERNS` (UNRESOLVED_COLUMN, COLUMN_NOT_FOUND, AnalysisException, etc.) and `NON_RETRYABLE_PATTERNS` (UNAUTHORIZED, FORBIDDEN, 401/403). Auth failures dominate (won't be retried). Single-shot only — no exponential backoff. Failure mode: returns the second attempt's failure unchanged.

**Validator framework integration:** opt-in via `process.env.ORCHESTRATOR_VALIDATE_RETRIES` ([line 182](../../proxy/lib/llmOrchestrator.js#L182)), default 0 = off. When enabled, runs `insightsValidator.validateCompositeResponse()` ([line 187](../../proxy/lib/llmOrchestrator.js#L187)), if it fails calls `buildRetryPrompt()`, calls the LLM again, picks the better attempt by `failureCount`. Diagnostics surfaced via `validationDiagnostics` field on the response.

**Metric-rule suggest pipeline** ([line 513-563](../../proxy/lib/llmOrchestrator.js#L513-L563)): LLM-first (when `callLlm` is configured) with deterministic heuristic fallback from `metricRuleHeuristics.js`. If LLM returns < 3 rules, mix with heuristic top-up.

### 2.4 The validator framework — `proxy/lib/insightsValidator.js`

[insightsValidator.js](../../proxy/lib/insightsValidator.js) is the JS mirror of `genieChatVisual/src/insightsStageValidator.ts` (the Pulse PBI visual file — note the inherited reference at [line 4](../../proxy/lib/insightsValidator.js#L4)). 364 lines. Pure functions, shape-only.

**Validates these section titles** (`UNIVERSAL_VALIDATED_TITLES` at [line 270-279](../../proxy/lib/insightsValidator.js#L270-L279)):
- RECOMMENDED ACTIONS — must be numbered 1–3, must start with imperative verb, must cite numeric impact ([line 103-159](../../proxy/lib/insightsValidator.js#L103-L159))
- RISKS — must be ≥ 2 bullet/numbered items, must cite numeric magnitude ([line 161-184](../../proxy/lib/insightsValidator.js#L161-L184))
- TRENDS — must cite ≥ 2 numeric tokens ([line 186-203](../../proxy/lib/insightsValidator.js#L186-L203))
- KPI SNAPSHOT — must be a pipe table OR have ≥ 3 metric values ([line 205-217](../../proxy/lib/insightsValidator.js#L205-L217))
- HEADLINE — must be a paragraph (NOT a numbered list) ([line 219-229](../../proxy/lib/insightsValidator.js#L219-L229))
- OPPORTUNITIES — must be a list with ≥ 2 items ([line 231-242](../../proxy/lib/insightsValidator.js#L231-L242))
- DRIVERS — must be ≥ 2 list items, ≥ 50% must cite a metric ([line 244-268](../../proxy/lib/insightsValidator.js#L244-L268))
- HEADLINE + KPI SNAPSHOT — composite validation ([line 291-294](../../proxy/lib/insightsValidator.js#L291-L294))

**Integration with the orchestrator:** `validateCompositeResponse()` ([line 331-352](../../proxy/lib/insightsValidator.js#L331-L352)) splits a markdown response by `^#{1,3}\s+` headings, validates each section, returns aggregated diagnostics.

**Heritage gap:** the section titles are **Pulse's "AI Insights pipeline" sections**, not generic LLM output validation. RECOMMENDED ACTIONS / RISKS / TRENDS / OPPORTUNITIES / KPI SNAPSHOT / HEADLINE / DRIVERS — these are the same 7 sections that the Pulse Power BI visual renders as cards. They are NOT a connector-agnostic concept. A multi-BI playground that wants to validate a Tableau-related response against this validator would not benefit unless the prompt explicitly asks for a "RECOMMENDED ACTIONS" section.

### 2.5 Foundation Model client — `proxy/lib/foundationModelClient.js`

[foundationModelClient.js](../../proxy/lib/foundationModelClient.js) — 308 lines. Wraps a Databricks Mosaic AI Model Serving endpoint. OpenAI-compatible chat-completions schema.

**Public interface** ([line 125](../../proxy/lib/foundationModelClient.js#L125)):
```
callFoundationModel(databricksRequestFn, profile, options) → { content, raw, parsedJson? }
```

**Streaming story:** there is none. The client posts and waits for the full response. `databricksRequestFn` is the normal blocking helper. There is no `stream: true` path here, and the route handler at [server.js:3095](../../proxy/server.js#L3095) does not stream the response either.

**Structured-output presets** ([line 162-250](../../proxy/lib/foundationModelClient.js#L162-L250)): `RESPONSE_SCHEMAS` for `recommendedActions`, `risks`, `opportunities`. Each is a JSON-schema spec the foundation model can use for structured output. Markdown renderers at [line 256-293](../../proxy/lib/foundationModelClient.js#L256-L293) convert the JSON back to the same `## RECOMMENDED ACTIONS` / `## RISKS` / `## OPPORTUNITIES` markdown shape Pulse's renderer expects. Again — Pulse-shaped.

**How it's called:** [server.js:3043-3047](../../proxy/server.js#L3043-L3047) imports `callFoundationModel`, `RESPONSE_SCHEMAS`, `SECTION_RENDERERS`. Route at [server.js:3095-3167](../../proxy/server.js#L3095-L3167) — `POST /foundation/section` accepts `{ profile, userPrompt, sectionTitle, systemPrompt, responseFormat, useStructuredOutput, temperature, maxTokens, extra }`. Returns `{ content, rawContent, parsedJson, endpoint, profile, structured }`.

### 2.6 Bedrock client — `proxy/lib/bedrock.js`

[bedrock.js](../../proxy/lib/bedrock.js) — 222 lines. Two entry points:
1. `bedrockRetrieveAndGenerate(profile, input, sessionId, fetchImpl)` — KB-coupled "RAG" path. Hits `bedrock-agent-runtime.{region}.amazonaws.com/retrieveAndGenerate`. [line 95-133](../../proxy/lib/bedrock.js#L95-L133).
2. `bedrockInvokeModel(profile, messages, opts)` — direct InvokeModel. Hits `bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke`. Anthropic Messages payload contract. [line 154-214](../../proxy/lib/bedrock.js#L154-L214).

**SigV4 implementation:** zero third-party SDK. Native `crypto.createHmac('sha256')` + `crypto.createHash('sha256')` from Node stdlib. `signAwsRequest()` at [line 62-91](../../proxy/lib/bedrock.js#L62-L91) is the single signing primitive both paths share. This keeps the dependency footprint at zero (express only) — see [proxy/package.json:11-13](../../proxy/package.json#L11-L13).

**Concerning detail:** `server.js` still has its OWN copy of the SigV4 signing inlined at [server.js:2805-2866](../../proxy/server.js#L2805-L2866) for the RetrieveAndGenerate path, which is NOT routed through `lib/bedrock.js`. The lib version is only called from `bedrockInvokeModelCall` at [server.js:2884-2887](../../proxy/server.js#L2884-L2887). So there are **two SigV4 signers in this codebase** — one in [server.js:2828-2843](../../proxy/server.js#L2828-L2843) and one in [bedrock.js:62-91](../../proxy/lib/bedrock.js#L62-L91). They look semantically equivalent but a bug fix in one will not propagate to the other. The header comment in `lib/bedrock.js` claims the inline copy is "kept inline for compatibility during the cut-over" ([bedrock.js:23-26](../../proxy/lib/bedrock.js#L23-L26)) — the cut-over has not happened.

### 2.7 Schema introspector — `proxy/lib/schemaIntrospector.js`

[schemaIntrospector.js](../../proxy/lib/schemaIntrospector.js) — 179 lines. Auto-derives a `schemaContext` from `INFORMATION_SCHEMA.COLUMNS` for OpenAI/Bedrock-direct profiles that didn't supply one explicitly.

- Cache: in-process `Map`, keyed by `(host, catalog, schema)`. 6-hour TTL ([line 31](../../proxy/lib/schemaIntrospector.js#L31)). LRU cap at 50 entries ([line 32](../../proxy/lib/schemaIntrospector.js#L32)).
- Single SQL query against `INFORMATION_SCHEMA.COLUMNS` — backtick-quoted catalog/schema with control chars stripped to defeat SQL injection through profile config ([line 116-129](../../proxy/lib/schemaIntrospector.js#L116-L129)).
- Output shape: `{ tables: [{ name, columns: [{ name, type, nullable }] }] }`.
- `formatSchemaForPrompt(schemaObj, maxChars=8000)` renders to a compact text block ([line 156-170](../../proxy/lib/schemaIntrospector.js#L156-L170)).

**Lakehouse-bound:** assumes a Databricks SQL warehouse + `INFORMATION_SCHEMA`. Won't work against arbitrary backends.

### 2.8 SQL safety — `sqlExecutor.js` and `sqlSectionPreview.js`

[sqlExecutor.js](../../proxy/lib/sqlExecutor.js) — 133 lines. Submits a SQL statement via `/api/2.0/sql/statements` ([line 17](../../proxy/lib/sqlExecutor.js#L17)), polls until SUCCEEDED/FAILED/CANCELED/CLOSED. 90-second total deadline ([line 19](../../proxy/lib/sqlExecutor.js#L19)). 10K row cap ([line 20](../../proxy/lib/sqlExecutor.js#L20)).

**The DML blocklist** at [sqlExecutor.js:108-123](../../proxy/lib/sqlExecutor.js#L108-L123) is a single regex:

```
INSERT\s+INTO | UPDATE\s+[ident]+\s+SET | DELETE\s+FROM
| DROP\s+(TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|IF)
| CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER)
| ALTER\s+(TABLE|VIEW|INDEX|DATABASE|SCHEMA)
| TRUNCATE\s+(?:TABLE\s+)?[ident]
| MERGE\s+INTO | REPLACE\s+INTO | GRANT\s+\w+ | REVOKE\s+\w+
```

`isSelectOnly(sql)` returns `!DML_RE.test(sql)`. That's the entire enforcement layer. **Risks of regex-only defence:**
- Comment-trick bypasses (`/* DROP TABLE x */`) — the regex would test inside the comment and reject. So this passes the obvious test.
- Unicode-confusable bypasses (Cyrillic `с` for Latin `c` in `DELETE`) — DML_RE uses literal ASCII tokens; a confusable could slip through.
- Multi-statement-joined-by-CTE constructs — the validator at [sqlSectionPreview.js:53-57](../../proxy/lib/sqlSectionPreview.js#L53-L57) tries to enforce single-statement, but only checks for `;` after trim. A `WITH cte AS (DELETE …)` would be rejected by DML_RE; a `SELECT … FROM table_function('DELETE …')` would not.

The right answer for production would be a parsed AST check, not regex. The proxy's own [CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md:71](../CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md#L71) admits "regex SQL filtering is not a governance boundary."

[sqlSectionPreview.js](../../proxy/lib/sqlSectionPreview.js) — 220 lines. Adds a layer on top of `sqlExecutor`:
- Sanitises the SQL body: strip control chars, length cap 8000 chars ([line 35-44](../../proxy/lib/sqlSectionPreview.js#L35-L44)).
- Defence in depth: redundant DML keyword block at [line 48](../../proxy/lib/sqlSectionPreview.js#L48) (`FORBIDDEN_KEYWORDS`).
- Single-statement check at [line 53-57](../../proxy/lib/sqlSectionPreview.js#L53-L57) — `trimmed.replace(/;+\s*$/, '').includes(';')`.
- Parenthesis balance check at [line 121-130](../../proxy/lib/sqlSectionPreview.js#L121-L130).
- Composes Section H CTE preamble + section body via `composeSqlWithSectionH()` ([line 70-81](../../proxy/lib/sqlSectionPreview.js#L70-L81)).
- Token redaction on errors at [line 89-94](../../proxy/lib/sqlSectionPreview.js#L89-L94) — strips `dapi…`, `Bearer …`, `authorization: …`.

**The Section H CTE preamble** is a Pulse-specific concept (the "Sections" of an AI Insights run are letter-coded; H is the "data scope" CTE). It does not generalise to PulsePlay's connector-agnostic story.

### 2.9 The multi-Genie island — supervisor-local fan-out

The "supervisor-local" engine. Documented by the parent agent at `proxy/server.js:3498-3650`. Verifying:

**`runLocalSupervisor(supervisorProfile, content, onEvent)` at [server.js:3509-3588](../../proxy/server.js#L3509-L3588).** Parameters:
- `supervisorProfile` — the `type: "supervisor-local"` profile object.
- `content` — full pre-prefixed user prompt (governance prefix from the visual already attached — see header comment at [server.js:3501-3508](../../proxy/server.js#L3501-L3508)).
- `onEvent` — optional callback used by the streaming variant; called with `{type, helpers/helper, ok, status, elapsedMs}` events.

**Helper-space discovery** at [server.js:3513-3524](../../proxy/server.js#L3513-L3524): if `supervisorProfile.spaces` is set, use it; otherwise call `defaultSupervisorSpaces(cfg().profiles)` which returns every non-supervisor profile name.

**Helper metadata resolution** at [server.js:3534-3541](../../proxy/server.js#L3534-L3541): for each helper space, build `{ name, displayName, dataDomain }` from the profile registry. This is what the visual surfaces as the "helper chip" labels — never the raw profile key, because the visual carries a `BUG-013 generic` taboo against leaking internal identifiers.

**Stagger** at [server.js:3556](../../proxy/server.js#L3556): `STAGGER_MS = supervisorProfile.staggerMs ?? 2000` — note this is **2000ms**, not 800ms. ADR-0003 ([0003-supervisor-stagger-800ms.md](../adr/0003-supervisor-stagger-800ms.md)) says the value is 800ms. The ADR is **stale**. The history per the inline comment at [server.js:3550-3555](../../proxy/server.js#L3550-L3555): "350ms (single-call fine, iterative load broke) → 800ms (still tripped 429s in live testing on consecutive supervisor calls — the rolling 60s window catches start-conversation + poll bursts from the *previous* call still in flight) → 2000ms." The ADR was not updated when the value was tripled.

**Fan-out** at [server.js:3558-3577](../../proxy/server.js#L3558-L3577): each helper is wrapped in a `Promise(setTimeout)` keyed by `i * STAGGER_MS`, then chains into `askGenieProfile(space, content)`. `Promise.allSettled` collects results.

**`askGenieProfile(profileName, question)` at [server.js:3209-3255](../../proxy/server.js#L3209-L3255)** — opens a fresh Genie conversation per helper, polls every 3000ms (160s deadline), returns `{ profileName, ok, status, conversationId, messageId, answer }`.

**Synthesis** at [server.js:3393-3495](../../proxy/server.js#L3393-L3495), `synthesizeSupervisorAnswer()`. Calls `databricks-meta-llama-3.1-405b-instruct` (default) or `supervisorProfile.synthesisEndpoint` ([line 3400](../../proxy/server.js#L3400)). Builds a prompt with:
- Schema context for each source (from the LEGACY_DEMO_SCHEMAS map at [server.js:3263-3302](../../proxy/server.js#L3263-L3302) — see "Genie-vocabulary leakage" below)
- Source blocks wrapped in fenced code blocks with helper-injection neutralisation (`[MANDATORY]` → `[helper-flagged]`, `[Context]` → `[helper-context]`, ``` → `` `​`` `` — Wave 22 cycle 5c hardening at [server.js:3413-3416](../../proxy/server.js#L3413-L3416))
- An eight-rule synthesis system prompt ([server.js:3442-3460](../../proxy/server.js#L3442-L3460)). Rule 8 explicitly says "Never refer to internal mechanisms ('Genie space', 'profile', 'agent endpoint') in the answer." That this rule has to exist tells you the model still does it sometimes — confirmed by the comment at [server.js:3380-3383](../../proxy/server.js#L3380-L3383): "the smoke battery showed the LLM occasionally still emits 'Genie space' / 'space_id' despite explicit prompt instructions."
- Output is run through `scrubInternalJargon(text)` at [server.js:3384-3391](../../proxy/server.js#L3384-L3391) — belt-and-braces regex replacement of "Genie space" → "data source", "space id" → "source id", etc. **This is necessary every call** because the prompt isn't enough.

**Streaming variant** — `POST /supervisor/conversations/start-stream` at [server.js:3827-4002](../../proxy/server.js#L3827-L4002). NDJSON output. Same `runLocalSupervisor` engine but `onEvent` writes each event as a JSON-line via `writeEvent()` at [server.js:3856-3863](../../proxy/server.js#L3856-L3863). 290-second wall-clock deadline ([server.js:3854](../../proxy/server.js#L3854)). For real-supervisor (`type: 'supervisor'`) profiles, the streaming variant **fakes** the events — it emits `fanout.start` + `helper.start` + `helper.done` + `synthesis.start` + `synthesis.done` synthetically because the agent is opaque ([server.js:3895-3909](../../proxy/server.js#L3895-L3909)).

**Limitations of supervisor-local:**
1. Fans out to EVERY configured helper space, blindly. No routing. Documented as a trade-off in [supervisor/README.md:13-19](../../databricks-agents/supervisor/README.md#L13-L19) — "Always calls every spaces[]" vs the real Mosaic supervisor's "Agent picks which spaces per question."
2. Genie-bound. Cannot fan out to a Tableau view, a Snowflake table, or any non-Genie source.
3. Cost grows linearly. 4 helpers × 1 Genie call each + 1 synthesis call = 5 LLM-equivalent costs per question.
4. The synthesis endpoint is hard-coded to `databricks-meta-llama-3.1-405b-instruct` in env config ([server.js:123](../../proxy/server.js#L123)) and config example ([config.example.json:71](../../proxy/config.example.json#L71)). If a deployment doesn't have CAN_USE on that endpoint, supervisor-local fails on the synthesis step — falling back to a structured raw-results dump at [server.js:3486-3494](../../proxy/server.js#L3486-L3494).
5. The history of the stagger value (350 → 800 → 2000ms) suggests this engine has been chasing rate-limit symptoms, not solving them at the design level.

### 2.10 Server-side dispatch — every route prefix

Confirmed by grepping all `app.(get|post|put|delete|use)`:

| Route prefix | Mounts | Auth | Backends dispatching through it |
|---|---|---|---|
| `GET /health` | [server.js:1280](../../proxy/server.js#L1280) | none | n/a — meta |
| `GET /admin/health-summary` | [server.js:1304](../../proxy/server.js#L1304) | sharedKey (constant-time, [server.js:1314-1322](../../proxy/server.js#L1314-L1322)) + rate-limit | n/a — meta |
| `GET /admin/query-history` | [server.js:1355](../../proxy/server.js#L1355) | sharedKey + rate-limit | Databricks SQL History API |
| `POST /assistant/validate` | [server.js:1459](../../proxy/server.js#L1459) | rate-limit + sharedKey | none — pure shape check |
| `POST /assistant/validate-composite` | [server.js:1484](../../proxy/server.js#L1484) | rate-limit + sharedKey | none |
| `GET /assistant/capabilities` | [server.js:1502](../../proxy/server.js#L1502) | rate-limit + sharedKey | profile-resolution only |
| `GET /assistant/profiles` | [server.js:1516](../../proxy/server.js#L1516) | rate-limit + sharedKey | profile-resolution only — returns masked spaceId |
| `POST /assistant/home` | [server.js:1553](../../proxy/server.js#L1553) | rate-limit + sharedKey | none — returns curated `suggestedActions` |
| `GET /assistant/space-fetch` | [server.js:1620](../../proxy/server.js#L1620) | rate-limit + sharedKey | Genie passthrough (read serialized_space) |
| `POST /assistant/space-update` | [server.js:1646](../../proxy/server.js#L1646) | rate-limit + sharedKey | Genie passthrough (write serialized_space) |
| `POST /assistant/conversations/start` | [server.js:1683](../../proxy/server.js#L1683) | rate-limit + sharedKey | Genie only |
| `POST /assistant/conversations/:cid/messages` | [server.js:1714](../../proxy/server.js#L1714) | rate-limit + sharedKey | Genie only |
| `GET /assistant/conversations/:cid/messages/:mid` | [server.js:1955](../../proxy/server.js#L1955) | rate-limit + sharedKey | Genie poll + enrichQueryResults + opt-in validator retry |
| `GET /warehouse/status` | [server.js:1582](../../proxy/server.js#L1582) | rate-limit + sharedKey | Databricks SQL Warehouses API |
| `POST /warehouse/start` | [server.js:1598](../../proxy/server.js#L1598) | rate-limit + sharedKey | Databricks SQL Warehouses API + cooldown |
| `POST /feedback` | [server.js:2079](../../proxy/server.js#L2079) | rate-limit + sharedKey | local file append + redaction |
| `POST /history` | [server.js:2163](../../proxy/server.js#L2163) | rate-limit + sharedKey | Databricks SQL Statement Execution API (INSERT INTO chat_history table) |
| `GET /history` | [server.js:2232](../../proxy/server.js#L2232) | rate-limit + sharedKey | Databricks SQL Statement Execution API (SELECT) |
| `POST /sql/explain` | [server.js:2323](../../proxy/server.js#L2323) | rate-limit + sharedKey | none — validation only |
| `POST /sql/preview` | [server.js:2342](../../proxy/server.js#L2342) | rate-limit + sharedKey | Databricks SQL Statement Execution API |
| `POST /insights/suggest-metric-rules` | [server.js:2495](../../proxy/server.js#L2495) | rate-limit + sharedKey | LLM (OpenAI / Bedrock-direct) + heuristic fallback |
| `GET /openai/health` | [server.js:2639](../../proxy/server.js#L2639) | rate-limit + sharedKey | n/a — meta |
| `POST /openai/conversations/start` | [server.js:2681](../../proxy/server.js#L2681) | rate-limit + sharedKey | Azure OpenAI (chat-only OR analytics-orchestrator) |
| `POST /openai/conversations/:cid/messages` | [server.js:2749](../../proxy/server.js#L2749) | rate-limit + sharedKey | Azure OpenAI (chat-only) |
| `GET /bedrock/health` | [server.js:2868](../../proxy/server.js#L2868) | rate-limit + sharedKey | n/a |
| `POST /bedrock/conversations/start` | [server.js:2889](../../proxy/server.js#L2889) | rate-limit + sharedKey | Bedrock RetrieveAndGenerate OR InvokeModel (analytics or chat) |
| `POST /bedrock/conversations/:cid/messages` | [server.js:2953](../../proxy/server.js#L2953) | rate-limit + sharedKey | Bedrock RetrieveAndGenerate OR InvokeModel |
| `GET /foundation/health` | [server.js:3082](../../proxy/server.js#L3082) | rate-limit + sharedKey | n/a |
| `POST /foundation/section` | [server.js:3095](../../proxy/server.js#L3095) | rate-limit + sharedKey | Mosaic AI Model Serving (foundation model) |
| `POST /confidence` | [server.js:3715](../../proxy/server.js#L3715) | rate-limit + sharedKey | Genie (Phase 2 follow-up turn for business-language reasons) |
| `GET /supervisor/health` | [server.js:3797](../../proxy/server.js#L3797) | rate-limit + sharedKey | n/a |
| `POST /supervisor/conversations/start-stream` | [server.js:3827](../../proxy/server.js#L3827) | rate-limit + sharedKey | supervisor-local OR real-supervisor (NDJSON) |
| `POST /supervisor/conversations/start` | [server.js:4005](../../proxy/server.js#L4005) | rate-limit + sharedKey | supervisor-local OR real-supervisor |
| `POST /supervisor/conversations/:cid/messages` | [server.js:4148](../../proxy/server.js#L4148) | rate-limit + sharedKey | re-dispatches to /start synthetically |
| `GET /supervisor/conversations/:cid/messages/:mid` | [server.js:4167](../../proxy/server.js#L4167) | rate-limit + sharedKey | returns hard-coded COMPLETED stub |

**That last endpoint** — [server.js:4167-4178](../../proxy/server.js#L4167-L4178) — is a polling-compatibility lie. It always returns `status: 'COMPLETED'` with the literal string `"(Supervisor answer was returned synchronously on conversation start.)"`. Which means a client that polls a supervisor message after `/start` gets a stub, not the actual answer. The actual answer was delivered synchronously in the `/start` response. This is fragile contract design — it assumes every client knows to read the `content` from `/start` and never needs to re-fetch.

**Total routes:** ~30 distinct handlers, plus 12 `app.use()` middleware mounts.

### 2.11 Auth model

**Layered like onion skins, all opt-in:**

1. **Shared key** (header `X-Genie-Key`) — middleware at [server.js:1087-1104](../../proxy/server.js#L1087-L1104). Constant-time compare via `crypto.timingSafeEqual` at [server.js:1098](../../proxy/server.js#L1098). When the config has no `sharedKey`, the middleware is a no-op — `if (!required || !String(required).trim()) return next();` at [server.js:1089](../../proxy/server.js#L1089). The default deploy is **anonymous**.
2. **OAuth M2M for upstream Databricks** — `resolveDatabricksOAuthToken` at [server.js:637-696](../../proxy/server.js#L637-L696). client_credentials grant against `/oidc/v1/token`. Single-flight via shared promise ([server.js:656-658](../../proxy/server.js#L656-L658)). Cache keyed by `host|clientId` ([server.js:647](../../proxy/server.js#L647)). LRU cap 1000 ([server.js:617](../../proxy/server.js#L617)). 5-minute early-refresh window ([server.js:614](../../proxy/server.js#L614)). 10-second timeout on the token endpoint ([server.js:673](../../proxy/server.js#L673)).
3. **Inline-credentials gate** (Wave 31 + Wave 36) — accepts headers `X-Databricks-Host`, `X-Databricks-Token`, `X-Genie-Space-Id`, `X-Profile-Name` to override server-side profiles. Three modes: `off`, `fallback`, `override` ([server.js:476-485](../../proxy/server.js#L476-L485)). Auto-defaults to `off` when `PROXY_SHARED_KEY` or `WEBSITE_SITE_NAME` is set, else `override` (= Wave 31 behaviour preserved for local dev). The Wave 36 inversion was security-driven — Wave 31 originally let any visual paste credentials and override the proxy's config, which was a deployment footgun for shared/production deploys.
4. **Per-profile opt-out** — `profile.acceptInlineOverride === false` blocks inline override even when global mode is `override` ([server.js:512-517](../../proxy/server.js#L512-L517)).
5. **No upstream auth in playground** — [playground/src/components/AISidebar.tsx:61-71](../../playground/src/components/AISidebar.tsx#L61-L71) makes a plain `fetch('/api/assistant/conversations/start', ...)`. No Authorization header, no X-Genie-Key, no SSO, no JWT. The Vite dev server proxies that to the local Express proxy without adding any auth ([playground/vite.config.ts:14-19](../../playground/vite.config.ts#L14-L19)).

**Service-Principal hashing** (Tier B Day 3) — `hashServicePrincipalId(clientId)` at [server.js:729-738](../../proxy/server.js#L729-L738). SHA-256, truncated to 12 hex chars, prefixed `sp:`. Stamped on audit lines via `spHashForProfile()` at [server.js:749-753](../../proxy/server.js#L749-L753). Lets analysts group activity by SP without persisting raw clientId. Honest acknowledgment of "log forensics matters."

### 2.12 Audit + redaction

**Audit log shape** — `auditLog(req, args)` at [server.js:1228-1277](../../proxy/server.js#L1228-L1277). Lines emitted to `console.log('[audit]', JSON.stringify(line))`. Schema:
```
{ ts, ip, ua, requestId, action, route, profile, spaceId, status, detail,
  spIdentityHash?, inlineCredsUsed?, inlineCredsMode?, inlineCredsFields? }
```

Only `console.log` — no SIEM-export, no append-only file, no event lineage to a data lake. As [CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md:96](../CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md#L96) admits, "Audit is engineering telemetry, not compliance evidence."

**Token redaction passes** — three redactions at the proxy layer:
1. `_databricksRequestOnce` response parser at [server.js:879-882](../../proxy/server.js#L879-L882) — strips `dapi[A-Fa-f0-9]{8,}` → `dapi[redacted]`, `Bearer …` → `Bearer [redacted]`, and `[Aa]uthorization=…` → `…[redacted]`.
2. `errorStatusFromDatabricks` at [server.js:972-975](../../proxy/server.js#L972-L975) — column / table / schema / view / database identifier redaction — replaces `column 'CUSTOMER_AGE' not found` with `column [redacted] not found`. Wave 28 info-disclosure defence.
3. Feedback redaction at [server.js:2046-2060](../../proxy/server.js#L2046-L2060) — strips tokens, emails (`EMAIL_REDACT_RE`), phones (`PHONE_REDACT_RE`).
4. Same regex redaction inside `lib/sqlSectionPreview.js:89-94`.

**`X-Request-Id` correlation** — middleware at [server.js:1162-1172](../../proxy/server.js#L1162-L1172). Reads inbound, sanitises to `[A-Za-z0-9._-]` and 80 chars max, mints `srv-{ts}-{rand}` if missing, echoes back via response header. Propagated to Databricks downstream via [server.js:861](../../proxy/server.js#L861).

**`recentErrors` ring buffer** — `_auditCounters.recentErrors` at [server.js:1208-1209](../../proxy/server.js#L1208-L1209). Capped at 25 entries, sliding window. Surfaced via `GET /admin/health-summary` ([server.js:1334](../../proxy/server.js#L1334)).

### 2.13 Rate limiting

Per-IP sliding window. Bucket map at [server.js:1112](../../proxy/server.js#L1112) — `rateLimitBuckets = new Map()`. Window 60s, 120 requests max ([server.js:1110-1111](../../proxy/server.js#L1110-L1111)). **In-memory only** — single-process; a multi-instance deployment behind a load balancer has no global rate limit. Test-bypass at [server.js:1118](../../proxy/server.js#L1118) — `if (process.env.NODE_ENV === 'test') return next();`.

Mounted on: `/assistant`, `/warehouse`, `/supervisor`, `/confidence`, `/openai`, `/bedrock`, `/foundation`, `/feedback`, `/history`, `/admin`, `/sql`, `/insights` ([server.js:1137-1194](../../proxy/server.js#L1137-L1194)).

**NOT** mounted on `/health`. Cheap meta-route, intentional ([server.js comment at 1135-1136](../../proxy/server.js#L1135-L1136)).

### 2.14 Genie-vocabulary leakage

The proxy advertises itself as "connector-agnostic on the AI side" but is shot through with Genie/Databricks/Power BI vocabulary in code paths that should be neutral. Hits:

| Ref | Vocabulary | Context |
|---|---|---|
| [server.js:5](../../proxy/server.js#L5) | "UniBridge AI Proxy — auth fan-out + CORS bypass between the Power BI custom visual and Databricks Genie..." | File header doc |
| [server.js:15](../../proxy/server.js#L15) | "Target Genie space ID for this profile." | JSDoc on `ProfileConfig.spaceId` |
| [server.js:1061](../../proxy/server.js#L1061) | "Power BI Desktop WebView requires permissive headers" | CORS comment |
| [server.js:122, 238, 3444](../../proxy/server.js#L122) | "UniBridge AI Supervisor" | Default `agentName` and synthesis system-prompt identity |
| [server.js:1452](../../proxy/server.js#L1452) | ".pbiviz" | Comment on validator hot-reload story |
| [server.js:3380-3391](../../proxy/server.js#L3380-L3391) | "Genie space" / "space_id" / "agent endpoint" / "profile key" | Output scrubber regex — replaces these in synthesis output |
| [server.js:3263-3302](../../proxy/server.js#L3263-L3302) | `LEGACY_DEMO_SCHEMAS = { sales, customer, ops, hse }` | Hardcoded SuperStore demo data column lists. Used as fallback when `profile.schemaContext` is unset. The hse "Hybrid flat superstore" is a Pulse demo construct. |
| [server.js:3605-3608](../../proxy/server.js#L3605-L3608) | `LEGACY_DEMO_SYNTHETIC_FIELDS = { customer: ['churn_risk_score', ...], ops: ['hse_risk_score', ...] }` | Synthetic indicators hardcoded for the Pulse demo schemas |
| [server.js:3373](../../proxy/server.js#L3373) | "**actual_sales** from the **{ops}** source is a monthly regional aggregate rounded to 2 decimal places…" | Cross-domain divergence note baked in; only fires when profile keys `ops` AND something else are configured |
| [server.js:3181](../../proxy/server.js#L3181) | "PulsePlay Supervisor" | Profile shape comment |
| [server.js:1512](../../proxy/server.js#L1512) | "Genie space" wording into user-facing surfaces (BUG-013 generic) | Comment on profile-listing endpoint |
| [llmOrchestrator.js:23](../../proxy/lib/llmOrchestrator.js#L23) | "for a Databricks SQL warehouse" | SQL system prompt |
| [llmOrchestrator.js:452](../../proxy/lib/llmOrchestrator.js#L452) | "analysing a Power BI dashboard's measures + Genie space metadata" | Metric-rule prompt builder |
| [insightsValidator.js:4](../../proxy/lib/insightsValidator.js#L4) | "JS mirror of genieChatVisual/src/insightsStageValidator.ts" | Module header — references the Pulse PBI custom visual source path |
| [server.js:1502, 1516, etc](../../proxy/server.js#L1502) | route names `/assistant/...` | Generic — but every comment under them references Genie |

**The pattern is consistent:** the proxy assumes Genie is the default backend and treats the others as alternate paths bolted on. This is a heritage artifact, not a design.

### 2.15 Tests

12 test files, all under [proxy/tests/](../../proxy/tests/):

| File | Bytes | `describe`/`it`/`test` count | What it covers |
|---|---|---|---|
| [analytics.test.js](../../proxy/tests/analytics.test.js) | 9,962 | 26 | OpenAI / Bedrock analytics-mode orchestration |
| [foundationModelClient.test.js](../../proxy/tests/foundationModelClient.test.js) | 10,298 | 31 | callFoundationModel, schemas, renderers |
| [foundationRoute.test.js](../../proxy/tests/foundationRoute.test.js) | 3,697 | 6 | `POST /foundation/section` route |
| [inlineCredentials.test.js](../../proxy/tests/inlineCredentials.test.js) | 30,938 | 44 | Wave 31 + 36 inline credentials precedence |
| [insightsValidator.test.js](../../proxy/tests/insightsValidator.test.js) | 8,421 | 28 | Validator framework section-by-section |
| [llmOrchestrator.test.js](../../proxy/tests/llmOrchestrator.test.js) | 7,436 | 11 | Orchestrator happy + retry-on-bad-SQL |
| [metricRuleSuggest.test.js](../../proxy/tests/metricRuleSuggest.test.js) | 18,054 | 26 | Wave 41 metric-rule suggest pipeline |
| [oauthM2m.test.js](../../proxy/tests/oauthM2m.test.js) | 19,751 | 24 | OAuth M2M token resolution + cache |
| [schemaIntrospector.test.js](../../proxy/tests/schemaIntrospector.test.js) | 8,785 | 17 | INFORMATION_SCHEMA cache + LRU |
| [server.test.js](../../proxy/tests/server.test.js) | 60,825 | 130 | Integration — every route, profile resolution, rate limit, audit |
| [spHashing.test.js](../../proxy/tests/spHashing.test.js) | 14,342 | 26 | Service-principal identity hashing |
| [sqlPreviewRoute.test.js](../../proxy/tests/sqlPreviewRoute.test.js) | 9,439 | 26 | `/sql/preview` + `/sql/explain` |

**Total:** 395 `describe`/`it`/`test` invocations. The CLAUDE.md claim of "342 tests" ([CLAUDE.md status section](../../CLAUDE.md)) is close but not exactly that number. `it` and `test` are interchangeable in Jest, and a single `describe` may contain many `it`s — so the actual test count is likely the number of `it`/`test` invocations only, but I did not run the suite to confirm.

**Coverage gaps** (visible from filenames + reading server.test.js):
- No tests for `runLocalSupervisor` fan-out logic. The only supervisor coverage in server.test.js is `[UNVERIFIED — confirmed from grep but not exhaustive read]`.
- No tests for `synthesizeSupervisorAnswer` synthesis call.
- No tests for `scrubInternalJargon` output sanitisation.
- No tests for the streaming variant `/supervisor/conversations/start-stream`.
- No tests for the `LEGACY_DEMO_SCHEMAS` fallback. This is fine because it shouldn't be used in PulsePlay anyway, but it's still in the code.
- No tests for the `bedrockRetrieveAndGenerate` inline copy in server.js — only `lib/bedrock.js` `bedrockInvokeModel` is tested in `analytics.test.js`.

[UNVERIFIED] — I did not run `npm test` to confirm 342/342 still passes; took the README's word for it.

---

## 3. playground/ deep dive

### 3.1 Files inventory

7 source files total (`Get-ChildItem -Recurse playground/src`):

| File | Lines | Purpose | Stub vs real |
|---|---|---|---|
| [main.tsx](../../playground/src/main.tsx) | 13 | StrictMode root + createRoot | Real |
| [App.tsx](../../playground/src/App.tsx) | 100 | Sidebar+canvas shell, holds 4 useState slots, accumulates last 20 BIEvents | Real |
| [styles.css](../../playground/src/styles.css) | n/a (4281 bytes) | CSS — not read in audit | n/a |
| [biPanel/BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts) | 136 | Vendor-neutral contract (interface + types + capabilities + commands) | Real, well-shaped |
| [biPanel/BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx) | 84 | Generic host that mounts any adapter | Real |
| [biPanel/registry.ts](../../playground/src/biPanel/registry.ts) | 91 | Lazy adapter loader + VendorInfo array | Real |
| [components/AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | 117 | The AI assistant. **Submit-only.** | Stub-with-real-network |
| [components/ConnectorPicker.tsx](../../playground/src/components/ConnectorPicker.tsx) | 83 | Profile picker, fetches `/api/assistant/profiles` | Real |
| [components/EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx) | 55 | Single URL field. v0 placeholder. | Stub |
| [components/VendorPicker.tsx](../../playground/src/components/VendorPicker.tsx) | 31 | Static vendor list dropdown | Real |

`playground/src/lib/` directory exists but is **empty** ([Bash ls](../../playground/src/lib/)). Whatever was planned to live there hasn't been created.

No tests exist anywhere under `playground/`. [package.json:12](../../playground/package.json#L12) declares `"test": "vitest run"` but vitest has nothing to find.

### 3.2 What's wired

- **Vendor picker** wired ([App.tsx:56-64](../../playground/src/App.tsx#L56-L64)) — switches `activeVendor` state, resets `embedConfig` and `recentEvents` on change.
- **Connector picker** wired ([App.tsx:70-73](../../playground/src/App.tsx#L70-L73)) — fetches `/api/assistant/profiles` on mount via the proxy.
- **Embed config form** wired but minimal ([App.tsx:65-69](../../playground/src/App.tsx#L65-L69)) — single URL field for every vendor; vendor-specific tooltip placeholders.
- **BIPanel** mounts the adapter via lazy `loadAdapter(vendor)` ([BIPanel.tsx:34-55](../../playground/src/biPanel/BIPanel.tsx#L34-L55)). Subscribes to all six canonical event types when `onEvent` is provided ([BIPanel.tsx:50-54](../../playground/src/biPanel/BIPanel.tsx#L50-L54)). Calls `destroy()` on unmount.
- **AI sidebar** submits to proxy via `fetch('/api/assistant/conversations/start', { method: 'POST', headers: { ..., 'X-Assistant-Profile': activeConnector } })` ([AISidebar.tsx:61-71](../../playground/src/components/AISidebar.tsx#L61-L71)). Includes a 5-event context block ([AISidebar.tsx:48-55](../../playground/src/components/AISidebar.tsx#L48-L55)).

### 3.3 What's stubbed

**The AI sidebar does not complete the answer loop.** [AISidebar.tsx:72-77](../../playground/src/components/AISidebar.tsx#L72-L77):

```tsx
const data = await res.json();
if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
// The assistant endpoint returns conversation_id + message_id +
// an initial status. v1 will poll for completion via
// /api/assistant/conversations/:cid/messages/:mid like the sister project does.
const answer = data.message?.content || "(message submitted; v1 will poll for completion)";
```

It reads `data.message?.content`, which is the wrong field shape. `/assistant/conversations/start` returns `{ conversation_id, message_id, ... }` from Genie ([server.js:1702](../../proxy/server.js#L1702)) — the full content lives at `data.attachments[i].text.content` and only after polling. So the AISidebar will display `"(message submitted; v1 will poll for completion)"` for every Genie question.

For the supervisor-local path it actually works because `runLocalSupervisor` returns the answer synchronously in the start-conversation response ([server.js:4031-4044](../../proxy/server.js#L4031-L4044)) — but `data.message?.content` is still wrong; the field is `data.content` ([server.js:4032](../../proxy/server.js#L4032)). So even the working path is reading the wrong key.

For OpenAI / Bedrock / Foundation Model — same story. They return `{ conversation_id, message_id, status: 'COMPLETED', content: answer }` ([server.js:2735-2740](../../proxy/server.js#L2735-L2740)). `data.message?.content` does not exist.

**The AI sidebar v0 is broken** for every backend. The displayed answer will always be the placeholder string. This is not documented in PROJECT_REVIEW.md or E2E_GAP_REVIEW_INITIAL.md — both say "submit-only" but neither flags that the response field name is wrong.

**The embed config form is a single URL field for every vendor.** [EmbedConfigForm.tsx:33-44](../../playground/src/components/EmbedConfigForm.tsx#L33-L44). PowerBI / Tableau / Qlik / Looker all need vendor-specific config (workspace + report + token, ticket, OAuth, etc.) — none of that exists. Tooltip placeholders only ([EmbedConfigForm.tsx:23-31](../../playground/src/components/EmbedConfigForm.tsx#L23-L31)).

**Vendor picker exposes 5 entries, only 1 is real.** [registry.ts:23-54](../../playground/src/biPanel/registry.ts#L23-L54) — the `configured: false` flag on PowerBI / Tableau / Qlik / Looker only renders as "(needs config)" suffix in the dropdown ([VendorPicker.tsx:21](../../playground/src/components/VendorPicker.tsx#L21)). The user can still pick them. They will all behave identically to generic-iframe.

### 3.4 Pulse-heritage assumptions baked in

- `AISidebar` reads `data.message?.content` — **wrong field name** for every PulsePlay backend. Possibly inherited from a Pulse contract (the comment "v1 will poll for completion via … like the sister project does" at [AISidebar.tsx:75-76](../../playground/src/components/AISidebar.tsx#L75-L76) confirms the heritage thinking).
- The proxy passthrough sends header `X-Assistant-Profile` with value from `activeConnector` ([AISidebar.tsx:65](../../playground/src/components/AISidebar.tsx#L65)) — that header is recognised by the proxy ([server.js:2607, 2790, 3054, 3185](../../proxy/server.js#L2607)), so this works.
- The "BI Context" prompt template ([AISidebar.tsx:51-55](../../playground/src/components/AISidebar.tsx#L51-L55)) jams `recent BI events` into the user prompt as plaintext. There is no separate context channel. A malicious BI tool emitting crafted event payloads could inject prompt directives. Cited in [E2E_GAP_REVIEW_INITIAL.md row 4](../E2E_GAP_REVIEW_INITIAL.md) — "BI event trust" — but it bears repeating.
- `App.tsx` resets `recentEvents` when the user switches vendors ([App.tsx:62](../../playground/src/App.tsx#L62)) — sensible, but the buffer's last-20 cap ([App.tsx:43](../../playground/src/App.tsx#L43)) is probably not what an enterprise needs.

### 3.5 Vite config

[vite.config.ts](../../playground/vite.config.ts):
- Proxies `/api` → `http://127.0.0.1:8787` with rewrite stripping `/api` ([line 14-19](../../playground/vite.config.ts#L14-L19)). So `/api/assistant/profiles` from the React app lands at `/assistant/profiles` on the proxy. Confirmed by route handler at [server.js:1516](../../proxy/server.js#L1516).
- Source maps enabled in production build ([line 24](../../playground/vite.config.ts#L24)). For an enterprise deployment, source maps shouldn't ship to public hosting.
- `changeOrigin: true` ([line 17](../../playground/vite.config.ts#L17)) — forwards `Host` header rewrite. Fine for dev.
- The header docstring says "sister Pulse project's UniBridge AI Proxy" ([line 6](../../playground/vite.config.ts#L6)) — naming heritage drift confirmed.

### 3.6 TypeScript config

[tsconfig.json](../../playground/tsconfig.json) — `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`. Reasonable production-grade strictness. ES2022 target. `bundler` module resolution. `noEmit: true` — Vite handles emit.

### 3.7 Package.json

[package.json](../../playground/package.json) — name `pulseplay-playground`, version `0.1.0`. Production dependencies: `react ^19.0.0`, `react-dom ^19.0.0`. Dev: vite 6, vitest 2, jsdom 25, typescript 5.6. The `comments._intentional_omission` block at [package.json:27-29](../../playground/package.json#L27-L29) explains why `powerbi-client` etc. are NOT root deps — each adapter is supposed to install its own. None of them have done so yet because none of them are real.

**No vendor SDK is installed at any level.** `node_modules/` is gitignored; one would have to run `npm install` in `bi-adapters/<vendor>/` (none of which have a package.json today) to get real SDKs.

---

## 4. bi-adapters/ deep dive

### 4.1 Per-vendor reality

| Adapter | File | Lines | Real? |
|---|---|---|---|
| generic-iframe | [bi-adapters/generic-iframe/index.ts](../../bi-adapters/generic-iframe/index.ts) | 121 | **Yes — only real adapter.** |
| powerbi | [bi-adapters/powerbi/index.ts](../../bi-adapters/powerbi/index.ts) | 25 | **No — extends GenericIframeAdapter, overrides nothing functional.** |
| tableau | [bi-adapters/tableau/index.ts](../../bi-adapters/tableau/index.ts) | 21 | **No — same story.** |
| qlik | [bi-adapters/qlik/index.ts](../../bi-adapters/qlik/index.ts) | 22 | **No — same story.** |
| looker | [bi-adapters/looker/index.ts](../../bi-adapters/looker/index.ts) | 20 | **No — same story.** |

The four "vendor" adapters [powerbi/index.ts](../../bi-adapters/powerbi/index.ts), [tableau/index.ts](../../bi-adapters/tableau/index.ts), [qlik/index.ts](../../bi-adapters/qlik/index.ts), [looker/index.ts](../../bi-adapters/looker/index.ts) each:
- Import `GenericIframeAdapter` from `../generic-iframe/index`
- Declare a class that extends it
- Override only the `vendor` and `displayName` strings
- Inherit every method (`mount`, `on`, `send`, `destroy`, `capabilities`) verbatim

**They do not advertise different capabilities.** [powerbi/index.ts:19-25](../../bi-adapters/powerbi/index.ts#L19-L25) inherits `canNavigatePages: false, canApplyFilters: false, canExport: false, canRefresh: true, canFullscreen: true`. The whole point of `BICapabilities` (declare what THIS adapter supports) is defeated when every adapter advertises the same minimal capability set.

The vendor `vendor` strings are different ("powerbi" vs "generic-iframe") so some reflection-based code might branch on the string — but there's no such code in the playground today.

### 4.2 Capability declarations vs reality

The `BICapabilities` interface at [BIAdapter.ts:74-83](../../playground/src/biPanel/BIAdapter.ts#L74-L83) lets adapters advertise:
- `canNavigatePages`, `canApplyFilters`, `canExport`, `canRefresh`, `canFullscreen`, `requiresContainerEl`

In practice the inherited `capabilities()` at [generic-iframe/index.ts:39-51](../../bi-adapters/generic-iframe/index.ts#L39-L51) returns the same answer for every adapter:
```
canNavigatePages: false, canApplyFilters: false, canExport: false,
canRefresh: true, canFullscreen: true, requiresContainerEl: true
```

A user picking "Power BI" and trying to apply a filter via the AI sidebar would see UNSUPPORTED_COMMAND ([generic-iframe/index.ts:104](../../bi-adapters/generic-iframe/index.ts#L104)). This is correct given the stub, but it does NOT match the marketing claim "any combination of (vendor, connector) is valid" from [README.md:11-12](../../README.md#L11-L12) — every combination is "valid" only if your definition of valid is "shows you an iframe."

### 4.3 The interface contract

[BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts) — 136 lines. The contract itself is genuinely well-shaped:
- Vendor-neutral types (no PBI/Tableau/Qlik enums leaked)
- Lifecycle: `mount → (events ↔ commands) → destroy`
- Both embed mechanisms supported via `requiresContainerEl: boolean`
- Six canonical events (loaded, page-changed, filter-applied, selection-made, data-refreshed, error)
- Six canonical commands (navigate-to-page, apply-filter, clear-filter, refresh, fullscreen, export)
- Standard error codes (`BI_ERR.UNSUPPORTED_COMMAND`, `NOT_MOUNTED`, `EMBED_FAILED`, `AUTH_FAILED`)

**Gaps for plug-and-play:**
- No interface versioning. A future contract change has nothing to negotiate.
- No conformance test hook. Every adapter could implement `mount(): Promise<void>` differently — reject vs. throw vs. resolve-as-error — and there's no shared test that runs all adapters through the same lifecycle expectations.
- No security checklist on `mount(containerEl, embedConfig)`. The contract doesn't say what the adapter MUST do for sandbox attributes, postMessage origin checks, or token expiry. The generic adapter at [generic-iframe/index.ts:61](../../bi-adapters/generic-iframe/index.ts#L61) sets a wide default sandbox — which any subclass inherits.
- `BICommand.kind === 'apply-filter'` accepts `values: string[] | string | number | number[]` ([BIAdapter.ts:63](../../playground/src/biPanel/BIAdapter.ts#L63)). The unioned type creates ambiguity when the AI generates `apply-filter` commands programmatically.
- No "bring your own event type" extension. Adapters that need to surface a vendor-specific event (e.g. PBI's `bookmarkApplied`) have to map to the closest canonical type — losing fidelity.
- No capability for "I can issue a SQL query through this BI tool" — which would be useful for AI-driven exploration that doesn't go through the proxy. This is a future-proofing gap, not a current bug.

---

## 5. databricks-agents/supervisor/

### 5.1 State of the LangGraph supervisor

[`databricks-agents/supervisor/agent.py`](../../databricks-agents/supervisor/agent.py) — 328 lines. Manual StateGraph (not `prebuilt.create_react_agent`) because of `ExecutionInfo`/`ServerInfo` import incompatibilities with `databricks-langchain`'s pinned langgraph transitives ([agent.py:11-19](../../databricks-agents/supervisor/agent.py#L11-L19)).

**Tools** ([agent.py:124-160](../../databricks-agents/supervisor/agent.py#L124-L160)):
- `query_sales` — uses `SALES_SPACE_ID` env var
- `query_customer` — uses `CUSTOMER_SPACE_ID`
- `query_operations` — uses `OPS_SPACE_ID`
- `query_hse` — uses `HSE_SPACE_ID`

**Hardcoded to 4 specific Genie spaces.** No registration mechanism, no ergonomic way to add a 5th space without editing this file. The spaces are the SuperStore demo spaces inherited from Pulse ([config.example.env:3-6](../../databricks-agents/supervisor/config.example.env#L3-L6)).

**Supervisor LLM** is `databricks-meta-llama-3.1-405b-instruct` by default ([agent.py:67](../../databricks-agents/supervisor/agent.py#L67)). System prompt at [agent.py:165-221](../../databricks-agents/supervisor/agent.py#L165-L221) is heavily SuperStore-shaped:
- "Sales performance: revenue, profit, margin, category mix"
- "Customer experience, returns, churn, NPS, segments"
- "Monthly targets, fulfilment, on-time rate (monthly aggregates rounded to 2dp, expect minor drift vs order-line sources)"
- "Health, safety, shipping speed, incidents"

These are the SuperStore + Pulse Customer Experience Dashboard categories.

**The wrapper class is `SupervisorChatAgent(ChatAgent)` ([agent.py:291](../../databricks-agents/supervisor/agent.py#L291))**, which is the Mosaic AI Agent Framework's required base. Compatibility shim — wraps the LangGraph runnable so Databricks accepts it.

### 5.2 Naming drift

Every place "PulsePlay Supervisor Agent" or `pulseplay-supervisor-agent` appears (from grep `the sister project` + `pulseplay-supervisor`):

| File | Line | Reference |
|---|---|---|
| [databricks-agents/supervisor/README.md](../../databricks-agents/supervisor/README.md) | 1 | Title: "PulsePlay Supervisor Agent for Databricks Mosaic AI" |
| [databricks-agents/supervisor/README.md](../../databricks-agents/supervisor/README.md) | 48, 62, 75-78 | Various references in deploy steps and config snippet |
| [databricks-agents/supervisor/log_and_deploy.py](../../databricks-agents/supervisor/log_and_deploy.py) | 2, 14 | Module docstring + `ENDPOINT_NAME` default |
| [databricks-agents/supervisor/log_and_deploy.py](../../databricks-agents/supervisor/log_and_deploy.py) | 31, 39 | `ENDPOINT_NAME` env default + MLflow run_name |
| [databricks-agents/supervisor/log_and_deploy.py](../../databricks-agents/supervisor/log_and_deploy.py) | 100, 102 | Printed config snippet `agentName` and `displayName` |
| [databricks-agents/supervisor/config.example.env](../../databricks-agents/supervisor/config.example.env) | 23 | `ENDPOINT_NAME=pulseplay-supervisor-agent` |
| [databricks-agents/supervisor/deploy.ipynb](../../databricks-agents/supervisor/deploy.ipynb) | 19, 26, 329, 345, 601-618 | Notebook cells reference pulseplay-supervisor-agent multiple times |
| [proxy/config.example.json](../../proxy/config.example.json) | 81-84 | Sample profile uses `endpoint: "/serving-endpoints/pulseplay-supervisor-agent/..."` and `agentName: "PulsePlay Supervisor Agent"` |
| [proxy/server.js](../../proxy/server.js) | 3181 | Profile shape comment example: `"agentName": "PulsePlay Supervisor"` |
| [proxy/app.yaml](../../proxy/app.yaml) | 20 | `SUPERVISOR_AGENT_NAME` value `"PulsePlay Supervisor"` |

**The agent is still branded for the parent project, not for PulsePlay.** Renaming would touch `agent.py`, `log_and_deploy.py`, `deploy.ipynb`, `config.example.env`, `README.md`, `proxy/config.example.json`, `proxy/server.js` (3 places where 'UniBridge AI Supervisor' is the default), `proxy/app.yaml`.

### 5.3 Deployment story

[supervisor/README.md:42-89](../../databricks-agents/supervisor/README.md#L42-L89) lays out: upload to Databricks workspace, open `log_and_deploy.py` as a notebook, set env vars, run cell-by-cell. The deploy script logs the agent as MLflow LangChain model, registers in Unity Catalog at `<UC_CATALOG>.<UC_SCHEMA>.pulseplay_supervisor_agent` ([log_and_deploy.py:33-43](../../databricks-agents/supervisor/log_and_deploy.py#L33-L43)), then deploys via `databricks-agents.deploy` with `scale_to_zero=True` ([log_and_deploy.py:74-88](../../databricks-agents/supervisor/log_and_deploy.py#L74-L88)).

**What's verifiable from the repo alone: nothing.** The deployment cannot be tested without a Databricks workspace + UC permissions + foundation-model serving access. The script is well-written (sensible pin-loose pip_requirements at [log_and_deploy.py:60-64](../../databricks-agents/supervisor/log_and_deploy.py#L60-L64) to avoid ResolutionImpossible) but operational reality is workspace-dependent.

[UNVERIFIED] — whether `agents.deploy()` actually works against current `databricks-agents` SDK versions. The pinning rationale at [agent.py:14-19](../../databricks-agents/supervisor/agent.py#L14-L19) suggests the SDK has been moving and prior versions broke.

[UNVERIFIED] — whether the `deploy.ipynb` (which I did not read in full given it is `.ipynb` JSON) is consistent with `log_and_deploy.py`. They appear to overlap based on grep results.

---

## 6. scripts/

13 files. Status:

| Script | Purpose | Heritage | Status |
|---|---|---|---|
| [llm_onboard.py](../../scripts/llm_onboard.py) | Session start ritual — prints crash recovery, canonical docs, last 40 proxy log lines, last 20 commits. | Inherited (Pulse) | **Stale** — STATE_FILE = `.the sister project-session.state.json` ([llm_onboard.py:75](../../scripts/llm_onboard.py#L75)). Should be `.pulseplay-session.state.json` per CLAUDE.md TODO. |
| [llm_wrapup.py](../../scripts/llm_wrapup.py) | Session end ritual — marks session complete, optional `--note`. | Inherited (Pulse) | **Stale** — same `.the sister project-session.state.json` reference at [llm_wrapup.py:37](../../scripts/llm_wrapup.py#L37). |
| [release-check.ps1](../../scripts/release-check.ps1) | Local release gate — runs proxy tests, smoke, builds. | Inherited (Pulse) | **Mostly stale.** References `.pbiviz` size cap ([release-check.ps1:22-26](../../scripts/release-check.ps1#L22-L26)) — that's a PBI custom visual artifact PulsePlay does not produce. Step "Package: build.ps1 (lint + tsc + pbiviz)" at [release-check.ps1:126](../../scripts/release-check.ps1#L126) calls a `build.ps1` that does not exist in this repo. **This script will fail in PulsePlay context.** |
| [smoke-full.ps1](../../scripts/smoke-full.ps1) | 10-test live smoke against proxy. Fires real Databricks calls. | Inherited (Pulse) | Marginal — uses 'default' and 'hse' profile names ([smoke-full.ps1:50](../../scripts/smoke-full.ps1#L50)) hardcoded. Will work if PulsePlay deploys with those exact profile names. |
| [smoke-rls-ols.ps1](../../scripts/smoke-rls-ols.ps1) | 4-test smoke for RLS/OLS enforcement on the Genie path. | Inherited (Pulse) | **Stale conceptually** — explicitly asserts that "RLS and OLS are NOT enforced on the Genie path (shared PAT)" ([smoke-rls-ols.ps1:16-17, 143](../../scripts/smoke-rls-ols.ps1#L143)). This is a Pulse-specific finding about how shared-PAT mode breaks Power BI's row-level/object-level security. PulsePlay inherits the same finding but it should be a security note, not a smoke test. |
| [Deploy-DatabricksApp.ps1](../../scripts/Deploy-DatabricksApp.ps1) | Deploys proxy to Databricks Apps. | Inherited (Pulse) | **Broken in default mode.** Default path requires a `databricks.yml` bundle definition that does not exist in this repo ([Deploy-DatabricksApp.ps1:15](../../scripts/Deploy-DatabricksApp.ps1#L15) — `databricks bundle validate --target dev`). Workspace-source path (`-WorkspaceSource` flag) works. App name hardcoded `test-superuser-genie-powerbi` ([Deploy-DatabricksApp.ps1:2](../../scripts/Deploy-DatabricksApp.ps1#L2)). |
| [Check-Credentials.ps1](../../scripts/Check-Credentials.ps1) | Pre-commit grep for `dapi*` PAT leaks. | Inherited (Pulse) | Targets PBIP demo files ([Check-Credentials.ps1:3-4](../../scripts/Check-Credentials.ps1#L3-L4)) that don't exist in PulsePlay. **Useless here.** |
| [genie-proxy.mjs](../../scripts/genie-proxy.mjs) | Standalone .env-driven proxy launcher. | Inherited (Pulse) | Marginal — duplicates `proxy/server.js` startup; PulsePlay's preferred path is `node proxy/server.js`. |
| [accuracy_audit.py](../../scripts/accuracy_audit.py) | Compares Genie answers to ground-truth SQL. | Inherited (Pulse) | **Broken** — hardcoded host `dbc-ENTER-YOUR-WORKSPACE-HASH.cloud.databricks.com` and warehouse ID `ENTER_WAREHOUSE_ID` ([accuracy_audit.py:16-17](../../scripts/accuracy_audit.py#L16-L17)), reads `proxy/config.json["profiles"]["sales"]["token"]` which only exists if you copy the example config verbatim. |
| [brutal_smoke_v2.py](../../scripts/brutal_smoke_v2.py) | 50-question accuracy battery across complexity bands. | Inherited (Pulse) | Marginal — PulsePlay-shaped questions would be different. |
| [genie_runner.py](../../scripts/genie_runner.py) | Fire-and-forget question runner. | Inherited (Pulse) | Working but Genie-only. |
| [genie_stress.py](../../scripts/genie_stress.py) | 3-round adversarial stress with cross-domain fusion. | Inherited (Pulse) | Genie-only. |
| [genie_deep_battery.py](../../scripts/genie_deep_battery.py) | 4-iteration adversarial battery, sales+hse fusion. | Inherited (Pulse) | Genie-only, SuperStore-domain-only. |

**Summary:** of 13 scripts, only `llm_onboard.py` and `llm_wrapup.py` are PulsePlay-relevant in concept, both with stale state-file names. The PowerShell scripts are mostly Windows-bound (PowerShell-only). Three scripts are concretely broken or useless in PulsePlay context: `release-check.ps1`, `Check-Credentials.ps1`, and `accuracy_audit.py`.

---

## 7. docs/ — comprehensive drift map

The docs folder is the most heritage-fraught area. There are five categories:

| Category | Description |
|---|---|
| **PulsePlay-native** | Written for PulsePlay specifically. Title is correct. |
| **PepPulse-inherited** | Inherited verbatim from sister project. Title still says PepPulse. |
| **External-LLM review** | Commissioned in the past 24h from external LLMs. PulsePlay-aware but unverified. |
| **CPG-vertical** | Specific to a CPG/FMCG enterprise scenario. PulsePlay-aware but aspirational. |
| **Research bibliography** | Inherited research catalogue, not actionable for PulsePlay. |
| **Inherited-ADR** | Records decisions about the Pulse PBI custom visual, NOT PulsePlay. |

### 7.1 Document table

| Filename | Claimed identity (title) | Actual identity | Key dependencies | Disposition |
|---|---|---|---|---|
| [README.md](../../README.md) | "PulsePlay" | PulsePlay-native | docs/MULTI_BI_ARCHITECTURE.md, docs/API_AUTH_AND_LIMITATIONS.md | **Keep** |
| [CLAUDE.md](../../CLAUDE.md) | "PulsePlay — Claude Code Guide" | PulsePlay-native (with explicit acknowledgment of inherited tooling) | docs/MULTI_BI_ARCHITECTURE.md, scripts/llm_onboard.py | **Keep** |
| [docs/MULTI_BI_ARCHITECTURE.md](../../docs/MULTI_BI_ARCHITECTURE.md) | "PulsePlay Multi-BI Architecture" | PulsePlay-native, defining design doc | docs/SECURITY_REVIEW.md, docs/ENTERPRISE_READINESS.md, docs/API_AUTH_AND_LIMITATIONS.md | **Keep — load-bearing** |
| [docs/ROADMAP.md](../../docs/ROADMAP.md) | "PulsePlay Roadmap" | PulsePlay-native — v0.1 → v1.2 honest | none | **Keep** |
| [docs/PROJECT_REVIEW.md](../../docs/PROJECT_REVIEW.md) | "PulsePlay Project Review" | External-LLM review (likely ChatGPT) — generally accurate; some softening (rates "Strong" without citing line numbers) | docs/MULTI_BI_ARCHITECTURE.md, docs/ROADMAP.md | **Archive** to `docs/research/` after this audit supersedes the higher-level claims |
| [docs/PULSEPLAY_CPG_REVIEW.md](../../docs/PULSEPLAY_CPG_REVIEW.md) | "PulsePlay: Enterprise-Grade Verdict & CPG/FMCG Industry Alignment Review" | External-LLM review with marketing voice ("architectural masterstroke", "grand unifier") | none | **Archive** — value is low; the marketing tone is inconsistent with brutal-honest project culture; verdicts are unverified |
| [docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md](../../docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md) | "Enterprise-Grade CPG/FMCG Decision Intelligence Blueprint" | External-LLM CPG-vertical aspirational architecture | inputs to E2E_GAP_REVIEW_INITIAL | **Keep** as vision doc, but flag explicitly as "target state, NOT implemented." |
| [docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md](../../docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md) | "Enterprise Security and Platform Architecture Guardrails" | External-LLM security/platform target architecture | inputs to E2E_GAP_REVIEW_INITIAL | **Keep** as target/aspiration. Flag as "target state." |
| [docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md](../../docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md) | "Controlled Enterprise Environment Feasibility Mapping" | External-LLM technical-feasibility target mapping. **Most useful of the new docs** — contains explicit "current state vs target state" tables. | proxy/server.js, etc. | **Keep** |
| [docs/FUNCTIONAL_COVERAGE_ASSESSMENT.md](../../docs/FUNCTIONAL_COVERAGE_ASSESSMENT.md) | "Functional Coverage Assessment" | External-LLM coverage matrix. Implemented / Partial / Missing / Out-of-Scope. **Practical reference.** | repo files | **Keep** |
| [docs/E2E_GAP_REVIEW_INITIAL.md](../../docs/E2E_GAP_REVIEW_INITIAL.md) | "End-to-End Gap Review" | External-LLM gap review. Severity table (Blocker/High/Medium). | docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md, docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md | **Keep** |
| [docs/E2E_REVIEW_SUB_AGENT.md](../../docs/E2E_REVIEW_SUB_AGENT.md) | "End-to-End Review Sub-Agent" | External-LLM agent specification — defines a recurring review cadence | docs/E2E_GAP_REVIEW_INITIAL.md | **Keep** as process doc |
| [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) | **"PepPulse — Architecture & Knowledge Base (Consolidated)"** | PepPulse-inherited (108KB). Page 1 ([line 14-16](../ARCHITECTURE.md#L14-L16)) explicitly says "UniBridge AI for Power BI — Architecture & Cost Design" with a `.pbiviz` diagram at line 35. **Wrong product title for PulsePlay.** | docs/SECURITY_REVIEW.md, docs/INDEX.md (file does not exist), docs/AUTHOR_GUIDE.md (file does not exist) | **Archive to `docs/inherited/`** + create new `docs/PULSEPLAY_ARCHITECTURE.md` referenced from MULTI_BI_ARCHITECTURE.md |
| [docs/SECURITY_REVIEW.md](../../docs/SECURITY_REVIEW.md) | **"Security Review — PepPulse"** | PepPulse-inherited (19KB). Threat model speaks of `.pbix files`, "Wave 31 inline credentials", PBI custom visual sandbox. Specific to Pulse. | n/a | **Archive to `docs/inherited/`** + write new `docs/PULSEPLAY_SECURITY.md` for browser-host risks (CSP, embed allowlist, prompt injection from BI events) — flagged by [PROJECT_REVIEW.md:165-178](../PROJECT_REVIEW.md#L165-L178) |
| [docs/ENTERPRISE_READINESS.md](../../docs/ENTERPRISE_READINESS.md) | **"PepPulse — Enterprise Readiness Brief"** | PepPulse-inherited (38KB). Section 1 talks about PBI Desktop + proxy setup, section 7 is "when NOT to pick PepPulse." | n/a | **Archive to `docs/inherited/`** |
| [docs/API_AUTH_AND_LIMITATIONS.md](../../docs/API_AUTH_AND_LIMITATIONS.md) | **"PepPulse — API Surface, Auth Modes, and Known Limitations"** | PepPulse-inherited (28KB). Lists every API the proxy calls (Genie, OpenAI, Bedrock, Foundation Model). **Most of the content IS still relevant for PulsePlay** — the proxy is the same. | n/a | **Rewrite top section + retitle** to `docs/PULSEPLAY_API_AUTH.md` keeping the bulk of the content |
| [docs/BEAST_MODE_MEMORY.md](../../docs/BEAST_MODE_MEMORY.md) | "BEAST_MODE_MEMORY.md — North Star for Anyone Picking Up This Codebase" | PepPulse-inherited (15KB). [Line 13](../BEAST_MODE_MEMORY.md#L13) says "PepPulse is a Power BI custom visual." References `INDEX.md`, `AUTHOR_GUIDE.md`, build.ps1 — none of which exist in PulsePlay. | docs/INDEX.md, docs/AUTHOR_GUIDE.md | **Archive to `docs/inherited/`** or **delete** — PulsePlay's CLAUDE.md replaces it |
| [docs/QUALITY_METHODOLOGY.md](../../docs/QUALITY_METHODOLOGY.md) | "Quality Methodology — Honest Statement" | PepPulse-inherited (6KB). Cites "874 vitest unit tests" — that was Pulse, NOT PulsePlay. PulsePlay has 0 vitest tests. | n/a | **Archive to `docs/inherited/`** — replace with PulsePlay-specific methodology when written |
| [docs/ANALYTICS_DOMAIN_TAXONOMY.md](../../docs/ANALYTICS_DOMAIN_TAXONOMY.md) | "Analytics Domain Taxonomy — Recommendation" | Inherited research bibliography (15KB). Source-of-truth pointer at [line 4](../ANALYTICS_DOMAIN_TAXONOMY.md#L4) is `genieChatVisual/src/setupStep5.tsx` — doesn't exist in PulsePlay. | genieChatVisual/* (Pulse repo) | **Archive to `docs/inherited/`** |
| [docs/INSIGHTS_SECTION_TAXONOMY.md](../../docs/INSIGHTS_SECTION_TAXONOMY.md) | "AI Insights — Section Archetype Taxonomy" | Inherited research bibliography (20KB). References `insightsPresetLibrary.ts` from genieChatVisual — doesn't exist in PulsePlay. | genieChatVisual/src/insightsPresetLibrary.ts | **Archive to `docs/inherited/`** |
| [docs/adr/README.md](../../docs/adr/README.md) | "Architecture Decision Records" | Inherited ADR index — references 7 ADRs that all describe Pulse decisions | the 7 ADRs | **Replace** with PulsePlay-specific ADR index |
| [docs/adr/0001-xhr-only-genie-client.md](../../docs/adr/0001-xhr-only-genie-client.md) | "Genie REST client uses XHR, never fetch" | Inherited-ADR. **Does not apply to PulsePlay** — PulsePlay runs in a real browser, fetch works fine ([CLAUDE.md tripwires section](../../CLAUDE.md)). | genieChatVisual | **Archive** — explicitly note "does not apply to PulsePlay" |
| [docs/adr/0002-dual-bind-127-not-localhost.md](../../docs/adr/0002-dual-bind-127-not-localhost.md) | "Proxy binds 127.0.0.1 + ::1" | Inherited-ADR but **still applies** — proxy code does dual-bind at [server.js:4226-4256](../../proxy/server.js#L4226-L4256). | proxy/server.js | **Keep, retitle** to remove visual-context implication |
| [docs/adr/0003-supervisor-stagger-800ms.md](../../docs/adr/0003-supervisor-stagger-800ms.md) | "Supervisor stage stagger is 800 ms" | Inherited-ADR — **STALE.** Code says 2000ms ([server.js:3556](../../proxy/server.js#L3556)). | proxy/server.js | **Update** title, value, rationale to reflect 2000ms |
| [docs/adr/0004-format-pane-json-string-storage.md](../../docs/adr/0004-format-pane-json-string-storage.md) | "Format-pane stores complex shapes as JSON strings" | Inherited-ADR. **Does not apply** — PulsePlay has no PBI capabilities.json. | n/a | **Archive** |
| [docs/adr/0005-two-tier-insights-cache.md](../../docs/adr/0005-two-tier-insights-cache.md) | "AI Insights uses a two-tier (memory + localStorage) cache" | Inherited-ADR — describes Pulse visual's `insightsCache.ts`. PulsePlay has none. | genieChatVisual | **Archive** |
| [docs/adr/0006-trend-pill-allowlist.md](../../docs/adr/0006-trend-pill-allowlist.md) | "Trend pills use a section allowlist + numeric anchor" | Inherited-ADR — describes Pulse visual's renderer. | genieChatVisual | **Archive** |
| [docs/adr/0007-backend-adapter-abstraction.md](../../docs/adr/0007-backend-adapter-abstraction.md) | "BackendAdapter abstraction (IDEA-023)" | Inherited-ADR — describes Pulse's incomplete backend abstraction. References `genieChatVisual/src/backend/BackendAdapter.ts` — does not exist in PulsePlay. | genieChatVisual/src/backend/* | **Archive** — PulsePlay's `BIAdapter` is the closest analogue but is a vendor adapter, not a backend adapter |
| [proxy/README.databricks-app.md](../../proxy/README.databricks-app.md) | "Databricks App: test_SuperUser Genie Proxy" | Inherited Pulse-specific — references the `test-superuser-genie-powerbi` app name and a hardcoded Genie space ID ([README.databricks-app.md:27](../../proxy/README.databricks-app.md#L27)). | proxy/app.yaml, scripts/Deploy-DatabricksApp.ps1 | **Rewrite** — generic Databricks Apps deployment guide for PulsePlay's proxy |
| [databricks-agents/supervisor/README.md](../../databricks-agents/supervisor/README.md) | "PulsePlay Supervisor Agent for Databricks Mosaic AI" | Inherited inherited. Content is Mosaic-AI-deployment-shaped and largely valid. | log_and_deploy.py, agent.py | **Retitle** to "PulsePlay Supervisor Agent" |

### 7.2 Recommended new doc structure

```
docs/
  README.md                                  ← navigator (does not exist)
  MULTI_BI_ARCHITECTURE.md                   ← keep — defining design
  ROADMAP.md                                  ← keep
  PULSEPLAY_ARCHITECTURE.md                  ← NEW — replaces inherited PepPulse-titled ARCHITECTURE.md
  PULSEPLAY_SECURITY.md                      ← NEW — replaces inherited SECURITY_REVIEW.md
  PULSEPLAY_API_AUTH.md                      ← NEW — replaces inherited API_AUTH_AND_LIMITATIONS.md
  PULSEPLAY_QUALITY.md                       ← NEW — replaces inherited QUALITY_METHODOLOGY.md
  CPG_FMCG_BLUEPRINT.md                      ← keep CPG_FMCG_ENTERPRISE_BLUEPRINT.md (rename for clarity)
  ENTERPRISE_GUARDRAILS.md                   ← keep ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md (rename)
  CONTROL_FEASIBILITY.md                     ← keep CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md (rename)
  FUNCTIONAL_COVERAGE.md                     ← keep FUNCTIONAL_COVERAGE_ASSESSMENT.md (rename)
  E2E_GAP_REVIEW_INITIAL.md                  ← keep
  E2E_REVIEW_SUB_AGENT.md                    ← keep
  adr/
    0001-supervisor-stagger-2000ms.md        ← REWRITTEN from 0003 with current value
    0002-proxy-dual-bind.md                  ← extracted from inherited 0002 — applies
    0003-bi-adapter-vendor-contract.md       ← NEW — document the BIAdapter design
    0004-supervisor-local-vs-mosaic.md       ← NEW — document the two paths
  inherited/
    PepPulse-ARCHITECTURE.md                 ← inherited, archived
    PepPulse-SECURITY_REVIEW.md
    PepPulse-ENTERPRISE_READINESS.md
    PepPulse-API_AUTH_AND_LIMITATIONS.md
    PepPulse-BEAST_MODE_MEMORY.md
    PepPulse-QUALITY_METHODOLOGY.md
    PepPulse-ANALYTICS_DOMAIN_TAXONOMY.md
    PepPulse-INSIGHTS_SECTION_TAXONOMY.md
    PepPulse-ADR-0001-xhr-only-genie-client.md
    PepPulse-ADR-0004-format-pane-json-string-storage.md
    PepPulse-ADR-0005-two-tier-insights-cache.md
    PepPulse-ADR-0006-trend-pill-allowlist.md
    PepPulse-ADR-0007-backend-adapter-abstraction.md
  research/
    CODEBASE_AUDIT.md                        ← THIS FILE
    PROJECT_REVIEW.md                        ← move from docs/
    PULSEPLAY_CPG_REVIEW.md                  ← move from docs/
```

This pattern explicitly separates "PulsePlay current truth", "PulsePlay target state", and "Pulse heritage notes."

---

## 8. Naming consistency audit

### 8.1 Where each name appears

**`Pulse`** (Pulse the Power BI custom visual sibling):
- Implicit in inherited PepPulse references (the renaming Pulse↔PepPulse is internal — see CLAUDE.md heritage list).

**`PulsePlay`** (this project):
- README.md, CLAUDE.md, MULTI_BI_ARCHITECTURE.md, package.json (playground), PROJECT_REVIEW.md, all the new external-LLM review docs, App.tsx file headers and brand label.

**`the sister project`** (Data with Determination — the parent repo of Pulse):
- Found in 14 files via grep. Examples:
  - [README.md:16](../../README.md#L16) and several other README references — context: "the sister Pulse project"
  - [CLAUDE.md](../../CLAUDE.md) — multiple references in the heritage discussion
  - [docs/MULTI_BI_ARCHITECTURE.md:154](../MULTI_BI_ARCHITECTURE.md#L154) — "(copied from the sister project)"
  - [playground/src/App.tsx:14, 38](../../playground/src/App.tsx#L14) — comments
  - [playground/src/components/AISidebar.tsx:11, 47](../../playground/src/components/AISidebar.tsx#L11) — comments
  - [playground/vite.config.ts:6](../../playground/vite.config.ts#L6) — "sister Pulse project's UniBridge AI Proxy"
  - [databricks-agents/supervisor/agent.py:1](../../databricks-agents/supervisor/agent.py#L1) — "PulsePlay Multi-Domain Supervisor Agent"
  - [databricks-agents/supervisor/README.md:1](../../databricks-agents/supervisor/README.md#L1) — title
  - [databricks-agents/supervisor/log_and_deploy.py:2](../../databricks-agents/supervisor/log_and_deploy.py#L2) — module docstring
  - [scripts/llm_onboard.py, llm_wrapup.py](../../scripts/llm_onboard.py) — `.the sister project-session.state.json` filename
  - [proxy/server.js:3181](../../proxy/server.js#L3181) — comment example
  - [proxy/app.yaml:20](../../proxy/app.yaml#L20) — `SUPERVISOR_AGENT_NAME` value
  - [proxy/config.example.json:81-84](../../proxy/config.example.json#L81-L84) — sample profile

**`UniBridge`** (older internal name):
- [proxy/package.json:2](../../proxy/package.json#L2) — `"name": "unibridge-ai-proxy"`
- [proxy/package.json:4](../../proxy/package.json#L4) — `description`
- [proxy/server.js:5](../../proxy/server.js#L5) — file header
- [proxy/server.js:122, 238](../../proxy/server.js#L122) — `agentName` env default `"UniBridge AI Supervisor"`
- [proxy/server.js:3444](../../proxy/server.js#L3444) — synthesis system prompt identity statement
- [proxy/server.js:4218, 4229](../../proxy/server.js#L4218) — startup log lines
- [proxy/config.example.json:70](../../proxy/config.example.json#L70) — example `agentName`
- [docs/ARCHITECTURE.md:14, 16, 44, 499](../ARCHITECTURE.md#L14)
- [playground/vite.config.ts:6](../../playground/vite.config.ts#L6)
- [proxy/package-lock.json:2, 8](../../proxy/package-lock.json#L2)

**`PepPulse`** (older Pulse name):
- [docs/ARCHITECTURE.md:1](../ARCHITECTURE.md#L1) — title
- [docs/SECURITY_REVIEW.md:1](../SECURITY_REVIEW.md#L1) — title
- [docs/ENTERPRISE_READINESS.md:1](../ENTERPRISE_READINESS.md#L1) — title
- [docs/API_AUTH_AND_LIMITATIONS.md:1](../API_AUTH_AND_LIMITATIONS.md#L1) — title
- [docs/QUALITY_METHODOLOGY.md:5](../QUALITY_METHODOLOGY.md#L5)
- [docs/BEAST_MODE_MEMORY.md:13](../BEAST_MODE_MEMORY.md#L13)
- [docs/PROJECT_REVIEW.md:88](../PROJECT_REVIEW.md#L88) — review-doc reference

**`unibridge-ai-proxy`** (literal package name):
- [proxy/package.json:2](../../proxy/package.json#L2)
- [proxy/package-lock.json:2, 8](../../proxy/package-lock.json#L2)

**`pulseplay-supervisor-agent`** (literal endpoint name):
- See section 5.2 above — appears in databricks-agents/supervisor/* + proxy/config.example.json + proxy/server.js + proxy/app.yaml

**`genieChatVisual`** (the Pulse visual source dir in the sister project):
- 14 files via grep. Examples:
  - [CLAUDE.md](../../CLAUDE.md) — heritage references
  - [docs/adr/0001, 0005, 0007](../adr/0001-xhr-only-genie-client.md) — ADRs that point at file paths in genieChatVisual
  - [docs/INSIGHTS_SECTION_TAXONOMY.md, ANALYTICS_DOMAIN_TAXONOMY.md](../INSIGHTS_SECTION_TAXONOMY.md)
  - [docs/SECURITY_REVIEW.md, ENTERPRISE_READINESS.md](../SECURITY_REVIEW.md)
  - [scripts/release-check.ps1, smoke-full.ps1, llm_wrapup.py](../../scripts/release-check.ps1)
  - [proxy/lib/insightsValidator.js:4](../../proxy/lib/insightsValidator.js#L4) — module header
  - [proxy/tests/insightsValidator.test.js](../../proxy/tests/insightsValidator.test.js)
  - [docs/BEAST_MODE_MEMORY.md](../BEAST_MODE_MEMORY.md)

**`test-superuser-genie-powerbi`** (literal Databricks app name):
- [scripts/Deploy-DatabricksApp.ps1:2-3](../../scripts/Deploy-DatabricksApp.ps1#L2-L3)
- [proxy/README.databricks-app.md:7](../../proxy/README.databricks-app.md#L7)
- [proxy/app.yaml](../../proxy/app.yaml) — uses prefix `test_SuperUser` at line 4

### 8.2 Recommendation: canonical naming

| Concept | Canonical name | Replace |
|---|---|---|
| The npm package | `@pulseplay/proxy` (or `pulseplay-proxy`) | `unibridge-ai-proxy` |
| The startup banner | `PulsePlay Proxy` | `UniBridge AI Proxy` |
| The default supervisor display | `PulsePlay Supervisor` | `UniBridge AI Supervisor`, `PulsePlay Supervisor` |
| The example endpoint name | `pulseplay-supervisor-agent` | `pulseplay-supervisor-agent` |
| The Databricks app name | `pulseplay-proxy-app` | `test-superuser-genie-powerbi` |
| The session state file | `.pulseplay-session.state.json` | `.the sister project-session.state.json` (CLAUDE.md already flags this) |
| The headers | Keep `X-Genie-Key` / `X-Databricks-*` ONLY for backward compat with Pulse — add neutral alternatives `X-PulsePlay-Key` / `X-Backend-*` | n/a |

The CONFIG_PATH is correctly already `proxy/config.json`, no rename needed there.

A single rename PR would touch: `proxy/package.json`, `proxy/package-lock.json` (regenerate), `proxy/server.js` (3-5 strings), `proxy/config.example.json`, `proxy/app.yaml`, `proxy/README.databricks-app.md`, `databricks-agents/supervisor/*` (5 files), `scripts/Deploy-DatabricksApp.ps1`, `scripts/llm_onboard.py`, `scripts/llm_wrapup.py`. Doc retitles separate.

---

## 9. Security concerns visible from code

These are the real, code-located security issues — line-cited. Severity is operator-judgement.

| # | Issue | Location | Severity | Notes |
|---|---|---|---|---|
| 9.1 | **Wildcard CORS `Access-Control-Allow-Origin: *`** | [server.js:1069](../../proxy/server.js#L1069) | High for production | Justified for "PBI Desktop WebView" but PulsePlay does not run in a WebView. Any malicious origin can call the proxy from a user's browser. |
| 9.2 | **Anonymous-by-default proxy mode** | [server.js:1089](../../proxy/server.js#L1089) | High for any non-localhost deployment | When `sharedKey` is unset, every protected route is open. Combined with wildcard CORS = open proxy. |
| 9.3 | **Inline credentials in default `override` mode for local dev** | [server.js:484](../../proxy/server.js#L484) | Medium | Local dev defaults to `override` so any caller can paste host/token/spaceId headers and override the proxy's config. Auto-flips to `off` only when `PROXY_SHARED_KEY` or `WEBSITE_SITE_NAME` env vars are set. A non-Azure container deploy with no shared key configured would inherit `override` — security footgun. |
| 9.4 | **Generic-iframe accepts arbitrary URLs** | [generic-iframe/index.ts:55-57](../../bi-adapters/generic-iframe/index.ts#L55-L57) | Medium for any internet-facing deploy | No allowlist, no domain check. The user pastes a URL via [EmbedConfigForm.tsx:36-46](../../playground/src/components/EmbedConfigForm.tsx#L36-L46), the adapter sets `iframe.src = url`. Risks: SSRF if proxied later, clickjacking, malicious internal URLs (though sandbox attribute mitigates), phishing-via-tab on the user's own session. |
| 9.5 | **Sandbox is loose by default** | [generic-iframe/index.ts:61](../../bi-adapters/generic-iframe/index.ts#L61) | Medium | `allow-scripts allow-same-origin allow-forms allow-popups`. `allow-same-origin` + `allow-scripts` = the iframe content can read storage / cookies of its origin. For a hostile URL pasted by the user, this is a window of attack against any same-origin assets the user happens to be authenticated to. |
| 9.6 | **No frame-ancestors / CSP enforcement** | repo-wide; nothing in proxy or playground sets these | Medium | The proxy never sets `Content-Security-Policy` or `X-Frame-Options`. Vite dev server doesn't add them. Production deployment must add these at the reverse-proxy/CDN level. |
| 9.7 | **`X-Frame-Options` not set** | [server.js (no occurrence)](../../proxy/server.js) | Low | Same as 9.6. The proxy is a JSON API — clickjacking is less relevant for the API itself, more for the playground frontend. |
| 9.8 | **Source maps shipped to production** | [vite.config.ts:24](../../playground/vite.config.ts#L24) | Low | `sourcemap: true` in production build. Reveals component names, file paths, original variable names. Acceptable for internal apps; poor for public hosting. |
| 9.9 | **Profile token stored in plaintext config.json on disk** | [config.example.json](../../proxy/config.example.json) | High in non-vault deployments | `config.json` is gitignored ([.gitignore:13](../../.gitignore#L13)) but lives on the proxy host's filesystem in plain text. PAT = full workspace access. The PAT-warning at [server.js:4239-4248](../../proxy/server.js#L4239-L4248) is a startup banner; it does not block startup. |
| 9.10 | **DML enforcement is regex-only** | [sqlExecutor.js:108-127](../../proxy/lib/sqlExecutor.js#L108-L127) | Medium | Already discussed — see section 2.8. Acceptable for low-risk demo; not sufficient for governed enterprise. |
| 9.11 | **`enrichQueryResults` can fetch ANY query result for any conversation+message_id** | [server.js:1750-1799](../../proxy/server.js#L1750-L1799) | Low — defended by upstream Genie auth | The proxy doesn't check that the conversation belongs to the requesting user. It just forwards the GET to Databricks Genie. Genie itself enforces space-scoped access using the proxy's PAT/SP. So the per-user check happens at Databricks. With a shared PAT, all proxy users effectively share one identity at Genie — not a per-user RBAC boundary. Documented honestly in [docs/SECURITY_REVIEW.md](../SECURITY_REVIEW.md) (inherited) and [smoke-rls-ols.ps1](../../scripts/smoke-rls-ols.ps1). |
| 9.12 | **The fanout supervisor does NOT validate helper output** | [server.js:3577](../../proxy/server.js#L3577) | Medium | `Promise.allSettled` returns whatever the helper Genie space said. The output sanitisation (`sanitizeHelperAnswer` at [server.js:3413-3416](../../proxy/server.js#L3413-L3416)) only neutralises three injection markers (`[MANDATORY]`, `[Context]`, ```). A more sophisticated prompt-injection from a compromised helper space (different markers, unicode tricks) would slip through into the synthesis prompt. |
| 9.13 | **Profile listing exposes profile names + masked spaceId** | [server.js:1516-1536](../../proxy/server.js#L1516-L1536) | Low | The endpoint `GET /assistant/profiles` is rate-limited and shared-key-gated, but when shared-key is unset (default), anyone reachable on the network can enumerate all profiles. Useful reconnaissance for an attacker. |
| 9.14 | **Embed token issuance routes do not exist yet** | [README.md:46](../../README.md#L46), [ROADMAP.md v0.2.0](../ROADMAP.md) | Blocker for production | `/api/powerbi/embed-token`, `/api/tableau/trusted-ticket`, `/api/qlik/auth`, `/api/looker/signed-url` are all roadmap-only. The first real-vendor adapter cannot ship securely without one of them. |
| 9.15 | **PII redaction may miss non-Western patterns** | [server.js:2043-2044](../../proxy/server.js#L2043-L2044) | Low | `EMAIL_REDACT_RE` and `PHONE_REDACT_RE` are reasonable for ASCII English. International phone formats and unicode-domain emails may slip through. |
| 9.16 | **Audit log is `console.log` only, no rotation, no SIEM** | [server.js:1261](../../proxy/server.js#L1261) | High for compliance posture | Already discussed — see section 2.12. |
| 9.17 | **Confidence Phase-2 sends a follow-up to Genie WITHOUT user re-authorisation** | [server.js:3746-3750](../../proxy/server.js#L3746-L3750) | Low — same trust model as the main path | The Phase-2 follow-up message uses the same conversation context. Cost is per-call. A misbehaving client can spam `/confidence` to issue Genie follow-ups indirectly. Rate-limited at [server.js:1140](../../proxy/server.js#L1140) but otherwise unbounded. |
| 9.18 | **`/admin/query-history` returns SQL text up to 200KB per row** | [server.js:1402-1404](../../proxy/server.js#L1402-L1404) | Low | If an analyst running queries embeds sensitive data in SQL comments (don't laugh), this surfaces it. Truncation at 200KB is a generous cap. |
| 9.19 | **Token cap on inline header values is 256 chars** | [server.js:393, 418](../../proxy/server.js#L393) | Low | Most PATs fit. The cap is documented intent. Overly long PATs from a future Databricks model would be rejected silently. |
| 9.20 | **No CSRF protection on POST routes** | server-wide | Low (with strict CORS) — High (with wildcard CORS) | Wildcard `Access-Control-Allow-Origin: *` plus no CSRF token = any malicious page can issue cross-origin POSTs from a victim's browser, with credentials if the proxy uses cookies. The proxy does NOT use cookies; it uses headers (X-Genie-Key, X-Assistant-Profile, etc.) which are not auto-forwarded by the browser, so CSRF risk is mostly theoretical. But this is not by design — it's by accident of the auth model. |

---

## 10. Technical debt list

Concrete debt items, severity-tagged. Cited.

| # | Item | Severity | Reason | Recommended fix |
|---|---|---|---|---|
| 10.1 | `proxy/server.js` is 4,298 lines — a single file holding 30 routes, 8 backends, audit, redaction, OAuth, rate limiting, fan-out engine, prompts, schemas, demo data | **High** | Maintenance, review difficulty, conflict-merging, hard-to-find code | Extract route handlers into `proxy/routes/{assistant,openai,bedrock,foundation,supervisor,sql,history,admin}.js`; keep server.js as the wire-up + middleware. ~500 lines feasible. |
| 10.2 | Two SigV4 signers — one inline in [server.js:2828-2843](../../proxy/server.js#L2828-L2843) for `bedrockRetrieveAndGenerate`, one in [lib/bedrock.js:62-91](../../proxy/lib/bedrock.js#L62-L91) for `bedrockInvokeModel` | **High** | A bug fix to one will not propagate; cross-version drift inevitable | Migrate the inline `bedrockRetrieveAndGenerate` in server.js to call `lib/bedrock.js:bedrockRetrieveAndGenerate` exported function. Already exists. Just rewire the route handler. |
| 10.3 | `LEGACY_DEMO_SCHEMAS` SuperStore-baked-in ([server.js:3263-3302](../../proxy/server.js#L3263-L3302)) | **High** | Demo data shapes leak into "agnostic" code paths; new deployments inherit it as a fallback | Remove. Force config-driven `profile.schemaContext`. If no schema configured, supervisor synthesis returns a clear error rather than hallucinating from the SuperStore demo schema. |
| 10.4 | `LEGACY_DEMO_SYNTHETIC_FIELDS` SuperStore-baked-in ([server.js:3605-3608](../../proxy/server.js#L3605-L3608)) | **Medium** | Same pattern — config example exists at [config.example.json:63-66](../../proxy/config.example.json#L63-L66) | Remove the legacy fallback. |
| 10.5 | `scrubInternalJargon()` is a workaround ([server.js:3384-3391](../../proxy/server.js#L3384-L3391)) | **Medium** | The synthesis LLM emits "Genie space" output despite explicit prompt instructions. Regex output rewriting is brittle. | Switch synthesis to structured output (a JSON schema response) and re-render to markdown — same pattern as `foundationModelClient.js:RESPONSE_SCHEMAS`. |
| 10.6 | AISidebar reads `data.message?.content` ([AISidebar.tsx:77](../../playground/src/components/AISidebar.tsx#L77)) which is the wrong key for every backend | **Blocker for v0 demo** | The displayed answer is always the placeholder; nobody sees real responses | Fix to read `data.content` (synchronous backends) AND poll `/assistant/conversations/:cid/messages/:mid` for Genie. |
| 10.7 | The "supervisor poll" route is a stub ([server.js:4167-4178](../../proxy/server.js#L4167-L4178)) | **Medium** | Returns a placeholder string regardless of the conversation. Any client that polls supervisor messages instead of reading the start response gets garbage. | Either: A) change supervisor to enqueue async + real polling; B) document the contract clearly that supervisor is synchronous-only and clients must read content from `/start`. |
| 10.8 | ADR-0003 "supervisor stagger 800ms" is stale ([adr/0003-supervisor-stagger-800ms.md](../adr/0003-supervisor-stagger-800ms.md)) | **Low** but misleading | Code is 2000ms; ADR says 800ms. Future contributors will trust the ADR over the code. | Update the ADR (or replace per section 7 reorg). |
| 10.9 | Vendor adapters PowerBI/Tableau/Qlik/Looker are stubs ([powerbi/index.ts:17-25](../../bi-adapters/powerbi/index.ts#L17-L25) and siblings) | **Blocker for product narrative** | The README claims the project hosts "any BI tool" but only generic-iframe is real | Pick one (Power BI, since the sister project already has the workspace) and graduate it. Documented in [ROADMAP.md v0.2.0](../ROADMAP.md). |
| 10.10 | EmbedConfigForm is one URL field for every vendor ([EmbedConfigForm.tsx:36-46](../../playground/src/components/EmbedConfigForm.tsx#L36-L46)) | **Medium** | Cannot supply embed token + workspace ID + report ID for PBI; cannot supply trusted ticket for Tableau; cannot supply OAuth params for Qlik | Per-vendor `EmbedConfigForm<vendor>` components, dispatched by active vendor. |
| 10.11 | Playground has zero tests | **High** | [package.json:12](../../playground/package.json#L12) declares vitest but no test files exist. No regression net for any component change. | Add `App.test.tsx`, `BIPanel.test.tsx`, `AISidebar.test.tsx`, `ConnectorPicker.test.tsx`, `registry.test.ts`. Per [PROJECT_REVIEW.md:73-76](../PROJECT_REVIEW.md#L73-L76) suggestion. |
| 10.12 | `release-check.ps1` references `.pbiviz` and a missing `build.ps1` ([release-check.ps1:22-26](../../scripts/release-check.ps1#L22-L26), [126](../../scripts/release-check.ps1#L126)) | **Medium** | This script will fail in PulsePlay. Inherited sister-project release gate. | Rewrite for PulsePlay: `npm run build` in playground + `npm test` in proxy + smoke. Drop the .pbiviz packaging step. |
| 10.13 | `Deploy-DatabricksApp.ps1` requires a missing `databricks.yml` for default mode ([Deploy-DatabricksApp.ps1:15](../../scripts/Deploy-DatabricksApp.ps1#L15)) | **Medium** | Default invocation will fail. The `-WorkspaceSource` flag works. | Add `databricks.yml` bundle definition OR change the script's default to `-WorkspaceSource`. |
| 10.14 | `Check-Credentials.ps1` targets PBIP demo files that don't exist ([Check-Credentials.ps1:3-4](../../scripts/Check-Credentials.ps1#L3-L4)) | **Low** | Useless in PulsePlay. | Delete or rewrite to grep `proxy/config.json`-shaped files. |
| 10.15 | `accuracy_audit.py` is broken — hardcoded host + warehouse + reads `proxy/config.json["profiles"]["sales"]["token"]` ([accuracy_audit.py:16-23](../../scripts/accuracy_audit.py#L16-L23)) | **Low** | Useless in PulsePlay without manual edits. | Delete (it's a sister-project artifact) or generalise via env vars. |
| 10.16 | `LEGACY_DEMO_*` ops/customer cross-domain divergence note hardcoded ([server.js:3369-3374](../../proxy/server.js#L3369-L3374)) | **Medium** | Only fires for profiles named exactly `ops` and any other — Pulse demo specific. Customers with different naming get no note even if their data has the same divergence. | Replace with config-driven `supervisorProfile.crossDomainNotes` (already supported at [server.js:3362-3367](../../proxy/server.js#L3362-L3367)). Remove the `else` branch hardcoded note. |
| 10.17 | `proxy/package.json` description still says "for routing **Power BI** questions" ([package.json:4](../../proxy/package.json#L4)) | **Low** | Misrepresents the project | Rewrite. |
| 10.18 | Validator framework section titles ("RECOMMENDED ACTIONS", "RISKS", "TRENDS"…) are Pulse-specific ([insightsValidator.js:270-279](../../proxy/lib/insightsValidator.js#L270-L279)) | **Medium** | The validators only fire for these section titles. PulsePlay-shaped prompts that ask for different sections get no validation. | Make the validator title set extensible per-profile. |
| 10.19 | Foundation Model presets render as "## RECOMMENDED ACTIONS" / "## RISKS" / "## OPPORTUNITIES" markdown ([foundationModelClient.js:264, 275, 286](../../proxy/lib/foundationModelClient.js#L264)) | **Medium** | Same heritage — assumes downstream renderer expects those exact section headings | Make the section heading parameterisable. |
| 10.20 | Proxy package name is `unibridge-ai-proxy` ([proxy/package.json:2](../../proxy/package.json#L2)) | **High** for project identity | Confuses contributors and external reviewers | Rename to `pulseplay-proxy` (with package-lock.json regen). |
| 10.21 | `proxy/server.js` opens TWO HTTP servers (IPv4 + IPv6 dual-bind) for non-Databricks-Apps mode ([server.js:4226-4256](../../proxy/server.js#L4226-L4256)) — fine on Windows, but on Linux container deployments behind a reverse proxy this is unnecessary | **Low** | Wasted resources on production hosts that bind by hostname | Disable IPv6 bind when `process.env.DATABRICKS_APP_PORT` or `process.env.PORT` is set. Already partly handled — see Databricks Apps branch at [server.js:4214-4221](../../proxy/server.js#L4214-L4221). |
| 10.22 | OpenAI/Bedrock/Foundation routes do NOT use `resolveProfile()` — they have their own `resolveOpenAiProfile()`, `resolveBedrockProfile()`, `resolveFoundationModelProfile()` ([server.js:2606, 2789, 3053](../../proxy/server.js#L2606)) | **Medium** | Code duplication. Inline-credentials + Wave 36 mode-resolution logic is bypassed for these backends. So a "fallback" inline-credentials caller cannot use OpenAI/Bedrock/Foundation profiles in fallback mode — only the Genie-shaped routes do. | Unify under `resolveProfile()` — add a "backend type" predicate as a parameter. |
| 10.23 | `enrichQueryResults` does not handle the case where a profile is supervisor-local and `targetSpaceId === 'supervisor-local'` ([server.js:1750](../../proxy/server.js#L1750)) | **Low** | The supervisor-local conversation map stores `'supervisor-local'` as spaceId ([server.js:3892](../../proxy/server.js#L3892)). Polling that conversation will throw a Databricks 404. | Handle supervisor-local in the poll route: serve from cache or redirect to /supervisor poll endpoint. |
| 10.24 | Conversation cache `conversationMap` is in-process only ([server.js:307](../../proxy/server.js#L307)) | **Medium** | A multi-instance deployment behind a load balancer cannot route polls to the right instance. Also lost on restart. | Externalise to Redis / shared store before scaling out. |
| 10.25 | `openAiConversationHistory` and `bedrockSessionMap` are also in-process maps with TTL ([server.js:2586, 2787](../../proxy/server.js#L2586)) | **Medium** | Same scale-out problem | Externalise. |

---

## 11. Recommendations

### 11.1 Stays as-is (production-quality despite heritage)

- The `BIAdapter` interface ([BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts)) — well-shaped contract. No change.
- `BIPanel` generic host ([BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx)) — clean, idempotent, no change.
- `BIRegistry` lazy adapter loader ([registry.ts](../../playground/src/biPanel/registry.ts)) — good.
- `lib/bedrock.js` SigV4 implementation ([bedrock.js](../../proxy/lib/bedrock.js)) — keep, but migrate the inline `RetrieveAndGenerate` in server.js to call this lib (debt 10.2).
- `lib/foundationModelClient.js` ([foundationModelClient.js](../../proxy/lib/foundationModelClient.js)) — clean, well-tested.
- `lib/sqlExecutor.js` core executor ([sqlExecutor.js](../../proxy/lib/sqlExecutor.js)) — fine.
- `lib/sqlSectionPreview.js` ([sqlSectionPreview.js](../../proxy/lib/sqlSectionPreview.js)) — fine.
- OAuth M2M token resolution ([server.js:637-696](../../proxy/server.js#L637-L696)) — well-engineered with single-flight + early-refresh + LRU cap.
- Service-Principal hashing ([server.js:729-738](../../proxy/server.js#L729-L738)) — good privacy practice.
- The 12-file proxy test suite — well-aimed, ~395 invocations.

### 11.2 Refactor (priority order)

| Pri | Item | Debt # | Why now |
|---|---|---|---|
| 1 | Fix `AISidebar` answer-loop bug (read `data.content`, add Genie poll) | 10.6 | The product is fundamentally broken without this — every demo shows the placeholder string |
| 2 | Rename `unibridge-ai-proxy` → `pulseplay-proxy` and update server.js startup banner + agentName defaults | 10.17, 10.20 | Identity hygiene; touches few files; high signal |
| 3 | Update ADR-0003 (or rewrite ADR set per section 7.2) | 10.8 | Future contributors trust ADRs |
| 4 | Add playground tests (vitest + @testing-library/react) | 10.11 | Without this, every component change risks regression |
| 5 | Graduate ONE BI adapter to real (Power BI most likely) | 10.9 | Product narrative requires it |
| 6 | Per-vendor `EmbedConfigForm` | 10.10 | Required for the real adapter |
| 7 | Remove `LEGACY_DEMO_SCHEMAS` and `LEGACY_DEMO_SYNTHETIC_FIELDS` | 10.3, 10.4 | Demo data leaks into agnostic paths |
| 8 | Extract route handlers from server.js | 10.1 | Maintenance |
| 9 | Migrate inline RetrieveAndGenerate to lib/bedrock.js | 10.2 | Drift prevention |
| 10 | Unify profile-resolution helpers | 10.22 | Inline-credentials parity across backends |
| 11 | Add `databricks.yml` OR fix `Deploy-DatabricksApp.ps1` default | 10.13 | Deployment story |
| 12 | Rewrite `release-check.ps1` for PulsePlay (drop .pbiviz, drop missing build.ps1) | 10.12 | Local release gate |

### 11.3 Delete

- [scripts/Check-Credentials.ps1](../../scripts/Check-Credentials.ps1) — targets PBIP files that don't exist.
- [scripts/accuracy_audit.py](../../scripts/accuracy_audit.py) — hardcoded Pulse host + warehouse.
- [docs/adr/0001-xhr-only-genie-client.md](../adr/0001-xhr-only-genie-client.md) — does not apply to PulsePlay.
- [docs/adr/0004-format-pane-json-string-storage.md](../adr/0004-format-pane-json-string-storage.md) — Pulse PBI custom visual specific.
- [docs/adr/0005-two-tier-insights-cache.md](../adr/0005-two-tier-insights-cache.md) — Pulse visual specific.
- [docs/adr/0006-trend-pill-allowlist.md](../adr/0006-trend-pill-allowlist.md) — Pulse visual specific.
- [docs/adr/0007-backend-adapter-abstraction.md](../adr/0007-backend-adapter-abstraction.md) — references genieChatVisual which doesn't exist here.
- [docs/PULSEPLAY_CPG_REVIEW.md](../PULSEPLAY_CPG_REVIEW.md) — marketing voice; archive at most.
- [proxy/smoke_test.ps1](../../proxy/smoke_test.ps1) — superseded by [scripts/smoke-full.ps1](../../scripts/smoke-full.ps1); duplicates with worse polling logic.

### 11.4 Archive to docs/inherited/

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (PepPulse-titled)
- [docs/SECURITY_REVIEW.md](../SECURITY_REVIEW.md) (PepPulse-titled)
- [docs/ENTERPRISE_READINESS.md](../ENTERPRISE_READINESS.md) (PepPulse-titled)
- [docs/API_AUTH_AND_LIMITATIONS.md](../API_AUTH_AND_LIMITATIONS.md) (PepPulse-titled — but rewrite the relevant content into `docs/PULSEPLAY_API_AUTH.md` first; this one has the most reusable material)
- [docs/BEAST_MODE_MEMORY.md](../BEAST_MODE_MEMORY.md) (PepPulse-titled, references files that don't exist in PulsePlay)
- [docs/QUALITY_METHODOLOGY.md](../QUALITY_METHODOLOGY.md) (claims test counts that are not PulsePlay's)
- [docs/ANALYTICS_DOMAIN_TAXONOMY.md](../ANALYTICS_DOMAIN_TAXONOMY.md) (research bibliography pointing at genieChatVisual)
- [docs/INSIGHTS_SECTION_TAXONOMY.md](../INSIGHTS_SECTION_TAXONOMY.md) (research bibliography pointing at genieChatVisual)

### 11.5 Document explicitly

- The `validateCompositeResponse` heritage ↔ Pulse (`## SECTION HEADINGS`) coupling. Any new connector that wants to use the validator framework needs to know it's section-title-keyed.
- The `LEGACY_DEMO_SCHEMAS` and `LEGACY_DEMO_SYNTHETIC_FIELDS` for as long as they remain — flag clearly that new profiles must set `profile.schemaContext` and `profile.syntheticIndicators`.
- The two SigV4 signers (server.js inline + lib/bedrock.js) — until they're unified.
- The supervisor-local stagger value 2000ms — replace ADR-0003 with one that names the current value.

---

## 12. Notable items the existing review docs missed or understated

The 6 commissioned external-LLM review docs are generally honest but have specific blind spots:

| What they got right | What they missed |
|---|---|
| `PROJECT_REVIEW.md` correctly flags vendor adapters as stubs and AISidebar as submit-only | **Did not catch the `data.message?.content` field-name bug** at [AISidebar.tsx:77](../../playground/src/components/AISidebar.tsx#L77) — the AI never displays a real answer |
| `E2E_GAP_REVIEW_INITIAL.md` flags wildcard CORS and inline credentials | **Did not catch ADR-0003 stagger drift (800ms doc vs 2000ms code)** |
| `FUNCTIONAL_COVERAGE_ASSESSMENT.md` has a clean status matrix | **Did not enumerate all 8 backends** — listed 5 ("Genie, supervisor, OpenAI, Bedrock, foundation"); supervisor-local + supervisor-real are genuinely different code paths and the analytics-mode + chat-only OpenAI paths are also distinct |
| `CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md` is the most useful — paired current-state vs target-state | **Did not flag the two-SigV4-signer drift** ([server.js:2828-2843](../../proxy/server.js#L2828-L2843) vs [lib/bedrock.js:62-91](../../proxy/lib/bedrock.js#L62-L91)) |
| `PROJECT_REVIEW.md` calls out naming chaos | **Understated** — PROJECT_REVIEW says "repo says PulsePlay, proxy says unibridge-ai-proxy, docs say PepPulse, scripts inherited sister-project names." Actually count: 8 files reference UniBridge, 14 files reference the sister project, 7 files have PepPulse in titles or bodies, 14 files reference genieChatVisual. The naming is more layered. |
| All reviews say "stub" for vendor adapters | **None point out** that all four PowerBI/Tableau/Qlik/Looker advertise the SAME `BICapabilities` (because they inherit `generic-iframe`'s) — meaning even the capability discovery surface is a no-op for them |
| `PULSEPLAY_CPG_REVIEW.md` calls PulsePlay "an architectural masterstroke" | **No code is cited.** Marketing voice in a project that says "no flaws / brutal honesty" in CLAUDE.md is misaligned. |
| Reviews mention the foundation-model client | **None analyse** that the structured-output renderers ([foundationModelClient.js:256-293](../../proxy/lib/foundationModelClient.js#L256-L293)) produce Pulse-shaped section markdown ("## RECOMMENDED ACTIONS", "## RISKS", "## OPPORTUNITIES") — making the foundation-model path useful only if your downstream parses those exact headings |
| Reviews note the LangGraph supervisor template | **None call out** that it's hardcoded to 4 SuperStore demo spaces with no extension hook |
| `E2E_GAP_REVIEW_INITIAL.md` correctly identifies "BI event trust" as a gap | **Does not name** that the AI sidebar `JSON.stringify`s up to 5 BI events into the user prompt as plaintext ([AISidebar.tsx:48-55](../../playground/src/components/AISidebar.tsx#L48-L55)) — that's the concrete prompt-injection vector |
| Reviews mention the supervisor-local engine | **None describe** the synthetic-event emission path for real-supervisor profiles ([server.js:3895-3946](../../proxy/server.js#L3895-L3946)) — the visual sees the same UX whether the agent is opaque or proxy-fanned-out, which is a lie at the protocol level |

---

## 13. Coverage / verification status

What was inspected:
- Every top-level directory walked.
- Every `.ts` / `.tsx` file in playground/src and bi-adapters read in full.
- Every `.js` file in proxy/lib read in full.
- proxy/server.js read in full (4,298 lines).
- All 8 docs in docs/ root that were directly referenced read at least partially. The four PepPulse-titled docs and the inherited research bibliographies read only enough to confirm titles + identity.
- All 7 ADRs read.
- Every script's first 10–30 lines read; the longer scripts (release-check.ps1, smoke-full.ps1) read partially.
- All 5 BI-adapter index.ts files read in full.
- databricks-agents/supervisor/agent.py + log_and_deploy.py + README.md + config.example.env + requirements.txt read in full.
- proxy/config.example.json + proxy/app.yaml + proxy/README.databricks-app.md read in full.

What was NOT done:
- No live test execution (`npm test`, `npm run lint`, `vitest`, `tsc`).
- No `databricks-agents/supervisor/deploy.ipynb` JSON cell-by-cell read — only grep results consulted.
- No `playground/index.html` content read.
- No `playground/src/styles.css` read (CSS is not load-bearing for this audit).
- No `proxy/package-lock.json` content read.
- The four PepPulse-titled long inherited docs (ARCHITECTURE 108KB, SECURITY_REVIEW 19KB, ENTERPRISE_READINESS 38KB, API_AUTH_AND_LIMITATIONS 28KB) read only the first 40 lines each — enough for identity classification.
- Did not enumerate every `it()` in the 12 test files; relied on aggregate count.

Items marked `[UNVERIFIED]` in the body should be confirmed before being used as input to any decision.

---

## 14. Audit summary (one paragraph)

PulsePlay v0.1.0 is exactly what its README admits it is: a thin React shell over a powerful Pulse-inherited proxy. The 2-axis abstraction (vendor × connector) is genuinely well-shaped at the BIAdapter contract level — but four of five vendor adapters are inheritance-stubs that do nothing different from the generic-iframe baseline, and the AI sidebar reads a wrong field name (`data.message?.content` vs `data.content`) that means the user always sees a placeholder, never a real LLM answer. The proxy is feature-rich (8 backend paths including Genie, OpenAI chat-only and analytics, Bedrock RAG and direct, Foundation Model, supervisor-local fan-out, supervisor real Mosaic agent) with serious engineering — OAuth M2M with single-flight, SP identity hashing, constant-time shared-key compare, Wave 36 inline-credentials precedence inversion, three-pass token redaction. But it's also a 4,298-line single file with two duplicate SigV4 signers, a stale ADR (0003 says 800ms stagger; code is 2000ms), demo-data leaks (`LEGACY_DEMO_SCHEMAS` baked in, `scrubInternalJargon` regex-rewrites synthesis output every call), Pulse-shaped validators (RECOMMENDED ACTIONS / RISKS / etc.), and 14 files referencing the parent project's `the sister project` name plus 7 docs still titled `PepPulse`. The naming is the symptom; the deeper issue is that the proxy was extracted, not refactored. Production-grade enterprise readiness — per the four external-LLM review docs and per direct code inspection — is at "partially implemented foundation," not deployable. The shortest path to something demo-grade is: (1) fix the AISidebar field-name bug, (2) rename to remove UniBridge/the sister project/PepPulse drift, (3) graduate the Power BI adapter to real, (4) remove `LEGACY_DEMO_*` fallbacks, (5) add playground tests. Everything else is creativity surface.
