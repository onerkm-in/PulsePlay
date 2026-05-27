# Ask Pulse UI/UX Deep Research and Claude Handoff

Date: 2026-05-27

Purpose: give Claude a current, implementation-ready design brief for making the Ask Pulse screen feel more modern, premium, and useful without turning it into a flashy generic chatbot. This supersedes the parts of the earlier mockup notes that still point at the retired `AISidebar.tsx` file or recommend a full dark/glass visual rewrite.

## Executive Verdict

Ask Pulse is already structurally strong: it has a data identity home, starter questions, a sticky composer, slash-command autocomplete, response view tabs, progress/stop states, chart/table/SQL views, feedback, copy/export actions, and Databricks trace transparency.

What is missing is not "more chrome." The gap versus modern AI chat screens is:

1. The screen does not make its active data context, grounding, source freshness, and permissions visible enough before the user asks.
2. The response area is still a chat bubble with tabs, not a durable "answer artifact" that users can inspect, pin, export, and defend.
3. Starters and slash commands exist, but they feel hidden or plain; they should become a guided business command surface.
4. Trust is fragmented across disclaimer text, route metadata, hidden confidence panels, traces, and provenance footers.
5. Accessibility for the slash-command dropdown should be upgraded to a real combobox/listbox pattern.
6. The current screen is clean but spatially underdesigned: too much empty canvas on first view, weak hierarchy around "what can I do now?", and inconsistent answer-card grammar.

The design direction: make Ask Pulse a "Dialogue with Data Workbench." It should stay quiet, enterprise, and data-first, but feel crafted: confident context, strong input affordances, structured answer artifacts, visible verification, and one-click next actions.

## Sources Reviewed

External standards and product patterns:

- Microsoft HAX Guidelines: evidence-based human-AI interaction guidance across initial interaction, normal use, errors, and long-term behavior. https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
- Microsoft Fluent Responsible AI: set expectations, prevent overreliance, keep users in control, collect feedback, and make reasoning/verifiability visible. https://fluent2.microsoft.design/responsible-AI
- Microsoft Fluent Handoffs: AI chat outputs may become rich artifacts, entities, or side-by-side views, with intent-based handoffs and short system messages. https://fluent2.microsoft.design/handoffs
- IBM Carbon for AI: AI UI needs a recognizable AI label, explainability path, and tokens that coexist with the host design system. https://carbondesignsystem.com/guidelines/carbon-for-ai/
- Atlassian AI interaction guidelines: proactive context use, flow preservation, dynamic content/forms, subtle branded cues. https://atlassian.design/patterns/ai-interaction-guidelines
- OpenAI Canvas: complex work should move beyond plain chat into side-by-side editable context with shortcuts and targeted revisions. https://openai.com/index/introducing-canvas/
- ChatGPT Projects: modern chat uses a project/context hub with files, instructions, tools, search/citations, and shareable continuity. https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- Claude Artifacts: complex standalone content appears in a dedicated right-side window with view/copy/download and error-fix affordances. https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Databricks Genie docs: dashboard companion spaces, sample questions, SQL-backed benchmarking, and "marked for review" when no SQL answer exists. https://docs.databricks.com/aws/en/genie and https://docs.databricks.com/aws/en/genie/set-up
- WAI-ARIA Combobox pattern: editable autocomplete popups need correct keyboard support and ARIA relationships. https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- WCAG 2.2 updates: focus indicators, non-drag alternatives, and target sizing matter for dense command surfaces. https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

Local evidence and code reviewed:

- Current Ask Pulse screenshot: `docs/evidence/ui-snapshot-2026-05-26/02-ask-pulse-tab.png`
- Completed answer screenshot: `docs/evidence/ask-pulse-end-user-2026-05-26/001-APQ-001-ok.png`
- Current active Pulse Ask screen: `playground/src/pulse/visual.tsx`
- Current Pulse Ask styles: `playground/src/pulse/style/visual.less`
- Modern-but-not-current sidebar surface: `playground/src/components/UnifiedAssistantSurface.tsx`
- Strategic preset library: `playground/src/pulse/insightsPresetLibrary.ts`
- Markdown/metric table renderer: `playground/src/lib/renderMarkdown.tsx`

## Current Screen Inventory

### What Is Already Good

- Data-first empty state exists through `WelcomeSection` and `useAskPulseHomeMeta`.
- Starter questions are data-shaped when `/assistant/home-meta` returns curated questions.
- Composer is sticky and now survives tall answer/chart cases.
- Slash commands already exist in the active Pulse surface at `playground/src/pulse/visual.tsx`, around the composer block.
- Progress states are honest: running messages show stages, elapsed time, Stop, raw Databricks status, and trace details.
- Completed answers support Narrative / Chart / Table / SQL tabs.
- Narrative table duplication was addressed by stripping markdown tables when a structured Table tab exists.
- Feedback, copy, CSV download, rerun, SQL view, breadcrumbs, DML warnings, and clarifier chips all exist.
- Metric direction rules are already wired into markdown/table rendering in several paths.

