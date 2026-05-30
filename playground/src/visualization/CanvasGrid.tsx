// playground/src/visualization/CanvasGrid.tsx
//
// Pin-to-canvas grid. Renders pinned tiles from the canvasTiles store as an
// ARRANGEABLE dashboard on the native BI canvas (Dashboard tab): each tile can
// be dragged to reposition and resized on a 12-column grid; layout persists.
// Each tile stays self-contained — renders from its snapshot (columns + rows +
// chartType) and can Refresh (re-run its bound SQL on the connector) or be
// edited (Edit query). Themed via --pp-* so it tracks the active theme.

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { EChartsRenderer } from "../components/workbench/EChartsRenderer";
import { buildEChartsOption } from "../lib/buildEChartsOption";
import { validateSqlViaPreview } from "../lib/sqlPreviewClient";
import {
    listCanvasTiles,
    removeCanvasTile,
    updateCanvasTile,
    clearCanvasTiles,
    ensureTileLayouts,
    CANVAS_TILES_EVENT,
    type CanvasTile,
} from "../lib/canvasTiles";

const TILE_CHART_TYPES = ["bar", "column", "line", "area", "pie", "donut", "scatter"] as const;
const COLS = 12;
const ROW_H = 40;
const GAP = 12;
const MIN_W = 3;
const MIN_H = 5;

