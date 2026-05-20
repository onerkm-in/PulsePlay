# PulsePlay — Handover Log

> **LIFO convention.** Newest entry on top. **Never** reorder existing entries.
> Each entry: a short header (date + headline) and a tight summary of what changed, why, and any tripwires for the next session.

---

## 2026-05-20 — Cycle 14: Cross-backend probe symmetry + failure visibility

**Scope.** Cycle 12 shipped `discoveryContext` injection on the Genie route only. The probe collected schema / KPIs / sample questions, but for 5 out of 6 backend paths the data sat in the cache unused — Foundation Model, OpenAI, Bedrock-direct, Bedrock-RAG, Supervisor, and FM staged sectioned were all blind to the probe's findings. This cycle closes the symmetry.

**Shared composers (new in [proxy/lib/discoveryPromptInjector.js](../proxy/lib/discoveryPromptInjector.js)).**
- `composeUserMessageWithContext({discoveryBlock, packBlock, packTag, userQuestion})` — stacks `[Discovery Context]` → `[Pack Context]` → `[User Question]` for backends without a system slot (Genie poll path, Bedrock RAG, Supervisor).
- `composeSystemPromptWithContext({systemPrompt, discoveryBlock, packBlock, packTag})` — augments the system prompt for backends with one (Foundation Model, OpenAI Chat Completions, Bedrock direct).

**Routes wired (all in `proxy/server.js`).**
- `/assistant/conversations/start` (Genie) — refactored to use the composer; behavior byte-identical to cycle 12.
- `/foundation/section` (FM single) — system-prompt augmentation.
- `/assistant/conversations/start-sectioned` (FM staged) — discovery resolved once before the loop, folded into every per-section system prompt inside `runSection()`.
- `/openai/conversations/start` — system-prompt augmentation alongside pack context.
- `/bedrock/conversations/start` — system-prompt for `bedrock-direct`; user-message header for `bedrock-rag` (the KB-coupled `RetrieveAndGenerate` API has no system slot).
- `/supervisor/conversations/start` — user-message header (Mosaic AI serving endpoints accept only a single user message).

Each route emits a `discovery-context-inject` audit-log action with the same structured detail shape as `pack-context-inject` so a single grep correlates all injection sites.

**Client.** [playground/src/components/AISidebar.tsx](../playground/src/components/AISidebar.tsx) now attaches `discoveryContext` to its `/conversations/start` body via a local `summariseSnapshotForRequest()` helper. Schema matches what Pulse genie.ts already emits; the proxy doesn't care which client side produced it.

**Probe failure visibility.** [playground/src/lib/probeStatusStore.ts](../playground/src/lib/probeStatusStore.ts) (new) — tiny pub/sub with `phase: idle | probing | ready | failed`. Subscribers can listen via React (`subscribeProbeStatus`) or vanilla (`pulseplay:probe-status` window event). [playground/src/App.tsx](../playground/src/App.tsx)'s prewarm + Pulse-mode auto-probe both emit through it. Replaces the cycle-12 silent `.catch(() => {})` pattern. UI surface (status pill / banner) is intentionally deferred — store + emit is the load-bearing part; future cycles can choose how to render.

**Validation.**
- proxy `npm test`: **947/947** (was 934 + 13 new composer cases)
- playground `npm test`: **1096/1096** (was 1085 + 11 new probe-status-store cases)
- playground `npm run lint`: clean
- playground `npm run build`: ✓ built in 12.89s
- `node --check proxy/server.js`: clean

**Honest deferrals.**
- **UI surface for probe status** — store + emit is the load-bearing part. A status pill ("Grounding degraded" near SetupReadiness) would be the natural follow-up. ~30-60 min.
- **Server-side cache key reuse for `/assistant/discover`** — explicitly skipped. Proxy's existing `_snapshotCache` 60-sec TTL already absorbs the herd; saving a few KB of payload per discovery is optimization, not user-visible value.
- **Per-section discoveryContext** — every section in `/assistant/conversations/start-sectioned` gets the SAME discovery block. Section-specific filtering (HEADLINE needs declared KPIs but RISKS only needs the connector type, etc.) could trim a few hundred bytes per call. Future cycle.
- **Pulse genie.ts already attached `discoveryContext` since cycle 12** — no change needed there. AISidebar is the new attacher; both clients produce wire-compatible envelopes.

---

## 2026-05-20 — Cycle 13: Author-selectable latency levers (Settings → Advanced → Performance)

**Scope.** Ship the headline deferred item from Cycle 12 — give deployers the speed-vs-completeness knobs the proxy already supported (or could be made to support) but were never UI-surfaced. Four levers, one localStorage bag, end-to-end wired.

**The four levers.**

| Lever | Range | Default | Effect |
|---|---|---|---|
| Insights reveal cadence | `instant` / `fast` / `balanced` / `full` | `balanced` | Picks the staged-reveal schedule. Instant = no staging; fast = headline at t=0 + body at t=4s; balanced = existing default (t=0/10/20/30); full = each section on its own 8 s beat. Cosmetic — doesn't change LLM cost. |
| Discovery prewarm | on / off | on | When off, App.tsx skips the cycle-12 screen-load `getDiscoverySnapshot` prewarm. First user query then pays the cold round-trip itself. |
| Insights cache TTL | 1..180 min | 30 | Surface for the existing `insightsCacheTtlMinutes`. Higher = faster repeat-questions; lower = fresher data. |
| Validation retry budget | 0..3 retries | 1 | Proxy-side server validation retries (`maybeValidateGeniePollResponse`). 0 = ship first answer verbatim (fast); 3 = retry up to three times (slow, higher quality). Client value overrides the deployer's `GENIE_POLL_VALIDATE_RETRIES` env default. |

**What changed.**
- **New [playground/src/settings/performanceLevers.ts](../playground/src/settings/performanceLevers.ts)** (`e82fc08`) — single source for the lever store. `loadPerformanceLevers()` / `savePerformanceLevers()` / `resetPerformanceLevers()` with defensive coercion, clamping, and event broadcast.
- **[playground/src/pulse/state/stagedReveal.ts](../playground/src/pulse/state/stagedReveal.ts)** (`e82fc08`) — new `FAST_REVEAL_SCHEDULE`, `FULL_REVEAL_SCHEDULE`, `INSTANT_REVEAL_SCHEDULE` constants + `revealScheduleFromCadence(label)` dispatcher.
- **Wire-up** (`bb953e9`):
  - `playground/src/pulse/visual.tsx`: subscribes to `PERFORMANCE_LEVERS_EVENT`; reads `activeRevealSchedule` from cadence; staged reveal disabled when cadence is "instant" OR legacy boolean is false.
  - `playground/src/App.tsx`: prewarm useEffect short-circuits when `discoveryPrewarmEnabled` is false.
  - `proxy/server.js`: `maybeValidateGeniePollResponse({ ..., clientMaxRetries })` honors client value; GET poll route parses `maxValidationRetries` from `req.query` and `req.body`.
  - `playground/src/pulse/genie.ts`: `readMaxValidationRetriesFromStorage()` synchronous reader; poll URL gets `&maxValidationRetries=N` suffix when lever is set.
- **[playground/src/settings/groups/AdvancedGroup.tsx](../playground/src/settings/groups/AdvancedGroup.tsx)** (`f3479a6`) — new "Performance levers" leaf with 2×2 cadence picker, prewarm toggle, TTL slider, retries slider, and Reset-to-defaults button (only enabled when at least one value has drifted from spec defaults).
- **Extracted [proxy/lib/validationRetryBudget.js](../proxy/lib/validationRetryBudget.js)** (`ca64605`) — pure helper module so the budget-resolution math is unit-testable without restructuring `server.js`. The `server.js` call site now delegates to `resolveBudget({ envValue, clientValue })`.

**Validation.**
- proxy `npm test`: **934/934** passing (was 923 + 11 new `validationRetryBudget.test.js`)
- playground `npm test`: **1085/1085** passing (was 1063 + 22 new across `performanceLevers.test.ts` and `revealScheduleFromCadence.test.ts`)
- playground `npm run lint`: clean (`tsc --noEmit`)
- playground `npm run build`: ✓ built in 15.71s
- `node --check proxy/server.js`: clean
- The pre-existing drift-prevention test in `leafLabels.drift.test.tsx` caught the new leaf and forced registration in `GROUP_LEAF_LABELS.advanced` in `SettingsShell.tsx` — surfaced by the test, fixed cleanly.

**Honest deferrals.**
- The PulseAiVisualSettings.insightsCacheTtlMinutes shadow write happens in the AdvancedGroup setter so the legacy pulse insights cache keeps working. If a deployer writes the lever JSON directly (skipping the UI), the legacy field can drift out of sync. Acceptable: the UI is the only documented author surface, and the cache code reads from PulseAiVisualSettings, which the UI always updates.
- Validation retry budget is honored on the Genie poll path only. The Foundation Model orchestrator (`proxy/lib/llmOrchestrator.js`) reads `ORCHESTRATOR_VALIDATE_RETRIES` separately and doesn't yet consume `clientMaxRetries`. Symmetric wire-up is a small follow-up (~30 min).
- Reveal cadence "instant" forces all-at-once; "fast" still uses two stages. A "no stages but instant within DOM batching" mode could give measurably smoother perceived response — punt for now.
- No `<PerformanceLeversPanel />` component-level test yet. The pure store + dispatcher modules have direct coverage; an integration test that mounts the panel and asserts the click→storage→event chain would be valuable next cycle.

---

## 2026-05-20 — Cycle 12: Full DwD purge + probe-once reuse (client+server)

**Scope.** User direction: "no DwD anywhere — it should be PulsePlay" plus "can we not use a query to probe as and when the user loads the screen and all other queries follow the same probe?". Two parallel slices in one cycle.

**Slice A — DwD purge (43 files).** Replaced DwD-isms repo-wide with PulsePlay or sister-project phrasing.
- Endpoint slugs + agent labels: `dwd-supervisor-agent` → `pulseplay-supervisor-agent`, `DwD Supervisor Agent` → `PulsePlay Supervisor Agent` (`deploy.ipynb`, `proxy/server.js` comments, supervisor README, `proxy/app.yaml`).
- localStorage + cache prefixes bumped: `dwd-ai-insights:v6:` → `pulseplay-ai-insights:v7:` (per ADR-0005, acceptable cache invalidation), `dwd-ai-insights-visibility:`, `dwd-setup-step5-*`, `dwd-export-lazy-blocked` all renamed.
- Window debug key `__dwdInsightsSectionsJson` → `__pulseplayInsightsSectionsJson`; SQL alias `dwd_validation_check` → `pulseplay_validation_check`.
- Default DB table fixture `dwd_ai_chat_history` → `pulseplay_ai_chat_history` in code + tests. The actual table name is per-profile configurable (`chatHistoryTable`), so deployers with an existing `dwd_ai_chat_history` table keep working — only the default example + error-message hint changed.
- Legacy session-state fallback REMOVED. [scripts/llm_onboard.py](../scripts/llm_onboard.py) and [llm_wrapup.py](../scripts/llm_wrapup.py) no longer read `.dwd-session.state.json`; `.gitignore` drops the line. Scripts have written the new name since 2026-05-10, so the fallback was dead weight.
- Inherited / heritage prose: "from DwD" → "from the sister project", standalone DwD in prose → "the sister project", etc.
- Final grep `dwd|DwD` across tracked files: 0 matches. (`f7090fa`)

