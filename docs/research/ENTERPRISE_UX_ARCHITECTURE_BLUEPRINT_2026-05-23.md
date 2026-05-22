# PulsePlay Enterprise UX Architecture Blueprint

Date: 2026-05-23

Status: Design-thinking and implementation blueprint. No runtime code changed.

Audience: Codex, Claude, Gemini, product/design reviewers, and engineers implementing PulsePlay's production-grade enterprise application experience.

Purpose: turn the current PulsePlay product into a coherent, premium, scalable enterprise app without diluting the two-axis architecture. This document is intentionally implementation-ready. It names product behavior, reusable components, state contracts, screen structures, and acceptance criteria so a coding agent can act with minimal ambiguity.

## Executive Verdict

PulsePlay already has the right strategic foundation: a host app that combines the BI surface the user is looking at, the AI connector that answers, and the knowledge plane that grounds the answer. The product risk is not lack of features. The product risk is that the features read as separate rooms instead of one confident enterprise workflow.

The next product leap is a shell and journey redesign:

1. A Viewer experience that feels immediate: see the business surface, ask a question, trust the answer, inspect evidence.
2. An Authoring console that feels progressive: choose BI, choose AI, choose knowledge, review governance, run smoke, hand off.
3. A global typeahead command surface that lets power users navigate, configure, ask, diagnose, and recover without hunting through Settings.
4. A shared trust grammar across every answer: source, scope, freshness, request id, governance authority, and owner-aware recovery.

Do not repaint the whole app first. Fix the choreography, shell hierarchy, typeahead, and trust model first. Visual polish should ride on top of that structure.

## Product Architecture Review

### Current Architecture Strengths

Preserve these foundations:

| Strength | Why it matters | Implementation anchor |
|---|---|---|
| Two-axis BI + AI model | Keeps BI vendor choice independent from AI connector choice. | `docs/ARCHITECTURE.md`, `BIAdapter`, proxy profiles |
| Knowledge plane | Adds business vocabulary without becoming a third competing navigation axis. | `pulsepacks`, `KnowledgeShell`, proxy pack context |
| `BIAdapter` contract | Lets the host remain vendor-agnostic. | `playground/src/biPanel/BIAdapter.ts` |
| Proxy profile system | Lets the app route to Genie, Azure OpenAI, Bedrock, Foundation Model, Supervisor, ResponsesAgent, and Power BI DAX. | `proxy/server.js`, `docs/PROXY_REFERENCE.md` |
| Native governed canvas | Gives PulsePlay a trusted result-rendering path beyond iframes. | `playground/src/visualization`, `bi-adapters/native` |
| Existing Settings route model | Deep links and left rail are valuable; the problem is density and semantics, not route existence. | `SettingsShell.tsx`, `settingsRoute.ts` |
| Recent Split Workspace Setup direction | The five-gate idea is directionally right for Author setup. | `SetupGroup.tsx`, `settings.css` |

### Current Friction

| Friction | User impact | Recommended correction |
|---|---|---|
| The app has many high-power surfaces: AI Insights, Ask Pulse, Dashboard, Settings, Knowledge, Launchpad, Workbench, Power BI Q&A. | Users feel they are moving between tools instead of through a journey. | Create one global shell taxonomy and label each surface by user intent. |
| Settings exposes too much at once. | Authors must understand the system before the UI teaches it. | Convert Settings to an Authoring Console with Setup Home and progressive detail pages. |
| Viewer and Author concerns are blended. | Business users see configuration concepts; Authors see viewer controls as ordinary settings. | Separate Viewer Experience, Authoring, Knowledge, Observability, and System/Admin scopes. |
| Search is label-level, not task-level. | Users search for "connect Power BI", "test Genie", "token", "DAX", "security" and get weak results. | Build a command registry and typeahead index with aliases, actions, roles, and context. |
| Trust facts are uneven. | Users do not always know what source/freshness/governance status an answer used. | Standardize `TrustFooter` and `SourceFreshnessChip` across every AI answer and preview. |
| The AI sidebar, ported Pulse surface, and native canvas do not yet feel like one system. | The user may not know whether Ask Pulse and AI Insights are peers, copies, or different products. | Use one "Ask surface" contract and one evidence/trust grammar. |
| Launchpad reads as inventory. | Authors do not know how discovered Databricks/BI assets become a configured experience. | Reframe as "Choose assets for this PulsePlay experience." |
| Workbench and Q&A are valuable but can distract from the core journey. | Users may mistake preview/lab surfaces for production defaults. | Put labs behind a "Tools and experiments" entry and explicit preview copy. |

### Target Product Model

PulsePlay should be explained and implemented as:

```text
Experience Shell
  Viewer uses it daily.
  Author previews it before handoff.

Authoring Console
  Author configures and validates BI + AI + Knowledge + Governance.
  Admin/Support inspect system health, policy, and diagnostics.

Command Surface
  Everyone uses it to navigate, ask, configure, and recover quickly.
```

The product should not be organized around code artifacts. It should be organized around user intent:

