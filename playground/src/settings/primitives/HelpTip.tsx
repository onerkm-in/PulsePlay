// playground/src/settings/primitives/HelpTip.tsx
//
// Inline info button with a rich tooltip. Use anywhere a setting needs more
// explanation than the helper text can carry. The tooltip is keyboard-
// accessible (focus to show) and pointer-accessible (hover to show).
//
// 2026-05-19 Codex audits + fixes:
//   - P1 clipping at narrow viewport: bubble could render offscreen at
//     the left/top of a card. Fix: viewport-aware position measurement.
//   - P1 interactive link inside `role="tooltip"`: tooltips are non-
//     interactive (pointer-events:none). Use FieldRow.labelTrailing for
//     actionable links instead.
//   - P2 multiple open tooltips: opening one closes any other.
//   - P1 edge tooltips going UNDER pane frames / clipped by scroll
//     containers: bubble now renders via createPortal into document.body
//     using FIXED positioning + viewport-coordinate math. This fixes the
//     stacking-context / overflow:hidden ancestor problem at root rather
//     than relying on z-index alone.
//   - P2 dense paragraph content: structured `title` + `body` slots
//     (still backwards-compatible with `text` / `children`).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface HelpTipProps {
    /** Plain text content (single paragraph). */
    text?: string;
    /** Rich content. MUST NOT contain interactive controls (buttons,
     *  links, inputs). Use FieldRow.labelTrailing for actionable links. */
    children?: React.ReactNode;
    /** Optional short title rendered at the top of the bubble. When
     *  provided, content (`text` / `children` / `body`) renders below. */
    title?: string;
    /** Optional structured body — array of short lines/bullets. Renders
     *  as a tight unordered list inside the bubble. */
    body?: ReadonlyArray<string>;
    /** ARIA label for the trigger button. Defaults to "More info". */
    label?: string;
    /** Tooltip max-width in px. Default 280. */
    width?: number;
    /** Visual variant. Default "info". */
    variant?: "info" | "tip" | "warn";
}

interface PortalPosition {
    /** Fixed-positioning top coordinate (viewport-relative). */
    top: number;
    /** Fixed-positioning left coordinate. */
    left: number;
    /** Bubble width after clamping. */
    width: number;
    /** Which side of the trigger the bubble sits on (affects arrow). */
    side: "above" | "below";
    /** Arrow horizontal offset from bubble's left edge. */
    arrowLeft: number;
}

const VIEWPORT_MARGIN = 12;

// Module-level mutual-exclusion tracker. Opening one HelpTip closes any
// other open tip. Also subscribes to document pointerdown so any click
// outside an open trigger closes the open tip.
const _activeClosers = new Set<() => void>();

function _closeAllExcept(exempt: () => void): void {
    for (const closer of Array.from(_activeClosers)) {
        if (closer !== exempt) closer();
    }
}

if (typeof window !== "undefined") {
    let installed = false;
    const install = () => {
        if (installed) return;
        installed = true;
        document.addEventListener("pointerdown", () => {
            for (const closer of Array.from(_activeClosers)) closer();
        });
    };
    Promise.resolve().then(install);
}

/** Measure the trigger relative to the viewport and produce fixed
 *  coordinates the portal-rendered bubble will use. Picks above/below
 *  based on headroom; clamps the bubble's horizontal extents inside the
 *  viewport so the arrow can offset against the trigger center. */
function computePortalPosition(triggerEl: HTMLElement, requestedWidth: number, bubbleHeightGuess = 80): PortalPosition {
    const rect = triggerEl.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    const maxWidth = Math.max(160, vw - VIEWPORT_MARGIN * 2);
    const width = Math.min(requestedWidth, maxWidth);

    // Prefer above; flip below when no headroom.
    const roomAbove = rect.top;
    const side: PortalPosition["side"] =
        roomAbove < bubbleHeightGuess + VIEWPORT_MARGIN ? "below" : "above";

    const top = side === "above"
        ? rect.top - bubbleHeightGuess - 8
        : rect.bottom + 8;

    // Horizontal: center bubble on trigger, then clamp.
    const triggerCenter = rect.left + rect.width / 2;
    const desiredLeft = triggerCenter - width / 2;
    const clampedLeft = Math.min(
        Math.max(VIEWPORT_MARGIN, desiredLeft),
        Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN),
    );

    // Arrow stays at trigger center, expressed relative to bubble left.
    const arrowLeft = Math.min(
        Math.max(8, triggerCenter - clampedLeft),
        width - 8,
    );

    return { top, left: clampedLeft, width, side, arrowLeft };
}

