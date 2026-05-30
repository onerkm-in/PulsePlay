import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LaunchpadShell } from "../LaunchpadShell";
import { __resetEmbedConfigStore, EMBED_CONFIG_STORAGE_KEY } from "../../settings/embedConfigStore";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(): MountState {
    window.history.pushState({}, "", "/launchpad");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <LaunchpadShell
                activeAiProfile="default"
                onUseAiSource={vi.fn()}
                onUseBiSource={vi.fn()}
            />,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
    window.history.pushState({}, "", "/");
}

async function flushAll(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    window.localStorage.clear();
    __resetEmbedConfigStore();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/assistant/capabilities")) {
            return new Response(JSON.stringify({ capabilities: { lakeview: true, genie: true } }), { status: 200 });
        }
        if (url.startsWith("/api/assistant/lakeview/dashboards")) {
            return new Response(JSON.stringify({
                items: [{
                    kind: "lakeview-dashboard",
                    id: "dash-1",
                    title: "Workspace Usage Dashboard",
                    workspaceUrl: "https://demo.cloud.databricks.com",
                    openUrl: "https://demo.cloud.databricks.com/dashboards/dash-1",
                    lifecycleState: "ACTIVE",
                }],
            }), { status: 200 });
        }
        if (url.startsWith("/api/assistant/genie/spaces")) {
            return new Response(JSON.stringify({
                items: [{
                    kind: "genie-space",
                    id: "space-1",
                    title: "Customer Support Genie",
                    description: "Support review room",
                }],
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    __resetEmbedConfigStore();
});

describe("LaunchpadShell", () => {
    it("renders live Databricks assets from proxy discovery routes", async () => {
        const state = mount();
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Databricks Launchpad");
        expect(text).toContain("Workspace Usage Dashboard");
        expect(text).toContain("Customer Support Genie");
        expect(fetch).toHaveBeenCalledWith("/api/assistant/lakeview/dashboards?assistantProfile=default");
        unmount(state);
    });

    it("can promote a Lakeview dashboard into the active Databricks AI/BI surface", async () => {
        const state = mount();
        await flushAll();
        const useButton = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"))
            .find(button => (button.textContent || "").includes("Use as BI source"));
        expect(useButton).toBeTruthy();
        await act(async () => {
            useButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        expect(window.localStorage.getItem("pulseplay:bi-vendor")).toBe("databricks-aibi");
        const saved = JSON.parse(window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY) || "{}");
        expect(saved.vendor).toBe("databricks-aibi");
        expect(saved.dashboardId).toBe("dash-1");
        expect(window.location.pathname).toBe("/");
        unmount(state);
    });
});
