// playground/src/canvas/browserMigration.ts
//
// Restricted browser-storage cleanup (v3.2 §6/§11). The legacy pin feature stored
// full result rows + executable SQL in localStorage under `pulseplay:canvas-tiles`.
// Server-owned Canvas persistence replaces that; the raw rows/SQL must never be
// uploaded and must not linger in browser storage. This purges the legacy key,
// records a one-time migration marker, and re-runs on logout.

const LEGACY_KEY = "pulseplay:canvas-tiles";
const MIGRATION_MARKER = "pulseplay:canvas-tiles-migrated";

export interface CanvasMigrationResult {
    hadLegacy: boolean;
    purged: boolean;
    /** Non-sensitive title/layout metadata that MAY be re-pinned server-side later.
     *  Never includes rows or SQL. */
    salvagedTitles: string[];
}

/** Purge the legacy key. Rows/SQL are dropped, never returned or uploaded. Only
 *  non-sensitive tile titles are salvaged for optional user-initiated re-pin. */
export function migrateLegacyCanvasTiles(): CanvasMigrationResult {
    if (typeof window === "undefined") return { hadLegacy: false, purged: false, salvagedTitles: [] };
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(LEGACY_KEY); } catch { /* swallow */ }
    if (!raw) {
        try { window.localStorage.setItem(MIGRATION_MARKER, "1"); } catch { /* swallow */ }
        return { hadLegacy: false, purged: false, salvagedTitles: [] };
    }

    const salvagedTitles: string[] = [];
    try {
        const parsed = JSON.parse(raw);
        const tiles = Array.isArray(parsed) ? parsed : (parsed?.tiles || []);
        for (const t of tiles) {
            const title = typeof t?.title === "string" ? t.title.slice(0, 120) : null;
            if (title) salvagedTitles.push(title);
            // deliberately do NOT read t.rows, t.columns, t.sqlQuery — restricted content
        }
    } catch { /* unparseable legacy blob → purge anyway */ }

    try {
        window.localStorage.removeItem(LEGACY_KEY);   // drop rows + SQL
        window.localStorage.setItem(MIGRATION_MARKER, "1");
    } catch { /* swallow */ }

    return { hadLegacy: true, purged: true, salvagedTitles };
}

/** Call on logout / shared-device teardown: ensure no restricted business content
 *  survives in browser storage for the next user. */
export function purgeCanvasBrowserStorage(): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* swallow */ }
}

export function isCanvasMigrated(): boolean {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(MIGRATION_MARKER) === "1"; } catch { return false; }
}

export const __canvasMigrationKeys = { LEGACY_KEY, MIGRATION_MARKER };
