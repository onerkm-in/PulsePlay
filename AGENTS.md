# PulsePlay — Codex Guide

## Project in one line

A React playground that hosts ANY BI tool (Power BI, Tableau, Qlik, Looker, generic iframe, …) as an embedded guest, with an AI assistant sidebar that reasons about whatever the user is currently looking at — connector-agnostic on the AI side, vendor-agnostic on the BI side.

## Strategic direction

**Path C — inner-source-first, public-OSS-later.** PulsePlay v1 is scoped as an internal-org enabler, NOT a public commercial platform. The org has separate teams that build LLMs, agents (Genie / Mosaic Supervisor / Foundation Model), and Unity Catalog data; the org has BI tools already deployed. PulsePlay is the thin pane of glass that orchestrates these — we don't build LLMs, we don't build agents, we orchestrate and provide the experience layer.

Public-OSS readiness items (license decision, SBOM signing, conformance harness, public docs site, multi-tenant isolation, full ISO/EU AI Act compliance) are deferred to [docs/PUBLIC_OSS_AGENDA.md](docs/PUBLIC_OSS_AGENDA.md). Don't add them to the v0.x or v1.x scope without an explicit direction shift.

## How we work here (read this every session)

This file inherits the collaboration patterns we built up across the sister project DwD_AI_Assistant_for_PBI cycles 1-47. Names and specifics differ; the working style is identical. All of these are LOAD-BEARING — please honor them.

### Beast mode

