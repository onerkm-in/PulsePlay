// playground/src/settings/settingsStore.tsx
//
// The Settings canonical state surface. Owns reads + writes for the
// `pulseplay:*` localStorage keys that the Settings page surfaces, and
// re-validates every persisted value against the live allowlist on
// load (closes L11 — XSS-persisted orphan values can no longer become
// silent selections).
//
// Coexistence with existing code: the playground today writes some keys
// directly (App.tsx, small canvas toolbar). The store mirrors those
// keys via the existing `pulseplay:display-change` window event AND its
// own setters dispatch that same event. Net effect: store and legacy
// paths stay in sync during Phase 2-3 migration. Phase 5 retires the
// legacy paths.
//
// The broader `pulseplay:visual-settings:*` namespace is bridged by
// `pulseVisualSettingsStore.ts` so the full Settings page can be the
// single authoring surface. This store only mirrors the active AI profile
// into Pulse's `genieSettings.assistantProfile` so the provider picker and
// Pulse runtime stop drifting.

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    type ReactNode,
} from "react";
import type { PulsePlayAllowlist } from "../types/allowlist";
import type { PackSelection } from "../components/PackPicker";
import { writePulseAiVisualSettingsPatch, writeRawGenieSettingsPatch } from "./pulseVisualSettingsStore";
import {
    BI_SURFACE_MODE_STORAGE_KEY,
    normalizeBiSurfaceMode,
    readInitialBiSurfaceMode,
    type BiSurfaceMode,
} from "./biSurfaceMode";

// ─── Storage keys (mirrors App.tsx + Pulse Cycle H) ───────────────────────

const KEY = {
    biVendor: "pulseplay:bi-vendor",
    biSurfaceMode: BI_SURFACE_MODE_STORAGE_KEY,
    packSelection: "pulseplay:pack-selection",
    uiMode: "pulseplay:ui-mode",
    enabledComponents: "pulseplay:enabled-components",
    layoutMode: "pulseplay:layout-mode",
    biTileMode: "pulseplay:bi-tile-mode",
    activeAiProfile: "pulseplay:active-ai-profile",
    // 2026-05-22 — author-configurable default landing tab. When set,
    // overrides localStorage stickiness so every new visitor sees the
    // author's chosen home tab. See App.tsx readInitialActiveSurface
    // for the priority order (URL > this > stored > "ai-insights").
    defaultLandingSurface: "pulseplay:default-landing-surface",
} as const;

/** Exported so App.tsx readInitialActiveSurface can read the same key
 *  without taking a circular dep on settingsStore. */
export const DEFAULT_LANDING_SURFACE_STORAGE_KEY = KEY.defaultLandingSurface;

/** Surfaces eligible as the author's default landing tab. Subset of
 *  SurfaceId — we exclude composite/derived surfaces, only the three
 *  primary picker options are valid choices. */
export type DefaultLandingSurface = "ai-insights" | "ask-pulse" | "bi-viz";

export function isDefaultLandingSurface(v: unknown): v is DefaultLandingSurface {
    return v === "ai-insights" || v === "ask-pulse" || v === "bi-viz";
}

const ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY = "pulseplay:enabled-components:legacy-both-migrated";

// ─── State shape ─────────────────────────────────────────────────────────

export type UiMode = "pulse" | "v0";
/**
 * Pane composition mode (set by the AUTHOR in Settings → Preferences → Visible
 * panels). End users see only what the author wired:
 *   - aiOnly : AI pane only (no BI canvas) — chat / agent-only deployments
 *   - biOnly : BI pane only (no AI surface) — pure dashboard view
 *   - both   : explicit split-pane, AI + BI side by side
 *   - mix    : default unified surface mode. AI Insights / Ask Pulse own the
 *              main surface; BI remains available as a peer "BI Viz" action
 *              instead of a permanent second section. The Mix composition
 *              sub-panel lets the author cherry-pick individual AI surfaces
 *              and future BI composition once that phase lands.
 */
export type EnabledComponents = "aiOnly" | "biOnly" | "both" | "mix";
export type LayoutMode = "ai-left" | "ai-right" | "ai-top" | "ai-bottom";
export type BiTileMode = "1" | "2" | "4";

