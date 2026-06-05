# PulsePlay Architecture

> **Status:** v0.1.0 scaffold. The architecture below is the contract; the implementation is partial — see `docs/research/CODEBASE_AUDIT.md` for the brutal-honest gap analysis at HEAD.
>
> **Scope:** internal-org enabler. Path C — inner-source-first, public-OSS-later. This doc is for engineers and architects working inside the org that owns PulsePlay.
>
> **Strategic posture:** Databricks-forward, bridge-friendly, adapter-safe. See [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md) for the canonical shift-left / shift-middle plan, [MODULAR_INTEGRATION_ARCHITECTURE.md](MODULAR_INTEGRATION_ARCHITECTURE.md) for the addable/removable building-block model, and [research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md](research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md) for the delivery decision: one integrated app now, platform-owned slim builds later.

## One sentence

PulsePlay is a React playground where BI and AI components come to play together: any supported BI surface can be embedded as a guest, any supported AI connector can reason over the current view, and both sides stay modular.

## Playground principle

The architecture exists to make "plug in and play here" real. A deployer should be able to bring a BI surface, an AI connector, and a vertical pack, then try that combination without rewriting the host.

Genie + Power BI is the first production-grade product cell because it has the strongest inherited implementation and test history. It is not a special-case architecture. It must use the same contracts as every future cell: `BIAdapter` for BI surfaces, proxy profiles for AI connectors, `pulsepacks` for domain knowledge, canonical events for context, and canonical commands for actions.

Other BI and AI combinations remain intentionally modular, but they are expansion paths, not equal first-build priorities. The architecture keeps the door open while the product effort concentrates on making Genie + Power BI robust first.

The sister Power BI visual is treated as a proven asset bank, not a deprecated branch. The leverage rule is captured in [SUPERIOR_BUILD_LEVERAGE_PLAN.md](SUPERIOR_BUILD_LEVERAGE_PLAN.md): compare before rewriting, promote through contracts, port the valuable tests, and keep demo/smoke evidence attached to every migrated behavior.

## The 2-axis abstraction

PulsePlay's defining design decision is independence between two axes:

| Axis | What varies | Where it lives | Independence guarantee |
|---|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` | Switching vendors does not require any AI-side change |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types + routes | Switching connectors does not require any BI-side change |

Any cell of the matrix is valid:

|                          | Genie (Databricks) | Azure OpenAI | AWS Bedrock | Foundation Model | Supervisor | ResponsesAgent |
|--------------------------|--------------------|--------------|-------------|------------------|------------|----------------|
| **Power BI**             | yes (Pulse pattern)| yes          | yes         | yes              | yes        | yes            |
| **Tableau**              | yes                | yes          | yes         | yes              | yes        | yes            |
| **Qlik Sense / View**    | yes                | yes          | yes         | yes              | yes        | yes            |
| **Looker**               | yes                | yes          | yes         | yes              | yes        | yes            |
| **Generic iframe**       | yes                | yes          | yes         | yes              | yes        | yes            |

The user picks both axes independently in the sidebar. Switching either does not disturb the other.

## The Knowledge plane

Knowledge is a first-class context plane, not a third product axis that competes with BI vendor and AI connector.

```text
Y-axis: BI Runtime       -> what the user is looking at
X-axis: AI Runtime       -> what reasoning backend answers
Knowledge plane          -> what governed context grounds the answer
```

This split keeps the product understandable:

- **BI adapters observe.** They emit canonical context, events, and capabilities.
- **Knowledge retrieves.** It loads packs, source documents, indexes, policies, and retrieval profiles.
- **AI connectors reason.** They consume the user question, BI context, and a normalized grounding bundle.

PulsePacks are the curated domain-content substrate: glossary, ontology, KPIs, sample questions, prompt context, references, and demo configs. They are not the same thing as a vector index. The retrieval layer can use PulsePack content, BI metadata, Unity Catalog data, SharePoint/S3/docs, or provider-native knowledge bases, then return the same `GroundingBundle` shape to any connector.

The active design is captured in [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md). The brutal-honest current state: PulsePlay already has pack matching and pack prompt-context injection, but it does **not** yet have a full governed RAG/knowledge-base runtime.

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

1. **Iframe with URL** — generic-iframe, Power BI secure embed preview, Looker (signed URL), Tableau (Embedding API can fall back), most BI tools' "embed link" feature. Adapter creates `<iframe src=...>`, sandboxes it, listens for `load` events.
2. **Vendor JS SDK + DOM container** — Power BI (`powerbi-client.embed`), Looker (`@looker/embed-sdk`). Adapter loads the SDK, calls `embed(container, config)`, wires SDK events to canonical `BIEvent` types.
3. **Web component** — Tableau Embedding API v3 (`<tableau-viz>`), Qlik Cloud (`<qlik-embed>`). Adapter loads the web-component script, creates the custom element, listens to its events.

The `BICapabilities` object lets each adapter advertise what it actually supports for THIS embed config so the AI sidebar can hide UI for unsupported actions. Don't show "Apply filter" if Tableau parameters aren't configured. Don't show "Export PNG" if the PBI embed token doesn't carry that scope.

### Status today

Power BI has graduated to a real `powerbi-client` adapter with event and command mapping, plus a secure embed quick-preview iframe path for the portal link/iframe flow. `generic-iframe` remains the escape hatch. Tableau, Qlik, and Looker still extend `GenericIframeAdapter` and render iframe fallbacks until their SDK/web-component adapters graduate.

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

### Ten runtime backend paths (updated 2026-05-20)

The `MULTI_BI_ARCHITECTURE.md` predecessor of this doc and the README claimed six. The 2026-05-10 codebase audit confirmed eight; the 2026-05-17 ResponsesAgent connector made nine; the 2026-05-20 Power BI semantic-model cycle made **ten**. Listed here in the order the proxy detects them, with the file:line that hosts each.

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
| 9 | Mosaic AI ResponsesAgent (managed Agent Framework endpoint) | `profile.type === 'responses-agent'` + `responsesAgentEndpoint` | `callResponsesAgent` via `/responses-agent/chat` | [server.js:5311-5389](../proxy/server.js#L5311), [responsesAgentClient.js](../proxy/lib/responsesAgentClient.js) |
| 10 | **Power BI semantic-model (no-LLM, deterministic)** | `profile.type === 'powerbi-semantic-model'` + AAD SP creds + `powerbiGroupId` + `powerbiDatasetId` | NL question → keyword matcher → DAX template → `POST .../datasets/{id}/executeQueries` → Markdown | [server.js#/powerbi/conversations/start](../proxy/server.js), [powerbiDatasetClient.js](../proxy/lib/powerbiDatasetClient.js), [powerbiDaxTemplates.js](../proxy/lib/powerbiDaxTemplates.js), [powerbiQuestionMatcher.js](../proxy/lib/powerbiQuestionMatcher.js) |

Ten, not nine. Older audit/migration notes may still say eight or nine because they are historical snapshots; this doc is the corrected reference.

**Live-verification status (honest — "code-present" ≠ "proven live"; updated 2026-06-05).** Ten paths *exist in code*; far fewer are *proven against a live backend*. Don't read "10 paths" as "10 working backends":

| # | Path | Status | Evidence |
|---|---|---|---|
| 6 | Foundation Model | 🟢 **VERIFIED LIVE** | responds `COMPLETED` via `databricks-meta-llama-3-3-70b-instruct` (HANDOVER 2026-06-04/05) |
| 10 | Power BI semantic-model | 🟢 **VERIFIED LIVE** | deterministic DAX, total = 2,297,201 exact, `llmCallCount: 0` |
| 1 | Genie | ⛔ **BLOCKED (upstream)** | serverless compute disabled on the free workspace → live 400; code is fine, operator-gated |
| 7 | Supervisor (real agent) | ⛔ **BLOCKED** | fan-out depends on Genie |
| 8 | Supervisor-local | 🟡 **UNPROVEN** | code-present; never exercised live because Genie is blocked |
| 2,3 | Azure OpenAI (chat / analytics) | 🟡 **UNPROVEN** | code-present; no live-proof entry in HANDOVER |
| 4,5 | Bedrock (RAG / direct) | 🟡 **UNPROVEN** | code-present; no live-proof entry |
| 9 | ResponsesAgent | 🟡 **UNPROVEN** | code-present; no live-proof entry |

So: **2 verified live, 2 blocked upstream, 6 code-present-but-unproven.** The Settings connector catalogue and README front-door should surface the same truth (a status chip per connector) so a stakeholder sees what this table says — tracked as a follow-up.

The PBI semantic-model brain (#10) **does not invoke any LLM** at any step. Every response emits `mode: "powerbi-deterministic", llmCallCount: 0` in both the JSON payload and the audit log so deployers can prove that contract. A separate Q&A surface at `/powerbi/qna` (embedded `powerbi-client` Q&A visual) lets users access Microsoft's NLP if they want; that NLP runs in Microsoft's tenant — PulsePlay only mints the dataset-scoped embed token.

### Connector plugin architecture (direction locked 2026-05-20)

The proxy's connector dispatch is the dominant friction point as it grows past ten backends. Direction agreed: refactor into a **`proxy/connectors/` directory of drop-in/drop-out modules** where each file exports `{ id, displayName, matchProfile, probe, register, unregister }` and only touches a shared `host` API surface. Phased rollout queued — Phase A (scaffolding) → B (one pilot) → C (rest). See [AGENT_SYNC.md](AGENT_SYNC.md) `[DECISION]` block for the full contract + host API spec, and [research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md](research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md) for the delivery guardrail: avoid runtime marketplace/module federation in v1; prefer one build plus lazy chunks and server-owned capability truth.

### The orchestrator

[`proxy/lib/llmOrchestrator.js`](../proxy/lib/llmOrchestrator.js) is the closest thing the proxy has to a connector-agnostic abstraction. 584 lines. Two functions matter: `orchestrateGroundedAnswer` (line 90) and `withRetryOnBadSql` (line 316).

**Where it's agnostic:** the handler accepts `callLlm: (messages) => Promise<string>` as a parameter — provider-specific LLM gets injected by the caller. So OpenAI vs Bedrock vs Foundation Model all share this pipeline. See [server.js:2441-2456](../proxy/server.js#L2441) for `_resolveCallLlmForProfile()` which wires the right call function.

**Where it's lakehouse-shaped:**

- Returns include `conversation_id`, `message_id`, `status: 'COMPLETED' | 'FAILED'`, `sqlQuery`, `queryResult` — the EXACT shape Genie returns. The orchestrator mimics Genie's contract so the visual / sidebar can read the same fields.
- `databricksRequest` is required as a parameter — meaning even when the LLM is Bedrock or OpenAI, the SQL still runs against a Databricks SQL warehouse. There is no abstraction for "execute SQL against Snowflake / BigQuery / Postgres / Spark Connect" today.
- The SQL system prompt hard-codes "for a Databricks SQL warehouse."

This is acceptable for the internal-org charter (the org is on Databricks). If the platform ever needs Snowflake/BigQuery/etc. as the SQL target, an additional layer of abstraction is needed.

### The supervisor-local fan-out island

`runLocalSupervisor` is a proxy-side multi-Genie orchestrator. The user prompt fans out to N helper Genie spaces in parallel; each response is collected, then a synthesis pass (typically Foundation Model or OpenAI) merges them into one answer. The stagger between fan-out requests is documented in [ADR-0003](adr/0003-supervisor-stagger.md). Actual code uses 2000 ms.

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
- `databricks-agents/supervisor/README.md` still says "PulsePlay Supervisor Agent."

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
│   ├── powerbi/             # Real powerbi-client adapter
│   ├── tableau/             # Stub today, Tableau Embedding API v3 in v0.2
│   ├── qlik/                # Stub today, qlik-embed in v0.2
│   ├── looker/              # Stub today, @looker/embed-sdk in v0.2
│   └── generic-iframe/      # Always-works escape hatch
├── proxy/                   # X-axis: AI connector backbone (4,298-line server.js + 8 lib modules)
│   ├── server.js            # Express; routes for /assistant/*, /openai/*, /bedrock/*, /supervisor/*, /foundation/*
│   ├── lib/                 # foundationModelClient, insightsValidator, llmOrchestrator, sqlExecutor, bedrock signer, ...
│   └── tests/               # 1137 jest tests in latest recorded validation
├── databricks-agents/       # Mosaic AI Supervisor Agent template
│   └── supervisor/          # LangGraph agent definition + deploy notebook
├── pulsepacks/              # Vertical packs (CPG/FMCG, manufacturing, ...). Pack architecture lives here.
├── scripts/                 # llm_onboard, llm_wrapup, smoke helpers, deploy helper
└── docs/                    # See docs/MIGRATION_NOTES.md for current map
    └── KNOWLEDGE_BASE_ARCHITECTURE.md # Knowledge plane, retrieval contracts, and Settings/KB IA
```

