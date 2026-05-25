// playground/src/components/TopRightToolbar.tsx
//
// 2026-05-25 — single global toolbar at top-right of the PulsePlay
// viewport, BELOW the green "Ready BI + AI" pill. Replaces the per-pane
// toolbars (PaneChrome + Pulse gn-pane-action-cluster) as the single
// source of truth for cross-cutting affordances: Maximize / Minimize /
// Pin / Pop-out (window) / Open-in-new-page / Show-all-panels.
//
// Each button dispatches a `pulseplay:viewport-action` event for the
// CURRENTLY ACTIVE pane (resolved from activeSurface):
//   - bi-viz  → pane "bi"
//   - else    → pane "ai"
//
// App.tsx already listens to viewport-action events and routes them
// through the same handlers PaneChrome + Pulse used, so behavior stays
// identical — only the rendering location changes.

import React, { useEffect, useState } from "react";

export type TopRightToolbarPane = "ai" | "bi";
export type TopRightToolbarAction = "focus" | "restore" | "minimize" | "pin" | "open-page" | "float" | "show-all";

export interface TopRightToolbarProps {
    /** Active pane (drives which pane the actions target). */
    activePane: TopRightToolbarPane;
    /** Human-readable tab name for label-text. For AI panes the toolbar
     *  ALSO subscribes to Pulse's `pulseplay:pulse-tab-changed` event to
     *  refine this between "AI Insights" and "Ask Pulse" when the user
     *  flips inside the Pulse tab strip — App-level effectiveSurfaceId
     *  doesn't track that internal switch on its own. */
    activeTabName: string;
    /** True if the active pane is currently maximized (toggles Maximize → Restore). */
    isFocused: boolean;
    /** True if the active pane is currently pinned (toggles Pin → Unpin). */
    isPinned: boolean;
    /** True if a "Show all panels" affordance makes sense right now
     *  (i.e. one pane is hidden and the other is visible). */
    canShowAll: boolean;
}

const PULSEPLAY_VIEWPORT_ACTION_EVENT = "pulseplay:viewport-action";

function dispatchAction(action: string, pane: TopRightToolbarPane): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(PULSEPLAY_VIEWPORT_ACTION_EVENT, {
        detail: { action, pane },
    }));
}

