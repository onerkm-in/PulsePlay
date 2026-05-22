// playground/src/settings/performanceLevers.ts
//
// Author-selectable latency levers — a small set of knobs that trade
// completeness for time-to-first-byte. Shipped as the headline of the
// 2026-05-20 perf cycle; persisted under a single localStorage key so
// the next session restores them and other surfaces (App.tsx prewarm,
// Pulse staged reveal, genie request builder) can read them via the
// `loadPerformanceLevers()` accessor.
//
// Why one bag instead of one key per lever?
// - One JSON blob = one place to inspect, one place to reset, one event
//   broadcast on save. The orphan-detection pass in AdvancedGroup
//   surfaces the whole bag as a single row instead of 4-6 unrelated keys.
// - All levers move together. There's no scenario where a deployer would
//   change cadence without considering retries.
//
// Defensive: every reader tolerates malformed / missing values by falling
// back to the spec defaults. The Settings UI is the authority for valid
// inputs; the runtime trusts the defaults if anything goes wrong.

export const PERFORMANCE_LEVERS_KEY = "pulseplay:performance-levers";
export const PERFORMANCE_LEVERS_EVENT = "pulseplay:performance-levers-change";

/** Reveal cadence preset — how aggressively to stagger section reveal.
 *  - "instant"  : no staged reveal; all sections paint together.
 *  - "fast"     : t=0 HEADLINE; t=4s rest of body — quick perceived response.
 *  - "balanced" : default; t=0 HEADLINE, t=10s KPI+TRENDS, t=20s RISKS+ACTIONS, t=30s OPPORTUNITIES.
 *  - "full"     : slow, "every section gets its own beat" — t=0/8/16/24/32. */
export type RevealCadence = "instant" | "fast" | "balanced" | "full";

export interface PerformanceLevers {
    /** Reveal cadence preset. Default: "balanced". */
    revealCadence: RevealCadence;
    /** When false, App.tsx skips the screen-load discovery prewarm (the cached
     *  snapshot used by Pulse genie.ts). Subsequent queries still benefit if
     *  AISidebar populates the cache directly. Default: true. */
    discoveryPrewarmEnabled: boolean;
    /** How long an Insights answer is considered fresh before re-running.
     *  Minutes. Range 1..180. Default 30. Mirrors PulseAiVisualSettings
     *  `insightsCacheTtlMinutes`; this lever is the canonical surface and
     *  Settings writes both for backward compatibility. */
    insightsCacheTtlMinutes: number;
    /** Per-section validation retry budget on the proxy side. 0 means "never
     *  retry; ship whatever the LLM produced on the first pass" (fastest, may
     *  ship more shaky sections). 3 means "retry up to 3 times when the
     *  validator flags a section as Suggestion/Blocked" (slowest, highest
     *  quality). Default: 1. Client forwards as `maxValidationRetries`; proxy
     *  caps its retry loop at min(server-default, client-supplied). */
    maxValidationRetries: number;
}

export const PERFORMANCE_LEVERS_DEFAULTS: Readonly<PerformanceLevers> = Object.freeze({
    revealCadence: "balanced",
    discoveryPrewarmEnabled: true,
    insightsCacheTtlMinutes: 30,
    maxValidationRetries: 1,
});

const RETRY_MIN = 0;
const RETRY_MAX = 3;
const TTL_MIN = 1;
const TTL_MAX = 180;
const CADENCES: ReadonlyArray<RevealCadence> = ["instant", "fast", "balanced", "full"];

