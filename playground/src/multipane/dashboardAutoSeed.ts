// playground/src/multipane/dashboardAutoSeed.ts
//
// Closes the "empty Dashboard" gap. When the Dashboard's native Pulse Canvas is
// empty AND a chart-capable connector is bound, auto-pin a few starter charts
// derived from the connected source — so a connected Dashboard greets the user
// with content instead of a blank canvas. The same tiles a user would get by
// asking "<measure> by <dimension>" in Ask Pulse and clicking "Pin to canvas".
//
// Guards (all load-bearing):
//   • feature flag `dashboardAutoSeed` (DEFAULT ON; disable for a blank canvas)
//   • only the deterministic Power BI path (connectorType powerbi-semantic-model)
//     — it returns real chart rows with no LLM; FM is prose, Genie is blocked
//   • only when the canvas is empty
//   • ONCE per profile — a per-profile marker means "Clear all" stays cleared
//     (we never fight a user who emptied their canvas)
//   • fail-silent — a failed query just doesn't pin; never throws to the UI
//
// Self-correcting: it proposes more candidate questions than it needs and pins
// only the ones that actually return >= 2 rows (a real chart), so a dimension
// the matcher doesn't recognise simply produces no tile.

import { useEffect, useRef } from "react";
import { addCanvasTile, canvasTileCount } from "../lib/canvasTiles";
import { isFeatureEnabled } from "../featureFlags";

const SEEDED_PREFIX = "pulseplay:dashboard-autoseeded:";
const TIME_RE = /year|month|quarter|date|day|week/i;
const ID_COL_RE = /(_id|_key|^id$|^key$|hash|postal|name)/i;

/** True once this profile has been auto-seeded (or attempted). Persisted so a
 *  user who "Clear all"s the canvas isn't re-seeded on the next visit. */
export function wasDashboardSeeded(profile: string): boolean {
    if (typeof window === "undefined" || !profile) return false;
    try { return window.localStorage.getItem(SEEDED_PREFIX + profile) === "1"; } catch { return false; }
}
export function markDashboardSeeded(profile: string): void {
    if (typeof window === "undefined" || !profile) return;
    try { window.localStorage.setItem(SEEDED_PREFIX + profile, "1"); } catch { /* ignore */ }
}

interface StarterQuestion { question: string; chartType: string; }

/** Build candidate "<measure> by <dimension>" starter questions from a connector
 *  probe. Returns MORE than needed; the orchestrator keeps only the ones that
 *  yield a real (multi-row) chart. Pure + exported for tests. */
export function buildStarterQuestions(probe: unknown): StarterQuestion[] {
    const p = (probe && typeof probe === "object") ? probe as Record<string, unknown> : {};
    const measures = Array.isArray(p.declaredKpis)
        ? (p.declaredKpis as Array<{ name?: string }>).map(k => String(k?.name || "")).filter(Boolean)
        : [];
    const schema = (p.schema && typeof p.schema === "object") ? p.schema as Record<string, unknown> : {};
    const tables = Array.isArray(schema.tables) ? schema.tables as Array<Record<string, unknown>> : [];
    // Categorical dimension columns: from Dim* tables, dropping id/key/name cols.
    const dims: string[] = [];
    for (const t of tables) {
        const tname = String(t.name || t.table || "");
        if (/^_?measures?$/i.test(tname) || /^fact/i.test(tname)) continue;
        const cols = Array.isArray(t.columns) ? t.columns as Array<unknown> : [];
        for (const c of cols) {
            const col = typeof c === "string" ? c : String((c as { name?: string })?.name || "");
            if (col && !ID_COL_RE.test(col) && !dims.includes(col)) dims.push(col);
        }
    }
    if (!measures.length || !dims.length) return [];
    const timeDim = dims.find(d => TIME_RE.test(d));
    const catDims = dims.filter(d => !TIME_RE.test(d));
    const out: StarterQuestion[] = [];
    const m0 = measures[0];
    const m1 = measures[1] || measures[0];
    // A time chart first (reads as a trend), then a couple of category splits.
    if (timeDim) out.push({ question: `${m0} by ${timeDim}`, chartType: "bar" });
    if (catDims[0]) out.push({ question: `${m0} by ${catDims[0]}`, chartType: "donut" });
    if (catDims[1]) out.push({ question: `${m1} by ${catDims[1]}`, chartType: "donut" });
    if (catDims[2]) out.push({ question: `${m0} by ${catDims[2]}`, chartType: "bar" });
    if (catDims[3]) out.push({ question: `${m1} by ${catDims[3]}`, chartType: "donut" });
    return out;
}

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Run starter questions through the deterministic proxy path and pin up to
 *  `max` of them that return a real (>= 2 row) chart. Returns tiles added. */
