# PulsePlay Agenda — Open Work Tracker

> Active work items across the project. Newest at top within each section. When an item completes, move it to a "Done" bucket or strike it through.
>
> Strategic direction is locked: **Path C — inner-source-first, public-OSS-later.** Items that only matter for the public-OSS path live in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md), not here.

## In flight (v0.1.3)

- [ ] **Unified Ask Pulse Workbench** (locked 2026-05-18, [UNIFIED_ASK_PULSE_WORKBENCH.md](UNIFIED_ASK_PULSE_WORKBENCH.md)). 3-mode workbench (Native Embed / Verified / Hybrid), no-ungrounded-artifacts contract, ECharts + Vega-Lite stack. Build sequence: (1) `UnifiedAssistantSurface` architecture + connector capability model, (2) Genie iframe promotion to assistant axis, (3) artifact card shell with `Answer / Chart / Table / SQL / Evidence / Reasoning`, (4) verified artifact model + validation gates, (5) ECharts renderer + chart registry, (6) Pulse chat asset refactor (additive only), (7) workbench theme. Steps 1-3 sequential; 4+5 parallel; 6+7 follow. Step 1 unclaimed.
- [x] **Production auth hardening** (2026-05-14, shipped). `PROXY_AUTH_MODE` supports `idp`, `shared-key`, `idp-or-shared-key`, and `none`; production / `PROXY_REQUIRE_AUTH=true` refuses `none` and refuses startup without IdP or shared-key config. Rejected auth requests audit `auth.missing-idp` / `auth.missing-shared-key`. 16 production-auth tests; full proxy 646/646.
- [x] **Playground viewport controls** (2026-05-14, shipped). AI/BI panes now have maximize/focus, restore, minimize with dock restore, pin/unpin startup focus, and open-page `?focus=ai|bi` controls. Browser smoke caught a duplicate restore-label bug; fixed with `Show both panels` and regression coverage. 16 viewport tests; full playground 354/354.
- [x] **Sustainability indicator** (2026-05-13, shipped). Leaf + face token-cost gauge in the AISidebar footer. 6 tiers (`ready / lean / green / moderate / heavy / very-heavy`) with thresholds at 2k/8k/20k/50k cumulative tokens. Hover/focus tooltip shows token breakdown + brand-message tagline. Reset button. 42 new playground tests.
- [x] **Proxy plumbs `usage` blocks for the indicator** (2026-05-13, shipped). Foundation Model + Azure OpenAI (chat + analytics) + Bedrock direct (chat + analytics) now forward `usage`. Anthropic-on-Bedrock `{ input_tokens, output_tokens }` and Llama-on-Bedrock `{ prompt_token_count, generation_token_count }` normalised to OpenAI shape. Orchestrator accumulates across SQL + narrative calls. 17 new proxy tests (625/625 total). Bedrock-RAG + Genie don't expose tokens — those sessions stay on chars/4 heuristic with a "~" marker.
- [x] **Phase A — Discovery Loop** (2026-05-13, shipped). Pre-flight discovery endpoint fuses Genie probe + caller-forwarded BIMetadata + pack KPIs into a DiscoverySnapshot with reachableFrames + unreachableFrames. sessionStorage cache (15min) + proxy in-memory cache (60s). Frame dropdown in AISidebar with greyed-out unreachable frames + blockedBy tooltip. 38 new proxy tests + 30 new playground tests.
- [x] **Phase B — SQL transparency** (2026-05-13, shipped). Genie + Foundation Model translators inject `/* Section: <ID> */` CTE-comment markers when IR has structured-sections output. `sqlSectionExtractor` parses them back. Phase 11b now wires Genie poll responses through the extractor and the Pulse SQL view consumes `att.query.sqlSections` as labelled section tabs. Foundation Model response-path symmetry remains queued.
- [ ] **Phase C — Auto-derived params** (2-3d, queued). Slider/stepper/multi-select UI upgrade driven by data distribution from Phase A's availableKpis + biDimensions.
- [ ] **Phase D — Staged "1-then-3" rendering** (3-4d, queued). SectionedOrchestrator + SSE streaming + SectionedAnswer UI; HEADLINE first, then parallel TRENDS/RISKS/ACTIONS.
- [ ] **BIAdapter.getMetadata() extension** — makes BCG / RFM reachability honest by exposing visible measures + dimensions from the active BI view. Power BI implements via powerbi-client; iframe adapters return null.
- See [DISCOVERY_LOOP.md](DISCOVERY_LOOP.md) + [STAGED_RENDERING.md](STAGED_RENDERING.md).

## Recently shipped (v0.1.3)

