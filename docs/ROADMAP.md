# PulsePlay Roadmap

> Strategic direction: **Path C — inner-source-first, public-OSS-later.** Scope through v1.x is internal-org enabler. Public-OSS readiness items are tracked separately in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md).
>
> Product posture: **Databricks-forward, bridge-friendly, adapter-safe.** Canonical baseline in [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md) — read it before prioritizing new roadmap lanes.
>
> This roadmap was reorganized 2026-05-16 around parallel **TRACKS** so independent work can advance without false sequencing — and so the Databricks investment stays modular instead of locking PulsePlay into a single-vendor future.

---

## How to read this roadmap

Five parallel **tracks**. Each track ships independently. A track's "next milestones" are NOT blocked by other tracks unless explicitly listed under **Cross-track Dependencies**.

Two reading modes:

- **Track view** (canonical going forward) — what's modular, what's load-bearing, what stays vendor-neutral.
- **Version-milestone view** (legacy v0.x) — for backward compatibility with prior docs. Kept at the bottom.

**Modularity discipline:** every track has a "What stays modular" rule + a "Non-Databricks proof point" that prevents Databricks-lock-in. If a proposed milestone violates the modularity rules, it does not ship without an architecture review.

---

## Track 1 — Foundation (Governance + Auth + Redaction + Diagnostics)

The layer that applies to **every target** — Power BI, Databricks, Tableau, future Snowflake / Sigma / Hex / Mode / Microsoft Fabric URLs / etc. — all inherit from this without changes.

**Current state (DONE):**
- Production auth — `PROXY_AUTH_MODE` (idp / shared-key / both / none-in-dev), fail-closed in production
- Allowlist fail-closed (P1) — refuses unsafe selections; UI banner; BIPanel late-arrival revalidation
- Support bundle redaction (P2) — `redactDeep()` walks nested JSON, depth/array/string caps
- Power BI embed-token hardening — server-derived RLS, Edit gated, identity-aware cache
- Diagnostics buffer — last 20 BI events + last 20 console errors
- Settings IA (5-group tree) — BI / AI / Preferences / System / Advanced; drift-prevention tests
- Persistent embed config (`useEmbedConfig` + `embedConfigStore`) — cross-tab, edits live-update without refresh

**Next milestones (parallel, no internal ordering):**
1. **Live enterprise IdP JWKS smoke** — env-gated, needs a real tenant. Code-level correctness is in; field correctness is not yet proven.
2. **CSP from real allowlist at build time** — no example-config fallback in production builds.
3. **Audit log retention + rotation strategy** — currently in-memory; needs persistence + rotation policy.
4. **BroadcastChannel for embed config** — replace storage-event quirks for true cross-tab live update.

**What stays modular:**
- Auth, allowlist, redaction are **vendor-agnostic**. New surfaces (Snowflake URL, Sigma dashboard, future Fabric link) inherit these guarantees without touching this layer.
- Allowlist scope keys are opaque strings — no Databricks-specific identifiers in the schema.

**Non-Databricks proof point:**
A deployment with **only Power BI + Azure OpenAI** (zero Databricks) must pass auth, allowlist, redaction, and diagnostics end-to-end. Currently true; must remain true.

---

## Track 2 — Surface (Insight Surfaces / the Y-axis)

What the user is **looking at**. The 2-axis design makes this fully independent of Reasoning — surfaces can be added, removed, or graduated without touching connectors or knowledge.

**Current state (DONE):**
- `BIAdapter` contract — `mount` / `on` / `send` / `destroy` / `getMetadata` / `getSnapshot`
- Power BI adapter — real `powerbi-client` SDK + secure embed quick-preview + Developer Tools panel
- Power BI `getMetadata()` — surfaces visible measures, dimensions, active filters
- Tableau / Qlik / Looker — iframe stubs (intentional; SDK graduation deferred to v0.3+)
- Generic iframe adapter — always-works escape hatch for any URL-addressable surface
- Governance: vendor list filtered via `visibleVendors`; BIPanel revalidates on late-arriving allowlist

