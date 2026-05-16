// playground/src/settings/__tests__/SettingsShell.test.tsx
//
// Integration coverage for SettingsShell: renders the setup tree + groups, the
// status strip reflects current state, the search box filters the rail,
// and Esc returns the URL to "/".

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../settingsStore";
import { SettingsShell } from "../SettingsShell";
import type { PulsePlayAllowlist } from "../../types/allowlist";

interface MountState {
    container: HTMLElement;
    root: Root;
}

const MVP_ALLOWLIST: PulsePlayAllowlist = {
    configured: true,
    biProviders: ["powerbi"],
    embedOrigins: { powerbi: ["app.powerbi.com"] },
    aadTenants: ["org-tenant"],
    aiProfiles: ["default"],
    packs: ["cpg-fmcg"],
    enforcement: "strict",
};

function mount(initialPath: string): MountState {
    window.history.pushState({}, "", initialPath);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                <SettingsShell />
            </SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
    window.history.pushState({}, "", "/");
}

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

describe("SettingsShell — render", () => {
    it("renders all group buttons in the left rail", async () => {
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });
        const buttons = state.container.querySelectorAll<HTMLButtonElement>("nav button");
        // Each button concatenates label + description in its textContent; we
        // just need to confirm each canonical group name appears somewhere
        // inside one of the rail buttons.
        const text = Array.from(buttons).map(b => b.textContent || "").join(" | ");
        for (const label of ["Setup", "BI", "AI", "Preferences", "System", "Advanced"]) {
            expect(text).toContain(label);
        }
        expect(buttons.length).toBe(6);
        unmount(state);
    });

    it("renders SetupGroup by default when no group in URL", async () => {
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });
        const heading = state.container.querySelector("#settings-setup-title");
        expect(heading?.textContent).toBe("Setup");
        unmount(state);
    });

    it("renders PreferencesGroup when URL is /settings/preferences", async () => {
        const state = mount("/settings/preferences");
        await act(async () => { await Promise.resolve(); });
        const heading = state.container.querySelector("#settings-preferences-title");
        expect(heading?.textContent).toBe("Preferences");
        unmount(state);
    });

    it("status strip shows BI · AI · Pack · Proxy · Security chips", async () => {
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });
        const text = state.container.textContent || "";
        expect(text).toContain("BI");
        expect(text).toContain("AI");
        expect(text).toContain("Pack");
        expect(text).toContain("Proxy");
        expect(text).toContain("Security");
        unmount(state);
    });
});

describe("SettingsShell — search filter", () => {
    it("filters the left rail to matching groups when search text is entered", async () => {
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });

        const searchInput = state.container.querySelector<HTMLInputElement>('input[type="search"]');
        expect(searchInput).not.toBeNull();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

        await act(async () => {
            nativeSetter?.call(searchInput!, "tile");
            searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
        });

        // "Canvas tiles" leaf is under Preferences -> only Preferences should render.
        const buttons = state.container.querySelectorAll<HTMLButtonElement>("nav button");
        const labels = Array.from(buttons).map(b => (b.textContent || "").trim());
        expect(labels.some(l => l.startsWith("Preferences"))).toBe(true);
        expect(labels.some(l => l.startsWith("Advanced"))).toBe(false);
        unmount(state);
    });
});

describe("SettingsShell — keyboard", () => {
    it("Esc returns the URL to '/'", async () => {
        const state = mount("/settings/ai");
        await act(async () => { await Promise.resolve(); });
        expect(window.location.pathname).toBe("/settings/ai");
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            // Drain navigation event listeners (popstate is synchronous in jsdom).
            await Promise.resolve();
        });
        expect(window.location.pathname).toBe("/");
        unmount(state);
    });
});
