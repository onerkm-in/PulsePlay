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
// On unmount: schedules visual.destroy() if defined; tears down the React root.
//
// What this does NOT yet do (queued for later cycles):
//   - Wire BIAdapter events into Pulse's prompt context (Cycle F: contextBuilder
//     gets a BIAdapter-events implementation alongside its DataView path)
//   - Hydrate Pulse's settings from localStorage on mount (Cycle E.4)
//   - Provide a real palette from a theme service (Cycle E.4)

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
    /** Cycle L — recent canonical BI events emitted by the active vendor
     *  adapter. PulseShell synthesises a `dataView.categorical` summary
     *  from these so Pulse's `contextBuilder.buildContext()` populates
     *  `props.context.measures` / `dimensions` / `availableFilters` /
     *  `hasSelection` — making `sendContextToGenie` actually do work.
     *  When this is undefined or empty, Pulse falls back to its current
     *  empty-context behaviour. */
    biEvents?: BIEvent[];
    /** Vendor identifier used as the queryName prefix when synthesising
     *  filter targets (e.g. `powerbi`, `tableau`). Default `bi`. */
    biVendor?: string;
    /** App-owned surface navigation can request the internal Pulse tab
     *  after returning from BI Viz in unified mode. */
    activeTabRequest?: "insights" | "chat";
}

export function PulseShell(props: PulseShellProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const visualRef = useRef<Visual | null>(null);
    const pendingDestroyRef = useRef<{ timer: number; visual: Visual } | null>(null);

    // Cycle L — derive a synthetic `categorical` block from the most recent
    // BI vendor events so Pulse's `contextBuilder.buildContext()` populates
    // dimensions / availableFilters / hasSelection. Memo so the effect-
    // dependency stays stable when events haven't changed.
    const biCategorical = useMemo(
        () => buildCategoricalFromBIEvents(props.biEvents || [], props.biVendor || "bi"),
        [props.biEvents, props.biVendor],
    );

    // Mount: construct Visual + initial update. Tear down on unmount.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // First-run seeding: writes PulsePlay-friendly defaults
        // (currently `showSetupAccess: true` so authors actually reach
        // Pulse's Setup tab without manual toggling). No-op when
        // settings already exist in localStorage.
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

        // Cycle E.4 + Cycle L — synthetic dataView carrying the persisted
        // settings bag (metadata.objects) AND the BI-derived categorical
        // block when present. Pulse's update() pipeline reads both.
        visual.update({
            viewport: viewportFromContainer(container, props.viewport),
            dataViews: [buildSyntheticDataView(biCategorical)],
        });

        // Resize observer: PBI re-emits update() on viewport changes; we
        // mirror that by calling update() ourselves when the container
        // changes size. Re-read the persisted dataView each time so any
        // settings changes (via persistProperties) get picked up on the
        // next render-tick.
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
        // which runs in a microtask AFTER PulseShell's effects on the very
        // first mount. A pure dispatch would miss the listener — the
        // symptom is "clicking Ask Pulse from BI lands on AI Insights".
        //
        // Two-pronged fix: (1) stash the desired tab on window so visual.tsx
        // can read it on mount via useState initializer (no race), and
        // (2) dispatch the event a few times across paint frames for
        // already-mounted visuals that need to switch in-place. Both arms
        // are needed: the stash handles cold-mount, the dispatch handles
        // re-renders.
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
    }, [props.activeTabRequest, props.renderToken]);

    return (
        <div
            ref={containerRef}
            className="pp-pulse-shell"
            style={{
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 600,
                overflowY: "auto",
                overflowX: "hidden",
                position: "relative",
            }}
        />
    );
}

// Cycle L — synthetic dataView builder. Merges:
//   - metadata.objects from localStorage (settings hydration)
//   - categorical (categories) derived from recent BI events
// so Pulse's update() pipeline gets a single dataView per call.
//
// Pulse's `contextBuilder.buildContext(dataView)` returns the empty summary
// when `dataView.categorical` is absent (line 76 of contextBuilder.ts), so
// adding the block here is sufficient to populate dimensions /
// availableFilters / hasSelection in `props.context.*`.
function buildSyntheticDataView(categorical: SyntheticCategorical | null): powerbi.DataView {
    const dv: powerbi.DataView = {
        metadata: { objects: buildPersistedObjectsBag().objects },
    };
    if (categorical) {
        // Cast at the boundary — our synthetic shape is a strict subset of
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
 * Returns `null` when there's nothing useful to emit — keeps the
 * settings-only update path fast for the no-BI-mounted case.
 */
export function buildCategoricalFromBIEvents(
    events: ReadonlyArray<BIEvent>,
    vendor: string,
): SyntheticCategorical | null {
    if (!events.length) return null;
    // Field name → set of values (insertion-order via Map).
    const fieldValues = new Map<string, Set<string | number>>();
    let activePage: string | null = null;
    const selectedDataPoints: Array<string | number> = [];

    // PII redaction helper — applied to any string value before it
    // enters the synthetic dataView. Numbers pass through (a fee amount
    // is not PII; a card-number-shaped digit run becomes a string at the
    // String() boundary below and gets the full pass). Defence-in-depth
    // for `sendContextToGenie` — see docs/SECURITY_ARCHITECTURE.md § 6.1.
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
