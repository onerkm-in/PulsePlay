// The Settings canonical state surface. Owns reads + writes for the
// `pulseplay:*` localStorage keys the Settings page surfaces, and
// re-validates every persisted value against the live allowlist on load
// (XSS-persisted orphan values can't become silent selections).
//
// Legacy paths (App.tsx) still write some keys directly. The store mirrors
// those via the `pulseplay:display-change` window event AND its own setters
// dispatch the same event, so store and legacy paths stay in sync.
//
// The broader `pulseplay:visual-settings:*` namespace is bridged by
// `pulseVisualSettingsStore.ts`; this store only mirrors the active AI
// profile into Pulse's `genieSettings.assistantProfile` so the provider
// picker and Pulse runtime don't drift.

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

// ─── Storage keys (keep in sync with App.tsx) ────────────────────────────

const KEY = {
    biVendor: "pulseplay:bi-vendor",
    biSurfaceMode: BI_SURFACE_MODE_STORAGE_KEY,
    packSelection: "pulseplay:pack-selection",
    uiMode: "pulseplay:ui-mode",
    enabledComponents: "pulseplay:enabled-components",
    layoutMode: "pulseplay:layout-mode",
    biTileMode: "pulseplay:bi-tile-mode",
    activeAiProfile: "pulseplay:active-ai-profile",
    // Author-configurable default landing tab. See App.tsx
    // readInitialActiveSurface for the priority order.
    defaultLandingSurface: "pulseplay:default-landing-surface",
    // Per-tab-visibility model: ONE canonical layout (PulseShell 3-tab
    // strip). Per-tab booleans are the primary author control; the legacy
    // enabledComponents/layoutMode enums stay as reducer state for
    // backward-compat with stored values.
    tabVisibility: "pulseplay:tab-visibility",
    // Multi-page parallel storage. Coexists with `pulseplay:tab-visibility`
    // during the migration window so older sessions/exports keep working.
    pages: "pulseplay:pages",
    // Persisted pane registry so floating panes survive reload at their
    // last positions.
    paneRegistry: "pulseplay:pane-registry",
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

// Resolver import lives at the top of the readUiMode body's call site
// rather than at file head to keep the dependency direction explicit:
// settingsStore exports DEFAULT_UI_MODE + readTabVisibility; the
// featureRegistry imports from settingsStore; settingsStore re-imports
// resolveDefaultSurface from featureRegistry. The cycle is one-shot at
// boot (resolveDefaultSurface is pure), so node/vite resolve it cleanly.
// eslint-disable-next-line @typescript-eslint/no-use-before-define
import { resolveDefaultSurface } from "../featureRegistry/resolver";

/**
 * Single source of truth for the cold-boot default surface. Imported by
 * App.tsx readInitialUiMode(), settingsStore readUiMode(), and the wizard's
 * persona presets — instead of each site hardcoding the same string.
 * "pulse" (Workbench) is the intentional default; "v0" (Chat) is opt-in.
 * Dev escape hatch: `localStorage.setItem("pulseplay:ui-mode", "v0"|"pulse")`.
 */
export const DEFAULT_UI_MODE: UiMode = "pulse";

/**
 * Per-tab visibility booleans. Each flag controls whether the tab button
 * renders in the PulseShell tab strip AND whether the tab body is reachable.
 * Disabling tabs is how authors ship "X only" deployments. Auto-collapse:
 * when only one tab is enabled, the tab strip is hidden and that tab
 * becomes the main page.
 */
export interface TabVisibility {
    aiInsights: boolean;
    askPulse: boolean;
    dashboard: boolean;
}

export const DEFAULT_TAB_VISIBILITY: Readonly<TabVisibility> = {
    aiInsights: true,
    askPulse: true,
    dashboard: true,
};

/** Count of currently-enabled tabs. Used for auto-collapse logic. */
export function enabledTabCount(v: TabVisibility): number {
    return (v.aiInsights ? 1 : 0) + (v.askPulse ? 1 : 0) + (v.dashboard ? 1 : 0);
}

/**
 * Multi-page model. Page is a typed instance of one of the 3 surface kinds;
 * today the app caps at 3 pages (one per type). Storage: `pulseplay:pages`
 * JSON — on read, if missing, derive from `pulseplay:tab-visibility` so
 * existing users migrate transparently. `tabVisibility` stays the canonical
 * render gate — Page is parallel storage.
 */
export type PageType = "ai-insights" | "ask-pulse" | "dashboard";

export interface Page {
    /** Stable identifier — surface routing + future detach paneId roots. */
    id: string;
    /** Page type drives which surface component mounts inside. */
    type: PageType;
    /** Display name in tab strip + Settings list. */
    title: string;
    /** Per-page config (AI profile / BI vendor / embed config). Empty
     *  today — every page inherits the App-wide defaults. */
    config?: Record<string, unknown>;
}

/** Canonical page titles per type — used for default titles + auto-id. */
export const DEFAULT_PAGE_TITLE: Readonly<Record<PageType, string>> = {
    "ai-insights": "AI Insights",
    "ask-pulse":   "Ask Pulse",
    "dashboard":   "Dashboard",
};

/** Default pages list — one per type, mirrors DEFAULT_TAB_VISIBILITY
 *  (all enabled). When pages-storage is missing this is the fallback. */
export const DEFAULT_PAGES: ReadonlyArray<Page> = [
    { id: "page-ai-insights", type: "ai-insights", title: DEFAULT_PAGE_TITLE["ai-insights"] },
    { id: "page-ask-pulse",   type: "ask-pulse",   title: DEFAULT_PAGE_TITLE["ask-pulse"] },
    { id: "page-dashboard",   type: "dashboard",   title: DEFAULT_PAGE_TITLE["dashboard"] },
];

/** Derive Page[] from a TabVisibility shape — used for the one-time
 *  migration from pre-P1 storage. Order is canonical (insights first). */
export function pagesFromTabVisibility(v: TabVisibility): Page[] {
    const out: Page[] = [];
    if (v.aiInsights) out.push({ id: "page-ai-insights", type: "ai-insights", title: DEFAULT_PAGE_TITLE["ai-insights"] });
    if (v.askPulse)   out.push({ id: "page-ask-pulse",   type: "ask-pulse",   title: DEFAULT_PAGE_TITLE["ask-pulse"] });
    if (v.dashboard)  out.push({ id: "page-dashboard",   type: "dashboard",   title: DEFAULT_PAGE_TITLE["dashboard"] });
    return out.length > 0 ? out : [...DEFAULT_PAGES];
}

/** Derive TabVisibility from a Page[] — used by consumers that still
 *  read the legacy shape during the parallel-storage migration window. */
export function tabVisibilityFromPages(pages: ReadonlyArray<Page>): TabVisibility {
    return {
        aiInsights: pages.some(p => p.type === "ai-insights"),
        askPulse:   pages.some(p => p.type === "ask-pulse"),
        dashboard:  pages.some(p => p.type === "dashboard"),
    };
}

/**
 * A PaneInstance is an INDIVIDUAL mounted copy of a Page's content — a
 * single Page can have N instances simultaneously (in-tab + floating
 * copies), each keyed by a distinct paneId.
 *
 * Per-pane state isolation is REQUIRED — each PaneInstance carries its own
 * conversation history, scroll position, composer draft, and (for Power BI
 * specifically per the existing tripwire) its own fresh embed token.
 */
export type PanePlacement = "inline" | "floating" | "minimized";

export interface PaneInstance {
    /** Unique identifier — drives per-pane state lookups. Format:
     *  `pane-${pageId}-${monotonicCounter}`. */
    paneId: string;
    /** The Page this instance is rendering. References a Page.id from
     *  the SettingsState.pages list. */
    pageId: string;
    /** Where this pane is currently rendered. */
    placement: PanePlacement;
    /** For floating panes: position in viewport. Persisted so floats
     *  survive reload at the same coordinates. Inline + minimized
     *  panes ignore this field. */
    position?: { x: number; y: number };
    /** Floating panes only: size override. */
    size?: { width: number; height: number };
    /** Creation timestamp (ms epoch). Used for paneId disambiguation
     *  when the same page is mounted multiple times. */
    createdAt: number;
    // Per-pane connector binding — OPTIONAL by design: an unbound pane
    // inherits the single active-per-axis globals (activeVendor /
    // activeConnector / embedConfig). When `multiConnectorPanes` is ON, a
    // pane MAY carry its own binding. Absent ⇒ the pane projects the legacy
    // globals (full backward-compat; paneConnectors.ts enforces this).
    /** Y-axis: which BI vendor this pane hosts (e.g. "powerbi", "native"). */
    vendor?: string;
    /** X-axis: which AI profile/connector this pane's assistant talks to. */
    aiProfile?: string;
    /** This pane's BI embed target. Untyped here (Record) to avoid a
     *  settingsStore→biPanel type import; paneConnectors.ts narrows it. */
    embedConfig?: Record<string, unknown>;
}

/** Default pane registry — for each default Page, one inline pane
 *  instance. Mirrors today's "one render per tab" behavior. */
export const DEFAULT_PANE_REGISTRY: ReadonlyArray<PaneInstance> = DEFAULT_PAGES.map((p, i) => ({
    paneId: `pane-${p.id}-0`,
    pageId: p.id,
    placement: "inline" as const,
    createdAt: 0, // 0 sentinel = "default registry, not a runtime mount"
}));

/** Derive the legacy "one pane per page" registry from a Page[]. */
export function paneRegistryFromPages(pages: ReadonlyArray<Page>): PaneInstance[] {
    return pages.map(p => ({
        paneId: `pane-${p.id}-0`,
        pageId: p.id,
        placement: "inline" as const,
        createdAt: 0,
    }));
}

/** Count of inline pane instances per pageId (same-tab multi-mount
 *  detection; today always 0 or 1). */
export function inlinePaneCountByPage(registry: ReadonlyArray<PaneInstance>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of registry) {
        if (p.placement === "inline") counts[p.pageId] = (counts[p.pageId] ?? 0) + 1;
    }
    return counts;
}
/**
 * Pane composition mode (set by the AUTHOR in Settings → Preferences → Visible
 * panels). End users see only what the author wired:
 *   - aiOnly : AI pane only (no BI canvas)
 *   - biOnly : BI pane only (no AI surface)
 *   - both   : explicit split-pane, AI + BI side by side
 *   - mix    : default unified surface mode — AI surfaces own the main
 *              surface; BI is a peer action, not a permanent section.
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
    /** Currently-active AI profile name (one of `allowlist.aiProfiles`).
     *  Persisted to `pulseplay:active-ai-profile`. Pulse mode also maintains
     *  its own `genieSettings.assistantProfile`; the store reads that on load
     *  if `active-ai-profile` is unset so an existing selection survives. */
    activeAiProfile: string;
    /** Author-configurable default landing tab. When null, the app falls
     *  back to "ai-insights". App.tsx readInitialActiveSurface prefers this
     *  over the stored localStorage value. */
    defaultLandingSurface: DefaultLandingSurface | null;
    /** Per-tab visibility flags — the single canonical control for which of
     *  the 3 tabs render in the PulseShell tab strip. The legacy enums stay
     *  in state for backward-compat with stored values. */
    tabVisibility: TabVisibility;
    /** Multi-page parallel storage — a derived projection of tabVisibility
     *  (1 page per enabled tab type). Setters that mutate one mutate both —
     *  they MUST stay in lockstep during the migration window. */
    pages: Page[];
    /** Persisted pane registry — auto-derived from pages (1 inline pane per
     *  page). */
    paneRegistry: PaneInstance[];
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
    // Delegates to the feature-registry resolver. Mirrors
    // App.tsx readInitialUiMode() — both readers MUST stay in lockstep
    // or the cold-boot surface flickers as one resolver hits before the
    // other.
    if (typeof window === "undefined") return DEFAULT_UI_MODE;
    let explicit: "pulse" | "v0" | null = null;
    try {
        const v = window.localStorage.getItem(KEY.uiMode);
        if (v === "v0" || v === "pulse") explicit = v;
    } catch { /* swallow */ }
    const resolved = resolveDefaultSurface({
        explicitUiMode: explicit,
        requiredFeatures: [],
        tabVisibility: readTabVisibility(),
    });
    // Resolver can return "dashboard", but the uiMode field only holds
    // "pulse" | "v0". Map dashboard → DEFAULT_UI_MODE for the legacy field;
    // the dashboard tab is selected via tabVisibility + per-tab routing.
    return resolved === "dashboard" ? DEFAULT_UI_MODE : resolved;
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
        // genieSettings. Read that so a returning Pulse user doesn't lose
        // their selection.
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

