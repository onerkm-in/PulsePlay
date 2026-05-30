# Read-only product test results and brutal architect feedback for Claude

Date: 2026-05-27

Mode: read-only review while Claude is patching. I did not edit runtime/source code and I did not rerun the full test suite in this slice. I reviewed the current HEAD, recent commits, relevant source slices, existing test/evidence summaries, and screenshots.

Important scope note: "desktop" in this document means the PulsePlay web app rendered in a desktop browser viewport, for example 1440x900 Playwright screenshots. It does not mean the packaged Windows desktop EXE.

Mantra: stay uniform, stay simple, stay lean, stay clean.

## Executive verdict

PulsePlay is no longer a raw scaffold. The product has the right spine: a BI surface, an AI reasoning surface, and a generated artifact surface. But the user experience is still too willing to make the user infer the rules. A serious analytics assistant cannot make people guess where they can type, what is trusted, what is still loading, or which surface owns the next action.

The latest branch includes real fixes for security, Settings, staged AI Insights, and trust labels. Good. Do not celebrate yet. Several things are only commit-claimed, not visually proven in the latest evidence:

- AI Insights staged rendering is implemented in code, but the evidence I saw does not prove network-level `startConversation` + `sendMessage` sequencing, distinct `message_id`s, or first-section paint before full completion.
- Ask Pulse has a bottom composer. AI Insights and Dashboard do not. That is technically consistent, but it is a UX trap because the shell presents all three as peer AI surfaces.
- Settings Slice 2 added a compact task list in code, but the latest settings screenshot I reviewed shows the AI Setup page, not the new Setup Home task table. No mobile proof yet.
- Dashboard has cleaner labels, but it is still visually close to an empty room unless BI is embedded or Ask Pulse has produced artifacts.
- Trust labels improved in code, but the evidence set is inconsistent: older all-feature screenshots still show `Trust Grounded` where newer preview summaries show `AI configured - No BI fields` or `Permissive dev`.

Claude should treat this as a proof debt list, not a design wishlist.

## Evidence classification

| Evidence | What it proves | What it does not prove |
|---|---|---|
| HEAD `63efe1e` plus preceding commits | Security, Settings, staged AI Insights, and trust-label patches exist in source. | I did not independently rerun lint/tests/build in this slice. |
| Commit `e7102bb` message | Claude claims lint, 1597/1597 playground tests, and build passed for staged AI Insights. | No screenshot/network evidence proves shared `conversation_id`, multiple immutable `message_id`s, or lead-first section arrival. |
| Commit `5e590e3` message | Claude claims Settings task list slice passed lint, tests, and build. | Latest screenshot evidence does not show the new task list. |
| Commit `63efe1e` message | Claude claims trust-label fixes passed lint, 1597/1597 playground tests, 1164/1164 proxy tests. | Visual evidence still contains stale `Trust Grounded` labels in the all-feature run. |
| `docs/evidence/preview-all-3-2026-05-27T07-05-53-996Z/summary.json` | 6/6 layout pass across AI Insights, Ask Pulse, Dashboard on desktop and 390px mobile. No horizontal overflow, tabs tappable. | It is a layout smoke, not a product success proof. Desktop runs have one console 404. |
| `docs/evidence/all-features-2026-05-27T06-42-27-209Z/summary.json` | 9 pass, 1 partial, 0 fail across Settings, Knowledge, Ask Pulse, slash commands, AI Insights, Dashboard. | It appears to predate the last trust/settings/staging commits. Sustainability indicator is partial. |
| `one-surface-desktop-ai-insights` info | AI Insights screenshot captured with no page error. | It logged one 404 resource error and does not prove staged section behavior. |
| `App.tsx` / `settingsStore.tsx` uiMode readers | HEAD defaults cold boot to `PulseShell` / `uiMode === "pulse"` when `pulseplay:ui-mode` is unset. | Several comments/tests still claim `v0` / `UnifiedAssistantSurface` is default. |

## Message box finding

Rajesh noticed the bottom message box may be missing. The evidence says:

- Ask Pulse desktop: composer visible. `preview-all-3` reports `composerVisible: true`, and the screenshot shows `Ask a question about your data...` at the bottom.
- Ask Pulse mobile: composer visible. Same summary says `composerVisible: true`.
- AI Insights desktop/mobile: composer is `n/a`, not visible.
- Dashboard desktop/mobile: composer is `n/a`, not visible.
- Source confirms the composer lives inside the Ask Pulse branch around `playground/src/pulse/visual.tsx` line 6302, with textarea placeholder at line 6345.

