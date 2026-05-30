export type MetricDirectionPreset = {
    id: string;
    label: string;
    description: string;
    domain: string;
    rules: string;
};

// Wave 32.5 — parameterised presets.
//
// Some of the strategic-framework presets (SWOT, Pareto, BCG, anomaly,
// finance-budget) historically baked currency thresholds and percentage
// breakpoints into the prompt prose. Hardcoded values like `>$5,000` profit
// drop or `>20% revenue drop` silently became wrong the moment an author
// switched the report into INR / EUR / a different scale, since the prompt
// still asked Genie to flag thousands of US-dollar movements.
//
// Wave 32.5 separates **params** (typed, defaulted, sanitised) from the
// **prose** (which references params via `{{params.X}}` tokens). The Apply
// flow shows a small inline form before applying so the author edits the
// numbers in *one* place; the resulting interpolated prose is what gets
// written to `insightsCustomSections` (so existing reports continue to work
// — they already hold the materialised prose). No breaking change.
export interface PresetParam {
    type: "currency" | "percent" | "number" | "string" | "period";
    default: string | number;
    label: string;
    description?: string;
}

export type CustomSectionPreset = {
    id: string;
    label: string;
    description: string;
    domain: string;
    /**
     * Optional typed parameters. When present, the preset prose contains
     * `{{params.X}}` tokens that must be interpolated before the JSON is
     * written to `insightsCustomSections`. Missing → legacy preset, prose
     * is applied as-is.
     */
    params?: Record<string, PresetParam>;
    sections: Array<{ name: string; instruction: string }>;
    /**
     * 2026-05-28 — bundled metric direction rules. When a picker applies
     * this preset AND the caller passes an onApplyMetricRules handler,
     * these rules are written to `metricDirectionRules` in the same
     * action. Bundles the strategic-framework choice with the metric
     * semantics so the user gets a coherent setup in one click instead
     * of picking two presets separately.
     *
     * Optional — legacy presets without this field continue to apply
     * sections only; the caller's metric rules state is untouched.
     */
    metricDirectionRules?: string;
};

export const METRIC_DIRECTION_PRESETS: MetricDirectionPreset[] = [
    {
        id: "retail-sales",
        label: "Retail / sales",
        description: "Revenue, margin, returns, AOV, CAC, repeat purchase, stock and discounting.",
        domain: "Retail Performance",
        rules: "Total Sales/Revenue higher is better: 🟢 >=8% growth, 🟡 0-7.9%, 🔴 <0%. Profit/Gross Margin higher is better: 🟢 >=10% growth or >=35% margin, 🟡 3-9.9% or 25-34.9%, 🔴 <3% or <25%. Profit Margin % higher is better: 🟢 >=32%, 🟡 22-31.9%, 🔴 <22%. Orders/Transactions higher is better: 🟢 >=6% growth, 🟡 0-5.9%, 🔴 <0%. Return Rate lower is better: 🟢 <=4%, 🟡 >4-8%, 🔴 >8%. Avg Order Value higher is better: 🟢 >=5% growth, 🟡 0-4.9%, 🔴 <0%. CAC lower is better: 🟢 <=12% of AOV, 🟡 >12-20%, 🔴 >20%. Repeat Purchase Rate higher is better: 🟢 >=35%, 🟡 20-34.9%, 🔴 <20%. Stock Turnover higher is better: 🟢 >=6x, 🟡 3-5.9x, 🔴 <3x. Discount % lower is better: 🟢 <=12%, 🟡 >12-25%, 🔴 >25%. Cart Abandonment Rate lower is better: 🟢 <=65%, 🟡 >65-75%, 🔴 >75%."
    },
    {
        id: "operations-supply-chain",
        label: "Operations / supply chain",
        description: "OTIF, cycle time, shipping days, stock-outs, suppliers, quality and emissions.",
        domain: "Supply Chain Operations",
        rules: "OTIF % higher is better: 🟢 >=95%, 🟡 90-94.9%, 🔴 <90%. Order Cycle Time lower is better: 🟢 <=2 days, 🟡 >2-5, 🔴 >5. Avg Days To Ship lower is better: 🟢 <=1.5, 🟡 >1.5-3, 🔴 >3. Stock Out Rate lower is better: 🟢 <=2%, 🟡 >2-5%, 🔴 >5%. Supplier Lead Time lower is better: 🟢 <=7 days, 🟡 >7-14, 🔴 >14. Defect/Quality Failure Rate lower is better: 🟢 <=1%, 🟡 >1-3%, 🔴 >3%. Inventory Days lower is better unless service risk rises: 🟢 30-60, 🟡 61-90 or 20-29, 🔴 >90 or <20. Forecast Accuracy % higher is better: 🟢 >=85%, 🟡 70-84.9%, 🔴 <70%. Return Rate lower is better: 🟢 <=3%, 🟡 >3-7%, 🔴 >7%. Pick Accuracy higher is better: 🟢 >=99%, 🟡 97-98.9%, 🔴 <97%. Carbon Emissions per Order lower is better: 🟢 <=1.5 kg, 🟡 >1.5-3 kg, 🔴 >3 kg."
    },
    {
        id: "healthcare-hospital-ops",
        label: "Healthcare / hospital ops",
        description: "Length of stay, readmissions, occupancy, wait time, safety, cost and staffing.",
        domain: "Hospital Operations",
        rules: "Avg Length of Stay lower is usually better: 🟢 <=4.5 days, 🟡 >4.5-6, 🔴 >6. 30-day Readmission Rate lower is better: 🟢 <=10%, 🟡 >10-15%, 🔴 >15%. Bed Occupancy % balanced is best: 🟢 80-90%, 🟡 70-79.9% or 90.1-95%, 🔴 <70% or >95%. ER Wait Time lower is better: 🟢 <=30 min, 🟡 >30-60, 🔴 >60. Patient Satisfaction higher is better: 🟢 >=85, 🟡 70-84, 🔴 <70. Risk-adjusted Mortality lower is better: 🟢 <=expected, 🟡 >1.0-1.1x expected, 🔴 >1.1x. HAI Rate lower is better: 🟢 <=1 per 1,000 patient days, 🟡 >1-3, 🔴 >3. Cost per Discharge lower is better: 🟢 <=budget, 🟡 >0-8% over, 🔴 >8% over. Door-to-Doctor lower is better: 🟢 <=20 min, 🟡 >20-45, 🔴 >45. Patient:Nurse Ratio lower is better: 🟢 <=5:1, 🟡 >5-7:1, 🔴 >7:1. Operating Margin higher is better: 🟢 >=4%, 🟡 0-3.9%, 🔴 <0%."
    }
];