/** Exported so App.tsx readInitialUiMode() can feed the same tab-visibility
 *  snapshot into the feature-registry resolver. Pure read from localStorage —
 *  no side effects, safe at boot. */
export function readTabVisibility(): TabVisibility {
    if (typeof window === "undefined") return { ...DEFAULT_TAB_VISIBILITY };
    try {
        const raw = window.localStorage.getItem(KEY.tabVisibility);
        if (!raw) return { ...DEFAULT_TAB_VISIBILITY };
        const parsed = JSON.parse(raw) as Partial<TabVisibility>;
        if (parsed && typeof parsed === "object") {
            // Coerce each field defensively — refuse to leave the user with
            // ZERO enabled tabs (would render an empty shell with no
            // affordance to recover).
            const next: TabVisibility = {
                aiInsights: typeof parsed.aiInsights === "boolean" ? parsed.aiInsights : true,
                askPulse:   typeof parsed.askPulse   === "boolean" ? parsed.askPulse   : true,
                dashboard:  typeof parsed.dashboard  === "boolean" ? parsed.dashboard  : true,
            };
            if (enabledTabCount(next) === 0) return { ...DEFAULT_TAB_VISIBILITY };
            return next;
        }
    } catch { /* swallow */ }
    return { ...DEFAULT_TAB_VISIBILITY };
}