This is not a tiny detail. The app visually presents AI Insights, Ask Pulse, and Dashboard as peer tabs. If only one tab accepts typing, the UI must make that rule obvious. Right now a user can land on AI Insights, see an AI surface, and reasonably ask: "where do I type?"

Claude must choose one of these, deliberately:

1. Keep composer only in Ask Pulse, but add a consistent `Ask about this` affordance on AI Insights section cards and Dashboard empty/artifact states. It should jump to Ask Pulse with context prefilled or pinned.
2. Add a slim universal ask bar at the bottom of the shell that routes the question to Ask Pulse while preserving the current surface as context.
3. Explicitly label AI Insights as a briefing-only surface and Dashboard as a canvas-only surface. This is the weakest option because it explains a limitation instead of removing friction.

Do not leave this implicit.

## Default uiMode and active-surface ownership finding

### Resolved 2026-05-27 (path 2 + dynamic guardrail)

Rajesh's call: **v0 (`UnifiedAssistantSurface`) is the default**, and the system must be dynamic — features must tag against a surface based on feasibility rather than the default being hardcoded across 6 sites. This **supersedes** the 2026-05-25 `feedback_per_tab_visibility_model.md` "retire v0 entirely" lock; the memory entry has been updated to reflect the supersession.

Shipped today (commit `<pending>`):

- New single source of truth: `playground/src/settings/settingsStore.tsx` — `export const DEFAULT_UI_MODE: UiMode = "v0";` with full docblock explaining the escape hatch + the follow-up feature-feasibility registry.
- `App.tsx readInitialUiMode()` and `settingsStore readUiMode()` both reference `DEFAULT_UI_MODE` for the fallback paths — no more duplicated string literal.
- `FirstRunWizard.tsx` PERSONA_PRESETS — all 4 personas reference `DEFAULT_UI_MODE` instead of hardcoding `"v0"`.
- `FirstRunWizard.test.tsx` — assertions now check against `DEFAULT_UI_MODE`, not the literal string, so the test cascades when the default flips.
- Stale comments rewritten in App.tsx, viewportControls.integration.test.tsx, performanceLevers.ts.
- Browser-verified: cold boot with `localStorage` cleared mounts `UnifiedAssistantSurface` (composer + header, no PulseShell tab strip). Forced-pulse escape hatch via `localStorage.setItem("pulseplay:ui-mode", "pulse")` still mounts PulseShell. 0 console errors.
- Tests: 1597/1597. Lint clean.

### Open follow-up — feature-feasibility registry

Today's wedge solves the duplication and aligns HEAD with the v0 call. The deeper architectural ask — "features should tag to it based on feasibility" — is the **real next step** and has not been built yet. Concretely needed:

1. A registry where each feature declares which surface(s) it supports + which is preferred (e.g. `tabStrip: ["pulse"]`, `chatComposer: ["pulse","v0"]`, `contextChips: ["pulse"]`, `aiInsightsBriefing: ["pulse","v0"]`).
2. A capability resolver that, given the user's enabled feature set + governance allowlist, picks the surface where coverage is highest — replacing `DEFAULT_UI_MODE` with `resolveDefaultSurface(userFeatures, allowlist)`.
3. A graceful-degradation contract on every surface: when a feature is unavailable on the active surface, render a clear "this requires PulseShell — switch surface?" affordance, not a silent missing element.
4. Migration path for the PulseShell-exclusive chrome (3-tab strip, context chips, "Setup needed" trust ladder visible on cold boot) — port to UnifiedAssistantSurface or treat the absence as a feasibility gap the resolver knows about.

This is multi-day design + implementation work. Open a dedicated handoff doc.

### Original analysis (preserved below — superseded but kept for context)

This is a bigger architectural tripwire than it first looks.

The earlier sprint range Rajesh called out did not lie. Commit `530c3eb` really did flip the default to `v0`: `git show 530c3eb:playground/src/App.tsx` shows `readInitialUiMode()` returning `"v0"` and the comment saying `UnifiedAssistantSurface (uiMode === "v0") is now the always-default chat surface.`

HEAD no longer does that. Current `playground/src/App.tsx` lines 221-237 re-lock default boot to `pulse`:

- comment: `PulseShell (uiMode === "pulse") is now the always-default mounted shell`
- server/SSR fallback: `return "pulse"`
- empty localStorage fallback: `return "pulse"`
- `v0` is only an escape hatch if `localStorage["pulseplay:ui-mode"] === "v0"`

