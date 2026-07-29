// playground/src/lib/buildEChartsOption.ts
//
// Converts raw tabular data (columns[], rows[][]) from Genie SQL results into
// an ECharts option spec for the chart type the user selected.
//
// Design rules:
//   - Returns null when the data shape is incompatible with the chart type so
//     the caller can show a graceful "not enough data" message instead of a
//     broken chart.
//   - Pure function — no side effects, no ECharts imports (the spec is just a
//     plain JS object; EChartsRenderer owns the echarts.init call).
//   - Handles the most common SQL result shapes automatically so authors don't
//     need to reshape their data before asking a chart question.
//
// Supported chart types (all from chartRegistry.ts):
//   Core:     bar, column, line, area, scatter, bubble, pie, donut,
//             heatmap, treemap, funnel, waterfall, kpi
//   Advanced: sparkline, lollipop, pareto, sankey
//   Legacy:   gauge, radar
//   Trendy:   sunburst

import type { EChartsOption } from 'echarts';
import { detectColumnUnit, formatCategoryLabel, isTemporalDimensionColumn, type UnitType } from '../visualization/chartAutoPick';
import { humanizeColumnName, formatValueByUnit } from './columnLabels';

// ── Palette ───────────────────────────────────────────────────────────────────
//
// Default is a vibrant ("poppy") categorical set — punchier than ECharts'
// muted stock palette. It is overridable at runtime via CSS custom properties
// so a theme (or a future Settings palette picker) can re-skin every chart
// without touching this file: set `--pp-chart-palette` (comma-separated hex)
// or `--pp-chart-1 … --pp-chart-N` on :root. resolveChartPalette() reads those
// at build time and falls back to VIBRANT_DEFAULT when none are present (e.g.
// jsdom in tests, or before the theme has applied).

const VIBRANT_DEFAULT = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981',
    '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316',
];

// Module-level so the existing PALETTE[i] references throughout keep working.
// buildEChartsOption refreshes this from CSS vars at the top of each call.
let PALETTE = [...VIBRANT_DEFAULT];

function resolveChartPalette(): string[] {
    try {
        if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
            return [...VIBRANT_DEFAULT];
        }
        const cs = getComputedStyle(document.documentElement);
        const list = cs.getPropertyValue('--pp-chart-palette').trim();
        if (list) {
            const parsed = list.split(',').map(s => s.trim()).filter(Boolean);
            if (parsed.length >= 2) return parsed;
        }
        const indexed: string[] = [];
        for (let i = 1; i <= 12; i++) {
            const v = cs.getPropertyValue(`--pp-chart-${i}`).trim();
            if (v) indexed.push(v);
        }
        if (indexed.length >= 2) return indexed;
    } catch {
        /* fall through to default */
    }
    return [...VIBRANT_DEFAULT];
}

// ── Data extraction helpers ───────────────────────────────────────────────────

function isNumeric(v: unknown): boolean {
    if (v === null || v === undefined || v === '') return false;
    return !isNaN(Number(v));
}

function toNum(v: unknown): number {
    return Number(v) || 0;
}

function detectColumnRoles(columns: string[], rows: unknown[][]): {
    labelCols: number[];
    numericCols: number[];
} {
    if (!columns.length || !rows.length) return { labelCols: [], numericCols: [] };
    const labelCols: number[] = [];
    const numericCols: number[] = [];
    columns.forEach((colName, ci) => {
        const sample = rows.slice(0, 20).map(r => r[ci]).filter(v => v !== null && v !== undefined);
        const numericRatio = sample.filter(v => isNumeric(v)).length / (sample.length || 1);
        // A time dimension (year/month/quarter) is numeric-valued but is a
        // CATEGORY, not a measure — otherwise "year" (2025, 2026…) gets plotted
        // as a ~2000-tall series that dwarfs the real numbers and shows up as
        // both the x-axis AND a bar.
        if (numericRatio >= 0.7 && !isTemporalDimensionColumn(columns[ci])) numericCols.push(ci);
        else labelCols.push(ci);
    });
    return { labelCols, numericCols };
}

/** Category labels + one or more numeric series from a standard SQL result.
 *  2026-05-22 G2 — `name` is now humanized via humanizeColumnName, and each
 *  series carries the raw column name + detected unit so axis/tooltip
 *  formatters can render values per industry conventions ($ for currency,
 *  % for ratios, pp for percentage points, K/M for big counts). */