function readPaneRegistry(pagesFallback: ReadonlyArray<Page>): PaneInstance[] {
    // Prefers persisted pulseplay:pane-registry; falls back to deriving from
    // pages (1 inline pane per page) so older sessions transparently work.
    // Strict validation drops malformed entries and entries referencing
    // unknown pageIds.
    if (typeof window === "undefined") return paneRegistryFromPages(pagesFallback);
    try {
        const raw = window.localStorage.getItem(KEY.paneRegistry);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const validPlacements: PanePlacement[] = ["inline", "floating", "minimized"];
                const knownPageIds = new Set(pagesFallback.map(p => p.id));
                const out: PaneInstance[] = parsed
                    .filter((p: unknown): p is { paneId: string; pageId: string; placement: string; createdAt: number } => {
                        return !!p && typeof p === "object"
                            && typeof (p as { paneId?: unknown }).paneId === "string"
                            && typeof (p as { pageId?: unknown }).pageId === "string"
                            && validPlacements.includes((p as { placement?: string }).placement as PanePlacement)
                            && typeof (p as { createdAt?: unknown }).createdAt === "number"
                            && knownPageIds.has((p as { pageId: string }).pageId);
                    })
                    .map((p) => ({
                        paneId: p.paneId,
                        pageId: p.pageId,
                        placement: p.placement as PanePlacement,
                        createdAt: p.createdAt,
                        position: typeof (p as { position?: unknown }).position === "object" ? (p as { position?: { x: number; y: number } }).position : undefined,
                        size:     typeof (p as { size?: unknown }).size === "object" ? (p as { size?: { width: number; height: number } }).size : undefined,
                    }));
                if (out.length > 0) return out;
            }
        }
    } catch { /* swallow */ }
    return paneRegistryFromPages(pagesFallback);
}

