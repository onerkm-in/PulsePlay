// playground/src/pulse/_packs/cpgFmcgPresets.ts
//
// PulsePlay-specific extension to Pulse's CUSTOM_SECTION_PRESETS list:
// presets derived from the CPG/FMCG vertical pack at
// `pulsepacks/cpg-fmcg/sub-verticals/<name>/`.
//
// The pack files (kpis.md, sample-questions.md, prompt-context.md) remain
// the canonical authored source for each sub-vertical's KPIs, prompts, and
// question taxonomy. This module distils each sub-vertical into a single
// CustomSectionPreset whose `sections` follow Pulse's prompt-output shape
// (a few named blocks, each with an imperative instruction prescribing the
// desired markdown layout).
//
// Each preset is also wired with the same `params` machinery the SWOT /
// Pareto / Finance presets use — so currency thresholds, OTIF target, OEE
// benchmark, etc. are author-tunable in one place before the prompt is
// materialised into `insightsCustomSections`.

import type { CustomSectionPreset } from "../insightsPresetLibrary";

// ─── Supply chain ────────────────────────────────────────────────────────────
const supplyChain: CustomSectionPreset = {
    id: "cpg-fmcg-supply-chain",
    label: "CPG · Supply chain",
    description: "OTIF, fill rate, forecast accuracy, inventory health, lane risk.",
    domain: "CPG / Supply Chain",
    params: {
        otifTargetPct: { type: "percent", default: 95, label: "OTIF target (%)", description: "Customer-defined OTIF threshold below which a lane is flagged red." },
        forecastAccuracyFloorPct: { type: "percent", default: 70, label: "Forecast accuracy floor (%)", description: "1 − WMAPE below which a SKU-location is treated as low-confidence." },
        inventoryDaysCeiling: { type: "number", default: 90, label: "Inventory days ceiling", description: "Days-on-hand above which a SKU-DC is flagged for working-capital review." },
    },
    sections: [
        { name: "SERVICE RISK", instruction: "Create a pipe table ranking lanes (customer × DC) at risk of missing OTIF this week. Include Lane, OTIF Trailing 4-week %, This-Week Risk Score, Open Order $, Primary Driver, and Status. Bold any lane below {{params.otifTargetPct}}% with high open-order $. Cite the customer's own OTIF window when known; do not invent a threshold." },
        { name: "FORECAST HEALTH", instruction: "Summarize forecast accuracy and bias as a ranked bullet list at category × region granularity. Include current accuracy (1 − WMAPE), bias direction (over/under), and the dominant driver (event, structural mix shift, model drift). Bold any cell below {{params.forecastAccuracyFloorPct}}% accuracy and explain whether the issue is bias or noise." },
        { name: "INVENTORY HEALTH", instruction: "Build a pipe table covering stock health by SKU-DC. Include SKU, DC, Inventory Days, Stockout Risk Score (14-day), Slow Mover Flag, Near-Expiry Flag, and Action. Rank by service risk first; flag rows above {{params.inventoryDaysCeiling}} days as working-capital review candidates." },
        { name: "RECOVERY ACTIONS", instruction: "Provide three numbered recovery actions targeting the largest service-risk lanes. Each action must specify the lever (pull-forward, expedite, transfer, reallocate), the affected customer / lane / SKU, the estimated cost-to-serve impact, and the stakeholder approval required. Recommendations are advisory — no ERP / TMS / WMS write-back." },
    ],
};

