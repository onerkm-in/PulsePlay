# PulsePlay — Claude Code Guide

## Project in one line

A React playground that hosts ANY BI tool (Power BI, Tableau, Qlik, Looker, generic iframe, …) as an embedded guest, with an AI assistant sidebar that reasons about whatever the user is currently looking at — connector-agnostic on the AI side, vendor-agnostic on the BI side.

## Strategic direction

**Path C — inner-source-first, public-OSS-later.** PulsePlay v1 is scoped as an internal-org enabler, NOT a public commercial platform. The org has separate teams that build LLMs, agents (Genie / Mosaic Supervisor / Foundation Model), and Unity Catalog data; the org has BI tools already deployed. PulsePlay is the thin pane of glass that orchestrates these — we don't build LLMs, we don't build agents, we orchestrate and provide the experience layer.

Public-OSS readiness items (license decision, SBOM signing, conformance harness, public docs site, multi-tenant isolation, full ISO/EU AI Act compliance) are deferred to [docs/PUBLIC_OSS_AGENDA.md](docs/PUBLIC_OSS_AGENDA.md). Don't add them to the v0.x or v1.x scope without an explicit direction shift.

## How we work here (read this every session)

This file inherits the collaboration patterns we built up across the sister Pulse project cycles 1-47. Names and specifics differ; the working style is identical. All of these are LOAD-BEARING — please honor them.

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

State file is `.pulseplay-session.state.json` at the repo root, gitignored. `--force` skips the doc-staleness check when knowingly skipping.

## The 2-axis abstraction (PulsePlay's defining design)

