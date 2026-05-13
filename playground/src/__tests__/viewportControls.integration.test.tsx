// playground/src/__tests__/viewportControls.integration.test.tsx
//
// Integration coverage for the viewport-control lane that Codex authored
// in App.tsx. Per docs/AGENT_SYNC.md the implementation file is owned by
// another agent in this cycle — these tests deliberately DO NOT modify
// App.tsx; they mount the public `<App />` export and assert against the
// rendered DOM using the stable selectors defined in
// viewportControls.contract.test.ts.
//
// Coverage:
//   - `?focus=ai` and `?focus=bi` URL params hydrate the shell's
//     data-viewport-focus attribute.
//   - Default (no URL focus) renders both PaneChrome instances in `split`.
//   - Each panel exposes Maximize / Minimize / Pin / Page buttons with the
//     correct aria-labels from the contract.
//   - Clicking Maximize swaps to data-viewport-focus=<pane>; Restore swaps
//     back to split.
//   - Pin toggles localStorage pulseplay:pinned-viewport-pane and
//     aria-pressed.
//   - data-panel-state transitions match contract expectations.
//
// We mock the network-heavy children (discoveryClient + global fetch) so
// the test focuses on App-shell behaviour rather than child rendering.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Phase A — App mounts AISidebar which fires discovery on mount.
vi.mock("../lib/discoveryClient", () => ({
    getDiscoverySnapshot: vi.fn().mockResolvedValue(null),
    subscribeDiscoveryCache: vi.fn().mockReturnValue(() => {}),
}));

// Pulse is lazy-loaded behind Suspense; replace with a stub so the AI pane
// renders synchronously and we don't wait on chunk loading in jsdom.
vi.mock("../pulse", () => ({
    PulseShell: () => null,
}));

import { App } from "../App";
import {
    viewportControlControlSelector,
    viewportControlPanelChromeSelector,
    viewportControlPinButtonSelector,
    viewportControlShellSelector,
} from "./viewportControls.contract.test";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function setLocation(search: string): void {
    const url = new URL(window.location.href);
    url.search = search;
    window.history.replaceState(null, "", url.toString());
}

function clearStorage(): void {
    try {
        window.localStorage.removeItem("pulseplay:pinned-viewport-pane");
        window.localStorage.removeItem("pulseplay:enabled-components");
        window.localStorage.removeItem("pulseplay:layout-mode");
        window.localStorage.removeItem("pulseplay:bi-tile-mode");
        window.localStorage.removeItem("pulseplay:bi-vendor");
        window.localStorage.removeItem("pulseplay:ui-mode");
    } catch { /* swallow */ }
}

function mountApp(): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<App />); });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

