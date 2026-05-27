export interface MetricViewSummary {
    id: string;
    title: string;
    fullName: string;
    catalog?: string;
    schema?: string;
    comment?: string;
}

export interface MetricViewsPayload {
    ok?: boolean;
    count?: number;
    items?: MetricViewSummary[];
    error?: string;
}

export async function listMetricViews(args: {
    assistantProfile?: string;
    catalog: string;
    schema: string;
}): Promise<MetricViewsPayload> {
    const params = new URLSearchParams({
        catalog: args.catalog,
        schema: args.schema,
    });
    if (args.assistantProfile) params.set("assistantProfile", args.assistantProfile);
    const res = await fetch(`/api/assistant/uc/metric-views?${params.toString()}`);
    const data = await res.json().catch(() => ({})) as MetricViewsPayload;
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

/** Fetch ONE metric view's full schema. Used to extract the underlying
 *  measure names — listMetricViews only returns view titles, which are
 *  often technical (vw_metric_*_flat) and don't carry semantic content
 *  the metric-direction heuristic can match. */
export async function fetchMetricViewDetail(args: {
    assistantProfile?: string;
    fullName: string;
}): Promise<{ ok?: boolean; item?: unknown; error?: string }> {
    const params = new URLSearchParams();
    if (args.assistantProfile) params.set("assistantProfile", args.assistantProfile);
    const url = `/api/assistant/uc/metric-views/${encodeURIComponent(args.fullName)}?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({})) as { ok?: boolean; item?: unknown; error?: string };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

/** Extract the MEASURE column names from a metric-view detail payload.
 *  Each column's `type_json` is a stringified JSON object whose
 *  `metadata['metric_view.type']` field is either "measure" or
 *  "dimension". Pure transform — no I/O. */
export function extractMeasureNamesFromMetricView(detail: { item?: unknown }): string[] {
    type RawColumn = { name?: string; type_json?: string };
    type RawItem = { raw?: { columns?: RawColumn[] } };
    const item = detail.item as RawItem | undefined;
    const cols = item?.raw?.columns ?? [];
    const out: string[] = [];
    for (const c of cols) {
        try {
            const parsed = JSON.parse(c.type_json || "{}") as { metadata?: { "metric_view.type"?: string } };
            const viewType = parsed?.metadata?.["metric_view.type"];
            if (viewType === "measure" && typeof c.name === "string" && c.name.trim().length > 0) {
                out.push(c.name);
            }
        } catch {
            // bad type_json — skip this column
        }
    }
    return out;
}

export interface VectorSearchResponse {
    ok?: boolean;
    indexName?: string;
    queryText?: string;
    result?: unknown;
    error?: string;
}

export async function queryVectorSearch(args: {
    assistantProfile?: string;
    indexName: string;
    queryText: string;
    numResults?: number;
    columns?: string[];
}): Promise<VectorSearchResponse> {
    const res = await fetch("/api/assistant/vector-search/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({})) as VectorSearchResponse;
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}
