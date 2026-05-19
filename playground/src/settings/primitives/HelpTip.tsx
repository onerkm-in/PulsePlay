// playground/src/settings/primitives/HelpTip.tsx
//
// Inline info button with a rich tooltip. Use anywhere a setting needs more
// explanation than the helper text can carry. The tooltip is keyboard-
// accessible (focus to show) and pointer-accessible (hover to show).
//
// 2026-05-19 Codex tooltip audit findings + fixes:
//   - P1 clipping at narrow viewport (599×694): bubble could render
//     offscreen at the left/top of a card. Fix: viewport-aware position
//     measurement after open; flips to right or below if clipped, and
//     clamps inline-size by the available room so the bubble can never
//     exceed the viewport width.
//   - P1 interactive link inside `role="tooltip"`: tooltips with
//     `pointer-events: none` are not reliable click targets, and ARIA
//     tooltips should not contain interactive controls. Authors who need
//     a docs link should render it adjacent to the field; this primitive
//     remains for non-interactive guidance only.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface HelpTipProps {
    /** Plain text content. */
    text?: string;
    /** Rich content (overrides text). MUST NOT contain interactive
     *  controls (buttons, links, inputs). ARIA tooltip pattern requires
     *  the tooltip be non-interactive; tooltips with pointer-events:none
     *  also can't reliably accept clicks. Author guidance: put any link
     *  adjacent to the field, not inside the tooltip. */
    children?: React.ReactNode;
    /** ARIA label for the trigger button. Defaults to "More info". */
    label?: string;
    /** Tooltip max-width in px. Default 280. Bubble may render narrower
     *  when the viewport is compact — clamp logic shrinks it to fit. */
    width?: number;
    /** Visual variant. Default "info". */
    variant?: "info" | "tip" | "warn";
}

interface BubblePosition {
    /** Horizontal placement relative to trigger: "left" anchors left edge,
     *  "right" anchors right edge — picked based on which side has more
     *  room in the viewport. */
    align: "left" | "right" | "center";
    /** Vertical placement relative to trigger: "above" (default) or
     *  "below" when there's no room above. */
    side: "above" | "below";
    /** Actual bubble width after clamping to the available viewport room. */
    width: number;
}

const VIEWPORT_MARGIN = 12;

function computeBubblePosition(triggerEl: HTMLElement, requestedWidth: number): BubblePosition {
    if (typeof window === "undefined") return { align: "center", side: "above", width: requestedWidth };
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Clamp width to available room (viewport minus 2× margin). Never grow
    // beyond the caller's requested width; can shrink as small as 160px so
    // even narrow surfaces still show readable copy.
    const maxWidth = Math.max(160, vw - VIEWPORT_MARGIN * 2);
    const width = Math.min(requestedWidth, maxWidth);

    // Pick horizontal alignment based on which side of the trigger has more
    // room. Centered (anchored at trigger midpoint) is preferred; falls
    // back to left/right anchoring when centered would clip.
    const triggerCenter = rect.left + rect.width / 2;
    const halfWidth = width / 2;
    let align: BubblePosition["align"];
    if (triggerCenter - halfWidth < VIEWPORT_MARGIN) {
        // Would clip on the left — anchor bubble at trigger's left edge.
        align = "left";
    } else if (triggerCenter + halfWidth > vw - VIEWPORT_MARGIN) {
        // Would clip on the right — anchor bubble at trigger's right edge.
        align = "right";
    } else {
        align = "center";
    }

    // Side: prefer "above" but flip to "below" when there's not enough
    // headroom (e.g., a tooltip at the very top of the viewport).
    const heightGuess = 100; // tooltip content is usually 1-3 lines + padding
    const side: BubblePosition["side"] =
        rect.top - heightGuess - VIEWPORT_MARGIN < 0 && rect.bottom + heightGuess + VIEWPORT_MARGIN < vh
            ? "below"
            : "above";

    return { align, side, width };
}

export function HelpTip({ text, children, label = "More info", width = 280, variant = "info" }: HelpTipProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<BubblePosition>({ align: "center", side: "above", width });
    const tipId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const glyph = variant === "warn" ? "!" : variant === "tip" ? "✨" : "i";

    // Recompute position when the bubble opens. Layout effect so the
    // initial render uses the measured values — no visible jump.
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        setPosition(computeBubblePosition(triggerRef.current, width));
    }, [open, width]);

    // Recompute on window resize while open so the bubble doesn't drift
    // offscreen during a viewport change.
    useEffect(() => {
        if (!open) return;
        const onResize = () => {
            if (triggerRef.current) setPosition(computeBubblePosition(triggerRef.current, width));
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [open, width]);

    return (
        <span className="pp-helptip" style={{ position: "relative", display: "inline-flex" }}>
            <button
                ref={triggerRef}
                type="button"
                className={`pp-helptip__trigger pp-helptip__trigger--${variant}`}
                aria-label={label}
                aria-describedby={open ? tipId : undefined}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
            >
                {glyph}
            </button>
            {open && (
                <span
                    id={tipId}
                    role="tooltip"
                    className={`pp-helptip__bubble pp-helptip__bubble--align-${position.align} pp-helptip__bubble--side-${position.side}`}
                    style={{ width: position.width, maxWidth: position.width }}
                >
                    {children ?? text}
                </span>
            )}
        </span>
    );
}
