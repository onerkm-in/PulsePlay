import { describe, expect, it, beforeEach } from "vitest";
import {
    seedEmbedConfigFromDeployment,
    getEmbedConfig,
    setEmbedConfig,
    __resetEmbedConfigStore,
} from "../embedConfigStore";

/**
 * The embed target used to live only in localStorage, set per browser by hand.
 * A browser configured months earlier kept opening whatever report it was last
 * pointed at, even after the whole stack was repointed - which is how a stale
 * Superstore report survived the move to the SCM star and quietly disagreed
 * with every number the AI produced. The deployment can now declare the target
 * (PROXY_PROFILE_*_POWERBI_REPORT_ID), and a fresh browser adopts it.
 */
const TARGET = {
    powerbiReportId: "ead5b770-af86-438d-b650-7be705e89c37",
    powerbiGroupId: "7bb52a2a-5028-4887-b8ec-7d13e386da93",
    powerbiDatasetId: "633b2b11-d390-43f6-9894-fc90855691b6",
};

describe("seedEmbedConfigFromDeployment", () => {
    beforeEach(() => {
        window.localStorage.clear();
        __resetEmbedConfigStore();
    });

    it("seeds a fresh browser with the deployment's report", () => {
        expect(seedEmbedConfigFromDeployment(TARGET)).toBe(true);
        const cfg = getEmbedConfig() as Record<string, unknown>;
        // `id` is the report id per PowerBIEmbedConfig, not `reportId`
        expect(cfg.id).toBe(TARGET.powerbiReportId);
        expect(cfg.groupId).toBe(TARGET.powerbiGroupId);
        expect(cfg.datasetId).toBe(TARGET.powerbiDatasetId);
    });

    it("never overwrites a config this browser already has", () => {
        setEmbedConfig({ id: "a-report-the-author-chose" });
        expect(seedEmbedConfigFromDeployment(TARGET)).toBe(false);
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("a-report-the-author-chose");
    });

    it("does nothing when the deployment declares no report", () => {
        expect(seedEmbedConfigFromDeployment(null)).toBe(false);
        expect(seedEmbedConfigFromDeployment({})).toBe(false);
        expect(seedEmbedConfigFromDeployment({ powerbiGroupId: "g" })).toBe(false);
        expect(getEmbedConfig()).toEqual({});
    });

    it("writes no credential to storage", () => {
        seedEmbedConfigFromDeployment(TARGET);
        const raw = window.localStorage.getItem("pulseplay:bi-embed-config") || "";
        expect(raw).not.toMatch(/accessToken|secret|token/i);
    });
});
