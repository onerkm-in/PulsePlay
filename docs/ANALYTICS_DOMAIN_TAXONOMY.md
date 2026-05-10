# Analytics Domain Taxonomy — Recommendation

> Research-backed proposal for the canonical "Analytics Domain" preset list exposed by the AI Insights Section A picker.
> Source of truth today: `genieChatVisual/src/setupStep5.tsx:46-59` (`DOMAIN_PRESETS`) and `genieChatVisual/src/insightsPresetLibrary.ts` (preset bundles).
> Author: deep-research analyst pass, 2026-05-06.

## Executive summary

- **The list is bigger than the README implies.** The shipped `DOMAIN_PRESETS` array already exposes 12 entries (not 3), but the visible "famous" trio (Sales / Supply Chain / Hospital) is what gets cited in hint text and examples. The real gap is *consistency of naming* across the array, the prompt-hint copy, and the bundled preset libraries.
- **Most labels are close to industry-standard but a few drift.** "Hospital Operations" should align with Arcadia/insightsoftware/HIMSS convention as **Healthcare Operations** (with Hospital Operations kept as an alias). "Operations & Logistics" duplicates "Supply Chain Operations" and should be renamed **Logistics & Distribution** or merged. "Public Sector Programs" is non-standard — APQC, Gartner and vendor templates use **Public Sector / Government Services**.
- **Six high-demand domains are missing.** FP&A (separate from "Financial Performance"), Marketing Funnel / Demand Gen, Risk & Compliance, IT Service Management (ITSM), Manufacturing OEE, and ESG / Sustainability are recurring asks in vendor templates (Microsoft Fabric, Power BI, Tableau, ThoughtSpot) and in McKinsey/Gartner functional taxonomies. Adding these is addition-only — no removal of existing labels needed for backward compatibility of saved settings.

## Current state inventory

Every preset shipped today, with runtime effect:

| # | Label | Where defined | Runtime behaviour |
|---|---|---|---|
| 1 | Sales Performance | `setupStep5.tsx:47` | Vocabulary anchor in `buildInsightsStagePrompts`. Bundled `sales-performance` preset (`insightsPresetLibrary.ts:43-53`). |
| 2 | Marketing Analytics | `setupStep5.tsx:48` | Label only. No bundled preset. |
| 3 | Operations & Logistics | `setupStep5.tsx:49` | Label only; semantically overlaps #4. No bundled preset. |
| 4 | Supply Chain Operations | `setupStep5.tsx:50` | Bundled custom-section + metric-direction presets (`insightsPresetLibrary.ts:25-31, 67-77`). |
| 5 | Customer Success | `setupStep5.tsx:51` | Bundled `customer-health` + `rfm-segmentation` (`insightsPresetLibrary.ts:55-65, 197-207`). |
| 6 | Financial Performance | `setupStep5.tsx:52` | Bundled `finance-budget` (`insightsPresetLibrary.ts:103-113`). |
| 7 | HR Analytics | `setupStep5.tsx:53` | Bundled `hr-workforce` (`insightsPresetLibrary.ts:91-101`). |
| 8 | Hospital Operations | `setupStep5.tsx:54` | Bundled `hospital-operations` + `healthcare-hospital-ops` (`insightsPresetLibrary.ts:32-38, 79-89`). |
| 9 | Retail Performance | `setupStep5.tsx:55` | Bundled `retail-sales` + four `superstore-*` presets (`insightsPresetLibrary.ts:18-24, 115-171`). |
| 10 | Manufacturing Quality | `setupStep5.tsx:56` | Label only. No bundled preset. |
| 11 | Education Analytics | `setupStep5.tsx:57` | Label only. No bundled preset. |
| 12 | Public Sector Programs | `setupStep5.tsx:58` | Label only. No bundled preset. |
| — | Custom text | `setupStep5.tsx:982-987` | Free-text input; verbatim vocabulary anchor. |

Domains referenced inside `insightsPresetLibrary.ts` but absent from `DOMAIN_PRESETS`: **Strategic Analysis** (SWOT/BCG/Pareto, lines 176/188/212), **Financial Analysis** (Variance, line 223), **Quality / Risk** (Anomaly, line 235).

