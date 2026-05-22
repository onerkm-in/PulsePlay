# PulsePlay Multi-Agent Deep Study Across All Areas

Date: 2026-05-23

Status: Multi-agent read-only research synthesis. No runtime code changed.

Purpose: consolidate six focused agent studies into one implementation-ready dossier that complements the enterprise UX architecture blueprint. This document is the practical decision layer: what the agents found, where they agreed, what must be fixed first, and how Codex should sequence the implementation.

Related blueprint: [ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md)

## Research Method

The session reused six available subagents because the thread limit was already reached. Each agent was given a read-only scope and asked not to edit files.

| Agent | Focus | Primary output |
|---|---|---|
| A | Product architecture and end-to-end journeys | Global shell, route fragmentation, target IA, Viewer/Author/Admin journeys |
| B | Settings and Authoring Console | Progressive setup, save truth, governed setter handling, mobile IA |
| C | Typeahead / command palette / search | Current shortcuts/search, command model, ranking, keyboard behavior |
| D | Visual design system and screen layouts | Token debt, route wireframes, visual primitives, screenshot plan |
| E | AI trust, governance, evidence, safety | Trust grammar, governance UX, evidence drawer, RLS/OBO gaps |
| F | Engineering implementation readiness | Module boundaries, phased rollout, tests, tripwires, risk mitigation |

The main session also inspected the current code and existing docs while agents ran. This synthesis uses the agents' independent findings plus existing source-backed research in [EXTERNAL_REFERENCES.md](EXTERNAL_REFERENCES.md). No new external web research was added in this pass.

## Executive Synthesis

All six agents converged on the same product diagnosis:

PulsePlay does not need more scattered capability before it needs more structure. The current codebase is feature-rich, but the enterprise user experience needs a durable shell, a single authoring-state truth, a deterministic command surface, and consistent trust grammar.

The first implementation slice should be:

```text
AuthoringStateSnapshot
  -> CommandPalette foundation
  -> AppShell + ContextBar
  -> TrustFooter / EvidenceDrawerV2
  -> Progressive Setup hardening
```

Settings/Authoring has the highest immediate risk because it is the control panel. If it misrepresents progress, save state, governance, or preview truth, the entire app feels unreliable.

## Cross-Agent Consensus

### P0 Consensus Items

| Consensus | Why it matters | First files to touch |
|---|---|---|
| Add `AuthoringStateSnapshot` | Readiness is repeated and too shallow today. One source of truth prevents drift. | `playground/src/authoring/authoringStateSnapshot.ts`, `settings/setupReadiness.ts` |
| Harden Setup governed setter handling | Setup can advance/log success even when a governed setter refuses a value. | `settings/groups/SetupGroup.tsx`, `settingsStore.tsx` |
| Make save semantics truthful | Current save bar implies staging while many settings already apply live. | `useSettingsDraft.ts`, `SettingsSaveBar.tsx`, Settings copy |
| Add command palette foundation | Search is label-only and not task/action aware. | new `playground/src/commands/*`, `App.tsx` shortcut wiring |
| Wrap routes in one shell | Settings, Knowledge, Launchpad, Workbench, Q&A feel like separate apps. | new `appShell/*`, `App.tsx` |
| Add consistent trust footer | Source/freshness/request-id/governance are uneven across answer surfaces. | new `trust/*`, `AISidebar.tsx`, `NativeCanvas.tsx` |
| Restore mobile parent navigation | Current CSS hides Settings rail below 640px without replacement. | `settings.css`, `SettingsShell.tsx` |

### P1 Consensus Items

| Consensus | Why it matters |
|---|---|
| Reframe Launchpad as Assets | It should help Authors choose assets for an experience, not browse inventory. |
| Reframe Knowledge as grounding preview | Authors need to see what a pack changes in answers. |
| Move Workbench and Power BI Q&A into Labs | Useful, but not production Viewer default surfaces. |
| Add dark/light token bridge | `--pp-*` exists, but native host dark-mode/token discipline trails inherited Pulse styles. |
| Replace thin evidence drawer | Current drawer is useful but too narrow for enterprise trust. |
| Treat RLS/OBO gaps explicitly | Power BI DAX and Q&A are not enterprise-complete for RLS until user identity is wired. |

## Area Studies

## 1. Product Architecture And Journeys

### Findings

The two-axis architecture is strong and should not be diluted:

- BI vendor axis: [BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts), [BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx)
- AI connector axis: proxy profiles and backend routes in [proxy/server.js](../../proxy/server.js)
- Knowledge plane: `pulsepacks`, [PACKS.md](../PACKS.md), [KNOWLEDGE_BASE_ARCHITECTURE.md](../KNOWLEDGE_BASE_ARCHITECTURE.md)

The route architecture is functional but visually fragmented. [App.tsx](../../playground/src/App.tsx) swaps between root, Settings, Knowledge, Launchpad, Workbench, and Power BI Q&A as separate worlds. This makes PulsePlay feel like a playground with tools rather than a single enterprise application.

### Target IA

Use one global enterprise shell:

| Area | Primary user | Purpose |
|---|---|---|
| Experience | Viewer, Author preview | AI Insights, Ask Pulse, Dashboard/native canvas, evidence |
| Authoring | Author | Setup, BI, AI, Knowledge, Governance, Smoke, Preview, Handoff |
| Knowledge | Author, data owner | Packs, glossary, KPIs, grounding preview, references |
| Assets | Author, Admin | Power BI reports, Databricks dashboards, Genie spaces, metric views, apps |
| Observability | Support, Admin | Health, diagnostics, request IDs, support bundle, audit hints |
| System | Admin, Deployer | Auth, allowlist, hosting, policies, secrets posture |
| Labs | Developer, evaluator | Workbench, Power BI Q&A bridge, experimental flows |

### Architecture Backlog

| Priority | Task | Acceptance |
|---|---|---|
| P0 | Add `AppShell`, `PrimaryNav`, `ContextBar`, `RouteFrame` | All current routes still render; global context appears consistently |
| P0 | Keep `SurfaceSwitcher` local to Experience | It no longer competes with primary app navigation |
| P1 | Rename/position Launchpad as Assets | Asset rows can "Use in this experience" |
| P1 | Put Workbench and Power BI Q&A under Labs | Tactical/preview status is explicit |

## 2. Settings And Authoring Console

### Findings

Settings is the most important control surface and the riskiest current UX area.

Current state:

- `SettingsShell` has six parent groups, search, status strip, rail, active group, save bar.
- `SetupGroup` now has five progressive gates: BI, AI, Knowledge, Governance, Diagnostics/Handoff.
- `settingsStore` has governed setters that can refuse updates.
- `useSettingsDraft` tracks dirty state, but many changes apply live before Save.

Key risks:

1. Setup often does not check setter results. If `setBiVendor`, `setActiveAiProfile`, or `setPackSelection` returns `{ ok:false }`, the UI can still log or imply success.
2. Governance review starts checked by default. That is too reassuring for enterprise setup.
3. Native BI mode is considered ready by readiness logic, but the inline Apply path can still require a URL.
4. Preview panes can blur real checks and simulation.
5. Mobile Settings loses the parent map.
6. Advanced/support controls look visually equal to ordinary setup.

### Target Authoring Model

Settings should become an Authoring Console:

```text
Authoring Home
  Preflight
  BI Surface
  AI Connector
  Knowledge Grounding
  Governance Review
  Smoke Test
  Preview
  Handoff

Detailed configuration
  BI
  AI
  Knowledge
  Preferences
  System
  Advanced and Support
```

### Required State Contracts

```ts
type FieldScope =
  | "draft"
  | "live-local"
  | "session"
  | "admin-policy"
  | "support-diagnostic"
  | "deploy-handoff";

interface SettingsFieldDescriptor {
  id: string;
  group: string;
  leaf: string;
  scope: FieldScope;
  owner: "author" | "viewer" | "admin" | "support" | "system";
  editMode: "immediate" | "draft-then-apply" | "read-only" | "type-to-confirm";
  risk: "low" | "medium" | "high";
  source?: string;
  freshness?: string;
}

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
```

### Settings Backlog

| Priority | Task | Acceptance |
|---|---|---|
| P0 | Check all governed setter results in Setup | Failed setter keeps gate incomplete and shows reason |
| P0 | Fix native mode Apply behavior | Native setup can complete without requiring URL |
| P0 | Make Governance unchecked until real review/reachability facts exist | No default "verified" governance posture |
| P0 | Make save semantics honest | Fields are labelled live/draft/session/policy/support |
| P0 | Add mobile parent navigation | Rail-hidden mobile state still has parent map |
| P1 | Extract `SetupGate`, `ModeCard`, `InlineProbeResult`, `PolicyCallout` | Setup primitives reusable by BI/AI pages |
| P1 | Add search aliases | `token`, `DAX`, `Power BI`, `governance`, `profile`, `support bundle` all resolve |

## 3. Typeahead / Command Palette

