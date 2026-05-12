import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenieClient, __clearProxyHealthCacheForTests } from "../genie";

const ORIGINAL_XHR = globalThis.XMLHttpRequest;

class FakeHealthXHR {
    static sends = 0;

    readyState = 0;
    status = 200;
    responseText = JSON.stringify({
        ok: true,
        profiles: ["default", "analytics"],
        configSource: "config.json",
    });
    timeout = 0;
    onreadystatechange: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onerror: (() => void) | null = null;

    open(): void {}

    send(): void {
        FakeHealthXHR.sends += 1;
        window.setTimeout(() => {
            this.readyState = 4;
            this.onreadystatechange?.();
        }, 0);
    }
}

describe("GenieClient.checkProxyHealth", () => {
    beforeEach(() => {
        FakeHealthXHR.sends = 0;
        __clearProxyHealthCacheForTests();
        globalThis.XMLHttpRequest = FakeHealthXHR as unknown as typeof XMLHttpRequest;
    });

    afterEach(() => {
        globalThis.XMLHttpRequest = ORIGINAL_XHR;
        __clearProxyHealthCacheForTests();
    });

    it("single-flights and caches repeated proxy health checks", async () => {
        const config = {
            host: "",
            token: "",
            apiBaseUrl: "http://127.0.0.1:8787",
            connectionMode: "proxy" as const,
        };
        const a = new GenieClient(config);
        const b = new GenieClient(config);

        const results = await Promise.all([
            a.checkProxyHealth(),
            b.checkProxyHealth(),
            a.checkProxyHealth(),
        ]);

        expect(results.every(r => r.ok)).toBe(true);
        expect(FakeHealthXHR.sends).toBe(1);

        await a.checkProxyHealth();
        expect(FakeHealthXHR.sends).toBe(1);
    });

    it("does not probe the proxy in direct mode", async () => {
        const client = new GenieClient({
            host: "https://dbc.example.com",
            token: "dapi-test",
            connectionMode: "direct",
        });

        await expect(client.checkProxyHealth()).resolves.toEqual({ ok: true, mode: "direct" });
        expect(FakeHealthXHR.sends).toBe(0);
    });
});