type Layout = NonNullable<CanvasTile["layout"]>;
const defaultLayout = (i: number): Layout => ({ x: (i % 2) * 6, y: Math.floor(i / 2) * 9, w: 6, h: 9 });

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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function CanvasGrid(): React.ReactElement | null {
    const [tiles, setTiles] = useState<CanvasTile[]>(() => listCanvasTiles());
    const gridRef = useRef<HTMLDivElement | null>(null);
    const [gridWidth, setGridWidth] = useState(0);

    useEffect(() => {
        const refresh = () => setTiles(listCanvasTiles());
        window.addEventListener(CANVAS_TILES_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(CANVAS_TILES_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);

    // Give every tile a default layout so positions are stable.
    useEffect(() => { ensureTileLayouts((_t, i) => defaultLayout(i)); }, [tiles]);

    useEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const measure = () => setGridWidth(el.clientWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (tiles.length === 0) return null;

    const colW = gridWidth > 0 ? gridWidth / COLS : 0;
    const layoutOf = (t: CanvasTile, i: number): Layout => t.layout || defaultLayout(i);
    const gridRows = Math.max(9, ...tiles.map((t, i) => { const l = layoutOf(t, i); return l.y + l.h; }));
    const gridHeight = gridRows * ROW_H + GAP;

    return (
        <div className="pp-canvas" data-testid="pp-canvas-grid">
            <div className="pp-canvas__bar">
                <span className="pp-canvas__title">My Canvas</span>
                <span className="pp-canvas__count">{tiles.length} pinned {tiles.length === 1 ? "tile" : "tiles"} · drag to arrange, resize from the corner</span>
                <button
                    type="button"
                    className="pp-canvas__clear"
                    onClick={() => { if (window.confirm("Remove all pinned tiles from the canvas?")) clearCanvasTiles(); }}
                    title="Remove all pinned tiles"
                >
                    Clear all
                </button>
            </div>
            <div className="pp-canvas__board" ref={gridRef} style={{ position: "relative", height: gridHeight }}>
                {colW > 0 && tiles.map((tile, i) => (
                    <CanvasTileCard
                        key={tile.id}
                        tile={tile}
                        layout={layoutOf(tile, i)}
                        colW={colW}
                        onLayoutChange={(l) => updateCanvasTile(tile.id, { layout: l })}
                    />
                ))}
            </div>
        </div>
    );
}

function CanvasTileCard({ tile, layout, colW, onLayoutChange }: {
    tile: CanvasTile;
    layout: Layout;
    colW: number;
    onLayoutChange: (l: Layout) => void;
}): React.ReactElement {
    const isChart = tile.kind === "chart";
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [sqlDraft, setSqlDraft] = useState(tile.sqlQuery || "");
    const hasConnector = !!tile.connectorProfileId;

    // Drag / resize ─ live layout during the gesture; persisted on release.
    const sectionRef = useRef<HTMLElement | null>(null);
    const [live, setLive] = useState<Layout | null>(null);
    const gesture = useRef<{ mode: "move" | "resize"; px: number; py: number; start: Layout } | null>(null);

    const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
        // Don't start a drag from an interactive control.
        if ((e.target as HTMLElement).closest("button, select, textarea, input, a")) return;
        e.preventDefault();
        gesture.current = { mode, px: e.clientX, py: e.clientY, start: { ...layout } };
        setLive({ ...layout });
        try { sectionRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || colW <= 0) return;
        const dCol = Math.round((e.clientX - g.px) / colW);
        const dRow = Math.round((e.clientY - g.py) / ROW_H);
        if (g.mode === "move") {
            setLive({ ...g.start, x: clamp(g.start.x + dCol, 0, COLS - g.start.w), y: Math.max(0, g.start.y + dRow) });
        } else {
            setLive({ ...g.start, w: clamp(g.start.w + dCol, MIN_W, COLS - g.start.x), h: Math.max(MIN_H, g.start.h + dRow) });
        }
    };
    const endGesture = (e: React.PointerEvent) => {
        if (!gesture.current) return;
        if (live) onLayoutChange(live);
        gesture.current = null;
        setLive(null);
        try { sectionRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const run = async (sql: string, persistSql: boolean): Promise<void> => {
        if (!sql.trim() || !hasConnector) return;
        setBusy(true); setError(null);
        const res = await validateSqlViaPreview({ apiBaseUrl: readApiBaseUrl(), sql, assistantProfile: tile.connectorProfileId });
        setBusy(false);
        if (!res.ok) { setError(res.error || "Query failed."); return; }
        updateCanvasTile(tile.id, { columns: res.columns, rows: res.rows, lastRefreshedAt: Date.now(), ...(persistSql ? { sqlQuery: sql } : {}) });
        if (persistSql) setEditing(false);
    };

    const l = live || layout;
    const pos: React.CSSProperties = {
        position: "absolute",
        left: l.x * colW + GAP / 2,
        top: l.y * ROW_H + GAP / 2,
        width: l.w * colW - GAP,
        height: l.h * ROW_H - GAP,
    };
    const chartHeight = Math.max(150, l.h * ROW_H - GAP - 96);
    const option = isChart ? buildEChartsOption(tile.chartType || "bar", tile.columns, tile.rows as unknown[][]) : null;

    return (
        <section
            ref={sectionRef}
            className={`pp-tile${live ? " pp-tile--dragging" : ""}`}
            style={pos}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
        >
            <header className="pp-tile__head" onPointerDown={onPointerDown("move")} style={{ cursor: "move", touchAction: "none" }}>
                <span className="pp-tile__title" title={tile.title}>{tile.title}</span>
                <div className="pp-tile__actions">
                    {isChart && (
                        <select className="pp-tile__type" value={tile.chartType || "bar"} onChange={e => updateCanvasTile(tile.id, { chartType: e.target.value })} aria-label="Tile chart type" title="Change chart type">
                            {TILE_CHART_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                        </select>
                    )}
                    {tile.sqlQuery && (
                        <button type="button" className="pp-tile__btn" onClick={() => run(tile.sqlQuery || "", false)} disabled={busy || !hasConnector} title={hasConnector ? "Refresh from the connector" : "No connector bound"} aria-label="Refresh tile from the connector">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        </button>
                    )}
                    {tile.sqlQuery && (
                        <button type="button" className={`pp-tile__btn${editing ? " pp-tile__btn--active" : ""}`} onClick={() => { setSqlDraft(tile.sqlQuery || ""); setError(null); setEditing(v => !v); }} title="Edit query" aria-label="Edit the tile's query" aria-pressed={editing}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                        </button>
                    )}
                    <button type="button" className="pp-tile__remove" onClick={() => removeCanvasTile(tile.id)} title="Remove this tile" aria-label="Remove this tile">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
            </header>
            {editing && (
                <div className="pp-tile__editor">
                    <textarea className="pp-tile__sql" value={sqlDraft} onChange={e => setSqlDraft(e.target.value)} spellCheck={false} rows={5} aria-label="Edit SQL query" />
                    <div className="pp-tile__editor-actions">
                        <button type="button" className="pp-tile__run" onClick={() => run(sqlDraft, true)} disabled={busy || !sqlDraft.trim() || !hasConnector}>{busy ? "Running…" : "Run query"}</button>
                        <button type="button" className="pp-tile__cancel" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
                        {!hasConnector && <span className="pp-tile__hint">No connector bound — can't run.</span>}
                    </div>
                </div>
            )}
            {(busy || error) && (
                <div className={`pp-tile__status${error ? " pp-tile__status--error" : ""}`} role="status">{busy ? "Refreshing from the connector…" : error}</div>
            )}
            <div className="pp-tile__body">
                {isChart && option ? (
                    <EChartsRenderer key={chartHeight} option={option} height={chartHeight} />
                ) : (
                    <CanvasTileTable columns={tile.columns} rows={tile.rows as unknown[][]} />
                )}
            </div>
            <footer className="pp-tile__foot">
                <span title="Connector bound to this tile">{tile.connectorProfileId || "no connector"}</span>
                <span className="pp-tile__snapshot">{tile.lastRefreshedAt ? `live · ${relTime(tile.lastRefreshedAt)}` : "snapshot"}</span>
            </footer>
            <span
                className="pp-tile__resize"
                onPointerDown={onPointerDown("resize")}
                title="Drag to resize"
                aria-hidden="true"
                style={{ touchAction: "none" }}
            />
        </section>
    );
}

function CanvasTileTable({ columns, rows }: { columns: string[]; rows: unknown[][] }): React.ReactElement {
    const shown = rows.slice(0, 50);
    return (
        <div className="pp-tile__tablewrap">
            <table className="pp-tile__table">
                <thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>
                    {shown.map((r, ri) => (
                        <tr key={ri}>{columns.map((_, ci) => <td key={ci}>{formatCell((r as unknown[])[ci])}</td>)}</tr>
                    ))}
                </tbody>
            </table>
            {rows.length > shown.length && <div className="pp-tile__tablefoot">Showing {shown.length} of {rows.length} rows.</div>}
        </div>
    );
}

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return v.toLocaleString();
    return String(v);
}
