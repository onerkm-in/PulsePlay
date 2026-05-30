// playground/src/components/PulsePlayScreen.tsx
//
// Step 2b — render-prop seam for the unified screen owner.
//
// PulsePlayScreen is the SINGLE component that owns the user-visible
// PulsePlay screen. App.tsx is the bootstrap shell (routing, allowlist
// + settings providers, wizards); everything the END USER sees flows
// through this component.
//
// v0.1 (Step 2a, commit 2d7baa5): CSS-neutral wrapper with `children`.
// v0.2 (Step 2b, this commit):    render-prop seam with three named
//                                  slots — floatingPaneSlot,
//                                  mainLayoutSlot, minimizedDockSlot —
//                                  so PulsePlayScreen owns the canonical
//                                  composition + render order even while
//                                  the slot CONTENT still lives in
//                                  App.tsx. Future Steps incrementally
//                                  absorb each slot:
//                                    Step 3:  3-tab strip wraps the
//                                             mainLayoutSlot composition
//                                    Step 7:  duplicative-detach fix
//                                             rebuilds the floatingPaneSlot
//                                             as a Map-based overlay
//                                    Step 8:  Dashboard 2-pane mode
//                                             extends the mainLayoutSlot
//
// Why slots vs verbatim JSX extraction: the JSX block in App.tsx uses
// 8 App.tsx-internal components (PaneChrome, FloatingPanel, SplitLayout,
// BITileGrid, PowerBIDeveloperPanel, PulseLoadingState, MinimizedPaneDock,
// BiSurfaceModeMiniControl) that aren't exported. A clean verbatim
// extraction would also need to move those 8 components to their own
// files OR export them — 8-12h of mechanical work that doesn't change
// behavior. The render-prop seam ships the real architectural shift
// (PulsePlayScreen now owns canonical composition) in ~1h while keeping
// the helper components where they are. As features land in Steps 3+,
// the slots absorb content into PulsePlayScreen one at a time.
//
// CSS posture: wrapper still uses `display: contents` so the layout
// stays CSS-neutral. The slot wrapper divs also use display: contents
// so the slot content renders at the same DOM level as before.

import * as React from "react";

export interface PulsePlayScreenProps {
    /** The floating in-app overlay slot. Rendered FIRST so it sits at
     *  the top of the unified screen's DOM tree (z-index handles visual
     *  stacking; DOM order just affects accessibility focus traversal).
     *  Conditional content: callers pass `null` when no pane is
     *  detached. Step 7 absorbs this slot's content into PulsePlayScreen
     *  itself + extends to a Map<paneId, FloatState> for multi-pane
     *  detach. */
    floatingPaneSlot?: React.ReactNode;
    /** The main layout slot — BI canvas + AI surface side-by-side via
     *  the current SplitLayout. Step 3 wraps this slot with the 3-tab
     *  strip; Step 8 extends it for Dashboard 2-pane mode. */
    mainLayoutSlot: React.ReactNode;
    /** The bottom-anchored minimized-pane dock that appears when a pane
     *  is minimized. Step 2.5 may absorb this into the unified affordance
     *  toolbar's restore action; for now it stays a peer slot. */
    minimizedDockSlot?: React.ReactNode;
    /** Optional className override on the outer wrapper. */
    className?: string;
}

/** The user-visible PulsePlay screen owner.
 *
 *  Renders three named slots in canonical order:
 *    1. floatingPaneSlot   — in-app overlay (above everything via z-index)
 *    2. mainLayoutSlot     — primary screen content
 *    3. minimizedDockSlot  — bottom dock for minimized panes
 *
 *  PulsePlayScreen owns the COMPOSITION (which slots, what order, how
 *  they relate); App.tsx still owns the CONTENT (what each slot renders).
 *  Steps 3/7/8 incrementally absorb slot content into PulsePlayScreen
 *  itself per the unified-screen design doc (§5).
 *
 *  See docs/research/UNIFIED_SCREEN_DESIGN_2026-05-25.md §5 for the full
 *  component shape + state-management contract. */
export function PulsePlayScreen({
    floatingPaneSlot,
    mainLayoutSlot,
    minimizedDockSlot,
    className,
}: PulsePlayScreenProps): React.ReactElement {
    return (
        <div
            data-testid="pp-screen"
            className={className}
            // `display: contents` ⇒ wrapper element is in the DOM tree
            // (for data-testid + ARIA + future CSS hooks) but doesn't
            // generate a box. Children render as if the wrapper weren't
            // there — preserves the existing App.tsx layout behavior.
            style={{ display: "contents" }}
        >
            {/* Slot 1: floating in-app overlay. Rendered first so it
                sits at top of DOM tree (a11y focus traversal). z-index
                in the slot content itself handles visual stacking. */}
            {floatingPaneSlot ? (
                <div data-testid="pp-screen-floating-slot" style={{ display: "contents" }}>
                    {floatingPaneSlot}
                </div>
            ) : null}

            {/* Slot 2: main layout — primary screen content (BI canvas
                + AI surface, currently via SplitLayout). Required slot. */}
            <div data-testid="pp-screen-main-slot" style={{ display: "contents" }}>
                {mainLayoutSlot}
            </div>

            {/* Slot 3: bottom-anchored dock for minimized panes. Only
                rendered when a pane is minimized — caller passes null
                when the dock isn't needed. */}
            {minimizedDockSlot ? (
                <div data-testid="pp-screen-dock-slot" style={{ display: "contents" }}>
                    {minimizedDockSlot}
                </div>
            ) : null}
        </div>
    );
}
