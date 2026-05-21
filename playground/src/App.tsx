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
// model) we proved out in sister Pulse project cycles 1-47.

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { usePacks } from "./features/config/usePacks";
import { useAllowlist } from "./features/config/useAllowlist";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { BIPanel } from "./biPanel/BIPanel";
import { listVendors } from "./biPanel/registry";
import type { BIAdapter, BICapabilities, BICommand, BIEvent, BIEmbedConfig } from "./biPanel/BIAdapter";
import type powerbi from "./pulse/_adapter/powerbi-visuals-api";
import { Icon } from "./pulse/_adapter/Icon";
import { AISidebar, type AutoSubmitQuestionEvent } from "./components/AISidebar";
import { VendorPicker } from "./components/VendorPicker";
import { ConnectorPicker } from "./components/ConnectorPicker";
import { EmbedConfigForm } from "./components/EmbedConfigForm";
import { useEmbedConfig } from "./settings/embedConfigStore";
import { warmGenieWarehouse, startWarehouseKeepalive, stopWarehouseKeepalive } from "./lib/warehouseWarmup";
import { FirstRunWizard, WizardErrorBoundary, shouldShowWizard, type PersonaKey } from "./components/FirstRunWizard";
import { SurfaceSwitcher } from "./components/SurfaceSwitcher";
import { PaneEmptyState, DashboardIcon } from "./components/PaneEmptyState";
import type { SurfaceId } from "./surfaceRegistry";
import { isSurfaceId } from "./surfaceRegistry";
import {
    resolveSurfaceAvailability,
    type EnabledFeaturesInput,
} from "./surfaces/surfaceAvailability";
import { readPulseAiVisualSettings } from "./settings/pulseVisualSettingsStore";
import { TestConnectionPanel } from "./components/TestConnectionPanel";
import { PackPicker } from "./components/PackPicker";
import type { PackInfo, PackSelection } from "./components/PackPicker";
import type { ConnectorProbeResult } from "./types/probe";
import type { PulsePlayAllowlist } from "./types/allowlist";
import { probeConnector } from "./lib/probeClient";
import { getDiscoverySnapshot } from "./lib/discoveryClient";
import { updateProbeStatus } from "./lib/probeStatusStore";
import {
    loadPerformanceLevers,
    PERFORMANCE_LEVERS_EVENT,
    type PerformanceLevers,
} from "./settings/performanceLevers";
import { SettingsProvider, useSettings } from "./settings/settingsStore";
import { PULSE_VISUAL_SETTINGS_EVENT } from "./settings/pulseVisualSettingsStore";
import { SettingsShell } from "./settings/SettingsShell";
import { useSettingsRoute, navigateToSettings } from "./settings/settingsRoute";
import { getSetupReadiness, type SetupReadiness } from "./settings/setupReadiness";
import {
    BI_SURFACE_MODE_STORAGE_KEY,
    readInitialBiSurfaceMode,
    resolveBiSurfaceVendor,
    type BiSurfaceMode,
} from "./settings/biSurfaceMode";
import { KnowledgeShell } from "./knowledge/KnowledgeShell";
import { useKnowledgeRoute } from "./knowledge/knowledgeRoute";
import { PowerBiQnaShell, usePowerBiQnaRoute } from "./powerbi/PowerBiQnARoute";
import { LaunchpadShell } from "./launchpad/LaunchpadShell";
import { useLaunchpadRoute } from "./launchpad/launchpadRoute";
import { WorkbenchShell } from "./workbench/WorkbenchShell";
import { useWorkbenchRoute } from "./workbench/workbenchRoute";
// PERF — lazy-load PulseShell so the 642 KB pulse chunk isn't on the
// first-paint critical path. The brand strip + top bar render
// instantly while pulse fetches in parallel. v0 mode (which doesn't
// import pulse at all) is unaffected.
const PulseShell = lazy(() =>
    import("./components/PulseShell").then(m => ({ default: m.PulseShell }))
);

/** UI mode toggle — "pulse" mounts the full ported Pulse experience in
 *  the left panel (Insights tab + Chat tab + all the
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
 *  embedding PulsePlay as a BI viewer in another shell); "both" is the
 *  explicit split-pane power-user view; "mix" is the default unified
 *  surface mode where BI is available as a peer surface action instead
 *  of occupying a permanent second section. Persists in localStorage. */
type EnabledComponents = "aiOnly" | "biOnly" | "both" | "mix";
const ENABLED_COMPONENTS_STORAGE_KEY = "pulseplay:enabled-components";
const ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY = "pulseplay:enabled-components:legacy-both-migrated";

/** Cycle F — author-picked layout. Where the AI panel sits relative to
 *  the BI canvas. Floating mode (drag-to-position) is a future iteration;
 *  the four split modes cover most needs. */
type LayoutMode = "ai-left" | "ai-right" | "ai-top" | "ai-bottom";
const LAYOUT_MODE_STORAGE_KEY = "pulseplay:layout-mode";

/** Cycle K — how many BI tiles render inside the BI pane. This used to be
 *  an author-facing toolbar; it is now a backend display policy because tile
 *  count changes the viewer's cognitive load and can create confusing
 *  duplicate BI frames in controlled enterprise deployments. */
type BiTileMode = "1" | "2" | "4";
const BI_VENDOR_STORAGE_KEY = "pulseplay:bi-vendor";
type ViewportPane = "ai" | "bi";
type ViewportFocus = ViewportPane | null;
type PulseSurfaceTab = "insights" | "chat";
type MixSurface = "ai" | "bi";
const ACTIVE_SURFACE_STORAGE_KEY = "pulseplay:active-surface";
const ACTIVE_SURFACE_URL_PARAM = "surface";
const PINNED_VIEWPORT_PANE_STORAGE_KEY = "pulseplay:pinned-viewport-pane";
const PULSEPLAY_VIEWPORT_ACTION_EVENT = "pulseplay:viewport-action";
const PULSEPLAY_VIEWPORT_STATE_EVENT = "pulseplay:viewport-state";
type PulsePlayViewportAction = "focus" | "restore" | "minimize" | "open-page" | "float" | "dock" | "reload";

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

/**
 * Audit 2026-05-19 P2-13: read the configured PulsePlay-proxy base URL so
 * user-facing error copy ("Check the proxy is running on …") shows the
 * actual deployed origin, not a stale hardcoded `127.0.0.1:8787`. Reads
 * from the genieSettings JSON the settingsStore writes; falls back to the
 * local dev default when no override is set.
 */
function readConfiguredProxyBase(): string {
    if (typeof window === "undefined") return "http://127.0.0.1:8787";
    try {
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (raw) {
            const parsed = JSON.parse(raw);
            const v = parsed?.apiBaseUrl;
            if (typeof v === "string" && v.trim()) return v.trim();
        }
    } catch { /* swallow */ }
    return "http://127.0.0.1:8787";
}

/**
 * Read the active AI connector / assistant profile from the canonical
 * settingsStore key (`pulseplay:active-ai-profile`). Falls back to the
 * Pulse legacy genieSettings.assistantProfile slot so users who only ever
 * configured via the Pulse Console (not Settings → AI → Provider) still
 * end up with a non-empty profile.
 *
 * Pre-existing bug fix: before this, App.tsx initialised `activeConnector`
 * to "" and only updated it via the wizard or in-app ConnectorPicker.
 * Settings → AI → Provider writes to `pulseplay:active-ai-profile` but
 * App.tsx never read it — so a Settings-only change was invisible to
 * <AISidebar> and the AI request went out with an empty assistantProfile.
 */
function readInitialActiveConnector(): string {
    if (typeof window === "undefined") return "";
    try {
        const primary = window.localStorage.getItem("pulseplay:active-ai-profile");
        if (primary && primary.trim()) return primary.trim();
    } catch { /* swallow */ }
    // Fallback: Pulse legacy slot.
    return readPulseAssistantProfile();
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
    if (typeof window === "undefined") return "mix";
    try {
        const stored = window.localStorage.getItem(ENABLED_COMPONENTS_STORAGE_KEY);
        if (stored === "both"
            && window.localStorage.getItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY) !== "true") {
            window.localStorage.setItem(ENABLED_COMPONENTS_STORAGE_KEY, "mix");
            window.localStorage.setItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY, "true");
            return "mix";
        }
        if (stored === "aiOnly" || stored === "biOnly" || stored === "both" || stored === "mix") return stored;
    } catch { /* swallow */ }
    return "mix";
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

function normalizeBiTileMode(value: unknown): BiTileMode {
    const asString = String(value ?? "").trim();
    return asString === "2" || asString === "4" ? asString : "1";
}

