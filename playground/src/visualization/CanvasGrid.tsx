// playground/src/visualization/CanvasGrid.tsx
//
// Pin-to-canvas grid (Phase 1, snapshot-first). Renders the pinned tiles from
// the canvasTiles store as an arrangeable grid on the native BI canvas
// (Dashboard tab). Each tile is self-contained: it renders from the snapshot
// (columns + rows + chartType) it was pinned with, reusing the same
// buildEChartsOption + EChartsRenderer path the chat charts use. Per-tile:
// rename, change chart type, remove. Live refresh (re-running the bound SQL on
// the connector) and drag/resize are later phases.
//
// Themed via CSS custom properties (--pp-*) so it adapts to the active theme
// without importing the pulse style tree.

import * as React from "react";
import { useEffect, useState } from "react";
import { EChartsRenderer } from "../components/workbench/EChartsRenderer";
import { buildEChartsOption } from "../lib/buildEChartsOption";
import { validateSqlViaPreview } from "../lib/sqlPreviewClient";
import {
    listCanvasTiles,
    removeCanvasTile,
    updateCanvasTile,
    clearCanvasTiles,
    CANVAS_TILES_EVENT,
    type CanvasTile,
} from "../lib/canvasTiles";

const TILE_CHART_TYPES = ["bar", "column", "line", "area", "pie", "donut", "scatter"] as const;

/** Resolve the proxy base URL the same way the rest of the app does. */
function readApiBaseUrl(): string {
    try {
        const g = JSON.parse(window.localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}");
        if (g && typeof g.apiBaseUrl === "string" && g.apiBaseUrl.trim()) return g.apiBaseUrl;
    } catch { /* ignore */ }
    return `${window.location.origin}/api`;
}

function relTime(ms?: number): string {
    if (!ms) return "";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
}

