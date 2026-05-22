// playground/src/biPanel/__tests__/BIPanel.perf.test.tsx
//
// Regression test for the 2026-05-13 perf fix: BIPanel must NOT re-mount
// the adapter when the parent re-renders with new optional-callback refs
// (onEvent, onAdapterReady) or with a structurally-equal embedConfig that
// happens to be a fresh object identity.
//
// Before the fix, the mount effect's dep array included these object refs
// directly, so any parent re-render that recreated them triggered a full
// adapter destroy + remount — for Power BI that means a full SDK re-init
// and iframe reload mid-session.
//
// After the fix, the effect's deps are (vendor, configKey) where configKey
// is a stable JSON hash of embedConfig content. The callbacks + allowlist
// flow through refs.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Shared spies the mocked adapter writes to. Captured outside vi.mock so
// the test body can inspect them.
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

// Import AFTER vi.mock so the module under test sees the mocked registry.
import { BIPanel } from "../BIPanel";
import type { BIAdapter, BIEvent } from "../BIAdapter";

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

describe("BIPanel — perf: ref pattern prevents spurious remounts", () => {
    it("mounts the adapter exactly once on first render", async () => {
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                onEvent={() => {}}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);
        unmount(state);
    });

    it("does NOT remount when onEvent identity changes (different callback ref, same content)", async () => {
        const config = { url: "https://app.powerbi.com/reportEmbed?reportId=r1" };
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={config}
                onEvent={() => {}}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Re-render with a FRESH onEvent function but the same vendor + config.
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={config}
                    onEvent={() => { /* totally different identity */ }}
                />,
            );
        });
        await flush();

        // Still exactly one mount.
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).not.toHaveBeenCalled();
        unmount(state);
    });

    it("does NOT remount when embedConfig is a NEW object with the SAME content", async () => {
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                onEvent={() => {}}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Parent re-render creates a structurally-equal embedConfig object
        // (the kind of churn that comes from inline-object props or from
        // {...spread} construction in parent components).
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
                    onEvent={() => {}}
                />,
            );
        });
        await flush();

        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).not.toHaveBeenCalled();
        unmount(state);
    });

    it("does NOT remount when allowlist identity changes but content is equivalent", async () => {
        const allowlistA = {
            configured: true,
            biProviders: ["powerbi"],
            embedOrigins: { powerbi: ["app.powerbi.com"], test: ["app.powerbi.com"] },
            aadTenants: [],
            aiProfiles: [],
            packs: [],
        };
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/x" }}
                allowlist={allowlistA}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Fresh allowlist object, same shape (e.g. a governance re-fetch).
        const allowlistB = {
            configured: true,
            biProviders: ["powerbi"],
            embedOrigins: { powerbi: ["app.powerbi.com"], test: ["app.powerbi.com"] },
            aadTenants: [],
            aiProfiles: [],
            packs: [],
        };
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={{ url: "https://app.powerbi.com/x" }}
                    allowlist={allowlistB}
                />,
            );
        });
        await flush();

        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).not.toHaveBeenCalled();
        unmount(state);
    });

    it("DOES remount when embedConfig content actually changes", async () => {
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r1" }}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Genuinely new content — different report URL.
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={{ url: "https://app.powerbi.com/reportEmbed?reportId=r2-different" }}
                />,
            );
        });
        await flush();

        // Two mounts — old adapter was destroyed + new adapter mounted.
        expect(mountSpy).toHaveBeenCalledTimes(2);
        expect(destroySpy).toHaveBeenCalledTimes(1);
        unmount(state);
    });

    it("DOES remount when vendor changes", async () => {
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/x" }}
            />,
        );
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test-other"
                    embedConfig={{ url: "https://app.powerbi.com/x" }}
                />,
            );
        });
        await flush();

        expect(mountSpy).toHaveBeenCalledTimes(2);
        expect(destroySpy).toHaveBeenCalledTimes(1);
        unmount(state);
    });

    it("latest onEvent callback is invoked after re-renders (ref stays current)", async () => {
        // Capture the BIEvent handler the adapter registered.
        let registeredHandler: ((e: BIEvent) => void) | null = null;
        const onAdapter = vi.fn((_a: BIAdapter | null) => {});

        // Reset onSpy to capture the registered handler this test only.
        onSpy.mockImplementation((_eventType: string, handler: (e: BIEvent) => void) => {
            // First registration we capture is the `loaded` event listener.
            if (!registeredHandler) registeredHandler = handler;
            return () => {};
        });

        const firstCallback = vi.fn();
        const state = mount(
            <BIPanel
                vendor="test"
                embedConfig={{ url: "https://app.powerbi.com/x" }}
                onEvent={firstCallback}
                onAdapterReady={onAdapter}
            />,
        );
        await flush();
        expect(registeredHandler).not.toBeNull();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Re-render with a new onEvent. Adapter should NOT remount.
        const secondCallback = vi.fn();
        act(() => {
            state.root.render(
                <BIPanel
                    vendor="test"
                    embedConfig={{ url: "https://app.powerbi.com/x" }}
                    onEvent={secondCallback}
                    onAdapterReady={onAdapter}
                />,
            );
        });
        await flush();
        expect(mountSpy).toHaveBeenCalledTimes(1);

        // Fire an event through the registered handler. The LATEST onEvent
        // (secondCallback) should be invoked, not the original firstCallback.
        act(() => {
            registeredHandler!({ type: "loaded" });
        });
        expect(firstCallback).not.toHaveBeenCalled();
        expect(secondCallback).toHaveBeenCalledTimes(1);
        unmount(state);
    });
});
