# AI Insights and Dashboard UI/UX Deep Research and Claude Handoff

Date: 2026-05-27

Purpose: extend the Ask Pulse screen research into the two sibling surfaces Rajesh called out: AI Insights and Dashboard. This is a Claude-ready product/UX brief, not a code patch. It is meant to make the three PulsePlay tabs feel like one coherent data dialogue system:

1. AI Insights = generated executive briefing.
2. Ask Pulse = conversational analysis and follow-up.
3. Dashboard = BI surface plus AI-generated chart canvas.

## Executive Verdict

The current UI has the right three-surface model, but only Ask Pulse has started to feel like a product surface. AI Insights and Dashboard still read as feature surfaces.

AI Insights is strong underneath. It already has staged generation, stop/retry, skeleton cards, section cards, KPI tiles, provenance footers, SQL/data controls, copy/export, custom prompts, suggested follow-ups, compare mode, and supervisor warnings. The missing piece is not more controls. The missing piece is a polished "briefing deck" frame: clear data context before generation, a trust summary after generation, a section map, safer error treatment, and a direct bridge from each finding into Ask Pulse or Dashboard.

Dashboard is the bigger UX gap. The tab label says "Dashboard", but the empty state often says "AI chart canvas", older evidence says "BI Viz", and the implementation has two different meanings:

1. A real embedded BI report surface.
2. PulsePlay's native canvas for AI-generated charts/tables/KPIs.

That is useful, but the screen does not yet explain or organize those modes. Modern BI dashboards make data source, filter context, refresh, hierarchy, interaction, and drill-through obvious. PulsePlay Dashboard currently has too much blank space, weak mode identity, and minimal chart artifact controls.

The design direction:

- Make AI Insights an "Executive Briefing Deck".
- Make Dashboard a "Data Canvas" with two modes: Embedded BI and Pulse-generated artifact.
- Keep the top tabs unchanged for now: AI Insights, Ask Pulse, Dashboard.
- Add shared context/trust grammar across all three screens so they feel like one system.

## Sources Reviewed

External standards and product patterns:

- Microsoft Power BI dashboard design tips: dashboards should be audience-specific, uncluttered, glanceable, one-screen where possible, and structured with the most important information first. https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips
- Microsoft Power BI accessibility checklist: contrast, non-color cues, alt text, tab order, screen reader behavior, and accessible show-data expectations. https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-reports
- Power BI Copilot summary/narrative patterns: report, page, and visual summaries; suggested/custom prompts; tone and specificity adjustment. https://learn.microsoft.com/en-us/power-bi/explore-reports/copilot-pane-summarize-content and https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-copilots
- Tableau visual best practices: dashboard purpose should guide the reader's eye through multiple coordinated views and balance visual design, actions, filters, data density, and performance. https://help.tableau.com/current/blueprint/en-us/bp_visual_best_practices.htm
- Tableau Pulse: proactive metric insights, guided exploration, explainability, supporting visualizations, citations, metric layer grounding, and mobile/digest workflows. https://www.tableau.com/metrics and https://help.tableau.com/current/online/en-us/pulse_intro.htm
- Databricks AI/BI dashboards: dashboards use widgets, filters, visualization libraries, cross-filtering, AI-assisted authoring, companion Genie spaces, governance, and mobile-friendly layouts. https://docs.databricks.com/en/dashboards/index.html, https://docs.databricks.com/aws/en/dashboards/concepts, and https://docs.databricks.com/aws/en/dashboards/filters
- Databricks AI/BI and Genie interface: simplified business-user interface for AI/BI dashboards, Genie spaces, apps, governance, and self-service insights. https://docs.databricks.com/aws/en/ai-bi/ and https://docs.databricks.com/aws/en/workspace/genie
- IBM Design Language data visualization basics: maximize accessibility and harmony; treat color and context carefully. https://www.ibm.com/design/language/data-visualization/design/basics/
- Microsoft Office data visualization style guidance: use Fluent UI chrome around data visualizations and design for clear visual principles. https://learn.microsoft.com/ka-ge/office/dev/add-ins/design/data-visualization-guidelines