function clickByLabel(state: MountState, ariaLabel: string): void {
    const btn = state.container.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null;
    if (!btn) throw new Error(`button[aria-label="${ariaLabel}"] not found`);
    act(() => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

// jsdom lacks ResizeObserver; react-resizable-panels (used by SplitLayout
// for the AI/BI split) calls `new ResizeObserver(...)` during mount. Provide
// a noop polyfill so the split layout can render in tests.
class NoopResizeObserver {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}
(globalThis as unknown as { ResizeObserver?: typeof NoopResizeObserver }).ResizeObserver
    = (globalThis as unknown as { ResizeObserver?: typeof NoopResizeObserver }).ResizeObserver
    ?? NoopResizeObserver;

beforeEach(() => {
    document.body.innerHTML = "";
    clearStorage();
    setLocation("");
    // Provide a passthrough fetch that returns empty payloads so any
    // background fetches from settings/allowlist/profiles don't hang.
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    document.body.innerHTML = "";
    setLocation("");
    clearStorage();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/* ─── Default split layout ───────────────────────────────────────── */

describe("App viewport controls — default split", () => {
    it("renders the shell with data-viewport-focus=split when no URL focus is set", () => {
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell).toBeTruthy();
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-layout-pinned")).toBe("false");
        unmount(state);
    });

    it("renders both AI and BI panel chrome nodes with data-panel-state=normal", () => {
        const state = mountApp();
        const aiChrome = state.container.querySelector(viewportControlPanelChromeSelector("ai"));
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        expect(aiChrome).toBeTruthy();
        expect(biChrome).toBeTruthy();
        expect(aiChrome?.getAttribute("data-panel-state")).toBe("normal");
        expect(biChrome?.getAttribute("data-panel-state")).toBe("normal");
        unmount(state);
    });

    it("exposes Maximize / Minimize / Pin / Page buttons for each pane", () => {
        const state = mountApp();
        for (const pane of ["ai", "bi"] as const) {
            const max = state.container.querySelector(viewportControlControlSelector(pane, "Maximize"));
            const min = state.container.querySelector(viewportControlControlSelector(pane, "Minimize"));
            const pin = state.container.querySelector(`button[aria-label="${pane === "ai" ? "Pin layout" : "Pin layout"}"]`);
            const openPage = state.container.querySelector(`button[aria-label="Open ${pane === "ai" ? "AI" : "BI"} panel in separate page"]`);
            expect(max, `${pane} Maximize button`).toBeTruthy();
            expect(min, `${pane} Minimize button`).toBeTruthy();
            expect(pin, `${pane} Pin button`).toBeTruthy();
            expect(openPage, `${pane} Page button`).toBeTruthy();
        }
        unmount(state);
    });
});

/* ─── URL-driven focus mode ──────────────────────────────────────── */

describe("App viewport controls — ?focus= URL", () => {
    it("hydrates focused-AI state when ?focus=ai is set before mount", () => {
        setLocation("?focus=ai");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("ai");
        const aiChrome = state.container.querySelector(viewportControlPanelChromeSelector("ai"));
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        expect(aiChrome?.getAttribute("data-panel-state")).toBe("maximized");
        expect(biChrome?.getAttribute("data-panel-state")).toBe("minimized");
        // While focused, the AI chrome shows a Restore button instead of Maximize.
        const restoreBtn = state.container.querySelector(viewportControlControlSelector("ai", "Restore"));
        expect(restoreBtn).toBeTruthy();
        unmount(state);
    });

    it("hydrates focused-BI state when ?focus=bi is set before mount", () => {
        setLocation("?focus=bi");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("bi");
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        expect(biChrome?.getAttribute("data-panel-state")).toBe("maximized");
        unmount(state);
    });

    it("ignores invalid ?focus= values and falls through to split", () => {
        setLocation("?focus=bogus");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        unmount(state);
    });

    it("syncs focused pane when browser history emits popstate", () => {
        const state = mountApp();
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");

        setLocation("?focus=ai");
        act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("ai");

        setLocation("");
        act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");

        unmount(state);
    });

    it("reserves right-side chrome space in focused mode so the fixed connection pill cannot overlap controls", () => {
        setLocation("?focus=ai");
        const state = mountApp();

        const header = state.container.querySelector('[data-testid="pp-panel-chrome-header-ai"]') as HTMLElement | null;
        const controls = state.container.querySelector('[data-testid="pp-panel-controls-ai"]') as HTMLElement | null;

        expect(header, "focused AI chrome header").toBeTruthy();
        expect(controls, "focused AI controls toolbar").toBeTruthy();
        expect(header?.getAttribute("style")).toContain("padding: 7px min(228px, 50vw) 7px 10px");
        expect(controls?.style.flexWrap).toBe("wrap");
        expect(controls?.style.minWidth).toBe("0");

        unmount(state);
    });
});

/* ─── Click-driven transitions ───────────────────────────────────── */

describe("App viewport controls — chrome buttons", () => {
    it("Maximize → focused, Restore → split, both panels stay mounted", () => {
        const state = mountApp();

        // Starting state.
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");

        // Maximize AI.
        clickByLabel(state, "Maximize AI panel");
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("ai");
        const aiChrome = state.container.querySelector(viewportControlPanelChromeSelector("ai"));
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        expect(aiChrome?.getAttribute("data-panel-state")).toBe("maximized");
        expect(biChrome?.getAttribute("data-panel-state")).toBe("minimized");
        // Both panel chrome nodes remain present (no unmount).
        expect(state.container.querySelectorAll(viewportControlPanelChromeSelector("ai")).length).toBe(1);
        expect(state.container.querySelectorAll(viewportControlPanelChromeSelector("bi")).length).toBe(1);

        // Restore.
        clickByLabel(state, "Restore AI panel");
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");

        unmount(state);
    });

    it("Minimize keeps one restore target and uses a distinct Show both action", () => {
        const state = mountApp();

        clickByLabel(state, "Minimize AI panel");
        expect(window.localStorage.getItem("pulseplay:enabled-components")).toBe("biOnly");

        const restoreAiButtons = state.container.querySelectorAll('button[aria-label="Restore AI panel"]');
        const showBothButtons = state.container.querySelectorAll('button[aria-label="Show both panels"]');
        expect(restoreAiButtons.length).toBe(1);
        expect(showBothButtons.length).toBe(1);
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))?.getAttribute("data-panel-state")).toBe("minimized");

        clickByLabel(state, "Restore AI panel");
        expect(window.localStorage.getItem("pulseplay:enabled-components")).toBe("both");
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))?.getAttribute("data-panel-state")).toBe("normal");

        unmount(state);
    });

    it("Page opens the selected pane in a focused separate tab URL", () => {
        const state = mountApp();
        const openMock = vi.fn();
        vi.stubGlobal("open", openMock);

        clickByLabel(state, "Open BI panel in separate page");

        expect(openMock).toHaveBeenCalledTimes(1);
        expect(String(openMock.mock.calls[0][0])).toContain("focus=bi");
        expect(openMock.mock.calls[0][1]).toBe("_blank");
        expect(openMock.mock.calls[0][2]).toBe("noopener,noreferrer");

        unmount(state);
    });

    it("Pin → aria-pressed=true + localStorage write; toggle back unpins", () => {
        const state = mountApp();

        // Pin the AI panel.
        const pinSelector = `${viewportControlPanelChromeSelector("ai")} ${viewportControlPinButtonSelector}`;
        const pinBtn = state.container.querySelector(pinSelector) as HTMLButtonElement | null;
        expect(pinBtn, "AI pin button").toBeTruthy();
        act(() => { pinBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-layout-pinned")).toBe("true");
        const persisted = window.localStorage.getItem("pulseplay:pinned-viewport-pane");
        expect(persisted).toBe("ai");

        // Click the same button again — now labelled "Unpin layout" — to clear.
        const unpinBtn = state.container.querySelector(
            `${viewportControlPanelChromeSelector("ai")} button[aria-label="Unpin layout"]`,
        ) as HTMLButtonElement | null;
        expect(unpinBtn, "AI unpin button after pinning").toBeTruthy();
        act(() => { unpinBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

        const persistedAfter = window.localStorage.getItem("pulseplay:pinned-viewport-pane");
        expect(persistedAfter).toBeNull();
        const shellAfter = state.container.querySelector(viewportControlShellSelector);
        expect(shellAfter?.getAttribute("data-layout-pinned")).toBe("false");

        unmount(state);
    });

    it("pinned pane persists across remount as the focused startup pane", () => {
        // Seed localStorage with a pinned BI pane before mount.
        window.localStorage.setItem("pulseplay:pinned-viewport-pane", "bi");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("bi");
        expect(shell?.getAttribute("data-layout-pinned")).toBe("true");
        unmount(state);
    });
});