// PulsePlay-side import: vertical pack presets land here so consumers
// (setupStep5.tsx, etc.) see them in the same list without further wiring.
// Heritage Pulse presets below stay first; pack presets appended at the
// bottom of the array — see `_CORE_CUSTOM_SECTION_PRESETS` declaration plus
// the `CUSTOM_SECTION_PRESETS` re-export at the foot of the heritage list.
// eslint-disable-next-line import/first
import { PACK_CUSTOM_SECTION_PRESETS } from "./_packs";

const _CORE_CUSTOM_SECTION_PRESETS: CustomSectionPreset[] = [
    {
        id: "sales-performance",
        label: "Sales performance",
        description: "Segments, regional hotspots, product mix and next actions.",
        domain: "Sales Performance",
        sections: [
            { name: "SEGMENT MOVEMENT", instruction: "Create a pipe table ranking customer segments by revenue, profit, and growth versus prior period. Include columns Segment, Current Sales, Prior Sales, Growth %, Profit Margin %, and Status. Bold the segment with the strongest profitable growth and add one concise interpretation below the table." },
            { name: "REGION HOTSPOTS", instruction: "Summarize regional performance as a ranked bullet list. For each region, mention sales trend, margin trend, and the most likely driver. Bold any region where sales grew but margin declined, and keep each bullet under 28 words." },
            { name: "PRODUCT MIX", instruction: "Build a pipe table showing the top product or category contributors to sales and profit. Include Product or Category, Sales Share, Profit Share, Discount Level, and Action. Rank by profit impact, not sales volume, and flag loss-making entries clearly." },
            { name: "NEXT ACTIONS", instruction: "List three numbered actions for the sales owner. Each action should name the segment, region, or product affected, explain the expected business impact, and state whether it is a pricing, coverage, promotion, or retention action." }
        ]
    },
    {
        id: "customer-health",
        label: "Customer health",
        description: "Churn signals, NPS drivers, segment growth and save plays.",
        domain: "Customer Success",
        sections: [
            { name: "CHURN SIGNALS", instruction: "Create a pipe table ranking churn risk drivers. Include Segment, At-Risk Customers, Revenue Exposure, Primary Signal, and Recommended Save Motion. Bold the highest revenue exposure and make the recommendation operational, not generic." },
            { name: "NPS DRIVERS", instruction: "Summarize the strongest satisfaction and dissatisfaction drivers in two short bullet groups. Mention the customer segment, direction of movement, and likely operational cause. Bold drivers that appear to affect both NPS and retention." },
            { name: "SEGMENT GROWTH", instruction: "Produce a ranked list of segments by net growth. For each segment, include current period growth, retention signal, expansion opportunity, and one risk. Keep the list concise and focus on what a customer success lead can act on this week." },
            { name: "SAVE PLAYS", instruction: "Recommend three numbered save plays. Each play should specify target cohort, trigger condition, owner role, and expected outcome. Prioritize actions that protect high-value recurring revenue before lower-value volume fixes." }
        ]
    },
    {
        id: "operations-supply-chain",
        label: "Operations supply chain",
        description: "Service gaps, supplier risk, stock pressure and ops actions.",
        domain: "Supply Chain Operations",
        sections: [
            { name: "SERVICE GAPS", instruction: "Create a pipe table ranking operational gaps by customer impact. Include Metric, Current Value, Target, Gap, Affected Region or Supplier, and Status. Bold any gap that combines poor service level with high order volume." },
            { name: "SUPPLIER RISK", instruction: "Summarize supplier risk as ranked bullets. For each supplier or supplier group, mention lead time, defect rate, fill rate, and likely root cause. Use concrete language and avoid recommendations that require unavailable fields." },
            { name: "STOCK PRESSURE", instruction: "Build a pipe table covering stock-outs and excess inventory together. Include Item or Category, Stock Out Rate, Inventory Days, Demand Trend, and Action. Rank entries by service risk first, then by working-capital impact." },
            { name: "OPS ACTIONS", instruction: "List four numbered actions for an operations manager. Each action should name the metric it improves, identify the operational owner, and include a short expected impact statement. Separate quick fixes from structural changes." }
        ]
    },
    {
        id: "hospital-operations",
        label: "Hospital operations",
        description: "Bed pressure, readmissions, flow bottlenecks and care ops actions.",
        domain: "Hospital Operations",
        sections: [
            { name: "BED PRESSURE", instruction: "Create a pipe table showing bed pressure by department or unit. Include Occupancy %, Avg Length of Stay, Discharges, Waiting Volume, and Risk Level. Bold units where high occupancy and long stays appear together." },
            { name: "READMISSION COHORTS", instruction: "Rank readmission cohorts in a pipe table. Include Cohort, Readmission Rate, Discharge Volume, Prior Rate, Change, and Follow-Up Action. Focus interpretation on operational intervention opportunities rather than clinical diagnosis." },
            { name: "FLOW BOTTLENECKS", instruction: "Write concise bullets identifying patient-flow bottlenecks. Mention intake, discharge, staffing, or transfer signals when present. Bold the bottleneck with the largest downstream effect and include one practical mitigation per bullet." },
            { name: "CARE OPS ACTIONS", instruction: "Provide three numbered actions for hospital operations leadership. Each action should include owner, affected unit or cohort, metric expected to improve, and urgency. Avoid medical advice and keep recommendations process-oriented." }
        ]
    },
    {
        id: "hr-workforce",
        label: "HR workforce",
        description: "Attrition hotspots, hiring funnel, performance mix and workforce actions.",
        domain: "HR Analytics",
        sections: [
            { name: "ATTRITION HOTSPOTS", instruction: "Create a pipe table ranking attrition risk by department, role, or location. Include Headcount, Attrition Rate, Prior Rate, High-Risk Cohort, and Recommended Action. Bold areas with both high attrition and high business coverage." },
            { name: "HIRING FUNNEL", instruction: "Summarize hiring funnel health as a ranked bullet list. Mention applicant volume, conversion rate, time to fill, and bottleneck stage when available. Keep each bullet action-oriented for recruiting and workforce planning leaders." },
            { name: "PERFORMANCE MIX", instruction: "Build a pipe table showing performance distribution by team or role. Include High Performer %, Meets %, Low Performer %, Engagement Signal, and Risk. Do not infer protected-class causality; focus on staffing, enablement, and manager actions." },
            { name: "WORKFORCE ACTIONS", instruction: "List three numbered workforce actions. Each action should name the target group, state the expected metric movement, and identify whether the action is retention, hiring, training, or manager enablement." }
        ]
    },
    {
        id: "finance-budget",
        label: "Finance budget",
        description: "Variance drivers, expense hotspots, cash position and finance actions.",
        domain: "Financial Performance",
        params: {
            materialityThreshold: { type: "currency", default: 5000, label: "Materiality threshold", description: "Numeric variance above which an unfavorable line is bolded." },
            materialityCurrency: { type: "string", default: "$", label: "Currency symbol", description: "Symbol prefixed to the materiality value in the prompt (e.g. $, ₹, €)." }
        },
        sections: [
            { name: "VARIANCE DRIVERS", instruction: "Create a pipe table ranking budget variance drivers. Include Category, Actual, Budget, Variance, Variance %, and Driver. Bold unfavorable variances above the materiality threshold of {{params.materialityCurrency}}{{params.materialityThreshold}} and explain whether the driver appears volume, price, or timing related." },
            { name: "EXPENSE HOTSPOTS", instruction: "Summarize expense category hotspots as ranked bullets. Mention current spend, prior or forecast comparison, owner, and likely cause. Separate controllable operating expenses from structural or timing-related increases." },
            { name: "CASH POSITION", instruction: "Write a short prose assessment of cash position using available inflow, outflow, runway, or working-capital signals. Bold the single most important cash risk or opportunity and avoid overstating precision when fields are missing." },
            { name: "FINANCE ACTIONS", instruction: "Provide four numbered actions for finance leadership. Each action should include owner, financial lever, expected impact, and timing. Prioritize actions that improve forecast confidence or reduce unfavorable variance." }
        ]
    },
    {
        id: "superstore-executive-brief",
        label: "Superstore executive brief",
        description: "Two-section 30-second read for US retail Sample Superstore.",
        domain: "Retail Performance",
        sections: [
            { name: "EXECUTIVE READOUT", instruction: "Write a compact executive summary in three bullets using Sample Superstore context. Each bullet must connect sales, profit, and margin movement across Furniture, Office Supplies, and Technology. Bold the biggest business implication and avoid operational detail that would slow a 30-second read." },
            { name: "DECISION FOCUS", instruction: "Create a ranked list of the top three decisions leaders should make next. Each item must name a segment, category, or region such as Consumer, Corporate, West, South, Furniture, or Technology, and state the likely financial outcome if acted on." }
        ]
    },
    {
        id: "superstore-operational-drilldown",
        label: "Superstore operational drilldown",
        description: "Regional-manager view for margin investigation.",
        domain: "Retail Performance",
        sections: [
            { name: "REGION MARGIN MAP", instruction: "Create a pipe table by Central, East, South, and West. Include Sales, Profit, Profit Margin %, Discount %, and Status. Rank by profit risk, not sales volume, and bold any region where high sales hide weak or negative profitability." },
            { name: "SEGMENT PRESSURE", instruction: "Compare Consumer, Corporate, and Home Office in a pipe table with current sales, profit, order count, average discount, and profit per order. Add one sentence below explaining which segment deserves manager attention first and why." },
            { name: "SHIP MODE SIGNALS", instruction: "Summarize operational signals by ship mode if available. Use bullets that mention delivery mix, profit impact, and customer segment concentration. Bold any mode that appears tied to lower profit or unusually high discounting." },
            { name: "STATE OUTLIERS", instruction: "Produce a ranked list of up to five states with unusual performance. Each item should include region, category or segment driver, profit impact, and recommended manager action. Include both upside opportunities and loss-making hotspots where present." },
            { name: "FIELD ACTIONS", instruction: "List five numbered actions for a regional manager investigating margin issues. Each action must identify owner, target region or segment, affected category, and the metric expected to improve. Keep actions practical for the next review cycle." }
        ]
    },
    {
        id: "superstore-merchandising-focus",
        label: "Superstore merchandising focus",
        description: "Category mix, sub-category ranking, loss makers and merchandising actions.",
        domain: "Retail Performance",
        sections: [
            { name: "CATEGORY MIX", instruction: "Create a pipe table for Furniture, Office Supplies, and Technology. Include Sales Share, Profit Share, Profit Margin %, Discount %, and Mix Action. Bold the category where sales contribution and profit contribution diverge most." },
            { name: "SUBCATEGORY RANKING", instruction: "Rank sub-categories by profit impact in a pipe table. Include Sub-Category, Category, Sales, Profit, Profit Margin %, and Discount %. Put profit-negative sub-categories at the top and mark them clearly in the Status column." },
            { name: "LOSS MAKERS", instruction: "Write bullets for the most important profit-negative items or sub-categories. Mention whether the issue appears driven by discounting, low margin, region mix, or segment mix. Bold any item that combines high sales with negative profit." },
            { name: "MERCH ACTIONS", instruction: "Recommend four merchandising actions. Each action should name a category or sub-category, specify whether to reprice, reduce discounting, promote, bundle, or deprioritize, and state the expected effect on profit or margin." }
        ]
    },
    {
        id: "superstore-growth-opportunities",
        label: "Superstore growth opportunities",
        description: "Segment growth, geographic upside and attach plays.",
        domain: "Retail Performance",
        sections: [
            { name: "SEGMENT GROWTH", instruction: "Create a ranked pipe table for Consumer, Corporate, and Home Office. Include Sales Growth %, Profit Growth %, Order Growth %, Profit Margin %, and Opportunity. Bold the segment with the best combination of growth and profitability." },
            { name: "GEOGRAPHIC UPSIDE", instruction: "Summarize expansion opportunities across Central, East, South, and West as bullets. Each bullet should mention one category or segment with room to grow, the supporting performance signal, and a practical sales coverage action." },
            { name: "ATTACH PLAYS", instruction: "List three product attach or cross-sell plays using Furniture, Office Supplies, and Technology. Each play should name the target segment, anchor category, attach category, and success metric. Prioritize profitable growth over raw sales lift." }
        ]
    },
    {
        id: "superstore-risk-and-compliance",
        label: "Superstore risk and compliance",
        description: "Returns, discount abuse, margin erosion and controls.",
        domain: "Retail Performance",
        sections: [
            { name: "RETURN EXPOSURE", instruction: "Create a pipe table of return risk by category, region, or segment if return fields are available. Include Sales, Return Rate, Profit Impact, Driver, and Action. If returns are unavailable, state that clearly and use discount and profit signals as risk proxies." },
            { name: "DISCOUNT ABUSE", instruction: "Rank discount risk in a pipe table with Region, Segment, Category, Average Discount, Profit Margin %, and Risk Level. Bold combinations where discounting is high and profit is negative, especially in Furniture or Technology." },
            { name: "MARGIN EROSION", instruction: "Write concise bullets explaining where margin erosion is concentrated. Mention whether the issue is category mix, regional mix, segment behavior, or discounting. Include a clear signal for Central, East, South, or West when present." },
            { name: "CONTROL ACTIONS", instruction: "Provide four numbered risk-control actions. Each action should name a report owner or business owner, the targeted risk, the affected category or region, and the monitoring metric to track in the next reporting cycle." }
        ],
        metricDirectionRules: "Sales: higher is better\nProfit: higher is better\nProfit Margin %: higher is better\nReturn Rate: lower is better\nDiscount %: lower is better\nRisk Level: lower is better"
    },
    {
        id: "swot-analysis",
        label: "SWOT analysis",
        description: "Strengths, weaknesses, opportunities, threats — quantified.",
        domain: "Strategic Analysis",
        params: {
            marginGreenPct: { type: "percent", default: 15, label: "Healthy margin floor (%)", description: "Profit margin % that qualifies a sub-category as a Strength." },
            marginRedPct: { type: "percent", default: 5, label: "Weak margin ceiling (%)", description: "Profit margin % below which a sub-category is a Weakness." },
            growthThresholdPct: { type: "percent", default: 20, label: "High-growth threshold (%)", description: "YoY sales growth % that flags an Opportunity candidate." },
            opportunityMarginCeilingPct: { type: "percent", default: 10, label: "Opportunity margin ceiling (%)", description: "Margin % below which a high-growth item is still an Opportunity (not yet a Strength)." },
            materialityThreshold: { type: "currency", default: 5000, label: "Threat materiality threshold", description: "Absolute YoY profit drop beyond which a double-decline is flagged as a Threat." },
            materialityCurrency: { type: "string", default: "$", label: "Currency symbol", description: "Symbol prefixed to the materiality value in the prompt (e.g. $, ₹, €)." }
        },
        sections: [
            { name: "STRENGTHS", instruction: "Top 3 sub-categories or regions with profit margin > {{params.marginGreenPct}}% AND positive YoY sales growth in the current period. Show sales, profit, margin %. Rank by profit contribution. One-line per strength." },
            { name: "WEAKNESSES", instruction: "Sub-categories with profit margin < {{params.marginRedPct}}% in the current period, ordered worst-first. Include negative-margin items. Show sales, profit, margin %. Add a one-line root-cause hypothesis per item (high discount, low volume, etc.)." },
            { name: "OPPORTUNITIES", instruction: "Sub-categories with sales growth > {{params.growthThresholdPct}}% YoY but margin still under {{params.opportunityMarginCeilingPct}}%. These are growing but not yet profitable — quantify the gap and estimate margin uplift potential if margin reached the parent category average." },
            { name: "THREATS", instruction: "Sub-categories with BOTH declining sales AND declining margin in the current period versus prior (double-decline). Show YoY change in sales (%) and margin change (pp). Flag any with absolute YoY profit drop greater than {{params.materialityCurrency}}{{params.materialityThreshold}}." }
        ],
        metricDirectionRules: "Sales: higher is better\nProfit: higher is better\nMargin %: higher is better\nGrowth %: higher is better\nReturns: lower is better\nDiscount %: lower is better"
    },
    {
        id: "bcg-matrix",
        label: "BCG growth-share matrix",
        description: "Stars, Cash Cows, Question Marks, Dogs — using median splits.",
        domain: "Strategic Analysis",
        params: {
            divestMarginFloorPct: { type: "percent", default: 15, label: "Divest margin floor (%)", description: "Margin % above which a Dog is kept rather than divested (exception clause)." }
        },
        sections: [
            { name: "STARS", instruction: "Sub-categories with above-median current-period YoY sales growth AND above-median share of total current-period revenue. Show sub-category, sales, share %, growth %, profit margin %." },
            { name: "CASH-COWS", instruction: "Sub-categories with below-median current-period YoY sales growth AND above-median share of total current-period revenue. Show sub-category, sales, share %, growth %, profit margin %. These should be milked for cash." },
            { name: "QUESTION-MARKS", instruction: "Sub-categories with above-median current-period YoY sales growth AND below-median share of total current-period revenue. Investment candidates — show sales, share %, growth %, and current profit margin to assess if worth funding." },
            { name: "DOGS", instruction: "Sub-categories with below-median current-period YoY sales growth AND below-median share of total current-period revenue. Show sales, share %, growth %, profit margin %. Candidates for divestment unless margin is exceptional (>{{params.divestMarginFloorPct}}%)." }
        ],
        metricDirectionRules: "Sales: higher is better\nGrowth %: higher is better\nShare %: higher is better\nProfit Margin %: higher is better\nCost: lower is better"
    },
    {
        id: "rfm-segmentation",
        label: "RFM customer segmentation",
        description: "Recency / Frequency / Monetary clustering for retention strategy.",
        domain: "Customer Success",
        sections: [
            { name: "CHAMPIONS", instruction: "Customers in the top quintile of Recency (most recent order), Frequency (most orders), and Monetary (highest revenue) for the current period. Show count, total revenue, avg profit margin %, top sub-categories purchased. Recommend retention investment level." },
            { name: "AT-RISK", instruction: "Customers with bottom-quintile Recency BUT top-2-quintile Frequency and Monetary in the prior period. These were valuable but have gone quiet. Show count, prior-period revenue, days since last order, recommended save motion (re-engagement campaign, executive call, etc.)." },
            { name: "HIBERNATING", instruction: "Customers in the bottom 2 quintiles for ALL three of Recency, Frequency, Monetary. Show count, total revenue, average tenure. Decide between win-back campaign vs prune-from-list based on tenure and revenue tier." },
            { name: "PROMISING", instruction: "Customers in the top quintile of Recency but bottom 2 quintiles of Frequency and Monetary — new or recently activated, low-volume so far. Show count, current-period revenue, and recommended onboarding/expansion play." }
        ],
        metricDirectionRules: "Revenue: higher is better\nFrequency: higher is better\nMonetary: higher is better\nLTV: higher is better\nChurn: lower is better\nRecency Days: lower is better"
    },
    {
        id: "pareto-8020",
        label: "Pareto 80/20 analysis",
        description: "Concentration analysis — find the few that drive the many.",
        domain: "Strategic Analysis",
        params: {
            atRiskThresholdPct: { type: "percent", default: 20, label: "Revenue-at-risk threshold (%)", description: "Cumulative revenue % the worst-case churn cohort must exceed to be flagged." }
        },
        sections: [
            { name: "CUSTOMER PARETO", instruction: "Order customers by current-period revenue descending. Compute cumulative % of revenue and cumulative % of customer count. Identify the bend point — what % of customers drives 80% of revenue. Top 10 contributors with their share." },
            { name: "PRODUCT PARETO", instruction: "Order sub-categories by current-period revenue descending. Compute cumulative % of revenue and cumulative % of sub-category count. Identify the bend point — what % of sub-categories drives 80% of revenue." },
            { name: "REVENUE AT RISK", instruction: "Identify the smallest set of customers whose churn would cause >{{params.atRiskThresholdPct}}% revenue drop. Order customers by current-period revenue descending, take the top N until cumulative revenue exceeds {{params.atRiskThresholdPct}}%. Show this N, the customer list, their cumulative share, and a one-line retention priority for each." }
        ]
    },
    {
        id: "variance-bridge",
        label: "Variance / waterfall analysis",
        description: "Decompose YoY profit and revenue change into volume, mix, margin drivers.",
        domain: "Financial Analysis",
        sections: [
            { name: "PROFIT BRIDGE", instruction: "Construct a profit bridge from prior period to current period. Components: (1) Volume effect = (current quantity − prior quantity) × prior unit margin; (2) Price/mix effect = current quantity × (current unit margin − prior unit margin); (3) New sub-categories profit; (4) Discontinued sub-categories profit. Each in $ and as a % of prior-period profit. Sum to current-period profit." },
            { name: "REGIONAL CONTRIBUTION", instruction: "Per region, the YoY profit change in $. Order by absolute contribution. Show region, prior profit, current profit, change $, change %, and what % of total YoY profit change each region contributed." },
            { name: "REVENUE VARIANCE", instruction: "Decompose current vs prior revenue change into: Volume effect (Δ quantity × prior avg unit price), Price effect (current quantity × Δ avg unit price), Mix effect (cross term). Show at Category level, then drill into the largest-contributing category at Sub-category level. Two-level waterfall, each step labeled and quantified." },
            { name: "ATTRIBUTION ACTIONS", instruction: "Three numbered actions targeting the largest unfavorable variance contributors identified above. Each action: which driver it addresses (volume / price / mix / discount), the affected category or region, the expected $ impact, and the responsible owner role." }
        ]
    },
    {
        id: "anomaly-detection",
        label: "Anomaly / outlier detection",
        description: "Statistical outliers in monthly metrics, customer profiles, and discounts.",
        domain: "Quality / Risk",
        params: {
            zScoreThreshold: { type: "number", default: 2, label: "Primary z-score threshold", description: "Absolute z-score above which monthly anomalies are flagged." },
            zScoreSecondaryThreshold: { type: "number", default: 1.5, label: "Discount z-score threshold", description: "Absolute z-score above which discount anomalies are flagged." }
        },
        sections: [
            { name: "MONTHLY ANOMALIES", instruction: "For each calendar month (Jan-Dec), compute mean and std of monthly sales across the full historical period. Then z-score the most recent year's same-month value against that distribution. Flag months with absolute z > {{params.zScoreThreshold}}. Show month, baseline mean, current actual, deviation $, z-score." },
            { name: "MARGIN ANOMALIES", instruction: "Same as above but on profit margin %. Identify any current-year month whose margin deviates by more than {{params.zScoreThreshold}} standard deviations from the historical baseline for the same calendar month. Direction (over/under expected) and total profit impact." },
            { name: "DISCOUNT ANOMALIES", instruction: "Identify (Customer, Sub-category) pairs where the current-period discount rate is more than {{params.zScoreSecondaryThreshold}} standard deviations above the same customer's typical discount rate across all sub-categories. Possible signs of negotiated terms or pricing errors. Show customer, sub-category, customer-typical discount, this-pair discount, z-score, total revenue impact." },
            { name: "CONTROL RECOMMENDATIONS", instruction: "Three numbered control actions targeting the most significant anomalies above. Each action should name a report owner, the affected metric/customer/region, the corrective action, and the monitoring cadence (weekly / monthly / quarterly)." }
        ]
    }
];

