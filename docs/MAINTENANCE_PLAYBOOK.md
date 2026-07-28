# Maintenance Playbook

> How bugs and change requests get addressed in this codebase for the long run — by any
> maintainer: a human, an LLM session, or (the realistic case) the pair. This codebase is
> ~171k lines of source across 360+ files, written largely by LLMs across many sessions.
> **Nobody will ever hold it all in their head, and the process below is designed so nobody
> has to.** Safety comes from executable contracts (tests), WHY-documentation, and this loop —
> not from total comprehension.

## 1. The bug/CR loop (non-negotiable order)

1. **Reproduce first.** Headed (chrome-devtools MCP) for UI, curl/jest for proxy. No fix
   without a reproduction — "should fix it" is how regressions ship.
2. **Write the failing test BEFORE the fix** when feasible. It becomes the regression pin.
3. **Root-cause with evidence, not vibes.** For anything non-obvious, fan out an Explore
   agent with a precise brief; require **file:line evidence** in its answer, and verify the
   claims before acting (agents have asserted wrong file:line before — see
   `project_analysis_fixall_2026_06_05` memory).
4. **Minimal fix at the named lines.** Resist drive-by refactors inside a bugfix commit.
5. **Run the owning suite, then the full suite** (`proxy: npx jest` / `playground:
   npx tsc --noEmit && npx vitest run`). A contract test failing on an *intended* change is
   the system working — update the pin in the same commit and say so in the message.
6. **Commit per logical unit** with a WHY-message (symptom → root cause → fix → evidence).
   Fast-forward `main`.
7. **Log it**: HANDOVER entry (LIFO, never reorder) + memory file if a durable lesson.
8. **Retire debt**: every substantial session takes one `docs/DEBT_REGISTER.md` item or
   shrinks D5 (visual.tsx). Addition without subtraction is how this codebase dies.

Proof this loop works across models: the tile-destruction bug (root-caused to one commit's
boot purge), the briefing-cache loss (root-caused to two context-derived hash segments),
and the dark-mode Decisions break were all found, fixed, pinned, and logged this way — by
different LLMs in different sessions, none of whom "knew" the whole codebase.

## 2. The contract tests that police every future change

These are the tripwires that let a maintainer change code they've never read. **Never
weaken one to make a change pass — a red contract test on an intended change means update
the pin in the same commit and explain it.**

| Contract | Test | What it protects |
|---|---|---|
| Client/server governance parity | `proxy/tests/runtimeScopePrefix.test.js` | Prefix wording must match `genie.ts` byte-for-byte — change both in one commit |
| Client identity contract | `proxy/tests/pulseClientContext.test.js` + `server.test.js` compat | The PX1 supported-clients list |
| Agent containment | `proxy/tests/agentIdentity.test.js` | AGENT persona stays view-only; self-demotion only |
| HITL authority | `proxy/tests/actionInsightsRoutes.test.js` | Forged personas/approvals can never act (ACT-02/SEC-01) |
| Settings search dictionary | `settings/__tests__/leafLabels.drift.test.tsx` | Every rendered Leaf is findable |
| Catalog curation | levers noted in `project_catalog_curation_2026_07_24` | UI advertises only proven connectors |
| DAX matcher behaviour | `proxy/tests/powerbiQuestionMatcher.test.js` | Star-schema correctness (dims over FKs, no numeric group-bys) |
| No-invention rules | `authoringCopilot.test.ts`, `decisionPlaybooks.test.js` | Copilot/playbooks never fabricate or exceed bounds |

## 3. Rules that exist because they were paid for

- **`git diff HEAD` before accepting any external-LLM change** (ChatGPT/Gemini/Codex have
  rewritten working code as "cleanup" — `feedback_external_llm_audit`).
- **Screenshot = ground truth**; a visual finding is a bug until proven design
  (`feedback_dont_dismiss_visual_findings`).
- **No spend without intent** — nothing queries a warehouse or LLM on page load or timer;
  agents additionally get budget ceilings (`feedback_no_spend_without_intent`, D7).
- **Subjective/business conventions live in domain guidance/prompts, never code**
  (`feedback_subjective_stays_instruction_based`).
- **Read the tripwires** in `CLAUDE.md` before assuming a constraint does/doesn't apply —
  half of them encode expensive empirical findings (Genie immutability, port 7000, etc.).
- **Report honestly**: unverified is stated as unverified; skipped is stated as skipped.

## 4. Bus factor: the ownership model

The sustainable model is **one named human architecture owner + LLM sessions doing the
line-level work**. The owner does not read every line; the owner reads *these*, in order:

**30-minute onboarding path (for the owner or any new maintainer):**
1. `CLAUDE.md` — what this is, tripwires, how we work (10 min)
2. `docs/HANDOVER.md` — top 3 entries = current truth (5 min)
3. `docs/ARCHITECTURE.md` — the 2-axis design + ten backend paths (10 min)
4. `docs/DEBT_REGISTER.md` — what's known-broken/duplicated and the plan (5 min)

**Owner's weekly 20 minutes:** read the HANDOVER delta since last look; check CI is green;
decide any register item marked **OWNER**; pick the next debt item for burn-down.

**Owner decisions currently queued** (register items blocked on a human): D1 canonical
pack corpus, D3 legacy-wizard deletion (needs PBI-sibling check), D6 frame-picker /
coming-soon cards / relevance engine / feedback-loop dispositions.

> ACTION REQUIRED: this section is written for a named person. Until a name goes here,
> the bus factor is still zero and every OWNER-flagged item stays frozen.
> **Architecture owner: _______________ (fill in, commit the change).**

## 5. Session hygiene (what keeps sessions safe)

- Start: `python scripts/llm_onboard.py --terse`. End: `llm_wrapup.py --note "…"`.
- Ports: proxy MUST start with `PORT=7000` (Vite proxies `/api` there; without it every
  call 500s). Playground on 7001.
- Config: `proxy/config.json` is gitignored and holds real secrets — never commit, never
  overwrite without reading first.
- Known dev-mode artifact: first reload after an HMR edit to `visual.tsx` can throw
  `reading 'state'` — a second clean reload clears it; not a product bug.

*Created 2026-07-28, alongside `docs/DEBT_REGISTER.md`.*