Local evidence and code reviewed:

- AI Insights cold-start screenshot: `docs/evidence/ui-snapshot-2026-05-26/03-ai-insights-tab.png`
- Dashboard empty-state screenshot: `docs/evidence/ui-snapshot-2026-05-26/04-dashboard-tab.png`
- AI Insights complete/error/mobile screenshots: `docs/evidence/codex-verify-post-uat-1840/04-ai-insights-complete.png`, `docs/evidence/codex-verify-post-uat-1840/06-ai-insights-complete-audit.png`, `docs/evidence/ai-insights-deep-2026-05-26/03-mobile-412.png`, `docs/evidence/ai-insights-deep-2026-05-26/04-ultra-1920.png`
- Dashboard/BI Viz historical empty states: `docs/evidence/ui-regression-2026-05-20-codex/03-root-dashboard.png`, `docs/evidence/final-uat-regression-2026-05-19-0914/03-root-bi-viz.png`, `docs/evidence/visible-e2e-2026-05-19-1146/15-root-bi-viz-desktop.png`
- Active Pulse surface: `playground/src/pulse/visual.tsx`
- Active Pulse styles: `playground/src/pulse/style/visual.less`
- Dashboard empty state in app shell: `playground/src/App.tsx`
- Native dashboard/chart canvas: `playground/src/visualization/NativeCanvas.tsx`
- Chart selection/render helpers: `playground/src/visualization/*`

## Current Screen Inventory

### AI Insights - What Is Already Good

- The surface auto-generates a briefing rather than waiting for the user to ask.
- Staged progress is real and useful: status, elapsed time, stop, partial states, skeleton cards.
- The successful output already resembles a briefing: Executive Brief, KPI Snapshot, Trends, Risks, Opportunities, Recommended Actions, plus custom sections.
- KPI tiles have clear good/watch styling through metric direction rules.
- Per-section provenance, copy, export, SQL, and raw-data paths exist.
- Stale-while-refresh and incomplete/stopped states exist.
- The Adjust menu and custom prompt input give users a Copilot-style way to tune the briefing.
- Supervisor compare mode exists and is differentiated from single-source mode.

### AI Insights - Gaps

1. **Cold start is too generic.** The current empty state says what the feature does, but not what data, source, profile, freshness, or confidence it will use.
2. **No brief preflight.** A modern AI briefing should show "what I will analyze" before it runs: dataset, BI surface, active filters, connector, profile, sections, and expected time.
3. **Trust is spread out.** Source, updated time, SQL, provenance, DML warnings, trace, and validator state are scattered across cards and hidden controls.
4. **The run-state cluster floats away from the output.** The status card can sit in the header while the content below is blank, which feels disconnected on wide screens.
5. **Error copy leaks raw upstream payloads.** The mobile evidence shows raw Databricks 429 JSON overflowing the card. Keep raw trace behind "View trace"; show a human error summary first.
6. **Mobile is cramped and horizontally fragile.** Long error text and status widgets need hard overflow rules and a compact stacked layout.
7. **No section map.** Long briefings need a sticky mini table-of-contents or section chips so users can jump to Executive Brief, KPI Snapshot, Risks, Actions, SQL sections, etc.
8. **Actions are not surfaced as work.** Recommended Actions are visually prominent, but users cannot mark, pin, send to Ask Pulse, or push to Dashboard as an artifact.
9. **The complete state is good but still card-heavy.** It needs a stronger top summary layer so executives see the answer before the card grid.
10. **The Adjust menu is useful but quiet.** It should expose known modes such as "Leadership", "Risk review", "Operational plan", "Variance only", and "Use current filters".

### Dashboard - What Is Already Good