### Findings

Current system:

- `Ctrl/Cmd+,` opens Settings.
- `Ctrl/Cmd+/` focuses Settings search.
- Settings search filters groups by group label, group description, and leaf labels only.
- Ask Pulse supports `Ctrl/Cmd+Enter` submit, but no slash command/typeahead.
- `Ctrl/Cmd+K` is reserved in specs but not implemented.

The agent confirmed that Settings search should remain local filtering, while the command palette should become the task/action surface.

### Target Command System

```ts
type CommandKind =
  | "navigate"
  | "ask"
  | "configure"
  | "asset"
  | "diagnostic"
  | "recovery"
  | "action"
  | "docs";

interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  description?: string;
  group: "Suggested now" | "Ask Pulse" | "Navigate" | "Configure" | "Assets" | "Diagnostics" | "Recovery" | "Docs/help";
  aliases: string[];
  keywords: string[];
  shortcut?: string;
  source: "static" | "settings" | "surfaces" | "profiles" | "packs" | "assets" | "diagnostics" | "ai-suggested";
  requiredRole?: "viewer" | "author" | "admin" | "support" | "developer";
  isEnabled(ctx: CommandContext): boolean;
  disabledReason?(ctx: CommandContext): string | undefined;
  preview?(ctx: CommandContext): CommandPreview;
  run(ctx: CommandContext): CommandResult | Promise<CommandResult>;
}
```

Ranking should be deterministic first:

1. Exact label
2. Prefix
3. Alias
4. Acronym
5. Fuzzy match
6. Current route boost
7. Current error/blocker boost
8. Recent/frequent boost
9. Role match
10. Disabled demotion

AI suggestions may arrive later but must never replace local commands.

### Command Backlog

| Priority | Task | Acceptance |
|---|---|---|
| P0 | Add pure command types/ranking/index | Unit tests prove ranking and disabled demotion |
| P0 | Add static route and Settings commands | Every major route/leaf has a stable command |
| P0 | Add global `Ctrl/Cmd+K` UI | Keyboard opens/closes, restores focus, runs result |
| P0 | Add Ask-scoped `/` commands later in MVP+ | Empty composer can show suggested prompts/actions |
| P1 | Add recovery commands | Proxy down, allowlist blocked, embed blocked route users to fixes |
| P1 | Add asset/profile/pack commands | Remote results are non-blocking and stale-safe |

## 4. Visual Design System And Layouts

### Findings

Strengths:

- `--pp-*` token seeds already exist in [styles.css](../../playground/src/styles.css).
- DOM state attributes in `App.tsx` are good for QA and visual state.
- Settings has strong structural pieces.
- Native canvas has governed render states and fusion commentary.
- The inherited Pulse `gn-*` layer has mature briefing and enterprise card patterns.

Debt:

- Native host `pp-*` is mostly light-mode-only.
- Many important components still use inline styles.
- Radius/elevation are too soft in places for dense enterprise UI.
- Trust UI is visually fragmented across Ask, Native Canvas, Pulse, and Workbench.

### Target Visual System

| Token family | Guidance |
|---|---|
| Color | semantic `--pp-bg`, `--pp-surface-*`, `--pp-text-*`, `--pp-border-*`, `--pp-success/warn/danger/info` |
| Shape | 4px utility controls, 6px inputs/tables, 8px cards/panels |
| Type | 11, 12, 13, 14, 16, 20, 24px; no viewport-scaled type |
| Density | compact enterprise default with future comfortable mode |
| Trust | `--pp-trust-live`, `--pp-trust-preview`, `--pp-trust-stale`, `--pp-trust-blocked` |
| Mode | `[data-color-mode]` plus `[data-theme-preset]`; bridge `--gn-*` to `--pp-*` gradually |

### Screen Layout Direction

Experience:

```text
TopBar: PulsePlay | Command | BI chip | AI chip | Pack chip | Freshness
ContextBar: dashboard/page/filter scope | governance | request state
Surface tabs: AI Insights | Ask Pulse | Dashboard
Body: selected surface + evidence drawer
```

Authoring:

```text
Left: task list / parent nav
Center: active setup task
Right: viewer preview + diagnostics
Mobile: horizontal parent nav + one task + collapsible preview
```

Knowledge:

```text
Pack list | Grounding preview | Impact/context rail
Tabs: KPIs, glossary, sample questions, references, runtime contribution
```

Assets:

```text
Asset search + readiness table
Columns: source, type, owner, readiness, action
Action: Use in this experience
```

### Visual Backlog

