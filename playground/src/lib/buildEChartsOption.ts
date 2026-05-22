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

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666',
    '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
];

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
    columns.forEach((_, ci) => {
        const sample = rows.slice(0, 20).map(r => r[ci]).filter(v => v !== null && v !== undefined);
        const numericRatio = sample.filter(v => isNumeric(v)).length / (sample.length || 1);
        if (numericRatio >= 0.7) numericCols.push(ci);
        else labelCols.push(ci);
    });
    return { labelCols, numericCols };
}

/** Category labels + one or more numeric series from a standard SQL result. */
function extractCategorySeries(columns: string[], rows: unknown[][]): {
    categories: string[];
    series: { name: string; data: number[] }[];
} | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (!numericCols.length) return null;
    const labelCol = labelCols[0] ?? 0;
    const categories = rows.map(r => String(r[labelCol] ?? ''));
    const series = numericCols.map(ci => ({
        name: columns[ci],
        data: rows.map(r => toNum(r[ci])),
    }));
    return { categories, series };
}

/** Name + value pairs — for pie, donut, funnel, treemap, kpi. */
function extractNameValue(columns: string[], rows: unknown[][]): { name: string; value: number }[] | null {
    const { labelCols, numericCols } = detectColumnRoles(columns, rows);
    if (!numericCols.length) return null;
    const nameCol = labelCols[0] ?? 0;
    const valueCol = numericCols[0];
    return rows.map(r => ({ name: String(r[nameCol] ?? ''), value: toNum(r[valueCol]) }));
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

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Convert raw tabular Genie data into an ECharts option spec.
 * Returns null when the data doesn't fit the requested chart type.
 */
export function buildEChartsOption(
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
                tooltip: TOOLTIP_STYLE,
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: { ...GRID_STYLE, left: '20%' },
                xAxis: { type: 'value' },
                yAxis: { type: 'category', data: d.categories },
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'bar' as const,
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
                tooltip: TOOLTIP_STYLE,
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value' },
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'bar' as const,
                    data: s.data,
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
                tooltip: TOOLTIP_STYLE,
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value' },
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'line' as const,
                    data: s.data,
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
                tooltip: TOOLTIP_STYLE,
                legend: d.series.length > 1 ? LEGEND_STYLE : undefined,
                grid: GRID_STYLE,
                xAxis: { type: 'category', data: d.categories },
                yAxis: { type: 'value' },
                series: d.series.map((s, i) => ({
                    name: s.name,
                    type: 'line' as const,
                    data: s.data,
                    smooth: true,
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

/** Human-readable label for each chart type, for the picker UI. */
export const CHART_LABELS: Record<string, string> = {
    'kpi':          'KPI Tile',
    'table':        'Table',
    'bar':          'Bar (Horizontal)',
    'column':       'Column (Vertical)',
    'clustered-bar':'Clustered Bar',
    'line':         'Line',
    'area':         'Area',
    'scatter':      'Scatter',
    'bubble':       'Bubble',
    'pie':          'Pie',
    'donut':        'Donut',
    'heatmap':      'Heat Map',
    'treemap':      'Tree Map',
    'funnel':       'Funnel',
    'waterfall':    'Waterfall',
    'gauge':        'Gauge',
    'radar':        'Radar',
    'sunburst':     'Sunburst',
    'lollipop':     'Lollipop',
    'pareto':       'Pareto',
    'sankey':       'Sankey',
    'sparkline':    'Sparkline',
};
