import { describe, it, expect } from "vitest";
import {
    esc,
    fmt,
    describeScope,
    buildFullContext,
    buildGenieRequest,
    formatGenieProgress,
    validateAssignedFields,
    getConfigIssues,
    hasValidConnectionEndpoint,
    createUserMessage,
    createMessageMeta,
    buildFeedbackPayload
} from "../visualHelpers";

// Minimal ContextSummary stub
function makeContext(overrides: Record<string, any> = {}): any {
    return {
        hasSelection: false,
        contextText: "[Power BI Context]\n- Region: East",
        dimensions: {},
        dimensionCounts: {},
        measures: {},
        ...overrides
    };
}

// Minimal GenieVisualSettings stub
function makeSettings(overrides: Record<string, any> = {}): any {
    return {
        host: "https://adb-123.azuredatabricks.net",
        apiBaseUrl: "",
        assistantProfile: "",
        proxyKey: "",
        token: "dapi-test",
        spaceId: "space-1",
        genieFields: "",
        domainGuidance: "",
        devMode: false,
        darkMode: false,
        showSql: false,
        ...overrides
    };
}

describe("esc", () => {
    it("escapes ampersands", () => {
        expect(esc("a & b")).toBe("a &amp; b");
    });

    it("escapes less-than and greater-than signs", () => {
        expect(esc("<script>")).toBe("&lt;script&gt;");
    });

    it("escapes greater-than signs", () => {
        expect(esc("x > 1")).toBe("x &gt; 1");
    });

    it("returns unchanged string when no special characters", () => {
        expect(esc("Hello world")).toBe("Hello world");
    });

    it("escapes multiple special characters in one pass", () => {
        expect(esc("<div class=\"a & b\">")).toBe("&lt;div class=\"a &amp; b\"&gt;");
    });
});

describe("fmt", () => {
    it("wraps lines in paragraph tags", () => {
        expect(fmt("line one\nline two")).toBe('<p class="rx-md-p">line one</p><p class="rx-md-p">line two</p>');
    });

    it("converts empty lines to br tags", () => {
        expect(fmt("line one\n\nline two")).toBe('<p class="rx-md-p">line one</p><br /><p class="rx-md-p">line two</p>');
    });

    it("converts **bold** to strong tags inside paragraphs", () => {
        expect(fmt("**important**")).toBe('<p class="rx-md-p"><strong>important</strong></p>');
    });

    it("escapes HTML before applying markup", () => {
        expect(fmt("<b>bold</b>")).toBe('<p class="rx-md-p">&lt;b&gt;bold&lt;/b&gt;</p>');
    });

    it("handles both bold and newline in the same string", () => {
        const result = fmt("**Title**\nBody");
        expect(result).toBe('<p class="rx-md-p"><strong>Title</strong></p><p class="rx-md-p">Body</p>');
    });
});

describe("describeScope", () => {
    it("returns selection label when hasSelection is true", () => {
        const ctx = makeContext({ hasSelection: true });
        expect(describeScope(ctx)).toBe("Current report selection");
    });

    it("returns filtered view label when dimensions are present but no selection", () => {
        const ctx = makeContext({ dimensions: { Region: ["East"] } });
        expect(describeScope(ctx)).toBe("Current filtered view");
    });

    it("returns visible dataset label when no selection and no dimensions", () => {
        const ctx = makeContext({ dimensions: {} });
        expect(describeScope(ctx)).toBe("Visible dataset");
    });
});

describe("buildFullContext", () => {
    it("returns context text alone when no domain guidance is provided", () => {
        const ctx = makeContext({ contextText: "[Power BI Context]\n- Region: East" });
        const result = buildFullContext(ctx, "");
        expect(result).toBe("[Power BI Context]\n- Region: East");
    });

    it("prepends domain guidance separated by a blank line", () => {
        const ctx = makeContext({ contextText: "[Power BI Context]" });
        const result = buildFullContext(ctx, "Focus on European markets.");
        expect(result).toBe("[Domain Context]\nFocus on European markets.\n\n[Power BI Context]");
    });

    it("trims whitespace from domain guidance", () => {
        const ctx = makeContext({ contextText: "[Power BI Context]" });
        const result = buildFullContext(ctx, "  Trim me  ");
        expect(result).toContain("[Domain Context]\nTrim me");
    });
});

