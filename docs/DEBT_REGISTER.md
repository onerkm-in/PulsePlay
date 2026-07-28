# Debt Register

> The known duplication, dead code, and structural debt — with evidence, risk, and a burn-down
> plan per item. **Rule: every substantial session retires at least one item or shrinks D5.**
> LLMs only add code; sustainability demands scheduled subtraction. Update the Status column
> in the same commit that changes an item; never delete a row (mark RETIRED with the commit).

Legend — Risk: how dangerous the fix is. Decision: `—` = executable as described;
`OWNER` = needs a product/architecture decision by the named human owner first.

## D1 — Three parallel pack corpora (worst duplication)

| | |
|---|---|
| **Copies** | 1) filesystem `pulsepacks/<pack>/…` (proxy reads: packRegistry/packPromptLoader) 2) hard-coded `PACK_REGISTRY` in `playground/src/authoring/businessContextProfile.ts:163` 3) preset libraries `playground/src/pulse/insightsPresetLibrary.ts` + `_packs/cpgFmcgPresets.ts` |
| **Observed harm** | `finance-fpa` exists in corpus 3 but not corpus 2 → the pack-driven headline feature is silently inert for the live pack (HANDOVER latest+23). Drift is structural, not hypothetical. |
| **Target state** | ONE served corpus: proxy serves `GET /assistant/domain-context` from `pulsepacks/` (per `docs/AI_CONTEXT_CONFIGURATION_MODEL.md:113-118`); client corpora become fetch-and-cache consumers, then get deleted. |
| **Risk** | Medium — client fallbacks needed for offline/PBI-sandbox mode. |
| **Decision** | **DECIDED 2026-07-28 (owner):** `pulsepacks/` is the single canonical source. Remaining sub-decision: author KPIs for `finance-fpa` or drop it. |
| **Status** | DECIDED — ready to execute (serve `GET /assistant/domain-context` from pulsepacks/, convert client corpora to consumers, then delete them) |

## D2 — Two canvas stores (one already destroyed user data)

| | |
|---|---|
| **Copies** | 1) localStorage `pulseplay:canvas-tiles` (`lib/canvasTiles.ts` — LIVE store for Dashboard CanvasGrid/NativeCanvas) 2) server canvas sections (`canvas/canvasClient.ts` → `/decision-canvas/sections` — used by the cockpit MyCanvasRegion) |
| **Observed harm** | `canvas/browserMigration.ts` boot-purged the LIVE store believing it legacy — pinned tiles (rows+SQL+layout) destroyed, unrecoverable. Purge removed + key renamed in `c7842e3`, but the duplication that *caused* the mistake remains. |
| **Target state** | Port CanvasGrid/NativeCanvas to the server store (`canvasClient.saveSection/listSections`), migrate existing local tiles up once, then delete `lib/canvasTiles.ts` and re-enable the browser purge legitimately. |
| **Risk** | Medium — pin flows from 3 call sites (`visual.tsx:10131`, `visual.tsx:12729`, `lib/canvasTileActions.ts:45`, `multipane/dashboardAutoSeed.ts:118`). |
| **Decision** | — |
| **Status** | OPEN (destroyer neutralised `c7842e3`; consolidation pending) |

## D3 — Legacy setup wizard alongside Settings (~5,900 duplicated lines)

