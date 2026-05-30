# PulsePlay Settings Alignment Observation Before Brainstorming

Date: 2026-05-22
Status: observation and alignment note, no runtime code changed
Scope: Settings/control-panel design, screenshot evidence, Figma/VS Code handoff path, and token/session efficiency placement

## Purpose

Rajesh asked for one more deep observation pass before brainstorming. This note is intentionally not a redesign proposal. It aligns the screenshot evidence, the existing Settings research brief, and the official Figma/VS Code handoff sources so the next conversation can start from shared ground.

## Evidence Re-Observed

Primary artifacts:

- Research brief: [SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md)
- Screenshot sweep: [settings-control-panel-sweep-2026-05-22/README.md](../evidence/settings-control-panel-sweep-2026-05-22/README.md)
- Screenshot manifest: [manifest.json](../evidence/settings-control-panel-sweep-2026-05-22/manifest.json)
- Desktop contact sheet: [contact-desktop-viewports.png](../evidence/settings-control-panel-sweep-2026-05-22/contact-desktop-viewports.png)
- Tablet contact sheet: [contact-tablet-viewports.png](../evidence/settings-control-panel-sweep-2026-05-22/contact-tablet-viewports.png)
- Mobile contact sheet: [contact-mobile-viewports.png](../evidence/settings-control-panel-sweep-2026-05-22/contact-mobile-viewports.png)
- Search contact sheet: [contact-search-states.png](../evidence/settings-control-panel-sweep-2026-05-22/contact-search-states.png)

Coverage already exists for 12 Settings routes, 4 viewport sizes, viewport and full-page captures, plus search states for `power`, `token`, `advanced`, and `governance`. This is enough evidence to avoid designing from memory.

## Alignment Verdict

We are aligned on the main diagnosis: Settings is not failing because it needs more decoration. It is failing because it asks the author to see the whole control inventory before the parent setup decisions are understood.

The first move should be information architecture and progressive disclosure, not a visual repaint.

## What The Evidence Says

### 1. This Is A System-Level Settings Problem

The issue is not one bad card. Setup, AI, BI, System, Advanced, and narrow viewports all show the same pattern: good capabilities, too much simultaneous exposure.

Design implication: fix the shell grammar, task hierarchy, and disclosure model first so each page can inherit the same behavior.

### 2. Setup Still Opens As A Form Wall

The Setup page shows mode buttons, provider choice, embed inputs, helper copy, and action buttons before the author gets a clear parent setup path.

Design implication: Setup Home should start as task rows with readiness and next action. Parent mode cards should come before child fields.

### 3. AI Is The Main Complexity Hotspot

The AI page combines connector catalogue, profile/model detail, Power BI Q&A launch, knowledge grounding, vector/metric options, response behavior, and supervisor fusion.

Design implication: AI should be split by parent intent: choose connector, confirm current connector, configure shared knowledge, then tune surface-specific behavior.

### 4. Mobile Loses The Parent Map

The desktop left rail disappears on mobile without an equally strong replacement. Mobile captures show content but not the control-panel map.

Design implication: mobile needs a parent navigation strip or task-list return affordance. Collapsing the rail is not enough.

### 5. Advanced Is Not Distinct Enough

Performance levers, cache freshness, retry budget, local storage inspection, reset, and danger-zone controls look like normal setup items.

Design implication: Advanced/support controls should remain reachable, but visually and semantically separated from required setup.

### 6. Search Is Label Lookup, Not Task Intent

The `token` search capture returns `0 groups matched`, even though token/session efficiency is now a planned visible concept.

Design implication: search needs aliases, helper text, owner words, and task words. It should find `token`, `DAX`, `Power BI`, `governance`, `viewer`, `reset`, `auth`, and `advanced` even when exact labels differ.

### 7. Save Semantics Need To Become Truthful

The sticky save bar creates a strong promise, but some settings already write through live stores or local storage.

Design implication: every field needs lifecycle metadata: draft-only, live-local, session-only, published default, admin policy, or support diagnostic.

### 8. The Floating Bottom-Right Control Is Unsafe On Settings

The floating control competes with Settings, especially on mobile and tablet captures where the sticky save bar is also present.

Design implication: suppress, relocate, or make that control context-aware on Settings until it stops competing with authoring controls.

