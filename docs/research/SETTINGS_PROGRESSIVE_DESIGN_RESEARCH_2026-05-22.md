# PulsePlay Settings Progressive Design Research

Date: 2026-05-22
Status: research and implementation brief, no runtime code changed
Scope: Settings page first, with propagation guidance for the rest of PulsePlay

## Executive Verdict

The Settings page is not failing because it lacks polish. It is failing because it exposes too many controls at the same time and asks the author to understand the system model before the UI has taught it.

The fix is a progressive authoring model:

1. Start with a Setup Home that shows the parent tasks and their readiness.
2. Let the author pick the parent mode first.
3. Reveal only the child fields required by that mode.
4. Test the choice immediately.
5. Show what changed, who owns it, and what the viewer will experience.
6. Review and publish only after the required tasks are complete.

The current Settings shell can be reused. The redesign should not delete capability or flatten the product. It should change the first impression from "many open cards" to "clear setup path with inspectable advanced controls."

## Research Method

This pass combined:

- Four parallel read-only research agents:
  - Settings information architecture and code audit.
  - Cross-page PulsePlay consistency audit.
  - Sustainability gauge audit.
  - External design-pattern research.
- Local code and screenshot inspection of Settings, Quick Setup, AI, BI, Preferences, System, Advanced, and mobile Settings.
- Official and safe public design references: Nielsen Norman Group, Microsoft Fluent 2, GOV.UK Design System, PatternFly, Carbon, Material Design, Atlassian Design System, Canva, Figma, Vercel, and Stripe.
- Canva connector check for connected brand templates.
- Figma connector attempt for a FigJam progressive setup diagram.
- A follow-up visual evidence sweep: [settings-control-panel-sweep-2026-05-22](../evidence/settings-control-panel-sweep-2026-05-22/README.md), with 100 screenshots across Settings routes and viewport sizes.
- A follow-up alignment note before brainstorming: [SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md](SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md), rechecking the screenshot evidence and Figma/VS Code handoff path.

Connector note: Canva `_search_brand_templates` for `settings dashboard` returned no connected brand-template matches. Figma diagram generation was prepared, but the connector requires a team or organization plan selection before it can create the FigJam diagram.

## What Exists Today

The current Settings implementation already has good bones:

- A dedicated route shell at `playground/src/settings/SettingsShell.tsx`.
- Six parent groups: Setup, BI, AI, Preferences, System, and Advanced.
- A left rail with group-level items and per-leaf subitems.
- Search across group and leaf labels.
- Status chips for setup, BI, AI, pack, proxy, and security state.
- A sticky save bar.
- Deep-linked settings leaves.
- Dedicated subroutes for dense surfaces such as appearance, governance, developer tools, knowledge base, and supervisor fusion.
- A Setup group that already frames the first three author concerns: BI surface, AI connector, and domain knowledge.

The problem is not absence of structure. The problem is that the structure is visually overexposed and some semantics do not match the underlying behavior.

## Current Strengths To Preserve

Preserve these pieces while redesigning:

- The route-level Settings shell and URL-deep-link model.
- The two-axis architecture: BI vendor is separate from AI connector.
- The current group vocabulary where it is still useful.
- Live system readiness signals.
- Test buttons and probe-driven feedback.
- Copy-link deep links for support and documentation.
- Dense advanced surfaces as inspectable subroutes.
- Field-level helper text and blocked-state explanation.
- The local store and profile plumbing unless a save-semantics fix requires a narrow change.

## Brutal Diagnosis

### 1. Settings Opens Like An Inventory, Not A Setup Flow

The shell and groups are coherent, but the author sees many editable controls immediately. Setup shows three FieldCards in one page. AI shows the connector catalogue, assistant details, shared context, response behavior, and surface-specific behavior in one long page. BI, System, and Advanced also read as long forms.

This contradicts progressive-disclosure guidance: the first level should contain the important choices, while rare or specialized controls should be secondary.

### 2. Parent-Child Relationships Are Visually Flattened

The product model is hierarchical:

- Setup owns readiness.
- BI surface owns provider, embed/auth, canvas, and policy.
- AI connector owns provider, model/agent, shared context, response behavior, and surface-specific behavior.
- System owns diagnostics and operational state.

But the rail mostly lists group and leaf labels. It does not always explain dependencies. A child can appear before the parent decision that makes it meaningful.

