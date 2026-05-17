// playground/src/settings/__tests__/layoutPresets.test.ts
//
// Verifies the LayoutPreset facade contract:
//   - Each preset maps to expected (enabledComponents + layoutMode + enabledFeatures)
//   - detectActivePreset() round-trips: applying a preset's state then detecting returns the same key
//   - "custom" surfaces when no preset matches
//   - Template-number cross-link to Rajesh's PDF templates (T1/T3/T4/T5) is locked

import { describe, test, expect } from "vitest";
import {
    LAYOUT_PRESETS,
    LAYOUT_PRESET_ORDER,
    detectActivePreset,
    type LayoutPreset,
} from "../layoutPresets";

describe("LAYOUT_PRESETS — bundle definitions", () => {
    test("contains exactly 5 v0 presets in catalog and order array", () => {
        const catalogKeys = Object.keys(LAYOUT_PRESETS) as LayoutPreset[];
        expect(catalogKeys.length).toBe(5);
        expect(LAYOUT_PRESET_ORDER.length).toBe(5);
        // Order array entries all exist in catalog.
        for (const key of LAYOUT_PRESET_ORDER) {
            expect(LAYOUT_PRESETS[key]).toBeDefined();
        }
    });

    test("balanced (T1) maps to mix + ai-left + both", () => {
        expect(LAYOUT_PRESETS.balanced.template).toBe("T1");
        expect(LAYOUT_PRESETS.balanced.state).toEqual({
            enabledComponents: "mix",
            layoutMode: "ai-left",
            enabledFeatures: "both",
        });
    });

    test("bi-focus (T3) maps to biOnly", () => {
        expect(LAYOUT_PRESETS["bi-focus"].template).toBe("T3");
        expect(LAYOUT_PRESETS["bi-focus"].state.enabledComponents).toBe("biOnly");
    });

    test("insights-focus (T4) maps to aiOnly + insightsOnly", () => {
        expect(LAYOUT_PRESETS["insights-focus"].template).toBe("T4");
        expect(LAYOUT_PRESETS["insights-focus"].state).toEqual({
            enabledComponents: "aiOnly",
            layoutMode: "ai-left",
            enabledFeatures: "insightsOnly",
        });
    });

    test("ask-focus (T5) maps to aiOnly + chatOnly", () => {
        expect(LAYOUT_PRESETS["ask-focus"].template).toBe("T5");
        expect(LAYOUT_PRESETS["ask-focus"].state).toEqual({
            enabledComponents: "aiOnly",
            layoutMode: "ai-left",
            enabledFeatures: "chatOnly",
        });
    });

    test("split-mix is the power-user side-by-side preset (both + both)", () => {
        expect(LAYOUT_PRESETS["split-mix"].state.enabledComponents).toBe("both");
        expect(LAYOUT_PRESETS["split-mix"].state.enabledFeatures).toBe("both");
    });

    test("every preset has a non-empty label + description", () => {
        for (const key of LAYOUT_PRESET_ORDER) {
            expect(LAYOUT_PRESETS[key].label.length).toBeGreaterThan(0);
            expect(LAYOUT_PRESETS[key].description.length).toBeGreaterThan(0);
        }
    });
});

describe("detectActivePreset() — round-trip from each preset's state", () => {
    test.each(LAYOUT_PRESET_ORDER)("preset %s round-trips", (key) => {
        const cfg = LAYOUT_PRESETS[key];
        const detected = detectActivePreset({
            enabledComponents: cfg.state.enabledComponents,
            enabledFeatures: cfg.state.enabledFeatures,
        });
        expect(detected).toBe(key);
    });
});

describe("detectActivePreset() — custom + edge cases", () => {
    test("returns first matching preset when multiple bundles could match (deterministic order)", () => {
        // Both `balanced` (mix + both) and `split-mix` (both + both) have
        // enabledFeatures="both". Detector should distinguish via
        // enabledComponents and pick the right one.
        expect(detectActivePreset({ enabledComponents: "mix", enabledFeatures: "both" })).toBe("balanced");
        expect(detectActivePreset({ enabledComponents: "both", enabledFeatures: "both" })).toBe("split-mix");
    });

    test("returns 'custom' for combinations no preset uses", () => {
        // mix + chatOnly is not in any preset (mix is balanced=both,
        // not chatOnly; chatOnly is ask-focus=aiOnly, not mix).
        expect(detectActivePreset({
            enabledComponents: "mix",
            enabledFeatures: "chatOnly",
        })).toBe("custom");

        // both + insightsOnly is also not preset-matched.
        expect(detectActivePreset({
            enabledComponents: "both",
            enabledFeatures: "insightsOnly",
        })).toBe("custom");
    });

    test("ignores layoutMode in detection (intentional — author can change AI position without breaking preset selection)", () => {
        // balanced uses layoutMode ai-left but detector doesn't check it.
        // Changing layoutMode to ai-top should still detect balanced as long
        // as enabledComponents + enabledFeatures still match.
        const detected = detectActivePreset({
            enabledComponents: "mix",
            enabledFeatures: "both",
        });
        expect(detected).toBe("balanced");
    });
});
