# Unified Ask Pulse Workbench

> Repo-local feature memory. Source of truth for what's landed and what's queued.
> Canonical doc: [UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md).
> ADR: [adr/0008-unified-assistant-surface.md](../adr/0008-unified-assistant-surface.md).

## Goal

Build one Unified Ask Pulse Workbench orchestrating three modes inside the same chat surface — not another sidebar and not a pure Genie iframe replacement.

| Mode | Use case |
|---|---|
| Native Embed | Genie iframe + future vendor-native chat UIs |
| PulsePlay Verified | API-driven (Genie Conversation API, FM, Azure OpenAI, Bedrock, Supervisor, ResponsesAgent) |
| Hybrid | Genie native UX inside the artifact canvas with PulsePlay rails |

## Accuracy contract

No ungrounded artifacts. Every answer carries one of four statuses emitted by the artifact validation gate (never declared by the LLM):

- `verified` — numbers + chart + table derived from a successful query/API/vendor result with provenance
- `grounded-draft` — mixed provenance; sections labeled
- `suggestion` — pattern-matched or generated; cannot promote to chart/table
- `blocked` — validator refused; reason surfaced via Problem Details

## Build sequence

- [x] **1. `UnifiedAssistantSurface` architecture + connector capability model** (landed 2026-05-18, `cc33dca`). Pure TypeScript contract: `playground/src/types/assistant.ts`, `playground/src/lib/connectorCapabilities.ts`, 35 vitest. ADR-0008.
- [x] **2. Genie iframe → assistant axis as `nativeChatEmbed`** (landed 2026-05-18, `840ecf7`). `GenieNativeEmbed` with narrow sandbox + descriptor builders reusing the BI-adapter's URL builder. BI-axis adapter (`bi-adapters/databricks-genie/`) stays alive. 22 vitest (9 component + 13 descriptors).
- [x] **3. Artifact card shell with tabs** `Answer | Chart | Table | SQL | Evidence | Reasoning` (landed 2026-05-18, `908621d`). Real per-tab renderers; status badge per status; aria-tab semantics; the validator (not the renderer) controls tab availability. 32 vitest.
- [x] **4. Verified artifact model + validation gates** (landed 2026-05-18, `b1dbeda`). `validateArtifact()` is the sole authority for status; `llmClaimedStatus` is recorded but never trusted. `pack` citations are NOT data-bearing for chart/table. Frontend `problemDetails.ts` mirrors the proxy shape. 25 vitest including 5 LLM-self-declare override cases.
- [x] **5. ECharts renderer + chart registry** (landed 2026-05-18, `b192164`). Modular `echarts/core` build with per-chart registers (Bar/Line/Pie/Scatter); 43-entry registry with locked per-tier auto-pick policy (Core=always, Advanced=heuristic, Trendy=opt-in, Legacy=never-auto, Future=roadmap); `vegaLiteToECharts.ts` compiles bar/line/area/point/arc. echarts@^5.5 added. Canvas shim in `vitest.setup.ts`. 36 new vitest + 3 updated ArtifactCard.
- [x] **Wiring — `/workbench` route + preview shell** (landed 2026-05-18, `1920531`). Preview-flagged via `VITE_PULSEPLAY_ENABLE_WORKBENCH` (build) or `localStorage.pulseplay:workbench-preview` (runtime). `WorkbenchShell` gate + `UnifiedWorkbench` mode-resolver-driven layout + `demoArtifact.ts` Superstore fixture. 15 vitest.
- [x] **6. Pulse chat asset refactor** (landed 2026-05-18, `a2bd729`). Three additive extractions, no Pulse file modified: `pulse/promptRedaction.ts` wrapped via `composerInput.ts` (sanitizes user input inside `useConversation.ask`); `pulse/genie.ts` `collectGenieSqlFromAttachments` reused from the mapper to lift Phase 11b labelled SQL sections (new `WorkbenchArtifact.sqlSections?` + `SqlTab` subtab strip with full-SQL fallback); Genie `suggested_questions` extracted by the mapper and surfaced by the hook (new `FollowUpQuestions` component renders chips that call `ask` through the same sanitizer). 38 new vitest.
- [ ] **7. Workbench theme** — applied after structure is right; professional neutral baseline + separate data-viz palette + compact/dark/high-contrast modes. ECharts theme registration via the chart registry hook. Pulse `gn-shell--dark` is Pulse-PBI compat surface — do NOT port; rebuild on W3C Design Tokens + `prefers-color-scheme`.