- Dashboard is a first-class tab next to AI Insights and Ask Pulse.
- The app can host embedded BI surfaces via `BIPanel`.
- The native canvas can render accepted AI results as text, table, KPI, chart, or fusion chart plus AI commentary.
- Governance states are wired: blocked, enforced, preview.
- The native renderer has chart autopick rationale and supports ECharts for bar, column, clustered bar, line, area, pie, and donut.
- Empty-state copy improved recently and points users back to Ask Pulse when the canvas is for AI-generated charts.
- The outer toolbar supports maximize/minimize/open/pin/popout style actions.

### Dashboard - Gaps

1. **Identity is muddy.** Users see "Dashboard", "BI Viz", "BI", and "AI chart canvas" in different places and evidence. That is not fatal, but it creates cognitive friction.
2. **Two dashboard modes are hidden.** The screen can be an embedded BI surface or a Pulse-generated chart canvas. The UI should name the active mode explicitly.
3. **Empty state is too sparse.** It explains the flow but does not offer sample actions, recent artifacts, active source context, or a mode choice.
4. **No dashboard context strip.** Modern BI dashboards show source, filters, refresh, permissions, and drill context. PulsePlay Dashboard should too.
5. **Native chart artifacts lack dashboard-grade controls.** Users expect chart type, table toggle, data labels, sort, filter, inspect, export, and "ask about this chart".
6. **Chart accessibility is thin.** ECharts canvas needs an adjacent textual summary, data table fallback, keyboard focus path, and non-color encodings.
7. **No pinning/story layer.** An insight or Ask Pulse answer should be pinnable to Dashboard as a card. Today Dashboard mostly waits for a single current result.
8. **Embedded BI mode needs a companion strip, not more chrome.** Do not overframe Power BI/Tableau/etc. Instead show PulsePlay context and actions around it.
9. **Failure states are too technical.** "BI_EMBED_FAILED" is useful for developers but should be translated for business users, with details collapsed.
10. **Dashboard is not yet the "shared ground" between AI Insights and Ask Pulse.** It should be the place where generated charts and pinned findings accumulate.

## Shared Product Grammar

The three surfaces need one shared grammar:

| Surface | User question it answers | Primary artifact | Main action |
|---|---|---|---|
| AI Insights | "What should I know?" | Briefing deck | Generate, review, refine, pin |
| Ask Pulse | "What can I ask next?" | Answer artifact | Ask, inspect, follow up |
| Dashboard | "What am I looking at?" | Data canvas | Explore, filter, compare, present |

Shared visible elements:

- **Context strip:** Surface, source, filters, freshness, assistant profile, trust state.
- **Trust badge:** Draft, Inferred, Reviewed, or Blocked; never fake "verified".
- **Evidence affordance:** SQL/data/trace visible progressively, not always loud.
- **Action bridge:** AI Insights -> Ask why / Pin chart. Ask Pulse -> Open on Dashboard. Dashboard -> Ask about this view.
- **Mobile compact rule:** Context strip collapses to "Context - Freshness - Trust"; details open in a drawer.

## Template 1 - AI Insights: Briefing Home

Use when no briefing has run yet or setup is incomplete.

Layout:

```text
[Surface switcher]
[Context strip: BI surface | Assistant | Pack | Freshness | Trust]

AI Insights
Generate a briefing over the current data context.

[Briefing presets]
Leadership brief     Risk review     Variance analysis
Operational actions  KPI health       Custom

[What will be included]
Executive brief | KPI snapshot | Trends | Risks | Opportunities | Actions

[Primary] Generate briefing
[Secondary] Adjust sections
[Secondary] Open setup
```

Implementation notes:

- Replace the centered brochure-style empty state in `visual.tsx` with a `BriefingHome` component.
- Keep "Connect AI assistant" and "Browse knowledge packs" when `!isConfigured`, but add a disabled/preview "Generate briefing" target so the user understands the end state.
- Pull labels from current settings: assistant profile, active pack, current surface, and configured sections.
- Do not block AI Insights on BI config. Say "No BI surface connected" as a context state, not a dead end.