- [x] **React Query foundation proof slice** (2026-05-18, shipped + hardened) — Added `@tanstack/react-query`, shared `apiFetch()` / `queryClient`, and moved app-shell allowlist + pack fetches into `useAllowlist()` / `usePacks()`. Follow-up hardening keeps React Query Devtools dev-only, disables allowlist retries so governance failures fail closed promptly, preserves pack-loaded-on-error semantics, adds a Vite env type shim, and expands app governance coverage to query-cache + fail-closed cases. Validation: playground lint, appGovernance **2/2**, viewportControls.integration **18/18**, full playground **580/580**, build, production bundle scan with no React Query Devtools strings, Vite root HTTP **200**.
- [x] **KPI delta cues respect metric direction** (2026-05-17, shipped) — Return Rate-style increases preserve the raw numeric delta (`+0.4pp`) while rendering the business-performance cue as red/down when `higherIsBetter: false`; Profit Margin-style decreases now have the same red/down lock when `higherIsBetter: true`. Overall tile status and delta tone are separated, so an amber/watch tile can still show a red negative delta cue. Validation: focused renderer **5/5**, lint clean, full playground **572/572**, build clean, browser smoke at `http://127.0.0.1:5173/`.
- [x] **Phase 11b read-side: labelled SQL sections in Pulse** (2026-05-17, shipped) — After proxy commit `8e29260` surfaced `att.query.sqlSections`, the playground now lifts those fragments into `GenieMessage.sqlSections` and renders labelled section SQL tabs in the Pulse SQL view. Raw `sqlQuery/sqlQueries` remain the fallback. Validation: focused **3/3**, lint clean, full playground **571/571**, build clean.
- [x] **Slice 1b Problem Details foundation + malformed-body hardening** (2026-05-17, shipped) — Added [problemDetails.js](../proxy/lib/problemDetails.js), global malformed JSON/body-too-large Problem Details handling, and a final unexpected-error fallback with the locked safe sentinel and legacy `error` compatibility. Body parsing now runs after the CORS/security header layer so malformed-body responses still return useful browser-visible diagnostics. Validation: `node --check server.js`, `node --check lib/problemDetails.js`, focused proxy **150/150**, full proxy **740/740**. Remaining error lane: raw `err.message` route migration, Databricks OAuth normalization, and streaming in-band error events.
- [x] **H1 doc sync: ResponsesAgent is backend path #9** (2026-05-17, shipped) — Synced active docs after `/responses-agent/*` landed: [CLAUDE.md](../CLAUDE.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PROXY_REFERENCE.md](PROXY_REFERENCE.md), [README.md](../README.md), [ROADMAP.md](ROADMAP.md), [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md), and [AGENT_SYNC.md](AGENT_SYNC.md). Historical audit/migration snapshots still preserve the older count. Validation: current-count references in active docs now say nine; `git diff --check` clean except CRLF warnings.
- [x] **Navigation styling pass: unified surface switcher rail** (2026-05-17, shipped) — Restyled the Pulse surface navigation first, per Rajesh's request. AI Insights, Ask Pulse, and BI Viz now sit in one segmented `gn-surface-switcher` rail instead of one active pill plus two loose labels. AI Insights/Ask Pulse remain semantic tabs; BI Viz remains a viewport-focus button. Added icon wells, inactive affordances, hover elevation, active gradient/shadow, dark-mode support, compact wrapping, and forced-colors borders. Canva/Figma checks did not surface a reusable team component/template, so this stays in PulsePlay's local design language. Validation: playground lint, viewport focused **18/18**, build, full playground **568/568**, browser smoke on `http://127.0.0.1:5176/`.
- [x] **Error handling baseline locked + ResponsesAgent Slice 1a** (2026-05-17, shipped) — Promoted [ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md) to the locked planning baseline after Claude's challenge, and closed P0-1 as a standalone hotfix. `/responses-agent` now inherits rate-limit, IdP, shared-key, and allowlist middleware like the other cost-bearing AI connector paths. Server tests now structurally lock rate-limit/shared-key/allowlist coverage and behaviorally verify `/responses-agent/health` rejects missing shared keys. Validation: `node --check server.js`, focused proxy server suite **133/133**, full proxy **723/723**. Remaining P0s: malformed JSON/no support code, raw `err.message` leaks, and Databricks OAuth error normalization.
- [x] **Unified surface correction: BI Viz peer action** (2026-05-17, shipped) — Corrected the visible miss in the LayoutPreset facade: `mix` is now the unified/default surface mode, so BI no longer renders as a permanent second section. Pulse adds a `BI Viz` peer action beside AI Insights / Ask Pulse to focus the BI surface on demand. `both` remains the explicit `Split + Mix` side-by-side review mode. Settings labels now say `Unified` / `Split`. Validation: focused playground viewport + layout preset tests **33/33**, settings drift **18/18**, lint clean, full playground **568/568**, browser smoke on `http://127.0.0.1:5176/`.
- [x] **Error handling strategy and no-panic failure contract** (2026-05-17, docs/research) — Added [ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md) after multi-agent scan across frontend/BI adapters, proxy/API routes, Databricks/connectors, and source-backed modern error handling. Recommendation: RFC 9457 Problem Details + PulsePlay extensions, support-code correlation, category taxonomy, viewer-safe copy, operator detail/runbook links, and tests that prevent raw `err.message` regressions. The initial strategy slice was docs-only; P0-1 is now closed by the ResponsesAgent Slice 1a item above.
- [x] **Ask Pulse label + unified surface-tabs proposal** (2026-05-17, shipped/proposed) — Renamed the visible Pulse `Chat` surface to **Ask Pulse** across the viewer tab, setup wizard, Settings AI/Preferences selectors, and format-pane strings while keeping internal `chat` keys stable. Added Rajesh's [Proposed_Preset_Templates.pdf](Proposed_Preset_Templates.pdf) and an AGENT_SYNC proposal for unified surface tabs: `AI Insights | Ask Pulse | BI Viz`, future fused `AI/BI Insights`, BI-only, AI-Insights-only, and Ask-Pulse-only presets. Follow-up AGENT_SYNC addendum proposes an in-app floating comparison layer so any primary tab can show another surface as a companion panel; this is distinct from the existing detached popup-window `Float` action. Added a research-backed Pulse Bubble decision candidate for scroll-context access to `AI Insights`, `Ask Pulse`, `BI Viz`, and comparison actions using safe snap anchors and accessibility guardrails. No BI architecture changed yet; Claude/Rajesh review is needed before turning BI into a peer surface tab or adding the launcher. Validation: playground lint, full playground **552/552**, diff-check.
- [x] **Databricks Launchpad + P2-P8 enablement** (2026-05-17, shipped) — Added live Databricks discovery routes for AI/BI dashboards, Genie Spaces, serving endpoints, Apps, SQL warehouses, UC metric views, and Vector Search query; added `/launchpad`; registered `databricks-aibi` and `databricks-genie` adapters; added Settings › AI Vector Search KB + UC Metric View; added first Evidence Drawer slice; added Databricks App resource-mode deploy scaffold. Live workspace smoke: 7 Genie Spaces, 2 AI/BI dashboards, 13 serving endpoints, 1 App, 1 SQL warehouse, 0 Vector Search endpoints, and metric views in `workspace.databrickspractice` plus `main.dbdemos_aibi_customer_support`. Validation: proxy **684/684**, playground lint, Launchpad focused **2/2**, playground **552/552**, build, browser smoke at `/launchpad`.
- [x] **Databricks capability registry P1** (2026-05-17, shipped) — `/assistant/capabilities` now returns a 5-minute cached Databricks capability snapshot for Genie, AI/BI Lakeview dashboards, serving endpoints, Databricks Apps, Vector Search, and Jobs. Playground added `useDatabricksCapabilities()` and Settings › AI gates the `Vector Search KB` entry behind live readiness plus endpoint count > 0. Validation: proxy focused **5/5** + server **119/119** + combined **124/124**, full proxy **680/680**, playground focused **11/11**, lint, full playground **531/531**, build, diff-check.
- [x] **Pulse primary surface streamlined + backend canvas policy** (2026-05-16, shipped) — The Pulse AI pane no longer exposes a second BI Tool dropdown, BI source row, row-level setup button, or visible Console button. The Pulse row now hosts compact AI pane actions (maximize/restore, minimize, open page, refresh). The BI canvas no longer shows `BI tiles: 1 / 2 / 4`; tile count is backend/admin policy via `allowlist.display.biTileMode` and read-only in Settings. Validation: playground lint, focused settings/viewport **43/43**, full playground **503/503**, build, proxy focused **22/22** + **119/119**, full proxy **675/675**, diff-check.
- [x] **Setup pill + Settings setup tree** (2026-05-16, shipped) — The top-right affordance is now a single app-owned setup/readiness pill, not a duplicate Pulse status surface. `/settings` defaults to Setup, with a tree requiring one BI vertical (provider + embed config) and one AI vertical (profile) before the playground is "Ready." Console handoffs route to Setup and stay diagnostics/session/SQL/status only. Validation: playground lint, focused setup/settings/viewport **55/55**, full playground **502/502**, build, diff-check.
- [x] **Settings owns configuration; Console owns status** (2026-05-16, shipped) — The old Pulse-owned top-right `Not connected | Managed` status pill is gone from Pulse global chrome. Pulse now exposes an in-pane `Console` trigger for connection/scope status, diagnostics, session log, SQL trace, and Settings handoff. The reachable Console Setup/Display editors are retired; Settings › AI › AI Insights now edits Pulse `genieSettings` directly, and provider selection mirrors to runtime `assistantProfile`. Canva sidecar reference: design `DAHJ1oFh42k`. Validation: focused AI/settings/viewport/PulseShell 40/40, playground lint, full playground 496/496, build, diff-check, Vite HTTP 200.
- [x] **Post-Claude review-gap closeout** (2026-05-16, shipped) — `Done & ask` now uses a per-completion event id so the same suggested question can be intentionally submitted again on a later wizard re-run; forced setup wizard still refuses to open when no BI vendors are visible; Settings leaf copy-link labels now use plain `Copy link` / `Copied` text. Validation: focused 73/73, playground lint, full playground 494/494, build.
- [x] **4-step first-run setup wizard + P1 hardening + UX leaps** (2026-05-16, shipped) — Full-bleed onboarding modal at `playground/src/components/FirstRunWizard.tsx`. Four progressive steps with persona presets (Analyst/Executive/Developer/Designer) seeding `uiMode` + `layoutMode` + connector hint. Settings → System → "Re-run setup wizard" via `forceWizard()`. P1 security hardening: draft schema validation against XSS injection, `inert` focus trap for hidden StepPanes, probe URL always via Vite proxy, force-rerun flag bypassing `hasEmbedConfig` gate. LEAP wave: autoAsk wired through to `AISidebar.ask()` (Done & ask now auto-submits the suggested question), persona persistence across runs via `pulseplay:last-persona`, `WizardErrorBoundary` for graceful crash recovery. Validation: 492/492 playground, tsc clean. Commits: `4ba76b3`, `735eb87`, `924780d`, `9918359`.
- [x] **Roadmap reorganized around 5 parallel tracks** (2026-05-16, shipped, commit `5a57e7c`) — `docs/ROADMAP.md` replaces linear v0.1→v1.2 sequence with 5 parallel tracks (Foundation / Surface / Reasoning / Experience / Trust), each with current state + parallel-shippable milestones + "What stays modular" rule + explicit Non-Databricks proof point. 8 modularity guarantees codified to prevent Databricks-lock-in.
- [x] **Settings IA fix #8 — per-leaf Copy link button** (2026-05-16, shipped, commit `e769065`) — Every Settings leaf gets a "🔗 Copy link" button that copies a path-based deep-link URL (`/settings/<group>/<slug>`) to the clipboard. Reuses the existing `SettingsShell` scroll-on-mount infrastructure.
- [x] **Knowledge Base source governance** (2026-05-16, shipped) — added [KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md), updated pack spec / KB architecture / Chat visualization KB / CPG-FMCG references, and communicated the research-agent findings to Claude in [AGENT_SYNC.md](AGENT_SYNC.md). Validation: diff-check.
- [x] **Chat visualization knowledge base** (2026-05-16, shipped) — added [CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](CHAT_VISUALIZATION_KNOWLEDGE_BASE.md) as a Chat-facing baseline for chart recommendation, critique, legacy-to-modern migration, dashboard composition, persona defaults, and proposed `ChartKnowledgeRule` shape. Validation: diff-check.
- [x] **Common AI context model + setup grouping** (2026-05-16, shipped) — added [AI_CONTEXT_CONFIGURATION_MODEL.md](AI_CONTEXT_CONFIGURATION_MODEL.md). Section A in Pulse advanced setup is now common AI context shared by AI Insights and Chat; domain options derive from preset domains; custom-section and metric-rule presets prioritize selected-domain matches; metric presets can seed domain when blank. Validation: diff-check, focused domain-preset 3/3, playground lint, full playground 470/470, and build.
- [x] **Setup/settings relationship audit + control-depth polish** (2026-05-16, shipped) — added [SETUP_SETTINGS_RELATIONSHIP_AUDIT.md](SETUP_SETTINGS_RELATIONSHIP_AUDIT.md) as the connector/setup dependency map and first-slice recommendation. Added shared dropdown/input/textarea depth styling plus wizard suggested-question textarea focus polish. Validation: diff-check, playground lint, FirstRunWizard 30/30, full playground 467/467, build, and Vite root smoke.
- [x] **Phase 11a — Prompt IR + per-backend translators** (2026-05-13, working tree) — Vendor-neutral Prompt IR schema (YAML+JSON dual format) authored at `pulsepacks/<pack>/<sv>/prompt-ir.yaml`. Per-backend translators emit native shapes: Genie (single fenced user message — byte-identical to legacy `wrapAsGenieUserMessage` for un-migrated packs), Foundation Model (OpenAI-compatible messages + tools + response_format), Supervisor (fan-out + synthesis). Dispatcher is additive in 11a — `packPromptInjector` still wired into routes. Phase 11b migrates routes one at a time. CLI: `node scripts/check-prompt-ir.js --all`. 87 new proxy tests including byte-identical backward-compat regression. See [PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md).

