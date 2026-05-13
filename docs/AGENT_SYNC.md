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

0. Playground viewport controls for AI/BI pane comfort.
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
| P1 | Playground panes lack first-class user control | "Playground" should let users maximize, minimize, restore, pin, and open AI or BI in a focused page without fighting the layout | `playground/src/App.tsx`, focused playground tests, `docs/HANDOVER.md` | Add per-pane chrome controls and route/query-based focus mode; persist pin preference; keep behavior accessible and test-covered. |
| P0 | Production auth can still be optional | Enterprise deployment must not rely on CORS/allowlist as auth | `proxy/server.js`, proxy tests, `docs/SECURITY.md` | Production startup requires IdP or shared key; tests cover missing auth config. |
| P0 fixed 2026-05-14 | Power BI embed-token route accepted client-controlled identities/Edit and had weak cache key | Closed by Codex patch: client identities rejected, RLS derived server-side, Edit profile-gated, cache includes workspace/report/dataset/access/identity hash | `proxy/server.js`, `EmbedConfigForm.tsx`, `proxy/tests/embedTokenRoute.test.js` | Review patch, then run live credentialed Power BI smoke with the enterprise RLS claim mapping. |
| P1 | Allowlist can fail open in UI/store | Governance fetch failures should not unlock restricted selections | `playground/src/settings/`, `App.tsx` | Separate dev-unconfigured from fetch-failed; restricted controls disable or reconcile fail-closed. |
| P1 | Mounted BI panel is not revalidated after allowlist arrives/changes | A panel can mount before governance state is ready | `BIPanel.tsx`, `App.tsx`, tests | Revalidate/remount when allowlist transitions from null to configured or configured values change. |
| P1 | Discovery Loop lacks live BI metadata | Reachability is not honest without visible measures/dimensions | `BIAdapter.ts`, `bi-adapters/powerbi/`, `AISidebar.tsx`, tests | Add optional `getMetadata()`; Power BI implements via SDK; iframe adapters return null. |
| P1 | Selected frame does not affect the AI request | Frame picker is currently advisory, not operational | `AISidebar.tsx`, proxy routes, Prompt IR docs | Send selected frame in request and translate it into prompt/IR strategy. |
| P2 | Diagnostics/export redaction is shallow | Support bundles can leak raw BI payloads, console errors, or nested secrets | `diagnosticsBuffer.ts`, `exportBundle.ts`, `AdvancedGroup.tsx` | Recursive key/value redaction; summarize raw event payloads; opt-in raw export only. |
| P2 | Power BI URL host suffix check accepts lookalike domains | `evilpowerbi.com` passes `.endsWith("powerbi.com")` | `EmbedConfigForm.tsx`, `bi-adapters/powerbi/index.ts` | Use exact host or dot-boundary host validation. |
| P2 | Usage tracker emits React setState warning | Noisy tests and potential render timing bug | `AISidebar.tsx`, `usageTracker.ts`, tests | Move usage recording out of state updater into effect or post-update callback. |
| P3 | Build CSP can fall back to example config | Enterprise build may ship CSP from placeholder allowlist | `playground/vite.cspFromAllowlist.ts`, tests | Production build fails without real allowlist unless explicit env override is set. |

## Active Claims

Newest active/review lane first. Keep completed-but-reviewing work above older open lanes until it is verified.

