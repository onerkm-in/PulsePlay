// playground/src/authoring/businessContextProfile.ts
//
// Pure TypeScript module for the Unified Business Context and Authoring Model.
// This file is 100% portable and has zero React, DOM, fetch, or connector dependencies.

export type BusinessContextConfidence =
    | "inferred"
    | "author-confirmed"
    | "sme-reviewed"
    | "deprecated";

export interface BusinessContextProfile {
    id: string;
    displayName: string;
    shortLabel: string;
    pack: string;
    subVertical?: string;
    overlays: string[];
    audienceLabel: string;
    confidence: BusinessContextConfidence;
    provenance: {
        sourceRegisterPath?: string;
        sourceIds: string[];
        owner?: string;
        lastReviewedAt?: string;
    };
    glossary: Array<{
        term: string;
        definition: string;
        sourceIds: string[];
    }>;
    kpis: Array<{
        id: string;
        label: string;
        description?: string;
        formula?: string;
        direction: "higher-is-better" | "lower-is-better" | "target-band" | "neutral";
        thresholds?: Array<{
            tone: "good" | "watch" | "risk";
            expression: string;
        }>;
        sourceIds: string[];
    }>;
    insightTemplates: Array<{
        id: string;
        label: string;
        sections: Array<{ name: string; instruction: string }>;
        generatedFrom: "pack" | "overlay" | "author-override";
    }>;
    starterQuestions: Array<{
        id: string;
        label: string;
        prompt: string;
        intent: "summary" | "diagnostic" | "risk" | "opportunity" | "what-if" | "follow-up";
        sourceIds: string[];
    }>;
    guidedFilters: Array<{
        field: string;
        label: string;
        reason: string;
        source: "bi-metadata" | "pack" | "author-override";
    }>;
    retrievalPolicy: {
        citationMode: "required" | "when-available" | "off";
        freshnessExpectation?: string;
        allowedSourceTiers: string[];
    };
}

// Extensible schemas for our built-in static Knowledge Pack Registry.

export interface SubVerticalDefinition {
    displayName: string;
    shortLabel: string;
    audienceLabel: string;
    provenance: {
        sourceIds: string[];
        owner: string;
        lastReviewedAt: string;
    };
    glossary: Array<{ term: string; definition: string; sourceIds: string[] }>;
    kpis: Array<{
        id: string;
        label: string;
        description?: string;
        formula?: string;
        direction: "higher-is-better" | "lower-is-better" | "target-band" | "neutral";
        thresholds?: Array<{ tone: "good" | "watch" | "risk"; expression: string }>;
        sourceIds: string[];
    }>;
    insightTemplates: Array<{
        id: string;
        label: string;
        sections: Array<{ name: string; instruction: string }>;
    }>;
    starterQuestions: Array<{
        id: string;
        label: string;
        prompt: string;
        intent: "summary" | "diagnostic" | "risk" | "opportunity" | "what-if" | "follow-up";
        sourceIds: string[];
    }>;
    guidedFilters: Array<{
        field: string;
        label: string;
        reason: string;
    }>;
    retrievalPolicy: {
        citationMode: "required" | "when-available" | "off";
        freshnessExpectation?: string;
        allowedSourceTiers: string[];
    };
}

export interface OverlayDefinition {
    displayName: string;
    shortLabel: string;
    provenance: {
        sourceIds: string[];
        owner: string;
        lastReviewedAt: string;
    };
    glossary: Array<{ term: string; definition: string; sourceIds: string[] }>;
    kpis: Array<{
        id: string;
        label: string;
        description?: string;
        formula?: string;
        direction: "higher-is-better" | "lower-is-better" | "target-band" | "neutral";
        thresholds?: Array<{ tone: "good" | "watch" | "risk"; expression: string }>;
        sourceIds: string[];
    }>;
    insightTemplates: Array<{
        id: string;
        label: string;
        sections: Array<{ name: string; instruction: string }>;
    }>;
    starterQuestions: Array<{
        id: string;
        label: string;
        prompt: string;
        intent: "summary" | "diagnostic" | "risk" | "opportunity" | "what-if" | "follow-up";
        sourceIds: string[];
    }>;
    guidedFilters: Array<{
        field: string;
        label: string;
        reason: string;
    }>;
}