Rajesh likes beast mode. When the ask is multi-step and the path is clear:
- **Plan tightly** with a TodoWrite list before starting (so progress is visible)
- **Ship in small commits** per logical unit, not one mega-commit at the end
- **Run tests after each commit** (visual `tsc + vitest`, proxy `jest`, build `pbiviz`/`vite build` as relevant)
- **Build + deploy** to the appropriate sandbox (PulsePlay's sandbox is the dev server, not a custom-visual sandbox)
- **Update HANDOVER + project memory** as you go (see "Doc hygiene" below)
- **Fast-forward main** after each significant push to the active feature branch (per `feedback_keep_main_current.md`)
- **No half-shipped scope** — if you can't finish an item, mark it explicitly skipped/deferred with reason
- **Brutal-honest audits** — if the user is overestimating success, say so plainly (this is in `feedback_collaboration_session_63.md`)

### Brutal honesty

- If a feature doesn't work, say so. Don't spin failures as wins.
- If a Genie / vendor / upstream limitation is the real blocker, name it explicitly (don't blame our code).
- If you skipped scope, say what you skipped and why — don't hide it under "completed".
- The `feedback_external_llm_audit.md` rule applies: ALWAYS `git diff HEAD` before accepting changes from another LLM (ChatGPT, Gemini, Codex), because they sometimes rewrite working code with subtle regressions disguised as cleanup.

### Doc hygiene

- Keep `docs/HANDOVER.md` in sync with the work as it ships (LIFO, newest entry on top, never reorder existing entries)
- Keep repo-local project memory at `docs/memory/` in sync — `project_state.md` reflects current branch/commit/test state, `feature_*.md` files capture architecture decisions, and `feedback_*.md` files capture explicit collaboration corrections. External `.claude` / `.Codex` memory is optional local cache, not the source of truth.
- Update both BEFORE saying "we're done"

### Communication style

- Short responses. The user reads diffs themselves; trailing summaries are noise.
- Reference files with `[file.tsx:42](path/to/file.tsx#L42)` markdown links so they're clickable in the IDE.
- Match emoji discipline of the existing codebase (essentially: don't add new ones).
- When the user says "let's do this" / "beast mode" / "fully fledged" — go big in scope, ship in small commits.
- When the user pushes back ("wait that's not right"), STOP and re-read what they said before continuing.

## AI Onboarding (read first — applies to every LLM)

**Entry point** at the start of every session:

```bash
python scripts/llm_onboard.py --terse
```

Prints crash recovery context (if previous session didn't wrap up), the canonical docs, repo-local project memory, last 40 lines of proxy logs, last 20 git commits.

**Exit point** before ending meaningful work:

```bash
python scripts/llm_wrapup.py --note "one-line summary of what shipped"
```

State file is `.pulseplay-session.state.json` at the repo root. The legacy `.dwd-session.state.json` (from the sibling project's tooling) is still read as a fallback when present so a half-migrated repo keeps working; both names are gitignored. `--force` skips the doc-staleness check when knowingly skipping.

## The 2-axis abstraction (PulsePlay's defining design)

| Axis | What varies | Where it lives |
|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` — frontend adapters implementing `BIAdapter` interface |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types — Genie, Azure OpenAI, Bedrock, Foundation Model, Supervisor, ResponsesAgent (9 backend paths total) |

ANY combination of (vendor, connector) is valid. Switching either is independent. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture.

## Key directories

| Path | Purpose |
|------|---------|
| `playground/src/App.tsx` | Sidebar + canvas shell. VendorPicker (Y) + ConnectorPicker (X) + EmbedConfigForm + AISidebar + BIPanel |
| `playground/src/biPanel/BIAdapter.ts` | Vendor-agnostic contract every adapter implements |
| `playground/src/biPanel/BIPanel.tsx` | Generic host component — calls `mount/on/send/destroy` on any adapter |
| `playground/src/biPanel/registry.ts` | Lazy adapter loader (Vite code-splits per vendor) |
| `playground/src/components/AISidebar.tsx` | The whole-point AI assistant. Talks to the proxy, accumulates BI event context |
| `bi-adapters/generic-iframe/` | Always-works iframe-with-URL escape hatch |
| `bi-adapters/{powerbi,tableau,qlik,looker}/` | Vendor stubs (extend GenericIframeAdapter today; v1 wires real SDK) |
| `proxy/server.js` | Express proxy — connector-agnostic backbone (copied from DwD) |
| `proxy/lib/foundationModelClient.js` | Mosaic AI Foundation Model serving endpoint client (cycle 47.6+47.7 from DwD) |
| `proxy/lib/insightsValidator.js` | Per-section validator framework (cycle 23-47 from DwD) |
| `databricks-agents/supervisor/` | Mosaic AI Supervisor Agent template (LangGraph + create_react_agent) |
| `scripts/llm_onboard.py` / `llm_wrapup.py` | Universal LLM ritual |
| `scripts/smoke-full.ps1` / `smoke-rls-ols.ps1` | Smoke helpers (need adaptation for PulsePlay's profiles) |
| `docs/ARCHITECTURE.md` | THIS PROJECT's architectural lodestar (replaced inherited PepPulse-titled doc; merged from former `MULTI_BI_ARCHITECTURE.md`) |
| `docs/SECURITY.md` | Internal-scoped security guardrails (pruned from full enterprise doc) |
| `docs/ROADMAP.md` | Sequenced plan v0.1 -> v1.2 |
| `docs/AGENDA.md` | Open-work tracker |
| `docs/PROXY_REFERENCE.md` | Proxy API surface, scopes, OAuth M2M setup |
| `docs/QUALITY.md` | What we measure / don't / will (honest) |
| `docs/PACKS.md` | Pack architecture overview |
| `docs/PUBLIC_OSS_AGENDA.md` | Public-OSS path items, deferred from v1.x |
| `docs/MIGRATION_NOTES.md` | 2026-05-10 doc consolidation summary |
| `docs/research/CODEBASE_AUDIT.md` | Brutal-honest gap analysis at HEAD |
| `docs/research/MARKET_AND_STANDARDS.md` | Market + standards research |
| `docs/inherited/` | Pulse-heritage docs preserved verbatim for reference |
| `docs/adr/` | Architecture Decision Records (some marked SUPERSEDED for PulsePlay) |

## Canonical run sequence

```powershell
# 1. Start the proxy (in one terminal, with NODE_EXTRA_CA_CERTS set if your TLS chain needs it)
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm install   # first time only
node server.js

# 2. Start the playground dev server (in a second terminal)
cd D:\Working_Folder\Projects\PulsePlay\playground
npm install   # first time only
npm run dev
# Visit http://127.0.0.1:5173

# 3. Run tests
cd D:\Working_Folder\Projects\PulsePlay\proxy && npm test
cd D:\Working_Folder\Projects\PulsePlay\playground && npm run lint && npm run test
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8787` (the proxy's bind address) — see `playground/vite.config.ts`. So fetches to `/api/assistant/conversations/start` from the React app land at the proxy's `/assistant/conversations/start` route.

## Tripwires

### Read this first — PulsePlay is the host, not the guest

**PulsePlay is NOT captured inside any iframe.** It runs at top-level origin in a real modern browser. It HOSTS BI vendor surfaces (Power BI / Tableau / Qlik / Looker / generic-iframe) inside narrowed sandbox iframes that PulsePlay itself defines.

The sister **Pulse PBI custom visual** project is the iframe *guest* — it's the one constrained by the Power BI Desktop sandbox. Code ported from Pulse into PulsePlay (under `playground/src/pulse/*`) inherits Pulse's constraints inside that file tree; PulsePlay-native code does NOT.

**Modern web platform features are available by default in PulsePlay**: `fetch`, native NDJSON/SSE streaming, Web Workers, Service Workers, Web Speech, DuckDB-WASM lazy chunks, WebGPU, IndexedDB at full quota, native PDF/PNG/Excel generation, View Transitions, popups, File System Access. No bundle cap (code-split + lazy-load are the right answer to bundle pressure).

The full inheritance inventory — what's hard-coupled Pulse-PBI compat surface vs what PulsePlay can shed — is locked in [docs/PULSE_PORT_DETANGLING.md](docs/PULSE_PORT_DETANGLING.md). **Read it before assuming any Pulse-PBI constraint applies to PulsePlay.**

### Tripwires that DO apply to PulsePlay

**Vendor adapter stubs are NOT production**
Every adapter except `generic-iframe` currently extends `GenericIframeAdapter`. They render an iframe with the URL you give them — no event bridge, no command bridge, no vendor SDK. v1 wires real SDKs (powerbi-client, Tableau Embedding API v3, qlik-embed, @looker/embed-sdk). Don't claim "PowerBI integration" until that's done.

**Proxy `cfg()` does NOT cache when NODE_ENV=test**
Carried over tripwire from DwD. Tests can't rely on in-memory mutations to `profileRegistry.get(name)` persisting. Configure profiles via `PROXY_PROFILE_*` env vars.

**Genie Agent Mode is UI-only**
Carried over from DwD's Session 76 tripwire. Verified definitively via 20+ probes — public REST API silently swallows the `force_deep_research_planning` flag. The Foundation Model serving endpoint path (proxy `/foundation/section`) is the workaround. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Genie Agent Mode is UI-only" callout.

**Genie messages are immutable; one POST = one new `message_id`**
Empirically verified 2026-05-20 against the live workspace ([docs/findingProbeIssue.md](docs/findingProbeIssue.md)). There is no `/follow-up`, `/append`, `/continue`, or `/sections` sub-resource on `.../messages/{id}`. Multi-section Genie flows MUST allocate N `message_id`s under one shared `conversation_id`. If the UI needs one logical assistant turn, key that envelope on PulsePlay's generated `renderId`, not on Genie's `message_id`.

**Nine backend paths, not six/eight**
Earlier docs (`MULTI_BI_ARCHITECTURE.md`, `README.md`) said the proxy supports six backends. The 2026-05-10 codebase audit confirmed eight, and the 2026-05-17 ResponsesAgent connector made nine. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Nine runtime backend paths" for the corrected table.

**Supervisor stagger is 2000 ms, not 800 ms**
[ADR-0003](docs/adr/0003-supervisor-stagger-800ms.md) title says 800 ms. Actual code at [proxy/server.js:3556](proxy/server.js#L3556) is 2000 ms. ADR title rename pending.

**Cross-origin iframes need narrow sandbox**
Default sandbox in `GenericIframeAdapter`: `allow-scripts allow-same-origin allow-forms allow-popups`. Each vendor adapter SHOULD narrow this to the minimum the vendor needs. Open-ended sandbox defeats the purpose.

**Embed tokens are server-side only**
Power BI embed tokens, Tableau trusted tickets, Qlik OAuth tokens, Looker signed URLs — ALL get issued by the proxy. Power BI is implemented through `/assistant/embed-token/powerbi`; other vendors should mirror that server-side pattern. Never put credentials in the browser bundle. Never embed an embed-token issuance secret in the React app.

### Tripwires that apply ONLY to the Pulse-ported compat surface

These constraints travel with the code under `playground/src/pulse/*` because Pulse PBI sibling actively consumes the same patterns. They do NOT apply to PulsePlay-native code outside that directory. Full categorization in [docs/PULSE_PORT_DETANGLING.md](docs/PULSE_PORT_DETANGLING.md).

- XHR-only HTTP layer in `pulse/backend/*` and `pulse/genie.ts` — new PulsePlay code uses `fetch` + React Query (when adopted)
- `gn-*` CSS class vocabulary throughout `pulse/style/visual.less` — new design system applies only to non-Pulse-port code
- Pulse-shaped Insights section taxonomy (HEADLINE / TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS) — extensible in PulsePlay-native
- `v0` UI mode hedge in `settingsStore` — schedule for removal in PulsePlay-native UX
- Legacy `error: <string>` field on proxy problem envelopes — kept indefinitely for Pulse sibling compatibility (locked in `docs/ERROR_HANDLING_STRATEGY.md` "Migration note")

## What's NOT in this project (intentionally)

- No PBI custom visual package (`pbiviz`, `capabilities.json`, or Power BI deployment target). The reusable Pulse source was ported under `playground/src/pulse` as a compatibility shim — see [docs/PULSE_PORT_DETANGLING.md](docs/PULSE_PORT_DETANGLING.md).
- No `pbiviz` build pipeline (Vite is the bundler here)
- No Power BI Desktop sandbox concerns (we run in a real browser, top-level origin)
- No `capabilities.json` schema (no PBI custom visual to declare to Power BI)
- No bundle-size cap on PulsePlay itself (the 350 KB `.pbiviz` cap applies to the sibling Pulse project, not us)

## Status

PulsePlay is past the original scaffold. Power BI has a real `powerbi-client` adapter plus secure embed quick-preview fallback and a developer tools strip, Pulse mode is hosted in the playground, and the latest local validation is 161/161 playground+adapter tests, 418/418 proxy tests, and a passing playground build. Tableau/Qlik/Looker still use iframe fallbacks until their SDK adapters graduate.

When you come back, see [docs/AGENDA.md](docs/AGENDA.md) for the open-work tracker and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Where to start when you come back" for the recommended first cycle.
