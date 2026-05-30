// playground/src/settings/primitives/ProgressiveSection.tsx
//
// UX-ARCH-0B.2 Phase F — extracted from SetupGroup so the same numbered
// collapsible section card (with optional metadata row) is reusable across
// AI Setup, BI Setup, Display, and Advanced.
//
// Visual (when expanded):
//   ┌──────────────────────────────────────────────────────────────┐
//   │ ┌──┐ Title                                          Collapse  │
//   │ │01│ Subtitle line                                            │
//   │ └──┘                                                          │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Source: …    Freshness: …    Owner: …                       │
//   │  Next action: …                                               │
//   ├──────────────────────────────────────────────────────────────┤
//   │  children (the actual controls)                               │
//   └──────────────────────────────────────────────────────────────┘
//
// When collapsed, only the header row renders. When `checked` is true, the
// numbered badge becomes "OK" + green styling. Click anywhere on the header
// row toggles expand/collapse.
//
// Metadata row is optional — pass `metadata` to render it; omit for sections
// where the four-cell ownership table doesn't make sense.

import * as React from "react";

export interface SectionMetadata {
    /** Where this section's data comes from (e.g. "Saved embed configuration"). */
    source: string;
    /** How fresh the source is (e.g. "Saved locally", "Current session"). */
    freshness: string;
    /** Who owns this section (e.g. "BI owner", "AI platform owner"). */
    owner: string;
    /** Suggested next action — rendered in accent color. */
    nextAction: string;
}

export interface ProgressiveSectionProps {
    /** DOM id used by the BookmarkNav scrollIntoView lookup. */
    anchorId: string;
    /** Two-digit ordinal (e.g. "01", "02"). Displayed inside the numbered badge. */
    number: string;
    title: string;
    /** One-line status / context under the title. */
    subtitle?: string;
    /** True when the section is expanded. */
    active: boolean;
    /** True when the section's completion gate is satisfied (badge → "OK"). */
    checked: boolean;
    /** Optional ownership / freshness / next-action metadata row. */
    metadata?: SectionMetadata;
    /** Toggle handler — called when the user clicks the header. */
    onToggle: () => void;
    children: React.ReactNode;
}

export function ProgressiveSection(props: ProgressiveSectionProps): React.ReactElement {
    return (
        <div
            id={`pp-setup-section-${props.anchorId}`}
            className={
                "pp-setup-gate " +
                (props.active ? "pp-setup-gate--active " : "") +
                (props.checked ? "pp-setup-gate--checked " : "")
            }
        >
            <button
                type="button"
                className="pp-setup-gate__header"
                onClick={props.onToggle}
                aria-expanded={props.active}
            >
                <div className="pp-setup-gate__title-row">
                    <span className="pp-setup-gate__number">
                        {props.checked ? "OK" : props.number}
                    </span>
                    <div>
                        <h3 className="pp-setup-gate__title">{props.title}</h3>
                        {props.subtitle && (
                            <p className="pp-setup-gate__subtitle">{props.subtitle}</p>
                        )}
                    </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                    {props.active ? "Collapse" : "Expand"}
                </span>
            </button>
            {props.active && (
                <div className="pp-setup-gate__content">
                    {props.metadata && (
                        <div className="pp-setup-metadata">
                            <div className="pp-setup-metadata__item">
                                <span className="pp-setup-metadata__label">Source:</span>
                                <span className="pp-setup-metadata__value">{props.metadata.source}</span>
                            </div>
                            <div className="pp-setup-metadata__item">
                                <span className="pp-setup-metadata__label">Freshness:</span>
                                <span className="pp-setup-metadata__value">{props.metadata.freshness}</span>
                            </div>
                            <div className="pp-setup-metadata__item">
                                <span className="pp-setup-metadata__label">Owner:</span>
                                <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>
                                    {props.metadata.owner}
                                </span>
                            </div>
                            <div className="pp-setup-metadata__item">
                                <span className="pp-setup-metadata__label">Next action:</span>
                                <span className="pp-setup-metadata__value" style={{ color: "var(--pp-accent)" }}>
                                    {props.metadata.nextAction}
                                </span>
                            </div>
                        </div>
                    )}
                    {props.children}
                </div>
            )}
        </div>
    );
}
