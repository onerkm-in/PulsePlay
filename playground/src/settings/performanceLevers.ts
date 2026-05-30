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
 *  Drives BOTH frontend reveal animation AND backend batching strategy
 *  (single-source preset, wired via getBackendStagingFromCadence below).
 *  - "instant"  : no staged reveal; all sections paint together; backend = single-shot bundle.
 *  - "fast"     : t=0 first section; rest in batches of 3 with 3s delay.
 *  - "balanced" : default; t=0 first section; rest in batches of 2 with 6s delay.
 *  - "full"     : every section is its own batch with 8s delay between batches. */
export type RevealCadence = "instant" | "fast" | "balanced" | "full";

/** Backend staging config derived from RevealCadence. Read at runtime by
 *  visual.tsx's runInsights so the batching strategy changes when the
 *  author flips the cadence preset in Settings → Advanced → Performance
 *  Levers. NO standalone backend knobs — one preset controls everything. */
export interface BackendStagingConfig {
    /** When true, bypass the staged planner and use the single-shot fast
     *  builder (all sections in ONE Genie call). Set by "instant" cadence.
     *  When false, use the staged planner with `batchSize` below. */
    useSinglePlanner: boolean;
    /** Group size for batches AFTER the lead. Ignored when
     *  useSinglePlanner is true. */
    batchSize: 1 | 2 | 3;
    /** Milliseconds the second worker waits before its FIRST pick, so the
     *  lead batch can return its conversation_id before subsequent
     *  sendMessages issue. Ignored when useSinglePlanner is true. */
    interBatchDelayMs: number;
}

/** Map cadence preset → backend staging config. Pure function; no React,
 *  no localStorage. Called inline by visual.tsx runInsights so changes
 *  take effect on the NEXT insights run after the user flips the preset. */
export function getBackendStagingFromCadence(cadence: RevealCadence): BackendStagingConfig {
    switch (cadence) {
        case "instant":
            return { useSinglePlanner: true, batchSize: 2, interBatchDelayMs: 0 };
        case "fast":
            return { useSinglePlanner: false, batchSize: 3, interBatchDelayMs: 3_000 };
        case "balanced":
            return { useSinglePlanner: false, batchSize: 2, interBatchDelayMs: 6_000 };
        case "full":
            return { useSinglePlanner: false, batchSize: 1, interBatchDelayMs: 8_000 };
    }
}

export interface PerformanceLevers {
    /** Reveal cadence preset. Default: "balanced". */
    revealCadence: RevealCadence;
    /** When false, App.tsx skips the screen-load discovery prewarm (the cached
     *  snapshot used by Pulse genie.ts when the escape-hatch PulseShell is
     *  mounted). Subsequent queries still benefit if UnifiedAssistantSurface
     *  (the default surface) populates the cache directly. Default: true. */
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
