# Copy-paste prompt for Claude — unified surface UX fixes

Rajesh and Codex ran a visible in-app browser E2E slice on `http://127.0.0.1:5174`. Pre-flight passed: proxy healthy, dev server healthy, playground `918/918`, lint clean. The run found a focused set of UX gaps that should be fixed before calling the unified surface polished.

Start with the focused backlog first:

- `docs/CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md`

## Evidence

- `docs/EXTREME_E2E_RESULTS_2026-05-19-1146.md`
- `docs/evidence/visible-e2e-2026-05-19-1146/extended-visible-audit.json`
- `docs/evidence/visible-e2e-2026-05-19-1146/01-root-ai-insights.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/04-settings-setup-desktop.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/07-settings-preferences-desktop.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/11-launchpad-desktop.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/12-workbench-desktop.png`
- `docs/evidence/visible-e2e-2026-05-19-1146/15-root-bi-viz-desktop.png`

## User feedback to honor

Rajesh sees a gap in the `BI Viz` button/icon treatment. It should use smoother, more natural iconography and should not feel like a separate product or layout. The interaction must feel like one uniform platform, not segregated AI and BI surfaces stitched together.

Additional clarification from Rajesh: docking / undocking must be per individual component/surface. If the user is in `AI Insights` and clicks pop-out, only the `AI Insights` screen should undock. The rest of the unified screen must remain intact and visually consistent.

Second clarification from Rajesh: from any screen, users should be able to launch any other surface as a popup/companion. Example: while staying in `BI Viz`, right-click or use a visible launcher to open `AI Insights` as a companion without replacing the BI view.

Third clarification from Rajesh: the same principle applies to all other screens too. The user should not feel blocked or confused anywhere. Settings, Setup, Governance, Developer Tools, Knowledge, Workbench, Launchpad, BI surfaces, and AI surfaces all need a consistent way to summon context or another surface without losing the current task.

## Required fixes

1. Make `AI Insights`, `Ask Pulse`, and `BI Viz` feel like true peer surfaces in one stable switcher.
   - `BI Viz` should not read as a separate action bolted onto AI tabs.
   - Avoid duplicated text/icon feel like `BI BI Viz`.
   - Use consistent icon wells, active states, hover states, transitions, sizes, aria names, and motion timing.

2. Fix the BI Viz transition.
   - In default unified mode, clicking `BI Viz` should not show `BI-only mode` copy or a visually different layout grammar.
   - Keep the same shell/surface-switcher container and switch only the content area.
   - Empty state can say BI config is needed, but it should feel like the BI surface inside PulsePlay, not a separate BI-only app mode.

3. Fix mobile floating companion behavior.
   - At 390x844, popping out AI makes the Dock control offscreen (`x=453`, viewport width `390`).
   - Clamp panel width/position and keep dock/close controls visible, or switch mobile to a bottom-sheet/full-screen companion pattern.

4. Make docking / undocking component-specific.
   - Do not treat pop-out as "detach the whole AI pane."
   - Model the companion by surface/component id, for example `ai-insights`, `ask-pulse`, `bi-viz`, `evidence`, `workbench`.
   - If the active surface is `AI Insights`, pop-out should render only AI Insights content in the companion window.
   - The main shell should keep the same unified switcher and layout while the component is floating.
   - Each surface should have a consistent dock/pop affordance, either via icon button, context menu, or both.

5. Add cross-surface companion launch.
   - From any active surface, the user should be able to open any other surface as a companion.
   - Example: user is in `BI Viz`, has a doubt, and opens `AI Insights` as a companion without leaving BI Viz.
   - A right-click/context-menu option is acceptable for power users, but add a keyboard-accessible visible path too.
   - Suggested interaction: surface switcher item context menu with `Open as companion`, plus a `+ Companion` / surface launcher menu.
   - Do not create browser popups for this; use in-app companion panels.

6. Generalize the companion grammar to all screens.
   - This must not be limited to `AI Insights`, `Ask Pulse`, and `BI Viz`.
   - Settings / Setup / Governance / Developer Tools / Knowledge / Workbench / Launchpad should all have a clear companion entry point where relevant.
   - The companion should help users compare, ask, inspect evidence, or troubleshoot without losing their place.
   - Keep the interaction uniform: same launcher language, same docking behavior, same mobile rules, same accessible fallback.
   - No screen should become a dead end.

7. Preserve tripwires.
   - Do not reintroduce a permanent blank BI split pane in unified mode.
   - Do not widen Genie/native iframe sandbox.
   - Do not touch validator authority or make hallucination-free claims.
   - Keep explicit Split + Mix behavior for power users.

## Validation requested

- Run focused viewport/surface tests.
- Add or update regression tests for:
  - BI Viz is a peer surface in unified mode and does not render `BI-only mode` copy.
  - Surface switcher accessible names are clean and non-duplicative.
  - Pop-out is scoped to the active surface/component, not the whole AI pane.
  - From BI Viz, user can launch AI Insights as a companion without replacing BI Viz.
  - Context-menu launch has an accessible non-right-click equivalent.
  - Settings/Setup screen can launch relevant companion context without losing form state.
  - No current primary screen lacks the global companion launcher.
  - Main unified shell remains intact while a component is floating.
  - Mobile floating companion dock/close controls remain within viewport at 390px width.
- Run `npm run lint` and focused/full playground tests as appropriate.
- Do a visible browser smoke at desktop and mobile.
