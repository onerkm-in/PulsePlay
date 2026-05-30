import { describe, it, expect } from "vitest";
import { stripTableLeadIn } from "../contentSanitizer";

describe("stripTableLeadIn — drops a dangling table lead-in (the 'leakage')", () => {
    it("drops the trailing '…are:' lead-in but keeps the data sentence", () => {
        const inp = "Sales have grown steadily year over year, with the highest sales in 2017 at $733,215.26 and the lowest in 2015 at $470,532.51. The sales figures for each year are:";
        expect(stripTableLeadIn(inp)).toBe("Sales have grown steadily year over year, with the highest sales in 2017 at $733,215.26 and the lowest in 2015 at $470,532.51.");
    });

    it("drops a 'shown below:' lead-in", () => {
        expect(stripTableLeadIn("Profit rose 14% year over year. The breakdown by region is shown below:"))
            .toBe("Profit rose 14% year over year.");
    });

    it("drops a 'Top risks:' lead-in", () => {
        expect(stripTableLeadIn("Returns increased in Q3, signaling quality issues. Top risks:"))
            .toBe("Returns increased in Q3, signaling quality issues.");
    });

    it("leaves prose without a trailing colon unchanged", () => {
        const p = "Total sales were $2.3M across all regions.";
        expect(stripTableLeadIn(p)).toBe(p);
    });

    it("does NOT strip a mid-sentence colon (only a trailing one)", () => {
        const p = "Margins are healthy; the 3 segments are: strong overall.";
        expect(stripTableLeadIn(p)).toBe(p);
    });

    it("returns empty when the prose is ONLY a lead-in", () => {
        expect(stripTableLeadIn("The sales figures for each year are:")).toBe("");
    });

    it("is safe on empty input", () => {
        expect(stripTableLeadIn("")).toBe("");
    });
});
