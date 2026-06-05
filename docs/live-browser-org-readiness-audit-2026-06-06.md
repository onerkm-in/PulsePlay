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

## Consolidated outcome
- Initial audit status: **Not org-standard yet**.
- Recovery status: **tested critical Ask/Insights/Power BI chart blockers cleared in the latest headed slice**.
- Net quality signal: **improved to conditional** — the main feature/connector slice is now green at critical/warning level, but the full intense suite still needs a fresh pass before calling this org-standard certified.

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
