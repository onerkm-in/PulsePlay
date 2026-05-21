import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GenieClient } from "../genie";

// Mock XMLHttpRequest to avoid real network calls in tests.
// Each test can configure `mockResponse` and `mockStatus` to simulate different server responses.
let mockXhrInstances: MockXhr[] = [];

class MockXhr {
    method = "";
    url = "";
    headers: Record<string, string> = {};
    timeout = 0;
    body: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    status = 200;
    responseText = "{}";

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
    }

    send(body: string | null) {
        this.body = body;
        mockXhrInstances.push(this);
    }

    // Test helper: resolve the request with a given status and response body.
    resolve(status: number, body: any) {
        this.status = status;
        this.responseText = typeof body === "string" ? body : JSON.stringify(body);
        this.onload?.();
    }

    // Test helper: simulate a network-level error.
    fail() {
        this.onerror?.();
    }

    // Test helper: simulate a timeout.
    timeout_() {
        this.ontimeout?.();
    }
}

beforeEach(() => {
    mockXhrInstances = [];
    vi.stubGlobal("XMLHttpRequest", MockXhr);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function lastXhr(): MockXhr {
    return mockXhrInstances[mockXhrInstances.length - 1];
}

describe("GenieClient construction", () => {
    it("strips trailing slash from host", () => {
        const client = new GenieClient({ host: "https://example.com/", token: "tok", spaceId: "sp1" });
        const conv = client.startConversation("hi");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().url).toContain("https://example.com/api/2.0/genie/spaces/sp1");
        });
    });

    it("uses apiBaseUrl over host when provided", () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            token: "tok",
            spaceId: "sp2"
        });
        const conv = client.startConversation("hi");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().url).toContain("localhost:8787");
        });
    });

    it("sets X-Genie-Target-Host header when apiBaseUrl and host are both present", () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            token: "tok",
            spaceId: "sp1"
        });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["X-Genie-Target-Host"]).toBe("https://adb.example.com");
        });
    });

    it("does not set X-Genie-Target-Host header in direct mode", () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["X-Genie-Target-Host"]).toBeUndefined();
        });
    });

    it("sets Authorization header when token is present", () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "mytoken", spaceId: "sp1" });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["Authorization"]).toBe("Bearer mytoken");
        });
    });
});

describe("testConnection", () => {
    it("returns ok:true when the API responds with 200", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.testConnection();
        lastXhr().resolve(200, { conversations: [{ id: "c1" }, { id: "c2" }] });
        const result = await p;
        expect(result.ok).toBe(true);
        expect(result.detail).toContain("2 existing conversation");
    });

    it("returns ok:false on a non-200 response", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.testConnection();
        lastXhr().resolve(401, { message: "Unauthorized" });
        const result = await p;
        expect(result.ok).toBe(false);
    });

    it("returns ok:false on a network error", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.testConnection();
        lastXhr().fail();
        const result = await p;
        expect(result.ok).toBe(false);
    });
});

describe("startConversation", () => {
    it("returns conversationId and messageId from the response", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.startConversation("Hello Genie");
        lastXhr().resolve(200, { conversation_id: "conv-abc", message_id: "msg-xyz" });
        const result = await p;
        expect(result.conversationId).toBe("conv-abc");
        expect(result.messageId).toBe("msg-xyz");
    });

    it("rejects when the API returns an error status", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.startConversation("Hello");
        lastXhr().resolve(500, { message: "Server error" });
        await expect(p).rejects.toThrow("500");
    });
});

describe("sendMessage", () => {
    it("returns the message id from the response", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const p = client.sendMessage("conv-1", "What is sales?");
        lastXhr().resolve(200, { id: "msg-99" });
        const result = await p;
        expect(result).toBe("msg-99");
    });
});

describe("submitFeedback", () => {
    it("returns false when no apiBaseUrl is configured (direct mode)", async () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const result = await client.submitFeedback({ rating: "up" });
        expect(result).toBe(false);
        expect(mockXhrInstances).toHaveLength(0);
    });

    it("posts to the proxy /feedback endpoint and returns true", async () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            token: "",
            spaceId: "sp1"
        });
        const p = client.submitFeedback({ rating: "up", comment: "Helpful!" });
        lastXhr().resolve(200, { ok: true });
        const result = await p;
        expect(result).toBe(true);
        expect(lastXhr().url).toBe("http://localhost:8787/feedback");
    });
});
