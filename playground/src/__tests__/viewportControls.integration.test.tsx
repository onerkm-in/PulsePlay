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
vi.mock("../components/PulseShell", () => ({
    PulseShell: () => {
        const focus = new URL(window.location.href).searchParams.get("focus");
        const aiFocused = focus === "ai";
        const fire = (action: string) => {
            window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", {
                detail: { pane: "ai", action },
            }));
        };
        return (
            <div>
                <button
                    type="button"
                    aria-label={aiFocused ? "Restore AI panel" : "Maximize AI panel"}
                    onClick={() => fire(aiFocused ? "restore" : "focus")}
                />
                <button type="button" aria-label="Minimize AI panel" onClick={() => fire("minimize")} />
                <button type="button" aria-label="Open AI panel in separate page" onClick={() => fire("open-page")} />
                <button type="button" aria-label="Refresh AI panel" onClick={() => fire("reload")} />
            </div>
        );
    },
}));

import { App } from "../App";
import { __resetEmbedConfigStore } from "../settings/embedConfigStore";
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
    url.pathname = "/";
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

/** Click a button by its aria-label.
 *
 * After Fix #1 (overflow menu consolidation), Minimize / Pin / Unpin /
 * "Open … in separate page" live inside the per-pane ⋮ overflow menu and
 * are only mounted while the menu is open. To keep test bodies stable
 * across the contract change, this helper transparently opens the
 * relevant overflow menu when the target button isn't immediately found.
 *
 * The pane the action belongs to is derived from the aria-label suffix
 * ("…AI panel" → ai, "…BI panel" → bi); the Pin/Unpin labels are pane-
 * agnostic and fall back to opening AI's overflow first, then BI's. */
