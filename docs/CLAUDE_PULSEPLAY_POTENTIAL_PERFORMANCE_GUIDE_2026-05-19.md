# Claude Guide — PulsePlay Potential and Performance Recovery

> **Audience:** Claude / future implementation agents.
>
> **Purpose:** Turn PulsePlay's real strategic potential into a believable product by fixing the biggest current blocker: **AI Insights / Ask Pulse latency**. Rajesh's feedback is blunt and correct: performance is currently horrible for the intended experience.
>
> **Current baseline from Codex visible-browser verification:** AI Insights completed around **3:39** in `docs/CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md`, far outside the desired **5-10 second useful-output** target.

## Read First

Before changing code, read:

1. `CLAUDE.md`
2. `docs/AGENT_SYNC.md`
3. `docs/CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md`
4. `docs/CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md`
5. `docs/adr/0005-two-tier-insights-cache.md`
6. `docs/STAGED_RENDERING.md`
7. `docs/SUPERIOR_BUILD_LEVERAGE_PLAN.md`

Recent commits matter:

- `b71270f` added the initial perf instrumentation utility.
- `eae37a1` wired instrumentation into Ask Pulse and AI Insights.
- `7c6d84e` changed AI Insights to concurrency-2 with an 8-second stage-1 head-start.

Do **not** treat `7c6d84e` as "performance fixed." It is only one orchestration lever. The acceptance bar is live measured user experience.

## Product Truth

PulsePlay's potential is very strong because it is not trying to be only another BI chatbot. The real product is:

> A unified, vendor-agnostic workbench where a user can keep their BI surface, AI Insights, Ask Pulse, evidence, SQL, and companion windows in one coherent place, regardless of BI vendor or AI connector.

That is the strategic advantage over Power BI Copilot, Tableau Pulse, Databricks Genie, ThoughtSpot Spotter, Qlik Answers, and Looker Gemini. Those tools are strong inside their own stack. PulsePlay can be the orchestration layer across stacks.

But that promise collapses if the first answer takes minutes. A unified screen that waits three minutes feels worse than a siloed native tool that responds in seconds.

## Non-Negotiable Performance Bar

Use these targets:

| Experience | Target | Hard Fail |
|---|---:|---:|
| First visible acknowledgement | < 500 ms | > 1 s |
| First useful partial insight | <= 5 s | > 10 s |
| First chart/table/SQL evidence when available | <= 10 s | > 20 s |
| Full multi-section AI Insights briefing | <= 30 s warm / <= 60 s cold | > 90 s |
| Ask Pulse simple KPI question | <= 10 s | > 20 s |
| Ask Pulse complex multi-row question | <= 20 s | > 45 s |

Do not satisfy the target by only polishing spinners. The target is **useful output**: headline, KPI value, SQL/evidence, chart, table, or a trustworthy partial result.

## Current Suspected Bottlenecks

Validate these with instrumentation before fixing:

1. Genie message latency per stage.
2. Sequential or semi-sequential stage execution.
3. Large prompt/guidance payloads.
4. Repeated conversation setup or context reconstruction.
5. Poll interval/backoff adding idle time.
6. SQL warehouse cold start.
7. Too many stages for a single user question.
8. Rendering all sections only after all stages finish.
9. Frontend re-render/jank from heavy Pulse-ported surface.
10. Evidence/SQL formatting work happening on the critical path.

## Required Measurement Pass

First commit should be measurement-only unless the bottleneck is already obvious from current logs.

### Browser

Run in the visible browser so Rajesh can observe:

1. Open `http://127.0.0.1:5174/`.
2. Trigger AI Insights from a cold-ish state.
3. Trigger Ask Pulse with:
   - `What's the total revenue this year?`
   - `Show monthly sales for the last 12 months`
   - `Top 5 sales reps by revenue this year`
4. Capture console tables emitted by `perfInstrumentation`.
5. Save screenshots and timing notes under `docs/evidence/perf-recovery-<YYYY-MM-DD-HHMM>/`.

### Proxy / Network

Capture:

- request id
- route
- profile
- start time
- first response time
- poll count
- final response time
- warehouse query duration if exposed
- bytes in prompt / response
- status transitions

If this data is missing, add it. Do not guess.

## The Real Fix Strategy

### Phase 1 — Fast First Output

Goal: user sees useful content in <= 5 seconds.

Preferred approaches:

1. Render a deterministic "scope + data source + question understood" chip immediately.
2. Render cached last-known briefing if scope is unchanged, clearly labeled as cached.
3. Run a tiny "headline/KPI first" query before the full narrative.
4. Stream or progressively render section results as soon as each section finishes.
5. Keep the full briefing running in the background.

Do not label cached or partial output as fresh. Use copy like:

- `Showing last completed briefing while PulsePlay refreshes.`
- `First result ready. Full briefing still running.`
- `Generated from cached scope; refresh in progress.`

### Phase 2 — Reduce Round Trips

Goal: stop paying one expensive LLM/Genie round trip per small section.

Evaluate these options in order:

1. **Stage fusion:** ask Genie for multiple headed sections in one message, then parse/validate sections.
2. **Two-pass mode:** one query/data pass, one synthesis pass.
3. **Section groups:** group HEADLINE + KPI, group TRENDS + RISKS, group ACTIONS + OPPORTUNITIES.
4. **Skip empty/irrelevant sections:** if the domain/question does not need a section, do not call a model for it.

Acceptance: fewer upstream calls for the same briefing, with no loss of SQL/evidence traceability.

### Phase 3 — Use the Right Backend for the Job

Genie is strong for natural language over governed Databricks data, but it may not be the fastest path for every stage.

