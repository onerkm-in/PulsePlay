// playground/src/featureFlags.ts
//
// Part C foundation (2026-06-05) — author-selectable feature flags, persisted
// as a single localStorage bag (same shape as performanceLevers). The headline
// flag is `multiConnectorPanes`: when OFF (the default), PulsePlay is the
// single-active-per-axis app it has always been; when ON, the per-pane
// connector model + the multi-pane demo surface become reachable.
//
// DEFAULT OFF is load-bearing: the entire parallel-connectors foundation is
// gated on this flag, and the single-pane app path must stay byte-for-byte
// unchanged when it is off. Defensive readers tolerate malformed / missing
// values by falling back to the all-false defaults.

import { useEffect, useState } from "react";

export const FEATURE_FLAGS_KEY = "pulseplay:feature-flags";
export const FEATURE_FLAGS_EVENT = "pulseplay:feature-flags-change";

export interface FeatureFlags {
    /** When the Dashboard's native canvas is empty and a chart-capable connector
     *  is bound, auto-pin a few starter charts from the connected source
     *  (closes the "empty Dashboard" gap). DEFAULT FALSE since 2026-07-24
     *  (user directive): opening the Dashboard must not spend backend calls —
     *  the seed probe + starter queries run only when the author opts in.
     *  Tightly guarded even when ON: only the deterministic Power BI path,
     *  only when empty, once per profile. */
    dashboardAutoSeed: boolean;
}

/** The canonical defaults. `dashboardAutoSeed` is OFF so first Dashboard visits
 *  stay free of backend spend (explicit opt-in re-enables the starter charts). */
export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
    dashboardAutoSeed: false,
});

/** Coerce an unknown parsed value into a valid FeatureFlags. Every flag
 *  defaults false — only an explicit `true` enables it. (dashboardAutoSeed
 *  was missing-means-ON until 2026-07-24; the intent gate flipped it.) */
export function normalizeFeatureFlags(raw: unknown): FeatureFlags {
    const obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    return {
        dashboardAutoSeed: obj.dashboardAutoSeed === true,
    };
}

/** Read the persisted feature flags. Never throws — returns the all-false
 *  defaults if storage is unavailable or the value is malformed. */
export function loadFeatureFlags(): FeatureFlags {
    if (typeof window === "undefined") return { ...DEFAULT_FEATURE_FLAGS };
    try {
        const raw = window.localStorage.getItem(FEATURE_FLAGS_KEY);
        if (!raw) return { ...DEFAULT_FEATURE_FLAGS };
        return normalizeFeatureFlags(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_FEATURE_FLAGS };
    }
}

/** Convenience accessor for a single flag. */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
    return loadFeatureFlags()[flag] === true;
}

/** Persist a single flag and broadcast the change (same in-tab event channel
 *  the rest of the app uses). Returns the new full flag set. */
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean): FeatureFlags {
    const next: FeatureFlags = { ...loadFeatureFlags(), [flag]: value };
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(next));
            window.dispatchEvent(new CustomEvent(FEATURE_FLAGS_EVENT, { detail: next }));
        } catch { /* storage may be blocked — ignore */ }
    }
    return next;
}

/** Clear all flags back to defaults (owns its full key — used by Settings
 *  reset + tests). */
export function resetFeatureFlags(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(FEATURE_FLAGS_KEY);
        window.dispatchEvent(new CustomEvent(FEATURE_FLAGS_EVENT, { detail: { ...DEFAULT_FEATURE_FLAGS } }));
    } catch { /* ignore */ }
}

/** React hook — reactive read of a single feature flag. Re-renders when the
 *  flag changes in this tab (FEATURE_FLAGS_EVENT) or another tab (storage). */
export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
    const [value, setValue] = useState<boolean>(() => isFeatureEnabled(flag));
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setValue(isFeatureEnabled(flag));
        // Named handler so BOTH listeners get removed on cleanup. (The previous
        // version registered an anonymous "storage" listener that was never
        // removed → one orphaned listener leaked per mount/unmount cycle.)
        const onStorage = (e: StorageEvent) => { if (!e.key || e.key === FEATURE_FLAGS_KEY) sync(); };
        window.addEventListener(FEATURE_FLAGS_EVENT, sync as EventListener);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(FEATURE_FLAGS_EVENT, sync as EventListener);
            window.removeEventListener("storage", onStorage);
        };
    }, [flag]);
    return value;
}