## Cross-origin iframe security

Default sandbox in `GenericIframeAdapter`: `allow-scripts allow-same-origin allow-forms allow-popups`. Each vendor adapter SHOULD narrow this to the minimum the vendor needs. Open-ended sandbox defeats the purpose. Looker can run with just `allow-scripts allow-same-origin`; Power BI typically needs `allow-popups` for OAuth round-trips.

CSP headers when PulsePlay deploys to a hosted URL: set `frame-src` to the union of vendor-allowed embed origins (`*.powerbi.com`, `*.tableau.com`, etc.). Open-ended `frame-src *` defeats the sandbox. Block arbitrary user-supplied URLs in production unless approved — the org-specific allowlist is the boundary.

## Embed-token issuance

Vendor-specific embed-token endpoints live in the proxy:

- Azure AD service principal flow for Power BI — implemented as `/assistant/embed-token/powerbi`
- Trusted-ticket for Tableau — planned
- OAuth M2M for Qlik Cloud — planned
- Signed-URL HMAC for Looker — planned

Never put credentials in the browser bundle. Never embed an embed-token issuance secret in the React app.

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

## First-run onboarding wizard

When PulsePlay loads with no embed config + no AI connector configured, a full-bleed 4-step modal (`playground/src/components/FirstRunWizard.tsx`) appears in place of the empty placeholder. It's the user's first interaction with the 2-axis abstraction and is intentionally surface-agnostic + connector-agnostic.