### Brutal-Honest Gaps

1. **Context is too hidden.** The user sees dataset title and description on empty state, but not a compact "what will Ask Pulse use?" bar: active report, connector profile, pack, filters, data freshness, row/measure availability, permission scope.
2. **Trust is scattered.** The screen has a disclaimer and some route/source details, but it lacks a consistent per-answer trust header like "Grounded in SalesPerformance, DAX verified, 7,532 rows, static TMDL metadata, generated 12:43."
3. **Response cards are not yet artifacts.** Chart/Table/SQL tabs are useful, but the answer does not feel like a durable artifact the user can pin, inspect, export, or compare.
4. **Starter prompts are not aspirational enough.** The current vertical list is clean, but it does not sell the product's intelligence. It should show families of work: Explain, Diagnose, Compare, Forecast, Segment, Prepare Executive Readout.
5. **Slash commands are useful but hidden.** Users only discover them if they know to type `/`. They need a small command launcher affordance in the composer plus a "Try /swot" inline hint.
6. **No parameter sheet for strategic presets.** `CUSTOM_SECTION_PRESETS` already has typed params and sanitization, but Ask Pulse does not expose those controls in the conversation flow.
7. **Current slash dropdown is not a complete ARIA combobox.** It renders a listbox, but the textbox does not expose `aria-expanded`, `aria-controls`, or `aria-activedescendant`; keyboard handling should avoid interfering with normal text editing.
8. **The home screen still has "blank-page" energy.** The 2026-05-26 screenshot has a polished top nav and composer, but the central area reads sparse, not premium.
9. **History is secondary and unsearchable.** "Show history" is useful but small and detached; modern chat screens treat threads/history as a continuation surface.
10. **Claude-target docs were partially stale.** Prior docs mention `AISidebar.tsx`; the real active Ask Pulse implementation is in `playground/src/pulse/visual.tsx`, while `UnifiedAssistantSurface.tsx` is a separate modern surface that still needs parity later.

## Design Principles for Ask Pulse

1. **Dashing means defensible.** Use premium hierarchy, motion, and depth only to make answers easier to trust and act on. Avoid decorative glass/dark-mode spectacle.
2. **Data context before AI personality.** The first screen must answer: what data, what profile, what scope, what can I ask?
3. **Chat plus artifact, not chat alone.** Any answer with chart/table/SQL/evidence should become a structured artifact card with clear controls.
4. **Progressive disclosure.** Default view: answer and decision. One click deeper: chart/table/evidence. Another click: SQL/trace/validation.
5. **No fake certainty.** Show "verified", "grounded draft", "needs review", or "blocked" only when code can support that status.
6. **Keep the flow.** Controls should live where the user is already acting: starter question, composer, answer card, artifact toolbar.
7. **One visual language.** Reuse existing `gn-*` style vocabulary for the active Pulse screen. Port reusable helpers to `UnifiedAssistantSurface` later.

## Flexible Templates

### Template A: Data Dialogue Home

Use when Ask Pulse has no messages.

Layout:

```text
[Surface tabs: AI Insights | Ask Pulse | Dashboard]                  [toolbar]

Ask Pulse
Connected to: SalesPerformance     Profile: powerbi-dwd     Pack: CPG/FMCG
Scope: current dashboard + static semantic model metadata     Freshness: local probe

What do you want to do?

[Explain performance]     [Find drivers]         [Compare slices]
[Spot risk]               [Segment customers]    [Build executive readout]

Suggested for this data
1. Which Region x Category combinations grew sales but lost margin?
2. What drove the largest discount sensitivity?
3. Which segments are profitable growth candidates?

[composer: Ask a question...                         / Commands  Send]
```

Implementation notes:

- Keep the existing centered data identity, but add a compact `gn-ask-context-strip` above the starter matrix.
- Replace the single vertical starter list with grouped starter cards on desktop and a vertical grouped list on mobile.
- Keep "Always review accuracy", but attach it to the trust/context strip instead of leaving it as a lonely footer line.
- Use exact labels from `homeMeta.displayName`, `homeMeta.description`, `props.settings.assistantProfile`, pack selection, and active vendor/profile where available.

### Template B: Answer Artifact Card

Use for every completed assistant answer.

Layout:

```text
[User bubble]

[Answer Card]
Header:
  Answer title or generated short summary
  [Verified | Grounded draft | Needs review | Blocked]
  Source: SalesPerformance   Rows: 7,532   Generated: 12:43   Profile: powerbi-dwd

Tabs:
  Answer | Chart | Table | SQL | Evidence | Trace

Body:
  Short answer first.
  Then structured sections/cards only when the answer has real sections.

Footer:
  [Copy] [Download CSV] [Rerun] [View SQL] [Pin] [Open in Dashboard/BI if available]
  Feedback: [Helpful] [Not helpful] [Report issue]

Follow-ups:
  Try: "Show by Region", "Explain discount impact", "Export table"
```

Implementation notes:

- Do not nest cards inside cards. The answer card is the card; tabs and bodies are internal panels.
- Promote current `gn-msg-actions` to a clearer artifact toolbar with consistent icon buttons and tooltips.
- Keep current `Narrative | Chart | Table | Sql` views, but rename `Sql` to `SQL`.
- Add optional Evidence tab only when evidence/provenance/validation exists. Do not show empty tabs.
- Add `Pin` only if there is actual state to retain pinned artifacts, or hide it until implemented.
- Trust status should be computed from existing fields:
  - `Verified`: deterministic DAX/SQL answer with query result and no validation failure.
  - `Grounded draft`: answer has data context but no deterministic validation.
  - `Needs review`: no SQL/query result for a quantitative question, partial source failure, or explicit upstream review marker.
  - `Blocked`: governance, permission, DML, safety, or validation block.

### Template C: Guided Command Composer

Use inside the sticky composer.

Layout:

```text
[textarea: Ask a question about your data...]
[mode chips: Explain | Diagnose | Compare | Forecast | Segment | Executive]
[command button: /] [adjust button when command has params] [send]
```

Slash dropdown:

```text
Analytical commands
/swot        Quantified strengths, weaknesses, opportunities, threats
/bcg         Growth-share matrix
/rfm         Customer segmentation
/pareto      Concentration and vital few
/variance    Waterfall / bridge drivers
```

Parameter sheet:

```text
SWOT parameters
Healthy margin floor      [15%]
Weak margin ceiling       [5%]
High-growth threshold     [20%]
Threat materiality        [$] [5000]
[Apply to prompt] [Reset defaults]
```

Implementation notes:

- Source command definitions from `CUSTOM_SECTION_PRESETS` instead of duplicating the hardcoded local list forever.
- Use `defaultParamValues`, `sanitizeParamValue`, and `interpolatePreset` from `insightsPresetLibrary.ts`.
- Do not inject hidden magic. When a command is selected, show a visible chip in the composer: `SWOT analysis`.
- The command should produce a request preamble such as:

```text
[Selected analysis frame]
- Preset: SWOT analysis (swot-analysis)
- Params:
  - marginGreenPct: 15
  - materialityThreshold: 5000

[Response structure contract]
## STRENGTHS
...
```

- Make the slash dropdown a real accessible autocomplete:
  - textarea or wrapper has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and `aria-autocomplete="list"`.
  - listbox options have stable ids.
  - `Escape` closes.
  - Arrow keys move active option only while dropdown is open.
  - Standard text editing keys remain browser-owned.

### Template D: Verified Workbench Mode

Use for complex answers that return charts, tables, SQL, or multiple sections.

Layout:

```text
Left: conversation stream
Right or inline-expanded: selected artifact

Artifact:
  [Chart/table title]
  [Chart]
  [Data summary]
  [SQL/evidence collapsed]
  [Export/copy/open]
```

Implementation notes:

- Do not make this the default first screen.
- Start as an inline expanded answer-card mode, then graduate to the existing Workbench route once its theme is ready.
- This follows the modern Canvas/Artifacts pattern: chat stays conversational, but complex output gets a stable working surface.

### Template E: Mobile Compact Mode

Use below tablet width or short viewport height.

Rules:

- Context strip collapses into one disclosure: `SalesPerformance / powerbi-dwd / CPG-FMCG`.
- Starter categories become a vertical list.
- Composer stays sticky and maxes at two text rows before internal scroll.
- Answer artifact tabs become a horizontal scroll segment.
- Footer actions collapse into a `More` menu after the first two actions.
- No hover-only affordances.

## Claude Implementation Plan

### Phase 1: Low-Risk Visual and Trust Upgrade

Target files:

- `playground/src/pulse/visual.tsx`
- `playground/src/pulse/style/visual.less`
- relevant tests under `playground/src/pulse/__tests__` or existing screenshot harnesses

Tasks:

1. Add `AskContextStrip` above the empty-state starters and compactly above the first active answer.
2. Replace empty-state starter rows with grouped data-action cards on desktop, preserving the vertical list on mobile.
3. Add `AnswerTrustHeader` inside assistant bubbles for completed messages.
4. Rename `Sql` tab label to `SQL`.
5. Improve `gn-msg-actions` into a stable artifact toolbar with clear icon buttons, labels via tooltips, and no duplicate "Copy answer" affordance.

