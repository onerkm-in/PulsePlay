// playground/src/components/AssistantEmptyState.tsx
//
// PulsePlay-native equivalent of PulseShell's AI Insights empty-state.
// Mounts above the composer when the assistant has no history yet —
// gives the user a clear "what does this surface do, how do I configure
// it, where do I learn more" signpost instead of an empty canvas.
//
// Why a new primitive: PulseShell renders this via gn-insights-placeholder
// inside pulse/visual.tsx (Pulse-port compat surface, gn-* CSS). v0
// surfaces use pp-* CSS, so we render the equivalent through a native
// primitive. Same information shape, same CTAs (Settings → AI + Knowledge
// packs).

import * as React from "react";

export interface AssistantEmptyStateProps {
    /** When true, render the "configured · ask anything" tone instead of
     *  the "connect AI" CTA block. UnifiedAssistantSurface passes true
     *  when there is an active connector. */
    isConfigured: boolean;
    /** Title shown in the empty-state. Defaults to "Ask Pulse" — caller
     *  should pass the surface name when reusing this primitive elsewhere
     *  (e.g. "AI Insights"). */
    title?: string;
    /** Optional override for the connect handler (Settings navigation).
     *  Defaults to `pushState("/settings/ai")` + dispatch
     *  `pulseplay:settings-navigate`. */
    onConnectClick?: () => void;
    /** Optional override for the browse-packs handler. Defaults to
     *  `pushState("/knowledge")` + dispatch popstate so the SPA picks up
     *  the route change. */
    onBrowsePacksClick?: () => void;
}

/** Default Settings-AI navigation. Matches the Pulse handler so the two
 *  surfaces route identically. */
function defaultConnect(): void {
    try {
        window.history.pushState({}, "", "/settings/ai");
        window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
    } catch { /* swallow */ }
}

/** Default knowledge-pack navigation. Matches the Pulse handler. */
function defaultBrowsePacks(): void {
    try {
        window.history.pushState({}, "", "/knowledge");
        window.dispatchEvent(new PopStateEvent("popstate"));
    } catch { /* swallow */ }
}

/** Empty-state block: sparkle icon + heading + 4-bullet "what you'll see"
 *  list + 2 CTAs. Renders the configured variant when AI is wired so
 *  users get a "ask anything about your data" prompt instead of a stale
 *  "connect AI" CTA. */
export function AssistantEmptyState({
    isConfigured,
    title = "Ask Pulse",
    onConnectClick = defaultConnect,
    onBrowsePacksClick = defaultBrowsePacks,
}: AssistantEmptyStateProps): React.ReactElement {
    return (
        <div className="pp-assistant-empty" data-testid="pp-assistant-empty">
            <span className="pp-assistant-empty__icon" aria-hidden="true">✨</span>
            <h3 className="pp-assistant-empty__title">{title}</h3>
            {isConfigured ? (
                <p className="pp-assistant-empty__lede">
                    Ask anything about your data — your BI events will be captured for context.
                </p>
            ) : (
                <>
                    <p className="pp-assistant-empty__lede">
                        Connect an AI assistant and PulsePlay will answer questions across whatever you're looking at.
                    </p>
                    <ul className="pp-assistant-empty__bullets">
                        <li>Conversational answers grounded in your BI context</li>
                        <li>Trends and risks flagged with evidence</li>
                        <li>Briefings on demand — Headline, Trends, Risks, Actions</li>
                        <li>Domain vocabulary via knowledge packs</li>
                    </ul>
                    <div className="pp-assistant-empty__cta-row">
                        <button
                            type="button"
                            className="pp-assistant-empty__cta pp-assistant-empty__cta--primary"
                            onClick={onConnectClick}
                            data-testid="pp-assistant-empty-connect"
                        >
                            Connect AI assistant →
                        </button>
                        <button
                            type="button"
                            className="pp-assistant-empty__cta pp-assistant-empty__cta--secondary"
                            onClick={onBrowsePacksClick}
                            data-testid="pp-assistant-empty-browse-packs"
                        >
                            Browse knowledge packs
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
