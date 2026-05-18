// playground/src/pulse/__tests__/metricDirectionsUnfavorableTone.test.ts
//
// Locks the `unfavorableMovementTone` field added 2026-05-18 to bring
// amber into the direction-only logic (previously: red/green only). The
// matrix covers favorable direction (always good), unfavorable direction
// with default tone ("bad" → red — backward compat), unfavorable
// direction with "warn" tone ("watch" → amber), and threshold-band
// precedence (still wins over the direction tone when value crosses).

import { describe, expect, it } from "vitest";
import { getMetricTone, parseMetricDirectionsJson } from "../rendering/metricDirections";

function rulesJson(rules: Array<{
    name: string;
    higherIsBetter: boolean;
    aliases?: string[];
    amberPct?: number;
    redPct?: number;
    unfavorableMovementTone?: "warn" | "bad";
}>): string {
    return JSON.stringify(rules);
}

describe("getMetricTone — unfavorableMovementTone direction-only path", () => {
    it("favorable up on higher-is-better: good (unchanged)", () => {
        const tone = getMetricTone({
            metricName: "Profit Margin",
            deltaText: "+1.5pp",
            valueText: "1.5",
            structuredJson: rulesJson([
                { name: "Profit Margin", higherIsBetter: true },
            ]),
        });
        expect(tone.semanticTone).toBe("good");
        expect(tone.matchedRule).toBeDefined();
    });

    it("unfavorable up on lower-is-better with NO field set: bad (default, backward compat)", () => {
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+0.3pp",
            valueText: "0.3",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false },
            ]),
        });
        expect(tone.semanticTone).toBe("bad");
    });

    it("unfavorable up on lower-is-better with unfavorableMovementTone='warn': warn (amber)", () => {
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+0.3pp",
            valueText: "0.3",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
            ]),
        });
        expect(tone.semanticTone).toBe("warn");
        // deltaTone also flips so inline pills can render amber consistently.
        expect(tone.deltaTone).toBe("warn");
    });

    it("unfavorable up with unfavorableMovementTone='bad' (explicit): same as default — bad", () => {
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+0.3pp",
            valueText: "0.3",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "bad" },
            ]),
        });
        expect(tone.semanticTone).toBe("bad");
    });

    it("unfavorable down on higher-is-better with 'warn': warn (amber)", () => {
        // Profit Margin drop = unfavorable for higher-is-better; author opts watch.
        const tone = getMetricTone({
            metricName: "Profit Margin",
            deltaText: "-0.7pp",
            valueText: "0.7",
            structuredJson: rulesJson([
                { name: "Profit Margin", higherIsBetter: true, unfavorableMovementTone: "warn" },
            ]),
        });
        expect(tone.direction).toBe("down");
        expect(tone.semanticTone).toBe("warn");
    });

    it("favorable down on lower-is-better with 'warn': still good (field only affects unfavorable direction)", () => {
        // Return Rate dropping is GOOD for lower-is-better — favorable
        // direction. unfavorableMovementTone must NOT flip this to warn.
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "-0.4pp",
            valueText: "0.4",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
            ]),
        });
        expect(tone.direction).toBe("down");
        expect(tone.semanticTone).toBe("good");
    });

    it("threshold band hit takes precedence over unfavorableMovementTone='warn'", () => {
        // Lower-is-better, value 8 crosses redPct=6 → bad even though
        // unfavorableMovementTone='warn' would otherwise prefer amber.
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+5pp",
            valueText: "8",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn", amberPct: 3, redPct: 6 },
            ]),
        });
        expect(tone.semanticTone).toBe("bad");
    });

    it("threshold band hits amber: warn (independent of unfavorableMovementTone)", () => {
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+3pp",
            valueText: "4",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, amberPct: 3, redPct: 6 },
            ]),
        });
        expect(tone.semanticTone).toBe("warn");
    });

    it("explicit statusText still wins over both threshold and direction tone", () => {
        const tone = getMetricTone({
            metricName: "Return Rate",
            deltaText: "+0.3pp",
            valueText: "0.3",
            statusText: "🔴 Off-track",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
            ]),
        });
        // statusTone wins (semanticTone = statusTone).
        expect(tone.semanticTone).toBe("bad");
    });

    it("no rule matched: direction tone fallback unaffected by the new field on unrelated rules", () => {
        const tone = getMetricTone({
            metricName: "Marketing Spend",
            deltaText: "+12pp",
            valueText: "12",
            structuredJson: rulesJson([
                { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
            ]),
        });
        expect(tone.matchedRule).toBeUndefined();
        // No rule, no statusText, direction=up → getSemanticTone fallback.
        // The new field cannot affect a metric that didn't match its rule.
        expect(tone.semanticTone).toBe("good");
    });
});

describe("parseMetricDirectionsJson — unfavorableMovementTone round-trip", () => {
    it("reads 'warn' verbatim", () => {
        const rules = parseMetricDirectionsJson(rulesJson([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
        ]));
        expect(rules).toHaveLength(1);
        expect(rules[0].unfavorableMovementTone).toBe("warn");
    });

    it("reads 'bad' verbatim", () => {
        const rules = parseMetricDirectionsJson(rulesJson([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "bad" },
        ]));
        expect(rules[0].unfavorableMovementTone).toBe("bad");
    });

    it("omits the field when input value is invalid (foo, null, number, missing)", () => {
        const rules = parseMetricDirectionsJson(JSON.stringify([
            { name: "A", higherIsBetter: false, unfavorableMovementTone: "foo" },
            { name: "B", higherIsBetter: false, unfavorableMovementTone: null },
            { name: "C", higherIsBetter: false, unfavorableMovementTone: 42 },
            { name: "D", higherIsBetter: false },
        ]));
        for (const r of rules) {
            expect(r.unfavorableMovementTone).toBeUndefined();
        }
    });
});