function extractCategorySeries(columns: string[], rows: unknown[][]): {
    categories: string[];
    series: { name: string; rawName: string; unit: UnitType; data: number[] }[];
} | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (!numericCols.length) return null;
    const labelCol = labelCols[0] ?? 0;
    // Collapse Genie's DATE-typed period values ("2024-01-01T00:00:00.000Z")
    // to the column's granularity ("2024" / "Q1 2024" / "Jan 2024").
    const categories = rows.map(r => formatCategoryLabel(columns[labelCol] ?? '', r[labelCol]));
    const series = numericCols.map(ci => {
        // Suffix-encoded scales: Genie sometimes returns a measure already
        // divided into billions/millions and says so only in the NAME
        // ("net_sales_b" = 3.2 meaning $3.20B). Rendered raw, that series is
        // sub-pixel beside a millions series and its tooltip reads "$3.20" —
        // both lies. Decode the unambiguous suffixes back to true values.
        // (Roman-convention "_m" is ambiguous — thousand here, million in the
        // wild — so it is deliberately NOT decoded.)
        const raw = columns[ci];
        const norm = String(raw || "").toLowerCase();
        const scale = /(_b|_bn|\sb|\sbn)$/.test(norm) ? 1e9
            : /(_mm|\smm)$/.test(norm) ? 1e6 : 1;
        const display = scale === 1 ? raw : raw.replace(/[_\s](b|bn|mm)$/i, "");
        return {
            name: humanizeColumnName(display),
            rawName: raw,
            unit: detectColumnUnit(display),
            data: rows.map(r => toNum(r[ci]) * scale),
        };
    });
    return { categories, series };
}

/**
 * Can these series share ONE combined chart without lying?
 *
 * The dual-axis split covers exactly two scales: a percent axis and ONE
 * magnitude axis. When the non-percent series themselves span ≥3 orders of
 * magnitude — 100x and beyond (e.g. GHG in millions beside net sales in
 * billions), whichever
 * one loses the axis renders sub-pixel — a chart that LOOKS complete while
 * hiding a series. Three heuristic patches in one day each fixed a symptom
 * of this and the next query shape still misled (2026-07-29). So: refuse the
 * combined chart and say why; the caller falls back to the table (always
 * true) plus a single-measure chart picker.
 */
export function assessChartHonesty(columns: string[], rows: unknown[][]): {
    ok: boolean;
    reason?: string;
    /** Humanized measure names, for the caller's per-measure picker. */
    measures: string[];
    /** Raw column names, index-aligned with `measures`. */
    rawMeasures: string[];
} {
    const d = extractCategorySeries(columns, rows);
    if (!d) return { ok: true, measures: [], rawMeasures: [] };
    const measures = d.series.map(s => s.name);
    const rawMeasures = d.series.map(s => s.rawName);
    const magnitudes = d.series.filter(s => s.unit !== "percentage");
    if (magnitudes.length >= 2) {
        const maxima = magnitudes.map(s => Math.max(...s.data.map(Math.abs)));
        const hi = Math.max(...maxima), lo = Math.min(...maxima.filter(m => m > 0));
        // 100x, not 1000x: at a 100x gap the smaller series is under 1% of
        // the axis - already invisible. (The live repro's gap was ~700x and a
        // 1e3 cutoff would have waved it through.)
        if (Number.isFinite(hi) && Number.isFinite(lo) && lo > 0 && hi / lo >= 100) {
            return {
                ok: false,
                reason: "These measures live on scales too far apart to share one chart honestly — one of them would render invisibly small. Pick one measure to chart it truthfully; the table shows everything.",
                measures,
                rawMeasures,
            };
        }
    }
    return { ok: true, measures, rawMeasures };
}

/** Name + value pairs — for pie, donut, funnel, treemap, kpi. */
function extractNameValue(columns: string[], rows: unknown[][]): { name: string; value: number }[] | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (!numericCols.length) return null;
    const nameCol = labelCols[0] ?? 0;
    const valueCol = numericCols[0];
    return rows.map(r => ({ name: formatCategoryLabel(columns[nameCol] ?? '', r[nameCol]), value: toNum(r[valueCol]) }));
}

