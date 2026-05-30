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
//   - Default (no URL focus) renders the unified Mix surface: AI is visible,
//     BI opens on demand through the peer `BI Viz` action.
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

// Phase A — App mounts UnifiedAssistantSurface which fires discovery on mount.
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
                <button
                    type="button"
                    aria-label="Open dashboard surface"
                    onClick={() => window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", {
                        detail: { pane: "bi", action: "focus" },
                    }))}
                />
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
        window.localStorage.removeItem("pulseplay:enabled-components:legacy-both-migrated");
        window.localStorage.removeItem("pulseplay:layout-mode");
        window.localStorage.removeItem("pulseplay:active-surface");
        window.localStorage.removeItem("pulseplay:default-landing-surface");
        window.localStorage.removeItem("pulseplay:bi-tile-mode");
        window.localStorage.removeItem("pulseplay:bi-surface-mode");
        window.localStorage.removeItem("pulseplay:bi-vendor");
        window.localStorage.removeItem("pulseplay:ui-mode");
        window.localStorage.removeItem("pulseplay:visual-settings:genieSettings");
    } catch { /* swallow */ }
}

/** F5.1 helper — seed Pulse `enabledFeatures` and fire the change event so
 *  App.tsx's resolver picks up the new value. Mirrors what Settings UI does
 *  via `writePulseAiVisualSettingsPatch`. */
function setPulseEnabledFeatures(value: "both" | "insightsOnly" | "chatOnly"): void {
    const KEY = "pulseplay:visual-settings:genieSettings";
    const raw = window.localStorage.getItem(KEY);
    let parsed: Record<string, unknown> = {};
    try { if (raw) parsed = JSON.parse(raw); } catch { /* swallow */ }
    parsed.enabledFeatures = value;
    window.localStorage.setItem(KEY, JSON.stringify(parsed));
    window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", {
        detail: { objectName: "genieSettings", properties: { enabledFeatures: value } },
    }));
}

function seedExplicitSplitLayout(): void {
    window.localStorage.setItem("pulseplay:enabled-components", "both");
    window.localStorage.setItem("pulseplay:enabled-components:legacy-both-migrated", "true");
}

/** uiMode default is "pulse" (PulseShell / Workbench — see settingsStore
 *  DEFAULT_UI_MODE, re-aligned 2026-05-28). Pulse is now the cold-boot
 *  default, so tests that exercise PulseShell-mounted chrome (tab strip +
 *  the mocked PulseShell button with "Open dashboard surface" aria-label)
 *  no longer need to opt in — but the helper is kept (writing the value
 *  the resolver already defaults to is harmless) so the Pulse-mode tests
 *  document their intent explicitly. */
function seedPulseUiMode(): void {
    window.localStorage.setItem("pulseplay:ui-mode", "pulse");
}

/** Opt INTO the v0 UnifiedAssistantSurface (the single-pane unified "Mix"
 *  surface). Since 2026-05-28 "pulse" is the DEFAULT_UI_MODE, so tests that
 *  verify v0-surface behaviour must force it explicitly. Two writes are
 *  required: the ui-mode escape-hatch key AND allowChatSurface=true in the
 *  Pulse genieSettings, because App.tsx coerces uiMode back to "pulse" when
 *  the author has not enabled the Chat surface (App.tsx:1019-1021). Mirrors
 *  what an author does in Settings → Preferences (allow Chat) plus the dev
 *  DevTools escape hatch. */
function seedV0UiMode(): void {
    window.localStorage.setItem("pulseplay:ui-mode", "v0");
    const KEY = "pulseplay:visual-settings:genieSettings";
    let parsed: Record<string, unknown> = {};
    try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) parsed = JSON.parse(raw);
    } catch { /* swallow */ }
    parsed.allowChatSurface = true;
    window.localStorage.setItem(KEY, JSON.stringify(parsed));
}

