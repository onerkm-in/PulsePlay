// bi-adapters/generic-iframe/__tests__/allowlist.test.ts
//
// L2 closure tests — `mount()` must refuse any URL whose hostname is not
// in `allowedOrigins`. BIPanel performs the same check before calling
// mount; this is the lower-layer gate so callers that bypass BIPanel still
// hit it.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GenericIframeAdapter, assertIframeOriginAllowed } from "../index";

describe("assertIframeOriginAllowed", () => {
    it("is a no-op when allowedOrigins is undefined", () => {
        expect(() => assertIframeOriginAllowed("https://attacker.example", undefined)).not.toThrow();
    });

    it("is a no-op when allowedOrigins is empty", () => {
        expect(() => assertIframeOriginAllowed("https://attacker.example", [])).not.toThrow();
    });

    it("throws on non-URL inputs", () => {
        expect(() => assertIframeOriginAllowed("not-a-url", ["example.com"])).toThrow(/not a valid URL/);
    });

    it("throws when hostname is not in the list", () => {
        expect(() => assertIframeOriginAllowed("https://attacker.example/path", ["allowed.example"]))
            .toThrow(/not in your organization's allowed origins/);
    });

    it("accepts a hostname present in the list (case-insensitive)", () => {
        expect(() => assertIframeOriginAllowed("https://ALLOWED.example/foo", ["allowed.example"])).not.toThrow();
    });
});

describe("GenericIframeAdapter.mount — allowlist enforcement", () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it("refuses to mount when hostname is outside allowedOrigins", async () => {
        const adapter = new GenericIframeAdapter();
        await expect(
            adapter.mount(container, {
                url: "https://attacker.example/report",
                allowedOrigins: ["public.tableau.com"],
            }),
        ).rejects.toThrow(/not in your organization's allowed origins/);
        expect(container.querySelector("iframe")).toBeNull();
    });

    it("mounts normally when hostname is in allowedOrigins", async () => {
        const adapter = new GenericIframeAdapter();
        await adapter.mount(container, {
            url: "https://public.tableau.com/view",
            allowedOrigins: ["public.tableau.com"],
        });
        expect(container.querySelector("iframe")).not.toBeNull();
        adapter.destroy();
    });

    it("mounts when no allowlist is specified (backward compatible)", async () => {
        const adapter = new GenericIframeAdapter();
        await adapter.mount(container, { url: "https://any.example/view" });
        expect(container.querySelector("iframe")).not.toBeNull();
        adapter.destroy();
    });
});
