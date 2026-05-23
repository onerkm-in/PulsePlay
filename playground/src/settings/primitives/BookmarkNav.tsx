// playground/src/settings/primitives/BookmarkNav.tsx
//
// UX-ARCH-0B.2 Phase F — extracted from SetupGroup so the same numbered-
// chip "jump to a section" bookmark navigation is reusable across AI Setup,
// BI Setup, Display, and Advanced.
//
// Visual: a horizontal strip of numbered pills (1, 2, 3, ✓, 5). Each pill is
// clickable and scrolls the page to the corresponding section. A pill is in
// one of three visual states:
//   - default  (numbered, neutral)
//   - active   (currently expanded section — highlighted with accent)
//   - checked  (gate satisfied — green check)
//
// Callers own the section-step state machine; this is pure presentation.

import * as React from "react";

export interface BookmarkSection {
    /** Unique anchor id used for scrollToSection lookups. */
    id: string;
    /** Step number rendered inside the pill when not checked. */
    step: number;
    /** Visible label to the right of the number. */
    label: string;
    /** Gate satisfied — render the green check. */
    checked: boolean;
    /** Currently expanded — render with accent. */
    active: boolean;
}

export interface BookmarkNavProps {
    sections: ReadonlyArray<BookmarkSection>;
    onJump: (id: string, step: number) => void;
    /** aria-label for the wrapping nav region. */
    ariaLabel?: string;
}

export function BookmarkNav(props: BookmarkNavProps): React.ReactElement {
    return (
        <div
            className="pp-setup__anchors"
            role="navigation"
            aria-label={props.ariaLabel || "Section bookmarks"}
        >
            {props.sections.map(section => (
                <button
                    key={section.id}
                    type="button"
                    className={
                        "pp-setup__anchor" +
                        (section.active ? " pp-setup__anchor--active" : "") +
                        (section.checked ? " pp-setup__anchor--checked" : "")
                    }
                    onClick={() => props.onJump(section.id, section.step)}
                    aria-current={section.active ? "step" : undefined}
                >
                    <span className="pp-setup__anchor-dot" aria-hidden="true">
                        {section.checked ? "✓" : section.step}
                    </span>
                    <span className="pp-setup__anchor-label">{section.label}</span>
                </button>
            ))}
        </div>
    );
}
