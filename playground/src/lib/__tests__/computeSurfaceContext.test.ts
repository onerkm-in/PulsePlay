// playground/src/lib/__tests__/computeSurfaceContext.test.ts
//
// Locks the evidence-aware trust ladder shipped in 63efe1e so PulseShell
// and UnifiedAssistantSurface can't drift on it. Each branch of the
// ladder + each chip value gets a direct assertion.

import { describe, expect, it } from "vitest";
import { computeSurfaceContext } from "../computeSurfaceContext";

describe("computeSurfaceContext", () => {
    const baseInput = {
        isConfigured: false,
        assistantProfile: "",
        mode: "Conversation",
        selectedFilterCount: 0,
        currentScopeLabel: "",
        measureCount: 0,
        dimensionCount: 0,
        sendContextToAi: true,
    } as const;

    describe("trust ladder (4 states, must not drift across surfaces)", () => {
        it("returns 'Setup needed' when AI is not configured", () => {
            const result = computeSurfaceContext({ ...baseInput, isConfigured: false });
            expect(result.trust).toBe("Setup needed");
        });

        it("returns 'AI configured · Context off' when configured but BI context sending is off", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                isConfigured: true,
                sendContextToAi: false,
            });
            expect(result.trust).toBe("AI configured · Context off");
        });

        it("returns 'AI configured · No BI fields' when configured + context-on but no fields are bound", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                isConfigured: true,
                sendContextToAi: true,
                measureCount: 0,
                dimensionCount: 0,
            });
            expect(result.trust).toBe("AI configured · No BI fields");
        });

        it("returns 'Grounded to BI context' only when AI is configured AND context is on AND fields are bound", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                isConfigured: true,
                sendContextToAi: true,
                measureCount: 3,
                dimensionCount: 5,
            });
            expect(result.trust).toBe("Grounded to BI context");
        });

        it("treats either measures OR dimensions alone as bound (not both required)", () => {
            const onlyMeasures = computeSurfaceContext({
                ...baseInput,
                isConfigured: true,
                measureCount: 2,
                dimensionCount: 0,
            });
            const onlyDimensions = computeSurfaceContext({
                ...baseInput,
                isConfigured: true,
                measureCount: 0,
                dimensionCount: 4,
            });
            expect(onlyMeasures.trust).toBe("Grounded to BI context");
            expect(onlyDimensions.trust).toBe("Grounded to BI context");
        });
    });

    describe("source chip", () => {
        it("reports 'BI context off' when sending is disabled (regardless of field counts)", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                sendContextToAi: false,
                measureCount: 99,
                dimensionCount: 99,
            });
            expect(result.source).toBe("BI context off");
        });

        it("reports 'No BI fields bound' when sending is on but counts are zero", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                sendContextToAi: true,
            });
            expect(result.source).toBe("No BI fields bound");
        });

        it("reports concrete counts when fields are bound", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                sendContextToAi: true,
                measureCount: 3,
                dimensionCount: 12,
            });
            expect(result.source).toBe("3 metrics / 12 dimensions");
        });
    });

    describe("scope chip", () => {
        it("returns 'All visible data' when no filters are applied", () => {
            const result = computeSurfaceContext({ ...baseInput, selectedFilterCount: 0 });
            expect(result.scope).toBe("All visible data");
        });

        it("returns the supplied label when filters are applied", () => {
            const result = computeSurfaceContext({
                ...baseInput,
                selectedFilterCount: 2,
                currentScopeLabel: "FY26 Q1, North region",
            });
            expect(result.scope).toBe("FY26 Q1, North region");
        });
    });

    describe("assistant chip", () => {
        it("falls back to 'Default profile' when the assistant string is empty", () => {
            const result = computeSurfaceContext({ ...baseInput, assistantProfile: "" });
            expect(result.assistant).toBe("Default profile");
        });

        it("falls back to 'Default profile' when the assistant string is whitespace-only", () => {
            const result = computeSurfaceContext({ ...baseInput, assistantProfile: "   " });
            expect(result.assistant).toBe("Default profile");
        });

        it("passes through the configured profile name verbatim", () => {
            const result = computeSurfaceContext({ ...baseInput, assistantProfile: "genie-default" });
            expect(result.assistant).toBe("genie-default");
        });
    });

    it("passes the mode label through unchanged", () => {
        const result = computeSurfaceContext({ ...baseInput, mode: "Executive briefing" });
        expect(result.mode).toBe("Executive briefing");
    });
});