| Product area | Primary users | Job |
|---|---|---|
| Experience | Viewer, Author preview | View BI, read AI briefing, ask follow-up, inspect evidence. |
| Authoring | Author | Configure an experience and publish/handoff safely. |
| Knowledge | Author, data product owner | Review packs, KPIs, glossary, source freshness, grounding previews. |
| Assets | Author, Admin | Choose BI dashboards, Genie spaces, metric views, semantic models, apps. |
| Observability | Support, Admin, Developer | Diagnose proxy/profile/allowlist/governance failures and export support bundles. |
| System | Admin, Deployer | Hosting, auth, secrets, policies, environment, deployment posture. |
| Labs | Developer, evaluator | Workbench, Power BI Q&A bridge, experimental flows, compatibility tests. |

### Navigation Architecture

Use four levels only:

| Level | Purpose | PulsePlay example | Rule |
|---|---|---|---|
| L0 Global shell | App-level orientation and command entry. | PulsePlay brand, global typeahead, active context chips, user/session actions. | Always present except focused modal flows. |
| L1 Primary nav | Major product areas. | Experience, Authoring, Knowledge, Assets, Observability, System, Labs. | 5-7 items max. No deep trees. |
| L2 Local nav | Tabs/tasks inside a product area. | Setup, BI surface, AI connector, Knowledge, Governance, Preview. | Shows only relevant children for the area. |
| L3 Detail surface | Form, table, preview, drawer, or panel. | Power BI governed embed form, profile test result, pack preview. | One primary task per detail surface. |

Do not add L4 nested navigation. If a screen seems to need L4, create a drawer, modal, side panel, or separate detail route.

### Recommended Global Shell

Desktop shell:

```text
+--------------------------------------------------------------------------------+
| PulsePlay  [Command or ask anything...]       BI: Power BI  AI: Genie  Pack: CPG |
+--------+-----------------------------------------------------------------------+
| Nav    | Context strip: Sales dashboard / Genie profile / Pack / Freshness       |
|        +-----------------------------------------------------------------------+
| Exp    | Main workspace                                                         |
| Author |                                                                       |
| Know   |                                                                       |
| Assets |                                                                       |
| Obs    |                                                                       |
| System |                                                                       |
| Labs   |                                                                       |
+--------+-----------------------------------------------------------------------+
```

Mobile/tablet shell:

```text
+--------------------------------------------------+
| PulsePlay     [Search/command icon]              |
| BI Power BI | AI Genie | Pack CPG | Fresh 2m      |
+--------------------------------------------------+
| Experience | Authoring | Knowledge | More         |
+--------------------------------------------------+
| Single-column current surface                    |
+--------------------------------------------------+
```

Implementation:

- Create `AppShell` as the outer frame for all routes.
- Move global search/typeahead into `GlobalCommandButton` + `CommandPalette`.
- Create `ContextBar` for BI/AI/Knowledge/Governance chips.
- Keep route-specific shells (`SettingsShell`, `KnowledgeShell`, `LaunchpadShell`) but make them children of the global shell rather than separate visual universes.
- Use `SurfaceSwitcher` only inside the Experience area. Do not make it compete with global navigation.

## UX And UI Design System Guidance

### Design Principles

1. Show the current state before the control.
   - Every enterprise setting should start with current value, source, freshness, impact, and next action.

2. One primary action per viewport.
   - A screen can have many secondary actions, but only one dominant "continue", "test", "apply", "publish", or "ask" action.

3. Use progressive disclosure as workflow, not decoration.
   - Parent choice first. Child fields appear only after the parent choice makes them relevant.

4. Keep enterprise surfaces dense but calm.
   - Avoid marketing-card layouts. Use compact rows, tables, segmented controls, and split workspaces.

5. Make AI status visible without making AI feel fragile.
   - Show what the system knows, what it used, and what failed in plain language.

6. Never let safe blocking look like random failure.
   - Every blocked state needs owner, reason, impact, and next step.

7. Design for keyboard first, mouse friendly.
   - Every major action should be reachable through typeahead and visible controls.

8. Separate user scope.
   - Viewer preference, author default, workspace policy, admin setting, and support diagnostic must not look equivalent.

### Visual System

Use a restrained enterprise grammar:

| Token family | Guidance |
|---|---|
| Color | Use semantic tokens only: background, surface, elevated, text, muted, border, accent, success, warning, danger, info. Avoid one-note palettes and heavy gradients. |
| Radius | Keep controls and cards at 6-8px unless an existing component requires otherwise. |
| Spacing | Use a 4px base grid with 8, 12, 16, 24, 32 as dominant spacing. |
| Typography | Use compact hierarchy. Large type belongs only on true first-run/empty states, not settings cards. |
| Elevation | Use sparingly for popovers, command palette, dialogs, and drawers. Page sections should not float as nested cards. |
| Iconography | Use recognizable icons for actions. Pair icons with tooltips when the meaning is not universal. |
| Motion | Use subtle transitions for panel open/close and command execution. Respect reduced motion. |
| Density | Support at least two density modes later: comfortable and compact. Default should be compact-comfortable for enterprise daily use. |

### Theme Strategy

Implement theme as two independent axes:

| Axis | Values | Purpose |
|---|---|---|
| Color mode | `system`, `light`, `dark` | User/environment accessibility preference. |
| Theme preset | `default`, `slate`, `contrast`, future brand presets | Visual flavor and enterprise branding. |

