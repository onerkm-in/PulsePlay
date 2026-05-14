// playground/src/settings/__tests__/exportBundle.test.ts
//
// Phase 5 — export bundle redaction + shape coverage.
// 2026-05-14: extended for the support-bundle redaction P2 lane:
// nested-localStorage secrets, diagnostic event payloads, proxy.health
// deep redaction, and depth/array-length caps.

import { describe, it, expect, beforeEach } from "vitest";
import { buildExportBundle, redactDeep } from "../exportBundle";
import { __clearDiagnosticsBufferForTests } from "../diagnosticsBuffer";
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
    __clearDiagnosticsBufferForTests();
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

/* ─── redactDeep + nested-secret coverage (P2 support-bundle lane) ──── */

describe("redactDeep", () => {
    it("redacts nested object keys matching the sensitive-key list", () => {
        const out = redactDeep({
            tenantId: "org-tenant",
            config: {
                accessToken: "plain-text-secret",
                clientSecret: "another-plain-text",
                workspaceId: "abc-123",
            },
        }) as Record<string, unknown>;
        expect(out.tenantId).toBe("org-tenant");
        const cfg = out.config as Record<string, unknown>;
        expect(cfg.accessToken).toBe("[REDACTED]");
        expect(cfg.clientSecret).toBe("[REDACTED]");
        // Non-sensitive nested fields stay intact.
        expect(cfg.workspaceId).toBe("abc-123");
    });

    it("redacts JWT / Bearer / dapi shapes inside nested string values", () => {
        const out = redactDeep({
            note: "session ok",
            evt: {
                payload: {
                    text: "Got Bearer eyJabc.def.ghi from upstream",
                    other: "dapi1234567890abcdef token live",
                },
            },
        }) as { evt: { payload: { text: string; other: string } } };
        expect(out.evt.payload.text).toContain("[REDACTED]");
        expect(out.evt.payload.text).not.toContain("eyJabc.def.ghi");
        expect(out.evt.payload.other).toContain("[REDACTED]");
        expect(out.evt.payload.other).not.toContain("dapi1234567890abcdef");
    });

    it("caps depth so deeply nested or cyclical objects don't blow up the bundle", () => {
        // Build a 12-deep chain (deeper than MAX_DEPTH=8).
        let cur: Record<string, unknown> = { leaf: "deep" };
        for (let i = 0; i < 12; i += 1) cur = { next: cur };
        const out = redactDeep(cur) as Record<string, unknown>;
        const json = JSON.stringify(out);
        expect(json).toContain("[REDACTED:max-depth]");
    });

    it("trims arrays past MAX_ARRAY_ITEMS so an attacker-controlled huge array can't bloat the bundle", () => {
        const huge = Array.from({ length: 250 }, (_, i) => ({ idx: i }));
        const out = redactDeep(huge) as unknown[];
        // 200 kept + 1 trailing marker = 201.
        expect(out.length).toBe(201);
        expect(typeof out[200]).toBe("string");
        expect(out[200]).toContain("[REDACTED:array-trimmed-50-more]");
    });
});

describe("buildExportBundle — nested redaction coverage", () => {
    it("redacts sensitive nested keys inside JSON-shaped localStorage values", () => {
        // The OUTER key doesn't match SENSITIVE_KEY_PATTERNS, so without
        // deep redaction `accessToken` and `clientSecret` would leak
        // through verbatim. With redactDeep applied, both nested fields
        // are stripped to [REDACTED] but non-secret siblings stay intact.
        window.localStorage.setItem(
            "pulseplay:visual-settings:genieSettings",
            JSON.stringify({
                assistantProfile: "default",
                config: { accessToken: "plain-text-secret", workspaceId: "ws-1" },
            }),
        );
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: null, lastCheckedAt: null, error: null },
        });
        const raw = bundle.localStorage["pulseplay:visual-settings:genieSettings"];
        const parsed = JSON.parse(raw);
        expect(parsed.assistantProfile).toBe("default");
        expect(parsed.config.accessToken).toBe("[REDACTED]");
        expect(parsed.config.workspaceId).toBe("ws-1");
        // Defense-in-depth: the raw string must not contain the secret either.
        expect(raw).not.toContain("plain-text-secret");
    });

    it("redacts diagnostic event payloads (raw events can carry filter values or embed tokens)", () => {
        // Dispatch a fake BI event that the diagnostics buffer catches.
        window.dispatchEvent(new CustomEvent("pulseplay:bi-event", {
            detail: {
                vendor: "powerbi",
                event: {
                    type: "filtersApplied",
                    payload: {
                        filters: [{ table: "Sales", column: "Region", value: "EU" }],
                        embedToken: "Bearer eyJabc.def.ghi",
                        clientSecret: "leaked-via-vendor-payload",
                    },
                },
            },
        }));
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: { health: null, lastCheckedAt: null, error: null },
        });
        const evt = bundle.diagnostics.events[0];
        expect(evt.vendor).toBe("powerbi");
        expect(evt.type).toBe("filtersApplied");
        const payload = evt.payload as Record<string, unknown>;
        // Non-sensitive filter shape preserved for debugging.
        expect(payload.filters).toEqual([{ table: "Sales", column: "Region", value: "EU" }]);
        // Sensitive nested keys redacted.
        expect(payload.embedToken).toBe("[REDACTED]");
        expect(payload.clientSecret).toBe("[REDACTED]");
        // Defense-in-depth: raw JSON dump of the bundle does not contain
        // the leaked secret string.
        expect(JSON.stringify(bundle)).not.toContain("leaked-via-vendor-payload");
    });

    it("redacts sensitive fields in proxy.health", () => {
        const bundle = buildExportBundle({
            settings: BASE_SETTINGS,
            proxy: {
                // Misconfigured /health route bleeds an internal secret.
                health: {
                    ok: true,
                    profiles: 2,
                    detail: { source: "environment", clientSecret: "should-not-leak" },
                },
                lastCheckedAt: "2026-05-14T12:00:00Z",
                error: null,
            },
        });
        const h = bundle.proxy.health as Record<string, unknown>;
        expect(h.ok).toBe(true);
        expect(h.profiles).toBe(2);
        const detail = h.detail as Record<string, unknown>;
        expect(detail.source).toBe("environment");
        expect(detail.clientSecret).toBe("[REDACTED]");
        expect(JSON.stringify(bundle.proxy)).not.toContain("should-not-leak");
    });
});
