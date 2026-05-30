# PulsePlay App Feature + Option Audit

**Date:** 2026-05-18
**Scope:** Read-code audit of the current playground app, Settings, Launchpad, Knowledge Base, BI adapters, assistant/chat surfaces, and proxy-facing UI links.
**Baseline:** `main` through workbench Step 4 (`GenieNativeEmbed`, `ArtifactCard`, and artifact validator foundations tracked). Concurrent uncommitted Step 5 candidate chart-registry/renderer/compiler/package work was also visible locally, but this audit does not treat it as shipped behavior.
**Method:** Local code trace plus four research-agent lanes on Genie/native chat, visualization coverage, no-ungrounded-artifact design, and workbench UX.

## Legend

| Status | Meaning |
|---|---|
| Served | The visible option has real backing behavior and the purpose is materially met. |
| Partial | The option works for a subset, posture, or prototype path, but the user-facing promise is not complete. |
| Stub | The option is intentionally present but mostly iframe/read-only/no-op until a later adapter or API slice. |
| Not served | The UI says or implies a capability that is not currently delivered. |
| Risk | The behavior exists, but the copy/placement can mislead users or operators. |

## Executive Verdict

PulsePlay's foundation is good: the two-axis model is real, the app can host a BI surface and a connector-agnostic AI side, Settings is now the governing surface, Power BI has the strongest adapter, Databricks discovery is present, and the proxy has far more capability than the current UI exposes.

The lag the user is feeling is also real. The current chat experience is split between two surfaces: the old connector-agnostic `AISidebar` is simple and artifact-light, while Pulse mode has a richer Ask Pulse UI but is noisy, monolithic, and limited in chart coverage. The right fix is the locked Unified Ask Pulse Workbench, not a theme-only polish pass.

The biggest product gaps are:

1. **Unified assistant workbench is not app-wired yet.** Steps 1-4 types/native-embed/artifact-card/validator code have landed, but the app still does not route real assistant output through the workbench.
2. **Only Power BI has a real SDK-grade adapter today.** Tableau, Qlik, Looker, generic iframe, and Databricks Genie are iframe-first; Databricks AI/BI has an optional SDK path but remains partial.
3. **Settings BI provider is posture-only.** The BI Provider leaf shows status but does not let the user switch provider there.
4. **Launchpad Genie actions overpromise.** "Use as AI source" and "Float as pane" do not yet bind the clicked Genie space as a real assistant connector surface.
5. **Visualization runtime trails the reference.** The repo has a broad visualization knowledge base, but the live Pulse chart renderer only covers a small core set.
6. **Accuracy needs a product contract.** The honest target is not "100% no hallucination" for prose; it is **no ungrounded artifacts**: every number, table, chart, SQL, source, and exported artifact is verified, grounded, labeled, or blocked.

## Research-Agent Consensus

All four lanes converged on the same solve:

- Build one **Unified Assistant Surface / Ask Pulse Workbench**, not another sidebar variant.
- For Genie, use **Hybrid mode**:
  - Native Genie iframe when the org enables Embed Genie and the user has access.
  - PulsePlay Verified mode for API-driven, validated artifacts.
  - Hybrid mode when native Genie UX and PulsePlay evidence/actions should sit together.
- Keep BI surfaces on the Y-axis. A Genie space can still be embedded as a BI-like surface, but native Genie chat belongs on the X-axis assistant surface when connector = Genie.
- Use ECharts as the main runtime renderer, Vega-Lite as the validation/intermediate grammar, Plotly lazy-loaded for specialist charts, and D3/WebGL only for bespoke future visuals.
- Promise "zero ungrounded artifacts," not "the LLM can never hallucinate."

External research anchors used by the lanes:

