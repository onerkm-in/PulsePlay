# PulsePlay Roadmap

> Strategic direction: **Path C — inner-source-first, public-OSS-later.** Scope through v1.x is internal-org enabler. Public-OSS readiness items are tracked separately in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) so they're not forgotten.

## v0.1.0 — Foundation (DONE)

The scaffold this commit established:

- Vite + React + TypeScript playground shell with sidebar + canvas layout
- `BIAdapter` vendor-agnostic contract + `BIPanel` generic host
- 5 vendor adapters: PowerBI, Tableau, Qlik, Looker, generic-iframe (all v0 stubs that fall back to iframe)
- `VendorPicker` (Y-axis) + `ConnectorPicker` (X-axis) — independent 2-axis selection
- `EmbedConfigForm` v0 (single URL field; v0.2 will be per-vendor credential helpers)
- `AISidebar` v0 (submits prompts to proxy; v0.2 will poll/stream)
- Proxy + databricks-agents + scripts inherited from Pulse cycles 1-47
- Doc consolidation 26 -> ~10 active (this cycle)

## v0.2.0 — Production-grade Genie + Power BI

Power BI is now the first real SDK adapter. The remaining v0.2 work is to make Databricks Genie + Power BI a production-grade product slice: novice-friendly setup, reliable context, secure auth, clear diagnostics, live smoke proof, and honest limitations. Other BI/AI options stay modular, but they do not get equal investment until this cell passes the production gate.

- [x] Wire real `powerbi-client` SDK in `bi-adapters/powerbi/index.ts`
- [x] Map `report.on('pageChanged' / 'filtersApplied' / 'dataSelected')` to canonical `BIEvent` types
- [x] Implement `send()` for `navigate-to-page` + `apply-filter` + `refresh` + `fullscreen`; server-side export remains later
- [x] Add Power BI embed-token endpoint to proxy (`/assistant/embed-token/powerbi`)
- [x] Update `EmbedConfigForm` with Power BI-specific SSO / service-principal / manual-token paths
- [x] Add secure embed quick-preview mode for the Power BI portal link/iframe path
- [x] Add Power BI Developer Tools panel for adapter snapshot, events, refresh/fullscreen, and filter test actions
- [x] Fix proxy health-probe storm and protect AI quota from cheap metadata reads
- [ ] 10-minute author setup flow — preflight, Power BI connect, Genie probe, AI-drafted setup, author review, live smoke
- [ ] Unified first-run setup: Genie profile + Power BI report + pack in one guided flow
- [ ] AI setup proposal from Genie/probe metadata + Power BI context: pack, starter questions, KPI rules, field mappings
- [ ] Health strip: Power BI report embedded, Genie reachable, context bridge active
- [ ] Context refresh on load/page change via `getFilters()` / `getPages()`
- [ ] Field-target mapping for `{ table, column }` filters
- [ ] First end-to-end demo: load a PBI report, ask the AI sidebar a question that references "the page I'm currently on"
- [x] First playground tests — BIAdapter conformance suite, adapter tests, PulseShell/AISidebar/PII tests
- [ ] Port highest-value pure tests from the old Power BI visual
- [ ] Smoke test adapted to PulsePlay's profiles (the inherited `scripts/smoke-full.ps1` is Pulse-shaped)
- [ ] Production readiness gate: security posture reviewed, live smoke green, support runbook written, known limitations documented

## v0.3.0 — AI sidebar at parity with Pulse

The proven Insights pipeline patterns from Pulse cycles 1-47, ported to PulsePlay's playground context:

- [ ] Conversation reuse (single Genie conversation per session, not per question)
- [x] Fast Insights briefing (HEADLINE / KPI SNAPSHOT / TRENDS / RISKS / RECOMMENDED ACTIONS); optional deep multi-stage mode remains future work
- [ ] Validator framework — wire `proxy/lib/insightsValidator.js` into the sidebar
- [ ] Per-section retry with stronger directives on validation failure
- [ ] Two-tier cache (memory + IndexedDB — the playground has IndexedDB available, unlike the PBI sandbox)
- [ ] Genie Query Audit panel for SQL bug-tracing
- [ ] SQL provenance attribution

