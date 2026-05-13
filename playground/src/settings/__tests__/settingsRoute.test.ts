// playground/src/settings/__tests__/settingsRoute.test.ts
//
// Pure-function coverage for parseSettingsRoute. We test the navigation
// helpers + the React hook separately via the SettingsShell integration
// test below — pushState behavior in jsdom is well-tested upstream.

import { describe, it, expect, beforeEach } from "vitest";
import { parseSettingsRoute, SETTINGS_GROUP_IDS } from "../settingsRoute";

beforeEach(() => {
    // Reset persisted "last group" between tests so default-group resolution
    // is deterministic.
    try { window.localStorage.removeItem("pulseplay:settings-last-group"); } catch { /* swallow */ }
});

describe("parseSettingsRoute", () => {
    it("returns isSettingsRoute=false for non-settings paths", () => {
        const state = parseSettingsRoute("/");
        expect(state.isSettingsRoute).toBe(false);
    });

    it("returns isSettingsRoute=true with default group for bare /settings", () => {
        const state = parseSettingsRoute("/settings");
        expect(state.isSettingsRoute).toBe(true);
        expect(state.group).toBe("bi"); // first group, last-visited never set
        expect(state.leaf).toBeNull();
    });

    it.each(SETTINGS_GROUP_IDS)("parses /settings/%s as group=%s", (groupId) => {
        const state = parseSettingsRoute(`/settings/${groupId}`);
        expect(state.isSettingsRoute).toBe(true);
        expect(state.group).toBe(groupId);
        expect(state.leaf).toBeNull();
    });

    it("parses /settings/bi/provider as group=bi leaf=provider", () => {
        const state = parseSettingsRoute("/settings/bi/provider");
        expect(state.group).toBe("bi");
        expect(state.leaf).toBe("provider");
    });

    it("falls back to last-visited group for unknown group segments", () => {
        window.localStorage.setItem("pulseplay:settings-last-group", "system");
        const state = parseSettingsRoute("/settings/not-a-real-group");
        expect(state.isSettingsRoute).toBe(true);
        expect(state.group).toBe("system");
    });

    it("treats trailing slashes as decorative", () => {
        const a = parseSettingsRoute("/settings/ai/");
        const b = parseSettingsRoute("/settings/ai");
        expect(a.group).toBe("ai");
        expect(b.group).toBe("ai");
    });
});