Implementation:

- Define CSS variables under `:root`, `[data-color-mode="dark"]`, and `[data-theme-preset]`.
- Replace hardcoded colors in `settings.css` and shared UI files gradually with semantic `--pp-*` tokens.
- Keep dark mode explicit in Appearance: segmented control for System / Light / Dark.
- Add tests that mount key shells in light and dark mode and assert no unreadable token combinations for primary text/background classes where practical.

### Accessibility Rules

Minimum acceptance:

- Support keyboard navigation for every interactive control.
- Use semantic landmarks: header, nav, main, aside, footer where appropriate.
- Use logical heading order.
- Do not depend on color alone for status.
- Use focus restoration after dialogs and command palette close.
- Use `aria-live` only for meaningful async status, not constant decorative updates.
- Ensure settings and command palette work at 320px width and 200% text zoom without horizontal overflow.
- Typeahead must follow WAI-ARIA combobox/listbox/dialog patterns, not improvised ARIA.

### State Patterns

| State | Pattern |
|---|---|
| Empty | Explain what is missing, show one next action, optionally show demo/sample content. |
| Loading | Keep layout stable, use skeletons only where content shape is known, include plain status when load exceeds 1s. |
| Error | Use problem category, owner, next step, support id/request id, and retry if safe. |
| Success | Confirm what changed and whether it is live, draft, or session-only. |
| Blocked | Show impact, policy source, owner, freshness, and redacted handoff action. |
| Stale | Show last checked time and a refresh/test action. |
| Preview | Label as preview and state what is not production-verified. |

## Screen-Level Guidance And Wireframes

### 1. Viewer Experience

Purpose: make a business user productive in the first 10 seconds.

Recommended layout:

```text
+--------------------------------------------------------------------------------+
| PulsePlay [Ask or search...]               Power BI | Genie | CPG | Fresh 2m    |
+--------+------------------------------+----------------------------------------+
| Nav    | AI Insights                  | Ask Pulse                              |
|        | ---------------------------- | -------------------------------------- |
| Exp    | Headline                     | Composer                               |
|        | KPI snapshot                 | Suggested questions                    |
|        | Trends / risks / actions     | Answer stream                          |
|        | Evidence drawer trigger      | Token/session efficiency chip          |
|        +------------------------------+----------------------------------------+
|        | BI surface / native canvas / dashboard                                |
+--------+-----------------------------------------------------------------------+
```

Behavior:

- Default view should show an already-useful insight or dashboard, not a setup wall.
- Viewer should see a compact context strip: BI source, AI connector, knowledge pack, freshness, governance state.
- Ask Pulse composer should be visually primary but not huge.
- Suggested questions should be grounded in available frames, common questions, and current BI metadata.
- `TokenSessionEfficiency` belongs near Ask, not in Settings as a live gauge.

Reusable components:

- `ExperienceShell`
- `ContextBar`
- `AskComposer`
- `SuggestedQuestionList`
- `AnswerCard`
- `TrustFooter`
- `EvidenceDrawer`
- `TokenSessionEfficiencyChip`

Implementation notes:

- Ensure `AISidebar` and ported Pulse Ask use one shared answer-card/trust-footer pattern over time.
- Preserve `entryToAIResultEnvelope` for native canvas dispatch.
- Add `answerContext` object that all answer renderers can consume:

```ts
interface AnswerContextSummary {
  sourceLabel: string;
  sourceKind: "bi-live" | "bi-fallback" | "pack" | "manual" | "fixture";
  freshnessLabel: string;
  requestId?: string;
  governanceAuthority?: string;
  profileName?: string;
  packName?: string;
  confidence?: "high" | "medium" | "low" | "unknown";
}
```

### 2. Authoring Console Home

Purpose: make setup feel like a guided enterprise workflow, not a pile of controls.

Recommended layout:

```text
+--------------------------------------------------------------------------------+
| Authoring / Setup       Readiness: Needs AI test       Preview as viewer        |
+-------------------------+--------------------------------+---------------------+
| Setup                   | Task list                      | Current experience  |
| BI surface              | 1 BI surface        Ready      | BI: Power BI        |
| AI connector            | 2 AI connector      Needs test | AI: none            |
| Knowledge               | 3 Knowledge         Optional   | Pack: CPG           |
| Governance              | 4 Governance        Strict     | Policy: strict      |
| Preview & handoff       | 5 Smoke and handoff Locked     | Next: test profile  |
+-------------------------+--------------------------------+---------------------+
```

Behavior:

- Setup Home is the default Authoring route.
- Each row is a task with status, owner, short impact, and primary action.
- Detail opens in the main area or a right-side split panel, not a modal unless the task is brief.
- Completed tasks remain editable but no longer visually dominate.
- The right context rail previews what the Viewer will experience.

Reusable components:

- `AuthoringShell`
- `SetupTaskList`
- `SetupTaskRow`
- `CurrentStateHeader`
- `ImpactCallout`
- `OwnerBadge`
- `ReadinessMeter`
- `ViewerPreviewSummary`

Implementation notes:

