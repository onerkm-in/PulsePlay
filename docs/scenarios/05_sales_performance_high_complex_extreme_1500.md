# Sales Performance High-Complex Extreme Layout Catalog - 1500 Cases

> **Status:** Scenario catalog, created 2026-05-25.
>
> **Scope:** High, Complex, and High-Complex cases only. No basic/routine smoke cases.
>
> **Data anchor:** Sales Performance Genie space over the Sample Superstore-style table previously live-smoked as `workspace.databrickspractice.vw_genie_sales_performance`.
>
> **Purpose:** Stress every layout setting of **AI Insights**, **Ask Pulse**, and **Dashboard / native BI** using realistic Sales Performance questions. Numeric answer correctness is a separate grounded-answer eval; this file is for layout, rendering, state, native BI, and interaction resilience.

## Count Contract

The 1500 cases are the deterministic cross-product below:

```text
3 surfaces
x 10 layout modes per surface
x 10 Sales Performance data slices
x 5 high/complex stress packs
= 1500 test cases
```

Every case ID is generated as:

```text
SP-<SURFACE>-<LAYOUT>-<DATA>-<STRESS>

SURFACE = AI | AP | DB
LAYOUT  = L01..L10
DATA    = D01..D10
STRESS  = S01..S05
```

Examples:

- `SP-AI-L01-D01-S01`
- `SP-AP-L08-D07-S04`
- `SP-DB-L10-D10-S05`

## Surfaces

| Code | Surface | Case count | Primary validation |
|---|---|---:|---|
| `AI` | AI Insights | 500 | Sectioned briefing, staged reveal, toolbar, BI context pane, composer, evidence controls |
| `AP` | Ask Pulse | 500 | Chat, follow-up context, artifacts, chart/table/SQL/evidence/reasoning tabs, composer |
| `DB` | Dashboard / native BI | 500 | Native canvas, chart/table/KPI states, split panes, float/minimize/maximize, toolbar, token/multi-pane safety |

## Complexity Bands

Only these bands are allowed in this catalog.

| Stress | Band | Description |
|---|---|---|
| `S01` | High | One hard analytical ask plus one layout stressor |
| `S02` | High | Dense output, toolbar/action fit, and evidence requirements |
| `S03` | Complex | Multi-metric, multi-dimensional, filter-aware reasoning |
| `S04` | Complex | Multi-turn or multi-pane state with persistence/restore requirements |
| `S05` | High-Complex | Cross-surface, cross-pane, high-density, degraded/error/edge-state resilience |

## Sales Performance Data Slices

| Data | Sales Performance slice | Fields and measures to exercise |
|---|---|---|
| `D01` | Executive sales/profit overview | `Sales`, `Profit`, `Profit Margin`, `Order Count`, `Region`, `Category` |
| `D02` | Margin compression under discounting | `Profit Margin`, `Discount`, `Sales`, `Segment`, `Ship Mode` |
| `D03` | Negative-profit risk pockets | `Profit`, `Sales`, `State`, `City`, `Sub-Category` |
| `D04` | Trend and seasonality | `Sales`, `Profit`, `Order Month`, `Order Year`, `Category` |
| `D05` | Category and sub-category portfolio | `Sales`, `Profit`, `Quantity`, `Category`, `Sub-Category` |
| `D06` | Fulfillment and ship-mode impact | `Sales`, `Profit`, `Discount`, `Ship Mode`, `Region` |
| `D07` | Segment comparison | `Sales`, `Profit`, `Average Order Value`, `Segment`, `Region` |
| `D08` | Geographic concentration | `Sales`, `Profit`, `Order Count`, `Region`, `State`, `City` |
| `D09` | Outliers and anomalies | `Sales`, `Profit`, `Discount`, `Quantity`, `City`, `Sub-Category` |
| `D10` | Data-quality and governance sanity | Missing/zero/negative values, mixed units, row limits, evidence and caveats |

## AI Insights Layout Modes

