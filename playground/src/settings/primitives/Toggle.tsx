// playground/src/settings/primitives/Toggle.tsx
//
// Shared toggle switch used across sub-route pages. Wraps a native checkbox
// for a11y (keyboard, screen readers, form submission). Styling lives in
// primitives.css under .pp-toggle.

import type { ChangeEvent } from "react";

export interface ToggleProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Visible label after the track. */
    label?: string;
    /** When true, the label is rendered as the field-row label instead. */
    labelHidden?: boolean;
}

export function Toggle(props: ToggleProps): React.ReactElement {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(e.target.checked);
    };
    return (
        <label
            htmlFor={props.id}
            className="pp-toggle"
            style={{
                opacity: props.disabled ? 0.5 : 1,
                cursor: props.disabled ? "not-allowed" : "pointer",
            }}
        >
            <input
                id={props.id}
                type="checkbox"
                checked={props.checked}
                onChange={handleChange}
                disabled={props.disabled}
                className="pp-toggle__input"
            />
            <span className="pp-toggle__track" aria-hidden="true">
                <span className="pp-toggle__thumb" />
            </span>
            {props.label && !props.labelHidden && (
                <span className="pp-toggle__label">{props.label}</span>
            )}
        </label>
    );
}
