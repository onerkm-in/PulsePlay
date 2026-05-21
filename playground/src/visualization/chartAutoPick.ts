// playground/src/visualization/chartAutoPick.ts
//
// G2 - portable chart auto-pick policy. Pure TypeScript: no DOM, no React,
// no browser APIs, no ECharts imports, no proxy calls.
//
// This module intentionally preserves the Pulse-ported chart recommendation
// behavior while moving it behind a host-independent contract. PulsePlay,
// native BI, and Pulse PBI can now share one policy for "given rows/schema,
// which chart should we try first?"

export type ChartKind =
    | "bar" | "column" | "clustered-bar" | "line" | "area" | "sparkline"
    | "scatter" | "bubble"
    | "pie" | "donut"
    | "heatmap" | "treemap" | "funnel" | "waterfall" | "kpi"
    | "gauge" | "radar" | "sunburst"
    | "lollipop" | "pareto" | "sankey";

export interface ChartSeriesPoint {
    readonly label: string;
    readonly value: number;
    readonly tooltipParts?: ReadonlyArray<{ readonly col: string; readonly val: string }>;
}

export interface ClusteredSeriesPoint {
    readonly label: string;
    readonly values: ReadonlyArray<{ readonly name: string; readonly value: number }>;
}

export interface DataShape {
    readonly series: ReadonlyArray<ChartSeriesPoint>;
    readonly clustered: ReadonlyArray<ClusteredSeriesPoint>;
    readonly numericColCount: number;
    readonly rowCount: number;
    readonly recommended: ChartKind;
}

export interface AnalyzeDataShapeOptions {
    readonly formatNumber?: (value: number) => string;
}

export const CHART_OPTIONS: ReadonlyArray<{ readonly value: ChartKind; readonly label: string; readonly supported: boolean; readonly group: string }> = Object.freeze([
    { value: "kpi",           label: "KPI Tile",           supported: true, group: "Core" },
    { value: "column",        label: "Column (Vertical)",  supported: true, group: "Core" },
    { value: "bar",           label: "Bar (Horizontal)",   supported: true, group: "Core" },
    { value: "clustered-bar", label: "Clustered Bar",      supported: true, group: "Core" },
    { value: "line",          label: "Line",               supported: true, group: "Core" },
    { value: "area",          label: "Area",               supported: true, group: "Core" },
    { value: "pie",           label: "Pie",                supported: true, group: "Core" },
    { value: "donut",         label: "Donut",              supported: true, group: "Core" },
    { value: "scatter",       label: "Scatter",            supported: true, group: "Core" },
    { value: "bubble",        label: "Bubble",             supported: true, group: "Core" },
    { value: "heatmap",       label: "Heat Map",           supported: true, group: "Core" },
    { value: "treemap",       label: "Tree Map",           supported: true, group: "Core" },
    { value: "funnel",        label: "Funnel",             supported: true, group: "Core" },
    { value: "waterfall",     label: "Waterfall",          supported: true, group: "Core" },
    { value: "pareto",        label: "Pareto",             supported: true, group: "Advanced" },
    { value: "lollipop",      label: "Lollipop",           supported: true, group: "Advanced" },
    { value: "sparkline",     label: "Sparkline",          supported: true, group: "Advanced" },
    { value: "sankey",        label: "Sankey Flow",        supported: true, group: "Advanced" },
    { value: "radar",         label: "Radar / Spider",     supported: true, group: "Shaped" },
    { value: "gauge",         label: "Gauge",              supported: true, group: "Shaped" },
    { value: "sunburst",      label: "Sunburst",           supported: true, group: "Shaped" },
]);

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;
const SHORT_MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

export function isNumericString(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (trimmed === "") return false;
    return !Number.isNaN(Number(trimmed)) && Number.isFinite(Number(trimmed));
}

