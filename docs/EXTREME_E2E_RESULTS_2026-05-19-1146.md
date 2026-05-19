# PulsePlay extreme E2E results — 2026-05-19-1146

Run type: partial, visible in-app browser only after Rajesh requested observable testing. This is not a full 2,604-scenario completion.

## Summary

| File | Total | PASS | FAIL | SKIPPED | N/A | Critical FAIL | High FAIL |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01_adversarial | 900 | 0 | 0 | 900 | 0 | 0 | 0 |
| 02_complex_edge | 660 | 8 | 1 | 651 | 0 | 0 | 1 |
| 03_routine_complex | 470 | 0 | 0 | 470 | 0 | 0 | 0 |
| 04_functional_integrity | 574 | 15 | 5 | 554 | 0 | 0 | 5 |
| **TOTAL** | **2604** | **23** | **6** | **2575** | **0** | **0** | **6** |

**Tier achieved:** Not scored. This was a partial visible run with most catalog scenarios intentionally skipped; no Critical failures were observed in the executed slice, but the High UX findings block any quality-tier claim.

## Pre-flight

- Proxy health: PASS — `http://127.0.0.1:8787/health` returned `ok:true`, profiles `default` and `supervisor`.
- Dev server: PASS — `http://127.0.0.1:5173` and `http://127.0.0.1:5174` returned HTTP 200.
- Baseline tests: PASS — playground Vitest `918/918`.
- TypeScript/lint: PASS — `npm run lint` clean.
- Catalog count audit: the prompt said 2,544 scenarios, but files on disk parse to 2,604: `900 + 660 + 470 + 574`.

## Extended Visible Pass

After the initial root-surface checks, Rajesh asked Codex to stick with the broader testing plan before handing off to Claude. Codex ran an additional visible screen-by-screen pass over Settings Setup, BI, AI, Preferences, System, Advanced, Knowledge, Launchpad, Workbench, root AI Insights, root Ask Pulse, and root BI Viz. Evidence is captured under `docs/evidence/visible-e2e-2026-05-19-1146/` as screenshots `04` through `20`, plus `extended-visible-audit.json`.

Focused Claude backlog: `docs/CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md`.

Important limitation: the in-app browser panel was constrained to roughly `599x694` during the extended pass. Treat those screenshots as compact-layout evidence, not full-desktop proof. The existing `03-mobile-floating-dock-offscreen.png` remains the strongest mobile failure evidence for the floating Dock issue.

## High failures

### UX-SURFACE-01: BI Viz feels like a different layout, not a unified peer surface

- Severity: High
- Persona: end user
- Action taken: Open root app, click the top `BI Viz` surface action.
- Observed: The screen changes from the AI Insights surface to a BI-oriented layout with `BI-only mode` copy and a separate visual grammar. It reads as a mode/layout jump instead of one unified platform surface.
- Expected: AI Insights, Ask Pulse, and BI Viz should feel like peer surfaces inside one stable shell. Switching should preserve the same surface-switcher grammar and change only the content area.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`
- Suggested action: Rework the unified surface switcher and BI Viz route so the click does not present `BI-only mode` in the default unified experience. Keep the shell stable, share toolbar grammar, and render BI empty/embed state as a peer content surface.

### UX-SURFACE-02: BI Viz button/icon treatment is not smooth enough

- Severity: High
- Persona: end user
- Action taken: Compare the `AI Insights`, `Ask Pulse`, and `BI Viz` controls in the visible app shell.
- Observed: `BI Viz` looks heavier and less native than the AI tabs. The visible text/icon treatment can read as `BI BI Viz`, making the control feel bolted on.
- Expected: The surface switcher should use a consistent, smooth, icon-led segmented-control language across all three surfaces. The BI icon should support the label without duplicating or creating a separate-button feel.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`
- Suggested action: Treat `BI Viz` as the third peer segment, not a special action button. Use consistent icon wells, active/hover states, labels, aria names, and motion timing.

### RESP-MOBILE-FLOATING-DOCK: mobile floating panel Dock control is offscreen

