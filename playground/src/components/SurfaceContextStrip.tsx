// playground/src/components/SurfaceContextStrip.tsx
//
// PulsePlay-native equivalent of PulseShell's gn-surface-context strip.
// Renders the assistant + source + scope + trust chips below the surface
// header so users can see "what is this surface, what's grounding it,
// what is its trust posture" at a glance.
//
// Why a new primitive instead of reusing PulseShell's: PulseShell's
// chrome is in the gn-* CSS vocabulary (Pulse-ported compat surface).
// PulsePlay-native surfaces (like UnifiedAssistantSurface) use pp-*.
// The computation lives in lib/computeSurfaceContext.ts so both surfaces
// honor the same evidence-aware trust ladder.

import * as React from "react";
import type { SurfaceContextValue } from "../lib/computeSurfaceContext";

export interface SurfaceContextStripProps {
    /** Surface label — e.g. "Ask Pulse", "AI Insights", "Dashboard". */
    surface: string;
    /** Computed chip values from `computeSurfaceContext`. */
    context: SurfaceContextValue;
    /** Optional className for layout adjustments. */
    className?: string;
}

/** Compact row of {Surface · mode} primary chip + {Assistant, Source,
 *  Scope, Trust} secondary chips. Identical information density to
 *  PulseShell's gn-surface-context — just rendered through pp-* classes
 *  so v0 surfaces don't inherit the Pulse-port CSS contract. */
export function SurfaceContextStrip({
    surface,
    context,
    className,
}: SurfaceContextStripProps): React.ReactElement {
    const items: Array<{ label: string; value: string }> = [
        { label: "Assistant", value: context.assistant },
        { label: "Source", value: context.source },
        { label: "Scope", value: context.scope },
        { label: "Trust", value: context.trust },
    ];

    return (
        <div
            className={`pp-surface-context${className ? ` ${className}` : ""}`}
            role="group"
            aria-label={`${surface} context`}
            data-testid="pp-surface-context"
        >
            <div className="pp-surface-context__primary">
                <span className="pp-surface-context__label">Surface</span>
                <span className="pp-surface-context__value">{surface}</span>
                <span className="pp-surface-context__divider" aria-hidden="true" />
                <span className="pp-surface-context__value">{context.mode}</span>
            </div>
            {items.map(item => (
                <div className="pp-surface-context__item" key={item.label}>
                    <span className="pp-surface-context__label">{item.label}</span>
                    <span
                        className="pp-surface-context__value"
                        data-testid={`pp-surface-context-${item.label.toLowerCase()}`}
                    >
                        {item.value}
                    </span>
                </div>
            ))}
        </div>
    );
}
