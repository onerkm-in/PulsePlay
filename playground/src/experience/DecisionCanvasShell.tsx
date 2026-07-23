// playground/src/experience/DecisionCanvasShell.tsx
//
// "My Decision Canvas" — the combined single-workspace experience (v3.2 §10). The
// Action Inbox is real and governed (it reuses the same ActionInsightsPanel +
// Decision Assist backend as segregated mode — no forked business logic); My Canvas
// renders the user's real pinned sections; the surfaces remain reachable from one
// workspace. Deferred Canvas regions are honest blueprint scaffolds, not fabricated
// content.
//
// Styled to the Industry design system: a `.industry-surface` ground, blueprint
// cards with corner registration marks, one steel accent voice, square corners, no
// gradients/pills/dashed borders. Token-driven CSS in decisionCanvas.css.

import { useEffect, useState } from "react";
import { ActionInsightsPanel } from "../components/ActionInsightsPanel";
import { MyCanvasRegion } from "../canvas/MyCanvasRegion";
import { SaveChannel } from "../canvas/SaveChannel";
import type { EligibleSection } from "../canvas/canvasTypes";
import "./decisionCanvas.css";

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

function Corners() {
    return (<>
        <i className="corner tl" /><i className="corner tr" />
        <i className="corner bl" /><i className="corner br" />
    </>);
}

/** Honest "arriving later" scaffold — a blueprint card with a neutral kicker, not a
 *  dashed placeholder (Industry rule 10). */
function DeferredRegion({ title, phase, note }: { title: string; phase: string; note: string }) {
    return (
        <section className="dc-card blueprint dc-deferred">
            <Corners />
            <div className="dc-region-head">
                <span className="kicker">{title}</span>
                <span className="tag tag-neutral">{phase}</span>
            </div>
            <p className="dc-deferred-note">{note}</p>
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
        <div className="industry-surface dc-shell">
            <header className="nav dc-context-bar">
                <span className="nav-brand">My Decision Canvas</span>
                <span className="tag tag-accent">Combined</span>
                <span className="dc-context-tagline text-muted">
                    One workspace: see the issue, inspect evidence, act. Segregated screens stay available in Settings.
                </span>
            </header>

            <main className={`dc-main${narrow ? " dc-main--narrow" : ""}`}>
                <div className="dc-col-primary">
                    <section className="dc-card blueprint dc-inbox">
                        <Corners />
                        <div className="dc-region-head"><span className="kicker">Action Inbox</span></div>
                        <ActionInsightsPanel proxyBase={proxyBase} assistantProfile={activeProfile} />
                    </section>

                    <MyCanvasRegion />
                </div>

                <aside className={`dc-col-side${narrow ? " dc-col-side--static" : ""}`}>
                    <section className="dc-card blueprint dc-surface-hub">
                        <Corners />
                        <div className="dc-region-head"><span className="kicker">Open a surface</span></div>
                        <div className="dc-surface-list">
                            {SURFACE_LINKS.map((s) => (
                                <div key={s.id} className="dc-surface-row blueprint">
                                    <Corners />
                                    <button type="button" className="dc-surface-btn" onClick={() => goToSurface(s.id)}>
                                        <span className="dc-surface-label">{s.label}</span>
                                        <span className="dc-surface-hint text-muted">{s.hint}</span>
                                    </button>
                                    <SaveChannel compact eligible={s.eligible} />
                                </div>
                            ))}
                        </div>
                    </section>

                    <DeferredRegion
                        title="Saved Items" phase="Arriving Phase 2"
                        note="Bookmarks and snapshots not currently on the Canvas will list here once server-side saved-item persistence ships."
                    />
                    <DeferredRegion
                        title="Suggested for You" phase="Arriving Phase 2"
                        note="Up to three explainable, governed suggestions arrive with the relevance phase. Suggestions never change your permissions or a decision's severity."
                    />
                </aside>
            </main>
        </div>
    );
}
