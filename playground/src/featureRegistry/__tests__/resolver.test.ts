// playground/src/featureRegistry/__tests__/resolver.test.ts
//
// Lock every branch of resolveDefaultSurface. The resolver is the
// load-bearing replacement for the hardcoded DEFAULT_UI_MODE return
// path; flaws here flicker the cold-boot surface.

import { describe, expect, it } from "vitest";
import { resolveDefaultSurface, featureSupportsSurface } from "../resolver";
import { DEFAULT_UI_MODE } from "../../settings/settingsStore";

const allTabsVisible = { aiInsights: true, askPulse: true, dashboard: true };

describe("resolveDefaultSurface — Step 1: explicit override always wins (Q2 sign-off)", () => {
    it("returns 'pulse' when explicitUiMode is 'pulse', regardless of tab visibility", () => {
        const result = resolveDefaultSurface({
            explicitUiMode: "pulse",
            requiredFeatures: [],
            tabVisibility: { aiInsights: false, askPulse: false, dashboard: true },
        });
        expect(result).toBe("pulse");
    });

    it("returns 'v0' when explicitUiMode is 'v0', regardless of tab visibility", () => {
        const result = resolveDefaultSurface({
            explicitUiMode: "v0",
            requiredFeatures: [],
            tabVisibility: { aiInsights: true, askPulse: false, dashboard: false },
        });
        expect(result).toBe("v0");
    });

    it("explicit override beats required-feature narrowing too", () => {
        // executive-briefing only supports pulse — but explicit 'v0' wins anyway
        const result = resolveDefaultSurface({
            explicitUiMode: "v0",
            requiredFeatures: ["executive-briefing"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe("v0");
    });
});

describe("resolveDefaultSurface — Step 2: required-feature intersection", () => {
    it("returns DEFAULT_UI_MODE when no narrowing inputs fire", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe(DEFAULT_UI_MODE); // single source of truth in settingsStore
    });

    it("narrows to 'pulse' when a pulse-exclusive feature is required", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: ["executive-briefing"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe("pulse");
    });

    it("narrows to 'dashboard' when bi-iframe-canvas is required", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: ["bi-iframe-canvas"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe("dashboard");
    });

    it("intersection of two compatible features keeps the preferredSurface", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: ["chat-composer", "trust-badge"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe("v0"); // both support pulse+v0, preferredSurface is v0
    });

    it("skips unknown feature ids without crashing", () => {
        const result = resolveDefaultSurface({
            // @ts-expect-error — intentionally pass an unknown FeatureId
            requiredFeatures: ["does-not-exist"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe(DEFAULT_UI_MODE); // unknown skipped → falls through to the default
    });
});

describe("resolveDefaultSurface — Step 3: tabVisibility narrowing", () => {
    it("forces 'dashboard' when only the Dashboard tab is visible", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: { aiInsights: false, askPulse: false, dashboard: true },
        });
        expect(result).toBe("dashboard");
    });

    it("forces 'pulse' when only the AI Insights tab is visible", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: { aiInsights: true, askPulse: false, dashboard: false },
        });
        expect(result).toBe("pulse");
    });

    it("forces 'v0' when only the Ask Pulse tab is visible", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: { aiInsights: false, askPulse: true, dashboard: false },
        });
        expect(result).toBe("v0");
    });

    it("falls back to DEFAULT_UI_MODE when 2+ tabs visible and no required features", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: { aiInsights: true, askPulse: true, dashboard: false },
        });
        expect(result).toBe(DEFAULT_UI_MODE);
    });
});

describe("resolveDefaultSurface — Step 4: preferredSurface bias", () => {
    it("biases toward the first required feature's preferredSurface when multiple candidates remain", () => {
        // sectioned-chat has surfaces=[pulse,v0] preferred=v0. With all tabs
        // visible, the preferredSurface step won't fire (DEFAULT_UI_MODE
        // wins at Step 5 because it's in the candidate list). Force the
        // bias case by hiding v0's tab AND keeping pulse visible.
        const result = resolveDefaultSurface({
            requiredFeatures: ["sectioned-chat"],
            tabVisibility: { aiInsights: true, askPulse: false, dashboard: false },
        });
        expect(result).toBe("pulse");
    });
});

describe("resolveDefaultSurface — Step 5: fallback chain", () => {
    it("returns DEFAULT_UI_MODE when it's still a candidate", () => {
        const result = resolveDefaultSurface({
            requiredFeatures: [],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe(DEFAULT_UI_MODE);
    });

    it("returns the first remaining candidate when DEFAULT_UI_MODE is filtered out", () => {
        // Require a pulse-only feature so v0 is eliminated; result must be pulse.
        const result = resolveDefaultSurface({
            requiredFeatures: ["executive-briefing"],
            tabVisibility: allTabsVisible,
        });
        expect(result).toBe("pulse");
    });
});

describe("featureSupportsSurface", () => {
    it("returns true for a feature that lists the surface in its descriptor", () => {
        expect(featureSupportsSurface("chat-composer", "v0")).toBe(true);
        expect(featureSupportsSurface("chat-composer", "pulse")).toBe(true);
    });

    it("returns false for a feature that doesn't list the surface", () => {
        expect(featureSupportsSurface("executive-briefing", "v0")).toBe(false);
        expect(featureSupportsSurface("bi-iframe-canvas", "v0")).toBe(false);
    });

    it("returns false for unknown feature ids (conservative — avoid silent overclaim)", () => {
        // @ts-expect-error — intentionally pass unknown id
        expect(featureSupportsSurface("does-not-exist", "v0")).toBe(false);
    });
});
