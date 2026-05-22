// playground/src/biPanel/BIAdapter.ts
//
// PulsePlay's vendor-agnostic BI panel contract.
//
// Why this exists
// ───────────────
// PulsePlay hosts ANY BI tool (Power BI, Tableau, Qlik, Looker, custom
// dashboards, …) in the playground canvas. Each vendor offers a different
// embed mechanism — iframe + URL, JS SDK + DOM container, web component,
// React component, postMessage protocol — and the playground core must
// not know or care which.
//
// `BIAdapter` is the contract every vendor implementation honors. The
// playground holds a generic `<BIPanel adapter={...} embedConfig={...} />`
// component that calls these methods; whether the adapter renders an
// iframe under the hood, a vendor SDK, or a custom canvas is invisible
// to the host.
//
// Adapters live in PulsePlay/bi-adapters/<vendor>/ and are loaded
// dynamically so a deployer who only uses Power BI doesn't ship the
// Tableau bundle.
//
// Design principles
// ─────────────────
//   • Vendor-neutral types — no PowerBI/Tableau/Qlik enums leak in here
//   • Lifecycle: mount → (events ↔ commands) → destroy
//   • Both embed mechanisms supported: "iframe" (URL-based) AND "sdk"
//     (vendor JS that paints into a container DOM element)
//   • Events use a small canonical vocabulary so the AI sidebar can
//     reason across vendors without learning each vendor's event names
//   • Adapters are responsible for translating vendor events → canonical
//     events and canonical commands → vendor commands

/**
 * Vendor-agnostic event types the AI sidebar listens to. Adapters MUST
 * map their vendor's native events to these (or omit if the vendor
 * doesn't expose the equivalent — that's fine, the adapter just won't
 * emit the event).
 */
export type BIEventType =
    | "loaded"           // The embedded view has finished initial render
    | "page-changed"     // User navigated to a different page/sheet/dashboard
    | "filter-applied"   // User applied a filter / slicer / parameter
    | "selection-made"   // User clicked a data point or selected rows
    | "data-refreshed"   // Underlying data refreshed (cache invalidate trigger)
    | "error";           // Something went wrong (vendor-specific details in payload)

export interface BIEvent {
    type: BIEventType;
    /** Adapter-specific payload. AI sidebar should treat as opaque unless
     *  it has special handling for a known vendor. */
    payload?: unknown;
}

/**
 * Vendor-agnostic commands the host can send INTO the embedded view.
 * Adapters MUST implement at least no-op handlers for any command they
 * don't support so the host can fail soft.
 */
export type BICommand =
    | { kind: "navigate-to-page"; pageId: string }
    | { kind: "apply-filter"; field: string; values: string[] | string | number | number[] }
    | { kind: "clear-filter"; field?: string }
    | { kind: "refresh" }
    | { kind: "fullscreen"; on: boolean }
    | { kind: "export"; format: "png" | "pdf" | "csv" };

/**
 * Capability discovery — adapters declare what they actually support so
 * the AI sidebar can hide features the active vendor can't deliver
 * (e.g., don't show "apply filter" UI if the loaded Tableau view didn't
 * configure parameters).
 */
export interface BICapabilities {
    canNavigatePages: boolean;
    canApplyFilters: boolean;
    canExport: boolean;
    canRefresh: boolean;
    canFullscreen: boolean;
    /** When true, the host should pass `containerEl` to mount(); when false,
     *  the adapter is iframe-based and ignores the container. */
    requiresContainerEl: boolean;
}

/** Opaque per-adapter config — each adapter declares its own shape. */
export type BIEmbedConfig = Record<string, unknown>;

/**
 * Live metadata from the BI surface — what the user is actually looking at.
 *
 * Adapters OPTIONALLY surface this via `getMetadata()`. The AISidebar
 * forwards the result to the proxy's `/assistant/discover` endpoint so the
 * Discovery Loop can compute honest reachability for BCG / RFM / variance
 * frames (which need currency measures) and Pareto / anomaly (which need
 * count/dimension splits).
 *
 * Without this signal, reachableFrames falls back to pack KPIs only —
 * which means "any frame that needs a currency measure is unreachable"
 * even if the active Power BI report obviously has $sales. With this
 * signal, the picker tells the truth about what the user can ask.
 *
 * Shape mirrors `proxy/lib/discoveryEngine.js` BIMetadata typedef so the
 * proxy can consume the payload verbatim.
 */