**Slice B — probe-once reuse end-to-end.** The probe was already running once on Pulse mode load (Smart Connect), but its findings (KPIs / schema / sample questions) never reached the conversations/start prompt — Genie was answering blind to the metadata we'd collected. Closed the loop:
1. **App.tsx prewarm** (`e19e861`) — when (profile, pack) becomes known, fire `getDiscoverySnapshot()` once into the discoveryClient's sessionStorage cache (15-min TTL + in-flight dedupe). Subsequent surfaces hit the warm cache.
2. **New [proxy/lib/discoveryPromptInjector.js](../proxy/lib/discoveryPromptInjector.js)** + [proxy/server.js#/assistant/conversations/start](../proxy/server.js) — composes the prompt as `[Discovery Context]` → `[Pack Context]` → `[User Question]`. Either or both context blocks may be absent; prompt is byte-identical to today when `discoveryContext` is absent. New `discovery-context-inject` audit-log action.
3. **[playground/src/pulse/genie.ts](../playground/src/pulse/genie.ts)** — synchronous `readCachedDiscoverySummary(profile)` scans sessionStorage and summarises the snapshot (connector type, table count, available KPIs, reachable frames; bounded at 20 KPIs + 12 frames); `startConversation` + `sendMessage` attach it as `discoveryContext` on every request. (`5836dd6`)

**Validation.**
- proxy `npm test`: **910/910** passing
- playground `npm test`: **1063/1063** passing
- playground `npm run lint`: clean (`tsc --noEmit`)
- playground `npm run build`: ✓ built in 17.00s
- `node --check proxy/server.js`: clean

**Honest deferrals.**
- No unit test added for `discoveryPromptInjector.js` yet — the proxy integration tests pass and the helper has a tight surface (3 inputs, conditional string concat), so a focused unit test is low-priority follow-up.
- A future cycle could swap to a server-resolved `discoverySnapshotCacheKey` lookup against the existing `_snapshotCache` in `discoveryEngine.js` (60-sec TTL) so the client only sends a hash, saving a few KB of payload per question.
- KPI/frame caps (20 / 12) silently truncate richer snapshots. Reasonable for v1; revisit if specific KPIs get clipped in practice.

---

## 2026-05-20 — Cycle 11: Audit close-out — SigV4 dedup, ADR-0003 rewrite, CI workflow, doc accuracy

**Scope.** A prior cloud-container session described a 7-commit audit close-out that never reached this repo (no branch on `origin`, no patch files on disk, only `docs/findingProbeIssue.md` had been carried in via Cycle 10). Verified each claim against current local main and applied the changes that were genuinely missing.

**Pre-flight finding (important).** Local `main` was tracking `origin/publish/local-main-2026-05-20`, not `origin/main`. The two have diverged 314/50 — `origin/main` carries v0.1.3 + security audit work + the richer Insights export toolbar (`6c88a4a`) we do **not** want to lose. Re-pointed tracking to `origin/main` and did **not** push local `main` anywhere. The audit work shipped on its own branch.

**What changed.**
- [proxy/server.js](../proxy/server.js): `bedrockRetrieveAndGenerate` is now a 5-line delegate to `proxy/lib/bedrock.js`. The inline 62-line SigV4 implementation it duplicated is removed. Byte-identical behavior. (`748c984`)
- [docs/adr/0003-supervisor-stagger.md](adr/0003-supervisor-stagger.md): Decision section rewritten. It used to claim a fixed 800 ms default but actual code at [proxy/server.js:6385](../proxy/server.js#L6385) ships 2000 ms. The body now carries the full 350 → 800 → 1500 → 2000 ms tuning history as a table, plus a "if you change this, add a row" guardrail. (`477f075`)
- [databricks-agents/supervisor/agent.py](../databricks-agents/supervisor/agent.py): Module docstring said "PulsePlay Multi-Domain Supervisor Agent." Renamed to "PulsePlay…". Other the sister project mentions in the repo (App.tsx, AISidebar.tsx, pulse/*) are intentional sister-project context and were left as-is. (`1d4bf84`)
- [CLAUDE.md](../CLAUDE.md): Supervisor-stagger tripwire pointed at a renamed ADR file (`0003-supervisor-stagger-800ms.md` — 404'd) and the stale `proxy/server.js:3556` citation. Both fixed to `0003-supervisor-stagger.md` and `:6385`. (`4a3a2f5`)
- [.github/workflows/test.yml](../.github/workflows/test.yml): new — two parallel jobs (proxy jest, playground lint+vitest+build) on Node 20 ubuntu-latest. Triggers on PR + push to main + push to `publish/**`. (`bf01f2c`)

**Verified-already-present (no commit).**
- `docs/findingProbeIssue.md` — already in repo as of Cycle 10.
- CLAUDE.md Genie message-immutability tripwire — added in Cycle 10.
- `findingProbeIssue.md`-driven changes to sectionedOrchestrator + AGENTS.md + STAGED_RENDERING — all already shipped.

**Honest deferrals.**
- Author-selectable latency levers (settings UI for staggerMs / FM concurrency / Genie pre-flight skip / etc.) — designed previously, still not built. Largest user-pain win available; should headline the next cycle.
- Origin divergence cleanup (314 publish-branch commits vs 50 origin/main commits) is a strategic call, not a code task. Either merge `publish/local-main-2026-05-20` → `origin/main` after a careful diff review, or rebase `origin/main`'s 50 commits onto local. Don't auto-resolve.
- the sister project references in `playground/src/pulse/themeConfig.ts`, `setupStep5Validation.ts`, `style/visual.less` left untouched — they're inside the explicit Pulse-PBI compat shim per CLAUDE.md, so they document inheritance, not naming drift.

**Validation.**
- `node --check proxy/server.js` clean post-edit.
- Full suite run pending — see end-of-cycle results below or in the next commit.

---

## 2026-05-20 — Cycle 10: Staged SSE `renderId` envelope after Genie message probe

**Scope.** User supplied [findingProbeIssue.md](findingProbeIssue.md) plus a Databricks HAR. The markdown proves Genie REST cannot share one `message_id` across multiple section calls; the HAR was checked and is **not** API-level evidence (UI assets + `popproxy/health` + `data-rooms/.../value-index` + telemetry only). Shipped the recommended Path A: one PulsePlay logical assistant envelope keyed by `renderId`, while Genie can still allocate N upstream `message_id`s under one `conversation_id`.

**What changed.**
- [proxy/lib/sectionedOrchestrator.js](../proxy/lib/sectionedOrchestrator.js): added `createRenderId()` / `resolveRenderId()`, optional `opts.renderId`, and automatic `renderId` stamping on every orchestration event.
- [proxy/server.js](../proxy/server.js): `/assistant/conversations/start-sectioned` now accepts optional `renderId`, passes it into the orchestrator, and includes it on `orchestrator-failed` frames too.
- [playground/src/hooks/useSectionedStream.ts](../playground/src/hooks/useSectionedStream.ts): hook exposes `renderId`, captures it from SSE frames, and reuses it when `regenerate(sectionId)` posts a selective rerun.
- [playground/src/styles.css](../playground/src/styles.css): visual-smoke follow-up. The `SectionedAnswer` component already had lifecycle class names but no CSS, so it would have rendered as a plain ordered list. Added card, status, skeleton, streaming, failed, JSON, meta, and regenerate-button styles.
- [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [docs/STAGED_RENDERING.md](STAGED_RENDERING.md), and [proxy/tests/genieSqlSections.test.js](../proxy/tests/genieSqlSections.test.js): new tripwire / wording that Genie messages are immutable; UI grouping must use PulsePlay `renderId`, not Genie `message_id`.

**Validation.**
- Focused proxy sectioned tests: **59/59**.
- Focused hook/parser + visual component tests after CSS: **26/26**.
- Full proxy `npm test`: **910/910**.
- Playground `npm run lint`: clean.
- Full playground `npx vitest run`: **1063/1063** after CSS.
- Playground `npm run build`: green. Vite repeated existing chunking warnings for statically imported BI adapters; no build failure.
- Browser visual smoke: started local proxy + Vite, opened the real app, then opened a temporary Vite harness that imported the actual `SectionedAnswer.tsx`. Evidence saved under [docs/evidence/renderid-ui-smoke-2026-05-20](evidence/renderid-ui-smoke-2026-05-20): app shell plus styled SectionedAnswer harness. Harness DOM check: 5 items, 2 completed, 1 streaming, 1 pending, 1 failed; browser logs for the harness had no warnings/errors.

**Honest deferrals / tripwires.**
- This does **not** make Genie share one real upstream `message_id`; that is upstream-impossible per the live probe.
- The live Genie staged route is still queued. This cycle prepares the transport/UI grouping contract so the later Genie implementation has the correct envelope from day one.
- `SectionedAnswer` is visually smoke-tested as a primitive, not as a live AISidebar flow, because the staged SSE path still is not wired into AISidebar.
- Pre-existing unrelated working-tree changes in `playground/package*.json`, `playground/src/App.tsx`, and deleted `DayCycleBubble.tsx` were not touched.

---

## 2026-05-20 — Cycle 9: Phase E client-side staged reveal for Genie single-shot answers

**Scope.** Rajesh observed Pulse Insights rendering the full Genie answer at once (screenshot). Asked for the same "1 then 2-each every 10s" cadence Phase D ships for FM, but layered onto the EXISTING Genie message id without re-querying. This is a pure-cosmetic pacing pass — no extra LLM calls, no extra cost.

**E.1 — pure schedule module ([commit `b3412c8`](.))**
- New `playground/src/pulse/state/stagedReveal.ts`: `DEFAULT_REVEAL_SCHEDULE` (HEADLINE@0, KPI+TRENDS@10s, RISKS+ACTIONS@20s, OPPORTUNITIES@30s), `computeRevealState`, `nextRevealTickMs`, `validateSchedule`.
- Custom-Adjust safety: sections present in the parsed content but NOT named in any stage are revealed unconditionally so SWOT / STRENGTHS / etc. never get stuck hidden.
- Stage pruning: stages whose sections aren't present in the parsed content are dropped from `totalStages` (no phantom future pills).
- 17 vitest cases covering cadence + composition + edge cases.

**E.2 — wire into Pulse Insights ([commit `39f7e43`](.))**
- `InsightsRenderOptions.revealedSectionTitles?: Set<string> | null` — when present, sections not in the set render as `InsightsSectionPlaceholder` (status=pending) so the briefing SHAPE is preserved during the reveal.
- `App` component: per-space `contentArrivedAtRef`, `reducedMotionRef`, `revealTick` state, `parsedSectionTitlesForReveal` memo, `revealState` memo (recomputes on revealTick), scheduled `setTimeout` to bump revealTick at each stage boundary, reset-on-busy effect.
- Stage progression strip above the briefing render — done/current/pending pills with `· next in Ns` countdown. Driven from `revealProgress.stageProgress` so what the user SEES exactly matches the schedule.
- Settings: `insightsStagedRevealEnabled: boolean` (default true) added to Pulse settings + PulseAi store + the AI Insights settings card.
- Reduced-motion: `prefers-reduced-motion: reduce` → return null reveal state → every section renders instantly.

**Validation.** tsc clean, 1059/1059 vitest (was 1042 + 17 new), playground build green, proxy untouched (787/787 from prior run still valid).

**Tripwires for next session.**
- The reveal kicks in only after `insightsResult.status === "DONE"` AND content is non-empty AND a space-specific arrival stamp has been recorded — during in-flight RUNNING the existing skeleton-grid path already paces things.
- Schedule lives in `playground/src/pulse/state/stagedReveal.ts`. To tweak cadence, edit `DEFAULT_REVEAL_SCHEDULE` (and the cadence tests in `__tests__/stagedReveal.test.ts`). DON'T silently mutate without bumping the test expectations.
- Stage strip uses `data-stage-index` + `data-stage-status` for any future smoke-test hooks.
- Pulse-PBI compat: changes are additive. New setting defaults true in PulsePlay; sibling Pulse-PBI can opt out via the same setting if needed.

---

## 2026-05-20 — Cycle 8: Phase D staged "1-then-3" rendering (beast-mode, full slice)

**Scope:** Implement the staged section-by-section render path end-to-end — orchestrator + SSE endpoint + UI primitive + selective re-run. Plugin-agnostic by design: connector-axis stays FM-only for v1 (Genie path follow-up), vendor-axis untouched (this is the AI-render plane). User amended the original "1 then 3" schedule to "head 2 (first now, second after 2s) then 2-each batches" — encoded in `DEFAULT_SCHEDULE`.

**What shipped (4 commits stacked on `main`, all green):**

- [`c28da22`](../proxy/lib/sectionedOrchestrator.js) **Phase D.1 — `proxy/lib/sectionedOrchestrator.js`** + 37 unit tests. Transport-agnostic, LLM-agnostic backbone: caller injects `runProbe` + `runSection` thunks; orchestrator stages execution per `DEFAULT_SCHEDULE` `[{['HEADLINE','KPI'],spreadMs:2000}, {['TRENDS','RISKS'],0}, {['RECOMMENDED_ACTIONS','OPPORTUNITIES'],0}]`; `buildDefaultSchedule(ids, {headSpreadMs})` derives schedules for arbitrary section sets (head of 2 with clamped spread → 2-each tail); `validateSchedule` enforces SPREAD_MAX_MS=30s, no dup section ids, no negatives, non-empty stages; custom async iterator (`emit`/`next`/`buffer` pattern) yields probe-started/completed/failed + section-started/completed/failed + all-completed; HEADLINE result captured and threaded to downstream stages; per-section errors isolated (don't kill peers); `regenerateOnly` + `probeCache` + `headlineCache` for selective re-run; `AbortSignal` support.

- [`8faf690`](../proxy/server.js) **Phase D.2 — `POST /assistant/conversations/start-sectioned`** + 11 SSE integration tests. Express SSE endpoint (`Content-Type: text/event-stream`, `X-Accel-Buffering: no`, `flushHeaders` + per-frame `res.flush()`). Validation order matters: profile → userPrompt → sections-or-schedule → schedule shape — all 400 JSON BEFORE the SSE opens. `runSection` thunk calls `callFoundationModel` with `messages: [system,{role:user,content:"Section: <id>\n\n<userPrompt>"}]`, returns `{body: parsedJson||content, usage}`. Iterates orchestrator output and writes each event as a frame. Defensive client-gone handling via `res.on('close')` (not `req.on('close')` — supertest fires that early). Two debugging gotchas locked: (a) supertest doesn't auto-buffer `text/event-stream` — tests must register `.buffer(true).parse(...)` and read `res.body` not `res.text`; (b) `req.on('close')` aborted the stream after one frame in tests — `res.on('close')` is the correct hook.

- [`358679b`](../playground/src/components/SectionedAnswer.tsx) **Phase D.3 — `SectionedAnswer` component + `useSectionedStream` hook** + 23 tests (12 component + 11 hook/parser). Pure render component owns no network state: takes `sections: SectionDescriptor[]` + `sectionStates: Record<id, {status,body?,error?,durationMs?,usage?}>`; renders one of four lifecycles per section — `pending` (skeleton + `aria-busy=true`), `streaming` (`Generating…` + pulse line + `aria-busy=true`), `completed` (body + optional `Math.round(ms) · N tokens out` meta + per-section `↻ Regenerate`), `failed` (`role=alert` + `↻ Retry`). `renderBody` override lets each section type stringify how it wants (defaults to string passthrough / `<pre>` JSON). The companion hook POSTs to `/api/assistant/conversations/start-sectioned`, consumes SSE via `fetch` + `ReadableStream` (EventSource is GET-only), exposes a tested `parseSseChunkBuffer(buf): {events, rest}` that handles partial-chunk reassembly + malformed-frame skip + trusts SSE event-name over payload `kind`. `isStreaming` propagates to the Regenerate button so peers can't fire mid-stream.

- [`9c54f10`](../playground/src/hooks/useSectionedStream.ts) **Phase D.4 — `hook.regenerate(sectionId)`** + 3 tests. Closes the selective re-run loop without leaking SSE plumbing into consumers. The hook auto-captures `probe-completed.rows` into `probeCacheRef` and `HEADLINE` body into `headlineCacheRef` during the first stream, and remembers the full `start()` payload in `lastPayloadRef`. `regenerate(id)` re-issues the SAME payload (preserves `userPrompt`, `profile`, `temperature`, `sections`) pinned to `regenerateOnly: [id]` with the cached probe + headline attached. Peer sections stay `completed`, the named section blanks back to `pending` then lands `completed` with the new body. Multiple successive regenerates do NOT clobber the cached base payload.

**Validation:**
- Proxy `npm test`: **899/899** (was 851 → +48: 37 D.1 unit + 11 D.2 integration).
- Playground `npx vitest run`: **1042/1042** (was 1016 → +26: 12 SectionedAnswer + 11 hook/parser D.3 + 3 hook regenerate D.4).
- Playground `npm run lint`: clean.
- All four commits stacked on `main` after fast-forward.

**Honest deferrals / known scope skipped (per beast-mode contract — naming them, not hiding them):**
- The new SSE endpoint is **FM-only**. Genie path (`runProbe` for SQL, `runSection` via follow-up messages on the same conversation) is queued. The orchestrator is already Genie-shaped — `runProbe` + cached-row-in-message-text pattern is documented in [STAGED_RENDERING.md](STAGED_RENDERING.md) — but the route wiring is not in this cycle.
- **No real probe yet.** v1's `runSection` doesn't call `runProbe`; sections work directly from `userPrompt`. Once the discovery-loop SQL plumbing lands, `runProbe` plugs into the orchestrator option of the same name and the section thunks consume `probeCache.rows`.
- **No tokens-streaming yet.** `section-token` is part of the event vocabulary in [STAGED_RENDERING.md](STAGED_RENDERING.md) but neither emitted nor consumed today — `streaming` state currently means "started, awaiting completion". Token-by-token is its own cycle.
- **AISidebar integration not done.** The component + hook are shipped and fully tested; wiring them into the live Ask Pulse / AI Insights surfaces is the follow-up cycle (it's a UI integration, not a primitive change).
- **No browser smoke.** Tests are exhaustive at the unit + SSE-integration level but no live `proxy` + dev-server end-to-end run was performed in this cycle.

**Tripwires honored:**
- No Pulse-PBI sibling compat broken (`playground/src/pulse/*` untouched).
- No Genie sandbox widening.
- No validator authority weakening.
- No credentials introduced in browser bundle (FM call stays server-side).
- Embed-token / vendor-axis untouched — Phase D is the AI-render plane only.
- Brutal honesty: the orchestrator's `regenerateOnly` filters at the IR-section level, so callers must include the section in the original `sections` list. If they don't, `regenerate()` will emit zero events + `all-completed:{sections:0}`. This is the intended invariant (locked in D.1 unit tests).

---

## 2026-05-20 — Cycle 7: Power BI + Databricks intensive test pass with cross-plugin parity lens

**Scope:** Beast-mode test coverage on the Power BI + Databricks slice of the plugin contract, applied through the vendor-agnostic lens — every BI tool is just one plugin behind `BIAdapter`. Five stacked commits, all green:

- [`a86241c`](../bi-adapters/databricks-genie/__tests__/index.test.ts) `test(databricks-genie)` — 7 → **41 tests**. URL parsing edge cases (URI-encoded spaceId, embedPath leading-slash normalize, trailing-slash workspaceUrl trim, iframe-src extraction with `&amp;` decode and case-insensitive `SRC=`); sandbox lock-in + **negative deny-list** (no `allow-top-navigation`/`modals`/`storage-access`/`orientation-lock`/`pointer-lock`); `cfg.sandbox` per-mount override; `allowedOrigins` L2 gate; title defaults; destroy idempotency; remount-after-destroy. **Honest finding locked**: whitespace-only `url` does NOT fall back to iframe — it throws EMBED_FAILED (current contract).
- [`7d16ed3`](../bi-adapters/databricks-aibi/__tests__/index.test.ts) `test(databricks-aibi)` — 21 → **33 tests**. SDK path tested via top-level `vi.mock("@databricks/aibi-client", () => ({ DatabricksDashboard: class {...} }))` factory — Vitest intercepts the dynamic `await import()` even though the module is not installed in `node_modules`. Covers `hideDatabricksLogo`, `token`/`accessToken` alias, `workspaceUrl` fallback when `instanceUrl` absent, SDK-absent+no-fallback → EMBED_FAILED, iframe fallback path, destroy calls both `.destroy()` and `.dispose()` defensively.
- [`9f95602`](../bi-adapters/powerbi/__tests__/index.test.ts) `test(powerbi)` — 49 → **67 tests**. `tokenType` (`Embed=1` default, `Aad=0`); `permissions` (`Edit→All=7`, `View→Read=0`); `loaded` subscription registers BOTH `loaded` AND `rendered` PBI events; `data-refreshed` bridges `dataRefreshed`; `error` bridges PBI error (payload exposes `pbiEventName + raw` — NOT flattened `.message`; test locks the real shape, not a wish); secure-iframe sandbox defaults + `cfg.sandbox` override + URL gating (non-reportEmbed/non-https rejected); `getDeveloperSnapshot` error branches accumulate per-getter failures.
- [`4c1b1a1`](../playground/src/biPanel/__tests__/registry.parity.test.ts) `test(biPanel): cross-plugin parity` — NEW file, **14 tests**. The plugin-architecture surface itself: exact registered set; `VendorInfo` shape; only `generic-iframe` ships `configured:true`; unknown vendor throws actionable error enumerating known IDs; every plugin loads through the same `BIAdapter` contract (`vendor`/`displayName`/`capabilities`/`mount`/`on`/`send`/`destroy`); Power BI's filter+nav advertising is documented as INTENTIONAL vendor-specific, not host privilege; `send()` pre-mount throws `NOT_MOUNTED` for every plugin; `destroy()` pre-mount no-op; Vite lazy-load posture (factory not singleton, async-only signature).
- [`7c30f1c`](../proxy/tests/databricksCapabilityRegistry.test.js) `test(databricks-capabilityRegistry)` — 5 → **14 tests**. `forceRefresh` bypasses valid cache; `reset()` clears cache; **single-flight concurrency** coalesces 5 parallel calls into ONE 6-probe burst (not 30); `forceRefresh` does NOT join an in-flight probe; degraded inputs return all-error snapshots; `jobs` probe `ready=true` even at count=0 (admin endpoint existence is the signal); vector-search alternate `vector_search_endpoints` key; 500-class errors trimmed to ≤240 chars.
- [`8d8a224`](../proxy/tests/databricksEnablement.unit.test.js) `test(databricks-enablement)` — NEW file, **55 tests**. Every normalizer walked against alternate REST key shapes (snake_case vs camelCase, `dashboard_id`/`dashboardId`/`id`, `embed_url`/`embedUrl`/`url`, `endpoint_name`, `cluster_size`); URI-encoding in workspace URLs; `sanitizeVectorSearchQuery` clamps `[1, 50]`, NaN→5 fallback, floors decimals, snake_case alias, `query`/`text` aliases, columns trim/dedup/cap-50, filters JSON-stringify, reranker passthrough.

**Lens applied per Rajesh's reminder** ("PulsePlay is no longer Power BI-only — Power BI is a plugin like every other vendor"): tests reinforce the `BIAdapter` contract as the universal interface and add a cross-plugin parity test that loads every registered vendor through the same surface. Power BI's deeper SDK coverage reflects that it has the deepest plugin (powerbi-client + secure-iframe fallback), not host privilege.

**Validation:** Full proxy `npx jest` **851/851** (was 787 → +64). Full playground `npx vitest run` **1016/1016** (was 952 → +64). All 5 commits stacked on `main`, no production code touched.

**Tripwires preserved:** no Pulse-PBI sibling compat broken (no `playground/src/pulse/*` touched); no Genie sandbox widening (new tests assert the narrow defaults stay narrow); no validator authority weakening; brutal-honest where the current contract surprised us (locked the real behavior, not the wish).

---

## 2026-05-20 — Cycle 6: Dashboard tab visual parity with AI Insights + Ask Pulse

**Range:** Follow-on to the 5-cycle UI/UX iteration below. User ask: "when Dashboard is enabled as a tab, it should follow the same design as in AI Insights and Ask Pulse."

**What shipped (`8fcad45`):**
- New shared component [`playground/src/components/PaneEmptyState.tsx`](../playground/src/components/PaneEmptyState.tsx) with exported `DashboardIcon` / `InsightsIcon` / `AskPulseIcon` SVGs (matching the SurfaceSwitcher glyphs). Single source of truth for the empty-state shell — icon disc → heading → description → capability list → primary / secondary CTAs → optional hint.
- New `.pp-empty-state*` + `.pp-cta-primary` / `.pp-cta-secondary` rules in `playground/src/styles.css` that mirror the `.gn-insights-placeholder` + `.gn-cta-*` rules in `pulse/style/visual.less`. The Dashboard tab now looks identical whether Pulse styles are loaded (mix / pulse mode) or not (biOnly).
- `App.tsx` Dashboard empty state rewritten to use `<PaneEmptyState>`: bar-chart SVG icon, heading "Dashboard", vendor-neutral description framing Dashboard as a peer surface, 4-line capability list, primary CTA "Open BI settings →" → `navigateToSettings("bi")`, secondary CTA "Browse knowledge packs" → `/knowledge`, "Vendors available: …" hint from the allowlist.
- Both branches (`aiVisible` vs Dashboard-only) use the same component; only copy differs to match the surrounding context.

**Live verification (mobile 375x812 + desktop 1440x900):**
- Dashboard tab: bar-chart icon in accent disc, heading, 4 bullets, 2 CTAs, vendor hint. Layout stacks cleanly on mobile.
- AI Insights tab: orange sparkle, heading, 4 bullets, 2 CTAs — same visual rhythm.
- Ask Pulse tab: Quick start + Try asking chips — same typography + button system.
- Primary CTA navigates to `/settings/bi`; secondary CTA navigates to `/knowledge`.

**Tests:** **952/952 playground tests pass** (+7 new PaneEmptyState contract tests). `npm run lint` clean. Pre-existing `visual.less` HMR errors in the dev-server console were stale buffer entries from earlier in-progress edits; current Less compiles fine (verified by the Cycle 5 production build).

**Honest design call:** the user said "follow the same design as AI Insights and Ask Pulse." The audit found AI Insights uses the icon → heading → description → bullets → CTAs pattern and Ask Pulse uses the captions → suggestion-chips pattern — different content patterns, same typography / button system. Dashboard maps naturally to the AI Insights pattern (it's a "read-only result preview" surface, not an "interactive sample" surface), so the cycle aligns Dashboard with AI Insights's specific layout while keeping the shared design vocabulary so the three tabs feel like one product.

**Tripwires preserved:**
- No `pulse/visual.tsx` AI Insights JSX touched (Pulse-PBI compat surface respected; visual parity achieved through mirrored CSS rules instead).
- No Genie iframe sandbox widening.
- No allowlist authority weakening — fallback hint reads the `visibleVendors` allowlist, not the raw vendor registry.

**Carry-forward:** the `<PaneEmptyState>` component is now the right abstraction for any future surface that needs an empty / coming-soon state (Workbench, future LaunchPad surfaces). Re-use it instead of duplicating inline JSX.

---

## 2026-05-20 — UI/UX audit + iterative fixes (5 cycles)

**Range:** Comprehensive UI/UX audit at HEAD `b0636d1`, followed by 5 iterative fix cycles closing every P1 and every material P2 finding. Audit doc: [`docs/CLAUDE_UI_UX_AUDIT_2026-05-19.md`](CLAUDE_UI_UX_AUDIT_2026-05-19.md) — top of file has a per-finding status table.

**Cycles shipped:**
- **Cycle 1 (`71c6320`)** — P1-1 Settings phantom-dirty fix (`META_KEYS` exclude list in `useSettingsDraft.ts`); P1-3 wizard initial focus on persona radio instead of × dismiss button; P1-4 body scroll lock with overflow-restore; P1-2 `<meta name="color-scheme" content="light only">` honest opt-out until a real dark theme ships. +9 tests.
- **Cycle 2 (`204e1b2`)** — P2-4 surface label "BI Viz" → "Dashboard" (with matching "Open dashboard surface" aria-label); P2-6 Ask Pulse Send button `↑` → SVG; P2-7 Settings search `🔍` → SVG; P2-8 setup rail "two short steps" → "three short steps" reconcile; P2-9 footer "Continue setup" → "Related areas". 4 integration tests updated for the rename.
- **Cycles 3 + 4 (`43d2173`)** — P2-2 new `lib/renderMarkdown.tsx` + 16 regression tests, wired into AISidebar narrative (Genie / Foundation Model / Supervisor / Bedrock markdown now renders properly; safe-by-construction, no innerHTML, link protocol allowlist); P2-11 `role=status aria-live=polite` on submitting/polling/KPI-loading; P2-1 AI Insights empty state ports Ask Pulse's guided start with 2 CTAs (`Connect AI assistant →` / `Browse knowledge packs`); P2-13 fail-closed error copy reads configured `apiBaseUrl` instead of hardcoded `127.0.0.1:8787`; P2-14 perfInstrumentation `console.table` gated on DEV or `window.__pulseplayPerfDump`; P2-15 KnowledgeShell Esc uses `navigateToSettings()`.
- **Cycle 5 (HEAD)** — P1-5 / P3-1 refresh `CLAUDE.md` test counts (161/418 → 945/787); audit doc updated with per-finding status; this handover entry.

**Validation:** 945/945 playground tests pass (+25 over the audit baseline of 920); 787/787 proxy tests pass; `npm run lint` clean; `npm run build` clean (32.15 s).

**Live verifications captured during the audit + iteration:**
- Wizard now focuses the checked persona radio (`pp-first-run-persona-analyst` with `aria-checked=true`).
- `document.body.style.overflow === "hidden"` while wizard mounted; restored to `""` after navigation away.
- Repro of original phantom-dirty: clear localStorage → open `/`, click "Skip for now", press `Ctrl+,` → SaveBar no longer renders; `pulseplay:settings-last-group` and `pulseplay:wizard-dismissed` writes after mount no longer flip `isDirty`.
- "Dashboard" label live in the surface switcher with `aria-label="Open dashboard surface"`; no `"BI Viz"` substring left in any user-visible string.
- Empty state for AI Insights pre-config now lists Headline / Trends / Risks & opportunities / Recommended actions + 2 CTAs; "Connect AI assistant →" navigates to `/settings/ai`.
- Settings search shows SVG magnifying glass instead of `🔍`; setup rail says "three short steps"; footer says "Related areas".

**Deferrals carried forward:**
- **P1-2 dark mode itself.** The opt-out is the honest interim; shipping a real dark theme is its own cycle. `<meta color-scheme="light only">` keeps browser-painted form controls + scrollbars consistent with the still-light surface CSS in the meantime.
- **P2-3 "mix" mode empty right half.** Intentional layout-policy choice for v1 per `surfaceRegistry`; needs a product call before changing.
- **P2-5 full inline-style sweep in AISidebar / KnowledgeShell.** Cycle 3 added shared `.pp-md*` classes for markdown rendering; the broader `style={{…}}` → CSS class migration is its own cycle.
- **P2-10 ReactQuery devtools floating button.** Dev-only; doesn't ship.
- **P2-12 latency itself.** Already tracked in `docs/CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md`; instrumentation now in place.
- **P2-16 per-vendor sandbox tightening.** Tracked for when Tableau / Qlik / Looker / Databricks adapters graduate past iframe stub.
- **P2-17 wizard × race.** Withdrawn — verified live; the dismiss flag is written synchronously and the dialog unmounts on the next render commit. Original audit observation was a React-batching artifact.

**Tripwires preserved:**
- No Genie iframe sandbox widened.
- No validator authority changed.
- No Pulse-PBI sibling compat surface broken (`pulse/visual.tsx` aria-live additions are additive; nothing in `pulse/backend/*` touched).
- No secrets ever written to logs / errors / docs (proxy URL reveal is the configured `apiBaseUrl` only, not any token).
- `useSettingsDraft` discard path now leaves META keys alone — clicking Discard can no longer accidentally re-open the wizard the user just dismissed.

**Honest note about scope:** the markdown renderer is intentionally minimal (no tables, no autolinks, no inline HTML passthrough). If a backend starts emitting tables in narrative, extending `parseBlocks()` is the right move — opening up to `react-markdown` is not, because the chat surface should NEVER render raw HTML the model can write.

---

## 2026-05-19 — Stale-while-revalidate for AI Insights warm loads

**Range:** Addresses guide Phase 1 "Fast First Output — render cached last-known briefing if scope is unchanged, clearly labeled as cached." Closes guide acceptance criterion #3 (AI Insights paints first meaningful section within ≤ 10 s **warm**).

**What changed:** On a warm load (valid cache hit), AI Insights now shows the full cached briefing immediately (< 500 ms), kicks off a background refresh, overlays a "Showing last completed briefing while PulsePlay refreshes" banner, and swaps in fresh results atomically on completion. On stop/failure the banner clears silently and the cached content stays. `runInsights` now accepts `backgroundRefresh?: boolean`; when true it skips the initial RUNNING clear, suppresses per-stage updates, and commits atomically. Per-stage updates are still live for cold (non-background) runs.

**Before/After:**
- Cold load (no cache): 3:39 → unchanged (this fix is warm-path only)
- Warm load (scope unchanged, valid cache): 3:39 → < 500 ms first paint; fresh loads in ~3:39 in background

**Validation:** `npm run lint` clean; **920/920** tests; build clean (20.13 s).

**Tripwires:** `backgroundRefresh` only passed by the cache-hit path — chip clicks/Adjust/auto-fire are cold. Stopping during background refresh clears the banner but does NOT show "Stopped" (cached content is kept). Per-stage updates suppressed in background mode — `stageStatuses` are committed atomically, not live.

---

## 2026-05-19 — Claude guide for PulsePlay potential + performance recovery

**Range:** Docs-only handoff for Rajesh's request to make PulsePlay's actual potential addressable while treating current performance as the top blocker, not a cosmetic issue.

**Files touched:**
- [`docs/CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md`](CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md) — Claude-ready plan covering the strategic product truth, non-negotiable latency bar, current suspected bottlenecks, required measurement pass, real fix strategy, staged commit plan, UAT questions, and acceptance criteria.

**Key guidance locked:**
- The latest concurrency-2 work (`7c6d84e`) is useful but **not** a performance fix unless live timings prove the 5-10 second useful-output target.
- Do not fake speed with spinner copy; the target is useful output: headline, KPI, chart/table/SQL/evidence, or an honestly labeled cached/partial result.
- Next implementation should start from measurement, then attack first useful output, stage fusion/two-pass execution, progressive section rendering, and warm-cache behavior.

**Validation:** Docs-only; no code tests run.

---

## 2026-05-19 — AI Insights pipeline: concurrency-2 with stage-0 head-start

**Range:** First concrete latency lever for AI Insights, per Rajesh's "process two sections at a time, delay the second by 5-10 s on first load, all share the same conversation" ask. Pipeline shape change only — does not touch backend or model selection.

**Files touched:**
- [`playground/src/pulse/visual.tsx`](../playground/src/pulse/visual.tsx) `runInsights` IIFE — replaces the cycle-47.14 pattern (`await runStage(0); then concurrency-3 pool for stages 1+`) with a single concurrency-2 pool that picks up stage 0 immediately and stage 1 after an 8 s head-start. The cycle-47.2 single-flight conversation opener in `obtainMessage()` is unchanged, so every stage still shares the same `conversation_id`.

**What changed in flow:**
- Stage 0 starts at `t=0` (claims the cycle-47.2 conversation opener race).
- Stage 1 starts at `t=8 s` on the same conversation (joiner — calls `sendMessage`, not `startConversation`).
- Stages 2+ are drained by the same two workers as soon as worker A or B finishes its current stage.
- HEADLINE-first paint guarantee is preserved by giving stage 0 the 8 s lead — in the common case it still paints before stage 1 lands.
- Stop request honored before the second worker's delayed first pick (same `__STOP_REQUESTED__` sentinel as elsewhere).

**Honest expectations:**
- For a 4-5 stage briefing where each stage costs ~60 s on Genie, this trims roughly one stage's worth of wall-clock vs the cycle-47.14 serialization (because stages 0 + 1 now overlap from the start instead of stages 1+ waiting for stage 0 to fully complete).
- This is **not** the 3:39 → 5-10 s leap. The dominant cost is Genie's per-message latency, which is upstream of pipeline orchestration. Use the perfInstrumentation `console.table` from `b71270f`/`eae37a1` to see the per-stage durations; the next levers (stage-fusion, prompt trimming, supervisor switch, foundation-model streaming path) are different cycles.
- Backend rate-limit pressure is gentler: only 2 in-flight Genie messages per run instead of 3.

**Validation:**
- `npm run lint` clean (TypeScript noEmit).
- Full tests: **920/920** across 72 files.
- `npm run build` clean in **17.82 s** (pre-existing dynamic/static import warnings unchanged).

**Tripwires preserved:**
- Cycle-47.2 single-flight conversation opener: opener race in `obtainMessage()` is untouched — only the OUTER orchestration changed.
- Stage 0 still becomes the conversation opener (worker 0 picks stage 0 synchronously before any setTimeout).
- Stop-flag check before delayed first pick (no new "ghost stage starts after Stop" path).
- No Pulse-PBI compat broken — the orchestration change uses standard `setTimeout` + `Promise`, both safe in sandbox.

**Honest deferrals carried forward:**
- True 5-10 s answer time. Requires backend / model / prompt-shape work (foundation-model SSE streaming for Insights, or supervisor-routed paths) — separate cycles.
- Per-stage prompt size trimming so each individual `sendMessage` finishes faster.
- Mobile / cross-platform verification still queued.

---

## 2026-05-19 — Post-UAT-1840 follow-up: glyph sweep + tooltip rollout + perf wiring

**Range:** Concrete fixes for Codex's P2 follow-ups out of [`CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md`](CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md). Latency itself remains the carry-forward blocker — this pass closes the *non-latency* P2 items and wires `perfInstrumentation` into the two pipelines Codex called out so the next cycle has real numbers to attack instead of guessing.

**Files touched:**
- `playground/src/pulse/visual.tsx` — `SectionSqlPanel` copy button: raw `📋` → `<Icon name="copy" />`. Supervisor/fusion/query-audit toolbar copy buttons (`Copy fusion` / `Copy SQL` / `Copy as MD`): raw `📋` + `✓` → `<Icon name="copy" />` / `<Icon name="check" />` with the label kept. Genie query audit `↻ Refresh` → SVG refresh + label. Incomplete-section + assumption-note `↻ Retry` → SVG refresh + label. Outer `runInsights` IIFE now opens a `total` perf stage on kickoff and closes + `dumpRun()`s it in `finally` (success / failure / stop alike) — DevTools Performance tab shows a horizontal band for the whole pipeline + a `console.table` summary on completion.
- `playground/src/knowledge/KnowledgeShell.tsx` — Knowledge active-pack settings button: raw `⚙` → inline SVG cog matching the SettingsShell header pattern.
- `playground/src/components/SustainabilityIndicator.tsx` — session-usage reset button: raw `↻` → inline SVG refresh.
- `playground/src/components/AISidebar.tsx` — Ask Pulse `ask()` flow now opens `total` + `submit` perf stages; `submit` closes when the start-conversation POST returns; `polling` opens on polling kickoff; `finalize()` closes any still-open stages and `dumpRun()`s the table.
- `playground/src/settings/primitives/FieldRow.tsx` — `FieldRow` + `FieldCard` `tip` prop now accepts either `ReactNode` (legacy dense paragraph) OR a `StructuredTip` object `{ title, body }` rendering through `HelpTip`'s title + bullet slots. Backwards-compatible — every existing `tip={…}` keeps rendering.
- `playground/src/settings/groups/SetupGroup.tsx` — five dense `tip={<>…</>}` blocks migrated to structured `{ title, body }` form (BI surface card, Embed URL field, AI assistant card, Profile picker, Domain knowledge card). Dynamic content (allowlist permits…) preserved via inline ternary inside the `body` array.
- `playground/src/settings/groups/sub/BiGovernance.tsx` — two dense card-level tips migrated (Authentication model, Unity Catalog enforcement).
- `playground/src/settings/groups/sub/AiSupervisorFusion.tsx` — three dense card-level tips migrated (Auto-fusion, Synthesis prompt, Endpoint overrides).
- `playground/src/settings/groups/sub/PreferencesAppearance.tsx` — three dense card-level tips migrated (Theme presets, Mode override, Brand colors).
- `playground/src/settings/groups/sub/SystemDeveloper.tsx` — one dense card-level tip migrated (Diagnostic surfaces).

**Validation:**
- `npm run lint` clean (TypeScript noEmit).
- Focused tests: `HelpTip AiGroup viewportControls` → **32/32**.
- Full tests: **920/920** across 72 files (known `act(...)` + ECharts jsdom + style-shorthand warnings unchanged).
- `npm run build` clean in 27.49s (pre-existing dynamic/static import warnings unchanged).

**Tripwires preserved:**
- No Pulse-PBI compat broken (`pulse/visual.tsx` still drives the Pulse sibling; only ports `Icon` + perfInstrumentation, both safe in the iframe-sandbox case via `Icon`'s inline SVG and perfInstrumentation's `ENABLED` guard).
- No Genie iframe sandbox widening.
- No validator authority weakening.
- No reintroduced blank BI pane / `BI BI Viz` / `UniBridge` / `AI brain` / `AI-generated · Source: default` strings.
- No interactive controls inside `role="tooltip"` (the `StructuredTip` migration only changes shape; HelpTip still keeps `pointer-events:none`).
- No credentials in new files (greppable: `dapi…`, `eyJ…`, `access_token` — none present).

**Honest deferrals (carried forward):**
- **Response latency itself.** AI Insights still at `3:39` per Codex's 18:40 capture. This pass adds *visibility* (instrumentation wired into both pipelines + DevTools `console.table` on completion); it does **not** speed anything up. The actual speedup is its own cycle — Rajesh's "don't fake speed by polishing the spinner" continues to apply. Use the new DevTools Performance recording recipe in [`docs/CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md`](CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md) to capture baseline numbers; the next cycle can then attack backend/query/poll/render in priority order.
- **Mobile / cross-platform verification.** Still queued — current visible-browser pass was 599 x 694; explicit narrow-viewport sweep is the next Codex cycle's job.
- **Pulse-PBI compat surface emoji `displayName`s** (e.g. `🔌 1 · Connection`, `🧠 1c · AI Supervisor Agent`, `📋 3 · AI Instructions` in `pulse/settings.ts`). These ship as a coherent emoji set inherited from the Pulse-PBI sibling and Codex did not flag them; out of scope for this pass.
- **`SettingsShell` rail `⚙` glyph for the Advanced group.** Part of the geometric `GROUP_ICONS` set (`✦`, `⬡`, `◈`, `◉`, `⬢`, `⚙`); changing one in isolation would break the visual family. Codex did not flag it.

**Codex doc updates from the 18:40 verify** are preserved in the entry immediately below (the `b71270f` verification entry that Codex authored prior to this pass).

---

## 2026-05-19 — Codex verification of post-final-UAT polish (`b71270f`)

**Range:** Visible-browser verification of Claude commit `b71270f` (`HelpTip portal + SQL affordance + duplicate-arrow + perf instrumentation`) against [`docs/CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md`](CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md).

**Result artifact:** [`docs/CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md`](CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md). Evidence under [`docs/evidence/codex-verify-post-uat-1840/`](evidence/codex-verify-post-uat-1840/).

**Validation:** proxy health OK; dev server HTTP 200 on `http://127.0.0.1:5174/`; `npm run lint` clean; focused `HelpTip AiGroup viewportControls` tests **32/32**; full playground `npm run test -- --run` **920/920**; `npm run build` clean. Known warnings remain: FirstRunWizard style-shorthand warnings, ECharts jsdom 0x0 warnings, and React `act(...)` warning in viewport integration tests.

**Passes verified:** HelpTip bubble is portaled to `BODY`, viewport-fixed, not clipped at the current 599 x 694 browser size, and contains no interactive children. AI Insights per-section footer buttons are SVG-only with accessible labels/titles. Duplicate arrow/sign patterns (`▲ +`, `▼ -`, `▲ ▲`, `▼ ▼`) are gone from visible AI Insights text. Clicking `View SQL for TRENDS` now opens a real reused source SQL panel labelled `Reused from AI INSIGHTS BRIEFING`; the old large "This section reuses data..." panel is gone.

**Still not done:** latency remains the top blocker. AI Insights stayed in `Working out the right query` past 3 minutes and completed around `3:39`, far outside Rajesh's 5-10 second target. Tooltip layering is fixed, but content rollout is partial: several Setup tooltips remain dense paragraphs / inline `<strong>` snippets rather than clean title + scannable body. The SQL reuse panel behavior is fixed, but `SectionSqlPanel` still has a raw `📋` copy button, so glyph cleanup did not reach every SQL-adjacent control. Static audit also still finds raw-glyph candidates in legacy/deep surfaces such as Knowledge active-pack settings and supervisor/query-audit controls. Mobile acceptance was not run in this pass.

**Next recommended focus:** wire `perfInstrumentation.ts` into Ask Pulse + AI Insights and attack real latency; replace the SQL panel `📋` copy glyph; finish HelpTip title/body rollout; decide whether to run a global glyph sweep beyond AI Insights footer; perform mobile/narrow viewport acceptance.

---

## 2026-05-19 — HelpTip portal + SQL affordance + duplicate-arrow + Pulse footer SVGs + perf instrumentation (`HEAD`)

**Range:** Final pre-pilot polish pass after Codex's 09:14 UAT results ([`CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md`](CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md)). Closes the structural P1/P2 items Codex identified. Latency reduction itself is **not** attempted in this pass — only instrumentation was added so the next cycle can target real bottlenecks.

**Files touched:**
- `playground/src/settings/primitives/HelpTip.tsx` — bubble now renders via `createPortal` into `document.body` using `position:fixed` viewport coordinates. Closes Codex P1 edge-tooltip clipping (was an `overflow:hidden` / stacking-context bug, not a `z-index` bug). Added `title` / `body` slots for short title + scannable bullets per Codex P2 "dense paragraph" finding; still no interactive controls inside `role="tooltip"`.
- `playground/src/settings/primitives/primitives.css` — portal bubble styles, arrow now anchored via `--pp-helptip-arrow-x` CSS var so it stays at trigger center even when the bubble is clamped left/right against the viewport edge. New `.pp-helptip__title` / `__list` / `__body` slots.
- `playground/src/pulse/visual.tsx` — section footer action buttons: emoji `📋` → SVG clipboard; `↻` → SVG refresh; literal `</>` → SVG code-brackets glyph. SQL affordance rewritten: when the section has no own SQL, look up a sibling section's SQL via `stageSqlByTitle` map and render it in-place labelled "Reused from <SECTION>"; when nothing traceable, render a short honest line (NOT the previous dead explanatory paragraph). New `stripRedundantSignForPill()` helper called at every TrendPyramid render site so a `+33.42%` no longer renders as "▲ +33.42%" (double-direction).
- `playground/src/pulse/settings.ts` — `insightsShowProvenanceFooter` description rewritten from "compact AI-generated source/timestamp footer" to "compact provenance footer (Generated by PulsePlay · source profile · last update)".
- `playground/src/pulse/setupStep5.tsx` — long-form help body rewritten from `<code>AI-generated | Source: &lt;profile&gt; | &lt;relative-time&gt;</code>` to `<code>Generated by PulsePlay · Source: &lt;profile&gt; · Updated &lt;relative-time&gt;</code>`.
- `playground/src/lib/perfInstrumentation.ts` (new) — small Performance API helper: `stageStart`/`stageEnd` emit marks visible in DevTools Performance, plus `dumpRun` prints a `console.table` of stage durations. **This does not change latency.** It is the visibility primitive Rajesh explicitly asked for. Wiring it into the AI Insights and Ask Pulse pipelines is the next cycle.

**Validation:** TypeScript clean. `npm run lint` clean. `npm run test -- --run` → **920/920** passing. `npm run build` clean (14.16 s).

**Tripwires preserved:** No Genie iframe sandbox widening; no validator authority changes; no "100% hallucination-free" / "Verified" claims; no reintroduced blank BI pane; no `BI BI Viz`; no `UniBridge AI Proxy` branding; no `AI brain` in user-visible copy; no `AI-generated · Source: default` in source; no interactive controls inside `role="tooltip"`; no Pulse-PBI sibling compat code broken.

**Codex handoff:** [`docs/CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md`](CODEX_VERIFY_HANDOFF_2026-05-19_post-uat.md) — covers the 6 specific items Codex needs to verify visibly, the DevTools Performance capture recipe (so Codex can produce the latency breakdown Rajesh wants), credential-redaction rules, and the honestly-stated deferrals.

**Honest deferrals (carried forward + still queued):**
- **Latency itself.** Instrumentation lands here; the actual speedup (caching, streaming, warehouse pre-warm, query reuse) is its own cycle. Rajesh's 5-10 s target is acknowledged, NOT met.
- **Wiring instrumentation into AI Insights / Ask Pulse pipelines.** The utility is ready; the sprinkle of `stageStart/stageEnd` at pipeline boundaries belongs in the same cycle as the latency work so the marks measure what we're actually trying to cut.
- **Typography contract.** AI Insights still mixes Pulse-ported CSS vars + inline `fontFamily`. Codex P2 item; needs its own audit cycle.
- **Mobile / cross-platform verification.** Codex job in the next visible run.
- **P3-07 / P3-08** AI profile picker empty when `configured:false` (data-layer fix).
- **EL-BIVIZ-PEER** Power BI adapter shape mismatch (BI/embed layer fix).
- Surface-specific knob split, component-scoped pop-out, cross-surface companion launch, theme pack lane — all carried forward from earlier handoffs.

---

## 2026-05-19 — Codex final UAT verification of `d3c38be`

**Range:** Visible-browser verification of Claude's final naming/glyph cleanup + HelpTip mutual-exclusion pass against [`docs/CODEX_FINAL_UAT_REGRESSION_HANDOFF_2026-05-19.md`](CODEX_FINAL_UAT_REGRESSION_HANDOFF_2026-05-19.md).

**Result artifact:** [`docs/CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md`](CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md). Evidence under [`docs/evidence/final-uat-regression-2026-05-19-0914/`](evidence/final-uat-regression-2026-05-19-0914/).

**Validation:** proxy health OK; dev server HTTP 200 on `http://127.0.0.1:5174/`; `npm run lint` clean; focused `AiGroup leafLabels viewportControls SettingsShell HelpTip` tests **45/45**; full playground `npm run test -- --run` **920/920**; `npm run build` clean. Build still emits the known dynamic/static import chunk warnings.

**Passes verified:** Main surface switcher no longer shows `BI BI Viz`; `/settings/ai` shows the Assistant / Shared context / Response behavior / Surface-specific IA; HelpTip mutual exclusion works; `AI brain` is gone from visible Settings copy; Ask Pulse suggested prompt returns Narrative/Table/SQL; AI Insights Return Rate now uses physical up arrow with amber semantic tone.

**Still not done:** Response latency is the headline gap. Ask Pulse was still in `Working out the right query` around 1:22 and only completed after a further wait; AI Insights showed about `3:18`. Rajesh's target is perceived useful output in ~5 seconds and hard useful output inside 5-10 seconds, without sacrificing data correctness. Treat this as backend/query latency + polling/status UX + frontend rendering/jank, not spinner polish.

**Other findings for Claude:** Pulse AI Insights still exposes utility glyphs like `📋`, `↻`, and `</>` in card footers; KPI/trend deltas can show duplicate nested arrows (two up/down glyphs for one delta); author-facing setup/settings copy still references the legacy `AI-generated | Source: <profile> | <relative-time>` footer; HelpTip mutual exclusion works but edge bubbles can still go under pane frames / clipping containers and the content needs title/body formatting; AI output typography needs one tokenized font contract plus a formatting/theme pane; query reuse is expected for narrative sections, but the SQL affordance must be actionable: show own SQL, show reused source SQL in-place, jump/open reused SQL, or hide/disable the action if no traceable SQL exists. Do not keep a large explanatory empty panel as the primary outcome; mobile/cross-platform acceptance still needs explicit narrow-viewport verification.

**Tripwires preserved during verification:** no code changes to runtime behavior; no credential/token capture in evidence; no claims of upstream data truth unless the result was reconciled to visible SQL/table. Ask Pulse output was internally consistent (narrative matched visible table + SQL), but upstream Databricks truth remains marked UNVERIFIED because Codex did not independently run the SQL against the warehouse.

---

## 2026-05-19 — Final naming/glyph cleanup + HelpTip mutual exclusion + UAT handoff (`HEAD`)

**Range:** Final polish pass after Codex's 08:31 verify ([`CODEX_IA_UI_POLISH_VERIFY_2026-05-19-0831.md`](CODEX_IA_UI_POLISH_VERIFY_2026-05-19-0831.md)). Closes every P1/P2 item Codex identified and ships the comprehensive UAT/regression handoff.

**Files touched:**
- `playground/src/settings/groups/AiGroup.tsx` — Provider helper: "AI brain" → "AI assistant".
- `playground/src/components/FirstRunWizard.tsx` — wizard tools subtitle: "AI brain" → "AI assistant".
- `playground/src/settings/SettingsShell.tsx` — header icon `⚙` text glyph → SVG cog; back-button `← Back to app` → SVG arrow + "Back to app".
- `playground/src/knowledge/KnowledgeShell.tsx` — same back-button cleanup.
- `playground/src/settings/primitives/TestButton.tsx` — `⚡` text → SVG lightning bolt.
- `playground/src/settings/groups/SetupGroup.tsx` — `Full embed form →` → "Open full embed settings"; `Databricks docs ↗` → label + SVG external-link icon; `Tune Insights behavior →` → "Tune Insights behavior"; `Browse pack content ↗` → label + SVG external-link icon; FooterLink `{label} →` → `{label}`.
- `playground/src/pulse/visual.tsx` — removed unused `renderInsightsProvenance()` helper (still contained legacy `AI-generated / Source: default` copy). Replaced with explanatory comment so future audits don't keep flagging the stale string.
- `playground/src/settings/primitives/HelpTip.tsx` — module-level mutual-exclusion tracker: opening a tooltip closes any other open tooltip; document-level pointerdown closes all open tips on outside clicks. Added `aria-expanded` to trigger.

**Validation:** TypeScript clean. `npm run lint` clean. `npm run test -- --run` → **920/920** passing. `npm run build` clean (15.77 s).

**Tripwires preserved:** No Genie iframe sandbox widening; no validator authority changes; no "100% hallucination-free" / "Verified" claims; no reintroduced blank BI pane; no `BI BI Viz`; no `UniBridge AI Proxy` branding; no `AI brain` in user-visible copy; no `AI-generated · Source: default` in source; no interactive controls inside `role="tooltip"`.

**Handoff:** [`docs/CODEX_FINAL_UAT_REGRESSION_HANDOFF_2026-05-19.md`](CODEX_FINAL_UAT_REGRESSION_HANDOFF_2026-05-19.md) — comprehensive UAT + regression plan with smoke commands, 10-route checklist, 12-interaction checklist, 15 AI UAT questions (10 core + 5 edge), data-correctness reconciliation rubric, 7-persona checklist, regression matrix, evidence-folder convention, honest known-gap carry-forward, and result file format.

**Deferred (still queued):** `P3-07` / `P3-08` AI profile picker empty when `configured:false` (data-layer fix); `EL-BIVIZ-PEER` Power BI adapter shape mismatch (BI/embed layer fix); tooltip rewrite on deep Settings subroutes; Launchpad raw-ID demotion; surface-specific knob split; component-scoped pop-out; cross-surface companion launch; theme pack lane.

---

## 2026-05-19 — IA restructure + tooltip + provenance + emoji-glyph fixes

**Range:** Focused implementation pass following the 2026-05-19 13:20 Codex naming audit and the 13:10 tooltip audit. Lands the IA restructure the previous handoff explicitly deferred.

**Files touched:**
- `playground/src/settings/groups/AiGroup.tsx` — restructured into 4 tiers (Assistant / Shared context / Response behavior / Surface-specific). Knowledge pack + Vector Search KB + UC Metric View now live under **Shared context** so authors see they apply to both AI Insights AND Ask Pulse. Connection test promoted into the Assistant tier alongside Provider/Model so the assistant block ends with "is it reachable?". Surface-specific tier stubs Supervisor Fusion + Knowledge Base as deep-link cards.
- `playground/src/pulse/visual.tsx` — replaced literal "BI" / "✨" / "💬" text inside Pulse header tabs with SVG glyphs matching SurfaceSwitcher. Fixes the `BI BI Viz` duplication that the tough run flagged as `P1-13` / `EL-SWITCHER-COPY`. Provenance footer rewritten: "AI-generated · Source: default · 19 min ago" → "Generated by PulsePlay · Source: Default profile · Updated 19 min ago" (or matching display name via new `formatProvenanceSourceLabel`).
- `playground/src/settings/primitives/HelpTip.tsx` — viewport-aware bubble positioning (Codex P1 clipping fix at 599×694 viewport). Bubble now measures the trigger rect on open + resize, picks `center`/`left`/`right` alignment plus `above`/`below` side based on available room, and clamps width to viewport-32. Authoring contract updated: no interactive controls inside `role="tooltip"` (the docs link in SetupGroup's AI profile field moved to a new FieldRow `labelTrailing` slot).
- `playground/src/settings/primitives/primitives.css` — new bubble alignment + side variants (`--align-{center,left,right}`, `--side-{above,below}`), arrow flips per side.
- `playground/src/settings/primitives/FieldRow.tsx` — new `labelTrailing` slot for actionable elements next to the label (replaces the "links inside tooltip" anti-pattern).
- `playground/src/settings/groups/SetupGroup.tsx` — AI profile field: removed `<a href>` from inside tooltip; rendered as `labelTrailing` instead. Hint text now state-aware: explains the blocked state when proxy is online but profile select is empty.
- `playground/src/settings/groups/BiGroup.tsx` — SubSection h3 no longer `text-transform:uppercase`. Headings now render in their natural case ("Current state", "Connect and embed", "Governance and policy", etc.). Bumped font-size + tightened letter-spacing.

**Validation:** TypeScript clean. `npm run lint` clean. `npm run test -- --run` → 920/920 passing. `npm run build` clean (no chunk regressions).

**Tripwires preserved:** no Pulse-PBI sibling compat code broken (Pulse genie.ts / connectionMatrix / setup flow untouched); no Genie iframe sandbox widening; no validator authority changes; no "100% hallucination-free" claims (footer wording deliberately stays "Generated by PulsePlay" without verification claims because there's no validator gate behind it yet).

**Handoff:** [`docs/CODEX_IA_UI_POLISH_HANDOFF_2026-05-19.md`](CODEX_IA_UI_POLISH_HANDOFF_2026-05-19.md). Codex should visibly test in the open browser per the checklist.

**Codex verification:** Added [`docs/CODEX_IA_UI_POLISH_VERIFY_2026-05-19-0831.md`](CODEX_IA_UI_POLISH_VERIFY_2026-05-19-0831.md) with evidence under [`docs/evidence/codex-ia-ui-polish-verify-0831/`](evidence/codex-ia-ui-polish-verify-0831/). Verified in the visible browser across `/`, `/settings/setup`, `/settings/ai`, `/settings/preferences`, `/settings/bi`, `/knowledge`, and `/workbench`. Passed: `BI BI Viz` is gone, 4-tier AI Settings IA is visible, Shared context owns Knowledge Pack / Vector Search / UC Metric View, blocked AI-profile state has explanatory copy, opened tooltip bubbles did not clip at 599px width, and opened tooltip bubbles contain no interactive controls. Remaining polish gaps: `/settings/ai` still says `AI brain`; Settings still exposes glyph text (`⚙`, `←`, `⚡`, `↗`, `→`); unused `renderInsightsProvenance()` still contains stale `AI-generated / Source: default` copy; and multiple clicked HelpTips can leave an offscreen stale `role="tooltip"` node.

**Deferred (still in queue):** P3-07 / P3-08 AI profile picker showing empty when proxy reports 2 profiles — this is a data-layer bug (allowlist.aiProfiles is empty under `configured:false`, so the picker hides everything). Needs its own diagnostic + fix cycle. EL-BIVIZ-PEER `BI_EMBED_FAILED: powerbi adapter requires { id, embedUrl, accessToken }` — the Quick Setup paste-in builder produces `{ vendor, mode: "secure", secureLink }`, which the Power BI adapter doesn't recognize. Needs alignment between the Quick Setup paste-in helper and the Power BI adapter's expected config shape. Both are separate workstreams from this cosmetic/IA pass.

---

## 2026-05-19 — Tough visible UI run v2: persona × element × break-it

**Range:** Codex ran Claude's v2 tough test plan in the already-open visible in-app browser at `http://127.0.0.1:5174`, per Rajesh's request to watch the UI move live. This was a broad executable slice, not the full ~600-scenario plan.

**Pre-flight:** proxy health OK, dev server OK on 5173/5174, playground **920/920**, `npm run lint` clean.

**Result artifact:** [`docs/TOUGH_TEST_RESULTS_2026-05-19-1253.md`](TOUGH_TEST_RESULTS_2026-05-19-1253.md). Evidence screenshots + raw JSON under [`docs/evidence/tough-test-2026-05-19-1253/`](evidence/tough-test-2026-05-19-1253/).

**Headline:** 83 visible scenarios executed: **71 PASS / 5 FAIL / 1 SKIPPED / 6 N/A**. No Critical product failures found in the visible slice. Tier is **Silver candidate for visible slice only**, blocked from Gold by P3 setup failures and remaining UI polish gaps.

**Failures to hand Claude next:**

- `P1-13` / `EL-SWITCHER-COPY`: surface switcher still exposes duplicated text `BI BI Viz`.
- `P3-07` / `P3-08`: Setup proxy test reports 2 profiles, but the AI profile select remains unpopulated/not selectable in the visible setup flow.
- `EL-BIVIZ-PEER`: after applying the autoAuth Power BI fixture URL, BI Viz no longer shows `BI-only mode`, but the configured surface can fall into `BI_EMBED_FAILED: powerbi adapter requires { id, embedUrl, accessToken }`. Treat as setup/embed contract gap, not legacy-copy regression.

**Tool limits recorded honestly:** localStorage direct inspection/mutation, download grep, 390x844 viewport emulation, screen reader lab, and proxy stop/restart recovery were N/A or skipped in this visible-browser run.

**Tooltip follow-up:** Rajesh correctly asked for a dedicated tooltip pass after the tough run. Added [`docs/TOOLTIP_AUDIT_2026-05-19-1310.md`](TOOLTIP_AUDIT_2026-05-19-1310.md) and evidence under [`docs/evidence/tooltip-audit-2026-05-19-1310/`](evidence/tooltip-audit-2026-05-19-1310/). Setup rich HelpTips all open semantically, but compact-width bubble positioning clips visually; AI profile tooltip contains an interactive docs link inside `role="tooltip"` despite `pointer-events:none`; and the profile tooltip does not explain the real blocked state where proxy reports profiles but the select remains empty.

**Naming/copy follow-up:** Rajesh also asked to capture section naming, tool naming, special characters, and machine-ish generated-output wording. Added [`docs/NAMING_AND_COPY_AUDIT_2026-05-19-1320.md`](NAMING_AND_COPY_AUDIT_2026-05-19-1320.md) and evidence under [`docs/evidence/naming-audit-2026-05-19-1320/`](evidence/naming-audit-2026-05-19-1320/). Biggest polish gaps: decorative glyphs leak into visible/accessibility labels (`⚙ Settings`, `✨ AI Insights`, `💬 Ask Pulse`, `⚡ Test proxy`), `BI BI Viz` duplicate remains, user-facing settings copy exposes raw/internal terms (`AI brain`, `powerbi`, `Proxy ok`, `Security strict`, `v0`, `cycle-C sidebar`), and generated-output provenance needs to move from `AI-generated · Source: default` toward human-readable status such as `Generated by PulsePlay · Verified with data · Source: Sales Team profile`. Rajesh then correctly called out that Knowledge Pack / domain guidance / metric semantics are shared by AI Insights and Ask Pulse, not AI-Insights-only; the audit now recommends a progressive tree: `AI > Assistant`, `AI > Shared context`, `AI > Response behavior`, and `AI > Surface-specific behavior`. Purpose model for Claude: AI Insights = proactive briefing, Ask Pulse = conversational follow-up, BI Viz = observed source surface.

---

## 2026-05-19 — Visible extreme E2E partial + unified companion UX handoff (`HEAD`)

**Range:** Rajesh asked Codex to run the new extreme E2E catalog in the visible in-app browser so the automation could be observed. Pre-flight passed: proxy health OK, dev server OK, playground **918/918**, `npm run lint` clean. Catalog audit found the files parse to **2,604** scenarios, not the pasted **2,544**.

**Result artifact:** [`docs/EXTREME_E2E_RESULTS_2026-05-19-1146.md`](EXTREME_E2E_RESULTS_2026-05-19-1146.md) plus evidence screenshots under [`docs/evidence/visible-e2e-2026-05-19-1146/`](evidence/visible-e2e-2026-05-19-1146/). This was a partial visible run, not a full 2,604-scenario sweep.

**Claude handoff:** focused backlog [`docs/CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md`](CLAUDE_FOCUSED_GAP_BACKLOG_2026-05-19.md) plus copy-paste prompt [`docs/CODEX_TO_CLAUDE_SURFACE_UX_PROMPT_2026-05-19.md`](CODEX_TO_CLAUDE_SURFACE_UX_PROMPT_2026-05-19.md).

**Extended visible pass:** Screenshots `04`-`20` and `extended-visible-audit.json` now cover Settings Setup/BI/AI/Preferences/System/Advanced, Knowledge, Launchpad, Workbench, root AI Insights, root Ask Pulse, and root BI Viz. The in-app browser panel was constrained to ~599x694, so these are compact-layout observations, not full-desktop certification.

**Findings locked for follow-up:**

- `BI Viz` still feels like a mode/layout jump and can show `BI-only mode` grammar instead of a peer BI surface inside the same stable shell.
- `BI Viz` icon/label treatment feels bolted on; make `AI Insights`, `Ask Pulse`, and `BI Viz` one smooth, non-duplicative segmented surface switcher.
- Mobile floating companion at 390px width puts Dock offscreen.
- Dock/undock must be **component/surface scoped**, not pane scoped: popping out `AI Insights` should detach only `AI Insights`, while the main shell and other surfaces remain intact.
- Companion launch must be **cross-surface and global**: from any screen, users should be able to open any other surface or relevant context as an in-app companion without losing their place. Applies to Settings, Setup, Governance, Developer Tools, Knowledge, Workbench, Launchpad, BI surfaces, and AI surfaces.

---

## 2026-05-18 — Phase D: Foundation Model SSE streaming — section-by-section progressive render (`HEAD`)

**Range:** Beast-mode implementation of the "1-then-3" staged rendering for the Foundation Model connector path. Genie remains batch (API constraint); Foundation Model now streams tokens via NDJSON and renders each section as it completes — first section appears in ~3-5s instead of 60-90s.

### Proxy — `/foundation/conversations/start-stream`

- New route in [`proxy/server.js`](../proxy/server.js) that accepts the same body as `/foundation/section` but streams the LLM response as NDJSON.
- Sets `stream: true` in the OpenAI-compatible request body; uses raw `https.request` with `resp.on('data')` to pipe SSE tokens without buffering.
- NDJSON protocol: `{"t":"token"}` per token, `{"s":"SECTIONNAME"}` on detected `\n# ` boundary, `{"done":true,"content":"...","usage":{...}}` on completion, `{"error":"..."}` on failure.
- Section boundary detection: scans accumulated content for `\n#{1,2} UPPERCASE` pattern, emits section events so the frontend can flip skeleton placeholders to live content per section.
- Client disconnect tears down upstream request (`res.on('close')` → `upstreamReq.destroy()`).
- `buildFoundationModelBody` exported from [`proxy/lib/foundationModelClient.js`](../proxy/lib/foundationModelClient.js) so the route can build the streaming body.

### Frontend — `FoundationModelStreamBackend`

- New [`playground/src/pulse/backend/FoundationModelStreamBackend.ts`](../playground/src/pulse/backend/FoundationModelStreamBackend.ts): `SingleSpaceBackend` that hits `/foundation/conversations/start-stream` via XHR `onprogress` (XHR kept for PBI sandbox compat, not fetch).
- `startConversation` packs the prompt into a JSON messageId and returns immediately.
- `waitForMessageWithProgress` opens the streaming XHR, parses NDJSON lines from progressive `responseText`, calls `onContentChunk(accumulated)` on every token and resolves on `{"done":true}`.
- `cancel()` aborts the inflight XHR.

### BackendAdapter — `ContentChunkCallback`

- New `ContentChunkCallback = (accumulatedContent: string) => void` type in [`BackendAdapter.ts`](../playground/src/pulse/backend/BackendAdapter.ts).
- `waitForMessageWithProgress` signature extended with optional 4th param `onContentChunk?`. All existing backends ignore it — backwards-compatible.

### visual.tsx — progressive section render

- `runStage` now passes `onContentChunk` as 4th argument to `waitForMessageWithProgress`.
- On each token: writes `partialContent` to `contentParts[index]`, re-joins all parts, and calls `setSpaceInsightsResult` with the updated content — section renders progressively as tokens arrive.
- No-op for Genie/OpenAI/Bedrock backends (they never call the callback).

### Connector registry

- `"foundation-stream"` added to `ConnectionMode` union in [`genie.ts`](../playground/src/pulse/genie.ts).
- `FOUNDATION_STREAM_DESCRIPTOR` added to [`connectorRegistry.ts`](../playground/src/pulse/backend/connectorRegistry.ts) — status `"preview"`, `streaming: true`, factory returns `FoundationModelStreamBackend`.

### Honest gap

The `foundation-stream` connector is not yet selectable in the Settings UI ConnectorPicker (the picker lists `CONNECTOR_REGISTRY` but the label filter may need updating). Wire it up manually via `assistantProfile` + `connectionMode: "foundation-stream"` in Settings for now. Full UI picker integration is a follow-up.

### Genie latency — remains unchanged

Genie is poll-based (API constraint). The 30-90s wait before first content is intrinsic to the Genie API. The `foundation-stream` connector is the recommended path for latency-sensitive use cases.

---

## 2026-05-18 — Phase E: three live briefing gaps closed — banner, builtin metric defaults, card border tone (`HEAD`)

**Range:** Fixes for three gaps Rajesh spotted in the live Pulse AI briefing screenshots (Return Rate ▲ green pill, stale "No status colors" banner, inconsistent card left-border treatment).

### Gap 1 — Return Rate ▲ now shows amber (builtin lower-is-better defaults)

- Added `BUILTIN_LOWER_IS_BETTER_RULES` in [`rendering/metricDirections.ts`](../playground/src/pulse/rendering/metricDirections.ts): 10 metric patterns (Return Rate, Churn Rate, Defect Rate, Error Rate, Complaint Rate, Cancellation Rate, Refund Rate, Bounce Rate, Cost Per, Shrinkage) that carry `higherIsBetter: false, unfavorableMovementTone: "warn"`.
- These fire **only** when no author rule matches — author rules always win.
- `resolveMetricDirection` updated to check builtins as a last resort after author rules.
- **`pillColorClass` short-circuit fixed**: previously bailed out when `!rules` (no author metric rules), so builtins were unreachable. Now only bails on `physicalDir === "flat"`. The existing `!tone.matchedRule → return dirClass` guard handles unknown metrics correctly — no spurious coloring.
- Author rules override builtins: `unfavorableMovementTone: "bad"` → red; `"warn"` (builtin default) → amber.

### Gap 2 — "No status colors" banner hides when LLM already emitted 🟢/🟡/🔴

- Added `briefingHasStatusColors(content)` helper in [`visual.tsx`](../playground/src/pulse/visual.tsx).
- Banner condition now also checks `!briefingHasStatusColors(content)` so it stays hidden when the LLM included status indicators in its prose — the banner was incorrectly showing even when KPI cards had amber/green dots.
- `briefingHasStatusColors` exported via `__insightsRenderForTest` for unit testing.

### Gap 3 — Card left-bar color reflects pill tone (CSS `:has()`)

- Added `@supports selector(:has(*))` block in [`style/visual.less`](../playground/src/pulse/style/visual.less): cards with `gn-trend-tone-bad` get a red bar, `gn-trend-tone-watch` amber, `gn-trend-tone-good` green.
- Specificity ordering: section-level overrides (RISKS red, RECOMMENDED ACTIONS blue, OPPORTUNITIES green) use `(0,2,1)` vs `:has()` at `(0,1,1)` — named-section colors always win.
- TRENDS ("What Changed") cards now show a toned bar matching the metric direction of the pill inside them — closes the visual inconsistency Rajesh spotted between WHAT CHANGED (plain) and WHAT NEEDS ATTENTION (colored bar).
- Guarded by `@supports` — graceful fallback to default gray bar in older browsers.

### Tests — 26 new (896 total, all passing)

- **`rendering/__tests__/metricDirectionsBuiltins.test.ts`** (12): builtin rule shape, frozen array, per-metric resolution for 11 known lower-is-better names, author-rule-wins, case-insensitive match.
- **`__tests__/insightsBriefingGaps.test.tsx`** (14): `briefingHasStatusColors` (6 cases), Return Rate builtin amber end-to-end (inlineFormat + section render), author override to red, Sales ▲ no-builtin stays neutral.

### Gap 4 — noted but not fixed

"Profit Growth Lag" card (green pills inside WHAT NEEDS ATTENTION) is a semantic tension between section context and metric direction — the pills are technically correct (Profit Growth up = good) but read oddly inside an "attention" section. Real fix is LLM prompt quality (don't place recovering metrics in RISKS). CSS suppression of good-tone in RISKS would misrepresent recovering data. Tracked in AGENDA.

---

## 2026-05-18 - AI briefing Phases C + D landed — toolbar overflow + grid hierarchy + Next Best Actions accent (`681a4fd`)

**Range:** Beast-mode close-out of the two queued lanes from [AI_BRIEFING_DESIGN_DIRECTION.md](AI_BRIEFING_DESIGN_DIRECTION.md). Single commit covers both phases plus the sugar-candy press grammar extension.

### Phase C — toolbar noise reduction

- Pulse Insights toolbar keeps only the high-signal controls visible: **Timestamp, Customize ⚙, Refresh, Stop**.
- Copy MD / Copy HTML / Print PDF collapse into a single **`⋮`** overflow trigger that opens a popover menu. Same handlers, same flash-copy state, same Clipboard API + fallback. Each menuitem closes the popover on click; outside-click + Esc both close it; Esc returns focus to the trigger.
- New `more-vertical` Icon (three vertical dots) registered in [pulse/_adapter/Icon.tsx](../playground/src/pulse/_adapter/Icon.tsx). PATHS map kept in sync with the union; the new Icon test catches the "added to union, forgot PATHS" regression.

### Phase D — information hierarchy + visual calming

- `.gn-insights-sections` restructured to the locked sketch:
  - **Row 1**: HEADLINE (full-width — "Executive Brief")
  - **Row 2**: KPI SNAPSHOT | TRENDS ("What Changed")
  - **Row 3**: RISKS ("What Needs Attention") | RECOMMENDED ACTIONS ("Next Best Actions")
  - **Tail**: OPPORTUNITIES (full-width), then custom sections
- Wide viewports (≥ 720 px) use a 2-column CSS grid with placement driven entirely by the `data-section` attribute (Phase B contract). `order` is set per section so visual layout follows the hierarchy WHILE DOM order stays in stream sequence — the existing `gn-section-reveal` stagger animation (60ms × `:nth-child(N)`) still fires in arrival order.
- Narrow viewports (< 720 px) collapse to a single column for natural scrolling.
- **RECOMMENDED ACTIONS** (+ 3 aliases ACTIONS / NEXT STEPS / NEXT BEST ACTIONS) gets the briefing's **one accent moment**: thin accent border `rgba(26,111,212,0.32)`, very low-alpha accent tint gradient (5% → 0%), slightly warmer shadow. Light-mode tuned separately. Restrained, not loud.

### Sugar-candy press grammar extension

- The existing 60ms `scale(0.97)` press feedback (was scoped to `gn-header-tab` + `gn-header-adjust`) now also covers `gn-pane-action-btn` (Maximize / Minimize / Open-page / Float / Customize / Refresh / Stop / new ⋮ overflow trigger) and `gn-insights-overflow-item` (popover menuitems). Same `prefers-reduced-motion` gate; identical timing curve.

### Tests — 13 new

- **`pulse/_adapter/__tests__/Icon.test.tsx`** (4): every IconName in the union renders a non-empty `<svg>`; `more-vertical` renders three circles; size prop honored; default 14 px.
- **`pulse/__tests__/insightsGridContract.test.tsx`** (9): each of the 6 hierarchy `data-section` values is emitted by the renderer so Phase D CSS hooks resolve; full briefing renders all 6 in DOM source order (stagger still fires by arrival); custom author sections carry `data-section` too (CSS defaults them to `order: 10` → tail).

### Honest gap I'm flagging

**No App-mount toolbar test for the overflow popover state.** The existing Pulse test harness uses only `__insightsRenderForTest` (pure render functions); mounting the full Pulse `App` requires a `PulseHostStub` + settings provider + many other fixtures, which is out of scope for this commit. Overflow behavior is covered by:
- `tsc --noEmit` (signature + handler wiring)
- Vite HMR smoke (HTTP 200; 13× `gn-insights-overflow` references reach the served `visual.tsx`)
- Mirror to the existing Customize popover pattern (which has the same outside-click + Esc + focus-return code path that's been live for cycles)

The right follow-up is a Pulse `App` test harness — would unlock testing the surface switcher, Adjust, customize popover, AND the new overflow popover with a single fixture. Could share with Codex's Playwright Chromium smoke pattern from `5623808`. Worth ~1-2 hr in a future cycle.

### Validation

- `npm run lint` clean.
- Focused suites: `insightsGridContract` 9/9, `Icon` 4/4, `insightsRendererPolish` 24/24.
- Full sweep **868/868** across 69 files (was 855; +13 net).
- `npm run build` clean (16.84 s).
- Vite HMR at `http://127.0.0.1:5174/` HTTP 200; new selectors reach the served bundle.

### Tripwires (carry forward)

- **One accent moment per screen** still holds: Next Best Actions accent is the briefing's accent; surface switcher gradient is the page's accent; Verified badge is the artifact's accent. Don't add a fourth.
- **Internal section IDs are load-bearing** for the Phase D grid. `data-section="HEADLINE"` etc. is the CSS hook; renaming the constants (not just display labels) would silently break the grid.
- **`order` reorders visually, not in DOM.** Stagger animation delays use `:nth-child(N)` which is DOM-order. Keep them aligned: if you ever change DOM order (e.g. for a "headline-only" mode), re-confirm stagger still feels right.
- **Press feedback selector list is now long** — `gn-header-tab + gn-header-adjust + gn-pane-action-btn + gn-insights-overflow-item`. Add new toolbar button classes to that list when you introduce them, or break the design grammar.
- **Overflow popover state is local to `App`.** If you ever extract toolbar to its own component, lift the `overflowOpen` state + refs OR re-test the outside-click/Esc handlers against the new mount.
- **Workbench Step 7 (theme)** is the last queued sequence item. Sugar-candy grammar (motion + depth + colour) already in place; Step 7 swaps inline workbench styles for the full theme + adds `prefers-color-scheme` for dark/compact/high-contrast modes.

---

## 2026-05-18 - MetricRule.unfavorableMovementTone — amber as first-class direction option (`9811464`)

**Range:** Rajesh's read on the architecture: trust author-defined rules (the "metric formatter") over heuristics or LLM hints. He also noted that the direction-only tone logic was binary (red/green only — amber excluded) — the threshold path produces all three tones, but threshold-only color requires `amberPct` AND `redPct` AND a value that crosses the band; tiny deltas like Return Rate `+0.3pp` skip the bands entirely. This commit brings amber into the direction equation as an opt-in author preference, end-to-end.

### What changed

- **`playground/src/pulse/metricRulesEngine.ts`** — `MetricRule` gains optional `unfavorableMovementTone?: "warn" | "bad"` field. Default omitted = "bad" (backward compat). `rulesToJson` writes the field only when value is "warn" — keeps JSON payloads clean for the default case. `jsonToRules` reads "warn" and "bad" verbatim; rejects invalid values (foo, null, number) to undefined.
- **`playground/src/pulse/rendering/metricDirections.ts`** — matching field on `MetricDirectionRule`. `normaliseRule` propagates it. `parseMetricDirectionsJson` reads it (only "warn"/"bad", else undefined). `directionTone` honors it: when movement is unfavorable AND `rule.unfavorableMovementTone === "warn"`, returns "warn" instead of "bad". Favorable direction unaffected. Threshold-band path unchanged (still wins).
- **`getMetricTone` direction-only branches** — formerly duplicated the inverse-`higherIsBetter` logic, now collapsed to `semanticTone: deltaTone` so semanticTone and deltaTone agree end-to-end and both honor the new field. Single-source-of-truth for direction tone.
- **`playground/src/pulse/metricRuleForm.tsx`** — new per-card select "On unfavorable movement (no threshold breach)" with options "Red — treat as critical (default)" / "Amber — treat as watch". Wired through `updateRule`. `data-testid="metric-rule-unfavorable-tone-{idx}"` for test access.

### Tone resolution order (locked, all paths converge through `getMetricTone`)

1. `statusText` carries an explicit signal (🟢/🟡/🔴/✅/⚠/❌/"on-track"/"watch"/etc.) → that tone wins.
2. `thresholdTone` fires (rule has `amberPct` AND `redPct` AND value parses into a band) → that tone wins.
3. Direction-only fallback (rule matched, no threshold band hit) → `directionTone` returns `good` for favorable direction, and `bad` OR `warn` for unfavorable direction per `rule.unfavorableMovementTone`.
4. No rule matched → `getSemanticTone` fallback (binary good/bad from physical direction).

### How to use it (author flow)

In Settings → Pulse → Setup → Section B (Metric direction rules), the per-card row "On unfavorable movement (no threshold breach)" defaults to "Red — treat as critical." Authors who want "Return Rate `+0.3pp` reads as 🟡 watch, not 🔴 critical" change it to "Amber — treat as watch" on the Return Rate card. The change is opt-in per rule; no global flag, no regression for any other metric.

### Tests — 23 new across 3 files

- **`metricDirectionsUnfavorableTone.test.ts`** (13): favorable + unfavorable × default/bad/warn × up/down matrix; threshold-band precedence over the new field; `statusTone` precedence over both; no-rule-matched fallback unaffected; `parseMetricDirectionsJson` round-trip for valid/invalid values.
- **`metricRulesEngineUnfavorableTone.test.ts`** (9): `rulesToJson` omits default + explicit-bad; writes only "warn"; `jsonToRules` reads warn/bad; rejects invalid values to undefined; round-trip preserves "warn"; intentional asymmetry where explicit "bad" becomes undefined on round-trip (renderer treats both identically — no behavior difference).
- **`insightsRendererPolish.test.tsx`** (+1, now 24): exact screenshot scenario — Return Rate increase insight card with `unfavorableMovementTone: "warn"` on the rule renders `gn-trend-up` + `gn-trend-tone-watch` (amber on up arrow). This is the test that pins Rajesh's "+0.3pp Return Rate should be amber" intuition.

### Validation

- `npm run lint` clean.
- Focused suites **46/46**.
- Full sweep **855/855** across 67 files (was 832; +23 net).
- `npm run build` clean (17.46 s).
- Vite HMR at `http://127.0.0.1:5174/` HTTP 200; `metricRulesEngine.ts` serves 3 `unfavorableMovementTone` references.

### Tripwires

- **Default stays "bad" (red).** No regression for any existing rule. The field is opt-in per rule.
- **Threshold bands always win** when defined and value crosses them. The new field is a fallback for the direction-only case.
- **`statusTone` always wins** (explicit 🟡/⚠/"watch" in the source overrides both threshold and direction).
- **Favorable direction is unaffected** by the field. A Return Rate DECREASE on a lower-is-better rule still emits "good" (green) regardless of `unfavorableMovementTone`.
- **JSON asymmetry is intentional**: `rulesToJson` omits both undefined and explicit "bad" because they produce identical renderer behavior. Form state preserves the explicit "bad" pick across React renders; only the serialized JSON drops it.
- **Direction-tone refactor in `getMetricTone`** collapses the inline `if (direction === "up")` / `if (direction === "down")` branches to use `deltaTone`. Existing semantics preserved (verified by Phase A's polish suite still passing). If a future agent wants to fork those branches again, they'll need to thread the new field through both arms instead of leaning on `directionTone`.
- **Author-defined rules are the trustworthy source** — that's the architecture Rajesh asked for. The card-label hint (`24c7e6d`) helps the rule path find the metric even when prose drops the name; the rule itself dictates the tone. Heuristics serve the formatter, not the other way around.

---

## 2026-05-18 - Card-label hint resolves rule for insight-card body pills (`24c7e6d`)

**Range:** Rajesh shipped a screenshot showing a Trends card with label "Return Rate increase" and body "rose to 6.2%, up ▲ +0.3pp, could signal product or service issues." rendering GREEN. The Phase A fix (`1e04a31`) wired `pillColorClass` tone classes correctly, but only when the metric name appeared in the same prose window as the pill. In real insight cards the metric name lives in the **card label**, not the body — and `metricNameBeforePill`'s 60-char window scan finds only connective leftovers ("to"), which are truthy enough to skip the rule lookup but useless for resolving any rule. So the pill fell back to physical-direction color (green for up).

### What changed

- **`playground/src/pulse/visual.tsx`** — added optional `metricNameHint` parameter threaded through `inlineFormat` → `pillColorClass` → `metricNameBeforePill`. When supplied, the hint takes precedence over the body-window scan — the caller's explicit context signal beats a heuristic. `resolveMetricDirection`'s substring matching handles label noise like "Return Rate increase" → matches rule "Return Rate" via `metric.includes(name)`.
- **Insight-card body call site** ([visual.tsx:7958](../playground/src/pulse/visual.tsx#L7958)) now passes `card.label` as the hint. Inline comment names the audit reference so the next agent doesn't drop it.
- **3 new vitest cases** in `insightsRendererPolish.test.tsx` (suite now 23) — exact screenshot scenario (Return Rate increase + up pill → tone-bad), Profit Margin compression (down + bad), and a defensive case where the body has NO metric name at all but the hint resolves the rule.

### Why "hint wins" instead of "fallback when window scan empty"

Initially tried the fallback-when-empty version. The window scan returned `"to"` for "rose to 6.2%, up 0.3pp" — truthy, but useless. Hint-wins is simpler and more predictable: the card label IS the metric context. If a future card has mismatched label/body, that's a card-author concern; the renderer trusts the explicit signal.

### Validation

- `npm run lint` clean.
- Focused polish suite **23/23** (was 20; +3 new).
- Full sweep **832/832** across 65 files (was 829; +3 new).
- `npm run build` clean (12.80 s).
- Vite HMR at `http://127.0.0.1:5174/` HTTP 200; `metricNameHint` identifier reaches the served `visual.tsx` (7 references = signature + 4 call sites + 2 comments).

### Note on amber vs red

The fix activates the rule path; what color the pill renders next depends on the rule shape. Without `amberPct`/`redPct` thresholds, a Return Rate increase on a `higherIsBetter: false` rule resolves to **bad → red**. With thresholds (e.g. `{ amberPct: 3, redPct: 6 }`), a value in the 3–6 band resolves to **warn → amber**. Rajesh's screenshot shows `+0.3pp` — small delta; if a threshold-configured rule were loaded, the value (0.3 < amberPct=3) would still be `good`. To get amber for any unfavorable-direction movement (not just threshold breach), the rule shape would need a new `amberOnUnfavorableDirection` flag — separate change worth its own discussion.

### Tripwires

- The hint takes precedence over the window scan when supplied. If a future caller passes an inappropriate hint (e.g. a section title that contains no metric name), the rule lookup will fail gracefully (no match → dirClass fallback) — but the test suite doesn't pin that today; consider adding a guard if the hint surface expands.
- Insight-card body is the only call site passing a hint today. If you add `card.label` propagation to other contexts (table cells, bullet items), prefer running validation first — the heuristic of "caller knows best" is most reliable when the caller IS the card-shape author.
- This fix doesn't change the validator authority, the iframe sandbox, the BI Viz semantics, or the ECharts integration.

---

## 2026-05-18 - Watch-tone emission fix (`337253f`) — Codex audit follow-up

**Range:** Codex audited the Phase A sugar-candy work and caught two real gaps. Earlier commit `1e04a31` documented "watch" as a supported inline tone, and `99292ac` added the `gn-trend-tone-watch` CSS class, but `pillColorClass` never emitted the class and the emoji 🟡 path mapped to flat grey instead of watch amber. That overstated the coverage. This commit corrects the implementation and pins both behaviors with focused tests.

### What was overstated

- The Phase A commit message + tone-class table in `gn-trend-tone-watch` implied watch coverage was wired end-to-end. It was not — `pillColorClass` only handled `semanticTone === "good"` and `"bad"`, so any `warn` semanticTone (from explicit status or amber threshold) fell through to dirClass and the watch CSS was dead code.
- The 99292ac CSS added `.gn-trend-pill.gn-trend-tone-watch` but no rule path emitted that class until this commit.
- The emoji 🟡 inline path correctly stayed flat (no movement implied) per the Wave 29 cycle 2 fix, but the Wave 29 fix only addressed "don't render green-as-up" — it never restored an amber signal. So 🟡 status emojis rendered as neutral grey instead of watch amber.

### What changed (`337253f`)

- **`playground/src/pulse/visual.tsx` `pillColorClass`**: new branch `if (tone.semanticTone === "warn") return ${dirClass} gn-trend-tone-watch` immediately after good/bad. No change to the fuzzy-alias fallback or the no-rule path.
- **`playground/src/pulse/visual.tsx` emoji G8/G9 path**: symmetric tone map alongside the existing direction map. 🟢 → up + tone-good; 🔴 → down + tone-bad; 🟡 → flat + tone-watch. Wave 29 comment updated to point at the design-direction lock + Codex audit reference.
- **`playground/src/pulse/__tests__/insightsRendererPolish.test.tsx`**: +5 cases (now 20 total):
  - Watch tone via rule: Return Rate up 4pp with `{ amberPct: 3, redPct: 6, higherIsBetter: false }` → `gn-trend-up` + `gn-trend-tone-watch` (NOT good/bad).
  - 🟢 in KPI SNAPSHOT → `gn-trend-up` + `gn-trend-tone-good`.
  - 🔴 in KPI SNAPSHOT → `gn-trend-down` + `gn-trend-tone-bad`.
  - 🟡 in KPI SNAPSHOT → `gn-trend-flat` + `gn-trend-tone-watch` (NOT `gn-trend-tone-neutral`).
  - **Non-KPI section guard**: TRENDS still strips 🟡 before the regex runs. Documents the pre-existing `statusGlyphsBelongInThisSection` gate so the next agent doesn't try to "fix" it without understanding why.

### Important nuance Codex's finding didn't capture

The emoji G8/G9 path is **gated to KPI-style sections** (KPI SNAPSHOT / KPI / METRICS / SCORECARD / PERFORMANCE) by `inlineFormat`'s `statusGlyphsBelongInThisSection` check at [visual.tsx:8498](../playground/src/pulse/visual.tsx#L8498). Other sections strip 🟢/🟡/🔴 from the source text before INLINE_REGEX runs. So this fix only takes effect for inline narrative WITHIN KPI-style sections. For TRENDS / RISKS / RECOMMENDED ACTIONS, status emojis are stripped before they ever reach the pill path — that's intentional, kept as-is, and now pinned by the non-KPI-strip guard test.

### Validation

- `npm run lint` clean.
- Focused polish suite **20/20** (was 15; +5 new cases).
- Full sweep **829/829** across 65 files (was 824; +5 new cases).
- `npm run build` clean (18.31 s).
- Vite HMR at `http://127.0.0.1:5174/` HTTP 200; two new `gn-trend-tone-watch` references reach the served `visual.tsx` module (rule path + emoji path).

### Doc-tracking process note

Codex's audit also noted `docs/AI_BRIEFING_DESIGN_DIRECTION.md` was untracked. Verified locally: the file IS tracked in commit `99292ac` (`git ls-files` confirms; `git log -- docs/AI_BRIEFING_DESIGN_DIRECTION.md` returns the commit). The audit may have been run from a stale checkout or a sibling worktree. Worth confirming when picking up: `git log --oneline -- docs/AI_BRIEFING_DESIGN_DIRECTION.md` should return at minimum `99292ac feat(pulse): "sugar candy" delight layer …`. If it doesn't, the local checkout is behind.

### Tripwires (carry forward)

- The validator stays the only authority for artifact status. Tone classes are presentation; status badge motion is presentation. Neither overrides what the validator emitted.
- The non-KPI section emoji-strip gate is intentional and must stay. The fix only addresses the in-section path; it does not unstrip emojis for prose sections.
- The watch threshold path requires `amberPct` AND `redPct` on the rule. Rules without thresholds still fall through to the directional fallback (existing behavior unchanged).
- `prefers-reduced-motion` guards from the proof slice remain mandatory for any new motion added in Phases C/D.
- One accent moment per screen still applies — the watch amber is a tone signal, not a new accent.

---

## 2026-05-18 - AI briefing "sugar candy" — design direction locked + proof slice (`99292ac`)

**Range:** Rajesh sent additional design intent on top of the earlier 4-priority brief: the briefing should feel like *sugar candy* — premium, trustworthy, executive-grade foundation with a magnetic, subtly delightful interaction layer that makes others feel the hard work that went into it. Not cartoonish, not gimmicky, not noisy. This pass captures the direction as a canonical doc and ships a small restrained proof slice that demonstrates the grammar without restructuring anything.

### What changed

- **[docs/AI_BRIEFING_DESIGN_DIRECTION.md](AI_BRIEFING_DESIGN_DIRECTION.md)** — canonical design direction. Concrete Do / Don't list, motion grammar table (durations + easings), depth grammar table (resting / hover / press shadows), colour grammar ("one accent moment per screen"), information hierarchy sketch for Phase D, toolbar sketch for Phase C, and tripwires (semantic accuracy first, readability first, no permanent BI pane, no validator / sandbox changes, no "100% hallucination-free" wording, stagger respects streaming order).
- **[playground/src/pulse/style/visual.less](../playground/src/pulse/style/visual.less)** — five additive CSS additions, ~70 lines total, all gated by `prefers-reduced-motion: no-preference` (and the existing section reveal gets a `reduce` collapse-to-instant guard):
  1. **Section card arrival stagger** — `:nth-child(N)` animation-delay of `60ms × index` (capped at 420ms for the 8th+). The existing `gn-section-reveal` keyframe is unchanged; we only delay the start so a 5-section briefing reads as composed rather than mass-arrived. Streaming order is preserved because delays attach by DOM position and the validator emits sections in the locked HEADLINE / KPI / TRENDS / RISKS / OPPORTUNITIES / ACTIONS order.
  2. **Reduced-motion guard** for the existing section reveal — collapses to instant for vestibular users.
  3. **Surface switcher + Adjust press feedback** — 60ms `scale(0.97)` snap-back on `:active`. Hover behavior unchanged.
  4. **KPI tile status badge first-render pop** — 220ms `scale(0.94 → 1)` with cubic-bezier(.2,.9,.2,1). Newly-emitted statuses read as "earned" rather than playful. Re-triggers on subsequent re-renders (intentional — status changes feel "newly verified").
  5. **Follow-up chip hover lift parity** — translateY(-1px) + soft shadow on `:hover`, matching the KPI tile hover grammar.

### What this proves (and what it deliberately doesn't do)

- Demonstrates the motion grammar (260–300ms eased animations, 60ms stagger, 60ms press snap) without committing to the Phase D layout restructure.
- Demonstrates the "sense of reward" on status badges without changing what status the validator emits.
- Five small additions, ~70 lines of CSS, zero JS, zero structural change.
- Does NOT touch the workbench, no pulse/* TypeScript file, no gradients on backgrounds, no celebration bursts, no oversized chrome.

### Validation

- `npm run lint` clean.
- `npm run test` **824/824** across 65 files (unchanged — CSS additions have no test surface).
- `npm run build` clean (19.67 s); pulse chunk +~0.3 KB.
- Vite HMR at `http://127.0.0.1:5174/` serves the updated `visual.less`; HTTP 200; new identifiers reach the bundle.

### Tripwires (must honor for Phase C + D)

- **Sugar candy is restraint, not loudness.** Five small additions per phase, not fifty. Pulse drifted into "loud gradient" territory before; do not regress.
- **One accent moment per screen.** Surface switcher is the accent in the Pulse view; Verified badge is the accent in the artifact card; Ask button is the accent in the composer. Don't add a fourth accent.
- **`prefers-reduced-motion: reduce` is non-negotiable.** Every new animation needs the guard. Vestibular users get a static briefing.
- **Semantic accuracy first.** Tone classes always win over decorative color; status badge motion is presentation only and never overrides what status the validator emitted.
- **No permanent BI pane.** BI Viz stays peer same-canvas in `mix` mode.
- **Validator + sandbox untouched.** No "100% hallucination-free" wording.
- **Internal section IDs stay.** Display labels (Executive Brief / What Changed / What Needs Attention / Next Best Actions) are user-facing only.
- **Pulse-PBI sibling stylesheet is forked.** Additive CSS here does not automatically propagate; the sibling renders the additions only if it later syncs and the matching elements exist.

### What's next

- **Phase C — toolbar noise reduction.** Use the overflow grammar in [AI_BRIEFING_DESIGN_DIRECTION.md](AI_BRIEFING_DESIGN_DIRECTION.md). Keep visible: surface switcher + Adjust + status. Move copy/code/diagnostics into `⋮`.
- **Phase D — information hierarchy + visual calming.** Use the layout sketch (top Executive Brief, middle KPI + What Changed, lower What Needs Attention + Next Best Actions, Actions gets prominence). Reduce nested containers per the design doc.
- These phases inherit the "sugar candy" direction. Anything Phase C/D ships must respect the tripwires above.

---

## 2026-05-18 - AI briefing redesign — Phases A+B landed; C+D queued

**Range:** Rajesh sent a design direction for the Pulse AI Insights production surface (unified mix screen). Four priorities: (1) semantic cue consistency across inline pills, (2) toolbar noise reduction, (3) information hierarchy, (4) calmer visual system. Plus four section label renames. This session shipped Phases A + B; Phases C + D are scoped and queued for the next session because they're larger UX surgery that benefits from review between landings.

### What changed

- **Phase A — inline pill semantic cue consistency** (`1e04a31`). The `arrow=movement, color=meaning` rule Codex locked for KPI tiles (commit `e433e0b`) now applies to inline trend pills across Trends / Risks / Recommended Actions / arbitrary narrative. Two coupled bugs fixed: (i) `pillColorClass` returned `gn-trend-down` for `semanticTone="bad"` regardless of physical direction — now returns `gn-trend-pill gn-trend-{dir} gn-trend-tone-{good|bad|watch|neutral}` so direction stays honest and tone carries color via CSS specificity. (ii) `pillColorClass` called `getMetricTone` with the unsigned number captured by INLINE_REGEX G6/G7 (`"up 0.4pp"` → number=`"0.4pp"`), so direction came back neutral and the rule's `higherIsBetter` branch never fired. The function now re-attaches the sign from `physicalDir` before the tone lookup so the rule resolves to a concrete semantic tone. Four new CSS tone classes (`gn-trend-tone-good/bad/watch/neutral`) ride on top of the existing direction classes. 7 new vitest cases covering all 4 direction × tone combinations plus unmatched-metric, no-rules-supplied, fuzzy-alias-neutral, and flat-movement cases; 1 explicit guard for a pre-existing INLINE_REGEX blind spot where `%` suffix at end-of-prose never matches (regex requires `\b` after the number, `%` followed by space/punctuation never crosses a word boundary).

- **Phase B — section label renames** (`e87bae0`). Display-only rename of the four primary insight sections:
  - HEADLINE → **Executive Brief**
  - TRENDS → **What Changed**
  - RISKS → **What Needs Attention**
  - RECOMMENDED ACTIONS → **Next Best Actions**

  Internal IDs (HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS) stay everywhere — prompts, validators, visibility state, exports, stage SQL lookup, the Pulse-PBI sibling's response shape. New `displaySectionTitle()` helper + `SECTION_DISPLAY_LABELS` map. `InsightsSectionHeader` and `InsightsSectionPlaceholder` render the display label in `<h3>`, with `data-section-title="<INTERNAL>"` on the heading so tests/exports/stage SQL can still address sections by canonical ID. Unknown/custom author sections pass through unchanged. 13 vitest cases.

### What's queued for next session (Phases C + D)

- **Phase C — toolbar noise reduction**. Keep visible: surface switcher (AI Insights / Ask Pulse / BI Viz), Adjust, run/status chip, possibly refresh/export if truly primary. Move copy/code/diagnostics into a compact overflow/action menu.
- **Phase D — information hierarchy + visual calming**. Target layout: top Executive Brief (full-width or 60/40 with KPI Snapshot); middle KPI Snapshot + What Changed; lower/right What Needs Attention + Next Best Actions. Make Next Best Actions more prominent. Reduce nested borders/shadows/repeated footers/competing chrome. Pulse currently feels like cards-inside-cards; use fewer visual containers and clearer hierarchy.

### Validation

- `npm run lint` clean.
- `npm run test` **824/824** across 65 files (was 801; +23 net across the two phases: 7 inline-pill cases + 1 %-blind-spot guard + 13 section-label cases + 2 from a parallel agent's lane).
- Live Vite smoke at `http://127.0.0.1:5174/` returns HTTP 200; HMR confirms both new tone classes and new section display labels reach the browser.

### Tripwires (next session must honor)

- **Do not reintroduce the permanent BI pane.** BI Viz stays a peer same-canvas surface in `mix` mode (locked by `df22e9f` legacy-state migration + Codex's earlier same-canvas behavior).
- **Do not make BI Viz a focused-pane default.** Explicit Split + Mix for power users still works.
- **Do not change the artifact validator** or no-ungrounded-artifacts contract. Phase A/B touched presentation only; the validator authority and Genie sandbox stay locked.
- **Do not make "100% hallucination-free" claims.** PulsePlay's promise is "no ungrounded artifacts are rendered as verified."
- **Do not switch ECharts to the full bundle** (modular import stays).
- **Internal section IDs are load-bearing** — prompts, validators, exports, stage SQL lookup, and the Pulse-PBI sibling all read HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS verbatim. Display labels are user-facing only; do not rename the constants.
- **Known follow-up — `%`-suffix pill regex blind spot.** Real Pulse prose like "spend up 12% this period" doesn't render a pill because the INLINE_REGEX `\b` after the number capture never crosses a word boundary when `%` is followed by space/punctuation. Tracked as a Pulse follow-up (not a Phase-A regression). Real prose typically uses `pp` for percentage-point deltas; the common case works.
- **`data-section-title`** on `<h3>` is now load-bearing for any future test/export logic that needs the canonical section ID after Phase B. Don't strip it when restructuring layout in Phase D.

---

## 2026-05-18 - Workbench Step 6 — additive Pulse asset extraction (`a2bd729`)

**Range:** Wrapped Pulse-port pure-domain helpers into workbench-facing modules so the workbench gains three new behaviors driven by Pulse-proven logic: composer-input sanitization, labelled SQL sections, and Genie-supplied follow-up question chips. **Additive only** per [PULSE_PORT_DETANGLING.md](PULSE_PORT_DETANGLING.md) — no file inside `playground/src/pulse/*` was modified by Step 6; the Pulse-PBI sibling continues to consume that directory as-is.

### What was extracted (re-export, no modification)

- [pulse/promptRedaction.ts](../playground/src/pulse/promptRedaction.ts) → wrapped via new [playground/src/workbench/composerInput.ts](../playground/src/workbench/composerInput.ts) which exports `sanitizeComposerInput()` returning the sanitized text plus diagnostic hit lists (`secretsHit` / `injectionHit`). Composes Pulse's `detectAuthorPromptSecrets` + `detectInstructionKeywords` + `safeAuthorPrompt` (= `redactAuthorPrompt` + `stripInstructionKeywords`).
- [pulse/genie.ts](../playground/src/pulse/genie.ts) `collectGenieSqlFromAttachments()` → reused verbatim from [playground/src/workbench/genieResponseMapper.ts](../playground/src/workbench/genieResponseMapper.ts) to lift Phase 11b `attachments[].query.sqlSections` into a workbench-shaped `ArtifactSqlSection[]`.

### New types

- [playground/src/types/assistant.ts](../playground/src/types/assistant.ts) — `ArtifactSqlSection` (`sectionId`, `sqlFragment`, `cteName?`). Added as optional `WorkbenchArtifact.sqlSections?: ReadonlyArray<ArtifactSqlSection>`. Purely additive — existing artifacts without sections render the canonical `sql` field via the original code path.

### Validator changes

- [playground/src/lib/artifactValidator.ts](../playground/src/lib/artifactValidator.ts) — `CandidateArtifact` accepts the new optional `sqlSections`; finalizer preserves it (non-empty arrays only) on the validated artifact. **No status logic changed** — `sqlSections` is presentation, not provenance, and does NOT count toward grounding decisions.

### Mapper changes

- [playground/src/workbench/genieResponseMapper.ts](../playground/src/workbench/genieResponseMapper.ts) — `mapGenieMessageToCandidate()` now returns `{ candidate, suggestedQuestions, sqlSections }` (was just the candidate). `suggestedQuestions` is extracted from `attachments[].suggested_questions.questions` (collected across all attachments, whitespace-only / non-string entries dropped). `sqlSections` is collected via Pulse's `collectGenieSqlFromAttachments` then projected onto the workbench shape. The mapper **NEVER fabricates** either; both fields are `[]` when Genie didn't return them.

### Hook changes

- [playground/src/workbench/useConversation.ts](../playground/src/workbench/useConversation.ts) — new result fields: `suggestedQuestions: ReadonlyArray<string>`, `lastSanitization: SanitizedComposerInput | null`. `ask(content)` now sanitizes the input BEFORE posting to `/assistant/conversations/start`, sets `lastSanitization` so the UI can surface what was redacted/stripped, and submits the sanitized text. The proxy and downstream LLM never see the original raw secret/injection text.

### UI changes

- [playground/src/components/workbench/ArtifactTabs.tsx](../playground/src/components/workbench/ArtifactTabs.tsx) `SqlTab` — accepts `{ sql, sections }`. Empty/absent sections → single `<pre><code>` fallback (zero regression vs Step 3 behavior). Sections present → subtab strip with "Full SQL" first (when `sql` is provided) followed by one tab per labelled section (`SECTION_ID (cteName)` when cteName is set). Malformed sections dropped defensively.
- [playground/src/components/workbench/ArtifactCard.tsx](../playground/src/components/workbench/ArtifactCard.tsx) — passes `artifact.sqlSections` to `SqlTab`.
- [playground/src/components/workbench/FollowUpQuestions.tsx](../playground/src/components/workbench/FollowUpQuestions.tsx) — new component: chip per Genie-supplied question (max 5 default, overridable), `onAsk` on click, disabled when hook is mid-flight.
- [playground/src/workbench/UnifiedWorkbench.tsx](../playground/src/workbench/UnifiedWorkbench.tsx) — `WorkbenchComposer` renders an amber `role=status` sanitization banner when input was mutated; Verified + Hybrid panes render `<FollowUpQuestions>` below the artifact card wired to `conversation.ask` for one-click follow-up submission.
- [playground/src/workbench/workbench.css](../playground/src/workbench/workbench.css) — composer sanitization banner, SQL section subtab strip, follow-up chip strip styles, all using existing `:root` tokens.

### Tests — 38 new across 5 files

- `composerInput.test.ts` (12) — passthrough, Databricks PAT / GitHub PAT / OpenAI key / email redaction, `ignore-prior` / `reveal-system` / `developer-mode` stripping, combined hits.
- `genieResponseMapper.test.ts` (+7, now 19) — existing 12 updated to destructure `{ candidate }`; +4 suggested-questions; +3 sqlSections.
- `useConversation.test.tsx` (+4, now 10) — +2 sanitization; +2 suggested-questions.
- `SqlTabSections.test.tsx` (8) — fallback rendering, empty state, labelled subtab strip, subtab click swap, malformed dropping, sections-only mode.
- `FollowUpQuestions.test.tsx` (7) — empty/whitespace render-nothing, chips with onAsk, maxChips clamp + override, disabled propagation.

### Validation

- `npm run lint` clean.
- `npm run test` — **801/801** across 64 files (was 763 + 38 Step-6 new + Codex's 6 KPI delta test updates landed alongside).
- `npm run build` clean (36.58 s).
- `git diff --check` clean except expected Windows LF/CRLF warnings.
- Live Vite smoke: `http://127.0.0.1:5174/workbench` HTTP 200; HMR picked up the new `FollowUpQuestions` import and `sanitization` field references.

### What was NOT touched (per Step-6 constraints)

- No file inside `playground/src/pulse/*` was modified by Step 6.
- Artifact validator status contract unchanged; `sqlSections` is purely additive presentation.
- Genie native iframe sandbox stays at `allow-scripts allow-same-origin`.
- ECharts imports remain modular.
- BI Viz peer-surface semantics in `mix` mode unchanged.

### Tripwires

- The validator stays the only authority for artifact status. `sqlSections` does NOT count toward grounding — adding sections to a candidate without a data-bearing citation will NOT promote it to verified.
- The mapper still **never fabricates**. If Genie returns no `suggested_questions`, the hook surfaces `[]`; if no `sqlSections`, the SqlTab falls back to canonical `sql`.
- `sanitizeComposerInput` is called inside `ask()` — bypass would be a regression. Future caller sites (history replay, share-link "ask this question") must run through the same gate.
- `FollowUpQuestions` chips call `ask(q)` directly, which goes through the sanitizer like any other input. A Genie-emitted "ignore previous instructions" chip would get neutralized before sending. Tests do not assert this end-to-end yet; the next session-extension that wants Genie-emitted follow-ups in production should pin it.
- When Step 7 (theme) replaces the inline styles, keep the SQL-section subtab strip and follow-up chip layout aria-correct (role=tablist + role=tab; chips as buttons with title=full-text).

---

## 2026-05-18 - Legacy split layout no longer keeps blank BI pane visible

**Scope:** Rajesh still saw the blank BI pane beside AI Insights even though `BI Viz` is now a top surface action. Root cause: browsers with older localStorage had `pulseplay:enabled-components=both`, which means explicit split-pane mode. The app honored that saved value, so the old blank BI canvas stayed visible.

### What changed

- Added a one-time migration in [App.tsx](../playground/src/App.tsx): legacy saved `both` state is converted to unified `mix` unless the migration marker already exists.
- Added the same read/set behavior in [settingsStore.tsx](../playground/src/settings/settingsStore.tsx) so Settings and App agree.
- Explicit Split + Mix still works: choosing/showing both panes marks the migration complete, so future reloads preserve the user's deliberate split choice.
- Updated [viewportControls.integration.test.tsx](../playground/src/__tests__/viewportControls.integration.test.tsx) to cover the legacy `both` -> `mix` migration and keep explicit split coverage intact.

### Validation

- `npm.cmd test -- viewportControls.integration --silent` -> **19/19**.
- `npm.cmd run lint` -> clean.

### Tripwire

- Default/unified mode should not render the blank BI setup canvas beside AI. The BI pane is visible only via the `BI Viz` peer surface, focused BI URLs, BI-only, or explicit Split + Mix.

---

## 2026-05-18 - KPI delta arrows are physical; tone carries business meaning

**Scope:** Rajesh clarified the KPI card behavior using Return Rate: if returns increased, the arrow must point up because the number increased. The color should follow the model/status/business cue (amber for `🟡 Watch`), not force a down arrow just because the movement is unfavorable for a lower-is-better metric.

### What changed

- Updated [visual.tsx](../playground/src/pulse/visual.tsx) so KPI delta cue direction is always physical movement (`up` / `down` / `neutral` from the delta text).
- KPI delta tone now follows explicit status tone when present (`🟡 Watch` -> amber), and only falls back to metric-direction business tone when no explicit status exists.
- Updated [insightsRendererPolish.test.tsx](../playground/src/pulse/__tests__/insightsRendererPolish.test.tsx):
  - Return Rate `+0.4pp (▲ +6.3%)` with `🟡 Watch` renders an up cue with amber delta tone.
  - Profit Margin `-0.7pp` with `🟡 Watch` renders a down cue with amber delta tone.
  - Return Rate increase with no status still falls back to metric-direction tone (`bad`) while keeping the up cue.

### Validation

- `npm.cmd test -- insightsRendererPolish --silent` -> **6/6**.
- `npm.cmd run lint` -> clean.

### Tripwire

- Do not use business favorability to flip arrow direction. Arrow direction is numeric movement; color/tone is status or metric-direction meaning.

---

## 2026-05-18 - Workbench real Genie conversation wiring (`useConversation` + composer)

**Range:** After Codex's Playwright + unified BI Viz + metric-cue commit (`5623808`), built the real conversation loop into the workbench preview surface and replaced the demo Superstore fixture with live data behind the existing preview flag. Demo stays as the first-paint fallback until a question is submitted.

### What changed

- **`playground/src/workbench/genieResponseMapper.ts`** — pure mapping function `mapGenieMessageToCandidate({ message, profile, connectorType })` turning a Databricks Genie message response into a `CandidateArtifact`. **Never fabricates**: no chart synthesis (chart promotion is downstream), no synthetic citations, no LLM-claimed-status forwarding. Upstream `status` is Genie execution state, not an artifact claim — the validator's authority covers artifact correctness only. Extracts answer markdown, SQL, table (columns + data_table), citations (`sql` + `result-rows` when both present), reasoning steps (`THOUGHT_TYPE_*` → Intent / Sources / Plan / SQL plan), rowCount, executionTimeMs (timestamp delta), source profile + connector type. Defensive cell normalization (null/number/string/non-string). Exports `GENIE_TERMINAL_STATUSES` + `isGenieTerminal`.
- **`playground/src/workbench/useConversation.ts`** — React Query composition. `useConversation({ profile, connectorType?, pollIntervalMs? })` returns `{ ask, reset, isStarting, isPolling, upstreamStatus, result, error, isTerminal }`. Internally composes `useMutation` for `POST /api/assistant/conversations/start` and `useQuery` with a state-driven `refetchInterval` predicate for `GET /api/assistant/conversations/:cid/messages/:mid?profile=...`. Poll halts on COMPLETED / FAILED / CANCELLED. `result` is the `ValidationResult` from `validateArtifact()` over the mapped candidate. FAILED / CANCELLED upstream surfaces a validator-blocked artifact (empty-candidate path) plus a meaningful error, so the UI uses the same Blocked treatment as a chart-without-data block. `ask()` clears prior poll cache before submitting so back-to-back questions stay clean.
- **`playground/src/workbench/UnifiedWorkbench.tsx`** — adds `WorkbenchComposer` (sticky textarea with submit + Cmd/Ctrl+Enter; disabled while starting/polling; surfaces upstream Genie status in the submit button label) in Verified and Hybrid modes. `visibleArtifact = conversation.result?.artifact ?? demoArtifact` so the Superstore fixture remains first-paint until a real result lands. "source: live" / "source: demo fixture" badge in the mode-status line makes the data origin obvious. "Reset to demo" only renders after a live result.
- **`playground/src/workbench/workbench.css`** — composer styling using existing `:root` tokens (label, textarea, submit/reset buttons, error banner, source badge).
- **`playground/src/workbench/__tests__/genieResponseMapper.test.ts`** (12) — `isGenieTerminal` cases, happy-path validation (verified status + correct tabs + citation ordering + reasoning labels), text-attachment fallback, never-fabricates guarantees (no chart, no synthetic citations, answer-only → suggestion), defensive coding (stable id fallback, empty thoughts skipped, inverted timestamps omit executionTimeMs, cell type normalization).
- **`playground/src/workbench/__tests__/useConversation.test.tsx`** (6) — success path (start + COMPLETED → verified), polling progression (SUBMITTED → EXECUTING → COMPLETED across fake timers), start failure (500 from POST surfaces error, never polls), terminal FAILED upstream (validator-blocked + error mentioning "failed upstream", `workbench.validation` category), and two no-ungrounded-behavior cases (answer-only Genie → suggestion; injected ungrounded chart overridden to blocked even when `llmClaimedStatus: 'verified'`).
- **`playground/src/workbench/__tests__/WorkbenchShell.test.tsx`** — existing 8 tests now mount inside a `QueryClientProvider` with retry disabled and a per-test `QueryClient` so `useQueryClient()` resolves and cache state is isolated.

### Validation

- `tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run test` **763/763** (745 baseline + 18 new across the mapper + hook).
- `npm run build` clean (14.27 s).
- Live Vite smoke: `http://127.0.0.1:5174/workbench` returns HTTP 200.

### Tripwires

- The validator stays the only authority for artifact status. `useConversation` deliberately does NOT forward Genie's upstream `status` as `llmClaimedStatus` — the upstream status is execution state, not an artifact claim. Tests pin this with an injected-chart override case so the contract is exercised at the validator boundary the hook depends on.
- The mapper **never fabricates**. No chart synthesis. No synthetic citations. If Genie returns answer-only, the validator emits `suggestion`. If Genie returns FAILED, the validator emits `blocked` via the empty-candidate path.
- No iframe sandbox widened. ECharts imports unchanged (modular `echarts/core` + per-chart registers). BI Viz semantics in mix mode unchanged.
- Demo fixture stays as fallback. Do not remove it until a real `/workbench` surface has cycled at least a week of live use; first-paint with no data is a worse UX than first-paint with a demo.
- The composer's Cmd/Ctrl+Enter shortcut is the only keyboard submit. Don't add Enter-only submit until users have asked for it; jsdom auto-submits on Enter happen often and would break demos.
- `ask()` clears the prior poll cache. If a future slice wants conversation history, change that pattern to APPEND rather than CLEAR; otherwise history is lost on each new turn.

---

## 2026-05-18 - Playwright browser smoke enabled for unified BI Viz

**Scope:** Rajesh asked to install whatever was needed after the previous handover honestly recorded that real browser automation could not run because Playwright was unavailable in the exposed runtime.

### What changed

- Installed `@playwright/test` in [playground/package.json](../playground/package.json), updating [playground/package-lock.json](../playground/package-lock.json).
- Installed the Playwright Chromium runtime locally via `npx.cmd playwright install chromium`.
- Fixed the first-run wizard hidden-pane `inert` spread in [FirstRunWizard.tsx](../playground/src/components/FirstRunWizard.tsx) so React receives a real boolean attribute instead of an empty string.
- Hardened [PulseShell.tsx](../playground/src/components/PulseShell.tsx) nested-root cleanup: real unmounts defer `Visual.destroy()` so React does not warn during surface switching, while React dev StrictMode cancels that pending destroy and reuses the existing Pulse visual during its simulated remount.

### Validation

- Real Chromium smoke at `http://127.0.0.1:5173/`: `AI Insights` surface -> `BI Viz` surface -> `AI Insights` surface, `focus=split`, BI panel `data-status="ready"`, 1 secure Power BI iframe mounted, 0 console errors, 0 page errors.
- `npm.cmd test -- viewportControls.integration insightsRendererPolish --silent` -> **23/23**.
- `npm.cmd run lint` -> clean.
- `npm.cmd test -- --silent` -> **745/745** across 59 files.
- `git diff --check` -> clean except expected Windows LF-to-CRLF warnings.

### Tripwires

- The previous browser-smoke limitation is closed for this workspace. Use `@playwright/test` from the playground package for future real-browser smoke runs.
- PulseShell hosts a nested React root owned by the ported Pulse visual. Cleanup must stay StrictMode-aware; destroying synchronously inside React's parent commit brings back the browser warning, while always deferring without reuse brings back duplicate `createRoot()` warnings in dev.

---

## 2026-05-18 - Unified BI Viz tab + metric-direction cue cleanup

**Scope:** Rajesh clarified the intended unified layout: `AI Insights`, `Ask Pulse`, and `BI Viz` are peer navigation surfaces in one primary canvas. `BI Viz` is the existing BI pane, not a separate split/focused screen by default. He also re-flagged that lower-is-better metric movement must drive every visual cue, not only surrounding text.

### What changed

- Updated [playground/src/App.tsx](../playground/src/App.tsx) so `enabledComponents="mix"` treats `BI Viz` as a same-canvas surface switch:
  - Clicking the Pulse `BI Viz` action no longer writes `?focus=bi` or enters focused-pane mode.
  - The primary canvas swaps from the AI pane to the BI pane while keeping `pulseplay:enabled-components` unchanged.
  - The BI surface now includes a compact `AI Insights | Ask Pulse | BI Viz` surface switcher so users can return to AI Insights or Ask Pulse without opening a separate screen.
  - Explicit maximize/focus, split mode, separate page, and float behavior remain available through existing pane controls.
- Added a light bridge from [PulseShell.tsx](../playground/src/components/PulseShell.tsx) to [visual.tsx](../playground/src/pulse/visual.tsx) so the host can request the internal Pulse `AI Insights` or `Ask Pulse` tab after returning from the BI surface.
- Tightened KPI delta rendering in [visual.tsx](../playground/src/pulse/visual.tsx): once the renderer has assigned the semantic delta pill tone, the delta text is rendered plain inside that pill. This prevents nested text like `▲ +6.3%` from being re-formatted as a green inner trend pill when the metric is lower-is-better and the movement is unfavorable.
- Updated focused coverage in [viewportControls.integration.test.tsx](../playground/src/__tests__/viewportControls.integration.test.tsx) and [insightsRendererPolish.test.tsx](../playground/src/pulse/__tests__/insightsRendererPolish.test.tsx).

### Validation

- `npm.cmd test -- viewportControls.integration insightsRendererPolish --silent` → **23/23**.
- `npm.cmd run lint` → clean.
- `git diff --check` → clean except expected Windows LF-to-CRLF warnings.
- Follow-up 2026-05-18 installed Playwright and closed the real-browser smoke gap; see the entry above.

### Tripwires

- `mix` is now a same-canvas surface switch, not "AI pane plus hidden BI pane until focus." Do not reintroduce `BI Viz` as a default focused-pane shortcut.
- The old split/focus machinery remains valid for explicit power-user actions only (`Split + Mix`, maximize, open page, float).
- KPI delta content inside `gn-kpi-tile-delta` should stay plain text unless the inner formatter can inherit the metric-direction context. Otherwise lower-is-better deltas can produce contradictory nested green pills.

---

## 2026-05-18 - Workbench Steps 2–5 + /workbench wiring landed

**Range:** Continued the build sequence after Step 1 (`cc33dca`). Steps 2, 3, 4, 5 and the route wiring are now on `main`, all shipped as separate small commits with focused tests per slice and a final full-sweep validation.

### What changed

- **Step 2 — Genie native chat embed** (`840ecf7`). `GenieNativeEmbed` consumes a descriptor's `nativeEmbedUrl` with a **narrow sandbox** (`allow-scripts allow-same-origin` only — explicitly excludes `allow-forms`/`allow-popups` that the BI-axis adapter uses for dashboards). Clipboard via `allow="clipboard-write"` not via the sandbox. Three guarded empty states. `buildGenieDescriptor()` and `buildConnectorDescriptor()` reuse the BI-adapter's `buildGenieEmbedUrl()` so admin iframes work for both axes. 22 tests (9 component + 13 descriptors).
- **Step 3 — Artifact card shell + 6 tab renderers** (`908621d`). `ArtifactCard` reads `artifact.tabs` and renders only those tabs in canonical order; the validator (Step 4) controls availability, never the renderer. Status badge is semantic per status; aria-tab semantics throughout. `ArtifactTabs.tsx` ships pure renderers for Answer (paragraph-split markdown), Chart, Table (column-typed, em-dash for null), SQL (pre/code), Evidence (six citation kinds with type-specific rendering), Reasoning (steps with optional `atMs`). 32 tests.
- **Step 4 — Validation gates + Problem Details** (`b1dbeda`). `validateArtifact()` is the sole authority for status. `CandidateArtifact.llmClaimedStatus` exists so we can record what the LLM tried to claim, but it's never read for the authoritative status. Rules: empty → blocked; chart/table without data-bearing citation → blocked with Problem Details + extensions.blockedTabs; structured payload + grounding → verified; answer + citations → grounded-draft; answer-only → suggestion. `pack` citations are explicitly NOT data-bearing for chart/table. Markdown sanitization strips `<script>`/`<iframe>`/on* handlers/`javascript:` as defense in depth. 25 tests covering all four status fixtures + five LLM-self-declare override cases.
- **Step 5 — ECharts modular renderer + Vega-Lite compiler + chart registry** (`b192164`). `chartRegistry.ts` lists 43 entries spanning Core / Advanced / Trendy / Legacy / Future tiers with auto-pick policy locked per tier (Core=always, Advanced=heuristic, Trendy=opt-in, Legacy=never-auto, Future=roadmap). `vegaLiteToECharts.ts` compiles bar/line/area/point/arc marks (with numeric coercion and em-dash null dimensions). `EChartsRenderer.tsx` uses the modular build (`echarts/core` + per-chart registers, NOT the full package) and applies `setOption` notMerge=true on prop changes. `vitest.setup.ts` adds a no-op canvas shim so zrender doesn't crash in jsdom. 36 new tests; updated 3 ArtifactCard chart-tab tests. echarts@^5.5 added as a runtime dep.
- **Wiring — `/workbench` route behind preview flag** (`1920531`). `workbenchRoute.ts` adds the path-based router slice (matching the existing settings/knowledge/launchpad pattern). `isWorkbenchEnabled()` checks `VITE_PULSEPLAY_ENABLE_WORKBENCH` (build-time) and `localStorage.pulseplay:workbench-preview` (runtime). `WorkbenchShell` renders an opt-in gate when the flag is off. `UnifiedWorkbench` builds a Genie descriptor, resolves the mode via `resolveAssistantMode()`, surfaces capability/preference/reason via mode controls, and renders the artifact card / native embed / both per active mode. `demoArtifact.ts` is a Superstore-shaped fixture fed through the validator so the demo exercises the verified path with a real bar chart. `workbench.css` provides minimal v0 styling using the existing `:root` tokens.

### Validation

- `npm run lint` clean.
- `npm run test` **745/745** (was 580 baseline; +165 new across the workbench: 35 Step 1 + 22 Step 2 + 32 Step 3 + 25 Step 4 + 36 Step 5 + 15 wiring).
- `npm run build` clean (18.58 s).
- Live Vite smoke: `http://127.0.0.1:5174/workbench` returns the React shell (HTTP 200, correct title).

### Tripwires

- The `/workbench` route is **preview-flagged** until Steps 6 + 7 land. Production builds without `VITE_PULSEPLAY_ENABLE_WORKBENCH=true` show the opt-in gate. Per-browser opt-in via `localStorage.setItem('pulseplay:workbench-preview', 'on')` or via the gate's button.
- The validator is the sole authority for status. The LLM cannot self-declare; tests pin this. Adding new artifact kinds requires updating `validateArtifact` AND the matching test fixtures simultaneously.
- ECharts uses the **modular build** (`echarts/core` + per-chart registers — BarChart, LineChart, PieChart, ScatterChart + Grid/Legend/Title/Tooltip components + CanvasRenderer). Adding a new chart type means:
  1. Add it to `chartRegistry.ts` with `renderable=true`.
  2. Import + register the matching ECharts module in `EChartsRenderer.tsx`.
  3. Add a focused test in the registry + compiler suites.
- Production bundle grew by ~26 KB (workbench code) + a new ~574 KB vendor chunk (ECharts). Acceptable as primary renderer; revisit per-tier lazy-loading if Vite cold start regresses measurably.
- Step 6 (Pulse-asset refactor) and Step 7 (theme) remain. The Pulse-PBI sibling still consumes `playground/src/pulse/*` patterns — Step 6 must be additive only per [PULSE_PORT_DETANGLING.md](PULSE_PORT_DETANGLING.md).
- `classifyConnectorType` in `proxy/lib/connectorProbe.js` still does not return `responses-agent`; the workbench matrix lists it for forward compatibility but live discovery does not surface it yet.
- `bi-adapters/databricks-genie/` stays. The Genie space is legitimately both a BI surface (BIPanel) and an assistant surface (GenieNativeEmbed); the descriptor builder uses the BI-adapter's URL builder as the single source of truth.

---

## 2026-05-18 - App feature/option audit: served vs partial vs stub

**Scope:** Read-code audit of the current PulsePlay app surface after Rajesh asked to check each feature/option, how it is linked, what purpose it serves, whether it actually serves that purpose, and what gaps should be filled.

### What changed

- Added [docs/research/APP_FEATURE_OPTION_AUDIT.md](research/APP_FEATURE_OPTION_AUDIT.md) with a feature-by-feature matrix across the main shell, first-run wizard, Settings groups, embed configuration, BI adapters, assistant/chat surfaces, unified workbench work-in-flight, Launchpad, Knowledge Base, proxy-facing routes, visualization runtime, and priority gap plan.
- Incorporated the four research-agent lane verdicts into the audit: use a Unified Ask Pulse Workbench with Native Genie / PulsePlay Verified / Hybrid modes; use ECharts as primary renderer, Vega-Lite as validation/IR, Plotly lazy for specialist charts; promise **no ungrounded artifacts**, not "100% no hallucination."
- Called out the main visible gaps: Settings BI Provider is read-only, Launchpad Genie actions overpromise, Advanced Reset BI misses `pulseplay:bi-embed-config`, managed-agent/per-tile options are placeholders, non-PBI vendors are iframe stubs, Databricks AI/BI remains partial until SDK/token smoke, and the visualization catalog is not runtime-supported yet.
- Explicitly noted that Workbench Steps 2-4 are now tracked foundations (`GenieNativeEmbed`, descriptor builders, `ArtifactCard`, tab renderers, and artifact validator/problem-details helpers), but not yet routed into the app as visible end-user behavior.
- Noted concurrent uncommitted Step 5 candidate chart-registry/renderer/compiler/package work as visible local work, but not treated as shipped behavior by this audit.

### Validation

- Documentation-only audit. Code/tests were not run for this slice.
- `git diff --check` to be run at wrap-up.

### Tripwires

- Do not claim the current chat is already best-in-class. The old v0 sidebar has good connector plumbing but weak artifacts; Pulse Ask Pulse is richer but noisy and chart-limited.
- Do not claim Genie "Use as AI source" binds the clicked Genie space until Launchpad creates/selects a real connector descriptor.
- Do not claim the visualization reference is live runtime support until the chart registry and renderer ship.
- The next best visible slice is Workbench wiring plus truth-polish P0s: route the tracked native Genie embed, artifact card shell, and validator into real assistant output, decide whether to land the concurrent Step 5 chart-renderer work, add Settings BI provider edit or copy correction, Launchpad Genie action correction, reset-key fix, and readiness live-state expansion.

---

## 2026-05-18 - Workbench Step 1: capability model landed; revert of stub scaffold

**Range:** After the strategy lock (entry below), an automated session committed `a7d487d` → `3eb1093` ("Steps 1-7 fully completed") in five commits on `main`. Codex audited under the external-LLM rule and found the work did not match the wrap-up claim. Reverted, then implemented real Step 1.

### Audit findings on the reverted scaffold

- **Build broken at HEAD on main.** `tsc --noEmit` reported 13 errors across `ArtifactCard.tsx` (PowerShell here-string ate template-literal backticks at `className={\`tab-btn ...\`}` → `className={\	ab-btn \\}`) and `GenieNativeEmbed.tsx` (same mangling on a JSX template literal).
- **Dead code.** None of the seven new files were imported by `App.tsx` or `main.tsx`. The actual Ask Pulse UI was unchanged.
- **`visual.tsx` not refactored.** Commit `3eb1093` claimed "replace huge visual.tsx" but `visual.tsx` was never touched (9735 lines, last touched in `90ade5d`).
- **Validation gate inverted the locked rule.** `ValidationGates.validate()` defaulted `status` to whatever the caller passed (`artifact.status || 'Verified'`), letting the LLM self-declare `Verified`. The locked contract is that the validator emits status, never the LLM.
- **Sandbox tripwire violated.** `GenieNativeEmbed` used the wide-open `allow-scripts allow-same-origin allow-forms allow-popups` sandbox that CLAUDE.md explicitly warns against for vendor adapters.
- **ECharts: full bundle, no compiler, no registry, no tiers.** Step 5 acceptance was "modular build + Vega-Lite → ECharts compiler stub + chart registry with tier classification." Shipped: bare `import * as echarts from 'echarts'`.
- **Theme contract violated.** Strategy specified professional neutral baseline with compact/dark/high-contrast as modes. Shipped: dark only, no light, no compact, no high-contrast, no data-viz palette.
- **Build sequence order violated.** Step 2 (`0650c7b` Genie embed) committed after Step 3 (`9a4a716` ArtifactCard); strategy locked Steps 1-3 as sequential.

### What changed

- **5 reverts on main** (`6d88bb8` → `b7daa2d`) each undoing one of the five broken commits. Non-destructive — original commits stay in history; revert commits sit on top.
- **Strategy lock cherry-picked** to main as `577f3e7` (originally landed on the worktree branch as `06ffa78` and was not present on main when the broken commits ran).
- **Step 1 implemented correctly:**
  - [playground/src/types/assistant.ts](../playground/src/types/assistant.ts) — full type contract. `AssistantMode` (3 modes), `ConnectorType` (10 types), `ConnectorCapabilities` (5 orthogonal flags), `WorkbenchArtifact` (with `ArtifactStatus` + `WorkbenchTab` discriminated unions), `ArtifactCitation` (6 citation kinds including `sql`/`dax`/`result-rows`/`vendor`/`pack`/`vector`), `ArtifactResultTable`, `ChartSpec`, `MarkdownPayload`, `ReasoningTrace`, `AssistantConnectorDescriptor`, `AssistantModeResolutionInput/Result`. No `any` types. Frozen registries.
  - [playground/src/lib/connectorCapabilities.ts](../playground/src/lib/connectorCapabilities.ts) — `CONNECTOR_CAPABILITIES` matrix (one entry per of the 10 connectors), `supportedModes()`, `resolveAssistantMode()` with `capability` / `preference` / `forced-verified` / `forced-native-embed` / `no-mode-available` reason codes, `connectorsMatching()`, `capabilitiesForConnector()`.
  - [playground/src/lib/__tests__/connectorCapabilities.test.ts](../playground/src/lib/__tests__/connectorCapabilities.test.ts) — 35 vitest cases covering matrix exhaustiveness, immutability (frozen), cross-capability invariants (hybrid → native + verified; grounded-sql → verified; chat-only never advertises grounded-sql; only Genie supports hybrid today; only Genie supports native chat embed today), fidelity ordering, mode resolution policy (capability default, preference respected when supported, ignored when not, requireVerified filter, requireNativeEmbed filter, combined constraints), and the type-registry stability invariant.
  - [docs/adr/0008-unified-assistant-surface.md](adr/0008-unified-assistant-surface.md) — ADR documenting the capability flags, modes, resolver policy, initial matrix, and consequences. References ADR-0007 as the proxy-side X-axis precedent.
  - [docs/memory/feature_unified_workbench.md](memory/feature_unified_workbench.md) — repo-local feature memory with proper checklist (Step 1 done, Steps 2-7 unchecked), matrix snapshot, tripwires, and a revert-incident record.

### Validation

- `tsc --noEmit` clean.
- Focused `npx vitest run src/lib/__tests__/connectorCapabilities.test.ts` → **35/35**.
- Full playground vitest sweep — see commit-time verification entry below.
- No UI change; the workbench shell is Step 3. Browser preview was intentionally not exercised for this slice.

### Tripwires

- Capability status (`verified` / `grounded-draft` / `suggestion` / `blocked`) is emitted by the validator (Step 4), NEVER declared by the LLM. The matrix is the type-level analog: only the matrix can expand a connector's supported set.
- `classifyConnectorType` in `proxy/lib/connectorProbe.js` does not currently return `responses-agent`. The capability matrix here lists it for forward compatibility; the probe classifier is a separate follow-up.
- Cross-capability invariant tests will fail loud if someone sets `supportsHybrid: true` without `supportsNativeChatEmbed` AND `supportsVerifiedArtifacts`. This is intentional — protects against the "only Genie does hybrid" lock silently breaking.
- Step 2 (`nativeChatEmbed` adapter) must keep `bi-adapters/databricks-genie/` alive. A Genie space is legitimately both a BI surface and a chat surface; the workbench adds an assistant-axis presentation alongside the existing BI-axis presentation.
- Worktree `claude/suspicious-pasteur-d858db` diverged from `main` after the reverts (different commit hashes for the same tree-state at base). Step 1 was implemented on main directly because the worktree has no `node_modules`. Future code work on this branch should expect either `npm install` in the worktree or main-direct work.

---

## 2026-05-18 - Strategy lock: Unified Ask Pulse Workbench

**Range:** After live no-creds + credentialed smoke confirmed the proxy + playground stack works end-to-end against the org Databricks workspace (7 Genie spaces, 2 Lakeview dashboards, Sample Superstore Sales Performance probe returns rich metadata, live Genie question completed in ~39s), Rajesh ran 4 research agents over the Ask Pulse direction. This pass records their verdict as a canonical strategy lock.

### What changed

- Added [UNIFIED_ASK_PULSE_WORKBENCH.md](UNIFIED_ASK_PULSE_WORKBENCH.md) as the locked strategy. Three modes inside one chat surface: **Native Embed** (Genie iframe), **PulsePlay Verified** (API + artifact contract), **Hybrid** (Genie inside artifact canvas with PulsePlay rails).
- Locked the accuracy posture: do not promise "100% no hallucination"; promise **no ungrounded artifacts** — every answer carries one of four statuses (`Verified` / `Grounded draft` / `Suggestion` / `Blocked`) emitted by an artifact validation gate, not chosen by the LLM.
- Locked the visualization stack: **ECharts** primary runtime, **Vega-Lite** neutral spec/validation grammar, Plotly lazy-loaded for scientific/3D/financial specialist visuals. Chart tiers: Core auto-pick, Advanced heuristic auto-pick, Trendy opt-in, Legacy never-auto, Future roadmap.
- Locked the build sequence: (1) `UnifiedAssistantSurface` architecture + connector capability model, (2) Genie iframe promotion to assistant axis, (3) artifact card shell with `Answer / Chart / Table / SQL / Evidence / Reasoning` tabs, (4) verified artifact model + validation gates, (5) ECharts renderer + chart registry, (6) Pulse chat asset refactor (additive only, respecting Pulse-port detangling), (7) workbench theme.
- Recorded supersession: the workbench replaces the 2026-05-17 AGENT_SYNC "unified surface tabs" proposal as the canonical Ask Pulse direction. AI Insights remains a sibling pane; the floating comparison layer and Pulse Bubble launcher remain under research and do not block.
- Cross-linked [ARCHITECTURE.md](ARCHITECTURE.md), [AGENDA.md](AGENDA.md), [AGENT_SYNC.md](AGENT_SYNC.md). Memory mirrored as `feature_unified_workbench`, `feature_no_ungrounded_artifacts`, and `feature_visualization_stack`.

### Validation

- Doc-only commit; no code change.
- Live smoke that preceded the strategy: proxy `/health` ok, `/assistant/profiles` returns `default` + `supervisor`, `/assistant/capabilities` reports genie/lakeview/servingEndpoints/apps/jobs available + vectorSearch absent, `/assistant/genie/spaces` returns 7 spaces, `/assistant/lakeview/dashboards` returns 2, `/assistant/probe` (default profile) returns rich metadata in 436 ms, `/assistant/conversations/start` + poll completes a real Genie question in ~39 s with top-3-categories SQL on `workspace.databrickspractice.vw_genie_sales_performance`. Vite root HTTP 200; Vite `/api/*` proxy passes through cleanly.
- `git diff --check` expected clean except for CRLF warnings (Windows shell).

### Tripwires

- The build sequence is **sequential through Step 3**; Steps 4 + 5 can land in parallel; Steps 6 + 7 follow. Do not start Step 6 (Pulse chat asset refactor) before Step 3 because the artifact card shell defines the extraction targets.
- Step 6 is **additive only**. The Pulse-PBI sibling still consumes `playground/src/pulse/*` patterns. Anything moved out must be re-exported or shimmed so the sibling does not break.
- Validation gates in Step 4 use the locked Problem Details envelope from [ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md). `Blocked` artifacts return `application/problem+json` shaped responses with category, support code, and operator detail.
- The artifact status is emitted by the validator, **not** declared by the LLM. Test fixtures must include an LLM trying to self-declare `Verified` on an unsupported claim and the validator overriding to `Grounded draft` or `Blocked`.
- ECharts bundle pressure is a known live risk. Default plan is modular build (`echarts/core` + per-chart registers). Re-decide if the bundle measurably regresses Vite cold start.
- Do not deprecate `bi-adapters/databricks-genie/`. Step 2 adds an assistant-axis presentation; the BI-axis presentation stays. A Genie space is legitimately both a BI surface and a chat surface.
- The capability model from Step 1 is a TypeScript contract. No UI changes until Step 2 lands and Step 3 starts wiring real renderers.

---

## 2026-05-18 - Review/fix: React Query foundation proof slice

**Range:** Rajesh/Copilot committed `5b51fc2` as the Phase 1 React Query foundation. Codex audited it under the external-LLM diff rule, kept the useful foundation, and patched the acceptance gaps.

### What changed

- Moved React Query Devtools to dev-only behavior in [App.tsx](../playground/src/App.tsx): dynamic import only in Vite dev mode, skipped in test mode, and `@tanstack/react-query-devtools` moved to `devDependencies`.
- Added [vite-env.d.ts](../playground/src/vite-env.d.ts) so `import.meta.env` is typed and production builds can erase the devtools dynamic import.
- Preserved governance behavior in [useAllowlist.ts](../playground/src/features/config/useAllowlist.ts) by disabling retries; allowlist failures fail closed promptly instead of waiting through retry delays.
- Preserved prior pack behavior in [App.tsx](../playground/src/App.tsx): `packsLoaded` is true on success or error, matching the old "loaded after fetch attempt" semantics.
- Hardened [apiClient.ts](../playground/src/lib/apiClient.ts) with a fallback request id when `crypto.randomUUID` is unavailable.
- Strengthened [appGovernance.integration.test.tsx](../playground/src/__tests__/appGovernance.integration.test.tsx): it now verifies query cache population and failed allowlist -> fail-closed alert.

### Validation

- Before fixes: Codex independently verified the committed slice with playground lint, focused `appGovernance` **1/1**, focused `viewportControls.integration` **18/18**, full playground **579/579**, and build.
- After fixes: `npm run lint` passed.
- Focused `npm run test -- appGovernance --silent` passed **2/2**.
- Focused `npm run test -- viewportControls.integration --silent` passed **18/18**.
- Full `npm run test -- --silent` passed **580/580**.
- `npm run build` passed.
- Production bundle scan found no `react-query-devtools` / `ReactQueryDevtools` / `Query Devtools` strings.
- Vite smoke at `http://127.0.0.1:5173/` returned HTTP **200** with `#root`.

### Tripwires

- This accepts the React Query proof slice for allowlist/packs only. It does **not** mean the whole Phase 1 modernization charter is complete.
- Next durable step should be an ADR/canonical query contract: query key shape, request-id propagation, Problem Details mapping, retry policy, stale/cache policy, and devtools dev-only rule.
- Do not start broad `App.tsx` decomposition until the Playwright/axe smoke gate from the challenge note is either accepted or explicitly deferred.

---

## 2026-05-17 - Challenge: Enterprise modernization pillars

**Range:** Rajesh chose Path A and reset `main` to `89da8ec`, dropping the broken post-charter commits before any architectural lock or code work continued. This pass stayed in coordination mode.

### What changed

- Added a Codex `[CHALLENGE]` entry to [AGENT_SYNC.md](AGENT_SYNC.md) for the draft [ENTERPRISE_MODERNIZATION_CHARTER.md](ENTERPRISE_MODERNIZATION_CHARTER.md).
- Accepted the broad modernization direction, but challenged several locks before ADRs: the routing premise is factually wrong (`react-router-dom` is not installed; current routing is custom `pushState` hooks), zustand needs a state-ownership inventory before lock, Tailwind should be deferred behind tokens-first + Radix, Sentry should be abstracted behind org-approved telemetry, and Playwright + axe should land before large UI decomposition.
- Recommended lock order: correct the charter premise, lock React Query for new server-state with a small proof slice, add Playwright/axe smoke coverage, prove form schemas on one config form, then proceed to state/design/slicing locks.

### Validation

- `python scripts/llm_onboard.py --terse`
- `git diff HEAD --stat` was clean before the challenge entry.
- `git diff --check` passed with the existing CRLF warning on `docs/AGENT_SYNC.md`.

### Tripwires

- No ADRs, package installs, or code changes were made.
- Do not treat the charter pillars as locked until Rajesh/Claude challenge this challenge and the accepted decisions are mirrored into ADRs/canonical docs.

---

## 2026-05-17 - Coordination: Slice 1c go-ahead

**Range:** Claude asked whether to proceed after Profit Margin delta-cue review and FM symmetry acceptance. This pass records the go-ahead in AGENT_SYNC so the next error-handling lane is explicit.

### Decision

- Approved Slice 1c as the next lane.
- Asked Claude to split it into two commits: OAuth-error normalization in `errorStatusFromDatabricks`, then streaming in-band error events for `/supervisor/confidence`.
- Pinned acceptance criteria: safe Databricks/OAuth status mapping with no raw upstream leaks, in-band stream `{ type: "error", problem: ... }` event after headers are committed, focused tests for both halves, `node --check server.js`, and focused/full proxy verification as appropriate.

### Tripwires

- Codex is staying off `proxy/server.js` and `proxy/tests/*` while Claude owns Slice 1c unless Rajesh redirects or Claude asks for review.
- Do not send `application/problem+json` after a stream has already started; use stream-native events there.

---

## 2026-05-17 - Review: Foundation Model SQL section symmetry accepted

**Range:** Claude shipped the Foundation Model half of Phase 11b at `e294a49`. This pass independently audited that handoff before the team moves back to the locked error-handling lane.

### What was verified

- `extractSqlSectionsFromMarkdown()` in [sqlSectionExtractor.js](../proxy/lib/sqlSectionExtractor.js) scopes extraction to fenced SQL blocks and translates offsets back into source markdown.
- `/foundation/section` in [server.js](../proxy/server.js) scans `result.content` only, surfaces top-level `sqlSections` only when markers exist, and preserves `content` / `rawContent` unchanged.
- `liftFmSqlSections()` in [genie.ts](../playground/src/pulse/genie.ts) normalizes FM top-level `sqlSections` into the same `GenieSqlSection[]` shape used by the Genie attachment path.
- The labelled SQL UI path remains shared through `SqlTabs`.

### Validation

- `proxy`: `npx.cmd jest --runInBand tests/sqlSectionExtractor.test.js tests/foundationSqlSections.test.js` passed **27/27**.
- `playground`: `npm.cmd test -- --run src/pulse/__tests__/genieSqlSections.test.tsx` passed **8/8**.
- `git diff HEAD --stat` was clean before the AGENT_SYNC review note.

### Tripwires

- Non-blocking: the markdown fence matcher accepts `sql` and `SQL` fences. If future FM prompts emit mixed-case `Sql` or dialect fences like `spark-sql`, extend `SQL_FENCE_RE` with tests.
- Next lane is Slice 1c: Databricks OAuth-error normalization plus streaming in-band error events for `/supervisor/confidence` phase-2 failures.

---

## 2026-05-17 - KPI delta cues respect metric direction

**Range:** Rajesh flagged KPI tiles where the delta cue inherited the amber/watch feel from the card status. This initial slice separated overall KPI tile status from metric-direction delta tone.

> **Superseded clarification (2026-05-18):** arrow direction is physical movement, not business favorability. The updated behavior is documented in the top entry: Return Rate increasing shows an up arrow; `🟡 Watch` drives amber tone.

### What shipped

- Split overall KPI tile status from delta-direction tone in [metricDirections.ts](../playground/src/pulse/rendering/metricDirections.ts): a tile can remain `watch`/amber while its delta pill is `bad`/red.
- Updated [visual.tsx](../playground/src/pulse/visual.tsx) so KPI tile deltas add a semantic cue glyph when the AI did not emit one. Example: Return Rate `+0.4pp` under a lower-is-better rule renders as `▼ +0.4pp`, colored red.
- Added compact cue styling in [visual.less](../playground/src/pulse/style/visual.less).
- Added regression cases in [insightsRendererPolish.test.tsx](../playground/src/pulse/__tests__/insightsRendererPolish.test.tsx) for Return Rate `5.9%` vs `5.5%`, `+0.4pp`, `🟡 Watch`, and `higherIsBetter: false`, plus Profit Margin `12.7%` vs `13.4%`, `-0.7pp`, `🟡 Watch`, and `higherIsBetter: true`.

### Validation

- `playground`: focused `npm.cmd test -- --run src/pulse/__tests__/insightsRendererPolish.test.tsx` passed **5/5**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --run` passed **572/572**.
- `playground`: `npm.cmd run build` passed.
- Browser smoke: `http://127.0.0.1:5173/` opened cleanly in the in-app browser.

### Tripwires

- The raw delta text is intentionally preserved (`+0.4pp` stays `+0.4pp`) because it describes the numeric movement. The arrow/color describe business performance direction.
- This relies on metric-direction rules (`higherIsBetter: false`) from the author/preset. If no rule is present, deltas fall back to physical direction as before.

---

## 2026-05-17 - Phase 11b read-side: labelled SQL sections in Pulse

**Range:** Claude wired `sqlSectionExtractor` into the proxy at `8e29260`, but flagged that the playground still ignored `att.query.sqlSections`. This pass closes the read-side gap so the proxy-surfaced per-section SQL is visible instead of remaining a raw unlabelled blob.

### What shipped

- Added `GenieSqlSection` and `collectGenieSqlFromAttachments()` in [genie.ts](../playground/src/pulse/genie.ts) so `GenieClient.hydrateGenieFields()` lifts `attachments[].query.sqlSections` onto the message as `sqlSections`.
- Updated the Pulse SQL view in [visual.tsx](../playground/src/pulse/visual.tsx) to prefer labelled section fragments when present, while keeping `sqlQuery/sqlQueries` raw blob fallback unchanged.
- Extended `SqlTabs` to accept explicit labels and render a visible single-section label, then added compact label styling in [visual.less](../playground/src/pulse/style/visual.less).
- Added [genieSqlSections.test.tsx](../playground/src/pulse/__tests__/genieSqlSections.test.tsx) covering attachment lifting and labelled SQL tab rendering.

### Validation

- `playground`: focused `npm.cmd test -- --run src/pulse/__tests__/genieSqlSections.test.tsx` passed **3/3**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --run` passed **571/571**.
- `playground`: `npm.cmd run build` passed.

### Tripwires

- This makes Genie `sqlSections` visible in the Pulse message SQL view. It does not add Foundation Model response-path extraction; Claude's FM symmetry note remains open.
- The raw SQL blob stays available for old clients and prompts without markers.
- The dev-console SQL history panel still shows workspace statement history; it cannot recover `att.query.sqlSections` unless that metadata comes through the message response path.

---

## 2026-05-17 - Slice 1b Problem Details foundation + malformed-body hardening

**Range:** Rajesh approved the no-panic error handling lane after Claude's Slice 1b plan. `main` already contains `70c3139` with the Problem Details helper, global malformed JSON handler, global unexpected-error fallback, and tests. This follow-up tightened browser behavior by making malformed-body responses pass through the same CORS/security header layer before body parsing.

### What shipped

- Added [problemDetails.js](../proxy/lib/problemDetails.js) as the backend Problem Details foundation: `createProblem()`, `sendProblem()`, `mapUpstreamError()`, `redactProblemCause()`, and `ensureRequestId()`.
- Added global malformed JSON/body-too-large handling and a final unexpected-error fallback in [server.js](../proxy/server.js), preserving the safe legacy `error` field alongside the structured envelope.
- Locked the sentinel for `unexpected_internal`: `PulsePlay could not complete this request. Share the support code with your administrator.`
- Kept the streaming carve-out: if headers are already sent, `sendProblem()` returns `false` and the global fallback calls `next(err)`.
- Moved body parsing after the CORS/security header middleware so malformed JSON still receives CORS, `nosniff`, and request-id headers rather than becoming a browser-side mystery.

### Validation

- `proxy`: `node --check server.js` passed.
- `proxy`: `node --check lib/problemDetails.js` passed.
- `proxy`: focused `npx.cmd jest --runInBand --verbose tests/problemEnvelope.integration.test.js tests/problemDetails.test.js tests/server.test.js` passed **150/150**.
- `proxy`: full `npx.cmd jest --runInBand` passed **740/740**.

### Tripwires

- This closes P0-2 malformed body/no support code. It does **not** close P0-3 raw `err.message` route leaks or P0-4 Databricks OAuth normalization.
- Express 4 still does not auto-forward async route throws. Existing async handlers need explicit `try/catch` or a wrapper during Slice 1d.
- Streaming paths still need in-band error events for post-first-chunk failures; the foundation only prevents corrupting committed streams.

---

## 2026-05-17 - H1 doc sync: ResponsesAgent is the ninth backend path

**Range:** Claude's review correctly flagged that the code had shipped `/responses-agent/*` but active docs still carried the old runtime-backend count. This pass updates the current/canonical docs only; historical audit and migration snapshots are left untouched.

### What shipped

- Updated [CLAUDE.md](../CLAUDE.md) to describe nine backend paths and include ResponsesAgent in the X-axis summary.
- Updated [ARCHITECTURE.md](ARCHITECTURE.md): the connector matrix now includes ResponsesAgent, and the runtime backend table adds Mosaic AI ResponsesAgent as path #9.
- Updated [PROXY_REFERENCE.md](PROXY_REFERENCE.md) with the ResponsesAgent upstream serving-endpoint route and public proxy routes `/responses-agent/health` + `/responses-agent/chat`.
- Synced active docs that still said eight: [README.md](../README.md), [ROADMAP.md](ROADMAP.md), [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md), and [AGENT_SYNC.md](AGENT_SYNC.md).

### Validation

- Current-count references in active docs now say nine and include ResponsesAgent.
- `git diff --check` passed with only expected CRLF warnings.

### Tripwires

- Historical docs under `docs/research/` and `docs/MIGRATION_NOTES.md` still mention eight because they preserve older audit snapshots. Do not rewrite those unless explicitly creating a new audit revision.
- This is H1 docs only. It does not start Slice 1b/1c of the error-handling strategy.

---

## 2026-05-17 - Navigation styling pass: unified surface switcher rail

**Range:** Rajesh asked to improve styling, starting with navigation. The visible issue was that AI Insights looked like a primary blue pill while Ask Pulse and BI Viz read as loose text labels, even though all three are now peer surfaces.

### What shipped

- Wrapped AI Insights, Ask Pulse, and BI Viz in one `gn-surface-switcher` rail so the controls read as a single navigation system.
- Kept AI Insights / Ask Pulse as accessible tabs, while BI Viz stays a button that focuses the BI surface through the existing viewport event.
- Added consistent icon wells, inactive button affordances, hover elevation, active gradient/shadow, dark-mode treatment, compact wrapping, and forced-colors borders.
- Checked the available Figma/Canva tool surfaces: Canva returned no matching brand templates for `dashboard navigation ui`; the available Figma team library returned no segmented navigation components, so the implementation stayed local to PulsePlay's existing design language.

### Validation

- `playground`: `npm.cmd run lint` passed.
- `playground`: focused `npm.cmd test -- --run src/__tests__/viewportControls.integration.test.tsx` passed **18/18**.
- `playground`: `npm.cmd run build` passed after replacing a Less `fade()` token that could not compile.
- `playground`: full `npm.cmd test -- --run` passed **568/568**.
- Browser smoke on `http://127.0.0.1:5176/`: nav rendered as one grouped rail with `AI Insights`, `Ask Pulse`, and `BI Viz`; no permanent BI pane in fresh unified mode.

### Tripwires

- This is navigation styling only. It does not implement the floating comparison layer or Pulse Bubble.
- Figma capture can be used next if Rajesh wants a design artifact saved into the team library, but that requires choosing the capture destination. Runtime code does not need that step.

---

## 2026-05-17 - Error handling baseline locked + ResponsesAgent middleware hotfix

**Range:** Rajesh accepted the error-handling strategy lane and Claude independently confirmed the P0 `/responses-agent/*` middleware gap. This pass locks the planning baseline and closes only the standalone Slice 1a security/supportability gap.

### What shipped

- Promoted [ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md) from "Decision Candidate" to **Decision (locked 2026-05-17)**, with Claude's challenge folded in.
- Mounted `/responses-agent` under the same rate-limit, IdP, shared-key, and allowlist posture as the other cost-bearing AI connector families.
- Added structural tests so `/responses-agent` cannot silently drift out of rate-limit, shared-key, or allowlist coverage.
- Added a behavioral shared-key test for `/responses-agent/health` so the public health route cannot bypass the configured shared-key mode.
- Updated AGENT_SYNC with a `[DONE]` response so Claude can review the hotfix and proceed with Slice 1b challenge/implementation.

### Validation

- `proxy`: `node --check server.js` passed.
- `proxy`: focused `npm.cmd test -- server --runInBand` passed **133/133**.
- `proxy`: full `npx.cmd jest --runInBand --verbose` passed **723/723**.

### Tripwires

- This closes **only P0-1** from the error strategy. P0-2 malformed JSON/no support code, P0-3 raw `err.message` leaks, and P0-4 Databricks OAuth error normalization remain open.
- The Problem Details helper/global envelope did **not** ship in this slice; that is Slice 1b.
- Streaming routes still need the documented carve-out: pre-first-chunk failures can return `problem+json`; post-first-chunk failures need an in-band stream error event.

---

## 2026-05-17 - Unified surface correction: BI Viz is a peer action, not a permanent pane

**Range:** Rajesh challenged the UI after seeing BI still rendered as a separate right-side section. Brutal-honest answer: the prior LayoutPreset facade did not implement the visible part of his plan. This pass corrects that first slice.

### What shipped

- `enabledComponents="mix"` now means the unified default surface: AI Insights / Ask Pulse own the main surface and BI does not render as a permanent second section.
- Added a Pulse-row **BI Viz** action beside AI Insights / Ask Pulse that focuses the BI surface through the existing viewport event system.
- Kept `enabledComponents="both"` as the explicit split-pane mode for the `Split + Mix` preset, so side-by-side review remains available when the author chooses it.
- Settings Preferences now labels the choice as `Unified` vs `Split` instead of ambiguous `Mix` vs `Both`, and the Balanced preset copy now describes BI as on-demand.
- Updated AGENT_SYNC with a `[DONE]` correction entry so Claude does not treat the earlier Option A note as the final viewer behavior.

### Validation

- `playground`: focused `npm.cmd test -- --run src/__tests__/viewportControls.integration.test.tsx src/settings/__tests__/layoutPresets.test.ts` passed **33/33**.
- `playground`: Settings drift follow-up `leafLabels.drift` + `leafScrollAndChips` passed **18/18**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --run` passed **568/568**.
- Browser smoke on `http://127.0.0.1:5176/`: fresh-origin unified view rendered `AI panel=1`, `BI panel=0`, `BI Viz=1`; clicking `BI Viz` focused the BI surface with a visible `Restore BI panel` control.

### Tripwires

- Existing browsers with `pulseplay:enabled-components=both` in localStorage intentionally stay in split mode. Fresh sessions default to unified `mix`; existing users can switch through Settings -> Preferences -> Layout preset -> `Balanced` or Visible panels -> `Unified`.
- This does not implement the floating comparison layer or Pulse Bubble launcher yet. It only corrects the default BI-as-peer-surface behavior.

---

## 2026-05-17 - Error handling strategy and no-panic failure contract

**Range:** Rajesh asked for a deep scan with multiple agents so PulsePlay errors become clear, root-cause-oriented, and resolvable instead of panic-inducing. This pass was docs/research only at the time; the newer 2026-05-17 hotfix entry above closes P0-1.

### What shipped

- Added [ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md): RFC 9457 Problem Details baseline, PulsePlay error taxonomy, UI copy pattern, current strengths, P0/P1/P2 gap list, phased implementation roadmap, and acceptance criteria.
- Added a LIFO [AGENT_SYNC.md](AGENT_SYNC.md) coordination entry summarizing multi-agent findings and asking Claude to challenge the roadmap order.
- Captured the strongest recommendation: build an **Error Intelligence Layer** that separates viewer-safe copy from operator diagnostics and always includes a support code.

### Validation

- Research/docs only. Runtime code was not changed in this slice.

### Tripwires

- Brutal honesty: PulsePlay is not yet at "no unknown errors." Current gaps include raw `err.message` responses in older connector routes, string-only UI errors, incomplete request-id propagation, and no shared problem envelope.
- P0 finding from this scan: `/responses-agent/*` appeared to be Databricks-backed and cost-bearing but was not mounted under the same auth/rate-limit/shared-key middleware family as the other AI routes. This is now closed by the 2026-05-17 Slice 1a hotfix above.
- Do not expose raw upstream errors, tokens, stack traces, SQL/schema details, or full provider bodies in viewer-facing copy. Use request id / trace id for support correlation instead.

---

## 2026-05-17 - Ask Pulse label + unified surface-tabs proposal

**Range:** Rajesh proposed treating BI as a peer surface beside AI work instead of a permanently separate default pane, using [Proposed_Preset_Templates.pdf](Proposed_Preset_Templates.pdf) as the sketch reference. He then added a Grammarly-style floating-bubble reference for keeping AI/Ask/BI helpers reachable while scrolling. The low-risk copy change shipped now; the BI-as-tab, companion-panel, and Pulse Bubble architecture are intentionally captured for review before code changes.

### What shipped

- Renamed the visible **Chat** surface to **Ask Pulse** across the Pulse viewer tab, setup wizard, Settings AI/Preferences selectors, and Power BI format-pane display strings. Internal `chat` keys are unchanged to avoid migration churn.
- Added a new [AGENT_SYNC.md](AGENT_SYNC.md) proposal entry mapping Rajesh's templates: T1 `AI Insights | Ask Pulse | BI Viz`, T2 future fused `AI/BI Insights | Ask Pulse | BI Viz`, T3 BI-only, T4 AI-Insights-only, and T5 Ask-Pulse-only.
- Added a follow-up AGENT_SYNC addendum for Rajesh's floating comparison idea: any primary tab should be able to show another surface as an in-app companion panel, distinct from the existing detached browser-popup `Float` action.
- Added a research-backed AGENT_SYNC decision candidate for a persistent **Pulse Bubble** launcher: a small right-edge/bottom-right helper that expands to `AI Insights`, `Ask Pulse`, `BI Viz`, and `Compare` actions while the user scrolls. It is a launcher, not another permanent toolbar and not the companion panel itself.
- Recommended collapsing the default **presentation** into a unified surface strip while keeping the BI adapter axis, AI connector axis, viewport controls, focused-page mode, and BI host lifecycle modular.

### Validation

- `playground`: `npm run lint` passed (`tsc --noEmit`).
- `playground`: full `npm run test -- --run` passed **552/552**.
- Repo: `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwires

- No BI architecture changed in this slice. The proposal still needs Claude/Rajesh review before introducing `BI Viz` as a unified surface tab.
- The floating comparison layer is proposal-stage only. Existing `Float` still means detached browser popup; no in-app overlay manager exists yet.
- The Pulse Bubble is proposal-stage only. If implemented, it must snap to safe anchors, avoid the text composer/setup pill/BI controls, support keyboard and Escape behavior, honor reduced motion/high contrast, and never obscure focused content.
- If BI becomes tabbed, do not unmount cross-origin iframes casually; preserve adapter state or keep the BI surface mounted while hidden.
- Keep split/focus review as an advanced preset because users still need side-by-side "ask while looking" workflows.

---

## 2026-05-17 - Databricks Launchpad + P2-P8 enablement

**Range:** Rajesh asked Codex to finish Claude's Databricks-centric P2-P8 handoff and to validate against the live Databricks workspace, not only against docs. This pass keeps PulsePlay as an enablement layer: discover and surface Databricks-native assets, but do not replace Databricks dashboards, Genie, SQL, Apps, Vector Search, or Unity Catalog.

### What shipped

- Added live Databricks enablement routes in [server.js](../proxy/server.js): Genie Spaces, AI/BI Lakeview dashboards, serving endpoints, Databricks Apps, SQL warehouses, UC metric views, metric-view detail, Vector Search query, and `databricks-aibi` embed-token flow. Normalization lives in [databricksEnablement.js](../proxy/lib/databricksEnablement.js).
- Added `/launchpad` with [LaunchpadShell.tsx](../playground/src/launchpad/LaunchpadShell.tsx): live asset cards for AI/BI dashboards, Genie Spaces, serving endpoints, Databricks Apps, and SQL warehouses. A Lakeview dashboard can be promoted into the active `databricks-aibi` BI surface.
- Added `databricks-aibi` and `databricks-genie` adapters in [bi-adapters](../bi-adapters). AI/BI supports iframe fallback plus optional `@databricks/aibi-client` runtime use when the SDK is installed and a scoped token is issued. Genie uses Databricks-generated iframe/src and sets `allow="clipboard-write"`.
- Added Settings › AI fields for Databricks Vector Search KB and UC Metric View. Vector Search now shows **Hibernating** when the workspace has zero endpoints so admins can preconfigure the target index.
- Added the first Evidence Drawer slice in [EvidenceDrawer.tsx](../playground/src/components/EvidenceDrawer.tsx): answer SQL and validation diagnostics are now inspectable in the AI sidebar.
- Added root [app.yaml](../app.yaml) and [DEPLOY_DATABRICKS_APP.md](DEPLOY_DATABRICKS_APP.md) for Databricks Apps resource-mode deployment.

### Live discovery

- Live workspace returned: **7 Genie Spaces**, **2 AI/BI dashboards**, **13 serving endpoints**, **1 Databricks App**, **1 SQL warehouse**, **0 Vector Search endpoints**, and metric views at `workspace.databrickspractice.vw_metric_superstore_analysis_flat` plus `main.dbdemos_aibi_customer_support.cost_metrics`.
- Live route smoke passed with `NODE_OPTIONS=--use-system-ca`: `/assistant/lakeview/dashboards`, `/assistant/genie/spaces`, `/assistant/serving-endpoints`, `/assistant/apps`, `/assistant/sql/warehouses`, and `/assistant/uc/metric-views`.
- Databricks CLI exists locally (`0.297.2`), but the configured auth profile was not valid. REST coverage was sufficient, so no CLI bridge was added.

### Validation

- `proxy`: `node --check server.js` passed.
- `proxy`: full `npm.cmd test -- --runInBand` passed **684/684**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: focused `npm.cmd test -- LaunchpadShell --silent` passed **2/2**.
- `playground`: full `npm.cmd test -- --silent` passed **552/552**.
- `playground`: `npm.cmd run build` passed.
- Browser smoke: current worktree served at `http://127.0.0.1:5174/launchpad`; page rendered `Databricks Launchpad` with live Databricks dashboard and Genie cards.

### Tripwires

- AI/BI external embedding is server-token-first. Service-principal secrets stay in the proxy; the browser only receives the user-scoped token.
- Genie iframe embedding is a Databricks beta/preview path. The list-spaces REST response did **not** return an embed URL in Rajesh's workspace, so PulsePlay requires the Databricks-generated Share › Embed iframe/src until Databricks exposes a stable embeddable URL in API results.
- Vector Search is intentionally hibernating in the live workspace because endpoint count is zero. The proxy route and Settings field are ready, but retrieval is not enabled until an approved index exists.
- Evidence Drawer is a first slice: SQL and diagnostics only. Dashboard widget SQL, UC lineage, metric-view YAML/details, and vector-source citations are still future work.

---

## 2026-05-17 - Databricks capability registry P1

**Range:** Picked up Claude's Databricks-native enablement handoff from `.claude/worktrees/gallant-jones-a71415/docs/CODEX_TASK_DATABRICKS_LAUNCHPAD.md` because the task file was not yet present in main `docs/`. Scoped this pass to P1 only: live capability discovery and one downstream UI gate.

### What shipped

- Added [databricksCapabilityRegistry.js](../proxy/lib/databricksCapabilityRegistry.js), a 5-minute TTL registry that probes Databricks Genie spaces, AI/BI Lakeview dashboards, serving endpoints, Databricks Apps, Vector Search endpoints, and jobs through the existing server-side `databricksRequest` helper.
- Replaced the placeholder [server.js](../proxy/server.js) `/assistant/capabilities` response with a probe-backed snapshot while preserving the old `ok`, `assistantProfile`, and `spaceId` fields for existing callers.
- Added [databricksCapabilities.ts](../playground/src/lib/databricksCapabilities.ts), a playground hook that fetches `/api/assistant/capabilities`, caches per-profile snapshots in `localStorage`, and broadcasts updates for other consumers.
- Gated Settings › AI › **Vector Search KB** in [AiGroup.tsx](../playground/src/settings/groups/AiGroup.tsx): it only renders when the capability registry says Vector Search is ready and endpoint count is greater than zero. On Rajesh's live workspace, the earlier probe found zero Vector Search endpoints, so the entry remains hidden.
- Added focused proxy and playground coverage for status normalization, profile-scoped TTL caching, route compatibility, hook caching/broadcast, and the Vector Search UI gate.

### Validation

- `proxy`: focused `npm.cmd test -- databricksCapabilityRegistry --runInBand` passed **5/5**.
- `proxy`: focused `npm.cmd test -- server --runInBand` passed **119/119**.
- `proxy`: combined focused `npm.cmd test -- databricksCapabilityRegistry server --runInBand` passed **124/124**.
- `proxy`: full `npm.cmd test -- --runInBand --verbose` passed **680/680**.
- `playground`: focused `npm.cmd test -- databricksCapabilities AiGroup --silent` passed **11/11**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --silent` passed **531/531**.
- `playground`: `npm.cmd run build` passed.
- Repo: `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwires

- This is P1 only. Launchpad, SDK-based AI/BI dashboard embed, Genie-as-surface, UC metric views, Vector Search retrieval, Databricks Apps deployment, and Evidence Drawer are still unshipped.
- The capability boolean represents “ready to show/use,” not merely “API route exists.” Example: Vector Search can have an available API but `capabilities.vectorSearch === false` when endpoint count is zero.
- The untracked `bi-adapters/databricks-aibi/` directory from Claude's branch was preserved and not folded into this P1 commit.

---

## 2026-05-16 - Pulse primary surface streamlined + backend canvas policy

**Range:** Rajesh pointed at the Pulse-mode BI Tool dropdown, the row-level `Open setup` button, the repeated BI source status, the visible `Console` button, the empty Pulse toolbar space, and the visible `BI tiles: 1 / 2 / 4` controls. The clarified IA: the top-right Setup pill and Settings/System surfaces own setup and operational review; the Pulse AI pane should stay focused on AI Insights and Chat, with compact pane actions available where the user is already looking.

### What shipped

- Removed the entire Pulse-mode BI source row from [App.tsx](../playground/src/App.tsx). The BI pane subtitle and top-right Setup pill already communicate the active/missing BI state.
- Removed the visible `Console` trigger from the Pulse visual header in [visual.tsx](../playground/src/pulse/visual.tsx). Developer Tools internals remain available to exceptional flows that open them programmatically, but they are no longer first-class viewer chrome.
- Added a compact Pulse header action cluster next to AI Insights / Chat: Maximize or Restore, Minimize, Open in separate page, and Refresh AI pane. In Pulse mode the outer AI PaneChrome action toolbar stays quiet to avoid duplicate controls, and the right-side run-state/progress slot remains reserved for configured Insights runs.
- Removed the visible `BI tiles: 1 / 2 / 4` toolbar from the BI canvas. Tile count is now backend/admin policy via `allowlist.display.biTileMode` (`1`, `2`, or `4`; default `1`), surfaced read-only in Settings › BI/Preferences and documented in [SETTINGS_SPEC.md](SETTINGS_SPEC.md).
- Updated the empty BI pane copy for Pulse mode so it points users to the top-right Setup pill instead of a non-existent left-side picker.
- Added viewport regression assertions that the Pulse-mode surface contains no BI source row, no local setup text, no visible `Console` text, no visible BI tile toolbar, and the new AI pane icons.
- Updated [AGENT_SYNC.md](AGENT_SYNC.md) so Claude reviews this as part of the setup/readiness IA consolidation.

### Validation

- `playground`: `npm.cmd run lint` passed.
- `playground`: focused `npm.cmd test -- viewportControls SettingsShell leafLabels leafScrollAndChips --silent` passed **43/43**.
- `playground`: full `npm.cmd test -- --silent` passed **503/503**.
- `playground`: `npm.cmd run build` passed.
- `proxy`: focused `npm.cmd test -- allowlist configValidator --runInBand` passed **22/22**.
- `proxy`: focused `npm.cmd test -- server --runInBand` passed **119/119**.
- `proxy`: full `npm.cmd test -- --runInBand` passed **675/675**.
- Repo: `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwire

- Pulse mode should stay streamlined: configuration belongs in Settings › Setup, reached from the top-right setup pill. Do not reintroduce local BI source rows, local setup buttons, or visible Console chrome into the primary AI pane unless Settings stops being the source of truth.
- BI tile count is not a casual viewer toggle. Keep it backend-governed unless Rajesh explicitly asks for an admin-only or author-only override workflow.

---

## 2026-05-16 - Setup pill + Settings setup tree

**Range:** Rajesh refined the previous IA direction: keep a single top-right pill, but make it a setup/readiness entry that opens one Settings setup tree. The old Pulse-owned `Not connected | Managed` status pill stays retired; the new app-owned pill is configuration readiness, not duplicate console chrome.

### What shipped

- Added [setupReadiness.ts](../playground/src/settings/setupReadiness.ts), a shared BI+AI readiness model used by the app header and Settings.
- Added [SetupGroup.tsx](../playground/src/settings/groups/SetupGroup.tsx) and made `/settings` default to `/settings/setup`. The tree now has **Setup / BI / AI / Preferences / System / Advanced**.
- Added a compact top-right setup pill in [App.tsx](../playground/src/App.tsx). It shows `Ready` or `Setup needed`, names the missing BI/AI items, and opens Settings › Setup.
- Repointed Pulse Console handoffs and the Pulse BI source row to Settings › Setup, so Console remains operational: diagnostics, session log, SQL trace, status.
- Removed the unused floating settings gear/toggle code from [App.tsx](../playground/src/App.tsx) to match the visible IA: one setup entry, no duplicate configuration popovers.
- Added regression coverage for the readiness helper, Settings setup leaf dictionary/scroll ids, default settings route, and the top-right setup pill.
- Researched the next interaction-workbench lane and added it to [AGENT_SYNC.md](AGENT_SYNC.md): pane controls, chart-focus mode, AI-assisted focused review, custom visual rendering over governed semantic data, and Databricks/Power BI security constraints.

### Validation

- `playground`: `npm.cmd run lint` passed.
- `playground`: focused `npm.cmd test -- settingsRoute SettingsShell leafLabels leafScrollAndChips setupReadiness viewportControls --silent` passed **55/55**.
- `playground`: full `npm.cmd test -- --silent` passed **502/502**.
- `playground`: `npm.cmd run build` passed.
- Repo: `git diff --check` passed after removing a trailing blank line at EOF in [App.tsx](../playground/src/App.tsx).

### Tripwires

- The new pill is app chrome, not Pulse visual chrome. Do not re-add `gn-header-right` fixed status pills inside Pulse; that was the overlap source.
- The semantic-layer/custom-visual idea is feasible, but only as a governed data mode. Databricks is the stronger strategic path; Power BI semantic-model querying is useful as a bridge but has Build-permission, RLS, service-principal, tenant-setting, row-count, and API-limit constraints.

---

## 2026-05-16 - Settings owns configuration; Console owns status

**Range:** Rajesh first pointed at the floating top-right `Not connected | Managed` pill and suggested moving it into the center console. Then he clarified the stronger IA rule: do not keep duplicated setup functionality; the full-page Settings surface is the best organized place, so configuration should live there.

### What shipped

- Removed the Pulse status/scope pills from the global top-right chrome in [visual.tsx](../playground/src/pulse/visual.tsx). The outer [App.tsx](../playground/src/App.tsx) header is now just product branding; no fixed Pulse pill competes with pane controls.
- Added an in-pane **Console** trigger in the Pulse header row. It opens the centered Developer Tools surface for connection status, scope chips, diagnostics, session log, SQL trace, and a handoff to Settings.
- Retired the Console **Setup** and **Display** editing paths from the reachable UI. Console is now observe/debug; Settings is now change/configure.
- Added [pulseVisualSettingsStore.ts](../playground/src/settings/pulseVisualSettingsStore.ts) so Settings can read/write Pulse's legacy `pulseplay:visual-settings:genieSettings` namespace without routing users through the old Pulse setup form.
- Replaced the old Settings `AI Insights setup ↗` placeholder with a real **Settings › AI › AI Insights** editor for enabled surfaces, authoring mode, domain, custom prompt, domain guidance, custom sections JSON, stage toggles, metric direction rules, metric direction JSON, provenance footer, cache TTL, and stage overrides.
- Updated the Settings provider picker so `activeAiProfile` also mirrors to Pulse runtime `genieSettings.assistantProfile`; App listens for `pulseplay:visual-settings-change` and refreshes PulseShell.
- Removed the old focused-pane right-side collision reserve that only existed for the fixed pill; viewport regression now asserts compact focused chrome.
- Captured the Canva sidecar reference board for review: view `https://www.canva.com/d/HXhoCHxftKjXL2H`, edit `https://www.canva.com/d/I36eapmNBwl0UTq`, design ID `DAHJ1oFh42k`.
- Updated [AGENT_SYNC.md](AGENT_SYNC.md) so Claude can review the IA consolidation as the current LIFO item.

### Validation

- `playground`: focused `npm.cmd test -- AiGroup leafLabels viewportControls PulseShell --silent` passed **40/40**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --silent` passed **496/496**.
- `playground`: `npm.cmd run build` passed.
- Repo: `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.
- Dev server smoke: `http://127.0.0.1:5173/` returned HTTP **200**.

### Tripwires

- Browser automation tooling was not exposed in this session, so this slice has code/test/build/HTTP smoke but not an attached screenshot.
- The old Pulse setup components still exist in `visual.tsx` as compatibility code, but the reachable UI path is retired. A later dead-code cleanup can delete the legacy setup editor once Settings covers every long-tail field.
- The Console trigger is inside the Pulse pane. If the AI pane is hidden, users use Settings › Preferences or the fixed Settings entry point to restore it.

---

## 2026-05-16 - Wizard repeat-ask and settings polish closeout

**Range:** Rajesh asked Codex to close the gaps found after Claude's latest changes and make Claude aware through `AGENT_SYNC.md`.

### What shipped

- **Wizard `Done & ask` repeat-safety** - [AISidebar.tsx](../playground/src/components/AISidebar.tsx) now accepts either the legacy string auto-submit value or an `AutoSubmitQuestionEvent` with `{ id, question }`. [App.tsx](../playground/src/App.tsx) now increments an event id for each wizard completion, so a later wizard run can intentionally submit the same suggested question again instead of being suppressed as a duplicate render.
- **Forced wizard zero-vendor guard** - [FirstRunWizard.tsx](../playground/src/components/FirstRunWizard.tsx) now treats `vendorsAvailable=false` as a hard prerequisite even when `WIZARD_FORCE_KEY` is set, preventing a dead-end setup flow when no BI vendor is visible/allowlisted.
- **Settings copy-link polish** - [BiGroup.tsx](../playground/src/settings/groups/BiGroup.tsx) now uses plain `Copy link` / `Copied` labels instead of visible emoji-style glyphs, keeping the Settings surface closer to the enterprise UI tone.
- **Claude handoff** - [AGENT_SYNC.md](AGENT_SYNC.md) has a LIFO claim/done entry plus a top review task asking Claude to verify this patch.

### Validation

- `playground`: focused `npm.cmd test -- FirstRunWizard AISidebar leafScrollAndChips --silent` passed **73/73**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --silent` passed **494/494**.
- `playground`: `npm.cmd run build` passed.
- Repo: `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwires

- This was a browser-side polish/behavior closeout only; proxy behavior was not changed.
- A live browser click-through was not run in this slice. Unit/integration coverage verifies the regression conditions, but a human smoke of wizard re-run + same suggested question is still useful before pilot demo.

---

## 2026-05-16 - 4-step first-run wizard + P1 security hardening + 5-track roadmap

**Range:** Rajesh asked to replace the empty-state placeholder with a proper progressive setup wizard ("more fun, work, trendy, and friendly for the author"), then for an end-to-end roadmap that keeps Databricks-forward without locking us into Databricks-only. Codex ran a parallel scan; the wizard P1 risks were closed in the same session.

### What shipped

- **`playground/src/components/FirstRunWizard.tsx`** (commit `4ba76b3`) — Full-bleed 4-step modal: Welcome+Persona / Choose tools / Connect+probe / Explore+suggested-Q. Persona presets (Analyst / Executive / Developer / Designer) seed `uiMode` + `layoutMode` + connector hint. Right-side step rail (done/active/future), CSS-only slide+fade transitions, draft persistence to `pulseplay:wizard-draft`, focus-trap, aria-live step announcements. "Just give me defaults" fast-lane. 30 new vitest cases.
- **Settings → System → "Re-run setup wizard"** (commit `4ba76b3`, hardened in `735eb87`) — Re-arms the wizard from any user state. Now uses `forceWizard()` which sets `WIZARD_FORCE_KEY` so `shouldShowWizard()` bypasses the `hasEmbedConfig`/`hasConnector` gate.
- **App.tsx handleWizardComplete** — persona seeds `uiMode` + `layoutMode` on Done. `autoAsk` + `suggestedQuestion` collected but not yet wired to `AISidebar.ask()` (deferred).
- **P1 wizard security hardening** (commit `735eb87`) — closes 4 RISK-P1 findings from Codex's Part 4 scan:
  - 4.1 Draft schema validation in `loadDraft()` — persona checked against `VALID_PERSONA_KEYS`, step clamped 0–3, vendor/connector must be non-empty strings.
  - 4.3 Focus trap leakage — hidden StepPanes get `inert=""` attribute (descendants no longer in tab order).
  - 4.4 Probe URL bypassing Vite proxy — always `POST /api/assistant/probe`, dropped the `GET /foundation/health` direct fetch.
  - 4.5 Re-run wizard broken — new `WIZARD_FORCE_KEY` + `forceWizard()` export; force flag consumed by `clearDraft()` (Done/Skip).
- **`docs/ROADMAP.md`** (commit `5a57e7c`) — reorganized around 5 parallel TRACKS (Foundation / Surface / Reasoning / Experience / Trust). Each track lists current DONE state, next milestones (parallel, no internal ordering), "What stays modular" rule, and an explicit "Non-Databricks proof point". 8 modularity guarantees codified at the bottom. Cross-track dependencies marked LOOSE vs HARD. Legacy v0.x version labels preserved at the bottom as backward-compat mapping.
- **`docs/AGENT_SYNC.md`** updates — `[DONE]` entries for wizard + P1 hardening, `[REVIEW-RESPONSE]` to Codex's Q1–Q5 (most accepted; pushed back on `InsightSurfaceAdapter` rename; Codex accepted the pushback), 17-row FEATURE-MAP showing every shipped feature's forward role, Codex prompt with 4 structured parts (strategy review, feature-map audit, lane claim, security scan).
- **Codex shipped in parallel** (commits `ecb41c2`, `9aac3f7`, `2521c6c`, `398ae65`, `bbff841`, `38ce270`): `DATABRICKS_FORWARD_STRATEGY.md`, `MODULAR_INTEGRATION_ARCHITECTURE.md`, `STRUCTURED_AUTHORING_STANDARD.md`, `CHAT_VISUALIZATION_KNOWLEDGE_BASE.md`, `KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md`, `AI_CONTEXT_CONFIGURATION_MODEL.md`, `SETUP_SETTINGS_RELATIONSHIP_AUDIT.md`, plus textarea-depth polish in `FirstRunWizard.tsx`. Claude reviewed each and posted accept/refine/challenge positions in AGENT_SYNC.

### Validation

- `npx vitest run --silent` → **478/478** playground tests green (was 437 at session start).
- `npx tsc --noEmit` → clean.
- New devDep added: `@testing-library/react` + `@testing-library/user-event`.
- `GROUP_LEAF_LABELS.system` updated to include `"Setup wizard"` (drift-prevention test green).

### Tripwires

- **Phase 11b dispatcher migration is still open** and is genuinely sensitive — migrating `proxy/server.js` Genie route at line 2382 from `wrapAsGenieUserMessage` to `buildBackendPayload` will change user-visible Genie output for `cpg-fmcg/supply-chain` (the one pack with authored `prompt-ir.yaml`). The route-level test at `proxy/tests/conversationsStartPackContext.test.js:176` asserts the OLD `[Pack Context: ...]` prefix, which the authored-IR translator path replaces with structured `[Persona]` / `[Vocabulary]` / `[Guardrails]` blocks. Migration requires updating that test AND live smoke before pilot. **Do not ship blind.**
- The wizard's `autoAsk` + `suggestedQuestion` fields are collected on Done but currently dropped in `handleWizardComplete`. Wiring them through `AISidebar.ask()` is a separate cycle.
- `WIZARD_FORCE_KEY` is single-use (consumed by `clearDraft()` on Done/Skip). If a user clicks "Re-run", refreshes mid-wizard without completing, then refreshes again, the wizard re-appears (force flag still set). This is by design — re-runs are sticky until the user finishes or explicitly skips.
- Codex's research docs (`KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md`, `MODULAR_INTEGRATION_ARCHITECTURE.md`, etc.) are planning baselines, NOT shipped runtime. Don't treat their proposals as built code.

---

## 2026-05-16 - Knowledge Base source governance across all modules

**Range:** Rajesh asked to validate source authenticity and extend credible, accountable provenance across all Knowledge Base modules, not only the Chat visualization KB.

### What shipped

- Engaged two read-only research agents:
  - Chat visualization validation: checked chart rules against official Power BI, Tableau, Databricks, Vega/Vega-Lite, WCAG, and visualization research sources.
  - Knowledge Base provenance: checked all current module types and recommended source-card, provenance, confidence, review-state, and linter requirements.
- Added [docs/KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md) with source-card model, credibility tiers, module-by-module requirements, runtime metadata additions, reviewer workflow, and pack-linter baseline.
- Updated [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md) so every KB module has explicit provenance expectations.
- Updated [docs/KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) to add owner/author/publisher/sourceIds/confidence/source-tier metadata to the conceptual runtime contracts.
- Expanded [docs/CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](CHAT_VISUALIZATION_KNOWLEDGE_BASE.md) with a richer source register, source-accountable Chat answer format, and stronger `ChartKnowledgeRule` fields.
- Updated [pulsepacks/cpg-fmcg/knowledge-base/references.md](../pulsepacks/cpg-fmcg/knowledge-base/references.md) to demonstrate source-card tables for standards/identifiers and sustainability frameworks.
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) with a Claude handoff and LIFO review task.

### Validation

- `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwires

- This is a governance/documentation slice, not a runtime validator yet.
- The CPG/FMCG reference file is only partially converted to source-card tables; remaining research sections still need conversion.
- Do not let Chat/AI Insights treat chart rules, prompt IR, prompt context, or KPI formulas as runtime authority until source IDs or SME review state exist.

---

## 2026-05-16 - Chat visualization knowledge base and Claude handoff add-on

**Range:** Rajesh asked to add a Chat knowledge base covering rules for legacy and modern charts commonly used in current BI/AI dashboard solutions, and to communicate the same to Claude through `AGENT_SYNC.md`.

### What shipped

- Added [docs/CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](CHAT_VISUALIZATION_KNOWLEDGE_BASE.md) as a Chat-facing visualization rule baseline.
- The doc covers question-to-chart families, chart-specific use/avoid rules, legacy-to-modern migration rules, modern dashboard composition rules, persona defaults, and a proposed `ChartKnowledgeRule` runtime shape.
- Updated [docs/ARCHITECTURE.md](ARCHITECTURE.md) to cross-link the new knowledge base from related architecture docs.
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) with a Claude handoff, Active Claim, and LIFO next task asking Claude to challenge the list and choose the storage shape.

### Validation

- `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.

### Tripwires

- This is not a runtime Chat feature yet. The next step is deciding whether the chart rules live as static TypeScript seed data, PulsePack YAML, or `DomainContextProfile.visualizationGuidance`.
- First consumer should be Chat recommendation/critique. Do not jump straight into renderer work before the rule storage shape is stable.

---

## 2026-05-16 - Common AI context model for domain, presets, metrics, Insights, and Chat

**Range:** Rajesh flagged repeated selection options across custom domain, preset strategy, and metric configuration, and asked that Knowledge Base-derived settings be grouped into common + AI Insights-specific + Chat-specific surfaces.

### What shipped

- Added [docs/AI_CONTEXT_CONFIGURATION_MODEL.md](AI_CONTEXT_CONFIGURATION_MODEL.md) as the canonical planning note for one Knowledge Base-derived domain context feeding AI Insights and Chat.
- Updated [playground/src/pulse/setupStep5.tsx](../playground/src/pulse/setupStep5.tsx) so domain options are derived from core domains plus custom-section preset domains plus metric-rule preset domains.
- `CustomSectionPresetPicker` and `MetricDirectionPresetPicker` now group presets related to the selected domain ahead of other presets.
- `MetricKnowledgeBaseEditor` now receives the current domain and can let a metric preset seed `insightsDomain` when the author has not picked one.
- Section A in advanced setup is now shared `Common AI context`, with a common-context subgroup and an AI Insights output-strategy subgroup; the Chat tab sees the shared context and a Chat inheritance note instead of hiding the shared guidance under AI Insights.
- Added small subgroup styling in [playground/src/pulse/style/visual.less](../playground/src/pulse/style/visual.less).
- Added [setupStep5DomainPresets.test.ts](../playground/src/pulse/__tests__/setupStep5DomainPresets.test.ts) so future preset-pack changes cannot silently drift away from the visible domain picker.
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) with a Claude handoff: review the model and choose whether the next slice should be `DomainContextProfile` from pack metadata or Chat carry-forward from AI Insights.

### Validation

- `git diff --check` passed with only expected LF-to-CRLF working-copy warnings.
- `playground`: focused `npx vitest run src/pulse/__tests__/setupStep5DomainPresets.test.ts --silent` passed **3/3**.
- `playground`: `npm.cmd run lint` passed.
- `playground`: full `npm.cmd test -- --silent` passed **470/470**.
- `playground`: `npm.cmd run build` passed.

### Tripwires

- This is still not a runtime Knowledge Base source of truth. The UI now derives from existing preset libraries; the next step is a real `DomainContextProfile` built from active pack/sub-vertical metadata.
- Chat should borrow AI Insights strengths, but it should not be forced through the AI Insights staged-briefing pipeline. Chat stays conversational; both surfaces share context.

---

## 2026-05-16 - Setup/settings relationship audit and control depth

**Range:** Deep research pass on how setup options, connector choices, presets/templates, knowledge packs, and the Settings tree relate to each other, plus Rajesh's request to make dropdowns/textareas easier to see and pick from.

### What shipped

- Added [docs/SETUP_SETTINGS_RELATIONSHIP_AUDIT.md](SETUP_SETTINGS_RELATIONSHIP_AUDIT.md) as the relationship-map baseline for setup/settings UX, connector readiness, state ownership, and progressive setup flow.
- Added subtle shared depth treatment for dropdowns, inputs, and textareas in [playground/src/styles.css](../playground/src/styles.css), including raised shadow, inset highlight, hover state, focus ring, and textarea writing-line background.
- Updated the first-run wizard suggested-question textarea in [playground/src/components/FirstRunWizard.tsx](../playground/src/components/FirstRunWizard.tsx) with the same depth/focus direction.
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) with a Claude handoff: review the audit, challenge the state-owner map, and pick either the BI Embed mode-card slice or the smallest setup/capability facade slice.

### Validation

- `git diff --check` passed; Git emitted expected LF-to-CRLF working-copy warnings only.
- `playground`: `npm.cmd run lint` passed.
- `playground`: focused `npx.cmd vitest run src/components/__tests__/FirstRunWizard.test.tsx --silent` passed **30/30** after repairing the local `node_modules` install with `npm.cmd install`.
- `playground`: full `npm.cmd test -- --silent` passed **467/467**.
- `playground`: `npm.cmd run build` passed.
- Live Vite smoke: started `npm.cmd run dev -- --host 127.0.0.1`, verified `http://127.0.0.1:5173/` returned the root page, then shut the server down.

### Tripwires

- The audit is not an implementation of the new setup model. State ownership is still split across App, Settings, embed store, wizard draft state, and Pulse visual settings.
- Power BI remains the only real BI SDK adapter today. Tableau/Qlik/Looker must still be presented as limited iframe fallbacks until their SDK/token routes graduate.
- The depth styling is intentionally subtle. If future visual review says it is too heavy, tune the shared `--pp-control-*` variables rather than one-off overrides.

---

## 2026-05-16 - Modular integration architecture research

**Range:** Deep-research planning pass for Rajesh's "integrated yet modular, progressive, addable/removable building blocks" direction, plus the follow-up requirement that prompt/guidance textareas become structured, aesthetic, middleware-aligned authoring surfaces.

### What shipped

- Added [docs/MODULAR_INTEGRATION_ARCHITECTURE.md](MODULAR_INTEGRATION_ARCHITECTURE.md) as the planning baseline for a stable spine plus swappable blocks.
- Captured the capability-registry proposal, block manifest/lifecycle, add/remove protocol, linear-plus-wide-spectrum roadmap, memory/state position, and next architecture cycle.
- Added [docs/STRUCTURED_AUTHORING_STANDARD.md](STRUCTURED_AUTHORING_STANDARD.md) so prompt/guidance fields use standard sections, parameter chips, validation, and compiled middleware previews instead of blank textareas.
- Cross-linked the new doc from [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) so Claude can review/challenge the plan before implementation starts.

### Validation

- Documentation-only change. `git diff --check` passed; Git emitted expected LF-to-CRLF working-copy warnings only.

### Tripwires

- This is an architecture plan, not implementation. The highest-risk missing piece is still the server-owned capability registry; without it, modularity remains mostly convention.
- Launchpad should consume registry decisions when it is built, otherwise it will become another hardcoded surface picker.
- Structured authoring should be implemented as one reusable editor family. One-off prompt textareas will recreate the current drift.

---

## 2026-05-16 - Databricks-forward canonical strategy and Codex risk scan

**Range:** Followed the structured prompt in [docs/AGENT_SYNC.md](AGENT_SYNC.md) after Claude's wizard + strategy response.

### What shipped

- Added [docs/DATABRICKS_FORWARD_STRATEGY.md](DATABRICKS_FORWARD_STRATEGY.md) as the canonical Databricks-forward, bridge-friendly, adapter-safe strategy.
- Cross-linked the strategy from [docs/ARCHITECTURE.md](ARCHITECTURE.md), [docs/ROADMAP.md](ROADMAP.md), and [docs/SETTINGS_SPEC.md](SETTINGS_SPEC.md).
- Updated [docs/AGENT_SYNC.md](AGENT_SYNC.md) with Codex's review of Claude's Q1-Q5 strategy responses, the FEATURE-MAP audit, the lane claim, and the wizard security scan.

### Validation

- `git diff --check` for touched tracked docs: clean.
- `playground`: `npm.cmd run lint` → clean.

### Tripwires

- The wizard security scan found P1 issues that should be fixed before pilot: draft validation, focus-trap leakage, re-run wizard gating, and foundation probe path/lifecycle behavior.
- I intentionally did not edit `FirstRunWizard.tsx`, its tests, `App.tsx` runtime code, or `proxy/server.js`; those are handed off in AGENT_SYNC for a separate focused lane.

---

## 2026-05-16 - Databricks-forward option strategy draft

**Range:** planning-only update requested by Rajesh for agent-to-agent discussion.

### What shipped

- Added a discussion draft to [docs/AGENT_SYNC.md](AGENT_SYNC.md): **Strategic Planning Note — Option-Aware Databricks-Forward Posture**.
- Captured the new planning frame: Power BI is current-state / transition bridge, Databricks-native assets are the likely destination, and PulsePlay must preserve shift-left and shift-middle optionality instead of becoming brittle.
- Added explicit review questions for the other agent before mirroring anything into canonical docs.

### Validation

- Documentation-only change. No code or tests changed.

### Tripwires

- This is not yet a canonical architecture decision. Mirror into `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and `docs/SETTINGS_SPEC.md` only after Rajesh and the other agent agree on the wording.

---

## 2026-05-14 - Beast-mode catchup: Allowlist P1, BI Phase B, PaneChrome Fix #1+#2, getMetadata stubs, rename

**Range:** Rajesh switched to single-agent beast mode ("you take care of everything don't depend on codex for now"). Six lanes shipped back-to-back in this session.

### What shipped

- **Allowlist fail-closed (P1)** — commit `30b2e21`. settingsStore + App.tsx + BIPanel now distinguish dev-unconfigured (`allowlist?.configured === false`, permissive) from governance-fetch-failed (`allowlist === null && allowlistError !== null`, refuse). New `isAllowlistFailClosed(state)` helper. Reducer `allowlist/error` no longer blows away the prior allowlist on refresh failure — only first-load failure flips to fail-closed. BIPanel: new `allowlistFailClosed` prop refuses to mount when set; late-arriving restrictive allowlist destroys an already-mounted adapter. App.tsx error banner differentiates the two states with `role="alert"` vs `role="status"`. +9 tests (6 settingsStore + 3 BIPanel.failClosed).
- **BI Live Controls Phase B** — commit `923c192`. App.tsx adopts `useEmbedConfig()` from the dedicated store. Pulse sidebar inline EmbedConfigForm retired in favor of a status row + deep-link to `/settings/bi/embed`. Edits in Settings live-update the playground without a refresh, including cross-tab via the storage event. **Behavior change:** embedConfig now persists across reloads via localStorage. The Settings BI Embed leaf's "refresh to apply" note is gone.
- **PaneChrome Fix #1 + Fix #2** — commit `eb5820b`. Fix #1: Minimize / Pin/Unpin / Open-in-separate-page collapse into a single `⋮` overflow menu with proper menuitem semantics. Maximize/Restore + Both stay inline. Fix #2: new `quiet` prop on PaneChrome hides the toolbar entirely when the pane has nothing to operate on (App.tsx wires `quiet={!hasEmbedConfig}` on the BI pane). All aria-labels preserved exactly. Integration test updated with an `openOverflowFor()` helper + the seeded embedConfig in beforeEach so the BI chrome's toolbar isn't quiet for viewport assertions.
- **GenericIframeAdapter.getMetadata() = null** — commit `0ea3ed0`. Iframe-only adapters (generic-iframe + Tableau/Qlik/Looker stubs) now have an explicit `async getMetadata(): Promise<BIMetadata | null> { return null }` instead of omitting the method. TypeScript discoverability; honest contract documenting why iframe adapters can't introspect. PowerBIAdapter's real implementation continues to override.
- **"AI Assistant" / "Pulse assistant" → "PulsePlay AI"** — commit `7c1bc28`. Disambiguates the PulsePlay sidebar from the Power BI Copilot panel that may render inside the embedded report. Title in AISidebar.tsx + PaneChrome subtitle in App.tsx updated. Viewport-control aria-labels untouched (they refer to the pane axis, not the product).
- (Earlier in session, before beast mode) **Support bundle redaction P2** — commit `16b5ee3`. `redactDeep()` walker closes 3 leak paths: nested JSON localStorage values, diagnostic event payloads, `proxy.health`. +7 tests.

### Validation (cumulative through `7c1bc28`)

- Full playground vitest: **423/423** green (was 412 at session start; +11 net).
- `npx tsc --noEmit`: clean.
- Proxy unchanged at 658/658 (no proxy edits this session).

### Tripwires

- **Recurring "stale-rollback" diff in the primary worktree** if FF'd from a sibling via `git update-ref`. The fix is to FF from the primary worktree itself via `git merge --ff-only`. Codex independently flagged this earlier in the session; the recovery is `git reset --hard <SHA>` in the primary. Working tree is now refreshed and clean.
- **RISKS card red-up paradox** still pending Rajesh's decision (3 options outlined in chat). Do not ship the bp-delta prompt-IR tweak in isolation — it papers over the visual paradox.
- **Live credentialed smoke** still needed against an org Power BI report + Genie/Supervisor profile + enterprise IdP JWKS before pilot. No code work blocks this.

---

## 2026-05-14 - PaneChrome visual-weight tightening (CSS-only)

**Range:** Rajesh feedback "the interface is really looking unprofessional now" → CSS-only response, no behavior change. Does NOT consolidate Maximize/Minimize/Pin/Page into an overflow menu — that stays Codex's Fix #1 lane in `docs/AGENT_SYNC.md`.

### What shipped

- Tightened `PaneChrome` inline styles in [playground/src/App.tsx](../playground/src/App.tsx): smaller buttons (`fontSize 12→11`, `minHeight 28→22`, padding `0 9px→0 7px`), lighter borders (`rgba(0,0,0,0.14)→0.10`), subtle ghost background, softer text color (`#111827→#374151`). Header padding `7px→5px` vertical, gap `10→8`, title `fontSize 12→11.5` + `fontWeight 700→600`. Toolbar gap `6→4`. Right-side reserve in focused mode clamped to `min(200px, 50vw)` (was 228px).
- **No behavior changes.** All `aria-label`, button text, `data-testid`, and event handlers preserved.
- Loosened a brittle exact-string padding assertion in [viewportControls.integration.test.tsx](../playground/src/__tests__/viewportControls.integration.test.tsx) to a regex matching the clamped-gutter pattern. The contract (right-side reserve exists in focused mode) still passes; pixel values are no longer asserted.
- Commit: `e509994`.

### Validation

- `playground`: `npx vitest run src/__tests__/viewportControls.integration.test.tsx` → 15/15
- `playground`: `npx vitest run --silent` (full) → **403/403**
- `playground`: `npx tsc --noEmit` → clean

### Tripwires

- Rajesh flagged a follow-up UX concern: a red ↑ arrow on a metric that grew (e.g., "Profit ↑ 14.2%" shown red because it lags Sales 20.4%). The color follows risk severity, not metric direction — by design but genuinely confusing. Options 1/2/3 outlined in chat (suppress directional ↑ in RISK context; amber for "growing-but-lagging"; or two-row card). Decision pending; do not ship the bp-delta prompt-IR tweak in isolation — it papers over the visual paradox.

---

## 2026-05-14 - BI Live Controls Phase A (Settings is canonical authoring)

**Range:** Rajesh prompt "didn't we talk about moving this to setting page?" → Phase 3 / Settings IA review fix #6 (Phase A only, no merge with Codex's Allowlist lane). Phase B (App.tsx adopts `useEmbedConfig`; Pulse sidebar inline form replaced by status row + deep-link) is queued for Codex after Allowlist.

### What shipped

- New module [playground/src/settings/embedConfigStore.ts](../playground/src/settings/embedConfigStore.ts): dedicated `BIEmbedConfig` store. `localStorage` key `pulseplay:bi-embed-config`. Window event `pulseplay:embed-config-change`. Subscribes to cross-tab `storage` events. Exports `getEmbedConfig()` / `setEmbedConfig()` / `useEmbedConfig()` hook + `__resetEmbedConfigStore()` test seam. **Intentionally separate from `settingsStore.tsx`** to avoid merge collision with Codex's open Allowlist lane.
- [playground/src/settings/groups/BiGroup.tsx](../playground/src/settings/groups/BiGroup.tsx): Embed leaf now renders `<EmbedConfigForm>` reading from the store; Authentication leaf surfaces live tokenMode/groupId/report id; Canvas leaf surfaces tile mode. **3 of 4 PhaseStubs gone.**
- 15 new tests in `embedConfigStore.test.tsx` covering getter/setter/clear/cross-tab events/non-object defence/cache semantics.
- Commit: `f20b00f`.

### Validation

- `playground`: `npx vitest run src/settings/__tests__/embedConfigStore.test.tsx` → 15/15
- `playground`: `npx vitest run --silent` (full) → **403/403** (was 388; +15)
- `proxy`: unchanged at 658/658

### Tripwires

- **Two authoring surfaces exist until Phase B.** Both the Pulse sidebar inline form and the new Settings Embed leaf write to their own state. The store broadcasts a `pulseplay:embed-config-change` event; App.tsx does not yet consume it (Phase B work). Authoring in one surface does not live-update the other — refresh after editing in Settings to apply.

---

## 2026-05-14 - Focused pane chrome overlap closeout

**Range:** follow-up to Rajesh's screenshot where `Restore / Minimize / Pin / Page` overlapped the fixed `Connected | Managed` Pulse status pill in focused pane mode.

### What shipped

- Merged the focused-mode `PaneChrome` fix in [playground/src/App.tsx](../playground/src/App.tsx): focused AI/BI headers reserve a right-side collision zone for the fixed Pulse status pill and the controls toolbar can shrink/wrap instead of painting under it.
- Added focused-mode regression coverage in [viewportControls.integration.test.tsx](../playground/src/__tests__/viewportControls.integration.test.tsx) so the reserved header padding and wrapping controls stay locked.
- Synced the tactical handoff in [docs/AGENT_SYNC.md](AGENT_SYNC.md); Claude committed the code/doc merge as `d56e81a`.

### Validation

- `playground`: `npm.cmd test -- viewportControls.integration --silent` -> 15/15
- `playground`: `npm.cmd run lint`
- `playground`: full `npm.cmd test -- --silent` -> 388/388
- `playground`: `npm.cmd run build`

### Tripwires

- Browser screenshot smoke was not run in this Codex pass because Browser/Playwright tooling is not available in the current workspace. The regression is covered at DOM/style level; a live browser pass should still be done when browser tooling is available.
- The status pill remains fixed by the Pulse visual layer. This fix reserves shell chrome space around it; it does not move the Pulse visual's fixed header-right element.

---

## 2026-05-14 - Production auth hardening

**Range:** P0 security lane from `docs/AGENT_SYNC.md`; scoped to proxy auth mode, startup refusal, request rejection audit, and deploy docs.

### What shipped

- Added explicit `PROXY_AUTH_MODE` handling in [proxy/server.js](../proxy/server.js): `idp`, `shared-key`, `idp-or-shared-key`, and `none`.
- Production auth is now fail-closed: `NODE_ENV=production` or `PROXY_REQUIRE_AUTH=true` refuses `PROXY_AUTH_MODE=none` and refuses startup unless IdP verification or a shared-key fallback is configured.
- Preserved dev/test ergonomics: no auth remains `none`; a configured legacy shared key still gates requests as `shared-key`.
- Reused the IdP claim mapping chain for `email`, `preferredUsername` / `preferred_username`, and `upn`; Power BI RLS claim aliases remain aligned.
- Auth rejection paths now audit machine-readable reasons: `auth.missing-idp`, `auth.missing-shared-key`, and combined `auth.missing-idp,auth.missing-shared-key`.
- Updated [docs/SECURITY.md](SECURITY.md) and [docs/DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md) with the new mode/defaults.

### Validation

- `proxy`: `node --check proxy/server.js`
- `proxy`: `npm.cmd test -- productionAuth` -> 16/16
- `proxy`: `npm.cmd test -- server --runInBand` -> 119/119
- `proxy`: full `npm.cmd test` -> 646/646

### Tripwires

- `idp-or-shared-key` allows either verified IdP claims or a shared key. If the enterprise wants every browser request tied to a real user identity, deploy `PROXY_AUTH_MODE=idp`.
- Live IdP JWT verification was not smoke-tested against a real enterprise JWKS in this lane; the request enforcement and startup validation are covered with unit/integration tests.

---

## 2026-05-14 - Playground viewport controls and clean validation

**Range:** AI/BI pane comfort pass for the literal playground experience.

### What shipped

- Added per-pane control chrome in [playground/src/App.tsx](../playground/src/App.tsx): AI and BI panes now support maximize/focus, restore, minimize, pin/unpin startup focus, and open-page actions.
- Added URL-addressable focus mode with `?focus=ai` / `?focus=bi`; focused mode hides the top bar for more working space and keeps the background pane mounted when both panes are enabled.
- Added minimized restore docks so hiding AI or BI is reversible from the canvas without digging through Settings.
- Browser cross-validation caught a duplicate `aria-label="Restore AI panel"` path after minimizing AI; fixed by making the visible-pane helper action `Show both panels`.
- Moved AISidebar usage recording out of a React state updater and stubbed `window.open` in the Power BI auth allowlist test, removing the previous full-suite stderr noise.

### Validation

- `playground`: `npm.cmd test -- viewportControls` -> 16/16
- `playground`: `npm.cmd run lint`
- `playground`: full `npm.cmd test` -> 354/354
- `playground`: `npm.cmd run build`
- `proxy`: full `npm.cmd test` -> 630/630
- Browser DOM smoke: `?focus=bi` hydrated BI as maximized and AI remained mounted in the background. Browser screenshot/click dispatch hit tooling timeouts on the heavy dev page; mounted integration tests cover the clicks.

### Tripwires

- Focus mode is a shell-level maximize, not vendor-native fullscreen. Power BI's SDK fullscreen command remains in the developer strip.
- Pinning stores the startup focused pane in `pulseplay:pinned-viewport-pane`; unpin clears it. It does not overwrite the user's AI position or BI tile preferences.
- The next largest gap is still production auth hardening; viewport comfort is no longer the blocker.

---

## 2026-05-14 - Power BI embed-token hardening

**Range:** P0 security lane from `docs/AGENT_SYNC.md`; scoped to Power BI service-principal token issuance and the setup UI posture.

### What shipped

- Hardened `POST /assistant/embed-token/powerbi` in [proxy/server.js](../proxy/server.js):
  - rejects browser-supplied `identities`, `effectiveIdentity`, `effectiveIdentities`, and `rlsIdentity` before any Microsoft call;
  - derives optional RLS effective identities only from server-side profile config or verified IdP user claims;
  - denies `permissions: "Edit"` unless the profile explicitly sets `powerBiAllowEdit=true`;
  - expands the cache key to `(profile, workspace, report, dataset, accessLevel, identityHash)` so RLS tokens cannot cross users.
- Added profile/env knobs documented in [proxy/config.example.json](../proxy/config.example.json) and [docs/PROXY_REFERENCE.md](PROXY_REFERENCE.md): `powerBiAllowEdit`, `powerBiRlsEnabled`, `powerBiRlsRequired`, `powerBiRlsUsername`, `powerBiRlsUsernameClaim`, `powerBiRlsRoles`.
- Updated [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx): manual Power BI token paste is hidden unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` outside production; backend-issued mode requests View only.
- Added negative coverage in [proxy/tests/embedTokenRoute.test.js](../proxy/tests/embedTokenRoute.test.js) and UI posture coverage in [EmbedConfigForm.test.tsx](../playground/src/components/__tests__/EmbedConfigForm.test.tsx).

### Validation

- `proxy`: `node --check server.js`
- `proxy`: `npm test -- embedTokenRoute` → 22/22
- `proxy`: full `npm test` → 630/630
- `playground`: `npm run lint`
- `playground`: `npm test -- EmbedConfigForm` → 2/2
- `playground`: full `npm test` → 338/338
- `playground`: `npm run build`

### Tripwires

- RLS derivation is available, but only works when the deployed proxy has a verified IdP session or a deliberate server-side `powerBiRlsUsername` pilot override. Shared-key-only deployments cannot infer a real end-user RLS username.
- Full playground tests still print existing stderr noise from the SustainabilityIndicator setState warning and jsdom `window.open` in MSAL tests; both suites pass and those warnings predate this lane.
- Claude/another agent should review this patch next per `docs/AGENT_SYNC.md`.

---

## 2026-05-14 - Agent coordination scratchpad

**Range:** documentation-only helper requested by Rajesh so multiple AI agents can coordinate faster without stepping on each other's work.

### What shipped

- Added [docs/AGENT_SYNC.md](AGENT_SYNC.md) as a repo-tracked agent-to-agent communication file.
- The file defines operating instructions, message tags, active work lanes, a missing-gap table, copy-paste prompts, open questions, a decision log, and a handoff template.
- It explicitly stays non-canonical: architecture, security, roadmap, and durable decisions still belong in the relevant docs, ADRs, HANDOVER, and `docs/memory/`.

### Validation

- No code changed.

---

## 2026-05-13 — Proxy plumbs `usage` blocks for sustainability indicator

**Range:** follow-on to the sustainability-indicator commit. Replaces text-length estimates with real token counts for every backend that exposes them.

### What shipped

- **`proxy/lib/foundationModelClient.js`** — `extractUsage()` helper + `callFoundationModel` now returns `{ content, raw, usage? }`. Tolerates partial blocks; rejects negative/NaN values.
- **`proxy/lib/bedrock.js`** — new `opts.onUsage` callback on `bedrockInvokeModel`. Normalises both Anthropic-on-Bedrock (`{ usage: { input_tokens, output_tokens } }`) and Llama-on-Bedrock (`{ prompt_token_count, generation_token_count }`) into OpenAI-compatible shape via internal `_extractBedrockUsage()`. Existing string-returning signature unchanged for backwards-compat with probe + suggest-metric-rules call sites.
- **`proxy/lib/llmOrchestrator.js`** — `orchestrateGroundedAnswer` accepts `callLlm` returning either a bare string (legacy contract) OR `{ content, usage? }` (new). Internal `_runLlm()` wrapper accumulates usage across SQL + narrative + optional validation-retry calls. `_accumulateUsage()` helper sums OpenAI/Anthropic-shape blocks into a single OpenAI-shape total. Result object now carries `usage` when at least one LLM call returned a block.
- **`proxy/server.js`** — `_sanitizeUsageBlock()` helper added near `spHashForProfile`. Four conversation/start handlers updated:
  - OpenAI chat-only: extracts `data.usage` → adds to `responsePayload.usage` + `message_id` JSON.
  - OpenAI analytics: inline `callLlm` returns `{ content, usage }` so the orchestrator accumulates across both LLM calls.
  - Bedrock direct chat-only: passes `onUsage` callback to `bedrockInvokeModelCall`; captured usage flows through the response.
  - Bedrock direct analytics: same pattern as Bedrock chat-only, into the orchestrator.

### Backends covered

| Backend | Usage block | Plumbed |
|---|---|---|
| Foundation Model (Databricks Model Serving) | OpenAI shape | ✅ |
| Azure OpenAI chat-only | OpenAI shape | ✅ |
| Azure OpenAI analytics-mode (LLM→SQL→narrative) | OpenAI shape | ✅ summed across calls |
| Bedrock Anthropic (Claude) | `{ input_tokens, output_tokens }` | ✅ normalised |
| Bedrock Llama | `{ prompt_token_count, generation_token_count }` | ✅ normalised |
| Bedrock RAG (RetrieveAndGenerate) | Not exposed | ⏳ N/A |
| Databricks Genie | Not exposed | ⏳ N/A — heuristic estimation in playground |
| Supervisor (fan-out) | Per-space sub-calls | ⏳ aggregation pending |

### Tests + build

- `proxy`: **625/625 pass** (was 608 — +17 from usage tests). Coverage: `foundationModelClient.extractUsage` (5 cases), `bedrock._extractBedrockUsage` (5 cases including partial inputs), `llmOrchestrator._accumulateUsage` (5 cases), orchestrator end-to-end with stub callLlm (2 cases including the bare-string legacy contract).
- `playground`: 336/336 unchanged. Playground already had the `usage` field plumbed through `AnswerEntry`/`ProxyMessageResponse`/`recordUsageResponse` from the previous commit; once the proxy starts sending the field, real counts flow into the SustainabilityIndicator with no client changes needed.

### Tripwires

- **Bedrock-RAG path doesn't expose token counts.** Sessions on bedrock-rag profiles fall back to playground-side estimation. If AWS adds a `usage` field to the RetrieveAndGenerate response, lift it in the bedrock-rag handler the same way (`_sanitizeUsageBlock(data.usage)`).
- **Genie path stays on estimation indefinitely.** The Genie REST API doesn't return token counts. The playground's chars/4 heuristic is the honest answer here; the SustainabilityIndicator marks these sessions with a "~" prefix + tooltip disclaimer.
- **Supervisor fan-out doesn't yet aggregate sub-call usages.** Each Genie sub-call is unmetered; the synthesis-LLM call IS metered when it goes through the Foundation Model translator path. A future commit can sum sub-call usages — but only for non-Genie fan-out spaces (since Genie has no usage to sum).
- **The `callLlm` contract is now dual-shape** — bare string OR `{ content, usage }`. Existing callers that return a string still work. New callers should return the object form. The `_runLlm()` wrapper in the orchestrator handles normalisation.
- **Don't expose `usage` to audit logs by default.** Token counts aren't sensitive but they do leak into the standard audit pipeline if a future commit blindly stringifies the response. Audit logs today carry a deliberate subset of response fields; keep `usage` out unless you add a typed field for it (it's metric data, not security signal).

### What's next

- **Supervisor aggregation**: sum per-space usage where exposed; expose `usage` on the supervisor response.
- **Per-entry token badge**: small inline `🍃 1.2k` next to each AISidebar answer entry's elapsed-time stamp (currently only session-aggregate).
- **Track cumulative cost in audit log (opt-in)**: a `usageStats` metric line, separate from the main audit stream, that finance/observability can scrape to track per-profile spend.

---

## 2026-05-13 — Sustainability indicator (leaf + smile token gauge)

**Range:** small UX feature requested by the user. Reinforces PulsePlay's "fewer tokens, better accuracy — the lean-and-mean solution" positioning by making it visible in the UI itself.

### What shipped

- `playground/src/lib/usageTracker.ts` — session-wide token accounting. Accepts real `usage` blocks from OpenAI / Anthropic / Foundation Model / Bedrock-Llama (each have slightly different shapes — tracker normalises). Falls back to a `chars/4` heuristic when the backend doesn't expose token counts (Genie is the main offender today). Exposes `recordResponse`, `getSessionUsage`, `subscribeUsage`, `resetSessionUsage` + tier helpers (`tierLabel`/`tierColor`/`tierEmoji`/`tierFace`/`tierTagline`).
- `playground/src/components/SustainabilityIndicator.tsx` — leaf-icon + face + tier label + token-count badge + bar visualisation in the AISidebar footer. Six tiers: `ready` (🌱), `lean` (🍃 😄), `green` (🍃 🙂), `moderate` (🍂 😐), `heavy` (🍂 😕), `very-heavy` (🍁 ☹️). Thresholds: 2k / 8k / 20k / 50k cumulative session tokens. Hover or keyboard-focus shows a tooltip with: total tokens, input/output split, question count, an "Estimated from text length" disclaimer when applicable, and a brand-message tagline. Optional `↻` reset button starts a fresh session.
- `playground/src/components/AISidebar.tsx` — recordResponse is called from `finalize()` whenever an entry reaches `status: "completed"`. Real `usage` block wins; falls back to text-length estimation. SustainabilityIndicator rendered in the sidebar footer with `showReset`.

### Tests + build

- `playground`: **336/336 pass** (was 294 — +42 from sustainability). usageTracker: 22 tests (real-usage normalisation, text estimation, tier transitions across all 6 boundaries, subscribe/unsubscribe, reset). SustainabilityIndicator: 20 tests (rendering states, tooltip on focus, bar + reset button visibility, live-tracker subscription).
- TypeScript lint clean. Production build clean.

### Tripwires

- **Tooltip uses focus instead of mouseenter for keyboard accessibility.** React's synthetic `onMouseEnter` doesn't bubble in jsdom test environments — tests use `.focus()`/`.blur()` to trigger hover state. Real users get both: mouse OR keyboard. `tabIndex={0}` makes the indicator keyboard-reachable.
- **Token counts are session-wide, not per-conversation.** The reset button (↻) is the only way to zero it out. We may want to auto-reset when the user clears history (no clear-all button exists today; if added, wire `resetSessionUsage()`).
- **Heuristic estimation uses `chars/4`** — well-known approximation for GPT/Claude/Llama tokenizers on English prose. Within ~15% accuracy for typical content. Marked with `~` prefix + tooltip disclaimer so users know it's an estimate.
- **Proxy does NOT currently pass `usage` blocks through** — the proxy's response shapes drop the `usage` field from OpenAI/Anthropic/Bedrock responses. Until that's plumbed, every entry's usage is estimated. Once the proxy forwards `usage`, OpenAI/Bedrock/Foundation Model sessions show real counts automatically. Genie still uses estimation.
- **Emoji discipline:** the user explicitly requested "green leaf happy icon" + "smile" — emojis here are sanctioned. Don't propagate emoji style to other components without a user ask.

### What's next

- **Proxy plumbing**: forward the `usage` block from `foundationModelClient.js` / OpenAI / Bedrock orchestrators into the conversation response payload. Then real counts replace estimates for those backends.
- **Per-entry token badge**: small inline "🍃 1.2k" next to each answer entry's elapsed-time stamp (currently only session-aggregate is shown).
- **Reset-on-clear**: when a clear-history button lands, call `resetSessionUsage()`.

---

## 2026-05-13 — Phase A Discovery Loop + Phase B SQL transparency shipped

**Range:** continues from the Discovery + Staged Rendering specs (same date entry below). Phases A + B both landed. Phases C + D remain queued.

### What shipped

**Phase A — Discovery endpoint + reachability + Frame picker:**

- `proxy/lib/discoveryEngine.js` — fuses Genie probe + caller-forwarded `BIMetadata` + pack KPIs (parsed from `kpis.md`) into a `DiscoverySnapshot` with `reachableFrames[]` and `unreachableFrames[]`. Hardcoded `FRAME_PREREQUISITES` table mirrors the playground preset library (SWOT, BCG, Pareto, RFM, variance, anomaly + 7 CPG/FMCG vertical presets); Phase C moves these to the IR.
- `proxy/server.js` — new `POST /assistant/discover` endpoint. Pack allowlist gating + 60-sec proxy-side LRU cache + `X-PulsePlay-Discovery-Cache: hit/miss` header + `bypassCache` flag + audit log with `action=discover`.
- `playground/src/lib/discoveryClient.ts` — `getDiscoverySnapshot()` wrapper with sessionStorage cache (15-min TTL keyed on `profile|pack|sv|biUrlHash`), in-flight request dedupe, `subscribeDiscoveryCache()` event bus, client-side input sanitization.
- `playground/src/components/FramePicker.tsx` — accessible `<select>`-based dropdown. Reachable frames grouped by domain with ✓; unreachable disabled with ✗ marker + `blockedBy` tooltip + visible reason pane. Empty-state hint when no frames are reachable.
- `playground/src/components/AISidebar.tsx` — fires discovery on mount + when `activeConnector`/`packSelection` changes. FramePicker rendered above the textarea in the composer. **Phase A scope**: selection is local state only; ask flow is unchanged. Phase B+ wires the frame into the prompt.

**Phase B — SQL transparency via CTE markers:**

- `proxy/lib/promptTranslators/genie.js` + `foundationModel.js` — when IR has `output.format === 'structured-sections'`, inject a directive asking the LLM to label each top-level CTE with `/* Section: <ID> */`. Synthetic IRs (no sections) are unaffected — byte-identical wrapAsGenieUserMessage regression still holds.
- `proxy/lib/sqlSectionExtractor.js` — parses labelled SQL back into `{sectionId, cteName, sqlFragment, startOffset}[]`. Recognises `/* Section: X */` and `-- Section: X` forms (case-insensitive). `annotateAgainstIR()` matches sections to IR spec entries + reports `coverage.missing` / `coverage.unexpected`.

### Tests + build

- `proxy`: **608/608 pass** (was 589 — +19 from Phase B). Includes the critical byte-identical Genie backward-compat regression. Phase A discovery: 38 new tests. Phase B SQL extractor: 19 new tests.
- `playground`: **294/294 pass** (was 264 — +30 from Phase A). discoveryClient: 19 tests covering sanitization, network shape, sessionStorage cache TTL, in-flight dedupe, subscribe/unsubscribe. FramePicker: 11 tests covering rendering states + onChange wiring.
- `playground`: `npm run lint` (tsc --noEmit) clean. `npm run build` green — bundle sizes unchanged.

### Tripwires

- **AISidebar tests mock `discoveryClient`** — the existing ask + poll assertions on `fetchMock.mock.calls[0]` would otherwise see the discovery fetch as call #0. The mock is in `src/components/__tests__/AISidebar.test.tsx`; if you add new sidebar tests that need real discovery behaviour, mount with `activeConnector=""` to short-circuit the effect, or override the mock locally.
- **`BIAdapter.getMetadata()` is NOT implemented yet** — discovery runs with `biMetadata: null`, which means reachability for BCG/RFM/Procurement/Commercial-retail (frames needing categorical dimensions) is conservative. Phase C adds the BIAdapter contract extension; existing adapters degrade to `null` cleanly.
- **`FRAME_PREREQUISITES` in `discoveryEngine.js` mirrors playground preset IDs.** Drift between the two is silent — a frame added to the playground but not to the proxy table will show up in the dropdown only after the proxy table is updated. Phase C moves the table to the IR + author-owned `prerequisites`.
- **Phase B's CTE markers depend on the LLM honouring the directive.** Foundation Model / Anthropic models comply reliably; Genie is more variable in our smoke testing. If Genie ignores the directive, the extractor returns `[]` and the UI falls back to showing the unlabelled SQL — graceful degradation, not a crash.
- **Phase B's CTE markers are NOT yet WIRED into any route handler.** The translators emit the directive; the extractor parses it; but no live route currently calls `extractSqlSections()` on Genie's response. That wiring lands in Phase 11b (the dispatcher migration) so the per-section SQL fragment becomes visible in the SQL Trace tab.

### What's next

- **Phase C (~2-3 days)** — auto-derive parameter defaults from data signals; slider/multi-select UI upgrade from declared `param.type`. Builds on Phase A's `availableKpis` + `biDimensions`. Likely independent of Phase D.
- **Phase D (~3-4 days)** — staged "1-then-3" orchestrator + SSE streaming + SectionedAnswer UI. Consumes Phase B's extractor for per-section SQL provenance.
- **`BIAdapter.getMetadata()` contract extension** — needed to make BCG / RFM / commercial-retail / procurement reachability honest. Power BI implements via `report.getActivePage().getVisuals().getCapabilities()`; iframe-based adapters return `null` cleanly.

---

## 2026-05-13 — Discovery Loop + Staged Rendering design specs (Phase A/B/C/D)

**Range:** design-first lock for the next cycle of beast-mode work. **No code shipped yet** — these specs gate the implementation.

### Why these specs exist

Following the Phase 11a Prompt IR landing, the next user-facing question is "how do business users actually USE this?" The user pushed on three concerns:

1. **Pre-flight knowledge** — "how does the system know what KPIs / data are available?" → Discovery loop
2. **Analysis-frame dropdown** — "BCG / SWOT / Pareto / vertical presets should be picker-driven, not authored deep in setup" → reachable-frames surfacing
3. **Auto + manual parameter system** — sliders driven by data distribution, manually overridable
4. **SQL transparency for every section** — "without showing the SQL, business won't trust the numbers"
5. **Staged rendering** — "render HEADLINE first, then fan out TRENDS/RISKS/ACTIONS" → 1-then-3 orchestration

### What shipped

- **[docs/DISCOVERY_LOOP.md](DISCOVERY_LOOP.md)** — Phase A/B/C spec. Defines the pre-flight discovery loop that fuses Genie probe + `BIAdapter.getMetadata()` + pack KPIs into a `DiscoverySnapshot` with `reachableFrames[]` and `unreachableFrames[]`. 3-layer cache (sessionStorage 15min + proxy in-memory 60s + probeConnector underneath). Endpoint contract: `POST /assistant/discover`. Parameter proposals upgrade declared `type` to data-aware controls (slider/multi-select/period-picker).
- **[docs/STAGED_RENDERING.md](STAGED_RENDERING.md)** — Phase D spec. "1-then-3" orchestration: probe once, generate HEADLINE first (first paint at ~2s), fan out remaining sections in parallel. Per-backend behaviour for Genie (follow-up messages on same conversation), Foundation Model/OpenAI/Bedrock (parallel completions with prompt caching), Supervisor (per-space fan-out). SQL provenance in two modes: Phase B CTE-comment markers (cheap, ships first) and Phase D per-section function calls (proper). SSE-streaming endpoint `POST /assistant/conversations/start-sectioned`.

### Phase plan (locked)

| Phase | Scope | Effort |
|---|---|---|
| A | Discovery endpoint + cache + frame reachability + static param defaults | 2 days |
| B | SQL transparency via CTE-comment markers in Genie + Foundation Model translators | 1 day |
| C | Auto-derived param defaults + slider/stepper UI upgrade | 2-3 days |
| D | Staged "1-then-3" orchestrator + SSE streaming + SectionedAnswer UI | 3-4 days |

Total ~8-10 days across all four phases. They build on each other; Phase A is the entry point.

### Tripwires for next-session implementation

- **`BIAdapter.getMetadata()` is a new optional method.** Adding it triggers the conformance harness — verify adapters that don't implement it return `null` cleanly. Generic-iframe always returns `null` (iframe boundary).
- **Pack KPI parser is markdown-list-based.** If a pack's `kpis.md` doesn't follow the expected shape, the parser must emit a warning + return an empty list, not crash. Pack authors own that contract.
- **`/assistant/discover` rate-limit shares the `/probe` bucket.** Don't add a new bucket — keep cap shared.
- **OpenAI prompt caching is hash-based on the first N tokens.** Keep param values OUT of the system prompt (translator already does this; lock with a test in Phase D).
- **Genie follow-up SQL may re-execute.** Smoke before assuming staged rendering is free on the Genie side. Fall back to single-call for Genie if needed.
- **Phase B + D both touch SQL provenance.** Phase B's CTE comment markers must survive the eventual Phase D function-call refactor — they're the fallback when function-calling isn't available (Genie).
- **Selective re-run (Phase D.4)** replays cached probe + new LLM call for ONE section. Don't re-probe.

### What's next

Start Phase A code: `proxy/lib/discoveryEngine.js` + `/assistant/discover` endpoint + tests. Land in a single commit. Then frontend client + frame dropdown.

---

## 2026-05-13 — Phase 11a: Prompt IR + per-backend translators

**Range:** four prior beast-mode commits + new Phase 11a work. Phase 11a is **additive** — no existing route handler is migrated yet; the dispatcher coexists with `packPromptInjector`.

### Why this phase exists

The author raised a critical architectural concern: prompt-context.md today is Genie-shaped (single-user-message + "[Pack Context: …]" header). Routing the same markdown to Foundation Model, OpenAI, Bedrock, or future Anthropic/MCP backends produces sub-optimal prompts because each backend has different idiomatic shapes (system+messages+tools+response_format, etc.). The author should get **upper hand** by writing a vendor-neutral contract once; the runtime translates per-backend.

### What shipped

- **[docs/PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md)** — canonical design, YAML+JSON dual-format decision, translator pattern, migration plan, schema for `role / task / vocabulary / functions / guardrails / output / examples / overrides`.
- **`proxy/lib/promptIR.js`** — loader + hand-rolled validator + synthetic-IR builder.
  - YAML loaded with `yaml.JSON_SCHEMA` mode (no custom tags → defends against the YAML deserialisation CVE class).
  - Synthetic IR carries the raw legacy markdown verbatim in `overrides.genie.legacyPreamble` for byte-identical Genie backward-compat.
  - In-memory cache keyed on `(packsRoot, pack, subVertical)`, `__rebuildIRCache()` test hook.
- **`proxy/lib/promptTranslators/{genie,foundationModel,supervisor,index}.js`** — per-backend translators.
  - `genie`: emits byte-identical output to `wrapAsGenieUserMessage` for synthetic IRs; emits a structured `[Persona]/[Vocabulary]/[Guardrails]/…/[Question]` message for authored IRs.
  - `foundationModel`: OpenAI chat-completions shape — system message with persona/audience/tone/vocabulary/guardrails, alternating user/assistant turns from `examples[]`, `tools[]` from `functions[]`, `response_format.json_schema` from `output.sections`.
  - `supervisor`: fan-out per Genie space (each via Genie translator) + synthesis step via Foundation Model translator with `task.kind=summarise`.
  - `index`: registry maps `genie / supervisor / supervisor-local / foundation-model / openai / bedrock-llama` to translators; `openai` and `bedrock-llama` alias to `foundationModel` because they're OpenAI-compatible.
- **`proxy/lib/promptDispatcher.js`** — top-level facade `buildBackendPayload(profile, request)`. Additive in Phase 11a; doesn't replace `packPromptInjector`. Reports `irSource: 'yaml' | 'json' | 'synthetic' | 'none'` diagnostic so the future "Show translated prompt" UI knows where the IR came from.
- **`pulsepacks/cpg-fmcg/sub-verticals/supply-chain/prompt-ir.yaml`** — first authored example. Carries role, task, full vocabulary (OTIF, fill rate, forecast accuracy, inventory days, service level, cost-to-serve), `compute_kpi` + `decompose_variance` functions, 10 guardrail rules, 5-section structured output, 2 few-shot examples, and a Genie-only `extraUserPreamble` override.
- **`scripts/check-prompt-ir.js`** — local validator CLI: `--all` walks `pulsepacks/`, single-target validates one pack, `--show <pack>/<sv> <backend>` prints the translated payload for debugging ("what does Genie see?", "what does Foundation Model see?").
- **`js-yaml ^4.1.1`** — the only new runtime dep this phase.

### Tests + build

- `proxy`: 5 new test files, **87 new tests** — `promptIR.test.js` (43), `promptTranslator.genie.test.js` (12), `promptTranslator.foundationModel.test.js` (14), `promptTranslator.supervisor.test.js` (10), `promptDispatcher.test.js` (12). **Full suite: 551/551 pass** (was 464).
- The most important test: `promptTranslator.genie.test.js` includes the byte-identical backward-compat regression for both `supply-chain` and `sustainability` packs. If this ever loosens, ALL un-migrated packs see their Genie prompt change. Phase 11b dispatcher migration leans on this guarantee.
- `playground`: 264/264 pass (unchanged — playground does not touch Phase 11a code).
- CLI smoke: `node scripts/check-prompt-ir.js --all` → ✓ cpg-fmcg/supply-chain (yaml).

### Tripwires

- **Phase 11a is additive — no route handler migrated yet.** Existing `/assistant/conversations/start`, `/foundation/section`, and supervisor routes still call `packPromptInjector` directly. Phase 11b migrates them one at a time, locked by per-route regression tests.
- **Synthetic IR carries a generic `persona: 'data analyst'`.** Foundation Model translator's `_buildSystem` checks `ir.meta.synthetic` and unconditionally appends `legacyPreamble` for synthetic IRs (the stub persona doesn't carry domain knowledge). Don't add fancier stub fields — they'd suppress the legacy lift.
- **YAML wins when both formats exist.** Authors can ship `prompt-ir.yaml` AND `prompt-ir.json`; loader prefers YAML; validator CLI emits a warning. Decide once per pack; don't keep both for "fallback" reasons.
- **`overrides.<backend>.legacyPreamble` is reserved for synthetic IRs.** Authored YAMLs use `overrides.genie.extraUserPreamble` (Notes section append) instead. The Genie translator's check on `legacyPreamble` is what triggers byte-identical-to-legacy output — don't set it on authored IRs.

### What's next (Phase 11b)

Migrate the three live route handlers to `buildBackendPayload`. Each migration: write a regression test that locks the new output against the old `packPromptInjector`/`wrapAsGenieUserMessage` output, then flip the route. Once all three are migrated and a release cycle has shipped, retire `packPromptInjector.wrapAsGenieUserMessage` (keep `resolvePackContext` + `buildAuditDetail` — they're still used by the audit pipeline).

---

## 2026-05-13 — Phase 8: Knowledge Base UI (beast-mode six)

**Range:** working tree after `8fde791` — current session, not yet committed. Builds on Phase 0-7 + Phase 6 medium cleanup.

### What shipped

- **Pack detail readers in `packRegistry.js`.** Added `loadPackDetail(pack)` returning manifest + README + migration notes + knowledge-base (glossary/ontology/references) + installed sub-verticals + demo configs. Added `loadSubVerticalDetail(pack, sv)` returning per-sub-vertical KPIs/sample-questions/prompt-context/bi-ai-fit/README. Both gated by `isSafePackSegment` (mirrors L15 identifier regex from packPromptLoader).
- **Two new proxy endpoints** with allowlist gating: `GET /assistant/knowledge/packs/:pack` and `GET /assistant/knowledge/packs/:pack/sub-verticals/:subVertical`. Both rate-limit-exempt (cheap file I/O); both reject path-traversal identifiers before constructing any filesystem path. New entries added to `isRateLimitExemptRead` prefix check.
- **New Knowledge Base page** at `/knowledge` ([playground/src/knowledge/](../playground/src/knowledge/)). Path-based router with no new dep. Header + left rail (installed packs from `/assistant/knowledge/packs`) + content pane with section tabs: Overview, Glossary, Ontology, References, Sub-verticals, Runtime use, Demos. Sub-verticals tab has its own inner left rail + per-sub-vertical content pane.
- **Runtime-use tab** explains, for each pack, exactly what content the current PulsePlay runtime injects today (prompt-context per active sub-vertical; glossary fallback when not present) vs what's available for human review but NOT runtime-injected (ontology / references / KPIs / sample questions). Sets expectations honestly — no overclaiming the existence of governed retrieval before Phase 3.
- **Settings deep-link wired.** Settings › AI › Browse library ↗ is no longer a "Coming soon" stub; it now navigates to `/knowledge/<active-pack>` or `/knowledge` when no pack is selected.
- **App.tsx routing.** AppRouted now checks `useKnowledgeRoute()` FIRST, then `useSettingsRoute()`, then falls through to PlaygroundApp.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 17 new tests (12 knowledgeRoute + 5 KnowledgeShell). **Total 257/257 pass** (was 240).
- `playground`: `npm run build` green.
- `proxy`: 7 new tests (packRegistry.detail). **Total 464/464 pass** (was 457).

### Tripwire

- The Markdown pane currently renders content as preformatted text (whitespace preserved, monospace) — NOT as HTML-rendered Markdown. This is intentional for v0.2: no client-side Markdown parser dep, no XSS risk from author-supplied content. When we add proper Markdown rendering, route it through `DOMPurify` and use a safe-by-default parser. The current `pre` rendering means headers / bullets show their raw `#` / `-` markers, which is fine for read-only inspection.
- The KB endpoints serve raw markdown content with a 256 KB per-file cap. If a pack ships a > 256 KB markdown file, it's truncated server-side with a "[…truncated]" suffix. Not a security issue but worth noting if authors expect full text.
- The runtime-use tab is descriptive, not prescriptive. It explains current behavior; it doesn't actually invoke the runtime. When governed retrieval (Phase 3 of KB architecture) lands, this tab should grow a "Preview retrieval for question…" form.
- Settings › AI › Browse library ↗ relies on `pulseplay:knowledge-navigate` window event for SPA navigation. If that event handler is removed (or the route changes), the deep-link silently degrades to a full reload. Test in place via the integration test.

### Phase tracker (post Phase 8)

| Phase | Status |
|---|---|
| 0-7 | ✅ |
| **8. KB UI** | ✅ DONE |
| **9a. Configuration expansion** (more Genie spaces / Supervisor / OpenAI / Bedrock / Foundation Model / PBI workspaces / packs) | ✅ AVAILABLE TODAY — pure config in `proxy/config.json`, no code |
| 9b. Stub-to-SDK graduation (Tableau / Qlik / Looker real SDK adapters) | ⏳ v0.3+, per-vendor code |
| 10. Fabric feature support (Direct Lake, Dataflow Gen2, semantic-link) | ⏳ v0.4+, additive code in PBI adapter |

**MVP 0.2 + Phase 8 complete.** Remaining gates: live credentialed PBI + Genie/Supervisor smoke. Phase 9a is configuration only (no roadmap blocker — see [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md)). Phases 9b + 10 are real code work, gated on org demand (a non-PBI BI tool or Fabric adoption).

### Framing call-out — common mis-scoping

Earlier in this session I framed "Phase 9 Vendor expansion" as a single deferred milestone. That collapsed two very different things:

| What I was calling "Phase 9" | Reality |
|---|---|
| "Adding more Genie spaces / Foundation Model / OpenAI / Bedrock / PBI workspaces" | **Configuration. Plug-and-play TODAY** via `proxy/config.json`. The proxy already has every connector route. |
| "Tableau / Qlik / Looker as first-class BI vendors" | **Per-vendor code work.** Adapters today are iframe stubs; need real SDK wiring. |

Future LLM sessions: read this distinction first. The 2-axis architecture **is** plug-and-play; what's deferred is the SDK graduation for non-PBI BI vendors and Fabric-specific code paths.

---

## 2026-05-13 — Phase 6 medium cleanup: L12 + L14 + L15 + L17 + L18 closed; L9 + L10 + L13 accepted (beast-mode five)

**Range:** working tree after `8fde791` — current session, not yet committed. Closes out the audit surface from the 2026-05-13 loophole scan.

### What shipped

- **L15 closed (path-traversal whitelist).** [proxy/lib/packPromptLoader.js](../proxy/lib/packPromptLoader.js) now refuses pack + subVertical identifiers that don't match `^[a-z0-9][a-z0-9-]{0,62}$` BEFORE constructing any filesystem path. New `isValidPackIdentifier` export.
- **L17 closed (config startup validator).** New [proxy/lib/configValidator.js](../proxy/lib/configValidator.js). `validateConfigShape` runs at startup; production hard-fails on malformed config; dev mode logs warnings. No new JSON-schema dep — hand-rolled checks on fields whose wrong types crash at runtime.
- **L14 closed (probe payload sanitization).** [playground/src/lib/probeClient.ts](../playground/src/lib/probeClient.ts) `probeConnector` now rejects profile names that don't match `^[a-zA-Z0-9._-]{1,128}$` with a new `ProbeInvalidProfileError` BEFORE any network call.
- **L18 closed (admin token-cache endpoints).** [proxy/server.js](../proxy/server.js) adds `GET /admin/embed-tokens/stats` + `POST /admin/embed-tokens/purge` behind the constant-time shared-key compare (extracted to `_adminAuthOk` helper). Stats returns size + per-entry expiry; purge clears the cache and returns the count.
- **L12 closed (prompt-injection keyword stripper).** [playground/src/pulse/promptRedaction.ts](../playground/src/pulse/promptRedaction.ts) adds `stripInstructionKeywords` + `detectInstructionKeywords` + `safeAuthorPrompt` (combines existing `redactAuthorPrompt` with the new stripper). Heuristic patterns: ignore-prior, disregard-prior, override-system, you-are-now-jailbroken, act-as, from-now-on, developer-mode, reveal-system, end-of-prompt, instruction-fence-attack. Truncates to 16 000 chars. [pulse/visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) switched all author-prompt call sites to `safeAuthorPrompt`. AI vendor's prompt hierarchy + validator framework remain the real fence.
- **L9 + L10 + L13 ACCEPTED.** New § 15.5 risk-acceptance log in SETTINGS_SPEC documents the rationale + re-open trigger for each. L9: CSP works on origin, not path. L10: build-time env var. L13: per-user PBI report ACLs require a REST API lookup the proxy doesn't currently do — Phase 9b.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 20 new tests (11 prompt-injection stripper + 6 probeClient.sanitize + 3 spillover). **Total 240/240 pass** (was 220).
- `playground`: `npm run build` green.
- `proxy`: 29 new tests (16 configValidator + 7 packPromptLoader.identifier + 5 adminEmbedTokenCache + 1 spillover). **Total 457/457 pass** (was 428).

### Audit surface status (final, MVP 0.2)

- 8 HIGH: all ✅ CLOSED or ✅ MITIGATED.
- 7 MEDIUM: L11 + L12 + L14 + L15 ✅ CLOSED; L9 + L10 + L13 ◐ ACCEPTED with explicit re-open triggers.
- 4 LOW: L17 + L18 ✅ CLOSED; L16 + L19 ⏳ OPEN (defer to Phase 9b).

Net: **pilot-readiness from the audit perspective is GREEN.** Remaining gates are live credentialed Power BI + Genie/Supervisor smoke and Phase 8 KB UI (post-MVP-0.2).

### Tripwire

- `safeAuthorPrompt` is a HEURISTIC. It defends against the patterns we've seen, not unknown variants. The AI vendor's prompt hierarchy + Insights validator framework are the load-bearing fences. If an author finds a real prompt-injection bypass that the model honored, ADD the pattern to `INJECTION_PATTERNS` and ship a regression test — never trust the stripper alone.
- The L17 config validator is a hand-rolled checker, not full JSON-schema. It catches the wrong-type-for-known-field cases; it doesn't catch unknown future fields. If a new config shape lands, extend `configValidator.js` rather than assuming the validator covers it.
- The L18 admin endpoints share the same `_adminAuthOk` helper as `/admin/health-summary`. If we ever add an IdP-group-based admin tier (Operator vs Administrator from SETTINGS_SPEC § 14.1), update `_adminAuthOk` to check `req.user.groups` AND constant-time-compare the shared key.

---

## 2026-05-13 — Phase 5: UX cleanup, retirement of legacy surfaces (beast-mode four)

**Range:** working tree after `8fde791` — current session, not yet committed. Wraps the MVP 0.2 functional core.

### What shipped

- **System › Proxy status — live.** [SystemGroup.tsx](../playground/src/settings/groups/SystemGroup.tsx) `useProxyHealth` hook polls `/api/health` every 10 s, surfaces a dot + latency badge + auth-mode + config-source + profile count. Includes a manual "Re-run" button. Latency colored green/yellow/red at 100 / 500 ms thresholds.
- **System › Diagnostics — rolling buffer.** Added [diagnosticsBuffer.ts](../playground/src/settings/diagnosticsBuffer.ts): a 20-event ring buffer fed by a new `pulseplay:bi-event` window event ([BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx) dispatches it on every adapter emit) AND a monkey-patched `console.error` capturing the last 20 errors. `useDiagnosticsBuffer` hook re-renders on each push.
- **System › Export bundle — JSON download.** Added [exportBundle.ts](../playground/src/settings/exportBundle.ts): gathers settings + allowlist + proxy health + diagnostics buffer + `pulseplay:*` localStorage (with token/secret redaction) + browser info. Conservative redaction: any key matching `/token|secret|key/i` is masked; JWT-shaped + dapi-shaped values inside non-secret keys are also masked.
- **Advanced › Reset section / Reset all / Danger zone — type-to-confirm.** [AdvancedGroup.tsx](../playground/src/settings/groups/AdvancedGroup.tsx) gates each destructive action behind a `TypeToConfirmAction` primitive — the user types the action name verbatim before the button enables. Reset section clears keys for a chosen group (`bi` / `ai` / `preferences`). Reset all clears every `pulseplay:*` key on the origin. Danger zone offers `signOutPbi` + a Clear-Pulse-settings action for the Pulse `pulseplay:visual-settings:*` namespace.
- **Retired floating gear popover.** [App.tsx `PulsePlaySettingsGear`](../playground/src/App.tsx) no longer renders the inline UI/Panels/Position popover. The gear button now navigates directly to `/settings`. The retired popover code is documented as removed (live in git history).
- **Repointed Pulse Cycle H Display tab.** [pulse/visual.tsx `PulsePlayDisplayPanel`](../playground/src/pulse/visual.tsx) no longer hosts duplicate toggles. Renders an explanatory paragraph + "Open Settings › Preferences →" button that uses `history.pushState` to enter the canonical Settings page. Single source of truth for display preferences.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 7 new tests (4 exportBundle redaction + 3 AdvancedGroup type-to-confirm). **Total 220/220 pass** (was 213).
- `playground`: `npm run build` green.
- `proxy`: `npm test` **428/428 pass** (no regression).

### Tripwire

- The `console.error` monkey-patch lives at module load time of `diagnosticsBuffer.ts` and never unwires. That's the right behavior for a long-lived rolling buffer but means tests that import the module multiple times re-patch each time. Use the `__clearDiagnosticsBufferForTests` seam if it ever causes flake.
- The Export bundle is a browser-side download. It contains the local-allowlist contents — fine for support tickets but DON'T paste it into a public issue tracker unless redaction was reviewed.
- Pulse `pulseplay:visual-settings:*` keys are NOT cleared by Reset all (that namespace is owned by Pulse). They have their own Clear button under Danger zone. Documented in the helper text.
- The gear retirement keeps the `PulsePlaySettingsGear` component shape (still takes the four props the App previously passed) so existing callers don't break. The props are now unused — left in place for one cycle to avoid a wider refactor; remove in Phase 9b when v0 sidebar mode is rewritten.

### MVP 0.2 status

**Functional core complete.** All 5 Settings groups wired live: Preferences (Phase 2), BI Status license posture (Phase 3), AI group + Supervisor fan-out (Phase 4), System full + Advanced full + retirement (Phase 5). All 8 HIGH loopholes resolved. Remaining before pilot: MEDIUM findings L9-L15, live credentialed Power BI + Genie/Supervisor smoke, KB UI surface (Phase 8 post-MVP-0.2).

---

## 2026-05-13 — Phase 4 + L6/L8: AI group live + Supervisor fan-out + final HIGH loophole closures (beast-mode three)

**Range:** working tree after `8fde791` — current session, not yet committed. Layers on top of Phase 0-3 + Phase 6 (L7) earlier today.

### What shipped

- **Cycle A — settingsStore `activeAiProfile`.** New `pulseplay:active-ai-profile` localStorage key + allowlist-aware setter + orphan detection. Fallback read from Pulse `pulseplay:visual-settings:genieSettings.assistantProfile` so a returning Pulse user lands on their existing selection.
- **Cycle B — Provider picker live.** [AiGroup.tsx](../playground/src/settings/groups/AiGroup.tsx) renders a filtered picker against `/assistant/profiles` + allowlist intersection. Supervisor profiles get a badge showing fan-out count. Clicks persist via `setActiveAiProfile`.
- **Cycle C — Supervisor fan-out table.** [proxy/server.js `/assistant/profiles`](../proxy/server.js) now includes `type`, `spaces`, `agentName` (non-sensitive routing metadata). AiGroup detects `type === supervisor*` and renders a read-only fan-out table with per-space allowlist match (green "allowed" / red "not in allowlist" per row).
- **Cycle D — Connection test matrix.** For Genie profiles, reuses TestConnectionPanel (single probe). For Supervisor profiles, renders a per-space probe matrix with the 2 s stagger from ADR-0003 — partial-failure visualized cleanly (some spaces succeed, some fail; aggregate count shown).
- **Cycle E — Knowledge pack live picker.** AiGroup renders PackPicker inline with allowlist-filtered packs from the proxy registry. Selection persists via existing `setPackSelection`.
- **Cycle F — L8 closure.** [proxy/server.js](../proxy/server.js) refuses to start (FATAL + `process.exit(1)`) when `NODE_ENV=production` and `resolveInlineCredentialsMode() !== "off"`. Closes the misconfiguration window where neither `PROXY_SHARED_KEY` nor `WEBSITE_SITE_NAME` is set in prod.
- **Cycle G — L6 mitigation.** Dev-mode startup banner emits `[security] Embed-token route is reachable without IdP enforcement (dev posture). ADR-0002 binds the proxy to 127.0.0.1 in dev; do NOT expose this port.` Suppressed in `NODE_ENV=test`.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 10 new tests (5 settingsStore activeAiProfile + 5 AiGroup integration). **Total 213/213 pass** (was 203).
- `playground`: `npm run build` green. Initial JS 101 KB raw / 27.6 KB gzip (slight uptick from AiGroup wiring; well within budget).
- `proxy`: `npm test` **428/428 pass** (no regression from `/assistant/profiles` field addition or new startup gates).

### Loophole audit — final state

All 8 HIGH loopholes resolved this session: L1, L2, L3, L4, L5, L7, L8 ✅ CLOSED · L6 ✅ MITIGATED · L11 ✅ CLOSED. Remaining: MEDIUM findings L9-L15 (deferred to a sub-cycle of Phase 6).

### Tripwire

- L6 mitigation relies on ADR-0002's 127.0.0.1 dev bind. Anyone changing that bind without enabling IdP exposes the embed-token route. The banner makes this loud but a misconfigured Docker `0.0.0.0` bind could re-expose. Phase 6 follow-up: refuse to start in non-localhost dev mode unless IdP is enabled.
- The Supervisor fan-out table reads `profile.spaces` from `/assistant/profiles`. If a supervisor profile uses an empty `spaces: []` (default-to-all-profiles routing), the table renders "(none)". The actual runtime behavior is "fan to every non-supervisor profile" — document that in the helper text in a follow-up.
- The proxy's `/assistant/profiles` now exposes `type` and `spaces`. These are non-sensitive but listed in the deploy checklist as "data the org makes visible to authenticated users".
- App.tsx still holds its own copies of bi-vendor / pack-selection / ui-mode etc. alongside the new store (Phase 5 retires the duplicates). The `pulseplay:display-change` event keeps both sides synced.

---

## 2026-05-13 — Phase 3 + Phase 6 (L7): BI cleanups + license posture + CSP-from-allowlist (beast-mode two)

**Range:** working tree after `8fde791` — current session, not yet committed. Layers on top of Phase 0/1/2/7 from earlier the same day.

### What shipped

- **Cycle A — L1 closure (`pbiAuth.ts` tenant gate).** Added `PbiAllowlistError` + `assertTenantAllowed` to [playground/src/lib/pbiAuth.ts](../playground/src/lib/pbiAuth.ts). `signInAndPrepareEmbed` + `getMsal` now refuse to initialize MSAL when `tenantId` is absent or outside `allowedTenants`. `EmbedConfigForm` passes the live `allowlist.aadTenants` into the call so the lower layer enforces too — closes the form-bypass attack vector.
- **Cycle B — L2 closure (adapter-mount allowlist).** Added `allowedOrigins?: string[]` to `GenericConfig` + `PowerBIEmbedConfig` + exported `assertIframeOriginAllowed` helper in [bi-adapters/generic-iframe/index.ts](../bi-adapters/generic-iframe/index.ts) and `assertPowerBIOriginAllowed` in [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts). [BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx) forwards the per-vendor allowlist into `embedConfig.allowedOrigins` on every mount. Adapter rejects non-allowlisted URLs before `iframe.src` is set.
- **Cycle C — L3 closure (PBI secure-embed query-param parsing).** New helper `extractGroupIdFromPowerBIUrl` in [EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx). Secure-embed mode now extracts `groupId` + `reportId` from the pasted URL's query string and validates BOTH against `powerbiWorkspaces` / `powerbiReports` allowlists before persisting.
- **Cycle D + E — License posture readout + no-Fabric diagnostic.** Added `license` to `buildVisibleAllowlist` ([proxy/lib/allowlist.js](../proxy/lib/allowlist.js)) so the browser sees `allowlist.license.powerbi`. Added `PulsePlayLicensePosture` to [playground/src/types/allowlist.ts](../playground/src/types/allowlist.ts). [BiGroup.tsx](../playground/src/settings/groups/BiGroup.tsx) renders Premium tier / allowed tiers / embed SKU / Fabric capability in the Status leaf. [SystemGroup.tsx](../playground/src/settings/groups/SystemGroup.tsx) renders the same as a "License posture" leaf. Both surface a yellow "Fabric NOT available" callout when `fabricEnabled === false`.
- **Cycle F — L7 closure (CSP-from-allowlist).** Added Vite plugin [playground/vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts) that reads `proxy/config.json` (with fallback to `proxy/config.example.json` when the dev config has no allowlist block) at build time and emits a strict CSP with full hostnames only — no `*.powerbi.com`, no `*.tableau.com`, no `*.microsoftonline.com`, no `'unsafe-eval'`. Dev mode keeps the permissive index.html CSP so HMR's `'unsafe-eval'` keeps working; `apply: "build"` scopes the plugin to production builds. [vite.config.ts](../playground/vite.config.ts) wires the plugin. Verified post-build: `dist/index.html` now has `frame-src 'self' https://login.microsoftonline.com https://app.powerbi.com`.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 17 new tests (5 pbiAuth allowlist + 8 generic-iframe allowlist + 4 CSP generation). **Total 203/203 pass** (was 186).
- `playground`: `npm run build` green. Bundle largely unchanged; `dist/index.html` is slightly smaller because strict CSP is tighter than the wildcard version.
- `proxy`: `npm test` still **428/428 pass** (license field on `buildVisibleAllowlist` is additive).

### Tripwire

- The CSP plugin reads `proxy/config.json` first and falls back to `proxy/config.example.json` only if the primary has no `allowlist` block. Production deployments MUST commit an `allowlist` block to their real config.json — otherwise the build silently uses example values. Add a CI lint check.
- The Vite plugin's `apply: "build"` means dev-mode `vite dev` does NOT generate the strict CSP. Dev still has the permissive index.html CSP. If someone runs `vite preview` after `vite build`, they get strict CSP; if they hot-reload via `vite dev`, they don't. Document.
- L8 (inline-credentials startup gate) + L6 (dev-mode embed-token route banner) remain open as Phase 6 cleanup before any non-laptop pilot.
- The proxy embed-token route already enforces tenant/workspace/report — the form + adapter + CSP changes are all defense-in-depth layers in front of that primary fence.

---

## 2026-05-13 — Phase 2: Settings shell + store (beast-mode one)

**Range:** working tree after `8fde791` — current session, not yet committed. Layers on top of the earlier same-day Phase 1 (allowlist runtime) and pack registry work.

### What shipped

- **Full-page `/settings` route.** Tiny path-based router under [playground/src/settings/settingsRoute.ts](../playground/src/settings/settingsRoute.ts) — no new dep. Browser back/forward works; deep links (`/settings/<group>`, `/settings/<group>/<leaf>`) work; last-visited group persists to `pulseplay:settings-last-group`.
- **SettingsProvider + useSettings.** [playground/src/settings/settingsStore.tsx](../playground/src/settings/settingsStore.tsx) holds Context + reducer + allowlist-aware setters. Reads `/assistant/allowlist`, reconciles persisted `pulseplay:*` values against it on load, surfaces orphans via `state.orphans`. Bridges to/from the legacy `pulseplay:display-change` event so App.tsx + Pulse Cycle H stay in sync. **L11 closed at primary read paths.**
- **SettingsShell** at [playground/src/settings/SettingsShell.tsx](../playground/src/settings/SettingsShell.tsx). Header + Back-to-app, search box (focus with `Cmd/Ctrl+/`), 5-chip status strip (BI · AI · Pack · Proxy · Security), 5-group left rail, content pane. Setup-needed badge surfaces on the System group when orphans are present.
- **Five group surfaces** under [playground/src/settings/groups/](../playground/src/settings/groups/):
  - BiGroup — Phase 3 stubs + read-only current values
  - AiGroup — Phase 4 stubs + allowlist readout
  - **PreferencesGroup** — fully wired end-to-end (UI mode / Visible panels / AI position / Canvas tiles)
  - SystemGroup — live read-only Security posture (allowlist contents); Proxy/Diagnostics/Export-bundle stubs for Phase 5
  - AdvancedGroup — live read-only localStorage inspector; Reset stubs for Phase 5
- **App.tsx integration.** `<SettingsProvider>` wraps the app; `AppRouted` switches between `<SettingsShell />` and the existing `<PlaygroundApp />` based on the URL. Global `Cmd/Ctrl+,` shortcut opens Settings. The legacy gear popover got an "Open full Settings →" footer link.

### Tests + build

- `playground`: `npm run lint` (tsc --noEmit) clean.
- `playground`: 25 new tests (10 settingsRoute + 9 settingsStore + 6 SettingsShell). Total **186/186 pass**.
- `playground`: `npm run build` green; initial JS bundle 89 KB raw / 24.6 KB gzipped (well within budget).

### Tripwire

- The Preferences group writes through `settingsStore` setters but App.tsx still has its own copies of the same keys (intentional Phase 2 coexistence). Phase 5 retires the duplicates. The `pulseplay:display-change` bus keeps both sides synced during the transition — do NOT remove the legacy event dispatch until Phase 5 wraps.
- L1/L2/L3 are still ◐ PARTIAL despite Phase 1 closing the primary paths — the in-form validators exist, but the lower-level `pbiAuth.ts` wrapper + adapter-mount allowlist push-down land in Phase 3.
- The legacy gear popover still works as a quick-switch. It's deprecated but not removed in Phase 2 — Phase 5 retirement.

---

## 2026-05-13 — Enterprise allowlist runtime + pack registry

**Range:** working tree after `8fde791` — current session, not yet committed.

### What shipped

- **Runtime allowlist foundation.** Added `proxy/lib/allowlist.js` and wired `proxy/server.js` to enforce organization-controlled BI providers, embed origins, Power BI workspaces/reports, AAD tenants, AI profiles, Genie spaces, Supervisor profiles, and packs. Production refuses to start without a configured allowlist; local dev/test remains permissive with a warning.
- **Allowlist-aware proxy APIs.** Added `GET /assistant/allowlist`, filtered `/assistant/profiles`, route-level allowlist rejection with audit events, and Power BI embed-token tenant/workspace/report checks.
- **Pack registry pulled forward.** Added `proxy/lib/packRegistry.js` and `GET /assistant/knowledge/packs`, reading installed `pulsepacks/*/pack.json` and filtering by `allowlist.packs`.
- **Playground uses governance data.** `App.tsx` fetches allowlist + pack registry, filters visible BI providers/packs, and shows a governance warning if config cannot load. `EmbedConfigForm` validates embed origins, PBI workspace/report, and SSO tenant. `BIPanel` refuses to mount a non-allowlisted embed URL even if config is injected outside the form.
- **Docs aligned.** Updated AGENDA / SETTINGS_SPEC / PACKS / ARCHITECTURE / KB architecture / pulsepacks README / repo memory so they no longer describe the pack picker as hardcoded-only or Phase 1 allowlist as purely speculative.

### Tests + build

- `node --check proxy/server.js`, `proxy/lib/allowlist.js`, `proxy/lib/packRegistry.js`: pass.
- `proxy`: focused `npm test -- allowlist packRegistry server`: pass.
- `proxy`: full `npm test`: **428/428 pass**.
- `playground`: `npm run lint`: pass.
- `playground`: full `npm test`: **161/161 pass**.
- `playground`: `npm run build`: pass.

### Tripwire

- Do not call this pilot-ready yet. Generated CSP from the allowlist is still open, `/settings` shell/store revalidation is not built, inline-credential startup gating remains open, and no live credentialed Power BI + Genie/Supervisor smoke was run in this session.
- `DEFAULT_AVAILABLE_PACKS` still exists as a legacy/test fallback export, but the main app now loads `GET /assistant/knowledge/packs`.

---

## 2026-05-13 — Knowledge plane + Settings IA architecture

**Range:** working tree after `8fde791` — current session, not yet committed.

### What shipped

- **Knowledge plane architecture.** Added [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) after reviewing the two downloaded Settings IA research prompts and three parallel subagent research passes. It defines Knowledge as a governed context plane, not a third product axis.
- **Pack vs Knowledge Base split.** The new doc separates PulsePacks, knowledge sources, indexes, retrieval profiles, and `GroundingBundle` so future work does not overclaim today's prompt-context injection as full RAG.
- **Settings IA locked.** The recommended `/settings` model is a full-page route with shallow left rail.
- **Settings IA tightened (later in session).** After a polish/professional/organized critique pass, the 7-group draft tightened to **5 groups: BI / AI / Preferences / System / Advanced**. Knowledge Pack folded back under AI Runtime for v1 (it's an AI-side modifier today; promotion trigger documented). "Quick Setup" group dropped — replaced by status-chip "Setup needed" badges on incomplete sections. Names cleaned: `Runtime` suffix dropped; `Workspace` → `Preferences`; `System & Health` → `System`; "Pulse Setup" → "AI Insights setup". See [SETTINGS_SPEC.md § 2.3](SETTINGS_SPEC.md).
- **Settings spec consolidated.** Added [SETTINGS_SPEC.md](SETTINGS_SPEC.md) — single source of truth combining IA, layout, microcopy, state model, interaction rules, enterprise guardrails, security setup, maintenance, administration, and a loophole audit. Replaces the scattered settings notes across KB_ARCHITECTURE / AGENDA / HANDOVER / memory.
- **Enterprise allowlist contract.** [SETTINGS_SPEC.md § 11](SETTINGS_SPEC.md) defines 6 named allowlists (BI providers, embed origins, AAD tenants, AI profiles, knowledge packs, future knowledge sources), single source of truth in `proxy/config.json`, fail-closed defaults, defense-in-depth enforcement at 8 layers (Settings UI → shortcut store → adapter mount → CSP → proxy allowlist middleware → IdP-claim refinement → audit log → SIEM alert). New endpoint shape: `GET /assistant/allowlist`.
- **Loophole audit run.** Subagent security scan of every code path where a user-provided value flows into a security-relevant operation. Findings: 8 HIGH (L1-L8), 7 MEDIUM (L9-L15), 4 LOW (L16-L19). Biggest single risk: **L1 (no AAD tenant allowlist)** — phishing vector. Full inventory in [SETTINGS_SPEC.md § 15](SETTINGS_SPEC.md).
- **MVP 0.2 scope locked.** PulsePlay MVP 0.2 = Databricks Genie (direct + Supervisor multi-space) + Power BI (Premium-workspace constraint, governed, no Fabric). [SETTINGS_SPEC.md § 0](SETTINGS_SPEC.md) captures the scope, defers Tableau/Qlik/Looker/OpenAI/Bedrock/Foundation/Fabric/Knowledge-Base-UI to v0.3+. Allowlist defaults tightened to `["powerbi"]` BI providers + Genie/Supervisor profiles only. License posture is now a first-class status surface (Premium tier, embed-token availability, Fabric explicitly disabled). Supervisor fan-out across multiple Genie spaces gets its own UI affordance (per-space probe + partial-failure handling). Phases re-ordered: MVP 0.2 ships through Phase 6 (loophole closure); Phase 7+ is post-MVP-0.2.
- **Existing docs aligned.** Updated [ARCHITECTURE.md](ARCHITECTURE.md), [AGENDA.md](AGENDA.md), [PACKS.md](PACKS.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md), [README.md](../README.md), and [pulsepacks/README.md](../pulsepacks/README.md) to point at the new architecture and correct stale pack-runtime status.
- **Repo-local memory made canonical.** Added [docs/memory/MEMORY.md](memory/MEMORY.md), [docs/memory/project_state.md](memory/project_state.md), and [docs/memory/feature_knowledge_base_architecture.md](memory/feature_knowledge_base_architecture.md). Updated [llm_onboard.py](../scripts/llm_onboard.py) so `docs/memory/` is the default memory source and the Knowledge Base architecture is a canonical doc.

### Tests + validation

- `git diff --check`: clean (line-ending warnings only).
- `python -m py_compile scripts\llm_onboard.py`: pass.
- `python scripts\llm_onboard.py --paths-only --no-state-write`: pass; new Knowledge Base architecture doc appears in canonical docs.
- Re-run after repo-local memory switch: pass; output now includes `docs\memory\MEMORY.md`, `feature_knowledge_base_architecture.md`, and `project_state.md`.

### Tripwire

- Do not say PulsePlay has an enterprise knowledge base yet. Today it has pack content, probe/matcher inference, and prompt-context injection. Governed retrieval, citations, ACL trimming, provider adapters, retrieval profiles, and Knowledge Base UI are architecture/agenda items, not shipped runtime.
- Superseded by the later 2026-05-13 entry above: Phase 1 allowlist enforcement is now implemented for the current proxy/playground paths, but generated CSP, `/settings` store revalidation, and live credentialed smoke are still pending before any non-laptop pilot.
- HANDOVER's existing 2026-05-13 entry already mentioned the 7-group tree (Quick Setup / BI Runtime / AI Runtime / Knowledge Packs / Experience / System & Health / Advanced). That was superseded later in the same session by the 5-group tree above. Treat the 5-group tree (SETTINGS_SPEC § 2.1) as canonical.

---

## 2026-05-12 — Power BI secure embed quick-preview + developer panel

**Range:** working tree after `c3133b8` — current session, not yet committed.

### What shipped

- **Power BI portal iframe/link is now a first-class embed mode.** [EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx) defaults new Power BI authors to "Secure embed link - quick preview" and accepts either the portal URL or the full `<iframe>` snippet from Power BI's "Securely embed this report in a website or portal" dialog.
- **Adapter fallback is explicit and honest.** [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts) mounts secure embed configs as a sandboxed iframe, advertises preview-only capabilities after mount, allows refresh/fullscreen, and rejects SDK-only commands (`apply-filter`, `navigate-to-page`, export) with `UNSUPPORTED_COMMAND`. SSO/service-principal/manual token modes still use `powerbi-client`.
- **Power BI Developer Tools panel.** [App.tsx](../playground/src/App.tsx) now shows a collapsible Power BI developer strip above embedded Power BI reports. It can snapshot the live adapter, show capabilities/recent events, refresh, fullscreen/exit, and test apply/clear filter commands.
- **Adapter developer snapshot API.** [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts) exposes `getDeveloperSnapshot()` for SDK embeds (`getPages`, `getActivePage`, `getFilters`) and explains secure iframe preview limitations when SDK control is not available.
- **Proxy health storm fixed.** [visual.tsx](../playground/src/pulse/visual.tsx) now keys the proactive `/health` probe on stable mode/base-URL values instead of the whole settings object. [genie.ts](../playground/src/pulse/genie.ts) adds a 15s single-flight cache for `/health`, so repeated renders or multiple clients share one probe.
- **Cheap metadata reads no longer burn AI quota.** [proxy/server.js](../proxy/server.js) exempts `GET /assistant/profiles` and `GET /assistant/capabilities` from the cost-bearing rate-limit bucket; real LLM/Genie/warehouse routes remain limited.
- **Default AI Insights no longer burns four Genie messages.** [visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) adds a fast briefing prompt that emits the universal sections in one response; [visual.tsx](../playground/src/pulse/visual.tsx) uses it for preset/AI-assisted defaults so the side pane behaves closer to Chat latency. The multi-stage runner still exists for future deep/custom modes and per-section retry plumbing.
- **AI Insights output polish pass.** The fast briefing prompt now carries a finished-card polish contract, and [visual.tsx](../playground/src/pulse/visual.tsx) strips status emojis from narrative sections while leaving KPI tables alone. Threshold/rule fragments such as `caution threshold (>3 ▼ -7%)` no longer render as noisy trend chips inside prose.
- **Per-section raw data export to Excel.** [visual.tsx](../playground/src/pulse/visual.tsx) now carries Genie query-result rows/columns into each Insights stage trace, and [insightsExporters.ts](../playground/src/pulse/insightsExporters.ts) can export the raw section data as an `.xlsx` workbook with provenance. One-stage fast briefings reuse the same raw query result across rendered sections.
- **Summary is no longer only bullets.** [visual.tsx](../playground/src/pulse/visual.tsx) now renders HEADLINE as a compact summary card and turns labeled TRENDS/RISKS/ACTIONS-style list items into insight cards. [visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) prompts Genie to emit labeled card-shaped items where useful, while plain prose and normal lists still render normally.
- **Tests cover both paths.** [bi-adapters/powerbi/__tests__/index.test.ts](../bi-adapters/powerbi/__tests__/index.test.ts) now verifies secure iframe mount, URL validation, preview capabilities, refresh, unsupported SDK commands, and cleanup without calling the SDK reset path.

### Tests + build

- Focused Power BI adapter vitest: **40/40 pass**.
- Full playground vitest: **161/161 pass**.
- Full proxy jest: **418/418 pass**.
- Playground `tsc -b && vite build`: green.

### Tripwire

- Secure embed is a great novice on-ramp, but it is not the production AI-control path. AI-applied filters, page navigation, rich report events, and future export-to-file still require AAD SSO or service-principal embed-token mode.
- If `/health` spam reappears, check whether a new effect depends on a mutable settings object or writes to Session Log inside its own dependency loop.
- If authors explicitly need the older "one Genie call per section" accuracy profile, expose it as a named Deep mode instead of making it the default; the default side-pane path must stay fast.

---

## 2026-05-11 — Polish pass + enterprise security + Power BI SSO + Smart Connect

**Range:** `cc46779` → `c3133b8` (head) — about 30 commits across one long session.

### What shipped

**A. UX polish on AI Insights**
- `651c01e` **SVG icon set** ([Icon.tsx](../playground/src/pulse/_adapter/Icon.tsx)) — Lucide-style strokes replace the PBI-heritage emoji (📋/↻/⚙) on the AI Insights toolbar. `stroke="currentColor"` so they inherit button colour. Inline SVG, no new dep. Twelve named icons, drop-in for future surface sweeps.
- `651c01e` **Connection pill "Not connected" lie fixed.** Two root causes — `validateUrl` rejected protocol-less hostnames like `dbc-xxx.cloud.databricks.com` (now auto-prefixes `https://`), and `getConfigIssues` required the workspace `host` field even in proxy mode where the proxy resolves the workspace server-side (now optional in proxy mode).
- `a172a4d` **Genie SQL Trace tab** visible for every Databricks-backed mode (denylist: only OpenAI / Bedrock hidden). The tab was previously gated `proxy || direct` strict equality, which missed the default `auto` mode.
- `6c88a4a` **Richer export menu.** Three buttons next to each other on the toolbar: Copy markdown (existing) · **Copy as rich HTML** (Clipboard API writes both `text/html` and `text/plain` — paste into Outlook/Slack/Notion keeps formatting) · **Print to PDF** (browser-native `window.print()`, zero deps). New helper [exportInsightsAsHtml.ts](../playground/src/pulse/_adapter/exportInsightsAsHtml.ts) — DOM-first with a markdown→HTML fallback.
- `c3133b8` **ColorRulesBanner.** Surfaces when `metricDirectionRules` is empty and a briefing is rendered. Lets the author pick one of the three bundled `METRIC_DIRECTION_PRESETS` (Retail / Ops / Healthcare) and one-click apply via `host.persistProperties`. Closes the "AI output has no 🟢/🟡/🔴 status indicators" UX gap.
- `8b30f0b` **PBI wording sweep round 2** — caught the inline `<FieldRow label="Send Power BI report context to AI">` and `genieFields` hint that the first sweep missed.
- `cc46779` Developer Tools modal now defaults to a large centered popup (88vw × 86vh) instead of the inherited narrow drawer.
- `4aa39f7` Full-width top bar with PulsePlay branding + viewport-pinned pill.
- `b086f33` Compact-mode breakpoint lowered 600 → 380 px (was triggering compact at every split-pane width).
- `14822a0` Connection-pill labels forced visible regardless of compact mode.
- `5d42616` Setup placeholders prefixed with `e.g.` so users stop mistaking them for real values.

**B. Multi-BI & multi-AI surface**
- `e9942f8` **Foundation Model connector** registered (closed audit symmetry gap). New `FoundationModelBackend`, descriptor, ConnectionMode union member; updated `connectionMatrix.ts`, `setupStep5.tsx` no-op list, `setupWizard.tsx` backend cards.
- `159b7c5` **Power BI SSO** ("Embed for your organization" pattern, MSAL.js via [pbiAuth.ts](../playground/src/lib/pbiAuth.ts)). Three modes in `EmbedConfigForm`: AAD SSO (default) / Service Principal / Manual paste. AAD app config persists in localStorage. Token cache: sessionStorage (cleared on tab close).
- `65204bf` **BI tiles toolbar** — 1 / 2 / 4 buttons above the BI canvas; dispatches the same display-change event Pulse's Display tab uses.
- `d01690d` **Smart Connect for Pulse mode.** App.tsx auto-fires `probeConnector()` on Pulse settings change; writes the inferred pack to `pulseplay:pack-selection`; `genie.ts` reads it on each `/assistant/conversations/start` and forwards `pack` + `subVertical` so the proxy's cycle-C pack-context injection fires.
- `d1d316a` **Cycle L — BIAdapter → Pulse context bridge.** `buildCategoricalFromBIEvents` distils filter / page / selection events into a synthetic `dataView.categorical` so Pulse's `contextBuilder.buildContext()` populates `props.context.dimensions / availableFilters / hasSelection`. Makes `sendContextToGenie` actually do work.

**C. Performance**
- `d3b3285` **Bundle code-split** via `manualChunks` — initial paint dropped 916 KB → 280 KB (264 KB gzip → 86 KB gzip). Vendor-react / vendor-powerbi / vendor-msal / xlsx / html2canvas / sql-formatter / pulse all split into separate cacheable chunks.
- `220a3a2` **Pulse lazy-load** via `React.lazy()` + Suspense — Pulse's 642 KB chunk only fetches when `uiMode = pulse` actually renders. Brand strip + top bar + v0 sidebar all paint with just index (48 KB) + vendor-react (229 KB).

**D. Enterprise security pass — 4 of 4 audit gaps closed**

Audit doc: [docs/SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) (added `a3902bc`, updated `de5a18d`).

| # | Severity | Commit | What |
|---|---|---|---|
| 8.1 | **HIGH** | `9c9a160` | **IdP JWT middleware** via `jose@^6`. Validates `Bearer` against `PROXY_IDP_JWKS_URL`; issuer + audience optional but recommended; `req.user` claims flow into the audit log. Fail-open in dev, fail-closed when `PROXY_IDP_REQUIRED=true` in production. Coexists with shared-key as alternative auth. |
| 8.2 | MEDIUM | `f15e16e` | **CORS pin.** `PROXY_CORS_ORIGIN` comma-separated allowlist. Production refuses to start with `*`. Vary:Origin per-origin echo. |
| 8.3 | MEDIUM | `f15e16e` | **CSP** — strict `default-src 'none'` on every proxy response + `index.html` meta CSP with vendor-origin allowlist for PBI / Tableau / Qlik / Looker frames + AAD / Graph / PBI REST `connect-src`. |
| 8.4 | MEDIUM | `f15e16e` | **PII sanitizer** for BI-event context — new [lib/piiRedact.ts](../playground/src/lib/piiRedact.ts) with regex passes for email / US SSN / IBAN / credit-card / phone / API-key. Applied inside `buildCategoricalFromBIEvents` so values flowing through cycle L's bridge are scrubbed before reaching the AI prompt. 14 unit tests. |

Remaining open: 8.5 per-user rate limit (now unblocked since `req.user.sub` is the natural key), 8.6 cache metrics, 8.7/8.8 (low / N/A).

### Tests + build

- Playground vitest: **146/146 pass** (started session at 132; +14 from PII sanitizer + cycle-L bridge tests).
- Proxy jest: **417/417 pass** (test mode bypasses IdP middleware cleanly, as designed).
- tsc strict + vite production build: green.

### Tripwires & open ends

- **Auto mode is the default `connectionMode`.** If anything anywhere assumes a literal `"proxy"` string (the way the old Genie Queries gate did), it will silently skip in auto mode. Audit any new feature gates against this.
- **MSAL `sessionStorage` cache.** Per-tab session lifetime is intentional (XSS-narrowing) but means each new tab requires interactive sign-in. Documented in [SECURITY_ARCHITECTURE.md § 1.1](SECURITY_ARCHITECTURE.md).
- **`runtimeForbiddenColumns` / `runtimeMandatoryRowFilter` are prompt-layer.** They're advisory guardrails — Unity Catalog row/column policy is the load-bearing fence.
- **Foundation Model + Tableau/Qlik/Looker** need backend profile config and SDK wiring respectively to be fully functional. The frontend now selects + routes them correctly.
- **CSP `'unsafe-eval'`** is in the playground's meta CSP for Vite HMR; production builds should drop it via vite config.
- **`PROXY_CORS_ORIGIN`, `PROXY_IDP_*`, `PROXY_INLINE_CREDENTIALS_MODE`** all need setting in production env. The proxy refuses to start with insecure defaults when `NODE_ENV=production`.
- **Genie stage memory** — when a stage reuses a prior stage's SQL via Pulse's memory feature, the section card shows "No SQL was attached". The user finds the SQL via either the originating stage's `</>` button, the **Genie SQL Trace** tab in Developer Tools, or directly in Databricks SQL history.

### Next-session candidates (pick one)

1. **PBI export-to-file** — server-side route + frontend wiring. Adapter currently rejects `export` with `UNSUPPORTED_COMMAND`.
2. **Tableau adapter SDK** — replace the iframe stub with `<tableau-viz>` Embedding API v3. After PBI is complete per user direction.
3. **Per-user rate limit** — unblocked now that IdP middleware lands `req.user.sub`. Replaces / supplements the per-IP 120 req/min limit.
4. **Eval suite** — 30-50 fixed questions, ground-truth answers, nightly run against the Sample Superstore Genie space.
5. **Tooltip + hover polish** on the new icon buttons (small lift).

### Files touched (high-level)

- New: `playground/src/lib/pbiAuth.ts`, `playground/src/lib/piiRedact.ts`, `playground/src/lib/probeClient.ts`, `playground/src/pulse/_adapter/Icon.tsx`, `playground/src/pulse/_adapter/exportInsightsAsHtml.ts`, `playground/src/pulse/backend/FoundationModelBackend.ts`, `playground/src/components/__tests__/PulseShell.test.ts`, `playground/src/lib/__tests__/piiRedact.test.ts`, `docs/SECURITY_ARCHITECTURE.md`.
- Modified (Pulse-port, additive only): `playground/src/pulse/visual.tsx`, `playground/src/pulse/settings.ts`, `playground/src/pulse/setupStep5.tsx`, `playground/src/pulse/setupStep5Guided.tsx`, `playground/src/pulse/setupWizard.tsx`, `playground/src/pulse/genie.ts`, `playground/src/pulse/connectionMatrix.ts`, `playground/src/pulse/insightsPresetLibrary.ts`, `playground/src/pulse/backend/connectorRegistry.ts`, `playground/src/pulse/_adapter/PulseHostStub.ts`.
- Modified (PulsePlay-native): `playground/src/App.tsx`, `playground/src/components/EmbedConfigForm.tsx`, `playground/src/components/PulseShell.tsx`, `playground/vite.config.ts`, `playground/index.html`, `proxy/server.js`, `proxy/package.json`.

---
