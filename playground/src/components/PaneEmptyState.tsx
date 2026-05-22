// playground/src/components/PaneEmptyState.tsx
//
// Shared empty-state shell for surface tabs (AI Insights, Ask Pulse,
// Dashboard). Audit 2026-05-20 — brings the Dashboard tab into the
// same visual vocabulary as the two AI tabs: a centred icon disc, a
// heading, a description, an optional bullet list of capabilities,
// and one or two CTAs.
//
// Classes are global (declared in playground/src/styles.css), so this
// component works whether or not the Pulse stylesheet is loaded (it
// is NOT in `biOnly` mode).

import type { ReactNode } from "react";

export interface PaneEmptyStateAction {
    /** Visible label inside the button. */
    label: string;
    /** Click handler. */
    onClick: () => void;
    /** Optional accessible-name override; defaults to `label`. */
    ariaLabel?: string;
    /** Optional testid (handy for integration tests asserting on the CTA). */
    testid?: string;
}

export interface PaneEmptyStateProps {
    /** Inline SVG (or any ReactNode) shown inside the icon disc. Should be
     *  `aria-hidden` — the heading carries the accessible name. */
    icon?: ReactNode;
    /** Required heading — keep short ("AI Insights", "Dashboard"). */
    heading: string;
    /** One-paragraph description of what the surface produces once the
     *  user wires it up. ReactNode so callers can inline markup. */
    description?: ReactNode;
    /** Optional bullet list of what the surface will show. Rendered as
     *  a left-aligned list inside the centred container. */
    capabilities?: string[];
    /** Primary CTA (recommended action). Renders as `.pp-cta-primary`. */
    primaryAction?: PaneEmptyStateAction;
    /** Optional secondary CTA. Renders as `.pp-cta-secondary`. */
    secondaryAction?: PaneEmptyStateAction;
    /** Optional micro-copy below the CTAs (e.g., "Vendors available: …"). */
    hint?: ReactNode;
    /** Optional data-testid on the outer wrapper for integration tests. */
    testid?: string;
}

/**
 * Empty state shell shared by Dashboard / AI Insights / Ask Pulse so
 * the three surface tabs feel like one product. See styles.css
 * `.pp-empty-state*` rules for the visual layer.
 */
export function PaneEmptyState(props: PaneEmptyStateProps): React.ReactElement {
    const {
        icon, heading, description, capabilities,
        primaryAction, secondaryAction, hint, testid,
    } = props;
    return (
        <div className="pp-empty-state" data-testid={testid}>
            {icon && (
                <div className="pp-empty-state__icon" aria-hidden="true">
                    {icon}
                </div>
            )}
            <h3 className="pp-empty-state__heading">{heading}</h3>
            {description && (
                <p className="pp-empty-state__description">{description}</p>
            )}
            {capabilities && capabilities.length > 0 && (
                <ul className="pp-empty-state__capabilities">
                    {capabilities.map((item, i) => (
                        <li key={i}>• {item}</li>
                    ))}
                </ul>
            )}
            {(primaryAction || secondaryAction) && (
                <div className="pp-empty-state__ctas">
                    {primaryAction && (
                        <button
                            type="button"
                            className="pp-cta-primary"
                            onClick={primaryAction.onClick}
                            aria-label={primaryAction.ariaLabel}
                            data-testid={primaryAction.testid}
                        >
                            {primaryAction.label}
                        </button>
                    )}
                    {secondaryAction && (
                        <button
                            type="button"
                            className="pp-cta-secondary"
                            onClick={secondaryAction.onClick}
                            aria-label={secondaryAction.ariaLabel}
                            data-testid={secondaryAction.testid}
                        >
                            {secondaryAction.label}
                        </button>
                    )}
                </div>
            )}
            {hint && <p className="pp-empty-state__hint">{hint}</p>}
        </div>
    );
}

/** Bar-chart glyph — the same vocabulary the SurfaceSwitcher uses for
 *  the Dashboard surface. Exported so the Dashboard empty state can
 *  reuse it without duplicating the SVG path. */
export const DashboardIcon = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="6"  y1="20" x2="6"  y2="11" />
        <line x1="12" y1="20" x2="12" y2="5"  />
        <line x1="18" y1="20" x2="18" y2="14" />
    </svg>
);

/** Sparkle glyph — matches the surface switcher's "spark" icon for AI
 *  Insights. Exported in case a non-Pulse surface needs it. */
export const InsightsIcon = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
    </svg>
);

/** Chat bubble glyph — Ask Pulse surface. */
export const AskPulseIcon = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);
