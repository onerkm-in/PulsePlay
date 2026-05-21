// playground/src/surfaces/__tests__/surfaceAvailability.test.ts
//
// Unit coverage for the F5.1 pure resolver. Every test asserts both
// the effective surface AND the fallback reason because the reason is
// part of the public contract — host UI uses it for help text + telemetry.

import { describe, expect, it } from "vitest";
import {
    computeSurfaceAvailability,
    resolveSurfaceAvailability,
    type EnabledComponentsInput,
    type EnabledFeaturesInput,
} from "../surfaceAvailability";

// ─── Availability map ─────────────────────────────────────────────────────

describe("computeSurfaceAvailability", () => {
    const matrix: ReadonlyArray<{
        components: EnabledComponentsInput;
        features: EnabledFeaturesInput;
        expected: { "ai-insights": boolean; "ask-pulse": boolean; "bi-viz": boolean };
    }> = [
        // mix mode (T1 Balanced) — all available
        { components: "mix",  features: "both",          expected: { "ai-insights": true,  "ask-pulse": true,  "bi-viz": true  } },
        { components: "mix",  features: "insightsOnly",  expected: { "ai-insights": true,  "ask-pulse": false, "bi-viz": true  } },
        { components: "mix",  features: "chatOnly",      expected: { "ai-insights": false, "ask-pulse": true,  "bi-viz": true  } },
        // both mode (T6 Split + Mix) — same availability as mix
        { components: "both", features: "both",          expected: { "ai-insights": true,  "ask-pulse": true,  "bi-viz": true  } },
        { components: "both", features: "insightsOnly",  expected: { "ai-insights": true,  "ask-pulse": false, "bi-viz": true  } },
        { components: "both", features: "chatOnly",      expected: { "ai-insights": false, "ask-pulse": true,  "bi-viz": true  } },
        // aiOnly (T4/T5) — bi-viz disabled
        { components: "aiOnly", features: "both",         expected: { "ai-insights": true,  "ask-pulse": true,  "bi-viz": false } },
        { components: "aiOnly", features: "insightsOnly", expected: { "ai-insights": true,  "ask-pulse": false, "bi-viz": false } },
        { components: "aiOnly", features: "chatOnly",     expected: { "ai-insights": false, "ask-pulse": true,  "bi-viz": false } },
        // biOnly (T3) — both AI surfaces disabled regardless of features
        { components: "biOnly", features: "both",         expected: { "ai-insights": false, "ask-pulse": false, "bi-viz": true  } },
        { components: "biOnly", features: "insightsOnly", expected: { "ai-insights": false, "ask-pulse": false, "bi-viz": true  } },
        { components: "biOnly", features: "chatOnly",     expected: { "ai-insights": false, "ask-pulse": false, "bi-viz": true  } },
    ];

    for (const row of matrix) {
        it(`enabledComponents=${row.components} + enabledFeatures=${row.features}`, () => {
            const result = computeSurfaceAvailability(row.components, row.features);
            expect(result).toEqual(row.expected);
        });
    }

    it("never returns all-false for any valid input combination", () => {
        for (const row of matrix) {
            const any = row.expected["ai-insights"] || row.expected["ask-pulse"] || row.expected["bi-viz"];
            expect(any).toBe(true);
        }
    });
});

// ─── Resolver happy paths (requested = effective) ─────────────────────────

describe("resolveSurfaceAvailability — happy paths", () => {
    it("returns the requested surface unchanged when fully available", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ai-insights",
            enabledComponents: "mix",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("ai-insights");
        expect(r.requestedSurfaceId).toBe("ai-insights");
        expect(r.fallbackReason).toBeNull();
    });

    it("returns bi-viz unchanged in T6 (both mode)", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "bi-viz",
            enabledComponents: "both",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("bi-viz");
        expect(r.fallbackReason).toBeNull();
    });

    it("returns ask-pulse unchanged when chatOnly + requested ask-pulse", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ask-pulse",
            enabledComponents: "mix",
            enabledFeatures: "chatOnly",
        });
        expect(r.effectiveSurfaceId).toBe("ask-pulse");
        expect(r.fallbackReason).toBeNull();
    });
});

// ─── Resolver fallback paths (specified in the F5.1 spec) ─────────────────

