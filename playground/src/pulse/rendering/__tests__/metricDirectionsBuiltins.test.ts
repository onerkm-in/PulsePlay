// playground/src/pulse/rendering/__tests__/metricDirectionsBuiltins.test.ts
//
// Phase E 2026-05-18 — verifies that built-in lower-is-better defaults
// fire when no author rule is present, and that author rules always win.

import { describe, expect, it } from "vitest";
import {
    BUILTIN_LOWER_IS_BETTER_RULES,
    resolveMetricDirection,
} from "../metricDirections";

describe("BUILTIN_LOWER_IS_BETTER_RULES shape", () => {
    it("every built-in rule has higherIsBetter=false and unfavorableMovementTone='warn'", () => {
        for (const rule of BUILTIN_LOWER_IS_BETTER_RULES) {
            expect(rule.higherIsBetter, `${rule.name}.higherIsBetter`).toBe(false);
            expect(rule.unfavorableMovementTone, `${rule.name}.unfavorableMovementTone`).toBe("warn");
        }
    });

    it("is frozen (immutable)", () => {
        expect(Object.isFrozen(BUILTIN_LOWER_IS_BETTER_RULES)).toBe(true);
    });
});

describe("resolveMetricDirection — builtin fallback", () => {
    it.each([
        ["Return Rate"],
        ["Return %"],
        ["Returns"],
        ["Churn Rate"],
        ["Churn"],
        ["Defect Rate"],
        ["Error Rate"],
        ["Complaint Rate"],
        ["Cancellation Rate"],
        ["Refund Rate"],
        ["Bounce Rate"],
    ])("resolves %s with higherIsBetter=false and warn tone when no author rule", (name) => {
        const rule = resolveMetricDirection(name);
        expect(rule, `builtin should resolve '${name}'`).toBeDefined();
        expect(rule!.higherIsBetter).toBe(false);
        expect(rule!.unfavorableMovementTone).toBe("warn");
    });

    it("author rule beats builtin when both match", () => {
        const authorJson = JSON.stringify([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "bad" },
        ]);
        const rule = resolveMetricDirection("Return Rate", authorJson);
        expect(rule).toBeDefined();
        // Author said "bad" — builtin would have said "warn"
        expect(rule!.unfavorableMovementTone).toBe("bad");
    });

    it("author rule overrides builtin higherIsBetter when author says higher is better", () => {
        const authorJson = JSON.stringify([
            { name: "Churn Rate", higherIsBetter: true },
        ]);
        const rule = resolveMetricDirection("Churn Rate", authorJson);
        expect(rule!.higherIsBetter).toBe(true);
    });

    it("unknown metric returns undefined (no builtin match)", () => {
        const rule = resolveMetricDirection("Revenue");
        expect(rule).toBeUndefined();
    });

    it("unknown metric with author rule returns that rule", () => {
        const authorJson = JSON.stringify([{ name: "Revenue", higherIsBetter: true }]);
        const rule = resolveMetricDirection("Revenue", authorJson);
        expect(rule).toBeDefined();
        expect(rule!.higherIsBetter).toBe(true);
    });

    it("case-insensitive match for builtin (mixed case input)", () => {
        const rule = resolveMetricDirection("return rate");
        expect(rule).toBeDefined();
        expect(rule!.higherIsBetter).toBe(false);
    });
});
