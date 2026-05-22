// playground/src/settings/primitives/TestButton.tsx
//
// Async "Test connection" button. Shows a spinner while running, then
// renders the resolved status inline (ok / warn / failed) until the user
// clicks again. Wraps the test function in try/catch so a thrown promise
// always renders a graceful error chip instead of crashing the page.

import { useCallback, useState } from "react";
import { StatusBadge, type StatusTone } from "./StatusBadge";

export interface TestResult {
    tone: StatusTone;
    label: string;
    detail?: string;
}

export interface TestButtonProps {
    /** Async function returning the test result. Errors are caught and shown. */
    onTest: () => Promise<TestResult>;
    /** Trigger label. Default "Test connection". */
    label?: string;
    /** Trigger label while running. Default "Testing…". */
    busyLabel?: string;
    /** Optional disabled gate (e.g. when required fields are empty). */
    disabled?: boolean;
    /** Disabled tooltip explanation. */
    disabledHint?: string;
    /** Make the button take full width of its parent. */
    fullWidth?: boolean;
}

export function TestButton(props: TestButtonProps): React.ReactElement {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<TestResult | null>(null);

    const run = useCallback(async () => {
        setBusy(true);
        setResult(null);
        try {
            const r = await props.onTest();
            setResult(r);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setResult({ tone: "missing", label: "Test failed", detail: msg.slice(0, 140) });
        } finally {
            setBusy(false);
        }
    }, [props.onTest]);

    return (
        <span className="pp-test" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
                type="button"
                className={`pp-test__btn${props.fullWidth ? " pp-test__btn--full" : ""}`}
                onClick={() => void run()}
                disabled={props.disabled || busy}
                title={props.disabled ? props.disabledHint : undefined}
            >
                {busy ? (
                    <>
                        <span className="pp-test__spinner" aria-hidden="true" />
                        {props.busyLabel ?? "Testing…"}
                    </>
                ) : (
                    <>
                        {/* Decorative lightning glyph. Codex naming audit:
                          * U+26A1 "⚡" character was being picked up in
                          * text-content snapshots. SVG keeps the visual
                          * affordance and stays aria-hidden so the
                          * accessible name is just the label. */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
                        </svg>
                        {props.label ?? "Test connection"}
                    </>
                )}
            </button>
            {result && <StatusBadge tone={result.tone} label={result.label} detail={result.detail} compact />}
        </span>
    );
}
