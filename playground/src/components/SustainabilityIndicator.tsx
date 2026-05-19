// playground/src/components/SustainabilityIndicator.tsx
//
// "Green leaf" indicator at the bottom of the AISidebar showing how
// efficient (token-wise) the current session is. Hover to see the
// detailed breakdown.
//
// Motto: fewer tokens, better accuracy — the lean-and-mean solution.
//
// The component is presentation-only: it subscribes to usageTracker and
// re-renders when usage changes. Recording responses is the AISidebar's
// job (it calls usageTracker.recordResponse() on each completed turn).

import { useEffect, useState, type ReactElement } from "react";
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
} from "../lib/usageTracker";

export interface SustainabilityIndicatorProps {
    /** Override the live tracker subscription with a static value. Used
     *  by tests + Storybook to render specific states. */
    override?: SessionUsage | null;
    /** Compact mode shrinks padding + drops the bar visualisation. */
    compact?: boolean;
    /** Show a "↻ reset" affordance to start a fresh conversation. */
    showReset?: boolean;
}

export function SustainabilityIndicator(props: SustainabilityIndicatorProps): ReactElement {
    const [usage, setUsage] = useState<SessionUsage>(
        props.override ?? getSessionUsage(),
    );
    const [hover, setHover] = useState(false);

    useEffect(() => {
        if (props.override) {
            setUsage(props.override);
            return;
        }
        const unsubscribe = subscribeUsage(setUsage);
        // Snapshot on mount in case the tracker fired before subscribe ran.
        setUsage(getSessionUsage());
        return unsubscribe;
    }, [props.override]);

    const color = tierColor(usage.tier);
    const leaf = tierEmoji(usage.tier);
    const face = tierFace(usage.tier);
    const label = tierLabel(usage.tier);
    const tagline = tierTagline(usage.tier);

    // Bar fills proportionally up to a soft 50k cap (the "very-heavy"
    // threshold). Past that we cap at 100% to avoid layout overflow.
    const barPct = Math.min(100, Math.round((usage.totalTokens / 50_000) * 100));

    const tokenDisplayPrimary = usage.questionCount === 0
        ? "0 tokens"
        : `${usage.hasEstimates && !usage.hasRealData ? "~" : ""}${_formatTokens(usage.totalTokens)} tokens`;

    return (
        <div
            className="pp-sustainability"
            data-testid="pp-sustainability"
            data-tier={usage.tier}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            tabIndex={0}
            role="status"
            aria-label={`Session sustainability: ${label}, ${tokenDisplayPrimary}`}
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
                cursor: "default",
                userSelect: "none",
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    fontSize: 14,
                    lineHeight: 1,
                    color,
                }}
            >
                {leaf}
                <span style={{ marginLeft: 2 }}>{face}</span>
            </span>
            <span
                className="pp-sustainability__label"
                data-testid="pp-sustainability-label"
                style={{ fontWeight: 600, color }}
            >
                {label}
            </span>
            <span
                className="pp-sustainability__tokens"
                data-testid="pp-sustainability-tokens"
                style={{ color: "var(--pp-text-muted, #6b7280)" }}
            >
                · {tokenDisplayPrimary}
            </span>
            {!props.compact && (
                <span
                    className="pp-sustainability__bar"
                    aria-hidden="true"
                    title={`${barPct}% of soft session cap`}
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
                            transition: "width 200ms ease-out, background 200ms ease-out",
                        }}
                    />
                </span>
            )}
            {props.showReset && usage.questionCount > 0 && (
                <button
                    type="button"
                    className="pp-sustainability__reset"
                    onClick={(e) => { e.stopPropagation(); resetSessionUsage(); }}
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
                    title="Reset session usage"
                    aria-label="Reset session usage"
                >
                    {/* 2026-05-19 post-UAT-1840: replaced U+21BB text
                      *  glyph with an inline SVG refresh icon (consistent
                      *  with the Pulse footer cluster). */}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-15.5 6.36L3 16" />
                        <path d="M3 21v-5h5" />
                    </svg>
                </button>
            )}
            {hover && usage.questionCount > 0 && (
                <Tooltip usage={usage} label={label} tagline={tagline} />
            )}
            {hover && usage.questionCount === 0 && (
                <Tooltip usage={usage} label="Ready" tagline={tagline} />
            )}
        </div>
    );
}

/* ─── Tooltip ────────────────────────────────────────────────────────── */

function Tooltip(props: { usage: SessionUsage; label: string; tagline: string }): ReactElement {
    const { usage, label, tagline } = props;
    return (
        <div
            className="pp-sustainability__tooltip"
            data-testid="pp-sustainability-tooltip"
            role="tooltip"
            style={{
                position: "absolute",
                bottom: "100%",
                left: 8,
                right: 8,
                marginBottom: 6,
                padding: "10px 12px",
                background: "var(--pp-surface, #ffffff)",
                border: "1px solid var(--pp-border, #e5e7eb)",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                color: "var(--pp-text, #111827)",
                fontSize: 11,
                lineHeight: 1.5,
                zIndex: 50,
                pointerEvents: "none",
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Session sustainability — {label}
            </div>
            <div data-testid="pp-sustainability-tooltip-counts">
                <strong>{_formatTokens(usage.totalTokens)}</strong> tokens · {usage.questionCount} question{usage.questionCount === 1 ? "" : "s"}
            </div>
            {(usage.inputTokens > 0 || usage.outputTokens > 0) && (
                <div style={{ color: "var(--pp-text-muted, #6b7280)", marginTop: 2 }}>
                    {_formatTokens(usage.inputTokens)} in · {_formatTokens(usage.outputTokens)} out
                </div>
            )}
            {usage.hasEstimates && !usage.hasRealData && (
                <div style={{ color: "var(--pp-text-muted, #6b7280)", marginTop: 2, fontStyle: "italic" }}>
                    Estimated from text length (current backend doesn't expose token counts).
                </div>
            )}
            {usage.hasEstimates && usage.hasRealData && (
                <div style={{ color: "var(--pp-text-muted, #6b7280)", marginTop: 2, fontStyle: "italic" }}>
                    Mix of real + estimated counts (some backends don't expose tokens).
                </div>
            )}
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--pp-border, #e5e7eb)", color: "var(--pp-text-muted, #6b7280)" }}>
                {tagline}
            </div>
        </div>
    );
}

/* ─── Formatting ─────────────────────────────────────────────────────── */

function _formatTokens(n: number): string {
    if (n < 1_000) return String(n);
    if (n < 1_000_000) {
        const k = n / 1_000;
        return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
    }
    return `${(n / 1_000_000).toFixed(1)}M`;
}