## Recently shipped (v0.1.2)

- [x] **Power BI secure embed quick-preview mode** (2026-05-11, working tree) — authors can paste the Power BI portal's website/portal link or iframe; the Power BI adapter mounts it as a preview iframe with honest limited capabilities while SSO/service-principal remain the SDK control paths.
- [x] **Power BI Developer Tools panel** (2026-05-12, working tree) — collapsible report-side dev strip with live adapter snapshot, capabilities, recent events, refresh/fullscreen, and test apply/clear filter actions.
- [x] **Proxy health storm guard** (2026-05-12, working tree) — stable dependency key + 15s single-flight `/health` cache; cheap `/assistant/profiles` and `/assistant/capabilities` reads no longer spend the AI rate-limit bucket.
- [x] **Per-vendor iframe sandbox narrowing** (commit `9f7faef`) — Tableau / Qlik / Looker stubs default to `allow-scripts allow-same-origin` only; `allow-forms` / `allow-popups` must now be explicit per-mount opt-ins. Lock-in tests per vendor.
- [x] **Cycle I — BIAdapter conformance harness** (commit `190c579`) — `runAdapterConformance()` runs the universal BIAdapter contract against every adapter; already caught a `NOT_MOUNTED` vs `UNSUPPORTED_COMMAND` mis-routing in generic-iframe. Total tests went from 35 → 124.
- [x] **Developer Tools modal maximize toggle** (commit `f1afc3e`) — 🗖 / 🗗 next to the close ✕ fills the viewport on demand; resets to drawer on close.
- [x] **Cycle G — CPG/FMCG pack merged into Pulse preset library** (commit `98bdbcb`) — 10 sub-vertical CustomSectionPresets appended via additive merge; heritage Pulse presets untouched and id-first.
- [x] **Cycle F — author-positioned layout + Setup-tab surfacing** (commit `a59613b`) — Left / Right / Top / Bottom layout modes; AI-only mode now fills the viewport; `showSetupAccess` seeded true on first run so the Setup tab is reachable without manual toggling.

