// playground/src/settings/__tests__/settingsStore.test.tsx
//
// SettingsProvider + useSettings: allowlist load, reconciliation, setter
// validation, and the bidirectional bridge with the legacy
// `pulseplay:display-change` window event.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider, useSettings } from "../settingsStore";
import type { PulsePlayAllowlist } from "../../types/allowlist";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(children: React.ReactNode, allowlist: PulsePlayAllowlist | null): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const fetchAllowlist = async () => {
        if (!allowlist) throw new Error("test-no-allowlist");
        return allowlist;
    };
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={fetchAllowlist}>{children}</SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

/** A throwaway consumer that captures the store value into a ref-style
 *  object for the test body to inspect. */
function makeProbe() {
    const captured: { current: ReturnType<typeof useSettings> | null } = { current: null };
    function Probe(): null {
        captured.current = useSettings();
        return null;
    }
    return { Probe, captured };
}

const MVP_ALLOWLIST: PulsePlayAllowlist = {
    configured: true,
    biProviders: ["powerbi"],
    embedOrigins: { powerbi: ["app.powerbi.com"] },
    aadTenants: ["org-tenant"],
    aiProfiles: ["default", "supervisor"],
    packs: ["cpg-fmcg"],
    enforcement: "strict",
    fetchedAt: "2026-05-13T12:00:00Z",
};

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

describe("SettingsProvider — allowlist load + reconciliation", () => {
    it("loads the allowlist and exposes it to consumers", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        expect(captured.current?.allowlist?.biProviders).toEqual(["powerbi"]);
        expect(captured.current?.allowlistLoading).toBe(false);
        unmount(state);
    });

    it("flags an orphaned pack-selection when the persisted pack is not in the allowlist", async () => {
        window.localStorage.setItem("pulseplay:pack-selection", JSON.stringify({ pack: "deprecated-pack" }));
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        const orphan = captured.current?.orphans.find(o => o.key === "pulseplay:pack-selection");
        expect(orphan).toBeDefined();
        expect(orphan?.value).toBe("deprecated-pack");
        // The orphaned pack should also be cleared from state.
        expect(captured.current?.packSelection).toBeNull();
        unmount(state);
    });

    it("flags an orphaned BI provider but does NOT clobber the localStorage value (author confirms manually)", async () => {
        window.localStorage.setItem("pulseplay:bi-vendor", "tableau");
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        const orphan = captured.current?.orphans.find(o => o.key === "pulseplay:bi-vendor");
        expect(orphan).toBeDefined();
        expect(orphan?.value).toBe("tableau");
        // The state still reflects the orphaned value so the UI can warn the user.
        expect(captured.current?.biVendor).toBe("tableau");
        unmount(state);
    });

    it("surfaces a fetch failure as allowlistError without crashing", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, null);
        await act(async () => { await Promise.resolve(); });
        expect(captured.current?.allowlist).toBeNull();
        expect(captured.current?.allowlistError).toBe("test-no-allowlist");
        unmount(state);
    });
});

describe("SettingsProvider — setters", () => {
    it("setBiVendor rejects values outside the allowlist", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        let result: { ok: boolean; reason?: string } = { ok: true };
        act(() => {
            result = captured.current!.setBiVendor("tableau");
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain("tableau");
        unmount(state);
    });

    it("setBiVendor persists allowed values + broadcasts display-change", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        const events: Array<{ key?: string; value?: string }> = [];
        const listener = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (detail) events.push(detail);
        };
        window.addEventListener("pulseplay:display-change", listener);
        act(() => { captured.current!.setBiVendor("powerbi"); });
        window.removeEventListener("pulseplay:display-change", listener);
        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBe("powerbi");
        expect(events.some(e => e.key === "pulseplay:bi-vendor" && e.value === "powerbi")).toBe(true);
        unmount(state);
    });

    it("setPackSelection clears localStorage when given null", async () => {
        window.localStorage.setItem("pulseplay:pack-selection", JSON.stringify({ pack: "cpg-fmcg" }));
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        act(() => { captured.current!.setPackSelection(null); });
        expect(window.localStorage.getItem("pulseplay:pack-selection")).toBeNull();
        unmount(state);
    });

    it("setUiMode persists + broadcasts (no allowlist gate, it's a UX pref)", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        act(() => { captured.current!.setUiMode("v0"); });
        expect(window.localStorage.getItem("pulseplay:ui-mode")).toBe("v0");
        expect(captured.current?.uiMode).toBe("v0");
        unmount(state);
    });
});

describe("SettingsProvider — activeAiProfile (Phase 4)", () => {
    it("seeds activeAiProfile from pulseplay:active-ai-profile when present", async () => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "supervisor");
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        expect(captured.current?.activeAiProfile).toBe("supervisor");
        unmount(state);
    });

    it("falls back to pulseplay:visual-settings:genieSettings.assistantProfile when direct key is absent", async () => {
        window.localStorage.setItem(
            "pulseplay:visual-settings:genieSettings",
            JSON.stringify({ assistantProfile: "default" }),
        );
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        expect(captured.current?.activeAiProfile).toBe("default");
        unmount(state);
    });

    it("setActiveAiProfile rejects values outside the allowlist", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        let result: { ok: boolean; reason?: string } = { ok: true };
        act(() => {
            result = captured.current!.setActiveAiProfile("forbidden-profile");
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain("forbidden-profile");
        unmount(state);
    });

    it("setActiveAiProfile persists allowed values + broadcasts display-change", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        const events: Array<{ key?: string; value?: string }> = [];
        const listener = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (detail) events.push(detail);
        };
        window.addEventListener("pulseplay:display-change", listener);
        act(() => { captured.current!.setActiveAiProfile("default"); });
        window.removeEventListener("pulseplay:display-change", listener);
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("default");
        expect(events.some(e => e.key === "pulseplay:active-ai-profile" && e.value === "default")).toBe(true);
        unmount(state);
    });

    it("flags an orphaned activeAiProfile when persisted profile is not in the allowlist", async () => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "deprecated-profile");
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        const orphan = captured.current?.orphans.find(o => o.key === "pulseplay:active-ai-profile");
        expect(orphan).toBeDefined();
        expect(orphan?.value).toBe("deprecated-profile");
        // The orphan stays in state so the UI can warn.
        expect(captured.current?.activeAiProfile).toBe("deprecated-profile");
        unmount(state);
    });
});

describe("SettingsProvider — external sync via display-change event", () => {
    it("picks up changes dispatched by legacy code (App.tsx, Pulse Cycle H)", async () => {
        const { Probe, captured } = makeProbe();
        const state = mount(<Probe />, MVP_ALLOWLIST);
        await act(async () => { await Promise.resolve(); });
        act(() => {
            window.dispatchEvent(
                new CustomEvent("pulseplay:display-change", {
                    detail: { key: "pulseplay:layout-mode", value: "ai-right" },
                }),
            );
        });
        expect(captured.current?.layoutMode).toBe("ai-right");
        unmount(state);
    });
});
