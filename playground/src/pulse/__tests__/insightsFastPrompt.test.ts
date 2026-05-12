import { describe, expect, it } from "vitest";
import type { ContextSummary } from "../contextBuilder";
import {
    buildFastHybridInsightsStagePrompts,
    FAST_INSIGHTS_STAGE_TITLE,
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