## Strategic posture (locked 2026-05-10)

**Two-phase delivery plan:**

1. **Phase 1 — Enterprise-internal solve.** Make PulsePlay enterprise-ready as an inner-source tool. Hand it over to the org's analytics team. Quick wins, cost saving, "can't say no to" experience. License: internal placeholder (not Apache 2.0 yet).
2. **Phase 2 — Public OSS.** Once the internal solve is delivered and proven, evaluate going public under Apache 2.0. Until then, [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) is the parked-features list.

**Non-negotiables across both phases:**

- **Agnostic.** Multi-AI + multi-BI. Genie, Supervisor, OpenAI, Bedrock, Foundation Model, future MCP — all peers. Power BI, Tableau, Qlik (Sense + View), Looker, generic iframe, future custom — all peers. Every architectural decision must preserve this. The Genie-vocabulary leakage in the inherited proxy (per [research/CODEBASE_AUDIT.md](research/CODEBASE_AUDIT.md)) gets cleaned up in cycles below; new code must not reintroduce coupling.
- **Modular.** Every part. Connectors, packs, BI adapters, knowledge-base content — all swappable.
- **First-build focus.** The first production-grade build is Databricks Genie + Power BI. Other BI/AI options stay as clean extension slots, but they do not compete for polish until this first cell is robust, tested, demoable, and operable.
- **10-minute author setup.** A novice author should be able to configure the Genie + Power BI cell in about 10 minutes when platform prerequisites are already provisioned. AI/probe output can draft the setup, but the author confirms every persisted change.
- **Playground-first.** The product promise is "plug in and play here." PulsePlay should feel like a real playground: choose a BI surface, choose an AI brain, choose or infer a pack, then try the combination immediately. Genie + Power BI is the first playable cell, not a hardwired product boundary.
- **Best-build-wins.** The Power BI custom visual is a proven asset bank, not a throwaway predecessor. Reuse its learning, tests, prompts, setup UX, smoke scripts, and tripwires wherever they are still superior, but promote them through PulsePlay contracts instead of copying Power BI-only assumptions.
- **Learning-loop.** The product must keep updating as the AI/BI market changes. Connector probes, capability matrices, conformance tests, smoke scripts, eval suites, and docs refreshes are product features, not chores.
- **Security-first.** "No flaws" — see [SECURITY.md](SECURITY.md).
- **Author-final-say.** Inferences and AI suggestions are *suggestions*. The author always confirms.
- **Cost-saving and quick-win positioning.** PulsePlay is the experience + connector + orchestration layer; we do NOT build LLMs or agents — we connect to the platform team's existing ones.

## Playground doctrine (locked 2026-05-11)

PulsePlay should marry "plugin play" with the literal playground idea: bring a component, plug it in, and play with it safely.

- **Everything has a slot.** BI surfaces plug into `BIAdapter`; AI brains plug into proxy profiles; vertical knowledge plugs into `pulsepacks`; host-specific behavior plugs into thin bridges like `PulseHostStub`.
- **First copy is the product target.** Databricks Genie + Power BI gets first-class production polish because it is proven and credentialed. The implementation must remain contract-driven so Tableau/Qlik/Looker/OpenAI/Bedrock/Foundation profiles can occupy the same slots later without a rewrite.
- **Cross-axis work goes through contracts.** If AI wants to navigate, filter, export, annotate, or inspect a BI surface, it emits canonical commands/capabilities. No connector should import a vendor SDK directly.
- **Discovery beats setup sprawl.** Smart Connect, probes, pack inference, and health strips should help users find a valid combination quickly, while still letting authors override every inference.
- **The UX should invite experimentation.** The first screen should make the composable model visible: pick BI, pick AI, pick pack, ask, inspect, adjust, try again.

## Superior-build leverage doctrine (locked 2026-05-11)

The old Power BI custom visual may already contain the better answer for many user-facing details. Respect that before inventing a new one.

- **Compare before rewriting.** For setup, context, prompt, SQL, trace, rendering, export, cache, and governance flows, check the sister visual first.
- **Promote, don't paste.** Bring mature behavior into PulsePlay through `BIAdapter`, proxy profiles, `pulsepacks`, canonical context, canonical commands, and diagnostics contracts.
- **Tests are part of the asset.** A feature is not fully leveraged until the valuable old pure tests or equivalent new tests cover the browser-host version.
- **Demo proof matters.** The PBIP demo, smoke scripts, and live-test prompts are reference fixtures for the first playable cell.
- **No static moat.** The market will move; PulsePlay's edge is the ability to re-probe connectors, re-run evals, upgrade adapters, and keep the playground current.

## Beast-mode list (foundation-laying cycle, in flight)

The 7-item cycle that this docs consolidation is part of. Tracked here for visibility.

