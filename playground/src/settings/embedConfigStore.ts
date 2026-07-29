// playground/src/settings/embedConfigStore.ts
//
// Phase A of the BI Live Controls (Settings IA fix #6) — own the
// `BIEmbedConfig` (Power BI report URL, embed mode, dataset id, etc.)
// in a small dedicated store so the Settings BI Embed leaf can render
// `<EmbedConfigForm>` as the canonical authoring surface.
//
// Why not extend `settingsStore.tsx`:
//   The main store is Codex's territory during the Allowlist
//   fail-closed P1 lane (2026-05-14). Keeping this module separate
//   avoids merge collisions while the lane is open. Phase B (Codex,
//   after Allowlist) wires App.tsx to read from this store so the
//   sidebar and the canvas pick up changes live.
//
// Persistence:
//   • localStorage key `pulseplay:bi-embed-config` (JSON-serialised).
//   • Window event `pulseplay:embed-config-change` carries the new
//     value so any subscriber (eventually App.tsx) can react.
//   • Same `storage` event browsers emit cross-tab is also honoured —
//     authoring in one tab updates the other tab's hook on next render.
//
// Read-only consumers should use `useEmbedConfig()` (returns the
// current value + actions). The hook subscribes to local + cross-tab
// changes automatically.

import { useEffect, useState, useCallback } from "react";
import type { BIEmbedConfig } from "../biPanel/BIAdapter";

const STORAGE_KEY = "pulseplay:bi-embed-config";
const CHANGE_EVENT = "pulseplay:embed-config-change";

/** In-memory cache so multiple hook instances in the same tab read
 *  consistent state without each one re-parsing JSON. */
let _memoryCache: BIEmbedConfig | null = null;
let _memoryInitialized = false;

function readFromStorage(): BIEmbedConfig {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        // Reject non-object payloads defensively — a previous version
        // might have written a different shape.
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed as BIEmbedConfig;
    } catch {
        return {};
    }
}

function writeToStorage(value: BIEmbedConfig): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* swallow */ }
}

function clearStorage(): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* swallow */ }
}

/** Return the current persisted embed config. Sync read; safe to call
 *  during render. */
export function getEmbedConfig(): BIEmbedConfig {
    if (!_memoryInitialized) {
        _memoryCache = readFromStorage();
        _memoryInitialized = true;
    }
    return _memoryCache || {};
}

/** Imperative setter — persists + broadcasts. Same shape App.tsx's
 *  local `setEmbedConfig` accepts so the migration to read-from-store
 *  in Phase B is a one-line swap. Passing `null` (or an empty object)
 *  clears the persisted value. */
export function setEmbedConfig(next: BIEmbedConfig | null): void {
    const normalized = (next && typeof next === "object" && !Array.isArray(next))
        ? (next as BIEmbedConfig)
        : {};
    const isEmpty = Object.keys(normalized).length === 0;
    _memoryCache = isEmpty ? {} : normalized;
    if (isEmpty) clearStorage();
    else writeToStorage(normalized);
    if (typeof window !== "undefined") {
        try {
            window.dispatchEvent(
                new CustomEvent(CHANGE_EVENT, { detail: { value: _memoryCache } }),
            );
        } catch { /* swallow */ }
    }
}

/** Reset the in-memory cache. Used by tests to start fresh. */
export function __resetEmbedConfigStore(): void {
    _memoryCache = null;
    _memoryInitialized = false;
}

/** Shape of the deployment-declared embed target, as surfaced by the proxy's
 *  profile metadata (`powerbiGroupId` / `powerbiReportId`). Both are routing
 *  ids that appear in any embed URL; the token granting access is still minted
 *  server-side. */
export interface DeploymentEmbedTarget {
    powerbiGroupId?: string;
    powerbiReportId?: string;
    powerbiDatasetId?: string;
    /** All-Databricks pair: a Lakeview dashboard declared by a Databricks
     *  profile. Rendered NATIVELY through the proxy (spec + datasets run
     *  server-side under the profile's token; the browser never holds one). */
    lakeviewDashboardId?: string;
    workspaceUrl?: string;
    /** The declaring profile's name — the native renderer needs it to route
     *  dataset execution through the right server-side profile. */
    name?: string;
}

/**
 * Seed the embed target from what the DEPLOYMENT declares, but only when this
 * browser has no configuration of its own.
 *
 * Why this exists: the embed target used to live exclusively in localStorage,
 * so it was set per browser, by hand, once. A browser configured months earlier
 * kept opening whatever report it was last pointed at even after the whole
 * stack was repointed - which is how a stale Superstore report survived a move
 * to the SCM star and quietly disagreed with every number the AI produced.
 *
 * Deliberately non-destructive: an existing config is never overwritten, so an
 * author who chose a different report keeps it. Returns true if it seeded.
 */
