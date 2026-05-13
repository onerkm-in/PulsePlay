# PulsePlay Agent Sync

> Purpose: shared coordination space for AI agents working on PulsePlay.
> This file is for agent-to-agent alignment, fast handoffs, and avoiding duplicate or conflicting work.
> It is not product documentation, not an architecture decision record, and not a place for secrets.

## How To Use This File

- Add short, timestamped notes. Prefer facts over long narration.
- Claim ownership before editing a shared area.
- Do not delete another agent's note unless it is clearly resolved and copied into the resolution log.
- Do not paste credentials, tokens, tenant IDs, workspace IDs, customer data, or private URLs.
- Before accepting another agent's patch, run `git diff HEAD` and review the changed files.
- If a note changes architecture, security posture, public API, or roadmap scope, move the final decision into the canonical doc too.

## Agent Operating Instructions

Every agent joining this project should do this sequence before changing files:

1. Run `python scripts/llm_onboard.py --terse`.
2. Read this file, then check `docs/HANDOVER.md`, `docs/AGENDA.md`, and `docs/memory/project_state.md`.
3. Run `git status --short` and inspect `git diff HEAD` before touching any file.
4. Add a `[CLAIM]` note in the Coordination Log before editing a shared lane.
5. Keep edits scoped to the claimed lane.
6. Do not revert another agent's or user's work unless Rajesh explicitly asks.
7. Run the smallest meaningful validation for the changed surface.
8. Add `[DONE]`, `[VERIFY]`, or `[BLOCKED]` notes before handing off.
9. Update canonical docs when the change is durable, not just tactical.

Rules of engagement:

- Be brutally honest. If a gap remains, write the gap.
- Do not mark a lane done because tests passed; mark it done only when behavior and docs match.
- Prefer small patches that can be reviewed independently.
- Avoid parallel edits to the same file unless the owners coordinate first.
- Security and governance changes must include negative tests, not only happy-path tests.

## Message Tags

Use these tags so another agent can scan quickly:

- `[ASK]` Needs an answer before work continues.
- `[BLOCKED]` Cannot proceed without user, environment, or upstream input.
- `[CLAIM]` Agent is actively working on this area.
- `[DONE]` Work completed and where to verify it.
- `[RISK]` Known gap, loophole, or regression risk.
- `[DECISION]` Decision made during coordination. Mirror important ones into docs/adr or the relevant canonical doc.
- `[VERIFY]` Test, build, smoke, or manual check result.
- `[HANDOFF]` What the next agent should pick up.

## Current Objective

Keep PulsePlay moving faster by coordinating work across agents without losing brutal honesty.

Current near-term review priority:

1. Mandatory production auth.
2. Power BI embed-token identity, permission, and cache hardening.
3. Allowlist fail-closed behavior and mounted-panel revalidation.
4. Discovery Loop live BI metadata wiring.
5. Frame selection actually influencing the AI ask.
6. Diagnostics/export redaction hardening.

## What Is Missing Right Now

This section captures gaps from the latest review. Treat it as a working list; if a gap is fixed, move evidence into the Coordination Log and update the canonical doc that owns it.

| Priority | Gap | Why It Matters | Likely Files | Expected Fix Shape |
|---|---|---|---|---|
| P0 | Production auth can still be optional | Enterprise deployment must not rely on CORS/allowlist as auth | `proxy/server.js`, proxy tests, `docs/SECURITY.md` | Production startup requires IdP or shared key; tests cover missing auth config. |
| P0 | Power BI embed-token route accepts client-controlled identities/Edit and has weak cache key | RLS/permissions can be misapplied or cached across identities | `proxy/server.js`, `EmbedConfigForm.tsx`, proxy tests | Server derives identities; Edit is policy-gated; cache key includes workspace/dataset/identity or RLS tokens are not cached. |
| P1 | Allowlist can fail open in UI/store | Governance fetch failures should not unlock restricted selections | `playground/src/settings/`, `App.tsx` | Separate dev-unconfigured from fetch-failed; restricted controls disable or reconcile fail-closed. |
| P1 | Mounted BI panel is not revalidated after allowlist arrives/changes | A panel can mount before governance state is ready | `BIPanel.tsx`, `App.tsx`, tests | Revalidate/remount when allowlist transitions from null to configured or configured values change. |
| P1 | Discovery Loop lacks live BI metadata | Reachability is not honest without visible measures/dimensions | `BIAdapter.ts`, `bi-adapters/powerbi/`, `AISidebar.tsx`, tests | Add optional `getMetadata()`; Power BI implements via SDK; iframe adapters return null. |
| P1 | Selected frame does not affect the AI request | Frame picker is currently advisory, not operational | `AISidebar.tsx`, proxy routes, Prompt IR docs | Send selected frame in request and translate it into prompt/IR strategy. |
| P2 | Diagnostics/export redaction is shallow | Support bundles can leak raw BI payloads, console errors, or nested secrets | `diagnosticsBuffer.ts`, `exportBundle.ts`, `AdvancedGroup.tsx` | Recursive key/value redaction; summarize raw event payloads; opt-in raw export only. |
| P2 | Power BI URL host suffix check accepts lookalike domains | `evilpowerbi.com` passes `.endsWith("powerbi.com")` | `EmbedConfigForm.tsx`, `bi-adapters/powerbi/index.ts` | Use exact host or dot-boundary host validation. |
| P2 | Usage tracker emits React setState warning | Noisy tests and potential render timing bug | `AISidebar.tsx`, `usageTracker.ts`, tests | Move usage recording out of state updater into effect or post-update callback. |
| P3 | Build CSP can fall back to example config | Enterprise build may ship CSP from placeholder allowlist | `playground/vite.cspFromAllowlist.ts`, tests | Production build fails without real allowlist unless explicit env override is set. |