Tripwire: when an `insightsPresetLibrary.ts` preset is applied and `insightsDomain` is blank, `CustomSectionPresetPicker` (`setupStep5.tsx:1042`) writes the preset's `domain` verbatim — including the three labels above that the dropdown does not list. Worth fixing as part of taxonomy normalisation.

## Recommended canonical list

Sorted roughly by likelihood of executive demand. "Source of name" notes the most authoritative external label; "Change vs today" flags whether our existing label needs editing.

| # | Canonical label | One-line description | Typical KPIs (3–5) | Source of name | Change vs today |
|---|---|---|---|---|---|
| 1 | **Sales Performance** | Pipeline, bookings, win-rate, segment/region revenue. | Bookings, Win Rate, ACV, Pipeline Coverage, Quota Attainment | [4][9] | Keep. |
| 2 | **Marketing Funnel & Demand Gen** | Top-of-funnel through MQL/SQL conversion, channel ROI. | MQL→SQL %, CPL, CAC, ROAS, Funnel Velocity | [3][4] | Rename from "Marketing Analytics" (keep alias). |
| 3 | **Customer Success & Retention** | Health scores, churn, NRR/GRR, expansion plays. | NRR, GRR, Logo Churn, NPS, Health Score | [4][9] | Rename from "Customer Success"; add NRR/GRR vocabulary. |
| 4 | **Financial Performance (Reporting)** | Backwards-looking P&L, cash, balance-sheet for accounting. | Revenue, Gross Margin %, EBITDA, DSO, Operating Cash Flow | [6] | Keep. Distinguish from FP&A. |
| 5 | **FP&A — Planning & Forecasting** | Forward-looking budget/forecast, variance, scenario planning. | Budget Variance %, Forecast Accuracy, Run-Rate, Plan-to-Actual | [6] | **NEW** — most-requested miss. |
| 6 | **Supply Chain & Logistics Performance** | OTIF, lead time, inventory health, supplier risk. | OTIF %, On-time Ship %, Stock-out Rate, Inventory Days, Forecast Accuracy | [10] | Rename "Supply Chain Operations"; **merge** "Operations & Logistics" in (alias both). |
| 7 | **Manufacturing & OEE** | Production efficiency on OEE = Availability × Performance × Quality. | OEE %, Availability, Performance, Quality, Throughput | [7] | Rename "Manufacturing Quality" — Quality is one OEE pillar, not the domain. |
| 8 | **Retail & E-Commerce** | Same-store sales, basket, conversion, returns, discount mix. | Same-store Sales %, AOV, Conversion Rate, Return Rate, Discount % | [4] | Rename "Retail Performance" to cover digital channel. |
| 9 | **People & Workforce Analytics** | Workforce composition, attrition, hiring funnel, engagement. | Attrition %, Time-to-Fill, Engagement Score, Internal Mobility % | [11] | Rename "HR Analytics" — "People Analytics" is the post-2018 standard term. |
| 10 | **Healthcare Operations** | Bed pressure, length of stay, readmission, ER flow, cost per discharge. | ALOS, Readmission Rate, Bed Occupancy %, ER Wait Time, Cost per Discharge | [12] | Rename "Hospital Operations" (keep as alias for facility-only setups). |
| 11 | **Risk, Audit & Compliance** | Control effectiveness, audit findings, incident exposure, regulatory KPIs. | Open Audit Findings, Loss Event Rate, Compliance Coverage %, Risk Score | [14] | **NEW** — universal in enterprise template galleries. |
| 12 | **IT Service Management (ITSM)** | Incident, change, problem, service-desk — ITIL 4 aligned. | MTTR, MTTA, Change Success Rate, First Contact Resolution, SLA Attainment | ITIL 4 | **NEW** — recurring ask in IT-org Power BI. |
| 13 | **ESG & Sustainability** | Environmental, social, governance metrics aligned to GRI/SASB/TCFD. | Scope 1/2/3 Emissions, Energy Intensity, Diversity Ratio, Board Independence % | [13] | **NEW** — non-optional for 2026 enterprise rollouts. |
| 14 | **Education & Student Outcomes** | Enrolment, persistence, attainment, equity gaps. | Enrolment Yield, Persistence Rate, Graduation Rate, Equity Gap | EDUCAUSE / NCES | Rename "Education Analytics". |
| 15 | **Public Sector & Government Services** | Citizen-service performance, program outcomes, public-finance reporting. | Service Wait Time, Program Take-Up Rate, Cost per Citizen Served, Audit Compliance | [10] | Rename "Public Sector Programs" — matches OECD/APQC. |
| 16 | **Strategic Analysis (SWOT / BCG / Pareto)** | Cross-domain strategic frames over bound metrics. | Star/Cash-Cow/Question-Mark mix, 80/20 concentration, SWOT counts | own (lines 176/188/212) | **ADD to dropdown** — silently injected today by preset picker. |
| 17 | **Financial Analysis (Variance / Bridge)** | Decompose period-over-period change into volume/mix/margin/FX. | Volume Variance, Price Variance, Mix Variance, FX Effect, Profit Bridge $ | [8] + own (line 223) | **ADD to dropdown** — silently injected today. Distinct from #4 and #5. |
| 18 | **Quality, Risk & Anomaly Detection** | Statistical outliers, defect rates, control-chart monitoring. | Defect Rate, Z-score Outliers, Control-Chart Breaches, FPY %, Cpk | Six Sigma / SPC + own (line 235) | **ADD to dropdown** — silently injected today. |

