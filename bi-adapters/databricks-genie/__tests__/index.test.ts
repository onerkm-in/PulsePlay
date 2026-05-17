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

    test("requires a Databricks-generated iframe src unless an explicit embedPath is provided", () => {
        expect(() => buildGenieEmbedUrl({ workspaceUrl: "https://workspace", spaceId: "space" })).toThrow(/EMBED_FAILED/);
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
});