### 3. Mode Choice Comes Too Late

For setup, the author should choose the operating mode before seeing fields:

- Native sample canvas.
- Generic iframe.
- Power BI quick preview.
- Power BI governed embed.
- Future Tableau/Qlik/Looker SDK modes.

Today the author can see URL/auth/canvas/profile fields before the mode has been made explicit. This creates the feeling of "I am filling settings, but I do not know the setup path."

### 4. Save Semantics Are Not Honest Enough

The UI presents a sticky save/discard/reset contract, but several setters write live to local storage or active runtime stores. That makes the save bar feel stronger than the implementation guarantees.

This is not only a UI issue. Settings are high-trust controls. The author must know whether a change is draft-only, live-local, session-only, or published default.

### 5. Mobile Loses The Navigation Model

The CSS hides the left rail below 640px. There is no equally strong mobile parent navigation replacement. A mobile author loses the mental map of where they are.

### 6. Search Is Useful But Too Shallow

Search indexes labels and group descriptions, but not enough aliases, helper text, owner words, or action words. Authors think in tasks: "connect Power BI", "test Genie", "viewer preview", "security", "token", "DAX", "reset".

### 7. Advanced Is Too Normal

Advanced controls are important, but they should feel deliberately advanced. Today they are a normal rail group. The design should make advanced/support tools available without making them look like required setup steps.

### 8. Status Chips Need Source And Freshness

Status chips are helpful, but an enterprise settings screen should answer:

- What was checked?
- When was it checked?
- What source produced the state?
- What should I do next?

Without that, "Proxy ok" or "Security strict" can become decorative status rather than auditable status.

### 9. Setup Blocked States Still Leave Too Much Downstream UI Visible

If an allowlist or profile catalogue cannot load, the UI should fail closed and focus on the recovery action. The current setup screen can still expose downstream choices while the parent prerequisite is unavailable.

### 10. Cross-Page Shell Consistency Is Fragmented

Settings, Knowledge Base, Workbench, Power BI Q&A, Launchpad, and the root playground each have their own shell rhythm. Settings should define the admin/authoring grammar and then share the shell vocabulary with the other full-page routes.

## Target Design Principles

### Principle 1: Progressive First, Inventory Second

The initial screen should show tasks, not fields. Fields appear only after a parent choice or task selection.

### Principle 2: Parent Chooses Child

A child setting should not appear before its parent state is selected or known. Example: Power BI service-principal fields appear only after "Power BI governed embed" is selected.

### Principle 3: One Primary Decision Per Step

Each setup step should have one clear action:

- Choose BI surface mode.
- Enter the required connection value.
- Test.
- Continue.

Avoid three open cards with three different primary actions in the first viewport.

### Principle 4: Current State Before Controls

Every detail page should start with:

- Current value.
- Status.
- Last checked time or source.
- Next recommended action.
- Impact statement.

Only after that should the editable fields appear.

### Principle 5: Author Scope Must Be Explicit

Every setting needs a clear scope:

- Viewer preference.
- Author default.
- Workspace/deployment setting.
- Admin/security policy.
- Diagnostic/support tool.

The UI should not make these look equivalent.

### Principle 6: Save Semantics Must Match Reality

The UI should distinguish:

- Draft changes.
- Immediate local changes.
- Runtime-only changes.
- Published defaults.
- Server/deployment changes.

If a field writes live, call it live. If the save bar is retained, make it represent real draft persistence.

### Principle 7: Advanced Controls Need Deliberate Entry

Advanced controls should be behind an "Advanced and support" parent and, where appropriate, an explicit reveal. They should be easy to find but not visually equal to required setup.

### Principle 8: Mobile Keeps The Map

At small widths, replace the left rail with a segmented parent nav or horizontal task tabs. Do not hide the only parent-child map.

### Principle 9: Status Uses Text, Icon, Color, And Context

Do not rely on color-only status. Pair state labels with source and next action.

### Principle 10: No Nested Card Pileups

Use cards for repeated task rows or mode choices. Do not put page sections inside cards inside cards. Detail forms should be clean panels with full-width sections.

## Recommended Settings Information Architecture

### Desktop Layout

Use a three-zone authoring shell:

