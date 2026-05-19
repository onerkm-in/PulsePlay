/**
 * insightsExporters.ts
 *
 * IDEA-044 Phase 2 — Rich export for AI Insights.
 *
 * Phase 1 (`exportHelpers.ts`) shipped a single CSV button that no-op'd
 * silently when no pipe-table existed in the Insights output (~80% of
 * runs are HEADLINE / TRENDS prose). Per user feedback the button was
 * removed in Wave 30 cycle 6. Phase 2 reinstates a unified "Export ▾"
 * dropdown with three correctly-disabled options:
 *
 *   1. Save as PNG   — full-fidelity capture of the Insights container
 *                      via lazy-loaded html2canvas at 2× retina scale.
 *   2. Save as Excel — every pipe-table in the Insights output as its
 *                      own sheet (named after the section heading), plus
 *                      a Provenance sheet (timestamp / space / question).
 *                      Lazy-loaded SheetJS (xlsx).
 *   3. Save as CSV   — Phase 1 behavior. Now correctly disabled when no
 *                      pipe-table exists (button title explains why).
 *
 * Lazy-load contract (mirrors Wave 25 sql-formatter pattern):
 *   - `import("html2canvas")` and `import("xlsx")` happen inside the click
 *     handler, NOT at module top-level. Webpack emits them as separate
 *     chunks via the `webpackChunkName` magic comments below. Main
 *     .pbiviz bundle stays ~247 KB (under the 350 KB cap); the +560 KB
 *     of html2canvas+xlsx ships as separate `xlsx`/`html2canvas` files
 *     in the webpack output directory.
 *
 *   - SANDBOX CAVEAT: In the PBI Desktop visual sandbox, the JSONP
 *     `<script>` injection that webpack uses to fetch split chunks at
 *     runtime is BLOCKED — and pbiviz package() only embeds the main
 *     entry chunk into the .pbiviz, not the side chunks. So in the
 *     hosted-visual production path the `import()` will reject. We
 *     surface that as `LazyLoadError` and the UI shows a friendly toast
 *     ("Couldn't load the {module} export library — please check your
 *     network."). This is the same degraded-but-graceful behavior the
 *     sql-formatter lazy-load relies on (regex fallback). When we move
 *     to a hosting model that can serve side chunks (web embed / SaaS
 *     portal / extension) the export buttons start working immediately
 *     with NO code change — the chunks are already emitted, just not
 *     reachable from PBI Desktop.
 *
 *   - If a chunk load throws for any other reason (CSP, offline, etc.)
 *     we surface the same `LazyLoadError` and the UI never breaks.
 *
 * Sandbox-safety:
 *   - html2canvas is pure DOM-canvas; no network calls.
 *   - xlsx is browser/Node universal; we use the in-memory writer path
 *     (`XLSX.write(wb, { bookType: "xlsx", type: "array" })`) which
 *     produces an ArrayBuffer we feed to the existing Blob+download flow.
 *   - All file delivery reuses `downloadAs()` from `exportHelpers.ts`
 *     (Blob + URL.createObjectURL + a.download) — already proven safe in
 *     PBI Desktop.
 */

import {
    extractFirstPipeTable,
    rowsToCsv,
    downloadAs,
    buildExportFooterRow,
    exportSectionAsCsv,
} from "./exportHelpers";

// ── Types ─────────────────────────────────────────────────────────────

export interface PipeTable {
    headers: string[];
    rows: string[][];
    /** UPPER-CASED section heading the table belongs to (e.g. "TRENDS"). */
    sectionTitle: string;
}

export interface InsightsExportContext {
    /** Markdown body of the active Insights run (post-sanitization). */
    body: string;
    /** Active space identifier — used in the filename. Truthful default
     *  `"insights"` if the caller hasn't computed one yet. */
    spaceId?: string;
    /** Active space label (e.g. "Sales") — surfaced in Provenance sheet. */
    spaceLabel?: string;
    /** Question that triggered the run — surfaced in Provenance sheet. */
    question?: string;
    /** Source/profile label for CSV footer reuse. */
    sourceLabel?: string;
    /** ISO timestamp (or epoch ms) of the run — defaults to `now`. */
    generatedAt?: number;
}

