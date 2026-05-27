// playground/src/components/MetricDirectionAutoDetectChip.tsx
//
// Surfaces the metric-name → direction heuristic as a one-click apply
// affordance in Settings → AI. When the discovery snapshot reports
// visible measures, this chip shows up with "Apply auto-detected rules
// (N metrics)" — the user can apply, edit (by clicking the rules field
// below the picker), or dismiss.
//
// 2026-05-28 — built per user direction: "the metric should auto-select
// based on the dataset … on the preset values."

import * as React from "react";
import {
    inferMetricRulesFromBindings,
    type InferredMetricRulesResult,
} from "../lib/metricDirectionInference";

export interface MetricDirectionAutoDetectChipProps {
    /** Bound measure names (typically `snapshot.biMetadata.visibleMeasures.map(m => m.name)`).
     *  When empty / undefined, the chip renders null. */
    measureNames: ReadonlyArray<string> | null | undefined;
    /** Apply handler — receives the generated rules string. Wire to the
     *  same `metricDirectionRules` writer the manual textarea uses. */
    onApply: (rules: string) => void;
    /** Optional dismissal — when the user clicks X, the chip hides for
     *  the rest of the session. Default: chip stays visible until applied
     *  so the affordance doesn't fully disappear. */
    onDismiss?: () => void;
}

export function MetricDirectionAutoDetectChip({
    measureNames,
    onApply,
    onDismiss,
}: MetricDirectionAutoDetectChipProps): React.ReactElement | null {
    // Compute inferred rules from the names. Re-runs only when the
    // measureNames identity changes (parent should memoize).
    const inferred: InferredMetricRulesResult = React.useMemo(
        () => inferMetricRulesFromBindings(measureNames ?? []),
        [measureNames],
    );

    // Nothing to suggest? Render null — no value in showing an empty chip.
    if (inferred.confidentCount === 0) return null;

    const measureCount = (measureNames ?? []).length;
    const skipped = measureCount - inferred.confidentCount;
    const subtitle = skipped > 0
        ? `${inferred.confidentCount} of ${measureCount} metrics classified — ${skipped} ambiguous`
        : `All ${inferred.confidentCount} bound metrics classified by name heuristic`;

    return (
        <div
            className="pp-metric-autodetect-chip"
            role="status"
            aria-label="Metric direction auto-detection suggestion"
            data-testid="pp-metric-autodetect-chip"
        >
            <div className="pp-metric-autodetect-chip__icon" aria-hidden="true">🔍</div>
            <div className="pp-metric-autodetect-chip__body">
                <div className="pp-metric-autodetect-chip__title">
                    Auto-detected from dataset ({inferred.confidentCount} {inferred.confidentCount === 1 ? "metric" : "metrics"})
                </div>
                <div className="pp-metric-autodetect-chip__subtitle">{subtitle}</div>
            </div>
            <button
                type="button"
                className="pp-metric-autodetect-chip__apply"
                onClick={() => onApply(inferred.rules)}
                data-testid="pp-metric-autodetect-chip-apply"
                title="Write the auto-detected rules into the Metric direction rules field below"
            >
                Apply rules
            </button>
            {onDismiss && (
                <button
                    type="button"
                    className="pp-metric-autodetect-chip__dismiss"
                    onClick={onDismiss}
                    data-testid="pp-metric-autodetect-chip-dismiss"
                    aria-label="Dismiss auto-detect suggestion"
                    title="Hide this suggestion for the rest of the session"
                >
                    ×
                </button>
            )}
        </div>
    );
}
