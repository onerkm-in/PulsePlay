/**
 * knowledgeBase.ts
 *
 * Embedded analytics + visualization intelligence injected into Genie prompts.
 * Structured as typed rule sets so individual sections can be selectively
 * enabled, updated, or extended with org-specific rules without touching
 * prompt strings in visualHelpers.ts.
 *
 * VERSION BUMP: increment KB_VERSION on every substantive change so reports
 * can log which knowledge set produced each insight.
 */

export const KB_VERSION = "1.1.0";

// ─── Chart selection rules ──────────────────────────────────────────────────

/**
 * Maps a data relationship to the best chart type with concise rationale.
 * Used by the AI to recommend or critique chart choices in answers.
 */
export interface ChartRule {
    relationship: string;
    conditions: string;
    recommended: string;
    avoid: string;
}

export const CHART_RULES: ChartRule[] = [
    {
        relationship: "comparison-categorical",
        conditions: "Comparing values across ≤7 discrete categories (not time)",
        recommended: "Horizontal bar chart (sorted descending)",
        avoid: "Pie chart, 3D chart, unsorted bars"
    },
    {
        relationship: "comparison-categorical-many",
        conditions: "Comparing values across 8+ categories",
        recommended: "Sorted horizontal bar with Top-N + Other grouping, or table with conditional formatting",
        avoid: "Pie, radar, unsorted bars"
    },
    {
        relationship: "comparison-time-trend",
        conditions: "Continuous metric trend over time",
        recommended: "Line chart",
        avoid: "Bar chart (implies discrete), pie"
    },
    {
        relationship: "comparison-time-discrete",
        conditions: "Discrete period totals (monthly, quarterly, yearly)",
        recommended: "Column chart",
        avoid: "Line (implies interpolation between periods)"
    },
    {
        relationship: "comparison-period-over-period",
        conditions: "Same metric, two time periods side-by-side",
        recommended: "Grouped column or overlapping line with annotation",
        avoid: "Dual-axis (unless causally related), stacked bar"
    },
    {
        relationship: "composition-static",
        conditions: "2–5 parts of a whole, single point in time, simple message",
        recommended: "Donut chart (centre label for total)",
        avoid: "Pie with >5 slices, 3D pie, exploded pie"
    },
    {
        relationship: "composition-static-precise",
        conditions: "Parts of a whole where exact values matter",
        recommended: "100% stacked bar or table with % column",
        avoid: "Pie/donut (angles are hard to read precisely)"
    },
    {
        relationship: "composition-hierarchical",
        conditions: "Nested composition (categories within categories)",
        recommended: "Treemap",
        avoid: "Nested pie, 3D"
    },
    {
        relationship: "composition-over-time-absolute",
        conditions: "How parts change over time — absolute volumes matter",
        recommended: "Stacked area or stacked column",
        avoid: "100% stacked (hides volume), pie series"
    },
    {
        relationship: "composition-over-time-proportion",
        conditions: "How proportions shift over time",
        recommended: "100% stacked column or area",
        avoid: "Regular stacked (hides proportional shift)"
    },
    {
        relationship: "distribution-single",
        conditions: "How a single numeric variable is spread",
        recommended: "Histogram (bin width = IQR × 2 / n^(1/3) Freedman-Diaconis)",
        avoid: "Bar chart, pie"
    },
    {
        relationship: "distribution-groups",
        conditions: "Comparing distributions across 2+ groups",
        recommended: "Box plot (shows median, IQR, outliers) or violin plot",
        avoid: "Overlapping histograms (hard to read), bar of averages (hides spread)"
    },
    {
        relationship: "correlation-two-continuous",
        conditions: "Relationship between two numeric variables",
        recommended: "Scatter plot",
        avoid: "Line chart (implies causation), bar"
    },
    {
        relationship: "correlation-with-size",
        conditions: "Relationship between two metrics plus a third magnitude",
        recommended: "Bubble chart",
        avoid: "3D scatter (depth distorts)"
    },
    {
        relationship: "flow-funnel",
        conditions: "Sequential stages with drop-off (sales funnel, hiring pipeline)",
        recommended: "Funnel chart",
        avoid: "Pie (no sequence), stacked bar"
    },
    {
        relationship: "kpi-single",
        conditions: "Single metric vs target",
        recommended: "KPI card or bullet chart",
        avoid: "Gauge/speedometer (low data-ink ratio, hard to read precisely)"
    }
];

// ─── Statistical standards ──────────────────────────────────────────────────

export interface StatRule {
    id: string;
    rule: string;
    rationale: string;
}

