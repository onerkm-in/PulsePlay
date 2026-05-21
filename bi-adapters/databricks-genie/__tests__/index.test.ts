import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { DatabricksGenieAdapter, buildGenieEmbedUrl } from "../index";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";

const VALID_CONFIG: BIEmbedConfig = {
    url: "https://adb-1234.5.azuredatabricks.net/genie/embed/example-space",
};

runAdapterConformance("DatabricksGenieAdapter", {
    factory: () => new DatabricksGenieAdapter(),
    validConfig: VALID_CONFIG,
});

describe("buildGenieEmbedUrl", () => {
    test("uses a direct url", () => {
        expect(buildGenieEmbedUrl({ url: "https://workspace/genie/embed/space" })).toBe("https://workspace/genie/embed/space");
    });

    test("extracts src from iframe code", () => {
        expect(buildGenieEmbedUrl({
            iframe: '<iframe src="https://workspace/genie/embed/space?x=1&amp;y=2" allow="clipboard-write"></iframe>',
        })).toBe("https://workspace/genie/embed/space?x=1&y=2");
    });

    test("accepts legacy Quick Setup iframeHtml configs", () => {
        expect(buildGenieEmbedUrl({
            iframeHtml: '<iframe src="https://workspace/genie/embed/legacy-space"></iframe>',
        })).toBe("https://workspace/genie/embed/legacy-space");
    });

    test("requires a Databricks-generated iframe src unless an explicit embedPath is provided", () => {
        expect(() => buildGenieEmbedUrl({ workspaceUrl: "https://workspace", spaceId: "space" })).toThrow(/EMBED_FAILED/);
    });

    test("constructs URL from workspaceUrl + spaceId + embedPath, encoding spaceId", () => {
        const url = buildGenieEmbedUrl({
            workspaceUrl: "https://adb.example.net/",
            spaceId: "abc/space",
            embedPath: "/embedded/genie/space-{spaceId}",
        });
        expect(url).toBe("https://adb.example.net/embedded/genie/space-abc%2Fspace");
    });

    test("embedPath without leading slash is normalized", () => {
        const url = buildGenieEmbedUrl({
            workspaceUrl: "https://adb.example.net",
            spaceId: "s1",
            embedPath: "embedded/genie/{spaceId}",
        });
        expect(url).toBe("https://adb.example.net/embedded/genie/s1");
    });

    test("trailing slashes on workspaceUrl are stripped before embedPath join", () => {
        const url = buildGenieEmbedUrl({
            workspaceUrl: "https://adb.example.net///",
            spaceId: "s1",
            embedPath: "/genie/{spaceId}",
        });
        expect(url).toBe("https://adb.example.net/genie/s1");
    });

    test("extracts src from iframe code with single quotes", () => {
        const url = buildGenieEmbedUrl({
            iframe: "<iframe src='https://workspace/genie/space-1' allow='clipboard-write'></iframe>",
        });
        expect(url).toBe("https://workspace/genie/space-1");
    });

    test("extracts src case-insensitively (SRC=...)", () => {
        const url = buildGenieEmbedUrl({
            iframe: '<iframe SRC="https://workspace/genie/space-2"></iframe>',
        });
        expect(url).toBe("https://workspace/genie/space-2");
    });

    test("decodes &amp; sequences so query strings are usable", () => {
        const url = buildGenieEmbedUrl({
            url: "https://workspace/genie/space?a=1&amp;b=2&amp;c=3",
        });
        expect(url).toBe("https://workspace/genie/space?a=1&b=2&c=3");
    });

    test("url takes precedence over iframe when both supplied", () => {
        const url = buildGenieEmbedUrl({
            url: "https://primary.example/space",
            iframe: '<iframe src="https://secondary.example/space"></iframe>',
        });
        expect(url).toBe("https://primary.example/space");
    });

    test("whitespace-only url short-circuits before iframe fallback (current contract)", () => {
        // Honest behaviour: `cfg.url || cfg.iframe` picks the whitespace url, then
        // `.trim()` returns empty → falls through to the structured-config branch
        // and throws. Locks the contract; a future "skip falsy/blank url" refactor
        // would be an explicit change.
        expect(() => buildGenieEmbedUrl({
            url: "   ",
            iframe: '<iframe src="https://fallback.example/space"></iframe>',
        })).toThrow(/EMBED_FAILED/);
    });

    test("iframe without a src attribute falls back to the raw input (trimmed)", () => {
        // Honest behaviour: when no src= is present, the helper trims and
        // returns whatever was passed. This locks the current contract so a
        // future "throw on missing src" refactor is an explicit choice.
        const url = buildGenieEmbedUrl({ url: "  https://raw.example/space  " });
        expect(url).toBe("https://raw.example/space");
    });

    test("missing src + missing workspaceUrl/spaceId/embedPath throws with actionable copy", () => {
        expect(() => buildGenieEmbedUrl({})).toThrow(/EMBED_FAILED/);
        expect(() => buildGenieEmbedUrl({})).toThrow(/iframe src\/code/);
    });

    test("partial structured config (missing spaceId) still throws", () => {
        expect(() => buildGenieEmbedUrl({
            workspaceUrl: "https://w",
            embedPath: "/g/{spaceId}",
        })).toThrow(/EMBED_FAILED/);
    });
});