Notes on disagreement and contested terms:

- **"HR Analytics" vs "People Analytics"**: Bersin's research and most post-2020 vendor literature have moved to "People Analytics"; "HR Analytics" still appears in older Tableau/Power BI templates [4][11]. Recommendation: ship "People & Workforce Analytics" as primary label and keep "HR Analytics" as a recognised alias for backward-compat.
- **"Customer Success" vs "Customer Experience"**: SaaS-heavy taxonomies prefer "Customer Success & Retention" (post-sale lifecycle). "Customer Experience" is a broader umbrella that also covers pre-sale and survey instrumentation. Keep them separate; we currently only need #3.
- **Gartner's Analytics Maturity Model is *not* a domain taxonomy** — it's a capability model (Descriptive/Diagnostic/Predictive/Prescriptive across People/Process/Technology) [1][2]. It is useful as a *positioning* framework, not as a domain list. Earlier internal references that cited Gartner for the domain list are technically mis-attributed.
- **IBCS** governs notation and visual grammar (the SUCCESS rules) [8]. It does not prescribe domain categories. Keep it cited only where it informs *variance reporting* conventions (#17), not the dropdown structure.

## Gaps to add (ranked by likelihood of executive demand)

1. **FP&A — Planning & Forecasting** (#5). Highest demand — present in every BI vendor's template gallery and a top hit in finance leadership surveys [6].
2. **ESG & Sustainability** (#13). Becoming non-optional under CSRD/SEC climate-disclosure rules; OECD review of ESG metrics confirms it has crystallised into a standalone domain [13].
3. **Risk, Audit & Compliance** (#11). Asked for by every regulated industry (banking, insurance, healthcare).
4. **IT Service Management (ITSM)** (#12). Universal inside IT departments; aligns to ITIL 4.
5. **Manufacturing & OEE** (#7, rename existing). Manufacturing customers expect to see "OEE" in the label, not just "Quality" [7].
6. **Marketing Funnel & Demand Gen** (#2, rename existing). "Marketing Analytics" is too vague; the funnel metaphor anchors vocabulary much better.

## Implementation note

Editing target is **single-file, addition-only** to preserve backward compatibility of every author's saved `insightsDomain` string. No deletions; existing labels become recognised aliases.

1. **`genieChatVisual/src/setupStep5.tsx:46-59`** — replace `DOMAIN_PRESETS` with the 18-row canonical list. Order matters (it's the dropdown order); recommend grouping by function (Commercial → Finance → Operations → People → Public-good → Cross-cutting frames).
2. **`genieChatVisual/src/setupStep5.tsx:155-160`** — update the hint/example text on the `insightsDomain` FieldMeta entry to cite the new flagship examples (Sales Performance · FP&A · Healthcare Operations · ESG & Sustainability).
3. **`genieChatVisual/src/insightsPresetLibrary.ts`** — add `domain:` strings on the existing SWOT/BCG/Pareto/Variance/Anomaly presets that match the new canonical labels (Strategic Analysis, Financial Analysis, Quality Risk & Anomaly Detection). No new presets required for the launch — the dropdown can list the label even when no bundled custom-section preset exists today (matches current behaviour for Marketing/Operations/Manufacturing/Education/Public Sector).
4. **Optional alias map** (small new export in `setupStep5.tsx`) so the `DomainPicker` mode-detection at `setupStep5.tsx:962` resolves "HR Analytics" → "People & Workforce Analytics" etc. without user-visible flicker for existing reports.
5. **Tests**: extend the existing Section A / Section C unit tests in `genieChatVisual/tests/` to assert the dropdown contains the 18 canonical labels and that aliasing resolves the legacy 12 strings.

No changes required in `settings.ts`, `visualHelpers.ts`, `insightsCache.ts`, or `capabilities.json` — `insightsDomain` is already a free-text field and the cache key is on the verbatim string (Wave 27 tripwire respected).

## References

1. [Gartner's Analytics Maturity Model | Digital.ai](https://digital.ai/catalyst-blog/it-decision-making-through-the-lens-of-gartners-analytics-maturity-model/)
2. [The Gartner Data and Analytics Maturity Assessment for CDAOs](https://www.gartner.com/en/data-analytics/research/data-analytics-maturity-score)
3. [Tableau Dashboard Templates Workbook (Plattner)](https://www.tableau.com/blog/jeff-plattner-start-saving-time-tableau-dashboard-templates-workbook)
4. [32 Best Power BI Dashboard Examples & Templates 2026 — Coupler.io](https://blog.coupler.io/power-bi-dashboard-examples/)
5. [Industry Solutions in Microsoft Fabric — Microsoft Learn](https://learn.microsoft.com/en-us/industry/industry-data-solutions-fabric)
6. [KPIs in FP&A: Measuring What Matters Most — Corporate Finance Institute](https://corporatefinanceinstitute.com/resources/fpa/kpis-in-fpa-measuring-what-matters-most/) and [10 Key Metrics & KPIs Every FP&A Professional Should Track — Apliqo](https://www.apliqo.com/resources/blog/10-key-metrics-and-kpis-every-fp-a-professional-should-track)
7. [What Is OEE? — OEE.com](https://www.oee.com/) and [Overall Equipment Effectiveness — Lean Production](https://www.leanproduction.com/oee/)
8. [International Business Communication Standards — IBCS Association](https://www.ibcs.com/) and [IBCS — Wikipedia](https://en.wikipedia.org/wiki/International_Business_Communication_Standards)
9. [ThoughtSpot Adds Analytics App Templates — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/252517952/ThoughtSpot-adds-analytics-app-templates-more-automation)
10. [APQC Process Classification Framework (PCF) — Cross-Industry](https://www.apqc.org/resource-library/resource-collection/apqcs-process-classification-framework-pcf-cross-industry-and)
11. [Definitive Guide to People Analytics — Josh Bersin](https://joshbersin.com/definitive-guide-to-people-analytics/) and [Systemic People Analytics — Josh Bersin](https://joshbersin.com/systemic-people-analytics/)
12. [Clinical & Business Intelligence — HIMSS Analytics](https://www.himssanalytics.org/himss-taxonomy-topics/clinical-business-intelligence) and [25 Best Healthcare KPIs — insightsoftware](https://insightsoftware.com/blog/25-best-healthcare-kpis-and-metric-examples/)
13. [Behind ESG Ratings — OECD (2025)](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/02/behind-esg-ratings_4591b8bb/3f055f0c-en.pdf) and [ESG Metrics — TechTarget](https://www.techtarget.com/sustainability/feature/ESG-metrics-Tips-and-examples-for-measuring-ESG-performance)
14. [What Matters: How to Scale Advanced Analytics in Corporate Functions — McKinsey](https://www.mckinsey.com/capabilities/operations/our-insights/what-matters-how-to-scale-advanced-analytics-in-corporate-functions)
