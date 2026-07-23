// playground/src/canvas/MyCanvasRegion.tsx
//
// Renders the current user's real pinned CanvasSections from the server-owned store
// (not localStorage). Supports unpin and reorder. This replaces the deferred "My
// Canvas" scaffold with live server-backed content once sections are pinned.

import { useCallback, useEffect, useState } from "react";
import type { CanvasSection } from "./canvasTypes";
import { listSections, mutateSection } from "./canvasClient";

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
        <section style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{
                padding: "10px 16px", borderBottom: "1px solid rgba(128,128,128,0.2)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#667085)",
            }}>
                <span>MY CANVAS{sections.length ? ` · ${sections.length}` : ""}</span>
                <button type="button" onClick={refresh} style={{
                    fontSize: 11, border: "none", background: "transparent", color: "var(--pp-muted,#667085)",
                    cursor: "pointer", textDecoration: "underline",
                }}>Refresh</button>
            </div>
            <div style={{ padding: 14 }}>
                {error && <div role="status" style={{ fontSize: 12, color: "#b54708", marginBottom: 8 }}>{error}</div>}
                {loading && !sections.length && <div style={{ fontSize: 12.5, color: "var(--pp-muted,#98a2b3)" }}>Loading your Canvas…</div>}
                {!loading && !sections.length && (
                    <div style={{ fontSize: 12.5, color: "var(--pp-muted,#98a2b3)", lineHeight: 1.5 }}>
                        Nothing pinned yet. Use <strong>Save → Pin to Canvas</strong> on any decision, insight, answer, or dashboard view to place it here.
                    </div>
                )}
                {sections.map((s, i) => (
                    <div key={s.section_id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        border: "1px solid rgba(128,128,128,0.22)", borderRadius: 9, padding: "9px 11px", marginBottom: 8,
                        background: s.state.emphasis === "highlighted" ? "rgba(37,99,235,0.06)" : "transparent",
                    }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                            <div style={{ fontSize: 10.5, color: "var(--pp-muted,#98a2b3)" }}>
                                {s.type.replace("_", " ")} · {s.source.surface || "—"}{s.state.note ? ` · note: ${s.state.note}` : ""}
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(s, -1)} style={iconBtn}>↑</button>
                            <button type="button" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(s, 1)} style={iconBtn}>↓</button>
                            <button type="button" onClick={() => unpin(s)} style={{ ...iconBtn, width: "auto", padding: "0 8px" }}>Unpin</button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

const iconBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 7, cursor: "pointer", fontSize: 12,
    border: "1px solid rgba(128,128,128,0.35)", background: "transparent", color: "inherit",
};