- [Databricks Embed Genie](https://docs.databricks.com/aws/en/genie/embed)
- [Databricks Genie Conversation API](https://docs.databricks.com/gcp/en/genie/conversation-api)
- [Databricks Genie Agent Mode](https://docs.databricks.com/aws/en/genie/agent-mode)
- [Databricks AI/BI visualization types](https://docs.databricks.com/aws/en/dashboards/manage/visualizations/types)
- [Power BI visualization overview](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview)
- [Power BI exportData API](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/export-data)
- [Tableau Embedding API v3](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_about.html)
- [Qlik embed visualizations](https://qlik.dev/embed/foundational-knowledge/visualizations/)
- [Looker visualization types](https://cloud.google.com/looker/docs/visualization-types)
- [Apache ECharts features](https://echarts.apache.org/en/feature.html)
- [Vega-Lite marks](https://vega.github.io/vega-lite/docs/mark.html)
- [Observable Plot marks](https://observablehq.com/plot/features/marks)

## Main App Shell

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Route switcher: app, `/settings`, `/knowledge`, `/launchpad` | [App.tsx](../../playground/src/App.tsx) | Keep configuration, knowledge browsing, discovery, and the working canvas separate. | Served | Add a small route map in docs/onboarding so testers know these are first-class surfaces. |
| Top app title and setup status pill | [App.tsx](../../playground/src/App.tsx), [setupReadiness.ts](../../playground/src/settings/setupReadiness.ts) | Show readiness and deep-link users to setup. | Partial | Readiness is field-based. Add live proxy/probe/mount state so "Ready" means the selected BI and AI source actually work. |
| First-run wizard trigger | [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Guide a new user through persona, BI, AI, test, and first question. | Served | Track "configured but untested" separately from "ready." |
| `enabledComponents`: AI only, BI only, unified, split | [App.tsx](../../playground/src/App.tsx), [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Let the same app run as AI-only, BI-only, unified workbench, or split view. | Served | The labels are better now, but unified mode still needs the new workbench to feel intentional. |
| Unified `mix` behavior | [App.tsx](../../playground/src/App.tsx) | Make AI Insights / Ask Pulse the primary surface and open BI on demand. | Served | BI Viz is a focus action, not a true fused overlay yet. |
| Split layout | [SplitLayout.tsx](../../playground/src/components/SplitLayout.tsx) | Resizable AI/BI work area. | Served | No major functional gap found. |
| Pane maximize / restore / minimize / pin / open page / popout | [App.tsx](../../playground/src/App.tsx) | Let users focus one side or detach a surface. | Served | Keep as utility chrome; do not add more permanent buttons to the crowded chat surface. |
| Minimized pane dock | [App.tsx](../../playground/src/App.tsx) | Recover hidden AI/BI panes. | Served | No gap found. |
| Focused pane URLs `?focus=ai|bi` | [App.tsx](../../playground/src/App.tsx) | Share/open a single focused surface. | Served | Could add route smoke tests for deep links after workbench lands. |
| BI allowlist fail-closed banner | [App.tsx](../../playground/src/App.tsx), [settingsStore.tsx](../../playground/src/settings/settingsStore.tsx) | Refuse to mount disallowed or governance-unknown surfaces. | Served | No gap found. This is one of the stronger trust features. |
| BI tile grid policy | [App.tsx](../../playground/src/App.tsx), [BITileGrid.tsx](../../playground/src/components/BITileGrid.tsx) | Show backend-approved 1/2/4 canvas layouts. | Served | Per-tile cherry-pick is not implemented yet; keep that visibly disabled until it is real. |
| Power BI developer panel | [PowerBIDeveloperPanel.tsx](../../playground/src/components/PowerBIDeveloperPanel.tsx) | Inspect capabilities, events, snapshots, refresh/fullscreen/filter commands. | Partial | Useful for Power BI only. Export and robust field-binding are not complete. |
| Pulse mode hides outer pane header | [App.tsx](../../playground/src/App.tsx), [PulseShell.tsx](../../playground/src/components/PulseShell.tsx) | Avoid duplicate AI chrome because Pulse has its own surface switcher. | Served | The inner Pulse surface is still too noisy; solve through workbench extraction. |
| v0 mode legacy sidebar | [App.tsx](../../playground/src/App.tsx), [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Lightweight connector-agnostic chat and controls. | Partial | Good fallback, not the flagship experience. It lacks a full artifact workbench and chart renderer. |

## First-Run Wizard

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Persona presets: Analyst, Executive, Developer, Designer | [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Seed layout mode, UI mode, and preferred connector. | Served | Add copy that these are starting presets, not role-based permissions. |
| "Just give me defaults" | [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Fast lane into the app. | Risk | Can finish without a real embed config. Rename to "Start with defaults" and leave setup status as incomplete until BI + AI are live. |
| Choose BI tool | [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Select the Y-axis BI surface. | Served | Backed by allowlist, but Settings should offer the same governed picker. |
| Choose AI connector | [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Select the X-axis assistant brain. | Served | Add connector capability preview once workbench modes are wired. |
| Embed configuration step | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx) | Capture BI-specific embed settings. | Served | Some vendors are iframe-only; copy should say "display surface" until SDK graduation. |
| Test connection step | [TestConnectionPanel.tsx](../../playground/src/components/TestConnectionPanel.tsx) | Probe selected AI connector. | Partial | Non-blocking by design. Store last probe status in readiness so users can see "configured but failing." |
| Pack selection and first question | [PackPicker.tsx](../../playground/src/components/PackPicker.tsx), [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Start with business context and optionally submit first ask. | Served | In Pulse mode, this should route into the new workbench rather than the old sidebar path. |

## Settings Shell

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Grouped Settings IA | [SettingsShell.tsx](../../playground/src/settings/SettingsShell.tsx) | Make setup, BI, AI, preferences, system, and advanced options discoverable. | Served | Good IA. Keep future workbench settings under AI/Preferences, not scattered in app chrome. |
| Search and keyboard shortcut | [SettingsShell.tsx](../../playground/src/settings/SettingsShell.tsx) | Quick-find groups and leaves. | Served | No gap found. |
| Status strip chips | [SettingsShell.tsx](../../playground/src/settings/SettingsShell.tsx) | Show setup/BI/AI/pack/proxy/security posture and deep-link. | Served | Add live workbench mode chip after native/hybrid/verified modes are wired. |
| Leaf copy-link buttons | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) and group leaf pattern | Share exact Settings destinations. | Served | Extend consistently to all groups if any leaf lacks it. |

## Settings: Setup

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Readiness overview | [SetupGroup.tsx](../../playground/src/settings/groups/SetupGroup.tsx), [setupReadiness.ts](../../playground/src/settings/setupReadiness.ts) | Give one setup tree instead of scattered warnings. | Partial | Add live BI mount, AI probe, proxy health, and permission status. |
| BI vertical | [SetupGroup.tsx](../../playground/src/settings/groups/SetupGroup.tsx) | Summarize selected provider/embed/allowlist. | Served | Deep-link to an editable provider picker once BI Provider leaf is upgraded. |
| AI vertical | [SetupGroup.tsx](../../playground/src/settings/groups/SetupGroup.tsx) | Summarize profile/pack/allowed state. | Served | Add active assistant mode once workbench capability resolver is in UI. |
| Experience controls | [SetupGroup.tsx](../../playground/src/settings/groups/SetupGroup.tsx) | Link layout, canvas, and wizard controls. | Served | No major gap found. |

## Settings: BI

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Provider leaf | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) | Show active BI provider and allowlist posture. | Partial | It is read-only. Add a governed provider picker and clear/validate embed config when provider changes. |
| Embed leaf | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx), [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [embedConfigStore.ts](../../playground/src/settings/embedConfigStore.ts) | Own all BI embed configuration in Settings. | Served | Good. Keep this as the only canonical embed editor. |
| Clear embed config | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) | Reset BI source. | Served | Advanced "Reset BI" should also clear this key; it currently misses it. |
| Authentication leaf | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) | Explain active token/auth posture. | Served | Posture only is fine; keep secrets server-side. |
| Canvas leaf | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) | Show backend display policy. | Served | Add tile/object inventory once vendor SDK metadata is rich enough. |
| Status leaf | [BiGroup.tsx](../../playground/src/settings/groups/BiGroup.tsx) | Show live mount mode, license, and events. | Partial | Currently mostly license/posture. Wire BIPanel mount state, recent events, adapter capabilities, and last error. |

## Settings: AI

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Provider picker | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx), [settingsStore.tsx](../../playground/src/settings/settingsStore.tsx) | Select active assistant connector profile. | Served | Add mode preview: native, verified, hybrid, blocked. |
| Model / Agent metadata | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Explain profile type, endpoint, supervisor fan-out. | Served | No gap found. |
| Knowledge pack picker | [PackPicker.tsx](../../playground/src/components/PackPicker.tsx), [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Select business/domain prompt context. | Served | Better show which pack assets are used at runtime versus browse-only. |
| Vector Search KB | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx), proxy vector routes | Configure future retrieval index. | Partial | Stores a planned index, but full retrieval, citations, ACL trimming, and answer grounding are still missing. |
| Connection test | [TestConnectionPanel.tsx](../../playground/src/components/TestConnectionPanel.tsx), [SupervisorProbeMatrix.tsx](../../playground/src/components/SupervisorProbeMatrix.tsx) | Probe selected connector or supervisor fan-out. | Served | Persist last successful probe summary into Setup readiness. |
| AI Insights settings | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx), [pulseVisualSettingsStore.ts](../../playground/src/settings/pulseVisualSettingsStore.ts) | Configure stages, custom prompt, metric direction, cache, provenance, domain guidance. | Partial | Powerful but raw. Add schema validation, structured editors, prompt preview, and invalid-JSON blocking before runtime. |
| UC Metric View | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Pick Databricks metric views as semantic context. | Partial | Discovery exists, but selected metric views are not yet the universal semantic source for chat/insights. Remove hard-coded defaults or make them admin-configured. |
| Browse library | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx), [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Jump from AI Settings to pack documentation. | Served | No gap found. |

## Settings: Preferences

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| UI mode: Pulse / v0 | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Choose rich Pulse mode or lightweight legacy sidebar. | Served | Make Pulse the flagship after workbench lands; keep v0 as fallback/dev. |
| Layout presets | [layoutPresets.ts](../../playground/src/settings/layoutPresets.ts), [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Apply opinionated surface compositions. | Served | Revisit names after Unified Workbench lands. |
| Visible panels | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Choose AI-only, BI-only, unified, or split. | Served | No gap found. |
| AI position | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Place AI pane around BI in split layouts. | Served | No gap found. |
| AI surfaces: Insights / Ask Pulse | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx), [visual.tsx](../../playground/src/pulse/visual.tsx) | Select which Pulse surfaces appear. | Served | Workbench can own Ask Pulse internals without changing this user option. |
| Research Agent traces | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Show/hide trace panels when returned by upstream. | Served | Copy is honest that it does not force Genie Agent Mode. Keep it that way. |
| Managed agent surface | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Future ResponsesAgent-native assistant surface. | Not served | Disabled placeholder. Gate it by connector capability and route ResponsesAgent output into the workbench. |
| BI composition: full canvas / per-tile | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Future cherry-pick of BI tiles/visuals. | Partial | Per-tile is visible but not implemented. Make the disabled state explicit or hide until adapter metadata supports it. |
| Canvas tiles | [PreferencesGroup.tsx](../../playground/src/settings/groups/PreferencesGroup.tsx) | Show backend-approved tile mode. | Served | No gap found. |

## Settings: System

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Proxy status | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx), proxy `/health` | Confirm backend health. | Served | Add request-id copy button when health fails. |
| Network and auth | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Explain detected proxy auth posture. | Served | No gap found. |
| Security posture | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Show allowlist/governance posture. | Served | No gap found. |
| License posture | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Show Power BI/Fabric license hints. | Partial | Extend vendor-specific license/capability posture for Databricks, Tableau, Qlik, Looker. |
| Profile inventory | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Inspect proxy assistant profiles. | Served | No gap found. |
| Diagnostics | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Show recent BI events/errors. | Partial | Add proxy request IDs, adapter lifecycle state, and assistant conversation IDs for support correlation. |
| Re-run setup wizard | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx) | Let configured users restart onboarding. | Served | No gap found. |
| Export support bundle | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx), [exportBundle.ts](../../playground/src/settings/exportBundle.ts) | Produce redacted troubleshooting JSON. | Served | Add current workbench mode and artifact validation summaries once available. |

## Settings: Advanced

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Local storage inspector | [AdvancedGroup.tsx](../../playground/src/settings/groups/AdvancedGroup.tsx) | Let operators inspect client-side state safely. | Served | No gap found. |
| Reset section | [AdvancedGroup.tsx](../../playground/src/settings/groups/AdvancedGroup.tsx) | Clear one settings area with type-to-confirm. | Partial | BI reset omits `pulseplay:bi-embed-config`; AI reset omits several Pulse AI behavior keys. Fix key coverage or rename resets more narrowly. |
| Reset all | [AdvancedGroup.tsx](../../playground/src/settings/groups/AdvancedGroup.tsx) | Clear all `pulseplay:*` local state. | Served | No gap found. |
| Sign out Power BI / MSAL | [AdvancedGroup.tsx](../../playground/src/settings/groups/AdvancedGroup.tsx), [powerBiAuth.ts](../../playground/src/lib/powerBiAuth.ts) | Clear Power BI browser auth sessions. | Partial | Only Power BI is covered. Add Databricks/vendor-specific sign-out posture when those SDK paths mature. |

## Embed Configuration

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Power BI secure embed quick preview | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [powerbi adapter](../../bi-adapters/powerbi/index.ts) | Let users paste a safe report embed URL without exposing tokens. | Served | SDK commands are limited in iframe fallback; label as preview/limited. |
| Power BI AAD SSO | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [powerBiAuth.ts](../../playground/src/lib/powerBiAuth.ts) | Use user identity for secure embedding. | Served | Still needs live tenant/report smoke in each deployment. |
| Power BI backend service principal token | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), proxy `/assistant/embed-token/powerbi` | Issue embed tokens server-side. | Served | Export and RLS verification remain deployment-specific. |
| Power BI manual token paste | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx) | Dev escape hatch. | Served | Hidden outside dev flag; keep it that way. |
| Databricks AI/BI iframe | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [databricks-aibi adapter](../../bi-adapters/databricks-aibi/index.ts) | Show a Databricks dashboard for workspace users. | Partial | Iframe display works when allowed; richer events/metadata need SDK graduation. |
| Databricks AI/BI SDK/external embed | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [databricks-aibi adapter](../../bi-adapters/databricks-aibi/index.ts), proxy `/assistant/embed-token/databricks-aibi` | Server-issued scoped dashboard embed for external users. | Partial | Optional SDK is runtime-only and needs approved Databricks resources, dependency approval, and smoke. |
| Databricks Genie iframe | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [databricks-genie adapter](../../bi-adapters/databricks-genie/index.ts) | Embed a Databricks-generated Genie iframe. | Partial | Works as a BI surface. It is not yet promoted into assistant-axis Native Genie mode. |
| Generic iframe URL | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [generic-iframe adapter](../../bi-adapters/generic-iframe/index.ts) | Always-works display fallback for allowed origins. | Served | Correctly limited to display/load/refresh/fullscreen style behavior. |
| Tableau/Qlik/Looker URL | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx) | Let non-PBI vendors display inside PulsePlay today. | Stub | Graduate each to real SDKs only when an org standardizes on that vendor. |

## BI Adapter Matrix

| Vendor adapter | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| BIAdapter contract | [BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts) | Shared vendor-agnostic mount/event/command/metadata interface. | Served | Add explicit artifact/source metadata contract for workbench evidence. |
| Registry | [registry.ts](../../playground/src/biPanel/registry.ts) | Lazy-load adapters per vendor. | Served | No gap found. |
| BIPanel host | [BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx) | Mount/destroy vendors, enforce allowlist, emit BI events. | Served | Add live mount state export to Settings Status. |
| Generic iframe | [generic-iframe](../../bi-adapters/generic-iframe/index.ts) | Safe fallback for any allowed URL. | Served | No introspection by design. |
| Power BI | [powerbi](../../bi-adapters/powerbi/index.ts) | Real SDK adapter for Power BI reports. | Partial | Best current adapter, but export-to-file, exact field binding, and secure iframe command support are incomplete. |
| Databricks AI/BI | [databricks-aibi](../../bi-adapters/databricks-aibi/index.ts) | Databricks dashboard embed path. | Partial | Needs SDK dependency, live token smoke, event bridge, metadata. |
| Databricks Genie | [databricks-genie](../../bi-adapters/databricks-genie/index.ts) | Display Genie iframe as a BI-like surface. | Partial | Needs assistant-axis native/hybrid workbench integration. |
| Tableau | [tableau](../../bi-adapters/tableau/index.ts) | Placeholder for Tableau surfaces. | Stub | Replace iframe fallback with Embedding API v3 adapter when needed. |
| Qlik | [qlik](../../bi-adapters/qlik/index.ts) | Placeholder for Qlik surfaces. | Stub | Replace iframe fallback with qlik-embed adapter when needed. |
| Looker | [looker](../../bi-adapters/looker/index.ts) | Placeholder for Looker surfaces. | Stub | Replace iframe fallback with Looker Embed SDK when needed. |

## Assistant and Chat Surfaces

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Connector-agnostic v0 chat | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Ask questions against active connector, BI context, pack, and selected analysis frame. | Partial | Strong plumbing, weak flagship UX. Needs artifact canvas, chart renderer, evidence tabs, and smoother states. |
| Conversation start/poll | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx), proxy assistant routes | Start assistant conversations and poll messages. | Served | Move to streaming/progressive state where connector supports it. |
| BI context injection | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx), [BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts) | Make answers aware of current BI surface/events. | Partial | Power BI gives useful metadata; iframe vendors give almost none. |
| Frame picker | [FramePicker.tsx](../../playground/src/components/FramePicker.tsx) | Let users pick a reachable analysis frame. | Served | Add workbench placement and more transparent "why unreachable" evidence. |
| SQL details | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Expose generated/executed SQL. | Served | Needs validation status and copy/export parity in artifact model. |
| Result table | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Show returned tabular data. | Partial | Add virtualization, sticky headers, formatting, column types, export, and row-count warnings. |
| Evidence drawer | [EvidenceDrawer.tsx](../../playground/src/components/EvidenceDrawer.tsx) | Show SQL/diagnostics evidence. | Partial | Expand to citations, BI visual source, metric view, vector chunks, request IDs, and validation gates. |
| Sustainability indicator | [SustainabilityIndicator.tsx](../../playground/src/components/SustainabilityIndicator.tsx) | Show token/cost hints. | Served | Optional; keep unobtrusive in flagship UI. |
| PulseShell bridge | [PulseShell.tsx](../../playground/src/components/PulseShell.tsx) | Host ported Pulse visual and map BI events into Pulse-shaped context. | Served | Good compatibility bridge; avoid further monolith growth. |
| Pulse Ask Pulse chat | [visual.tsx](../../playground/src/pulse/visual.tsx) | Rich chat with history, progress, suggestions, SQL/table/chart/trace views. | Partial | Richer than v0 but noisy, hard to maintain, and chart-limited. Extract into workbench components. |
| Pulse AI Insights | [visual.tsx](../../playground/src/pulse/visual.tsx) | Multi-stage AI insights, cache, refresh/stop, export, compare. | Partial | Functional and valuable; settings need better validation and UI needs less noise. |
| Pulse chart/table/sql tabs | [visual.tsx](../../playground/src/pulse/visual.tsx), [visualHelpers.ts](../../playground/src/pulse/visualHelpers.ts) | Let users switch answer formats. | Partial | Chart support is small compared with the visualization reference. |
| Trace/reasoning display | [visual.tsx](../../playground/src/pulse/visual.tsx) | Show reasoning when upstream returns it. | Served | Keep gated; do not imply hidden traces exist for every connector. |
| Feedback/copy/export actions | [visual.tsx](../../playground/src/pulse/visual.tsx) | Let users reuse and judge responses. | Served | Add artifact-level export and validation state after workbench model lands. |

## Unified Workbench In Flight

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Assistant capability model | [assistant.ts](../../playground/src/types/assistant.ts), [connectorCapabilities.ts](../../playground/src/lib/connectorCapabilities.ts) | Type native/verified/hybrid modes and connector capabilities. | Served | Step 1 is the right foundation. |
| Genie native embed component | [GenieNativeEmbed.tsx](../../playground/src/components/workbench/GenieNativeEmbed.tsx), [workbenchDescriptors.ts](../../playground/src/lib/workbenchDescriptors.ts) | Assistant-axis native Genie iframe and descriptor building. | Partial | Step 2 code/tests are tracked, but no visible app route uses it yet. Wire it into active connector/profile state. |
| Artifact card shell | [ArtifactCard.tsx](../../playground/src/components/workbench/ArtifactCard.tsx), [ArtifactTabs.tsx](../../playground/src/components/workbench/ArtifactTabs.tsx) | Answer / Chart / Table / SQL / Evidence / Reasoning tabs. | Partial | Step 3 code/tests are tracked, but real assistant output is not normalized into artifacts yet. |
| Verified artifact validator | [UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md), [artifactValidator.ts](../../playground/src/lib/artifactValidator.ts), [problemDetails.ts](../../playground/src/lib/problemDetails.ts) | Emit Verified / Grounded draft / Suggestion / Blocked. | Partial | Step 4 code/tests are tracked, but real assistant output is not yet routed through the validator. Never allow the LLM to self-declare `Verified`. |
| Chart registry and renderer | [CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](../CHAT_VISUALIZATION_KNOWLEDGE_BASE.md), [UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md), candidate [chartRegistry.ts](../../playground/src/lib/chartRegistry.ts) / [EChartsRenderer.tsx](../../playground/src/components/workbench/EChartsRenderer.tsx) / [vegaLiteToECharts.ts](../../playground/src/lib/vegaLiteToECharts.ts) | Support professional, advanced, trendy, legacy, and future-proof visuals with rules. | Not served | Step 5 candidate work is currently uncommitted and moving. Treat as not shipped until committed, tested, and wired to `ArtifactCard`. |

## Launchpad

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| Capability snapshot | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx), proxy `/assistant/capabilities` | Show Databricks capability availability. | Served | No gap found. |
| AI/BI dashboard discovery | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx), proxy lakeview routes | List dashboards and let users use one as BI source. | Served | Add metadata preview and last refreshed info when API provides it. |
| "Use dashboard as BI source" | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Store Databricks AI/BI embed config and navigate app. | Served | Needs SDK/live token hardening for production-grade external embed. |
| Genie Spaces discovery | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx), proxy genie routes | List Genie spaces. | Served | Good discovery surface. |
| Genie "Use as AI source" | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Make selected Genie space the assistant source. | Not served | Currently does not bind the clicked space/profile. Create/select a real profile or store selected space in a connector descriptor. |
| Genie "Float as pane" | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Let user view Genie alongside app. | Risk | Actually configures Genie as BI source and navigates app. Rename or implement true pane/popout behavior. |
| Serving endpoints | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Discover Mosaic model endpoints. | Partial | Open-only. Add "create/use assistant profile" when safe. |
| Databricks Apps | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Discover deployed apps. | Partial | Open-only. Useful for inventory, not integration yet. |
| SQL warehouses | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Discover SQL compute. | Partial | Open-only. Later connect to query execution/probe readiness. |

