// playground/src/lib/canvasConnector.ts
//
// Shared "which connector does the canvas run against" resolution. Canvas
// tiles refresh by re-running their bound SQL through the proxy's
// /sql/preview path (a read-only SELECT on the Databricks warehouse — no LLM).
// Both the tile grid, the Add-SQL-tile composer, and pin-to-canvas need the
// SAME two facts: the proxy base URL and the active warehouse-capable profile.
// Keeping them here means one source of truth instead of three copies.

/** The proxy API base the canvas talks to. Prefers the genie settings value
 *  (what the running visual uses), falls back to the same-origin /api. */
export function readCanvasApiBaseUrl(): string {
    try {
        const g = JSON.parse(window.localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}");
        if (g && typeof g.apiBaseUrl === "string" && g.apiBaseUrl.trim()) return g.apiBaseUrl;
    } catch { /* ignore */ }
    return `${window.location.origin}/api`;
}

/** The assistant/connector profile the canvas binds new tiles to. This is the
 *  profile whose warehouse the SELECT executes against. Reads the runtime
 *  genie setting first (assistantProfile), then the app-level active-profile
 *  key, and returns "" when nothing is configured (callers must handle the
 *  no-connector case — a tile with no profile is snapshot-only). */
export function readActiveCanvasProfile(): string {
    try {
        const g = JSON.parse(window.localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}");
        if (g && typeof g.assistantProfile === "string" && g.assistantProfile.trim()) {
            return g.assistantProfile.trim();
        }
    } catch { /* ignore */ }
    try {
        const p = window.localStorage.getItem("pulseplay:active-ai-profile");
        if (p && p.trim()) return p.trim();
    } catch { /* ignore */ }
    return "";
}