export const STAT_RULES: StatRule[] = [
    {
        id: "central-tendency",
        rule: "Use MEDIAN for skewed distributions (income, house prices, response times). Use MEAN only for symmetric distributions.",
        rationale: "Outliers pull the mean; median is resistant. A dataset with one $10M sale and 99 $10K sales has a misleading mean of ~$109K but a median of $10K."
    },
    {
        id: "outlier-definition",
        rule: "Flag values outside 1.5×IQR from Q1/Q3 as mild outliers; outside 3×IQR as extreme outliers. Report both counts separately.",
        rationale: "IQR fences are distribution-agnostic and more robust than Z-score for non-normal data."
    },
    {
        id: "yoy-calculation",
        rule: "YoY % = (Current Period − Prior Year Same Period) / |Prior Year Same Period| × 100. When prior year is negative or zero, report absolute change instead of % and label it clearly.",
        rationale: "Division by a negative base inverts the sign and misleads. Division by zero is undefined."
    },
    {
        id: "moving-average",
        rule: "Use 7-day SMA for weekly seasonality smoothing, 13-week for quarterly, 12-month for annual. Label the window period explicitly.",
        rationale: "An unlabelled trend line creates ambiguity about the smoothing method."
    },
    {
        id: "correlation-causation",
        rule: "Report correlation coefficients (r). Never state 'X causes Y' from correlation alone. Always qualify: 'X and Y move together' or 'X is associated with Y'.",
        rationale: "Confounders, reverse causation, and spurious correlation are common in BI datasets."
    },
    {
        id: "significance",
        rule: "For business BI, a practical significance threshold of ≥5% change vs prior period is more useful than statistical significance. Flag changes ≥2σ from the rolling mean as noteworthy.",
        rationale: "p-values require sample size context business users rarely have; practical thresholds are more actionable."
    },
    {
        id: "percentage-points",
        rule: "When comparing percentages, use PERCENTAGE POINTS (pp) for absolute difference and % for relative change. '60% → 66% is +6pp (+10% relative increase)'. Never say '+10%' when you mean '+6pp'.",
        rationale: "Confusing pp and % is one of the most common data communication errors."
    },
    {
        id: "sample-vs-population",
        rule: "Clarify whether numbers represent the full population (no confidence interval needed) or a sample (report CI). Most operational BI uses populations — no inference needed.",
        rationale: "Applying inferential statistics to full-population data is technically incorrect."
    }
];

// ─── Reporting & storytelling standards ────────────────────────────────────

export interface ReportingRule {
    id: string;
    principle: string;
    implementation: string;
}

export const REPORTING_RULES: ReportingRule[] = [
    {
        id: "pyramid-principle",
        principle: "Lead with the conclusion (BLUF — Bottom Line Up Front). Put supporting evidence after.",
        implementation: "Start every insight with: 'SITUATION: what is happening. IMPLICATION: why it matters. RECOMMENDATION: what to do.'"
    },
    {
        id: "kpi-hierarchy",
        principle: "Every metric should roll up to one North Star metric. Show the causal chain: leading indicators → lagging indicators → North Star.",
        implementation: "Order visuals: North Star first, then dimensional breakdowns, then drivers, then operational details."
    },
    {
        id: "annotation",
        principle: "Annotate anomalies directly on the chart. Never rely on the reader to connect a table footnote to a chart spike.",
        implementation: "Add a callout with: date, value, and one-line cause. E.g. '↑ 40% — Campaign launch 15 Mar'."
    },
    {
        id: "context-always",
        principle: "Every metric needs context to be meaningful: vs target, vs prior period, vs peer group.",
        implementation: "KPI cards must show: current value, % vs prior period, indicator (on/off track vs target)."
    },
    {
        id: "precision",
        principle: "Report with appropriate precision. Revenue in billions to 1dp (£3.2B). Count of transactions as integers. Percentages to 1dp.",
        implementation: "Never show false precision: £3,214,567,892 when £3.2B communicates the same insight."
    },
    {
        id: "color-sparingly",
        principle: "Use colour to encode data or draw attention — never decoratively. Maximum 5–6 categorical colours per chart.",
        implementation: "Highlight one bar/line if it is the point of the chart. Gray the rest."
    },
    {
        id: "zero-baseline",
        principle: "Bar charts must start at zero. Line charts may use non-zero baseline only when the message is trend direction, not magnitude.",
        implementation: "Truncated bar charts systematically mislead by making small differences look large."
    },
    {
        id: "data-ink",
        principle: "Remove all chart elements that do not carry data: borders, background fills, redundant gridlines, 3D effects, shadows on chart elements.",
        implementation: "Every pixel should justify itself by encoding information. If removing it loses no information, remove it."
    }
];

