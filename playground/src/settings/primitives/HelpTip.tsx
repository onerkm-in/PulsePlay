// playground/src/settings/primitives/HelpTip.tsx
//
// Inline info button with a rich tooltip. Use anywhere a setting needs more
// explanation than the helper text can carry. The tooltip is keyboard-
// accessible (focus to show) and pointer-accessible (hover to show).

import { useId, useRef, useState } from "react";

export interface HelpTipProps {
    /** Plain text content. */
    text?: string;
    /** Rich content (overrides text). */
    children?: React.ReactNode;
    /** ARIA label for the trigger button. Defaults to "More info". */
    label?: string;
    /** Tooltip width in px. Default 280. */
    width?: number;
    /** Visual variant. Default "info". */
    variant?: "info" | "tip" | "warn";
}

export function HelpTip({ text, children, label = "More info", width = 280, variant = "info" }: HelpTipProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const tipId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const glyph = variant === "warn" ? "!" : variant === "tip" ? "✨" : "i";

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
                    className="pp-helptip__bubble"
                    style={{ width }}
                >
                    {children ?? text}
                </span>
            )}
        </span>
    );
}
