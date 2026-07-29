// playground/src/biPanel/lakeview/renderLakeviewDashboard.ts
//
// Render a Databricks AI/BI dashboard natively: fetch the spec and dataset rows
// from the proxy (which resolves SQL by dataset NAME - the browser never sends
// a statement), then draw widgets with ECharts.
//
// Framework-free on purpose: BI adapters own raw DOM per the BIAdapter
// contract, so this module must not depend on React. ECharts is injectable so
// tests run without a canvas; production lazy-loads echarts/core with only the
// chart types Lakeview widgets use.
//
// Security rule for this file: NO innerHTML, anywhere. Dashboard text and
// column values are remote content authored outside this codebase; everything
// lands in the DOM through textContent. Remote images in text widgets are
// stripped (real dashboards ship tracking pixels - see stripRemoteImages).

import {
    normalizeDashboard,
    describeCoverage,
    stripRemoteImages,
    type NormalizedDashboard,
    type NormalizedWidget,
    type CoverageReport,
    type LakeviewDashboardSpec,
} from "./dashboardSpec";
import { widgetToEChartsOption, tableColumns, type WidgetData } from "./lakeviewToECharts";
import "./lakeview.css";

export interface LakeviewChartsLib {
    init(el: HTMLElement): {
        setOption(option: Record<string, unknown>): void;
        resize(): void;
        dispose(): void;
    };
}

export interface RenderLakeviewOptions {
    dashboardId: string;
    /** Proxy profile that owns the workspace token server-side. */
    assistantProfile: string;
    /** API base, default "/api" (Vite dev-proxies to the Express proxy). */
    apiBase?: string;
    fetchImpl?: typeof fetch;
    /** Injectable charts lib; default lazy-loads echarts/core. */
    loadCharts?: () => Promise<LakeviewChartsLib>;
    /** Rows shown per table widget. Full result stays available to export. */
    tableRowCap?: number;
    /** Workspace URL — enables the toolbar's "Edit in Databricks" deep link.
     *  Authoring (move blocks, edit SQL) happens in the Databricks editor;
     *  this surface renders. */
    workspaceUrl?: string;
    onEvent?: (event: { type: "loaded" | "error"; payload: Record<string, unknown> }) => void;
}

export interface LakeviewRenderHandle {
    coverage: CoverageReport;
    dashboard: NormalizedDashboard;
    /** Resolves once every widget has been filled (or failed). The render
     *  function returns as soon as the SHELL is painted, so callers that need
     *  the finished dashboard - tests, screenshots - await this. */
    whenFilled: Promise<void>;
    destroy(): void;
}

const DEFAULT_TABLE_ROWS = 50;

// Static imports on purpose. The first attempt lazy-imported these four
// subpaths at render time, and Vite's dev-server dep optimizer hit its known
// race: a first-touch dynamic import of an unoptimized dep triggers
// re-optimization, the original request never settles, and mount() hung
// forever on "Loading databricks-aibi..." - observed headed, all API calls 200
// and the promise still pending. Static imports move the cost to module load,
// and the module itself is already lazy: the registry code-splits each vendor
// adapter, so ECharts still only loads when this vendor is actually mounted.
import * as echartsCore from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

let chartsRegistered = false;

function defaultLoadCharts(): Promise<LakeviewChartsLib> {
    if (!chartsRegistered) {
        echartsCore.use([
            BarChart, LineChart, PieChart, ScatterChart,
            GridComponent, TooltipComponent, LegendComponent,
            CanvasRenderer,
        ]);
        chartsRegistered = true;
    }
    return Promise.resolve(echartsCore as unknown as LakeviewChartsLib);
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, className: string, parent: HTMLElement, text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
}

/** Markdown-lite for text widgets: headings and paragraphs only, all via
 *  textContent. Anything fancier is not worth an HTML parser's attack surface. */
function renderTextWidget(body: HTMLElement, markdown: string): void {
    const { text } = stripRemoteImages(markdown);
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
            const level = Math.min(heading[1].length + 2, 6);
            el(`h${level}` as "h3", "lv-text-heading", body, heading[2]);
        } else {
            el("p", "lv-text-line", body, trimmed.replace(/\*\*([^*]+)\*\*/g, "$1"));
        }
    }
}

function renderCounter(body: HTMLElement, option: Record<string, unknown>): void {
    const meta = option.__pulseplayCounter as { label: string; value: number };
    el("div", "lv-counter-value", body, formatCounterValue(meta.value));
    el("div", "lv-counter-label", body, meta.label);
}

/** Counter display follows the project convention: promote the unit, never
 *  comma-group the mantissa (M = thousand, MM = million, B = billion). */