| | |
|---|---|
| **Copies** | `pulse/setupWizard.tsx` (5,096) + `setupStep5.tsx` + `setupStep5Guided.tsx` (769) + `setupDraft.ts` vs the canonical Settings shell (`settings/*`). ~100-field draft duplicated. |
| **Observed harm** | Every settings-shape change must be found in both; the wizard's default validate is a 1.5s always-green stub (`setupWizard.tsx:583`). |
| **Target state** | ~~Delete the in-visual wizard~~ **REVISED after investigation (2026-07-28): deletion is BLOCKED — the wizard is the PBI sibling's ONLY authoring surface.** Evidence: `sync-from-pulseplay.mjs` copies `playground/src/pulse/**` wholesale into `enablers/pulse-pbi-gn/src/` every build; `visual.tsx:82` imports/renders SetupWizard; the sync STUBS `../settings` to `_ext/` sandbox stubs, so the Settings shell never ships in the `.pbiviz`; `showSetupAccess` defaults true in the shared heritage settings (only PulsePlay's adapter seeds it false). |
| **Reclassified** | Not deletable duplication — a **sibling-owned surface** hosted in this tree. Residual debt = double-maintenance of the settings shape across wizard and Settings shell (both read the same `settings.ts` model, which bounds the drift). Options if the burden grows: (a) drop authoring from the PBI enabler (product call), (b) port a minimal settings surface into the pulse tree, then delete the wizard. |
| **Decision** | Resolved for now: KEEP, mark ownership in a header comment. Revisit only if the PBI enabler's authoring needs change. |
| **Status** | INVESTIGATED-KEEP (2026-07-28) — severity downgraded from HIGH-delete to documented dual-surface |

## D4 — Dormant Prompt IR (built, tested, wired to nothing)

| | |
|---|---|
| **Evidence** | `promptDispatcher.buildBackendPayload` has **zero** callers in `server.js`; live routes inject Genie-shaped `prompt-context.md` verbatim into every backend (`server.js:3576`, `:7347`). `foundationModelClient` discards the `tools[]` the translator already emits. |
| **Target state** | Not deletion — **wiring**. This is the strategic seam of the domain-guidance unification (memory `project_domain_guidance_feasibility_2026_07_27`, slice 4) and the tool-calling path for the agent planner. |
| **Risk** | High (touches the core AI path for every backend) — do as a focused, reviewed effort with byte-compat fallback (translator already guarantees Genie parity). |
| **Decision** | — (sequencing only: after D1, with the unification) |
| **Status** | OPEN — deliberate, keep; do not "clean up" by deleting |

## D5 — `visual.tsx` at 13,485 lines (measured 2026-07-28)

| | |
|---|---|
| **Measured structure** | 153 top-level declarations. The problem is ONE: the `App` component = **6,819 lines** (`:1317`). Largest extractables: `SetupEditFlow` 413, `renderMessageBody` 352, `renderInsightsSections` 302, `SetupPanel` 274, `renderSectionBody` 270, `MessageCard` 258, `inlineFormat` 214, `InsightsSectionFooter` 209, `renderKpiSnapshotInner` 179, `GenieChart` 178, `renderNarrative` 177. |
| **Split plan** | **Phase 1 (mechanical, low risk):** move the pure renderers + helpers already at top level (`renderMessageBody`, `inlineFormat`, `MessageCard`, `GenieChart`, KPI renderers, `InsightsSectionFooter`, `renderNarrative`, `renderSectionBody`) → `pulse/rendering/*` modules. ~2,300 lines out, no behaviour change, existing tests gate it. **Phase 2:** `SetupPanel`/`SetupEditFlow` → `pulse/setup/` (or die with D3). **Phase 3 (the real one):** decompose `App` by extracting its state machines into hooks — chat (`useAskPulseChat`), insights orchestration (`useInsightsRun`), settings sync — one hook per session, test-gated. |
| **Risk** | Phase 1 low; Phase 3 medium (HMR/staleness bugs have bitten this file — do one hook at a time, full suite between). |
| **Decision** | — |
| **Status** | OPEN — measured, phased, ready to start |

## D6 — Dead / stub inventory (dispositions for all 18 from the 2026-07-28 survey)