| Zone | Purpose |
|---|---|
| Left parent nav | Setup, BI surface, AI connector, Knowledge, Viewer experience, System, Advanced and support |
| Main work area | Setup task list or selected detail editor |
| Right context rail | Current state, impact, last test, related settings, docs link |

The right context rail should collapse below tablet width.

### Mobile Layout

Use:

- Top compact status row.
- Horizontal parent nav.
- Single-column task/detail content.
- Sticky bottom action bar only when a real action is pending.

Do not rely on the search input as the only navigation method.

## Setup Home

Settings should default to Setup Home. The first viewport should answer four questions:

- Is PulsePlay usable right now?
- What is missing?
- What should I do next?
- What will my viewer see?

Recommended task list:

| Task | Parent | Status | Opens |
|---|---|---|---|
| Choose BI surface | BI | Not started / Needs test / Ready | Mode cards |
| Connect AI assistant | AI | Not started / Needs test / Ready | Connector cards |
| Pick knowledge grounding | Knowledge | Optional / Recommended / Ready | Pack and grounding choices |
| Review governance | System | Needs review / Strict / Blocked | Policy summary |
| Preview as viewer | Viewer experience | Locked / Ready | Preview and review page |

This aligns with GOV.UK's task-list guidance: a long, complex setup benefits from a task list when users may complete tasks in different sittings or order. PulsePlay setup is exactly that kind of authoring task.

## Progressive BI Setup Flow

### Step 1: Choose Surface Mode

Show mode cards:

| Mode | Use When | Child Fields Revealed |
|---|---|---|
| Native sample canvas | Demo, smoke, no external BI yet | Dataset/sample selection only |
| Generic iframe | Any reachable internal URL | URL and sandbox policy |
| Power BI quick preview | Fast internal preview from portal link | Portal URL, optional iframe options |
| Power BI governed embed | Enterprise embed with token issuance | Workspace, report, dataset, tenant, auth policy, RLS mode |

Each card should include:

- One-line description.
- Security status.
- Required prerequisites.
- "Recommended for first proof" badge where appropriate.

### Step 2: Enter Required Fields Only

After the mode selection, show only the fields required for that mode. Do not show governed embed fields for generic iframe mode.

### Step 3: Test

The test panel should show:

- What was tested.
- Result.
- Timestamp.
- Request/correlation id when available.
- What to fix if it failed.

### Step 4: Preview

Show "Preview as viewer" before publishing. For unavailable BI content, use a focused empty state with one action.

## Progressive AI Setup Flow

### Step 1: Choose Connector Family

Show connector family cards before the full catalogue:

- Databricks Genie.
- Foundation Model.
- Supervisor.
- Azure OpenAI.
- Bedrock.
- ResponsesAgent.
- Power BI semantic-model DAX.

Then show available profiles inside the selected family.

### Step 2: Show Current Connector Summary

Before edit fields:

- Active profile.
- Backend path.
- Configured/unconfigured.
- Last health check.
- Auth mode.
- Known limitations.

### Step 3: Shared Context

Only after connector selection, show shared context:

- Knowledge pack.
- Domain guidance.
- Metric semantics.
- Vector Search.
- UC metric view.

The copy should explicitly say this context is shared by AI Insights and Ask Pulse unless a surface-specific override says otherwise.

### Step 4: Surface-Specific Behavior

AI Insights and Ask Pulse behavior belongs here, but collapsed until shared context is understood:

- AI Insights stage policy.
- Ask Pulse conversational behavior.
- Supervisor fusion.
- Response format.

## Review And Publish

Add a final review page inspired by GOV.UK check-answers guidance:

| Section | Current Answer | Change Link |
|---|---|---|
| BI surface | Power BI governed embed, Report X | Change |
| AI connector | Databricks Genie, Profile Y | Change |
| Knowledge | CPG pack, domain guidance active | Change |
| Governance | Strict, G3 enforced | Change |
| Viewer preview | Passed 2 minutes ago | Re-run |

The author should not need to walk back through every step after changing one answer. Returning from a child edit should return to review.

## Component Kit Recommendation

Build these primitives before repainting individual groups:

| Component | Purpose |
|---|---|
| `SettingsPageShell` | Shared page chrome for Settings and future admin-like pages |
| `SetupTaskList` | Parent task rows with status, hint, and whole-row click target |
| `ModeCard` | Parent choice before child fields |
| `ProgressiveSection` | Single open section with explicit trigger and aria state |
| `CurrentStateHeader` | Current value, status, source, freshness, next action |
| `ImpactCallout` | "Changing this affects..." |
| `InlineProbeResult` | Test result with timestamp and correlation id |
| `PolicyCallout` | Security/governance read-only explanation |
| `RelatedSettingsRail` | Child/peer links without crowding the main form |
| `ReviewSummary` | Check-answers style final review |
| `RecoveryState` | Empty/blocked/error state with one next action |

## Cross-Page Propagation

Settings should become the source for a shared PulsePlay authoring grammar:

- Knowledge Base should reuse the same page shell and status grammar.
- Power BI Q&A should use the same unsupported/deprecated/recovery state model.
- Workbench should be either promoted to a real authoring surface or clearly marked as preview.
- Launchpad should share the same current-state and next-action pattern.
- Root playground should reuse the same readiness language, but not expose the full Settings chrome.
- First-run wizard should become a thin guided entry into the same Setup Home, not a separate personality.

## Sustainability Gauge Study

### Current Behavior

The current indicator:

- Lives at the bottom of `AISidebar`.
- Records backend usage when available.
- Estimates tokens from text length when backend usage is absent.
- Tracks tab/session-local usage only.
- Uses tiers from 0 to 50k+ session tokens.
- Shows a leaf, face, tier label, token count, progress bar, panel, and reset button.

### What Works

- Location near the AI interaction is right.
- Session-local scope is safer than account-level claims.
- The reset action is useful.
- Estimated token marker is honest.
- The core idea supports PulsePlay's "fewer tokens, better accuracy" positioning.

### What Does Not Work

The visible "sustainability" framing is overloaded. Users may interpret it as climate impact, infrastructure cost, model efficiency, or conversation health. The product only measures token usage. That is valuable, but it is not enough to claim environmental sustainability.

The face scale can also feel judgmental in high-usage sessions. For an enterprise analytics app, the signal should be calm and operational.

### Recommended Rename

Use visible language that says exactly what the product measures:

- Token efficiency.
- Session efficiency.
- Token/session efficiency.

Recommended: `Token efficiency` in the compact footer, with `Session efficiency` as the panel heading. Avoid `sustainability` as the primary label until PulsePlay measures actual environmental impact.

### Recommended UI

Compact footer:

```text
Token efficiency · Low · ~1.5k tokens
[thin progress bar]
```

Panel:

- Heading: `Session efficiency`
- Body: "Estimated from this browser session. Lower token use usually means faster answers and lower cost, but complex questions may need more context."
- Rows:
  - Input tokens.
  - Output tokens.
  - Questions.
  - Real vs estimated data.
- Action: `Start fresh`

### Tier Copy

Use calm labels:

| Current | Recommended |
|---|---|
| Ready | Ready |
| Lean | Low usage |
| Green | Healthy usage |
| Moderate | Usage building |
| Heavy | Long session |
| Very heavy | Fresh start recommended |

Avoid:

- Climate claims.
- Shame or guilt language.
- Happy/sad faces.
- Color-only meaning.

### Settings Placement

Do not move the indicator into Settings as a primary tile. Keep it near Ask Pulse / AI Insights. Settings may expose a small System preference later:

- Show token/session efficiency indicator.
- Show token estimates when exact usage is unavailable.
- Reset session usage.

### Digital Wellbeing Gesture

Rajesh's refinement: end users may not understand how their choices contribute. The indicator should therefore become a small educational gesture, not only a measurement.

Recommended interaction:

1. Keep the compact `Token efficiency` chip near the Ask Pulse composer or assistant footer.
2. On first use, after the first completed answer, show a one-time gentle nudge attached to the chip:

```text
Token efficiency
Focused questions help PulsePlay answer faster and use less context.
```

3. When the user clicks or focuses the chip, expand a small coach card:

```text
Session efficiency
This answer used ~1.5k tokens in this browser session.

How you helped
You asked one focused question and let PulsePlay use the current dashboard context.

Try this
Start a fresh session when you change topics.
```

4. Include only two actions:

- `Start fresh`
- `Got it`

This makes the user's contribution understandable without moralizing. It teaches the wellbeing idea as a practical digital habit: focused questions, less pasted context, fresh sessions when the topic changes, and fewer unnecessary back-and-forth turns.

Rules for the gesture:

- It must be optional and dismissible.
- It should not interrupt an answer.
- It should not appear as a modal.
- It should not use guilt, climate claims, badges, streaks, leaderboards, or achievement language.
- It should respect reduced motion.
- It should explain estimates plainly when exact token usage is unavailable.
- It should stay near Ask Pulse / AI Insights, not in Settings as a live gauge.
- Settings may only expose preferences for showing/hiding the gesture and resetting session telemetry.

## External Source Synthesis

| Source | Design Takeaway | PulsePlay Application |
|---|---|---|
| Nielsen Norman Group progressive disclosure | Show core options first; reveal advanced or rare options on request; avoid too many disclosure levels. | Setup Home, mode cards before fields, advanced controls behind deliberate entry. |
| Nielsen Norman Group wizards | Wizards help occasional complex input when later steps depend on earlier choices. | First-time setup can be wizard-like, but ongoing Settings should be task-list plus detail pages. |
| PatternFly wizard | Progressive wizards can change or add steps based on earlier choices. | BI mode choice determines the next required child fields. |
| GOV.UK task list | Long services with tasks completed over time benefit from task rows and statuses. | Setup Home readiness checklist. |
| GOV.UK check answers | Final review builds confidence and lets users change answers without repeating the whole flow. | Review and publish screen. |
| Microsoft Fluent 2 Nav | Nav should be brief, scannable, goal-focused, and only supports one nesting level before a Tree is better. | Two-level settings navigation; deeper detail is page content, not deeper nav. |
| Microsoft Fluent 2 Field | Labels and helper text should be visible; validation should guide next action. | Always-visible labels, inline probe validation, no placeholder-only instructions. |
| Atlassian forms | Long forms should use multi-step or progressive disclosure; each screen groups fields that belong together. | Split BI/AI setup into parent mode, required fields, test, review. |
| Carbon disclosures | Only one disclosure should be open; do not nest disclosures; do not hide critical information. | Use one open progressive section and keep required setup visible. |
| Carbon empty states | Empty states should be contextual and focus on one next action. | Blocked setup and missing profile states should have one recovery CTA. |
| PatternFly status/severity | Status and severity require text plus icon/color, and they are not interchangeable. | Separate readiness status from risk severity. |
| Material settings | Show important settings upfront; move less important settings to their own screen; labels should be brief and meaningful. | Current-state overview first, dedicated child pages for dense controls. |
| Material empty states | Avoid completely empty states; starter or educational content can help when useful. | Viewer preview and no-profile states should teach without becoming marketing copy. |
| Canva visual hierarchy | Size and scale guide attention. | Keep primary decision visually dominant; reduce equal-weight card grids. |
| Figma templates / Fluent kit | Use existing design-system kits for layout inspiration, not as a reason to copy decorative dashboard templates. | Figma handoff should be annotated flow frames, not a generic dashboard skin. |
| Vercel usage docs | Usage dashboards should show current cycle, projection, breakdown, and controls. | Future AI usage panel can add threshold/projection only if persisted account usage exists. |
| Stripe usage lifecycle | Usage systems need ingestion, aggregation, billing/ownership, and monitoring. | Current indicator is session telemetry only, so label it honestly. |

## Implementation Sequence

### Phase 0: Lock The Design Contract

Deliverable:

- This research brief accepted as the working target.
- No code changes.

### Phase 1: Metadata Foundation

Add metadata for every setting:

- Parent group.
- Child leaf.
- Scope.
- Lifecycle.
- Source of truth.
- Depends on.
- Affects.
- Search aliases.
- Default disclosure level.
- Owner persona.

This enables the UI to render progressive navigation without hardcoding every branch.

### Phase 2: Setup Home

Add the task-list Setup Home and route `/settings/setup`.

Keep existing detail groups available, but the default setup experience should be task-first.

### Phase 3: BI And AI Progressive Detail Pages

Rework BI and AI around:

- Current state header.
- Mode/connector choice cards.
- Required child fields.
- Test panel.
- Review link.

### Phase 4: Save Semantics And Audit Status

Fix save/draft truth:

- Label live-write fields honestly, or move them into real draft state.
- Add timestamps and source to status chips.
- Add navigation guard only where real unsaved changes exist.

### Phase 5: Mobile Navigation

Replace hidden rail with a mobile parent nav and clear current-location indicator.