function defaultFormatNumber(value: number): string {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return new Intl.NumberFormat("en-US").format(value);
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatChartDate(raw: string): string {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatCellForTooltip(col: string, raw: unknown, options: AnalyzeDataShapeOptions = {}): string {
    const formatNumber = options.formatNumber ?? defaultFormatNumber;
    if (raw === null || raw === undefined) return "-";
    if (typeof raw === "string" && ISO_DATE_RE.test(raw)) return formatChartDate(raw);
    if (typeof raw === "number") return formatNumber(raw);
    if (isNumericString(raw)) return formatNumber(Number(raw));
    return String(raw);
}

/**
 * Detects whether a column is a rank/index/row-number column that should be
 * excluded from chart auto-recommendation.
 */
export function isRankOrIndexColumn(colName: string, values: ReadonlyArray<number>): boolean {
    if (/\b(rank|index|row[\s_]?num(ber)?|row[\s_]?id|rn|seq(uence)?)\b/i.test(colName || "")) {
        return true;
    }
    if (/^id$/i.test((colName || "").trim())) return true;
    if (values.length >= 3) {
        const allOneBased = values.every((v, i) => v === i + 1);
        const allZeroBased = values.every((v, i) => v === i);
        if (allOneBased || allZeroBased) return true;
    }
    return false;
}

export type ForcedViewMode = "chart" | "table" | "narrative" | "sql";

export interface ViewIntent {
    readonly viewMode?: ForcedViewMode;
    readonly chartType?: ChartKind;
}

export function detectViewIntent(question: string | null | undefined): ViewIntent {
    const q = String(question || "").toLowerCase();
    if (!q) return {};

    if (/\b(?:as|in)\s+(?:a\s+)?table\b|\bshow\s+(?:me\s+)?(?:a\s+)?table\b|\btabular\b/.test(q)) {
        return { viewMode: "table" };
    }
    if (/\bshow\s+(?:me\s+)?(?:the\s+)?sql\b|\b(?:as|in)\s+sql\b|\b(?:underlying|generated)\s+sql\b/.test(q)) {
        return { viewMode: "sql" };
    }
    if (/\b(?:donut|doughnut|pie)(?:\s*(?:chart|graph))?\b/.test(q)) {
        return { viewMode: "chart", chartType: "donut" };
    }
    if (/\b(?:clustered|grouped|side[-\s]?by[-\s]?side)\s+bar\b/.test(q)) {
        return { viewMode: "chart", chartType: "clustered-bar" };
    }
    if (/\bbar(?:\s*(?:chart|graph))?\b/.test(q)) {
        return { viewMode: "chart", chartType: "bar" };
    }
    if (/\bline(?:\s*(?:chart|graph))?\b|\btrend(?:line)?\b/.test(q)) {
        return { viewMode: "chart", chartType: "line" };
    }
    if (/\barea(?:\s*(?:chart|graph))?\b/.test(q)) {
        return { viewMode: "chart", chartType: "area" };
    }
    if (/\bvisuali[sz]e\b|\b(?:show\s+(?:me\s+)?)?(?:as\s+a\s+|in\s+a\s+)?chart\b|\bgraph\s+it\b|\bplot\s+it\b/.test(q)) {
        return { viewMode: "chart" };
    }

    return {};
}

export function analyzeDataShape(columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>, options: AnalyzeDataShapeOptions = {}): DataShape {
    if (!columns.length || !rows.length) {
        return { series: [], clustered: [], numericColCount: 0, rowCount: 0, recommended: "bar" };
    }

    const firstRow = rows[0] ?? [];
    const numericIndices: number[] = [];
    const labelIndices: number[] = [];
    firstRow.forEach((cell, i) => {
        if (typeof cell === "number" || isNumericString(cell)) numericIndices.push(i);
        else labelIndices.push(i);
    });

    const meaningfulNumeric = numericIndices.filter(ni => {
        const colName = columns[ni] ?? "";
        const vals = rows.map(r => Number(r[ni] ?? 0));
        return !isRankOrIndexColumn(colName, vals);
    });

    const buildLabel = (row: ReadonlyArray<unknown>, index: number): string => {
        if (labelIndices.length === 0) return `Row ${index + 1}`;
        const parts = labelIndices
            .map(li => {
                const raw = String(row[li] ?? "");
                return ISO_DATE_RE.test(raw) ? formatChartDate(raw) : raw;
            })
            .filter(Boolean);
        return parts.join(", ") || `Row ${index + 1}`;
    };

    const buildTooltipParts = (row: ReadonlyArray<unknown>): ReadonlyArray<{ col: string; val: string }> =>
        columns.map((col, ci) => ({ col, val: formatCellForTooltip(col, row[ci], options) }));

    const rowCount = rows.length;
    const numericColCount = meaningfulNumeric.length;

    if (numericColCount >= 2) {
        const clustered: ClusteredSeriesPoint[] = rows.slice(0, 12).map((row, ri) => ({
            label: buildLabel(row, ri),
            values: meaningfulNumeric.map(ni => ({
                name: columns[ni] ?? `Series ${ni}`,
                value: Number(row[ni] ?? 0),
            })),
        }));

        const primaryIdx = meaningfulNumeric[0];
        const flatSeries: ChartSeriesPoint[] = rows.slice(0, 12).map((row, ri) => ({
            label: buildLabel(row, ri),
            value: Number(row[primaryIdx] ?? 0),
            tooltipParts: buildTooltipParts(row),
        }));

        return { series: flatSeries, clustered, numericColCount, rowCount, recommended: "clustered-bar" };
    }

    const primaryNumIdx = meaningfulNumeric[0] ?? numericIndices[0];
    if (primaryNumIdx === undefined) {
        return { series: [], clustered: [], numericColCount: 0, rowCount, recommended: "bar" };
    }

    const series: ChartSeriesPoint[] = rows.slice(0, 12).map((row, ri) => ({
        label: buildLabel(row, ri),
        value: Number(row[primaryNumIdx] ?? 0),
        tooltipParts: buildTooltipParts(row),
    }));

    let recommended: ChartKind = "bar";
    if (rowCount >= 6) recommended = "line";
    if (rowCount >= 3 && rowCount <= 6 && series.every(p => p.value >= 0)) recommended = "donut";

    return { series, clustered: [], numericColCount, rowCount, recommended };
}

export interface ChartAutoPickResult {
    readonly chartType: ChartKind;
    readonly reason: string;
    readonly dataShape: DataShape;
}

export function chartAutoPick(columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>, options: AnalyzeDataShapeOptions = {}): ChartAutoPickResult {
    const dataShape = analyzeDataShape(columns, rows, options);
    return {
        chartType: dataShape.recommended,
        reason: dataShape.numericColCount >= 2
            ? "multiple-numeric-series"
            : dataShape.rowCount >= 6
                ? "many-rows-trend"
                : dataShape.rowCount >= 3
                    ? "small-positive-category-share"
                    : dataShape.numericColCount > 0
                        ? "single-numeric-series"
                        : "no-numeric-series",
        dataShape,
    };
}
