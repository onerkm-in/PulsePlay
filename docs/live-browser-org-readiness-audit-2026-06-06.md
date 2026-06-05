# Live Browser Audit — Org-Standard Readiness (2026-06-06)

## Scope and evidence used
- Browser run goal: UI/UX, flow, functionality, accuracy, and robustness validation across major surfaces.
- Runtime observed live in headed Chromium (slow-motion mode): `http://127.0.0.1:7001` (app) against `http://127.0.0.1:7000` (proxy).
- Evidence artifacts reviewed:
  - [2026-06-05T19-49-26 test suite report](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T19-49-26/REPORT.md)
  - [2026-06-05T19-49-26 test suite JSON](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T19-49-26/report.json)
  - [2026-06-05T20-54-38 connectors report](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T20-54-38/REPORT.md)
  - [2026-06-05T20-54-38 connectors JSON](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T20-54-38/report.json)
  - [Intense verify log](d:/Working_Folder/Projects/PulsePlay/playground/scripts/.intense-out/verify-intense.log)
  - [Intense API call capture](d:/Working_Folder/Projects/PulsePlay/playground/scripts/.intense-out/api-calls.json)
  - [Baseline smoke-e2e summary](d:/Working_Folder/Projects/PulsePlay/docs/evidence/smoke-e2e/2026-06-05T19-24-08-578Z/summary.json)
  - [Recovery headed features/connectors report](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T21-17-45/REPORT.md)

## Recovery addendum (after Beast Mode fix/test)
- Fix applied: `proxy/lib/powerbiDatasetClient.js` now retries one transient transport-level `fetch failed` for AAD token, metadata, executeQueries, and Q&A token calls, with a fresh timeout signal on retry.
- Targeted proxy test: `npm.cmd test -- powerbiDatasetClient` passed **25/25**.
- Full proxy regression: `npm.cmd test` passed **62/62 suites, 1226/1226 tests**.
- Live API proof:
  - `powerbi-dwd` `/api/assistant/conversations/start` returned `COMPLETED`, `mode=powerbi-deterministic`, 3 result rows.
  - `default` `/api/assistant/conversations/start` returned `SUBMITTED` instead of the earlier 500.
- Live headed browser proof: `node playground/scripts/test-suite/run.mjs --areas=features,connectors --connectors=default,powerbi-dwd --headed` produced **0 critical, 0 warning, 4 info**.
- Current status for the retested feature/connector slice: **critical blockers cleared**.
- Remaining readiness caveat: this recovery run did not repeat the full intense adversarial/reload/mobile suite, so org-standard readiness is now **conditional** rather than fully certified.

## Final intense addendum (full headed adversarial/reload/mobile pass)
- Additional fix applied: `/warehouse/start` no longer aborts the server-side warmup when the browser drops the fire-and-forget request during rapid navigation; the route keeps the warmup alive and only writes a response if the connection still exists.
- Additional harness hardening applied: the intense browser script now targets both Pulse-mode (`.gn-input` / `.gn-send`) and native Ask Pulse controls, seeds the same proxy-mode fields that Settings writes (`assistantProfile`, `connectionMode=proxy`, `apiBaseUrl=/api`), treats reload-driven `net::ERR_ABORTED` as informational, and avoids self-inflicted auto-insight rate pressure during the legacy `uiMode` reload probe.
- Startup polish applied: the playground now declares an inline favicon so browser startup no longer emits a missing-resource console error.
- Focused proxy validation: `npm.cmd test -- server warehouseAutostart` passed **2 suites / 180 tests**.
- Playground validation: `npm.cmd run lint` passed after the browser harness and markup changes.
- Final live headed browser proof: `node playground/scripts/verify-unified-screen-intense.mjs` completed with **0 console errors, 0 page errors, 0 network 4xx/5xx/failures**, across **186 observed `/api/*` calls**.
- Working in the final intense pass:
  - Cell Catalog manifests: 5/5 reachable.
  - Legacy/garbage `uiMode` values: no crash; screen stayed mounted.
  - Adversarial composer: empty and whitespace submits blocked; script-injection fill did not execute; 5000-char input accepted; in-flight Ask button disabled.
  - Ask Pulse multi-message: 3 back-to-back prompts completed; Pulse-mode DOM showed 8 chat entries after E5 + F prompts.
  - Toolbar accessibility: 13/13 visible header buttons had text, `aria-label`, or title.
  - Mobile viewport: composer remained reachable at `768x900`; no horizontal overflow.
  - Detach/minimize: floating and dock slots activated.