Consider:

- Genie for SQL generation / governed query.
- Foundation Model or Supervisor for synthesis when data rows are already known.
- Direct SQL templates for common KPI/chart questions.
- Cached semantic metadata for chart recommendation.
- React Query caching for repeated profile/pack/config calls.

The best architecture may be hybrid:

1. Fast deterministic path for common questions.
2. Genie path for open-ended governed questions.
3. FM/SSE path for fast narrative synthesis once data is retrieved.

### Phase 4 — UI Progressive Rendering

Goal: avoid the "dead waiting wall."

Implement:

- section skeletons with independent status
- first completed section paints immediately
- per-section `source / SQL / evidence / status`
- cancel/stop that actually stops future polls
- retry section, not entire briefing
- collapsed details for long-running sections

The screen should feel alive without faking completion.

### Phase 5 — Warm Path / Cache Path

Use existing cache architecture where possible:

- `insightsCache.ts`
- `docs/adr/0005-two-tier-insights-cache.md`
- BI scope hash
- profile + pack + question hash
- SQL result hash

Rules:

- Cache can accelerate, but must be labeled honestly.
- Cache invalidates on BI context/profile/pack/settings changes.
- User can force refresh.
- Never show stale SQL as fresh SQL.

## What Not To Do

- Do not claim "fixed performance" without live timings.
- Do not only change spinner text.
- Do not hide slow stages.
- Do not remove SQL/evidence to make the UI look faster.
- Do not weaken validator authority.
- Do not widen Genie iframe sandbox.
- Do not make unsupported "100% no hallucination" claims.
- Do not increase upstream concurrency blindly; it can trigger rate limits and make perceived performance worse.
- Do not make the UI wait for all sections if one section is already ready.

## Competitive Reality Check

The intended competitor bar is not an internal prototype. Users compare PulsePlay with:

- Power BI Copilot: native report/model context, strong Microsoft integration.
- Tableau Pulse: polished metric digests and mobile-first executive consumption.
- Databricks Genie: governed natural language over Unity Catalog data.
- ThoughtSpot Spotter: mature conversational analytics and transparent search-token style UX.
- Qlik Answers: structured/unstructured knowledge assistant with source grounding.
- Looker Gemini: semantic-layer-aware conversational analytics.

PulsePlay does not need to beat every tool inside its own silo. It must win on:

1. unified multi-BI surface
2. connector-agnostic AI
3. evidence + SQL traceability
4. floating companion workflow
5. theme/customization flexibility
6. internal-org deployment leverage
7. fast enough perceived output

If item 7 fails, the rest will not matter to users.

## Suggested Commit Plan

### Commit 1 — Measurement Truth

- Add/verify perf marks around AI Insights stages, Ask Pulse submit, polling, final render.
- Add request-id correlation where missing.
- Add result doc with cold/warm timings.

Validation:

- lint
- focused tests for instrumentation if touched
- visible browser timing evidence

### Commit 2 — First Useful Output

- Render cached/partial/deterministic first output within <= 5 seconds.
- Keep full run alive.
- Label partial/cached state honestly.

Validation:

- focused tests for partial state
- browser evidence with stopwatch timing

### Commit 3 — Stage Fusion or Two-Pass Pipeline

- Reduce number of Genie/LLM round trips.
- Preserve section IDs, SQL/evidence, and validation.

Validation:

- unit tests for section parsing/validation
- live timing comparison before/after

### Commit 4 — Progressive Section Rendering

- Sections paint independently.
- Per-section retries and SQL/evidence remain available.

Validation:

- visual/browser checks
- no dead panels
- no misleading "done" state

### Commit 5 — Warm Cache and Regression Guard

- Add warm-cache path for unchanged scope.
- Add perf budget test or documented manual benchmark.
- Update handover/project memory.

Validation:

- cold run
- warm run
- changed-scope run
- forced refresh run

## UAT Questions For Performance

Use these exact questions for repeatable comparison:

1. `What's the total revenue this year?`
2. `Show monthly sales for the last 12 months`
3. `Top 5 sales reps by revenue this year`
4. `Show sales by region and month`
5. `Why did return rate increase?`
6. `Which category has the highest profit margin?`
7. `Find the biggest risk in this dashboard`
8. `What changed since last year?`

For each:

- record cold time to first useful output
- record warm time to first useful output
- record time to full completion
- record whether SQL/evidence reconciles
- record whether chart/table values match returned rows

## Acceptance Criteria

Claude may call the performance pass successful only when:

1. At least one useful output appears within **<= 5 seconds** for simple questions.
2. Ask Pulse simple KPI questions complete within **<= 10 seconds** warm.
3. AI Insights paints at least the first meaningful section within **<= 10 seconds** warm.
4. Full AI Insights briefing no longer waits minutes on the happy path.
5. SQL/evidence remains available and honest.
6. Validator authority is unchanged.
7. The result is verified in the visible browser.
8. A result file exists under `docs/` with before/after timings.

If these are not met, say **PARTIAL**, not done.

## Final Handoff Expected From Claude

Claude should return:

1. Commits landed.
2. Before/after timing table.
3. Evidence folder path.
4. Which backend stage is still slow.
5. What was deliberately not fixed.
6. What Codex should verify next.

Suggested result file:

`docs/PERFORMANCE_RECOVERY_RESULTS_2026-05-19.md`

Suggested evidence folder:

`docs/evidence/perf-recovery-2026-05-19-<HHMM>/`

## Bottom Line

PulsePlay's concept is good enough to justify the effort. The product is not yet good enough to wrap. The next serious work must make it feel fast, not merely look busy.