## Knowledge Base

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| `/knowledge` route | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx), [knowledgeRoute.ts](../../playground/src/knowledge/knowledgeRoute.ts) | Browse installed packs outside Settings. | Served | No gap found. |
| Pack rail | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx), proxy pack routes | Select installed pack. | Served | Add search when pack count grows. |
| Overview / Glossary / Ontology / References / Sub-verticals | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx) | Human-readable pack content. | Served | No gap found for browsing. |
| Runtime use tab | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx) | Explain what the assistant injects today. | Served | It honestly says many assets are browse-only; close the runtime gap through retrieval and citations. |
| Demos tab | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx) | Future demo questions/workflows. | Stub | Add "Try demo" after workbench can run pack-scoped questions predictably. |

## Proxy-Facing UI Coverage

| Feature / Option | Linked implementation | Purpose | Status | Gap / Fill |
|---|---|---|---|---|
| `/health` | [SystemGroup.tsx](../../playground/src/settings/groups/SystemGroup.tsx), [server.js](../../proxy/server.js) | Backend availability. | Served | Add support-code surfacing on failure. |
| `/assistant/profiles` | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx), [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Populate AI connector choices. | Served | Add capability/mode preview in UI. |
| `/assistant/allowlist` | [settingsStore.tsx](../../playground/src/settings/settingsStore.tsx), [App.tsx](../../playground/src/App.tsx), [BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx) | Governance for visible vendors/profiles/origins. | Served | No gap found. |
| `/assistant/conversations/start` and message poll | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx), Pulse genie client | Chat execution. | Served | Workbench should normalize output into artifacts. |
| `/assistant/probe` | [TestConnectionPanel.tsx](../../playground/src/components/TestConnectionPanel.tsx), [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Connector health/test. | Served | Persist last probe. |
| `/assistant/capabilities` | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx), [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Databricks discovery posture. | Served | Feed capability result into Setup readiness and workbench mode resolution. |
| Databricks asset discovery routes | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx), [server.js](../../proxy/server.js) | Discover dashboards, Genie spaces, endpoints, apps, warehouses. | Served | Some discoveries are inventory-only until actions are wired. |
| Embed-token routes | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx), [server.js](../../proxy/server.js) | Keep embed-token issuance server-side. | Served | Databricks external embed still needs live deployment smoke. |
| Knowledge pack routes | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx), [PackPicker.tsx](../../playground/src/components/PackPicker.tsx) | Browse/select packs. | Served | Add runtime retrieval/eval routes later. |
| Vector search query route | [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx), [server.js](../../proxy/server.js) | Future retrieval grounding. | Partial | Route exists, but the app does not yet use a full grounding bundle in answers. |
| ResponsesAgent routes | proxy `/responses-agent/*`, capability matrix | Managed-agent future path. | Partial | Middleware exists; visible workbench surface is not wired. |