## v0.4.0 — Streaming AI

Now that we're in a real browser:

- [ ] Server-sent events from proxy (`/assistant/conversations/start-stream`)
- [ ] Token-by-token rendering in `AISidebar` — no more "thinking..." spinners
- [ ] "Stop generation" button that actually stops the upstream

## v0.5.0 — Multi-vendor "single pane of glass"

The headline expansion once the first production cell is solid:

- [ ] Allow loading TWO vendors side-by-side in the canvas (split layout)
- [ ] AI sidebar's prompt context includes recent events from BOTH active panels
- [ ] One question fans out to multiple connectors in parallel; AI synthesizes one answer that references both vendors' data
- [ ] Reuses the supervisor-local proxy pattern (already implemented for multi-Genie; extend to multi-vendor)

## v0.6.0 — Voice in/out

- [ ] Web Speech API integration in `AISidebar`
- [ ] "Hey PulsePlay" wake word (optional)
- [ ] Voice-narrated AI responses

## v0.7.0 — AI-driven auto-tour

- [ ] AI can issue `BICommand` instances back into the embedded view
- [ ] "Give me the 5-minute walkthrough" -> AI navigates pages, applies filters, narrates each step
- [ ] Per-vendor capability discovery so the tour gracefully degrades for limited adapters

## v0.8.0 — AI lens overlay

- [ ] SVG/canvas overlay layer absolute-positioned on top of `BIPanel`
- [ ] Adapter exposes "data point coordinates" events
- [ ] AI paints annotations: outlier callouts, heat-map overlays, "look here" arrows
- [ ] Toggle on/off so the underlying view stays usable

## v0.9.0 — Save / share / branch sessions

- [ ] URL-encoded snapshots of (vendor, embedConfig, AI conversation) for shareable links (org-internal SSO-gated)
- [ ] IndexedDB for local session history
- [ ] "Branch this conversation" — fork from an earlier prompt and try a different angle

## v1.0.0 — Multi-user collaboration (still internal scope)

- [ ] WebRTC peer-to-peer for two users on the same playground (within the org)
- [ ] AI mediates — sees both users' actions, can answer "what is the other person looking at?"
- [ ] Optional shared cursor / pointer

## v1.1.0 — Cross-tool data unification

- [ ] DuckDB-WASM in the browser
- [ ] Adapters expose "give me the underlying data behind this view" command
- [ ] AI can join data from PBI + Tableau + direct Snowflake/Databricks queries IN-BROWSER and answer questions that span sources

## v1.2.0 — Scheduled briefings

- [ ] Web Push API + service worker (org-internal endpoints)
- [ ] "Send me a morning briefing on the Sales report" — AI runs the question on a schedule, pushes summary to your phone/desktop

## Beyond v1.x

Anything that requires public-OSS posture, multi-tenant isolation, third-party audit, or external commercial packaging is tracked in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md). The decision to GO public-OSS (and which license) is itself a v2 conversation, not committed in this roadmap.

## Notes

- Order is suggestive, not fixed. v0.2 (one vendor real) and v0.3 (AI parity) are prerequisites for everything else.
- v0.4 (streaming) unlocks demo polish.
- v0.5 (multi-vendor) is the big differentiator vs the sister Pulse project.
- v0.6-1.2 are creativity surface area — pick based on demo opportunity and platform-team availability for the AI side.
- See [AGENDA.md](AGENDA.md) for the open-work tracker (active items, near-term, blockers).
- See [PACKS.md](PACKS.md) for the vertical-pack architecture (CPG/FMCG, manufacturing, etc.). Pack rollouts proceed in parallel with version increments.