function biTileModeFromPolicy(allowlist: PulsePlayAllowlist | null): BiTileMode {
    return normalizeBiTileMode(allowlist?.display?.biTileMode);
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

function readSurfaceFromUrl(): SurfaceId | null {
    if (typeof window === "undefined") return null;
    try {
        const value = new URL(window.location.href).searchParams.get(ACTIVE_SURFACE_URL_PARAM);
        return isSurfaceId(value) ? value : null;
    } catch { /* swallow */ }
    return null;
}

function readStoredActiveSurface(): SurfaceId | null {
    if (typeof window === "undefined") return null;
    try {
        const value = window.localStorage.getItem(ACTIVE_SURFACE_STORAGE_KEY);
        return isSurfaceId(value) ? value : null;
    } catch { /* swallow */ }
    return null;
}

function surfaceToMixSurface(surface: SurfaceId): MixSurface {
    return surface === "bi-viz" ? "bi" : "ai";
}

function surfaceToPulseTab(surface: SurfaceId): PulseSurfaceTab | null {
    if (surface === "ask-pulse") return "chat";
    if (surface === "ai-insights") return "insights";
    return null;
}

function surfaceFromMixState(surface: MixSurface, pulseTab?: PulseSurfaceTab): SurfaceId {
    if (surface === "bi") return "bi-viz";
    return pulseTab === "chat" ? "ask-pulse" : "ai-insights";
}

function readInitialActiveSurface(): SurfaceId {
    const fromUrl = readSurfaceFromUrl();
    if (fromUrl) return fromUrl;

    const focus = readViewportFocusFromUrl();
    if (focus === "bi") return "bi-viz";

    const stored = readStoredActiveSurface();
    if (focus === "ai") return stored && stored !== "bi-viz" ? stored : "ai-insights";
    return stored ?? "ai-insights";
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

function writeActiveSurfaceToUrl(next: SurfaceId | null) {
    if (typeof window === "undefined") return;
    try {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set(ACTIVE_SURFACE_URL_PARAM, next);
        else url.searchParams.delete(ACTIVE_SURFACE_URL_PARAM);
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
        <QueryClientProvider client={queryClient}>
            <SettingsProvider>
                <AppRouted />
            </SettingsProvider>
            <ReactQueryDevtoolsHost />
        </QueryClientProvider>
    );
}

function ReactQueryDevtoolsHost(): React.ReactElement | null {
    const [Devtools, setDevtools] = useState<ComponentType<{ initialIsOpen?: boolean }> | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV || import.meta.env.MODE === "test") return;
        let cancelled = false;
        void import("@tanstack/react-query-devtools").then((mod) => {
            if (!cancelled) setDevtools(() => mod.ReactQueryDevtools);
        });
        return () => { cancelled = true; };
    }, []);

    return Devtools ? <Devtools initialIsOpen={false} /> : null;
}

/** Renders <SettingsShell /> when the URL is /settings*, <KnowledgeShell />
 *  when the URL is /knowledge*, else the playground. Also wires the
 *  global `Cmd/Ctrl+,` shortcut to open Settings (and `Esc` to close,
 *  handled inside the page shells). */
