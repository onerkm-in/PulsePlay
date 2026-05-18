// playground/src/components/EChartsRenderer.tsx

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export const EChartsRenderer: React.FC<{ options: echarts.EChartsOption, style?: React.CSSProperties }> = ({ options, style }) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chartRef.current) {
            const chart = echarts.init(chartRef.current);
            chart.setOption(options);

            const resizeHandler = () => {
                chart.resize();
            };
            window.addEventListener('resize', resizeHandler);

            return () => {
                window.removeEventListener('resize', resizeHandler);
                chart.dispose();
            };
        }
    }, [options]);

    return <div ref={chartRef} style={{ width: '100%', height: '400px', ...style }} />;
};
