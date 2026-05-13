// playground/src/App.tsx
//
// PulsePlay shell — left sidebar with the AI assistant, main canvas with
// the active BI panel. Vendor picker top-left lets the user switch
// between Power BI / Tableau / Qlik / Looker / generic iframe; the
// embed config form right below it is vendor-specific (rendered by the
// adapter's optional configurator component, or a simple URL field for
// the generic-iframe fallback).
//
// The AI sidebar is the WHOLE point of PulsePlay — it stays mounted as
// the user switches vendors, accumulating context (which page they
// looked at, which filters they applied) across the session and using
// the same proxy backend (Genie / Azure OpenAI / Bedrock / foundation
// model) we proved out in DwD_AI_Assistant_for_PBI cycles 1-47.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { BIPanel } from "./biPanel/BIPanel";
import { listVendors } from "./biPanel/registry";
import type { BIAdapter, BICapabilities, BICommand, BIEvent, BIEmbedConfig } from "./biPanel/BIAdapter";
import type powerbi from "./pulse/_adapter/powerbi-visuals-api";
import { AISidebar } from "./components/AISidebar";
import { VendorPicker } from "./components/VendorPicker";
import { ConnectorPicker } from "./components/ConnectorPicker";
import { EmbedConfigForm } from "./components/EmbedConfigForm";
import { TestConnectionPanel } from "./components/TestConnectionPanel";
import { PackPicker } from "./components/PackPicker";
import type { PackInfo, PackSelection } from "./components/PackPicker";
import type { ConnectorProbeResult } from "./types/probe";
import type { PulsePlayAllowlist } from "./types/allowlist";
import { probeConnector } from "./lib/probeClient";
import { SettingsProvider } from "./settings/settingsStore";
import { SettingsShell } from "./settings/SettingsShell";
import { useSettingsRoute, navigateToSettings } from "./settings/settingsRoute";
import { KnowledgeShell } from "./knowledge/KnowledgeShell";
import { useKnowledgeRoute } from "./knowledge/knowledgeRoute";
// PERF — lazy-load PulseShell so the 642 KB pulse chunk isn't on the
// first-paint critical path. The brand strip + top bar render
// instantly while pulse fetches in parallel. v0 mode (which doesn't
// import pulse at all) is unaffected.
const PulseShell = lazy(() =>
    import("./components/PulseShell").then(m => ({ default: m.PulseShell }))
);

/** UI mode toggle — "pulse" mounts the full ported Pulse experience in
 *  the left panel (Insights tab + Chat tab + SetupPanel + all the
 *  iterated UX); "v0" mounts the Smart-Connect-flavoured v0 components
 *  we built in cycles B + C. Both modes keep the BI canvas on the right
 *  so the multi-BI host stays usable. Cycle F lets the panels be
 *  positioned freely (left/right/top/bottom/floating). */
type UiMode = "pulse" | "v0";
const UI_MODE_STORAGE_KEY = "pulseplay:ui-mode";

/** Cycle E.3 — analogous to Pulse's existing "Insights / Chat / Both"
 *  enabled-features toggle, but at the OUTER playground level: which
 *  panels render at all. "aiOnly" hides the BI canvas (handy for a
 *  chat-only deployment); "biOnly" hides the AI side (handy when
 *  embedding PulsePlay as a BI viewer in another shell); "both"
 *  (default) keeps everything visible. Persists in localStorage. */
type EnabledComponents = "aiOnly" | "biOnly" | "both";
const ENABLED_COMPONENTS_STORAGE_KEY = "pulseplay:enabled-components";

/** Cycle F — author-picked layout. Where the AI panel sits relative to
 *  the BI canvas. Floating mode (drag-to-position) is a future iteration;
 *  the four split modes cover most needs. */
type LayoutMode = "ai-left" | "ai-right" | "ai-top" | "ai-bottom";
const LAYOUT_MODE_STORAGE_KEY = "pulseplay:layout-mode";

/** Cycle K — how many BI tiles render inside the BI pane. Authors who
 *  want side-by-side comparison (same dashboard with different filters,
 *  or two views from a chained drill-down) pick 2 or 4. v1 ships SHARED
 *  embed config — all tiles render the same source. Per-tile content
 *  (different URL per tile, mixing vendors per tile) is a future cycle. */
type BiTileMode = "1" | "2" | "4";
const BI_TILE_MODE_STORAGE_KEY = "pulseplay:bi-tile-mode";
const BI_VENDOR_STORAGE_KEY = "pulseplay:bi-vendor";
type ViewportPane = "ai" | "bi";
type ViewportFocus = ViewportPane | null;
const PINNED_VIEWPORT_PANE_STORAGE_KEY = "pulseplay:pinned-viewport-pane";

interface PowerBIDeveloperSnapshot {
    vendor: "powerbi";
    displayName: "Power BI";
    mountMode: "unmounted" | "sdk" | "secure-iframe";
    permissions: "View" | "Edit";
    capabilities: BICapabilities;
    iframe?: { src: string };
    pages?: Array<{ name?: string; displayName?: string; isActive?: boolean }>;
    activePage?: { name?: string; displayName?: string };
    filters?: unknown[];
    notes: string[];
    errors: string[];
}

type PowerBIDeveloperAdapter = BIAdapter & {
    getDeveloperSnapshot?: () => Promise<PowerBIDeveloperSnapshot>;
};

interface PowerBIDevLogEntry {
    at: string;
    action: string;
    status: "ok" | "error";
    message: string;
}

function readInitialBiVendor(): string {
    if (typeof window === "undefined") return "powerbi";
    try {
        return window.localStorage.getItem(BI_VENDOR_STORAGE_KEY) || "powerbi";
    } catch { /* swallow */ }
    return "powerbi";
}

function readPulseAssistantProfile(): string {
    if (typeof window === "undefined") return "";
    try {
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        return typeof parsed?.assistantProfile === "string" ? parsed.assistantProfile.trim() : "";
    } catch { /* swallow */ }
    return "";
}

function readInitialUiMode(): UiMode {
    if (typeof window === "undefined") return "pulse";
    try {
        const stored = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
        if (stored === "pulse" || stored === "v0") return stored;
    } catch { /* swallow */ }
    return "pulse";
}

function readInitialEnabledComponents(): EnabledComponents {
    if (typeof window === "undefined") return "both";
    try {
        const stored = window.localStorage.getItem(ENABLED_COMPONENTS_STORAGE_KEY);
        if (stored === "aiOnly" || stored === "biOnly" || stored === "both") return stored;
    } catch { /* swallow */ }
    return "both";
}

function readInitialLayoutMode(): LayoutMode {
    if (typeof window === "undefined") return "ai-left";
    try {
        const stored = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
        if (stored === "ai-left" || stored === "ai-right" || stored === "ai-top" || stored === "ai-bottom") {
            return stored;
        }
    } catch { /* swallow */ }
    return "ai-left";
}

function readInitialBiTileMode(): BiTileMode {
    if (typeof window === "undefined") return "1";
    try {
        const stored = window.localStorage.getItem(BI_TILE_MODE_STORAGE_KEY);
        if (stored === "1" || stored === "2" || stored === "4") return stored;
    } catch { /* swallow */ }
    return "1";
}

function normalizeViewportPane(value: string | null): ViewportFocus {
    return value === "ai" || value === "bi" ? value : null;
}

