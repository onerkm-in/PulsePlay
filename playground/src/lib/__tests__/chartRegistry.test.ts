// playground/src/lib/__tests__/chartRegistry.test.ts
//
// Step 5 — Chart registry invariants. Locks the tier classification +
// auto-pick policy so any future addition forces explicit reclassification.

import { describe, it, expect } from 'vitest';
import {
    CHART_REGISTRY,
    chartFromVegaLiteMark,
    chartRegistryEntry,
    chartsByTier,
    neverAutoPickIds,
    renderableCharts,
    type ChartTier,
    type ChartTypeId,
} from '../chartRegistry';

// ─── Coverage ──────────────────────────────────────────────────────────

describe('CHART_REGISTRY — coverage', () => {
    it('has at least one entry per tier', () => {
        const tiers: ChartTier[] = ['core', 'advanced', 'trendy', 'legacy', 'future'];
        for (const tier of tiers) {
            expect(chartsByTier(tier).length).toBeGreaterThan(0);
        }
    });

    it('ids are unique', () => {
        const ids = CHART_REGISTRY.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every entry is frozen', () => {
        for (const entry of CHART_REGISTRY) {
            expect(Object.isFrozen(entry)).toBe(true);
        }
    });

    it('CHART_REGISTRY itself is frozen', () => {
        expect(Object.isFrozen(CHART_REGISTRY)).toBe(true);
    });
});

// ─── Tier policy invariants ────────────────────────────────────────────

describe('CHART_REGISTRY — tier policy invariants', () => {
    it('Core tier always uses autoPick=always', () => {
        for (const entry of chartsByTier('core')) {
            expect(entry.autoPick).toBe('always');
        }
    });

    it('Advanced tier always uses autoPick=heuristic', () => {
        for (const entry of chartsByTier('advanced')) {
            expect(entry.autoPick).toBe('heuristic');
        }
    });

    it('Trendy tier always uses autoPick=opt-in (never default)', () => {
        for (const entry of chartsByTier('trendy')) {
            expect(entry.autoPick).toBe('opt-in');
        }
    });

    it('Legacy tier always uses autoPick=never-auto (support but do not pick)', () => {
        for (const entry of chartsByTier('legacy')) {
            expect(entry.autoPick).toBe('never-auto');
        }
    });

    it('Future tier always uses autoPick=roadmap', () => {
        for (const entry of chartsByTier('future')) {
            expect(entry.autoPick).toBe('roadmap');
        }
    });

    it('Future tier entries are NOT renderable today', () => {
        for (const entry of chartsByTier('future')) {
            expect(entry.renderable).toBe(false);
        }
    });

    it('ECharts-backed legacy charts (gauge, radar) are renderable; others are not', () => {
        const ECHARTS_LEGACY = new Set(['gauge', 'radar']);
        for (const entry of chartsByTier('legacy')) {
            if (ECHARTS_LEGACY.has(entry.id)) {
                expect(entry.renderable).toBe(true);
            } else {
                expect(entry.renderable).toBe(false);
            }
        }
    });
});

// ─── Lookup ────────────────────────────────────────────────────────────

describe('chartRegistryEntry', () => {
    it('finds a known id', () => {
        const bar = chartRegistryEntry('bar');
        expect(bar?.tier).toBe('core');
        expect(bar?.autoPick).toBe('always');
        expect(bar?.echartsSeriesType).toBe('bar');
    });

    it('returns undefined for an unknown id', () => {
        const made = chartRegistryEntry('not-a-real-chart' as ChartTypeId);
        expect(made).toBeUndefined();
    });
});

describe('chartFromVegaLiteMark', () => {
    it('maps "bar" to bar entry', () => {
        expect(chartFromVegaLiteMark('bar')?.id).toBe('bar');
    });

    it('maps "line" to line entry', () => {
        expect(chartFromVegaLiteMark('line')?.id).toBe('line');
    });

    it('maps "arc" to pie entry (first match wins)', () => {
        const entry = chartFromVegaLiteMark('arc');
        expect(['pie', 'donut']).toContain(entry?.id);
    });

    it('returns undefined for an unmapped mark', () => {
        expect(chartFromVegaLiteMark('parallel-coordinates')).toBeUndefined();
    });
});

describe('renderableCharts', () => {
    it('returns only entries flagged renderable', () => {
        const r = renderableCharts();
        expect(r.length).toBeGreaterThan(0);
        for (const entry of r) {
            expect(entry.renderable).toBe(true);
        }
    });

    it('includes bar, line, scatter, pie at minimum', () => {
        const ids = renderableCharts().map((c) => c.id);
        expect(ids).toContain('bar');
        expect(ids).toContain('line');
        expect(ids).toContain('scatter');
        expect(ids).toContain('pie');
    });
});

describe('neverAutoPickIds', () => {
    it('includes every legacy + trendy + future chart id', () => {
        const never = new Set(neverAutoPickIds());
        for (const tier of ['trendy', 'legacy', 'future'] as ChartTier[]) {
            for (const entry of chartsByTier(tier)) {
                expect(never.has(entry.id)).toBe(true);
            }
        }
    });

    it('excludes every core + advanced chart id', () => {
        const never = new Set(neverAutoPickIds());
        for (const tier of ['core', 'advanced'] as ChartTier[]) {
            for (const entry of chartsByTier(tier)) {
                expect(never.has(entry.id)).toBe(false);
            }
        }
    });
});
