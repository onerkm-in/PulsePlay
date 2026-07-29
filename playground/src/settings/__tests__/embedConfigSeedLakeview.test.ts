import { describe, expect, it, beforeEach } from "vitest";
import {
    seedEmbedConfigFromDeployment,
    getEmbedConfig,
    __resetEmbedConfigStore,
    EMBED_CONFIG_STORAGE_KEY,
} from "../embedConfigStore";

/**
 * Out-of-box Dashboard used to fail on any deployment without Power BI service
 * principal creds: fresh browsers seeded the PBI embed vendor, whose token
 * mint is env-blocked, while a perfectly renderable Lakeview dashboard sat in
 * the same workspace. These pin the all-Databricks seeding path.
 */
describe("seedEmbedConfigFromDeployment — Lakeview target", () => {
    beforeEach(() => {
        window.localStorage.clear();
        __resetEmbedConfigStore();
    });

    it("seeds the native adapter config INCLUDING the profile that routes dataset runs", () => {
        const ok = seedEmbedConfigFromDeployment({
            name: "genie-scm-poc",
            lakeviewDashboardId: "lv-1",
            workspaceUrl: "https://ws.example",
        });
        expect(ok).toBe(true);
        const cfg = getEmbedConfig() as Record<string, unknown>;
        expect(cfg.dashboardId).toBe("lv-1");
        expect(cfg.workspaceUrl).toBe("https://ws.example");
        // Without assistantProfile the adapter silently falls back to an
        // iframe embed that CSP blocks — the profile is load-bearing.
        expect(cfg.assistantProfile).toBe("genie-scm-poc");
    });

    it("seeds the databricks-aibi vendor alongside, but never overrides a chosen vendor", () => {
        seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-1" });
        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBe("databricks-aibi");

        // A browser that already picked a vendor keeps it.
        window.localStorage.clear();
        __resetEmbedConfigStore();
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-1" });
        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBe("powerbi");
    });

    it("never overwrites an existing embed config", () => {
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, JSON.stringify({ id: "chosen" }));
        __resetEmbedConfigStore();
        const ok = seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-1" });
        expect(ok).toBe(false);
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("chosen");
    });

    it("still seeds a Power BI target when no Lakeview is declared", () => {
        const ok = seedEmbedConfigFromDeployment({ powerbiReportId: "r-1", powerbiGroupId: "g-1" });
        expect(ok).toBe(true);
        const cfg = getEmbedConfig() as Record<string, unknown>;
        expect(cfg.id).toBe("r-1");
        expect(cfg.groupId).toBe("g-1");
    });
});

describe("deployment repoint follows for SEEDED configs only", () => {
    beforeEach(() => {
        window.localStorage.clear();
        __resetEmbedConfigStore();
    });

    it("re-seeds a marker-bearing config when the declared dashboard changes", () => {
        seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-old" });
        const again = seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-new" });
        expect(again).toBe(true);
        expect((getEmbedConfig() as Record<string, unknown>).dashboardId).toBe("lv-new");
    });

    it("does NOT re-seed when the declared target is unchanged", () => {
        seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-1" });
        expect(seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-1" })).toBe(false);
    });

    it("NEVER touches a person-authored config (no marker), even on repoint", () => {
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, JSON.stringify({ dashboardId: "mine" }));
        __resetEmbedConfigStore();
        expect(seedEmbedConfigFromDeployment({ name: "p", lakeviewDashboardId: "lv-new" })).toBe(false);
        expect((getEmbedConfig() as Record<string, unknown>).dashboardId).toBe("mine");
    });
});