function readViewportFocusFromUrl(): ViewportFocus {
    if (typeof window === "undefined") return null;
    try {
        return normalizeViewportPane(new URL(window.location.href).searchParams.get("focus"));
    } catch { /* swallow */ }
    return null;
}

function readInitialPinnedViewportPane(): ViewportFocus {
    if (typeof window === "undefined") return null;
    try {
        return normalizeViewportPane(window.localStorage.getItem(PINNED_VIEWPORT_PANE_STORAGE_KEY));
    } catch { /* swallow */ }
    return null;
}

function readInitialViewportFocus(): ViewportFocus {
    return readViewportFocusFromUrl() ?? readInitialPinnedViewportPane();
}

function writeViewportFocusToUrl(next: ViewportFocus) {
    if (typeof window === "undefined") return;
    try {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("focus", next);
        else url.searchParams.delete("focus");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* swallow */ }
}

function buildFocusedPaneUrl(pane: ViewportPane): string {
    if (typeof window === "undefined") return "";
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("focus", pane);
        return url.toString();
    } catch { /* swallow */ }
    return "";
}

/** Cycle J — layoutMode now controls the PanelGroup direction + which
 *  panel sits first (see `renderSplitLayout` below). The flex-based
 *  layout helpers and hard sidebar caps are gone; the user drags the
 *  divider to size each pane, and the choice persists via PanelGroup's
 *  `autoSaveId`. */

/** App entry — wraps PulsePlay with the SettingsProvider, then renders
 *  either the Settings page or the playground based on the route. */
export function App(): React.ReactElement {
    return (
        <SettingsProvider>
            <AppRouted />
        </SettingsProvider>
    );
}

/** Renders <SettingsShell /> when the URL is /settings*, <KnowledgeShell />
 *  when the URL is /knowledge*, else the playground. Also wires the
 *  global `Cmd/Ctrl+,` shortcut to open Settings (and `Esc` to close,
 *  handled inside the page shells). */
function AppRouted(): React.ReactElement {
    const settingsRoute = useSettingsRoute();
    const knowledgeRoute = useKnowledgeRoute();

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ",") {
                e.preventDefault();
                navigateToSettings();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    if (knowledgeRoute.isKnowledgeRoute) {
        return <KnowledgeShell />;
    }
    if (settingsRoute.isSettingsRoute) {
        return <SettingsShell />;
    }
    return <PlaygroundApp />;
}

/** The existing playground shell. Renders at "/" and any non-/settings
 *  pathname. Settings state is read via SettingsProvider when the
 *  playground needs it; for now the playground keeps its own copies of
 *  the legacy storage keys for backward compatibility with Pulse Cycle H
 *  and the inline forms. Phase 5 retires those duplicates. */