// PulsePlay merge — heritage Pulse presets first, then vertical-pack presets
// appended. Single export keeps every existing consumer (setupStep5.tsx, etc.)
// working unchanged.
export const CUSTOM_SECTION_PRESETS: CustomSectionPreset[] = [
    ..._CORE_CUSTOM_SECTION_PRESETS,
    ...PACK_CUSTOM_SECTION_PRESETS,
];

// ─── Wave 32.5 — interpolation engine ────────────────────────────────────────

const PRESET_PARAM_MAX_LEN = 64;

/**
 * Sanitises a single param value before substitution. Mirrors the Wave 22
 * `sanitizeTemplateValue` philosophy — strips quotes, comment markers,
 * SQL keywords, control characters, and caps at 64 chars. Numeric-typed
 * params keep digit/decimal/sign characters; string-typed params allow
 * a wider word/punctuation set but still nothing dangerous.
 *
 * Returns `""` if the input was hostile enough to be wiped out entirely;
 * the interpolation engine will then fall back to the param's default.
 */
export function sanitizeParamValue(raw: unknown, type: PresetParam["type"]): string {
    if (raw === null || raw === undefined) return "";
    let s = String(raw);
    // Always strip control characters + quotes + comment markers regardless
    // of param type — these never have a legitimate place in prompt prose.
    s = s
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/[';"\\\r\n\t]/g, "")
        .replace(/--/g, "")
        .replace(/\/\*/g, "")
        .replace(/\*\//g, "");
    // SQL-keyword strip (defence in depth — same list as genie.ts).
    s = s.replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|REPLACE|UNION|EXEC|EXECUTE|GRANT|REVOKE|FROM|WHERE|JOIN|INTO|TABLE|VIEW|DATABASE|SCHEMA)\b/gi, "");
    if (type === "currency" || type === "number" || type === "percent") {
        // Numbers / percentages / currency *amounts* — keep digits, dot,
        // sign, comma (thousands sep), and the % sign for display. Drop
        // everything else.
        s = s.replace(/[^\d.\-+,%]/g, "");
    } else {
        // Free-text params (currency symbol, period descriptor) — allow
        // word chars, dash, dot, space, and a small set of common
        // currency / unit symbols.
        s = s.replace(/[^\w\-. $€£¥₹₩%]/g, "");
    }
    return s.replace(/\s+/g, " ").trim().slice(0, PRESET_PARAM_MAX_LEN);
}

