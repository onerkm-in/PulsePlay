# Claude focused gap backlog — visible E2E surface/companion pass

Date: 2026-05-19  
Source run: `docs/EXTREME_E2E_RESULTS_2026-05-19-1146.md`  
Evidence folder: `docs/evidence/visible-e2e-2026-05-19-1146/`

This is the focused backlog Rajesh asked Codex to prepare before handing work to Claude. It is based on visible in-app browser testing, not a full hidden automation sweep. The goal is to make the next Claude pass narrow, observable, and hard to misunderstand.

## Coverage Actually Executed

- Pre-flight passed: proxy health OK, dev server OK, playground `918/918`, `npm run lint` clean.
- Catalog count audit found the scenario files currently parse to `2,604`, not the pasted `2,544`.
- Visible routes checked in the in-app browser: Settings Setup, BI, AI, Preferences, System, Advanced, Knowledge, Launchpad, Workbench, root AI Insights, root Ask Pulse, root BI Viz.
- Additional evidence written:
  - `04-settings-setup-desktop.png`
  - `05-settings-bi-desktop.png`
  - `06-settings-ai-desktop.png`
  - `07-settings-preferences-desktop.png`
  - `08-settings-system-desktop.png`
  - `09-settings-advanced-desktop.png`
  - `10-knowledge-desktop.png`
  - `11-launchpad-desktop.png`
  - `12-workbench-desktop.png`
  - `13-root-ai-desktop.png`
  - `14-root-ask-pulse-desktop.png`
  - `15-root-bi-viz-desktop.png`
  - `16-settings-setup-mobile.png`
  - `17-root-ai-mobile.png`
  - `18-root-ask-pulse-mobile.png`
  - `19-root-bi-viz-mobile.png`
  - `20-root-floating-mobile.png`
  - `extended-visible-audit.json`

## Confirmed Gaps

### P1 — BI Viz Still Feels Like A Separate Mode

Evidence: `15-root-bi-viz-desktop.png`

Clicking `BI Viz` surfaces `BI-only mode` copy and a different layout grammar. This contradicts the locked direction: `AI Insights`, `Ask Pulse`, and `BI Viz` must be peer surfaces in one stable unified screen.

Fix target: in the default unified layout, `BI Viz` should switch only the content surface. It should not show `BI-only mode`, should not tell users to go to Settings to switch back to Both/AI-only, and should not feel like a separate mini-app.

### P1 — Surface Switcher Labels And Icons Duplicate

Evidence: `13-root-ai-desktop.png`, `15-root-bi-viz-desktop.png`

The visible text and accessible names can read as `AI AI Insights`, `Ask Ask Pulse`, and `BI BI Viz`. This makes the switcher feel noisy and bolted together.

Fix target: use one icon with a clean accessible label per segment. The text should read naturally once, and the icon should support the label instead of repeating it.

### P1 — Dock/Undock Is Not Component-Scoped Enough

Evidence: `13-root-ai-desktop.png`, `03-mobile-floating-dock-offscreen.png`

The current affordance reads as popping out a whole pane (`Pop out AI panel`) rather than popping out the active component/surface. Rajesh wants component-level behavior: if the user is in `AI Insights`, only `AI Insights` undocks; `Ask Pulse` and `BI Viz` remain normal peer surfaces in the main shell.

Fix target: introduce a surface-scoped companion model keyed by surface/component id, for example `ai-insights`, `ask-pulse`, `bi-viz`, `evidence`, `workbench`, `settings-help`.

### P1 — Cross-Surface Companion Launch Is Missing

Evidence: root screenshots plus `extended-visible-audit.json`

From `BI Viz`, there is no clean way to open `AI Insights` as a companion while keeping BI Viz as the primary surface. From Settings, Knowledge, Launchpad, and Workbench, companion affordances are absent or not using the same global grammar.

Fix target: any primary screen should be able to launch any relevant surface as a companion without replacing the current surface. Right-click/context menu is fine for power users, but there must be a visible keyboard-accessible path.

### P1 — Mobile Floating Companion Controls Can Leave The Viewport

Evidence: `03-mobile-floating-dock-offscreen.png`

At 390px width, the Dock control was measured offscreen. That makes the floating panel hard to recover from on mobile.

Fix target: on small breakpoints, clamp panel dimensions and controls inside the viewport or switch to a bottom-sheet/full-screen companion pattern with fixed close/dock controls.

### P2 — Companion Grammar Is Not Present Across Author Screens

Evidence: `04-settings-setup-desktop.png` through `10-knowledge-desktop.png`

Settings and Knowledge are functional, but they do not yet expose the same “ask / inspect / open related surface as companion” pattern. This matters because PulsePlay is both an end-user app and an authoring/configuration app.

Fix target: Settings, Setup, Governance, Developer Tools, Knowledge, Workbench, and Launchpad should share a common companion-launch contract where relevant. Preserve form state when opening companions.

