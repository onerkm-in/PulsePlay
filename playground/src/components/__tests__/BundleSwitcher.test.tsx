// Truth-gate coverage: the BundleSwitcher chip must show the BI surface
// actually running, not merely the author's requested vendor, and swapping
// a bundle must move all three of its axes (biVendor, aiProfile, pack).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../../settings/settingsStore";
import { BundleSwitcher } from "../BundleSwitcher";
import { CONTEXT_BUNDLES_STORAGE_KEY } from "../../lib/contextBundles";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactElement): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<SettingsProvider fetchAllowlist={async () => null}>{ui}</SettingsProvider>);
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

async function flushAll(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
});

afterEach(() => {
    window.localStorage.clear();
});

describe("BundleSwitcher — truth chip", () => {
    it("shows the runtime-resolved vendor label, not the raw requested biVendor", async () => {
        const state = mount(<BundleSwitcher runtimeVendor="native" runtimeVendorLabel="Pulse Canvas" />);
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Pulse Canvas");
        expect(text).not.toContain("Power BI");
        unmount(state);
    });

    it("falls back to the requested-vendor label when no runtime props are given", async () => {
        const state = mount(<BundleSwitcher />);
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Power BI");
        unmount(state);
    });
});

describe("BundleSwitcher — atomic bundle swap", () => {
    it("applies the bundle's pack along with vendor + AI profile", async () => {
        window.localStorage.setItem(
            CONTEXT_BUNDLES_STORAGE_KEY,
            JSON.stringify([{ biVendor: "tableau", aiProfile: "default", pack: "cpg-fmcg", label: "Tableau bundle" }]),
        );
        const state = mount(<BundleSwitcher />);
        await flushAll();

        const chip = state.container.querySelector("button[aria-haspopup='listbox']") as HTMLButtonElement | null;
        expect(chip).toBeTruthy();
        act(() => { chip!.click(); });
        await flushAll();

        const option = Array.from(state.container.querySelectorAll("button[role='option']"))
            .find(el => (el.textContent || "").includes("Tableau bundle")) as HTMLButtonElement | undefined;
        expect(option).toBeTruthy();
        act(() => { option!.click(); });
        await flushAll();

        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBe("tableau");
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("default");
        const packRaw = window.localStorage.getItem("pulseplay:pack-selection");
        expect(packRaw).toBeTruthy();
        expect(JSON.parse(packRaw as string)).toMatchObject({ pack: "cpg-fmcg" });

        unmount(state);
    });
});
