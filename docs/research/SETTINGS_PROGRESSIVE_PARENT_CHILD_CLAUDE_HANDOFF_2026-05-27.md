# Settings Progressive Parent-Child Handoff for Claude - 2026-05-27

## Executive Read

Rajesh's read is correct: Settings is now the major UX debt. The page does not need a cosmetic repaint, and it should not lose capability. It needs a stronger parent-child authoring flow, tighter density, and much less inline explanatory prose.

## Mantra

**Stay uniform. Stay simple. Stay lean. Stay clean.**

Every Claude implementation decision should pass this test:

- Uniform: Settings should use the same parent-child grammar across Setup, BI, AI, Business Context, Governance, Display, and Advanced.
- Simple: one parent question per page/section; child controls appear only when relevant.
- Lean: remove visible prose and duplicated controls; keep only labels, state, validation, and next action in the main flow.
- Clean: use shared primitives, consistent spacing, accessible `HelpTip` info buttons, and no new one-off visual systems.

The current Settings implementation has good bones:

- `SettingsShell` already owns a dedicated full-page Settings surface.
- `HelpTip`, `FieldRow`, `ProgressiveSection`, and `BookmarkNav` already exist.
- AI Setup and BI Setup already have early progress ribbons and hidden intro headings.
- Legacy setup already has a migration banner.

The problem is that those patterns are not yet the system grammar. Many sections still behave like a control inventory: every helper paragraph is visible, some "i" buttons are raw `title` attributes instead of the shared `HelpTip`, child settings appear before the parent mode is clear, mobile hides the rail without replacing the parent map, and the legacy Setup route still duplicates AI/BI/pack/governance choices.

Claude should focus on making Settings feel like an authoring control panel:

1. Parent decision first.
2. Child fields only after they are relevant.
3. Compact rows over large cards.
4. Help/writeup behind `i` buttons.
5. Visible validation/status only when it changes the next action.
6. No source-of-truth duplication between Setup, BI, AI, Business Context, and Governance.

This is a read-only handoff. No Settings code was changed in this pass.

## Current Code Evidence

