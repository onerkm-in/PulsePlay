// playground/src/visualization/translators/registry.ts
//
// UX-VIEWER-1.7b.1 — Translator registry for ChartIR.
//
// Walks a list of registered chart-spec translators in order, returning
// the ChartIR produced by the first one whose `detect()` returns true.
// Pattern: middleware chain (Babel/Webpack/Apollo). Industry-standard
// for "detect format → apply transform" pipelines where the caller may
// not know which format a payload is in.
//
// Two dispatch modes:
//   1. Default — `resolveChartSpec(raw, data)` walks the registry,
//      first-match-wins by shape detection.
//   2. Override — `resolveChartSpec(raw, data, { translator: "helios" })`
//      skips detection and forces the named translator (test injection,
//      debug, or known-typed backends).
//
// Translators register themselves by importing `registerChartTranslator()`
// at module load. Order matters: more-specific shapes should register
// before more-permissive ones. The heuristic adapter (registered last,
// detect: () => true) is the universal fallback.

import type { ChartIR, ChartIRData } from "../chartIR";
import { chartIRFromHeuristic } from "../chartIR";

export interface ChartTranslator {
    /** Stable identifier for explicit dispatch + provenance ("helios", "vega-lite", "heuristic"). */
    readonly name: string;
    /** Shape-based detection. Cheap; called for every chart that needs an IR. */
    readonly detect: (raw: unknown) => boolean;
    /**
     * Produce a ChartIR from the raw spec + the data table.
     * Returns `null` when the translator detects the shape but can't
     * actually translate it (e.g., HELIOS `widgetType: "table"` →
     * degrade to table-render, not a chart). The resolver continues to
     * the next translator in the registry when a translator returns null.
     */
    readonly translate: (raw: unknown, data: ChartIRData) => ChartIR | null;
}

/**
 * Registry storage. Module-level so translator files can register at
 * import time. Tests can reset the registry via `clearChartTranslators`.
 */
const REGISTRY: ChartTranslator[] = [];

export function registerChartTranslator(translator: ChartTranslator): void {
    // Replace by name if already registered (idempotent — module re-imports
    // in dev / HMR don't duplicate). Insert ordering: keep the original
    // position so registration order stays stable.
    const existingIdx = REGISTRY.findIndex(t => t.name === translator.name);
    if (existingIdx >= 0) {
        REGISTRY[existingIdx] = translator;
        return;
    }
    REGISTRY.push(translator);
}

export function clearChartTranslators(): void {
    REGISTRY.splice(0, REGISTRY.length);
}

export function listChartTranslators(): ReadonlyArray<ChartTranslator> {
    return REGISTRY.slice();
}

export interface ResolveOptions {
    /**
     * Explicit translator name — skips detection and uses this translator.
     * Useful for tests, debugging, and known-typed backends.
     * If the named translator isn't registered, returns `null` (caller
     * falls back to heuristic).
     */
    translator?: string;
}

/**
 * Walk the registry and return a ChartIR for the given raw spec + data.
 * Returns `null` only when no translator matches AND the heuristic
 * translator hasn't been registered. In normal production the heuristic
 * is registered last with `detect: () => true`, so this method never
 * returns null in practice.
 */
export function resolveChartSpec(
    raw: unknown,
    data: ChartIRData,
    opts: ResolveOptions = {},
): ChartIR | null {
    if (opts.translator) {
        const named = REGISTRY.find(t => t.name === opts.translator);
        return named ? named.translate(raw, data) : null;
    }
    for (const t of REGISTRY) {
        if (t.detect(raw)) {
            const ir = t.translate(raw, data);
            if (ir) return ir;
            // Translator detected the shape but couldn't translate
            // (e.g., HELIOS `widgetType: "table"`). Continue to the
            // next translator rather than short-circuiting — the
            // heuristic fallback can still paint a chart from the
            // bare data table.
        }
    }
    return null;
}

/**
 * Register the universal heuristic fallback. Called once at app boot
 * (see `./index.ts`). Detect always returns true; sits last in the
 * registry order so other translators get first shot.
 */
export const heuristicTranslator: ChartTranslator = {
    name: "heuristic",
    detect: () => true,
    translate: (_raw, data) => chartIRFromHeuristic(data),
};