Current `playground/src/settings/settingsStore.tsx` lines 381-395 mirrors the same default: `pulse` by default, `v0` only if explicitly stored.

Rajesh's supplied DOM probe fits the source:

- cold boot mounted PulseShell
- `pulseShell=1`
- `unifiedSurface=0`
- `askButtons=0`
- `localStorage["pulseplay:ui-mode"] = <unset>`

So the correct current statement is: the sprint delivered `v0` default, then later per-tab-visibility work superseded it and restored `PulseShell` as default. The question is whether that supersession is intended product direction or an accidental regression.

What I do not buy yet:

- The codebase still contains stale comments that say `v0` is default. Examples: `playground/src/App.tsx` lines 668-676, 1338-1342, and 1644-1645; `playground/src/__tests__/viewportControls.integration.test.tsx` lines 124-129; `playground/src/components/__tests__/FirstRunWizard.test.tsx` lines 110-112.
- `FirstRunWizard` persona presets still return `uiMode: "v0"` in `playground/src/components/FirstRunWizard.tsx` lines 65-110, but `App.tsx` intentionally ignores `picks.uiMode` on completion. That may be fine, but it is stale contract surface unless documented as deprecated.
- Tests that opt into `pulse` because they believe `v0` is default are now potentially backwards. If they still pass, they may be passing for the wrong reason.
- Any Claude patch aimed at `UnifiedAssistantSurface` will miss the active cold-boot UI unless `v0` is explicitly set in localStorage. That is a serious implementation targeting risk.

Decision Claude must force before more UI patching:

1. If HEAD's `pulse` default is intended: update stale comments/tests, mark `UnifiedAssistantSurface` as dev escape hatch or legacy parity target, and route all current UX fixes through `PulseShell` / `playground/src/pulse/visual.tsx`.
2. If `v0` default is intended: unwind the later re-lock in both `App.tsx` and `settingsStore.tsx`, consume or remove the wizard `uiMode` contract honestly, and prove cold boot mounts `UnifiedAssistantSurface`.
3. If both are meant to coexist: add an explicit, testable product decision layer. Do not let a hidden localStorage key decide which product the user sees.

Proof Claude must add:

- A cold-boot DOM test with `pulseplay:ui-mode` unset proving the intended default shell.
- An explicit `v0` escape-hatch DOM test proving `UnifiedAssistantSurface` still mounts only when requested.
- A grep-cleanup pass so comments and tests do not say `v0 default` while source returns `pulse`.
- Screenshot/evidence labels that say `PulseShell default` or `UnifiedAssistantSurface default`, so handoff readers know which UI they are seeing.

Brutal bottom line: until this is decided, "fix the Ask Pulse screen" is ambiguous. In HEAD, the active Ask Pulse screen is PulseShell / Pulse port, not `UnifiedAssistantSurface`.

## Screen-by-screen feedback

### Ask Pulse

What works:

- The bottom composer exists and is visible in the latest desktop and mobile evidence.
- Slash commands exist and the dropdown renders.
- The context strip exists and matches the broader surface grammar.
- Starter questions give the user a low-friction entry point.

What I do not buy yet:

- The composer is too visually weak for the primary action of the product. The summary reports a visible composer height of only 25px. Modern chat surfaces usually make the input feel like the command center, not a footnote.
- The empty state wastes a lot of vertical space while the actual input sits low and quiet. The screen looks calm, but it does not look eager to help.
- The `Show history` button floats like an afterthought. It is not integrated with the chat timeline, the context strip, or the composer.
- The slash dropdown is functional but heavy. It covers a huge portion of the viewport and looks like a raw utility list. It needs grouping, density control, and stronger "this will insert a preset" semantics.
- Trust language is drifting across evidence. The older screenshot says `Trust Grounded`; newer evidence says `AI configured - No BI fields`. Claude must regenerate evidence after the trust commit and remove stale claims.
- On mobile, the trust chip truncates. A trust label that truncates is worse than no trust label because it looks precise while hiding the caveat.

Hard questions for Claude:

- Why should a first-time user know that only Ask Pulse has the message box?
- Why is the main command input only 25px tall in captured layout data?
- Why does a data-chat screen spend more attention on empty-center prose than on the action the user came to perform?
- Can every answer card expose the same proof/action footer as AI Insights sections?

### AI Insights

What works:

