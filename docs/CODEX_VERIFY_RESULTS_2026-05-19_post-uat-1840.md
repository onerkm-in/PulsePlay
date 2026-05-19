# Codex Verify Results — Post-UAT — 2026-05-19 18:40 IST

**Git HEAD:** `b71270f` — `fix: HelpTip portal + SQL affordance + duplicate-arrow + perf instrumentation`

**Scope:** Visible-browser verification of Claude's post-final-UAT structural pass.

**Evidence:** `docs/evidence/codex-verify-post-uat-1840/`

## Headline

- Smoke: **PASS**
- Validation: **PASS** — lint clean, focused **32/32**, full **920/920**, build clean.
- Tooltip portal: **PASS for layering**, **PARTIAL for copy formatting**.
- AI Insights footer glyphs: **PASS**
- Duplicate KPI/trend arrows: **PASS**
- SQL reuse affordance: **PASS behavior**, **P2 glyph follow-up** inside the SQL panel copy button.
- Latency: **FAIL / carried forward** — AI Insights took about **3:39**, far outside Rajesh's 5-10 second target.
- Mobile acceptance: **NOT RUN** in this pass; current in-app browser viewport was 599 x 694.

## Smoke Commands

| Check | Result | Notes |
|---|---:|---|
| Git status | PASS | Clean before verification. |
| Proxy health | PASS | `/health` returned `ok:true`, profiles `default` and `supervisor`. |
| Dev server | PASS | `http://127.0.0.1:5174/` returned HTTP 200. |
| Legacy-copy grep | PASS with comments | `AI brain`, `BI BI Viz`, and old provenance strings remain only in comments/tests, not obvious visible copy. |

## Validation

| Command | Result | Notes |
|---|---:|---|
| `npm run lint` | PASS | TypeScript clean. |
| `npm run test -- --run HelpTip AiGroup viewportControls` | PASS | 32/32. Known React `act(...)` warning still appears. |
| `npm run test -- --run` | PASS | 920/920 across 72 files. Known style-shorthand, ECharts jsdom size, and `act(...)` warnings still appear. |
| `npm run build` | PASS | Build clean. Known Vite dynamic/static import chunk warnings still appear. |

## Routes / Visible Checks

| Surface | Result | Evidence | Notes |
|---|---:|---|---|
| `/settings/setup` HelpTip | PASS / PARTIAL | `01-setup-tooltip-portal.png`, `01-setup-tooltip-portal.json`, `02-tooltip-copy-samples.json` | Tooltip is portaled to `BODY`, fixed in viewport, no interactive children, and not clipped at 599 x 694. Copy formatting is still mixed: some tips remain dense paragraphs or use inline `<strong>` instead of a clean title + body/list. |
| `/` AI Insights | PASS / FAIL latency | `06-ai-insights-complete-audit.png`, `06-ai-insights-complete-audit.json` | Rendered successfully, but status showed `AI Insights: Done ... 3:39`. |
| AI Insights footer actions | PASS | `06-ai-insights-complete-audit.json` | Per-section footer action buttons now have SVGs, empty textContent, and accessible labels/titles. No visible `📋`, `↻`, or `</>` in the section footer text. |
| AI Insights duplicate arrows | PASS | `06-ai-insights-complete-audit.json` | No `▲ +`, `▼ -`, `▲ ▲`, or `▼ ▼` patterns in visible text. |
| AI Insights reused SQL | PASS / P2 follow-up | `07-trends-reused-sql.png`, `07-trends-reused-sql.json` | Clicking `View SQL for TRENDS` opens SQL in-place with `Reused from AI INSIGHTS BRIEFING`; old dead message is gone. The SQL panel copy button still renders raw `📋`, so global glyph cleanup is incomplete. |

## Interaction Details

### HelpTip

Observed:
- `role="tooltip"` parent is `BODY`, confirming portal behavior.
- Tooltip rect was inside the 599 x 694 viewport.
- `childInteractiveCount` was `0`, preserving the no-controls-inside-tooltip rule.
- Only one tooltip was expanded.

Remaining:
- The primitive supports `title` + `body`, but several existing Setup tips still render as a dense sentence/paragraph. This is a rollout/content cleanup gap, not a layering bug.

### SQL Reuse

Observed on `What Changed`:

- Panel exists.
- Panel text includes `Reused from AI INSIGHTS BRIEFING`.
- Panel includes real SQL beginning with `WITH YearAgg AS (...)`.
- Panel no longer shows `This section reuses data from an earlier query`.

Remaining:

- The SQL panel's own copy button text is still `📋`. This is separate from the now-fixed section footer icons.

### Latency

Observed:

- AI Insights remained in `Working out the right query` past 3 minutes.
- Final status was approximately `3:39`.

Verdict:

- The instrumentation/structural pass did not solve latency, as Claude honestly stated.
- This remains the top product blocker before the experience can feel comparable to the faster custom visual path.

## Top Follow-Ups

1. **P0/P1 Latency:** wire performance instrumentation into Ask Pulse and AI Insights, then attack backend/query/poll/render costs with a fast-first-output plan.
2. **P2 SQL panel glyph:** replace the raw `📋` copy button inside `SectionSqlPanel` with the same SVG icon treatment as the section footers.
3. **P2 Tooltip content rollout:** migrate existing HelpTip usages to `title` + short `body`/bullets. Portal is fixed; copy structure is not fully rolled out.
4. **P2 Global glyph sweep:** static audit still finds visible-path candidates outside the AI Insights footer, such as Knowledge active-pack settings (`⚙`) and supervisor/fusion/query-audit controls. Decide whether to scope another sweep or leave legacy/dev-only surfaces for later.
5. **P2 Mobile acceptance:** still needs explicit narrow/mobile verification for `/`, `/settings/setup`, AI Insights, Ask Pulse, and floating panels.
6. **P3 Test-output noise:** style-shorthand warnings, ECharts jsdom warnings, and React `act(...)` warnings still make regression output noisy.

## Evidence Manifest

- `01-setup-tooltip-portal.png`
- `01-setup-tooltip-portal.json`
- `02-tooltip-copy-samples.json`
- `03-ai-insights-surface.png`
- `03-ai-insights-surface.json`
- `04-ai-insights-after-long-wait.png`
- `04-ai-insights-after-long-wait.json`
- `05-ai-insights-stopped.png`
- `06-ai-insights-complete-audit.png`
- `06-ai-insights-complete-audit.json`
- `07-trends-reused-sql.png`
- `07-trends-reused-sql.json`