export function TopRightToolbar(props: TopRightToolbarProps): React.ReactElement {
    const { activePane, isFocused, isPinned, canShowAll } = props;

    // 2026-05-25 — subscribe to Pulse's internal tab-changed events so
    // labels stay in sync when the user clicks AI Insights / Ask Pulse
    // INSIDE the Pulse tab strip (those clicks don't reach App.tsx's
    // effectiveSurfaceId). Defaults to null; resolved label below uses
    // the prop-supplied activeTabName when no Pulse signal has arrived
    // (initial render before Pulse mounts) or when on the BI pane.
    const [pulseTab, setPulseTab] = useState<"insights" | "chat" | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (e: Event) => {
            const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
            if (tab === "insights" || tab === "chat") setPulseTab(tab);
        };
        window.addEventListener("pulseplay:pulse-tab-changed", handler as EventListener);
        return () => window.removeEventListener("pulseplay:pulse-tab-changed", handler as EventListener);
    }, []);

    // Resolved label: BI pane always uses the prop (Dashboard); AI pane
    // prefers the live Pulse signal when present, falling back to the prop.
    const activeTabName: string = activePane === "bi"
        ? props.activeTabName
        : pulseTab === "chat"
            ? "Ask Pulse"
            : pulseTab === "insights"
                ? "AI Insights"
                : props.activeTabName;

    // Container — fixed top-right BELOW the green Ready pill (~52px tall).
    const containerStyle: React.CSSProperties = {
        position: "fixed",
        top: 60,
        right: 12,
        zIndex: 50, // above pane chrome but below modals (which use 1000+)
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 6,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    };
    const btnStyle: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 26,
        minHeight: 26,
        padding: "2px 6px",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 4,
        background: "rgba(255,255,255,0.85)",
        color: "#374151",
        cursor: "pointer",
        fontSize: 11,
    };
    const activeBtnStyle: React.CSSProperties = {
        ...btnStyle,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 600,
    };

    return (
        <div
            role="toolbar"
            aria-label="PulsePlay window controls"
            data-testid="pp-top-right-toolbar"
            style={containerStyle}
        >
            {/* Maximize / Restore */}
            {isFocused ? (
                <button
                    type="button"
                    aria-label={`Restore ${activeTabName} tab`}
                    title={`Restore ${activeTabName} tab to split layout`}
                    onClick={() => dispatchAction("restore", activePane)}
                    style={activeBtnStyle}
                >
                    <SvgIcon name="restore" />
                </button>
            ) : (
                <button
                    type="button"
                    aria-label={`Maximize ${activeTabName} tab`}
                    title={`Maximize ${activeTabName} tab`}
                    onClick={() => dispatchAction("focus", activePane)}
                    style={btnStyle}
                >
                    <SvgIcon name="maximize" />
                </button>
            )}

            {/* Minimize */}
            <button
                type="button"
                aria-label={`Minimize ${activeTabName} tab`}
                title={`Minimize ${activeTabName} tab`}
                onClick={() => dispatchAction("minimize", activePane)}
                style={btnStyle}
            >
                <SvgIcon name="minimize" />
            </button>

            {/* Pin / Unpin */}
            <button
                type="button"
                aria-label={isPinned ? `Unpin ${activeTabName} tab` : `Pin ${activeTabName} tab as default`}
                title={isPinned ? `Unpin ${activeTabName} tab` : `Pin ${activeTabName} tab as the focused startup layout`}
                aria-pressed={isPinned}
                onClick={() => dispatchAction("pin", activePane)}
                style={isPinned ? activeBtnStyle : btnStyle}
            >
                <SvgIcon name="pin" />
            </button>

            {/* Open in separate page */}
            <button
                type="button"
                aria-label={`Open ${activeTabName} tab in separate page`}
                title={`Open ${activeTabName} tab in a new browser tab`}
                onClick={() => dispatchAction("open-page", activePane)}
                style={btnStyle}
            >
                <SvgIcon name="external-link" />
            </button>

            {/* Pop out as window */}
            <button
                type="button"
                aria-label={`Pop out ${activeTabName} tab as window`}
                title={`Pop out ${activeTabName} tab as a detached browser window you can keep alongside the main app`}
                onClick={() => dispatchAction("float", activePane)}
                style={btnStyle}
            >
                <SvgIcon name="float-window" />
            </button>

            {/* Show all panels (only when applicable) */}
            {canShowAll && (
                <button
                    type="button"
                    aria-label="Show all panels"
                    title="Restore the split layout — show all enabled panels side by side"
                    onClick={() => {
                        // "Show all" maps to dispatching a focus-null/restore on
                        // the currently-focused pane. The App.tsx handler treats
                        // "restore" as "drop focus", which returns split layout.
                        dispatchAction("restore", activePane);
                    }}
                    style={btnStyle}
                >
                    <SvgIcon name="show-all" />
                </button>
            )}
        </div>
    );
}

// Inline SVG icons — match the existing PaneChrome iconography by shape.
// Kept self-contained so the component has no external icon dep.
function SvgIcon({ name }: { name: string }): React.ReactElement {
    const stroke = "currentColor";
    const sw = 1.8;
    switch (name) {
        case "maximize":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
            );
        case "restore":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M4 16 V6 a2 2 0 0 1 2-2 h10" />
                </svg>
            );
        case "minimize":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="19" x2="19" y2="19" />
                </svg>
            );
        case "pin":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 17v5" />
                    <path d="M9 17h6" />
                    <path d="M12 2 L8 8 h8 L12 2 Z" />
                    <rect x="9" y="8" width="6" height="9" rx="1" />
                </svg>
            );
        case "external-link":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 4 h6 v6" />
                    <path d="M20 4 L11 13" />
                    <path d="M20 14 v6 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 V8 a2 2 0 0 1 2 -2 h6" />
                </svg>
            );
        case "float-window":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="6" width="12" height="12" rx="2" />
                    <rect x="10" y="2" width="12" height="12" rx="2" />
                </svg>
            );
        case "show-all":
            return (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="8" height="14" rx="1" />
                    <rect x="13" y="5" width="8" height="14" rx="1" />
                </svg>
            );
        default:
            return <span />;
    }
}