## Visualization Gap

The repo's direction is correct: [CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](../CHAT_VISUALIZATION_KNOWLEDGE_BASE.md) and [UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md) already point to a registry-driven runtime. The current app does not yet deliver that runtime.

Recommended chart tiers:

| Tier | Auto-pick? | Examples | Purpose |
|---|---|---|---|
| Core professional | Yes | KPI/counter, table, pivot, bar/column, grouped/stacked bar, line, area, combo, scatter, bubble, histogram, box, heatmap, map, funnel, waterfall | Default analytics coverage. |
| Advanced professional | Yes, with data-shape rules | Small multiples, bullet, cohort heatmap, Sankey, Gantt/timeline, Pareto, confidence bands, decomposition/driver cards | Stronger BI and executive storytelling. |
| Trendy / modern | Opt-in or heuristic | Lollipop, slope, bump, calendar heatmap, streamgraph, sunburst/icicle, ridgeline, violin, beeswarm, hexbin | Useful when they clarify, not as decoration. |
| Legacy compatibility | Never auto-pick unless requested/source uses it | Gauge, radar, word cloud, packed bubble, large pie/donut, 3D charts, dense dual-axis | Compatibility only. |
| Future/specialized | Opt-in | Candlestick/OHLC, contour, ternary, parallel coordinates, network, dependency wheel, Venn, custom WebGL/WebGPU | Specialist lanes and future-proofing. |