| Layout | Mode | Stress target |
|---|---|---|
| `L01` | `ai-left` | BI context left, insights right |
| `L02` | `ai-right` | Insights left, BI context right |
| `L03` | `ai-top` | Insights above BI context |
| `L04` | `ai-bottom` | BI context above insights |
| `L05` | Maximized AI Insights | Full-height briefing, no toolbar overlap |
| `L06` | Minimized AI Insights dock | Restore path and state retention |
| `L07` | Floating AI Insights clone | Original slot remains, float duplicates |
| `L08` | Mobile stacked AI Insights | Narrow width, composer reachable |
| `L09` | Ultrawide AI Insights | Very wide sections, no stretched text failure |
| `L10` | High contrast / large text AI Insights | 125% text, focus rings, readable evidence controls |

## Ask Pulse Layout Modes

| Layout | Mode | Stress target |
|---|---|---|
| `L01` | `ai-left` | BI context left, chat right |
| `L02` | `ai-right` | Chat left, BI context right |
| `L03` | `ai-top` | Chat above BI context |
| `L04` | `ai-bottom` | BI context above chat |
| `L05` | Maximized Ask Pulse | Long answer, artifact tabs, sticky composer |
| `L06` | Minimized Ask Pulse dock | Restore chat scroll and draft state |
| `L07` | Floating Ask Pulse clone | Float duplicates chat without losing source slot |
| `L08` | Mobile stacked Ask Pulse | Composer, suggestions, and citations fit |
| `L09` | Ultrawide Ask Pulse | Artifact card and chat rail stay readable |
| `L10` | High contrast / keyboard Ask Pulse | Tab order, focus, evidence drawer controls |

## Dashboard / Native BI Layout Modes

| Layout | Mode | Stress target |
|---|---|---|
| `L01` | Single native canvas | Native KPI/chart/table full canvas |
| `L02` | Single Power BI plus native commentary | Vendor surface plus native result dock |
| `L03` | Split horizontal: native chart + native table | Resize, scroll, column labels |
| `L04` | Split horizontal: Power BI + native BI | Mixed vendor/native pane context |
| `L05` | Split vertical: KPI strip + chart | Short-height compression |
| `L06` | Split vertical: Power BI + native BI | Token/pane state separation |
| `L07` | Floating Dashboard clone | Source dashboard remains mounted |
| `L08` | Mobile single-pane Dashboard | No horizontal overflow, collapsed composer |
| `L09` | Ultrawide two-pane Dashboard | Wide chart/table density and split ratio |
| `L10` | High contrast / large text Dashboard | Axis labels, legends, tooltips, toolbar overflow |

## Stress Packs

| Stress | Band | Scenario requirement | Validation target |
|---|---|---|---|
| `S01` | High | Generate a decision-ready answer with one explicit comparison and one caveat | Layout supports a dense but single-turn answer |
| `S02` | High | Require evidence, SQL/query trace if available, source freshness, and copy/export affordances | Evidence controls and toolbar do not collide |
| `S03` | Complex | Combine at least two measures, two dimensions, and one filter; request ranked and trended views | Multi-section or multi-artifact output stays aligned |
| `S04` | Complex | Run as follow-up / restore / split-pane / float scenario with state carried forward | State persists across tab/layout changes |
| `S05` | High-Complex | Force edge behavior: long labels, negative values, mixed units, row limits, unavailable metadata, or degraded governance | Honest blocked/empty/degraded states render cleanly |

## Prompt Templates

Expand each case by substituting the layout, data slice, and stress pack.

### AI Insights Prompt Template

```text
Generate an AI Insights briefing for <DATA> using the Sales Performance Genie space.
Use <STRESS> requirements.
Layout under test: <LAYOUT>.
Return HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, OPPORTUNITIES, and RECOMMENDED ACTIONS where supported.
Call out evidence gaps honestly and avoid invented numbers.
```

### Ask Pulse Prompt Template

```text
Ask Pulse question for <DATA>: explain what changed, why it matters, and what action an operator should take.
Use <STRESS> requirements.
Layout under test: <LAYOUT>.
If the answer needs more context, ask one clarifying question instead of bluffing.
If artifacts are available, render chart, table, SQL/evidence, and reasoning tabs without layout breakage.
```

### Dashboard / Native BI Prompt Template

```text
Render Dashboard/native BI for <DATA> using the Sales Performance result envelope.
Use <STRESS> requirements.
Layout under test: <LAYOUT>.
Prefer native KPI/chart/table output; if blocked, show an explicit governed blocked/empty/degraded state.
Do not leave a blank canvas.
```

## Expanded Case Catalog

