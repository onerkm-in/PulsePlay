// React wrapper that mounts Pulse's ported `Visual` class into a PulsePlay
// panel: PulseHostStub as the IVisualHost, plus a synthetic
// VisualUpdateOptions. There is no PBI DataView; PulsePlay reads BI state
// from the active adapter. Re-calls update() on resize, renderToken, or BI
// context change, and schedules visual.destroy() on unmount.

import { useEffect, useMemo, useRef } from "react";
import { Visual } from "../pulse/visual";
import { PulseHostStub, buildPersistedObjectsBag, seedPulsePlayDefaults } from "../pulse/_adapter/PulseHostStub";
import type powerbi from "../pulse/_adapter/powerbi-visuals-api";
import type { BIEvent } from "../biPanel/BIAdapter";
import { redactPiiFromString } from "../lib/piiRedact";

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
    /** Recent canonical BI events from the active vendor adapter. PulseShell
     *  synthesises a `dataView.categorical` summary from these so Pulse's
     *  `contextBuilder.buildContext()` populates dimensions / availableFilters /
     *  hasSelection. Undefined or empty gives Pulse's empty-context behaviour. */
    biEvents?: BIEvent[];
    /** Vendor identifier used as the queryName prefix when synthesising
     *  filter targets (e.g. `powerbi`, `tableau`). Default `bi`. */
    biVendor?: string;
    /** App-owned surface navigation can request the internal Pulse tab
     *  after returning from BI Viz in unified mode.
     *  Keep this union in sync with PulseSurfaceTab in App.tsx. */
    activeTabRequest?: "insights" | "chat" | "dashboard";
}