function AppRouted(): React.ReactElement {
    const settingsRoute = useSettingsRoute();
    const knowledgeRoute = useKnowledgeRoute();
    const launchpadRoute = useLaunchpadRoute();
    const workbenchRoute = useWorkbenchRoute();
    const powerBiQnaRoute = usePowerBiQnaRoute();

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

    if (workbenchRoute.isWorkbenchRoute) {
        return <WorkbenchShell />;
    }
    if (knowledgeRoute.isKnowledgeRoute) {
        return <KnowledgeShell />;
    }
    if (powerBiQnaRoute.isPowerBiQnaRoute) {
        return <PowerBiQnaShell />;
    }
    if (launchpadRoute.isLaunchpadRoute) {
        return (
            <LaunchpadShell
                activeAiProfile={readInitialActiveConnector() || "default"}
                onUseAiSource={(profile) => {
                    try {
                        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
                        window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                            detail: { key: "pulseplay:active-ai-profile", value: profile },
                        }));
                    } catch { /* swallow */ }
                }}
                onUseBiSource={(vendor) => {
                    try {
                        window.localStorage.setItem(BI_VENDOR_STORAGE_KEY, vendor);
                        window.dispatchEvent(new CustomEvent("pulseplay:bi-vendor-change", { detail: { vendor } }));
                    } catch { /* swallow */ }
                }}
            />
        );
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
    // settingsStore actions — needed by handleWizardComplete to actually
    // persist the picked AI profile to `pulseplay:active-ai-profile` (which
    // then mirrors to genieSettings.assistantProfile + auto-populates
    // connectionMode + apiBaseUrl per settingsStore.setActiveAiProfile).
    // Without this, the wizard wrote App.tsx local state only — Pulse-mode
    // AI Insights kept showing "Connect to Databricks" because genieSettings
    // stayed empty. Discovered by browser smoke test 2026-05-17.
    const settings = useSettings();
    const vendors = useMemo(() => listVendors(), []);
    const { data: allowlistRes, error: allowlistError } = useAllowlist();
    const allowlistState = {
        allowlist: allowlistRes ?? null,
        error: allowlistError?.message || ""
    };
    const packsQuery = usePacks();
    const availablePacks = packsQuery.data ?? [];
    const packsLoaded = packsQuery.isSuccess || packsQuery.isError;
    const visibleVendors = useMemo(() => {
        if (!allowlistState.allowlist?.configured) return vendors;
        const allowed = allowlistState.allowlist.biProviders || [];
        return vendors.filter(v => allowed.includes(v.vendor));
    }, [allowlistState.allowlist, vendors]);
    // Allowlist fail-closed P1 — when the governance endpoint is unreachable
    // (allowlist is null AND error is set), surface the state to BIPanel so
    // it refuses to mount instead of silently embedding without governance.
    // The "configured: false" + null cases (dev-unconfigured, intentional
    // permissive mode) DO NOT trip this; only governance-reachability failures.
    const allowlistFailClosed = useMemo(
        () => allowlistState.allowlist === null && allowlistState.error !== "",
        [allowlistState],
    );
    // PulsePlay's 2-axis abstraction:
    //   activeVendor    = Y-axis author intent: which vendor is configured
    //   biSurfaceMode   = runtime policy: auto / native / vendor
    //   activeConnector = X-axis: which AI brain the sidebar talks to
    // Both pickers are independent — any cell of the matrix is valid.
    const [activeVendor, setActiveVendor] = useState<string>(() => readInitialBiVendor());
    const [biSurfaceMode, setBiSurfaceMode] = useState<BiSurfaceMode>(() => readInitialBiSurfaceMode());
    // PRE-EXISTING BUG FIX: `activeConnector` was initialized to "" and only
    // updated by the wizard's onComplete or the in-app ConnectorPicker.
    // Settings → AI → Provider writes to `pulseplay:active-ai-profile` via
    // settingsStore, but App.tsx never read that key — so a Settings-only
    // change was invisible to <AISidebar>, which then submitted with empty
    // assistantProfile and the proxy fell through. Hydrating from the
    // canonical key on mount + subscribing to storage events closes the
    // gap without forcing a full settingsStore migration of App.tsx state.
    const [activeConnector, setActiveConnector] = useState<string>(() => readInitialActiveConnector());
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => {
            const fromStorage = readInitialActiveConnector();
            setActiveConnector(prev => (fromStorage === prev ? prev : fromStorage));
        };
        // `storage` fires for cross-tab writes. The settingsStore's
        // `persistAndBroadcast()` fires `pulseplay:display-change` for
        // same-tab writes — same channel the Preferences group uses for
        // live updates. We subscribe to both so Settings → AI → Provider
        // immediately reaches App-level state.
        window.addEventListener("storage", sync);
        window.addEventListener("pulseplay:display-change", sync as EventListener);
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("pulseplay:display-change", sync as EventListener);
        };
    }, []);
    // Phase B of BI Live Controls (Settings IA fix #6). The Power BI embed
    // config now lives in a dedicated cross-tab store (`pulseplay:bi-embed-
    // config`). Editing in Settings → BI → Embed live-updates this hook
    // and the playground re-renders without a refresh. Phase A persisted
    // separately; Phase B (this) is the App.tsx adoption.
    const { embedConfig, setEmbedConfig: persistEmbedConfig, clearEmbedConfig } = useEmbedConfig();
    // Stable wrapper preserving the existing setEmbedConfig({}) clear
    // semantics so the rest of App.tsx doesn't need to know about the
    // null-clears-store convention.
    const setEmbedConfig = useCallback((next: BIEmbedConfig | ((prev: BIEmbedConfig) => BIEmbedConfig)) => {
        if (typeof next === "function") {
            const computed = (next as (p: BIEmbedConfig) => BIEmbedConfig)(embedConfig);
            const isEmpty = !computed || Object.keys(computed).length === 0;
            if (isEmpty) clearEmbedConfig();
            else persistEmbedConfig(computed);
            return;
        }
        const isEmpty = !next || Object.keys(next).length === 0;
        if (isEmpty) clearEmbedConfig();
        else persistEmbedConfig(next);
    }, [embedConfig, persistEmbedConfig, clearEmbedConfig]);
    const [recentEvents, setRecentEvents] = useState<BIEvent[]>([]);
    // UI mode persists across reloads. Pulse is default — that's the
    // user-confirmed direction (port carries forward).
    const [uiMode, setUiMode] = useState<UiMode>(() => readInitialUiMode());
    const [enabledComponents, setEnabledComponents] = useState<EnabledComponents>(
        () => readInitialEnabledComponents(),
    );
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => readInitialLayoutMode());
    const [focusedPane, setFocusedPane] = useState<ViewportFocus>(() => readInitialViewportFocus());
    // F5.1 — `activeSurface` is the REQUESTED surface (user/URL intent),
    // not necessarily what's actually rendered. The deployment can disable
    // surfaces via `enabledComponents` (pane axis) and `enabledFeatures`
    // (Pulse feature axis). The resolver below maps requested + config
    // to an EFFECTIVE surface and a fallback reason. Intent persists so
    // that re-enabling a disabled surface restores the user's original
    // surface automatically.
    const [activeSurface, setActiveSurface] = useState<SurfaceId>(() => readInitialActiveSurface());
    const [mixSurface, setMixSurface] = useState<MixSurface>(() => surfaceToMixSurface(readInitialActiveSurface()));
    const [requestedPulseTab, setRequestedPulseTab] = useState<PulseSurfaceTab>(() => surfaceToPulseTab(readInitialActiveSurface()) ?? "insights");
    const [enabledFeatures, setEnabledFeatures] = useState<EnabledFeaturesInput>(
        () => readPulseAiVisualSettings().enabledFeatures,
    );
    const [pinnedViewportPane, setPinnedViewportPane] = useState<ViewportFocus>(() => readInitialPinnedViewportPane());
    const biAdaptersRef = useRef<Map<number, BIAdapter>>(new Map());
    const [primaryBIAdapter, setPrimaryBIAdapter] = useState<BIAdapter | null>(null);
    // Bumping renderToken nudges PulseShell to re-call visual.update(),
    // used after settings save events from PulseHostStub.persistProperties.
    const [pulseRenderToken, setPulseRenderToken] = useState(0);
    const [pulseAssistantProfile, setPulseAssistantProfile] = useState<string>(() => readPulseAssistantProfile());
    // In-app float state — when floatedPane is set the AI pane renders in a
    // fixed-position draggable overlay instead of the split layout slot.
    const [floatedPane, setFloatedPane] = useState<ViewportPane | null>(null);
    const [floatPos, setFloatPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });



    // Pre-warm the Databricks SQL warehouse for the active Genie profile so
    // the user's first Pulse / AI ask doesn't pay 30–60s of cold-start.
    // Fire-and-forget; the proxy returns 400 cleanly for profiles without
    // a warehouseId (Foundation Model / Bedrock). Debounced 600ms to avoid
    // thrashing during rapid connector swaps.
    //
    // After the initial pre-warm fires, install a keep-alive ping every
    // ~4 min so the warehouse doesn't auto-stop mid-session (Databricks
    // default auto-stop is 10 min idle). The keep-alive auto-pauses when
    // the tab goes background (document.hidden) and fires an immediate
    // re-warm on tab return. Cleanup tears both down on connector swap +
    // App unmount.
    useEffect(() => {
        if (!activeConnector) return;
        const debounce = setTimeout(() => {
            void warmGenieWarehouse(activeConnector);
            startWarehouseKeepalive(activeConnector);
        }, 600);
        return () => {
            clearTimeout(debounce);
            stopWarehouseKeepalive();
        };
    }, [activeConnector]);

    const handleUiModeChange = useCallback((next: UiMode) => {
        setUiMode(next);
        try { window.localStorage.setItem(UI_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);

    const handleBiSurfaceModeChange = useCallback((next: BiSurfaceMode) => {
        setBiSurfaceMode(next);
        try {
            window.localStorage.setItem(BI_SURFACE_MODE_STORAGE_KEY, next);
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: BI_SURFACE_MODE_STORAGE_KEY, value: next },
            }));
        } catch { /* swallow */ }
    }, []);

    const persistActiveSurface = useCallback((next: SurfaceId, options?: { writeUrl?: boolean }) => {
        setActiveSurface(next);
        try { window.localStorage.setItem(ACTIVE_SURFACE_STORAGE_KEY, next); } catch { /* swallow */ }
        if (options?.writeUrl !== false) writeActiveSurfaceToUrl(next);
    }, []);

    // F5.1 — resolve REQUESTED surface against the current deployment
    // config. `surfaceResolution.effectiveSurfaceId` is what the shell
    // renders; `activeSurface` is the user's persisted intent. When config
    // re-opens a previously-disabled surface, the resolver returns the
    // requested surface as effective again — no manual restore code path
    // needed. Pure function in / out, cheap to recompute on each render.
    const surfaceResolution = useMemo(
        () => resolveSurfaceAvailability({
            requestedSurfaceId: activeSurface,
            enabledComponents,
            enabledFeatures,
        }),
        [activeSurface, enabledComponents, enabledFeatures],
    );
    const effectiveSurfaceId = surfaceResolution.effectiveSurfaceId;

    const handleEnabledComponentsChange = useCallback((next: EnabledComponents) => {
        setEnabledComponents(next);
        try {
            window.localStorage.setItem(ENABLED_COMPONENTS_STORAGE_KEY, next);
            if (next === "both") {
                window.localStorage.setItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY, "true");
            }
        } catch { /* swallow */ }
        // F5.1 — do NOT mutate activeSurface on enabledComponents changes.
        // The resolver above maps the persisted requested surface through
        // the new pane configuration; intent stays intact so re-enabling
        // a previously-disabled pane restores the user's original surface
        // automatically.
    }, []);
    const handleLayoutModeChange = useCallback((next: LayoutMode) => {
        setLayoutMode(next);
        try { window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);

    const applyViewportFocus = useCallback((next: ViewportFocus) => {
        setFocusedPane(next);
        writeViewportFocusToUrl(next);
        // Keep activeSurface in sync with the focused pane so `data-active-surface`,
        // telemetry, and surface restore semantics never drift from what's visible.
        // Focus = "bi" → the maximized pane IS the dashboard surface.
        // Focus = "ai" + current surface is bi-viz → land on AI Insights (the
        // only AI-pane surface that's always valid). If the user was already
        // on an AI-pane surface (ai-insights / ask-pulse), leave it alone.
        if (next === "bi") {
            persistActiveSurface("bi-viz", { writeUrl: false });
        } else if (next === "ai" && activeSurface === "bi-viz") {
            persistActiveSurface("ai-insights", { writeUrl: false });
        }
    }, [activeSurface, persistActiveSurface]);

    const handleViewportRestore = useCallback(() => {
        applyViewportFocus(null);
    }, [applyViewportFocus]);

    const handleViewportMinimize = useCallback((pane: ViewportPane) => {
        setFocusedPane(null);
        writeViewportFocusToUrl(null);
        if (enabledComponents === "mix") {
            setMixSurface(pane === "ai" ? "bi" : "ai");
            return;
        }
        handleEnabledComponentsChange(pane === "ai" ? "biOnly" : "aiOnly");
        if (pinnedViewportPane === pane) {
            setPinnedViewportPane(null);
            try { window.localStorage.removeItem(PINNED_VIEWPORT_PANE_STORAGE_KEY); } catch { /* swallow */ }
        }
    }, [enabledComponents, handleEnabledComponentsChange, pinnedViewportPane]);

    const handleMixSurfaceSelect = useCallback((surface: MixSurface, pulseTab?: PulseSurfaceTab) => {
        setFocusedPane(null);
        writeViewportFocusToUrl(null);
        setMixSurface(surface);
        if (pulseTab) setRequestedPulseTab(pulseTab);
        persistActiveSurface(surfaceFromMixState(surface, pulseTab));
    }, [persistActiveSurface]);

    const handleSurfacePick = useCallback((id: SurfaceId) => {
        const pulseTab = surfaceToPulseTab(id);
        handleMixSurfaceSelect(surfaceToMixSurface(id), pulseTab ?? undefined);
    }, [handleMixSurfaceSelect]);

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

    /** Float the pane as an in-app draggable overlay panel. Keeps the user
     *  in the same browser tab, same auth session, same origin — no separate
     *  window means no cross-window message bridge needed and interactions
     *  stay seamless.
     *
     *  Sizing:
     *  - Desktop (≥ 640 px viewport): 520 px wide, 80 vh tall (cap 700 px),
     *    positioned ~right edge with a 20 px margin so the panel doesn't kiss
     *    the viewport edge.
     *  - Mobile (< 640 px viewport): clamp panel WIDTH to the viewport width
     *    minus a 16 px margin on each side. The 2026-05-19 visible E2E pass
     *    found the dock control offscreen at 390 px because a 520 px panel
     *    couldn't fit. Position is clamped inside the viewport so both Dock
     *    and Close stay reachable.
     *
     *  "Dock ↙" in the panel header collapses back into the split layout.
     */
    const handleViewportFloat = useCallback((pane: ViewportPane) => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const MARGIN = 16;
        const isMobile = vw < 640;
        // Panel width: 520 on desktop, viewport-minus-margin on mobile.
        const panelW = isMobile
            ? Math.max(280, vw - MARGIN * 2)
            : 520;
        const panelH = Math.min(vh * 0.8, 700);
        // Position: right-anchored on desktop, centered-margin on mobile so
        // both ends of the header (Dock + Close) stay inside the viewport.
        const x = isMobile
            ? Math.max(MARGIN, (vw - panelW) / 2)
            : Math.max(0, vw - panelW - 20);
        const y = Math.max(20, (vh - panelH) / 2);
        setFloatPos({ x, y });
        setFloatedPane(pane);
    }, []);

    const handleViewportDock = useCallback(() => {
        setFloatedPane(null);
    }, []);

    const handleShowBothPanes = useCallback(() => {
        setFocusedPane(null);
        writeViewportFocusToUrl(null);
        handleEnabledComponentsChange("both");
    }, [handleEnabledComponentsChange]);

    // F5.1 — mix-mode pane state follows the EFFECTIVE surface, not the
    // raw request. When chatOnly forces an ai-insights request to fall
    // back to ask-pulse, the pane must show chat — otherwise the user's
    // click would visibly do nothing while the resolver silently swapped
    // the surface underneath.
    useEffect(() => {
        if (enabledComponents !== "mix") return;
        setMixSurface(surfaceToMixSurface(effectiveSurfaceId));
        const pulseTab = surfaceToPulseTab(effectiveSurfaceId);
        if (pulseTab) setRequestedPulseTab(pulseTab);
    }, [effectiveSurfaceId, enabledComponents]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ pane?: string; action?: string }>).detail;
            const pane = detail?.pane;
            const action = detail?.action as PulsePlayViewportAction | undefined;
            if (pane !== "ai" && pane !== "bi") return;
            if (action === "focus") {
                if (enabledComponents === "mix" && pane === "bi" && !focusedPane) {
                    handleMixSurfaceSelect("bi");
                } else {
                    applyViewportFocus(pane);
                }
            }
            else if (action === "restore") handleViewportRestore();
            else if (action === "minimize") handleViewportMinimize(pane);
            else if (action === "open-page") handleViewportOpenPage(pane);
            else if (action === "float") handleViewportFloat(pane);
            else if (action === "dock") handleViewportDock();
            else if (action === "reload" && pane === "ai") {
                setPulseAssistantProfile(readPulseAssistantProfile());
                setPulseRenderToken(t => t + 1);
            }
        };
        window.addEventListener(PULSEPLAY_VIEWPORT_ACTION_EVENT, handler as EventListener);
        return () => window.removeEventListener(PULSEPLAY_VIEWPORT_ACTION_EVENT, handler as EventListener);
    }, [applyViewportFocus, enabledComponents, focusedPane, handleMixSurfaceSelect, handleViewportRestore, handleViewportMinimize, handleViewportOpenPage, handleViewportFloat, handleViewportDock]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent(PULSEPLAY_VIEWPORT_STATE_EVENT, {
            detail: { focusedPane },
        }));
    }, [focusedPane]);

    useEffect(() => {
        try { window.localStorage.setItem(BI_VENDOR_STORAGE_KEY, activeVendor); } catch { /* swallow */ }
    }, [activeVendor]);

    useEffect(() => {
        if (!visibleVendors.some(v => v.vendor === activeVendor)) {
            setActiveVendor(visibleVendors[0]?.vendor || "powerbi");
            setEmbedConfig({});
        }
    }, [activeVendor, visibleVendors]);

    // Settings is the canonical source for app display preferences. It writes
    // the same localStorage keys this component owns and dispatches a
    // `pulseplay:display-change` event, so Settings changes apply immediately
    // without a reload.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (!detail || typeof detail.value !== "string") return;
            if (detail.key === UI_MODE_STORAGE_KEY && (detail.value === "pulse" || detail.value === "v0")) {
                setUiMode(detail.value);
            } else if (detail.key === ENABLED_COMPONENTS_STORAGE_KEY && (detail.value === "aiOnly" || detail.value === "biOnly" || detail.value === "both" || detail.value === "mix")) {
                handleEnabledComponentsChange(detail.value);
            } else if (detail.key === LAYOUT_MODE_STORAGE_KEY && (detail.value === "ai-left" || detail.value === "ai-right" || detail.value === "ai-top" || detail.value === "ai-bottom")) {
                setLayoutMode(detail.value);
            } else if (detail.key === BI_SURFACE_MODE_STORAGE_KEY && (detail.value === "auto" || detail.value === "native" || detail.value === "vendor")) {
                setBiSurfaceMode(detail.value);
            } else if (detail.key === ACTIVE_SURFACE_STORAGE_KEY && isSurfaceId(detail.value)) {
                persistActiveSurface(detail.value, { writeUrl: false });
            }
        };
        window.addEventListener("pulseplay:display-change", handler as EventListener);
        return () => window.removeEventListener("pulseplay:display-change", handler as EventListener);
    }, [handleEnabledComponentsChange, persistActiveSurface]);

    useEffect(() => {
        const handler = () => {
            const nextFocus = readViewportFocusFromUrl();
            setFocusedPane(nextFocus);
            const surfaceFromUrl = readSurfaceFromUrl();
            if (surfaceFromUrl) {
                persistActiveSurface(surfaceFromUrl, { writeUrl: false });
            } else if (nextFocus === "bi") {
                persistActiveSurface("bi-viz", { writeUrl: false });
            } else if (nextFocus === "ai") {
                // Symmetric with focus=bi: when the user pops back to a URL
                // that focuses AI without a surface= param, ensure activeSurface
                // reflects an AI-pane surface. Read from storage (not closure)
                // to dodge stale-closure issues — persistActiveSurface is stable
                // so this effect doesn't tear down per activeSurface change.
                if (readStoredActiveSurface() === "bi-viz") {
                    persistActiveSurface("ai-insights", { writeUrl: false });
                }
            }
        };
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, [persistActiveSurface]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const syncBiVendor = () => {
            const next = readInitialBiVendor();
            if (next && next !== activeVendor) setActiveVendor(next);
            const nextMode = readInitialBiSurfaceMode();
            if (nextMode !== biSurfaceMode) setBiSurfaceMode(nextMode);
        };
        window.addEventListener("storage", syncBiVendor);
        window.addEventListener("pulseplay:bi-vendor-change", syncBiVendor as EventListener);
        return () => {
            window.removeEventListener("storage", syncBiVendor);
            window.removeEventListener("pulseplay:bi-vendor-change", syncBiVendor as EventListener);
        };
    }, [activeVendor, biSurfaceMode]);

    // Settings also owns Pulse's legacy `genieSettings` namespace now. When a
    // Settings control writes to that namespace, re-run PulseShell.update()
    // so the embedded Pulse UI picks up the new prompt/domain/runtime config.
    //
    // F5.1 — also sync `enabledFeatures` so the surface resolver sees the
    // new value the next time it runs. Without this, switching between
    // T4 (insightsOnly) and T5 (chatOnly) wouldn't update which AI surface
    // is effectively rendered, and `data-active-surface` would lie.
    useEffect(() => {
        const handler = () => {
            setPulseAssistantProfile(readPulseAssistantProfile());
            setPulseRenderToken(t => t + 1);
            setEnabledFeatures(readPulseAiVisualSettings().enabledFeatures);
        };
        window.addEventListener(PULSE_VISUAL_SETTINGS_EVENT, handler as EventListener);
        return () => window.removeEventListener(PULSE_VISUAL_SETTINGS_EVENT, handler as EventListener);
    }, []);

    // "mix" is the unified default: AI Insights / Ask Pulse / BI Viz are
    // peer surfaces in one primary canvas. Authors who want a permanent
    // second BI section use the explicit "both" / Split + Mix preset.
    const mixBiSurfaceActive = enabledComponents === "mix" && mixSurface === "bi" && !focusedPane;
    const aiVisible = enabledComponents === "aiOnly" || enabledComponents === "both" || (enabledComponents === "mix" && !mixBiSurfaceActive);
    const biVisible = enabledComponents === "biOnly" || enabledComponents === "both" || mixBiSurfaceActive;
    const mountedAiVisible = focusedPane ? focusedPane === "ai" || aiVisible : aiVisible;
    const mountedBiVisible = focusedPane ? focusedPane === "bi" || biVisible : biVisible;
    const minimizedPane: ViewportFocus = !focusedPane && enabledComponents === "biOnly"
        ? "ai"
        : !focusedPane && enabledComponents === "aiOnly"
            ? "bi"
            : null;
    const effectiveBiTileMode = biTileModeFromPolicy(allowlistState.allowlist);
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
    // pattern as sister Pulse project's contextBuilder, just sourced
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
            updateProbeStatus({ phase: "probing", profile, error: null });
            void probeConnector(profile).then(result => {
                if (cancelled) return;
                handleProbeComplete(result);
                updateProbeStatus({ phase: "ready", profile, error: null });
            }).catch(err => {
                if (cancelled) return;
                // Probe failure is non-fatal — Smart Connect is best-effort.
                // Emit the failure so UI surfaces can flag degraded grounding.
                const msg = err instanceof Error ? err.message : String(err);
                updateProbeStatus({ phase: "failed", profile, error: msg });
            });
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

    // Performance levers — subscribed so the prewarm toggle takes effect
    // mid-session without a reload.
    const [perfLevers, setPerfLevers] = useState<PerformanceLevers>(loadPerformanceLevers);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setPerfLevers(loadPerformanceLevers());
        window.addEventListener(PERFORMANCE_LEVERS_EVENT, sync);
        return () => window.removeEventListener(PERFORMANCE_LEVERS_EVENT, sync);
    }, []);

    // PROBE-ONCE prewarm — whenever we know the active profile (and pack, if
    // any), pre-fetch the DiscoverySnapshot into the discoveryClient's
    // sessionStorage cache. Subsequent fetches anywhere in the app — AISidebar,
    // the Pulse genie pipeline, the Frame picker — hit the warm cache instead
    // of paying for a cold round-trip. The client handles in-flight dedupe and
    // 15-min TTL, so repeated fires are no-ops when nothing relevant changed.
    // Best-effort; discovery failure is non-fatal (enrichment, not required).
    // Author can opt out via Settings → Advanced → Performance (discovery
    // prewarm toggle).
    useEffect(() => {
        if (!perfLevers.discoveryPrewarmEnabled) return;
        const profile = pulseAssistantProfile || activeConnector;
        if (!profile) return;
        void getDiscoverySnapshot({
            assistantProfile: profile,
            pack: packSelection?.pack,
            subVertical: packSelection?.subVertical,
        }).catch(err => {
            // Enrichment only — but emit a status so the UI can flag
            // degraded grounding for users who'd otherwise see silent
            // misses. Doesn't transition probe phase out of "ready".
            const msg = err instanceof Error ? err.message : String(err);
            updateProbeStatus({ phase: "failed", profile, error: `discovery: ${msg}` });
        });
    }, [perfLevers.discoveryPrewarmEnabled, pulseAssistantProfile, activeConnector, packSelection]);

    // Switching connectors invalidates probe + pack selection so the next
    // probe runs fresh against the new profile.
    const handleConnectorChange = useCallback((next: string) => {
        setActiveConnector(next);
        setProbeResult(null);
        setPackSelection(null);
    }, []);

    const hasEmbedConfig = Object.keys(embedConfig).length > 0;
    const biSurfaceResolution = useMemo(
        () => resolveBiSurfaceVendor({
            mode: biSurfaceMode,
            requestedVendor: activeVendor,
            hasVendorEmbedConfig: hasEmbedConfig,
            visibleVendors,
        }),
        [biSurfaceMode, activeVendor, hasEmbedConfig, visibleVendors],
    );
    const runtimeBiVendor = biSurfaceResolution.runtimeVendor;
    const hasRenderableBiSurface = biSurfaceResolution.usesNative || hasEmbedConfig;
    const setupReadiness = getSetupReadiness({
        biVendor: runtimeBiVendor,
        embedConfig,
        activeAiProfile: pulseAssistantProfile || activeConnector,
    });
    const probeSuggested: PackSelection | undefined =
        probeResult?.inference?.suggestedPack
            ? {
                  pack: probeResult.inference.suggestedPack,
                  subVertical: probeResult.inference.suggestedSubVertical,
              }
            : undefined;

    // First-run wizard gating. Renders only when the user has no embed config
    // AND no AI connector picked, governance is healthy (vendors available +
    // not fail-closed), and the dismissal flag hasn't been set. The fail-
    // closed banner takes precedence so the wizard does not paint over a
    // governance-error state. Dismissal lives in localStorage under
    // `pulseplay:wizard-dismissed`; Settings → System exposes a re-run button.
    const [wizardForceTick, setWizardForceTick] = useState(0); // bump to re-eval after dismissal
    const wizardShown = useMemo(() => {
        if (allowlistFailClosed) return false;
        return shouldShowWizard({
            hasEmbedConfig: hasRenderableBiSurface,
            hasConnector: !!activeConnector,
            vendorsAvailable: visibleVendors.length > 0,
        });
        // wizardForceTick is the cache-buster; intentional dep so the memo
        // re-runs after `resetWizardDismissal()` or `Skip for now` mutates
        // localStorage out-of-band.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowlistFailClosed, hasRenderableBiSurface, activeConnector, visibleVendors.length, wizardForceTick]);

    /** Wizard "Done & ask" → AISidebar auto-submit. Captured here and
     *  passed to AISidebar via the `autoSubmitQuestion` prop. The event id
     *  makes each wizard completion distinct, so intentionally asking the
     *  same suggested question on a later re-run still fires. */
    const wizardAutoSubmitSeqRef = useRef(0);
    const [wizardAutoSubmit, setWizardAutoSubmit] = useState<AutoSubmitQuestionEvent | null>(null);
    /** Persona persistence — remembered across sessions so a re-run of
     *  the wizard pre-selects the user's previous role. Stored in
     *  localStorage to mirror the wizard's existing storage pattern
     *  (dismissal flag / draft / force key). */
    const [lastPersona, setLastPersona] = useState<PersonaKey | null>(() => {
        try {
            const raw = window.localStorage.getItem("pulseplay:last-persona");
            if (raw === "analyst" || raw === "executive" || raw === "developer" || raw === "designer") {
                return raw;
            }
        } catch { /* swallow */ }
        return null;
    });

    const handleWizardComplete = useCallback(
        (picks: {
            vendor:             string;
            connector:          string;
            embedConfig:        BIEmbedConfig;
            packSelection:      PackSelection | null;
            persona:            PersonaKey;
            uiMode:             "pulse" | "v0";
            layoutMode:         "ai-left" | "ai-right" | "ai-top";
            suggestedQuestion?: string;
            autoAsk?:           boolean;
        }) => {
            setActiveVendor(picks.vendor);
            setActiveConnector(picks.connector);
            setEmbedConfig(picks.embedConfig);
            setPackSelection(picks.packSelection);
            handleUiModeChange(picks.uiMode);
            handleLayoutModeChange(picks.layoutMode as LayoutMode);
            // ──── Persist AI profile to settingsStore (canonical key) ─────
            // Without this the wizard only wrote App.tsx local state and
            // Pulse-mode AI Insights stayed in the "Connect to Databricks"
            // empty state because genieSettings was never populated. The
            // settingsStore.setActiveAiProfile() call:
            //   1. Writes `pulseplay:active-ai-profile`
            //   2. Mirrors to genieSettings.assistantProfile
            //   3. Auto-populates genieSettings.connectionMode = "proxy"
            //      + genieSettings.apiBaseUrl = origin
            //      (added 2026-05-17 in settingsStore for exactly this gap)
            //   4. Fires `pulseplay:display-change` so subscribers re-render
            // Browser smoke test 2026-05-17 caught this missing call.
            if (picks.connector) {
                const result = settings.setActiveAiProfile(picks.connector);
                if (!result.ok) {
                    // Allowlist refused (e.g. picked-in-wizard but governance
                    // changed since). Log but don't block the wizard close —
                    // the user can re-pick from Settings.
                    // eslint-disable-next-line no-console
                    console.warn("[handleWizardComplete] setActiveAiProfile refused:", result.reason);
                }
            }
            // Mirror pack selection through settingsStore too so it survives
            // refresh in the canonical key and triggers governance checks.
            if (picks.packSelection) {
                settings.setPackSelection(picks.packSelection);
            }
            // Persona persistence: write through to localStorage so the
            // next wizard run pre-selects this role.
            setLastPersona(picks.persona);
            try { window.localStorage.setItem("pulseplay:last-persona", picks.persona); } catch { /* swallow */ }
            // "Done & ask" path: arm AISidebar to fire ask() once on the
            // next render. Empty / falsy values clear the arm so a normal
            // "Done" doesn't trigger a stale auto-submit.
            if (picks.autoAsk && picks.suggestedQuestion && picks.suggestedQuestion.trim()) {
                const question = picks.suggestedQuestion.trim();
                wizardAutoSubmitSeqRef.current += 1;
                setWizardAutoSubmit({
                    id:       wizardAutoSubmitSeqRef.current,
                    question,
                });
            } else {
                setWizardAutoSubmit(null);
            }
            setWizardForceTick(t => t + 1);
        },
        [setEmbedConfig, handleUiModeChange, handleLayoutModeChange, settings],
    );
    const handleWizardDismiss = useCallback(() => {
        // Dismissal flag is already set by FirstRunWizard's onDismiss path.
        // We just need to re-eval shouldShowWizard so the wizard unmounts.
        setWizardForceTick(t => t + 1);
    }, []);

    return (
        <div
            className="pp-app"
            data-testid="pp-viewport-shell"
            data-viewport-focus={focusedPane ?? "split"}
            // F5.1 — data-active-surface is the EFFECTIVE surface (what
            // the shell actually renders). data-requested-surface is the
            // user's persisted intent — useful for telemetry that wants to
            // distinguish "user wanted X but config forced Y." Fallback
            // reason emitted only when the two differ.
            data-active-surface={effectiveSurfaceId}
            data-requested-surface={activeSurface}
            data-surface-fallback-reason={surfaceResolution.fallbackReason ?? undefined}
            data-bi-surface-mode={biSurfaceMode}
            data-requested-bi-vendor={activeVendor}
            data-runtime-bi-vendor={runtimeBiVendor}
            data-bi-surface-resolution={biSurfaceResolution.reason}
            data-layout-pinned={pinnedViewportPane ? "true" : "false"}
            style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
            {/* PulsePlay top bar — full-width header strip. The right pill is
              * the single configuration entry: it opens Settings > Setup,
              * where BI + AI readiness are shown together. */}
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
                <SetupStatusPill readiness={setupReadiness} />
            </header>
            <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}>
            {wizardShown ? (
                <WizardErrorBoundary
                    key={wizardForceTick}
                    onRetry={() => setWizardForceTick(t => t + 1)}
                    onSkip={handleWizardDismiss}
                >
                    <FirstRunWizard
                        vendors={visibleVendors}
                        allowlist={allowlistState.allowlist}
                        availablePacks={availablePacks}
                        initialPersona={lastPersona ?? undefined}
                        onComplete={handleWizardComplete}
                        onDismiss={handleWizardDismiss}
                    />
                </WizardErrorBoundary>
            ) : (<>
            {/* In-app floating AI panel — rendered when the user clicks
              * the float button. The panel is draggable and CSS-resizable.
              * State is reset on float/dock (acceptable tradeoff vs a
              * separate browser window losing auth + events). */}
            {floatedPane === "ai" && (
                <FloatingPanel
                    pos={floatPos}
                    onPosChange={setFloatPos}
                    onDock={handleViewportDock}
                    title="AI Insights — floating"
                >
                    <PaneChrome
                        pane="ai"
                        title="PulsePlay AI"
                        subtitle={uiMode === "pulse" ? "Pulse mode" : "v0 mode"}
                        isFocused={false}
                        isBackgrounded={false}
                        isPinned={false}
                        canShowBoth={false}
                        onFocus={() => {}}
                        onRestore={handleViewportDock}
                        onMinimize={handleViewportDock}
                        onPinToggle={() => {}}
                        onOpenPage={() => handleViewportOpenPage("ai")}
                        onFloat={handleViewportDock}
                        onShowBoth={handleViewportDock}
                        quiet={uiMode === "pulse"}
                        hideHeader={uiMode === "pulse"}
                    >
                        <aside className="pp-app__sidebar" style={panelInnerStyle()}>
                            {allowlistState.error && (
                                <div
                                    role={allowlistFailClosed ? "alert" : "status"}
                                    style={{
                                        padding: "8px 10px",
                                        borderBottom: "1px solid rgba(120,0,0,0.18)",
                                        background: "rgba(255,245,245,0.86)",
                                        color: "#7f1d1d",
                                        fontSize: 12,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {allowlistFailClosed
                                        ? <><strong>Governance allowlist unreachable — fail-closed.</strong> Check the proxy.</>
                                        : <>Governance config unavailable. Pickers may be incomplete.</>
                                    }
                                </div>
                            )}
                            {uiMode === "pulse" ? (
                                <>
                                    <Suspense fallback={<PulseLoadingState />}>
                                        <PulseShell
                                            renderToken={pulseRenderToken}
                                            activeTabRequest={requestedPulseTab}
                                            onSettingsChange={() => setPulseRenderToken(t => t + 1)}
                                            onApplyFilter={handlePulseApplyFilter}
                                            biEvents={recentEvents}
                                            biVendor={runtimeBiVendor}
                                        />
                                    </Suspense>
                                </>
                            ) : (
                                <AISidebar
                                    activeVendor={runtimeBiVendor}
                                    activeConnector={activeConnector}
                                    recentEvents={recentEvents}
                                    packSelection={packSelection}
                                    autoSubmitQuestion={wizardAutoSubmit}
                                />
                            )}
                        </aside>
                    </PaneChrome>
                </FloatingPanel>
            )}
            <SplitLayout
                aiVisible={floatedPane === "ai" ? false : mountedAiVisible}
                biVisible={floatedPane === "ai" ? true : mountedBiVisible}
                layoutMode={layoutMode}
                focusedPane={focusedPane}
                aiContent={(
                    <PaneChrome
                        pane="ai"
                        title="PulsePlay AI"
                        subtitle={uiMode === "pulse" ? "Pulse mode" : "v0 mode"}
                        isFocused={focusedPane === "ai"}
                        isBackgrounded={focusedPane === "bi"}
                        isPinned={pinnedViewportPane === "ai"}
                        canShowBoth={!focusedPane && enabledComponents !== "both"}
                        onFocus={() => applyViewportFocus("ai")}
                        onRestore={handleViewportRestore}
                        onMinimize={() => handleViewportMinimize("ai")}
                        onPinToggle={() => handleViewportPinToggle("ai")}
                        onOpenPage={() => handleViewportOpenPage("ai")}
                        onFloat={() => handleViewportFloat("ai")}
                        onShowBoth={handleShowBothPanes}
                        quiet={uiMode === "pulse"}
                        hideHeader={uiMode === "pulse"}
                    >
                        <aside className="pp-app__sidebar" style={panelInnerStyle()}>
                            {allowlistState.error && (
                                <div
                                    role={allowlistFailClosed ? "alert" : "status"}
                                    style={{
                                        padding: "8px 10px",
                                        borderBottom: "1px solid rgba(120,0,0,0.18)",
                                        background: "rgba(255,245,245,0.86)",
                                        color: "#7f1d1d",
                                        fontSize: 12,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {allowlistFailClosed ? (
                                        <>
                                            <strong>Governance allowlist unreachable — fail-closed.</strong>{" "}
                                            BI surfaces will not mount and selections are refused until the proxy responds.
                                            {/* Audit 2026-05-19 P2-13: was a hardcoded
                                              * http://127.0.0.1:8787 — fine for local dev,
                                              * misleading on any other deploy. Derive the
                                              * displayed proxy URL from the configured
                                              * apiBaseUrl (stored in the genieSettings
                                              * JSON the settings store writes), falling
                                              * back to the local default only when no
                                              * override is set. */}
                                            {(() => {
                                                const base = readConfiguredProxyBase();
                                                return <> Check the proxy is running on <code>{base}</code> and reload.</>;
                                            })()}
                                        </>
                                    ) : (
                                        <>Governance config unavailable. Pickers may be incomplete until the proxy responds.</>
                                    )}
                                </div>
                            )}
                            {uiMode === "pulse" ? (
                                <>
                                    <Suspense fallback={<PulseLoadingState />}>
                                        <PulseShell
                                            renderToken={pulseRenderToken}
                                            activeTabRequest={requestedPulseTab}
                                            onSettingsChange={() => setPulseRenderToken(t => t + 1)}
                                            onApplyFilter={handlePulseApplyFilter}
                                            biEvents={recentEvents}
                                            biVendor={runtimeBiVendor}
                                        />
                                    </Suspense>
                                </>
                            ) : (
                                <>
                                    <BiSurfaceModeMiniControl
                                        mode={biSurfaceMode}
                                        runtimeVendor={runtimeBiVendor}
                                        resolutionReason={biSurfaceResolution.reason}
                                        onChange={handleBiSurfaceModeChange}
                                    />
                                    <VendorPicker
                                        vendors={visibleVendors}
                                        activeVendor={activeVendor}
                                        onChange={(v) => {
                                            setActiveVendor(v);
                                            if (v === "native") handleBiSurfaceModeChange("native");
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
                                        activeVendor={runtimeBiVendor}
                                        activeConnector={activeConnector}
                                        recentEvents={recentEvents}
                                        packSelection={packSelection}
                                        biAdapter={primaryBIAdapter}
                                        autoSubmitQuestion={wizardAutoSubmit}
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
                        // Subtitle intentionally empty. Previously hardcoded the
                        // vendor display name from a static registry, which
                        // duplicated information the embedded dashboard already
                        // makes obvious (you see Power BI / Tableau / etc.
                        // rendering in the pane). When no embed is configured,
                        // the pane body's empty-state copy already tells the
                        // user what to do, so the subtitle was double-noise
                        // either way. Title "BI" stands alone — clean chrome,
                        // more room for the icon cluster on narrow splits.
                        subtitle=""
                        isFocused={focusedPane === "bi"}
                        isBackgrounded={focusedPane === "ai"}
                        isPinned={pinnedViewportPane === "bi"}
                        canShowBoth={!focusedPane && enabledComponents !== "both"}
                        // Earlier this pane went `quiet` whenever there was no
                        // embed config — the rationale being "nothing to operate
                        // on". User feedback flipped that: viewport controls
                        // (Maximize / Minimize / Open in tab / Float) are
                        // pane-level affordances, not content affordances, and
                        // should be available on BOTH panes regardless of
                        // whether the content is populated. The empty BI state
                        // still floats as a window if the author wants the
                        // setup prompt visible alongside their main view.
                        quiet={false}
                        onFocus={() => applyViewportFocus("bi")}
                        onRestore={handleViewportRestore}
                        onMinimize={() => handleViewportMinimize("bi")}
                        onPinToggle={() => handleViewportPinToggle("bi")}
                        onOpenPage={() => handleViewportOpenPage("bi")}
                        onFloat={() => handleViewportFloat("bi")}
                        onShowBoth={handleShowBothPanes}
                        // Audit 2026-05-20 chrome-parity pass: render the
                        // SurfaceSwitcher INLINE with PaneChrome's toolbar
                        // row instead of on a separate row below the chrome.
                        // Same visual rhythm as the AI pane (where Pulse
                        // renders its switcher next to its own action
                        // cluster). Suppressed when AI is floating because
                        // the background BI canvas should be clean (nav
                        // lives in the float).
                        inlineSwitcher={
                            enabledComponents === "mix" && !floatedPane ? (
                                <SurfaceSwitcher
                                    active={effectiveSurfaceId}
                                    availability={surfaceResolution.availability}
                                    onPick={handleSurfacePick}
                                />
                            ) : undefined
                        }
                    >
                        <main className="pp-app__canvas" style={{ ...panelInnerStyle(), display: "flex", flexDirection: "column" }}>
                            <PowerBIDeveloperPanel
                                activeVendor={runtimeBiVendor}
                                hasEmbedConfig={hasEmbedConfig}
                                adapter={primaryBIAdapter}
                                recentEvents={recentEvents}
                            />
                            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                            {hasRenderableBiSurface ? (
                                <BITileGrid
                                    tileMode={effectiveBiTileMode}
                                    vendor={runtimeBiVendor}
                                    embedConfig={embedConfig}
                                    allowlist={allowlistState.allowlist}
                                    allowlistFailClosed={allowlistFailClosed}
                                    onEvent={handleBIEvent}
                                    onAdapterReady={handleBIAdapterReady}
                                />
                            ) : (
                                // Audit 2026-05-20: brought into visual parity with the
                                // AI Insights and Ask Pulse empty states via the shared
                                // <PaneEmptyState> shell. Same icon disc + heading +
                                // description + bullet list + CTAs vocabulary. Two
                                // branches kept so the copy + bullet list reflect whether
                                // the AI surfaces are already visible alongside.
                                <div className="pp-app__empty pp-app__empty--unified">
                                    {(() => {
                                        const vendorsList = visibleVendors.map(v => v.displayName).join(" · ");
                                        const vendorHint = vendorsList
                                            ? <>Vendors available: {vendorsList}</>
                                            : <>No BI providers are allowlisted yet.</>;
                                        const primaryAction = {
                                            label: "Open BI settings →",
                                            onClick: () => navigateToSettings("bi"),
                                            testid: "pp-dashboard-empty-primary-cta",
                                        };
                                        const secondaryAction = {
                                            label: "Browse knowledge packs",
                                            onClick: () => {
                                                try {
                                                    window.history.pushState({}, "", "/knowledge");
                                                    window.dispatchEvent(new PopStateEvent("popstate"));
                                                } catch { /* swallow */ }
                                            },
                                            testid: "pp-dashboard-empty-secondary-cta",
                                        };
                                        if (aiVisible) {
                                            // AI pane already mounted alongside — the empty
                                            // state guides the user to wire up the BI surface
                                            // so all three peer surfaces fill out.
                                            const description = uiMode === "pulse"
                                                ? "Use the Setup pill to pick the BI tool you're embedding (Y-axis) and the AI assistant that reasons about it (X-axis). They're independent — any combination works."
                                                : "Choose a vendor on the left, fill in its embed config, and the AI assistant will reason about whatever you load.";
                                            return (
                                                <PaneEmptyState
                                                    testid="pp-dashboard-empty"
                                                    icon={DashboardIcon}
                                                    heading="Dashboard"
                                                    description={description}
                                                    capabilities={[
                                                        "Your BI report renders here as the canvas",
                                                        "AI Insights briefs you across the visible data",
                                                        "Ask Pulse answers follow-ups in plain English",
                                                        "All three surfaces stay in sync as you switch",
                                                    ]}
                                                    primaryAction={primaryAction}
                                                    secondaryAction={secondaryAction}
                                                    hint={vendorHint}
                                                />
                                            );
                                        }
                                        // Dashboard tab selected on its own — same shell,
                                        // copy reframes Dashboard as one of the three peer
                                        // surfaces (AI Insights / Ask Pulse / Dashboard) so
                                        // the user knows the AI surfaces are one click away
                                        // in the switcher above. 2026-05-19 BI-only mode fix.
                                        return (
                                            <PaneEmptyState
                                                testid="pp-dashboard-empty"
                                                icon={DashboardIcon}
                                                heading="Dashboard"
                                                description={
                                                    <>
                                                        Pick a BI tool and paste its embed URL — your report appears
                                                        here as one of the peer surfaces alongside AI Insights and
                                                        Ask Pulse. Switch between them any time with the surface
                                                        switcher above.
                                                    </>
                                                }
                                                capabilities={[
                                                    "Embedded BI report renders in this canvas",
                                                    "AI Insights surfaces a briefing across the data",
                                                    "Ask Pulse answers follow-up questions",
                                                    "All within the same shell — no tab switching",
                                                ]}
                                                primaryAction={primaryAction}
                                                secondaryAction={secondaryAction}
                                                hint={vendorHint}
                                            />
                                        );
                                    })()}
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
                            <p>Re-enable AI or BI via Settings › Preferences.</p>
                        </div>
                    </main>
                )}
            />
            </>)}
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

function SetupStatusPill(props: { readiness: SetupReadiness }): React.ReactElement {
    const ready = props.readiness.ready;
    const dot = ready ? "#22c55e" : "#f59e0b";
    const fg = ready ? "#166534" : "#7a5b00";
    const bg = ready ? "rgba(34, 197, 94, 0.08)" : "rgba(250, 204, 21, 0.12)";
    const border = ready ? "rgba(34, 197, 94, 0.32)" : "rgba(245, 158, 11, 0.34)";
    return (
        <button
            type="button"
            aria-label={ready ? "Open setup readiness in Settings" : `Open setup in Settings. Missing ${props.readiness.pillDetail}`}
            title="Open Settings → Setup"
            onClick={() => navigateToSettings("setup")}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                maxWidth: "min(48vw, 360px)",
                padding: "5px 10px",
                border: `1px solid ${border}`,
                borderRadius: 999,
                background: bg,
                color: fg,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dot,
                    display: "inline-block",
                    flex: "0 0 auto",
                }}
            />
            <span>{props.readiness.pillLabel}</span>
            <span
                style={{
                    opacity: 0.78,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                }}
            >
                {props.readiness.pillDetail}
            </span>
        </button>
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
    onFloat: () => void;
    onShowBoth: () => void;
    /** Fix #2 — when true, render only the title/subtitle row without the
     *  controls toolbar. Used when the pane has nothing to operate on
     *  (e.g. BI pane with no embedConfig). Keeps the title for context
     *  but stops painting Maximize/Pin/Page on top of an empty pane. */
    quiet?: boolean;
    /** Pulse mode owns its own AI row (AI Insights / Chat + icons). Hiding
     *  the outer AI title row removes duplicate vertical chrome. */
    hideHeader?: boolean;
    /** Audit 2026-05-20: optional slot rendered between the title and the
     *  toolbar. The BI pane uses this to embed the SurfaceSwitcher so the
     *  three-tab pill sits on the SAME row as the toolbar buttons — same
     *  visual rhythm as the AI pane (which renders its switcher inline
     *  inside the PulseShell). When supplied, the title block is hidden
     *  to avoid a duplicate "BI" + "Dashboard" identity (the active tab
     *  in the switcher already names the surface). */
    inlineSwitcher?: React.ReactNode;
    children: React.ReactNode;
}): React.ReactElement {
    const label = props.pane === "ai" ? "AI" : "BI";
    const state = props.isFocused ? "maximized" : props.isBackgrounded ? "minimized" : "normal";

    // Pane chrome buttons use a quieter "ghost" treatment: lighter border, smaller
    // type, tighter padding. Active/pinned states keep the accent so they remain
    // legible. All aria-labels are preserved — see
    // viewportControls.integration.test.tsx for the contract.
    const buttonStyle: React.CSSProperties = {
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 4,
        background: "rgba(255,255,255,0.78)",
        color: "#374151",
        cursor: "pointer",
        fontSize: 11,
        lineHeight: 1,
        minHeight: 22,
        padding: "0 7px",
        whiteSpace: "nowrap",
    };
    const activeButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 600,
    };
    // Icon-only buttons used by the inline action cluster. Same ghost base
    // as text buttons but square-ish for visual rhythm with the Pulse
    // gn-pane-action-cluster on the AI side. Tight padding so 6 icons +
    // the title block fit in a narrow split pane without truncating the
    // vendor subtitle.
    const iconButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        minWidth: 22,
        padding: "0 3px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    };
    const activeIconButtonStyle: React.CSSProperties = {
        ...iconButtonStyle,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#1d4ed8",
    };
    const focusedHeaderRightReserve = "8px";

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
            {!props.hideHeader && (
                <div
                    data-testid={`pp-panel-chrome-header-${props.pane}`}
                    style={{
                        flex: "0 0 auto",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: `5px ${focusedHeaderRightReserve} 5px 9px`,
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        background: props.isFocused ? "#f8fafc" : "rgba(248,250,252,0.6)",
                    }}
                >
                    {/* When the caller supplies an inline switcher (the
                      * SurfaceSwitcher pill for the BI pane), let it take
                      * the title's slot. The active tab name in the switcher
                      * already conveys what surface this is — duplicating
                      * the "BI" title was just extra vertical noise (see
                      * user feedback 2026-05-20 + Codex EL-SWITCHER-COPY). */}
                    {props.inlineSwitcher ? (
                        <div style={{ minWidth: 0, flex: "1 1 auto", display: "flex", alignItems: "center", overflow: "hidden" }}>
                            {props.inlineSwitcher}
                        </div>
                    ) : (
                        <div style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.title}</div>
                            {props.subtitle && (
                                <div style={{ fontSize: 10.5, opacity: 0.6, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={props.subtitle}>
                                    {props.subtitle}
                                </div>
                            )}
                        </div>
                    )}
                    {!props.quiet && (
                        <div
                            role="toolbar"
                            data-testid={`pp-panel-controls-${props.pane}`}
                            aria-label={`${label} panel controls`}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                flex: "0 0 auto",
                                flexWrap: "nowrap",
                                justifyContent: "flex-end",
                                minWidth: 0,
                                position: "relative",
                            }}
                        >
                        {/* Inline icon action cluster — visual parity with the
                         *  Pulse `gn-pane-action-cluster` on the AI side. All
                         *  the aria-labels match the previous text-menu items
                         *  so the integration tests + a11y selectors keep
                         *  working without rewrite. */}

                        {/* Maximize / Restore — state-relevant focus toggle */}
                        {props.isFocused ? (
                            <button
                                type="button"
                                aria-label={`Restore ${label} panel`}
                                title="Restore split layout"
                                onClick={props.onRestore}
                                style={activeIconButtonStyle}
                            >
                                <Icon name="restore" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                aria-label={`Maximize ${label} panel`}
                                title={`Maximize ${label} panel`}
                                onClick={props.onFocus}
                                style={iconButtonStyle}
                            >
                                <Icon name="maximize" />
                            </button>
                        )}

                        {/* Minimize — collapse pane to dock */}
                        <button
                            type="button"
                            aria-label={`Minimize ${label} panel`}
                            title={`Minimize ${label} panel`}
                            onClick={props.onMinimize}
                            style={iconButtonStyle}
                        >
                            <Icon name="minimize" />
                        </button>

                        {/* Pin / Unpin — toggle the focused-pane startup layout */}
                        <button
                            type="button"
                            aria-label={props.isPinned ? "Unpin layout" : "Pin layout"}
                            title={props.isPinned ? "Unpin this focused startup layout" : "Pin this pane as the focused startup layout"}
                            aria-pressed={props.isPinned}
                            onClick={props.onPinToggle}
                            style={props.isPinned ? activeIconButtonStyle : iconButtonStyle}
                        >
                            <Icon name="pin" />
                        </button>

                        {/* Open in separate page — full new browser tab */}
                        <button
                            type="button"
                            aria-label={`Open ${label} panel in separate page`}
                            title={`Open ${label} panel in separate page`}
                            onClick={props.onOpenPage}
                            style={iconButtonStyle}
                        >
                            <Icon name="external-link" />
                        </button>

                        {/* Pop out window — detached browser window. Renamed
                         *  from "Float" 2026-05-17 to free up the "Float" /
                         *  "Compare as panel" naming for the future in-app
                         *  floating-companion surface (gated on Option B
                         *  three-piece architecture; see AGENT_SYNC.md). */}
                        <button
                            type="button"
                            aria-label={`Pop out ${label} panel as window`}
                            title={`Pop out ${label} panel as a detached browser window you can keep alongside the main app`}
                            onClick={props.onFloat}
                            style={iconButtonStyle}
                        >
                            <Icon name="float-window" />
                        </button>

                        {/* Show both panels — distinct intent from the focus
                         *  toggle (return to split layout when one pane has
                         *  been exclusively focused). aria-label "Show both
                         *  panels" preserved verbatim per the integration-test
                         *  contract. Now an icon (two side-by-side rects =
                         *  "two panes") so the chrome is purely iconographic
                         *  and the vendor subtitle stops getting truncated
                         *  in narrow split panes. */}
                        {props.canShowBoth && (
                            <button
                                type="button"
                                aria-label="Show both panels"
                                title="Show both panels"
                                onClick={props.onShowBoth}
                                style={iconButtonStyle}
                            >
                                <Icon name="show-both" />
                            </button>
                        )}
                        </div>
                    )}
                </div>
            )}
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

// In-app floating panel — an alternative to window.open() for the
// "float AI pane" action. Renders as a fixed-position draggable overlay
// so the user can keep the AI panel visible while scrolling/interacting
// with the BI surface below, without leaving the app or losing auth state.
// Drag is handled by tracking clientX/Y delta from the mousedown anchor
// to avoid jitter from event batching. CSS `resize: both` gives free
// corner-resize without additional JS. The panel is not modal — the BI
// canvas behind it remains interactive.
function FloatingPanel(props: {
    pos: { x: number; y: number };
    onPosChange: (pos: { x: number; y: number }) => void;
    onDock: () => void;
    title: string;
    children: React.ReactNode;
}): React.ReactElement {
    // Store drag-start state in a ref (not React state) so mousemove
    // handlers always read the value at capture time without stale closures.
    const dragAnchor = useRef<{
        startClientX: number; startClientY: number;
        startPosX: number; startPosY: number;
    } | null>(null);

    const onDragHandleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragAnchor.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPosX: props.pos.x,
            startPosY: props.pos.y,
        };
        const onMove = (ev: MouseEvent) => {
            const a = dragAnchor.current;
            if (!a) return;
            // 2026-05-19 fix: clamp drag bounds to viewport so the panel
            // can't be dragged offscreen on narrow viewports. Header buttons
            // (Dock, Close) must always remain reachable. We use the panel's
            // own bounding rect to compute the live width — handles the
            // resize:both case where the user has dragged the resize handle.
            const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;
            const rect = (ev.target as Element)?.closest?.('[role="complementary"]')?.getBoundingClientRect();
            const w = rect?.width ?? 520;
            const h = rect?.height ?? 480;
            const MARGIN = 16;
            const nextX = a.startPosX + ev.clientX - a.startClientX;
            const nextY = a.startPosY + ev.clientY - a.startClientY;
            props.onPosChange({
                x: Math.min(Math.max(MARGIN, nextX), Math.max(MARGIN, vw - w - MARGIN)),
                y: Math.min(Math.max(MARGIN, nextY), Math.max(MARGIN, vh - h - MARGIN)),
            });
        };
        const onUp = () => {
            dragAnchor.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [props]);

    // 2026-05-19 fix: derive width from the viewport so the panel never
    // exceeds the screen. Codex's visible E2E pass at 390 px caught the
    // Dock button measured at x=453 (offscreen) — root cause was width: 520
    // hardcoded with no viewport awareness. Now: clamped at 520 max with
    // 16 px margin per side; min 300 keeps the chrome usable.
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const computedWidth = Math.min(520, Math.max(300, viewportW - 32));

    return (
        <div
            role="complementary"
            aria-label={props.title}
            style={{
                position: "fixed",
                left: props.pos.x,
                top: props.pos.y,
                width: computedWidth,
                height: "80vh",
                maxWidth: "calc(100vw - 32px)",
                minWidth: 280,
                minHeight: 220,
                zIndex: 1200,
                display: "flex",
                flexDirection: "column",
                borderRadius: 10,
                boxShadow: "0 12px 40px rgba(0,0,0,0.22), 0 2px 10px rgba(0,0,0,0.12)",
                border: "1px solid rgba(0,0,0,0.10)",
                outline: "none",
                overflow: "hidden",
                background: "#ffffff",
                resize: "both",
            }}
        >
            {/* Drag handle strip — the only chrome added by the float container.
              * Keep it minimal: title + dock button. The Pulse panel's own
              * AI Insights / Ask Pulse toolbar handles everything else. */}
            <div
                onMouseDown={onDragHandleMouseDown}
                style={{
                    flex: "0 0 auto",
                    height: 34,
                    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                    borderBottom: "1px solid rgba(0,0,0,0.07)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px 0 12px",
                    cursor: "grab",
                    userSelect: "none",
                    gap: 8,
                }}
            >
                {/* Drag affordance dots */}
                <span aria-hidden="true" style={{ fontSize: 12, color: "rgba(0,0,0,0.28)", letterSpacing: 1 }}>⠿</span>
                <span style={{ flex: "1 1 auto", fontSize: 11.5, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {props.title}
                </span>
                <button
                    type="button"
                    onClick={props.onDock}
                    title="Dock back to split layout"
                    aria-label="Dock panel back to split layout"
                    style={{
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 5,
                        background: "rgba(255,255,255,0.82)",
                        color: "#374151",
                        cursor: "pointer",
                        padding: "2px 9px",
                        fontSize: 11,
                        fontWeight: 500,
                        lineHeight: "18px",
                        flexShrink: 0,
                    }}
                >
                    Dock ↙
                </button>
            </div>
            {/* Panel content fills remaining height */}
            <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>
                {props.children}
            </div>
        </div>
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

function BiSurfaceModeMiniControl(props: {
    mode: BiSurfaceMode;
    runtimeVendor: string;
    resolutionReason: string;
    onChange: (mode: BiSurfaceMode) => void;
}): React.ReactElement {
    const options: Array<{ mode: BiSurfaceMode; label: string; title: string }> = [
        { mode: "auto", label: "Auto", title: "Vendor when configured, otherwise native" },
        { mode: "vendor", label: "Vendor", title: "Force the selected vendor adapter" },
        { mode: "native", label: "Native", title: "Force PulsePlay's native result renderer" },
    ];
    return (
        <section className="pp-vendor-picker" data-bi-surface-mode={props.mode}>
            <div className="pp-vendor-picker__label">BI surface mode</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {options.map(option => {
                    const selected = props.mode === option.mode;
                    return (
                        <button
                            key={option.mode}
                            type="button"
                            aria-pressed={selected}
                            title={option.title}
                            onClick={() => props.onChange(option.mode)}
                            style={{
                                border: `1px solid ${selected ? "var(--pp-accent, #0078d4)" : "var(--pp-border, rgba(0,0,0,0.18))"}`,
                                background: selected ? "rgba(0,120,212,0.08)" : "transparent",
                                color: "var(--pp-text, #1d1d1f)",
                                borderRadius: 5,
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: selected ? 700 : 500,
                                minWidth: 76,
                                padding: "5px 8px",
                            }}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
            <p className="pp-vendor-picker__desc">
                Runtime: {props.runtimeVendor} ({props.resolutionReason})
            </p>
        </section>
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
    /** Allowlist fail-closed P1 — forwarded to each BIPanel so panels
     *  refuse to mount while the governance endpoint is unreachable. */
    allowlistFailClosed?: boolean;
    onEvent: (e: BIEvent) => void;
    onAdapterReady: (index: number, adapter: BIAdapter | null) => void;
}): React.ReactElement {
    const { tileMode, vendor, embedConfig, allowlist, allowlistFailClosed, onEvent, onAdapterReady } = props;
    if (tileMode === "1") {
        return (
            <BIPanel
                vendor={vendor}
                embedConfig={embedConfig}
                allowlist={allowlist}
                allowlistFailClosed={allowlistFailClosed}
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
                        allowlistFailClosed={allowlistFailClosed}
                        onEvent={onEvent}
                        onAdapterReady={(adapter) => onAdapterReady(i, adapter)}
                    />
                </div>
            ))}
        </div>
    );
}
