# PulsePlay Roadmap

## v0.1.0 — Foundation (DONE)

The scaffold this commit establishes:

- ✅ Vite + React + TypeScript playground shell with sidebar + canvas layout
- ✅ `BIAdapter` vendor-agnostic contract + `BIPanel` generic host
- ✅ 5 vendor adapters: PowerBI, Tableau, Qlik, Looker, generic-iframe (all v0 stubs that fall back to iframe)
- ✅ `VendorPicker` (Y-axis) + `ConnectorPicker` (X-axis) — independent 2-axis selection
- ✅ `EmbedConfigForm` v0 (single URL field; v1 will be per-vendor credential helpers)
- ✅ `AISidebar` v0 (submits prompts to proxy; v1 will poll/stream)
- ✅ Proxy + databricks-agents + scripts inherited from DwD_AI_Assistant_for_PBI cycles 1-47

## v0.2.0 — One vendor real

Pick the vendor with the lowest activation cost (probably **Power BI** since DwD already has the workspace + token):

- [ ] Wire real `powerbi-client` SDK in `bi-adapters/powerbi/index.ts`
- [ ] Map `report.on('pageChanged' / 'filtersApplied' / 'dataSelected')` to canonical `BIEvent` types
- [ ] Implement `send()` for `navigate-to-page` + `apply-filter` + `refresh` + `fullscreen` + `export`
- [ ] Add `/api/powerbi/embed-token` endpoint to proxy (Azure AD service principal flow)
- [ ] Update `EmbedConfigForm` with PBI-specific fields (workspace ID + report ID + dataset ID + RLS roles)
- [ ] First end-to-end demo: load a PBI report, ask the AI sidebar a question that references "the page I'm currently on"

## v0.3.0 — AI sidebar at parity with DwD

The proven Insights pipeline patterns from DwD cycles 1-47, ported to PulsePlay's playground context:

- [ ] Conversation reuse (single Genie conversation per session, not per question)
- [ ] Worker-pool stage parallelism if the question fans out to multiple sub-questions
- [ ] Validator framework — semantic checks on AI output (numeric magnitudes, list shape, etc.)
- [ ] Per-section retry with stronger directives on validation failure
- [ ] Cycle 47.10 Genie Query Audit panel for SQL bug-tracing
- [ ] Cycle 47.13 SQL provenance attribution

## v0.4.0 — Streaming AI

Now that we're in a real browser:

- [ ] Server-sent events from proxy (`/assistant/conversations/start-stream`)
- [ ] Token-by-token rendering in `AISidebar` — no more "thinking…" spinners
- [ ] "Stop generation" button that actually stops the upstream

## v0.5.0 — Multi-vendor "single pane of glass"

The headline feature only PulsePlay can deliver:

- [ ] Allow loading TWO vendors side-by-side in the canvas (split layout)
- [ ] AI sidebar's prompt context includes recent events from BOTH active panels
- [ ] One question fans out to multiple connectors in parallel; AI synthesizes one answer that references both vendors' data

## v0.6.0 — Voice in/out

- [ ] Web Speech API integration in `AISidebar`
- [ ] "Hey PulsePlay" wake word (optional)
- [ ] Voice-narrated AI responses

## v0.7.0 — AI-driven auto-tour

- [ ] AI can issue `BICommand` instances back into the embedded view
- [ ] "Give me the 5-minute walkthrough" → AI navigates pages, applies filters, narrates each step
- [ ] Per-vendor capability discovery so the tour gracefully degrades for limited adapters

## v0.8.0 — AI lens overlay

- [ ] SVG/canvas overlay layer absolute-positioned on top of `BIPanel`
- [ ] Adapter exposes "data point coordinates" events
- [ ] AI paints annotations: outlier callouts, heat-map overlays, "look here" arrows
- [ ] Toggle on/off so the underlying view stays usable

## v0.9.0 — Save / share / branch sessions

- [ ] URL-encoded snapshots of (vendor, embedConfig, AI conversation) for shareable links
- [ ] IndexedDB for local session history
- [ ] "Branch this conversation" — fork from an earlier prompt and try a different angle

## v1.0.0 — Multi-user collaboration

- [ ] WebRTC peer-to-peer for two users on the same playground
- [ ] AI mediates — sees both users' actions, can answer "what is the other person looking at?"
- [ ] Optional shared cursor / pointer

## v1.1.0 — Cross-tool data unification

- [ ] DuckDB-WASM in the browser
- [ ] Adapters expose "give me the underlying data behind this view" command
- [ ] AI can join data from PBI + Tableau + direct Snowflake/Databricks queries IN-BROWSER and answer questions that span sources

## v1.2.0 — Scheduled briefings

- [ ] Web Push API + service worker
- [ ] "Send me a morning briefing on the Sales report" — AI runs the question on a schedule, pushes summary to your phone/desktop

## Notes

Order is suggestive, not fixed. v0.2 (one vendor real) and v0.3 (AI parity) are prerequisites for everything else. v0.4 (streaming) unlocks demo polish. v0.5 (multi-vendor) is the big differentiator vs DwD. v0.6-1.2 are creativity surface area — pick based on demo opportunity.