function PlaygroundApp(): React.ReactElement {
    const vendors = useMemo(() => listVendors(), []);
    const [allowlistState, setAllowlistState] = useState<{
        allowlist: PulsePlayAllowlist | null;
        error: string;
    }>({ allowlist: null, error: "" });
    const [availablePacks, setAvailablePacks] = useState<PackInfo[]>([]);
    const [packsLoaded, setPacksLoaded] = useState(false);
    const visibleVendors = useMemo(() => {
        if (!allowlistState.allowlist?.configured) return vendors;
        const allowed = allowlistState.allowlist.biProviders || [];
        return vendors.filter(v => allowed.includes(v.vendor));
    }, [allowlistState.allowlist, vendors]);
    // PulsePlay's 2-axis abstraction:
    //   activeVendor    = Y-axis: which BI tool is loaded in the canvas
    //   activeConnector = X-axis: which AI brain the sidebar talks to
    // Both pickers are independent — any cell of the matrix is valid.
    const [activeVendor, setActiveVendor] = useState<string>(() => readInitialBiVendor());
    const [activeConnector, setActiveConnector] = useState<string>("");
    const [embedConfig, setEmbedConfig] = useState<BIEmbedConfig>({});
    const [recentEvents, setRecentEvents] = useState<BIEvent[]>([]);
    // UI mode persists across reloads. Pulse is default — that's the
    // user-confirmed direction (port carries forward).
    const [uiMode, setUiMode] = useState<UiMode>(() => readInitialUiMode());
    const [enabledComponents, setEnabledComponents] = useState<EnabledComponents>(
        () => readInitialEnabledComponents(),
    );
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => readInitialLayoutMode());
    const [biTileMode, setBiTileMode] = useState<BiTileMode>(() => readInitialBiTileMode());
    const [focusedPane, setFocusedPane] = useState<ViewportFocus>(() => readInitialViewportFocus());
    const [pinnedViewportPane, setPinnedViewportPane] = useState<ViewportFocus>(() => readInitialPinnedViewportPane());
    const biAdaptersRef = useRef<Map<number, BIAdapter>>(new Map());
    const [primaryBIAdapter, setPrimaryBIAdapter] = useState<BIAdapter | null>(null);
    // Bumping renderToken nudges PulseShell to re-call visual.update(),
    // used after settings save events from PulseHostStub.persistProperties.
    const [pulseRenderToken, setPulseRenderToken] = useState(0);
    const [pulseAssistantProfile, setPulseAssistantProfile] = useState<string>(() => readPulseAssistantProfile());

    useEffect(() => {
        let cancelled = false;
        async function loadGovernanceState() {
            try {
                const [allowlistResp, packsResp] = await Promise.all([
                    fetch("/api/assistant/allowlist"),
                    fetch("/api/assistant/knowledge/packs"),
                ]);
                const nextAllowlist = allowlistResp.ok
                    ? await allowlistResp.json() as PulsePlayAllowlist
                    : null;
                const nextPacksPayload = packsResp.ok
                    ? await packsResp.json() as { packs?: PackInfo[] }
                    : { packs: [] };
                if (cancelled) return;
                setAllowlistState({
                    allowlist: nextAllowlist,
                    error: nextAllowlist ? "" : `Allowlist unavailable (HTTP ${allowlistResp.status}).`,
                });
                setAvailablePacks(Array.isArray(nextPacksPayload.packs) ? nextPacksPayload.packs : []);
                setPacksLoaded(true);
            } catch (err) {
                if (cancelled) return;
                setAllowlistState({
                    allowlist: null,
                    error: err instanceof Error ? err.message : String(err),
                });
                setAvailablePacks([]);
                setPacksLoaded(true);
            }
        }
        void loadGovernanceState();
        return () => { cancelled = true; };
    }, []);
    const handleUiModeChange = useCallback((next: UiMode) => {
        setUiMode(next);
        try { window.localStorage.setItem(UI_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);
    const handleEnabledComponentsChange = useCallback((next: EnabledComponents) => {
        setEnabledComponents(next);
        try { window.localStorage.setItem(ENABLED_COMPONENTS_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);
    const handleLayoutModeChange = useCallback((next: LayoutMode) => {
        setLayoutMode(next);
        try { window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);

    const applyViewportFocus = useCallback((next: ViewportFocus) => {
        setFocusedPane(next);
        writeViewportFocusToUrl(next);
    }, []);

    const handleViewportRestore = useCallback(() => {
        applyViewportFocus(null);
    }, [applyViewportFocus]);

    const handleViewportMinimize = useCallback((pane: ViewportPane) => {
        setFocusedPane(null);
        writeViewportFocusToUrl(null);
        handleEnabledComponentsChange(pane === "ai" ? "biOnly" : "aiOnly");
        if (pinnedViewportPane === pane) {
            setPinnedViewportPane(null);
            try { window.localStorage.removeItem(PINNED_VIEWPORT_PANE_STORAGE_KEY); } catch { /* swallow */ }
        }
    }, [handleEnabledComponentsChange, pinnedViewportPane]);

    const handleViewportPinToggle = useCallback((pane: ViewportPane) => {
        setPinnedViewportPane(prev => {
            const next = prev === pane ? null : pane;
            try {
                if (next) window.localStorage.setItem(PINNED_VIEWPORT_PANE_STORAGE_KEY, next);
                else window.localStorage.removeItem(PINNED_VIEWPORT_PANE_STORAGE_KEY);
            } catch { /* swallow */ }
            return next;
        });
    }, []);

    const handleViewportOpenPage = useCallback((pane: ViewportPane) => {
        const url = buildFocusedPaneUrl(pane);
        if (!url) return;
        window.open(url, "_blank", "noopener,noreferrer");
    }, []);

    const handleShowBothPanes = useCallback(() => {
        setFocusedPane(null);
        writeViewportFocusToUrl(null);
        handleEnabledComponentsChange("both");
    }, [handleEnabledComponentsChange]);

    useEffect(() => {
        try { window.localStorage.setItem(BI_VENDOR_STORAGE_KEY, activeVendor); } catch { /* swallow */ }
    }, [activeVendor]);

    useEffect(() => {
        if (!visibleVendors.some(v => v.vendor === activeVendor)) {
            setActiveVendor(visibleVendors[0]?.vendor || "powerbi");
            setEmbedConfig({});
        }
    }, [activeVendor, visibleVendors]);

    // Cycle H — the Display tab inside Pulse's Developer Tools modal writes
    // the same three localStorage keys this component owns and dispatches a
    // `pulseplay:display-change` window event. We listen and sync React
    // state so toggles from the Display tab take effect immediately without
    // a reload.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (!detail || typeof detail.value !== "string") return;
            if (detail.key === UI_MODE_STORAGE_KEY && (detail.value === "pulse" || detail.value === "v0")) {
                setUiMode(detail.value);
            } else if (detail.key === ENABLED_COMPONENTS_STORAGE_KEY && (detail.value === "aiOnly" || detail.value === "biOnly" || detail.value === "both")) {
                setEnabledComponents(detail.value);
            } else if (detail.key === LAYOUT_MODE_STORAGE_KEY && (detail.value === "ai-left" || detail.value === "ai-right" || detail.value === "ai-top" || detail.value === "ai-bottom")) {
                setLayoutMode(detail.value);
            } else if (detail.key === BI_TILE_MODE_STORAGE_KEY && (detail.value === "1" || detail.value === "2" || detail.value === "4")) {
                setBiTileMode(detail.value);
            }
        };
        window.addEventListener("pulseplay:display-change", handler as EventListener);
        return () => window.removeEventListener("pulseplay:display-change", handler as EventListener);
    }, []);

    useEffect(() => {
        const handler = () => setFocusedPane(readViewportFocusFromUrl());
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, []);

    const aiVisible = enabledComponents === "aiOnly" || enabledComponents === "both";
    const biVisible = enabledComponents === "biOnly" || enabledComponents === "both";
    const mountedAiVisible = focusedPane ? focusedPane === "ai" || aiVisible : aiVisible;
    const mountedBiVisible = focusedPane ? focusedPane === "bi" || biVisible : biVisible;
    const minimizedPane: ViewportFocus = !focusedPane && enabledComponents === "biOnly"
        ? "ai"
        : !focusedPane && enabledComponents === "aiOnly"
            ? "bi"
            : null;
    // Smart Connect state — populated by TestConnectionPanel's probe and the
    // user's pack confirmation (which may override the inferred suggestion).
    // See docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md for the design.
    const [probeResult, setProbeResult] = useState<ConnectorProbeResult | null>(null);
    const [packSelection, setPackSelection] = useState<PackSelection | null>(null);

    useEffect(() => {
        if (!packsLoaded || !packSelection?.pack) return;
        const pack = availablePacks.find(p => p.name === packSelection.pack);
        const subOk = !packSelection.subVertical
            || !!pack?.subVerticals?.some(sv => sv.name === packSelection.subVertical);
        if (!pack || !subOk) setPackSelection(null);
    }, [availablePacks, packSelection, packsLoaded]);

    // Buffer the last ~20 BI events so the AI sidebar can include "what is
    // the user actually looking at right now?" in its prompt context. Same
    // pattern as DwD_AI_Assistant_for_PBI's contextBuilder, just sourced
    // from BI vendor events instead of Power BI's DataView.
    const handleBIEvent = useCallback((event: BIEvent) => {
        setRecentEvents(prev => {
            const next = [...prev, event];
            return next.length > 20 ? next.slice(-20) : next;
        });
    }, []);

    const handleBIAdapterReady = useCallback((index: number, adapter: BIAdapter | null) => {
        if (adapter) biAdaptersRef.current.set(index, adapter);
        else biAdaptersRef.current.delete(index);
        setPrimaryBIAdapter(biAdaptersRef.current.get(0) || null);
    }, []);

    const handlePulseApplyFilter = useCallback((
        filter: powerbi.IFilter | powerbi.IFilter[] | null,
        action: powerbi.FilterAction,
    ) => {
        const commands = commandsFromPulseFilter(filter, action);
        if (commands.length === 0) return;
        const adapters = [...biAdaptersRef.current.values()];
        if (adapters.length === 0) return;
        void Promise.allSettled(
            adapters.flatMap(adapter => commands.map(command => adapter.send(command))),
        ).then(results => {
            const rejected = results.find(r => r.status === "rejected");
            if (rejected && rejected.status === "rejected") {
                console.warn("[PulsePlay] BI action bridge failed:", rejected.reason);
            }
        });
    }, []);

    // Probe completion: persist the result and preselect the pack ONLY if
    // the user hasn't already chosen one (author-final-say rule from
    // CONNECTOR_PROBE_AND_SMART_CONNECT.md).
    const handleProbeComplete = useCallback((result: ConnectorProbeResult) => {
        setProbeResult(result);
        const inferred = result.inference;
        if (inferred?.suggestedPack) {
            setPackSelection(prev => prev ?? {
                pack: inferred.suggestedPack as string,
                subVertical: inferred.suggestedSubVertical,
            });
        }
    }, []);

    // Smart Connect for Pulse mode — Pulse owns its own Setup wizard
    // (no v0 ConnectorPicker / TestConnectionPanel in Pulse mode), so
    // we auto-fire the probe whenever the persisted genieSettings.
    // assistantProfile changes. Bumps pulseRenderToken signal that
    // Pulse persisted settings; we also re-read on first mount.
    useEffect(() => {
        if (uiMode !== "pulse") return;
        let cancelled = false;
        try {
            const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
            if (!raw) {
                setPulseAssistantProfile("");
                return;
            }
            const parsed = JSON.parse(raw);
            const profile = (parsed?.assistantProfile || "").trim();
            setPulseAssistantProfile(profile);
            if (!profile) return;
            // Skip if we already probed this profile (probeResult.profile holds the last probed key).
            if (probeResult?.profile === profile) return;
            void probeConnector(profile).then(result => {
                if (cancelled) return;
                handleProbeComplete(result);
            }).catch(() => { /* probe failure is non-fatal — Smart Connect is best-effort */ });
        } catch { /* swallow */ }
        return () => { cancelled = true; };
    }, [uiMode, pulseRenderToken, probeResult, handleProbeComplete]);

    // Bridge — write the active pack selection to localStorage so Pulse's
    // genie.ts can pick it up and forward to /assistant/conversations/start
    // (the proxy's cycle-C pack-context injection then wraps the prompt
    // with vertical vocabulary). Cleared on explicit null.
    useEffect(() => {
        try {
            if (packSelection?.pack) {
                window.localStorage.setItem("pulseplay:pack-selection", JSON.stringify(packSelection));
            } else {
                window.localStorage.removeItem("pulseplay:pack-selection");
            }
        } catch { /* swallow */ }
    }, [packSelection]);

    // Switching connectors invalidates probe + pack selection so the next
    // probe runs fresh against the new profile.
    const handleConnectorChange = useCallback((next: string) => {
        setActiveConnector(next);
        setProbeResult(null);
        setPackSelection(null);
    }, []);

    const hasEmbedConfig = Object.keys(embedConfig).length > 0;
    const probeSuggested: PackSelection | undefined =
        probeResult?.inference?.suggestedPack
            ? {
                  pack: probeResult.inference.suggestedPack,
                  subVertical: probeResult.inference.suggestedSubVertical,
              }
            : undefined;

    return (
        <div
            className="pp-app"
            data-testid="pp-viewport-shell"
            data-viewport-focus={focusedPane ?? "split"}
            data-layout-pinned={pinnedViewportPane ? "true" : "false"}
            style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
            {/* PulsePlay top bar — full-width header strip. Branding on
              * the left; the connection pill (rendered by Pulse via
              * position: fixed) lands on the right inline with this
              * branding. Replaces the in-AI-pane brand block so the
              * header reads as a single horizontal row across the app. */}
            <header
                className="pp-top-bar"
                style={{
                    flex: "0 0 auto",
                    display: focusedPane ? "none" : "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    background: "transparent",
                }}
            >
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>PulsePlay</h1>
                    <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.7 }}>
                        AI playground · multi-BI host
                    </p>
                </div>
                {/* Right slot — the pill drops in here visually via
                  *  `position: fixed` from inside Pulse. We leave the slot
                  *  empty so when the pill ISN'T mounted (v0 mode, or
                  *  biOnly without Pulse) the bar stays clean. */}
                <div style={{ minWidth: 1 }} aria-hidden="true" />
            </header>
            {/* Floating gear — shown when the pill won't be available:
              * v0 mode (no Pulse), or biOnly mode (Pulse not mounted).
              * Otherwise the pill in the top bar is the single entry. */}
            {!focusedPane && (uiMode === "v0" || !aiVisible) && (
                <PulsePlaySettingsGear
                    uiMode={uiMode}
                    onUiModeChange={handleUiModeChange}
                    enabledComponents={enabledComponents}
                    onEnabledComponentsChange={handleEnabledComponentsChange}
                    layoutMode={layoutMode}
                    onLayoutModeChange={handleLayoutModeChange}
                />
            )}
            <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}>
            <SplitLayout
                aiVisible={mountedAiVisible}
                biVisible={mountedBiVisible}
                layoutMode={layoutMode}
                focusedPane={focusedPane}
                aiContent={(
                    <PaneChrome
                        pane="ai"
                        title="AI"
                        subtitle={uiMode === "pulse" ? "Pulse assistant" : "Assistant"}
                        isFocused={focusedPane === "ai"}
                        isBackgrounded={focusedPane === "bi"}
                        isPinned={pinnedViewportPane === "ai"}
                        canShowBoth={!focusedPane && enabledComponents !== "both"}
                        onFocus={() => applyViewportFocus("ai")}
                        onRestore={handleViewportRestore}
                        onMinimize={() => handleViewportMinimize("ai")}
                        onPinToggle={() => handleViewportPinToggle("ai")}
                        onOpenPage={() => handleViewportOpenPage("ai")}
                        onShowBoth={handleShowBothPanes}
                    >
                        <aside className="pp-app__sidebar" style={panelInnerStyle()}>
                            {allowlistState.error && (
                                <div
                                    role="status"
                                    style={{
                                        padding: "8px 10px",
                                        borderBottom: "1px solid rgba(120,0,0,0.18)",
                                        background: "rgba(255,245,245,0.86)",
                                        color: "#7f1d1d",
                                        fontSize: 12,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    Governance config unavailable. Pickers may be incomplete until the proxy responds.
                                </div>
                            )}
                            {uiMode === "pulse" ? (
                                <>
                                    <PulseModeBISourcePanel
                                        vendors={visibleVendors}
                                        activeVendor={activeVendor}
                                        embedConfig={embedConfig}
                                        hasEmbedConfig={hasEmbedConfig}
                                        activeConnector={pulseAssistantProfile || activeConnector}
                                        allowlist={allowlistState.allowlist}
                                        onVendorChange={(v) => {
                                            setActiveVendor(v);
                                            setEmbedConfig({});
                                            setRecentEvents([]);
                                            biAdaptersRef.current.clear();
                                            setPrimaryBIAdapter(null);
                                        }}
                                        onEmbedConfigChange={setEmbedConfig}
                                    />
                                    <Suspense fallback={<PulseLoadingState />}>
                                        <PulseShell
                                            renderToken={pulseRenderToken}
                                            onSettingsChange={() => setPulseRenderToken(t => t + 1)}
                                            onApplyFilter={handlePulseApplyFilter}
                                            biEvents={recentEvents}
                                            biVendor={activeVendor}
                                        />
                                    </Suspense>
                                </>
                            ) : (
                                <>
                                    <VendorPicker
                                        vendors={visibleVendors}
                                        activeVendor={activeVendor}
                                        onChange={(v) => {
                                            setActiveVendor(v);
                                            setEmbedConfig({});
                                            setRecentEvents([]);
                                            biAdaptersRef.current.clear();
                                            setPrimaryBIAdapter(null);
                                        }}
                                    />
                                    <EmbedConfigForm
                                        vendor={activeVendor}
                                        value={embedConfig}
                                        onChange={setEmbedConfig}
                                        assistantProfile={activeConnector}
                                        allowlist={allowlistState.allowlist}
                                    />
                                    <ConnectorPicker
                                        activeConnector={activeConnector}
                                        onChange={handleConnectorChange}
                                    />
                                    {activeConnector && (
                                        <TestConnectionPanel
                                            profile={activeConnector}
                                            onProbeComplete={handleProbeComplete}
                                        />
                                    )}
                                    {activeConnector && (
                                        <PackPicker
                                            availablePacks={availablePacks}
                                            suggested={probeSuggested}
                                            value={packSelection}
                                            onChange={setPackSelection}
                                        />
                                    )}
                                    <AISidebar
                                        activeVendor={activeVendor}
                                        activeConnector={activeConnector}
                                        recentEvents={recentEvents}
                                        packSelection={packSelection}
                                        biAdapter={primaryBIAdapter}
                                    />
                                </>
                            )}
                        </aside>
                    </PaneChrome>
                )}
                biContent={(
                    <PaneChrome
                        pane="bi"
                        title="BI"
                        subtitle={visibleVendors.find(v => v.vendor === activeVendor)?.displayName || activeVendor}
                        isFocused={focusedPane === "bi"}
                        isBackgrounded={focusedPane === "ai"}
                        isPinned={pinnedViewportPane === "bi"}
                        canShowBoth={!focusedPane && enabledComponents !== "both"}
                        onFocus={() => applyViewportFocus("bi")}
                        onRestore={handleViewportRestore}
                        onMinimize={() => handleViewportMinimize("bi")}
                        onPinToggle={() => handleViewportPinToggle("bi")}
                        onOpenPage={() => handleViewportOpenPage("bi")}
                        onShowBoth={handleShowBothPanes}
                    >
                        <main className="pp-app__canvas" style={{ ...panelInnerStyle(), display: "flex", flexDirection: "column" }}>
                            <BITileModeToolbar value={biTileMode} />
                            <PowerBIDeveloperPanel
                                activeVendor={activeVendor}
                                hasEmbedConfig={hasEmbedConfig}
                                adapter={primaryBIAdapter}
                                recentEvents={recentEvents}
                            />
                            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                            {hasEmbedConfig ? (
                                <BITileGrid
                                    tileMode={biTileMode}
                                    vendor={activeVendor}
                                    embedConfig={embedConfig}
                                    allowlist={allowlistState.allowlist}
                                    onEvent={handleBIEvent}
                                    onAdapterReady={handleBIAdapterReady}
                                />
                            ) : (
                                <div className="pp-app__empty">
                                    {aiVisible ? (
                                        <>
                                            <h2>Pick a BI tool and supply embed config</h2>
                                            <p>
                                                PulsePlay can host {visibleVendors.map(v => v.displayName).join(" · ") || "no allowlisted BI providers"} as guests.
                                                Choose a vendor on the left, fill in its embed config, and the AI
                                                assistant will reason about whatever you load. Drag the divider to
                                                resize either pane; multi-frame BI is coming next.
                                            </p>
                                            {uiMode === "pulse" && (
                                                <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
                                                    Pulse UI is active in the AI pane. Configure the connection
                                                    via its Setup tab; the embedded BI surface will appear here.
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <h2>BI-only mode</h2>
                                            <p>
                                                AI components are hidden. Embed any BI URL below — PulsePlay is acting
                                                as a thin multi-vendor BI host. Switch back to "Both" or "AI only" via
                                                the Display tab to re-enable Pulse / v0.
                                            </p>
                                            <p style={{ marginTop: 12 }}>
                                                Vendors: {visibleVendors.map(v => v.displayName).join(" · ") || "none allowlisted"}
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                            </div>
                        </main>
                    </PaneChrome>
                )}
                emptyContent={(
                    <main className="pp-app__canvas">
                        <div className="pp-app__empty">
                            <h2>Both panels hidden</h2>
                            <p>Re-enable AI or BI via the Display tab (open via the connection pill).</p>
                        </div>
                    </main>
                )}
            />
            {minimizedPane && (
                <MinimizedPaneDock
                    pane={minimizedPane}
                    onRestore={handleShowBothPanes}
                />
            )}
            </div>
        </div>
    );
}

function PaneChrome(props: {
    pane: ViewportPane;
    title: string;
    subtitle: string;
    isFocused: boolean;
    isBackgrounded: boolean;
    isPinned: boolean;
    canShowBoth: boolean;
    onFocus: () => void;
    onRestore: () => void;
    onMinimize: () => void;
    onPinToggle: () => void;
    onOpenPage: () => void;
    onShowBoth: () => void;
    children: React.ReactNode;
}): React.ReactElement {
    const label = props.pane === "ai" ? "AI" : "BI";
    const state = props.isFocused ? "maximized" : props.isBackgrounded ? "minimized" : "normal";
    const buttonStyle: React.CSSProperties = {
        border: "1px solid rgba(0,0,0,0.14)",
        borderRadius: 4,
        background: "#fff",
        color: "#111827",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
        minHeight: 28,
        padding: "0 9px",
        whiteSpace: "nowrap",
    };
    const activeButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 600,
    };
    const focusedHeaderRightReserve = props.isFocused ? "min(228px, 50vw)" : 10;

    return (
        <section
            data-testid={`pp-panel-chrome-${props.pane}`}
            data-panel-state={state}
            data-panel-pinned={props.isPinned ? "true" : "false"}
            role="region"
            aria-label={`${label} panel`}
            style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                background: "#fff",
            }}
        >
            <div
                data-testid={`pp-panel-chrome-header-${props.pane}`}
                style={{
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: `7px ${focusedHeaderRightReserve} 7px 10px`,
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    background: props.isFocused ? "#f8fafc" : "rgba(248,250,252,0.82)",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{props.title}</div>
                    <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {props.subtitle}
                    </div>
                </div>
                <div
                    role="toolbar"
                    data-testid={`pp-panel-controls-${props.pane}`}
                    aria-label={`${label} panel controls`}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flex: "1 1 auto",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        maxWidth: "100%",
                        minWidth: 0,
                    }}
                >
                    {props.isFocused ? (
                        <button
                            type="button"
                            aria-label={`Restore ${label} panel`}
                            title="Restore split layout"
                            onClick={props.onRestore}
                            style={activeButtonStyle}
                        >
                            Restore
                        </button>
                    ) : (
                        <button
                            type="button"
                            aria-label={`Maximize ${label} panel`}
                            title={`Maximize ${label} panel`}
                            onClick={props.onFocus}
                            style={buttonStyle}
                        >
                            Maximize
                        </button>
                    )}
                    {props.canShowBoth && (
                        <button
                            type="button"
                            aria-label="Show both panels"
                            title="Show both panels"
                            onClick={props.onShowBoth}
                            style={buttonStyle}
                        >
                            Both
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={`Minimize ${label} panel`}
                        title={`Minimize ${label} panel`}
                        onClick={props.onMinimize}
                        style={buttonStyle}
                    >
                        Minimize
                    </button>
                    <button
                        type="button"
                        aria-label={props.isPinned ? "Unpin layout" : "Pin layout"}
                        title={props.isPinned ? "Unpin this focused startup layout" : "Pin this pane as the focused startup layout"}
                        aria-pressed={props.isPinned}
                        onClick={props.onPinToggle}
                        style={props.isPinned ? activeButtonStyle : buttonStyle}
                    >
                        {props.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                        type="button"
                        aria-label={`Open ${label} panel in separate page`}
                        title={`Open ${label} panel in separate page`}
                        onClick={props.onOpenPage}
                        style={buttonStyle}
                    >
                        Page
                    </button>
                </div>
            </div>
            <div
                aria-hidden={props.isBackgrounded ? true : undefined}
                style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, overflow: "hidden" }}
            >
                {props.children}
            </div>
        </section>
    );
}

function MinimizedPaneDock(props: {
    pane: ViewportPane;
    onRestore: () => void;
}): React.ReactElement {
    const label = props.pane === "ai" ? "AI" : "BI";
    return (
        <section
            data-testid={`pp-panel-chrome-${props.pane}`}
            data-panel-state="minimized"
            role="region"
            aria-label={`${label} panel`}
            style={{
                position: "absolute",
                zIndex: 20,
                left: props.pane === "ai" ? 12 : "auto",
                right: props.pane === "bi" ? 12 : "auto",
                bottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid rgba(0,0,0,0.14)",
                borderRadius: 6,
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 8px 24px rgba(15,23,42,0.16)",
            }}
        >
            <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
            <button
                type="button"
                aria-label={`Restore ${label} panel`}
                title={`Restore ${label} panel`}
                onClick={props.onRestore}
                style={{
                    border: "1px solid rgba(0,0,0,0.14)",
                    borderRadius: 4,
                    background: "#fff",
                    color: "#111827",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: 1,
                    minHeight: 28,
                    padding: "0 9px",
                    whiteSpace: "nowrap",
                }}
            >
                Restore
            </button>
        </section>
    );
}

// Cycle J — single resizable layout. When both panels are visible we
// wrap them in a `Group` from `react-resizable-panels` so the author
// can drag the divider to taste; layoutMode controls which side AI is
// on (left/right/top/bottom). When only one panel is visible we render
// it full-canvas without the group, since there's nothing to split.
// `useDefaultLayout` persists the split ratio per orientation in
// localStorage so the author's choice survives reloads.
function SplitLayout(props: {
    aiVisible: boolean;
    biVisible: boolean;
    layoutMode: LayoutMode;
    focusedPane: ViewportFocus;
    aiContent: React.ReactNode;
    biContent: React.ReactNode;
    emptyContent: React.ReactNode;
}): React.ReactElement {
    const { aiVisible, biVisible, layoutMode, focusedPane, aiContent, biContent, emptyContent } = props;

    const orientation: "horizontal" | "vertical" =
        layoutMode === "ai-top" || layoutMode === "ai-bottom" ? "vertical" : "horizontal";
    // Persist split ratio per orientation. Switching between row/column
    // layouts gets independent saved sizes so each feels natural.
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: `pulseplay:split:${orientation}`,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });

    if (!aiVisible && !biVisible) return <>{emptyContent}</>;
    if (aiVisible && !biVisible) return <>{aiContent}</>;
    if (!aiVisible && biVisible) return <>{biContent}</>;

    if (focusedPane) {
        const frame = (pane: ViewportPane, content: React.ReactNode) => {
            const isActive = focusedPane === pane;
            return (
                <div
                    key={pane}
                    aria-hidden={isActive ? undefined : true}
                    style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: isActive ? 2 : 1,
                        width: "100%",
                        height: "100%",
                        minWidth: 0,
                        minHeight: 0,
                        overflow: "hidden",
                        opacity: isActive ? 1 : 0,
                        pointerEvents: isActive ? "auto" : "none",
                        visibility: isActive ? "visible" : "hidden",
                    }}
                >
                    {content}
                </div>
            );
        };

        return (
            <div style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}>
                {frame("ai", aiContent)}
                {frame("bi", biContent)}
            </div>
        );
    }

    const aiFirst = layoutMode === "ai-left" || layoutMode === "ai-top";
    const aiDefaultSize = orientation === "horizontal" ? 35 : 40;
    const biDefaultSize = 100 - aiDefaultSize;

    const sepStyle: React.CSSProperties = orientation === "horizontal"
        ? { width: 6, background: "transparent", cursor: "col-resize", position: "relative", flexShrink: 0 }
        : { height: 6, background: "transparent", cursor: "row-resize", position: "relative", flexShrink: 0 };
    const sepInnerStyle: React.CSSProperties = orientation === "horizontal"
        ? { position: "absolute", left: 2, top: 0, width: 2, height: "100%", background: "rgba(0,0,0,0.08)" }
        : { position: "absolute", top: 2, left: 0, height: 2, width: "100%", background: "rgba(0,0,0,0.08)" };

    const aiPanel = (
        <Panel defaultSize={`${aiDefaultSize}%`} minSize="15%" id="ai">{aiContent}</Panel>
    );
    const biPanel = (
        <Panel defaultSize={`${biDefaultSize}%`} minSize="15%" id="bi">{biContent}</Panel>
    );
    const separator = (
        <Separator style={sepStyle}>
            <div style={sepInnerStyle} />
        </Separator>
    );

    return (
        <Group
            orientation={orientation}
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            style={{ width: "100%", height: "100%" }}
        >
            {aiFirst ? aiPanel : biPanel}
            {separator}
            {aiFirst ? biPanel : aiPanel}
        </Group>
    );
}

/** Inner styling for a panel's content. Removes the old hard width/height
 *  caps from sidebarStyle since the surrounding Panel now governs size;
 *  we only need the inner element to fill its panel and scroll when
 *  content overflows. */
function panelInnerStyle(): React.CSSProperties {
    return {
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        flex: "1 1 auto",
        overflow: "auto",
        overflowX: "hidden",
        boxSizing: "border-box",
    };
}

/** Cycle K.1 toolbar — three buttons (1 / 2 / 4) at the top of the BI
 *  canvas so authors can flip between single-frame, side-by-side, and
 *  2×2 tile layouts without opening the Display tab. Writes the same
 *  localStorage key + dispatches the same window event that Pulse's
 *  Display tab uses, so toggling here propagates to that tab (and vice
 *  versa) instantly via the cycle-H bridge. */
function BITileModeToolbar(props: { value: BiTileMode }): React.ReactElement {
    const apply = (next: BiTileMode) => {
        try { window.localStorage.setItem(BI_TILE_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
        try {
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: BI_TILE_MODE_STORAGE_KEY, value: next },
            }));
        } catch { /* swallow */ }
    };
    const btn = (active: boolean): React.CSSProperties => ({
        padding: "4px 10px",
        border: "1px solid",
        borderColor: active ? "#0078d4" : "rgba(0,0,0,0.16)",
        background: active ? "#0078d4" : "transparent",
        color: active ? "#fff" : "inherit",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        lineHeight: 1.4,
    });
    return (
        <div
            role="group"
            aria-label="BI tile layout"
            style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                padding: "6px 12px",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
                flex: "0 0 auto",
                background: "transparent",
            }}
        >
            <span style={{ fontSize: 11, opacity: 0.6, marginRight: 4 }}>BI tiles:</span>
            <button type="button" style={btn(props.value === "1")} onClick={() => apply("1")} aria-pressed={props.value === "1"} title="Single frame">1</button>
            <button type="button" style={btn(props.value === "2")} onClick={() => apply("2")} aria-pressed={props.value === "2"} title="Two side-by-side">2</button>
            <button type="button" style={btn(props.value === "4")} onClick={() => apply("4")} aria-pressed={props.value === "4"} title="2 × 2 grid">4</button>
        </div>
    );
}

