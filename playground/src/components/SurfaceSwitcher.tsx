// playground/src/components/SurfaceSwitcher.tsx
//
// Peer segmented control for the unified shell. Replaces the original
// UnifiedSurfaceTabs (which had duplicated icon-text like "AI AI Insights"
// in screen-reader output). Driven by the surface registry so every
// surface gets the same visual + aria treatment.

import type { SurfaceIcon, SurfaceId } from "../surfaceRegistry";
import { SURFACES } from "../surfaceRegistry";

interface SurfaceSwitcherProps {
    /** Active surface id. Drives selected state + aria-selected.
     *  Caller should pass the EFFECTIVE surface (post-resolver), not the
     *  raw requested surface — that way the highlighted pill always
     *  matches what the user is actually looking at. */
    readonly active: SurfaceId;
    /** Click handler — receives the picked surface id. The shell decides
     *  whether to swap pane content, mount a companion, etc. */
    readonly onPick: (id: SurfaceId) => void;
    /** Optional per-surface availability under the current deployment
     *  configuration. F5.1 contract: `false` means the surface exists
     *  but is unreachable right now (e.g., Pulse `enabledFeatures` has
     *  it turned off). Unavailable buttons render `disabled` so the
     *  control is still visible — never removed — but cannot be picked.
     *  When omitted, all surfaces are treated as available. */
    readonly availability?: Readonly<Record<SurfaceId, boolean>>;
    /** Optional extra controls rendered to the right (e.g., companion launcher). */
    readonly trailing?: React.ReactNode;
}

export function SurfaceSwitcher({ active, onPick, availability, trailing }: SurfaceSwitcherProps): React.ReactElement {
    return (
        <div
            role="tablist"
            aria-label="PulsePlay surfaces"
            className="pp-surface-switcher"
        >
            {SURFACES.map((surface) => {
                const isActive = surface.id === active;
                const isAvailable = availability ? availability[surface.id] !== false : true;
                const tooltip = isAvailable
                    ? surface.description
                    : `${surface.label} — unavailable in this configuration. Adjust Preferences to re-enable.`;
                return (
                    <button
                        key={surface.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        // Explicit accessible name = the full label, so it stays
                        // stable whether the full or the compact visual label is
                        // shown (both visual spans are aria-hidden below).
                        aria-label={surface.label}
                        aria-controls={`pp-surface-pane-${surface.id}`}
                        aria-disabled={isAvailable ? undefined : true}
                        disabled={!isAvailable}
                        title={tooltip}
                        onClick={() => { if (isAvailable) onPick(surface.id); }}
                        className={
                            "pp-surface-switcher__item"
                            + (isActive ? " pp-surface-switcher__item--active" : "")
                            + (isAvailable ? "" : " pp-surface-switcher__item--unavailable")
                        }
                    >
                        <SurfaceGlyph icon={surface.icon} />
                        <span className="pp-surface-switcher__label" aria-hidden="true">{surface.label}</span>
                        <span className="pp-surface-switcher__label-short" aria-hidden="true">{surface.shortLabel}</span>
                    </button>
                );
            })}
            {trailing && <div className="pp-surface-switcher__trailing">{trailing}</div>}
        </div>
    );
}

/** Inline SVG glyph — visually distinct per surface, never duplicates the
 *  label text. aria-hidden so screen readers rely on the label alone. */
function SurfaceGlyph({ icon }: { icon: SurfaceIcon }): React.ReactElement {
    const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
    if (icon === "spark") {
        // Insights: a four-point sparkle suggests narrative + auto-generated.
        return (
            <svg {...common}>
                <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
            </svg>
        );
    }
    if (icon === "chat") {
        // Ask Pulse: rounded chat bubble.
        return (
            <svg {...common}>
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
        );
    }
    // BI Viz: bar chart glyph.
    return (
        <svg {...common}>
            <line x1="6" y1="20" x2="6" y2="11" />
            <line x1="12" y1="20" x2="12" y2="5" />
            <line x1="18" y1="20" x2="18" y2="14" />
        </svg>
    );
}
