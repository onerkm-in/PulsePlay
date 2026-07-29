// playground/src/experience/DecisionCanvasShell.tsx
//
// "My Decision Canvas" — PulsePlay's flagship UNIFIED surface, built as an
// enterprise BI cockpit (docs/MY_DECISION_CANVAS_DESIGN_APPROACH.md, reference
// My Decision Canvas v4): a left sidebar shell, a top bar, and a content column
// with a KPI strip, charts, the governed decision list, and the canvas sections.
//
// Honesty contract: the KPI tiles, the severity donut, and the impact-by-severity
// bars are ALL derived from the SAME real decision prompts the Action Inbox shows
// (the governed Decision Assist backend) — no fabricated business numbers. Series
// we don't actually have (historical trend, change feed, suggestions) render an
// honest deferred/empty state instead of a fake chart.
//
// Visual system: Industry tokens (steel primary accent, Barlow) + the controlled
// four-colour semantic palette for status/severity/delta. Cards are white +
// radius-lg + soft shadow — a deliberate, documented divergence from the flat
// blueprint default because this is a data-dense cockpit.

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Clock, Sparkles, MessageCircle, BarChart3, LayoutGrid, Home, Bell, ShieldCheck,
    CircleDollarSign, ListChecks, CheckCircle2, Bookmark, History,
} from "lucide-react";
import { ActionInsightsPanel, type DecisionViewFilter } from "../components/ActionInsightsPanel";
import type { DecisionPrompt } from "../components/DecisionPromptCard";
import { MyCanvasRegion } from "../canvas/MyCanvasRegion";
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

function readDemoPersona(): string {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem("pulseplay:ai-demo-persona") || ""; } catch { return ""; }
}

function goToSurface(surface: string): void {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("surface", surface);
        window.history.pushState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
    } catch { /* swallow */ }
}

// The screen ids MUST be the canonical SurfaceId values (surfaceRegistry) —
// goToSurface writes ?surface=<id> and the router only hands off to a screen
// when isSurfaceId() accepts it. The Pulse-tab namespace ("insights"/"chat")
// is NOT a SurfaceId, so using those left the AI Insights / Ask Pulse links
// dead in combined mode. Labels match the segregated switcher exactly.
const NAV: Array<{ id: string; label: string; Icon: typeof Clock; unified?: boolean }> = [
    // This entry IS the cockpit you are already on. It was labelled "Unified
    // Canvas" while the page title said "My Decision Canvas", which read like a
    // separate, unbuilt destination. "Overview" says what it is.
    { id: "unified", label: "Overview", Icon: Home, unified: true },
    { id: "action-insights", label: "Decisions", Icon: Clock },
    { id: "ai-insights", label: "AI Insights", Icon: Sparkles },
    { id: "ask-pulse", label: "Ask Pulse", Icon: MessageCircle },
    { id: "bi-viz", label: "Dashboard", Icon: BarChart3 },
];

const TERMINAL = new Set(["actioned", "rejected", "false-positive", "snoozed"]);
const SEV_ORDER = ["critical", "high", "medium", "low"] as const;
// FILL-grade tokens, not the text set: these paint donut arcs and bar fills,
// and the AA-darkened text hues render as muddy olive/maroon at area size.
const SEV_COLOR: Record<string, string> = {
    critical: "var(--pp-bad-fill, #d1453d)", high: "var(--pp-warn-fill, #e0902c)", medium: "var(--pp-violet-fill, #7c5cd8)", low: "var(--color-neutral-400, #b7b7ba)",
};

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    // "n/a" in an avatar circle read as an error state on mobile. A neutral
    // person-ish glyph until a role resolves.
    if (!parts.length) return "•";
    return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

function fmtUsd(n: number): string {
    if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
}

function useIsNarrow(): boolean {
    const [narrow, setNarrow] = useState(() =>
        typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia("(max-width: 960px)").matches : false);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(max-width: 960px)");
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    return narrow;
}

const SEV_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

/** Real severity distribution → SVG donut arcs. Scales to the card width, uses a
 *  thinner ring with rounded gaps, a big centre total, and a legend that lists
 *  only the severities actually present (with their counts). */