export function PulseShell(props: PulseShellProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const visualRef = useRef<Visual | null>(null);
    const pendingDestroyRef = useRef<{ timer: number; visual: Visual } | null>(null);

    // Synthetic `categorical` block from recent BI vendor events. Memo so the
    // effect-dependency stays stable when events haven't changed.
    const biCategorical = useMemo(
        () => buildCategoricalFromBIEvents(props.biEvents || [], props.biVendor || "bi"),
        [props.biEvents, props.biVendor],
    );

    // Mount: construct Visual + initial update. Tear down on unmount.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // First-run seeding of PulsePlay-friendly defaults (e.g.
        // `showSetupAccess: true` so authors reach Pulse's Setup tab).
        // No-op when settings already exist in localStorage.
        seedPulsePlayDefaults();

        const pendingDestroy = pendingDestroyRef.current;
        const visual = pendingDestroy
            ? pendingDestroy.visual
            : new Visual({
                element: container,
                host: new PulseHostStub({
                    onApplyFilter: props.onApplyFilter,
                    onPersist: () => props.onSettingsChange?.(),
                }),
            });
        if (pendingDestroy) {
            window.clearTimeout(pendingDestroy.timer);
            pendingDestroyRef.current = null;
        }
        visualRef.current = visual;

        // The synthetic dataView carries the persisted settings bag
        // (metadata.objects) and the BI-derived categorical block when
        // present. Pulse's update() pipeline reads both.
        visual.update({
            viewport: viewportFromContainer(container, props.viewport),
            dataViews: [buildSyntheticDataView(biCategorical)],
        });

        // Mirror PBI's update()-on-viewport-change by calling update() on
        // container resize. Re-read the persisted dataView each time so
        // settings changes (via persistProperties) get picked up.
        const ro = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => {
                visual.update({
                    viewport: viewportFromContainer(container, props.viewport),
                    dataViews: [buildSyntheticDataView(biCategorical)],
                });
            })
            : null;
        ro?.observe(container);

        return () => {
            ro?.disconnect();
            const visualToDestroy = visualRef.current;
            visualRef.current = null;
            if (!visualToDestroy) return;
            // Pulse owns a nested React root. Defer its unmount until the
            // parent React commit finishes so surface switching stays quiet
            // in real-browser smoke runs. If React dev StrictMode immediately
            // remounts the effect, the next mount flushes this first.
            const timer = window.setTimeout(() => {
                try {
                    visualToDestroy.destroy?.();
                } catch (err) {
                    console.warn("[PulseShell] visual.destroy() failed:", err);
                } finally {
                    if (pendingDestroyRef.current?.visual === visualToDestroy) {
                        pendingDestroyRef.current = null;
                    }
                }
            }, 0);
            pendingDestroyRef.current = { timer, visual: visualToDestroy };
        };
        // Intentional one-shot mount: callbacks are read via closure-of-props
        // (re-renders on prop change land via the renderToken effect below).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-render on renderToken bump OR when BI context changes. Pulse's
    // internal React state picks up the new settings + dimensions from
    // the dataView we hand it.
    useEffect(() => {
        const visual = visualRef.current;
        const container = containerRef.current;
        if (!visual || !container) return;
        visual.update({
            viewport: viewportFromContainer(container, props.viewport),
            dataViews: [buildSyntheticDataView(biCategorical)],
        });
    }, [props.renderToken, props.viewport, biCategorical]);

    useEffect(() => {
        if (!props.activeTabRequest) return;
        // Pulse owns a nested React root (mounted via `new Visual({...})` in
        // the mount effect above). Its visual.tsx attaches the
        // "pulseplay:pulse-surface-tab" listener inside its own useEffect,
        // which runs in a microtask after PulseShell's effects on the very
        // first mount. A pure dispatch would therefore miss the listener; the
        // symptom is "clicking Ask Pulse from BI lands on AI Insights".
        //
        // Two-pronged fix: (1) stash the desired tab on window so visual.tsx
        // can read it on mount via a useState initializer (no race), and
        // (2) dispatch the event a few times across paint frames for
        // already-mounted visuals that need to switch in-place. Both arms
        // are needed: the stash handles the cold mount, the dispatch handles
        // a genuine surface-navigation request.
        //
        // This effect must depend on activeTabRequest alone. Previously
        // `renderToken` was also a dependency, so every settings/Adjust/
        // refresh action (which bumps renderToken to re-render the visual)
        // re-dispatched the App's requestedPulseTab over the user's current
        // tab. When requestedPulseTab was "chat" (sticky Ask Pulse), selecting
        // Adjust or clicking Refresh on AI Insights yanked the user back to
        // Ask Pulse. A re-render is not a tab change, so only assert the tab
        // when the App actually requests a different one.
        const tab = props.activeTabRequest;
        (window as unknown as { __pulseplayInitialTab?: string }).__pulseplayInitialTab = tab;
        const dispatch = () => window.dispatchEvent(new CustomEvent("pulseplay:pulse-surface-tab", {
            detail: { tab },
        }));
        dispatch();
        const t1 = window.setTimeout(dispatch, 0);
        const t2 = window.setTimeout(dispatch, 80);
        const t3 = window.setTimeout(dispatch, 240);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
        };
    }, [props.activeTabRequest]);

    return (
        <div
            ref={containerRef}
            className="pp-pulse-shell"
            style={{
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                minWidth: 0,
                // Keep this at 0: a fixed minHeight forces the shell taller
                // than mobile-landscape viewports (e.g. 667×375), pushing the
                // composer off-screen. The chat-panel flex chain keeps content
                // visible; visual.less @media rules handle height ≤ 480.
                minHeight: 0,
                // Don't declare `overflowY: auto` here. Pulse's own panes
                // (`.gn-insights-pane`, `.gn-chat-area`) manage internal
                // scroll, and an outer scroller caused a visible double
                // scrollbar. Hidden overflow-x contains rogue horizontal
                // layout from visual.tsx.
                overflow: "hidden",
                position: "relative",
            }}
        />
    );
}

// Synthetic dataView builder: merges metadata.objects from localStorage
// (settings hydration) with the categorical block derived from BI events.
// Pulse's `contextBuilder.buildContext(dataView)` returns the empty summary
// when `dataView.categorical` is absent, so adding the block here is
// sufficient to populate dimensions / availableFilters / hasSelection.
function buildSyntheticDataView(categorical: SyntheticCategorical | null): powerbi.DataView {
    const dv: powerbi.DataView = {
        metadata: { objects: buildPersistedObjectsBag().objects },
    };
    if (categorical) {
        // Cast at the boundary: our synthetic shape is a strict subset of
        // the full PBI DataViewCategorical (no values/measures, no
        // highlights). Pulse's buildContext() only reads the keys we
        // populate, so the narrower shape is safe.
        dv.categorical = categorical as unknown as powerbi.DataView["categorical"];
    }
    return dv;
}

