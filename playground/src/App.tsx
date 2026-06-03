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
import { PulsePlayScreen } from "./components/PulsePlayScreen";
import { TopRightToolbar } from "./components/TopRightToolbar";
import { listVendors } from "./biPanel/registry";
import type { BIAdapter, BICapabilities, BICommand, BIEvent, BIEmbedConfig } from "./biPanel/BIAdapter";
import type powerbi from "./pulse/_adapter/powerbi-visuals-api";
import { Icon } from "./pulse/_adapter/Icon";
import { UnifiedAssistantSurface, type AnswerEntry, type AutoSubmitQuestionEvent } from "./components/UnifiedAssistantSurface";
// SustainabilityIndicator dropped 2026-05-23 per user feedback — the gauge
// wasn't earning the visual real estate it was using. Component file +
// usageTracker remain in the codebase as dead-but-tested code in case a
// future cycle wants to re-introduce session-cost telemetry differently.
import { entryToAIResultEnvelope } from "./visualization/entryToEnvelope";
// Phase A 2026-05-23 — VendorPicker / ConnectorPicker / EmbedConfigForm
// were the main-viewport pickers leaking the Settings UI. They now live
// only inside playground/src/settings/groups/{BiGroup,AiGroup}.tsx.
import { useEmbedConfig } from "./settings/embedConfigStore";
import { warmGenieWarehouse, startWarehouseKeepalive, stopWarehouseKeepalive } from "./lib/warehouseWarmup";
import { FirstRunWizard, WizardErrorBoundary, shouldShowWizard, type PersonaKey } from "./components/FirstRunWizard";
import { SurfaceSwitcher } from "./components/SurfaceSwitcher";
import { BundleSwitcher } from "./components/BundleSwitcher";
import { PaneEmptyState, DashboardIcon } from "./components/PaneEmptyState";
import type { SurfaceId } from "./surfaceRegistry";
import { isSurfaceId } from "./surfaceRegistry";
import {
    resolveSurfaceAvailability,
    type EnabledFeaturesInput,
} from "./surfaces/surfaceAvailability";
import { readPulseAiVisualSettings } from "./settings/pulseVisualSettingsStore";
import { computeSurfaceContext } from "./lib/computeSurfaceContext";
// Phase A — TestConnectionPanel + PackPicker (component) now live only in
// Settings → AI; type-only imports remain for state plumbing.
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
import { SettingsProvider, useSettings, DEFAULT_UI_MODE, readTabVisibility } from "./settings/settingsStore";
import { resolveDefaultSurface } from "./featureRegistry/resolver";
import { SurfaceModeChip } from "./components/SurfaceModeChip";
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
type PulseSurfaceTab = "insights" | "chat" | "dashboard";
type MixSurface = "ai" | "bi";
const ACTIVE_SURFACE_STORAGE_KEY = "pulseplay:active-surface";
const ACTIVE_SURFACE_URL_PARAM = "surface";
const PINNED_VIEWPORT_PANE_STORAGE_KEY = "pulseplay:pinned-viewport-pane";
const PULSEPLAY_VIEWPORT_ACTION_EVENT = "pulseplay:viewport-action";
const PULSEPLAY_VIEWPORT_STATE_EVENT = "pulseplay:viewport-state";
type PulsePlayViewportAction = "focus" | "restore" | "minimize" | "pin" | "open-page" | "float" | "dock" | "reload";

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
 * <UnifiedAssistantSurface> and the AI request went out with an empty assistantProfile.
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
    // ARCH-P1 slice 3 — delegate to the feature-registry resolver. The
    // explicit override + DEFAULT_UI_MODE fallback contract from ARCH-P0
    // is preserved (Step 1 + Step 5 of resolveDefaultSurface). Mirrors
    // settingsStore.readUiMode() — both readers MUST stay in lockstep
    // or the cold-boot surface flickers between renderers.
    if (typeof window === "undefined") return DEFAULT_UI_MODE;
    let explicit: "pulse" | "v0" | null = null;
    try {
        const stored = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
        if (stored === "v0" || stored === "pulse") explicit = stored;
    } catch { /* swallow */ }
    const resolved = resolveDefaultSurface({
        explicitUiMode: explicit,
        requiredFeatures: [],
        tabVisibility: readTabVisibility(),
    });
    // Resolver can return "dashboard" (a registered surface), but App's
    // uiMode field only holds "pulse" | "v0" — dashboard surface is
    // selected via tabVisibility + per-tab routing, not via this field.
    // Map dashboard → DEFAULT_UI_MODE so the legacy field stays valid.
    return resolved === "dashboard" ? DEFAULT_UI_MODE : resolved;
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
        const raw = new URL(window.location.href).searchParams.get(ACTIVE_SURFACE_URL_PARAM);
        // 2026-05-27 — URL alias map. Internal SurfaceId is `bi-viz` (Pulse
        // heritage name), but the user-facing tab label + showcase URLs use
        // the friendlier `dashboard`. Accept either; canonicalise to the
        // internal id before validating. Without this, `?surface=dashboard`
        // silently fell through to the AI Insights default.
        const value = raw === "dashboard" ? "bi-viz" : raw;
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
    if (surface === "bi-viz") return "dashboard";
    return null;
}

