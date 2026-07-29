// playground/src/canvas/SavedItemsRegion.tsx
//
// Real bookmarked CanvasSections from the server-owned store.
//
// This card carried a "COMING SOON" badge saying saved items would arrive
// "once server-side saved-item persistence ships" — but that persistence had
// already shipped: SaveChannel writes bookmarks through
// POST/PATCH /decision-canvas/sections, and the list endpoint accepts
// ?save_state=bookmarked. The placeholder was stale, not blocked.
//
// Bookmarked-only by design: anything ALSO pinned already appears in My
// Canvas, and listing it twice would double-count the same item on one page.

import { useCallback, useEffect, useState } from "react";
import type { CanvasSection } from "./canvasTypes";
import { listSections, mutateSection } from "./canvasClient";
import "./myCanvas.css";

export function SavedItemsRegion(): React.ReactElement {
    const [sections, setSections] = useState<CanvasSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        listSections("bookmarked")
            .then((s) => { if (!cancelled) { setSections(s); setError(null); } })
            .catch((e) => { if (!cancelled) setError((e as Error).message || "Could not load your saved items."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => refresh(), [refresh]);
    useEffect(() => {
        const onChange = () => refresh();
        window.addEventListener("pulseplay:canvas-changed", onChange);
        return () => window.removeEventListener("pulseplay:canvas-changed", onChange);
    }, [refresh]);

    const pin = async (s: CanvasSection) => {
        try { await mutateSection(s.section_id, "pin", s.version); refresh(); }
        catch (e) { setError((e as Error).message); }
    };

    return (
        <div className="dcc-card dcc-pad">
            <div className="dcc-chart-head">
                <h3 className="dcc-section-title">Saved Items{sections.length ? ` · ${sections.length}` : ""}</h3>
                <button type="button" onClick={refresh} className="btn btn-ghost btn-sm">Refresh</button>
            </div>
            {error && <div role="status" className="mc-error">{error}</div>}
            {loading && !sections.length && <p className="dcc-empty">Loading your saved items…</p>}
            {!loading && !sections.length && !error && (
                <p className="dcc-empty">
                    Nothing saved yet. Use <b>Save → Bookmark</b> on any decision, insight or answer to keep it here.
                </p>
            )}
            <div className="mc-list">
                {sections.map((s) => (
                    <div key={s.section_id} className="mc-row">
                        <span className="mc-title" title={s.title}>{s.title}</span>
                        <span className="mc-type">{String(s.type || "").replace(/_/g, " ")}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => pin(s)}>
                            Pin to Canvas
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
