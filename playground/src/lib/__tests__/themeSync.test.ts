import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { applyPpTheme, initThemeSync } from "../themeSync";

const KEY = "pulseplay:visual-settings:genieSettings";

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    delete document.documentElement.dataset.ppTheme;
});
afterEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
});

describe("themeSync", () => {
    it("applyPpTheme sets data-pp-theme=light when darkMode is off / absent", () => {
        applyPpTheme();
        expect(document.documentElement.dataset.ppTheme).toBe("light");
        localStorage.setItem(KEY, JSON.stringify({ assistantProfile: "x", darkMode: false }));
        applyPpTheme();
        expect(document.documentElement.dataset.ppTheme).toBe("light");
    });

    it("applyPpTheme sets data-pp-theme=dark when darkMode is on", () => {
        localStorage.setItem(KEY, JSON.stringify({ assistantProfile: "x", darkMode: true }));
        applyPpTheme();
        expect(document.documentElement.dataset.ppTheme).toBe("dark");
    });

    it("tolerates malformed genieSettings JSON (defaults to light)", () => {
        localStorage.setItem(KEY, "{not json");
        applyPpTheme();
        expect(document.documentElement.dataset.ppTheme).toBe("light");
    });

    it("initThemeSync re-applies on the visual-settings-change event", () => {
        initThemeSync();
        expect(document.documentElement.dataset.ppTheme).toBe("light");
        localStorage.setItem(KEY, JSON.stringify({ darkMode: true }));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
        expect(document.documentElement.dataset.ppTheme).toBe("dark");
    });
});
