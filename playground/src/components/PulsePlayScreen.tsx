// playground/src/components/PulsePlayScreen.tsx
//
// Step 2a (beachhead) of the unified-surface plan locked 2026-05-25
// in docs/research/UNIFIED_SCREEN_DESIGN_2026-05-25.md.
//
// PulsePlayScreen is the SINGLE component that owns the user-visible
// PulsePlay screen — the 3-tab strip + main canvas + composer dock +
// floating overlays. App.tsx is the bootstrap shell (routing, allowlist
// + settings providers, wizards); everything the END USER sees flows
// through this component.
//
// This file ships as a thin wrapper FIRST (Step 2a) so the named
// component exists as the foundation. Step 2b will move the actual
// pane-mount JSX (FloatingPanel + SplitLayout with BIPanel +
// UnifiedAssistantSurface inside) out of App.tsx and into here. Step 3
// adds the 3-tab strip + tab-body morph. Step 7 introduces the
// duplicative-detach Map-based overlay state.
//
// CSS posture: the wrapper uses `display: contents` so the wrapper
// element is in the DOM tree (for data-testid + future class hooks)
// but produces NO box of its own. Children render as if the wrapper
// weren't there — zero visual regression risk during Step 2a's
// transition.

import * as React from "react";

export interface PulsePlayScreenProps {
    /** Children — currently the existing pane-mount JSX from App.tsx.
     *  Step 2b will absorb this into PulsePlayScreen's own JSX and
     *  remove the children prop in favor of the explicit props it
     *  needs to render the panes directly. */
    children: React.ReactNode;
    /** Optional className override for the wrapper. Mostly for testing. */
    className?: string;
}

/** The user-visible PulsePlay screen owner.
 *
 *  v0.1 (Step 2a): thin wrapper around the existing App.tsx pane mount.
 *  v0.2 (Step 2b): absorbs the FloatingPanel + SplitLayout + BIPanel +
 *                  UnifiedAssistantSurface mounting logic.
 *  v0.3 (Step 3):  adds the 3-tab strip (AI Insights / Ask Pulse /
 *                  Dashboard) + per-tab body morphing.
 *  v0.4 (Step 7):  duplicative-detach via Map-based overlay state.
 *
 *  See docs/research/UNIFIED_SCREEN_DESIGN_2026-05-25.md §5 for the
 *  full component shape + state-management contract. */
export function PulsePlayScreen({ children, className }: PulsePlayScreenProps): React.ReactElement {
    return (
        <div
            data-testid="pp-screen"
            className={className}
            // `display: contents` ⇒ the wrapper element is in the DOM
            // tree (for data-testid + ARIA + future CSS hooks) but
            // doesn't generate a box of its own. Children render as
            // if the wrapper weren't there. Step 2a posture; future
            // steps add real layout to this element.
            style={{ display: "contents" }}
        >
            {children}
        </div>
    );
}
