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

import { useEffect, useMemo, useState } from "react";
import {
    Clock, Sparkles, MessageCircle, BarChart3, LayoutGrid, Bell, ShieldCheck,
    CircleDollarSign, ListChecks, CheckCircle2, Bookmark,
} from "lucide-react";
import { ActionInsightsPanel } from "../components/ActionInsightsPanel";
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

const NAV: Array<{ id: string; label: string; Icon: typeof Clock; unified?: boolean }> = [
    { id: "unified", label: "Unified Canvas", Icon: LayoutGrid, unified: true },
    { id: "action-insights", label: "Decision Assist", Icon: Clock },
    { id: "insights", label: "AI Insights", Icon: Sparkles },
    { id: "chat", label: "Ask Pulse", Icon: MessageCircle },
    { id: "bi-viz", label: "Dashboard", Icon: BarChart3 },
];

const TERMINAL = new Set(["actioned", "rejected", "false-positive", "snoozed"]);
const SEV_ORDER = ["critical", "high", "medium", "low"] as const;
const SEV_COLOR: Record<string, string> = {
    critical: "var(--pp-bad)", high: "var(--pp-warn)", medium: "var(--pp-violet)", low: "var(--color-neutral-400, #b7b7ba)",
};

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "—";
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

/** Real severity distribution → SVG donut arcs (bad/warn/violet/neutral). */
function SeverityDonut({ counts }: { counts: Record<string, number> }) {
    const total = SEV_ORDER.reduce((s, k) => s + (counts[k] || 0), 0);
    const C = 2 * Math.PI * 15.5;
    let offset = 0;
    return (
        <div className="dcc-donut-wrap">
            <svg width="130" height="130" viewBox="0 0 36 36" aria-label="Open decisions by severity">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-neutral-200, #e7e7ea)" strokeWidth="4" />
                {total > 0 && SEV_ORDER.map((k) => {
                    const n = counts[k] || 0;
                    if (!n) return null;
                    const len = (n / total) * C;
                    const el = (
                        <circle key={k} cx="18" cy="18" r="15.5" fill="none" stroke={SEV_COLOR[k]} strokeWidth="4"
                            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                            strokeLinecap="butt" transform="rotate(-90 18 18)" />
                    );
                    offset += len;
                    return el;
                })}
                <text x="18" y="20" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="7" fontWeight="600" fill="var(--color-text)">{total}</text>
            </svg>
            <div className="dcc-donut-legend">
                <span style={{ color: "var(--pp-bad)" }}>● Critical</span>
                <span style={{ color: "var(--pp-warn)" }}>● High</span>
                <span style={{ color: "var(--pp-violet)" }}>● Medium</span>
            </div>
        </div>
    );
}

function DeferredCard({ title, ai, note }: { title: string; ai?: boolean; note: string }) {
    return (
        <div className="dcc-card dcc-pad">
            <div className="dcc-chart-head">
                <h3 className="dcc-section-title">{title}</h3>
                {ai && <span className="dcc-chip" style={{ background: "var(--pp-violet-soft)", color: "var(--pp-violet)", padding: "2px 7px", fontSize: 9.5 }}>AI</span>}
            </div>
            <p className="dcc-empty">{note}</p>
        </div>
    );
}

