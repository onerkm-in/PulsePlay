// playground/src/biPanel/__tests__/registry.parity.test.ts
//
// Plugin-architecture parity tests.
//
// PulsePlay is the HOST. Every BI tool — Power BI, Databricks AI/BI,
// Databricks Genie, Tableau, Qlik, Looker, generic-iframe — is a PLUGIN
// that loads through the same `BIAdapter` contract. These tests lock
// that the host doesn't bias toward Power BI (or any other vendor):
//
//   1. Every entry returned by `listVendors()` is loadable via
//      `loadAdapter(vendor)`.
//   2. Every loaded adapter exposes the same surface — vendor,
//      displayName, capabilities(), mount(), on(), send(), destroy().
//   3. No vendor is hard-coded in the host; the only difference between
//      plugins is which module path the registry imports.
//   4. The unknown vendor case throws an actionable error that lists the
//      known vendor IDs.

import { describe, test, expect, beforeAll, vi } from "vitest";
import { listVendors, loadAdapter, type VendorInfo } from "../registry";
import type { BIAdapter } from "../BIAdapter";

// The Power BI adapter resolves a `service.Service` at mount time —
// instantiating the adapter alone does NOT trigger powerbi-client side
// effects, so loadAdapter() for "powerbi" is safe without a service stub.

const REGISTERED: VendorInfo[] = listVendors();

describe("BI registry — plugin-architecture parity", () => {
    test("at least the 7 currently-known plugins are registered", () => {
        const ids = REGISTERED.map(v => v.vendor).sort();
        expect(ids).toEqual([
            "databricks-aibi",
            "databricks-genie",
            "generic-iframe",
            "looker",
            "powerbi",
            "qlik",
            "tableau",
        ]);
    });

    test("every entry has the VendorInfo shape (no Power-BI-special fields)", () => {
        for (const info of REGISTERED) {
            expect(typeof info.vendor).toBe("string");
            expect(info.vendor.length).toBeGreaterThan(0);
            expect(typeof info.displayName).toBe("string");
            expect(info.displayName.length).toBeGreaterThan(0);
            expect(typeof info.description).toBe("string");
            expect(typeof info.configured).toBe("boolean");
            // No vendor info leaks credentials or vendor-specific config
            // through the registry. Plugins must surface their own setup
            // in their own Settings UI, not the registry.
            expect(Object.keys(info).sort()).toEqual([
                "configured", "description", "displayName", "vendor",
            ]);
        }
    });

    test("only generic-iframe ships pre-configured (no creds needed); every other plugin starts unconfigured", () => {
        const preConfigured = REGISTERED.filter(v => v.configured).map(v => v.vendor);
        expect(preConfigured).toEqual(["generic-iframe"]);
    });

    test("loadAdapter() throws an actionable error for an unknown vendor, listing the known IDs", async () => {
        await expect(loadAdapter("bogus")).rejects.toThrow(/Unknown BI vendor: bogus/);
        // The error message MUST enumerate the registered plugins so the
        // operator sees the actual options, not a generic "not found".
        await expect(loadAdapter("bogus")).rejects.toThrow(/powerbi/);
        await expect(loadAdapter("bogus")).rejects.toThrow(/tableau/);
        await expect(loadAdapter("bogus")).rejects.toThrow(/databricks-aibi/);
        await expect(loadAdapter("bogus")).rejects.toThrow(/databricks-genie/);
    });
});

