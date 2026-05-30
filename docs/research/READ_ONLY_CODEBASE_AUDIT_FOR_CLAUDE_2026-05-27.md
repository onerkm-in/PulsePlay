# Read-Only Codebase Audit for Claude - 2026-05-27

## Executive Verdict

PulsePlay does not need a UI shell reconstruction. The existing layered architecture is mostly the right one: app shell, Pulse surface, Dashboard/BI panel, Native Canvas, proxy, packs, and authoring state are already in place.

The current problem is drift across contracts:

- Dashboard was promoted into the app-level surface model but accidentally crossed into the Pulse internal tab contract. This currently breaks TypeScript, lint, and build.
- Several tests and smoke scripts still assert older copy, older ports, or mocked layout behavior, so the validation story is weaker than it looks.
- Trust/governance labels overclaim in a few live paths (`Grounded`, `Governed`, `sme-reviewed`) before the code has enough evidence.
- Direct `/powerbi/*` proxy routes need the same auth/rate-limit/allowlist posture as `/assistant/*`.
- The active Ask Pulse and AI Insights surface is powerful but heavily concentrated in very large files, so future Claude work should make small contract fixes first, then extract carefully.

The immediate Claude order should be:

1. Fix the build gate.
2. Fix stale tests.
3. Fix direct Power BI route protection.
4. Fix trust labels so they reflect evidence.
5. Add a real three-surface responsive layout gate.
6. Only then continue polish or extraction.

## Scope and Method

This was a read-only research and validation pass over the current dirty workspace. Six read-only research agents inspected separate slices:

| Lane | Scope |
|---|---|
| UI shell/layout | `App.tsx`, `TopRightToolbar`, `PulseShell`, host CSS, Pulse CSS |
| Active Pulse AI surfaces | `visual.tsx`, insights runner/cache, Ask Pulse, renderer, SQL/evidence paths |
| Dashboard/BI/native canvas | `biPanel`, `bi-adapters`, `NativeCanvas`, chart registry |
| Proxy/backend/security | `proxy/server.js`, profile routing, Power BI semantic-model paths, manifests |
| Settings/packs/docs hygiene | `authoring`, settings, pulsepacks, docs/memory, dirty-tree status |
| Integration/probes | test configs, smoke scripts, release scripts, responsive probes |

Local probes also ran:

- `python scripts/llm_onboard.py --terse`
- `git status --short`
- `git diff --stat`
- `rg` scans for stale/TODO markers and key contracts
- playground lint, full playground tests, playground build
- proxy full Jest suite

Important honesty note: this was not a literal manual read of every line in every one of the 1,755 files visible under the scanned roots. It was a deep slice-by-slice audit across the runtime-critical files, largest files, tests, smoke harnesses, docs, and known tripwire areas. No source-code fixes were made in this pass.

## Current Validation Snapshot

| Check | Result | Notes |
|---|---:|---|
| `cd playground && npm.cmd run lint` | FAIL | TypeScript error in `App.tsx` passing `dashboard` to `PulseShell.activeTabRequest`. |
| `cd playground && npm.cmd run build` | FAIL | Same TypeScript error as lint. |
| `cd playground && npm.cmd test` | FAIL | 110/111 suites passed; 1594/1597 tests passed; stale native-adapter copy assertions fail. |
| `cd proxy && npm.cmd test -- --runInBand` | PASS | 58 suites / 1164 tests passed. |
| test `.only` / `.skip` scan | PASS | No active `.only` / `.skip` matches found. |
| `git diff --stat` | DIRTY | 25 tracked files changed, about 2122 insertions / 218 deletions, plus many untracked artifacts. |

### Exact failing gates

TypeScript/lint/build break:

