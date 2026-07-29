// playground/src/components/workbench/EChartsRenderer.tsx
//
// Step 5 — React wrapper around the ECharts modular core build.
//
// Uses echarts/core + per-chart-type registers so the bundle only pulls in
// the renderers we actually surface. Adding a new chart type means:
//   1. Add it to chartRegistry.ts with renderable=true.
//   2. Register the matching ECharts module in the import block below.
//   3. Add a focused test in EChartsRenderer.test.tsx (mounted snapshot).

import * as echarts from 'echarts/core';
import {
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    HeatmapChart,
    TreemapChart,
    FunnelChart,
    GaugeChart,
    RadarChart,
    SunburstChart,
    SankeyChart,
    PictorialBarChart,
} from 'echarts/charts';
import {
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    VisualMapComponent,
    DataZoomComponent,
    MarkLineComponent,
    MarkPointComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import React, { useEffect, useRef } from 'react';

echarts.use([
    // Charts
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    HeatmapChart,
    TreemapChart,
    FunnelChart,
    GaugeChart,
    RadarChart,
    SunburstChart,
    SankeyChart,
    PictorialBarChart,
    // Components
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    VisualMapComponent,
    DataZoomComponent,
    MarkLineComponent,
    MarkPointComponent,
    CanvasRenderer,
]);

export interface EChartsRendererProps {
    readonly option: EChartsOption;
    readonly height?: number | string;
    readonly className?: string;
}

/**
 * When a chart may start drawing.
 *
 * A Dashboard of pinned tiles mounts every renderer in one React commit, so
 * every `echarts.init` + `setOption` ran in the same frame — the canvas paid
 * full layout cost for tiles nobody had scrolled to yet, and the main thread
 * stalled proportionally to tile count.
 *
 * Two policies, both deliberately conservative:
 *   1. VIEWPORT-GATED — a chart initialises when its host is near the viewport,
 *      so off-screen tiles cost nothing until they are wanted.
 *   2. ONE PER FRAME — charts that become visible together still initialise one
 *      at a time, so a screenful of tiles cannot block interaction.
 *
 * Where `IntersectionObserver` is absent (jsdom, older browsers) the renderer
 * initialises IMMEDIATELY, exactly as before. That keeps the fallback path
 * identical to the behaviour every existing test pins, rather than making tests
 * depend on scheduling.
 */
const chartInitQueue: Array<() => void> = [];
let drainingChartInits = false;

function drainChartInits(): void {
    const next = chartInitQueue.shift();
    if (next) next();
    if (chartInitQueue.length > 0) {
        requestAnimationFrame(drainChartInits);
    } else {
        drainingChartInits = false;
    }
}

/** Run chart initialisation one per animation frame. Exported for tests. */
export function scheduleChartInit(run: () => void): void {
    if (typeof requestAnimationFrame === "undefined") { run(); return; }
    chartInitQueue.push(run);
    if (!drainingChartInits) {
        drainingChartInits = true;
        requestAnimationFrame(drainChartInits);
    }
}

export const EChartsRenderer: React.FC<EChartsRendererProps> = ({ option, height = 320, className }) => {
    const elRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

    // The latest option, so a chart that initialises LATER (viewport-gated)
    // draws current data rather than whatever was current at mount.
    const optionRef = useRef(option);
    optionRef.current = option;

    // Initialize once, when this chart is actually wanted. See the policy note
    // above chartInitQueue for why this is gated rather than immediate.
    useEffect(() => {
        const host = elRef.current;
        if (!host) return;

        let cancelled = false;
        let ro: ResizeObserver | null = null;
        let io: IntersectionObserver | null = null;
        const onResize = () => chartRef.current?.resize();

        const startChart = () => {
            if (cancelled || chartRef.current || !elRef.current) return;
            const instance = echarts.init(elRef.current);
            chartRef.current = instance;
            instance.setOption(optionRef.current, { notMerge: true });

            window.addEventListener('resize', onResize);
            // Container-aware re-layout: a window-resize listener alone misses the
            // cases the responsive brief cares about — a side/nav/settings panel
            // opening, focus mode, or a viewport-relative (vh/clamp) height
            // recomputing — where the host box changes but the window doesn't.
            // Observe the host directly so ECharts re-fits to its actual box.
            if (typeof ResizeObserver !== 'undefined') {
                ro = new ResizeObserver(() => instance.resize());
                ro.observe(elRef.current);
            }
        };

        if (typeof IntersectionObserver === 'undefined') {
            // Fallback path — identical to the pre-gating behaviour.
            startChart();
        } else {
            io = new IntersectionObserver(entries => {
                if (!entries.some(e => e.isIntersecting)) return;
                io?.disconnect();
                io = null;
                scheduleChartInit(startChart);
            }, {
                // Start just before the tile scrolls in, so arriving at a chart
                // feels instant while distant tiles still cost nothing.
                rootMargin: '200px',
            });
            io.observe(host);
        }

        return () => {
            cancelled = true;
            io?.disconnect();
            window.removeEventListener('resize', onResize);
            ro?.disconnect();
            chartRef.current?.dispose();
            chartRef.current = null;
        };
        // Intentionally only on mount — option updates handled below via
        // setOption rather than re-init.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply option changes incrementally without disposing the chart.
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.setOption(option, { notMerge: true });
        }
    }, [option]);

    return (
        <div
            ref={elRef}
            className={`workbench-echarts-host${className ? ` ${className}` : ''}`}
            data-testid="echarts-host"
            style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
        />
    );
};