Acceptance:

- No horizontal overflow at 390, 768, 1440 px.
- Composer remains visible after long answers and chart/table toggles.
- Empty state has less blank-page energy and more obvious "what can I do?" hierarchy.
- Trust header never claims verification unless there is query/result evidence.

### Phase 2: Strategic Command Composer

Target files:

- `playground/src/pulse/visual.tsx`
- `playground/src/pulse/insightsPresetLibrary.ts`
- `playground/src/pulse/visualHelpers.ts` if prompt construction needs shared helpers
- tests for preset interpolation and slash command behavior

Tasks:

1. Replace the local `SLASH_PRESETS` list with a derived list from `CUSTOM_SECTION_PRESETS`, plus aliases `/swot`, `/bcg`, `/rfm`, `/pareto`, `/variance`, `/anomaly`.
2. Add a visible command button in the composer that opens the same dropdown.
3. Add ARIA combobox/listbox wiring.
4. Add a small parameter sheet for presets with `params`.
5. Inject the selected preset contract into the Ask Pulse request in a visible and auditable way.

Acceptance:

- `/swot`, arrow down, enter inserts the SWOT command without submitting.
- The dropdown can be closed with Escape.
- Parameter values are sanitized and defaults are restored when invalid.
- Request content includes selected preset and resolved params.
- Existing non-command chat behavior is unchanged.

### Phase 3: Answer Artifact and Evidence Tabs

Target files:

- `playground/src/pulse/visual.tsx`
- `playground/src/pulse/style/visual.less`
- possibly `playground/src/components/TrustBadge.tsx` if sharing status UI makes sense

Tasks:

1. Add `Evidence` as an available view when provenance, breadcrumbs, validation, route metadata, trace, or query source details exist.
2. Move route metadata, breadcrumbs, partial-source banners, validation, and raw status into a cleaner evidence panel.
3. Add optional pinned-artifact state only if the product wants "save this answer" in-session.
4. Add a "Needs review" status when no SQL/query result exists for a quantitative prompt, matching Databricks benchmark language.

Acceptance:

- Narrative stays short and readable.
- Evidence is available without forcing SQL/trace into the default answer.
- Partial-source and blocked states are impossible to miss.
- Export/copy actions remain accessible by keyboard.

### Phase 4: Unified Surface Parity

Target files:

- `playground/src/components/UnifiedAssistantSurface.tsx`
- `playground/src/components/SectionedAnswer.tsx`
- `playground/src/styles.css`

Tasks:

1. Port only the stable helper concepts after the Pulse surface works.
2. Do not duplicate business logic; extract shared command/preset helpers if needed.
3. Keep `UnifiedAssistantSurface` feature-flag behavior intact.

## Design Acceptance Checklist

- Data context is visible at the point of asking.
- Starter prompts teach capabilities without becoming a marketing panel.
- Composer supports freeform, slash command, and parameterized analytical presets.
- Every completed answer has a trust state.
- Every nontrivial answer can reveal evidence, data, SQL, and trace progressively.
- No hover-only critical controls.
- No fake confidence score.
- No card inside card.
- No decorative orbs/blobs/glass overhaul.
- Works in light, dark, compact, and short-height viewports.
- Meets keyboard expectations for command dropdown and tabs.
- Keeps existing PulsePlay 2-axis abstraction: BI vendor and AI connector remain independent.

## Verification Plan for Claude

Run after implementation:

```powershell
cd D:\Working_Folder\Projects\PulsePlay\playground
npm run lint
npm run test
```

Add or update focused tests for:

- Slash command filtering and keyboard behavior.
- Preset param defaulting/sanitization/interpolation.
- Trust status derivation from message shapes.
- Empty-state starter rendering.
- Composer remains visible after long messages.

Run headed visual smoke if possible:

```powershell
cd D:\Working_Folder\Projects\PulsePlay\playground
node scripts/probe-current-ui-snapshot.mjs
node scripts/probe-ask-pulse-default-vs-v0.mjs
```

Manual visual checks:

- Desktop 1440 x 900: first viewport looks purposeful, not sparse.
- Laptop 1366 x 768: composer visible, no hidden send button.
- Mobile 390 x 844: no horizontal overflow, starter groups stack, answer tabs scroll.
- Short height 900 x 420: composer remains reachable.

## Final Recommendation

The best next build is Phase 1 plus Phase 2. That gives the screen the biggest visible lift without risky architecture churn: context strip, grouped starters, per-answer trust header, cleaner artifact toolbar, accessible slash commands, and parameterized strategic presets.

Do not start with a new workbench route or a dark-mode redesign. Ask Pulse already has a good foundation. Make it feel inevitable: the user should know what data is active, what the assistant can do, what it used, why the answer can be trusted, and what to do next.
