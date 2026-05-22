// playground/src/components/SustainabilityIndicator.tsx
//
// "Green leaf" indicator at the bottom of the AISidebar showing how
// efficient (token-wise) the current session is.
//
// Motto: fewer tokens, better accuracy — the lean-and-mean solution.
//
// 2026-05-19 UX pass:
//   - Tier-matched animations: calm breathing (lean/green), quickening
//     pulse + warmth drift (moderate/heavy), stress shimmer (very-heavy).
//   - Click to pin/unpin the panel (works on touch too, not just hover).
//   - Human-readable panel copy — no raw token counts as the headline.
//   - Outside-click to dismiss.

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
    getSessionUsage,
    subscribeUsage,
    resetSessionUsage,
    tierLabel,
    tierColor,
    tierEmoji,
    tierFace,
    tierTagline,
    type SessionUsage,
    type GreennessTier,
} from "../lib/usageTracker";

export interface SustainabilityIndicatorProps {
    override?: SessionUsage | null;
    compact?: boolean;
    showReset?: boolean;
}

// ── Animation keyframes injected once ────────────────────────────────────
// Each tier gets its own animation so the indicator "feels" different
// at each stage. All are CSS-only — no JS timers.

const KEYFRAMES = `
@keyframes si-breathe-lean {
    0%, 100% { transform: scale(1);    opacity: 1; }
    50%       { transform: scale(1.18); opacity: 0.85; }
}
@keyframes si-breathe-green {
    0%, 100% { transform: scale(1);    opacity: 1; }
    50%       { transform: scale(1.12); opacity: 0.9; }
}
@keyframes si-breathe-moderate {
    0%, 100% { transform: scale(1);    opacity: 1; }
    40%       { transform: scale(1.08); opacity: 0.9; }
}
@keyframes si-pulse-heavy {
    0%, 100% { transform: scale(1) rotate(0deg);   opacity: 1;    }
    30%       { transform: scale(1.1)  rotate(-3deg); opacity: 0.85; }
    60%       { transform: scale(0.95) rotate(2deg);  opacity: 0.9; }
}
@keyframes si-stress {
    0%, 100% { transform: translateX(0)    scale(1);    filter: brightness(1); }
    15%       { transform: translateX(-2px) scale(1.05); filter: brightness(1.15); }
    35%       { transform: translateX(2px)  scale(0.98); filter: brightness(1.2); }
    55%       { transform: translateX(-1px) scale(1.04); filter: brightness(1.1); }
    75%       { transform: translateX(1px)  scale(0.97); filter: brightness(1.18); }
}
`;

/** Leaf animation spec per tier. */
function leafAnimation(tier: GreennessTier): string {
    switch (tier) {
        case "ready":     return "none";
        case "lean":      return "si-breathe-lean 3s ease-in-out infinite";
        case "green":     return "si-breathe-green 4s ease-in-out infinite";
        case "moderate":  return "si-breathe-moderate 2.2s ease-in-out infinite";
        case "heavy":     return "si-pulse-heavy 1.6s ease-in-out infinite";
        case "very-heavy":return "si-stress 0.9s ease-in-out infinite";
    }
}

/** Human-readable headline for each tier. */
function tierHeadline(tier: GreennessTier, questionCount: number): string {
    if (questionCount === 0) {
        return "Ready when you are";
    }
    switch (tier) {
        case "lean":      return "Thriving — very efficient";
        case "green":     return "Healthy — good efficiency";
        case "moderate":  return "Warming up — growing cost";
        case "heavy":     return "Getting heavy — consider a fresh start";
        case "very-heavy":return "Overloaded — best to start a new conversation";
        default:          return "Idle";
    }
}

/** Human explanation shown in the panel body. No raw token counts. */
function tierExplanation(tier: GreennessTier, questionCount: number): string {
    if (questionCount === 0) {
        return "Ask your first question. PulsePlay keeps prompts lean so you get accurate answers at low cost.";
    }
    switch (tier) {
        case "lean":
            return "Short, focused questions are working well. This is the sweet spot — the AI has just enough context to reason accurately without excess.";
        case "green":
            return "Conversation is in good shape. A little more context has accumulated but it's still well within efficient range.";
        case "moderate":
            return "The conversation is getting longer. This is fine for complex analysis, but if answers start feeling slower or less precise, try a fresh start.";
        case "heavy":
            return "A lot of context is in play. Very long conversations can make the AI less precise and cost more per answer. Consider clicking Reset to start fresh.";
        case "very-heavy":
            return "The session has accumulated a very large amount of context. Starting a new conversation will give you faster, sharper answers right away.";
        default:
            return "";
    }
}

