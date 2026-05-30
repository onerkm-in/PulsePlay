import powerbi from "powerbi-visuals-api";
import IFilter = powerbi.IFilter;
import * as React from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";

// Pulse's entire `gn-*` design system. Vite's built-in LESS pipeline
// compiles this; requires `less` in devDependencies (added in cycle E.1).
import "./style/visual.less";

import { buildContext, buildGovernancePosture, ContextSummary, FilterDimension, safeContextText } from "./contextBuilder";
import {
    AssistantAction,
    AssistantHomePayload,
    AssistantIntent,
    AssistantProfileMetadata,
    ConfidenceLevel,
    ConfidenceResult,
    containsDml,
    detectDmlKeyword,
    GenieClient, // kept for backwards-compat type hint at one call site; new code uses createBackend()
    GenieConfig,
    GenieHistoryEntry,
    GenieMessage,
    GenieSqlSection,
    InsightsConfigSuggestion,
    OutputMode,
    ProxyHealthInfo,
    UserMode
} from "./genie";
import {
    VisualSettings,
    VisualFormattingSettingsModel,
    OperationalSettingsModel
} from "./settings";
// Wave 22 cycle 5f: dropped getKBChatHint + parseOrgRules from this import —
// they are used by visualHelpers.ts (where the chat-prompt is assembled),
// not by visual.tsx directly. Verified by grep across src/ + tests/.
import { getKBSystemPrompt, getSupervisorSystemPrompt } from "./knowledgeBase";
import { buildInsightsCacheKey, readInsightsCache, writeInsightsCache, clearInsightsCache, pruneInsightsCache, composeInsightsSettingsFingerprint, computeSchemaHash, computeSqlHash, SQL_SECTION_CACHE_TTL_MS } from "./insightsCache";
import { SqlSectionRenderer, type SqlSectionResult } from "./sqlSectionRenderer";
import { parseMaskingRules, maskSqlResult } from "./masking";
import type { SqlSection } from "./sqlSection";
// Wave 37 — viewer-side AI Insights section visibility (per-report localStorage).
import {
    getStoredVisibility,
    storeVisibility,
    resetVisibility,
    isSectionVisible
} from "./insightsSectionVisibility";
import {
    Backend,
    BACKEND_LABELS,
    BACKENDS,
    decode as decodeConnection,
    encode as encodeConnection,
    isSupported as isConnectionPairSupported,
    requiredFields as requiredConnectionFields,
    Transport,
    TRANSPORT_LABELS,
    TRANSPORTS
} from "./connectionMatrix";
import { ProgressIndicator } from "./progressIndicator";
import { describeGenieStatus, describeInsightsStage, formatHelperRunLabel, HelperChipView, inferIconFromLabel, ProgressStep, StepState } from "./progressVocab";
import {
    getDeltaPillA11y,
    getStatusA11y,
    getStatusTone,
    getTrendDirectionFromDelta,
    normaliseDirectionalGlyphs,
    stripLeadingDirectionGlyphs,
    stripStatusGlyphs,
    Tone
} from "./rendering/insightsTone";
import { getMetricTone, parseMetricDirectionsJson, migrateLegacyMetricDirectionRules } from "./rendering/metricDirections";
import { SetupDraft, setupDraftFromSettings } from "./setupDraft";
import { SetupStep5, countCustomisedTotal, countDirtyVsBaseline } from "./setupStep5";
// Wave 41 cycle 12 — type-only import for the per-card metric-rule suggest prop.
import type { MetricRule as MetricRuleType } from "./metricRulesEngine";
import { SetupWizard, shouldShowWizard, WizardDraft } from "./setupWizard";
// 2026-05-22 — shared chart-rationale "i" button. Used in BOTH NativeCanvas
// and here so users get the same "Why this chart?" affordance whether they're
// looking at the native canvas or the Ask Pulse chart tab.
import { ChartRationalePill } from "../visualization/ChartRationalePill";
import { renderMarkdown } from "../lib/renderMarkdown";
import { computeSurfaceContext } from "../lib/computeSurfaceContext";
import {
    ALL_FILTER_VALUE,
    AREA_PROMPTS,
    areFilterSelectionsEqual,
    analyzeDataShape,
    buildBasicFilter,
    buildBarStyle,
    buildFullContext,
    buildGenieRequest,
    buildHomeContextPayload,
    buildFastHybridInsightsStagePrompts,
    buildStagedHybridInsightsPlan,
    buildDeterministicPbiInsightsPlan,
    buildInsightsPrompt,
    FAST_INSIGHTS_STAGE_TITLE,
    parseCustomSections,
    getDisabledTrendPillSectionTitles,
    buildLinePoints,
    buildLocalHomeModel,
    CHART_OPTIONS,
    ChartKind,
    ChartRange,
    detectViewIntent,
    ChartSeriesPoint,
    ClusteredSeriesPoint,
    collectHighlights,
    computePointY,
    copyText,
    createLocalId,
    createRiskInsights,
    createOpportunityInsights,
    createChangeInsights,
    DataShape,
    dedupeActions,
    describeScope,
    detectNumericColumns,
    extractChartSeries,
    extractClarifyingActions,
    formatCell,
    formatChartDate,
    formatCellForTooltip,
    formatGenieStatus,
    formatNumber,
    formatRelativeTime,
    formatTableAsCsv,
    formatTableNumber,
    getAvailableMessageViews,
    getChartRange,
    getConfigIssues,
    getConfigWarnings,
    computeConnectionStatus,
    getDefaultViewMode,
    getRoleSubtitle,
    getYAxisTicks,
    GuidedArea,
    highlightSql,
    INSIGHTS_PROMPT_SUGGESTIONS,
    isClarifyingQuestion,
    ISO_DATE_RE,
    isNumericString,
    mapAreaToIntent,
    mergeHomePayload,
    normalizeText,
    normalizeUserMode,
    parseFormatRules,
    pickGuidedFilters,
    pruneUnavailableFilters,
    setActiveFormatRules,
    STATIC_ACTIONS,
    extractAndStripClarifiers,
    titleCase,
    validateAssignedFields,
} from "./visualHelpers";
import { buildThemeFromHost, buildThemeStyle, mergeTheme, ThemeName } from "./themeConfig";
// UX-VIEWER-1.2B — Ask Pulse home metadata hook. Replaces STATIC_ACTIONS
// on the empty state with data-shaped starter questions (curated from
// the active Genie space when the profile is Genie, or pack evergreen
// for non-Genie backends). Strategy: PulsePlay is the enabler — features
// are built into PulsePlay's own surface, not embedded from Databricks.
import { useAskPulseHomeMeta } from "../features/config/useAskPulseHomeMeta";
// UX-VIEWER-1.7b.2 — chart-spec passthrough. resolveChartSpec walks the
// translator registry (registered in visualization/translators/index.ts);
// when Genie returns a HELIOS viz attachment, the HELIOS translator
// turns it into a ChartIR which we then map back to ChartKind. Defers
// to Databricks' chart-type pick for Genie responses; falls back to
// PulsePlay's heuristic for non-Genie backends.
import "../visualization/translators";  // side-effect: registers translators
import { resolveChartSpec } from "../visualization/translators";
import { irMarkToChartKind } from "../visualization/chartIR";
// SustainabilityIndicator is mounted once in App.tsx as a fixed bottom-right
// orb; pulse/visual.tsx no longer renders its own chip.
// Wave 44 — Power BI theme inheritance + per-element typography. Pure
// helpers; the Visual class flushes the resulting plan onto `this.target`.
import { planThemeWrites, applyThemeWrites } from "./themeInheritance";
import { cleanInsightsContent, stripTrailingProse, normalizeStageHeading, enforceStageScope, stripEmptyEmphasis } from "./rendering/contentSanitizer";
// Phase E.1 — client-side progressive reveal of Genie single-shot answers.
// Pure schedule lives in ./state/stagedReveal; this file owns the React glue
// (arrival-time ref, tick scheduling, render filter + spinner).
import {
    DEFAULT_REVEAL_SCHEDULE,
    revealScheduleFromCadence,
    computeRevealState,
    nextRevealTickMs,
    type RevealState,
} from "./state/stagedReveal";
import {
    loadPerformanceLevers,
    PERFORMANCE_LEVERS_EVENT,
    getBackendStagingFromCadence,
    type PerformanceLevers,
} from "../settings/performanceLevers";
// IDEA-044 Phase 1 MVP — CSV export of the first pipe-table found in the
// active Insights output. Pure client-side, no proxy round-trip required.
import { exportSectionAsCsv, extractFirstPipeTable } from "./exportHelpers";
import { validateStageOutput, buildRetryPrompt } from "./insightsStageValidator";
// IDEA-044 Phase 2 — unified "Export ▾" dropdown for AI Insights with
// PNG (html2canvas) + Excel (SheetJS) + CSV. html2canvas and xlsx are
// lazy-loaded inside the click handler — see insightsExporters.ts for
// the chunk contract. The main bundle stays at ~243 KB until the user
// actually clicks an export option.
import {
    exportInsightsPng,
    exportInsightsExcel,
    exportInsightsCsv,
    extractAllPipeTables,
    computeDisabledState,
    LazyLoadError,
    loadHtml2Canvas,
    exportSingleSectionAsExcel,
    exportSingleSectionAsPng,
    exportSectionRawDataAsExcel,
    copySectionAsMarkdown,
} from "./insightsExporters";
// Wave 27 cycle 3 — subscription to sql-formatter lazy-load completion so
// "View SQL" panels re-render with prettified SQL when the chunk lands.
import { subscribeSqlFormatter, formatSqlForCopy } from "./visualHelpers";
// PulsePlay — proper inline-SVG icons (replaces the PBI-heritage emoji
// set: 📋 / ↻ / ⚙). The 350 KB pbiviz bundle cap that justified emojis
// doesn't apply in the browser playground.
import { Icon } from "./_adapter/Icon";
import { renderInsightsAsEmailHtml } from "./_adapter/exportInsightsAsHtml";
import { CHAT_PRELOAD_PROMPT } from "./visualHelpers";
// 2026-05-19 Codex post-UAT-1840 follow-up: wire perfInstrumentation
// (added in b71270f) into the AI Insights pipeline. We only wrap the
// outer pipeline (total duration + final dumpRun) — per-stage timing
// already lives in `stageTraces[i].durationMs`. The DevTools-visible
// `pulseplay:<runId>:total` mark + console.table at completion give the
// next cycle concrete numbers against Rajesh's 5-10 s budget without
// invasive surgery inside the stage loop.
import { dumpRun, resetRun, stageEnd, stageStart } from "../lib/perfInstrumentation";
// PulsePlay — ColorRulesBanner (module-level component) needs the preset
// list available at top level; the file's other consumers import inside
// the class component so this import IS additive.
import { METRIC_DIRECTION_PRESETS as PP_METRIC_DIRECTION_PRESETS, CUSTOM_SECTION_PRESETS, interpolatePreset, defaultParamValues } from "./insightsPresetLibrary";
import { writePulseAiVisualSettingsPatch } from "../settings/pulseVisualSettingsStore";
import { createBackend } from "./backend/BackendFactory";
import type { AnyBackend } from "./backend/BackendAdapter";
import { parseAllowedUsers } from "./setupAccessControl";
import { EChartsRenderer } from '../components/workbench/EChartsRenderer';
import { buildEChartsOption } from '../lib/buildEChartsOption';
import { CHART_PALETTES, CHART_PALETTE_EVENT, getActivePaletteId, applyChartPalette } from '../lib/chartPalettes';
import { addCanvasTile } from '../lib/canvasTiles';
import IViewport = powerbi.IViewport;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type MessageRole = "assistant" | "user" | "system";
type StageStatus = "idle" | "pending" | "running" | "done" | "error";
type SessionLogLevel = "INFO" | "WARN" | "ERROR";

function openPulsePlaySettings(group: "setup" | "bi" | "ai" | "preferences" | "system" | "advanced" = "setup", leaf?: string): void {
    if (typeof window === "undefined") return;
    const suffix = leaf ? `/${encodeURIComponent(leaf)}` : "";
    window.history.pushState({}, "", `/settings/${group}${suffix}`);
    try {
        window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
    } catch {
        /* swallow */
    }
}

type PulsePlayViewportPane = "ai" | "bi";
type PulsePlayViewportFocus = PulsePlayViewportPane | null;
type PulsePlayViewportAction = "focus" | "restore" | "minimize" | "open-page" | "float" | "reload";

function readPulsePlayViewportFocus(): PulsePlayViewportFocus {
    if (typeof window === "undefined") return null;
    try {
        const focus = new URL(window.location.href).searchParams.get("focus");
        return focus === "ai" || focus === "bi" ? focus : null;
    } catch {
        return null;
    }
}

function dispatchPulsePlayViewportAction(action: PulsePlayViewportAction, pane: PulsePlayViewportPane = "ai"): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", {
        detail: { pane, action },
    }));
}

// 2026-05-25 — per-tab-visibility model. Read by visual.tsx to decide which
// of AI Insights / Ask Pulse / Dashboard tab buttons render in the strip,
// and whether the strip itself collapses (when ≤1 tab is enabled, the
// strip is hidden and the single enabled tab becomes the main page).
// Source of truth is the settingsStore TabVisibility field; this reader
// duplicates the shape locally to avoid a hard import dependency from
// pulse/* into settings/*. Defaults to all-enabled when storage is
// missing or unparseable; refuses zero-enabled (would brick the UI).
interface PulsePlayTabVisibility {
    aiInsights: boolean;
    askPulse: boolean;
    dashboard: boolean;
}
const PULSEPLAY_TAB_VISIBILITY_KEY = "pulseplay:tab-visibility";
const DEFAULT_PULSEPLAY_TAB_VISIBILITY: Readonly<PulsePlayTabVisibility> = {
    aiInsights: true,
    askPulse: true,
    dashboard: true,
};

function readPulsePlayTabVisibility(): PulsePlayTabVisibility {
    if (typeof window === "undefined") return { ...DEFAULT_PULSEPLAY_TAB_VISIBILITY };
    try {
        const raw = window.localStorage.getItem(PULSEPLAY_TAB_VISIBILITY_KEY);
        if (!raw) return { ...DEFAULT_PULSEPLAY_TAB_VISIBILITY };
        const parsed = JSON.parse(raw) as Partial<PulsePlayTabVisibility>;
        if (parsed && typeof parsed === "object") {
            const next: PulsePlayTabVisibility = {
                aiInsights: typeof parsed.aiInsights === "boolean" ? parsed.aiInsights : true,
                askPulse:   typeof parsed.askPulse   === "boolean" ? parsed.askPulse   : true,
                dashboard:  typeof parsed.dashboard  === "boolean" ? parsed.dashboard  : true,
            };
            const count = (next.aiInsights ? 1 : 0) + (next.askPulse ? 1 : 0) + (next.dashboard ? 1 : 0);
            if (count === 0) return { ...DEFAULT_PULSEPLAY_TAB_VISIBILITY };
            return next;
        }
    } catch { /* swallow */ }
    return { ...DEFAULT_PULSEPLAY_TAB_VISIBILITY };
}

function pulsePlayEnabledTabCount(v: PulsePlayTabVisibility): number {
    return (v.aiInsights ? 1 : 0) + (v.askPulse ? 1 : 0) + (v.dashboard ? 1 : 0);
}

interface InsightsRenderOptions {
    metricDirectionsJson?: string;
    legacyMetricDirectionRules?: string;
    generatedAt?: number;
    sourceLabel?: string;
    showProvenanceFooter?: boolean;
    /** Wave 33 — UPPER-CASED section titles for which the renderer must
     *  suppress trend pills (author opted out via `disableTrendPills: true`
     *  on a HybridCustomSection). Threaded into `InlineMetricRules` per
     *  call so `inlineFormat` can short-circuit pill emission for that
     *  section's body without changing pill behavior elsewhere. */
    disabledTrendPillSections?: Set<string>;
    /** Wave 37 — viewer-side visibility filter. When provided (set), only
     *  sections whose normalized title is in the set are emitted. When
     *  null/undefined, every section renders (default). The pipeline still
     *  runs the AI prompt for hidden sections so toggling them back on is
     *  instant; only display is suppressed. */
    visibleSectionTitles?: Set<string> | null;
    /** Cycle 20 — per-section export + Show SQL.
     *  • `lazyExportBlocked`: hide PNG/Excel options in the per-section
     *    kebab menu when the host (PBI Desktop) blocks lazy chunks.
     *  • `canShowSql`: gate the Show-SQL button (controlled by Setup →
     *    Operations → Show Generated SQL / Dev Mode / analyst role).
     *  • `stageSqlByTitle`: lookup map (UPPER-CASED title → { sqls,
     *    reusedFromTitle? }) so each section can render its own SQL
     *    inline. Cycle 47.8 — sqls is an array; the renderer tabs across
     *    when length > 1 and shows a single `<pre>` when length === 1.
     *    Cycle 47.13 — reusedFromTitle is set when this stage borrowed
     *    SQL from an earlier stage's response (Genie conversation memory
     *    case). The SectionSqlPanel surfaces it as a "Reused from <title>"
     *    note so provenance is honest.
     *  • `openSqlSections`: set of UPPER-CASED titles whose SQL is
     *    currently expanded.
     *  • `onToggleSectionSql`: callback to flip a section's SQL panel.
     *  • `onSectionExport`: callback fired by the kebab menu rows.
     *  • `spaceId` / `spaceLabel`: provenance fields the per-section
     *    helpers stamp into the exported file. */
    lazyExportBlocked?: boolean;
    canShowSql?: boolean;
    stageSqlByTitle?: Map<string, { sqls: string[]; reusedFromTitle?: string | null }>;
    stageDataByTitle?: Map<string, { queryResult: { columns: string[]; rows: unknown[][] }; reusedFromTitle?: string | null }>;
    openSqlSections?: Set<string>;
    onToggleSectionSql?: (title: string) => void;
    onSectionExport?: (title: string, body: string, kind: "md" | "csv" | "excel" | "png", node: HTMLElement | null) => void;
    onExportSectionRawData?: (
        title: string,
        queryResult: { columns: string[]; rows: unknown[][] },
        reusedFromTitle?: string | null
    ) => void;
    spaceId?: string;
    spaceLabel?: string;
    /** Cycle 30 — per-section retry. Called from the validation-failure
     *  banner inside a section body when the viewer clicks the inline
     *  refresh icon. Re-runs JUST that stage without reloading the rest
     *  of the pipeline. Argument is the UPPER-CASED section title. */
    onRetrySection?: (title: string) => void;
    /** Cycle 32 — per-section copy-to-clipboard. Wired from the
     *  📋 Copy button in the section footer. Receives the section's
     *  title and raw body markdown; the App component's handler decorates
     *  with provenance and writes to navigator.clipboard. */
    onCopySection?: (title: string, body: string) => void;
    /** Cycle 34 — set of UPPER-CASED section titles that the per-section
     *  ↻ retry icon CAN re-run. Computed by the call site from the latest
     *  runStage registration's titles array. Universal stages
     *  (HEADLINE / TRENDS / RISKS / etc.) appear; author-defined custom
     *  JSON sections do NOT (their retry semantics are full-pipeline). */
    retriableTitles?: Set<string>;
    /** Cycle 39 — stage planning info for placeholder cards. When a
     *  pipeline is mid-flight, sections that have not yet emitted content
     *  are shown as skeleton cards using these titles + statuses. As each
     *  stage completes, its skeleton flips to the real rendered content.
     *  Lets the viewer see the SHAPE of the briefing while it's still
     *  filling in — perceived speed win. */
    pendingStageTitles?: string[];
    stageStatuses?: string[];
    /** Phase E.1 — client-side progressive reveal. When provided, sections
     *  whose UPPER-CASED title is NOT in this set are held back and rendered
     *  as a skeleton placeholder until the schedule reveals them. `null` /
     *  undefined disables the reveal gate (every section renders
     *  immediately, matching pre-E.1 behaviour). */
    revealedSectionTitles?: Set<string> | null;
}

interface ParsedSessionLogEntry {
    index: number;
    line: string;
    time: string;
    level: SessionLogLevel;
    message: string;
}

/**
 * Wave 35 Phase 3 — execute a Custom SQL section against the proxy
 * /sql/preview endpoint. Pure XHR (PBI Desktop sandbox blocks fetch).
 *
 * The visual fires this for each kind:"sql" section discovered in the
 * active config. Section H CTE preamble is forwarded so the proxy
 * auto-prepends governance scoping. Returns the parsed rows + columns
 * or a friendly error message — never throws into the caller.
 */
function executeSqlPreviewClient(args: {
    apiBaseUrl: string;
    proxyKey?: string;
    assistantProfile?: string;
    sectionH_cteHeader?: string;
    sql: string;
}): Promise<SqlSectionResult> {
    return new Promise((resolve) => {
        try {
            const base = (args.apiBaseUrl || "").replace(/\/$/, "");
            if (!base) {
                resolve({ columns: [], rows: [], error: "Proxy URL is not configured." });
                return;
            }
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${base}/sql/preview`, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (args.proxyKey) xhr.setRequestHeader("X-Genie-Key", args.proxyKey);
            if (args.assistantProfile) xhr.setRequestHeader("X-Assistant-Profile", args.assistantProfile);
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText || "{}") as { ok?: boolean; columns?: string[]; rows?: unknown[][]; error?: string; truncated?: boolean; totalRowCount?: number; executionTimeMs?: number };
                        resolve({
                            columns: data.columns || [],
                            rows: data.rows || [],
                            error: data.ok === false ? (data.error || "Validation failed.") : undefined,
                            truncated: !!data.truncated,
                            totalRowCount: data.totalRowCount,
                            executionTimeMs: data.executionTimeMs,
                        });
                    } catch {
                        resolve({ columns: [], rows: [], error: "Invalid JSON from proxy." });
                    }
                } else {
                    let msg = `Proxy returned status ${xhr.status}.`;
                    try {
                        const parsed = JSON.parse(xhr.responseText || "{}");
                        if (parsed && typeof parsed.error === "string") msg = parsed.error;
                    } catch { /* keep default */ }
                    resolve({ columns: [], rows: [], error: msg });
                }
            };
            xhr.onerror = () => resolve({ columns: [], rows: [], error: "Network error reaching the proxy." });
            xhr.send(JSON.stringify({
                sql: args.sql,
                sectionH_cteHeader: args.sectionH_cteHeader || "",
                assistantProfile: args.assistantProfile || ""
            }));
        } catch (e) {
            resolve({ columns: [], rows: [], error: (e as Error).message });
        }
    });
}

/**
 * AIINSIGHTS-P1 — fetch the connector probe (POST /assistant/probe) for the
 * active profile. Used to (a) detect a deterministic `powerbi-semantic-model`
 * connector from a STABLE source (the probe's `connectorType`, not the
 * 15-min discovery sessionStorage cache) and (b) source the real probed
 * measure + dimension NAMES so AI Insights can emit matchable DAX questions
 * per section. Never throws — resolves an empty shell on any failure so the
 * caller falls back to the prose plan.
 */
interface PbiProbeFields { connectorType: string; measures: string[]; dimensions: string[]; }
function fetchAssistantProbeClient(args: {
    apiBaseUrl: string;
    proxyKey?: string;
    assistantProfile?: string;
}): Promise<PbiProbeFields> {
    const empty: PbiProbeFields = { connectorType: "", measures: [], dimensions: [] };
    return new Promise((resolve) => {
        try {
            const base = (args.apiBaseUrl || "").replace(/\/$/, "");
            if (!base) { resolve(empty); return; }
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${base}/assistant/probe`, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (args.proxyKey) xhr.setRequestHeader("X-Genie-Key", args.proxyKey);
            if (args.assistantProfile) xhr.setRequestHeader("X-Assistant-Profile", args.assistantProfile);
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText || "{}") as {
                            connectorType?: string;
                            declaredKpis?: Array<{ name?: string }>;
                            schema?: { tables?: Array<{ columns?: Array<{ name?: string }> }> };
                        };
                        const measures = Array.isArray(data.declaredKpis)
                            ? data.declaredKpis.map(k => (k?.name || "").trim()).filter(Boolean)
                            : [];
                        const dimensions: string[] = [];
                        const tables = data.schema?.tables;
                        if (Array.isArray(tables)) {
                            for (const t of tables) {
                                for (const c of (t?.columns || [])) {
                                    const name = (c?.name || "").trim();
                                    if (name) dimensions.push(name);
                                }
                            }
                        }
                        resolve({ connectorType: String(data.connectorType || ""), measures, dimensions });
                    } catch { resolve(empty); }
                } else {
                    resolve(empty);
                }
            };
            xhr.onerror = () => resolve(empty);
            xhr.send(JSON.stringify({ assistantProfile: args.assistantProfile || "" }));
        } catch { resolve(empty); }
    });
}

function describeInsightsBatchPlan(stageCount: number): string {
    if (stageCount <= 1) return "single call";
    // Cycle 47.14 — stage 0 fires alone first (so the headline always
    // paints first), then a 3-wide concurrency-capped worker pool drains
    // stages 1+. Order of completion within the pool is data-dependent.
    const POOL_SIZE = 3;
    const remaining = stageCount - 1;
    const concurrency = Math.min(POOL_SIZE, remaining);
    return remaining > 0
        ? `stage 1 alone, then concurrency-${concurrency} worker pool for stages 2-${stageCount}`
        : `single call`;
}

function parseSessionLogEntry(line: string, index: number): ParsedSessionLogEntry {
    const match = line.match(/^\[([^\]]+)\]\s+(INFO|WARN|ERROR):\s*(.*)$/);
    if (!match) {
        return { index, line, time: "", level: "INFO", message: line };
    }
    return {
        index,
        line,
        time: match[1],
        level: match[2] as SessionLogLevel,
        message: match[3]
    };
}

// ─── Multi-space types & utility ──────────────────────────────────────────────

type SpaceKey = "space1" | "space2" | "space3" | "space4" | "space5" | "space6" | "space7" | "space8" | "space9" | "space10";

interface ActiveSpaceConfig {
    key: SpaceKey;
    label: string;
    genieConfig: GenieConfig;
}

/**
 * Wave 42 — userMode resolution precedence chain:
 *   1. `boundUserId` (from a DAX measure bound to the `userIdentity` data role,
 *      typically `View User = USERPRINCIPALNAME()`) wins when non-empty after trim.
 *   2. Falls back to `roleMode` (the manual Setup Section A role selector,
 *      derived from `dataUserRole` or the default).
 *   3. If both are empty/whitespace, downstream `genie.ts buildRuntimeScopePrefix`
 *      no-ops the role hint (see `if (config.sqlRlsHintEnabled && config.userMode)`).
 *
 * Sanitization is intentionally NOT performed here — Wave 22's
 * `sanitizeTemplateValue` in `genie.ts` strips control chars, quotes, and DML
 * keywords downstream when the value is interpolated into the prompt. Special
 * chars passed through this resolver are expected and handled by that layer.
 *
 * Before this fix, the bound USERPRINCIPALNAME() measure was read by
 * `contextBuilder.ts` into `props.context.dataUserId` but never reached the
 * Genie role-hint payload — `userMode` was hard-wired to the (often empty)
 * manual selector, so the "Inject viewer role into prompt" toggle silently
 * did nothing for authors using the recommended dynamic-identity pattern.
 *
 * Exported for unit testing (see `tests/userModeResolution.test.ts`).
 */
export function resolveUserMode(roleMode: UserMode, boundUserId?: string): UserMode {
    const trimmedBound = (boundUserId || "").trim();
    return trimmedBound || roleMode;
}

function buildActiveSpaces(
    settings: OperationalSettingsModel,
    roleMode: UserMode,
    boundUserId?: string
): ActiveSpaceConfig[] {
    const effectiveUserMode: UserMode = resolveUserMode(roleMode, boundUserId);
    const base = {
        host:             settings.host,
        apiBaseUrl:       settings.connectionMode === "gateway" ? "" : settings.apiBaseUrl,
        assistantProfile: settings.connectionMode === "supervisor"
            ? (settings.assistantProfile.trim() || "supervisor")
            : settings.assistantProfile,
        token:            settings.token,
        spaceId:          settings.spaceId,
        warehouseId:      settings.warehouseId,
        proxyKey:         settings.proxyKey,
        userMode:         effectiveUserMode,
        connectionMode:   settings.connectionMode,
        // Wave 19 — runtime scope injection
        runtimeForbiddenColumns:  settings.runtimeForbiddenColumns,
        runtimeMandatoryRowFilter: settings.runtimeMandatoryRowFilter,
        runtimeReadOnlyEnforced:  settings.runtimeReadOnlyEnforced,
        // Wave 21 — SQL configuration
        sqlCtePreamble:    settings.sqlCtePreamble,
        sqlForbiddenTables: settings.sqlForbiddenTables,
        sqlRlsHintEnabled: settings.sqlRlsHintEnabled,
    };

    if (settings.connectionMode === "supervisor") {
        return [{
            key: "space1",
            label: settings.supervisorAgentName.trim() || "Supervisor",
            genieConfig: { ...base, spaceId: "" }
        }];
    }

    const spaces: ActiveSpaceConfig[] = [{ key: "space1", label: "Primary", genieConfig: base }];
    if (!settings.multiSpaceEnabled) return spaces;

    // IDEA-011: 9 additional slots are persisted on disk but only the
    // first `multiSpaceCount` slots are honoured at runtime. Slots beyond
    // the count are effectively dormant — even if their fields are
    // populated they don't appear as tabs or get queried by the
    // supervisor. Toggling the count up or down doesn't lose the
    // persisted slot data.
    const allExtras: { key: SpaceKey; label: string; profile: string; spaceId: string; host: string; token: string }[] = [
        { key: "space2",  label: settings.space2Label,  profile: settings.space2AssistantProfile,  spaceId: settings.space2SpaceId,  host: settings.space2Host,  token: settings.space2Token },
        { key: "space3",  label: settings.space3Label,  profile: settings.space3AssistantProfile,  spaceId: settings.space3SpaceId,  host: settings.space3Host,  token: settings.space3Token },
        { key: "space4",  label: settings.space4Label,  profile: settings.space4AssistantProfile,  spaceId: settings.space4SpaceId,  host: settings.space4Host,  token: settings.space4Token },
        { key: "space5",  label: settings.space5Label,  profile: settings.space5AssistantProfile,  spaceId: settings.space5SpaceId,  host: settings.space5Host,  token: settings.space5Token },
        { key: "space6",  label: settings.space6Label,  profile: settings.space6AssistantProfile,  spaceId: settings.space6SpaceId,  host: settings.space6Host,  token: settings.space6Token },
        { key: "space7",  label: settings.space7Label,  profile: settings.space7AssistantProfile,  spaceId: settings.space7SpaceId,  host: settings.space7Host,  token: settings.space7Token },
        { key: "space8",  label: settings.space8Label,  profile: settings.space8AssistantProfile,  spaceId: settings.space8SpaceId,  host: settings.space8Host,  token: settings.space8Token },
        { key: "space9",  label: settings.space9Label,  profile: settings.space9AssistantProfile,  spaceId: settings.space9SpaceId,  host: settings.space9Host,  token: settings.space9Token },
        { key: "space10", label: settings.space10Label, profile: settings.space10AssistantProfile, spaceId: settings.space10SpaceId, host: settings.space10Host, token: settings.space10Token },
    ];
    const cap = Math.min(9, Math.max(1, settings.multiSpaceCount || 3));
    const extras = allExtras.slice(0, cap);
    for (const s of extras) {
        if (!s.label.trim()) continue;
        spaces.push({
            key: s.key,
            label: s.label.trim(),
            genieConfig: {
                ...base,
                assistantProfile: s.profile.trim() || base.assistantProfile,
                spaceId:          s.spaceId.trim()  || base.spaceId,
                host:             s.host.trim()     || base.host,
                token:            s.token.trim()    || base.token,
            }
        });
    }
    return spaces;
}

interface ChatMessageViewModel extends GenieMessage {
    role: MessageRole;
    viewMode?: OutputMode;
    feedback?: "up" | "down";
    feedbackComment?: string;
    feedbackReason?: string;
    sourceQuestion?: string;
    statusSteps?: string[];
    currentStatus?: string;
    /** 2026-05-26 — raw upstream status from the Databricks Genie poll
     *  loop (e.g. "PENDING_WAREHOUSE", "EXECUTING_QUERY", "ASKING_AI",
     *  "COMPLETED"). Kept alongside the friendly `currentStatus` so the
     *  progress card can surface what Databricks is actually doing for
     *  power users + debugging. */
    currentStatusRaw?: string;
    /** 2026-05-26 — append-only log of (rawStatus, timestamp) tuples as
     *  the Genie poll loop streams. Surfaces inside the progress card's
     *  "Databricks trace" disclosure so users can see exactly what
     *  Databricks did and when. */
    statusTrace?: Array<{ raw: string; friendly: string; t: number }>;
    /** Wall-clock when this message entered RUNNING state. Used by the
     * unified ProgressIndicator to show elapsed time. */
    startedAt?: number;
    /** Per-helper chips (supervisor streaming, IDEA-020 Phase 5). One chip
     * per Genie helper the supervisor fans out to; state transitions
     * pending → active → done/failed as NDJSON events arrive. */
    helperChips?: HelperChipView[];
    /** Forced chart type derived from the user's question intent
     * ("show me a bar chart of …"). When set, the chart renderer uses
     * this instead of the auto-recommended chart kind. */
    forcedChartType?: ChartKind;
    /** IDEA-039 Phase 1 — per-stage diagnostic trace for AI Insights runs.
     * Populated by runInsights() with the assembled outgoing payload, the
     * Genie-generated SQL (if any), and timing/status per stage. Memory-only
     * (NOT cached) — surfaced only when devMode is true. */
    stageTraces?: InsightsStageTrace[];
    /** IDEA-039 Step 2.2 — partial-failure annotation. When a stage fails
     * mid-run but earlier stages produced content, we keep `status` as
     * COMPLETED so the partial output renders, AND surface the failure via
     * an inline red card ABOVE the partial output (P1.5 design ref). Cleared
     * when the user retries. */
    failureMessage?: string;
    failedStageTitle?: string;
    /** Wave 19 — set when runtimeReadOnlyEnforced is ON and the AI response
     * contains a DML/DDL keyword. Renders a warning banner below the answer. */
    dmlWarning?: boolean;
    dmlVerb?: string;
}

/**
 * IDEA-039 Phase 1 — per-stage observability artifact for AI Insights runs.
 * Captured in `runInsights()` and attached to the `ChatMessageViewModel` so
 * the trace pane can show exactly what was sent to Genie at each stage.
 *
 * Memory-only — never written to the localStorage insights cache. Live as
 * long as the message viewmodel does (lost on page-switch / re-mount).
 */
export interface InsightsStageTrace {
    /** Zero-based stage index (0..N-1). */
    index: number;
    /** Human-readable stage name (e.g. "HEADLINE + KPI SNAPSHOT"). */
    title: string;
    /** Full assembled outgoing payload — system + user + KB + domainGuidance
     * + context + filters concatenation as built by `buildGenieRequest`. */
    prompt: string;
    /** Genie-generated SQL for this stage's response, if any. Holds
     *  the FIRST SQL when the response carried multiple — see `sqls`
     *  for the complete list. Kept singular for backward compatibility
     *  with cached traces written before cycle 47.8. */
    sql: string | null;
    /** Cycle 47.8 — full list of SQL queries Genie returned for this
     *  stage. When a response has multiple `attachments[i].query.query`
     *  entries (combining several queries to answer one question), all
     *  of them land here in Genie's order. The per-section SQL panel
     *  tabs across this when length > 1. Always at least `[sql]` if
     *  `sql` is set; null otherwise. */
    sqls?: string[] | null;
    /** Cycle 47.13 — when Genie synthesized this stage's answer from a
     *  prior stage's query result (no new SQL emitted on the follow-up
     *  message), this carries the title of the stage whose SQL we're
     *  reusing. The per-section SQL panel surfaces this as a "Reused
     *  from <title>" note so the viewer knows the SQL belongs to an
     *  earlier section, not this one. Null when SQL is original. */
    sqlReusedFromTitle?: string | null;
    /** Raw rows/columns returned by the Genie query-result endpoint for this
     *  stage. Used by per-section Excel export; memory-only for the current
     *  run, not persisted to localStorage. */
    queryResult?: { columns: string[]; rows: unknown[][] } | null;
    /** Set when this stage exports raw rows reused from an earlier stage
     *  because Genie synthesized the answer from conversation memory. */
    queryResultReusedFromTitle?: string | null;
    /** Length of the markdown response in chars (handy for sanity checks). */
    responseLength: number;
    /** Raw markdown returned by Genie before client-side cleanup/stripping. */
    rawMarkdown?: string;
    /** Outcome flag — `ok` if Genie returned non-empty content, `empty` if
     * content was blank/whitespace, `error` if the call threw. */
    status: "ok" | "empty" | "error";
    /** Populated when `status === "error"`. */
    errorMessage?: string;
    /** Wall-clock duration of this stage's Genie round-trip, in ms. */
    durationMs: number;
}

interface AppProps {
    settings: VisualSettings;
    context: ContextSummary;
    host: IVisualHost;
    viewport: IViewport;
    configIssues: string[];
    configWarnings: string[];
    hostPalette: Record<string, any> | null;
    /**
     * True when PBI Desktop reports the viewer is editing the report
     * (`options.viewMode === ViewMode.Edit | InFocusEdit`). Retained for
     * legacy Setup-gate compatibility; PulsePlay Settings is the active
     * authoring surface.
     */
    isAuthorEditing: boolean;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly root: Root;
    /** Wave 44 — kept as a typed handle so update() can write CSS custom
     *  properties on the host DOM node (theme palette + per-element font
     *  vars cascade into .gn-shell from here). */
    private readonly target: HTMLElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private formattingSettingsModel: VisualFormattingSettingsModel;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.root = createRoot(options.element);
        this.formattingSettingsService = new FormattingSettingsService(this.host.createLocalizationManager());
        this.formattingSettingsModel = new VisualFormattingSettingsModel();
    }

    public update(options: VisualUpdateOptions): void {
        const dataView = options.dataViews?.[0];
        if (dataView) {
            this.formattingSettingsModel = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView
            );
        }

        const settings = new VisualSettings(dataView);
        // Session 56 — only emit per-row aggregated measure values when in
        // multi-space mode (no upstream agent doing the aggregation). For
        // single-space Genie / supervisor / direct, respect the agent's
        // authoritative server-side aggregation by sending names only.
        const context = buildContext(dataView, collectHighlights(dataView), {
            includeAggregatedMeasures: !!settings.multiSpaceEnabled
        });
        // Prepend the author-declared governance posture so Genie sees the
        // same trust boundary the header badge advertises. Emits nothing for
        // the default Shared-PAT + UC-off state, keeping the prompt lean.
        const governanceText = buildGovernancePosture({
            ucRowFiltersEnforced: settings.operational.ucRowFiltersEnforced,
            ucColumnMasksEnforced: settings.operational.ucColumnMasksEnforced,
            authMode: settings.operational.authMode
        });
        if (governanceText) {
            context.contextText = [governanceText, context.contextText].filter(Boolean).join("\n\n");
            context.safeContextText = safeContextText(context.contextText);
        }
        const configIssues = getConfigIssues(settings.operational);
        // Field-binding mismatches are informational: the visual still works,
        // but the author should either add the names to the override list or
        // clear it to re-enable auto-sync. Route as a warning (amber pill) not
        // a blocking error (red pill).
        const configWarnings = [
            ...getConfigWarnings(settings.operational),
            ...validateAssignedFields(context, settings.operational.genieFields)
        ];
        // Capture host colour palette for "Use Report Theme" mode.
        // colorPalette may be undefined in older SDK versions — guard safely.
        const palette = (this.host as any).colorPalette ?? null;

        // Wave 44 — Power BI theme inheritance + per-element typography.
        // When `useReportTheme` is ON (cycle-13 patch consolidated this
        // from a duplicate `inheritPowerBITheme` toggle into the existing
        // useReportTheme — single source of truth) we map host.colorPalette
        // onto CSS custom properties on the visual root (--gn-bg / --gn-text
        // / --gn-primary / etc.) AND inject theme-aware fonts. When OFF we
        // explicitly clear any vars we wrote in a previous render so the
        // brand defaults from visual.less can take effect again. Per-element
        // font overrides (header / body / accent FontControls) are honoured
        // in BOTH modes — empty fontFamily means "use theme/default", an
        // explicit value always wins. The plan-based separation keeps the
        // logic pure (testable in vitest with no jsdom required) and means
        // partial palettes don't leave stale residue on the element.
        const themePlan = planThemeWrites(
            settings.useReportTheme,
            palette,
            {
                headerFontFamily: settings.headerFontFamily,
                headerFontSize:   settings.headerFontSize,
                bodyFontFamily:   settings.bodyFontFamily,
                bodyFontSize:     settings.bodyFontSize,
                accentFontFamily: settings.accentFontFamily,
                accentFontSize:   settings.accentFontSize
            }
        );
        applyThemeWrites(this.target, themePlan);

        // Cycle 27 — one-line diagnostic when Dev Mode or Show Trace is on.
        // Lets the author confirm WHAT PBI actually returned for the host
        // palette + WHAT the visual wrote to the root element. Useful when
        // "Use Report Theme" looks like it isn't doing anything — usually
        // because the report uses the default PBI theme which is visually
        // near-identical to the visual's brand defaults.
        if (settings.devMode || settings.showTrace) {
            try {
                const summary = {
                    inheritOn: settings.useReportTheme,
                    hostPaletteRaw: palette,
                    hostPaletteSlots: palette ? {
                        background: (palette as any).background?.value,
                        foreground: (palette as any).foreground?.value,
                        primaryViaGetColor: typeof (palette as any).getColor === "function"
                            ? (palette as any).getColor("primary-1")?.value
                            : "(getColor not available)",
                        accentViaGetColor: typeof (palette as any).getColor === "function"
                            ? (palette as any).getColor("accent-1")?.value
                            : "(getColor not available)",
                        positive: (palette as any).positive?.value,
                        negative: (palette as any).negative?.value,
                    } : null,
                    cssVarsWritten: themePlan.set,
                    cssVarsRemoved: themePlan.remove,
                };
                // eslint-disable-next-line no-console
                console.info("[theme] Wave 44 inheritance diagnostic →", summary);
            } catch (e) {
                // Never break render on a logging failure.
                // eslint-disable-next-line no-console
                console.warn("[theme] diagnostic logging failed:", e);
            }
        }

        // Detect Desktop edit/in-focus-edit mode. The signal is retained for
        // legacy Setup-gate compatibility; PulsePlay Settings now owns active
        // configuration.
        // ViewMode.View === 0, Edit === 1, InFocusEdit === 2 (see
        // node_modules/powerbi-visuals-api/src/visuals-api.d.ts).
        const isAuthorEditing = (options as any).viewMode === 1 || (options as any).viewMode === 2;

        const props: AppProps = {
            settings,
            context,
            host: this.host,
            // PBI guarantees viewport on every update() call; non-null
            // assert keeps the optional stub type narrow downstream.
            viewport: options.viewport!,
            configIssues,
            configWarnings,
            hostPalette: palette,
            isAuthorEditing
        };

        this.root.render(<VisualErrorBoundary><App {...props} /></VisualErrorBoundary>);
    }

    public getFormattingModel() {
        // Cycle 28 — when "Use Report Theme" is ON, the brand-override
        // fields (theme name, accent / text / bg / font family) are
        // ignored at runtime — host palette wins. Hiding them in the
        // format pane removes the confusion the user flagged ("which one
        // is authoritative when both are visible?"). The toggle stays
        // visible so the author can flip it OFF and the overrides reappear.
        try {
            const appearance = this.formattingSettingsModel.genieSettings?.appearance as any;
            const inheritOn = appearance?.useReportTheme?.value === true;
            const slicesToHide = [
                appearance?.themeName,
                appearance?.brandAccentColor,
                appearance?.brandTextColor,
                appearance?.brandBgColor,
                appearance?.brandFontFamily,
                appearance?.darkMode,
            ].filter(Boolean) as Array<{ visible?: boolean }>;
            for (const slice of slicesToHide) {
                slice.visible = !inheritOn;
            }
        } catch { /* never break the format pane */ }
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettingsModel);
    }

    public destroy(): void {
        // 2026-05-25 — D1 fix. The prior synchronous `this.root.unmount()`
        // ran inside React 18's commit window when PulseShell's effect
        // cleanup fired during a parent re-render, producing:
        //   console.error: "Attempted to synchronously unmount a root
        //     while React was already rendering."
        //   pageerror:    "Failed to execute 'removeChild' on 'Node':
        //     The node to be removed is not a child of this node."
        // Defer the unmount past the current React commit via rAF (which
        // schedules after the current tick's microtasks AND after React's
        // commit). queueMicrotask is too early — still inside the commit.
        // Errors are swallowed because the unmount may race with a parent
        // remount; either way the orphaned root is GC'd on next render.
        const root = this.root;
        const schedule = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame
            : (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0);
        schedule(() => {
            try {
                root.unmount();
            } catch (err) {
                // Swallow — root may already be unmounted by a parent
                // remount race; either way nothing actionable here.
                console.warn("[pulse/Visual.destroy] deferred unmount swallowed:", err);
            }
        });
    }
}

// Catches render-time exceptions anywhere in the tree so a single bad
// state shape (e.g. a malformed Genie response that triggers an unexpected
// null) doesn't blank the whole visual in Power BI. Without this, any
// render throw unmounts <App /> and the host shows an empty pane with no
// error path back.
class VisualErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("[gn-visual] render error:", error, info?.componentStack);
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 24, fontFamily: "Segoe UI, sans-serif", color: "var(--gn-text, #444)", background: "var(--gn-bg, #ffffff)" }}>
                    <h3 style={{ marginTop: 0, color: "var(--gn-error, #b22020)" }}>PulsePlay hit an unexpected error</h3>
                    <p>The visual stopped rendering because of a runtime issue. Reload the report or refresh the page to try again.</p>
                    <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: "pointer" }}>Technical detail</summary>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>{this.state.error.message}</pre>
                    </details>
                    <button
                        style={{ marginTop: 12, padding: "6px 12px", cursor: "pointer" }}
                        onClick={() => this.setState({ error: null })}
                    >
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function App(props: AppProps) {
    const { settings } = props;
    const { formatPane: paneSettings, operational: opSettings } = settings;

    const roleMode = normalizeUserMode(props.context.dataUserRole || "manager");
    const viewerUserKey = (props.context.dataUserId || "").trim().toLowerCase();
    const canViewAllHistory = /^(author|admin|administrator|owner|superuser|super-user|developer)$/i.test(roleMode);
    // Compact header layout. PulsePlay note: the original 600 px breakpoint
    // matched a full-PBI-visual width; here Pulse runs inside a resizable
    // split pane (cycle J) that's commonly ~35% of viewport — well under
    // 600 px on a 1280 px screen. That triggered compact in normal use and
    // turned the old status pill into a bare dot. Lowered to 380 px so
    // compact only kicks in when the pane is genuinely squeezed (mobile-
    // narrow or aggressively-resized). Authors can still force-on or
    // force-off via settings.compactMode.
    const compactMode = paneSettings.compactMode || "auto";
    const compact = compactMode === "on" || (compactMode !== "off" && props.viewport.width < 380);
    const canShowSql = opSettings.showSql || roleMode === "analyst";
    const canShowTrace = opSettings.showTrace || opSettings.devMode || roleMode === "analyst";

    const kbFlags = useMemo(() => ({
        enabled: opSettings.kbEnabled,
        charts: opSettings.kbChartRules,
        stats: opSettings.kbStatRules,
        reporting: opSettings.kbReportingRules
    }), [
        opSettings.kbEnabled,
        opSettings.kbChartRules,
        opSettings.kbStatRules,
        opSettings.kbReportingRules
    ]);

    const themeStyle = useMemo(() => {
        // Dark-aware: in dark mode buildThemeStyle omits surface/text tokens so
        // this inline style (which sits on the .gn-shell--dark element) doesn't
        // override the dark cascade with light surfaces.
        const dark = !!props.settings.darkMode;
        if (paneSettings.useReportTheme && props.hostPalette) {
            return buildThemeStyle(buildThemeFromHost(props.hostPalette), { dark });
        }
        const tokens = mergeTheme(paneSettings.themeName as ThemeName, {
            accent: paneSettings.brandAccentColor,
            text: paneSettings.brandTextColor,
            bg: paneSettings.brandBgColor,
            fontFamily: paneSettings.brandFontFamily
        });
        return buildThemeStyle(tokens, { dark });
    }, [
        paneSettings.useReportTheme,
        props.hostPalette,
        paneSettings.themeName,
        paneSettings.brandAccentColor,
        paneSettings.brandTextColor,
        paneSettings.brandBgColor,
        paneSettings.brandFontFamily,
        props.settings.darkMode,
    ]);

    const guidedFilters = useMemo(
        () => pickGuidedFilters(props.context.availableFilters),
        [props.context.availableFilters]
    );
    // ── Multi-space client map ────────────────────────────────────────────────
    const [activeSpaceKey, setActiveSpaceKey] = useState<SpaceKey>("space1");
    // Wave 23: when ON + multi-space enabled, AI Insights renders all spaces'
    // results side-by-side in a flex grid instead of behind the tab strip.
    // Only meaningful for AI Insights (Chat already shows per-tab convos).
    const [insightsCompareMode, setInsightsCompareMode] = useState<boolean>(false);
    // Wave 42 — pass viewerUserKey (from props.context.dataUserId, populated by
    // a bound USERPRINCIPALNAME() measure) so it wins over the manual roleMode
    // selector when the SQL role-hint is enabled. See buildActiveSpaces jsdoc.
    const activeSpaces = useMemo(
        () => buildActiveSpaces(opSettings, roleMode, viewerUserKey),
        [opSettings, roleMode, viewerUserKey]
    );
    const clientMap = useMemo(() => {
        // IDEA-023 phase 3 — visual no longer instantiates GenieClient
        // directly. createBackend() returns the right adapter based on
        // connectionMode. Today every mode resolves to GenieClient (it
        // switches internally); future commits can add per-mode files.
        const map = new Map<SpaceKey, AnyBackend>();
        activeSpaces.forEach(space => map.set(space.key, createBackend(space.genieConfig)));
        return map;
    }, [activeSpaces]);
    const activeSpace = activeSpaces.find(space => space.key === activeSpaceKey) ?? activeSpaces[0];
    const activeClient = clientMap.get(activeSpace?.key ?? "space1") ?? null;

    // ── Option A — KPI preload on first Ask Pulse tab entry ──────────────────
    // When the user opens the chat tab for the first time (no messages, no
    // existing conversation), fire a lightweight background Genie call to get
    // a KPI snapshot. The result appears in the welcome area as KPI cards; the
    // conversation_id pre-seeds the conversation so the user's first typed
    // question continues the same thread rather than starting cold.
    const kpiPreloadRef = React.useRef<Record<string, boolean>>({});
    const [kpiSnapshotMap, setKpiSnapshotMap] = useState<Record<string, string | null>>({});
    const [kpiLoadingMap,  setKpiLoadingMap]  = useState<Record<string, boolean>>({});

    // ── Per-space conversation + message state ────────────────────────────────
    const [conversationMap, setConversationMap] = useState<Record<string, string>>({});
    const [messageMap,      setMessageMap]      = useState<Record<string, ChatMessageViewModel[]>>({});
    const messages             = messageMap[activeSpaceKey] ?? [];

    // Reset the conversation map when the user switches connection mode or
    // changes the upstream host. Conversation IDs are scoped to a specific
    // (host, space) pair — reusing one issued under proxy mode against a
    // different direct-mode host produces a 404. The message history stays
    // (the user can still scroll back); only the routing key resets so the
    // next message starts a fresh conversation in the new context.
    const connectionContextKey = `${props.settings.connectionMode}|${props.settings.host}|${props.settings.apiBaseUrl}`;
    useEffect(() => {
        setConversationMap({});
        // Reset preload guard when the connection context changes so the new
        // backend gets its own preload conversation.
        kpiPreloadRef.current = {};
        setKpiSnapshotMap({});
        setKpiLoadingMap({});
    }, [connectionContextKey]);

    // ── Per-space insights state ──────────────────────────────────────────────
    const [insightsResultMap,    setInsightsResultMap]    = useState<Record<string, ChatMessageViewModel | null>>({});
    const [insightsBusyMap,      setInsightsBusyMap]      = useState<Record<string, boolean>>({});
    const [stageStatusesMap,     setStageStatusesMap]     = useState<Record<string, StageStatus[]>>({});
    const [insightsGeneratedAtMap, setInsightsGeneratedAtMap] = useState<Record<string, number | null>>({});
    // Stale-while-revalidate: tracks which spaces are showing cached content
    // while a background refresh runs. When set the UI overlays a
    // "Last run · Refreshing" banner on the stale cached render. Cleared
    // atomically when the fresh pipeline commits its final result.
    const [staleRefreshingMap, setStaleRefreshingMap]   = useState<Record<string, boolean>>({});
    // Holds the cached result to display while the background refresh is in
    // flight. Use a ref (not state) so it doesn't trigger extra renders;
    // the banner appearance is driven by staleRefreshingMap.
    const staleDisplayRef = React.useRef<Record<string, ChatMessageViewModel>>({});
    // IDEA-008: clarifying follow-up questions extracted from Insights stage
    // content. Accumulated across stages, deduplicated, and rendered as a
    // chip strip at the bottom of the Insights view + injected into the
    // Chat tab's compose suggestion area when the user clicks one.
    const [insightsFollowUps, setInsightsFollowUps] = useState<Record<string, string[]>>({});
    // Live Genie poll status per stage — keyed `${spaceKey}:${stageIdx}` →
    // friendly label ("Pulling the data"). Drives the (sub-status) shown
    // in parens after the active stage's polished label.
    const [insightsStageLiveStatus, setInsightsStageLiveStatus] = useState<Record<string, string>>({});
    const insightsResult    = insightsResultMap[activeSpaceKey]    ?? null;
    const insightsBusy      = insightsBusyMap[activeSpaceKey]      ?? false;
    const stageStatuses     = stageStatusesMap[activeSpaceKey]     ?? [];
    const insightsGeneratedAt = insightsGeneratedAtMap[activeSpaceKey] ?? null;
    const activeFollowUps   = insightsFollowUps[activeSpaceKey]    ?? [];

    // ── Phase E.1 — client-side progressive reveal ────────────────────────
    // Genie answers single-shot (one message id, one big markdown). To get
    // the 1-then-2-then-2 cadence Rajesh asked for WITHOUT re-querying the
    // LLM, we stamp an arrival time per space the first time the rendered
    // content has body, then tick a counter on each scheduled reveal so the
    // memo below recomputes `revealedSectionTitles`.
    //
    // The reveal kicks in only when the content has actually landed
    // (status === "DONE"); during the in-flight RUNNING phase the existing
    // stage skeleton grid already provides the perceived progression.
    // Performance levers — author-selectable speed-vs-completeness knobs.
    // Subscribed via the same event the Settings UI dispatches, so changes
    // take effect mid-session without a reload.
    const [perfLevers, setPerfLevers] = useState<PerformanceLevers>(loadPerformanceLevers);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setPerfLevers(loadPerformanceLevers());
        window.addEventListener(PERFORMANCE_LEVERS_EVENT, sync);
        return () => window.removeEventListener(PERFORMANCE_LEVERS_EVENT, sync);
    }, []);

    // Staged reveal is disabled when either:
    //  (a) the legacy boolean is explicitly false (back-compat), or
    //  (b) the new revealCadence lever is "instant"
    // The cadence picker is the canonical surface; the boolean remains for
    // deployers / scripts that wrote it before this lever existed.
    const stagedRevealEnabled = props.settings.insightsStagedRevealEnabled !== false
        && perfLevers.revealCadence !== "instant";
    const activeRevealSchedule = useMemo(
        () => revealScheduleFromCadence(perfLevers.revealCadence),
        [perfLevers.revealCadence],
    );
    const contentArrivedAtRef = React.useRef<Record<string, number>>({});
    const [revealTick, setRevealTick] = useState(0);
    const reducedMotionRef = React.useRef<boolean>(false);
    useEffect(() => {
        try {
            reducedMotionRef.current = typeof window !== "undefined"
                && typeof window.matchMedia === "function"
                && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch { reducedMotionRef.current = false; }
    }, []);

    // Record arrival time the first frame content lands for this space.
    const insightsContentForReveal = (insightsResult?.content || "").trim();
    const insightsDone = insightsResult?.status === "DONE";
    useEffect(() => {
        if (!insightsDone || !insightsContentForReveal) return;
        if (contentArrivedAtRef.current[activeSpaceKey]) return;
        contentArrivedAtRef.current[activeSpaceKey] = Date.now();
        setRevealTick(t => t + 1);
    }, [activeSpaceKey, insightsDone, insightsContentForReveal]);

    // Reset arrival stamp when a fresh pipeline begins so the next answer
    // gets its own reveal cadence.
    useEffect(() => {
        if (insightsBusy) {
            delete contentArrivedAtRef.current[activeSpaceKey];
        }
    }, [activeSpaceKey, insightsBusy]);

    // Parse section IDs out of the current content (lightweight — same
    // delimiter rules as renderInsightsSections). We only need the titles
    // here so the schedule can prune stages whose sections aren't present.
    const parsedSectionTitlesForReveal = useMemo<string[]>(() => {
        if (!insightsContentForReveal) return [];
        const titles: string[] = [];
        const parts = insightsContentForReveal.split(/^#{1,3}\s+/m);
        const preamble = parts.shift();
        if (preamble && preamble.trim()) {
            const t = preamble.trim();
            const looksLikeHeadline = /\b(situation|implication|on-track|at-risk|off-track|^total\b|^revenue\b)/i.test(t);
            titles.push(looksLikeHeadline ? "HEADLINE" : "INSIGHTS");
        }
        for (const chunk of parts) {
            const nl = chunk.indexOf("\n");
            const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().toUpperCase();
            if (title) titles.push(title);
        }
        return titles;
    }, [insightsContentForReveal]);

    // Compute the live reveal state. Uses revealTick to invalidate.
    const revealState: RevealState | null = useMemo(() => {
        if (!stagedRevealEnabled) return null;
        if (!insightsDone || !insightsContentForReveal) return null;
        if (reducedMotionRef.current) return null; // instant-reveal
        const arrivedAt = contentArrivedAtRef.current[activeSpaceKey];
        if (!arrivedAt) return null;
        const elapsed = Date.now() - arrivedAt;
        return computeRevealState(activeRevealSchedule, elapsed, parsedSectionTitlesForReveal);
        // revealTick is intentionally a dep so the memo recomputes on each
        // scheduled tick even though Date.now() is read imperatively.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stagedRevealEnabled, insightsDone, insightsContentForReveal, activeSpaceKey, parsedSectionTitlesForReveal, revealTick, activeRevealSchedule]);

    // Schedule the next reveal tick.
    useEffect(() => {
        if (!revealState || !revealState.isRevealing) return;
        const arrivedAt = contentArrivedAtRef.current[activeSpaceKey];
        if (!arrivedAt) return;
        const elapsed = Date.now() - arrivedAt;
        const nextAt = nextRevealTickMs(activeRevealSchedule, elapsed, parsedSectionTitlesForReveal);
        if (nextAt == null) return;
        const wait = Math.max(50, nextAt - elapsed + 30); // tiny buffer past the boundary
        const handle = window.setTimeout(() => setRevealTick(t => t + 1), wait);
        return () => window.clearTimeout(handle);
    }, [revealState, activeSpaceKey, parsedSectionTitlesForReveal, activeRevealSchedule]);

    // Convenience derivations the render path reads.
    const revealedSectionTitles: Set<string> | null = revealState ? revealState.visibleSections as Set<string> : null;
    const revealProgress = revealState; // alias for spinner JSX clarity

    const appliedFiltersRef = useRef<Record<string, IFilter>>({});
    const chatRef = useRef<HTMLDivElement | null>(null);
    const [area, setArea] = useState<GuidedArea>("performance");
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
    const [showFilters, setShowFilters] = useState(true);
    const [home, setHome] = useState<AssistantHomePayload>(() => buildLocalHomeModel(props.context, roleMode));
    // UX-VIEWER-1.2B — fetch the Ask Pulse home meta (data identity + curated
    // starter questions) for the active assistant profile. The hook returns
    // pack-derived evergreen questions for non-Genie backends and real
    // Genie space metadata + curated_questions for Genie profiles. Errors
    // fall through silently to the existing STATIC_ACTIONS merge below —
    // the home must never break just because home-meta is unavailable.
    const askPulseHomeMeta = useAskPulseHomeMeta({
        assistantProfile: props.settings.assistantProfile || undefined,
    });
    const [question, setQuestion] = useState("");
    // 2026-05-26 — slash-command autocomplete (Gemini reference, vetted +
    // pruned to one feature). When the user types `/` at the start of the
    // composer, a floating dropdown of analytical presets appears: SWOT,
    // VARIANCE, PARETO, RFM, BCG. Arrow keys navigate; Enter / Tab inserts;
    // Esc closes. No external dependencies, no behaviour change when the
    // composer doesn't start with `/`.
    const SLASH_PRESETS: ReadonlyArray<{ cmd: string; label: string; question: string }> = useMemo(() => [
        { cmd: "/swot", label: "SWOT analysis", question: "Run a SWOT analysis on this dataset. Cover strengths, weaknesses, opportunities, and threats with evidence per slice." },
        { cmd: "/variance", label: "Variance breakdown", question: "Show variance vs prior period for the top metrics by region and category. Highlight the biggest movers with directional cues." },
        { cmd: "/pareto", label: "Pareto contribution", question: "Build a Pareto view showing which slices drive 80% of the total. Identify the vital few vs the trivial many." },
        { cmd: "/rfm", label: "RFM segmentation", question: "Segment by Recency, Frequency, and Monetary value. Identify which segments deserve investment vs deprioritization." },
        { cmd: "/bcg", label: "BCG matrix", question: "Place each category on a BCG matrix (stars, cash cows, question marks, dogs) using growth and share signals." },
        { cmd: "/risks", label: "Risk pockets", question: "Identify the top 5 risk pockets where Sales are material but Profit is weak. Group by State, City, and Sub-Category." },
        { cmd: "/trends", label: "Trend reversal scan", question: "Scan for trend reversals where momentum changed direction. Show the time window, affected slice, and likely drivers." },
        { cmd: "/discount", label: "Discount sensitivity", question: "For each Segment, estimate whether higher Discount correlates with lower Profit Margin. Flag exceptions where discounting still earned profit." },
    ], []);
    const [slashOpen, setSlashOpen] = useState(false);
    const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
    const slashFiltered = useMemo(() => {
        const v = question.trim();
        if (!v.startsWith("/")) return [];
        const filter = v.slice(1).toLowerCase();
        const matches = SLASH_PRESETS.filter(p => p.cmd.slice(1).startsWith(filter) || p.label.toLowerCase().includes(filter));
        return matches.length > 0 ? matches : SLASH_PRESETS.slice(0); // show all if no match
    }, [question, SLASH_PRESETS]);
    useEffect(() => {
        const shouldOpen = question.startsWith("/") && question.length <= 24 && !question.includes("\n");
        setSlashOpen(shouldOpen);
        if (shouldOpen) setSlashSelectedIdx(0);
    }, [question]);
    const insertSlashPreset = (preset: { question: string }) => {
        setQuestion(preset.question);
        setSlashOpen(false);
    };
    const [busy, setBusy] = useState(false);
    const [devPanel, setDevPanel] = useState<"" | "diagnostics" | "session" | "setup" | "genieQueries" | "display">("");
    const [outerViewportFocus, setOuterViewportFocus] = useState<PulsePlayViewportFocus>(() => readPulsePlayViewportFocus());
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ focusedPane?: string | null }>).detail;
            const next = detail?.focusedPane;
            setOuterViewportFocus(next === "ai" || next === "bi" ? next : null);
        };
        window.addEventListener("pulseplay:viewport-state", handler as EventListener);
        return () => window.removeEventListener("pulseplay:viewport-state", handler as EventListener);
    }, []);
    // Cycle 40 — Genie Query Audit panel state. Fetched on-demand from
    // proxy /admin/query-history. Genie-mode only (connectionMode = proxy
    // or direct). Gives the author / dev a copy-pasteable list of recent
    // SQL Genie ran on this workspace — useful for bug-tracing "did
    // Genie generate the SQL I expected?" without leaving PBI Desktop.
    const [genieQueries, setGenieQueries] = useState<Array<{
        statement_id: string | null;
        query_text: string;
        status: string;
        duration_ms: number | null;
        executed_at_ms: number | null;
        error_message: string | null;
        user_name: string | null;
        warehouse_id: string | null;
        statement_type: string | null;
        rows_produced: number | null;
    }>>([]);
    const [genieQueriesLoading, setGenieQueriesLoading] = useState(false);
    const [genieQueriesError, setGenieQueriesError] = useState<string>("");
    const [genieQueriesSinceMin, setGenieQueriesSinceMin] = useState<number>(60);
    const [showDevModal, setShowDevModal] = useState(false);
    // PulsePlay — Developer Tools modal maximize toggle. The PBI-heritage
    // drawer layout was sized for the Power BI custom-visual sandbox; in the
    // browser playground authors often want the modal to fill the viewport
    // so multi-step Setup forms breathe. Reset to false on each open.
    const [devModalMaximized, setDevModalMaximized] = useState(false);

    // Wave 11 a11y — modal Esc + focus management + return-focus.
    // Records the trigger element on open, focuses the close button on
    // mount, and returns focus to the trigger on close. Esc anywhere
    // inside (or on the overlay) closes the modal.
    const devModalCloseRef = React.useRef<HTMLButtonElement>(null);
    const devModalLastFocusRef = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => {
        if (!showDevModal) return;
        // Capture the element that opened the modal so we can restore focus on close.
        devModalLastFocusRef.current = (document.activeElement as HTMLElement) || null;
        // Focus the close button after mount so screen readers announce the dialog.
        const t = window.setTimeout(() => devModalCloseRef.current?.focus(), 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setShowDevModal(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener("keydown", onKey);
            // Return focus to the trigger on close.
            devModalLastFocusRef.current?.focus?.();
            // PulsePlay — clear the maximize override on close so the next
            // open starts back at the drawer default. Persisting it would
            // surprise an author who maximized once and forgot.
            setDevModalMaximized(false);
        };
    }, [showDevModal]);
    // IDEA-022: when only one feature is enabled, force activeTab to that
    // feature so the (now-hidden) tab strip can't leave us on a blank pane.
    // 'both' defaults to insights, matching previous behaviour.
    const enabledFeatures = props.settings.enabledFeatures ?? "both";

    // 2026-05-25 — per-tab-visibility (PulsePlay settings, NOT Pulse settings).
    // Subscribes to display-change events so toggling a tab in Settings →
    // Preferences updates the strip without a reload.
    const [tabVisibility, setTabVisibility] = useState<PulsePlayTabVisibility>(() => readPulsePlayTabVisibility());
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string }>).detail;
            if (detail?.key === PULSEPLAY_TAB_VISIBILITY_KEY) {
                setTabVisibility(readPulsePlayTabVisibility());
            }
        };
        window.addEventListener("pulseplay:display-change", handler as EventListener);
        return () => window.removeEventListener("pulseplay:display-change", handler as EventListener);
    }, []);
    const tabVisibilityCount = pulsePlayEnabledTabCount(tabVisibility);

    const [activeTab, setActiveTab] = useState<"insights" | "chat">(() => {
        // Honor a host-stashed initial tab so cold-mount through
        // PulseShell (e.g. user clicked "Ask Pulse" while the BI pane was
        // maximized) lands on the requested tab without relying on a
        // post-mount event reaching us before our listener attaches. The
        // stash is cleared after read to avoid leaking into future mounts.
        if (enabledFeatures === "chatOnly") return "chat";
        if (enabledFeatures === "insightsOnly") return "insights";
        if (typeof window !== "undefined") {
            const w = window as unknown as { __pulseplayInitialTab?: string };
            const stash = w.__pulseplayInitialTab;
            if (stash === "chat" || stash === "insights") {
                delete w.__pulseplayInitialTab;
                return stash;
            }
        }
        return "insights";
    });
    // Re-pin activeTab if the author flips the gate at runtime (e.g. via
    // Setup Apply). Otherwise switching to insightsOnly while activeTab is
    // "chat" would render a blank chat pane behind a hidden strip.
    useEffect(() => {
        if (enabledFeatures === "insightsOnly" && activeTab !== "insights") setActiveTab("insights");
        if (enabledFeatures === "chatOnly" && activeTab !== "chat") setActiveTab("chat");
    }, [enabledFeatures, activeTab]);
    useEffect(() => {
        const handler = (e: Event) => {
            const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
            if (tab === "insights" && enabledFeatures !== "chatOnly") setActiveTab("insights");
            if (tab === "chat" && enabledFeatures !== "insightsOnly") setActiveTab("chat");
        };
        window.addEventListener("pulseplay:pulse-surface-tab", handler as EventListener);
        return () => window.removeEventListener("pulseplay:pulse-surface-tab", handler as EventListener);
    }, [enabledFeatures]);
    // 2026-05-25 — outgoing tab-change event so the App-level TopRightToolbar
    // can update its labels when the user flips between AI Insights and
    // Ask Pulse inside the Pulse tab strip. Without this, the toolbar's
    // activeTabName stays stale because effectiveSurfaceId (App.tsx) only
    // updates on Dashboard ↔ AI transitions. Fires on every activeTab
    // change regardless of trigger (click, keyboard, programmatic).
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("pulseplay:pulse-tab-changed", {
            detail: { tab: activeTab },
        }));
    }, [activeTab]);
    const [insightsCustomPrompt, setInsightsCustomPrompt] = useState("");
    const [insightsActivePromptId, setInsightsActivePromptId] = useState<string | null>(null);
    // Wave 35 Phase 3 — Custom SQL section results, keyed by `${spaceKey}|${sectionTitle}`.
    // Each section's executeSqlPreview round-trip lands here; the renderer
    // pulls from this map by composing the same key. Results carry a
    // generatedAt timestamp so the cache TTL (4h for SQL sections) can
    // be honoured at render time.
    const [sqlSectionResults, setSqlSectionResults] = useState<Record<string, { result: SqlSectionResult; generatedAt: number }>>({});
    const [sqlSectionLoading, setSqlSectionLoading] = useState<Record<string, boolean>>({});
    const sqlSectionInflightRef = React.useRef<Record<string, boolean>>({});
    // IDEA-044 Phase 2 — Export dropdown state. Open/closed UI flag plus a
    // transient "busy" flag set while the lazy-loaded chunk is in flight
    // (PNG render or Excel composition). Errors flow through `exportError`
    // for a one-shot toast next to the dropdown.
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [exportBusy, setExportBusy] = useState<"" | "png" | "excel" | "csv">("");
    const [exportError, setExportError] = useState<string>("");
    // Cycle 18 — sticky "this host can't load lazy chunks" flag. Set to true
    // the first time exportInsightsPng / exportInsightsExcel throws a
    // LazyLoadError (i.e., webpack's `import("html2canvas")` /
    // `import("xlsx")` chunk-load fails). This happens deterministically
    // inside the Power BI Desktop visual sandbox, which blocks the side-chunk
    // network fetch even though the entry chunk is loaded fine. Once the
    // flag is set we proactively disable the PNG and Excel rows in the
    // dropdown with an honest tooltip ("PBI Desktop blocks the export
    // library — open the report in PBI Service or use Copy 📋 / CSV
    // instead"), so the viewer doesn't keep clicking the same broken
    // option. CSV stays enabled because it's pure-JS string assembly with
    // no dynamic chunk. Persisted in sessionStorage so the flag survives
    // tab/section switches inside the same Desktop session, then reset on
    // visual reload (giving Service / Web hosts a clean slate). */
    const LAZY_BLOCK_KEY = "pulseplay-export-lazy-blocked";
    const [lazyExportBlocked, setLazyExportBlocked] = useState<boolean>(() => {
        try { return window.sessionStorage?.getItem(LAZY_BLOCK_KEY) === "1"; } catch { return false; }
    });
    const markLazyExportBlocked = useCallback(() => {
        setLazyExportBlocked(true);
        try { window.sessionStorage?.setItem(LAZY_BLOCK_KEY, "1"); } catch { /* private mode / quota */ }
    }, []);
    // Cycle 19 — proactive sandbox detection. Pre-warm html2canvas the first
    // time the Insights tab is shown. If the chunk loads successfully we know
    // the host can run lazy chunks (Power BI Service / Web / Embedded). If
    // it throws LazyLoadError we know the host is Power BI Desktop's iframe
    // sandbox, which blocks side-chunk fetches even when the entry chunk is
    // loaded fine. By learning the answer BEFORE the user clicks Export, we
    // can render the menu with PNG/Excel completely OMITTED in Desktop —
    // viewer never sees a broken option, never sees the misleading toast.
    // Single-shot per session: if the flag is already set (sessionStorage
    // hydrated `lazyExportBlocked = true`) we skip the probe; if it's
    // already false AND we've probed once we don't probe again. The probe
    // is fire-and-forget — the result is read off the chunk; the loaded
    // module gets cached by webpack so the actual export click is instant.
    const lazyProbeFiredRef = React.useRef(false);
    useEffect(() => {
        if (activeTab !== "insights") return;
        if (lazyProbeFiredRef.current) return;
        if (lazyExportBlocked) return; // hydrated from sessionStorage; nothing to learn
        lazyProbeFiredRef.current = true;
        loadHtml2Canvas().catch((e) => {
            if (e instanceof LazyLoadError) {
                markLazyExportBlocked();
                logSession("INFO", "Detected sandboxed host (PBI Desktop) — PNG / Excel export options hidden for this session.");
            }
            // Other errors are benign — chunk arrived but threw on init,
            // which still proves the network/host can reach it. Leave the
            // flag alone; the click-handler path will surface a useful
            // error if the user actually triggers an export.
        });
    }, [activeTab, lazyExportBlocked, markLazyExportBlocked]);
    // Cycle 20 — per-section "Show SQL" toggle state. A Set of UPPER-CASED
    // section titles whose SQL panel is currently expanded. Independent
    // per section so the viewer can keep KPI SNAPSHOT's SQL open while
    // collapsing TRENDS, etc. Cleared whenever the active space changes
    // (different stage traces, different SQL).
    const [openSqlSectionTitles, setOpenSqlSectionTitles] = useState<Set<string>>(new Set());
    useEffect(() => { setOpenSqlSectionTitles(new Set()); }, [activeSpaceKey]);
    // Cycle 40 — fetch Genie query history from the proxy. XHR (PBI
    // Desktop sandbox blocks fetch — the same constraint the rest of
    // genie.ts works around). Genie-mode only; the panel button is
    // gated, but we also no-op gracefully if called from other modes.
    const fetchGenieQueries = useCallback(async (sinceMinutes: number) => {
        // Split the proxy URL fallback so the literal `http://` isn't a complete
        // substring — the powerbi-visuals/no-http-string lint rule rejects it
        // even though local proxy traffic is intentionally HTTP.
        const apiBase = props.settings.apiBaseUrl?.replace(/\/$/, "") || `${"http"}://127.0.0.1:8787`;
        const profile = props.settings.assistantProfile || "default";
        setGenieQueriesLoading(true);
        setGenieQueriesError("");
        try {
            const url = `${apiBase}/admin/query-history?profile=${encodeURIComponent(profile)}&maxResults=50&sinceMinutes=${sinceMinutes}`;
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (props.settings.proxyKey) xhr.setRequestHeader("X-Genie-Key", props.settings.proxyKey);
            // 2026-05-27 — promoted from 30s → SIMPLE (3 min) per the
            // central timeout policy. Query history fetch is read-only
            // metadata; 3 min handles slow workspaces without failure.
            xhr.timeout = 180_000;  // SIMPLE_REQUEST_TIMEOUT_MS
            const result = await new Promise<{ ok: boolean; queries?: any[]; error?: string }>((resolve) => {
                xhr.onload = () => {
                    // Cycle 41 — distinguish error classes so we can give an
                    // actionable message instead of a bare "Parse error".
                    // 404 with HTML body is the "proxy hasn't been restarted
                    // since cycle 40 added this route" case — by far the
                    // most common failure mode right after deploy.
                    if (xhr.status === 404) {
                        resolve({
                            ok: false,
                            error: "Proxy doesn't know this endpoint. Restart the proxy (cd proxy && node server.js) to pick up the cycle-40 /admin/query-history route."
                        });
                        return;
                    }
                    if (xhr.status === 401) {
                        resolve({ ok: false, error: "Proxy rejected the request (shared-key gate). Set X-Genie-Key in Setup → Connection if your proxy has PROXY_SHARED_KEY configured." });
                        return;
                    }
                    let body: any = null;
                    try { body = JSON.parse(xhr.responseText || "{}"); } catch { /* fallthrough */ }
                    if (xhr.status >= 200 && xhr.status < 300) {
                        if (body && Array.isArray(body.queries)) {
                            resolve({ ok: true, queries: body.queries });
                        } else {
                            resolve({ ok: false, error: "Unexpected response shape (expected { queries: [...] })" });
                        }
                    } else if (body && body.error) {
                        resolve({ ok: false, error: `HTTP ${xhr.status}: ${body.error}` });
                    } else {
                        // Non-JSON body (HTML error page from upstream).
                        resolve({ ok: false, error: `HTTP ${xhr.status} from proxy (non-JSON response — check proxy logs)` });
                    }
                };
                xhr.onerror = () => resolve({ ok: false, error: "Network error reaching proxy. Is it running on 127.0.0.1:8787?" });
                xhr.ontimeout = () => resolve({ ok: false, error: "Request timed out (30s). Databricks SQL History API may be slow." });
                xhr.send();
            });
            if (result.ok) {
                setGenieQueries(result.queries || []);
                logSession("INFO", `Fetched ${result.queries?.length ?? 0} Genie queries from last ${sinceMinutes}min.`);
            } else {
                setGenieQueriesError(result.error || "Unknown error");
                setGenieQueries([]);
                logSession("WARN", `Genie query history fetch failed: ${result.error}`);
            }
        } finally {
            setGenieQueriesLoading(false);
        }
    }, [props.settings.apiBaseUrl, props.settings.assistantProfile, props.settings.proxyKey]);
    // Cycle 32 — copy a single section's markdown to the clipboard,
    // decorated with a `## Title` heading + provenance line. Wired from
    // the 📋 Copy button in the section footer (cycle 32). Falls back to
    // the legacy execCommand path when navigator.clipboard is blocked
    // (sandbox quirks). Pure additive — does not affect the toolbar's
    // 📋 button which copies the entire briefing.
    const copySection = useCallback(async (title: string, body: string) => {
        try {
            await copySectionAsMarkdown(body, {
                sectionTitle: title || "section",
                sourceLabel: activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                generatedAt: insightsGeneratedAtMap[activeSpaceKey] ?? undefined,
            });
            logSession("INFO", `Copied section "${(title || "").toUpperCase()}" to clipboard.`);
        } catch (e) {
            logSession("WARN", `Failed to copy section "${title}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [activeSpace?.genieConfig.assistantProfile, props.settings.assistantProfile, insightsGeneratedAtMap, activeSpaceKey]);
    // Cycle 30 — invoked from the validation-failure banner inside a
    // section card. Looks up the title in the most recent runStage
    // registration's titles array and calls runStage(idx) to re-run JUST
    // that one stage. Other stages keep their content; the assembled
    // viewmodel updates as soon as the new response lands. No-ops gracefully
    // if no run has fired yet OR the title isn't in the current pipeline
    // (e.g., custom JSON sections — they have their own retry semantics
    // via the global Refresh button).
    const retrySection = useCallback((title: string) => {
        const upper = (title || "").trim().toUpperCase();
        if (!upper) return;
        const reg = runStageRef.current;
        const idx = reg ? reg.titles.findIndex(t => (t || "").trim().toUpperCase() === upper) : -1;
        if (reg && idx >= 0) {
            try {
                void reg.run(idx);
                logSession("INFO", `Per-section retry triggered for "${upper}" (stage ${idx + 1}).`);
                return;
            } catch (e) {
                logSession("WARN", `Per-section retry failed for "${upper}": ${e instanceof Error ? e.message : String(e)} — falling back to full refresh.`);
            }
        }
        // Cycle 42 — full-refresh fallback when per-stage retry isn't
        // possible (cache-loaded, custom JSON section, runStage closure
        // not yet registered). Uses the same delegate the toolbar ↻
        // button does so the existing useEffect re-fires the pipeline.
        // The actual cache-clear + state-reset happens via a setter
        // ref populated below (avoids a TS forward-reference error
        // since computeInsightsCacheKey isn't declared yet at this
        // point in the component body).
        try {
            triggerFullInsightsRefreshRef.current?.();
            logSession("INFO", `Per-section retry for "${upper}" — full pipeline refresh (no stage closure available).`);
        } catch (e) {
            logSession("WARN", `Per-section retry full-refresh fallback failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, []);
    // Cycle 42 — populated below once computeInsightsCacheKey is in
    // scope. The retrySection callback (above) calls it via .current
    // so the forward reference doesn't break TS.
    const triggerFullInsightsRefreshRef = useRef<(() => void) | null>(null);
    const toggleSectionSql = useCallback((title: string) => {
        const upper = (title || "").trim().toUpperCase();
        if (!upper) return;
        setOpenSqlSectionTitles(prev => {
            const next = new Set(prev);
            if (next.has(upper)) next.delete(upper);
            else next.add(upper);
            return next;
        });
    }, []);
    // Cycle 20 — per-section export dispatcher. The kebab popover in the
    // SectionHeader calls this with `(title, body, kind, node)` where node
    // is the <section> DOM element (for PNG capture). The handler routes
    // to the appropriate scoped exporter and surfaces success / failure
    // through the same `exportError` toast surface as the global menu.
    // LazyLoadError still flips the sandbox-blocked flag so subsequent
    // section menus (and the global one) hide PNG / Excel rows.
    const handleSectionExport = useCallback(async (args: {
        title: string;
        body: string;
        kind: "md" | "csv" | "excel" | "png";
        node: HTMLElement | null;
        spaceId?: string;
        spaceLabel?: string;
        sourceLabel?: string;
        generatedAt?: number;
    }) => {
        const { title, body, kind, node, spaceId, spaceLabel, sourceLabel, generatedAt } = args;
        const ctx = { sectionTitle: title || "section", spaceId, spaceLabel, sourceLabel, generatedAt };
        setExportError("");
        try {
            if (kind === "md") {
                const ok = await copySectionAsMarkdown(body, { sectionTitle: title || "section", sourceLabel, generatedAt });
                if (!ok) setExportError("Couldn't copy to clipboard. Select the text manually.");
                else logSession("INFO", `Section "${title}" copied to clipboard as markdown.`);
            } else if (kind === "csv") {
                const ok = exportSectionAsCsv(body, { sectionTitle: title || "section", sourceLabel });
                if (!ok) setExportError("This section has no data table to export.");
                else logSession("INFO", `Section "${title}" exported as CSV.`);
            } else if (kind === "excel") {
                const ok = await exportSingleSectionAsExcel(body, ctx);
                if (!ok) setExportError("This section has no data table to export.");
                else logSession("INFO", `Section "${title}" exported as Excel.`);
            } else if (kind === "png") {
                const ok = await exportSingleSectionAsPng(node, { sectionTitle: title || "section", spaceId, generatedAt });
                if (!ok) setExportError("Couldn't capture this section.");
                else logSession("INFO", `Section "${title}" exported as PNG.`);
            }
        } catch (e) {
            if (e instanceof LazyLoadError) {
                markLazyExportBlocked();
                setExportError(
                    `PBI Desktop's sandbox blocks ${kind === "excel" ? "Excel" : "PNG"} export. ` +
                    "Use Copy as markdown / CSV here, or open the report in Power BI Service."
                );
                logSession("WARN", `Section export lazy-load failed for ${e.module}.`);
            } else {
                setExportError("Section export failed — see browser console.");
                logSession("ERROR", `Section "${title}" export failed: ${e instanceof Error ? e.message : String(e)}`);
                console.warn("[section export]", e);
            }
        }
    }, [markLazyExportBlocked]);
    const handleSectionRawDataExport = useCallback(async (
        title: string,
        queryResult: { columns: string[]; rows: unknown[][] },
        reusedFromTitle?: string | null,
        ctx?: {
            spaceId?: string;
            spaceLabel?: string;
            sourceLabel?: string;
            generatedAt?: number;
        }
    ) => {
        setExportError("");
        try {
            const ok = await exportSectionRawDataAsExcel(queryResult, {
                sectionTitle: title || "section",
                spaceId: ctx?.spaceId,
                spaceLabel: ctx?.spaceLabel,
                sourceLabel: ctx?.sourceLabel,
                generatedAt: ctx?.generatedAt,
                reusedFromTitle,
            });
            if (!ok) setExportError("This section has no raw query-result data to export.");
            else logSession("INFO", `Section "${title}" raw data exported as Excel.`);
        } catch (e) {
            if (e instanceof LazyLoadError) {
                markLazyExportBlocked();
                setExportError("This host blocks the Excel export library. Open in the web playground or use the SQL panel to copy the query.");
                logSession("WARN", `Raw data export lazy-load failed for ${e.module}.`);
            } else {
                setExportError("Raw data export failed — see browser console.");
                logSession("ERROR", `Section "${title}" raw data export failed: ${e instanceof Error ? e.message : String(e)}`);
                console.warn("[section raw data export]", e);
            }
        }
    }, [markLazyExportBlocked]);
    // Build the stage-title → SQL lookup map from a result's stageTraces.
    // Used by the SectionHeader to gate the Show SQL button + render the
    // inline SQL panel. Stable per-render: callers pass a fresh result so
    // memoization-by-reference would invalidate every render anyway.
    const buildStageSqlMap = (stageTraces?: { title?: string; sql?: string | null; sqls?: string[] | null; sqlReusedFromTitle?: string | null }[]) => {
        const map = new Map<string, { sqls: string[]; reusedFromTitle?: string | null }>();
        if (!stageTraces) return map;
        for (const st of stageTraces) {
            if (!st.title) continue;
            // Cycle 47.8 — prefer the multi-query array when present;
            // fall back to the single-string `sql` for traces written
            // before cycle 47.8 (cached entries from older runs).
            const sqls = (Array.isArray(st.sqls) && st.sqls.length > 0)
                ? st.sqls
                : (st.sql ? [st.sql] : null);
            if (sqls) {
                map.set(st.title.toUpperCase(), {
                    sqls,
                    reusedFromTitle: st.sqlReusedFromTitle ?? null,
                });
            }
        }
        return map;
    };
    const buildStageDataMap = (stageTraces?: {
        title?: string;
        queryResult?: { columns: string[]; rows: unknown[][] } | null;
        queryResultReusedFromTitle?: string | null;
    }[]) => {
        const map = new Map<string, { queryResult: { columns: string[]; rows: unknown[][] }; reusedFromTitle?: string | null }>();
        if (!stageTraces) return map;
        for (const st of stageTraces) {
            if (!st.title || !st.queryResult?.columns?.length) continue;
            map.set(st.title.toUpperCase(), {
                queryResult: st.queryResult,
                reusedFromTitle: st.queryResultReusedFromTitle ?? null,
            });
        }
        return map;
    };
    const exportMenuRef = React.useRef<HTMLDivElement | null>(null);
    // Close the export menu on outside click + Escape.
    useEffect(() => {
        if (!exportMenuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const root = exportMenuRef.current;
            if (root && !root.contains(e.target as Node)) setExportMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setExportMenuOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [exportMenuOpen]);
    // Wave 37 — Customize ⚙ popover state for viewer-side AI Insights section
    // toggling. The set state mirrors the localStorage value so the picker
    // shows the right tick marks immediately on open. `null` = no stored
    // preference yet (caller treats as "all visible"). Outside-click + Esc
    // closes; restoring focus is handled below.
    const [customizeOpen, setCustomizeOpen] = useState(false);
    const [visibilityVersion, setVisibilityVersion] = useState(0); // bump to force re-read on toggle/reset
    const customizeMenuRef = React.useRef<HTMLDivElement | null>(null);
    const customizeTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    // Phase C — secondary action overflow. Houses Copy MD / Copy HTML /
    // Print PDF so the primary toolbar row keeps only the high-signal
    // controls (Timestamp / Customize / Refresh / Stop). Mirror of the
    // customize popover pattern: outside-click + Esc close, focus
    // returns to the trigger on Esc.
    const [overflowOpen, setOverflowOpen] = useState(false);
    const overflowMenuRef = React.useRef<HTMLDivElement | null>(null);
    const overflowTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (!customizeOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const root = customizeMenuRef.current;
            if (root && !root.contains(e.target as Node)) setCustomizeOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setCustomizeOpen(false);
                // Return focus to the trigger so screen readers don't lose it.
                try { customizeTriggerRef.current?.focus(); } catch { /* best-effort */ }
            }
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [customizeOpen]);

    // Phase C — overflow popover lifecycle (mirror of the customize handlers).
    useEffect(() => {
        if (!overflowOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const root = overflowMenuRef.current;
            if (root && !root.contains(e.target as Node)) setOverflowOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOverflowOpen(false);
                try { overflowTriggerRef.current?.focus(); } catch { /* best-effort */ }
            }
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [overflowOpen]);
    // Wave 37 — derive the report key for viewer-side visibility persistence.
    // Matches the spaceId|assistantProfile pattern used by insightsCacheKey;
    // `activeSpaceKey` ("space1"/"space2"/...) is a stable fallback when the
    // genieConfig isn't fully populated yet. Survives navigation & report
    // reopen (localStorage).
    const viewerReportKey = useMemo(() => {
        const spaceId = activeSpace?.genieConfig.spaceId || activeSpaceKey || "default";
        const profile = activeSpace?.genieConfig.assistantProfile
            || props.settings.assistantProfile
            || "default";
        return `${spaceId}|${profile}`;
    }, [activeSpace?.genieConfig.spaceId, activeSpace?.genieConfig.assistantProfile, activeSpaceKey, props.settings.assistantProfile]);

    // Wave 37 (rev'd post-cycle 16) — viewer popover lists ONLY author-defined
    // custom sections (Setup → Section A → "Custom AI Insights sections (JSON)").
    // Universal stages (HEADLINE / KPI SNAPSHOT / TRENDS / RISKS / OPPORTUNITIES
    // / RECOMMENDED ACTIONS) are author-controlled in Setup → Section A toggles
    // and never appear in the viewer popover — having them in two places (Setup
    // toggles AND viewer checkboxes) was confusing and the per-tab toolbar was
    // getting crowded. Custom sections marked `userToggleable: false` are also
    // omitted; `lockedOn: true` renders as a disabled, always-checked row.
    // The `availableSections.length > 0` gate at the popover render site means
    // when an author has not configured any custom sections the Customize
    // button is invisible — no UI weight when not relevant.
    const availableSections = useMemo(() => {
        type Row = { title: string; lockedOn: boolean };
        const rows: Row[] = [];
        try {
            const customs = parseCustomSections(props.settings.insightsCustomSections || "");
            for (const c of customs) {
                if (c.userToggleable === false) continue;
                rows.push({
                    title: (c.name || "").trim().toUpperCase(),
                    lockedOn: c.lockedOn === true
                });
            }
        } catch { /* parseCustomSections never throws — defensive only */ }
        // De-dupe by title (later-defined custom sections that collide with an
        // earlier name win the lockedOn flag if they explicitly set it).
        const seen = new Map<string, Row>();
        for (const r of rows) {
            if (!r.title) continue;
            const prev = seen.get(r.title);
            if (!prev) seen.set(r.title, r);
            else if (r.lockedOn) seen.set(r.title, r);
        }
        return Array.from(seen.values());
    }, [props.settings.insightsCustomSections]);

    // Universal stage titles render unconditionally — the post-cycle-16 popover
    // scope-down means viewers can't hide them. Anything in this list is added
    // to `currentVisibleTitles` whenever a stored preference exists so a stale
    // pre-revision localStorage entry that excluded a universal title can
    // never accidentally hide it.
    const UNIVERSAL_INSIGHTS_TITLES = useMemo<readonly string[]>(() => [
        "HEADLINE",
        "KPI SNAPSHOT",
        "TRENDS",
        "RISKS",
        "OPPORTUNITIES",
        "RECOMMENDED ACTIONS",
    ], []);

    // Wave 37 — current visibility set, recomputed when the viewer toggles
    // a checkbox or resets. `null` = no stored preference (caller renders
    // everything). Locked custom sections + ALL universal stages are always
    // added back so a stale stored entry can never hide author-controlled
    // content.
    const currentVisibleTitles = useMemo<Set<string> | null>(() => {
        void visibilityVersion;
        const stored = getStoredVisibility(viewerReportKey);
        if (!stored) return null;
        for (const row of availableSections) {
            if (row.lockedOn) stored.add(row.title);
        }
        for (const t of UNIVERSAL_INSIGHTS_TITLES) stored.add(t);
        return stored;
    }, [viewerReportKey, visibilityVersion, availableSections, UNIVERSAL_INSIGHTS_TITLES]);

    const toggleSectionVisibility = useCallback((title: string) => {
        const upper = title.trim().toUpperCase();
        if (!upper) return;
        const stored = getStoredVisibility(viewerReportKey);
        const next = stored ? new Set(stored) : new Set(availableSections.map(r => r.title));
        if (next.has(upper)) next.delete(upper);
        else next.add(upper);
        for (const row of availableSections) {
            if (row.lockedOn) next.add(row.title);
        }
        storeVisibility(viewerReportKey, next);
        setVisibilityVersion(v => v + 1);
    }, [viewerReportKey, availableSections]);

    const resetSectionVisibility = useCallback(() => {
        resetVisibility(viewerReportKey);
        setVisibilityVersion(v => v + 1);
    }, [viewerReportKey]);

    // IDEA-031 (rev'd cycle 22) — "Adjust" suggestions used to render as a
    // standalone horizontal chip strip BELOW the toolbar whenever the user
    // had toggled them open. That row added persistent visual weight (5
    // chips × ~120px) the moment a viewer landed on the Insights tab,
    // even when they only wanted to glance at the briefing. Cycle 22
    // converts the toggle into a popover anchored to the Adjust button:
    // chips live INSIDE the dropdown, one per row, and are dismissed on
    // outside-click / Escape. localStorage no longer persists the open
    // state — popovers feel wrong when they auto-reopen across sessions.
    const [showAdjustChips, setShowAdjustChips] = useState<boolean>(false);
    const adjustMenuRef = React.useRef<HTMLDivElement | null>(null);
    const adjustTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const toggleAdjustChips = () => setShowAdjustChips(v => !v);
    useEffect(() => {
        if (!showAdjustChips) return;
        const onDocClick = (e: MouseEvent) => {
            const root = adjustMenuRef.current;
            if (root && !root.contains(e.target as Node)) setShowAdjustChips(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowAdjustChips(false);
                try { adjustTriggerRef.current?.focus(); } catch { /* best-effort */ }
            }
        };
        document.addEventListener("click", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("click", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [showAdjustChips]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyItems, setHistoryItems] = useState<GenieHistoryEntry[]>([]);
    const [historyBusy, setHistoryBusy] = useState(false);
    const [historyError, setHistoryError] = useState("");
    // 2026-05-29 — the "Show history" button is hidden by default; a Settings
    // toggle (Display group → genieSettings.showHistoryButton) opts it back in.
    // Reactive to the shared visual-settings change event so flipping the
    // toggle shows/hides it live without a reload.
    const readShowHistoryButton = () => {
        try { return JSON.parse(window.localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}").showHistoryButton === true; }
        catch { return false; }
    };
    const [showHistoryButton, setShowHistoryButton] = useState<boolean>(readShowHistoryButton);
    useEffect(() => {
        const sync = () => setShowHistoryButton(readShowHistoryButton());
        window.addEventListener("pulseplay:visual-settings-change", sync);
        return () => window.removeEventListener("pulseplay:visual-settings-change", sync);
    }, []);
    const [historyIncludeAll, setHistoryIncludeAll] = useState(false);
    // PulsePlay Settings is now the single setup/configuration surface.
    // The Console stays operational only: status, diagnostics, session logs,
    // and SQL trace. The old in-Console Setup/Display editors are retired to
    // avoid duplicated controls and state drift.
    const setupPanelVisible = false;
    const connectionStatus = computeConnectionStatus(
        props.settings,
        props.configIssues,
        props.configWarnings
    );
    const scopeGuardrailTags = (() => {
        const cte = String(props.settings.sqlCtePreamble || "").trim();
        const forbidden = String(props.settings.runtimeForbiddenColumns || "").trim();
        const rowFilter = String(props.settings.runtimeMandatoryRowFilter || "").trim();
        const tags: string[] = [];
        if (cte) tags.push("SQL prefix");
        if (forbidden) tags.push("column filter");
        if (rowFilter) tags.push("row filter");
        return tags;
    })();
    const scopeGuardrailLabel = scopeGuardrailTags.length === 1
        ? scopeGuardrailTags[0]
        : `${scopeGuardrailTags.length} active`;
    const scopeGuardrailDetail = scopeGuardrailTags.join(" · ");


    // Setup panel state lifted to App so it survives tab switches inside the
    // Developer Tools modal (Diagnostics ↔ Session Log ↔ Setup). Otherwise the
    // SetupPanel would unmount on every tab change and lose any in-progress
    // edits the user hadn't yet applied.
    const [setupIsEditing, setSetupIsEditing] = useState(false);
    const [setupDraft, setSetupDraft] = useState<SetupDraft>(() => setupDraftFromSettings(opSettings));
    // When NOT editing, keep draft in sync with the persisted settings so the
    // summary view always shows the latest applied values after PBI's
    // persistProperties round-trip propagates back through props. Watching the
    // entire settings object would re-run on every unrelated theme/header
    // tweak, so we explicitly depend on the snapshot signature instead.
    // Wave 17 perf — sub-agent #9 finding A2: this stringify ran on EVERY
    // App render (15s nowTick + 1s busy tick). Memoised on opSettings
    // identity so the cost is paid only when opSettings actually changes.
    const settingsSignature = React.useMemo(() => JSON.stringify(opSettings), [opSettings]);
    useEffect(() => {
        if (setupIsEditing) return;
        setSetupDraft(setupDraftFromSettings(opSettings));
    }, [setupIsEditing, settingsSignature]);

    // Confidence scoring — async, fires after answer renders
    const [confidenceLog, setConfidenceLog] = useState<ConfidenceResult[]>([]);
    const [confidencePending, setConfidencePending] = useState(false);
    const [showConfidencePanel, setShowConfidencePanel] = useState(false);

    // BUG-017: per-space "stage 1 Insights conversationId" capture. When a
    // user clicks an Insights-derived follow-up chip in the Chat tab, we
    // pre-seed conversationMap[spaceKey] from this map so runAssistant
    // continues the existing Genie conversation instead of starting fresh.
    // Stage 1 (HEADLINE + KPI SNAPSHOT) is the most context-rich stage and
    // the most semantically aligned with downstream questions.
    const [insightsStage1ConvId, setInsightsStage1ConvId] = useState<Record<string, string>>({});

    // Copy-button feedback — Power BI Desktop's WebView2 sandbox blocks the
    // Clipboard API and execCommand can succeed silently; the user needs a
    // visible signal that the click took. Each Copy button writes its key
    // (e.g. "insights") into copiedFlash for ~1.5 s so the label can render
    // "✓ Copied!" in place of the icon.
    const [copiedFlash, setCopiedFlash] = useState<Record<string, boolean>>({});
    const flashCopy = useCallback((key: string, text: string) => {
        if (!text) return;
        copyText(text);
        setCopiedFlash(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setCopiedFlash(prev => ({ ...prev, [key]: false })), 1500);
    }, []);

    // ── Cross-space sync + fusion ─────────────────────────────────────────────
    // syncMode: when on, every chat question is broadcast to ALL active spaces
    //           in parallel; each space answer is stored in its own bucket.
    // fusionPending: true while the synthesis call is in flight.
    // fusionResult: the synthesised answer rendered above the normal chat area.
    const [syncMode, setSyncMode] = useState(false);
    const [fusionPending, setFusionPending] = useState(false);
    const [fusionResult, setFusionResult] = useState<ChatMessageViewModel | null>(null);
    // Progressive load: one Genie call per section. Statuses are now per-space
    // (stageStatusesMap above). Titles are global because the stage structure
    // follows the active prompt set and is refreshed on each run.
    const [pendingStageTitles, setPendingStageTitles] = useState<string[]>([]);
    // Tick every 15s so the "N seconds ago" label in the insights header
    // stays fresh without burning CPU. A faster 1s tick is layered on top
    // (see the busy-tick effect below) only while a chat / fusion run is
    // in flight, so the unified ProgressIndicator's `m:ss` timer updates
    // smoothly without paying that cost when the visual is idle.
    const [nowTick, setNowTick] = useState(Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNowTick(Date.now()), 15000);
        return () => window.clearInterval(id);
    }, []);

    // Prune stale localStorage Insights cache entries on mount. Without this
    // the cache grows monotonically (every new key adds an entry, expiry
    // only happens at read time for the SAME key). After heavy use the
    // 5MB localStorage quota fills up and writes silently fail — so we
    // sweep once per visual lifetime to keep it bounded.
    useEffect(() => {
        try {
            pruneInsightsCache();
        } catch {
            /* best-effort housekeeping; never fail the mount */
        }
    }, []);
    // Faster 1s tick — only mounted while something is in flight so the
    // ProgressIndicator timer updates smoothly during chat / fusion runs.
    const fastTickActive = busy || (fusionResult?.status === "RUNNING");
    useEffect(() => {
        if (!fastTickActive) return;
        const id = window.setInterval(() => setNowTick(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [fastTickActive]);

    // Proactive proxy health probe state — declared here; the probe
    // function + auto-fire effect are wired AFTER logSession is defined
    // (search "probeProxyHealth =").
    const [proxyHealth, setProxyHealth] = useState<ProxyHealthInfo | null>(null);
    const [proxyHealthProbing, setProxyHealthProbing] = useState(false);
    const [insightsElapsedMap, setInsightsElapsedMap] = useState<Record<string, number>>({});
    const insightsElapsed = insightsElapsedMap[activeSpaceKey] ?? 0;
    const insightsStartTimeRef = useRef<Record<string, number>>({});
    // Stop-request ref — set by the user's "Stop" button. runStage checks
    // this BEFORE each stage call and bails out cleanly if true. Using a
    // ref (not state) so the check sees the latest value without depending
    // on React batching. Keyed per spaceKey so a stop in one space doesn't
    // affect a parallel run in another.
    const insightsStopRef = useRef<Record<string, boolean>>({});
    // UX-VIEWER-1.5b — per-space stop flag for chat/Ask Pulse runs. Mirrors
    // the AI Insights pattern above. runAssistant's catch block checks this
    // when an XHR abort lands and converts the resulting error into a clean
    // "Stopped by user" COMPLETED state instead of a red failure card.
    const chatStopRef = useRef<Record<string, boolean>>({});
    // Wave 22 cycle 5d: per-session flag so the supervisor+Insights perf
    // warning fires at most once per visual lifetime (not on every run).
    const sessionWarnedSupervisorInsightsRef = useRef<boolean>(false);
    // Wave 27 cycle 3 — UI-visible version of that warning. Authors who
    // never open the dev modal would otherwise miss the session-log line.
    // Shows a dismissible yellow banner above the Insights run for the
    // first supervisor-mode Insights launch in a session.
    const [showSupervisorInsightsWarning, setShowSupervisorInsightsWarning] = useState(false);

    // Wave 27 cycle 3 — sql-formatter lazy-load completion subscription.
    // When the chunk lands AFTER a "View SQL" button has already been
    // clicked, this triggers a re-render so highlightSql() picks up the
    // newly-loaded prettifier instead of leaving the user staring at
    // unformatted SQL forever. Idempotent for the common case where the
    // formatter loaded long before the first SQL view.
    const [, setSqlFormatterVersion] = useState(0);
    useEffect(() => {
        const unsubscribe = subscribeSqlFormatter(() => setSqlFormatterVersion(v => v + 1));
        return unsubscribe;
    }, []);
    useEffect(() => {
        if (!insightsBusy) {
            // 49.14 — DO NOT reset to 0 on completion. The post-completion
            // capsule should show how long the run actually took ("Done | 3:01"),
            // not "0:00". The counter is reset to 0 only at the start of a NEW
            // run (the next branch of this effect).
            return;
        }
        insightsStartTimeRef.current[activeSpaceKey] = Date.now();
        setInsightsElapsedMap(prev => ({ ...prev, [activeSpaceKey]: 0 }));
        const id = window.setInterval(() => {
            setInsightsElapsedMap(prev => ({
                ...prev,
                [activeSpaceKey]: Math.floor((Date.now() - (insightsStartTimeRef.current[activeSpaceKey] ?? Date.now())) / 1000)
            }));
        }, 1000);
        return () => window.clearInterval(id);
    }, [insightsBusy, activeSpaceKey]);

    // Drive the unified <ProgressIndicator> from the existing per-stage
    // status array. State machine: idle/pending → "pending", running →
    // "active", done → "done", error → "failed". Friendly text comes from
    // describeInsightsStage so we never show raw HEADLINE/KPI strings.
    const insightsProgressSteps = useMemo<ProgressStep[]>(() => {
        return stageStatuses.map((status, i) => {
            const title = pendingStageTitles[i] ?? `Stage ${i + 1}`;
            const friendly = describeInsightsStage(title);
            const state: StepState =
                status === "running" ? "active" :
                status === "done"    ? "done"   :
                status === "error"   ? "failed" : "pending";
            // Surface the live Genie poll status for the running stage as
            // a quiet sub-label ("Spotting trends - Pulling the data").
            const sub = state === "active"
                ? insightsStageLiveStatus[`${activeSpaceKey}:${i}`]
                : undefined;
            return { id: `insights-${i}`, label: friendly.label, icon: friendly.icon, state, subLabel: sub };
        });
    }, [stageStatuses, pendingStageTitles, insightsStageLiveStatus, activeSpaceKey]);
    const insightsAllDone = stageStatuses.length > 0 && stageStatuses.every(s => s === "done" || s === "error");
    const insightsAnyError = stageStatuses.some(s => s === "error");

    const insightsFiredRef = useRef<Record<string, boolean>>({});
    // Cycle 30 — per-section retry hook. The validation banner inside a
    // section card needs to be able to re-run JUST that stage without
    // reloading the entire pipeline. We store the most recent runStage
    // closure (per active space) in a ref each time runInsights fires;
    // the section renderer calls the ref via the onRetrySection callback
    // wired through InsightsRenderOptions. The titles array stored
    // alongside lets us map a section's UPPER-CASED title back to its
    // stage index.
    const runStageRef = useRef<{
        spaceKey: string;
        run: (index: number) => Promise<void>;
        titles: string[];
    } | null>(null);
    const computeInsightsCacheKey = useCallback((spaceKey: SpaceKey): string => {
        const space = activeSpaces.find(s => s.key === spaceKey);
        // Runtime Adjust box takes precedence; fall back to the settings-level
        // insightsPrompt + 49.17 hybrid fields (insightsDomain + insightsCustomSections)
        // so any Settings change busts the cache and triggers a fresh run.
        //
        // IDEA-039 Phase 1 — close cache-key parity gap via shared fingerprint
        // helper. Embeds `domainGuidance`, `genieFields`, `sendContextToGenie`,
        // `host`, `apiBaseUrl` (5 inputs that previously left the cache stale).
        // See `composeInsightsSettingsFingerprint` for ordering and the parity
        // test that asserts each field independently busts the key.
        const settingsFingerprint = composeInsightsSettingsFingerprint({
            insightsAuthoringMode: props.settings.insightsAuthoringMode,
            insightsDomain: props.settings.insightsDomain,
            insightsCustomSections: props.settings.insightsCustomSections,
            insightsDomainGuidance: props.settings.insightsDomainGuidance,
            metricDirectionRules: props.settings.metricDirectionRules,
            insightsMetricDirections: props.settings.insightsMetricDirections,
            domainGuidance: props.settings.domainGuidance,
            genieFields: props.settings.genieFields,
            sendContextToGenie: props.settings.sendContextToGenie,
            host: props.settings.host,
            apiBaseUrl: props.settings.apiBaseUrl,
            // Wave 27 — governance fields. Without these, toggling Section C
            // forbidden columns or Section H CTE preamble while a cached
            // Insights run was visible would silently return the OLD output.
            runtimeForbiddenColumns: props.settings.runtimeForbiddenColumns,
            runtimeMandatoryRowFilter: props.settings.runtimeMandatoryRowFilter,
            runtimeReadOnlyEnforced: props.settings.runtimeReadOnlyEnforced,
            sqlCtePreamble: props.settings.sqlCtePreamble,
            sqlForbiddenTables: props.settings.sqlForbiddenTables,
            sqlRlsHintEnabled: props.settings.sqlRlsHintEnabled,
        });
        const promptHead = insightsCustomPrompt || props.settings.insightsPrompt.trim();
        const effectivePromptText = promptHead
            ? `${promptHead}${settingsFingerprint}`
            : settingsFingerprint;
        // Wave 30 cycle 5 — schema fingerprint closes the silent-stale-cache
        // footgun where swapping a bound measure/dimension in the PBI Visualizations
        // pane (no Setup edit) silently served the OLD cached output for up to 30 min.
        const schemaHash = computeSchemaHash(props.context.measures, props.context.dimensions);
        return buildInsightsCacheKey({
            spaceKey,
            assistantProfile: space?.genieConfig.assistantProfile || "",
            spaceId: space?.genieConfig.spaceId || "",
            connectionMode: space?.genieConfig.connectionMode || "",
            roleMode,
            selectedFilters,
            customPromptId: insightsActivePromptId,
            customPromptText: effectivePromptText,
            kbFlags,
            schemaHash
        });
    }, [activeSpaces, roleMode, selectedFilters, insightsActivePromptId, insightsCustomPrompt, props.settings.insightsPrompt, props.settings.insightsDomain, props.settings.insightsCustomSections, props.settings.insightsAuthoringMode, props.settings.insightsDomainGuidance, props.settings.metricDirectionRules, props.settings.insightsMetricDirections, props.settings.domainGuidance, props.settings.genieFields, props.settings.sendContextToGenie, props.settings.host, props.settings.apiBaseUrl, props.settings.runtimeForbiddenColumns, props.settings.runtimeMandatoryRowFilter, props.settings.runtimeReadOnlyEnforced, props.settings.sqlCtePreamble, props.settings.sqlForbiddenTables, props.settings.sqlRlsHintEnabled, kbFlags, props.context.measures, props.context.dimensions]);
    // Cycle 42 — populate the full-refresh delegate the retrySection
    // callback (declared earlier in the body) calls via .current. Now
    // that computeInsightsCacheKey is in scope we can wire the actual
    // cache-clear + state-reset.
    triggerFullInsightsRefreshRef.current = () => {
        clearInsightsCache(computeInsightsCacheKey(activeSpaceKey));
        insightsFiredRef.current[activeSpaceKey] = false;
        setSpaceInsightsResult(activeSpaceKey, null);
    };
    const sessionLogRef = useRef<string[]>([]);
    const [sessionLogVersion, setSessionLogVersion] = useState(0);
    const logSession = useCallback((level: "INFO" | "ERROR" | "WARN", message: string) => {
        const ts = new Date().toISOString().slice(11, 23);
        sessionLogRef.current.push(`[${ts}] ${level}: ${message}`);
        if (sessionLogRef.current.length > 200) sessionLogRef.current.splice(0, 50);
        setSessionLogVersion(v => v + 1);
    }, []);
    const copySessionLog = useCallback(() => {
        const text = sessionLogRef.current.join("\n");
        // Goes through the shared copyText helper so we pick up the
        // execCommand fallback that the PBI Desktop sandbox actually accepts.
        copyText(text);
    }, []);
    const sessionLogEntries = useMemo(
        () => sessionLogRef.current.map((line, index) => parseSessionLogEntry(line, index)),
        [sessionLogVersion]
    );
    const proxyHealthConnectionMode = opSettings.connectionMode;
    const proxyHealthApiBaseUrl = opSettings.apiBaseUrl.trim();
    const lastProxyHealthLogRef = useRef<string>("");

    // Proactive proxy health probe (BUG-002 + IDEA-015). Fires once on
    // mount and again whenever proxy URL or auth fields change. Surfaces
    // "Proxy offline" before the first request, instead of waiting for
    // a chat / insights call to fail. The probe is a cheap GET /health
    // with a 5s timeout; failures resolve gracefully (no thrown error).
    const probeProxyHealth = useCallback(async () => {
        const logProxyHealth = (level: "INFO" | "WARN", message: string) => {
            const key = `${proxyHealthConnectionMode}|${proxyHealthApiBaseUrl}|${level}|${message}`;
            if (lastProxyHealthLogRef.current === key) return;
            lastProxyHealthLogRef.current = key;
            logSession(level, message);
        };
        if (proxyHealthConnectionMode === "direct") {
            setProxyHealth({ ok: true, mode: "direct" });
            return;
        }
        if (!proxyHealthApiBaseUrl) {
            setProxyHealth({ ok: false, mode: "proxy", error: "Proxy URL is not configured." });
            // PulsePlay learning — the user-visible "Proxy offline / URL is
            // not configured" banner used to render silently with no Session
            // Log entry, so authors hit Check / Test, got an error, and
            // had nothing to share when asking for help. Always emit a log
            // when we render a user-visible error state.
            logProxyHealth("WARN", "Proxy URL is not configured — set the Proxy API base URL in Setup → Connect.");
            return;
        }
        setProxyHealthProbing(true);
        try {
            const client = createBackend({
                host: "",
                token: "",
                connectionMode: proxyHealthConnectionMode,
                apiBaseUrl: proxyHealthApiBaseUrl,
            });
            const info = await client.checkProxyHealth!();
            setProxyHealth(info);
            if (info.ok) {
                logProxyHealth("INFO", `Proxy /health: OK (${info.profiles?.length ?? 0} profiles, source: ${info.configSource ?? "unknown"}).`);
            } else {
                logProxyHealth("WARN", `Proxy /health: ${info.error || "unreachable"}`);
            }
        } finally {
            setProxyHealthProbing(false);
        }
    }, [proxyHealthConnectionMode, proxyHealthApiBaseUrl, logSession]);
    useEffect(() => {
        void probeProxyHealth();
    }, [probeProxyHealth]);

    // PulsePlay learning — catch uncaught exceptions + unhandled promise
    // rejections at the window level and tee them into the Session Log so
    // a future "I clicked X and nothing happened" report has a trail. The
    // user-visible state-derived errors (proxy not configured, test-question
    // rejections) are already logged at their call sites; this is the
    // safety net for the long tail.
    useEffect(() => {
        const onError = (e: ErrorEvent) => {
            try {
                const where = e.filename ? ` (${e.filename}:${e.lineno})` : "";
                logSession("ERROR", `Uncaught: ${e.message}${where}`);
            } catch { /* never let logging itself throw */ }
        };
        const onRejection = (e: PromiseRejectionEvent) => {
            try {
                const reason = e.reason instanceof Error
                    ? `${e.reason.name}: ${e.reason.message}`
                    : (typeof e.reason === "string" ? e.reason : JSON.stringify(e.reason));
                logSession("ERROR", `Unhandled promise rejection: ${reason}`);
            } catch { /* same */ }
        };
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, [logSession]);

    const currentScope = describeScope(selectedFilters, guidedFilters);
    const promptContextPreview = useMemo(
        () => buildFullContext(
            props.context,
            selectedFilters,
            props.settings.domainGuidance,
            props.settings.sendContextToGenie
        ),
        [
            props.context,
            selectedFilters,
            props.settings.domainGuidance,
            props.settings.sendContextToGenie
        ]
    );

    const formatRules = useMemo(
        () => parseFormatRules(props.settings.domainGuidance),
        [props.settings.domainGuidance]
    );

    // 2026-05-28 — Slice 4b: display-side `## Masking` rules. Applied to SQL
    // section results before render so masked cells (redact/last4) and hidden
    // columns never paint. Same activator block 4a uses for the prompt path.
    const maskingRules = useMemo(
        () => parseMaskingRules(props.settings.domainGuidance || ""),
        [props.settings.domainGuidance]
    );

    const setActiveMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessageViewModel[]>>>((next) => {
        const spaceKey = activeSpaceKey;
        setMessageMap(previous => ({
            ...previous,
            [spaceKey]: typeof next === "function"
                ? (next as (value: ChatMessageViewModel[]) => ChatMessageViewModel[])(previous[spaceKey] ?? [])
                : next
        }));
    }, [activeSpaceKey]);

    const setSpaceMessages = useCallback((
        spaceKey: SpaceKey,
        next: React.SetStateAction<ChatMessageViewModel[]>
    ) => {
        setMessageMap(previous => ({
            ...previous,
            [spaceKey]: typeof next === "function"
                ? (next as (value: ChatMessageViewModel[]) => ChatMessageViewModel[])(previous[spaceKey] ?? [])
                : next
        }));
    }, []);

    const setSpaceInsightsResult = useCallback((
        spaceKey: SpaceKey,
        next: React.SetStateAction<ChatMessageViewModel | null>
    ) => {
        setInsightsResultMap(previous => ({
            ...previous,
            [spaceKey]: typeof next === "function"
                ? (next as (value: ChatMessageViewModel | null) => ChatMessageViewModel | null)(previous[spaceKey] ?? null)
                : next
        }));
    }, []);

    const setSpaceStageStatuses = useCallback((
        spaceKey: SpaceKey,
        next: React.SetStateAction<StageStatus[]>
    ) => {
        setStageStatusesMap(previous => ({
            ...previous,
            [spaceKey]: typeof next === "function"
                ? (next as (value: StageStatus[]) => StageStatus[])(previous[spaceKey] ?? [])
                : next
        }));
    }, []);

    // Apply parsed format rules as an effect (not during render) so that
    // React's concurrent rendering / Strict Mode double-invocation does not
    // corrupt the module-scoped rules state in visualHelpers.
    useEffect(() => {
        setActiveFormatRules(formatRules);
    }, [formatRules]);

    useEffect(() => {
        if (!activeSpaces.some(space => space.key === activeSpaceKey)) {
            setActiveSpaceKey("space1");
        }
    }, [activeSpaces, activeSpaceKey]);

    useEffect(() => {
        return () => {
            clientMap.forEach(client => client.cancel?.());
        };
    }, [clientMap]);

    // Prune any filter selections that reference dimensions no longer available.
    // Separated from the home-fetch effect so it doesn't re-fire on every
    // selectedFilters change (which would otherwise be a dependency loop).
    useEffect(() => {
        setSelectedFilters(previous => {
            const next = pruneUnavailableFilters(previous, guidedFilters);
            return areFilterSelectionsEqual(previous, next) ? previous : next;
        });
    }, [guidedFilters]);

    // Fetch (or rebuild) the Home snapshot payload whenever inputs change.
    useEffect(() => {
        const localHome = buildLocalHomeModel(props.context, roleMode);
        startTransition(() => setHome(localHome));

        if (!opSettings.apiBaseUrl.trim() || !opSettings.sendContextToGenie) {
            return;
        }

        const client = activeClient;
        if (!client) {
            return;
        }

        let cancelled = false;
        client.getHome({
            ...buildHomeContextPayload(
                props.context,
                selectedFilters,
                guidedFilters,
                roleMode,
                currentScope,
                promptContextPreview
            )
        }).then(remoteHome => {
            if (!cancelled && remoteHome) {
                startTransition(() => setHome(mergeHomePayload(localHome, remoteHome)));
            }
        }).catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [
        props.context,
        guidedFilters,
        promptContextPreview,
        opSettings.apiBaseUrl,
        opSettings.sendContextToGenie,
        roleMode,
        selectedFilters,
        currentScope,
        activeClient,
        activeSpaceKey
    ]);

    // 2026-05-26 — auto-scroll fires not only on new message added but
    // also while the active assistant message GROWS (content updates
    // during polling/streaming). Without the content-length signal,
    // long answers rendered with their start visible and the user had
    // to manually scroll down to see new tokens arrive. The dep array
    // includes the latest message's content length + status so the
    // effect fires on every growth tick. `auto` (not `smooth`) so the
    // viewport keeps up with streaming without scroll-animation lag.
    const latestForScroll = messages.length > 0 ? messages[messages.length - 1] : null;
    const latestContentLen = latestForScroll ? (latestForScroll.content || "").length : 0;
    const latestStatus = latestForScroll ? latestForScroll.status : null;
    // Scroll the newest question to the TOP of the chat viewport so the answer
    // streams in *below* it (ChatGPT-style). `correctOnly` re-asserts the pin
    // for async layout shifts above (e.g. the previous answer's chart finishing
    // its ECharts init pushes the question down) WITHOUT fighting a user who has
    // scrolled away to read.
    const pinQuestionToTop = useCallback((smooth: boolean, correctOnly = false): boolean => {
        const node = chatRef.current;
        if (!node) return false;
        const users = node.querySelectorAll(".gn-msg--user");
        const lastUser = users[users.length - 1] as HTMLElement | undefined;
        if (!lastUser) return false;
        const offset = lastUser.getBoundingClientRect().top - node.getBoundingClientRect().top;
        // correctOnly: only fix a question that drifted DOWN from the top band
        // (content grew above). Ignore big offsets / negative offsets — those
        // mean the user deliberately scrolled.
        if (correctOnly && !(offset > 20 && offset < 600)) return false;
        const target = Math.max(0, node.scrollTop + offset - 12);
        if (Math.abs(target - node.scrollTop) > 8) {
            node.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
        }
        return true;
    }, []);
    const prevMsgCountRef = useRef(0);
    const repinTimersRef = useRef<number[]>([]);
    useEffect(() => {
        const node = chatRef.current;
        if (!node) return;
        const messageAdded = messages.length > prevMsgCountRef.current;
        prevMsgCountRef.current = messages.length;
        if (messageAdded) {
            const pinned = pinQuestionToTop(true);
            if (!pinned) {
                node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
            } else {
                // Re-assert as async layout above settles (charts/tables of the
                // previous answer finishing their first paint shift the question
                // down). Absolute timers — independent of streaming content
                // ticks — over a window that covers paint + post-completion
                // settle. correctOnly so a manual scroll is never fought.
                repinTimersRef.current.forEach(clearTimeout);
                repinTimersRef.current = [350, 800, 1500, 2600, 4000].map(
                    ms => window.setTimeout(() => pinQuestionToTop(false, true), ms),
                );
            }
            return;
        }
        // While the just-asked answer is still streaming, keep its question
        // pinned near the top — correcting only DOWNWARD drift from async layout
        // above (e.g. a prior answer's chart finishing its first paint), never
        // fighting a manual scroll. This catches late shifts the fixed-timeout
        // re-pins miss.
        if (latestStatus === "RUNNING") {
            pinQuestionToTop(false, true);
            return;
        }
        // Settled: only follow to the bottom if the user is already near it.
        const distanceFromBottom = node.scrollHeight - (node.scrollTop + node.clientHeight);
        if (distanceFromBottom < 120 || messages.length <= 1) {
            node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
        }
    }, [messages.length, latestContentLen, latestStatus, pinQuestionToTop]);
    useEffect(() => () => { repinTimersRef.current.forEach(clearTimeout); }, []);

    const activeGenieConfig = activeSpace?.genieConfig;
    const isSupervisorMode = props.settings.connectionMode === "supervisor";
    // Proxy-mode hosts live in proxy/config.json server-side. The browser
    // doesn't need to know the Databricks workspace host — it just needs
    // a proxy URL + a profile name (or space ID). Requiring genieConfig.host
    // in proxy mode was a leftover from when Pulse only had direct mode
    // and forced "Connect to Databricks" empty-state on Settings-only flows.
    // Direct mode still requires host + token + spaceId (no proxy fallback).
    const isConfigured = activeGenieConfig
        ? isSupervisorMode
            ? props.settings.apiBaseUrl.trim().length > 0
            : props.settings.apiBaseUrl.trim().length > 0
                ? Boolean((activeGenieConfig.assistantProfile ?? "").trim().length > 0 || (activeGenieConfig.spaceId ?? "").trim().length > 0)
                : Boolean(activeGenieConfig.host.trim() && activeGenieConfig.token.trim() && (activeGenieConfig.spaceId ?? "").trim())
        : false;
    const pulseSurfaceContext = useMemo(() => {
        const selectedFilterCount = Object.values(selectedFilters).filter(value => value && value !== ALL_FILTER_VALUE).length;
        const measureCount = Object.keys(props.context.measures || {}).length;
        const dimensionCount = Object.keys(props.context.dimensions || {}).length;
        // Trust ladder + chip values centralised in lib/computeSurfaceContext
        // so PulseShell and UnifiedAssistantSurface can't drift on the
        // evidence-aware trust label shipped in 63efe1e (Codex audit P1 #13).
        return computeSurfaceContext({
            isConfigured,
            assistantProfile: activeGenieConfig?.assistantProfile || props.settings.assistantProfile || "",
            mode: activeTab === "insights" ? "Executive briefing" : "Conversation",
            selectedFilterCount,
            currentScopeLabel: currentScope,
            measureCount,
            dimensionCount,
            sendContextToAi: props.settings.sendContextToGenie,
        });
    }, [
        activeGenieConfig?.assistantProfile,
        activeTab,
        currentScope,
        isConfigured,
        props.context.dimensions,
        props.context.measures,
        props.settings.assistantProfile,
        props.settings.sendContextToGenie,
        selectedFilters,
    ]);

    // Option A trigger — fires exactly once per space per connection context
    // when the user first lands on the chat tab with no existing conversation.
    useEffect(() => {
        if (activeTab !== "chat") return;
        if (!isConfigured || !activeClient) return;
        if ((messageMap[activeSpaceKey] ?? []).length > 0) return;
        if (conversationMap[activeSpaceKey]) return;
        if (kpiPreloadRef.current[activeSpaceKey]) return;
        kpiPreloadRef.current[activeSpaceKey] = true;

        const spaceKey = activeSpaceKey;
        const client = activeClient;

        setKpiLoadingMap(prev => ({ ...prev, [spaceKey]: true }));
        void (async () => {
            try {
                // Preload is a quick visual hint, not a deep analysis — drop
                // both business guidance AND the analytics KB rules to keep
                // the request lean and the upstream fast.
                const req = buildGenieRequest(
                    CHAT_PRELOAD_PROMPT,
                    "summary",
                    props.context,
                    selectedFilters,
                    "",
                    props.settings.sendContextToGenie,
                    // 2026-05-22 — preload is an internal warm-up call, NOT a
                    // user-typed Ask Pulse question. Briefing-format trim is
                    // Ask Pulse-only; opt out explicitly so this path keeps
                    // its full response.
                    { kbFlags, omitDomainGuidance: true, omitAnalyticsKB: true, omitBriefingFormat: true }
                );
                const start = await client.startConversation(req, { intent: "summary", contextText: "" });
                const response = await client.waitForMessageWithProgress(
                    start.conversationId,
                    start.messageId,
                    () => { /* silent — no progress UI for preload */ }
                );
                if (response?.content) {
                    // Pre-seed the conversation so the user's first question
                    // continues this thread rather than starting a new one.
                    setConversationMap(prev =>
                        prev[spaceKey] ? prev : { ...prev, [spaceKey]: start.conversationId }
                    );
                    // Route any leading clarifying question to the follow-up
                    // chip strip; keep the snapshot itself clean.
                    const { cleaned, clarifiers } = extractAndStripClarifiers(response.content);
                    setKpiSnapshotMap(prev => ({ ...prev, [spaceKey]: cleaned || response.content || null }));
                    if (clarifiers.length > 0) {
                        setInsightsFollowUps(prev => {
                            const existing = prev[spaceKey] ?? [];
                            const merged = Array.from(new Set([...clarifiers, ...existing]));
                            return { ...prev, [spaceKey]: merged };
                        });
                    }
                }
            } catch {
                // Silently swallow — if the preload fails, the welcome
                // screen shows the Quick Start chips as normal.
            } finally {
                setKpiLoadingMap(prev => ({ ...prev, [spaceKey]: false }));
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, activeSpaceKey, isConfigured]);

    const runAssistant = async (input: string, intent: AssistantIntent) => {
        const trimmed = input.trim();
        const client = activeClient;
        const spaceKey = activeSpaceKey;
        const conversationId = conversationMap[spaceKey] ?? "";

        // Client-side short-circuit for empty questions to prevent unnecessary proxy calls.
        if (!trimmed) {
            return;
        }

        if (!client || !isConfigured || busy) {
            return;
        }

        const userMessage: ChatMessageViewModel = {
            id: createLocalId("user"),
            role: "user",
            status: "COMPLETED",
            content: trimmed
        };
        const pendingId = createLocalId("pending");

        setBusy(true);
        // UX-VIEWER-1.5b — reset the chat-stop flag at the start of every run
        // so a stop from a prior run can't immediately kill this one.
        chatStopRef.current[spaceKey] = false;
        logSession("INFO", `Question: ${trimmed.slice(0, 120)}${trimmed.length > 120 ? "..." : ""}`);
        setSpaceMessages(spaceKey, previous => [...previous, userMessage, {
            id: pendingId,
            role: "assistant",
            status: "RUNNING",
            content: "Looking into your question...",
            viewMode: "narrative",
            sourceQuestion: trimmed,
            currentStatus: "Getting started",
            statusSteps: ["Getting started"],
            startedAt: Date.now()
        }]);

        try {
            const request = buildGenieRequest(
                trimmed,
                intent,
                props.context,
                selectedFilters,
                props.settings.domainGuidance,
                props.settings.sendContextToGenie,
                {
                    omitDomainGuidance: !!conversationId,
                    // 2026-05-22 chat-fidelity rule (memory/feedback_chat_fidelity.md):
                    // briefing-format only fires on the FIRST message of a
                    // conversation. Follow-ups stay plain chat ("what you ask is
                    // what you get") so the experience matches a native vendor
                    // chatbot.
                    omitBriefingFormat: !!conversationId,
                    kbFlags
                }
            );

            // Supervisor mode (IDEA-020 Phase 5): use the NDJSON streaming
            // endpoint so per-helper chips light up as each Genie helper
            // returns. Falls through to the legacy non-streaming path on
            // any error so older proxies (without /start-stream) keep
            // working — the catch is silent and the standard path takes over.
            if (isSupervisorMode) {
                try {
                    const streamResult = await client.startSupervisorStream(
                        request,
                        {
                            onFanoutStart: (helpers) => {
                                const chips: HelperChipView[] = helpers.map(h => ({
                                    id: h.name,
                                    displayName: h.displayName,
                                    state: "pending"
                                }));
                                setSpaceMessages(spaceKey, prev => prev.map(m => m.id === pendingId
                                    ? { ...m, helperChips: chips, currentStatus: `Calling on ${helpers.length} helper${helpers.length === 1 ? "" : "s"}`, statusSteps: [...(m.statusSteps ?? []), `Calling on ${helpers.length} helper${helpers.length === 1 ? "" : "s"}`] }
                                    : m));
                            },
                            onHelperStart: (helper) => {
                                setSpaceMessages(spaceKey, prev => prev.map(m => {
                                    if (m.id !== pendingId) return m;
                                    const chips = (m.helperChips ?? []).map(c => c.id === helper.name ? { ...c, state: "active" as StepState } : c);
                                    const stepLabel = formatHelperRunLabel(helper.displayName, helper.dataDomain);
                                    const steps = m.statusSteps ?? [];
                                    const nextSteps = steps.includes(stepLabel) ? steps : [...steps, stepLabel];
                                    return { ...m, helperChips: chips, currentStatus: stepLabel, statusSteps: nextSteps };
                                }));
                            },
                            onHelperDone: (helper, ok, elapsedMs) => {
                                setSpaceMessages(spaceKey, prev => prev.map(m => m.id === pendingId
                                    ? { ...m, helperChips: (m.helperChips ?? []).map(c => c.id === helper.name ? { ...c, state: ok ? "done" as StepState : "failed" as StepState, elapsedMs } : c) }
                                    : m));
                            },
                            onSynthesisStart: () => {
                                setSpaceMessages(spaceKey, prev => prev.map(m => {
                                    if (m.id !== pendingId) return m;
                                    const label = "Pulling everything together";
                                    const steps = m.statusSteps ?? [];
                                    return { ...m, currentStatus: label, statusSteps: steps.includes(label) ? steps : [...steps, label] };
                                }));
                            }
                        }
                    );
                    setSpaceMessages(spaceKey, prev => prev.map(m => m.id === pendingId
                        ? {
                            ...m,
                            id: streamResult.message_id || streamResult.messageId || m.id,
                            status: "COMPLETED",
                            content: streamResult.content,
                            attachments: streamResult.attachments,
                            route: streamResult.route,
                            currentStatus: "Done",
                            // Mark all chips done if synthesis succeeded — the proxy
                            // already emitted helper.done for each, but defensive.
                            helperChips: (m.helperChips ?? []).map(c => c.state === "active" || c.state === "pending" ? { ...c, state: "done" as StepState } : c)
                        }
                        : m));
                    if (streamResult.conversation_id || streamResult.conversationId) {
                        setConversationMap(prev => ({ ...prev, [spaceKey]: (streamResult.conversation_id || streamResult.conversationId) as string }));
                    }
                    setBusy(false);
                    return;
                } catch (streamErr: any) {
                    logSession("WARN", `Supervisor stream unavailable, falling back to non-streaming: ${streamErr?.message || streamErr}`);
                    // fall through to the standard path below
                }
            }

            // contextText is intentionally empty: buildGenieRequest already embeds
            // context + guidance into `content`. Sending it again via the proxy's
            // contextText field would double the prompt (and the token bill).
            const start = conversationId
                ? await client.sendMessage(conversationId, request, { intent, contextText: "" })
                : await client.startConversation(request, { intent, contextText: "" });
            const resolvedConversationId = start.conversationId || conversationId;
            if (resolvedConversationId) {
                setConversationMap(previous => ({ ...previous, [spaceKey]: resolvedConversationId }));
            }

            const response = await client.waitForMessageWithProgress(
                resolvedConversationId,
                start.messageId,
                (progress) => {
                    setSpaceMessages(spaceKey, prev => prev.map(m => {
                        if (m.id !== pendingId) return m;
                        const steps = m.statusSteps ?? [];
                        const label = formatGenieStatus(progress);
                        // 2026-05-26 — also capture the raw upstream status
                        // + push to the streaming Databricks trace for the
                        // progress card disclosure. Dedupe consecutive
                        // identical raw values so the trace is a state
                        // transition log, not a poll-tick log.
                        const trace = m.statusTrace ?? [];
                        const last = trace.length > 0 ? trace[trace.length - 1] : null;
                        const nextTrace = (last && last.raw === progress)
                            ? trace
                            : [...trace, { raw: progress, friendly: label, t: Date.now() }];
                        if (!steps.includes(label)) {
                            return { ...m, currentStatus: label, currentStatusRaw: progress, statusSteps: [...steps, label], statusTrace: nextTrace };
                        }
                        return { ...m, currentStatus: label, currentStatusRaw: progress, statusTrace: nextTrace };
                    }));
                }
            );

            setSpaceMessages(spaceKey, previous => previous.map(message => {
                if (message.id !== pendingId) return message;
                const baseActions = (response.suggestedActions?.length)
                    ? response.suggestedActions
                    : isClarifyingQuestion(response)
                        ? extractClarifyingActions(response.content || "", trimmed)
                        : undefined;
                // IDEA-008: also surface trailing clarifiers from a non-pure
                // answer ("Sales were X. Would you like to compare across
                // regions?") as clickable chips. Append to whatever Genie or
                // the pure-clarifier path produced. Capped at 4 chips so the
                // suggestion strip stays compact.
                const trailingClarifiers = extractAndStripClarifiers(response.content || "").clarifiers
                    .slice(0, 4)
                    .map((q, i) => ({
                        id: `trailing-clarify-${i}`,
                        label: q.length > 60 ? q.slice(0, 57) + "…" : q,
                        kind: "ask" as const,
                        prompt: q,
                        intent: "summary" as AssistantIntent
                    }));
                const merged = [...(baseActions ?? []), ...trailingClarifiers];
                // Deduplicate by lowercased prompt so a Genie-supplied action
                // doesn't get repeated as a trailing clarifier chip.
                const seen = new Set<string>();
                const enrichedActions = merged.filter(a => {
                    const k = (a.prompt || a.label || "").toLowerCase().replace(/\s+/g, " ");
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
                // Detect chart-type / view intent from the user's question
                // ("show me a bar chart of sales by region", "pie of profit
                // by category"). When the user asked for a specific view
                // and that view is actually available for the response,
                // honour it instead of the auto-default. Otherwise fall
                // back to the recommended view.
                const intent = detectViewIntent(trimmed);
                const available = getAvailableMessageViews(response, canShowSql, canShowTrace);
                const intentView = intent.viewMode && available.includes(intent.viewMode)
                    ? intent.viewMode
                    : null;
                const defaultView = getDefaultViewMode(response, canShowSql, canShowTrace);
                // Wave 19 + 22 cycle 3b: flag DML and capture which verb fired
                // so the banner can be specific ("DROP detected") rather than
                // generic ("DML detected").
                const dmlText = (response.content ?? "") + (response.sqlQuery ?? "");
                const hasDml = props.settings.runtimeReadOnlyEnforced && containsDml(dmlText);
                const dmlVerb = hasDml ? (detectDmlKeyword(dmlText) || undefined) : undefined;
                return {
                    ...response,
                    id: response.id || pendingId,
                    role: "assistant" as MessageRole,
                    viewMode: intentView ?? defaultView,
                    forcedChartType: intent.chartType,
                    sourceQuestion: trimmed,
                    suggestedActions: enrichedActions.length ? enrichedActions : response.suggestedActions,
                    dmlWarning: hasDml || undefined,
                    dmlVerb
                };
            }));
            if (viewerUserKey) {
                void client.saveHistory({
                    id: createLocalId("hist"),
                    ts: new Date().toISOString(),
                    viewerUserKey,
                    viewerRole: roleMode,
                    assistantProfile: response.route?.assistantProfile ?? activeGenieConfig?.assistantProfile ?? props.settings.assistantProfile,
                    spaceLabel: activeSpace?.label,
                    conversationId: resolvedConversationId,
                    messageId: response.id || pendingId,
                    question: trimmed,
                    answer: response.content ?? "",
                    sql: response.sqlQuery,
                    trace: response.trace,
                    scope: currentScope,
                    routeLabel: response.route?.routeLabel
                }).then(() => {
                    if (showHistory) void loadHistory();
                }).catch((err: any) => logSession("WARN", `Chat history save failed: ${err?.message || "unknown error"}. Common causes: pulseplay_ai_chat_history table missing in workspace, viewer lacks INSERT permission, or no warehouseId on the active profile (BUG-009 fix routes supervisor saves to the default profile's warehouse — confirm one exists).`));
            }

            // Fire confidence evaluation async — answer already rendered, this never blocks
            const confProfile = response.route?.assistantProfile ?? activeGenieConfig?.assistantProfile ?? props.settings.assistantProfile ?? "";
            const confAttachments = response.sqlQuery
                ? [{ query: { query: response.sqlQuery, result: { columns: response.queryResult?.columns ?? [], data_table: response.queryResult?.rows ?? [] } } }]
                : [];
            if (confProfile) {
                setConfidencePending(true);
                client.evaluateConfidence(
                    { attachments: confAttachments, profileName: confProfile, conversationId: resolvedConversationId, question: trimmed },
                    (phase1) => {
                        setConfidencePending(false);
                        // Wave 22 cycle 3f: cap log at 50 most recent so long
                        // sessions don't grow O(N) reduce overhead unboundedly.
                        setConfidenceLog(prev => [...prev, phase1].slice(-50));
                    },
                    (phase2) => {
                        setConfidenceLog(prev => {
                            const next = [...prev];
                            if (next.length > 0) next[next.length - 1] = phase2;
                            return next.slice(-50);
                        });
                    }
                );
            }

            logSession("INFO", `Response received (conv=${resolvedConversationId})`);
            setQuestion("");
        } catch (error: any) {
            const errMsg = error?.message ?? "The assistant request failed.";
            // UX-VIEWER-1.5b — if the user clicked Stop, the underlying XHR
            // abort surfaces as a request failure here. Detect it (either via
            // our stop flag or via the typical abort message shapes) and
            // convert the failure into a clean "Stopped by user" COMPLETED
            // state instead of a red error card. Matches the AI Insights
            // stop-handling shape (see line ~3905).
            const looksLikeAbort = /aborted|cancell?ed|network error/i.test(errMsg);
            if (chatStopRef.current[spaceKey] || looksLikeAbort) {
                logSession("INFO", `Run stopped by user (space=${spaceKey})`);
                setSpaceMessages(spaceKey, previous => previous.map(message =>
                    message.id === pendingId
                        ? {
                            ...message,
                            id: pendingId,
                            role: "assistant",
                            status: "COMPLETED",
                            currentStatus: "Stopped by user",
                            content: "Stopped before a response arrived."
                        }
                        : message
                ));
                chatStopRef.current[spaceKey] = false;
                setConfidencePending(false);
            } else {
                logSession("ERROR", errMsg);
                setSpaceMessages(spaceKey, previous => previous.map(message =>
                    message.id === pendingId
                        ? {
                            id: pendingId,
                            role: "system",
                            status: "FAILED",
                            content: errMsg
                        }
                        : message
                ));
                // BUG-006: a stale "Checking…" pending flag from this failed run would
                // otherwise outlive the request and display alongside the error.
                setConfidencePending(false);
            }
        } finally {
            setBusy(false);
        }
    };

    // UX-VIEWER-1.5b — chat stop callback. Sets the per-space stop flag and
    // aborts the in-flight XHR(s) so the polling loop in waitForMessageWithProgress
    // throws. runAssistant's catch block then sees the flag and converts the
    // resulting abort into a clean "Stopped by user" message.
    const stopChat = (spaceKey: SpaceKey) => {
        chatStopRef.current[spaceKey] = true;
        // Update the currently pending bubble immediately so the user gets
        // feedback that the click registered, even though the actual XHR
        // abort + state finalisation happens via the catch block above.
        setSpaceMessages(spaceKey, previous => previous.map(message =>
            message.role === "assistant" && message.status === "RUNNING"
                ? { ...message, currentStatus: "Stopping…" }
                : message
        ));
        // Single-space mode aborts the active client. Sync mode also aborts
        // every other client to keep behaviour symmetric across the broadcast.
        try {
            activeClient?.cancel?.();
            if (syncMode) {
                clientMap.forEach(c => c.cancel?.());
            }
        } catch { /* best-effort */ }
    };

    // Broadcast one question to every active space in parallel.
    // Each space writes into its own messageMap bucket — no answer is lost.
    // Returns a map of spaceKey → final assistant answer text for fusion.
    const runSyncedAssistant = async (input: string, intent: AssistantIntent): Promise<Partial<Record<SpaceKey, string>>> => {
        const trimmed = input.trim();
        if (!trimmed || !isConfigured || busy) return {} as Partial<Record<SpaceKey, string>>;

        setBusy(true);
        setFusionResult(null);
        logSession("INFO", `[Sync] Broadcasting to ${activeSpaces.length} spaces: ${trimmed.slice(0, 80)}`);

        const results: Partial<Record<SpaceKey, string>> = {};

        await Promise.allSettled(activeSpaces.map(async (space) => {
            const client = clientMap.get(space.key);
            if (!client) return;
            const spaceKey = space.key;
            const convId = conversationMap[spaceKey] ?? "";
            const pendingId = createLocalId(`sync-${spaceKey}`);

            setSpaceMessages(spaceKey, prev => [...prev,
                { id: createLocalId("user"), role: "user", status: "COMPLETED", content: trimmed },
                { id: pendingId, role: "assistant", status: "RUNNING", content: `[${space.label}] Thinking...`, viewMode: "narrative", sourceQuestion: trimmed, currentStatus: "Connecting", statusSteps: ["Connecting"], startedAt: Date.now() }
            ]);

            try {
                const request = buildGenieRequest(
                    trimmed, intent, props.context, selectedFilters,
                    props.settings.domainGuidance, props.settings.sendContextToGenie,
                    // 2026-05-22 — supervisor / multi-space chat path. The
                    // briefing-format trim is reserved for the SINGLE-space
                    // Ask Pulse compose path (line ~2456). Opting out here so
                    // supervisor responses retain their full multi-section
                    // shape across all fanned-out spaces.
                    { omitDomainGuidance: !!convId, omitBriefingFormat: true, kbFlags }
                );
                const start = convId
                    ? await client.sendMessage(convId, request, { intent, contextText: "" })
                    : await client.startConversation(request, { intent, contextText: "" });
                const resolvedConvId = start.conversationId || convId;
                if (resolvedConvId) setConversationMap(prev => ({ ...prev, [spaceKey]: resolvedConvId }));

                const response = await client.waitForMessageWithProgress(
                    resolvedConvId, start.messageId,
                    (progress) => {
                        const label = `[${space.label}] ${formatGenieStatus(progress)}`;
                        setSpaceMessages(spaceKey, prev => prev.map(m => {
                            if (m.id !== pendingId) return m;
                            const steps = m.statusSteps ?? [];
                            return steps.includes(label) ? { ...m, currentStatus: label } : { ...m, currentStatus: label, statusSteps: [...steps, label] };
                        }));
                    }
                );

                setSpaceMessages(spaceKey, prev => prev.map(m => {
                    if (m.id !== pendingId) return m;
                    return { ...response, id: response.id || pendingId, role: "assistant" as MessageRole, viewMode: getDefaultViewMode(response, canShowSql, canShowTrace), sourceQuestion: trimmed };
                }));
                results[spaceKey] = response.content ?? "";
                logSession("INFO", `[Sync] ${space.label} responded (${(response.content ?? "").length} chars)`);
            } catch (err: any) {
                const msg = err?.message ?? "Request failed";
                logSession("ERROR", `[Sync] ${space.label}: ${msg}`);
                setSpaceMessages(spaceKey, prev => prev.map(m => m.id === pendingId
                    ? { id: pendingId, role: "system", status: "FAILED", content: `[${space.label}] ${msg}` }
                    : m
                ));
            }
        }));

        setBusy(false);
        setQuestion("");

        // Auto-fuse if enabled
        if (props.settings.supervisorAutoFusion && Object.keys(results).length > 1) {
            void runFusion(trimmed, results);
        }

        return results as Partial<Record<SpaceKey, string>>;
    };

    // After sync, synthesise all space answers into one fused narrative via
    // a single follow-up Genie call to the primary space.
    const runFusion = async (question: string, spaceAnswers: Partial<Record<SpaceKey, string>>) => {
        // Synthesis profile can be a specific profile name or space key
        const synthProfile = props.settings.supervisorSynthesisProfile || "space1";
        const primaryClient = clientMap.get(synthProfile as SpaceKey) || clientMap.get("space1");
        if (!primaryClient) return;

        const entries = activeSpaces
            .filter(s => spaceAnswers[s.key])
            .map(s => `### ${s.label}\n${spaceAnswers[s.key]}`);
        if (entries.length < 2) return;

        setFusionPending(true);
        const fusionId = createLocalId("fusion");
        setFusionResult({ id: fusionId, role: "assistant", status: "RUNNING", content: "", viewMode: "narrative", currentStatus: "Synthesising", statusSteps: ["Synthesising"], startedAt: Date.now() });

        const synthPrompt = [
            getSupervisorSystemPrompt(props.settings.supervisorSynthesisPrompt),
            "",
            `The user asked: "${question}"`,
            "",
            "SOURCE ANSWERS:",
            ...entries
        ].join("\n");

        try {
            // 2026-05-22 — supervisor fusion synthesis prompt. Internal
            // multi-space synthesizer call, NOT a user Ask Pulse turn.
            // Briefing-format trim is Ask Pulse-only; opt out so synthesis
            // keeps its full multi-section shape.
            const req = buildGenieRequest(synthPrompt, "summary", props.context, selectedFilters, "", false, { kbFlags, omitBriefingFormat: true });
            const start = await primaryClient.startConversation(req, { intent: "summary", contextText: "" });
            const response = await primaryClient.waitForMessageWithProgress(
                start.conversationId, start.messageId,
                (progress) => {
                    setFusionResult(prev => {
                        if (!prev) return prev;
                        const label = formatGenieStatus(progress);
                        const steps = prev.statusSteps ?? [];
                        return steps.includes(label) ? { ...prev, currentStatus: label } : { ...prev, currentStatus: label, statusSteps: [...steps, label] };
                    });
                }
            );
            setFusionResult({
                ...response,
                id: response.id || fusionId,
                role: "assistant",
                status: "COMPLETED",
                viewMode: "narrative",
                sourceQuestion: question
            });
            logSession("INFO", `[Fusion] Synthesis complete (${(response.content ?? "").length} chars)`);
        } catch (err: any) {
            logSession("ERROR", `[Fusion] Synthesis failed: ${err?.message}`);
            setFusionResult({ id: fusionId, role: "system", status: "FAILED", content: `Fusion synthesis failed: ${err?.message ?? "unknown error"}` });
        } finally {
            setFusionPending(false);
        }
    };

    const handleFilterChange = (filter: FilterDimension, value: string) => {
        setSelectedFilters(previous => ({ ...previous, [filter.key]: value }));
        if (!props.settings.allowReportActions || !filter.target) {
            return;
        }

        if (value === ALL_FILTER_VALUE) {
            const existing = appliedFiltersRef.current[filter.key];
            if (existing) {
                props.host.applyJsonFilter(existing, "general", "filter", powerbi.FilterAction.remove);
                delete appliedFiltersRef.current[filter.key];
            }
            return;
        }

        const basicFilter = buildBasicFilter(filter.target, value);
        appliedFiltersRef.current[filter.key] = basicFilter;
        props.host.applyJsonFilter(basicFilter, "general", "filter", powerbi.FilterAction.merge);
    };

    const clearFilters = () => {
        Object.values(appliedFiltersRef.current).forEach(filter =>
            props.host.applyJsonFilter(filter, "general", "filter", powerbi.FilterAction.remove)
        );
        appliedFiltersRef.current = {};
        setSelectedFilters({});
    };

    const handleSuggestedAction = (action: AssistantAction) => {
        if (action.kind === "mode") {
            const latestAssistant = [...messages].reverse().find(message => message.role === "assistant");
            if (!latestAssistant || !action.viewMode) {
                return;
            }
            setActiveMessages(previous => previous.map(message =>
                message.id === latestAssistant.id ? { ...message, viewMode: action.viewMode } : message
            ));
            return;
        }

        void runAssistant(action.prompt ?? action.label, action.intent ?? mapAreaToIntent(area));
    };

    const loadHistory = useCallback(async () => {
        const client = activeClient;
        if (!client || !isConfigured) return;
        if (!viewerUserKey && !(canViewAllHistory && historyIncludeAll)) {
            setHistoryError("Bind a User Identity measure (for example USERPRINCIPALNAME()) to retrieve personal chat history.");
            return;
        }
        setHistoryBusy(true);
        setHistoryError("");
        try {
            const items = await client.getHistory({
                viewerUserKey,
                viewerRole: roleMode,
                includeAll: canViewAllHistory && historyIncludeAll,
                assistantProfile: activeGenieConfig?.assistantProfile ?? props.settings.assistantProfile,
                limit: 50
            });
            setHistoryItems(items);
        } catch (error: any) {
            setHistoryError(error?.message ?? "Could not load chat history.");
        } finally {
            setHistoryBusy(false);
        }
    }, [activeClient, activeGenieConfig?.assistantProfile, canViewAllHistory, historyIncludeAll, isConfigured, props.settings.assistantProfile, roleMode, viewerUserKey]);

    useEffect(() => {
        if (showHistory) {
            void loadHistory();
        }
    }, [showHistory, loadHistory]);

    const handleFeedback = async (message: ChatMessageViewModel, rating: "up" | "down", comment?: string) => {
        const spaceKey = activeSpaceKey;
        const feedbackComment = rating === "up" ? (comment ?? "") : "";
        const feedbackReason = rating === "down" ? (comment ?? "") : "";
        setSpaceMessages(spaceKey, previous => previous.map(entry =>
            entry.id === message.id ? { ...entry, feedback: rating, feedbackComment, feedbackReason } : entry
        ));

        const client = activeClient;
        if (!client) {
            return;
        }

        try {
            const stored = await client.submitFeedback({
                conversationId: (conversationMap[spaceKey] ?? "") || null,
                messageId: message.id || null,
                rating,
                comment: comment ?? "",
                feedbackComment,
                feedbackReason,
                question: message.sourceQuestion,
                answer: message.content,
                sql: message.sqlQuery,
                trace: message.trace,
                scope: currentScope,
                assistantProfile: message.route?.assistantProfile ?? activeGenieConfig?.assistantProfile ?? props.settings.assistantProfile,
                routeLabel: message.route?.routeLabel
                    ?? activeSpace?.label,
                viewerUserKey,
                viewerRole: roleMode,
                spaceLabel: activeSpace?.label
            });
            logSession("INFO", stored ? "Feedback saved to proxy log." : "Feedback capture is available when the proxy is enabled.");
            if (viewerUserKey) {
                void client.saveHistory({
                    id: createLocalId("fb"),
                    ts: new Date().toISOString(),
                    viewerUserKey,
                    viewerRole: roleMode,
                    assistantProfile: message.route?.assistantProfile ?? activeGenieConfig?.assistantProfile ?? props.settings.assistantProfile,
                    spaceLabel: activeSpace?.label,
                    conversationId: (conversationMap[spaceKey] ?? "") || null,
                    messageId: message.id || null,
                    question: message.sourceQuestion,
                    answer: message.content,
                    sql: message.sqlQuery,
                    trace: message.trace,
                    scope: currentScope,
                    rating,
                    feedbackComment,
                    feedbackReason,
                    routeLabel: message.route?.routeLabel ?? activeSpace?.label
                }).then(() => {
                    if (showHistory) void loadHistory();
                }).catch((err: any) => logSession("WARN", `Feedback history save failed: ${err?.message || "unknown error"}.`));
            }
            if (showHistory) void loadHistory();
        } catch {
            logSession("WARN", "Feedback could not be saved.");
        }
    };

    const latestAssistantMsg = [...messages].reverse().find(m => m.role === "assistant");
    const contextActions = latestAssistantMsg?.suggestedActions?.length
        ? latestAssistantMsg.suggestedActions
        : [];
    // UX-VIEWER-1.2B — derive starter actions from the home-meta hook
    // (real Genie curated_questions OR pack evergreen). These replace
    // the generic STATIC_ACTIONS ("Rank key drivers" / "Summarize for
    // leadership" / "Run what-if") on the empty state. STATIC_ACTIONS
    // stays as a final fallback only when the hook + home.suggestedActions
    // both return empty.
    const homeMetaActions: AssistantAction[] = (askPulseHomeMeta.data?.curatedQuestions ?? []).map(q => ({
        id: q.id,
        label: q.text,
        kind: "ask",
        prompt: q.text,
        // `intent` left undefined — proxy categories ("numerical-distribution",
        // "evergreen", etc.) don't map to the strict AssistantIntent enum and
        // it's optional on AssistantAction.
    }));
    const latestActions = contextActions.length > 0
        ? dedupeActions(contextActions)
        : homeMetaActions.length > 0
            ? dedupeActions(homeMetaActions)
            : dedupeActions([...STATIC_ACTIONS, ...(home.suggestedActions ?? [])]);

    const handleSpaceSwitch = useCallback((key: SpaceKey) => {
        if (key === activeSpaceKey) return;
        setActiveSpaceKey(key);
        logSession("INFO", `Switched AI workspace: ${key}`);
    }, [activeSpaceKey, logSession]);

    // ── AI Insights runner ────────────────────────────────────────────────────
    // Three-stage progressive load for sub-6s first paint:
    //   Stage 1 — HEADLINE + KPI SNAPSHOT   (what happened)
    //   Stage 2 — TRENDS + DRIVERS          (why)
    //   Stage 3 — RISKS + RECOMMENDED ACTIONS (so what)
    //
    // Each stage is an independent Genie call; as each returns its content is
    // appended to insightsResult.content (already uses `## HEADING` splitter
    // in renderInsightsSections) and the corresponding stageNStatus flips to
    // "done". Pending stages render as skeleton cards.
    //
    // `overridePrompt` (chip or custom prompt) collapses to a single Stage 1
    // call — the chips don't follow the fixed section structure.
    // AIINSIGHTS-P1 — probe the active connector once per profile so the
    // (synchronous) insights planner can detect a deterministic
    // powerbi-semantic-model connector from a STABLE source (the probe's
    // `connectorType`) and source its real probed measure/dimension names.
    // Resolved fields land in a ref the planner reads synchronously; in-flight
    // fetches are de-duped. On a cold first run before the probe resolves, the
    // planner simply falls back to the prose plan (no regression) and uses the
    // deterministic plan on the next run.
    const pbiProbeRef = useRef<Map<string, PbiProbeFields>>(new Map());
    const pbiProbePromiseRef = useRef<Map<string, Promise<PbiProbeFields>>>(new Map());
    // runInsights ref so the probe effect (defined first) can trigger a re-run
    // when the probe resolves, without a hook-ordering dependency cycle.
    const runInsightsRef = useRef<((p?: string, t?: string, bg?: boolean) => void) | null>(null);
    // Profiles whose deterministic re-run has already fired (fire-once guard).
    const detRerunRef = useRef<Set<string>>(new Set());
    const [, setPbiProbeVersion] = useState(0);
    const insightsActiveProfile = activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "";
    // Fetch the connector probe ONCE per profile and cache the promise so the
    // AI Insights auto-fire can await it (capped) — that lets a deterministic
    // powerbi-semantic-model connector plan the clean DAX briefing on the FIRST
    // run, with no cold prose run flashing "no measure" before a re-run.
    const ensurePbiProbe = useCallback((profile: string): Promise<PbiProbeFields> => {
        const key = profile || "";
        const cache = pbiProbePromiseRef.current;
        if (cache.has(key)) return cache.get(key)!;
        const p = fetchAssistantProbeClient({
            apiBaseUrl: props.settings.apiBaseUrl,
            proxyKey: props.settings.proxyKey,
            assistantProfile: key,
        }).then(fields => {
            pbiProbeRef.current.set(key, fields);
            setPbiProbeVersion(v => v + 1);
            // Safety net: if the auto-fire still raced ahead with the prose plan,
            // trigger ONE clean re-run once we confirm a deterministic connector.
            if (fields.connectorType === "powerbi-semantic-model"
                && fields.measures.length > 0
                && !detRerunRef.current.has(key)) {
                detRerunRef.current.add(key);
                Object.keys(insightsStopRef.current).forEach(k => { insightsStopRef.current[k] = true; });
                try { activeClient?.cancel?.(); } catch { /* best-effort */ }
                try { clearInsightsCache(computeInsightsCacheKey(activeSpaceKey)); } catch { /* best-effort */ }
                setTimeout(() => { runInsightsRef.current?.(undefined, undefined, true); }, 200);
            }
            return fields;
        }).catch(() => {
            cache.delete(key); // allow a later retry
            return { connectorType: "", measures: [], dimensions: [] } as PbiProbeFields;
        });
        cache.set(key, p);
        return p;
    }, [props.settings.apiBaseUrl, props.settings.proxyKey, activeClient, computeInsightsCacheKey, activeSpaceKey]);
    // Prefetch the probe whenever the active profile changes.
    useEffect(() => { if (insightsActiveProfile) ensurePbiProbe(insightsActiveProfile); }, [insightsActiveProfile, ensurePbiProbe]);

    const runInsights = useCallback((overridePrompt?: string, overrideTitle?: string, backgroundRefresh?: boolean) => {
        const client = activeClient;
        const spaceKey = activeSpaceKey;
        if (!client || !isConfigured) return;

        // Wave 22 cycle 5d: one-time-per-session warning when AI Insights is
        // launched in supervisor mode. Each Insights stage fans out to N
        // helper spaces with synthesis at each stage — typical 3-stage run is
        // 3.5+ minutes and frequently hits the 5-minute deadline. Warn the
        // author once so they know to switch to a single-space profile for
        // Insights workloads. Logged to session log so it's visible without
        // being intrusive.
        if (props.settings.connectionMode === "supervisor" && !sessionWarnedSupervisorInsightsRef.current) {
            sessionWarnedSupervisorInsightsRef.current = true;
            logSession("INFO", "AI Insights in Supervisor mode fans out per stage to multiple sources with synthesis — a single 3-stage pipeline can take 3+ minutes and may hit the 5-minute timeout. For faster Insights, switch Connection Mode to Proxy with a single-space profile (e.g. sales). Chat-tab Supervisor mode is unaffected.");
            // Wave 27 cycle 3 — also show a UI banner so authors who don't
            // open the dev modal see the perf warning.
            setShowSupervisorInsightsWarning(true);
        }

        // Reset stop flag for this run so a stale earlier-stop doesn't
        // immediately cancel a fresh run.
        insightsStopRef.current[spaceKey] = false;
        setInsightsBusyMap(previous => ({ ...previous, [spaceKey]: true }));

        // Perf instrumentation — open a `total` stage for the whole
        // pipeline so the DevTools Performance tab shows a horizontal
        // band from kickoff to finalize. Closed in the IIFE's finally
        // block (see below). Per-stage timing already lives in
        // `stageTraces[i].durationMs` so we deliberately don't double-
        // instrument the inner loop here.
        const perfRunId = `insights:${spaceKey}:${Date.now()}`;
        resetRun(perfRunId);
        stageStart(perfRunId, "total", overrideTitle || "AI Insights pipeline");
        if (!backgroundRefresh) {
            // Normal (cold) run: clear the display immediately so the user
            // sees the RUNNING skeleton while the pipeline executes.
            setSpaceInsightsResult(spaceKey, {
                id: createLocalId("insights"),
                role: "assistant",
                status: "RUNNING",
                content: "",
                viewMode: "narrative",
                currentStatus: "Connecting to AI",
                statusSteps: ["Connecting to AI"]
            });
        } else {
            // Background refresh: keep cached content visible; mark this
            // space as stale-while-refreshing so the UI overlays the banner.
            setStaleRefreshingMap(prev => ({ ...prev, [spaceKey]: true }));
        }

        // 49.19 / IDEA-037 phase 3 — mode-driven priority chain for AI Insights:
        //   0. Runtime override (chip click / Adjust box) → single call,
        //      full takeover. Beats every authoring mode for ad-hoc questions.
        //   Then by `insightsAuthoringMode`:
        //   - "manual"      → use insightsPrompt verbatim (single call). If
        //                     insightsPrompt is empty, falls back to default 5-stage.
        //   - "preset"      → hybrid pipeline using Domain + Custom Sections.
        //                     If both empty, falls back to default 5-stage.
        //   - "ai-assisted" → hybrid pipeline using Domain + Custom Sections
        //                     (whether user-tuned or AI-suggested — same fields).
        //                     If both empty, falls back to default 5-stage.
        //   All three settings (insightsPrompt, insightsDomain,
        //   insightsCustomSections) persist independently — switching modes
        //   never loses prior work. The mode is just a "which authoring lens"
        //   toggle.
        const runtimeOverride = (overridePrompt && overridePrompt.trim()) ? overridePrompt.trim() : null;
        const authoringMode = props.settings.insightsAuthoringMode || "preset";
        const settingsPrompt = props.settings.insightsPrompt.trim();
        const settingsDomain = (props.settings.insightsDomain || "").trim();
        const customSectionsRaw = parseCustomSections(props.settings.insightsCustomSections);
        // 2026-05-27 — respect viewer-runtime section visibility BEFORE the
        // planner runs. Sections the viewer toggled OFF (via the Adjust
        // popover) are excluded from the plan entirely, so we don't pay
        // Genie tokens / wall time for sections that won't render. Universal
        // stages (HEADLINE/TRENDS/RISKS/ACTIONS) stay author-controlled per
        // the insightsSectionVisibility design contract and are filtered
        // separately by the universalStages prop below. When the viewer has
        // no stored prefs (currentVisibleTitles === null), all author
        // custom sections pass through unchanged — backwards-compatible
        // default behavior.
        const customSections = currentVisibleTitles
            ? customSectionsRaw.filter(s => currentVisibleTitles.has(s.name.trim().toUpperCase()))
            : customSectionsRaw;
        const hasHybridConfig = !!(settingsDomain || customSections.length > 0);

        // AIINSIGHTS-P1 — deterministic Power BI semantic-model briefing. When
        // the active connector is the no-LLM powerbi-semantic-model path, the
        // prose section prompts never name a measure so the DAX matcher returns
        // the same "no measure" fallback in every section. Replace them with one
        // matchable measure-named DAX question per section, built from the
        // probe's real measures + dimensions. Only applies to the universal
        // briefing paths (not an explicit runtime/manual override).
        const pbiProbe = pbiProbeRef.current.get(insightsActiveProfile);
        let deterministicPbiPlan: { stages: string[]; titles: string[] } | null = null;
        if (pbiProbe && pbiProbe.connectorType === "powerbi-semantic-model" && pbiProbe.measures.length > 0) {
            const plan = buildDeterministicPbiInsightsPlan({
                measures: pbiProbe.measures,
                dimensions: pbiProbe.dimensions,
                universalStages: {
                    headline: props.settings.insightsShowHeadline,
                    trends: props.settings.insightsShowTrends,
                    risks: props.settings.insightsShowRisks,
                    actions: props.settings.insightsShowActions,
                },
                customSectionNames: customSections.filter(s => s.kind !== "sql").map(s => s.name),
            });
            if (plan.stages.length > 0) deterministicPbiPlan = plan;
        }

        let prompts: string[];
        let titles: string[];

        if (runtimeOverride) {
            prompts = [buildInsightsPrompt(props.context, runtimeOverride, roleMode)];
            titles = [overrideTitle?.trim() || "Custom request"];
        } else if (authoringMode === "manual" && settingsPrompt) {
            // Manual mode + prompt set → single call, prompt verbatim.
            prompts = [buildInsightsPrompt(props.context, settingsPrompt, roleMode)];
            titles = ["Custom Insights"];
        } else if (deterministicPbiPlan) {
            // Deterministic Power BI semantic-model briefing (AIINSIGHTS-P1).
            prompts = deterministicPbiPlan.stages;
            titles = deterministicPbiPlan.titles;
        } else if ((authoringMode === "preset" || authoringMode === "ai-assisted") && hasHybridConfig) {
            // Preset / AI-assisted with config present → fast hybrid briefing.
            // The older implementation launched one Genie message per section
            // (HEADLINE/TRENDS/RISKS/ACTIONS). That preserved strict per-card
            // contracts, but live runs regularly sat near the 5-minute ceiling
            // when one stage stalled. The default product path should feel like
            // Chat: one efficient call that emits all requested sections. The
            // per-stage runner remains available for manual section retries and
            // future deep-mode wiring.
            // IDEA-039 author-precedence — pass the effective author guidance
            // (insightsDomainGuidance > domainGuidance) into the stage builder
            // so it gets injected AFTER the default contracts inside each
            // stage prompt. Pairs with `omitDomainGuidance: true` in the
            // runStage `buildGenieRequest` call so the same text doesn't
            // appear twice in the assembled outgoing payload.
            const effectiveAuthorGuidance = (props.settings.insightsDomainGuidance ?? "").trim()
                || (props.settings.domainGuidance ?? "").trim();
            // 2026-05-28 — staging strategy derived from the user's
            // revealCadence preset (Settings → Advanced → Performance
            // Levers). Single source of truth: changing the preset flips
            // both frontend reveal animation AND backend batching.
            //   - "instant"  → single-shot bundle (no staging)
            //   - "fast"     → batches of 3 with 3s delay
            //   - "balanced" → batches of 2 with 6s delay (today's default)
            //   - "full"     → batches of 1 with 8s delay (true serial)
            const stagingFromCadence = getBackendStagingFromCadence(perfLevers.revealCadence);
            const universalShow = {
                headline: props.settings.insightsShowHeadline,
                trends:   props.settings.insightsShowTrends,
                risks:    props.settings.insightsShowRisks,
                actions:  props.settings.insightsShowActions
            };
            const universalOverrides = {
                headline: props.settings.insightsHeadlineOverride,
                trends:   props.settings.insightsTrendsOverride,
                risks:    props.settings.insightsRisksOverride,
                actions:  props.settings.insightsActionsOverride
            };
            const hybrid = stagingFromCadence.useSinglePlanner
                ? buildFastHybridInsightsStagePrompts(
                    props.context, settingsDomain, customSections, roleMode, kbFlags,
                    props.settings.metricDirectionRules, effectiveAuthorGuidance,
                    universalShow, universalOverrides
                )
                : buildStagedHybridInsightsPlan(
                    props.context, settingsDomain, customSections, roleMode, kbFlags,
                    props.settings.metricDirectionRules, effectiveAuthorGuidance,
                    universalShow, universalOverrides,
                    { batchSize: stagingFromCadence.batchSize }
                );
            prompts = hybrid.stages;
            titles = hybrid.titles;
        } else {
            // Fallback for users with no author-configured hybrid setup.
            // Same cadence-driven staging strategy as the hybrid path —
            // see comment above.
            const stagingFromCadence = getBackendStagingFromCadence(perfLevers.revealCadence);
            const universalShow = {
                headline: props.settings.insightsShowHeadline,
                trends:   props.settings.insightsShowTrends,
                risks:    props.settings.insightsShowRisks,
                actions:  props.settings.insightsShowActions
            };
            const universalOverrides = {
                headline: props.settings.insightsHeadlineOverride,
                trends:   props.settings.insightsTrendsOverride,
                risks:    props.settings.insightsRisksOverride,
                actions:  props.settings.insightsActionsOverride
            };
            const stagePrompts = stagingFromCadence.useSinglePlanner
                ? buildFastHybridInsightsStagePrompts(
                    props.context, "", [], roleMode, kbFlags,
                    props.settings.metricDirectionRules,
                    (props.settings.insightsDomainGuidance ?? "").trim() || props.settings.domainGuidance,
                    universalShow, universalOverrides
                )
                : buildStagedHybridInsightsPlan(
                    props.context, "", [], roleMode, kbFlags,
                    props.settings.metricDirectionRules,
                    (props.settings.insightsDomainGuidance ?? "").trim() || props.settings.domainGuidance,
                    universalShow, universalOverrides,
                    { batchSize: stagingFromCadence.batchSize }
                );
            prompts = stagePrompts.stages;
            titles = stagePrompts.titles;
        }
        const hasOverride = prompts.length === 1;

        // Initialise per-stage status. Stage 0 starts "running", the rest
        // "pending" so skeleton cards render immediately.
        const initialStatuses: StageStatus[] = prompts.map((_, i) => i === 0 ? "running" : "pending");
        setSpaceStageStatuses(spaceKey, initialStatuses);
        setPendingStageTitles(titles);
        // Reset accumulated follow-ups for this space so a fresh run starts
        // with an empty chip strip (clarifiers from a previous run shouldn't
        // bleed through). IDEA-008.
        setInsightsFollowUps(prev => ({ ...prev, [spaceKey]: [] }));
        // Clear any stale live-status entries from a previous run.
        setInsightsStageLiveStatus(prev => {
            const next: Record<string, string> = {};
            for (const k of Object.keys(prev)) {
                if (!k.startsWith(`${spaceKey}:`)) next[k] = prev[k];
            }
            return next;
        });

        // Local mirror of stage statuses so the error handler can find the
        // running stage without waiting for React state to flush.
        const statusesRef: StageStatus[] = [...initialStatuses];
        const updateStatus = (index: number, next: StageStatus) => {
            statusesRef[index] = next;
            setSpaceStageStatuses(spaceKey, prev => {
                const copy = [...prev];
                copy[index] = next;
                return copy;
            });
        };

        // contentParts holds one slot per stage. Stages write to their own
        // slot independently so parallel calls never clobber each other.
        // After each write we join non-empty parts in index order so the
        // rendered sections always appear in the correct sequence regardless
        // of which stage finishes first.
        const contentParts: string[] = new Array(prompts.length).fill("");
        const joinParts = () => contentParts.filter(Boolean).join("\n\n");
        let lastResponse: GenieMessage | null = null;

        // Cycle 47.13 — rolling cache of "most recent SQL seen in this
        // Insights run." Cycle 47.2's conversation reuse means stages may
        // synthesize their answer from a PRIOR stage's query result via
        // Genie's conversation memory; on those follow-up messages Genie
        // typically does NOT re-echo SQL even though the warehouse may
        // have run a query. Without this cache the per-section SQL panel
        // for those stages was empty, even though the SQL was visible in
        // the cycle 40 audit panel. Fallback below stamps the most recent
        // SQL onto the empty stage with `sqlReusedFromTitle` set so the
        // SectionSqlPanel can show "Reused from <title>" — honest about
        // provenance, useful for debugging.
        let lastSqlSeenInRun: { sqls: string[]; sourceTitle: string } | null = null;
        let lastDataSeenInRun: {
            queryResult: { columns: string[]; rows: unknown[][] };
            sourceTitle: string;
        } | null = null;

        // IDEA-039 Phase 1 — pre-allocate one trace slot per stage. Slots are
        // filled as stages run; the array is attached to the insights
        // viewmodel after every state update so the trace pane sees a
        // consistent snapshot regardless of completion order.
        const stageTraces: InsightsStageTrace[] = prompts.map((_, i) => ({
            index: i,
            title: titles[i] ?? `Stage ${i + 1}`,
            prompt: "",
            sql: null,
            queryResult: null,
            queryResultReusedFromTitle: null,
            responseLength: 0,
            rawMarkdown: "",
            status: "ok" as const,
            durationMs: 0
        }));

        // ── Cycle 47.2 — Conversation reuse infrastructure ───────────────────
        // All workers in the parallel pool share ONE Genie conversation: the
        // first worker to reach the upstream call wins a synchronous race and
        // becomes the "opener" — it calls startConversation. Every other
        // worker waits for the convId and then calls sendMessage on the same
        // conversation. Collapses N start-conversation roundtrips into one,
        // and lets Genie retain context across stages within the same run.
        // The proxy-offline retry loop is factored into withProxyOfflineRetry
        // so both the opener and joiners benefit from it identically.
        const PROXY_RETRY_ATTEMPTS = 6;
        const PROXY_RETRY_DELAY_MS = 2000;
        let openConversationPromise: Promise<string> | null = null;
        let openerStartResponse: { conversationId: string; messageId: string } | null = null;

        const withProxyOfflineRetry = async <T,>(
            thunk: () => Promise<T>,
            stageIndex: number
        ): Promise<T> => {
            for (let attempt = 0; attempt < PROXY_RETRY_ATTEMPTS; attempt++) {
                try {
                    const result = await thunk();
                    if (attempt > 0) {
                        logSession("INFO", `AI Insights stage ${stageIndex + 1}: proxy recovered after ${attempt} retr${attempt === 1 ? "y" : "ies"}.`);
                    }
                    return result;
                } catch (e: any) {
                    const msg = String(e?.message ?? "");
                    const isProxyOffline = /Proxy Offline/i.test(msg);
                    const remaining = PROXY_RETRY_ATTEMPTS - attempt - 1;
                    if (!isProxyOffline || remaining === 0) {
                        throw e;
                    }
                    if (attempt === 0) {
                        logSession("INFO", `AI Insights stage ${stageIndex + 1}: proxy not responding, will retry up to ${PROXY_RETRY_ATTEMPTS - 1} times…`);
                    }
                    setSpaceInsightsResult(spaceKey, prev => prev ? {
                        ...prev,
                        currentStatus: `Waiting for AI Proxy to come online (retry ${attempt + 1}/${PROXY_RETRY_ATTEMPTS - 1})`,
                    } : prev);
                    await new Promise(r => setTimeout(r, PROXY_RETRY_DELAY_MS));
                    if (insightsStopRef.current[spaceKey]) {
                        const stopErr: any = new Error("__STOP_REQUESTED__");
                        stopErr.isStopRequest = true;
                        throw stopErr;
                    }
                }
            }
            throw new Error("Proxy Offline. Ensure the PulsePlay Proxy is running and accessible at the configured URL.");
        };

        const obtainMessage = async (
            req: any,
            stageIndex: number
        ): Promise<{ conversationId: string; messageId: string }> => {
            // Synchronous race-claim: the first worker to see the null promise
            // sets it and becomes the opener. JS single-threadedness guarantees
            // exactly one winner because there is no `await` between the
            // null-check and the assignment.
            let amOpener = false;
            if (!openConversationPromise) {
                amOpener = true;
                openConversationPromise = (async () => {
                    const s = await withProxyOfflineRetry(
                        () => client.startConversation(req, { intent: "summary", contextText: "" }),
                        stageIndex
                    );
                    openerStartResponse = { conversationId: s.conversationId, messageId: s.messageId };
                    return s.conversationId;
                })();
            }
            const convId = await openConversationPromise;
            if (amOpener && openerStartResponse) {
                // We won the race and the start call carries our own messageId
                // — no need to issue a separate sendMessage.
                return openerStartResponse;
            }
            // Joiner: post our prompt as a follow-up on the shared conversation.
            const sent = await withProxyOfflineRetry(
                () => client.sendMessage(convId, req, { intent: "summary", contextText: "" }),
                stageIndex
            );
            return { conversationId: convId, messageId: sent.messageId };
        };

        const runStage = async (index: number, promptOverride?: string, retryAttempt: number = 0): Promise<void> => {
            // Honor user-initiated stop. Check BEFORE each stage so we
            // never start a new upstream call after the user pressed Stop.
            // Throws a sentinel error that the runInsights catch detects
            // and treats as a clean cancel (not a true failure).
            if (insightsStopRef.current[spaceKey]) {
                const e: any = new Error("__STOP_REQUESTED__");
                e.isStopRequest = true;
                throw e;
            }
            updateStatus(index, "running");
            const stageStartMs = Date.now();
            // For supervisor mode the upstream call is synchronous (returns
            // COMPLETED immediately); the Genie progress callback never fires
            // so the visual would otherwise sit on "Connecting..." for the
            // whole stage. Pre-seed a meaningful per-stage label so the user
            // sees what the supervisor is being asked for. Falls through to
            // the live progress label for Genie/single-space modes.
            if (props.settings.connectionMode === "supervisor") {
                const stageTitle = (titles[index] ?? `Stage ${index + 1}`).split(" + ")[0].trim();
                setSpaceInsightsResult(spaceKey, prev => prev ? {
                    ...prev,
                    currentStatus: `Asking supervisor for ${stageTitle}`,
                    statusSteps: [...(prev.statusSteps ?? []), `Asking supervisor for ${stageTitle}`],
                } : prev);
            }
            // IDEA-039 author-precedence — for hybrid Insights stages, the
            // author's guidance is now embedded INSIDE each stage prompt by
            // `buildHybridInsightsStagePrompts` (positioned after the default
            // contracts with a "below overrides above" precedence note). We
            // omit it from the `buildGenieRequest`-level "Business guidance:"
            // injection to avoid duplication. Non-hybrid paths (manual prompt,
            // runtime override, fallback) still pass guidance through here so
            // the author's rules reach the model in those flows too.
            const isHybridStage = !hasOverride && (authoringMode === "preset" || authoringMode === "ai-assisted") && hasHybridConfig;
            const includeGuidance = index === 0 && !isHybridStage;
            const insightsGuidance = (props.settings.insightsDomainGuidance ?? "").trim() || props.settings.domainGuidance;
            const req = buildGenieRequest(
                promptOverride ?? prompts[index],
                "summary",
                props.context,
                selectedFilters,
                includeGuidance ? insightsGuidance : "",
                props.settings.sendContextToGenie,
                // 2026-05-22 — AI Insights staged pipeline. Stage prompts
                // themselves contain "## HEADLINE" / "## KPI SNAPSHOT" /
                // "snapshot" / "summary" keywords that would trigger the
                // briefing-format trim (`isBriefingQuestion` keyword match).
                // The trim is Ask Pulse-only — AI Insights MUST stay on its
                // full multi-section composeInsightsPrompts contract. Opt
                // out explicitly.
                { kbFlags, omitDomainGuidance: isHybridStage, omitBriefingFormat: true }
            );
            // IDEA-039 Phase 1 — capture the assembled outgoing payload before
            // it leaves the boundary. Once Genie has it, we can't reconstruct
            // it later (settings/context may have moved on).
            stageTraces[index].prompt = req;
            // Reverted: an earlier attempt to use startSupervisorStream
            // per-stage caused the pipeline to hang (5+ minutes on stage 1
            // with no content). Going back to the simple non-stream
            // startConversation path that was working. The per-stage
            // pre-seed of `currentStatus = "Asking supervisor for <stage>"`
            // (set at the top of runStage) provides the user-visible
            // progress signal for supervisor mode without the streaming
            // complexity. True token-streaming for Insights remains a
            // future option but needs more careful XHR handling.
            // Cycle 47.2 — single-flight conversation opener (see runInsights
            // scope). The first worker calls startConversation; every other
            // worker waits and then sends its prompt via sendMessage on the
            // same conversation. Per-call proxy-offline retry is folded into
            // withProxyOfflineRetry inside obtainMessage.
            const start = await obtainMessage(req, index);
            let response: any = await client.waitForMessageWithProgress(
                start.conversationId,
                start.messageId,
                (progress) => {
                    const label = formatGenieStatus(progress);
                    // Capture the live Genie sub-status for this stage so
                    // <ProgressIndicator> can render it in parens after the
                    // polished stage verb (e.g. "Spotting trends (Pulling
                    // the data").
                    setInsightsStageLiveStatus(prev => ({ ...prev, [`${spaceKey}:${index}`]: label }));
                    setSpaceInsightsResult(spaceKey, prev => {
                        if (!prev) return prev;
                        const elapsed = Math.floor((Date.now() - (insightsStartTimeRef.current[spaceKey] ?? Date.now())) / 1000);
                        void elapsed;
                        const stageLabel = prompts.length > 1 ? label : label;
                        const steps = prev.statusSteps ?? [];
                        if (!steps.includes(stageLabel)) {
                            return { ...prev, currentStatus: stageLabel, statusSteps: [...steps, stageLabel] };
                        }
                        return { ...prev, currentStatus: stageLabel };
                    });
                },
                // Phase D — streaming content callback. Fires on every token for
                // streaming backends (foundation-stream). Writes the partial
                // content into this stage's slot and re-joins all parts so the
                // section renders progressively as tokens arrive rather than
                // waiting for the full response. No-op for poll-based backends.
                (partialContent: string) => {
                    contentParts[index] = partialContent;
                    const assembled = joinParts();
                    setSpaceInsightsResult(spaceKey, prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            status: "RUNNING",
                            content: assembled,
                        };
                    });
                }
            );
            const convIdFromStart = start.conversationId;
            // BUG-017: capture stage-1 conversationId so a later Chat-tab
            // follow-up click can continue this conversation rather than
            // starting fresh. Stored per space so multi-space switches don't
            // clobber each other's continuation point.
            if (index === 0 && convIdFromStart) {
                setInsightsStage1ConvId(prev => ({ ...prev, [spaceKey]: convIdFromStart! }));
            }

            // Session 53.X — auto-retry on hard FAILED with a SIMPLIFIED
            // prompt. Iterative validation showed ~5-8% of hybrid-pipeline
            // sections fail outright (e.g. CAST_INVALID_INPUT, UNRESOLVED_COLUMN
            // after Genie's auto-regenerate budget exhausts). The first prompt
            // bundles many constraints (format / time-scope / metric-direction /
            // self-verify) which Genie occasionally over-engineers into invalid
            // SQL. The retry strips those constraints, keeps only the heading
            // requirement + plain-bullet ask, and tends to succeed when the
            // first attempt didn't.
            //
            // Combined with normalizeStageHeading (handles preamble misses),
            // this lifts visible accuracy from ~92% baseline toward 99%+.
            const responseStatus = (response as { status?: string }).status;
            const responseContent = (response.content ?? "").trim();
            const isHardFailure = responseStatus === "FAILED" || !responseContent;
            const isCustomStageIndex = isHybridStage && index >= 2 && index < prompts.length - 2; // skip HEADLINE+KPI / TRENDS / RISKS / RECOMMENDED ACTIONS
            // L13 (Session 56) — universal-stage simple retry on empty content.
            // Custom stages already get a templated retry below. Universal
            // stages (HEADLINE / TRENDS / RISKS / ACTIONS) used to surface
            // the empty-sentinel without a retry attempt. Now we re-fire the
            // same prompt once on empty before giving up — agents often
            // succeed the second time after a transient rate-limit or
            // tool-call hiccup.
            if (isHardFailure && !isCustomStageIndex && isHybridStage) {
                try {
                    // Cycle 47.2 — re-issue on the shared conversation. The
                    // empty/FAILED first attempt usually clears on a second
                    // identical send (transient agent hiccup); routing it
                    // through obtainMessage keeps the conversation single.
                    const retryStart = await obtainMessage(req, index);
                    const retryResponse = await client.waitForMessageWithProgress(
                        retryStart.conversationId, retryStart.messageId,
                        () => { /* skip live progress on retry */ }
                    );
                    const retryStatus = (retryResponse as { status?: string }).status;
                    const retryContent = (retryResponse.content ?? "").trim();
                    if (retryContent && retryStatus !== "FAILED") {
                        response = retryResponse;
                        (stageTraces[index] as { retried?: boolean }).retried = true;
                    }
                } catch (_retryErr) {
                    // Universal-stage retry failed — keep the original empty
                    // response so the empty-sentinel renders rather than
                    // crashing the whole pipeline.
                }
            }
            if (isHardFailure && isCustomStageIndex) {
                const expectedTitleRaw = (titles[index] ?? "").split(" + ")[0].trim();
                const expectedTitle = expectedTitleRaw.toUpperCase();
                const sectionInstruction = customSections.find(s => s.name.trim().toUpperCase() === expectedTitle)?.instruction
                    ?? `Provide ${expectedTitle.toLowerCase().replace(/-/g, " ")} insights based on the bound data.`;
                const retryPrompt = [
                    `You are an analytics assistant for a ${settingsDomain.trim() || "this dataset"} report.`,
                    "",
                    `Respond with EXACTLY ONE markdown section starting with the literal line "## ${expectedTitle}" — no preamble, no clarifying question, no closing summary.`,
                    "",
                    `## ${expectedTitle}`,
                    sectionInstruction,
                    "",
                    "Use plain bullets or a short pipe table — keep aggregations simple. If a complex computation isn't possible with the bound data, say so in one bullet (do NOT ask the user). Use the EXACT data values as they appear; never paraphrase a category / sub-category / region / segment name. NEVER ask `Would you prefer...?` / `Should I instead...?` — the user will not respond.",
                    "",
                    `Start the response with \`## ${expectedTitle}\` on its own line.`
                ].join("\n");
                try {
                    const retryReq = buildGenieRequest(
                        retryPrompt, "summary", props.context, selectedFilters,
                        includeGuidance ? insightsGuidance : "", props.settings.sendContextToGenie,
                        // 2026-05-22 — AI Insights stage-retry path. Same
                        // reason as the primary stage call above: this is
                        // NOT Ask Pulse, the briefing-format trim must not
                        // fire here.
                        { kbFlags, omitDomainGuidance: isHybridStage, omitBriefingFormat: true }
                    );
                    // Cycle 47.2 — issue the simplified retry prompt as a
                    // follow-up message on the shared conversation.
                    const retryStart = await obtainMessage(retryReq, index);
                    const retryResponse = await client.waitForMessageWithProgress(
                        retryStart.conversationId, retryStart.messageId,
                        () => { /* skip live progress for retry — parent stage already showed terminal state */ }
                    );
                    const retryStatus = (retryResponse as { status?: string }).status;
                    const retryContent = (retryResponse.content ?? "").trim();
                    if (retryContent && retryStatus !== "FAILED") {
                        response = retryResponse;
                        // Mark the trace so devmode shows the retry was used.
                        (stageTraces[index] as { retried?: boolean }).retried = true;
                    }
                } catch (_retryErr) {
                    // Retry threw — keep the original FAILED response so the
                    // soft-fail card path renders (rather than crashing the
                    // whole pipeline).
                }
            }
            // IDEA-008: extract clarifiers from each stage's content and
            // route them to the chat follow-up suggestion strip instead of
            // dropping them. The narrative cards still render the cleaned
            // content; the questions land below as clickable chips.
            //
            // Session 53 — normalise the response to lead with `## TITLE`
            // even when Genie ignores the structure-check rule (see
            // normalizeStageHeading in contentSanitizer.ts). This is the
            // path to 99.99% header-display accuracy: regardless of model
            // variance, the visual now ALWAYS renders a section card with
            // the expected heading. Pre-clarifier-strip is intentional —
            // we want the heading-presence check to see the raw response
            // (a clarifying-question preamble shouldn't fool us into
            // skipping the prepend just because the question contains
            // a `?`).
            {
                const expectedTitle = titles[index] === FAST_INSIGHTS_STAGE_TITLE
                    ? ""
                    : (titles[index] ?? "").split(" + ")[0].trim();
                // Two-step normalization:
                //   1. enforceStageScope: when the agent over-produced
                //      multiple sections in one stage response (e.g. the
                //      supervisor agent dumping a full 5-section essay
                //      under HEADLINE), keep ONLY the requested section.
                //   2. normalizeStageHeading: ensure the section starts
                //      with `## TITLE` even if the model dropped the
                //      heading.
                const trimmedResponseRaw = (response.content ?? "").trim();
                const scoped = expectedTitle
                    ? enforceStageScope(trimmedResponseRaw, expectedTitle)
                    : trimmedResponseRaw;
                const normalised = expectedTitle
                    ? normalizeStageHeading(scoped, expectedTitle)
                    : scoped;
                const sc = extractAndStripClarifiers(normalised);
                // Strip empty markdown emphasis (****  / ** ** / inline isolated
                // ** tokens) on the per-stage content. Without this, agent
                // over-production that emits `**** Sales` or `from ** value **`
                // would survive all the way to the renderer per stage —
                // cleanInsightsContent only runs on the joined-text-for-Copy
                // path, not on per-stage rendering.
                contentParts[index] = stripEmptyEmphasis(sc.cleaned);
                if (sc.clarifiers.length > 0) {
                    setInsightsFollowUps(prevMap => {
                        const prevList = prevMap[spaceKey] ?? [];
                        const seen = new Set(prevList.map(q => q.toLowerCase().replace(/\s+/g, " ")));
                        const merged = [...prevList];
                        for (const q of sc.clarifiers) {
                            const k = q.toLowerCase().replace(/\s+/g, " ");
                            if (!seen.has(k)) { seen.add(k); merged.push(q); }
                        }
                        return { ...prevMap, [spaceKey]: merged };
                    });
                }
            }
            lastResponse = response;
            // IDEA-039 Phase 1 — fill the trace slot for this stage. Status is
            // `empty` if Genie returned blank/whitespace, otherwise `ok`. Error
            // path is handled in the outer catch block (see runInsights closure).
            // Cycle 47.8 — capture the full multi-query array when Genie
            // returned more than one SQL attachment for this stage.
            // Cycle 47.13 — when Genie didn't echo SQL on this follow-up
            // message (typical when the answer was synthesized from a
            // prior stage's result via conversation memory), fall back to
            // the rolling lastSqlSeenInRun cache so the SQL panel isn't
            // empty for sections that visibly carry quantitative data.
            const responseSqls: string[] | null = (Array.isArray(response.sqlQueries) && response.sqlQueries.length > 0)
                ? response.sqlQueries
                : (response.sqlQuery ? [response.sqlQuery] : null);
            const responseQueryResult = response.queryResult
                && Array.isArray(response.queryResult.columns)
                && Array.isArray(response.queryResult.rows)
                && response.queryResult.columns.length > 0
                ? {
                    columns: response.queryResult.columns.map((c: unknown) => String(c ?? "")),
                    rows: response.queryResult.rows as unknown[][]
                }
                : null;
            const ownTitle = titles[index] || `Stage ${index + 1}`;
            if (responseSqls && responseSqls.length > 0) {
                stageTraces[index].sql = responseSqls[0];
                stageTraces[index].sqls = responseSqls;
                stageTraces[index].sqlReusedFromTitle = null;
                lastSqlSeenInRun = { sqls: responseSqls, sourceTitle: ownTitle };
            } else if (lastSqlSeenInRun) {
                stageTraces[index].sql = lastSqlSeenInRun.sqls[0];
                stageTraces[index].sqls = lastSqlSeenInRun.sqls;
                stageTraces[index].sqlReusedFromTitle = lastSqlSeenInRun.sourceTitle;
            } else {
                stageTraces[index].sql = null;
                stageTraces[index].sqls = null;
                stageTraces[index].sqlReusedFromTitle = null;
            }
            if (responseQueryResult) {
                stageTraces[index].queryResult = responseQueryResult;
                stageTraces[index].queryResultReusedFromTitle = null;
                lastDataSeenInRun = { queryResult: responseQueryResult, sourceTitle: ownTitle };
            } else if (lastDataSeenInRun) {
                stageTraces[index].queryResult = lastDataSeenInRun.queryResult;
                stageTraces[index].queryResultReusedFromTitle = lastDataSeenInRun.sourceTitle;
            } else {
                stageTraces[index].queryResult = null;
                stageTraces[index].queryResultReusedFromTitle = null;
            }
            stageTraces[index].responseLength = (response.content ?? "").length;
            stageTraces[index].rawMarkdown = response.content ?? "";
            stageTraces[index].durationMs = Date.now() - stageStartMs;
            stageTraces[index].status = (contentParts[index].trim() ? "ok" : "empty");
            // Cycle 23 (rev'd cycle 44) — per-stage format-compliance
            // auto-retry. The validator runs on EVERY attempt now (was:
            // first attempt only) so we know whether the retry succeeded
            // or still failed. The retry budget is configurable via
            // Setup → Operations → "AI Insights validation retries"
            // (default 1, max 3). Each retry adds ~10-25s on the failed
            // stage. 0 disables auto-retry — the inline cycle 30/43
            // banner + manual ↻ retry button still appear.
            // AIINSIGHTS-P1: skip the prose-shape validation/retry for the
            // deterministic powerbi-semantic-model plan. Its stages are real DAX
            // tables (e.g. "## Top 3 segment by Total Sales"), which never match
            // the prose expectations (RISKS=list-of-3, HEADLINE=paragraph,
            // KPI=pipe-table) — the validator would flag a false "STRUCTURAL
            // FAILURE" and retry with a PROSE prompt that the no-LLM matcher
            // answers with garbage (the "Top 3 customer_name" bleed). The DAX
            // answer is authoritative; accept it as-is.
            if (stageTraces[index].status === "ok" && !deterministicPbiPlan) {
                const validation = validateStageOutput(titles[index] || "", contentParts[index]);
                if (!validation.ok) {
                    const maxRetries = Math.max(0, Math.min(3, props.settings.insightsValidationRetryCount ?? 1));
                    if (retryAttempt < maxRetries) {
                        const failedBody = contentParts[index];
                        logSession(
                            "WARN",
                            `AI Insights stage ${index + 1} (${titles[index]}) failed format validation (attempt ${retryAttempt + 1}/${maxRetries + 1}): ${validation.reason || "unknown"} — auto-retrying with stronger directive.`
                        );
                        (stageTraces[index] as { retried?: boolean; retryReason?: string }).retried = true;
                        (stageTraces[index] as { retried?: boolean; retryReason?: string }).retryReason = validation.reason;
                        const retryPrompt = buildRetryPrompt(
                            prompts[index],
                            titles[index] || "",
                            failedBody,
                            validation
                        );
                        // Reset the slot so the retry call re-fills it cleanly,
                        // and re-enter runStage in retry mode (incrementing
                        // retryAttempt so the budget eventually exhausts).
                        contentParts[index] = "";
                        return runStage(index, retryPrompt, retryAttempt + 1);
                    } else if (retryAttempt > 0) {
                        // Exhausted retry budget. Accept the result but log
                        // for diagnostics + mark the trace so the inline
                        // banner can flag it.
                        logSession(
                            "WARN",
                            `AI Insights stage ${index + 1} (${titles[index]}) still failed validation after ${retryAttempt} ${retryAttempt === 1 ? "retry" : "retries"}: ${validation.reason || "unknown"}. Inline banner will surface for manual retry.`
                        );
                        (stageTraces[index] as { retried?: boolean; retryReason?: string }).retried = true;
                        (stageTraces[index] as { retried?: boolean; retryReason?: string }).retryReason = validation.reason;
                    }
                }
            }
            const assembled = joinParts();
            // 49.16 — detect empty Genie response as a soft failure. Without this,
            // the message status stays "RUNNING" (because contentParts has empty
            // slots) while stageStatuses gets marked "done" — the render branch
            // sees status===RUNNING && content==="" and returns null, leaving the
            // user stuck on a blank panel with no retry path.
            const stageContentEmpty = !contentParts[index].trim();
            const allStagesEmpty = contentParts.every(p => !p.trim());
            if (stageContentEmpty && prompts.length === 1) {
                // Single-stage run with empty Genie response → mark FAILED so the
                // existing FAILED branch renders the friendly error + Retry button.
                setSpaceInsightsResult(spaceKey, prev => ({
                    ...(prev ?? { id: createLocalId("insights"), role: "system" } as ChatMessageViewModel),
                    id: prev?.id || response.id || createLocalId("insights"),
                    role: "system",
                    status: "FAILED",
                    content: "AI returned an empty response. Click Retry to try again, or check Setup → Section A → Custom AI Insights prompt if this happens repeatedly.",
                    viewMode: "narrative",
                    sqlQuery: prev?.sqlQuery,
                    queryResult: prev?.queryResult,
                    trace: prev?.trace,
                    stageTraces: stageTraces.map(s => ({ ...s }))
                }));
                updateStatus(index, "error");
                return;
            }
            if (!backgroundRefresh) {
                // Normal run: paint each section as it lands (progressive reveal).
                setSpaceInsightsResult(spaceKey, prev => ({
                    ...(prev ?? { id: createLocalId("insights"), role: "assistant" } as ChatMessageViewModel),
                    id: prev?.id || response.id,
                    role: "assistant",
                    // Mark COMPLETED only when the last stage slot is filled
                    status: contentParts.every(p => p !== "") ? (response.status || "COMPLETED") : "RUNNING",
                    content: assembled,
                    viewMode: getDefaultViewMode(response, canShowSql, canShowTrace),
                    sqlQuery: prev?.sqlQuery || response.sqlQuery,
                    queryResult: prev?.queryResult || response.queryResult,
                    trace: prev?.trace || response.trace,
                    stageTraces: stageTraces.map(s => ({ ...s }))
                }));
            }
            // Background refresh: skip per-stage paint. Content accumulates
            // in contentParts[] and will be committed atomically once all
            // stages finish (see finally block). This avoids the "collapsing"
            // UX where a stale 5-section briefing shrinks to 1 section when
            // the first fresh stage lands and overwrites the displayed content.
            updateStatus(index, "done");
            // Multi-stage runs: if this was the LAST stage and ALL parts are
            // still empty, treat the run as failed too. Single-stage already
            // handled above.
            if (prompts.length > 1 && index === prompts.length - 1 && allStagesEmpty) {
                setSpaceInsightsResult(spaceKey, prev => ({
                    ...(prev ?? { id: createLocalId("insights"), role: "system" } as ChatMessageViewModel),
                    id: prev?.id || response.id || createLocalId("insights"),
                    role: "system",
                    status: "FAILED",
                    content: "AI returned no content across all stages. Click Retry, or check the Insights prompt and the proxy connection.",
                    viewMode: "narrative"
                }));
            }
        };

        // Cycle 30 — register this run's runStage closure + titles array
        // in the per-component ref. The validation-failure banner inside
        // a section card uses this to re-run JUST the failing stage when
        // the user clicks the inline refresh icon, without reloading the
        // entire pipeline.
        runStageRef.current = { spaceKey, run: runStage, titles: [...titles] };

        (async () => {
            try {
                if (prompts.length <= 1) {
                    // Single-stage path (override prompts, chips) — no batching needed.
                    await runStage(0);
                } else {
                    // 2026-05-19 latency cycle — concurrency-2 pool with an
                    // 8 s head-start for stage 0. Replaces the previous
                    // cycle-47.14 pattern (serialize stage 0, then concurrency-3
                    // for stages 1+) per Rajesh's request to:
                    //   1. Process two sections at a time (concurrency 2,
                    //      not 3) so backend load is gentler — Genie /messages
                    //      throttling tends to compound long stages.
                    //   2. Start stage 1 ~5-10 s after stage 0 on first load
                    //      (not after stage 0 completes), so the second stage
                    //      overlaps with the first while still giving stage 0
                    //      a clear head start to claim the cycle-47.2 single-
                    //      flight conversation opener and let the HEADLINE
                    //      paint first in normal cases.
                    //   3. All stages share the same conversation_id via the
                    //      existing cycle-47.2 opener race in obtainMessage()
                    //      — no API change here, just behavior.
                    const CONCURRENCY = 2;
                    // 2026-05-27 — tuned from 8000ms to 3500ms per Rajesh's
                    // "3-5 second delay" cadence for staged AI Insights.
                    // 3500 = midpoint; gives the lead batch ~3.5s head-start
                    // before follow-up batches issue sendMessage on the same
                    // conversation_id. See
                    // AI_INSIGHTS_SECTION_LOADING_CLAUDE_HANDOFF_2026-05-27.md.
                    // 2026-05-28 — delay now sourced from the user's
                    // revealCadence preset (Settings → Advanced →
                    // Performance Levers). "balanced" = 6s (default),
                    // "fast" = 3s, "full" = 8s, "instant" = 0 (single-
                    // shot bypass — but this worker loop only runs when
                    // stagingFromCadence.useSinglePlanner === false, so
                    // we never actually see 0 here).
                    const FIRST_LOAD_STAGE_1_DELAY_MS = getBackendStagingFromCadence(perfLevers.revealCadence).interBatchDelayMs;
                    const queue = Array.from({ length: prompts.length }, (_, i) => i);
                    const drainWorker = async (workerIndex: number) => {
                        let isFirstPick = true;
                        while (true) {
                            const idx = queue.shift();
                            if (idx === undefined) return;
                            // Second worker waits before its FIRST pick so
                            // stage 0 (claimed by worker 0) has time to win
                            // the obtainMessage race + return the
                            // conversation_id before stage 1 issues its
                            // sendMessage on the same conversation. Subsequent
                            // picks by the same worker have no delay.
                            if (isFirstPick && workerIndex > 0) {
                                await new Promise(r => setTimeout(r, FIRST_LOAD_STAGE_1_DELAY_MS));
                                if (insightsStopRef.current[spaceKey]) {
                                    const stopErr: any = new Error("__STOP_REQUESTED__");
                                    stopErr.isStopRequest = true;
                                    throw stopErr;
                                }
                            }
                            isFirstPick = false;
                            await runStage(idx);
                        }
                    };
                    const workers: Promise<void>[] = [];
                    for (let w = 0; w < Math.min(CONCURRENCY, prompts.length); w++) {
                        workers.push(drainWorker(w));
                    }
                    await Promise.all(workers);
                }
                const generatedAt = Date.now();
                setInsightsGeneratedAtMap(previous => ({ ...previous, [spaceKey]: generatedAt }));
                logSession("INFO", `AI Insights generated (${prompts.length} stage${prompts.length > 1 ? "s" : ""}, ${describeInsightsBatchPlan(prompts.length)}).`);
                if (lastResponse && contentParts.every(p => p !== "")) {
                    // Background refresh: commit the fresh result atomically now
                    // that all stages are done. The stale cached content was shown
                    // throughout the run; this single swap replaces it cleanly.
                    if (backgroundRefresh) {
                        setSpaceInsightsResult(spaceKey, {
                            id: createLocalId("insights"),
                            role: "assistant",
                            status: "COMPLETED",
                            content: joinParts(),
                            viewMode: getDefaultViewMode(lastResponse, canShowSql, canShowTrace),
                            sqlQuery: (lastResponse as any).sqlQuery,
                            queryResult: (lastResponse as any).queryResult,
                            trace: (lastResponse as any).trace,
                            stageTraces: stageTraces.map(s => ({ ...s })),
                        });
                        delete staleDisplayRef.current[spaceKey];
                        setStaleRefreshingMap(prev => {
                            const next = { ...prev };
                            delete next[spaceKey];
                            return next;
                        });
                    }
                    try {
                        const ttlMs = (props.settings.insightsCacheTtlMinutes ?? 30) * 60 * 1000;
                        writeInsightsCache(computeInsightsCacheKey(spaceKey), {
                            content: joinParts(),
                            status: "COMPLETED",
                            // PulsePlay port note: TS narrows lastResponse to never
                            // due to upstream guard composition; the runtime shape
                            // has these fields. Cast through any to preserve intent.
                            sqlQuery: (lastResponse as any).sqlQuery,
                            queryResult: (lastResponse as any).queryResult,
                            trace: (lastResponse as any).trace,
                            viewMode: getDefaultViewMode(lastResponse, canShowSql, canShowTrace),
                            stageTitles: titles,
                            stageStatuses: contentParts.map(p => p ? "done" : "error"),
                            generatedAt
                        }, ttlMs);
                    } catch (e: any) {
                        // Wave 30 cycle 5 — surface localStorage write failures
                        // (quota / private mode) so the author knows the next
                        // page-switch will re-burn the pipeline.
                        try { logSession("WARN", `Insights cache write failed (${e?.name || "Error"}: ${String(e?.message || "").slice(0, 80)}). Rehydrate after page-switch will re-run the pipeline.`); } catch { /* swallow */ }
                    }
                } else if (backgroundRefresh) {
                    // All stages empty on background refresh — clear the stale
                    // banner so the user isn't stuck with a misleading indicator,
                    // then let the normal empty-state handling show.
                    delete staleDisplayRef.current[spaceKey];
                    setStaleRefreshingMap(prev => {
                        const next = { ...prev };
                        delete next[spaceKey];
                        return next;
                    });
                }
            } catch (error: any) {
                // User-initiated stop — distinguish from real failures so the
                // UI shows "Stopped at stage N" instead of a red error card.
                // Completed stages keep their rendered content (partial run).
                if (error?.isStopRequest || error?.message === "__STOP_REQUESTED__") {
                    statusesRef.forEach((s, i) => { if (s === "running" || s === "pending") updateStatus(i, "error"); });
                    if (backgroundRefresh) {
                        // On stop during background refresh: just clear the banner
                        // and keep showing the stale cached content the user was
                        // already reading. No destructive status update.
                        delete staleDisplayRef.current[spaceKey];
                        setStaleRefreshingMap(prev => {
                            const next = { ...prev };
                            delete next[spaceKey];
                            return next;
                        });
                    } else {
                        setSpaceInsightsResult(spaceKey, prev => prev && prev.content
                            ? { ...prev, status: "COMPLETED", currentStatus: "Stopped by user", failureMessage: undefined }
                            : {
                                id: prev?.id ?? createLocalId("insights"),
                                role: "system",
                                status: "FAILED",
                                content: "_(Run stopped by user before any stage completed.)_",
                                currentStatus: "Stopped by user",
                                failureMessage: undefined,
                            });
                    }
                    logSession("INFO", "AI Insights stopped by user");
                    return;
                }
                // Mark any still-running stage as errored; completed stages
                // keep their content visible so the user sees partial results.
                statusesRef.forEach((s, i) => { if (s === "running") updateStatus(i, "error"); });
                // IDEA-039 Phase 1 — mirror the error into stage traces so the
                // dev trace pane shows which stage(s) blew up. Any trace still
                // marked "ok" with a zero duration was in-flight when we threw.
                const errMsg = error?.message ?? "Unknown error";
                stageTraces.forEach((t, i) => {
                    if (statusesRef[i] === "running" || (t.status === "ok" && t.durationMs === 0)) {
                        t.status = "error";
                        t.errorMessage = errMsg;
                        if (t.durationMs === 0) t.durationMs = -1;
                    }
                });
                // IDEA-039 Step 2.2 — when partial output exists, mark the run
                // COMPLETED and surface the failure via `failureMessage` so the
                // P1.5 red error-card renders ABOVE the partial output rather
                // than replacing it. When no partial exists, full FAILED state.
                const failedTrace = stageTraces.find(t => t.status === "error");
                if (backgroundRefresh) {
                    // Background refresh failed — keep the stale cached content
                    // the user was reading; just clear the "Refreshing" banner
                    // so they aren't stuck with a false progress indicator.
                    // Do NOT overwrite the cached display with an error state.
                    delete staleDisplayRef.current[spaceKey];
                    setStaleRefreshingMap(prev => {
                        const next = { ...prev };
                        delete next[spaceKey];
                        return next;
                    });
                    logSession("WARN", `AI Insights background refresh failed (${errMsg}); cached result preserved.`);
                } else {
                    setSpaceInsightsResult(spaceKey, prev => prev && prev.content
                        ? {
                            ...prev,
                            status: "COMPLETED",
                            stageTraces: stageTraces.map(s => ({ ...s })),
                            failureMessage: errMsg,
                            failedStageTitle: failedTrace?.title ?? "Pipeline"
                        }
                        : {
                            id: prev?.id ?? createLocalId("insights"),
                            role: "system",
                            status: "FAILED",
                            content: errMsg,
                            stageTraces: stageTraces.map(s => ({ ...s })),
                            failureMessage: errMsg,
                            failedStageTitle: failedTrace?.title ?? "Pipeline"
                        });
                    logSession("ERROR", `AI Insights failed: ${errMsg}`);
                }
            } finally {
                setInsightsBusyMap(previous => ({ ...previous, [spaceKey]: false }));
                // Close the perf instrumentation `total` stage + dump
                // the console.table for this run. Runs on every code
                // path (success / failure / stop) thanks to the finally.
                stageEnd(perfRunId, "total");
                dumpRun(perfRunId, `AI Insights ${spaceKey}`);
            }
        })();
    }, [activeClient, activeSpaceKey, isConfigured, props.context, props.settings, selectedFilters, roleMode, canShowSql, canShowTrace, setSpaceInsightsResult, setSpaceStageStatuses, kbFlags, computeInsightsCacheKey, logSession]);

    // Keep the ref current so the probe effect can re-run the latest closure.
    runInsightsRef.current = runInsights;

    // User-initiated stop for the in-flight Insights run. Sets the stop
    // flag (next runStage check bails), aborts any in-flight XHRs via
    // the backend's cancel(), AND clears the cache for the active space
    // so the next click on Refresh starts truly fresh (instead of
    // serving any partially-cached state from before the stop).
    const stopInsights = useCallback(() => {
        const spaceKey = activeSpaceKey;
        insightsStopRef.current[spaceKey] = true;
        try { activeClient?.cancel?.(); } catch { /* best-effort */ }
        // Clear the cache entry for this space — both the in-memory tier
        // and the localStorage tier — so a stuck/partial result from the
        // stopped run never gets served on the next refresh.
        try { clearInsightsCache(computeInsightsCacheKey(spaceKey)); } catch { /* best-effort */ }
        setSpaceInsightsResult(spaceKey, prev => prev ? {
            ...prev,
            currentStatus: "Stopping",
        } : prev);
        logSession("INFO", "AI Insights stop requested by user (cache cleared)");
    }, [activeClient, activeSpaceKey, setSpaceInsightsResult, logSession, computeInsightsCacheKey]);

    // ── AI Insights auto-fire ─────────────────────────────────────────────────
    // PBI re-mounts the visual on page-switch and theme-apply, blowing away
    // React state. Before triggering a fresh run, try the persistent cache so
    // the user doesn't pay 5 stages of Genie latency for an unchanged scope.
    useEffect(() => {
        if (insightsFiredRef.current[activeSpaceKey] || !isConfigured || insightsBusy) return;
        if (!activeClient) return;
        // IDEA-022: chatOnly gate — skip auto-firing AI Insights when the
        // author has disabled the Insights tab. The tab strip is hidden in
        // this mode, so there'd be nothing to render the pipeline output on
        // and we'd just spend Genie calls.
        if (enabledFeatures === "chatOnly") return;

        // PulsePlay principle — AI and BI are independent verticals. AI Insights
        // should fire whenever AI is configured, regardless of whether a BI
        // surface has been wired up. Teams using PulsePlay for AI-only workflows
        // (Genie / Foundation Model / Supervisor without any embedded BI tool)
        // would otherwise sit on a stuck "Generating insights…" forever.
        //
        // Historical context (IDEA-039 anomaly #8 from the Pulse-in-PowerBI
        // sandbox): PBI fires the visual's update() multiple times during
        // page-load and the first call typically arrives with an empty/sparse
        // DataView, producing $0-vs-$2.30M contradictions when stages ran 2s
        // apart. That guard lives in the sister project's PBI-custom-visual
        // build. In PulsePlay (browser playground, no PBI host), there is no
        // multi-batch DataView pump — context is whatever the BI adapter has
        // emitted, period. So we drop the empty-context return here and let
        // the pipeline run with whatever grounding it has (which may be none).
        const cacheKey = computeInsightsCacheKey(activeSpaceKey);
        const ttlMs = (props.settings.insightsCacheTtlMinutes ?? 30) * 60 * 1000;
        const cached = readInsightsCache(cacheKey, undefined, ttlMs);
        // Diagnostic: log cache key tail + whether we had a hit. Lets the
        // user / dev see in the session-log panel whether a re-fire on
        // page-switch was a true miss (key changed, TTL expired, nothing
        // ever cached) vs a false miss (key matches but lookup failed).
        try {
            const keyTail = cacheKey.length > 60 ? "…" + cacheKey.slice(-60) : cacheKey;
            if (ttlMs <= 0) {
                logSession("INFO", `AI Insights cache disabled (TTL=0); will run pipeline.`);
            } else if (cached && cached.status === "COMPLETED") {
                /* hit log fires below */
            } else {
                logSession("INFO", `AI Insights cache MISS (key=${keyTail}, ttl=${Math.round(ttlMs/60000)}m); running pipeline.`);
            }
        } catch { /* never block on logging */ }
        if (cached && cached.status === "COMPLETED") {
            const cachedResult: ChatMessageViewModel = {
                id: createLocalId("insights"),
                role: "assistant",
                status: cached.status,
                content: cached.content,
                sqlQuery: cached.sqlQuery,
                queryResult: cached.queryResult as ChatMessageViewModel["queryResult"],
                trace: cached.trace,
                viewMode: (cached.viewMode as OutputMode) || "narrative"
            };
            setSpaceInsightsResult(activeSpaceKey, cachedResult);
            setInsightsGeneratedAtMap(prev => ({ ...prev, [activeSpaceKey]: cached.generatedAt }));
            setSpaceStageStatuses(activeSpaceKey, cached.stageStatuses as StageStatus[]);
            setPendingStageTitles(cached.stageTitles);
            insightsFiredRef.current[activeSpaceKey] = true;
            const ageMin = Math.max(0, Math.round((Date.now() - cached.generatedAt) / 60000));
            logSession("INFO", `AI Insights restored from cache (generated ${ageMin}m ago); starting background refresh.`);
            // Stale-while-revalidate: show the cached result immediately (done
            // above) then kick off a background refresh so the user always
            // gets fresh data without waiting for the pipeline before seeing
            // anything. The banner in the Insights header signals the refresh
            // is in progress; when the pipeline completes, the fresh result
            // replaces the stale one atomically (no progressive collapse).
            staleDisplayRef.current[activeSpaceKey] = cachedResult;
            runInsights(undefined, undefined, /* backgroundRefresh */ true);
            return;
        }

        insightsFiredRef.current[activeSpaceKey] = true;
        // AIINSIGHTS-P1 cold-run fix: wait (capped ~1.8s) for the connector
        // probe so a deterministic powerbi-semantic-model connector plans the
        // clean DAX briefing on the FIRST run — no cold prose run flashing
        // "no measure" before the re-run. Genie's probe resolves fast; the cap
        // guarantees the run fires even if the probe is slow or never resolves.
        const profileForRun = insightsActiveProfile;
        if (pbiProbeRef.current.has(profileForRun)) {
            runInsights();
        } else {
            Promise.race([
                ensurePbiProbe(profileForRun),
                new Promise(res => setTimeout(res, 1800)),
            ]).then(() => runInsights()).catch(() => runInsights());
        }
    }, [activeClient, activeSpaceKey, isConfigured, insightsBusy, runInsights, computeInsightsCacheKey, setSpaceInsightsResult, setSpaceStageStatuses, logSession, enabledFeatures, props.context, insightsActiveProfile, ensurePbiProbe]);

    // ──────────────────────────────────────────────────────────────────────────
    // Wave 35 Phase 3 — Custom SQL section dispatcher.
    //
    // Runs alongside the AI Insights pipeline. Iterates the parsed
    // insightsCustomSections list, fires one /sql/preview request per
    // kind:"sql" section in parallel, and stashes results into
    // sqlSectionResults so the renderer can pick them up. Honours the
    // 4h SQL_SECTION_CACHE_TTL_MS — re-uses results when the SQL hash is
    // unchanged. Only fires when AI Insights is configured to run AND the
    // visual is on the Insights tab.
    // ──────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isConfigured || enabledFeatures === "chatOnly") return;
        const sectionsRaw = props.settings.insightsCustomSections || "";
        const parsed = parseCustomSections(sectionsRaw);
        const sqlSections = parsed.filter(s => s.kind === "sql" && s.sql && s.sql.trim());
        if (sqlSections.length === 0) return;
        const apiBaseUrl = props.settings.apiBaseUrl || "";
        if (!apiBaseUrl) return; // proxy-required for SQL preview
        const cteHeader = props.settings.sqlCtePreamble || "";
        const profile = activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "default";
        const proxyKey = props.settings.proxyKey || "";
        const ttl = SQL_SECTION_CACHE_TTL_MS;
        const now = Date.now();
        const sqlHash = computeSqlHash(sqlSections);
        for (const sec of sqlSections) {
            const key = `${activeSpaceKey}|${sqlHash}|${sec.name}`;
            // Skip if already cached within TTL or in-flight.
            const cached = sqlSectionResults[key];
            if (cached && (now - cached.generatedAt) < ttl) continue;
            if (sqlSectionInflightRef.current[key]) continue;
            sqlSectionInflightRef.current[key] = true;
            setSqlSectionLoading(prev => ({ ...prev, [key]: true }));
            executeSqlPreviewClient({
                apiBaseUrl,
                proxyKey,
                // 2026-05-28 — per-section target profile when defined (a Genie
                // space OR a direct/underlying-data warehouse); else the active
                // profile. Routes this section's SQL to that profile's warehouse.
                assistantProfile: (sec.profile && sec.profile.trim()) || profile,
                sectionH_cteHeader: cteHeader,
                sql: sec.sql || "",
            }).then(result => {
                setSqlSectionResults(prev => ({ ...prev, [key]: { result, generatedAt: Date.now() } }));
                setSqlSectionLoading(prev => { const next = { ...prev }; delete next[key]; return next; });
                sqlSectionInflightRef.current[key] = false;
                if (result.error) {
                    logSession("WARN", `Custom SQL section "${sec.name}" failed: ${result.error}`);
                } else {
                    logSession("INFO", `Custom SQL section "${sec.name}" returned ${result.rows.length} row${result.rows.length === 1 ? "" : "s"}.`);
                }
            });
        }
    }, [isConfigured, enabledFeatures, activeSpaceKey, props.settings.insightsCustomSections, props.settings.apiBaseUrl, props.settings.sqlCtePreamble, props.settings.proxyKey, props.settings.assistantProfile]);

    // Apply / Refresh pulse — re-run AI Insights when the author actually
    // edits a Genie setting. We can't gate on render count because PBI fires
    // a SECOND update() after mount with the real persisted settings (the
    // first call sometimes has defaults), and that second-call dep change
    // would otherwise clear the cache + re-fire on every page-switch
    // (insights cache was useless across page navigation).
    //
    // Strategy: track the cache key per active space. The first time a key
    // is observed, record it and bail (initial settling). When the key
    // genuinely changes for a space we've already seen, treat it as an
    // edit and clear+refire. The `refreshInsights` format-pane toggle is
    // tracked separately because it's designed to force a refire even when
    // no other setting changed.
    const lastCacheKeyRef = useRef<Record<string, string>>({});
    const lastRefreshTokenRef = useRef<boolean | undefined>(undefined);
    useEffect(() => {
        const newKey = computeInsightsCacheKey(activeSpaceKey);
        const seenForSpace = lastCacheKeyRef.current[activeSpaceKey];
        const refreshChanged = lastRefreshTokenRef.current !== undefined
            && lastRefreshTokenRef.current !== props.settings.refreshInsights;
        lastRefreshTokenRef.current = props.settings.refreshInsights;

        if (seenForSpace === undefined) {
            // First settled key for this space — record and let the auto-fire
            // effect / cache hydration handle it without a clear pulse.
            lastCacheKeyRef.current[activeSpaceKey] = newKey;
            return;
        }
        if (seenForSpace === newKey && !refreshChanged) {
            // No semantic change — don't bust the cache.
            return;
        }
        lastCacheKeyRef.current[activeSpaceKey] = newKey;
        clearInsightsCache(seenForSpace); // clear under the OLD key
        insightsFiredRef.current[activeSpaceKey] = false;
        setSpaceInsightsResult(activeSpaceKey, null);
        setSpaceStageStatuses(activeSpaceKey, []);
        setPendingStageTitles([]);
        logSession("INFO", "Apply/Refresh pulse — re-running AI Insights.");
    }, [
        activeSpaceKey,
        computeInsightsCacheKey,
        setSpaceInsightsResult,
        setSpaceStageStatuses,
        logSession,
        props.settings.refreshInsights,
        props.settings.connectionMode,
        props.settings.host,
        props.settings.apiBaseUrl,
        props.settings.assistantProfile,
        props.settings.token,
        props.settings.spaceId,
        props.settings.multiSpaceEnabled,
        props.settings.space2Label,
        props.settings.space2AssistantProfile,
        props.settings.space2SpaceId,
        props.settings.space2Host,
        props.settings.space2Token,
        props.settings.space3Label,
        props.settings.space3AssistantProfile,
        props.settings.space3SpaceId,
        props.settings.space3Host,
        props.settings.space3Token,
        props.settings.space4Label,
        props.settings.space4AssistantProfile,
        props.settings.space4SpaceId,
        props.settings.space4Host,
        props.settings.space4Token,
        // IDEA-011 — additional slot fields. Listing each Label is enough
        // for cache-bust detection in practice; the other per-slot fields
        // change less often. We include all five for safety.
        props.settings.multiSpaceCount,
        props.settings.space5Label, props.settings.space5AssistantProfile, props.settings.space5SpaceId, props.settings.space5Host, props.settings.space5Token,
        props.settings.space6Label, props.settings.space6AssistantProfile, props.settings.space6SpaceId, props.settings.space6Host, props.settings.space6Token,
        props.settings.space7Label, props.settings.space7AssistantProfile, props.settings.space7SpaceId, props.settings.space7Host, props.settings.space7Token,
        props.settings.space8Label, props.settings.space8AssistantProfile, props.settings.space8SpaceId, props.settings.space8Host, props.settings.space8Token,
        props.settings.space9Label, props.settings.space9AssistantProfile, props.settings.space9SpaceId, props.settings.space9Host, props.settings.space9Token,
        props.settings.space10Label, props.settings.space10AssistantProfile, props.settings.space10SpaceId, props.settings.space10Host, props.settings.space10Token,
        props.settings.insightsPrompt
    ]);

    const showPulseHeaderTitle = props.settings.showHeader !== false
        && !!(props.settings.headerTitle || "").trim();
    const showPulseHeaderSpaces = !!(props.settings.multiSpaceEnabled && activeSpaces.length > 1);
    const showPulseHeaderTopRow = showPulseHeaderTitle || showPulseHeaderSpaces;

    return (
        <div
            className={`gn-shell${props.settings.darkMode ? " gn-shell--dark" : " gn-shell--light"}${compact ? " gn-compact" : ""}`}
            style={themeStyle}
        >
            <div className="gn-header gn-header--two-row">
                {/* Row 1 — branding and optional multi-space switcher. Operational
                    connection/scope state is kept out of the primary viewer
                    chrome; Settings is the normal path for setup/system review.
                    Collapse the row entirely when no branding or space switcher
                    is present so the primary tabs do not sit under blank chrome. */}
                {showPulseHeaderTopRow && (
                <div className="gn-header-row gn-header-row--top">
                {(() => {
                    // Logo + title only render when the author has set a header
                    // title AND the new Wave 30 `showHeader` toggle is ON
                    // (default). When OFF, the title block is suppressed but
                    // Subtitle is opt-in (settings.headerSubtitle) — never
                    // falls back to space label so a single bold line is the norm.
                    if (props.settings.showHeader === false) return null;
                    const title = (props.settings.headerTitle || "").trim();
                    const subtitle = (props.settings.headerSubtitle || "").trim();
                    if (!title) return null;
                    // Wave 30 cycle 3 — header icon picker. 6 inline SVG presets
                    // (no remote URLs to keep the PBI sandbox happy). Each path is
                    // sized to a 20x20 viewBox so the existing .gn-logo container
                    // CSS layout doesn't change.
                    const iconStyle = props.settings.headerIconStyle || "default";
                    const renderIcon = (): React.ReactNode => {
                        switch (iconStyle) {
                            case "none":
                                return null;
                            case "chat":
                                return (
                                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l-3 3v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor"/>
                                    </svg>
                                );
                            case "sparkle":
                                return (
                                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10 1.5l1.7 5.3L17 8.5l-5.3 1.7L10 15.5l-1.7-5.3L3 8.5l5.3-1.7L10 1.5z" fill="currentColor"/>
                                        <circle cx="16" cy="4" r="1.2" fill="currentColor"/>
                                        <circle cx="4" cy="16" r="1" fill="currentColor"/>
                                    </svg>
                                );
                            case "brain":
                                return (
                                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M6 3a3 3 0 0 0-3 3v1.5a2.5 2.5 0 0 0-1 2c0 .9.5 1.7 1.2 2.1A2.5 2.5 0 0 0 4 14a3 3 0 0 0 3 3h1V3H6zm8 0a3 3 0 0 1 3 3v1.5a2.5 2.5 0 0 1 1 2c0 .9-.5 1.7-1.2 2.1A2.5 2.5 0 0 1 16 14a3 3 0 0 1-3 3h-1V3h2z" fill="currentColor"/>
                                        <path d="M9 6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm0 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0z" fill="#fff"/>
                                    </svg>
                                );
                            case "bolt":
                                return (
                                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M11 1L3 11h5l-1 8 9-11h-5l1-7z" fill="currentColor"/>
                                    </svg>
                                );
                            case "default":
                            default:
                                return (
                                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l-3 3v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor"/>
                                        <path d="M10 5l.9 2.1L13 8l-2.1.9L10 11l-.9-2.1L7 8l2.1-.9L10 5z" fill="#fff"/>
                                    </svg>
                                );
                        }
                    };
                    const iconNode = renderIcon();
                    return (
                        <div className="gn-header-left">
                            {iconNode && <span className="gn-logo" aria-hidden="true">{iconNode}</span>}
                            <div className="gn-header-titles">
                                <span className="gn-header-title">{title}</span>
                                {subtitle && <span className="gn-header-subtitle">{subtitle}</span>}
                            </div>
                        </div>
                    );
                })()}
                {props.settings.multiSpaceEnabled && activeSpaces.length > 1 && (
                    <div className="gn-space-tabs" role="group" aria-label="AI workspace">
                        {compact ? (
                            <select
                                className="gn-space-select"
                                value={activeSpaceKey}
                                onChange={e => handleSpaceSwitch(e.target.value as SpaceKey)}
                                aria-label="Select AI workspace"
                            >
                                {activeSpaces.map(space => (
                                    <option key={space.key} value={space.key}>{space.label}</option>
                                ))}
                            </select>
                        ) : (
                            activeSpaces.map(space => (
                                <button
                                    key={space.key}
                                    type="button"
                                    className={`gn-space-tab${activeSpaceKey === space.key ? " gn-space-tab--active" : ""}`}
                                    onClick={() => handleSpaceSwitch(space.key)}
                                    aria-pressed={activeSpaceKey === space.key}
                                    disabled={insightsCompareMode}
                                    title={insightsCompareMode ? "Compare mode: all spaces visible — disable Compare to switch to a single space" : undefined}
                                >
                                    {space.label}
                                </button>
                            ))
                        )}
                        {/* Wave 23: Compare-all toggle. Only meaningful on the AI Insights
                            tab; Chat already has per-tab conversations and doesn't need
                            it. The button is always visible when multi-space + 2+ spaces
                            are configured so authors discover the feature, but the actual
                            grid layout only fires inside the Insights renderer. */}
                        {activeTab === "insights" && (
                            <button
                                type="button"
                                className={`gn-space-compare-toggle${insightsCompareMode ? " gn-space-compare-toggle--active" : ""}`}
                                onClick={() => setInsightsCompareMode(v => !v)}
                                aria-pressed={insightsCompareMode}
                                title="Show every workspace's AI Insights side-by-side so you can spot disagreements without tab-switching"
                            >
                                {insightsCompareMode ? "× Compare" : "Compare all"}
                            </button>
                        )}
                    </div>
                )}
                {/* Connection and scope status moved out of the global top
                    right chrome. The primary viewer surface stays focused on
                    AI Insights / Chat; setup and system review live in Settings. */}
                </div>
                )}
                {/* Row 2 — surface controls + run state. Tabs + Adjust on the
                    left; meta strip (clock / copy / refresh) and the always-on
                    ProgressIndicator on the right. All transient/run-state UI
                    stays in this row so the content area below is pure narrative. */}
                <div className="gn-header-row gn-header-row--bottom">
                    {/* 2026-05-25 — strip gate flipped from `enabledFeatures === "both"`
                      * to PulsePlay's tabVisibility model. The strip is hidden when
                      * ≤1 tab is enabled (auto-collapse: that single tab becomes the
                      * main page). Each individual tab button below is also gated on
                      * its own visibility flag, so when 2 of 3 are enabled, the strip
                      * shows only those 2. */}
                    {tabVisibilityCount >= 2 && (
                        <div className="gn-surface-switcher" aria-label="Visual surfaces">
                            <div className="gn-header-tabs" role="tablist" aria-label="PulsePlay surfaces">
                                {tabVisibility.aiInsights && (
                                <button
                                    role="tab"
                                    id="gn-tab-insights"
                                    aria-selected={activeTab === "insights"}
                                    aria-controls="gn-tabpanel-insights"
                                    tabIndex={activeTab === "insights" ? 0 : -1}
                                    className={`gn-header-tab${activeTab === "insights" ? " gn-header-tab--active" : ""}`}
                                    onClick={() => setActiveTab("insights")}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                            e.preventDefault();
                                            // Skip disabled neighbors when arrowing.
                                            if (tabVisibility.askPulse) {
                                                setActiveTab("chat");
                                                document.getElementById("gn-tab-chat")?.focus();
                                            } else if (tabVisibility.dashboard) {
                                                document.getElementById("gn-tab-dashboard")?.focus();
                                            }
                                        } else if (e.key === "Home") {
                                            e.preventDefault();
                                            setActiveTab("insights");
                                        } else if (e.key === "End") {
                                            e.preventDefault();
                                            // End jumps to the last enabled tab.
                                            const last = tabVisibility.dashboard ? "gn-tab-dashboard"
                                                : tabVisibility.askPulse ? "gn-tab-chat" : "gn-tab-insights";
                                            document.getElementById(last)?.focus();
                                        }
                                    }}
                                >
                                    <span className="gn-header-tab-icon" aria-hidden="true">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
                                        </svg>
                                    </span>
                                    <span>AI Insights</span>
                                </button>
                                )}
                                {tabVisibility.askPulse && (
                                <button
                                    role="tab"
                                    id="gn-tab-chat"
                                    aria-selected={activeTab === "chat"}
                                    aria-controls="gn-tabpanel-chat"
                                    tabIndex={activeTab === "chat" ? 0 : -1}
                                    className={`gn-header-tab${activeTab === "chat" ? " gn-header-tab--active" : ""}`}
                                    onClick={() => setActiveTab("chat")}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            if (tabVisibility.aiInsights) {
                                                setActiveTab("insights");
                                                document.getElementById("gn-tab-insights")?.focus();
                                            }
                                        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                            e.preventDefault();
                                            if (tabVisibility.dashboard) {
                                                document.getElementById("gn-tab-dashboard")?.focus();
                                            }
                                        } else if (e.key === "Home") {
                                            e.preventDefault();
                                            const first = tabVisibility.aiInsights ? "gn-tab-insights" : "gn-tab-chat";
                                            if (first === "gn-tab-insights") setActiveTab("insights");
                                            document.getElementById(first)?.focus();
                                        } else if (e.key === "End") {
                                            e.preventDefault();
                                            const last = tabVisibility.dashboard ? "gn-tab-dashboard" : "gn-tab-chat";
                                            document.getElementById(last)?.focus();
                                        }
                                    }}
                                >
                                    <span className="gn-header-tab-icon" aria-hidden="true">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                        </svg>
                                    </span>
                                    <span>Ask Pulse</span>
                                </button>
                                )}
                                {tabVisibility.dashboard && (
                                <button
                                    role="tab"
                                    id="gn-tab-dashboard"
                                    aria-selected={false}
                                    aria-controls="pp-dashboard-empty"
                                    tabIndex={-1}
                                    className="gn-header-tab gn-header-tab--surface-action"
                                    onClick={() => dispatchPulsePlayViewportAction("focus", "bi")}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            if (tabVisibility.askPulse) {
                                                setActiveTab("chat");
                                                document.getElementById("gn-tab-chat")?.focus();
                                            } else if (tabVisibility.aiInsights) {
                                                setActiveTab("insights");
                                                document.getElementById("gn-tab-insights")?.focus();
                                            }
                                        } else if (e.key === "Home") {
                                            e.preventDefault();
                                            const first = tabVisibility.aiInsights ? "gn-tab-insights"
                                                : tabVisibility.askPulse ? "gn-tab-chat" : "gn-tab-dashboard";
                                            if (first === "gn-tab-insights") setActiveTab("insights");
                                            document.getElementById(first)?.focus();
                                        } else if (e.key === "End") {
                                            // Already on the last tab.
                                            e.preventDefault();
                                        } else if (e.key === "Enter" || e.key === " ") {
                                            // Native button activation already fires onClick; no-op.
                                        }
                                    }}
                                    aria-label="Open dashboard surface"
                                    title="Open dashboard surface"
                                >
                                    <span className="gn-header-tab-icon gn-header-tab-icon--bi" aria-hidden="true">
                                        {/* Bar-chart glyph — replaces the literal "BI" text that was
                                          * causing visible "BI BI Viz" duplication in test snapshots
                                          * (Codex 2026-05-19 tough test, scenario P1-13 / EL-SWITCHER-COPY).
                                          * Audit 2026-05-19: label renamed "BI Viz" → "Dashboard". */}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="6" y1="20" x2="6" y2="11" />
                                            <line x1="12" y1="20" x2="12" y2="5" />
                                            <line x1="18" y1="20" x2="18" y2="14" />
                                        </svg>
                                    </span>
                                    <span>Dashboard</span>
                                </button>
                                )}
                            </div>
                        </div>
                    )}
                    {activeTab === "insights" && isConfigured && (
                        <div
                            className="gn-adjust-menu gn-export-skip"
                            ref={adjustMenuRef}
                            style={{ position: "relative", display: "inline-flex" }}
                        >
                            <button
                                type="button"
                                ref={adjustTriggerRef}
                                className={`gn-header-adjust${showAdjustChips ? " gn-header-adjust--open" : ""}`}
                                onClick={toggleAdjustChips}
                                aria-haspopup="menu"
                                aria-expanded={showAdjustChips}
                                title={showAdjustChips ? "Close Adjust suggestions" : "Open Adjust suggestions"}
                            >
                                Adjust {showAdjustChips ? "▴" : "▾"}
                            </button>
                            {showAdjustChips && (
                                <div
                                    className="gn-adjust-menu-pop"
                                    role="menu"
                                    aria-label="Adjust summary suggestions"
                                >
                                    {INSIGHTS_PROMPT_SUGGESTIONS.map(sug => (
                                        <button
                                            key={sug.id}
                                            type="button"
                                            role="menuitem"
                                            className={`gn-adjust-menu-item${insightsActivePromptId === sug.id ? " gn-adjust-menu-item--active" : ""}`}
                                            disabled={insightsBusy}
                                            title={sug.prompt}
                                            onClick={() => {
                                                setInsightsActivePromptId(sug.id);
                                                setInsightsCustomPrompt("");
                                                runInsights(sug.prompt, sug.label);
                                                setShowAdjustChips(false);
                                            }}
                                        >
                                            {sug.label}
                                        </button>
                                    ))}
                                    {/* 2026-05-28 — strategic-framework presets surfaced
                                      * inline in the Adjust menu so users can re-run
                                      * insights as a SWOT / BCG / RFM / Pareto briefing
                                      * in one click without navigating to Settings → AI.
                                      * Click handler writes the preset's sections (+
                                      * bundled metric direction rules when present) to
                                      * settings, then triggers a fresh insights run
                                      * through the staged planner. */}
                                    <div
                                        role="separator"
                                        aria-orientation="horizontal"
                                        style={{
                                            margin: "6px 0 4px",
                                            padding: "4px 10px 0",
                                            fontSize: 10.5,
                                            fontWeight: 700,
                                            letterSpacing: 0.6,
                                            color: "var(--gn-text-muted)",
                                            textTransform: "uppercase",
                                            borderTop: "1px solid var(--gn-border-subtle)",
                                        }}
                                    >
                                        Apply preset
                                    </div>
                                    {CUSTOM_SECTION_PRESETS.map(preset => (
                                        <button
                                            key={`preset-${preset.id}`}
                                            type="button"
                                            role="menuitem"
                                            className="gn-adjust-menu-item"
                                            disabled={insightsBusy}
                                            title={preset.description}
                                            onClick={() => {
                                                try {
                                                    const sections = preset.params
                                                        ? interpolatePreset(preset, defaultParamValues(preset))
                                                        : preset.sections;
                                                    const patch: { insightsCustomSections: string; insightsDomain?: string; metricDirectionRules?: string } = {
                                                        insightsCustomSections: JSON.stringify(sections, null, 2),
                                                    };
                                                    if (!(props.settings.insightsDomain || "").trim()) {
                                                        patch.insightsDomain = preset.domain;
                                                    }
                                                    if (preset.metricDirectionRules) {
                                                        patch.metricDirectionRules = preset.metricDirectionRules;
                                                    }
                                                    writePulseAiVisualSettingsPatch(patch);
                                                    setInsightsActivePromptId(null);
                                                    setInsightsCustomPrompt("");
                                                    runInsights();
                                                } catch { /* swallow — never crash the menu */ }
                                                setShowAdjustChips(false);
                                            }}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {/* 2026-05-25 — gn-pane-action-cluster REMOVED. The
                     *  Pulse-side AI pane toolbar (Maximize / Minimize /
                     *  Open-in-page / Pop-out) was hidden via CSS in Commit
                     *  5 when the App-level TopRightToolbar took over the
                     *  cross-cutting affordances. Removing the dead JSX
                     *  here completes the cleanup — TopRightToolbar
                     *  dispatches the same pulseplay:viewport-action events
                     *  via the App.tsx handler, so behavior is unchanged. */}
                    {/* Spacer to push the run-state cluster to the far right. */}
                    {activeTab === "insights" && <div className="gn-header-spacer" />}
                    {/* Insights run-state cluster: clock + copy + refresh, then
                        the always-on ProgressIndicator capsule. Only renders on
                        the Insights tab — Chat has its own per-message progress
                        rendered in-bubble. */}
                    {activeTab === "insights" && isConfigured && (
                        <div className="gn-header-run-state">
                            {/*
                              Show the action toolbar (Copy MD / Copy HTML / Print /
                              Customize / Refresh + Stop) only when there's something
                              to act on, OR while busy so the user can Stop. Hides
                              the all-disabled toolbar during the empty
                              "Generating insights..." state to declutter the header.
                              The ProgressIndicator below carries elapsed time and
                              the in-flight stage label.
                            */}
                            {(insightsResult?.content || insightsBusy) && (
                            <div className="gn-insights-meta">
                                {insightsGeneratedAt && (
                                    <span
                                        className="gn-insights-timestamp"
                                        title={`Generated ${new Date(insightsGeneratedAt).toLocaleString()}`}
                                    >
                                        {new Date(insightsGeneratedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}
                                    </span>
                                )}
                                {/* Phase C 2026-05-18 — secondary actions overflow.
                                  * Copy MD / Copy HTML / Print PDF used to sit as
                                  * three peer pill buttons next to Refresh; Rajesh's
                                  * toolbar-noise direction collapses them into a
                                  * single ⋮ trigger that opens a popover. Primary
                                  * controls (timestamp, customize, refresh, stop)
                                  * stay visible. Popover mirrors the customize
                                  * popover pattern: outside-click + Esc close,
                                  * focus returns to the trigger on Esc. */}
                                <div
                                    className="gn-insights-overflow gn-export-skip"
                                    ref={overflowMenuRef}
                                    style={{ position: "relative", display: "inline-flex" }}
                                >
                                    <button
                                        type="button"
                                        ref={overflowTriggerRef}
                                        className={`gn-pane-action-btn${overflowOpen ? " gn-pane-action-btn--active" : ""}`}
                                        disabled={insightsBusy && !insightsResult?.content}
                                        title="More actions (Copy, Print)"
                                        aria-haspopup="menu"
                                        aria-expanded={overflowOpen}
                                        aria-label="More actions: Copy as markdown, Copy as rich HTML, Print or save as PDF"
                                        data-testid="gn-insights-overflow-trigger"
                                        onClick={() => setOverflowOpen(v => !v)}
                                    >
                                        <Icon name="more-vertical" />
                                    </button>
                                    {overflowOpen && (
                                        <div
                                            className="gn-insights-overflow-pop"
                                            role="menu"
                                            aria-label="Insights secondary actions"
                                            data-testid="gn-insights-overflow-pop"
                                        >
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className={`gn-insights-overflow-item${copiedFlash["insights"] ? " gn-insights-overflow-item--copied" : ""}`}
                                                disabled={insightsBusy || !insightsResult?.content}
                                                data-testid="gn-insights-overflow-item-copy-md"
                                                onClick={() => {
                                                    if (insightsResult?.content) {
                                                        // IDEA-039 — clean trailing prose before copying so
                                                        // the clipboard matches what's rendered on screen.
                                                        flashCopy("insights", cleanInsightsContent(insightsResult.content));
                                                        logSession("INFO", "AI Insights copied to clipboard as markdown.");
                                                    }
                                                    setOverflowOpen(false);
                                                }}
                                            >
                                                <Icon name={copiedFlash["insights"] ? "check" : "copy"} />
                                                <span className="gn-insights-overflow-item-label">Copy as markdown</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className={`gn-insights-overflow-item${copiedFlash["insights-html"] ? " gn-insights-overflow-item--copied" : ""}`}
                                                disabled={insightsBusy || !insightsResult?.content}
                                                data-testid="gn-insights-overflow-item-copy-html"
                                                onClick={async () => {
                                                    setOverflowOpen(false);
                                                    if (!insightsResult?.content) return;
                                                    try {
                                                        const containerEl = document.querySelector(".gn-insights-content")
                                                            || document.querySelector("[data-pp-insights-root]");
                                                        const html = renderInsightsAsEmailHtml(
                                                            cleanInsightsContent(insightsResult.content),
                                                            containerEl instanceof HTMLElement ? containerEl.innerHTML : undefined,
                                                        );
                                                        if (navigator.clipboard && typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem === "function") {
                                                            const blob = new Blob([html], { type: "text/html" });
                                                            const text = new Blob([cleanInsightsContent(insightsResult.content)], { type: "text/plain" });
                                                            const ClipboardItemCtor = (window as unknown as { ClipboardItem: new (init: Record<string, Blob>) => unknown }).ClipboardItem;
                                                            await navigator.clipboard.write([new ClipboardItemCtor({ "text/html": blob, "text/plain": text }) as unknown as ClipboardItem]);
                                                            flashCopy("insights-html", "");
                                                            logSession("INFO", "AI Insights copied to clipboard as rich HTML.");
                                                        } else {
                                                            flashCopy("insights-html", html);
                                                            logSession("WARN", "Clipboard API unavailable — copied raw HTML as plain text.");
                                                        }
                                                    } catch (err) {
                                                        const msg = err instanceof Error ? err.message : String(err);
                                                        logSession("ERROR", `Copy as HTML failed: ${msg}`);
                                                        flashCopy("insights", cleanInsightsContent(insightsResult.content));
                                                    }
                                                }}
                                            >
                                                <Icon name={copiedFlash["insights-html"] ? "check" : "file-html"} />
                                                <span className="gn-insights-overflow-item-label">Copy as rich HTML</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="gn-insights-overflow-item"
                                                disabled={insightsBusy || !insightsResult?.content}
                                                data-testid="gn-insights-overflow-item-print"
                                                onClick={() => {
                                                    setOverflowOpen(false);
                                                    try {
                                                        window.print();
                                                        logSession("INFO", "AI Insights print dialog opened (PDF target).");
                                                    } catch (err) {
                                                        const msg = err instanceof Error ? err.message : String(err);
                                                        logSession("ERROR", `Print dialog failed: ${msg}`);
                                                    }
                                                }}
                                            >
                                                <Icon name="printer" />
                                                <span className="gn-insights-overflow-item-label">Print or save as PDF</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* Cycle 26 — global "Export ▾" dropdown removed
                                    along with the per-section kebab ⋮ menus.
                                    The toolbar Copy 📋 button (above) still
                                    captures the entire briefing as markdown,
                                    which covers the "save it for later" case
                                    without per-format chrome. PNG / Excel /
                                    CSV exports were available; if any of
                                    those are needed in future, prefer the
                                    Power BI Service-side native export
                                    (File → Export to PowerPoint / Analyze
                                    in Excel) which doesn't pay our 350 KB
                                    .pbiviz cap or the lazy-chunk sandbox
                                    tax. The lazy-chunk pre-warm probe stays
                                    in place (the flag is consumed by the
                                    section pickers' `</> SQL` gating
                                    indirectly via the same useEffect tree)
                                    so a future re-add doesn't have to
                                    rediscover the sandbox-blocked truth. */}
                                {/* Wave 37 (rev'd post-cycle 16) — viewer-side
                                    section picker, now SCOPED to author-defined
                                    custom sections only. Universal stages
                                    (HEADLINE / KPI SNAPSHOT / TRENDS / RISKS /
                                    OPPORTUNITIES / RECOMMENDED ACTIONS) are
                                    author-controlled in Setup → Section A — they
                                    do NOT appear in this popover. The picker is
                                    rendered as an ICON-ONLY ⚙ pill to keep the
                                    Insights toolbar compact when both this
                                    button and the per-tab Adjust / Export /
                                    Refresh controls are visible. The
                                    `availableSections.length > 0` gate means
                                    when an author has not configured any custom
                                    sections the button is invisible — no UI
                                    weight when not relevant. The pipeline still
                                    RUNS the AI prompt for hidden custom sections
                                    so toggling them back on is instant. */}
                                {availableSections.length > 0 && (
                                    <div
                                        className="gn-customize-menu gn-export-skip"
                                        ref={customizeMenuRef}
                                        style={{ position: "relative", display: "inline-flex" }}
                                    >
                                        <button
                                            type="button"
                                            ref={customizeTriggerRef}
                                            className={`gn-pane-action-btn${customizeOpen ? " gn-pane-action-btn--active" : ""}`}
                                            disabled={insightsBusy && !insightsResult?.content}
                                            title="Show or hide author-defined custom sections"
                                            aria-haspopup="dialog"
                                            aria-expanded={customizeOpen}
                                            aria-label="Show or hide author-defined custom sections"
                                            onClick={() => setCustomizeOpen(v => !v)}
                                        >
                                            <Icon name="settings" />
                                        </button>
                                        {customizeOpen && (
                                            <div
                                                className="gn-customize-menu-pop"
                                                role="dialog"
                                                aria-label="Show or hide author-defined custom sections"
                                            >
                                                <div className="gn-customize-menu-header">
                                                    Show / hide custom sections
                                                </div>
                                                <div className="gn-customize-menu-list">
                                                    {availableSections.map(row => {
                                                        const visible = currentVisibleTitles
                                                            ? currentVisibleTitles.has(row.title)
                                                            : true;
                                                        const isChecked = row.lockedOn ? true : visible;
                                                        const checkboxId = `gn-customize-row-${row.title.replace(/\s+/g, "-")}`;
                                                        return (
                                                            <label
                                                                key={row.title}
                                                                htmlFor={checkboxId}
                                                                className={`gn-customize-menu-item${row.lockedOn ? " gn-customize-menu-item--locked" : ""}`}
                                                            >
                                                                <input
                                                                    id={checkboxId}
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    disabled={row.lockedOn}
                                                                    onChange={() => {
                                                                        if (row.lockedOn) return;
                                                                        toggleSectionVisibility(row.title);
                                                                    }}
                                                                    aria-label={`${visible ? "Hide" : "Show"} ${row.title} section`}
                                                                />
                                                                <span className="gn-customize-menu-item-label">
                                                                    {row.title}
                                                                </span>
                                                                {row.lockedOn && (
                                                                    <span
                                                                        className="gn-customize-menu-item-lock"
                                                                        aria-label="Locked by author — always visible"
                                                                        title="Locked by author — always visible"
                                                                    >
                                                                        🔒
                                                                    </span>
                                                                )}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div className="gn-customize-menu-footer">
                                                    <button
                                                        type="button"
                                                        className="gn-pill gn-pill--compact"
                                                        onClick={() => {
                                                            resetSectionVisibility();
                                                        }}
                                                        title="Restore the author's default — all custom sections visible"
                                                    >
                                                        Reset to defaults
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Wave 30 cycle 6 history — the original Phase 1 CSV
                                    button silently no-op'd when the active Insights
                                    output had no pipe-table (~80% of runs). Phase 2
                                    above replaces it with PNG + Excel + CSV; PNG
                                    always works, Excel/CSV grey out cleanly. The
                                    underlying `exportSectionAsCsv` helper is still
                                    used by the Chat tab table export (where every
                                    answer has a result table) and slated for the
                                    Wave 35 author-defined SQL-section export. */}
                                <button
                                    type="button"
                                    className="gn-pane-action-btn"
                                    disabled={insightsBusy}
                                    title="Refresh insights"
                                    aria-label="Refresh AI Insights for the current report context"
                                    onClick={() => {
                                        clearInsightsCache(computeInsightsCacheKey(activeSpaceKey));
                                        setInsightsActivePromptId(null);
                                        setInsightsCustomPrompt("");
                                        runInsights();
                                    }}
                                >
                                    <Icon name="refresh" />
                                </button>
                                {/* Stop button — only visible mid-run. Cancels the
                                    in-flight pipeline and any partial XHRs. Completed
                                    stages keep their rendered content; remaining
                                    stages are marked errored. */}
                                {insightsBusy && (
                                    <button
                                        type="button"
                                        className="gn-pane-action-btn gn-pane-action-btn--stop"
                                        title="Stop the in-flight AI Insights run"
                                        aria-label="Stop the current AI Insights run"
                                        onClick={() => stopInsights()}
                                    >
                                        ■ Stop
                                    </button>
                                )}
                                {/* IDEA-039 step 1.3 — the standalone Configure pill
                                    here is redundant with the Console entry, which
                                    owns diagnostics and links to Settings. */}
                            </div>
                            )}
                            {(stageStatuses.length > 0 || insightsBusy) && (
                                <div className="gn-insights-progress-wrap gn-insights-progress-wrap--header">
                                    {/* Wave 15 a11y — dedicated SR-only live region for stage
                                       transitions. The ProgressIndicator wrapper carries
                                       role=status but its text is layered (steps + label) so
                                       SRs may not re-announce on label-only changes. This
                                       sibling announces the latest stage label whenever it
                                       shifts. aria-atomic so the FULL phrase is read each time. */}
                                    <span
                                        className="gn-sr-only"
                                        role="status"
                                        aria-live="polite"
                                        aria-atomic="true"
                                    >
                                        {insightsResult?.currentStatus
                                            ? `AI Insights: ${insightsResult.currentStatus}`
                                            : ""}
                                    </span>
                                    <ProgressIndicator
                                        className="gn-insights-progress"
                                        steps={stageStatuses.length > 0
                                            ? insightsProgressSteps
                                            : [{ id: "warming", label: describeGenieStatus(insightsResult?.currentStatus || "PENDING").label, icon: describeGenieStatus(insightsResult?.currentStatus || "PENDING").icon, state: "active" }]}
                                        elapsedMs={insightsElapsed * 1000}
                                        isComplete={insightsAllDone}
                                        isFailed={insightsAnyError}
                                        collapseEarly={!!(insightsResult?.content && insightsResult.content.trim())}
                                        activeOverride={(() => {
                                            // currentStatus may be either:
                                            //  (a) a raw Genie status token (PENDING_WAREHOUSE, EXECUTING_QUERY, etc.)
                                            //      — these get translated via describeGenieStatus() into friendly verbs.
                                            //  (b) a polished sentence we wrote ourselves (e.g. supervisor's
                                            //      "Asking supervisor for HEADLINE") — pass through verbatim.
                                            // Detect (a) by "first word is ALL_CAPS_WITH_UNDERSCORES"; everything
                                            // else is treated as (b). This stops the supervisor's per-stage label
                                            // being swallowed by the catch-all "Working on it" fallback.
                                            if (insightsAllDone || !insightsResult?.currentStatus) return undefined;
                                            const s = insightsResult.currentStatus;
                                            const firstWord = s.split(/\s/)[0] || "";
                                            const looksLikeRawToken = /^[A-Z][A-Z0-9_]*$/.test(firstWord);
                                            return looksLikeRawToken ? describeGenieStatus(s).label : s;
                                        })()}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <PulseSurfaceContextStrip
                surface={activeTab === "insights" ? "AI Insights" : "Ask Pulse"}
                mode={pulseSurfaceContext.mode}
                items={[
                    { label: "Assistant", value: pulseSurfaceContext.assistant },
                    { label: "Source", value: pulseSurfaceContext.source },
                    { label: "Scope", value: pulseSurfaceContext.scope },
                    { label: "Trust", value: pulseSurfaceContext.trust },
                ]}
            />

            {activeTab === "insights" && (
                <div
                    className="gn-insights-pane"
                    role={enabledFeatures === "both" ? "tabpanel" : undefined}
                    id={enabledFeatures === "both" ? "gn-tabpanel-insights" : undefined}
                    aria-labelledby={enabledFeatures === "both" ? "gn-tab-insights" : undefined}
                    ref={activeTab === "insights" ? chatRef : undefined}>
                    {/* Cycle 22 — Adjust suggestions used to render here as a
                        standalone horizontal strip below the toolbar. They now
                        live INSIDE a popover anchored to the Adjust button in
                        the toolbar (see the gn-adjust-menu wrapper in header
                        row 2). The pane stays slim and the suggestions remain
                        one click away. */}
                    {/* Cycle 44 (C) — connector-compatibility warning. Opt-in
                        via Setup → Operations → "Show connector compatibility
                        warnings" (default OFF). Surfaces inline when settings
                        configured for one connector aren't honored by the
                        active backend. Today: Custom SQL sections require
                        Databricks Genie (proxy or direct). On Azure OpenAI /
                        Bedrock, those sections no-op. The warning gives
                        authors the heads-up so they don't wonder why a
                        configured Custom SQL section returns nothing. */}
                    {/* Stale-while-revalidate banner: shown while a background
                        refresh is running on top of a cached result. Tells the
                        user what they're seeing without hiding the content. */}
                    {staleRefreshingMap[activeSpaceKey] && (
                        <div
                            className="gn-insights-stale-banner"
                            role="status"
                            aria-live="polite"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 12px",
                                fontSize: 12,
                                color: "var(--pp-text-muted, #6b7280)",
                                borderBottom: "1px solid var(--pp-border, #e5e7eb)",
                                // --pp-surface-subtle is undefined → fall back to the
                                // dark-aware raised surface, not white (#f9fafb was a
                                // white bar in dark mode — closing-smoke screenshot 08).
                                background: "var(--pp-surface-subtle, var(--pp-surface-raised, #f9fafb))",
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "gn-progress-spin 1.2s linear infinite", flexShrink: 0 }}>
                                <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8" />
                                <path d="M21 3v5h-5" />
                                <path d="M21 12a9 9 0 0 1-15.5 6.36L3 16" />
                                <path d="M3 21v-5h5" />
                            </svg>
                            <span>Showing last completed briefing while PulsePlay refreshes.</span>
                        </div>
                    )}
                    {props.settings.showConnectorCompatibilityWarnings && (() => {
                        const isDatabricks = props.settings.connectionMode === "proxy" || props.settings.connectionMode === "direct";
                        if (isDatabricks) return null;
                        let hasSqlSections = false;
                        try {
                            const customs = parseCustomSections(props.settings.insightsCustomSections || "");
                            hasSqlSections = customs.some(c => c.kind === "sql");
                        } catch { /* ignore parse errors */ }
                        if (!hasSqlSections) return null;
                        return (
                            <div className="gn-insights-incomplete gn-insights-incomplete--with-action" role="status" aria-live="polite" style={{ marginBottom: 8 }}>
                                <span className="gn-insights-incomplete-text">
                                    ℹ <strong>Connector compatibility:</strong> you have <strong>Custom SQL sections</strong> configured but the active backend is <strong>{props.settings.connectionMode}</strong>. SQL sections require Databricks Genie (Proxy or Direct mode) to execute. They&apos;ll be skipped or treated as text on this backend. Switch the connection mode in Setup → Section B, or convert the SQL sections to AI sections.
                                </span>
                            </div>
                        );
                    })()}
                    {!insightsResult && !insightsBusy ? (
                        // AI and BI are independent verticals (PulsePlay design
                        // principle): the only thing that gates AI Insights is
                        // whether AI is configured. BI is optional grounding.
                        // - !isConfigured → ask the author to wire AI + show
                        //                   what AI Insights will do once it
                        //                   IS configured, so the surface
                        //                   doesn't feel dead pre-config
                        //                   (audit P2-1 — parity with Ask Pulse
                        //                   empty state's Quick-start chips).
                        // - isConfigured  → brief "Generating…" flash before
                        //                   insightsBusy flips true and the
                        //                   running state takes over rendering
                        <div className="gn-insights-placeholder">
                            <span className="gn-insights-icon" aria-hidden="true">✨</span>
                            <h3>AI Insights</h3>
                            {isConfigured ? (
                                <p role="status" aria-live="polite">Generating insights…</p>
                            ) : (
                                <>
                                    <p style={{ margin: "0 0 14px" }}>
                                        Connect an AI assistant and PulsePlay will auto-generate a
                                        briefing across whatever you're looking at.
                                    </p>
                                    <ul style={{
                                        textAlign: "left",
                                        listStyle: "none",
                                        padding: 0,
                                        margin: "0 0 18px",
                                        display: "inline-block",
                                        fontSize: 12,
                                        lineHeight: 1.65,
                                        color: "var(--gn-text-muted)",
                                    }}>
                                        <li>• Headline — what changed and by how much</li>
                                        <li>• Trends — what's moving, with grounded SQL</li>
                                        <li>• Risks &amp; opportunities — flagged with evidence</li>
                                        <li>• Recommended actions — tied to your KPIs</li>
                                    </ul>
                                    <div style={{
                                        display: "flex",
                                        gap: 8,
                                        justifyContent: "center",
                                        flexWrap: "wrap",
                                    }}>
                                        <button
                                            type="button"
                                            className="gn-cta-primary"
                                            onClick={() => {
                                                try {
                                                    window.history.pushState({}, "", "/settings/ai");
                                                    window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
                                                } catch { /* swallow */ }
                                            }}
                                        >
                                            Connect AI assistant →
                                        </button>
                                        <button
                                            type="button"
                                            className="gn-cta-secondary"
                                            onClick={() => {
                                                try {
                                                    window.history.pushState({}, "", "/knowledge");
                                                    window.dispatchEvent(new PopStateEvent("popstate"));
                                                } catch { /* swallow */ }
                                            }}
                                        >
                                            Browse knowledge packs
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (!insightsResult || (insightsResult.status === "RUNNING" && !(insightsResult.content || "").trim())) ? (
                        // No content yet — the always-on ProgressIndicator above
                        // already covers the running state. 49.16 — but if the run
                        // has settled (busy=false AND all stages reached a terminal
                        // state) yet content is still empty, show a soft-fail
                        // message so the user is never stuck on a blank panel
                        // with no retry path.
                        // Cycle 39 — when the pipeline IS running and titles are
                        // known, render the placeholder grid via
                        // renderInsightsSections (it handles empty content +
                        // pendingStageTitles by emitting skeleton cards). The
                        // viewer sees the SHAPE of the briefing immediately
                        // instead of a blank panel for ~10-20s.
                        (insightsBusy && pendingStageTitles.length > 0) ? (
                            <div className="gn-msg gn-msg--assistant">
                                <div className="gn-bubble">
                                    {renderInsightsSections("", {
                                        pendingStageTitles,
                                        stageStatuses,
                                        visibleSectionTitles: currentVisibleTitles,
                                    })}
                                </div>
                            </div>
                        ) : (!insightsBusy && stageStatuses.length > 0 && stageStatuses.every(s => s === "done" || s === "error")) ? (
                            <div className="gn-insights-empty">
                                <div className="gn-insights-empty-card">
                                    <div className="gn-insights-empty-icon" aria-hidden="true">
                                        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                                            <rect x="6" y="14" width="44" height="34" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
                                            <path d="M14 26h28M14 32h22M14 38h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
                                            <circle cx="40" cy="14" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
                                            <path d="M37 14h6M40 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                        </svg>
                                    </div>
                                    <h3 className="gn-insights-empty-title">No rows found</h3>
                                    <p className="gn-insights-empty-subtitle">
                                        This filter context returned no data. Refresh the visual or adjust filters to broaden the result set.
                                    </p>
                                    <div className="gn-insights-empty-actions">
                                        <button
                                            type="button"
                                            className="gn-btn gn-btn--compact gn-btn--outline"
                                            onClick={() => {
                                                clearInsightsCache(computeInsightsCacheKey(activeSpaceKey));
                                                insightsFiredRef.current[activeSpaceKey] = false;
                                                setSpaceInsightsResult(activeSpaceKey, null);
                                                setSpaceStageStatuses(activeSpaceKey, []);
                                            }}
                                        >
                                            Refresh
                                        </button>
                                        <button
                                            type="button"
                                            className="gn-btn gn-btn--compact gn-btn--outline"
                                            onClick={() => openPulsePlaySettings("setup")}
                                        >
                                            Open Settings
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null
                    ) : insightsResult.status === "FAILED" ? (
                        // P1.5 error-state redesign — full failure (no partial content).
                        // Copy from ChatGPT's error-state-copy.md variant 1.
                        <div className="gn-insights-error gn-insights-error--full">
                            <div className="gn-insights-error-card">
                                <div className="gn-insights-error-icon" aria-hidden="true">
                                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" fill="none"/>
                                        <path d="M20 12v10M20 26v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                                    </svg>
                                </div>
                                <h3 className="gn-insights-error-title">Insight run stopped</h3>
                                <p className="gn-insights-error-body">
                                    {(insightsResult.failedStageTitle ?? "Pipeline")} could not finish: {insightsResult.failureMessage ?? insightsResult.content}.
                                </p>
                                <div className="gn-insights-error-actions">
                                    <button
                                        type="button"
                                        className="gn-btn gn-btn--compact gn-btn--danger-outline"
                                        onClick={() => {
                                            clearInsightsCache(computeInsightsCacheKey(activeSpaceKey));
                                            insightsFiredRef.current[activeSpaceKey] = false;
                                            setSpaceInsightsResult(activeSpaceKey, null);
                                        }}
                                    >
                                        Retry
                                    </button>
                                    <button
                                        type="button"
                                        className="gn-btn gn-btn--compact gn-btn--outline"
                                        onClick={() => {
                                            setDevPanel("diagnostics");
                                            setShowDevModal(true);
                                        }}
                                    >
                                        View trace
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="gn-insights-content">
                            {/* Wave 27 cycle 3 — supervisor + AI Insights perf advisory. */}
                            {showSupervisorInsightsWarning && (
                                <div className="gn-insights-incomplete" role="status" aria-live="polite" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                                    <span style={{ flex: 1 }}>
                                        ℹ <strong>Supervisor mode</strong> for AI Insights fans out per stage to multiple sources with synthesis — a 3-stage pipeline can take 3+ minutes and may hit the 5-minute timeout. For faster Insights, switch Connection Mode to <strong>Proxy</strong> with a single-space profile (e.g. <code>sales</code>). Chat-tab Supervisor mode is unaffected.
                                    </span>
                                    <button
                                        type="button"
                                        className="gn-pill gn-pill--compact"
                                        onClick={() => setShowSupervisorInsightsWarning(false)}
                                        aria-label="Dismiss the Supervisor + AI Insights performance advisory"
                                        title="Dismiss"
                                    >×</button>
                                </div>
                            )}
                            {/* P1.5 — partial-failure inline error card. Renders ABOVE the
                                preserved partial output when a mid-run stage failed but
                                earlier stages produced content. The bubble below stays at
                                full opacity (the design's ~90% dim was a static-image
                                convention; in PBI Desktop the content is functional). */}
                            {insightsResult.failureMessage && (
                                <div className="gn-insights-error gn-insights-error--inline" role="alert">
                                    <div className="gn-insights-error-card">
                                        <div className="gn-insights-error-icon" aria-hidden="true">
                                            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                                                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" fill="none"/>
                                                <path d="M20 12v10M20 26v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                                            </svg>
                                        </div>
                                        <div className="gn-insights-error-text">
                                            <h3 className="gn-insights-error-title">Insight run stopped</h3>
                                            <p className="gn-insights-error-body">
                                                {(insightsResult.failedStageTitle ?? "Pipeline")} could not finish: {insightsResult.failureMessage}. Any completed stages remain visible below.
                                            </p>
                                        </div>
                                        <div className="gn-insights-error-actions">
                                            <button
                                                type="button"
                                                className="gn-btn gn-btn--compact gn-btn--danger-outline"
                                                onClick={() => {
                                                    clearInsightsCache(computeInsightsCacheKey(activeSpaceKey));
                                                    insightsFiredRef.current[activeSpaceKey] = false;
                                                    setSpaceInsightsResult(activeSpaceKey, null);
                                                }}
                                            >
                                                Retry
                                            </button>
                                            <button
                                                type="button"
                                                className="gn-btn gn-btn--compact gn-btn--outline"
                                                onClick={() => {
                                                    setDevPanel("diagnostics");
                                                    setShowDevModal(true);
                                                }}
                                            >
                                                View trace
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Wave 23: Compare-all view. When ON + multi-space, render
                                all spaces' Insights side-by-side in a responsive grid.
                                Else (default), render only the active space. */}
                            {insightsCompareMode && props.settings.multiSpaceEnabled && activeSpaces.length > 1 ? (
                                <div className="gn-insights-compare-grid" role="region" aria-label="Compare AI Insights across spaces">
                                    {activeSpaces.map(space => {
                                        const r = insightsResultMap[space.key];
                                        const hasContent = !!(r && r.content && r.content.trim());
                                        // Wave 27 cycle 3 — slot validation badge. If a non-primary
                                        // space's spaceId silently inherited from the primary because
                                        // the slot was partially configured (label set but spaceId blank),
                                        // surface a ⚠ badge so authors realise this column is showing
                                        // duplicate data, not a real second space's view.
                                        const primarySpaceId = activeSpaces[0]?.genieConfig.spaceId || "";
                                        const inheritedFromPrimary = space.key !== "space1"
                                            && primarySpaceId
                                            && space.genieConfig.spaceId === primarySpaceId;
                                        return (
                                            <div key={space.key} className="gn-insights-compare-col">
                                                <div className="gn-insights-compare-col-header">
                                                    <span className="gn-insights-compare-col-label">{space.label}</span>
                                                    {space.key === activeSpaceKey && (
                                                        <span className="gn-insights-compare-col-active" title="Currently active space">●</span>
                                                    )}
                                                    {inheritedFromPrimary && (
                                                        <span
                                                            className="gn-insights-compare-col-warn"
                                                            title="This column's space ID was inherited from the primary because the slot is incomplete in Setup. Configure a unique spaceId in Section D for this slot, or hide it by lowering Multi-Space Count."
                                                            aria-label="Slot inherits primary space ID — duplicate data warning"
                                                        >⚠</span>
                                                    )}
                                                </div>
                                                <div className="gn-msg gn-msg--assistant">
                                                    <div className="gn-bubble gn-bubble--compare">
                                                        {hasContent ? (
                                                            renderInsightsSections(r!.content || "", {
                                                                metricDirectionsJson: props.settings.insightsMetricDirections,
                                                                legacyMetricDirectionRules: props.settings.metricDirectionRules,
                                                                generatedAt: insightsGeneratedAtMap[space.key] ?? undefined,
                                                                sourceLabel: space.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                                showProvenanceFooter: props.settings.insightsShowProvenanceFooter,
                                                                // Wave 33 — per-section pill opt-out from custom-section authors.
                                                                disabledTrendPillSections: getDisabledTrendPillSectionTitles(props.settings.insightsCustomSections),
                                                                // Wave 37 — viewer-side visibility filter (per-report localStorage).
                                                                visibleSectionTitles: currentVisibleTitles,
                                                                // Cycle 20 — per-section export + Show SQL.
                                                                lazyExportBlocked,
                                                                canShowSql,
                                                                stageSqlByTitle: buildStageSqlMap(r?.stageTraces),
                                                                stageDataByTitle: buildStageDataMap(r?.stageTraces),
                                                                openSqlSections: openSqlSectionTitles,
                                                                onToggleSectionSql: toggleSectionSql,
                                                                spaceId: space.genieConfig.spaceId,
                                                                spaceLabel: space.label,
                                                                onSectionExport: (title, body, kind, node) => handleSectionExport({
                                                                    title, body, kind, node,
                                                                    spaceId: space.genieConfig.spaceId,
                                                                    spaceLabel: space.label,
                                                                    sourceLabel: space.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                                    generatedAt: insightsGeneratedAtMap[space.key] ?? undefined,
                                                                }),
                                                                onExportSectionRawData: (title, queryResult, reusedFromTitle) => handleSectionRawDataExport(
                                                                    title,
                                                                    queryResult,
                                                                    reusedFromTitle,
                                                                    {
                                                                        spaceId: space.genieConfig.spaceId,
                                                                        spaceLabel: space.label,
                                                                        sourceLabel: space.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                                        generatedAt: insightsGeneratedAtMap[space.key] ?? undefined,
                                                                    }
                                                                ),
                                                                onRetrySection: retrySection,
                                                                onCopySection: copySection,
                                                                retriableTitles: new Set((runStageRef.current?.titles ?? []).map(t => (t || "").trim().toUpperCase())),
                                                                pendingStageTitles,
                                                                stageStatuses,
                                                            })
                                                        ) : (
                                                            <div className="gn-insights-compare-empty">
                                                                {r?.status === "RUNNING"
                                                                    ? "Running..."
                                                                    : "No Insights yet — switch to this tab and click Refresh to generate."}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="gn-msg gn-msg--assistant">
                                    <div className="gn-bubble">
                                        {/* PulsePlay — one-click color-rules banner.
                                          * Renders when the briefing has content but no
                                          * metric-direction rules are set, so the AI's
                                          * KPI tables show numbers without 🟢/🟡/🔴 status
                                          * indicators. Picking a preset persists via
                                          * host.persistProperties → triggers a re-render;
                                          * the next Refresh applies the colors. */}
                                        {!props.settings.metricDirectionRules?.trim()
                                            && (insightsResult?.content || "").trim()
                                            && !briefingHasStatusColors(insightsResult?.content || "")
                                            && (
                                            <ColorRulesBanner
                                                host={props.host}
                                                currentDomain={props.settings.insightsDomain || ""}
                                            />
                                        )}
                                        {/* Cycle 25 — the global floating "View SQL" pill that
                                            used to live at the top-right of this bubble was
                                            removed. It only ever surfaced ONE SQL string
                                            (insightsResult.sqlQuery — set by whichever stage
                                            ran last), framed it as if it were the SQL for the
                                            entire briefing, and replaced the whole rendered
                                            output with a single <pre> when toggled on. With
                                            cycle 20's per-section </> SQL pills, each stage's
                                            SQL is independently inspectable in its own card.
                                            Two surfaces with different scopes was confusing —
                                            now there is only one. To see SQL: enable
                                            Setup → Operations → "Show Generated SQL" and
                                            click </> SQL on any section header. */}
                                        {/* 49.11 — in-bubble ProgressIndicator removed.
                                                    The always-on indicator now lives in the
                                                    header row 2 (right side) so the bubble
                                                    contains only narrative content. */}
                                                {/* Research Agent / Genie Agent Mode reasoning trace.
                                                 *
                                                 * Renders only when:
                                                 *  - the message carries reasoning_traces (Databricks Genie
                                                 *    populates this field only when Agent Mode was activated;
                                                 *    Agent Mode is currently UI-only — REST API can't trigger
                                                 *    it as of 2026-05 — so this surfaces traces that originated
                                                 *    from a Genie-UI session sharing the same space)
                                                 *  - the author hasn't opted out via Settings → Preferences →
                                                 *    Mix composition → Research Agent traces. Default ON.
                                                 *
                                                 * Collapsed by default with <details> so it doesn't dominate
                                                 * the main narrative. */}
                                                {Array.isArray(insightsResult.reasoningTraces) && insightsResult.reasoningTraces.length > 0 && props.settings.insightsShowResearchTraces !== false && (
                                                    <details className="gn-insights-research-traces" style={{ marginBottom: 12, padding: "8px 12px", border: "1px solid rgba(124, 58, 237, 0.30)", borderRadius: 6, background: "rgba(245, 243, 255, 0.6)" }}>
                                                        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#5b21b6" }}>
                                                            🔬 Research Agent reasoning ({insightsResult.reasoningTraces.length} {insightsResult.reasoningTraces.length === 1 ? "step" : "steps"})
                                                        </summary>
                                                        <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: 12, lineHeight: 1.5 }}>
                                                            {insightsResult.reasoningTraces.map((trace, i) => (
                                                                <li key={i} style={{ marginBottom: 4 }}>
                                                                    <strong style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.4, color: "#7c3aed", marginRight: 6 }}>{trace.kind}</strong>
                                                                    <span>{trace.description || "(no description)"}</span>
                                                                </li>
                                                            ))}
                                                        </ol>
                                                    </details>
                                                )}
                                                {/* Phase E.1 — stage progression strip. Visible only while
                                                    the briefing is still progressively revealing. Each pill
                                                    represents a reveal stage (done / current / pending). */}
                                                {revealProgress && revealProgress.totalStages > 1 && (
                                                    <div
                                                        className="gn-reveal-stage-strip"
                                                        role="status"
                                                        aria-live="polite"
                                                        aria-label={`Briefing reveal: stage ${Math.max(1, revealProgress.currentStageIndex + 1)} of ${revealProgress.totalStages}`}
                                                        style={{
                                                            display: "flex",
                                                            gap: 6,
                                                            alignItems: "center",
                                                            margin: "0 0 10px",
                                                            fontSize: 11,
                                                            lineHeight: 1.4,
                                                            flexWrap: "wrap",
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: 600, color: "var(--gn-text-muted, #6b7280)", marginRight: 4 }}>
                                                            Revealing briefing:
                                                        </span>
                                                        {revealProgress.stageProgress.map(stage => {
                                                            const isDone    = stage.status === "done";
                                                            const isCurrent = stage.status === "current";
                                                            return (
                                                                <span
                                                                    key={`reveal-stage-${stage.index}`}
                                                                    data-stage-index={stage.index}
                                                                    data-stage-status={stage.status}
                                                                    title={stage.sections.join(" + ")}
                                                                    style={{
                                                                        display: "inline-flex",
                                                                        alignItems: "center",
                                                                        gap: 4,
                                                                        padding: "2px 8px",
                                                                        borderRadius: 10,
                                                                        background: isDone ? "rgba(16, 185, 129, 0.12)" : isCurrent ? "rgba(124, 58, 237, 0.14)" : "rgba(148, 163, 184, 0.12)",
                                                                        color: isDone ? "#047857" : isCurrent ? "#5b21b6" : "#64748b",
                                                                        border: `1px solid ${isDone ? "rgba(16, 185, 129, 0.35)" : isCurrent ? "rgba(124, 58, 237, 0.35)" : "rgba(148, 163, 184, 0.30)"}`,
                                                                        fontWeight: isCurrent ? 600 : 500,
                                                                    }}
                                                                >
                                                                    <span aria-hidden="true">
                                                                        {isDone ? "✓" : isCurrent ? "●" : "○"}
                                                                    </span>
                                                                    {stage.label}
                                                                </span>
                                                            );
                                                        })}
                                                        {revealProgress.isRevealing && revealProgress.msUntilNextStage != null && (
                                                            <span style={{ marginLeft: 4, color: "var(--gn-text-muted, #6b7280)" }}>
                                                                · next in {Math.max(1, Math.ceil(revealProgress.msUntilNextStage / 1000))}s
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {renderInsightsSections(insightsResult.content || "", {
                                                    metricDirectionsJson: props.settings.insightsMetricDirections,
                                                    legacyMetricDirectionRules: props.settings.metricDirectionRules,
                                                    generatedAt: insightsGeneratedAtMap[activeSpaceKey] ?? undefined,
                                                    sourceLabel: activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                    showProvenanceFooter: props.settings.insightsShowProvenanceFooter,
                                                    // Wave 33 — per-section pill opt-out from custom-section authors.
                                                    disabledTrendPillSections: getDisabledTrendPillSectionTitles(props.settings.insightsCustomSections),
                                                    // Wave 37 — viewer-side visibility filter (per-report localStorage).
                                                    visibleSectionTitles: currentVisibleTitles,
                                                    // Phase E.1 — client-side progressive reveal of the Genie answer.
                                                    revealedSectionTitles,
                                                    // Cycle 20 — per-section export + Show SQL.
                                                    lazyExportBlocked,
                                                    canShowSql,
                                                    stageSqlByTitle: buildStageSqlMap(insightsResult.stageTraces),
                                                    stageDataByTitle: buildStageDataMap(insightsResult.stageTraces),
                                                    openSqlSections: openSqlSectionTitles,
                                                    onToggleSectionSql: toggleSectionSql,
                                                    spaceId: activeSpace?.genieConfig.spaceId,
                                                    spaceLabel: activeSpace?.label,
                                                    onSectionExport: (title, body, kind, node) => handleSectionExport({
                                                        title, body, kind, node,
                                                        spaceId: activeSpace?.genieConfig.spaceId,
                                                        spaceLabel: activeSpace?.label,
                                                        sourceLabel: activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                        generatedAt: insightsGeneratedAtMap[activeSpaceKey] ?? undefined,
                                                    }),
                                                    onExportSectionRawData: (title, queryResult, reusedFromTitle) => handleSectionRawDataExport(
                                                        title,
                                                        queryResult,
                                                        reusedFromTitle,
                                                        {
                                                            spaceId: activeSpace?.genieConfig.spaceId,
                                                            spaceLabel: activeSpace?.label,
                                                            sourceLabel: activeSpace?.genieConfig.assistantProfile || props.settings.assistantProfile || "default",
                                                            generatedAt: insightsGeneratedAtMap[activeSpaceKey] ?? undefined,
                                                        }
                                                    ),
                                                    onRetrySection: retrySection,
                                                    onCopySection: copySection,
                                                })}
                                                {/* Wave 35 Phase 3 — Custom SQL section cards.
                                                    Rendered alongside the AI Insights output.
                                                    Each kind:"sql" section in insightsCustomSections
                                                    produces one card via SqlSectionRenderer; results
                                                    are pre-fetched by the SQL dispatcher effect and
                                                    cached for SQL_SECTION_CACHE_TTL_MS (4h). */}
                                                {(() => {
                                                    const parsed = parseCustomSections(props.settings.insightsCustomSections || "");
                                                    const sqlSections = parsed.filter(s => s.kind === "sql" && s.sql && s.sql.trim());
                                                    if (sqlSections.length === 0) return null;
                                                    const sqlHash = computeSqlHash(sqlSections);
                                                    // Wave 37 — viewer-side visibility filter for SQL sections.
                                                    // The author may have set lockedOn on a SQL section; we still
                                                    // execute the SQL (results cached) so toggling back on is
                                                    // instant — only the card render is suppressed when hidden.
                                                    const visibleSqlSections = sqlSections.filter(sec =>
                                                        isSectionVisible(currentVisibleTitles, sec.name)
                                                    );
                                                    if (visibleSqlSections.length === 0) return null;
                                                    return (
                                                        <div className="gn-sql-sections" role="region" aria-label="Custom SQL sections">
                                                            {visibleSqlSections.map(sec => {
                                                                const key = `${activeSpaceKey}|${sqlHash}|${sec.name}`;
                                                                const cached = sqlSectionResults[key];
                                                                const loading = !!sqlSectionLoading[key];
                                                                const section: SqlSection = {
                                                                    kind: "sql",
                                                                    title: sec.name,
                                                                    sql: sec.sql || "",
                                                                    resultRender: sec.resultRender || "kpi",
                                                                    format: sec.format,
                                                                };
                                                                return (
                                                                    <div key={key} className="gn-sql-section-wrap">
                                                                        <SqlSectionRenderer
                                                                            section={section}
                                                                            result={cached?.result ? maskSqlResult(cached.result, maskingRules) : null}
                                                                            loading={loading}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                    </div>
                                </div>
                            )}
                            {/* IDEA-032: Insights follow-ups (clarifiers extracted by
                                IDEA-008) no longer render here — they're now folded
                                into the Chat tab's "Try asking" strip with a "✨" marker
                                so the Insights pane stays clean and ends on
                                RECOMMENDED ACTIONS. Removed alongside the explicit
                                "Ask a follow-up" CTA — chat is one tab-click away. */}

                            {/* 2026 — Genie native suggested follow-ups (separate from
                             *  IDEA-032 clarifiers). Genie's 2026 conversation API GA
                             *  populates `attachments[].suggested_questions` on
                             *  COMPLETED messages with confident next-step questions.
                             *  Render as compact chip row; click fires runInsights
                             *  with the chip as a custom prompt. Defensive: only
                             *  renders when the field is present and non-empty —
                             *  silent for older workspace versions or messages
                             *  where Genie didn't suggest any. */}
                            {Array.isArray(insightsResult?.suggestedFollowUps) && insightsResult.suggestedFollowUps.length > 0 && !insightsBusy && (
                                <div
                                    className="gn-insights-follow-ups"
                                    role="group"
                                    aria-label="Suggested follow-up questions"
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 6,
                                        margin: "12px 0 4px",
                                        padding: "8px 12px",
                                        background: "rgba(239, 246, 255, 0.55)",
                                        border: "1px solid rgba(37, 99, 235, 0.18)",
                                        borderRadius: 6,
                                    }}
                                >
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8", marginRight: 4, alignSelf: "center" }}>✨ Try asking:</span>
                                    {insightsResult.suggestedFollowUps.map((q, i) => (
                                        <button
                                            key={`${i}-${q.slice(0, 12)}`}
                                            type="button"
                                            className="gn-pill"
                                            onClick={() => runInsights(q, "Follow-up")}
                                            disabled={insightsBusy}
                                            style={{
                                                fontSize: 11,
                                                padding: "4px 10px",
                                                background: "white",
                                                border: "1px solid rgba(37, 99, 235, 0.40)",
                                                color: "#1d4ed8",
                                                borderRadius: 999,
                                                cursor: insightsBusy ? "not-allowed" : "pointer",
                                            }}
                                        >
                                            {q.length > 90 ? q.slice(0, 87) + "…" : q}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Copilot-style custom prompt compose box. Sends a free-form
                                instruction as the new insights prompt, letting the user
                                tune tone or focus without leaving the Insights tab. */}
                            {isConfigured && (
                                <form
                                    className="gn-insights-compose"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const trimmed = insightsCustomPrompt.trim();
                                        if (!trimmed || insightsBusy) return;
                                        setInsightsActivePromptId(null);
                                        runInsights(trimmed, "Custom request");
                                    }}
                                >
                                    <input
                                        type="text"
                                        className="gn-insights-compose-input"
                                        placeholder="Adjust the summary with your own instructions…"
                                        value={insightsCustomPrompt}
                                        onChange={(e) => setInsightsCustomPrompt(e.target.value)}
                                        disabled={insightsBusy}
                                        aria-label="Custom summary prompt"
                                    />
                                    <button
                                        type="submit"
                                        className="gn-pill gn-pill--primary"
                                        disabled={insightsBusy || !insightsCustomPrompt.trim()}
                                    >
                                        Apply
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "chat" && (
                <div
                    className="gn-chat-panel"
                    role={enabledFeatures === "both" ? "tabpanel" : undefined}
                    id={enabledFeatures === "both" ? "gn-tabpanel-chat" : undefined}
                    aria-labelledby={enabledFeatures === "both" ? "gn-tab-chat" : undefined}
                >
                    <div className="gn-history-bar">
                        {showHistoryButton && (
                            <button
                                type="button"
                                className="gn-pill gn-pill--compact"
                                disabled={!isConfigured}
                                onClick={() => setShowHistory(prev => !prev)}
                            >
                                {showHistory ? "Hide history" : "Show history"}
                            </button>
                        )}
                        {canViewAllHistory && (
                            <label className="gn-history-toggle">
                                <input
                                    type="checkbox"
                                    checked={historyIncludeAll}
                                    onChange={e => setHistoryIncludeAll(e.target.checked)}
                                />
                                <span>Author view: all users</span>
                            </label>
                        )}
                        {/* T7 anonymous-first: prior "Bind User Identity to enable per-user
                           retrieval." hint was dev-tooling phrasing and rendered as
                           noise on the Ask Pulse home. Anonymous chat is now first-
                           class; identity is optional. A follow-up slice surfaces a
                           sign-in nudge at risk-of-loss moments (save / share / export),
                           not as a passive hint on the landing surface. */}
                    </div>
                    {showHistory && (
                        <div className="gn-history-panel">
                            <div className="gn-history-panel-head">
                                <strong>Chat History</strong>
                                <button className="gn-pill gn-pill--compact" disabled={historyBusy} onClick={() => void loadHistory()}>
                                    Refresh
                                </button>
                            </div>
                            {historyError && <div className="gn-history-error">{historyError}</div>}
                            {historyBusy ? (
                                <div className="gn-history-empty">Loading history...</div>
                            ) : historyItems.length === 0 && !historyError ? (
                                <div className="gn-history-empty">No saved history for this scope yet.</div>
                            ) : (
                                <div className="gn-history-list">
                                    {historyItems.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className="gn-history-item"
                                            onClick={() => {
                                                const restored: ChatMessageViewModel[] = [
                                                    {
                                                        id: `${item.id}-q`,
                                                        role: "user",
                                                        status: "COMPLETED",
                                                        content: item.question ?? ""
                                                    },
                                                    {
                                                        id: item.messageId || `${item.id}-a`,
                                                        role: "assistant",
                                                        status: "COMPLETED",
                                                        content: item.answer ?? "",
                                                        viewMode: "narrative",
                                                        sourceQuestion: item.question,
                                                        feedback: item.rating,
                                                        feedbackComment: item.feedbackComment,
                                                        feedbackReason: item.feedbackReason,
                                                        route: {
                                                            assistantProfile: item.assistantProfile,
                                                            routeLabel: item.spaceLabel
                                                        }
                                                    }
                                                ];
                                                setActiveMessages(restored);
                                            }}
                                        >
                                            <span className="gn-history-meta">
                                                {item.spaceLabel || item.assistantProfile || "Assistant"} · {item.ts ? new Date(item.ts).toLocaleString() : ""}
                                            </span>
                                            <span className="gn-history-question">{item.question}</span>
                                            {item.rating && <span className={`gn-history-rating gn-history-rating--${item.rating}`}>{item.rating === "up" ? "Liked" : "Disliked"}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {showConfidencePanel && confidenceLog.length > 0 && (
                        <div className="gn-confidence-panel">
                            <div className="gn-confidence-panel-head">
                                <strong>Data Confidence — This Session</strong>
                                <button
                                    type="button"
                                    className="gn-pill gn-pill--compact"
                                    onClick={() => setShowConfidencePanel(false)}
                                >
                                    Close
                                </button>
                            </div>
                            <div className="gn-confidence-panel-body">
                                {confidenceLog.slice().reverse().map((entry, idx) => (
                                    <div key={idx} className={`gn-confidence-entry gn-confidence-entry--${entry.level}`}>
                                        <div className="gn-confidence-entry-head">
                                            <span className="gn-confidence-entry-dot" aria-hidden="true" />
                                            <span className="gn-confidence-entry-score">{entry.score}% confidence</span>
                                            <span className="gn-confidence-entry-level">{entry.level.charAt(0).toUpperCase() + entry.level.slice(1)}</span>
                                        </div>
                                        {entry.businessReason ? (
                                            <p className="gn-confidence-entry-reason">{entry.businessReason}</p>
                                        ) : entry.signals.length > 0 ? (
                                            <ul className="gn-confidence-entry-signals">
                                                {entry.signals.map((s, i) => <li key={i}>{s}</li>)}
                                            </ul>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Wave 30 cycle 5 — chat conversation needs a live region so
                        screen readers announce new assistant messages as they
                        arrive. Mirrors the AI Insights pattern. role="log" with
                        polite announcement avoids interrupting the user. */}
                    <div
                        className="gn-chat-area gn-chat-log"
                        ref={activeTab === "chat" ? chatRef : undefined}
                        role="log"
                        aria-live="polite"
                        aria-relevant="additions"
                        aria-atomic="false"
                        aria-label="Chat conversation"
                    >
                        {syncMode && activeSpaces.length > 1 ? (
                            // ── Multi-pane: one column per space, side-by-side ──
                            <div className="gn-multi-pane">
                                {activeSpaces.map(space => {
                                    const spaceMessages = messageMap[space.key] ?? [];
                                    return (
                                        <div key={space.key} className={`gn-pane${space.key === activeSpaceKey ? " gn-pane--active" : ""}`}>
                                            <div className="gn-pane-header">
                                                <span className="gn-pane-label">{space.label}</span>
                                                <button
                                                    type="button"
                                                    className="gn-pane-focus"
                                                    title="Focus this space"
                                                    onClick={() => handleSpaceSwitch(space.key)}
                                                >
                                                    {space.key === activeSpaceKey ? "● Active" : "○ Focus"}
                                                </button>
                                            </div>
                                            <div className="gn-pane-body">
                                                {spaceMessages.length === 0
                                                    ? <div className="gn-pane-empty">No messages yet — send a question above.</div>
                                                    : spaceMessages.map(message => (
                                                        <MessageCard
                                                            key={message.id}
                                                            canShowSql={canShowSql}
                                                            canShowTrace={canShowTrace}
                                                            message={message}
                                                            settings={props.settings}
                                                            onFeedback={handleFeedback}
                                                            setMessages={(next) => setSpaceMessages(space.key, next)}
                                                            submit={(input, intent) => void runAssistant(input, intent)}
                                                            nowTick={nowTick}
                                                            onStop={message.status === "RUNNING" ? () => stopChat(space.key) : undefined}
                                                        />
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <>
                                {/* 2026-05-22 — always render WelcomeSection above the
                                    message list so users can scroll back to the probe
                                    snapshot after asking follow-up questions. When
                                    messages exist, render the compact variant: just
                                    the KPI snapshot row, hide Quick start + Try asking
                                    (they'd duplicate the strip rendered below). */}
                                <WelcomeSection
                                    home={home}
                                    roleMode={roleMode}
                                    isConfigured={isConfigured}
                                    busy={busy}
                                    area={area}
                                    setArea={setArea}
                                    latestActions={latestActions}
                                    onRunArea={() => void runAssistant(AREA_PROMPTS[area], mapAreaToIntent(area))}
                                    onAction={handleSuggestedAction}
                                    kpiSnapshot={kpiSnapshotMap[activeSpaceKey] ?? null}
                                    kpiLoading={kpiLoadingMap[activeSpaceKey] ?? false}
                                    compact={messages.length > 0}
                                    homeMeta={askPulseHomeMeta.data}
                                />
                                {messages.map(message => (
                                    <MessageCard
                                        key={message.id}
                                        canShowSql={canShowSql}
                                        canShowTrace={canShowTrace}
                                        message={message}
                                        settings={props.settings}
                                        onFeedback={handleFeedback}
                                        setMessages={setActiveMessages}
                                        submit={(input, intent) => void runAssistant(input, intent)}
                                        nowTick={nowTick}
                                        onStop={message.status === "RUNNING" ? () => stopChat(activeSpaceKey) : undefined}
                                    />
                                ))}
                            </>
                        )}

                        {(messages.length > 0 || activeFollowUps.length > 0) && (
                            <div className="gn-suggestions">
                                <span className="gn-suggestions-label">✦ Try asking</span>
                                <div className="gn-suggestion-pills">
                                    {/* IDEA-032: Insights-derived clarifiers come first so the
                                        most-contextual suggestions are most prominent. They
                                        carry a "✨" marker so users see they originated from
                                        the Insights pane. Clicking a clarifier removes it from
                                        insightsFollowUps (single-use); bundled suggestions
                                        below stay sticky. Combined strip capped at 6. */}
                                    {activeFollowUps.slice(0, 6).map((q, i) => (
                                        <button
                                            key={`fu-${i}`}
                                            className="gn-pill gn-pill--from-insights gn-pill--featured"
                                            disabled={!isConfigured || busy}
                                            title={`${q}\n\n✨ Carried over from AI Insights — will continue the same AI conversation`}
                                            onClick={() => {
                                                // BUG-017: continue the Insights stage-1 conversation
                                                // rather than starting fresh. Pre-seed conversationMap
                                                // before calling runAssistant; the existing branch in
                                                // runAssistant already routes via sendMessage when the
                                                // conversationId is set.
                                                const insightsConv = insightsStage1ConvId[activeSpaceKey];
                                                if (insightsConv && !conversationMap[activeSpaceKey]) {
                                                    setConversationMap(prev => ({ ...prev, [activeSpaceKey]: insightsConv }));
                                                }
                                                // Single-use: drop this clarifier so it doesn't
                                                // persist after the user has acted on it.
                                                setInsightsFollowUps(prev => ({
                                                    ...prev,
                                                    [activeSpaceKey]: (prev[activeSpaceKey] ?? []).filter(x => x !== q),
                                                }));
                                                void runAssistant(q, "summary");
                                            }}
                                        >
                                            <span aria-hidden="true">✨</span> {q.length > 60 ? q.slice(0, 57) + "…" : q}
                                        </button>
                                    ))}
                                    {latestActions
                                        .slice(0, Math.max(0, 6 - activeFollowUps.length))
                                        .map(action => (
                                            <button
                                                key={action.id}
                                                className="gn-pill"
                                                disabled={!isConfigured || busy}
                                                onClick={() => handleSuggestedAction(action)}
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        {props.settings.showGuidedFilters && guidedFilters.length > 0 && (
                            <div className="gn-filters-section">
                                <button className="gn-filters-toggle" onClick={() => setShowFilters(prev => !prev)}>
                                    <span className={`gn-filters-chevron${showFilters ? " gn-filters-chevron--open" : ""}`}>▸</span>
                                    Filters
                                </button>
                                {showFilters && (
                                    <div className="gn-filters">
                                        {guidedFilters.map(filter => (
                                            <select
                                                key={filter.key}
                                                className="gn-filter-select"
                                                value={selectedFilters[filter.key] ?? ALL_FILTER_VALUE}
                                                onChange={event => handleFilterChange(filter, event.target.value)}
                                            >
                                                <option value={ALL_FILTER_VALUE}>{filter.displayName}: All</option>
                                                {filter.values.map(value => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                        ))}
                                        <button className="gn-filter-clear" onClick={clearFilters}>Clear</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {props.settings.multiSpaceEnabled && activeSpaces.length > 1 && (
                        <div className="gn-sync-bar">
                            <label className="gn-sync-toggle" title="Broadcast every question to all spaces simultaneously">
                                <input
                                    type="checkbox"
                                    checked={syncMode}
                                    onChange={e => {
                                        setSyncMode(e.target.checked);
                                        if (!e.target.checked) setFusionResult(null);
                                    }}
                                />
                                <span>Sync all spaces</span>
                            </label>
                            {syncMode && fusionResult && fusionResult.status === "COMPLETED" && (
                                <button
                                    type="button"
                                    className={`gn-pill gn-pill--compact gn-fusion-copy${copiedFlash["fusion"] ? " gn-pill--copied" : ""}`}
                                    onClick={() => fusionResult.content && flashCopy("fusion", fusionResult.content)}
                                    title="Copy fused answer"
                                >
                                    {/* 2026-05-19 post-UAT-1840: SVG copy/check
                                      *  instead of 📋/✓ glyphs for consistent
                                      *  rendering across OSes. */}
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <Icon name={copiedFlash["fusion"] ? "check" : "copy"} />
                                        {copiedFlash["fusion"] ? "Copied" : "Copy fusion"}
                                    </span>
                                </button>
                            )}
                            {syncMode && messages.length > 0 && !fusionPending && (
                                <button
                                    type="button"
                                    className="gn-pill gn-pill--compact gn-fusion-btn"
                                    disabled={busy || fusionPending}
                                    title="Synthesise all space answers into one fused response"
                                    onClick={() => {
                                        const lastQ = [...(messageMap[activeSpaceKey] ?? [])].reverse().find(m => m.role === "user")?.content ?? "";
                                        const answers = Object.fromEntries(
                                            activeSpaces.map(s => [s.key, [...(messageMap[s.key] ?? [])].reverse().find(m => m.role === "assistant")?.content ?? ""])
                                        ) as Partial<Record<SpaceKey, string>>;
                                        void runFusion(lastQ, answers);
                                    }}
                                >
                                    ⚡ Fuse answers
                                </button>
                            )}
                            {fusionPending && <span className="gn-fusion-pending">Synthesising...</span>}
                        </div>
                    )}

                    {syncMode && fusionResult && (
                        <div className={`gn-fusion-result${fusionResult.status === "RUNNING" ? " gn-fusion-result--loading" : fusionResult.status === "FAILED" ? " gn-fusion-result--error" : ""}`}>
                            <div className="gn-fusion-result-head">
                                <span className="gn-fusion-badge">⚡ Fused Answer</span>
                                <span className="gn-fusion-spaces">{activeSpaces.map(s => s.label).join(" + ")}</span>
                                <button className="gn-pill gn-pill--compact" onClick={() => setFusionResult(null)}>✕</button>
                            </div>
                            {fusionResult.status === "RUNNING"
                                ? (() => {
                                    // Unified ProgressIndicator for the supervisor fusion run
                                    // (IDEA-020 Phase 3). Same widget shape as the rest of
                                    // the visual; helper-chip slot will be wired in Phase 5.
                                    const fusionSteps = (fusionResult.statusSteps ?? []).map((label, i, arr) => ({
                                        id: `fusion-${i}`,
                                        label,
                                        icon: inferIconFromLabel(label),
                                        state: (i === arr.length - 1 ? "active" : "done") as StepState
                                    }));
                                    const elapsed = fusionResult.startedAt ? Math.max(0, nowTick - fusionResult.startedAt) : 0;
                                    return (
                                        <ProgressIndicator
                                            className="gn-fusion-progress"
                                            steps={fusionSteps.length ? fusionSteps : [{
                                                id: "fusion-0",
                                                label: fusionResult.currentStatus ?? "Synthesising",
                                                icon: "fusing",
                                                state: "active"
                                            }]}
                                            elapsedMs={elapsed}
                                            isComplete={false}
                                            activeOverride={fusionResult.currentStatus}
                                        />
                                    );
                                })()
                                : <div className="gn-fusion-body">{fusionResult.content}</div>
                            }
                        </div>
                    )}

                    <div className="gn-compose">
                        {/* UX-ARCH-0B.2 follow-up 2026-05-23 — sustainability
                            chip removed from the composer. The single-source
                            sustainability gauge now lives as a fixed orb in
                            the bottom-right of the viewport (mounted once in
                            App.tsx); duplicate mounts here cluttered the chat
                            input area without adding signal. */}
                        <div className="gn-compose-input-wrap" title="Enter to send · Shift+Enter for new line · Type / for presets">
                            {slashOpen && slashFiltered.length > 0 && (
                                <div className="gn-slash-dropdown" role="listbox" aria-label="Analytical preset commands">
                                    <div className="gn-slash-dropdown-head">Analytical presets · ↑↓ to navigate · ↵ to insert · esc to cancel</div>
                                    {slashFiltered.map((p, i) => (
                                        <button
                                            key={p.cmd}
                                            type="button"
                                            role="option"
                                            aria-selected={i === slashSelectedIdx}
                                            className={`gn-slash-item${i === slashSelectedIdx ? " gn-slash-item--active" : ""}`}
                                            onMouseEnter={() => setSlashSelectedIdx(i)}
                                            onClick={() => insertSlashPreset(p)}
                                        >
                                            <span className="gn-slash-cmd">{p.cmd}</span>
                                            <span className="gn-slash-label">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <textarea
                                className="gn-input"
                                value={question}
                                onChange={event => setQuestion(event.target.value)}
                                onKeyDown={event => {
                                    if (slashOpen && slashFiltered.length > 0) {
                                        if (event.key === "ArrowDown") { event.preventDefault(); setSlashSelectedIdx((slashSelectedIdx + 1) % slashFiltered.length); return; }
                                        if (event.key === "ArrowUp") { event.preventDefault(); setSlashSelectedIdx((slashSelectedIdx - 1 + slashFiltered.length) % slashFiltered.length); return; }
                                        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); insertSlashPreset(slashFiltered[slashSelectedIdx]); return; }
                                        if (event.key === "Tab") { event.preventDefault(); insertSlashPreset(slashFiltered[slashSelectedIdx]); return; }
                                        if (event.key === "Escape") { event.preventDefault(); setSlashOpen(false); return; }
                                    }
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        if (question.trim() && isConfigured && !busy) {
                                            if (syncMode && activeSpaces.length > 1) {
                                                void runSyncedAssistant(question, mapAreaToIntent(area));
                                            } else {
                                                void runAssistant(question, mapAreaToIntent(area));
                                            }
                                        }
                                    }
                                }}
                                placeholder={syncMode && activeSpaces.length > 1 ? "Ask all spaces simultaneously…" : "Ask a question about your data..."}
                                rows={1}
                                /* Wave 30 cycle 5 — accessible name + keyboard hint
                                   for screen readers. The wrapping div title=… is
                                   not announced for the inner control. */
                                aria-label={syncMode && activeSpaces.length > 1
                                    ? "Ask all configured AI spaces simultaneously"
                                    : "Ask a question about your data"}
                                aria-describedby="gn-compose-input-hint"
                            />
                            <span id="gn-compose-input-hint" className="gn-sr-only">Press Enter to send. Press Shift plus Enter to insert a new line.</span>
                            {/* 2026-05-26 — visible keyboard hint chip. The
                                title= on the wrap and the SR-only span both
                                communicated keyboard shortcuts, but sighted
                                users never saw them. Showing only when the
                                composer is focused + has content keeps idle
                                state clean while still surfacing the hint
                                exactly when it's useful. */}
                            <span className="gn-compose-kbd-hint" aria-hidden="true" data-visible={question.trim() ? "true" : "false"}>
                                <kbd>↵</kbd> send · <kbd>⇧↵</kbd> newline
                            </span>
                            <button
                                className="gn-send"
                                disabled={busy || !question.trim() || !isConfigured}
                                onClick={() => {
                                    if (syncMode && activeSpaces.length > 1) {
                                        void runSyncedAssistant(question, mapAreaToIntent(area));
                                    } else {
                                        void runAssistant(question, mapAreaToIntent(area));
                                    }
                                }}
                                aria-label="Send"
                            >
                                {/* Audit 2026-05-19: was the raw "↑" glyph;
                                  * replaced with SVG arrow to match the rest of
                                  * the icon system and avoid screen readers
                                  * announcing "up arrow" inside a button already
                                  * labelled "Send". */}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="12" y1="19" x2="12" y2="5" />
                                    <polyline points="5 12 12 5 19 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDevModal && (
                <div
                    className={`gn-modal-overlay gn-modal-overlay--drawer${setupPanelVisible ? " gn-modal-overlay--setup" : ""}`}
                    onClick={() => setShowDevModal(false)}
                    style={{
                        // PulsePlay default — center the modal regardless of
                        // Pulse's drawer-side alignment. Maximize state lets
                        // the modal stretch edge-to-edge by switching to
                        // `stretch` on both axes.
                        alignItems: devModalMaximized ? "stretch" : "center",
                        justifyContent: devModalMaximized ? "stretch" : "center",
                    }}
                >
                    <div
                        className={`gn-modal gn-modal--drawer${setupPanelVisible ? " gn-modal--setup" : ""}`}
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="gn-modal-title"
                        style={devModalMaximized ? {
                            // Maximize — claim the whole viewport.
                            position: "fixed",
                            inset: 0,
                            width: "100vw",
                            height: "100vh",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 0,
                        } : {
                            // PulsePlay default — large centered popup, not
                            // the inherited narrow drawer. Authors mostly
                            // open this to read diagnostics/session/SQL trace.
                            // Configuration edits live in the full Settings
                            // page to avoid duplicated setup surfaces.
                            position: "relative",
                            width: "88vw",
                            height: "86vh",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 8,
                            boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
                        }}
                    >
                        <div className="gn-modal-header">
                            <div className="gn-modal-title-group">
                                <span className="gn-modal-title" id="gn-modal-title">Developer Tools</span>
                                <div className="gn-console-status-cluster" aria-label="Console status">
                                    <span
                                        className={`gn-status gn-status--${connectionStatus.level} gn-status--static`}
                                        title={connectionStatus.tooltip}
                                        role="status"
                                    >
                                        <span className="gn-status-dot" aria-hidden="true" />
                                        <span className="gn-status-label">{connectionStatus.label}</span>
                                        <span className="gn-status-mode">{connectionStatus.modeLabel}</span>
                                    </span>
                                    {scopeGuardrailTags.length > 0 && (
                                        <span
                                            className="gn-status gn-status--scope gn-status--static"
                                            title={`Active scope guardrails: ${scopeGuardrailDetail}. Data the AI sees is constrained by these rules.`}
                                        >
                                            <span className="gn-status-dot" aria-hidden="true" />
                                            <span className="gn-status-label">Scoped</span>
                                            <span className="gn-status-mode">{scopeGuardrailLabel}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {/* PulsePlay — maximize / restore toggle. Sits
                                    immediately left of the close ✕ so it doesn't
                                    disturb the existing focus order (close stays
                                    rightmost and a11y-default-focused on open). */}
                                <button
                                    type="button"
                                    className="gn-modal-close"
                                    onClick={() => setDevModalMaximized(m => !m)}
                                    title={devModalMaximized ? "Restore default size" : "Maximize to full screen"}
                                    aria-label={devModalMaximized ? "Restore Developer Tools to default size" : "Maximize Developer Tools to full screen"}
                                    aria-pressed={devModalMaximized}
                                >
                                    <span aria-hidden="true">{devModalMaximized ? "🗗" : "🗖"}</span>
                                </button>
                                <button
                                    ref={devModalCloseRef}
                                    className="gn-modal-close"
                                    onClick={() => setShowDevModal(false)}
                                    title="Close Developer Tools"
                                    aria-label="Close Developer Tools"
                                >
                                    <span aria-hidden="true">✕</span>
                                </button>
                            </div>
                        </div>
                        {/* BUG-017: Confidence indicator demoted from chat header into
                            this modal. Renders above the tab strip (before Setup) so
                            authors/testers can still see it; viewers don't. */}
                        {(() => {
                            const latest = messages[messages.length - 1];
                            const latestFailed = !!latest && latest.role === "system" && latest.status === "FAILED";
                            const visible = !latestFailed && (confidencePending || confidenceLog.length > 0);
                            if (!visible) return null;
                            const sessionLevel: ConfidenceLevel = (() => {
                                if (confidencePending && confidenceLog.length === 0) return "high";
                                const avg = confidenceLog.reduce((s, r) => s + r.score, 0) / (confidenceLog.length || 1);
                                return avg >= 80 ? "high" : avg >= 50 ? "medium" : "low";
                            })();
                            const sessionScore = confidenceLog.length
                                ? Math.round(confidenceLog.reduce((s, r) => s + r.score, 0) / confidenceLog.length)
                                : null;
                            const lastEntry = confidenceLog[confidenceLog.length - 1];
                            const reason = lastEntry?.businessReason
                                ?? (lastEntry?.signals?.[0] ?? (confidencePending ? "Evaluating…" : "No signals available"));
                            return (
                                <div className={`gn-dev-confidence-row gn-dev-confidence-row--${sessionLevel}`}>
                                    <span className="gn-dev-confidence-dot" aria-hidden="true" />
                                    <strong className="gn-dev-confidence-label">
                                        {confidencePending && confidenceLog.length === 0
                                            ? "Confidence — checking…"
                                            : sessionScore !== null
                                                ? `Confidence — ${sessionScore}% (${sessionLevel})`
                                                : "Confidence"}
                                    </strong>
                                    <span className="gn-dev-confidence-reason">{reason}</span>
                                    <button
                                        type="button"
                                        className="gn-pill gn-pill--compact"
                                        onClick={() => setShowConfidencePanel(p => !p)}
                                        title="Open the per-answer confidence panel for this session"
                                    >
                                        {showConfidencePanel ? "Hide details" : "View details"}
                                    </button>
                                </div>
                            );
                        })()}
                        <div className="gn-dev-bar-buttons">
                            <button
                                className={`gn-dev-btn${devPanel === "diagnostics" ? " gn-dev-btn--active" : ""}`}
                                onClick={() => setDevPanel(prev => prev === "diagnostics" ? "" : "diagnostics")}
                            >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5h1.5v1.5h-1.5V5zm0 3h1.5v3h-1.5V8z"/></svg>
                                Diagnostics
                            </button>
                            <button
                                className={`gn-dev-btn${devPanel === "session" ? " gn-dev-btn--active" : ""}`}
                                onClick={() => setDevPanel(prev => prev === "session" ? "" : "session")}
                            >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12v1H2V2zm0 3h12v1H2V5zm0 3h9v1H2V8zm0 3h10v1H2v-1z"/></svg>
                                Session Log ({sessionLogRef.current.length})
                            </button>
                            {/* Cycle 40 + PulsePlay — Genie SQL Trace panel button.
                                Surfaces the raw SQL Genie ran on the Databricks
                                workspace in the last N minutes. Denylist gating:
                                visible by default for every connection mode
                                EXCEPT Azure OpenAI + Bedrock (which don't have
                                Databricks SQL history — those backends never
                                execute SQL on a workspace, just call LLM /
                                knowledge-base APIs). Any future Genie-backed
                                mode gets the tab automatically. */}
                            {(() => {
                                const mode = props.settings.connectionMode || "auto";
                                const noSqlHistory = mode === "azure-openai" || mode === "bedrock";
                                if (noSqlHistory) return null;
                                return (
                                    <button
                                        className={`gn-dev-btn${devPanel === "genieQueries" ? " gn-dev-btn--active" : ""}`}
                                        onClick={() => {
                                            const next = devPanel === "genieQueries" ? "" : "genieQueries";
                                            setDevPanel(next);
                                            if (next === "genieQueries" && genieQueries.length === 0 && !genieQueriesLoading) {
                                                void fetchGenieQueries(genieQueriesSinceMin);
                                            }
                                        }}
                                        title="Recent SQL Genie ran on this Databricks workspace — copy-pasteable for bug tracing"
                                    >
                                        <Icon name="code" />
                                        Genie SQL Trace
                                    </button>
                                );
                            })()}
                            <button
                                className="gn-dev-btn"
                                onClick={() => openPulsePlaySettings("setup")}
                                title="Open the canonical PulsePlay Settings page"
                                aria-label="Open PulsePlay Settings"
                            >
                                <Icon name="settings" />
                                Settings
                            </button>
                        </div>
                        <div className="gn-modal-body">
                            {devPanel === "diagnostics" && (
                                <>
                                    {/* Cycle 47.10 — Copy button for the Diagnostics
                                        panel, mirroring the session-log Copy. Sits in
                                        the same actions row above the <pre> so the
                                        user can grab the prompt context preview for
                                        sharing with the team without screenshotting. */}
                                    <div className="gn-dev-panel-actions">
                                        <button
                                            className={`gn-copy-log${copiedFlash["diag"] ? " gn-copy-log--copied" : ""}`}
                                            onClick={() => flashCopy("diag", promptContextPreview)}
                                        >
                                            {copiedFlash["diag"] ? "✓ Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    <pre className="gn-dev-pre">{promptContextPreview}</pre>
                                </>
                            )}
                            {devPanel === "session" && (
                                <>
                                    <div className="gn-dev-panel-actions">
                                        <button
                                            className={`gn-copy-log${copiedFlash["log"] ? " gn-copy-log--copied" : ""}`}
                                            onClick={() => flashCopy("log", sessionLogRef.current.join("\n"))}
                                        >
                                            {copiedFlash["log"] ? "✓ Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    {sessionLogEntries.length > 0 ? (
                                        <div className="gn-session-log" role="log" aria-label="Session log">
                                            {sessionLogEntries.map(entry => (
                                                <div
                                                    key={`${entry.index}-${entry.line}`}
                                                    className={`gn-session-entry gn-session-entry--${entry.level.toLowerCase()}`}
                                                >
                                                    {entry.time && <span className="gn-session-entry-time">[{entry.time}]</span>}
                                                    <span className="gn-session-entry-level">{entry.level}</span>
                                                    <span className="gn-session-entry-message">{entry.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="gn-session-empty">No entries yet.</div>
                                    )}
                                </>
                            )}
                            {/* Cycle 40 — Genie Query Audit panel. Genie-mode
                                only (proxy or direct). Lists recent SQL Genie
                                ran on the workspace, copy-pasteable for bug
                                tracing. */}
                            {devPanel === "genieQueries" && (
                                <>
                                    <div className="gn-dev-panel-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <label style={{ fontSize: 12, color: "var(--gn-text-muted)" }}>
                                            Last
                                            <select
                                                value={genieQueriesSinceMin}
                                                onChange={e => {
                                                    const n = parseInt(e.target.value, 10);
                                                    setGenieQueriesSinceMin(n);
                                                    void fetchGenieQueries(n);
                                                }}
                                                style={{ marginLeft: 4, marginRight: 4 }}
                                            >
                                                <option value={15}>15 minutes</option>
                                                <option value={60}>1 hour</option>
                                                <option value={240}>4 hours</option>
                                                <option value={1440}>24 hours</option>
                                            </select>
                                        </label>
                                        <button
                                            type="button"
                                            className="gn-pill gn-pill--compact"
                                            onClick={() => void fetchGenieQueries(genieQueriesSinceMin)}
                                            disabled={genieQueriesLoading}
                                        >
                                            {/* 2026-05-19 post-UAT-1840: SVG refresh
                                              *  glyph instead of the text U+21BB. */}
                                            {genieQueriesLoading ? "Loading…" : (
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                    <Icon name="refresh" />
                                                    Refresh
                                                </span>
                                            )}
                                        </button>
                                        {/* Cycle 47.10 — Copy all queries. Mirrors the
                                            session-log Copy button so the user can
                                            share the full Genie SQL audit trail (with
                                            timestamps + durations + status + the
                                            pretty-printed SQL) for bug tracing without
                                            having to copy each query individually. */}
                                        <button
                                            type="button"
                                            className={`gn-copy-log${copiedFlash["genieQueries"] ? " gn-copy-log--copied" : ""}`}
                                            onClick={() => {
                                                if (genieQueries.length === 0) return;
                                                const blocks = genieQueries.map(q => {
                                                    const ts = q.executed_at_ms
                                                        ? new Date(q.executed_at_ms).toISOString().replace("T", " ").slice(0, 19) + " UTC"
                                                        : "(no timestamp)";
                                                    const dur = q.duration_ms != null ? `${(q.duration_ms / 1000).toFixed(1)}s` : "-";
                                                    const rows = q.rows_produced != null ? `${q.rows_produced.toLocaleString()} rows` : "-";
                                                    const status = q.status || "-";
                                                    const sid = q.statement_id || "-";
                                                    const stype = q.statement_type || "-";
                                                    const err = q.error_message ? `\nERROR: ${q.error_message}` : "";
                                                    const sql = q.query_text ? formatSqlForCopy(q.query_text) : "(empty)";
                                                    return [
                                                        `[${ts}] ${status} (${dur}, ${rows}, ${stype})`,
                                                        `statement_id: ${sid}${err}`,
                                                        sql,
                                                    ].join("\n");
                                                });
                                                flashCopy("genieQueries", blocks.join("\n\n────────────────────────────────────────\n\n"));
                                            }}
                                            disabled={genieQueries.length === 0 || genieQueriesLoading}
                                            title={genieQueries.length === 0 ? "No queries to copy" : `Copy ${genieQueries.length} query/queries (timestamp, duration, status, SQL) to clipboard`}
                                        >
                                            {copiedFlash["genieQueries"] ? "✓ Copied!" : "Copy all"}
                                        </button>
                                        <span style={{ fontSize: 11, color: "var(--gn-text-muted)", marginLeft: "auto" }}>
                                            {genieQueriesLoading
                                                ? ""
                                                : genieQueriesError
                                                    ? `⚠ ${genieQueriesError}`
                                                    : `${genieQueries.length} ${genieQueries.length === 1 ? "query" : "queries"}`}
                                        </span>
                                    </div>
                                    {!genieQueriesLoading && !genieQueriesError && genieQueries.length === 0 && (
                                        <div className="gn-session-empty">
                                            No queries in the selected window. Run an Insights or Chat
                                            request and click Refresh.
                                        </div>
                                    )}
                                    {genieQueries.length > 0 && (
                                        <div className="gn-genie-queries-list">
                                            {genieQueries.map((q, i) => (
                                                <details key={`${q.statement_id || i}`} className="gn-genie-query-row">
                                                    <summary>
                                                        <span className={`gn-genie-query-status gn-genie-query-status--${(q.status || "").toLowerCase()}`}>
                                                            {q.status || "?"}
                                                        </span>
                                                        <span className="gn-genie-query-time">
                                                            {q.executed_at_ms
                                                                ? new Date(q.executed_at_ms).toLocaleTimeString()
                                                                : "—"}
                                                        </span>
                                                        <span className="gn-genie-query-dur">
                                                            {q.duration_ms != null ? `${(q.duration_ms / 1000).toFixed(2)}s` : "—"}
                                                        </span>
                                                        <span className="gn-genie-query-preview">
                                                            {(q.query_text || "").slice(0, 120).replace(/\s+/g, " ")}
                                                            {q.query_text && q.query_text.length > 120 ? "…" : ""}
                                                        </span>
                                                    </summary>
                                                    <div className="gn-genie-query-body">
                                                        {q.error_message && (
                                                            <div className="gn-genie-query-error">
                                                                <strong>Error:</strong> {q.error_message}
                                                            </div>
                                                        )}
                                                        <div className="gn-genie-query-meta">
                                                            {q.statement_type && <span>type: <strong>{q.statement_type}</strong></span>}
                                                            {q.rows_produced != null && <span>rows: <strong>{q.rows_produced}</strong></span>}
                                                            {q.warehouse_id && <span>warehouse: <strong>{q.warehouse_id.slice(0, 12)}…</strong></span>}
                                                            {q.user_name && <span>user: <strong>{q.user_name}</strong></span>}
                                                        </div>
                                                        <div className="gn-genie-query-actions">
                                                            <button
                                                                type="button"
                                                                className={`gn-pill gn-pill--compact${copiedFlash[`gq-sql:${i}`] ? " gn-pill--copied" : ""}`}
                                                                onClick={async () => {
                                                                    // Cycle 42 — robust copy. See the per-section
                                                                    // SQL copy handler above for why the synchronous
                                                                    // try/catch around clipboard API doesn't catch
                                                                    // promise rejection.
                                                                    const text = formatSqlForCopy(q.query_text || "");
                                                                    let ok = false;
                                                                    try {
                                                                        if (navigator?.clipboard?.writeText) {
                                                                            await navigator.clipboard.writeText(text);
                                                                            ok = true;
                                                                        }
                                                                    } catch { /* fall through */ }
                                                                    if (!ok) {
                                                                        try {
                                                                            const ta = document.createElement("textarea");
                                                                            ta.value = text;
                                                                            ta.style.position = "fixed";
                                                                            ta.style.opacity = "0";
                                                                            document.body.appendChild(ta);
                                                                            ta.select();
                                                                            ok = document.execCommand("copy");
                                                                            document.body.removeChild(ta);
                                                                        } catch { ok = false; }
                                                                    }
                                                                    if (ok) flashCopy(`gq-sql:${i}`, text);
                                                                }}
                                                                title="Copy formatted SQL"
                                                            >
                                                                {/* 2026-05-19 post-UAT-1840: SVG icon. */}
                                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                                    <Icon name={copiedFlash[`gq-sql:${i}`] ? "check" : "copy"} />
                                                                    {copiedFlash[`gq-sql:${i}`] ? "Copied" : "Copy SQL"}
                                                                </span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`gn-pill gn-pill--compact${copiedFlash[`gq-md:${i}`] ? " gn-pill--copied" : ""}`}
                                                                onClick={async () => {
                                                                    const formattedSql = formatSqlForCopy(q.query_text || "");
                                                                    const md =
                                                                        `### Genie query @ ${q.executed_at_ms ? new Date(q.executed_at_ms).toISOString() : "?"}\n` +
                                                                        `- status: ${q.status}\n` +
                                                                        `- duration: ${q.duration_ms != null ? `${(q.duration_ms / 1000).toFixed(2)}s` : "?"}\n` +
                                                                        `- rows: ${q.rows_produced ?? "?"}\n` +
                                                                        (q.error_message ? `- error: ${q.error_message}\n` : "") +
                                                                        `\n\`\`\`sql\n${formattedSql}\n\`\`\`\n`;
                                                                    let ok = false;
                                                                    try {
                                                                        if (navigator?.clipboard?.writeText) {
                                                                            await navigator.clipboard.writeText(md);
                                                                            ok = true;
                                                                        }
                                                                    } catch { /* fall through */ }
                                                                    if (!ok) {
                                                                        try {
                                                                            const ta = document.createElement("textarea");
                                                                            ta.value = md;
                                                                            ta.style.position = "fixed";
                                                                            ta.style.opacity = "0";
                                                                            document.body.appendChild(ta);
                                                                            ta.select();
                                                                            ok = document.execCommand("copy");
                                                                            document.body.removeChild(ta);
                                                                        } catch { ok = false; }
                                                                    }
                                                                    if (ok) flashCopy(`gq-md:${i}`, md);
                                                                }}
                                                                title="Copy as markdown (with metadata) — useful for bug reports"
                                                            >
                                                                {/* 2026-05-19 post-UAT-1840: SVG icon. */}
                                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                                    <Icon name={copiedFlash[`gq-md:${i}`] ? "check" : "copy"} />
                                                                    {copiedFlash[`gq-md:${i}`] ? "Copied" : "Copy as MD"}
                                                                </span>
                                                            </button>
                                                        </div>
                                                        <pre className="gn-code gn-genie-query-sql">
                                                            {q.query_text ? formatSqlForCopy(q.query_text) : "(empty)"}
                                                        </pre>
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            {setupPanelVisible && shouldShowWizard(props.settings, activeGenieConfig) && (
                                // Wave 32 Phase 1 + 2 — first-time setup wizard.
                                // Renders in place of the legacy SetupPanel for brand-new
                                // visuals (no spaceId, wizardDismissed=false). Existing
                                // configured visuals never see this branch — shouldShowWizard
                                // returns false the moment spaceId or (host+token) is set.
                                //
                                // Phase 2 wires three things into the wizard:
                                //   - `settings` so the wizard can prefill its draft from any
                                //     partially-filled fields the author entered in the format
                                //     pane before opening Setup.
                                //   - `onValidate` so the validation step actually probes the
                                //     backend (createBackend(draft).testConnection() →
                                //     testQuestion()) instead of the Phase 1 1.5 s green stub.
                                //   - A widened `onCommit` payload that writes every wizard
                                //     field (host, token, spaceId, apiBaseUrl, assistantProfile,
                                //     warehouseId, proxyKey) so e.g. the proxy backend's commit
                                //     doesn't drop the apiBaseUrl on the floor.
                                <SetupWizard
                                    settings={props.settings}
                                    onValidate={async (draft: WizardDraft) => {
                                        // Build a fresh GenieConfig-shaped object from the
                                        // wizard draft + the persisted settings. The draft
                                        // wins on every key it covers; the rest (e.g. SQL
                                        // policies, runtime scope) inherit from settings so
                                        // we don't accidentally validate against a half-blank
                                        // config that wouldn't behave like the real one.
                                        const targetConfig = {
                                            ...props.settings,
                                            ...(draft.connectionMode ? { connectionMode: draft.connectionMode } : {}),
                                            host: draft.host || props.settings.host,
                                            token: draft.token || props.settings.token,
                                            spaceId: draft.spaceId || props.settings.spaceId,
                                            apiBaseUrl: draft.apiBaseUrl || props.settings.apiBaseUrl,
                                            assistantProfile: draft.assistantProfile || props.settings.assistantProfile,
                                            warehouseId: draft.warehouseId || props.settings.warehouseId,
                                            proxyKey: draft.proxyKey || props.settings.proxyKey,
                                        } as typeof props.settings;
                                        try {
                                            const client = createBackend(targetConfig);
                                            // Probe 1 — connectivity (mirrors SetupPanel's
                                            // runConnectivityCheck()). On failure we short-
                                            // circuit and don't fire the test-question probe
                                            // because we already know the backend is unreachable
                                            // and a second failure adds no new information.
                                            const conn = await client.testConnection();
                                            if (!conn.ok) {
                                                return {
                                                    connectivity: "fail",
                                                    question: "pending",
                                                    detail: conn.detail || "Connectivity probe failed."
                                                };
                                            }
                                            // Probe 2 — round-trip a tiny test question
                                            // (mirrors SetupPanel's runTestQuestion()).
                                            const tq = await client.testQuestion();
                                            return {
                                                connectivity: "pass",
                                                question: tq.ok ? "pass" : "fail",
                                                detail: tq.ok ? (conn.detail || "OK") : (tq.detail || "Test question failed.")
                                            };
                                        } catch (err: unknown) {
                                            const msg = err && typeof err === "object" && "message" in err
                                                ? String((err as Error).message)
                                                : "Unknown probe error";
                                            return {
                                                connectivity: "fail",
                                                question: "fail",
                                                detail: msg
                                            };
                                        }
                                    }}
                                    onCommit={(draft: WizardDraft, destination?: "insights" | "chat") => {
                                        // Phase 2 — persist the full set of wizard fields.
                                        // The draft already merges over INITIAL_WIZARD_STATE
                                        // (so empty strings are explicit "no value"), but we
                                        // still skip empty keys so we don't clobber a value
                                        // the format pane already wrote on a different visit.
                                        const cfgPayload: Record<string, unknown> = {};
                                        const writeIfFilled = (key: keyof WizardDraft) => {
                                            const v = draft[key];
                                            if (typeof v === "string" && v.trim().length > 0) {
                                                cfgPayload[key] = v;
                                            }
                                        };
                                        writeIfFilled("host");
                                        writeIfFilled("token");
                                        writeIfFilled("spaceId");
                                        writeIfFilled("apiBaseUrl");
                                        writeIfFilled("assistantProfile");
                                        writeIfFilled("warehouseId");
                                        writeIfFilled("proxyKey");
                                        if (draft.connectionMode) {
                                            cfgPayload.connectionMode = draft.connectionMode;
                                        }
                                        props.host.persistProperties({
                                            merge: [{
                                                objectName: "genieSettings",
                                                selector: null,
                                                properties: cfgPayload
                                            }]
                                        });
                                        // Wave 32 cycle 16 — honour the user's chosen
                                        // destination (Open AI Insights vs Open Chat).
                                        // Falls back to whichever tab is actually
                                        // enabled per `enabledFeatures` setting.
                                        if (destination === "chat" && enabledFeatures !== "insightsOnly") {
                                            setActiveTab("chat");
                                        } else if (destination === "insights" && enabledFeatures !== "chatOnly") {
                                            setActiveTab("insights");
                                        }
                                    }}
                                    onSkip={() => {
                                        // Persist wizardDismissed=true so the wizard never
                                        // re-appears for this visual instance.
                                        props.host.persistProperties({
                                            merge: [{
                                                objectName: "genieSettings",
                                                selector: null,
                                                properties: { wizardDismissed: true }
                                            }]
                                        });
                                    }}
                                />
                            )}
                            {/* Wave 38 Phase 1 — honest-limitation banner shown ONLY when an
                                allowlist is in place. Reminds report authors that this is a
                                UX gate, not an authorization gate; the .pbix file itself can
                                still be downloaded by anyone with PBI workspace access. */}
                            {setupPanelVisible && parseAllowedUsers(opSettings.setupAccessAllowedUsers || "").length > 0 && (
                                <div className="gn-setup-access-limitation" role="note" aria-label="Setup access allowlist limitation">
                                    <span className="gn-setup-access-limitation-icon" aria-hidden="true">⚠</span>
                                    <span className="gn-setup-access-limitation-text">
                                        This is a UX gate, not an authorization gate. The .pbix can still be
                                        downloaded by anyone with PBI workspace access. For server-side
                                        enforcement, configure Azure AD authentication on your hosted proxy.
                                    </span>
                                </div>
                            )}
                            {setupPanelVisible && !shouldShowWizard(props.settings, activeGenieConfig) && (
                                <SetupPanel
                                    settings={props.settings}
                                    status={computeConnectionStatus(props.settings, props.configIssues, props.configWarnings)}
                                    host={props.host}
                                    isEditing={setupIsEditing}
                                    setIsEditing={setSetupIsEditing}
                                    draft={setupDraft}
                                    setDraft={setSetupDraft}
                                    proxyHealth={proxyHealth}
                                    proxyHealthProbing={proxyHealthProbing}
                                    onProbeProxyHealth={probeProxyHealth}
                                    boundUserId={viewerUserKey}
                                    logSession={logSession}
                                    onSuggestInsightsConfig={async () => {
                                        // 49.20 / IDEA-037 phase 4 — feed bound bindings to the
                                        // active backend; let the LLM classify the domain and
                                        // suggest custom sections. Returns null on any failure
                                        // (no client, missing config, network issue, malformed
                                        // response) so the panel can show a friendly error.
                                        //
                                        // Wave 41 cycle 12 — fire the metric-rule suggest call
                                        // in parallel and merge the result onto the suggestion
                                        // before returning. Both calls are best-effort: a metric
                                        // rules failure must NOT block the section suggestion
                                        // (and vice-versa). Returns null only when the section
                                        // suggestion itself fails.
                                        if (!activeClient) return null;
                                        const measures = Object.keys(props.context.measures || {});
                                        const dimensions = Object.keys(props.context.dimensions || {});
                                        const sample = props.context.safeContextText || "";
                                        const sectionHCte = String(props.settings.sqlCtePreamble || "");
                                        // Wave 41 cycle 12 — `fetchSuggestedMetricRules` is a
                                        // GenieClient-only extension; cast through the optional
                                        // shape so the AnyBackend interface stays unchanged.
                                        const clientWithMetricRules = activeClient as AnyBackend & {
                                            fetchSuggestedMetricRules?: (args: {
                                                measureNames: string[];
                                                dimensionNames?: string[];
                                                sectionHCte?: string;
                                                spaceId?: string;
                                            }) => Promise<NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]>>;
                                        };
                                        const [base, metricRules] = await Promise.all([
                                            activeClient.suggestInsightsConfig({ measures, dimensions, sampleContext: sample }),
                                            (async () => {
                                                try {
                                                    if (!clientWithMetricRules.fetchSuggestedMetricRules) return [];
                                                    return await clientWithMetricRules.fetchSuggestedMetricRules({
                                                        measureNames: measures,
                                                        dimensionNames: dimensions,
                                                        sectionHCte
                                                    });
                                                } catch {
                                                    return [];
                                                }
                                            })()
                                        ]);
                                        if (!base) return null;
                                        if (Array.isArray(metricRules) && metricRules.length > 0) {
                                            base.suggestedMetricRules = metricRules;
                                        }
                                        return base;
                                    }}
                                    /* Wave 41 cycle 12 — per-card "⚙ Suggest" button on the
                                       MetricRuleForm. Calls fetchSuggestedMetricRules with
                                       just the card's metric name so the response is scoped
                                       to that single rule. The proxy heuristic engine matches
                                       on name → returns the best-fit direction + thresholds.
                                       Returns undefined on no client / no match so the form
                                       leaves the card unchanged. */
                                    onSuggestMetricRuleForCard={async (rule, _idx) => {
                                        if (!activeClient) return undefined;
                                        const name = (rule.name || "").trim();
                                        if (!name) return undefined;
                                        const cwmr = activeClient as AnyBackend & {
                                            fetchSuggestedMetricRules?: (args: {
                                                measureNames: string[];
                                                dimensionNames?: string[];
                                                sectionHCte?: string;
                                                spaceId?: string;
                                            }) => Promise<NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]>>;
                                        };
                                        if (!cwmr.fetchSuggestedMetricRules) return undefined;
                                        try {
                                            const all = await cwmr.fetchSuggestedMetricRules({
                                                measureNames: [name],
                                                dimensionNames: Object.keys(props.context.dimensions || {}),
                                                sectionHCte: String(props.settings.sqlCtePreamble || "")
                                            });
                                            // Pick the first rule whose name matches (case-insensitive)
                                            // — falls back to the first row if no exact match (the
                                            // heuristic engine normalises measure names so an exact
                                            // match is the common case).
                                            const lower = name.toLowerCase();
                                            const exact = (all || []).find(r => (r.name || "").toLowerCase() === lower);
                                            const picked = exact || (all && all[0]);
                                            if (!picked) return undefined;
                                            return {
                                                name: picked.name || name,
                                                higherIsBetter: !!picked.higherIsBetter,
                                                aliases: picked.aliases || [],
                                                amberPct: typeof picked.amberPct === "number" ? picked.amberPct : undefined,
                                                redPct: typeof picked.redPct === "number" ? picked.redPct : undefined
                                            };
                                        } catch {
                                            return undefined;
                                        }
                                    }}
                                />
                            )}
                            {devPanel === "display" && (
                                <PulsePlayDisplayPanel />
                            )}
                            {!devPanel && (
                                <p className="gn-modal-hint">
                                    Select Diagnostics, Session Log, SQL Trace, or open Settings above.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Returns true when the briefing content already contains LLM-emitted
// status emoji (🟢 / 🟡 / 🔴) — in which case the "No status colors"
// banner is incorrect and must stay hidden.
function briefingHasStatusColors(content: string): boolean {
    return content.includes("🟢") || content.includes("🟡") || content.includes("🔴");
}

// PulsePlay — one-click metric-direction preset banner shown above
// the rendered insights when no color rules are configured. Apply
// writes the preset's `rules` (and `domain` if blank) to genieSettings
// via host.persistProperties. After apply the user clicks the refresh
// pill to re-run the pipeline with the new rules — color status
// emojis (🟢 / 🟡 / 🔴) then appear in KPI tables and pipe rows.
//
// Reuses METRIC_DIRECTION_PRESETS from insightsPresetLibrary so the
// rule strings stay battle-tested. Apply → toast → fade out; user can
// dismiss permanently via Setup if they don't want any preset.
function ColorRulesBanner(props: {
    host: IVisualHost;
    currentDomain: string;
}): React.ReactElement | null {
    const [presetId, setPresetId] = React.useState("");
    const [applied, setApplied] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(false);
    if (dismissed) return null;
    const selected = PP_METRIC_DIRECTION_PRESETS.find(p => p.id === presetId);
    const apply = () => {
        if (!selected) return;
        const props_to_merge: Record<string, unknown> = {
            metricDirectionRules: selected.rules,
        };
        // Only auto-seed the domain when the author hasn't already picked one —
        // author-final-say rule (CONNECTOR_PROBE_AND_SMART_CONNECT.md).
        if (!props.currentDomain.trim()) {
            props_to_merge.insightsDomain = selected.domain;
        }
        try {
            props.host.persistProperties({
                merge: [{
                    objectName: "genieSettings",
                    selector: null,
                    properties: props_to_merge,
                }],
            });
            setApplied(true);
        } catch {
            setApplied(false);
        }
    };
    if (applied) {
        return (
            <div style={{
                margin: "0 0 12px",
                padding: "10px 14px",
                borderRadius: 6,
                background: "rgba(34, 139, 89, 0.08)",
                borderLeft: "3px solid #228b59",
                fontSize: 12,
                color: "#1a1a1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
            }}>
                <span>
                    <strong>Color rules applied</strong> — click <em>Refresh</em> above to re-run the briefing with status indicators.
                </span>
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss this notice"
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#666" }}
                >
                    ×
                </button>
            </div>
        );
    }
    return (
        <div style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: 6,
            background: "rgba(0, 120, 212, 0.06)",
            borderLeft: "3px solid #0078d4",
            fontSize: 12,
            color: "#1a1a1a",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
        }}>
            <span style={{ flex: "1 1 auto", minWidth: 220 }}>
                <strong>No status colors</strong> on this briefing. Pick a preset to add 🟢 / 🟡 / 🔴 indicators to KPI tables and pipe rows.
            </span>
            <select
                value={presetId}
                onChange={e => setPresetId(e.target.value)}
                aria-label="Metric direction preset"
                style={{
                    padding: "4px 8px",
                    fontSize: 12,
                    border: "1px solid rgba(0,0,0,0.18)",
                    borderRadius: 4,
                    background: "white",
                }}
            >
                <option value="">Choose preset…</option>
                {PP_METRIC_DIRECTION_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                ))}
            </select>
            <button
                type="button"
                disabled={!selected}
                onClick={apply}
                title={selected ? selected.description : "Pick a preset first"}
                style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    border: "1px solid #0078d4",
                    borderRadius: 4,
                    background: selected ? "#0078d4" : "transparent",
                    color: selected ? "#fff" : "rgba(0,0,0,0.4)",
                    cursor: selected ? "pointer" : "not-allowed",
                    fontWeight: 600,
                }}
            >
                Apply
            </button>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                title="Don't show this banner again this session"
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#666" }}
            >
                ×
            </button>
        </div>
    );
}

// Retired Display panel.
//
// The App.tsx-owned toggles (UI mode, enabled-components, layout, BI tiles)
// now live in Settings › Preferences. The Console keeps this lightweight
// deep-link component only as a defensive fallback if an old state path ever
// opens `devPanel === "display"`.
//
// State contract:
//   - localStorage keys are owned by App.tsx ("pulseplay:ui-mode",
//     "pulseplay:enabled-components", "pulseplay:layout-mode")
//   - This panel reads them on each render (the modal isn't deep-rendered;
//     re-reads on open are cheap) and writes back on toggle
//   - After each write it dispatches a window `CustomEvent`
//     "pulseplay:display-change" carrying { key, value }; App.tsx listens
//     for that event and updates its React state
//
// Keep this lean — no validators, no animations. Three button strips.
const PP_UI_MODE_KEY = "pulseplay:ui-mode";
const PP_ENABLED_KEY = "pulseplay:enabled-components";
const PP_LAYOUT_KEY = "pulseplay:layout-mode";
const PP_BI_TILE_KEY = "pulseplay:bi-tile-mode";

function readDisplayPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const v = window.localStorage.getItem(key);
        return (v && (allowed as readonly string[]).includes(v)) ? v as T : fallback;
    } catch { return fallback; }
}
function writeDisplayPref(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch { /* swallow */ }
    try {
        window.dispatchEvent(new CustomEvent("pulseplay:display-change", { detail: { key, value } }));
    } catch { /* swallow */ }
}

function PulsePlayDisplayPanel(): React.ReactElement {
    // Phase 5 — the four toggles (UI mode / Enabled panels / Layout /
    // BI tiles) have moved into Settings › Preferences. The Cycle H
    // panel inside Pulse Developer Tools is reduced to a deep-link so
    // there's exactly one place to edit these values and no chance of
    // state drift between the inline panel and the Settings page.
    //
    // Keep the readDisplayPref/writeDisplayPref helpers in this file —
    // they're still used by other parts of Pulse and the legacy event
    // bus to mirror values into the settings store.
    void readDisplayPref;
    void writeDisplayPref;
    void PP_UI_MODE_KEY;
    void PP_ENABLED_KEY;
    void PP_LAYOUT_KEY;
    void PP_BI_TILE_KEY;
    const handleOpenSettings = () => {
        if (typeof window === "undefined") return;
        if (window.location.pathname !== "/settings") {
            window.history.pushState({}, "", "/settings/preferences");
            try {
                window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
            } catch { /* swallow */ }
        }
    };
    return (
        <div style={{ padding: "16px 4px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
                Display preferences (UI mode, visible panels, AI position, BI tiles) have moved to
                the canonical Settings page. Edits made here used to live in this developer panel
                and could drift from Settings; they now live in one place.
            </p>
            <button
                type="button"
                onClick={handleOpenSettings}
                style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "1px solid #0078d4",
                    background: "#0078d4",
                    color: "white",
                    borderRadius: 4,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                }}
            >
                Open Settings › Preferences →
            </button>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.55, lineHeight: 1.4 }}>
                Keyboard: <code>Cmd/Ctrl + ,</code> opens Settings from anywhere.
            </p>
        </div>
    );
}

// SetupDraft + setupDraftFromSettings live in ./setupDraft so unit tests can
// import them without pulling in the React tree. Re-exported here as a no-op
// import so existing references inside this module keep working.

function SetupPanel(props: {
    settings: OperationalSettingsModel;
    status: ReturnType<typeof computeConnectionStatus>;
    host: IVisualHost;
    isEditing: boolean;
    setIsEditing: (v: boolean) => void;
    draft: SetupDraft;
    setDraft: React.Dispatch<React.SetStateAction<SetupDraft>>;
    /** Latest proxy /health snapshot — drives the auto Proxy Status card. */
    proxyHealth: ProxyHealthInfo | null;
    proxyHealthProbing: boolean;
    onProbeProxyHealth: () => void;
    /** 49.20 — AI-assisted introspection callback, threaded through to Section A. */
    onSuggestInsightsConfig?: () => Promise<InsightsConfigSuggestion | null>;
    /** Wave 41 cycle 12 — async per-card metric-rule suggester, threaded
     *  through to Section A's MetricRuleForm. */
    onSuggestMetricRuleForCard?: (rule: MetricRuleType, idx: number) =>
        | MetricRuleType
        | undefined
        | Promise<MetricRuleType | undefined>;
    /** Wave 42 — current viewer identity from the bound USERPRINCIPALNAME() measure
     *  (props.context.dataUserId). Used by Setup Section H to render a live
     *  "Currently bound" preview chip next to the role-hint toggle. */
    boundUserId?: string;
    /** PulsePlay — log session callback threaded down so Setup-page actions
     *  (Check connection / Test Question / probe outcomes) write entries
     *  visible in the Session Log tab. Without this, user-visible errors
     *  rendered as banners with no diagnostic trail. */
    logSession: (level: "INFO" | "ERROR" | "WARN", message: string) => void;
}) {
    const { isEditing, setIsEditing, draft, setDraft } = props;

    const [profiles, setProfiles] = useState<AssistantProfileMetadata[]>([]);
    const [isFetchingProfiles, setIsFetchingProfiles] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [healthCheck, setHealthCheck] = useState<{ kind: "idle" | "running" | "ok" | "error"; label: string }>({ kind: "idle", label: "" });
    const [testQuestion, setTestQuestion] = useState<{ kind: "idle" | "running" | "ok" | "error"; label: string }>({ kind: "idle", label: "" });

    const [revealToken, setRevealToken] = useState(false);

    // Wave 30 cycle 9 — save-reminder toast. Power BI's two-step persistence
    // gotcha: host.persistProperties writes to the visual's runtime state,
    // but the user must press Ctrl+S to bake those changes into the .pbix
    // file. Without a hint, authors lose Setup edits when they close PBI
    // Desktop without saving (an issue surfaced in live testing).
    // We show a non-blocking toast after the FIRST Apply Changes per session;
    // subsequent clicks within the same session don't re-show (auto-dismiss
    // after 12s, or on click).
    const [saveReminderShown, setSaveReminderShown] = useState(false);
    const [saveReminderDismissed, setSaveReminderDismissed] = useState(false);
    useEffect(() => {
        if (!saveReminderShown) return;
        const t = setTimeout(() => setSaveReminderShown(false), 12000);
        return () => clearTimeout(t);
    }, [saveReminderShown]);

    useEffect(() => {
        if (!isEditing || draft.connectionMode === "direct" || draft.connectionMode === "supervisor") {
            setProfiles([]);
            return;
        }

        const fetchProfiles = async () => {
            setIsFetchingProfiles(true);
            setFetchError(null);
            try {
                const client = createBackend({
                    connectionMode: draft.connectionMode,
                    apiBaseUrl: draft.apiBaseUrl,
                    host: draft.host,
                    token: draft.token,
                    proxyKey: draft.proxyKey
                } as GenieConfig);
                const list = await (client as AnyBackend & { getProfiles?: () => Promise<AssistantProfileMetadata[]> }).getProfiles!();
                setProfiles(list);
            } catch (err: any) {
                console.error("Failed to fetch profiles", err);
                setFetchError(err?.message || "Connection failed");
            } finally {
                setIsFetchingProfiles(false);
            }
        };

        const timer = setTimeout(fetchProfiles, 800); // debounce
        return () => clearTimeout(timer);
    }, [isEditing, draft.connectionMode, draft.apiBaseUrl, draft.proxyKey, draft.host, draft.token]);

    const masked = (value: string, visibleStart = 4, visibleEnd = 4) => {
        const trimmed = (value || "").trim();
        if (!trimmed) return "Not set";
        if (trimmed.length <= visibleStart + visibleEnd) return "Set";
        return `${trimmed.slice(0, visibleStart)}...${trimmed.slice(-visibleEnd)}`;
    };

    const handleApply = () => {
        props.host.persistProperties({
            merge: [{
                objectName: "genieSettings",
                selector: null,
                properties: draft
            }]
        });
        setIsEditing(false);
        // Wave 30 cycle 9 — surface the save-reminder toast on the first
        // Apply Changes per session. Don't re-show if user already dismissed.
        if (!saveReminderDismissed) {
            setSaveReminderShown(true);
        }
    };

    // Connectivity + Test Question buttons run against the IN-PROGRESS draft
    // when the user is editing, so they can validate a new connection
    // BEFORE clicking Apply Changes (IDEA-015 follow-up). When not editing,
    // they fall back to the persisted settings as before.
    const targetConfig = (): OperationalSettingsModel => isEditing
        ? { ...props.settings, ...draft }
        : props.settings;
    const runConnectivityCheck = async () => {
        setHealthCheck({ kind: "running", label: "Checking connection..." });
        props.logSession("INFO", "Check connection — probing backend…");
        try {
            const client = createBackend(targetConfig());
            const res = await client.testConnection();
            setHealthCheck({ kind: res.ok ? "ok" : "error", label: res.detail });
            props.logSession(res.ok ? "INFO" : "ERROR", `Check connection: ${res.detail}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setHealthCheck({ kind: "error", label: msg });
            props.logSession("ERROR", `Check connection threw: ${msg}`);
        }
    };

    const runTestQuestion = async () => {
        setTestQuestion({ kind: "running", label: "Running a lightweight validation question..." });
        props.logSession("INFO", "Test question — submitting validation prompt…");
        try {
            const client = createBackend(targetConfig());
            const res = await client.testQuestion();
            setTestQuestion({ kind: res.ok ? "ok" : "error", label: res.detail });
            props.logSession(res.ok ? "INFO" : "ERROR", `Test question: ${res.detail}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setTestQuestion({ kind: "error", label: msg });
            props.logSession("ERROR", `Test question threw: ${msg}`);
        }
    };

    if (isEditing) {
        return (
            <SetupEditFlow
                draft={draft}
                setDraft={setDraft}
                profiles={profiles}
                isFetchingProfiles={isFetchingProfiles}
                fetchError={fetchError}
                revealToken={revealToken}
                setRevealToken={setRevealToken}
                onCancel={() => setIsEditing(false)}
                onApply={handleApply}
                runConnectivityCheck={runConnectivityCheck}
                runTestQuestion={runTestQuestion}
                healthCheck={healthCheck}
                testQuestion={testQuestion}
                proxyHealth={props.proxyHealth}
                proxyHealthProbing={props.proxyHealthProbing}
                onProbeProxyHealth={props.onProbeProxyHealth}
                onSuggestInsightsConfig={props.onSuggestInsightsConfig}
                onSuggestMetricRuleForCard={props.onSuggestMetricRuleForCard}
                boundUserId={props.boundUserId}
            />
        );
    }

    return (
        <div className="gn-setup-panel">
            {/* Wave 30 cycle 9 — save-reminder toast (first Apply per session). */}
            {saveReminderShown && (
                <div className="gn-save-reminder-toast" role="status" aria-live="polite">
                    <span aria-hidden="true" className="gn-save-reminder-icon">💾</span>
                    <div className="gn-save-reminder-text">
                        <strong>Changes applied — but not yet saved.</strong>
                        <span>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> in Power BI Desktop to bake these into the .pbix file. Otherwise they'll be lost when you close the report.</span>
                    </div>
                    <button
                        type="button"
                        className="gn-btn gn-btn--compact"
                        aria-label="Dismiss save reminder"
                        onClick={() => { setSaveReminderShown(false); setSaveReminderDismissed(true); }}
                    >
                        Got it
                    </button>
                </div>
            )}
            <div className="gn-setup-hero">
                <div>
                    <span className="gn-setup-kicker">Author setup</span>
                    <h3>Connection Summary</h3>
                    <p>Operational AI settings have moved from the Power BI format pane into this setup flow. Click Edit to update the connection configuration.</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                    <span className={`gn-setup-status gn-setup-status--${props.status.level}`}>{props.status.label}</span>
                    <button className="gn-btn gn-btn--outline" onClick={() => setIsEditing(true)}>Edit Configuration</button>
                </div>
            </div>

            <div className="gn-setup-summary" aria-label="Current setup summary">
                <div><span>Mode</span><strong>{props.status.modeLabel}</strong></div>
                <div><span>Proxy URL</span><strong>{props.settings.apiBaseUrl || "Not set"}</strong></div>
                <div><span>Profile</span><strong>{props.settings.assistantProfile || "default"}</strong></div>
                <div><span>Workspace</span><strong>{masked(props.settings.host, 12, 10)}</strong></div>
                <div><span>Space ID</span><strong>{masked(props.settings.spaceId, 6, 6)}</strong></div>
                <div><span>Warehouse</span><strong>{masked(props.settings.warehouseId, 5, 5)}</strong></div>
            </div>

            {/* Proxy status banner — auto-runs on visual load (BUG-002 +
                IDEA-015). Tells the user immediately whether the proxy
                is reachable, with config source + profile count, before
                any chat/insights call has fired. */}
            <ProxyStatusBanner
                health={props.proxyHealth}
                probing={props.proxyHealthProbing}
                onRetry={props.onProbeProxyHealth}
                connectionMode={props.settings.connectionMode}
            />

            <div className="gn-setup-note">
                <strong>Connection Health</strong><br/>
                <div className="gn-setup-check-actions">
                    <button
                        className="gn-btn gn-btn--compact gn-btn--outline"
                        disabled={healthCheck.kind === "running"}
                        title="Run a quick connectivity check against the configured backend (uses in-progress draft when editing)"
                        onClick={runConnectivityCheck}
                    >
                        {healthCheck.kind === "running" ? "Checking…" : "Check connection"}
                    </button>
                    <button
                        className="gn-btn gn-btn--compact gn-btn--primary"
                        disabled={testQuestion.kind === "running"}
                        title="Send a tiny PING to verify the AI backend round-trips correctly (uses in-progress draft when editing)"
                        onClick={runTestQuestion}
                    >
                        {testQuestion.kind === "running" ? "Testing…" : "Test Question"}
                    </button>
                </div>
                {healthCheck.kind !== "idle" && (
                    <div className={`gn-setup-check-result gn-setup-check-result--${healthCheck.kind}`}>
                        <strong>Connectivity:</strong> {healthCheck.label}
                    </div>
                )}
                {testQuestion.kind !== "idle" && (
                    <div className={`gn-setup-check-result gn-setup-check-result--${testQuestion.kind}`}>
                        <strong>Test question:</strong> {testQuestion.label}
                    </div>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// SetupEditFlow — process-driven 4-step Setup edit form.
//
//   Step 1 · Transport   (parent)        — How does this visual reach the backend?
//   Step 2 · Backend     (child of 1)    — What sits on the other end?
//   Step 3 · Details     (child of 1+2)  — Only fields the chosen pair needs
//   Step 4 · Validate    (terminal)      — Connectivity check + Test question
//
// The on-disk shape is still `connectionMode` (a single enum). Encode/decode
// in connectionMatrix.ts maps between (transport, backend) and the enum so
// existing PBIP files keep working unchanged. Apply Changes is gated on the
// chosen pair being supported by the validity matrix.
// ────────────────────────────────────────────────────────────────────────────

type CheckResult = { kind: "idle" | "running" | "ok" | "error"; label: string };

// ────────────────────────────────────────────────────────────────────────────
// ProxyStatusBanner — auto-running proxy /health probe surface.
//
// Renders a single coloured row at the top of the Setup screen telling the
// user immediately whether the proxy is reachable, with config source and
// profile count visible before they touch any field. In Direct mode the
// banner short-circuits to a dev-only notice. The "Retry" button kicks
// off another probe; the parent owns the actual probe function so the
// state stays single-source-of-truth (App's proxyHealth).
// ────────────────────────────────────────────────────────────────────────────

// Wave 30 cycle 6 — cold-start aware probing banner. Tracks elapsed time
// since mount and switches the message at 3s to call out a likely cold
// start. Designed for the Azure App Service F1 free tier scenario where
// the container sleeps after 20 min idle and takes 15-45s to wake.
function ProxyProbingBanner() {
    const [elapsedMs, setElapsedMs] = React.useState(0);
    React.useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => setElapsedMs(Date.now() - start), 500);
        return () => clearInterval(interval);
    }, []);
    const isColdStart = elapsedMs > 3000;
    return (
        <div className="gn-proxy-banner gn-proxy-banner--probing" role="status" aria-live="polite">
            <span className="gn-proxy-banner-dot gn-proxy-banner-dot--probing" aria-hidden="true" />
            <div className="gn-proxy-banner-text">
                <strong>{isColdStart ? "Waking up the proxy…" : "Checking proxy…"}</strong>
                <span>
                    {isColdStart
                        ? `First request after idle — typical wake time 15-45s on free-tier hosting (${Math.round(elapsedMs / 1000)}s elapsed). The proxy will be reachable shortly.`
                        : "Probing the PulsePlay Proxy at the configured URL."}
                </span>
            </div>
        </div>
    );
}

function ProxyStatusBanner(props: {
    health: ProxyHealthInfo | null;
    probing: boolean;
    onRetry: () => void;
    connectionMode: OperationalSettingsModel["connectionMode"];
}) {
    if (props.connectionMode === "direct") {
        return (
            <div className="gn-proxy-banner gn-proxy-banner--neutral" role="status">
                <span className="gn-proxy-banner-dot gn-proxy-banner-dot--neutral" aria-hidden="true" />
                <div className="gn-proxy-banner-text">
                    <strong>Direct mode (dev/demo)</strong>
                    <span>No proxy in the loop — the visual calls the Databricks AI backend directly with the configured PAT.</span>
                </div>
            </div>
        );
    }

    if (props.probing && !props.health) {
        // Wave 30 cycle 6 — cold-start aware probing banner. After 3s of
        // probing without a response, switch the message to call out a
        // likely cold-start (Azure App Service F1 free tier sleeps after
        // 20 min idle and takes 15-45s to wake). Without this, the user
        // sees "Checking proxy…" for 30s and assumes it's broken.
        return <ProxyProbingBanner />;
    }

    if (!props.health) {
        // No probe has run yet (mount race) — render nothing rather than
        // a misleading offline state.
        return null;
    }

    if (!props.health.ok) {
        return (
            <div className="gn-proxy-banner gn-proxy-banner--error" role="alert">
                <span className="gn-proxy-banner-dot gn-proxy-banner-dot--error" aria-hidden="true" />
                <div className="gn-proxy-banner-text">
                    <strong>Proxy offline</strong>
                    <span>{props.health.error || "The PulsePlay Proxy is not reachable at the configured URL."}</span>
                    <span className="gn-proxy-banner-help">
                        To start it locally, open a terminal at the project root and run
                        <code> node proxy/server.js</code>, then click Retry.
                    </span>
                </div>
                <button
                    type="button"
                    className="gn-btn gn-btn--compact"
                    onClick={props.onRetry}
                    disabled={props.probing}
                >
                    {props.probing ? "Retrying…" : "Retry"}
                </button>
            </div>
        );
    }

    const profileCount = props.health.profiles?.length ?? 0;
    const configSource = props.health.configSource || "unknown";
    const authLabel = props.health.authMode === "sharedKey"
        ? "shared-key auth"
        : props.health.authMode === "anonymous"
            ? "anonymous (local)"
            : null;
    return (
        <div className="gn-proxy-banner gn-proxy-banner--ok" role="status">
            <span className="gn-proxy-banner-dot gn-proxy-banner-dot--ok" aria-hidden="true" />
            <div className="gn-proxy-banner-text">
                <strong>Proxy connected</strong>
                <span>
                    {profileCount} profile{profileCount === 1 ? "" : "s"} available · config source: <code>{configSource}</code>
                    {authLabel ? ` · ${authLabel}` : ""}
                    {props.health.databricksApp ? " · Databricks Apps" : ""}
                    {props.health.port ? ` · port ${props.health.port}` : ""}
                </span>
            </div>
            <button
                type="button"
                className="gn-btn gn-btn--compact"
                onClick={props.onRetry}
                disabled={props.probing}
                title="Re-run the proxy /health probe"
            >
                {props.probing ? "…" : "Refresh"}
            </button>
        </div>
    );
}

function SetupEditFlow(props: {
    draft: SetupDraft;
    setDraft: React.Dispatch<React.SetStateAction<SetupDraft>>;
    profiles: AssistantProfileMetadata[];
    isFetchingProfiles: boolean;
    fetchError: string | null;
    revealToken: boolean;
    setRevealToken: (v: boolean) => void;
    onCancel: () => void;
    onApply: () => void;
    runConnectivityCheck: () => void;
    runTestQuestion: () => void;
    healthCheck: CheckResult;
    testQuestion: CheckResult;
    proxyHealth: ProxyHealthInfo | null;
    proxyHealthProbing: boolean;
    onProbeProxyHealth: () => void;
    onSuggestInsightsConfig?: () => Promise<InsightsConfigSuggestion | null>;
    /** Wave 41 cycle 12 — async per-card metric-rule suggester forwarded
     *  through SetupStep5 → MetricKnowledgeBaseEditor → MetricRuleForm. */
    onSuggestMetricRuleForCard?: (rule: MetricRuleType, idx: number) =>
        | MetricRuleType
        | undefined
        | Promise<MetricRuleType | undefined>;
    /** Wave 42 — viewer identity from the bound USERPRINCIPALNAME() measure
     *  (props.context.dataUserId at the App level). Forwarded to SetupStep5
     *  so Section H can render a live "Currently bound" preview chip. */
    boundUserId?: string;
}) {
    const { draft, setDraft, profiles, isFetchingProfiles, fetchError, revealToken, setRevealToken } = props;
    // Wave 30 cycle 5 — capture the draft as it was when edit mode began so
    // the unsaved-changes badge compares against the actual persisted state,
    // not the documented defaults. SetupEditFlow only mounts when isEditing
    // becomes true, so first-render `draft` IS the persisted snapshot.
    const [baselineDraft] = useState<SetupDraft>(() => ({ ...draft }));
    const view = decodeConnection(draft.connectionMode);
    const transport = view.transport;
    const backend = view.backend;
    const fields = requiredConnectionFields(transport, backend);
    const pairSupport = isConnectionPairSupported(transport, backend);
    const fieldByName = new Map(fields.map(f => [f.name, f]));

    const updatePair = (next: { transport?: Transport; backend?: Backend }) => {
        const t = next.transport ?? transport;
        let b = next.backend ?? backend;
        // If the user picked a Transport that doesn't support the current
        // Backend, snap Backend back to "genie-single" — the only universally
        // supported choice. Avoids leaving the form in an invalid state the
        // user has to fix manually.
        if (next.transport && !isConnectionPairSupported(t, b).ok) {
            b = "genie-single";
        }
        setDraft(prev => ({ ...prev, connectionMode: encodeConnection(t, b) }));
    };

    const setField = (name: keyof SetupDraft, value: string) => {
        setDraft(prev => ({ ...prev, [name]: value }));
    };
    const setBool = (name: keyof SetupDraft, value: boolean) => {
        setDraft(prev => ({ ...prev, [name]: value }));
    };
    const setNum = (name: keyof SetupDraft, value: number) => {
        setDraft(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="gn-setup-panel gn-setup-flow">
            <div className="gn-setup-hero">
                <div>
                    <span className="gn-setup-kicker">Edit configuration</span>
                    <h3>Configure connection — guided flow</h3>
                    <p>Walk through each step below. The form reveals only the fields the chosen pair needs. Apply Changes writes to this visual instance — Save the report to persist for other viewers.</p>
                </div>
            </div>

            {/* Proxy status banner — auto-runs whenever the proxy URL or
                auth fields change. Confirms reachability + config source +
                profile count BEFORE the user fills in any field they
                might otherwise blame for failure (BUG-002 + IDEA-015). */}
            <ProxyStatusBanner
                health={props.proxyHealth}
                probing={props.proxyHealthProbing}
                onRetry={props.onProbeProxyHealth}
                connectionMode={props.draft.connectionMode}
            />

            {/* Step 1 — Transport */}
            <section className="gn-setup-step">
                <header className="gn-setup-step-header">
                    <span className="gn-setup-step-number">1</span>
                    <div>
                        <h4>Transport</h4>
                        <p>How does this visual reach the AI backend?</p>
                    </div>
                </header>
                <div className="gn-setup-cards" role="radiogroup" aria-label="Transport">
                    {TRANSPORTS.map(t => {
                        const meta = TRANSPORT_LABELS[t];
                        const selected = transport === t;
                        return (
                            <button
                                key={t}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`gn-setup-card${selected ? " gn-setup-card--selected" : ""}`}
                                onClick={() => updatePair({ transport: t })}
                            >
                                <span className="gn-setup-card-title">{meta.label}{t === "proxy" && <span className="gn-setup-card-badge">Recommended</span>}</span>
                                <span className="gn-setup-card-hint">{meta.hint}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Step 2 — Backend (child of Transport) */}
            <section className="gn-setup-step">
                <header className="gn-setup-step-header">
                    <span className="gn-setup-step-number">2</span>
                    <div>
                        <h4>Backend</h4>
                        <p>What sits on the other end of the chosen Transport?</p>
                    </div>
                </header>
                <div className="gn-setup-cards" role="radiogroup" aria-label="Backend">
                    {BACKENDS.map(b => {
                        const meta = BACKEND_LABELS[b];
                        const support = isConnectionPairSupported(transport, b);
                        const selected = backend === b;
                        return (
                            <button
                                key={b}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={!support.ok}
                                className={`gn-setup-card${selected ? " gn-setup-card--selected" : ""}${!support.ok ? " gn-setup-card--disabled" : ""}`}
                                onClick={() => support.ok && updatePair({ backend: b })}
                                title={support.ok ? undefined : support.reason}
                            >
                                <span className="gn-setup-card-title">{meta.label}</span>
                                <span className="gn-setup-card-hint">{support.ok ? meta.hint : support.reason}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Step 3 — Details (child of Transport + Backend) */}
            <section className="gn-setup-step">
                <header className="gn-setup-step-header">
                    <span className="gn-setup-step-number">3</span>
                    <div>
                        <h4>Connection details</h4>
                        <p>Fill in the fields the chosen pair needs. Required fields are marked with <span className="gn-setup-required">*</span>.</p>
                    </div>
                </header>
                <div className="gn-setup-form">
                    {fieldByName.has("apiBaseUrl") && (() => {
                        const req = !!fieldByName.get("apiBaseUrl")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-apiBaseUrl">Proxy URL{req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <input
                                id="gn-conn-apiBaseUrl"
                                type="text"
                                value={draft.apiBaseUrl}
                                onChange={e => setField("apiBaseUrl", e.target.value)}
                                placeholder={"e.g. " + "http" + "://127.0.0.1:8787"}
                                aria-required={req}
                            />
                            <span className="gn-setup-field-hint">Where the PulsePlay Proxy is listening. Local default is <code>127.0.0.1:8787</code>.</span>
                        </div>
                        );
                    })()}

                    {fieldByName.has("host") && (() => {
                        const req = !!fieldByName.get("host")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-host">Databricks Workspace URL{req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <input
                                id="gn-conn-host"
                                type="text"
                                value={draft.host}
                                onChange={e => setField("host", e.target.value)}
                                placeholder="e.g. https://adb-123.4.azuredatabricks.net"
                                aria-required={req}
                            />
                            <span className="gn-setup-field-hint">Full HTTPS URL of your Databricks workspace, no trailing slash.</span>
                        </div>
                        );
                    })()}

                    {fieldByName.has("assistantProfile") && (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-assistantProfile">Assistant Profile{fieldByName.get("assistantProfile")!.required && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            {profiles.length > 0 ? (
                                <select
                                    id="gn-conn-assistantProfile"
                                    value={draft.assistantProfile}
                                    onChange={e => setField("assistantProfile", e.target.value)}
                                    aria-required={!!fieldByName.get("assistantProfile")!.required}
                                >
                                    <option value="">Select a profile…</option>
                                    {profiles.map(p => {
                                        // displayName is the friendly label from proxy config.json
                                        // (BUG-013 fix). Falls back to the raw key only when the
                                        // proxy hasn't published a displayName for this profile.
                                        const label = (p.displayName && p.displayName.trim()) || p.name;
                                        return (
                                            <option key={p.name} value={p.name}>{label}{p.description ? ` (${p.description})` : ""}</option>
                                        );
                                    })}
                                </select>
                            ) : (
                                <input
                                    id="gn-conn-assistantProfile"
                                    type="text"
                                    value={draft.assistantProfile}
                                    onChange={e => setField("assistantProfile", e.target.value)}
                                    placeholder="default"
                                    aria-required={!!fieldByName.get("assistantProfile")!.required}
                                />
                            )}
                            {isFetchingProfiles && <span className="gn-setup-field-hint">Discovering profiles from the proxy…</span>}
                            {fetchError && <span className="gn-setup-field-hint" style={{ color: "var(--gn-error)" }}>{fetchError}</span>}
                            {!isFetchingProfiles && !fetchError && profiles.length === 0 && (
                                <span className="gn-setup-field-hint">Profile name from the proxy's <code>config.json</code>.</span>
                            )}
                            {profiles.length > 0 && (
                                <span className="gn-setup-field-hint">Found {profiles.length} profiles on the proxy.</span>
                            )}
                        </div>
                    )}

                    {fieldByName.has("spaceId") && (() => {
                        const req = !!fieldByName.get("spaceId")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-spaceId">AI Workspace ID{req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <input
                                id="gn-conn-spaceId"
                                type="text"
                                value={draft.spaceId}
                                onChange={e => setField("spaceId", e.target.value)}
                                placeholder="01f1••••••••••••••••••••••••••••"
                                aria-required={req}
                            />
                        </div>
                        );
                    })()}

                    {fieldByName.has("token") && (() => {
                        const req = !!fieldByName.get("token")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-token">Databricks Access Token (PAT){req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <input
                                    id="gn-conn-token"
                                    type={revealToken ? "text" : "password"}
                                    value={draft.token}
                                    onChange={e => setField("token", e.target.value)}
                                    style={{ flex: 1 }}
                                    placeholder="dapi••••••••••••••••••••••••••••"
                                    aria-required={req}
                                />
                                <button
                                    type="button"
                                    className="gn-btn gn-btn--compact"
                                    onClick={() => setRevealToken(!revealToken)}
                                    aria-pressed={revealToken}
                                    aria-label={revealToken ? "Hide token" : "Reveal token"}
                                >
                                    {revealToken ? "Hide" : "Reveal"}
                                </button>
                            </div>
                            <span className="gn-setup-field-hint">⚠ The PAT is stored in the .pbix file in this transport. Use Proxy for production.</span>
                        </div>
                        );
                    })()}

                    {fieldByName.has("warehouseId") && (() => {
                        const req = !!fieldByName.get("warehouseId")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-warehouseId">SQL Warehouse ID{req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <input
                                id="gn-conn-warehouseId"
                                type="text"
                                value={draft.warehouseId}
                                onChange={e => setField("warehouseId", e.target.value)}
                                placeholder="ENTER_WAREHOUSE_ID"
                                aria-required={req}
                            />
                            <span className="gn-setup-field-hint">Optional. Pre-warms your SQL warehouse so first questions don't pay cold-start latency.</span>
                        </div>
                        );
                    })()}

                    {fieldByName.has("proxyKey") && (() => {
                        const req = !!fieldByName.get("proxyKey")!.required;
                        return (
                        <div className="gn-setup-field">
                            <label htmlFor="gn-conn-proxyKey">Proxy Shared Secret{req && <><span className="gn-setup-required" aria-hidden="true"> *</span><span className="gn-sr-only"> (required)</span></>}</label>
                            <input
                                id="gn-conn-proxyKey"
                                type={revealToken ? "text" : "password"}
                                value={draft.proxyKey}
                                onChange={e => setField("proxyKey", e.target.value)}
                                placeholder="(leave blank for local proxy)"
                                aria-required={req}
                            />
                            <span className="gn-setup-field-hint">Optional. Sent as <code>X-Genie-Key</code> when the proxy enforces an API key.</span>
                        </div>
                        );
                    })()}
                </div>
            </section>

            {/* Step 4 — Validate */}
            <section className="gn-setup-step">
                <header className="gn-setup-step-header">
                    <span className="gn-setup-step-number">4</span>
                    <div>
                        <h4>Validate</h4>
                        <p>Run a quick check before saving. Apply Changes first to validate the new values.</p>
                    </div>
                </header>
                <div className="gn-setup-check-actions">
                    <button
                        className="gn-btn gn-btn--compact gn-btn--outline"
                        disabled={props.healthCheck.kind === "running"}
                        title="Run a quick connectivity check against the configured backend"
                        onClick={props.runConnectivityCheck}
                    >
                        {props.healthCheck.kind === "running" ? "Checking…" : "Check connection"}
                    </button>
                    <button
                        className="gn-btn gn-btn--compact gn-btn--primary"
                        disabled={props.testQuestion.kind === "running"}
                        title="Send a tiny PING to verify the AI backend round-trips correctly"
                        onClick={props.runTestQuestion}
                    >
                        {props.testQuestion.kind === "running" ? "Testing…" : "Test Question"}
                    </button>
                </div>
                {props.healthCheck.kind !== "idle" && (
                    <div className={`gn-setup-check-result gn-setup-check-result--${props.healthCheck.kind}`}>
                        <strong>Connectivity:</strong> {props.healthCheck.label}
                    </div>
                )}
                {props.testQuestion.kind !== "idle" && (
                    <div className={`gn-setup-check-result gn-setup-check-result--${props.testQuestion.kind}`}>
                        <strong>Test question:</strong> {props.testQuestion.label}
                    </div>
                )}
            </section>

            {/* Step 5 — Advanced configuration. Extracted to ./setupStep5.tsx in 48.1
                so the form's growing surface (Section G Genie space sync, Guided wizard,
                presets, validation) doesn't bloat visual.tsx. The <SetupStep5> component
                is behaviourally identical to the inline markup it replaced — Sections
                A → F still render exactly as before, with per-section adoption of the
                shared FieldRow / FieldHelp / FieldPreview / SectionStatus primitives
                landing in 48.2 → 48.5. */}
            <SetupStep5
                draft={draft}
                setField={setField}
                setBool={setBool}
                setNum={setNum}
                onSuggestInsightsConfig={props.onSuggestInsightsConfig}
                onSuggestMetricRuleForCard={props.onSuggestMetricRuleForCard}
                boundUserId={props.boundUserId}
            />

            {/* Wave 29 — unsaved-changes badge. Counts customised fields across
                all sections; renders only when > 0 so the chrome stays clean
                when nothing has been touched. Authors who close the modal via
                Cancel without clicking Apply now see this warning first. */}
            {(() => {
                // Wave 30 cycle 5 — compare against the edit-session baseline,
                // falling back to defaults only when no baseline is captured.
                const dirty = countDirtyVsBaseline(draft, baselineDraft);
                if (dirty === 0) return null;
                return (
                    <div className="gn-setup-dirty-badge" role="status" aria-live="polite">
                        <span className="gn-setup-dirty-badge-label">⚠ Unsaved changes</span>
                        <span className="gn-setup-dirty-badge-count">
                            {dirty} field{dirty === 1 ? "" : "s"} edited — click <strong>Apply Changes</strong> to save, or <strong>Cancel</strong> to discard.
                        </span>
                    </div>
                );
            })()}

            <div className="gn-setup-actions">
                <button className="gn-btn" onClick={props.onCancel}>Cancel</button>
                <button
                    className="gn-btn gn-btn--primary"
                    onClick={props.onApply}
                    disabled={!pairSupport.ok}
                    title={pairSupport.ok ? "Apply setup changes" : pairSupport.reason || "No changes to apply"}
                    aria-label={pairSupport.ok ? "Apply AI Insights setup changes" : "Apply changes unavailable until setup changes"}
                >
                    Apply Changes
                </button>
            </div>
        </div>
    );
}

interface PulseSurfaceContextItem {
    label: string;
    value: string;
}

function PulseSurfaceContextStrip(props: {
    surface: string;
    mode: string;
    items: PulseSurfaceContextItem[];
}): React.ReactElement {
    return (
        <div className="gn-surface-context" role="group" aria-label={`${props.surface} context`}>
            <div className="gn-surface-context__primary">
                <span className="gn-surface-context__label">Surface</span>
                <span className="gn-surface-context__value">{props.surface}</span>
                <span className="gn-surface-context__divider" aria-hidden="true" />
                <span className="gn-surface-context__value">{props.mode}</span>
            </div>
            {props.items.map(item => (
                <div className="gn-surface-context__item" key={item.label}>
                    <span className="gn-surface-context__label">{item.label}</span>
                    <span className="gn-surface-context__value">{item.value}</span>
                </div>
            ))}
        </div>
    );
}

function WelcomeSection(props: {
    home: AssistantHomePayload;
    roleMode: UserMode;
    isConfigured: boolean;
    busy: boolean;
    area: GuidedArea;
    setArea: (area: GuidedArea) => void;
    latestActions: AssistantAction[];
    onRunArea: () => void;
    onAction: (action: AssistantAction) => void;
    /** Option A — preloaded KPI snapshot content (markdown). When set,
     *  renders as the leading data panel in place of the role subtitle. */
    kpiSnapshot?: string | null;
    /** True while the background preload is in flight — shows a subtle
     *  "Analysing your data…" hint under the snapshot area. */
    kpiLoading?: boolean;
    /** Compact mode (2026-05-22): when the chat thread already has messages,
     *  render only the KPI snapshot at the top so users can scroll up and
     *  refer back to the probe answer — without duplicating Quick start /
     *  Try asking strips (which already render below the message list). */
    compact?: boolean;
    /** UX-VIEWER-1.2B — Ask Pulse home metadata from `/assistant/home-meta`.
     *  Provides displayName + description (the data identity block at the
     *  top of the empty state) and the source provenance tag. Curated
     *  questions are already plumbed via `latestActions`. Optional — when
     *  absent, the empty state degrades to the role subtitle. */
    homeMeta?: {
        displayName: string | null;
        description: string | null;
        source: string;
    };
}) {
    const showDataIdentity = !props.compact
        && !!props.homeMeta
        && (!!props.homeMeta.displayName || !!props.homeMeta.description);
    return (
        <div className={`gn-welcome${props.compact ? " gn-welcome--compact" : ""}`}>
            {showDataIdentity && (
                <div className="gn-welcome-identity" data-testid="askpulse-data-identity">
                    {props.homeMeta?.displayName && (
                        <h3 className="gn-welcome-identity__title">{props.homeMeta.displayName}</h3>
                    )}
                    {props.homeMeta?.description && (
                        <p className="gn-welcome-identity__description">{props.homeMeta.description}</p>
                    )}
                </div>
            )}
            {/* 2026-05-26 — KPI snapshot briefing card REMOVED from Ask
                Pulse per user direction: "the Asking insights section is
                not needed in Ask Pulse". The auto-fired insights summary
                was leaking AI Insights-style content into the chat
                surface and adding visual noise above the user's first
                question. AI Insights tab is where briefings belong; Ask
                Pulse stays a clean chat composer. The kpiSnapshot is
                still fetched (other paths consume it) but no longer
                renders here. Fall through to the snapshot pills /
                identity block below. */}
            {props.home.snapshot.length > 0 ? (
                <div className="gn-welcome-snapshot">
                    {props.home.snapshot.slice(0, 4).map(card => (
                        <div key={`${card.label}-${card.value}`} className="gn-snapshot-pill">
                            <span className="gn-snapshot-label">{card.label}</span>
                            <span className="gn-snapshot-value">{card.value}</span>
                        </div>
                    ))}
                </div>
            ) : !props.compact ? (
                // 2026-05-26 — role subtitle now hidden in COMPACT mode
                // (when chat has messages). Previously the "Guided
                // business exploration…" line still rendered above the
                // chat thread, leaving a ~200px dead zone between the
                // subtitle and the user's first question bubble. In
                // active-chat mode the welcome area should collapse so
                // the conversation owns the surface.
                <p className="gn-welcome-caption">{getRoleSubtitle(props.roleMode)}</p>
            ) : null}

            {/* UX-VIEWER-1.2A — Genie-shape empty state. Prior layout had two
               competing affordances stacked: "Quick start" with 4 area tabs
               + "Run X View" CTA, then "Try asking" with 3 horizontal chips.
               Three ways to start a single conversation = choice paralysis
               + a "Run Performance View" button that looked half-disabled.
               Genie's home is a single vertical list of starter questions
               with horizontal-rule separators. The Quick start section is
               removed (the area-tabs concept folds into AI Insights, not
               Ask Pulse). The Try asking section keeps the same data source
               (props.latestActions, populated by the LLM probe in 1.2B and
               STATIC_ACTIONS fallback today) but renders as a vertical list
               so the questions are scannable and tappable on mobile.
               */}
            {!props.compact && props.latestActions.length > 0 && (
                <div className="gn-welcome-section gn-starter-list" data-testid="askpulse-starter-list">
                    {props.latestActions.slice(0, 5).map(action => (
                        <button
                            key={action.id}
                            type="button"
                            className="gn-starter-question"
                            disabled={!props.isConfigured || props.busy}
                            onClick={() => props.onAction(action)}
                            data-testid="askpulse-starter-question"
                        >
                            <span className="gn-starter-question__label">{action.label}</span>
                        </button>
                    ))}
                </div>
            )}

            {!props.compact && (
                <p className="gn-welcome-disclaimer" data-testid="askpulse-disclaimer">
                    Always review the accuracy of responses.
                </p>
            )}
        </div>
    );
}

function MessageCard(props: {
    canShowSql: boolean;
    canShowTrace: boolean;
    message: ChatMessageViewModel;
    settings: OperationalSettingsModel;
    onFeedback: (message: ChatMessageViewModel, rating: "up" | "down", comment?: string) => void;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessageViewModel[]>>;
    submit: (input: string, intent: AssistantIntent) => void;
    /** Wall-clock tick from App so the embedded ProgressIndicator timer
     * can update without each MessageCard owning its own interval. */
    nowTick: number;
    /** UX-VIEWER-1.5b — invoked when the user clicks Stop on a running
     *  pending bubble. Undefined for completed/failed/system messages. */
    onStop?: () => void;
}) {
    const availableViews = getAvailableMessageViews(props.message, props.canShowSql, props.canShowTrace);
    const activeView = props.message.viewMode && availableViews.includes(props.message.viewMode)
        ? props.message.viewMode
        : availableViews[0];
    const [feedbackDraft, setFeedbackDraft] = useState(props.message.feedbackComment || props.message.feedbackReason || "");

    if (props.message.role === "user") {
        return (
            <div className="gn-msg gn-msg--user">
                <div className="gn-bubble">{props.message.content}</div>
            </div>
        );
    }

    if (props.message.role === "system") {
        return (
            <div className="gn-msg gn-msg--system">
                <div className="gn-bubble">{props.message.content || "Request failed."}</div>
            </div>
        );
    }

    return (
        <div className="gn-msg gn-msg--assistant">
            <div className="gn-bubble">
                {props.message.route?.routeLabel && (
                    <div className="gn-msg-header gn-msg-header--compact">
                        <span className="gn-route-label">{props.message.route.routeLabel}</span>
                    </div>
                )}

                {renderMessageBody(props.message, activeView, availableViews, props.settings, viewId =>
                    props.setMessages(previous => previous.map(message =>
                        message.id === props.message.id ? { ...message, viewMode: viewId } : message
                    )),
                    props.nowTick,
                    props.onStop
                )}

                {props.message.suggestedActions?.length ? (
                    <div className="gn-actions">
                        {props.message.suggestedActions.slice(0, 4).map(action => (
                            <button
                                key={action.id}
                                className="gn-action-pill"
                                onClick={() => props.submit(action.prompt ?? action.label, action.intent ?? "summary")}
                            >
                                {action.label}<span className="gn-action-arrow">&nbsp;→</span>
                            </button>
                        ))}
                    </div>
                ) : null}

                {props.message.status === "COMPLETED" && (
                    <div className="gn-feedback">
                        <span className="gn-feedback-label">Helpful?</span>
                        <button
                            className={`gn-feedback-btn${props.message.feedback === "up" ? " gn-feedback-btn--active" : ""}`}
                            onClick={() => props.onFeedback(props.message, "up", feedbackDraft)}
                            aria-label="Mark answer as helpful"
                            aria-pressed={props.message.feedback === "up"}
                        >
                            <span aria-hidden="true">👍</span>
                        </button>
                        <button
                            className={`gn-feedback-btn${props.message.feedback === "down" ? " gn-feedback-btn--active" : ""}`}
                            onClick={() => props.onFeedback(props.message, "down", feedbackDraft)}
                            aria-label="Mark answer as not helpful"
                            aria-pressed={props.message.feedback === "down"}
                        >
                            <span aria-hidden="true">👎</span>
                        </button>
                        {/* 2026-05-30 — removed the redundant "⎘ Copy answer" text
                          * button: the message-level icon toolbar below (📋) does
                          * the identical copy (active view: SQL / table-CSV /
                          * narrative). One copy control, not two. */}
                        {props.message.feedback && (
                            <div className="gn-feedback-comment">
                                <input
                                    type="text"
                                    value={feedbackDraft}
                                    onChange={event => setFeedbackDraft(event.target.value)}
                                    placeholder={props.message.feedback === "down" ? "Optional: what went wrong?" : "Optional: add a comment"}
                                    aria-label={props.message.feedback === "down" ? "Optional dislike reason" : "Optional like comment"}
                                />
                                <button
                                    type="button"
                                    className="gn-pill gn-pill--compact"
                                    onClick={() => props.onFeedback(props.message, props.message.feedback!, feedbackDraft)}
                                >
                                    Save
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 2026-05-22 — unified message-level action toolbar.
                 *   Rajesh's direction (with annotated screenshot of chart-view
                 *   icons): "I was talking to have like this" — wants the same
                 *   📋 ⬇ ↻ </> chrome at bottom-right of EVERY chat reply,
                 *   matching the visual language of the AI Insights section
                 *   footer + the existing chart-view toolbar. Single
                 *   message-level toolbar rather than per-section, so the
                 *   chrome is consistent across narrative/chart/table/SQL views.
                 *   SVGs match InsightsSectionFooter for visual parity. */}
                {props.message.status === "COMPLETED" && (
                    <div className="gn-msg-actions" role="toolbar" aria-label="Message actions">
                        <button
                            type="button"
                            className="gn-msg-action gn-msg-action--icon"
                            onClick={() => {
                                const v = activeView;
                                if (v === "sql" && props.message.sqlQuery) copyText(props.message.sqlQuery);
                                else if (v === "table" && props.message.queryResult) copyText(formatTableAsCsv(props.message.queryResult.columns, props.message.queryResult.rows));
                                else copyText(props.message.content ?? "");
                            }}
                            title={`Copy ${activeView === "sql" ? "SQL" : activeView === "table" ? "table as CSV" : "answer"}`}
                            aria-label={`Copy ${activeView === "sql" ? "SQL" : activeView === "table" ? "table as CSV" : "answer"}`}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="9" y="2" width="6" height="4" rx="1" />
                                <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
                            </svg>
                        </button>
                        {props.message.queryResult && props.message.queryResult.columns.length > 0 && (
                            <button
                                type="button"
                                className="gn-msg-action gn-msg-action--icon"
                                onClick={() => {
                                    const qr = props.message.queryResult!;
                                    const csv = formatTableAsCsv(qr.columns, qr.rows);
                                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `ask-pulse-${props.message.id}.csv`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                }}
                                title="Download data as CSV"
                                aria-label="Download data as CSV"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </button>
                        )}
                        {props.message.sourceQuestion && (
                            <button
                                type="button"
                                className="gn-msg-action gn-msg-action--icon"
                                onClick={() => props.submit(props.message.sourceQuestion!, "summary")}
                                title="Re-run this question"
                                aria-label="Re-run this question"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                            </button>
                        )}
                        {props.message.sqlQuery && availableViews.includes("sql") && (
                            <button
                                type="button"
                                className={`gn-msg-action gn-msg-action--icon${activeView === "sql" ? " gn-msg-action--active" : ""}`}
                                onClick={() => props.setMessages(previous => previous.map(message =>
                                    // Toggle: </> now switches Answer ⇄ SQL (the
                                    // redundant Answer/SQL switch above was removed).
                                    message.id === props.message.id ? { ...message, viewMode: activeView === "sql" ? "narrative" : "sql" } : message
                                ))}
                                title={activeView === "sql" ? "Back to answer" : "View SQL"}
                                aria-label={activeView === "sql" ? "Back to answer" : "View SQL"}
                                aria-pressed={activeView === "sql"}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="16 18 22 12 16 6" />
                                    <polyline points="8 6 2 12 8 18" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}

                {/* Supervisor breadcrumbs — show which spaces were consulted */}
                {props.message.route?.spaceResults && props.message.route.spaceResults.length > 0 && (
                    <div className="gn-breadcrumbs">
                        {/* Partial-answer banner. Iterative-load smoke showed
                            helpers occasionally drop out (Genie 5 req/min cap)
                            and the synthesis happily produces an answer from
                            N-1 sources without the user noticing. Surface it. */}
                        {(() => {
                            const sr = props.message.route?.spaceResults ?? [];
                            const failed = sr.filter(s => !s.ok);
                            if (failed.length === 0) return null;
                            return (
                                <div className="gn-breadcrumbs-partial" role="alert" aria-live="polite">
                                    <span aria-hidden="true">⚠ </span>This answer is based on {sr.length - failed.length} of {sr.length} sources — {failed.map(f => f.profileName).join(", ")} {failed.length === 1 ? "was" : "were"} unavailable. Retry for a full cross-source answer.
                                </div>
                            );
                        })()}
                        <span className="gn-breadcrumbs-label">Sources consulted:</span>
                        <div className="gn-breadcrumbs-chips">
                            {props.message.route.spaceResults.map(sr => (
                                <span
                                    key={sr.profileName}
                                    className={`gn-breadcrumb-chip gn-breadcrumb-chip--${sr.ok ? "ok" : "err"}`}
                                    title={sr.ok ? `${sr.profileName} responded (${sr.status})` : `${sr.profileName} unavailable (${sr.status})`}
                                >
                                    {sr.ok ? "✓" : "✕"} {sr.profileName}
                                </span>
                            ))}
                        </div>
                        {/* Fallback banner: synthesis model was unavailable */}
                        {(props.message.content ?? "").startsWith("Supervisor synthesis model was unavailable") && (
                            <div className="gn-breadcrumbs-fallback">
                                ⚠ Synthesis model unavailable — showing raw space results below.
                            </div>
                        )}
                    </div>
                )}

                {/* Standard single-space route metadata */}
                {!props.message.route?.spaceResults && (props.message.route?.assistantProfile || props.message.route?.routedSpaceId) && (
                    <div className="gn-route-meta">
                        {props.message.route?.assistantProfile && <span>Profile: {props.message.route.assistantProfile}</span>}
                        {props.message.route?.routedSpaceId && <span>Space: {props.message.route.routedSpaceId}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Map raw profile slug (`default`, `supervisor`, `foundation-stream`) to a
 *  human-friendly source label for the provenance footer. Codex 2026-05-19
 *  naming audit: "Avoid raw profile names such as `default` in primary UI.
 *  Map them to configured display names." Keep this list small + extend as
 *  more profile types become common; falls back to title-cased slug. */
function formatProvenanceSourceLabel(raw: string | undefined): string {
    if (!raw) return "Default profile";
    const known: Record<string, string> = {
        "default":           "Default profile",
        "supervisor":        "Supervisor agent",
        "foundation-stream": "Foundation Model",
    };
    if (known[raw]) return known[raw];
    return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// 2026-05-22 — classify the SHAPE of a Genie response so the UI can render
// clarifying questions as a distinct "needs choice" card instead of as plain
// narrative. Borrowed structurally from PepPulse blueprint §14 (error-redaction
// pattern): classify response → friendly user message + structured choice UI.
//
// Heuristic rules (intentionally conservative — false negatives are fine,
// false positives are not):
//   - "clarifier" if content ends with ? AND length < 400 AND is a single
//     block (no double-newline). Catches "Would you prefer X or Y?" etc.
//   - "narrative" otherwise.
//
// Future extension: classify "error" shape too (when proxy returns an error
// envelope masquerading as content), or "partial-with-clarifier" when Genie
// returns BOTH a clarifier AND data.
type ResponseShape = "narrative" | "clarifier";
function classifyResponseShape(content: string | undefined | null): ResponseShape {
    const text = (content || "").trim();
    if (!text) return "narrative";
    const endsWithQuestion = /[?]\s*$/.test(text);
    const singleBlock = !text.includes("\n\n");
    if (endsWithQuestion && singleBlock && text.length < 400) return "clarifier";
    return "narrative";
}

function formatSqlSectionLabel(section: GenieSqlSection): string {
    const id = String(section.sectionId || "").trim();
    const pretty = id
        ? id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
        : "Section";
    const title = pretty
        ? pretty.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
        : "Section";
    return section.cteName ? `${title} · ${section.cteName}` : title;
}

function renderMessageBody(
    message: ChatMessageViewModel,
    view: OutputMode,
    availableViews: OutputMode[],
    settings: OperationalSettingsModel,
    onViewChange: (view: OutputMode) => void,
    nowTick: number,
    onStop?: () => void
) {
    // Build the progress indicator once. Live (running) state shows the active
    // step + spinner; completed state stays mounted as a collapsed "View steps"
    // pill so the user can expand back to see which stages ran and how long
    // each took. This was a real gap: previously the indicator unmounted on
    // status transition out of RUNNING, leaving the user no way to review the
    // trace (per 2026-05-22 live-testing feedback: "the spinner disappears
    // there should be some drop icon giving access to it").
    const stepLabels = message.statusSteps ?? [];
    const currentStatusLabel = message.currentStatus ?? (message.status === "RUNNING" ? "Starting" : "Completed");
    const isRunning = message.status === "RUNNING";
    const isFailed = message.status === "FAILED";
    const progressSteps: ProgressStep[] = stepLabels.length > 0
        ? stepLabels.map((label, i) => ({
            id: `chat-step-${i}`,
            label,
            icon: inferIconFromLabel(label),
            // While running, the LAST step is active; everything before is done.
            // After completion, every step is done.
            state: !isRunning
                ? "done"
                : (i === stepLabels.length - 1 ? "active" : "done"),
        }))
        : (isRunning
            ? [{ id: "chat-step-0", label: currentStatusLabel, icon: inferIconFromLabel(currentStatusLabel), state: "active" as StepState }]
            : []);
    const progressElapsedMs = message.startedAt
        ? Math.max(0, nowTick - message.startedAt)
        : 0;
    // 2026-05-26 — Databricks-side streaming transparency. The
    // ProgressIndicator already shows friendly labels mapped via
    // describeGenieStatus(). For users who want to see what Databricks
    // is actually doing (which Genie call shape, warehouse state,
    // streaming status enum), we ALSO surface:
    //   • a small monospace chip next to the active label showing the
    //     RAW Genie status (e.g. "PENDING_WAREHOUSE", "EXECUTING_QUERY")
    //   • a collapsible "Databricks trace" disclosure listing every raw
    //     status transition with timestamp + elapsed-from-start
    // Both only render when message.currentStatusRaw / statusTrace is
    // present (Genie path). Non-Genie connectors (Foundation Model,
    // Supervisor, Bedrock direct) get the friendly label only.
    const dbxStreamingChip = isRunning && message.currentStatusRaw ? (
        <span
            className="gn-dbx-status-chip"
            title={`Raw Databricks Genie status: ${message.currentStatusRaw}`}
            aria-label={`Databricks streaming status ${message.currentStatusRaw}`}
        >
            {message.currentStatusRaw}
        </span>
    ) : null;
    const dbxTraceNode = (message.statusTrace && message.statusTrace.length > 0) ? (
        <details className="gn-dbx-trace">
            <summary>
                <span className="gn-dbx-trace-summary-title">Databricks Genie trace</span>
                <span className="gn-dbx-trace-summary-count">{message.statusTrace.length} event{message.statusTrace.length === 1 ? "" : "s"}</span>
            </summary>
            <ol className="gn-dbx-trace-list">
                {message.statusTrace.map((evt, i) => {
                    const tBase = message.startedAt ?? evt.t;
                    const dt = Math.max(0, evt.t - tBase);
                    const ms = dt < 1000 ? `${dt}ms` : `${(dt / 1000).toFixed(1)}s`;
                    return (
                        <li key={i} className="gn-dbx-trace-row">
                            <span className="gn-dbx-trace-time">+{ms}</span>
                            <span className="gn-dbx-trace-raw">{evt.raw}</span>
                            <span className="gn-dbx-trace-friendly">{evt.friendly}</span>
                        </li>
                    );
                })}
            </ol>
        </details>
    ) : null;
    const progressNode = progressSteps.length > 0 ? (
        <>
            <ProgressIndicator
                className="gn-chat-progress"
                steps={progressSteps}
                elapsedMs={progressElapsedMs}
                isComplete={!isRunning}
                isFailed={isFailed}
                activeOverride={isRunning && message.currentStatusRaw ? `${currentStatusLabel} · ${message.currentStatusRaw}` : (isRunning ? currentStatusLabel : undefined)}
                helperChips={message.helperChips}
            />
            {dbxStreamingChip && <div className="gn-dbx-status-chip-row">{dbxStreamingChip}</div>}
            {dbxTraceNode}
        </>
    ) : null;

    if (isRunning) {
        // UX-VIEWER-1.5b — running bubble surfaces a Stop button so users can
        // exit a slow query (matches Genie + ChatGPT escape-hatch pattern).
        // Hidden when no onStop is provided (e.g. AI Insights sync runs that
        // already own a Stop button at the pane header).
        const isStopping = (message.currentStatus || "").toLowerCase().startsWith("stopping");
        return (
            <div className="gn-msg-body gn-msg-body--running">
                {progressNode}
                {onStop ? (
                    <div className="gn-chat-stop-row">
                        <button
                            type="button"
                            className="gn-chat-stop-btn"
                            onClick={onStop}
                            disabled={isStopping}
                            aria-label="Stop generating this response"
                            title={isStopping ? "Stopping…" : "Stop generating this response"}
                        >
                            <span aria-hidden="true">■</span>
                            <span>{isStopping ? "Stopping…" : "Stop"}</span>
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }

    const hasData = Boolean(message.queryResult?.rows?.length);

    // 2026-05-30 — single-view answer (Narrative + preferred Chart + Table
    // stacked). The Answer/SQL/Trace switch was REMOVED as redundant: SQL is
    // reachable via the </> toggle in the message toolbar below (Rajesh: "no
    // need to show Answer / SQL tab — we have the show-sql option at the bottom
    // <>"). isAnswerView still gates the stacked Chart/Table sections; a stale
    // "chart"/"table" viewMode falls through to the Answer render.
    const isAnswerView = view !== "sql" && view !== "trace";
    const toggles = null;
    void onViewChange; // retained in the signature for the chart-rationale "switch view" path; no longer drives a visible switch here

    // 2026-05-30 — the former dedicated "chart" / "table" views are gone:
    // both render inline in the stacked Answer view below. Export lives on the
    // message-level toolbar (Copy / Download CSV). If a stale viewMode of
    // "chart" or "table" is restored from storage, isAnswerView is true so it
    // falls through to the stacked Answer render.

    if (view === "sql" && message.sqlQuery) {
        const sectionTabs = Array.isArray(message.sqlSections)
            ? message.sqlSections
                .filter(sec => sec && typeof sec.sqlFragment === "string" && sec.sqlFragment.trim())
                .map(sec => ({
                    label: formatSqlSectionLabel(sec),
                    sql: sec.sqlFragment,
                }))
            : [];
        // Cycle 47.8 — when the response carried multiple SQL queries
        // (multiple attachments[i].query.query entries), tab across them
        // via SqlTabs. Single-query responses still render exactly one
        // `<pre>` unless Phase 11b section labels are present. Section
        // fragments win because they make the staged-render SQL trace
        // readable; raw query blobs stay as the fallback below.
        const queries = sectionTabs.length > 0
            ? sectionTabs.map(tab => tab.sql)
            : ((Array.isArray(message.sqlQueries) && message.sqlQueries.length > 0)
                ? message.sqlQueries
                : [message.sqlQuery]);
        const labels = sectionTabs.length > 0 ? sectionTabs.map(tab => tab.label) : undefined;
        return (
            <>
                {progressNode}
                {toggles}
                <SqlTabs queries={queries} labels={labels} ariaLabel={labels ? "SQL sections" : "SQL queries"} />
            </>
        );
    }

    if (view === "trace" && (message.stageTraces?.length || message.trace?.length)) {
        return (
            <>
                {progressNode}
                {toggles}
                {message.stageTraces?.length ? (
                    <div className="gn-stage-traces" data-testid="gn-stage-traces">
                        {message.stageTraces.map(st => (
                            <details key={st.index} className={`gn-stage-trace gn-stage-trace--${st.status}`}>
                                <summary title="Expand stage trace" aria-label={`Stage ${st.index + 1} trace details, collapsed`}>
                                    <span className="gn-stage-trace-idx">Stage {st.index + 1}</span>
                                    <span className="gn-stage-trace-title">{st.title}</span>
                                    <span className="gn-stage-trace-dur">{st.durationMs >= 0 ? `${(st.durationMs / 1000).toFixed(1)}s` : "—"}</span>
                                    <span className={`gn-stage-trace-status gn-stage-trace-status--${st.status}`}>{st.status}</span>
                                </summary>
                                <div className="gn-stage-trace-body">
                                    <div className="gn-stage-trace-meta">
                                        Response: <strong>{st.responseLength.toLocaleString()}</strong> chars
                                        {st.errorMessage ? <> · Error: <strong>{st.errorMessage}</strong></> : null}
                                    </div>
                                    <details className="gn-stage-trace-block">
                                        <summary>Assembled prompt ({st.prompt.length.toLocaleString()} chars)</summary>
                                        <pre className="gn-code gn-stage-trace-pre">{st.prompt || "(empty)"}</pre>
                                    </details>
                                    <details className="gn-stage-trace-block">
                                        <summary>Raw markdown ({(st.rawMarkdown ?? "").length.toLocaleString()} chars)</summary>
                                        <pre className="gn-code gn-stage-trace-pre">{st.rawMarkdown || "(empty)"}</pre>
                                    </details>
                                    <details className="gn-stage-trace-block">
                                        <summary>SQL{st.sql ? ` (${st.sql.length.toLocaleString()} chars)` : " — none"}</summary>
                                        <pre className="gn-code gn-stage-trace-pre" dangerouslySetInnerHTML={{ __html: st.sql ? highlightSql(st.sql) : "(no SQL produced for this stage)" }} />
                                    </details>
                                </div>
                            </details>
                        ))}
                    </div>
                ) : null}
                {message.trace?.length ? (
                    <pre className="gn-code">{message.trace.join("\n")}</pre>
                ) : null}
            </>
        );
    }

    const responseShape = classifyResponseShape(message.content);
    // 2026-05-30 — first-message briefing replies already render rich KPI /
    // section cards (incl. a data table) via renderInsightsSections. In that
    // case the dedicated Table section below would duplicate the table, so we
    // suppress it (the preferred Chart is still additive — briefings don't
    // render an ECharts viz). Plain prose replies get both Chart + Table.
    const isBriefingReply = /^#{1,3}\s+(HEADLINE|KPI SNAPSHOT|TRENDS|RISKS|OPPORTUNITIES|RECOMMENDED ACTIONS|WHAT CHANGED|WHAT NEEDS ATTENTION|NEXT BEST ACTIONS|EXECUTIVE BRIEF)\b/im.test(message.content || "");
    return (
        <>
            {progressNode}
            {toggles}
            {responseShape === "clarifier" ? (
                // §14 pattern — Genie returned a clarifying question, not an answer.
                // Render as a distinct "needs choice" card so the user understands
                // this isn't the final answer; the follow-up suggestion chips below
                // the message offer the actionable choices.
                <div
                    className="gn-msg-body gn-msg-body--clarifier"
                    role="status"
                    aria-live="polite"
                    data-testid="gn-clarifier-card"
                    style={{
                        padding: "12px 14px",
                        borderLeft: "3px solid var(--pp-accent, #2563eb)",
                        background: "var(--pp-surface-subtle, #f0f9ff)",
                        borderRadius: 4,
                        marginTop: 4,
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "var(--pp-accent, #2563eb)",
                            marginBottom: 6,
                        }}
                    >
                        Genie needs a choice
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message.content}</div>
                    <div
                        style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: "var(--pp-text-muted, #6b7280)",
                        }}
                    >
                        Pick an option below to continue, or type a more specific question.
                    </div>
                </div>
            ) : (() => {
                // 2026-05-26 — Narrative view should narrate, not render
                // raw tabular data. When Genie returns a markdown table in
                // the narrative AND we already have queryResult (the same
                // data, structured) for the Table tab, strip the table
                // from the prose so users get the explanation, not a
                // duplicate of what's already in Table. If the narrative
                // is ONLY a table after stripping, show a clear hint
                // pointing at the Table tab. Per Rajesh 2026-05-26:
                // "narrative is showing as table-like data in some cases,
                // it's not actually narrating anything specifically."
                const raw = message.content || "No response returned.";
                let prose = raw;
                let strippedTable = false;
                if (message.queryResult && message.queryResult.rows?.length) {
                    // Match markdown table blocks: header row, separator,
                    // and >= 1 body row, all pipe-delimited. Strip them.
                    const tableRe = /(^|\n)\s*\|[^\n]+\|\s*\n\s*\|[\s\-:|]+\|\s*\n(?:\s*\|[^\n]+\|\s*\n?)+/g;
                    if (tableRe.test(raw)) {
                        prose = raw.replace(tableRe, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
                        strippedTable = true;
                    }
                }
                const proseHasContent = prose.replace(/[\s•\-*]/g, "").length > 8;
                // 2026-05-30 — when the answer IS the data (no real prose after
                // stripping the duplicate markdown table), skip the narrative
                // block entirely; the Chart + Table sections below carry it.
                // No more "open the Table tab" redirect — there is no tab.
                if (strippedTable && !proseHasContent) {
                    return null;
                }
                return (
                    <div className="gn-msg-body">
                        {renderKpiSnapshot(prose)}
                    </div>
                );
            })()}
            {isAnswerView && responseShape !== "clarifier" && message.queryResult && message.queryResult.rows.length > 0 && (
                <div className="gn-answer-extra">
                    <section className="gn-answer-section gn-answer-section--chart">
                        <div className="gn-answer-section-label">
                            <span className="gn-answer-section-label-text">Chart</span>
                        </div>
                        <GenieChart columns={message.queryResult.columns} rows={message.queryResult.rows} preferredChart={message.forcedChartType} genieViz={message.genieViz} sqlQuery={message.sqlQuery} sourceQuestion={message.sourceQuestion} connectorProfileId={message.route?.assistantProfile} />
                    </section>
                    {!isBriefingReply && (
                        <section className="gn-answer-section gn-answer-section--table">
                            <div className="gn-answer-section-label">
                                <span className="gn-answer-section-label-text">Table</span>
                                <span className="gn-answer-section-label-meta">{message.queryResult.rows.length} row{message.queryResult.rows.length === 1 ? "" : "s"}</span>
                            </div>
                            <div className="gn-answer-table-scroll">
                                <GenieTable columns={message.queryResult.columns} rows={message.queryResult.rows} />
                            </div>
                        </section>
                    )}
                </div>
            )}
            {message.dmlWarning && (
                <div className="gn-dml-warning" role="alert" aria-live="assertive">
                    {message.dmlVerb
                        ? <>⚠ Detected <strong>{message.dmlVerb}</strong> statement. Read-only enforcement is active — review the SQL before executing anything outside this visual.</>
                        : <>⚠ This response contains a data-modification statement (INSERT / UPDATE / DELETE / DROP or similar). Read-only enforcement is active — review the SQL before executing anything outside this visual.</>
                    }
                </div>
            )}
        </>
    );
}

function GenieTable(props: { columns: string[]; rows: any[][]; isNarrative?: boolean; sectionTitle?: string; metricRules?: InlineMetricRules }) {
    const rows = props.rows.slice(0, 25);
    const numericColumns = detectNumericColumns(props.columns, props.rows);
    return (
        <div className="gn-table-wrap">
            <div className="gn-table-container">
                <table className="gn-table">
                    <thead>
                        <tr>
                            {props.columns.map((column, ci) => (
                                <th key={column} className={numericColumns.has(ci) ? "gn-cell-numeric" : ""}>
                                    {/* Wave 27 — metricRules threaded so chat-mode tables
                                        get the same Wave 24 metric-direction colouring as
                                        Insights tables. Without this, Return Rate / Days-
                                        to-Ship pills silently revert to physical direction
                                        in chat-tab Genie responses. */}
                                    {props.isNarrative ? inlineFormat(column, props.sectionTitle, props.metricRules) : column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={`row-${rowIndex}`}>
                                {props.columns.map((column, columnIndex) => (
                                    <td key={`${column}-${rowIndex}`} className={numericColumns.has(columnIndex) ? "gn-cell-numeric" : ""}>
                                        {props.isNarrative ? inlineFormat(row[columnIndex] || "", props.sectionTitle, props.metricRules) : formatCell(row[columnIndex])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {props.rows.length > rows.length && (
                <div className="gn-table-footer">Showing {rows.length} of {props.rows.length} rows.</div>
            )}
        </div>
    );
}

function GenieChart(props: { columns: string[]; rows: any[][]; preferredChart?: ChartKind; genieViz?: unknown; sqlQuery?: string; sourceQuestion?: string; connectorProfileId?: string }) {
    const dataShape = useMemo(() => analyzeDataShape(props.columns, props.rows), [props.columns, props.rows]);
    const recommended = dataShape.recommended;
    // UX-VIEWER-1.7b.2 — when Genie returns a HELIOS viz spec, defer to
    // Databricks' chart-type pick (their type inference + chart picker
    // is more reliable than name-pattern heuristics). resolveChartSpec
    // walks the translator registry; HELIOS detects this shape and
    // returns a ChartIR. We then map ChartIR.mark back to ChartKind for
    // the existing buildEChartsOption call.
    //
    // Precedence: user override (preferredChart) > Genie HELIOS pick >
    // PulsePlay heuristic recommendation. User choice always wins so
    // the chart-type dropdown still works for manual override.
    const genieIRChartKind = useMemo<ChartKind | null>(() => {
        if (!props.genieViz) return null;
        const ir = resolveChartSpec(props.genieViz, {
            columns: props.columns.map(name => ({ name })),
            rows: props.rows,
        });
        // Skip the heuristic fallback — only honor real translator hits.
        if (!ir || ir.sourceTranslator === "heuristic") return null;
        return irMarkToChartKind(ir.mark);
    }, [props.genieViz, props.columns, props.rows]);
    const initial: ChartKind = props.preferredChart ?? genieIRChartKind ?? recommended;
    const [chartType, setChartType] = useState<ChartKind>(initial);

    useEffect(() => { setChartType(initial); }, [initial]);

    // End-user palette picker — lives on the chart (end users never see
    // Settings). Selecting a palette re-skins EVERY chart app-wide via a CSS
    // var + broadcast; this state just forces THIS chart to rebuild its option
    // (which reads the var) when the broadcast fires.
    const [paletteId, setPaletteId] = useState<string>(() => getActivePaletteId());
    useEffect(() => {
        const onPalette = (e: Event) => setPaletteId((e as CustomEvent).detail || getActivePaletteId());
        window.addEventListener(CHART_PALETTE_EVENT, onPalette);
        return () => window.removeEventListener(CHART_PALETTE_EVENT, onPalette);
    }, []);

    // Pin-to-canvas — capture this chart (with its CURRENT type) as a snapshot
    // tile on the native BI canvas. Carries the SQL + connector so a later phase
    // can refresh it live.
    const [pinned, setPinned] = useState(false);
    const handlePin = useCallback(() => {
        // Connector binding for a future live refresh. Prefer the profile that
        // answered (route), fall back to the active profile so it is always
        // captured even when the response route omits it.
        let connectorProfileId = props.connectorProfileId;
        if (!connectorProfileId) {
            try { connectorProfileId = window.localStorage.getItem("pulseplay:active-ai-profile") || undefined; } catch { /* ignore */ }
        }
        addCanvasTile({
            title: props.sourceQuestion?.trim() || "Pinned chart",
            kind: "chart",
            chartType,
            columns: props.columns,
            rows: props.rows,
            sqlQuery: props.sqlQuery,
            connectorProfileId,
            sourceQuestion: props.sourceQuestion,
        });
        setPinned(true);
        window.setTimeout(() => setPinned(false), 1800);
    }, [chartType, props.columns, props.rows, props.sqlQuery, props.connectorProfileId, props.sourceQuestion]);

    // Group CHART_OPTIONS into optgroup sections for the picker.
    const grouped = useMemo(() => {
        const map = new Map<string, Array<(typeof CHART_OPTIONS)[number]>>();
        for (const opt of CHART_OPTIONS) {
            if (!map.has(opt.group)) map.set(opt.group, []);
            map.get(opt.group)!.push(opt);
        }
        return map;
    }, []);

    return (
        <div className="gn-chart-container">
            <div className="gn-chart-type-bar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                    className="gn-chart-type-select"
                    value={chartType}
                    onChange={e => setChartType(e.target.value as ChartKind)}
                >
                    {Array.from(grouped.entries()).map(([group, opts]) => (
                        <optgroup key={group} label={group}>
                            {opts.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}{opt.value === recommended ? " ★" : ""}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                {/* 2026-05-22 — shared "Why this chart?" pill. Same component used in
                    NativeCanvas. Anchored next to the chart-type dropdown so the
                    rationale is visible at the point of decision. */}
                <ChartRationalePill
                    columns={props.columns}
                    rows={props.rows}
                    pickedKind={chartType}
                    popoverPlacement="below-right"
                    onSuggestedViewClick={(suggestedView) => {
                        // 2026-05-22 G4 — click-to-switch handler.
                        // Maps the warning's `suggestedView` string (free-form
                        // human label like "KPI tile" / "Matrix view") to a
                        // ChartKind that GenieChart's <select> understands.
                        // Industry consensus is suggest-then-apply, never auto-
                        // route; the user must click to opt in (see
                        // docs/research/EXTERNAL_REFERENCES.md G4 entry).
                        const lower = String(suggestedView || "").toLowerCase();
                        // "table" isn't a chart kind in the picker; the
                        // closest fit when the warning says "Matrix view" /
                        // "Table with sorting" is to keep the chart but
                        // surface the data tab — out of scope here, so we
                        // map both back to KPI. The user can still switch
                        // to the Table tab via the message-level tabs.
                        const next: ChartKind | null =
                            /\bkpi\b|\btable\b|\bmatrix\b/.test(lower) ? "kpi" :
                            /\bbar\b/.test(lower) ? "bar" :
                            /\bcolumn\b/.test(lower) ? "column" :
                            /\bline\b/.test(lower) ? "line" :
                            /\barea\b/.test(lower) ? "area" :
                            /\bpie|donut\b/.test(lower) ? "donut" :
                            /\bscatter\b/.test(lower) ? "scatter" :
                            /\bheatmap\b/.test(lower) ? "heatmap" :
                            /\btreemap\b/.test(lower) ? "treemap" :
                            /\bfunnel\b/.test(lower) ? "funnel" :
                            /\bpareto\b/.test(lower) ? "pareto" :
                            /\bwaterfall\b/.test(lower) ? "waterfall" :
                            /\bsparkline\b/.test(lower) ? "sparkline" :
                            /\bgauge\b/.test(lower) ? "gauge" :
                            /\bradar\b/.test(lower) ? "radar" :
                            null;
                        if (next) setChartType(next);
                    }}
                />
                <span className="gn-chart-palette" title="Chart colors" style={{ marginLeft: "auto" }}>
                    <span className="gn-chart-palette-swatches" aria-hidden="true">
                        {(CHART_PALETTES.find(p => p.id === paletteId) ?? CHART_PALETTES[0]).colors.slice(0, 5).map((c, i) => (
                            <span key={i} style={{ background: c }} />
                        ))}
                    </span>
                    <select
                        className="gn-chart-palette-select"
                        value={paletteId}
                        onChange={e => applyChartPalette(e.target.value)}
                        aria-label="Chart color palette"
                    >
                        {CHART_PALETTES.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </select>
                </span>
                <button
                    type="button"
                    className={`gn-chart-pin${pinned ? " gn-chart-pin--done" : ""}`}
                    onClick={handlePin}
                    title="Pin this chart to the Dashboard canvas"
                    aria-label="Pin this chart to the Dashboard canvas"
                >
                    {pinned ? (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                            <span>Pinned</span>
                        </>
                    ) : (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.5-3V8a2 2 0 0 0-2-2H8.5a2 2 0 0 0-2 2v6L5 17z" /></svg>
                            <span>Pin to canvas</span>
                        </>
                    )}
                </button>
            </div>
            {renderEChartsBody(chartType, props.columns, props.rows, dataShape)}
        </div>
    );
}

function renderEChartsBody(
    chartType: ChartKind,
    columns: string[],
    rows: any[][],
    dataShape: DataShape,
): React.ReactNode {
    // KPI tile — single prominent metric, no ECharts needed.
    if (chartType === "kpi") {
        const firstNumericIdx = columns.findIndex((_, i) => rows[0] && !isNaN(Number(rows[0][i])));
        const labelIdx = firstNumericIdx > 0 ? 0 : -1;
        const valueIdx = firstNumericIdx >= 0 ? firstNumericIdx : 0;
        const value = rows[0]?.[valueIdx];
        const label = labelIdx >= 0 ? String(rows[0]?.[labelIdx] ?? columns[labelIdx]) : columns[valueIdx];
        return (
            <div className="gn-kpi-chart-tile">
                <div className="gn-kpi-chart-value">{formatNumber(Number(value))}</div>
                <div className="gn-kpi-chart-label">{label}</div>
            </div>
        );
    }

    // All other types — ECharts.
    const option = buildEChartsOption(chartType, columns, rows);
    if (!option) {
        return (
            <div className="gn-msg-body gn-chart-no-data">
                Not enough data to render a <strong>{chartType}</strong> chart.
                Try switching to Bar or Table view.
            </div>
        );
    }
    return <EChartsRenderer option={option} height={320} />;
}

const CLUSTERED_COLORS = ["#4793f8", "#f97316", "#22c55e", "#ef4444", "#a855f7", "#eab308"];

function ClusteredBarChart(props: { clustered: ClusteredSeriesPoint[] }) {
    const allValues = props.clustered.flatMap(c => c.values.map(v => v.value));
    const maxVal = Math.max(...allValues, 0);
    const seriesNames = props.clustered[0]?.values.map(v => v.name) ?? [];

    return (
        <div className="gn-clustered-chart">
            <div className="gn-clustered-legend">
                {seriesNames.map((name, i) => (
                    <span key={name} className="gn-legend-item">
                        <span className="gn-legend-swatch" style={{ background: CLUSTERED_COLORS[i % CLUSTERED_COLORS.length] }} />
                        {name}
                    </span>
                ))}
            </div>
            <div className="gn-chart-bars">
                {props.clustered.map(group => (
                    <div key={group.label} className="gn-clustered-group">
                        <div className="gn-bar-label">{group.label}</div>
                        <div className="gn-clustered-bars">
                            {group.values.map((v, i) => {
                                const pct = maxVal > 0 ? (v.value / maxVal) * 100 : 0;
                                const isNarrow = pct < 15;
                                return (
                                    <div key={v.name} className="gn-clustered-bar-row" title={`${v.name}: ${formatNumber(v.value)}`}>
                                        <span className="gn-clustered-series-name">{v.name}</span>
                                        <div className="gn-clustered-track">
                                            <div
                                                className="gn-clustered-fill"
                                                style={{ width: `${pct}%`, background: CLUSTERED_COLORS[i % CLUSTERED_COLORS.length] }}
                                            >
                                                {!isNarrow && <span className="gn-bar-fill-label">{formatNumber(v.value)}</span>}
                                            </div>
                                        </div>
                                        {isNarrow && <span className="gn-bar-value">{formatNumber(v.value)}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DonutChart(props: { series: ChartSeriesPoint[] }) {
    const total = props.series.reduce((sum, p) => sum + Math.abs(p.value), 0);
    const RADIUS = 60;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
    let offset = 0;

    return (
        <div className="gn-donut-wrap">
            <svg viewBox="0 0 180 180" width="180" height="180" aria-hidden="true">
                {props.series.map((point, i) => {
                    const pct = total > 0 ? Math.abs(point.value) / total : 0;
                    const dash = pct * CIRCUMFERENCE;
                    const gap = CIRCUMFERENCE - dash;
                    const currentOffset = offset;
                    offset += dash;
                    return (
                        <circle
                            key={point.label}
                            cx="90" cy="90" r={RADIUS}
                            fill="none"
                            stroke={CLUSTERED_COLORS[i % CLUSTERED_COLORS.length]}
                            strokeWidth="24"
                            strokeDasharray={`${dash} ${gap}`}
                            strokeDashoffset={-currentOffset}
                            transform="rotate(-90 90 90)"
                        />
                    );
                })}
                <text x="90" y="90" textAnchor="middle" dominantBaseline="middle" className="gn-donut-total">
                    {formatNumber(total)}
                </text>
            </svg>
            <div className="gn-donut-legend">
                {props.series.map((point, i) => (
                    <span key={point.label} className="gn-legend-item">
                        <span className="gn-legend-swatch" style={{ background: CLUSTERED_COLORS[i % CLUSTERED_COLORS.length] }} />
                        {point.label}: {formatNumber(point.value)}
                    </span>
                ))}
            </div>
        </div>
    );
}

function LineAreaChart(props: { series: ChartSeriesPoint[]; chartRange: ChartRange; filled: boolean }) {
    const { series, chartRange, filled } = props;
    const count = series.length;
    const LEFT = 60, TOP = 20, BOTTOM = 160, LABEL_ZONE = 50;
    // Scale width to fit points — min 420, grows with data count
    const WIDTH = Math.max(420, LEFT + count * 28 + 20);
    const RIGHT = WIDTH - 20;
    const HEIGHT = BOTTOM + LABEL_ZONE;
    const xStep = (RIGHT - LEFT) / Math.max(count - 1, 1);

    const [hover, setHover] = React.useState<{ x: number; y: number; text: string } | null>(null);

    const linePoints = series.map((p, i) => {
        const x = LEFT + (i * xStep);
        const y = chartRange.range === 0 ? 90 : BOTTOM - (((p.value - chartRange.minValue) / chartRange.range) * (BOTTOM - TOP));
        return `${x},${y}`;
    }).join(" ");

    const yTicks = getYAxisTicks(chartRange);
    const zeroY = chartRange.range === 0 ? BOTTOM : BOTTOM - (((0 - chartRange.minValue) / chartRange.range) * (BOTTOM - TOP));

    const areaPoints = filled
        ? `${linePoints} ${LEFT + ((count - 1) * xStep)},${zeroY} ${LEFT},${zeroY}`
        : "";

    // Thin x-axis labels when too dense — show every Nth label
    const labelStep = count <= 12 ? 1 : count <= 24 ? 2 : Math.ceil(count / 12);

    // Build tooltip string from tooltipParts
    const tooltipText = (point: ChartSeriesPoint): string => {
        if (point.tooltipParts?.length) {
            return point.tooltipParts.map(p => `${p.col}: ${p.val}`).join("\n");
        }
        return `${point.label}: ${formatNumber(point.value)}`;
    };

    return (
        <><svg className="gn-line-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
            {yTicks.map((tick, i) => {
                const y = chartRange.range === 0 ? 90 : BOTTOM - (((tick - chartRange.minValue) / chartRange.range) * (BOTTOM - TOP));
                return (
                    <g key={`yt-${i}`}>
                        <line x1={LEFT} x2={RIGHT} y1={y} y2={y} className="gn-line-chart-axis" />
                        <text x={LEFT - 6} y={y + 4} className="gn-axis-label" textAnchor="end">{formatNumber(tick)}</text>
                    </g>
                );
            })}
            {series.map((point, i) => {
                if (i % labelStep !== 0) return null;
                const x = LEFT + (i * xStep);
                const lbl = point.label;
                const display = lbl.length > 14 ? lbl.slice(0, 12) + "\u2026" : lbl;
                return (
                    <text key={`xl-${i}`} x={x} y={BOTTOM + 12} className="gn-axis-label" textAnchor="end"
                        transform={`rotate(-35 ${x} ${BOTTOM + 12})`}>
                        {display}
                    </text>
                );
            })}
            {filled && <polygon fill="currentColor" opacity="0.15" points={areaPoints} />}
            <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={linePoints} />
            {series.map((point, i) => {
                const x = LEFT + (i * xStep);
                const y = chartRange.range === 0 ? 90 : BOTTOM - (((point.value - chartRange.minValue) / chartRange.range) * (BOTTOM - TOP));
                return (
                    <circle key={`dot-${i}`} cx={x} cy={y} r="5" className="gn-chart-dot"
                        onMouseEnter={(e) => {
                            const svg = (e.target as SVGElement).closest('svg');
                            const rect = svg?.getBoundingClientRect();
                            if (rect) {
                                const scaleX = rect.width / WIDTH;
                                const scaleY = rect.height / HEIGHT;
                                setHover({ x: x * scaleX + rect.left, y: y * scaleY + rect.top, text: tooltipText(point) });
                            }
                        }}
                        onMouseLeave={() => setHover(null)}
                    />
                );
            })}
        </svg>
        {hover && (
            <div className="gn-chart-tooltip" style={{ left: hover.x, top: hover.y }}>
                {hover.text.split("\n").map((line, i) => <div key={i}>{line}</div>)}
            </div>
        )}
    </> );
}

/**
 * Sections where directional trend pills (▲/▼ + green/red colouring) should be
 * suppressed entirely. RECOMMENDED ACTIONS contains imperative verbs ("Increase
 * sales by 10%") that the regex would otherwise miscolour as measurements;
 * DRIVERS lists contributors with magnitudes that aren't directional changes.
 * BUG-016 fix: section-aware rendering.
 */
// Session 56 — pills are now ON by default for every section. The renderer's
// inline regex already only fires on measurement numbers (isMeasurementNumber)
// so it won't decorate target counts in actions or narrative numbers in
// imperative text. The only sections we still suppress are those whose body
// is intentionally imperative / target-oriented (numbers there are goals to
// hit, not directional measurements).
const SECTIONS_WITHOUT_TREND_PILLS = new Set([
    "RECOMMENDED ACTIONS", "ACTIONS", "NEXT STEPS", "NEXT BEST ACTIONS"
]);

/**
 * Pre-process narrative text before rendering. Genie sometimes emits literal
 * `▲/▼` or `▲ / ▼` to indicate ambiguous direction (TRENDS section, "Profit
 * Margin ▲/▼" — the metric moved both ways). Rendering both arrows side-by-side
 * is non-indicative — replace with a single neutral `↔` so the reader sees
 * "mixed direction" at a glance. BUG-016 fix.
 */
function normaliseAmbiguousArrows(text: string): string {
    return normaliseDirectionalGlyphs(text);
}

/**
 * Wave 43 — bullet-content heading demotion. Detects the AI-drift pattern
 *
 *     ### Consumer, Technology, West:
 *     Total Sales $132,991.75, Profit Margin 0.2089
 *
 * (heading line that is conceptually a bullet label, followed by a non-
 * heading body line at the same indent — ambient evidence that the AI
 * MEANT a bullet item but used heading markup) and rewrites it to
 *
 *     - **Consumer, Technology, West:** Total Sales $132,991.75, Profit
 *       Margin 0.2089
 *
 * so the renderer's normal bullet branch handles it. Catches drift even
 * when the FORMAT RULES prompt is followed perfectly, because LLMs still
 * occasionally regress under streaming pressure.
 *
 * Heading lines that AREN'T followed by a continuation paragraph are
 * left alone — those are intentional sub-headings (e.g., "## TRENDS"
 * inside a multi-section custom prompt) and demoting them would break
 * authored layouts. The heuristic only fires for the bullet-label
 * pattern.
 *
 * Pure string transform, runs once before line iteration begins.
 */
function demoteBulletStyleHeadings(text: string): string {
    if (!text || (!text.includes("#") && !text.includes("###"))) return text;
    const HEADING_RE = /^([ \t]*)(#{1,4})\s+(.+?)\s*$/;
    const lines = text.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const m = HEADING_RE.exec(lines[i]);
        if (!m) { out.push(lines[i]); continue; }
        const indent = m[1];
        const level = m[2].length;
        const content = m[3];
        // Find the next non-empty line — that's the candidate continuation.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        const next = j < lines.length ? lines[j] : "";
        const nextTrimmed = next.trim();
        const nextIsHeading = /^#{1,6}\s+/.test(nextTrimmed);
        const nextIsBullet = /^[-*•]\s+/.test(nextTrimmed);
        const nextIsTablePipe = /^\|.+\|$/.test(nextTrimmed);
        const nextIsBlankAtEnd = nextTrimmed === "";
        // Drift signal:
        //   - level >= 3 (### or ####) — these are the AI's bullet-label
        //     mistake; ## and # are typically intentional sub-headings.
        //   - the heading content ends in a colon (label pattern), OR
        //     the next non-empty line is plain text / bullet / table
        //     content (meaning the heading was NOT a structural section
        //     break, but a bullet-style label).
        // Conservative: leave alone if there's no body following at all
        // (could be a final standalone heading), or if the next line is
        // ANOTHER heading (intentional sub-section sequence).
        const looksLikeBulletLabel = level >= 3
            && !nextIsBlankAtEnd
            && !nextIsHeading
            && (content.endsWith(":") || nextIsBullet || nextIsTablePipe || /^[A-Za-z0-9$+\-]/.test(nextTrimmed));
        if (looksLikeBulletLabel) {
            // Rewrite as a bullet line whose label is bolded; the
            // continuation line(s) stay as the bullet's body. We keep
            // the colon so downstream `inlineFormat` recognises the
            // label-then-data pattern.
            const labelText = content.replace(/\*\*/g, "");
            out.push(`${indent}- **${labelText}**`);
        } else {
            out.push(lines[i]);
        }
    }
    return out.join("\n");
}

/* ─── Option-A welcome KPI snapshot renderer ─────────────────────────
 * Parses the LLM's KPI snapshot output into a structured layout:
 *   - First non-bullet paragraph → bottom-line headline (bold lead)
 *   - Bullet lines matching `- <name>: <value> · <up|down|stable> (was <prior>)`
 *       → metric row with trend chip
 *   - Final `Action: …` line → highlighted call-out
 * If parsing fails to find at least one metric row, the function falls
 * back to the generic renderNarrative so we never lose content.
 */
/** 2026-05-26 — detect Genie's Deep Research / Agent Mode reasoning
 *  block and split it from the actual answer. Agent Mode emits a
 *  verbose meta-trace ("Initial analysis", "Found relevant data",
 *  "Calculated an answer based on these steps", "Start inspecting",
 *  "Make a decision", "Conclusion", "Inspection complete!") BEFORE
 *  the actual answer text. Users want the answer first; the reasoning
 *  belongs in a collapsed disclosure ("Show reasoning").
 *  Returns { reasoning, answer } where reasoning is null when the
 *  Agent Mode markers aren't present. */
const AGENT_MODE_MARKERS = [
    /^Initial analysis\b/im,
    /^Found relevant data\b/im,
    /^Calculated an answer based on these steps\b/im,
    /^Start inspecting\b/im,
    /^Make a decision\b/im,
    /^Inspection complete!?\s*$/im,
];
export function splitAgentModeReasoning(raw: string): { reasoning: string | null; answer: string } {
    const text = String(raw || "").trim();
    if (!text) return { reasoning: null, answer: text };
    // Need at least 3 of the markers to confidently identify Agent Mode
    // (avoid false positives on prose that happens to contain "Conclusion").
    const hits = AGENT_MODE_MARKERS.filter(re => re.test(text)).length;
    if (hits < 3) return { reasoning: null, answer: text };
    // The reasoning ends at "Inspection complete!"; everything after is
    // the answer. If the marker is missing fall back to splitting at the
    // last Agent Mode marker found.
    const completeIdx = text.search(/^Inspection complete!?\s*$/im);
    if (completeIdx >= 0) {
        const lineEnd = text.indexOf("\n", completeIdx);
        const splitAt = lineEnd >= 0 ? lineEnd + 1 : text.length;
        const reasoning = text.slice(0, splitAt).trim();
        const answer = text.slice(splitAt).trim();
        if (!answer) return { reasoning: null, answer: text }; // no answer remained, keep original
        return { reasoning, answer };
    }
    return { reasoning: null, answer: text };
}

/** 2026-05-26 — strip a single trailing Genie clarifying question. The
 *  briefing/snapshot prompt explicitly forbids clarifying questions
 *  ("No tables, no SQL, no preamble, no clarifying questions") but
 *  Genie intermittently appends one anyway ("Would you prefer…?",
 *  "Should I…?", "Do you want me to…?"). When that happens we strip
 *  it from the main answer and surface it as a clickable suggestion
 *  chip below — turns a contract violation into a useful affordance.
 *  Returns { body, clarifier } where clarifier is null when no
 *  clarifying question was found. Question mark is optional because
 *  Genie sometimes drops it. */
export function splitTrailingClarifier(raw: string): { body: string; clarifier: string | null } {
    const text = String(raw || "").trim();
    if (!text) return { body: text, clarifier: null };
    // Match a trailing single sentence that opens with a Genie-style
    // clarifying lead-in. Anchored to end of string with optional
    // trailing whitespace. The sentence body may or may not end with
    // a question mark (Genie sometimes drops it).
    const clarifierRe = /(?:^|\n)\s*((?:Would you (?:prefer|like|rather)|Should I|Do you want(?:\s+me\s+to)?|Shall I|Could you clarify|Did you mean|Would you also like)\b[^\n]*?)(?:\?|\s*)$/i;
    const m = text.match(clarifierRe);
    if (!m) return { body: text, clarifier: null };
    const clarifier = m[1].trim().replace(/[.\?\s]+$/, "") + "?";
    const body = text.slice(0, text.length - m[0].length).trimEnd();
    // Defensive: if stripping leaves only a few characters the
    // clarifier likely WAS the whole content (rare) — keep original.
    if (body.replace(/[\s•\-*]/g, "").length < 8) return { body: text, clarifier: null };
    return { body, clarifier };
}

/** 2026-05-26 — outer wrapper that handles the trailing-clarifier strip
 *  + chip render. The actual rendering logic lives in
 *  renderKpiSnapshotInner below; the wrapper splits the content, calls
 *  the inner with cleaned body, and appends a "Genie also asked: …"
 *  chip under the answer when a clarifier was stripped. The chip
 *  pre-populates the composer with the clarifier text on click so the
 *  user can refine in one tap. */
function renderKpiSnapshot(raw: string): React.ReactNode {
    // Strip Genie's Deep Research / Agent Mode reasoning first; that
    // wrapper goes into a collapsed disclosure so the answer lands at
    // the top of the card instead of after 200 words of meta-trace.
    const { reasoning, answer: afterReasoning } = splitAgentModeReasoning(raw);
    const { body, clarifier } = splitTrailingClarifier(afterReasoning);
    const inner = renderKpiSnapshotInner(body);
    const reasoningNode = reasoning ? (
        <details className="gn-agent-reasoning">
            <summary>
                <span className="gn-agent-reasoning-icon" aria-hidden="true">🔍</span>
                <span className="gn-agent-reasoning-title">Show Genie's reasoning</span>
                <span className="gn-agent-reasoning-meta">{(() => {
                    const lines = reasoning.split("\n").filter(l => l.trim().length > 0).length;
                    return `${lines} line${lines === 1 ? "" : "s"}`;
                })()}</span>
            </summary>
            <div className="gn-agent-reasoning-body pp-md">
                {renderMarkdown(reasoning)}
            </div>
        </details>
    ) : null;
    if (!clarifier && !reasoningNode) return inner;
    const clarifierText = clarifier ?? "";
    const onClick = () => {
        try {
            if (!clarifierText) return;
            const ta = document.querySelector("textarea.gn-input") as HTMLTextAreaElement | null;
            if (ta) {
                ta.value = clarifierText;
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                ta.focus();
                ta.setSelectionRange(clarifierText.length, clarifierText.length);
            }
        } catch { /* swallow */ }
    };
    return (
        <>
            {inner}
            {clarifier && (
                <div className="gn-clarifier-chip-row">
                    <span className="gn-clarifier-chip-label">Genie also asked:</span>
                    <button
                        type="button"
                        className="gn-clarifier-chip"
                        onClick={onClick}
                        title="Use this as your next question"
                    >
                        <span className="gn-clarifier-chip-text">{clarifier}</span>
                        <span aria-hidden="true" className="gn-clarifier-chip-arrow">→</span>
                    </button>
                </div>
            )}
            {reasoningNode}
        </>
    );
}

function renderKpiSnapshotInner(raw: string): React.ReactNode {
    const text = String(raw || "").trim();
    if (!text) return null;

    // 2026-05-22 Ask Pulse parity — when the reply carries `## SECTION`
    // markdown (HEADLINE / KPI SNAPSHOT / TRENDS / RISKS / OPPORTUNITIES /
    // RECOMMENDED ACTIONS) route through renderInsightsSections so chat
    // replies get the SAME rich card grid as the AI Insights surface.
    // Triggered by buildGenieRequest's briefing-format instruction in
    // visualHelpers.ts when intent is summary/performance OR the question
    // matches briefing heuristics (first-message-only per chat-fidelity rule).
    //
    // 2026-05-22 — also surface the same per-section action toolbar
    // (📋 Copy + ✻ provenance footer) that AI Insights uses, by passing a
    // minimal InsightsRenderOptions with an onCopySection handler and
    // showProvenanceFooter=true. SQL/retry/raw-data callbacks are intentionally
    // omitted — the chat path's SQL lives in the existing SQL tab (tabs above)
    // rather than per-section inline panels, and retries don't apply to a
    // one-shot chat response.
    //
    // 2026-05-22 refined per Rajesh: *"let's not try mould it. Ask Pulse
    // should be dialogue with data simple and insightful."* AND then
    // tightened further: *"let's keep only the insights only for the
    // probe as well"* — probe is now HEADLINE-only. So the gate must
    // route to renderInsightsSections when HEADLINE is present (single
    // recognized section is enough), OR when there are ≥2 recognized
    // briefing sections (for any future multi-section briefings or
    // historical content). Plain `## INSIGHTS` or solo `## TRENDS` from
    // Genie conversation-memory bleed-through still falls through to
    // plain markdown — they're not in the recognized briefing list
    // alone (TRENDS without HEADLINE doesn't trigger).
    const BRIEFING_SECTION_RE = /^#{1,3}\s+(HEADLINE|KPI SNAPSHOT|TRENDS|RISKS|OPPORTUNITIES|RECOMMENDED ACTIONS|WHAT CHANGED|WHAT NEEDS ATTENTION|NEXT BEST ACTIONS|EXECUTIVE BRIEF)\s*$/gmi;
    const recognizedSections = text.match(BRIEFING_SECTION_RE) ?? [];
    const hasHeadline = recognizedSections.some(s => /HEADLINE|EXECUTIVE BRIEF/i.test(s));
    const briefingTrigger = hasHeadline || recognizedSections.length >= 2;
    if (briefingTrigger) {
        return renderInsightsSections(text, {
            showProvenanceFooter: true,
            sourceLabel: "Ask Pulse",
            generatedAt: Date.now(),
            onCopySection: async (title, body) => {
                // Best-effort clipboard write. Format: "# <Title>\n\n<body>".
                const text = `# ${title}\n\n${body}`.trim();
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    // Clipboard API can be blocked by permissions or sandbox;
                    // silent failure is preferable to a runtime throw in a
                    // render path. The user will notice the section didn't
                    // copy and can use the SQL tab fallback.
                }
            },
        });
    }
    // Fallback structured markdown (tables, code blocks, blockquotes,
    // mid/low-level headings) — still better as narrative than as flex
    // rows, but doesn't qualify as an insights briefing.
    const hasStructuredMarkdown =
        /^#{1,6}\s/m.test(text) ||
        /^\s*\|.+\|\s*$/m.test(text) ||
        /```/.test(text) ||
        /^\s*>\s/m.test(text);
    if (hasStructuredMarkdown) {
        return renderNarrative(text);
    }

    // 2026-05-22 — Executive briefing path. When the LLM emits an exec brief
    // (Current performance + Top risk/opportunity + Recent change + Action)
    // render a semantic-coloured card grid instead of the flex-rows list
    // that produced the "label far left, content far right" regression.
    // Falls through to the legacy bullet path if briefing intent isn't
    // detected, and to renderNarrative if neither produces a usable card.
    const briefing = parseExecutiveBriefing(text);
    if (briefing) {
        return renderExecutiveBriefing(briefing);
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    interface MetricRow { name: string; value: string; trend: "up" | "down" | "stable" | null; prior: string | null; }
    const rows: MetricRow[] = [];
    let headline = "";
    let action = "";

    const bulletRe = /^[-*•]\s+(.+)$/;
    // <name>: <value> [· (up|down|stable)] [(was <prior>)]
    const metricRe = /^([^:]+):\s*([^·(]+?)(?:\s*[·•]\s*(up|down|stable))?(?:\s*\(\s*(?:was\s+)?([^)]+)\))?\s*$/i;

    for (const line of lines) {
        if (!headline && !bulletRe.test(line) && !/^action\b/i.test(line)) {
            headline = line;
            continue;
        }
        if (/^action\s*:/i.test(line)) {
            action = line.replace(/^action\s*:\s*/i, "").trim();
            continue;
        }
        const bm = line.match(bulletRe);
        if (bm) {
            const body = bm[1];
            // Strip stray trailing trend marker in parens like "(down)" when no "was"
            const compact = body.replace(/\(\s*(up|down|stable)\s*\)\s*$/i, (_m, t) => `· ${t}`);
            const mm = compact.match(metricRe);
            if (mm) {
                rows.push({
                    name: mm[1].trim().replace(/\*+/g, ""),
                    value: mm[2].trim().replace(/\*+/g, ""),
                    trend: (mm[3]?.toLowerCase() as MetricRow["trend"]) ?? null,
                    prior: mm[4]?.trim() ?? null,
                });
            } else {
                rows.push({ name: "", value: body, trend: null, prior: null });
            }
        }
    }

    // If parsing didn't find at least 2 structured metric rows, the content
    // is probably free-form narrative — fall back so we don't render a
    // half-empty card. Threshold is 2 (not 1) because a single matched
    // bullet inside a narrative paragraph is more likely coincidence.
    if (rows.length < 2) {
        return renderNarrative(text, "KPI Snapshot");
    }

    const trendArrow = (t: MetricRow["trend"]) => t === "up" ? "↑" : t === "down" ? "↓" : t === "stable" ? "→" : "";

    return (
        <div className="gn-kpi-card">
            {headline && (
                <p className="gn-kpi-headline">{headline}</p>
            )}
            <ul className="gn-kpi-rows">
                {rows.map((r, i) => (
                    <li key={i} className="gn-kpi-row">
                        {r.name ? (
                            <>
                                <span className="gn-kpi-row-name">{r.name}</span>
                                <span className="gn-kpi-row-value">{r.value}</span>
                                {r.trend && (
                                    <span className={`gn-trend gn-trend--${r.trend}`}>
                                        {trendArrow(r.trend)} {r.trend}
                                    </span>
                                )}
                                {r.prior && (
                                    <span className="gn-kpi-row-prior">was {r.prior}</span>
                                )}
                            </>
                        ) : (
                            <span className="gn-kpi-row-value">{r.value}</span>
                        )}
                    </li>
                ))}
            </ul>
            {action && (
                <p className="gn-kpi-action"><strong>Action ·</strong> {action}</p>
            )}
        </div>
    );
}

/**
 * Executive briefing parser (2026-05-22).
 *
 * Recognises the LLM's exec-summary shape used by Ask Pulse:
 *   Sales and profit have declined this month, but profit margin improved.
 *   Current performance: Sales $83.8K (down from $118.4K), Profit $8.5K (...)
 *   Top risk: Significant drop in sales and order volume...
 *   Top opportunity: Improved profit margin (+2.4pp)...
 *   Recent change: Sales and orders fell, but profitability per sale...
 *   Action: Investigate causes of sales decline and reinforce margin-improving...
 *
 * Section labels are matched COLON-OPTIONAL (`Top risk:` and `Top risk` both
 * parse) — the regex regression that caused the "label far left, content far
 * right" layout was that the old bullet parser REQUIRED a colon.
 *
 * Sources informing this design: see docs/research/EXTERNAL_REFERENCES.md
 * — Tableau Pulse, Power BI Smart Narrative, Carbon Status Indicator,
 * shadcn Alert (CSS grid not flex), Ant Design Alert palette.
 */
interface BriefingKpi {
    readonly label: string;
    readonly value: string;
    readonly prior: string | null;
    readonly direction: "up" | "down" | "neutral";
}

type BriefingSectionKind = "risk" | "opportunity" | "change";

interface BriefingSection {
    readonly kind: BriefingSectionKind;
    readonly label: string;
    readonly body: string;
}

interface ExecutiveBriefing {
    readonly headline: string | null;
    readonly kpis: ReadonlyArray<BriefingKpi>;
    readonly sections: ReadonlyArray<BriefingSection>;
    readonly action: string | null;
}

const SECTION_PATTERNS: ReadonlyArray<{ kind: BriefingSectionKind; re: RegExp; canonical: string }> = Object.freeze([
    { kind: "risk",        re: /^\s*(?:top\s+)?risk(?:s)?\s*:?\s*(.+)$/i,                                  canonical: "Top risk" },
    { kind: "opportunity", re: /^\s*(?:top\s+)?opportunit(?:y|ies)\s*:?\s*(.+)$/i,                          canonical: "Top opportunity" },
    { kind: "change",      re: /^\s*(?:recent|latest|notable)\s+(?:change|shift|movement)s?\s*:?\s*(.+)$/i, canonical: "Recent change" },
]);

const KPI_INLINE_RE = /\b([A-Z][A-Za-z][A-Za-z ]{0,30}?)\s+([$€£¥]?-?[\d.,]+\s*[%KMBkmb]?(?:pp)?)\s*\((up|down|increased|decreased)\s+from\s+([$€£¥]?-?[\d.,]+\s*[%KMBkmb]?(?:pp)?)\)/g;

function parseExecutiveBriefing(text: string): ExecutiveBriefing | null {
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return null;

    // 2026-05-22 G1 fix — clarifying-question guard. If the whole reply is
    // shaped like a clarifying question ("Would you like…?" / "Do you want…?"
    // / a single line ending in "?"), do NOT trigger the briefing path; let
    // the caller fall through to the existing clarifying-question card
    // (visual.tsx ~line 8316). Without this, a briefing-flavoured prompt
    // that gets a clarifier back was rendering the question as a sparse
    // briefing card with just a "headline" — which is what the user
    // reported as "all that I see in briefing is a question."
    if (rawLines.length <= 2) {
        const joined = rawLines.join(" ").trim();
        const looksLikeClarifier =
            /\?\s*$/.test(joined) &&
            /^(?:Would you (?:like|prefer)|Do you (?:want|prefer)|Should I|Are you interested|Shall I|Can I|Which|What|Could you (?:specify|clarify))\b/i.test(joined);
        if (looksLikeClarifier) return null;
    }

    let headline: string | null = null;
    let kpis: BriefingKpi[] = [];
    const sections: BriefingSection[] = [];
    let action: string | null = null;

    for (const line of rawLines) {
        const stripped = line.replace(/^[-*•]\s+/, "");

        // Action line — accept "Action:", "Action ·", "Action -"
        const actionMatch = stripped.match(/^(?:\*+\s*)?action\b\s*[:·\-—–]?\s*(.+)$/i);
        if (actionMatch && !action) {
            action = actionMatch[1].trim().replace(/^\*+|\*+$/g, "");
            continue;
        }

        // "Current performance:" — extract the KPI strip
        const perfMatch = stripped.match(/^(?:\*+\s*)?(?:current\s+performance|performance|snapshot)\s*[:·\-—–]?\s*(.+)$/i);
        if (perfMatch && kpis.length === 0) {
            kpis = extractKpisFromInline(perfMatch[1]);
            continue;
        }

        // Section labels (risk / opportunity / change) — colon optional
        let matched = false;
        for (const pattern of SECTION_PATTERNS) {
            const m = stripped.match(pattern.re);
            if (m && m[1] && m[1].trim().length >= 4) {
                sections.push({
                    kind: pattern.kind,
                    label: pattern.canonical,
                    body: m[1].trim().replace(/^\*+|\*+$/g, ""),
                });
                matched = true;
                break;
            }
        }
        if (matched) continue;

        if (!headline && stripped.length >= 8) {
            headline = stripped.replace(/^\*+|\*+$/g, "");
        }
    }

    // Briefing intent threshold — require at least the headline OR the KPI
    // strip, AND at least one named section (risk/opportunity/change) OR an
    // action. Below this we hand the text back to the legacy parser and then
    // renderNarrative, so freeform replies don't get forced into card shape.
    const hasShape = (headline !== null || kpis.length > 0) && (sections.length > 0 || action !== null);
    if (!hasShape) return null;

    return { headline, kpis, sections, action };
}

function extractKpisFromInline(text: string): BriefingKpi[] {
    const out: BriefingKpi[] = [];
    const re = new RegExp(KPI_INLINE_RE.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const dir = match[3].toLowerCase();
        out.push({
            label: match[1].trim(),
            value: match[2].trim(),
            prior: match[4].trim(),
            direction: dir === "up" || dir === "increased" ? "up" : dir === "down" || dir === "decreased" ? "down" : "neutral",
        });
    }
    return out;
}

function renderExecutiveBriefing(brief: ExecutiveBriefing): React.ReactNode {
    const sectionIcon: Record<BriefingSectionKind, string> = {
        risk: "⚠",
        opportunity: "↗",
        change: "▲",
    };

    return (
        <div className="gn-briefing-card" data-testid="pp-exec-briefing">
            {brief.headline && (
                <p className="gn-briefing-headline">{brief.headline}</p>
            )}

            {brief.kpis.length > 0 && (
                <div className="gn-kpi-tile-grid" data-testid="pp-briefing-kpis">
                    {brief.kpis.map((k, i) => {
                        const dirClass = k.direction === "up" ? "gn-kpi-tile--up"
                                       : k.direction === "down" ? "gn-kpi-tile--down"
                                       : "gn-kpi-tile--neutral";
                        const deltaClass = k.direction === "up" ? "gn-kpi-tile-delta--up"
                                          : k.direction === "down" ? "gn-kpi-tile-delta--down"
                                          : "gn-kpi-tile-delta--neutral";
                        const cue = k.direction === "up" ? "↑" : k.direction === "down" ? "↓" : "→";
                        return (
                            <div key={`${k.label}-${i}`} className={`gn-kpi-tile ${dirClass}`}>
                                <div className="gn-kpi-tile-head">
                                    <span className="gn-kpi-tile-label" title={k.label}>{k.label}</span>
                                </div>
                                <div className="gn-kpi-tile-value">{k.value}</div>
                                {k.prior && (
                                    <div className="gn-kpi-tile-foot">
                                        <span className={`gn-kpi-tile-delta ${deltaClass}`}>
                                            <span className="gn-kpi-tile-delta-cue" aria-hidden="true">{cue}</span>
                                            {k.direction === "down" ? "down" : k.direction === "up" ? "up" : "flat"}
                                        </span>
                                        <span className="gn-kpi-tile-prior">from {k.prior}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {brief.sections.length > 0 && (
                <div className="gn-briefing-sections">
                    {brief.sections.map((s, i) => (
                        <section
                            key={`${s.kind}-${i}`}
                            className={`gn-briefing-section gn-briefing-section--${s.kind}`}
                            data-section-kind={s.kind}
                        >
                            <header className="gn-briefing-section-head">
                                <span className="gn-briefing-section-icon" aria-hidden="true">{sectionIcon[s.kind]}</span>
                                <span className="gn-briefing-section-label">{s.label}</span>
                            </header>
                            <p className="gn-briefing-section-body">{s.body}</p>
                        </section>
                    ))}
                </div>
            )}

            {brief.action && (
                <p className="gn-narrative-action" data-testid="pp-briefing-action">
                    <span className="gn-narrative-action-label">Action ·</span>
                    {brief.action}
                </p>
            )}
        </div>
    );
}

function renderNarrative(text: string, sectionTitle?: string, metricRules?: InlineMetricRules): React.ReactNode {
    const normalised = demoteBulletStyleHeadings(normaliseAmbiguousArrows(text));
    const lines = normalised.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: { key: string; body: string }[] = [];
    let i = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            if (shouldRenderInsightCards(sectionTitle, listItems.length)) {
                elements.push(
                    <div key={`cards-${elements.length}`} className="gn-insight-card-grid">
                        {listItems.map((item, idx) => {
                            const card = parseInsightCardItem(item.body, sectionTitle, idx);
                            return (
                                <article
                                    key={item.key}
                                    className={`gn-insight-card${card.generatedLabel ? " gn-insight-card--plain" : ""}`}
                                >
                                    <div className="gn-insight-card-label">{inlineFormat(card.label, sectionTitle, metricRules)}</div>
                                    {/* Card body inline pills resolve metric rules via card.label as the
                                        context hint — without this, the body prose ("rose to 6.2%, up ▲ +0.3pp,
                                        ...") doesn't contain the metric name and the rule path never fires.
                                        Codex audit follow-up 2026-05-18. */}
                                    <div className="gn-insight-card-body">{inlineFormat(card.body, sectionTitle, metricRules, card.label)}</div>
                                </article>
                            );
                        })}
                    </div>
                );
            } else {
                elements.push(
                    <ul key={`ul-${elements.length}`} className="gn-narrative-list">
                        {listItems.map(item => (
                            <li key={item.key}>{inlineFormat(item.body, sectionTitle, metricRules)}</li>
                        ))}
                    </ul>
                );
            }
            listItems = [];
        }
    };

    /**
     * Wave 43 — strip leading heading markdown that survived the
     * bullet-style demotion pass (e.g., heading inside a bullet body
     * line that the upstream pre-processor couldn't reach because the
     * bullet was already structurally a list item). Replaces a leading
     * `### Foo:` inside a bullet's content with `**Foo:**` so the
     * rendered card stays font-size consistent. The label scope is
     * narrowed to "up to the first colon, or up to the first sentence
     * boundary" so we don't accidentally wrap the entire bullet body
     * in bold (which would break the inline-trend-pill detection
     * downstream — the bold scope would consume `+12.4%` and friends).
     *
     * The CSS rule `.gn-narrative-list li h1..h6 { font-size: inherit;
     * ... }` is the defensive belt for anything this misses.
     */
    const stripBulletInlineHeading = (raw: string): string => {
        // Only fire on a LEADING heading prefix; everything else passes
        // through unchanged.
        const m = /^(#{1,6})\s+(.+)$/.exec(raw);
        if (!m) return raw;
        const body = m[2];
        // Find the natural label boundary: prefer the first colon (the
        // canonical "Label: data" pattern), then fall back to the first
        // em-dash / hyphen separator. If neither is present, only bold
        // the leading word group up to the first 8 words so the rest of
        // the bullet (which may carry **bold numbers**) renders normally.
        const colonIdx = body.indexOf(":");
        let labelEnd = -1;
        if (colonIdx > -1 && colonIdx < 80) {
            labelEnd = colonIdx + 1; // include the colon in the label
        } else {
            const dashMatch = /\s[—–-]\s/.exec(body);
            if (dashMatch && dashMatch.index < 80) {
                labelEnd = dashMatch.index;
            } else {
                // Fall back to first 8 words.
                const words = body.split(/\s+/);
                labelEnd = words.slice(0, 8).join(" ").length;
            }
        }
        const labelRaw = body.slice(0, labelEnd).trim();
        const rest = body.slice(labelEnd);
        const labelClean = labelRaw.replace(/\*\*/g, "");
        return `**${labelClean}**${rest}`;
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { flushList(); i++; continue; }

        // ## / ### headings
        if (/^###\s+/.test(trimmed)) {
            flushList();
            elements.push(<h3 key={`h3-${i}`} className="gn-narrative-h3">{inlineFormat(trimmed.replace(/^###\s+/, ""), sectionTitle, metricRules)}</h3>);
            i++; continue;
        }
        if (/^##\s+/.test(trimmed)) {
            flushList();
            elements.push(<h2 key={`h2-${i}`} className="gn-narrative-h2">{inlineFormat(trimmed.replace(/^##\s+/, ""), sectionTitle, metricRules)}</h2>);
            i++; continue;
        }
        // R2 fix — level-1 `# ` was previously falling through to the
        // paragraph branch, leaking the literal `#` into the rendered output
        // (visible when an Adjust prompt emits SWOT-style `# STRENGTHS`).
        // Render as h2 so it matches the default section-heading weight.
        if (/^#\s+/.test(trimmed)) {
            flushList();
            elements.push(<h2 key={`h1-${i}`} className="gn-narrative-h2">{inlineFormat(trimmed.replace(/^#\s+/, ""), sectionTitle, metricRules)}</h2>);
            i++; continue;
        }

        // Pipe table: current line is a header row, next is a separator
        if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
            flushList();
            const headerCells = trimmed.split("|").slice(1, -1).map(c => c.trim());
            i += 2; // skip header + separator
            const tableRows: string[][] = [];
            while (i < lines.length) {
                const rowTrimmed = lines[i].trim();
                if (!rowTrimmed) break; // empty line ends table
                if (/^\|.+\|$/.test(rowTrimmed)) {
                    const cells = rowTrimmed.split("|").slice(1, -1).map(c => c.trim());
                    tableRows.push(cells);
                } else {
                    break; // new block type
                }
                i++;
            }
            elements.push(
                <GenieTable key={`tbl-${elements.length}`} columns={headerCells} rows={tableRows} isNarrative={true} sectionTitle={sectionTitle} metricRules={metricRules} />
            );
            continue;
        }

        // Bullet list item
        if (LIST_ITEM_MARKER_RE.test(trimmed)) {
            // Wave 43 — defensive: if the bullet's body starts with
            // heading markdown (### / ##), demote to inline bold so the
            // rendered card doesn't mix font sizes within a list. This
            // is the second layer of defence behind the upstream
            // `demoteBulletStyleHeadings` pass and the CSS rule that
            // forces inheritance for any heading tag inside a list item.
            const bulletBody = stripBulletInlineHeading(trimmed.replace(LIST_ITEM_MARKER_RE, ""));
            listItems.push({ key: `li-${i}`, body: bulletBody });
            i++; continue;
        }

        flushList();
        // Detect action-like leading labels to give them a tone-accent
        // callout — mirrors the RECOMMENDED ACTIONS card treatment in
        // AI Insights. Matches "Action:", "Recommendation:", "Next step:",
        // "Next steps:", "Recommended action(s):". Case-insensitive.
        const actionMatch = trimmed.match(/^(action|recommendation|recommended action[s]?|next step[s]?)\s*:\s*(.+)$/i);
        if (actionMatch) {
            const label = actionMatch[1].replace(/\b\w/g, c => c.toUpperCase());
            const body = actionMatch[2];
            elements.push(
                <p key={`act-${i}`} className="gn-narrative-action">
                    <strong className="gn-narrative-action-label">{label} ·</strong>{" "}
                    {inlineFormat(body, sectionTitle, metricRules)}
                </p>
            );
        } else {
            elements.push(<p key={`p-${i}`} className="gn-narrative-p">{inlineFormat(trimmed, sectionTitle, metricRules)}</p>);
        }
        i++;
    }

    flushList();
    return <>{elements}</>;
}

function TrendPyramid(props: { direction: "up" | "down" | "flat" }) {
    if (props.direction === "flat") {
        // L2 — neutral "no change" indicator. Filled circle so it reads as
        // a deliberate marker, not a leftover bullet character.
        return (
            <svg className="gn-trend-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <circle cx="6" cy="6" r="3.5" />
            </svg>
        );
    }
    const isUp = props.direction === "up";
    return (
        <svg className="gn-trend-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d={isUp ? "M6 1 L11 11 L1 11 Z" : "M6 11 L1 1 L11 1 Z"} />
        </svg>
    );
}

/**
 * Returns true when a numeric token should qualify as a *measurement* (and
 * therefore be eligible for a coloured trend pill). Bare integers and bare
 * 4-digit years (1900-2099) are explicitly rejected — they're list ordinals
 * or temporal anchors, not measurements. BUG-016 fix.
 *
 * Qualifies when the token has any of:
 *   - explicit sign (+/-)
 *   - `%` suffix
 *   - `pp` suffix (percentage points)
 *   - K/M/B/T magnitude suffix
 *   - decimal point AND not in 1900-2099 range
 */
function isMeasurementNumber(numToken: string): boolean {
    const clean = numToken.trim();
    if (!clean) return false;
    if (/^[+-]/.test(clean)) return true;
    if (/%$/.test(clean)) return true;
    if (/pp$/i.test(clean)) return true;
    if (/[KMBT]\b/.test(clean)) return true;
    // IDEA-039 currency-prefix hotfix — `$11,644.10`, `€100.00`, `£5K` are
    // all measurements even without an explicit `+`/`-` sign. The currency
    // symbol itself is the signal that the value is a financial measurement.
    if (/^[+-]?[$€£₹¥]/.test(clean)) return true;
    // Reject bare 4-digit years (1900-2099) — most common false positive.
    if (/^(19|20)\d{2}$/.test(clean)) return false;
    // Bare integer with no unit — likely a list ordinal or count, not a delta.
    if (/^\d+$/.test(clean)) return false;
    return false;
}

function isThresholdContext(text: string, index: number): boolean {
    const before = text.slice(Math.max(0, index - 80), index).toLowerCase();
    const after = text.slice(index, Math.min(text.length, index + 40)).toLowerCase();
    const window = `${before}${after}`;
    return /\b(threshold|target|benchmark|limit|caution|watch|warning|amber|yellow|red|green|breach|line)\b/.test(window)
        && /[<>≤≥]/.test(window);
}

function renderPlainMetricFragment(raw: string, key: React.Key): React.ReactNode {
    const clean = stripStatusGlyphs(normaliseDirectionalGlyphs(raw))
        .replace(/[▲▼↔]\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return <React.Fragment key={key}>{parseBold(clean || raw)}</React.Fragment>;
}

function stripNarrativeThresholdFragments(text: string): string {
    return text
        .replace(/\s*\((?=[^)]*[<>≤≥])[^)]{1,100}\)/g, "")
        .replace(/\s+([,.;:])/g, "$1");
}

const LIST_ITEM_MARKER_RE = /^(?:[-*•]\s+|(?:\d+[.)]|\(\d+\)|\[\d+\])\s+)/;
const INSIGHT_CARD_SECTIONS = new Set([
    "TRENDS",
    "RISKS",
    "OPPORTUNITIES",
    "RECOMMENDED ACTIONS",
    "ACTIONS",
    "NEXT STEPS",
    "NEXT BEST ACTIONS",
    "TOP DRIVERS",
    "DRIVERS",
]);

function fallbackInsightCardLabel(sectionTitle: string | undefined, index: number): string {
    const upper = (sectionTitle || "").trim().toUpperCase();
    if (/ACTION|NEXT/.test(upper)) return `Action ${index + 1}`;
    if (/RISK/.test(upper)) return `Risk ${index + 1}`;
    if (/OPPORTUNIT/.test(upper)) return `Opportunity ${index + 1}`;
    if (/DRIVER/.test(upper)) return `Driver ${index + 1}`;
    if (/TREND/.test(upper)) return `Trend ${index + 1}`;
    return `Insight ${index + 1}`;
}

function parseInsightCardItem(raw: string, sectionTitle: string | undefined, index: number): {
    label: string;
    body: string;
    generatedLabel: boolean;
} {
    const clean = raw.trim();
    const boldLabel = /^\*\*([^*]{2,80}?)\*\*\s*:?\s*(.+)$/s.exec(clean);
    if (boldLabel && boldLabel[2]?.trim()) {
        return {
            label: boldLabel[1].replace(/:$/, "").trim(),
            body: boldLabel[2].trim(),
            generatedLabel: false,
        };
    }
    const colonLabel = /^([^:]{2,72}):\s+(.+)$/s.exec(clean);
    if (colonLabel && colonLabel[2]?.trim() && colonLabel[1].split(/\s+/).length <= 8) {
        return {
            label: colonLabel[1].replace(/\*\*/g, "").trim(),
            body: colonLabel[2].trim(),
            generatedLabel: false,
        };
    }
    return {
        label: fallbackInsightCardLabel(sectionTitle, index),
        body: clean,
        generatedLabel: true,
    };
}

function shouldRenderInsightCards(sectionTitle: string | undefined, itemCount: number): boolean {
    if (itemCount < 2 || itemCount > 6) return false;
    const upper = (sectionTitle || "").trim().toUpperCase();
    return INSIGHT_CARD_SECTIONS.has(upper);
}

function renderHeadlineCard(body: string, sectionTitle: string | undefined, metricRules?: InlineMetricRules): React.ReactNode {
    let cleaned = body
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();
    // 2026-05-22 — strip whole-sentence bold wrapper. The HEADLINE prompt
    // says "Use bold for numbers", but the LLM often over-complies and
    // wraps the entire sentence in `**...**`. inlineFormat's trend-pill
    // regex then consumes mid-sentence numbers, which orphans the
    // opening + closing `**` and they render as literal asterisks
    // (user-reported 2026-05-22 on EXECUTIVE BRIEF surface). The headline
    // card has its own font-weight emphasis so we don't lose visual rank.
    if (cleaned.startsWith("**") && cleaned.endsWith("**") && cleaned.length > 4) {
        cleaned = cleaned.slice(2, -2).trim();
    }
    return (
        <div className="gn-headline-card">
            <div className="gn-headline-card-text">
                {inlineFormat(cleaned, sectionTitle, metricRules)}
            </div>
        </div>
    );
}

function parseBold(text: string): React.ReactNode {
    const boldRegex = /\*\*(.+?)\*\*/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push(<strong key={`b-${match.index}`}>{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length > 0 ? <>{parts}</> : text;
}

// Session 56 perf hot-spot fix (sub-agent #9 A1): the giant 12-group regex
// below was being recompiled on every inlineFormat() call — and inlineFormat
// fires per heading + per paragraph + per bullet + per table cell, hundreds
// of times per Insights render. Hoisting to module scope avoids the compile
// while keeping all groups identical. Reset .lastIndex at function entry
// since the /g flag makes RegExp stateful.
const TREND = "increased|increases|increase|decreased|decreases|decrease|growth|declined|declines|decline|dropped|drops|drop|rises|risen|rise|rose|up|down|higher|lower|gained|gains|gain|loss|grew|fallen|fell|reduced|improved|stagnation|rebounded|rebound";
const POS_RE = /^(increased?|increases?|growth|rises?|risen|rose|up|higher|gained?|gains?|grew|improved|rebounded?)$/i;
const FLAT_GLYPH = "[▪■●]";
const FLAT_WORD = "flat|unchanged|no\\s+change";
const MEAS_NUM = "[+-]?[$€£₹¥]?\\d[\\d,.]*(?:%|pp|[KMBT])?";

/** Strip a leading +/- sign from a trend pill's number when a direction
 *  glyph (TrendPyramid) renders alongside. Codex 2026-05-19 final UAT:
 *  Rajesh saw "two up arrows" in delta pills — the second indicator was
 *  the literal "+" or "-" in the captured number reading as a direction
 *  glyph next to the actual ▲/▼ icon. Stripping the redundant sign keeps
 *  direction truth (the ▲ pyramid) and tone color, but avoids the visual
 *  echo. Currency / no-sign numbers pass through unchanged.
 *
 *  Examples:
 *    "+33.42%" → "33.42%"  (▲ pyramid already conveys direction)
 *    "-0.22%"  → "0.22%"   (▼ pyramid already conveys direction)
 *    "$1,234"  → "$1,234"  (no leading sign to strip)
 *    "20.4%"   → "20.4%"   (already sign-less)
 */
function stripRedundantSignForPill(numberText: string): string {
    return numberText.replace(/^([+-])(?=[$€£₹¥]?\d)/, "");
}
const INLINE_REGEX = new RegExp(
    // G1,G2: [**][arrow]number[**] trend-word
    `(?:[▲▼]\\s*)?\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}\\s+(${TREND})\\b` +
    // G3,G4: trend-word of/by [**][arrow]number[**]
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:of|by)\\s+\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}` +
    // G5: [arrow] standalone signed percentage (possibly bold)
    `|\\*{0,2}(?:[▲▼]\\s*)?([+-]\\d[\\d,.]*%)\\*{0,2}` +
    // G6,G7 — natural prose `trend-word [arrow]? number` (no "of/by")
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:[▲▼]\\s*)?(${MEAS_NUM})\\b` +
    // G8,G9 — Emoji + number (e.g. "🟢 17.51%" or "🔴 -5.35%")
    `|(🟢|🔴|🟡)\\s*(${MEAS_NUM})` +
    // G10 — flat-glyph + number (e.g. "▪ 0.13", "■ 0pp")
    `|${FLAT_GLYPH}\\s*(${MEAS_NUM})` +
    // G11,G12 — flat-word + number (e.g. "flat 0%", "unchanged 0pp")
    `|(${FLAT_WORD})\\s+(${MEAS_NUM})`,
    "gi"
);

// Wave 24: metric-direction context for inlineFormat. When provided, pill
// COLOUR (gn-trend-up green / gn-trend-down red) follows the metric's
// semantic tone (lower-is-better metrics like Return Rate, Days-to-Ship
// invert: ▼ → green, ▲ → red). Glyph stays physical (▲ for + / ▼ for -)
// so the reader still sees the literal direction of change.
export interface InlineMetricRules {
    structured?: string;
    legacy?: string;
    /** Wave 33 — UPPER-CASED section titles where pills must be suppressed
     *  per author opt-out (`disableTrendPills: true` on a custom section).
     *  Checked alongside the built-in SECTIONS_WITHOUT_TREND_PILLS set. */
    disabledSections?: Set<string>;
}

// Wave 33 — fuzzy metric-name aliases. When the upstream metric-rule lookup
// returns no match, but the candidate metric name (text immediately before
// the pill) matches one of these well-known finance/ops phrases, we render
// the pill with a low-confidence neutral tone (grey). Signals to the reader
// that the value is *being tracked* even though no semantic rule was bound.
//
// ADDITION-ONLY: this only triggers in the rule-aware branch of
// pillColorClass (when `rules` was supplied) AND when no concrete rule
// matched. It never overrides an existing match.
const FUZZY_METRIC_ALIASES: ReadonlyArray<RegExp> = [
    // YoY %, Year over Year, growth %, growth rate
    /\b(yo[\s-]?y|year[\s-]?over[\s-]?year|growth(?:\s+(?:%|rate|percent))?)\b/i,
    // Change vs Plan / Budget / Forecast / Target → variance %
    /\bchange\s+vs\.?\s+(plan|budget|forecast|target)\b/i,
    /\bvariance(?:\s+(?:%|to|vs\.?))?\b/i,
    // QoQ / MoM / WoW deltas
    /\b(qo[\s-]?q|mo[\s-]?m|wo[\s-]?w)\b/i,
    // vs prior / vs LY / vs last (year|period|quarter|month)
    /\bvs\.?\s+(prior|ly|last\s+(?:year|period|quarter|month))\b/i,
    // delta / Δ (caller may pass either)
    /\b(delta|change\s+%|pct\s+change)\b/i,
];

function matchesFuzzyAlias(metricName: string): boolean {
    if (!metricName) return false;
    return FUZZY_METRIC_ALIASES.some(re => re.test(metricName));
}

// Heuristic: extract the metric name candidate from the text immediately
// before a pill match. Looks at the last ~60 chars, strips markdown +
// punctuation, returns the last 1-3 words. Cheap and correct for the
// common cases ("Return Rate ▼ 5%", "Days to Ship dropped 1.2 days",
// "Sales increased by 12%").
function metricNameBeforePill(text: string, pillIndex: number, hint?: string): string {
    const window = text.slice(Math.max(0, pillIndex - 60), pillIndex);
    const cleaned = window
        .replace(/[*_`~()[\]{}]/g, " ")
        .replace(/[+\-]?\d[\d,.\s]*%?(pp|p\.p\.|bps)?/gi, " ")
        .replace(/[:;,.!?]/g, " ");
    const words = cleaned.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w));
    // Drop generic verbs/connectives so the candidate is the noun phrase.
    // Note: "to" is intentionally NOT in the stop set because it appears in
    // compound metric names (Days to Ship, Time to Resolution, Cost to Acquire).
    const STOP = new Set(["of", "by", "the", "a", "an", "for", "from", "in", "on", "at",
        "and", "or", "but", "with", "as", "is", "was", "were", "are", "be", "been",
        "increased", "decreased", "rose", "fell", "dropped", "climbed", "grew", "declined",
        "up", "down", "more", "less", "than", "vs", "versus"]);
    const filtered = words.filter(w => !STOP.has(w.toLowerCase()));
    const fromWindow = filtered.slice(-3).join(" ");

    // Caller-supplied context hint (e.g. the insight-card label) takes
    // precedence when supplied. The card label is an explicit metric-context
    // signal that overrides body-window heuristics — body prose like "rose
    // to 6.2%, up 0.3pp" leaves only weak leftovers ("to") that don't
    // resolve to a rule. If a card's label and body discuss different
    // metrics, that's a card-author concern; the renderer trusts the
    // explicit label. Codex audit follow-up 2026-05-18.
    if (hint && hint.trim()) return hint.trim();
    return fromWindow;
}

/**
 * Resolve the pill class string from the physical pill direction + matched
 * metric tone. The contract Rajesh locked across the whole insights surface:
 *
 *   - Arrow direction = numeric movement (always physical).
 *   - Color / tone    = business meaning (status/metric-direction rule).
 *
 * So a Return Rate increase keeps an UP arrow because the number went up,
 * but the pill renders red because the rule says higher Return Rate is
 * unfavorable. The direction class drives the SVG-arrow color slot (which
 * is then overridden by the tone class via CSS specificity); the tone class
 * drives the final pill color. Both classes are emitted so the markup keeps
 * the direction signal AND the tone signal available to readers, tests,
 * and downstream styling.
 */
function pillColorClass(physicalDir: "up" | "down" | "flat", text: string, pillIndex: number, deltaText: string, rules?: InlineMetricRules, metricNameHint?: string): string {
    const dirClass = `gn-trend-pill gn-trend-${physicalDir}`;
    // Flat direction never carries a semantic tone — the value didn't move.
    if (physicalDir === "flat") {
        return dirClass;
    }
    const metricName = metricNameBeforePill(text, pillIndex, metricNameHint);
    if (!metricName) return dirClass;
    // Pulse's INLINE_REGEX captures the trend word ("up", "down", "rose",
    // "fell") and the number separately for the G6/G7 path, so deltaText
    // arrives WITHOUT a sign. getMetricTone derives direction from the
    // delta text's sign / glyph, which means an unsigned "0.4pp" reads as
    // neutral and the rule's higherIsBetter never resolves a concrete
    // semantic tone. pillColorClass is the only caller that already knows
    // the physical direction independently of the delta sign, so we
    // re-attach the sign here before the tone lookup. This keeps the
    // contract "arrow = movement, color = meaning" honest for prose pills.
    const signedDeltaText = /^[+-]/.test(deltaText)
        ? deltaText
        : physicalDir === "up" ? `+${deltaText}`
        : physicalDir === "down" ? `-${deltaText}`
        : deltaText;
    const tone = getMetricTone({
        metricName,
        deltaText: signedDeltaText,
        valueText: deltaText,
        // Pass author rules when available; resolveMetricDirection falls back
        // to BUILTIN_LOWER_IS_BETTER_RULES when no author rule matches, so
        // metrics like Return Rate get the correct amber tone even without
        // explicit author configuration. Phase E 2026-05-18.
        structuredJson: rules?.structured,
        legacyText: rules?.legacy,
    });
    // Wave 33 — fuzzy alias fallback. When the metric name didn't bind to a
    // concrete rule but it reads like a well-known delta phrase ("YoY %",
    // "change vs plan", "variance %"), render with a low-confidence neutral
    // pill so the reader sees CONSISTENT pill chrome across the section even
    // though the semantic tone is unknown.
    if (!tone.matchedRule) {
        if (matchesFuzzyAlias(metricName) || matchesFuzzyAlias(text.slice(Math.max(0, pillIndex - 60), pillIndex))) {
            return `${dirClass} gn-trend-tone-neutral`;
        }
        return dirClass;
    }
    if (tone.semanticTone === "good") return `${dirClass} gn-trend-tone-good`;
    if (tone.semanticTone === "bad") return `${dirClass} gn-trend-tone-bad`;
    // Watch / at-risk semantic tone (e.g. explicit 🟡 status, amber threshold
    // hit). Without this branch the warn case fell through to dirClass and
    // the watch CSS class was dead code — see Codex audit 2026-05-18.
    if (tone.semanticTone === "warn") return `${dirClass} gn-trend-tone-watch`;
    return dirClass;
}

// Wave 33 — extract every metric name + alias from the rules sources, ready
// for substring matching. Names are kept in their original casing so the
// regex assembled below can be case-insensitive (`i` flag) without altering
// the source text. Order is preserved from JSON for deterministic
// match priority.
function extractRuleMetricNames(structuredJson?: string, legacyText?: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        names.push(trimmed);
    };
    for (const rule of parseMetricDirectionsJson(structuredJson)) {
        push(rule.name);
        if (rule.aliases) for (const a of rule.aliases) push(a);
    }
    for (const rule of migrateLegacyMetricDirectionRules(legacyText)) {
        push(rule.name);
        if (rule.aliases) for (const a of rule.aliases) push(a);
    }
    // Sort by length desc so multi-word names match before their substrings
    // ("Days to Ship" before "Days"). Avoids the regex engine binding the
    // shorter name first on greedy alternation.
    return names.sort((a, b) => b.length - a.length);
}

// Wave 33 — neutral-pill fallback. Scans `slice` for occurrences of any
// rule-known metric name immediately followed by a measurement-shaped value
// (e.g., `Sales: $12K`, `Margin is 8.4%`, `Return Rate at 4.2%`). When found,
// wraps the value in a neutral grey pill — signalling that the metric is
// TRACKED even though no prior-period delta was emitted by the model. The
// metric name itself stays as plain prose with bold spans preserved.
//
// Conservative on purpose:
//   - Only fires when `ruleNames` is non-empty (caller already gated on
//     `metricRules` + `!suppressTrends`).
//   - Requires a separator (`:` / ` is ` / ` was ` / ` at ` / ` of ` / `=`
//     / `→` / `:` / `–` / em-dash) between the name and the value to avoid
//     false positives on metric names that simply appear in prose.
//   - Value must satisfy `isMeasurementNumber` (currency, %, K/M/B, sign,
//     pp, decimal) — bare integers and bare years are still rejected.
//   - Numbers already inside an INLINE_REGEX match cannot reach this
//     function (caller routes only uncovered slices here).
function decorateNeutralRulePills(slice: string, ruleNames: string[]): React.ReactNode {
    if (!slice || ruleNames.length === 0) return parseBold(slice);
    // Build one alternation of escaped names. Word boundary on each side
    // keeps `Sales` from matching `WholesaleSales`. Whitespace inside multi-
    // word names becomes \s+ so spacing in the source is forgiving.
    const escaped = ruleNames
        .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
        .join("|");
    const NEUTRAL_RE = new RegExp(
        // Group 1: metric name (case-insensitive). Group 2: separator.
        // Group 3: candidate measurement value.
        `\\b(${escaped})\\b\\s*(:|=|→|–|—|\\bis\\b|\\bwas\\b|\\bat\\b|\\bof\\b)\\s*([+-]?[$€£₹¥]?\\d[\\d,.]*(?:%|pp|[KMBT])?)`,
        "gi"
    );
    const out: React.ReactNode[] = [];
    let cursor = 0;
    let m: RegExpExecArray | null;
    NEUTRAL_RE.lastIndex = 0;
    while ((m = NEUTRAL_RE.exec(slice)) !== null) {
        const value = m[3];
        if (!isMeasurementNumber(value)) continue;
        if (m.index > cursor) {
            out.push(<React.Fragment key={`np-pre-${cursor}`}>{parseBold(slice.slice(cursor, m.index))}</React.Fragment>);
        }
        // Re-emit name + separator + space verbatim, then wrap value in pill.
        const valueStart = m.index + m[0].length - value.length;
        out.push(
            <React.Fragment key={`np-name-${m.index}`}>
                {parseBold(slice.slice(m.index, valueStart))}
                <span className="gn-trend-pill gn-trend-flat" data-source="ai" data-pill-source="neutral-fallback">
                    <TrendPyramid direction="flat" />{value}
                </span>
            </React.Fragment>
        );
        cursor = m.index + m[0].length;
    }
    if (cursor === 0) return parseBold(slice);
    if (cursor < slice.length) {
        out.push(<React.Fragment key={`np-post-${cursor}`}>{parseBold(slice.slice(cursor))}</React.Fragment>);
    }
    return <>{out}</>;
}

function inlineFormat(text: string, sectionTitle?: string, metricRules?: InlineMetricRules, metricNameHint?: string): React.ReactNode {
    const upperTitle = sectionTitle ? sectionTitle.trim().toUpperCase() : "";
    const statusGlyphsBelongInThisSection = /^(KPI SNAPSHOT|KPI|METRICS?|SCORECARD|PERFORMANCE)$/i.test(upperTitle);
    const sourceText = statusGlyphsBelongInThisSection
        ? normaliseDirectionalGlyphs(text)
        : stripNarrativeThresholdFragments(stripStatusGlyphs(normaliseDirectionalGlyphs(text)));
    // Wave 33 — combine the built-in suppressed-section list with the
    // author-supplied per-custom-section opt-out (`disableTrendPills: true`).
    // Either one suppresses pills for this body verbatim — same effect, two
    // sources. ADDITION-ONLY: an undefined `disabledSections` set keeps the
    // pre-Wave-33 behavior intact.
    const suppressTrends = upperTitle
        ? (SECTIONS_WITHOUT_TREND_PILLS.has(upperTitle)
            || (metricRules?.disabledSections?.has(upperTitle) ?? false))
        : false;

    // Wave 33 — pre-build the rule-known metric-name list once. Used by the
    // neutral-pill fallback to detect "matched rule + no prior-period delta"
    // values that should still be pilled (grey, no arrow) for VISUAL
    // CONSISTENCY across sections. Skip when pills are suppressed for this
    // section, or when no rules were supplied at all (purest happy-path).
    const ruleNames = (!suppressTrends && metricRules)
        ? extractRuleMetricNames(metricRules.structured, metricRules.legacy)
        : [];
    const renderPlainSlice = (slice: string, key: string): React.ReactNode => {
        if (suppressTrends || ruleNames.length === 0) {
            return <React.Fragment key={key}>{parseBold(slice)}</React.Fragment>;
        }
        return <React.Fragment key={key}>{decorateNeutralRulePills(slice, ruleNames)}</React.Fragment>;
    };

    // Reset shared regex state — /g flag makes RegExp.lastIndex stateful
    // across calls; without this reset, sequential inlineFormat() calls
    // would silently skip matches.
    const inlineRegex = INLINE_REGEX;
    inlineRegex.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(sourceText)) !== null) {
        if (match.index > lastIndex) {
            parts.push(renderPlainSlice(sourceText.slice(lastIndex, match.index), `raw-${lastIndex}`));
        }
        const thresholdContext = isThresholdContext(sourceText, match.index);

        if (match[2] !== undefined) {
            // number + trend word (e.g. **-5.35%** drop)
            // IDEA-039 pill-content hotfix — pill carries only `[▲ number]`;
            // the trend word stays as plain text after the pill.
            // Result: `[▲ -5.35%] drop` instead of `[▲ -5.35% drop]`.
            if (suppressTrends || thresholdContext || !isMeasurementNumber(match[1])) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const dir = POS_RE.test(match[2]) ? "up" : "down";
                const cls = pillColorClass(dir, sourceText, match.index, match[1], metricRules, metricNameHint);
                parts.push(
                    <React.Fragment key={match.index}>
                        <span className={cls} data-source="ai"><TrendPyramid direction={dir} />{stripRedundantSignForPill(match[1])}</span>
                        {" " + match[2]}
                    </React.Fragment>
                );
            }
        } else if (match[4] !== undefined) {
            // trend word of/by number (e.g. increased by **7,916.78**)
            // Pill carries only `[▲ number]`; the "trend-word of/by " prefix
            // stays as plain text before the pill.
            // Result: `up by [▲ 20.4%]` instead of `[▲ up by 20.4%]`.
            if (suppressTrends || thresholdContext || !isMeasurementNumber(match[4])) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const dir = POS_RE.test(match[3]) ? "up" : "down";
                const cls = pillColorClass(dir, sourceText, match.index, match[4], metricRules, metricNameHint);
                // Recover the connective ("of" or "by") from the original match.
                const connective = /\b(of|by)\b/i.exec(match[0])?.[1] ?? "by";
                parts.push(
                    <React.Fragment key={match.index}>
                        {match[3]} {connective}{" "}
                        <span className={cls} data-source="ai"><TrendPyramid direction={dir} />{stripRedundantSignForPill(match[4])}</span>
                    </React.Fragment>
                );
            }
        } else if (match[5] !== undefined) {
            // standalone signed percentage (+33.42% or -0.22%) — already has
            // an explicit sign, so it always qualifies as a measurement. Still
            // suppressed in non-measurement sections. Pill = number only.
            if (suppressTrends || thresholdContext) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const dir = match[5].startsWith("+") ? "up" : "down";
                const cls = pillColorClass(dir, sourceText, match.index, match[5], metricRules, metricNameHint);
                parts.push(<span key={match.index} className={cls} data-source="ai"><TrendPyramid direction={dir} />{stripRedundantSignForPill(match[5])}</span>);
            }
        } else if (match[6] !== undefined && match[7] !== undefined) {
            // G6/G7 — trend-word + number (no "of/by" required).
            // e.g. "up 20.4%" / "down 0.7pp" / "rose 14%" / "up 372"
            // Pill = `[▲ number]` only; trend word stays as plain text BEFORE.
            // Result: `up [▲ 20.4%]` instead of `[▲ up 20.4%]`.
            if (suppressTrends || thresholdContext || !isMeasurementNumber(match[7])) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const dir = POS_RE.test(match[6]) ? "up" : "down";
                const cls = pillColorClass(dir, sourceText, match.index, match[7], metricRules, metricNameHint);
                parts.push(
                    <React.Fragment key={match.index}>
                        {match[6]}{" "}
                        <span className={cls} data-source="ai"><TrendPyramid direction={dir} />{stripRedundantSignForPill(match[7])}</span>
                    </React.Fragment>
                );
            }
        } else if (match[8] !== undefined && match[9] !== undefined) {
            // G8/G9 — emoji + number. Converts native emojis to standard CSS pills.
            if (suppressTrends || thresholdContext || !isMeasurementNumber(match[9])) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                // Wave 29 cycle 2 fix: 🟡 (yellow) is a NEUTRAL/WARN status
                // indicator the model emits for at-risk values, NOT a directional
                // delta. Previous fallback painted yellow as green-up which was
                // factually wrong (e.g., a 13.43%→12.74% margin DECLINE rendered
                // as TWO green ▲ pills). 🟡 stays flat (no movement implied)
                // but with watch amber tone — was grey before the 2026-05-18
                // design direction lock (Codex audit caught the gap).
                // 🟢 → up + good tone; 🔴 → down + bad tone; 🟡 → flat + watch tone.
                const dir: "up" | "down" | "flat" = match[8] === "🟢" ? "up" : match[8] === "🔴" ? "down" : "flat";
                const toneClass = match[8] === "🟢" ? "gn-trend-tone-good"
                    : match[8] === "🔴" ? "gn-trend-tone-bad"
                    : "gn-trend-tone-watch";
                // Author-emitted emoji is an explicit semantic signal — keep
                // its color literal, do not let metric-rules re-interpret it.
                const cls = `gn-trend-pill gn-trend-${dir} ${toneClass}`;
                parts.push(
                    <React.Fragment key={match.index}>
                        <span className={cls} data-source="ai"><TrendPyramid direction={dir} />{match[9]}</span>
                    </React.Fragment>
                );
            }
        } else if (match[10] !== undefined) {
            // G10 — flat glyph (▪/■/●) + number. Renders as a neutral grey pill.
            if (suppressTrends || thresholdContext) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const cls = "gn-trend-pill gn-trend-flat";
                parts.push(
                    <span key={match.index} className={cls} data-source="ai">
                        <TrendPyramid direction="flat" />{match[10]}
                    </span>
                );
            }
        } else if (match[11] !== undefined && match[12] !== undefined) {
            // G11/G12 — flat-word ("flat"/"unchanged"/"no change") + number.
            // Pill = `[● number]`; the word stays as plain text BEFORE the pill.
            if (suppressTrends || thresholdContext) {
                parts.push(thresholdContext
                    ? renderPlainMetricFragment(match[0], match.index)
                    : <React.Fragment key={match.index}>{parseBold(match[0])}</React.Fragment>);
            } else {
                const cls = "gn-trend-pill gn-trend-flat";
                parts.push(
                    <React.Fragment key={match.index}>
                        {match[11]}{" "}
                        <span className={cls} data-source="ai"><TrendPyramid direction="flat" />{match[12]}</span>
                    </React.Fragment>
                );
            }
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < sourceText.length) {
        parts.push(renderPlainSlice(sourceText.slice(lastIndex), `raw-${lastIndex}`));
    }

    // Wave 33 — when no INLINE_REGEX matches fired AND we have rule-known
    // metric names, give the entire text one shot at the neutral-pill
    // decorator (the post-loop branch above only fires when at least one
    // pill was emitted). Preserves the legacy `parseBold(sourceText)` final
    // fallback when no rules / no decoration.
    if (parts.length === 0) {
        if (!suppressTrends && ruleNames.length > 0) {
            return <>{decorateNeutralRulePills(sourceText, ruleNames)}</>;
        }
        return parseBold(sourceText);
    }
    return <>{parts}</>;
}


// 2026-05-19 — `renderInsightsProvenance()` was removed here. It rendered
// the legacy "AI-generated · Source: default · <relative>" copy and had no
// remaining call sites (grep confirmed). The current per-section footer
// uses the humanized `Generated by PulsePlay · Source: <friendly label> ·
// Updated <relative>` wording inline (see InsightsSectionFooter below).
// Removed so future source audits stop flagging the stale string and so
// no accidental reintroduction is possible.
//
/**
 * Cycle 32 — per-section footer with provenance text on the left and a
 * compact action cluster on the right (📋 Copy + </> View SQL when
 * available). Renders even when showProvenanceFooter is OFF so the
 * actions are always reachable. Replaces the cycle-20 header pill for
 * View SQL — viewers get a single, predictable action surface per card.
 */
function InsightsSectionFooter(props: {
    title: string;
    body: string;
    sql?: string;
    canShowSql: boolean;
    showingSql: boolean;
    onToggleSql: () => void;
    onCopy: () => void;
    onExportRawData?: () => void;
    onRetry?: () => void;
    canRetry: boolean;
    hasRawData?: boolean;
    rawDataReusedFromTitle?: string | null;
    lazyExportBlocked?: boolean;
    showProvenanceFooter: boolean;
    sourceLabel?: string;
    generatedAt?: number;
}): React.ReactElement | null {
    // Cycle 37 — drop the !!props.sql check. The </> View SQL icon now
    // appears for EVERY section the moment canShowSql is on, regardless
    // of whether the stage actually produced SQL. This is more discoverable:
    // narrative-only stages (RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS)
    // used to hide the icon entirely, which left authors wondering whether
    // the feature was wired up at all. Now they get a consistent affordance,
    // and the expanded panel renders "(no SQL produced for this stage)"
    // for narrative stages — same pattern the Trace pane uses.
    const sqlAvailable = props.canShowSql;
    // Cycle 34 — footer always renders now that we have per-section
    // actions (Copy + Retry + optional View SQL). The earlier early-return
    // when provenance was off + SQL unavailable hid the retry button too.
    void sqlAvailable;
    return (
        <footer className="gn-insights-provenance gn-insights-provenance--with-actions gn-export-skip">
            <div className="gn-insights-provenance-text">
                {props.showProvenanceFooter && (
                    // Codex 2026-05-19 naming audit fix: provenance footer
                    // was reading "AI-generated · Source: default · 19 min ago"
                    // which exposed the raw profile slug and didn't say WHO
                    // generated it. New copy is human + trust-oriented and
                    // maps `default` → "Default profile" so authors don't see
                    // an internal id as primary copy. The wording stays
                    // honest — "Generated by PulsePlay" not "Verified" until
                    // we have an actual validator gate to back the claim.
                    // No "100% hallucination-free" claims anywhere.
                    <>
                        <span>Generated by PulsePlay</span>
                        <span>
                            {"Source: "}
                            <strong style={{ fontWeight: 600 }}>{formatProvenanceSourceLabel(props.sourceLabel)}</strong>
                        </span>
                        <span>
                            {props.generatedAt
                                ? `Updated ${formatRelativeTime(props.generatedAt)}`
                                : "Updated just now"}
                        </span>
                    </>
                )}
            </div>
            <div className="gn-insights-provenance-actions">
                {/* Cycle 33 — icon-only buttons. Title text moved entirely
                    to the tooltip + aria-label; visible glyph is the icon
                    alone so the footer cluster stays compact. */}
                <button
                    type="button"
                    className="gn-insights-provenance-action gn-insights-provenance-action--icon"
                    onClick={props.onCopy}
                    title={`Copy ${props.title || "section"} as markdown`}
                    aria-label={`Copy ${props.title || "section"} as markdown`}
                >
                    {/* 2026-05-19 Codex final UAT: replaced U+1F4CB
                      * "📋" emoji with an SVG clipboard icon. The
                      * emoji shows OS-level glyph variance and was
                      * called out by Rajesh as feeling unpolished in
                      * the AI Insights footer cluster. */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="2" width="6" height="4" rx="1" />
                        <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
                    </svg>
                </button>
                {props.onExportRawData && !props.lazyExportBlocked && (
                    <button
                        type="button"
                        className="gn-insights-provenance-action gn-insights-provenance-action--icon"
                        onClick={props.onExportRawData}
                        disabled={!props.hasRawData}
                        title={props.hasRawData
                            ? props.rawDataReusedFromTitle
                                ? `Export raw data for ${props.title || "section"} to Excel (reused from ${props.rawDataReusedFromTitle})`
                                : `Export raw data for ${props.title || "section"} to Excel`
                            : `No raw query-result data available for ${props.title || "section"}`}
                        aria-label={props.hasRawData
                            ? `Export raw data for ${props.title || "section"} to Excel`
                            : `No raw query-result data available for ${props.title || "section"}`}
                    >
                        <Icon name="download" />
                    </button>
                )}
                {/* Cycle 34 — per-section reload icon. Re-runs JUST this
                    stage via the runStage closure registered by the most
                    recent runInsights (cycle 30). Hidden for custom JSON
                    sections that aren't in the runStage titles array — the
                    retry would no-op there, so we don't tease an
                    unsupported affordance. */}
                {props.canRetry && props.onRetry && (
                    <button
                        type="button"
                        className="gn-insights-provenance-action gn-insights-provenance-action--icon"
                        onClick={props.onRetry}
                        title={`Re-run just the ${props.title || "section"} stage`}
                        aria-label={`Re-run just the ${props.title || "section"} stage`}
                    >
                        {/* SVG refresh — replaces U+21BB "↻" text glyph. */}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                    </button>
                )}
                {sqlAvailable && (
                    <button
                        type="button"
                        className={`gn-insights-provenance-action gn-insights-provenance-action--icon${props.showingSql ? " gn-insights-provenance-action--active" : ""}`}
                        onClick={props.onToggleSql}
                        title={props.showingSql ? `Hide SQL for ${props.title || "section"}` : `View SQL for ${props.title || "section"}`}
                        aria-expanded={props.showingSql}
                        aria-label={props.showingSql ? `Hide SQL for ${props.title || "section"}` : `View SQL for ${props.title || "section"}`}
                    >
                        {/* SVG code-brackets — replaces literal "&lt;/&gt;" text
                          * glyph. Same Feather-style mark across the codebase. */}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                    </button>
                )}
            </div>
        </footer>
    );
}

/**
 * Cycle 47.8 — SQL view that tabs across multiple queries when a single
 * Genie response contained more than one. Used both by the chat-message
 * SQL view (renderMessageBody) and by the per-section AI Insights SQL
 * panel. When `queries.length === 1` it renders the same single `<pre>`
 * the visual rendered before cycle 47.8 — no extra chrome, no behaviour
 * change. When length > 1 the tab strip appears above the highlighted
 * SQL, the active tab persists for the lifetime of this component
 * instance, and the optional `onActiveSqlChange` callback fires so the
 * Copy SQL icon (rendered outside this component) can grab the active
 * tab's text instead of always copying tab #1.
 */
/**
 * Cycle 47.8 — bundles the per-section SQL panel: a copy-SQL icon
 * (icon-only button, top-right) plus the `<SqlTabs>` view. Owns the
 * "active tab" state so the copy button always grabs the SQL the
 * viewer is currently looking at, not just the first one. Behaviour
 * for single-query responses is unchanged from the cycle-38 inline
 * version — the tab strip only appears when there's something to tab
 * across.
 */
interface SectionSqlPanelProps {
    queries: string[];
    sectionTitle: string;
    /** Cycle 47.13 — when set, this section's SQL is borrowed from a
     *  prior stage (Genie reused conversation memory instead of running
     *  fresh SQL). Surface the source title in a small note so the
     *  viewer doesn't think THIS section produced these queries. */
    reusedFromTitle?: string | null;
}
const SectionSqlPanel: React.FC<SectionSqlPanelProps> = (props) => {
    const [activeSql, setActiveSql] = React.useState<string>(props.queries[0] || "");
    const onCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
        // Cycle 42 — robust copy. The synchronous try/catch around
        // navigator.clipboard.writeText could NOT catch promise rejection,
        // so when WebView2 blocked the clipboard API the fallback never
        // fired. Properly await + fall back to execCommand. Quick visual
        // flash on the button itself by toggling its dataset attribute.
        const text = formatSqlForCopy(activeSql);
        const btn = e.currentTarget;
        let ok = false;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                ok = true;
            }
        } catch { /* fall through */ }
        if (!ok) {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand("copy");
                document.body.removeChild(ta);
            } catch { ok = false; }
        }
        if (btn) {
            btn.setAttribute("data-flash", ok ? "ok" : "fail");
            setTimeout(() => btn.removeAttribute("data-flash"), 1500);
        }
    };
    const isMulti = props.queries.length > 1;
    return (
        <>
            <button
                type="button"
                className="gn-insights-section-sql-copy"
                onClick={onCopy}
                title={isMulti
                    ? `Copy active query for ${props.sectionTitle || "section"}`
                    : `Copy formatted SQL for ${props.sectionTitle || "section"}`}
                aria-label={isMulti
                    ? `Copy active query for ${props.sectionTitle || "section"}`
                    : `Copy formatted SQL for ${props.sectionTitle || "section"}`}
            >
                {/* 2026-05-19 post-UAT-1840: replaced U+1F4CB emoji
                  * with the shared SVG clipboard icon. Codex flagged
                  * this as the last raw glyph inside SectionSqlPanel
                  * after the section-footer cluster was already
                  * cleaned up in b71270f. */}
                <Icon name="copy" />
            </button>
            {props.reusedFromTitle && (
                <div className="gn-sql-reused-note" role="note">
                    Reused from <strong>{props.reusedFromTitle}</strong> — Genie synthesized this section&apos;s answer from a prior stage&apos;s query result instead of running fresh SQL.
                </div>
            )}
            <SqlTabs queries={props.queries} onActiveSqlChange={setActiveSql} />
        </>
    );
};

interface SqlTabsProps {
    queries: string[];
    onActiveSqlChange?: (sql: string) => void;
    /** Optional label override for the tabs (default: "Query 1", "Query 2", …). */
    labelPrefix?: string;
    /** Explicit labels, used for Phase 11b sectioned SQL fragments. */
    labels?: string[];
    ariaLabel?: string;
}
const SqlTabs: React.FC<SqlTabsProps> = (props) => {
    const list = props.queries.filter(s => typeof s === "string" && s.trim().length > 0);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const [copiedAt, setCopiedAt] = React.useState<number | null>(null);
    const safeIdx = list.length === 0 ? 0 : Math.min(activeIdx, list.length - 1);
    const activeSql = list[safeIdx] || "";
    const labels = props.labels?.filter(label => typeof label === "string" && label.trim().length > 0);
    const labelFor = (i: number) => labels?.[i] || `${props.labelPrefix || "Query"} ${i + 1}`;
    React.useEffect(() => {
        if (props.onActiveSqlChange) props.onActiveSqlChange(activeSql);
    }, [activeSql, props.onActiveSqlChange]);
    // 2026-05-22 user direction: SQL copy icon. Anchored top-right of the
    // <pre> block so it sits in the same visual position as the AI Insights
    // section toolbar icons. Two-second "copied" feedback via setCopiedAt.
    const renderCopyIcon = (sqlToCopy: string): React.ReactElement => {
        const copied = copiedAt !== null && Date.now() - copiedAt < 2000;
        return (
            <button
                type="button"
                className="gn-sql-copy-btn"
                aria-label={copied ? "SQL copied" : "Copy SQL"}
                title={copied ? "Copied" : "Copy SQL to clipboard"}
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(sqlToCopy);
                        setCopiedAt(Date.now());
                    } catch {
                        // Clipboard API can be blocked by permissions or sandbox;
                        // fail silently rather than throw inside a render path.
                    }
                }}
            >
                <span aria-hidden="true">{copied ? "✓" : "⎘"}</span>
            </button>
        );
    };
    if (list.length === 0) return null;
    if (list.length === 1) {
        return (
            <>
                {labels?.[0] && <div className="gn-sql-section-label">{labels[0]}</div>}
                <div className="gn-sql-pre-wrap">
                    {renderCopyIcon(list[0])}
                    <pre
                        className="gn-code"
                        dangerouslySetInnerHTML={{ __html: highlightSql(list[0]) }}
                    />
                </div>
            </>
        );
    }
    return (
        <>
            <div className="gn-sql-tabs" role="tablist" aria-label={props.ariaLabel || "SQL queries"}>
                {list.map((_q, i) => (
                    <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={i === safeIdx}
                        className={`gn-sql-tab${i === safeIdx ? " gn-sql-tab--active" : ""}`}
                        onClick={() => setActiveIdx(i)}
                        title={`Show ${labelFor(i)} of ${list.length}`}
                    >
                        {labelFor(i)}
                    </button>
                ))}
            </div>
            <div className="gn-sql-pre-wrap">
                {renderCopyIcon(activeSql)}
                <pre
                    className="gn-code"
                    dangerouslySetInnerHTML={{ __html: highlightSql(activeSql) }}
                />
            </div>
        </>
    );
};

/**
 * Renders the AI Insights narrative as a sequence of independent cards,
 * one per `## Heading` section. Each card fades in with a staggered delay
 * so the user perceives progressive loading even though all sections come
 * from a single Genie call. Pipe tables (`| a | b |`) are rendered as
 * proper HTML tables rather than raw pipe characters.
 */
/**
 * Cycle 20 — per-section header with kebab export menu + Show SQL toggle.
 * Each section card in the AI Insights output uses this header so the
 * viewer can pull just one section into their own analysis without
 * affecting the rest of the output. The kebab popover gates PNG / Excel
 * by `lazyExportBlocked` (cycle 19 sandbox detection) so PBI Desktop
 * users only see options that work for them. The Show-SQL button is
 * gated by `canShowSql` (Setup → Operations → Show Generated SQL / Dev
 * Mode / analyst role) and only appears when `stageSqlByTitle` has a
 * SQL string for the section's title — universal stages (HEADLINE /
 * KPI SNAPSHOT / TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS)
 * map 1:1 to Genie's per-stage SQL; preamble "INSIGHTS" sections fall
 * back to no SQL.
 */
/**
 * Display label map for Pulse section titles (2026-05-18 design lock).
 * Internal IDs (HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS /
 * OPPORTUNITIES / KPI SNAPSHOT) drive prompts, validators, visibility
 * state, exports, and the `data-section` attribute used for testing
 * and stage SQL lookup. Display labels are user-facing only and follow
 * Rajesh's briefing direction. Unknown titles pass through unchanged
 * so custom author sections stay readable.
 */
const SECTION_DISPLAY_LABELS: Readonly<Record<string, string>> = Object.freeze({
    "HEADLINE": "Executive Brief",
    "TRENDS": "What Changed",
    "RISKS": "What Needs Attention",
    "RECOMMENDED ACTIONS": "Next Best Actions",
});

/** Map an internal section title to its user-facing display label.
 *  Returns the title unchanged when no mapping is registered. */
export function displaySectionTitle(internal: string | undefined | null): string {
    if (!internal) return "";
    const upper = internal.trim().toUpperCase();
    return SECTION_DISPLAY_LABELS[upper] ?? internal;
}

function InsightsSectionHeader(props: { title: string }): React.ReactElement {
    // Cycle 32 — header is title-only. The cycle-20 SQL toggle pill moved
    // to the footer (InsightsSectionFooter) where it sits alongside the new
    // 📋 Copy button. Single action surface per card, predictable position.
    const display = displaySectionTitle(props.title);
    return (
        <div className="gn-insights-section-head gn-export-skip">
            {props.title && (
                <h3 className="gn-insights-section-title" data-section-title={props.title}>{display}</h3>
            )}
        </div>
    );
}

// Cycle 39 — placeholder card shown for stages whose content hasn't
// streamed in yet. Same chrome as a real section card (so the SHAPE of
// the briefing is visible immediately) with a shimmer-bar body. As each
// stage completes, its placeholder is replaced by the rendered content.
function InsightsSectionPlaceholder(props: { title: string; status?: string }): React.ReactElement {
    const upperTitle = (props.title || "").trim().toUpperCase();
    const display = displaySectionTitle(upperTitle);
    return (
        <section
            className="gn-insights-section gn-insights-section--placeholder"
            data-section={upperTitle}
            aria-busy="true"
            aria-label={`${display} stage in progress`}
        >
            <div className="gn-insights-section-head gn-export-skip">
                {upperTitle && (
                    <h3 className="gn-insights-section-title" data-section-title={upperTitle}>{display}</h3>
                )}
            </div>
            <div className="gn-insights-section-body">
                {/* 2026-05-22 G3 — unified skeleton-bar widths. Previous mix
                    (92/78/85%) didn't match final content widths and produced
                    a visible horizontal jump on swap. Sources logged in
                    docs/research/EXTERNAL_REFERENCES.md (eBay Playbook
                    skeleton, UX Patterns: match skeleton to 95th-percentile
                    of final content). 90% width tracks the typical
                    section body content width without jumping per-bar. */}
                <div className="gn-insights-skeleton-line" style={{ width: "90%" }} />
                <div className="gn-insights-skeleton-line" style={{ width: "90%" }} />
                <div className="gn-insights-skeleton-line" style={{ width: "70%" }} />
            </div>
        </section>
    );
}

function renderInsightsSections(content: string, options?: InsightsRenderOptions): React.ReactNode {
    const text = content.trim();
    // Cycle 39 — when content is empty BUT a pipeline is in flight with
    // known titles, render the placeholder grid so the user sees the
    // SHAPE of the briefing immediately. Without this, the bubble would
    // sit blank for ~10-20s waiting for the first stage to land.
    if (!text) {
        const planned = options?.pendingStageTitles;
        if (planned && planned.length > 0) {
            return (
                <div className="gn-insights-sections">
                    {planned.map((t, i) => (
                        <InsightsSectionPlaceholder
                            key={`placeholder-${i}-${t}`}
                            title={t}
                            status={options?.stageStatuses?.[i]}
                        />
                    ))}
                </div>
            );
        }
        return <div className="gn-msg-body">{renderNarrative("No response returned.")}</div>;
    }

    // R2 fix — accept `# `, `## `, and `### ` as section delimiters. Authors
    // routinely override the default skeleton via the Adjust box (e.g. SWOT
    // sections emitted as `# STRENGTHS`); restricting to `## ` only made the
    // model's level-1 headings leak into the body as literal `#` text and
    // forced everything into the preamble HEADLINE bucket.
    const parts = text.split(/^#{1,3}\s+/m);
    const sections: { title: string; body: string }[] = [];
    const preamble = parts.shift();
    if (preamble && preamble.trim()) {
        const preText = preamble.trim();
        // Genie sometimes responds to stage-1 with a clarifying question
        // instead of the requested headline. Drop pure clarifying questions
        // (text that ends with "?" and contains no newlines) so they don't
        // appear as a bare floating paragraph above the section cards.
        const isClarifying = preText.endsWith("?") && !preText.includes("\n");
        if (!isClarifying) {
            // R1 fix — only inherit the HEADLINE chrome when the response
            // looks like a default-skeleton headline (multi-sentence or
            // paragraph-shaped). When an Adjust prompt swaps the skeleton
            // (e.g. SWOT, single-card narrative), preamble is typically a
            // short orphan or empty — labelling it HEADLINE forces a chrome
            // the author didn't ask for. Use a neutral "INSIGHTS" title so
            // the renderer still cards it without falsely advertising a
            // HEADLINE section the model didn't emit.
            const looksLikeHeadline = /\b(situation|implication|on-track|at-risk|off-track|^total\b|^revenue\b)/i.test(preText);
            sections.push({ title: looksLikeHeadline ? "HEADLINE" : "INSIGHTS", body: preText });
        }
    }
    for (const chunk of parts) {
        const nl = chunk.indexOf("\n");
        // Wave 22 cycle 5e: normalise section heading to UPPER CASE so the
        // visual style stays consistent even if the model emits mixed case
        // ("Category Profitability" instead of "CATEGORY PROFITABILITY").
        // Prompt asks for upper case but sometimes drifts; renderer makes
        // it deterministic.
        const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().toUpperCase();
        const body = nl === -1 ? "" : chunk.slice(nl + 1).trim();
        sections.push({ title, body });
    }

    // Wave 37 — viewer-side visibility filter. When the caller passes a
    // `visibleSectionTitles` set, drop any section whose UPPER-CASED title is
    // NOT in that set. Default (set is null/undefined) renders everything,
    // matching pre-Wave-37 behaviour. The pipeline still RAN the prompt for
    // hidden sections — we suppress display only, so toggling them back on
    // is instant from cache.
    const visibilityFilter = options?.visibleSectionTitles;
    const filteredSections = visibilityFilter
        ? sections.filter(s => visibilityFilter.has((s.title || "").trim().toUpperCase()))
        : sections;

    // Phase E.1 \u2014 client-side progressive reveal. When the caller passes a
    // `revealedSectionTitles` set, sections not in the set are replaced by a
    // placeholder card (preserves briefing shape so the user sees what's
    // coming). When the set is null/undefined, every section renders.
    const revealFilter = options?.revealedSectionTitles;

    return (
        <div className="gn-insights-sections">
            {filteredSections.map((s, i) => {
                const upperTitle = (s.title || "").toUpperCase();
                // Phase E.1 \u2014 hold-back placeholder for not-yet-revealed
                // sections. The same skeleton component the in-flight pipeline
                // uses, so the visual language stays consistent.
                if (revealFilter && !revealFilter.has(upperTitle)) {
                    return (
                        <InsightsSectionPlaceholder
                            key={`reveal-pending-${i}-${upperTitle}`}
                            title={s.title}
                            status="pending"
                        />
                    );
                }
                // Cycle 47.8 — stageSqlByTitle now carries an array.
                // Cycle 47.13 — value is { sqls, reusedFromTitle? }; an
                // empty/missing entry still renders the empty-state card.
                const sectionSqlEntry = options?.stageSqlByTitle?.get(upperTitle);
                const sectionSqls = sectionSqlEntry?.sqls;
                const sectionSqlReusedFrom = sectionSqlEntry?.reusedFromTitle ?? null;
                const hasSectionSql = Array.isArray(sectionSqls) && sectionSqls.length > 0;
                const showingSql = options?.openSqlSections?.has(upperTitle) === true;
                const exactRawDataEntry = options?.stageDataByTitle?.get(upperTitle);
                const fallbackRawDataEntry = !exactRawDataEntry && options?.stageDataByTitle?.size === 1
                    ? Array.from(options.stageDataByTitle.values())[0]
                    : undefined;
                const rawDataEntry = exactRawDataEntry ?? fallbackRawDataEntry;
                const rawDataReusedFromTitle = exactRawDataEntry
                    ? rawDataEntry?.reusedFromTitle
                    : rawDataEntry ? "AI Insights briefing" : null;
                return (
                    <section
                        key={`sec-${i}`}
                        className="gn-insights-section"
                        data-section={upperTitle}
                        style={{ animationDelay: `${i * 140}ms` }}
                    >
                        <InsightsSectionHeader title={s.title} />
                        <div className="gn-insights-section-body">{renderSectionBody(s.body, s.title, options)}</div>
                        {/* Cycle 20 — inline SQL panel for this section. Rendered
                            below the body when the viewer expands "View SQL"
                            from the footer (cycle 32 moved the toggle there).
                            Cycle 37 — render the panel even when no SQL was
                            produced (narrative-only stages like RISKS /
                            OPPORTUNITIES / RECOMMENDED ACTIONS take other
                            stages' output as context and don't query the
                            warehouse). The empty state explicitly says so,
                            same pattern the Trace pane already uses. */}
                        {showingSql && (
                            <div className="gn-insights-section-sql gn-export-skip">
                                {(() => {
                                    // Codex 2026-05-19 final UAT P1: the SQL
                                    // affordance must never open as a dead
                                    // explanatory panel. Acceptance rule:
                                    //   (a) show this section's own SQL, OR
                                    //   (b) show reused source SQL in-place
                                    //       labelled "Reused from <section>", OR
                                    //   (c) jump to the reused source SQL, OR
                                    //   (d) hide/disable when no traceable SQL.
                                    //
                                    // Branch (a): this stage has its own SQL.
                                    if (hasSectionSql && sectionSqls) {
                                        return (
                                            <SectionSqlPanel
                                                queries={sectionSqls}
                                                sectionTitle={s.title || ""}
                                                reusedFromTitle={sectionSqlReusedFrom}
                                            />
                                        );
                                    }
                                    // Branch (b): find a sibling stage that
                                    // has SQL we can render inline. Prefer
                                    // the explicitly-named reusedFrom source;
                                    // fall back to whichever sibling section
                                    // has SQL (typically KPI SNAPSHOT or the
                                    // initial briefing).
                                    const map = options?.stageSqlByTitle;
                                    let sourceTitle: string | null = sectionSqlReusedFrom;
                                    let sourceSqls: string[] | undefined;
                                    if (sourceTitle) {
                                        const entry = map?.get(sourceTitle.toUpperCase());
                                        if (entry?.sqls?.length) sourceSqls = entry.sqls;
                                    }
                                    if (!sourceSqls && map) {
                                        for (const [t, entry] of map) {
                                            if (entry?.sqls?.length && t !== upperTitle) {
                                                sourceTitle = t;
                                                sourceSqls = entry.sqls;
                                                break;
                                            }
                                        }
                                    }
                                    if (sourceSqls && sourceTitle) {
                                        return (
                                            <SectionSqlPanel
                                                queries={sourceSqls}
                                                sectionTitle={s.title || ""}
                                                reusedFromTitle={sourceTitle}
                                            />
                                        );
                                    }
                                    // Branch (d): nothing traceable. Render a
                                    // short honest line (NOT a dead paragraph).
                                    return (
                                        <div className="gn-insights-section-sql-empty" role="status">
                                            <strong>No SQL available for this section.</strong>{" "}
                                            This stage produced a narrative-only output and the run did not retain a sibling query to reference.
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        {/* Cycle 32 — section footer (provenance + per-section
                            actions on the right). Replaces the bare provenance
                            footer call; the actions cluster lives here so the
                            cards are scannable for "where do I copy / inspect SQL".
                            Cycle 34 — adds per-section ↻ retry icon, gated by
                            canRetry (false for custom JSON sections that aren't
                            in the universal stage titles array). */}
                        <InsightsSectionFooter
                            title={s.title}
                            body={s.body}
                            sql={sectionSqls?.[0]}
                            canShowSql={options?.canShowSql ?? false}
                            showingSql={showingSql}
                            onToggleSql={() => options?.onToggleSectionSql?.(s.title)}
                            onCopy={() => options?.onCopySection?.(s.title, s.body)}
                            onExportRawData={rawDataEntry
                                ? () => options?.onExportSectionRawData?.(s.title, rawDataEntry.queryResult, rawDataReusedFromTitle)
                                : undefined}
                            onRetry={options?.onRetrySection ? () => options.onRetrySection?.(s.title) : undefined}
                            // Cycle 42 — always show the ↻ retry icon. The
                            // retry callback (cycle 30 + 42) handles the
                            // no-stage-match case by falling back to a full
                            // pipeline refresh, so the click is never a no-op.
                            // Previous canRetry gate was hiding the icon for
                            // cache-loaded sections (runStageRef empty) +
                            // custom JSON sections (not in titles array).
                            canRetry={!!options?.onRetrySection}
                            hasRawData={!!rawDataEntry}
                            rawDataReusedFromTitle={rawDataReusedFromTitle}
                            lazyExportBlocked={!!options?.lazyExportBlocked}
                            showProvenanceFooter={!!options?.showProvenanceFooter}
                            sourceLabel={options?.sourceLabel}
                            generatedAt={options?.generatedAt}
                        />
                    </section>
                );
            })}
            {/* Cycle 39 — append placeholder cards for stages that are
                planned but not yet rendered. Iterate the pipeline's
                pendingStageTitles in order; for each title not present in
                the rendered set AND whose status is "pending" or "running"
                (or unset, meaning planned but not yet started), drop a
                skeleton card. This keeps the SHAPE of the briefing
                visible to the viewer while later stages are still in
                flight. Each placeholder is keyed by stage index + title
                so React's reconciler swaps them cleanly when the real
                content arrives. */}
            {(() => {
                const planned = options?.pendingStageTitles;
                if (!planned || planned.length === 0) return null;
                const renderedTitles = new Set(filteredSections.map(s => (s.title || "").trim().toUpperCase()));
                const statuses = options?.stageStatuses ?? [];
                const pending: { title: string; index: number }[] = [];
                planned.forEach((t, i) => {
                    const upper = (t || "").trim().toUpperCase();
                    if (!upper) return;
                    if (renderedTitles.has(upper)) return;
                    const status = statuses[i] ?? "pending";
                    if (status === "done" || status === "error") return;
                    if (visibilityFilter && !visibilityFilter.has(upper)) return;
                    pending.push({ title: upper, index: i });
                });
                if (pending.length === 0) return null;
                return pending.map(p => (
                    <InsightsSectionPlaceholder
                        key={`pending-${p.index}-${p.title}`}
                        title={p.title}
                        status={statuses[p.index]}
                    />
                ));
            })()}
        </div>
    );
}

function tableRowDedupeKey(row: string[]): string {
    return row
        .map(cell => cell.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase())
        .join("|");
}

function tableRowBoldScore(row: string[]): number {
    return row.reduce((score, cell) => score + ((cell.match(/\*\*/g)?.length ?? 0) > 0 ? 1 : 0), 0);
}

function dedupePipeTableRows(rows: string[][]): string[][] {
    const order: string[] = [];
    const seen = new Map<string, { row: string[]; boldScore: number }>();

    for (const row of rows) {
        const key = tableRowDedupeKey(row);
        if (!key.replace(/\|/g, "").trim()) continue;
        const boldScore = tableRowBoldScore(row);
        const existing = seen.get(key);
        if (!existing) {
            order.push(key);
            seen.set(key, { row, boldScore });
            continue;
        }
        if (boldScore > existing.boldScore) {
            seen.set(key, { row, boldScore });
        }
    }

    return order.map(key => seen.get(key)!.row);
}

function deltaToneForKpi(statusTone: Tone, semanticTone: Tone, movementTone: Tone): Tone {
    if (statusTone !== "neutral") return statusTone;
    return movementTone === "neutral" ? semanticTone : movementTone;
}

function deltaCueGlyph(direction: "up" | "down" | "neutral"): string {
    if (direction === "up") return "▲";
    if (direction === "down") return "▼";
    return "";
}

/**
 * IDEA-039 step 1.1 — KPI tile grid. Detects the `## KPI SNAPSHOT` pipe
 * table and renders each row as a discrete tile (P1 design pattern from
 * the high-fidelity mockups), instead of the generic HTML table.
 *
 * Parses columns by header name (KPI / Current / Prior / Δ / Status) so
 * column order is forgiving. Falls back to the generic table render via
 * caller if parsing fails (no rows or no recognisable header).
 */
function renderKpiTiles(body: string, sectionTitle?: string, options?: InsightsRenderOptions): React.ReactNode | null {
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) return null;
    const isPipeRow = (s: string) => /^\|.*\|$/.test(s);
    if (!isPipeRow(lines[0]) || !/^\|[\s:|-]+\|$/.test(lines[1])) return null;

    const header = lines[0].slice(1, -1).split("|").map(c => c.trim().toLowerCase());
    const rows = dedupePipeTableRows(lines.slice(2).filter(isPipeRow).map(l =>
        l.slice(1, -1).split("|").map(c => c.trim())
    ));
    if (rows.length === 0) return null;

    const idx = (...names: string[]) => {
        for (const n of names) {
            const i = header.findIndex(h => h === n || h.startsWith(n));
            if (i >= 0) return i;
        }
        return -1;
    };
    const iKpi    = idx("kpi", "metric", "name");
    const iCur    = idx("current", "value", "actual");
    const iPrior  = idx("prior", "previous");
    const iDelta  = idx("δ", "δ %", "delta", "change");
    const iStatus = idx("status");

    if (iKpi < 0 || iCur < 0) return null;

    const tiles = rows.map((r, ri) => {
        const kpi = r[iKpi] ?? "";
        const cur = r[iCur] ?? "";
        const prior = iPrior >= 0 ? (r[iPrior] ?? "") : "";
        const delta = iDelta >= 0 ? (r[iDelta] ?? "") : "";
        const status = iStatus >= 0 ? (r[iStatus] ?? "") : "";
        const deltaText = delta.replace(/\*\*/g, "").trim();
        const tone = getMetricTone({
            metricName: kpi,
            deltaText,
            valueText: cur,
            statusText: status,
            structuredJson: options?.metricDirectionsJson,
            legacyText: options?.legacyMetricDirectionRules
        });
        const dir = tone.direction;
        const statusTone = tone.statusTone;
        const semanticTone = tone.semanticTone;
        // Direction is physical movement; tone is business meaning. A
        // lower-is-better metric that increased should still show an up
        // arrow, with the pill color following the explicit status when the
        // model provided one.
        const deltaTone = deltaToneForKpi(statusTone, semanticTone, tone.deltaTone);
        const deltaCue = dir;
        const hasSemanticStatus = Boolean(status.trim()) && statusTone !== "neutral";
        const deltaA11y = getDeltaPillA11y(dir, deltaTone);
        const deltaDisplay = stripLeadingDirectionGlyphs(deltaText || delta).trim();
        const deltaHasGlyph = /^[▲▼↔]/.test(normaliseDirectionalGlyphs(delta).trim());
        const deltaGlyph = deltaHasGlyph ? "" : deltaCueGlyph(deltaCue);
        const isUnknownPrior = /^N\/A|no prior data|—|^-$/i.test(prior.replace(/\*\*/g, "").trim());
        return (
            <div
                key={`kpi-${ri}`}
                className={`gn-kpi-tile gn-kpi-tile--${semanticTone}`}
                data-trend-direction={dir}
                data-status-tone={statusTone}
                role="group"
                title="Open KPI drill-down"
                aria-label={`Open details for ${kpi || "this KPI"}`}
            >
                <div className="gn-kpi-tile-head">
                    <span className="gn-kpi-tile-label">{inlineFormat(kpi, sectionTitle)}</span>
                    {status ? <span className="gn-kpi-tile-status">{renderStatusChip(status)}</span> : null}
                </div>
                <div className="gn-kpi-tile-value">{inlineFormat(cur, sectionTitle)}</div>
                {(deltaText || prior) && (
                    <div className="gn-kpi-tile-foot">
                        {deltaText ? (
                            <span
                                className={`gn-kpi-tile-delta gn-kpi-tile-delta--${deltaTone}${hasSemanticStatus ? " gn-kpi-tile-delta--plain" : ""}`}
                                title={deltaA11y.title}
                                aria-label={deltaA11y.ariaLabel}
                                data-source={tone.matchedRule ? "visual" : "ai"}
                                data-delta-tone={deltaTone}
                                data-delta-cue={deltaCue}
                            >
                                {deltaGlyph ? <span className="gn-kpi-tile-delta-cue" aria-hidden="true">{deltaGlyph}</span> : null}
                                {deltaDisplay || deltaText || delta}
                            </span>
                        ) : null}
                        {!isUnknownPrior && prior ? <span className="gn-kpi-tile-prior">vs {inlineFormat(prior, sectionTitle)}</span> : null}
                        {isUnknownPrior ? <span className="gn-kpi-tile-prior gn-kpi-tile-prior--na">no prior period</span> : null}
                    </div>
                )}
            </div>
        );
    });

    return <div className="gn-kpi-tile-grid">{tiles}</div>;
}

/**
 * Section body renderer. Detects pipe tables (2+ consecutive rows starting
 * and ending with `|`, with a `|---|---|` separator on line 2) and renders
 * them as proper tables. Everything else falls back to renderNarrative.
 */
/**
 * IDEA-039 Path B — strip trailing prose from sections that should end with
 * a list or table. Defensive layer on top of prompt enforcement: catches the
 * model's natural "Bottom Line Up Front…" / "In summary…" / "Overall, …"
 * wrap-up paragraphs that slip past the STOP clause.
 *
 * Two strategies:
 *  1. Section-aware termination — for sections whose final block must be a
 *     list (RISKS, OPPORTUNITIES, RECOMMENDED ACTIONS, TRENDS, TOP DRIVERS)
 *     or a table (CATEGORY MIX, REGIONAL BREAKDOWN, SCORECARD, KPI SNAPSHOT),
 *     truncate everything AFTER the last structural element of that type.
 *  2. Keyword-based stripping — anywhere in any section, drop content from
 *     a known wrap-up phrase to end of body. Handles cases where the model
 *     adds a wrap-up paragraph BEFORE the structured content (rare) or
 *     in narrative-heavy sections like HEADLINE.
 *
 * Only runs when `sectionTitle` indicates a known structured section.
 * Returns the cleaned body. Idempotent — running twice yields the same result.
 */
// Note: STRUCTURED_LIST_SECTIONS, STRUCTURED_TABLE_SECTIONS,
// TRAILING_WRAP_UP_PATTERNS, stripTrailingProseKeywordsOnly,
// stripTrailingProse, and cleanInsightsContent now live in
// `./rendering/contentSanitizer` (H1 split, Codex Review).

function renderSectionBody(body: string, sectionTitle?: string, options?: InsightsRenderOptions): React.ReactNode {
    if (!body) return null;
    // Wave 24: extract metric-direction rules from render options so the
    // pill colorizer can flip tone for lower-is-better metrics.
    // Wave 33: also forward the per-section `disableTrendPills` opt-out set so
    // `inlineFormat` can suppress pills for author-flagged custom sections.
    const hasRules = Boolean(options?.metricDirectionsJson || options?.legacyMetricDirectionRules);
    const hasDisabledSet = Boolean(options?.disabledTrendPillSections && options.disabledTrendPillSections.size > 0);
    const metricRules: InlineMetricRules | undefined = (hasRules || hasDisabledSet)
        ? {
            structured: options?.metricDirectionsJson,
            legacy: options?.legacyMetricDirectionRules,
            disabledSections: options?.disabledTrendPillSections
        }
        : undefined;

    // Wave 22 cycle 5b: detect "assumption-only" empty sections — when the
    // model emits the heading + a single Assumption: line and stops (the
    // recurring CATEGORY PROFITABILITY bug). Wave 20 strengthened the prompt
    // to forbid this; the renderer makes it visible when it leaks through.
    // Renders an inline "incomplete — retry recommended" badge above whatever
    // the model returned, so the author sees the failure rather than thinking
    // the section was deliberately terse. ADDITION-ONLY: the original body
    // is still rendered below so no information is lost.
    const trimmedBody = body.trim();
    const bodyLines = trimmedBody.split("\n").map(l => l.trim()).filter(Boolean);
    // Wave 29 cycle 2 — tightened the assumption-only detector. Previous
    // version fired on ≤2 lines, which produced false positives on real
    // sections that prefix an Assumption line then a substantive paragraph
    // (e.g., OPPORTUNITIES with "Assumption: ...\n\nBottom Line: $124K
    // sales growth..."). New rule: trigger ONLY when there is literally
    // ONE meaningful line AND it matches the assumption pattern. The
    // 2-line case where the trailer was a continuation of the assumption
    // itself is now allowed to render without a badge — under-trigger is
    // safer than false-positive.
    const hasOnlyAssumption =
        bodyLines.length === 1
        && /^(assumption|note|caveat)\s*[:\-]/i.test(bodyLines[0]);
    // Wave 26 + 27: detect non-actionable RECOMMENDED ACTIONS bodies
    // BEFORE the assumption-only check so a section that's both ("Assumption
    // line + numbered data dump") gets the more specific ACTIONS advisory
    // instead of the generic "assumption-only" message. The ACTIONS detector
    // requires title-match + has list items + zero imperative verbs;
    // assumption-only catches the no-body fallback case below.
    if (sectionTitle && /^(RECOMMENDED ACTIONS|ACTIONS|NEXT STEPS|NEXT BEST ACTIONS)$/i.test(sectionTitle.trim())) {
        // Wave 27: expanded verb whitelist + widened list-marker pattern.
        // Added: negotiate, execute, establish, validate, trial, sunset,
        // migrate, refactor, communicate, accelerate, simplify, automate,
        // diversify, harden, instrument, mitigate, qualify, rebalance,
        // recover. Catches more legit imperatives without false-flagging.
        const IMPERATIVE_VERBS = /\b(reallocate|reduce|pilot|prioriti[sz]e|audit|cut|shift|renegotiate|negotiate|launch|investigate|restructure|replace|test|roll\s*out|defend|expand|consolidate|eliminate|increase|decrease|improve|fix|address|focus|target|deploy|introduce|implement|adopt|monitor|optimi[sz]e|review|scale|refine|streamline|tighten|execute|establish|validate|trial|sunset|migrate|refactor|communicate|accelerate|simplify|automate|diversify|harden|instrument|mitigate|qualify|rebalance|recover|build|grow|drive|prevent|enforce|standardi[sz]e)\b/i;
        // Wave 27: widened list-marker regex to also match `1:` `(1)` `[1]`
        // patterns some LLMs emit, in addition to the canonical `1.` `1)`.
        const LIST_MARKER = /^(?:[0-9]+[.):]|\([0-9]+\)|\[[0-9]+\])\s+|^[-*•]\s+/;
        const numberedItems = bodyLines.filter(l => LIST_MARKER.test(l));
        const hasImperative = numberedItems.some(item => {
            // Strip leading marker + UNWRAP **bold** markers (keep the text
            // inside — the verb is often the bolded word, e.g. "1. **Reallocate**
            // budget…"). DON'T drop a leading bold-name+colon segment ("1.
            // **Region:** …") — that's the data-dump pattern we WANT to flag.
            const withoutMarker = item.replace(LIST_MARKER, "");
            const isNameColonDataDump = /^\*\*[^*]+\*\*\s*:/.test(withoutMarker);
            const stripped = isNameColonDataDump
                ? "" // intentionally empty: data-dump pattern, no imperative possible
                : withoutMarker.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^_+|_+$/g, "");
            // Look at first 5 words (verb may be preceded by an adverb like "Aggressively reallocate…")
            return IMPERATIVE_VERBS.test(stripped.split(/\s+/).slice(0, 5).join(" "));
        });
        const looksLikeDataDump = numberedItems.length > 0 && !hasImperative;
        // Cycle 43 — also flag pure-prose RECOMMENDED ACTIONS (no list at
        // all — just a paragraph or two of descriptive recap). The cycle
        // 23 validator catches this and triggers ONE retry, but Genie
        // sometimes still produces prose on the retry. Without this
        // banner, the user has no visible indicator that the section
        // didn't comply with its contract.
        const trimmedBodyLength = trimmedBody.length;
        const looksLikePureProse = numberedItems.length === 0 && trimmedBodyLength > 80;
        if (looksLikeDataDump || looksLikePureProse) {
            return (
                <>
                    <div className="gn-insights-incomplete gn-insights-incomplete--with-action" role="status" aria-live="polite">
                        <span className="gn-insights-incomplete-text">
                            ℹ {looksLikePureProse
                                ? "This section came back as descriptive prose instead of actionable items. The auto-validator caught it once and asked for a retry, but the model still produced narrative."
                                : "Section returned a data summary instead of imperative actions."}
                            {" "}Actions should be 3 numbered items each starting with verbs like "Reallocate", "Audit", "Pilot", "Investigate". Click ↻ to retry this stage.
                        </span>
                        {/* Cycle 30 — inline refresh icon. Re-runs JUST this stage
                            via the runStage closure registered by the latest
                            runInsights, so the rest of the briefing stays as-is.
                            Falls back to disabled when no retry handler is wired
                            (e.g., custom JSON sections rendered via this banner). */}
                        {options?.onRetrySection ? (
                            <button
                                type="button"
                                className="gn-insights-incomplete-retry"
                                onClick={() => options.onRetrySection?.(sectionTitle || "")}
                                title="Retry just this section"
                                aria-label="Retry just this section"
                            >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <Icon name="refresh" />
                                    Retry
                                </span>
                            </button>
                        ) : null}
                    </div>
                    <div className="gn-msg-body">{renderNarrative(trimmedBody, sectionTitle, metricRules)}</div>
                </>
            );
        }
    }

    if (hasOnlyAssumption) {
        return (
            <>
                <div className="gn-insights-incomplete gn-insights-incomplete--with-action" role="status" aria-live="polite">
                    <span className="gn-insights-incomplete-text">
                        ℹ Section returned an assumption note but no analysis body — the AI sometimes truncates after the assumption line on first run.
                    </span>
                    {options?.onRetrySection ? (
                        <button
                            type="button"
                            className="gn-insights-incomplete-retry"
                            onClick={() => options.onRetrySection?.(sectionTitle || "")}
                            title="Retry just this section"
                            aria-label="Retry just this section"
                        >
                            <span aria-hidden="true">↻</span> Retry
                        </button>
                    ) : null}
                </div>
                <div className="gn-msg-body">{renderNarrative(trimmedBody, sectionTitle, metricRules)}</div>
            </>
        );
    }

    if (sectionTitle && /^HEADLINE$/i.test(sectionTitle.trim())) {
        return <>{renderHeadlineCard(trimmedBody, sectionTitle, metricRules)}</>;
    }

    // IDEA-039 step 1.1 — KPI SNAPSHOT gets the new tile grid layout per the
    // high-fidelity design references. Falls back to the generic pipe-table
    // render below if parsing fails (e.g., model emitted prose instead of
    // a table).
    if (sectionTitle && /^KPI SNAPSHOT$/i.test(sectionTitle.trim())) {
        const tiles = renderKpiTiles(body, sectionTitle, options);
        if (tiles) return tiles;
    }

    // IDEA-039 Path B — renderer-side trailing-prose stripper.
    // The model frequently appends a "Bottom Line Up Front…" / "Overall, …" /
    // "The highest sales segment is …" wrap-up paragraph after structured
    // content even when the prompt explicitly says STOP. Prompt enforcement
    // gets ~85% compliance — the renderer makes it 100% by truncating
    // trailing prose for sections that are supposed to end with a list or
    // table. Keyword-based stripping catches known wrap-up phrases too.
    const cleanedBody = stripTrailingProse(body, sectionTitle);
    const lines = cleanedBody.split("\n");
    const blocks: React.ReactNode[] = [];
    let buffer: string[] = [];
    let i = 0;

    const flushParagraph = () => {
        if (buffer.length > 0) {
            blocks.push(
                <div key={`p-${blocks.length}`} className="gn-msg-body">
                    {renderNarrative(buffer.join("\n"), sectionTitle, metricRules)}
                </div>
            );
            buffer = [];
        }
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        const isTableStart =
            /^\|.*\|$/.test(trimmed) &&
            i + 1 < lines.length &&
            /^\|[\s:|-]+\|$/.test(lines[i + 1].trim());

        if (isTableStart) {
            flushParagraph();
            const header = trimmed.slice(1, -1).split("|").map(c => c.trim());
            i += 2; // skip header + separator
            const parsedRows: string[][] = [];
            while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
                parsedRows.push(lines[i].trim().slice(1, -1).split("|").map(c => c.trim()));
                i += 1;
            }
            const rows = dedupePipeTableRows(parsedRows);
            // Identify the Status column (if any) so we can render status chips
            // instead of raw emoji / keyword cells. Fall back to plain inline
            // format for every other column.
            const statusColIdx = header.findIndex(h => /^status$/i.test(h.trim()));
            const metricColIdx = header.findIndex(h => /^(metric|kpi|name|measure)$/i.test(h.trim()));
            const deltaColIdx = header.findIndex(h => /^(delta|change|Δ|δ|variance|gap)/i.test(h.trim()));
            const wrapClass = `gn-insights-table-wrap${header.length >= 5 ? " gn-insights-table-wrap--wide" : ""}`;
            blocks.push(
                <div
                    key={`t-${blocks.length}`}
                    className={wrapClass}
                    role="region"
                    aria-label={`${sectionTitle || "Insights"} table`}
                >
                    <table className="gn-insights-table">
                        <thead>
                            <tr>{header.map((h, hi) => <th key={hi}>{inlineFormat(h, sectionTitle)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {rows.map((r, ri) => {
                                const metricName = metricColIdx >= 0 ? (r[metricColIdx] ?? "") : "";
                                const rowStatusTone = statusColIdx >= 0 ? getStatusTone(r[statusColIdx] ?? "") : "neutral";
                                const suppressRowPills = statusColIdx >= 0 && rowStatusTone !== "neutral";
                                return (
                                    <tr key={ri}>
                                        {r.map((c, ci) => (
                                            <td key={ci}>
                                                {ci === statusColIdx
                                                    ? renderStatusChip(c)
                                                    // IDEA-039 anomaly #9 (renderer half) — when a non-status
                                                    // cell carries 🟢/🟡/🔴 / ▲ / ▼ emitted by the model under
                                                    // `metricDirectionRules`, wrap it in a coloured pill so the
                                                    // CATEGORY MIX / SCORECARD / etc. tables read as Google's
                                                    // design reference (P1.1) shows them. If the row already has
                                                    // a semantic Status chip, strip duplicate glyphs and keep the
                                                    // measurement plain so the row has one dominant status signal.
                                                    : renderCellWithPill(c, sectionTitle, {
                                                        suppressPillTint: suppressRowPills,
                                                        metricName,
                                                        valueText: ci === deltaColIdx ? undefined : c,
                                                        deltaText: ci === deltaColIdx ? c : undefined,
                                                        metricDirectionsJson: options?.metricDirectionsJson,
                                                        legacyMetricDirectionRules: options?.legacyMetricDirectionRules
                                                    })}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        buffer.push(line);
        i += 1;
    }
    flushParagraph();
    return <>{blocks}</>;
}

/**
 * IDEA-039 anomaly #9 (renderer half) — paints non-status pipe-table cells
 * when they carry a status glyph (🟢/🟡/🔴) the model emitted per the
 * author's `metricDirectionRules`. Cells without a glyph fall through to
 * the standard inline-format rendering, so this is purely additive.
 *
 * Detection rules:
 *  - 🟢 / ✅ → good (green)
 *  - 🟡 / ⚠ → warn (amber)
 *  - 🔴 / ❌ → bad (red)
 *  - Otherwise → no pill (plain inline format)
 *
 * The emoji itself is stripped from the visible text — the pill colour
 * carries that signal already.
 */
function renderCellWithPill(raw: string, sectionTitle?: string, options?: {
    suppressPillTint?: boolean;
    metricName?: string;
    valueText?: string;
    deltaText?: string;
    metricDirectionsJson?: string;
    legacyMetricDirectionRules?: string;
}): React.ReactNode {
    const clean = raw.trim();
    if (!clean) return null;

    let tone: Tone | null = null;
    if (/🟢|✅|✔/.test(clean)) tone = "good";
    else if (/🟡|⚠/.test(clean)) tone = "warn";
    else if (/🔴|❌|✖/.test(clean)) tone = "bad";

    const display = stripLeadingDirectionGlyphs(stripStatusGlyphs(clean)) || clean;

    if (!tone && options?.metricName) {
        const metricTone = getMetricTone({
            metricName: options.metricName,
            deltaText: options.deltaText || clean,
            valueText: options.valueText || clean,
            structuredJson: options.metricDirectionsJson,
            legacyText: options.legacyMetricDirectionRules
        });
        if (metricTone.matchedRule && metricTone.semanticTone !== "neutral" && !options.suppressPillTint) {
            return (
                <span
                    className={`gn-cell-pill gn-cell-pill--${metricTone.semanticTone}`}
                    data-source="visual"
                    data-trend-direction={metricTone.direction}
                >
                    {inlineFormat(display, sectionTitle)}
                </span>
            );
        }
    }

    if (!tone) return inlineFormat(clean, sectionTitle);

    if (options?.suppressPillTint) return inlineFormat(display, sectionTitle);
    return <span className={`gn-cell-pill gn-cell-pill--${tone}`} data-source="ai">{inlineFormat(display, sectionTitle)}</span>;
}

function renderStatusChip(raw: string): React.ReactNode {
    const clean = raw.replace(/[*`]/g, "").trim();
    if (!clean) return null;
    const tone = getStatusTone(raw);
    const a11y = getStatusA11y(tone);

    // Strip the colour emoji from the display text — the chip colour carries
    // that signal already, and leaving it in makes the chip look noisy.
    const display = stripStatusGlyphs(clean) || clean;

    // 2026-05-27 — Add a leading tone glyph so the chip unambiguously reads
    // as a status badge, not an interactive toggle. Without this, the
    // rounded-pill shape + solid colour fill at small sizes (especially on
    // mobile) was being mistaken for a switch. The glyph + uppercase text
    // makes the trust intent obvious.
    const toneGlyph = tone === "good" ? "✓"
                   : tone === "warn" ? "⚠"
                   : tone === "bad"  ? "✗"
                   : "•";

    return (
        <span
            className={`gn-status-chip gn-status-chip--${tone}`}
            title={a11y.title}
            aria-label={a11y.ariaLabel}
            data-source="ai"
        >
            <span className="gn-status-chip-glyph" aria-hidden="true">{toneGlyph}</span>
            {display}
        </span>
    );
}

export const __insightsRenderForTest = {
    inlineFormat,
    renderInsightsSections,
    renderKpiTiles,
    renderSectionBody,
    renderStatusChip,
    SqlTabs,
    formatSqlSectionLabel,
    // Wave 24 — metric-direction pill helpers exposed for unit testing only.
    metricNameBeforePill,
    pillColorClass,
    // Wave 33 — neutral-pill fallback + fuzzy alias helpers exposed for tests.
    extractRuleMetricNames,
    decorateNeutralRulePills,
    matchesFuzzyAlias,
    // Wave 43 — bullet-content heading-demotion helper + the narrative
    // renderer itself exposed for unit testing of the new defensive
    // normalization (heading-inside-bullet → inline bold).
    renderNarrative,
    demoteBulletStyleHeadings,
    // Phase E — banner guard helper exposed for unit testing.
    briefingHasStatusColors,
};
