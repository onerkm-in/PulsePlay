// playground/src/lib/__tests__/probeClient.sanitize.test.ts
//
// L14 closure tests — probeConnector rejects profile names that don't
// match the whitelist regex BEFORE issuing any network call.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probeConnector, ProbeInvalidProfileError } from "../probeClient";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("probeConnector sanitization (L14)", () => {
    it("rejects an empty profile name with ProbeInvalidProfileError", async () => {
        await expect(probeConnector("")).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects profile names with spaces", async () => {
        await expect(probeConnector("my profile name")).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects profile names with email-shaped content (no @ allowed)", async () => {
        await expect(probeConnector("user@example.com")).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects profile names with semicolons or quotes (SQL-injection-shaped)", async () => {
        await expect(probeConnector("profile';--")).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        await expect(probeConnector('a"b')).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects profile names longer than 128 chars", async () => {
        await expect(probeConnector("a".repeat(129))).rejects.toBeInstanceOf(ProbeInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("accepts alphanumeric + dot + underscore + hyphen", async () => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
            profile: "ok.profile_1-name",
            connectorType: "genie",
            metadataAvailability: "minimal",
            probeDurationMs: 5,
        }), { status: 200, headers: { "content-type": "application/json" } }));
        await expect(probeConnector("ok.profile_1-name")).resolves.toBeDefined();
        expect(fetchSpy).toHaveBeenCalledOnce();
    });
});
