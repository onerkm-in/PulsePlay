# Unified Ask Pulse Workbench — Strategy Lock

> **Status:** locked 2026-05-18. Source: 4-agent research verdict synthesizing Databricks Genie + Power BI + Tableau + Looker + Qlik visualization catalogs + ECharts + Vega-Lite documentation.
>
> This decision **supersedes** the in-flight surface-tabs proposal in [AGENT_SYNC.md](AGENT_SYNC.md) ("Ask Pulse label + unified surface-tabs proposal", 2026-05-17). The companion proposals there (in-app floating comparison layer, Pulse Bubble launcher) remain under research; they do not block the workbench strategy.

## Why this exists

PulsePlay's Ask Pulse surface today is behind. Theme polish alone will not fix it. We have two pressures pulling in opposite directions:

1. **Databricks Genie already has a great native chat UX** (Embed Genie public preview). Replacing it with a worse PulsePlay copy would be a regression for Genie users.
2. **PulsePlay must own accuracy, evidence, BI context, chart quality, and exports.** Genie iframe alone cannot deliver that contract; it does not know about the BI surface the user is also looking at, our pack knowledge, our validation gates, or our export formats.

The research verdict resolves this by **not framing it as app vs API**. Databricks App is hosting. Genie iframe is native UX. Genie Conversation API is verified structured artifacts. PulsePlay orchestrates all three behind one unified screen.

## The decision

Build one **Unified Ask Pulse Workbench**, not another sidebar and not a pure Genie iframe replacement. Three modes inside the same chat surface:

| Mode | Use case | What PulsePlay owns | Why |
|---|---|---|---|
| **Native Embed** | Genie iframe, future vendor-native chat UIs (Tableau Pulse, Qlik Insight Advisor, Looker Conversational Analytics if they ship) | Outer chrome + auth + governance + handoff into PulsePlay rails | Closest-to-vendor UX when the vendor already has a great chat experience |
| **PulsePlay Verified** | API-driven chat/artifact rendering (Genie Conversation API, Mosaic Foundation Model, Azure OpenAI, Bedrock, Supervisor, ResponsesAgent) | Chart quality, evidence, exports, theme, BI context, accuracy gates, citations | We control the contract end-to-end |
| **Hybrid** | Genie native UX inside the PulsePlay artifact canvas | Same PulsePlay rails as Verified mode (BI context, SQL/evidence, validation, export, chart promotion, source scope) plus the embedded Genie surface | Best of both: native UX with PulsePlay governance |

These three modes are **runtime modes of the same surface**, not three separate surfaces. The user does not pick a mode; the connector's capability flags and the artifact's provenance pick it.

## Brutal-honest accuracy posture

**Do not promise "100% no hallucination"** for free-text AI. Nobody can honestly promise that, and a marketing-grade promise we cannot keep poisons trust the first time it fails.

Promise something stronger and verifiable for BI output: **no ungrounded artifacts.**

- No chart unless it is built from returned rows.
- No table unless it came from a query result / API response / vendor result.
- No number unless it maps to SQL, DAX, a returned cell, or a citation.
- Unsupported free-text claims get labeled or blocked, not surfaced as confident answers.

### Four artifact statuses

Every answer carries exactly one of:

| Status | Meaning | When emitted |
|---|---|---|
| `Verified` | Numbers + chart + table all derived from a successful query/API/vendor result. SQL or equivalent provenance available. Validator passed. | Genie Conversation API success path; FM/OpenAI/Bedrock analytics path with SQL exec; Power BI report data on a known visual |
| `Grounded draft` | Some claims map to result rows, some do not. Mixed provenance. Sections labeled. | Multi-step reasoning where part of the answer is synthesized across sources |
| `Suggestion` | No result rows behind the claim. Pattern-matched, generated, or extrapolated. Cannot promote to chart/table. | Free-text answers, pack-knowledge hints, follow-up question suggestions |
| `Blocked` | Validator refused. Reason surfaced. No artifact rendered. | SQL exec failure, result-row count = 0 where the prompt promised rows, validator caught a chart attempting to render without underlying data, vendor returned an error |