### Phase 6: Token/Session Efficiency Gesture

Rename visible UI from sustainability to token/session efficiency, and add the small digital wellbeing gesture near Ask Pulse.

Keep the implementation path small:

- Update labels/copy.
- Remove face/emotion scale.
- Preserve token estimate honesty.
- Keep session reset.

### Phase 7: Cross-Page Shell

After Settings is stable, migrate Knowledge, Q&A, Workbench, and Launchpad to the same authoring shell primitives.

## Acceptance Criteria

The redesign is not accepted unless all of these are true:

- First Settings viewport shows setup status and next action, not a wall of controls.
- No setup page opens with more than one primary call to action.
- No child form appears before its parent mode is chosen or known.
- Desktop and mobile both show the parent-child location.
- Every status chip has a source and freshness timestamp or explicitly says it is static.
- Every blocked state gives one recovery action.
- Search finds common task words and aliases, not only exact labels.
- Save/discard/reset semantics match actual persistence behavior.
- Advanced/support controls are discoverable but not visually equal to required setup.
- AI Insights and Ask Pulse shared context is described as shared.
- Token/session efficiency copy makes no environmental claim unless environmental data is actually measured.
- Reduced-motion users do not get jitter or decorative movement.

## Prompt To Hand To Claude

Use this when asking Claude or another implementation agent to work on the Settings page:

```text
Redesign PulsePlay Settings as a progressive authoring setup, not as an all-open settings inventory.

Do not remove existing capabilities. Keep the current Settings routes and stores unless a narrow save-semantics fix requires a local change.

Start by adding metadata and layout primitives:
- setting scope: viewer preference, author default, deployment setting, admin/security policy, diagnostic/support
- lifecycle: required, recommended, optional, advanced
- dependencies: parent mode/profile/allowlist requirements
- affects: what app surface changes when edited
- aliases for Settings search

Then implement a Setup Home task list as the default Settings view:
- Choose BI surface
- Connect AI assistant
- Pick knowledge grounding
- Review governance
- Preview as viewer

Each task row needs status, one-line hint, and whole-row navigation.

For BI setup, show mode cards first:
- Native sample canvas
- Generic iframe
- Power BI quick preview
- Power BI governed embed

Only after the author chooses a mode should the required child fields appear. Do not show governed embed fields while the author is in generic iframe mode.

For AI setup, show connector family/profile choice first, then current connector summary, then shared context, then surface-specific behavior. Make clear that knowledge pack, domain guidance, metric semantics, and grounding are shared by AI Insights and Ask Pulse unless overridden.

Every detail page starts with:
- current value
- readiness/status
- last checked/source
- next recommended action
- changing this affects...

Fix mobile navigation: when the left rail hides, provide a horizontal parent nav or segmented task nav. Do not leave mobile users without a Settings map.

Fix save honesty: either make Save/Discard represent true draft state or label live-write settings as live/local/session changes. Do not imply a publish gate that does not exist.

Advanced and support tools must remain discoverable but should not appear as required setup. Use a deliberate Advanced and support entry.

Rename the sustainability gauge visible language to token/session efficiency. Keep session token tracking, but remove climate implication and emotion-face tiers. Add the small Ask-adjacent wellbeing gesture so users understand how focused questions, less pasted context, and fresh sessions help.

Validation expected:
- focused Settings tests
- mobile Settings screenshot
- desktop Settings screenshot
- no visual overlap
- no all-open-cards first impression
- reduced-motion-safe token/session efficiency indicator
```

## Open Decisions

1. Should the first implementation target only Setup Home, or also rework BI and AI detail pages in the same branch?
2. Should save semantics become real draft-first everywhere, or should the UI explicitly label live-write fields?
3. Should Advanced move under System as "Advanced and support", or remain a parent group with stronger gating?
4. Should the Figma output be a FigJam flow diagram first, or high-fidelity Settings frames after the metadata model is implemented?
5. Should the token/session efficiency indicator be renamed immediately, or bundled with a broader assistant-sidebar polish pass?

## Bottom Line

Settings should feel like a guided control center:

- The author always knows where they are.
- The parent decision is visible before child fields.
- The next action is obvious.
- The consequences of changes are visible.
- Advanced power is available without overwhelming the first setup path.

That is the design shift Claude needs to implement. The screen does not need more decorative styling first. It needs progressive structure.
