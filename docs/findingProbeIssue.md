# Finding: Genie REST cannot share one `message_id` across multiple section calls

**Date:** 2026-05-20
**Probed against:** `https://dbc-f88d29ce-4aa2.cloud.databricks.com`
**Space:** `01f13fe275b515608abb4182d0a37373`
**Probe script:** [scripts/probe-genie-message-api.js](scripts/probe-genie-message-api.js)
**Branch / latest commit at time of probe:** `main` @ `a5ba098`

---

## Current verdict — pause before implementing stitched Genie staging

Do **not** implement a same-Genie-`message_id` stitching path unless Databricks confirms a different private API contract. The live REST probe shows the public Genie contract is still:

- one `POST .../start-conversation` or `POST .../messages` creates one new immutable Genie `message_id`;
- subsequent calls can share the same `conversation_id`, but cannot append output onto an earlier `message_id`;
- the already-shipped PulsePlay `renderId` is the correct UI-level grouping key if the product wants one visible assistant answer.

The closest technically possible "stitched" version is therefore:

| Visible PulsePlay answer | Genie conversation | Genie messages |
|---|---|---|
| One `renderId` rendered as one assistant response | One shared `conversation_id` | Multiple upstream `message_id`s |

A stage-batched variant could reduce the upstream turns from one per section to one per stage:

1. `HEADLINE` -> Genie message 1
2. `KPI + TRENDS` -> Genie message 2
3. `RISKS + RECOMMENDED_ACTIONS` -> Genie message 3
4. `OPPORTUNITIES` -> Genie message 4

That would let PulsePlay render two sections from one staged result where applicable, while still keeping one user-facing `renderId`. But it is **not** the same as reusing one Genie `message_id`, and it may not solve the 3-4 minute perceived-latency problem because the stages are still sequential upstream work.

Recommendation for now: keep the shipped `renderId` envelope, pause the live Genie route change, and get confirmation from Databricks/Genie owners before building stage-batched stitching. If latency is the real priority, the stronger product path is likely a fast foreground answer plus background enrichment, not more sequential Genie calls.

---

## Follow-up shipped — Path A `renderId` envelope

Path A is now the implemented direction for the staged SSE contract:

- [proxy/lib/sectionedOrchestrator.js](../proxy/lib/sectionedOrchestrator.js) generates or preserves one `renderId` per orchestration and stamps it on every event.
- [proxy/server.js](../proxy/server.js) accepts optional `renderId` on `/assistant/conversations/start-sectioned`, passes it through, and includes it on terminal failure frames.
- [playground/src/hooks/useSectionedStream.ts](../playground/src/hooks/useSectionedStream.ts) exposes `renderId` and reuses it when `regenerate(sectionId)` posts a selective rerun.
- UI assessment found [playground/src/components/SectionedAnswer.tsx](../playground/src/components/SectionedAnswer.tsx) had lifecycle classes but no matching CSS; [playground/src/styles.css](../playground/src/styles.css) now styles the staged states.
- Validation at implementation time: proxy sectioned tests `59/59`; hook/parser + component tests `26/26`; full proxy `910/910`; playground lint clean; full playground `1063/1063`; playground build green.
- Browser visual evidence is saved at [docs/evidence/renderid-ui-smoke-2026-05-20](evidence/renderid-ui-smoke-2026-05-20).

The companion HAR file (`docs/dbc-f88d29ce-4aa2.cloud.databricks.com.har`) is not API-level proof for this finding. It contains Databricks UI asset loads plus `popproxy/health`, `data-rooms/.../value-index`, and telemetry, but no `/api/2.0/genie/*` calls. The empirical API evidence remains the live probe summarized below.

---

## 0. Background — the staged-rendering approach we discussed

Before the probe, we worked through several iterations of the staged section-rendering design. Capturing the full narrative here so the next session has the complete context.

### 0.1 The problem we were solving

The AI Insights panel renders a fixed taxonomy of sections (HEADLINE, KPI, TRENDS, RISKS, RECOMMENDED_ACTIONS, OPPORTUNITIES). Original behavior fanned out all sections in parallel against Genie — fast TTFB but:

