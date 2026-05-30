# Uniform Layout Without Rebuild - Claude Handoff

Date: 2026-05-27

## Why this exists

Rajesh's latest correction is important: after seeing the screenshots and smoke results, it is clear PulsePlay already has most of the right pieces. The problem is not that the app needs to be reconstructed. The problem is that multiple layout layers are hidden, stacked, or competing, so the product can feel less uniform than the architecture actually is.

Claude should treat the next UX work as a reveal-and-align pass, not a rewrite.

## Core Rule

Do not rebuild the shell. Do not create a new app layout system. Do not introduce another top-level navigation, another tab model, or another card shell around surfaces.

Preserve the current architecture and make the existing layers read as one system:

- AI Insights = executive briefing surface.
- Ask Pulse = conversational analysis surface.
- Dashboard = data canvas surface.
- Dashboard internal modes = `Embedded BI` or `Pulse Canvas`.
- All surfaces expose the same context grammar: `Surface`, mode, `Assistant`, `Source`, `Scope` or `Pack`, and `Trust`.

Uniformity means shared vocabulary, shared spacing rhythm, predictable responsive behavior, and no hidden control overlap.

## Current Layer Map

The active UI is not one flat screen. Claude must account for these layers before changing layout:

| Layer | File(s) | Role | Risk |
|---|---|---|---|
| App top bar | `playground/src/App.tsx` | Product identity + Setup readiness pill | Can steal vertical space on small screens |
| Global window controls | `playground/src/components/TopRightToolbar.tsx` | Maximize/minimize/pin/pop-out/open controls | Previously overlapped Pulse tabs on 390px mobile |
| Split layout / pane chrome | `playground/src/App.tsx` | Hosts AI pane and BI/Dashboard pane | Easy to duplicate controls if misunderstood |
| Pulse internal header | `playground/src/pulse/visual.tsx` | AI Insights / Ask Pulse / Dashboard tab row | This is the active AI surface nav |
| Pulse context strip | `playground/src/pulse/visual.tsx`, `playground/src/pulse/style/visual.less` | Shared context/trust grammar for AI Insights + Ask Pulse | Must stay slim; do not turn into a second header |
| Dashboard context strip | `playground/src/App.tsx`, `playground/src/styles.css` | Same grammar for Dashboard | Must describe `Pulse Canvas` vs `Embedded BI` clearly |
| BI/native canvas | `playground/src/biPanel/*`, `playground/src/visualization/NativeCanvas.tsx` | Renders embedded BI or Pulse artifacts | Do not confuse native renderer with a BI vendor |

## What Is Already In Place

The following should be preserved and extended rather than replaced:

- Top-level three-surface mental model: `AI Insights`, `Ask Pulse`, `Dashboard`.
- Uniform surface context strip shipped on 2026-05-27.
- Dashboard naming that keeps one tab but clarifies internal modes.
- Native Canvas artifact labels: `Pulse Canvas`, `Pulse chart`, `Pulse table`, `Pulse KPI`, `Pulse narrative`.
- Existing `PaneEmptyState` vocabulary for empty states.
- Existing `gn-*` Pulse design system for Pulse surfaces.
- Existing `pp-*` app design system for host/Dashboard surfaces.
- Existing viewport controls and tests.

## What Is Missing

The next pass should improve consistency without reshaping the product:

1. One visual hierarchy across all three surfaces:
   - Top surface row.
   - Slim context strip.
   - Content area.
   - Action/composer/footer area where relevant.

2. One responsive rulebook:
   - Under 640px, primary surface tabs must always be tappable.
   - Desktop-only controls should collapse, hide, or move before they overlap primary tabs.
   - Surface/context strips may wrap, but must not force horizontal scrolling.

3. One empty/loading/error grammar:
   - AI Insights empty state should read like "briefing not ready yet."
   - Ask Pulse empty state should read like "conversation ready."
   - Dashboard empty state should read like "choose Embedded BI or Pulse Canvas."
   - All should use the same CTA weight, same top anchoring, same trust/source language.

4. One artifact grammar:
   - Narrative, table, chart, KPI, SQL/evidence, and export affordances should appear in the same relative places across AI Insights and Ask Pulse.
   - Dashboard/native canvas should use artifact-specific labels, never generic backend status copy as visible UI.