describe("buildGenieRequest", () => {
    it("includes the question", () => {
        const result = buildGenieRequest("What are the top products?", "");
        expect(result).toContain("Question: What are the top products?");
    });

    it("includes context when provided", () => {
        const result = buildGenieRequest("Total sales?", "[Power BI Context]\n- Region: East");
        expect(result).toContain("Context:");
        expect(result).toContain("Region: East");
    });

    it("omits context block when context text is empty", () => {
        const result = buildGenieRequest("Total sales?", "");
        expect(result).not.toContain("Context:");
    });

    it("includes instructions header", () => {
        const result = buildGenieRequest("Q?", "");
        expect(result).toContain("[Instructions]");
    });
});

describe("formatGenieProgress", () => {
    it("maps ASKING_AI", () => expect(formatGenieProgress("ASKING_AI")).toBe("Asking AI"));
    it("maps PENDING_WAREHOUSE", () => expect(formatGenieProgress("PENDING_WAREHOUSE")).toBe("Waiting for SQL warehouse"));
    it("maps EXECUTING_QUERY", () => expect(formatGenieProgress("EXECUTING_QUERY")).toBe("Running SQL query"));
    it("maps COMPLETED", () => expect(formatGenieProgress("COMPLETED")).toBe("Completed"));
    it("maps FAILED", () => expect(formatGenieProgress("FAILED")).toBe("Failed"));
    it("maps CANCELLED", () => expect(formatGenieProgress("CANCELLED")).toBe("Cancelled"));
    it("title-cases unknown statuses", () => expect(formatGenieProgress("SOME_NEW_STATUS")).toBe("Some New Status"));
    it("is case-insensitive for known statuses", () => expect(formatGenieProgress("asking_ai")).toBe("Asking AI"));
});

describe("validateAssignedFields", () => {
    it("returns no matches when genieFields is empty", () => {
        const ctx = makeContext({ dimensions: { Region: ["East"] }, measures: { Sales: 100 } });
        const result = validateAssignedFields(ctx, "");
        expect(result.hasConfiguredGenieFields).toBe(false);
        expect(result.matchedFields).toEqual([]);
    });

    it("matches fields case-insensitively with punctuation removed", () => {
        const ctx = makeContext({ dimensions: { "Sub-Category": ["Tech"] } });
        const result = validateAssignedFields(ctx, "Sub-Category");
        expect(result.matchedFields).toContain("Sub-Category");
    });

    it("reports unmatched fields", () => {
        const ctx = makeContext({ dimensions: { Country: ["US"] } });
        const result = validateAssignedFields(ctx, "Region");
        expect(result.missingFields).toContain("Country");
        expect(result.matchedFields).toHaveLength(0);
    });

    it("parses comma-separated genie fields", () => {
        const ctx = makeContext({ dimensions: { Region: ["East"] } });
        const result = validateAssignedFields(ctx, "Region, Segment, Sales");
        expect(result.genieFields).toEqual(["Region", "Segment", "Sales"]);
    });

    it("parses newline-separated genie fields", () => {
        const ctx = makeContext({ dimensions: { Region: ["East"] } });
        const result = validateAssignedFields(ctx, "Region\nSegment");
        expect(result.genieFields).toEqual(["Region", "Segment"]);
    });

    it("sets hasAssignedFields false when no dimensions or measures", () => {
        const ctx = makeContext({ dimensions: {}, measures: {} });
        const result = validateAssignedFields(ctx, "Region");
        expect(result.hasAssignedFields).toBe(false);
    });

    it("sets hasAnyMatch false when no fields match", () => {
        const ctx = makeContext({ dimensions: { City: ["London"] } });
        const result = validateAssignedFields(ctx, "Region");
        expect(result.hasAnyMatch).toBe(false);
    });
});

