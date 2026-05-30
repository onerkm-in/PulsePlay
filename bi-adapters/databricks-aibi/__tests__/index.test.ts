// bi-adapters/databricks-aibi/__tests__/index.test.ts
//
// Smoke + URL-construction + sandbox-posture lock-in for the Databricks
// AI/BI Dashboards adapter. v0 path is iframe-via-published-share-URL.
// v1 will swap to the @databricks/aibi-client SDK; until then the URL
// construction is the only meaningfully vendor-specific surface.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabricksAibiAdapter, buildAibiEmbedUrl } from "../index";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = {
    url: "https://adb-1234.5.azuredatabricks.net/embed/dashboardsv3/abc-uuid?o=1234567890"
} as BIEmbedConfig;

runAdapterConformance("DatabricksAibiAdapter", {
    factory: () => new DatabricksAibiAdapter(),
    validConfig: VALID_CONFIG,
});

describe("DatabricksAibiAdapter — vendor identity", () => {
    test("vendor + displayName are Databricks AI/BI flavoured", () => {
        const a = new DatabricksAibiAdapter();
        expect(a.vendor).toBe("databricks-aibi");
        expect(a.displayName).toBe("Databricks AI/BI");
    });
});

describe("buildAibiEmbedUrl — URL construction", () => {
    test("pre-built url wins when provided", () => {
        const built = buildAibiEmbedUrl({ url: "https://x.example/y" } as any);
        expect(built).toBe("https://x.example/y");
    });

    test("constructs published share URL from workspaceUrl + dashboardId + orgId", () => {
        const built = buildAibiEmbedUrl({
            workspaceUrl: "https://adb-1234.5.azuredatabricks.net",
            dashboardId: "abc-uuid",
            orgId: "1234567890",
        } as any);
        expect(built).toBe("https://adb-1234.5.azuredatabricks.net/embed/dashboardsv3/abc-uuid?o=1234567890");
    });

    test("orgId is optional", () => {
        const built = buildAibiEmbedUrl({
            workspaceUrl: "https://adb-1234.5.azuredatabricks.net",
            dashboardId: "abc-uuid",
        } as any);
        expect(built).toBe("https://adb-1234.5.azuredatabricks.net/embed/dashboardsv3/abc-uuid");
    });

    test("trailing slash on workspaceUrl is normalized", () => {
        const built = buildAibiEmbedUrl({
            workspaceUrl: "https://adb-1234.5.azuredatabricks.net/",
            dashboardId: "abc-uuid",
        } as any);
        expect(built).toBe("https://adb-1234.5.azuredatabricks.net/embed/dashboardsv3/abc-uuid");
    });

    test("dashboardId is URI-encoded (defense for malformed IDs)", () => {
        const built = buildAibiEmbedUrl({
            workspaceUrl: "https://w.example",
            dashboardId: "abc/def",
        } as any);
        expect(built).toBe("https://w.example/embed/dashboardsv3/abc%2Fdef");
    });

    test("missing workspaceUrl or dashboardId throws EMBED_FAILED", () => {
        expect(() => buildAibiEmbedUrl({} as any)).toThrow(/EMBED_FAILED/);
        expect(() => buildAibiEmbedUrl({ workspaceUrl: "https://w.example" } as any)).toThrow(/EMBED_FAILED/);
        expect(() => buildAibiEmbedUrl({ dashboardId: "abc" } as any)).toThrow(/EMBED_FAILED/);
    });
});

describe("DatabricksAibiAdapter — mount uses constructed URL", () => {
    let containerEl: HTMLElement;
    beforeEach(() => { containerEl = document.createElement("div"); document.body.appendChild(containerEl); });
    afterEach(() => { if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl); });

    test("mounts with workspaceUrl + dashboardId, builds URL into iframe.src", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            workspaceUrl: "https://adb-1234.5.azuredatabricks.net",
            dashboardId: "abc-uuid",
            orgId: "1234567890",
        } as any);
        const iframe = containerEl.querySelector("iframe")!;
        expect(iframe.src).toBe("https://adb-1234.5.azuredatabricks.net/embed/dashboardsv3/abc-uuid?o=1234567890");
    });

    test("default sandbox includes scripts + same-origin + forms + popups", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const sandbox = containerEl.querySelector("iframe")!.getAttribute("sandbox") || "";
        expect(sandbox).toContain("allow-scripts");
        expect(sandbox).toContain("allow-same-origin");
        expect(sandbox).toContain("allow-forms");
        expect(sandbox).toContain("allow-popups");
        // Negative — must NOT include top-navigation by default.
        expect(sandbox).not.toContain("allow-top-navigation");
    });
});

// ── SDK path — dynamic @databricks/aibi-client import is mocked ──────────
//
// The adapter takes the SDK path when token + workspaceUrl/instanceUrl +
// workspaceId + dashboardId are all present. We mock the dynamic import so
// we never depend on the real package being installed.