/** Synchronous read of the persisted levers, with defaults applied per-field. */
export function loadPerformanceLevers(): PerformanceLevers {
    if (typeof window === "undefined") return { ...PERFORMANCE_LEVERS_DEFAULTS };
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(PERFORMANCE_LEVERS_KEY); } catch { /* ignore */ }
    if (!raw) return { ...PERFORMANCE_LEVERS_DEFAULTS };
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { return { ...PERFORMANCE_LEVERS_DEFAULTS }; }
    if (!parsed || typeof parsed !== "object") return { ...PERFORMANCE_LEVERS_DEFAULTS };
    const o = parsed as Record<string, unknown>;
    return {
        revealCadence: coerceCadence(o.revealCadence),
        discoveryPrewarmEnabled: typeof o.discoveryPrewarmEnabled === "boolean"
            ? o.discoveryPrewarmEnabled
            : PERFORMANCE_LEVERS_DEFAULTS.discoveryPrewarmEnabled,
        insightsCacheTtlMinutes: coerceClampedInt(
            o.insightsCacheTtlMinutes,
            TTL_MIN, TTL_MAX,
            PERFORMANCE_LEVERS_DEFAULTS.insightsCacheTtlMinutes,
        ),
        maxValidationRetries: coerceClampedInt(
            o.maxValidationRetries,
            RETRY_MIN, RETRY_MAX,
            PERFORMANCE_LEVERS_DEFAULTS.maxValidationRetries,
        ),
    };
}

/** Persist a partial patch on top of the current levers + broadcast. */
export function savePerformanceLevers(patch: Partial<PerformanceLevers>): PerformanceLevers {
    const next: PerformanceLevers = { ...loadPerformanceLevers(), ...patch };
    // Re-normalize through the coercers so a bad patch can't poison the store.
    const safe: PerformanceLevers = {
        revealCadence: coerceCadence(next.revealCadence),
        discoveryPrewarmEnabled: !!next.discoveryPrewarmEnabled,
        insightsCacheTtlMinutes: coerceClampedInt(
            next.insightsCacheTtlMinutes, TTL_MIN, TTL_MAX,
            PERFORMANCE_LEVERS_DEFAULTS.insightsCacheTtlMinutes,
        ),
        maxValidationRetries: coerceClampedInt(
            next.maxValidationRetries, RETRY_MIN, RETRY_MAX,
            PERFORMANCE_LEVERS_DEFAULTS.maxValidationRetries,
        ),
    };
    if (typeof window !== "undefined") {
        try { window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify(safe)); }
        catch { /* quota, private mode, etc — non-fatal */ }
        try {
            window.dispatchEvent(new CustomEvent(PERFORMANCE_LEVERS_EVENT, { detail: safe }));
            // Also dispatch the generic display-change event so settingsStore
            // listeners can react if needed.
            window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                detail: { key: PERFORMANCE_LEVERS_KEY, value: JSON.stringify(safe) },
            }));
        } catch { /* ignore */ }
    }
    return safe;
}

/** Clear back to defaults + broadcast. */
export function resetPerformanceLevers(): PerformanceLevers {
    if (typeof window !== "undefined") {
        try { window.localStorage.removeItem(PERFORMANCE_LEVERS_KEY); } catch { /* ignore */ }
        try {
            window.dispatchEvent(new CustomEvent(PERFORMANCE_LEVERS_EVENT, {
                detail: { ...PERFORMANCE_LEVERS_DEFAULTS },
            }));
        } catch { /* ignore */ }
    }
    return { ...PERFORMANCE_LEVERS_DEFAULTS };
}

/** Bounds re-exported for the UI sliders + tests. */
export const PERFORMANCE_LEVERS_BOUNDS = Object.freeze({
    insightsCacheTtlMinutes: { min: TTL_MIN, max: TTL_MAX },
    maxValidationRetries: { min: RETRY_MIN, max: RETRY_MAX },
    revealCadence: CADENCES,
});

function coerceCadence(value: unknown): RevealCadence {
    if (typeof value === "string" && (CADENCES as ReadonlyArray<string>).includes(value)) {
        return value as RevealCadence;
    }
    return PERFORMANCE_LEVERS_DEFAULTS.revealCadence;
}

function coerceClampedInt(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const i = Math.round(value);
    if (i < min) return min;
    if (i > max) return max;
    return i;
}
