// Cycle G — pack-merge regression guard.
//
// Locks down three invariants of the heritage-Pulse + vertical-pack merge:
//   1. Every heritage preset still appears in CUSTOM_SECTION_PRESETS.
//   2. The 10 CPG/FMCG sub-vertical presets are present and id-distinct.
//   3. interpolatePreset() still renders param-bearing pack presets without
//      leaking `{{params.X}}` syntax to downstream consumers.
import { describe, it, expect } from "vitest";
import {
    CUSTOM_SECTION_PRESETS,
    interpolatePreset,
} from "../../insightsPresetLibrary";
import { CPG_FMCG_CUSTOM_SECTION_PRESETS, PACK_CUSTOM_SECTION_PRESETS } from "..";

describe("CPG/FMCG pack merge", () => {
    it("appends 10 sub-vertical presets to CUSTOM_SECTION_PRESETS", () => {
        expect(CPG_FMCG_CUSTOM_SECTION_PRESETS).toHaveLength(10);
        expect(PACK_CUSTOM_SECTION_PRESETS).toHaveLength(10);
        const ids = CUSTOM_SECTION_PRESETS.map(p => p.id);
        for (const pack of CPG_FMCG_CUSTOM_SECTION_PRESETS) {
            expect(ids).toContain(pack.id);
        }
    });

    it("keeps every heritage Pulse preset id intact (no replacement)", () => {
        const heritage = [
            "sales-performance",
            "customer-health",
            "operations-supply-chain",
            "hospital-operations",
            "hr-workforce",
            "finance-budget",
            "superstore-executive-brief",
            "swot-analysis",
            "bcg-matrix",
            "rfm-segmentation",
            "pareto-8020",
            "variance-bridge",
            "anomaly-detection",
        ];
        const ids = new Set(CUSTOM_SECTION_PRESETS.map(p => p.id));
        for (const h of heritage) expect(ids.has(h)).toBe(true);
    });

    it("has globally unique preset ids", () => {
        const ids = CUSTOM_SECTION_PRESETS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("each pack preset declares a non-empty CPG-domain string", () => {
        for (const p of CPG_FMCG_CUSTOM_SECTION_PRESETS) {
            expect(p.domain).toMatch(/^CPG \/ /);
            expect(p.sections.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("interpolatePreset substitutes pack-preset params without leaking syntax", () => {
        const supply = CPG_FMCG_CUSTOM_SECTION_PRESETS.find(p => p.id === "cpg-fmcg-supply-chain");
        expect(supply).toBeDefined();
        const rendered = interpolatePreset(supply!, { otifTargetPct: 97 });
        const joined = rendered.map(s => s.instruction).join(" ");
        expect(joined).not.toMatch(/\{\{params\./);
        expect(joined).toContain("97");
    });

    it("interpolatePreset on a heritage preset stays string-equal to the source", () => {
        const heritage = CUSTOM_SECTION_PRESETS.find(p => p.id === "sales-performance");
        expect(heritage).toBeDefined();
        const rendered = interpolatePreset(heritage!);
        expect(rendered).toEqual(
            heritage!.sections.map(s => ({ name: s.name, instruction: s.instruction })),
        );
    });
});