// ─── Visualization anti-patterns ────────────────────────────────────────────

export const VIZ_ANTIPATTERNS: string[] = [
    "Pie charts with more than 5 segments",
    "3D charts (any type — depth distorts magnitude)",
    "Dual Y-axis charts (implies false correlation between unrelated metrics)",
    "Truncated bar chart y-axis (makes small differences look large)",
    "Rainbow/random colour palettes on categorical data",
    "Averages without showing distribution (hides bimodal distributions)",
    "Cumulative charts without labelling them as cumulative",
    "Sparklines without a defined scale (unanchored trends are meaningless)",
    "Gauge/speedometer charts (low data-ink ratio — use bullet chart instead)",
    "Maps when geography is irrelevant (use bar chart sorted by value instead)"
];

// ─── Color standards ────────────────────────────────────────────────────────

export interface ColorPaletteRule {
    type: string;
    useCase: string;
    recommendation: string;
    accessibility: string;
}

export const COLOR_RULES: ColorPaletteRule[] = [
    {
        type: "categorical",
        useCase: "Distinguishing unordered groups (regions, product lines, segments)",
        recommendation: "Max 6–8 distinct hues. Use Okabe-Ito or Paul Tol palettes for colorblind safety. Never use red/green as the only distinction.",
        accessibility: "All foreground/background pairs must meet WCAG AA 4.5:1 contrast ratio."
    },
    {
        type: "sequential",
        useCase: "Encoding a single continuous variable from low to high (revenue, temperature, density)",
        recommendation: "Single-hue sequential (light to dark). Blue or green for positive-neutral data. Avoid rainbow — it has no perceptual order.",
        accessibility: "Ensure the lightest shade still passes 3:1 contrast against the background."
    },
    {
        type: "diverging",
        useCase: "Data with a meaningful midpoint (profit/loss, above/below target, temperature anomaly)",
        recommendation: "Blue–White–Red or Green–White–Red (with colorblind-safe end hues). Anchor the midpoint at exactly zero or the target value.",
        accessibility: "Do not rely solely on red/green — add a pattern or saturation difference."
    },
    {
        type: "traffic-light",
        useCase: "Status indicators (KPI on/off track, alert levels)",
        recommendation: "Green ≥ target, Amber 80–99% of target, Red < 80%. Always define thresholds explicitly in the report. Add shape or icon redundancy for colorblind users.",
        accessibility: "Use icon + colour: ✓ green, ⚠ amber, ✕ red."
    }
];

// ─── Power BI specific rules ─────────────────────────────────────────────────

export const PBI_RULES: string[] = [
    "Report pages should follow Z-pattern reading order: headline KPIs top-left, key chart top-right, details bottom. Keep the most important insight top-left.",
    "Limit visuals per page to 6–8 maximum. Each visual should answer exactly one question.",
    "Use cross-filter interactions intentionally — document which visuals filter others. Avoid accidental circular filters.",
    "Tooltips should add context not visible on the chart face: % of total, rank, prior period value.",
    "Drill-through pages should be self-contained: include a back button and the key filters that drove the drill.",
    "Slicers should be positioned consistently — top or left panel. Use dropdown slicers for >5 values.",
    "Use bookmarks for navigation and saved filter states, not as a substitute for proper report design.",
    "Every page should have a title that states the question it answers, not a generic label like 'Sales Dashboard'.",
    "Font sizes: page title ≥18pt, section header ≥14pt, data labels ≥10pt, never smaller.",
    "Accessible reports: set tab order, add alt-text to all visuals, ensure 4.5:1 contrast, test with screen reader."
];

// ─── Supervisor & Fusion rules ──────────────────────────────────────────────

export interface SupervisorRule {
    id: string;
    principle: string;
    implementation: string;
}

export const SUPERVISOR_RULES: SupervisorRule[] = [
    {
        id: "fusion-integrity",
        principle: "Preserve all numbers, percentages, and named entities exactly as stated in the source answers.",
        implementation: "Do not round, estimate, or summarise away precise numerical data. If Space A says 45.2% and Space B says 45.3%, report both or explain the variance."
    },
    {
        id: "fusion-conflict",
        principle: "Highlight where spaces agree and explicitly note meaningful differences or contradictions.",
        implementation: "Lead with: 'The spaces agree that... However, they differ on...'."
    },
    {
        id: "fusion-conclusion",
        principle: "Lead with a unified, high-level conclusion before diving into space-specific details.",
        implementation: "Start the response with a 'UNIFIED CONCLUSION' section."
    },
    {
        id: "fusion-clarity",
        principle: "Do not ask clarifying questions during synthesis — use all available data to provide the best possible combined answer.",
        implementation: "Synthesise with the data you have. If data is missing for one space, state 'Data not available for [Data Source]'."
    }
];

