// playground/src/lib/canvasTiles.ts
//
// Pin-to-canvas store (Phase 1, snapshot-first). A "pinned tile" is a
// self-contained BI element captured from an Ask Pulse answer or AI Insights
// section: it carries the data snapshot it was pinned with PLUS the SQL + the
// connector/profile that produced it (so a later phase can re-execute it live
// via the proxy's /sql/preview + X-Assistant-Profile path). The native BI
// canvas (Dashboard tab) renders these tiles as an arrangeable grid.
//
// Storage is local-first (localStorage) — this is the end-user "bookmark" tier.
// Named "reports" / "templates" (proxy-side) come in a later phase. One global
// canvas for the MVP; multi-canvas is a later extension.
//
// Follows the chartPalettes/themeSync pattern: a CSS-less data store with a
// broadcast event so every surface re-reads on change.

export interface CanvasTile {
    id: string;
    /** Editable display title; defaults to the question that produced it. */
    title: string;
    kind: "chart" | "table";
    /** Chart tiles only — the ChartKind string the chart was pinned as. */
    chartType?: string;
    /** Data snapshot captured at pin time (instant render, offline-safe). */
    columns: string[];
    rows: unknown[][];
    /** Provenance + the binding used to refresh/re-run the tile live. */
    sqlQuery?: string;
    connectorProfileId?: string;
    sourceQuestion?: string;
    createdAt: number;
    /** Wall-clock of the last live refresh / edited-query run (undefined = the
     *  tile is still showing its original pinned snapshot). */
    lastRefreshedAt?: number;
}

const STORAGE_KEY = "pulseplay:canvas-tiles";
export const CANVAS_TILES_EVENT = "pulseplay:canvas-tiles-change";

function read(): CanvasTile[] {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Defensive: keep only well-formed tiles.
        return parsed.filter(
            (t): t is CanvasTile =>
                t && typeof t === "object" &&
                typeof t.id === "string" &&
                Array.isArray(t.columns) && Array.isArray(t.rows),
        );
    } catch {
        return [];
    }
}

function write(tiles: CanvasTile[]): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles));
    } catch {
        /* quota / disabled storage — non-fatal */
    }
    try {
        window.dispatchEvent(new CustomEvent(CANVAS_TILES_EVENT));
    } catch {
        /* ignore */
    }
}

export function listCanvasTiles(): CanvasTile[] {
    return read();
}

export function canvasTileCount(): number {
    return read().length;
}

/** Add a tile (snapshot). Returns the created tile's id. Newest goes last so
 *  the canvas grid reads in pin order. */
export function addCanvasTile(input: Omit<CanvasTile, "id" | "createdAt"> & { id?: string }): string {
    const tiles = read();
    const id = input.id || `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tiles.push({ ...input, id, createdAt: Date.now() });
    write(tiles);
    return id;
}

export function removeCanvasTile(id: string): void {
    write(read().filter(t => t.id !== id));
}

/** Patch a tile in place (e.g. rename, change chart type). */
export function updateCanvasTile(id: string, patch: Partial<Omit<CanvasTile, "id">>): void {
    write(read().map(t => (t.id === id ? { ...t, ...patch } : t)));
}

export function clearCanvasTiles(): void {
    write([]);
}
