import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
    buildDeterministicPbiInsightsPlan,
    isPbiTimeDimensionName,
} from "../visualHelpers";

// Cross-check against the REAL proxy matcher so we prove every generated
// question routes to a DAX template (not the "no measure" fallback) — this is
// the whole point of AIINSIGHTS-P1.
const require = createRequire(import.meta.url);
const { matchQuestion } = require("../../../../proxy/lib/powerbiQuestionMatcher.js");

function probeFor(measures: string[], dims: string[]) {
    return {
        declaredKpis: measures.map(name => ({ name })),
        schema: {
            tables: [{
                name: "Data",
                columns: dims.map(name => ({
                    name,
                    type: isPbiTimeDimensionName(name) ? "datetime" : "string",
                })),
            }],
        },
    };
}

const MEASURES = ["Total Sales", "Total Profit"];
const DIMS = ["Region", "Category", "Month"];

describe("buildDeterministicPbiInsightsPlan — shape", () => {
    it("returns empty when no measures are known (caller falls back to prose plan)", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: [], dimensions: DIMS });
        expect(plan.stages).toEqual([]);
        expect(plan.titles).toEqual([]);
    });

    it("emits one stage per title and never duplicates a question", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: MEASURES, dimensions: DIMS });
        expect(plan.stages.length).toBe(plan.titles.length);
        expect(new Set(plan.stages).size).toBe(plan.stages.length);
        expect(plan.stages.length).toBeGreaterThanOrEqual(4);
    });

    it("caps at maxStages", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: MEASURES, dimensions: DIMS,
            customSectionNames: ["A", "B", "C", "D", "E"], maxStages: 3,
        });
        expect(plan.stages.length).toBe(3);
    });

    it("respects universal section toggles", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: MEASURES, dimensions: DIMS,
            universalStages: { headline: false, trends: false, risks: true, actions: false },
        });
        expect(plan.titles).not.toContain("HEADLINE");
        expect(plan.titles).not.toContain("TRENDS");
        expect(plan.titles).toContain("RISKS");
    });

    it("maps custom sections to measure-by-dimension breakdowns titled by the section", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: MEASURES, dimensions: DIMS,
            universalStages: { headline: false, trends: false, risks: false, actions: false },
            customSectionNames: ["Category performance"],
        });
        expect(plan.titles).toContain("CATEGORY PERFORMANCE");
        // matched the section name to the Category dimension
        expect(plan.stages.some(q => /by Category/i.test(q))).toBe(true);
    });
});

describe("buildDeterministicPbiInsightsPlan — every question matches a DAX template", () => {
    it("no generated question hits the 'no measure' fallback (full field set)", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: MEASURES, dimensions: DIMS,
            customSectionNames: ["Regional breakdown"],
        });
        const probe = probeFor(MEASURES, DIMS);
        for (const q of plan.stages) {
            const m = matchQuestion(q, probe);
            expect(m.matched, `question "${q}" should match a template`).toBe(true);
        }
    });

    it("covers all four DAX templates given a measure + entity dim + time dim", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: MEASURES, dimensions: DIMS });
        const probe = probeFor(MEASURES, DIMS);
        const templates = new Set(plan.stages.map(q => matchQuestion(q, probe)).filter(m => m.matched).map(m => m.templateId));
        expect(templates.has("total")).toBe(true);
        expect(templates.has("aggregate-by")).toBe(true);
        expect(templates.has("trend")).toBe(true);
        expect(templates.has("top-n")).toBe(true);
    });

    it("works with a single measure and no dimensions (total-only)", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: ["Revenue"], dimensions: [] });
        const probe = probeFor(["Revenue"], []);
        expect(plan.stages.length).toBeGreaterThanOrEqual(1);
        for (const q of plan.stages) {
            expect(matchQuestion(q, probe).matched, `"${q}"`).toBe(true);
        }
    });
});

describe("isPbiTimeDimensionName", () => {
    it("flags time/date-ish names, not entity names", () => {
        expect(isPbiTimeDimensionName("Month")).toBe(true);
        expect(isPbiTimeDimensionName("OrderDate")).toBe(true);
        expect(isPbiTimeDimensionName("Fiscal Year")).toBe(true);
        expect(isPbiTimeDimensionName("Region")).toBe(false);
        expect(isPbiTimeDimensionName("Category")).toBe(false);
    });
});
