// playground/src/lib/vegaLiteToECharts.ts
//
// Step 5 — Minimal Vega-Lite → ECharts compiler.
//
// Scope for v1: bar / line / area / point (scatter) / arc (pie/donut) marks
// with `data.values: [...]` and a flat `encoding: { x, y, color? }` shape.
// Larger Vega-Lite features (layering, faceting, transforms, regression)
// are roadmap. The compiler exits early with a recognized-but-unsupported
// note rather than crashing when a feature is not implemented.

import type { EChartsOption } from 'echarts';
import { chartFromVegaLiteMark } from './chartRegistry';

export interface VegaLiteSpec {
    readonly mark: string | { type: string };
    readonly data?: { values?: ReadonlyArray<Record<string, unknown>> };
    readonly encoding?: {
        readonly x?: { field?: string; type?: string };
        readonly y?: { field?: string; type?: string; aggregate?: string };
        readonly color?: { field?: string; type?: string };
    };
    readonly title?: string;
}

export interface CompileResult {
    readonly ok: boolean;
    readonly option?: EChartsOption;
    readonly reason?: string;
}

function resolveMarkType(mark: VegaLiteSpec['mark']): string | undefined {
    if (typeof mark === 'string') return mark;
    if (mark && typeof mark === 'object' && 'type' in mark) {
        const t = (mark as { type: unknown }).type;
        return typeof t === 'string' ? t : undefined;
    }
    return undefined;
}

export function compileVegaLiteToECharts(spec: VegaLiteSpec): CompileResult {
    const markType = resolveMarkType(spec.mark);
    if (!markType) {
        return { ok: false, reason: 'Vega-Lite spec has no recognizable mark.' };
    }
    const registryEntry = chartFromVegaLiteMark(markType);
    if (!registryEntry) {
        return { ok: false, reason: `Mark "${markType}" is not in the chart registry.` };
    }
    if (!registryEntry.renderable || !registryEntry.echartsSeriesType) {
        return { ok: false, reason: `Mark "${markType}" maps to ${registryEntry.id}, which is not yet renderable.` };
    }

    const values = spec.data?.values ?? [];
    if (values.length === 0) {
        return { ok: false, reason: 'Vega-Lite spec has no data.values rows.' };
    }
    const xField = spec.encoding?.x?.field;
    const yField = spec.encoding?.y?.field;
    if (!xField || !yField) {
        return { ok: false, reason: 'Vega-Lite spec is missing encoding.x.field or encoding.y.field.' };
    }

    const xData = values.map((row) => stringifyDimension(row[xField]));
    const yData = values.map((row) => toNumber(row[yField]));

    const baseOption: EChartsOption = {
        title: spec.title ? { text: spec.title } : undefined,
        xAxis: { type: 'category', data: xData },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis' },
    };

    const seriesType = registryEntry.echartsSeriesType;
    if (seriesType === 'pie') {
        // Pie/donut: collapse to a [{ name, value }] dataset.
        const data = values.map((row) => ({
            name: stringifyDimension(row[xField]),
            value: toNumber(row[yField]),
        }));
        return {
            ok: true,
            option: {
                title: spec.title ? { text: spec.title } : undefined,
                tooltip: { trigger: 'item' },
                series: [{
                    type: 'pie',
                    radius: registryEntry.id === 'donut' ? ['40%', '70%'] : '70%',
                    data,
                }],
            },
        };
    }

    if (seriesType === 'line' && registryEntry.id === 'area') {
        return {
            ok: true,
            option: {
                ...baseOption,
                series: [{ type: 'line', data: yData, areaStyle: {} }],
            },
        };
    }

    return {
        ok: true,
        option: {
            ...baseOption,
            series: [{ type: seriesType, data: yData }] as EChartsOption['series'],
        },
    };
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function stringifyDimension(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return String(value);
}
