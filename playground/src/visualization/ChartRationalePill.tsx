// playground/src/visualization/ChartRationalePill.tsx
//
// Shared "Why this chart?" info-button + popover. Drop-in chart chrome that
// works regardless of which chart renderer is in play (NativeCanvas /
// GenieChart in pulse/visual.tsx / future workbench renderer).
//
// 2026-05-22 upgrade — replaces the earlier generic KB-rule popover with
// the data-shape-aware narrative + structured warnings sourced from
// chartRationale.ts. Always speaks about the AUTO-PICK chart (never about
// user override), per Rajesh's 2026-05-22 direction: "picked X wrongly it
// should be Y only" — drop the comparison framing, surface the data-driven
// recommendation directly.
//
// Visual language follows Material Design / Untitled UI tooltip-popover
// conventions: 320px card, soft shadow, amber-50 caution band for warnings,
// short bold titles + plain-English explanation + concrete view suggestion.

import * as React from "react";
import { chartAutoPick, type ChartKind } from "./chartAutoPick";
import { buildChartRationale } from "./chartRationale";

export interface ChartRationalePillProps {
    readonly columns: ReadonlyArray<string>;
    readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
    /**
     * The chart kind currently displayed. Currently used only for the
     * button's tooltip + a11y label; the popover NEVER speaks about the
     * displayed override — it always shows the AUTO-PICK's rationale (so
     * the user can compare their override against the data-driven choice).
     */
    readonly pickedKind: ChartKind;
    /** Optional anchor for popover positioning. Default: below-left. */
    readonly popoverPlacement?: "below-left" | "below-right";
    /** Optional className for the outer wrapper. */
    readonly className?: string;
    /** Optional data-testid override. Default `pp-chart-info-button`. */
    readonly testId?: string;
    /**
     * 2026-05-22 G4 — click-to-switch handler. When provided AND a warning
     * carries a `suggestedView` field, the "Try: X" label inside the
     * warning card renders as a clickable button that fires this callback
     * with the suggested view label (e.g. "KPI tile", "Matrix view",
     * "Table with sorting"). The parent maps the label to a ChartKind and
     * calls its own setChartType. We don't auto-route — explicit user
     * action only, per industry consensus (Tableau / Power BI / Looker /
     * ThoughtSpot all suggest-then-apply, never silently swap).
     * Sources: docs/research/EXTERNAL_REFERENCES.md (G4 entry).
     */
    readonly onSuggestedViewClick?: (suggestedView: string) => void;
}

const WARNING_PALETTE: Readonly<Record<string, { bg: string; border: string; icon: string }>> = Object.freeze({
    info:    { bg: "var(--pp-info-bg, #eff6ff)",   border: "var(--pp-info-border, #3b82f6)",    icon: "ℹ" },
    caution: { bg: "var(--pp-caution-bg, #fef3c7)", border: "var(--pp-caution-border, #f59e0b)", icon: "⚠" },
    warning: { bg: "var(--pp-warning-bg, #fee2e2)", border: "var(--pp-warning-border, #ef4444)", icon: "⚠" },
});