| Priority | Task | Acceptance |
|---|---|---|
| P1 | Create shared `TrustFooter`, chips, data table, status badge | Ask/native/workbench can reuse |
| P1 | Add dark/light token map for host shell | Key routes readable in light/dark |
| P1 | Remove inline style clusters from shell/Ask/native paths | Shared classes replace repeated style objects |
| P2 | Bridge `gn-*` to `pp-*` tokens | Pulse port inherits theme without wholesale rewrite |
| P2 | Add screenshot matrix | 1440, 1280, 900, 390 across key routes/states |

## 5. AI Trust, Governance, Evidence, Safety

### Findings

The trust backend is stronger than the trust UX:

- Proxy builds governance attestations.
- Native adapter fails closed when required governance is missing.
- BIPanel fails closed when allowlist is unreachable.
- Workbench has a better artifact/evidence grammar than the main Ask surface.
- AISidebar forwards governance but does not explain it consistently to the user.

Major gaps:

1. Users do not consistently see source, scope, freshness, authority, request id.
2. `EvidenceDrawer` is too thin for enterprise trust.
3. `entryToAIResultEnvelope` can lose or fail to promote `governance.sourceRef`.
4. Native `renderSpec` is intentionally ungated and must remain capability-scoped.
5. Power BI DAX and Q&A are not enterprise-complete for RLS until OBO/server-derived identity is fully wired.
6. BI event context remains a prompt-injection surface if not normalized/guarded.

### Target Trust Grammar

Every AI answer should expose:

| Field | Meaning |
|---|---|
| Source | What system/data asset answered |
| Scope | Report/page/filter/frame/pack/profile used |
| Freshness | When discovery/query/probe was fetched |
| Governance | Enforced/preview/blocked plus authority/policy |
| Identity boundary | Viewer, OBO user, service principal, shared key, local dev |
| Request ID | Copyable support correlation ID |
| Evidence | Query, rows, validation, attestation, diagnostics |

### Trust Contracts

```ts
type TrustState = "trusted" | "preview" | "blocked" | "partial" | "stale" | "unknown";

type AuthBoundarySummary =
  | "idp-user"
  | "obo-user"
  | "service-principal"
  | "shared-key"
  | "local-dev"
  | "anonymous";

interface EvidenceItemV2 {
  id: string;
  kind: "source" | "scope" | "query" | "result" | "validation" | "governance" | "diagnostic";
  label: string;
  summary: string;
  payload?: unknown;
  requestId?: string;
  freshness?: string;
  copyable?: boolean;
}
```

### Trust Backlog

| Priority | Task | Acceptance |
|---|---|---|
| P0 | Add `TrustFooter` to AISidebar completed/failed/blocked entries | Every answer shows source/freshness/request id where available |
| P0 | Promote governance source/request info into native visible source display | Native canvas does not hide source refs inside attestation |
| P1 | Replace `EvidenceDrawer` with sectioned evidence | Source/scope/query/result/validation/governance/diagnostic sections |
| P1 | Add owner-aware blocked copy in BIPanel and native canvas | Blocked states show reason, owner, next step |
| P1 | Wire Power BI DAX OBO for RLS or fail clearly | No service-principal RLS ambiguity |
| P1 | Mirror server-derived RLS into Q&A token route | Browser never supplies arbitrary identities |

## 6. Engineering Implementation Readiness

### Constraints

- Preserve BI/AI separation.
- Do not rewrite [App.tsx](../../playground/src/App.tsx) wholesale. Wrap first, extract later.
- Do not introduce direct iframe previews outside `BIPanel`.
- UI should consume public connector/profile endpoints, not proxy internals.
- Governance is load-bearing; do not create fake verified states.
- Command palette must not become a second router/store.

### Target Folder Architecture

```text
playground/src/appShell/
  AppShell.tsx
  PrimaryNav.tsx
  ContextBar.tsx
  RouteFrame.tsx

playground/src/authoring/
  authoringStateSnapshot.ts
  AuthoringShell.tsx
  SetupTaskList.tsx
  ViewerPreviewSummary.tsx

playground/src/commands/
  commandTypes.ts
  commandRegistry.ts
  commandRanking.ts
  commandIndex.ts
  useCommandPalette.ts
  CommandPalette.tsx

playground/src/trust/
  TrustFooter.tsx
  SourceFreshnessChip.tsx
  GovernanceBadge.tsx
  EvidenceDrawer.tsx

playground/src/design-system/
  tokens.css
  primitives.css
```

### Engineering Phases

