// playground/src/authoring/__tests__/businessContextProfile.test.ts
//
// Comprehensive unit tests for the Unified Business Context and Authoring Model.
// Satisfies Phase 1 test requirements.

import { describe, expect, it } from "vitest";
import {
    buildBusinessContextProfile,
    PACK_REGISTRY
} from "../businessContextProfile";
import {
    generateDefaults,
    applyAuthorOverrides
} from "../generatedDefaults";

describe("businessContextProfile — buildBusinessContextProfile", () => {
    it("constructs correct OTIF thresholds, formulas, and real source IDs for cpg-fmcg / supply-chain", () => {
        const profile = buildBusinessContextProfile("cpg-fmcg", "supply-chain");

        expect(profile.id).toBe("cpg-fmcg-supply-chain");
        expect(profile.pack).toBe("cpg-fmcg");
        expect(profile.subVertical).toBe("supply-chain");
        expect(profile.confidence).toBe("sme-reviewed");
        expect(profile.provenance.sourceIds).toContain("SC-001");
        expect(profile.provenance.sourceIds).toContain("SC-002");

        // Verify OTIF KPI specifically
        const otifKpi = profile.kpis.find(k => k.id === "otif");
        expect(otifKpi).toBeDefined();
        expect(otifKpi!.label).toBe("OTIF %");
        expect(otifKpi!.formula).toContain("On-time & complete orders");
        expect(otifKpi!.direction).toBe("higher-is-better");
        expect(otifKpi!.sourceIds).toContain("SC-001");
        expect(otifKpi!.thresholds).toEqual([
            { tone: "good", expression: ">= 95" },
            { tone: "watch", expression: "90 - 94.9" },
            { tone: "risk", expression: "< 90" }
        ]);

        // Verify retrieval policy
        expect(profile.retrievalPolicy.citationMode).toBe("required");
        expect(profile.retrievalPolicy.freshnessExpectation).toBe("Daily refresh");
    });

    it("appends Green Computing PUE carbon emissions KPIs, templates, and guided filters when sustainability overlay is applied to saas-product / finance-saas", () => {
        const baseProfile = buildBusinessContextProfile("saas-product", "finance-saas");
        expect(baseProfile.kpis.some(k => k.id === "cloud-pue")).toBe(false);
        expect(baseProfile.overlays).toHaveLength(0);

        const overlayProfile = buildBusinessContextProfile("saas-product", "finance-saas", ["sustainability"]);

        expect(overlayProfile.overlays).toContain("sustainability");
        expect(overlayProfile.provenance.sourceIds).toContain("ESG-S01");

        // Assert that Green Computing PUE KPI got appended correctly
        const pueKpi = overlayProfile.kpis.find(k => k.id === "cloud-pue");
        expect(pueKpi).toBeDefined();
        expect(pueKpi!.label).toBe("Cloud PUE");
        expect(pueKpi!.direction).toBe("lower-is-better");
        expect(pueKpi!.formula).toBe("Total Facility Energy / IT Equipment Energy");

        // Assert that green software glossary terms got merged
        const glossaryTerm = overlayProfile.glossary.find(g => g.term === "Cloud compute PUE");
        expect(glossaryTerm).toBeDefined();
        expect(glossaryTerm!.definition).toContain("Power Usage Effectiveness");

        // Assert templates got merged
        const greenTemplate = overlayProfile.insightTemplates.find(t => t.id === "saas-green-template");
        expect(greenTemplate).toBeDefined();
        expect(greenTemplate!.generatedFrom).toBe("overlay");

        // Assert filters got merged
        const hostingRegionFilter = overlayProfile.guidedFilters.find(f => f.field === "CloudHostingRegion");
        expect(hostingRegionFilter).toBeDefined();
        expect(hostingRegionFilter!.label).toBe("Hosting Region");
    });

    it("triggers the fallback illustrative profile showing Needs source review warning when an invalid pack is selected", () => {
        const fallbackProfile = buildBusinessContextProfile("non-existent-pack", "some-sub-vertical");

        expect(fallbackProfile.id).toBe("non-existent-pack-some-sub-vertical-fallback");
        expect(fallbackProfile.displayName).toContain("Illustrative Fallback");
        expect(fallbackProfile.confidence).toBe("inferred");
        expect(fallbackProfile.provenance.sourceIds).toHaveLength(0);

        // Verify fallback KPIs
        const reviewKpi = fallbackProfile.kpis.find(k => k.id === "needs-source-review-kpi");
        expect(reviewKpi).toBeDefined();
        expect(reviewKpi!.label).toBe("Needs source review");
        expect(reviewKpi!.direction).toBe("neutral");

        // Verify fallback glossary
        expect(fallbackProfile.glossary[0].term).toBe("Generic Business Context");
        expect(fallbackProfile.glossary[0].definition).toContain("Needs source register verification");
    });
});

