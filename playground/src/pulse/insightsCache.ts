// AI Insights cache — survives PBI page-switch and theme-apply re-mounts so
// the user doesn't pay 5 stages of Genie latency every time they navigate.
//
// Two-tier:
//   - Module-level Map for instant rehydrate inside the same iframe session.
//   - localStorage with TTL for cross-page / report-reopen survival.
//
// Cache key composition is the caller's responsibility (see buildCacheKey).
// Theme is intentionally NOT part of the key — theme changes should not bust.

// 49.16 — bumped from v1 → v2 to invalidate any stale empty-content entries
// that may have been written by earlier broken builds (49.4 / 49.11 / 49.13).
// Old keys remain in localStorage but are never read or matched again.
//
// v2 → v3 bump: triggered on user request after a real-supervisor session
// where cached single-space output was being served against newly-deployed
// supervisor code.
// v3 → v4 bump: user closed PBI Desktop and asked for a guaranteed fresh
// cache state after the streaming-hang debug session. Invalidates every
// v3 entry (what was just written during the most recent test session).
// v4 → v5 bump (Wave 30 cycle 5): added `schemaHash` to the key. Without
// it, swapping a bound measure or dimension in the PBI Visualizations pane
// (no Setup edit) silently served the cached output of the OLD schema for
// up to 30 min — see CLAUDE.md "Tripwires from Waves 22-30 / Wave 27".
// v5 → v6 bump (Wave 35 Phase 1): cache key now appends `sqlHash` for
// reports that use the new Custom SQL Authoring Mode (kind:"sql"
// sections). Bumping the prefix invalidates every v5 entry rather than
// silently colliding the new key shape onto the old one. SQL-section
// outputs are deterministic, so they ride a 4h TTL via the new
// SQL_SECTION_CACHE_TTL_MS constant — callers pick which TTL to pass in.
const CACHE_PREFIX = "pulseplay-ai-insights:v6:";
/** Default TTL when the caller doesn't pass an override (IDEA-009). */
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
/** Wave 35 Phase 1 — SQL sections are deterministic (no LLM in the loop)
 *  so they ride a longer 4h TTL. Caller passes this through `ttlMs` when
 *  any section in the active key is `kind:"sql"` (mixed sections take
 *  the longer TTL — invalidation still happens on SQL edit via sqlHash). */
const SQL_SECTION_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface CachedInsightsEntry {
    content: string;
    status: string;
    sqlQuery?: string;
    queryResult?: { columns: string[]; rows: unknown[][] };
    trace?: string[];
    viewMode?: string;
    stageTitles: string[];
    stageStatuses: string[];
    generatedAt: number;
}

export interface InsightsCacheKeyArgs {
    spaceKey: string;
    assistantProfile: string;
    spaceId: string;
    connectionMode: string;
    roleMode: string;
    selectedFilters: Record<string, string>;
    customPromptId: string | null;
    customPromptText: string;
    kbFlags: unknown;
    /** Wave 30 cycle 5 — stable hash of sorted measure + dimension keys
     *  bound in the visual. Closes the silent-stale-cache footgun when the
     *  author swaps fields in the PBI Visualizations pane without touching
     *  Setup. Pass empty string to opt out (legacy callers). */
    schemaHash?: string;
    /** Wave 35 Phase 1 — stable hash of every SQL section body in the
     *  active section list, sorted by section title for stability across
     *  reorder. Empty string for AI-only configurations (legacy + default).
     *  Editing any SQL body busts the cache; reordering does not. */
    sqlHash?: string;
}

function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
    return (h >>> 0).toString(36);
}

function safeJson(value: unknown): string {
    try { return JSON.stringify(value ?? {}); } catch { return ""; }
}

/**
 * IDEA-039 Phase 1 — settings fingerprint composer used by `customPromptText`.
 *
 * Composes a stable, ordered string from every Insights-affecting setting
 * that previously left the cache stale on change. Concatenated into
 * `customPromptText` by the caller so any drift on these inputs busts the
 * cache. Field order is documented and asserted by the parity test —
 * reorder requires invalidating `CACHE_PREFIX`.
 *
 * Captured fields (each one was missing from the cache key before):
 *   - `domainGuidance` (system prompt body)
 *   - `genieFields`   (column allowlist)
 *   - `sendContextToGenie` (toggle that gates filter context injection)
 *   - `host`          (Databricks workspace base URL)
 *   - `apiBaseUrl`    (proxy URL when in proxy/gateway mode)
 *   - `insightsAuthoringMode` / `insightsDomain` / `insightsCustomSections`
 *     (already in the previous fingerprint — kept for backwards compat)
 */