- Build a pure `AuthoringStateSnapshot` facade. Do not let each UI component recompute readiness differently.

```ts
interface AuthoringStateSnapshot {
  bi: SetupNodeState;
  ai: SetupNodeState;
  knowledge: SetupNodeState;
  governance: SetupNodeState;
  smoke: SetupNodeState;
  canPreview: boolean;
  canPublish: boolean;
  blockers: SetupBlocker[];
}

interface SetupNodeState {
  id: "bi" | "ai" | "knowledge" | "governance" | "smoke";
  label: string;
  status: "not-started" | "needs-input" | "needs-test" | "ready" | "blocked" | "optional";
  currentValue?: string;
  source?: string;
  freshness?: string;
  owner?: "author" | "bi-owner" | "ai-platform" | "security" | "admin" | "support";
  nextAction: string;
  route: string;
}
```

### 3. BI Surface Setup

Purpose: choose what the Viewer sees.

Recommended flow:

1. Choose mode.
2. Enter mode-specific required fields.
3. Test embed/policy.
4. Review viewer impact.

Mode cards:

| Mode | When to show | Child fields |
|---|---|---|
| Native sample canvas | Always | None or sample dataset selector. |
| Generic iframe | Always if allowlist permits | URL/iframe HTML, sandbox explanation, allowlist status. |
| Power BI quick preview | If Power BI vendor available | secure embed link/iframe, workspace/report hint. |
| Power BI governed embed | If backend profile/env available | report id, group id, token route readiness, RLS mode. |
| Databricks AI/BI | If available | dashboard URL/id, workspace host, auth posture. |
| Future SDK adapters | Only when adapter capability exists | vendor-specific fields. |

Behavior:

- Do not show Power BI service principal fields until governed Power BI mode is selected.
- Do not show unsupported vendor commands as enabled.
- If policy blocks a URL, keep focus on recovery, not downstream controls.
- Preview must use the normal `BIPanel` path and allowlist enforcement. No direct Settings iframe.

Reusable components:

- `ModeCard`
- `EmbedUrlInput`
- `PolicyCheckPanel`
- `AdapterCapabilityList`
- `PreviewBoundary`
- `InlineProbeResult`

State:

- Store requested mode separately from runtime resolved vendor.
- Show both when fallback occurs:
  - Requested: Power BI
  - Runtime: Native sample canvas
  - Reason: Missing embed configuration or blocked policy

### 4. AI Connector Setup

Purpose: choose who answers and test it.

Recommended layout:

```text
Current connector
  Profile: Genie Sales
  Status: Needs test
  Source: /assistant/profiles
  Last checked: not yet

Recommended profiles
  [Genie Sales] [Foundation Model] [Power BI DAX]

Explore all connectors
  collapsed catalogue

Test panel
  Prompt: "Summarize this dashboard"
  Result: route, latency, governance, request id
```

Behavior:

- Show approved/available profiles first.
- Hide unavailable catalogue behind "Explore all connectors".
- Test result should report route, latency, request id, governance, and safe next step.
- Power BI semantic-model profile should clearly say "deterministic DAX, no LLM call" when active.

Reusable components:

- `ConnectorCard`
- `ConnectorCatalogue`
- `ProfileProbePanel`
- `RouteBadge`
- `CapabilityBadge`

State:

- Profile list source should be explicit:
  - Live proxy profiles
  - Allowlist policy
  - No profiles available
  - Offline/test fixture

### 5. Knowledge Page

Purpose: make grounding understandable and inspectable.

Recommended layout:

```text
Knowledge pack: CPG/FMCG
Source freshness: Current session

Left: pack list / verticals / recent
Main: grounding preview
  KPIs
  glossary
  sample questions
  reference sources
  runtime prompt contribution
Right: impact
  "This helps Ask Pulse understand..."
  active BI match confidence
  missing metadata
```

Behavior:

- Replace document-browser feeling with "grounding preview".
- Show what the pack changes in answers.
- Show if the pack was author-selected, inferred, or default.
- Link pack selection to Setup task completion.

Reusable components:

- `KnowledgePackList`
- `GroundingPreview`
- `KpiGlossaryTable`
- `SampleQuestionGrid`
- `GroundingImpactPanel`

### 6. Assets / Launchpad

Purpose: choose source assets for an experience, not browse inventory.

Behavior:

- Use action labels: "Use in this experience", "Preview", "Open in source", "Request access".
- Group assets by source: Power BI, Databricks dashboards, Genie spaces, metric views, apps.
- Show readiness: accessible, needs permission, missing token, unsupported embed, preview only.
- Selecting an asset should prefill Authoring BI or AI setup.

Reusable components:

- `AssetSearch`
- `AssetResultTable`
- `AssetReadinessBadge`
- `AssetActionMenu`

### 7. Observability / Support

Purpose: debug safely without exposing secrets.

Behavior:

- Support users need health, diagnostics, logs, request ids, redacted bundles.
- Do not place dangerous controls in ordinary setup path.
- Every export must be redacted by default.
- Expose environment status without requiring terminal access.

Reusable components:

- `HealthSummary`
- `RequestTraceTable`
- `SupportBundlePanel`
- `RedactionPreview`
- `DiagnosticProbeGrid`