export async function autoSeedDashboard(opts: {
    profile: string;
    probe: unknown;
    apiBase?: string;
    fetchImpl?: FetchLike;
    max?: number;
}): Promise<number> {
    const { profile, probe } = opts;
    const apiBase = opts.apiBase || "/api";
    const max = opts.max ?? 3;
    const doFetch: FetchLike = opts.fetchImpl
        || (typeof fetch !== "undefined" ? (fetch as unknown as FetchLike) : (async () => ({ ok: false, json: async () => ({}) })));
    const candidates = buildStarterQuestions(probe);
    let added = 0;
    for (const c of candidates) {
        if (added >= max) break;
        try {
            const res = await doFetch(`${apiBase}/assistant/conversations/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assistantProfile: profile, content: c.question }),
            });
            if (!res.ok) continue;
            const data = await res.json() as { queryResult?: { columns?: string[]; rows?: unknown[][] }; dax?: string };
            const qr = data?.queryResult;
            const columns = Array.isArray(qr?.columns) ? qr!.columns! : [];
            const rows = Array.isArray(qr?.rows) ? qr!.rows! : [];
            if (columns.length >= 2 && rows.length >= 2) {
                addCanvasTile({
                    title: c.question,
                    kind: "chart",
                    chartType: c.chartType,
                    columns,
                    rows,
                    sqlQuery: data?.dax,
                    connectorProfileId: profile,
                    sourceQuestion: c.question,
                });
                added++;
            }
        } catch { /* fail-silent — skip this candidate */ }
    }
    return added;
}

/** The single entry point a trigger calls. Applies every guard, seeds at most
 *  once per profile, and always marks the profile as attempted so it never
 *  retries. Returns tiles added (0 when any guard blocks). */
export async function maybeAutoSeedDashboard(opts: {
    profile: string;
    connectorType?: string;
    probe: unknown;
    apiBase?: string;
    fetchImpl?: Parameters<typeof autoSeedDashboard>[0]["fetchImpl"];
    max?: number;
}): Promise<number> {
    const { profile, connectorType } = opts;
    if (!isFeatureEnabled("dashboardAutoSeed")) return 0;
    if (!profile) return 0;
    if (connectorType && connectorType !== "powerbi-semantic-model") return 0;
    if (canvasTileCount() > 0) return 0;
    if (wasDashboardSeeded(profile)) return 0;
    markDashboardSeeded(profile);   // mark BEFORE awaiting so concurrent triggers don't double-seed
    const added = await autoSeedDashboard(opts);
    return added;
}

/** Trigger hook. Call once with the Dashboard's effective connector and whether
 *  the Dashboard surface is currently visible. When the guards pass it fetches
 *  the connector probe (to learn connectorType + schema) and seeds. Runs at most
 *  once per profile per session (a ref guards the probe fetch); the persisted
 *  marker guards across sessions. No-op on the server / when the flag is off. */
export function useDashboardAutoSeed(opts: { profile: string; active: boolean; apiBase?: string }): void {
    const { profile, active } = opts;
    const apiBase = opts.apiBase || "/api";
    const attempted = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!active || !profile) return;
        if (!isFeatureEnabled("dashboardAutoSeed")) return;
        if (canvasTileCount() > 0) return;
        if (wasDashboardSeeded(profile)) return;
        if (attempted.current.has(profile)) return;
        attempted.current.add(profile);
        // NB: deliberately NOT cancelled on cleanup. The seed is a one-shot side
        // effect that only writes localStorage + fires CANVAS_TILES_EVENT (no
        // React state). If the effect re-runs (a dep flips) the cleanup must not
        // abort the in-flight seed — that would leave the canvas empty while the
        // `attempted` ref blocks the re-run. The ref + persisted marker already
        // guarantee once-per-profile, so we just let the async run to completion.
        void (async () => {
            try {
                const res = await fetch(`${apiBase}/assistant/probe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assistantProfile: profile }),
                });
                if (!res.ok) return;
                const probe = await res.json() as { connectorType?: string };
                await maybeAutoSeedDashboard({ profile, connectorType: probe?.connectorType, probe, apiBase });
            } catch { /* fail-silent */ }
        })();
    }, [active, profile, apiBase]);
}
