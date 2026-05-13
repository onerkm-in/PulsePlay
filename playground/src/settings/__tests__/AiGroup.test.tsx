// playground/src/settings/__tests__/AiGroup.test.tsx
//
// Phase 4 — verifies the AI group renders provider picker, supervisor
// fan-out table, and knowledge pack section against allowlist-filtered
// metadata. Network fetches are mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../settingsStore";
import { AiGroup } from "../groups/AiGroup";
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
    aiProfiles: ["default", "supervisor"],
    packs: ["cpg-fmcg"],
    genieSpaces: ["space-sales", "space-marketing"],
    enforcement: "strict",
};

const PROFILES_RESPONSE = [
    { name: "default", displayName: "Default helper", dataDomain: "sales data", spaceId: "abc123...def456" },
    {
        name: "supervisor",
        displayName: "PulsePlay Supervisor",
        description: "Genie Supervisor Agent",
        type: "supervisor-local",
        spaces: ["space-sales", "space-marketing"],
        agentName: "PulsePlay Supervisor",
    },
];

const PACKS_RESPONSE = {
    packs: [
        { name: "cpg-fmcg", displayName: "CPG / FMCG", subVerticals: [] },
    ],
};

beforeEach(() => {
    window.localStorage.clear();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/assistant/profiles")) {
            return new Response(JSON.stringify(PROFILES_RESPONSE), { status: 200 });
        }
        if (url.endsWith("/api/assistant/knowledge/packs")) {
            return new Response(JSON.stringify(PACKS_RESPONSE), { status: 200 });
        }
        return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

function mount(): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                <AiGroup />
            </SettingsProvider>,
        );
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

describe("AiGroup — Phase 4 wiring", () => {
    it("renders Provider picker with both allowed profiles", async () => {
        const state = mount();
        await flushAll();
        expect(state.container.textContent || "").toContain("Default helper");
        expect(state.container.textContent || "").toContain("PulsePlay Supervisor");
        unmount(state);
    });

    it("shows a Supervisor badge on supervisor profiles", async () => {
        const state = mount();
        await flushAll();
        // Badge text: "Supervisor · 2 spaces"
        expect(state.container.textContent || "").toMatch(/Supervisor · 2 spaces/);
        unmount(state);
    });

    it("selecting a Supervisor profile reveals the fan-out table", async () => {
        const state = mount();
        await flushAll();
        const supervisorBtn = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(b => (b.textContent || "").includes("PulsePlay Supervisor"));
        expect(supervisorBtn).toBeDefined();
        await act(async () => {
            supervisorBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        // After selection, the fan-out table renders space-sales / space-marketing rows
        expect(state.container.textContent || "").toContain("space-sales");
        expect(state.container.textContent || "").toContain("space-marketing");
        expect(state.container.textContent || "").toContain("Configured spaces");
        unmount(state);
    });

    it("renders the knowledge pack picker with allowlist-filtered packs", async () => {
        const state = mount();
        await flushAll();
        expect(state.container.textContent || "").toContain("CPG / FMCG");
        unmount(state);
    });

    it("renders Run probe button when Supervisor is selected", async () => {
        const state = mount();
        await flushAll();
        const supervisorBtn = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(b => (b.textContent || "").includes("PulsePlay Supervisor"));
        await act(async () => {
            supervisorBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        const text = state.container.textContent || "";
        expect(text).toContain("Run probe across all spaces");
        unmount(state);
    });
});
