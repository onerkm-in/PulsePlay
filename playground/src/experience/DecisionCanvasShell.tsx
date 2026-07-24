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
    CircleDollarSign, ListChecks, CheckCircle2, Bookmark, History,
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

const SEV_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

/** Real severity distribution → SVG donut arcs. Scales to the card width, uses a
 *  thinner ring with rounded gaps, a big centre total, and a legend that lists
 *  only the severities actually present (with their counts). */
function SeverityDonut({ counts }: { counts: Record<string, number> }) {
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
                    <span key={k} className="dcc-donut-leg"><span className="dcc-dot" style={{ background: SEV_COLOR[k] }} />{SEV_LABEL[k]} <b>{counts[k]}</b></span>
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
                    {/* KPI strip — real, derived from the open decisions. Each tile
                        carries a context chip (right of the icon) so the top row
                        reads as a proper KPI header, not a lone floating icon. The
                        chips are honest facts about the same prompts, never a
                        fabricated period-over-period delta (we have no history). */}
                    <div className="dcc-kpis">
                        <div className="dcc-kpi dcc-kpi--bad">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CircleDollarSign size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">{kpi.usdCount} USD-valued</span>
                            </div>
                            <div className="dcc-kpi-value">{kpi.impact > 0 ? fmtUsd(kpi.impact) : "—"}</div>
                            <div className="dcc-kpi-label">Impact at risk (open)</div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--violet">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><ListChecks size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">{kpi.critical} critical</span>
                            </div>
                            <div className="dcc-kpi-value">{kpi.open}</div>
                            <div className="dcc-kpi-label">Open decisions</div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--warn">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><Clock size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">HITL-gated</span>
                            </div>
                            <div className="dcc-kpi-value">{kpi.approvals}</div>
                            <div className="dcc-kpi-label">Awaiting approval</div>
                        </div>
                        <div className="dcc-kpi dcc-kpi--good">
                            <div className="dcc-kpi-top">
                                <span className="dcc-kpi-icon"><CheckCircle2 size={18} strokeWidth={1.8} aria-hidden /></span>
                                <span className="dcc-kpi-chip">this session</span>
                            </div>
                            <div className="dcc-kpi-value">{kpi.resolved}</div>
                            <div className="dcc-kpi-label">Resolved this session</div>
                        </div>
                    </div>

                    {/* Chart row — open decisions by severity (count bars, always
                        populated, USD annotated) + severity donut (proportion).
                        Both derived from the same real prompts. */}
                    <div className="dcc-charts">
                        <div className="dcc-card dcc-pad">
                            <div className="dcc-chart-head">
                                <h3 className="dcc-section-title">Open decisions by severity</h3>
                                <span className="dcc-list-ts">measured · deterministic</span>
                            </div>
                            {kpi.bySev.length ? (
                                <div className="dcc-sevbars">
                                    {kpi.bySev.map((r) => (
                                        <div key={r.k} className="dcc-sevbar-row">
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
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="dcc-empty">No open decisions right now — the governed queue is clear.</p>
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
                            Icon={History}
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
