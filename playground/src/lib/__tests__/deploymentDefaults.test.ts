import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
    pickDefaultProfile,
    pickEmbedTarget,
    syncDeploymentDefaults,
    describeEmbedCoherence,
    resetEmbedConfigToDeployment,
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

    // The all-Databricks pair: a Lakeview declaration wins over a Power BI
    // report, and the ACTIVE profile's own declaration wins over another
    // profile's — the only choice guaranteed coherent with what the AI
    // answers from.
    const WITH_LAKEVIEW = [
        ...HOSTED_PROFILES,
        { name: "scm", type: "genie", lakeviewDashboardId: "lv-scm", workspaceUrl: "https://ws" },
        { name: "other", type: "genie", lakeviewDashboardId: "lv-other", workspaceUrl: "https://ws" },
    ];
    it("prefers the active profile's own Lakeview dashboard", () => {
        expect(pickEmbedTarget(WITH_LAKEVIEW, "other")?.lakeviewDashboardId).toBe("lv-other");
    });
    it("prefers any Lakeview dashboard over a Power BI report", () => {
        expect(pickEmbedTarget(WITH_LAKEVIEW)?.lakeviewDashboardId).toBe("lv-scm");
        expect(pickEmbedTarget(WITH_LAKEVIEW, "foundation")?.lakeviewDashboardId).toBe("lv-scm");
    });
});

describe("pickDefaultProfile prefers a warehouse-backed brain", () => {
    it("picks genie over a foundation-model profile listed first", () => {
        // This exact ordering landed a fresh browser on `foundation`, whose
        // Decisions surface can only apologise (no SQL warehouse).
        const listed = [
            { name: "foundation", type: "foundation-model" },
            { name: "genie-scm-poc", type: "genie" },
        ];
        expect(pickDefaultProfile(listed)).toBe("genie-scm-poc");
    });

    it("among genie profiles, prefers the one that declares the deployment's dashboard", () => {
        const listed = [
            { name: "genie", type: "genie" },
            { name: "genie-scm-poc", type: "genie", lakeviewDashboardId: "lv-1" },
        ];
        expect(pickDefaultProfile(listed)).toBe("genie-scm-poc");
    });
});

describe("describeEmbedCoherence", () => {
    const target = HOSTED_PROFILES[3];

    it("flags a browser showing a different report than the deployment answers from", () => {
        // the exact failure: the old Superstore report, same workspace, renders
        // fine, reconciles with nothing
        const c = describeEmbedCoherence({ id: "c6afe35e-5dba-453a-9720-871d48f0ad0a" }, target);
        expect(c.coherent).toBe(false);
        if (!c.coherent) {
            expect(c.storedReportId).toBe("c6afe35e-5dba-453a-9720-871d48f0ad0a");
            expect(c.expectedReportId).toBe("ead5b770-af86-438d-b650-7be705e89c37");
        }
    });

    it("is coherent when they match, including the legacy reportId key", () => {
        expect(describeEmbedCoherence({ id: target.powerbiReportId }, target).coherent).toBe(true);
        expect(describeEmbedCoherence({ reportId: target.powerbiReportId }, target).coherent).toBe(true);
    });

    it("says nothing when there is nothing to compare", () => {
        expect(describeEmbedCoherence({}, target).coherent).toBe(true);
        expect(describeEmbedCoherence(null, target).coherent).toBe(true);
        expect(describeEmbedCoherence({ id: "x" }, null).coherent).toBe(true);
    });
});

describe("resetEmbedConfigToDeployment", () => {
    beforeEach(() => { window.localStorage.clear(); __resetEmbedConfigStore(); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it("is the one path that DOES overwrite - and only after a sync learned the target", async () => {
        setEmbedConfig({ id: "c6afe35e-5dba-453a-9720-871d48f0ad0a" });
        mockProfiles(HOSTED_PROFILES);
        const r = await syncDeploymentDefaults();
        expect(r.embedMismatch).toEqual({
            storedReportId: "c6afe35e-5dba-453a-9720-871d48f0ad0a",
            expectedReportId: "ead5b770-af86-438d-b650-7be705e89c37",
        });
        // still not corrected on its own
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("c6afe35e-5dba-453a-9720-871d48f0ad0a");

        expect(resetEmbedConfigToDeployment()).toBe(true);
        expect((getEmbedConfig() as Record<string, unknown>).id).toBe("ead5b770-af86-438d-b650-7be705e89c37");
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
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false, embedMismatch: null });

        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch);
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false, embedMismatch: null });

        mockProfiles({ not: "an array" });
        expect(await syncDeploymentDefaults()).toEqual({ seededProfile: null, seededEmbed: false, embedMismatch: null });
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBeNull();
    });
});