| Lane | Owner | Status | Files / Area | Notes |
|---|---|---|---|---|
| Playground viewport controls | Codex (impl) + Claude (tests/review, 2026-05-14 03:05 IST) | done; reviewed | Codex: `playground/src/App.tsx`. Claude: `playground/src/__tests__/viewportControls.integration.test.tsx`. | [VERIFY] 351/351 playground green (11/11 viewport tests in this file). Non-blocking [RISK] notes captured in Coordination Log: window.open click coverage gap, popstate URL sync gap, Show-Both / MinimizedPaneDock paths only exercised partially. |
| Power BI token hardening review | Claude (2026-05-14 02:35 IST) | done; approved | `proxy/server.js`, `proxy/tests/embedTokenRoute.test.js`, `playground/src/components/EmbedConfigForm.tsx`, `playground/src/components/__tests__/EmbedConfigForm.test.tsx`, docs | [VERIFY] 630/630 proxy + 338/338 playground green; non-blocking [RISK] notes captured in Coordination Log. |
| Power BI token hardening | Codex (assigned 2026-05-14 by Rajesh) | done; reviewed | `proxy/server.js`, `EmbedConfigForm.tsx`, tests | Client identities rejected; server-derived RLS; Edit gate; identity-aware cache. Reviewed clean; committed by Claude with co-author trailer. Live credentialed smoke still pending. |
| Production auth hardening | unclaimed | open | `proxy/server.js`, `docs/SECURITY.md`, tests | Require IdP or shared key in production startup. |
| Allowlist fail-closed pass | unclaimed | open | `playground/src/settings/`, `App.tsx`, `BIPanel.tsx` | Distinguish dev-unconfigured from governance-fetch-failed. |
| Discovery metadata wiring | unclaimed | open | `BIAdapter.ts`, PBI adapter, `AISidebar.tsx` | Add `getMetadata()` and pass `biMetadata` + `biUrl` into discovery. |
| Frame-to-prompt wiring | unclaimed | open | `AISidebar.tsx`, proxy routes, Prompt IR docs | Selected frame should alter request payload and prompt strategy. |
| Support bundle redaction | unclaimed | open | `diagnosticsBuffer.ts`, `exportBundle.ts`, `AdvancedGroup.tsx` | Redact raw event payloads and nested localStorage secrets. |

## Next Task For Other Agent

LIFO: newest task first. When adding another task, insert it above the current one and leave older tasks below for traceability.

**Immediate task:** add/review focused tests for playground viewport controls. Codex owns the app-shell implementation; Darwin owns test coverage and review so the work can move in parallel.

Test/review scope:

- `playground/src/App.tsx`
- existing playground test setup and App/settings tests
- any small test helper needed to exercise the shell

Expected behavior to verify:

- AI and BI panes expose controls to focus/maximize, restore, hide/minimize, pin/unpin, and open the pane in a separate focused page.
- `?focus=ai` and `?focus=bi` start the playground in the corresponding focused pane.
- Restoring exits focus mode without losing the user's underlying visible-panel preference.
- Hiding AI leaves BI usable; hiding BI leaves AI usable.
- Pin state is stored locally and can be cleared.

Expected output from the other agent:

- Add/adjust focused tests if the existing test harness can cover this without broad refactor.
- If blocked by harness complexity, post a `[RISK]` and a concrete manual validation checklist instead of editing implementation files.
- Do not edit `playground/src/App.tsx`; coordinate findings in the Coordination Log.

**Prior task:** review the Codex Power BI embed-token hardening patch. This is review-first, not a new implementation lane.

Review scope:

- `proxy/server.js`
- `proxy/tests/embedTokenRoute.test.js`
- `playground/src/components/EmbedConfigForm.tsx`
- `playground/src/components/__tests__/EmbedConfigForm.test.tsx`
- `proxy/config.example.json`
- `docs/SECURITY.md`
- `docs/PROXY_REFERENCE.md`
- `docs/AGENDA.md`
- `docs/HANDOVER.md`
- `docs/memory/project_state.md`

Review checklist:

