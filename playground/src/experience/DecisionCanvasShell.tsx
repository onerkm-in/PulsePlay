// playground/src/experience/DecisionCanvasShell.tsx
//
// "My Decision Canvas" — the combined single-workspace experience (v3.2 §10/§10
// combined-mode order). This is the FIRST vertical slice: the Action Inbox is
// real and governed (it reuses the same ActionInsightsPanel + Decision Assist
// backend as segregated mode — no forked business logic), the existing surfaces
// remain reachable from one workspace, and the deferred Canvas regions (My
// Canvas, Saved Items, Suggested, Since You Last Visited) are shown as honest
// "arriving in a later phase" scaffolds rather than fabricated content.
//
// Segregated mode is unaffected and remains the default + fail-safe fallback.

import { useEffect, useState } from "react";
import { ActionInsightsPanel } from "../components/ActionInsightsPanel";
import { MyCanvasRegion } from "../canvas/MyCanvasRegion";
import { SaveChannel } from "../canvas/SaveChannel";
import type { EligibleSection } from "../canvas/canvasTypes";

function readProxyBase(): string {
    if (typeof window === "undefined") return "/api";
    try {
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (raw) {
            const v = JSON.parse(raw)?.apiBaseUrl;
            if (typeof v === "string" && v.trim() && /\/api$/.test(v.trim())) return v.trim();
        }
    } catch { /* swallow */ }
    return "/api";
}

function readActiveProfile(): string {
    if (typeof window === "undefined") return "";
    try {
        const p = window.localStorage.getItem("pulseplay:active-ai-profile");
        if (p && p.trim()) return p.trim();
    } catch { /* swallow */ }
    return "";
}

function goToSurface(surface: string): void {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("surface", surface);
        window.history.pushState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
    } catch { /* swallow */ }
}

const SURFACE_LINKS: Array<{ id: string; label: string; hint: string; eligible: EligibleSection }> = [
    {
        id: "ai-insights", label: "AI Insights", hint: "Narrative summary of the current scope",
        eligible: { type: "data_insight", title: "AI Insights — current scope",
            source: { surface: "ai-insights", source_object_id: "ai-insights:current" },
            provenance: { semantic_ref: "surface:ai-insights", classification: "internal" } },
    },
    {
        id: "ask-pulse", label: "Ask Pulse", hint: "Grounded natural-language follow-ups",
        eligible: { type: "grounded_answer", title: "Ask Pulse — grounded answer",
            source: { surface: "ask-pulse", source_object_id: "ask-pulse:latest" },
            provenance: { semantic_ref: "surface:ask-pulse", classification: "internal" } },
    },
    {
        id: "bi-viz", label: "Dashboard", hint: "The embedded BI surface",
        eligible: { type: "bi_view_state", title: "Dashboard — current view",
            source: { surface: "bi-viz", source_object_id: "bi-viz:current" },
            provenance: { semantic_ref: "surface:bi-viz", classification: "internal" } },
    },
];

function DeferredRegion({ title, note }: { title: string; note: string }) {
    return (
        <section style={{
            border: "1px dashed rgba(128,128,128,0.35)", borderRadius: 12, padding: "14px 16px",
            background: "rgba(127,127,127,0.03)",
        }}>
            <div style={{ fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#98a2b3)" }}>
                {title.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--pp-muted,#98a2b3)", marginTop: 6, lineHeight: 1.5 }}>
                {note}
            </div>
        </section>
    );
}

/** Collapse the workspace to one column on narrow viewports (§10 combined-mobile). */
function useIsNarrow(): boolean {
    const [narrow, setNarrow] = useState(() =>
        typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia("(max-width: 820px)").matches : false);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(max-width: 820px)");
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    return narrow;
}

export function DecisionCanvasShell(): React.ReactElement {
    const proxyBase = readProxyBase();
    const activeProfile = readActiveProfile();
    const narrow = useIsNarrow();

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--pp-app-bg, transparent)" }}>
            {/* Context bar */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 20px", borderBottom: "1px solid rgba(128,128,128,0.2)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 15.5 }}>My Decision Canvas</strong>
                    <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 999,
                        background: "rgba(37,99,235,0.12)", color: "#2563eb",
                    }}>COMBINED</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--pp-muted,#98a2b3)" }}>
                    One workspace: see the issue, inspect evidence, act. Segregated screens stay available in Settings.
                </div>
            </header>

            <main style={{
                flex: "1 1 auto", display: "grid",
                gridTemplateColumns: narrow ? "1fr" : "minmax(0, 2fr) minmax(260px, 1fr)",
                gap: 16, padding: narrow ? 14 : 20, alignItems: "start",
            }}>
                {/* Primary column: Action Inbox (real, governed) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                    <section style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{
                            padding: "10px 16px", borderBottom: "1px solid rgba(128,128,128,0.2)",
                            fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#667085)",
                        }}>ACTION INBOX</div>
                        <ActionInsightsPanel proxyBase={proxyBase} assistantProfile={activeProfile} />
                    </section>

                    <MyCanvasRegion />
                </div>

                {/* Side column: surface hub + deferred regions */}
                <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: narrow ? "static" : "sticky", top: 20 }}>
                    <section style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#667085)", marginBottom: 8 }}>
                            OPEN A SURFACE
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {SURFACE_LINKS.map((s) => (
                                <div key={s.id} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                                    border: "1px solid rgba(128,128,128,0.3)", borderRadius: 9, padding: "8px 10px",
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => goToSurface(s.id)}
                                        style={{ textAlign: "left", border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, flex: "1 1 auto", minWidth: 0 }}
                                    >
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                                        <div style={{ fontSize: 11, color: "var(--pp-muted,#98a2b3)" }}>{s.hint}</div>
                                    </button>
                                    <SaveChannel compact eligible={s.eligible} />
                                </div>
                            ))}
                        </div>
                    </section>

                    <DeferredRegion
                        title="Saved Items"
                        note="Bookmarks and snapshots not currently on the Canvas will list here once server-side saved-item persistence ships."
                    />
                    <DeferredRegion
                        title="Suggested for You"
                        note="Up to three explainable, governed suggestions arrive with the relevance phase. Suggestions never change your permissions or a decision's severity."
                    />
                </aside>
            </main>
        </div>
    );
}
