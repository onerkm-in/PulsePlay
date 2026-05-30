import * as React from "react";
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { QueryResultData } from "../visualTypes";

export type ChartType = "bar" | "line" | "area" | "pie" | "scatter";

export interface ChartConfig {
    type: ChartType;
    xColumn: number;
    yColumns: number[];
}

interface GenieChartProps {
    data: QueryResultData;
    config: ChartConfig;
    width: number;
    height: number;
    title?: string;
}

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];

export function GenieChart({ data, config, width, height, title }: GenieChartProps): React.JSX.Element {
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Reserve space for chart title
    const titleHeight = title ? 24 : 0;
    const chartHeight = height + titleHeight;

    useEffect(() => {
        if (!svgRef.current || !data.rows.length) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        // Render title if provided
        if (title) {
            svg.append("text")
                .attr("x", width / 2)
                .attr("y", 16)
                .attr("text-anchor", "middle")
                .attr("fill", "currentColor")
                .attr("font-size", "13px")
                .attr("font-weight", "600")
                .text(title);
        }

        if (config.type === "pie") {
            renderPie(svg, data, config, width, height, titleHeight);
        } else if (config.type === "scatter") {
            renderScatter(svg, data, config, width, height, titleHeight);
        } else {
            renderCartesian(svg, data, config, width, height, titleHeight);
        }
    }, [data, config, width, height, title, titleHeight]);

    return <svg ref={svgRef} width={width} height={chartHeight} style={{ display: "block" }} />;
}

function renderCartesian(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    data: QueryResultData,
    config: ChartConfig,
    width: number,
    height: number,
    offsetY: number
): void {
    const margin = { top: 16 + offsetY, right: 16, bottom: 52, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - (margin.top - offsetY) - margin.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const labels = data.rows.map(r => String(r[config.xColumn] ?? ""));
    const allValues: number[] = [];
    config.yColumns.forEach(col => {
        data.rows.forEach(r => {
            const v = parseFloat(r[col]);
            if (!isNaN(v)) allValues.push(v);
        });
    });

    const yMin = Math.min(0, d3.min(allValues) ?? 0);
    const yMax = d3.max(allValues) ?? 1;

    const x = d3.scaleBand().domain(labels).range([0, innerW]).padding(0.25);
    const y = d3.scaleLinear().domain([yMin, yMax * 1.1]).nice().range([innerH, 0]);

    // Grid lines
    g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
        .call(sel => sel.select(".domain").remove())
        .call(sel => sel.selectAll("line").attr("stroke", "currentColor").attr("stroke-opacity", 0.08));

    // X axis
    g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .call(sel => sel.select(".domain").attr("stroke", "currentColor").attr("stroke-opacity", 0.15))
        .selectAll("text")
        .attr("fill", "currentColor")
        .attr("font-size", "10px")
        .attr("dy", "0.7em")
        .each(function () {
            const el = d3.select(this);
            const text = el.text();
            if (text.length > 12) el.text(text.slice(0, 11) + "\u2026");
        });

    // X axis label
    svg.append("text")
        .attr("x", margin.left + innerW / 2)
        .attr("y", margin.top + innerH + 44)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text(data.columns[config.xColumn] ?? "");

    // Y axis
    g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
        .call(sel => sel.select(".domain").remove())
        .selectAll("text")
        .attr("fill", "currentColor")
        .attr("font-size", "10px");

    // Y axis label
    svg.append("text")
        .attr("transform", `rotate(-90)`)
        .attr("x", -(margin.top + innerH / 2))
        .attr("y", 14)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text(data.columns[config.yColumns[0]] ?? "");

    config.yColumns.forEach((col, seriesIdx) => {
        const color = COLORS[seriesIdx % COLORS.length];
        const values = data.rows.map(r => {
            const v = parseFloat(r[col]);
            return isNaN(v) ? 0 : v;
        });

        if (config.type === "bar") {
            const barWidth = x.bandwidth() / config.yColumns.length;
            g.selectAll(`.bar-${seriesIdx}`)
                .data(values)
                .enter()
                .append("rect")
                .attr("x", (_, i) => (x(labels[i]) ?? 0) + seriesIdx * barWidth)
                .attr("y", d => y(Math.max(0, d)))
                .attr("width", barWidth)
                .attr("height", d => Math.abs(y(d) - y(0)))
                .attr("fill", color)
                .attr("rx", 2);
        } else if (config.type === "line" || config.type === "area") {
            const line = d3.line<number>()
                .x((_, i) => (x(labels[i]) ?? 0) + x.bandwidth() / 2)
                .y(d => y(d));

            if (config.type === "area") {
                const area = d3.area<number>()
                    .x((_, i) => (x(labels[i]) ?? 0) + x.bandwidth() / 2)
                    .y0(y(0))
                    .y1(d => y(d));
                g.append("path")
                    .datum(values)
                    .attr("d", area)
                    .attr("fill", color)
                    .attr("fill-opacity", 0.15);
            }

            g.append("path")
                .datum(values)
                .attr("d", line)
                .attr("fill", "none")
                .attr("stroke", color)
                .attr("stroke-width", 2);

            g.selectAll(`.dot-${seriesIdx}`)
                .data(values)
                .enter()
                .append("circle")
                .attr("cx", (_, i) => (x(labels[i]) ?? 0) + x.bandwidth() / 2)
                .attr("cy", d => y(d))
                .attr("r", 3)
                .attr("fill", color);
        }
    });
}

function renderScatter(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    data: QueryResultData,
    config: ChartConfig,
    width: number,
    height: number,
    offsetY: number
): void {
    const margin = { top: 16 + offsetY, right: 16, bottom: 52, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - (margin.top - offsetY) - margin.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xValues = data.rows.map(r => parseFloat(r[config.xColumn])).filter(v => !isNaN(v));
    const yCol = config.yColumns[0];
    const yValues = data.rows.map(r => parseFloat(r[yCol])).filter(v => !isNaN(v));

    const xExtent = [d3.min(xValues) ?? 0, d3.max(xValues) ?? 1];
    const yExtent = [d3.min(yValues) ?? 0, d3.max(yValues) ?? 1];

    const x = d3.scaleLinear().domain(xExtent).nice().range([0, innerW]);
    const y = d3.scaleLinear().domain(yExtent).nice().range([innerH, 0]);

    // Grid
    g.append("g")
        .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ""))
        .call(sel => sel.select(".domain").remove())
        .call(sel => sel.selectAll("line").attr("stroke", "currentColor").attr("stroke-opacity", 0.08));

    // X axis
    g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("~s")))
        .call(sel => sel.select(".domain").attr("stroke", "currentColor").attr("stroke-opacity", 0.15))
        .selectAll("text")
        .attr("fill", "currentColor")
        .attr("font-size", "10px");

    // Y axis
    g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")))
        .call(sel => sel.select(".domain").remove())
        .selectAll("text")
        .attr("fill", "currentColor")
        .attr("font-size", "10px");

    // X axis label
    svg.append("text")
        .attr("x", margin.left + innerW / 2)
        .attr("y", margin.top + innerH + 44)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text(data.columns[config.xColumn] ?? "");

    // Y axis label
    svg.append("text")
        .attr("transform", `rotate(-90)`)
        .attr("x", -(margin.top + innerH / 2))
        .attr("y", 14)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .text(data.columns[yCol] ?? "");

    // Points
    const points = data.rows.map(r => ({
        x: parseFloat(r[config.xColumn]),
        y: parseFloat(r[yCol])
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));

    g.selectAll("circle")
        .data(points)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.x))
        .attr("cy", d => y(d.y))
        .attr("r", 4)
        .attr("fill", COLORS[0])
        .attr("fill-opacity", 0.7)
        .attr("stroke", COLORS[0])
        .attr("stroke-width", 1);
}

