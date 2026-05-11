/**
 * connectorUiHelpers — React helpers that consume the connector registry.
 *
 * Pull these into setup-form components instead of branching on `mode === "X"`
 * directly. They keep the noun ("Genie space" vs "Bedrock KB" vs ...), the
 * field activation rule, and the Test Connection control all anchored to a
 * single source of truth: connectorRegistry.ts.
 *
 * Why a separate file:
 *  - connectorRegistry.ts is .ts (no React) so it can be imported by
 *    settings.ts without dragging React into the format-pane bundle path.
 *  - This .tsx file pulls React in only where it's needed.
 */

import * as React from "react";
import { ConnectionMode } from "../settings";
import { GenieConfig } from "../genie";
import { CONNECTOR_REGISTRY, getDescriptor, HealthResult } from "./connectorRegistry";

/**
 * Return the user-facing noun for the active connector mode.
 * Use this anywhere setup-form labels/help/errors mention a "data source" —
 * never hardcode "Genie space" or any other connector-specific vocabulary.
 */
export function nounFor(mode: ConnectionMode): { single: string; plural: string } {
    return getDescriptor(mode).noun;
}

/**
 * Decide whether a setup-form field should render for the active mode.
 * If the field's STEP5_FIELDS entry declares a `scope`, the field renders
 * only for those modes. If it declares `noOp`, it renders everywhere except
 * those modes (and the form should label it as a no-op informational chip).
 */
export function isFieldActiveForMode(
    field: { scope?: ConnectionMode[]; noOp?: ConnectionMode[] },
    mode: ConnectionMode,
): boolean {
    if (field.scope && field.scope.length > 0) return field.scope.includes(mode);
    return true;
}

/** True when the field is in scope but flagged as a no-op for this mode —
 *  the form should render it greyed-out with a "no effect for X mode" hint. */
export function isFieldNoOpForMode(
    field: { scope?: ConnectionMode[]; noOp?: ConnectionMode[] },
    mode: ConnectionMode,
): boolean {
    return !!(field.noOp && field.noOp.includes(mode));
}

/** Whether the active connector supports incremental progress streaming.
 *  Setup form should hide streaming-related UI (and visual should skip the
 *  start-stream call) when this is false. */
export function supportsStreaming(mode: ConnectionMode): boolean {
    return getDescriptor(mode).streaming;
}

/** Whether the connector is fully wired vs a stub. */
export function isConnectorReady(mode: ConnectionMode): boolean {
    return getDescriptor(mode).status === "ready";
}

/**
 * Test Connection button — calls the active descriptor's health() probe
 * and renders a status pill next to the button. One implementation works
 * for every connector type because every descriptor declares its own
 * health() function.
 */
export function TestConnectionButton(props: {
    config: GenieConfig;
    /** Optional callback fired after the probe completes. Used by the form
     *  to highlight per-field errors returned in HealthResult.fieldErrors. */
    onResult?: (result: HealthResult) => void;
    /** Optional className for the wrapping span (lets the host control layout). */
    className?: string;
}): React.ReactElement {
    const [busy, setBusy] = React.useState(false);
    const [result, setResult] = React.useState<HealthResult | null>(null);
    const descriptor = getDescriptor(props.config.connectionMode);

    const onClick = React.useCallback(async () => {
        setBusy(true);
        setResult(null);
        try {
            const r = await descriptor.health(props.config);
            setResult(r);
            props.onResult?.(r);
        } catch (err: any) {
            const r: HealthResult = { ok: false, detail: err?.message || "Unexpected error" };
            setResult(r);
            props.onResult?.(r);
        } finally {
            setBusy(false);
        }
    }, [descriptor, props]);

    const pillClass = !result ? "" : (result.ok ? "gn-test-pill gn-test-pill--ok" : "gn-test-pill gn-test-pill--err");

    return (
        <span className={props.className || "gn-test-conn-row"}>
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                className="gn-btn gn-btn--ghost gn-test-conn-btn"
                title={`Probe the ${descriptor.label} backend`}
            >
                {busy ? "Testing…" : "Test connection"}
            </button>
            {result && (
                <span className={pillClass} role="status" aria-live="polite">
                    {result.ok ? "✓" : "⚠"} {result.detail}
                </span>
            )}
        </span>
    );
}

/** Returns a list of all known modes for picker components. Wraps
 *  CONNECTOR_REGISTRY for callers that don't want to import the full
 *  descriptor type. */
export function listConnectorModes(): { id: ConnectionMode; label: string; status: "ready" | "preview" | "stub"; streaming: boolean; kind: string }[] {
    return CONNECTOR_REGISTRY.map(d => ({
        id: d.id as ConnectionMode,
        label: d.label,
        status: d.status,
        streaming: d.streaming,
        kind: d.kind,
    }));
}
