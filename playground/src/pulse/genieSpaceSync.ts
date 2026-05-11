/**
 * genieSpaceSync.ts
 *
 * XHR-based fetch/diff/apply helpers for the upstream Databricks Genie
 * `serialized_space` payload. Phase A (this commit) ships read-only:
 * fetchSpace + computeDiff + helpers for surfacing diffs in the Section G
 * editor. Phase B (commit 48.16) adds the write path behind an auth gate.
 *
 * XHR-only per the CLAUDE.md tripwire — Power BI Desktop's visual
 * sandbox blocks fetch.
 *
 * Three transports supported, mirroring the existing AI client:
 *
 *   1. Direct mode  — browser → host/api/2.0/genie/spaces/{id} with PAT
 *   2. Proxy mode   — browser → proxy /assistant/space-fetch
 *                                proxy → host with profile credentials
 *   3. Gateway mode — same as Direct (Gateway uses Workspace URL)
 *
 * The proxy passthrough keeps the PAT server-side — same security
 * posture as every other cost-bearing route.
 */

import { ConnectionMode } from "./settings";
import { GenieSpaceEnvelope, SerializedSpace, parseSerializedSpace } from "./genieSpaceTypes";

export interface SyncTarget {
    connectionMode: ConnectionMode;
    /** Databricks Workspace URL (Direct/Gateway) or proxy base URL (Proxy). */
    host?: string;
    /** Proxy base URL — used for Proxy / Supervisor / Cloud-AI modes. */
    apiBaseUrl?: string;
    /** Proxy profile name. */
    assistantProfile?: string;
    /** Direct PAT — never sent through the proxy. */
    token?: string;
    /** Genie Space ID. */
    spaceId: string;
    /** Optional proxy shared key when shared-key authentication is enabled. */
    proxyKey?: string;
}

export interface FetchSpaceResult {
    ok: boolean;
    /** Parsed envelope when ok. */
    envelope?: GenieSpaceEnvelope;
    /** Parsed serialized_space when ok. */
    serialized?: SerializedSpace;
    /** When !ok, a user-friendly error message. */
    error?: string;
    /** When !ok, the raw HTTP status (or 0 for network errors). */
    status?: number;
}

const XHR_TIMEOUT_MS = 15_000;

/** XHR helper. Returns { ok, status, body, error }. */
function xhrJson(method: string, url: string, headers: Record<string, string>, body?: string): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
    return new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.timeout = XHR_TIMEOUT_MS;
        x.open(method, url, true);
        for (const [k, v] of Object.entries(headers)) {
            try { x.setRequestHeader(k, v); } catch { /* PBI sandbox blocks some headers; ignore */ }
        }
        x.onload = () => {
            const ok = x.status >= 200 && x.status < 300;
            resolve({ ok, status: x.status, body: x.responseText || "", error: ok ? undefined : `HTTP ${x.status}` });
        };
        x.onerror = () => resolve({ ok: false, status: x.status || 0, body: "", error: "Network error or CORS rejection — check WebAccess allowlist" });
        x.ontimeout = () => resolve({ ok: false, status: 0, body: "", error: `Request timed out after ${XHR_TIMEOUT_MS / 1000}s` });
        try { x.send(body); } catch (e) { resolve({ ok: false, status: 0, body: "", error: String(e) }); }
    });
}

/** Fetch the Genie space serialized payload. */
export async function fetchSpace(target: SyncTarget): Promise<FetchSpaceResult> {
    if (!target.spaceId) {
        return { ok: false, error: "Genie Space ID is required" };
    }

    const useProxy = target.connectionMode === "proxy"
        || target.connectionMode === "supervisor"
        || (target.connectionMode === "auto" && (target.apiBaseUrl || "").trim().length > 0);

    let url: string;
    const headers: Record<string, string> = {
        "Accept": "application/json",
    };

    if (useProxy) {
        // Proxy passthrough route — added to proxy/server.js in 48.12.
        const base = (target.apiBaseUrl || "").replace(/\/$/, "");
        if (!base) return { ok: false, error: "Proxy URL is required for Proxy/Supervisor modes" };
        const profile = target.assistantProfile || "default";
        url = `${base}/assistant/space-fetch?profile=${encodeURIComponent(profile)}&spaceId=${encodeURIComponent(target.spaceId)}`;
        if (target.proxyKey) {
            headers["X-Genie-Key"] = target.proxyKey;
        }
    } else {
        // Direct or Gateway — browser hits Databricks REST directly.
        const host = (target.host || "").replace(/\/$/, "");
        if (!host) return { ok: false, error: "Workspace URL is required for Direct/Gateway modes" };
        if (!target.token) return { ok: false, error: "Access Token is required for Direct mode (PAT)" };
        url = `${host}/api/2.0/genie/spaces/${encodeURIComponent(target.spaceId)}?include_serialized_space=true`;
        headers["Authorization"] = `Bearer ${target.token}`;
    }

    const res = await xhrJson("GET", url, headers);
    if (!res.ok) {
        return { ok: false, status: res.status, error: res.error };
    }

    let envelope: GenieSpaceEnvelope;
    try {
        envelope = JSON.parse(res.body);
    } catch (e) {
        return { ok: false, status: res.status, error: `Failed to parse Genie response: ${(e as Error).message}` };
    }

    if (!envelope.serialized_space) {
        // Older spaces may not return the serialized blob unless explicitly
        // requested. We always pass include-serialized-space=true above.
        return { ok: false, status: res.status, error: "Genie response missing serialized_space — confirm the space exists and the credentials have access" };
    }

    const serialized = parseSerializedSpace(envelope.serialized_space);
    if (!serialized) {
        return { ok: false, status: res.status, error: "Could not parse serialized_space (expected version 2)" };
    }

    return { ok: true, envelope, serialized };
}