function renderPie(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    data: QueryResultData,
    config: ChartConfig,
    width: number,
    height: number,
    offsetY: number
): void {
    const radius = Math.min(width, height) / 2 - 24;
    if (radius <= 0) return;

    const g = svg.append("g").attr("transform", `translate(${width / 2},${offsetY + height / 2})`);
    const yCol = config.yColumns[0];

    const slices = data.rows.map((r, i) => ({
        label: String(r[config.xColumn] ?? `Row ${i}`),
        value: Math.abs(parseFloat(r[yCol]) || 0)
    })).filter(d => d.value > 0);

    const pie = d3.pie<typeof slices[0]>().value(d => d.value).sort(null);
    const arc = d3.arc<d3.PieArcDatum<typeof slices[0]>>().innerRadius(radius * 0.4).outerRadius(radius);

    g.selectAll("path")
        .data(pie(slices))
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", (_, i) => COLORS[i % COLORS.length])
        .attr("stroke", "var(--color-surface)")
        .attr("stroke-width", 2);

    // Labels
    const labelArc = d3.arc<d3.PieArcDatum<typeof slices[0]>>().innerRadius(radius * 0.75).outerRadius(radius * 0.75);
    g.selectAll("text")
        .data(pie(slices))
        .enter()
        .append("text")
        .attr("transform", d => `translate(${labelArc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "10px")
        .text(d => d.data.label.length > 10 ? d.data.label.slice(0, 9) + "\u2026" : d.data.label);
}

/** Detect which columns are numeric vs categorical */
export function analyzeColumns(data: QueryResultData): { numeric: number[]; categorical: number[] } {
    const numeric: number[] = [];
    const categorical: number[] = [];

    data.columns.forEach((_, colIdx) => {
        const sample = data.rows.slice(0, 20);
        const numericCount = sample.filter(r => {
            const v = r[colIdx];
            return v !== null && v !== "" && !isNaN(Number(v));
        }).length;
        if (numericCount > sample.length * 0.7) {
            numeric.push(colIdx);
        } else {
            categorical.push(colIdx);
        }
    });

    return { numeric, categorical };
}

/** Pick sensible defaults for chart config */
export function defaultChartConfig(data: QueryResultData): ChartConfig {
    const { numeric, categorical } = analyzeColumns(data);
    return {
        type: "bar",
        xColumn: categorical.length > 0 ? categorical[0] : 0,
        yColumns: numeric.length > 0 ? [numeric[0]] : [data.columns.length > 1 ? 1 : 0]
    };
}
