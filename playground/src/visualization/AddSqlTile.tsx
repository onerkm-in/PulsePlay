// playground/src/visualization/AddSqlTile.tsx
//
// "Add SQL tile" — the no-LLM way to put a chart/table on the canvas. The user
// pastes a read-only SELECT, picks how to render it, and PulsePlay runs it via
// the proxy's /sql/preview path (Databricks warehouse, no model in the loop),
// then pins a self-contained, refreshable tile. This is the deterministic twin
// of pinning an Ask Pulse answer: same tile shape, same Refresh button, but the
// SQL is author-supplied instead of Genie-generated.
//
// Reachable from both the populated canvas bar and the empty-canvas state, so a
// blank Dashboard can be bootstrapped with zero AI spend.

import * as React from "react";
import { useState } from "react";
import { createSqlBackedTile } from "../lib/canvasTileActions";
import { readActiveCanvasProfile } from "../lib/canvasConnector";

const RENDER_AS = ["table", "bar", "column", "line", "area", "pie", "donut"] as const;
type RenderAs = typeof RENDER_AS[number];

export function AddSqlTile({ variant = "bar" }: { variant?: "bar" | "empty" }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [sql, setSql] = useState("");
    const [renderAs, setRenderAs] = useState<RenderAs>("table");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const profile = readActiveCanvasProfile();

    const reset = () => { setTitle(""); setSql(""); setRenderAs("table"); setError(null); setBusy(false); };
    const close = () => { setOpen(false); reset(); };

    const add = async () => {
        const trimmed = sql.trim();
        if (!trimmed) { setError("Enter a SELECT query."); return; }
        if (!profile) { setError("No connector is configured — pick an AI/BI connector in Settings first."); return; }
        setBusy(true); setError(null);
        const res = await createSqlBackedTile({
            title: title.trim() || firstLine(trimmed),
            sql: trimmed,
            profile,
            renderAs,
            sourceQuestion: title.trim() || undefined,
        });
        setBusy(false);
        if (!res.ok) { setError(res.error || "Query failed."); return; }
        close();
    };

    return (
        <div className={`pp-sqltile-anchor pp-sqltile-anchor--${variant}`}>
            <button
                type="button"
                className={variant === "empty" ? "pp-cta-primary" : "pp-canvas__add"}
                onClick={() => (open ? close() : setOpen(true))}
                title="Add a chart or table from a SQL query — no AI, runs against the warehouse"
                aria-expanded={open}
                data-testid="add-sql-tile-open"
            >
                + Add SQL tile
            </button>
            {open && (
            <div className="pp-sqltile" role="dialog" aria-label="Add a SQL tile to the canvas" data-testid="add-sql-tile-dialog">
            <div className="pp-sqltile__row">
                <input
                    className="pp-sqltile__title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Tile title (optional)"
                    aria-label="Tile title"
                />
                <select
                    className="pp-sqltile__renderas"
                    value={renderAs}
                    onChange={e => setRenderAs(e.target.value as RenderAs)}
                    aria-label="Render as"
                    title="How to render the result"
                >
                    {RENDER_AS.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
            </div>
            <textarea
                className="pp-sqltile__sql"
                value={sql}
                onChange={e => setSql(e.target.value)}
                placeholder="SELECT … FROM … — a read-only query against the connector's warehouse"
                spellCheck={false}
                rows={5}
                aria-label="SQL query"
                data-testid="add-sql-tile-sql"
            />
            <div className="pp-sqltile__foot">
                <span className="pp-sqltile__conn" title="The warehouse this query runs against">
                    {profile ? `runs on ${profile} · no AI` : "no connector configured"}
                </span>
                <span className="pp-sqltile__actions">
                    <button
                        type="button"
                        className="pp-tile__run"
                        onClick={add}
                        disabled={busy || !sql.trim() || !profile}
                        data-testid="add-sql-tile-add"
                    >{busy ? "Running…" : "Add to canvas"}</button>
                    <button type="button" className="pp-tile__cancel" onClick={close} disabled={busy}>Cancel</button>
                </span>
            </div>
            {error && <div className="pp-sqltile__error" role="status">{error}</div>}
            </div>
            )}
        </div>
    );
}

/** A compact tile title from the first meaningful line of a query. */
function firstLine(sql: string): string {
    const line = sql.split("\n").map(l => l.trim()).find(Boolean) || "SQL tile";
    return line.length > 48 ? line.slice(0, 45) + "…" : line;
}