### 8. Modal And Drawer Rules

Use modals for:

- Destructive confirmation.
- Short focused input.
- Authentication/permission interruption.
- Command palette.

Use drawers/side panels for:

- Evidence inspection.
- Preview details.
- Support trace details.
- Quick edits that benefit from keeping current context visible.

Do not use modals for long setup flows. Setup is a route/workspace, not a modal.

## Typeahead Menu Blueprint

The typeahead is critical. It should become PulsePlay's universal command and intelligence layer.

### Product Role

The typeahead should answer five intents:

1. Navigate: "open settings", "go to knowledge", "Power BI Q&A".
2. Configure: "connect Power BI", "test Genie", "choose CPG pack".
3. Ask: "summarize this dashboard", "top risks", "what changed".
4. Act: "refresh BI", "copy support bundle", "open evidence".
5. Recover: "why is embed blocked", "fix allowlist", "proxy down".

### Invocation

| Entry | Behavior |
|---|---|
| `Ctrl/Cmd+K` | Opens global command palette. |
| `Ctrl/Cmd+/` | Focuses local page search when in Settings; otherwise opens command palette with help group. |
| `/` in empty Ask composer | Opens Ask-scoped suggestions and slash commands. |
| Click global search | Opens command palette. |
| Failed/blocked state action | Opens palette pre-filtered to recovery actions. |

### Palette Wireframe

```text
+------------------------------------------------------------------+
| Ask, search, or run a command...                         Ctrl K   |
+------------------------------------------------------------------+
| Context: Power BI Sales dashboard / Genie Sales / CPG pack        |
+------------------------------------------------------------------+
| Suggested now                                                    |
| > Test selected AI connector                    Settings / AI     |
| > Ask: Why did sales change this week?           Ask Pulse        |
| > Review blocked embed allowlist                 Governance       |
|                                                                  |
| Navigate                                                         |
|   Authoring setup                                                |
|   Knowledge packs                                                |
|                                                                  |
| Assets                                                           |
|   Sales Dashboard                         Power BI / accessible   |
|                                                                  |
| Commands                                                         |
|   Export support bundle                                          |
+------------------------------------------------------------------+
| Enter run/open | Tab complete | Right preview | Esc close         |
+------------------------------------------------------------------+
```

### Result Groups

Default order should adapt to context:

1. Suggested now
2. Ask Pulse
3. Navigate
4. Configure
5. Assets
6. Recent
7. Diagnostics
8. Docs/help

If the user is in Settings, Configure ranks higher. If the user is in Viewer Experience, Ask Pulse and current-source actions rank higher. If an error is present, Recovery ranks first.

### Command Schema

Create a registry-driven model:

```ts
export type CommandKind =
  | "navigate"
  | "ask"
  | "configure"
  | "asset"
  | "diagnostic"
  | "docs"
  | "action"
  | "recovery";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  description?: string;
  group: string;
  icon?: string;
  aliases: string[];
  keywords: string[];
  shortcut?: string;
  source: "static" | "settings" | "profiles" | "packs" | "assets" | "diagnostics" | "ai-suggested";
  freshness?: string;
  requiredRole?: "viewer" | "author" | "admin" | "support" | "developer";
  isEnabled: (ctx: CommandContext) => boolean;
  disabledReason?: (ctx: CommandContext) => string | undefined;
  preview?: (ctx: CommandContext) => CommandPreview;
  run: (ctx: CommandContext) => Promise<CommandResult> | CommandResult;
}

export interface CommandContext {
  route: string;
  activeSurface: string;
  biVendor: string;
  runtimeBiVendor: string;
  activeAiProfile: string;
  packSelection?: { pack?: string; subVertical?: string };
  readiness: AuthoringStateSnapshot;
  recentErrors: Array<{ code: string; message: string; owner?: string }>;
  userScope: "viewer" | "author" | "admin" | "support" | "developer";
}
```

### Ranking Logic

Use deterministic local ranking first:

| Signal | Weight guidance |
|---|---|
| Exact command label match | Highest |
| Prefix match | Very high |
| Alias match | Very high |
| Acronym match | High |
| Fuzzy text match | Medium |
| Current route relevance | High boost |
| Current error/blocker relevance | High boost |
| Recent/frequent command | Medium boost |
| Required role match | Medium boost |
| Disabled/unavailable | Demote but keep visible if helpful |
| AI-suggested | Boost only if source and reason are shown |

Do not let AI suggestions replace deterministic results. AI can suggest "next best actions" after local results are ready.

### AI-Assisted Suggestions

AI suggestions should be:

- Optional and late-loading.
- Clearly labeled "Suggested from current context".
- Explainable in one line: "because AI connector has not been tested".
- Never required for navigation.
- Never allowed to execute admin/security actions without explicit confirmation.
- Cached per route/context snapshot for a short TTL.

Implementation:

- Start with local static + settings + profiles + packs + recent index.
- Later add `/api/assistant/command-suggestions` if needed.
- Pass only redacted context.
- Cancel stale AI suggestion requests when the query changes.

### Keyboard Behavior

Minimum:

- `ArrowDown` / `ArrowUp`: move active result.
- `Enter`: run/open active result.
- `Ctrl/Cmd+Enter`: run in background when safe or open in split/new panel where supported.
- `Tab`: complete highlighted query/action when applicable.
- `RightArrow`: preview active result when preview exists.
- `LeftArrow`: close preview.
- `Esc`: close palette and restore focus.
- `Backspace` on empty query: return from scoped mode to global mode.
- `?`: show keyboard help when query is empty.

Accessibility:

- Treat palette as a modal dialog containing a combobox and listbox.
- Use `aria-activedescendant` for result focus.
- Keep DOM focus in the input while moving the active descendant.
- Announce result count changes politely.
- Restore focus to the element that opened the palette.

### Performance Requirements

| Requirement | Target |
|---|---|
| Palette opens | under 80ms after shortcut |
| Local results update | under 100ms p95 for normal index size |
| Remote/asset result update | non-blocking, stale-safe |
| Keystroke debounce | 60-120ms local, 250ms remote after 2-3 chars |
| Large asset lists | virtualize results |
| Index build | lazy on first open, then incremental updates |

Implementation:

- `commandRegistry.ts` for static commands.
- `useCommandIndex.ts` for index construction.
- `useCommandPalette.ts` for open/query/active/result/execution state.
- `CommandPalette.tsx` for UI.
- Use a Web Worker later if asset/profile search becomes heavy.
- Cache normalized tokens and aliases.
- Use abort controllers for remote asset/profile/docs search.

### Error And Fallback UX

| Scenario | UX |
|---|---|
| No results | Show query-specific empty state and shortcuts: "Ask Pulse", "Search docs", "Clear". |
| Command disabled | Keep visible with disabled reason and owner. |
| Command fails | Inline error row with retry, copy support id, and route to diagnostics. |
| Remote search fails | Keep local results; show small "Assets unavailable" status. |
| AI suggestions fail | Silently omit or show non-blocking "Suggestions unavailable" only when user asked for them. |

## Codex Implementation Guidance

### Component Architecture

Recommended new folders:

```text
playground/src/appShell/
  AppShell.tsx
  PrimaryNav.tsx
  ContextBar.tsx
  RouteFrame.tsx

playground/src/commands/
  commandTypes.ts
  commandRegistry.ts
  commandIndex.ts
  useCommandPalette.ts
  CommandPalette.tsx
  CommandResultItem.tsx
  commandRanking.ts
  __tests__/

playground/src/authoring/
  AuthoringShell.tsx
  authoringStateSnapshot.ts
  SetupTaskList.tsx
  CurrentStateHeader.tsx
  InlineProbeResult.tsx
  ViewerPreviewSummary.tsx

playground/src/trust/
  TrustFooter.tsx
  SourceFreshnessChip.tsx
  GovernanceBadge.tsx
  EvidenceDrawer.tsx

playground/src/design-system/
  tokens.css
  primitives.css
  Button.tsx
  IconButton.tsx
  SegmentedControl.tsx
  StatusBadge.tsx
  EmptyState.tsx
```

Naming rules:

- Use product names for product modules: `Authoring`, `Experience`, `Knowledge`, `Observability`.
- Use generic names for primitives: `Button`, `StatusBadge`, `InlineProbeResult`.
- Use truth-bearing names for state: `AuthoringStateSnapshot`, `CommandContext`, `AnswerContextSummary`.
- Avoid naming UI by implementation detail like `IframeCard` unless the user-facing concept is truly iframe-specific.

### Implementation Phases

#### Phase 0 - Guardrail Audit

Goal: stabilize before moving UI.

Tasks:

- Record current route map and primary surfaces.
- Confirm no Settings preview bypasses `BIPanel`.
- Confirm current Setup five-gate patch is test-clean.
- Add a design debt tracker entry for every shell route.

Validation:

- `npm run lint`
- focused Settings tests
- `git diff --check`

#### Phase 1 - App Shell And Context Bar

Goal: make all major routes feel like one product.

Tasks:

- Add `AppShell`, `PrimaryNav`, and `ContextBar`.
- Wrap Experience, Settings/Authoring, Knowledge, Launchpad, Workbench, and Power BI Q&A.
- Rename visible primary nav concepts:
  - Dashboard/AI surfaces remain in Experience.
  - Settings becomes Authoring for setup-oriented entry, with System/Admin leaves inside.
  - Launchpad becomes Assets if/when the user-facing label changes.
  - Workbench/Q&A become Labs unless explicitly productionized.

State:

- ContextBar reads from `useSettings`, `useEmbedConfig`, `getSetupReadiness`, and active route.
- Do not duplicate readiness logic; call the future `AuthoringStateSnapshot`.

Validation:

- Shell route smoke for `/`, `/settings/setup`, `/knowledge`, `/launchpad`, `/workbench`, `/powerbi/qna`.
- Responsive no-horizontal-overflow check at 390px and 1440px.

#### Phase 2 - Command Palette MVP

Goal: make typeahead the universal wayfinding layer.

Tasks:

- Implement `commandTypes`, `commandRegistry`, `commandRanking`.
- Register static navigation commands.
- Register setup/config commands from Settings routes.
- Register Ask commands that prefill or submit Ask Pulse.
- Add global `Ctrl/Cmd+K` listener with focus guard for text inputs.
- Add result groups and keyboard navigation.

State:

- `useCommandPalette` owns query, active index, scope, open state, execution state.
- The registry receives `CommandContext`, not global imports wherever possible.

Validation:

- Unit tests for ranking.
- Keyboard tests for open, close, arrow, enter, disabled result.
- Accessibility smoke for role/dialog/combobox/listbox attributes.

#### Phase 3 - Authoring State Snapshot

Goal: one source of truth for setup readiness and blockers.

Tasks:

- Add `authoringStateSnapshot.ts`.
- Move readiness composition out of individual components.
- Include source/freshness/owner/next-action metadata.
- Use snapshot in Setup Home, ContextBar, Settings rail chips, and command palette.

Validation:

- Pure unit tests for combinations:
  - native + no AI
  - Power BI URL + AI ready
  - allowlist blocked
  - profile list unavailable
  - pack optional

#### Phase 4 - Progressive Setup Detail Pages

Goal: turn Settings from inventory into author workflow.

Tasks:

- Keep current Split Workspace direction but align it to `AuthoringStateSnapshot`.
- Extract gate UI into reusable components:
  - `SetupGate`
  - `ModeCard`
  - `CurrentStateHeader`
  - `InlineProbeResult`
  - `PolicyCallout`
  - `HandoffSummary`
- Convert BI and AI details to parent-first mode/connector pages.
- Add mobile parent nav replacement.

Validation:

- Existing `vendorMatrix` tests.
- Snapshot tests for gated fields.
- Playwright/Browser screenshot pass after code changes.

#### Phase 5 - Trust And Evidence Standardization

Goal: every answer and preview speaks the same trust language.

Tasks:

- Add `TrustFooter`.
- Add `SourceFreshnessChip`.
- Add `EvidenceDrawer`.
- Wire `AnswerContextSummary` into AISidebar and Pulse answer renderers incrementally.
- Promote request id and governance authority where available.

Validation:

- Tests for footer visibility on completed, failed, fixture, and blocked answers.
- Native canvas still fails closed when governance missing.

#### Phase 6 - Theme, Density, And Visual Polish

Goal: premium enterprise look after IA is correct.

Tasks:

- Introduce `design-system/tokens.css`.
- Replace route-level hardcoded colors gradually.
- Add Appearance leaf controls for color mode and theme preset.
- Audit text overflow and component sizing.
- Add compact density foundations.

Validation:

- Light/dark screenshots.
- 320px/390px/768px/1440px layout checks.
- Text clipping check for nav labels, buttons, result rows.

#### Phase 7 - Observability And Telemetry

Goal: learn where users get blocked without collecting sensitive content.

Tasks:

- Track command palette query categories, not raw sensitive queries by default.
- Track setup task completion and blocker categories.
- Track failed probes with request ids and owner categories.
- Track answer feedback separately from user prompt content.

Privacy:

- Redact BI URLs, tokens, prompts, and raw logs by default.
- Support opt-in debug bundles only.

## Enterprise Benchmarking Synthesis

| Benchmark | Pattern worth adopting | PulsePlay application |
|---|---|---|
| Microsoft Fluent 2 | Clear layout hierarchy, responsive reflow, accessible nav, plain language. | Global shell, context bar, 320px/400% zoom readiness, concise nav labels. |
| Microsoft HAX | AI behavior planning across first use, normal use, failure, and long-term use. | Ask Pulse onboarding, AI uncertainty, recovery, trust footer, "what can I do next". |
| Notion | Command/search as navigation, recents, AI/search hybrid, slash commands in context. | `Ctrl/Cmd+K` global palette and `/` Ask-scoped suggestions. |
| Linear | Keyboard-first actions, command menu contextuality, consistent action paths. | Every setup/viewer action reachable by button, shortcut, right context, or palette. |
| Atlassian | Tokens, navigation system, empty states, enterprise consistency. | Semantic `--pp-*` tokens, clear empty/blocked states, no one-off color decisions. |
| Databricks | Business-user Genie entry point and common questions over technical concepts. | Viewer sees questions and business source context, not connector internals first. |
| OpenAI | Chat plus contextual app UI, clear privacy/safety requirements, project-like context grouping. | Ask surface with side-by-side evidence/BI context and explicit context boundaries. |
| Slack | Slash commands and shortcuts that run actions from where the user already is. | `/` in Ask composer for actions, workflows, and suggested prompts. |
| Vercel | Universal dashboard search and keyboard command access. | One fast search surface for pages, assets, settings, diagnostics, and actions. |
| GitHub Primer | Action lists, nav lists, saving patterns, accessible result rows. | Command result rows, settings nav, explicit save vs live-update semantics. |
| Stripe | ContextView/SettingsView split, onboarding patterns, side-by-side context. | Viewer context next to BI; Author settings separated from day-to-day experience. |
| Figma | IA, user flows, design tokens, Dev Mode annotations and component handoff. | Produce FigJam flow first, then annotated frames, then component mappings. |

## Acceptance Criteria

### Product

