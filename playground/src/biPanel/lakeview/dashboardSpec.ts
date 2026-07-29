// playground/src/biPanel/lakeview/dashboardSpec.ts
//
// Parse a Databricks AI/BI (Lakeview) dashboard spec into a normalized widget
// model PulsePlay can render itself.
//
// Why render it ourselves rather than embed an iframe: an iframe gives no event
// bridge, so the assistant cannot know what the user is looking at - which is
// the entire point of this product. Owning the DOM means a cross-filter or a
// drill can feed the AI context. It also removes the SDK dependency, the
// embedding-domain allowlist, and the second copy of the data that caused the
// Power BI drift.
//
// The spec is fetched server-side (the workspace token never reaches the
// browser) from `/api/2.0/lakeview/dashboards/{id}`, whose `serialized_dashboard`
// is JSON of the shape:
//
//   { datasets: [{ name, displayName, queryLines: string[] }],
//     pages:    [{ name, displayName, layout: [{ widget, position }] }] }
//
// A widget carries `queries[].query.datasetName` (its data binding) and a
// `spec.encodings` grammar that is recognisably Vega-Lite-shaped: each channel
// has a `fieldName`, a `scale.type` of categorical | quantitative | temporal,
// an optional `displayName`, and optional colour `mappings`.
//
// IMPORTANT: this format is not a documented public contract. It is read
// defensively and every unknown shape degrades to `unsupported`, which the host
// renders through the iframe fallback rather than throwing or drawing something
// wrong. A dashboard that silently draws the wrong chart is worse than one that
// visibly falls back.

/** Channel names observed in real specs. `value` is the counter's single
 *  measure; `angle` is the pie's; `columns` is the table's column list. */
export type EncodingChannel = "x" | "y" | "color" | "value" | "angle" | "label" | "columns";

export interface LakeviewEncoding {
    fieldName?: string;
    displayName?: string;
    scale?: { type?: "categorical" | "quantitative" | "temporal"; mappings?: Array<{ value?: string; color?: string }> };
    /** Counter conditional colour rules, declared in the dashboard spec
     *  (style.rules on the value encoding — the same mechanism Lakeview's own
     *  UI uses). First matching rule wins. */
    style?: { rules?: Array<{ condition?: { operator?: string; operand?: { value?: string | number } }; color?: string }> };
}

export interface LakeviewWidget {
    name?: string;
    queries?: Array<{ name?: string; query?: { datasetName?: string; fields?: unknown[] } }>;
    spec?: {
        version?: number;
        widgetType?: string;
        encodings?: Partial<Record<EncodingChannel, unknown>>;
        frame?: { title?: string; showTitle?: boolean; description?: string };
    };
    /** Text widgets carry markdown here. Observed in real specs as
     *  `multilineTextboxSpec.lines`; `textbox_spec` is accepted as an older
     *  single-string variant. */
    multilineTextboxSpec?: { lines?: string[] };
    textbox_spec?: string;
}

export interface LakeviewDashboardSpec {
    datasets?: Array<{ name?: string; displayName?: string; queryLines?: string[] }>;
    pages?: Array<{ name?: string; displayName?: string; layout?: Array<{ widget?: LakeviewWidget; position?: unknown }> }>;
}

/** Everything the host needs to render one widget, vendor-neutral. */
export interface NormalizedWidget {
    id: string;
    /** Databricks widget type, verbatim. */
    kind: string;
    title: string;
    /** Dataset this widget reads, resolved to its SQL. */
    datasetName: string | null;
    sql: string | null;
    /** How the host should draw it. */
    render: "chart" | "counter" | "table" | "text" | "filter" | "unsupported";
    /** Populated for `text` widgets. */
    text?: string;
    encodings: Partial<Record<EncodingChannel, LakeviewEncoding>>;
    /** Why it cannot be rendered natively, when render === "unsupported". */
    reason?: string;
}

export interface NormalizedDashboard {
    pages: Array<{ name: string; title: string; widgets: NormalizedWidget[] }>;
    datasets: Record<string, string>;
}

/** Widget types this renderer draws natively. Anything absent falls back. */
export const NATIVE_CHART_KINDS = new Set(["bar", "line", "area", "pie", "scatter", "combo"]);
export const NATIVE_OTHER_KINDS = new Set(["counter", "table"]);
export const FILTER_KINDS_PREFIX = "filter-";

function asEncoding(v: unknown): LakeviewEncoding | undefined {
    if (!v || typeof v !== "object") return undefined;
    return v as LakeviewEncoding;
}

/** Markdown carried by a text widget, whichever variant the spec uses. */
export function widgetText(widget: LakeviewWidget): string | undefined {
    const lines = widget.multilineTextboxSpec?.lines;
    if (Array.isArray(lines)) return lines.join("\n");
    if (typeof widget.textbox_spec === "string") return widget.textbox_spec;
    return undefined;
}