1. **Doc consolidation 26 -> ~10 active** (this agent's work — in flight, completing now)
2. **Pack architecture seeded** — `pulsepacks/` directory + `PACK_SPECIFICATION.md` + first `cpg-fmcg` reference pack from `CPG_FMCG_ENTERPRISE_BLUEPRINT`
3. **First vendor adapter graduates from stub** — Power BI most likely (`bi-adapters/powerbi/index.ts` wires `powerbi-client` SDK). Probably v0.2 priority.
4. **Embed-token issuance route** — `/api/powerbi/embed-token` in proxy, Azure AD service principal flow.
5. **First playground tests** — BIAdapter conformance suite, BIPanel lifecycle, registry lazy-load.
6. **Naming-leak sweep** — package name, header names, `errorStatusFromDatabricks`, supervisor README, `.dwd-session.state.json` rename. Tracked but deferred (low risk).
7. **AI sidebar at parity with Pulse** (v0.3) — fast briefing default, validator wired, two-tier cache, optional deep multi-stage path.

## Near-term (next 1-3 cycles)

### Superior-build leverage

Use [SUPERIOR_BUILD_LEVERAGE_PLAN.md](SUPERIOR_BUILD_LEVERAGE_PLAN.md) as the working source for harvesting the old Power BI visual without reintroducing Power BI-only coupling.

- [x] Scan old handover, project review, master guide, test inventory, and source parity.
- [x] Capture leverage plan and migration gate.
- [ ] Port the highest-value old pure tests: context builder, prompt redaction, setup validation, SQL sections, insight validation, rendering edge cases, cache.
- [ ] Convert old Setup learning into the unified Genie + Power BI first-run flow.
- [ ] Promote old AI Insights orchestration patterns: single conversation per run, worker pool, SQL trace, SQL provenance.
- [ ] Adapt old PBIP demo and smoke scripts into PulsePlay live smoke fixtures.
- [ ] Start fixed-question eval suite from old live-test prompts plus `pulsepacks` sample questions.

### First playable cell — Databricks Genie + Power BI

This is the first production target: make one combination feel seamless, supportable, secure, test-backed, and demo-ready while preserving every modular contract.

- [x] Power BI is the default BI surface in the browser host.
- [x] Power BI secure embed quick-preview path is available for novice first render.
- [x] Power BI Developer Tools panel exposes the live adapter surface for API proving, similar to the Microsoft embedded analytics playground.
- [x] Playground viewport controls let users maximize/focus, restore, minimize, pin, and open AI/BI panes as focused pages (2026-05-14).
- [x] Pulse mode exposes BI source setup instead of hiding it behind v0 mode.
- [x] `BIPanel` exposes the live BI adapter to the host shell.
- [x] Pulse `applyJsonFilter` routes into the active BI adapter through canonical `BICommand` values.
- [x] First-copy research captured in [GENIE_POWERBI_FIRST_COPY_RESEARCH.md](GENIE_POWERBI_FIRST_COPY_RESEARCH.md).
- [x] Power BI embed-token hardening: client-supplied RLS identities rejected, server-side RLS derivation supported, Edit gated by profile policy, cache keyed by workspace/report/dataset/access/identity hash (2026-05-14).
- [ ] 10-minute author setup path: preflight, Power BI connect, Genie probe, AI-drafted setup, author review, live smoke. See [TEN_MINUTE_AUTHOR_SETUP.md](TEN_MINUTE_AUTHOR_SETUP.md).
- [ ] Unified first-run setup: configure Genie profile + Power BI report + pack in one guided flow.
- [ ] AI setup proposal: use Genie/probe metadata plus Power BI context to suggest pack, starter questions, KPI rules, and field mappings in editable JSON-backed state.
- [ ] Power BI + Genie health strip: report embedded, Genie reachable, context bridge active.
- [ ] Power BI context refresh on load/page change via `getFilters()` / `getPages()`, not only future events.
- [ ] Power BI field-target mapping for `{ table, column }` filters; column-only stays demo fallback.
- [ ] Live credentialed smoke: load org Power BI report, ask Genie a page/filter-aware question, apply a safe filter back to the report.
- [ ] Production readiness checklist: auth posture, CORS/CSP, token handling, audit trail, rate limits, error diagnostics, rollback/fallback, and support runbook.
- [ ] Release acceptance gate: all tests green, live smoke green, known limitations documented, and no unsupported multi-vendor promise in the first-build narrative.

### Settings + Knowledge plane (NEW — IA, KB architecture, and enterprise guardrails)

Specs: [SETTINGS_SPEC.md](SETTINGS_SPEC.md) is the consolidated source of truth (IA, layout, microcopy, state, interactions, enterprise guardrails, security setup, maintenance, administration, loophole audit, **MVP 0.2 scope**). [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) covers the Knowledge plane contracts. Settings is the control room; Knowledge Base is the inspectable content library.

**MVP 0.2 scope (locked):** Databricks Genie (direct + Supervisor multi-space) + Power BI (Premium, governed, no Fabric). See [SETTINGS_SPEC § 0](SETTINGS_SPEC.md). Phases 1-6 are MVP 0.2; phases 7-10 are post-MVP-0.2 expansion.

- [x] **Knowledge plane architecture** — documented packs vs knowledge sources vs indexes vs `GroundingBundle`; explicitly states current pack prompt injection is not full governed RAG.
- [x] **SETTINGS_SPEC.md consolidated** — 5-group tree (BI / AI / Preferences / System / Advanced), microcopy, empty states, search, keyboard map, state-ownership table, shortcut policy.
- [x] **MVP 0.2 scope locked** — Genie + Supervisor multi-space + Power BI Premium; Tableau/Qlik/Looker/OpenAI/Bedrock/Foundation/Fabric/KB UI deferred to v0.3+.
- [x] **Loophole audit run** — 8 HIGH / 7 MEDIUM / 4 LOW findings; biggest risk L1 (no AAD tenant allowlist). See [SETTINGS_SPEC § 15](SETTINGS_SPEC.md).
- [x] **Allowlist contract — Phase 1 (MVP 0.2).** `proxy/config.json.allowlist` normalization, production startup gate, `GET /assistant/allowlist`, filtered `/assistant/profiles`, proxy route guards, PBI workspace/report/tenant checks, audit events on rejection, and MVP 0.2 example config. See [SETTINGS_SPEC § 11](SETTINGS_SPEC.md).
- [x] **Settings store + shell — Phase 2 (MVP 0.2).** Shipped 2026-05-13. `/settings` route, path-based router (no new dep), `SettingsProvider` + `useSettings`, `SettingsShell` with header / search / status strip / 5-group left rail / content pane. Preferences group wired live end-to-end; BI/AI/System/Advanced surfaces show structure + Phase 3-5 stubs. `Cmd/Ctrl+,` opens settings; `Esc` returns to app. Orphan detection on persisted values (L11 closed at primary read paths). 25 new tests (186/186 total). Lives at [playground/src/settings/](../playground/src/settings/).
- [x] **BI group cleanup — Phase 3 (MVP 0.2).** Shipped 2026-05-13. L1 closed via `pbiAuth.signInAndPrepareEmbed` tenant gate (`PbiAllowlistError` before MSAL init); L2 closed via `allowedOrigins` on `BIEmbedConfig` + `assertIframeOriginAllowed`/`assertPowerBIOriginAllowed` in each adapter; L3 closed via `extractGroupIdFromPowerBIUrl` + workspace/report allowlist match on secure-embed paste. License posture + no-Fabric diagnostic surfaced in BI › Status and System › Security. Lives at [playground/src/lib/pbiAuth.ts](../playground/src/lib/pbiAuth.ts), [bi-adapters/generic-iframe/index.ts](../bi-adapters/generic-iframe/index.ts), [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts), [playground/src/biPanel/BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx), [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx), [playground/src/settings/groups/BiGroup.tsx](../playground/src/settings/groups/BiGroup.tsx), [playground/src/settings/groups/SystemGroup.tsx](../playground/src/settings/groups/SystemGroup.tsx). 13 new tests; 203/203 playground + 428/428 proxy. **L7 also closed in this cycle** via Vite plugin [playground/vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts) — strict CSP without wildcards, no `'unsafe-eval'` in production builds.
- [x] **AI group + Knowledge pack (Genie + Supervisor) — Phase 4 (MVP 0.2).** Shipped 2026-05-13. `activeAiProfile` in settingsStore with allowlist gate + orphan detection; Provider picker filtered + Supervisor badge; `/assistant/profiles` extended with `type`/`spaces`/`agentName`; read-only Supervisor fan-out table with per-space allowlist match; Connection test = TestConnectionPanel for Genie, per-space probe matrix (2 s stagger ADR-0003) + aggregate summary for Supervisor; Knowledge pack picker inline. Lives at [playground/src/settings/groups/AiGroup.tsx](../playground/src/settings/groups/AiGroup.tsx). 10 new tests; 213/213 playground + 428/428 proxy. **L6 mitigated and L8 closed in this cycle** — proxy refuses to start with permissive inline-creds in production; dev-mode banner surfaces embed-token route posture.
- [x] **Preferences + System + Advanced — Phase 5 (MVP 0.2).** Shipped 2026-05-13. Floating gear popover retired (now navigates directly to `/settings`); Pulse Cycle H Display tab repointed to "Open Settings → Preferences"; System Proxy status with live 10 s `/api/health` poll + latency badge; System Diagnostics with rolling 20-event buffer (via new `pulseplay:bi-event` window event from BIPanel) + last 20 console errors; System Export bundle (JSON download, token-redacted); Advanced Reset section / Reset all / Danger zone with type-to-confirm gates. New modules: [diagnosticsBuffer.ts](../playground/src/settings/diagnosticsBuffer.ts), [exportBundle.ts](../playground/src/settings/exportBundle.ts). 7 new tests; 220/220 playground + 428/428 proxy.
- [x] **Loophole closure — Phase 6 (MVP 0.2, parallel).** Shipped 2026-05-13 across cycles 2-5. HIGH gaps L7 + L8 + L6 closed earlier; medium cleanup cycle (beast-mode five) closed L11, L12, L14, L15 + LOW L17, L18; explicitly accepted L9, L10, L13 with risk acceptance log in SETTINGS_SPEC § 15.5. New modules: [proxy/lib/configValidator.js](../proxy/lib/configValidator.js), `safeAuthorPrompt` + `stripInstructionKeywords` in [pulse/promptRedaction.ts](../playground/src/pulse/promptRedaction.ts), admin endpoints `GET /admin/embed-tokens/stats` + `POST /admin/embed-tokens/purge` behind `_adminAuthOk`. Total tests: 240/240 playground + 457/457 proxy.
- [x] **Read-only pack registry endpoint — Phase 7 pulled forward.** `GET /assistant/knowledge/packs` reads installed `pulsepacks/*/pack.json`, filters by allowlist, and the playground now uses it instead of the hardcoded default list.
- [x] **Knowledge Base UI surface — Phase 8.** Shipped 2026-05-13. New `/knowledge` page separate from Settings. Path-based router (no new dep) + KnowledgeShell with header + left rail (installed packs from `/assistant/knowledge/packs`) + content pane with section tabs (Overview, Glossary, Ontology, References, Sub-verticals, Runtime use, Demos). Runtime-use tab explains exactly what pack content the AI injects today vs what's available for human review only. Proxy: new `GET /assistant/knowledge/packs/:pack` + `GET /assistant/knowledge/packs/:pack/sub-verticals/:subVertical` with allowlist gating + L15 identifier regex. Settings › AI › Browse library ↗ deep-link wired. New: [playground/src/knowledge/](../playground/src/knowledge/) + `loadPackDetail` / `loadSubVerticalDetail` in [packRegistry.js](../proxy/lib/packRegistry.js). 24 new tests; 257/257 playground + 464/464 proxy.
- [x] **Configuration expansion — Phase 9a (AVAILABLE TODAY).** Pure config, no code. Adding more Genie spaces / Supervisor fan-out lists / Azure OpenAI profiles (analytics mode) / AWS Bedrock profiles / Mosaic Foundation Model endpoints / Power BI workspaces / AAD tenants / packs is a `proxy/config.json` + allowlist edit. The proxy already routes every connector type in `config.example.json`; pack registry auto-discovers `pulsepacks/*` directories. See deployer checklist in [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md). Nothing to ship — call out in onboarding docs that this is configuration, not a roadmap item.
- [ ] **Stub-to-SDK graduation — Phase 9b (post-MVP-0.2, v0.3+, per-vendor).** Per-vendor code work. Tableau / Qlik / Looker adapters currently extend `GenericIframeAdapter` — they render iframes only (no AI-applied filters, no page navigation, no event bridge). Graduating each one means wiring the vendor's real SDK (Tableau Embedding API v3, Qlik `<qlik-embed>`, Looker `@looker/embed-sdk`) + per-vendor tests + per-vendor governance/license treatment. The `BIAdapter` contract is stable and ready. Trigger: an org standardises on a non-PBI BI tool.
- [ ] **Fabric feature support — Phase 10 (post-MVP-0.2, v0.4+).** Additive code inside the existing PBI adapter. Classic Power BI (Import / DirectQuery / Composite) is already plug-and-play; Fabric adds three feature classes that need new adapter logic: Direct Lake mount flow, Dataflow Gen2 refresh semantics, semantic-link API surface. The `license.powerbi.fabricEnabled` flag and the no-Fabric diagnostic already exist; flipping the flag becomes meaningful once the adapter actually supports those code paths. Trigger: an org enables Fabric.
- [ ] **Runtime-use preview** — for current BI + AI + pack selection, show what gets injected, what is retrievable, and what is tool-callable.
- [ ] **Retrieval profile contract** — map BI context + user role + connector + pack to allowed sources/indexes and ranking strategy.
- [ ] **Local pack retrieval preview** — no vector provider yet; preview relevant pack context/KPI/glossary snippets for a question and cite file provenance.
- [ ] **Governed retrieval provider interface** — `KnowledgeSourceAdapter`, `IndexProviderAdapter`, `RetrievalPolicyEngine`, `KnowledgeRetriever`, `EvaluationProvider`. Triggers Knowledge promotion to top-level group per [SETTINGS_SPEC § 17](SETTINGS_SPEC.md).
- [ ] **Databricks Vector Search retrieval adapter spike** — proxy query route and Settings hibernation state are shipped; still open is the real governed retriever contract, source chunk/citation mapping, ACL negative tests, and eval fixture once an approved Vector Search index exists.
- [ ] **Retrieval audit schema** — user/session/request id, BI context, pack, retrieval profile, sources, filters, chunks, policy decisions, staleness, latency.
- [ ] **KB eval fixture** — golden questions, citation correctness, ACL negative test, prompt-injection planted-doc test, stale-content behavior, latency budget.

### BI adapters

- [x] Power BI adapter wires `powerbi-client` SDK (cycle A)
- [x] Power BI secure embed link/iframe fallback mounts as preview-only iframe (2026-05-11)
- [x] Power BI developer snapshot API returns pages, active page, filters, capabilities, and secure-embed limitation notes (2026-05-12)
- [x] Power BI: `report.on('pageChanged' | 'filtersApplied' | 'dataSelected')` -> canonical `BIEvent` (cycle A)
- [x] Power BI: `send()` for `navigate-to-page`, `apply-filter`, `refresh`, `fullscreen`; `export` intentionally rejects until server-side export-to-file is wired (cycle A)
- [ ] Defer Tableau SDK graduation until Genie + Power BI production gate passes.
- [ ] Defer Qlik SDK graduation until Genie + Power BI production gate passes.
- [ ] Defer Looker SDK graduation until Genie + Power BI production gate passes.
- [x] Each adapter narrows its iframe sandbox attribute to vendor-minimum (2026-05-11, commit `9f7faef`)
- [x] BIAdapter conformance test suite (any adapter must pass) (2026-05-11, cycle I, commit `190c579`)

### Proxy / connectors

- [x] Production auth mode gate: IdP/shared-key/combined modes plus fail-closed production startup validation (2026-05-14)
- [ ] Per-user / per-profile rate limits
- [x] `/assistant/embed-token/powerbi` route (Azure AD SP) with RLS/Edit/cache hardening (2026-05-14)
- [ ] `/api/tableau/trusted-ticket` route
- [ ] `/api/qlik/oauth-token` route
- [ ] `/api/looker/signed-url` route
- [x] Power BI adapter wires `powerbi-client` SDK (cycle A)
- [x] Power BI event mapping + send() commands (cycle A)
- [x] `/assistant/embed-token/{vendor}` proxy route (cycle A — Power BI implemented; Tableau/Qlik/Looker can mirror)
- [x] **Naming sweep** (2026-05-10): package name `unibridge-ai-proxy` -> `pulseplay-proxy`; description updated; `X-Genie-Key` / `X-Genie-Target-Host` -> `X-PulsePlay-Key` / `X-PulsePlay-Target-Host` with backward-compat reads (Pulse PBI sibling visual still works); `dwd-supervisor-agent` -> `pulseplay-supervisor-agent` in `databricks-agents/supervisor/` and `proxy/config.example.json`; `.dwd-session.state.json` -> `.pulseplay-session.state.json` in `scripts/llm_*.py` (legacy file still read on resume); ADR-0003 file renamed to drop the now-stale `-800ms` suffix; `proxy/app.yaml` Supervisor name updated; CORS comment updated.
- [ ] Smoke test adapted to PulsePlay (the inherited Pulse smoke is shaped wrong)

### Smart Connect & Connector Probe (NEW — agnostic-first)

Spec: [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md). Two-feature bundle: probe + dropdown-applicability marks + AI-suggest fallback + author confirmation.

- [ ] **Connector Probe interface** — `connector.probe()` returning canonical `ConnectorProbeResult`, with adapters per backend (Genie / Supervisor / OpenAI / Bedrock / Foundation / MCP / generic). Agnostic-first; chat-only LLMs degrade gracefully to `metadataAvailability: "none"`.
- [ ] **Pack inference matcher** — match probe output against installed pack vocabularies; return `{ suggestedPack, suggestedSubVertical, confidence, because[] }`.
- [ ] **Test Connection panel** — runs probe, shows status + metadata snapshot + inference summary.
- [ ] **Pack picker** — flat list of installed packs; preselects inferred choice with `*` marker; author can override.
- [ ] **Settings dropdown applicability marking** — KPI / sample-question / prompt-template dropdowns mark options with `*` when probe results indicate the underlying data supports them. Non-applicable options stay pickable; `*` is hint, not enforcement.
- [ ] **AI Suggest fallback (single-shot KPI inference)** — when probe metadata is `"minimal"` or doesn't match pack KPIs, one bounded LLM call suggests 5 KPIs from column names + sub-vertical context. Author keeps / edits / removes each.
- [ ] **Probe result caching** — per-profile, default 24h TTL, manual re-probe trigger.
- [ ] **Probe audit logging** — every probe is a backend call; log to audit stream for cost-tracking + security audit.
- [ ] **Genie probe adapter** — `GET /api/2.0/genie/spaces/{spaceId}` for description/instructions; metadata-only SQL for tables; pull `sample_queries` if exposed.
- [ ] **Supervisor probe adapter** — read agent description; helper-space list; for `supervisor-local`, probe each child profile and merge.
- [ ] **OpenAI probe adapter** — read `profile.schemaContext` if configured; otherwise `metadataAvailability: "none"`.
- [ ] **Bedrock probe adapter** — read knowledge-base name/description if RAG mode; otherwise `"none"`.
- [ ] **Foundation Model probe adapter** — endpoint name + minimal metadata.
- [ ] **MCP probe adapter** — list `tools` and `resources` per MCP spec.
- [ ] **Generic probe adapter** — fallback for unknown connector types.

### AI sidebar

- [ ] Submit -> poll loop (replaces submit-only)
- [x] Fast Insights briefing ported from Pulse section taxonomy (HEADLINE / KPI / TRENDS / RISKS / RECOMMENDED ACTIONS); deep multi-stage mode remains a named future option
- [ ] Validator wired (`proxy/lib/insightsValidator.js` -> sidebar render path)
- [ ] Two-tier cache (memory + IndexedDB)
- [ ] BI event payload sanitization before prompt injection
- [ ] BICapabilities surfacing — sidebar hides commands the active adapter can't fulfill

### Tests / quality

- [x] First playground tests — 161 tests live as of 2026-05-12 across BIAdapter conformance, generic-iframe, Power BI, Tableau / Qlik / Looker stubs, AISidebar, PulseShell, PII redaction, health-probe caching, fast Insights briefing prompts, AI Insights output polish, card-style Insights rendering, raw-data Excel export helpers, and the CPG/FMCG pack merge
- [x] BIAdapter conformance harness (any adapter must pass it) (cycle I)
- [ ] First end-to-end demo: load a PBI report, ask "what page am I on?" — answer correctly
- [ ] Smoke against a live Databricks workspace through the proxy

### Docs

- [x] Consolidate 26 docs to ~10 active (this cycle)
- [x] Add [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) for Knowledge plane, Settings IA, Knowledge Base IA, retrieval contracts, and implementation phases.
- [x] Update `scripts/llm_onboard.py` to reference the new doc structure
- [x] Move project memory source of truth into repo-local [docs/memory/](memory/) instead of external `.claude` / `.Codex` directories.
- [ ] First HANDOVER.md entry that uses the new layout
- [x] Rename `.dwd-session.state.json` -> `.pulseplay-session.state.json` in `llm_wrapup.py` (both scripts now write the new name; legacy still read as fallback for half-migrated repos)

## Medium-term (4-8 cycles)

- [ ] Streaming AI (v0.4)
- [ ] Multi-vendor side-by-side (v0.5) — extends supervisor-local pattern to multi-vendor
- [ ] Voice in/out (v0.6)
- [ ] AI-driven auto-tour (v0.7)
- [ ] First eval suite — 30-50 fixed questions across 3 reference datasets, ground-truth answers, nightly run
- [ ] First vertical pack live (CPG/FMCG via `pulsepacks/cpg-fmcg/`)

## Long-term (months out)

- AI lens overlay (v0.8)
- Save / share / branch sessions (v0.9)
- Multi-user collaboration via WebRTC (v1.0)
- Cross-tool data unification via DuckDB-WASM (v1.1)
- Scheduled briefings (v1.2)
- Decision: do we go public-OSS? -> see PUBLIC_OSS_AGENDA.md

## Backlog (not committed; nice-to-have)

- WCAG 2.1 AA audit
- Hallucination detector (post-process AI answers, reconcile cited numbers vs underlying data)
- Per-connector A/B harness
- Telemetry dashboard (latency, cache hit, validator pass rate)
- Plugin system for the sidebar (custom prompt templates per pack)
- Chat history export to PDF / Markdown for compliance/sharing
- Read-only / explore-only mode for execs (no command issuance)
- Native mobile shell (Capacitor / Tauri) wrapping the playground

## Blockers / dependencies

| Item | Blocked by | Owner |
|---|---|---|
| Power BI adapter | Org's PBI workspace credentials in vault | DevOps |
| Embed-token endpoints | Org's Azure AD / Tableau / Qlik / Looker service principals | Platform team |
| First eval suite | Reference dataset (Pulse uses Superstore + HR sample; need org-appropriate equivalent) | Maintainer + data team |
| IdP middleware | Org's IdP integration patterns documented | Platform team |
| Pack architecture | First pack exists; next blocker is dynamic pack registry + Knowledge Base browser | Maintainer |
| Naming sweep (header names) | Agreement on how to maintain backward-compat with Pulse during the rename | Maintainer |

## Creative ideas (parked but worth noting — to keep us thinking ambitious)

These are not committed work. They are creative angles to come back to once the foundation is solid:

- **Capability negotiation** — combine connector probe results with BI adapter capability declarations. Surface only those AI features the connector supports AND the BI adapter can render. (E.g., "AI-driven filter" only shows if connector emits filter commands AND BI adapter implements `apply-filter`.)
- **Pack inheritance** — sub-vertical packs can extend a parent pack and override specific KPIs. Like CSS specificity for analytics templates. Useful when org-internal sub-pack overrides a published reference pack.
- **AI-suggested questions from active context** — combine connector probe ("this brain knows about procurement") + recent BI events ("user is on the vendor-scorecard view") -> AI suggests follow-up questions in real time. Lightweight heuristic; not chat.
- **Cost-saving telemetry** — track AI calls per pack per question, surface a $/question metric. Makes the cost-saving pitch measurable. Requires a per-call cost-model registry.
- **Pack marketplace (post-public-OSS)** — once on Apache 2.0, allow community-contributed packs alongside org-internal ones. Signed, versioned, conformance-tested.
- **Cross-pack recommendations** — when a user is in Supply Chain pack but asks a Sustainability question, system offers to overlay the Sustainability pack content rather than forcing pack-switch.

## Process notes

- Update this file at the close of every cycle. Move done items to a Done bucket per major version (v0.2, v0.3, etc.) or strike through.
- Don't reorder existing entries — append new ones at top of the relevant section.
- Cross-link to ADRs when a decision is made that locks an item in.
- When an item moves from "near-term" to "in flight," tag with `[in flight]` plus the cycle.
- New product features that emerge from brainstorms (like Smart Connect from 2026-05-10) get captured here under the relevant section, not in scratch notes.
