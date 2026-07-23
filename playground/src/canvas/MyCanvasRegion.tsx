// playground/src/canvas/MyCanvasRegion.tsx
//
// Renders the current user's real pinned CanvasSections from the server-owned store
// (not localStorage). Supports unpin and reorder. Styled to the Industry design
// system: a blueprint region with token-driven rows + buttons.

import { useCallback, useEffect, useState } from "react";
import type { CanvasSection } from "./canvasTypes";
import { listSections, mutateSection } from "./canvasClient";
import "./myCanvas.css";

function Corners() {
    return (<>
        <i className="corner tl" /><i className="corner tr" />
        <i className="corner bl" /><i className="corner br" />
    </>);
}

export function MyCanvasRegion(): React.ReactElement {
    const [sections, setSections] = useState<CanvasSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        listSections("pinned")
            .then((s) => { if (!cancelled) { setSections(s); setError(null); } })
            .catch((e) => { if (!cancelled) setError((e as Error).message || "Could not load your Canvas."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => refresh(), [refresh]);
    useEffect(() => {
        const onChange = () => refresh();
        window.addEventListener("pulseplay:canvas-changed", onChange);
        return () => window.removeEventListener("pulseplay:canvas-changed", onChange);
    }, [refresh]);

    const unpin = async (s: CanvasSection) => {
        try { await mutateSection(s.section_id, "unpin", s.version); refresh(); }
        catch (e) { setError((e as Error).message); }
    };
    const move = async (s: CanvasSection, dir: -1 | 1) => {
        try { await mutateSection(s.section_id, "reorder", s.version, { layout: { order: (s.layout?.order ?? 0) + dir * 10 } }); refresh(); }
        catch (e) { setError((e as Error).message); }
    };

    return (
        <section className="mc-region blueprint">
            <Corners />
            <div className="mc-head">
                <span className="kicker">My Canvas{sections.length ? ` · ${sections.length}` : ""}</span>
                <button type="button" onClick={refresh} className="btn btn-ghost btn-sm">Refresh</button>
            </div>
            <div className="mc-list">
                {error && <div role="status" className="mc-error">{error}</div>}
                {loading && !sections.length && <div className="mc-muted">Loading your Canvas…</div>}
                {!loading && !sections.length && (
                    <div className="mc-empty">
                        Nothing pinned yet. Use <strong>Save → Pin to Canvas</strong> on any decision, insight, answer, or dashboard view to place it here.
                    </div>
                )}
                {sections.map((s, i) => (
                    <div key={s.section_id} className={`mc-row blueprint${s.state.emphasis === "highlighted" ? " mc-row--hl" : ""}`}>
                        <Corners />
                        <div className="mc-row-info">
                            <div className="mc-row-title">{s.title}</div>
                            <div className="mc-row-sub text-muted">
                                {s.type.replace("_", " ")} · {s.source.surface || "—"}{s.state.note ? ` · note: ${s.state.note}` : ""}
                            </div>
                        </div>
                        <div className="mc-row-actions">
                            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(s, -1)} className="btn btn-secondary btn-sm mc-icon">↑</button>
                            <button type="button" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(s, 1)} className="btn btn-secondary btn-sm mc-icon">↓</button>
                            <button type="button" onClick={() => unpin(s)} className="btn btn-secondary btn-sm">Unpin</button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
