import { describe, expect, it } from "vitest";
import { getSetupReadiness } from "../setupReadiness";

describe("getSetupReadiness", () => {
    it("requires BI provider, embed config, and AI profile", () => {
        const state = getSetupReadiness({ biVendor: "powerbi", embedConfig: {}, activeAiProfile: "" });
        expect(state.ready).toBe(false);
        expect(state.biReady).toBe(false);
        expect(state.aiReady).toBe(false);
        expect(state.missing).toEqual(["BI config", "AI profile"]);
        expect(state.pillLabel).toBe("Setup needed");
    });

    it("is ready when both BI and AI axes are configured", () => {
        const state = getSetupReadiness({
            biVendor: "powerbi",
            embedConfig: { url: "https://app.powerbi.com/reportEmbed?reportId=r1" },
            activeAiProfile: "default",
        });
        expect(state.ready).toBe(true);
        expect(state.pillLabel).toBe("Ready");
        expect(state.pillDetail).toBe("BI + AI");
    });
});
