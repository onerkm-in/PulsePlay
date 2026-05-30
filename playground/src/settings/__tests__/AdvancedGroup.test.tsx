// playground/src/settings/__tests__/AdvancedGroup.test.tsx
//
// Phase 5 — type-to-confirm gates for the destructive actions in the
// Advanced group. We test the localStorage clear paths; the MSAL sign-out
// path is covered indirectly (signOutPbi is mocked off via the import not
// being invoked unless the button is clicked).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../settingsStore";
import { AdvancedGroup } from "../groups/AdvancedGroup";
import type { PulsePlayAllowlist } from "../../types/allowlist";

const MVP_ALLOWLIST: PulsePlayAllowlist = {
    configured: true,
    biProviders: ["powerbi"],
    embedOrigins: { powerbi: ["app.powerbi.com"] },
    aadTenants: ["org-tenant"],
    aiProfiles: ["default"],
    packs: ["cpg-fmcg"],
    enforcement: "strict",
};

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                <AdvancedGroup />
            </SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

function typeInto(input: HTMLInputElement, text: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeSetter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

describe("AdvancedGroup — type-to-confirm gates", () => {
    it("Reset all is disabled until the user types 'Reset all'", async () => {
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        window.localStorage.setItem("pulseplay:ui-mode", "pulse");
        const state = mount();
        await act(async () => { await Promise.resolve(); });

        const inputs = Array.from(state.container.querySelectorAll<HTMLInputElement>('input[type="text"]'));
        const resetAllInput = inputs.find(i => i.getAttribute("aria-label") === "Type Reset all to confirm");
        expect(resetAllInput).toBeDefined();

        const resetAllBtn = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(b => (b.textContent || "").trim() === "Clear all PulsePlay settings");
        expect(resetAllBtn).toBeDefined();
        expect(resetAllBtn!.disabled).toBe(true);

        // Type the wrong thing → button stays disabled.
        await act(async () => { typeInto(resetAllInput!, "Reset something"); });
        expect(resetAllBtn!.disabled).toBe(true);

        // Type the right thing → button enables.
        await act(async () => { typeInto(resetAllInput!, "Reset all"); });
        expect(resetAllBtn!.disabled).toBe(false);
        unmount(state);
    });

    it("Reset all clears every pulseplay:* localStorage key when confirmed", async () => {
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        window.localStorage.setItem("pulseplay:ui-mode", "pulse");
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        window.localStorage.setItem("non-pulseplay-key", "kept");

        const state = mount();
        await act(async () => { await Promise.resolve(); });

        const resetAllInput = Array.from(state.container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
            .find(i => i.getAttribute("aria-label") === "Type Reset all to confirm")!;
        const resetAllBtn = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(b => (b.textContent || "").trim() === "Clear all PulsePlay settings")!;

        await act(async () => { typeInto(resetAllInput, "Reset all"); });
        await act(async () => {
            resetAllBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBeNull();
        expect(window.localStorage.getItem("pulseplay:ui-mode")).toBeNull();
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBeNull();
        // Non-PulsePlay keys are untouched.
        expect(window.localStorage.getItem("non-pulseplay-key")).toBe("kept");
        unmount(state);
    });

    it("Reset section clears only the keys for the chosen section", async () => {
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        window.localStorage.setItem("pulseplay:bi-surface-mode", "native");
        window.localStorage.setItem("pulseplay:ui-mode", "pulse");

        const state = mount();
        await act(async () => { await Promise.resolve(); });

        // Default section is "bi" → Reset bi clears pulseplay:bi-vendor.
        const resetSectionInput = Array.from(state.container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
            .find(i => i.getAttribute("aria-label") === "Type Reset bi to confirm")!;
        const resetSectionBtn = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(b => (b.textContent || "").trim() === "Clear 4 keys")!;

        await act(async () => { typeInto(resetSectionInput, "Reset bi"); });
        await act(async () => {
            resetSectionBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBeNull();
        expect(window.localStorage.getItem("pulseplay:bi-surface-mode")).toBeNull();
        expect(window.localStorage.getItem("pulseplay:ui-mode")).toBe("pulse"); // preferences section untouched
        unmount(state);
    });
});