export function ChartRationalePill(props: ChartRationalePillProps): React.ReactElement | null {
    const [open, setOpen] = React.useState(false);
    const popRef = React.useRef<HTMLDivElement | null>(null);

    const autoPick = React.useMemo(
        () => chartAutoPick(props.columns, props.rows),
        [props.columns, props.rows],
    );

    const rationale = React.useMemo(
        () => buildChartRationale(
            autoPick.reason,
            autoPick.chartType,
            autoPick.dataShape,
            props.columns,
            props.rows,
        ),
        [autoPick, props.columns, props.rows],
    );

    React.useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent): void => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    // Don't render the button on empty result sets — nothing to rationalise.
    if (!props.columns.length || !props.rows.length) return null;

    const popPlacementStyle: React.CSSProperties = props.popoverPlacement === "below-right"
        ? { top: "calc(100% + 6px)", right: 0 }
        : { top: "calc(100% + 6px)", left: 0 };

    return (
        <span
            className={props.className}
            style={{ position: "relative", display: "inline-flex" }}
        >
            <button
                type="button"
                aria-label="Why this chart?"
                title="Why this chart?"
                onClick={() => setOpen(v => !v)}
                data-testid={props.testId ?? "pp-chart-info-button"}
                style={{
                    width: 18, height: 18,
                    border: "1px solid var(--pp-border, #d1d5db)",
                    borderRadius: "50%",
                    background: "var(--pp-surface, #fff)",
                    color: "var(--pp-text-muted, #6b7280)",
                    fontSize: 11, fontWeight: 600, lineHeight: 1,
                    cursor: "pointer", padding: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
            >
                i
            </button>
            {open && (
                <div
                    ref={popRef}
                    role="dialog"
                    data-testid="pp-chart-info-popover"
                    style={{
                        position: "absolute",
                        ...popPlacementStyle,
                        zIndex: 40,
                        width: 340,
                        padding: "12px 14px",
                        background: "var(--pp-surface, #ffffff)",
                        border: "1px solid var(--pp-border, #e5e7eb)",
                        borderRadius: 6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                        color: "var(--pp-text, #111827)",
                        fontSize: 12,
                        lineHeight: 1.5,
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                        Why did we pick this chart?
                    </div>

                    {/* Personalised, data-shape-aware narrative. Always describes
                        the AUTO-pick (never references the user's override). */}
                    <p style={{ margin: "0 0 8px" }}>{rationale.why}</p>

                    {/* Structured warnings — each in its own coloured band. */}
                    {rationale.warnings.length > 0 && (
                        <div style={{ marginBottom: 8 }} data-testid="pp-chart-info-warnings">
                            {rationale.warnings.map((w, i) => {
                                const palette = WARNING_PALETTE[w.severity] ?? WARNING_PALETTE.caution;
                                return (
                                    <div
                                        key={`${w.title}-${i}`}
                                        style={{
                                            marginBottom: i < rationale.warnings.length - 1 ? 6 : 0,
                                            padding: "8px 10px",
                                            background: palette.bg,
                                            borderLeft: `3px solid ${palette.border}`,
                                            borderRadius: 4,
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
                                            <span aria-hidden="true" style={{ marginRight: 4 }}>{palette.icon}</span>
                                            {w.title}
                                        </div>
                                        <div style={{ fontSize: 11, lineHeight: 1.45 }}>{w.explanation}</div>
                                        {w.suggestedView && (
                                            props.onSuggestedViewClick ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        props.onSuggestedViewClick!(w.suggestedView!);
                                                        setOpen(false);
                                                    }}
                                                    data-testid="pp-chart-info-switch-view"
                                                    style={{
                                                        marginTop: 6,
                                                        padding: "4px 10px",
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        color: palette.border,
                                                        background: "var(--pp-surface, #ffffff)",
                                                        border: `1px solid ${palette.border}`,
                                                        borderRadius: 4,
                                                        cursor: "pointer",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                    }}
                                                    title={`Switch to ${w.suggestedView}`}
                                                    aria-label={`Switch to ${w.suggestedView}`}
                                                >
                                                    Switch to {w.suggestedView}
                                                    <span aria-hidden="true">→</span>
                                                </button>
                                            ) : (
                                                <div
                                                    style={{
                                                        marginTop: 4,
                                                        fontSize: 11,
                                                        fontStyle: "italic",
                                                        color: "var(--pp-text-muted, #6b7280)",
                                                    }}
                                                >
                                                    Try: <strong>{w.suggestedView}</strong>
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* "Avoid for this shape" — sourced from KB CHART_RULES. */}
                    {rationale.avoid && rationale.avoid !== "n/a" && (
                        <p style={{ margin: "0 0 8px", color: "var(--pp-text-muted, #6b7280)", fontSize: 11 }}>
                            <strong>Avoid for this shape:</strong> {rationale.avoid}
                        </p>
                    )}

                    {/* Sibling alternatives (e.g. comparison-categorical-many for
                        comparison-categorical) — informational, not warnings. */}
                    {rationale.alternatives.length > 0 && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--pp-border, #e5e7eb)" }}>
                            <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>Alternatives in the same family</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {rationale.alternatives.map(alt => (
                                    <li key={alt.recommended} style={{ marginBottom: 2, fontSize: 11 }}>
                                        <strong>{alt.recommended}</strong> — {alt.when}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div style={{ marginTop: 8, fontSize: 10, color: "var(--pp-text-muted, #9ca3af)" }}>
                        Source: PulsePlay knowledge base · {rationale.relationship}{rationale.fellBack ? " (fallback)" : ""}
                    </div>
                </div>
            )}
        </span>
    );
}