- Severity: High
- Persona: end user on mobile
- Action taken: Set visible browser viewport to 390x844, open root app, pop out the AI panel.
- Observed: The floating panel opens, but the Dock control geometry is offscreen: `x=453.4`, `w=55.8`, viewport width `390`. The user cannot reliably dock it from mobile.
- Expected: Companion/floating controls should remain visible and reachable at mobile width. If a free-floating panel is not ergonomic on mobile, switch to a mobile bottom sheet or full-screen companion with fixed close/dock controls.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png`
- Suggested action: Clamp floating panel bounds and control positions at small breakpoints, or replace mobile floating mode with a bottom-sheet/full-screen companion pattern.

### UX-COMPANION-01: docking/undocking semantics are pane-level, but need to be component-level

- Severity: High
- Persona: end user
- Action taken: Review floating behavior while switching among `AI Insights`, `Ask Pulse`, and `BI Viz`.
- Observed: The current pop-out affordance reads as "pop out AI panel" and carries the broader pane/shell grammar with it. That makes the companion feel like a detached layout chunk rather than a specific surface.
- Expected: Dock/undock must be available per individual component/surface. If the user is on `AI Insights` and clicks pop-out, only the `AI Insights` surface undocks. `Ask Pulse` and `BI Viz` remain normal peer surfaces in the main shell. The main screen must stay visually uniform and intact.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png`
- Suggested action: Introduce a surface-scoped companion model: `surfaceId = ai-insights | ask-pulse | bi-viz | evidence | workbench`, where each surface can be independently docked/undocked. The floating panel should render only that surface's content and controls, while the primary shell keeps the same surface switcher and layout.

### UX-COMPANION-02: user cannot launch any surface as a companion from any other surface

- Severity: High
- Persona: end user
- Action taken: Review expected workflow while the user is on one surface, for example `BI Viz`, and wants to inspect another surface, for example `AI Insights`, without leaving the current context.
- Observed: The current affordance is tied to the current pane/panel pop-out. There is not yet a clear "open any surface as companion" model from the active surface.
- Expected: From any screen, the user should be able to launch any other surface as a popup/companion: `AI Insights`, `Ask Pulse`, `BI Viz`, Evidence, or future Workbench surfaces. Right-click/context menu is a good power-user path, but there must also be a keyboard-accessible visible control.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`
- Suggested action: Add a surface context menu and/or companion launcher. Example: right-click `BI Viz` or use a `+ Companion` / `Open surface` control to choose `AI Insights`, `Ask Pulse`, `BI Viz`, `Evidence`, etc. The selected surface opens as a companion without replacing the primary surface.

### UX-NAV-01: every screen needs a non-blocking companion escape hatch

- Severity: High
- Persona: end user and author
- Action taken: Review the unified surface and Settings flows for whether the user can summon context/help/another surface without leaving the current screen.
- Observed: The current companion concept is still centered on the main AI/BI pane. The same pattern is not yet guaranteed across Settings, Setup, Governance, Developer Tools, Knowledge, Workbench, Launchpad, and future surfaces.
- Expected: The user should never feel blocked or confused on any screen. Every screen should expose the same interaction grammar for companion context: open `AI Insights`, `Ask Pulse`, `BI Viz`, Evidence, Help/Docs, or relevant diagnostics without losing the current task.
- Evidence:
  - `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`
  - `docs/evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png`
- Suggested action: Design a global companion-launch contract that all screens implement. It should be available through a visible launcher and contextual menus, keyboard accessible, mobile safe, and scoped to the current task so it supports rather than interrupts the user's flow.

## Skipped / inconclusive

| Reason | Count | Sample IDs |
|---|---:|---|
| User requested visible open-screen testing only; full hidden/static catalog sweep paused | 2578 | SEC-INJ-001, EDGE-I18N-001, FUNC-PRIM-001 |
| In-app browser automation clipboard limitation; not scored as product failure | 1 | SHELL-SEARCH-VISIBLE |

## Notable observations

- Mobile feasibility is promising for the base shell: Settings Setup, status chips, AI Insights, Ask Pulse composer, BI Viz access, and tablet/desktop layouts showed no page-level horizontal overflow in the visible checks.
- The unified-platform feel needs another design pass. The current interaction still leaks old mode concepts (`BI-only mode`) into the peer-surface model.
- Docking/undocking should be component-specific. The product should never feel like the whole AI pane was torn out of the app when the user only wanted `AI Insights` as a companion.
- Companion launch should be cross-surface: while in BI Viz, the user should be able to open AI Insights as a popup/companion without leaving BI Viz, and vice versa.
- The same non-blocking companion pattern should apply to every screen, including Settings and authoring flows, so users always have a way to get context, compare, or troubleshoot without losing their place.
- The visual language should become more icon-native and smoother, especially around surface switching and pane actions.
