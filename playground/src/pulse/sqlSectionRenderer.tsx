// Wave 35 Phase 3 — Custom SQL section renderer.
//
// Renders the result of a Custom SQL Authoring Mode section — KPI big-number
// tile, table, or chart variant — based on the author's selected
// `resultRender` and `format` config from settings. Receives the rows +
// columns already executed (the visual pre-fetched them via the proxy
// /sql/preview route or the equivalent direct-mode helper). NEVER calls the
// network itself: rendering is pure given the data + format inputs.
//
// Design contract:
//   - Pure presentation. No setState side effects, no hooks beyond
//     useMemo for cheap caching.
//   - KPI variant: takes the FIRST scalar column of the FIRST row as the
//     "big number". When `format.showPriorPeriodDelta` is true and the
//     SELECT yields at least 2 numeric columns or 2 rows, derives a
//     prior value + delta arrow.
//   - Table variant: thin wrapper. We don't reuse the visual.tsx
//     GenieTable component directly to avoid creating an import cycle —
//     the visual.tsx renderer is huge — but we mirror its column/row
//     contract so callers can swap without behaviour drift.
//   - Chart variant: stub picker (bar-by-default). The full GenieChart
//     suite from visual.tsx is too heavy to inline; this renderer falls
//     back to a Table variant when no obvious chart shape is detectable
//     and surfaces a "Switch to chart in Setup" hint otherwise.

import * as React from "react";
import type { SqlSection } from "./sqlSection";

export interface SqlSectionResult {
    columns: string[];
    rows: unknown[][];
    truncated?: boolean;
    totalRowCount?: number;
    error?: string;
    executionTimeMs?: number;
}

export interface SqlSectionRendererProps {
    section: SqlSection;
    result: SqlSectionResult | null;
    /** When true, the renderer shows the loading skeleton instead of data. */
    loading?: boolean;
    /** When non-empty, displaces the result with a friendly error card. */
    error?: string | null;
    /** Optional locale for number formatting (defaults to system). Wave 29 i18n. */
    locale?: string;
}

/** Format a numeric value per the author's `format.numberStyle`. */
export function formatNumber(value: unknown, style: SqlSection["format"] | undefined, locale?: string): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    const ns = style?.numberStyle;
    try {
        if (ns === "currency") {
            return new Intl.NumberFormat(locale, {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2
            }).format(n);
        }
        if (ns === "percent") {
            // Author convention: values already in percent units (e.g. 4.2 = 4.2%).
            return new Intl.NumberFormat(locale, {
                style: "percent",
                minimumFractionDigits: 1,
                maximumFractionDigits: 2
            }).format(n / 100);
        }
        if (ns === "compact") {
            return new Intl.NumberFormat(locale, {
                notation: "compact",
                maximumFractionDigits: 2
            }).format(n);
        }
        return new Intl.NumberFormat(locale).format(n);
    } catch {
        return String(value);
    }
}

/** Compute a prior-period delta when `showPriorPeriodDelta` is true. */
export function computeKpiDelta(
    rows: unknown[][],
    columns: string[]
): { delta: number | null; deltaPct: number | null; direction: "up" | "down" | "flat" | null; prior: unknown } {
    if (!rows || rows.length === 0 || !columns || columns.length === 0) {
        return { delta: null, deltaPct: null, direction: null, prior: null };
    }
    // Two patterns supported:
    //  Pattern A: 1 row, 2+ numeric columns (current, prior).
    //  Pattern B: 2+ rows, 1 numeric column (row 0 = current, row 1 = prior).
    const firstRow = rows[0] || [];
    const numericIdxs: number[] = [];
    for (let i = 0; i < columns.length; i++) {
        if (typeof firstRow[i] === "number" && Number.isFinite(firstRow[i] as number)) {
            numericIdxs.push(i);
        }
    }
    let current: number | null = null;
    let prior: number | null = null;
    if (numericIdxs.length >= 2) {
        current = firstRow[numericIdxs[0]] as number;
        prior = firstRow[numericIdxs[1]] as number;
    } else if (rows.length >= 2 && numericIdxs.length === 1) {
        const idx = numericIdxs[0];
        const a = rows[0][idx];
        const b = rows[1][idx];
        if (typeof a === "number" && typeof b === "number") {
            current = a;
            prior = b;
        }
    }
    if (current === null || prior === null) {
        return { delta: null, deltaPct: null, direction: null, prior: null };
    }
    const delta = current - prior;
    const deltaPct = prior !== 0 ? (delta / Math.abs(prior)) * 100 : null;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return { delta, deltaPct, direction, prior };
}

