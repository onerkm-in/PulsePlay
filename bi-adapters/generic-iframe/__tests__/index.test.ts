// bi-adapters/generic-iframe/__tests__/index.test.ts
//
// Conformance + adapter-specific tests for the generic-iframe adapter.
// The conformance harness covers the universal BIAdapter contract; the
// describe blocks below cover iframe-specific behaviour (sandbox attr
// applied, refresh reassigns src, fullscreen wraps the parent element).

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { GenericIframeAdapter } from "../index";
import type { BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = {
    url: "https://example.com/dashboard",
    title: "Example dashboard",
};

runAdapterConformance("GenericIframeAdapter", {
    factory: () => new GenericIframeAdapter(),
    validConfig: VALID_CONFIG,
});

// ── Adapter-specific tests ────────────────────────────────────────────────
describe("GenericIframeAdapter — iframe behaviour", () => {
    let containerEl: HTMLElement;

    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
    });

    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test("mount() injects an iframe with the configured URL", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const iframe = containerEl.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe!.src).toBe("https://example.com/dashboard");
    });

    test("default sandbox attribute is the documented loose-but-safe set", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const iframe = containerEl.querySelector("iframe")!;
        const sandbox = iframe.getAttribute("sandbox") || "";
        expect(sandbox).toContain("allow-scripts");
        expect(sandbox).toContain("allow-same-origin");
        expect(sandbox).toContain("allow-forms");
        expect(sandbox).toContain("allow-popups");
    });

    test("sandbox override is honoured when supplied", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, { ...VALID_CONFIG, sandbox: "allow-scripts" });
        const iframe = containerEl.querySelector("iframe")!;
        expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    });

    test("mount throws when url is missing", async () => {
        const a = new GenericIframeAdapter();
        await expect(a.mount(containerEl, {} as BIEmbedConfig)).rejects.toThrow(/url/);
    });

    test("refresh re-assigns the iframe src (forcing a reload)", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const iframe = containerEl.querySelector("iframe")!;
        // Spy on src writes via a property descriptor so the round-trip
        // (assign about:blank, then assign back) is observable.
        const writes: string[] = [];
        const srcDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")
            ?? Object.getOwnPropertyDescriptor(window.HTMLIFrameElement.prototype, "src");
        const originalSet = srcDesc?.set;
        Object.defineProperty(iframe, "src", {
            configurable: true,
            get: srcDesc?.get,
            set(value: string) {
                writes.push(value);
                originalSet?.call(this, value);
            },
        });
        await a.send({ kind: "refresh" });
        expect(writes).toContain("about:blank");
        expect(writes[writes.length - 1]).toBe("https://example.com/dashboard");
    });

    test("destroy() removes the iframe from the container", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        expect(containerEl.querySelector("iframe")).not.toBeNull();
        a.destroy();
        expect(containerEl.querySelector("iframe")).toBeNull();
    });

    test("listener errors do not break subsequent dispatches", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        let okCalls = 0;
        a.on("loaded", () => { throw new Error("first handler explodes"); });
        a.on("loaded", () => { okCalls++; });
        const iframe = containerEl.querySelector("iframe")!;
        // Simulate the iframe finishing its initial load.
        iframe.dispatchEvent(new Event("load"));
        expect(okCalls).toBe(1);
    });

    // ── getMetadata() defensive null contract ──────────────────────────
    //
    // Iframe-only adapters cannot introspect what the user is looking at.
    // The defensive null return is explicit (not "method absent") so:
    //   1. TypeScript discovers the method on GenericIframeAdapter
    //      subclasses without needing each subclass to declare it.
    //   2. The AISidebar discovery effect's `typeof adapter.getMetadata
    //      === "function"` check still passes; the null result then flows
    //      to Discovery Loop which falls back to pack-only signals.
    //   3. Future vendor SDK graduations override this with a real impl.
    test("getMetadata() returns null even before mount", async () => {
        const a = new GenericIframeAdapter();
        expect(await a.getMetadata()).toBeNull();
    });

    test("getMetadata() still returns null after a successful mount", async () => {
        const a = new GenericIframeAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        expect(await a.getMetadata()).toBeNull();
    });
});