Step contract:

| Step | Surface | Captures |
|---|---|---|
| 1 — Welcome & Persona | 4 persona cards (Analyst / Executive / Developer / Designer) | `persona: PersonaKey` |
| 2 — Choose tools | Vendor cards (from `visibleVendors`) + Connector cards (from `/api/assistant/profiles`) | `vendor`, `connector` |
| 3 — Connect | `<EmbedConfigForm>` + optional connectivity probe (`/api/assistant/probe`) | `embedConfig` |
| 4 — Explore | `<PackPicker>` + pre-filled suggested-question textarea | `packSelection`, `suggestedQuestion`, `autoAsk` |

Persona presets (`applyPersonaDefaults`) seed `uiMode` + `layoutMode` + a preferred connector type when the user picks a role. They are **surface- and connector-agnostic** — Analyst persona must work over any allowlisted (vendor × connector) pair. See ROADMAP.md Track 4 modularity guarantees #7 + #8.

Persistence keys (all `pulseplay:*` namespace, redacted in support bundles):

| Key | Lifetime | Purpose |
|---|---|---|
| `pulseplay:wizard-dismissed` | sticky | Sets on Done/Skip; suppresses wizard on subsequent loads |
| `pulseplay:wizard-draft` | mid-flow | Step + persona + vendor + connector; resumes from furthest reached step. Schema-validated on load (RISK-P1 4.1 fix) |
| `pulseplay:wizard-force` | single-use | Set by `forceWizard()` (Settings → "Re-run setup wizard"); consumed by `clearDraft()` on Done/Skip. Bypasses `hasEmbedConfig`/`hasConnector` gate (RISK-P1 4.5 fix) |
| `pulseplay:last-persona` | sticky | Last persona on Done; pre-selected on next wizard run via `initialPersona` prop |

Recovery surface: `<WizardErrorBoundary>` wraps the wizard subtree in App.tsx with `key={wizardForceTick}` so a Retry button bumps the remount key and the wizard re-mounts fresh. Skip falls through to the existing dismissal path.

The wizard's "Done & ask →" finish action sets `autoSubmitQuestion` state in App.tsx, which propagates to `<AISidebar>` and fires `ask()` exactly once per unique value (de-duped via `autoSubmittedRef`). This is the magic-moment UX — user finishes the wizard, immediately sees an AI answer without typing.

The Settings → System → "Re-run setup wizard" leaf calls `forceWizard()` to re-arm the flow at any time. Settings IA fix #8 adds a "🔗 Copy link" button next to every leaf header so users can deep-link to the exact section (`/settings/<group>/<slug>`).

## What's implemented vs still stubbed

**Implemented today:**
- 4-step first-run wizard with persona presets, draft persistence, `inert` focus trap, force-rerun flag, `WizardErrorBoundary`, autoAsk wiring, persona persistence across runs
- Whole proxy stack — keep-alive, OAuth M2M, OpenAI/Bedrock/Foundation routes, Genie integration, validator framework, query history audit
- `databricks-agents/supervisor/` Mosaic AI agent template
- Power BI `powerbi-client` adapter with event and command mapping
- Power BI secure embed quick-preview path for portal links/iframes
- Power BI Developer Tools panel for live adapter snapshots and command proving
- Frontend `/health` single-flight cache to prevent setup/status loops from stampeding the proxy
- `/assistant/embed-token/powerbi` service-principal embed-token path
- BIAdapter conformance harness
- 418 proxy tests and 161 playground/adapter tests in latest local validation

