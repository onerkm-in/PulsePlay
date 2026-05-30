// playground/src/visualization/CanvasGrid.tsx
//
// Pin-to-canvas grid. Renders pinned tiles as an ARRANGEABLE dashboard on the
// native BI canvas (Dashboard tab): drag a tile by its header to reposition and
// drag the corner to resize on a 12-column grid. Dragging is COLLISION-AWARE —
// tiles you drag near reflow out of the way (vertical compaction, react-grid-
// layout style) so nothing overlaps. Layout persists per tile.
//
// Each tile stays self-contained — renders from its snapshot (columns + rows +
// chartType) and can Refresh (re-run its bound SQL on the connector) or be
// edited (Edit query). Themed via --pp-* so it tracks the active theme.

import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
type IdLayout = Layout & { id: string };
const defaultLayout = (i: number): Layout => ({ x: (i % 2) * 6, y: Math.floor(i / 2) * 9, w: 6, h: 9 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sameLayout = (a?: Layout, b?: Layout) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const overlaps = (a: IdLayout, b: IdLayout) =>
    a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** react-grid-layout-style arrange: keep `movingId` where the user put it, then
 *  compact every other tile up and push it below any collision. No overlaps. */
function arrange(items: IdLayout[], movingId: string | null): Map<string, Layout> {
    const sorted = items.slice().sort((a, b) =>
        (a.id === movingId ? -1 : b.id === movingId ? 1 : (a.y - b.y || a.x - b.x)));
    const placed: IdLayout[] = [];
    for (const it of sorted) {
        const l: IdLayout = { ...it };
        if (l.id !== movingId) {
            while (l.y > 0 && !placed.some(p => overlaps({ ...l, y: l.y - 1 }, p))) l.y--;
            let c: IdLayout | undefined;
            while ((c = placed.find(p => overlaps(l, p)))) l.y = c.y + c.h;
        }
        placed.push(l);
    }
    const map = new Map<string, Layout>();
    for (const p of placed) map.set(p.id, { x: p.x, y: p.y, w: p.w, h: p.h });
    return map;
}

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
    const gridRef = useRef<HTMLDivElement | null>(null);
    const [gridWidth, setGridWidth] = useState(0);
    // The tile currently being dragged/resized + its proposed layout.
    const [gesture, setGesture] = useState<{ id: string; layout: Layout } | null>(null);

    useEffect(() => {
        const refresh = () => setTiles(listCanvasTiles());
        window.addEventListener(CANVAS_TILES_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(CANVAS_TILES_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
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

    const baseItems: IdLayout[] = useMemo(
        () => tiles.map((t, i) => ({ id: t.id, ...(t.layout || defaultLayout(i)) })),
        [tiles],
    );
    // Effective (possibly reflowed) layout per tile — live during a gesture.
    const effective: Map<string, Layout> = useMemo(() => {
        if (!gesture) {
            const m = new Map<string, Layout>();
            for (const b of baseItems) m.set(b.id, { x: b.x, y: b.y, w: b.w, h: b.h });
            return m;
        }
        const withMoving = baseItems.map(b => (b.id === gesture.id ? { id: b.id, ...gesture.layout } : b));
        return arrange(withMoving, gesture.id);
    }, [baseItems, gesture]);

    const commit = useCallback(() => {
        setGesture(g => {
            if (g) {
                const withMoving = tiles.map((t, i) => ({ id: t.id, ...(t.id === g.id ? g.layout : (t.layout || defaultLayout(i))) }));
                const final = arrange(withMoving, g.id);
                for (const t of tiles) {
                    const nl = final.get(t.id);
                    if (nl && !sameLayout(t.layout, nl)) updateCanvasTile(t.id, { layout: nl });
                }
            }
            return null;
        });
    }, [tiles]);

    if (tiles.length === 0) return null;

    const colW = gridWidth > 0 ? gridWidth / COLS : 0;
    const gridRows = Math.max(9, ...tiles.map(t => { const l = effective.get(t.id)!; return l.y + l.h; }));
    const gridHeight = gridRows * ROW_H + GAP;

    return (
        <div className="pp-canvas" data-testid="pp-canvas-grid">
            <div className="pp-canvas__bar">
                <span className="pp-canvas__title">My Canvas</span>
                <span className="pp-canvas__count">{tiles.length} pinned {tiles.length === 1 ? "tile" : "tiles"} · drag to arrange (tiles reflow), resize from the corner</span>
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
                {colW > 0 && tiles.map(tile => (
                    <CanvasTileCard
                        key={tile.id}
                        tile={tile}
                        layout={effective.get(tile.id)!}
                        colW={colW}
                        dragging={gesture?.id === tile.id}
                        onGestureMove={(l) => setGesture({ id: tile.id, layout: l })}
                        onGestureEnd={commit}
                    />
                ))}
            </div>
        </div>
    );
}

function CanvasTileCard({ tile, layout, colW, dragging, onGestureMove, onGestureEnd }: {
    tile: CanvasTile;
    layout: Layout;
    colW: number;
    dragging: boolean;
    onGestureMove: (l: Layout) => void;
    onGestureEnd: () => void;
}): React.ReactElement {
    const isChart = tile.kind === "chart";
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [sqlDraft, setSqlDraft] = useState(tile.sqlQuery || "");
    const hasConnector = !!tile.connectorProfileId;

    const sectionRef = useRef<HTMLElement | null>(null);
    const gesture = useRef<{ mode: "move" | "resize"; px: number; py: number; start: Layout } | null>(null);

    const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest("button, select, textarea, input, a")) return;
        e.preventDefault();
        gesture.current = { mode, px: e.clientX, py: e.clientY, start: { ...layout } };
        try { sectionRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || colW <= 0) return;
        const dCol = Math.round((e.clientX - g.px) / colW);
        const dRow = Math.round((e.clientY - g.py) / ROW_H);
        if (g.mode === "move") {
            onGestureMove({ ...g.start, x: clamp(g.start.x + dCol, 0, COLS - g.start.w), y: Math.max(0, g.start.y + dRow) });
        } else {
            onGestureMove({ ...g.start, w: clamp(g.start.w + dCol, MIN_W, COLS - g.start.x), h: Math.max(MIN_H, g.start.h + dRow) });
        }
    };
    const endGesture = (e: React.PointerEvent) => {
        if (!gesture.current) return;
        gesture.current = null;
        onGestureEnd();
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

    const pos: React.CSSProperties = {
        position: "absolute",
        left: layout.x * colW + GAP / 2,
        top: layout.y * ROW_H + GAP / 2,
        width: layout.w * colW - GAP,
        height: layout.h * ROW_H - GAP,
    };
    const chartHeight = Math.max(150, layout.h * ROW_H - GAP - 96);
    const option = isChart ? buildEChartsOption(tile.chartType || "bar", tile.columns, tile.rows as unknown[][]) : null;

    return (
        <section
            ref={sectionRef}
            className={`pp-tile${dragging ? " pp-tile--dragging" : ""}`}
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
            <span className="pp-tile__resize" onPointerDown={onPointerDown("resize")} title="Drag to resize" aria-hidden="true" style={{ touchAction: "none" }} />
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