- The executive briefing renderer is materially better than plain chat.
- KPI Snapshot cards are strong and readable in the filled evidence.
- Per-section action icons exist.
- Source has a staged builder now: `buildStagedHybridInsightsPlan()` in `playground/src/pulse/visualHelpers.ts` around line 995.
- Source wires the staged builder into the hybrid path around `playground/src/pulse/visual.tsx` line 3408.
- The run loop now uses a 3500ms delayed second worker around `playground/src/pulse/visual.tsx` line 4087.

What I do not buy yet:

- The latest visual proof still shows generic `AI Insights Briefing` skeletons, not section-specific first-paint proof. Code intent is not proof.
- The filled screenshot still shows `Trust Grounded`, which is stale relative to the trust fix. Evidence drift means nobody should trust the screenshot set as release proof.
- The status UI is duplicated: top-right status card, inline status pill, progress area, and skeleton. It feels like the product is narrating its own waiting state instead of reducing latency.
- "Lead first" is not fully clean: the current staged builder treats HEADLINE and KPI SNAPSHOT as one lead block. That may be product-correct, but Claude should admit it. If Rajesh expects first section only, this does not exactly match.
- AI Insights has follow-up chips and card actions, but no bottom message box. If the user sees an insight and wants to ask "why?", they must mentally switch to Ask Pulse.
- The right side of the desktop loading screenshot is mostly empty. The system has sectioned skeletons available, but the layout does not yet use that space convincingly while waiting.

Proof Claude must add:

- A network/playwright probe with `startConversationCount === 1`, `sendMessageCount >= 1`, one shared `conversation_id`, and distinct `message_id`s.
- A timeline assertion that the lead section becomes visible before all batches complete.
- A screenshot where skeleton titles match real batch/section names, not just `AI Insights Briefing`.
- A stop/cancel proof that pending delayed workers do not fire after stop.
- A cache proof that stage traces retain enough metadata to explain which section came from which upstream message.

### Dashboard

What works:

- Dashboard now has the same surface/context grammar as the AI screens.
- The mode split between `Pulse Canvas` and `Embedded BI` is clearer than the old blended identity.
- Mobile layout has no horizontal overflow in the preview evidence.

What I do not buy yet:

- The Dashboard empty state is too empty. It says Pulse Canvas can render charts, tables, KPIs, and narratives, but the screen does not make the next action obvious enough.
- A Dashboard with no BI report and no artifact should aggressively offer the next useful move: connect BI, ask a question, or view generated artifacts. It currently looks like a blank workspace with a paragraph.
- The all-feature dashboard screenshot says `Trust Governed`; latest preview summary says `Trust Permissive dev`. That mismatch is unacceptable as handoff evidence.
- There is no fresh proof that Ask Pulse output becomes a governed dashboard artifact after the latest surface/trust changes.
- The Dashboard still risks being a label, not a workflow. A dashboard must answer "what can I inspect, compare, export, or drill?" Empty copy does not carry that.

Hard questions for Claude:

- What is the Dashboard's default job when there is no BI embed and no Pulse artifact?
- Where is the CTA to generate the first Pulse Canvas artifact from Ask Pulse?
- Is there a hard proof that generated charts/tables survive navigation between Ask Pulse and Dashboard?
- Does Dashboard expose the same proof/trust/action footer as AI Insights and Ask Pulse artifacts?

### Settings

What works:

- Claude added a compact Setup Home task table in `playground/src/settings/groups/SetupGroup.tsx` around line 611.
- HelpTip refactor started in BI/AI/Setup settings groups.
- The direction is right: parent first, child details second, prose behind info buttons.

What I do not buy yet:

- The newest settings screenshot I reviewed is not the new Setup Home task list. It shows AI Setup. So the design claim is source-proven but not screenshot-proven.
- The task table uses a pile of inline styles. That is not a uniform design system move. It may be acceptable as a first slice, but it should not harden as the pattern.
- The governance row logic looks suspicious: `state: allowlist ? "Dev permissive" : "Warning"` around `SetupGroup.tsx` line 659. A configured allowlist should not automatically mean "Dev permissive." Claude needs to inspect this before it becomes a false trust signal.
- The table format may be fragile on 390px mobile. I saw no mobile proof after Slice 2.
- Setup still contains the old progressive sections below the task table. That means the first viewport improved, but the page may still become a field wall after the fold.
- Info buttons save space only if they do not hide critical warnings. RLS, allowlist, destructive reset, auth failures, and next actions must remain visible.

Proof Claude must add:

- Desktop and 390px mobile screenshots of `/settings/setup` after commit `5e590e3`.
- Keyboard proof for HelpTip focus/escape behavior.
- A test or screenshot proving the new task rows route to the owning pages.
- A correction or explanation for the governance row state logic.
- A no-overflow assertion for the task table on 390px.