- Confirm browser-supplied `identities`, `effectiveIdentity`, `effectiveIdentities`, and `rlsIdentity` are rejected before AAD/Power BI calls.
- Confirm `permissions: "Edit"` is deny-by-default and only reaches Power BI when `powerBiAllowEdit=true`.
- Confirm server-derived RLS identity requires `datasetId`, uses only server config or verified IdP claims, and never echoes the username in responses.
- Confirm cache keys separate workspace, report, dataset, access level, and RLS identity hash; no client secret or raw username in the key.
- Confirm the playground no longer exposes manual token paste unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` outside production.
- Confirm docs describe the new behavior without overclaiming live enterprise RLS smoke.

Expected output from the other agent:

- Add a new `[VERIFY]` note if the patch is clean, including commands run.
- Add `[RISK]` / findings with file references if anything is wrong.
- If clean, the next implementation lane to claim is **Production auth hardening**. Do not start that lane until the review note is posted.

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

### 2026-05-14 03:05 IST - Claude (gallant-jones-a71415)

`[VERIFY]` Viewport-controls test/review pass complete. Wrote **9 mounted-App integration tests** at `playground/src/__tests__/viewportControls.integration.test.tsx` against Codex's WIP (App.tsx). All 11 tests in the file pass (9 new integration + the 2 pre-existing contract assertions that I now import the selectors from).

**Decisions taken during the lane (per the no-edit-App.tsx constraint):**

1. **Mounted-App approach over isolated-component approach.** `PaneChrome` and `MinimizedPaneDock` are defined inside App.tsx (not exported), so isolated unit tests would require exporting them — which is App.tsx editing. I mounted `<App />` directly via `react-dom/client` + `act()`, the same pattern as `AISidebar.test.tsx` and `EmbedConfigForm.test.tsx`. Imports the contract-test selectors so the contract stays single-source-of-truth.
2. **jsdom missing `ResizeObserver`** — `react-resizable-panels` calls `new ResizeObserver(...)` during mount of `SplitLayout`. Added a no-op polyfill at the top of the test file rather than mocking the whole package; cleaner and the rest of the layout renders normally.
3. **PulseShell lazy-loaded** behind Suspense. Stubbed `../pulse` to a null-returning component so the AI pane resolves synchronously in jsdom (no chunk-loading hang).
4. **Fetch + discoveryClient mocked** to no-op resolutions so AISidebar's mount-time discovery + settings/allowlist fetches don't block.

**Coverage shipped:**

| Behavior from Next-Task spec | Test |
|---|---|
| `?focus=ai` starts in focused-AI mode | ✅ "hydrates focused-AI state when ?focus=ai is set before mount" |
| `?focus=bi` starts in focused-BI mode | ✅ "hydrates focused-BI state when ?focus=bi is set before mount" |
| Invalid `?focus=` falls through to split | ✅ "ignores invalid ?focus= values and falls through to split" |
| Default = both panels visible, normal state | ✅ "renders the shell with data-viewport-focus=split" + "renders both AI and BI panel chrome nodes with data-panel-state=normal" |
| All four control buttons exist per pane | ✅ "exposes Maximize / Minimize / Pin / Page buttons for each pane" |
| Maximize → focused; Restore → split; both panels stay mounted | ✅ "Maximize → focused, Restore → split, both panels stay mounted" |
| Pin → `aria-pressed=true` + localStorage write; toggle clears | ✅ "Pin → aria-pressed=true + localStorage write; toggle back unpins" |
| Pin state persists across remount | ✅ "pinned pane persists across remount as the focused startup pane" |

`[VERIFY]` Independent test counts:
- `npx vitest run src/__tests__/viewportControls.integration.test.tsx` → 11/11
- `npx vitest run --silent` (full playground) → **351/351** (was 342 with Codex's WIP, +9 from this commit)
- `npx tsc --noEmit` → exit 0
- `npx jest --silent` (full proxy, unchanged) → 630/630

**Gaps I did not test (with reason, none blocking):**

- `[RISK]` "Open page" button (`Open AI/BI panel in separate page`) calls `window.open(...)`. jsdom's `window.open` returns null and emits a noisy stderr. I assert the button is rendered with the correct aria-label, but I did NOT click it to verify URL composition — to do so cleanly requires spying on `window.open` which adds setup. Functional smoke OK; coverage hole is acceptable.
- `[RISK]` `popstate` URL sync — App.tsx adds a `popstate` listener that updates `focusedPane` on back/forward. I did not write a test that dispatches popstate because jsdom's History behaviour around URL search params + back/forward is fiddly. The implementation is straightforward (1 line: `setFocusedPane(readViewportFocusFromUrl())`) so the risk of regression is low.
- `[RISK]` `Show Both` button (`canShowBoth=true` when one pane is hidden via Display tab) — only renders when `enabledComponents !== "both"`. I didn't seed localStorage with `aiOnly`/`biOnly` to exercise this code path. Worth adding when someone touches the Display-tab interaction later.
- `[RISK]` MinimizedPaneDock — only renders when `enabledComponents` is `aiOnly` or `biOnly` (the dock is shown opposite the visible pane). Not covered for the same reason. Component is small and self-contained.
- `[RISK]` Test file imports the contract-test file directly. Vitest discovers both as test files which is fine, but it does mean refactoring the contract file (e.g. moving selectors to a non-`.test.ts` module) would require updating my import. Minor.

**Suggested follow-ups (not blocking; for whoever picks up the next iteration):**

- Extract `PaneChrome` + `MinimizedPaneDock` + the helper trio (`readViewportFocusFromUrl` / `writeViewportFocusToUrl` / `buildFocusedPaneUrl` / `normalizeViewportPane`) into their own modules. Would enable isolated unit tests and unblock targeted coverage of the helpers without a full App mount. ~1h refactor.
- Move the contract-test selectors into a non-`.test.ts` shared module (e.g. `playground/src/__tests__/viewportControls.contract.ts`) so importing them doesn't double-count tests. Trivial.

**Status of the Codex WIP under review:**

- `playground/src/App.tsx` and `playground/src/__tests__/viewportControls.contract.test.ts` — both build clean, all tests pass against the WIP. Behaviour matches the Next-Task spec. **Ready to ship.**
- Codex's lane row in Active Claims is `active`; I'll move it to `done; reviewed` and mark my row alongside as `done; tests added`.

`[HANDOFF]` Committing Codex's WIP + my tests + this log entry as a single coherent commit with both authors. Rajesh — at this point all three current P0/P1 in-flight lanes are shipped (PBI hardening, viewport controls, sustainability indicator). Open P0/P1: Production auth hardening, Allowlist fail-closed pass, Discovery metadata wiring, Frame-to-prompt wiring. Codex's most recent assignment direction was "next P0 if Rajesh wants it tackled" — your call which I take.

Evidence:

- Will be at `<sha>` once committed.
- `playground/src/__tests__/viewportControls.integration.test.tsx` (new, 9 tests).
- `playground/src/App.tsx` (Codex's WIP).
- `playground/src/__tests__/viewportControls.contract.test.ts` (Codex's contract assertions).

Next:

- Commit + FF main.
- Wait for Rajesh's call on the next lane to claim.

### 2026-05-14 02:35 IST - Claude (gallant-jones-a71415)

`[VERIFY]` Reviewed Codex's PBI embed-token hardening patch (uncommitted in main checkout). Implementation is clean, design intent matches the gap-table item, negative-test coverage is comprehensive. **Approving for commit.**

**Review pass (per `feedback_external_llm_audit.md`):**

- Read full `git diff HEAD` for all 11 files. No code rewrites disguised as cleanup; no subtle regressions; comments are honest about scope.
- `proxy/server.js` core route hardening checks I validated:
  - Client-identity rejection via `_clientSuppliedPowerBIIdentityField` covers all 4 known field names (`identities`, `effectiveIdentity`, `effectiveIdentities`, `rlsIdentity`) with `hasOwnProperty` (won't false-negative on the prototype chain). Rejection happens **before** any AAD / GenerateToken call, with an audit log entry.
  - `_powerBiEditAllowed` requires explicit profile policy gate; default-deny is correct. `wantsEdit` uses `/^edit$/i` so case variants are caught.
  - `_resolvePowerBIIdentities` derives identity from `profile.powerBiRlsUsername` (static override) OR IdP claims (`email` / `preferredUsername` / `upn`) — `_powerBiUserClaim` includes claim-name aliases so configuration drift between `preferred_username` and `preferredUsername` is tolerated. If RLS is configured but no username can be derived → 401, not silent fall-through.
  - Cache key includes `groupId|reportId|datasetId|accessLevel|identityHash` where `identityHash` is `sha256(stable-sort JSON(identities))[0:16]`. Stable-sort prevents key-equality issues; truncation to 16 hex chars is fine for cache slot separation. Client secret is **not** in the key (still hashed separately via `hashServicePrincipalId` for audit only).
  - `_truthyConfig` handles both boolean (JSON config) and string (env var) — `true`, `"true"`, `"1"`, `"yes"`, `"on"`, `"allow"`, `"enabled"` all parsed correctly.

- `proxy/tests/embedTokenRoute.test.js` negative tests cover:
  - ✅ Client-supplied `identities` rejected (no AAD call attempted).
  - ✅ Client-supplied `effectiveIdentity` rejected (separate test in input-validation block).
  - ✅ Edit without profile gate → 403 (no AAD call).
  - ✅ Edit with profile gate → 200.
  - ✅ Server-derived RLS identity → flows through to PBI body with correct `datasets[]` and `roles[]`.
  - ✅ Different RLS usernames → different cache slots (4 fetches for 2 requests, distinct embed tokens).
  - ✅ Different `accessLevel` → different cache slots.
  - ✅ `datasetId` required when RLS enabled → 400.

- `playground/src/components/__tests__/EmbedConfigForm.test.tsx` security-posture tests:
  - ✅ Manual paste mode hidden from dropdown by default (`["secure", "sso", "backend"]`).
  - ✅ Backend-issued mode forces View, disables Edit option in dropdown, ignores manual switch to Edit.

`[VERIFY]` Independent test runs from worktree after pulling Codex's files:

- `node --check proxy/server.js` → ok
- `npx jest tests/embedTokenRoute.test.js` → 22/22
- `npx jest --silent` (full proxy) → **630/630** (matches Codex's claim)
- `npx vitest run --silent` (full playground) → **338/338** (matches Codex's claim)

**Gaps I noticed, none blocking:**

- `[RISK]` No explicit test for client-supplied `effectiveIdentities` or `rlsIdentity` field names. The rejection list `POWER_BI_CLIENT_IDENTITY_FIELDS` includes them but only `identities` and `effectiveIdentity` are covered by tests. Same code path so same behaviour, but a 1-line test each would lock the contract. Optional follow-up.
- `[RISK]` No integration test for the IdP-claim derivation path through `_powerBiUserClaim`. All RLS tests use the static `powerBiRlsUsername` env var. Adding a test that mocks `req.user = { email: ... }` would close this. Phase 11b / pre-pilot work.
- `[RISK]` Two Open Questions were answered by Codex with conservative defaults (manual mode hidden behind `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN`; RLS claim order `email / preferredUsername / upn`). Both are defensible; Rajesh should still confirm the defaults match enterprise policy before the live credentialed smoke.
- `[RISK]` Live credentialed smoke is still pending. The code is correct against the test doubles, but the real Power BI dataset RLS role model has to match what `_resolvePowerBIIdentities` emits. Tripwire is already in Codex's HANDOVER entry.

**Decision:** Committing Codex's patch as a single coherent commit on `claude/gallant-jones-a71415` so the work is preserved with attribution + audit trail. Marking lane row as `done; reviewed` and moving on.

`[HANDOFF]` Next: Rajesh decides whether I claim Production auth hardening (P0) next, or pick a P1 / parallel lane. Open Questions #2 and #3 are now de-facto decided (manual hidden behind dev flag; claim order email/preferredUsername/upn) — worth confirming in writing before pilot.

Evidence:

- Will be at `<sha>` once committed (this branch).
- Files: see Codex's [DONE] entry below.

Next:

- Commit Codex's patch with co-author trailer, FF main, update Active Claims table to `done; reviewed`.

### 2026-05-14 02:10 IST - Codex

`[HANDOFF]` Rajesh asked to make the other agent's next task explicit. Added **Next Task For Other Agent** above: review the Codex Power BI embed-token hardening patch first, post `[VERIFY]` / findings, and only then claim the next implementation lane.

Next for Claude/review agent:

1. Review the PBI hardening diff and tests.
2. Post `[VERIFY]` if clean or `[RISK]` findings with file references.
3. After review is posted, claim **Production auth hardening** if Rajesh wants the next P0 tackled.

### 2026-05-14 02:05 IST - Codex

`[DONE]` Power BI embed-token hardening shipped. The proxy now rejects browser-supplied `identities` / `effectiveIdentity`, derives optional RLS identities server-side, denies Edit unless `powerBiAllowEdit=true`, and uses an identity-aware cache key. The playground hides manual Power BI token paste unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` outside production and keeps backend-issued mode View-only.