// ─── Procurement ─────────────────────────────────────────────────────────────
const procurement: CustomSectionPreset = {
    id: "cpg-fmcg-procurement",
    label: "CPG · Procurement",
    description: "Spend, supplier risk, contract intelligence, savings pipeline.",
    domain: "CPG / Procurement",
    params: {
        savingsTargetPct: { type: "percent", default: 3, label: "Annual savings target (%)", description: "Addressable-spend savings target the savings pipeline is measured against." },
        materialityThreshold: { type: "currency", default: 250000, label: "Spend materiality threshold", description: "Annualised spend above which a category or supplier is bolded for executive attention." },
        materialityCurrency: { type: "string", default: "$", label: "Currency symbol", description: "Symbol prefixed to the materiality value (e.g. $, €, ₹)." },
    },
    sections: [
        { name: "SPEND CONCENTRATION", instruction: "Create a pipe table ranking spend categories by addressable spend. Include Category, Annualised Spend, Top Supplier Share %, Number of Suppliers, YoY Change, and Action. Bold rows above {{params.materialityCurrency}}{{params.materialityThreshold}} or where a single supplier exceeds 60% share." },
        { name: "SUPPLIER RISK", instruction: "Summarize supplier risk as ranked bullets. For each high-exposure supplier, mention financial-health rating (RapidRatings or equivalent), on-time delivery, defect rate, and the dominant risk type (financial / quality / cyber / ESG / single-source). Bold suppliers with two or more risk types triggered concurrently." },
        { name: "CONTRACT WATCH", instruction: "Build a pipe table covering contracts expiring or triggering inside the next 90 days. Include Supplier, Contract Type, Expiry / Trigger Date, Annual Value, Price-Index Pass-Through, Renegotiation Leverage, and Recommended Owner. Flag sole-source items explicitly." },
        { name: "SAVINGS PIPELINE", instruction: "Recommend three numbered procurement actions sized against the {{params.savingsTargetPct}}% annual savings target. Each action should name the category, lever (consolidation, dual-source, index-clause renegotiation, payment-term shift), expected savings range, and risk to service. Separate quick wins from structural moves." },
    ],
};

// ─── Manufacturing ───────────────────────────────────────────────────────────
const manufacturing: CustomSectionPreset = {
    id: "cpg-fmcg-manufacturing",
    label: "CPG · Manufacturing",
    description: "OEE, yield, downtime decomposition, quality and safety, traceability.",
    domain: "CPG / Manufacturing",
    params: {
        oeeTargetPct: { type: "percent", default: 75, label: "OEE target (%)", description: "Site OEE target below which a line is flagged red. World-class is ~85% in discrete; CPG varies by category." },
        yieldFloorPct: { type: "percent", default: 95, label: "First-pass yield floor (%)", description: "First-pass yield below which a recipe is flagged for quality review." },
    },
    sections: [
        { name: "OEE LOSS TREE", instruction: "Create a pipe table decomposing OEE by line × shift for the period. Include Line, Shift, OEE %, Availability %, Performance %, Quality %, Dominant Loss Bucket, and Status. Bold any line below {{params.oeeTargetPct}}% and name the dominant loss bucket (planned downtime, unplanned downtime, changeover, micro-stops, speed loss, scrap, rework) from the six big losses." },
        { name: "YIELD & QUALITY", instruction: "Summarize yield and quality deviations as ranked bullets at recipe × line × shift granularity. Mention first-pass yield, scrap rate, dominant deviation category, and the likely cut (material lot, operator group, line, shift, recipe parameter). Bold any recipe below {{params.yieldFloorPct}}% first-pass yield and tie each finding to a concrete cut to investigate." },
        { name: "RELIABILITY", instruction: "Build a pipe table on equipment reliability. Include Asset, MTBF (days), MTTR (hours), Unplanned Stops This Period, Drifting PdM Signature, and Action. Rank by unplanned stops × MTTR exposure first; flag any asset with a drifting predictive-maintenance signature." },
        { name: "SAFETY & TRACEABILITY", instruction: "Write concise bullets covering recordable safety incidents (TRIR direction this period) and any open batch-genealogy traces. Bold any TRIR move that crosses the site's stated threshold. For a failed-release batch, name the upstream material lots implicated and the downstream batches that share that genealogy." },
        { name: "PLANT ACTIONS", instruction: "List four numbered actions for plant leadership. Each action must identify line / asset / recipe, the loss bucket targeted, owner role, and the expected OEE or yield point movement. Keep at least one action focused on changeover or micro-stop reduction (typically the highest-ROI lever)." },
    ],
};

