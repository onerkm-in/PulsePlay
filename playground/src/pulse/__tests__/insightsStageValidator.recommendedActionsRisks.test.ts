// Truth-gate coverage for the two Insights validators the spec describes
// most precisely: RECOMMENDED ACTIONS must be exactly 3 numbered imperative
// actions each citing a numeric target/impact, and RISKS must be at least
// 2 bold-headed bullets. Both were previously looser than their own
// retryDirective copy claimed.

import { describe, it, expect } from "vitest";
import { validateStageOutput } from "../insightsStageValidator";

describe("validateStageOutput — RECOMMENDED ACTIONS", () => {
    const ACTION = (n: number, metric = true) =>
        `${n}. Reallocate spend to top SKUs${metric ? `, lifting margin by ${n}pp` : ""}`;

    it("passes exactly 3 numbered imperative actions each with a numeric target", () => {
        const body = [1, 2, 3].map(n => ACTION(n)).join("\n");
        expect(validateStageOutput("RECOMMENDED ACTIONS", body).ok).toBe(true);
    });

    it("rejects 2 items (previously allowed 2-4)", () => {
        const body = [1, 2].map(n => ACTION(n)).join("\n");
        const r = validateStageOutput("RECOMMENDED ACTIONS", body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/exactly 3/);
    });

    it("rejects 4 items (previously allowed 2-4)", () => {
        const body = [1, 2, 3, 4].map(n => ACTION(n)).join("\n");
        const r = validateStageOutput("RECOMMENDED ACTIONS", body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/exactly 3/);
    });

    it("rejects 3 items when only some cite a numeric target (previously a floor of >=1)", () => {
        const body = [ACTION(1, true), ACTION(2, false), ACTION(3, true)].join("\n");
        const r = validateStageOutput("RECOMMENDED ACTIONS", body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/no numeric target/);
    });

    it("accepts 3 items when all three cite a numeric target", () => {
        const body = [ACTION(1), ACTION(2), ACTION(3)].join("\n");
        expect(validateStageOutput("RECOMMENDED ACTIONS", body).ok).toBe(true);
    });
});

describe("validateStageOutput — RISKS", () => {
    it("passes 2 bold-headed bullets with numeric magnitudes", () => {
        const body = [
            "- **Customer concentration**: top 5 customers = 18% of sales",
            "- **Margin compression**: gross margin down 2.49pp YoY",
        ].join("\n");
        expect(validateStageOutput("RISKS", body).ok).toBe(true);
    });

    it("rejects bullets that aren't bold-headed", () => {
        const body = [
            "- Customer concentration is a risk: top 5 customers = 18% of sales",
            "- Margin compression: gross margin down 2.49pp YoY",
        ].join("\n");
        const r = validateStageOutput("RISKS", body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/bold header/);
    });

    it("still passes with 2 items (not forced to exactly 3)", () => {
        const body = [
            "- **Supplier lead time**: 14 days vs 7-day target",
            "- **Inventory turnover**: down to 3.2x from 4.1x",
        ].join("\n");
        expect(validateStageOutput("RISKS", body).ok).toBe(true);
    });
});
