// playground/src/visualization/ChartRationalePill.tsx
//
// Shared "Why this chart?" info-button + popover. Drop-in chart chrome that
// works regardless of which chart renderer is in play (NativeCanvas /
// GenieChart in pulse/visual.tsx / future workbench renderer). Sources its
// content from the local CHART_RULES knowledge base via buildChartRationale —
// no network, no LLM tokens, ~1ms client-side lookup.
//
// 2026-05-22 — extracted from NativeCanvas's inline definition after live-
// testing feedback ("this should be universal right? or genie adapter support
// different type of render?"). The architecturally correct shape is one
// reusable pill rendered next to whatever chart is on screen, not a copy of
// the same JSX duplicated per renderer.
//
// Inputs:
//   - columns + rows: the raw envelope shape (matches AIResultEnvelope.schema/rows)
//   - pickedKind: the chart kind currently displayed (after user override)
//
// The component decides:
//   - what the AUTO-pick would have been from the data shape (via chartAutoPick)
//   - whether the user override differs from auto-pick
//   - which KB rule applies
//   - alternatives + what-to-avoid

import * as React from "react";
import { chartAutoPick, type ChartKind } from "./chartAutoPick";
import { buildChartRationale } from "./chartRationale";

export interface ChartRationalePillProps {
    readonly columns: ReadonlyArray<string>;
    readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
    /** The chart kind currently displayed (after user override, if any). */
    readonly pickedKind: ChartKind;
    /** Optional anchor for popover positioning. Default: bottom-left (works for inline tooltip). */
    readonly popoverPlacement?: "below-left" | "below-right";
    /** Optional className for the outer wrapper. */
    readonly className?: string;
    /** Optional data-testid override. Default `pp-chart-info-button`. */
    readonly testId?: string;
}

export function ChartRationalePill(props: ChartRationalePillProps): React.ReactElement | null {
    const [open, setOpen] = React.useState(false);
    const popRef = React.useRef<HTMLDivElement | null>(null);

    const autoPick = React.useMemo(
        () => chartAutoPick(props.columns, props.rows),
        [props.columns, props.rows],
    );

    const rationale = React.useMemo(
        () => buildChartRationale(autoPick.reason, autoPick.chartType, autoPick.dataShape),
        [autoPick],
    );

    React.useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent): void => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    // Don't render the button on empty result sets — nothing to rationalize.
    if (!props.columns.length || !props.rows.length) return null;

    const userOverrode = props.pickedKind !== autoPick.chartType;
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
                        width: 320,
                        padding: "10px 12px",
                        background: "var(--pp-surface, #ffffff)",
                        border: "1px solid var(--pp-border, #e5e7eb)",
                        borderRadius: 6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                        color: "var(--pp-text, #111827)",
                        fontSize: 12,
                        lineHeight: 1.5,
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Why <span style={{ textTransform: "uppercase" }}>{props.pickedKind}</span>?
                    </div>
                    {userOverrode && (
                        <div style={{ fontSize: 11, color: "var(--pp-text-muted, #6b7280)", marginBottom: 6 }}>
                            (You override-picked {props.pickedKind}; auto-pick would have chosen {autoPick.chartType}.)
                        </div>
                    )}
                    <p style={{ margin: "0 0 8px" }}>{rationale.why}</p>
                    {rationale.avoid && rationale.avoid !== "n/a" && (
                        <p style={{ margin: "0 0 8px", color: "var(--pp-text-muted, #6b7280)" }}>
                            <strong>Avoid for this shape:</strong> {rationale.avoid}
                        </p>
                    )}
                    {rationale.alternatives.length > 0 && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--pp-border, #e5e7eb)" }}>
                            <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>Alternatives</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {rationale.alternatives.map(alt => (
                                    <li key={alt.recommended} style={{ marginBottom: 2 }}>
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
