import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    DATABRICKS_CAPABILITIES_EVENT,
    databricksCapabilitiesStorageKey,
    useDatabricksCapabilities,
    type DatabricksCapabilitiesSnapshot,
} from "../databricksCapabilities";

interface MountState {
    container: HTMLElement;
    root: Root;
}

const SNAPSHOT: DatabricksCapabilitiesSnapshot = {
    ok: true,
    assistantProfile: "default",
    capabilities: {
        genie: true,
        lakeview: true,
        servingEndpoints: true,
        apps: true,
        vectorSearch: false,
        jobs: true,
    },
    details: {
        vectorSearch: {
            key: "vectorSearch",
            path: "/api/2.0/vector-search/endpoints",
            status: "available",
            available: true,
            ready: false,
            httpStatus: 200,
            count: 0,
        },
    },
    counts: { vectorSearch: 0 },
};

function Probe(props: { profile?: string }): React.ReactElement {
    const state = useDatabricksCapabilities(props.profile);
    const vector = state.details.vectorSearch;
    return (
        <div>
            <span data-testid="loading">{String(state.loading)}</span>
            <span data-testid="error">{state.error}</span>
            <span data-testid="vector">{String(state.capabilities.vectorSearch)}</span>
            <span data-testid="count">{String(vector?.count ?? "none")}</span>
        </div>
    );
}

function mount(profile = "default"): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<Probe profile={profile} />);
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

describe("useDatabricksCapabilities", () => {
    it("fetches capabilities and writes the per-profile localStorage cache", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(SNAPSHOT), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const state = mount("default");
        await flush();

        expect(fetchMock).toHaveBeenCalledWith("/api/assistant/capabilities?assistantProfile=default");
        expect(state.container.querySelector('[data-testid="vector"]')?.textContent).toBe("false");
        expect(state.container.querySelector('[data-testid="count"]')?.textContent).toBe("0");
        const raw = window.localStorage.getItem(databricksCapabilitiesStorageKey("default"));
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw || "{}").capabilities.lakeview).toBe(true);
        unmount(state);
    });

    it("updates mounted consumers from the cache broadcast event", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(SNAPSHOT), { status: 200 })));
        const state = mount("default");
        await flush();

        const next: DatabricksCapabilitiesSnapshot = {
            ...SNAPSHOT,
            capabilities: { ...SNAPSHOT.capabilities, vectorSearch: true },
            details: {
                ...SNAPSHOT.details,
                vectorSearch: { ...SNAPSHOT.details.vectorSearch, ready: true, count: 2 },
            },
            counts: { ...SNAPSHOT.counts, vectorSearch: 2 },
        };
        const key = databricksCapabilitiesStorageKey("default");
        await act(async () => {
            window.localStorage.setItem(key, JSON.stringify(next));
            window.dispatchEvent(new CustomEvent(DATABRICKS_CAPABILITIES_EVENT, {
                detail: { key, profile: "default", snapshot: next },
            }));
            await Promise.resolve();
        });

        expect(state.container.querySelector('[data-testid="vector"]')?.textContent).toBe("true");
        expect(state.container.querySelector('[data-testid="count"]')?.textContent).toBe("2");
        unmount(state);
    });
});
