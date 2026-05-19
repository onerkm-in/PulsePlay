# Surface + Companion UX — handoff after 2026-05-19 partial pass

Codex's visible E2E pass on `127.0.0.1:5174` produced [`CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md`](CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md). This doc tracks which items are **landed**, **deferred**, and what the next session should pick up.

## Landed in this session

| Item | Files | Test guards |
|---|---|---|
| Surface registry (single source of truth: 3 ids, labels, glyphs, pane mapping) | `playground/src/surfaceRegistry.ts` | indirect — consumed by switcher |
| `SurfaceSwitcher` component (peer segmented control; SVG glyph + clean visible label as accessible name) | `playground/src/components/SurfaceSwitcher.tsx` | `viewportControls.integration.test.tsx` → "surface switcher labels are non-duplicative" |
| Wired SurfaceSwitcher into App.tsx; deleted old `UnifiedSurfaceTabs` | `playground/src/App.tsx` | existing matrix tests pass |
| Switcher CSS (segmented pill control, hover + active states, mobile glyph-only collapse < 640px) | `playground/src/styles.css` `.pp-surface-switcher*` | manual visual |
| BI Viz empty state rewrite — no longer reads "BI-only mode" or tells the user to switch back to "Both" / "AI only"; frames BI Viz as one of three peer surfaces | `playground/src/App.tsx` empty-state block | `viewportControls.integration.test.tsx` → "BI Viz empty state in unified mode reads as a peer surface" |
| Mobile floating panel clamp — width derived from viewport (520 max, viewport-32 min 280), drag bounds clamped so Dock/Close always reachable | `playground/src/App.tsx` `handleViewportFloat` + `FloatingPanel` style + drag handler | regression coverage via the existing FloatingPanel tests |
| `clickByLabel` test helper now falls back to visible text when no aria-label matches | `playground/src/__tests__/viewportControls.integration.test.tsx` | self |

918/918 tests pass. Type-check clean. Lint clean.

## Deferred — needs a dedicated cycle

These were in Codex's backlog but are bigger than this session's scope. They're not blocked — just not started.

### 1. Component-scoped pop-out (`floatedPane` → `floatedSurface`)

**Today:** `floatedPane: ViewportPane | null` (where `ViewportPane = "ai" | "bi"`). Popping out always detaches the WHOLE AI pane (or whole BI pane), not a single surface.

**What's needed:**
- Replace `floatedPane: "ai" | "bi" | null` with `floatedSurface: SurfaceId | null` (from `surfaceRegistry.ts`).
- `handleViewportFloat(surface: SurfaceId)` instead of `(pane: ViewportPane)`.
- FloatingPanel renders only the matching surface content — not the whole PaneChrome.
- Main shell keeps the SurfaceSwitcher visible while a surface is floating; the floated surface gets a checkmark or "Floating" badge in the switcher.
- Pulse internal tabs (insights / chat) need to honor the surface id when one of them is floated.

**Risk:** medium. PulseShell currently renders both insights + chat internally; floating just "insights" means PulseShell needs a single-surface render mode OR we extract the floated surface into a dedicated component.

**Estimated effort:** 3-5 hours.

### 2. Cross-surface companion launch

**Today:** From any surface, the only way to view another is to click the switcher (which REPLACES the current surface). No "open as companion" path.

**What's needed:**
- Context-menu on switcher items: `Open here` / `Open as companion` / `Replace companion` / `Dock all`.
- Keyboard-accessible launcher (command palette or visible `+ Companion` button) — Codex called out that right-click alone is not enough.
- Companion state: support 1 active surface + 1 companion (multi-companion is future work).
- From `BI Viz` primary, user opens `AI Insights` as companion → AI Insights shows in floating panel, BI Viz remains primary, switcher reflects both.
- All in-app — no `window.open()`.

**Risk:** medium. Hooks into the surface registry + floating-panel rework from item 1.

**Estimated effort:** 4-6 hours.

### 3. Generalize companion grammar to all author screens

**Today:** Settings, Knowledge, Workbench, Launchpad have no companion entry point.

**What's needed:**
- A shared `<CompanionLauncher />` component used from every primary shell.
- From `/settings/ai/knowledge-base`, the author opens `Ask Pulse` as companion to test how the toggle affects answers — without losing the form state.
- Form state preservation contract: companion mount must NOT remount the parent.
- Mobile rule: same as desktop — bottom sheet or full-screen companion below 640px.
- Documented in `docs/COMPANION_GRAMMAR.md` (to be written) so future shells follow the same pattern.

**Risk:** medium-large. Touches multiple shells (Settings, Knowledge, Workbench, Launchpad).

**Estimated effort:** 6-10 hours spread across several cycles.

### 4. Sugar-candy polish + Theme pack

**Today:** Visual polish landed in the 2026-05-19 design system pass (`--pp-*` tokens, gradient titles, smooth transitions). Theme picker exists in Settings → Preferences → Appearance.

**What's needed (per Codex):**
- Theme editor for tokens — colors, radius, density, typography scale, shadows, chart palette.
- Import theme from Figma tokens or Figma file/link.
- Upload screenshot → extract draft palette + spacing mood.
- Save/export theme packs.

**Risk:** large and scope-creep prone — Codex flagged this should be **its own lane**, not mixed into the surface contract fix.

**Estimated effort:** dedicated cycle, several weeks.

## Tripwires preserved

Per Codex's "Required fix 7":

- ✅ No permanent blank BI split pane reintroduced in unified mode
- ✅ Genie/native iframe sandbox NOT widened (no changes to BIAdapter sandbox attrs)
- ✅ Validator authority untouched
- ✅ No hallucination-free claims added or strengthened
- ✅ Explicit Split + Mix behavior preserved for power users (handleEnabledComponentsChange unchanged for `both` / `aiOnly` / `biOnly`)

## What the next session should pick up

Suggested ordering:

1. **Component-scoped pop-out** (item 1 above) — unlocks everything else
2. **Cross-surface companion launch** (item 2) — once surfaces are scope-clean, this becomes a small add
3. **Generalize companion grammar to author screens** (item 3) — apply the pattern everywhere
4. **Theme pack** (item 4) — separate lane, separate cycle

## Evidence + reference

- Backlog: [`CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md`](CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md)
- Codex prompt that drove this session: [`CODEX_TO_CLAUDE_SURFACE_UX_PROMPT_2026-05-19.md`](CODEX_TO_CLAUDE_SURFACE_UX_PROMPT_2026-05-19.md)
- Partial E2E results: [`EXTREME_E2E_RESULTS_2026-05-19-1146.md`](EXTREME_E2E_RESULTS_2026-05-19-1146.md)
- Mobile dock failure screenshot: [`evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png`](evidence/visible-e2e-2026-05-19-1146/03-mobile-floating-dock-offscreen.png)
- BI Viz mode jump screenshot: [`evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png`](evidence/visible-e2e-2026-05-19-1146/02-bi-viz-mode-jump.png)