- Remaining product caveats from the final pass:
  - Conversation reuse tripwire is still not clean: 4 submits produced 4 `POST /conversations/start` calls and 0 `/conversations/poll` calls. The UI also uses `/conversations/{id}/messages`; the follow-up should decide whether this is acceptable Pulse-mode behavior or whether one logical chat session must reuse a single upstream conversation.
  - Reload persistence is partial: chat entries went **8 before reload -> 1 after reload**. Profile and `uiMode` persisted, but the transcript did not fully restore.
  - Pulse-mode answer cards do not emit native `trust-badge` test ids; the final pass had `0` TrustBadges even though answers completed. Treat this as a test-surface parity gap or a UX evidence gap to resolve before formal certification.
  - Dedock/pop-out mirroring gap was observed after the final intense pass and is resolved in the follow-up addendum below.

## Dedock mirror addendum (user-observed continuity gap closed)
- User observation: when the screen is dedocked on Ask Pulse/chat or another active surface, the dedocked pane must show the same active tab, transcript, generated visuals, and composer state visible in the main pane. A fresh/empty/stale dedocked surface is not acceptable for org-standard UX.
- Fix applied: `App.tsx` now renders a read-only `LivePaneMirror` in the floating slot for AI and Dashboard panes instead of mounting a second assistant/BI instance. The mirror clones the active source pane, copies form values, strips duplicate ids, disables interaction inside the clone, and keeps the main pane as the single live source of truth.
- Regression coverage: `viewportControls.integration.test.tsx` asserts that AI pop-out contains the active Ask Pulse transcript marker in `pp-live-pane-mirror` and only one live assistant instance remains outside the mirror. `verify-detach-mirroring.mjs` now fails unless the floating slot contains the cloned sentinel while the source AI chrome count stays stable.
- Validation: `npm.cmd run lint` passed; `npm.cmd test -- viewportControls` passed **2 files / 36 tests**; full playground `npm.cmd test` passed **142 files / 1924 tests**; `npm.cmd run build` passed; headed `node playground/scripts/verify-detach-mirroring.mjs` passed with `aiChrome 1 -> 1`, `float slot 0 -> 1`, `liveMirror=1`, `sentinelInMirror=true`.
- Scope note: the fixed behavior is a read-only live mirror, not a fully interactive second pane. That is intentional to avoid two independent chat/BI sessions. Fully interactive companion windows should remain a separate product slice if needed.

## Consolidated outcome
- Initial audit status: **Not org-standard yet**.
- Recovery status: **tested critical Ask/Insights/Power BI chart blockers cleared, and the full headed intense suite is now green on runtime/browser error budget**.
- Net quality signal: **improved to conditional release-candidate / internal pilot** — browser stability is now clean under the observed intense run, and dedock mirroring is now fixed. Formal org-standard certification should still wait on the conversation-reuse, transcript-persistence, and trust-evidence parity caveats above.

## Sub-agent assessment (hard review)

### Sub-agent 1: Look & Feel / UX
- Findings:
  - Good: broad theme matrix renders across desktop + mobile and major screens render in screenshots.
  - Good: vendor cards for Power BI/Tableau/Qlik/Looker/generic-iframe render.
  - Good: detach/minimize flow visibly updates floating/docked state.
  - Warning: mobile tap targets flagged at `390px` in three surfaces (`ai-insights`, `ask-pulse`, `dashboard`).
  - Warning: clipped/truncated text in multiple preset/settings/dashboard locations.
- Verdict:
  - Usable from first-pass UX perspective, but not yet polished for mobile accessibility/touch ergonomics and some text wrapping issues remain.

### Sub-agent 2: Flow / Core usage paths
- Findings:
  - Critical: `Ask Pulse no answer (timeout)` for both `default` and `powerbi-dwd` connectors.
  - Critical: `AI Insights` shows an error card for `default`.
  - Critical: `/api/assistant/conversations/start` and `/api/warehouse/start` intermittently failing with `HTTP 500` and abort behavior.
  - Warning: `AI Insights` fallback text appears in `powerbi-dwd` (`HEADLINE,KPI SNAPSHOT,RISKS`) instead of fully structured narrative.
  - Info: text clipping reported on dashboard views.
- Verdict:
  - Core conversation/insight workflow is not production-safe in current state.

### Sub-agent 3: Functionality / Feature integrity
- Findings:
  - Critical: deterministic path rendering no chart in affordance test (AI result path failed charting render).
  - Good: full theme rendering, presets, settings page, and vendor-switch views are present and mostly stable.
  - Good (historical): earlier smoke pass (2026-06-05T19-24-08-578Z) recorded **48/48 pass** including Genie, tile, canvas, Power BI embed, palette/theme features.
  - Regression signal: recent focused connector run conflicts with that baseline due API instability and AI-answer timeouts.