/** X/Y scatter pairs — optionally with a 3rd numeric for bubble size. */
function extractScatterPoints(columns: string[], rows: unknown[][]): {
    points: [number, number][] | [number, number, number][];
    xName: string;
    yName: string;
    sizeName?: string;
} | null {
    const { numericCols } = detectColumnRoles(columns, rows);
    if (numericCols.length < 2) return null;
    const [xi, yi, si] = numericCols;
    const points: [number, number, number][] = rows.map(r => [
        toNum(r[xi]),
        toNum(r[yi]),
        si !== undefined ? toNum(r[si]) : 1,
    ]);
    return {
        points,
        xName: columns[xi],
        yName: columns[yi],
        sizeName: si !== undefined ? columns[si] : undefined,
    };
}

/** Heatmap: requires 2 label columns + 1 numeric. */
function extractHeatmap(columns: string[], rows: unknown[][]): {
    xLabels: string[];
    yLabels: string[];
    data: [number, number, number][];
    min: number;
    max: number;
} | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (labelCols.length < 2 || !numericCols.length) return null;
    const [xci, yci] = labelCols;
    const vci = numericCols[0];
    const xSet = new Map<string, number>();
    const ySet = new Map<string, number>();
    rows.forEach(r => {
        const x = String(r[xci] ?? '');
        const y = String(r[yci] ?? '');
        if (!xSet.has(x)) xSet.set(x, xSet.size);
        if (!ySet.has(y)) ySet.set(y, ySet.size);
    });
    const xLabels = [...xSet.keys()];
    const yLabels = [...ySet.keys()];
    let min = Infinity, max = -Infinity;
    const data: [number, number, number][] = rows.map(r => {
        const v = toNum(r[vci]);
        if (v < min) min = v;
        if (v > max) max = v;
        return [xSet.get(String(r[xci] ?? '')) ?? 0, ySet.get(String(r[yci] ?? '')) ?? 0, v];
    });
    return { xLabels, yLabels, data, min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 1 };
}

/** Single numeric value — for gauge and kpi. */
function extractSingleValue(columns: string[], rows: unknown[][]): number | null {
    const { numericCols } = detectColumnRoles(columns, rows);
    if (!numericCols.length || !rows.length) return null;
    return toNum(rows[0][numericCols[0]]);
}

/** Radar: 1 label row per axis or 1 row with N numeric columns. */
function extractRadar(columns: string[], rows: unknown[][]): {
    indicators: { name: string; max: number }[];
    values: number[];
} | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    // Shape A: 1 label col + 1 value col, many rows → each row is an axis
    if (labelCols.length >= 1 && numericCols.length >= 1 && rows.length >= 3) {
        const nci = numericCols[0];
        const lci = labelCols[0];
        const values = rows.map(r => toNum(r[nci]));
        const maxVal = Math.max(...values) || 1;
        return {
            indicators: rows.map(r => ({ name: String(r[lci] ?? ''), max: maxVal * 1.2 })),
            values,
        };
    }
    // Shape B: 1 row with N numeric columns → each column is an axis
    if (numericCols.length >= 3 && rows.length >= 1) {
        const values = numericCols.map(ci => toNum(rows[0][ci]));
        const maxVal = Math.max(...values) || 1;
        return {
            indicators: numericCols.map(ci => ({ name: columns[ci], max: maxVal * 1.2 })),
            values,
        };
    }
    return null;
}

/** Sankey: source, target, value triplet. */
function extractSankey(columns: string[], rows: unknown[][]): {
    nodes: { name: string }[];
    links: { source: string; target: string; value: number }[];
} | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (labelCols.length < 2 || !numericCols.length) return null;
    const [sci, tci] = labelCols;
    const vci = numericCols[0];
    const nodeSet = new Set<string>();
    const links = rows.map(r => {
        const source = String(r[sci] ?? '');
        const target = String(r[tci] ?? '');
        nodeSet.add(source);
        nodeSet.add(target);
        return { source, target, value: toNum(r[vci]) };
    });
    const nodes = [...nodeSet].map(name => ({ name }));
    return { nodes, links };
}

