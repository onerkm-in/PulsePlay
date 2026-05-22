import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryResultData } from "../visualTypes";
import { GenieTable } from "./GenieTable";
import { GenieChart, ChartConfig, ChartType, analyzeColumns, defaultChartConfig } from "./GenieChart";

type ViewMode = "table" | "chart";

interface GenieDataViewProps {
    data: QueryResultData;
    sql?: string;
    showSql?: boolean;
    title?: string;
}

const CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
    { value: "bar", label: "Bar", icon: "M4 20h4V10H4zm6 0h4V4h-4zm6 0h4v-8h-4z" },
    { value: "line", label: "Line", icon: "M3 17l5-5 4 4 8-11" },
    { value: "area", label: "Area", icon: "M3 17l5-5 4 4 8-11v12H3z" },
    { value: "pie", label: "Pie", icon: "M12 2a10 10 0 1 0 10 10h-10z M21.18 8.02A10 10 0 0 0 13 2.05v8l8.18-2.03z" },
    { value: "scatter", label: "Scatter", icon: "M6 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm5-5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-3-7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" },
];

export function GenieDataView({ data, sql, showSql, title }: GenieDataViewProps): React.JSX.Element {
    const [viewMode, setViewMode] = useState<ViewMode>("table");
    const [chartConfig, setChartConfig] = useState<ChartConfig>(() => defaultChartConfig(data));
    const [showCode, setShowCode] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chartSize, setChartSize] = useState({ width: 400, height: 240 });

    const analysis = useMemo(() => analyzeColumns(data), [data]);

    useEffect(() => {
        if (!containerRef.current || viewMode !== "chart") return;
        const el = containerRef.current;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setChartSize({
                    width: Math.max(200, Math.floor(entry.contentRect.width)),
                    height: Math.max(160, Math.min(320, Math.floor(entry.contentRect.width * 0.55)))
                });
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [viewMode]);

    if (!data.columns.length || !data.rows.length) return null;

    const hasNumeric = analysis.numeric.length > 0;

    const downloadCsv = () => {
        const header = data.columns.join(",");
        const body = data.rows.map(row => row.map(cell => {
            const s = String(cell ?? "");
            return s.includes(",") ? `"${s}"` : s;
        }).join(",")).join("\n");
        const blob = new Blob([header + "\n" + body], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `genie_results_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="rx-dataview">
            {/* ── Toolbar ── */}
            <div className="rx-dv-toolbar">
                <div className="rx-dv-toolbar-left">
                    <span className="rx-dv-result-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                        Result table ({data.rows.length} row{data.rows.length !== 1 ? "s" : ""})
                    </span>
                </div>
                <div className="rx-dv-toolbar-right">
                    <button className="rx-dv-action" onClick={downloadCsv} title="Download CSV">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                    {sql && showSql && (
                        <button
                            className={`rx-dv-action rx-dv-action--text${showCode ? " rx-dv-action--active" : ""}`}
                            onClick={() => setShowCode(prev => !prev)}
                        >
                            {showCode ? "Hide code" : "Show code"}
                        </button>
                    )}
                    {hasNumeric && (
                        <>
                            <span className="rx-dv-sep" />
                            <button
                                className={`rx-dv-tab${viewMode === "table" ? " rx-dv-tab--active" : ""}`}
                                onClick={() => setViewMode("table")}
                                title="Table view"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>
                            </button>
                            <button
                                className={`rx-dv-tab${viewMode === "chart" ? " rx-dv-tab--active" : ""}`}
                                onClick={() => setViewMode("chart")}
                                title="Chart view"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="14" width="4" height="6" rx="1" /><rect x="10" y="8" width="4" height="12" rx="1" /><rect x="16" y="4" width="4" height="16" rx="1" /></svg>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── SQL Code Block ── */}
            {showCode && sql && (
                <div className="rx-dv-code">
                    <pre>{sql}</pre>
                </div>
            )}

            {/* ── Chart Type + Config Bar ── */}
            {viewMode === "chart" && (
                <div className="rx-dv-chartbar">
                    <div className="rx-dv-charttypes">
                        {CHART_TYPES.map(ct => (
                            <button
                                key={ct.value}
                                className={`rx-dv-charttype${chartConfig.type === ct.value ? " rx-dv-charttype--active" : ""}`}
                                onClick={() => setChartConfig(prev => ({ ...prev, type: ct.value }))}
                                title={ct.label}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ct.icon} /></svg>
                                <span>{ct.label}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        className={`rx-dv-action rx-dv-action--text${showConfig ? " rx-dv-action--active" : ""}`}
                        onClick={() => setShowConfig(prev => !prev)}
                        title="Edit visualization"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Configure
                    </button>
                </div>
            )}

            {/* ── Axis Config Panel ── */}
            {viewMode === "chart" && showConfig && (
                <div className="rx-dv-config">
                    <label className="rx-dv-config-field">
                        <span className="rx-dv-config-label">X Axis</span>
                        <select
                            className="rx-dv-select"
                            value={chartConfig.xColumn}
                            onChange={e => setChartConfig(prev => ({ ...prev, xColumn: parseInt(e.target.value) }))}
                        >
                            {data.columns.map((col, i) => <option key={i} value={i}>{col}</option>)}
                        </select>
                    </label>
                    <label className="rx-dv-config-field">
                        <span className="rx-dv-config-label">Y Axis</span>
                        <select
                            className="rx-dv-select"
                            value={chartConfig.yColumns[0]}
                            onChange={e => setChartConfig(prev => ({ ...prev, yColumns: [parseInt(e.target.value)] }))}
                        >
                            {data.columns.map((col, i) => <option key={i} value={i}>{col}</option>)}
                        </select>
                    </label>
                </div>
            )}

            {/* ── Content ── */}
            {viewMode === "table" ? (
                <GenieTable data={data} />
            ) : (
                <div className="rx-dv-chart" ref={containerRef}>
                    <GenieChart
                        data={data}
                        config={chartConfig}
                        width={chartSize.width}
                        height={chartSize.height}
                        title={title}
                    />
                </div>
            )}
        </div>
    );
}