Sequential through 3 (done). Steps 4 + 5 landed in parallel (done). Wiring landed after 5. Steps 6 + 7 follow.

**Cumulative: 165 new vitest across the 6 commits. Full playground sweep 745/745. Build clean.**

## Beyond the build sequence

- [x] **Real Genie conversation wiring** (landed 2026-05-18, `c709578`). `useConversation()` React Query hook + `genieResponseMapper.ts` pure mapping + composer in `UnifiedWorkbench`. Live result replaces the demo fixture as soon as a question completes; demo stays as first-paint fallback. FAILED/CANCELLED upstream → validator-blocked via empty-candidate path. 18 new vitest covering success / polling / failure / blocked / no-ungrounded.
- [ ] **Promote workbench out of preview-flag** once `/workbench` has cycled live use with a real Genie space. Set `VITE_PULSEPLAY_ENABLE_WORKBENCH=true` for the build and retire the demo fixture for users.
- [ ] **`classifyConnectorType` proxy follow-up** to surface `responses-agent` from the probe classifier; the workbench matrix already lists it for forward compatibility.
- [ ] **Conversation history** — `ask()` currently CLEARS the prior poll cache so each new turn starts clean. If history view is wanted later, change the cache strategy to APPEND.

## Capability matrix (current)

| Connector | Native | Verified | Hybrid | Streaming | Grounded SQL |
|---|:--:|:--:|:--:|:--:|:--:|
| `genie` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `supervisor-local` | — | ✅ | — | ✅ | ✅ |
| `supervisor` | — | ✅ | — | ✅ | ✅ |
| `foundation-model` | — | ✅ | — | ✅ | ✅ |
| `openai-chat` | — | ✅ | — | ✅ | — |
| `openai-analytics` | — | ✅ | — | ✅ | ✅ |
| `bedrock-rag` | — | ✅ | — | ✅ | — |
| `bedrock-direct` | — | ✅ | — | ✅ | — |
| `responses-agent` | — | ✅ | — | ✅ | ✅ |
| `generic` | — | — | — | — | — |

Only Genie supports hybrid today. Enforced by an invariant test, not by convention.

## Tripwires

- Artifact status (`verified` / `grounded-draft` / `suggestion` / `blocked`) is emitted by the validator. The LLM CANNOT self-declare any status.
- Step 6 is additive only. The Pulse-PBI sibling still consumes `playground/src/pulse/*`. Extracted reusable assets land in new PulsePlay-native modules with shims where needed.
- Do not deprecate `bi-adapters/databricks-genie/` when Step 2 lands. A Genie space is legitimately both a BI surface and a chat surface; the workbench adds an assistant-axis presentation alongside the existing BI-axis presentation.
- ECharts bundle pressure: use the modular build (`echarts/core` + per-chart registers). Decide tier-by-tier whether to lazy-load.
- `classifyConnectorType` in `proxy/lib/connectorProbe.js` does not currently return `responses-agent` even though the matrix here lists it. Tracked as a follow-up; the type registry is forward-compatible.
- Strategy lock supersedes the 2026-05-17 AGENT_SYNC "unified surface tabs" proposal. AI Insights stays a sibling pane; the floating comparison layer and Pulse Bubble launcher are research-only.

## Reverted scaffold (2026-05-18)

Commits `a7d487d` → `3eb1093` ("Steps 1-7 fully completed") were a stub scaffold that did not compile (PowerShell here-string mangled template literals in `ArtifactCard.tsx` and `GenieNativeEmbed.tsx`), violated the LLM-cannot-self-declare-status rule, used the wide-open iframe sandbox, did not wire anything into `App.tsx`, and never touched `visual.tsx` despite the commit message claiming a refactor. Reverted in commits `6d88bb8` → `b7daa2d`. Strategy lock cherry-picked as `577f3e7`. Real Step 1 starts from there.
