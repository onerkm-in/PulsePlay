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
    it("renders the 4 visible rail groups (AI Setup, BI Setup, Advanced, Display)", async () => {
        // UX-ARCH-0B.2 Phase C — rail collapsed from 6 groups to 4. Legacy
        // `setup` and `system` are absorbed (still routable for back-compat
        // deep links; just not in the rail). Selecting via the group-level
        // class so expanded leaf buttons (which the previously-active group
        // surfaces inline) don't inflate the count.
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });
        const groupButtons = state.container.querySelectorAll<HTMLButtonElement>(".pp-settings-rail__item");
        const text = Array.from(groupButtons).map(b => b.textContent || "").join(" | ");
        for (const label of ["AI Setup", "BI Setup", "Advanced", "Display"]) {
            expect(text).toContain(label);
        }
        expect(groupButtons.length).toBe(4);
        unmount(state);
    });

    it("lands on AiGroup by default when no group in URL", async () => {
        // UX-ARCH-0B.2 Phase C — default landing changed from SetupGroup to
        // AiGroup since `setup` is being absorbed into AI/BI Setup.
        const state = mount("/settings");
        await act(async () => { await Promise.resolve(); });
        const heading = state.container.querySelector("#settings-ai-title");
        expect(heading?.textContent).toBeTruthy();
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

        // UX-ARCH-0B.2 Phase C — Preferences group renamed to "Display" in
        // the rail. "Canvas tiles" leaf is still indexed under preferences,
        // so a "tile" search filters down to the Display rail entry.
        const buttons = state.container.querySelectorAll<HTMLButtonElement>("nav button");
        const labels = Array.from(buttons).map(b => (b.textContent || "").trim());
        expect(labels.some(l => l.includes("Display"))).toBe(true);
        expect(labels.some(l => l.includes("Advanced"))).toBe(false);
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