describe("DatabricksGenieAdapter", () => {
    let containerEl: HTMLElement;

    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
    });

    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test("mount sets clipboard allow attribute for Genie copy actions", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        expect(containerEl.querySelector("iframe")?.getAttribute("allow")).toBe("clipboard-write");
    });

    test("vendor identity is databricks-genie", () => {
        const adapter = new DatabricksGenieAdapter();
        expect(adapter.vendor).toBe("databricks-genie");
        expect(adapter.displayName).toBe("Databricks Genie");
    });

    test("mount applies the narrowed default sandbox (no allow-* escape hatches beyond scripts/same-origin/forms/popups)", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        const sandbox = containerEl.querySelector("iframe")?.getAttribute("sandbox") || "";
        expect(sandbox).toBe("allow-scripts allow-same-origin allow-forms allow-popups");
        // Explicit deny-list spot checks — these must not silently appear.
        expect(sandbox).not.toMatch(/allow-top-navigation/);
        expect(sandbox).not.toMatch(/allow-modals/);
        expect(sandbox).not.toMatch(/allow-storage-access-by-user-activation/);
        expect(sandbox).not.toMatch(/allow-orientation-lock/);
        expect(sandbox).not.toMatch(/allow-pointer-lock/);
    });

    test("per-mount cfg.sandbox overrides the vendor default", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, {
            ...VALID_CONFIG,
            sandbox: "allow-scripts",
        } as unknown as BIEmbedConfig);
        expect(containerEl.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
    });

    test("mount uses constructed URL from iframe-html src + decodes &amp;", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, {
            iframe: '<iframe src="https://workspace/genie/embed/s1?x=1&amp;y=2"></iframe>',
        } as unknown as BIEmbedConfig);
        expect(containerEl.querySelector("iframe")?.getAttribute("src"))
            .toBe("https://workspace/genie/embed/s1?x=1&y=2");
    });

    test("mount applies custom title when provided, default otherwise", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        expect(containerEl.querySelector("iframe")?.getAttribute("title")).toBe("Databricks Genie Space");

        adapter.destroy();
        const adapter2 = new DatabricksGenieAdapter();
        await adapter2.mount(containerEl, {
            ...VALID_CONFIG,
            title: "Sales Genie Room",
        } as unknown as BIEmbedConfig);
        expect(containerEl.querySelector("iframe")?.getAttribute("title")).toBe("Sales Genie Room");
    });

    test("mount enforces allowedOrigins (inherited from GenericIframeAdapter L2 gate)", async () => {
        const adapter = new DatabricksGenieAdapter();
        await expect(adapter.mount(containerEl, {
            url: "https://attacker.example/genie/s1",
            allowedOrigins: ["adb-1234.5.azuredatabricks.net"],
        } as unknown as BIEmbedConfig)).rejects.toThrow(/EMBED_FAILED/);
    });

    test("mount with allowedOrigins succeeds when iframe host is in the list", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, {
            url: "https://adb-1234.5.azuredatabricks.net/genie/embed/space",
            allowedOrigins: ["adb-1234.5.azuredatabricks.net"],
        } as unknown as BIEmbedConfig);
        expect(containerEl.querySelector("iframe")).not.toBeNull();
    });

    test("mount throws EMBED_FAILED when neither iframe nor url nor structured config supplied", async () => {
        const adapter = new DatabricksGenieAdapter();
        await expect(adapter.mount(containerEl, {} as BIEmbedConfig))
            .rejects.toThrow(/EMBED_FAILED/);
    });

    test("destroy removes the iframe and unmounts cleanly", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        expect(containerEl.querySelector("iframe")).not.toBeNull();
        adapter.destroy();
        expect(containerEl.querySelector("iframe")).toBeNull();
    });

    test("destroy is idempotent", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        adapter.destroy();
        expect(() => adapter.destroy()).not.toThrow();
    });

    test("remount after destroy works", async () => {
        const adapter = new DatabricksGenieAdapter();
        await adapter.mount(containerEl, VALID_CONFIG);
        adapter.destroy();
        await adapter.mount(containerEl, {
            url: "https://adb.example.net/genie/embed/space-2",
        } as unknown as BIEmbedConfig);
        expect(containerEl.querySelector("iframe")?.getAttribute("src"))
            .toBe("https://adb.example.net/genie/embed/space-2");
    });
});
