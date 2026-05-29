# AI Insights Section Loading Handoff for Claude - 2026-05-27

## Read This First

This is a read-only research handoff for Claude. No runtime code was changed in this pass.

Rajesh's product direction:

> Stay uniform, stay simple, stay lean, stay clean.

For AI Insights loading, that means:

- Keep one visible PulsePlay AI Insights answer.
- Let the first planned section take the lead for every selected template.
- Then run the remaining sections in small batches, usually 2 or 3 sections at a time.
- Reuse the same Genie conversation thread.
- Do not pretend Genie can reuse one upstream `message_id`.
- Improve perceived latency, real backend load, quality, accuracy, and traceability without reconstructing the whole screen.

## Executive Verdict

The current AI Insights screen already has a lot of the right pieces: section renderer, skeleton cards, per-stage statuses, conversation reuse, per-stage SQL panels, cache restore, stale-while-refresh, retry paths, and a backend sectioned SSE route.

The core gap is narrower and more important:

1. The normal AI Insights product path is effectively single-shot today.
2. The fast hybrid prompt builder bundles the whole briefing into one `AI Insights briefing` prompt.
3. Because the runner receives only one prompt, the dormant multi-stage batching path is bypassed.
4. Existing client-side staged reveal is cosmetic after the full answer arrives, not real upstream section loading.
5. The fix should be a section-plan/batch scheduler feeding the existing runner, not a screen rewrite.

Claude should not rebuild AI Insights. Claude should restore real section planning and prove the upstream contract:

```text
renderId = one visible PulsePlay AI Insights answer
conversation_id = one Genie conversation for the whole AI Insights run
message_id = one immutable Genie message per lead section or section batch
sectionId = stable UI section key derived from the selected template
```

## Subagent Findings

Six read-only subagents were used:

| Agent | Slice | Finding |
|---|---|---|
| Gauss | Frontend AI Insights orchestration | Normal path is single-shot because `buildFastHybridInsightsStagePrompts()` returns one stage. Dormant shared-conversation multi-stage logic exists. |
| Hypatia | Proxy and Genie message model | Genie is one POST -> one immutable `message_id`; shared `conversation_id` is the correct thread mechanism; `/start-sectioned` exists but is not wired to active Pulse AI Insights. |
| Godel | Databricks DevTools evidence feed | Databricks UI evidence supports progressive message lifecycles, typed attachments, query results, and multiple messages under one conversation. Use official APIs via proxy, not private `/ajax-api` routes. |
| Lovelace | Tests and coverage | Existing tests cover client reveal, FM sectioned route, and Genie helper units, but not active AI Insights batching end to end. |
| Jason | Renderer/progress UX | Renderer primitives are strong, but default placeholders show one generic `AI Insights briefing`, not real section titles. |
| Turing | Architecture/history | Product contract is already documented: one UI `renderId`, one shared `conversation_id`, multiple upstream `message_id`s. |

## Current Behavior Proof

### 1. Normal AI Insights defaults to one prompt

In `runInsights`, preset and AI-assisted modes call `buildFastHybridInsightsStagePrompts()`:

- [playground/src/pulse/visual.tsx:3379](../../playground/src/pulse/visual.tsx#L3379)
- [playground/src/pulse/visual.tsx:3396](../../playground/src/pulse/visual.tsx#L3396)
- [playground/src/pulse/visual.tsx:3425](../../playground/src/pulse/visual.tsx#L3425)

That helper returns one stage containing the full briefing contract:

- [playground/src/pulse/visualHelpers.ts:941](../../playground/src/pulse/visualHelpers.ts#L941)
- [playground/src/pulse/visualHelpers.ts:950](../../playground/src/pulse/visualHelpers.ts#L950)
- [playground/src/pulse/visualHelpers.ts:965](../../playground/src/pulse/visualHelpers.ts#L965)

The test locks this behavior:

- [playground/src/pulse/__tests__/insightsFastPrompt.test.ts:26](../../playground/src/pulse/__tests__/insightsFastPrompt.test.ts#L26)
- [playground/src/pulse/__tests__/insightsFastPrompt.test.ts:35](../../playground/src/pulse/__tests__/insightsFastPrompt.test.ts#L35)

Current test wording: "bundles the default briefing into one Genie call."

### 2. The real batching branch is bypassed when there is one prompt

`runInsights` only starts the worker pool when `prompts.length > 1`:

- [playground/src/pulse/visual.tsx:4046](../../playground/src/pulse/visual.tsx#L4046)
- [playground/src/pulse/visual.tsx:4050](../../playground/src/pulse/visual.tsx#L4050)

So the normal fast hybrid path runs:

```text
prompts.length = 1
runStage(0)
one startConversation
one waitForMessageWithProgress
one full markdown result
```

It does not run true section-level loading.

### 3. The shared-conversation multi-stage mechanism already exists

The good news: Claude does not need to invent the thread-sharing mechanism.

`obtainMessage()` already opens one conversation and sends later prompts as follow-ups:

- [playground/src/pulse/visual.tsx:3524](../../playground/src/pulse/visual.tsx#L3524)
- [playground/src/pulse/visual.tsx:3574](../../playground/src/pulse/visual.tsx#L3574)
- [playground/src/pulse/visual.tsx:3587](../../playground/src/pulse/visual.tsx#L3587)
- [playground/src/pulse/visual.tsx:3601](../../playground/src/pulse/visual.tsx#L3601)

Each stage then polls its own message:

- [playground/src/pulse/visual.tsx:3679](../../playground/src/pulse/visual.tsx#L3679)
- [playground/src/pulse/visual.tsx:3680](../../playground/src/pulse/visual.tsx#L3680)

This already matches Genie reality: one conversation, many immutable messages.

### 4. Current dormant schedule is not the desired schedule

When `prompts.length > 1`, the runner uses:

- `CONCURRENCY = 2`
- `FIRST_LOAD_STAGE_1_DELAY_MS = 8_000`

Evidence:

- [playground/src/pulse/visual.tsx:4066](../../playground/src/pulse/visual.tsx#L4066)
- [playground/src/pulse/visual.tsx:4067](../../playground/src/pulse/visual.tsx#L4067)

This gives stage 0 a head start, but it is not the requested 3-5 second cadence and it is not template-batch aware. It is also dormant for the normal product path because only one prompt is produced.

### 5. Client-side staged reveal is not upstream staging

The staged reveal module is explicitly cosmetic after a single-shot answer:

- [playground/src/pulse/state/stagedReveal.ts:3](../../playground/src/pulse/state/stagedReveal.ts#L3)
- [playground/src/pulse/state/stagedReveal.ts:5](../../playground/src/pulse/state/stagedReveal.ts#L5)
- [playground/src/pulse/state/stagedReveal.ts:46](../../playground/src/pulse/state/stagedReveal.ts#L46)

The React wiring also gates reveal on `status === "DONE"`:

- [playground/src/pulse/visual.tsx:1171](../../playground/src/pulse/visual.tsx#L1171)

But AI Insights writes `COMPLETED` in the active runner:

- [playground/src/pulse/visual.tsx:4109](../../playground/src/pulse/visual.tsx#L4109)
- [playground/src/pulse/visual.tsx:4319](../../playground/src/pulse/visual.tsx#L4319)

Claude should either fix this compatibility bug or retire the cosmetic reveal once real section loading is restored. Do not count cosmetic reveal as proof of upstream section batching.

## Databricks Evidence

Reference feed:

```text
D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed
```

The feed supports the product model:

- Databricks Genie conversations contain multiple messages under one conversation.
- Messages have typed attachment lifecycles, not just plain text.
- Query result retrieval is a first-class path.
- Production integration should use official Genie APIs through the PulsePlay proxy, not private observed `/ajax-api` routes.

Useful evidence:

- [CAPTURE-RUNBOOK-20260523.md:319](../../../../Artifacts/Databricks_PulsePlay_Feed/DevToolMCPFeed/CAPTURE-RUNBOOK-20260523.md#L319)
- [CAPTURE-RUNBOOK-20260523.md:371](../../../../Artifacts/Databricks_PulsePlay_Feed/DevToolMCPFeed/CAPTURE-RUNBOOK-20260523.md#L371)
- [CAPTURE-RUNBOOK-20260523.md:430](../../../../Artifacts/Databricks_PulsePlay_Feed/DevToolMCPFeed/CAPTURE-RUNBOOK-20260523.md#L430)
- [CAPTURE-RUNBOOK-20260523.md:507](../../../../Artifacts/Databricks_PulsePlay_Feed/DevToolMCPFeed/CAPTURE-RUNBOOK-20260523.md#L507)

Local extraction from the live capture found one conversation id with multiple message ids and query-result calls:

```text
conversation_id: 01f156832d6711708d14dd62f4b912f5
message_id:      01f15685713913919b899b1bf542db91
message_id:      01f15685e7691993b59b32dfe9780c9b
```

One observed message moved from `ASKING_AI` with 9 attachments to `COMPLETED` with 10 attachments. The attachment kinds included progress, query, examples, final summary, visualization, and text. That is exactly why PulsePlay should preserve a typed answer envelope and per-section provenance rather than flattening everything into one markdown blob.

## Genie API Contract

This is already proven in [docs/findingProbeIssue.md](../findingProbeIssue.md):

- [docs/findingProbeIssue.md:13](../findingProbeIssue.md#L13)
- [docs/findingProbeIssue.md:145](../findingProbeIssue.md#L145)
- [docs/findingProbeIssue.md:183](../findingProbeIssue.md#L183)
- [docs/findingProbeIssue.md:200](../findingProbeIssue.md#L200)
- [docs/findingProbeIssue.md:216](../findingProbeIssue.md#L216)
- [docs/findingProbeIssue.md:290](../findingProbeIssue.md#L290)

Hard rule:

```text
One POST creates one new Genie message_id.
Multiple section calls can share one conversation_id.
Existing Genie message_id output cannot be appended to.
PulsePlay renderId is the UI grouping key.
```

Claude should not spend time trying to force one upstream `message_id`.

## Existing Backend Assets

### Sectioned orchestrator exists

`proxy/lib/sectionedOrchestrator.js` already implements the right schedule pattern:

- [proxy/lib/sectionedOrchestrator.js:72](../../proxy/lib/sectionedOrchestrator.js#L72)
- [proxy/lib/sectionedOrchestrator.js:97](../../proxy/lib/sectionedOrchestrator.js#L97)
- [proxy/lib/sectionedOrchestrator.js:116](../../proxy/lib/sectionedOrchestrator.js#L116)
- [proxy/lib/sectionedOrchestrator.js:303](../../proxy/lib/sectionedOrchestrator.js#L303)
- [proxy/lib/sectionedOrchestrator.js:309](../../proxy/lib/sectionedOrchestrator.js#L309)

It gives:

- first template section alone;
- remaining sections batched 1-3 at a time;
- optional spread between sections in the first post-head batch;
- `renderId` on every event.

### Sectioned SSE route exists

`/assistant/conversations/start-sectioned` exists:

- [proxy/server.js:6611](../../proxy/server.js#L6611)
- [proxy/server.js:6649](../../proxy/server.js#L6649)
- [proxy/server.js:6689](../../proxy/server.js#L6689)
- [proxy/server.js:6784](../../proxy/server.js#L6784)

It now supports Foundation Model first and Genie fallback:

- [proxy/server.js:6651](../../proxy/server.js#L6651)
- [proxy/server.js:6654](../../proxy/server.js#L6654)
- [proxy/server.js:6655](../../proxy/server.js#L6655)

### Genie section runner exists

`buildGenieRunSection()` already starts one conversation and sends follow-ups:

- [proxy/server.js:6038](../../proxy/server.js#L6038)
- [proxy/server.js:6079](../../proxy/server.js#L6079)
- [proxy/server.js:6083](../../proxy/server.js#L6083)
- [proxy/server.js:6095](../../proxy/server.js#L6095)
- [proxy/server.js:6112](../../proxy/server.js#L6112)

But this route is not the active Pulse AI Insights path. It is wired to the generic sectioned route and `UnifiedAssistantSurface`, while the canonical Pulse mode uses `PulseShell` and `visual.tsx`.

Evidence:

- [playground/src/App.tsx:221](../../playground/src/App.tsx#L221)
- [playground/src/App.tsx:1531](../../playground/src/App.tsx#L1531)
- [playground/src/components/UnifiedAssistantSurface.tsx:64](../../playground/src/components/UnifiedAssistantSurface.tsx#L64)
- [playground/src/components/UnifiedAssistantSurface.tsx:894](../../playground/src/components/UnifiedAssistantSurface.tsx#L894)

## What Is Working

- AI Insights has per-space result, busy, generated-at, stage-status, and stale-refresh state.
  - [playground/src/pulse/visual.tsx:1097](../../playground/src/pulse/visual.tsx#L1097)
- Empty running state can show placeholder cards.
  - [playground/src/pulse/visual.tsx:11200](../../playground/src/pulse/visual.tsx#L11200)
- Completed or partial sections can render as structured cards.
  - [playground/src/pulse/visual.tsx:11281](../../playground/src/pulse/visual.tsx#L11281)
- Pending placeholders append after completed sections.
  - [playground/src/pulse/visual.tsx:11432](../../playground/src/pulse/visual.tsx#L11432)
- Per-stage SQL/data maps already feed the renderer.
  - [playground/src/pulse/visual.tsx:5713](../../playground/src/pulse/visual.tsx#L5713)
- Cache restore shows completed content immediately and starts background refresh.
  - [playground/src/pulse/visual.tsx:4315](../../playground/src/pulse/visual.tsx#L4315)
- Client polling uses adaptive backoff.
  - [playground/src/pulse/genie.ts:1454](../../playground/src/pulse/genie.ts#L1454)
- Proxy start/follow-up routes map cleanly to Genie official APIs.
  - [proxy/server.js:3330](../../proxy/server.js#L3330)
  - [proxy/server.js:3374](../../proxy/server.js#L3374)

## What Is Missing Or Stale

### P0 - Prompt planning is single-shot

The active prompt builder turns the template into one full briefing prompt. This prevents true section loading.

Claude fix:

- Keep `buildFastHybridInsightsStagePrompts()` as a possible "instant single-call" mode if needed.
- Add a new section-plan builder for real staged AI Insights.
- Feed that section plan into `runInsights`.

Recommended name:

```ts
buildStagedHybridInsightsPlan(...)
```

### P0 - Real section titles are not used for cold-start skeletons

Because the plan has one title (`AI Insights briefing`), the placeholder grid cannot show real planned sections such as `HEADLINE`, `KPI SNAPSHOT`, `TRENDS`, `RISKS`, and `RECOMMENDED ACTIONS`.

Claude fix:

- `pendingStageTitles` should be real section titles or real batch titles derived from section titles.
- Prefer real section titles in the UI, even when the backend prompt groups 2-3 sections into one upstream message.

### P0 - No per-section `message_id` or batch provenance in `stageTraces`

`InsightsStageTrace` currently stores prompt, SQL, rows, content length, raw markdown, status, and duration, but not the upstream IDs:

- [playground/src/pulse/visual.tsx:679](../../playground/src/pulse/visual.tsx#L679)

Claude fix:

Add sanitized trace fields:

```ts
renderId?: string;
conversationId?: string;
messageId?: string;
sectionIds?: string[];
batchIndex?: number;
startedAt?: number;
completedAt?: number;
```

Expose them only in developer trace. Do not put raw tokens, secrets, or private URLs into cache.

### P0 - `pendingStageTitles` is global, not per-space

Stage statuses are per-space:

- [playground/src/pulse/visual.tsx:1100](../../playground/src/pulse/visual.tsx#L1100)

But pending stage titles are global:

- [playground/src/pulse/visual.tsx:3455](../../playground/src/pulse/visual.tsx#L3455)
- [playground/src/pulse/visual.tsx:4329](../../playground/src/pulse/visual.tsx#L4329)

Claude fix:

Use a per-space title map, matching `stageStatusesMap`.

### P1 - Cache loses per-stage provenance

`CachedInsightsEntry` stores aggregate content, status, SQL, query result, trace, view mode, titles, statuses, and generated time:

- [playground/src/pulse/insightsCache.ts:40](../../playground/src/pulse/insightsCache.ts#L40)

But it does not persist sanitized per-section trace/provenance. The type comment says `stageTraces` are memory-only:

- [playground/src/pulse/visual.tsx:653](../../playground/src/pulse/visual.tsx#L653)
- [playground/src/pulse/visual.tsx:676](../../playground/src/pulse/visual.tsx#L676)

Claude fix:

- Persist a narrow `stageTraceSummary` or `sectionEvidenceByTitle`, not full prompts.
- Include `title`, `conversationId`, `messageId`, `sqls`, query result shape, reused evidence markers, duration, status.
- Keep raw prompt text memory-only.

### P1 - Follow-up chips may race conversation seeding

Insights follow-up chips call `setConversationMap()` and then immediately call `runAssistant()`:

- [playground/src/pulse/visual.tsx:6119](../../playground/src/pulse/visual.tsx#L6119)
- [playground/src/pulse/visual.tsx:6129](../../playground/src/pulse/visual.tsx#L6129)

React state may not be flushed before `runAssistant()` reads `conversationMap`.

Claude fix:

- Add `runAssistant(question, intent, { conversationIdOverride })`, or store the current Insights conversation id in a ref that `runAssistant` reads synchronously.
- Test that clicking an Insights follow-up calls `sendMessage(insightsConversationId)`, not `startConversation()`.

### P1 - Query-result enrichment may duplicate work

Proxy enrichment loops over query attachments and calls the same message-level query-result endpoint per missing attachment:

- [proxy/server.js:3397](../../proxy/server.js#L3397)
- [proxy/server.js:3401](../../proxy/server.js#L3401)
- [proxy/server.js:3406](../../proxy/server.js#L3406)

The Databricks feed shows messages can have multiple query attachments. Claude should inspect whether the official `/query-result` endpoint returns the relevant result for one message or needs per-attachment handling. If the current call is message-level, cache the fetched result once per `(conversationId, messageId)` during enrichment and avoid repeated identical GETs.

This is a real proxy-load reduction, not only a perception improvement.

### P1 - Validation retries trade accuracy for latency without section policy

AI Insights can auto-retry format validation:

- [playground/src/pulse/visual.tsx:3930](../../playground/src/pulse/visual.tsx#L3930)
- [playground/src/pulse/visual.tsx:3941](../../playground/src/pulse/visual.tsx#L3941)

Proxy validation retry can also add latency:

- [proxy/server.js:3576](../../proxy/server.js#L3576)
- [proxy/server.js:3676](../../proxy/server.js#L3676)

Claude fix:

- Make lead-section retries stricter because first paint must be trusted.
- Make later sections selective: retry only hard failures, not minor formatting drift.
- Prefer inline "needs review" or manual section retry over automatic 10-25 second delays for non-critical sections.

## Recommended Solution

### The best low-reconstruction path

Do not replace the screen. Add one small planning layer and wire it into the existing runner.

```text
Template preset -> SectionPlan -> BatchPlan -> existing runStage() -> existing renderer
```

### SectionPlan

Build from the selected template/preset/custom sections:

```ts
interface InsightsSectionPlanItem {
  id: string;              // canonical UPPER CASE, e.g. HEADLINE
  title: string;           // display title
  instruction: string;     // scoped section contract
  order: number;
  source: "universal" | "custom" | "sql";
  visible: boolean;
}
```

Rules:

1. Preserve template order.
2. The first enabled section becomes the lead.
3. Do not hardcode `HEADLINE` as the first section.
4. Skip SQL-only custom sections from the AI message plan, but keep their UI slots/result flow if they render separately.
5. Keep manual prompt and runtime override as single-call paths.

### BatchPlan

Recommended default:

```text
Batch 0: first template section alone
wait/spread: 0 ms

Batch 1: next 2 sections
delay after lead start or lead message id: 3-5 seconds

Batch 2: next 2-3 sections
delay after prior batch start/completion: 3-5 seconds

Batch N: remaining sections
```

Use 2 by default for Genie. Allow 3 for Foundation Model or fast/stable profiles.

Important tradeoff:

- If every section is a separate Genie message, provenance is cleaner but total turns increase.
- If each batch asks for 2-3 sections in one Genie message, total upstream turns drop and real latency improves, but provenance becomes batch-level unless SQL markers can split it.

For Rajesh's current goal of killing latency while preserving quality, the best default is:

```text
one upstream message for the lead section
one upstream message per following section batch
parse multiple markdown sections out of each batch response
store the same messageId on every section that came from that batch
```

That matches the "2 or 3 sections at a time" ask and reduces upstream calls.

### Proposed Default Batches

For the common default section order:

```text
Batch 0: HEADLINE
Batch 1: KPI SNAPSHOT + TRENDS
Batch 2: RISKS + RECOMMENDED ACTIONS
Batch 3: OPPORTUNITIES and/or custom tail sections
```

For a SWOT-like template:

```text
Batch 0: STRENGTHS
Batch 1: WEAKNESSES + OPPORTUNITIES
Batch 2: THREATS + RECOMMENDED ACTIONS
```

Again: first template section leads, regardless of preset.

## Real Latency Wins

Separate perception wins from real wins.

### Real backend wins

1. Batch 2-3 sections into one upstream Genie message after the lead.
   - Fewer POSTs, fewer polls, fewer query-result enrichments.
   - Preserves first useful paint.

2. Reduce prompt duplication.
   - Lead prompt carries the full context contract.
   - Later batch prompts carry compact section instructions plus "use prior conversation context".
   - Avoid repeating full fast-briefing contract in every message.

3. Use cached query/data context from the lead when possible.
   - `stageTraces` already captures SQL and query result.
   - Later prompts can reference a compact data summary instead of inviting Genie to regenerate equivalent SQL.

4. Cache per-section or per-batch outputs.
   - Today cache is all-or-nothing on final completion.
   - Store completed lead/batches so retrying a failed tail section does not re-burn the entire briefing.

5. Deduplicate proxy query-result fetches per message.
   - Databricks messages can have multiple query attachments.
   - Avoid repeated identical query-result calls where the official API is message-level.

6. Make validation retry policy section-aware.
   - Retry lead hard failures.
   - Avoid automatic long retries for secondary formatting drift.

### Perceived latency wins

1. Real planned-section skeletons immediately.
2. Lead section paints as soon as it completes.
3. Remaining sections stay as section-named placeholders.
4. Progress header shows live section/batch status and collapses after first content.
5. Stale cache stays visible during background refresh and never shrinks mid-refresh.

These perception wins matter, but they must not be reported as backend latency reduction unless network evidence proves fewer/faster upstream calls.

## Accuracy And Quality Wins

1. Template-order section plans prevent the model from over-producing or skipping hidden sections.
2. Batch prompts can include explicit "do not contradict prior section" guidance.
3. Each rendered section should carry `{ conversationId, messageId, batchId }` in dev trace.
4. SQL/data reuse should be honest:
   - original SQL for this section;
   - reused from another section;
   - batch-level SQL;
   - no SQL available.
5. Later sections should cite exact numbers from either their own response or the lead/batch data summary.
6. Follow-up chips should continue the same Insights conversation deterministically.

## Concrete Claude Implementation Plan

### Slice 0 - Keep the workspace honest

The workspace is already not green from prior unrelated changes. Claude should restore the hard gate first if asked to implement code:

- playground lint;
- playground full tests;
- playground build;
- proxy relevant tests.

Do not mix AI Insights loading work with broad layout cleanup.

### Slice 1 - Extract a pure section scheduler

Add a pure module, for example:

```text
playground/src/pulse/insightsSectionPlan.ts
```

Responsibilities:

- parse universal/custom section settings into `InsightsSectionPlanItem[]`;
- build `InsightsBatchPlan[]`;
- clamp batch size 1-3;
- first enabled section leads;
- default Genie delay 3-5 seconds;
- preserve manual/runtime override as single-call.

Tests:

- default order leads with `HEADLINE`;
- hidden `HEADLINE` leads with next visible section;
- custom preset leads with first custom/template section;
- 2-section and 3-section batch modes;
- SQL-only custom sections skipped from AI prompt plan;
- no duplicate section ids;
- batch delay clamping.

### Slice 2 - Feed plan into `runInsights`

In [playground/src/pulse/visual.tsx](../../playground/src/pulse/visual.tsx):

- replace the one-stage fast-hybrid default with the staged plan;
- build prompts per batch;
- run batch 0 first;
- after 3-5 seconds, run following batches with concurrency 2 or 3 based on profile/perf lever;
- keep `obtainMessage()` as the shared conversation mechanism;
- store per-batch `conversationId` and `messageId`;
- split batch markdown into section slots while preserving order.

Do not remove single-call manual prompt behavior.

### Slice 3 - Upgrade state shape without rebuilding UI

Add a section-run state layer and derive legacy props from it:

```ts
type SectionRunStatus =
  | "planned"
  | "queued"
  | "running"
  | "complete"
  | "error"
  | "skipped";

interface InsightsSectionRunState {
  id: string;
  title: string;
  order: number;
  batchIndex: number;
  status: SectionRunStatus;
  content: string;
  conversationId?: string;
  messageId?: string;
  startedAt?: number;
  completedAt?: number;
  sqls?: string[] | null;
  sqlReusedFromTitle?: string | null;
  queryResult?: { columns: string[]; rows: unknown[][] } | null;
  queryResultReusedFromTitle?: string | null;
  errorMessage?: string;
}
```

Then derive:

- `pendingStageTitles`;
- `stageStatuses`;
- joined markdown content;
- progress steps;
- SQL/data maps.

This keeps the current renderer and avoids a full rewrite.

### Slice 4 - Add provenance and cache summaries

Update `InsightsStageTrace` with IDs and batch metadata.

Update `CachedInsightsEntry` with a sanitized evidence summary. Do not cache full prompts.

### Slice 5 - Wire tests and proof

Required tests:

1. Prompt planning:
   - `buildStagedHybridInsightsPlan` returns real section titles and batch schedule.

2. AI Insights batching:
   - With 4 planned sections, mocked client receives:
     - one `startConversation`;
     - subsequent `sendMessage(conversationId)`;
     - distinct message ids;
     - one shared conversation id.

3. Batch parsing:
   - A batch response containing `## KPI SNAPSHOT` and `## TRENDS` fills two section slots.

4. Timing:
   - fake timers prove the first section starts immediately and next batch waits 3-5 seconds.

5. Stop:
   - stopping before delayed batch prevents new upstream messages and marks pending sections.

6. Cache:
   - cached section evidence restores SQL/data footer state without full prompts.

7. Follow-up chips:
   - clicking an Insights chip uses the Insights conversation id synchronously.

8. Proxy route-level Genie SSE:
   - `/assistant/conversations/start-sectioned` with Genie profile emits one `renderId`, one conversation id, and multiple message ids.

9. Playwright/network probe:
   - add or extend a probe to record `startCount`, `followupCount`, `pollCount`, `uniqueConversationIds`, `messageIds`, and first-section paint time.

## Acceptance Criteria

Claude should not call the AI Insights loading fix done until all of these are true:

1. Cold start shows placeholders for real planned section titles, not one generic `AI Insights briefing`.
2. The first selected-template section starts immediately and owns the first upstream message.
3. Later sections start in batches of 2 or 3 after a 3-5 second delay/spread.
4. All Genie section/batch messages share one `conversation_id`.
5. Every upstream message has its own `message_id`.
6. The UI groups everything into one visible PulsePlay answer keyed by `renderId` or local run id.
7. Developer trace exposes per-section or per-batch `conversationId` and `messageId`.
8. Completed sections render as soon as their batch lands; unfinished sections remain named skeletons.
9. Stop/cancel prevents delayed future batches from starting.
10. Cache restore does not lose evidence/provenance needed for section SQL/data actions.
11. Existing manual prompt/runtime override behavior still works as a single-call path.
12. Network/probe evidence proves the intended call pattern.

## Do Not Do

- Do not try to append to an existing Genie `message_id`.
- Do not start a new conversation per section.
- Do not claim client-side reveal is real upstream staging.
- Do not rebuild AI Insights UI chrome.
- Do not revive retired `AISidebar.tsx` for this work.
- Do not hide section failures behind a generic completed state without inline evidence.
- Do not cache full raw prompts or secrets.
- Do not increase default Genie concurrency above 3.
- Do not make `HEADLINE` hardcoded first for every preset; first template section owns the lead.

## Suggested Claude Prompt

Use this directly when handing off:

```text
Read docs/research/AI_INSIGHTS_SECTION_LOADING_CLAUDE_HANDOFF_2026-05-27.md first. Implement AI Insights real section loading without reconstructing the screen. Current normal AI Insights is single-shot because buildFastHybridInsightsStagePrompts returns one "AI Insights briefing" stage, so the existing shared-conversation batch runner is bypassed. Build a template-ordered section plan: first enabled section starts immediately, later sections run in batches of 2-3 after a 3-5 second delay/spread, all using one Genie conversation_id and distinct immutable message_id values. Keep one visible PulsePlay answer grouped by renderId/local run id. Preserve manual/runtime override as single-call. Add tests proving one startConversation, follow-up sendMessage calls on the same conversation, distinct message ids, real section placeholders, batch parsing, stop/timer cleanup, cache evidence summaries, and follow-up chip conversation continuation. Mantra: stay uniform, stay simple, stay lean, stay clean.
```
