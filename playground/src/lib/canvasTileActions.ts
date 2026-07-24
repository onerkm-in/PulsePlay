// playground/src/lib/canvasTileActions.ts
//
// Shared "run a SELECT and pin the result as a canvas tile" action. Both the
// Add-SQL-tile composer and pin-a-decision-to-canvas need the identical flow:
// execute author/evidence SQL through the proxy's /sql/preview path (Databricks
// warehouse, NO LLM), then create a self-contained, refreshable tile from the
// returned columns + rows. One helper keeps that contract in one place.

import { validateSqlViaPreview } from "./sqlPreviewClient";
import { addCanvasTile } from "./canvasTiles";
import { readCanvasApiBaseUrl } from "./canvasConnector";

export interface CreateSqlTileResult {
    ok: boolean;
    id?: string;
    error?: string;
}

/**
 * Run `sql` against `profile`'s warehouse and pin the result as a canvas tile.
 * Deterministic: the only backend call is the read-only SELECT preview — never
 * a model. Returns the new tile id on success, or a user-facing error string.
 */
export async function createSqlBackedTile(opts: {
    title: string;
    sql: string;
    profile: string;
    /** "table" or a chart kind string (bar/line/…). Defaults to table. */
    renderAs?: string;
    sourceQuestion?: string;
}): Promise<CreateSqlTileResult> {
    const sql = (opts.sql || "").trim();
    if (!sql) return { ok: false, error: "No SQL to run." };
    if (!opts.profile) return { ok: false, error: "No connector is configured for the canvas." };

    const res = await validateSqlViaPreview({
        apiBaseUrl: readCanvasApiBaseUrl(),
        sql,
        assistantProfile: opts.profile,
    });
    if (!res.ok) return { ok: false, error: res.error || "Query failed." };
    if (!res.columns.length) return { ok: false, error: "The query returned no columns." };

    const renderAs = opts.renderAs || "table";
    const id = addCanvasTile({
        title: opts.title.trim() || "SQL tile",
        kind: renderAs === "table" ? "table" : "chart",
        ...(renderAs === "table" ? {} : { chartType: renderAs }),
        columns: res.columns,
        rows: res.rows,
        sqlQuery: sql,
        connectorProfileId: opts.profile,
        sourceQuestion: opts.sourceQuestion,
        lastRefreshedAt: Date.now(),
    });
    return { ok: true, id };
}
