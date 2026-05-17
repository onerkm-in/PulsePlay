// bi-adapters/databricks-aibi/__tests__/index.test.ts
//
// Smoke + URL-construction + sandbox-posture lock-in for the Databricks
// AI/BI Dashboards adapter. v0 path is iframe-via-published-share-URL.
// v1 will swap to the @databricks/aibi-client SDK; until then the URL
// construction is the only meaningfully vendor-specific surface.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
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