export interface RawQueryResult {
    columns: string[];
    rows: unknown[][];
}

export interface DisabledStateInputs {
    /** True while the Insights pipeline is in flight (busy spinner). */
    insightsBusy: boolean;
    /** True if there is any rendered Insights body to export. */
    hasContent: boolean;
    /** True if at least one pipe-table is present in the body. */
    hasTable: boolean;
}

export interface DisabledState {
    /** Disable the entire "Export ▾" trigger. */
    triggerDisabled: boolean;
    /** Per-format disabled flags. */
    pngDisabled: boolean;
    excelDisabled: boolean;
    csvDisabled: boolean;
    /** Tooltip text explaining the disabled state (empty if enabled). */
    triggerTitle: string;
    pngTitle: string;
    excelTitle: string;
    csvTitle: string;
}

/** Custom error class so callers can distinguish a chunk-load failure
 *  (offline, CSP, blocked CDN proxy, etc.) from a runtime error after the
 *  chunk loaded. The visual maps this to a friendly toast. */
export class LazyLoadError extends Error {
    public readonly module: string;
    constructor(module: string, cause?: unknown) {
        super(`Failed to load lazy chunk: ${module}`);
        this.name = "LazyLoadError";
        this.module = module;
        if (cause && typeof cause === "object") {
            try { (this as { cause?: unknown }).cause = cause; } catch { /* ignore */ }
        }
    }
}

// ── Pure helpers (no DOM, no lazy chunks) ─────────────────────────────

/** Extract every pipe-table in the Insights body, paired with the closest
 *  preceding `## HEADING` (UPPER-CASED) so callers can name sheets/files
 *  by section. Order preserved (top → bottom). */