/**
 * Walks a preset's prompt body, substituting `{{params.X}}` tokens with
 * sanitised values from `paramValues`. Missing keys fall back to the
 * preset's declared default. Unknown keys (no matching default and no
 * value) log a warning and substitute the empty string so the prompt
 * doesn't silently leak template syntax to Genie.
 *
 * Backwards compat: if the preset has no `params` field, the original
 * sections are returned untouched (legacy presets without tokens stay
 * string-equal to their source — proved by the test suite).
 */
export function interpolatePreset(
    preset: CustomSectionPreset,
    paramValues: Record<string, string | number> = {},
): Array<{ name: string; instruction: string }> {
    if (!preset.params) {
        // Legacy preset — no tokens, return as-is.
        return preset.sections.map(s => ({ name: s.name, instruction: s.instruction }));
    }
    const params = preset.params;
    // Build the resolved-and-sanitised lookup once per call.
    const resolved: Record<string, string> = {};
    for (const key of Object.keys(params)) {
        const def = params[key];
        const provided = paramValues[key];
        let value: unknown = provided;
        if (value === undefined || value === null || value === "") {
            value = def.default;
        }
        const safe = sanitizeParamValue(value, def.type);
        // If sanitisation wiped the value out, fall back to the default.
        if (safe.length === 0 && def.default !== undefined && def.default !== "") {
            resolved[key] = sanitizeParamValue(def.default, def.type);
        } else {
            resolved[key] = safe;
        }
    }
    return preset.sections.map(section => ({
        name: section.name,
        instruction: section.instruction.replace(/\{\{params\.([\w]+)\}\}/g, (_, key: string) => {
            if (key in resolved) return resolved[key];
            // Unknown param key — log + drop. Avoids leaking `{{params.foo}}`
            // syntax into the materialised prose.
            try {
                console.warn(`[insightsPresetLibrary] preset "${preset.id}" referenced unknown param key "{{params.${key}}}" — substituting empty string.`);
            } catch { /* console may not exist in some sandboxes */ }
            return "";
        }),
    }));
}

/**
 * Builds the seed map of param-key → default-value for a preset, suitable
 * for initialising the inline form state in the setup UI. Returns `{}`
 * for legacy (no-params) presets.
 */
export function defaultParamValues(preset: CustomSectionPreset): Record<string, string> {
    if (!preset.params) return {};
    const out: Record<string, string> = {};
    for (const key of Object.keys(preset.params)) {
        out[key] = String(preset.params[key].default ?? "");
    }
    return out;
}