export function CanvasGrid(): React.ReactElement | null {
    const [tiles, setTiles] = useState<CanvasTile[]>(() => listCanvasTiles());
    useEffect(() => {
        const refresh = () => setTiles(listCanvasTiles());
        window.addEventListener(CANVAS_TILES_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(CANVAS_TILES_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);

    if (tiles.length === 0) return null;

    return (
        <div className="pp-canvas" data-testid="pp-canvas-grid">
            <div className="pp-canvas__bar">
                <span className="pp-canvas__title">My Canvas</span>
                <span className="pp-canvas__count">{tiles.length} pinned {tiles.length === 1 ? "tile" : "tiles"}</span>
                <button
                    type="button"
                    className="pp-canvas__clear"
                    onClick={() => { if (window.confirm("Remove all pinned tiles from the canvas?")) clearCanvasTiles(); }}
                    title="Remove all pinned tiles"
                >
                    Clear all
                </button>
            </div>
            <div className="pp-canvas__grid">
                {tiles.map(tile => (
                    <CanvasTileCard key={tile.id} tile={tile} />
                ))}
            </div>
        </div>
    );
}

function CanvasTileCard({ tile }: { tile: CanvasTile }): React.ReactElement {
    const isChart = tile.kind === "chart";
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [sqlDraft, setSqlDraft] = useState(tile.sqlQuery || "");
    const hasConnector = !!tile.connectorProfileId;

    // Re-run a SQL against the tile's bound connector (proxy /sql/preview), then
    // update the tile's data (and SQL, when the user edited it). This is what
    // makes a pinned tile a self-contained, refreshable BI element.
    const run = async (sql: string, persistSql: boolean): Promise<void> => {
        if (!sql.trim() || !hasConnector) return;
        setBusy(true); setError(null);
        const res = await validateSqlViaPreview({ apiBaseUrl: readApiBaseUrl(), sql, assistantProfile: tile.connectorProfileId });
        setBusy(false);
        if (!res.ok) { setError(res.error || "Query failed."); return; }
        updateCanvasTile(tile.id, {
            columns: res.columns,
            rows: res.rows,
            lastRefreshedAt: Date.now(),
            ...(persistSql ? { sqlQuery: sql } : {}),
        });
        if (persistSql) setEditing(false);
    };

    const option = isChart ? buildEChartsOption(tile.chartType || "bar", tile.columns, tile.rows as unknown[][]) : null;

    return (
        <section className="pp-tile">
            <header className="pp-tile__head">
                <span className="pp-tile__title" title={tile.title}>{tile.title}</span>
                <div className="pp-tile__actions">
                    {isChart && (
                        <select
                            className="pp-tile__type"
                            value={tile.chartType || "bar"}
                            onChange={e => updateCanvasTile(tile.id, { chartType: e.target.value })}
                            aria-label="Tile chart type"
                            title="Change chart type"
                        >
                            {TILE_CHART_TYPES.map(t => (
                                <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                            ))}
                        </select>
                    )}
                    {tile.sqlQuery && (
                        <button
                            type="button"
                            className="pp-tile__btn"
                            onClick={() => run(tile.sqlQuery || "", false)}
                            disabled={busy || !hasConnector}
                            title={hasConnector ? "Refresh from the connector" : "No connector bound"}
                            aria-label="Refresh tile from the connector"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        </button>
                    )}
                    {tile.sqlQuery && (
                        <button
                            type="button"
                            className={`pp-tile__btn${editing ? " pp-tile__btn--active" : ""}`}
                            onClick={() => { setSqlDraft(tile.sqlQuery || ""); setError(null); setEditing(v => !v); }}
                            title="Edit query"
                            aria-label="Edit the tile's query"
                            aria-pressed={editing}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                        </button>
                    )}
                    <button
                        type="button"
                        className="pp-tile__remove"
                        onClick={() => removeCanvasTile(tile.id)}
                        title="Remove this tile"
                        aria-label="Remove this tile"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
            </header>
            {editing && (
                <div className="pp-tile__editor">
                    <textarea
                        className="pp-tile__sql"
                        value={sqlDraft}
                        onChange={e => setSqlDraft(e.target.value)}
                        spellCheck={false}
                        rows={5}
                        aria-label="Edit SQL query"
                    />
                    <div className="pp-tile__editor-actions">
                        <button type="button" className="pp-tile__run" onClick={() => run(sqlDraft, true)} disabled={busy || !sqlDraft.trim() || !hasConnector}>
                            {busy ? "Running…" : "Run query"}
                        </button>
                        <button type="button" className="pp-tile__cancel" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
                        {!hasConnector && <span className="pp-tile__hint">No connector bound — can't run.</span>}
                    </div>
                </div>
            )}
            {(busy || error) && (
                <div className={`pp-tile__status${error ? " pp-tile__status--error" : ""}`} role="status">
                    {busy ? "Refreshing from the connector…" : error}
                </div>
            )}
            <div className="pp-tile__body">
                {isChart && option ? (
                    <EChartsRenderer option={option} height={240} />
                ) : (
                    <CanvasTileTable columns={tile.columns} rows={tile.rows as unknown[][]} />
                )}
            </div>
            <footer className="pp-tile__foot">
                <span title="Connector bound to this tile">{tile.connectorProfileId || "no connector"}</span>
                <span className="pp-tile__snapshot">{tile.lastRefreshedAt ? `live · ${relTime(tile.lastRefreshedAt)}` : "snapshot"}</span>
            </footer>
        </section>
    );
}

function CanvasTileTable({ columns, rows }: { columns: string[]; rows: unknown[][] }): React.ReactElement {
    const shown = rows.slice(0, 50);
    return (
        <div className="pp-tile__tablewrap">
            <table className="pp-tile__table">
                <thead>
                    <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {shown.map((r, ri) => (
                        <tr key={ri}>{columns.map((_, ci) => <td key={ci}>{formatCell((r as unknown[])[ci])}</td>)}</tr>
                    ))}
                </tbody>
            </table>
            {rows.length > shown.length && (
                <div className="pp-tile__tablefoot">Showing {shown.length} of {rows.length} rows.</div>
            )}
        </div>
    );
}

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return v.toLocaleString();
    return String(v);
}
