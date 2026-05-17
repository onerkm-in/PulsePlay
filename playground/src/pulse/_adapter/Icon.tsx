// playground/src/pulse/_adapter/Icon.tsx
//
// Lucide-style inline-SVG icon set for PulsePlay. Pulse's PBI-custom-
// visual heritage used emoji (📋, ↻, ⚙, </>) because the 350 KB pbiviz
// bundle cap discouraged icon-font deps. PulsePlay has no such cap, so
// we ship proper SVG icons inline — zero deps added, stroke="currentColor"
// so they inherit the parent button's colour automatically, and consistent
// 1.75-stroke geometry across the set so they read as one family.
//
// All icons are 16×16 viewBox (renders at any size via the `size` prop;
// default 14 matches Pulse's existing pill-button hit-target). All use
// `aria-hidden="true"` since they sit inside a labelled button — the
// button's `aria-label` is the accessible name.

import * as React from "react";

export type IconName =
    | "copy" | "check" | "refresh" | "stop" | "code" | "settings"
    | "external-link" | "download" | "search" | "filter" | "x"
    | "file-html" | "printer" | "maximize" | "minimize" | "restore"
    | "float-window";

interface IconProps {
    name: IconName;
    /** Edge length in pixels. Defaults to 14 (matches Pulse pill height). */
    size?: number;
    /** Inline style passthrough. */
    style?: React.CSSProperties;
}

const PATHS: Record<IconName, React.ReactElement> = {
    // Two stacked rounded rects — clipboard / copy.
    copy: (
        <>
            <rect x="5" y="3" width="9" height="9" rx="1.5" />
            <path d="M3 5.5v8A1.5 1.5 0 0 0 4.5 15h7" />
        </>
    ),
    // Checkmark — confirmation state for the copy button.
    check: <path d="M3.5 8.5l3 3 6-6.5" />,
    // Circular arrow — refresh / retry.
    refresh: (
        <>
            <path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9L13.5 2.5" />
            <path d="M13.5 2.5v3.5h-3.5" />
            <path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9L2.5 13.5" />
            <path d="M2.5 13.5v-3.5h3.5" />
        </>
    ),
    // Filled square — stop / cancel running operation.
    stop: <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />,
    // `< >` brackets — show SQL / code view.
    code: (
        <>
            <path d="M5.5 4.5L2 8l3.5 3.5" />
            <path d="M10.5 4.5L14 8l-3.5 3.5" />
        </>
    ),
    // Gear — settings / configure custom sections.
    settings: (
        <>
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4" />
        </>
    ),
    // External link — open in new tab / Service.
    "external-link": (
        <>
            <path d="M9.5 2.5h4v4" />
            <path d="M13.5 2.5l-6 6" />
            <path d="M11.5 9.5v3.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h3.5" />
        </>
    ),
    // Download arrow.
    download: (
        <>
            <path d="M8 2v8.5" />
            <path d="M4.5 7L8 10.5 11.5 7" />
            <path d="M2.5 13.5h11" />
        </>
    ),
    // Search magnifier.
    search: (
        <>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L13.5 13.5" />
        </>
    ),
    // Funnel — filter.
    filter: <path d="M2 3.5h12l-4.5 5v5l-3-1v-4z" />,
    // Close X.
    x: (
        <>
            <path d="M3.5 3.5l9 9" />
            <path d="M12.5 3.5l-9 9" />
        </>
    ),
    // Document with HTML tag — rich-text export.
    "file-html": (
        <>
            <path d="M3.5 2h6.5l3 3v8.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5z" />
            <path d="M10 2v3h3" />
            <path d="M5.5 11l-1-1.5 1-1.5" />
            <path d="M10.5 11l1-1.5-1-1.5" />
            <path d="M8.5 8l-1 3" />
        </>
    ),
    // Printer — PDF export via browser print.
    printer: (
        <>
            <path d="M4 6V2.5h8V6" />
            <rect x="2.5" y="6" width="11" height="6" rx="1" />
            <rect x="4.5" y="9.5" width="7" height="4" />
        </>
    ),
    // Maximize — pane focus.
    maximize: (
        <>
            <path d="M6 2.5H2.5V6" />
            <path d="M10 2.5h3.5V6" />
            <path d="M13.5 10v3.5H10" />
            <path d="M6 13.5H2.5V10" />
            <path d="M5.5 5.5L2.5 2.5" />
            <path d="M10.5 5.5l3-3" />
            <path d="M10.5 10.5l3 3" />
            <path d="M5.5 10.5l-3 3" />
        </>
    ),
    // Minimize — collapse pane to dock.
    minimize: <path d="M3 12.5h10" />,
    // Restore — return from focused pane to split layout.
    restore: (
        <>
            <rect x="3" y="5.5" width="7.5" height="7.5" rx="1" />
            <path d="M6 3h7v7" />
        </>
    ),
    // Float window — two stacked window-shaped rects, the inner offset to
    // suggest a detached popup floating over the host. Distinct from
    // external-link (arrow-in-corner = open-in-tab) and restore (single rect
    // emerging from another = return-to-split).
    "float-window": (
        <>
            <rect x="2" y="4.5" width="8" height="7" rx="1" />
            <rect x="6" y="2" width="8" height="7" rx="1" />
        </>
    ),
};

export function Icon(props: IconProps): React.ReactElement {
    const size = props.size ?? 14;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            style={props.style}
        >
            {PATHS[props.name]}
        </svg>
    );
}
