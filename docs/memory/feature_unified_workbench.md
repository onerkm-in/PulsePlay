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

- [x] **1. `UnifiedAssistantSurface` architecture + connector capability model** (landed 2026-05-18). Pure TypeScript contract: `playground/src/types/assistant.ts` (modes, artifact model, citations, capability flags), `playground/src/lib/connectorCapabilities.ts` (matrix for all 10 connector types + `resolveAssistantMode()`), 35 vitest cases. ADR-0008.
- [ ] **2. Genie iframe → assistant axis as `nativeChatEmbed`** (keep BI-axis presentation too). Adds the runtime descriptor + native embed iframe component; wires Embed Genie URL/iframe field through.
- [ ] **3. Artifact card shell with tabs** `Answer | Chart | Table | SQL | Evidence | Reasoning`. Reusable component; stub renderers initially; consumes existing Genie response shape.
- [ ] **4. Verified artifact model + validation gates.** Zod schemas; four-status mapping; `Blocked` returns Problem Details; test fixtures cover LLM self-declared `Verified` being overridden.
- [ ] **5. ECharts renderer + chart registry.** Modular build (`echarts/core` + per-chart registers); Vega-Lite → ECharts compiler stub; tier-classified registry.
- [ ] **6. Pulse chat asset refactor** — **additive only**, respects [PULSE_PORT_DETANGLING.md](../PULSE_PORT_DETANGLING.md). Pulse-PBI sibling still consumes `playground/src/pulse/*`.
- [ ] **7. Workbench theme** — applied after structure is right; professional neutral baseline + separate data-viz palette + compact/dark/high-contrast modes.

Sequential through 3. Steps 4 + 5 can land in parallel. Steps 6 + 7 follow.

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
