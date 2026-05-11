// progressIndicator.tsx — unified, playful progress widget shared across
// AI Insights, Chat, and Supervisor flows. Pure presentational — caller
// owns the steps[] state machine and feeds updates in.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ 🔍  Reading the headline numbers       Step 3 of 6 | 0:08    │
//   │     ┄ helper chips (supervisor only) ┄                       │
//   │ done Warming up the warehouse                           0:01 │
//   │ done Working out the right query                        0:02 │
//   │ now  Pulling the data                                   0:05 │
//   │ next Summarising for executives                               │
//   │ next Recommending next actions                                │
//   │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     │
//   └──────────────────────────────────────────────────────────────┘
//
// Animations are CSS-only (`@keyframes`) and respect prefers-reduced-motion.

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { fmtElapsed, HelperChipView, ProgressStep, StepIcon } from "./progressVocab";

export interface ProgressIndicatorProps {
    /** Ordered steps the run is walking through. */
    steps: ProgressStep[];
    /** Total wall-clock ms since the run started. Caller updates each tick. */
    elapsedMs: number;
    /** When true the widget collapses to a one-line "View steps" toggle. */
    isComplete?: boolean;
    /** When true (final state) and the run failed; styles the header. */
    isFailed?: boolean;
    /** Helper chips (supervisor mode) — rendered above the step list. */
    helperChips?: HelperChipView[];
    /** Optional override for the active step label (e.g. live Genie status). */
    activeOverride?: string;
    /** Optional className for outer container. */
    className?: string;
    /** Early-collapse signal. When this transitions to true the widget
     *  collapses (overlaying the existing isComplete trigger). Used by the
     *  Insights pane so the indicator demotes to a slim line as soon as the
     *  first stage's content paints, even though later stages keep running. */
    collapseEarly?: boolean;
}