// ─── Org-extensible KB entries ───────────────────────────────────────────────

/**
 * OrgKBEntry — an org-specific rule or convention injected at runtime.
 * Populated by parsing the report author's domainGuidance field.
 * Kept separate from the built-in KB so built-in rules are never overwritten.
 */
export interface OrgKBEntry {
    category: "metric-definition" | "formatting" | "business-rule" | "threshold" | "custom";
    rule: string;
}

/**
 * Parse org-specific rules out of the domainGuidance text.
 * Looks for lines starting with a bullet, dash, or numbered list item.
 */
export function parseOrgRules(domainGuidance: string): OrgKBEntry[] {
    if (!domainGuidance.trim()) return [];
    return domainGuidance
        .split("\n")
        .map(l => l.trim())
        .filter(l => /^[-*•]|^\d+\./.test(l))
        .map(l => l.replace(/^[-*•\d.]\s*/, "").trim())
        .filter(l => l.length > 10)
        .map(rule => ({ category: "custom" as const, rule }));
}

// ─── KB system prompt composer ───────────────────────────────────────────────

const MAX_KB_CHARS = 2800;

/**
 * Compose a concise analytics intelligence block to prepend to Genie prompts.
 * Kept tight (under 2800 chars) so it doesn't dominate the token budget.
 *
 * Selectively injects:
 *  - Chart selection rules (key decisions only)
 *  - Statistical standards (the most commonly violated)
 *  - Reporting rules (BLUF, precision, context)
 *  - Anti-patterns (hard stops)
 *
 * The full ANALYTICS_KNOWLEDGE_BASE.md is the reference doc;
 * this function distils the actionable rules for prompt injection.
 */
export function getKBSystemPrompt(includeCharts = true, includeStats = true, includeReporting = true): string {
    const sections: string[] = [];

    sections.push(`[Analytics Intelligence v${KB_VERSION}]`);

    if (includeCharts) {
        const chartLines = [
            "CHART SELECTION (use these rules when recommending visualisations):",
            ...CHART_RULES.slice(0, 8).map(r => `- ${r.conditions} → ${r.recommended}. Avoid: ${r.avoid}.`),
            "Anti-patterns (never recommend): " + VIZ_ANTIPATTERNS.slice(0, 5).join("; ") + "."
        ];
        sections.push(chartLines.join("\n"));
    }

    if (includeStats) {
        const statLines = [
            "STATISTICAL STANDARDS:",
            ...STAT_RULES.slice(0, 5).map(r => `- ${r.rule}`)
        ];
        sections.push(statLines.join("\n"));
    }

    if (includeReporting) {
        const reportLines = [
            "REPORTING STANDARDS:",
            ...REPORTING_RULES.slice(0, 5).map(r => `- ${r.principle} ${r.implementation}`)
        ];
        sections.push(reportLines.join("\n"));
    }

    const raw = sections.join("\n\n");
    // Hard cap — truncate rather than exceed token budget
    return raw.length > MAX_KB_CHARS ? raw.slice(0, MAX_KB_CHARS) + "\n[KB truncated]" : raw;
}

/**
 * Compose a system prompt for the Supervisor agent to use during synthesis/fusion.
 */
export function getSupervisorSystemPrompt(customPrompt?: string): string {
    const sections: string[] = [];
    sections.push(`[Supervisor Synthesis v${KB_VERSION}]`);

    if (customPrompt && customPrompt.trim()) {
        sections.push(customPrompt.trim());
    } else {
        sections.push("You are a Supervisor Agent. Your task is to synthesise answers from multiple Genie spaces into a single, complete, accurate response.");
        sections.push("RULES:");
        SUPERVISOR_RULES.forEach(r => sections.push(`- ${r.principle} ${r.implementation}`));
    }

    return sections.join("\n\n");
}

/**
 * Compact version for chat questions (shorter, chart-rules only stripped).
 * Used in single-turn chat calls where token budget is tighter.
 */
export function getKBChatHint(includeStats = true, includeReporting = true): string {
    const rules: string[] = [];
    if (includeStats) {
        rules.push(STAT_RULES[0].rule);
        rules.push(STAT_RULES[6].rule);
    }
    if (includeReporting) {
        rules.push(REPORTING_RULES[0].principle);
        rules.push(REPORTING_RULES[4].principle);
    }

    if (rules.length === 0) return "";

    const lines = [
        `[Analytics v${KB_VERSION}]`,
        "Key rules: " + rules.join(" | ")
    ];
    return lines.join("\n");
}