export interface InsightsSettingsFingerprintInput {
    insightsAuthoringMode?: string;
    insightsDomain?: string;
    insightsCustomSections?: string;
    insightsDomainGuidance?: string;
    /** IDEA-039 Codex Review #2 C1 — metricDirectionRules changes the
     *  hybrid stage prompt (the inverted-good metric coloring contract)
     *  but was previously missing from the fingerprint, so authors could
     *  edit the rules and still get stale cached output. Now part of the
     *  cache key. Parity test asserts cache-bust on any rule edit. */
    metricDirectionRules?: string;
    insightsMetricDirections?: string;
    domainGuidance?: string;
    genieFields?: string;
    sendContextToGenie?: boolean;
    host?: string;
    apiBaseUrl?: string;
    /** Wave 27 — governance fields. Wave 22 cycle 5a docs the load-bearing
     *  contract: visual prepends buildRuntimeScopePrefix() to every Genie
     *  message. If author flips runtimeForbiddenColumns / sqlCtePreamble /
     *  runtimeReadOnlyEnforced AFTER seeing cached output, they expected a
     *  fresh pipeline run respecting the new governance. Without these in
     *  the fingerprint, the cache returned the OLD output and the author
     *  silently saw stale, non-governed data. */
    runtimeForbiddenColumns?: string;
    runtimeMandatoryRowFilter?: string;
    runtimeReadOnlyEnforced?: boolean;
    sqlCtePreamble?: string;
    sqlForbiddenTables?: string;
    sqlRlsHintEnabled?: boolean;
}

export function composeInsightsSettingsFingerprint(input: InsightsSettingsFingerprintInput): string {
    return [
        `mode:${(input.insightsAuthoringMode || "preset").trim()}`,
        `domain:${(input.insightsDomain || "").trim()}`,
        `sections:${(input.insightsCustomSections || "").trim()}`,
        `idg:${(input.insightsDomainGuidance || "").trim()}`,
        `mdr:${(input.metricDirectionRules || "").trim()}`,
        `imd:${(input.insightsMetricDirections || "").trim()}`,
        `dg:${(input.domainGuidance || "").trim()}`,
        `gf:${(input.genieFields || "").trim()}`,
        `sendCtx:${input.sendContextToGenie ? 1 : 0}`,
        `host:${(input.host || "").trim()}`,
        `api:${(input.apiBaseUrl || "").trim()}`,
        // Wave 27 — governance fields (see InsightsSettingsFingerprintInput
        // jsdoc for why these were missing and the silent-stale-cache risk).
        `rfc:${(input.runtimeForbiddenColumns || "").trim()}`,
        `rmrf:${(input.runtimeMandatoryRowFilter || "").trim()}`,
        `rro:${input.runtimeReadOnlyEnforced ? 1 : 0}`,
        `cte:${(input.sqlCtePreamble || "").trim()}`,
        `sft:${(input.sqlForbiddenTables || "").trim()}`,
        `rls:${input.sqlRlsHintEnabled ? 1 : 0}`,
    ].join("|");
}