function PowerBIDeveloperPanel(props: {
    activeVendor: string;
    hasEmbedConfig: boolean;
    adapter: BIAdapter | null;
    recentEvents: BIEvent[];
}): React.ReactElement | null {
    const [snapshot, setSnapshot] = useState<PowerBIDeveloperSnapshot | null>(null);
    const [logs, setLogs] = useState<PowerBIDevLogEntry[]>([]);
    const [busyAction, setBusyAction] = useState<string>("");
    const [filterField, setFilterField] = useState("Region");
    const [filterValues, setFilterValues] = useState("East");

    if (props.activeVendor !== "powerbi" || !props.hasEmbedConfig) return null;

    const adapter = props.adapter as PowerBIDeveloperAdapter | null;
    const capabilities = adapter?.capabilities();
    const addLog = (entry: Omit<PowerBIDevLogEntry, "at">) => {
        setLogs(prev => [
            { ...entry, at: new Date().toLocaleTimeString() },
            ...prev,
        ].slice(0, 8));
    };
    const run = async (action: string, task: () => Promise<string>) => {
        setBusyAction(action);
        try {
            const message = await task();
            addLog({ action, status: "ok", message });
        } catch (err) {
            addLog({
                action,
                status: "error",
                message: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setBusyAction("");
        }
    };
    const values = filterValues
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
    const disabled = !adapter || !!busyAction;
    const canApplyFilters = capabilities?.canApplyFilters !== false;

    return (
        <details className="pp-pbi-dev" data-ready={adapter ? "true" : "false"}>
            <summary className="pp-pbi-dev__summary">
                <span>Power BI Developer Tools</span>
                <span className="pp-pbi-dev__status">
                    {adapter ? "adapter ready" : "waiting for report"}
                    {snapshot?.mountMode ? ` · ${snapshot.mountMode}` : ""}
                </span>
            </summary>
            <div className="pp-pbi-dev__body">
                <div className="pp-pbi-dev__actions" role="group" aria-label="Power BI developer actions">
                    <button
                        type="button"
                        onClick={() => run("Snapshot", async () => {
                            if (!adapter?.getDeveloperSnapshot) throw new Error("Power BI adapter does not expose a developer snapshot.");
                            const next = await adapter.getDeveloperSnapshot();
                            setSnapshot(next);
                            return "Snapshot refreshed.";
                        })}
                        disabled={disabled}
                    >
                        Snapshot
                    </button>
                    <button
                        type="button"
                        onClick={() => run("Refresh", async () => {
                            if (!adapter) throw new Error("No live adapter.");
                            await adapter.send({ kind: "refresh" });
                            return "Refresh sent.";
                        })}
                        disabled={disabled || capabilities?.canRefresh === false}
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => run("Fullscreen", async () => {
                            if (!adapter) throw new Error("No live adapter.");
                            await adapter.send({ kind: "fullscreen", on: true });
                            return "Fullscreen requested.";
                        })}
                        disabled={disabled || capabilities?.canFullscreen === false}
                    >
                        Fullscreen
                    </button>
                    <button
                        type="button"
                        onClick={() => run("Exit fullscreen", async () => {
                            if (!adapter) throw new Error("No live adapter.");
                            await adapter.send({ kind: "fullscreen", on: false });
                            return "Exit fullscreen requested.";
                        })}
                        disabled={disabled || capabilities?.canFullscreen === false}
                    >
                        Exit
                    </button>
                </div>

                <div className="pp-pbi-dev__filter">
                    <label>
                        Field
                        <input
                            type="text"
                            value={filterField}
                            onChange={e => setFilterField(e.target.value)}
                            placeholder="Region"
                        />
                    </label>
                    <label>
                        Values
                        <input
                            type="text"
                            value={filterValues}
                            onChange={e => setFilterValues(e.target.value)}
                            placeholder="East, West"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => run("Apply filter", async () => {
                            if (!adapter) throw new Error("No live adapter.");
                            const field = filterField.trim();
                            if (!field || values.length === 0) throw new Error("Enter a field and at least one value.");
                            await adapter.send({
                                kind: "apply-filter",
                                field,
                                values: values.length === 1 ? values[0] : values,
                            });
                            return `Applied ${field} filter.`;
                        })}
                        disabled={disabled || !canApplyFilters}
                    >
                        Apply
                    </button>
                    <button
                        type="button"
                        onClick={() => run("Clear filter", async () => {
                            if (!adapter) throw new Error("No live adapter.");
                            const field = filterField.trim();
                            await adapter.send(field ? { kind: "clear-filter", field } : { kind: "clear-filter" });
                            return field ? `Cleared ${field}.` : "Cleared all filters.";
                        })}
                        disabled={disabled || !canApplyFilters}
                    >
                        Clear
                    </button>
                </div>

                <div className="pp-pbi-dev__grid">
                    <section>
                        <h3>Capabilities</h3>
                        <pre>{safeJson(capabilities || { status: "waiting for adapter" })}</pre>
                    </section>
                    <section>
                        <h3>Recent events</h3>
                        <pre>{safeJson(props.recentEvents.slice(-6))}</pre>
                    </section>
                    <section>
                        <h3>Snapshot</h3>
                        <pre>{safeJson(snapshot || { status: "click Snapshot" })}</pre>
                    </section>
                    <section>
                        <h3>Run log</h3>
                        <pre>{safeJson(logs.length ? logs : [{ status: "idle" }])}</pre>
                    </section>
                </div>
            </div>
        </details>
    );
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch (err) {
        return `Could not serialize value: ${err instanceof Error ? err.message : String(err)}`;
    }
}