export function ProgressIndicator(props: ProgressIndicatorProps) {
    const { steps, elapsedMs, isComplete, isFailed, helperChips, activeOverride, collapseEarly } = props;
    // Expanded while running (so the user watches progress live), auto-
    // collapses on transition into the COMPLETED state (so the answer
    // area isn't cluttered with the now-finished timeline). Also collapses
    // when `collapseEarly` flips true (e.g. first content paints in the
    // Insights pane). Failed runs stay expanded — the user needs to see
    // which step actually broke. The chevron toggle below lets the user
    // override either way.
    const [expanded, setExpanded] = useState(!isComplete && !collapseEarly);
    const prevCompleteRef = useRef(isComplete);
    const prevEarlyRef = useRef(collapseEarly);
    useEffect(() => {
        if (!prevCompleteRef.current && isComplete && !isFailed) {
            setExpanded(false);
        }
        if (!prevEarlyRef.current && collapseEarly && !isFailed) {
            setExpanded(false);
        }
        prevCompleteRef.current = isComplete;
        prevEarlyRef.current = collapseEarly;
    }, [isComplete, isFailed, collapseEarly]);

    const total = steps.length;
    // Cycle 47.9 — cycle 47.1's 3-wide worker pool means multiple stages can
    // be "active" simultaneously. The old `findIndex` returned only the FIRST
    // active stage, so a 3-stages-running run displayed "Stage 1 of 7" while
    // stages 1, 2, and 3 were all in flight. Now we collect every active
    // index and render either a single "Stage N of M" (1 active), a range
    // "Stages 1–3 of 7" (multiple contiguous), or a count "3 of 7 running"
    // fallback (multiple non-contiguous — shouldn't happen with our worker
    // pool but covered defensively). The marquee label still uses the
    // first active step so we don't bloat the header.
    const activeIndices: number[] = [];
    for (let i = 0; i < steps.length; i++) {
        if (steps[i].state === "active") activeIndices.push(i);
    }
    const doneCount = steps.filter(s => s.state === "done" || s.state === "failed").length;
    const activeIdx = activeIndices.length > 0 ? activeIndices[0] : -1;
    const stepNumber = activeIdx >= 0 ? activeIdx + 1 : (isComplete ? total : Math.max(1, doneCount + 1));
    const activeStep = activeIdx >= 0 ? steps[activeIdx] : (isComplete ? steps[steps.length - 1] : steps[0]);
    const stepCounterLabel: string = (() => {
        if (activeIndices.length <= 1) return `Stage ${stepNumber} of ${total}`;
        const first = activeIndices[0];
        const last = activeIndices[activeIndices.length - 1];
        const isContiguous = (last - first + 1) === activeIndices.length;
        if (isContiguous) return `Stages ${first + 1}–${last + 1} of ${total}`;
        return `${activeIndices.length} of ${total} running`;
    })();

    // Header keeps the semantic stage as the marquee, then shows live
    // streaming status beside it. This matters when the widget auto-collapses:
    // users still see both "what stage are we in?" and "what is streaming now?"
    // without opening the timeline.
    const activeSub = !isComplete && activeStep?.subLabel ? activeStep.subLabel : null;
    const stageLabel = activeStep?.label ?? activeOverride ?? "Working on it";
    const headerLabel = isComplete ? (isFailed ? "That didn't finish" : "Done") : stageLabel;
    const liveStatus = !isComplete && activeOverride && activeOverride !== headerLabel
        ? activeOverride
        : activeSub;
    const headerIcon: StepIcon = isComplete
        ? (isFailed ? "failed" : "done")
        : (activeStep?.icon ?? "thinking");

    const progressPct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;

    return (
        <div className={`gn-progress${isFailed ? " gn-progress--failed" : ""}${isComplete ? " gn-progress--complete" : " gn-progress--active"} ${props.className ?? ""}`} role="status" aria-live="polite">
            <div className="gn-progress-header">
                <StepGlyph icon={headerIcon} animated={!isComplete} />
                <div className="gn-progress-header-text">
                    <span className="gn-progress-active-label">
                        {headerLabel}
                        {/* Cycle 36 — wrap live status in parens, drop the
                            " - " separator. Final format:
                              <Section name> (<streaming info>)
                            Timer lives on the meta row beneath this line, so
                            we don't repeat it here. */}
                        {liveStatus && <span className="gn-progress-sublabel"> ({liveStatus})</span>}
                    </span>
                    <span className="gn-progress-meta">
                        {/* 49.14 / Session 74 — show the stage counter only for multi-stage runs.
                            Single-stage runs (custom insightsPrompt collapses the
                            5-stage pipeline to 1 call) showed "Step 1 of 1" which
                            adds no information; just show the elapsed time. */}
                        {total > 1 && <span className="gn-progress-step-count">{stepCounterLabel}</span>}
                        {total > 1 && <span className="gn-progress-meta-sep">|</span>}
                        <span className="gn-progress-elapsed" aria-label="elapsed time">{fmtElapsed(elapsedMs)}</span>
                        {/* Cycle 33 — LIVE pill removed. The active stage label
                            + elapsed timer already convey "in progress"; the
                            extra pill was redundant noise. */}
                    </span>
                </div>
                {total > 0 && (
                    <button
                        type="button"
                        className={`gn-progress-toggle${expanded ? " gn-progress-toggle--expanded" : ""}`}
                        onClick={() => setExpanded(v => !v)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Hide steps" : "Show steps"}
                        title={expanded ? "Hide steps" : "Show steps"}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M2.5 4.25L6 7.75L9.5 4.25" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                )}
            </div>

            {helperChips && helperChips.length > 0 && (
                <div className="gn-progress-chips" aria-label="Helpers">
                    {helperChips.map(chip => (
                        <span
                            key={chip.id}
                            className={`gn-progress-chip gn-progress-chip--${chip.state}`}
                            title={chip.elapsedMs ? `${chip.displayName} | ${fmtElapsed(chip.elapsedMs)}` : chip.displayName}
                        >
                            <HelperChipDot state={chip.state} />
                            <span className="gn-progress-chip-name">{chip.displayName}</span>
                        </span>
                    ))}
                </div>
            )}

            {expanded && total > 0 && (
                <ol className="gn-progress-steps">
                    {steps.map((s, i) => (
                        <li key={s.id} className={`gn-progress-step gn-progress-step--${s.state}${i === activeIdx ? " gn-progress-step--current" : ""}`}>
                            <StepGlyph icon={s.icon} state={s.state} animated={s.state === "active"} small />
                            <span className="gn-progress-step-label">
                                {s.label}
                                {s.state === "active" && s.subLabel && (
                                    <span className="gn-progress-sublabel"> - {s.subLabel}</span>
                                )}
                            </span>
                            {s.elapsedMs != null && (s.state === "done" || s.state === "failed") && (
                                <span className="gn-progress-step-elapsed">{fmtElapsed(s.elapsedMs)}</span>
                            )}
                        </li>
                    ))}
                </ol>
            )}

            {!isComplete && total > 0 && (
                <div className="gn-progress-bar" aria-hidden="true">
                    <span className="gn-progress-bar-fill" style={{ width: `${progressPct}%` }} />
                </div>
            )}
        </div>
    );
}

function HelperChipDot(props: { state: ProgressStep["state"] }) {
    return <span className={`gn-progress-chip-dot gn-progress-chip-dot--${props.state}`} aria-hidden="true" />;
}

/**
 * Small SVG glyph for the header. Expanded step rows use CSS status markers
 * instead of tiny decorative glyphs so the timeline reads cleanly in Power BI.
 */
function StepGlyph(props: { icon: StepIcon; state?: ProgressStep["state"]; animated?: boolean; small?: boolean }) {
    const cls = [
        "gn-progress-glyph",
        `gn-progress-glyph--${props.icon}`,
        props.animated ? "gn-progress-glyph--animated" : "",
        props.small ? "gn-progress-glyph--small" : "",
        props.state ? `gn-progress-glyph--state-${props.state}` : ""
    ].filter(Boolean).join(" ");
    const size = props.small ? 14 : 20;

    if (props.small) {
        return <span className={cls} aria-hidden="true" />;
    }

    switch (props.icon) {
        case "warming":
            // Rotating cog
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 1h2l.4 1.9 1.7.7 1.6-1.1 1.4 1.4-1.1 1.6.7 1.7L19 7v2l-1.9.4-.7 1.7 1.1 1.6-1.4 1.4-1.6-1.1-1.7.7L13 19h-2l-.4-1.9-1.7-.7-1.6 1.1L5.9 16l1.1-1.6-.7-1.7L1 12v-2l1.9-.4.7-1.7L2.5 6.3 3.9 4.9l1.6 1.1 1.7-.7L9 1z" />
                </svg>
            );
        case "thinking":
            // Sparkle wand
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M14 2l1.2 2.8L18 6l-2.8 1.2L14 10l-1.2-2.8L10 6l2.8-1.2L14 2zM5 11l.8 1.7L7.5 13.5l-1.7.8L5 16l-.8-1.7L2.5 13.5l1.7-.8L5 11zm5 4.5l.6 1.4L12 17.5l-1.4.6L10 19.5l-.6-1.4L8 17.5l1.4-.6L10 15.5z" />
                </svg>
            );
        case "querying":
            // Table-grid pulse
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M3 4h14v3H3V4zm0 5h6v3H3V9zm8 0h6v3h-6V9zM3 14h6v2H3v-2zm8 0h6v2h-6v-2z" />
                </svg>
            );
        case "reading":
            // Magnifier wiggle
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M9 3a6 6 0 1 1-3.5 10.9l-3.2 3.2-1.4-1.4 3.2-3.2A6 6 0 0 1 9 3zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                </svg>
            );
        case "writing":
            // Pencil bobbing
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M14.7 2.3l3 3-1.4 1.4-3-3 1.4-1.4zM12.3 4.7l3 3-9 9H3v-3l9.3-9z" />
                </svg>
            );
        case "calling":
            // Antenna emanating
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5.6 5.6l1.1 1.1A4.5 4.5 0 0 0 5.5 10c0 1.2.5 2.3 1.2 3.2l-1.1 1.1A6 6 0 0 1 4 10c0-1.7.7-3.3 1.6-4.4zm8.8 0A6 6 0 0 1 16 10a6 6 0 0 1-1.6 4.3l-1.1-1.1A4.5 4.5 0 0 0 14.5 10c0-1.2-.5-2.3-1.2-3.3l1.1-1.1zM3.4 3.4l1.1 1.1A8 8 0 0 0 2 10c0 2 .8 3.9 2.1 5.4L3 16.6A10 10 0 0 1 0 10c0-2.5 1-4.9 2.6-6.6L3.4 3.4zm13.2 0L17.4 4.4A10 10 0 0 1 20 10a10 10 0 0 1-2.6 6.6l-1.1-1.1A8 8 0 0 0 18 10a8 8 0 0 0-1.7-4.9l.3-1.7z" />
                </svg>
            );
        case "fusing":
            // Braid spin
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M10 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm13 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM10 12.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM10 5l-5 4 5 4 5-4-5-4z" />
                </svg>
            );
        case "done":
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M16.7 5.3l-8 8-5-5 1.4-1.4 3.6 3.6L15.3 3.9l1.4 1.4z" />
                </svg>
            );
        case "failed":
            return (
                <svg className={cls} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
                    <path fill="currentColor" d="M5.7 4.3L10 8.6l4.3-4.3 1.4 1.4L11.4 10l4.3 4.3-1.4 1.4L10 11.4l-4.3 4.3-1.4-1.4L8.6 10 4.3 5.7l1.4-1.4z" />
                </svg>
            );
    }
}
