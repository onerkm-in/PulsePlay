// playground/src/pulse/__tests__/metricRulesEngineUnfavorableTone.test.ts
//
// Schema round-trip for the new unfavorableMovementTone field on
// MetricRule. JSON writes only when the author picked "warn" so default
// payloads stay clean; jsonToRules reads both "warn" and "bad" verbatim.

import { describe, expect, it } from "vitest";
import { jsonToRules, rulesToJson, type MetricRule } from "../metricRulesEngine";

function rule(over: Partial<MetricRule> = {}): MetricRule {
    return {
        name: "Return Rate",
        higherIsBetter: false,
        aliases: [],
        ...over,
    };
}

describe("rulesToJson — unfavorableMovementTone", () => {
    it("omits field when undefined (default 'bad' is implicit)", () => {
        const json = rulesToJson([rule()]);
        expect(json).not.toMatch(/unfavorableMovementTone/);
    });

    it("omits field when explicitly 'bad' (default is implicit, keeps payload clean)", () => {
        const json = rulesToJson([rule({ unfavorableMovementTone: "bad" })]);
        expect(json).not.toMatch(/unfavorableMovementTone/);
    });

    it("writes 'warn' verbatim when author opted in", () => {
        const json = rulesToJson([rule({ unfavorableMovementTone: "warn" })]);
        expect(json).toMatch(/"unfavorableMovementTone":\s*"warn"/);
    });
});

describe("jsonToRules — unfavorableMovementTone", () => {
    it("reads 'warn' back", () => {
        const json = JSON.stringify([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "warn" },
        ]);
        const rules = jsonToRules(json);
        expect(rules[0].unfavorableMovementTone).toBe("warn");
    });

    it("reads 'bad' back (explicit)", () => {
        const json = JSON.stringify([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "bad" },
        ]);
        const rules = jsonToRules(json);
        expect(rules[0].unfavorableMovementTone).toBe("bad");
    });

    it("omits field when JSON value is invalid (foo, null, number, missing)", () => {
        const json = JSON.stringify([
            { name: "A", higherIsBetter: false, unfavorableMovementTone: "foo" },
            { name: "B", higherIsBetter: false, unfavorableMovementTone: null },
            { name: "C", higherIsBetter: false, unfavorableMovementTone: 99 },
            { name: "D", higherIsBetter: false },
        ]);
        const rules = jsonToRules(json);
        expect(rules).toHaveLength(4);
        for (const r of rules) {
            expect(r.unfavorableMovementTone).toBeUndefined();
        }
    });
});

describe("round-trip rulesToJson → jsonToRules preserves field", () => {
    it("warn preserved through one round-trip", () => {
        const original: MetricRule[] = [rule({ unfavorableMovementTone: "warn" })];
        const back = jsonToRules(rulesToJson(original));
        expect(back[0].unfavorableMovementTone).toBe("warn");
    });

    it("default (undefined) stays undefined through one round-trip", () => {
        const original: MetricRule[] = [rule()];
        const back = jsonToRules(rulesToJson(original));
        expect(back[0].unfavorableMovementTone).toBeUndefined();
    });

    it("explicit 'bad' becomes undefined on round-trip (rulesToJson treats default as implicit)", () => {
        // This is the intentional asymmetry — rulesToJson treats "bad" as
        // the default and skips writing it, so jsonToRules reads back
        // undefined. Renderer treats undefined as "bad" too, so the
        // behavior is identical end-to-end.
        const original: MetricRule[] = [rule({ unfavorableMovementTone: "bad" })];
        const back = jsonToRules(rulesToJson(original));
        expect(back[0].unfavorableMovementTone).toBeUndefined();
    });
});