/** Suspense fallback for the lazy-loaded Pulse bundle. Restrained — no
 *  spinner-pageant, just a single line of text on the side. The actual
 *  Pulse mount itself paints its full UI as soon as the chunk arrives. */
function PulseLoadingState(): React.ReactElement {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            color: "rgba(0,0,0,0.55)",
            fontSize: 13,
            fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
            Loading PulsePlay…
        </div>
    );
}

function PulseModeBISourcePanel(props: {
    vendors: ReturnType<typeof listVendors>;
    activeVendor: string;
    embedConfig: BIEmbedConfig;
    hasEmbedConfig: boolean;
    activeConnector?: string;
    allowlist?: PulsePlayAllowlist | null;
    onVendorChange: (vendor: string) => void;
    onEmbedConfigChange: (next: BIEmbedConfig) => void;
}) {
    const activeLabel = props.vendors.find(v => v.vendor === props.activeVendor)?.displayName || props.activeVendor;
    return (
        <details
            className="pp-pulse-bi-source"
            open={!props.hasEmbedConfig}
            style={{
                flex: "0 0 auto",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                padding: "8px 10px",
                background: "rgba(255,255,255,0.72)",
            }}
        >
            <summary
                style={{
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    listStyle: "revert",
                }}
            >
                BI source: {activeLabel}{props.hasEmbedConfig ? " · ready" : " · setup"}
            </summary>
            <div style={{ marginTop: 8 }}>
                <VendorPicker
                    vendors={props.vendors}
                    activeVendor={props.activeVendor}
                    onChange={props.onVendorChange}
                />
                <EmbedConfigForm
                    vendor={props.activeVendor}
                    value={props.embedConfig}
                    onChange={props.onEmbedConfigChange}
                    assistantProfile={props.activeConnector}
                    allowlist={props.allowlist}
                />
            </div>
        </details>
    );
}

