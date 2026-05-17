# PulsePlay — Handover Log

> **LIFO convention.** Newest entry on top. **Never** reorder existing entries.
> Each entry: a short header (date + headline) and a tight summary of what changed, why, and any tripwires for the next session.

---

## 2026-05-17 - KPI delta cues respect lower-is-better metrics

**Range:** Rajesh flagged a Return Rate KPI tile where `+0.4pp` was shown as an amber neutral/watch pill. For lower-is-better metrics, a positive delta should still show the raw numeric increase, but the performance cue needs to read as negative: red with a down cue.

### What shipped

- Split overall KPI tile status from delta-direction tone in [metricDirections.ts](../playground/src/pulse/rendering/metricDirections.ts): a tile can remain `watch`/amber while its delta pill is `bad`/red.
- Updated [visual.tsx](../playground/src/pulse/visual.tsx) so KPI tile deltas add a semantic cue glyph when the AI did not emit one. Example: Return Rate `+0.4pp` under a lower-is-better rule renders as `▼ +0.4pp`, colored red.
- Added compact cue styling in [visual.less](../playground/src/pulse/style/visual.less).
- Added a regression case in [insightsRendererPolish.test.tsx](../playground/src/pulse/__tests__/insightsRendererPolish.test.tsx) for Return Rate `5.9%` vs `5.5%`, `+0.4pp`, `🟡 Watch`, and `higherIsBetter: false`.

### Validation

- `playground`: focused `npm.cmd test -- --run src/pulse/__tests__/insightsRendererPolish.test.tsx` passed **4/4**.
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