// ─── Commercial / Retail ─────────────────────────────────────────────────────
const commercialRetail: CustomSectionPreset = {
    id: "cpg-fmcg-commercial-retail",
    label: "CPG · Commercial & retail",
    description: "Revenue growth, trade promo, retail execution, digital shelf, JBP.",
    domain: "CPG / Commercial",
    params: {
        promoLiftFloorPct: { type: "percent", default: 100, label: "Promo lift floor (%)", description: "Actual-vs-expected promo lift below which an event is flagged underperforming." },
        digitalShelfScoreFloor: { type: "number", default: 70, label: "Digital-shelf score floor", description: "Content-and-availability score below which a SKU at a retailer is flagged red." },
    },
    sections: [
        { name: "REVENUE & MIX", instruction: "Create a pipe table of net revenue by customer × category for the trailing 13 weeks. Include Customer, Category, Net Revenue, YoY %, Mix %, and Status. Bold combinations losing share AND showing negative YoY. Use net revenue (not gross sales) so trade spend is consistent." },
        { name: "TRADE PROMO HEALTH", instruction: "Summarize trade-promo execution as ranked bullets at event × customer granularity. For each underperforming event, mention expected vs actual lift, on-shelf availability, price-gap vs competitor, and retail-media spend if relevant. Bold any event where realised lift was below {{params.promoLiftFloorPct}}% of expected." },
        { name: "DIGITAL SHELF", instruction: "Build a pipe table covering the top 50 SKUs at the focus retailer. Include SKU, Retailer, Search Rank, Content Score, Ratings Trajectory, Price Parity, and Status. Flag rows where content score is below {{params.digitalShelfScoreFloor}} or where share-of-search is being lost to private label." },
        { name: "RGM ACTIONS", instruction: "Recommend three numbered revenue-growth-management actions. Each must name the customer × category, lever (price, promo redesign, assortment, distribution gap, digital-shelf content), expected net-revenue / margin impact, and JBP commitment it supports. Pricing recommendations are advisory; pricing committees decide." },
    ],
};

// ─── Finance / FP&A ──────────────────────────────────────────────────────────
const financeFpa: CustomSectionPreset = {
    id: "cpg-fmcg-finance-fpa",
    label: "CPG · Finance & FP&A",
    description: "Margin bridge, working capital, FP&A, scenario modelling, close anomalies.",
    domain: "CPG / Finance",
    params: {
        marginVariancePctThreshold: { type: "percent", default: 1, label: "Margin variance threshold (pp)", description: "Margin-point variance above which a bridge component is bolded as material." },
        materialityThreshold: { type: "currency", default: 1000000, label: "Cash / WC materiality", description: "Absolute working-capital or cash variance above which a line is bolded." },
        materialityCurrency: { type: "string", default: "$", label: "Currency symbol", description: "Symbol prefixed to the materiality value (e.g. $, €, ₹)." },
    },
    sections: [
        { name: "MARGIN BRIDGE", instruction: "Construct a gross-margin bridge from prior period (or plan) to current period. Decompose into price, volume, mix, commodity, FX, plant variance, trade-spend, and channel-mix components. Express each in {{params.materialityCurrency}} and as basis-point movement. Bold any component whose impact exceeds {{params.marginVariancePctThreshold}}pp. Sum must reconcile to reported margin." },
        { name: "WORKING CAPITAL", instruction: "Create a pipe table for working capital by component. Include Component (Inventory, Receivables, Payables, Deduction Reserve), Current, Prior, Change {{params.materialityCurrency}}, Change %, and Driver. Bold lines moving more than {{params.materialityCurrency}}{{params.materialityThreshold}} unfavourably. Tie each driver to a downstream owner (Supply Chain / Commercial / Treasury)." },
        { name: "CLOSE ANOMALIES", instruction: "Summarize ranked bullets for anomalies in revenue, COGS, or trade-spend accruals worth investigating before close lock. For each anomaly, name the GL string or accrual account, the magnitude, the historical baseline, and the suggested verification step. Avoid suggesting journal entries — investigation recommendations only." },
        { name: "SCENARIO LEVERS", instruction: "Provide three numbered scenario levers a finance leader can model. Each must specify the input variable (commodity index, FX pair, volume, price band, trade rate), the size of move, and the expected {{params.materialityCurrency}} / pp impact at region × category granularity. Caveat that scenario outputs assume current run-rate elasticity holds." },
    ],
};