**Next milestones (parallel):**
- **A. Power BI hardening completion** — 10-minute author setup, health strip, field-target mapping. Power BI = current-state bridge; we harden the bridge as part of preserving current state.
- **B. Databricks AI/BI Dashboard adapter** — new surface implementing `BIAdapter`; `getMetadata()` returns Unity Catalog lineage when available.
- **C. Genie Space adapter** — tighter coupling to the Reasoning track's Genie connector but the adapter stays on this track; mounts as a surface.
- **D. Databricks App adapter** — embedded Databricks Apps (iframe first, deeper command bridge later).
- **E. Unity Catalog asset surface** — browser pane for tables / views / metrics.
- **F. Tableau / Qlik / Looker SDK graduation** — lower priority post-shift; iframe stubs stay shipped as modularity proof.

**What stays modular:**
- **Every** surface implements `BIAdapter`. No `if (vendor === "databricks-*")` branches outside the adapter file.
- `visibleVendors` stays the only governance filter. Adding a surface = adding a row to `allowlist.biProviders`.
- A "Power BI only" deployment ships. A "Databricks only" deployment ships. Both must continue to.

**Non-Databricks proof point:**
The "Power BI + Azure OpenAI" deployment from Track 1 must still pass Discovery Loop + frame-to-prompt + the 4-step wizard end-to-end. The surface layer doesn't care which Reasoning brain is active.

---

## Track 3 — Reasoning (AI Connectors / the X-axis)

What does the **reasoning**. 9 backend paths today; the dispatcher pattern makes adding more cheap.

**Current state (DONE):**
- **9 backend paths** in `proxy/server.js` — Genie, Foundation Model, Azure OpenAI, Bedrock-direct, Bedrock-RAG, Supervisor, Supervisor-local, ResponsesAgent, plus the dispatcher layer
- **Phase 11a Prompt IR** — vendor-neutral prompt contract + per-backend translators (Genie / FM / Supervisor) with byte-identity coverage on Genie
- **Frame-to-prompt wiring** — frontend `body.frame` + proxy `validateFrame` + `prependFrameContext` + audit log across all 5 start routes
- **Discovery Loop Phase A** — pre-flight reachability fusion (schema + KPI + reachability)
- **Knowledge packs + PackPicker** — pack + sub-vertical selection; provider-neutral
- **Warehouse pre-warm + keepalive** — Databricks SQL Warehouse cold-start mitigation; gracefully no-ops for non-warehouse profiles
- **Sustainability indicator** — real-token forwarding for FM / Azure OpenAI / Bedrock-direct

**Next milestones (parallel):**
1. **Phase 11b dispatcher migration** — wire `buildBackendPayload()` into live Genie / FM / Supervisor request paths. Byte-identical on Genie. *(Codex Lane C candidate)*
2. **Phase C — auto-derived params** — derive frame parameters from snapshot, not just frame ID.
3. **Phase D — staged "1-then-3" rendering** — HEADLINE first, parallel fan-out for the rest.
4. **9 missing cpg-fmcg Prompt IRs** — closes the accuracy upper-bound gap (currently caps at glossary fallback).
5. **Supervisor sub-call usage aggregation** — sustainability dimension; real-token forwarding for the Supervisor path.

**What stays modular:**
- Adding a connector = add a profile entry + a translator. **No** surface-side changes.
- Prompt IR is vendor-neutral by contract. New connectors must accept the same IR shape as Genie does today.
- Knowledge packs don't know about Databricks — they translate to whichever connector is active.
- Warehouse pre-warm is opt-in by profile (proxy returns 400 when no `warehouseId`; the warmer treats this as `no-warehouse`, not an error).

**Non-Databricks proof point:**
Same "Power BI + Azure OpenAI" deployment. Among the 9 backend paths is Azure OpenAI; the Prompt IR translates equally to OpenAI prompts. Pulse Insights pipeline, Discovery Loop, and Frame-to-prompt all work without a single Databricks call.