/** Waterfall: sequential values — first row is base, rest are deltas. */
function extractWaterfall(columns: string[], rows: unknown[][]): {
    categories: string[];
    placeholder: number[];  // transparent stack base
    values: number[];       // actual bar segment (can be negative)
} | null {
    const extracted = extractCategorySeries(columns, rows);
    if (!extracted) return null;
    const { categories, series } = extracted;
    if (!series.length) return null;
    const raw = series[0].data;
    // Running total for placeholder
    const placeholder: number[] = [];
    const values: number[] = raw.map((v, i) => {
        if (i === 0) { placeholder.push(0); return v; }
        const running = placeholder[i - 1] + raw[i - 1];
        placeholder.push(Math.max(0, Math.min(running, running + v)));
        return v;
    });
    return { categories, placeholder, values };
}

// ── Common option helpers ─────────────────────────────────────────────────────

const TOOLTIP_STYLE = { trigger: 'axis' as const };
const LEGEND_STYLE = { type: 'scroll' as const, bottom: 0 };
const GRID_STYLE = { left: '10%', right: '6%', bottom: 40, top: 40, containLabel: true };

// ── 2026-05-22 G2 — axis + tooltip value formatters per detected unit ────────
//
// When a chart has multiple series with DIFFERENT units (e.g. sales in $ +
// margin in %), the axis can't carry one unit-correct formatter for all.
// We resolve to the MAJORITY unit for axis labels, and use per-series
// formatting in tooltips (which know which series the hovered point
// belongs to). For single-series charts, axis matches that series.

interface SeriesWithUnit {
    readonly name: string;
    readonly rawName: string;
    readonly unit: UnitType;
}

function dominantUnit(series: ReadonlyArray<SeriesWithUnit>): UnitType {
    if (!series.length) return 'generic';
    const counts: Partial<Record<UnitType, number>> = {};
    for (const s of series) counts[s.unit] = (counts[s.unit] ?? 0) + 1;
    let best: UnitType = series[0].unit;
    let bestCount = 0;
    for (const u of Object.keys(counts) as UnitType[]) {
        const c = counts[u] ?? 0;
        if (c > bestCount) { best = u; bestCount = c; }
    }
    return best;
}

function dominantRawName(series: ReadonlyArray<SeriesWithUnit>, unit: UnitType): string | undefined {
    return series.find(s => s.unit === unit)?.rawName;
}

/** True when the series carry more than one unit (e.g. a % metric plotted
 *  alongside a count or currency). A single axis can't wear more than one
 *  unit's suffix without mislabeling the others. */
function hasMixedUnits(series: ReadonlyArray<SeriesWithUnit>): boolean {
    return new Set(series.map(s => s.unit)).size > 1;
}

/** Axis-label formatter using the dominant unit across all series. Returns
 *  an ECharts axisLabel object (formatter callback). */
function axisFormatterForSeries(series: ReadonlyArray<SeriesWithUnit>): { formatter: (value: number) => string } {
    // Mixed-unit chart (e.g. Order Fill Rate % beside GHG tCO2e counts): a
    // single suffix would mislabel the other series — a 2.5M count rendered
    // on a percentage axis becomes the nonsensical "2,500,000.0%". Fall back
    // to a unit-less humanized number ("2.5MM") so the axis stays honest.
    if (hasMixedUnits(series)) {
        return { formatter: (value: number) => formatValueByUnit(value, 'generic', 'axis') };
    }
    const unit = dominantUnit(series);
    const hint = dominantRawName(series, unit);
    return { formatter: (value: number) => formatValueByUnit(value, unit, 'axis', hint) };
}

/** Tooltip with a value formatter that uses the dominant unit. ECharts'
 *  `tooltip.valueFormatter` receives only the value (no series context for
 *  trigger:'axis' tooltips), so we resolve to the dominant unit across
 *  series. Single-series charts are exact; mixed-unit charts get the
 *  majority unit (and the chart-rationale warning already flags mixed-unit
 *  shapes separately). */
