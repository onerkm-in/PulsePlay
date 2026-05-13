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