---

## Track 4 — Experience (Pulse / v0 / Wizard / Persona / Launchpad / Settings)

How the user **interacts**. Independent of which surface + connector they pick.

**Current state (DONE):**
- **4-step first-run wizard** — persona presets (Analyst / Executive / Developer / Designer); full-bleed modal; draft resume; "Re-run setup wizard" Settings entry *(just shipped 2026-05-16)*
- **Persona system** — `applyPersonaDefaults()` seeds `uiMode` + `layoutMode` + connector hint
- **Pulse mode** — full ported Pulse Insights / Chat / Setup experience
- **v0 mode** — Smart-Connect-flavoured components
- **Layout modes** — `ai-left` / `ai-right` / `ai-top` / `ai-bottom`
- **Viewport controls** — focus / maximize / restore / minimize / pin / open-page; `?focus=ai|bi` URL hydration
- **PaneChrome** — overflow menu (⋮), `quiet` mode for empty BI pane
- **Settings IA (5-group)** — BI / AI / Preferences / System / Advanced
- **Knowledge route + KnowledgeShell** — `/knowledge`
- **FramePicker** — dropdown that selects the analysis frame
- **Sustainability indicator** footer in AISidebar

**Next milestones (parallel):**
1. **PulsePlay Home / Launchpad** — persona-aware tile grid (recent reports / Genie Spaces / AI/BI Dashboards / favorites). **Anchor lane** per the Databricks-forward posture. *(Codex Lane B candidate)*
2. **Migration / Bridge mode** — for current PBI estates: inventory report, map pages/KPIs to Unity Catalog / Databricks SQL / AI-BI Dashboard, Genie starter questions, parity validation.
3. **Guided Analysis primary path** — executive brief / variance / risk scan / root cause / BCG / Pareto / RFM. Free-text chat remains available but not the only entry.
4. **Trust + Evidence panel** — source surface, active filters, frame, SQL, lineage, pack, confidence/limitations. (Cross-track with Track 5.)
5. **Per-leaf revert + deep-link copy** (Settings IA fix #8) — small UX polish.
6. **RISKS card red-↑ paradox resolution** — three options outlined; gated on Rajesh decision.
7. **Theme Studio** — first-class no-code visual customisation for the AI briefing + workbench. See [THEME_STUDIO.md](THEME_STUDIO.md) for the full spec.
   - **Phase 1:** `PulsePlayThemeTokens` contract, CSS variable mapping, 4–6 built-in presets, Settings → Preferences → Theme Studio with live preview, localStorage persistence.
   - **Phase 2:** JSON / W3C design-token import + export, per-token contrast validation, fallback-default fill.
   - **Phase 3:** Figma file/key import via proxy relay — variables/styles extraction, name-match heuristic, diff-table review before apply.
   - **Phase 4:** Image upload → client-side palette extraction → AI-suggested theme via proxy (`/theme/suggest`), user confirms before apply.
   - **Hard tripwires (all phases):** preview-then-confirm always; WCAG AA mandatory; `colorGood`/`colorWarn`/`colorBad` cannot become ambiguous; import is data not code execution; reset always works.
8. **Floating Companion Windows** — contextual in-app overlay that lets users view any surface on top of any other without leaving their primary context. See [FLOATING_COMPANION.md](FLOATING_COMPANION.md) for the full spec.
   - **Phase 1:** `CompanionPanel` component (extends existing `FloatingPanel`), surface tab context menu + keyboard-accessible icon button, single companion at a time, snap-to-edge, collapse/pin/dismiss, per-surface localStorage position, BI Viz companion via second `BIPanel` instance.
   - **Phase 2:** Multiple companions (opt-in Settings toggle), "Open in side panel" (transient docked half-panel), Evidence/SQL as companion source.
   - **Hard tripwires:** companion is opt-in/contextual — never auto-opens; permanent Split + Mix layout is unchanged; browser pop-out ("Open in new tab") stays separate; `role="dialog"` focus trap; critical alerts always above companions (`z-index: 1300`); BI sandbox unchanged.

**What stays modular:**
- Personas seed UX defaults (uiMode, layoutMode, connector hint) but are **not bound** to any specific surface or connector. Analyst can drive PBI+Genie OR Tableau+Azure OpenAI equally.
- Launchpad surfaces what's **reachable** via the active allowlist. Absent Databricks → Launchpad shows Power BI tiles or whatever else is allowlisted.
- The Wizard's vendor / connector cards come from `visibleVendors` + `/api/assistant/profiles`. No hard-coded "must show Databricks" branch.

**Non-Databricks proof point:**
Wizard end-to-end with `vendors=[powerbi]` + `connectors=[azure-openai-default]`. Wizard renders. Persona presets apply. Launchpad (when shipped) shows the same PBI report tiles. The 4-step flow does not mention Databricks anywhere.

---

## Track 5 — Trust (Evidence / Provenance / Sustainability / Audit)

Strategy calls for "evidence users can trust, not just prettier AI output." This track makes that visible per answer.

**Current state (DONE):**
- **Sustainability indicator** — token-cost gauge + leaf-smile icon; real-token forward for FM / Azure OpenAI / Bedrock-direct
- **Genie SQL provenance route** — Phase B SQL transparency
- **Diagnostics buffer** — last 20 BI events + console errors
- **Support bundle export** — redacted JSON snapshot for support tickets

**Next milestones (parallel):**
1. **Evidence panel** per answer — source surface, active filters, frame, SQL, pack, confidence/limitations, audit/request-id.
2. **Unity Catalog lineage badge** — shows when Databricks UC lineage is available; **gracefully absent** otherwise.
3. **"Last refreshed" timestamp** per surface tile (consumed by Launchpad).
4. **Per-section token tracing** — drill into which section spent which tokens.
5. **Prompt caching everywhere** — cumulative session token reduction.

**What stays modular:**
- Evidence panel renders whatever provenance the **active** surface + connector expose. Power BI + Genie → SQL + dataset name. Power BI + Azure OpenAI → prompt + context block. Pure Foundation Model → prompt only.
- Lineage badge only appears when the active adapter's `getMetadata()` returns lineage info. Otherwise hidden, not broken.
- Token tracing is per-backend; missing real-token forwarding (Genie / Bedrock-RAG today) falls back to estimation transparently.

**Non-Databricks proof point:**
Evidence panel for a Power BI + Azure OpenAI cell shows: surface name, active filters, frame, prompt, pack, confidence. Lineage badge **hidden** (PBI has no UC lineage). Everything else renders.

---

## Cross-track dependencies

| Milestone | Depends on | Strength | Why |
|---|---|---|---|
| Track 2 — Databricks AI/BI Dashboard adapter | Track 3 — Phase 11b dispatcher | LOOSE | Adapter benefits from frame-aware IR but a stub IR works |
| Track 4 — Launchpad | Track 1 — Allowlist fail-closed | HARD (DONE) | Launchpad only surfaces allowlisted reachable items — already shipped |
| Track 4 — Migration mode | Track 2 — UC asset surface | LOOSE | Maps PBI pages → UC; can start with a stub UC lister |
| Track 5 — Lineage badge | Track 2 — Databricks adapters with `getMetadata()` lineage | HARD | Lineage requires the adapter to expose it |
| Track 3 — Phase D staged rendering | Track 5 — Evidence panel | LOOSE | Staged sections benefit from per-section provenance |
| Track 4 — Trust + Evidence panel | Track 5 — Evidence panel | HARD (same lane) | Cross-track work; coordinate ownership |

Most dependencies are **LOOSE** — work can ship in any order with a graceful stub. Only marked HARD when shipping out-of-order would mean throwing work away.

---

## Modularity guarantees ("we won't get stagnant on Databricks")

Anchor rules. A PR that violates one needs an architectural override (ADR + Rajesh sign-off):

1. **Every surface implements `BIAdapter`.** No `if (vendor === "databricks-aibi") ...` branches anywhere outside the adapter file.
2. **Every connector accepts the same Prompt IR.** No `if (connector === "genie") ...` branches in the dispatcher, the knowledge layer, or the Discovery Loop.
3. **`visibleVendors` is the only filter that hides vendors.** No hard-coded "show Databricks first" in the wizard, Launchpad, or Settings.
4. **Databricks features gracefully no-op when Databricks is absent.** Warehouse pre-warm returns `no-warehouse`; lineage badge hidden; Genie Space tiles absent from Launchpad; nothing crashes.
5. **Power BI bridge stays alive.** v0.2 hardening completes even though Databricks-forward is the destination — the bridge protects current state.
6. **Tableau / Qlik / Looker adapters do NOT get deleted.** Lower priority for SDK graduation, but the iframe stubs stay shipped as the proof of modularity. They can be deleted **only** after another non-Databricks SDK adapter graduates to replace them in the modularity-proof slot.
7. **Personas are surface-agnostic and connector-agnostic.** Analyst persona must work over any allowlisted (vendor × connector) pair.
8. **Wizard does not assume Databricks.** Empty `vendors=[]` is the only state where it doesn't render; otherwise it adapts to whatever's allowlisted.

---

## Version-milestone view (legacy v0.x labels)

Kept for backward compatibility with prior planning docs. Track view above is canonical going forward.

| Version | Tracks involved | Status |
|---|---|---|
| **v0.1.0** | Foundation + Surface + Reasoning + Experience scaffolds | DONE |
| **v0.2.0** | Surface (PBI) + Foundation (auth/allowlist) + Reasoning (Genie cell) + Experience (wizard) | mostly DONE; 10-min author-setup smoke pending; production gate not yet declared |
| **v0.3.0** | Reasoning (Pulse parity) | partial; HEADLINE + staged shipped; validator + per-section retry pending |
| **v0.4.0** | Reasoning (streaming) | not started; Supervisor-stream path exists at the proxy |
| **v0.5.0** | Surface (multi-vendor) + Experience (split layout) | layout DONE; multi-vendor side-by-side pending |
| **v0.6.0** | Experience (voice in/out) | not started |
| **v0.7.0** | Reasoning (AI-driven auto-tour) | not started |
| **v0.8.0** | Experience (AI lens overlay) | not started |
| **v0.9.0** | Experience (save / share / branch sessions) | not started |
| **v1.0.0** | Experience (multi-user collaboration) | not started |
| **v1.1.0** | Reasoning (DuckDB-WASM cross-tool data unification) | not started |
| **v1.2.0** | Experience (scheduled briefings) | not started |

Version labels remain for naming milestones only. Real prioritization happens at the **track level**.

---

## Beyond v1.x

Public-OSS posture, multi-tenant isolation, third-party audit, external commercial packaging — all tracked in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md). The decision to GO public-OSS (and the license choice) is itself a v2 conversation, not committed in this roadmap.

---

## Pack rollouts

Vertical packs (CPG/FMCG, manufacturing, retail, finance, HR, sales, ops, IT) advance in parallel with track milestones. Each pack is a Track 3 (Reasoning) deliverable that ships when its Prompt IR + glossary + sub-verticals are authored. Cardinality and authoring quality are tracked in [PACKS.md](PACKS.md).

---

## See also

- [DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md) — canonical directional baseline (Codex `ecb41c2`, 2026-05-16)
- [ARCHITECTURE.md](ARCHITECTURE.md) — 2-axis abstraction details
- [AGENT_SYNC.md](AGENT_SYNC.md) — active-lane coordination + FEATURE-MAP
- [AGENDA.md](AGENDA.md) — open-work tracker
- [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) — deferred public-OSS items
- [PACKS.md](PACKS.md) — vertical pack architecture
- [HANDOVER.md](HANDOVER.md) — session-by-session work log