Accuracy gates for every generated visual:

1. Capability gate: selected chart must be supported by active renderer or vendor.
2. Query gate: SQL/DAX must be scoped, read-only, permissioned, and request-id traced.
3. Result gate: chart spec can reference only returned columns/aggregates.
4. Spec gate: JSON Schema plus PulsePlay chart rules.
5. Evidence gate: every displayed number/date/category maps to rows, query, metric view, BI source, or citation.
6. Accessibility gate: no color-only meaning; labels and keyboard paths required.
7. Render gate: nonblank chart, responsive layout, tooltip, truncation warnings, export parity.
8. Eval gate: golden questions before claiming quality.

## Priority Gap Plan

### P0 - Make visible promises honest

1. Update Launchpad Genie action copy or wire real selected-space binding.
2. Make BI Provider editable in Settings or rename it to "Provider status."
3. Fix Advanced "Reset BI" key coverage so embed config is actually cleared.
4. Make per-tile cherry-pick and managed-agent placeholders explicitly disabled/not-yet-available.
5. Add live readiness dimensions: proxy health, AI probe, BI mount, last error.

### P1 - Ship the flagship chat solve

1. Wire the tracked Step 2 native Genie assistant-axis embed into active connector/profile state.
2. Wire the tracked Step 3 artifact card shell to real assistant outputs.
3. Route real assistant output through the tracked Step 4 validator before rendering status.
4. Normalize v0 sidebar and Pulse chat outputs into `WorkbenchArtifact`.
5. Add inspector drawer for SQL, result rows, citations, BI source, filters, validation checks, request IDs.
6. Keep Pulse AI Insights as a sibling surface while Ask Pulse becomes workbench-first.