The status is **emitted by the artifact validation gate**, not chosen by the LLM. The LLM cannot self-declare `Verified`.

## UI direction

Target layout (replaces today's [AISidebar.tsx](../playground/src/components/AISidebar.tsx) Insights pane and the chat parts of [pulse/visual.tsx](../playground/src/pulse/visual.tsx)):

```
+--------+---------------------------------------------+--------+
| Rail   |  Artifact canvas                            | Insp   |
|        |  +---------------------------------------+  |        |
|  Conv  |  | Answer | Chart | Table | SQL |        |  | Source |
|  list  |  | Evidence | Reasoning                  |  | BI     |
|        |  +---------------------------------------+  | Filter |
|        |  |                                       |  | Rows   |
|        |  |  <selected tab content>               |  | Time   |
|        |  |                                       |  | Valid  |
|        |  |                                       |  | Cite   |
|        |  |                                       |  | Export |
|        |  +---------------------------------------+  |        |
|        |  [composer: sticky, smooth progress]        |        |
+--------+---------------------------------------------+--------+
```

- **Left rail** — conversation list, thread history, status pills (the four artifact statuses surface here per message), branch/regenerate actions. Compact, collapsible.
- **Main artifact canvas** — tabs `Answer | Chart | Table | SQL | Evidence | Reasoning`. Not all tabs are present on every artifact; the validator decides which can be rendered.
- **Inspector drawer** — filters, source BI surface (which Power BI report / Genie space / Lakeview dashboard the artifact came from), SQL, row count, execution time, validation result, citations, export buttons.
- **Sticky composer** — bottom of canvas, smoother progress states than today's "thinking..." text, fewer noisy chips/buttons.
- **Theme** — professional neutral, restrained accent, separate data-viz palette (never reuse brand colors for chart series), compact / dark / high-contrast modes.

## Visualization stack

| Role | Library | Why |
|---|---|---|
| **Primary runtime renderer** | [ECharts](https://echarts.apache.org/en/feature.html) | Breadth (60+ chart types), performance, Canvas + SVG, WebGL/WebGPU upgrade path, modular bundle, Apache 2.0 |
| **Neutral chart spec / validation grammar** | [Vega-Lite](https://vega.github.io/vega-lite/docs/mark.html) | Portable JSON spec, validated/reviewable, vendor-neutral, well-typed |
| **Specialist lazy-load** | Plotly | Scientific / 3D / financial niche only; do not load on default path |

Spec flow: artifact validator emits a Vega-Lite spec → spec is reviewed by validation gates → compiler translates to an ECharts option → ECharts renders. Plotly is loaded dynamically only when a Future-tier chart is requested.

### Chart tiers

Synthesized from [Databricks AI/BI](https://docs.databricks.com/aws/en/dashboards/manage/visualizations/types), [Power BI](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview), [Tableau](https://help.tableau.com/current/pro/desktop/en-us/what_chart_example.htm), [Looker](https://cloud.google.com/looker/docs/visualization-types), [Qlik](https://qlik.dev/embed/foundational-knowledge/visualizations/) catalogs.

| Tier | Charts | Auto-pick policy |
|---|---|---|
| **Core** | KPI, table, pivot, bar/column, line, area, combo, scatter, bubble, histogram, box, heatmap, pie/donut (with category limit), treemap, map, funnel, waterfall | Auto-pick allowed |
| **Advanced** | bullet, sparkline, small multiples, Pareto, cohort, Sankey, Gantt, annotations, confidence bands | Auto-pick when domain heuristics match (e.g. cohort matches a time-series + segment shape) |
| **Trendy** | lollipop, slope, bump, calendar heatmap, streamgraph, sunburst, ridgeline, beeswarm, hexbin | User opt-in only; never default |
| **Legacy** | gauge, radar, word cloud, packed bubble, 3D charts, dense dual-axis | Support but never auto-pick; warn on selection |
| **Future** | Custom grammar, WebGL/WebGPU large-data renderers, Arrow-backed datasets, network graphs, candlestick/OHLC | Roadmap; not v1 |

Pie/donut category limit and dual-axis warning are validator rules, not UI suggestions.

## Build sequence

Each step is a self-contained slice that ships behind a feature flag and does not regress existing surfaces.

1. **`UnifiedAssistantSurface` architecture + connector capability model.** TypeScript contract for the workbench shell, the three modes, the artifact model, and per-connector capability flags (`supportsNativeChatEmbed`, `supportsVerifiedArtifacts`, `supportsHybrid`, `supportsStreamingReasoning`, etc.). Pure contract — no UI change.
2. **Genie iframe move.** Promote Genie iframe from "BI vendor surface only" into assistant connector mode as `nativeChatEmbed`. Today `bi-adapters/databricks-genie/` treats it strictly as a BI surface. It needs to live on the **assistant axis** too while keeping its BI-axis option (a Genie space is legitimately both a BI surface and an AI chat).
3. **Artifact card shell.** `Answer / Chart / Table / SQL / Evidence / Reasoning` tabs as a reusable component. Stub renderers initially. Wire to the existing Genie response shape (`attachments[].query`, `attachments[].text`, `attachments[].suggested_questions`) so we can demo against live data on day one.
4. **Verified artifact model + validation gates.** Zod (or equivalent) schemas for each artifact type. Status mapping logic. Test fixtures covering each of `Verified / Grounded draft / Suggestion / Blocked`. Block paths in code (refuse to render an unsupported chart). Surface `Blocked` reason via the locked [Problem Details envelope](ERROR_HANDLING_STRATEGY.md).
5. **ECharts renderer + chart registry.** ECharts adapter (modular build: `echarts/core` + per-chart registers). Vega-Lite → ECharts compiler stub. Registry of chart types with tier classification + auto-pick policy.
6. **Pulse chat asset refactor.** Extract reusable assistant pieces from [pulse/visual.tsx](../playground/src/pulse/visual.tsx) into PulsePlay-native modules rather than copying noise. Must respect [PULSE_PORT_DETANGLING.md](PULSE_PORT_DETANGLING.md) — the Pulse-PBI sibling still consumes `pulse/*` patterns, so extraction is additive, not destructive.
7. **Workbench theme.** Apply after the structure is right, not before. Includes the data-viz palette decision and the compact/dark/high-contrast modes.

Steps 1-3 are sequential. Steps 4 + 5 can land in parallel. Steps 6 + 7 follow.

## Intersections with existing work

- **2-axis abstraction** (load-bearing, see [feature_2_axis_abstraction.md](../C:/Users/rajes/.claude/projects/D--Working-Folder-Projects-PulsePlay/memory/feature_2_axis_abstraction.md)): the connector axis now needs a capability dimension. The vendor × connector × capability matrix replaces the binary "is this a BI tool or an AI" view. Genie is the canonical example: BI-axis (it is a queryable space) AND assistant-axis (it is a chat surface).
- **Pulse port detangling** ([PULSE_PORT_DETANGLING.md](PULSE_PORT_DETANGLING.md)): Step 6 must be additive. The Pulse-PBI sibling actively consumes `pulse/*` patterns; the extracted-reusable-assets path is into PulsePlay-native modules, not destructive refactors of `pulse/visual.tsx`.
- **Error handling** ([ERROR_HANDLING_STRATEGY.md](ERROR_HANDLING_STRATEGY.md)): validation gates in Step 4 emit `Blocked` artifacts via Problem Details. The `Blocked` status maps to a Problem Details envelope with category, support code, and operator detail.
- **Discovery loop** ([DISCOVERY_LOOP.md](DISCOVERY_LOOP.md)): discovery already returns `reachableFrames / unreachableFrames`. The workbench's source-scope inspector consumes the same shape.
- **Sustainability indicator** (shipped 2026-05-13): stays. Token cost still rendered; attaches now to the workbench composer area rather than the AISidebar footer.
- **Settings IA**: the workbench replaces the surface-switcher `BI Viz` peer action as the default Ask Pulse experience. The peer-action stays for backward compat during migration but becomes redundant once the workbench owns the chat surface.
- **Prompt IR** ([PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md)): per-backend translators stay. The artifact validator consumes the translator output; it does not re-translate.
- **React Query foundation** (shipped 2026-05-18): the workbench shell consumes `useAllowlist()`, `usePacks()`, and will add `useAssistantCapabilities()` and `useConversation()` query hooks. Devtools stay dev-only.
- **AGENT_SYNC surface-tabs proposal** (2026-05-17): superseded. The unified workbench replaces the `AI Insights | Ask Pulse | BI Viz` peer-tabs plan as the canonical Ask Pulse direction. AI Insights remains a sibling pane.

## Open questions

These are tracked open intentionally; pick them up as Build Sequence steps land.

- **Route shape.** Replace `/?focus=ai`, mount at `/workbench`, or live inside the existing Pulse surface as an internal mode? Step 1 decides.
- **Conversation rail migration.** Does the rail subsume the existing Pulse sidebar thread history immediately, or run in parallel during the Pulse → workbench migration?
- **Hybrid mode rendering.** When Genie native UX runs inside the artifact canvas, does the iframe stay live (real Genie embed), or do we replay messages through the proxy and render in PulsePlay? Replay is more controllable; iframe is closer to vendor UX. Likely answer: iframe by default with a "replay in PulsePlay" toggle.
- **Vega-Lite ship target.** Do we ship the Vega-Lite runtime to the browser, or use it server-side only for spec validation and compile to ECharts options on the server? Smaller bundle if server-only; more flexible if shipped.
- **ECharts bundle pressure.** Start with the modular build (`echarts/core` + per-chart registers). Decide tier-by-tier whether to include in main bundle vs lazy-load.
- **Existing Insights taxonomy.** The Pulse-shaped sections (HEADLINE / TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS) — do they survive as artifact card preset compositions, or fold into the generic tab system? Tied to Pulse-port detangling categorization.
- **Per-connector capability defaults.** Initial flag values for Genie, Foundation Model, Azure OpenAI, Bedrock, Supervisor, ResponsesAgent. Step 1 ships an initial matrix; Step 2 verifies Genie against live behavior.

## Acceptance criteria for "Workbench v1 done"

- All four artifact statuses observable end-to-end with passing tests (`Verified` / `Grounded draft` / `Suggestion` / `Blocked`).
- A live Genie question in Native Embed, Verified, and Hybrid modes against the org workspace renders without UI regression vs today's Pulse sidebar.
- Chart auto-pick covers Core tier from a Genie SQL result without manual chart selection.
- Validation gate blocks an injected hallucinated chart (test fixture) and surfaces the reason via Problem Details.
- Sustainability indicator continues to report token cost in the composer area.
- Sidebar (left rail) status pills reflect artifact status per message.
- No regression in the 580/580 playground test suite; net new tests cover the artifact model, validation gates, ECharts adapter, and chart registry.

## References

- Databricks Embed Genie — https://docs.databricks.com/aws/en/genie/embed
- Genie Conversation API — https://docs.databricks.com/gcp/en/genie/conversation-api
- Genie Agent Mode — https://docs.databricks.com/gcp/en/genie/agent-mode
- Databricks AI/BI visualizations — https://docs.databricks.com/aws/en/dashboards/manage/visualizations/types
- Power BI visuals — https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview
- Tableau chart guide — https://help.tableau.com/current/pro/desktop/en-us/what_chart_example.htm
- Looker visualization types — https://cloud.google.com/looker/docs/visualization-types
- Qlik visualizations — https://qlik.dev/embed/foundational-knowledge/visualizations/
- ECharts — https://echarts.apache.org/en/feature.html
- Vega-Lite — https://vega.github.io/vega-lite/docs/mark.html