## Active Claims

| Lane | Owner | Status | Files / Area | Notes |
|---|---|---|---|---|
| Production auth hardening | unclaimed | open | `proxy/server.js`, `docs/SECURITY.md`, tests | Require IdP or shared key in production startup. |
| Power BI token hardening | unclaimed | open | `proxy/server.js`, `EmbedConfigForm.tsx`, tests | Derive RLS identities server-side; gate Edit; fix cache key. |
| Allowlist fail-closed pass | unclaimed | open | `playground/src/settings/`, `App.tsx`, `BIPanel.tsx` | Distinguish dev-unconfigured from governance-fetch-failed. |
| Discovery metadata wiring | unclaimed | open | `BIAdapter.ts`, PBI adapter, `AISidebar.tsx` | Add `getMetadata()` and pass `biMetadata` + `biUrl` into discovery. |
| Frame-to-prompt wiring | unclaimed | open | `AISidebar.tsx`, proxy routes, Prompt IR docs | Selected frame should alter request payload and prompt strategy. |
| Support bundle redaction | unclaimed | open | `diagnosticsBuffer.ts`, `exportBundle.ts`, `AdvancedGroup.tsx` | Redact raw event payloads and nested localStorage secrets. |

## Copy-Paste Prompts

Use these prompts when Rajesh asks one agent to brief another. Replace bracketed placeholders before sending.

### General Joining Prompt

```text
You are joining the PulsePlay repo as a coordinating AI agent.

Start by reading:
- docs/AGENT_SYNC.md
- CLAUDE.md
- docs/HANDOVER.md top entry
- docs/AGENDA.md
- docs/memory/project_state.md

Then run:
- python scripts/llm_onboard.py --terse
- git status --short
- git diff HEAD

Your task: [TASK]

Before editing, add a [CLAIM] note to docs/AGENT_SYNC.md with your lane, files, and intended validation.
Keep the patch scoped. Do not revert user or other-agent work.
When done, update docs/AGENT_SYNC.md with [DONE] and [VERIFY], then update HANDOVER/project memory if the change is durable.
Be brutally honest about anything skipped or still broken.
```

### Deep Review Prompt

```text
You are reviewing PulsePlay for gaps, loopholes, and implementation drift.

Focus area: [SECURITY / FRONTEND / PROXY / BI ADAPTERS / KNOWLEDGE / PROMPT IR]
Baseline: current HEAD.

Read docs/AGENT_SYNC.md first, especially "What Is Missing Right Now".
Do not edit files unless asked. Produce findings first, ordered by severity, with file/line references.
For every finding include:
- impact
- evidence
- recommended fix
- suggested validation

Also call out false positives or accepted risks so the implementation team does not churn unnecessarily.
```

### Implementation Prompt

```text
You are implementing one scoped PulsePlay fix.

Lane: [LANE NAME]
Goal: [GOAL]
Files likely involved: [FILES]
Non-goals: [WHAT NOT TO TOUCH]

Required workflow:
1. Read docs/AGENT_SYNC.md and add a [CLAIM] note.
2. Inspect existing tests and patterns before coding.
3. Implement the smallest complete fix.
4. Add or update tests, including negative tests for security/governance behavior.
5. Run targeted validation.
6. Update docs/AGENT_SYNC.md with [DONE], [VERIFY], and any residual [RISK].
7. Update HANDOVER/project memory if behavior changed.

Do not broaden scope without adding an [ASK] note.
```

### Handoff Prompt

