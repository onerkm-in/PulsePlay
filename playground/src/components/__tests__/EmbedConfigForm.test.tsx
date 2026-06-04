// playground/src/components/__tests__/EmbedConfigForm.test.tsx
//
// Security-posture tests for the Power BI setup form. The proxy is the
// authority for embed-token policy; these tests keep the UI from encouraging
// unsafe defaults.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type React from "react";
import { EmbedConfigForm, isPowerBISecureEmbedUrl } from "../EmbedConfigForm";
import type { BIEmbedConfig } from "../../biPanel/BIAdapter";

// B5 — strict host validation. endsWith("powerbi.com") accepted sibling /
// look-alike domains; the check must require an exact host or a dot-boundary
// subdomain so only *.powerbi.com (and powerbi.com itself) pass.
describe("isPowerBISecureEmbedUrl — strict host (B5)", () => {
    it("accepts legitimate Power BI hosts over https with /reportEmbed", () => {
        expect(isPowerBISecureEmbedUrl("https://app.powerbi.com/reportEmbed?reportId=abc")).toBe(true);
        expect(isPowerBISecureEmbedUrl("https://app.high.powerbi.com/reportEmbed")).toBe(true);
        expect(isPowerBISecureEmbedUrl("https://powerbi.com/reportEmbed")).toBe(true);
    });
    it("REJECTS sibling / look-alike domains (the bypass)", () => {
        expect(isPowerBISecureEmbedUrl("https://evil-powerbi.com/reportEmbed")).toBe(false);
        expect(isPowerBISecureEmbedUrl("https://powerbi.com.evil.com/reportEmbed")).toBe(false);
        expect(isPowerBISecureEmbedUrl("https://notpowerbi.com/reportEmbed")).toBe(false);
        expect(isPowerBISecureEmbedUrl("https://fakepowerbi.com/reportEmbed")).toBe(false);
    });
    it("REJECTS non-https and wrong-path even on a real host", () => {
        expect(isPowerBISecureEmbedUrl("http://app.powerbi.com/reportEmbed")).toBe(false);
        expect(isPowerBISecureEmbedUrl("https://app.powerbi.com/maliciousPath")).toBe(false);
        expect(isPowerBISecureEmbedUrl("not a url")).toBe(false);
    });
});

interface MountState {
    container: HTMLElement;
    root: Root;
    onChange: ReturnType<typeof vi.fn>;
}

function mount(value: BIEmbedConfig = {}): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const ui: React.ReactNode = (
        <EmbedConfigForm
            vendor="powerbi"
            value={value}
            onChange={onChange}
            assistantProfile="pbitest"
        />
    );
    act(() => { root.render(ui); });
    return { container, root, onChange };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

function changeSelect(select: HTMLSelectElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
    )?.set;
    act(() => {
        nativeSetter?.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

describe("EmbedConfigForm — Power BI security posture", () => {
    it("hides manual token paste mode unless the dev flag enables it", () => {
        const state = mount();
        const mode = state.container.querySelector("#pp-pbi-mode") as HTMLSelectElement;
        expect(mode).toBeTruthy();
        const values = [...mode.options].map(option => option.value);
        expect(values).toEqual(["secure", "sso", "backend"]);
        unmount(state);
    });

    it("keeps backend-issued tokens View-only in the UI", () => {
        const state = mount();
        const mode = state.container.querySelector("#pp-pbi-mode") as HTMLSelectElement;
        changeSelect(mode, "backend");

        const perms = state.container.querySelector("#pp-pbi-perms") as HTMLSelectElement;
        expect(perms).toBeTruthy();
        expect(perms.value).toBe("View");
        const edit = perms.querySelector('option[value="Edit"]') as HTMLOptionElement;
        expect(edit.disabled).toBe(true);

        changeSelect(perms, "Edit");
        expect(perms.value).toBe("View");
        unmount(state);
    });
});
