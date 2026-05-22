# PulsePlay — UI/UX Audit + Validation

**Date:** 2026-05-19 → 2026-05-20 (iteration through fixes)
**Audit HEAD:** `b0636d1` "style: fuse BI pane with AI pane visual vocabulary"
**Fixes shipped through:** Cycle 1 (`71c6320`), Cycle 2 (`204e1b2`), Cycles 3+4 (`43d2173`), Cycle 5 (this commit)
**Reviewer:** Claude (Opus 4.7, 1M context)
**Scope:** Comprehensive design / UX / accessibility / static / live regression review of the playground + proxy at `D:\Working_Folder\Projects\PulsePlay`, **plus iterative fixes** for every P1 and material P2 finding.

## Status of each finding

| # | Severity | Title | Status |
|---|---|---|---|
| P1-1 | P1 | Phantom "Unsaved changes" in Settings | **Fixed** Cycle 1 — META_KEYS exclusion + 5 regression tests |
| P1-2 | P1 | No dark-mode support | **Fixed** Cycle 1 — `<meta color-scheme="light only">` honest opt-out |
| P1-3 | P1 | Wizard focuses × dismiss button on open | **Fixed** Cycle 1 — focus the checked persona radio + 2 regression tests |
| P1-4 | P1 | Body scroll NOT locked while wizard open | **Fixed** Cycle 1 — overflow:hidden lifecycle + 2 regression tests |
| P1-5 | P1 | CLAUDE.md proxy test count is stale | **Fixed** Cycle 5 — CLAUDE.md updated to 945/787 |
| P2-1 | P2 | AI Insights empty state is dead-end | **Fixed** Cycle 3 — list + 2 CTAs ("Connect AI assistant →", "Browse knowledge packs") |
| P2-2 | P2 | AISidebar narrative has no markdown rendering | **Fixed** Cycle 3 — new `renderMarkdown.tsx` + 16 regression tests, safe-by-construction |
| P2-3 | P2 | "Mix" mode leaves right half empty | Deferred — needs layout-policy decision (intentional for now, see surfaceRegistry) |
| P2-4 | P2 | "BI Viz" tab label is jargon | **Fixed** Cycle 2 — renamed to "Dashboard" everywhere user-visible |
| P2-5 | P2 | Heavy inline styles in AISidebar | Partial — Cycle 3 added shared `.pp-md*` classes for markdown; full sweep deferred |
| P2-6 | P2 | Send button `↑` glyph | **Fixed** Cycle 2 — SVG up-arrow |
| P2-7 | P2 | Settings search `🔍` emoji | **Fixed** Cycle 2 — SVG magnifying glass |
| P2-8 | P2 | "two steps" vs "three steps" inconsistency | **Fixed** Cycle 2 — rail aligned to body ("three short steps") |
| P2-9 | P2 | "CONTINUE SETUP" mis-frames cross-links | **Fixed** Cycle 2 — renamed to "Related areas" |
| P2-10 | P2 | ReactQuery devtools button overlap | Accept — dev-only, doesn't ship to prod |
| P2-11 | P2 | Animated spinners lack accessible names | **Fixed** Cycle 3 — `role=status aria-live=polite` on submitting/polling/KPI-loading |
| P2-12 | P2 | Latency itself is the headline gap | Out of scope — separate cycle per existing perf guide |
| P2-13 | P2 | Hardcoded proxy IP in error copy | **Fixed** Cycles 3+4 — reads from configured apiBaseUrl, falls back to dev default |
| P2-14 | P2 | `console.log` in perfInstrumentation.ts | **Fixed** Cycles 3+4 — gated on DEV or `window.__pulseplayPerfDump` |
| P2-15 | P2 | KnowledgeShell bypasses routing helper | **Fixed** Cycles 3+4 — uses `navigateToSettings()` |
| P2-16 | P2 | Open generic-iframe sandbox | Tracked — needs per-vendor min-sandbox cycle when adapters graduate |
| P2-17 | P2 | × dismiss claimed race | **Withdrawn** — original audit observation was a React batching artifact; confirmed live (write is synchronous, dialog dismisses on next render commit) |

## TL;DR — Validation results

---

## TL;DR — Validation results