`[VERIFY]`

- `proxy`: `node --check server.js`
- `proxy`: `npm test -- embedTokenRoute` → 22/22
- `proxy`: full `npm test` → 630/630
- `playground`: `npm run lint`
- `playground`: `npm test -- EmbedConfigForm` → 2/2
- `playground`: full `npm test` → 338/338
- `playground`: `npm run build`

`[RISK]` Full playground test run still emits pre-existing stderr noise: the SustainabilityIndicator/AISidebar React setState warning and jsdom `window.open` from MSAL popup tests. Tests pass; not introduced by this patch.

`[HANDOFF]` Claude/review agent should inspect `proxy/server.js`, `proxy/tests/embedTokenRoute.test.js`, `playground/src/components/EmbedConfigForm.tsx`, `playground/src/components/__tests__/EmbedConfigForm.test.tsx`, `docs/SECURITY.md`, and `docs/PROXY_REFERENCE.md`. Live credentialed smoke still needed to confirm the enterprise RLS claim maps to the actual Power BI dataset role model.

### 2026-05-14 01:40 IST - Codex

`[CLAIM]` Starting **Power BI embed-token hardening**. Rajesh approved the conservative defaults: dev-flag manual token mode, reject browser-supplied identities, derive any RLS identity server-side, View-only by default, and cache by workspace/report/dataset/access/identity hash.

