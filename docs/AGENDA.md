# PulsePlay Agenda — Open Work Tracker

> Active work items across the project. Newest at top within each section. When an item completes, move it to a "Done" bucket or strike it through.
>
> Strategic direction is locked: **Path C — inner-source-first, public-OSS-later.** Items that only matter for the public-OSS path live in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md), not here.

## Strategic posture (locked 2026-05-10)

**Two-phase delivery plan:**

1. **Phase 1 — Enterprise-internal solve.** Make PulsePlay enterprise-ready as an inner-source tool. Hand it over to the org's analytics team. Quick wins, cost saving, "can't say no to" experience. License: internal placeholder (not Apache 2.0 yet).
2. **Phase 2 — Public OSS.** Once the internal solve is delivered and proven, evaluate going public under Apache 2.0. Until then, [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) is the parked-features list.

**Non-negotiables across both phases:**

- **Agnostic.** Multi-AI + multi-BI. Genie, Supervisor, OpenAI, Bedrock, Foundation Model, future MCP — all peers. Power BI, Tableau, Qlik (Sense + View), Looker, generic iframe, future custom — all peers. Every architectural decision must preserve this. The Genie-vocabulary leakage in the inherited proxy (per [research/CODEBASE_AUDIT.md](research/CODEBASE_AUDIT.md)) gets cleaned up in cycles below; new code must not reintroduce coupling.
- **Modular.** Every part. Connectors, packs, BI adapters, knowledge-base content — all swappable.
- **Security-first.** "No flaws" — see [SECURITY.md](SECURITY.md).
- **Author-final-say.** Inferences and AI suggestions are *suggestions*. The author always confirms.
- **Cost-saving and quick-win positioning.** PulsePlay is the experience + connector + orchestration layer; we do NOT build LLMs or agents — we connect to the platform team's existing ones.

## Beast-mode list (foundation-laying cycle, in flight)

The 7-item cycle that this docs consolidation is part of. Tracked here for visibility.

