// bi-adapters/looker/__tests__/index.test.ts
//
// Stub-level smoke + sandbox-posture lock-in for the Looker adapter.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { LookerAdapter } from "../index";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = { url: "https://looker.example.com/embed/dashboards/42" };

runAdapterConformance("LookerAdapter", {
    factory: () => new LookerAdapter(),
    validConfig: VALID_CONFIG,
});

describe("LookerAdapter — sandbox posture", () => {
    let containerEl: HTMLElement;
    beforeEach(() => { containerEl = document.createElement("div"); document.body.appendChild(containerEl); });
    afterEach(() => { if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl); });

    test("vendor / displayName are looker-flavoured", () => {
        const a = new LookerAdapter();
        expect(a.vendor).toBe("looker");
        expect(a.displayName).toBe("Looker");
    });

    test("default sandbox is narrowed to scripts + same-origin only", async () => {
        const a = new LookerAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const sandbox = containerEl.querySelector("iframe")!.getAttribute("sandbox") || "";
        expect(sandbox).toBe("allow-scripts allow-same-origin");
        expect(sandbox).not.toContain("allow-forms");
        expect(sandbox).not.toContain("allow-popups");
        expect(sandbox).not.toContain("allow-top-navigation");
    });
});
