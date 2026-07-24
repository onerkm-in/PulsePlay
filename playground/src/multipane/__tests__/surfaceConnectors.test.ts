// playground/src/multipane/__tests__/surfaceConnectors.test.ts
//
// PulsePlay ships single-active-per-axis: every surface inherits the ONE shared
// connector, so getSurfaceProfile always returns null. (The per-surface-override
// feature was removed with the multi-pane demo — 2026-07-24.)

import { describe, it, expect } from "vitest";
import { getSurfaceProfile } from "../surfaceConnectors";

describe("surfaceConnectors — single shared connector (no per-surface override)", () => {
    it("getSurfaceProfile returns null for every surface (inherit the shared connector)", () => {
        expect(getSurfaceProfile("ai-insights")).toBeNull();
        expect(getSurfaceProfile("ask-pulse")).toBeNull();
        expect(getSurfaceProfile("bi-viz")).toBeNull();
    });
});