Each row below represents 50 concrete cases because `D01..D10` and `S01..S05` expand underneath the row.

| Surface | Layout | Data range | Stress range | Case IDs | Count |
|---|---|---|---|---|---:|
| AI Insights | `L01` | `D01..D10` | `S01..S05` | `SP-AI-L01-D01-S01` .. `SP-AI-L01-D10-S05` | 50 |
| AI Insights | `L02` | `D01..D10` | `S01..S05` | `SP-AI-L02-D01-S01` .. `SP-AI-L02-D10-S05` | 50 |
| AI Insights | `L03` | `D01..D10` | `S01..S05` | `SP-AI-L03-D01-S01` .. `SP-AI-L03-D10-S05` | 50 |
| AI Insights | `L04` | `D01..D10` | `S01..S05` | `SP-AI-L04-D01-S01` .. `SP-AI-L04-D10-S05` | 50 |
| AI Insights | `L05` | `D01..D10` | `S01..S05` | `SP-AI-L05-D01-S01` .. `SP-AI-L05-D10-S05` | 50 |
| AI Insights | `L06` | `D01..D10` | `S01..S05` | `SP-AI-L06-D01-S01` .. `SP-AI-L06-D10-S05` | 50 |
| AI Insights | `L07` | `D01..D10` | `S01..S05` | `SP-AI-L07-D01-S01` .. `SP-AI-L07-D10-S05` | 50 |
| AI Insights | `L08` | `D01..D10` | `S01..S05` | `SP-AI-L08-D01-S01` .. `SP-AI-L08-D10-S05` | 50 |
| AI Insights | `L09` | `D01..D10` | `S01..S05` | `SP-AI-L09-D01-S01` .. `SP-AI-L09-D10-S05` | 50 |
| AI Insights | `L10` | `D01..D10` | `S01..S05` | `SP-AI-L10-D01-S01` .. `SP-AI-L10-D10-S05` | 50 |
| Ask Pulse | `L01` | `D01..D10` | `S01..S05` | `SP-AP-L01-D01-S01` .. `SP-AP-L01-D10-S05` | 50 |
| Ask Pulse | `L02` | `D01..D10` | `S01..S05` | `SP-AP-L02-D01-S01` .. `SP-AP-L02-D10-S05` | 50 |
| Ask Pulse | `L03` | `D01..D10` | `S01..S05` | `SP-AP-L03-D01-S01` .. `SP-AP-L03-D10-S05` | 50 |
| Ask Pulse | `L04` | `D01..D10` | `S01..S05` | `SP-AP-L04-D01-S01` .. `SP-AP-L04-D10-S05` | 50 |
| Ask Pulse | `L05` | `D01..D10` | `S01..S05` | `SP-AP-L05-D01-S01` .. `SP-AP-L05-D10-S05` | 50 |
| Ask Pulse | `L06` | `D01..D10` | `S01..S05` | `SP-AP-L06-D01-S01` .. `SP-AP-L06-D10-S05` | 50 |
| Ask Pulse | `L07` | `D01..D10` | `S01..S05` | `SP-AP-L07-D01-S01` .. `SP-AP-L07-D10-S05` | 50 |
| Ask Pulse | `L08` | `D01..D10` | `S01..S05` | `SP-AP-L08-D01-S01` .. `SP-AP-L08-D10-S05` | 50 |
| Ask Pulse | `L09` | `D01..D10` | `S01..S05` | `SP-AP-L09-D01-S01` .. `SP-AP-L09-D10-S05` | 50 |
| Ask Pulse | `L10` | `D01..D10` | `S01..S05` | `SP-AP-L10-D01-S01` .. `SP-AP-L10-D10-S05` | 50 |
| Dashboard / Native BI | `L01` | `D01..D10` | `S01..S05` | `SP-DB-L01-D01-S01` .. `SP-DB-L01-D10-S05` | 50 |
| Dashboard / Native BI | `L02` | `D01..D10` | `S01..S05` | `SP-DB-L02-D01-S01` .. `SP-DB-L02-D10-S05` | 50 |
| Dashboard / Native BI | `L03` | `D01..D10` | `S01..S05` | `SP-DB-L03-D01-S01` .. `SP-DB-L03-D10-S05` | 50 |
| Dashboard / Native BI | `L04` | `D01..D10` | `S01..S05` | `SP-DB-L04-D01-S01` .. `SP-DB-L04-D10-S05` | 50 |
| Dashboard / Native BI | `L05` | `D01..D10` | `S01..S05` | `SP-DB-L05-D01-S01` .. `SP-DB-L05-D10-S05` | 50 |
| Dashboard / Native BI | `L06` | `D01..D10` | `S01..S05` | `SP-DB-L06-D01-S01` .. `SP-DB-L06-D10-S05` | 50 |
| Dashboard / Native BI | `L07` | `D01..D10` | `S01..S05` | `SP-DB-L07-D01-S01` .. `SP-DB-L07-D10-S05` | 50 |
| Dashboard / Native BI | `L08` | `D01..D10` | `S01..S05` | `SP-DB-L08-D01-S01` .. `SP-DB-L08-D10-S05` | 50 |
| Dashboard / Native BI | `L09` | `D01..D10` | `S01..S05` | `SP-DB-L09-D01-S01` .. `SP-DB-L09-D10-S05` | 50 |
| Dashboard / Native BI | `L10` | `D01..D10` | `S01..S05` | `SP-DB-L10-D01-S01` .. `SP-DB-L10-D10-S05` | 50 |
| **Total** | 30 layout rows | 10 data slices | 5 stress packs | 1500 deterministic case IDs | **1500** |

