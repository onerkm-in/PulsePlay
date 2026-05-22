# PulsePlay — External References (signed)

> **Purpose.** A single, living catalogue of every web source the research-first workflow has consulted. Every entry carries a URL (the **signature**) so future sessions can re-verify or chase the source. Append-only — never reorder or remove entries.
>
> **Rule that produced this doc.** `feedback_research_first.md` — *"spawn multiple research agents to do check for more detailed reference and then we will brainstorm and resume the work"* + *"for above spawn agents for both online and offline assessment and review"*. Online-track agents accumulate web findings here; offline-track findings live elsewhere (code archaeology in `docs/research/<topic>_<date>.md`, screenshots in `D:\Working_Folder\Artifacts\Pulse_ref\`).
>
> **How to add entries.** When an agent returns web findings: append a section at the bottom with date header, topic, and one entry per source (URL · title · one-line takeaway · where applied). Don't merge with prior entries — even duplicate URLs go in again if a new context cites them, so the chain of consultation is auditable.

---

## Topic index (newest first)

- [2026-05-22 — Chart axis label humanization + value formatting (G2)](#2026-05-22--chart-axis-label-humanization--value-formatting-g2)
- [2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)](#2026-05-22--auto-route-vs-click-to-switch-when-chart-shape-is-wrong-g4)
- [2026-05-22 — Azure Databricks Apps enterprise installation guide](#2026-05-22--azure-databricks-apps-enterprise-installation-guide)
- [2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)](#2026-05-22--executive-briefing-card-patterns-ask-pulse-narrative-regression)
- [2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)](#2026-05-22--chart-rationale-popover-design-data-shape-aware-narrative--warnings)

---

## 2026-05-22 — Chart axis label humanization + value formatting (G2)

**Context.** Ask Pulse Chart tab renders raw SQL column names like `prev_order_count`, `sales_change_pct`, `margin_change_pp` in legends + axes; values display as raw floats (`0.05747126436781609`). Most of these are Genie-invented SQL aliases (not stable DB columns), so backend-only solutions don't fully cover the case. Research scope: industry humanization conventions + value formatting per unit type.

### Industry humanization + formatting sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm | Tableau — Field Type Detection and Naming Improvements | Auto-converts underscores to spaces + Title Case; force-uppercases short letter-only tokens (`QTY`). Tableau-style: don't expand prefixes you can't prove. | Algorithmic fallback (tier 3) — snake_case → Title Case |
| https://docs.thoughtspot.com/cloud/10.8.0.cl/worksheets | ThoughtSpot Cloud — Worksheets | Automatic Title Case + underscore replacement on column add. Also auto-generates synonyms for NL search. | Synonym layer (future enhancement) |
| https://cloud.google.com/looker/docs/reference/param-field-label | Looker — `label` for fields | First-class label/synonym field on every column; defaults to field name if author hasn't supplied one. Labels are authorial, not algorithmic. | Backend (UC comment) path |
| https://tabulareditor.com/blog/naming-conventions-for-power-bi-semantic-models | Tabular Editor — Naming Conventions for Power BI Semantic Models | Recommended pattern: `<Metric> <Modifier> <Unit?>` (e.g. "Sales YoY Change", "Gross Margin %"). Modifier first, unit last. | Registry entries for `_yoy`/`_qoq`/`_change`/`_pct` |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced | Microsoft Learn — Edit Q&A Linguistic Schema | Power BI Q&A uses a linguistic schema (synonyms + labels) authored alongside the model. | Backend semantic-model parallel path |
| https://docs.sqlbi.com/dax-style/dax-naming-conventions | SQLBI — DAX Naming Conventions | YoY/QoQ/MoM/WoW/YTD/QTD/MTD as standard recognized acronyms — preserve casing. | Registry casing rules |
| https://service-manual.ons.gov.uk/content/numbers/percentages | ONS Service Manual — Percentages and Percentage Points | "Percentage points" in narrative; " pp" compressed for chart labels. Always show unit somewhere. | Value formatter for `_pp` suffix |
| https://www.datawrapper.de/academy/custom-number-formats-that-you-can-display-in-datawrapper | Datawrapper — Custom Number Formats | `0.0%` for percent, `$0,0.[00]a` for abbreviated currency, `123.4k` for big counts. Always show the unit. | Value formatter targets |
| https://d3js.org/d3-format | D3 — d3-format spec | De-facto standard for format-spec mini-language; ECharts wraps similar conventions in `formatter`. | Format string syntax for `axisLabel.formatter` |
| https://docs.getdbt.com/best-practices/how-we-style/1-how-we-style-our-dbt-models | dbt — How we style our dbt models | Friendly form in `meta:` / `description:` YAML; BI layer reads it. | Long-term backend parallel path |

### Synthesis takeaway

- **Three-tier cascade**: (1) Registry of common analytics tokens (`prev → Prior`, `pct → %`, `yoy → YoY`, `cnt → Count`, `amt → Amount`, `pp → pp`) — deterministic, audit-friendly, zero LLM cost. (2) LLM-emitted `columnLabels: { raw: friendly }` map — opt-in, validator-gated. (3) Algorithmic snake → Title Case fallback — guarantees no raw `prev_order_count` ever displays.
- **Value formatting per unit** keyed off the same suffix registry: `_pct/_rate` → d3 `.1%` (`0.057 → 5.7%`); `_pp` → `+.1f pp`; `_amt/_revenue/_cost` → `$,.0f` with SI prefix on axes; `_count/_qty/_cnt` → `,.0f`.
- **Gold mine**: PulsePlay's `chartAutoPick.ts` already has `detectColumnUnit()` + `UNIT_LABELS` from the chart-rationale upgrade. Currently only used in popover text; needs wiring into `buildEChartsOption.ts` axis + tooltip formatters.
- **Brutal-honesty caveat**: Without a semantic model, PulsePlay cannot perfectly distinguish `_change` (delta) from `_change_pct` (ratio) from `_change_pp` (already in percentage points). Registry MUST encode all three explicitly; ambiguous columns get a no-transform passthrough rather than a wrong guess.

---

## 2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)

**Context.** Ask Pulse chart-rationale popover currently emits informational warnings like "Only 1 row of data — KPI tile shows the value more clearly. Try: KPI tile" but offers no clickable action. The question: silent auto-route to suggested view, OR add a one-click button? Research scope: industry conventions + UX research on auto-switching trust.

### Industry chart-suggestion sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm | Tableau — Use Show Me to Start a View | "Show Me doesn't automatically switch chart types when data changes." Highlights suggested chart in orange outline; user clicks to apply. | Decision against auto-route |
| https://docs.thoughtspot.com/6.0/end-user/search/lock-chart-type.html | ThoughtSpot — Disable automatic selection of chart type | Auto-picks "best fit" on FIRST render only; explicit lock once user overrides. "Disable automatically select my chart" setting. | Stickiness pattern (session-scoped, not cross-session) |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | "Try: KPI card" surfaces as text/button in Copilot pane; never silently swaps a visual. | Click-to-switch button pattern |
| https://support.google.com/looker-studio/faq/7219787 | Looker Studio Troubleshooting (data shape mismatch) | Shows error empty state on mismatch; user picks from chart catalog manually. No auto-suggest button in the warning. | Confirms "user picks, not the system" |
| https://vizml.media.mit.edu/assets/2019-VizML-CHI.pdf | VizML (CHI 2019) — ML Approach to Visualization Recommendation | Academic — ML-based viz recommendation; emphasizes the human-in-the-loop principle for AI-suggested charts. | Justification for keeping user in control |
| https://idl.cs.washington.edu/files/2023-Draco2-VIS.pdf | Draco 2 — Extensible Platform to Model Visualization Design | Modeling viz design; same principle of suggest-then-apply. | Theoretical backing |
| https://blog.logrocket.com/ux-design/user-preference-settings-ai-powered-designs | LogRocket — How much choice should we give users in AI-powered designs? | "UX designers should offer ways to override or adjust AI-predicted user interactions." | Override-ability is a user right |
| https://docs.thoughtspot.com/software/10.1.0.sw/chart-types | ThoughtSpot — Chart Types | Inventory of chart types + when each fits. | Reference for suggestedView → ChartKind mapping |
| https://www.datawrapper.de/charts | Datawrapper — Charts overview | Opinionated chart selection at CREATION only; never re-routes mid-edit. | Confirms "no mid-edit auto-switch" |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — Better KPI Visualizations in Power BI | KPI card best practices — when KPI is the right choice over a chart. | KPI-tile suggestion contexts |
| https://zapier.com/blog/turn-off-smart-compose/ | Zapier — How to turn off Smart Compose | Gmail Smart Compose UX: Tab to accept, keep typing to ignore. Suggest-then-apply, never apply-then-ask-forgiveness. | Pattern parallel to click-to-switch |

### Synthesis takeaway

- **No major BI tool silently auto-switches charts**. Tableau, Power BI, Looker, ThoughtSpot, Datawrapper all explicitly chose against this; they had the same option.
- **Robust pattern**: suggest → one-click apply → easy undo. Mirrors Gmail Smart Compose (Tab to accept).
- **Stickiness rule**: respect explicit user override for the session/conversation; re-evaluate on a fresh conversation.
- **Severity gradient**: implicit pattern is "escalate the affordance, not the automation" — info = label only, caution = button, error = forced empty state with manual CTA. Never auto-switch.
- **PulsePlay recommendation locked**: click-to-switch button inside warning card. `suggestedView` text becomes `<button>` that calls `setChartType(...)` on the parent. User-confirmed direction 2026-05-22.

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

---

## 2026-05-22 — Azure Databricks Apps Enterprise Installation Guide

**Context.** Rajesh asked for a single installation guide after the first live PulsePlay Databricks Apps deploy was not straightforward. A research agent inspected the local deploy guide, long-form lessons, app manifest, and older proxy-only README while the main session verified current Azure Databricks Apps docs. The result is the refreshed [DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) plus a superseded signpost in [proxy/README.databricks-app.md](../../proxy/README.databricks-app.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/ | Microsoft Learn — Azure Databricks Apps overview | Apps run on Databricks serverless infrastructure, integrate with UC/SQL/OAuth, are billed while running, and require Premium workspace support. | Prerequisites and scope |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/configure-env | Microsoft Learn — Set up Databricks Apps workspace and development environment | Workspace must be in a serverless-supported region and network policy must allow outbound access to `*.databricksapps.com`; CLI 0.229+ required. | Enterprise prerequisites and network blockers |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/key-concepts | Microsoft Learn — Key concepts in Databricks Apps | App resources are environment-specific and app permissions are separate from app/user authorization. | Auth model and resource ownership |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/deploy | Microsoft Learn — Deploy a Databricks app | Git deploys can target branch, tag, or commit; private repos require SP Git credential; troubleshooting calls out env/resource resolution and Private Link egress. | Create/deploy sequence |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/app-runtime | Microsoft Learn — Configure app execution with app.yaml | `app.yaml` owns `command` and `env`; apps must receive runtime config through env/resource references. | `app.yaml` guidance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables | Microsoft Learn — Define environment variables in a Databricks app | Use `valueFrom` for resource-backed values; secrets should never be hardcoded in app config. | Secret/resource binding section |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources | Microsoft Learn — Add resources to a Databricks app | Add resources through app configuration/UI or bundles; app SP needs least-privilege access to existing resources. | Resource binding stance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth | Microsoft Learn — Configure authorization in a Databricks app | User authorization is public preview and requires scopes/consent; app authorization uses the app SP. | Auth model decision table |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/permissions | Microsoft Learn — Configure permissions for a Databricks app | `CAN USE` / `CAN MANAGE` app permissions do not equal data authorization; apps cannot be anonymous/public. | Permission and access checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/monitor | Microsoft Learn — Logging and monitoring for Databricks Apps | Use stdout/stderr, external logging/APM where needed, and system audit tables for app security events. | Ops checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/best-practices | Microsoft Learn — Best practices for Databricks Apps | App compute is for UI/control plane; bind to `0.0.0.0:$DATABRICKS_APP_PORT`, avoid privileged operations, minimize cold start. | Challenge matrix |
| https://learn.microsoft.com/en-us/azure/databricks/resources/limits | Microsoft Learn — Azure Databricks resource limits | Enterprise resource limits differ from Free Edition; Databricks Apps quota is workspace-scoped. | Free Edition vs enterprise caution |