| Item | Disposition |
|---|---|
| `ai_narrated` flag (type + render + css) | **RETIRED** — deleted (never set anywhere) |
| `surfaceConnectors` always-null seam | **RETIRED** (same day) — module + test + listener machinery deleted from App.tsx and visual.tsx; chat-state storage key kept a literal "" segment so saved histories still match. |
| Frame picker (inert Phase B) | **OWNER** — wire the ask-flow or remove the picker; presentation-only today (`FramePicker.tsx:6-10`) |
| Decision Canvas "Coming soon" cards ×3 | **OWNER** — product placeholders; ship or drop |
| Relevance engine (in-memory only) | **OWNER** — needs the interaction-event Delta table or removal |
| Detection engine offline-only (CLI by hand) | **OPEN** — schedule as a Databricks job (design exists in `feature_action_insights_engine_databricks` memory) |
| Feedback loop write-only (`/feedback` no consumer) | **OWNER** — build a reader or stop implying it's used |
| Multi-connector panes (flag default-OFF) + per-surface connectors | Keep flagged; delete if not revived by next quarter |
| Gateway/foundation-stream "preview" connectors | Keep — labelled honestly as coming-soon |
| Tableau/Qlik/Looker/AIBI iframe stub adapters | Keep — deliberately hidden from pickers; v1 scope |
| Desktop runtime no-ops in browser | Keep — deliberate EXE-mode guards, documented |
| Setup access = UX gate not authz | Keep documented — server enforcement is a PROD-gate item with Okta |
| `vegaLiteToECharts` partial fidelity / chart roadmap tier | Keep — honest "not implemented" notes |
| Legacy wizard always-green validate stub | Dies with D3 |
| PNG/Excel export self-disable in sandbox | Working as designed |
| Two tab-bar components (pp vs gn) | Visually unified via CSS (`1fbdf68` + aliasing); STRUCTURAL unification open — fold into D5 Phase 3 |
| `pulseplay:canvas-tiles-migrated` marker residue | Dies with D2 |
| Ask Pulse KPI-preload spends a Genie conversation (COST-P1, AGENDA) | OPEN — fold into the spend-budget work |

## D8 — Number formatting: four vocabularies, one of them the model's

| | |
|---|---|
| **Copies** | `formatValueByUnit` emits B/MM/M (`columnLabels.ts:234`), `contextBuilder.formatNumber` emits M/K (`:342`), `fmtUsd` emits M/K (`DecisionCanvasShell.tsx:90`), and now `metricFrame.formatMagnitude` emits the project Roman scale M/MN/B. Separately the MODEL formats prose per domain guidance — `MN` exists nowhere in code as an emitted suffix. |
| **Observed harm** | The same figure rendered `$1,031.41 MN` in one section and `$1.03 B` in another (2026-07-28). Fixed at the guidance layer for AI prose, but the four code formatters still disagree with each other and with the stated convention. |
| **Target state** | ONE exported formatter (extend `metricFrame.formatMagnitude`, which already encodes the documented convention and is unit-tested), consumed by the other three call sites; keep the model's own formatting governed by guidance only. |
| **Risk** | Low-medium — each call site has pinned display tests. |
| **Decision** | — |
| **Status** | OPEN (surfaced 2026-07-28 while fixing the MN-vs-B defect) |

## D9 — Synthetic per-market value flatness

| | |
|---|---|
| **Evidence** | After the grain fix (`b0e4102`) per-market gross margin still spans only **0.90 pp** (55.47–56.37, measured live). Every market draws from the same noise distribution in the value model, so margin cannot differentiate anything. |
| **Observed harm** | "STRENGTHS ranked by margin" is uninformative — the ranking is noise even though the trends are now real. Weakens the demo narrative. |
| **Target state** | Per-market cost-structure bias in the value model (`cpg_reskin.fact_value` / `kpi_inputs`), so margins differ by a few points the way real markets do. |
| **Risk** | Low (synthetic data), but it changes every demo number again — pair it with one regeneration. |
| **Decision** | — |
| **Status** | **RETIRED 2026-07-28** (`MARKET_ECON` in cpg_reskin.py; tables regenerated). Live after: margin spread **9.49 pp** (VE 50.31% … UY 59.80%, was 0.90 pp) and size ratio **8.8x** (BR $469 MN … SV $53 MN, was ~1.1x), with YoY trends and the company margin trend intact. 3 new pins. |

## D7 — Server-side spend budget (planned, not yet built)

The last gate before any agent executor: all four no-spend-without-intent gates are client-side.
Design agreed 2026-07-28 (per-`agentRunId` ceilings: 8 calls / 4 Genie convs / 10 min / 3 concurrent
runs; agent-only enforcement first). Status: OPEN — next scheduled build item.

---

*Created 2026-07-28. Companion process: `docs/MAINTENANCE_PLAYBOOK.md`.*
