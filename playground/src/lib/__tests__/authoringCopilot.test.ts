import { describe, it, expect } from "vitest";
import { buildAuthoringProposals, applyProposals } from "../authoringCopilot";
import type { DiscoverySnapshot } from "../discoveryClient";

/** Snapshot fixture matching the REAL shape read by extractMeasuresAndDimensions:
 *  measures  <- sources.biMetadata.visibleMeasures (fallback fused.availableKpis)
 *  dimensions<- sources.biMetadata.visibleDimensions
 *  A fixture that guesses the shape would make these tests meaningless. */
function snap(over: Record<string, unknown> = {}): DiscoverySnapshot {
    return {
        probe: { connectorType: "genie" },
        sources: {
            biMetadata: {
                visibleMeasures: [
                    { name: "Order Fill Rate Pct" },
                    { name: "OTIF Pct" },
                    { name: "Net Sales USD" },
                    { name: "Ordered Qty" },
                ],
                visibleDimensions: [
                    { name: "sales_channel" },
                    { name: "country" },
                ],
            },
        },
        fused: {
            availableKpis: [
                { name: "Order Fill Rate Pct", definition: "delivered / ordered", direction: "higher-is-better" },
                { name: "OTIF Pct", definition: "on time in full", direction: "higher-is-better" },
            ],
        },
        ...over,
    } as unknown as DiscoverySnapshot;
}

describe("buildAuthoringProposals — never invents", () => {
    it("returns noSignal for a null snapshot instead of a fabricated draft", () => {
        const b = buildAuthoringProposals({ snapshot: null });
        expect(b.noSignal).toBe(true);
        expect(b.proposals).toEqual([]);
    });

    it("returns noSignal for an empty snapshot", () => {
        const b = buildAuthoringProposals({ snapshot: {} as DiscoverySnapshot });
        expect(b.noSignal).toBe(true);
        expect(b.proposals).toEqual([]);
    });

    it("every proposal carries a non-empty because trace", () => {
        const b = buildAuthoringProposals({ snapshot: snap() });
        expect(b.proposals.length).toBeGreaterThan(0);
        for (const p of b.proposals) {
            expect(p.because.length).toBeGreaterThan(0);
            expect(p.because.every(r => typeof r === "string" && r.trim())).toBe(true);
            expect(p.source).toBe("deterministic");
        }
    });
});

describe("buildAuthoringProposals — never silently stomps", () => {
    it("flags overwrites when the author already wrote the field", () => {
        const b = buildAuthoringProposals({
            snapshot: snap(),
            current: { domainGuidance: "My hand-written guidance." },
        });
        const g = b.proposals.find(p => p.field === "domainGuidance");
        expect(g).toBeDefined();
        expect(g!.overwrites).toBe(true);
    });

    it("does not flag overwrites for an empty field", () => {
        const b = buildAuthoringProposals({ snapshot: snap(), current: {} });
        for (const p of b.proposals) expect(p.overwrites).toBe(false);
    });

    it("skips a proposal identical to the current value (no noise)", () => {
        const first = buildAuthoringProposals({ snapshot: snap() });
        const guidance = first.proposals.find(p => p.field === "domainGuidance")!;
        const second = buildAuthoringProposals({
            snapshot: snap(),
            current: { domainGuidance: guidance.value },
        });
        expect(second.proposals.find(p => p.field === "domainGuidance")).toBeUndefined();
        // signal existed, so this is "nothing to change", NOT an empty state
        expect(second.noSignal).toBe(false);
    });
});

describe("buildAuthoringProposals — grounded confidence", () => {
    it("is high when measures and KPI definitions are both present", () => {
        const b = buildAuthoringProposals({ snapshot: snap() });
        const p = b.proposals.find(x => x.field === "insightsPrompt");
        expect(p?.confidence).toBe("high");
    });

    it("metric rules cite how many measures were actually classified", () => {
        const b = buildAuthoringProposals({ snapshot: snap() });
        const m = b.proposals.find(x => x.field === "metricDirectionRules");
        if (m) {
            expect(m.because.join(" ")).toMatch(/classified by name/);
            expect(m.because.join(" ")).toMatch(/left out/);
        }
    });
});

describe("applyProposals", () => {
    it("folds only the accepted proposals into a patch", () => {
        const b = buildAuthoringProposals({ snapshot: snap() });
        const one = b.proposals.slice(0, 1);
        const patch = applyProposals(one);
        expect(Object.keys(patch)).toHaveLength(1);
        expect(patch[one[0].field]).toBe(one[0].value);
    });

    it("applies nothing for an empty acceptance list", () => {
        expect(applyProposals([])).toEqual({});
    });

    it("ignores malformed entries rather than throwing", () => {
        // @ts-expect-error deliberately malformed
        expect(applyProposals([null, { field: "domainGuidance" }])).toEqual({});
    });
});