| Area | Evidence | Finding |
|---|---|---|
| Visible rail groups | [SettingsShell.tsx:72](../../playground/src/settings/SettingsShell.tsx#L72) | Rail currently shows AI, BI, Advanced, Display. Legacy `setup` and `system` are hidden but still routable. |
| Search copy | [SettingsShell.tsx:367](../../playground/src/settings/SettingsShell.tsx#L367) | Search placeholder still says "6 groups" even visible rail shows 4. This exposes implementation history. |
| Legacy setup still mounted | [SettingsShell.tsx:612](../../playground/src/settings/SettingsShell.tsx#L612) | `/settings/setup` still renders `SetupGroup`, so duplicate setup choices remain alive. |
| Mobile rail hidden | [settings.css:635](../../playground/src/settings/settings.css#L635) | Under 640px, the parent nav disappears without a replacement. |
| SetupGroup size and duplication | [SetupGroup.tsx:25](../../playground/src/settings/groups/SetupGroup.tsx#L25) | `SetupGroup` still owns BI, AI, pack, governance, test, handoff state in one large component. |
| Setup raw info button | [SetupGroup.tsx:522](../../playground/src/settings/groups/SetupGroup.tsx#L522) | Uses `title={setupSubtitle}` instead of shared `HelpTip`. |
| BI raw info button | [BiGroup.tsx:94](../../playground/src/settings/groups/BiGroup.tsx#L94) | Uses a raw circular `i` button with `title`, not shared tooltip behavior. |
| AI raw info button | [AiGroup.tsx:247](../../playground/src/settings/groups/AiGroup.tsx#L247) | Same raw title-based info button. |
| Leaf helper always visible | [BiGroup.tsx:430](../../playground/src/settings/groups/BiGroup.tsx#L430), [BiGroup.tsx:447](../../playground/src/settings/groups/BiGroup.tsx#L447) | Shared `Leaf` requires `helper` and renders it as a paragraph every time. This is the largest real-estate leak. |
| Existing robust HelpTip | [HelpTip.tsx:121](../../playground/src/settings/primitives/HelpTip.tsx#L121) | Portal-rendered, viewport-aware tooltip already exists. Use it. |
| Structured tips already supported | [FieldRow.tsx:13](../../playground/src/settings/primitives/FieldRow.tsx#L13), [FieldRow.tsx:34](../../playground/src/settings/primitives/FieldRow.tsx#L34) | `FieldRow` already accepts structured `{ title, body }` tips. |
| Field hints still visible | [FieldRow.tsx:84](../../playground/src/settings/primitives/FieldRow.tsx#L84) | Keep only short current-state hints visible; move explanatory prose to `tip`. |
| AI dense response editor | [AiGroup.tsx:693](../../playground/src/settings/groups/AiGroup.tsx#L693) | Response behavior section is a dense stack of controls and textareas; should become parent-mode + child details. |
| BI inline note | [BiGroup.tsx:155](../../playground/src/settings/groups/BiGroup.tsx#L155) | "Changes save to..." note is visible prose that belongs behind an info button unless in error/warning state. |

Quick scan counts:

- `helper=` appears 41 times in Settings group files.
- `role="note"` appears 4 times.
- Inline `<p style=...>` prose appears at least 16 times in Settings group files.

## Core UX Problem

Settings currently asks authors to parse the implementation model:

- `AI Setup` mixes connector choice, profile detail, knowledge pack, Vector Search, UC Metric View, response behavior, supervisor behavior, and knowledge toggles.
- `BI Setup` mixes provider, embed, auth, canvas policy, status, and governance.
- Legacy `Quick start` duplicates BI, AI, knowledge, governance, test, and handoff.
- `Display` and `Advanced` are partly user preferences, partly author defaults, partly support/admin tools.

The author needs a product model instead:

| Parent Question | Child Controls That Become Relevant |
|---|---|
| What BI surface will users look at? | Vendor, embed mode, workspace/report/dashboard IDs, iframe policy, native canvas fallback. |
| What AI assistant will answer? | Connector/profile, model/agent details, connection test, supervisor fan-out only if supervisor. |
| What business context should answers use? | Pack, sub-vertical/focus area, generated defaults, glossary/KPI source, source freshness. |
| What governance posture is required? | Allowlist, identity/RLS, sandbox, route protection, production readiness. |
| What should the viewer see? | Visible surfaces, default landing, compactness, preview as viewer. |
| What support/developer controls exist? | Performance levers, diagnostics, local storage, reset, danger zone. |

## Target Information Architecture

Do not rebuild the app. Reframe Settings as `Authoring` using the existing route shell.

### Preferred Parent Nav

Desktop parent nav:

1. Setup Home
2. BI Surface
3. AI Assistant
4. Business Context
5. Governance
6. Viewer Display
7. Advanced & Support

If that is too much for one slice, keep the current four visible rail groups but change the first viewport:

1. AI Setup
2. BI Setup
3. Business Context (new or absorbed under AI only temporarily)
4. Viewer Display
5. Advanced & Support

The important rule is not the exact label count. The important rule is that each parent owns a single mental question and child controls do not appear until the parent makes them meaningful.

### Setup Home

Settings should default to a task list, not to fields.

First viewport should show:

| Task | State | Primary Action |
|---|---|---|
| BI Surface | Missing / Partial / Ready | Choose or test surface |
| AI Assistant | Missing / Partial / Ready | Choose or test assistant |
| Business Context | Suggested / Needs review / Reviewed | Review generated context |
| Governance | Dev permissive / Warning / Production ready | Review policy |
| Preview & Handoff | Untested / Warnings / Ready | Preview as viewer / export handoff |

Each row should show compact status, owner, freshness, and next action. No form fields on the default home.

### BI Surface Parent-Child Flow

Parent choice first:

- Native Pulse Canvas
- Power BI governed embed
- Power BI secure public embed
- Databricks AI/BI dashboard
- Databricks Genie space
- Generic iframe
- Tableau/Qlik/Looker iframe fallback

Child fields appear only after parent choice:

- Power BI governed embed: tenant, workspace, report/dashboard, dataset, token mode, RLS/effective identity posture.
- Power BI secure embed: app.powerbi.com URL, report ID preview, allowed host validation.
- Generic iframe: URL, sandbox policy, allowed origin warning.
- Native Canvas: no embed URL; show what Ask Pulse can render and what is unsupported.

Do not show every vendor field at once. Do not show Power BI service-principal controls while the author is in generic iframe or native canvas mode.

### AI Assistant Parent-Child Flow

Parent choice first:

- Use configured connector
- Browse connector catalog
- Supervisor/fan-out profile
- Power BI semantic-model deterministic DAX
- Foundation Model / Azure OpenAI / Bedrock / ResponsesAgent

Child fields:

- Active profile summary.
- Connection test.
- Connector-specific caveats.
- Supervisor fan-out matrix only for Supervisor.
- Power BI Q&A deprecation only when relevant to that path.

Move connector catalogue long explanations into info buttons or a "details" drawer. The first screen should be "which assistant is active and can it answer?"

### Business Context Parent-Child Flow

This should become the home for pack and domain decisions, not a buried child of AI.

Parent choice:

- Infer from BI surface
- Choose installed pack
- Generic/no pack
- Advanced custom context

Child fields:

- Pack/sub-vertical/focus area.
- Generated defaults review.
- Glossary/KPI/metric behavior.
- Source IDs and freshness.
- "Why suggested" explanation.

Do not duplicate pack/domain/metric choices across Setup, AI response behavior, first-run wizard, and future Adjust controls.

### Governance Parent-Child Flow

Parent posture first:

- Local permissive dev
- Internal governed
- Production locked
- Blocked / cannot validate

Child sections:

- BI allowlist.
- AI profile allowlist.
- Allowed packs.
- AAD tenants / workspace/report restrictions.
- RLS/effective identity.
- Iframe sandbox.
- Route protection and proxy auth.

Critical warnings stay visible. Explanatory policy prose goes behind `i`.

### Viewer Display Parent-Child Flow

Parent choices:

- Visible surfaces: AI Insights / Ask Pulse / Dashboard
- Default landing
- Density: Compact / Comfortable
- Theme / appearance

Keep this separate from AI connector and BI embed setup. Display is what viewers see, not what the system is connected to.

### Advanced & Support

This should be compact and clearly secondary:

- Performance levers
- Diagnostics
- Local storage inspector
- Export support bundle
- Reset section
- Reset all
- Power BI sign-out / danger zone

Use explicit reveal for dangerous actions. Advanced should never look equivalent to required setup.

## Compact Density Rules

Claude should apply these as design rules before touching visual flourishes:

1. Keep Settings header compact. The first viewport should show status plus at least three task rows.
2. Page body should use compact enterprise density: 12-16px vertical section rhythm, not 24-32px stacked card rhythm.
3. Use rows/tables for status summaries; reserve cards for true repeated items or mode choices.
4. Avoid page sections inside floating cards. Use unframed bands or simple bordered rows.
5. One visible line of explanation max per parent section.
6. Move explanatory prose to `HelpTip`.
7. Keep validation, errors, missing prerequisites, and next action visible. Do not hide those in tooltips.
8. Use segmented controls for parent modes, not text-heavy card grids unless the choice truly needs comparison.
9. Use two-column field grids on desktop for simple fields, one column on mobile.
10. Keep text labels short; use current-value secondary text instead of paragraphs.

## Info Button Pattern

The repo already has the right primitive. Use `HelpTip`, not raw `title`.

Current raw examples to replace:

- [SetupGroup.tsx:522](../../playground/src/settings/groups/SetupGroup.tsx#L522)
- [BiGroup.tsx:96](../../playground/src/settings/groups/BiGroup.tsx#L96)
- [AiGroup.tsx:249](../../playground/src/settings/groups/AiGroup.tsx#L249)

Recommended pattern:

```tsx
<HelpTip
  title="BI Setup"
  body={[
    "Choose the BI surface users will view.",
    "Child fields appear after the mode is selected.",
    "Production embeds must pass allowlist and identity checks.",
  ]}
/>
```

For field rows, prefer the existing structured tip support:

```tsx
<FieldRow
  label="Workspace"
  hint={workspaceId ? "Saved locally" : undefined}
  tip={{
    title: "Workspace",
    body: [
      "Power BI workspace or Databricks workspace that owns this surface.",
      "Must be allowed by the proxy policy in production.",
    ],
  }}
>
  <input ... />
</FieldRow>
```

### What Should Stay Visible

Keep visible:

- Field label.
- Required marker.
- Current state.
- Validation error.
- Success/warning status.
- Next action when blocked.

Move behind `i`:

- Concept explanations.
- Examples.
- Where this value is saved.
- Which runtime file consumes it.
- Admin-only implementation details.
- Deprecation background, unless it is currently blocking.

Do not move behind `i`:

- "This will clear all settings."
- "Allowlist is unreachable."
- "Power BI Q&A retires on 31 Dec 2026" when the user is actively configuring Q&A.
- "RLS cannot be verified."
- "Production route is unprotected."

## Component-Level Claude Instructions

### 1. Refactor `Leaf`

Current `Leaf` requires `helper` and always renders a paragraph:

- [BiGroup.tsx:430](../../playground/src/settings/groups/BiGroup.tsx#L430)
- [BiGroup.tsx:447](../../playground/src/settings/groups/BiGroup.tsx#L447)

Target:

```tsx
export function Leaf(props: {
  label: string;
  summary?: string;
  help?: StructuredTip | React.ReactNode;
  group?: string;
  status?: { tone: StatusTone; label: string };
  children: React.ReactNode;
})
```

Rendering:

- Label row: label, optional `HelpTip`, optional status, copy-link.
- Optional `summary` only if it is current state or next action.
- No always-visible paragraph by default.

Migration:

- Convert `helper=` to `help={{ title, body }}`.
- Keep a few `summary=` values where the line is operationally useful.
- Update tests that assume helper text is visible.

### 2. Promote `FieldRow`

Many local controls in `AiGroup` use custom `SettingsTextInput`, `SettingsTextarea`, `SettingsSelect`, and `SettingsCheckbox` wrappers with inline labels and no shared tip behavior.

Target:

- Make those wrappers use `FieldRow`, or replace them in dense areas.
- Add `tip` support to the wrappers.
- Keep labels visible; move guidance to structured tips.

### 3. Replace Raw Info Buttons

Replace `title`-only `i` buttons with `HelpTip`.

Why:

- `title` is inconsistent across browsers.
- `title` is weak for keyboard/touch users.
- `HelpTip` already portal-renders, avoids clipping, and closes competing tooltips.

### 4. Turn Legacy Setup Into Setup Home

Do not delete `SetupGroup` abruptly.

Near-term:

- Make `/settings/setup` a compact Setup Home task list.
- Link task rows to `/settings/bi`, `/settings/ai`, future `/settings/context`, `/settings/governance`, and preview/handoff.
- Remove duplicated child forms from Setup Home, or keep them only as shortcuts until BI/AI pages own them fully.

Longer-term:

- Extract task readiness from a pure `AuthoringStateSnapshot`.
- Delete or archive duplicated inline setup forms after tests move.

### 5. Mobile Parent Map

Current issue:

- [settings.css:635](../../playground/src/settings/settings.css#L635) hides the rail under 640px.

Target:

- Add a sticky horizontal parent nav or drawer trigger.
- Show current parent and task status.
- Keep child shortcuts accessible through a disclosure or drawer.

Acceptance:

- Mobile never loses the Settings map.
- No horizontal overflow at 375/390px.
- Save bar and parent nav do not occlude each other.

## Proposed First Claude Slice

Keep it narrow and high-impact.

Files likely touched:

- `playground/src/settings/groups/BiGroup.tsx`
- `playground/src/settings/groups/AiGroup.tsx`
- `playground/src/settings/groups/SetupGroup.tsx`
- `playground/src/settings/primitives/FieldRow.tsx`
- `playground/src/settings/primitives/HelpTip.tsx` only if absolutely needed
- `playground/src/settings/settings.css`
- focused Settings tests

Tasks:

1. Refactor `Leaf` to support `summary` + `help` and stop rendering helper paragraphs by default.
2. Convert 10-15 highest-noise `helper=` usages in BI/AI/Advanced to `help` tips.
3. Replace the three raw title-based `i` buttons with `HelpTip`.
4. Compact the BI/AI header ribbons so they share one style.
5. Keep errors/warnings visible.
6. Add or update tests proving helper copy is accessible through info buttons and not visible as body clutter.

Do not, in this first slice:

- Rebuild all Settings routes.
- Delete `SetupGroup`.
- Add a new global shell.
- Move pack governance yet.
- Create a new design system.

## Proposed Second Claude Slice

Parent-child flow.

Tasks:

1. Convert `/settings/setup` into compact Setup Home task rows.
2. Move duplicated setup child fields toward owning pages:
   - BI child fields stay under BI Surface.
   - AI connector/test stays under AI Assistant.
   - Pack/domain defaults move toward Business Context.
   - Governance/policy moves toward Governance.
3. Add explicit parent mode controls before child fields.
4. Ensure child fields do not render before prerequisites.

Acceptance:

- First Settings viewport is task/readiness oriented, not a field wall.
- No duplicate BI/AI/pack choice between Setup Home and child pages.

## Proposed Third Claude Slice

Mobile and validation.

Tasks:

1. Add mobile parent nav replacement.
2. Add responsive screenshot/probe for Settings at 390px and desktop.
3. Assert no horizontal overflow, parent location visible, save bar not hiding controls.
4. Add density regression checks where practical.

## Visual Template

### Setup Home

```text
Settings
Status: BI partial | AI ready | Context suggested | Governance dev-permissive

[Setup Home] [BI Surface] [AI Assistant] [Business Context] [Governance] [Viewer Display] [Advanced]

Task                          State       Owner              Next action
BI Surface                    Partial     BI owner           Validate embed
AI Assistant                  Ready       AI platform        Run test again
Business Context              Suggested   Data product       Review defaults
Governance                    Warning     Platform/Security  Review allowlist
Preview & Handoff             Untested    Author             Preview as viewer
```

### Parent Page

```text
BI Surface        2 of 3 ready                         [i]

Mode
[Native Canvas] [Power BI governed embed] [Secure embed] [Generic iframe]

Required for selected mode
Workspace         [__________________] [i]
Report            [__________________] [i]
Token mode        [Service principal v] [i]

Validation
Allowlist: Warning
RLS: Not verified

[Validate] [Preview as viewer]
```

### Compact Leaf

```text
Workspace                    Saved locally              [i] [Copy link]
[ input ]
```

Instead of:

```text
Workspace
Long paragraph explaining Power BI workspaces, where the value is stored,
what route uses it, and how admins configure it...
[ input ]
```

## Acceptance Criteria

Claude should not call this done until:

- First Settings viewport shows task/readiness rows, not a control wall.
- Each parent page has a clear parent choice before child fields.
- Inline helper paragraphs are reduced materially; most explanatory writeup lives behind `HelpTip`.
- Required labels, validation, and next actions remain visible.
- Mobile has a parent navigation replacement when rail is hidden.
- Settings still preserves deep links and search.
- No preview path bypasses `BIPanel`.
- Focused Settings tests pass.
- The known current hard gate from the broader audit is either fixed first or explicitly still failing.

## Do Not Do

- Do not make Settings a marketing-style landing page.
- Do not add more decorative cards.
- Do not hide errors, missing prerequisites, RLS warnings, allowlist failures, or destructive-action warnings in info buttons.
- Do not create another pack/domain/context selector outside the Business Context owner model.
- Do not let legacy Setup remain a duplicate source of truth.
- Do not remove deep links just to simplify the UI.
- Do not make mobile lose the parent-child map.

## Relation to Existing Research

This handoff sharpens, but does not replace, the earlier Settings research:

- [SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md)
- [SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md](SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md)
- [FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md](FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md)
- [SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md](SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md)
- [READ_ONLY_CODEBASE_AUDIT_FOR_CLAUDE_2026-05-27.md](READ_ONLY_CODEBASE_AUDIT_FOR_CLAUDE_2026-05-27.md)

This document is the focused implementation handoff for the specific issue Rajesh confirmed on 2026-05-27: Settings needs parent-child progressive flow, compact space management, and section writeups moved into info buttons.