function tooltipWithFormatter(series: ReadonlyArray<SeriesWithUnit>): Record<string, unknown> {
    // Mixed-unit chart: `valueFormatter` has no series context, so a single
    // "dominant" unit stamped every line — three % metrics beside Net Sales
    // turned a revenue figure into "1902440231.0%" (user screenshot,
    // 2026-07-29). The full `formatter` callback DOES know which series each
    // line belongs to, so every line wears its own unit.
    if (hasMixedUnits(series)) {
        const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
        return {
            ...TOOLTIP_STYLE,
            formatter: (params: unknown) => {
                const list = (Array.isArray(params) ? params : [params]) as Array<{
                    seriesIndex?: number; seriesName?: string; marker?: string;
                    axisValueLabel?: string; name?: string; value?: unknown;
                }>;
                const title = esc(list[0]?.axisValueLabel ?? list[0]?.name ?? '');
                const lines = list.map((pt) => {
                    const su = series[pt.seriesIndex ?? -1];
                    const raw = Array.isArray(pt.value) ? pt.value[pt.value.length - 1] : pt.value;
                    const num = typeof raw === 'string' ? Number(raw) : (raw as number);
                    const txt = Number.isFinite(num)
                        ? formatValueByUnit(num, su?.unit ?? 'generic', 'tooltip', su?.rawName)
                        : esc(raw);
                    return `${pt.marker ?? ''} ${esc(pt.seriesName)}&nbsp;&nbsp;<b>${esc(txt)}</b>`;
                });
                return [title, ...lines].filter(Boolean).join('<br/>');
            },
        };
    }
    const dom = dominantUnit(series);
    const hint = dominantRawName(series, dom);
    return {
        ...TOOLTIP_STYLE,
        valueFormatter: (value: number | string) => {
            const v = typeof value === 'string' ? Number(value) : value;
            if (!Number.isFinite(v)) return String(value);
            return formatValueByUnit(v as number, dom, 'tooltip', hint);
        },
    };
}

/**
 * Mixed-unit scale fix: percentages and magnitudes cannot share one linear
 * axis — a billions series flattens every % series into an invisible line at
 * y≈0 (user screenshot, 2026-07-29). When both groups are present, split
 * into TWO y-axes: magnitudes on the left, percents on the right, and give
 * every series its yAxisIndex. Single-unit charts are returned unchanged.
 */
function splitAxesForMixedUnits(
    series: ReadonlyArray<SeriesWithUnit>,
    baseAxis: Record<string, unknown>,
): { yAxis: Record<string, unknown> | Array<Record<string, unknown>>; axisIndexFor: (i: number) => number } {
    const pctIdx = series.map((s, i) => (s.unit === 'percentage' ? i : -1)).filter(i => i >= 0);
    const hasPct = pctIdx.length > 0;
    const hasOther = pctIdx.length < series.length;
    if (!hasPct || !hasOther) {
        return { yAxis: baseAxis, axisIndexFor: () => 0 };
    }
    const others = series.filter(s => s.unit !== 'percentage');
    const pcts = series.filter(s => s.unit === 'percentage');
    return {
        yAxis: [
            { type: 'value', axisLabel: axisFormatterForSeries(others) },
            { type: 'value', axisLabel: axisFormatterForSeries(pcts), splitLine: { show: false } },
        ],
        axisIndexFor: (i: number) => (series[i]?.unit === 'percentage' ? 1 : 0),
    };
}

// Re-export for tests / other callers if they want the same formatting.
export { humanizeColumnName, formatValueByUnit };

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Convert raw tabular Genie data into an ECharts option spec.
 * Returns null when the data doesn't fit the requested chart type.
 */
// Public entry — resolves the active palette, builds the spec, and ensures the
// palette is authoritative for EVERY chart type by also setting the option-level
// `color`. This matters for series that don't set an explicit per-item color
// (e.g. pie/donut), which would otherwise fall back to ECharts' stock palette.
export function buildEChartsOption(
    chartType: string,
    columns: string[],
    rows: unknown[][],
): EChartsOption | null {
    // Refresh the active palette from theme CSS vars (vibrant default otherwise)
    // so charts re-skin live when the theme changes. Synchronous single-pass.
    PALETTE = resolveChartPalette();
    const option = buildEChartsOptionInner(chartType, columns, rows);
    if (option && (option as Record<string, unknown>).color === undefined) {
        (option as Record<string, unknown>).color = [...PALETTE];
    }
    return option;
}