function SeverityDonut({ counts, picked, onPick }: {
    counts: Record<string, number>;
    /** Currently-filtered severity, for aria-pressed + the picked style. */
    picked?: string | null;
    /** Legend click → toggle the severity filter in the shell. */
    onPick?: (sev: string) => void;
}) {
    const present = SEV_ORDER.filter((k) => (counts[k] || 0) > 0);
    const total = present.reduce((s, k) => s + (counts[k] || 0), 0);
    const C = 2 * Math.PI * 15.5;
    const gap = present.length > 1 ? 0.6 : 0; // tiny gap between arcs
    let offset = 0;
    return (
        <div className="dcc-donut-wrap">
            <div className="dcc-donut-figure">
                <svg viewBox="0 0 36 36" role="img" aria-label={`Open decisions by severity: ${total} total`} style={{ width: "100%", height: "auto" }}>
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-neutral-200, #e7e7ea)" strokeWidth="3.4" />
                    {present.map((k) => {
                        const n = counts[k] || 0;
                        const len = Math.max(0, (n / total) * C - gap);
                        const el = (
                            <circle key={k} cx="18" cy="18" r="15.5" fill="none" stroke={SEV_COLOR[k]} strokeWidth="3.4"
                                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                                strokeLinecap="round" transform="rotate(-90 18 18)" />
                        );
                        offset += (n / total) * C;
                        return el;
                    })}
                    <text x="18" y="17.5" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="8" fontWeight="600" fill="var(--color-text)">{total}</text>
                    <text x="18" y="23" textAnchor="middle" fontFamily="var(--font-body)" fontSize="3.1" fill="var(--color-neutral-600, #7a7a7d)">open</text>
                </svg>
            </div>
            <div className="dcc-donut-legend">
                {present.map((k) => (
                    onPick ? (
                        <button
                            type="button" key={k}
                            className={`dcc-donut-leg dcc-donut-leg--btn${picked === k ? " is-picked" : ""}`}
                            onClick={() => onPick(k)}
                            aria-pressed={picked === k}
                            title={picked === k ? "Show everything again" : `Show only ${SEV_LABEL[k].toLowerCase()} decisions`}
                        ><span className="dcc-dot" style={{ background: SEV_COLOR[k] }} />{SEV_LABEL[k]} <b>{counts[k]}</b></button>
                    ) : (
                        <span key={k} className="dcc-donut-leg"><span className="dcc-dot" style={{ background: SEV_COLOR[k] }} />{SEV_LABEL[k]} <b>{counts[k]}</b></span>
                    )
                ))}
                {!present.length && <span className="dcc-empty" style={{ padding: 0 }}>No open decisions.</span>}
            </div>
        </div>
    );
}

function DeferredCard({ title, ai, note, Icon }: { title: string; ai?: boolean; note: string; Icon: typeof Clock }) {
    return (
        <div className="dcc-card dcc-pad dcc-deferred">
            <div className="dcc-chart-head">
                <h3 className="dcc-section-title">{title}</h3>
                {ai
                    ? <span className="dcc-chip" style={{ background: "var(--pp-violet-soft)", color: "var(--pp-violet)", padding: "2px 8px", fontSize: 10 }}>AI</span>
                    : <span className="dcc-soon">Coming soon</span>}
            </div>
            <div className="dcc-deferred-body">
                <span className="dcc-deferred-icon"><Icon size={20} strokeWidth={1.6} aria-hidden /></span>
                <p className="dcc-empty">{note}</p>
            </div>
        </div>
    );
}

