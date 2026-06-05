// playground/src/multipane/__tests__/surfaceConnectors.test.ts
//
// Part C P2 — per-surface connector store. The load-bearing guarantees:
//   - flag OFF  → getSurfaceProfile() returns null for every surface (the
//     surfaces inherit the single shared connector; app unchanged)
//   - flag ON   → each surface resolves its own bound profile, independently
//   - set / reset persist + own the full key

import { describe, it, expect, beforeEach } from "vitest";
import { setFeatureFlag, resetFeatureFlags } from "../../featureFlags";
import {
    SURFACE_CONNECTORS_KEY,
    loadSurfaceConnectors,
    getSurfaceProfile,
    setSurfaceProfile,
    resetSurfaceConnectors,
} from "../surfaceConnectors";

beforeEach(() => {
    window.localStorage.clear();
    resetFeatureFlags();
    resetSurfaceConnectors();
});

describe("surfaceConnectors — gated on the flag (OFF = inherit shared)", () => {
    it("getSurfaceProfile returns null for every surface when the flag is OFF", () => {
        // Even with a binding written, the flag gate wins.
        setSurfaceProfile("ai-insights", "powerbi-dwd");
        setSurfaceProfile("ask-pulse", "default");
        expect(getSurfaceProfile("ai-insights")).toBeNull();
        expect(getSurfaceProfile("ask-pulse")).toBeNull();
        expect(loadSurfaceConnectors()).toEqual({});
    });

    it("resolves each surface's own profile INDEPENDENTLY when the flag is ON", () => {
        setFeatureFlag("multiConnectorPanes", true);
        setSurfaceProfile("ai-insights", "powerbi-dwd");
        setSurfaceProfile("ask-pulse", "default");
        // The whole point: AI Insights → Power BI, Ask Pulse → Genie, at once.
        expect(getSurfaceProfile("ai-insights")).toBe("powerbi-dwd");
        expect(getSurfaceProfile("ask-pulse")).toBe("default");
    });

    it("an unbound surface returns null even with the flag ON (inherits shared)", () => {
        setFeatureFlag("multiConnectorPanes", true);
        setSurfaceProfile("ai-insights", "powerbi-dwd");
        expect(getSurfaceProfile("ai-insights")).toBe("powerbi-dwd");
        expect(getSurfaceProfile("ask-pulse")).toBeNull();
    });
});

describe("surfaceConnectors — set / clear / reset", () => {
    it("setSurfaceProfile with an empty string clears that binding", () => {
        setFeatureFlag("multiConnectorPanes", true);
        setSurfaceProfile("ai-insights", "powerbi-dwd");
        expect(getSurfaceProfile("ai-insights")).toBe("powerbi-dwd");
        setSurfaceProfile("ai-insights", "");
        expect(getSurfaceProfile("ai-insights")).toBeNull();
    });

    it("resetSurfaceConnectors removes the whole key", () => {
        setFeatureFlag("multiConnectorPanes", true);
        setSurfaceProfile("ai-insights", "powerbi-dwd");
        setSurfaceProfile("ask-pulse", "default");
        resetSurfaceConnectors();
        expect(window.localStorage.getItem(SURFACE_CONNECTORS_KEY)).toBeNull();
        expect(getSurfaceProfile("ai-insights")).toBeNull();
        expect(getSurfaceProfile("ask-pulse")).toBeNull();
    });

    it("tolerates malformed stored JSON (never throws)", () => {
        setFeatureFlag("multiConnectorPanes", true);
        window.localStorage.setItem(SURFACE_CONNECTORS_KEY, "{broken");
        expect(getSurfaceProfile("ai-insights")).toBeNull();
        expect(loadSurfaceConnectors()).toEqual({});
    });

    it("setSurfaceProfile broadcasts the change event", () => {
        setFeatureFlag("multiConnectorPanes", true);
        let fired = false;
        const h = () => { fired = true; };
        window.addEventListener("pulseplay:surface-connectors-change", h);
        setSurfaceProfile("ask-pulse", "foundation");
        window.removeEventListener("pulseplay:surface-connectors-change", h);
        expect(fired).toBe(true);
    });
});