function buildEChartsOptionInner(
    chartType: string,
    columns: string[],
    rows: unknown[][],
): EChartsOption | null {
    if (!columns.length || !rows.length) return null;

    switch (chartType) {

        // ── Bar (horizontal) ─────────────────────────────────────────────────
        case 'bar': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            return {
                tooltip: tooltipWithFormatter(d.series),
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: { ...GRID_STYLE, left: '20%' },
                xAxis: (() => {
                    // Same mixed-unit split as the vertical charts, on the X
                    // axis - a % series beside a count series must not share
                    // one linear scale.
                    const split = splitAxesForMixedUnits(d.series, { type: 'value', axisLabel: axisFormatterForSeries(d.series) });
                    return split.yAxis;
                })(),
                yAxis: { type: 'category', data: d.categories },
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'bar' as const,
                    xAxisIndex: splitAxesForMixedUnits(d.series, {}).axisIndexFor(i),
                    data: s.data,
                    itemStyle: { color: PALETTE[i % PALETTE.length] },
                })),
            };
        }

        // ── Column (vertical bar) ────────────────────────────────────────────
        case 'column':
        case 'clustered-bar': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            return {
                tooltip: tooltipWithFormatter(d.series),
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: splitAxesForMixedUnits(d.series, { type: 'value', axisLabel: axisFormatterForSeries(d.series) }).yAxis,
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'bar' as const,
                    data: s.data,
                    yAxisIndex: splitAxesForMixedUnits(d.series, {}).axisIndexFor(i),
                    itemStyle: { color: PALETTE[i % PALETTE.length] },
                })),
            };
        }

        // ── Line ─────────────────────────────────────────────────────────────
        case 'line':
        case 'sparkline': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            return {
                tooltip: tooltipWithFormatter(d.series),
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: splitAxesForMixedUnits(d.series, { type: 'value', axisLabel: axisFormatterForSeries(d.series) }).yAxis,
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'line' as const,
                    data: s.data,
                    yAxisIndex: splitAxesForMixedUnits(d.series, {}).axisIndexFor(i),
                    smooth: true,
                    itemStyle: { color: PALETTE[i % PALETTE.length] },
                })),
            };
        }

        // ── Area ─────────────────────────────────────────────────────────────
        case 'area': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            return {
                tooltip: tooltipWithFormatter(d.series),
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: splitAxesForMixedUnits(d.series, { type: 'value', axisLabel: axisFormatterForSeries(d.series) }).yAxis,
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'line' as const,
                    data: s.data,
                    smooth: true,
                    yAxisIndex: splitAxesForMixedUnits(d.series, {}).axisIndexFor(i),
                    areaStyle: { opacity: 0.3 },
                    itemStyle: { color: PALETTE[i % PALETTE.length] },
                })),
            };
        }

        // ── Scatter ──────────────────────────────────────────────────────────
        case 'scatter': {
            const d = extractScatterPoints(columns, rows);
            if (!d) return null;
            return {
                tooltip: { trigger: 'item' as const },
                grid: GRID_STYLE,
                xAxis: { type: 'value', name: d.xName, nameLocation: 'middle', nameGap: 30 },
                yAxis: { type: 'value', name: d.yName, nameLocation: 'middle', nameGap: 40 },
                series: [{
                    type: 'scatter' as const,
                    data: (d.points as [number, number, number][]).map(p => [p[0], p[1]]),
                    itemStyle: { color: PALETTE[0], opacity: 0.7 },
                }],
            };
        }

        // ── Bubble ───────────────────────────────────────────────────────────
        case 'bubble': {
            const d = extractScatterPoints(columns, rows);
            if (!d) return null;
            const maxSize = Math.max(...(d.points as [number, number, number][]).map(p => p[2])) || 1;
            return {
                tooltip: { trigger: 'item' as const },
                grid: GRID_STYLE,
                xAxis: { type: 'value', name: d.xName, nameLocation: 'middle', nameGap: 30 },
                yAxis: { type: 'value', name: d.yName, nameLocation: 'middle', nameGap: 40 },
                series: [{
                    type: 'scatter' as const,
                    data: (d.points as [number, number, number][]).map(p => [p[0], p[1], p[2]]),
                    symbolSize: (v: number[]) => Math.max(8, 60 * (v[2] / maxSize)),
                    itemStyle: { color: PALETTE[0], opacity: 0.65 },
                }],
            };
        }

        // ── Pie ──────────────────────────────────────────────────────────────
        case 'pie': {
            const d = extractNameValue(columns, rows);
            if (!d) return null;
            return {
                tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
                legend: LEGEND_STYLE,
                series: [{
                    type: 'pie' as const,
                    radius: '65%',
                    center: ['50%', '48%'],
                    data: d,
                    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
                }],
            };
        }

        // ── Donut ────────────────────────────────────────────────────────────
        case 'donut': {
            const d = extractNameValue(columns, rows);
            if (!d) return null;
            return {
                tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
                legend: LEGEND_STYLE,
                series: [{
                    type: 'pie' as const,
                    radius: ['42%', '65%'],
                    center: ['50%', '48%'],
                    data: d,
                    label: { show: true, formatter: '{b}\n{d}%' },
                }],
            };
        }

        // ── Heatmap ──────────────────────────────────────────────────────────
        case 'heatmap': {
            const d = extractHeatmap(columns, rows);
            if (!d) return null;
            return {
                tooltip: { position: 'top' as const },
                grid: { top: 50, bottom: 60, left: '15%', right: '10%' },
                xAxis: { type: 'category', data: d.xLabels, splitArea: { show: true } },
                yAxis: { type: 'category', data: d.yLabels, splitArea: { show: true } },
                visualMap: {
                    min: d.min,
                    max: d.max,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: 0,
                    inRange: { color: ['#eef3ff', '#5470c6'] },
                },
                series: [{
                    type: 'heatmap' as const,
                    data: d.data,
                    label: { show: d.xLabels.length <= 10 },
                    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
                }],
            };
        }

        // ── Treemap ──────────────────────────────────────────────────────────
        case 'treemap': {
            const d = extractNameValue(columns, rows);
            if (!d) return null;
            return {
                tooltip: { formatter: '{b}: {c}' },
                series: [{
                    type: 'treemap' as const,
                    data: d.map((item, i) => ({ ...item, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
                    label: { show: true, formatter: '{b}\n{c}' },
                    breadcrumb: { show: false },
                }],
            };
        }

        // ── Funnel ───────────────────────────────────────────────────────────
        case 'funnel': {
            const d = extractNameValue(columns, rows);
            if (!d) return null;
            // Sort descending for classic funnel shape
            const sorted = [...d].sort((a, b) => b.value - a.value);
            return {
                tooltip: { trigger: 'item' as const, formatter: '{b}: {c}' },
                legend: LEGEND_STYLE,
                series: [{
                    type: 'funnel' as const,
                    left: '10%',
                    width: '80%',
                    top: 20,
                    bottom: 40,
                    data: sorted,
                    label: { position: 'inside', formatter: '{b}\n{c}' },
                }],
            };
        }

        // ── Waterfall ────────────────────────────────────────────────────────
        case 'waterfall': {
            const d = extractWaterfall(columns, rows);
            if (!d) return null;
            return {
                tooltip: { trigger: 'axis' as const },
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value' },
                series: [
                    {
                        type: 'bar' as const,
                        stack: 'waterfall',
                        data: d.placeholder,
                        itemStyle: { borderColor: 'transparent', color: 'transparent' },
                        emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
                    },
                    {
                        type: 'bar' as const,
                        name: columns.find((c, i) => {
                            const { numericCols } = detectColumnRoles(columns, rows);
                            return i === numericCols[0];
                        }) ?? 'Value',
                        stack: 'waterfall',
                        data: d.values.map((v, i) => ({
                            value: v,
                            itemStyle: { color: v >= 0 ? PALETTE[1] : PALETTE[3] },
                        })),
                        label: {
                            show: true,
                            position: 'top' as const,
                            formatter: (params: any) => {
                                const v = Number(params.value);
                                return v > 0 ? `+${v}` : `${v}`;
                            },
                        },
                    },
                ],
            };
        }

        // ── Gauge ────────────────────────────────────────────────────────────
        case 'gauge': {
            const v = extractSingleValue(columns, rows);
            if (v === null) return null;
            // Infer max: if value looks like a percentage (0-1), scale to 100
            const max = v <= 1 ? 1 : v <= 100 ? 100 : Math.ceil(v * 1.25 / 10) * 10;
            const label = columns.find((_, i) => !isNumeric(rows[0]?.[i])) ?? columns[0];
            return {
                tooltip: { formatter: '{b}: {c}' },
                series: [{
                    type: 'gauge' as const,
                    center: ['50%', '58%'],
                    radius: '75%',
                    startAngle: 200,
                    endAngle: -20,
                    min: 0,
                    max,
                    data: [{ value: v, name: String(rows[0]?.[0] ?? label) }],
                    axisLine: { lineStyle: { width: 24, color: [[0.3, '#ee6666'], [0.7, '#fac858'], [1, '#91cc75']] } },
                    pointer: { itemStyle: { color: 'auto' } },
                    detail: {
                        valueAnimation: true,
                        formatter: max <= 1 ? (val: number) => `${(val * 100).toFixed(1)}%` : '{value}',
                        fontSize: 22,
                        color: 'inherit',
                        offsetCenter: [0, '40%'],
                    },
                }],
            };
        }

        // ── Radar ────────────────────────────────────────────────────────────
        case 'radar': {
            const d = extractRadar(columns, rows);
            if (!d) return null;
            return {
                tooltip: { trigger: 'item' as const },
                radar: {
                    indicator: d.indicators,
                    center: ['50%', '52%'],
                    radius: '65%',
                },
                series: [{
                    type: 'radar' as const,
                    data: [{ value: d.values, areaStyle: { opacity: 0.25 }, itemStyle: { color: PALETTE[0] } }],
                }],
            };
        }

        // ── Sunburst ─────────────────────────────────────────────────────────
        case 'sunburst': {
            const d = extractNameValue(columns, rows);
            if (!d) return null;
            return {
                tooltip: { formatter: '{b}: {c}' },
                series: [{
                    type: 'sunburst' as const,
                    radius: ['20%', '80%'],
                    center: ['50%', '50%'],
                    data: d.map((item, i) => ({ ...item, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
                    label: { show: true, rotate: 'radial' as const, fontSize: 11 },
                }],
            };
        }

        // ── Lollipop (scatter + line stub on category axis) ──────────────────
        case 'lollipop': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            const s = d.series[0];
            return {
                tooltip: TOOLTIP_STYLE,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value' },
                series: [
                    {
                        type: 'pictorialBar' as const,
                        name: s.name,
                        data: s.data,
                        symbol: 'circle',
                        symbolSize: 14,
                        symbolOffset: [0, 0],
                        symbolPosition: 'end',
                        barWidth: 2,
                        itemStyle: { color: PALETTE[0] },
                    },
                    {
                        type: 'bar' as const,
                        name: `${s.name} bar`,
                        data: s.data,
                        barWidth: 2,
                        itemStyle: { color: PALETTE[0] },
                        tooltip: { show: false },
                    },
                ],
            };
        }

        // ── Pareto (bar + cumulative line) ───────────────────────────────────
        case 'pareto': {
            const d = extractCategorySeries(columns, rows);
            if (!d) return null;
            const raw = d.series[0]?.data ?? [];
            const total = raw.reduce((a, b) => a + b, 0) || 1;
            let running = 0;
            const cumPct = raw.map(v => { running += v; return +((running / total) * 100).toFixed(1); });
            return {
                tooltip: { trigger: 'axis' as const },
                legend: { bottom: 0 },
                grid: { ...GRID_STYLE, right: '12%' },
                xAxis: { type: 'category', data: d.categories },
                yAxis: [
                    { type: 'value', name: d.series[0]?.name },
                    { type: 'value', name: 'Cumulative %', max: 100, axisLabel: { formatter: '{value}%' }, position: 'right' },
                ],
                series: [
                    { name: d.series[0]?.name, type: 'bar' as const, data: raw, itemStyle: { color: PALETTE[0] } },
                    { name: 'Cumulative %', type: 'line' as const, yAxisIndex: 1, data: cumPct, smooth: false, symbol: 'none', lineStyle: { color: PALETTE[3] } },
                ],
            };
        }

        // ── Sankey ───────────────────────────────────────────────────────────
        case 'sankey': {
            const d = extractSankey(columns, rows);
            if (!d || d.nodes.length < 2) return null;
            return {
                tooltip: { trigger: 'item' as const, formatter: '{b}: {c}' },
                series: [{
                    type: 'sankey' as const,
                    data: d.nodes,
                    links: d.links,
                    emphasis: { focus: 'adjacency' as const },
                } as any],
            };
        }

        // ── KPI tile (handled separately in the renderer — return sentinel) ──
        case 'kpi':
        case 'table':
            return null; // caller renders KPI/table natively

        default:
            return null;
    }
}

