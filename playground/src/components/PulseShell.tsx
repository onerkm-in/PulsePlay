// playground/src/components/PulseShell.tsx
//
// React wrapper that mounts Pulse's ported `Visual` class into a
// PulsePlay panel. This is the runtime side of Cycle E — it ties:
//
//   - Pulse's Visual class (which expects an IVisualHost + DataView)
//   - PulseHostStub (PulsePlay-shaped host implementation)
//   - A synthetic VisualUpdateOptions (no DataView — PulsePlay reads
//     BI state from the active adapter, not from a PBI DataView)
//
// On mount, this component:
//   1. Creates a container div
//   2. Constructs `new Visual({ element, host: PulseHostStub })`
//   3. Calls visual.update({ viewport, dataViews: [] }) to render
//   4. Re-calls update() when container resizes or settings re-render is requested
//
// On unmount: calls visual.destroy() if defined; tears down the React root.
//
// What this does NOT yet do (queued for later cycles):
//   - Wire BIAdapter events into Pulse's prompt context (Cycle F: contextBuilder
//     gets a BIAdapter-events implementation alongside its DataView path)
//   - Hydrate Pulse's settings from localStorage on mount (Cycle E.4)
//   - Provide a real palette from a theme service (Cycle E.4)

import { useEffect, useRef } from "react";
import { Visual } from "../pulse/visual";
import { PulseHostStub } from "../pulse/_adapter/PulseHostStub";
import type powerbi from "../pulse/_adapter/powerbi-visuals-api";

export interface PulseShellProps {
    /** Optional override of the container width/height in pixels. Defaults
     *  to whatever the wrapper div's `getBoundingClientRect()` reports
     *  on mount; resizes trigger a fresh `update()` call. */
    viewport?: { width: number; height: number };
    /** When the host wants to nudge Pulse to re-render (e.g. after a
     *  settings save), increment this. Each new value triggers a fresh
     *  `update()` call. */
    renderToken?: number;
    /** Optional callback when Pulse applies a filter via the BI host
     *  filter API. Connect this to the active BIAdapter.send() to make
     *  the filter actually reach the embedded BI tool. */
    onApplyFilter?: (
        filter: powerbi.IFilter | powerbi.IFilter[] | null,
        action: powerbi.FilterAction,
    ) => void;
    /** Optional callback when Pulse persists a settings change. Useful
     *  for surfacing "Settings saved" toasts in the surrounding shell. */
    onSettingsChange?: () => void;
}

export function PulseShell(props: PulseShellProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const visualRef = useRef<Visual | null>(null);

    // Mount: construct Visual + initial update. Tear down on unmount.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const host = new PulseHostStub({
            onApplyFilter: props.onApplyFilter,
            onPersist: () => props.onSettingsChange?.(),
        });

        // The Visual constructor calls createRoot(container) internally —
        // we just hand it our container.
        const visual = new Visual({ element: container, host });
        visualRef.current = visual;

        // First render. Empty dataViews is intentional: PulsePlay isn't a
        // PBI custom visual so there's no DataView. Pulse's update() path
        // handles the no-dataView case by falling back to default settings.
        visual.update({
            viewport: viewportFromContainer(container, props.viewport),
            dataViews: [],
        });

        // Resize observer: PBI re-emits update() on viewport changes; we
        // mirror that by calling update() ourselves when the container
        // changes size.
        const ro = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => {
                visual.update({
                    viewport: viewportFromContainer(container, props.viewport),
                    dataViews: [],
                });
            })
            : null;
        ro?.observe(container);

        return () => {
            ro?.disconnect();
            try {
                visual.destroy?.();
            } catch (err) {
                console.warn("[PulseShell] visual.destroy() failed:", err);
            }
            visualRef.current = null;
        };
        // Intentional one-shot mount: callbacks are read via closure-of-props
        // (re-renders on prop change land via the renderToken effect below).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-render on renderToken bump (e.g., after a settings save). We
    // re-invoke update() with the same shape; Pulse's internal React
    // state picks up the new settings from the formattingSettingsService
    // (Cycle E.4 will wire that to localStorage).
    useEffect(() => {
        const visual = visualRef.current;
        const container = containerRef.current;
        if (!visual || !container) return;
        visual.update({
            viewport: viewportFromContainer(container, props.viewport),
            dataViews: [],
        });
    }, [props.renderToken, props.viewport]);

    return (
        <div
            ref={containerRef}
            className="pp-pulse-shell"
            style={{
                width: "100%",
                height: "100%",
                minHeight: 600,
                overflow: "auto",
                position: "relative",
            }}
        />
    );
}

function viewportFromContainer(
    el: HTMLElement,
    override?: { width: number; height: number },
): { width: number; height: number } {
    if (override) return override;
    const rect = el.getBoundingClientRect();
    return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
    };
}