### Knowledge and packs

What works:

- The all-feature evidence reports Knowledge index and CPG/FMCG drilldown passing.
- Pack content exists and is discoverable.

What I do not buy yet:

- Knowledge screens are not yet visibly integrated into the same "source, scope, assistant, trust" grammar. They can easily become a parallel admin library instead of part of the product flow.
- Pack selection should explain what changes in Ask Pulse, AI Insights, and Dashboard. If it is just a content browser, it is underusing a critical product concept.

Claude question:

- When a pack is selected, can the user see exactly how it changes starter questions, AI Insights sections, and Dashboard artifact behavior?

### BI adapters and Power BI security

What works:

- Direct `/powerbi/*` routes now share rate-limit, IdP, shared-key, and allowlist guard posture in `proxy/server.js` around lines 1926 and 2158.
- Power BI secure iframe hostname checking has been tightened in `bi-adapters/powerbi/index.ts`.
- Audit honesty was improved by marking deterministic DAX user context as global.

What I do not buy yet:

- The security fix is source-visible and commit-claimed, but this review did not rerun the proxy tests.
- Power BI deterministic DAX still does not propagate viewer identity, RLS/OLS, or filter context into `executeQueries`. The `userContext: global` audit detail is honest, but it is not the final security posture.
- Tableau, Qlik, and Looker are still fallback-class until real SDK adapters graduate. Do not let the UI imply full parity.

Hard question for Claude:

- Can a user or auditor tell, from the UI and logs, when an answer came from global-scope deterministic DAX instead of viewer-scoped BI context?

## Uniformity contract Claude should enforce

Every screen needs the same mental model:

- What surface am I on?
- What data/source am I looking at?
- What assistant/profile is reasoning?
- What is the trust state?
- What can I do next?
- Where do I type if I want to ask a question?

The current surface strip solves only part of this. It labels context, but it does not always give the next action. The product should not make users hunt through tabs to continue their thought.

## P0 demands before calling this clean

1. Regenerate the evidence after the latest commits. The current screenshot set is stale and contradicts the trust-label fix.
2. Decide the default shell: HEAD cold-boots PulseShell, while stale comments/tests still claim `v0` / UnifiedAssistantSurface is default.
3. Add a real AI Insights staged-loading probe: one start, one or more follow-ups, shared conversation id, distinct message ids, first section visible before all batches finish.
4. Decide the composer rule. Either make Ask Pulse the explicit typing surface everywhere, or add a universal ask affordance that routes to Ask Pulse with current surface context.
5. Prove Settings Setup Home on desktop and 390px mobile after Slice 2.
6. Fix or justify the Settings Governance row state logic.
7. Remove the desktop console 404 from the latest layout probe or document exactly what it is.
8. Prove Ask Pulse -> governed artifact -> Dashboard round trip after the latest trust/surface changes.
9. Make trust labels non-truncating on mobile. Trust caveats are not decorative text.

## P1 design cleanup

1. Make the Ask Pulse composer a real command center: taller, clearer, with consistent send affordance and better focused state.
2. Replace floating orphan controls (`Show history`, some status cards) with owned toolbar positions.
3. Collapse duplicate AI Insights loading/status surfaces into one crisp progress area plus section skeletons.
4. Keep Dashboard empty states action-first: connect BI, ask to generate a chart, or review recent artifacts.
5. Move Setup task-table styling into Settings primitives instead of inline styles.
6. Create one shared artifact card/footer contract for AI Insights sections, Ask Pulse answers, and Dashboard artifacts.

## P2 polish

1. Reduce empty gray acreage on Ask Pulse and Dashboard.
2. Improve slash command grouping and make the preset list feel curated, not dumped.
3. Make pack/knowledge effects visible in the runtime surfaces.
4. Add a small evidence/test index page or doc that names the latest valid evidence folder, because the current evidence directories are too easy to misread.

## Final blunt assessment

This app is close to being coherent, but coherence is not the same as polish. The risky part is not that one screen looks unfinished. The risky part is that each screen knows a slightly different truth:

- Ask Pulse knows how to type.
- AI Insights knows how to brief.
- Dashboard knows how to host or display.
- Settings knows too many knobs.

Claude's job now is not to invent a new layout. It is to make these truths behave like one product. If a user asks "where am I, what is this based on, can I trust it, and what do I do next?", every screen must answer in the same shape.

Until the proof demands above are met, do not call the experience uniform. Call it promising, patched, and still under proof.
