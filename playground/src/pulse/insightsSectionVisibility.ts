/**
 * insightsSectionVisibility.ts — Wave 37 (rev'd post-cycle 16)
 *
 * Viewer-side AI Insights section visibility persistence, SCOPED to
 * author-defined custom sections only. Today's authoring model puts the
 * author in full control of the universal stages (HEADLINE / KPI SNAPSHOT /
 * TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS) via Setup → Section
 * A toggles. Custom sections, defined in Setup → Section A → "Custom AI
 * Insights sections (JSON)", are the only thing this module's popover
 * surfaces to viewers. Choices persist in localStorage per
 * `(spaceId | assistantProfile)` report key.
 *
 * Design contract:
 *   • Default = all sections visible. localStorage stores ONLY the set of
 *     section titles the viewer chose to HIDE (by absence — the public
 *     contract is `getStoredVisibility(reportKey)` returns the set of
 *     CURRENTLY VISIBLE section titles, computed against an "all visible"
 *     baseline). When localStorage is empty for a report, the helper
 *     returns null so callers know to fall back to "show everything".
 *   • Universal stage titles are always added back into the live visibility
 *     set by the caller (`visual.tsx` `currentVisibleTitles` useMemo),
 *     regardless of what the stored state says. A viewer's stored entry
 *     can never accidentally hide an author-controlled universal stage.
 *   • The helper is XHR-free + framework-free — no React, no proxy. Pure
 *     localStorage round-trip with an in-memory fallback for private mode /
 *     quota errors so the UI still works for the session.
 *   • All section titles are normalized to UPPER CASE before storage and
 *     comparison so "Customer Pulse" and "CUSTOMER PULSE" round-trip the
 *     same way the renderer normalizes them in renderInsightsSections.
 *   • localStorage key shape is `pulseplay-ai-insights-visibility:${reportKey}` —
 *     gitignored from any other key namespace and easy to clear by hand.
 *
 * NOTE: This module deliberately avoids importing from visualHelpers /
 * visual.tsx so it can be unit-tested in isolation and the dependency
 * graph stays acyclic (the renderer imports the helpers, not vice versa).
 */

const STORAGE_PREFIX = "pulseplay-ai-insights-visibility:";

/** In-memory fallback when localStorage throws (private mode, quota, SSR). */
const memoryStore = new Map<string, string[]>();
let memoryFallbackWarned = false;

function storageKey(reportKey: string): string {
    return `${STORAGE_PREFIX}${reportKey}`;
}

function getLocalStorage(): Storage | null {
    try {
        if (typeof window === "undefined") return null;
        const ls = window.localStorage;
        if (!ls) return null;
        return ls;
    } catch {
        return null;
    }
}

function warnMemoryFallback(reason: string): void {
    if (memoryFallbackWarned) return;
    memoryFallbackWarned = true;
    try {
        console.warn(
            `[Wave 37] AI Insights visibility falling back to in-memory store (${reason}). Viewer toggle preferences will not survive a page refresh.`
        );
    } catch { /* never throw out of telemetry */ }
}

/** Internal — for tests only. Resets the memory fallback bookkeeping. */
export function __resetVisibilityForTests(): void {
    memoryStore.clear();
    memoryFallbackWarned = false;
}

/**
 * Read the viewer's stored visible-section preference for a report.
 *
 * Returns:
 *   • `null` when there is no stored entry (caller should treat as
 *     "all sections visible by default").
 *   • A `Set<string>` of UPPER-CASED section titles when the viewer has
 *     customized visibility for this report. The set is the EXPLICIT list
 *     of sections currently visible — sections NOT in the set are hidden.
 */
export function getStoredVisibility(reportKey: string): Set<string> | null {
    if (!reportKey) return null;
    const key = storageKey(reportKey);
    const ls = getLocalStorage();
    if (ls) {
        try {
            const raw = ls.getItem(key);
            if (raw == null) {
                // Fall through to memory store — viewer might have toggled in
                // a session where localStorage threw, then it recovered.
                const mem = memoryStore.get(reportKey);
                return mem ? new Set(mem) : null;
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            const cleaned = parsed
                .filter((v: unknown): v is string => typeof v === "string")
                .map(v => v.trim().toUpperCase())
                .filter(v => v.length > 0);
            return new Set(cleaned);
        } catch {
            // Corrupt JSON or read error — try memory, otherwise null.
            const mem = memoryStore.get(reportKey);
            return mem ? new Set(mem) : null;
        }
    }
    warnMemoryFallback("localStorage unavailable");
    const mem = memoryStore.get(reportKey);
    return mem ? new Set(mem) : null;
}

/**
 * Persist the viewer's visible-section preference.
 *
 * On localStorage failure (quota, private mode, security exception) the
 * helper falls back to an in-memory map that survives module-level state
 * for the session. A single WARN is logged the first time a fallback
 * occurs so the surface area in the console stays bounded.
 */
export function storeVisibility(reportKey: string, visibleSections: Set<string>): void {
    if (!reportKey) return;
    const arr = Array.from(visibleSections)
        .filter((v): v is string => typeof v === "string")
        .map(v => v.trim().toUpperCase())
        .filter(v => v.length > 0);
    // Always update the in-memory mirror so getStoredVisibility's fallback
    // reflects the latest write even when localStorage is throwing.
    memoryStore.set(reportKey, arr);
    const ls = getLocalStorage();
    if (!ls) {
        warnMemoryFallback("localStorage unavailable");
        return;
    }
    try {
        ls.setItem(storageKey(reportKey), JSON.stringify(arr));
    } catch (e) {
        warnMemoryFallback(e instanceof Error ? e.message : "write failure");
    }
}

/**
 * Reset (clear) the viewer's stored preference for a report. Subsequent
 * reads return `null`, which the caller interprets as "all visible".
 */
export function resetVisibility(reportKey: string): void {
    if (!reportKey) return;
    memoryStore.delete(reportKey);
    const ls = getLocalStorage();
    if (!ls) {
        warnMemoryFallback("localStorage unavailable");
        return;
    }
    try {
        ls.removeItem(storageKey(reportKey));
    } catch (e) {
        warnMemoryFallback(e instanceof Error ? e.message : "remove failure");
    }
}

/**
 * Predicate used by the renderer. Given the stored set (or null) and a
 * candidate UPPER-CASED section title, return whether the section should
 * render. Centralizing the rule here keeps the renderer call-sites
 * (renderInsightsSections + sqlSectionRenderer wrap) consistent.
 *
 * Wave 37 contract:
 *   • `stored == null` → render everything (default behaviour).
 *   • Otherwise → render only when `title` is in the set.
 */
export function isSectionVisible(stored: Set<string> | null, title: string): boolean {
    if (!stored) return true;
    if (!title) return true;
    return stored.has(title.trim().toUpperCase());
}

/**
 * Compute the "default visibility" set for a list of available section
 * titles. Used when the popover first opens against a viewer that has no
 * stored preference yet — every section starts ticked.
 */
export function defaultVisibleSet(availableTitles: string[]): Set<string> {
    return new Set(availableTitles.map(t => t.trim().toUpperCase()).filter(t => t.length > 0));
}