/**
 * Remote images inside a dashboard's markdown.
 *
 * Real dashboards ship analytics beacons: the dbdemos sample embeds a 1x1
 * "Tracking Image" that reports DASHBOARD_VIEW to a third-party AWS endpoint on
 * every render. An iframe embed loads that silently because the vendor controls
 * the DOM. Rendering the markdown ourselves means we get to decide, so callers
 * can strip remote images and keep a dashboard view from phoning home.
 */
export function stripRemoteImages(markdown: string): { text: string; removed: string[] } {
    const removed: string[] = [];
    const text = markdown.replace(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, (_m, url: string) => {
        removed.push(url);
        return "";
    });
    return { text: text.trim(), removed };
}

function joinQueryLines(lines: string[] | undefined): string | null {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const sql = lines.join("").trim();
    return sql || null;
}

/**
 * Decide how a widget should be drawn. Deliberately conservative: a widget is
 * only "chart" when it has both a data binding and the channels a chart needs,
 * because an encoding-less chart would render as an empty box that looks like a
 * loading failure.
 */
function classify(widget: LakeviewWidget, hasSql: boolean): { render: NormalizedWidget["render"]; reason?: string } {
    const kind = widget.spec?.widgetType || "";

    // Text widgets carry no spec.widgetType at all; they hold markdown.
    if (!kind && widgetText(widget) !== undefined) return { render: "text" };
    if (!kind) return { render: "unsupported", reason: "widget has no type and no text" };

    if (kind.startsWith(FILTER_KINDS_PREFIX)) return { render: "filter" };

    if (!hasSql) return { render: "unsupported", reason: `no dataset SQL bound to "${kind}"` };

    if (kind === "counter") return { render: "counter" };
    if (kind === "table") return { render: "table" };
    if (NATIVE_CHART_KINDS.has(kind)) return { render: "chart" };

    // forecast-line needs a model we do not have; box and pivot need
    // statistical / cross-tab layouts the chart mapper does not express.
    return { render: "unsupported", reason: `widget type "${kind}" has no native renderer yet` };
}

export function normalizeDashboard(spec: LakeviewDashboardSpec | null | undefined): NormalizedDashboard {
    const datasets: Record<string, string> = {};
    for (const d of spec?.datasets || []) {
        const sql = joinQueryLines(d?.queryLines);
        if (d?.name && sql) datasets[d.name] = sql;
    }

    const pages = (spec?.pages || []).map((page, pageIdx) => {
        const widgets = (page?.layout || []).map((item, i) => {
            const widget = item?.widget || {};
            const datasetName = widget.queries?.[0]?.query?.datasetName || null;
            const sql = datasetName ? datasets[datasetName] ?? null : null;
            const { render, reason } = classify(widget, !!sql);
            const rawEnc = widget.spec?.encodings || {};
            const encodings: Partial<Record<EncodingChannel, LakeviewEncoding>> = {};
            for (const ch of ["x", "y", "color", "value", "angle", "label", "columns"] as EncodingChannel[]) {
                const e = asEncoding((rawEnc as Record<string, unknown>)[ch]);
                if (e) encodings[ch] = e;
            }
            return {
                id: widget.name || `p${pageIdx}-w${i}`,
                kind: widget.spec?.widgetType || (widget.textbox_spec ? "text" : "unknown"),
                title: widget.spec?.frame?.title || "",
                datasetName,
                sql,
                render,
                text: widgetText(widget),
                encodings,
                reason,
            } satisfies NormalizedWidget;
        });
        return { name: page?.name || `page-${pageIdx}`, title: page?.displayName || "", widgets };
    });

    return { pages, datasets };
}

export interface CoverageReport {
    total: number;
    native: number;
    fallback: number;
    byKind: Record<string, { count: number; native: boolean }>;
    unsupportedKinds: string[];
    /** Share of widgets this renderer draws itself, 0..1. */
    nativeShare: number;
}

/**
 * How much of a dashboard renders natively. Exposed so a deployment can see the
 * answer for ITS dashboards before committing to this path, rather than
 * discovering the gaps one widget at a time in front of an audience.
 */
export function describeCoverage(dashboard: NormalizedDashboard): CoverageReport {
    const byKind: Record<string, { count: number; native: boolean }> = {};
    let total = 0, native = 0;
    for (const page of dashboard.pages) {
        for (const w of page.widgets) {
            total += 1;
            const isNative = w.render !== "unsupported";
            if (isNative) native += 1;
            const entry = byKind[w.kind] || (byKind[w.kind] = { count: 0, native: isNative });
            entry.count += 1;
            entry.native = entry.native && isNative;
        }
    }
    return {
        total,
        native,
        fallback: total - native,
        byKind,
        unsupportedKinds: Object.keys(byKind).filter(k => !byKind[k].native).sort(),
        nativeShare: total === 0 ? 0 : native / total,
    };
}