export function HelpTip({ text, children, title, body, label = "More info", width = 280, variant = "info" }: HelpTipProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<PortalPosition | null>(null);
    const tipId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const bubbleRef = useRef<HTMLDivElement | null>(null);

    const glyph = variant === "warn" ? "!" : variant === "tip" ? "✨" : "i";

    const close = useCallback(() => setOpen(false), []);

    const handleOpen = useCallback(() => {
        _closeAllExcept(close);
        setOpen(true);
    }, [close]);

    useEffect(() => {
        if (!open) return;
        _activeClosers.add(close);
        return () => { _activeClosers.delete(close); };
    }, [open, close]);

    // Position once on open (layout effect avoids visible jump), then
    // re-measure after the bubble mounts so we use the actual rendered
    // height instead of the 80-px guess.
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) {
            setPosition(null);
            return;
        }
        setPosition(computePortalPosition(triggerRef.current, width));
    }, [open, width]);

    useLayoutEffect(() => {
        if (!open || !triggerRef.current || !bubbleRef.current) return;
        const measured = bubbleRef.current.getBoundingClientRect().height;
        setPosition(computePortalPosition(triggerRef.current, width, measured));
    }, [open, width, title, body, text, children]);

    // Re-measure on scroll + resize while open so the bubble stays
    // anchored to the trigger.
    useEffect(() => {
        if (!open) return;
        const onChange = () => {
            if (!triggerRef.current) return;
            const measured = bubbleRef.current?.getBoundingClientRect().height ?? 80;
            setPosition(computePortalPosition(triggerRef.current, width, measured));
        };
        window.addEventListener("resize", onChange);
        window.addEventListener("scroll", onChange, true); // capture: catch ancestor scrolls
        return () => {
            window.removeEventListener("resize", onChange);
            window.removeEventListener("scroll", onChange, true);
        };
    }, [open, width]);

    const renderBubble = () => {
        if (!open || !position) return null;
        const bubble = (
            <div
                ref={bubbleRef}
                id={tipId}
                role="tooltip"
                className={`pp-helptip__bubble pp-helptip__bubble--portal pp-helptip__bubble--side-${position.side}`}
                style={{
                    position: "fixed",
                    top: position.top,
                    left: position.left,
                    width: position.width,
                    maxWidth: position.width,
                    // High z-index — but this is belt-and-braces; the real
                    // fix is rendering through createPortal into <body> so
                    // we escape every parent's overflow:hidden / stacking
                    // context.
                    zIndex: 10000,
                    // Expose arrow offset to CSS so the ::after triangle
                    // can anchor at the trigger center regardless of the
                    // bubble's clamped left position.
                    ['--pp-helptip-arrow-x' as string]: `${position.arrowLeft}px`,
                }}
            >
                {title && <div className="pp-helptip__title">{title}</div>}
                {body && body.length > 0 && (
                    <ul className="pp-helptip__list">
                        {body.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                )}
                {(text || children) && (
                    <div className="pp-helptip__body">{children ?? text}</div>
                )}
            </div>
        );
        // Portal-render into document.body so the bubble can never be
        // clipped by an ancestor's overflow:hidden or limited by a
        // shorter parent stacking context.
        return typeof document !== "undefined"
            ? createPortal(bubble, document.body)
            : null;
    };

    return (
        <span className="pp-helptip" style={{ position: "relative", display: "inline-flex" }}>
            <button
                ref={triggerRef}
                type="button"
                className={`pp-helptip__trigger pp-helptip__trigger--${variant}`}
                aria-label={label}
                aria-describedby={open ? tipId : undefined}
                aria-expanded={open}
                onMouseEnter={handleOpen}
                onMouseLeave={() => setOpen(false)}
                onFocus={handleOpen}
                onBlur={() => setOpen(false)}
                onPointerDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => {
                    e.preventDefault();
                    setOpen((o) => {
                        const next = !o;
                        if (next) _closeAllExcept(close);
                        return next;
                    });
                }}
            >
                {glyph}
            </button>
            {renderBubble()}
        </span>
    );
}
