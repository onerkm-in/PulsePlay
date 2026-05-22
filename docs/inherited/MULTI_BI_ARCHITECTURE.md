# PulsePlay Multi-BI Architecture

**One sentence:** PulsePlay is a React playground that hosts ANY BI tool as an embedded guest, with an AI assistant that reasons about whichever BI tool the user is currently looking at — connector-agnostic on the AI side, vendor-agnostic on the BI side.

## The 2-axis abstraction

PulsePlay's defining design decision is independence between two axes:

| Axis | What varies | Where it lives | Independence guarantee |
|---|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` | Switching vendors does not require any AI-side change |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types + routes | Switching connectors does not require any BI-side change |

ANY cell of the matrix is valid:

|                          | Genie (Databricks) | Azure OpenAI | AWS Bedrock | Foundation Model | Supervisor |
|--------------------------|--------------------|--------------|-------------|------------------|------------|
| **Power BI**             | ✓ (the sister project's pattern)  | ✓            | ✓           | ✓                | ✓          |
| **Tableau**              | ✓                  | ✓            | ✓           | ✓                | ✓          |
| **Qlik Sense**           | ✓                  | ✓            | ✓           | ✓                | ✓          |
| **Looker**               | ✓                  | ✓            | ✓           | ✓                | ✓          |
| **Generic iframe**       | ✓                  | ✓            | ✓           | ✓                | ✓          |

The user picks both axes independently in the sidebar. Switching either doesn't disturb the other.

## How a BI vendor adapter works

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

The host doesn't care HOW the adapter renders the BI tool. Three common patterns:

1. **Iframe with URL** — generic-iframe, Looker (signed URL), Tableau (Embedding API can fall back), most BI tools' "embed link" feature. Adapter creates `<iframe src=...>`, sandboxes it, listens for `load` events.
2. **Vendor JS SDK + DOM container** — Power BI (`powerbi-client.embed`), Looker (`@looker/embed-sdk`). Adapter loads the SDK, calls `embed(container, config)`, wires the SDK's events to canonical `BIEvent` types.
3. **Web component** — Tableau Embedding API v3 (`<tableau-viz>`), Qlik Cloud (`<qlik-embed>`). Adapter loads the web-component script, creates the custom element, listens to its events.

The `BICapabilities` object lets each adapter advertise what it actually supports for THIS embed config so the AI sidebar can hide UI for unsupported actions. Don't show "Apply filter" if Tableau parameters aren't configured. Don't show "Export PNG" if the PBI embed token doesn't carry that scope.

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

The AI sidebar consumes these to build a "what is the user currently looking at?" context block that gets prepended to every prompt — same pattern as sister Pulse project's `contextBuilder`, but sourced from BI vendor events instead of Power BI's DataView.

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

## How the AI connector axis works (proxy/)

Independent of which BI tool is loaded, the AI sidebar talks to **one connector at a time**. Connector profiles are configured in `proxy/config.json` and listed via `GET /assistant/profiles`. The user picks one in the `ConnectorPicker`; subsequent prompts include `assistantProfile: <name>` so the proxy routes to the right backend.

Profile types inherited from sister Pulse project's cycle 1-47:

| Profile `type` | What it talks to | Use case |
|---|---|---|
| (default — Genie) | Databricks Genie via `/api/2.0/genie/spaces/...` | NL→SQL on a single Genie space |
| `supervisor-local` | Multiple Genie spaces, proxy fans out + synthesizes | Cross-domain questions across spaces |
| `supervisor` | Real Databricks Mosaic AI Supervisor Agent serving endpoint | Same as above but server-side (better governance) |
| `foundation-model` | Mosaic AI Model Serving (Llama, Claude, etc.) via OpenAI-compatible chat-completions | Reasoning sections (RECOMMENDED ACTIONS, RISKS) where Genie's Chat mode is weak |
| Azure OpenAI (mode: `analytics`) | Azure OpenAI for SQL gen + narrative | Schema-aware NL→SQL pipeline |
| AWS Bedrock | Bedrock RetrieveAndGenerate or InvokeModel | Knowledge-base RAG or direct foundation model |

## Security posture (inherited)

Same posture as sister Pulse project — see [SECURITY_REVIEW.md](SECURITY_REVIEW.md), [ENTERPRISE_READINESS.md](ENTERPRISE_READINESS.md), [API_AUTH_AND_LIMITATIONS.md](API_AUTH_AND_LIMITATIONS.md). Tighter constraints to add for PulsePlay specifically:

- **Cross-origin iframes** — every adapter sets a sandbox attribute. Default: `allow-scripts allow-same-origin allow-forms allow-popups`. Adapters MUST narrow this where the vendor permits (Looker can run with just `allow-scripts allow-same-origin`).
- **Embed token issuance** — vendor-specific embed-token endpoints will live in the proxy (Azure AD service principal for Power BI, trusted-ticket for Tableau, OAuth M2M for Qlik Cloud, signed-URL HMAC for Looker). NEVER browser-side.
- **CSP headers** — when PulsePlay deploys to a hosted URL, set `frame-src` to the union of vendor-allowed embed origins (`*.powerbi.com`, `*.tableau.com`, etc.). Open-ended `frame-src *` defeats the sandbox.

## Gateway of madness — the unconstrained roadmap

PulsePlay's playground architecture removes the constraints sister Pulse project lived with (PBI Desktop sandbox blocked fetch, no PNG/Excel exports, no streaming, no Web Workers, no Web Speech, no WebRTC, no IndexedDB, no DuckDB-WASM lazy chunks). What becomes possible:

| Vector | Enabled by |
|---|---|
| Streaming token-by-token AI in the sidebar | Server-sent events / streaming `fetch` (browser, not sandbox) |
| Cross-vendor "single pane of glass" — one question fans out to PBI + Tableau + Qlik in parallel | Independence of the 2-axis abstraction |
| AI-driven auto-tour mode — AI navigates the loaded BI tool for you, narrating | postMessage + Web Speech API |
| Voice in/out — "Hey PulsePlay, what's our top region?" | Web Speech API |
| AI lens overlay — annotations / heat maps / outlier callouts SVG-painted ON TOP of the iframe | Sibling absolute-positioned canvas + adapter-emitted layout events |
| Save/share/branch sessions — Loom-for-BI, replay the AI conversation + the BI state | URL-encoded snapshots + IndexedDB |
| Multi-user collaboration — two people poking at the same dashboard, AI mediates | WebRTC peer-to-peer |
| AI-generated custom viz next to the BI tool | D3 / observable plot / lazy-loaded chunks |
| Cross-tool data unification — pull data from Tableau view + PBI report + direct query, AI joins in-browser | DuckDB-WASM |
| Scheduled "morning briefing" runs that arrive in your inbox | Web Push API + service worker |

Each one of these is a future cycle.

## Repository layout

```
PulsePlay/
├── playground/              # Frontend (Vite + React + TS)
│   ├── src/
│   │   ├── App.tsx                    # Sidebar + canvas shell
│   │   ├── biPanel/
│   │   │   ├── BIAdapter.ts           # The vendor-agnostic contract
│   │   │   ├── BIPanel.tsx            # Generic host component
│   │   │   └── registry.ts            # Lazy adapter loader
│   │   └── components/
│   │       ├── VendorPicker.tsx       # Y-axis selector
│   │       ├── ConnectorPicker.tsx    # X-axis selector
│   │       ├── EmbedConfigForm.tsx    # Per-vendor config (v0: URL field)
│   │       └── AISidebar.tsx          # The whole-point AI assistant
│   ├── package.json / vite.config.ts / tsconfig.json
│   └── index.html
├── bi-adapters/             # Y-axis: BI vendor adapters
│   ├── powerbi/             # Stub today, powerbi-client SDK in v1
│   ├── tableau/             # Stub today, Tableau Embedding API v3 in v1
│   ├── qlik/                # Stub today, qlik-embed in v1
│   ├── looker/              # Stub today, @looker/embed-sdk in v1
│   └── generic-iframe/      # Always-works escape hatch
├── proxy/                   # X-axis: AI connector backbone (copied from the sister project)
│   ├── server.js                      # Express; routes for /assistant/*, /openai/*, /bedrock/*, /supervisor/*, /foundation/*
│   ├── lib/                           # foundationModelClient, insightsValidator, llmOrchestrator, sqlExecutor, ...
│   └── tests/                         # 342 jest tests
├── databricks-agents/       # Mosaic AI Supervisor Agent template (copied from the sister project)
│   └── supervisor/                    # LangGraph agent definition + deploy notebook
├── scripts/                 # llm_onboard, llm_wrapup, smoke helpers (copied from the sister project)
└── docs/                    # ARCHITECTURE, SECURITY_REVIEW, ENTERPRISE_READINESS, API_AUTH_AND_LIMITATIONS, BEAST_MODE_MEMORY, taxonomies (copied from the sister project), MULTI_BI_ARCHITECTURE (this doc)
```

## What's stubbed vs production-ready

**Production-ready (inherited from sister Pulse project cycle 1-47):**
- Whole `proxy/` stack — keep-alive, OAuth M2M, OpenAI/Bedrock/foundation routes, Genie integration, validator framework, query history audit
- `databricks-agents/supervisor/` Mosaic AI agent template
- Cross-cutting docs — security posture, enterprise readiness, API & auth surface

**Stubbed (v0 here, v1 next):**
- All four vendor adapters (PowerBI/Tableau/Qlik/Looker) — currently inherit from generic-iframe; v1 wires real vendor SDKs
- `EmbedConfigForm` — currently single URL field; v1 per-vendor credential helpers
- `AISidebar` — submits + shows initial response; v1 polls for completion (see the sister project's runStage pattern), streams tokens, shows progress
- Embed-token issuance routes in proxy — `/api/powerbi/embed-token`, `/api/tableau/trusted-ticket`, etc.

## Where to start when you come back

1. Pick ONE vendor (probably Power BI since the sister project already has the credentials) and graduate its adapter from stub → real powerbi-client integration
2. Add the `/api/powerbi/embed-token` route in `proxy/server.js` (Azure AD service principal flow)
3. Wire one canonical event end-to-end (e.g., `page-changed`) so the AI sidebar can SEE what page the user is on and prompt accordingly
4. Then unlock one "gateway of madness" vector — streaming AI is the most demo-worthy starting point

Everything else is creativity surface area.