describe("getConfigIssues", () => {
    it("returns no issues for a fully configured direct-mode setup", () => {
        const issues = getConfigIssues(makeSettings());
        expect(issues).toEqual([]);
    });

    it("reports missing workspace URL when host is empty and no proxy URL", () => {
        const issues = getConfigIssues(makeSettings({ host: "" }));
        expect(issues).toContain("workspace URL");
    });

    it("reports invalid workspace URL when host lacks https", () => {
        // eslint-disable-next-line powerbi-visuals/no-http-string
        const issues = getConfigIssues(makeSettings({ host: "http://my-workspace.net" }));
        expect(issues).toContain("workspace URL with https://");
    });

    it("reports missing token in direct mode when token is empty", () => {
        const issues = getConfigIssues(makeSettings({ token: "" }));
        expect(issues).toContain("access token");
    });

    it("does not require a token when proxy URL is set", () => {
        const issues = getConfigIssues(makeSettings({ apiBaseUrl: "http://localhost:8787", token: "" }));
        expect(issues).not.toContain("access token");
    });

    it("reports missing Genie Space ID or proxy profile", () => {
        const issues = getConfigIssues(makeSettings({ spaceId: "" }));
        expect(issues).toContain("Genie Space ID or proxy profile");
    });

    it("allows proxy mode to rely on a server-side profile space", () => {
        const issues = getConfigIssues(makeSettings({
            apiBaseUrl: "http://localhost:8787",
            assistantProfile: "finance",
            host: "",
            token: "",
            spaceId: ""
        }));
        expect(issues).not.toContain("Genie Space ID or proxy profile");
    });

    it("reports invalid API base URL when set but malformed", () => {
        const issues = getConfigIssues(makeSettings({ apiBaseUrl: "not-a-url" }));
        expect(issues).toContain("API base URL");
    });

    it("accepts localhost http for API base URL", () => {
        const issues = getConfigIssues(makeSettings({ apiBaseUrl: "http://localhost:8787", host: "" }));
        expect(issues).not.toContain("API base URL");
    });
});

describe("hasValidConnectionEndpoint", () => {
    it("returns true for valid workspace URL", () => {
        expect(hasValidConnectionEndpoint(makeSettings())).toBe(true);
    });

    it("returns false for workspace URL without https", () => {
        // eslint-disable-next-line powerbi-visuals/no-http-string
        expect(hasValidConnectionEndpoint(makeSettings({ host: "http://example.net" }))).toBe(false);
    });

    it("returns true when apiBaseUrl is a valid https URL", () => {
        expect(hasValidConnectionEndpoint(makeSettings({ apiBaseUrl: "https://proxy.example.com" }))).toBe(true);
    });

    it("returns true when apiBaseUrl is localhost http", () => {
        expect(hasValidConnectionEndpoint(makeSettings({ apiBaseUrl: "http://localhost:8787" }))).toBe(true);
    });

    it("uses apiBaseUrl over host when both are set", () => {
        const settings = makeSettings({ apiBaseUrl: "http://localhost:8787", host: "not-valid" });
        expect(hasValidConnectionEndpoint(settings)).toBe(true);
    });
});

describe("createUserMessage", () => {
    it("creates a message with user role", () => {
        const msg = createUserMessage("Hello");
        expect(msg.role).toBe("user");
        expect(msg.content).toBe("Hello");
    });

    it("generates an id with the user- prefix", () => {
        const msg = createUserMessage("Hello");
        expect(msg.id).toMatch(/^user-\d+$/);
    });
});

describe("createMessageMeta", () => {
    it("creates a meta object with all required fields", () => {
        const meta = createMessageMeta("conv-1", "msg-1", "Current filtered view", 5, ["step1"], "What is total sales?");
        expect(meta.conversationId).toBe("conv-1");
        expect(meta.messageId).toBe("msg-1");
        expect(meta.scope).toBe("Current filtered view");
        expect(meta.contextLines).toBe(5);
        expect(meta.trace).toEqual(["step1"]);
        expect(meta.question).toBe("What is total sales?");
    });
});

describe("buildFeedbackPayload", () => {
    it("builds a feedback payload from a chat message", () => {
        const message: any = {
            id: "assistant-1",
            role: "assistant",
            content: "Sales are up 10%.",
            sql: "SELECT SUM(sales) FROM orders",
            feedback: { rating: "up", comment: "Great!", submitted: false },
            meta: {
                conversationId: "conv-1",
                messageId: "msg-1",
                scope: "Filtered view",
                contextLines: 3,
                filterCount: 2,
                trace: ["step1"],
                question: "What are total sales?"
            }
        };
        const payload = buildFeedbackPayload(message, "up");
        expect(payload.rating).toBe("up");
        expect(payload.conversationId).toBe("conv-1");
        expect(payload.messageId).toBe("msg-1");
        expect(payload.answer).toBe("Sales are up 10%.");
        expect(payload.sql).toBe("SELECT SUM(sales) FROM orders");
        expect(payload.comment).toBe("Great!");
        expect(payload.question).toBe("What are total sales?");
    });
});