export interface OrphanedValue {
    /** Storage key (e.g., "pulseplay:bi-vendor"). */
    key: string;
    /** The value found in localStorage that no longer passes the allowlist. */
    value: string;
    /** Human-readable reason ("biVendor not in allowlist", etc.). */
    reason: string;
}

export interface SettingsState {
    allowlist: PulsePlayAllowlist | null;
    allowlistLoading: boolean;
    allowlistError: string | null;
    biVendor: string;
    biSurfaceMode: BiSurfaceMode;
    packSelection: PackSelection | null;
    uiMode: UiMode;
    enabledComponents: EnabledComponents;
    layoutMode: LayoutMode;
    biTileMode: BiTileMode;
    /** Phase 4 — currently-active AI profile name (one of
     *  `allowlist.aiProfiles`). Persisted to `pulseplay:active-ai-profile`.
     *  Pulse mode also maintains its own `genieSettings.assistantProfile`
     *  via the PulseHostStub persistProperties contract; the settingsStore
     *  reads that on load if `active-ai-profile` is unset so the user's
     *  existing selection survives. Phase 5 unifies the two paths. */
    activeAiProfile: string;
    /** 2026-05-22 — author-configurable default landing tab. When null,
     *  the app falls back to "ai-insights" (per Rajesh's 2026-05-22
     *  direction). When set, App.tsx readInitialActiveSurface uses this
     *  in preference to the stored localStorage value. */
    defaultLandingSurface: DefaultLandingSurface | null;
    /** Values found in localStorage that didn't validate against the
     *  live allowlist on the most-recent reconciliation pass. The
     *  Settings page surfaces these as "deprecated" banners. */
    orphans: OrphanedValue[];
}

// ─── Allowlist-aware validators ──────────────────────────────────────────

/**
 * Three distinct "no allowlist in hand" states need to behave differently:
 *
 *   - **Dev-unconfigured** (`allowlist?.configured === false`):
 *     the deployment intentionally has no allowlist authored. Validators
 *     stay permissive. This is the MVP/dev path.
 *   - **First-load fetch failed** (`allowlist === null && allowlistError !== null`):
 *     we never got a known-good list. Fail closed — refuse new selections,
 *     refuse to mount BI panels. The user sees a banner explaining why.
 *   - **Refresh-after-success failed** (`allowlist !== null && allowlistError !== null`):
 *     the last load succeeded; the reducer keeps that value, so validators
 *     continue to enforce against the last-known-good list while the
 *     banner asks the user to reload.
 *
 * `isAllowlistFailClosed(state)` collapses these into a single signal the
 * setters + BIPanel can check. It is exported so callers outside the
 * reducer (App.tsx, BIPanel.tsx) can read it.
 */
export function isAllowlistFailClosed(state: Pick<SettingsState, "allowlist" | "allowlistError" | "allowlistLoading">): boolean {
    if (state.allowlistLoading) return false; // never refuse while still loading — let the loader resolve first
    return state.allowlist === null && !!state.allowlistError;
}

function passesAllowlist(value: string, allowed: string[] | undefined): boolean {
    if (!allowed || allowed.length === 0) return true; // no allowlist configured = permissive (matches proxy "warn" mode)
    return allowed.includes(value);
}

function validateBiVendor(value: string, allowlist: PulsePlayAllowlist | null): boolean {
    if (!value) return false;
    if (!allowlist) return true;
    return passesAllowlist(value, allowlist.biProviders);
}

function validatePack(selection: PackSelection | null, allowlist: PulsePlayAllowlist | null): boolean {
    if (!selection) return true;
    if (!allowlist) return true;
    return passesAllowlist(selection.pack, allowlist.packs);
}

// ─── Initial load + reconciliation ───────────────────────────────────────