// ─── HR / Workforce ──────────────────────────────────────────────────────────
const hr: CustomSectionPreset = {
    id: "cpg-fmcg-hr",
    label: "CPG · HR & workforce",
    description: "Headcount, attrition hotspots, hiring funnel, safety, flight risk.",
    domain: "CPG / HR",
    params: {
        attritionAlarmPct: { type: "percent", default: 18, label: "Attrition alarm threshold (%)", description: "Annualised attrition above which a function-region cell is flagged red." },
        timeToFillCeilingDays: { type: "number", default: 60, label: "Time-to-fill ceiling (days)", description: "Time-to-fill above which an open requisition is flagged for intervention." },
    },
    sections: [
        { name: "ATTRITION HOTSPOTS", instruction: "Create a pipe table ranking attrition by function × region. Include Cohort, Headcount, Annualised Attrition %, Prior Period %, High-Risk Sub-Cohort, and Action. Bold rows above {{params.attritionAlarmPct}}%. Never infer protected-class causality; cite observable signals (pay band, manager span, geography, manager-specific engagement)." },
        { name: "HIRING FUNNEL", instruction: "Summarize hiring funnel health as ranked bullets by function. Mention open requisitions, average time-to-fill, bottleneck stage, and the recovered-vs-lost ratio. Bold any function whose time-to-fill exceeds {{params.timeToFillCeilingDays}} days and name the funnel step (sourcing, screen, offer accept) that is the dominant drag." },
        { name: "SAFETY & FRONTLINE", instruction: "Build a pipe table on safety and frontline staffing health. Include Site / Line, Recordable Incident Rate (TRIR), Open Safety Actions, Frontline Vacancy %, and Action. Cross-reference manufacturing line patterns where TRIR spikes coincide with staffing shortfalls or shift-pattern changes." },
        { name: "WORKFORCE ACTIONS", instruction: "Provide three numbered workforce actions. Each must name the cohort, the lever (retention, hiring, training, manager enablement, redeployment), expected metric movement, and timing. Prioritise actions that protect critical roles (frontline operators, planners) over generic engagement programmes." },
    ],
};