export function DecisionCanvasShell({ mode = "combined" }: { mode?: "cockpit" | "combined" }): React.ReactElement {
    const proxyBase = readProxyBase();
    const activeProfile = readActiveProfile();
    const narrow = useIsNarrow();
    const [prompts, setPrompts] = useState<DecisionPrompt[]>([]);
    // Starts at "loading" because the decision store now auto-loads on arrival.
    // Without this the derived cards read an empty list as "all caught up" and
    // tell the user there is nothing to do while the fetch is still running.
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const scanning = status === "loading";
    // Persona is state, not a bare read: the cockpit had no way to change it at
    // all (the segregated surface has a Planner/Manager switch), so a manager
    // could not see their own approval queue. Switching remounts the decision
    // panel via `key` — a different persona is a different cache scope, and the
    // refetch is explicit user intent.
    const [persona, setPersona] = useState<string>(() => readDemoPersona());
    // What the SERVER resolved — the demo switch is only a hint, and the server
    // ignores it when demo switching is off or an IdP role is bound (SEC-01).
    // The switcher's pressed state and the avatar follow THIS, never the local
    // request; anything else shows authority the caller doesn't have.
    const [resolved, setResolved] = useState<{ persona: string; source: string } | null>(null);
    const choosePersona = (p: string) => {
        try { window.localStorage.setItem("pulseplay:ai-demo-persona", p); } catch { /* private mode */ }
        setPersona(p);
        setStatus("loading");
        setPrompts([]);
    };
    const shownPersona = resolved?.persona || "";
    // The user asked for a persona the server did not grant → say so instead
    // of silently snapping the buttons back.
    const personaIgnored = !!(persona && resolved && resolved.persona !== persona);
    // Cockpit mode = a single interface, everything on one plate, with NO
    // cross-screen navigation. Combined mode = the cockpit PLUS the screen nav.
    const showNav = mode === "combined";

    // Interactive summary → the decision list. Clicking a KPI card, a severity
    // bar or a donut legend entry applies a DISPLAY filter over the prompts
    // already on the page and scrolls to the list — same fetch, no new query,
    // and the summary numbers never change (they stay derived from the full
    // set, so a filter can never contradict the tiles that set it).
    const [view, setView] = useState<DecisionViewFilter | null>(null);
    const decisionsRef = useRef<HTMLDivElement | null>(null);
    const applyView = (next: DecisionViewFilter | null) => {
        setView(next);
        const reduce = typeof window !== "undefined"
            && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        decisionsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    };
    const toggleSeverity = (s: DecisionPrompt["severity"]) =>
        applyView(view?.severity === s ? null : { severity: s });
    const viewLabel = view?.severity
        ? `${SEV_LABEL[view.severity] || view.severity} only`
        : view?.status === "awaiting-approval" ? "waiting on a manager"
            : view?.status === "resolved" ? "already sorted" : null;

    const kpi = useMemo(() => {
        const open = prompts.filter((p) => !TERMINAL.has(p.status));
        const counts: Record<string, number> = {};
        let impact = 0;
        let approvals = 0;
        let usdCount = 0;
        for (const p of open) {
            counts[p.severity] = (counts[p.severity] || 0) + 1;
            if (p.business_impact_unit === "USD") { impact += p.business_impact_value || 0; usdCount += 1; }
            if (p.approval_required) approvals += 1;
        }
        const resolved = prompts.filter((p) => TERMINAL.has(p.status)).length;
        // Per-severity breakdown across ALL severities that have an open decision
        // (count-based — always populated when decisions exist, unlike the old
        // USD-only filter that left the card empty). USD impact is annotated per
        // row where the engine surfaced a dollar figure.
        const bySev = SEV_ORDER
            .map((k) => ({
                k,
                count: open.filter((p) => p.severity === k).length,
                usd: open.filter((p) => p.severity === k && p.business_impact_unit === "USD")
                    .reduce((s, p) => s + (p.business_impact_value || 0), 0),
            }))
            .filter((r) => r.count > 0);
        const maxCount = Math.max(1, ...bySev.map((r) => r.count));
        const critical = counts.critical || 0;
        return { open: open.length, counts, impact, approvals, resolved, usdCount, bySev, maxCount, critical };
    }, [prompts]);

    return (
        <div className={`dc-cockpit${narrow ? " dc-cockpit--narrow" : ""}`}>
            {/* ── Sidebar ── */}
            <aside className="dcc-side">
                <div className="dcc-brand">
                    <span className="dcc-brand-mark"><LayoutGrid size={18} strokeWidth={1.8} aria-hidden /></span>
                    {!narrow && <span className="dcc-brand-name">PulsePlay</span>}
                </div>
                {showNav && (
                <nav className="dcc-nav">
                    {NAV.map(({ id, label, Icon, unified }) => (
                        <button
                            key={id}
                            type="button"
                            className={`dcc-navlink${unified ? " is-active" : ""}`}
                            onClick={() => { if (!unified) goToSurface(id); }}
                            aria-current={unified ? "page" : undefined}
                            aria-label={label}
                            title={label}
                        >
                            <Icon size={18} strokeWidth={1.8} aria-hidden />
                            <span className="dcc-navlabel">{label}</span>
                            {/* A count only where one is real. Decisions is the sole
                                screen whose backlog we have already measured on this
                                page; badging the others would be decoration. */}
                            {id === "action-insights" && !scanning && kpi.open > 0 && (
                                <span className="dcc-navbadge" aria-label={`${kpi.open} waiting`}>{kpi.open}</span>
                            )}
                        </button>
                    ))}
                </nav>
                )}
                <div className="dcc-side-foot">
                    {/* Fills what was dead space with the control the cockpit was
                        missing outright. Server-side authorization is unchanged —
                        this only sends a hint header, and is ignored once a real
                        IdP role is bound. */}
                    {!narrow && (
                        <div className="dcc-personapick">
                            <div className="dcc-personapick-label">I'm working as</div>
                            {["Supply Chain Planner", "Supply Chain Manager"].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    // Pressed state = the persona the SERVER resolved,
                                    // never the local request (SEC-01).
                                    className={`dcc-personabtn${shownPersona === p ? " is-on" : ""}`}
                                    aria-pressed={shownPersona === p}
                                    onClick={() => choosePersona(p)}
                                >{p.replace("Supply Chain ", "")}</button>
                            ))}
                            {personaIgnored && (
                                <div className="dcc-personapick-note" role="status">
                                    Your role is set by the server, so this switch is off here.
                                </div>
                            )}
                        </div>
                    )}
                    <div className="dcc-gov-card">
                        <div className="dcc-gov-title">Your data is live</div>
                        <div className="dcc-gov-meta">
                            {activeProfile ? `Reading from ${activeProfile}` : "No data source picked yet"} · loaded this visit
                        </div>
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <div className="dcc-main">
                <div className="dcc-topbar">
                    {/* A first-time reader should not have to infer what this screen
                        is for. One plain sentence, no jargon, no acronyms. */}
                    <div className="dcc-titlewrap">
                        <h1 className="dcc-title">My Decision Canvas</h1>
                        <p className="dcc-subtitle">
                            Problems we found in your supply chain, and what you can do about each one.
                        </p>
                    </div>
                    <div className="dcc-topbar-right">
                        <span className="dcc-chip dcc-chip--gov" title="Every number here is measured from your data and every action checks your permissions first."><ShieldCheck size={13} strokeWidth={1.8} aria-hidden /> Checked</span>
                        <button type="button" className="dcc-iconbtn" aria-label="Notifications"><Bell size={16} strokeWidth={1.8} aria-hidden /></button>
                        <div className="dcc-persona">
                            <span className="dcc-persona-avatar">{initialsOf(shownPersona)}</span>
                            {!narrow && (
                                <span className="dcc-persona-name">
                                    <b>{shownPersona || "Checking who you are…"}</b>
                                    <span>{resolved ? (resolved.source === "demo" ? "demo role" : "your role") : ""}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="dcc-content">
                    {/* KPI strip — real, derived from the open decisions. Each tile
                        carries a context chip (right of the icon) so the top row
                        reads as a proper KPI header, not a lone floating icon. The
                        chips are honest facts about the same prompts, never a
                        fabricated period-over-period delta (we have no history). */}
                    {/* Every tile is a real action, not just a status: clicking
                        jumps to the decisions it counts (with the matching view
                        filter). The visible "→" line says what the click does. */}
                    <div className="dcc-kpis">
                        <button type="button" className="dcc-kpi dcc-kpi--bad" onClick={() => applyView(null)}
                            aria-label="Show the decisions this money is tied to">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CircleDollarSign size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">{kpi.usdCount} priced in $</span>
                            </div>
                            <div className="dcc-kpi-value">{kpi.impact > 0 ? fmtUsd(kpi.impact) : "—"}</div>
                            <div className="dcc-kpi-label">Money at risk if nobody acts</div>
                            <div className="dcc-kpi-go">See what's at risk →</div>
                        </button>
                        <button type="button" className="dcc-kpi dcc-kpi--violet" onClick={() => applyView(null)}
                            aria-label="Show every decision waiting on you">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><ListChecks size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">{kpi.critical} most urgent</span>
                            </div>
                            <div className="dcc-kpi-value">{scanning ? "—" : kpi.open}</div>
                            <div className="dcc-kpi-label">Waiting for you to decide</div>
                            <div className="dcc-kpi-go">Review them →</div>
                        </button>
                        <button type="button" className="dcc-kpi dcc-kpi--warn" onClick={() => applyView({ status: "awaiting-approval" })}
                            aria-label="Show only the decisions waiting on a manager's approval">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><Clock size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">a person must say yes</span>
                            </div>
                            <div className="dcc-kpi-value">{scanning ? "—" : kpi.approvals}</div>
                            <div className="dcc-kpi-label">Need a manager's approval</div>
                            <div className="dcc-kpi-go">See who's waiting →</div>
                        </button>
                        <button type="button" className="dcc-kpi dcc-kpi--good" onClick={() => applyView({ status: "resolved" })}
                            aria-label="Show the decisions you already sorted">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CheckCircle2 size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">this visit</span>
                            </div>
                            <div className="dcc-kpi-value">{scanning ? "—" : kpi.resolved}</div>
                            <div className="dcc-kpi-label">Already sorted by you</div>
                            <div className="dcc-kpi-go">See what you did →</div>
                        </button>
                    </div>

                    {/* Chart row — open decisions by severity (count bars, always
                        populated, USD annotated) + severity donut (proportion).
                        Both derived from the same real prompts. */}
                    <div className="dcc-charts">
                        <div className="dcc-card dcc-pad">
                            <div className="dcc-chart-head">
                                <h3 className="dcc-section-title">How urgent are they?</h3>
                                {/* Plain English, but the provenance claim is unchanged: these
                                    counts are measured from the warehouse, not model output. */}
                                <span className="dcc-list-ts">counted from your data · not AI</span>
                            </div>
                            {kpi.bySev.length ? (
                                <div className="dcc-sevbars">
                                    {kpi.bySev.map((r) => (
                                        <button
                                            type="button"
                                            key={r.k}
                                            className={`dcc-sevbar-row${view?.severity === r.k ? " is-picked" : ""}`}
                                            onClick={() => toggleSeverity(r.k as DecisionPrompt["severity"])}
                                            aria-pressed={view?.severity === r.k}
                                            aria-label={`Show only ${r.k} decisions (${r.count})`}
                                            title={view?.severity === r.k ? "Show everything again" : `Show only ${r.k} decisions`}
                                        >
                                            <div className="dcc-sevbar-head">
                                                <span className="dcc-sevbar-name">
                                                    <span className="dcc-dot" style={{ background: SEV_COLOR[r.k], borderRadius: 2 }} />
                                                    {r.k[0].toUpperCase() + r.k.slice(1)}
                                                </span>
                                                <span className="dcc-sevbar-val">
                                                    {r.usd > 0 && <span className="dcc-sevbar-usd">{fmtUsd(r.usd)}</span>}
                                                    <b>{r.count}</b>
                                                </span>
                                            </div>
                                            <div className="dcc-sevbar-track">
                                                <div className="dcc-sevbar-fill" style={{ width: `${Math.max(6, (r.count / kpi.maxCount) * 100)}%`, background: SEV_COLOR[r.k] }} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="dcc-empty">
                                    {scanning
                                        ? "Checking your supply chain…"
                                        : "Nothing needs your decision right now. You're all caught up."}
                                </p>
                            )}
                        </div>
                        <div className="dcc-card dcc-pad">
                            <h3 className="dcc-section-title" style={{ marginBottom: 8 }}>The share of each</h3>
                            <SeverityDonut counts={kpi.counts} picked={view?.severity} onPick={(s) => toggleSeverity(s as DecisionPrompt["severity"])} />
                        </div>
                    </div>

                    {/* Needs Your Decision — the real governed list */}
                    <div className="dcc-card dcc-decisions" ref={decisionsRef}>
                        <div className="dcc-decisions-head">
                            <h3 className="dcc-section-title" style={{ fontSize: 17 }}>Needs Your Decision</h3>
                            {viewLabel ? (
                                // The active filter must be visible and one click
                                // from gone — a silently narrowed list reads as
                                // missing decisions.
                                <button
                                    type="button"
                                    className="dcc-chip dcc-viewchip"
                                    onClick={() => setView(null)}
                                    aria-label={`Showing ${viewLabel}. Clear this filter`}
                                >Showing {viewLabel} · show all ✕</button>
                            ) : (
                                <span className="dcc-chip" style={{ background: "var(--pp-bad-soft)", color: "var(--pp-bad)", padding: "3px 10px", fontSize: 11 }}>
                                    {kpi.open} to review · most urgent first
                                </span>
                            )}
                        </div>
                        {/* view ?? {} — the cockpit's DEFAULT is open-decisions-only:
                            a done card under "Needs Your Decision" invites deciding it
                            twice. Resolved ones live behind the green tile. */}
                        <ActionInsightsPanel key={persona || "none"} proxyBase={proxyBase} assistantProfile={activeProfile} onData={setPrompts} onStatus={setStatus} onResolvedPersona={setResolved} hideHeader view={view ?? {}} />
                    </div>

                    {/* Since You Last Visited + My Canvas */}
                    <div className="dcc-two">
                        <DeferredCard
                            title="Since You Last Visited"
                            Icon={History}
                            note="Change tracking (Updated / Stale / Resolved / New) arrives with the relevance phase. It will list items that moved since your last session."
                        />
                        <div className="dcc-card dcc-pad">
                            <MyCanvasRegion />
                        </div>
                    </div>

                    {/* Saved Items + Suggested */}
                    <div className="dcc-two">
                        <DeferredCard
                            title="Saved Items"
                            Icon={Bookmark}
                            note="Bookmarks and snapshots not currently pinned to the Canvas will list here once server-side saved-item persistence ships."
                        />
                        <DeferredCard
                            title="Suggested for You" ai
                            Icon={Sparkles}
                            note="Up to three explainable, governed suggestions arrive with the relevance phase. Suggestions never change your permissions or a decision's severity."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
