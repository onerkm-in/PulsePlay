// playground/src/biPanel/lakeview/lakeviewToECharts.ts
//
// Map a normalized Lakeview widget plus its result rows to an ECharts option.
//
// ECharts is already this project's renderer (bi-adapters/native), and the
// widget vocabulary Databricks uses - bar, line, pie, counter, table - is
// exactly what it covers, so this adds no new dependency.
//
// Design rules, both learned the hard way this cycle:
//  1. Never invent. If a channel the chart needs is missing, or a field is not
//     in the result columns, return null and let the host fall back to the
//     iframe. A chart drawn from guessed encodings looks authoritative and is
//     wrong, which is strictly worse than a visible fallback.
//  2. Respect the author's colour mappings. A Databricks author who pinned
//     "In progress" to a specific colour did it deliberately.

import type { LakeviewEncoding, NormalizedWidget } from "./dashboardSpec";

/** Result of executing a dataset's SQL: column names plus positional rows. */
export interface WidgetData {
    columns: string[];
    rows: unknown[][];
}

/** Minimal structural type - avoids importing echarts types into this pure module. */
export type EChartsOption = Record<string, unknown>;

function columnIndex(data: WidgetData, field: string | undefined): number {
    if (!field) return -1;
    const exact = data.columns.indexOf(field);
    if (exact >= 0) return exact;
    // Aggregate fields arrive as "count(*)" / "count(ticket_id)" and temporal
    // ones as "monthly(created_time)". Match case-insensitively, then fall back
    // to the inner identifier so a relabelled column still binds.
    const lower = field.toLowerCase();
    const ci = data.columns.findIndex(c => c.toLowerCase() === lower);
    if (ci >= 0) return ci;
    const inner = /\(([^)]+)\)/.exec(field)?.[1]?.trim();
    if (inner) {
        const ii = data.columns.findIndex(c => c.toLowerCase() === inner.toLowerCase());
        if (ii >= 0) return ii;
    }
    return -1;
}

function toNumber(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const n = Number(v.replace(/[$,\s%]/g, ""));
    return Number.isFinite(n) ? n : null;
}

function label(enc: LakeviewEncoding | undefined): string {
    return enc?.displayName || enc?.fieldName || "";
}

function colorMap(enc: LakeviewEncoding | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of enc?.scale?.mappings || []) {
        if (m?.value && m?.color) out[m.value] = m.color;
    }
    return out;
}

/** Group rows into one series per distinct colour value. */
function splitSeries(data: WidgetData, xi: number, yi: number, ci: number) {
    if (ci < 0) {
        return [{ name: "", points: data.rows.map(r => [r[xi], toNumber(r[yi])] as [unknown, number | null]) }];
    }
    const bucket = new Map<string, Array<[unknown, number | null]>>();
    for (const r of data.rows) {
        const key = String(r[ci] ?? "");
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push([r[xi], toNumber(r[yi])]);
    }
    return [...bucket.entries()].map(([name, points]) => ({ name, points }));
}

/**
 * Build an ECharts option for a widget, or null when it cannot be drawn
 * faithfully. Null is a routing signal, not an error: the host renders the
 * iframe fallback for that widget.
 */
export function widgetToEChartsOption(widget: NormalizedWidget, data: WidgetData | null): EChartsOption | null {
    if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;

    if (widget.render === "counter") {
        const enc = widget.encodings.value;
        const idx = columnIndex(data, enc?.fieldName);
        if (idx < 0 || data.rows.length === 0) return null;
        const value = toNumber(data.rows[0][idx]);
        if (value === null) return null;
        return {
            __pulseplayCounter: { label: label(enc) || widget.title, value },
            series: [],
        };
    }

    if (widget.render === "chart") {
        const { x, y, color, angle } = widget.encodings;

        if (widget.kind === "pie") {
            const ai = columnIndex(data, angle?.fieldName);
            const ci = columnIndex(data, color?.fieldName);
            if (ai < 0 || ci < 0) return null;
            const map = colorMap(color);
            return {
                tooltip: { trigger: "item" },
                legend: { type: "scroll" },
                series: [{
                    type: "pie",
                    name: label(angle),
                    radius: ["45%", "70%"],
                    data: data.rows.map(r => {
                        const name = String(r[ci] ?? "");
                        const item: Record<string, unknown> = { name, value: toNumber(r[ai]) ?? 0 };
                        if (map[name]) item.itemStyle = { color: map[name] };
                        return item;
                    }),
                }],
            };
        }

        const xi = columnIndex(data, x?.fieldName);
        const yi = columnIndex(data, y?.fieldName);
        if (xi < 0 || yi < 0) return null;
        const ci = columnIndex(data, color?.fieldName);
        const map = colorMap(color);
        const series = splitSeries(data, xi, yi, ci);
        const temporal = x?.scale?.type === "temporal";
        const seriesType = widget.kind === "area" ? "line" : (widget.kind === "scatter" ? "scatter" : widget.kind);

        return {
            tooltip: { trigger: "axis" },
            legend: series.length > 1 ? { type: "scroll" } : undefined,
            xAxis: {
                type: temporal ? "time" : "category",
                name: label(x),
                data: temporal ? undefined : [...new Set(data.rows.map(r => String(r[xi] ?? "")))],
            },
            yAxis: { type: "value", name: label(y) },
            series: series.map(s => ({
                type: seriesType,
                name: s.name || label(y),
                stack: widget.kind === "area" ? "total" : undefined,
                areaStyle: widget.kind === "area" ? {} : undefined,
                itemStyle: s.name && map[s.name] ? { color: map[s.name] } : undefined,
                data: temporal ? s.points.map(([xv, yv]) => [xv, yv]) : s.points.map(([, yv]) => yv),
            })),
        };
    }

    return null;
}

/** Columns a table widget should show, in author order, minus hidden ones. */
export function tableColumns(widget: NormalizedWidget, data: WidgetData | null): string[] {
    if (!data) return [];
    const cols = widget.encodings.columns as unknown as Array<{ fieldName?: string }> | undefined;
    if (!Array.isArray(cols) || cols.length === 0) return data.columns.slice();
    const wanted = cols.map(c => c?.fieldName).filter((f): f is string => !!f);
    const present = wanted.filter(f => columnIndex(data, f) >= 0);
    return present.length ? present : data.columns.slice();
}