vi.mock("@databricks/aibi-client", () => {
    class DatabricksDashboard {
        public args: Record<string, unknown>;
        public initialized = false;
        public destroyed = false;
        public disposed = false;
        constructor(args: Record<string, unknown>) {
            this.args = args;
            (globalThis as any).__lastAibiDashboard = this;
            (globalThis as any).__aibiCtorCount = ((globalThis as any).__aibiCtorCount || 0) + 1;
        }
        async initialize() { this.initialized = true; }
        destroy() { this.destroyed = true; }
        dispose() { this.disposed = true; }
    }
    return { DatabricksDashboard };
});

describe("DatabricksAibiAdapter — SDK path (mocked @databricks/aibi-client)", () => {
    let containerEl: HTMLElement;
    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
        (globalThis as any).__lastAibiDashboard = null;
        (globalThis as any).__aibiCtorCount = 0;
    });
    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test("uses SDK when token + workspaceId + dashboardId + instanceUrl all present", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            instanceUrl: "https://adb-1.azuredatabricks.net",
            workspaceId: "1234567890",
            dashboardId: "abc",
            token: "tkn",
            hideDatabricksLogo: true,
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        expect(dash).not.toBeNull();
        expect(dash.initialized).toBe(true);
        expect(dash.args.instanceUrl).toBe("https://adb-1.azuredatabricks.net");
        expect(dash.args.workspaceId).toBe("1234567890");
        expect(dash.args.dashboardId).toBe("abc");
        expect(dash.args.token).toBe("tkn");
        expect(dash.args.container).toBeInstanceOf(HTMLDivElement);
        // hideDatabricksLogo threaded through config object
        expect((dash.args.config as { hideDatabricksLogo: boolean }).hideDatabricksLogo).toBe(true);
        // No fallback iframe rendered when SDK path takes over
        expect(containerEl.querySelector("iframe")).toBeNull();
        // SDK container is mounted inside the host container
        expect(containerEl.firstElementChild).toBeInstanceOf(HTMLDivElement);
    });

    test("accessToken alias also triggers SDK path", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            instanceUrl: "https://adb-1.azuredatabricks.net",
            workspaceId: "ws1",
            dashboardId: "d1",
            accessToken: "from-alias",
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        expect(dash.args.token).toBe("from-alias");
    });

    test("workspaceUrl fallback used when instanceUrl absent", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            workspaceUrl: "https://adb-2.azuredatabricks.net",
            workspaceId: "ws2",
            dashboardId: "d2",
            token: "t",
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        expect(dash.args.instanceUrl).toBe("https://adb-2.azuredatabricks.net");
    });

    test("hideDatabricksLogo defaults to false when not provided", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            instanceUrl: "https://adb.example",
            workspaceId: "w",
            dashboardId: "d",
            token: "t",
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        expect((dash.args.config as { hideDatabricksLogo: boolean }).hideDatabricksLogo).toBe(false);
    });

    test("missing token → SDK path skipped, iframe fallback used", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            workspaceUrl: "https://adb.example",
            workspaceId: "w",
            dashboardId: "d",
        } as any);
        expect((globalThis as any).__aibiCtorCount).toBe(0);
        expect(containerEl.querySelector("iframe")).not.toBeNull();
    });

    test("missing workspaceId → SDK path skipped, iframe fallback used", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            workspaceUrl: "https://adb.example",
            dashboardId: "d",
            token: "t",
        } as any);
        expect((globalThis as any).__aibiCtorCount).toBe(0);
        expect(containerEl.querySelector("iframe")).not.toBeNull();
    });

    test("destroy calls both .destroy() and .dispose() on the SDK dashboard", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            instanceUrl: "https://adb.example",
            workspaceId: "w",
            dashboardId: "d",
            token: "t",
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        a.destroy();
        expect(dash.destroyed).toBe(true);
        expect(dash.disposed).toBe(true);
        // SDK container removed from host
        expect(containerEl.firstElementChild).toBeNull();
    });

    test("destroy swallows errors thrown by SDK destroy/dispose", async () => {
        const a = new DatabricksAibiAdapter();
        await a.mount(containerEl, {
            instanceUrl: "https://adb.example",
            workspaceId: "w",
            dashboardId: "d",
            token: "t",
        } as any);
        const dash = (globalThis as any).__lastAibiDashboard;
        dash.destroy = () => { throw new Error("boom-destroy"); };
        dash.dispose = () => { throw new Error("boom-dispose"); };
        expect(() => a.destroy()).not.toThrow();
    });
});

describe("DatabricksAibiAdapter — SDK fallback semantics", () => {
    let containerEl: HTMLElement;
    beforeEach(() => { containerEl = document.createElement("div"); document.body.appendChild(containerEl); });
    afterEach(() => { if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl); });

    test("when SDK token+ids are absent and no fallback URL fields are set, mount throws EMBED_FAILED via buildAibiEmbedUrl", async () => {
        const a = new DatabricksAibiAdapter();
        await expect(a.mount(containerEl, {
            dashboardId: "d-only",
        } as any)).rejects.toThrow(/EMBED_FAILED/);
    });
});
