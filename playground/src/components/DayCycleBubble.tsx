// playground/src/components/DayCycleBubble.tsx
//
// Always-on day-cycle bubble. A circular "sky" bubble that continuously
// cycles morning → noon → evening → night → morning, with the sun (☀️)
// during the daylight phases and the moon (🌙) at night. The `loading`
// flag now only intensifies the bubble (adds a soft glow ring) — it no
// longer gates the animation, because the user wants the cycle visible
// at all times. All motion stays inside the bubble's circular boundary.
//
// Design notes:
//   - Size flexes with the viewport via `clamp(48px, 6vmin, 88px)` so
//     the bubble shrinks on small screens and grows on large ones — no
//     fixed-pixel sizing.
//   - The celestial emoji is absolutely centered inside the bubble
//     (transform-based) so glyph metrics from any system font can't
//     drift it off-axis.
//   - The sky gradient cross-fades via CSS keyframes on the background.
//   - Respects `prefers-reduced-motion`: a user who opts out gets a
//     static "noon" bubble with the sun centered, no cycling.
//   - Pure presentational — no proxy, no state outside this file.
//
// The four phases (each 4 s of a 16 s loop):
//   0 – 25 %   morning  pale peach → soft blue, sun
//   25 – 50 %  noon     bright cyan/blue, sun
//   50 – 75 %  evening  amber → magenta, sun
//   75 – 100 % night    deep indigo → black, moon

import { useEffect, useState, type ReactElement } from "react";

/** Total length of one morning → night → morning cycle, in ms. Kept
 *  brisk (4 s) so the cycle is visible even on short loads. */
const CYCLE_MS = 4_000;

/** Which celestial body to show in the bubble. We toggle to the moon for
 *  the night quarter; everything else uses the sun. */
type Phase = "morning" | "noon" | "evening" | "night";

function phaseAt(elapsedMs: number): Phase {
    const t = (elapsedMs % CYCLE_MS) / CYCLE_MS; // 0..1
    if (t < 0.25) return "morning";
    if (t < 0.5)  return "noon";
    if (t < 0.75) return "evening";
    return "night";
}

const MORNING_GRADIENT = "linear-gradient(180deg, #ffd5a8 0%, #b8d8f0 100%)";

const KEYFRAMES = `
@keyframes pp-daycycle-sky {
    0%   { background: linear-gradient(180deg, #ffd5a8 0%, #b8d8f0 100%); }   /* morning */
    25%  { background: linear-gradient(180deg, #7ec8e3 0%, #4aa5d9 100%); }   /* noon    */
    50%  { background: linear-gradient(180deg, #ffb56b 0%, #c764a4 100%); }   /* evening */
    75%  { background: linear-gradient(180deg, #1a1e4a 0%, #0a0e2a 100%); }   /* night   */
    100% { background: linear-gradient(180deg, #ffd5a8 0%, #b8d8f0 100%); }   /* morning */
}
@keyframes pp-daycycle-glyph {
    /* Sun visible for 0–75 % of the loop, then quickly swaps for the
     * moon at the night quarter. We just fade the glyph in/out around the
     * transition — the React state switches the actual character. */
    0%, 70%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    72%       { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
    78%       { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
    80%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
`;

function injectKeyframesOnce(): void {
    if (typeof document === "undefined") return;
    const id = "pp-daycycle-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
}

export interface DayCycleBubbleProps {
    /** True while data is loading — the bubble cycles. False holds the
     *  bubble at morning with the sun centered. */
    loading: boolean;
    /** Optional ARIA label override. Defaults are context-aware. */
    ariaLabel?: string;
    /** Optional inline style overrides applied to the outer container. */
    style?: React.CSSProperties;
}

export function DayCycleBubble(props: DayCycleBubbleProps): ReactElement {
    injectKeyframesOnce();

    // Detect reduced-motion preference once on mount; if set, we render a
    // static noon bubble with the sun and skip the cycle entirely.
    const [reducedMotion] = useState<boolean>(() => {
        if (typeof window === "undefined" || !window.matchMedia) return false;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });

    // Track the current phase. Cycles continuously while motion is
    // allowed; holds at morning if the user has prefers-reduced-motion.
    const [phase, setPhase] = useState<Phase>("morning");
    useEffect(() => {
        if (reducedMotion) {
            setPhase("morning");
            return;
        }
        const start = Date.now();
        setPhase(phaseAt(0));
        const handle = window.setInterval(() => {
            setPhase(phaseAt(Date.now() - start));
        }, 80);
        return () => window.clearInterval(handle);
    }, [reducedMotion]);

    const glyph = phase === "night" ? "🌙" : "☀️";

    // Responsive size — clamp() ensures the bubble shrinks gracefully on
    // small screens (down to 48 px) and grows on large monitors (up to
    // 88 px) without ever needing a media query.
    const size = "clamp(48px, 6vmin, 88px)";

    const cycling = !reducedMotion;

    // When `loading` is true we add an outer pulsing glow ring so the
    // bubble visibly "reacts" to in-flight work without disturbing the
    // sky cycle itself.
    const loadingGlow = props.loading && !reducedMotion
        ? "0 0 0 3px rgba(59, 130, 246, 0.35), 0 0 18px 4px rgba(59, 130, 246, 0.45), "
        : "";

    return (
        <div
            className="pp-daycycle"
            data-testid="pp-daycycle"
            data-phase={phase}
            data-loading={props.loading ? "true" : "false"}
            role="img"
            aria-label={props.ariaLabel ?? (props.loading ? "Loading — day cycle in progress" : "Day cycle")}
            style={{
                position:           "fixed",
                bottom:             "clamp(12px, 2vmin, 24px)",
                right:              "clamp(12px, 2vmin, 24px)",
                width:              size,
                height:             size,
                borderRadius:       "50%",
                overflow:           "hidden",
                boxShadow:          `${loadingGlow}0 4px 16px rgba(15, 23, 42, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.25)`,
                pointerEvents:      "none",
                zIndex:             40,
                // When motion is disabled, hold a static morning gradient.
                background:         cycling ? undefined : MORNING_GRADIENT,
                animation:          cycling
                    ? `pp-daycycle-sky ${CYCLE_MS}ms linear infinite`
                    : undefined,
                transition:         "box-shadow 300ms ease-out, background 400ms ease-out",
                ...props.style,
            }}
        >
            {/* Sun / moon — absolutely centered so its position is
                independent of the system font's glyph metrics. */}
            <span
                aria-hidden="true"
                data-testid="pp-daycycle-glyph"
                style={{
                    position:       "absolute",
                    top:            "50%",
                    left:           "50%",
                    transform:      "translate(-50%, -50%)",
                    fontSize:       "clamp(22px, 3vmin, 40px)",
                    lineHeight:     1,
                    // Soft glow so the emoji reads against every phase
                    // (morning peach, noon blue, evening magenta, night indigo).
                    textShadow:     "0 0 12px rgba(255, 255, 255, 0.55)",
                    filter:         "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                    animation:      cycling
                        ? `pp-daycycle-glyph ${CYCLE_MS}ms linear infinite`
                        : undefined,
                    // Disable subpixel anti-aliasing artifacts on the
                    // emoji during the scale transform.
                    backfaceVisibility: "hidden",
                }}
            >
                {glyph}
            </span>
        </div>
    );
}
