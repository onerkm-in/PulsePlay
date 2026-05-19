// playground/src/settings/primitives/StatusBadge.tsx
//
// Compact status pill with colored dot + label + optional detail.
// Tones map to the shared --pp-* semantic palette in styles.css.

export type StatusTone = "ok" | "warn" | "missing" | "loading" | "neutral" | "info";

export interface StatusBadgeProps {
    tone: StatusTone;
    label: string;
    detail?: string;
    /** Smaller variant for inline use next to field labels. */
    compact?: boolean;
}

export function StatusBadge({ tone, label, detail, compact }: StatusBadgeProps): React.ReactElement {
    return (
        <span className={`pp-badge pp-badge--${tone}${compact ? " pp-badge--compact" : ""}`}>
            <span className="pp-badge__dot" aria-hidden="true" />
            <span className="pp-badge__label">{label}</span>
            {detail && <span className="pp-badge__detail">{detail}</span>}
        </span>
    );
}
