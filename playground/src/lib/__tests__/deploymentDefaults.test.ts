import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
    pickDefaultProfile,
    pickEmbedTarget,
    syncDeploymentDefaults,
} from "../deploymentDefaults";
import { getEmbedConfig, setEmbedConfig, __resetEmbedConfigStore } from "../../settings/embedConfigStore";

/**
 * Both axes used to be chosen per browser, so a fresh user landed on "Setup
 * needed" even when app.yaml had a working Genie space and Power BI report, and
 * a browser configured months ago kept stale choices after the stack moved.
 * These pin the deployment-as-source-of-truth behaviour, and - just as
 * importantly - that it never overrides a choice a user made.
 */
const HOSTED_PROFILES = [
    { name: "default", type: "genie" },
    { name: "support", type: "genie" },
    { name: "foundation", type: "foundation-model" },
    {
        name: "powerbidwd",
        type: "powerbi-semantic-model",
        powerbiGroupId: "7bb52a2a-5028-4887-b8ec-7d13e386da93",
        powerbiReportId: "ead5b770-af86-438d-b650-7be705e89c37",
    },
];

function mockProfiles(body: unknown, ok = true) {
    vi.stubGlobal("fetch", vi.fn(async () => ({
        ok, status: ok ? 200 : 500, json: async () => body, text: async () => "",
    })) as unknown as typeof fetch);
}

describe("pickDefaultProfile", () => {
    it("prefers the proxy's own 'default' convention", () => {
        expect(pickDefaultProfile(HOSTED_PROFILES)).toBe("default");
    });

    it("never picks the no-LLM DAX brain as the answer engine", () => {
        const noDefault = HOSTED_PROFILES.filter(p => p.name !== "default");
        expect(pickDefaultProfile(noDefault)).not.toBe("powerbidwd");
    });

    it("falls back to the only profile when that is all there is", () => {
        expect(pickDefaultProfile([{ name: "powerbidwd", type: "powerbi-semantic-model" }])).toBe("powerbidwd");
        expect(pickDefaultProfile([])).toBeNull();
    });
});

describe("pickEmbedTarget", () => {
    it("finds the profile that declares a report", () => {
        expect(pickEmbedTarget(HOSTED_PROFILES)?.name).toBe("powerbidwd");
    });
    it("returns null when no deployment declares one", () => {
        expect(pickEmbedTarget([{ name: "default", type: "genie" }])).toBeNull();
    });
});

describe("syncDeploymentDefaults", () => {
    beforeEach(() => {
        window.localStorage.clear();
        __resetEmbedConfigStore();
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("seeds both axes on a fresh browser", async () => {
        mockProfiles(HOSTED_PROFILES);
        const r = await syncDeploymentDefaults();
        expect(r.seededProfile).toBe("default");
        expect(r.seededEmbed).toBe(true);
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("default");
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("ead5b770-af86-438d-b650-7be705e89c37");
    });

    it("leaves an explicitly chosen brain alone", async () => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "support");
        mockProfiles(HOSTED_PROFILES);
        const r = await syncDeploymentDefaults();
        expect(r.seededProfile).toBeNull();
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("support");
    });

    it("leaves an explicitly chosen report alone", async () => {
        setEmbedConfig({ id: "the-authors-own-report" });
        mockProfiles(HOSTED_PROFILES);
        const r = await syncDeploymentDefaults();
        expect(r.seededEmbed).toBe(false);
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("the-authors-own-report");
    });

    it("is a no-op when the proxy is unreachable or returns nothing useful", async () => {
        mockProfiles([], false);
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false });

        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch);
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false });

        mockProfiles({ not: "an array" });
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false });
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBeNull();
    });
});
