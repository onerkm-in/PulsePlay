// playground/src/lib/chartRegistry.ts
//
// Step 5 — Chart registry with tier classification + auto-pick policy.
//
// Tiers and rules synthesized from docs/UNIFIED_ASK_PULSE_WORKBENCH.md
// "Visualization stack" / "Chart tiers" and the source vendor catalogs
// (Databricks AI/BI, Power BI, Tableau, Looker, Qlik).

export type ChartTier = 'core' | 'advanced' | 'trendy' | 'legacy' | 'future';

export type AutoPickPolicy =
    | 'always'                  // Core tier — auto-pick allowed.
    | 'heuristic'               // Advanced tier — auto-pick when domain shape matches.
    | 'opt-in'                  // Trendy tier — user must explicitly pick.
    | 'never-auto'              // Legacy tier — supported but never auto-picked.
    | 'roadmap';                // Future tier — not implemented yet.

/** Canonical chart type identifiers. Match Vega-Lite mark names where possible. */
export type ChartTypeId =
    // Core
    | 'kpi'
    | 'table'
    | 'pivot'
    | 'bar'
    | 'column'
    | 'line'
    | 'area'
    | 'combo'
    | 'scatter'
    | 'bubble'
    | 'histogram'
    | 'box'
    | 'heatmap'
    | 'pie'
    | 'donut'
    | 'treemap'
    | 'map'
    | 'funnel'
    | 'waterfall'
    // Advanced
    | 'bullet'
    | 'sparkline'
    | 'small-multiples'
    | 'pareto'
    | 'cohort'
    | 'sankey'
    | 'gantt'
    | 'annotations'
    | 'confidence-bands'
    // Trendy
    | 'lollipop'
    | 'slope'
    | 'bump'
    | 'calendar-heatmap'
    | 'streamgraph'
    | 'sunburst'
    | 'ridgeline'
    | 'beeswarm'
    | 'hexbin'
    // Legacy
    | 'gauge'
    | 'radar'
    | 'word-cloud'
    | 'packed-bubble'
    | '3d-scatter'
    | 'dual-axis'
    // Future
    | 'network'
    | 'candlestick'
    | 'ohlc'
    | 'webgl-points'
    | 'arrow-large-data';

export interface ChartRegistryEntry {
    readonly id: ChartTypeId;
    readonly tier: ChartTier;
    readonly autoPick: AutoPickPolicy;
    /**
     * Whether the workbench can render this chart today. False entries are
     * in the registry for the chart-knowledge surface (recommendation /
     * critique) and to make the tier picture honest.
     */
    readonly renderable: boolean;
    /** Optional Vega-Lite `mark` name this maps to. */
    readonly vegaLiteMark?: string;
    /** Optional ECharts series `type` name. */
    readonly echartsSeriesType?: string;
}

const e = (
    id: ChartTypeId,
    tier: ChartTier,
    autoPick: AutoPickPolicy,
    renderable: boolean,
    vegaLiteMark?: string,
    echartsSeriesType?: string,
): ChartRegistryEntry => Object.freeze({ id, tier, autoPick, renderable, vegaLiteMark, echartsSeriesType });

