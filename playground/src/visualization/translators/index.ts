// playground/src/visualization/translators/index.ts
//
// UX-VIEWER-1.7b.1 — Translator registry bootstrap.
//
// Registers the heuristic fallback last (universal detect). Future
// vendor translators (HELIOS, Vega-Lite, etc.) are added BEFORE the
// heuristic so they win when their detect returns true.
//
// Import order matters: more-specific shapes register first. The
// heuristic must always be registered last so the resolver still has
// a fallback when no vendor shape matches.

import { registerChartTranslator, heuristicTranslator } from "./registry";

// FUTURE: import vendor translators here, BEFORE the heuristic, e.g.:
//   import { heliosTranslator } from "./helios";  // UX-VIEWER-1.7b.2
//   import { vegaLiteTranslator } from "./vegaLite";  // UX-VIEWER-1.7b.3
//   registerChartTranslator(heliosTranslator);
//   registerChartTranslator(vegaLiteTranslator);

registerChartTranslator(heuristicTranslator);

export {
    registerChartTranslator,
    clearChartTranslators,
    listChartTranslators,
    resolveChartSpec,
    heuristicTranslator,
} from "./registry";
export type { ChartTranslator, ResolveOptions } from "./registry";
