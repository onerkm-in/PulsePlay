import { describe, expect, it } from "vitest";
import type { ContextSummary } from "../contextBuilder";
import {
    applyMetricFrame,
    METRIC_FRAME_ANCHOR,
    buildStagedHybridInsightsPlan,
} from "../visualHelpers";
import { buildMetricFrame, renderMetricFrameBlock } from "../metricFrame";

const context: ContextSummary = {
    hasSelection: false,
    contextText: "",
    safeContextText: "",
    boundFieldNames: ["Net Sales", "Gross Margin", "Country"],
    dimensions: { Country: ["CL", "MX"] },
    measures: { "Net Sales": 1988032198.71, "Gross Margin": 56.03 },
    availableFilters: [],
    filterCount: 0,
    mandatoryScopeText: "",
};

const LIVE = {
    columns: ["Metric", "Period", "Value"],
    rows: [
        ["Net Sales USD", "Jan-Jun 2025", "1.8953528300799997E9"],
        ["Net Sales USD", "Jan-Jun 2026", "1.9880321987100003E9"],
    ],
};

describe("applyMetricFrame", () => {
    it("substitutes the frame block for the anchor", () => {
        const block = renderMetricFrameBlock(buildMetricFrame(LIVE));
        const out = applyMetricFrame(`before\n${METRIC_FRAME_ANCHOR}\nafter`, block);
        expect(out).not.toContain(METRIC_FRAME_ANCHOR);
        expect(out).toContain("PRE-COMPUTED METRIC FRAME (authoritative)");
        expect(out).toContain("$1.99 B");
        expect(out).toContain("before");
        expect(out).toContain("after");
    });

    it("removes the anchor line entirely when no frame could be built", () => {
        const out = applyMetricFrame(`before\n${METRIC_FRAME_ANCHOR}\nafter`, "");
        expect(out).toBe("before\nafter");
        expect(out).not.toContain(METRIC_FRAME_ANCHOR);
    });

    it("leaves a prompt without the anchor untouched", () => {
        expect(applyMetricFrame("no anchor here", "block")).toBe("no anchor here");
    });

    it("survives a retry prompt that wraps the original text", () => {
        // buildRetryPrompt re-wraps prompts[index], so the anchor is still
        // inside; substitution happens at the send seam, after the override is
        // chosen, so a retry must still resolve.
        const retry = `RETRY. Your previous answer failed.\n\nOriginal:\n${METRIC_FRAME_ANCHOR}`;
        const out = applyMetricFrame(retry, renderMetricFrameBlock(buildMetricFrame(LIVE)));
        expect(out).not.toContain(METRIC_FRAME_ANCHOR);
        expect(out).toContain("$1.99 B");
    });
});

describe("the anchor is present in every staged prompt", () => {
    const plan = buildStagedHybridInsightsPlan(
        context,
        "Supply Chain Performance",
        [
            { name: "Executive Brief", instruction: "Summarize the half." },
            { name: "Market Mix", instruction: "Rank market contribution." },
        ],
        "viewer",
    );

    it("every stage carries the anchor so the frame reaches all sections", () => {
        expect(plan.stages.length).toBeGreaterThan(1);
        for (const stage of plan.stages) {
            expect(stage).toContain(METRIC_FRAME_ANCHOR);
        }
    });

    it("no stage would ship the raw token to the model once substituted", () => {
        for (const stage of plan.stages) {
            expect(applyMetricFrame(stage, "")).not.toContain(METRIC_FRAME_ANCHOR);
            expect(applyMetricFrame(stage, "FRAME")).not.toContain(METRIC_FRAME_ANCHOR);
        }
    });
});
