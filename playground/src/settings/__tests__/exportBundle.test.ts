// playground/src/settings/__tests__/exportBundle.test.ts
//
// Phase 5 — export bundle redaction + shape coverage.

import { describe, it, expect, beforeEach } from "vitest";
import { buildExportBundle } from "../exportBundle";
import type { SettingsState } from "../settingsStore";

const BASE_SETTINGS: SettingsState = {
    allowlist: {
        configured: true,
        biProviders: ["powerbi"],
        embedOrigins: { powerbi: ["app.powerbi.com"] },
        aadTenants: ["org-tenant"],
        aiProfiles: ["default"],
        packs: ["cpg-fmcg"],
        enforcement: "strict",
    },
    allowlistLoading: false,
    allowlistError: null,
    biVendor: "powerbi",
    packSelection: { pack: "cpg-fmcg" },
    uiMode: "pulse",
    enabledComponents: "both",
    layoutMode: "ai-left",
    biTileMode: "1",
    activeAiProfile: "default",
    orphans: [],
};

beforeEach(() => {
    window.localStorage.clear();
});

describe("buildExportBundle", () => {
    it("captures the canonical settings + allowlist + proxy state", () => {
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: { ok: true }, lastCheckedAt: "2026-05-13T10:00:00Z", error: null },
        });
        expect(bundle.settings.biVendor).toBe("powerbi");
        expect(bundle.settings.activeAiProfile).toBe("default");
        expect(bundle.allowlist?.biProviders).toEqual(["powerbi"]);
        expect(bundle.proxy.health).toEqual({ ok: true });
        expect(bundle.generatedAt).toMatch(/T/);
        expect(bundle.pulseplayVersion).toContain("mvp-0.2");
    });

    it("redacts keys with token/secret/key in their name", () => {
        window.localStorage.setItem("pulseplay:demo-token", "eyJabc.def.ghi");
        window.localStorage.setItem("pulseplay:demo-secret", "shh");
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: null, lastCheckedAt: null, error: null },
        });
        expect(bundle.localStorage["pulseplay:demo-token"]).toBe("[REDACTED]");
        expect(bundle.localStorage["pulseplay:demo-secret"]).toBe("[REDACTED]");
        expect(bundle.localStorage["pulseplay:bi-vendor"]).toBe("powerbi");
    });

    it("redacts JWT-shaped and dapi-shaped values inside non-secret keys", () => {
        window.localStorage.setItem(
            "pulseplay:visual-settings:genieSettings",
            JSON.stringify({ assistantProfile: "default", token: "dapi1234567890abcdef" }),
        );
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: null, lastCheckedAt: null, error: null },
        });
        const stored = bundle.localStorage["pulseplay:visual-settings:genieSettings"];
        expect(stored).toContain("[REDACTED]");
        expect(stored).not.toContain("dapi1234567890abcdef");
    });

    it("includes browser info", () => {
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: null, lastCheckedAt: null, error: null },
        });
        expect(bundle.browser.userAgent).toEqual(expect.any(String));
        expect(typeof bundle.browser.viewportWidth).toBe("number");
    });
});