// ─── IT / Admin ──────────────────────────────────────────────────────────────
const itAdmin: CustomSectionPreset = {
    id: "cpg-fmcg-it-admin",
    label: "CPG · IT & admin",
    description: "Incident backlog, app SLA, cloud cost, AI-platform governance, license utilisation.",
    domain: "CPG / IT",
    params: {
        slaBreachWatchDays: { type: "number", default: 30, label: "SLA breach watch window (days)", description: "Forward window over which applications are flagged for breach-risk attention." },
        licenseUtilisationFloorPct: { type: "percent", default: 60, label: "License utilisation floor (%)", description: "Utilisation below which a license pool is flagged for reclaim." },
    },
    sections: [
        { name: "INCIDENT BACKLOG", instruction: "Create a pipe table of open incidents by application × severity. Include Application, P1, P2, P3, Aged > 14 Days, MTTR (last 30 days), and Status. Bold tier-1 applications with growing P1+P2 backlog. Tie spikes to recent change records or APM error-rate movements when those signals are present." },
        { name: "SLA & RELIABILITY", instruction: "Summarize SLA-risk applications as ranked bullets. For each, mention current availability vs SLA, trend direction, dominant failure mode, and a forward breach-risk score over the next {{params.slaBreachWatchDays}} days. Bold tier-1 applications projected to breach inside the window." },
        { name: "CLOUD & AI COST", instruction: "Build a pipe table of monthly spend by service. Include Service (cloud, AI-platform, SaaS), Monthly Spend, MoM Change %, Committed-Use Coverage, and Action. Flag AI-platform services moving more than 25% MoM and decompose by agent / connector profile / question pattern when those dimensions exist." },
        { name: "LICENSE POOLS", instruction: "Identify license-pool reclaim opportunities. Pipe table with Application, Total Seats, Active Seats Last 90 Days, Utilisation %, Pool Manager, and Reclaim Recommendation. Bold pools below {{params.licenseUtilisationFloorPct}}% utilisation. Recommendations must preserve role-based access, not just minimise cost." },
        { name: "IT ACTIONS", instruction: "Provide three numbered IT actions. Each must name the system, lever (capacity, license, governance, automation, deprecation), expected cost / availability impact, and owner. Separate operational incident fixes from structural application-portfolio moves." },
    ],
};

// ─── Vendor Management ───────────────────────────────────────────────────────
const vendorManagement: CustomSectionPreset = {
    id: "cpg-fmcg-vendor-management",
    label: "CPG · Vendor management",
    description: "Supplier 360, contract intelligence, tier-2/3 dependency, ESG and cyber posture.",
    domain: "CPG / Vendor Management",
    sections: [
        { name: "SUPPLIER 360", instruction: "Create a pipe table for the top 20 suppliers. Include Supplier, Annual Spend, Quality Score, OTD %, Financial Health (RapidRatings or equivalent), ESG Tier, Cyber Posture, and Status. Bold any supplier degraded on two or more dimensions in the last 6 months. Cite the underlying source for each external rating; do not synthesize ratings." },
        { name: "DEPENDENCY GRAPH", instruction: "Summarize tier-2 / tier-3 dependency exposure as ranked bullets. For each shared dependency among top-20 tier-1 suppliers, mention the dependency, the number of tier-1s exposed, the categories affected, and the single-point-of-failure severity. Use Resilinc / Sayari / Interos graph data when available; flag any segment that lacks tier-2 visibility entirely." },
        { name: "CONTRACT INTELLIGENCE", instruction: "Build a pipe table over the CLM corpus. Include Supplier, Contract Type, Price-Index Pass-Through (Y/N + threshold), Rebate Tier Status, Renewal Date, and Owner. Flag suppliers with unmet rebate-tier obligations heading into year-end. Cite the source clause when extracted from contract text." },
        { name: "VENDOR ACTIONS", instruction: "Provide three numbered vendor-management actions. Each must name the supplier or segment, the lever (dual-source, performance-review escalation, ESG remediation, cyber attestation, contract renegotiation), and the expected risk-reduction or commercial impact. Sole-source mitigation should be sized against switching cost and qualification lead time." },
    ],
};

