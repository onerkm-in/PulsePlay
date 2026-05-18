// playground/src/lib/__tests__/vegaLiteToECharts.test.ts
//
// Step 5 — Vega-Lite → ECharts compiler invariants.

import { describe, it, expect } from 'vitest';
import { compileVegaLiteToECharts, type VegaLiteSpec } from '../vegaLiteToECharts';

// ─── Mark resolution ───────────────────────────────────────────────────

describe('compileVegaLiteToECharts — mark resolution', () => {
    it('rejects spec with no recognizable mark', () => {
        const result = compileVegaLiteToECharts({ mark: '' } as VegaLiteSpec);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/recognizable mark/i);
    });

    it('rejects mark that is not in the registry', () => {
        const result = compileVegaLiteToECharts({
            mark: 'parallel-coordinates',
            data: { values: [{ x: 1, y: 1 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/not in the chart registry/);
    });

    it('accepts string mark', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            data: { values: [{ x: 'A', y: 1 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(true);
    });

    it('accepts object-shaped mark', () => {
        const result = compileVegaLiteToECharts({
            mark: { type: 'line' },
            data: { values: [{ x: 'A', y: 1 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(true);
    });
});

// ─── Data + encoding ───────────────────────────────────────────────────

describe('compileVegaLiteToECharts — data and encoding', () => {
    it('rejects empty data.values', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar', data: { values: [] }, encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/data\.values/);
    });

    it('rejects missing encoding.x.field', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar', data: { values: [{ x: 'A', y: 1 }] }, encoding: { y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/encoding\.x\.field/);
    });

    it('rejects missing encoding.y.field', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar', data: { values: [{ x: 'A', y: 1 }] }, encoding: { x: { field: 'x' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(false);
    });
});

// ─── Series shaping ────────────────────────────────────────────────────

describe('compileVegaLiteToECharts — series shaping', () => {
    it('emits xAxis category data + yAxis value + bar series for bar mark', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            data: { values: [{ x: 'Tech', y: 836154 }, { x: 'Furn', y: 741999 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect(result.ok).toBe(true);
        const opt = result.option!;
        expect((opt.xAxis as { data: string[] }).data).toEqual(['Tech', 'Furn']);
        expect((opt.xAxis as { type: string }).type).toBe('category');
        expect((opt.yAxis as { type: string }).type).toBe('value');
        const series = Array.isArray(opt.series) ? opt.series : [opt.series];
        expect((series[0] as { type: string }).type).toBe('bar');
        expect((series[0] as { data: number[] }).data).toEqual([836154, 741999]);
    });

    it('emits line series for line mark', () => {
        const result = compileVegaLiteToECharts({
            mark: 'line',
            data: { values: [{ x: 'Jan', y: 1 }, { x: 'Feb', y: 2 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { type: string }).type).toBe('line');
    });

    it('emits line series with areaStyle for area mark', () => {
        const result = compileVegaLiteToECharts({
            mark: 'area',
            data: { values: [{ x: 'Jan', y: 1 }, { x: 'Feb', y: 2 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { type: string; areaStyle?: object }).type).toBe('line');
        expect((series[0] as { type: string; areaStyle?: object }).areaStyle).toBeDefined();
    });

    it('emits scatter series for point mark', () => {
        const result = compileVegaLiteToECharts({
            mark: 'point',
            data: { values: [{ x: 1, y: 2 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { type: string }).type).toBe('scatter');
    });

    it('emits pie series for arc mark with full radius', () => {
        const result = compileVegaLiteToECharts({
            mark: 'arc',
            data: { values: [{ name: 'A', value: 1 }] },
            encoding: { x: { field: 'name' }, y: { field: 'value' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { type: string }).type).toBe('pie');
    });

    it('forwards title when provided', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            title: 'Top categories',
            data: { values: [{ x: 'A', y: 1 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect((result.option!.title as { text: string }).text).toBe('Top categories');
    });
});

// ─── Coercion ──────────────────────────────────────────────────────────

describe('compileVegaLiteToECharts — value coercion', () => {
    it('parses string-typed numeric y values', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            data: { values: [{ x: 'A', y: '42' }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { data: number[] }).data[0]).toBe(42);
    });

    it('falls back to 0 for unparseable y values', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            data: { values: [{ x: 'A', y: 'not-a-number' }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        const series = Array.isArray(result.option!.series) ? result.option!.series : [result.option!.series];
        expect((series[0] as { data: number[] }).data[0]).toBe(0);
    });

    it('renders null x dimensions as em-dash', () => {
        const result = compileVegaLiteToECharts({
            mark: 'bar',
            data: { values: [{ x: null, y: 1 }] },
            encoding: { x: { field: 'x' }, y: { field: 'y' } },
        } as VegaLiteSpec);
        expect((result.option!.xAxis as { data: string[] }).data[0]).toBe('—');
    });
});
