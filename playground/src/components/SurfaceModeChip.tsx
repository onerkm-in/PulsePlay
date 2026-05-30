// playground/src/components/SurfaceModeChip.tsx
//
// Top-bar chip that flips the user-visible chat surface between v0
// (UnifiedAssistantSurface — the default) and pulse (PulseShell — the
// feature-complete fallback during the ARCH-P1 feature-port migration).
//
// 2026-05-27 — "New design" iteration of the v0 ↔ pulse switch. The
// original picker (commit 63d3917) was a Settings → Preferences →
// Mode ButtonGroup; it was removed when v0 became the default. This
// chip puts the switch back in a discoverable place (top-right of the
// app bar) without burying it behind 3 clicks in Settings. Click it
// to flip; no reload needed (settingsStore + App both listen for the
// `pulseplay:display-change` event the click dispatches).
//
// Design rationale:
//   - Top-bar placement = view/mode controls live where users instinctively
//     look (right side of the title bar). Same area as Setup / Trust pill.
//   - Single button (not a segmented control with two options) keeps the
//     footprint small AND makes the "click to switch" affordance obvious —
//     a segmented control with the active state already selected reads as
//     "this is what's active," not "click me."
//   - Live-toggle via display-change event = no page reload. The user can
//     flip back and forth fluidly to compare surfaces.
//   - Honest labels: "Chat" (v0 = single-pane conversational) and
//     "Workbench" (pulse = 3-tab strip + briefing-heritage chrome). These
//     describe what the user actually sees, not internal codenames.

import * as React from "react";
import type { UiMode } from "../settings/settingsStore";

export interface SurfaceModeChipProps {
    /** Current uiMode from App's local state. The chip reads this to
     *  decide which label to show + what the "switch to" target is. */
    currentMode: UiMode;
    /** Optional className for layout adjustments at the call site. */
    className?: string;
}

const LABELS: Record<UiMode, { current: string; description: string }> = {
    v0:    { current: "Chat",      description: "Single-pane conversational assistant" },
    pulse: { current: "Workbench", description: "3-tab workbench with briefings, exports, and SQL sections" },
};

const UI_MODE_STORAGE_KEY = "pulseplay:ui-mode";

/** Flip the surface mode by writing localStorage + dispatching the
 *  `pulseplay:display-change` event both settingsStore + App listen for.
 *  No reload — React re-renders the surface in place. PulseShell is
 *  lazy-loaded so the FIRST v0→pulse flip shows a Suspense fallback
 *  briefly; subsequent flips are instant. */
function flipMode(next: UiMode): void {
    try {
        window.localStorage.setItem(UI_MODE_STORAGE_KEY, next);
        window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
            detail: { key: UI_MODE_STORAGE_KEY, value: next },
        }));
    } catch { /* swallow — localStorage may be unavailable in some sandboxes */ }
}

export function SurfaceModeChip({
    currentMode,
    className,
}: SurfaceModeChipProps): React.ReactElement {
    const otherMode: UiMode = currentMode === "v0" ? "pulse" : "v0";
    const currentLabel = LABELS[currentMode].current;
    const otherLabel = LABELS[otherMode].current;
    const otherDescription = LABELS[otherMode].description;

    return (
        <button
            type="button"
            className={`pp-surface-mode-chip${className ? ` ${className}` : ""}`}
            onClick={() => flipMode(otherMode)}
            data-testid="pp-surface-mode-chip"
            data-current-mode={currentMode}
            title={`Currently: ${currentLabel}. Click to switch to ${otherLabel} — ${otherDescription}.`}
            aria-label={`Switch surface mode to ${otherLabel}`}
        >
            <span className="pp-surface-mode-chip__label">{currentLabel}</span>
            <span className="pp-surface-mode-chip__arrow" aria-hidden="true">⇄</span>
            <span className="pp-surface-mode-chip__target">{otherLabel}</span>
        </button>
    );
}