export interface PackDefinition {
    id: string;
    displayName: string;
    subVerticals: Record<string, SubVerticalDefinition>;
    overlays: Record<string, OverlayDefinition>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN PACK REGISTRY (CPG/FMCG, Retail/Digital, SaaS/Product)
// ─────────────────────────────────────────────────────────────────────────────

export const PACK_REGISTRY: Record<string, PackDefinition> = {
    "cpg-fmcg": {
        id: "cpg-fmcg",
        displayName: "Consumer Packaged Goods (CPG)",
        subVerticals: {
            "supply-chain": {
                displayName: "CPG · Supply Chain",
                shortLabel: "Supply Chain",
                audienceLabel: "Supply Chain Director / Inventory Manager",
                provenance: {
                    sourceIds: ["SC-001", "SC-002"],
                    owner: "CPG Supply Chain S&OP Team",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "OTIF", definition: "On-Time In-Full delivery rate according to customer-defined service agreements.", sourceIds: ["SC-001"] },
                    { term: "WMAPE", definition: "Weighted Mean Absolute Percentage Error, a demand forecasting error metric.", sourceIds: ["SC-002"] },
                    { term: "Safety Stock", definition: "Buffer inventory maintained to protect against demand and supply volatility.", sourceIds: ["SC-001"] }
                ],
                kpis: [
                    {
                        id: "otif",
                        label: "OTIF %",
                        description: "Percentage of customer orders delivered complete and on time.",
                        formula: "OTIF % = (On-time & complete orders) / (Total orders) x 100",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 95" },
                            { tone: "watch", expression: "90 - 94.9" },
                            { tone: "risk", expression: "< 90" }
                        ],
                        sourceIds: ["SC-001"]
                    },
                    {
                        id: "forecast-accuracy",
                        label: "Forecast Accuracy %",
                        description: "Demand planning forecast accuracy calculated as 1 - WMAPE.",
                        formula: "1 - WMAPE",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 80" },
                            { tone: "watch", expression: "70 - 79.9" },
                            { tone: "risk", expression: "< 70" }
                        ],
                        sourceIds: ["SC-002"]
                    },
                    {
                        id: "inventory-days",
                        label: "Inventory Days",
                        description: "Days of inventory on hand based on forward average COGS.",
                        formula: "Inventory Days = (Inventory Value) / (Average Daily COGS)",
                        direction: "target-band",
                        thresholds: [
                            { tone: "good", expression: "30 - 60" },
                            { tone: "watch", expression: "20 - 29 or 61 - 90" },
                            { tone: "risk", expression: "< 20 or > 90" }
                        ],
                        sourceIds: ["SC-001"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "cpg-fmcg-supply-chain-template",
                        label: "CPG · Supply Chain Template",
                        sections: [
                            { name: "SERVICE RISK", instruction: "Create a pipe table ranking lanes at risk of missing OTIF." },
                            { name: "FORECAST HEALTH", instruction: "Summarize forecast accuracy and bias by category and region." },
                            { name: "INVENTORY HEALTH", instruction: "Build a pipe table covering stock days-on-hand." },
                            { name: "RECOVERY ACTIONS", instruction: "Provide three numbered advisory recovery actions." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-otif-summary",
                        label: "Summarize current OTIF performance",
                        prompt: "What is our current OTIF performance across major lanes, and what are the main reasons for delivery delays?",
                        intent: "summary",
                        sourceIds: ["SC-001"]
                    },
                    {
                        id: "q-inventory-risk",
                        label: "Identify high-risk stockouts",
                        prompt: "Which SKU-DC combinations show a critical stockout risk over the next 14 days?",
                        intent: "risk",
                        sourceIds: ["SC-001"]
                    }
                ],
                guidedFilters: [
                    { field: "DistributionCenter", label: "Distribution Center", reason: "Filter inventory performance and OTIF by specific nodes." },
                    { field: "CustomerLane", label: "Customer Lane", reason: "Analyze service levels for key freight lanes." }
                ],
                retrievalPolicy: {
                    citationMode: "required",
                    freshnessExpectation: "Daily refresh",
                    allowedSourceTiers: ["tier-1-standard", "tier-5-internal-sme"]
                }
            },
            "procurement": {
                displayName: "CPG · Procurement",
                shortLabel: "Procurement",
                audienceLabel: "Global Sourcing Director / Procurement Manager",
                provenance: {
                    sourceIds: ["PROC-001"],
                    owner: "CPG Sourcing Operations",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "Spend Concentration", definition: "The proportion of total spend allocated to top suppliers in a category.", sourceIds: ["PROC-001"] }
                ],
                kpis: [
                    {
                        id: "spend-materiality",
                        label: "Materiality Spend",
                        description: "Total annual spend threshold for supplier concentration audits.",
                        formula: "Total Annual Spend per Supplier",
                        direction: "lower-is-better",
                        sourceIds: ["PROC-001"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "cpg-fmcg-procurement-template",
                        label: "CPG · Procurement Template",
                        sections: [
                            { name: "SPEND CONCENTRATION", instruction: "Rank spend categories by addressable spend." },
                            { name: "SUPPLIER RISK", instruction: "Summarize supplier operational and financial risk." },
                            { name: "CONTRACT WATCH", instruction: "Identify sole-source contracts expiring within 90 days." },
                            { name: "SAVINGS PIPELINE", instruction: "Recommend three savings actions against targets." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-spend-concentration",
                        label: "Analyze supplier spend concentration",
                        prompt: "Which sourcing categories have supplier spend concentration exceeding 60%?",
                        intent: "diagnostic",
                        sourceIds: ["PROC-001"]
                    }
                ],
                guidedFilters: [
                    { field: "SupplierCategory", label: "Supplier Category", reason: "Filter by raw materials, packaging, or logistics suppliers." }
                ],
                retrievalPolicy: {
                    citationMode: "when-available",
                    freshnessExpectation: "Monthly refresh",
                    allowedSourceTiers: ["tier-2-official-product", "tier-4-industry-analysis"]
                }
            }
        },
        overlays: {
            "sustainability": {
                displayName: "CPG · Sustainability Overlay",
                shortLabel: "Sustainability",
                provenance: {
                    sourceIds: ["ESG-001", "ESG-002"],
                    owner: "Corporate Sustainability & Governance S&OP Office",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "Scope 1 Emissions", definition: "Direct greenhouse gas emissions from sources owned or controlled by the company.", sourceIds: ["ESG-001"] },
                    { term: "Scope 2 Emissions", definition: "Indirect emissions from the generation of purchased electricity, steam, heating, or cooling.", sourceIds: ["ESG-001"] },
                    { term: "Scope 3 Emissions", definition: "All other indirect emissions in the value chain, both upstream and downstream.", sourceIds: ["ESG-002"] }
                ],
                kpis: [
                    {
                        id: "carbon-footprint",
                        label: "Carbon Intensity (per order)",
                        description: "Standard greenhouse gas footprint generated per customer shipment order.",
                        formula: "Total GHG Emissions (kg CO2e) / Total Shipped Orders",
                        direction: "lower-is-better",
                        thresholds: [
                            { tone: "good", expression: "<= 1.5" },
                            { tone: "watch", expression: "1.51 - 3.0" },
                            { tone: "risk", expression: "> 3.0" }
                        ],
                        sourceIds: ["ESG-001"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "sustainability-overlay-template",
                        label: "ESG & Carbon Posture Integration",
                        sections: [
                            { name: "EMISSIONS POSTURE", instruction: "Create a pipe table of Scope 1, 2, and 3 emissions." },
                            { name: "SUSTAINABILITY ACTIONS", instruction: "Provide emissions reduction actions anchored in SBTi." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-scope-emissions",
                        label: "Review carbon intensity and Scope 3 footprints",
                        prompt: "What is our carbon intensity metric per order, and which categories drive the largest Scope 3 emissions?",
                        intent: "opportunity",
                        sourceIds: ["ESG-002"]
                    }
                ],
                guidedFilters: [
                    { field: "CarbonIntensityTier", label: "Carbon Intensity Tier", reason: "Filter lanes or sites by low/high greenhouse gas profiles." }
                ]
            }
        }
    },
    "retail-digital": {
        id: "retail-digital",
        displayName: "E-Commerce & Digital Retail",
        subVerticals: {
            "merchandising": {
                displayName: "Retail · Merchandising",
                shortLabel: "Merchandising",
                audienceLabel: "Merchandise Planner / Category Manager",
                provenance: {
                    sourceIds: ["RET-001"],
                    owner: "Retail Category Sourcing",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "GMROI", definition: "Gross Margin Return on Investment, measuring inventory profitability.", sourceIds: ["RET-001"] },
                    { term: "Sell-Through Rate", definition: "Percentage of inventory sold during a specific period compared to opening stock.", sourceIds: ["RET-001"] }
                ],
                kpis: [
                    {
                        id: "gmroi",
                        label: "GMROI Ratio",
                        description: "Gross Margin Return on Investment, assessing capital efficiency of products.",
                        formula: "GMROI = (Gross Margin $) / (Average Inventory Cost)",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 2.5" },
                            { tone: "watch", expression: "1.5 - 2.49" },
                            { tone: "risk", expression: "< 1.5" }
                        ],
                        sourceIds: ["RET-001"]
                    },
                    {
                        id: "sell-through",
                        label: "Sell-Through %",
                        description: "The rate at which received inventory is sold in a timeframe.",
                        formula: "Sell-Through % = (Units Sold) / (Starting Inventory Units) x 100",
                        direction: "higher-is-better",
                        sourceIds: ["RET-001"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "retail-merchandising-template",
                        label: "Digital Merchandising Optimization",
                        sections: [
                            { name: "PRODUCT PERFORMANCE", instruction: "Rank sub-categories by sales velocity, inventory levels, and GMROI." },
                            { name: "MARKDOWN PLANNING", instruction: "Identify slow-moving stock and recommend promotional actions." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-gmroi-underperforming",
                        label: "Analyze low GMROI products",
                        prompt: "Which sub-categories have GMROI under 1.5, and what markdown levers are appropriate to clear the excess inventory?",
                        intent: "diagnostic",
                        sourceIds: ["RET-001"]
                    }
                ],
                guidedFilters: [
                    { field: "ProductCategory", label: "Product Category", reason: "Drill down into specific apparel, electronic, or grocery tiers." }
                ],
                retrievalPolicy: {
                    citationMode: "when-available",
                    freshnessExpectation: "Daily refresh",
                    allowedSourceTiers: ["tier-1-standard", "tier-3-research"]
                }
            },
            "digital-marketing": {
                displayName: "Retail · Digital Marketing",
                shortLabel: "Digital Marketing",
                audienceLabel: "Growth Marketing Director / UA Lead",
                provenance: {
                    sourceIds: ["RET-002"],
                    owner: "Growth Marketing & Acquisition Team",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "CAC", definition: "Customer Acquisition Cost, standard cost to acquire a single retail customer.", sourceIds: ["RET-002"] },
                    { term: "ROAS", definition: "Return on Ad Spend, revenue generated divided by ad spend.", sourceIds: ["RET-002"] }
                ],
                kpis: [
                    {
                        id: "roas",
                        label: "ROAS",
                        description: "Return on Advertising Spend calculated per platform.",
                        formula: "ROAS = (Ad-driven Revenue) / (Ad Spend)",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 4.0" },
                            { tone: "watch", expression: "2.5 - 3.99" },
                            { tone: "risk", expression: "< 2.5" }
                        ],
                        sourceIds: ["RET-002"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "retail-marketing-template",
                        label: "Acquisition & ROAS Funnel Report",
                        sections: [
                            { name: "CAMPAIGN OUTCOMES", instruction: "Summarize click-throughs, CAC, and platform-level ROAS." },
                            { name: "RETENTION TRIGGERS", instruction: "Recommend active re-engagement flows for churned profiles." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-roas-outliers",
                        label: "Analyze worst-performing campaigns",
                        prompt: "Which campaigns have a ROAS below 2.5, and what is the CAC breakdown for those segments?",
                        intent: "diagnostic",
                        sourceIds: ["RET-002"]
                    }
                ],
                guidedFilters: [
                    { field: "AdCampaignPlatform", label: "Ad Platform", reason: "Filter marketing analytics by Google Ads, Meta, or TikTok." }
                ],
                retrievalPolicy: {
                    citationMode: "when-available",
                    allowedSourceTiers: ["tier-1-standard", "tier-5-internal-sme"]
                }
            }
        },
        overlays: {
            "sustainability": {
                displayName: "Retail · Carbon Footprint Overlay",
                shortLabel: "Sustainability",
                provenance: {
                    sourceIds: ["ESG-R01"],
                    owner: "Retail ESG Oversight Board",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "Packaging Circularity", definition: "Proportion of packaging derived from compostable, biodegradable, or recycled streams.", sourceIds: ["ESG-R01"] }
                ],
                kpis: [
                    {
                        id: "packaging-circularity-rate",
                        label: "Circularity Rate %",
                        description: "Percentage of circular packaging materials distributed with shipped packages.",
                        formula: "(Circular Packaging Weight) / (Total Packaging Weight) x 100",
                        direction: "higher-is-better",
                        sourceIds: ["ESG-R01"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "retail-sustainability-template",
                        label: "Green Logistics & Circularity Integration",
                        sections: [
                            { name: "PACKAGING & EPR", instruction: "Decompose packaging materials by circularity and recyclable streams." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-circular-packaging",
                        label: "Review packaging circularity statistics",
                        prompt: "What is our overall packaging circularity percentage, and where is single-use plastic concentrated?",
                        intent: "risk",
                        sourceIds: ["ESG-R01"]
                    }
                ],
                guidedFilters: [
                    { field: "PackagingStream", label: "Packaging Stream", reason: "Filter by PET, glass, paperboard, or flexible plastic." }
                ]
            }
        }
    },
    "saas-product": {
        id: "saas-product",
        displayName: "SaaS & Digital Products",
        subVerticals: {
            "finance-saas": {
                displayName: "SaaS · Finance",
                shortLabel: "SaaS Finance",
                audienceLabel: "CFO / Director of FP&A",
                provenance: {
                    sourceIds: ["SAAS-F01", "SAAS-F02"],
                    owner: "SaaS Financial Operations",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "ARR", definition: "Annual Recurring Revenue, the annualized value of recurring subscription fees.", sourceIds: ["SAAS-F01"] },
                    { term: "NRR", definition: "Net Revenue Retention, calculating expansion, contraction, and churn impacts.", sourceIds: ["SAAS-F02"] }
                ],
                kpis: [
                    {
                        id: "nrr",
                        label: "NRR %",
                        description: "Net Revenue Retention measuring subscription cohort health.",
                        formula: "NRR % = (Starting ARR + Expansion ARR - Contraction ARR - Churned ARR) / (Starting ARR) x 100",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 115" },
                            { tone: "watch", expression: "100 - 114.9" },
                            { tone: "risk", expression: "< 100" }
                        ],
                        sourceIds: ["SAAS-F02"]
                    },
                    {
                        id: "ltv-cac-ratio",
                        label: "LTV:CAC Ratio",
                        description: "Ratio of Customer Lifetime Value to Customer Acquisition Cost.",
                        formula: "LTV:CAC = (Customer Lifetime Value) / (Customer Acquisition Cost)",
                        direction: "higher-is-better",
                        thresholds: [
                            { tone: "good", expression: ">= 3" },
                            { tone: "watch", expression: "2.0 - 2.99" },
                            { tone: "risk", expression: "< 2.0" }
                        ],
                        sourceIds: ["SAAS-F01"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "saas-finance-template",
                        label: "SaaS Unit Economics & ARR Bridge",
                        sections: [
                            { name: "ARR BRIDGE", instruction: "Decompose ARR into New, Expansion, Contraction, Churn, and Net New ARR." },
                            { name: "UNIT ECONOMICS", instruction: "Display LTV, CAC, Payback Period, and NRR trends by cohort." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-arr-bridge-summary",
                        label: "Decompose current ARR growth",
                        prompt: "What is our ARR bridge decomposition, and what is our current LTV:CAC payback speed?",
                        intent: "summary",
                        sourceIds: ["SAAS-F01"]
                    }
                ],
                guidedFilters: [
                    { field: "CustomerSegment", label: "Customer Segment", reason: "Filter by Enterprise, Mid-Market, or SMB tiers." }
                ],
                retrievalPolicy: {
                    citationMode: "required",
                    freshnessExpectation: "Real-time sync",
                    allowedSourceTiers: ["tier-1-standard", "tier-5-internal-sme"]
                }
            }
        },
        overlays: {
            "sustainability": {
                displayName: "SaaS · Green Software Overlay",
                shortLabel: "Green Computing",
                provenance: {
                    sourceIds: ["ESG-S01"],
                    owner: "Corporate Engineering ESG Office",
                    lastReviewedAt: "2026-05-23"
                },
                glossary: [
                    { term: "Cloud compute PUE", definition: "Power Usage Effectiveness measuring data center electrical overhead.", sourceIds: ["ESG-S01"] }
                ],
                kpis: [
                    {
                        id: "cloud-pue",
                        label: "Cloud PUE",
                        description: "Average Power Usage Effectiveness of server hosting facilities.",
                        formula: "Total Facility Energy / IT Equipment Energy",
                        direction: "lower-is-better",
                        thresholds: [
                            { tone: "good", expression: "<= 1.2" },
                            { tone: "watch", expression: "1.21 - 1.5" },
                            { tone: "risk", expression: "> 1.5" }
                        ],
                        sourceIds: ["ESG-S01"]
                    }
                ],
                insightTemplates: [
                    {
                        id: "saas-green-template",
                        label: "Cloud Compute Emissions & PUE Audit",
                        sections: [
                            { name: "COMPUTE EMISSIONS", instruction: "Estimate energy usage and carbon footprints across server instances." }
                        ]
                    }
                ],
                starterQuestions: [
                    {
                        id: "q-datacenter-pue",
                        label: "Audit data center PUE and emissions",
                        prompt: "What is the average PUE of our cloud compute regions, and what is the carbon footprint trajectory?",
                        intent: "risk",
                        sourceIds: ["ESG-S01"]
                    }
                ],
                guidedFilters: [
                    { field: "CloudHostingRegion", label: "Hosting Region", reason: "Filter server computing nodes by geo-location grid." }
                ]
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER FUNCTION: buildBusinessContextProfile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructs a full BusinessContextProfile from an active pack, sub-vertical, and optional overlays.
 * Validates inputs against the PACK_REGISTRY.
 * If inputs are missing or invalid, falls back gracefully while marking lower confidence levels
 * and emitting "Needs source review" descriptors where relevant.
 */
export function buildBusinessContextProfile(
    packId: string,
    subVerticalId?: string,
    overlayIds: string[] = []
): BusinessContextProfile {
    const packDef = PACK_REGISTRY[packId];

    // Case 1: Pack not found or unregistered.
    if (!packDef) {
        return buildFallbackProfile(packId, subVerticalId, overlayIds);
    }

    const subVerticalDef = subVerticalId ? packDef.subVerticals[subVerticalId] : undefined;

    // Case 2: Sub-vertical missing or unregistered in pack.
    if (subVerticalId && !subVerticalDef) {
        return buildFallbackProfile(packId, subVerticalId, overlayIds, `Sub-vertical "${subVerticalId}" not found in pack "${packId}"`);
    }

    // Standard profile initialization
    const profileId = subVerticalId ? `${packId}-${subVerticalId}` : packId;
    const displayName = subVerticalDef
        ? `${packDef.displayName} · ${subVerticalDef.displayName.split(" · ")[1] || subVerticalDef.displayName}`
        : packDef.displayName;
    const shortLabel = subVerticalDef ? subVerticalDef.shortLabel : packDef.displayName;
    const audienceLabel = subVerticalDef ? subVerticalDef.audienceLabel : "Generic Viewer";

    // Build lists from sub-vertical or default stub values
    const glossary = subVerticalDef ? [...subVerticalDef.glossary] : [];
    const kpis = subVerticalDef ? [...subVerticalDef.kpis] : [];
    const insightTemplates: BusinessContextProfile["insightTemplates"] = subVerticalDef
        ? subVerticalDef.insightTemplates.map(t => ({
              ...t,
              generatedFrom: "pack" as const
          }))
        : [];
    const starterQuestions = subVerticalDef ? [...subVerticalDef.starterQuestions] : [];
    const guidedFilters: BusinessContextProfile["guidedFilters"] = subVerticalDef
        ? subVerticalDef.guidedFilters.map(f => ({
              ...f,
              source: "pack" as const
          }))
        : [];

    const retrievalPolicy = subVerticalDef
        ? { ...subVerticalDef.retrievalPolicy }
        : {
              citationMode: "when-available" as const,
              allowedSourceTiers: ["tier-6-illustrative"]
          };

    const sourceIds = subVerticalDef ? [...subVerticalDef.provenance.sourceIds] : [];
    const owner = subVerticalDef ? subVerticalDef.provenance.owner : "System Scaffold";
    const lastReviewedAt = subVerticalDef ? subVerticalDef.provenance.lastReviewedAt : new Date().toISOString().split("T")[0];

    // Merge overlays safely (e.g., sustainability)
    const validOverlays: string[] = [];
    for (const ovId of overlayIds) {
        const ovDef = packDef.overlays[ovId];
        if (ovDef) {
            validOverlays.push(ovId);

            // Merge glossary terms
            for (const item of ovDef.glossary) {
                if (!glossary.some(g => g.term.toLowerCase() === item.term.toLowerCase())) {
                    glossary.push(item);
                }
            }

            // Merge KPIs
            for (const kpi of ovDef.kpis) {
                if (!kpis.some(k => k.id === kpi.id)) {
                    kpis.push(kpi);
                }
            }

            // Merge Templates
            for (const template of ovDef.insightTemplates) {
                if (!insightTemplates.some(t => t.id === template.id)) {
                    insightTemplates.push({
                        ...template,
                        generatedFrom: "overlay" as const
                    });
                }
            }

            // Merge Questions
            for (const question of ovDef.starterQuestions) {
                if (!starterQuestions.some(q => q.id === question.id)) {
                    starterQuestions.push(question);
                }
            }

            // Merge Filters
            for (const filter of ovDef.guidedFilters) {
                if (!guidedFilters.some(f => f.field === filter.field)) {
                    guidedFilters.push({
                        ...filter,
                        source: "pack" as const
                    });
                }
            }

            // Accumulate source IDs
            for (const srcId of ovDef.provenance.sourceIds) {
                if (!sourceIds.includes(srcId)) {
                    sourceIds.push(srcId);
                }
            }
        }
    }

    return {
        id: profileId,
        displayName,
        shortLabel,
        pack: packId,
        subVertical: subVerticalId,
        overlays: validOverlays,
        audienceLabel,
        // 2026-05-27 — was "sme-reviewed" per Codex audit P1 #23. That
        // claim required an actual SME review event, which the loader
        // path has no evidence of. Default to "author-confirmed" (the
        // honest claim for a pack profile that exists and loaded) and
        // let an explicit review pipeline promote to "sme-reviewed".
        confidence: "author-confirmed",
        provenance: {
            sourceRegisterPath: `pulsepacks/${packId}/knowledge-base/references.md`,
            sourceIds,
            owner,
            lastReviewedAt
        },
        glossary,
        kpis,
        insightTemplates,
        starterQuestions,
        guidedFilters,
        retrievalPolicy
    };
}

/**
 * Builds a fallback illustrative profile when the active pack or sub-vertical is unknown.
 * Explicitly flags missing source IDs, sets low confidence, and marks as "inferred".
 */
function buildFallbackProfile(
    packId: string,
    subVerticalId?: string,
    overlayIds: string[] = [],
    warningReason: string = "Pack is not registered"
): BusinessContextProfile {
    const profileId = subVerticalId ? `${packId}-${subVerticalId}-fallback` : `${packId}-fallback`;
    return {
        id: profileId,
        displayName: `${packId} (Illustrative Fallback)`,
        shortLabel: packId,
        pack: packId,
        subVertical: subVerticalId,
        overlays: overlayIds,
        audienceLabel: "Generic Business Viewer",
        confidence: "inferred",
        provenance: {
            sourceIds: [],
            owner: "Auto Scaffold Fallback Manager"
        },
        glossary: [
            {
                term: "Generic Business Context",
                definition: `Auto-generated illustrative metrics under ${warningReason}. Needs source register verification.`,
                sourceIds: []
            }
        ],
        kpis: [
            {
                id: "needs-source-review-kpi",
                label: "Needs source review",
                description: `This metric profile lacks validated business rules. Reason: ${warningReason}.`,
                formula: "Unavailable",
                direction: "neutral",
                sourceIds: []
            }
        ],
        insightTemplates: [
            {
                id: "fallback-template",
                label: "Ad-Hoc Business Template",
                sections: [
                    { name: "EXECUTIVE BRIEF", instruction: "Provide a generic high-level narrative. Cite that the context profile is an illustrative fallback." }
                ],
                generatedFrom: "pack"
            }
        ],
        starterQuestions: [
            {
                id: "q-fallback-question",
                label: "Review fallback warning report",
                prompt: "Show me the configuration status of this unverified business profile.",
                intent: "summary",
                sourceIds: []
            }
        ],
        guidedFilters: [],
        retrievalPolicy: {
            citationMode: "off",
            allowedSourceTiers: ["tier-6-illustrative"]
        }
    };
}
