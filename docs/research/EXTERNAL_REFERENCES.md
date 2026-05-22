# PulsePlay — External References (signed)

> **Purpose.** A single, living catalogue of every web source the research-first workflow has consulted. Every entry carries a URL (the **signature**) so future sessions can re-verify or chase the source. Append-only — never reorder or remove entries.
>
> **Rule that produced this doc.** `feedback_research_first.md` — *"spawn multiple research agents to do check for more detailed reference and then we will brainstorm and resume the work"* + *"for above spawn agents for both online and offline assessment and review"*. Online-track agents accumulate web findings here; offline-track findings live elsewhere (code archaeology in `docs/research/<topic>_<date>.md`, screenshots in `D:\Working_Folder\Artifacts\Pulse_ref\`).
>
> **How to add entries.** When an agent returns web findings: append a section at the bottom with date header, topic, and one entry per source (URL · title · one-line takeaway · where applied). Don't merge with prior entries — even duplicate URLs go in again if a new context cites them, so the chain of consultation is auditable.

---

## Topic index (newest first)

- [2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)](#2026-05-22--executive-briefing-card-patterns-ask-pulse-narrative-regression)
- [2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)](#2026-05-22--chart-rationale-popover-design-data-shape-aware-narrative--warnings)

---

## 2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)

**Context.** Ask Pulse on the deployed Databricks App was rendering executive briefings ("Summarize current performance...") with broken alignment — labels far left, content slammed far right (classic `flex justify-between` accident). Two research agents ran in parallel: industry-standard executive-briefing layouts + design-system component references. The recommended path (option 1: full card with tabs-always-show) was approved by user.

### Industry best-practice patterns

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm | Tableau Pulse — Insights Platform | One composite card with internal sections; KPI strip on top + stacked AI-narrative sections below. Direct competitor pattern. | Briefing card structure decision |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | Power BI ships the AI narrative inside a single visual container with internal formatting; no per-section split. | Confirms single-card pattern |
| https://carbondesignsystem.com/patterns/status-indicator-pattern/ | Carbon Design System — Status Indicator Pattern | Red = critical, orange = threshold breached, yellow = non-service-affecting warning, green = success. Pairs colour with directional symbols for a11y. | Colour semantics for risk/opportunity/recent-change |
| https://carbondesignsystem.com/components/notification/style/ | Carbon Design System — Notification Style | Inline notification = coloured left accent strip + neutral bg (alt to tinted-bg pattern). | Border-treatment alternate pattern |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — KPI Card Best Practices | Pair colour with directional arrows/icons so signal survives colour-blindness. Specific KPI-card layout numbers. | KPI tile structure + a11y rationale |
| https://www.datawrapper.de/blog/text-in-data-visualizations | Datawrapper — Text in Data Visualizations | Labels must sit "as close to the elements they explain as possible." The two-column label-left/content-right-aligned pattern is the canonical anti-pattern for narrative content. | Justification for replacing flex with grid; never use `space-between` |
| https://medium.com/eightshapes-llc/cards-and-composability-in-design-systems-8845ecbee50e | Eight Shapes — Cards and Composability | Card-as-stacked-container pattern: media/header > title > body > actions. Industry convention. | Card-internal section ordering |
| https://m1.material.io/components/cards.html | Material Design — Cards | Foundational stacking pattern; 16-24px padding; rounded corners; subtle shadow. | Outer card sizing |
| https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns | Stan.vision — UI Card Design Patterns | Body text ≥16px for accessibility; standard padding numbers (24px outer, 16px section gaps). | Typography sizing decision |

### Design-system component references

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/alert | shadcn/ui — Alert | Uses **CSS grid** (`grid-cols-[auto_1fr]`), NOT flex. 16px padding × 12px vertical, 8px radius, 16px icon, 12px icon→text gap. The single biggest layout fix. | Replaces broken `.gn-kpi-row` flex pattern |
| https://ant.design/components/alert/ | Ant Design — Alert | Hex palette: info #e6f4ff/#91caff · success #f6ffed/#b7eb8f · warning #fffbe6/#ffe58f · danger #fff2f0/#ffccc7. Tinted bg + 1px coloured border. | Section bg/border palette |
| https://www.tremor.so/docs/ui/card | Tremor — Card | KPI tile spec: `rounded-lg border p-6 shadow-xs` (24px internal padding). | KPI tile sizing |
| https://tailwindcss.com/plus/ui-blocks/application-ui/data-display/stats | Tailwind UI — Stats / KPI blocks | KPI strip pattern: label (sm muted) over big metric (text-3xl bold), inline directional arrow + delta, prior period in parens text-muted sm. | KPI tile content layout |
| https://refine.dev/blog/material-ui-card/ | Refine — MUI Card spec | Standardised padding numbers (24px outer, 16-20px section gaps, 8px icon→label). | Spacing tokens |
| https://www.figma.com/community/file/879668624364329411/insight-cards | Figma community — Insight Cards | Concrete Figma template with full insight-card dimensions + variants. | Design reference; download for finer specs if needed |
| https://www.figma.com/community/file/1130917765288346079/kpi-charts | Figma community — KPI Charts | Figma template for KPI-with-trend cards. | KPI tile visual reference |
| https://impeccable.style/antipattern-examples/thick-border-cards | Impeccable Style — Thick Border Cards anti-pattern | 8px+ accent stripes are an anti-pattern; 4px max for left-border accents. | Constrains border width |

### Synthesis takeaway

- **Layout primitive:** CSS Grid `grid-cols-[auto_1fr]`, never `flex justify-between` for label+content rows.
- **Structure:** Single composite card; sections stacked vertically (KPI strip → headline → risk → opportunity → recent change → action); 16-20px between sections.
- **Colour palette (final hex):** Risk amber/red bg + border (`#fffbe6/#ffe58f` or `#fff2f0/#ffccc7`); Opportunity `#f6ffed/#b7eb8f`; Recent change `#e6f4ff/#91caff`; Action filled `#1a6fd4` solid + white text.
- **Icons:** 16px Lucide-style (`alert-triangle`, `trending-up`, `activity`, `arrow-right`), 8px gap to label.
- **Typography:** Section labels 12-13px uppercase 600 weight; body 14-16px; KPI primary 28-32px 700 weight.
- **Padding:** Outer card 24px; section gaps 16-20px; icon→label 8px; label→body 4-6px.

---

## 2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)

**Context.** Earlier same-day session shipped the "Why did we pick this chart?" popover upgrade (commit `d81ef08`). Online research covered competitor patterns + design-system tooltip-popover conventions + Figma component shapes. The full detail is preserved in commit `d81ef08`'s diff + the `docs/research/DWD_FOR_BI_DEEP_SCAN_2026-05-22.md` offline component. Sources retroactively logged here for future re-verification.

### Industry best-practice patterns (chart rationale / "why this chart")

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.tableau.com/visualization/data-visualization-best-practices | Tableau — Data Visualization Best Practices | Auto-pick rationale must explain chart choice in user's data terms, not just rule names. | Personalised narrative ("Your data has X rows and Y numeric columns...") |
| https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-q-and-a-explorer | Power BI Q&A Explorer | Chart suggestions surface alongside the chart itself with a brief why. | Popover anchor pattern (button next to chart, not separate panel) |
| https://cloud.google.com/looker/docs/best-practices/dashboard-design | Looker — Dashboard Design Best Practices | Warning when chart shape doesn't match data shape (mixed units, mixed signs, donut with negatives). | 8 warning templates in `generateWarnings()` |
| https://material.io/components/tooltips/web | Material Design — Tooltips (Web) | Tooltip-popover card sizing: 320-340px width, soft shadow, 12-14px body. | ChartRationalePill popover sizing |
| https://www.untitledui.com/components/alerts | Untitled UI — Alert Components | Severity-coded card with coloured left border + icon + title + body + suggested action. | Warning card structure (info/caution/warning palette) |

### Design-system component references (chart rationale)

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/tooltip | shadcn/ui — Tooltip | Anchor + 6px gap + soft shadow; click-to-pin pattern (hover for ephemeral, click for sticky). | ChartRationalePill open/close behaviour |
| https://ant.design/components/popover/ | Ant Design — Popover | `below-left` and `below-right` placements; auto-flip when clipped. | `popoverPlacement` prop in ChartRationalePill |
| https://m3.material.io/styles/color/the-color-system/color-roles | Material 3 — Color Roles | `errorContainer` / `secondaryContainer` token usage for warning bands. | Warning palette CSS vars (`--pp-caution-bg`, `--pp-warning-bg`) |

### Synthesis takeaway (chart rationale session)

- Speak about the AUTO-pick, never the user override (anti-pattern: "you picked X, we'd pick Y" framing).
- Sourced narrative: short narrative + sibling alternatives + structured warnings + "avoid for this shape" KB rule.
- Severity-coded warning cards (info=blue, caution=amber, warning=red), left-border + icon + title + body + optional "Try:" suggestion.

---

## How to extend this doc

When a research agent returns web findings:
1. **Don't replace** existing entries — append a new dated section at the bottom.
2. **One row per URL.** If two agents cited the same URL in the same session, list it once in this doc but note both contexts.
3. **Include a takeaway sentence** — future sessions need to know *why* this URL mattered without re-reading the source.
4. **Cross-link to where it was applied** — commit SHA, design proposal file, or feature memory.
5. **Update the topic index** at the top.

If a URL turns out to be dead, broken, or wrong, add a `*[verified-dead 2026-MM-DD]*` annotation but do not remove — the dead URL is itself evidence.
