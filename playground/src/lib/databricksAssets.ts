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