- Genie's per-conversation rate limit thrashed under 6 simultaneous in-flight messages.
- Later sections couldn't see earlier sections' outputs because all 6 messages were submitted concurrently with no shared context yet completed.
- The UI flashed 6 empty skeletons that all resolved at roughly the same time — no visible "progress" feel.

### 0.2 What we designed

A **transport-agnostic, LLM-agnostic staged orchestrator** that:

1. Renders the **first section of the template alone** so the user immediately sees a real result (typically HEADLINE — but driven by template order, not hardcoded).
2. Then renders subsequent sections in **parallel batches of 2-3**, each batch waiting for the previous batch to complete (stage barrier) so later sections see earlier outputs in Genie's conversation memory.
3. Within a multi-section batch, applies a small `spreadMs` stagger so the first section in that batch can get a head start (mostly to give Genie a chance to update its conversation cache before the parallel siblings hit it).
4. All section calls share **one `conversation_id`** so context flows naturally between them.

The shape:

```js
// proxy/lib/sectionedOrchestrator.js
const DEFAULT_SCHEDULE = Object.freeze([
  { sections: ['HEADLINE'], spreadMs: 0 },
  { sections: ['KPI', 'TRENDS'], spreadMs: 2000 },
  { sections: ['RISKS', 'RECOMMENDED_ACTIONS'], spreadMs: 0 },
  { sections: ['OPPORTUNITIES'], spreadMs: 0 },
]);
```

And a `buildDefaultSchedule(sectionIds, { headSpreadMs, batchSize })` helper that:
- Filters non-string / empty section ids.
- Stage 0 = first remaining section id, alone.
- Subsequent stages batch `batchSize` (default 2, clamped to 1-3) sections.
- `headSpread` (default 2000 ms, max 30000 ms) applied only to the FIRST multi-section stage.
- Pure template order — no HEADLINE special-casing.

### 0.3 What's already shipped on `main`

| Commit | Change |
|---|---|
| `05639b6` | Initial schedule reshape — HEADLINE-first, then parallel batches. Added stage-barrier test in [proxy/tests/sectionedRoute.test.js](proxy/tests/sectionedRoute.test.js). |
| `a5ba098` | `buildDefaultSchedule` made pure-template-order (no HEADLINE hardcoding). Full test coverage in [proxy/tests/sectionedOrchestrator.test.js](proxy/tests/sectionedOrchestrator.test.js): empty / single / two / template-order / custom-order (KPI first) / six sections / batchSize=3 / batchSize clamping / headSpreadMs custom + max clamp / skip-empty. |

**Last green:** proxy 904/904, playground 1063/1063 at `a5ba098`. Build passes.

Consumed by `orchestrate()` in [proxy/lib/sectionedOrchestrator.js](proxy/lib/sectionedOrchestrator.js) and by `/assistant/conversations/start-sectioned` route in [proxy/server.js](proxy/server.js).

### 0.4 How the ask evolved during the session

| Iteration | What the user said | What it meant |
|---|---|---|
| 1 | "stage HEADLINE first" | First commit `05639b6` — HEADLINE alone, then parallel batches. |
| 2 | "stage the TEMPLATE's first section, not hardcoded HEADLINE" | Second commit `a5ba098` — pure template order. |
| 3 | "let's stick to one message_id" | Ambiguous — could mean Genie message_id OR UI logical id. |
| 4 | "within a conversation, one message_id" | Disambiguated to Genie level. Triggered the probe. |
| 5 | "you can access genie and databricks, use the creds we have" | Explicit permission to probe the live API. |

### 0.5 Why iteration 4 raised an immediate flag