function readUiMode(): UiMode {
    // ESCAPE-HATCH (2026-05-25): default is "v0" (AISidebar). The "pulse"
    // value still parses so dev-tools `localStorage.setItem("pulseplay:ui-
    // mode", "pulse")` falls through to PulseShell — needed during the
    // feature-port migration (beast-mode plan Steps 4/5/6). Remove this
    // function's "pulse" branch entirely once PulseShell is removed from
    // App.tsx's mount path. Mirrors App.tsx readInitialUiMode().
    if (typeof window === "undefined") return "v0";
    try {
        const v = window.localStorage.getItem(KEY.uiMode);
        if (v === "v0") return "v0";
        if (v === "pulse") return "pulse";
    } catch { /* swallow */ }
    return "v0";
}

function readEnabledComponents(): EnabledComponents {
    if (typeof window === "undefined") return "mix";
    try {
        const v = window.localStorage.getItem(KEY.enabledComponents);
        if (v === "both"
            && window.localStorage.getItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY) !== "true") {
            window.localStorage.setItem(KEY.enabledComponents, "mix");
            window.localStorage.setItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY, "true");
            return "mix";
        }
        if (v === "aiOnly" || v === "biOnly" || v === "both" || v === "mix") return v;
    } catch { /* swallow */ }
    return "mix";
}

function readLayoutMode(): LayoutMode {
    if (typeof window === "undefined") return "ai-left";
    try {
        const v = window.localStorage.getItem(KEY.layoutMode);
        if (v === "ai-left" || v === "ai-right" || v === "ai-top" || v === "ai-bottom") return v;
    } catch { /* swallow */ }
    return "ai-left";
}

function readBiTileMode(): BiTileMode {
    if (typeof window === "undefined") return "1";
    try {
        const v = window.localStorage.getItem(KEY.biTileMode);
        if (v === "1" || v === "2" || v === "4") return v;
    } catch { /* swallow */ }
    return "1";
}

function readBiVendor(): string {
    if (typeof window === "undefined") return "powerbi";
    try {
        return window.localStorage.getItem(KEY.biVendor) || "powerbi";
    } catch { /* swallow */ }
    return "powerbi";
}

function readActiveAiProfile(): string {
    if (typeof window === "undefined") return "";
    try {
        const direct = window.localStorage.getItem(KEY.activeAiProfile);
        if (direct && direct.trim()) return direct.trim();
        // Fallback — Pulse mode persists its assistantProfile inside
        // genieSettings via persistProperties. Read that so a returning
        // Pulse user doesn't lose their selection when we layer the new
        // settingsStore on top.
        const pulseRaw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (pulseRaw) {
            const parsed = JSON.parse(pulseRaw);
            const profile = parsed && typeof parsed === "object" ? parsed.assistantProfile : "";
            if (typeof profile === "string" && profile.trim()) return profile.trim();
        }
    } catch {
        /* swallow */
    }
    return "";
}

function readPackSelection(): PackSelection | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(KEY.packSelection);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PackSelection;
        if (parsed && typeof parsed.pack === "string" && parsed.pack) return parsed;
    } catch { /* swallow */ }
    return null;
}

function readDefaultLandingSurface(): DefaultLandingSurface | null {
    if (typeof window === "undefined") return null;
    try {
        const v = window.localStorage.getItem(KEY.defaultLandingSurface);
        return isDefaultLandingSurface(v) ? v : null;
    } catch { /* swallow */ }
    return null;
}

function buildInitialState(): SettingsState {
    return {
        allowlist: null,
        allowlistLoading: true,
        allowlistError: null,
        biVendor: readBiVendor(),
        biSurfaceMode: readInitialBiSurfaceMode(),
        packSelection: readPackSelection(),
        uiMode: readUiMode(),
        enabledComponents: readEnabledComponents(),
        layoutMode: readLayoutMode(),
        biTileMode: readBiTileMode(),
        activeAiProfile: readActiveAiProfile(),
        defaultLandingSurface: readDefaultLandingSurface(),
        orphans: [],
    };
}

function validateAiProfile(profile: string, allowlist: PulsePlayAllowlist | null): boolean {
    if (!profile) return true; // empty = nothing selected = not an orphan
    if (!allowlist) return true;
    return passesAllowlist(profile, allowlist.aiProfiles);
}

