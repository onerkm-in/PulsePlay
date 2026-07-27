import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
    buildDeterministicPbiInsightsPlan,
    isPbiTimeDimensionName,
    matchFeaturedMeasures,
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

describe("buildDeterministicPbiInsightsPlan — grouper quality", () => {
    it("prefers plain categoricals over *_name over *_id, and named time grains over date keys", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: ["Total Sales"],
            dimensions: ["customer_id", "customer_name", "segment", "date_key", "year", "month"],
            universalStages: { headline: true, trends: true, risks: true, actions: false },
        });
        expect(plan.stages.some(q => /by segment/i.test(q))).toBe(true);
        expect(plan.stages.some(q => /Top 5 segment/i.test(q))).toBe(true);
        expect(plan.stages.some(q => /customer_id/i.test(q))).toBe(false);
        // trend picks a named grain, never the raw date_key
        expect(plan.stages.some(q => /date_key/i.test(q))).toBe(false);
    });
});

// AIINSIGHTS-B2 — the briefing must lead with a governed KPI, not a raw volume
// input that merely feeds one. The SCM model's probe order puts "Ordered Qty"
// first; the headline should still be a KPI-shaped measure.
describe("buildDeterministicPbiInsightsPlan — headline measure ranking", () => {
    const SCM = [
        "Ordered Qty", "Delivered Qty", "Order Lines", "Order Fill Rate Pct",
        "OTIF Pct", "Units Produced", "Hours Worked", "Net Sales USD",
        "Gross Margin Pct",
    ];
    const SCM_DIMS = ["sales_channel", "country", "date_month"];

    it("leads with a KPI-shaped measure, not the first raw input in probe order", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: SCM, dimensions: SCM_DIMS });
        // HEADLINE is the first stage: "What is the <m1>?"
        expect(plan.titles[0]).toBe("HEADLINE");
        expect(plan.stages[0]).toMatch(/Order Fill Rate Pct/);
        expect(plan.stages[0]).not.toMatch(/Ordered Qty/);
    });

    it("never leads with a raw *_qty / lines / hours input", () => {
        const plan = buildDeterministicPbiInsightsPlan({ measures: SCM, dimensions: SCM_DIMS });
        expect(plan.stages[0]).not.toMatch(/\b(Qty|Lines|Hours|Units)\b/);
    });

    it("author/pack featuredMeasures override the heuristic and win the headline", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: SCM, dimensions: SCM_DIMS,
            featuredMeasures: ["Net Sales USD"],
        });
        expect(plan.stages[0]).toMatch(/Net Sales USD/);
    });

    it("degrades gracefully when every measure is a raw input (keeps probe order)", () => {
        const plan = buildDeterministicPbiInsightsPlan({
            measures: ["Ordered Qty", "Delivered Qty"], dimensions: SCM_DIMS,
        });
        expect(plan.stages[0]).toMatch(/Ordered Qty/); // first in probe order, no KPI available
    });
});

// Slice 2 — pack KPI labels drive the featured measures (domain-driven headline).
describe("matchFeaturedMeasures — pack KPI labels → probe measure names", () => {
    const PBI = ["Ordered Qty", "Order Fill Rate Pct", "OTIF Pct", "Net Sales USD", "Gross Margin Pct", "Forecast Accuracy Pct"];

    it("matches unit/%-suffixed measures to the pack's % labels, in pack order", () => {
        const out = matchFeaturedMeasures(["OTIF %", "Forecast Accuracy %", "Net Sales"], PBI);
        expect(out).toEqual(["OTIF Pct", "Forecast Accuracy Pct", "Net Sales USD"]);
    });

    it("skips pack KPIs with no probe measure, dedupes, keeps pack order", () => {
        const out = matchFeaturedMeasures(["Inventory Health", "OTIF %", "OTIF %"], PBI);
        expect(out).toEqual(["OTIF Pct"]);
    });

    it("empty pack labels → empty (heuristic stays in charge)", () => {
        expect(matchFeaturedMeasures([], PBI)).toEqual([]);
    });

    it("drives the headline when fed into the plan as featuredMeasures", () => {
        const featured = matchFeaturedMeasures(["OTIF %"], PBI);
        const plan = buildDeterministicPbiInsightsPlan({
            measures: PBI, dimensions: ["sales_channel", "date_month"], featuredMeasures: featured,
        });
        expect(plan.stages[0]).toMatch(/OTIF Pct/);
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
