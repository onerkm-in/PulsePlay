// playground/src/lib/perfInstrumentation.ts
//
// 2026-05-19 Codex final UAT P0/P1: live AI response time misses
// Rajesh's 5-10 second target. Rajesh explicitly said:
//   "Instrument stage timings so we can tell backend/query latency vs
//    polling/status UX vs frontend render/jank."
//   "Do not fake speed by only polishing the spinner."
//
// This module is the **instrumentation half** — it does not change
// latency on its own. It exposes timings to the browser DevTools
// Performance tab via the Performance API, plus a friendly
// `console.table` summary on completion, so the next session can
// look at a real timeline and decide where to cut.
//
// Three layers we want to see:
//   - backend (proxy + Genie + warehouse): time from request emit to
//     first row delivered
//   - polling/status UX (frontend stay-alive): time spent in each
//     status state
//   - frontend render/jank: time from data arrival to paint
//
// Callers should ONLY emit marks at boundaries they already own — we
// don't auto-instrument anything to avoid drift.

const ENABLED = typeof window !== "undefined" && typeof performance !== "undefined" && typeof performance.mark === "function";

/**
 * Audit 2026-05-19 P2-14: the `dumpRun` console.table + log lines now fire
 * for every Ask Pulse / AI Insights run, including production. They are
 * useful for developers but pollute end-user consoles. Gate behind a dev
 * check OR an explicit opt-in (`window.__pulseplayPerfDump = true`) so a
 * deployer can flip it on in a pinch without rebuilding.
 *
 * `import.meta.env.DEV` is true under Vite dev/test, false in `npm run build`
 * output. The `as any` cast keeps this file usable in environments that
 * don't have Vite's typed env (we still degrade to "off" cleanly).
 */
const CONSOLE_DUMP_ENABLED: boolean = (() => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any)?.env;
        if (env && env.DEV) return true;
    } catch { /* swallow */ }
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return !!((window as any).__pulseplayPerfDump);
    } catch { /* swallow */ }
    return false;
})();

const NS = "pulseplay";

/** Emit a Performance API mark. Visible in DevTools Performance tab as a
 *  vertical line. Survives navigation as long as the entry buffer holds. */
export function mark(name: string): void {
    if (!ENABLED) return;
    try { performance.mark(`${NS}:${name}`); } catch { /* swallow */ }
}

/** Emit a Performance API measure between two marks. Visible in DevTools
 *  Performance tab as a horizontal band. Returns the measured duration in
 *  milliseconds, or null when the start mark hasn't been recorded yet. */
export function measure(name: string, start: string, end?: string): number | null {
    if (!ENABLED) return null;
    const startName = `${NS}:${start}`;
    const endName = end ? `${NS}:${end}` : undefined;
    try {
        const m = endName
            ? performance.measure(`${NS}:${name}`, startName, endName)
            : performance.measure(`${NS}:${name}`, startName);
        return typeof m.duration === "number" ? m.duration : null;
    } catch {
        return null;
    }
}

/** In-memory timing log so we can print a single `console.table` at the
 *  end of a run. Keyed by run-id (the conversation/insights run) so two
 *  parallel runs don't stomp on each other. */
interface StageTiming {
    runId: string;
    stage: string;
    startMs: number;
    endMs?: number;
    durationMs?: number;
    note?: string;
}

const _timings = new Map<string, StageTiming[]>();

export function stageStart(runId: string, stage: string, note?: string): void {
    if (!ENABLED) return;
    const now = performance.now();
    mark(`${runId}:${stage}:start`);
    const arr = _timings.get(runId) ?? [];
    arr.push({ runId, stage, startMs: now, note });
    _timings.set(runId, arr);
}

export function stageEnd(runId: string, stage: string): void {
    if (!ENABLED) return;
    const now = performance.now();
    mark(`${runId}:${stage}:end`);
    const arr = _timings.get(runId);
    if (!arr) return;
    // Match the most recent open entry for this stage.
    for (let i = arr.length - 1; i >= 0; i--) {
        const entry = arr[i];
        if (entry.stage === stage && entry.endMs === undefined) {
            entry.endMs = now;
            entry.durationMs = now - entry.startMs;
            measure(`${runId}:${stage}`, `${runId}:${stage}:start`, `${runId}:${stage}:end`);
            return;
        }
    }
}

/** Dump a console.table of stage timings for a run. Call when the run
 *  completes (success OR failure). Returns the rows in case the caller
 *  wants to expose them elsewhere (e.g. a debug overlay). Safe no-op
 *  when the Performance API isn't available. */
export function dumpRun(runId: string, label?: string): StageTiming[] {
    const arr = _timings.get(runId) ?? [];
    if (!ENABLED || arr.length === 0) return arr;
    // Audit 2026-05-19 P2-14: only print to console in dev or when the user
    // explicitly opts in via window.__pulseplayPerfDump. The marks are still
    // emitted to the Performance API entry buffer in every build, so DevTools
    // Performance recording continues to show the bands.
    if (!CONSOLE_DUMP_ENABLED) return arr;
    try {
        // Friendly summary table for DevTools console.
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[pulseplay perf] ${label ?? runId}`);
        // eslint-disable-next-line no-console
        console.table(arr.map(t => ({
            stage: t.stage,
            duration_ms: t.durationMs?.toFixed(0) ?? "(still open)",
            note: t.note ?? "",
        })));
        const total = arr.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
        // eslint-disable-next-line no-console
        console.log(`Total measured: ${total.toFixed(0)} ms (sum of completed stages)`);
        // eslint-disable-next-line no-console
        console.groupEnd();
    } catch { /* swallow */ }
    return arr;
}

/** Reset the in-memory log for a run. Call before starting a new run
 *  with the same id, or at app start to clear stale entries. */
export function resetRun(runId: string): void {
    _timings.delete(runId);
}