function readPages(tabVisibilityFallback: TabVisibility): Page[] {
    // Prefers the pulseplay:pages key when present; falls back to deriving
    // from tabVisibility so older sessions transparently migrate. Returns a
    // defensive copy so callers can't accidentally mutate state.
    if (typeof window === "undefined") return pagesFromTabVisibility(tabVisibilityFallback);
    try {
        const raw = window.localStorage.getItem(KEY.pages);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // Validate each entry — strict shape check + drop unknowns.
                const validTypes: Page["type"][] = ["ai-insights", "ask-pulse", "dashboard"];
                const pages: Page[] = parsed
                    .filter((p: unknown): p is { id: string; type: string; title?: string } => {
                        return !!p && typeof p === "object"
                            && typeof (p as { id?: unknown }).id === "string"
                            && validTypes.includes((p as { type?: string }).type as Page["type"]);
                    })
                    .map((p) => ({
                        id: p.id,
                        type: p.type as Page["type"],
                        title: typeof p.title === "string" && p.title.trim() ? p.title : DEFAULT_PAGE_TITLE[p.type as Page["type"]],
                    }));
                if (pages.length > 0) return pages;
            }
        }
    } catch { /* swallow */ }
    return pagesFromTabVisibility(tabVisibilityFallback);
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
    const tabVisibility = readTabVisibility();
    const pages = readPages(tabVisibility);
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
        tabVisibility,
        pages,
        paneRegistry: readPaneRegistry(pages),
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
    | { type: "set/tabVisibility"; value: TabVisibility }
    | { type: "set/pages"; value: Page[] }
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
            // Fail-closed: do NOT blow away a previously-loaded allowlist on
            // a refresh failure — keep the last-known-good value so the user
            // keeps validated access until governance comes back. On FIRST
            // load with nothing known-good, allowlist stays null and
            // validators flip to fail-closed via `isAllowlistFailClosed`.
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
        case "set/tabVisibility": {
            // Defensive: never let the user end up with 0 enabled tabs.
            // If they try, fall back to the prior state's value.
            if (enabledTabCount(action.value) === 0) return state;
            // Keep pages in lockstep with tabVisibility: existing pages of
            // still-enabled types keep their identity; newly-enabled types
            // are added; disabled types are dropped.
            const next: TabVisibility = action.value;
            const keepByType: Partial<Record<PageType, Page>> = {};
            for (const p of state.pages) keepByType[p.type] = p;
            const projected: Page[] = [];
            if (next.aiInsights) projected.push(keepByType["ai-insights"] ?? { id: "page-ai-insights", type: "ai-insights", title: DEFAULT_PAGE_TITLE["ai-insights"] });
            if (next.askPulse)   projected.push(keepByType["ask-pulse"]   ?? { id: "page-ask-pulse",   type: "ask-pulse",   title: DEFAULT_PAGE_TITLE["ask-pulse"] });
            if (next.dashboard)  projected.push(keepByType["dashboard"]   ?? { id: "page-dashboard",   type: "dashboard",   title: DEFAULT_PAGE_TITLE["dashboard"] });
            return { ...state, tabVisibility: next, pages: projected };
        }
        case "set/pages": {
            // Defensive: never let the user end up with 0 pages.
            if (action.value.length === 0) return state;
            // Keep tabVisibility in lockstep with pages (the derived
            // projection consumers still read).
            return { ...state, pages: action.value, tabVisibility: tabVisibilityFromPages(action.value) };
        }
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
        case KEY.tabVisibility: {
            try {
                const parsed = JSON.parse(value) as Partial<TabVisibility>;
                if (parsed && typeof parsed === "object") {
                    const next: TabVisibility = {
                        aiInsights: typeof parsed.aiInsights === "boolean" ? parsed.aiInsights : true,
                        askPulse:   typeof parsed.askPulse   === "boolean" ? parsed.askPulse   : true,
                        dashboard:  typeof parsed.dashboard  === "boolean" ? parsed.dashboard  : true,
                    };
                    if (enabledTabCount(next) === 0) return state;
                    // Mirror the lockstep update from set/tabVisibility.
                    return { ...state, tabVisibility: next, pages: pagesFromTabVisibility(next) };
                }
            } catch { /* swallow */ }
            return state;
        }
        case KEY.pages: {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const validTypes: PageType[] = ["ai-insights", "ask-pulse", "dashboard"];
                    const pages: Page[] = parsed
                        .filter((p: unknown): p is { id: string; type: string; title?: string } => {
                            return !!p && typeof p === "object"
                                && typeof (p as { id?: unknown }).id === "string"
                                && validTypes.includes((p as { type?: string }).type as PageType);
                        })
                        .map((p) => ({
                            id: p.id,
                            type: p.type as PageType,
                            title: typeof p.title === "string" && p.title.trim() ? p.title : DEFAULT_PAGE_TITLE[p.type as PageType],
                        }));
                    if (pages.length > 0) {
                        return { ...state, pages, tabVisibility: tabVisibilityFromPages(pages) };
                    }
                }
            } catch { /* swallow */ }
            return state;
        }
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
    // No setUiMode by design — uiMode is not user-editable; dev-tools
    // localStorage is the only escape hatch. The reducer case "set/uiMode"
    // remains so the display-change listener can sync mid-session.
    setEnabledComponents: (value: EnabledComponents) => void;
    setLayoutMode: (value: LayoutMode) => void;
    setBiTileMode: (value: BiTileMode) => void;
    setActiveAiProfile: (value: string) => { ok: boolean; reason?: string };
    /** Set the author's preferred landing tab. Pass null to clear the
     *  override (app falls back to "ai-insights"). */
    setDefaultLandingSurface: (value: DefaultLandingSurface | null) => void;
    /** Set per-tab visibility. Defensive: refuses to leave the user with 0
     *  enabled tabs (no-ops in that case). */
    setTabVisibility: (value: TabVisibility) => void;
    /** Set the canonical pages list. Defensive: refuses to leave the user
     *  with 0 pages. Today the list caps at 3 (one per type). */
    setPages: (value: Page[]) => void;
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