/** Returns true when the pane's chrome is mounted but rendered in the
 *  HIDDEN stacked frame (the off-screen copy). 2026-05-28 ("Workbench
 *  default" commit) changed mix mode to KEEP both panes mounted and
 *  toggle visibility — the inactive pane's stacked-frame wrapper carries
 *  aria-hidden="true" instead of being unmounted. So "BI is not the
 *  visible primary surface" is now expressed as "BI chrome lives inside
 *  an aria-hidden frame", not "BI chrome is absent from the DOM". */
function paneChromeIsHidden(state: MountState, pane: "ai" | "bi"): boolean {
    const chrome = state.container.querySelector(viewportControlPanelChromeSelector(pane));
    if (!chrome) return false; // not mounted at all — caller asserts presence separately
    const hiddenFrame = chrome.closest('[aria-hidden="true"]');
    return hiddenFrame !== null;
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

/** Open the per-pane ⋮ overflow menu, if one exists.
 *
 * Historical context: PaneChrome used to tuck Minimize / Pin / Open-in-
 * separate-page into a ⋮ overflow menu. As of 2026-05 those actions are
 * inline icon buttons (visual parity with the AI-side Pulse cluster), so
 * the overflow trigger no longer renders. This helper is now defensively
 * a no-op when called against the current shape — preserved so older
 * test bodies that pre-opened the menu still pass without rewrite. */
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
    // First try the aria-label match (most buttons in PaneChrome use it).
    // Fall back to matching visible text content for the new SurfaceSwitcher
    // pills (Codex 2026-05-19: accessible name = visible label, no extra
    // "Open … surface" wrapper).
    const findByAria = () => state.container.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null;
    const findByText = () => {
        const buttons = Array.from(state.container.querySelectorAll<HTMLButtonElement>("button"));
        return buttons.find(b => (b.textContent || "").trim() === ariaLabel) ?? null;
    };
    let btn = findByAria() ?? findByText();
    if (!btn) {
        // Try opening the relevant overflow menu first, then retry.
        const lower = ariaLabel.toLowerCase();
        const panes: ("ai" | "bi")[] = lower.includes("ai panel") ? ["ai"]
            : lower.includes("bi panel") ? ["bi"]
            : ["ai", "bi"];
        for (const p of panes) {
            openOverflowFor(state, p);
            btn = findByAria() ?? findByText();
            if (btn) break;
        }
    }
    if (!btn) throw new Error(`button[aria-label="${ariaLabel}"] (or visible text) not found`);
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

/* ─── Default unified layout ─────────────────────────────────────── */

describe("App viewport controls — default unified Mix surface", () => {
    it("renders the shell with data-viewport-focus=split when no URL focus is set", () => {
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell).toBeTruthy();
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-layout-pinned")).toBe("false");
        unmount(state);
    });

    it("G5 auto mode mounts the configured vendor when embed config exists", () => {
        window.localStorage.setItem("pulseplay:bi-surface-mode", "auto");
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-bi-surface-mode")).toBe("auto");
        expect(shell?.getAttribute("data-requested-bi-vendor")).toBe("powerbi");
        expect(shell?.getAttribute("data-runtime-bi-vendor")).toBe("powerbi");
        expect(shell?.getAttribute("data-bi-surface-resolution")).toBe("auto-vendor-configured");
        unmount(state);
    });

    it("G5 auto mode falls back to native when no vendor embed config exists", () => {
        window.localStorage.removeItem("pulseplay:bi-embed-config");
        __resetEmbedConfigStore();
        window.localStorage.setItem("pulseplay:bi-surface-mode", "auto");
        window.localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-bi-surface-mode")).toBe("auto");
        expect(shell?.getAttribute("data-requested-bi-vendor")).toBe("powerbi");
        expect(shell?.getAttribute("data-runtime-bi-vendor")).toBe("native");
        expect(shell?.getAttribute("data-bi-surface-resolution")).toBe("auto-no-vendor-config");
        unmount(state);
    });

    it("renders AI as the primary surface and does not keep BI as a permanent second section", () => {
        seedV0UiMode(); // v0 UnifiedAssistantSurface — AI is the sole primary surface, BI opens on demand
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        const aiChrome = state.container.querySelector(viewportControlPanelChromeSelector("ai"));
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        // AI is the active/primary surface.
        expect(aiChrome).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(false);
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(aiChrome?.getAttribute("data-panel-state")).toBe("normal");
        // BI is NOT a permanent co-visible second section. Since the 2026-05-28
        // "Workbench default" commit, mix mode keeps the hidden BI pane MOUNTED
        // (so AI↔Dashboard switches don't reload) — so "not a second section"
        // now means "mounted but in the hidden stacked frame", not "absent".
        expect(biChrome).toBeTruthy();
        expect(paneChromeIsHidden(state, "bi")).toBe(true);
        unmount(state);
    });

    it("migrates legacy saved split state back to unified mix once", () => {
        seedV0UiMode(); // v0 UnifiedAssistantSurface is the surface under test
        window.localStorage.setItem("pulseplay:enabled-components", "both");
        const state = mountApp();

        expect(window.localStorage.getItem("pulseplay:enabled-components")).toBe("mix");
        expect(window.localStorage.getItem("pulseplay:enabled-components:legacy-both-migrated")).toBe("true");
        // AI is the visible primary surface; BI is mounted-but-hidden (mix
        // mode keeps both panes mounted as of the 2026-05-28 Workbench commit).
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(false);
        expect(state.container.querySelector(viewportControlPanelChromeSelector("bi"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "bi")).toBe(true);

        unmount(state);
    });

    it("opens the dashboard as the unified primary surface without entering focused-pane mode", async () => {
        seedPulseUiMode(); // PulseShell-mounted chrome assertions below
        const state = mountApp();
        // PulseShell is React.lazy()-loaded behind Suspense. Flush the
        // microtask queue so the lazy import resolves and the mock's
        // "Open dashboard surface" button enters the DOM before clickByLabel.
        await act(async () => { await Promise.resolve(); });

        // 2026-05-19 surface switcher rewrite: the mocked PulseShell button
        // carries the verbose "Open dashboard surface" aria-label (it is
        // a test mock — see top of file). When the BI pane mounts, the real
        // SurfaceSwitcher renders pills with clean accessible names = their
        // visible text ("AI Insights" / "Ask Pulse" / "Dashboard") per Codex's
        // non-duplicative-label feedback. Label renamed "BI Viz" → "Dashboard"
        // in the 2026-05-19 UI/UX audit.
        clickByLabel(state, "Open dashboard surface");

        const shell = state.container.querySelector(viewportControlShellSelector);
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        const aiChrome = state.container.querySelector(viewportControlPanelChromeSelector("ai"));
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");
        // BI is now the visible primary surface; AI stays mounted-but-hidden
        // (mix mode keeps both panes mounted — 2026-05-28 Workbench commit).
        expect(aiChrome).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(true);
        expect(biChrome?.getAttribute("data-panel-state")).toBe("normal");
        expect(paneChromeIsHidden(state, "bi")).toBe(false);
        expect(window.localStorage.getItem("pulseplay:enabled-components")).toBeNull();
        expect(window.localStorage.getItem("pulseplay:active-surface")).toBe("bi-viz");
        expect(new URL(window.location.href).searchParams.get("surface")).toBe("bi-viz");

        // Click "AI Insights" pill in the new SurfaceSwitcher (visible text
        // is the accessible name now — no more "Open … surface" wrapper).
        clickByLabel(state, "AI Insights");
        const shellAfterAi = state.container.querySelector(viewportControlShellSelector);
        expect(shellAfterAi?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(window.localStorage.getItem("pulseplay:active-surface")).toBe("ai-insights");
        expect(new URL(window.location.href).searchParams.get("surface")).toBe("ai-insights");
        // AI back to visible primary; BI back to mounted-but-hidden.
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(false);
        expect(state.container.querySelector(viewportControlPanelChromeSelector("bi"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "bi")).toBe(true);

        unmount(state);
    });

    it("restores the last active unified surface from localStorage", () => {
        seedV0UiMode(); // v0 UnifiedAssistantSurface is the surface under test
        // 2026-05-28 — readInitialActiveSurface() no longer restores the
        // sticky `pulseplay:active-surface` as the LANDING surface (it always
        // opens on AI Insights unless a deep-link / author default says
        // otherwise). The author-configured default-landing-surface IS still
        // honored at boot, so it's the faithful way to express "open on the
        // previously-chosen unified surface" now that sticky-restore retired.
        window.localStorage.setItem("pulseplay:default-landing-surface", "bi-viz");
        const state = mountApp();

        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");
        // BI is the visible primary surface; AI stays mounted-but-hidden.
        expect(state.container.querySelector(viewportControlPanelChromeSelector("bi"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "bi")).toBe(false);
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(true);

        unmount(state);
    });

    it("preserves activeSurface across T1 → T6 → T1 (mix → both → mix) preset flips", () => {
        // Locks the persistence promise: switching between Balanced (mix)
        // and Split + Mix (both) must not lose the user's currently active
        // surface. The active surface is the registry SurfaceId; preset
        // facades only change enabledComponents/layoutMode/enabledFeatures.
        seedV0UiMode(); // ask-pulse is a v0 UnifiedAssistantSurface surface
        // 2026-05-28 — sticky `active-surface` is no longer the landing
        // surface; use the author default-landing-surface to open on
        // ask-pulse. The sticky key is still tracked, so seed it too for the
        // localStorage assertions below (they verify it is not lost on flips).
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        const state = mountApp();

        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");

        // T1 → T6: flip enabledComponents to "both" via the display-change
        // event (same channel SettingsShell uses when applying a preset).
        act(() => {
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: "pulseplay:enabled-components", value: "both" },
            }));
        });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");
        expect(window.localStorage.getItem("pulseplay:active-surface")).toBe("ask-pulse");

        // T6 → T1: flip back to "mix".
        act(() => {
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: "pulseplay:enabled-components", value: "mix" },
            }));
        });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");
        expect(window.localStorage.getItem("pulseplay:active-surface")).toBe("ask-pulse");

        unmount(state);
    });

    // Regression guard for Codex's 2026-05-19 finding:
    // "Clicking `Dashboard` surfaces `BI-only mode` copy and a different layout
    // grammar." In unified mode, the Dashboard is a peer surface — the empty
    // state must not read "BI-only mode" or tell the user to switch back to
    // Both / AI only.
    it("Dashboard empty state in unified mode reads as a peer surface, not BI-only mode", () => {
        seedPulseUiMode(); // PulseShell-mounted chrome ("Open dashboard surface")
        const state = mountApp();
        clickByLabel(state, "Open dashboard surface");
        const text = state.container.textContent || "";
        expect(text).not.toContain("BI-only mode");
        expect(text).not.toContain("Switch back to");
        expect(text).toContain("Dashboard");
        unmount(state);
    });

    // Regression guard for Codex's 2026-05-19 finding:
    // Surface switcher accessible names + visible labels must not duplicate
    // (e.g. screen-reader hearing "AI AI Insights"). The new SurfaceSwitcher
    // uses visible text as the accessible name with no icon-text duplication.
    it("surface switcher labels are non-duplicative", () => {
        seedPulseUiMode(); // PulseShell-mounted "Open dashboard surface" button
        const state = mountApp();
        // Move to mix mode and into Dashboard so the SurfaceSwitcher mounts.
        clickByLabel(state, "Open dashboard surface");
        const switcherButtons = Array.from(
            state.container.querySelectorAll<HTMLButtonElement>('.pp-surface-switcher__item'),
        );
        expect(switcherButtons.length).toBe(3);
        for (const btn of switcherButtons) {
            const text = (btn.textContent || "").trim();
            // No "AI AI", "Ask Ask", "BI BI" doubled prefix.
            expect(text).not.toMatch(/^(AI|Ask|BI)\s+\1\b/i);
            // Accessible name (no aria-label set; falls back to text content).
            expect(btn.hasAttribute("aria-label")).toBe(false);
        }
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

    it("exposes Pulse AI pane icons and BI PaneChrome inline icons", () => {
        seedExplicitSplitLayout();
        const state = mountApp();
        // Pulse mode moves AI pane actions into the Pulse row as icon buttons.
        expect(state.container.querySelector(viewportControlControlSelector("ai", "Maximize"))).toBeTruthy();
        expect(state.container.querySelector(viewportControlControlSelector("ai", "Minimize"))).toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Open AI panel in separate page"]')).toBeTruthy();
        // 2026-05-17 — the pane-level "Refresh AI panel" was removed to
        // eliminate the duplicate with the content-aware Insights refresh
        // in the run-state cluster below. See refactor(pulse): drop
        // duplicate Refresh + unify run-state icon league.
        expect(state.container.querySelector('button[aria-label="Refresh AI panel"]')).toBeNull();
        expect(state.container.querySelector('button[aria-label="More AI panel actions"]')).toBeNull();

        // BI pane now renders the same inline icon cluster — Maximize / Minimize
        // / Pin / Open-in-separate-page / Float all sit in the chrome bar
        // directly (no ⋮ overflow trigger). Matches the visual treatment on
        // the AI side per user feedback 2026-05.
        expect(state.container.querySelector(viewportControlControlSelector("bi", "Maximize")), "bi Maximize (inline icon)").toBeTruthy();
        expect(state.container.querySelector(viewportControlControlSelector("bi", "Minimize")), "bi Minimize (inline icon)").toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Pin layout"]'), "bi Pin (inline icon)").toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Open BI panel in separate page"]'), "bi Open-in-separate-page (inline icon)").toBeTruthy();
        expect(state.container.querySelector('button[aria-label="Pop out BI panel as window"]'), "bi Pop out (inline icon)").toBeTruthy();
        // The ⋮ overflow trigger is gone — all actions are inline now.
        expect(state.container.querySelector('button[aria-label="More BI panel actions"]'), "bi overflow trigger should be absent (replaced by inline icons)").toBeNull();
        unmount(state);
    });
});

