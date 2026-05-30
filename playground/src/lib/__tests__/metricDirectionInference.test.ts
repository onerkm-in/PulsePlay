// playground/src/lib/__tests__/metricDirectionInference.test.ts
//
// Locks the metric-name → direction heuristic. If we change the patterns
// these tests have to update too — by design, so the next contributor
// has to acknowledge the semantic change instead of silently flipping
// directions on the user's existing dataset.

import { describe, expect, it } from "vitest";
import {
    classifyMetric,
    inferMetricRulesFromBindings,
} from "../metricDirectionInference";

describe("classifyMetric — HIGHER patterns", () => {
    it.each([
        "Revenue", "Total Sales", "Profit", "Gross Margin", "YoY Growth",
        "Conversion Rate", "Retention", "NRR", "ARR", "MRR", "AOV", "LTV",
        "CSAT", "NPS", "Quality Score", "Forecast Accuracy", "Throughput",
        "Attainment", "Engagement %", "Win Rate", "Fill Rate", "OTIF %",
        "Coverage Ratio", "Uptime %",
    ])("classifies %s as higher", (name) => {
        expect(classifyMetric(name)).toBe("higher");
    });
});

describe("classifyMetric — LOWER patterns", () => {
    it.each([
        "Return Rate", "Customer Churn", "Attrition", "Total Cost", "OpEx",
        "COGS", "Burn Rate", "Avg Delay", "Latency (ms)", "Wait Time",
        "Defect Rate", "Error Count", "Incident Volume", "Downtime min",
        "Risk Score", "Bounce Rate", "Cart Abandon Rate", "Complaint Count",
        "Backlog Size", "Cycle Time", "Lead Time", "Aging Days",
        // 2026-05-28 — added discount/spend/burn coverage per user direction
        "Discount %", "Discount Rate", "Discounts", "Ad Spend", "Cash Burn",
    ])("classifies %s as lower", (name) => {
        expect(classifyMetric(name)).toBe("lower");
    });
});

describe("classifyMetric — CONTEXT (refuse to fabricate)", () => {
    it.each([
        "Headcount", "Inventory Days", "Patient Count", "Active Users",
        "Department", "Region", "Date", "Country Code",
        "ventas",  // non-English; out of scope
        "",
    ])("classifies %s as context", (name) => {
        expect(classifyMetric(name)).toBe("context");
    });
});

describe("classifyMetric — LOWER wins over HIGHER when both match", () => {
    // 2026-05-28 — "return rate" contains both "return" (LOWER) and
    // "rate" patterns. Order in classifyMetric checks LOWER first to
    // avoid emitting "higher is better" for clearly bad-when-up metrics.
    it("'Return Rate' lands LOWER even though 'rate' is in many HIGHER metrics", () => {
        expect(classifyMetric("Return Rate")).toBe("lower");
    });
    it("'Churn Conversion' lands LOWER because churn dominates", () => {
        expect(classifyMetric("Churn Conversion")).toBe("lower");
    });
});

describe("inferMetricRulesFromBindings", () => {
    it("emits one rules line per classified metric, joined by newlines", () => {
        const result = inferMetricRulesFromBindings(["Revenue", "Returns", "Margin %"]);
        expect(result.rules).toBe([
            "Revenue: higher is better",
            "Returns: lower is better",
            "Margin %: higher is better",
        ].join("\n"));
        expect(result.totalInspected).toBe(3);
        expect(result.confidentCount).toBe(3);
    });

    it("skips CONTEXT metrics instead of emitting a wrong direction", () => {
        const result = inferMetricRulesFromBindings(["Revenue", "Headcount", "Returns"]);
        expect(result.rules).toBe([
            "Revenue: higher is better",
            "Returns: lower is better",
        ].join("\n"));
        expect(result.totalInspected).toBe(3);
        expect(result.confidentCount).toBe(2);
    });

    it("returns empty rules + zero confidentCount when no metric classifies", () => {
        const result = inferMetricRulesFromBindings(["Headcount", "Department", ""]);
        expect(result.rules).toBe("");
        expect(result.confidentCount).toBe(0);
        expect(result.totalInspected).toBe(3);
    });

    it("handles empty input cleanly", () => {
        const result = inferMetricRulesFromBindings([]);
        expect(result.rules).toBe("");
        expect(result.totalInspected).toBe(0);
        expect(result.confidentCount).toBe(0);
    });

    it("trims whitespace from input names before classifying", () => {
        const result = inferMetricRulesFromBindings(["  Revenue  ", "  Returns  "]);
        expect(result.rules).toBe([
            "Revenue: higher is better",
            "Returns: lower is better",
        ].join("\n"));
    });
});