### 9. Governance Has Good Raw Material

The governance page has useful enterprise content, status language, and policy sections. Its problem is not absence of substance.

Design implication: governance should become a reviewable policy path with current state, source, freshness, impact, and test/review actions.

### 10. Token/Session Efficiency Belongs Near Ask

The measurement should be renamed to token/session efficiency, copy should be calm, and the live gesture should stay near Ask Pulse or the assistant footer rather than becoming a Settings dashboard tile.

Design implication: Settings can expose preferences for showing the indicator and resetting session telemetry, but the educational gesture belongs where the AI interaction happens.

## Official Design And Handoff Sources Checked

Figma and VS Code:

- Figma Help: Figma for VS Code says the extension lets developers inspect designs, receive comments/activity, link code to components, and get design-based code suggestions from VS Code.
- Visual Studio Marketplace: `figma.figma-vscode-extension` is the official Figma extension entry Rajesh shared.
- Figma Help: Figma MCP setup for VS Code confirms the remote MCP server is the preferred path for broad access, while the desktop MCP server is for specific organization and enterprise cases.
- Figma Help: Dev Mode requires a paid plan and Full or Dev seat, and supports ready-for-development statuses, inspect, compare, annotations, and VS Code handoff.
- Figma Help: Code Connect connects design components to code paths and feeds Figma MCP context, which is useful only after component primitives are named.

Design-system alignment:

- GOV.UK Task List supports long, complex services completed across sessions and gives each task a status.
- Carbon Disclosures recommends avoiding multiple open disclosures so users can stay focused.
- Material Settings emphasizes brief labels, current-state secondary text, and moving dense explanations to secondary screens.
- Microsoft guidance on progressive disclosure supports showing essentials first and revealing follow-up fields after prerequisites.
- Fluent accessibility guidance reinforces that Settings must reflow without horizontal scrolling and survive narrow breakpoints.

## Figma/Canva Alignment

The immediate deliverable should not be a decorative dashboard template. It should be a design model:

1. FigJam or Figma flow: Setup Home -> BI mode -> AI connector -> Knowledge -> Governance -> Preview -> Review.
2. Annotated desktop Settings frames for the first viewport and one dense child page.
3. Annotated mobile Settings frames showing the replacement parent map.
4. Component primitives: `SetupTaskList`, `ModeCard`, `CurrentStateHeader`, `ImpactCallout`, `InlineProbeResult`, `RecoveryState`, `ReviewSummary`.
5. Code Connect/dev-resource mapping only after the component primitives are stable.

Canva is better as a later stakeholder explainer, not as the source of component truth.

Current connector reality: the Figma generation path still needs a team or organization plan selection before creating a FigJam/Figma artifact from the connector. The VS Code extension can help inspect and implement once a Figma file/frame exists, but it does not by itself replace that connector requirement.

## Brainstorming Guardrails

These are the guardrails to take into brainstorming:

- Do not remove capability.
- Do not make Settings a dashboard.
- Do not start with color/theme polish.
- Do not put a live token gauge in Settings.
- Do not hide critical setup prerequisites inside deep accordions.
- Do not keep all cards open by default.
- Do not treat mobile as just a compressed desktop.
- Do not let Advanced look equivalent to required setup.
- Preserve deep links and supportability.
- Preserve the two-axis PulsePlay model: BI vendor and AI connector are independent.

## Questions To Brainstorm Next

1. Should UX1 start with save truth and metadata, or should UX2 start with Setup Home because it will be the visible relief?
2. Should the floating bottom-right control be suppressed on `/settings` immediately as a small safety fix?
3. Should AI Settings become three pages: Connector, Knowledge, and Response behavior?
4. Should Advanced move under System as support tooling, or remain top-level but gated?
5. What Figma artifact is most useful first: FigJam flow, desktop frame, mobile frame, or component library sketch?
6. Should token/session efficiency copy be updated immediately near Ask, or wait for the full assistant-sidebar polish pass?

## Pre-Brainstorming Conclusion

The evidence is strong enough to move into brainstorming without another screenshot pass. The next productive conversation should decide sequencing and scope, not whether the problem exists.

Recommended first discussion frame: "How do we turn Settings from an inventory into a progressive setup control panel without losing enterprise depth?"