| Check | Result |
|---|---|
| Proxy unit tests (`proxy/ npm test`) | **787 / 787 pass**, 44 suites, 16.8 s. `CLAUDE.md` says "418/418" → **doc stale**. |
| Playground TypeScript lint (`npm run lint`) | clean |
| Playground unit tests (`npm run test -- --run`) | **920 / 920 pass**, 72 files, 67.8 s |
| Playground production build (`npm run build`) | clean, 32.15 s, 18 chunks |
| Proxy health (`GET /health`) | `{ ok:true, profiles:["default","supervisor"], port:8787 }` |
| Dev server (`vite`) | starts at `:5175`, no console errors, no failed network requests |

So the codebase is **green**. The findings below are gaps and bugs the green tests do not cover.

---

## Severity legend

- **P1** — visible bug or accessibility blocker that will hit users; fix before next pilot
- **P2** — material UX hole or smell that erodes trust / wastes the user's attention
- **P3** — polish, consistency, doc staleness

---

## P1 findings (real bugs)

### P1-1. Phantom "Unsaved changes" in Settings on first navigation

**Reproduced live**: load `/` (wizard opens) → click "Skip for now" → press `Ctrl + ,`. Settings opens at `/settings/setup` and immediately shows the SaveBar at the bottom with "Unsaved changes • Discard • Save changes" — the user has changed **nothing**.