Why this matches standards:

- Power BI dashboard guidance starts with audience and most important information.
- Power BI Copilot lets users choose report/page/visual summary and adjust tone/specificity.
- Tableau Pulse centers metrics and proactive insights rather than generic chat.

## Template 2 - AI Insights: Running Brief

Use while generation is active.

Layout:

```text
[Context strip]

Drafting briefing
[Stage timeline: Executive brief - KPI snapshot - Trends - Risks - Actions]

[Skeleton cards in final layout positions]
[Partial result cards appear as soon as complete]

[Stop] [Keep partial briefing] [View trace]
```

Rules:

- Keep the progress card visually attached to the skeleton/result grid.
- Show stage timeline only once; avoid duplicating status in both the header and body.
- Use friendly status copy in the visible UI.
- Put raw connector status behind a details drawer.
- If a run is stopped, preserve completed sections and show missing sections as "Not completed".

Implementation targets:

- `playground/src/pulse/visual.tsx` around the `gn-header-run-state`, `ProgressIndicator`, and `renderInsightsSections` skeleton path.
- `playground/src/pulse/style/visual.less` around `.gn-insights-progress-wrap--header`, `.gn-insights-section--placeholder`, and mobile rules.

## Template 3 - AI Insights: Executive Briefing Deck

Use after a successful run.

Layout:

```text
[Briefing trust header]
Generated 6:41 PM | Source: SalesPerformance | Pack: Retail | Freshness: 20s | Trust: Inferred
[Actions: Copy | Export | Refresh | Ask follow-up]

[Executive summary band]
Headline sentence + top 3 metric deltas

[Section navigator]
Executive | KPI | Trends | Risks | Opportunities | Actions | SQL

[Deck grid]
Executive Brief - full width
KPI Snapshot - KPI tile grid
Trends - chart + explanation
Risks - attention cards
Actions - action cards with status/owner placeholders
Opportunities - optional/full width
Custom sections

[Footer]
Evidence and trace collapsed by default
```

Recommended additions:

- `BriefingTrustHeader`: one row summarizing source, freshness, profile, pack, and trust.
- `BriefingSummaryBand`: compact top row extracted from HEADLINE and KPI SNAPSHOT.
- `SectionNavigator`: sticky within the pane, using buttons/anchors.
- `ActionCard`: action text, expected metric impact if available, "Ask why", "Pin to Dashboard", "Copy".
- `EvidenceDrawer`: one place for SQL, trace, data, and governance, keyed to the active section.

Do not:

- Add another large hero.
- Make every section a nested card inside a card.
- Hide the raw data path; just make it progressive.

## Template 4 - AI Insights: Error and Rate-Limit State

Use when Databricks/connector/rate/timeout failure happens.

Visible copy:

```text
The briefing did not finish.
Databricks rate limit was reached. Try again after about 60 seconds.

[Retry] [Keep completed sections] [View trace]
```

Rules:

- No raw JSON in the main error card.
- Show upstream `request_id`, raw payload, and stack only inside "View trace".
- On mobile, error body must wrap and stay inside the card.
- If some sections completed, use inline warning above preserved sections instead of replacing everything.

Implementation targets:

- `visual.tsx` around `insightsResult.status === "FAILED"`.
- `visual.less` around `.gn-insights-error`, `.gn-insights-error-body`, mobile media queries.
- Add a small helper such as `summarizeInsightsFailure(message, statusCode)` so visible copy is stable and testable.

## Template 5 - Dashboard: Mode-Aware Data Canvas

Dashboard should keep the tab label, but the body should name the current mode.

Modes:

1. **Embedded BI surface:** Power BI/Tableau/Qlik/Looker/Databricks AI/BI iframe or SDK.
2. **Pulse Canvas:** AI-generated chart/table/KPI rendered by `NativeCanvas`.
3. **Empty/setup:** no BI surface and no pinned/generated artifacts.

Top layout:

```text
[Dashboard context strip]
Mode: Embedded BI | Source: Power BI | Workspace: SalesPerformance | Filters: 3 | Freshness: 2m | Trust: governed

[Optional active filter/selection chips]

[Canvas]
Embedded report OR Pulse-generated artifact

[Right/Bottom inspector]
Ask about this view | Open source | Evidence | Data table | Export
```

Key decision:

- Do not rename the top-level tab away from Dashboard now.
- Inside the tab, show a mode chip: "Embedded BI" or "Pulse Canvas".
- Retire visible "BI Viz" copy except where it is a developer/internal identifier.

## Template 6 - Dashboard Empty State

Current empty state is too lonely. Replace it with a mode-aware landing state.

Layout:

```text
Dashboard
Choose what this canvas should show.

[Card] Connect BI surface
Embed Power BI, Tableau, Qlik, Looker, Databricks AI/BI, or generic iframe.
[Open BI settings]

[Card] Show Pulse-generated charts
Ask Pulse can render charts, tables, and KPIs here.
[Ask Pulse]

[Card] Review pinned insights
Pin findings from AI Insights or Ask Pulse into this dashboard.
[Coming soon / View pinned]

Available vendors: ...
```

Notes:

- Use cards only for the three choices; avoid putting the whole page in a card.
- This is not a marketing landing page. It is a setup/workflow picker.
- If AI is configured but BI is not, make "Show Pulse-generated charts" the primary action.
- If BI is configured but no AI is configured, make "Connect BI surface" the primary action.

Implementation targets:

- `playground/src/App.tsx` around `PaneEmptyState` for Dashboard.
- `playground/src/components/PaneEmptyState.tsx` if the current primitive is too restrictive.

## Template 7 - Dashboard Pulse Canvas Artifact

Use when `NativeCanvas` renders an AI-generated result.

Layout:

```text
[Artifact header]
Sales by Region | Chart: bar | Generated from Ask Pulse | Trust: Inferred
[Toolbar: chart type | sort | labels | table | evidence | export | pin]

[Chart/table/KPI area]

[Insight companion]
AI commentary
Source: Databricks / Power BI semantic model
[Ask follow-up] [Open in Ask Pulse]
```

Recommended upgrades:

- Rename visible "AI result accepted" to a user-facing title: "Pulse chart", "KPI result", "Result table", or the question/metric if available.
- Add `NativeCanvasHeader`.
- Add `NativeCanvasToolbar`:
  - Chart type selector where valid.
  - Show data table toggle.
  - Copy image/export data.
  - Evidence/SQL toggle when available.
  - Ask about this chart.
- Add accessible chart summary text adjacent to ECharts.
- Keep `data-testid` and telemetry attributes stable.

Implementation targets:

- `playground/src/visualization/NativeCanvas.tsx`:
  - `EmptyState`
  - `TextState`
  - `TableState`
  - `KpiState`
  - `ChartState`
  - `FusionLayout`
  - `FusionCommentaryCard`
- `playground/src/visualization/chartAutoPick.ts` and related helpers for rationale labels.

## Template 8 - Dashboard Embedded BI Companion Strip

Use when a real BI report is mounted.

Layout:

```text
[Dashboard context strip]
Power BI | SalesPerformance | Page: Sales Performance | Filters: Region = West | Last event: selection

[Embedded BI report]

[Companion actions]
Ask about this view | Generate AI Insights | Capture context | Open settings
```

Rules:

- Do not duplicate the vendor toolbar.
- Do not claim metadata for iframe-only vendors.
- For Power BI SDK, show stronger signals: page, filters, selected visual if available.
- For generic iframe, say "Limited context" and invite manual context.

Implementation targets:

- `playground/src/App.tsx` around `BIPanel`.
- BI event/context bridge code around `handleBIEvent`.
- `playground/src/biPanel/BIAdapter.ts` for future metadata contract display.

## Claude Implementation Plan

### Phase 1: Shared Context and Naming Cleanup