- A new Author can understand the setup path in one screen.
- A Viewer can identify BI source, AI connector, pack, and freshness without opening Settings.
- No ordinary Viewer needs to understand proxy profiles, allowlist internals, or adapter stubs.
- Workbench/Q&A/lab surfaces are clearly marked as tools or previews unless productionized.

### UX

- Settings/Authoring never opens as a wall of unrelated cards.
- Every setup task has status, owner, next action, and source/freshness where applicable.
- Mobile keeps parent navigation; it does not hide the map.
- Empty/error/blocked states always include one recommended next step.
- Typeahead finds "token", "DAX", "Power BI", "Genie", "allowlist", "support bundle", "governance", and route names through aliases.

### Engineering

- `AuthoringStateSnapshot` is the single readiness facade.
- `CommandRegistry` is registry-driven and testable.
- `TrustFooter` is reused across answer surfaces.
- Direct BI iframe previews are not introduced outside `BIPanel`/adapter paths.
- All new UI primitives have tests for behavior and accessibility-relevant attributes.
- `git diff --check`, lint, and targeted tests pass after implementation.

### Performance

- Command palette opens under 80ms locally.
- Local typeahead results update under 100ms p95.
- Remote results never block local navigation results.
- Settings and Experience shells do not shift layout when async status loads.

## Priority Backlog

1. `UX-ARCH-1`: Add `AuthoringStateSnapshot` pure module and tests.
2. `UX-ARCH-2`: Add `CommandPalette` MVP with static route/settings/ask commands.
3. `UX-ARCH-3`: Add `ContextBar` with BI/AI/Pack/Freshness/Governance chips.
4. `UX-ARCH-4`: Extract Setup gate primitives from `SetupGroup.tsx`.
5. `UX-ARCH-5`: Rework Settings/Authoring mobile parent navigation.
6. `UX-ARCH-6`: Add `TrustFooter` and wire first into AISidebar completed answers.
7. `UX-ARCH-7`: Rename visible sustainability gauge copy to token/session efficiency near Ask.
8. `UX-ARCH-8`: Reframe Launchpad as Assets with "Use in this experience" action.
9. `UX-ARCH-9`: Create Figma/FigJam IA flow once connector plan/team selection is available.
10. `UX-ARCH-10`: Add semantic design tokens and start theme/density migration.

## Implementation Cautions

- Do not collapse BI vendor and AI connector into one setup choice. The two-axis abstraction is the product's backbone.
- Do not make Settings carry a live token/session gauge. Settings can configure the behavior later; Ask should host the user-facing coach.
- Do not introduce fake "verified" states. If a status is inferred, label it as inferred.
- Do not let unavailable live profiles/packs fall back to fake catalogues.
- Do not expose Admin/Support/Danger controls as normal setup tasks.
- Do not claim Tableau/Qlik/Looker are production SDK integrations while they are iframe fallbacks.
- Do not claim Power BI Q&A is durable beyond its Microsoft retirement date. Treat it as a tactical bridge only.
- Do not rely on AI to power command navigation. Local deterministic commands must work first.

## Sources Used

- Microsoft Fluent 2 Layout: https://fluent2.microsoft.design/layout
- Microsoft Fluent 2 Nav: https://fluent2.microsoft.design/components/web/react/core/nav/usage
- Microsoft Fluent 2 Accessibility: https://fluent2.microsoft.design/accessibility
- Microsoft HAX Toolkit: https://www.microsoft.com/en-us/haxtoolkit/
- WAI-ARIA Combobox/APG: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Atlassian Design Tokens: https://atlassian.design/foundations/tokens/design-tokens/
- Atlassian Empty State: https://atlassian.design/components/empty-state
- Linear conceptual model and command menu: https://linear.app/docs/conceptual-model
- Linear peek/quick look: https://linear.app/docs/peek
- Notion search: https://www.notion.com/help/search
- Notion keyboard and slash commands: https://www.notion.com/help/keyboard-shortcuts
- Vercel dashboard command menu: https://vercel.com/docs/concepts/dashboard-features
- Vercel universal search: https://vercel.com/changelog/dashboard-universal-search
- GitHub Primer ActionList: https://primer.style/product/components/action-list/
- Stripe Apps design: https://docs.stripe.com/stripe-apps/design
- Stripe Apps patterns: https://docs.stripe.com/stripe-apps/patterns
- Slack shortcuts/slash commands: https://slack.com/help/articles/201259356-Slash-commands-in-Slack
- Slack modals: https://docs.slack.dev/surfaces/modals
- Databricks Genie interface: https://docs.databricks.com/gcp/en/workspace/genie
- Databricks Genie spaces: https://docs.databricks.com/en/genie/talk-to-genie.html
- Figma information architecture: https://www.figma.com/resource-library/what-is-information-architecture/
- Figma user flows: https://www.figma.com/resource-library/user-flow/
- Figma design tokens: https://www.figma.com/resource-library/design-tokens/
- OpenAI Apps SDK overview: https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk
- OpenAI Projects: https://openai.com/academy/projects/
- Algolia Autocomplete: https://www.algolia.com/doc/ui-libraries/autocomplete/introduction/what-is-autocomplete