Prior session notes (carried in [AGENTS.md](AGENTS.md) tripwires and [proxy/tests/genieSqlSections.test.js:10](proxy/tests/genieSqlSections.test.js#L10) comment) state that each section call gets a distinct Genie `message_id` under a shared `conversation_id`. That pattern is woven into [proxy/server.js](proxy/server.js) at multiple sites (lines 2880, 2899, 2910, 3066, 3145, 6636, 6651) — every code path that talks to Genie does `POST .../messages` and consumes a fresh `message_id` back.

So before writing any code for "one message_id", we needed to:
1. **Verify the constraint empirically** on the live API (not just trust the inferred-from-code understanding).
2. **Exhaustively probe** for an undocumented endpoint that might let us append to / continue an existing message.
3. **Only then** propose a concrete path forward.

That's what triggered the probe in Sections 2 and 3 below.

---

## 1. The ask

User wants staged section rendering (HEADLINE alone, then KPI+TRENDS in parallel, then RISKS+RECOMMENDED_ACTIONS, then OPPORTUNITIES) to all share **one Genie `message_id`** within one shared `conversation_id`, so that:

- Later sections see earlier sections' outputs in Genie's conversation memory (this already works via shared `conversation_id`).
- The UI / chat history shows ONE assistant message that progressively fills in, not N separate Genie messages.

Existing code today does shared `conversation_id` but **N distinct `message_id`s** (one per section). The user wants to collapse those to **one** `message_id`.

---

## 2. Empirical probe (live API, real PAT)

Five-step probe executed against the real Databricks workspace:

### Step 1. `GET /api/2.0/genie/spaces/{spaceId}`
Status `200`. Returns space metadata only (`space_id`, `title`, `description`, `warehouse_id`, `parent_path`). Nothing about message lifecycle.

### Step 2. `POST /api/2.0/genie/spaces/{spaceId}/start-conversation`
```json
{ "content": "Probe: what tables are in this space?" }
```
Status `200`. Response shape:
```json
{
  "message_id": "01f1541258621e208359e52ea03daec6",
  "message": { "id": "01f1541258621e208359e52ea03daec6", "status": "SUBMITTED", "content": "...", "auto_regenerate_count": 0, ... },
  "conversation_id": "01f154125858150886e60bd2da9e8335",
  "conversation": { "id": "01f154125858150886e60bd2da9e8335", "title": "Probe: what tables..." }
}
```

Genie allocates `message_id = 01f1541258621e208359e52ea03daec6` on this single LLM turn.

### Step 3. Poll the first message until completion
`GET /api/2.0/genie/spaces/{spaceId}/conversations/{convId}/messages/{msgId}`

Status moves `SUBMITTED` → `ASKING_AI` → `COMPLETED` over ~4 s. Final message envelope shape:
```jsonc
{
  "id": "01f1541258621e208359e52ea03daec6",
  "status": "COMPLETED",
  "content": "Probe: what tables are in this space?",
  "attachments": [
    { "text": { "content": "There is one table ... vw_genie_sales_performance ..." }, "attachment_id": "..." },
    { "suggested_questions": {}, "attachment_id": "..." }
  ],
  "auto_regenerate_count": 0
}
```

Important observations:
- One Genie message has ONE `content` (the user prompt) and ONE `attachments[]` array (the model's structured output).
- `attachments[]` is populated by Genie at completion; there is no client-side API to append to it later.
- Each attachment is one of `text` / `query` / `suggested_questions` / etc., produced inside the same LLM completion.

### Step 4. `POST .../{convId}/messages` (a *second* message in the same conversation)
```json
{ "content": "Probe-2: based on prior context, list the top-level columns of the first table you mentioned." }
```
Status `200`. Response:
```json
{
  "id": "01f154125ba51610839410033154e90e",
  "conversation_id": "01f154125858150886e60bd2da9e8335",
  "status": "SUBMITTED",
  "content": "Probe-2: based on prior context...",
  "message_id": "01f154125ba51610839410033154e90e"
}
```

**A brand new `message_id = 01f154125ba51610839410033154e90e` is allocated.** Same `conversation_id`. There is **no** way on this endpoint to say "attach this prompt's output to the previous message_id". The contract is: one POST = one new message.

### Step 5. Probe four hypothetical append endpoints
All four returned **`404 Not Found`**:

| Method | URL | Status |
|---|---|---|
| POST | `.../messages/{firstMsgId}/follow-up` | 404 |
| POST | `.../messages/{firstMsgId}/append` | 404 |
| POST | `.../messages/{firstMsgId}/continue` | 404 |
| POST | `.../messages/{firstMsgId}/sections` | 404 |

No undocumented append/continue surface on a message. Genie's REST contract is strict: messages are immutable once produced.

---

## 3. Conclusion

**It is upstream-impossible to share one Genie `message_id` across multiple section calls.**

The Genie REST API:
- Always returns a new `message_id` on `POST .../messages` (and on `POST .../start-conversation`).
- Has no append / continue / follow-up / sections sub-resource on an existing `message_id`.
- Treats a message as an immutable transcript pair of `(content, attachments[])` produced by exactly one LLM completion.

The "shared conversation_id, fresh message_id per section" pattern PulsePlay already uses (as documented in [proxy/tests/genieSqlSections.test.js](proxy/tests/genieSqlSections.test.js#L10) and visible in [proxy/server.js:2880](proxy/server.js#L2880)) is **the only Genie-native pattern available** for multi-section workflows.

This re-confirms — empirically, on the live API, with real credentials — the constraint that was previously inferred from documentation and code surface. It is now **proven**, not inferred.

---

## 4. Paths forward (require user decision before coding)

Since the literal Genie-level "one message_id" is impossible, two architectural paths actually achieve what we believe the user wants (one logical assistant turn from the user's POV that fills in section by section):

### Path A — UI envelope / `renderId` grouping (recommended)

Generate a stable `renderId` (UUID) at orchestrate-start in [proxy/lib/sectionedOrchestrator.js](proxy/lib/sectionedOrchestrator.js). Emit it on every SSE frame for every section. In [playground/src/components/AISidebar.tsx](playground/src/components/AISidebar.tsx) (and any chat-history store), key all assistant frames by `renderId` instead of by Genie `message_id`. The chat history shows ONE assistant message that progressively fills in. Genie still gets N message_ids under the hood — but the UI never exposes them as separate turns.

**Pros**
- Cheapest implementation. Pure additive change to SSE frame schema + UI grouping.
- Preserves staged-rendering benefit (first section streams immediately, later sections in parallel batches per [proxy/lib/sectionedOrchestrator.js](proxy/lib/sectionedOrchestrator.js)).
- No upstream-AI behavior change. No retrain / reprompt risk.
- Backward compatible: clients that don't know `renderId` still see N messages, same as today.

**Cons**
- Conceptually, the Genie audit trail still shows N messages per turn — a power user inspecting Genie space history sees N separate messages. (Internal-only observability cost; not user-facing.)

**Estimated scope:** ~6 small files. New `renderId` field on SSE frame schema, orchestrator UUID generation, UI keying change, two test updates (`sectionedOrchestrator.test.js`, `sectionedRoute.test.js`), one HANDOVER entry.

### Path B — Foundation Model single-streaming-call

Skip Genie entirely for the staged render. Use the `foundation` profile (`databricks-meta-llama-3.1-405b-instruct`) and stream ONE completion that emits all sections as a structured delta stream (JSON lines with a `section: "HEADLINE" | "KPI" | ...` discriminator). Proxy parses section boundaries from the stream and emits section-scoped SSE frames progressively.

**Pros**
- One real LLM call, one logical message, sections rendered progressively from one upstream stream.
- True "one message_id" semantically (it's a Foundation Model call, not a Genie message — but it's literally one upstream identity).
- Lower upstream latency (one model invocation vs N).

**Cons**
- Loses Genie's SQL execution + query attachments — Foundation is pure text. If sections need real query results (KPI numbers, RISKS data tables), this path doesn't work without bolting Genie back on for data lookups.
- Heavier implementation: streaming response parser, section-boundary detection in the stream, error recovery when one section's JSON is malformed mid-stream, validator integration in [proxy/lib/insightsValidator.js](proxy/lib/insightsValidator.js).
- Loses the "later sections see earlier outputs in Genie conversation memory" property (the whole prompt is one shot, so sections see each other only via prompt engineering, not via memory).
- Higher prompt-engineering risk: getting one 405B-instruct prompt to reliably emit all five sections in clean JSON deltas is non-trivial.

**Estimated scope:** ~12+ files. Streaming foundation client extension, section-stream parser, route rework, multiple tests, prompt iteration cycles.

---

## 5. Recommendation

**Pick Path A.** The user-visible outcome ("one assistant message that fills in section by section") is achieved at a fraction of the cost, with no upstream-AI risk, with full preservation of:
- Genie SQL execution and query attachments per section
- Earlier-section context being available to later sections (via shared `conversation_id`)
- The staged-rendering schedule already shipped in [proxy/lib/sectionedOrchestrator.js](proxy/lib/sectionedOrchestrator.js)

Path B is correct *only* if PulsePlay's strategic direction is to move staged rendering off Genie entirely. That is a much larger architectural shift and should be tracked separately under [docs/DATABRICKS_FORWARD_STRATEGY.md](docs/DATABRICKS_FORWARD_STRATEGY.md), not bundled into this one-message_id ask.

---

## 6. Remaining open questions

1. Should `renderId` ALSO be persisted on each Genie message (e.g. via a custom tag in the prompt content) so that an audit later can reconstruct which N messages belonged to one render? Or is proxy → SSE → UI grouping enough?
2. Does the chat-history store / persistence layer need a schema change to carry `renderId`, or can it stay client-side-only?
3. When the live Genie staged route lands, should it expose the upstream per-section `message_id`s in a developer trace while keeping the user-facing answer grouped by `renderId`?

---

## 7. Tripwire added to AGENTS.md / CLAUDE.md

Added to "Tripwires that DO apply to PulsePlay":

> **Genie messages are immutable; one POST = one new `message_id`**
> Empirically verified 2026-05-20 against the live workspace ([docs/findingProbeIssue.md](docs/findingProbeIssue.md)). There is no `/follow-up`, `/append`, `/continue`, or `/sections` sub-resource on `.../messages/{id}`. Multi-section flows MUST allocate N message_ids under a shared `conversation_id`. If "one logical assistant turn" is needed in the UI, key it on a PulsePlay-generated `renderId`, not on Genie's `message_id`.

---

## 8. Artifacts left on disk for resume

- [scripts/probe-genie-message-api.js](scripts/probe-genie-message-api.js) — reusable probe. Reads creds from [proxy/config.json](proxy/config.json) (gitignored). Safe to re-run; spawns one probe conversation per invocation. Not committed (one-off research tool).
- Probe conversation in the Genie space: `conversation_id = 01f154125858150886e60bd2da9e8335`. Two messages exist on it (`01f1541258621e208359e52ea03daec6` and `01f154125ba51610839410033154e90e`). Safe to leave or delete — it's just a test conversation.

---

## 9. State at end of session

- **Path A implemented:** `renderId` is now in the sectioned SSE contract and the hook preserves it across selective reruns.
- **Test counts at follow-up green:** proxy 910/910, playground lint clean, playground 1063/1063, playground build green.
- **Uncommitted from prior sessions** (NOT touched by the renderId follow-up): DayCycleBubble revert in `playground/src/App.tsx`, deletion of `playground/src/components/DayCycleBubble.tsx`, `playground/package.json` + `package-lock.json` modifications. Resume should decide whether to commit-as-cleanup or revert these.
- **HAR status:** `docs/dbc-f88d29ce-4aa2.cloud.databricks.com.har` was inspected but should not be treated as the API proof artifact.

---

**Resume here next session by:**
1. Reading this file.
2. Treating `renderId` as the UI grouping key for staged answers.
3. Wiring the live Genie staged route / AISidebar integration when ready, while preserving N upstream Genie `message_id`s under one shared `conversation_id`.
4. Deciding whether `renderId` needs durable persistence for audit reconstruction.