let _styleInjected = false;

function injectStyles() {
    if (_styleInjected || typeof document === "undefined") return;
    _styleInjected = true;
    const style = document.createElement("style");
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
}

export function SustainabilityIndicator(props: SustainabilityIndicatorProps): ReactElement {
    const [usage, setUsage] = useState<SessionUsage>(
        props.override ?? getSessionUsage(),
    );
    const [hover, setHover] = useState(false);
    const [pinned, setPinned] = useState(false);

    const rootRef = useRef<HTMLDivElement>(null);

    // Inject keyframes once.
    injectStyles();

    useEffect(() => {
        if (props.override) {
            setUsage(props.override);
            return;
        }
        const unsubscribe = subscribeUsage(setUsage);
        setUsage(getSessionUsage());
        return unsubscribe;
    }, [props.override]);

    // Close on outside click when pinned.
    const handleOutsideClick = useCallback((e: MouseEvent) => {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
            setPinned(false);
        }
    }, []);

    useEffect(() => {
        if (pinned) {
            document.addEventListener("pointerdown", handleOutsideClick);
            return () => document.removeEventListener("pointerdown", handleOutsideClick);
        }
    }, [pinned, handleOutsideClick]);

    const isOpen = hover || pinned;

    const color = tierColor(usage.tier);
    const leaf = tierEmoji(usage.tier);
    const face = tierFace(usage.tier);
    const label = tierLabel(usage.tier);
    const tagline = tierTagline(usage.tier);
    const anim = leafAnimation(usage.tier);

    const barPct = Math.min(100, Math.round((usage.totalTokens / 50_000) * 100));

    const tokenNote = usage.questionCount === 0
        ? null
        : `${usage.hasEstimates && !usage.hasRealData ? "~" : ""}${_formatTokens(usage.totalTokens)} tokens · ${usage.questionCount} question${usage.questionCount === 1 ? "" : "s"}`;

    return (
        <div
            ref={rootRef}
            className="pp-sustainability"
            data-testid="pp-sustainability"
            data-tier={usage.tier}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={(e) => {
                // Only close on blur if focus moved outside the component.
                if (!rootRef.current?.contains(e.relatedTarget as Node)) {
                    setHover(false);
                }
            }}
            onClick={() => setPinned(p => !p)}
            tabIndex={0}
            role="status"
            aria-label={`Session sustainability: ${label}`}
            aria-expanded={isOpen}
            style={{
                position: "relative",
                padding: props.compact ? "4px 8px" : "6px 10px",
                fontSize: 11,
                color: "var(--pp-text-muted, #6b7280)",
                background: "var(--pp-surface-muted, #fafafa)",
                borderTop: "1px solid var(--pp-border, #e5e7eb)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                userSelect: "none",
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    fontSize: 16,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    animation: anim,
                    transformOrigin: "center bottom",
                    willChange: anim !== "none" ? "transform, opacity" : "auto",
                }}
            >
                {leaf}
                <span style={{ fontSize: 13 }}>{face}</span>
            </span>
            <span
                className="pp-sustainability__label"
                data-testid="pp-sustainability-label"
                style={{ fontWeight: 600, color }}
            >
                {label}
            </span>
            {/* Compact token count — still in the bar for scanability */}
            <span
                className="pp-sustainability__tokens"
                data-testid="pp-sustainability-tokens"
                style={{ color: "var(--pp-text-muted, #6b7280)", fontSize: 10 }}
            >
                {usage.questionCount === 0
                    ? "0 tokens"
                    : `${usage.hasEstimates && !usage.hasRealData ? "~" : ""}${_formatTokens(usage.totalTokens)} tokens`}
            </span>
            {!props.compact && (
                <span
                    className="pp-sustainability__bar"
                    aria-hidden="true"
                    title={`${barPct}% of session budget used`}
                    style={{
                        flex: 1,
                        height: 4,
                        marginLeft: 4,
                        background: "var(--pp-border, #e5e7eb)",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    <span
                        style={{
                            display: "block",
                            width: `${barPct}%`,
                            height: "100%",
                            background: color,
                            transition: "width 400ms ease-out, background 600ms ease-out",
                        }}
                    />
                </span>
            )}
            {props.showReset && usage.questionCount > 0 && (
                <button
                    type="button"
                    className="pp-sustainability__reset"
                    onClick={(e) => { e.stopPropagation(); resetSessionUsage(); setPinned(false); }}
                    style={{
                        marginLeft: 4,
                        padding: "2px 6px",
                        fontSize: 10,
                        border: "1px solid var(--pp-border, #e5e7eb)",
                        background: "var(--pp-surface, #fff)",
                        borderRadius: 3,
                        cursor: "pointer",
                        color: "var(--pp-text-muted, #6b7280)",
                    }}
                    title="Start a fresh conversation"
                    aria-label="Start a fresh conversation (reset session usage)"
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-15.5 6.36L3 16" />
                        <path d="M3 21v-5h5" />
                    </svg>
                </button>
            )}
            {isOpen && (
                <Panel
                    usage={usage}
                    label={label}
                    tagline={tagline}
                    color={color}
                    leaf={leaf}
                    face={face}
                    tokenNote={tokenNote}
                />
            )}
        </div>
    );
}

/* ─── Panel ──────────────────────────────────────────────────────────── */

function Panel(props: {
    usage: SessionUsage;
    label: string;
    tagline: string;
    color: string;
    leaf: string;
    face: string;
    tokenNote: string | null;
}): ReactElement {
    const { usage, label, color, leaf, face, tokenNote } = props;
    const headline = tierHeadline(usage.tier, usage.questionCount);
    const explanation = tierExplanation(usage.tier, usage.questionCount);

    return (
        <div
            className="pp-sustainability__panel"
            data-testid="pp-sustainability-tooltip"
            role="tooltip"
            style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 0,
                right: 0,
                padding: "12px 14px",
                background: "var(--pp-surface, #ffffff)",
                border: `1px solid ${color}44`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 6,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                color: "var(--pp-text, #111827)",
                fontSize: 12,
                lineHeight: 1.5,
                zIndex: 60,
                pointerEvents: "none",
            }}
        >
            {/* Header: big icon + headline */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
                    {leaf}<span style={{ fontSize: 18 }}>{face}</span>
                </span>
                <div>
                    <div style={{ fontWeight: 700, color, fontSize: 13, lineHeight: 1.2 }}>
                        {headline}
                    </div>
                    <div style={{ color: "var(--pp-text-muted, #6b7280)", fontSize: 11, marginTop: 1 }}>
                        {label} · {_statusLine(usage)}
                    </div>
                </div>
            </div>

            {/* Body: human explanation */}
            <p style={{ margin: 0, color: "var(--pp-text, #374151)", lineHeight: 1.55 }}>
                {explanation}
            </p>

            {/* Token detail — small, muted, optional */}
            {tokenNote && (
                <div style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid var(--pp-border, #e5e7eb)",
                    color: "var(--pp-text-muted, #9ca3af)",
                    fontSize: 10,
                    display: "flex",
                    justifyContent: "space-between",
                }}>
                    <span>{tokenNote}</span>
                    {(usage.hasEstimates && !usage.hasRealData) && (
                        <span title="Estimated from text length — backend doesn't report token counts directly">
                            est.
                        </span>
                    )}
                </div>
            )}

            {/* Click-hint */}
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--pp-text-muted, #9ca3af)" }}>
                Click the indicator to pin or dismiss this panel.
            </div>
        </div>
    );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function _statusLine(usage: SessionUsage): string {
    if (usage.questionCount === 0) return "no questions yet";
    const q = `${usage.questionCount} question${usage.questionCount === 1 ? "" : "s"}`;
    return q;
}

function _formatTokens(n: number): string {
    if (n < 1_000) return String(n);
    if (n < 1_000_000) {
        const k = n / 1_000;
        return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
    }
    return `${(n / 1_000_000).toFixed(1)}M`;
}