export function seedEmbedConfigFromDeployment(target: DeploymentEmbedTarget | null | undefined): boolean {
    if (!target?.powerbiReportId && !target?.lakeviewDashboardId) return false;
    const current = getEmbedConfig() as Record<string, unknown>;
    // A config THIS module seeded carries a marker. When the deployment
    // repoints (new dashboard/report declared), marker-bearing configs
    // re-seed — that's how every stale browser follows the deployment instead
    // of showing last month's dashboard forever. A config WITHOUT the marker
    // was authored by a person (Settings → BI) and is never overridden.
    const seededMarker = current?.__seededFromDeployment === true;
    if (current && Object.keys(current).length > 0) {
        if (!seededMarker) return false;
        const sameTarget = target.lakeviewDashboardId
            ? current.dashboardId === target.lakeviewDashboardId
            : current.id === target.powerbiReportId;
        if (sameTarget) return false;
        // marker + different declared target → fall through and re-seed
    }

    // All-Databricks pair first: a Lakeview declaration means the deployment
    // wants the Dashboard rendered natively from the same workspace the AI
    // answers from. assistantProfile + dashboardId is exactly what the
    // databricks-aibi adapter requires to pick its native path — without the
    // profile it silently falls back to an iframe embed that CSP blocks.
    if (target.lakeviewDashboardId) {
        const seeded: Record<string, unknown> = {
            dashboardId: target.lakeviewDashboardId,
            __seededFromDeployment: true,
        };
        if (target.workspaceUrl) seeded.workspaceUrl = target.workspaceUrl;
        if (target.name) seeded.assistantProfile = target.name;
        setEmbedConfig(seeded as BIEmbedConfig);
        seedBiVendor("databricks-aibi");
        return true;
    }

    // Field names follow PowerBIEmbedConfig: `id` is the REPORT id, not
    // `reportId` (bi-adapters/powerbi/index.ts). Only the target is seeded -
    // embedUrl and accessToken still come from the server-side token mint, so
    // no credential is ever written to storage here.
    const seeded: Record<string, unknown> = { id: target.powerbiReportId, __seededFromDeployment: true };
    if (target.powerbiGroupId) seeded.groupId = target.powerbiGroupId;
    if (target.powerbiDatasetId) seeded.datasetId = target.powerbiDatasetId;
    setEmbedConfig(seeded as BIEmbedConfig);
    return true;
}

/** Seed the BI vendor to match a seeded embed target — same non-destructive
 *  rule: only when this browser has not picked a vendor of its own. */
function seedBiVendor(vendor: string): void {
    if (typeof window === "undefined") return;
    try {
        if (window.localStorage.getItem("pulseplay:bi-vendor")) return;
        window.localStorage.setItem("pulseplay:bi-vendor", vendor);
        window.dispatchEvent(new CustomEvent("pulseplay:bi-vendor-change", { detail: { vendor } }));
    } catch { /* swallow */ }
}

/** React hook — returns the current embed config + a stable setter +
 *  a clear helper. Subscribes to same-tab events AND cross-tab
 *  storage events so authoring in one Settings tab updates the
 *  playground in another. */
export function useEmbedConfig(): {
    embedConfig: BIEmbedConfig;
    setEmbedConfig: (next: BIEmbedConfig | null) => void;
    clearEmbedConfig: () => void;
} {
    const [value, setValue] = useState<BIEmbedConfig>(() => getEmbedConfig());

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = () => setValue(getEmbedConfig());
        const storageHandler = (e: StorageEvent) => {
            if (e.key !== STORAGE_KEY) return;
            _memoryCache = null;
            _memoryInitialized = false;
            setValue(getEmbedConfig());
        };
        window.addEventListener(CHANGE_EVENT, handler as EventListener);
        window.addEventListener("storage", storageHandler);
        return () => {
            window.removeEventListener(CHANGE_EVENT, handler as EventListener);
            window.removeEventListener("storage", storageHandler);
        };
    }, []);

    const set = useCallback((next: BIEmbedConfig | null) => {
        setEmbedConfig(next);
    }, []);

    const clear = useCallback(() => {
        setEmbedConfig(null);
    }, []);

    return { embedConfig: value, setEmbedConfig: set, clearEmbedConfig: clear };
}

/** Storage key + event name re-exported for tests + future App.tsx
 *  wiring. Keeping the strings in one place prevents drift when Codex
 *  picks up Phase B. */
export const EMBED_CONFIG_STORAGE_KEY = STORAGE_KEY;
export const EMBED_CONFIG_CHANGE_EVENT = CHANGE_EVENT;