// ────────────────────────────────────────────────────────────────────────
// Diff helpers — compare a draft (in-memory edits) vs the upstream Genie space.
// ────────────────────────────────────────────────────────────────────────

export type DiffOp = "added" | "removed" | "modified";

export interface InstructionDiffEntry {
    op: DiffOp;
    kind: "text_instruction" | "example_question_sql" | "sample_question" | "table";
    /** Stable identifier — Genie space hex ID for instructions, identifier for tables. */
    id: string;
    /** Short label for display. */
    label: string;
    /** When op is modified, the previous and next values. */
    before?: string;
    after?: string;
}

export interface SpaceDiff {
    counts: { added: number; removed: number; modified: number };
    entries: InstructionDiffEntry[];
}

/** Compute a flat diff between two SerializedSpace shapes. Section G's
 *  "Show diff" surface uses this. */
export function computeDiff(upstream: SerializedSpace, draft: SerializedSpace): SpaceDiff {
    const entries: InstructionDiffEntry[] = [];

    const diffById = <T extends { id: string }>(
        kind: InstructionDiffEntry["kind"],
        upstreamArr: T[] | undefined,
        draftArr: T[] | undefined,
        labelOf: (x: T) => string,
        equal: (a: T, b: T) => boolean,
        before: (x: T) => string,
        after: (x: T) => string,
    ) => {
        const u = new Map((upstreamArr ?? []).map(x => [x.id, x]));
        const d = new Map((draftArr ?? []).map(x => [x.id, x]));
        for (const [id, val] of d) {
            if (!u.has(id)) {
                entries.push({ op: "added", kind, id, label: labelOf(val), after: after(val) });
            } else if (!equal(u.get(id)!, val)) {
                entries.push({ op: "modified", kind, id, label: labelOf(val), before: before(u.get(id)!), after: after(val) });
            }
        }
        for (const [id, val] of u) {
            if (!d.has(id)) {
                entries.push({ op: "removed", kind, id, label: labelOf(val), before: before(val) });
            }
        }
    };

    diffById(
        "text_instruction",
        upstream.instructions.text_instructions,
        draft.instructions.text_instructions,
        ti => (ti.content || []).join(" ").slice(0, 60) + ((ti.content || []).join("").length > 60 ? "…" : ""),
        (a, b) => JSON.stringify(a.content) === JSON.stringify(b.content),
        ti => (ti.content || []).join("\n"),
        ti => (ti.content || []).join("\n"),
    );

    diffById(
        "example_question_sql",
        upstream.instructions.example_question_sqls,
        draft.instructions.example_question_sqls,
        eq => eq.question || "(unnamed)",
        (a, b) => a.question === b.question && a.sql === b.sql && JSON.stringify(a.parameters) === JSON.stringify(b.parameters) && a.usage_guidance === b.usage_guidance,
        eq => eq.sql,
        eq => eq.sql,
    );

    diffById(
        "sample_question",
        upstream.config.sample_questions,
        draft.config.sample_questions,
        sq => (sq.question || []).join(" ").slice(0, 60),
        (a, b) => JSON.stringify(a.question) === JSON.stringify(b.question),
        sq => (sq.question || []).join("\n"),
        sq => (sq.question || []).join("\n"),
    );

    const counts = entries.reduce(
        (acc, e) => ({ ...acc, [e.op]: acc[e.op] + 1 }),
        { added: 0, removed: 0, modified: 0 },
    );

    return { counts, entries };
}