describe("BI registry — every registered plugin loads through the same contract", () => {
    type Loaded = { info: VendorInfo; adapter: BIAdapter };
    const loaded: Loaded[] = [];

    beforeAll(async () => {
        for (const info of REGISTERED) {
            const adapter = await loadAdapter(info.vendor);
            loaded.push({ info, adapter });
        }
    });

    test("every plugin produces an instance whose .vendor matches the registry ID", () => {
        for (const { info, adapter } of loaded) {
            expect(adapter.vendor).toBe(info.vendor);
        }
    });

    test("every plugin sets a non-empty displayName", () => {
        for (const { adapter } of loaded) {
            expect(typeof adapter.displayName).toBe("string");
            expect(adapter.displayName.length).toBeGreaterThan(0);
        }
    });

    test("every plugin implements the BIAdapter method surface", () => {
        const required = ["mount", "destroy", "on", "send", "capabilities"] as const;
        for (const { info, adapter } of loaded) {
            for (const method of required) {
                expect(
                    typeof (adapter as unknown as Record<string, unknown>)[method],
                    `${info.vendor} missing ${method}`,
                ).toBe("function");
            }
        }
    });

    test("every plugin's capabilities() returns the full BICapabilities shape", () => {
        const requiredKeys = [
            "canNavigatePages",
            "canApplyFilters",
            "canExport",
            "canRefresh",
            "canFullscreen",
            "requiresContainerEl",
        ];
        for (const { info, adapter } of loaded) {
            const caps = adapter.capabilities();
            for (const key of requiredKeys) {
                expect(
                    typeof (caps as unknown as Record<string, unknown>)[key],
                    `${info.vendor} capability ${key} missing`,
                ).toBe("boolean");
            }
        }
    });

    test("Power BI is not privileged — its capability surface is one of many, not a default", () => {
        // The Power BI adapter advertises filters + nav by default;
        // generic-iframe and the v0 vendor stubs do not. This test locks
        // that asymmetry as INTENTIONAL (vendor-specific), not as the
        // host preferring Power BI.
        const pbi = loaded.find(l => l.info.vendor === "powerbi")!;
        const iframe = loaded.find(l => l.info.vendor === "generic-iframe")!;
        expect(pbi.adapter.capabilities().canApplyFilters).toBe(true);
        expect(iframe.adapter.capabilities().canApplyFilters).toBe(false);
        // Both REQUIRE a container element — that's a host-side guarantee,
        // not a vendor-specific privilege.
        expect(pbi.adapter.capabilities().requiresContainerEl).toBe(true);
        expect(iframe.adapter.capabilities().requiresContainerEl).toBe(true);
    });

    test("every plugin's on() returns an unsubscribe function", () => {
        for (const { info, adapter } of loaded) {
            const off = adapter.on("loaded", () => {});
            expect(typeof off, `${info.vendor} on() return`).toBe("function");
            off();
        }
    });

    test("send() before mount throws NOT_MOUNTED for every plugin (vendor-neutral host invariant)", async () => {
        for (const { info, adapter } of loaded) {
            await expect(
                adapter.send({ kind: "refresh" }),
                `${info.vendor} should require mount before send`,
            ).rejects.toThrow(/NOT_MOUNTED/);
        }
    });

    test("destroy() before mount is a no-op for every plugin", () => {
        for (const { info, adapter } of loaded) {
            expect(() => adapter.destroy(), `${info.vendor} destroy() pre-mount`).not.toThrow();
        }
    });
});

describe("BI registry — Vite lazy-load posture", () => {
    test("loadAdapter is async (returns Promise) so Vite can code-split per vendor", () => {
        // Lock the contract: if someone ever inlines the imports, the
        // entire bundle balloons with every vendor SDK. The async-only
        // surface is the load-bearing constraint.
        const result = loadAdapter("generic-iframe");
        expect(result).toBeInstanceOf(Promise);
        return result;
    });

    test("loadAdapter resolves a different instance on each call (no shared singleton)", async () => {
        // Each mounted BI panel needs its own adapter; the registry is a
        // factory, not a singleton cache.
        const a = await loadAdapter("generic-iframe");
        const b = await loadAdapter("generic-iframe");
        expect(a).not.toBe(b);
    });
});

// Belt-and-braces — vi reference kept so this file participates in
// vitest's mock isolation lifecycle even though no mocks are needed
// at this layer (the parity check is intentionally about the real
// registry, not stubs).
void vi;