function commandsFromPulseFilter(
    filter: powerbi.IFilter | powerbi.IFilter[] | null,
    action: powerbi.FilterAction,
): BICommand[] {
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const removing = action === 1;
    if (removing && filters.length === 0) {
        return [{ kind: "clear-filter" }];
    }
    const commands: BICommand[] = [];
    for (const f of filters) {
        const field = extractPulseFilterField(f);
        if (!field) continue;
        if (removing) {
            commands.push({ kind: "clear-filter", field });
            continue;
        }
        const values = (Array.isArray(f.values) ? f.values : [])
            .filter((v): v is string | number => typeof v === "string" || typeof v === "number");
        if (values.length === 0) continue;
        const stringValues = values.map(String);
        commands.push({
            kind: "apply-filter",
            field,
            values: stringValues.length === 1 ? stringValues[0] : stringValues,
        });
    }
    return commands;
}

function extractPulseFilterField(filter: powerbi.IFilter): string | null {
    const target = filter.target as { column?: unknown; measure?: unknown } | undefined;
    const candidate = typeof target?.column === "string"
        ? target.column
        : typeof target?.measure === "string"
            ? target.measure
            : "";
    const trimmed = candidate.trim();
    return trimmed || null;
}

/** Cycle K.1 — multi-tile BI grid. `tileMode` = "1" renders a single
 *  BIPanel filling the canvas (the v0 behaviour, no extra DOM). "2"
 *  renders two side-by-side; "4" renders a 2×2 grid. All tiles share
 *  the same `embedConfig` in K.1 — the value of multi-tile in v1 is
 *  side-by-side comparison of the same source under different
 *  interactions (filter A vs filter B). K.2 will introduce per-tile
 *  configs for genuinely different content per tile. */