**Stubbed or partial:**
- Tableau/Qlik/Looker adapters — currently iframe fallbacks; SDK/web-component adapters still need to graduate
- Power BI export-to-file — intentionally rejected until the server-side export route is wired
- Unified first-run setup and health strip for the Genie + Power BI first playable cell
- `AISidebar` — submits + shows initial response; v0.2 polls for completion (see Pulse's runStage pattern), streams tokens, shows progress
- Tableau/Qlik/Looker token issuance routes
- AI Insights pipeline parity — exists in Pulse, partially hosted through Pulse mode, not yet decomposed into a clean reusable browser-host pipeline
- Old visual parity tests — 37 old visual test files remain to be ported or replaced

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

1. Finish the 10-minute Genie + Power BI first-run flow: preflight, Power BI connect, Genie probe, pack suggestion, author review, live smoke.
2. Build the `/settings` shell from the Settings IA: BI, AI, Preferences, System, Advanced.
3. Tighten the remaining pilot loopholes: generated CSP from the allowlist, inline-credential startup gate, and localStorage/settings revalidation.
4. Add the first read-only Knowledge Base surface so users can inspect what a pack contributes before they ask the AI.
5. Then wire governed retrieval (`GroundingBundle`) behind the AI sidebar, starting with local PulsePack content and Databricks Vector Search as the first enterprise provider.

Everything else is creativity surface area. See [AGENDA.md](AGENDA.md) for the open-work tracker.

## Related docs

- [UNIFIED_ASK_PULSE_WORKBENCH.md](UNIFIED_ASK_PULSE_WORKBENCH.md) — locked Ask Pulse strategy: 3-mode workbench (Native Embed / PulsePlay Verified / Hybrid), no-ungrounded-artifacts contract, ECharts + Vega-Lite stack, 7-step build sequence
- [ROADMAP.md](ROADMAP.md) — sequenced plan v0.1 through v1.2
- [SECURITY.md](SECURITY.md) — internal-scoped security guardrails
- [PROXY_REFERENCE.md](PROXY_REFERENCE.md) — proxy API surface, scopes, route table
- [QUALITY.md](QUALITY.md) — what we measure, what we don't
- [AGENDA.md](AGENDA.md) — open-work tracker (active items)
- [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) — what gets done IF/WHEN we go public-OSS
- [PACKS.md](PACKS.md) — pack architecture overview
- [MODULAR_INTEGRATION_ARCHITECTURE.md](MODULAR_INTEGRATION_ARCHITECTURE.md) — integrated experience, modular capability fabric, block lifecycle, capability registry, and progressive spine/spectrum model
- [STRUCTURED_AUTHORING_STANDARD.md](STRUCTURED_AUTHORING_STANDARD.md) — standard for prompt/guidance editors, required sections, parameter chips, validation, and compiled middleware previews
- [SETUP_SETTINGS_RELATIONSHIP_AUDIT.md](SETUP_SETTINGS_RELATIONSHIP_AUDIT.md) — setup/settings dependency map, connector readiness gaps, progressive setup model, and first implementation slices
- [AI_CONTEXT_CONFIGURATION_MODEL.md](AI_CONTEXT_CONFIGURATION_MODEL.md) — common AI context model for Knowledge Base-derived domain, preset, metric, AI Insights, and Chat settings
- [CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](CHAT_VISUALIZATION_KNOWLEDGE_BASE.md) — Chat-facing chart recommendation, critique, and legacy-to-modern visualization rules
- [KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md) — source register, provenance, credibility tiers, and claim-level audit rules for every Knowledge Base module
- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) — Knowledge plane, retrieval contracts, Knowledge Base IA
- [SETTINGS_SPEC.md](SETTINGS_SPEC.md) — Settings page master spec: IA, layout, microcopy, state model, interaction rules, enterprise guardrails, security setup, maintenance, administration, loophole audit
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) — board-ready enterprise security audit
- [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md) — MVP 0.2 deployer checklist: prereqs, `config.json` template, env vars, smoke verification, common pitfalls
- [research/CODEBASE_AUDIT.md](research/CODEBASE_AUDIT.md) — brutal-honest gap analysis at HEAD
- [research/MARKET_AND_STANDARDS.md](research/MARKET_AND_STANDARDS.md) — market + standards research
- [adr/](adr/) — architecture decision records (immutable history)
- [inherited/MULTI_BI_ARCHITECTURE.md](inherited/MULTI_BI_ARCHITECTURE.md) — predecessor doc, archived for reference
