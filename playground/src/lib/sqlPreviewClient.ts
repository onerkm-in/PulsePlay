// playground/src/lib/sqlPreviewClient.ts
//
// PulsePlay-native client for the proxy `/sql/preview` route — used by the
// Settings SQL-section editor's "Validate" action. Mirrors the request the
// Pulse runtime sends (executeSqlPreviewClient in visual.tsx) but uses
// `fetch` (PulsePlay-native code is not under the Pulse XHR constraint).
//
// The proxy executes the SELECT against the Databricks warehouse and returns
// a row sample, so "Validate" is a real dry-run: it confirms the SQL parses,
// is authorized, and returns rows — not just a static lint.

export interface SqlPreviewResult {
    ok: boolean;
    columns: string[];
    rows: unknown[][];
    error?: string;
    totalRowCount?: number;
    executionTimeMs?: number;
}

export async function validateSqlViaPreview(args: {
    apiBaseUrl: string;
    sql: string;
    assistantProfile?: string;
    proxyKey?: string;
    signal?: AbortSignal;
}): Promise<SqlPreviewResult> {
    const base = (args.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) return { ok: false, columns: [], rows: [], error: "Proxy URL is not configured." };
    if (!args.sql.trim()) return { ok: false, columns: [], rows: [], error: "SQL is empty." };
    try {
        const res = await fetch(`${base}/sql/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(args.proxyKey ? { "X-Genie-Key": args.proxyKey } : {}),
                ...(args.assistantProfile ? { "X-Assistant-Profile": args.assistantProfile } : {}),
            },
            body: JSON.stringify({
                sql: args.sql,
                sectionH_cteHeader: "",
                assistantProfile: args.assistantProfile || "",
            }),
            signal: args.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean; columns?: string[]; rows?: unknown[][]; error?: string;
            totalRowCount?: number; executionTimeMs?: number;
        };
        if (!res.ok) {
            return { ok: false, columns: [], rows: [], error: data?.error || `Proxy returned status ${res.status}.` };
        }
        return {
            ok: data.ok !== false,
            columns: data.columns || [],
            rows: data.rows || [],
            error: data.ok === false ? (data.error || "Validation failed.") : undefined,
            totalRowCount: data.totalRowCount,
            executionTimeMs: data.executionTimeMs,
        };
    } catch (e) {
        if ((e as Error).name === "AbortError") {
            return { ok: false, columns: [], rows: [], error: "Validation cancelled." };
        }
        return { ok: false, columns: [], rows: [], error: (e as Error).message || "Network error reaching the proxy." };
    }
}
