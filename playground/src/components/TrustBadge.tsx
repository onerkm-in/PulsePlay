// playground/src/components/TrustBadge.tsx
//
// Thread B — chat-side trust-status badge.
//
// Renders one of the four authoritative artifact statuses
// (`verified` / `grounded-draft` / `suggestion` / `blocked`) using the
// same color treatment as Workbench's `<ArtifactCard>` so the same
// signal carries across both surfaces.
//
// Per docs/UNIFIED_ASK_PULSE_WORKBENCH.md and
// feature_no_ungrounded_artifacts.md, status is emitted by the
// validator gate (artifactValidator.ts), NEVER chosen by the LLM.
// This component is presentation-only; it accepts a status and
// renders it.
//
// Styles are inlined (not class-driven) so the badge works regardless
// of which routes have which CSS bundles loaded. Workbench's
// `<ArtifactCard>` continues to use the same colors via its own
// stylesheet — see playground/src/workbench/workbench.css.

import React from 'react';
import type { ArtifactStatus } from '../types/assistant';
import { STATUS_LABEL, STATUS_TOOLTIP } from '../lib/artifactStatus';

export interface TrustBadgeProps {
    readonly status: ArtifactStatus;
    /** Optional Problem-Details detail string (only set for `blocked`). */
    readonly statusReason?: string;
    /** Optional className override on the outer wrapper. */
    readonly className?: string;
}

const STATUS_BACKGROUND: Readonly<Record<ArtifactStatus, string>> = Object.freeze({
    'verified': '#15803d',                     // green   — backed by SQL + rows
    'grounded-draft': '#b45309',               // amber   — partial citation
    'suggestion': 'var(--pp-accent, #2563eb)', // blue    — pattern-matched
    'blocked': 'var(--pp-error, #c92a2a)',     // red     — validator refused
});

const BADGE_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'white',
    whiteSpace: 'nowrap',
};

export const TrustBadge: React.FC<TrustBadgeProps> = ({ status, statusReason, className }) => {
    const label = STATUS_LABEL[status];
    const tooltip = statusReason
        ? `${STATUS_TOOLTIP[status]}\n${statusReason}`
        : STATUS_TOOLTIP[status];
    return (
        <span
            className={className}
            role="status"
            aria-label={`Answer status: ${label}`}
            title={tooltip}
            data-testid="trust-badge"
            data-status={status}
            style={{
                ...BADGE_STYLE,
                background: STATUS_BACKGROUND[status],
            }}
        >
            {label}
        </span>
    );
};