1. **Doc consolidation 26 -> ~10 active** (this agent's work — in flight, completing now)
2. **Pack architecture seeded** — `pulsepacks/` directory + `PACK_SPECIFICATION.md` + first pack from `CPG_FMCG_ENTERPRISE_BLUEPRINT` (Agent 2 — separate scope)
3. **First vendor adapter graduates from stub** — Power BI most likely (`bi-adapters/powerbi/index.ts` wires `powerbi-client` SDK). Probably v0.2 priority.
4. **Embed-token issuance route** — `/api/powerbi/embed-token` in proxy, Azure AD service principal flow.
5. **First playground tests** — BIAdapter conformance suite, BIPanel lifecycle, registry lazy-load.
6. **Naming-leak sweep** — package name, header names, `errorStatusFromDatabricks`, supervisor README, `.dwd-session.state.json` rename. Tracked but deferred (low risk).
7. **AI sidebar at parity with Pulse** (v0.3) — multi-stage pipeline, validator wired, two-tier cache.

## Near-term (next 1-3 cycles)

### BI adapters

- [ ] Power BI adapter wires `powerbi-client` SDK
- [ ] Power BI: `report.on('pageChanged' | 'filtersApplied' | 'dataSelected')` -> canonical `BIEvent`
- [ ] Power BI: `send()` for `navigate-to-page`, `apply-filter`, `refresh`, `fullscreen`, `export`
- [ ] Tableau adapter wires Embedding API v3 (`<tableau-viz>` web component)
- [ ] Qlik adapter wires `qlik-embed`
- [ ] Looker adapter wires `@looker/embed-sdk`
- [ ] Each adapter narrows its iframe sandbox attribute to vendor-minimum
- [ ] BIAdapter conformance test suite (any adapter must pass)

### Proxy / connectors

- [ ] IdP session validation middleware (replaces shared-key as primary auth for non-localhost deployments)
- [ ] Per-user / per-profile rate limits
- [ ] `/api/powerbi/embed-token` route (Azure AD SP)
- [ ] `/api/tableau/trusted-ticket` route
- [ ] `/api/qlik/oauth-token` route
- [ ] `/api/looker/signed-url` route
- [x] Power BI adapter wires `powerbi-client` SDK (cycle A)
- [x] Power BI event mapping + send() commands (cycle A)
- [x] `/assistant/embed-token/{vendor}` proxy route (cycle A — Power BI implemented; Tableau/Qlik/Looker can mirror)
- [x] **Naming sweep** (2026-05-10): package name `unibridge-ai-proxy` -> `pulseplay-proxy`; description updated; `X-Genie-Key` / `X-Genie-Target-Host` -> `X-PulsePlay-Key` / `X-PulsePlay-Target-Host` with backward-compat reads (Pulse PBI sibling visual still works); `dwd-supervisor-agent` -> `pulseplay-supervisor-agent` in `databricks-agents/supervisor/` and `proxy/config.example.json`; `.dwd-session.state.json` -> `.pulseplay-session.state.json` in `scripts/llm_*.py` (legacy file still read on resume); ADR-0003 file renamed to drop the now-stale `-800ms` suffix; `proxy/app.yaml` Supervisor name updated; CORS comment updated.
- [ ] Smoke test adapted to PulsePlay (the inherited Pulse smoke is shaped wrong)

### Smart Connect & Connector Probe (NEW — agnostic-first)

Spec: [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md). Two-feature bundle: probe + dropdown-applicability marks + AI-suggest fallback + author confirmation.

- [ ] **Connector Probe interface** — `connector.probe()` returning canonical `ConnectorProbeResult`, with adapters per backend (Genie / Supervisor / OpenAI / Bedrock / Foundation / MCP / generic). Agnostic-first; chat-only LLMs degrade gracefully to `metadataAvailability: "none"`.
- [ ] **Pack inference matcher** — match probe output against installed pack vocabularies; return `{ suggestedPack, suggestedSubVertical, confidence, because[] }`.
- [ ] **Test Connection panel** — runs probe, shows status + metadata snapshot + inference summary.
- [ ] **Pack picker** — flat list of installed packs; preselects inferred choice with `*` marker; author can override.
- [ ] **Settings dropdown applicability marking** — KPI / sample-question / prompt-template dropdowns mark options with `*` when probe results indicate the underlying data supports them. Non-applicable options stay pickable; `*` is hint, not enforcement.
- [ ] **AI Suggest fallback (single-shot KPI inference)** — when probe metadata is `"minimal"` or doesn't match pack KPIs, one bounded LLM call suggests 5 KPIs from column names + sub-vertical context. Author keeps / edits / removes each.
- [ ] **Probe result caching** — per-profile, default 24h TTL, manual re-probe trigger.
- [ ] **Probe audit logging** — every probe is a backend call; log to audit stream for cost-tracking + security audit.
- [ ] **Genie probe adapter** — `GET /api/2.0/genie/spaces/{spaceId}` for description/instructions; metadata-only SQL for tables; pull `sample_queries` if exposed.
- [ ] **Supervisor probe adapter** — read agent description; helper-space list; for `supervisor-local`, probe each child profile and merge.
- [ ] **OpenAI probe adapter** — read `profile.schemaContext` if configured; otherwise `metadataAvailability: "none"`.
- [ ] **Bedrock probe adapter** — read knowledge-base name/description if RAG mode; otherwise `"none"`.
- [ ] **Foundation Model probe adapter** — endpoint name + minimal metadata.
- [ ] **MCP probe adapter** — list `tools` and `resources` per MCP spec.
- [ ] **Generic probe adapter** — fallback for unknown connector types.

### AI sidebar

- [ ] Submit -> poll loop (replaces submit-only)
- [ ] Multi-stage pipeline ported from Pulse (HEADLINE / KPI / TRENDS / RISKS / RECOMMENDED ACTIONS)
- [ ] Validator wired (`proxy/lib/insightsValidator.js` -> sidebar render path)
- [ ] Two-tier cache (memory + IndexedDB)
- [ ] BI event payload sanitization before prompt injection
- [ ] BICapabilities surfacing — sidebar hides commands the active adapter can't fulfill

### Tests / quality

- [ ] First playground tests (Vitest already configured; zero tests today)
- [ ] BIAdapter conformance harness (any adapter must pass it)
- [ ] First end-to-end demo: load a PBI report, ask "what page am I on?" — answer correctly
- [ ] Smoke against a live Databricks workspace through the proxy

### Docs

- [x] Consolidate 26 docs to ~10 active (this cycle)
- [ ] Update `scripts/llm_onboard.py` to reference the new doc structure
- [ ] First HANDOVER.md entry that uses the new layout
- [ ] Rename `.dwd-session.state.json` -> `.pulseplay-session.state.json` in `llm_wrapup.py`

## Medium-term (4-8 cycles)

- [ ] Streaming AI (v0.4)
- [ ] Multi-vendor side-by-side (v0.5) — extends supervisor-local pattern to multi-vendor
- [ ] Voice in/out (v0.6)
- [ ] AI-driven auto-tour (v0.7)
- [ ] First eval suite — 30-50 fixed questions across 3 reference datasets, ground-truth answers, nightly run
- [ ] First vertical pack live (CPG/FMCG via `pulsepacks/cpg-fmcg/`)

## Long-term (months out)

- AI lens overlay (v0.8)
- Save / share / branch sessions (v0.9)
- Multi-user collaboration via WebRTC (v1.0)
- Cross-tool data unification via DuckDB-WASM (v1.1)
- Scheduled briefings (v1.2)
- Decision: do we go public-OSS? -> see PUBLIC_OSS_AGENDA.md

## Backlog (not committed; nice-to-have)

- WCAG 2.1 AA audit
- Hallucination detector (post-process AI answers, reconcile cited numbers vs underlying data)
- Per-connector A/B harness
- Telemetry dashboard (latency, cache hit, validator pass rate)
- Plugin system for the sidebar (custom prompt templates per pack)
- Chat history export to PDF / Markdown for compliance/sharing
- Read-only / explore-only mode for execs (no command issuance)
- Native mobile shell (Capacitor / Tauri) wrapping the playground

## Blockers / dependencies

| Item | Blocked by | Owner |
|---|---|---|
| Power BI adapter | Org's PBI workspace credentials in vault | DevOps |
| Embed-token endpoints | Org's Azure AD / Tableau / Qlik / Looker service principals | Platform team |
| First eval suite | Reference dataset (Pulse uses Superstore + HR sample; need org-appropriate equivalent) | Maintainer + data team |
| IdP middleware | Org's IdP integration patterns documented | Platform team |
| Pack architecture | Agent 2's `pulsepacks/PACK_SPECIFICATION.md` lands first | Agent 2 |
| Naming sweep (header names) | Agreement on how to maintain backward-compat with Pulse during the rename | Maintainer |

## Creative ideas (parked but worth noting — to keep us thinking ambitious)

These are not committed work. They are creative angles to come back to once the foundation is solid:

- **Capability negotiation** — combine connector probe results with BI adapter capability declarations. Surface only those AI features the connector supports AND the BI adapter can render. (E.g., "AI-driven filter" only shows if connector emits filter commands AND BI adapter implements `apply-filter`.)
- **Pack inheritance** — sub-vertical packs can extend a parent pack and override specific KPIs. Like CSS specificity for analytics templates. Useful when org-internal sub-pack overrides a published reference pack.
- **AI-suggested questions from active context** — combine connector probe ("this brain knows about procurement") + recent BI events ("user is on the vendor-scorecard view") -> AI suggests follow-up questions in real time. Lightweight heuristic; not chat.
- **Cost-saving telemetry** — track AI calls per pack per question, surface a $/question metric. Makes the cost-saving pitch measurable. Requires a per-call cost-model registry.
- **Pack marketplace (post-public-OSS)** — once on Apache 2.0, allow community-contributed packs alongside org-internal ones. Signed, versioned, conformance-tested.
- **Cross-pack recommendations** — when a user is in Supply Chain pack but asks a Sustainability question, system offers to overlay the Sustainability pack content rather than forcing pack-switch.

## Process notes

- Update this file at the close of every cycle. Move done items to a Done bucket per major version (v0.2, v0.3, etc.) or strike through.
- Don't reorder existing entries — append new ones at top of the relevant section.
- Cross-link to ADRs when a decision is made that locks an item in.
- When an item moves from "near-term" to "in flight," tag with `[in flight]` plus the cycle.
- New product features that emerge from brainstorms (like Smart Connect from 2026-05-10) get captured here under the relevant section, not in scratch notes.