Goal: make the three tabs feel coherent without heavy architecture changes.

Implement:

- Add a shared `SurfaceContextStrip` concept for AI Insights and Dashboard.
- Keep top tab labels: AI Insights, Ask Pulse, Dashboard.
- Standardize Dashboard internal mode labels:
  - `Embedded BI`
  - `Pulse Canvas`
  - `No surface connected`
- Remove visible "BI Viz" copy from user-facing labels where still present.
- Add the same trust/freshness/profile language used in the Ask Pulse brief.

Acceptance:

- Screenshot pass at desktop and mobile shows a context strip on AI Insights and Dashboard.
- No user-facing copy says both "Dashboard" and "BI Viz" for the same control.
- No claim of full context when vendor is iframe-only.

### Phase 2: AI Insights Briefing Deck Polish

Goal: turn the current valuable output into a premium briefing artifact.

Implement:

- `BriefingHome`
- `BriefingTrustHeader`
- `BriefingSummaryBand`
- `SectionNavigator`
- `summarizeInsightsFailure`
- Mobile-safe error wrapping.

Keep:

- Existing stage pipeline.
- Existing card renderer.
- Existing SQL/data/export/provenance functionality.

Acceptance:

- Cold-start screen shows data/assistant context, not just feature copy.
- Successful briefing has a clear trust header and summary band before the section grid.
- Error cards never show raw JSON in the visible body.
- Mobile screenshot has no horizontal overflow.

### Phase 3: Dashboard Empty State and Pulse Canvas Artifact

Goal: make Dashboard understandable before and after a chart exists.

Implement:

- Mode-aware Dashboard empty state in `App.tsx`.
- `NativeCanvasHeader` and artifact toolbar in `NativeCanvas.tsx`.
- Better visible title than "AI result accepted."
- Data table fallback and accessible chart summary for chart mode.
- "Ask about this chart" bridge event or button.

Acceptance:

- Empty Dashboard offers clear choices: connect BI, ask for a Pulse chart, review pinned insights.
- Native chart render shows title, mode, trust, chart type, and a table/evidence path.
- Keyboard users can reach chart controls and read a textual summary.

### Phase 4: Cross-Surface Workflows

Goal: make the three screens operate like one product.

Implement:

- AI Insights section action: "Ask why" opens Ask Pulse with section context.
- AI Insights section action: "Pin to Dashboard" creates a Dashboard artifact card.
- Ask Pulse answer action: "Open on Dashboard" for chart/table/KPI answers.
- Dashboard action: "Generate AI Insights from this view".
- Dashboard action: "Ask about this view".

Acceptance:

- A user can start in any surface and move to the next logical surface in one click.
- Pinned/generated artifacts remain distinguishable from embedded BI reports.
- No vendor iframe claims unsupported deep interactivity.

## Component Targets for Claude

AI Insights:

- `playground/src/pulse/visual.tsx`
  - Header run-state cluster around `gn-header-run-state`
  - Placeholder around `gn-insights-placeholder`
  - Failed state around `insightsResult.status === "FAILED"`
  - Result rendering around `renderInsightsSections(...)`
  - Custom prompt form around `gn-insights-compose`
- `playground/src/pulse/style/visual.less`
  - `.gn-insights-pane`
  - `.gn-insights-placeholder`
  - `.gn-insights-progress-wrap--header`
  - `.gn-insights-sections`
  - `.gn-insights-error`
  - mobile breakpoints near the existing responsive rules
- `playground/src/pulse/visualHelpers.ts`
  - Prompt/mode labels if briefing presets need clearer copy.

Dashboard:

- `playground/src/App.tsx`
  - Dashboard `PaneEmptyState`
  - `BIPanel` canvas branch
  - AI/BI visible mode copy
- `playground/src/visualization/NativeCanvas.tsx`
  - Empty state, title/header, chart/table/KPI states, fusion commentary.
