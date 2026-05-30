// playground/src/biPanel/__tests__/BIPanel.failClosed.test.tsx
//
// Allowlist fail-closed P1 regression coverage for BIPanel:
//
//   - When `allowlistFailClosed` is true at mount time, BIPanel must NOT
//     call the adapter's mount(); it must surface an error state with
//     the fail-closed reason.
//   - When fail-closed transitions to false (proxy comes back), the
//     panel must mount cleanly (the effect's failClosed dep triggers).
//   - When an already-mounted panel sees a late-arriving allowlist that
//     would now block the current URL, the panel must destroy its
//     adapter and switch to the error state. We do NOT silently swap to
//     a different surface.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mountSpy = vi.fn();
const destroySpy = vi.fn();
const onSpy = vi.fn(() => () => {});

vi.mock("../registry", () => ({
    loadAdapter: vi.fn(async () => ({
        vendor: "test",
        displayName: "Test",
        capabilities: () => ({
            canNavigatePages: false,
            canApplyFilters: false,
            canExport: false,
            canRefresh: false,
            canFullscreen: false,
            requiresContainerEl: true,
        }),
        mount: mountSpy,
        on: onSpy,
        send: vi.fn(async () => {}),
        destroy: destroySpy,
    })),
}));

// Import AFTER vi.mock.
import { BIPanel } from "../BIPanel";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
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
        await Promise.resolve();
    });
}

beforeEach(() => {
    mountSpy.mockClear();
    destroySpy.mockClear();
    onSpy.mockClear();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("BIPanel — allowlist fail-closed (P1)", () => {
    it("refuses to mount when allowlistFailClosed=true at mount time", async () => {
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                allowlistFailClosed
            />,
        );
        await flush();
        // Adapter loader was never called → mount never reached.
        expect(mountSpy).not.toHaveBeenCalled();
        // Panel shows the error state with the fail-closed reason.
        const errBox = state.container.querySelector(".pp-bi-panel__error");
        expect(errBox).not.toBeNull();
        expect(errBox?.textContent || "").toMatch(/governance allowlist is unreachable/i);
        unmount(state);
    });

    it("mounts cleanly once fail-closed transitions to false (proxy comes back)", async () => {
        const config = { url: "https://app.powerbi.com/reportEmbed?reportId=r1" };
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={config}
                allowlistFailClosed
            />,
        );
        await flush();
        expect(mountSpy).not.toHaveBeenCalled();

        // Governance endpoint comes back online → parent re-renders with
        // allowlistFailClosed=false. The mount effect re-runs (failClosed
        // is in its deps) and the adapter mounts.
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={config}
                    allowlistFailClosed={false}
                />,
            );
        });
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);
        unmount(state);
    });

    it("late-arriving restrictive allowlist forces an already-mounted panel into error state", async () => {
        // Start with a configured allowlist that DOES allow the URL.
        const permissive = {
            configured: true,
            biProviders: ["test"],
            embedOrigins: { test: ["app.powerbi.com"] },
            aadTenants: [],
            aiProfiles: [],
            packs: [],
            fetchedAt: "2026-05-14T10:00:00Z",
        };
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                allowlist={permissive}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).not.toHaveBeenCalled();
        // Sanity: no error yet.
        expect(state.container.querySelector(".pp-bi-panel__error")).toBeNull();

        // A governance refresh ships a stricter allowlist that does NOT
        // include this hostname. The late-arrival effect must destroy
        // the existing adapter and flip to the error state.
        const restrictive = {
            configured: true,
            biProviders: ["test"],
            embedOrigins: { test: ["other.example.com"] }, // hostname now disallowed
            aadTenants: [],
            aiProfiles: [],
            packs: [],
            fetchedAt: "2026-05-14T11:00:00Z",
        };
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                    allowlist={restrictive}
                />,
            );
        });
        await flush();

        expect(destroySpy).toHaveBeenCalledTimes(1);
        const errBox = state.container.querySelector(".pp-bi-panel__error");
        expect(errBox).not.toBeNull();
        expect(errBox?.textContent || "").toMatch(/governance update blocked this bi surface/i);
        unmount(state);
    });
});
