# AI Insights — Section Archetype Taxonomy

> Research-backed catalog for the "Custom AI Insights Sections" preset library bundled in `genieChatVisual/src/insightsPresetLibrary.ts`. Establishes the canonical archetype library, surfaces hard-coded values that should become parameters, and gives a keep / rename / restructure recommendation for every shipped preset.

---

## Executive summary

- **Two answer-first frameworks (Minto Pyramid + BLUF) should govern every preset.** Each section must lead with the headline number / verdict; supporting data follows. Today's presets already do this for tables, but the SWOT and Variance presets bury the punchline.
- **One hardcoded threshold leaks into the prose: SWOT THREATS uses `>$5,000` profit drop ([insightsPresetLibrary.ts:181](../genieChatVisual/src/insightsPresetLibrary.ts#L181)).** This is currency-specific, scale-specific, and demo-data-specific. It belongs in a `params.materialityUsd` knob, not in the prompt body. No other `$` literals exist in the preset prose; the `change $` tokens at lines 226 and 237 are formatter directives, not thresholds.
- **The bundled library covers 17 presets but is missing five canonical archetypes that modern executive reporting standards consider table-stakes**: BLUF Headline, Pyramid Recommendation, OKR Scorecard, North Star Metric tracker, and AARRR Pirate-Metrics funnel. Recommend adding these (addition-only) and parameterizing SWOT.

---

## Part 1 — Current preset inventory

Source: [genieChatVisual/src/insightsPresetLibrary.ts](../genieChatVisual/src/insightsPresetLibrary.ts) (consumed by [setupStep5.tsx:34](../genieChatVisual/src/setupStep5.tsx#L34)).

### Metric direction presets (3)
| ID | Label | Domain | File:Line | Hardcoded values |
|---|---|---|---|---|
| `retail-sales` | Retail / sales | Retail Performance | L19–24 | All thresholds inlined as prose (e.g. `>=8% growth`, `<=4% return`). Not currency-coupled but locale-coupled. |
| `operations-supply-chain` | Operations / supply chain | Supply Chain Operations | L26–31 | `<=2 days`, `<=1.5 kg CO2/order` etc. — unit-coupled. |
| `healthcare-hospital-ops` | Healthcare / hospital ops | Hospital Operations | L33–38 | Clinical thresholds (`<=4.5 days LOS`, `<=10% readmit`). |

### Custom section presets (14)
| ID | Label | Sections (## HEADERs) | Structure | Hardcoded values flagged |
|---|---|---|---|---|
| `sales-performance` | Sales performance | SEGMENT MOVEMENT, REGION HOTSPOTS, PRODUCT MIX, NEXT ACTIONS | pipe table x3 + numbered list | None |
| `customer-health` | Customer health | CHURN SIGNALS, NPS DRIVERS, SEGMENT GROWTH, SAVE PLAYS | table + bullets x2 + numbered | None |
| `operations-supply-chain` | Operations supply chain | SERVICE GAPS, SUPPLIER RISK, STOCK PRESSURE, OPS ACTIONS | table x2 + bullets + numbered | None |
| `hospital-operations` | Hospital operations | BED PRESSURE, READMISSION COHORTS, FLOW BOTTLENECKS, CARE OPS ACTIONS | table x2 + bullets + numbered | None |
| `hr-workforce` | HR workforce | ATTRITION HOTSPOTS, **HIRING FUNNEL**, PERFORMANCE MIX, WORKFORCE ACTIONS | table x2 + bullets + numbered | None — but "HIRING FUNNEL" is the only funnel section in the library. |
| `finance-budget` | Finance budget | VARIANCE DRIVERS, EXPENSE HOTSPOTS, CASH POSITION, FINANCE ACTIONS | table + bullets + prose + numbered | "materiality threshold" referenced but not defined (L108) — should be a param |
| `superstore-executive-brief` | Superstore executive brief | EXECUTIVE READOUT, DECISION FOCUS | bullets + numbered | Hardcoded segments (`Furniture, Office Supplies, Technology`) — demo-data-coupled |
| `superstore-operational-drilldown` | Superstore operational drilldown | REGION MARGIN MAP, SEGMENT PRESSURE, SHIP MODE SIGNALS, STATE OUTLIERS, FIELD ACTIONS | tables + bullets + numbered | Hardcoded `Central, East, South, West` and `Consumer, Corporate, Home Office` |
| `superstore-merchandising-focus` | Superstore merchandising focus | CATEGORY MIX, SUBCATEGORY RANKING, LOSS MAKERS, MERCH ACTIONS | tables + bullets + numbered | Same demo-coupling |
| `superstore-growth-opportunities` | Superstore growth opportunities | SEGMENT GROWTH, GEOGRAPHIC UPSIDE, ATTACH PLAYS | table + bullets + numbered | Same demo-coupling |
| `superstore-risk-and-compliance` | Superstore risk and compliance | RETURN EXPOSURE, DISCOUNT ABUSE, MARGIN EROSION, CONTROL ACTIONS | tables + bullets + numbered | Same demo-coupling |
| `swot-analysis` | SWOT analysis | STRENGTHS, WEAKNESSES, OPPORTUNITIES, THREATS | bullets x4 with thresholds | **`margin > 15%`, `margin < 5%`, `growth > 20%`, `margin < 10%`, and the offending `>$5,000` profit-drop threshold at L181** |
| `bcg-matrix` | BCG growth-share matrix | STARS, CASH-COWS, QUESTION-MARKS, DOGS | bullets x4 (median split) | `margin > 15%` (L193) — strategy-rule, not currency |
| `rfm-segmentation` | RFM customer segmentation | CHAMPIONS, AT-RISK, HIBERNATING, PROMISING | bullets x4 (quintile-based) | Quintile cuts inline — could be `params.quantiles` |
| `pareto-8020` | Pareto 80/20 analysis | CUSTOMER PARETO, PRODUCT PARETO, REVENUE AT RISK | bullets + bend-point analysis | `>20% revenue drop` (L216) — should be `params.atRiskThresholdPct` |
| `variance-bridge` | Variance / waterfall analysis | PROFIT BRIDGE, REGIONAL CONTRIBUTION, REVENUE VARIANCE, ATTRIBUTION ACTIONS | bullets + waterfall + numbered | None hardcoded; formula-driven |
| `anomaly-detection` | Anomaly / outlier detection | MONTHLY ANOMALIES, MARGIN ANOMALIES, DISCOUNT ANOMALIES, CONTROL RECOMMENDATIONS | bullets x3 + numbered | `z > 2` (L237, L238), `z > 1.5` (L239) — should be `params.zScoreThreshold` |

**Important finding**: there is **no "Marketing Funnel" preset**. The user's mental model conflated the `HIRING FUNNEL` section inside `hr-workforce` with a marketing funnel preset. The library has zero AARRR / Pirate-Metrics / marketing-funnel coverage today.

---

## Part 2 — Recommended canonical archetype library

Each row = one section archetype. Pick-and-mix into presets. Authors cited inline; numbered references at the foot.

| # | Archetype | Answers | Origin / framework | Typical structure | When to use | Suggested parameters |
|---|---|---|---|---|---|---|
| 1 | **BLUF Headline** | "What is the verdict in one sentence?" | U.S. military comms, formalized in field manuals; popularized in business by Animalz, Persimmon Group [1][2] | Single bold sentence + one supporting number | Top of every report; replaces "Executive readout" intro | `tone`, `maxWords` |
| 2 | **Pyramid Recommendation** | "What is the answer, supported by 3 reasons?" | Barbara Minto, *The Minto Pyramid Principle* (1987), McKinsey [3] | Bold answer → 3 sub-points → evidence under each | Replacement for unstructured "executive summary" | `numSupportingReasons` (default 3) |
| 3 | **SCQA Brief** | "Situation, complication, question, answer" | Minto, applied to introductions [3][4] | 4 short paragraphs in S-C-Q-A order | Briefing notes, decision memos | `complicationFraming` (risk vs opportunity) |
| 4 | **SWOT (Quantified)** | "Where are we strong/weak/exposed?" | SRI, Albert Humphrey, TAPP project 1960–70 (originally SOFT, renamed at Zurich 1964) [5][6] | 4 bullet groups | Annual planning, board prep | `materialityCurrency`, `materialityValue`, `growthThresholdPct`, `marginThresholdPct`, `timeHorizon` |
| 5 | **BCG Growth-Share** | "Which units to invest, milk, fix, kill?" | Bruce Henderson, BCG, *Perspectives* "The Product Portfolio" 1970 [7] | 2x2 quadrant w/ median splits | Portfolio review, capital allocation | `splitMethod` (median/mean/manual), `divestMarginFloorPct` |
| 6 | **Eisenhower / Urgent-Important** | "What to do, schedule, delegate, drop?" | Dwight D. Eisenhower 1954 speech; popularized as a 2x2 by Stephen Covey, *7 Habits* (1989) [8] | 2x2 quadrant | Action prioritization at end of report | `urgencyHorizonDays` |
| 7 | **RICE Score** | "Which initiatives win the prioritization race?" | Sean McBride, Intercom, 2016 [9] | Scored table: Reach × Impact × Confidence ÷ Effort | Backlog triage, roadmap | `reachWindow` (mo/qtr), `effortUnit` (person-weeks) |
| 8 | **OKR Scorecard** | "Are we on track against objectives?" | Andy Grove, Intel (1970s); coined "OKR" by John Doerr; Doerr's *Measure What Matters* (2018) [10] | Objective + 3-5 KRs with 0.0-1.0 score | Quarterly business review | `scoreThreshold`, `cadence` |
| 9 | **North Star Metric Tracker** | "Is our one number moving?" | Sean Ellis (coined "growth hacking"), formalized as framework by John Cutler @ Amplitude [11] | Single metric + 3-5 input metrics | Growth-team weekly | `metricDefinition`, `targetTrajectory` |
| 10 | **AARRR / Pirate Metrics** | "Where in the funnel are users leaking?" | Dave McClure, 500 Startups, Ignite Seattle 2007 [12] | Funnel: Acquisition → Activation → Retention → Referral → Revenue | Marketing/product growth review | `cohortWindowDays`, `revenueDefinition` |
| 11 | **RFM Segmentation** | "Which customers to retain, win-back, prune?" | Roots in 1930s direct mail; formalized by Arthur Hughes, *Strategic Database Marketing* (1994) [13] | Quintile-cut tables: Champions / At-risk / Hibernating / Promising | CRM and lifecycle marketing | `quantileCount` (default 5), `recencyWindowDays` |
| 12 | **Pareto 80/20** | "Which few drive the many?" | Vilfredo Pareto (1896 income study); applied to QC by Joseph Juran (1941) [14] | Sorted bar + cumulative line + bend-point callout | Concentration risk, top-N analysis | `concentrationTargetPct` (default 80), `atRiskThresholdPct` |
| 13 | **Variance Bridge / Waterfall** | "What drove the change vs prior?" | FP&A standard; PVM decomposition documented by FTI Consulting, Zebra BI, FP&A Trends [15] | Waterfall: prior → volume → price → mix → new → discontinued → current | Monthly close, plan vs actual | `comparisonPeriod`, `decompositionLevel` (Cat/SubCat) |
| 14 | **Anomaly Z-Score** | "What is statistically unusual this period?" | Statistical process control (Shewhart, Western Electric rules 1956); modernized as monitoring/alerting | Table: metric, baseline μ, current, σ, z-score, flag | Quality / risk surveillance | `zScoreThreshold` (default 2.0), `baselineWindow` |
| 15 | **Cohort Retention Grid** | "Are newer cohorts retaining better?" | DAU/MAU and cohort analysis literature; Eric Ries *Lean Startup* (2011); Amplitude Behavioral Cohorts | Triangular heatmap: cohort × period | SaaS retention, lifecycle | `cohortGranularity` (week/mo), `lookbackPeriods` |
| 16 | **MoSCoW Prioritization** | "Must / Should / Could / Won't have?" | Dai Clegg, Oracle UK (DSDM Atern, 1994) | 4 buckets, must-have callouts | Scoping, release planning | None (categorical) |
| 17 | **NPS Driver Decomposition** | "What's lifting / dragging promoter score?" | Fred Reichheld, *The Ultimate Question* (2006), Bain | 2 bullet groups (lift / drag) + driver list | Quarterly CX review | `npsBands` (default −100..+100) |
| 18 | **Risk Heatmap** | "Where do likelihood × impact concentrate?" | COSO ERM (2004), ISO 31000 (2009) | 5x5 likelihood × impact matrix | Compliance, ops risk review | `bandsLikelihood`, `bandsImpact` |
| 19 | **OKR-style Decision Focus** | "Top 3 decisions this period?" | Hybrid of Pyramid Principle + OKR cadence [3][10] | Numbered list (3) with owner + financial outcome | Closing slide of any executive deck | `numDecisions` (default 3), `requireOwner` (bool) |
| 20 | **IBCS Notation Summary** | "Single chart-grade comparison row" | Rolf Hichert, IBCS Association; SUCCESS rules [16] | One IBCS-styled comparison block (AC/PY/PL/FC) | Standardized monthly KPI rows | `comparisonScenarios`, `varianceFormat` (abs/pct) |
| 21 | **Loss-Maker Drilldown** (existing) | "Which items destroy profit?" | Common merchandising practice; close kin to BCG Dogs | Bullets + bold for negative-profit items | Retail merch review | `lossThresholdPct` |
| 22 | **Geographic Heatmap Summary** | "Where does the map concentrate?" | Stephen Few, *Information Dashboard Design* (2006) — at-a-glance principle [17] | Region-ranked table or heatmap | Region/territory review | `regionField`, `topN` |

---

## Part 3 — Recommendation per existing preset

| Preset id | Action | Rationale |
|---|---|---|
| `retail-sales` (metric direction) | **Keep** | Threshold rules are appropriate as a vocabulary; not currency-coupled. |
| `operations-supply-chain` (metric) | **Keep** | Same. |
| `healthcare-hospital-ops` (metric) | **Keep** | Same. |
| `sales-performance` | **Keep** | Clean structure, no hardcoding. Aligns with archetype #1 + #19. |
| `customer-health` | **Keep**; consider adding NPS Driver Decomposition (#17) as 5th section | Currently bullets NPS — promote to a structured driver decomposition. |
| `operations-supply-chain` (custom) | **Keep** | No hardcoded values; structure is sound. |
| `hospital-operations` | **Keep** | Same. |
| `hr-workforce` | **Keep**; **rename "HIRING FUNNEL" → "RECRUITING FUNNEL"** | Avoid colliding with future AARRR marketing funnel preset. |
| `finance-budget` | **Restructure**: hoist `materialityThreshold` into preset-level `params` and reference as `{{materialityThreshold}}` in the prompt | Currently the prompt says "above the materiality threshold" without ever defining it. |
| `superstore-*` (5 presets) | **Keep as demo, rename to `demo-superstore-*`** | These are dataset-specific. Marking them clearly as demo prevents users from selecting them on non-Superstore data. |
| `swot-analysis` | **Restructure — parameterize** | Hardcoded `>$5,000` (L181) MUST become a `params.materiality: { currency, value }` knob. Also lift `15%`, `5%`, `20%`, `10%` to `params.thresholds.{strongMargin, weakMargin, growthFloor, opportunityMarginCeiling}`. The preset should ship with sane defaults but render `{{materialityFmt}}` into the prompt at use-time. |
| `bcg-matrix` | **Keep**; consider param for `divestMarginFloorPct` (currently `>15%`) | Strategy rule, low priority. |
| `rfm-segmentation` | **Keep**; consider `params.quantileCount` | Quintile is industry standard but quartile is also common. |
| `pareto-8020` | **Restructure**: lift `>20% revenue drop` (L216) into `params.atRiskThresholdPct` | Same currency-of-thinking issue as SWOT. |
| `variance-bridge` | **Keep** | Formula-driven, no hardcoding. Best-in-class structure. |
| `anomaly-detection` | **Restructure**: `z > 2` and `z > 1.5` → `params.zScoreThreshold` | Two of three sections use the same constant; centralize. |

### New presets to add (addition-only)
1. `bluf-headline` — wraps archetype #1 (single section).
2. `pyramid-recommendation` — wraps archetype #2 + #3.
3. `okr-scorecard` — wraps archetype #8.
4. `north-star` — wraps archetype #9.
5. `aarrr-pirate-metrics` — wraps archetype #10. (This is the missing "marketing funnel" the user expected.)

---

## Part 4 — Implementation note

All changes are **addition-only** in two files plus a new optional types extension:

1. **[genieChatVisual/src/insightsPresetLibrary.ts](../genieChatVisual/src/insightsPresetLibrary.ts)**
   - Extend `CustomSectionPreset` with optional `params?: Record<string, ParamSpec>` and `defaults?: Record<string, unknown>`. Existing presets with no `params` continue to work unchanged.
   - Add `{{materialityFmt}}`, `{{strongMarginPct}}`, etc. token interpolation for the SWOT, Pareto, and anomaly presets.
   - Append the 5 new presets at the end of `CUSTOM_SECTION_PRESETS`.
2. **[genieChatVisual/src/setupStep5.tsx](../genieChatVisual/src/setupStep5.tsx)** (consumer at L1039, L1062)
   - When a selected preset has `params`, render a small param panel below the preset card (use existing format-pane primitives).
   - Token-interpolate before injecting the section text into `instruction`.
3. **[genieChatVisual/src/visualHelpers.ts](../genieChatVisual/src/visualHelpers.ts)** (`buildInsightsStagePrompts`)
   - No structural change required. Just pass interpolated text through.

Per the Wave 22 sanitization tripwire ([genieChatVisual/tests/security.test.ts](../genieChatVisual/tests/security.test.ts)), any new `{{token}}` interpolation MUST flow through the existing sanitizer pipeline before reaching the Genie prompt. Do not bypass it.

Per the Wave 27 cache-key tripwire, do NOT change preset `id`s in place — the Superstore renames above must use **new** ids (e.g., `demo-superstore-executive-brief`) and leave the old ids as deprecated aliases for at least one release, otherwise every cached Insights run on disk is invalidated with no migration.

---

## References

1. Wikipedia — *BLUF (communication)*. <https://en.wikipedia.org/wiki/BLUF_(communication)>
2. Animalz — *BLUF: The Military Standard That Can Make Your Writing More Powerful*. <https://www.animalz.co/blog/bottom-line-up-front>
3. Minto, Barbara. *The Pyramid Principle: Logic in Writing and Thinking* (1st ed. 1987). Overview: <https://modelthinkers.com/mental-model/minto-pyramid-scqa>; think-cell summary: <https://www.think-cell.com/en/resources/content-hub/using-the-pyramid-principle-to-build-better-powerpoint-presentations>
4. ManagementConsulted — *SCQA Framework*. <https://managementconsulted.com/scqa-framework/>
5. Humphrey, Albert S. — *SWOT Analysis for Management Consulting*, SRI Alumni Newsletter (2005). Mirror: <https://universe.bits-pilani.ac.in/uploads/SWOT%20Analysis.pdf>
6. Wikipedia — *Albert S. Humphrey*. <https://en.wikipedia.org/wiki/Albert_S._Humphrey>
7. Henderson, Bruce D. — *The Product Portfolio*, BCG Perspectives (1970). BCG retrospective: <https://www.bcg.com/about/overview/our-history/growth-share-matrix>; Wikipedia: <https://en.wikipedia.org/wiki/Growth%E2%80%93share_matrix>
8. Covey, Stephen. *The 7 Habits of Highly Effective People* (1989); see also Eisenhower's 1954 Northwestern speech. Background: <https://www.todoist.com/productivity-methods/eisenhower-matrix>; <https://en.wikipedia.org/wiki/First_Things_First_(book)>
9. McBride, Sean — *RICE: Simple prioritization for product managers*, Intercom blog (2016). <https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/>
10. Doerr, John — *Measure What Matters* (Penguin, 2018); Grove, Andy — *High Output Management* (1983). History: <https://www.whatmatters.com/articles/the-origin-story>
11. Ellis, Sean — *Finding the Right North Star Metric*, GrowthHackers (2017). <https://medium.com/growthhackers/finding-your-north-star-metric-fc1c1f71cbcb>
12. McClure, Dave — *Startup Metrics for Pirates*, Ignite Seattle (2007). Slides: <https://www.slideshare.net/slideshow/startup-metrics-for-pirates-long-version/89026>; Inc. retrospective: <https://www.inc.com/walter-chen/aarrr-dave-mcclure-s-pirate-metrics-and-the-only-five-numbers-that-matter.html>
13. Hughes, Arthur M. — *Strategic Database Marketing* (1994). Wikipedia overview: <https://en.wikipedia.org/wiki/RFM_(market_research)>
14. Juran, Joseph M. — *Quality Control Handbook* (1951), naming the Pareto Principle after Vilfredo Pareto's 1896 *Cours d'économie politique*. Wikipedia: <https://en.wikipedia.org/wiki/Pareto_principle>; Juran Institute: <https://www.juran.com/blog/a-guide-to-the-pareto-principle-80-20-rule-pareto-analysis/>
15. FTI Consulting — *A Quantifiable Approach To Price Volume Mix Analysis*. <https://www.fticonsulting.com/insights/white-papers/quantifiable-approach-price-volume-mix-analysis>; CFO Secrets — *Art and Science of Variance Analysis*. <https://www.cfosecrets.io/p/art-and-science-of-variance-analysis>
16. Hichert, Rolf & Faisst, Jürgen — *International Business Communication Standards (IBCS) v1.2* (IBCS Association). <https://www.ibcs.com/ibcs-standards-1-2/>; Wikipedia: <https://en.wikipedia.org/wiki/International_Business_Communication_Standards>
17. Few, Stephen — *Information Dashboard Design: Displaying Data for At-a-Glance Monitoring* (Analytics Press, 2nd ed. 2013). <https://www.amazon.com/Information-Dashboard-Design-At-Glance/dp/1938377001>