export function extractAllPipeTables(body: string): PipeTable[] {
    if (!body) return [];
    const lines = body.split(/\r?\n/);
    const out: PipeTable[] = [];
    let currentSection = "INSIGHTS";
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const headingMatch = /^\s*#{1,3}\s+(.+?)\s*$/.exec(line);
        if (headingMatch) {
            currentSection = headingMatch[1].trim().toUpperCase().replace(/[*_`]/g, "");
            i++;
            continue;
        }
        // Re-use the Phase 1 extractor on the slice from here. Stops at the
        // first blank line after the table body, so we just need to skip
        // past whatever it consumed.
        if (/^\s*\|.+\|\s*$/.test(line)) {
            const slice = lines.slice(i).join("\n");
            const t = extractFirstPipeTable(slice);
            if (t) {
                out.push({ headers: t.headers, rows: t.rows, sectionTitle: currentSection });
                // Advance past header + separator + body rows (+blank).
                let consumed = 2 + t.rows.length;
                i += consumed;
                continue;
            }
        }
        i++;
    }
    return out;
}

/** Produce a stable, filesystem-safe stem for any of the three exporters.
 *  Format: `ai-insights-{spaceId}-{YYYYMMDD}` (per spec). */
export function buildInsightsExportStem(spaceId: string | undefined, now: Date = new Date()): string {
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const safeSpace = (spaceId || "insights")
        .replace(/[\\/:*?"<>|\x00-\x1F]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 40) || "insights";
    return `ai-insights-${safeSpace}-${yyyy}${mm}${dd}`;
}

/** Excel sheet names are limited to 31 chars and may not contain
 *  `\ / ? * [ ]` or be empty. Apply Excel's actual rules and de-duplicate
 *  collisions with a numeric suffix. */
export function sanitizeSheetName(raw: string, takenLower: Set<string>): string {
    const cleaned = (raw || "Sheet")
        .replace(/[\\/?*\[\]:]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 31) || "Sheet";
    if (!takenLower.has(cleaned.toLowerCase())) {
        takenLower.add(cleaned.toLowerCase());
        return cleaned;
    }
    // Collision: append " (n)" suffix while staying within 31 chars.
    for (let n = 2; n < 1000; n++) {
        const suffix = ` (${n})`;
        const base = cleaned.slice(0, 31 - suffix.length);
        const candidate = `${base}${suffix}`;
        if (!takenLower.has(candidate.toLowerCase())) {
            takenLower.add(candidate.toLowerCase());
            return candidate;
        }
    }
    return cleaned; // pathological — accept duplicate
}

/** Compute the disabled state and tooltip text for the dropdown +
 *  per-item buttons. Pure: no DOM, easy to unit-test. */
export function computeDisabledState(input: DisabledStateInputs): DisabledState {
    if (input.insightsBusy) {
        return {
            triggerDisabled: true,
            pngDisabled: true,
            excelDisabled: true,
            csvDisabled: true,
            triggerTitle: "Export available once the AI Insights run completes",
            pngTitle: "Export available once the AI Insights run completes",
            excelTitle: "Export available once the AI Insights run completes",
            csvTitle: "Export available once the AI Insights run completes",
        };
    }
    if (!input.hasContent) {
        return {
            triggerDisabled: true,
            pngDisabled: true,
            excelDisabled: true,
            csvDisabled: true,
            triggerTitle: "Run AI Insights first to enable export",
            pngTitle: "Run AI Insights first to enable export",
            excelTitle: "Run AI Insights first to enable export",
            csvTitle: "Run AI Insights first to enable export",
        };
    }
    return {
        triggerDisabled: false,
        pngDisabled: false,
        excelDisabled: !input.hasTable,
        csvDisabled: !input.hasTable,
        triggerTitle: "Export the current AI Insights output",
        pngTitle: "Save the current Insights view as a PNG image (2× retina)",
        excelTitle: input.hasTable
            ? "Save every Insights table as an .xlsx workbook (one sheet per table)"
            : "No data tables found in the current Insights output",
        csvTitle: input.hasTable
            ? "Save the first Insights data table as a .csv file"
            : "No data tables found in the current Insights output",
    };
}

// ── Lazy-load wrappers ────────────────────────────────────────────────

/** Lazy-load html2canvas. Throws `LazyLoadError` on chunk failure so the
 *  caller can show a toast and recover. Public for testing. */
export async function loadHtml2Canvas(): Promise<typeof import("html2canvas").default> {
    try {
        const mod = await import(/* webpackChunkName: "html2canvas" */ "html2canvas");
        // Default export when used as ES module; some bundlers expose the fn
        // directly on the namespace too.
        const fn = (mod as unknown as { default?: typeof import("html2canvas").default }).default
            ?? (mod as unknown as typeof import("html2canvas").default);
        if (typeof fn !== "function") throw new Error("html2canvas default export is not a function");
        return fn;
    } catch (e) {
        throw new LazyLoadError("html2canvas", e);
    }
}

/** Lazy-load SheetJS / xlsx. Throws `LazyLoadError` on chunk failure. */
export async function loadXlsx(): Promise<typeof import("xlsx")> {
    try {
        const mod = await import(/* webpackChunkName: "xlsx" */ "xlsx");
        // SheetJS exports its surface on the namespace AND a default in some
        // bundler configs — normalize.
        const xlsx = (mod as unknown as { default?: typeof import("xlsx") }).default ?? mod;
        if (!xlsx || typeof (xlsx as { utils?: unknown }).utils !== "object") {
            throw new Error("xlsx module shape unexpected");
        }
        return xlsx as typeof import("xlsx");
    } catch (e) {
        throw new LazyLoadError("xlsx", e);
    }
}

// ── Public exporters ──────────────────────────────────────────────────

/** Export the Insights container as a PNG. Returns `true` on success.
 *  Surfaces `LazyLoadError` so the caller can toast a friendly message. */
export async function exportInsightsPng(
    container: HTMLElement | null,
    ctx: InsightsExportContext
): Promise<boolean> {
    if (!container) return false;
    const html2canvas = await loadHtml2Canvas();
    // 2× retina scale per spec. Background pulled from computed style so
    // dark themes don't render with a transparent canvas (which most image
    // viewers display as black).
    let bg: string | null = null;
    try {
        const cs = window.getComputedStyle(container);
        bg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : null;
        if (!bg) {
            const parentBg = window.getComputedStyle(container.parentElement || container).backgroundColor;
            bg = parentBg && parentBg !== "rgba(0, 0, 0, 0)" ? parentBg : "#ffffff";
        }
    } catch { bg = "#ffffff"; }

    const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: bg,
        useCORS: true,
        logging: false,
        // Skip elements explicitly marked non-exportable (toolbars / dropdowns).
        ignoreElements: (el: Element) => el.classList?.contains("gn-export-skip") ?? false,
    });
    const dataUrl = canvas.toDataURL("image/png");
    // dataURL → Blob to reuse the proven download path.
    const byteString = atob(dataUrl.split(",")[1]);
    const buf = new ArrayBuffer(byteString.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < byteString.length; i++) view[i] = byteString.charCodeAt(i);
    const blob = new Blob([view], { type: "image/png" });
    const stem = buildInsightsExportStem(ctx.spaceId, ctx.generatedAt ? new Date(ctx.generatedAt) : new Date());
    triggerBlobDownload(blob, `${stem}.png`);
    return true;
}

/** Export every pipe-table in the Insights body as an Excel workbook.
 *  Adds a Provenance sheet with timestamp / space / question. Returns
 *  `false` if no tables exist (caller should disable the button). */
export async function exportInsightsExcel(ctx: InsightsExportContext): Promise<boolean> {
    const tables = extractAllPipeTables(ctx.body);
    if (tables.length === 0) return false;
    const xlsx = await loadXlsx();
    const wb = xlsx.utils.book_new();
    const taken = new Set<string>();
    for (const t of tables) {
        const aoa: string[][] = [t.headers, ...t.rows];
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        const sheetName = sanitizeSheetName(t.sectionTitle || "Table", taken);
        xlsx.utils.book_append_sheet(wb, ws, sheetName);
    }
    // Provenance sheet (always last). Two-column key/value layout so the
    // user can quickly inspect when/where the export came from.
    const generatedIso = new Date(ctx.generatedAt ?? Date.now()).toISOString();
    const provRows: string[][] = [
        ["Field", "Value"],
        ["Generated by", "PulsePlay AI"],
        ["Exported (UTC)", generatedIso],
        ["Space ID", ctx.spaceId || "(none)"],
        ["Space label", ctx.spaceLabel || "(none)"],
        ["Source / profile", ctx.sourceLabel || "default"],
        ["Question", ctx.question || "(insights pipeline)"],
        ["Tables exported", String(tables.length)],
    ];
    const provWs = xlsx.utils.aoa_to_sheet(provRows);
    xlsx.utils.book_append_sheet(wb, provWs, sanitizeSheetName("Provenance", taken));
    const arrBuf = xlsx.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([arrBuf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const stem = buildInsightsExportStem(ctx.spaceId, ctx.generatedAt ? new Date(ctx.generatedAt) : new Date());
    triggerBlobDownload(blob, `${stem}.xlsx`);
    return true;
}

/** Export the first pipe-table as CSV. Reuses Phase 1 helper directly so
 *  any change to the CSV format only has one source of truth. */
export function exportInsightsCsv(ctx: InsightsExportContext): boolean {
    return exportSectionAsCsv(ctx.body, {
        sectionTitle: "AI-Insights",
        sourceLabel: ctx.sourceLabel,
    });
}

// ── Cycle 20: per-section export helpers ──────────────────────────────
// Each section card in renderInsightsSections gets a kebab ⋮ menu offering
// CSV / Excel / PNG / "Copy markdown". These helpers scope the existing
// pipeline to a single section so authors / viewers can pull just the
// content they need (e.g., "give me the REGIONAL BREAKDOWN table for
// my own analysis"). PNG and Excel still rely on the lazy chunks and
// therefore inherit the cycle-19 sandbox-blocked treatment — the caller
// decides whether to render the option at all.

/** Per-section Excel — one workbook with every pipe-table found in just
 *  this section's body, plus a Provenance sheet noting which section
 *  was exported. Returns false when the section has no pipe-table. */
export async function exportSingleSectionAsExcel(
    body: string,
    ctx: { sectionTitle: string; spaceId?: string; spaceLabel?: string; sourceLabel?: string; generatedAt?: number }
): Promise<boolean> {
    const tables = extractAllPipeTables(body);
    if (tables.length === 0) return false;
    const xlsx = await loadXlsx();
    const wb = xlsx.utils.book_new();
    const taken = new Set<string>();
    for (const t of tables) {
        const aoa: string[][] = [t.headers, ...t.rows];
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        const sheetName = sanitizeSheetName(t.sectionTitle || ctx.sectionTitle || "Table", taken);
        xlsx.utils.book_append_sheet(wb, ws, sheetName);
    }
    const generatedIso = new Date(ctx.generatedAt ?? Date.now()).toISOString();
    const provRows: string[][] = [
        ["Field", "Value"],
        ["Generated by", "PulsePlay AI"],
        ["Exported (UTC)", generatedIso],
        ["Section", ctx.sectionTitle || "(unnamed)"],
        ["Space ID", ctx.spaceId || "(none)"],
        ["Space label", ctx.spaceLabel || "(none)"],
        ["Source / profile", ctx.sourceLabel || "default"],
        ["Tables exported", String(tables.length)],
    ];
    const provWs = xlsx.utils.aoa_to_sheet(provRows);
    xlsx.utils.book_append_sheet(wb, provWs, sanitizeSheetName("Provenance", taken));
    const arrBuf = xlsx.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([arrBuf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const safeTitle = (ctx.sectionTitle || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stem = buildInsightsExportStem(ctx.spaceId, ctx.generatedAt ? new Date(ctx.generatedAt) : new Date());
    triggerBlobDownload(blob, `${stem}-${safeTitle}.xlsx`);
    return true;
}

export function buildRawDataSheetRows(queryResult: RawQueryResult): unknown[][] {
    const columns = Array.isArray(queryResult.columns) ? queryResult.columns : [];
    const rows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
    return [columns, ...rows];
}

export async function exportSectionRawDataAsExcel(
    queryResult: RawQueryResult,
    ctx: {
        sectionTitle: string;
        spaceId?: string;
        spaceLabel?: string;
        sourceLabel?: string;
        generatedAt?: number;
        reusedFromTitle?: string | null;
    }
): Promise<boolean> {
    if (!queryResult || !Array.isArray(queryResult.columns) || queryResult.columns.length === 0) return false;
    const xlsx = await loadXlsx();
    const wb = xlsx.utils.book_new();
    const taken = new Set<string>();
    const dataWs = xlsx.utils.aoa_to_sheet(buildRawDataSheetRows(queryResult));
    xlsx.utils.book_append_sheet(wb, dataWs, sanitizeSheetName(ctx.sectionTitle || "Raw data", taken));

    const generatedIso = new Date(ctx.generatedAt ?? Date.now()).toISOString();
    const provRows: string[][] = [
        ["Field", "Value"],
        ["Generated by", "PulsePlay"],
        ["Exported (UTC)", generatedIso],
        ["Section", ctx.sectionTitle || "(unnamed)"],
        ["Raw data source", ctx.reusedFromTitle ? `Reused from ${ctx.reusedFromTitle}` : "Section query result"],
        ["Space ID", ctx.spaceId || "(none)"],
        ["Space label", ctx.spaceLabel || "(none)"],
        ["Source / profile", ctx.sourceLabel || "default"],
        ["Rows exported", String(queryResult.rows?.length ?? 0)],
    ];
    const provWs = xlsx.utils.aoa_to_sheet(provRows);
    xlsx.utils.book_append_sheet(wb, provWs, sanitizeSheetName("Provenance", taken));
    const arrBuf = xlsx.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([arrBuf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const safeTitle = (ctx.sectionTitle || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stem = buildInsightsExportStem(ctx.spaceId, ctx.generatedAt ? new Date(ctx.generatedAt) : new Date());
    triggerBlobDownload(blob, `${stem}-${safeTitle}-raw-data.xlsx`);
    return true;
}

/** Per-section PNG — screenshot a specific DOM node (the section card)
 *  rather than the whole Insights container. Same lazy-chunk gate as
 *  the global PNG export. */
export async function exportSingleSectionAsPng(
    node: HTMLElement | null,
    ctx: { sectionTitle: string; spaceId?: string; generatedAt?: number }
): Promise<boolean> {
    if (!node) return false;
    const html2canvas = await loadHtml2Canvas();
    let bg: string | null = null;
    try {
        const cs = window.getComputedStyle(node);
        bg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : null;
        if (!bg) {
            const parentBg = window.getComputedStyle(node.parentElement || node).backgroundColor;
            bg = parentBg && parentBg !== "rgba(0, 0, 0, 0)" ? parentBg : "#ffffff";
        }
    } catch { bg = "#ffffff"; }
    const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: bg,
        useCORS: true,
        logging: false,
        ignoreElements: (el: Element) => el.classList?.contains("gn-export-skip") ?? false,
    });
    const dataUrl = canvas.toDataURL("image/png");
    const byteString = atob(dataUrl.split(",")[1]);
    const buf = new ArrayBuffer(byteString.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < byteString.length; i++) view[i] = byteString.charCodeAt(i);
    const blob = new Blob([view], { type: "image/png" });
    const safeTitle = (ctx.sectionTitle || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stem = buildInsightsExportStem(ctx.spaceId, ctx.generatedAt ? new Date(ctx.generatedAt) : new Date());
    triggerBlobDownload(blob, `${stem}-${safeTitle}.png`);
    return true;
}

/** Copy a section's body markdown to the clipboard, prefixed with a header
 *  line so the destination doc has provenance. Returns true when the write
 *  succeeded (best-effort: clipboard may be blocked in some hosts). */
export async function copySectionAsMarkdown(
    body: string,
    ctx: { sectionTitle: string; sourceLabel?: string; generatedAt?: number }
): Promise<boolean> {
    const generatedIso = new Date(ctx.generatedAt ?? Date.now()).toISOString();
    const header = `## ${ctx.sectionTitle || "Untitled section"}\n\n` +
        `_Generated by PulsePlay AI · ` +
        `Source: ${ctx.sourceLabel || "default"} · ${generatedIso}_\n\n`;
    const md = header + (body || "").trim() + "\n";
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(md);
            return true;
        }
    } catch { /* fall through to legacy path */ }
    // Legacy fallback for hosts that block the clipboard API.
    try {
        const ta = document.createElement("textarea");
        ta.value = md;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

// ── Internal: blob → download. Mirrors `downloadAs` but for binary. ───

function triggerBlobDownload(blob: Blob, filename: string): void {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
        console.warn("[insightsExporters] download failed:", e);
    }
}

// Re-export so callers only have to import from one module.
export { downloadAs, rowsToCsv, buildExportFooterRow };
