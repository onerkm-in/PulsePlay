// playground/src/__tests__/featureFlags.test.ts
//
// The feature-flags bag must DEFAULT OFF and be a clean persisted store
// (load / set / reset / normalize). `dashboardAutoSeed` is the sole flag since
// `multiConnectorPanes` was removed with the multi-pane demo (2026-07-24).

import { describe, it, expect, beforeEach } from "vitest";
import {
    DEFAULT_FEATURE_FLAGS,
    FEATURE_FLAGS_KEY,
    loadFeatureFlags,
    isFeatureEnabled,
    setFeatureFlag,
    resetFeatureFlags,
    normalizeFeatureFlags,
} from "../featureFlags";

beforeEach(() => {
    window.localStorage.clear();
});

describe("featureFlags — default OFF", () => {
    it("dashboardAutoSeed defaults to false with no stored value", () => {
        expect(DEFAULT_FEATURE_FLAGS.dashboardAutoSeed).toBe(false);
        expect(loadFeatureFlags().dashboardAutoSeed).toBe(false);
        expect(isFeatureEnabled("dashboardAutoSeed")).toBe(false);
    });

    it("returns defaults when storage holds malformed JSON (never throws)", () => {
        window.localStorage.setItem(FEATURE_FLAGS_KEY, "{not valid json");
        expect(loadFeatureFlags().dashboardAutoSeed).toBe(false);
    });

    it("normalizeFeatureFlags coerces junk + missing fields to false", () => {
        expect(normalizeFeatureFlags(null).dashboardAutoSeed).toBe(false);
        expect(normalizeFeatureFlags({}).dashboardAutoSeed).toBe(false);
        expect(normalizeFeatureFlags({ dashboardAutoSeed: "yes" }).dashboardAutoSeed).toBe(false);
        expect(normalizeFeatureFlags({ dashboardAutoSeed: 1 }).dashboardAutoSeed).toBe(false);
        expect(normalizeFeatureFlags({ dashboardAutoSeed: true }).dashboardAutoSeed).toBe(true);
    });
});

describe("featureFlags — set / reset", () => {
    it("setFeatureFlag persists and reads back", () => {
        setFeatureFlag("dashboardAutoSeed", true);
        expect(isFeatureEnabled("dashboardAutoSeed")).toBe(true);
        expect(loadFeatureFlags().dashboardAutoSeed).toBe(true);
    });

    it("resetFeatureFlags clears back to the all-false default", () => {
        setFeatureFlag("dashboardAutoSeed", true);
        expect(isFeatureEnabled("dashboardAutoSeed")).toBe(true);
        resetFeatureFlags();
        expect(isFeatureEnabled("dashboardAutoSeed")).toBe(false);
        expect(window.localStorage.getItem(FEATURE_FLAGS_KEY)).toBeNull();
    });

    it("setFeatureFlag broadcasts the change event", () => {
        let fired = false;
        const handler = () => { fired = true; };
        window.addEventListener("pulseplay:feature-flags-change", handler);
        setFeatureFlag("dashboardAutoSeed", true);
        window.removeEventListener("pulseplay:feature-flags-change", handler);
        expect(fired).toBe(true);
    });
});
