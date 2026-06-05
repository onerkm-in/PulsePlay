// Honesty layer for the connector catalogue — the live-verification status must
// reflect what's been PROVEN end-to-end, deployer-agnostically (no universal
// "blocked" claim for environment-specific issues like Genie serverless).
import { describe, expect, it } from "vitest";
import { getConnectorLiveStatus } from "../connectorManifests";

describe("getConnectorLiveStatus", () => {
    it("marks the two proven backends as verified", () => {
        expect(getConnectorLiveStatus("foundation-model").status).toBe("verified");
        expect(getConnectorLiveStatus("powerbi-dataset-dax").status).toBe("verified");
    });

    it("marks code-present-but-unproven backends as unverified (never overstates)", () => {
        for (const id of ["azure-openai-chat", "bedrock-direct", "responses-agent", "supervisor-local"]) {
            expect(getConnectorLiveStatus(id).status).toBe("unverified");
        }
    });

    it("does NOT make a universal 'blocked' claim for Genie — it's unverified with a workspace note", () => {
        const genie = getConnectorLiveStatus("genie");
        expect(genie.status).toBe("unverified");
        // The environment-specific blocker lives in the note, not the status.
        expect(genie.note).toMatch(/Serverless Compute|warehouse/i);
    });

    it("marks the demo connector as demo", () => {
        expect(getConnectorLiveStatus("demo-mock").status).toBe("demo");
    });

    it("defaults unknown ids to unverified (safe — never claims verified)", () => {
        expect(getConnectorLiveStatus("some-future-connector").status).toBe("unverified");
    });
});