// In-flight dedup. The SettingsProvider fetches the allowlist on mount, and
// React StrictMode double-invokes effects in dev — which fired the allowlist
// GET two+ times in a burst on load. Concurrent callers now share one
// in-flight request. We deliberately do NOT cache the resolved value, so a
// later reloadAllowlist() still forces a fresh fetch (the fail-closed
// governance refresh must never be served stale).
let _allowlistInflight: Promise<PulsePlayAllowlist> | null = null;

async function defaultFetchAllowlist(): Promise<PulsePlayAllowlist> {
    if (_allowlistInflight) return _allowlistInflight;
    _allowlistInflight = (async () => {
        const res = await fetch("/api/assistant/allowlist");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PulsePlayAllowlist;
    })();
    try {
        return await _allowlistInflight;
    } finally {
        _allowlistInflight = null;
    }
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

    // Listen for `pulseplay:display-change` events so the store stays in
    // sync when legacy paths write directly.
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

    // No setUiMode action by design — no component should set uiMode; flip
    // it at dev time by writing the storage key directly (the display-change
    // listener dispatches "set/uiMode" when that fires).

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

    const setTabVisibility = useCallback<SettingsActions["setTabVisibility"]>((value) => {
        if (enabledTabCount(value) === 0) return; // refuse: zero-tab state is unrecoverable from the UI
        persistAndBroadcast(KEY.tabVisibility, JSON.stringify(value));
        // Also persist the lockstep pages projection. Project from the
        // booleans rather than reading state.pages — the closure value is
        // stale before dispatch.
        const projectedPages = pagesFromTabVisibility(value);
        persistAndBroadcast(KEY.pages, JSON.stringify(projectedPages));
        dispatch({ type: "set/tabVisibility", value });
    }, []);

    const setPages = useCallback<SettingsActions["setPages"]>((value) => {
        if (value.length === 0) return; // refuse: zero-pages state is unrecoverable
        persistAndBroadcast(KEY.pages, JSON.stringify(value));
        // Lockstep — also write the derived tabVisibility so legacy
        // consumers (visual.tsx tab strip) keep working.
        const projectedVisibility = tabVisibilityFromPages(value);
        persistAndBroadcast(KEY.tabVisibility, JSON.stringify(projectedVisibility));
        dispatch({ type: "set/pages", value });
    }, []);

    const setDefaultLandingSurface = useCallback<SettingsActions["setDefaultLandingSurface"]>((value) => {
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
                // Settings only knows profile *names* — the proxy resolves
                // host / spaceId / warehouseId server-side. Auto-populate the
                // minimum genieSettings fields Pulse's `isConfigured` check
                // expects so AI Insights doesn't render its "Connect to
                // Databricks" empty state for a Settings-only setup flow.
                writePulseAiVisualSettingsPatch({ assistantProfile: trimmed });
                // connectionMode + apiBaseUrl live in the raw genieSettings
                // JSON (not the typed PulseAiVisualSettings surface) — use the
                // loose-typed helper. apiBaseUrl needs the `/api` prefix:
                // Vite proxies `/api/*` → proxy (strips `/api`) and Pulse's
                // GenieClient appends `/assistant`; without `/api` the request
                // hits Vite directly at `/assistant/*` and 404s.
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
            setTabVisibility,
            setPages,
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
            setTabVisibility,
            setPages,
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