export function DecisionCanvasShell(): React.ReactElement {
    const proxyBase = readProxyBase();
    const activeProfile = readActiveProfile();
    const narrow = useIsNarrow();
    const [prompts, setPrompts] = useState<DecisionPrompt[]>([]);
    const persona = readDemoPersona();

    const kpi = useMemo(() => {
        const open = prompts.filter((p) => !TERMINAL.has(p.status));
        const counts: Record<string, number> = {};
        let impact = 0;
        let approvals = 0;
        for (const p of open) {
            counts[p.severity] = (counts[p.severity] || 0) + 1;
            if (p.business_impact_unit === "USD") impact += p.business_impact_value || 0;
            if (p.approval_required) approvals += 1;
        }
        const resolved = prompts.filter((p) => TERMINAL.has(p.status)).length;
        const impactBySev = SEV_ORDER.map((k) => ({
            k,
            sum: open.filter((p) => p.severity === k && p.business_impact_unit === "USD")
                .reduce((s, p) => s + (p.business_impact_value || 0), 0),
        })).filter((r) => r.sum > 0);
        const maxSev = Math.max(1, ...impactBySev.map((r) => r.sum));
        return { open: open.length, counts, impact, approvals, resolved, impactBySev, maxSev };
    }, [prompts]);

    return (
        <div className={`dc-cockpit${narrow ? " dc-cockpit--narrow" : ""}`}>
            {/* ── Sidebar ── */}
            <aside className="dcc-side">
                <div className="dcc-brand">
                    <span className="dcc-brand-mark"><LayoutGrid size={18} strokeWidth={1.8} aria-hidden /></span>
                    {!narrow && <span className="dcc-brand-name">PulsePlay</span>}
                </div>
                <nav className="dcc-nav">
                    {NAV.map(({ id, label, Icon, unified }) => (
                        <button
                            key={id}
                            type="button"
                            className={`dcc-navlink${unified ? " is-active" : ""}`}
                            onClick={() => { if (!unified) goToSurface(id); }}
                            aria-current={unified ? "page" : undefined}
                        >
                            <Icon size={18} strokeWidth={1.8} aria-hidden />
                            <span className="dcc-navlabel">{label}</span>
                        </button>
                    ))}
                </nav>
                <div className="dcc-side-foot">
                    <div className="dcc-gov-card">
                        <div className="dcc-gov-title">Governed &amp; Fresh</div>
                        <div className="dcc-gov-meta">
                            {activeProfile ? `Connector: ${activeProfile}` : "No connector selected"} · session-fresh
                        </div>
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <div className="dcc-main">
                <div className="dcc-topbar">
                    <h1 className="dcc-title">My Decision Canvas</h1>
                    <div className="dcc-topbar-right">
                        <span className="dcc-chip dcc-chip--gov"><ShieldCheck size={13} strokeWidth={1.8} aria-hidden /> Governed</span>
                        <button type="button" className="dcc-iconbtn" aria-label="Notifications"><Bell size={16} strokeWidth={1.8} aria-hidden /></button>
                        <div className="dcc-persona">
                            <span className="dcc-persona-avatar">{initialsOf(persona)}</span>
                            {!narrow && (
                                <span className="dcc-persona-name">
                                    <b>{persona || "Verify persona"}</b>
                                    <span>{persona ? "demo persona" : "no role bound"}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="dcc-content">
                    {/* KPI strip — real, derived from the open decisions */}
                    <div className="dcc-kpis">
                        <div className="dcc-kpi dcc-kpi--bad">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CircleDollarSign size={18} strokeWidth={1.8} aria-hidden /></span>
                            </div>
                            <div>
                                <div className="dcc-kpi-value">{kpi.impact > 0 ? fmtUsd(kpi.impact) : "—"}</div>
                                <div className="dcc-kpi-label">Impact at risk (open)</div>
                            </div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--violet">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><ListChecks size={18} strokeWidth={1.8} aria-hidden /></span>
                            </div>
                            <div>
                                <div className="dcc-kpi-value">{kpi.open}</div>
                                <div className="dcc-kpi-label">Open decisions</div>
                            </div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--warn">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><Clock size={18} strokeWidth={1.8} aria-hidden /></span>
                            </div>
                            <div>
                                <div className="dcc-kpi-value">{kpi.approvals}</div>
                                <div className="dcc-kpi-label">Awaiting approval</div>
                            </div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--good">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CheckCircle2 size={18} strokeWidth={1.8} aria-hidden /></span>
                            </div>
                            <div>
                                <div className="dcc-kpi-value">{kpi.resolved}</div>
                                <div className="dcc-kpi-label">Resolved this session</div>
                            </div>
                        </div>
                    </div>

                    {/* Chart row — impact-by-severity bars + severity donut (both real) */}
                    <div className="dcc-charts">
                        <div className="dcc-card dcc-pad">
                            <div className="dcc-chart-head">
                                <h3 className="dcc-section-title">Open impact by severity</h3>
                                <span className="dcc-list-ts">measured · deterministic</span>
                            </div>
                            {kpi.impactBySev.length ? (
                                <div className="dcc-sevbars">
                                    {kpi.impactBySev.map((r) => (
                                        <div key={r.k} className="dcc-sevbar-row">
                                            <div className="dcc-sevbar-head">
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                                    <span className="dcc-dot" style={{ background: SEV_COLOR[r.k], borderRadius: 2 }} />
                                                    {r.k[0].toUpperCase() + r.k.slice(1)}
                                                </span>
                                                <b>{fmtUsd(r.sum)}</b>
                                            </div>
                                            <div className="dcc-sevbar-track">
                                                <div className="dcc-sevbar-fill" style={{ width: `${Math.max(4, (r.sum / kpi.maxSev) * 100)}%`, background: SEV_COLOR[r.k] }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="dcc-empty">No dollar-quantified open decisions right now. Impact appears here as the engine surfaces USD-valued findings.</p>
                            )}
                        </div>
                        <div className="dcc-card dcc-pad">
                            <h3 className="dcc-section-title" style={{ marginBottom: 8 }}>Open by severity</h3>
                            <SeverityDonut counts={kpi.counts} />
                        </div>
                    </div>

                    {/* Needs Your Decision — the real governed list */}
                    <div className="dcc-card dcc-decisions">
                        <div className="dcc-decisions-head">
                            <h3 className="dcc-section-title" style={{ fontSize: 17 }}>Needs Your Decision</h3>
                            <span className="dcc-chip" style={{ background: "var(--pp-bad-soft)", color: "var(--pp-bad)", padding: "3px 10px", fontSize: 11 }}>
                                {kpi.open} open · Governed · Tier-first ranking
                            </span>
                        </div>
                        <ActionInsightsPanel proxyBase={proxyBase} assistantProfile={activeProfile} onData={setPrompts} hideHeader />
                    </div>

                    {/* Since You Last Visited + My Canvas */}
                    <div className="dcc-two">
                        <DeferredCard
                            title="Since You Last Visited"
                            note="Change tracking (Updated / Stale / Resolved / New) arrives with the relevance phase — it will list items that moved since your last session."
                        />
                        <div className="dcc-card dcc-pad">
                            <MyCanvasRegion />
                        </div>
                    </div>

                    {/* Saved Items + Suggested */}
                    <div className="dcc-two">
                        <DeferredCard
                            title="Saved Items"
                            note="Bookmarks and snapshots not currently pinned to the Canvas will list here once server-side saved-item persistence ships."
                        />
                        <DeferredCard
                            title="Suggested for You" ai
                            note="Up to three explainable, governed suggestions arrive with the relevance phase. Suggestions never change your permissions or a decision's severity."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
