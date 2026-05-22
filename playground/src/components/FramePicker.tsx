// playground/src/components/FramePicker.tsx
//
// Phase A — analysis-frame dropdown. Renders the DiscoverySnapshot's
// reachable + unreachable frames as a `<select>`. Unreachable frames are
// disabled with a tooltip explaining what's missing.
//
// Phase A scope: this component is presentation-only. Selecting a frame
// updates parent state but does NOT change the AI ask flow yet — Phase B
// wires the frame into the prompt. The win at this phase is "user sees
// what's reachable here, before committing to a question."
//
// The component is intentionally `<select>`-based (not a custom popup) so
// it's accessible, keyboard-navigable, and rendered correctly in
// constrained-height sidebars. Tooltips on disabled <option>s aren't
// universally supported across browsers, so the blockedBy reason for
// unreachable frames also lands in a paragraph below the select when one
// is highlighted.

import { useMemo, useState, type ReactElement } from "react";
import type {
    DiscoverySnapshot,
    ReachableFrame,
    UnreachableFrame,
} from "../lib/discoveryClient";

export interface FramePickerProps {
    snapshot: DiscoverySnapshot | null;
    /** When loading, show a placeholder. */
    loading?: boolean;
    /** Selected frameId (controlled). */
    value?: string | null;
    /** Selection handler. Receives frameId or null (when user picks "(free text)"). */
    onChange?: (frameId: string | null) => void;
    /** Render in compact mode (no descriptions, no domain headers). */
    compact?: boolean;
}

const FREE_TEXT_VALUE = "__free-text";

export function FramePicker(props: FramePickerProps): ReactElement {
    const { snapshot, loading, value, onChange, compact } = props;
    const [hoverFrame, setHoverFrame] = useState<string | null>(null);

    const grouped = useMemo(() => {
        if (!snapshot) return null;
        // Group by domain for sensible <optgroup> hierarchy.
        const reachableByDomain = new Map<string, ReachableFrame[]>();
        const unreachableByDomain = new Map<string, UnreachableFrame[]>();
        for (const r of snapshot.fused.reachableFrames) {
            const d = r.domain || "Other";
            if (!reachableByDomain.has(d)) reachableByDomain.set(d, []);
            reachableByDomain.get(d)!.push(r);
        }
        for (const u of snapshot.fused.unreachableFrames) {
            const d = u.domain || "Other";
            if (!unreachableByDomain.has(d)) unreachableByDomain.set(d, []);
            unreachableByDomain.get(d)!.push(u);
        }
        return { reachableByDomain, unreachableByDomain };
    }, [snapshot]);

    const currentValue = value ?? FREE_TEXT_VALUE;
    const blockedReason = useMemo(() => {
        if (!snapshot || !hoverFrame) return null;
        const blocked = snapshot.fused.unreachableFrames.find(f => f.frameId === hoverFrame);
        return blocked?.blockedBy || null;
    }, [snapshot, hoverFrame]);

    if (loading) {
        return (
            <div
                className="pp-frame-picker pp-frame-picker--loading"
                data-testid="pp-frame-picker"
                aria-busy="true"
            >
                <label className="pp-frame-picker__label" htmlFor="pp-frame-picker-select">
                    Frame
                </label>
                <select
                    id="pp-frame-picker-select"
                    className="pp-frame-picker__select"
                    disabled
                    aria-label="Analysis frame (loading)"
                >
                    <option>Loading available frames…</option>
                </select>
            </div>
        );
    }

    if (!snapshot || !grouped) {
        return (
            <div className="pp-frame-picker" data-testid="pp-frame-picker">
                <label className="pp-frame-picker__label" htmlFor="pp-frame-picker-select">
                    Frame
                </label>
                <select
                    id="pp-frame-picker-select"
                    className="pp-frame-picker__select"
                    value={FREE_TEXT_VALUE}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange?.(v === FREE_TEXT_VALUE ? null : v);
                    }}
                >
                    <option value={FREE_TEXT_VALUE}>Free text (ask anything)</option>
                </select>
            </div>
        );
    }

    return (
        <div className="pp-frame-picker" data-testid="pp-frame-picker">
            <label className="pp-frame-picker__label" htmlFor="pp-frame-picker-select">
                Frame
            </label>
            <select
                id="pp-frame-picker-select"
                className="pp-frame-picker__select"
                value={currentValue}
                onChange={(e) => {
                    const v = e.target.value;
                    onChange?.(v === FREE_TEXT_VALUE ? null : v);
                }}
                onMouseOver={(e) => {
                    const v = (e.target as HTMLOptionElement).value;
                    if (v && v !== FREE_TEXT_VALUE) setHoverFrame(v);
                }}
                onMouseLeave={() => setHoverFrame(null)}
                aria-label="Analysis frame"
            >
                <option value={FREE_TEXT_VALUE}>Free text (ask anything)</option>
                {[...grouped.reachableByDomain.entries()].map(([domain, frames]) => (
                    <optgroup key={`reach-${domain}`} label={`✓ ${domain}`}>
                        {frames.map(f => (
                            <option
                                key={f.frameId}
                                value={f.frameId}
                                title={compact ? f.label : `${f.label} — ${f.description}\n\nReachable: ${f.rationale}`}
                            >
                                {f.label}
                            </option>
                        ))}
                    </optgroup>
                ))}
                {[...grouped.unreachableByDomain.entries()].map(([domain, frames]) => (
                    <optgroup key={`unreach-${domain}`} label={`✗ ${domain} (unreachable)`}>
                        {frames.map(f => (
                            <option
                                key={f.frameId}
                                value={f.frameId}
                                disabled
                                title={`${f.label} — ${f.description}\n\nBlocked: ${f.blockedBy}`}
                                data-blocked-by={f.blockedBy}
                            >
                                {f.label} — unreachable
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            {blockedReason && (
                <p
                    className="pp-frame-picker__blocked-reason"
                    data-testid="pp-frame-picker-blocked-reason"
                    role="note"
                    style={{
                        margin: "4px 0 0",
                        padding: "4px 8px",
                        fontSize: "11px",
                        color: "var(--pp-text-muted)",
                        background: "var(--pp-surface-muted, #f6f6f6)",
                        border: "1px solid var(--pp-border, #e0e0e0)",
                        borderRadius: 4,
                    }}
                >
                    {blockedReason}
                </p>
            )}
            {!blockedReason && snapshot.fused.reachableFrames.length === 0 && (
                <p
                    className="pp-frame-picker__empty-reason"
                    data-testid="pp-frame-picker-empty-reason"
                    role="note"
                    style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--pp-text-muted)" }}
                >
                    No analysis frames are reachable with the current pack + dashboard. Use free text or attach more context.
                </p>
            )}
        </div>
    );
}