describe("resolveSurfaceAvailability — spec fallback scenarios", () => {
    it("T5 chatOnly + requested ai-insights resolves to ask-pulse", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ai-insights",
            enabledComponents: "aiOnly",     // T5 enabledComponents
            enabledFeatures: "chatOnly",     // T5 enabledFeatures
        });
        expect(r.effectiveSurfaceId).toBe("ask-pulse");
        expect(r.requestedSurfaceId).toBe("ai-insights"); // intent preserved
        expect(r.fallbackReason).toBe("insights-disabled-by-chatOnly");
        expect(r.availability["ai-insights"]).toBe(false);
        expect(r.availability["ask-pulse"]).toBe(true);
        expect(r.availability["bi-viz"]).toBe(false);
    });

    it("T4 insightsOnly + requested ask-pulse resolves to ai-insights", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ask-pulse",
            enabledComponents: "aiOnly",         // T4 enabledComponents
            enabledFeatures: "insightsOnly",     // T4 enabledFeatures
        });
        expect(r.effectiveSurfaceId).toBe("ai-insights");
        expect(r.requestedSurfaceId).toBe("ask-pulse");
        expect(r.fallbackReason).toBe("chat-disabled-by-insightsOnly");
    });

    it("biOnly + requested ask-pulse resolves to bi-viz", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ask-pulse",
            enabledComponents: "biOnly",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("bi-viz");
        expect(r.requestedSurfaceId).toBe("ask-pulse");
        expect(r.fallbackReason).toBe("ai-pane-disabled-by-biOnly");
    });

    it("biOnly + requested ai-insights resolves to bi-viz with same reason", () => {
        // Symmetric with the ask-pulse case — pane-level disable wins.
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ai-insights",
            enabledComponents: "biOnly",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("bi-viz");
        expect(r.fallbackReason).toBe("ai-pane-disabled-by-biOnly");
    });

    it("aiOnly + requested bi-viz resolves to a valid AI surface", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "bi-viz",
            enabledComponents: "aiOnly",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("ai-insights"); // first-available preference
        expect(r.fallbackReason).toBe("bi-pane-disabled-by-aiOnly");
    });

    it("aiOnly + chatOnly + requested bi-viz resolves to ask-pulse (only AI surface left)", () => {
        // Combined constraint: BI off (aiOnly) AND insights off (chatOnly).
        // Only ask-pulse survives.
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "bi-viz",
            enabledComponents: "aiOnly",
            enabledFeatures: "chatOnly",
        });
        expect(r.effectiveSurfaceId).toBe("ask-pulse");
        expect(r.fallbackReason).toBe("bi-pane-disabled-by-aiOnly");
    });
});

// ─── Restore semantics (the load-bearing reason this module exists) ──────

describe("resolveSurfaceAvailability — restore semantics", () => {
    it("re-enabling 'both' restores the requested surface if it is now available", () => {
        // Scenario: user originally requested ai-insights, deployment was
        // chatOnly (forced ask-pulse), then admin flips features back to
        // "both". The host kept requestedSurfaceId="ai-insights" intact;
        // calling the resolver now must return ai-insights as effective.
        const constrained = resolveSurfaceAvailability({
            requestedSurfaceId: "ai-insights",
            enabledComponents: "mix",
            enabledFeatures: "chatOnly",
        });
        expect(constrained.effectiveSurfaceId).toBe("ask-pulse");
        expect(constrained.requestedSurfaceId).toBe("ai-insights");

        const restored = resolveSurfaceAvailability({
            requestedSurfaceId: constrained.requestedSurfaceId, // preserved intent
            enabledComponents: "mix",
            enabledFeatures: "both",
        });
        expect(restored.effectiveSurfaceId).toBe("ai-insights");
        expect(restored.fallbackReason).toBeNull();
    });

    it("flipping aiOnly → both restores requested bi-viz", () => {
        const constrained = resolveSurfaceAvailability({
            requestedSurfaceId: "bi-viz",
            enabledComponents: "aiOnly",
            enabledFeatures: "both",
        });
        expect(constrained.effectiveSurfaceId).toBe("ai-insights");

        const restored = resolveSurfaceAvailability({
            requestedSurfaceId: constrained.requestedSurfaceId,
            enabledComponents: "both",
            enabledFeatures: "both",
        });
        expect(restored.effectiveSurfaceId).toBe("bi-viz");
        expect(restored.fallbackReason).toBeNull();
    });

    it("requested intent is never mutated by the resolver", () => {
        // The resolver is pure; identity of the returned requestedSurfaceId
        // is the same as input. Important for the host: it can write
        // requestedSurfaceId to localStorage and trust the resolver never
        // silently overwrites it with effective.
        const inputs: ReadonlyArray<{
            requestedSurfaceId: "ai-insights" | "ask-pulse" | "bi-viz";
            components: EnabledComponentsInput;
            features: EnabledFeaturesInput;
        }> = [
            { requestedSurfaceId: "ai-insights", components: "biOnly", features: "both" },
            { requestedSurfaceId: "ask-pulse",   components: "aiOnly", features: "insightsOnly" },
            { requestedSurfaceId: "bi-viz",      components: "aiOnly", features: "chatOnly" },
        ];
        for (const i of inputs) {
            const r = resolveSurfaceAvailability({
                requestedSurfaceId: i.requestedSurfaceId,
                enabledComponents: i.components,
                enabledFeatures: i.features,
            });
            expect(r.requestedSurfaceId).toBe(i.requestedSurfaceId);
        }
    });
});

// ─── ?surface= URL semantics (locked at the resolver level) ──────────────

describe("resolveSurfaceAvailability — URL ?surface= as REQUESTED intent", () => {
    it("treats ?surface= as a request, not a guarantee", () => {
        // The spec lock: URL is the source of truth for INTENT. If the
        // deployment disables that surface, the resolver falls back —
        // but the request is preserved so future config changes can
        // restore the user's intended surface.
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ai-insights",   // came in via ?surface=ai-insights
            enabledComponents: "biOnly",         // deployment has AI pane off
            enabledFeatures: "both",
        });
        expect(r.requestedSurfaceId).toBe("ai-insights");
        expect(r.effectiveSurfaceId).toBe("bi-viz");
        expect(r.fallbackReason).toBe("ai-pane-disabled-by-biOnly");
    });

    it("URL request to an available surface is honored exactly", () => {
        const r = resolveSurfaceAvailability({
            requestedSurfaceId: "ask-pulse",
            enabledComponents: "mix",
            enabledFeatures: "both",
        });
        expect(r.effectiveSurfaceId).toBe("ask-pulse");
        expect(r.fallbackReason).toBeNull();
    });
});