function reconcileWithAllowlist(state: SettingsState, allowlist: PulsePlayAllowlist | null): {
    biVendor: string;
    packSelection: PackSelection | null;
    activeAiProfile: string;
    orphans: OrphanedValue[];
} {
    const orphans: OrphanedValue[] = [];
    let biVendor = state.biVendor;
    let packSelection = state.packSelection;
    let activeAiProfile = state.activeAiProfile;

    if (allowlist) {
        if (!validateBiVendor(biVendor, allowlist)) {
            orphans.push({
                key: KEY.biVendor,
                value: biVendor,
                reason: `BI provider "${biVendor}" is not in your organization's allowlist.`,
            });
            // Don't clobber localStorage — surface the orphan and let the
            // Settings page guide the user through re-selection.
        }
        if (packSelection && !validatePack(packSelection, allowlist)) {
            orphans.push({
                key: KEY.packSelection,
                value: packSelection.pack,
                reason: `Pack "${packSelection.pack}" is not in your organization's allowlist.`,
            });
            packSelection = null;
            try { window.localStorage.removeItem(KEY.packSelection); } catch { /* swallow */ }
        }
        if (activeAiProfile && !validateAiProfile(activeAiProfile, allowlist)) {
            orphans.push({
                key: KEY.activeAiProfile,
                value: activeAiProfile,
                reason: `AI provider "${activeAiProfile}" is not in your organization's allowlist.`,
            });
            // Same rule as biVendor — surface the orphan but keep the
            // value so the UI can warn rather than silently dropping it.
        }
    }

    return { biVendor, packSelection, activeAiProfile, orphans };
}

// ─── Reducer ─────────────────────────────────────────────────────────────

type Action =
    | { type: "allowlist/loading" }
    | { type: "allowlist/loaded"; allowlist: PulsePlayAllowlist | null }
    | { type: "allowlist/error"; message: string }
    | { type: "set/biVendor"; value: string }
    | { type: "set/biSurfaceMode"; value: BiSurfaceMode }
    | { type: "set/packSelection"; value: PackSelection | null }
    | { type: "set/uiMode"; value: UiMode }
    | { type: "set/enabledComponents"; value: EnabledComponents }
    | { type: "set/layoutMode"; value: LayoutMode }
    | { type: "set/biTileMode"; value: BiTileMode }
    | { type: "set/activeAiProfile"; value: string }
    | { type: "set/defaultLandingSurface"; value: DefaultLandingSurface | "" }
    | { type: "sync/external"; key: string; value: string };

function reducer(state: SettingsState, action: Action): SettingsState {
    switch (action.type) {
        case "allowlist/loading":
            return { ...state, allowlistLoading: true, allowlistError: null };
        case "allowlist/loaded": {
            const reconciled = reconcileWithAllowlist(state, action.allowlist);
            return {
                ...state,
                allowlist: action.allowlist,
                allowlistLoading: false,
                allowlistError: null,
                biVendor: reconciled.biVendor,
                packSelection: reconciled.packSelection,
                activeAiProfile: reconciled.activeAiProfile,
                orphans: reconciled.orphans,
            };
        }
        case "allowlist/error":
            // Fail-closed P1: do NOT blow away a previously-loaded
            // allowlist on a refresh failure — keep the last-known-good
            // value so the user keeps validated access until the
            // governance endpoint comes back. The error banner surfaces
            // the failure to the user. If this is the FIRST load and
            // there's nothing known-good in hand, allowlist stays null
            // and validators flip to fail-closed via
            // `isAllowlistFailClosed(state)`.
            return {
                ...state,
                allowlistLoading: false,
                allowlistError: action.message,
            };
        case "set/biVendor":
            return { ...state, biVendor: action.value };
        case "set/biSurfaceMode":
            return { ...state, biSurfaceMode: action.value };
        case "set/packSelection":
            return { ...state, packSelection: action.value };
        case "set/uiMode":
            return { ...state, uiMode: action.value };
        case "set/enabledComponents":
            return { ...state, enabledComponents: action.value };
        case "set/layoutMode":
            return { ...state, layoutMode: action.value };
        case "set/biTileMode":
            return { ...state, biTileMode: action.value };
        case "set/activeAiProfile":
            return { ...state, activeAiProfile: action.value };
        case "set/defaultLandingSurface":
            return {
                ...state,
                defaultLandingSurface: isDefaultLandingSurface(action.value) ? action.value : null,
            };
        case "sync/external":
            return applyExternalSync(state, action.key, action.value);
        default:
            return state;
    }
}

