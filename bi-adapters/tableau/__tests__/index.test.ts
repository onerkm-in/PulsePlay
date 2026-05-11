// bi-adapters/tableau/__tests__/index.test.ts
//
// Stub-level smoke + sandbox-posture lock-in. The TableauAdapter currently
// extends GenericIframeAdapter; v1 will swap to the Tableau Embedding API
// v3 web component. Until then, the only thing meaningfully vendor-specific
// is the narrower iframe sandbox attribute — and that IS a security
// posture statement worth pinning with a test so a careless edit can't
// silently re-open `allow-forms` / `allow-popups` for read-only embeds.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TableauAdapter } from "../index";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = { url: "https://tableau.example.com/views/Dashboard" };

runAdapterConformance("TableauAdapter", {
    factory: () => new TableauAdapter(),
    validConfig: VALID_CONFIG,
});

describe("TableauAdapter — sandbox posture", () => {
    let containerEl: HTMLElement;
    beforeEach(() => { containerEl = document.createElement("div"); document.body.appendChild(containerEl); });
    afterEach(() => { if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl); });

    test("vendor / displayName are tableau-flavoured", () => {
        const a = new TableauAdapter();
        expect(a.vendor).toBe("tableau");
        expect(a.displayName).toBe("Tableau");
    });

    test("default sandbox is narrowed to scripts + same-origin only", async () => {
        const a = new TableauAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const sandbox = containerEl.querySelector("iframe")!.getAttribute("sandbox") || "";
        expect(sandbox).toBe("allow-scripts allow-same-origin");
        // Negative assertions — deployments that need these must opt in
        // explicitly via cfg.sandbox; they must NOT be the default.
        expect(sandbox).not.toContain("allow-forms");
        expect(sandbox).not.toContain("allow-popups");
        expect(sandbox).not.toContain("allow-top-navigation");
    });

    test("per-mount cfg.sandbox override wins over the default", async () => {
        const a = new TableauAdapter();
        await a.mount(containerEl, { ...VALID_CONFIG, sandbox: "allow-scripts allow-same-origin allow-popups" });
        const sandbox = containerEl.querySelector("iframe")!.getAttribute("sandbox") || "";
        expect(sandbox).toContain("allow-popups");
    });
});
