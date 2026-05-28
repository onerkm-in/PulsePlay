// playground/src/settings/__tests__/workbenchTemplates.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    WORKBENCH_TEMPLATES,
    getWorkbenchTemplate,
    detectActiveWorkbenchTemplate,
    applyWorkbenchTemplate,
} from "../workbenchTemplates";
import { CUSTOM_SECTION_PRESETS } from "../../pulse/insightsPresetLibrary";

describe("workbenchTemplates — catalog", () => {
    it("defines exactly 5 templates with unique ids", () => {
        expect(WORKBENCH_TEMPLATES).toHaveLength(5);
        const ids = WORKBENCH_TEMPLATES.map(t => t.id);
        expect(new Set(ids).size).toBe(5);
    });

    it("every bundled sectionPresetId resolves against CUSTOM_SECTION_PRESETS", () => {
        for (const t of WORKBENCH_TEMPLATES) {
            if (!t.sectionPresetId) continue;
            const found = CUSTOM_SECTION_PRESETS.some(p => p.id === t.sectionPresetId);
            expect(found, `template ${t.id} references missing preset ${t.sectionPresetId}`).toBe(true);
        }
    });

    it("every template keeps at least one tab enabled", () => {
        for (const t of WORKBENCH_TEMPLATES) {
            const count = (t.tabVisibility.aiInsights ? 1 : 0)
                + (t.tabVisibility.askPulse ? 1 : 0)
                + (t.tabVisibility.dashboard ? 1 : 0);
            expect(count, `template ${t.id} has no enabled tabs`).toBeGreaterThan(0);
        }
    });

    it("every template's defaultLanding points at an enabled tab", () => {
        const landingToTab = {
            "ai-insights": "aiInsights",
            "ask-pulse": "askPulse",
            "bi-viz": "dashboard",
        } as const;
        for (const t of WORKBENCH_TEMPLATES) {
            const tabKey = landingToTab[t.defaultLanding];
            expect(t.tabVisibility[tabKey], `template ${t.id} lands on a disabled tab`).toBe(true);
        }
    });
});

describe("detectActiveWorkbenchTemplate", () => {
    it("matches Balanced for the all-tabs / ai-insights / both config", () => {
        expect(detectActiveWorkbenchTemplate({
            tabVisibility: { aiInsights: true, askPulse: true, dashboard: true },
            defaultLanding: "ai-insights",
            enabledFeatures: "both",
        })).toBe("balanced");
    });

    it("treats a null landing as ai-insights (fresh install reads as Balanced)", () => {
        expect(detectActiveWorkbenchTemplate({
            tabVisibility: { aiInsights: true, askPulse: true, dashboard: true },
            defaultLanding: null,
            enabledFeatures: "both",
        })).toBe("balanced");
    });

    it("matches Ask-first for the chat-only single-tab config", () => {
        expect(detectActiveWorkbenchTemplate({
            tabVisibility: { aiInsights: false, askPulse: true, dashboard: false },
            defaultLanding: "ask-pulse",
            enabledFeatures: "chatOnly",
        })).toBe("ask-first");
    });

    it("returns custom when nothing matches", () => {
        expect(detectActiveWorkbenchTemplate({
            tabVisibility: { aiInsights: true, askPulse: false, dashboard: false },
            defaultLanding: "ai-insights",
            enabledFeatures: "both",
        })).toBe("custom");
    });
});

describe("applyWorkbenchTemplate", () => {
    beforeEach(() => {
        try { window.localStorage.clear(); } catch { /* ignore */ }
    });

    it("writes tab visibility + default landing via the passed setters", () => {
        const setTabVisibility = vi.fn();
        const setDefaultLandingSurface = vi.fn();
        const exec = getWorkbenchTemplate("exec-briefing")!;
        applyWorkbenchTemplate(exec, { setTabVisibility, setDefaultLandingSurface });
        expect(setTabVisibility).toHaveBeenCalledWith(exec.tabVisibility);
        expect(setDefaultLandingSurface).toHaveBeenCalledWith("ai-insights");
    });

    it("persists enabledFeatures + a section preset to the genieSettings bridge", () => {
        const exec = getWorkbenchTemplate("exec-briefing")!;
        applyWorkbenchTemplate(exec, { setTabVisibility: vi.fn(), setDefaultLandingSurface: vi.fn() });
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.enabledFeatures).toBe("insightsOnly");
        // exec-briefing bundles a section preset → custom sections written.
        expect(typeof parsed.insightsCustomSections).toBe("string");
        expect(parsed.insightsCustomSections.length).toBeGreaterThan(0);
    });

    it("does not write custom sections for a template with no section preset", () => {
        const askFirst = getWorkbenchTemplate("ask-first")!;
        applyWorkbenchTemplate(askFirst, { setTabVisibility: vi.fn(), setDefaultLandingSurface: vi.fn() });
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        const parsed = JSON.parse(raw!);
        expect(parsed.enabledFeatures).toBe("chatOnly");
        expect(parsed.insightsCustomSections).toBeUndefined();
    });
});