### P2 - Make visuals and evidence production-grade

1. Build chart registry and machine-readable rules from the visualization reference.
2. Add ECharts modular renderer, Vega-Lite spec validator/IR, and Plotly lazy specialist path.
3. Expand table renderer: virtualization, sticky headers, data types, numeric formatting, export.
4. Implement artifact validation statuses emitted by validators, not by LLM output.
5. Expand Knowledge runtime: retrieval adapters, ACL-trimmed chunks, citations, metric-view grounding, evals.

### P3 - Vendor graduation

1. Graduate Tableau to Embedding API v3 when a real Tableau pilot exists.
2. Graduate Qlik to qlik-embed when a real Qlik pilot exists.
3. Graduate Looker to Embed SDK when a real Looker pilot exists.
4. Extend license/capability posture by vendor.
5. Add vendor-specific sign-out/session posture where SDKs support it.

## Do Not Claim Yet

- Do not claim PulsePlay has "100% hallucination-free AI." Claim "no ungrounded artifacts" after validators ship.
- Do not claim Tableau/Qlik/Looker production integrations. They are iframe display stubs today.
- Do not claim Genie Agent Mode API support. Agent Mode is UI/native only; API mode returns structured results, not the full native UI behavior.
- Do not claim the visualization catalog is runtime-supported. The reference exists; the chart registry/renderer does not.
- Do not claim Launchpad Genie "Use as AI source" binds a selected space until that action actually creates/selects a connector descriptor.
- Do not claim the workbench is visible in the app yet. Steps 2-3 are component foundations, not end-user routing.
- Do not claim Reset BI clears all BI state until `pulseplay:bi-embed-config` is included.

## Recommended Next Slice

Ship a small, visible "Workbench wiring + truth polish" slice:

1. Wire native Genie embed into the assistant-axis workbench capability path behind connector = Genie.
2. Route one real assistant response into `ArtifactCard`.
3. Route the Step 4 validator into the workbench and keep status validator-owned.
4. Fix the P0 copy/key/readiness gaps above.
5. Leave visual renderer work for the next slice, but make the artifact shell destination clear.

That gets the app closer to the user's mission: one unified screen where any BI surface can stay active, any assistant connector can power the chat, and the user can trust exactly which outputs are verified.