function BITileGrid(props: {
    tileMode: BiTileMode;
    vendor: string;
    embedConfig: BIEmbedConfig;
    allowlist?: PulsePlayAllowlist | null;
    onEvent: (e: BIEvent) => void;
    onAdapterReady: (index: number, adapter: BIAdapter | null) => void;
}): React.ReactElement {
    const { tileMode, vendor, embedConfig, allowlist, onEvent, onAdapterReady } = props;
    if (tileMode === "1") {
        return (
            <BIPanel
                vendor={vendor}
                embedConfig={embedConfig}
                allowlist={allowlist}
                onEvent={onEvent}
                onAdapterReady={(adapter) => onAdapterReady(0, adapter)}
            />
        );
    }
    const tileCount = tileMode === "2" ? 2 : 4;
    const columns = tileMode === "2" ? 2 : 2;
    const rows = tileMode === "2" ? 1 : 2;
    const gridStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gap: 8,
        padding: 8,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
    };
    const tileStyle: React.CSSProperties = {
        minHeight: 0,
        minWidth: 0,
        position: "relative",
        background: "rgba(0,0,0,0.02)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 4,
        overflow: "hidden",
    };
    return (
        <div style={gridStyle}>
            {Array.from({ length: tileCount }, (_, i) => (
                <div key={i} className="pp-bi-tile" style={tileStyle}>
                    {/* Re-mounting each tile with its own key keeps adapters
                     *  independent — a filter applied in one tile doesn't
                     *  trigger a refetch in another, even though both speak
                     *  to the same source. */}
                    <BIPanel
                        key={`tile-${i}`}
                        vendor={vendor}
                        embedConfig={embedConfig}
                        allowlist={allowlist}
                        onEvent={onEvent}
                        onAdapterReady={(adapter) => onAdapterReady(i, adapter)}
                    />
                </div>
            ))}
        </div>
    );
}