| Axis | What varies | Where it lives |
|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` — frontend adapters implementing `BIAdapter` interface |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types — Genie, Azure OpenAI, Bedrock, Foundation Model, Supervisor, ResponsesAgent, Power BI semantic-model (10 backend paths total) |

ANY combination of (vendor, connector) is valid. Switching either is independent. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture.

## Key directories

| Path | Purpose |
|------|---------|
| `playground/src/App.tsx` | Sidebar + canvas shell. Hosts UnifiedAssistantSurface (Chat) or PulseShell (Workbench, the default) + BIPanel. Vendor (Y) + connector (X) selection now lives in Settings/FirstRunWizard + the BundleSwitcher chip, not inline pickers (the old inline `ConnectorPicker` was removed) |
| `playground/src/biPanel/BIAdapter.ts` | Vendor-agnostic contract every adapter implements |
| `playground/src/biPanel/BIPanel.tsx` | Generic host component — calls `mount/on/send/destroy` on any adapter |
| `playground/src/biPanel/registry.ts` | Lazy adapter loader (Vite code-splits per vendor) |
| `playground/src/components/UnifiedAssistantSurface.tsx` | The whole-point AI assistant (the "v0"/Chat surface; CLAUDE history called this `AISidebar` — that file no longer exists). Talks to the proxy, accumulates BI event context |
| `bi-adapters/generic-iframe/` | Always-works iframe-with-URL escape hatch |
| `bi-adapters/{powerbi,tableau,qlik,looker}/` | Vendor stubs (extend GenericIframeAdapter today; v1 wires real SDK) |
| `proxy/server.js` | Express proxy — connector-agnostic backbone (copied from the sister project) |
| `proxy/lib/foundationModelClient.js` | Mosaic AI Foundation Model serving endpoint client (cycle 47.6+47.7 from the sister project) |
| `proxy/lib/insightsValidator.js` | Per-section validator framework (cycle 23-47 from the sister project) |
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
| `docs/SETTINGS_SPEC.md` | Settings page master spec (IA + microcopy + state + guardrails + loophole audit) |
| `docs/KNOWLEDGE_BASE_ARCHITECTURE.md` | Knowledge plane + Knowledge Base IA |
| `docs/DEPLOYMENT_GUIDE.md` | **START HERE for run/host** — configure → run local → host (Azure F1 / Databricks Apps) → connect services → troubleshooting (what goes wrong + fix) → free→prod. Front-door over the DEPLOY_* docs. |
| `docs/DEPLOY_MVP_0.2.md` | MVP 0.2 deployer checklist (config.json + env vars + smoke) |
| `docs/PUBLIC_OSS_AGENDA.md` | Public-OSS path items, deferred from v1.x |
| `docs/MIGRATION_NOTES.md` | 2026-05-10 doc consolidation summary |
| `docs/research/CODEBASE_AUDIT.md` | Brutal-honest gap analysis at HEAD |
| `docs/research/MARKET_AND_STANDARDS.md` | Market + standards research |
| `docs/inherited/` | Pulse-heritage docs preserved verbatim for reference |
| `docs/adr/` | Architecture Decision Records (some marked SUPERSEDED for PulsePlay) |

## Canonical run sequence

**Canonical ports (locked 2026-05-25):** proxy on `127.0.0.1:7000`, playground dev server on `127.0.0.1:7001`. The proxy's own default port constant is still `8787` for backward compat — you MUST start it with `PORT=7000` for the Vite dev proxy (`/api/*` → `127.0.0.1:7000`) to land. Starting the proxy without `PORT=7000` makes every `/api/*` call return HTTP 500 from Vite.

```powershell
# 1. Start the proxy (in one terminal, with NODE_EXTRA_CA_CERTS set if your TLS chain needs it)
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm install                    # first time only
$env:PORT=7000; node server.js

# 2. Start the playground dev server (in a second terminal)
cd D:\Working_Folder\Projects\PulsePlay\playground
npm install                    # first time only
npm run dev
# Visit http://127.0.0.1:7001

# 3. Run tests
cd D:\Working_Folder\Projects\PulsePlay\proxy && npm test
cd D:\Working_Folder\Projects\PulsePlay\playground && npm run lint && npm run test
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:7000` — see `playground/vite.config.ts`. So fetches to `/api/assistant/conversations/start` from the React app land at the proxy's `/assistant/conversations/start` route.

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
Carried over tripwire from the sister project. Tests can't rely on in-memory mutations to `profileRegistry.get(name)` persisting. Configure profiles via `PROXY_PROFILE_*` env vars.

**Genie Agent Mode is UI-only**
Carried over from the sister project's Session 76 tripwire. Verified definitively via 20+ probes — public REST API silently swallows the `force_deep_research_planning` flag. The Foundation Model serving endpoint path (proxy `/foundation/section`) is the workaround. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Genie Agent Mode is UI-only" callout.

**Genie messages are immutable; one POST = one new `message_id`**
Empirically verified 2026-05-20 against the live workspace ([docs/findingProbeIssue.md](docs/findingProbeIssue.md)). There is no `/follow-up`, `/append`, `/continue`, or `/sections` sub-resource on `.../messages/{id}`. Multi-section Genie flows MUST allocate N `message_id`s under one shared `conversation_id`. If the UI needs one logical assistant turn, key that envelope on PulsePlay's generated `renderId`, not on Genie's `message_id`.

**Ten backend paths, not nine** (updated 2026-05-20)
Earlier docs claimed six → eight → nine. The 2026-05-20 PBI cycle added **`powerbi-semantic-model`** as the tenth — deterministic DAX templates, no LLM. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Ten runtime backend paths" for the corrected table. PBI also has a separate Q&A embed surface at `/powerbi/qna` (Microsoft's NLP in MS tenant; PulsePlay mints embed token only, 0 LLM calls from PulsePlay).

**Supervisor stagger is 2000 ms, not 800 ms**
[ADR-0003](docs/adr/0003-supervisor-stagger.md) was originally accepted at 800 ms in 2026-01; shipping default is now 2000 ms after iterative tuning. Actual code at [proxy/server.js:6385](proxy/server.js#L6385). The ADR body now carries the full 350 → 800 → 1500 → 2000 ms history — if you re-tune, add a row to the table there rather than silently changing the constant.

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

PulsePlay is past the original scaffold. Latest local validation (verified 2026-06-08, HEAD `c879eb6`): **proxy 1249/1249** (65 suites), **playground 1926/1926** (143 files), lint clean (`tsc --noEmit`), `vite build` clean (1128 modules). Caveat: tests assert output SHAPE, not answer correctness — there is no eval/hallucination harness (see [docs/QUALITY.md](docs/QUALITY.md)). "All green" ≠ "answers are right."

Connector axis (X) declares **ten backend code paths**: Genie / Azure OpenAI chat / Azure OpenAI analytics / Bedrock RAG / Bedrock direct / Foundation Model / Supervisor / Supervisor-local / ResponsesAgent / **Power BI semantic-model (no-LLM)** — plus the **Power BI Q&A embed surface** at `/powerbi/qna` (Microsoft's NLP, runs in MS tenant; PulsePlay mints embed token only).

**Ten code paths ≠ ten working backends.** On the current free-tier reference setup (per [docs/BLOCKERS.md](docs/BLOCKERS.md) + [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) live-verification table): **2 proven live** — Foundation Model (ungrounded; numbers are model-produced, not measured) and Power BI semantic-model (deterministic DAX, 0 LLM calls). **2 blocked upstream** — Genie and Supervisor (free Databricks workspace has serverless compute disabled; code reaches Databricks correctly but the workspace returns 400). **6 code-present-but-unproven-live** — Azure OpenAI chat/analytics, Bedrock RAG/direct, Supervisor-local, ResponsesAgent. Two probe/dispatch gaps flagged in the 2026-06-06 audit are now **closed**: `responses-agent` has a real `probeResponsesAgent` adapter (was degrading to `probeGeneric`), and `GET /supervisor/.../messages/:id` carries a `synchronous` marker + honest notice instead of fabricated content. The Foundation Model path also has a **grounding slice** — `/foundation/section` accepts caller-supplied rows, narrates them, and a verifier stamps a grounded/partial/unverified status (see [docs/HANDOVER.md](docs/HANDOVER.md) + the `feature_fm_grounding` memory).

BI axis (Y): only **Power BI (SDK mode)** is a real vendor-SDK integration (`powerbi-client`, event + command bridge, `getMetadata()`); `native` is a real ECharts renderer. Power BI also has a secure-embed quick-preview fallback (iframe-only, no bridge) and a developer tools strip. Pulse/Workbench mode is hosted in the playground. **Tableau / Qlik / Looker / databricks-genie are iframe stubs** (no vendor SDK, no event/command bridge — they render a URL and emit one `loaded` event); `databricks-aibi` attempts an SDK import but the dep isn't declared, so it falls back to iframe. Don't credit "Tableau/Qlik/Looker integration."

Architecture-direction call locked 2026-05-20: **connector plugin system** (drop-in/drop-out per-connector modules under `proxy/connectors/`). Phase A scaffolding queued — see [docs/AGENT_SYNC.md](docs/AGENT_SYNC.md) `[DECISION]` block for the contract + host API + phased rollout.

When you come back, see [docs/HANDOVER.md](docs/HANDOVER.md) top entry for the cycle 11→15.5 session arc, [docs/AGENDA.md](docs/AGENDA.md) "Next up" for the ordered open-work list, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Where to start when you come back" for the recommended first cycle.
