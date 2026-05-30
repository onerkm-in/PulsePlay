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

    it("uses the shared PulsePlay proxy route when apiBaseUrl is provided", () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            token: "tok",
            spaceId: "sp2"
        });
        const conv = client.startConversation("hi");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().url).toBe("http://localhost:8787/assistant/conversations/start");
        });
    });

    it("sets PX1 client identity headers in shared proxy mode", () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            token: "",
            spaceId: "sp1"
        });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["X-Pulse-Client"]).toBe("pulse-pbi");
            expect(lastXhr().headers["X-Pulse-Client-Version"]).toBe("2.1.0.0");
            expect(lastXhr().headers["X-Pulse-Request-Id"]).toMatch(/^pbi-\d+-[a-z0-9]+$/);
            expect(lastXhr().headers["X-Request-Id"]).toBe(lastXhr().headers["X-Pulse-Request-Id"]);
        });
    });

    it("does not set PX1 client identity headers in direct mode", () => {
        const client = new GenieClient({ host: "https://adb.example.com", token: "tok", spaceId: "sp1" });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["X-Pulse-Client"]).toBeUndefined();
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

    it("sets shared proxy auth, profile, and inline Databricks headers in proxy mode", () => {
        const client = new GenieClient({
            host: "https://adb.example.com",
            apiBaseUrl: "http://localhost:8787",
            assistantProfile: "finance",
            proxyKey: "proxy-secret",
            token: "dapi-token",
            spaceId: "space-1"
        });
        const conv = client.startConversation("test");
        lastXhr().resolve(200, { conversation_id: "c1", message_id: "m1" });
        return conv.then(() => {
            expect(lastXhr().headers["X-PulsePlay-Key"]).toBe("proxy-secret");
            expect(lastXhr().headers["X-Assistant-Profile"]).toBe("finance");
            expect(lastXhr().headers["X-Databricks-Host"]).toBe("https://adb.example.com");
            expect(lastXhr().headers["X-Databricks-Token"]).toBe("dapi-token");
            expect(lastXhr().headers["X-Genie-Space-Id"]).toBe("space-1");
            expect(lastXhr().headers["X-Profile-Name"]).toBe("finance");
            expect(JSON.parse(lastXhr().body || "{}")).toMatchObject({
                assistantProfile: "finance",
                spaceId: "space-1"
            });
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

    it("checks the shared proxy capabilities route in proxy mode", async () => {
        const client = new GenieClient({
            host: "",
            apiBaseUrl: "http://localhost:8787",
            assistantProfile: "finance",
            token: "",
            spaceId: ""
        });
        const p = client.testConnection();
        lastXhr().resolve(200, { ok: true, assistantProfile: "finance" });
        const result = await p;
        expect(result.ok).toBe(true);
        expect(result.detail).toContain("finance");
        expect(lastXhr().url).toBe("http://localhost:8787/assistant/capabilities?assistantProfile=finance");
        expect(lastXhr().headers["X-Pulse-Client"]).toBe("pulse-pbi");
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

    it("posts proxy-mode starts to /assistant/conversations/start with profile and space", async () => {
        const client = new GenieClient({
            host: "",
            apiBaseUrl: "http://localhost:8787",
            assistantProfile: "default",
            token: "",
            spaceId: "space-1"
        });
        const p = client.startConversation("Hello through proxy");
        lastXhr().resolve(200, { conversation_id: "conv-proxy", message_id: "msg-proxy" });
        const result = await p;
        expect(result).toEqual({ conversationId: "conv-proxy", messageId: "msg-proxy" });
        expect(lastXhr().url).toBe("http://localhost:8787/assistant/conversations/start");
        expect(JSON.parse(lastXhr().body || "{}")).toEqual({
            content: "Hello through proxy",
            assistantProfile: "default",
            spaceId: "space-1"
        });
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

    it("posts proxy-mode follow-ups to the shared assistant route", async () => {
        const client = new GenieClient({
            host: "",
            apiBaseUrl: "http://localhost:8787",
            assistantProfile: "finance",
            token: "",
            spaceId: "space-1"
        });
        const p = client.sendMessage("conv-1", "Follow up");
        lastXhr().resolve(200, { message_id: "msg-100" });
        const result = await p;
        expect(result).toBe("msg-100");
        expect(lastXhr().url).toBe("http://localhost:8787/assistant/conversations/conv-1/messages");
        expect(JSON.parse(lastXhr().body || "{}")).toEqual({
            content: "Follow up",
            assistantProfile: "finance",
            spaceId: "space-1"
        });
    });
});

describe("waitForMessageWithProgress", () => {
    it("parses top-level proxy result fields from the shared assistant poll route", async () => {
        vi.useFakeTimers();
        try {
            const client = new GenieClient({
                host: "",
                apiBaseUrl: "http://localhost:8787",
                assistantProfile: "finance",
                token: "",
                spaceId: "space-1"
            });
            const p = client.waitForMessageWithProgress("conv-1", "msg-1");
            await vi.advanceTimersByTimeAsync(1000);
            lastXhr().resolve(200, {
                id: "msg-1",
                status: "COMPLETED",
                content: "Revenue increased.",
                sqlQuery: "SELECT period, revenue FROM t",
                queryTitle: "Revenue by period",
                queryResult: {
                    columns: ["period", "revenue"],
                    rows: [["Q1", 100], ["Q2", 200]]
                },
                followUpQuestions: ["Why?"]
            });
            const result = await p;
            expect(lastXhr().url).toBe("http://localhost:8787/assistant/conversations/conv-1/messages/msg-1?assistantProfile=finance&spaceId=space-1");
            expect(result.content).toBe("Revenue increased.");
            expect(result.sqlQuery).toBe("SELECT period, revenue FROM t");
            expect(result.queryTitle).toBe("Revenue by period");
            expect(result.queryResult).toEqual({
                columns: ["period", "revenue"],
                rows: [["Q1", 100], ["Q2", 200]]
            });
            expect(result.followUpQuestions).toEqual(["Why?"]);
        } finally {
            vi.useRealTimers();
        }
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
        expect(lastXhr().headers["X-Pulse-Client"]).toBe("pulse-pbi");
    });
});