- [App.tsx:125](../../playground/src/App.tsx#L125) defines `PulseSurfaceTab = "insights" | "chat" | "dashboard"`.
- [App.tsx:326](../../playground/src/App.tsx#L326) maps the `bi-viz` app surface to `dashboard`.
- [PulseShell.tsx:64](../../playground/src/components/PulseShell.tsx#L64) only accepts `activeTabRequest?: "insights" | "chat"`.
- [App.tsx:1536](../../playground/src/App.tsx#L1536) and [App.tsx:1619](../../playground/src/App.tsx#L1619) pass `requestedPulseTab` into `PulseShell`, so `dashboard` is a compile-time invalid value.

Stale test assertions:

- [bi-adapters/native/__tests__/index.test.ts:94](../../bi-adapters/native/__tests__/index.test.ts#L94) still expects `AI chart canvas`, while current UI copy renders `Pulse Canvas`.
- [bi-adapters/native/__tests__/index.test.ts:196](../../bi-adapters/native/__tests__/index.test.ts#L196) and [index.test.ts:263](../../bi-adapters/native/__tests__/index.test.ts#L263) still expect `AI result accepted`, while current UI copy renders `Pulse artifact received`.
- The updated live component copy is visible in [NativeCanvas.tsx:499](../../playground/src/visualization/NativeCanvas.tsx#L499) and [NativeCanvas.tsx:568](../../playground/src/visualization/NativeCanvas.tsx#L568).

## Dirty Working Tree: What It Means and How to Fix It

`dirty working tree` is Git language. It does not mean the code is morally dirty or corrupted. It means the checkout has local modifications and/or untracked files that are not committed.

Current risk:

- There are 25 modified tracked files.
- There are many untracked docs, evidence folders, probe output folders, scripts, `.azure/`, binary artifacts, and two untracked packs.
- Some repo docs already reference untracked files, so a future Claude session may assume artifacts exist when they are local-only.
- This makes handoff confidence lower because validation results may depend on files that are not part of the committed project state.

Safe cleanup path:

1. Do not run `git clean` or reset blindly.
2. Classify artifacts into four groups: authoritative docs, source/probe scripts to keep, ephemeral generated output, and local-only/binary scratch.
3. Commit authoritative docs/source changes deliberately.
4. Add ignored output directories such as `playground/scripts/.*-out/` and generated bulk evidence to `.gitignore` if they should not be versioned.
5. Move or delete scratch binaries only after Rajesh confirms they are not needed.
6. Re-run lint/test/build from a known clean baseline.

## Prioritized Findings

### P0 - Build and Test Gate

1. Dashboard is an app-level surface, not a Pulse internal tab.

   Evidence:

   - [App.tsx:125](../../playground/src/App.tsx#L125)
   - [App.tsx:326](../../playground/src/App.tsx#L326)
   - [PulseShell.tsx:64](../../playground/src/components/PulseShell.tsx#L64)
   - [App.tsx:1536](../../playground/src/App.tsx#L1536)
   - [App.tsx:1619](../../playground/src/App.tsx#L1619)

   Claude recommendation: keep Dashboard as an outer `SurfaceId`. Return `null` from `surfaceToPulseTab("bi-viz")`, or create a separate outer-surface state value. Do not widen `PulseShell` to accept `dashboard` unless the Pulse visual actually gets a Dashboard panel.

2. Native adapter tests are stale after the copy change.

   Evidence:

   - [bi-adapters/native/__tests__/index.test.ts:94](../../bi-adapters/native/__tests__/index.test.ts#L94)
   - [bi-adapters/native/__tests__/index.test.ts:196](../../bi-adapters/native/__tests__/index.test.ts#L196)
   - [bi-adapters/native/__tests__/index.test.ts:263](../../bi-adapters/native/__tests__/index.test.ts#L263)

   Claude recommendation: update the tests to current `Pulse Canvas` / `Pulse artifact received` wording, and remove stale comments that still describe the pre-uniformity copy.

### P0 - Proxy Security and Governance

3. Direct `/powerbi/*` routes bypass the common `/assistant` middleware stack.

   Evidence:

   - `/assistant` gets rate limiting and IdP protection at [proxy/server.js:1916](../../proxy/server.js#L1916).
   - `/assistant` gets shared key protection at [proxy/server.js:1947](../../proxy/server.js#L1947).
   - `/assistant` gets allowlist guard at [proxy/server.js:2140](../../proxy/server.js#L2140).
   - Direct routes mount at [proxy/server.js:6403](../../proxy/server.js#L6403), [proxy/server.js:6410](../../proxy/server.js#L6410), and [proxy/server.js:6461](../../proxy/server.js#L6461).

   Claude recommendation: add equivalent protection for `/powerbi` before those direct routes. Add production-mode tests proving `/powerbi/conversations/start`, `/powerbi/qna/embed-token`, and `/powerbi/health` do not bypass auth/rate-limit/allowlist expectations.

4. Power BI secure embed URL validation accepts spoof domains.

   Evidence:

   - [bi-adapters/powerbi/index.ts:680](../../bi-adapters/powerbi/index.ts#L680) checks hostnames with `endsWith("powerbi.com")`.
   - That allows a hostname like `evilpowerbi.com` to pass the adapter's own check.

   Claude recommendation: require `hostname === "app.powerbi.com"` for the default path. Add an explicit, tested allowlist for sovereign cloud domains if needed.

5. Power BI deterministic answers can diverge from the user's actual BI/RLS/filter context.

   Evidence:

   - The route accepts client context and extracts the useful question around [proxy/server.js:6290](../../proxy/server.js#L6290).
   - DAX execution happens around [proxy/server.js:6343](../../proxy/server.js#L6343) without clearly passing user assertion, RLS identity, report filters, or frame filters.
   - The dataset client supports user assertion/OBO paths, but the route does not fully use that context in this path.

   Claude recommendation: label this path honestly as `semantic-model global answer` until OBO and filter propagation are wired. For RLS datasets, fail closed unless a verified effective identity is available.

6. Client-supplied `probeCache` is trusted too much.

   Evidence:

   - [proxy/server.js:6252](../../proxy/server.js#L6252) accepts a client body `probeCache` object as a candidate schema authority.

   Claude recommendation: treat client probe data as a hint only. Verify against server-side static/live probes or signed cached probe snapshots. Add tampered `probeCache` tests.

### P1 - Three-Surface Layout Uniformity

7. Uniform context strips exist, but grammar and ownership still diverge.

   Evidence:

   - Dashboard context strip is in the host layer around [App.tsx:1865](../../playground/src/App.tsx#L1865).
   - Pulse context strip is in the Pulse layer around [visual.tsx:8148](../../playground/src/pulse/visual.tsx#L8148).
   - Host CSS uses `pp-*` rules around [styles.css:194](../../playground/src/styles.css#L194).
   - Pulse CSS uses `gn-*` rules around [visual.less:8532](../../playground/src/pulse/style/visual.less#L8532).

   Issue: Dashboard currently orders context as `Source, Assistant, Pack, Trust`, while Pulse surfaces use `Assistant, Source, Scope, Trust`.

   Claude recommendation: align Dashboard to `Assistant, Source, Pack, Trust`. Keep each layer's CSS in its owner file, but make the grammar identical.

8. Mobile toolbar fix hides the only viewport controls under 640px.

   Evidence:

   - [TopRightToolbar.tsx:80](../../playground/src/components/TopRightToolbar.tsx#L80)
   - [styles.css:247](../../playground/src/styles.css#L247)
   - [App.tsx:1458](../../playground/src/App.tsx#L1458)

   Issue: the 390px overlap was reduced by hiding the fixed toolbar, but PaneChrome controls are also hidden. Some mobile/focused users may lose restore/maximize/pin affordances.

   Claude recommendation: create an explicit mobile control row or bottom dock. Validate portrait (`390x844`) and landscape (`667x375`) so controls do not overlap tabs or composer.

9. Mix-mode minimize can desync the visible pane from `activeSurface`.

   Evidence:

   - [App.tsx:749](../../playground/src/App.tsx#L749)
   - [App.tsx:993](../../playground/src/App.tsx#L993)
   - [App.tsx:1438](../../playground/src/App.tsx#L1438)

   Claude recommendation: derive toolbar/context labels from the actual rendered pane, or persist the opposite surface during mix minimize. Avoid letting `activeSurface` describe a hidden pane.

10. Layout validation is not yet real enough.

    Evidence:

    - [viewportControls.integration.test.tsx:36](../../playground/src/__tests__/viewportControls.integration.test.tsx#L36) mocks `PulseShell`.
    - [vitest.config.ts:40](../../playground/vitest.config.ts#L40) is jsdom-only.

    Claude recommendation: add one deterministic Playwright or unmocked React layout gate across AI Insights, Ask Pulse, and Dashboard. Assert context strip text, no duplicated toolbar, visible composer, no horizontal overflow, and no tab overlap across `375`, `390`, `768`, and desktop widths.

### P1 - Ask Pulse and AI Insights Behavior

11. Insights follow-up chips may not continue the Insights conversation.

    Evidence:

    - [visual.tsx:6119](../../playground/src/pulse/visual.tsx#L6119) updates `conversationMap`.
    - `runAssistant` reads existing state around [visual.tsx:2630](../../playground/src/pulse/visual.tsx#L2630).

    Issue: the state write and immediate call can race, causing a follow-up chip to miss the intended conversation id.

    Claude recommendation: pass a `conversationIdOverride` into `runAssistant` or use a ref. Add a test proving an Insights follow-up uses `sendMessage(insightsConv)`.

12. Cached AI Insights loses per-stage SQL/raw-data/provenance.

    Evidence:

    - Live result stores `stageTraces` around [visual.tsx:4115](../../playground/src/pulse/visual.tsx#L4115).
    - Cache write omits it around [visual.tsx:4126](../../playground/src/pulse/visual.tsx#L4126).
    - Cache type starts at [insightsCache.ts:40](../../playground/src/pulse/insightsCache.ts#L40).
    - Restore path around [visual.tsx:4315](../../playground/src/pulse/visual.tsx#L4315) omits trace restoration.

    Claude recommendation: persist sanitized `stageTraces`, or a narrower `stageSqlByTitle` / `stageDataByTitle` structure. Add cache round-trip tests.

13. Pulse context strip overclaims `Grounded`.

    Evidence:

    - [visual.tsx:2546](../../playground/src/pulse/visual.tsx#L2546) reports `Grounded` whenever configured.

    Issue: configured AI is not the same as grounded to the current BI context. `sendContextToGenie` can be off, or BI fields can be absent.

    Claude recommendation: split labels into `AI configured`, `Context off`, `No BI fields`, and `Grounded to BI context`.

14. Hidden Ask Pulse KPI preload is stale and mutates conversation state invisibly.

    Evidence:

    - [visual.tsx:2562](../../playground/src/pulse/visual.tsx#L2562)
    - [visual.tsx:2601](../../playground/src/pulse/visual.tsx#L2601)
    - dependencies are intentionally suppressed around [visual.tsx:2623](../../playground/src/pulse/visual.tsx#L2623)

    Claude recommendation: delete it, or make it a non-conversation warm-up. Add a test that merely opening the Ask Pulse tab does not call the backend if deleted.

15. Artifact section parsing is inconsistent between renderer and sanitizer.

    Evidence:

    - Renderer accepts multiple heading levels around [visual.tsx:11224](../../playground/src/pulse/visual.tsx#L11224).
    - Sanitizer/dedupe/scope enforcement parse `##` headings in [contentSanitizer.ts:253](../../playground/src/pulse/rendering/contentSanitizer.ts#L253), [contentSanitizer.ts:287](../../playground/src/pulse/rendering/contentSanitizer.ts#L287), and [contentSanitizer.ts:317](../../playground/src/pulse/rendering/contentSanitizer.ts#L317).

    Claude recommendation: centralize section parsing. Test mixed heading levels, fenced code headings, and duplicate sections.

16. Stage SQL/raw-data fallback can misattribute evidence.

    Evidence:

    - Later stages can inherit earlier SQL/data around [visual.tsx:3906](../../playground/src/pulse/visual.tsx#L3906) and [visual.tsx:3919](../../playground/src/pulse/visual.tsx#L3919).
    - Renderer fallback uses the only data entry around [visual.tsx:11305](../../playground/src/pulse/visual.tsx#L11305).

    Claude recommendation: disable raw-data export for reused evidence unless explicitly acknowledged, or move provenance to a proxy-side contract.

### P1 - Dashboard, BI Adapters, and Native Canvas

17. Structured Databricks embed config can bypass allowlist gating.

    Evidence:

    - [BIPanel.tsx:36](../../playground/src/biPanel/BIPanel.tsx#L36) checks only `embedConfig.url || embedConfig.embedUrl`.
    - [BIPanel.tsx:125](../../playground/src/biPanel/BIPanel.tsx#L125) only forwards `allowedOrigins` when non-empty.
    - Databricks AI/BI mounts with structured config around [bi-adapters/databricks-aibi/index.ts:102](../../bi-adapters/databricks-aibi/index.ts#L102).
    - Databricks Genie resolves iframe HTML inside the adapter around [bi-adapters/databricks-genie/index.ts:51](../../bi-adapters/databricks-genie/index.ts#L51).

    Claude recommendation: add a per-adapter `resolveEmbedUrlForPolicy()` or normalize structured config before `BIPanel` gates. Treat configured-but-empty origin lists as deny, not "no check," for structured configs.

18. Default Pulse-mode Ask Pulse does not feed Native Canvas.

    Evidence:

    - `handleEntryCompleted` lives in [App.tsx:1073](../../playground/src/App.tsx#L1073).
    - It is passed to `UnifiedAssistantSurface`, but not to default `PulseShell` at [App.tsx:1531](../../playground/src/App.tsx#L1531) or [PulseShell.tsx:32](../../playground/src/components/PulseShell.tsx#L32).

    Claude recommendation: add a real PulseShell-to-App completed-result callback and dispatch `renderResult` to Native Canvas from both Pulse and v0 paths.

19. Native adapter lifecycle events are outside the BI contract.

    Evidence:

    - [BIAdapter.ts:40](../../playground/src/biPanel/BIAdapter.ts#L40) omits `ready`, `rendered`, and `view-context`.
    - [BIPanel.tsx:148](../../playground/src/biPanel/BIPanel.tsx#L148) subscribes only canonical BI events after mount.
    - [NativeBIAdapter.ts:97](../../bi-adapters/native/NativeBIAdapter.ts#L97) emits `ready` during mount.
    - [NativeBIAdapter.ts:296](../../bi-adapters/native/NativeBIAdapter.ts#L296) emits `rendered` / `view-context`.

    Claude recommendation: either promote native lifecycle events into the generic BI contract or create an intentional typed native side-channel.

20. Dashboard trust label overstates governance.

    Evidence:

    - [App.tsx:1255](../../playground/src/App.tsx#L1255) falls through to `Governed` when there is no error.
    - [BIPanel.tsx:36](../../playground/src/biPanel/BIPanel.tsx#L36) can be permissive when no allowlist is configured.

    Claude recommendation: distinguish `Governed`, `Permissive dev`, `Governance warning`, and `Locked`.

21. Native Canvas chart support is split.

    Evidence:

    - Shared chart registry/capability lives in [chartRegistry.ts:99](../../playground/src/lib/chartRegistry.ts#L99) and [buildEChartsOption.ts:298](../../playground/src/lib/buildEChartsOption.ts#L298).
    - Native Canvas has its own local builder around [NativeCanvas.tsx:821](../../playground/src/visualization/NativeCanvas.tsx#L821).

    Claude recommendation: make Native Canvas use the shared `buildEChartsOption()` or maintain a single explicit native-supported chart-kind registry.

22. Dashboard/native accessibility still needs a pass.

    Evidence:

    - ECharts container lacks a strong accessible chart label around [NativeCanvas.tsx:804](../../playground/src/visualization/NativeCanvas.tsx#L804).
    - Tables lack richer caption/scope metadata around [NativeCanvas.tsx:612](../../playground/src/visualization/NativeCanvas.tsx#L612).
    - Chart rationale popover uses dialog semantics without complete focus/Escape behavior around [ChartRationalePill.tsx:119](../../playground/src/visualization/ChartRationalePill.tsx#L119).

    Claude recommendation: add chart aria labels, table summaries, `scope="col"`, keyboard close, and `aria-expanded` / `aria-controls`.

### P1 - Authoring, Settings, Packs, and Source Trust

23. Source-trust overclaims are live in code.

    Evidence:

    - [businessContextProfile.ts:795](../../playground/src/authoring/businessContextProfile.ts#L795) returns `sme-reviewed` for known profiles.
    - [businessContextProfile.ts:173](../../playground/src/authoring/businessContextProfile.ts#L173) and nearby lines still use invented IDs such as `SC-001` / `SC-002`.
    - [docs/AGENDA.md:31](../AGENDA.md#L31) already says to remove default `sme-reviewed`.

    Claude recommendation: make UX-ARCH-0A the first authoring cleanup. Add the full confidence ladder, remove default `sme-reviewed`, replace invented IDs, validate source IDs against pack references, and block citation downgrades without an explicit review marker.

24. Authoring is still mostly data modules, not the owner surface described by docs.

    Evidence:

    - `playground/src/authoring/` currently has profile/default data modules and tests, but not the full Authoring shell/store/review UI described in docs.
    - [docs/AGENDA.md:29](../AGENDA.md#L29) already tracks the broader Authoring direction.

    Claude recommendation: build an `AuthoringStateSnapshot` and generated-defaults review layer before adding more Settings controls. Settings should consume Authoring state, not become another source of truth.

25. Duplicate setup choices still exist.

    Evidence:

    - `SettingsShell` still renders legacy setup around [SettingsShell.tsx:606](../../playground/src/settings/SettingsShell.tsx#L606).
    - `SetupGroup` still duplicates BI provider, surface mode, AI profile, connector, knowledge pack, metric rules, and authoring choices around [SetupGroup.tsx:79](../../playground/src/settings/groups/SetupGroup.tsx#L79).

    Claude recommendation: turn legacy setup into a thin read-only task facade or redirect. Route pack/domain/template/metric defaults through Business Context plus Generated Defaults Review.

26. Pack schema and source-trust model are under-specified.

    Evidence:

    - [PACK_SPECIFICATION.md:116](../../pulsepacks/PACK_SPECIFICATION.md#L116) asks for provenance and verification fields, but there is no root schema/validator enforcing the model.
    - Untracked packs `pulsepacks/retail-digital/` and `pulsepacks/saas-product/` add local-only risk.

    Claude recommendation: add schema validation before accepting new packs. Commit or remove untracked packs deliberately; do not let local-only packs drive demos or tests.

27. Pack docs are stale versus runtime.

    Evidence:

    - `pulsepacks/cpg-fmcg/README.md` and `MIGRATION_NOTES.md` still say runtime pack loading is not implemented.
    - Runtime pack registry and prompt injection now exist via [packRegistry.js:57](../../proxy/lib/packRegistry.js#L57), [server.js:2699](../../proxy/server.js#L2699), and [packPromptLoader.js:5](../../proxy/lib/packPromptLoader.js#L5).
    - [docs/PACKS.md:94](../PACKS.md#L94) is closer to current truth: prompt-context injection exists; governed retrieval/citations do not.

    Claude recommendation: update pack-local docs to say runtime browse plus prompt-context injection exist, while governed retrieval, citations, and authoring import do not.

### P1 - Test Harness and Release Gate

28. Release smoke proxy port mismatch can fail or hit stale services.

    Evidence:

    - [playground/vite.config.ts:46](../../playground/vite.config.ts#L46) serves Vite on `7001`.
    - [playground/vite.config.ts:57](../../playground/vite.config.ts#L57) proxies `/api` to `127.0.0.1:7000`.
    - [shell-smoke-proxy.mjs:70](../../playground/scripts/shell-smoke-proxy.mjs#L70) preflights `8787`.
    - [proxy/server.js:8413](../../proxy/server.js#L8413) defaults to `8787`.
    - [scripts/release-check.ps1:181](../../scripts/release-check.ps1#L181) runs the smoke.

    Claude recommendation: unify the port source or let the smoke allocate a free proxy port and inject the Vite proxy target.

29. Several validation scripts print `FAIL` but exit success.

    Evidence examples:

    - [probe-preview-all-3.mjs:154](../../playground/scripts/probe-preview-all-3.mjs#L154)
    - [probe-responsive.mjs:95](../../playground/scripts/probe-responsive.mjs#L95)
    - [verify-100-scenarios.mjs:405](../../playground/scripts/verify-100-scenarios.mjs#L405)
    - [verify-1000-catalog.mjs:257](../../playground/scripts/verify-1000-catalog.mjs#L257)
    - [verify-500-unified-sprint.mjs:389](../../playground/scripts/verify-500-unified-sprint.mjs#L389)

    Claude recommendation: make `verify-*` scripts set `process.exitCode = 1` on `FAIL` or `THREW`. Keep observational probes named as probes/previews.

30. Generated evidence currently lands in repo docs/scripts paths by default.

    Evidence:

    - Probe scripts write into `docs/evidence` from paths such as [probe-preview-all-3.mjs:14](../../playground/scripts/probe-preview-all-3.mjs#L14), [probe-responsive.mjs:10](../../playground/scripts/probe-responsive.mjs#L10), and [probe-one-surface.mjs:14](../../playground/scripts/probe-one-surface.mjs#L14).
    - `.gitignore` does not clearly ignore these generated evidence trees.

    Claude recommendation: default generated probe output to ignored `test-results/pulseplay/...`. Promote curated evidence into `docs/evidence` intentionally.

31. Some smoke harnesses still assume old ports or old copy.

    Evidence:

    - [shell-smoke.mjs:64](../../playground/scripts/shell-smoke.mjs#L64) defaults to `5173`.
    - [native-canvas-smoke.mjs:32](../../playground/scripts/native-canvas-smoke.mjs#L32) also targets `5173`.
    - [native-canvas-smoke.mjs:114](../../playground/scripts/native-canvas-smoke.mjs#L114) asserts older Native Canvas copy.

    Claude recommendation: retire or update these scripts to current ports, copy, and UI mode.

### P2 - Maintainability and Stale Surface Risks

32. Monolith size is now a material maintenance risk.

    Current measured line counts:

    - `playground/src/pulse/visual.tsx`: 11,621 lines.
    - `playground/src/pulse/style/visual.less`: 10,997 lines.
    - `proxy/server.js`: line numbering currently reaches about 8,413 in `rg`.
    - `playground/src/App.tsx`: 2,768 lines.
    - `UnifiedAssistantSurface.tsx`: about 1,400 lines and still present as a parity/legacy surface.

    Claude recommendation: do not do a broad rewrite now. After P0/P1 fixes, extract only clear seams: Ask Pulse panel, Insights runner hook/cache, context strip, SQL/evidence renderer, Power BI route module, and direct route guards.

33. Retired or parallel surfaces can confuse future work.

    Evidence:

    - Newer research correctly targets active `visual.tsx` + `visual.less`.
    - Older mockup/design docs still point at `UnifiedAssistantSurface.tsx` or retired `AISidebar.tsx` patterns.

    Claude recommendation: mark older mockup docs as superseded, not deleted. Future work should start from the 2026-05-27 handoff docs and touch `UnifiedAssistantSurface` only for explicit parity work.

34. Route docs and connector manifests are stale.

    Evidence:

    - [docs/PROXY_REFERENCE.md:91](../PROXY_REFERENCE.md#L91) lists some direct route shapes that do not match actual conversation-style route implementation.
    - [connectorManifests.js:94](../../proxy/lib/connectorManifests.js#L94) lists a Power BI poll route that is not implemented.

    Claude recommendation: generate docs/manifests from actual route constants or add route-parity tests.

35. Tableau/Qlik/Looker maturity should not be overclaimed.

    Evidence:

    - Their adapters still extend generic iframe behavior while Power BI has the more complete real adapter path.

    Claude recommendation: label Tableau/Qlik/Looker as iframe fallback until SDK adapters graduate.

## What Is Working

- Proxy tests are broad and currently green: 58 suites / 1164 tests passed.
- The BI adapter contract exists and has meaningful conformance/registry coverage.
- Generic iframe and Power BI adapters have mount/send/destroy coverage.
- Native Canvas has useful governance/render-state tests, and the focused NativeCanvas tests already reflect the new `Pulse Canvas` language.
- Markdown rendering is safe by construction and tested against unsafe links/HTML in [renderMarkdown.tsx](../../playground/src/lib/renderMarkdown.tsx).
- SQL highlight paths escape before `dangerouslySetInnerHTML` via [visualHelpers.ts](../../playground/src/pulse/visualHelpers.ts).
- Prompt injection stripping and author-prompt redaction tests are real strengths.
- Settings route consolidation is partially real: AI Setup is now emphasized, and legacy setup/system are less prominent in the rail.
- Pack endpoints and prompt-context injection exist; the missing part is governed retrieval/citations and source-validation maturity.
- The recent uniform layout direction is right: align existing layers instead of reconstructing the shell.

## Claude Repair Plan

### Slice 1 - Restore the Hard Gate

Files:

- `playground/src/App.tsx`
- `playground/src/components/PulseShell.tsx` only if needed
- `bi-adapters/native/__tests__/index.test.ts`

Actions:

1. Keep Dashboard out of `PulseShell.activeTabRequest`.
2. Update stale native-adapter assertions to `Pulse Canvas` / `Pulse artifact received`.
3. Run `cd playground && npm run lint`.
4. Run `cd playground && npm test`.
5. Run `cd playground && npm run build`.

Acceptance:

- Playground lint passes.
- Playground tests pass.
- Playground build passes.

### Slice 2 - Protect Direct Power BI Routes

Files:

- `proxy/server.js`
- `proxy/tests/server.test.js`
- possibly route helper extraction files if minimal

Actions:

1. Apply rate limit, IdP, shared-key, and allowlist protection to `/powerbi`.
2. Add production-mode auth tests for direct Power BI routes.
3. Add `probeCache` tamper tests.
4. Add Power BI hostname validation test for `evilpowerbi.com`.

Acceptance:

- Proxy tests pass.
- Direct `/powerbi/*` routes cannot bypass the protected posture.

### Slice 3 - Fix Trust Labels

Files:

- `playground/src/pulse/visual.tsx`
- `playground/src/App.tsx`
- `playground/src/authoring/businessContextProfile.ts`
- related tests

Actions:

1. Replace binary `Grounded` with evidence-aware states.
2. Replace Dashboard's broad `Governed` label with `Governed`, `Permissive dev`, `Governance warning`, or `Locked`.
3. Remove default `sme-reviewed`.
4. Replace invented source IDs and validate IDs against pack references.

Acceptance:

- UI labels do not overclaim.
- Tests lock the new trust ladder.

### Slice 4 - Add a Real Three-Surface Layout Gate

Files:

- New or updated Playwright/probe test under `playground/scripts` or committed test harness.
- `styles.css` and `visual.less` only as needed.

Actions:

1. Test AI Insights, Ask Pulse, and Dashboard without mocking `PulseShell`.
2. Cover `375`, `390`, `667x375`, `768`, and desktop widths.
3. Assert no horizontal overflow, context strip visible, tabs tappable, composer visible, no toolbar duplication/overlap.
4. Make the script fail CI when assertions fail.

Acceptance:

- The uniform strip is protected by automated evidence, not just screenshots.

### Slice 5 - Clean Handoff Hygiene

Files:

- `.gitignore`
- `docs/AGENDA.md`
- `docs/memory/project_state.md`
- pack-local docs
- older research/mockup docs

Actions:

1. Classify dirty artifacts.
2. Ignore generated output dirs.
3. Commit authoritative docs/scripts.
4. Mark superseded docs clearly.
5. Update pack docs to reflect runtime browse + prompt-context injection.

Acceptance:

- `git status --short` becomes explainable.
- Claude can start from repo-local docs without relying on local-only artifacts.

## Do Not Do

- Do not rebuild the shell.
- Do not revive retired `AISidebar.tsx`.
- Do not make Dashboard a Pulse internal tab unless the active Pulse visual gets a real Dashboard panel.
- Do not hide build failures behind targeted test passes.
- Do not claim Tableau/Qlik/Looker SDK integration while they are iframe fallbacks.
- Do not claim Power BI DAX answers reflect viewer RLS/filter context until OBO and filter propagation are wired.
- Do not keep broad trust words like `Grounded`, `Governed`, or `sme-reviewed` unless the code has the evidence to back them.
- Do not run destructive cleanup against the dirty tree without explicit classification and approval.

## Appendix: Area Coverage

### UI Shell

Covered:

- App-level surface state
- split/mix/focus rendering
- toolbar positioning
- Dashboard context strip
- mobile control visibility

Main loose ends:

- Dashboard tab state contract
- mix-mode visible truth drift
- mobile toolbar fallback
- context-strip grammar mismatch

### Pulse AI Surfaces

Covered:

- AI Insights runner/cache
- Ask Pulse conversation state
- follow-up chips
- renderer/sanitizer
- SQL/raw-data provenance
- context strip trust label

Main loose ends:

- follow-up conversation id race
- cache provenance loss
- hidden KPI preload
- inconsistent artifact grammar
- stage evidence reuse

### Dashboard and BI

Covered:

- BIPanel allowlist
- Databricks structured config
- Power BI URL validation
- Native Canvas event bridge
- Native Canvas chart/table accessibility

Main loose ends:

- structured embed policy gate
- Native Canvas callback missing from default Pulse path
- native lifecycle events outside BI contract
- split chart rendering capability

### Proxy

Covered:

- common middleware stack
- Power BI direct routes
- deterministic DAX path
- probe cache
- supervisor-local synthesis auth
- route docs/manifests

Main loose ends:

- `/powerbi/*` protection
- RLS/filter context gap
- tampered probe cache
- supervisor-local auth fallback
- large Markdown payloads from DAX templates

### Settings, Authoring, Packs

Covered:

- BusinessContextProfile
- generated defaults direction
- Settings setup duplication
- pack specification/runtime gap
- dirty artifact hygiene

Main loose ends:

- source trust overclaims
- no full Authoring owner surface yet
- duplicate setup choices
- pack schema/validator missing
- untracked local packs

### Integration and Release

Covered:

- lint/build/test gates
- full proxy tests
- smoke/probe scripts
- release script references
- responsive probe coverage

Main loose ends:

- release smoke port mismatch
- scripts that print failures but exit success
- layout probes too observational
- generated evidence not ignored by default