export function formatCounterValue(value: number): string {
    const sign = value < 0 ? "-" : "";
    const v = Math.abs(value);
    if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)} B`;
    if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(2)} MM`;
    if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(2)} M`;
    return `${sign}${Number.isInteger(v) ? String(v) : v.toFixed(2)}`;
}

function renderTable(body: HTMLElement, widget: NormalizedWidget, data: WidgetData, rowCap: number): void {
    const cols = tableColumns(widget, data);
    const idx = cols.map(c => data.columns.indexOf(c));
    const table = el("table", "lv-table", body);
    const thead = el("thead", "", table);
    const headRow = el("tr", "", thead);
    for (const c of cols) el("th", "", headRow, c);
    const tbody = el("tbody", "", table);
    for (const row of data.rows.slice(0, rowCap)) {
        const tr = el("tr", "", tbody);
        for (const i of idx) el("td", "", tr, String(row[i] ?? ""));
    }
    if (data.rows.length > rowCap) {
        el("div", "lv-table-more", body, `Showing ${rowCap} of ${data.rows.length} rows`);
    }
}

async function fetchJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetchImpl(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(String((body as { detail?: string; error?: string }).detail
            || (body as { error?: string }).error || `HTTP ${res.status}`));
    }
    return body as Record<string, unknown>;
}

/**
 * Fetch spec + datasets, draw every page's widgets, return a destroy handle.
 *
 * Datasets are fetched ONCE each and shared across the widgets that reference
 * them - the reference dashboard has 40 widgets over 8 datasets, so this is the
 * difference between 8 requests and 40. A widget whose dataset fails, or whose
 * encodings cannot be mapped faithfully, renders a visible fallback card rather
 * than a guess; unsupported widget kinds (forecast-line, box, pivot) say so and
 * link to the workspace.
 */
export async function renderLakeviewDashboard(
    containerEl: HTMLElement,
    opts: RenderLakeviewOptions,
): Promise<LakeviewRenderHandle> {
    const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    const apiBase = (opts.apiBase ?? "/api").replace(/\/+$/, "");
    const rowCap = opts.tableRowCap ?? DEFAULT_TABLE_ROWS;
    const emit = opts.onEvent ?? (() => { /* no listener */ });

    const specBody = await fetchJson(
        fetchImpl,
        `${apiBase}/assistant/dashboards/databricks/${encodeURIComponent(opts.dashboardId)}?assistantProfile=${encodeURIComponent(opts.assistantProfile)}`,
    );
    const dashboard = normalizeDashboard(specBody.spec as LakeviewDashboardSpec);
    const coverage = describeCoverage(dashboard);

    const needsCharts = dashboard.pages.some(p => p.widgets.some(w => w.render === "chart"));
    const charts = needsCharts ? await (opts.loadCharts ?? defaultLoadCharts)() : null;

    // ── 1. SHELL ─────────────────────────────────────────────────────────────
    // Build every card up front, before any data is fetched. The first version
    // awaited all widget queries and then drew - so one slow statement held the
    // entire dashboard blank, and with push-down each chart runs its own
    // statement, which made that far worse (~20 requests, all-or-nothing).
    // Paint the layout immediately and let each card fill itself.
    containerEl.textContent = "";
    const root = el("div", "lv-root", containerEl);
    const instances: Array<{ resize(): void; dispose(): void }> = [];

    // ── toolbar: what this is + how to change it ────────────────────────────
    // This surface RENDERS a Databricks-authored dashboard; authoring belongs
    // to the Databricks editor (facilitate, don't replicate). Without these
    // two affordances the render read as a dead end: no way to refresh, no
    // path to edit the SQL or move blocks.
    const toolbar = el("div", "lv-toolbar", root);
    const tbTitle = el("div", "lv-toolbar-title", toolbar);
    tbTitle.textContent = (specBody.displayName as string) || "Databricks dashboard";
    const tbActions = el("div", "lv-toolbar-actions", toolbar);
    const refreshBtn = el("button", "lv-toolbar-btn", tbActions, "Refresh");
    refreshBtn.setAttribute("type", "button");
    refreshBtn.setAttribute("title", "Re-run this dashboard's queries against the warehouse");
    refreshBtn.addEventListener("click", () => {
        // Full re-render: fresh spec + fresh statements. Explicit user intent,
        // same cost as first paint.
        void renderLakeviewDashboard(containerEl, opts);
    });
    if (opts.workspaceUrl) {
        const editLink = el("a", "lv-toolbar-btn lv-toolbar-btn--link", tbActions, "Edit in Databricks ↗") as HTMLAnchorElement;
        editLink.href = `${opts.workspaceUrl.replace(/\/+$/, "")}/dashboardsv3/${encodeURIComponent(opts.dashboardId)}`;
        editLink.target = "_blank";
        editLink.rel = "noreferrer noopener";
        editLink.title = "Open this dashboard in the Databricks editor — move blocks, edit SQL, add widgets. Changes show here on Refresh.";
    }

    /** Cards awaiting data, in document order - the order they fill in. */
    const pending: Array<{ widget: NormalizedWidget; card: HTMLElement; body: HTMLElement; request: Record<string, unknown> }> = [];
    /** Dataset results shared by widgets that read rows as they are. */
    const sharedData = new Map<string, WidgetData | null>();

    for (const page of dashboard.pages) {
        if (dashboard.pages.length > 1 && page.title) el("h2", "lv-page-title", root, page.title);
        const grid = el("div", "lv-grid", root);

        for (const widget of page.widgets) {
            // Filters are dashboard-interactivity we do not wire yet; hiding
            // them beats rendering dead controls that look broken.
            if (widget.render === "filter") continue;

            const card = el("div", `lv-card lv-card--${widget.render}`, grid);
            if (widget.title) el("div", "lv-card-title", card, widget.title);
            const body = el("div", "lv-card-body", card);

            if (widget.render === "text") {
                renderTextWidget(body, widget.text ?? "");
                continue;
            }
            if (widget.render === "unsupported" || !widget.datasetName) {
                renderFallback(card, body, widget, undefined);
                continue;
            }

            // Charts and counters ask for their OWN aggregated result, so the
            // proxy can derive that widget's GROUP BY from the spec. Tables read
            // the dataset rows as they are.
            const request = (widget.render === "chart" || widget.render === "counter")
                ? { datasetName: widget.datasetName, widgetName: widget.id }
                : { datasetName: widget.datasetName };
            el("div", "lv-card-pending", body, "Loading...");
            pending.push({ widget, card, body, request });
        }
    }

    const onResize = () => { for (const c of instances) c.resize(); };
    if (typeof window !== "undefined") window.addEventListener("resize", onResize);

    // ── 2. SEQUENTIAL FILL ───────────────────────────────────────────────────
    // One statement at a time, in document order. Parallel fetching hammered the
    // warehouse with ~20 concurrent statements for a single page and finished no
    // sooner, because they queue there anyway; sequential keeps the load
    // predictable and lets the reader watch the dashboard populate top-down.
    let cancelled = false;

    const fillOne = async (item: typeof pending[number]) => {
        const { widget, card, body, request } = item;
        let data: WidgetData | null = null;
        const shareKey = widget.render === "table" ? widget.datasetName : null;

        if (shareKey && sharedData.has(shareKey)) {
            data = sharedData.get(shareKey) ?? null;
        } else {
            try {
                const res = await fetchJson(fetchImpl, `${apiBase}/assistant/dashboards/databricks/${encodeURIComponent(opts.dashboardId)}/dataset`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ assistantProfile: opts.assistantProfile, ...request }),
                });
                // A chart or counter whose aggregation the server DECLINED gets
                // raw rows - and if those rows were also truncated, grouping
                // them client-side would chart a sample and present it as the
                // total. Silently wrong bars are worse than a visible gap, so
                // refuse the widget instead.
                if (res.aggregated === false && res.truncated === true
                    && (widget.render === "chart" || widget.render === "counter")) {
                    body.textContent = "";
                    renderFallback(card, body, widget, undefined, `showing this would mean charting ${res.rows ? (res.rows as unknown[]).length : 0} of ${res.totalRows} rows`);
                    return;
                }
                data = { columns: res.columns as string[], rows: res.rows as unknown[][] };
            } catch (err) {
                data = null;
                emit({ type: "error", payload: { scope: "dataset", widget: widget.id, message: String((err as Error).message || err) } });
            }
            if (shareKey) sharedData.set(shareKey, data);
        }
        if (cancelled) return;

        body.textContent = "";
        const option = (widget.render === "chart" || widget.render === "counter")
            ? widgetToEChartsOption(widget, data)
            : null;

        if (widget.render === "counter" && option) {
            renderCounter(body, option);
        } else if (widget.render === "chart" && option && charts) {
            const chart = charts.init(body);
            chart.setOption(option);
            instances.push(chart);
        } else if (widget.render === "table" && data) {
            renderTable(body, widget, data, rowCap);
        } else {
            renderFallback(card, body, widget, data);
        }
    };

    const whenFilled = (async () => {
        for (const item of pending) {
            if (cancelled) return;
            await fillOne(item);
        }
        if (!cancelled) {
            emit({ type: "loaded", payload: { mode: "lakeview-native", phase: "filled", dashboardId: opts.dashboardId } });
        }
    })();

    // The shell is up, so the host can show the dashboard now rather than after
    // the last statement returns.
    emit({
        type: "loaded",
        payload: {
            mode: "lakeview-native",
            phase: "shell",
            dashboardId: opts.dashboardId,
            widgets: coverage.total,
            native: coverage.native,
            fallback: coverage.fallback,
            pending: pending.length,
        },
    });

    return {
        coverage,
        dashboard,
        whenFilled,
        destroy() {
            cancelled = true;
            if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
            for (const c of instances) { try { c.dispose(); } catch { /* dispose is best-effort */ } }
            instances.length = 0;
            containerEl.textContent = "";
        },
    };
}

/** Honest fallback: say what could not be drawn and why, never guess. */
function renderFallback(
    card: HTMLElement,
    body: HTMLElement,
    widget: NormalizedWidget,
    data: WidgetData | null | undefined,
    reason?: string,
): void {
    card.className = "lv-card lv-card--fallback";
    body.textContent = "";
    el("div", "lv-fallback-kind", body, widget.kind);
    el("div", "lv-fallback-reason", body,
        reason
        || widget.reason
        || (data === null ? "dataset unavailable" : "encodings could not be mapped faithfully"));
}