| Phase | Goal | Safe rollout rule |
|---|---|---|
| 0 | Guardrail audit | No behavior change; confirm route map and current tests |
| 1 | Pure state + command foundations | Add pure modules and tests first |
| 2 | AppShell wrapper | Wrap existing route shells without changing internals |
| 3 | Command palette MVP | Static deterministic commands only; no remote/AI yet |
| 4 | Authoring Console Home | Snapshot-backed task list; extract Setup primitives |
| 5 | Progressive BI/AI detail pages | Parent-first controls and probe panels |
| 6 | Trust footer/evidence | Wire AISidebar first, then Pulse/native |
| 7 | Theme/density | Token migration after IA stabilizes |

### Test Plan

Pure tests:

- `authoringStateSnapshot.test.ts`
- `commandRanking.test.ts`
- `commandRegistry.test.ts`
- trust summary / evidence normalization tests

React tests:

- `AppShell.test.tsx`
- `ContextBar.test.tsx`
- `CommandPalette.test.tsx`
- `SetupGroup.progressive.test.tsx`
- `TrustFooter.test.tsx`

Regression commands:

- `cd playground && npm run lint`
- `cd playground && npm run test`
- `cd playground && npm run build`
- `cd proxy && npm test` when proxy contracts change
- Browser/screenshot pass after shell/layout work

## Consolidated Priority Queue

### Foundation Slice 1

1. Add `AuthoringStateSnapshot` pure module and tests.
2. Add command model/ranking pure modules and tests.
3. Add `CommandPalette` MVP with static route/settings/ask commands.
4. Add `AppShell` and `ContextBar` wrapper around existing routes.
5. Add `TrustFooter` and wire AISidebar completed/failed entries.

### Settings Safety Slice

1. Check governed setter results in Setup.
2. Fix native BI Apply behavior.
3. Remove default checked governance posture.
4. Label simulation/preview clearly.
5. Add mobile parent navigation.
6. Make save semantics truthful.

### Enterprise Trust Slice

1. Promote source/freshness/request id into every answer surface.
2. Upgrade Evidence Drawer.
3. Add owner-aware blocked states.
4. Wire Power BI OBO/RLS or fail clearly.
5. Add trust tests to prevent silent downgrade.

### Visual System Slice

1. Create host-level semantic tokens and dark-mode contract.
2. Extract shared trust chips, status badge, data table.
3. Normalize shell/Ask/native inline styles.
4. Add screenshot validation matrix.

## Risk Register

| Risk | Severity | Mitigation |
|---|---:|---|
| Setup marks blocked choices as complete | High | Check setter results; fail closed with inline reason |
| Save bar implies staging that is not real | High | Field scope metadata and honest live/draft/session labels |
| Command palette becomes untestable side router | High | Registry stays declarative; commands call existing helpers |
| AppShell refactor breaks route/surface behavior | High | Wrap existing shells first; keep DOM telemetry attrs |
| Trust metadata remains buried | High | `TrustFooter` and `EvidenceDrawerV2` shared contract |
| Direct preview bypass weakens allowlist | High | All BI rendering stays through `BIPanel`/adapters |
| Dark-mode repaint creates visual regressions | Medium | Tokenize gradually after IA foundations |
| Remote/AI typeahead slows local commands | Medium | Deterministic local index first; remote non-blocking |
| RLS is implied but not enforced in Power BI DAX/Q&A | High | OBO/server-derived identity or explicit unsupported state |

## Decisions For Brainstorming

The agents identified these as product decisions rather than coding details:

1. Should `/settings` become `/authoring`, or should Authoring be the visible label while the URL remains stable?
2. What is the minimum handoff-ready smoke: BI mount, AI answer, pack injection, governance attestation, support bundle?
3. Which context chips are mandatory for Viewers: BI, AI, pack, freshness, governance, request id?
4. Should Launchpad be renamed to Assets immediately?
5. Should Power BI Q&A be hidden under Labs now because of retirement, or remain discoverable as a tactical bridge?
6. When do we introduce real role modeling: Viewer/Author first, or Viewer/Author/Admin/Support immediately?

## Final Recommendation

Treat the enterprise blueprint as the north star, but begin implementation with the concrete agent consensus:

1. `AuthoringStateSnapshot`
2. `CommandPalette` deterministic MVP
3. `AppShell` + `ContextBar`
4. `TrustFooter`
5. Setup safety fixes

This is the smallest foundation that improves every major area without over-committing to a broad visual rewrite. It also gives Codex stable contracts to implement the later design system and screen polish safely.