- `playground/src/visualization/*`
  - Chart autopick rationale, render spec validation, accessible text summary.
- `playground/src/biPanel/*`
  - Future metadata/event signals for embedded BI companion strip.

## Visual Design Direction

Use the current restrained enterprise design, but increase craftsmanship:

- Stronger top hierarchy.
- Less dead blank space.
- Fewer floating controls without context.
- Clear cards only for repeated artifacts, not nested page frames.
- 8px or smaller card radii.
- Icon buttons for utility controls.
- Labels where business meaning is not obvious.
- No decorative glass/dark/purple rewrite.
- No gradient-orb backgrounds.
- No new mascot/avatar decoration.

Color:

- Keep blue as the main action color.
- Use green only for reviewed/healthy states.
- Use amber for watch/degraded states.
- Use red only for blocking/failure.
- Do not make the screen one-note blue.

Typography:

- Keep compact dashboard-scale type.
- Use larger type only for executive headline/KPI values.
- Avoid viewport-scaled font sizes.
- Keep text wrapping inside all pills, buttons, cards, and errors.

## Accessibility Checklist

AI Insights:

- Progress updates must have one polite live region, not duplicated announcements.
- Section navigator buttons must have clear focus states.
- Error cards must wrap and be screen-reader understandable.
- SQL/raw-data controls need descriptive labels.
- Do not rely on green/amber/red alone; include text/icon status.

Dashboard:

- Native charts need adjacent text summaries and data table fallback.
- Chart toolbar must be keyboard reachable.
- Canvas controls need visible focus.
- Embedded BI companion strip must not steal focus from iframe unexpectedly.
- Empty-state choices must be buttons/links with proper labels.

## Verification Plan for Claude

Minimum visual checks:

- Desktop 1440x900: AI Insights cold start, running, complete, failure.
- Mobile 412x900: AI Insights cold start, complete, failure.
- Desktop 1440x900: Dashboard empty with no BI/no AI, AI configured/no BI, BI configured/no AI.
- Desktop 1440x900: Native chart, table, KPI, blocked governance state.
- Mobile 412x900: Dashboard empty and native chart.

Minimum tests:

- Focused React/Vitest tests for failure summarization helper.
- Existing insights renderer tests still pass.
- NativeCanvas tests updated for new visible labels without breaking telemetry attrs.
- Accessibility smoke for no horizontal overflow and focusable controls.

Do not call the redesign complete until screenshots prove:

- No raw JSON leaks into visible AI Insights errors.
- Dashboard clearly states whether it is Embedded BI or Pulse Canvas.
- The first viewport of each tab has a useful action or artifact above the fold.
- Text does not overflow on mobile.

## What Not To Build First

- Do not build a new top-level "Workbench" route before these surfaces are coherent.
- Do not replace the vendor BI iframe/SDK surface with a custom dashboard clone.
- Do not add a decorative hero or marketing page.
- Do not add fake filters, fake refresh times, fake verified badges, or fake source metadata.
- Do not start with a theme rewrite.
- Do not make Dashboard a dumping ground for every AI output. Start with one pinned/generated artifact grammar.

## Best Next Slice

The best next build is **Phase 1 plus Phase 2 for AI Insights**, then **Phase 3 for Dashboard**.

Reason:

- AI Insights already has rich functionality; polishing it gives fast visible value.
- Dashboard needs clearer identity before deeper controls.
- Shared context/trust grammar should land before cross-surface pinning.

Concrete first pull request for Claude:

1. Add `SurfaceContextStrip` for AI Insights and Dashboard.
2. Add `BriefingTrustHeader`, `BriefingSummaryBand`, and `SectionNavigator` to AI Insights.
3. Replace raw visible AI Insights error text with `summarizeInsightsFailure`.
4. Update Dashboard empty state to present Embedded BI vs Pulse Canvas modes.
5. Rename visible "AI result accepted" in NativeCanvas to artifact-specific labels.

That will make the product feel more intentional immediately without risky connector or backend changes.