/** Cycle F — AI panel position picker. Four split modes (left/right/
 *  top/bottom). Floating + drag-to-reposition is a follow-up. */
function LayoutModeToggle(props: { value: LayoutMode; onChange: (next: LayoutMode) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "3px 7px",
        fontSize: 10,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
        minWidth: 36,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    const modes: { value: LayoutMode; label: string; title: string }[] = [
        { value: "ai-left",   label: "Left",   title: "AI on the left, BI on the right (default)" },
        { value: "ai-right",  label: "Right",  title: "AI on the right, BI on the left" },
        { value: "ai-top",    label: "Top",    title: "AI on top (full width), BI underneath" },
        { value: "ai-bottom", label: "Bottom", title: "BI on top, AI on the bottom" },
    ];
    return (
        <div role="group" aria-label="AI panel position" style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
            {modes.map(m => (
                <button
                    key={m.value}
                    type="button"
                    style={props.value === m.value ? activeBtn : baseBtn}
                    onClick={() => props.onChange(m.value)}
                    aria-pressed={props.value === m.value}
                    title={m.title}
                >
                    {m.label}
                </button>
            ))}
        </div>
    );
}

/** Cycle E.3 — outer-panel enabled-components toggle (AI / BI / Both).
 *  Parallel to Pulse's existing "Insights / Chat / Both" feature toggle
 *  but at a layer above: this hides the entire AI side or the entire
 *  BI canvas. Persists in localStorage. Cycle F replaces this with a
 *  positionable layout that subsumes the binary toggle. */
function EnabledComponentsToggle(props: { value: EnabledComponents; onChange: (next: EnabledComponents) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "3px 7px",
        fontSize: 10,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    return (
        <div role="group" aria-label="Enabled components" style={{ display: "inline-flex", gap: 3 }}>
            <span style={{ fontSize: 10, opacity: 0.6, marginRight: 4, alignSelf: "center" }}>show:</span>
            <button
                type="button"
                style={props.value === "aiOnly" ? activeBtn : baseBtn}
                onClick={() => props.onChange("aiOnly")}
                aria-pressed={props.value === "aiOnly"}
                title="Show only the AI panel"
            >
                AI
            </button>
            <button
                type="button"
                style={props.value === "biOnly" ? activeBtn : baseBtn}
                onClick={() => props.onChange("biOnly")}
                aria-pressed={props.value === "biOnly"}
                title="Show only the BI canvas"
            >
                BI
            </button>
            <button
                type="button"
                style={props.value === "both" ? activeBtn : baseBtn}
                onClick={() => props.onChange("both")}
                aria-pressed={props.value === "both"}
                title="Show both AI and BI panels"
            >
                Both
            </button>
        </div>
    );
}

/** Floating gear in the viewport corner. Phase 5 retirement — the
 *  inline popover with UI / panels / position toggles is gone; the gear
 *  now navigates directly to /settings (the canonical surface). The
 *  inline toggles live inside Settings › Preferences. Kept as a fixed
 *  fall-through entry point so biOnly (no sidebar) and aiOnly (no top
 *  bar pill) layouts still expose Settings. */
function PulsePlaySettingsGear(_props: {
    uiMode: UiMode;
    onUiModeChange: (next: UiMode) => void;
    enabledComponents: EnabledComponents;
    onEnabledComponentsChange: (next: EnabledComponents) => void;
    layoutMode: LayoutMode;
    onLayoutModeChange: (next: LayoutMode) => void;
}) {
    void _props;
    return (
        <div
            style={{
                position: "fixed",
                top: 12,
                right: 12,
                zIndex: 1000,
            }}
        >
            <button
                type="button"
                aria-label="Open PulsePlay settings"
                title="Open Settings (Cmd/Ctrl+,)"
                onClick={() => navigateToSettings()}
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "1px solid var(--pp-border, #ccc)",
                    background: "rgba(255,255,255,0.92)",
                    color: "inherit",
                    cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    padding: 0,
                }}
            >
                ⚙
            </button>
        </div>
    );
}

// Retired (Phase 5) — the old PulsePlaySettingsGear popover that hosted
// inline UI/Panels/Position toggles. Those toggles now live inside
// Settings › Preferences and the gear above just navigates to /settings.
// The old popover code lives in `git log` if anyone needs to compare.

/** Small top-right toggle to flip between the ported Pulse UI and the
 *  v0 Smart-Connect-flavoured components from cycles B + C. Persists
 *  via UI_MODE_STORAGE_KEY in localStorage so the choice survives
 *  reloads. Cycle F replaces this with a free-floating layout. */
function UiModeToggle(props: { value: UiMode; onChange: (next: UiMode) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "4px 8px",
        fontSize: 11,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    return (
        <div role="group" aria-label="UI mode" style={{ display: "inline-flex", gap: 4 }}>
            <button
                type="button"
                style={props.value === "pulse" ? activeBtn : baseBtn}
                onClick={() => props.onChange("pulse")}
                aria-pressed={props.value === "pulse"}
                title="Use the ported Pulse UI (Setup + Insights + Chat)"
            >
                Pulse
            </button>
            <button
                type="button"
                style={props.value === "v0" ? activeBtn : baseBtn}
                onClick={() => props.onChange("v0")}
                aria-pressed={props.value === "v0"}
                title="Use the v0 Smart-Connect components from cycles B + C"
            >
                v0
            </button>
        </div>
    );
}