export const CHART_REGISTRY: ReadonlyArray<ChartRegistryEntry> = Object.freeze([
    // Core — auto-pick allowed
    e('kpi',         'core', 'always',    true,  undefined, undefined),
    e('table',       'core', 'always',    true,  undefined, undefined),
    e('pivot',       'core', 'always',    false, undefined, undefined),
    e('bar',         'core', 'always',    true,  'bar', 'bar'),
    e('column',      'core', 'always',    true,  'bar', 'bar'),
    e('line',        'core', 'always',    true,  'line', 'line'),
    e('area',        'core', 'always',    true,  'area', 'line'),
    e('combo',       'core', 'always',    false, undefined, undefined),
    e('scatter',     'core', 'always',    true,  'point', 'scatter'),
    e('bubble',      'core', 'always',    true,  'point', 'scatter'),
    e('histogram',   'core', 'always',    false, 'bar', 'bar'),
    e('box',         'core', 'always',    false, undefined, 'boxplot'),
    e('heatmap',     'core', 'always',    false, 'rect', 'heatmap'),
    e('pie',         'core', 'always',    true,  'arc', 'pie'),
    e('donut',       'core', 'always',    true,  'arc', 'pie'),
    e('treemap',     'core', 'always',    false, undefined, 'treemap'),
    e('map',         'core', 'always',    false, undefined, 'map'),
    e('funnel',      'core', 'always',    false, undefined, 'funnel'),
    e('waterfall',   'core', 'always',    false, undefined, undefined),
    // Advanced — heuristic auto-pick
    e('bullet',           'advanced', 'heuristic', false),
    e('sparkline',        'advanced', 'heuristic', false, 'line', 'line'),
    e('small-multiples',  'advanced', 'heuristic', false),
    e('pareto',           'advanced', 'heuristic', false),
    e('cohort',           'advanced', 'heuristic', false),
    e('sankey',           'advanced', 'heuristic', false, undefined, 'sankey'),
    e('gantt',            'advanced', 'heuristic', false),
    e('annotations',      'advanced', 'heuristic', false),
    e('confidence-bands', 'advanced', 'heuristic', false),
    // Trendy — opt-in
    e('lollipop',          'trendy', 'opt-in', false),
    e('slope',             'trendy', 'opt-in', false),
    e('bump',              'trendy', 'opt-in', false),
    e('calendar-heatmap',  'trendy', 'opt-in', false),
    e('streamgraph',       'trendy', 'opt-in', false),
    e('sunburst',          'trendy', 'opt-in', false, undefined, 'sunburst'),
    e('ridgeline',         'trendy', 'opt-in', false),
    e('beeswarm',          'trendy', 'opt-in', false),
    e('hexbin',            'trendy', 'opt-in', false),
    // Legacy — never auto-picked
    e('gauge',         'legacy', 'never-auto', false, undefined, 'gauge'),
    e('radar',         'legacy', 'never-auto', false, undefined, 'radar'),
    e('word-cloud',    'legacy', 'never-auto', false),
    e('packed-bubble', 'legacy', 'never-auto', false),
    e('3d-scatter',    'legacy', 'never-auto', false),
    e('dual-axis',     'legacy', 'never-auto', false),
    // Future
    e('network',           'future', 'roadmap', false, undefined, 'graph'),
    e('candlestick',       'future', 'roadmap', false, undefined, 'candlestick'),
    e('ohlc',              'future', 'roadmap', false),
    e('webgl-points',      'future', 'roadmap', false),
    e('arrow-large-data',  'future', 'roadmap', false),
]);

const REGISTRY_BY_ID: ReadonlyMap<ChartTypeId, ChartRegistryEntry> = new Map(
    CHART_REGISTRY.map((entry) => [entry.id, entry]),
);

export function chartRegistryEntry(id: ChartTypeId): ChartRegistryEntry | undefined {
    return REGISTRY_BY_ID.get(id);
}

/** Returns entries whose tier and renderable status match the predicate. */
export function chartsByTier(tier: ChartTier): ReadonlyArray<ChartRegistryEntry> {
    return CHART_REGISTRY.filter((c) => c.tier === tier);
}

/** Returns entries that the workbench can render today. */
export function renderableCharts(): ReadonlyArray<ChartRegistryEntry> {
    return CHART_REGISTRY.filter((c) => c.renderable);
}

/**
 * Resolve a chart entry from a Vega-Lite mark name. Returns undefined when
 * the mark is not in the registry — caller decides whether to fall back to
 * a placeholder or surface a "no registered chart" error.
 */
export function chartFromVegaLiteMark(mark: string): ChartRegistryEntry | undefined {
    return CHART_REGISTRY.find((c) => c.vegaLiteMark === mark);
}

/**
 * Charts that are flagged as never auto-picked (legacy or roadmap policies).
 * Used by the auto-pick policy enforcer in Step 7 (and tests today).
 */
export function neverAutoPickIds(): ReadonlyArray<ChartTypeId> {
    return CHART_REGISTRY
        .filter((c) => c.autoPick === 'never-auto' || c.autoPick === 'roadmap' || c.autoPick === 'opt-in')
        .map((c) => c.id);
}