function applyExternalSync(state: SettingsState, key: string, value: string): SettingsState {
    switch (key) {
        case KEY.uiMode:
            if (value === "pulse" || value === "v0") return { ...state, uiMode: value };
            return state;
        case KEY.enabledComponents:
            if (value === "aiOnly" || value === "biOnly" || value === "both" || value === "mix") {
                return { ...state, enabledComponents: value };
            }
            return state;
        case KEY.layoutMode:
            if (value === "ai-left" || value === "ai-right" || value === "ai-top" || value === "ai-bottom") {
                return { ...state, layoutMode: value };
            }
            return state;
        case KEY.biTileMode:
            if (value === "1" || value === "2" || value === "4") return { ...state, biTileMode: value };
            return state;
        case KEY.biVendor:
            return { ...state, biVendor: value };
        case KEY.biSurfaceMode:
            return { ...state, biSurfaceMode: normalizeBiSurfaceMode(value) };
        case KEY.activeAiProfile:
            return { ...state, activeAiProfile: value };
        case KEY.defaultLandingSurface:
            return { ...state, defaultLandingSurface: isDefaultLandingSurface(value) ? value : null };
        default:
            return state;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function persistAndBroadcast(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch { /* swallow */ }
    try {
        window.dispatchEvent(
            new CustomEvent("pulseplay:display-change", { detail: { key, value } }),
        );
    } catch { /* swallow */ }
}

function removeAndBroadcast(key: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(key); } catch { /* swallow */ }
    try {
        window.dispatchEvent(
            new CustomEvent("pulseplay:display-change", { detail: { key, value: null } }),
        );
    } catch { /* swallow */ }
}

// ─── Context + provider ──────────────────────────────────────────────────

export interface SettingsActions {
    setBiVendor: (value: string) => { ok: boolean; reason?: string };
    setBiSurfaceMode: (value: BiSurfaceMode) => void;
    setPackSelection: (value: PackSelection | null) => { ok: boolean; reason?: string };
    // setUiMode REMOVED 2026-05-25 — uiMode is no longer user-editable.
    // PulseShell escape hatch is dev-tools-only (localStorage). The reducer
    // case "set/uiMode" remains so the existing display-change event
    // listener can still sync mid-session if a dev-tools change fires.
    setEnabledComponents: (value: EnabledComponents) => void;
    setLayoutMode: (value: LayoutMode) => void;
    setBiTileMode: (value: BiTileMode) => void;
    setActiveAiProfile: (value: string) => { ok: boolean; reason?: string };
    /** 2026-05-22 — set the author's preferred landing tab. Pass null to
     *  clear the override (app falls back to "ai-insights"). */
    setDefaultLandingSurface: (value: DefaultLandingSurface | null) => void;
    reloadAllowlist: () => Promise<void>;
}

export interface SettingsContextValue extends SettingsState, SettingsActions {}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Override hook for tests + storybook scenarios. */
export interface SettingsProviderProps {
    children: ReactNode;
    /** Optional injected fetcher for tests; defaults to fetch("/api/assistant/allowlist"). */
    fetchAllowlist?: () => Promise<PulsePlayAllowlist>;
}

async function defaultFetchAllowlist(): Promise<PulsePlayAllowlist> {
    const res = await fetch("/api/assistant/allowlist");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PulsePlayAllowlist;
}

export function SettingsProvider(props: SettingsProviderProps): React.ReactElement {
    const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
    const fetcher = props.fetchAllowlist ?? defaultFetchAllowlist;

    // Load allowlist once on mount + reconcile.
    const reload = useCallback(async () => {
        dispatch({ type: "allowlist/loading" });
        try {
            const allowlist = await fetcher();
            dispatch({ type: "allowlist/loaded", allowlist });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            dispatch({ type: "allowlist/error", message });
        }
    }, [fetcher]);

    useEffect(() => {
        void reload();
    }, [reload]);

    // Listen for legacy `pulseplay:display-change` events so the store
    // stays in sync when App.tsx or Pulse Cycle H writes directly.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (!detail || typeof detail.key !== "string" || typeof detail.value !== "string") return;
            dispatch({ type: "sync/external", key: detail.key, value: detail.value });
        };
        window.addEventListener("pulseplay:display-change", handler);
        return () => window.removeEventListener("pulseplay:display-change", handler);
    }, []);

    // ─── Setters (allowlist-aware) ────────────────────────────────────

    // Fail-closed reason shared by every governance-aware setter. Keeping
    // it identical across setters means the Settings UI can pattern-match
    // the prefix when rendering banners.
    const FAIL_CLOSED_REASON =
        "Governance allowlist is unreachable — refusing new selections until the proxy responds. Try System › Proxy › Reload.";

    const setBiVendor = useCallback<SettingsActions["setBiVendor"]>(
        (value) => {
            if (isAllowlistFailClosed(state)) {
                return { ok: false, reason: FAIL_CLOSED_REASON };
            }
            const allowlist = state.allowlist;
            if (!validateBiVendor(value, allowlist)) {
                return {
                    ok: false,
                    reason: `BI provider "${value}" is not in your organization's allowlist.`,
                };
            }
            persistAndBroadcast(KEY.biVendor, value);
            dispatch({ type: "set/biVendor", value });
            return { ok: true };
        },
        [state],
    );

    const setBiSurfaceMode = useCallback<SettingsActions["setBiSurfaceMode"]>((value) => {
        const normalized = normalizeBiSurfaceMode(value);
        persistAndBroadcast(KEY.biSurfaceMode, normalized);
        dispatch({ type: "set/biSurfaceMode", value: normalized });
    }, []);

    const setPackSelection = useCallback<SettingsActions["setPackSelection"]>(
        (value) => {
            if (isAllowlistFailClosed(state)) {
                return { ok: false, reason: FAIL_CLOSED_REASON };
            }
            const allowlist = state.allowlist;
            if (value && !validatePack(value, allowlist)) {
                return {
                    ok: false,
                    reason: `Pack "${value.pack}" is not in your organization's allowlist.`,
                };
            }
            if (value && value.pack) {
                persistAndBroadcast(KEY.packSelection, JSON.stringify(value));
            } else {
                removeAndBroadcast(KEY.packSelection);
            }
            dispatch({ type: "set/packSelection", value });
            return { ok: true };
        },
        [state],
    );

    // setUiMode action REMOVED 2026-05-25. The reducer case "set/uiMode"
    // remains for the display-change event listener (which dispatches the
    // action directly when a dev-tools localStorage write fires). No
    // component should call this action; if you need to flip uiMode at
    // dev time, write the storage key directly.

    const setEnabledComponents = useCallback<SettingsActions["setEnabledComponents"]>(
        (value) => {
            persistAndBroadcast(KEY.enabledComponents, value);
            if (value === "both" && typeof window !== "undefined") {
                try { window.localStorage.setItem(ENABLED_COMPONENTS_LEGACY_BOTH_MIGRATION_KEY, "true"); } catch { /* swallow */ }
            }
            dispatch({ type: "set/enabledComponents", value });
        },
        [],
    );

    const setLayoutMode = useCallback<SettingsActions["setLayoutMode"]>((value) => {
        persistAndBroadcast(KEY.layoutMode, value);
        dispatch({ type: "set/layoutMode", value });
    }, []);

    const setBiTileMode = useCallback<SettingsActions["setBiTileMode"]>((value) => {
        persistAndBroadcast(KEY.biTileMode, value);
        dispatch({ type: "set/biTileMode", value });
    }, []);

    const setDefaultLandingSurface = useCallback<SettingsActions["setDefaultLandingSurface"]>((value) => {
        // 2026-05-22 — author's preferred landing tab. null clears the
        // override so the app falls back to "ai-insights" (per Rajesh's
        // 2026-05-22 direction). When set, App.tsx readInitialActiveSurface
        // uses this in preference to the stored localStorage value.
        if (value === null) {
            removeAndBroadcast(KEY.defaultLandingSurface);
        } else {
            persistAndBroadcast(KEY.defaultLandingSurface, value);
        }
        dispatch({ type: "set/defaultLandingSurface", value: value ?? "" });
    }, []);

    const setActiveAiProfile = useCallback<SettingsActions["setActiveAiProfile"]>(
        (value) => {
            const trimmed = String(value || "").trim();
            if (trimmed && isAllowlistFailClosed(state)) {
                return { ok: false, reason: FAIL_CLOSED_REASON };
            }
            const allowlist = state.allowlist;
            if (trimmed && !validateAiProfile(trimmed, allowlist)) {
                return {
                    ok: false,
                    reason: `AI provider "${trimmed}" is not in your organization's allowlist.`,
                };
            }
            if (trimmed) {
                persistAndBroadcast(KEY.activeAiProfile, trimmed);
                // Picking a profile via Settings → AI → Provider is the proxy-
                // mediated path by definition (Settings only knows profile
                // *names* — the proxy resolves host / spaceId / warehouseId
                // server-side from proxy/config.json). Auto-populate the
                // minimum genieSettings fields Pulse's `isConfigured` check
                // expects so the AI Insights pane doesn't render its "Connect
                // to Databricks" empty state for a Settings-only setup flow.
                //
                // - assistantProfile: the picked profile name
                // - connectionMode:  "proxy" (was "auto" / unset by default)
                // - apiBaseUrl:      same-origin in dev (Vite proxies /api/*);
                //                    deployer should override in production
                writePulseAiVisualSettingsPatch({ assistantProfile: trimmed });
                // connectionMode + apiBaseUrl are not in the typed
                // PulseAiVisualSettings surface — they live in the wider
                // raw genieSettings JSON. Use the loose-typed helper so
                // they get persisted + broadcast on the same event.
                // apiBaseUrl needs the `/api` prefix because Vite's dev
                // server proxies `/api/*` → proxy (strips the `/api`). Pulse's
                // GenieClient.getBaseUrl() appends `/assistant` to whatever we
                // give it; without the `/api` prefix the request hits Vite
                // directly at `/assistant/*` and 404s. Browser smoke test
                // 2026-05-17 caught this — Pulse's auto-fire-on-mount POST
                // /assistant/home returned 404 because URL was
                // http://localhost:5173/assistant/home (no /api prefix).
                writeRawGenieSettingsPatch({
                    connectionMode: "proxy",
                    apiBaseUrl: typeof window !== "undefined" && window.location?.origin
                        ? `${window.location.origin}/api`
                        : "http://127.0.0.1:8787",
                });
            } else {
                removeAndBroadcast(KEY.activeAiProfile);
                writePulseAiVisualSettingsPatch({ assistantProfile: "" });
            }
            dispatch({ type: "set/activeAiProfile", value: trimmed });
            return { ok: true };
        },
        [state],
    );

    const value = useMemo<SettingsContextValue>(
        () => ({
            ...state,
            setBiVendor,
            setBiSurfaceMode,
            setPackSelection,
            setEnabledComponents,
            setLayoutMode,
            setBiTileMode,
            setActiveAiProfile,
            setDefaultLandingSurface,
            reloadAllowlist: reload,
        }),
        [
            state,
            setBiVendor,
            setBiSurfaceMode,
            setPackSelection,
            setEnabledComponents,
            setLayoutMode,
            setBiTileMode,
            setActiveAiProfile,
            setDefaultLandingSurface,
            reload,
        ],
    );

    return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
    const ctx = useContext(SettingsContext);
    if (!ctx) {
        throw new Error("useSettings must be called inside <SettingsProvider />");
    }
    return ctx;
}

/** Lower-level hook for components that need state only (no setters). */
export function useSettingsState(): SettingsState {
    const ctx = useSettings();
    return ctx;
}

// Re-export storage keys so external callers (tests, migration code) can
// reference them without re-declaring strings.
export const SETTINGS_KEYS = KEY;