- Verdict:
  - Feature scaffolding and most static surfaces are complete; AI result generation is currently intermittent enough to fail end-to-end integrity.

### Sub-agent 4: Accuracy + AI quality + state integrity
- Findings:
  - Critical: deterministic answer did not produce a chart in one verified path.
- Critical: no persisted chat history across reload in observed run (`entries=0` before/after).
- Warning: Multi-message flow (`F`) timed out in the intense verification harness.
- Warning: composer / ask control missing in one adversarial scenario (`surface didn't mount`).
- Verdict:
  - AI interaction quality is present but unreliable; conversation persistence and deterministic answer delivery do not meet org-standard quality expectations.

### Sub-agent 5: Robustness / reliability
- Findings:
  - `console.errors: 3`
  - `network 4xx/5xx + failed: 26` during one full-headed verify pass.
  - Multiple `net::ERR_ABORTED` traces for `/api/*` calls in intensive run.
  - `POST /api/warehouse/start` returned `500` in multiple points; affects Ask/Insights flows.
- Verdict:
  - Stability is below bar for org-standard deployment unless backend/API error envelope and fallback behavior are stabilized.

## What's working
- Cross-theme rendering and layout switching.
- Most UI screens initialize and remain accessible.
- Adapter vendor tile rendering and toolbar/button enumeration show expected structure.
- Header actions and detaching/minimizing slot behavior are present.
- Native canvas/preset/theme flows show successful screenshot coverage.
- Historical smoke evidence supports core canvas interactions and Power BI embed under favorable backend conditions.

## What's not working
- Initial-run Ask/Insights response path reliability under `default` and `powerbi-dwd` was broken; latest headed recovery pass cleared this for the tested slice.
- Initial-run deterministic AI answer -> chart path failed; latest headed recovery pass rendered chart affordances and pin-to-canvas.
- Initial-run `/api/assistant/conversations/start` and `/api/warehouse/start` intermittently 500ed; latest direct API proof cleared `conversations/start` for `default` and `powerbi-dwd`.
- Chat history not surviving reload (observed in one run).
- Mobile target sizing and text truncation in specific views.
- Adversarial composer visibility edge-case (missing mount).

## Improvement areas (prioritized)
1. Stabilize backend contract for `/api/assistant/conversations/start` and `/api/warehouse/start` (remove 500, standardize retry/error surfaces).
2. Make Ask Pulse and AI Insights response pipeline resilient to transient backend failures (bounded retries, clear user messaging, graceful degraded state).
3. Close visual regression gaps:
   - mobile hit area sizing to minimum touch guidance,
   - text wrapping controls for clipped labels.
4. Enforce chat persistence policy and validate state restore on reload (expected behavior to be explicit in product spec).
5. Harden adversarial and multi-message paths so composer and follow-up flows cannot hang forever (timeout budgets and fallback prompts).

## Feature success score (as of this audit)
- Visual integrity coverage: **strong (render-level)**  
- Core AI interaction reliability: **weak (blocking)**  
- Multi-surface consistency: **partial**  
- Error handling under load/path variation: **insufficient**

## Recommendations for org-standard readiness
- Treat AI connector path and warehouse bootstrap as **go/no-go blockers**.
- Re-run the full connector and intense suites after backend recovery.
- Do not mark feature as production-ready until:
  - Ask/Insights consistently return results, or
  - explicit, user-safe degraded fallback exists and is acceptance-tested.

## Evidence attachment index
- [2026-06-05T19-49-26/REPORT.md](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T19-49-26/REPORT.md) — themes/features/chrome coverage + findings
- [2026-06-05T20-54-38/REPORT.md](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T20-54-38/REPORT.md) — connector-specific functional failures
- [2026-06-05T21-17-45/REPORT.md](d:/Working_Folder/Projects/PulsePlay/docs/evidence/test-suite/2026-06-05T21-17-45/REPORT.md) — post-fix headed recovery pass, features + connectors, 0 critical / 0 warning
- [verify-intense.log](d:/Working_Folder/Projects/PulsePlay/playground/scripts/.intense-out/verify-intense.log) — live probe with sectioned outcomes (A–J)
- [api-calls.json](d:/Working_Folder/Projects/PulsePlay/playground/scripts/.intense-out/api-calls.json) — API status trace with 200/500 breakdown
- [smoke summary 48/48](d:/Working_Folder/Projects/PulsePlay/docs/evidence/smoke-e2e/2026-06-05T19-24-08-578Z/summary.json) — historical baseline for context
