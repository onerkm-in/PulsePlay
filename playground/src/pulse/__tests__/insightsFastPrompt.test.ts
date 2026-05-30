import { describe, expect, it } from "vitest";
import type { ContextSummary } from "../contextBuilder";
import {
    buildFastHybridInsightsStagePrompts,
    buildStagedHybridInsightsPlan,
    buildHybridInsightsStagePrompts,
    buildInsightsStagePrompts,
    FAST_INSIGHTS_STAGE_TITLE,
    FORMAT_MASK_GUARD,
} from "../visualHelpers";

const context: ContextSummary = {
    hasSelection: false,
    contextText: "",
    safeContextText: "",
    boundFieldNames: ["Sales", "Profit", "Region"],
    dimensions: {
        Region: ["East", "West"],
    },
    measures: {
        Sales: 733215,
        Profit: 93440,
    },
    availableFilters: [],
    filterCount: 0,
    mandatoryScopeText: "",
};

describe("buildFastHybridInsightsStagePrompts", () => {
    it("bundles the default briefing into one Genie call", () => {
        const result = buildFastHybridInsightsStagePrompts(
            context,
            "Sales Performance",
            [],
            "viewer",
        );

        expect(result.titles).toEqual([FAST_INSIGHTS_STAGE_TITLE]);
        expect(result.stages).toHaveLength(1);
        expect(result.stages[0]).toContain("FAST BRIEFING MODE");
        expect(result.stages[0]).toContain("## HEADLINE");
        expect(result.stages[0]).toContain("## KPI SNAPSHOT");
        expect(result.stages[0]).toContain("## TRENDS");
        expect(result.stages[0]).toContain("## RISKS");
        expect(result.stages[0]).toContain("## RECOMMENDED ACTIONS");
        expect(result.stages[0]).toContain("Sales, Profit");
        expect(result.stages[0]).toContain("POLISH CONTRACT");
        expect(result.stages[0]).toContain("Put status icons only in KPI table cells");
        expect(result.stages[0]).toContain("above the 3% caution line");
    });

    it("injects the FORMAT_MASK_GUARD so the model never parrots `#` masks", () => {
        const result = buildFastHybridInsightsStagePrompts(context, "Sales Performance", [], "viewer");
        expect(result.stages[0]).toContain(FORMAT_MASK_GUARD);
    });

    it("respects hidden universal sections and skips SQL-only custom sections", () => {
        const result = buildFastHybridInsightsStagePrompts(
            context,
            "Retail",
            [
                { name: "Category Mix", instruction: "Rank category contribution by sales and margin." },
                { name: "SQL Scorecard", instruction: "", kind: "sql", sql: "select 1" },
            ],
            "viewer",
            undefined,
            undefined,
            undefined,
            { headline: true, trends: false, risks: true, actions: false },
        );

        expect(result.stages).toHaveLength(1);
        expect(result.stages[0]).toContain("## HEADLINE");
        expect(result.stages[0]).not.toContain("## TRENDS");
        expect(result.stages[0]).toContain("## CATEGORY MIX");
        expect(result.stages[0]).not.toContain("SQL Scorecard");
        expect(result.stages[0]).toContain("## RISKS");
        expect(result.stages[0]).not.toContain("## RECOMMENDED ACTIONS");
    });
});

describe("FORMAT_MASK_GUARD is injected across every insights builder", () => {
    // The mask-parroting bug (model printing `### ### ###.##` from the
    // author's Formatting Standards table) must be guarded in EVERY path
    // that builds an insights prompt — "the formatting should apply
    // throughout" (user direction 2026-05-28).
    const guidanceWithMaskTable =
        "## Formatting Standards\n| Range | Format | Example |\n|---|---|---|\n| < 1 000 | #,###.## | 567.89 |\n| >= 1 000 | #,### | 12 345 |";

    it("the guard names the literal mask pattern it forbids", () => {
        expect(FORMAT_MASK_GUARD).toContain("#");
        expect(FORMAT_MASK_GUARD).toContain("never a value");
    });

    it("staged hybrid plan injects the guard into every batch", () => {
        const plan = buildStagedHybridInsightsPlan(
            context,
            "Sales Performance",
            [
                { name: "Executive Brief", instruction: "Summarize the quarter." },
                { name: "Category Mix", instruction: "Rank category contribution." },
            ],
            "viewer",
            undefined,
            undefined,
            guidanceWithMaskTable,
        );
        expect(plan.stages.length).toBeGreaterThan(1);
        for (const stage of plan.stages) {
            expect(stage).toContain(FORMAT_MASK_GUARD);
        }
    });

    it("fast hybrid bundle injects the guard", () => {
        const result = buildFastHybridInsightsStagePrompts(
            context, "Sales Performance", [], "viewer", undefined, undefined, guidanceWithMaskTable,
        );
        expect(result.stages[0]).toContain(FORMAT_MASK_GUARD);
    });

    it("hybrid staged builder injects the guard into its stages", () => {
        const result = buildHybridInsightsStagePrompts(
            context,
            "Sales Performance",
            [{ name: "Executive Brief", instruction: "Summarize the quarter." }],
            "viewer",
            undefined,
            undefined,
            guidanceWithMaskTable,
        );
        expect(result.stages.some(s => s.includes(FORMAT_MASK_GUARD))).toBe(true);
    });

    it("legacy 5-stage builder injects the guard", () => {
        const result = buildInsightsStagePrompts(context, "viewer");
        expect(result.stages.some(s => s.includes(FORMAT_MASK_GUARD))).toBe(true);
    });
});