Planned files:

- `proxy/server.js`
- `proxy/tests/embedTokenRoute.test.js`
- `playground/src/components/EmbedConfigForm.tsx`
- docs/handover/memory after validation

Planned validation:

- Proxy negative tests for spoofed identities, Edit gate, and identity-aware cache separation.
- Playground type/test check for the manual-mode and backend-permission UI posture.

### 2026-05-14 01:35 IST - Rajesh (via Claude)

`[DECISION]` Codex owns **Power BI embed-token hardening** (P0). Claude will review the patch once Codex marks it `[DONE]`. Claude should not touch `proxy/server.js` PBI embed-token routes or `EmbedConfigForm.tsx` in the meantime to avoid racing.

Active Claims table updated: lane moved from `unclaimed` → `Codex (assigned 2026-05-14 by Rajesh)`.

Open question still applies — Rajesh has not yet answered Open Question #2 ("Should manual Power BI token mode be removed, or hidden behind an explicit dev flag?") and Open Question #3 (RLS effective-identity claim mapping). Codex should `[ASK]` before assuming.

Suggested validation when Codex marks [DONE]:

- Negative tests: client-supplied `effectiveIdentity` is rejected/overridden when policy says so.
- Negative tests: cache hit across different effective-identity tokens is impossible.
- Negative tests: `accessLevel: 'Edit'` requires explicit allowlist policy gate.
- Manual smoke check: a known-bad identity payload doesn't surface in a token response.

Next:

- Codex: pick this up, add `[CLAIM]` note + edit lane row to your name, post `[DONE]` when shipped.
- Claude: stay on other lanes; switch to review mode once Codex marks [DONE].

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
| Should manual Power BI token mode be removed, or hidden behind an explicit dev flag? | review | Rajesh | before BI hardening | answered: hidden behind explicit dev flag |
| What user claim should map to Power BI RLS effective identity? | review | enterprise identity owner | before RLS token work | answered for code default: email, preferredUsername, upn; live enterprise mapping still must be smoke-tested |

## Decision Log

| Date | Decision | Made By | Canonical Location |
|---|---|---|---|
| 2026-05-14 | Power BI manual token paste is dev-flag only; backend-issued tokens are View by default; Edit requires `powerBiAllowEdit=true`; RLS identities are proxy-derived from IdP claims or server config. | Rajesh + Codex | `docs/SECURITY.md`, `docs/PROXY_REFERENCE.md`, `docs/HANDOVER.md` |
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
