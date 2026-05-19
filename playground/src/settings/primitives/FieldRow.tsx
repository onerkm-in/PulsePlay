// playground/src/settings/primitives/FieldRow.tsx
//
// Consistent label + control + hint + tooltip + status layout for any form
// field across Settings. Replaces ad-hoc inline-styled rows scattered
// across the group files.

import type { ReactNode } from "react";
import { HelpTip } from "./HelpTip";
import { StatusBadge, type StatusTone } from "./StatusBadge";

/** Structured help-tip shape: short title + scannable bullets. Lets
 *  callers migrate from dense prose tooltips to the title/body format
 *  introduced in HelpTip after Codex's 09:14 UAT without changing the
 *  call shape from `tip={...}` to `tip={<HelpTip …/>}` (which would
 *  double-wrap). When a caller passes this object the FieldRow /
 *  FieldCard renders a single HelpTip with the structured slots. */
export interface StructuredTip {
    title?: string;
    body?: ReadonlyArray<string>;
}

function isStructuredTip(value: unknown): value is StructuredTip {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
        ("title" in v && (typeof v.title === "string" || v.title === undefined)) ||
        ("body" in v && Array.isArray(v.body))
    );
}

function renderTip(tip: ReactNode | StructuredTip | undefined): ReactNode {
    if (tip === undefined || tip === null || tip === false) return null;
    if (isStructuredTip(tip)) {
        return <HelpTip title={tip.title} body={tip.body} />;
    }
    return <HelpTip>{tip as ReactNode}</HelpTip>;
}

export interface FieldRowProps {
    label: string;
    /** Helper sentence shown under the control. */
    hint?: string;
    /** Rich tooltip content. Renders an info button next to the label.
     *  IMPORTANT: tooltips are ARIA-non-interactive and have
     *  pointer-events:none — do NOT put `<a>` / `<button>` / `<input>`
     *  inside `tip`. Use `labelTrailing` for actionable links instead.
     *  Pass a `StructuredTip` object (`{ title, body }`) for the post-
     *  2026-05-19 title + scannable-bullets format. */
    tip?: ReactNode | StructuredTip;
    /** Slot rendered after the label, before the tip button. Use this for
     *  small actionable links (e.g. "docs ↗") that need to stay
     *  keyboard-reachable — putting them inside `tip` would bury them
     *  in a pointer-events:none container per the 2026-05-19 Codex
     *  tooltip audit. */
    labelTrailing?: ReactNode;
    /** Inline status badge displayed after the label. */
    status?: { tone: StatusTone; label: string; detail?: string };
    /** Optional required-flag (renders a red asterisk). */
    required?: boolean;
    /** Optional error message rendered under the hint in error tone. */
    error?: string | null;
    /** Optional success message rendered under the hint in ok tone. */
    success?: string | null;
    /** id of the control for label `for`. Auto-wired via children if omitted. */
    htmlFor?: string;
    children: ReactNode;
}

export function FieldRow(props: FieldRowProps): React.ReactElement {
    return (
        <div className="pp-field">
            <div className="pp-field__head">
                <label className="pp-field__label" htmlFor={props.htmlFor}>
                    {props.label}
                    {props.required && <span className="pp-field__required" aria-label="required"> *</span>}
                </label>
                {props.labelTrailing}
                {renderTip(props.tip)}
                {props.status && (
                    <StatusBadge tone={props.status.tone} label={props.status.label} detail={props.status.detail} compact />
                )}
            </div>
            <div className="pp-field__control">{props.children}</div>
            {props.hint && <p className="pp-field__hint">{props.hint}</p>}
            {props.error && <p className="pp-field__error">⚠ {props.error}</p>}
            {props.success && <p className="pp-field__success">✓ {props.success}</p>}
        </div>
    );
}

/** Card wrapper for a logical group of fields. Use to break the page into
 *  scannable sections without resorting to deep navigation. */
export function FieldCard(props: {
    title: string;
    subtitle?: string;
    /** Step number/icon shown in a circle before the title. */
    step?: number | string;
    /** Status badge in the card header. */
    status?: { tone: StatusTone; label: string };
    /** Rich tooltip next to the title. Accepts a ReactNode (legacy) or
     *  a `StructuredTip` object for the post-2026-05-19 title + body
     *  format. */
    tip?: ReactNode | StructuredTip;
    /** Right-aligned actions in the header (e.g. Test button). */
    actions?: ReactNode;
    children: ReactNode;
}): React.ReactElement {
    return (
        <section className={`pp-card${props.status ? ` pp-card--${props.status.tone}` : ""}`}>
            <header className="pp-card__head">
                <div className="pp-card__title-row">
                    {props.step !== undefined && (
                        <span className="pp-card__step" aria-hidden="true">{props.step}</span>
                    )}
                    <div className="pp-card__title-block">
                        <h3 className="pp-card__title">
                            {props.title}
                            {renderTip(props.tip)}
                        </h3>
                        {props.subtitle && <p className="pp-card__subtitle">{props.subtitle}</p>}
                    </div>
                    {props.status && (
                        <StatusBadge tone={props.status.tone} label={props.status.label} compact />
                    )}
                </div>
                {props.actions && <div className="pp-card__actions">{props.actions}</div>}
            </header>
            <div className="pp-card__body">{props.children}</div>
        </section>
    );
}