function surfaceFromMixState(surface: MixSurface, pulseTab?: PulseSurfaceTab): SurfaceId {
    if (surface === "bi") return "bi-viz";
    return pulseTab === "chat" ? "ask-pulse" : "ai-insights";
}

/**
 * 2026-05-22 — read the author-configured default landing surface from
 * localStorage directly (no settingsStore dependency — this runs in
 * useState's lazy initializer before the SettingsProvider mounts).
 * Key must match settingsStore.KEY.defaultLandingSurface. Validates via
 * isSurfaceId so a corrupted localStorage entry can't crash the boot.
 */
function readAuthorDefaultLandingSurface(): SurfaceId | null {
    if (typeof window === "undefined") return null;
    try {
        const v = window.localStorage.getItem("pulseplay:default-landing-surface");
        if (v === "ai-insights" || v === "ask-pulse" || v === "bi-viz") return v;
    } catch { /* swallow */ }
    return null;
}

function readInitialActiveSurface(): SurfaceId {
    // Priority order (per Rajesh's 2026-05-22 direction "by author selection
    // and by default the AI Insights should be the tab where it should open"):
    //   1. URL ?surface= (explicit deep-link / share)
    //   2. URL ?focus=bi (legacy viewport-focus deep-link)
    //   3. Author-configured default landing surface (NEW)
    //   4. localStorage stored active-surface (session memory; only kicks in
    //      when no author default is set)
    //   5. "ai-insights" hardcoded fallback (home base)
    const fromUrl = readSurfaceFromUrl();
    if (fromUrl) return fromUrl;

    const focus = readViewportFocusFromUrl();
    if (focus === "bi") return "bi-viz";

    const authorDefault = readAuthorDefaultLandingSurface();
    if (authorDefault) return authorDefault;

    // 2026-05-28 — AI Insights is the canonical home base. We intentionally do
    // NOT restore the last-used surface (stored sticky) as the landing default:
    // authors asked that the app always OPEN on AI Insights unless a deep-link
    // (?surface= / ?focus=) or an explicit author default (defaultLandingSurface)
    // says otherwise. The stored surface is still tracked for cross-tab sync +
    // focus-restore (see the popstate / display-change handlers), just not used
    // to pick the initial surface — sticky-Ask-Pulse was landing users away
    // from the home tab on every reload.
    return "ai-insights";
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
    // 2026-05-26 — opt-in via `pulseplay:rq-devtools=1` localStorage flag.
    // The default-on dev launcher button overlapped the Ask Pulse composer
    // CTAs (bottom-right collided with Send; bottom-left collided with the
    // textarea placeholder). Most dev work doesn't actually use the React
    // Query panel — when you do, set the flag and reload. This keeps the
    // user-facing chat surface clean without removing the capability.
    const [Devtools, setDevtools] = useState<ComponentType<{ initialIsOpen?: boolean; buttonPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "relative" }> | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV || import.meta.env.MODE === "test") return;
        try {
            if (typeof window === "undefined") return;
            if (window.localStorage.getItem("pulseplay:rq-devtools") !== "1") return;
        } catch { return; }
        let cancelled = false;
        void import("@tanstack/react-query-devtools").then((mod) => {
            if (!cancelled) setDevtools(() => mod.ReactQueryDevtools);
        });
        return () => { cancelled = true; };
    }, []);

    return Devtools ? <Devtools initialIsOpen={false} buttonPosition="top-left" /> : null;
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
    // change was invisible to <UnifiedAssistantSurface>, which then submitted with empty
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
    // 2026-05-28 — author gate for the Chat (v0) surface chip. Workbench is
    // the default surface; the Workbench⇄Chat top-bar chip only renders when
    // an author has enabled Chat in Settings. Updated live via the same
    // PULSE_VISUAL_SETTINGS_EVENT listener that tracks enabledFeatures.
    const [allowChatSurface, setAllowChatSurface] = useState<boolean>(
        () => readPulseAiVisualSettings().allowChatSurface,
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
    // 2026-05-25 — explicit signal for Mix-mode minimize. Mix mode's normal
    // surface flip (Dashboard nav) and an intentional Minimize click look
    // identical at the state level (mixSurface="bi") but only the latter
    // should render the restore dock. handleViewportMinimize sets this;
    // any SurfaceSwitcher-driven mixSurface change clears it.
    const [mixMinimizedPane, setMixMinimizedPane] = useState<ViewportPane | null>(null);



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

    // ESCAPE-HATCH (2026-05-25): the wizard-driven uiMode write was deleted.
    // All FirstRunWizard personas now return uiMode === "v0", which is also
    // the default from readInitialUiMode() — so writing it via the wizard
    // path was redundant. The only remaining writer of `pulseplay:ui-mode`
    // is dev-tools manual localStorage.setItem, which is the explicit
    // escape hatch during the PulseShell-to-UnifiedAssistantSurface feature-port
    // migration (beast-mode plan Steps 4/5/6). The local React `setUiMode`
    // state setter is kept so the display-change event listener at line
    // ~877 below can sync mid-session if a dev-tools change fires.

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
            // 2026-05-25 — flip surfaces AND record the explicit minimize
            // signal so the dock renders. (Just flipping mixSurface looks
            // identical to user-driven Dashboard navigation; the dock
            // needs to distinguish.)
            setMixSurface(pane === "ai" ? "bi" : "ai");
            setMixMinimizedPane(pane);
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
        // 2026-05-25 — surface-switcher navigation always reflects user
        // intent to view that surface, so any prior Mix-minimized signal
        // is no longer relevant; clear it so the restore dock hides.
        setMixMinimizedPane(null);
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
            else if (action === "pin") handleViewportPinToggle(pane);
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
    }, [applyViewportFocus, enabledComponents, focusedPane, handleMixSurfaceSelect, handleViewportRestore, handleViewportMinimize, handleViewportPinToggle, handleViewportOpenPage, handleViewportFloat, handleViewportDock]);

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
            const next = readPulseAiVisualSettings();
            setEnabledFeatures(next.enabledFeatures);
            setAllowChatSurface(next.allowChatSurface);
        };
        window.addEventListener(PULSE_VISUAL_SETTINGS_EVENT, handler as EventListener);
        return () => window.removeEventListener(PULSE_VISUAL_SETTINGS_EVENT, handler as EventListener);
    }, []);

    // 2026-05-28 — when the author has NOT enabled the Chat surface, end
    // users must always land in Workbench. Coerce uiMode back to "pulse"
    // if a stale localStorage override (or the dev escape hatch) left it on
    // "v0" while Chat is disabled — otherwise the user would be stuck in
    // Chat with no chip to switch back. The author setting wins over the
    // stored mode; the chip + v0 only come back when allowChatSurface is on.
    useEffect(() => {
        if (!allowChatSurface && uiMode !== "pulse") setUiMode("pulse");
    }, [allowChatSurface, uiMode]);

    // "mix" is the unified default: AI Insights / Ask Pulse / BI Viz are
    // peer surfaces in one primary canvas. Authors who want a permanent
    // second BI section use the explicit "both" / Split + Mix preset.
    const mixBiSurfaceActive = enabledComponents === "mix" && mixSurface === "bi" && !focusedPane;
    const aiVisible = enabledComponents === "aiOnly" || enabledComponents === "both" || (enabledComponents === "mix" && !mixBiSurfaceActive);
    const biVisible = enabledComponents === "biOnly" || enabledComponents === "both" || mixBiSurfaceActive;
    const mountedAiVisible = focusedPane ? focusedPane === "ai" || aiVisible : aiVisible;
    const mountedBiVisible = focusedPane ? focusedPane === "bi" || biVisible : biVisible;
    // 2026-05-25 — minimizedPane drives the bottom dock that lets the user
    // restore a hidden pane. Beast-mode e2e probe N2 found that in the
    // default Mix mode, Minimize click flipped mixSurface without ever
    // setting enabledComponents — so this derivation returned null and
    // the dock never mounted. The fix has two parts:
    //   1. (this derivation) Cover the Mix-mode case ONLY when the user
    //      explicitly minimized — tracked via `mixMinimizedPane` below.
    //      Otherwise normal Dashboard-navigation in Mix mode (which also
    //      results in mixSurface="bi") would falsely show a dock.
    //   2. handleViewportMinimize sets mixMinimizedPane; mixSurface
    //      changes via SurfaceSwitcher (handleMixSurfaceSelect) clear it.
    const minimizedPane: ViewportFocus = focusedPane
        ? null
        : enabledComponents === "biOnly"
            ? "ai"
            : enabledComponents === "aiOnly"
                ? "bi"
                : enabledComponents === "mix" && mixMinimizedPane
                    ? mixMinimizedPane
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

    // FW1 — route a completed UnifiedAssistantSurface entry into the active BI adapter as
    // a `renderResult` command when the runtime BI vendor is native. The
    // sidebar continues to show the answer text regardless; this handler
    // adds the canvas paint alongside it. Guarded by:
    //   * runtimeBiVendor === "native" — only the native adapter has
    //     `renderResult` in its command vocabulary. Vendor adapters reject
    //     it as UNSUPPORTED_COMMAND.
    //   * primaryBIAdapter present — without an adapter to dispatch to,
    //     there's nothing to do.
    //   * envelope has answer OR rows — purely-empty envelopes are dropped
    //     because the canvas would just paint an empty state on top of
    //     whatever was there.
    //
    // `runtimeBiVendor` is computed further down the component body, so
    // the handler reads it through a ref kept current by the effect below.
    // This also lets the callback stay stable across vendor switches,
    // which keeps UnifiedAssistantSurface's prop diffing tight.
    //
    // The cast to `BICommand` is a known type widening: `renderResult` is
    // declared on `NativeBICommand`, NOT on the generic `BIAdapter.send`
    // signature. The native adapter accepts it; vendor adapters would
    // throw at runtime — that's why the runtimeBiVendor guard runs first.
    const runtimeBiVendorRef = useRef<string>("");
    const handleEntryCompleted = useCallback((entry: AnswerEntry) => {
        if (runtimeBiVendorRef.current !== "native") return;
        if (!primaryBIAdapter) return;
        const envelope = entryToAIResultEnvelope({
            messageId:   entry.messageId,
            fallbackId:  String(entry.id),
            question:    entry.question,
            answer:      entry.answer,
            sqlQuery:    entry.sqlQuery,
            queryResult: entry.queryResult,
            governance:  entry.governance,
        });
        if (!envelope.answer && !envelope.rows) return;
        void primaryBIAdapter
            .send({ kind: "renderResult", result: envelope } as unknown as BICommand)
            .catch((err) => {
                // Adapter rejects are observable but not fatal — the
                // sidebar still shows the answer text. Log so a flaky
                // adapter surfaces in DevTools.
                console.warn("[App] native renderResult dispatch failed:", err);
            });
    }, [primaryBIAdapter]);

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
    // sessionStorage cache. Subsequent fetches anywhere in the app — UnifiedAssistantSurface,
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
    // FW1 — keep the entry-completed handler's runtimeBiVendor read fresh
    // without re-creating the callback every render. The ref is read inside
    // `handleEntryCompleted`, defined further up the body.
    useEffect(() => {
        runtimeBiVendorRef.current = runtimeBiVendor;
    }, [runtimeBiVendor]);
    const hasRenderableBiSurface = biSurfaceResolution.usesNative || hasEmbedConfig;
    const dashboardSurfaceMode = biSurfaceResolution.usesNative
        ? "Pulse Canvas"
        : hasEmbedConfig
            ? "Embedded BI"
            : "No surface connected";
    const dashboardVendorLabel = useMemo(() => {
        if (biSurfaceResolution.usesNative || runtimeBiVendor === "native") return "Pulse Canvas";
        return visibleVendors.find(v => v.vendor === runtimeBiVendor)?.displayName || runtimeBiVendor;
    }, [biSurfaceResolution.usesNative, runtimeBiVendor, visibleVendors]);
    const dashboardAssistantLabel = pulseAssistantProfile || activeConnector || "No assistant";
    const dashboardPackLabel = packSelection?.pack
        ? packSelection.subVertical
            ? `${packSelection.pack} / ${packSelection.subVertical}`
            : packSelection.pack
        : "No pack selected";
    // 2026-05-27 — split the binary "Governed" fall-through into an
    // evidence-aware ladder per Codex audit P1 #20. The previous default
    // claimed "Governed" whenever there was no error, even when allowlist
    // was null+unconfigured (dev permissive) or unreachable. Now:
    //   - Locked            = allowlist null AND error set (fail-closed)
    //   - Governance warning = error present (governance unreachable)
    //   - Governed          = allowlist configured AND reachable
    //   - Permissive dev    = allowlist null AND not configured (dev local)
    const dashboardTrustLabel = (() => {
        if (allowlistFailClosed) return "Locked";
        if (allowlistState.error) return "Governance warning";
        if (allowlistState.allowlist?.configured) return "Governed";
        return "Permissive dev";
    })();
    const setupReadiness = getSetupReadiness({
        biVendor: runtimeBiVendor,
        embedConfig,
        activeAiProfile: pulseAssistantProfile || activeConnector,
    });
    // 2026-06-03 — provenance-footer context. Same evidence-aware trust ladder the
    // surfaces use (computeSurfaceContext), so the footer reads e.g. "AI configured
    // · No BI fields" consistently. measure/dimension counts aren't tracked at the
    // app level, so they default to 0 (→ "AI configured · No BI fields" when ready).
    const footerSurfaceContext = computeSurfaceContext({
        isConfigured: setupReadiness.ready,
        assistantProfile: dashboardAssistantLabel,
        mode: "Workspace",
        selectedFilterCount: 0,
        currentScopeLabel: "",
        measureCount: 0,
        dimensionCount: 0,
        sendContextToAi: true,
    });
    const footerProfileLabel = dashboardAssistantLabel === "default" ? "Default profile" : dashboardAssistantLabel;
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

    /** Wizard "Done & ask" → UnifiedAssistantSurface auto-submit. Captured here and
     *  passed to UnifiedAssistantSurface via the `autoSubmitQuestion` prop. The event id
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
            // uiMode write removed. All wizard personas now return
            // DEFAULT_UI_MODE (the same default readInitialUiMode() resolves to),
            // so writing through the wizard path is redundant. The wizard's
            // picks.uiMode field is kept in the type contract for the
            // forthcoming feature-feasibility resolver to consume — see
            // docs/research/READ_ONLY_PRODUCT_TEST_RESULTS_AND_BRUTAL_ARCHITECT_FEEDBACK_FOR_CLAUDE_2026-05-27.md.
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
            // "Done & ask" path: arm UnifiedAssistantSurface to fire ask() once on the
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
        [setEmbedConfig, handleLayoutModeChange, settings],
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
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* 2026-05-27 — Surface-mode chip (Workbench ⇄ Chat).
                      * 2026-05-28 — author-gated: Workbench is the default
                      * surface, and this chip only renders when an author
                      * has enabled the Chat surface in Settings. End users
                      * with Chat disabled never see a surface switcher. */}
                    {/* 2026-05-30 — AI & BI enabler chip (ADR-0011). One
                      * chained control that swaps the bound (BI surface × AI
                      * brain) pair, replacing the two-knob picker for the
                      * default path. Self-hides when there's nothing to
                      * switch between. */}
                    <BundleSwitcher />
                    {allowChatSurface && <SurfaceModeChip currentMode={uiMode} />}
                    <SetupStatusPill readiness={setupReadiness} />
                </div>
            </header>

            {/* 2026-05-25 — Top-right toolbar (Commit 5 of per-tab-visibility
              * ship). Single global cluster of cross-cutting affordances
              * (Maximize / Minimize / Pin / Pop-out / Open-in-new / Show-all)
              * positioned below the green Ready pill. Replaces the per-pane
              * toolbars in PaneChrome + Pulse's gn-pane-action-cluster as
              * the canonical entry point. Per-pane button clusters are
              * hidden via the global stylesheet rule below. */}
            {/* 2026-06-03 — screen/pane controls (dock/maximize · undock/pop-out ·
              * minimize · pin · open-in-page) live HERE, docked inline on Row 2's
              * baseline (the toolbar is de-boxed — transparent, borderless — via
              * styles.css, NOT a floating box). They were briefly folded into the
              * ⋮ menu then stripped from it, which lost them entirely; restored as
              * the visible second-header-section controls the design always intended.
              * Still dispatches pulseplay:viewport-action; App handler unchanged. */}
            {!wizardShown && (
                <TopRightToolbar
                    activePane={effectiveSurfaceId === "bi-viz" ? "bi" : "ai"}
                    activeTabName={
                        effectiveSurfaceId === "ai-insights" ? "AI Insights" :
                        effectiveSurfaceId === "ask-pulse"   ? "Ask Pulse"   :
                        effectiveSurfaceId === "bi-viz"      ? "Dashboard"   :
                        "current"
                    }
                    isFocused={focusedPane !== null && (focusedPane === (effectiveSurfaceId === "bi-viz" ? "bi" : "ai"))}
                    isPinned={pinnedViewportPane !== null && (pinnedViewportPane === (effectiveSurfaceId === "bi-viz" ? "bi" : "ai"))}
                    canShowAll={focusedPane !== null || enabledComponents === "aiOnly" || enabledComponents === "biOnly"}
                />
            )}
            {/* 2026-06-03 — single persistent provenance footer for ALL screens
              * (AI Insights / Ask Pulse / Dashboard). Context — relocated out of the
              * former per-pane pills/strips — lives HERE only, so it's identical on
              * every surface; boilerplate app metadata on the right. Fixed to the
              * viewport bottom (36px), themed via data-pp-theme, hidden on mobile
              * where the bottom-nav owns the bottom edge. */}
            {!wizardShown && (
                <footer className="gn-app-footer" role="contentinfo">
                    <span className="gn-app-footer__context">
                        <span aria-hidden="true">⚙</span>{" "}
                        Context: {footerSurfaceContext.trust}
                    </span>
                    <span className="gn-app-footer__meta">
                        Generated by PulsePlay · Source: {footerProfileLabel} · v1.0.4
                    </span>
                </footer>
            )}
            {/* Hide the legacy per-pane button clusters so they don't
              * render duplicates of what TopRightToolbar now owns. The
              * Pulse-side cluster (.gn-pane-action-cluster) was REMOVED
              * from visual.tsx outright in the follow-up commit; only
              * PaneChrome's per-pane controls remain in the DOM (still
              * referenced by the viewportControls integration tests).
              * The next cleanup commit will retire those too. */}
            <style>{`
                [data-testid="pp-panel-controls-ai"],
                [data-testid="pp-panel-controls-bi"] {
                    display: none !important;
                }
            `}</style>

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
            ) : (<PulsePlayScreen
                /* Step 2b 2026-05-25: PulsePlayScreen now owns the
                 * COMPOSITION of the three unified-screen slots via
                 * named render-props. App.tsx still provides each slot's
                 * content (because helpers like FloatingPanel /
                 * SplitLayout / MinimizedPaneDock are defined in this
                 * file and aren't exported). Steps 3/7/8 absorb the
                 * slot contents into PulsePlayScreen one at a time. */
                floatingPaneSlot={floatedPane === "ai" ? (
                <FloatingPanel
                    pos={floatPos}
                    onPosChange={setFloatPos}
                    onDock={handleViewportDock}
                    title="AI Insights — floating"
                >
                    <PaneChrome
                        pane="ai"
                        title="PulsePlay AI"
                        subtitle="AI playground"
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
                                    className="pp-allowlist-chip"
                                    data-fail-closed={allowlistFailClosed ? "true" : "false"}
                                >
                                    <span className="pp-allowlist-chip__icon" aria-hidden="true">⚠</span>
                                    <span className="pp-allowlist-chip__label">
                                        {allowlistFailClosed
                                            ? "Proxy unreachable — config locked"
                                            : "Governance config unavailable"
                                        }
                                    </span>
                                    <a className="pp-allowlist-chip__more" href="/settings/setup" title="Open Setup to verify proxy configuration">Open Setup</a>
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
                                <UnifiedAssistantSurface
                                    activeVendor={runtimeBiVendor}
                                    activeConnector={activeConnector}
                                    recentEvents={recentEvents}
                                    packSelection={packSelection}
                                    autoSubmitQuestion={wizardAutoSubmit}
                                    onEntryCompleted={handleEntryCompleted}
                                />
                            )}
                        </aside>
                    </PaneChrome>
                </FloatingPanel>
                ) : null}
                mainLayoutSlot={(
            <SplitLayout
                // 2026-05-25 — DUPLICATIVE DETACH (mirroring): when a pane
                // is popped out (floatedPane set), keep it visible in its
                // main slot too instead of relocating. Per design doc D5
                // + user direction, the floating pane should be a copy/
                // mirror of the original. True per-pane state isolation
                // (so typing in one doesn't echo to the other) is the
                // Phase C runtime work — pane registry keyed by paneId,
                // independent React roots per PaneInstance, etc. For now
                // they share state but the main slot no longer goes
                // empty when you Pop-out.
                aiVisible={mountedAiVisible}
                biVisible={mountedBiVisible}
                // 2026-05-28 — mix mode shows one pane at a time, but both
                // panes are ENABLED. Keep the hidden pane mounted (toggle
                // visibility, don't unmount) so switching AI ↔ Dashboard
                // never reloads an already-loaded surface — visuals, chat
                // history, scroll position all persist. Only a hard reload
                // re-mounts. aiOnly/biOnly leave this false (the other pane
                // is genuinely disabled and must not mount).
                keepHiddenPaneMounted={enabledComponents === "mix"}
                layoutMode={layoutMode}
                focusedPane={focusedPane}
                aiContent={(
                    <PaneChrome
                        pane="ai"
                        title="PulsePlay AI"
                        subtitle="AI playground"
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
                                    className="pp-allowlist-chip"
                                    data-fail-closed={allowlistFailClosed ? "true" : "false"}
                                    title={allowlistFailClosed
                                        ? `BI surfaces will not mount until the proxy responds. Check the proxy is running on ${readConfiguredProxyBase()} and reload.`
                                        : "Governance config could not be loaded; pickers may be incomplete until the proxy responds."
                                    }
                                >
                                    <span className="pp-allowlist-chip__icon" aria-hidden="true">⚠</span>
                                    <span className="pp-allowlist-chip__label">
                                        {allowlistFailClosed
                                            ? "Proxy unreachable — config locked"
                                            : "Governance config unavailable"
                                        }
                                    </span>
                                    <a className="pp-allowlist-chip__more" href="/settings/setup" title="Open Setup to verify proxy configuration">Open Setup</a>
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
                                // UX-ARCH-0B.2 Phase A — v0 mode no longer renders
                                // BiSurfaceModeMiniControl / VendorPicker / EmbedConfigForm
                                // / ConnectorPicker / TestConnectionPanel / PackPicker in
                                // the main viewport. Each of these has a canonical home
                                // in Settings (BiGroup / AiGroup); the duplicate inline
                                // mounts here were the "scattered settings leaking into
                                // the main screen" the 2026-05-23 audit traced. The
                                // UnifiedAssistantSurface is the single thing the
                                // default uiMode should show.
                                <UnifiedAssistantSurface
                                    activeVendor={runtimeBiVendor}
                                    activeConnector={activeConnector}
                                    recentEvents={recentEvents}
                                    packSelection={packSelection}
                                    biAdapter={primaryBIAdapter}
                                    autoSubmitQuestion={wizardAutoSubmit}
                                    onEntryCompleted={handleEntryCompleted}
                                />
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
                            {/* 2026-06-03 — Dashboard context pill REMOVED. Context lives in
                                the single persistent footer only (consistent across all
                                screens). The host-level <footer className="gn-app-footer">
                                below carries it. */}
                            {/* UX-ARCH-0B.2 Phase A — Power BI Developer Tools
                                strip is now gated behind a localStorage flag
                                instead of always-on for PBI authors. Settings
                                → Advanced → Developer Tools will expose the
                                toggle in Phase D. Default off keeps the BI
                                canvas clean for end-viewers. */}
                            {(() => {
                                try {
                                    return localStorage.getItem("pulseplay:powerbi-dev-tools") === "on";
                                } catch { return false; }
                            })() && (
                                <PowerBIDeveloperPanel
                                    activeVendor={runtimeBiVendor}
                                    hasEmbedConfig={hasEmbedConfig}
                                    adapter={primaryBIAdapter}
                                    recentEvents={recentEvents}
                                />
                            )}
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
                                                 ? "Dashboard is the shared data canvas. It can host an embedded BI report or show Pulse Canvas artifacts created from Ask Pulse."
                                                 : "Choose a BI vendor and embed config, or use Pulse Canvas for governed AI-generated charts, tables, and KPIs.";
                                             return (
                                                 <PaneEmptyState
                                                     testid="pp-dashboard-empty"
                                                     icon={DashboardIcon}
                                                     heading="Dashboard"
                                                     description={description}
                                                     capabilities={[
                                                         "Embedded BI mode hosts reports from allowlisted vendors",
                                                         "Pulse Canvas mode shows AI-generated artifacts",
                                                         "AI Insights and Ask Pulse use the same context language",
                                                         "Source, scope, assistant, and trust stay visible",
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
                                                         Dashboard is the same workspace surface whether it is showing
                                                         an embedded BI report or Pulse Canvas output from Ask Pulse.
                                                         Wire a vendor, then switch between Dashboard, AI Insights,
                                                         and Ask Pulse without losing context.
                                                         </>
                                                     }
                                                     capabilities={[
                                                         "Embedded BI mode hosts Power BI, Tableau, Qlik, Looker, Databricks AI/BI, or iframe surfaces",
                                                         "Pulse Canvas mode shows AI-generated charts, tables, and KPIs",
                                                         "AI Insights turns the same scope into an executive briefing",
                                                         "Ask Pulse carries the same source, scope, assistant, and trust",
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
                )}
                minimizedDockSlot={minimizedPane ? (
                    <MinimizedPaneDock
                        pane={minimizedPane}
                        // 2026-05-25 — restore is context-aware. In Mix mode
                        // the user's preference is to keep mix; flipping
                        // mixSurface back to the hidden pane (and clearing
                        // the Mix-minimized signal) restores it without
                        // forcing them into "both" mode. Other modes
                        // (biOnly / aiOnly) drop the minimized state by
                        // returning to "both" via handleShowBothPanes.
                        onRestore={() => {
                            if (enabledComponents === "mix") {
                                setMixSurface(minimizedPane === "ai" ? "ai" : "bi");
                                setMixMinimizedPane(null);
                            } else {
                                handleShowBothPanes();
                            }
                        }}
                    />
                ) : null}
            />)}
            </div>
        </div>
    );
}

/** Map a Dashboard trust label to a Context-badge tone (mirrors the Workbench's
 *  trustBadgeTone so both panes colour the badge identically). */
function dashboardTrustTone(t: string): string {
    const s = (t || "").toLowerCase();
    if (s.includes("governed")) return "ok";
    if (s.includes("locked")) return "bad";
    if (s.includes("warning")) return "warn";
    return "info"; // "Permissive dev" / dev-local default
}

/** 2026-06-03 — collapsed Context pill for the Dashboard/BI pane. Was a verbose
 *  inline `pp-surface-context` strip (Surface · Source · Assistant · Pack · Trust)
 *  that, at the narrow split-pane width, wrapped and crammed — and was visually
 *  inconsistent with the left pane, which had already collapsed its metadata into
 *  the `⚙ Context ▾` dropdown. This reuses the global `gn-context-setup` chrome so
 *  BOTH panes share identical context affordances (three-tabs-uniform rule), while
 *  the popover keeps the Dashboard-specific items. */
function DashboardSurfaceContextStrip(props: {
    mode: string;
    vendor: string;
    assistant: string;
    pack: string;
    trust: string;
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc);
        return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
    }, [open]);
    const tone = dashboardTrustTone(props.trust);
    const rows = [
        { label: "Source", value: props.vendor },
        { label: "Assistant", value: props.assistant },
        { label: "Pack", value: props.pack },
    ];
    return (
        <div className="gn-context-bar">
            <div className="gn-context-setup" ref={ref}>
                <button
                    type="button"
                    className={`gn-context-setup__trigger${open ? " gn-context-setup__trigger--open" : ""}`}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    onClick={() => setOpen(o => !o)}
                >
                    <span className="gn-context-setup__gear" aria-hidden="true">⚙</span>
                    <span className="gn-context-setup__label">Context</span>
                    <span className={`gn-surface-context__badge gn-surface-context__badge--${tone}`}>{props.trust}</span>
                    <span className="gn-context-setup__chevron" aria-hidden="true">▾</span>
                </button>
                {open && (
                    <div className="gn-context-setup__popover" role="dialog" aria-label="Dashboard context">
                        <div className="gn-context-setup__row">
                            <span className="gn-context-setup__row-label">Surface</span>
                            <span className="gn-context-setup__row-value">Dashboard · {props.mode}</span>
                        </div>
                        {rows.map(r => (
                            <div className="gn-context-setup__row" key={r.label}>
                                <span className="gn-context-setup__row-label">{r.label}</span>
                                <span className="gn-context-setup__row-value">{r.value}</span>
                            </div>
                        ))}
                        <div className="gn-context-setup__row">
                            <span className="gn-context-setup__row-label">Trust</span>
                            <span className={`gn-surface-context__badge gn-surface-context__badge--${tone}`}>{props.trust}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SetupStatusPill(props: { readiness: SetupReadiness }): React.ReactElement {
    const ready = props.readiness.ready;
    const dot = ready ? "#22c55e" : "#f59e0b";
    // Theme-aware text so the pill stays AA-legible in dark mode (was a
    // hardcoded #166534 dark-green → only 2.65:1 on the dark bg). The semantic
    // tokens resolve to a darker green/amber in light and a lighter one in dark.
    const fg = ready ? "var(--pp-success, #166534)" : "var(--pp-warning, #7a5b00)";
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
                background: "var(--pp-surface, #fff)",
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
                        borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.06))",
                        background: props.isFocused
                            ? "var(--pp-surface-raised, #f8fafc)"
                            : "var(--pp-surface, rgba(248,250,252,0.6))",
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
                    background: "var(--pp-surface, #fff)",
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
            className="pp-float-panel"
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
                outline: "none",
                overflow: "hidden",
                resize: "both",
            }}
        >
            {/* Drag handle strip — the only chrome added by the float container.
              * Keep it minimal: title + dock button. The Pulse panel's own
              * AI Insights / Ask Pulse toolbar handles everything else. */}
            <div className="pp-float-panel__handle" onMouseDown={onDragHandleMouseDown}>
                {/* Drag affordance dots */}
                <span aria-hidden="true" className="pp-float-panel__dots">⠿</span>
                <span className="pp-float-panel__title">{props.title}</span>
                <button
                    type="button"
                    onClick={props.onDock}
                    title="Dock back to split layout"
                    aria-label="Dock panel back to split layout"
                    className="pp-float-panel__dock"
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
    /** 2026-05-28 — mix mode. When true and exactly one pane is visible,
     *  render BOTH panes (toggle the hidden one's visibility instead of
     *  unmounting it) so switching surfaces never reloads loaded content.
     *  Left false for aiOnly/biOnly where the off pane is truly disabled. */
    keepHiddenPaneMounted?: boolean;
}): React.ReactElement {
    const { aiVisible, biVisible, layoutMode, focusedPane, aiContent, biContent, emptyContent, keepHiddenPaneMounted } = props;

    const orientation: "horizontal" | "vertical" =
        layoutMode === "ai-top" || layoutMode === "ai-bottom" ? "vertical" : "horizontal";
    // Persist split ratio per orientation. Switching between row/column
    // layouts gets independent saved sizes so each feels natural.
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: `pulseplay:split:${orientation}`,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });

    // Stacked-frame renderer — both panes mounted, only the active one
    // visible. Shared by the focusedPane (maximize) and mix-mode (single-
    // surface-at-a-time) branches so neither unmounts the inactive pane.
    const stackedFrames = (activePane: ViewportPane) => {
        const frame = (pane: ViewportPane, content: React.ReactNode) => {
            const isActive = activePane === pane;
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
    };

    if (focusedPane) {
        return stackedFrames(focusedPane);
    }

    // Mix mode: exactly one pane visible, but BOTH are enabled. Keep both
    // mounted and toggle visibility so AI ↔ Dashboard switches preserve
    // loaded state. (aiVisible !== biVisible guards against the both-on /
    // both-off cases, which fall through to the split/empty layouts.)
    if (keepHiddenPaneMounted && aiVisible !== biVisible) {
        return stackedFrames(aiVisible ? "ai" : "bi");
    }

    if (!aiVisible && !biVisible) return <>{emptyContent}</>;
    if (aiVisible && !biVisible) return <>{aiContent}</>;
    if (!aiVisible && biVisible) return <>{biContent}</>;

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