export interface BIMetadata {
    /** Identifier of the currently-active page / sheet / dashboard. Vendor
     *  format (PBI page name, Tableau worksheet name, Qlik sheet id, etc.). */
    activeViewId?: string | null;
    /** Numeric / aggregated measures visible on the active view. */
    visibleMeasures?: Array<{
        name: string;
        /** Coarse classification — `currency`, `percent`, `count`, `duration`. */
        kind?: "currency" | "percent" | "count" | "duration" | "ratio" | string;
        format?: string;
        aggregation?: "sum" | "avg" | "min" | "max" | "count" | "distinctcount" | string;
    }>;
    /** Categorical / time dimensions available for grouping or filtering. */
    visibleDimensions?: Array<{
        name: string;
        kind?: "categorical" | "temporal" | "geographic" | "ordinal" | string;
        /** Cardinality hint when known — `low` (< 10), `medium`, `high` (> 1000). */
        cardinalityHint?: "low" | "medium" | "high" | string;
    }>;
    /** User-applied filters / slicers on the active view. */
    activeFilters?: Array<{ field: string; value: unknown }>;
}

/**
 * The contract every vendor adapter implements.
 *
 * Lifecycle: a new instance is created per panel. Call `mount()` once
 * with the container DOM element (for SDK adapters) or just the
 * `embedConfig` (for iframe adapters — pass null for containerEl).
 * Then `on()` subscribes to events and `send()` issues commands. Call
 * `destroy()` when the panel unmounts.
 */
export interface BIAdapter {
    /** Vendor identifier — "native", "powerbi", "tableau", "qlik",
     *  "looker", "generic-iframe". Used by the registry + by the AI sidebar to
     *  pick vendor-aware behavior. */
    readonly vendor: string;
    /** Human-readable display name shown in the panel header. */
    readonly displayName: string;
    /** Capabilities advertised by this adapter for THIS embed config.
     *  Some are static (Tableau always supports fullscreen) and some are
     *  config-dependent (PBI export depends on the embed token claims).
     *  Adapters compute this in their constructor or in mount(). */
    capabilities(): BICapabilities;
    /** Render the BI view. For SDK adapters the container is required
     *  and the adapter mutates it; for iframe adapters the container
     *  may be null and the adapter creates its own iframe element
     *  inside whatever wrapper the host renders around it. */
    mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void>;
    /** Subscribe to canonical BI events. Returns an unsubscribe function. */
    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void;
    /** Issue a command to the embedded view. Returns a promise that
     *  resolves when the command has been dispatched (not necessarily
     *  when the view has visibly responded). Adapters that don't support
     *  the command return a rejected promise with an `UNSUPPORTED_*` code. */
    send(command: BICommand): Promise<void>;
    /** Tear down the embedded view, remove DOM, drop event listeners,
     *  release any vendor SDK resources. Idempotent. */
    destroy(): void;
    /**
     * OPTIONAL — return the live BI metadata (visible measures + dimensions
     * + active filters) for the currently-rendered view. The host calls
     * this from the AISidebar discovery effect to send honest reachability
     * signals to the proxy's `/assistant/discover` endpoint.
     *
     * Adapters that can't introspect the embedded view (today: iframe
     * stubs for Tableau / Qlik / Looker / generic-iframe) MUST either
     * omit this method entirely or return `null` so the host degrades
     * gracefully to "pack-KPI-only reachability". Returning a fake
     * payload would silently corrupt the reachability picker.
     *
     * Implementations should be cheap (no SDK round trips per call); cache
     * the result in the adapter and refresh it on `loaded` / `page-changed`
     * / `filter-applied` events.
     */
    getMetadata?(): Promise<BIMetadata | null>;
}

/**
 * Helper for adapters: standard error codes for unsupported commands so
 * the host can render consistent UX regardless of vendor.
 */
export const BI_ERR = {
    UNSUPPORTED_COMMAND: "BI_UNSUPPORTED_COMMAND",
    NOT_MOUNTED: "BI_NOT_MOUNTED",
    EMBED_FAILED: "BI_EMBED_FAILED",
    AUTH_FAILED: "BI_AUTH_FAILED",
} as const;