// ─── Client Management ───────────────────────────────────────────────────────
const clientManagement: CustomSectionPreset = {
    id: "cpg-fmcg-client-management",
    label: "CPG · Client management",
    description: "Retail client scorecards, deduction recovery, warehousing SLA, JBP readiness.",
    domain: "CPG / Client Management",
    params: {
        deductionRecoveryFloorPct: { type: "percent", default: 65, label: "Deduction recovery floor (%)", description: "Dispute-recovery rate below which the deduction pipeline is flagged for intervention." },
    },
    sections: [
        { name: "RETAIL SCORECARDS", instruction: "Create a pipe table of scorecards against top retail clients for the current quarter. Include Retailer, OTIF %, Fill Rate %, Promo Compliance %, Deductions {{params.deductionRecoveryFloorPct}}-Day, JBP Status, and Risk. Bold retailers degrading on two or more lines vs prior quarter. Cite the retailer's own scorecard definition where it differs from internal." },
        { name: "DEDUCTION PIPELINE", instruction: "Summarize deductions by retailer × reason code as ranked bullets. For each material reason code, mention amount, dispute status, recovery rate, and the operational fix needed upstream (shipment accuracy, promo settlement, pricing). Bold cohorts where recovery rate is below {{params.deductionRecoveryFloorPct}}%." },
        { name: "WAREHOUSING SLA", instruction: "Build a pipe table on warehousing-client SLA performance (3PL-of clients). Include Client, Inbound Putaway SLA %, Outbound Pick Accuracy %, Throughput vs Forecast, Damage Rate, and Status. Flag throughput-vs-forecast gaps that compound with damage-rate issues." },
        { name: "CLIENT ACTIONS", instruction: "Provide three numbered client-management actions. Each must name the client, lever (operations fix, governance touchpoint, JBP escalation, dispute push), and expected revenue / margin / relationship impact. Separate executive escalation paths from operational corrective actions." },
    ],
};

// ─── Sustainability (cross-cutting) ──────────────────────────────────────────
const sustainability: CustomSectionPreset = {
    id: "cpg-fmcg-sustainability",
    label: "CPG · Sustainability overlay",
    description: "Scope 1/2/3 emissions, water, waste, packaging, ESG reporting anchors.",
    domain: "CPG / Sustainability",
    sections: [
        { name: "EMISSIONS POSTURE", instruction: "Create a pipe table of emissions by scope. Include Scope (1, 2 Location-Based, 2 Market-Based, 3 Cat 1-15), Current Period, Prior Period, % Change, and Dominant Driver. Cite GHG Protocol Corporate Standard for Scope 1/2 and GHG Protocol Scope 3 Standard categories. For Scope 2, report BOTH location-based and market-based per the Scope 2 Guidance — they are not interchangeable." },
        { name: "SCOPE 3 HOTSPOTS", instruction: "Summarize Scope 3 hotspots as ranked bullets. For each top-contributing category (typically Cat 1 Purchased goods & services, Cat 4 Upstream transport, Cat 11 Use of sold products), mention the supplier / lane / SKU contribution, data-quality tier per the Scope 3 Standard hierarchy, and a feasible mitigation lever. Do not assume primary data where only spend-based estimates exist." },
        { name: "WATER & WASTE", instruction: "Build a pipe table on water and waste intensity by site. Include Site, Water Intensity (L/case or L/kg), Stressed-Basin Flag, Waste Diversion %, Effluent Compliance, and Status. Cite GRI 303 for water disclosures. Bold sites in stressed basins above their internal intensity target." },
        { name: "PACKAGING & EPR", instruction: "Summarize packaging-circularity posture and EPR obligations. Bullets per material stream (PET, HDPE, glass, paperboard, flexible film). Include recycled-content %, recyclability per local taxonomy, and any extended-producer-responsibility fee exposure by jurisdiction. Flag jurisdictions where regulatory thresholds tighten inside the next reporting cycle." },
        { name: "SUSTAINABILITY ACTIONS", instruction: "Provide four numbered sustainability actions. Each must specify the framework anchor (GHG Protocol, SBTi, CDP, CSRD, GRI, SASB, TCFD), the lever (energy procurement, mode shift, supplier engagement, packaging redesign), the expected metric movement, and owner. Avoid greenwashing claims; cite measurement methodology for any reduction figure." },
    ],
};

/**
 * All CPG/FMCG pack presets. Ordered to roughly follow the value chain:
 * source → make → move → sell → support → cross-cutting.
 */
export const CPG_FMCG_CUSTOM_SECTION_PRESETS: CustomSectionPreset[] = [
    procurement,
    manufacturing,
    supplyChain,
    commercialRetail,
    financeFpa,
    hr,
    itAdmin,
    vendorManagement,
    clientManagement,
    sustainability,
];