export function buildInsightsCacheKey(args: InsightsCacheKeyArgs): string {
    const filterStr = Object.entries(args.selectedFilters || {})
        .filter(([, v]) => v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("|");
    const composite = [
        args.connectionMode || "",
        args.assistantProfile || "default",
        args.spaceId || "",
        args.spaceKey,
        args.roleMode || "",
        djb2(safeJson(args.kbFlags)),
        args.customPromptId || (args.customPromptText ? djb2(args.customPromptText) : "default"),
        djb2(filterStr),
        args.schemaHash || "", // Wave 30 cycle 5 — schema fingerprint
        args.sqlHash || ""     // Wave 35 Phase 1 — SQL section fingerprint
    ].join(":");
    return CACHE_PREFIX + composite;
}

/**
 * Wave 35 Phase 1 — stable fingerprint of every SQL-section body in the
 * active section list. Sections are sorted by title (then by SQL body for
 * tie-breaking) so column-pane reordering doesn't bust the cache, but any
 * SQL edit / add / remove / rename triggers a fresh execution.
 *
 * Returns "" when no SQL sections exist (the all-AI / legacy path), which
 * leaves the cache key shape backwards compatible with any caller that
 * doesn't pass `sqlHash` explicitly.
 *
 * Accepts a loose shape on purpose — we don't want to import the full
 * sqlSection types here (would create a cycle in tree-shaken builds) and
 * the hash only depends on `kind` + `title` + `sql`.
 */
export function computeSqlHash(
    sections: ReadonlyArray<{ kind?: string; title?: string; sql?: string }> | null | undefined
): string {
    if (!sections || sections.length === 0) return "";
    const sqlSections = sections
        .filter(s => s && s.kind === "sql" && typeof s.sql === "string" && s.sql.length > 0)
        .map(s => ({ title: (s.title || "").trim(), sql: (s.sql || "").trim() }))
        .sort((a, b) => {
            const t = a.title.localeCompare(b.title);
            return t !== 0 ? t : a.sql.localeCompare(b.sql);
        });
    if (sqlSections.length === 0) return "";
    const concat = sqlSections.map(s => `${s.title}${s.sql}`).join("");
    return djb2(concat);
}

/**
 * Wave 30 cycle 5 — stable schema fingerprint for the bound fields. Sorts
 * the measure + dimension keys so column-pane reordering doesn't bust the
 * cache, but any add/remove/rename triggers a fresh pipeline run.
 */
export function computeSchemaHash(
    measures: Record<string, unknown> | undefined | null,
    dimensions: Record<string, unknown> | undefined | null
): string {
    const m = Object.keys(measures || {}).sort();
    const d = Object.keys(dimensions || {}).sort();
    return djb2(`m:${m.join(",")}|d:${d.join(",")}`);
}

const memoryCache = new Map<string, CachedInsightsEntry>();

function ls(): Storage | null {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

/**
 * Read an insights cache entry. The TTL is configurable per-call (IDEA-009)
 * so the visual can pass `settings.insightsCacheTtlMinutes` through and
 * authors can shorten / extend / disable caching without rebuilding. A TTL
 * of 0 disables caching entirely (always returns null).
 */
export function readInsightsCache(
    key: string,
    now: number = Date.now(),
    ttlMs: number = DEFAULT_CACHE_TTL_MS
): CachedInsightsEntry | null {
    if (ttlMs <= 0) return null; // caching disabled
    const mem = memoryCache.get(key);
    if (mem && now - mem.generatedAt < ttlMs) return mem;
    if (mem) memoryCache.delete(key);

    const store = ls();
    if (!store) return null;
    try {
        const raw = store.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedInsightsEntry;
        if (!parsed?.generatedAt || now - parsed.generatedAt >= ttlMs) {
            try { store.removeItem(key); } catch { /* ignore */ }
            return null;
        }
        memoryCache.set(key, parsed);
        return parsed;
    } catch {
        return null;
    }
}

export function writeInsightsCache(key: string, entry: CachedInsightsEntry, ttlMs: number = DEFAULT_CACHE_TTL_MS): void {
    if (ttlMs <= 0) return; // caching disabled — silent skip
    memoryCache.set(key, entry);
    const store = ls();
    if (!store) return;
    try {
        store.setItem(key, JSON.stringify(entry));
    } catch {
        // Quota exceeded or storage unavailable — memory tier still serves
        // this session; nothing more to do.
    }
}

export function clearInsightsCache(key: string): void {
    memoryCache.delete(key);
    const store = ls();
    if (!store) return;
    try { store.removeItem(key); } catch { /* ignore */ }
}

/**
 * Wipe ALL insights cache entries (memory + localStorage). Use when the
 * shape of cached content has changed in a way the version-prefix bump
 * doesn't capture (e.g. user wants to force-regenerate after a backend
 * config change like swapping connector mode). Returns the number of
 * removed localStorage entries.
 */
export function clearAllInsightsCache(): number {
    memoryCache.clear();
    const store = ls();
    if (!store) return 0;
    let removed = 0;
    try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            // Match both the current prefix and any earlier version (so a
            // single sweep cleans up old v1/v2/etc cruft too).
            if (k && /^pulseplay-ai-insights:v\d+:/.test(k)) keys.push(k);
        }
        for (const k of keys) {
            try { store.removeItem(k); removed++; } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    return removed;
}

// Prunes stale entries from localStorage based on TTL. Called once per
// render pass from the Visual runtime (visual.tsx) to bound cache growth.
export function pruneInsightsCache(now: number = Date.now(), ttlMs: number = DEFAULT_CACHE_TTL_MS): number {
    const store = ls();
    if (!store) return 0;
    let removed = 0;
    try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
        }
        for (const k of keys) {
            try {
                const raw = store.getItem(k);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!parsed?.generatedAt || now - parsed.generatedAt >= ttlMs) {
                    store.removeItem(k);
                    memoryCache.delete(k);
                    removed++;
                }
            } catch {
                store.removeItem(k);
                removed++;
            }
        }
    } catch { /* ignore */ }
    return removed;
}

export const _internals = { DEFAULT_CACHE_TTL_MS, SQL_SECTION_CACHE_TTL_MS, CACHE_PREFIX };
export { SQL_SECTION_CACHE_TTL_MS };
