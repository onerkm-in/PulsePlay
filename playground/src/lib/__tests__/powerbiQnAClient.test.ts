import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    fetchQnAEmbedConfig,
    PowerBiQnAInvalidProfileError,
} from "../powerbiQnAClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("fetchQnAEmbedConfig", () => {
    it("POSTs to /api/powerbi/qna/embed-token with the profile name", async () => {
        let captured: any;
        globalThis.fetch = vi.fn(async (url: any, opts: any) => {
            captured = { url, body: opts ? JSON.parse(opts.body) : null };
            return jsonResponse({
                accessToken: "tok-abc",
                embedUrl: "https://app.powerbi.com/qnaEmbed?groupId=g1",
                datasetId: "d1",
                groupId: "g1",
                expiresAt: Date.now() + 3600_000,
                tokenType: "Embed",
            });
        }) as any;
        const cfg = await fetchQnAEmbedConfig("default");
        expect(captured.url).toBe("/api/powerbi/qna/embed-token");
        expect(captured.body).toEqual({ profile: "default" });
        expect(cfg.accessToken).toBe("tok-abc");
        expect(cfg.tokenType).toBe("Embed");
    });

    it("omits profile from body when no profile name supplied (server auto-resolves)", async () => {
        let captured: any;
        globalThis.fetch = vi.fn(async (_url: any, opts: any) => {
            captured = opts ? JSON.parse(opts.body) : null;
            return jsonResponse({
                accessToken: "tok-auto",
                embedUrl: "https://app.powerbi.com/qnaEmbed?groupId=g2",
                datasetId: "d2",
                groupId: "g2",
                expiresAt: Date.now() + 3600_000,
                tokenType: "Embed",
            });
        }) as any;
        const cfg = await fetchQnAEmbedConfig();
        expect(captured).toEqual({});
        expect(cfg.datasetId).toBe("d2");
    });

    it("rejects invalid profile name client-side without network call", async () => {
        const fetchSpy = vi.fn();
        globalThis.fetch = fetchSpy as any;
        await expect(fetchQnAEmbedConfig("../etc/passwd")).rejects.toBeInstanceOf(PowerBiQnAInvalidProfileError);
        await expect(fetchQnAEmbedConfig("a b c")).rejects.toBeInstanceOf(PowerBiQnAInvalidProfileError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("throws friendly proxy-unreachable message on network error", async () => {
        globalThis.fetch = vi.fn(async () => { throw new TypeError("fetch failed"); }) as any;
        await expect(fetchQnAEmbedConfig("default")).rejects.toThrow(/Proxy unreachable/);
    });

    it("surfaces server-side problem.detail on 4xx", async () => {
        globalThis.fetch = vi.fn(async () => new Response(
            JSON.stringify({ detail: "No Power BI semantic-model profile configured.", title: "Bad Request" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        )) as any;
        await expect(fetchQnAEmbedConfig("default")).rejects.toThrow(/No Power BI semantic-model profile configured/);
    });

    it("throws on malformed response (missing required field)", async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ accessToken: "tok-only" })) as any;
        await expect(fetchQnAEmbedConfig("default")).rejects.toThrow(/missing required fields/);
    });

    it("throws on missing accessToken even when other fields are present", async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({
            embedUrl: "https://app.powerbi.com/qnaEmbed?groupId=g",
            datasetId: "d",
            groupId: "g",
            expiresAt: Date.now(),
        })) as any;
        await expect(fetchQnAEmbedConfig("default")).rejects.toThrow(/missing required fields/);
    });
});
