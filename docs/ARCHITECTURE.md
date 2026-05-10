# PulsePlay Architecture

> **Status:** v0.1.0 scaffold. The architecture below is the contract; the implementation is partial — see `docs/research/CODEBASE_AUDIT.md` for the brutal-honest gap analysis at HEAD.
>
> **Scope:** internal-org enabler. Path C — inner-source-first, public-OSS-later. This doc is for engineers and architects working inside the org that owns PulsePlay.

## One sentence

PulsePlay is a React playground that hosts ANY BI tool as an embedded guest, with an AI assistant sidebar that reasons about whatever the user is currently looking at — connector-agnostic on the AI side, vendor-agnostic on the BI side.

## The 2-axis abstraction

PulsePlay's defining design decision is independence between two axes:

| Axis | What varies | Where it lives | Independence guarantee |
|---|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` | Switching vendors does not require any AI-side change |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types + routes | Switching connectors does not require any BI-side change |

Any cell of the matrix is valid:

|                          | Genie (Databricks) | Azure OpenAI | AWS Bedrock | Foundation Model | Supervisor |
|--------------------------|--------------------|--------------|-------------|------------------|------------|
| **Power BI**             | yes (Pulse pattern)| yes          | yes         | yes              | yes        |
| **Tableau**              | yes                | yes          | yes         | yes              | yes        |
| **Qlik Sense / View**    | yes                | yes          | yes         | yes              | yes        |
| **Looker**               | yes                | yes          | yes         | yes              | yes        |
| **Generic iframe**       | yes                | yes          | yes         | yes              | yes        |

The user picks both axes independently in the sidebar. Switching either does not disturb the other.

## How a BI vendor adapter works (Y-axis)

Every vendor adapter implements the [`BIAdapter`](../playground/src/biPanel/BIAdapter.ts) interface:

```typescript
interface BIAdapter {
    readonly vendor: string;
    readonly displayName: string;
    capabilities(): BICapabilities;
    mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void>;
    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void;
    send(command: BICommand): Promise<void>;
    destroy(): void;
}
```

The host does not care HOW the adapter renders the BI tool. Three common patterns:

1. **Iframe with URL** — generic-iframe, Looker (signed URL), Tableau (Embedding API can fall back), most BI tools' "embed link" feature. Adapter creates `<iframe src=...>`, sandboxes it, listens for `load` events.
2. **Vendor JS SDK + DOM container** — Power BI (`powerbi-client.embed`), Looker (`@looker/embed-sdk`). Adapter loads the SDK, calls `embed(container, config)`, wires SDK events to canonical `BIEvent` types.
3. **Web component** — Tableau Embedding API v3 (`<tableau-viz>`), Qlik Cloud (`<qlik-embed>`). Adapter loads the web-component script, creates the custom element, listens to its events.

The `BICapabilities` object lets each adapter advertise what it actually supports for THIS embed config so the AI sidebar can hide UI for unsupported actions. Don't show "Apply filter" if Tableau parameters aren't configured. Don't show "Export PNG" if the PBI embed token doesn't carry that scope.

### Status today

Every adapter except `generic-iframe` extends `GenericIframeAdapter` and just renders an iframe. No event bridge, no command bridge, no vendor SDK. v0.2 wires real SDKs (`powerbi-client`, Tableau Embedding API v3, `qlik-embed`, `@looker/embed-sdk`). Don't claim "Power BI integration" until that's done.

## Canonical event vocabulary

The host normalizes vendor-specific events into a small canonical set so the AI sidebar can reason across vendors:

| BIEventType | Power BI source | Tableau source | Qlik source | Looker source |
|---|---|---|---|---|
| `loaded` | `report.on('loaded')` | `firstinteractive` | `appOpened` | `dashboard:loaded` |
| `page-changed` | `report.on('pageChanged')` | `tabswitched` | `sheetChanged` | `dashboard:tile:rendered` |
| `filter-applied` | `report.on('filtersApplied')` | `filterchanged` | `selectionsChanged` | `dashboard:filters:changed` |
| `selection-made` | `report.on('dataSelected')` | (parametervaluechanged) | (selectionsChanged) | `drillmenu:click` |
| `data-refreshed` | `report.on('dataRefreshed')` | (refresh) | (data reloaded) | (n/a) |
| `error` | `report.on('error')` | `tableau:error` | `error` | `dashboard:error` |

The AI sidebar consumes these to build a "what is the user currently looking at?" context block prepended to every prompt — the same pattern as Pulse's `contextBuilder`, but sourced from BI vendor events instead of Power BI's DataView.

## Canonical command vocabulary

The host can issue `BICommand` instances back into the embedded view. Adapters implement what they can; unsupported commands return `BI_ERR.UNSUPPORTED_COMMAND`.

| BICommand kind | Use case |
|---|---|
| `navigate-to-page` | "Take me to the Sales tab" — voice / AI-driven navigation |
| `apply-filter` | "Filter region to East" — AI-driven exploration |
| `clear-filter` | Reset state |
| `refresh` | Force re-fetch from underlying source |
| `fullscreen` | Distraction-free mode |
| `export` | PNG / PDF / CSV (vendor-dependent) |

## How the AI connector axis works (X-axis, proxy/)

Independent of which BI tool is loaded, the AI sidebar talks to **one connector at a time**. Connector profiles are configured in `proxy/config.json` (or via `PROXY_PROFILE_*` env vars) and listed via `GET /assistant/profiles`. The user picks one in the `ConnectorPicker`; subsequent prompts include `assistantProfile: <name>` so the proxy routes to the right backend.

### Eight runtime backend paths

The `MULTI_BI_ARCHITECTURE.md` predecessor of this doc and the README claimed six. The 2026-05-10 codebase audit confirmed eight. Listed here in the order the proxy detects them, with the file:line that hosts each.

| # | Backend | Detection | Code path | Source |
|---|---|---|---|---|
| 1 | Databricks Genie (default) | profile has `spaceId`; `type` unset | `databricksRequest` to `/api/2.0/genie/spaces/...` | [server.js:1683-1711](../proxy/server.js#L1683) |
| 2 | Azure OpenAI (chat-only) | `profile.azureOpenAiEndpoint` present | `azureOpenAiRequest()` | [server.js:2614-2637](../proxy/server.js#L2614) |
| 3 | Azure OpenAI (analytics mode) | `profile.mode === 'analytics'` + schema/warehouse | `runAnalyticsOrchestrator` -> `orchestrateGroundedAnswer` | [server.js:2650-2724](../proxy/server.js#L2650) |
| 4 | AWS Bedrock RetrieveAndGenerate | `profile.bedrockKnowledgeBaseId` | `bedrockRetrieveAndGenerate` + `lib/bedrock.js` | [server.js:2805-2866](../proxy/server.js#L2805) |
| 5 | AWS Bedrock InvokeModel | `bedrockAccessKeyId` + `bedrockSecretAccessKey` | `bedrockInvokeModel` | [bedrock.js:154-214](../proxy/lib/bedrock.js#L154) |
| 6 | Mosaic AI Foundation Model | `profile.type === 'foundation-model'` + `foundationModelEndpoint` | `callFoundationModel` | [foundationModelClient.js:125-155](../proxy/lib/foundationModelClient.js#L125) |
| 7 | Supervisor (real Mosaic AI agent endpoint) | `profile.type === 'supervisor'` | inline `https.request` against `host + endpoint` | [server.js:4054-4078](../proxy/server.js#L4054) |
| 8 | Supervisor-local (proxy-side fan-out) | `profile.type === 'supervisor-local'` | `runLocalSupervisor` -> `askGenieProfile x N + synthesizeSupervisorAnswer` | [server.js:3509-3588](../proxy/server.js#L3509) |

Eight, not six. The README and prior architecture doc were wrong; this one is the corrected reference.

### The orchestrator

[`proxy/lib/llmOrchestrator.js`](../proxy/lib/llmOrchestrator.js) is the closest thing the proxy has to a connector-agnostic abstraction. 584 lines. Two functions matter: `orchestrateGroundedAnswer` (line 90) and `withRetryOnBadSql` (line 316).

**Where it's agnostic:** the handler accepts `callLlm: (messages) => Promise<string>` as a parameter — provider-specific LLM gets injected by the caller. So OpenAI vs Bedrock vs Foundation Model all share this pipeline. See [server.js:2441-2456](../proxy/server.js#L2441) for `_resolveCallLlmForProfile()` which wires the right call function.

**Where it's lakehouse-shaped:**

- Returns include `conversation_id`, `message_id`, `status: 'COMPLETED' | 'FAILED'`, `sqlQuery`, `queryResult` — the EXACT shape Genie returns. The orchestrator mimics Genie's contract so the visual / sidebar can read the same fields.
- `databricksRequest` is required as a parameter — meaning even when the LLM is Bedrock or OpenAI, the SQL still runs against a Databricks SQL warehouse. There is no abstraction for "execute SQL against Snowflake / BigQuery / Postgres / Spark Connect" today.
- The SQL system prompt hard-codes "for a Databricks SQL warehouse."

This is acceptable for the internal-org charter (the org is on Databricks). If the platform ever needs Snowflake/BigQuery/etc. as the SQL target, an additional layer of abstraction is needed.

### The supervisor-local fan-out island

`runLocalSupervisor` is a proxy-side multi-Genie orchestrator. The user prompt fans out to N helper Genie spaces in parallel; each response is collected, then a synthesis pass (typically Foundation Model or OpenAI) merges them into one answer. The stagger between fan-out requests is documented in [ADR-0003](adr/0003-supervisor-stagger-800ms.md) — note that the title says 800 ms but the actual code uses 2000 ms. Update pending.

This is the architectural ancestor of "cross-vendor single pane of glass" — the v0.5 roadmap item. The supervisor-local pattern proves the proxy can fan out and synthesize.

### The validator framework

[`proxy/lib/insightsValidator.js`](../proxy/lib/insightsValidator.js) is a JS mirror of Pulse's `genieChatVisual/src/insightsStageValidator.ts`. Pure shape-only validation: RECOMMENDED ACTIONS must have ≥3 numbered imperatives with numeric impact; RISKS must be ≥2 bulleted; HEADLINE must be paragraph not list; etc. When validation fails, the orchestrator can issue ONE auto-retry with strengthened prompt directives.

Status: ported but not yet wired into PulsePlay's AI sidebar. The sidebar today is submit-only (no Insights pipeline). Validation activates when the v0.3 pipeline lands.

## Connector profile shapes

Profile types inherited from the proxy's Pulse origin:

| Profile shape | What it talks to | Use case |
|---|---|---|
| (default — Genie) | Databricks Genie via `/api/2.0/genie/spaces/...` | NL-to-SQL on a single Genie space |
| `supervisor-local` | Multiple Genie spaces, proxy fans out + synthesizes | Cross-domain questions across spaces |
| `supervisor` | Real Databricks Mosaic AI Supervisor Agent serving endpoint | Same as above but server-side (better governance) |
| `foundation-model` | Mosaic AI Model Serving (Llama, Claude, etc.) via OpenAI-compatible chat-completions | Reasoning sections (RECOMMENDED ACTIONS, RISKS) where Genie's Chat mode is weak |
| Azure OpenAI (mode: `analytics`) | Azure OpenAI for SQL gen + narrative | Schema-aware NL-to-SQL pipeline |
| AWS Bedrock | Bedrock RetrieveAndGenerate or InvokeModel | Knowledge-base RAG or direct foundation model |

### Genie Agent Mode is UI-only

Inherited tripwire from Pulse: Databricks Genie's "Agent Mode" / `force_deep_research_planning` flag is silently ignored by the public REST API. Verified via 20+ probes in the Pulse cycle. The Foundation Model serving endpoint path (`/foundation/section`) is the workaround when you need agent-style reasoning over data. Don't claim "Genie Agent Mode" works through the proxy — it doesn't.

## Vocabulary leak items (cleanup pending)

The proxy was extracted from Pulse and the wires of that origin are still showing. These are surface-level naming items that need a sweep before public-OSS — not blocking for the internal-org charter but worth tracking:

- Package name is still `unibridge-ai-proxy`. Description says "for routing Power BI questions."
- Headers: `X-Genie-Key`, `X-Genie-Target-Host`, `X-Databricks-Host`, `X-Databricks-Token`, `X-Genie-Space-Id`. Five of six allowed CORS headers are Databricks-vocabulary; only `X-Profile-Name` is generic.
- Helper `errorStatusFromDatabricks()` is the only error-mapping helper; only Databricks-shaped errors route through it. Bedrock and OpenAI have separate error paths.
- The CORS comment claims "Power BI Desktop WebView requires permissive headers." That justification doesn't apply in PulsePlay (real browser, not PBI Desktop iframe).
- `databricks-agents/supervisor/README.md` still says "DwD Supervisor Agent."

Tracked for a future cleanup cycle. None of these block today's work.

## Repository layout

```
PulsePlay/
├── playground/              # Frontend (Vite + React + TS) — the host
│   ├── src/
│   │   ├── App.tsx                    # Sidebar + canvas shell
│   │   ├── biPanel/
│   │   │   ├── BIAdapter.ts           # The vendor-agnostic contract
│   │   │   ├── BIPanel.tsx            # Generic host component
│   │   │   └── registry.ts            # Lazy adapter loader (Vite code-splits per vendor)
│   │   └── components/
│   │       ├── VendorPicker.tsx       # Y-axis selector
│   │       ├── ConnectorPicker.tsx    # X-axis selector
│   │       ├── EmbedConfigForm.tsx    # Per-vendor config (v0: URL field)
│   │       └── AISidebar.tsx          # The whole-point AI assistant
│   ├── package.json / vite.config.ts / tsconfig.json
│   └── index.html
├── bi-adapters/             # Y-axis: BI vendor adapters
│   ├── powerbi/             # Stub today, powerbi-client SDK in v0.2
│   ├── tableau/             # Stub today, Tableau Embedding API v3 in v0.2
│   ├── qlik/                # Stub today, qlik-embed in v0.2
│   ├── looker/              # Stub today, @looker/embed-sdk in v0.2
│   └── generic-iframe/      # Always-works escape hatch
├── proxy/                   # X-axis: AI connector backbone (4,298-line server.js + 8 lib modules)
│   ├── server.js            # Express; routes for /assistant/*, /openai/*, /bedrock/*, /supervisor/*, /foundation/*
│   ├── lib/                 # foundationModelClient, insightsValidator, llmOrchestrator, sqlExecutor, bedrock signer, ...
│   └── tests/               # 342 jest tests
├── databricks-agents/       # Mosaic AI Supervisor Agent template
│   └── supervisor/          # LangGraph agent definition + deploy notebook
├── pulsepacks/              # Vertical packs (CPG/FMCG, manufacturing, ...). Pack architecture lives here.
├── scripts/                 # llm_onboard, llm_wrapup, smoke helpers, deploy helper
└── docs/                    # See docs/MIGRATION_NOTES.md for current map
```

## Cross-origin iframe security

Default sandbox in `GenericIframeAdapter`: `allow-scripts allow-same-origin allow-forms allow-popups`. Each vendor adapter SHOULD narrow this to the minimum the vendor needs. Open-ended sandbox defeats the purpose. Looker can run with just `allow-scripts allow-same-origin`; Power BI typically needs `allow-popups` for OAuth round-trips.

CSP headers when PulsePlay deploys to a hosted URL: set `frame-src` to the union of vendor-allowed embed origins (`*.powerbi.com`, `*.tableau.com`, etc.). Open-ended `frame-src *` defeats the sandbox. Block arbitrary user-supplied URLs in production unless approved — the org-specific allowlist is the boundary.

## Embed-token issuance

Vendor-specific embed-token endpoints will live in the proxy:

- Azure AD service principal flow for Power BI
- Trusted-ticket for Tableau
- OAuth M2M for Qlik Cloud
- Signed-URL HMAC for Looker

These are NOT in the proxy today. v0.2 work. Never put credentials in the browser bundle. Never embed an embed-token issuance secret in the React app.

## Inherited security posture

The Pulse-origin proxy ships with these defense-in-depth layers (mostly applicable; some Pulse-specific):

- **Sanitization** — `sanitizeInstructionText` / `sanitizeIdentifierList` / `sanitizeTemplateValue` (visual-side in Pulse; needs port to the playground)
- **OAuth M2M with single-flight token caching** — proxy-side, applies to PulsePlay verbatim
- **Token redaction in error bodies** — three regex passes (`dapi[a-f0-9]+`, `Bearer ...`, `Authorization: ...`)
- **Constant-time shared-key compare** — `crypto.timingSafeEqual`
- **DML keyword blocklist** — server-side gate before SQL execution
- **Rate limiting** — per-IP, 120 req/min
- **X-Request-Id correlation** — across visual -> proxy -> Databricks
- **Audit log with PII redaction** — append-only flat files, pipe to your SIEM

For the internal-org security baseline (SSO, SCIM, vault, audit, allowlists), see [SECURITY.md](SECURITY.md).

## What's stubbed vs production-ready

**Production-ready (inherited from Pulse cycles 1-47):**
- Whole proxy stack — keep-alive, OAuth M2M, OpenAI/Bedrock/Foundation routes, Genie integration, validator framework, query history audit
- `databricks-agents/supervisor/` Mosaic AI agent template
- 342 jest tests (all green)

**Stubbed (v0 today, v0.2+ next):**
- All four vendor adapters (PowerBI/Tableau/Qlik/Looker) — currently inherit from `GenericIframeAdapter`; v0.2 wires real vendor SDKs
- `EmbedConfigForm` — currently single URL field; v0.2 per-vendor credential helpers
- `AISidebar` — submits + shows initial response; v0.2 polls for completion (see Pulse's runStage pattern), streams tokens, shows progress
- Embed-token issuance routes in proxy (`/api/powerbi/embed-token`, `/api/tableau/trusted-ticket`, etc.)
- AI Insights pipeline (multi-stage, validated, cached) — exists in Pulse, not yet ported
- Playground tests — Vitest is configured; zero tests written

## The unconstrained roadmap (was: gateway of madness)

PulsePlay's playground architecture removes constraints Pulse lived with (PBI Desktop sandbox blocked fetch, no PNG/Excel exports, no streaming, no Web Workers, no Web Speech, no WebRTC, no IndexedDB, no DuckDB-WASM lazy chunks). What becomes possible:

| Vector | Enabled by | Roadmap |
|---|---|---|
| Streaming token-by-token AI in the sidebar | Server-sent events / streaming `fetch` | v0.4 |
| Cross-vendor single pane of glass — one question fans out to PBI + Tableau + Qlik in parallel | Independence of the 2-axis abstraction; supervisor-local already exists for Genie spaces | v0.5 |
| AI-driven auto-tour mode — AI navigates the loaded BI tool, narrating | postMessage + Web Speech API | v0.6-0.7 |
| Voice in / voice out — "what's our top region?" | Web Speech API | v0.6 |
| AI lens overlay — annotations / heat maps / outlier callouts SVG-painted on top of the iframe | Sibling absolute-positioned canvas + adapter-emitted layout events | v0.8 |
| Save / share / branch sessions — Loom-for-BI replay | URL-encoded snapshots + IndexedDB | v0.9 |
| Multi-user collaboration — two people, same dashboard, AI mediates | WebRTC peer-to-peer | v1.0 |
| AI-generated custom viz next to the BI tool | D3 / observable plot / lazy chunks | v0.8+ |
| Cross-tool data unification — PBI + Tableau + direct query joined in-browser | DuckDB-WASM | v1.1 |
| Scheduled morning briefings to inbox | Web Push API + service worker | v1.2 |

See [ROADMAP.md](ROADMAP.md) for the sequenced plan.

## Where to start when you come back

1. Pick ONE vendor (probably Power BI since the org has the credentials) and graduate its adapter from stub to real `powerbi-client` integration
2. Add the `/api/powerbi/embed-token` route in `proxy/server.js` (Azure AD service principal flow)
3. Wire one canonical event end-to-end (e.g., `page-changed`) so the AI sidebar can SEE what page the user is on and prompt accordingly
4. Then unlock streaming AI (v0.4) — the most demo-worthy first "gateway" vector

Everything else is creativity surface area. See [AGENDA.md](AGENDA.md) for the open-work tracker.

## Related docs

- [ROADMAP.md](ROADMAP.md) — sequenced plan v0.1 through v1.2
- [SECURITY.md](SECURITY.md) — internal-scoped security guardrails
- [PROXY_REFERENCE.md](PROXY_REFERENCE.md) — proxy API surface, scopes, route table
- [QUALITY.md](QUALITY.md) — what we measure, what we don't
- [AGENDA.md](AGENDA.md) — open-work tracker (active items)
- [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) — what gets done IF/WHEN we go public-OSS
- [PACKS.md](PACKS.md) — pack architecture overview
- [research/CODEBASE_AUDIT.md](research/CODEBASE_AUDIT.md) — brutal-honest gap analysis at HEAD
- [research/MARKET_AND_STANDARDS.md](research/MARKET_AND_STANDARDS.md) — market + standards research
- [adr/](adr/) — architecture decision records (immutable history)
- [inherited/MULTI_BI_ARCHITECTURE.md](inherited/MULTI_BI_ARCHITECTURE.md) — predecessor doc, archived for reference
