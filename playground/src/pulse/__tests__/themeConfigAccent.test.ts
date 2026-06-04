import { describe, it, expect } from "vitest";
import { buildAppThemeVars, resolveThemeTokens } from "../themeConfig";

// A3 — in dark mode, a built-in preset's LIGHT-tuned accent (#2563eb for
// default) was written inline and overrode the [data-pp-theme=dark] stylesheet's
// dark-canonical #4b9cf5, leaving low-contrast accent text/links. The resolver
// now emits the dark accent for built-in presets while a CUSTOM brand accent
// (the user's explicit choice) still wins.
describe("buildAppThemeVars — dark accent (A3)", () => {
    const defaultTokens = resolveThemeTokens({ themeName: "default" });

    it("uses the dark-canonical accent (#4b9cf5) for a built-in preset in dark mode", () => {
        const vars = buildAppThemeVars(defaultTokens, { dark: true });
        expect(vars["--pp-accent"]).toBe("#4b9cf5");
        expect(vars["--gn-accent"]).toBe("#4b9cf5");
        // derived family tracks the dark accent, not the light preset value
        expect(vars["--pp-accent-soft"]).toContain("75, 156, 245");
    });

    it("keeps the preset's own accent in LIGHT mode (no regression)", () => {
        const vars = buildAppThemeVars(defaultTokens, { dark: false });
        expect(vars["--pp-accent"]).toBe("#2563eb");
    });

    it("preserves a CUSTOM brand accent even in dark mode (user's explicit choice wins)", () => {
        const customTokens = resolveThemeTokens({ themeName: "custom", brandAccentColor: "#ff8800" });
        const vars = buildAppThemeVars(customTokens, { dark: true, customAccent: true });
        expect(vars["--pp-accent"]).toBe("#ff8800");
        expect(vars["--gn-accent"]).toBe("#ff8800");
    });
});
