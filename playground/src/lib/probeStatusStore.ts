// playground/src/lib/probeStatusStore.ts
//
// Tiny pub/sub for probe + discovery status so the UI can surface
// "Grounding degraded" when the cycle-12 prewarm fails. Today the
// prewarm and Pulse-mode probe both swallow failures with .catch(() => {}),
// which makes a degraded session indistinguishable from a healthy one.
//
// Contract:
//   - `update(state)` sets the latest status and notifies subscribers.
//   - `getState()` returns the current snapshot synchronously.
//   - `subscribe(fn)` calls back on every change + returns an unsubscribe.
//   - `PROBE_STATUS_EVENT` is also dispatched on window so non-React
//     surfaces can listen without importing this module.
//
// Defensive: every callback is wrapped in try/catch so a misbehaving
// subscriber can't break dispatch for the others.

export type ProbeStatusPhase = "idle" | "probing" | "ready" | "failed";

export interface ProbeStatusState {
    phase: ProbeStatusPhase;
    /** Profile the most-recent probe ran against (or null when idle). */
    profile: string | null;
    /** Last error message when phase === "failed"; null otherwise. */
    error: string | null;
    /** Wall-clock ms when the current phase began. */
    updatedAt: number;
    /** How many full probe cycles have completed (ready OR failed) since load.
     *  Useful as a single number subscribers can watch instead of diffing
     *  the whole object. */
    cycleCount: number;
}

export const PROBE_STATUS_EVENT = "pulseplay:probe-status";

const initialState: ProbeStatusState = {
    phase: "idle",
    profile: null,
    error: null,
    updatedAt: typeof Date !== "undefined" ? Date.now() : 0,
    cycleCount: 0,
};

let state: ProbeStatusState = { ...initialState };
const listeners = new Set<(s: ProbeStatusState) => void>();

export function getProbeStatus(): ProbeStatusState {
    return { ...state };
}

export function subscribeProbeStatus(fn: (s: ProbeStatusState) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export interface ProbeStatusUpdate {
    phase: ProbeStatusPhase;
    profile?: string | null;
    error?: string | null;
}

export function updateProbeStatus(patch: ProbeStatusUpdate): ProbeStatusState {
    const incCycle = (patch.phase === "ready" || patch.phase === "failed")
        && (state.phase === "probing" || state.phase === "idle");
    state = {
        phase: patch.phase,
        profile: patch.profile === undefined ? state.profile : patch.profile,
        error: patch.error === undefined
            ? (patch.phase === "failed" ? state.error : null)
            : patch.error,
        updatedAt: Date.now(),
        cycleCount: incCycle ? state.cycleCount + 1 : state.cycleCount,
    };
    for (const fn of listeners) {
        try { fn(state); } catch { /* swallow per-listener errors */ }
    }
    if (typeof window !== "undefined") {
        try {
            window.dispatchEvent(new CustomEvent(PROBE_STATUS_EVENT, { detail: state }));
        } catch { /* ignore */ }
    }
    return { ...state };
}

/** Test-only reset. */
export function __resetProbeStatusForTests(): void {
    state = { ...initialState };
    listeners.clear();
}