function KpiVariant(props: SqlSectionRendererProps) {
    const { section, result, locale } = props;
    if (!result || !result.rows || result.rows.length === 0) {
        return (
            <div className="gn-sql-kpi gn-sql-kpi--empty" role="status">
                <span className="gn-sql-kpi-value">—</span>
                <span className="gn-sql-kpi-label">{section.title || "KPI"} (no rows)</span>
            </div>
        );
    }
    const firstRow = result.rows[0] || [];
    // Find the first numeric scalar across the row (skip leading text dim).
    let scalar: unknown = null;
    let scalarIdx = -1;
    for (let i = 0; i < firstRow.length; i++) {
        const v = firstRow[i];
        if (typeof v === "number" && Number.isFinite(v)) {
            scalar = v;
            scalarIdx = i;
            break;
        }
        if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
            scalar = Number(v);
            scalarIdx = i;
            break;
        }
    }
    if (scalar === null) scalar = firstRow[0];
    const display = formatNumber(scalar, section.format, locale);
    const showDelta = !!section.format?.showPriorPeriodDelta;
    const { delta, deltaPct, direction, prior } = showDelta
        ? computeKpiDelta(result.rows, result.columns)
        : { delta: null, deltaPct: null, direction: null, prior: null };
    const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : direction === "flat" ? "▬" : "";
    const deltaClass = direction === "up" ? "gn-sql-kpi-delta--up"
        : direction === "down" ? "gn-sql-kpi-delta--down"
            : "gn-sql-kpi-delta--flat";
    return (
        <div className="gn-sql-kpi" data-result-render="kpi" data-trend-direction={direction || "none"} aria-label={`${section.title}: ${display}`}>
            <span className="gn-sql-kpi-label">{section.title || (result.columns[scalarIdx] ?? "Value")}</span>
            <span className="gn-sql-kpi-value">{display}</span>
            {showDelta && delta !== null && (
                <span className={`gn-sql-kpi-delta ${deltaClass}`}>
                    <span className="gn-sql-kpi-delta-arrow" aria-hidden="true">{arrow}</span>
                    <span className="gn-sql-kpi-delta-value">
                        {formatNumber(delta, section.format, locale)}
                        {deltaPct !== null && ` (${deltaPct.toFixed(1)}%)`}
                    </span>
                    {prior !== null && (
                        <span className="gn-sql-kpi-prior">vs {formatNumber(prior, section.format, locale)}</span>
                    )}
                </span>
            )}
        </div>
    );
}

