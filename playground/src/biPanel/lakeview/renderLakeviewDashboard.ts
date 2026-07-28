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
    onEvent?: (event: { type: "loaded" | "error"; payload: Record<string, unknown> }) => void;
}

export interface LakeviewRenderHandle {
    coverage: CoverageReport;
    dashboard: NormalizedDashboard;
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
 *  comma-group the mantissa (M = thousand, MN = million, B = billion). */
export function formatCounterValue(value: number): string {
    const sign = value < 0 ? "-" : "";
    const v = Math.abs(value);
    if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)} B`;
    if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(2)} MN`;
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

    // One fetch per dataset actually used by a renderable widget.
    const wanted = new Set<string>();
    for (const page of dashboard.pages) {
        for (const w of page.widgets) {
            if (w.datasetName && (w.render === "chart" || w.render === "counter" || w.render === "table")) {
                wanted.add(w.datasetName);
            }
        }
    }
    const datasets = new Map<string, WidgetData | null>();
    await Promise.all([...wanted].map(async name => {
        try {
            const body = await fetchJson(fetchImpl, `${apiBase}/assistant/dashboards/databricks/${encodeURIComponent(opts.dashboardId)}/dataset`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ assistantProfile: opts.assistantProfile, datasetName: name }),
            });
            datasets.set(name, { columns: body.columns as string[], rows: body.rows as unknown[][] });
        } catch (err) {
            datasets.set(name, null);
            emit({ type: "error", payload: { scope: "dataset", datasetName: name, message: String((err as Error).message || err) } });
        }
    }));

    const needsCharts = [...wanted].length > 0
        && dashboard.pages.some(p => p.widgets.some(w => w.render === "chart" || w.render === "counter"));
    const charts = needsCharts ? await (opts.loadCharts ?? defaultLoadCharts)() : null;

    containerEl.textContent = "";
    const root = el("div", "lv-root", containerEl);
    const instances: Array<{ resize(): void; dispose(): void }> = [];

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

            const data = widget.datasetName ? datasets.get(widget.datasetName) ?? null : null;
            const option = widget.render === "chart" || widget.render === "counter"
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
                // Honest fallback: say why, never guess. Covers unsupported
                // kinds, failed datasets, and unmappable encodings alike.
                card.className = "lv-card lv-card--fallback";
                el("div", "lv-fallback-kind", body, widget.kind);
                el("div", "lv-fallback-reason", body,
                    widget.reason
                    || (data === null ? "dataset unavailable" : "encodings could not be mapped faithfully"));
            }
        }
    }

    const onResize = () => { for (const c of instances) c.resize(); };
    if (typeof window !== "undefined") window.addEventListener("resize", onResize);

    emit({
        type: "loaded",
        payload: {
            mode: "lakeview-native",
            dashboardId: opts.dashboardId,
            widgets: coverage.total,
            native: coverage.native,
            fallback: coverage.fallback,
        },
    });

    return {
        coverage,
        dashboard,
        destroy() {
            if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
            for (const c of instances) { try { c.dispose(); } catch { /* dispose is best-effort */ } }
            instances.length = 0;
            containerEl.textContent = "";
        },
    };
}