### P2 — Legacy Language Still Leaks Into Preferences And BI Empty State

Evidence: `07-settings-preferences-desktop.png`, `15-root-bi-viz-desktop.png`

Preferences still references older layout concepts such as visible panels and `v0`, while the BI empty state references `Both` / `AI-only`. These are technically understandable but weaken the new unified platform mental model.

Fix target: update display copy only where it affects user comprehension. Keep internal IDs/contracts stable.

### P2 — Workbench Is Present But Still Feels Outside The Unified Surface

Evidence: `12-workbench-desktop.png`

Workbench is behind the preview gate and not yet part of the same companion/surface language. This is acceptable for a preview, but it should be named in the implementation plan so it does not drift into a fourth mental model.

Fix target: leave preview gating if needed, but plan how Workbench becomes a surface/companion participant when promoted.

## Positive Findings And Seeds To Preserve

- Settings compact layout did not show page-level horizontal overflow in the visible browser pass.
- Launchpad already contains `Open in workspace` and `Float as pane` actions. That is a good seed for the global companion pattern, but the grammar needs to be unified with the root surface.
- Root AI Insights and Ask Pulse are reachable from the top surface switcher and the shell is already close to the right product direction.
- Baseline automated validation is healthy: `918/918` and lint clean before the visible pass.

## Design Opportunities

### Sugar-Candy Polish

Rajesh wants the app to feel attractive enough that users want to return again and again. Interpret this as premium, crisp, delightful, and tactile — not childish. Suggested direction:

- Smooth icon-led segmented controls.
- Soft but restrained elevation and active-state glow.
- Fast, consistent transitions for surface changes and companion docking.
- High-contrast readable text, with “candy” coming from interaction polish and color accents rather than heavy decoration.
- Reduce duplicated labels and dense tool strips.

### Theme Customization

The requested long-term direction is possible:

- Theme editor for tokens: colors, radius, density, typography scale, shadows, chart palette.
- Import theme from Figma tokens or a Figma file/link.
- Upload image/screenshot to extract a draft palette and spacing mood, then let the author approve before applying.
- Save/export theme packs so organizations can brand PulsePlay without code changes.

This should be planned as a dedicated theme-pack lane, not mixed into the companion fix.

### Companion Launcher Pattern

Recommended product pattern:

- A small global `Open companion` control in the app shell.
- Context menu on each surface switcher item: `Open here`, `Open as companion`, `Replace companion`, `Dock all`.
- Keyboard path: command palette or launcher menu; do not depend on right-click only.
- Mobile: bottom sheet/full-screen companion instead of a free-floating desktop panel.
- Multiple companions can be future work; ship one companion slot first if that keeps scope focused.

## Test Plan / Tooling Notes

- The visible in-app browser panel was constrained to about `599x694` during the extended pass; treat the screenshots as compact-layout evidence, not full-desktop proof.
- Existing `03-mobile-floating-dock-offscreen.png` is the strongest mobile failure evidence for the current dock bug.
- Some automated clicks failed because accessible names/role matching were noisy or duplicated. That is itself useful evidence for switcher a11y cleanup, but not every failed click should be scored as a product bug.
- Do not claim the full `2,604` scenarios were executed. Most remain skipped pending a larger automated run.

## Recommended Claude Fix Sequence

1. Lock the surface/companion contract in code first: surface registry, surface ids, companion state shape, and allowed transitions.
2. Rebuild the surface switcher as a single peer segmented control with clean labels and a11y names.
3. Replace the default `BI Viz` empty state so it is a peer content surface, not `BI-only mode`.
4. Implement component-scoped `Open as companion` / `Dock` behavior for AI Insights, Ask Pulse, and BI Viz.
5. Add the global companion launcher and make it available from root, Settings, Knowledge, Launchpad, and Workbench where relevant.
6. Add mobile companion rules: clamp desktop floating panel, and use bottom sheet/full-screen companion under the small breakpoint.
7. Only after the interaction contract is stable, apply sugar-candy polish and theme-pack planning.

## Acceptance Checklist

- `BI Viz` click in default unified mode does not render `BI-only mode`.
- Surface switcher visible labels and accessible names are clean: no `AI AI Insights`, `Ask Ask Pulse`, or `BI BI Viz`.
- `Open as companion` is scoped to the selected/active surface, not the whole AI pane.
- From `BI Viz`, user can open `AI Insights` as companion without leaving/replacing BI Viz.
- From Settings/Setup, user can open a relevant companion without losing form state.
- Every primary screen has a visible companion launcher or an explicit documented reason why it does not apply.
- Right-click/context menu has a keyboard-accessible visible equivalent.
- On 390px width, companion dock/close controls remain inside the viewport.
- Launchpad `Float as pane` and root popout share the same language and behavior.
- Existing tripwires remain true: no permanent blank BI split pane in unified mode, no Genie sandbox widening, no validator changes, no hallucination-free claims.