## How To Get The Best Layout Without Compromise

Work in small alignment slices:

1. Screenshot first.
   Capture desktop around 1440x900 and mobile around 390x844 for all three surfaces before each layout change.

2. Identify which layer owns the issue.
   Example: mobile Dashboard tab taps were blocked by `TopRightToolbar`, not by Pulse tabs themselves. Fix the owning layer; do not rebuild the tab strip.

3. Prefer CSS/flex/z-index/overflow fixes over structural rewrites.
   Most current problems are layer coordination problems: fixed toolbar overlap, flex height, sticky composer, scroll containment, top anchoring, and wrapping.

4. Use shared names and compact components.
   Extend `PulseSurfaceContextStrip` / `DashboardSurfaceContextStrip` patterns before inventing a new header. If a strip grows too much, hide secondary facts behind disclosure rather than adding another row of chrome.

5. Keep Dashboard as one top-level tab.
   Do not split Dashboard into separate `Embedded BI` and `Pulse Canvas` tabs. Those are modes inside Dashboard.

6. Do not revive retired surfaces.
   `AISidebar.tsx` is not the active Ask Pulse target. The active AI surface is in `playground/src/pulse/visual.tsx` and `playground/src/pulse/style/visual.less`.

## Claude Implementation Guardrails

Before touching code:

- Run `git diff HEAD` and inspect current local changes.
- Read this handoff plus the top entries in `docs/HANDOVER.md` and `docs/memory/project_state.md`.
- Inspect the active layers listed above.

During implementation:

- Preserve the `Surface / mode / Assistant / Source / Scope|Pack / Trust` grammar.
- Avoid nested cards inside cards.
- Avoid new decorative palettes, gradients, or hero-like layouts.
- Keep cards only for repeated items, modals, or real framed tools.
- Use existing `gn-*` and `pp-*` tokens/classes unless a shared component truly needs one small new class family.
- Use top anchoring for empty states; avoid vertically centered dead space.
- Validate mobile tap targets and overlap, not just desktop appearance.

After implementation:

- Run at least:
  - `cd playground && npm run lint`
  - focused Vitest for touched areas, usually `npm test -- NativeCanvas viewportControls`
  - `cd playground && npm run build` for layout/system changes
- Run a local Playwright smoke if the shell changed:
  - Desktop 1440x900: AI Insights, Ask Pulse, Dashboard.
  - Mobile 390x844: AI Insights, Ask Pulse, Dashboard, confirm no horizontal overflow and no blocked primary tab taps.
- Update `docs/HANDOVER.md` and `docs/memory/project_state.md`.

## Acceptance Criteria

Claude should consider the next layout pass successful only when:

- A viewer can tell which of the three surfaces they are on within one glance.
- The same context facts appear in the same order on all three surfaces.
- The Dashboard tab clearly explains whether it is showing `Embedded BI` or `Pulse Canvas`.
- No global toolbar, pane chrome, context strip, composer, or empty state overlaps another primary control at 390px mobile width.
- No screen needs a new mental model to understand where AI, BI, context, trust, and artifacts live.

## Non-Goals

- No new frontend framework.
- No shell rewrite.
- No new top-level route just for the three surfaces.
- No separate Dashboard sub-tab for `Pulse Canvas`.
- No backend connector changes.
- No vendor adapter changes unless a layout issue is specifically caused by adapter mounting.

## Claude Prompt To Use

If handing this to Claude directly, use:

```text
Read docs/research/UNIFORM_LAYOUT_WITHOUT_REBUILD_CLAUDE_HANDOFF_2026-05-27.md first. The task is to improve uniformity across AI Insights, Ask Pulse, and Dashboard without reconstructing the shell. Preserve the existing three-surface architecture and the 2026-05-27 surface context grammar. Inspect screenshots at desktop and 390px mobile before changing code. Fix the owning layer for any overlap or inconsistency; prefer targeted CSS/flex/overflow/component alignment over structural rewrites. Do not revive AISidebar.tsx. Validate with playground lint, focused viewport/native tests, build, and desktop/mobile smoke.
```