function TableVariant(props: SqlSectionRendererProps) {
    const { result, section } = props;
    if (!result || !result.columns || result.columns.length === 0) {
        return <div className="gn-sql-table gn-sql-table--empty">No columns returned.</div>;
    }
    const rows = (result.rows || []).slice(0, 25);
    return (
        <div className="gn-sql-table" data-result-render="table">
            <div className="gn-sql-table-title">{section.title}</div>
            <div className="gn-table-wrap">
                <table className="gn-table" role="table">
                    <thead>
                        <tr>
                            {result.columns.map((c, i) => (
                                <th key={`${c}-${i}`}>{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={`r-${ri}`}>
                                {result.columns.map((_c, ci) => {
                                    const v = row?.[ci];
                                    const isNumber = typeof v === "number" && Number.isFinite(v);
                                    return (
                                        <td key={`r-${ri}-c-${ci}`} className={isNumber ? "gn-cell-numeric" : ""}>
                                            {isNumber
                                                ? formatNumber(v, section.format, props.locale)
                                                : (v === null || v === undefined ? "" : String(v))}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {result.rows && result.rows.length > rows.length && (
                <div className="gn-table-footer">Showing {rows.length} of {result.rows.length} rows.</div>
            )}
            {result.truncated && (
                <div className="gn-table-footer">Result truncated at preview cap (100 rows).</div>
            )}
        </div>
    );
}

function ChartVariant(props: SqlSectionRendererProps) {
    const { result, section, locale } = props;
    // Stub renderer — picks bar (the most common shape for SQL aggregations)
    // when there's exactly one categorical column + one numeric column.
    // Anything else falls back to a table card with a helpful nudge.
    if (!result || !result.rows || result.rows.length === 0) {
        return (
            <div className="gn-sql-chart gn-sql-chart--empty" role="status">
                {section.title}: no rows to chart.
            </div>
        );
    }
    const cols = result.columns || [];
    const isNumericCol = (idx: number) => result.rows.every(r => typeof r?.[idx] === "number" && Number.isFinite(r[idx] as number));
    const numericIdxs: number[] = [];
    for (let i = 0; i < cols.length; i++) if (isNumericCol(i)) numericIdxs.push(i);
    const categoricalIdx = cols.findIndex((_, i) => !isNumericCol(i));
    const numericIdx = numericIdxs[0] ?? -1;
    // Bar-chart-friendly shape: exactly one categorical column, exactly one
    // numeric column, ≤50 rows. Anything else falls back to a table card so
    // the author doesn't lose information (e.g. current+prior+delta would
    // collapse to a single bar each).
    if (categoricalIdx < 0 || numericIdx < 0 || numericIdxs.length > 1 || cols.length > 8 || result.rows.length > 50) {
        // Fallback to table when shape isn't bar-friendly.
        return (
            <>
                <TableVariant {...props} />
                <div className="gn-sql-chart-hint" role="note">
                    Chart not rendered: result shape needs exactly one label column + one numeric column with ≤50 rows. Switch <em>Result render</em> to <strong>Table</strong> in Setup.
                </div>
            </>
        );
    }
    const labels = result.rows.map(r => String(r[categoricalIdx] ?? ""));
    const values = result.rows.map(r => Number(r[numericIdx]));
    const max = Math.max(1, ...values.map(v => Math.abs(v)));
    return (
        <div className="gn-sql-chart" data-result-render="chart" role="img" aria-label={`${section.title}: ${cols[numericIdx]} by ${cols[categoricalIdx]}`}>
            <div className="gn-sql-chart-title">{section.title}</div>
            <div className="gn-sql-chart-bars">
                {labels.map((label, i) => {
                    const v = values[i];
                    const w = (Math.abs(v) / max) * 100;
                    return (
                        <div key={`bar-${i}`} className="gn-sql-chart-bar-row">
                            <span className="gn-sql-chart-bar-label">{label}</span>
                            <span className="gn-sql-chart-bar-track" aria-hidden="true">
                                <span className="gn-sql-chart-bar-fill" style={{ width: `${w}%` }} />
                            </span>
                            <span className="gn-sql-chart-bar-value">{formatNumber(v, section.format, locale)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Top-level Custom SQL section renderer. Branches on `section.resultRender`
 * and pipes the executed `result` through the matching variant.
 */
export function SqlSectionRenderer(props: SqlSectionRendererProps): React.ReactElement {
    if (props.loading) {
        return (
            <div className="gn-sql-section gn-sql-section--loading" role="status" aria-busy="true">
                <span className="gn-sql-section-skel" />
                <span className="gn-sql-section-label">Running {props.section.title || "SQL"}…</span>
            </div>
        );
    }
    if (props.error) {
        return (
            <div className="gn-sql-section gn-sql-section--error" role="alert">
                <strong>{props.section.title || "SQL section"}</strong>: {props.error}
            </div>
        );
    }
    if (props.result?.error) {
        return (
            <div className="gn-sql-section gn-sql-section--error" role="alert">
                <strong>{props.section.title || "SQL section"}</strong>: {props.result.error}
            </div>
        );
    }
    const render = props.section.resultRender;
    if (render === "table") return <TableVariant {...props} />;
    if (render === "chart") return <ChartVariant {...props} />;
    return <KpiVariant {...props} />;
}

export default SqlSectionRenderer;