function openOverflowFor(state: MountState, pane: "ai" | "bi"): void {
    const overflowBtn = state.container.querySelector(
        `button[aria-label="More ${pane === "ai" ? "AI" : "BI"} panel actions"]`,
    ) as HTMLButtonElement | null;
    if (!overflowBtn) return;
    act(() => {
        overflowBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        overflowBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

function clickByLabel(state: MountState, ariaLabel: string): void {
    const find = () => state.container.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null;
    let btn = find();
    if (!btn) {
        // Try opening the relevant overflow menu first, then retry.
        const lower = ariaLabel.toLowerCase();
        const panes: ("ai" | "bi")[] = lower.includes("ai panel") ? ["ai"]
            : lower.includes("bi panel") ? ["bi"]
            : ["ai", "bi"];
        for (const p of panes) {
            openOverflowFor(state, p);
            btn = find();
            if (btn) break;
        }
    }
    if (!btn) throw new Error(`button[aria-label="${ariaLabel}"] not found`);
    act(() => {
        btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
    // Seed a non-empty BI embed config so the BI pane has content to
    // operate on. After Fix #2 (Hide PaneChrome on empty pane), the BI
    // chrome's toolbar is hidden when hasEmbedConfig === false; these
    // viewport-control tests assert against the toolbar buttons so they
    // need the configured state. The embedConfigStore reads from this
    // key on first call; we reset its in-memory cache so each test
    // re-reads.
    __resetEmbedConfigStore();
    try {
        window.localStorage.setItem(
            "pulseplay:bi-embed-config",
            JSON.stringify({ url: "https://app.powerbi.com/reportEmbed?reportId=test-r1" }),
        );
    } catch { /* swallow */ }
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

    it("shows a single top-right setup readiness pill that opens Settings > Setup", async () => {
        const state = mountApp();
        const pill = state.container.querySelector('button[title="Open Settings → Setup"]') as HTMLButtonElement | null;
        expect(pill).toBeTruthy();
        expect(pill?.textContent).toContain("Setup needed");

        await act(async () => {
            pill!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });

        expect(window.location.pathname).toBe("/settings/setup");
        expect(state.container.querySelector("#settings-setup-title")?.textContent).toBe("Setup");
        unmount(state);
    });

    it("keeps Pulse mode free of duplicate BI source and Console controls", () => {
        const state = mountApp();
        const sourcePanel = state.container.querySelector('section[aria-label="BI source"]');
        expect(sourcePanel).toBeNull();
        expect(state.container.textContent).not.toContain("BI source:");
        expect(state.container.textContent).not.toContain("Open setup");
        expect(state.container.textContent).not.toContain("Review setup");
        expect(state.container.textContent).not.toContain("Console");
        expect(state.container.textContent).not.toContain("BI tiles:");
        expect(state.container.querySelector('[aria-label="BI tile layout"]')).toBeNull();
        unmount(state);
    });

    it("exposes Pulse AI pane icons and keeps BI PaneChrome overflow actions", () => {
        const state = mountApp();
        // Pulse mode moves AI pane actions into the Pulse row as icon buttons.
        expect(state.container.querySelector(viewportControlControlSelector("ai", "Maximize"))).toBeTruthy();
        expect(state.container.querySelector(viewportControlControlSelector("ai", "Minimize"))).toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Open AI panel in separate page"]')).toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Refresh AI panel"]')).toBeTruthy();
        expect(state.container.querySelector('button[aria-label="More AI panel actions"]')).toBeNull();

        // BI pane still uses the generic PaneChrome menu.
        const max = state.container.querySelector(viewportControlControlSelector("bi", "Maximize"));
        expect(max, "bi Maximize button (inline)").toBeTruthy();
        const overflow = state.container.querySelector('button[aria-label="More BI panel actions"]');
        expect(overflow, "bi overflow trigger").toBeTruthy();
        const minClosed = state.container.querySelector(viewportControlControlSelector("bi", "Minimize"));
        expect(minClosed, "bi Minimize (menu closed -> absent)").toBeNull();
        openOverflowFor(state, "bi");
        expect(state.container.querySelector(viewportControlControlSelector("bi", "Minimize")), "bi Minimize menuitem").toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Pin layout"]'), "bi Pin menuitem").toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Open BI panel in separate page"]'), "bi Open-in-separate-page menuitem").toBeTruthy();
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

    it("hides the outer AI chrome header in Pulse mode while pane icons live in the Pulse row", () => {
        setLocation("?focus=ai");
        const state = mountApp();

        const header = state.container.querySelector('[data-testid="pp-panel-chrome-header-ai"]') as HTMLElement | null;
        const controls = state.container.querySelector('[data-testid="pp-panel-controls-ai"]') as HTMLElement | null;

        expect(header, "focused AI chrome header").toBeNull();
        expect(controls, "focused AI controls toolbar is hidden in Pulse mode").toBeNull();
        // Pulse mode does not need the outer AI PaneChrome title/control row
        // because pane actions live beside AI Insights / Chat.
        expect(state.container.querySelector('button[aria-label="Restore AI panel"]')).toBeTruthy();

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

        // Pulse mode moves AI pane actions into the Pulse row; pin/unpin
        // remains covered through the generic BI PaneChrome overflow menu.
        openOverflowFor(state, "bi");
        const pinSelector = `${viewportControlPanelChromeSelector("bi")} ${viewportControlPinButtonSelector}`;
        const pinBtn = state.container.querySelector(pinSelector) as HTMLButtonElement | null;
        expect(pinBtn, "BI pin button (in overflow)").toBeTruthy();
        act(() => { pinBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-layout-pinned")).toBe("true");
        const persisted = window.localStorage.getItem("pulseplay:pinned-viewport-pane");
        expect(persisted).toBe("bi");

        // Re-open the menu (it auto-closed on selection) and click Unpin.
        openOverflowFor(state, "bi");
        const unpinBtn = state.container.querySelector(
            `${viewportControlPanelChromeSelector("bi")} button[aria-label="Unpin layout"]`,
        ) as HTMLButtonElement | null;
        expect(unpinBtn, "BI unpin button after pinning").toBeTruthy();
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
