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
} from 'echarts/charts';
import {
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import React, { useEffect, useRef } from 'react';

echarts.use([
    BarChart,
    LineChart,
    PieChart,
    ScatterChart,
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    CanvasRenderer,
]);

export interface EChartsRendererProps {
    readonly option: EChartsOption;
    readonly height?: number | string;
    readonly className?: string;
}

export const EChartsRenderer: React.FC<EChartsRendererProps> = ({ option, height = 320, className }) => {
    const elRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

    // Initialize once on mount.
    useEffect(() => {
        if (!elRef.current) return;
        const instance = echarts.init(elRef.current);
        chartRef.current = instance;
        instance.setOption(option, { notMerge: true });

        const onResize = () => instance.resize();
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            instance.dispose();
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
