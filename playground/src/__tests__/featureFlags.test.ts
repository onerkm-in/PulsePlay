// playground/src/__tests__/featureFlags.test.ts
//
// Part C P0 — the multiConnectorPanes flag must DEFAULT OFF and be a clean
// persisted bag (load / set / reset / normalize). The default-off guarantee is
// what keeps the single-pane app unchanged.

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
    it("multiConnectorPanes defaults to false with no stored value", () => {
        expect(DEFAULT_FEATURE_FLAGS.multiConnectorPanes).toBe(false);
        expect(loadFeatureFlags().multiConnectorPanes).toBe(false);
        expect(isFeatureEnabled("multiConnectorPanes")).toBe(false);
    });

    it("returns defaults when storage holds malformed JSON (never throws)", () => {
        window.localStorage.setItem(FEATURE_FLAGS_KEY, "{not valid json");
        expect(loadFeatureFlags().multiConnectorPanes).toBe(false);
    });

    it("normalizeFeatureFlags coerces junk + missing fields to false", () => {
        expect(normalizeFeatureFlags(null).multiConnectorPanes).toBe(false);
        expect(normalizeFeatureFlags({}).multiConnectorPanes).toBe(false);
        expect(normalizeFeatureFlags({ multiConnectorPanes: "yes" }).multiConnectorPanes).toBe(false);
        expect(normalizeFeatureFlags({ multiConnectorPanes: 1 }).multiConnectorPanes).toBe(false);
        expect(normalizeFeatureFlags({ multiConnectorPanes: true }).multiConnectorPanes).toBe(true);
    });
});

describe("featureFlags — set / reset", () => {
    it("setFeatureFlag persists and reads back", () => {
        setFeatureFlag("multiConnectorPanes", true);
        expect(isFeatureEnabled("multiConnectorPanes")).toBe(true);
        expect(loadFeatureFlags().multiConnectorPanes).toBe(true);
    });

    it("resetFeatureFlags clears back to the all-false default", () => {
        setFeatureFlag("multiConnectorPanes", true);
        expect(isFeatureEnabled("multiConnectorPanes")).toBe(true);
        resetFeatureFlags();
        expect(isFeatureEnabled("multiConnectorPanes")).toBe(false);
        expect(window.localStorage.getItem(FEATURE_FLAGS_KEY)).toBeNull();
    });

    it("setFeatureFlag broadcasts the change event", () => {
        let fired = false;
        const handler = () => { fired = true; };
        window.addEventListener("pulseplay:feature-flags-change", handler);
        setFeatureFlag("multiConnectorPanes", true);
        window.removeEventListener("pulseplay:feature-flags-change", handler);
        expect(fired).toBe(true);
    });
});