**Root cause** — [useSettingsDraft.ts:18-34](playground/src/settings/useSettingsDraft.ts#L18):
```ts
const snapRef = useRef<Record<string, string>>(snapshotStorage());
// ...
function computeIsDirty(snap) {
  // diffs ALL keys with prefix `pulseplay:`
}
```
The snapshot is taken on `SettingsShell` mount. But `pulseplay:wizard-dismissed` (set by `Skip for now`) and `pulseplay:settings-last-group` (written by `SettingsShell`'s own route-tracking effect) are written **after** the snapshot. The diff then flags them as user-dirty.

Live diff captured:
```json
before: { "pulseplay:bi-vendor": "powerbi" }
after:  { "pulseplay:bi-vendor": "powerbi",
          "pulseplay:settings-last-group": "setup",
          "pulseplay:wizard-dismissed": "true" }
status: "Unsaved changes"
```

**Knock-on damage**: clicking **Discard** removes `pulseplay:settings-last-group` (verified live) and would in some flows remove `pulseplay:wizard-dismissed` — re-opening the wizard the user just dismissed.

**Fix**: maintain an explicit allow-list of *user-settings* keys (`bi-vendor`, `active-ai-profile`, `pack-selection`, `embed-config`, `visual-settings:*`, layout/UI-mode/components keys) and exclude meta keys (`wizard-dismissed`, `wizard-force`, `wizard-draft`, `settings-last-group`, `pinned-viewport-pane`, `ui-mode`/`layout-mode`/`enabled-components` legacy migration flags, `display-change` echoes). Or move the snapshot to a `useEffect` that runs after the first paint + a `requestAnimationFrame` so hydrating writes are captured.

### P1-2. No dark-mode support despite `prefers-color-scheme: dark`

Verified live — viewport emulating dark mode:

```json
{ "background-color": "rgb(244, 246, 249)",   // light gray
  "color":            "rgb(15, 23, 42)",      // dark text
  "color-scheme":     "normal" }              // not "dark"
```

There is no `<meta name="color-scheme" content="light dark">` and `<html>` has no `data-theme` / `color-scheme: light dark` declaration. The CSS uses `var(--pp-bg, #fff)` fallbacks but no `@media (prefers-color-scheme: dark)` overrides anywhere. The Settings UI exposes a theme preset surface (`PreferencesAppearance.tsx`) but it doesn't connect to OS preference.

This is also a regression vector for the rest of the audit: every contrast-and-readability finding below would multiply if a half-implemented dark mode shipped.

**Fix**: either ship dark mode properly (`@media (prefers-color-scheme: dark)` + theme tokens) or set `color-scheme: light only` explicitly so the browser doesn't lie to users (e.g., dark-mode scrollbars over light surfaces).

### P1-3. First-run wizard focuses the "×" dismiss button on open

`document.activeElement` after wizard mount is `BUTTON aria-label="Skip setup and close"` (text content: `×`). One stray Enter or Space and the wizard closes — exactly the opposite of a guided onboarding.

**Fix**: focus the first persona radio in the radiogroup (`[role=radio]`) or the heading (`tabIndex=-1`) on open. WAI-ARIA dialog pattern says either the first focusable input or the dialog's accessible name container.

### P1-4. Body scroll is NOT locked while the wizard modal is open

`getComputedStyle(document.body).overflow === "visible"` while the modal is mounted. The user can scroll the launchpad/empty-state behind the wizard via mouse wheel, which produces a janky "the page is moving but I'm in a dialog" feel. Modal pattern requires body scroll lock.

**Fix**: apply `overflow: hidden` to `<body>` (or `<html>`) while any modal is open. The `FirstRunWizard` component owns the modal lifecycle and is the right place to do it.

### P1-5. CLAUDE.md proxy test count is stale (418 → actual 787)

`CLAUDE.md`'s **Status** section says "the latest local validation is 161/161 playground+adapter tests, 418/418 proxy tests". Live: **787 proxy tests** and **920 playground tests**. The numbers in CLAUDE.md are off by ~90% on proxy and ~80% on playground. The next person reading CLAUDE.md will assume something has been deleted.

**Fix**: refresh the Status section after each major test landing; or remove the absolute counts and link to a CI badge.

---

## P2 findings (material UX holes)

### P2-1. AI Insights empty state is a single sentence; Ask Pulse empty state is a guided start. Sibling tabs disagree.

- **AI Insights** (default tab) empty state: `✨ AI Insights — "Configure an AI connector in Settings → AI to generate insights."` — one line, raw `✨` emoji, dead-end.
- **Ask Pulse** empty state: "Guided business exploration across your BI and AI surfaces — insights without writing SQL." with **Quick start / Performance / Issue / Risk / Opportunity** tabs, suggestion chips ("Rank key drivers", "Summarize for leadership", "Run what-if"), and a "Run Performance View" CTA.

A user landing on AI Insights first (it is the default) sees a barren screen and bounces. Ask Pulse one click away does the right thing.

**Fix**: port the empty-state pattern from Ask Pulse to AI Insights — suggest the briefing the connector would generate once configured, link to Settings → AI in-line, and offer the same suggestion chips so the surface feels alive pre-config.

### P2-2. AI sidebar narrative is plain text — no markdown rendering

[AISidebar.tsx:793-800](playground/src/components/AISidebar.tsx#L793):
```tsx
<div className="pp-ai-sidebar__narrative"
     style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
  {entry.answer}
</div>
```

`entry.answer` comes from Genie / Foundation Model / Supervisor / Bedrock. All of these emit Markdown (`**bold**`, `## headings`, ordered lists, tables, fenced code). Rendering with `pre-wrap` shows the raw asterisks, hash marks, and pipes. This is the headline AI surface; the chat output looking like a debug dump is a real credibility hit.

**Fix**: render through a sanitized Markdown renderer (e.g. `react-markdown` with `rehype-sanitize`) — already a peer of how `pulse/visual.tsx` handles SQL via `highlightSql`. The bundle cost is `~30 KB gzip`, acceptable.

### P2-3. "Mix" mode leaves the entire right half of the screen empty

Default mode is `"mix"` ([App.tsx:78](playground/src/App.tsx#L78)). At 1440 × 900, only the AI pane renders; the BI surface is a tab button (`Open BI Viz surface`) that swaps inside the AI pane area. The right ~60% of the viewport is solid empty gray.

Either:
- the AI pane should span full width (it does not — it's left-anchored at ~600 px), or
- the BI surface preview / launcher cards / "what is PulsePlay" intro should occupy the empty area.

**Fix**: when only one surface tab is mounted and no BI is configured, expand the active pane to fill the viewport OR render a value-proposition card in the empty area (a screenshot/tour of what PulsePlay looks like when configured).

### P2-4. "BI Viz" tab label is jargon

After the `BI BI Viz` regression fix in the recent handover, the surface tab now reads "Open BI Viz surface" with a chart-icon. The label is engineer-speak. End users say "dashboard", "report", "view". "BI Viz" is the implementation noun ("Power BI Visualization") that leaked into UI copy.

**Fix**: rename to "Open dashboard" or, if the active vendor is known, "Open Power BI" / "Open Tableau" / etc. Vendor-aware copy already exists in `VendorPicker.tsx`.

### P2-5. Heavy reliance on inline styles in AISidebar / KnowledgeShell

`AISidebar.tsx` has 30+ `style={{ ... }}` literals with hard-coded `fontSize: 10/11/12`, `padding: "3px 6px"`, `cursor: hasInFlight ? "pointer" : "not-allowed"` (redundant — the `disabled` attribute handles it). Same shape in [KnowledgeShell.tsx:203-228](playground/src/knowledge/KnowledgeShell.tsx#L203) where the full-bleed overlay is `style={{ position: "fixed", inset: 0, ... }}` instead of a class.

Inline styles defeat (1) theming/dark-mode (P1-2), (2) responsive tweaks, (3) consistency review. The `pp-ai-sidebar__*` and `pp-settings-*` BEM-ish class system is right there.

**Fix**: move static styles to the existing CSS files (`pp-ai-sidebar.css`, `settings.css`). Keep only dynamic style props that genuinely depend on runtime state.

### P2-6. Send button glyph is the raw `↑` character (Ask Pulse composer)

Snapshot shows `button: "Send"` with text content `↑`. After three rounds of "emoji → SVG" sweeps in the recent handover, this one slipped. Same with the persona-card icons in `FirstRunWizard.tsx` (📊 🎯 🛠️ ✨ at [FirstRunWizard.tsx:71-103](playground/src/components/FirstRunWizard.tsx#L71)) which are read out by screen readers as their emoji names (e.g. "Bar Chart Analyst…").

**Fix**: replace `↑` with an SVG arrow (matching `Icon` system in `playground/src/pulse/_adapter/Icon.tsx`). Either wrap the persona emojis in `aria-hidden="true"` containers and let the heading carry the accessible name, or replace with the same SVG system.

### P2-7. Settings search uses a raw `🔍` emoji while the header uses an SVG cog

[SettingsShell.tsx:263](playground/src/settings/SettingsShell.tsx#L263):
```tsx
<span className="pp-settings-search__icon" aria-hidden="true">🔍</span>
```
vs the header at [SettingsShell.tsx:210-213](playground/src/settings/SettingsShell.tsx#L210) which is a hand-coded inline SVG cog. Same audit pass, two glyph systems. Inconsistent.

### P2-8. "Setup" section says "Three short steps" in the heading and "two short steps" in the rail

Two strings:
- `GROUP_DESCRIPTIONS.setup = "Get PulsePlay ready in two short steps"` ([SettingsShell.tsx:45](playground/src/settings/SettingsShell.tsx#L45))
- Setup section body: "Three short steps to get PulsePlay running" (visible at runtime)

Count drift in user-facing copy. Pick one.

### P2-9. CONTINUE SETUP cross-links jump to siblings, not children

The bottom-of-Setup section has "CONTINUE SETUP" with buttons **Layout & display**, **Proxy & diagnostics**, **Advanced / reset**. Those land in Preferences, System, Advanced — three different groups. Calling them "continue setup" implies they are required next steps in onboarding, but they are optional, separate tracks. Minor IA-honesty issue.

**Fix**: rename to "Related areas" or "Next, optionally".

### P2-10. ReactQuery Devtools floating beach icon visible at bottom-right in dev

`<ReactQueryDevtoolsHost />` at [App.tsx:277-290](playground/src/App.tsx#L277) lazy-loads `@tanstack/react-query-devtools` in dev mode. The button renders a beach/palm icon, hovering over content (it was on top of the Ask Pulse composer at one point in the live walk). It is guarded with `import.meta.env.DEV` so won't ship to prod — but it overlaps interactive controls, which during the audit made the Send button hard to click. Position it bottom-LEFT or make it collapsible by default.

### P2-11. Animated spinners lack accessible names

[pulse/visual.tsx:7520](playground/src/pulse/visual.tsx#L7520):
```tsx
<span style={{ animation: "gn-progress-spin 1.2s linear infinite", marginRight: 6 }}>↻</span>
```
No `role="status"`, no `aria-live="polite"`, no `aria-label="Loading"`. Screen-reader users hear nothing while the briefing is generating (which routinely takes 3 minutes per the open `LATENCY` blocker).

**Fix**: wrap each in-flight stage in `<div role="status" aria-live="polite" aria-label="Generating briefing">` so users know work is happening.

### P2-12. Latency itself is the headline gap — flagged in HANDOVER as carry-forward

Per the very top of `docs/HANDOVER.md` (today's entries): "Cold load: 3:39 → unchanged". The new SWR pass landed today helps warm loads (~500 ms first paint) but cold AI Insights still takes 3:39, well outside Rajesh's 5-10 s target. This is acknowledged in `docs/CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md`. I'm not relitigating the diagnosis — instrumentation just landed in [perfInstrumentation.ts](playground/src/lib/perfInstrumentation.ts) and is wired into both pipelines, so the next cycle has the numbers.

**Worth saying out loud in this review**: visual polish has been the focus of the last 5+ cycles. Until first-useful-output is under 10 s, every other UX win is sitting on a load-bearing trust problem.

### P2-13. Hardcoded proxy IP in user-facing error copy

[App.tsx:1112](playground/src/App.tsx#L1112) (per static scan):
```
Check the proxy is running on http://127.0.0.1:8787 and reload.
```
This is fine for local dev. It will ship to staging / pilot / internal-org deploys where the proxy is at `proxy.pulseplay.internal` or similar. Surfacing `127.0.0.1` in those environments will mislead.

**Fix**: read from the same config the assistant client reads (`import.meta.env.VITE_PROXY_BASE` or settingsStore's `apiBaseUrl`), fall back to `127.0.0.1:8787` only when no override is set.

### P2-14. `console.log` in `perfInstrumentation.ts` is unguarded

[perfInstrumentation.ts:113](playground/src/lib/perfInstrumentation.ts#L113) prints `Total measured: NNN ms` on every Ask Pulse / AI Insights run via `dumpRun()`. The utility itself has an `ENABLED` guard but the `console.log` line fires for every completed pipeline in production builds too. Either guard with `import.meta.env.DEV` or make the dump opt-in via `window.__pulseplayPerfDump = true`.

### P2-15. KnowledgeShell uses imperative `history.pushState` + custom event for routing

[KnowledgeShell.tsx:191-194](playground/src/knowledge/KnowledgeShell.tsx#L191) handles Esc by:
```ts
window.history.pushState({}, "", "/settings");
window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
```
This bypasses the `navigateToSettings()` helper in `settingsRoute.ts` and re-implements navigation. Drift risk: if the routing module changes its event names, Esc breaks silently here.

### P2-16. Iframe sandbox in `GenericIframeAdapter` is open enough to be a defense-in-depth concern

Per `CLAUDE.md` "Tripwires" — default sandbox is `allow-scripts allow-same-origin allow-forms allow-popups`. `allow-same-origin` + `allow-scripts` is the well-known "essentially no sandbox" combination if the parent origin is the same. PulsePlay hosts BI tools cross-origin so `allow-same-origin` is needed for cookies and SSO — that's fair — but the doc is right that vendor adapters **should** narrow this. They don't yet (only `generic-iframe` exists in production form). Track per-vendor min-sandbox as a hard pre-req for graduating any vendor adapter past stub.

### P2-17. The wizard appears even after the user "Skip for now"-ed it in the same session

After my reproduction of P1-1, when I navigated back to `/`, the wizard did NOT reappear (good). But the **"Skip setup and close"** (×) button at top-right of the wizard does NOT actually dismiss it in my live click trial — it required pressing the explicit "Skip for now" foot button. Investigated: clicking the × *did* register, but the wizard re-mounted on the next render because the dismissal flag is written async vs the parent re-render race. This is a hairline race in the wizard's dismissal path.

**Fix**: set `wizard-dismissed` synchronously **before** calling `onDismiss` so the parent's `shouldShowWizard()` check on its next render returns false. Today the order looks reversed in the close-button handler.

---

## P3 findings (polish / consistency / doc staleness)

| # | File:Line | Issue |
|---|---|---|
| P3-1 | `CLAUDE.md` Status | Says "161/161 playground+adapter tests, 418/418 proxy tests". Actual: 920 playground, 787 proxy. See P1-5. |
| P3-2 | [App.tsx:78](playground/src/App.tsx#L78) | `EnabledComponents` legacy "both" → "mix" migration flag (`ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY`) is the kind of thing that gets stale. Once 100% of users are past the migration, delete it. |
| P3-3 | [FirstRunWizard.tsx:441-525](playground/src/components/FirstRunWizard.tsx#L441) | 5 × `eslint-disable-next-line react-hooks/exhaustive-deps` without explanation. Add one-line comment per disable so the next reader knows why each is intentional. |
| P3-4 | [biPanel/BIPanel.tsx:182-204](playground/src/biPanel/BIPanel.tsx#L182) | Same `react-hooks/exhaustive-deps` disables; these ones DO have surrounding rationale comments — good model for P3-3. |
| P3-5 | [ADR-0003](docs/adr/0003-supervisor-stagger-800ms.md) | Title says 800 ms; live code is 2000 ms ([proxy/server.js:3556](proxy/server.js#L3556)). Per CLAUDE.md tripwire, the rename is "pending". Now would be a fine time. |
| P3-6 | `bi-adapters/{powerbi,tableau,qlik,looker}/` | Only Power BI has a real SDK adapter. Tableau / Qlik / Looker extend `GenericIframeAdapter`. CLAUDE.md Status acknowledges this honestly. Worth a UI hint when the user picks Tableau/Qlik/Looker: "Iframe fallback — real SDK lands v1." Today they look interchangeable in the picker. |
| P3-7 | `discoveryClient.ts:17` | File-level `/* eslint-disable @typescript-eslint/no-explicit-any */`. Narrow to specific `any` declarations. |
| P3-8 | [BackendAdapter.ts:133-148](playground/src/pulse/backend/BackendAdapter.ts#L133) | Several `any` parameters in the connector adapter contract. Pulse-PBI compat surface, per detangling doc — accept. |
| P3-9 | Pulse compatibility footprint | The `playground/src/pulse/*` tree carries Pulse-PBI's XHR-only HTTP layer, `gn-*` CSS vocabulary, and v0 UI hedge. CLAUDE.md documents this honestly; just flag for future readers that "the gnarly bits live in `pulse/`". |
| P3-10 | Inline `<style>` tag for keyframes in [SettingsShell.tsx:170](playground/src/settings/SettingsShell.tsx#L170) | `<style>{`@keyframes pp-save-pulse...`}</style>` is rendered every time SettingsShell mounts. Move to `settings.css`. |
| P3-11 | Vite build warnings | Two pre-existing warnings about `generic-iframe/index.ts` and `databricks-genie/index.ts` being both dynamically AND statically imported. Vite says "dynamic import will not move module into another chunk." → resolves to: every adapter ships in the main bundle, defeating the lazy-load goal. Worth one Vite-config cycle. |
| P3-12 | "Back to app" wraps to two lines on mobile (375 wide) | Cosmetic, but the wrap makes it look broken. |
| P3-13 | `Ctrl /` hint chip shown on mobile | mobile users have no Ctrl key. Hide on `pointer: coarse`. |
| P3-14 | Glossary on Knowledge Base | The CPG / FMCG pack button label is fine, but on focus the bounding box hint reflects the long description, not a short label. Minor a11y polish. |

---

## What the test suites do NOT cover (gap matrix)

The 920+787 green tests are tightly focused on backend contracts and adapter shapes. They do **not** cover:

| Area | Coverage today | Gap |
|---|---|---|
| Visual regression | none | first-paint screenshots are not asserted; the Codex sweep is the closest thing |
| Dark-mode rendering | none | P1-2 above — no test would catch the missing-dark issue |
| Keyboard navigation | partial — `HelpTip` mutual-exclusion tested | wizard focus trap, settings ctrl+/, knowledge esc are untested |
| Modal scroll lock | none | P1-4 untested |
| Settings dirty-tracking | none | P1-1 ships green |
| Latency budget | none — instrumentation lands but no test gate | a real "first useful output < 10 s" SLA test would gate every PR |
| Markdown rendering of AI answers | none | P2-2 — once a Markdown renderer is added, fixture tests are easy |
| Cross-origin embed sandbox tightening | adapter unit tests exist; per-vendor sandbox bounds untested | P2-16 |

---

## Recommended fix order

1. **P1-1** Settings phantom-dirty — five-line allow-list in `useSettingsDraft.ts`. Closing the bug also unblocks P3-style polish on the SaveBar.
2. **P1-3 / P1-4** Wizard focus + body scroll lock — one cycle, one file.
3. **P1-5 / P3-1** Refresh the test-count copy in CLAUDE.md.
4. **P2-1** AI Insights empty state parity with Ask Pulse.
5. **P2-2** Markdown rendering in AISidebar — material credibility upgrade.
6. **P1-2** Decide on dark-mode posture (ship or explicitly opt out via `color-scheme: light only`).
7. **P2-12** Latency itself — already the carry-forward; uses new perf instrumentation.

Items 1–5 can land in a single beast-mode cycle and would not require regression rework anywhere outside Settings + AISidebar + FirstRunWizard.

---

## Evidence captured

- Live dev server at `127.0.0.1:5175`, proxy at `127.0.0.1:8787` (`profiles=["default","supervisor"]`, `authMode:"none"`).
- Pre-fix snapshot showing `Unsaved changes` after wizard-skip + Ctrl+,.
- Mobile (375x812) screenshot showing wrapping in Back-to-app and `Ctrl /` hint.
- Dark-mode emulation showing light bg + `color-scheme: normal`.
- Ask Pulse and AI Insights empty-state snapshots for the parity finding.
- Tests run: proxy 787/787, playground 920/920, lint clean, build clean (32.15 s).
