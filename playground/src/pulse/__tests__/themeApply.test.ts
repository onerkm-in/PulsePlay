import { describe, it, expect } from "vitest";
import {
    resolveThemeTokens,
    buildAppThemeVars,
    BUILT_IN_THEMES,
} from "../themeConfig";

describe("resolveThemeTokens", () => {
    it("returns the preset unchanged for a non-custom theme (brand colors ignored)", () => {
        const t = resolveThemeTokens({
            themeName: "corporate-blue",
            // brand colors are stored even when the theme isn't custom — they
            // must NOT override the preset, or every preset collapses onto them.
            brandAccentColor: "#ff00ff",
            brandBgColor: "#000000",
        });
        expect(t.accent).toBe(BUILT_IN_THEMES["corporate-blue"].accent);
        expect(t.bg).toBe(BUILT_IN_THEMES["corporate-blue"].bg);
    });

    it("applies brand overrides only under the custom theme", () => {
        const t = resolveThemeTokens({
            themeName: "custom",
            brandAccentColor: "#7c3aed",
            brandTextColor: "#101010",
            brandBgColor: "#fafafa",
        });
        expect(t.accent).toBe("#7c3aed");
        expect(t.text).toBe("#101010");
        expect(t.bg).toBe("#fafafa");
    });

    it("falls back to default for an unknown theme name", () => {
        const t = resolveThemeTokens({ themeName: "nope" });
        expect(t.accent).toBe(BUILT_IN_THEMES["default"].accent);
    });
});

describe("buildAppThemeVars", () => {
    it("light mode writes both --gn-* and --pp-* surfaces + accent", () => {
        const vars = buildAppThemeVars(BUILT_IN_THEMES["forest"], { dark: false });
        expect(vars["--gn-accent"]).toBe(BUILT_IN_THEMES["forest"].accent);
        expect(vars["--pp-accent"]).toBe(BUILT_IN_THEMES["forest"].accent);
        expect(vars["--gn-bg"]).toBe(BUILT_IN_THEMES["forest"].bg);
        expect(vars["--pp-bg"]).toBe(BUILT_IN_THEMES["forest"].bg);
        // derived native accent variants
        expect(vars["--pp-accent-soft"]).toMatch(/^rgba\(/);
        expect(vars["--pp-accent-hover"]).toMatch(/^#/);
    });

    it("dark mode writes ONLY accent-family vars (surfaces left to dark CSS)", () => {
        const vars = buildAppThemeVars(BUILT_IN_THEMES["corporate-blue"], { dark: true });
        expect(vars["--gn-accent"]).toBe(BUILT_IN_THEMES["corporate-blue"].accent);
        expect(vars["--pp-accent"]).toBe(BUILT_IN_THEMES["corporate-blue"].accent);
        expect(vars["--pp-bg"]).toBeUndefined();
        expect(vars["--gn-bg"]).toBeUndefined();
        expect(vars["--gn-text"]).toBeUndefined();
    });
});