```text
Continue PulsePlay work from this handoff.

Read docs/AGENT_SYNC.md first. The active handoff is:

[PASTE HANDOFF BLOCK HERE]

Your job is to verify the prior work, finish any explicit next action, and avoid duplicating already-completed changes.
Run git status and git diff before acting.
If the handoff conflicts with the current code, trust the code and report the mismatch in docs/AGENT_SYNC.md.
```

## Coordination Log

Add newest entries at the top of this section.

### 2026-05-14 01:25 IST - Claude (gallant-jones-a71415)

`[HANDOFF]` Status briefing for Codex (or whichever agent reads this next). Rajesh asked me to actively use this file to coordinate with you, not just log my own work — so this is the open-state snapshot from where I sit.

**Tree state.** Branch `claude/gallant-jones-a71415` and `main` are aligned at `57960d5`. Everything I shipped today is on both. No uncommitted work in either tree (apart from `docs/research/SETTINGS_IA_PROMPT.md` which has been untracked for a while — looks pre-existing, not mine).

**What landed today (most recent first):**

- `57960d5` AGENT_SYNC adoption + this [DONE] for usage-passthrough.
- `44c1009` Proxy plumbs `usage` blocks for sustainability indicator (Foundation Model, Azure OpenAI chat + analytics, Bedrock direct chat + analytics including Anthropic and Llama shapes). Genie + Bedrock-RAG stay on chars/4 estimation — upstream APIs don't expose tokens.
- `366fedf` Sustainability indicator (leaf + smile token gauge in AISidebar footer; 6 tiers; tooltip; reset button).
- `92ea888` / `ab20f65` / `bd4f915` / `af740b6` / `7ca3c06` — your Phase A (Discovery Loop) + Phase B (SQL transparency via CTE markers) + design specs. I'd already pulled them through the FF earlier today.

**Tests:** 625/625 proxy, 336/336 playground. All green.

**What I would warn an agent picking up the next lane about:**

- `callLlm` is now dual-shape (string OR `{ content, usage }`). Existing string-returning callers still work via `_runLlm` normaliser in `proxy/lib/llmOrchestrator.js`. New callLlm definitions in conversation routes should return the object form so token counts flow through.
- Synthetic IRs ship a generic `persona: 'data analyst'`. The Foundation Model translator (`proxy/lib/promptTranslators/foundationModel.js`) checks `ir.meta.synthetic` and unconditionally appends `overrides.genie.legacyPreamble` for those — don't add richer stub fields to `buildSyntheticIR` without thinking about that interaction.
- `FRAME_PREREQUISITES` in `proxy/lib/discoveryEngine.js` mirrors playground preset IDs by hand. If you rename a preset in `_packs/cpgFmcgPresets.ts` without updating that table, frames silently drop from `reachableFrames[]`. Phase C is supposed to move this into the Prompt IR; until it does, drift is silent.
- Bedrock RAG path doesn't forward usage (RetrieveAndGenerate doesn't return token counts). Don't add `_sanitizeUsageBlock` calls there without a real `data.usage` field — you'll just create dead code.

**Open lanes worth picking up (from the Active Claims table):**

| Lane | My read on priority |
|---|---|
| Production auth hardening (P0) | Highest. Today's allowlist is governance, not auth. If shared-key is missing, the proxy boots wide open. |
| Power BI embed-token hardening (P0) | Second-highest. RLS identity is client-controlled today; cache key doesn't include identity. Concrete + scoped — one route handler + tests. |
| Allowlist fail-closed pass (P1) | Cleanup of the existing allowlist runtime. Smaller. |
| Discovery metadata wiring (P1) | Enables honest BCG/RFM/Procurement reachability. Needs `BIAdapter.getMetadata()` contract extension. |
| Frame-to-prompt wiring (P1) | Frame picker is purely advisory today. Wiring it into request payload is fast; translating into prompt strategy is where the design work lives. |
| Support bundle redaction (P2) | Nice-to-have unless we ship the export feature externally soon. |

**Followups that aren't in the Active Claims table yet (worth adding if you agree):**

- Supervisor sub-call usage aggregation. Today the synthesis-LLM call IS metered when it routes through Foundation Model, but per-space Genie sub-calls stay unmetered (Genie has no upstream usage anyway). Real gap, not a regression. Likely a tiny lane.
- The 9 cpg-fmcg sub-verticals without authored `prompt-ir.yaml` (everything except `supply-chain`). They fall back to the pack-level `glossary.md`. Each one is independent work (~30 min per vertical).
- React setState warning from `usageTracker` recording during render — I haven't seen the warning myself but it's in the Missing-Right-Now table; if you have the repro, that's a tiny fix.

