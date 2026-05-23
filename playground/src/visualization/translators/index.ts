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
import { heliosTranslator } from "./helios";
import { vegaLiteTranslator } from "./vegaLite";

// Order matters: more-specific shape detectors register first. The
// heuristic adapter (detect: () => true) MUST be last so vendor-
// specific translators get first shot at every chart.
//
// Registration order — most-specific to most-general:
//   1. HELIOS — requires chart_library === "HELIOS" + status === "GENERATED"
//      and parses a definition JSON. Very specific shape signature.
//   2. Vega-Lite — requires $schema referencing vega-lite OR a top-level
//      mark field. Catches Cortex Agents, Looker CA, Streamlit, future
//      Vega-Lite-emitting backends.
//   3. Heuristic — detect: () => true. Last resort fallback.

registerChartTranslator(heliosTranslator);
registerChartTranslator(vegaLiteTranslator);
registerChartTranslator(heuristicTranslator);

export {
    registerChartTranslator,
    clearChartTranslators,
    listChartTranslators,
    resolveChartSpec,
    heuristicTranslator,
} from "./registry";
export type { ChartTranslator, ResolveOptions } from "./registry";