interface SyntheticCategorical {
    categories: Array<{
        source: {
            displayName: string;
            queryName: string;
            roles?: Record<string, boolean>;
        };
        values: Array<string | number>;
    }>;
}

/**
 * Distil the last batch of `BIEvent`s into a categorical block Pulse can
 * read. We collapse all `filter-applied` events into a per-field union of
 * applied values (most recent wins on duplicate fields) and tag the
 * categories with vendor-prefixed queryNames so Pulse's filter targeting
 * is unambiguous. Pages and selections are added as informational
 * dimensions so the AI sees navigation context too.
 *
 * Returns `null` when there's nothing useful to emit, which keeps the
 * settings-only update path fast for the no-BI-mounted case.
 */
export function buildCategoricalFromBIEvents(
    events: ReadonlyArray<BIEvent>,
    vendor: string,
): SyntheticCategorical | null {
    if (!events.length) return null;
    // Map of field name to its set of values (insertion-order via Map).
    const fieldValues = new Map<string, Set<string | number>>();
    let activePage: string | null = null;
    const selectedDataPoints: Array<string | number> = [];

    // PII redaction helper, applied to any string value before it enters
    // the synthetic dataView. Numbers pass through (a fee amount is not
    // PII; a card-number-shaped digit run becomes a string at the String()
    // boundary below and gets the full pass). This is defence-in-depth for
    // `sendContextToGenie`; see docs/SECURITY_ARCHITECTURE.md section 6.1.
    const scrub = (v: string | number): string | number => {
        if (typeof v === "number") return v;
        const r = redactPiiFromString(v);
        return r.value;
    };

    for (const ev of events) {
        if (ev.type === "filter-applied") {
            const payload = ev.payload as { filters?: Array<{ target?: { column?: string; table?: string }; values?: unknown }> };
            const filters = payload?.filters || [];
            for (const f of filters) {
                const column = String(f?.target?.column || "").trim();
                if (!column) continue;
                const raw = Array.isArray(f.values) ? f.values : (f.values != null ? [f.values] : []);
                const valueSet = fieldValues.get(column) ?? new Set<string | number>();
                for (const v of raw) {
                    if (v == null) continue;
                    if (typeof v === "string" || typeof v === "number") valueSet.add(scrub(v));
                    else valueSet.add(scrub(String(v)));
                }
                fieldValues.set(column, valueSet);
            }
        } else if (ev.type === "page-changed") {
            const payload = ev.payload as { pageName?: string; pageId?: string };
            const candidate = payload?.pageName || payload?.pageId || null;
            if (candidate) activePage = redactPiiFromString(candidate).value;
        } else if (ev.type === "selection-made") {
            const payload = ev.payload as { dataPoints?: Array<{ values?: unknown[] }> };
            const points = payload?.dataPoints || [];
            for (const p of points) {
                for (const v of p.values || []) {
                    if (v == null) continue;
                    if (typeof v === "string" || typeof v === "number") selectedDataPoints.push(scrub(v));
                }
            }
        }
    }

    if (fieldValues.size === 0 && !activePage && selectedDataPoints.length === 0) return null;

    const categories: SyntheticCategorical["categories"] = [];
    for (const [column, valueSet] of fieldValues.entries()) {
        categories.push({
            source: {
                displayName: column,
                queryName: `${vendor}.${column}`,
            },
            values: [...valueSet],
        });
    }
    if (activePage) {
        categories.push({
            source: { displayName: "Active Page", queryName: `${vendor}.__page` },
            values: [activePage],
        });
    }
    if (selectedDataPoints.length > 0) {
        categories.push({
            source: { displayName: "Selection", queryName: `${vendor}.__selection` },
            values: [...new Set(selectedDataPoints)],
        });
    }
    return { categories };
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
