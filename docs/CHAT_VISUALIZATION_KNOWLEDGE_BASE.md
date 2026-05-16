# Chat Visualization Knowledge Base

> **Status:** Planning baseline for Chat + Knowledge Base integration, 2026-05-16.
>
> **Purpose:** Give PulsePlay Chat a governed set of rules for recommending, critiquing, migrating, and explaining legacy and modern chart types. This is not a renderer implementation yet; it is the knowledge contract Chat should consume from the Knowledge plane.

## Research Anchors

- Microsoft Power BI groups visuals by purpose: comparison/trends, part-to-whole, distribution/relationships, tables/matrices, maps, cards/KPIs/gauges, AI-powered visuals, slicers, tooltips, analytics, and small multiples. See [Power BI visualization overview](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview).
- Tableau frames chart choice around the user's question, the data properties, and the communication goal, with common categories such as time, correlation, magnitude, deviation, distribution, ranking, part-to-whole, spatial, and flow. See [Choose the Right Chart Type](https://help.tableau.com/current/pro/desktop/en-us/what_chart_example.htm) and [Visual Best Practices](https://help.tableau.com/current/blueprint/en-gb/bp_visual_best_practices.htm).
- Databricks AI/BI dashboards currently expose common and modern dashboard visuals such as bar, line, area, box, bubble, combo, funnel, heatmap, histogram, pivot, point map, Sankey, scatter, table, waterfall, cohort-style pivots, and counter charts, with AI-assisted authoring for several visual types. See [AI/BI dashboard visualization types](https://docs.databricks.com/en/dashboards/visualizations/types.html) and [Dashboards](https://docs.databricks.com/aws/en/dashboards).
- Vega-Lite is a useful neutral grammar reference because it separates data, transforms, marks, encodings, composition, and interaction. See [Vega-Lite overview](https://vega.github.io/vega-lite/docs/).

## How Chat Should Use This Knowledge

When a user asks about charts, Chat should follow this order:

1. Identify the analysis intent: compare, trend, rank, distribute, correlate, explain variance, map, show flow, show hierarchy, inspect detail, or monitor target.
2. Infer the data shape: measures, dimensions, time grain, geography, hierarchy, ordered stages, source-target pairs, row count, cardinality, and target/baseline fields.
3. Recommend the simplest chart that answers the question.
4. Give alternatives only when the tradeoff is meaningful.
5. Warn when a requested chart is weak for the user's goal.
6. Map the recommendation to the active surface: Power BI, Databricks AI/BI, Tableau, Looker, Qlik, generic iframe, or future Vega/custom.
7. Ask a follow-up only when a required field is missing.

Chat should answer in this compact pattern:

```text
Recommended visual: <chart>
Why: <one-sentence reason tied to the question>
Needs: <fields / SQL shape>
Avoid if: <risk>
Better alternative: <only if useful>
Implementation note: <surface-specific caveat>
```

## Question-to-Chart Families

| User intent | First-choice family | Strong alternatives | Avoid by default |
|---|---|---|---|
| Compare categories | Bar / column | Dot plot, lollipop, small multiples | Pie, radar, 3D column |
| Track time | Line | Area, sparkline, small multiples, indexed line | Pie, unordered bar |
| Rank / top-N | Sorted bar | Pareto, bump/ribbon for rank-over-time | Unsorted table |
| Show part-to-whole | 100% stacked bar | Treemap, pie/donut for <=5 slices | Pie with many slices |
| Show distribution | Histogram | Box plot, violin, density, ridgeline | Average-only KPI |
| Show correlation | Scatter | Bubble, hexbin, heatmap | Dual-axis line as correlation proof |
| Explain variance | Waterfall | Deviation bar, bullet, bridge table | Stacked area |
| Track target | KPI card + delta | Bullet, gauge only for a single public target | Gauge farms |
| Show process conversion | Funnel | Stage table, Sankey if flow splits | Funnel for unordered categories |
| Show flow | Sankey / alluvial | Flow map, chord for expert symmetric flow | Sankey hairball |
| Show geography | Point / filled / density map | Bar by region, small multiples | Map when geography is not the question |
| Show hierarchy | Matrix / tree | Treemap, sunburst, decomposition tree | Pie nested inside pie |
| Inspect exact records | Table | Matrix/pivot with conditional formatting | Dense chart labels |
| Show cohorts | Cohort heatmap / pivot | Retention curves, small multiples | Raw table only |
| Explain drivers | Decomposition tree / key influencers | Scatter + regression, decision tree, narrative | Treating correlation as causation |
| Tell the story | Smart narrative / annotated chart | Insight cards, callouts | Text without data provenance |

## Chart Rules

| Chart | Use when | Data shape | Rules Chat should enforce |
|---|---|---|---|
| KPI / counter / card | One number matters most | 1 measure, optional target/time comparison | Always include label, period, delta, direction semantics, and target if available. Prefer KPI + sparkline over isolated vanity cards. |
| Table | Exact values matter | Many columns / detailed rows | Use for lookup and audit. Add sort, freeze/sticky headers when available, formatting, and conditional highlights. Do not use as the first story visual unless precision is the goal. |
| Matrix / pivot | Cross-tab summary | Row dimension, column dimension, measure | Good for finance and operations review. Require totals, formatting, and clear hierarchy. Watch cardinality. |
| Bar / column | Compare categories | 1 dimension + 1 measure | Sort by value unless time or natural order matters. Use bar for long labels. Group low-volume categories as Other when cardinality is high. |
| Grouped bar | Compare categories across a small segment | Category + segment + measure | Keep segment count low. If the user wants share, use 100% stacked instead. |
| Stacked / 100% stacked bar | Show composition | Category + component + measure | Use 100% stacked for share, stacked for absolute contribution. Avoid too many colors. |
| Line | Trend over continuous time | Date/time + measure | Use continuous time axis, show missing periods honestly, annotate major events, and avoid too many series. |
| Area / stacked area | Magnitude over time | Time + measure, optional component | Use when cumulative magnitude matters. Avoid overlapping areas for precise comparison. |
| Combo / dual-axis | Compare two related measures with different units | Time/category + 2 measures | Label axes clearly. Prefer small multiples if dual-axis could imply false correlation. |
| Sparkline | Compact trend near a metric | Time + measure | Use inside cards/tables. Pair with current value and delta. |
| Slope graph | Before/after change | Entity + start value + end value | Good for two points in time. Limit line count and label endpoints. |
| Bump / ribbon | Rank changes over time | Time + entity + rank/value | Use for rank movement, not precise magnitude. |
| Scatter | Relationship between two measures | Numeric X + numeric Y | Add trendline only when meaningful. Say correlation is not causation. Use color/facet for groups. |
| Bubble | Relationship with third metric | Numeric X/Y + size measure | Use size carefully; do not rely on bubble area for precise comparison. |
| Hexbin / density scatter | Dense relationship pattern | Many numeric X/Y records | Prefer over unreadable scatter clouds. Needs larger datasets and a capable renderer. |
| Histogram | Distribution of one measure | Numeric measure + bins | Explain bin choice. Use same bins when comparing groups. |
| Box plot | Compare distributions | Numeric measure, optional category | Good for median/spread/outliers. Add plain-language explanation for non-technical users. |
| Violin / density / ridgeline | Advanced distribution shape | Numeric measure + enough records | Use for analytic audiences. Avoid in executive dashboards unless explained. |
| Heatmap / highlight table | Pattern across two dimensions | X dimension + Y dimension + measure | Use ordered axes when possible. Use perceptual color scales, not rainbow. |
| Calendar heatmap | Daily/weekly seasonality | Date + measure | Good for operations cadence, incidents, demand, attendance. Needs clear legend. |
| Pie / donut | Simple part-to-whole snapshot | One measure + <=5 categories | Use sparingly. Never use for precise ranking, many categories, negative values, or time trend. |
| Treemap | Many hierarchical parts of a whole | Hierarchy + size measure | Good for overview of many categories. Poor for exact comparison; pair with table/bar if precision matters. |
| Sunburst / icicle | Hierarchical path share | Multi-level hierarchy + measure | Use when hierarchy path matters. Avoid when users need exact comparisons. |
| Waterfall | Bridge from start to end | Ordered additive components | Components must be additive. Label start, changes, subtotal if needed, and final total. |
| Funnel | Conversion through ordered stages | Stage + value | Stages must be ordered. If values increase, explain why or choose a stage table. |
| Sankey / alluvial | Flows between stages/groups | Source + target + value | Limit nodes and links. If it becomes dense, recommend filtering or stage-level aggregation. |
| Chord | Bidirectional relationship intensity | Entity pairs + value | Expert-only. Usually Sankey, matrix, or network is clearer. |
| Network graph | Entity relationships | Nodes + edges + weights | Use only when topology matters. Require filtering, clustering, and search. |
| Point map | Geographic point pattern | Latitude/longitude + measure | Use for location questions. Add clustering for dense data. |
| Filled/choropleth map | Regional rate/share | Region + normalized measure | Prefer normalized values, not raw totals. Include geography grain and legend. |
| Density map | Spatial concentration | Coordinates or geocoded events | Use for hotspot discovery. Avoid for precise values. |
| Gauge | Single progress-to-target | Measure + target | Acceptable for one high-salience target. Prefer bullet/KPI in dense dashboards. |
| Bullet chart | Actual vs target in compact form | Measure + target + optional bands | Preferred replacement for most gauges. Works well in KPI grids. |
| Gantt / timeline | Schedule or duration | Task + start + end | Use for project, process, or machine downtime timelines. |
| Candlestick / OHLC | Financial price movement | Time + open/high/low/close | Use for market/finance audiences. Add volume separately. |
| Decomposition tree | Explain drivers by drill path | Measure + multiple dimensions | Useful when the BI surface supports interactive decomposition. Do not present as causal proof. |
| Key influencers | Discover drivers of an outcome | Outcome + candidate explanatory fields | Useful for guided exploration. Always include model/assumption caveats. |
| Smart narrative / annotated insight | Explain the chart in words | Chart context + metrics | Must cite the underlying metric/time/filter. Never invent reasons beyond the data. |

## Legacy-to-Modern Migration Rules

Chat should be direct when a legacy visual is familiar but weak:

| Legacy pattern | Better modern pattern | Reason |
|---|---|---|
| Pie with many slices | Sorted bar or 100% stacked bar | Easier comparison and labeling. |
| Donut dashboard full of shares | KPI + ranked bars + part-to-whole only where needed | Reduces decorative repetition. |
| Gauge farm | KPI cards with deltas, bullets, and sparklines | Saves space and supports comparison. |
| 3D chart | Flat chart with labels/reference lines | 3D distorts values. |
| Dual-axis chart with unrelated measures | Small multiples or indexed line | Reduces false correlation. |
| Dense table wall | Summary KPIs + matrix/table detail + conditional formatting | Preserves precision without hiding the story. |
| Stacked area with many series | Line small multiples or sorted contribution bars | Improves readability. |
| Map used only for magnitude | Bar by region | A map is only better when location/spatial pattern matters. |
| Sankey hairball | Funnel, stage table, filtered Sankey, or matrix | Keeps flow explainable. |
| Many colors without semantics | Semantic palette + neutral defaults | Color should mean status, group, or selection. |
| Static screenshot report | Interactive dashboard with filters, tooltips, and drill paths | Modern BI should support exploration. |
| Paginated detail used as dashboard | Dashboard summary + paginated/detail drill-through | Keeps audit detail without losing scanability. |

## Modern Dashboard Composition Rules

For Chat-generated recommendations, use this layout logic:

1. **Start with outcome.** Top row should show the most important KPIs, deltas, and target status.
2. **Then explain movement.** Use time trends, variance bridge, or rank movement.
3. **Then diagnose drivers.** Use decomposition, small multiples, scatter, distribution, or segment heatmap.
4. **Then expose detail.** Use table/matrix only after the summary and driver layers.
5. **Keep filters visible.** Date, geography, business unit, product, and persona filters must be obvious.
6. **Prefer progressive disclosure.** Overview first, drill/detail second.
7. **Use interaction intentionally.** Tooltips, cross-filtering, bookmarks, and drill-through should answer natural follow-up questions.
8. **Respect accessibility.** Do not encode meaning only by color; use labels, icons, pattern/shape when possible, and sufficient contrast.
9. **Keep enterprise tone.** Dense but calm beats decorative. Avoid chart variety for its own sake.
10. **Tie every visual to a decision.** If a chart does not support action, monitoring, diagnosis, or evidence, remove it.

## Chat Answer Rules By Persona

| Persona | Default behavior |
|---|---|
| Executive | Recommend the simplest executive-level visual, emphasize outcome, target, trend, and one driver. |
| Analyst | Explain alternatives, field requirements, calculation caveats, and SQL/data-shape implications. |
| Developer | Mention renderer support, data contract, query shape, interaction hooks, and testability. |
| Designer | Emphasize hierarchy, scan order, layout density, color semantics, and accessibility. |
| Operator | Focus on current status, thresholds, exceptions, and next action. |

## Proposed Runtime Shape

The Knowledge plane should eventually expose rules in a typed shape similar to this:

```typescript
type ChartKnowledgeRule = {
    id: string;
    family: "comparison" | "trend" | "distribution" | "relationship" | "partToWhole" | "flow" | "geo" | "hierarchy" | "target" | "detail" | "narrative";
    chartNames: string[];
    questionIntents: string[];
    requiredFields: string[];
    optionalFields: string[];
    useWhen: string[];
    avoidWhen: string[];
    migrationFromLegacy?: string[];
    surfaceSupport: {
        powerbi?: "native" | "custom" | "limited";
        databricksAibi?: "native" | "manual" | "limited";
        tableau?: "native" | "manual" | "limited";
        genericVega?: "native" | "manual" | "limited";
    };
    chatGuidance: string;
    accessibilityRules: string[];
};
```

`DomainContextProfile` should reference this through an optional `visualizationGuidance` block so a CPG dashboard, finance dashboard, operations dashboard, and executive scorecard can bias recommendations without hardcoding chart rules into Chat.

## First Implementation Slice

1. Add this document to the Knowledge Base / Chat planning set.
2. Claude should review whether these rules become a static `chartKnowledgeRules.ts` seed, a PulsePack YAML file, or part of `DomainContextProfile`.
3. First runtime consumer should be Chat suggestion/correction, not BI rendering.
4. Later, AI Insights can reuse the same rules when choosing section renderers and provenance hints.