describe("businessContextProfile — generateDefaults and applyAuthorOverrides", () => {
    it("projects defaults correctly using generateDefaults()", () => {
        const profile = buildBusinessContextProfile("saas-product", "finance-saas");
        const projected = generateDefaults(profile);

        expect(projected.retrievalPolicy).toEqual(profile.retrievalPolicy);
        expect(projected.insightTemplates).toHaveLength(profile.insightTemplates.length);
        expect(projected.starterQuestions).toHaveLength(profile.starterQuestions.length);
        expect(projected.guidedFilters).toHaveLength(profile.guidedFilters.length);
        expect(projected.kpiBehaviors).toHaveLength(profile.kpis.length);

        const nrrKpi = projected.kpiBehaviors.find(k => k.id === "nrr");
        expect(nrrKpi).toBeDefined();
        expect(nrrKpi!.direction).toBe("higher-is-better");
        expect(nrrKpi!.thresholds).toBeDefined();
    });

    it("applyAuthorOverrides() updates specific KPIs, templates, questions, and filters but maintains the remaining profile properties untouched", () => {
        const profile = buildBusinessContextProfile("cpg-fmcg", "supply-chain");

        // Let's override the OTIF threshold, add templates, change citation mode
        const overrides = {
            kpis: [
                {
                    id: "otif",
                    label: "Overridden OTIF %",
                    thresholds: [
                        { tone: "good" as const, expression: ">= 98" }
                    ]
                }
            ],
            retrievalPolicy: {
                citationMode: "off" as const,
                freshnessExpectation: "Hourly refresh"
            }
        };

        const overriddenProfile = applyAuthorOverrides(profile, overrides);

        // Assert non-mutative nature (original profile is NOT modified)
        const origOtifKpi = profile.kpis.find(k => k.id === "otif");
        expect(origOtifKpi!.label).toBe("OTIF %");
        expect(origOtifKpi!.thresholds![0].expression).toBe(">= 95");
        expect(profile.retrievalPolicy.citationMode).toBe("required");
        expect(profile.confidence).toBe("sme-reviewed");

        // Assert overridden profile updates
        expect(overriddenProfile.confidence).toBe("author-confirmed");
        const newOtifKpi = overriddenProfile.kpis.find(k => k.id === "otif");
        expect(newOtifKpi!.label).toBe("Overridden OTIF %");
        expect(newOtifKpi!.thresholds![0].expression).toBe(">= 98");
        expect(overriddenProfile.retrievalPolicy.citationMode).toBe("off");
        expect(overriddenProfile.retrievalPolicy.freshnessExpectation).toBe("Hourly refresh");

        // Ensure remaining properties are untouched
        expect(overriddenProfile.id).toBe(profile.id);
        expect(overriddenProfile.displayName).toBe(profile.displayName);
        expect(overriddenProfile.glossary).toEqual(profile.glossary);
        expect(overriddenProfile.starterQuestions).toEqual(profile.starterQuestions);
        expect(overriddenProfile.guidedFilters).toEqual(profile.guidedFilters);
    });
});