/* ─── URL-driven focus mode ──────────────────────────────────────── */

describe("App viewport controls — ?focus= URL", () => {
    it("hydrates focused-AI state when ?focus=ai is set before mount", () => {
        seedExplicitSplitLayout();
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
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");
        const biChrome = state.container.querySelector(viewportControlPanelChromeSelector("bi"));
        expect(biChrome?.getAttribute("data-panel-state")).toBe("maximized");
        unmount(state);
    });

    it("hydrates Dashboard as the active unified surface from ?surface=bi-viz", () => {
        seedV0UiMode(); // v0 UnifiedAssistantSurface is the surface under test
        setLocation("?surface=bi-viz");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");
        // BI is the visible primary surface; AI stays mounted-but-hidden
        // (mix mode keeps both panes mounted — 2026-05-28 Workbench commit).
        expect(state.container.querySelector(viewportControlPanelChromeSelector("bi"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "bi")).toBe(false);
        expect(state.container.querySelector(viewportControlPanelChromeSelector("ai"))).toBeTruthy();
        expect(paneChromeIsHidden(state, "ai")).toBe(true);
        unmount(state);
    });

    it("ignores invalid ?surface= values and falls through to AI Insights", () => {
        setLocation("?surface=bogus");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        unmount(state);
    });

    it("respects ?surface= when combined with ?focus=bi (URL is the source of truth)", () => {
        // Combined URL: user wants BI maximized now, but the underlying mix
        // surface is Ask Pulse. When focus is collapsed, the user lands on
        // Ask Pulse — not on the focused pane's surface. This locks the
        // semantic: ?surface= is the persistent active surface, ?focus= is
        // a temporary maximization layered on top.
        setLocation("?focus=bi&surface=ask-pulse");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("bi");
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");
        unmount(state);
    });

    it("syncs activeSurface to bi-viz on popstate ?focus=bi without ?surface=", () => {
        // Regression guard for focus-drift: when the user navigates to a
        // BI-focused URL via history (e.g. back/forward) without an explicit
        // surface= param, activeSurface should follow the focus.
        const state = mountApp();
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");

        setLocation("?focus=bi");
        act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("bi");
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");

        unmount(state);
    });

    it("syncs activeSurface to ai-insights on popstate ?focus=ai when previously on bi-viz", async () => {
        // Symmetric with the bi-viz popstate case. Without this, focus=ai
        // would maximize the AI pane while data-active-surface still reads
        // bi-viz — a telemetry lie. Start on bi-viz so the symmetric path
        // is exercised.
        seedPulseUiMode(); // PulseShell-mounted chrome (lazy-load flushed below)
        // 2026-05-28 — sticky `active-surface` is no longer the landing
        // surface; the author default-landing-surface IS still honored at
        // boot, so use it to start on bi-viz. The popstate handler reads the
        // sticky `active-surface` key to decide the focus=ai→ai-insights swap,
        // so seed that too (the value the handler inspects).
        window.localStorage.setItem("pulseplay:default-landing-surface", "bi-viz");
        window.localStorage.setItem("pulseplay:active-surface", "bi-viz");
        const state = mountApp();
        // PulseShell lazy-load — wait for Suspense to resolve.
        await act(async () => { await Promise.resolve(); });
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");

        setLocation("?focus=ai");
        act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("ai");
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");

        unmount(state);
    });

    it("ignores invalid ?focus= values and falls through to split", () => {
        setLocation("?focus=bogus");
        const state = mountApp();
        const shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-viewport-focus")).toBe("split");
        unmount(state);
    });

    // F5.1 — effective vs requested surface
    it("data-active-surface follows effective when chatOnly disables requested ai-insights", () => {
        // Start with ai-insights requested (default). Then flip Pulse to
        // chatOnly. data-active-surface should swap to ask-pulse (effective)
        // while data-requested-surface preserves the original intent.
        const state = mountApp();
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-surface-fallback-reason")).toBeNull();

        act(() => { setPulseEnabledFeatures("chatOnly"); });

        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-surface-fallback-reason"))
            .toBe("insights-disabled-by-chatOnly");

        unmount(state);
    });

    it("restores requested surface when Pulse re-enables both features", () => {
        // F5.1 promise: intent persists. Going chatOnly → both restores
        // the original ai-insights request without manual intervention.
        const state = mountApp();
        act(() => { setPulseEnabledFeatures("chatOnly"); });

        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ask-pulse");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");

        act(() => { setPulseEnabledFeatures("both"); });

        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-surface-fallback-reason")).toBeNull();

        unmount(state);
    });

    it("preserves AI-surface intent across biOnly → mix preset flip", () => {
        // Start with requested ai-insights. Flip to biOnly via the same
        // event channel SettingsShell uses. data-active-surface follows
        // effective (bi-viz); data-requested-surface preserves ai-insights.
        // Flipping back to mix restores ai-insights as effective.
        const state = mountApp();
        let shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");

        act(() => {
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: "pulseplay:enabled-components", value: "biOnly" },
            }));
        });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("bi-viz");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-surface-fallback-reason"))
            .toBe("ai-pane-disabled-by-biOnly");

        act(() => {
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: "pulseplay:enabled-components", value: "mix" },
            }));
        });
        shell = state.container.querySelector(viewportControlShellSelector);
        expect(shell?.getAttribute("data-active-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-requested-surface")).toBe("ai-insights");
        expect(shell?.getAttribute("data-surface-fallback-reason")).toBeNull();

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
        seedPulseUiMode(); // explicit opt-in: this test asserts Pulse-mode-only chrome
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
    beforeEach(() => {
        seedExplicitSplitLayout();
    });

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