## AI Insights High/Complex Checks

Run every `SP-AI-*` case with these checks:

- Section grammar: `HEADLINE`, `KPI SNAPSHOT`, `TRENDS`, `RISKS`, `OPPORTUNITIES`, `RECOMMENDED ACTIONS`.
- Staged reveal: skeleton, streaming, completed, failed/regenerate states do not resize the main shell incoherently.
- Section toolbar: copy, regenerate, evidence, export, and overflow stay inside the header at mobile and desktop widths.
- BI context pane: active filters/page/selection are visible or honestly absent.
- Composer: bottom composer never covers the final section.
- Accessibility: section labels, focus order, and disabled controls are announced clearly.
- High-complex `S05`: degraded/no-metadata path must say what is unavailable instead of inventing fields.

## Ask Pulse High/Complex Checks

Run every `SP-AP-*` case with these checks:

- First turn and follow-up stay visually distinct.
- Long user prompt and long assistant answer wrap without horizontal scroll.
- Artifact card tabs fit: `Answer`, `Chart`, `Table`, `SQL`, `Evidence`, `Reasoning`.
- Chart/table tabs share the same result id and do not show stale data after a follow-up.
- Composer keeps draft text through minimize/restore and float/dock.
- Clarifying-question path renders as a question, not as a failed answer.
- High-complex `S05`: if SQL/evidence is unavailable, the Evidence tab shows an explicit limitation.

## Dashboard / Native BI High/Complex Checks

Run every `SP-DB-*` case with these checks:

- Native canvas never stays blank: it must render empty, blocked, text, KPI, chart, table, or error state.
- Governance attestation is shown when enforced and blocked cleanly when missing.
- Chart labels handle long `Sub-Category`, `City`, and `State` names.
- Mixed units (`Sales`, `Profit Margin`, `Discount`, `Quantity`) format correctly.
- Negative profit and high discount values are visually distinguishable without relying on color alone.
- Split panes maintain independent scroll, hover, resize, and focus.
- Floating Dashboard duplicates the original slot; it must not relocate/unmount the original canvas.
- Power BI mixed cases request separate pane tokens when two vendor panes are active.
- High-complex `S05`: row limits, no metadata, token failure, and blocked governance paths render honest non-blank states.

## Release-Candidate Execution Bands

Use these bands to avoid running all 1500 cases every local edit:

| Band | Cases | Selection rule | Use |
|---|---:|---|---|
| Smoke | 30 | `D01,S01` across every surface/layout row | PR sanity |
| Heavy | 300 | all `D01..D10,S03` across every surface/layout row | Nightly |
| Extreme | 1500 | full matrix | Release candidate / design lock |

## Non-Claims

- This catalog does not certify numeric correctness from Genie.
- This catalog does not prove live Power BI embed-token behavior unless real credentials are configured.
- This catalog does not replace accessibility automation; it defines the scenarios those checks should run against.
- This catalog intentionally excludes basic/routine cases because Rajesh requested High to Complex to High-Complex only.