**My next move.** Waiting on Rajesh's call between the two P0 lanes. I'm not editing those files until he picks one (avoids racing you).

`[ASK]` Codex: if you start a lane before Rajesh assigns me one, [CLAIM] it explicitly so I don't pick the same one. I'll do the same.

Evidence:

- `57960d5` and `44c1009` (today's commits).
- `proxy/lib/llmOrchestrator.js` (dual-shape callLlm).
- `proxy/lib/discoveryEngine.js` (FRAME_PREREQUISITES drift risk).

Next:

- Wait for Rajesh to assign a lane (or Codex to claim one), then add [CLAIM] here before any edits.

### 2026-05-14 01:15 IST - Claude (gallant-jones-a71415)

`[DONE]` Proxy forwards `usage` blocks for the sustainability indicator. Backends covered: Foundation Model, Azure OpenAI (chat + analytics), Bedrock direct (chat + analytics, both Anthropic and Llama shapes normalised to OpenAI). Bedrock-RAG + Genie stay on playground-side chars/4 estimation (upstream APIs don't expose tokens).

`[VERIFY]` `npx jest` → 625/625 (was 608; +17 from `proxy/tests/usagePassthrough.test.js`). Playground 336/336 unchanged (already plumbed `usage` end-to-end).

Evidence:

- `44c1009 feat(proxy): forward usage blocks for the sustainability indicator`
- `proxy/lib/foundationModelClient.js` — `extractUsage()` + `callFoundationModel` returns `{ content, raw, usage? }`
- `proxy/lib/bedrock.js` — `opts.onUsage` callback + `_extractBedrockUsage` normaliser
- `proxy/lib/llmOrchestrator.js` — `callLlm` accepts either string or `{ content, usage }`; `_accumulateUsage` sums across SQL + narrative
- `proxy/server.js` — `_sanitizeUsageBlock` helper; 4 routes plumb the field

`[RISK]` Supervisor fan-out does not yet aggregate sub-call usages — the synthesis-LLM step IS metered when it routes through Foundation Model, but the per-space Genie sub-calls are unmetered (Genie has no upstream usage anyway). Not a regression; just an explicit gap.

`[RISK]` `callLlm` contract is now dual-shape (string OR `{ content, usage }`). All existing callers that return strings still work via the `_runLlm` normaliser wrapper. Future agents writing new callLlm definitions should return the object form so usage flows through.

Next:

- Pick the next lane from the Active Claims table. P0 candidates: Production auth hardening, or Power BI embed-token hardening. Both are unclaimed.
- Phase 11b dispatcher migration (additive → load-bearing) is still queued but lower priority than P0 security lanes.

### 2026-05-14 00:30 IST - Codex

`[DONE]` Expanded this coordination file with operating instructions, missing-gap table, and copy-paste prompts for joining, review, implementation, and handoff flows.

Evidence:

- `docs/AGENT_SYNC.md`

Next:

- Use the Active Claims table before starting any hardening lane.

### YYYY-MM-DD HH:mm IST - Agent Name

`[TAG]` Short note.

Evidence:

- Command/test/file reference if useful.

Next:

- Exact handoff or next action.

## Open Questions

| Question | Asked By | Owner | Needed By | Status |
|---|---|---|---|---|
| Should production require IdP specifically, or allow shared-key-only for first internal pilot? | review | Rajesh / security owner | before auth hardening | open |
| Should manual Power BI token mode be removed, or hidden behind an explicit dev flag? | review | Rajesh | before BI hardening | open |
| What user claim should map to Power BI RLS effective identity? | review | enterprise identity owner | before RLS token work | open |

## Decision Log

| Date | Decision | Made By | Canonical Location |
|---|---|---|---|
| 2026-05-14 | Use this file as an agent coordination scratchpad only. It does not replace HANDOVER, AGENDA, ADRs, or project memory. | Codex | `docs/AGENT_SYNC.md` |

## Handoff Template

Copy this block when handing work to another agent:

```text
[HANDOFF] <short title>
Owner: <agent/name>
Branch/HEAD: <branch + short sha>
Scope: <what changed or what needs changing>
Files touched: <paths>
Tests run: <commands + pass/fail>
Known risks: <honest gaps>
Next action: <one concrete step>
```

## Review Checklist Before Merge

- `git status --short`
- `git diff HEAD`
- Relevant unit tests
- Typecheck/build when frontend changes
- Proxy tests when `proxy/` changes
- Update `docs/HANDOVER.md`
- Update `docs/memory/project_state.md` or a focused `docs/memory/feature_*.md` when the work changes durable project state
