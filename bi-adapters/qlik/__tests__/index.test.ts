// bi-adapters/qlik/__tests__/index.test.ts
//
// Stub-level smoke + sandbox-posture lock-in for the Qlik Sense adapter.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { QlikAdapter } from "../index";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = { url: "https://qlik.example.com/sense/app/app-guid/sheet/sheet-guid" };

runAdapterConformance("QlikAdapter", {
    factory: () => new QlikAdapter(),
    validConfig: VALID_CONFIG,
});

describe("QlikAdapter — sandbox posture", () => {
    let containerEl: HTMLElement;
    beforeEach(() => { containerEl = document.createElement("div"); document.body.appendChild(containerEl); });
    afterEach(() => { if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl); });

    test("vendor / displayName are qlik-flavoured", () => {
        const a = new QlikAdapter();
        expect(a.vendor).toBe("qlik");
        expect(a.displayName).toBe("Qlik Sense");
    });

    test("default sandbox is narrowed to scripts + same-origin only", async () => {
        const a = new QlikAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const sandbox = containerEl.querySelector("iframe")!.getAttribute("sandbox") || "";
        expect(sandbox).toBe("allow-scripts allow-same-origin");
        expect(sandbox).not.toContain("allow-forms");
        expect(sandbox).not.toContain("allow-popups");
        expect(sandbox).not.toContain("allow-top-navigation");
    });
});
