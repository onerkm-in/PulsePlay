/**
 * setupStep5.tsx
 *
 * Step 5 ("Advanced configuration") of the in-visual Setup tab — extracted
 * from visual.tsx to keep the main React tree manageable as Section G
 * (Genie space sync) and the Guided wizard land in later commits.
 *
 * This module exports:
 *   - <SetupStep5> — the Advanced form root; renders Section 0 (feature
 *     gate) followed by Sections A–F as collapsible <details>.
 *   - Shared primitives <FieldRow>, <FieldHelp>, <FieldPreview>,
 *     <SectionStatus>, <SectionIntro>, <SectionToolbar> — used minimally
 *     in 48.1 (scaffolding) and adopted per-section in 48.2–48.5.
 *   - STEP5_FIELDS — a single source-of-truth metadata table over every
 *     editable field. Powers the step-level search, diff modal, presets,
 *     validation engine, and (later) Section G's space-sync diff.
 *
 * Behaviour parity with the previous inline markup is the bar for 48.1 —
 * every render output should be byte-identical so the existing 100-case
 * setupDraft contract suite stays green without changes.
 */

import * as React from "react";
import { ReactNode } from "react";
import { ConnectionMode } from "./settings";
import { SetupDraft } from "./setupDraft";
import { validateSection, validateAll, presetsForSection, Preset, SectionValidation, ValidationSeverity } from "./setupStep5Validation";
import { SetupStep5Guided } from "./setupStep5Guided";
import { SectionGEditor } from "./setupStep5SectionG";
import { fetchSpace, computeDiff } from "./genieSpaceSync";
import { parseSerializedSpace, stringifySerializedSpace, SerializedSpace } from "./genieSpaceTypes";
import { parseCustomSections, HybridCustomSection, buildHybridInsightsStagePrompts } from "./visualHelpers";
import { InsightsConfigSuggestion, GenieConfig } from "./genie";
import { CUSTOM_SECTION_PRESETS, CustomSectionPreset, METRIC_DIRECTION_PRESETS, MetricDirectionPreset, interpolatePreset, defaultParamValues } from "./insightsPresetLibrary";
import { parseMetricDirectionsJson } from "./rendering/metricDirections";
// Wave 40 — form-first KB metric rule editor. Replaces the dual-textarea
// (free-text + JSON) UX with a single source-of-truth form that derives
// both legacy fields on every change. See metricRulesEngine.ts for the
// round-trip helpers + Wave 22 sanitisation contract.
import { MetricRuleForm } from "./metricRuleForm";
import {
    MetricRule,
    rulesToProse,
    rulesToJson,
    proseToRules,
    migrateLegacy,
    scrubField,
    MAX_NAME_LEN as METRIC_NAME_MAX,
    MAX_ALIAS_LEN as METRIC_ALIAS_MAX
} from "./metricRulesEngine";
import {
    nounFor,
    isConnectorReady,
    TestConnectionButton,
} from "./backend/connectorUiHelpers";
import { getDescriptor } from "./backend/connectorRegistry";

// 49.18 / IDEA-037 phase 2 — Common analytics domains the visual offers as a
// dropdown in Section A so authors can pick a preset instead of typing free
// text. "Custom…" reveals a text input for anything not in the list.
//
// Wave 30 cycle 6 — added the three "ghost" domains (Strategic Analysis /
// Financial Analysis / Quality / Risk) that insightsPresetLibrary.ts injects
// when authors apply SWOT / BCG / Pareto / Variance / Anomaly presets. The
// domains are silently written into the field today; promoting them to the
// dropdown closes the inconsistency surfaced in ANALYTICS_DOMAIN_TAXONOMY.md.
//
// PulsePlay 2026-05-16 — keep the visible domain list related to the preset
// libraries. The runtime Knowledge Base is the future source of truth; until
// that loader drives setup directly, custom-section and metric-rule preset
// domains are appended here so the domain picker, preset picker, and metric
// editor no longer drift apart.
const CORE_DOMAIN_PRESETS: string[] = [
    "Sales Performance",
    "Marketing Analytics",
    "Operations & Logistics",
    "Supply Chain Operations",
    "Customer Success",
    "Financial Performance",
    "HR Analytics",
    "Hospital Operations",
    "Retail Performance",
    "Manufacturing Quality",
    "Education Analytics",
    "Public Sector Programs",
    "Strategic Analysis",
    "Financial Analysis",
    "Quality / Risk"
];

function uniqueDomains(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const trimmed = value.trim();
        const key = trimmed.toLowerCase();
        if (!trimmed || seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }
    return out;
}

export const DOMAIN_PRESETS: string[] = uniqueDomains([
    ...CORE_DOMAIN_PRESETS,
    ...CUSTOM_SECTION_PRESETS.map(p => p.domain),
    ...METRIC_DIRECTION_PRESETS.map(p => p.domain),
]);

const DOMAIN_STOPWORDS = new Set([
    "analytics", "analysis", "performance", "operations", "operation",
    "strategic", "quality", "risk", "cpg", "fmcg"
]);

function domainTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .map(t => t.trim())
        .filter(t => t.length > 2 && !DOMAIN_STOPWORDS.has(t));
}

export function isDomainRelated(currentDomain: string, presetDomain: string): boolean {
    const current = currentDomain.trim().toLowerCase();
    const preset = presetDomain.trim().toLowerCase();
    if (!current || !preset) return false;
    if (current === preset) return true;
    const presetTokens = new Set(domainTokens(presetDomain));
    return domainTokens(currentDomain).some(t => presetTokens.has(t));
}

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export type Step5Section = "0" | "A" | "B" | "C" | "H" | "D" | "E" | "F" | "G";

/**
 * Metadata entry for a single editable field. The metadata table powers
 * search, diff vs default, preset application, and validation. Sections
 * still render bespoke markup in 48.1; the table is data-only.
 */
export type FieldMeta = {
    name: keyof SetupDraft;
    section: Step5Section;
    label: string;
    /** One-line description shown under the label. */
    hint: string;
    /** Optional second-line example or default-blank cue (rendered monospace). */
    example?: string;
    /** Connection modes where this field is honoured (empty = all). */
    scope?: ConnectionMode[];
    /** Connection modes where the field has no effect (informational chip). */
    noOp?: ConnectionMode[];
    /** Default value used to detect "customised vs defaults" for status badges. */
    defaultValue: string | number | boolean;
    /** Optional richer body for the (i) popover; falls back to hint. */
    helpBody?: ReactNode;
    /** Live preview chip computed from the current draft. Returns null to hide. */
    preview?: (draft: SetupDraft) => string | null;
};

// ────────────────────────────────────────────────────────────────────────
// STEP5_FIELDS — single source of truth for every editable field across
// Sections 0 + A through F. Multi-space slot fields (5 fields × 9 slots)
// are emitted programmatically because they share the exact same shape.
// ────────────────────────────────────────────────────────────────────────

const SECTION_0: FieldMeta[] = [
    {
        name: "enabledFeatures", section: "0",
        label: "Enabled features",
        hint: "Which user-facing tabs the visual exposes. Both is the default and matches existing behaviour.",
        example: "both | insightsOnly | chatOnly",
        defaultValue: "both",
        preview: d => d.enabledFeatures === "both" ? "AI Insights + Chat (tab strip visible)"
                  : d.enabledFeatures === "insightsOnly" ? "AI Insights only"
                  : "Chat only",
    },
];

const SECTION_A: FieldMeta[] = [
    {
        name: "genieFields", section: "A",
        label: "AI metric fields",
        hint: "Shared field allowlist used by BOTH AI Insights and Chat. Comma- or line-separated field names from your AI metric view. PulsePlay checks bound fields from the active BI surface against this list and surfaces missing-binding warnings.",
        example: "Country, Region, Sales, Profit, Quantity",
        defaultValue: "",
        preview: d => {
            const lines = (d.genieFields || "").split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
            return lines.length === 0 ? null : `${lines.length} field${lines.length === 1 ? "" : "s"} listed`;
        },
    },
    {
        name: "domainGuidance", section: "A",
        label: "Business guidance (shared)",
        hint: "SHARED business rules / KPI definitions / formatting standards. Sent on the first turn of every Chat session AND used by AI Insights when no Insights-specific override is set below. To author Insights-only rules, fill 'AI Insights domain guidance (override)'. Cap ~8,000 chars.",
        example: "## Business Rules, ## Formatting Standards",
        defaultValue: "",
        preview: d => {
            const txt = d.domainGuidance || "";
            if (!txt) return null;
            const chars = txt.length;
            const lines = txt.split("\n").length;
            return `${chars.toLocaleString()} chars | ${lines} line${lines === 1 ? "" : "s"}`;
        },
    },
    {
        name: "sendContextToGenie", section: "A",
        label: "Send BI context to AI",
        hint: "Applies to BOTH AI Insights stage prompts and Chat. ON: bound dimensions, measures, and active filters from the active BI surface (Power BI, Tableau, Qlik, Looker, generic iframe) are appended to every prompt so the AI knows the current scope. OFF: only the typed question + your instructions are sent.",
        defaultValue: true,
    },
    {
        name: "insightsAuthoringMode", section: "A",
        label: "Authoring mode",
        hint: "Which path drives the AI Insights output. Preset (default): pick Domain + Custom Sections. AI-assisted: AI introspects bound data and pre-fills Domain + Sections, you tune. Manual: write the prompt yourself, sent verbatim.",
        example: "preset, ai-assisted, manual",
        defaultValue: "preset",
        preview: d => {
            const m = d.insightsAuthoringMode || "preset";
            return m === "manual" ? "Manual prompt" : m === "ai-assisted" ? "AI-assisted (auto-detect)" : "Preset (domain + sections)";
        },
    },
    {
        name: "insightsDomain", section: "A",
        label: "Analytics domain",
        hint: "Short label naming the analytics domain so the AI uses the right vocabulary in HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS. Examples: 'Sales Performance', 'Supply Chain Operations', 'Hospital Operations'. Leave blank for generic 'analytics' framing.",
        example: "Sales Performance, Supply Chain Operations, Hospital Operations",
        defaultValue: "",
        preview: d => (d.insightsDomain || "").trim() ? `Domain: ${d.insightsDomain}` : "Generic analytics framing",
    },
    {
        name: "insightsCustomSections", section: "A",
        label: "Custom AI Insights sections (JSON)",
        hint: "JSON array of {name, instruction} entries. Each becomes a domain-specific section in the AI Insights output, between TRENDS and RISKS. Empty [] means universal sections only.",
        example: "[{\"name\":\"GAP ANALYSIS\",\"instruction\":\"Identify largest gap between target and actual OTIF; bold the affected SKU family.\"}]",
        defaultValue: "[]",
        preview: d => {
            try {
                const parsed = JSON.parse(d.insightsCustomSections || "[]");
                return Array.isArray(parsed) && parsed.length > 0
                    ? `${parsed.length} custom section${parsed.length === 1 ? "" : "s"}`
                    : "Universal sections only";
            } catch { return "Invalid JSON"; }
        },
    },
    {
        name: "insightsPrompt", section: "A",
        label: "Custom AI Insights prompt (advanced override)",
        hint: "Power-user escape hatch. When set, this prompt is sent verbatim to the AI as a single call. For most use cases, leave blank and use Domain + Custom Sections (above) for a portable, dataset-aware fast briefing.",
        example: "(leave blank; prefer Domain + Custom Sections above)",
        defaultValue: "",
        preview: d => (d.insightsPrompt || "").trim() ? "Advanced override active: single call" : "Using fast hybrid briefing",
    },
    {
        // IDEA-039 anomaly #3 — Insights-only domainGuidance override.
        name: "insightsDomainGuidance", section: "A",
        label: "AI Insights domain guidance (override)",
        hint: "Insights-only override of the shared 'Business guidance'. When set, this is used in place of `domainGuidance` for AI Insights stage prompts. Useful when Chat-flow and Insights-flow need different framings, such as a supervisor space whose Chat fans out across helpers but whose Insights should stay single-space. Leave blank to inherit.",
        example: "You are summarising data from a single space. Do NOT cite helper agents.",
        defaultValue: "",
        preview: d => (d.insightsDomainGuidance || "").trim() ? "Insights-specific guidance active" : "Inherits from Business guidance",
    },
    {
        // IDEA-039 anomalies #6 + #9 — author-defined metric direction rules.
        name: "metricDirectionRules", section: "A",
        label: "Metric direction rules",
        hint: "Free-text rules describing inverted-good metrics and color thresholds for AI Insights. Used by the model to emit green, amber, or red status in pipe-table cells per your domain. Default behaviour (when empty): higher is better.",
        example: "Return Rate: lower is better; green at or below 2%, amber 2-5%, red above 5%. Margin %: green at or above 15%, amber 8-15%, red below 8%.",
        defaultValue: "",
        preview: d => (d.metricDirectionRules || "").trim() ? "Custom direction rules active" : "Default: higher is better",
    },
    {
        name: "insightsMetricDirections", section: "A",
        label: "Metric direction map (structured JSON)",
        hint: "Renderer-owned semantic map. When populated, the visual colors KPI tiles and table cells from these rules instead of depending only on AI-emitted emoji.",
        example: `[{"name":"Return Rate","higherIsBetter":false,"aliases":["Returns %"],"amberPct":4,"redPct":8}]`,
        defaultValue: "",
        preview: d => {
            const rules = parseMetricDirectionsJson(d.insightsMetricDirections || "");
            if (rules.length > 0) return `${rules.length} renderer metric rule${rules.length === 1 ? "" : "s"}`;
            return (d.metricDirectionRules || "").trim() ? "Legacy text will be best-effort migrated at render time" : "Default: higher is better";
        },
    },
    {
        name: "insightsShowProvenanceFooter", section: "A",
        label: "Show AI provenance footer",
        hint: "Adds a muted source/timestamp footer to each generated Insights card for review and local production QA.",
        defaultValue: true,
        preview: d => d.insightsShowProvenanceFooter ? "Footer shown" : "Footer hidden",
    },
    // IDEA-043 — universal-stage visibility flags (edited from the docked
    // Universal Stages cards above the custom-sections list). Listed here
    // so the Setup-tab metadata coverage test passes and the Diff modal
    // can report them. Default true = stage visible.
    {
        name: "insightsShowHeadline", section: "A",
        label: "Include HEADLINE + KPI SNAPSHOT stage",
        hint: "When OFF, the AI Insights pipeline skips the HEADLINE + KPI SNAPSHOT stage. Edit from the Universal Stages cards.",
        defaultValue: true,
        preview: d => d.insightsShowHeadline ? "Stage on" : "Hidden",
    },
    {
        name: "insightsShowTrends", section: "A",
        label: "Include TRENDS stage",
        hint: "When OFF, the AI Insights pipeline skips the TRENDS stage. Edit from the Universal Stages cards.",
        defaultValue: true,
        preview: d => d.insightsShowTrends ? "Stage on" : "Hidden",
    },
    {
        name: "insightsShowRisks", section: "A",
        label: "Include RISKS stage",
        hint: "When OFF, the AI Insights pipeline skips the RISKS stage. Edit from the Universal Stages cards.",
        defaultValue: true,
        preview: d => d.insightsShowRisks ? "Stage on" : "Hidden",
    },
    {
        name: "insightsShowActions", section: "A",
        label: "Include RECOMMENDED ACTIONS stage",
        hint: "When OFF, the AI Insights pipeline skips the RECOMMENDED ACTIONS stage. Edit from the Universal Stages cards.",
        defaultValue: true,
        preview: d => d.insightsShowActions ? "Stage on" : "Hidden",
    },
    {
        name: "insightsHeadlineOverride", section: "A",
        label: "HEADLINE custom instruction",
        hint: "Optional. When non-empty, replaces the built-in HEADLINE+KPI instruction body with your own text. Heading-first contract still applies. Edit from the Universal Stages cards.",
        defaultValue: "",
        preview: d => (d.insightsHeadlineOverride || "").trim() ? "Custom override" : "Built-in default",
    },
    {
        name: "insightsTrendsOverride", section: "A",
        label: "TRENDS custom instruction",
        hint: "Optional. When non-empty, replaces the built-in TRENDS instruction body with your own text. Edit from the Universal Stages cards.",
        defaultValue: "",
        preview: d => (d.insightsTrendsOverride || "").trim() ? "Custom override" : "Built-in default",
    },
    {
        name: "insightsRisksOverride", section: "A",
        label: "RISKS custom instruction",
        hint: "Optional. When non-empty, replaces the built-in RISKS instruction body with your own text. Edit from the Universal Stages cards.",
        defaultValue: "",
        preview: d => (d.insightsRisksOverride || "").trim() ? "Custom override" : "Built-in default",
    },
    {
        name: "insightsActionsOverride", section: "A",
        label: "RECOMMENDED ACTIONS custom instruction",
        hint: "Optional. When non-empty, replaces the built-in RECOMMENDED ACTIONS instruction body with your own text. Edit from the Universal Stages cards.",
        defaultValue: "",
        preview: d => (d.insightsActionsOverride || "").trim() ? "Custom override" : "Built-in default",
    },
    {
        name: "insightsCacheTtlMinutes", section: "A",
        label: "AI Insights cache TTL",
        hint: "How long a generated Insights run is cached so filter changes and navigation don't re-trigger the AI briefing.",
        example: "30 minutes (default), 0 = always re-run",
        defaultValue: 30,
        preview: d => d.insightsCacheTtlMinutes === 0
            ? "Caching disabled"
            : `Cached for ${d.insightsCacheTtlMinutes}m`,
    },
    {
        name: "refreshInsights", section: "A",
        label: "Manual refresh trigger",
        hint: "Flip ON then OFF after changing any setting to re-run AI Insights immediately.",
        defaultValue: false,
    },
];

const SECTION_B: FieldMeta[] = [
    {
        name: "kbEnabled", section: "B",
        label: "Enable analytics intelligence",
        hint: "Master toggle for the shared knowledge base. When ON, the rules below are injected into BOTH AI Insights stage prompts AND Chat sessions, improving framing/tone/structure across both surfaces.",
        defaultValue: true,
    },
    { name: "kbChartRules",     section: "B", label: "Chart selection rules",   hint: "Inject chart-type decision rules into both AI Insights and Chat prompts. Requires master toggle ON.",                            defaultValue: true },
    { name: "kbStatRules",      section: "B", label: "Statistical standards",   hint: "Inject statistical best practices (confidence intervals, sample-size guidance) into both AI Insights and Chat. Requires master ON.",  defaultValue: true },
    { name: "kbReportingRules", section: "B", label: "Reporting & storytelling", hint: "Inject reporting principles (BLUF, KPI context, action framing) into both AI Insights and Chat prompts. Requires master ON.",        defaultValue: true },
];

const SECTION_C: FieldMeta[] = [
    {
        name: "authMode", section: "C",
        label: "Authentication model",
        hint: "Shared PAT (default): one identity for all viewers. OAuth OBO: per-viewer identity, requires proxy v2.",
        example: "sharedPat | oauthObo",
        defaultValue: "sharedPat",
    },
    {
        name: "ucRowFiltersEnforced", section: "C",
        label: "Unity Catalog row filters active",
        hint: "Declare ROW FILTER functions are applied. Updates the header badge; does not enforce on its own.",
        defaultValue: false,
    },
    {
        name: "ucColumnMasksEnforced", section: "C",
        label: "Unity Catalog column masks active",
        hint: "Declare column masks redact restricted columns. Same caveat: declaration, not enforcement.",
        defaultValue: false,
    },
    {
        name: "runtimeForbiddenColumns", section: "C",
        label: "Forbidden columns (runtime injection)",
        hint: "Comma-separated column names the AI must never query or expose. Injected as a mandatory instruction into every Genie prompt. Example: email, phone_number, ssn.",
        example: "e.g. email, phone_number, ssn",
        defaultValue: "",
    },
    {
        name: "runtimeMandatoryRowFilter", section: "C",
        label: "Mandatory row filter (runtime injection)",
        hint: "SQL WHERE clause fragment the AI must always apply. Injected as a mandatory instruction. Works on both Chat and AI Insights. Example: region = 'APAC'.",
        example: "e.g. region = 'APAC'",
        defaultValue: "",
    },
    {
        name: "runtimeReadOnlyEnforced", section: "C",
        label: "Enforce read-only SQL (runtime injection)",
        hint: "When ON, the AI is instructed to SELECT only. Any response containing INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE shows a warning banner in the visual.",
        defaultValue: false,
    },
];

// Multi-space slot generator. Emits 5 entries per slot 2..10 (9 slots × 5 = 45).
// The metadata is identical shape across slots, so emitting programmatically
// keeps the table compact and the validation invariant tight.
function buildMultiSpaceSlots(): FieldMeta[] {
    const out: FieldMeta[] = [];
    for (let n = 2; n <= 10; n++) {
        out.push({
            name: `space${n}Label` as keyof SetupDraft, section: "D",
            label: `Space ${n}: Label`,
            hint: "Short tab name. Leave blank to disable this slot at runtime.",
            example: n === 2 ? "e.g. Customer" : n === 3 ? "e.g. HSE" : n === 4 ? "e.g. Operations" : `e.g. Space ${n}`,
            defaultValue: "",
        });
        out.push({
            name: `space${n}AssistantProfile` as keyof SetupDraft, section: "D",
            label: `Space ${n}: Proxy profile`,
            hint: "Profile name from the proxy's config.json. Leave blank to use the default profile.",
            example: "default",
            defaultValue: "",
        });
        out.push({
            name: `space${n}SpaceId` as keyof SetupDraft, section: "D",
            label: `Space ${n}: AI Workspace ID`,
            hint: "Required for Direct/Gateway transports. In Proxy mode the profile resolves this server-side.",
            example: "01f1xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            defaultValue: "",
        });
        out.push({
            name: `space${n}Host` as keyof SetupDraft, section: "D",
            label: `Space ${n}: Workspace URL`,
            hint: "Override only for cross-workspace setups. Leave blank to share the primary host.",
            example: "(inherits primary)",
            defaultValue: "",
        });
        out.push({
            name: `space${n}Token` as keyof SetupDraft, section: "D",
            label: `Space ${n}: Access token`,
            hint: "Direct mode only. Leave blank to share the primary PAT.",
            example: "(inherits primary)",
            defaultValue: "",
        });
    }
    return out;
}

const SECTION_D: FieldMeta[] = [
    {
        name: "multiSpaceEnabled", section: "D",
        label: "Enable multiple spaces",
        hint: "CHAT-tab feature only. When ON, a space selector tab strip appears in the Chat header so users can ask the same question across helper spaces. AI Insights always runs against the PRIMARY space and ignores helper spaces.",
        defaultValue: false,
    },
    {
        name: "multiSpaceCount", section: "D",
        label: "Additional space count",
        hint: "How many additional helper spaces to reveal below; primary is always present. Slots above this count are ignored at runtime. (Chat-tab only; AI Insights uses the primary space.)",
        example: "1-9 additional",
        defaultValue: 3,
        preview: d => d.multiSpaceEnabled
            ? `${d.multiSpaceCount} additional (${d.multiSpaceCount + 1} total)`
            : "Disabled: single space",
    },
    ...buildMultiSpaceSlots(),
];

const SECTION_E: FieldMeta[] = [
    {
        name: "supervisorEndpoint", section: "E",
        label: "Supervisor agent endpoint",
        hint: "CHAT-tab feature only. Databricks Mosaic AI serving endpoint URL that orchestrates multi-space queries when Chat is set to Supervisor connection mode. AI Insights does not use the supervisor; it runs the briefing against the primary space directly.",
        example: "https://dbc-xxx.cloud.databricks.com/serving-endpoints/dwd-supervisor/invocations",
        scope: ["supervisor"],
        defaultValue: "",
    },
    {
        name: "supervisorAgentName", section: "E",
        label: "Supervisor display name",
        hint: "Name shown in the Chat header and progress text when supervisor mode is active. Defaults to 'Supervisor' when blank. (Chat-tab only.)",
        example: "Supervisor",
        defaultValue: "",
    },
    {
        name: "supervisorSynthesisProfile", section: "E",
        label: "Synthesis profile / space ID",
        hint: "For the proxy-side local supervisor (Chat fan-out + fusion). Profile or AI workspace ID that performs the synthesis call. (Chat-tab only.)",
        example: "space1 (default)",
        defaultValue: "",
    },
    {
        name: "supervisorAutoFusion", section: "E",
        label: "Auto-fuse synchronised answers",
        hint: "CHAT-tab only. Trigger answer fusion automatically when 2+ spaces have responded. Off = user clicks manually. Requires Multi-space + Supervisor mode.",
        defaultValue: false,
    },
    {
        name: "supervisorSynthesisPrompt", section: "E",
        label: "Synthesis / fusion system prompt",
        hint: "Instructions guiding the supervisor when synthesising multiple space answers in the Chat tab. Leave blank to use the bundled default. (Chat-tab only.)",
        example: "Leave blank to use the bundled default prompt.",
        defaultValue: "",
    },
];

const SECTION_F: FieldMeta[] = [
    { name: "devMode",            section: "F", label: "Developer mode",                       hint: "Shows the on-canvas diagnostics panel. Turn OFF before publishing.",               defaultValue: false },
    { name: "showSql",            section: "F", label: "Show generated SQL",                   hint: "Renders the </> View SQL icon on each AI Insights section card; click to expand a panel with the SQL Genie generated. Default ON for PulsePlay's author/debug audience. No effect for Azure OpenAI / Bedrock / Foundation Model modes (these answer from indexed knowledge bases / serving endpoints, no SQL).",     noOp: ["azure-openai", "bedrock", "foundation-model"], defaultValue: true  },
    { name: "showTrace",          section: "F", label: "Show routing trace",                   hint: "Surface proxy routing details. Only meaningful in Proxy mode; ignored in Direct.", noOp: ["direct"], defaultValue: false },
    { name: "showGuidedFilters",  section: "F", label: "Show guided filter bar",               hint: "Filter selector below the chat area. Intended for authoring + testing.",            defaultValue: false },
    { name: "allowReportActions", section: "F", label: "Allow visual to apply report filters", hint: "When ON, guided filter selections can push to the surrounding BI report or dashboard.",                     defaultValue: true  },
];

const SECTION_G: FieldMeta[] = [
    { name: "genieTextInstructionsJson", section: "G", label: "AI text instructions",  hint: "Pushed to the upstream AI workspace. Affects BOTH AI Insights and Chat (the workspace's instructions are used wherever it answers). JSON-stringified array of {id, content[]}.",  defaultValue: "" },
    { name: "genieSampleQuestionsJson",  section: "G", label: "AI sample questions",      hint: "Curated suggestions surfaced in the Chat tab's prompt picker AND used by AI Insights as candidate framings. JSON-stringified array of {id, question[]}.",                       defaultValue: "" },
    { name: "genieExampleSqlsJson",      section: "G", label: "AI trusted SQL examples",  hint: "Few-shot SQL examples pushed to the upstream AI workspace. Improves SQL accuracy for BOTH AI Insights stage queries AND Chat. JSON-stringified array of {id, question, sql, parameters[]}.", defaultValue: "" },
    { name: "lastSpaceSyncAt",           section: "G", label: "Last space sync (epoch ms)", hint: "Timestamp of the last Push-to-AI write. 0 = never synced. Read-only; updated automatically when you click Push.",                                                                  defaultValue: 0 },
];

const SECTION_H: FieldMeta[] = [
    {
        name: "sqlCtePreamble", section: "H",
        label: "Base CTE / WITH clause",
        hint: "A full SQL WITH clause the AI must prepend to every query it writes. Build all analysis on top of this pre-filtered dataset. Supports template variables: {{role}}, {{currentDate}}, {{year}}.",
        example: "WITH scoped AS (SELECT * FROM sales WHERE region = '{{role}}')",
        defaultValue: "",
    },
    {
        name: "sqlForbiddenTables", section: "H",
        label: "Forbidden tables / views",
        hint: "Comma-separated table or view names the AI must never reference in SQL. Applied on top of Forbidden Columns in Section C.",
        example: "e.g. raw_pii, staging_customers",
        defaultValue: "",
    },
    {
        name: "sqlRlsHintEnabled", section: "H",
        label: "Inject viewer role into prompt",
        hint: "When ON, the active viewer role is sent to the AI as a context hint (e.g. 'Current viewer role: APAC'). Pair with {{role}} in your CTE or WHERE filter for role-based row scoping.",
        defaultValue: false,
    },
];

export const STEP5_FIELDS: FieldMeta[] = [
    ...SECTION_0,
    ...SECTION_A,
    ...SECTION_B,
    ...SECTION_C,
    ...SECTION_H,
    ...SECTION_D,
    ...SECTION_E,
    ...SECTION_F,
    ...SECTION_G,
];

/**
 * Returns true if the draft value differs from the documented default.
 * Used by <SectionStatus> to surface customised-vs-defaults at a glance.
 */
export function isFieldCustomised(field: FieldMeta, draft: SetupDraft): boolean {
    const v = draft[field.name];
    return v !== field.defaultValue;
}

/**
 * Returns the count of customised fields in a section. Drives the dot
 * colour on the section summary badge: 0 → defaults, ≥1 → customised.
 */
export function countCustomised(section: Step5Section, draft: SetupDraft): number {
    return STEP5_FIELDS.filter(f => f.section === section && isFieldCustomised(f, draft)).length;
}

/**
 * Wave 29 — dirty-form total. Counts customised fields across ALL sections.
 * Used by the Setup modal's unsaved-changes badge so authors see at a glance
 * how many edits are pending Apply. Zero means the form matches saved state.
 */
export function countCustomisedTotal(draft: SetupDraft): number {
    return STEP5_FIELDS.filter(f => isFieldCustomised(f, draft)).length;
}

/**
 * Wave 30 cycle 5 — baseline-aware dirty count. Compares draft against the
 * snapshot captured when the modal entered edit mode, NOT the documented
 * defaults. Without this, opening a long-configured report lit up the
 * unsaved-changes badge instantly because every customised value differs
 * from its default. Returns 0 when draft is byte-equal to baseline.
 */
export function countDirtyVsBaseline(draft: SetupDraft, baseline: SetupDraft | null): number {
    if (!baseline) return countCustomisedTotal(draft);
    let n = 0;
    for (const f of STEP5_FIELDS) {
        if ((draft as any)[f.name] !== (baseline as any)[f.name]) n++;
    }
    return n;
}

// ────────────────────────────────────────────────────────────────────────
// Shared primitives
//
// Scaffolding only in 48.1 — exported so 48.2 onwards can adopt them
// per-section without churn. Behaviour parity is the bar: nothing here
// changes how Sections A–F render today.
// ────────────────────────────────────────────────────────────────────────

/**
 * Status dot inside a section's <summary>. Four states:
 *   defaults     · ○ grey  — no field touched
 *   customised   · ● blue  — at least one field non-default
 *   incomplete   · ⚠ amber — toggle on, dependent fields blank
 *   error        · ✗ red   — validate failed
 */
export function SectionStatus(props: { state: "defaults" | "customised" | "incomplete" | "error"; label?: string }) {
    const { state, label } = props;
    const defaultLabel =
        state === "defaults" ? "defaults" :
        state === "customised" ? "customised" :
        state === "incomplete" ? "needs attention" : "error";
    return (
        <span className={`gn-setup-section-status gn-setup-section-status--${state}`}>
            <span className="gn-setup-section-status-dot" aria-hidden="true" />
            {label ?? defaultLabel}
        </span>
    );
}

/**
 * One-paragraph callout under each section summary. Explains *why* the
 * section exists and *who* edits it, so the radio + toggles aren't
 * floating without grounding.
 */
export function SectionIntro(props: { children: ReactNode; audience?: string }) {
    return (
        <div className="gn-setup-section-intro">
            <p>{props.children}</p>
            {props.audience && <p className="gn-setup-section-intro-audience"><strong>Edited by:</strong> {props.audience}</p>}
        </div>
    );
}

/**
 * Right-aligned button row at the top of a section body. Hosts Validate,
 * Copy as JSON, Paste, Reset, Apply preset.
 */
export function SectionToolbar(props: { children: ReactNode }) {
    return <div className="gn-setup-section-toolbar">{props.children}</div>;
}

function SetupSubgroup(props: { title: string; description: ReactNode; children?: ReactNode }) {
    return (
        <div className="gn-setup-subgroup">
            <div className="gn-setup-subgroup-head">
                <strong>{props.title}</strong>
                <span>{props.description}</span>
            </div>
            {props.children}
        </div>
    );
}

/**
 * Presets dropdown rendered inside a SectionToolbar. Lists every preset
 * registered for the section in setupStep5Validation. Click → applies
 * the preset's partial draft via the parent's setField/setBool/setNum.
 */
export function SectionPresetsMenu(props: {
    section: "0" | "A" | "B" | "C" | "H" | "D" | "E" | "F" | "G";
    onApply: (preset: Preset) => void;
}) {
    const [open, setOpen] = React.useState(false);
    // Wave 25 polish — full keyboard support per WAI-ARIA Menu pattern:
    // - ArrowDown/ArrowUp: cycle through items (wraps at top/bottom)
    // - Home/End: jump to first/last
    // - Enter/Space: activate (already native on the inner buttons)
    // - Esc: close + return focus to trigger
    // - Auto-focus first item on open
    // - Click-outside / blur-outside also close
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const presets = presetsForSection(props.section);

    React.useEffect(() => {
        if (!open) return;
        // Focus first menuitem when menu opens.
        const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
        first?.focus();
        // Close on outside click + Esc.
        const onDocClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            items[(i + 1) % items.length].focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items[(i - 1 + items.length) % items.length].focus();
        } else if (e.key === "Home") {
            e.preventDefault();
            items[0].focus();
        } else if (e.key === "End") {
            e.preventDefault();
            items[items.length - 1].focus();
        }
    };

    if (presets.length === 0) return null;
    return (
        <span className="gn-setup-section-preset-anchor">
            <button
                ref={triggerRef}
                type="button"
                className="gn-btn gn-btn--compact"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-haspopup="menu"
                title="Apply a preset to this section"
            >
                Apply preset
            </button>
            {open && (
                <div
                    ref={menuRef}
                    className="gn-setup-section-preset-menu"
                    role="menu"
                    aria-label="Preset options"
                    onKeyDown={onMenuKeyDown}
                >
                    {presets.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            className="gn-setup-section-preset-item"
                            onClick={() => { props.onApply(p); setOpen(false); triggerRef.current?.focus(); }}
                            role="menuitem"
                        >
                            <strong>{p.label}</strong>
                            <span>{p.description}</span>
                        </button>
                    ))}
                </div>
            )}
        </span>
    );
}

/**
 * Inline validation result strip rendered under a SectionToolbar. Shows
 * up to 5 findings; highest-severity first. Returns null when validation
 * is silent (no findings).
 */
export function SectionValidationResults(props: { result: SectionValidation }) {
    if (props.result.fields.length === 0) return null;
    const severityOrder: Record<ValidationSeverity, number> = { err: 0, warn: 1, info: 2, ok: 3 };
    const sorted = [...props.result.fields].sort(
        (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    );
    return (
        <div className="gn-setup-section-validation" aria-live="polite">
            {sorted.slice(0, 5).map((v, i) => (
                <div key={i} className={`gn-setup-validation-line gn-setup-validation-line--${v.severity}`}>
                    <span className="gn-setup-validation-icon" aria-hidden="true">
                        {v.severity === "err" ? "Error" : v.severity === "warn" ? "Warning" : v.severity === "info" ? "Info" : "OK"}
                    </span>
                    <span className="gn-setup-validation-name"><code>{String(v.name)}</code></span>
                    <span className="gn-setup-validation-msg">{v.message}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * (i) icon button + popover card. Click-to-pin, hover-to-peek, ESC closes.
 * The popover is anchored to the field row; a CSS-only fallback keeps it
 * usable for keyboard / focus-only navigation.
 */
export function FieldHelp(props: { fieldName: string; body: ReactNode }) {
    const [pinned, setPinned] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const popoverRef = React.useRef<HTMLDivElement>(null);
    // Session 56 — measured viewport-relative position so the popover
    // never gets clipped by the visual's overflow:hidden box. With
    // position:fixed the popover escapes any ancestor clip context;
    // we then clamp it to viewport bounds with an 8px gutter.
    const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

    React.useLayoutEffect(() => {
        if (!pinned) {
            setPos(null);
            return;
        }
        const trigger = triggerRef.current;
        const popover = popoverRef.current;
        if (!trigger || !popover) return;
        const trigRect = trigger.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        const GUTTER = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Default: align popover's right edge to trigger's right edge,
        // sitting just below the trigger.
        let left = trigRect.right - popRect.width;
        let top  = trigRect.bottom + 4;
        // Clamp horizontally to viewport.
        if (left + popRect.width > vw - GUTTER) left = vw - popRect.width - GUTTER;
        if (left < GUTTER) left = GUTTER;
        // If clamped popover would overflow the bottom, flip above the trigger.
        if (top + popRect.height > vh - GUTTER) {
            top = Math.max(GUTTER, trigRect.top - popRect.height - 4);
        }
        setPos({ top, left });
    }, [pinned]);

    // Re-measure on viewport resize while pinned.
    React.useEffect(() => {
        if (!pinned) return;
        const handler = () => {
            const trigger = triggerRef.current;
            const popover = popoverRef.current;
            if (!trigger || !popover) return;
            const trigRect = trigger.getBoundingClientRect();
            const popRect = popover.getBoundingClientRect();
            const GUTTER = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = trigRect.right - popRect.width;
            let top  = trigRect.bottom + 4;
            if (left + popRect.width > vw - GUTTER) left = vw - popRect.width - GUTTER;
            if (left < GUTTER) left = GUTTER;
            if (top + popRect.height > vh - GUTTER) {
                top = Math.max(GUTTER, trigRect.top - popRect.height - 4);
            }
            setPos({ top, left });
        };
        window.addEventListener("resize", handler);
        window.addEventListener("scroll", handler, true);
        return () => {
            window.removeEventListener("resize", handler);
            window.removeEventListener("scroll", handler, true);
        };
    }, [pinned]);

    const onKey = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") setPinned(false);
    }, []);
    return (
        <span className="gn-setup-field-help-anchor" onKeyDown={onKey}>
            <button
                ref={triggerRef}
                type="button"
                className="gn-setup-field-info"
                aria-label={`Help for ${props.fieldName}`}
                aria-expanded={pinned}
                onClick={() => setPinned(p => !p)}
            >
                <span aria-hidden="true">i</span>
            </button>
            {pinned && (
                <div
                    ref={popoverRef}
                    className="gn-setup-field-help gn-setup-field-help-pinned gn-setup-field-help--floating"
                    role="dialog"
                    aria-label={`${props.fieldName} help`}
                    style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
                >
                    <button type="button" className="gn-setup-field-help-close" onClick={() => setPinned(false)} aria-label="Close help">×</button>
                    <div className="gn-setup-field-help-body">{props.body}</div>
                </div>
            )}
        </span>
    );
}

/**
 * Right-aligned chip showing a derived value from the current draft.
 * Hidden when the preview function returns null.
 */
export function FieldPreview(props: { children: ReactNode | null; id?: string }) {
    if (props.children == null || props.children === "") return null;
    return <span className="gn-setup-field-preview" id={props.id}>{props.children}</span>;
}

/**
 * Generic field row layout. Wraps label + (i) help + hint + example +
 * preview chip + the input. Two kinds:
 *
 *   kind="field" (default) — label on its own row, input below.
 *     Use for text / textarea / select.
 *
 *   kind="toggle" — checkbox inline with the label text, full row
 *     looks like: [☐] Label  (i)  preview-chip
 *     Use for boolean toggles. Pass the <input type="checkbox" /> as
 *     `children` and the label text as `label`.
 *
 * The native browser tooltip (`title=`) is set from `hint` on every
 * row so keyboard / focus-only users get the same content the (i)
 * popover shows on click.
 */
export function FieldRow(props: {
    name: string;
    label: ReactNode;
    optional?: boolean;
    hint?: ReactNode;
    example?: string;
    helpBody?: ReactNode;
    preview?: ReactNode;
    kind?: "field" | "toggle";
    children: ReactNode;
}) {
    const kind = props.kind ?? "field";
    const titleHint = typeof props.hint === "string" ? props.hint : undefined;

    // Wave 22 cycle 3c (a11y CRITICAL): generate stable input + preview ids per
    // FieldRow. The label uses htmlFor; the input gets the id via React.cloneElement
    // when it is a single ReactElement (the common case for our textarea/input/
    // select children). Toggle kind keeps the label-wraps-input pattern that is
    // already accessible. Preview chip is exposed to AT via aria-describedby.
    const inputId = `gn-fld-${String(props.name)}`;
    const previewId = `gn-fld-${String(props.name)}-preview`;
    const hintId = `gn-fld-${String(props.name)}-hint`;
    const childWithId =
        React.isValidElement(props.children) && kind !== "toggle"
            ? React.cloneElement(props.children as React.ReactElement<any>, {
                  id: inputId,
                  "aria-describedby": [
                      props.preview ? previewId : null,
                      props.hint ? hintId : null,
                  ].filter(Boolean).join(" ") || undefined,
              })
            : props.children;

    if (kind === "toggle") {
        return (
            <div className="gn-setup-field gn-setup-field--toggle gn-setup-field-row" title={titleHint}>
                <label className="gn-setup-field-toggle-label">
                    {props.children}
                    <span>{props.label}</span>
                </label>
                <div className="gn-setup-field-toggle-aux">
                    {props.helpBody && <FieldHelp fieldName={String(props.name)} body={props.helpBody} />}
                    {props.preview && <FieldPreview id={previewId}>{props.preview}</FieldPreview>}
                </div>
                {props.hint && <span className="gn-setup-field-hint" id={hintId}>{props.hint}</span>}
                {props.example && <span className="gn-setup-field-hint-example"><code>{props.example}</code></span>}
            </div>
        );
    }

    return (
        <div className="gn-setup-field gn-setup-field-row" title={titleHint}>
            <div className="gn-setup-field-label-row">
                <label className="gn-setup-field-label" htmlFor={inputId}>
                    {props.label}
                    {props.optional && <span className="gn-setup-field-optional"> (optional)</span>}
                </label>
                {props.helpBody && <FieldHelp fieldName={String(props.name)} body={props.helpBody} />}
                {props.preview && <FieldPreview id={previewId}>{props.preview}</FieldPreview>}
            </div>
            {childWithId}
            {props.hint && <span className="gn-setup-field-hint" id={hintId}>{props.hint}</span>}
            {props.example && <span className="gn-setup-field-hint-example"><code>{props.example}</code></span>}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// SetupStep5 — the Advanced form root.
//
// 48.1 ships behaviour parity with the previous inline markup. The Section 0
// radio gate, Sections A–F as <details>, and the footnote callout all
// render exactly as before. Per-section migration to <FieldRow> + popovers
// + previews + status badges happens in 48.2 (Section A) → 48.5 (Sections
// E + F).
// ────────────────────────────────────────────────────────────────────────

export interface SetupStep5Props {
    draft: SetupDraft;
    setField: (name: keyof SetupDraft, value: string) => void;
    setBool: (name: keyof SetupDraft, value: boolean) => void;
    setNum: (name: keyof SetupDraft, value: number) => void;
    /** 49.20 / IDEA-037 phase 4 — optional callback to fetch an AI-assisted
     *  config suggestion from the active backend. App.tsx provides this when
     *  a connected client + bound context are available. When undefined, the
     *  AI-assist mode shows a "no client available" placeholder. */
    onSuggestInsightsConfig?: () => Promise<InsightsConfigSuggestion | null>;
    /** Wave 41 cycle 12 — async per-card metric-rule suggest callback. Calls
     *  fetchSuggestedMetricRules on the active client with just the metric on
     *  this card; merges the first matching result into the form on resolve. */
    onSuggestMetricRuleForCard?: (rule: MetricRule, idx: number) =>
        | MetricRule
        | undefined
        | Promise<MetricRule | undefined>;
    /** Wave 42 — current viewer identity from the bound USERPRINCIPALNAME()
     *  measure (props.context.dataUserId at the App level). When non-empty,
     *  Section H renders a "Currently bound" preview chip next to the
     *  sqlRlsHintEnabled toggle so authors can confirm the dynamic identity
     *  is reaching the visual. Undefined / empty string = no measure bound,
     *  in which case Section H surfaces a "no measure bound" advisory chip. */
    boundUserId?: string;
}

export type Step5Mode = "guided" | "advanced";
// ────────────────────────────────────────────────────────────────────────
// 49.18 / IDEA-037 phase 2 — Hybrid Insights authoring UI
//
// Three components let an author configure the AI Insights output without
// knowing the prompt-engineering specifics:
//   1. <DomainPicker>        — preset dropdown + Custom… escape hatch.
//   2. <CustomSectionsEditor> — section-list editor with Add/Edit/Delete.
//   3. <HybridPreview>        — collapsible synthesised stage prompt preview.
// ────────────────────────────────────────────────────────────────────────

export function DomainPicker(props: { value: string; onChange: (v: string) => void }) {
    const trimmed = props.value.trim();
    const isPreset = DOMAIN_PRESETS.includes(trimmed);
    const [mode, setMode] = React.useState<"preset" | "custom">(
        !trimmed ? "preset" : isPreset ? "preset" : "custom"
    );
    return (
        <div className="gn-setup-domain-picker">
            <select
                value={mode === "custom" ? "__custom__" : trimmed}
                onChange={e => {
                    const v = e.target.value;
                    if (v === "__custom__") { setMode("custom"); return; }
                    setMode("preset");
                    props.onChange(v);
                }}
            >
                <option value="">Pick a domain (optional)</option>
                {DOMAIN_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="__custom__">Custom domain...</option>
            </select>
            {mode === "custom" && (
                <input
                    type="text"
                    value={trimmed}
                    onChange={e => props.onChange(e.target.value)}
                    placeholder="e.g. Logistics, Supply Chain Operations"
                    style={{ marginTop: "6px", width: "100%" }}
                />
            )}
        </div>
    );
}

/**
 * Session 53.AB — reusable clipboard helper for "Copy JSON" buttons.
 * Tries navigator.clipboard.writeText first; falls back to a hidden
 * textarea + document.execCommand("copy") for older PBI Desktop sandboxes
 * that don't expose the Clipboard API.
 */
export function copyJsonToClipboard(pretty: string, onFeedback: (msg: string) => void) {
    const fallback = () => {
        try {
            const ta = document.createElement("textarea");
            ta.value = pretty;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            onFeedback("Copied to clipboard");
        } catch (e) {
            onFeedback(`Copy failed (${(e as Error).message}). DevTools console has the JSON on window.__dwdInsightsSectionsJson.`);
            try { (window as unknown as { __dwdInsightsSectionsJson?: string }).__dwdInsightsSectionsJson = pretty; } catch { /* sandboxed */ }
        }
    };
    try {
        const nav = navigator as unknown as { clipboard?: { writeText: (s: string) => Promise<void> } };
        if (nav.clipboard?.writeText) {
            nav.clipboard.writeText(pretty).then(
                () => onFeedback("Copied to clipboard"),
                () => fallback()
            );
        } else {
            fallback();
        }
    } catch {
        fallback();
    }
}

export function CustomSectionPresetPicker(props: {
    currentDomain: string;
    onApplyDomain: (v: string) => void;
    onApplySections: (json: string) => void;
}) {
    const [selectedId, setSelectedId] = React.useState("");
    const [feedback, setFeedback] = React.useState<string | null>(null);
    // Wave 32.5 — param form state. When a parameterised preset is picked,
    // the author edits these values *before* clicking Apply. The form is
    // re-seeded to defaults each time the dropdown selection changes so
    // switching preset doesn't carry stale numbers from a previous one.
    const [paramValues, setParamValues] = React.useState<Record<string, string>>({});
    const selected = CUSTOM_SECTION_PRESETS.find(p => p.id === selectedId);
    const relatedPresets = props.currentDomain.trim()
        ? CUSTOM_SECTION_PRESETS.filter(p => isDomainRelated(props.currentDomain, p.domain))
        : [];
    const otherPresets = relatedPresets.length
        ? CUSTOM_SECTION_PRESETS.filter(p => !isDomainRelated(props.currentDomain, p.domain))
        : CUSTOM_SECTION_PRESETS;
    React.useEffect(() => {
        if (selected && selected.params) {
            setParamValues(defaultParamValues(selected));
        } else {
            setParamValues({});
        }
    }, [selected]);
    const buildSectionsJson = (preset: CustomSectionPreset, values: Record<string, string>): string => {
        // Empty preset (no params) keeps existing behaviour — JSON-stringify
        // the raw sections. Parameterised presets go through interpolation.
        const sections = preset.params
            ? interpolatePreset(preset, values)
            : preset.sections;
        return JSON.stringify(sections, null, 2);
    };
    const apply = (preset: CustomSectionPreset | undefined) => {
        if (!preset) return;
        if (!props.currentDomain.trim()) props.onApplyDomain(preset.domain);
        props.onApplySections(buildSectionsJson(preset, paramValues));
    };
    const resetParams = () => {
        if (selected && selected.params) setParamValues(defaultParamValues(selected));
    };
    const presetParamLabel = (label: string, type: string): string => {
        if (type !== "percent") return label;
        return label.replace(/\s*\(%\)\s*$/u, "").trim();
    };
    const copyPreset = () => {
        if (!selected) return;
        const pretty = buildSectionsJson(selected, paramValues);
        copyJsonToClipboard(pretty, msg => {
            setFeedback(msg);
            window.setTimeout(() => setFeedback(null), 2500);
        });
    };
    const hasParams = !!(selected && selected.params);
    return (
        <div className="gn-setup-preset-library">
            <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                aria-label="Custom sections preset library"
                title="Apply a generated custom-section preset"
            >
                <option value="">Choose a custom-section preset</option>
                {relatedPresets.length > 0 && (
                    <optgroup label={`Recommended for ${props.currentDomain.trim()}`}>
                        {relatedPresets.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </optgroup>
                )}
                <optgroup label={relatedPresets.length > 0 ? "Other presets" : "All presets"}>
                    {otherPresets.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </optgroup>
            </select>
            <button
                type="button"
                className="gn-btn gn-btn--compact"
                disabled={!selected}
                onClick={() => apply(selected)}
                title={selected ? selected.description : "Choose a custom-section preset"}
            >
                Apply sections
            </button>
            <button
                type="button"
                className="gn-btn gn-btn--compact"
                disabled={!selected}
                onClick={copyPreset}
                title={selected ? "Copy this preset's JSON to clipboard so you can tweak before applying" : "Pick a preset first"}
            >
                Copy JSON
            </button>
            {selected && !feedback && <span className="gn-setup-preset-library-desc">{selected.description}</span>}
            {feedback && <span className="gn-setup-preset-library-desc" style={{ color: "var(--gn-text)", fontWeight: 500 }}>{feedback}</span>}
            {hasParams && selected && selected.params && (
                <details className="gn-setup-preset-params" role="group" aria-label="Advanced preset parameters">
                    <summary className="gn-setup-preset-params-header">
                        <span className="gn-setup-preset-params-title">Advanced preset parameters</span>
                        <span className="gn-setup-preset-params-count">{Object.keys(selected.params).length} values</span>
                        <button
                            type="button"
                            className="gn-link-btn gn-setup-preset-params-reset"
                            onClick={e => {
                                e.preventDefault();
                                resetParams();
                            }}
                            title="Restore each field to the preset's recommended default"
                        >
                            Reset to defaults
                        </button>
                    </summary>
                    <p className="gn-setup-preset-params-help">
                        Optional tuning for this preset. Most authors can keep the defaults; adjust only when your KPI thresholds or currency differ.
                    </p>
                    {Object.keys(selected.params).map(key => {
                        const def = selected.params![key];
                        const inputType = (def.type === "currency" || def.type === "percent" || def.type === "number") ? "number" : "text";
                        const placeholder = String(def.default ?? "");
                        const value = paramValues[key] ?? "";
                        const label = presetParamLabel(def.label, def.type);
                        return (
                            <label key={key} className="gn-setup-preset-param-row">
                                <span className="gn-setup-preset-param-label">
                                    {label}
                                    {def.type === "percent" && <span aria-hidden="true"> (%)</span>}
                                </span>
                                <input
                                    type={inputType}
                                    inputMode={inputType === "number" ? "decimal" : undefined}
                                    value={value}
                                    placeholder={placeholder}
                                    onChange={e => setParamValues(prev => ({ ...prev, [key]: e.target.value }))}
                                    aria-label={label}
                                    title={def.description ?? label}
                                    maxLength={64}
                                />
                                {def.description && (
                                    <span className="gn-setup-preset-param-desc">{def.description}</span>
                                )}
                            </label>
                        );
                    })}
                </details>
            )}
        </div>
    );
}

export function MetricDirectionPresetPicker(props: {
    currentDomain: string;
    onApplyDomain: (v: string) => void;
    onApplyRules: (rules: string) => void;
}) {
    const [selectedId, setSelectedId] = React.useState("");
    const selected = METRIC_DIRECTION_PRESETS.find(p => p.id === selectedId);
    const relatedPresets = props.currentDomain.trim()
        ? METRIC_DIRECTION_PRESETS.filter(p => isDomainRelated(props.currentDomain, p.domain))
        : [];
    const otherPresets = relatedPresets.length
        ? METRIC_DIRECTION_PRESETS.filter(p => !isDomainRelated(props.currentDomain, p.domain))
        : METRIC_DIRECTION_PRESETS;
    const apply = (preset: MetricDirectionPreset | undefined) => {
        if (!preset) return;
        if (!props.currentDomain.trim()) props.onApplyDomain(preset.domain);
        props.onApplyRules(preset.rules);
    };
    return (
        <div className="gn-setup-preset-library">
            <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                aria-label="Metric direction preset library"
                title="Apply generated metric direction rules"
            >
                <option value="">Choose a metric-rules preset</option>
                {relatedPresets.length > 0 && (
                    <optgroup label={`Recommended for ${props.currentDomain.trim()}`}>
                        {relatedPresets.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </optgroup>
                )}
                <optgroup label={relatedPresets.length > 0 ? "Other presets" : "All presets"}>
                    {otherPresets.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </optgroup>
            </select>
            <button
                type="button"
                className="gn-btn gn-btn--compact"
                disabled={!selected}
                onClick={() => apply(selected)}
                title={selected ? selected.description : "Choose a metric direction preset"}
            >
                Apply rules
            </button>
            {selected && <span className="gn-setup-preset-library-desc">{selected.description}</span>}
        </div>
    );
}

/**
 * Wave 40 — form-first Knowledge Base metric editor wrapper.
 *
 * Owns the MetricRule[] state, hydrates from the two legacy draft fields
 * (metricDirectionRules text + insightsMetricDirections JSON) on first mount,
 * and re-derives both legacy fields on every form change so downstream prompt
 * + renderer consumers see consistent data without any manual sync step.
 *
 * Drift detection: if both legacy fields had values that produced different
 * rule sets (e.g. author edited prose without regenerating JSON pre-Wave 40),
 * a yellow advisory banner appears asking the author to confirm which version
 * to keep. Clicking either button rewrites both legacy fields from the chosen
 * source so the form is the single source going forward.
 */
export function MetricKnowledgeBaseEditor(props: {
    currentDomain?: string;
    legacyText: string;
    legacyJson: string;
    onApplyDomain?: (domain: string) => void;
    onApplyText: (text: string) => void;
    onApplyJson: (json: string) => void;
    /** Wave 41 cycle 12 — per-card suggest callback. Hosts (the SetupPanel
     *  in visual.tsx) pass an async fetcher that calls
     *  fetchSuggestedMetricRules on the active client for the single metric
     *  named on the card and returns the first matching rule. Undefined =
     *  feature disabled (no client / disconnected state). */
    onSuggestForCard?: (rule: MetricRule, idx: number) =>
        | MetricRule
        | undefined
        | Promise<MetricRule | undefined>;
}) {
    // Hydrate ONCE from the legacy fields. After that, the form's own state
    // is authoritative — we don't reseed on every props.legacyText change
    // (which would happen because we ourselves write to that field on every
    // form change, creating a feedback loop / cursor-jumping behaviour).
    // Intentionally empty deps — re-hydrating on prop changes would create
    // a feedback loop with our own onApply* callbacks. The lint rule for
    // exhaustive-deps isn't loaded in this project, so the existing
    // pattern at line 1079 uses the same shape (no disable comment needed).
    const initial = React.useMemo(
        () => migrateLegacy(props.legacyText, props.legacyJson),
        []
    );
    const [rules, setRules] = React.useState<MetricRule[]>(initial.rules);
    const [drift, setDrift] = React.useState(initial.drift);
    const [driftAlternative] = React.useState<{
        proseRules?: MetricRule[];
        jsonRules?: MetricRule[];
    }>({ proseRules: initial.proseRules, jsonRules: initial.jsonRules });

    const handleChange = React.useCallback((next: MetricRule[]) => {
        setRules(next);
        // Derive both legacy fields and write them back. The empty-string
        // case clears the legacy field cleanly so a fully-emptied form
        // doesn't leave a stale "[]" or trailing prose.
        props.onApplyText(rulesToProse(next));
        props.onApplyJson(rulesToJson(next));
    }, [props]);

    const dismissDrift = (chosen: MetricRule[]) => {
        setDrift(false);
        handleChange(chosen);
    };

    return (
        <div className="gn-metric-kb-editor">
            {drift && (
                <div className="gn-metric-kb-drift" role="alert">
                    <strong>Heads up:</strong> the existing free-text rules and the structured JSON map do not match. They likely drifted apart during earlier edits. Pick which version to keep below; the form will be the single source of truth from now on.
                    <div className="gn-metric-kb-drift-actions">
                        {driftAlternative.proseRules && (
                            <button
                                type="button"
                                className="gn-btn gn-btn--compact"
                                onClick={() => dismissDrift(driftAlternative.proseRules!)}
                            >
                                Keep text version ({driftAlternative.proseRules.length} rules)
                            </button>
                        )}
                        {driftAlternative.jsonRules && (
                            <button
                                type="button"
                                className="gn-btn gn-btn--compact"
                                onClick={() => dismissDrift(driftAlternative.jsonRules!)}
                            >
                                Keep JSON version ({driftAlternative.jsonRules.length} rules)
                            </button>
                        )}
                    </div>
                </div>
            )}
            <MetricDirectionPresetPicker
                currentDomain={props.currentDomain || ""}
                onApplyDomain={props.onApplyDomain || (() => { /* optional */ })}
                onApplyRules={prose => {
                    // Preset library still emits prose; convert to rules and
                    // funnel through the form's state so JSON + prose stay in
                    // lock-step.
                    const parsed = proseToRules(prose);
                    if (parsed.length) handleChange(parsed);
                }}
            />
            <MetricRuleForm
                rules={rules}
                onChange={handleChange}
                onSuggestForCard={props.onSuggestForCard}
            />
        </div>
    );
}

/**
 * IDEA-043 (Session 56) — universal-stage editor.
 *
 * Renders 4 system-section cards (HEADLINE+KPI / TRENDS / RISKS / RECOMMENDED
 * ACTIONS) above the user-defined custom sections. Each card supports:
 *
 *   • Show ⇢ Hide toggle  — when hidden, the pipeline skips that stage entirely
 *   • Edit instruction    — opens an inline textarea; non-empty value overrides
 *                           the built-in stage prompt body (the heading + scope
 *                           contracts stay in place so the renderer still finds
 *                           the section)
 *   • Restore default     — clears the override (built-in prompt applies again)
 *
 * Lives in the same area as CustomSectionsEditor so authors see all sections —
 * docked + custom — in one consistent Edit/Hide UI.
 */
type UniversalStageDef = {
    title: string;
    visibilityField: keyof SetupDraft & ("insightsShowHeadline" | "insightsShowTrends" | "insightsShowRisks" | "insightsShowActions");
    overrideField: keyof SetupDraft & ("insightsHeadlineOverride" | "insightsTrendsOverride" | "insightsRisksOverride" | "insightsActionsOverride");
    builtinSummary: string;
};

const UNIVERSAL_STAGES: UniversalStageDef[] = [
    { title: "HEADLINE + KPI SNAPSHOT", visibilityField: "insightsShowHeadline", overrideField: "insightsHeadlineOverride", builtinSummary: "1-sentence headline with the most important number + change vs prior period, followed by a KPI pipe table covering each bound metric." },
    { title: "TRENDS",                  visibilityField: "insightsShowTrends",   overrideField: "insightsTrendsOverride",   builtinSummary: "3-5 directional bullets for each bound metric, using the same period granularity as HEADLINE." },
    { title: "RISKS",                   visibilityField: "insightsShowRisks",    overrideField: "insightsRisksOverride",    builtinSummary: "Top 3 risks or warning signs in the bound period: declining metrics, concentration risk, anomalies. Bold headers." },
    { title: "RECOMMENDED ACTIONS",     visibilityField: "insightsShowActions",  overrideField: "insightsActionsOverride",  builtinSummary: "Exactly 3 numbered actions a domain owner can take this week. Imperative verb + specific target + expected impact." },
];

export function UniversalStagesEditor(props: {
    draft: SetupDraft;
    setField: (name: keyof SetupDraft, value: string) => void;
    setBool: (name: keyof SetupDraft, value: boolean) => void;
}) {
    const [editingTitle, setEditingTitle] = React.useState<string | null>(null);
    const [draftOverride, setDraftOverride] = React.useState<string>("");

    const beginEdit = (def: UniversalStageDef) => {
        setEditingTitle(def.title);
        setDraftOverride(String(props.draft[def.overrideField] ?? ""));
    };
    const saveEdit = (def: UniversalStageDef) => {
        props.setField(def.overrideField, draftOverride);
        setEditingTitle(null);
    };
    const cancelEdit = () => { setEditingTitle(null); };
    const restoreDefault = (def: UniversalStageDef) => {
        props.setField(def.overrideField, "");
    };

    return (
        <div className="gn-universal-stages" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {UNIVERSAL_STAGES.map(def => {
                const visible = !!props.draft[def.visibilityField];
                const override = String(props.draft[def.overrideField] ?? "").trim();
                const isEditing = editingTitle === def.title;
                return (
                    <div
                        key={def.title}
                        className={`gn-section-card gn-section-card--system${visible ? "" : " gn-section-card--hidden"}`}
                        style={{
                            border: "1px solid var(--gn-border, #e0e0e0)",
                            borderRadius: 8,
                            padding: 10,
                            background: visible ? "var(--gn-accent-soft, rgba(120, 130, 150, 0.04))" : "var(--gn-surface-muted, rgba(120, 130, 150, 0.06))",
                            opacity: visible ? 1 : 0.7,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ color: "var(--gn-accent, #1a6fd4)" }}>## {def.title}</strong>
                            <span
                                className="gn-pill gn-pill--compact"
                                style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999 }}
                                title={override ? "An author-supplied instruction is overriding the built-in default." : "The built-in stage prompt is in use."}
                            >
                                {override ? "Custom override" : "Built-in default"}
                            </span>
                            {!visible && (
                                <span className="gn-pill gn-pill--compact" style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--gn-error-soft, rgba(178, 32, 32, 0.1))", color: "var(--gn-error, #b22020)" }}>
                                    Hidden: skipped at runtime
                                </span>
                            )}
                            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                                <button type="button" className="gn-btn gn-btn--ghost" onClick={() => beginEdit(def)} disabled={isEditing}>Edit</button>
                                {override && (
                                    <button type="button" className="gn-btn gn-btn--ghost" onClick={() => restoreDefault(def)} title="Clear the override and use the built-in default again">Restore default</button>
                                )}
                                <button
                                    type="button"
                                    className="gn-btn gn-btn--ghost"
                                    onClick={() => props.setBool(def.visibilityField, !visible)}
                                    title={visible ? "Hide this stage from the AI Insights output" : "Show this stage in the AI Insights output"}
                                >
                                    {visible ? "Hide" : "Show"}
                                </button>
                            </span>
                        </div>
                        {!isEditing && (
                            <p className="gn-setup-field-hint" style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.85 }}>
                                {override
                                    ? <span><em>Override (active):</em> {override.length > 200 ? override.slice(0, 200) + "..." : override}</span>
                                    : <span><em>Built-in:</em> {def.builtinSummary}</span>}
                            </p>
                        )}
                        {isEditing && (
                            <div style={{ marginTop: 8 }}>
                                <textarea
                                    rows={4}
                                    value={draftOverride}
                                    onChange={e => setDraftOverride(e.target.value)}
                                    placeholder={def.builtinSummary}
                                    style={{ width: "100%", fontSize: 12, padding: 6 }}
                                />
                                <p className="gn-setup-field-hint" style={{ margin: "4px 0 6px", fontSize: 11, opacity: 0.8 }}>
                                    Replaces the built-in instruction body for the <strong>## {def.title}</strong> stage. Leave blank to use the default. The heading-first contract still applies.
                                </p>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button type="button" className="gn-btn gn-btn--primary" onClick={() => saveEdit(def)}>Save</button>
                                    <button type="button" className="gn-btn gn-btn--ghost" onClick={cancelEdit}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="gn-setup-field-hint" style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>
                These are the <em>docked</em> universal stages. They wrap your custom sections (HEADLINE/TRENDS at the start, RISKS/RECOMMENDED ACTIONS at the end). Hide any you don't want in the output, or paste a custom instruction to override the default behavior.
            </p>
        </div>
    );
}

export function CustomSectionsEditor(props: { value: string; onChange: (json: string) => void; apiBaseUrl?: string; assistantProfile?: string; proxyKey?: string; sqlCtePreamble?: string; onOpenSqlConfig?: () => void }) {
    const sections = parseCustomSections(props.value);
    const update = (next: HybridCustomSection[]) => props.onChange(JSON.stringify(next));
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
    const [adding, setAdding] = React.useState(false);
    const [draftName, setDraftName] = React.useState("");
    const [draftInstr, setDraftInstr] = React.useState("");
    // Wave 35 Phase 2 — SQL section draft state. The DraftForm reuses these
    // fields when draftKind === "sql" instead of `instruction`.
    const [draftKind, setDraftKind] = React.useState<"ai" | "sql">("ai");
    const [draftSql, setDraftSql] = React.useState("");
    const [draftRender, setDraftRender] = React.useState<"kpi" | "table" | "chart">("kpi");
    const [draftNumberStyle, setDraftNumberStyle] = React.useState<"" | "currency" | "percent" | "compact">("");
    const [draftShowDelta, setDraftShowDelta] = React.useState(false);
    // Bulk-paste JSON mode — replaces the entire sections list in one paste
    // instead of forcing card-by-card entry. Useful for trying frameworks
    // from docs/AI_INSIGHTS_PROMPT_LIBRARY.md.
    const [pasting, setPasting] = React.useState(false);
    const [pasteText, setPasteText] = React.useState("");
    const [pasteError, setPasteError] = React.useState<string | null>(null);

    const startAdd = () => {
        setAdding(true);
        setEditingIdx(null);
        setPasting(false);
        setDraftName("");
        setDraftInstr("");
        setDraftKind("ai");
        setDraftSql("");
        setDraftRender("kpi");
        setDraftNumberStyle("");
        setDraftShowDelta(false);
    };
    const startAddSql = () => {
        startAdd();
        setDraftKind("sql");
        setDraftRender("kpi");
    };
    const startPaste = () => {
        setPasting(true);
        setAdding(false);
        setEditingIdx(null);
        setPasteText(props.value && parseCustomSections(props.value).length ? props.value : "");
        setPasteError(null);
    };
    const cancelPaste = () => {
        setPasting(false);
        setPasteText("");
        setPasteError(null);
    };
    const applyPaste = () => {
        const raw = pasteText.trim();
        if (!raw) { setPasteError("Empty — paste a JSON array of {name, instruction} entries."); return; }
        let parsed: unknown;
        try { parsed = JSON.parse(raw); }
        catch (e) { setPasteError(`JSON parse error: ${(e as Error).message}`); return; }
        if (!Array.isArray(parsed)) { setPasteError("Top-level value must be a JSON array."); return; }
        const cleaned: HybridCustomSection[] = [];
        for (let i = 0; i < parsed.length; i++) {
            const entry = parsed[i] as Record<string, unknown>;
            if (!entry || typeof entry !== "object") { setPasteError(`Entry ${i + 1} is not an object.`); return; }
            const name = typeof entry.name === "string" ? entry.name.trim() : "";
            const instruction = typeof entry.instruction === "string" ? entry.instruction.trim() : "";
            const kind = entry.kind === "sql" ? "sql" : "ai";
            if (!name) { setPasteError(`Entry ${i + 1} is missing a non-empty "name" field.`); return; }
            if (kind === "sql") {
                const sql = typeof entry.sql === "string" ? entry.sql.trim() : "";
                if (!sql) { setPasteError(`Entry ${i + 1} ("${name}") is SQL but is missing a non-empty "sql" field.`); return; }
                if (/\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE|MERGE|CREATE|REPLACE)\b/i.test(sql)) {
                    setPasteError(`Entry ${i + 1} ("${name}") contains a forbidden SQL keyword. SQL sections must be SELECT only.`);
                    return;
                }
                const resultRender = entry.resultRender === "table" || entry.resultRender === "chart" ? entry.resultRender : "kpi";
                const rawFormat = entry.format && typeof entry.format === "object" ? entry.format as Record<string, unknown> : {};
                const fmt: HybridCustomSection["format"] = {};
                if (rawFormat.numberStyle === "currency" || rawFormat.numberStyle === "percent" || rawFormat.numberStyle === "compact") {
                    fmt.numberStyle = rawFormat.numberStyle;
                }
                if (rawFormat.showPriorPeriodDelta === true) fmt.showPriorPeriodDelta = true;
                cleaned.push({
                    name,
                    instruction: "",
                    kind: "sql",
                    sql,
                    resultRender,
                    format: Object.keys(fmt).length > 0 ? fmt : undefined,
                });
            } else {
                if (!instruction) { setPasteError(`Entry ${i + 1} ("${name}") is missing a non-empty "instruction" field.`); return; }
                cleaned.push({ name, instruction });
            }
        }
        update(cleaned);
        cancelPaste();
    };
    // Session 53.X — export the current sections as pretty-printed JSON,
    // copy to clipboard with a 2s "Copied!" feedback. Falls back to a
    // textarea-select if the navigator.clipboard API isn't available
    // (older PBI Desktop sandbox). Useful for sharing a framework you
    // tweaked, archiving for git commit, or pasting into another visual.
    const [exportFeedback, setExportFeedback] = React.useState<string | null>(null);
    const exportJson = () => {
        const pretty = JSON.stringify(sections, null, 2);
        const fallback = () => {
            try {
                const ta = document.createElement("textarea");
                ta.value = pretty;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                setExportFeedback(`Copied ${sections.length} section(s) to clipboard.`);
            } catch (e) {
                setExportFeedback(`Copy failed (${(e as Error).message}). Open browser DevTools console to grab the JSON.`);
                // Best-effort: stash on window so user can pick it up.
                try { (window as unknown as { __dwdInsightsSectionsJson?: string }).__dwdInsightsSectionsJson = pretty; } catch { /* sandboxed */ }
            }
            window.setTimeout(() => setExportFeedback(null), 4000);
        };
        try {
            const nav = navigator as unknown as { clipboard?: { writeText: (s: string) => Promise<void> } };
            if (nav.clipboard?.writeText) {
                nav.clipboard.writeText(pretty).then(
                    () => {
                        setExportFeedback(`Copied ${sections.length} section(s) to clipboard.`);
                        window.setTimeout(() => setExportFeedback(null), 2000);
                    },
                    () => fallback()
                );
            } else {
                fallback();
            }
        } catch {
            fallback();
        }
    };
    const startEdit = (i: number) => {
        setEditingIdx(i);
        setAdding(false);
        const s = sections[i];
        setDraftName(s.name);
        setDraftInstr(s.instruction);
        setDraftKind(s.kind === "sql" ? "sql" : "ai");
        setDraftSql(s.sql || "");
        setDraftRender(s.resultRender || "kpi");
        setDraftNumberStyle((s.format?.numberStyle as "currency" | "percent" | "compact") || "");
        setDraftShowDelta(!!s.format?.showPriorPeriodDelta);
    };
    const cancelDraft = () => {
        setEditingIdx(null);
        setAdding(false);
        setDraftName("");
        setDraftInstr("");
        setDraftKind("ai");
        setDraftSql("");
        setDraftRender("kpi");
        setDraftNumberStyle("");
        setDraftShowDelta(false);
    };
    const saveDraft = () => {
        const name = draftName.trim();
        if (!name) return;
        // Wave 35 Phase 2 — branch on kind. SQL sections need a non-empty
        // `sql`, AI sections need a non-empty `instruction`.
        let next: HybridCustomSection;
        if (draftKind === "sql") {
            const sql = draftSql.trim();
            if (!sql) return;
            const fmt: HybridCustomSection["format"] = {};
            if (draftNumberStyle) fmt.numberStyle = draftNumberStyle;
            if (draftShowDelta) fmt.showPriorPeriodDelta = true;
            next = {
                name,
                instruction: "", // SQL sections don't carry prompt text
                kind: "sql",
                sql,
                resultRender: draftRender,
                format: Object.keys(fmt).length > 0 ? fmt : undefined,
            };
        } else {
            const instruction = draftInstr.trim();
            if (!instruction) return;
            next = { name, instruction };
        }
        if (adding) {
            update([...sections, next]);
        } else if (editingIdx !== null) {
            update(sections.map((s, j) => j === editingIdx ? next : s));
        }
        cancelDraft();
    };
    // Wave 35 Phase 2 — confirm before discarding SQL when switching kind.
    const tryChangeKind = (nextKind: "ai" | "sql") => {
        if (nextKind === draftKind) return;
        if (draftKind === "sql" && draftSql.trim().length > 0 && nextKind === "ai") {
            const ok = window.confirm("Switching from SQL to AI prompt will clear the SQL body. Continue?");
            if (!ok) return;
            setDraftSql("");
        }
        setDraftKind(nextKind);
    };
    const deleteSection = (i: number) => update(sections.filter((_, j) => j !== i));
    const moveUp = (i: number) => {
        if (i === 0) return;
        const next = [...sections];
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        update(next);
    };
    const moveDown = (i: number) => {
        if (i === sections.length - 1) return;
        const next = [...sections];
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        update(next);
    };

    return (
        <div className="gn-setup-section-list">
            {!adding && !pasting && editingIdx === null && (
                <div className="gn-setup-sql-section-callout">
                    <div>
                        <strong>Need exact numbers from SQL?</strong>
                        <span> Add a deterministic SQL section here. It renders as an Insights card and still uses Section H CTE, forbidden-table rules, proxy auth, and SELECT-only validation.</span>
                    </div>
                    <div className="gn-setup-sql-section-callout-actions">
                        <button type="button" className="gn-pill gn-pill--compact" onClick={startAddSql}>
                            + Add SQL section
                        </button>
                        {props.onOpenSqlConfig && (
                            <button type="button" className="gn-pill gn-pill--compact" onClick={props.onOpenSqlConfig}>
                                Open SQL config
                            </button>
                        )}
                    </div>
                </div>
            )}
            {sections.length === 0 && !adding && (
                <div className="gn-setup-section-list-empty">
                    No custom sections yet. The AI will produce only the universal
                    sections (HEADLINE + KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED ACTIONS).
                    Add AI sections for narrative cards, or SQL sections for deterministic cards loaded through the proxy.
                </div>
            )}
            {sections.map((s, i) => (
                <div key={i} className={`gn-setup-section-card${editingIdx === i ? " gn-setup-section-card--editing" : ""}${s.kind === "sql" ? " gn-setup-section-card--sql" : ""}`}>
                    {editingIdx === i ? (
                        <DraftForm
                            name={draftName} setName={setDraftName}
                            instr={draftInstr} setInstr={setDraftInstr}
                            kind={draftKind} setKind={tryChangeKind}
                            sql={draftSql} setSql={setDraftSql}
                            resultRender={draftRender} setResultRender={setDraftRender}
                            numberStyle={draftNumberStyle} setNumberStyle={setDraftNumberStyle}
                            showDelta={draftShowDelta} setShowDelta={setDraftShowDelta}
                            onSave={saveDraft} onCancel={cancelDraft}
                            apiBaseUrl={props.apiBaseUrl} assistantProfile={props.assistantProfile}
                            proxyKey={props.proxyKey} sqlCtePreamble={props.sqlCtePreamble}
                        />
                    ) : (
                        <>
                            <div className="gn-setup-section-card-head">
                                <strong>## {s.name.toUpperCase()}</strong>
                                {s.kind === "sql" && (
                                    <span className="gn-setup-section-card-tag" title="Custom SQL Authoring Mode — deterministic, executed against the warehouse" style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 3, background: "var(--gn-accent-soft, rgba(26,111,212,0.12))", color: "var(--gn-accent, #1a6fd4)", fontSize: 11, fontWeight: 600 }}>SQL</span>
                                )}
                                <div className="gn-setup-section-card-actions">
                                    <button type="button" onClick={() => moveUp(i)} disabled={i === 0} title="Move up">Up</button>
                                    <button type="button" onClick={() => moveDown(i)} disabled={i === sections.length - 1} title="Move down">Down</button>
                                    <button type="button" onClick={() => startEdit(i)} title="Edit">Edit</button>
                                    <button type="button" onClick={() => deleteSection(i)} title="Delete" className="gn-setup-section-card-delete">Delete</button>
                                </div>
                            </div>
                            {s.kind === "sql" ? (
                                <div className="gn-setup-section-card-instr" style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                                    {(s.sql || "").length > 200 ? `${(s.sql || "").slice(0, 200)}...` : (s.sql || "")}
                                    <div style={{ marginTop: 4, color: "var(--gn-text-muted, #666)", fontFamily: "inherit", fontSize: 11 }}>
                                        Render: {s.resultRender || "kpi"}
                                        {s.format?.numberStyle ? ` | ${s.format.numberStyle}` : ""}
                                        {s.format?.showPriorPeriodDelta ? " | prior-period delta" : ""}
                                    </div>
                                </div>
                            ) : (
                                <div className="gn-setup-section-card-instr">{s.instruction}</div>
                            )}
                        </>
                    )}
                </div>
            ))}
            {adding && (
                <div className="gn-setup-section-card gn-setup-section-card--editing">
                    <DraftForm
                        name={draftName} setName={setDraftName}
                        instr={draftInstr} setInstr={setDraftInstr}
                        kind={draftKind} setKind={tryChangeKind}
                        sql={draftSql} setSql={setDraftSql}
                        resultRender={draftRender} setResultRender={setDraftRender}
                        numberStyle={draftNumberStyle} setNumberStyle={setDraftNumberStyle}
                        showDelta={draftShowDelta} setShowDelta={setDraftShowDelta}
                        onSave={saveDraft} onCancel={cancelDraft}
                        apiBaseUrl={props.apiBaseUrl} assistantProfile={props.assistantProfile}
                        proxyKey={props.proxyKey} sqlCtePreamble={props.sqlCtePreamble}
                    />
                </div>
            )}
            {pasting && (
                <div className="gn-setup-section-card gn-setup-section-card--editing">
                    <div className="gn-setup-section-draft">
                        <label>
                            <span>Paste JSON array (replaces ALL sections)</span>
                            <textarea
                                rows={8}
                                value={pasteText}
                                onChange={e => { setPasteText(e.target.value); setPasteError(null); }}
                                placeholder={'[\n  { "name": "STRENGTHS", "instruction": "..." },\n  { "name": "WEAKNESSES", "instruction": "..." }\n]'}
                                style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}
                            />
                        </label>
                        {pasteError && (
                            <div className="gn-setup-section-card-instr" style={{ color: "var(--gn-red, #d83b01)", fontSize: 12 }}>{pasteError}</div>
                        )}
                        <div className="gn-setup-section-card-actions" style={{ marginTop: 6 }}>
                            <button type="button" onClick={applyPaste}>Apply</button>
                            <button type="button" onClick={cancelPaste}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
            {!adding && !pasting && editingIdx === null && (
                <div className="gn-setup-section-card-actions" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="gn-setup-section-add" onClick={startAdd}>
                        + Add AI section
                    </button>
                    <button type="button" className="gn-setup-section-add" onClick={startAddSql}>
                        + Add SQL section
                    </button>
                    <button type="button" onClick={startPaste} title="Paste a JSON array; replaces all current sections in one operation">
                        Paste JSON
                    </button>
                    <button
                        type="button"
                        onClick={exportJson}
                        disabled={sections.length === 0}
                        title={sections.length === 0
                            ? "No sections to export; add or paste sections first"
                            : "Copy the current sections list as pretty-printed JSON to clipboard"}
                    >
                        Export JSON
                    </button>
                    {exportFeedback && (
                        <span style={{ fontSize: 12, color: "var(--gn-text-muted, #999)", marginLeft: 6 }}>
                            {exportFeedback}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

interface DraftFormProps {
    name: string; setName: (v: string) => void;
    instr: string; setInstr: (v: string) => void;
    onSave: () => void; onCancel: () => void;
    // Wave 35 Phase 2 — section-kind dropdown + SQL fields. All optional so
    // existing callers (none remain in-tree, but other test fixtures may
    // exercise the AI-only form) continue to compile.
    kind?: "ai" | "sql";
    setKind?: (k: "ai" | "sql") => void;
    sql?: string; setSql?: (v: string) => void;
    resultRender?: "kpi" | "table" | "chart";
    setResultRender?: (v: "kpi" | "table" | "chart") => void;
    numberStyle?: "" | "currency" | "percent" | "compact";
    setNumberStyle?: (v: "" | "currency" | "percent" | "compact") => void;
    showDelta?: boolean;
    setShowDelta?: (v: boolean) => void;
    /** Wave 35 Phase 2 — proxy connection details for the Test Query button.
     *  When omitted, the button is hidden and the author must rely on EXPLAIN
     *  semantics on save. */
    apiBaseUrl?: string;
    assistantProfile?: string;
    proxyKey?: string;
    sqlCtePreamble?: string;
}

function DraftForm(props: DraftFormProps) {
    const kind = props.kind ?? "ai";
    const isSql = kind === "sql";
    // Wave 35 — Test Query state. Local to the draft so closing without
    // saving doesn't pollute the section list.
    const [testState, setTestState] = React.useState<"idle" | "running" | "ok" | "err">("idle");
    const [testColumns, setTestColumns] = React.useState<string[]>([]);
    const [testRows, setTestRows] = React.useState<unknown[][]>([]);
    const [testError, setTestError] = React.useState<string>("");
    const [testTruncated, setTestTruncated] = React.useState<boolean>(false);
    const validationErrors = React.useMemo<string[]>(() => {
        if (!isSql) return [];
        const errs: string[] = [];
        const sql = (props.sql || "").trim();
        if (!sql) errs.push("SQL body is empty.");
        // Mirror the runtime forbidden-keyword check so the editor surfaces
        // it before the proxy round-trip.
        if (/\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE|MERGE|CREATE|REPLACE)\b/i.test(sql)) {
            errs.push("Contains a forbidden DML/DDL keyword. Custom SQL sections must be SELECT only.");
        }
        let depth = 0;
        for (let i = 0; i < sql.length; i++) {
            const ch = sql.charCodeAt(i);
            if (ch === 40) depth++;
            else if (ch === 41) {
                depth--;
                if (depth < 0) { errs.push("Unbalanced parentheses (extra closing)."); break; }
            }
        }
        if (depth > 0) errs.push("Unbalanced parentheses (unclosed opening).");
        return errs;
    }, [isSql, props.sql]);

    const runTest = async () => {
        setTestState("running");
        setTestError("");
        setTestColumns([]);
        setTestRows([]);
        setTestTruncated(false);
        try {
            const base = (props.apiBaseUrl || "").replace(/\/$/, "");
            if (!base) throw new Error("Proxy URL is not configured. Set the AI Proxy URL in Setup before testing SQL.");
            const url = `${base}/sql/preview`;
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (props.proxyKey) headers["X-Genie-Key"] = props.proxyKey;
            if (props.assistantProfile) headers["X-Assistant-Profile"] = props.assistantProfile;
            const body = JSON.stringify({
                sql: props.sql || "",
                sectionH_cteHeader: props.sqlCtePreamble || "",
                assistantProfile: props.assistantProfile || ""
            });
            // Use XMLHttpRequest, never fetch — PBI Desktop sandbox blocks fetch.
            const data: { ok: boolean; columns?: string[]; rows?: unknown[][]; error?: string; truncated?: boolean } = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", url, true);
                Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try { resolve(JSON.parse(xhr.responseText || "{}")); }
                        catch { reject(new Error("Invalid JSON response from proxy.")); }
                    } else {
                        try {
                            const parsed = JSON.parse(xhr.responseText || "{}");
                            reject(new Error(parsed.error || `Proxy returned status ${xhr.status}.`));
                        } catch {
                            reject(new Error(`Proxy returned status ${xhr.status}.`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error("Network error reaching the proxy. Is the AI Proxy running?"));
                xhr.send(body);
            });
            if (!data.ok) {
                setTestState("err");
                setTestError(data.error || "Validation failed.");
                return;
            }
            setTestState("ok");
            setTestColumns(data.columns || []);
            setTestRows((data.rows || []).slice(0, 100));
            setTestTruncated(!!data.truncated);
        } catch (e) {
            setTestState("err");
            setTestError((e as Error).message);
        }
    };

    const saveDisabled = !props.name.trim() || (isSql ? !((props.sql || "").trim()) || validationErrors.length > 0 : !props.instr.trim());

    return (
        <div className="gn-setup-section-draft">
            {/* Wave 35 Phase 2 — section-type dropdown above the title input. */}
            {props.setKind && (
                <label>
                    <span>Section type</span>
                    <select
                        value={kind}
                        onChange={e => props.setKind?.((e.target.value === "sql") ? "sql" : "ai")}
                    >
                        <option value="ai">AI prompt (default)</option>
                        <option value="sql">SQL query (deterministic)</option>
                    </select>
                </label>
            )}
            <label>
                <span>Section name</span>
                <input
                    type="text"
                    value={props.name}
                    onChange={e => props.setName(e.target.value)}
                    placeholder={isSql ? "e.g. REVENUE YTD, ON-TIME %, OPEN INCIDENTS" : "e.g. GAP ANALYSIS, OTIF DRIVERS, ROOT CAUSES"}
                />
            </label>
            {!isSql && (
                <label>
                    <span>Instruction</span>
                    <textarea
                        rows={3}
                        value={props.instr}
                        onChange={e => props.setInstr(e.target.value)}
                        placeholder="e.g. Identify the largest gap between target and actual OTIF; bold the affected SKU family. Max 25 words."
                    />
                </label>
            )}
            {isSql && (
                <>
                    <label>
                        <span>SQL body (read-only SELECT; Section H CTE is auto-prepended)</span>
                        <textarea
                            rows={6}
                            value={props.sql || ""}
                            onChange={e => props.setSql?.(e.target.value)}
                            placeholder={"-- Reference scoped tables from your Section H CTE preamble.\nSELECT SUM(amount) AS revenue\nFROM scoped_sales\nWHERE order_date >= DATE_TRUNC('year', CURRENT_DATE)"}
                            style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}
                            spellCheck={false}
                        />
                    </label>
                    {validationErrors.length > 0 && (
                        <ul className="gn-setup-section-draft-errors" style={{ margin: "4px 0", paddingLeft: 18, color: "var(--gn-red, #d83b01)", fontSize: 12 }}>
                            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    )}
                    <div className="gn-setup-section-sql-format-row" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                        <label>
                            <span>Result render</span>
                            <select
                                value={props.resultRender || "kpi"}
                                onChange={e => props.setResultRender?.(e.target.value as "kpi" | "table" | "chart")}
                            >
                                <option value="kpi">KPI big-number</option>
                                <option value="table">Table</option>
                                <option value="chart">Chart</option>
                            </select>
                        </label>
                        <label>
                            <span>Number style</span>
                            <select
                                value={props.numberStyle || ""}
                                onChange={e => props.setNumberStyle?.(e.target.value as "" | "currency" | "percent" | "compact")}
                            >
                                <option value="">Auto</option>
                                <option value="currency">Currency ($)</option>
                                <option value="percent">Percent (%)</option>
                                <option value="compact">Compact (K/M/B)</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                                type="checkbox"
                                checked={!!props.showDelta}
                                onChange={e => props.setShowDelta?.(e.target.checked)}
                            />
                            <span>Show prior-period delta</span>
                        </label>
                    </div>
                    <div className="gn-setup-section-sql-test-row" style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            onClick={runTest}
                            disabled={testState === "running" || validationErrors.length > 0 || !((props.sql || "").trim())}
                            className="gn-pill"
                            title={validationErrors.length > 0 ? "Fix validation errors first" : "Run the SQL through the proxy and preview up to 100 rows"}
                        >
                            {testState === "running" ? "Testing..." : "Test Query"}
                        </button>
                        {testState === "ok" && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--gn-green, #107c10)" }}>
                                {testRows.length} row{testRows.length === 1 ? "" : "s"} returned | {testColumns.length} col{testColumns.length === 1 ? "" : "s"}
                                {testTruncated ? " (truncated at 100)" : ""}
                            </span>
                        )}
                        {testState === "err" && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--gn-red, #d83b01)" }}>
                                {testError}
                            </span>
                        )}
                    </div>
                    {testState === "ok" && testColumns.length > 0 && (
                        <div className="gn-setup-section-sql-preview" style={{ marginTop: 6, maxHeight: 200, overflow: "auto", border: "1px solid var(--gn-border, #ccc)", borderRadius: 3 }}>
                            <table className="gn-table" style={{ fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        {testColumns.map((c, i) => <th key={`th-${i}`}>{c}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {testRows.slice(0, 25).map((row, ri) => (
                                        <tr key={`tr-${ri}`}>
                                            {testColumns.map((_c, ci) => {
                                                const v = (row as unknown[])[ci];
                                                return <td key={`td-${ri}-${ci}`}>{v === null || v === undefined ? "" : String(v)}</td>;
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {testRows.length > 25 && (
                                <div className="gn-table-footer" style={{ fontSize: 11 }}>Showing 25 of {testRows.length} rows.</div>
                            )}
                        </div>
                    )}
                </>
            )}
            <div className="gn-setup-section-draft-actions">
                <button type="button" onClick={props.onSave} disabled={saveDisabled} className="gn-pill gn-pill--primary">Save</button>
                <button type="button" onClick={props.onCancel} className="gn-pill">Cancel</button>
            </div>
        </div>
    );
}

// 49.20 / IDEA-037 phase 4 — AI-assisted introspection panel. Sits under the
// Domain field when authoring mode is "ai-assisted". Auto-fires the
// onSuggest callback the first time the panel mounts AND domain + sections
// are both empty. Subsequent runs require an explicit click on "Re-suggest".
//
// Wave 41 cycle 12 — when the suggestion carries `suggestedMetricRules` (the
// new optional array populated by visual.tsx via fetchSuggestedMetricRules),
// an additional "✨ AI suggested N metric rules" panel renders below the
// section list with one checkbox per rule. The author ticks which to apply
// and clicks "Apply selected" — the rules are scrubbed via the metricRulesEngine
// pipeline and merged into the existing metricDirectionRules + insightsMetricDirections
// fields (Wave 40's MetricRuleForm derives both legacy fields automatically).
export function AiAssistedSuggestionPanel(props: {
    onSuggest?: () => Promise<InsightsConfigSuggestion | null>;
    currentDomain: string;
    currentSectionsJson: string;
    onApplyDomain: (domain: string) => void;
    onApplySections: (json: string) => void;
    /** Wave 41 cycle 12 — current metricDirectionRules text (legacy prose field). */
    currentMetricRulesText?: string;
    /** Wave 41 cycle 12 — current insightsMetricDirections JSON (legacy structured field). */
    currentMetricRulesJson?: string;
    /** Wave 41 cycle 12 — apply merged rules back to the legacy text field. */
    onApplyMetricRulesText?: (text: string) => void;
    /** Wave 41 cycle 12 — apply merged rules back to the legacy JSON field. */
    onApplyMetricRulesJson?: (json: string) => void;
}) {
    const [state, setState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
    const [suggestion, setSuggestion] = React.useState<InsightsConfigSuggestion | null>(null);
    const [errorMsg, setErrorMsg] = React.useState("");
    const [copyFeedback, setCopyFeedback] = React.useState<string | null>(null);
    // Wave 41 cycle 12 — per-row tick state for the suggested-metric-rules panel.
    // Map keyed by rule index so re-runs (which replace the suggestion) reset.
    const [selectedRules, setSelectedRules] = React.useState<Record<number, boolean>>({});
    const autoFiredRef = React.useRef(false);

    const isEmpty = !props.currentDomain.trim()
        && parseCustomSections(props.currentSectionsJson).length === 0;

    const runSuggest = React.useCallback(async () => {
        if (!props.onSuggest) {
            setState("error");
            setErrorMsg("No active connection. Configure your AI backend in Sections C/D first, then come back here.");
            return;
        }
        setState("loading");
        setErrorMsg("");
        try {
            const result = await props.onSuggest();
            if (!result) {
                setState("error");
                setErrorMsg("The AI did not return a usable suggestion. This usually means the bound dimensions and measures were too sparse to classify. Add more bindings or pick a Domain manually.");
                return;
            }
            setSuggestion(result);
            // Wave 41 cycle 12 — pre-tick all suggested rules with confidence ≥ 0.75
            // so the common case (high-confidence space-instruction-grounded rules)
            // is one click. Author un-ticks the iffy ones if needed.
            const preTicked: Record<number, boolean> = {};
            (result.suggestedMetricRules || []).forEach((r, i) => {
                if ((r.confidence || 0) >= 0.75) preTicked[i] = true;
            });
            setSelectedRules(preTicked);
            setState("ready");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setState("error");
            setErrorMsg(`Suggestion request failed: ${msg}`);
        }
    }, [props]);

    // Auto-fire once on first mount when the fields are empty AND we have
    // a callback. Avoids spending an LLM call when the author already has
    // a configuration they're tuning.
    React.useEffect(() => {
        if (autoFiredRef.current) return;
        if (!props.onSuggest) return;
        if (!isEmpty) return;
        autoFiredRef.current = true;
        void runSuggest();
    }, []);

    const applyAll = () => {
        if (!suggestion) return;
        if (suggestion.domain) props.onApplyDomain(suggestion.domain);
        if (suggestion.suggestedSections.length > 0) {
            props.onApplySections(JSON.stringify(suggestion.suggestedSections));
        }
    };
    const applyDomainOnly = () => {
        if (!suggestion) return;
        if (suggestion.domain) props.onApplyDomain(suggestion.domain);
    };
    const applySection = (i: number) => {
        if (!suggestion) return;
        const existing = parseCustomSections(props.currentSectionsJson);
        const sec = suggestion.suggestedSections[i];
        if (!sec) return;
        const dedup = existing.filter(x => x.name.toUpperCase() !== sec.name.toUpperCase());
        props.onApplySections(JSON.stringify([...dedup, sec]));
    };
    const dismiss = () => {
        setSuggestion(null);
        setSelectedRules({});
        setState("idle");
    };
    const confLevel = (c: number) => c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low";

    // Wave 41 cycle 12 — merge selected suggested rules into the existing
    // metricDirectionRules text + insightsMetricDirections JSON, scrubbing
    // each name + alias through the metricRulesEngine sanitiser before
    // applying. De-dupes case-insensitively against existing rules so a
    // re-suggest doesn't double up on names already in the form.
    const applySelectedMetricRules = () => {
        if (!suggestion?.suggestedMetricRules?.length) return;
        const picked = suggestion.suggestedMetricRules.filter((_, i) => selectedRules[i]);
        if (picked.length === 0) return;
        // Hydrate existing rules from the legacy fields (mirrors MetricKnowledgeBaseEditor
        // hydration so we land at the same MetricRule[] the form would show).
        const existing = migrateLegacy(
            props.currentMetricRulesText || "",
            props.currentMetricRulesJson || ""
        ).rules;
        const existingKeys = new Set(existing.map(r => r.name.toLowerCase()));
        const merged: MetricRule[] = [...existing];
        for (const sug of picked) {
            const safeName = scrubField(sug.name || "", METRIC_NAME_MAX);
            if (!safeName) continue;
            if (existingKeys.has(safeName.toLowerCase())) continue;
            existingKeys.add(safeName.toLowerCase());
            const safeAliases = (sug.aliases || [])
                .map(a => scrubField(a || "", METRIC_ALIAS_MAX))
                .filter(Boolean);
            // Suggested rules carry amberPct/redPct (no greenPct in the LLM schema —
            // intentional, the form's DEFAULT_GREEN fills that slot). When neither is
            // supplied we leave thresholds undefined so the form's defaults take over.
            const greenPct = sug.higherIsBetter
                ? (typeof sug.amberPct === "number" ? sug.amberPct + 7 : undefined)
                : (typeof sug.amberPct === "number" ? Math.max(0, sug.amberPct - 7) : undefined);
            merged.push({
                name: safeName,
                higherIsBetter: !!sug.higherIsBetter,
                aliases: safeAliases,
                greenPct,
                amberPct: typeof sug.amberPct === "number" ? sug.amberPct : undefined,
                redPct: typeof sug.redPct === "number" ? sug.redPct : undefined
            });
        }
        if (props.onApplyMetricRulesText) props.onApplyMetricRulesText(rulesToProse(merged));
        if (props.onApplyMetricRulesJson) props.onApplyMetricRulesJson(rulesToJson(merged));
        // Mark the merged rows so a re-click shows "already applied" — clear ticks.
        setSelectedRules({});
    };

    const toggleRuleSelected = (idx: number) => {
        setSelectedRules(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const selectedCount = React.useMemo(
        () => Object.values(selectedRules).filter(Boolean).length,
        [selectedRules]
    );

    return (
        <div className="gn-setup-ai-assist">
            <div className="gn-setup-ai-assist-head">
                <strong>AI-assisted suggestion</strong>
                <button
                    type="button"
                    className="gn-pill gn-pill--compact"
                    disabled={state === "loading" || !props.onSuggest}
                    onClick={runSuggest}
                    title={props.onSuggest ? "Re-suggest from data" : "No active connection"}
                >
                    {state === "loading" ? "Analysing data..." : suggestion ? "Suggest again" : "Suggest from data"}
                </button>
            </div>
            {state === "idle" && !suggestion && (
                <p className="gn-setup-field-hint">
                    The AI will look at your bound dimensions and measures and propose a Domain label
                    and 2-4 domain-specific sections. Click <strong>Suggest from data</strong> above.
                </p>
            )}
            {state === "loading" && (
                <p className="gn-setup-field-hint">
                    Sending your bound dimensions/measures to the AI for classification...
                    typically 5-15 seconds.
                </p>
            )}
            {state === "error" && (
                <p className="gn-setup-field-hint" style={{ color: "var(--gn-error, #c92a2a)" }}>
                    Warning: {errorMsg}
                </p>
            )}
            {state === "ready" && suggestion && (
                <div className="gn-setup-ai-assist-result">
                    <div className={`gn-setup-ai-assist-domain gn-setup-ai-assist-domain--${confLevel(suggestion.confidence)}`}>
                        <div className="gn-setup-ai-assist-domain-row">
                            <span className="gn-setup-ai-assist-domain-label">Looks like:</span>
                            <strong>{suggestion.domain || "Generic Analytics"}</strong>
                            <span className="gn-setup-ai-assist-confidence">{Math.round(suggestion.confidence * 100)}%</span>
                            <button type="button" className="gn-pill gn-pill--compact" onClick={applyDomainOnly}>
                                Apply domain only
                            </button>
                        </div>
                        {suggestion.rationale && (
                            <div className="gn-setup-ai-assist-rationale">{suggestion.rationale}</div>
                        )}
                    </div>
                    {suggestion.suggestedSections.length > 0 && (
                        <div className="gn-setup-ai-assist-sections">
                            <div className="gn-setup-ai-assist-sections-head">
                                <span>Suggested sections ({suggestion.suggestedSections.length}):</span>
                            </div>
                            {suggestion.suggestedSections.map((s, i) => (
                                <div key={i} className="gn-setup-ai-assist-section-card">
                                    <div className="gn-setup-ai-assist-section-card-head">
                                        <strong>## {s.name.toUpperCase()}</strong>
                                        <button type="button" className="gn-pill gn-pill--compact" onClick={() => applySection(i)}>+ Add this section</button>
                                    </div>
                                    <div className="gn-setup-ai-assist-section-card-instr">{s.instruction}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Wave 41 cycle 12 — suggested metric direction rules. Only renders
                          when the suggestion carries a non-empty array (the field is
                          optional — pre-Wave 41 callers never populate it). */}
                    {suggestion.suggestedMetricRules && suggestion.suggestedMetricRules.length > 0 && (
                        <div
                            className="gn-setup-ai-assist-metric-rules"
                            data-testid="ai-assist-metric-rules"
                        >
                            <div className="gn-setup-ai-assist-sections-head">
                                <span>
                                    AI suggested {suggestion.suggestedMetricRules.length}{" "}
                                    metric rule{suggestion.suggestedMetricRules.length === 1 ? "" : "s"}
                                </span>
                            </div>
                            <ul className="gn-setup-ai-assist-metric-rules-list" role="list">
                                {suggestion.suggestedMetricRules.map((r, i) => {
                                    const checked = !!selectedRules[i];
                                    const dirLabel = r.higherIsBetter ? "higher is better" : "lower is better";
                                    const thrParts: string[] = [];
                                    if (typeof r.amberPct === "number") thrParts.push(`amber ${r.amberPct}`);
                                    if (typeof r.redPct === "number") thrParts.push(`red ${r.redPct}`);
                                    const sourceTag = (() => {
                                        switch (r.source) {
                                            case "space-instructions": return "Genie space";
                                            case "measure-name": return "Measure name";
                                            case "data-distribution": return "Data distribution";
                                            case "industry-pattern": return "Industry default";
                                            case "section-h-cte": return "Section H CTE";
                                            default: return "";
                                        }
                                    })();
                                    return (
                                        <li
                                            key={i}
                                            className="gn-setup-ai-assist-metric-rule-row"
                                            data-testid={`ai-assist-metric-rule-${i}`}
                                        >
                                            <label className="gn-setup-ai-assist-metric-rule-tick">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleRuleSelected(i)}
                                                    aria-label={`Select ${r.name} for apply`}
                                                />
                                                <span className="gn-setup-ai-assist-metric-rule-name">
                                                    <strong>{r.name}</strong>
                                                    <span className="gn-setup-ai-assist-metric-rule-dir">
                                                        {dirLabel}
                                                    </span>
                                                    {thrParts.length > 0 && (
                                                        <span className="gn-setup-ai-assist-metric-rule-thr">
                                                            {thrParts.join(", ")}
                                                        </span>
                                                    )}
                                                    <span className="gn-setup-ai-assist-confidence">
                                                        {Math.round((r.confidence || 0) * 100)}%
                                                    </span>
                                                </span>
                                            </label>
                                            <div className="gn-setup-ai-assist-metric-rule-rationale">
                                                {sourceTag && (
                                                    <span className="gn-setup-ai-assist-metric-rule-source">
                                                        [{sourceTag}]
                                                    </span>
                                                )}{" "}
                                                {r.rationale}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="gn-setup-ai-assist-metric-rules-actions">
                                <span className="gn-setup-ai-assist-metric-rules-count">
                                    Selected: {selectedCount} of {suggestion.suggestedMetricRules.length}
                                </span>
                                <button
                                    type="button"
                                    className="gn-pill gn-pill--primary gn-pill--compact"
                                    onClick={applySelectedMetricRules}
                                    disabled={selectedCount === 0 || !props.onApplyMetricRulesText}
                                    data-testid="ai-assist-metric-rules-apply"
                                    title={
                                        selectedCount === 0
                                            ? "Tick at least one rule to apply"
                                            : !props.onApplyMetricRulesText
                                            ? "Metric rules apply path not wired"
                                            : "Merge ticked rules into the metric direction rules form"
                                    }
                                >
                                    Apply selected
                                </button>
                                <button
                                    type="button"
                                    className="gn-pill gn-pill--compact"
                                    onClick={() => setSelectedRules({})}
                                    disabled={selectedCount === 0}
                                    title="Untick all rules"
                                >
                                    Skip
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="gn-setup-ai-assist-actions">
                        <button type="button" className="gn-pill gn-pill--primary" onClick={applyAll}>
                            Apply all (Domain + {suggestion.suggestedSections.length} section{suggestion.suggestedSections.length === 1 ? "" : "s"})
                        </button>
                        <button
                            type="button"
                            className="gn-pill"
                            onClick={() => {
                                const pretty = JSON.stringify(suggestion.suggestedSections, null, 2);
                                copyJsonToClipboard(pretty, msg => {
                                    setCopyFeedback(msg);
                                    window.setTimeout(() => setCopyFeedback(null), 2500);
                                });
                            }}
                            title="Copy the suggested sections JSON to clipboard so you can tweak before pasting"
                        >
                            Copy JSON
                        </button>
                        <button type="button" className="gn-pill" onClick={dismiss}>Dismiss</button>
                        {copyFeedback && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--gn-text-muted, #999)" }}>{copyFeedback}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function HybridPreview(props: {
    domain: string;
    customSectionsJson: string;
    universalStages?: { headline?: boolean; trends?: boolean; risks?: boolean; actions?: boolean };
    universalOverrides?: { headline?: string; trends?: string; risks?: string; actions?: string };
}) {
    const customSections = parseCustomSections(props.customSectionsJson);
    // Session 53.Y — per-stage open state so Expand-All / Collapse-All
    // buttons can drive every <details> at once. Bumping `bulkVersion`
    // forces a re-render that re-evaluates each details' `open` prop.
    const [stageOpenMap, setStageOpenMap] = React.useState<Record<number, boolean>>({});
    if (!props.domain.trim() && customSections.length === 0) return null;
    // Build a synthetic context with placeholders so the preview shows what
    // the AI prompt will look like at runtime. Real bindings populate the
    // {dims}/{meas} slots when the visual actually runs.
    const synthContext = {
        dimensions: { "[bound dimensions]": null } as Record<string, unknown>,
        measures: { "[bound measures]": null } as Record<string, unknown>,
        boundFieldNames: [],
        availableFilters: [],
        safeContextText: "",
        mandatoryScopeText: "",
        // PulsePlay port note: ContextSummary type also expects these
        // three fields. They were always implied (zero/empty) in Pulse's
        // preview path but never typed; adding them explicit keeps tsc
        // happy without changing behaviour.
        hasSelection: false,
        contextText: "",
        filterCount: 0,
    };
    const stages = buildHybridInsightsStagePrompts(
        synthContext as Parameters<typeof buildHybridInsightsStagePrompts>[0],
        props.domain,
        customSections,
        "viewer" as Parameters<typeof buildHybridInsightsStagePrompts>[3],
        { enabled: true, charts: true, stats: true, reporting: true },
        undefined,
        undefined,
        props.universalStages,
        props.universalOverrides
    );
    const expandAll = () => {
        const all: Record<number, boolean> = {};
        for (let i = 0; i < stages.titles.length; i++) all[i] = true;
        setStageOpenMap(all);
    };
    const collapseAll = () => setStageOpenMap({});
    return (
        <details className="gn-setup-hybrid-preview">
            <summary>Preview synthesized prompt ({stages.titles.length} stages)</summary>
            <div className="gn-setup-hybrid-preview-body">
                <p className="gn-setup-field-hint">
                    What the AI will receive at runtime, with <code>[bound dimensions]</code>
                    and <code>[bound measures]</code> replaced by your actual Power BI bindings.
                </p>
                <div className="gn-setup-hybrid-preview-toolbar">
                    <button type="button" onClick={expandAll} title="Open every stage prompt below">Expand all stages</button>
                    <button type="button" onClick={collapseAll} title="Close every stage prompt below">Collapse all stages</button>
                </div>
                {stages.titles.map((t, i) => (
                    <details
                        key={`${i}-${stageOpenMap[i] ? "o" : "c"}`}
                        className="gn-setup-hybrid-preview-stage"
                        open={!!stageOpenMap[i]}
                        onToggle={(e) => {
                            // Sync per-stage state when user clicks the row directly
                            // so Expand/Collapse-all and individual clicks stay
                            // consistent.
                            const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                            setStageOpenMap(prev => ({ ...prev, [i]: isOpen }));
                        }}
                    >
                        <summary><strong>Stage {i + 1}</strong>: {t}</summary>
                        <pre>{stages.stages[i]}</pre>
                    </details>
                ))}
            </div>
        </details>
    );
}

const STEP5_MODE_LS_KEY = "dwd-setup-step5-mode";

/** Read the persisted Step 5 mode from localStorage. New PBIPs default to
 *  Guided so first-time authors get the wizard; once an author switches to
 *  Advanced their preference sticks. Wrapped in try/catch so test
 *  environments without localStorage don't crash. */
function readStep5Mode(): Step5Mode {
    try {
        const v = window.localStorage?.getItem(STEP5_MODE_LS_KEY);
        return v === "advanced" ? "advanced" : "guided";
    } catch {
        return "guided";
    }
}

function writeStep5Mode(mode: Step5Mode): void {
    try {
        window.localStorage?.setItem(STEP5_MODE_LS_KEY, mode);
    } catch { /* test env, ignore */ }
}

export function SetupStep5(props: SetupStep5Props) {
    const { draft, setField, setBool, setNum, onSuggestInsightsConfig, onSuggestMetricRuleForCard, boundUserId } = props;
    const setDraftField = props as unknown as { setDraftField?: (name: keyof SetupDraft, value: unknown) => void };

    // ── Session 53 — Guided wizard hidden per user direction. Setup is
    //    always Advanced view, restructured into AI Insights / Chat tabs
    //    based on `enabledFeatures` (interim IDEA-038 — UI shell only,
    //    no data-model decoupling yet). The mode state is preserved as a
    //    constant so any conditionals on `mode` keep their existing shape.
    const mode: Step5Mode = "advanced";
    const setMode = (_next: Step5Mode) => { /* no-op — Guided wizard hidden */ };
    const switchMode = (next: Step5Mode) => { setMode(next); };

    // ── 48.6 step-level state + 48.7 validation/presets ─────────────────
    const [searchQuery, setSearchQuery] = React.useState("");
    const [validationOn, setValidationOn] = React.useState(false);
    // Session 53 — feature tab (interim IDEA-038 UI shell). Drives which
    // affinity sections are visible. Shared sections (B/C/F) appear in
    // both tabs via CSS. The available tabs are gated by `enabledFeatures`:
    //   "both"          → 2 tabs [AI Insights] [Chat]
    //   "insightsOnly"  → 1 tab  [AI Insights]
    //   "chatOnly"      → 1 tab  [Chat]
    const enabled: string = (draft.enabledFeatures as string) || "both";
    const availableTabs: ("ai-insights" | "chat")[] =
        enabled === "insightsOnly" ? ["ai-insights"] :
        enabled === "chatOnly"     ? ["chat"] :
        ["ai-insights", "chat"];
    const [activeTab, setActiveTab] = React.useState<"ai-insights" | "chat">(availableTabs[0]);
    // If `enabledFeatures` changes mid-session and the active tab is no
    // longer available, snap back to the first available tab.
    React.useEffect(() => {
        if (!availableTabs.includes(activeTab)) setActiveTab(availableTabs[0]);
    }, [enabled]);
    const allValidations = React.useMemo(() => validateAll(draft), [draft]);
    const validationBySection = React.useMemo(() => {
        const map: Record<string, SectionValidation> = {};
        for (const r of allValidations) map[r.section] = r;
        return map;
    }, [allValidations]);

    // Apply a preset to the draft. Walk the partial keys and call the
    // appropriate typed setter so the values land on the right channel.
    const applyPreset = (preset: Preset) => {
        for (const [k, v] of Object.entries(preset.apply)) {
            if (typeof v === "boolean") setBool(k as keyof SetupDraft, v);
            else if (typeof v === "number") setNum(k as keyof SetupDraft, v);
            else if (typeof v === "string") setField(k as keyof SetupDraft, v);
        }
    };

    // Section state combines validation severity + customised count. When
    // validation is OFF, fall back to the customised/defaults split that
    // 48.2-48.5 wired in.
    const sectionState = (s: SectionValidation["section"]): "defaults" | "customised" | "incomplete" | "error" => {
        if (validationOn) {
            const v = validationBySection[s]?.overall;
            if (v === "err") return "error";
            if (v === "warn") return "incomplete";
        }
        return countCustomised(s, draft) > 0 ? "customised" : "defaults";
    };

    // Per-section copy: emit only the section's customised fields as JSON.
    const onSectionCopy = async (section: SectionValidation["section"]) => {
        const out: Record<string, unknown> = {};
        for (const f of STEP5_FIELDS.filter(f => f.section === section)) {
            if (isFieldCustomised(f, draft)) out[String(f.name)] = draft[f.name];
        }
        const json = JSON.stringify(out, null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setPasteResult({ kind: "ok", msg: `Copied Section ${section}: ${Object.keys(out).length} customised field(s)` });
            setTimeout(() => setPasteResult(null), 3000);
        } catch {
            setPasteBuffer(json);
            setPasteOpen(true);
        }
    };

    // Per-section reset: only reset this section's fields to their declared
    // defaults. Steps 1-3 connection fields and other sections untouched.
    // Wave 29 — added confirm-modal gate (was destructive on a single click).
    const [confirmSectionReset, setConfirmSectionReset] = React.useState<SectionValidation["section"] | null>(null);
    const onSectionReset = (section: SectionValidation["section"]) => {
        // If the section has zero customised fields, skip the modal — there's
        // nothing to lose. Otherwise gate behind the confirm dialog so a
        // misclick can't destroy 20 minutes of authoring work.
        if (countCustomised(section, draft) === 0) {
            return;
        }
        setConfirmSectionReset(section);
    };
    const performSectionReset = (section: SectionValidation["section"]) => {
        for (const f of STEP5_FIELDS.filter(f => f.section === section)) {
            const v = f.defaultValue;
            if (typeof v === "boolean") setBool(f.name, v);
            else if (typeof v === "number") setNum(f.name, v);
            else if (typeof v === "string") setField(f.name, v);
        }
        setConfirmSectionReset(null);
    };

    // ── 48.15 + 48.16 — Section G sync state ─────────────────────────────
    const [syncBusy, setSyncBusy] = React.useState(false);
    const [syncResult, setSyncResult] = React.useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);
    const [upstreamSpace, setUpstreamSpace] = React.useState<SerializedSpace | null>(null);
    const [showSpaceDiff, setShowSpaceDiff] = React.useState(false);
    const [pushConfirm, setPushConfirm] = React.useState(false);

    const onLoadFromGenie = async () => {
        setSyncBusy(true);
        setSyncResult({ kind: "info", msg: "Fetching upstream AI workspace..." });
        const res = await fetchSpace({
            connectionMode: draft.connectionMode,
            host: draft.host,
            apiBaseUrl: draft.apiBaseUrl,
            assistantProfile: draft.assistantProfile,
            token: draft.token,
            spaceId: draft.spaceId,
            proxyKey: draft.proxyKey,
        });
        setSyncBusy(false);
        if (!res.ok || !res.serialized) {
            setSyncResult({ kind: "err", msg: `Load failed: ${res.error || "unknown error"}` });
            return;
        }
        setUpstreamSpace(res.serialized);
        // Populate the JSON-string fields with the upstream content. The
        // author can then edit locally; Push pushes the edits back.
        const ti = res.serialized.instructions.text_instructions || [];
        const sq = res.serialized.config.sample_questions || [];
        const ex = res.serialized.instructions.example_question_sqls || [];
        setField("genieTextInstructionsJson", ti.length === 0 ? "" : JSON.stringify(ti));
        setField("genieSampleQuestionsJson", sq.length === 0 ? "" : JSON.stringify(sq));
        setField("genieExampleSqlsJson", ex.length === 0 ? "" : JSON.stringify(ex));
        setSyncResult({
            kind: "ok",
            msg: `Loaded from "${res.envelope?.title ?? "AI workspace"}": ${ti.length} text instruction(s), ${sq.length} sample question(s), ${ex.length} SQL example(s).`,
        });
        setTimeout(() => setSyncResult(null), 6000);
    };

    const onShowSpaceDiff = () => {
        if (!upstreamSpace) {
            setSyncResult({ kind: "err", msg: "Load from AI workspace first to enable diff." });
            return;
        }
        setShowSpaceDiff(true);
    };

    // Build a draft SerializedSpace from the in-memory JSON fields. Used
    // by both the diff view and the Push confirm modal.
    const buildDraftSpace = (): SerializedSpace => {
        const safeArr = <T,>(s: string): T[] => {
            if (!s.trim()) return [];
            try { const p = JSON.parse(s); return Array.isArray(p) ? (p as T[]) : []; } catch { return []; }
        };
        return {
            version: 2,
            config: { sample_questions: safeArr(draft.genieSampleQuestionsJson) },
            data_sources: upstreamSpace?.data_sources ?? { tables: [] },
            instructions: {
                text_instructions: safeArr(draft.genieTextInstructionsJson),
                example_question_sqls: safeArr(draft.genieExampleSqlsJson),
            },
        };
    };

    const onPushToGenie = async () => {
        // Phase B (48.16) write path. Auth-gated — only runs when the
        // author has explicitly OK'd via the confirm modal AND the auth
        // posture is compatible with shared write access.
        setPushConfirm(false);
        setSyncBusy(true);
        setSyncResult({ kind: "info", msg: "Pushing to upstream AI workspace..." });
        try {
            const draftSpace = buildDraftSpace();
            const serialized = stringifySerializedSpace(draftSpace);
            const useProxy = draft.connectionMode === "proxy" || draft.connectionMode === "supervisor"
                || (draft.connectionMode === "auto" && (draft.apiBaseUrl || "").trim().length > 0);
            const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
            let url: string;
            let body: string;
            if (useProxy) {
                const base = (draft.apiBaseUrl || "").replace(/\/$/, "");
                if (!base) throw new Error("Proxy URL is required");
                const profile = draft.assistantProfile || "default";
                url = `${base}/assistant/space-update`;
                if (draft.proxyKey) headers["X-Genie-Key"] = draft.proxyKey;
                body = JSON.stringify({ profile, spaceId: draft.spaceId, serialized_space: serialized });
            } else {
                const host = (draft.host || "").replace(/\/$/, "");
                if (!host) throw new Error("Workspace URL is required");
                if (!draft.token) throw new Error("Access Token is required for Direct mode");
                url = `${host}/api/2.0/genie/spaces/${encodeURIComponent(draft.spaceId)}`;
                headers["Authorization"] = `Bearer ${draft.token}`;
                body = JSON.stringify({ serialized_space: serialized });
            }
            const x = new XMLHttpRequest();
            x.open(useProxy ? "POST" : "PATCH", url, true);
            for (const [k, v] of Object.entries(headers)) {
                try { x.setRequestHeader(k, v); } catch { /* ignore */ }
            }
            const result = await new Promise<{ ok: boolean; status: number; body: string }>((resolve) => {
                x.timeout = 20000;
                x.onload = () => resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, body: x.responseText || "" });
                x.onerror = () => resolve({ ok: false, status: x.status || 0, body: "" });
                x.ontimeout = () => resolve({ ok: false, status: 0, body: "" });
                x.send(body);
            });
            if (!result.ok) {
                throw new Error(`HTTP ${result.status}${result.body ? `: ${result.body.slice(0, 200)}` : ""}`);
            }
            // Update audit timestamp
            setNum("lastSpaceSyncAt", Date.now());
            setUpstreamSpace(draftSpace);
            setSyncResult({ kind: "ok", msg: `Pushed to upstream AI workspace at ${new Date().toLocaleTimeString()}.` });
            setTimeout(() => setSyncResult(null), 6000);
        } catch (e) {
            setSyncResult({ kind: "err", msg: `Push failed: ${(e as Error).message}` });
        } finally {
            setSyncBusy(false);
        }
    };

    // Auth gate: Push requires either OAuth OBO with proxy, or shared
    // PAT with explicit acknowledgement (via the confirm modal). Direct
    // mode requires a token. We surface the gate state in the toolbar.
    const pushAllowed = (() => {
        if (draft.connectionMode === "azure-openai" || draft.connectionMode === "bedrock" || draft.connectionMode === "foundation-model") return false;
        if (!draft.spaceId.trim()) return false;
        return true;
    })();

    // Compute diff if we have both upstream + a draft to compare.
    const spaceDiff = upstreamSpace ? computeDiff(upstreamSpace, buildDraftSpace()) : null;
    const hasLocalChanges = spaceDiff
        ? (spaceDiff.counts.added + spaceDiff.counts.removed + spaceDiff.counts.modified) > 0
        : false;

    // JSX helper — renders Validate / Copy / Paste / Reset / Apply preset
    // for a section, plus the validation results panel underneath when
    // validation is ON. Replaces the disabled-stub toolbars from 48.2-48.5.
    const renderSectionTools = (section: SectionValidation["section"]) => (
        <>
            <SectionToolbar>
                <button
                    type="button"
                    className={`gn-btn gn-btn--compact${validationOn ? " gn-btn--primary" : ""}`}
                    onClick={() => setValidationOn(o => !o)}
                    title={validationOn ? "Hide validation findings" : "Run section validation and surface findings"}
                >
                    {validationOn ? "Validation ✓" : "Validate"}
                </button>
                <button
                    type="button"
                    className="gn-btn gn-btn--compact"
                    onClick={() => onSectionCopy(section)}
                    title="Copy this section's customised fields as JSON"
                >
                    Copy as JSON
                </button>
                <button
                    type="button"
                    className="gn-btn gn-btn--compact"
                    onClick={() => { setPasteOpen(true); setPasteBuffer(""); setPasteResult(null); }}
                    title="Open Import JSON modal — paste any section's JSON to bulk-apply"
                >
                    Paste
                </button>
                <button
                    type="button"
                    className="gn-btn gn-btn--compact"
                    onClick={() => onSectionReset(section)}
                    title={`Reset Section ${section} fields to their declared defaults`}
                >
                    Reset
                </button>
                <SectionPresetsMenu section={section} onApply={applyPreset} />
            </SectionToolbar>
            {validationOn && validationBySection[section] && (
                <SectionValidationResults result={validationBySection[section]} />
            )}
        </>
    );
    const [showDiff, setShowDiff] = React.useState(false);
    const [pasteOpen, setPasteOpen] = React.useState(false);
    const [pasteBuffer, setPasteBuffer] = React.useState("");
    const [pasteResult, setPasteResult] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);
    const [confirmReset, setConfirmReset] = React.useState(false);
    const [openSections, setOpenSections] = React.useState<Record<Step5Section, boolean>>({
        "0": true, "A": true, "B": false, "C": false, "H": false, "D": false, "E": false, "F": false, "G": false,
    });

    // Filter logic — case-insensitive substring on label, hint, or name.
    const q = searchQuery.trim().toLowerCase();
    const fieldMatches = (f: FieldMeta) =>
        !q
        || f.label.toLowerCase().includes(q)
        || (typeof f.hint === "string" && f.hint.toLowerCase().includes(q))
        || String(f.name).toLowerCase().includes(q);
    const matchingFields = STEP5_FIELDS.filter(fieldMatches);
    const matchingSections = new Set<Step5Section>(matchingFields.map(f => f.section));
    const totalMatches = matchingFields.length;
    const totalFields = STEP5_FIELDS.length;

    // When search is active, force the matching sections open and the
    // non-matching sections closed. When inactive, fall back to the
    // user-toggled openSections state.
    const isOpen = (s: Step5Section): boolean =>
        q ? matchingSections.has(s) : openSections[s];

    // Per-section toggle handler — only updates userOpen state when search
    // is inactive (otherwise the user's click would conflict with the
    // search-driven open state).
    //
    // CRITICAL: use `e.currentTarget` NOT `e.target`. When a nested
    // <details> (e.g., a multi-space slot, metric rule card, or any other
    // expandable child) fires its onToggle, React bubbles the event up to
    // this section-level handler. `e.target` would point at the INNER
    // <details> and we'd write its (now-collapsed) state to the OUTER
    // section, collapsing the parent every time a child collapsed. With
    // `e.currentTarget` we always read the open state of the section's
    // OWN <details> element. Regression caught by user 2026-05-07 after
    // cycle 11+12+13 added more nested <details> usage in Section A
    // (Wave 40 metric rules) and Section D (multi-space slots).
    const onSectionToggle = (s: Step5Section) => (e: React.SyntheticEvent<HTMLDetailsElement>) => {
        if (q) return;
        // Defensive: only react when the bubbled event came from THIS
        // section's <details>, not a nested one.
        if (e.target !== e.currentTarget) return;
        const isNowOpen = (e.currentTarget as HTMLDetailsElement).open;
        setOpenSections(prev => ({ ...prev, [s]: isNowOpen }));
    };
    const jumpToSection = (
        section: Step5Section,
        tab?: "ai-insights" | "chat"
    ) => {
        setSearchQuery("");
        if (tab && availableTabs.includes(tab)) {
            setActiveTab(tab);
        }
        setOpenSections(prev => ({ ...prev, [section]: true }));
    };
    type QuickTask = {
        label: string;
        desc: string;
        section: Step5Section;
        tab?: "ai-insights" | "chat";
        show?: boolean;
    };
    const allQuickTasks: QuickTask[] = [
        {
            label: "Tune AI Insights",
            desc: "Domain, sections, metric rules",
            section: "A",
            tab: "ai-insights",
            show: availableTabs.includes("ai-insights"),
        },
        {
            label: "Security posture",
            desc: "Auth, row filters, redaction",
            section: "C",
        },
        {
            label: "Chat spaces",
            desc: "Multi-space helper setup",
            section: "D",
            tab: "chat",
            show: availableTabs.includes("chat"),
        },
        {
            label: "Supervisor",
            desc: "Fusion and orchestration",
            section: "E",
            tab: "chat",
            show: availableTabs.includes("chat"),
        },
        {
            label: "Workspace sync",
            desc: "Instructions and trusted SQL",
            section: "G",
            tab: "chat",
            show: availableTabs.includes("chat"),
        },
        {
            label: "SQL data config",
            desc: "CTE, SQL cards, restrictions",
            section: "H",
        },
        {
            label: "Developer tools",
            desc: "Trace, SQL, diagnostics",
            section: "F",
        },
    ];
    const quickTasks = allQuickTasks.filter(t => t.show !== false);

    // Step-level summary stats.
    const customisedTotal = STEP5_FIELDS.filter(f => isFieldCustomised(f, draft)).length;
    const sectionsNeedingAttention = (() => {
        // "Needs attention" today = master toggle ON but a dependent slot/field
        // looks incomplete. Only Section D currently has this signal — multi-space
        // enabled but a slot has a label without spaceId/profile.
        const out: Step5Section[] = [];
        if (draft.multiSpaceEnabled) {
            const visible = Math.min(Math.max(draft.multiSpaceCount, 1), 9);
            for (let n = 2; n <= 1 + visible; n++) {
                const lbl = String(draft[`space${n}Label` as keyof SetupDraft] ?? "").trim();
                const prof = String(draft[`space${n}AssistantProfile` as keyof SetupDraft] ?? "").trim();
                const sid = String(draft[`space${n}SpaceId` as keyof SetupDraft] ?? "").trim();
                if (lbl && !prof && !sid) {
                    out.push("D");
                    break;
                }
            }
        }
        return out;
    })();

    // ── Step-level toolbar handlers ──────────────────────────────────────
    const exportJson = (): string => {
        // Export ONLY customised fields (everything that diverges from
        // defaults) — keeps the JSON portable and avoids over-writing
        // defaults on import.
        const out: Record<string, unknown> = {};
        for (const f of STEP5_FIELDS) {
            if (isFieldCustomised(f, draft)) {
                out[String(f.name)] = draft[f.name];
            }
        }
        return JSON.stringify(out, null, 2);
    };
    const onCopyJson = async () => {
        const json = exportJson();
        try {
            await navigator.clipboard.writeText(json);
            setPasteResult({ kind: "ok", msg: `Copied ${Object.keys(JSON.parse(json)).length} customised field(s)` });
            setTimeout(() => setPasteResult(null), 3000);
        } catch {
            // Clipboard API can fail in some sandboxes; fall back to opening
            // the paste modal pre-populated with the JSON for manual copy.
            setPasteBuffer(json);
            setPasteOpen(true);
        }
    };
    const onPaste = () => {
        try {
            const obj = JSON.parse(pasteBuffer);
            if (typeof obj !== "object" || obj == null) throw new Error("Expected an object");
            let applied = 0;
            const validNames = new Set(STEP5_FIELDS.map(f => String(f.name)));
            for (const [k, v] of Object.entries(obj)) {
                if (!validNames.has(k)) continue;
                if (typeof v === "boolean") setBool(k as keyof SetupDraft, v);
                else if (typeof v === "number") setNum(k as keyof SetupDraft, v);
                else if (typeof v === "string") setField(k as keyof SetupDraft, v);
                applied++;
            }
            setPasteResult({ kind: "ok", msg: `Applied ${applied} field(s) from JSON` });
            setPasteOpen(false);
            setPasteBuffer("");
            setTimeout(() => setPasteResult(null), 3000);
        } catch (err) {
            setPasteResult({ kind: "err", msg: `Parse failed: ${(err as Error).message}` });
        }
    };
    const onResetAll = () => {
        // Reset every field in the metadata table to its declared default.
        for (const f of STEP5_FIELDS) {
            const v = f.defaultValue;
            if (typeof v === "boolean") setBool(f.name, v);
            else if (typeof v === "number") setNum(f.name, v);
            else if (typeof v === "string") setField(f.name, v);
        }
        setConfirmReset(false);
    };

    return (
        <section className="gn-setup-step gn-setup-step--advanced">
            <header className="gn-setup-step-header">
                <span className="gn-setup-step-number">5</span>
                <div className="gn-setup-step-header-body">
                    <h4>Setup</h4>
                    {/* Session 53 — header simplified. Guided/Advanced toggle
                        hidden per user direction; tabs below split the form
                        by feature affinity (AI Insights / Chat) driven by
                        the `enabledFeatures` setting. */}
                    <p
                        className="gn-setup-step-header-summary"
                        title="Configure the AI Insights and/or Chat features. The tabs below switch between feature-specific settings; Shared sections (Knowledge Base, Security, Developer) appear in both tabs."
                    >
                        Configure the AI Insights and/or Chat features.
                    </p>
                </div>
            </header>

            {/* 48.9-48.11 — Guided wizard hidden in Session 53; component
                kept as code for future "first-run wizard" optionality but
                never renders since `mode` is hard-coded to "advanced". */}
            {(false as boolean) && (
                <SetupStep5Guided
                    draft={draft}
                    setField={setField}
                    setBool={setBool}
                    setNum={setNum}
                    onSwitchToAdvanced={() => switchMode("advanced")}
                    onJumpToSection={(s) => {
                        // Force the target section open when switching back to Advanced.
                        setOpenSections(prev => ({ ...prev, [s]: true }));
                    }}
                />
            )}

            {/* The Advanced form below renders in BOTH modes, but is hidden
                via the guided-shell wrapper when mode === 'guided'. This
                keeps the implementation simple: same JSX, same state, same
                handlers — just a wrapper that controls visibility. */}
            <div
                className="gn-setup-advanced-wrap"
                data-affinity-filter={activeTab}
                style={{ display: mode === "advanced" ? "block" : "none" }}
            >

            {/* Step-level search bar. Auto-opens any section containing a
                matching field; collapses the rest. Type to filter; clear to
                restore manual section state. */}
            <div className="gn-setup-step-search" role="search">
                <input
                    type="text"
                    role="searchbox"
                    placeholder={`Search ${totalFields} fields by label, hint, or name...`}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    aria-label="Search Step 5 fields"
                />
                {q && (
                    <span className="gn-setup-step-search-hits" aria-live="polite">
                        {totalMatches} of {totalFields} fields match
                    </span>
                )}
                {q && (
                    <button type="button" className="gn-setup-step-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>
                )}
            </div>

            {/* Step-level summary card. Surfaces "X of N customised" + jumps
                to sections needing attention. Hidden when search is active
                (results header takes its place). */}
            {!q && (
                <div className="gn-setup-step-summary">
                    <div>
                        <strong>{customisedTotal}</strong> of {totalFields} fields customised
                        {sectionsNeedingAttention.length > 0 && (
                            <> | <strong style={{ color: "var(--gn-warning, #c97a16)" }}>{sectionsNeedingAttention.length} section{sectionsNeedingAttention.length === 1 ? "" : "s"} need attention</strong></>
                        )}
                    </div>
                    <div className="gn-setup-step-summary-toolbar">
                        <button type="button" className="gn-btn gn-btn--compact" onClick={onCopyJson} title="Copy customised fields as JSON to clipboard">Export JSON</button>
                        <button type="button" className="gn-btn gn-btn--compact" onClick={() => { setPasteOpen(true); setPasteBuffer(""); setPasteResult(null); }} title="Paste JSON to bulk-apply field values">Import JSON</button>
                        <button type="button" className="gn-btn gn-btn--compact" onClick={() => setShowDiff(true)} title="Show every customised field side-by-side with its default" disabled={customisedTotal === 0}>Show diff</button>
                        <button type="button" className="gn-btn gn-btn--compact" onClick={() => setConfirmReset(true)} title="Reset every Step 5 field to its default" disabled={customisedTotal === 0}>Reset all</button>
                    </div>
                </div>
            )}

            {pasteResult && (
                <div className={`gn-setup-step-paste-result gn-setup-step-paste-result--${pasteResult.kind}`} aria-live="polite">
                    {pasteResult.msg}
                </div>
            )}

            {/* Import-JSON modal. Opens via the toolbar; user pastes a JSON
                blob from a previous export and clicks Apply. Invalid JSON
                surfaces an error inline rather than failing silently. */}
            {pasteOpen && (
                <div className="gn-setup-step-modal" role="dialog" aria-label="Import JSON">
                    <div className="gn-setup-step-modal-card">
                        <div className="gn-setup-step-modal-header">
                            <strong>Import Step 5 from JSON</strong>
                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setPasteOpen(false)}>Close</button>
                        </div>
                        <p className="gn-setup-field-hint">Paste a JSON object whose keys are field names from STEP5_FIELDS. Unknown keys are ignored. Booleans, numbers, and strings are applied; everything else is skipped.</p>
                        <textarea
                            rows={12}
                            value={pasteBuffer}
                            onChange={e => setPasteBuffer(e.target.value)}
                            placeholder={`{\n  "domainGuidance": "## Business rules\\n- Revenue = Net Sales",\n  "kbEnabled": true,\n  "multiSpaceEnabled": true\n}`}
                            spellCheck={false}
                        />
                        <div className="gn-setup-step-modal-actions">
                            <button type="button" className="gn-btn" onClick={() => setPasteOpen(false)}>Cancel</button>
                            <button type="button" className="gn-btn gn-btn--primary" onClick={onPaste} disabled={!pasteBuffer.trim()}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Diff modal — every customised field side-by-side with its
                declared default. Useful for handovers, code review, and
                "what did I actually change?". */}
            {showDiff && (
                <div className="gn-setup-step-modal" role="dialog" aria-label="Diff vs defaults">
                    <div className="gn-setup-step-modal-card">
                        <div className="gn-setup-step-modal-header">
                            <strong>Customised fields ({customisedTotal})</strong>
                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setShowDiff(false)}>Close</button>
                        </div>
                        <table className="gn-setup-step-diff">
                            <thead>
                                <tr>
                                    <th>Section</th>
                                    <th>Field</th>
                                    <th>Default</th>
                                    <th>Current</th>
                                </tr>
                            </thead>
                            <tbody>
                                {STEP5_FIELDS.filter(f => isFieldCustomised(f, draft)).map(f => (
                                    <tr key={String(f.name)}>
                                        <td>{f.section}</td>
                                        <td><code>{String(f.name)}</code></td>
                                        <td><code>{JSON.stringify(f.defaultValue)}</code></td>
                                        <td><code>{JSON.stringify(draft[f.name])}</code></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Reset-all confirm modal. Destructive operation — defaults
                only, never the connection fields from Steps 1-3. */}
            {confirmReset && (
                <div className="gn-setup-step-modal" role="dialog" aria-label="Confirm reset">
                    <div className="gn-setup-step-modal-card">
                        <div className="gn-setup-step-modal-header">
                            <strong>Reset {customisedTotal} field{customisedTotal === 1 ? "" : "s"} to defaults?</strong>
                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setConfirmReset(false)}>Close</button>
                        </div>
                        <p className="gn-setup-field-hint">This resets every Step 5 field across Sections 0 + A through F to its declared default value. Steps 1-3 connection fields are not touched. Cannot be undone; use Export JSON first if you want a backup.</p>
                        <div className="gn-setup-step-modal-actions">
                            <button type="button" className="gn-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                            <button type="button" className="gn-btn gn-btn--primary" onClick={onResetAll}>Reset all to defaults</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Wave 29 — per-section reset confirm modal. Mirrors the reset-all
                pattern but scoped to a single section. Without this, a single
                misclick on the section "Reset" button used to silently destroy
                all customised fields in that section. */}
            {confirmSectionReset && (
                <div className="gn-setup-step-modal" role="dialog" aria-label="Confirm section reset">
                    <div className="gn-setup-step-modal-card">
                        <div className="gn-setup-step-modal-header">
                            <strong>
                                Reset Section {confirmSectionReset} ({countCustomised(confirmSectionReset, draft)} customised field{countCustomised(confirmSectionReset, draft) === 1 ? "" : "s"}) to defaults?
                            </strong>
                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setConfirmSectionReset(null)}>Close</button>
                        </div>
                        <p className="gn-setup-field-hint">This resets only the fields in this section to their declared defaults. Other sections, connection fields (Steps 1-3), and the saved settings on disk are not touched. Cannot be undone; use Export JSON first if you want a backup.</p>
                        <div className="gn-setup-step-modal-actions">
                            <button type="button" className="gn-btn" onClick={() => setConfirmSectionReset(null)}>Cancel</button>
                            <button type="button" className="gn-btn gn-btn--primary" onClick={() => performSectionReset(confirmSectionReset)}>Reset section</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Section 0 — Enabled features (IDEA-022). Pinned at the top of Step 5
                because it gates which tabs the rest of the configuration applies to.
                Radio (not checkbox) — single-choice at the input level so the
                invalid "neither" state is impossible. Hidden during search if no
                Section 0 field matches the query. */}
            {(q ? matchingSections.has("0") : true) && (
            <fieldset className="gn-setup-features-gate" role="radiogroup" aria-label="Enabled features">
                <legend title="Controls which assistant surfaces are available: insights, chat, or both. Adjust when a report should limit the experience to a single surface.">0. Enabled features <span className="gn-setup-advanced-summary-hint">Choose active assistant surfaces</span></legend>
                <p className="gn-setup-features-gate-intro">Decide whether viewers see AI Insights, Chat, or both. Picks below shape every other section: chat-only skips AI Insights pipelines entirely, insights-only hides the chat compose bar.</p>
                <div className="gn-setup-features-gate-options">
                    <label className={`gn-setup-features-gate-option${draft.enabledFeatures === "both" ? " gn-setup-features-gate-option--active" : ""}`}>
                        <input
                            type="radio"
                            name="enabledFeatures"
                            value="both"
                            checked={draft.enabledFeatures === "both"}
                            onChange={() => setField("enabledFeatures", "both")}
                        />
                        <span className="gn-setup-features-gate-title">Both: AI Insights + Chat</span>
                        <span className="gn-setup-features-gate-desc">Default. Tab strip visible; viewers can switch between auto analytics and conversational Q&amp;A.</span>
                    </label>
                    <label className={`gn-setup-features-gate-option${draft.enabledFeatures === "insightsOnly" ? " gn-setup-features-gate-option--active" : ""}`}>
                        <input
                            type="radio"
                            name="enabledFeatures"
                            value="insightsOnly"
                            checked={draft.enabledFeatures === "insightsOnly"}
                            onChange={() => setField("enabledFeatures", "insightsOnly")}
                        />
                        <span className="gn-setup-features-gate-title">AI Insights only</span>
                        <span className="gn-setup-features-gate-desc">Auto-generated descriptive analytics on load. No chat tab; no compose bar. Best for executive dashboards.</span>
                    </label>
                    <label className={`gn-setup-features-gate-option${draft.enabledFeatures === "chatOnly" ? " gn-setup-features-gate-option--active" : ""}`}>
                        <input
                            type="radio"
                            name="enabledFeatures"
                            value="chatOnly"
                            checked={draft.enabledFeatures === "chatOnly"}
                            onChange={() => setField("enabledFeatures", "chatOnly")}
                        />
                        <span className="gn-setup-features-gate-title">Chat only</span>
                        <span className="gn-setup-features-gate-desc">Conversational Q&amp;A only. Auto-insights effect is skipped; no AI calls are made on visual load.</span>
                    </label>
                </div>
                <span className="gn-setup-features-gate-preview" aria-live="polite">
                    Visual will show: <strong>{
                        draft.enabledFeatures === "both" ? "AI Insights + Chat (tab strip visible)" :
                        draft.enabledFeatures === "insightsOnly" ? "AI Insights only" : "Chat only"
                    }</strong>
                </span>
            </fieldset>
            )}

            {/* Session 53 — feature-driven tab strip (interim IDEA-038).
                One tab per enabled feature; Shared sections appear in both. */}
            {availableTabs.length > 1 ? (
                <div className="gn-setup-feature-tabs" role="tablist" aria-label="Setup feature">
                    {availableTabs.map(t => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === t}
                            className={`gn-setup-feature-tab gn-setup-feature-tab--${t}${activeTab === t ? " gn-setup-feature-tab--active" : ""}`}
                            onClick={() => setActiveTab(t)}
                        >
                            {t === "ai-insights" ? "AI Insights setup" : "Chat setup"}
                        </button>
                    ))}
                    <span className="gn-setup-feature-tabs-hint">
                        Shared sections (Knowledge Base, Security, Developer) appear in both tabs.
                    </span>
                </div>
            ) : (
                <div className="gn-setup-feature-tabs gn-setup-feature-tabs--single">
                    <span className={`gn-setup-feature-tab gn-setup-feature-tab--${activeTab} gn-setup-feature-tab--active`}>
                        {activeTab === "ai-insights" ? "AI Insights setup" : "Chat setup"}
                    </span>
                    <span className="gn-setup-feature-tabs-hint">
                        Single feature enabled. Shared sections (Knowledge Base, Security, Developer) shown below.
                    </span>
                </div>
            )}

            {!q && (
                <div className="gn-setup-quick-tasks" aria-label="Common setup tasks">
                    <span className="gn-setup-quick-tasks-label">Common tasks</span>
                    {quickTasks.map(task => (
                        <button
                            key={`${task.section}-${task.label}`}
                            type="button"
                            className="gn-setup-quick-task"
                            onClick={() => jumpToSection(task.section, task.tab)}
                            title={`Open Section ${task.section}: ${task.desc}`}
                        >
                            <strong>{task.label}</strong>
                            <span>{task.desc}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Connector status + Test Connection panel. Renders between the
                feature-tab strip and Section A so the active backend's
                identity, status, and reachability are always one click away.
                Closes G1+G2+G3: noun-aware label, registry-driven status
                pill, and a uniform health probe per descriptor.
                IDEA-040: connector registry. */}
            {(() => {
                const desc = getDescriptor(draft.connectionMode);
                const noun = desc.noun;
                const cfg: GenieConfig = {
                    connectionMode: draft.connectionMode,
                    host: draft.host,
                    apiBaseUrl: draft.apiBaseUrl,
                    assistantProfile: draft.assistantProfile,
                    token: draft.token,
                    spaceId: draft.spaceId,
                    warehouseId: draft.warehouseId,
                    proxyKey: draft.proxyKey,
                };
                const statusLabel = desc.status === "ready"   ? "Ready"
                                  : desc.status === "preview" ? "Preview"
                                                              : "Coming soon";
                const statusClass = desc.status === "ready"   ? "gn-conn-status gn-conn-status--ok"
                                  : desc.status === "preview" ? "gn-conn-status gn-conn-status--warn"
                                                              : "gn-conn-status gn-conn-status--info";
                return (
                    <div className="gn-conn-panel" role="region" aria-label="Active connector">
                        <div className="gn-conn-panel-row">
                            <span className="gn-conn-panel-label">Connector:</span>
                            <strong className="gn-conn-panel-name">{desc.label}</strong>
                            <span className={statusClass} title={`status=${desc.status}`}>{statusLabel}</span>
                            <span className="gn-conn-panel-noun" title="The vocabulary this connector uses in labels and help text">
                                noun: <em>{noun.single}</em>
                            </span>
                            {desc.kind === "supervisor" && (
                                <span className="gn-conn-panel-kind" title="This connector orchestrates multiple data sources internally">
                                    multi-source supervisor
                                </span>
                            )}
                            {!desc.streaming && (
                                <span className="gn-conn-panel-streaming" title="This connector returns one final answer; no per-step progress events">
                                    no streaming
                                </span>
                            )}
                            <TestConnectionButton config={cfg} className="gn-conn-panel-test" />
                        </div>
                        {!isConnectorReady(draft.connectionMode) && (
                            <p className="gn-conn-panel-note">
                                {desc.status === "stub"
                                    ? <>This connector isn't fully wired yet — calls will succeed only after backend implementation lands. Pick another connector for now.</>
                                    : <>This connector is in preview. Some fields and behaviors may change.</>}
                            </p>
                        )}
                    </div>
                );
            })()}

            {/* Section A — AI behaviour. Migrated to <FieldRow> in 48.2: rich
                popovers, live preview chips, status badge, intro callout, and
                a section toolbar reserved for Validate / Reset / Copy / Paste.
                Reference implementation; Sections B–F follow this pattern in
                48.3 → 48.5. */}
            {(q ? matchingSections.has("A") : true) && (() => {
                const sectionA_state = sectionState("A");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fGenieFields = findMeta("genieFields");
                const fDomainGuidance = findMeta("domainGuidance");
                const fSendContext = findMeta("sendContextToGenie");
                const fInsightsPrompt = findMeta("insightsPrompt");
                const fInsightsDomain = findMeta("insightsDomain");
                const fInsightsCustomSections = findMeta("insightsCustomSections");
                const fInsightsAuthoringMode = findMeta("insightsAuthoringMode");
                const fInsightsDomainGuidance = findMeta("insightsDomainGuidance");
                const fMetricDirectionRules = findMeta("metricDirectionRules");
                // Wave 40 — fMetricDirections is no longer rendered as its own
                // FieldRow (the JSON map is auto-derived from the form), but the
                // metadata lookup is kept so STEP5_FIELDS coverage tests stay
                // green. Prefixed with underscore to silence unused-var lints.
                const _fMetricDirections = findMeta("insightsMetricDirections"); void _fMetricDirections;
                const fShowProvenanceFooter = findMeta("insightsShowProvenanceFooter");
                const fCacheTtl = findMeta("insightsCacheTtlMinutes");
                const fRefresh = findMeta("refreshInsights");
                const authoringMode = (draft.insightsAuthoringMode || "preset") as "manual" | "preset" | "ai-assisted";
                return (
                    <details className="gn-setup-advanced-section gn-affinity-shared" data-affinity="shared" open={isOpen("A")} onToggle={onSectionToggle("A")}>
                        <summary title="Groups common AI context first, then the AI Insights-specific output strategy. Chat inherits the common context and keeps its specific controls in the Chat sections.">
                            A. Common AI context
                            <SectionStatus state={sectionA_state} />
                            <span className="gn-setup-advanced-summary-hint">Shared grounding first; output-specific controls below</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Data steward / lead analyst — anyone who knows the report's KPIs, definitions, join paths, and answer standards.">
                                Start with the context that both AI Insights and Chat should share: field names, BI context sharing,
                                domain guidance, metric definitions, and formatting standards. Then tune only the surface-specific
                                behavior that needs to differ.
                            </SectionIntro>

                            {renderSectionTools("A")}

                            <SetupSubgroup
                                title="Common AI context"
                                description="Single source of truth for field vocabulary, business rules, KPI definitions, formatting standards, and BI-scope sharing. Applies to both AI Insights and Chat."
                            >
                            <FieldRow
                                name={fGenieFields.name as string}
                                label={fGenieFields.label}
                                optional
                                hint={<>Comma- or line-separated field names from your AI metric view. PulsePlay checks bound fields from the active BI surface against this list and shows an amber badge if they diverge. Leave blank to skip validation.</>}
                                example={fGenieFields.example}
                                preview={fGenieFields.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>What it does:</strong> declares the canonical field names of your AI workspace so the visual can warn when a measure / dimension bound in your BI platform doesn't exist upstream.</p>
                                        <p><strong>Match logic:</strong> case-insensitive; aggregation prefixes like <code>Sum of</code> are stripped. So <code>Sum of Sales</code> matches <code>sales</code>.</p>
                                        <p><strong>Honoured by:</strong> all AI-backed connection modes that send context to the AI. No effect when <em>Send report context</em> is OFF.</p>
                                        <p><strong>Skip when:</strong> you trust report authors to bind correctly, or your space accepts free-form column names.</p>
                                    </>
                                }
                            >
                                <textarea
                                    rows={3}
                                    value={draft.genieFields}
                                    onChange={e => setField("genieFields", e.target.value)}
                                    placeholder="Country, Region, Sales, Profit, Quantity"
                                />
                            </FieldRow>

                            <FieldRow
                                name={fDomainGuidance.name as string}
                                label={fDomainGuidance.label}
                                optional
                                hint={<>Business rules, KPI definitions, and query hints sent to the AI on the first turn of each session. Supports a <code>## Formatting Standards</code> markdown table.</>}
                                example={fDomainGuidance.example}
                                preview={fDomainGuidance.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>What it does:</strong> the most important AI-grounding control. The text here is sent verbatim as a system-level instruction on the first turn of every AI session, anchoring vocabulary, KPI formulas, and "do/don't" rules.</p>
                                        <p><strong>Cap about 8,000 chars</strong> (about 3 pages). Past that, latency rises and earlier rules get ignored. For larger guidance, use the upstream AI workspace's own General Instructions in Databricks; they persist, are filtered per question, and don't cost tokens per turn.</p>
                                        <p><strong>Formatting tip:</strong> Markdown sections like <code>## Business Rules</code> and <code>## Formatting Standards</code> survive the round-trip and influence chart number rendering.</p>
                                        <p><strong>Honoured by:</strong> Databricks AI modes (Direct, Proxy, Supervisor, Gateway). Cloud-AI backends (Azure OpenAI, Bedrock) receive the same text.</p>
                                    </>
                                }
                            >
                                <textarea
                                    rows={8}
                                    value={draft.domainGuidance}
                                    onChange={e => setField("domainGuidance", e.target.value)}
                                    placeholder={"## Business Rules\n- Revenue = Net Sales after returns\n- Use FISCAL_YEAR not CALENDAR_YEAR\n\n## Formatting Standards\n| Range | Format | Example |\n|---|---|---|\n| < 1 000 | #,###.## | 567.89 |\n| ≥ 1 000 | #,### | 12 345 |"}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fSendContext.name as string}
                                label="Send BI context to AI"
                                kind="toggle"
                                hint={<>ON: bound dimensions, measures, and active filter values from the active BI surface (Power BI, Tableau, Qlik, Looker, generic iframe) are included in every AI prompt — enables scope-aware answers. OFF: only the typed question + your Domain Instructions are sent.</>}
                                helpBody={
                                    <>
                                        <p><strong>Privacy lever:</strong> turning this OFF is the fastest way to keep the data inside the active BI surface. The visual will still send the typed question and your Domain Instructions, but no field values.</p>
                                        <p><strong>Tradeoff:</strong> OFF disables scope-aware answers. The AI won't know the user filtered to "West region 2025" unless you say so in the question.</p>
                                        <p><strong>PII redaction:</strong> when ON, the visual auto-redacts emails / phone numbers / SSN / IBAN / card-shaped values in field labels before sending. See <code>lib/piiRedact.ts</code>.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.sendContextToGenie}
                                    onChange={e => setBool("sendContextToGenie", e.target.checked)}
                                />
                            </FieldRow>
                            </SetupSubgroup>

                            {activeTab === "chat" && (
                                <SetupSubgroup
                                    title="Chat behavior"
                                    description="Chat inherits the common context above plus the shared Knowledge Base toggles below. Chat-specific connection, memory/history, multi-space, and sync controls live in the Chat sections on this tab."
                                />
                            )}

                            {activeTab !== "chat" && (
                            <SetupSubgroup
                                title="AI Insights output strategy"
                                description="Controls the generated briefing shape: authoring mode, domain label, preset sections, universal stages, metric color semantics, provenance, cache, and refresh behavior."
                            >
                            {/* 49.19 / IDEA-037 phase 3 — Authoring mode radio.
                                Drives which fields are visible AND which path
                                the runInsights pipeline takes at runtime. All
                                three setting buckets persist independently so
                                switching modes never loses prior work. */}
                            <FieldRow
                                name={fInsightsAuthoringMode.name as string}
                                label={fInsightsAuthoringMode.label}
                                hint={<>Pick how the AI Insights output is authored. Switching modes preserves all field values — you can flip between modes without losing work.</>}
                                preview={fInsightsAuthoringMode.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>Three modes, all save independently:</strong></p>
                                        <ul>
                                            <li><strong>Preset (default):</strong> pick a Domain from the dropdown + author Custom Sections. Fast hybrid briefing runs as one AI call with the domain vocabulary. Best for known domains where you have an opinion on the output structure.</li>
                                            <li><strong>AI-assisted:</strong> the AI introspects your bound dimensions and measures, then auto-fills Domain + Custom Sections with a tailored suggestion. You tune before clicking Apply. Best for new datasets where you want a starting point.</li>
                                            <li><strong>Manual:</strong> you write the prompt yourself in the "Custom AI Insights prompt" field below. Sent verbatim to the AI as a single call. Best for power users who want very specific output the hybrid pipeline can't produce.</li>
                                        </ul>
                                        <p><strong>Switching modes never loses values</strong> — Domain, Custom Sections, and Prompt are all persisted separately. You can flip Manual ↔ Preset to compare runs without re-typing anything.</p>
                                    </>
                                }
                            >
                                <select
                                    value={authoringMode}
                                    onChange={e => setField("insightsAuthoringMode", e.target.value as "manual" | "preset" | "ai-assisted")}
                                >
                                    <option value="preset">Preset: domain and sections (default)</option>
                                    <option value="ai-assisted">AI-assisted: auto-detect from data</option>
                                    <option value="manual">Manual: write your own prompt</option>
                                </select>
                            </FieldRow>

                            {authoringMode !== "preset" && (
                                <div className="gn-setup-sql-section-callout">
                                    <div>
                                        <strong>Need specific rendered sections or SQL-backed cards?</strong>
                                        <span> Switch to Preset mode to add AI sections or deterministic SQL sections. SQL cards still use Section H CTE, forbidden-table rules, proxy auth, and SELECT-only validation.</span>
                                    </div>
                                    <div className="gn-setup-sql-section-callout-actions">
                                        <button
                                            type="button"
                                            className="gn-pill gn-pill--compact"
                                            onClick={() => setField("insightsAuthoringMode", "preset")}
                                        >
                                            Show section editor
                                        </button>
                                        <button
                                            type="button"
                                            className="gn-pill gn-pill--compact"
                                            onClick={() => jumpToSection("H")}
                                        >
                                            Open SQL config
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Mode-driven field visibility:
                                  preset      → Domain + sections editor + Hybrid Preview
                                  ai-assisted → Suggestion panel + read-only Hybrid Preview
                                  manual      → insightsPrompt textarea
                                The hidden fields keep their values in storage —
                                switching modes never wipes prior work. */}
                            {authoringMode === "ai-assisted" && (<>
                                <AiAssistedSuggestionPanel
                                    onSuggest={onSuggestInsightsConfig}
                                    currentDomain={draft.insightsDomain || ""}
                                    currentSectionsJson={draft.insightsCustomSections || "[]"}
                                    onApplyDomain={d => setField("insightsDomain", d)}
                                    onApplySections={j => setField("insightsCustomSections", j)}
                                    /* Wave 41 cycle 12 — wire metric-rule suggestion merge path. */
                                    currentMetricRulesText={draft.metricDirectionRules}
                                    currentMetricRulesJson={draft.insightsMetricDirections}
                                    onApplyMetricRulesText={text => setField("metricDirectionRules", text)}
                                    onApplyMetricRulesJson={json => setField("insightsMetricDirections", json)}
                                />
                                {/* Cycle 31 — universal-stage hide/show + override editor.
                                    Originally only rendered in Preset mode, but the
                                    insightsShow{Headline,Trends,Risks,Actions} settings
                                    + insightsXxxOverride strings ARE honoured by the
                                    briefing in AI-assisted mode too (the same hybrid
                                    structure runs, the AI just auto-fills the Domain +
                                    custom sections). Without this editor, AI-assisted
                                    authors had no way to drop stages they didn't want
                                    (e.g., a viewer-facing run that should skip RISKS).
                                    Now visible in both modes. */}
                                <UniversalStagesEditor
                                    draft={draft}
                                    setField={setField}
                                    setBool={setBool}
                                />
                                <HybridPreview
                                    domain={draft.insightsDomain || ""}
                                    customSectionsJson={draft.insightsCustomSections || "[]"}
                                    universalStages={{
                                        headline: draft.insightsShowHeadline,
                                        trends: draft.insightsShowTrends,
                                        risks: draft.insightsShowRisks,
                                        actions: draft.insightsShowActions
                                    }}
                                    universalOverrides={{
                                        headline: draft.insightsHeadlineOverride,
                                        trends: draft.insightsTrendsOverride,
                                        risks: draft.insightsRisksOverride,
                                        actions: draft.insightsActionsOverride
                                    }}
                                />
                            </>)}

                            {authoringMode === "preset" && (<>
                            <FieldRow
                                name={fInsightsDomain.name as string}
                                label={fInsightsDomain.label}
                                optional
                                hint={<>Pick a preset or type your own. Colours the universal AI Insights sections (HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS) with the right vocabulary so the same visual works on any dataset.</>}
                                example={fInsightsDomain.example}
                                preview={fInsightsDomain.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>What it does:</strong> tells the AI what kind of analytics this is so it can frame the headline / drivers / risks / actions in the right business language.</p>
                                        <p><strong>Generic sections, domain language:</strong> the visual always emits HEADLINE + KPI SNAPSHOT, TRENDS, RISKS, and RECOMMENDED ACTIONS — these work for any dataset. The Domain label just changes the vocabulary used inside them.</p>
                                        <p><strong>Leave blank:</strong> AI uses generic "analytics" framing. Functional but plainer.</p>
                                        <p><strong>Custom Sections (below):</strong> add domain-specific sections like GAP ANALYSIS or OTIF DRIVERS that sit between TRENDS and RISKS.</p>
                                    </>
                                }
                            >
                                <DomainPicker
                                    value={draft.insightsDomain || ""}
                                    onChange={v => setField("insightsDomain", v)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fInsightsCustomSections.name as string}
                                label={fInsightsCustomSections.label}
                                optional
                                hint={<>Domain-specific sections injected between TRENDS and RISKS. Each section becomes a card in the AI Insights output.</>}
                                preview={fInsightsCustomSections.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>Pipeline order:</strong> HEADLINE+KPI → TRENDS → <em>{`{your custom sections}`}</em> → RISKS → RECOMMENDED ACTIONS.</p>
                                        <p><strong>Section name:</strong> short, all-caps preferred (auto-uppercased). Trend-pill decoration fires for measurement-flavoured names like KPI, METRICS, SCORECARD, PERFORMANCE — narrative names like GAP ANALYSIS or ROOT CAUSES are rendered without pill decoration.</p>
                                        <p><strong>Instruction:</strong> tell the AI exactly what to put in this section. Specify format (pipe table / bullets / numbered list), columns, max-word count, what to bold. Reference bound metrics and dimensions; the visual will inject the actual column names automatically.</p>
                                        <p><strong>Reorder:</strong> use ↑/↓ buttons. Empty list → universal sections only.</p>
                                    </>
                                }
                            >
                                <CustomSectionPresetPicker
                                    currentDomain={draft.insightsDomain || ""}
                                    onApplyDomain={d => setField("insightsDomain", d)}
                                    onApplySections={j => setField("insightsCustomSections", j)}
                                />
                                {/* IDEA-043 — universal-stage cards (HEADLINE / TRENDS / RISKS /
                                    RECOMMENDED ACTIONS) rendered above user customs. Each is
                                    visible/hideable + has an editable instruction override. The
                                    pipeline honors visibility and uses the override text when
                                    non-empty (built-in default applies when blank). */}
                                <UniversalStagesEditor
                                    draft={draft}
                                    setField={setField}
                                    setBool={setBool}
                                />
                                <CustomSectionsEditor
                                    value={draft.insightsCustomSections || "[]"}
                                    onChange={v => setField("insightsCustomSections", v)}
                                    apiBaseUrl={draft.apiBaseUrl}
                                    assistantProfile={draft.assistantProfile}
                                    proxyKey={draft.proxyKey}
                                    sqlCtePreamble={draft.sqlCtePreamble}
                                    onOpenSqlConfig={() => jumpToSection("H")}
                                />
                            </FieldRow>

                            <HybridPreview
                                domain={draft.insightsDomain || ""}
                                customSectionsJson={draft.insightsCustomSections || "[]"}
                                universalStages={{
                                    headline: draft.insightsShowHeadline,
                                    trends: draft.insightsShowTrends,
                                    risks: draft.insightsShowRisks,
                                    actions: draft.insightsShowActions
                                }}
                                universalOverrides={{
                                    headline: draft.insightsHeadlineOverride,
                                    trends: draft.insightsTrendsOverride,
                                    risks: draft.insightsRisksOverride,
                                    actions: draft.insightsActionsOverride
                                }}
                            />
                            </>)}{/* end preset/ai-assisted-only fields */}

                            {authoringMode === "manual" && (
                            <FieldRow
                                name={fInsightsPrompt.name as string}
                                label={fInsightsPrompt.label}
                                optional
                                hint={<>You are in <strong>Manual</strong> mode — this prompt is sent verbatim to the AI as a single call. Switch to Preset or AI-assisted above for a portable, dataset-aware fast briefing.</>}
                                example={fInsightsPrompt.example}
                                preview={fInsightsPrompt.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>Manual mode behaviour:</strong> the text here is sent verbatim to the AI on every Insights run. No domain auto-fill, no progressive paint, no adaptation to bound bindings — full author control.</p>
                                        <p><strong>How to structure a custom prompt:</strong> use <code>## SECTION NAME</code> headings to tell the AI what sections to produce. The renderer auto-cards each one.</p>
                                        <p><strong>Example — executive KPI dashboard:</strong></p>
                                        <pre>{`## REVENUE SUMMARY\nTop-line sales and margin vs prior period. Use ▲/▼ and bold the key number.\n\n## REGIONAL BREAKDOWN\nPipe table: Region | Revenue | Margin % | vs Prior. Top 5 regions only.\n\n## KEY RISKS\nTop 3 risks as bullets. Lead each with the risk in bold, ≤15 words.`}</pre>
                                        <p><strong>Trend pill decoration (▲/▼ on numbers):</strong> pills fire automatically in sections named <em>HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, PERFORMANCE, METRICS, SCORECARD, SUMMARY, OVERVIEW, KPI</em>. Other section names suppress pills so imperative text isn't decorated.</p>
                                        <p><strong>Cache:</strong> changing this prompt busts the cache automatically. Switching modes also busts the cache.</p>
                                        <p><strong>No effect</strong> in Chat-only mode (Section 0).</p>
                                    </>
                                }
                            >
                                <textarea
                                    rows={4}
                                    value={draft.insightsPrompt}
                                    onChange={e => setField("insightsPrompt", e.target.value)}
                                    placeholder="e.g. Summarise key KPIs, highlight trends, and flag risks or anomalies."
                                />
                            </FieldRow>
                            )}

                            <FieldRow
                                name={fInsightsDomainGuidance.name as string}
                                label={fInsightsDomainGuidance.label}
                                optional
                                hint={<><strong>Guidance / context</strong> appended to the AI Insights briefing prompt — NOT a prompt that replaces the structure. Use for "rules the AI should respect" (number formats, glossary, business definitions). Leave blank to inherit the Section A Business guidance.</>}
                                example={fInsightsDomainGuidance.example}
                                preview={fInsightsDomainGuidance.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>What it does:</strong> overrides the shared Business guidance for AI Insights stage prompts only. The text gets concatenated INTO each stage's prompt as background context.</p>
                                        <p><strong>What it is NOT:</strong> a prompt to execute. If you paste a SWOT / RFM / Pareto-style structural prompt here ("Output 4 sections: ## STRENGTHS / ## WEAKNESSES / ..."), the briefing still uses its own fixed structure (HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS + your custom sections) — your structural prompt gets treated as guidance and the structure is ignored.</p>
                                        <p><strong>For a structural prompt that drives output shape</strong>, switch <em>Authoring mode</em> above to "Manual" and put the prompt in the <em>AI Insights prompt</em> field instead.</p>
                                        <p><strong>Use when:</strong> Chat and AI Insights need different framing, such as supervisor Chat with single-space Insights.</p>
                                        <p><strong>Leave blank:</strong> AI Insights inherits the shared Domain-specific instructions above.</p>
                                    </>
                                }
                            >
                                <textarea
                                    rows={4}
                                    value={draft.insightsDomainGuidance}
                                    onChange={e => setField("insightsDomainGuidance", e.target.value)}
                                    placeholder="e.g. Summarise from the active space only. Do not cite helper agents."
                                />
                            </FieldRow>

                            {/* Wave 40 — form-first KB metric editor. Replaces the
                                  legacy dual-textarea (free-text rules + JSON map kept
                                  in sync via "Generate from text") with a single source
                                  of truth: the MetricRuleForm. The wrapper hydrates
                                  from the two legacy draft fields on first mount, then
                                  re-derives both on every form change so the prompt
                                  builder (reads metricDirectionRules text) and the
                                  renderer (reads insightsMetricDirections JSON) stay
                                  in lock-step with zero manual sync. */}
                            <FieldRow
                                name={fMetricDirectionRules.name as string}
                                label="Metric direction rules (form)"
                                optional
                                hint={<>Form-driven editor for inverted-good metrics + status thresholds. Both the prompt-text and JSON-map are derived automatically — no more manual "Generate from text".</>}
                                preview={fMetricDirectionRules.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>Wave 40 redesign:</strong> the two legacy textareas (free-text rules + JSON map) are replaced by a card-per-rule form. Both downstream surfaces (the AI Insights prompt + the renderer's color semantics) are derived from the form on every change.</p>
                                        <p><strong>What it does:</strong> tells AI Insights which metrics are higher-is-better or lower-is-better, plus the status thresholds to use in KPI tables.</p>
                                        <p><strong>Use when:</strong> metrics such as Return Rate, Days To Ship, readmissions, or defect rate should improve when values go down.</p>
                                        <p><strong>Preset library:</strong> still available — applies generated rules into the form so you can tune from there.</p>
                                        <p><strong>Quick paste from prose:</strong> migrate an existing block of free-text rules in one step. Useful when copying from another report.</p>
                                        <p><strong>Read-only views:</strong> the disclosures at the bottom show the auto-generated prose + JSON if you need to copy them elsewhere.</p>
                                    </>
                                }
                            >
                                <MetricKnowledgeBaseEditor
                                    currentDomain={draft.insightsDomain || ""}
                                    legacyText={draft.metricDirectionRules}
                                    legacyJson={draft.insightsMetricDirections}
                                    onApplyDomain={d => setField("insightsDomain", d)}
                                    onApplyText={text => setField("metricDirectionRules", text)}
                                    onApplyJson={json => setField("insightsMetricDirections", json)}
                                    onSuggestForCard={onSuggestMetricRuleForCard}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fShowProvenanceFooter.name as string}
                                label={fShowProvenanceFooter.label}
                                kind="toggle"
                                hint={<>Adds compact review metadata (source profile + generated timestamp) to each AI Insights card.</>}
                                preview={fShowProvenanceFooter.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>What it adds:</strong> a thin grey footer line below each Insights section card that reads <code>AI-generated | Source: &lt;profile&gt; | &lt;relative-time&gt;</code>. Helps reviewers + auditors trace which AI workspace produced the output and when.</p>
                                        <p><strong>When to turn OFF:</strong> if the report is for a polished executive view where the footer chrome is visual noise. The provenance is still available in Developer Tools → Diagnostics regardless of this toggle.</p>
                                    </>
                                }
                            >
                                {/* Wave 30 cycle 2 — moved long secondary label "Show source
                                    and generated-time footer on Insights cards" OUT of the
                                    toggle row (it was rendering vertically character-by-
                                    character on narrow PBI panels). The toggle now uses
                                    kind="toggle" + helpBody pattern; the long context
                                    lives in the (i) popover where it has room to breathe. */}
                                <input
                                    type="checkbox"
                                    checked={draft.insightsShowProvenanceFooter}
                                    onChange={e => setBool("insightsShowProvenanceFooter", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fCacheTtl.name as string}
                                label={fCacheTtl.label}
                                hint={<>How long a generated Insights run is cached in memory + localStorage so filter changes and navigation don't re-trigger the AI briefing.</>}
                                example={fCacheTtl.example}
                                preview={fCacheTtl.preview?.(draft)}
                                helpBody={
                                    <>
                                        <p><strong>Default 30 min</strong> survives most authoring sessions. Drop to 5 min for fast-moving demos; extend to 2 h for stable executive dashboards.</p>
                                        <p><strong>Disabled (0)</strong> always re-runs the AI briefing on visual mount. Use only when data changes faster than the cache window.</p>
                                        <p><strong>Cache key</strong> includes connection mode, space, role, KB flags, custom prompt, filter scope. Theme is intentionally excluded.</p>
                                        <p><strong>No effect</strong> in Chat-only mode.</p>
                                    </>
                                }
                            >
                                <select
                                    value={String(draft.insightsCacheTtlMinutes)}
                                    onChange={e => setNum("insightsCacheTtlMinutes", parseInt(e.target.value, 10))}
                                >
                                    <option value="0">Disabled: always re-run</option>
                                    <option value="5">5 minutes</option>
                                    <option value="15">15 minutes</option>
                                    <option value="30">30 minutes (default)</option>
                                    <option value="60">1 hour</option>
                                    <option value="120">2 hours</option>
                                </select>
                            </FieldRow>

                            <FieldRow
                                name={fRefresh.name as string}
                                label="↺ Manual refresh trigger"
                                kind="toggle"
                                hint={<>Flip ON ↔ OFF after changing any setting to re-run AI Insights immediately.</>}
                                helpBody={
                                    <>
                                        <p><strong>Manual force-refresh:</strong> any flip of this toggle clears the AI Insights cache for the current scope and re-fires the briefing.</p>
                                        <p><strong>Why a toggle:</strong> Power BI's format pane has no "button" type, so a toggle whose state-change is the trigger is the cleanest way to expose this from the format pane.</p>
                                        <p><strong>No effect</strong> in Chat-only mode (no Insights to refresh).</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.refreshInsights}
                                    onChange={e => setBool("refreshInsights", e.target.checked)}
                                />
                            </FieldRow>

                            </SetupSubgroup>
                            )}

                        </div>
                    </details>
                );
            })()}

            {/* Section B — Knowledge base. Master toggle gates 3 sub-rules.
                When master is OFF the sub-rules render disabled (visually
                clear they have no effect). Live preview chip shows the count
                of active rules — quick way to see "did I leave KB on or off?". */}
            {(q ? matchingSections.has("B") : true) && (() => {
                const sectionB_state = sectionState("B");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fKbEnabled = findMeta("kbEnabled");
                const fChart = findMeta("kbChartRules");
                const fStat = findMeta("kbStatRules");
                const fReporting = findMeta("kbReportingRules");
                const activeRules = [draft.kbChartRules, draft.kbStatRules, draft.kbReportingRules].filter(Boolean).length;
                const masterPreview = draft.kbEnabled
                    ? `${activeRules} of 3 rule sets active`
                    : "Disabled — domain guidance only";
                return (
                    <details className="gn-setup-advanced-section gn-affinity-shared" data-affinity="shared" open={isOpen("B")} onToggle={onSectionToggle("B")}>
                        <summary title="Injects shared analytics rules such as chart conventions, statistical guardrails, and reporting formats into prompts. Use when every run should follow the same analysis standards.">
                            B. Knowledge base (shared)
                            <SectionStatus state={sectionB_state} />
                            <span className="gn-setup-advanced-summary-hint">Add reusable analytics guidance</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Analytics lead — anyone responsible for chart-type and statistical-correctness standards across the org's reports.">
                                The visual ships with an embedded analytics knowledge base — chart selection rules,
                                statistical best practices, reporting principles — that gets injected into every AI
                                prompt. These toggles let you trim that injection if your domain instructions already
                                cover the same ground or if you want to minimise token cost.
                            </SectionIntro>

                            {renderSectionTools("B")}

                            <FieldRow
                                name={fKbEnabled.name as string}
                                label="Enable analytics intelligence"
                                kind="toggle"
                                hint={<>Master toggle for the embedded analytics KB. When OFF the sub-toggles below have no effect.</>}
                                preview={masterPreview}
                                helpBody={
                                    <>
                                        <p><strong>What it injects:</strong> a curated set of analytics best-practice rules — chart selection, statistical standards, reporting principles — added to every AI prompt as system-level guidance.</p>
                                        <p><strong>Token cost:</strong> ~2-4 KB per prompt depending on which sub-toggles are ON. For high-volume deployments where token cost matters, turn off the sub-rules you've already covered in your Domain Instructions (Section A).</p>
                                        <p><strong>Default ON:</strong> the bundled rules are conservative — they never overrule your Domain Instructions, only fill in gaps.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.kbEnabled}
                                    onChange={e => setBool("kbEnabled", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fChart.name as string}
                                label="Chart selection rules"
                                kind="toggle"
                                hint={<>Chart-type decision rules — comparison, composition, distribution, correlation, flow. Requires master toggle ON.</>}
                                helpBody={
                                    <>
                                        <p><strong>Why useful:</strong> the AI defaults to bar charts unless told otherwise. These rules teach it when a line chart, donut, or scatter plot would be a better fit.</p>
                                        <p><strong>Source:</strong> see <code>genieChatVisual/src/knowledgeBase.ts</code> — bundled with the visual, no live download.</p>
                                        <p><strong>Effect:</strong> shows up in answers as <em>"Recommend a clustered bar chart for region × category sales"</em> rather than just rendering one.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.kbChartRules}
                                    disabled={!draft.kbEnabled}
                                    onChange={e => setBool("kbChartRules", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fStat.name as string}
                                label="Statistical standards"
                                kind="toggle"
                                hint={<>Statistical best practices — mean vs median, outlier detection, YoY calculation, percentage-point vs %. Requires master ON.</>}
                                helpBody={
                                    <>
                                        <p><strong>What it catches:</strong> the most common LLM mistakes in BI — confusing percentage points with percentages, ignoring outliers when reporting "typical" values, computing YoY against the wrong base.</p>
                                        <p><strong>Most useful when</strong> your audience includes non-statisticians who'll act on the answers without checking the math.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.kbStatRules}
                                    disabled={!draft.kbEnabled}
                                    onChange={e => setBool("kbStatRules", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fReporting.name as string}
                                label="Reporting & storytelling standards"
                                kind="toggle"
                                hint={<>Reporting principles — BLUF (bottom line up front), KPI context, precision rules, annotation standards. Requires master ON.</>}
                                helpBody={
                                    <>
                                        <p><strong>What it shapes:</strong> the structure of AI Insights output. With this ON, the briefing leads with the bottom line, gives KPIs alongside their comparisons, and uses consistent precision.</p>
                                        <p><strong>Tradeoff:</strong> the most opinionated of the three rule sets. Turn off if your house style is already strong and you don't want competing voices.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.kbReportingRules}
                                    disabled={!draft.kbEnabled}
                                    onChange={e => setBool("kbReportingRules", e.target.checked)}
                                />
                            </FieldRow>

                        </div>
                    </details>
                );
            })()}

            {/* Section C — Security & access. Strong "declaration vs enforcement"
                callout up top — easy to confuse the badge for an access control.
                Live preview shows the resulting posture badge so the author sees
                exactly what their report will display. */}
            {(q ? matchingSections.has("C") : true) && (() => {
                const sectionC_state = sectionState("C");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fAuth = findMeta("authMode");
                const fRow = findMeta("ucRowFiltersEnforced");
                const fMask = findMeta("ucColumnMasksEnforced");
                // Compose the posture summary to mirror the header badge logic
                // in visual.tsx — keeps the preview honest about what users see.
                const posture = (() => {
                    const obo = draft.authMode === "oauthObo";
                    const ucAny = draft.ucRowFiltersEnforced || draft.ucColumnMasksEnforced;
                    if (obo && ucAny) return "UC-enforced (per-user)";
                    if (!obo && ucAny) return "UC-enforced (service)";
                    return "Scope-only";
                })();
                return (
                    <details className="gn-setup-advanced-section gn-affinity-shared" data-affinity="shared" open={isOpen("C")} onToggle={onSectionToggle("C")}>
                        <summary title="Records auth mode and access declarations for prompt context. Use when documenting report access assumptions. Informational only — Unity Catalog enforces.">
                            C. Security and access (shared)
                            <SectionStatus state={sectionC_state} />
                            <span className="gn-setup-advanced-summary-hint">Declare access assumptions</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Data security / governance owner — anyone who knows the upstream Unity Catalog access controls.">
                                Declare the access posture this report assumes. <strong>These are declarations, not enforcement —
                                Unity Catalog still does the actual gating.</strong> The toggles control the header security
                                badge and add governance hints to every AI prompt. They do not lock anything down on their own.
                            </SectionIntro>

                            {renderSectionTools("C")}

                            <FieldRow
                                name={fAuth.name as string}
                                label="Authentication model"
                                hint={<><strong>Shared PAT:</strong> one identity serves all viewers. <strong>OAuth OBO:</strong> per-viewer identity, requires proxy v2 with token exchange.</>}
                                preview={posture}
                                helpBody={
                                    <>
                                        <p><strong>Shared PAT</strong> is the default and the simplest path. Every report viewer hits Databricks as the same service identity. Suitable when all viewers should see the same data, or when access scoping is handled higher up the stack.</p>
                                        <p><strong>OAuth on-behalf-of</strong> exchanges the PBI viewer's identity for a downstream Databricks token, so Unity Catalog row filters and column masks apply per user. Requires a proxy configured for OBO (see Report Author Guide §3).</p>
                                        <p><strong>Header badge</strong> follows this choice and the two UC declarations below. Preview chip shows what viewers will see.</p>
                                    </>
                                }
                            >
                                <select
                                    value={draft.authMode}
                                    onChange={e => setField("authMode", e.target.value)}
                                >
                                    <option value="sharedPat">Shared PAT: single service identity (default)</option>
                                    <option value="oauthObo">OAuth on-behalf-of: per-viewer identity (proxy v2)</option>
                                </select>
                            </FieldRow>

                            <FieldRow
                                name={fRow.name as string}
                                label="Unity Catalog row filters active"
                                kind="toggle"
                                hint={<>Turn ON when the UC tables the AI reads have ROW FILTER functions applied (e.g. keyed on <code>current_user()</code>).</>}
                                helpBody={
                                    <>
                                        <p><strong>Declaration only:</strong> turning this ON does not create row filters. It tells the visual that filters exist upstream so the header badge upgrades to <em>Row-filtered</em> and the AI gets a per-user data-access hint.</p>
                                        <p><strong>When to use:</strong> your data steward has applied <code>ROW FILTER fn ON COLUMN</code> in Unity Catalog, typically keyed on <code>current_user()</code> or group membership.</p>
                                        <p><strong>Combine with OAuth OBO</strong> for true per-user gating. Shared PAT + this ON gives a service-account-wide row filter — cosmetic in many setups.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.ucRowFiltersEnforced}
                                    onChange={e => setBool("ucRowFiltersEnforced", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fMask.name as string}
                                label="Unity Catalog column masks active"
                                kind="toggle"
                                hint={<>Turn ON when UC column masks hide or redact restricted columns for non-privileged users.</>}
                                helpBody={
                                    <>
                                        <p><strong>Same caveat:</strong> declaration, not enforcement. UC column masks must already be configured in Databricks (<code>MASK fn ON COLUMN</code>) for this toggle to mean anything.</p>
                                        <p><strong>Effect on AI:</strong> adds a column-governance hint so the AI doesn't suggest queries that would obviously be masked at runtime ("show me email addresses from the masked customer table").</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.ucColumnMasksEnforced}
                                    onChange={e => setBool("ucColumnMasksEnforced", e.target.checked)}
                                />
                            </FieldRow>

                        </div>
                    </details>
                );
            })()}

            {/* Section H — SQL Configuration. CTE preamble, forbidden tables,
                viewer-role injection. Supports {{role}}, {{currentDate}},
                {{year}} template variables for role-based row scoping without
                requiring real SSO. Unity Catalog still enforces OLS on top. */}
            {(q ? matchingSections.has("H") : true) && (() => {
                const sectionH_state = sectionState("H");
                const fCtePreamble    = STEP5_FIELDS.find(f => f.name === "sqlCtePreamble")!;
                const fForbidTables   = STEP5_FIELDS.find(f => f.name === "sqlForbiddenTables")!;
                const fRlsHint        = STEP5_FIELDS.find(f => f.name === "sqlRlsHintEnabled")!;
                return (
                    <details
                        key="H"
                        className="gn-setup-advanced-section gn-affinity-shared"
                        data-affinity="shared"
                        open={isOpen("H")}
                        onToggle={onSectionToggle("H")}
                    >
                        <summary title="SQL data configuration for deterministic Insights sections and generated SQL. Use a base CTE, forbidden tables, or role-template hints when you need scoped warehouse-backed data.">
                            H. SQL data configuration (shared)
                            <SectionStatus state={sectionH_state} />
                            <span className="gn-setup-advanced-summary-hint">CTE, forbidden tables, deterministic SQL cards</span>
                        </summary>
                        <div className="gn-setup-advanced-body">
                        <SectionIntro audience="Data engineer / report author who needs to scope every Genie query to a region, role, or pre-filtered dataset.">
                            Inject parameterized SQL into every AI request — primary AND multi-space. Use a CTE to build a pre-filtered view, restrict which tables the AI can touch, and optionally inject the viewer role for role-based row filtering. Unity Catalog still enforces OLS on top.
                        </SectionIntro>

                        {renderSectionTools("H")}

                        <div className="gn-setup-fields">
                            {/* Wave 22 cycle 3h: template-var insert buttons sit
                                above the CTE textarea so authors don't have to
                                read the hint to discover supported variables. */}
                            <div className="gn-tpl-var-bar" role="group" aria-label="Insert template variable into CTE">
                                <span className="gn-tpl-var-bar-label">Insert:</span>
                                {(["{{role}}", "{{currentDate}}", "{{year}}"] as const).map(tok => (
                                    <button
                                        key={tok}
                                        type="button"
                                        className="gn-tpl-var-btn"
                                        title={`Insert ${tok} at cursor`}
                                        onClick={() => {
                                            const ta = document.getElementById("gn-fld-sqlCtePreamble") as HTMLTextAreaElement | null;
                                            const current = draft.sqlCtePreamble || "";
                                            if (ta && typeof ta.selectionStart === "number") {
                                                const s = ta.selectionStart;
                                                const e = ta.selectionEnd;
                                                const next = current.slice(0, s) + tok + current.slice(e);
                                                setField("sqlCtePreamble", next);
                                                requestAnimationFrame(() => {
                                                    ta.focus();
                                                    const pos = s + tok.length;
                                                    ta.setSelectionRange(pos, pos);
                                                });
                                            } else {
                                                setField("sqlCtePreamble", current + tok);
                                            }
                                        }}
                                    >+ <code>{tok}</code></button>
                                ))}
                            </div>

                            <FieldRow
                                name={fCtePreamble.name as string}
                                label={fCtePreamble.label}
                                hint={<>Full SQL <code>WITH</code> clause the AI must use as its base dataset. Template variables: <code>{"{{role}}"}</code> (active viewer role), <code>{"{{currentDate}}"}</code> (YYYY-MM-DD), <code>{"{{year}}"}</code> (YYYY). <em>Sanitization at runtime:</em> control chars stripped, line endings normalized, blank-line runs capped at 2, max 5,000 chars.</>}
                                example={fCtePreamble.example}
                                preview={draft.sqlCtePreamble.trim() ? `CTE active · ${draft.sqlCtePreamble.length} chars` : null}
                                helpBody={
                                    <>
                                        <p><strong>What it does:</strong> Forces every SQL the AI writes to start <code>FROM &lt;your CTE alias&gt;</code> instead of querying base tables directly. Defence-in-depth alongside Unity Catalog grants.</p>
                                        <p><strong>Template substitution:</strong> Before sending to the AI, <code>{"{{role}}"}</code> becomes the active viewer role (sanitised — quotes, semicolons, comment markers, and SQL keywords like DROP/DELETE/UPDATE are stripped). <code>{"{{currentDate}}"}</code> becomes today's date as YYYY-MM-DD; <code>{"{{year}}"}</code> becomes the 4-digit year.</p>
                                        <p><strong>Example with substitution:</strong></p>
                                        <pre><code>{`Author writes:
WITH scoped AS (
  SELECT * FROM sales
  WHERE region = '{{role}}'
    AND order_date >= '{{year}}-01-01'
)

Sent to AI (when role=APAC, year=2026):
WITH scoped AS (
  SELECT * FROM sales
  WHERE region = 'APAC'
    AND order_date >= '2026-01-01'
)`}</code></pre>
                                        <p><strong>Why sanitization:</strong> A hostile role value like <code>{"APAC'; DROP TABLE users; --"}</code> would be reduced to a benign <code>APAC users</code> before substitution — quotes, semicolons, comment markers, and the DROP/TABLE keywords are all stripped.</p>
                                    </>
                                }
                            >
                                <textarea
                                    className="gn-setup-textarea gn-setup-textarea--code"
                                    rows={6}
                                    value={draft.sqlCtePreamble}
                                    onChange={e => setField("sqlCtePreamble", e.target.value)}
                                    placeholder={fCtePreamble.example}
                                    spellCheck={false}
                                    maxLength={5000}
                                />
                                {/* Wave 28 — character counter so authors don't hit
                                    the silent maxLength=5000 truncation wall. Turns
                                    amber past 4500 chars, red at the cap. */}
                                {(() => {
                                    const len = (draft.sqlCtePreamble || "").length;
                                    const tone = len >= 5000 ? "gn-setup-charcount--cap" : len > 4500 ? "gn-setup-charcount--warn" : "";
                                    return (
                                        <span className={`gn-setup-charcount ${tone}`} aria-live="polite">
                                            {len.toLocaleString()} / 5,000 characters
                                            {len >= 5000 ? " (cap reached — further input ignored)" : ""}
                                        </span>
                                    );
                                })()}
                            </FieldRow>

                            <FieldRow
                                name={fForbidTables.name as string}
                                label={fForbidTables.label}
                                hint={<>Comma-separated table or view names the AI must never reference. Applied in addition to Forbidden Columns in Section C. <em>Sanitization at runtime:</em> only valid SQL identifiers (bare/dotted/bracketed/quoted/backticked, max 64 chars each) pass through; multi-word phrases or prose entries are dropped.</>}
                                example={fForbidTables.example}
                                preview={(() => {
                                    // Wave 30 cycle 5 — preview must reflect post-sanitization
                                    // count, not raw split count. Mirrors IDENTIFIER_RE in
                                    // genie.ts:259 — keep in sync if that regex changes.
                                    const raw = String(draft.sqlForbiddenTables || "").trim();
                                    if (!raw) return null;
                                    const IDENT_RE = /^(?:[A-Za-z_][\w.]{0,63}|`[\w.]{1,63}`|\[[\w.]{1,63}\]|"[\w.]{1,63}"|'[\w.]{1,63}')$/;
                                    const entries = raw.split(",").map(s => s.trim()).filter(Boolean);
                                    const accepted = entries.filter(e => e.length <= 65 && IDENT_RE.test(e));
                                    const dropped = entries.length - accepted.length;
                                    if (dropped === 0) return `${accepted.length} table(s) blocked`;
                                    return `${accepted.length} of ${entries.length} entries will pass sanitization · ${dropped} dropped`;
                                })()}
                                helpBody={
                                    <>
                                        <p><strong>Strict identifier validation:</strong> Each comma-separated entry must match a SQL identifier pattern: bare (<code>raw_pii</code>), dotted (<code>schema.audit_log</code>), bracketed (<code>[my-table]</code>), quoted (<code>"raw"</code>), or backticked (<code>`staging`</code>).</p>
                                        <p>Anything that doesn't validate (multi-word phrases, sentences, special chars, newlines) is dropped — this prevents injection attempts that try to smuggle directives by impersonating "table names".</p>
                                    </>
                                }
                            >
                                <input
                                    type="text"
                                    className="gn-setup-input"
                                    value={draft.sqlForbiddenTables}
                                    onChange={e => setField("sqlForbiddenTables", e.target.value)}
                                    placeholder={fForbidTables.example}
                                    maxLength={2000}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fRlsHint.name as string}
                                label={fRlsHint.label}
                                kind="toggle"
                                hint={<>When ON, sends <code>{"Current viewer role: \"<role>\""}</code> as a context hint. Pair with <code>{"{{role}}"}</code> in your CTE or WHERE filter. The visual cannot read the viewer's actual login identity — use the role selector in Section A (or a DAX measure like <code>USERPRINCIPALNAME()</code>) as the proxy.</>}
                                preview={draft.sqlRlsHintEnabled ? "Role hint active" : null}
                                helpBody={
                                    <>
                                        <p><strong>Pair with template variable:</strong> Toggling this ON only adds a one-line context hint. To actually filter data by role, also reference <code>{"{{role}}"}</code> in either Section C's <em>Mandatory Row Filter</em> or this section's <em>Base CTE</em>.</p>
                                        <p><strong>Not real SSO:</strong> The PBI sandbox blocks the visual from reading the viewer's login identity. The role comes from a DAX measure the report author binds — a malicious author could spoof it. Adequate for trusted-author enterprise BI; insufficient for multi-tenant SaaS (use Tier C / PBI Embedded sidecar there).</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.sqlRlsHintEnabled}
                                    onChange={e => setBool("sqlRlsHintEnabled", e.target.checked)}
                                />
                            </FieldRow>

                            {/* Wave 42 — "Currently bound role" preview chip.
                                Shows the live value of the bound USERPRINCIPALNAME()
                                measure so authors can verify the dynamic identity
                                actually reaches the visual (and therefore the
                                Genie role-hint payload). When no measure is bound,
                                the chip becomes an advisory pointing at the
                                recommended DAX pattern. The chip only renders when
                                the toggle is ON — turning it OFF visually mutes
                                the diagnostic since the role hint is inert anyway. */}
                            {draft.sqlRlsHintEnabled && (() => {
                                const bound = (boundUserId || "").trim();
                                if (bound) {
                                    return (
                                        <div
                                            className="gn-setup-chip gn-setup-chip--ok"
                                            role="status"
                                            aria-label={`Bound viewer identity from User Role measure: ${bound}`}
                                            style={{ marginTop: 6, fontSize: 12, padding: "4px 8px", borderRadius: 4, background: "rgba(34,134,58,0.10)", color: "var(--gn-fg, #1f1f1f)", display: "inline-block" }}
                                        >
                                            <span aria-hidden="true" style={{ marginRight: 6 }}>✓</span>
                                            Currently bound: <strong>{bound}</strong> <span style={{ opacity: 0.75 }}>(via measure)</span>
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        className="gn-setup-chip gn-setup-chip--warn"
                                        role="status"
                                        aria-label="No User Role measure bound; the manual Setup Section A role selector will be used as a fallback."
                                        style={{ marginTop: 6, fontSize: 12, padding: "4px 8px", borderRadius: 4, background: "rgba(204,140,0,0.12)", color: "var(--gn-fg, #1f1f1f)", display: "inline-block" }}
                                    >
                                        Warning: No User Role measure bound. Falling back to the manual selector in Section A. Recommended: bind a DAX measure like <code>View User = USERPRINCIPALNAME()</code> to the <em>userIdentity</em> data role.
                                    </div>
                                );
                            })()}
                        </div>
                        </div>
                    </details>
                );
            })()}

            {/* Section D — Multi-space. Master toggle + count picker + dynamic
                slot cards. Each slot now has a per-slot status dot ("configured"
                / "incomplete" / "blank") so authors see at a glance which slots
                still need attention. Slots beyond multiSpaceCount are hidden
                but their values preserved — bumping the count back up restores
                them. */}
            {(q ? matchingSections.has("D") : true) && (() => {
                const sectionD_state = sectionState("D");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fEnabled = findMeta("multiSpaceEnabled");
                const fCount = findMeta("multiSpaceCount");
                const masterPreview = fCount.preview?.(draft);

                // Per-slot status: "configured" if at least label + (spaceId OR profile) set;
                // "incomplete" if label set but neither spaceId nor profile; "blank" otherwise.
                const slotState = (n: number): "configured" | "incomplete" | "blank" => {
                    const label = String(draft[`space${n}Label` as keyof SetupDraft] ?? "").trim();
                    const profile = String(draft[`space${n}AssistantProfile` as keyof SetupDraft] ?? "").trim();
                    const spaceId = String(draft[`space${n}SpaceId` as keyof SetupDraft] ?? "").trim();
                    if (!label) return "blank";
                    if (!profile && !spaceId) return "incomplete";
                    return "configured";
                };

                // Count slots that have non-default values across all 9 slots
                // (not just the visible ones) — drives the "preserved values"
                // hint when the count is reduced.
                const populatedHiddenSlots = (() => {
                    let n = 0;
                    for (let s = 2; s <= 10; s++) {
                        if (s <= draft.multiSpaceCount + 1) continue;
                        const label = String(draft[`space${s}Label` as keyof SetupDraft] ?? "").trim();
                        const spaceId = String(draft[`space${s}SpaceId` as keyof SetupDraft] ?? "").trim();
                        if (label || spaceId) n++;
                    }
                    return n;
                })();

                return (
                    <details className="gn-setup-advanced-section gn-affinity-chat" data-affinity="chat" open={isOpen("D")} onToggle={onSectionToggle("D")}>
                        <summary title="Adds up to 8 helper spaces with separate labels, profiles, space IDs, hosts, and tokens. Use when insight generation needs multiple specialized AI workspaces.">
                            D. Chat: multi-AI workspaces
                            <SectionStatus state={sectionD_state} />
                            <span className="gn-setup-advanced-summary-hint">Configure helper AI workspaces</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Multi-domain analytics owner — anyone curating spaces for several business domains (sales, customer, ops, HSE).">
                                Connect this report to multiple AI workspaces, each with its own conversation history.
                                A space-selector tab strip appears in the visual header when enabled. Use this for
                                cross-domain reports where one space can't answer everything; pair with the supervisor
                                connection mode (Section E) for orchestrated answers across spaces.
                            </SectionIntro>

                            {renderSectionTools("D")}

                            <FieldRow
                                name={fEnabled.name as string}
                                label="Enable multiple spaces"
                                kind="toggle"
                                hint={<>When ON, a space selector tab strip appears in the visual header. Each space has its own conversation history.</>}
                                helpBody={
                                    <>
                                        <p><strong>Header impact:</strong> turning this ON adds a tab strip above the chat area showing every slot whose Label is set. Click a tab to switch active space; conversation history is per-space.</p>
                                        <p><strong>Synchronised broadcast:</strong> when ON, the chat compose bar gains a "Sync" mode that fans the same question to all enabled spaces simultaneously, then offers ⚡ Fuse answers via the supervisor.</p>
                                        <p><strong>Configuration is preserved</strong> when you turn this OFF — flipping back ON restores everything below.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.multiSpaceEnabled}
                                    onChange={e => setBool("multiSpaceEnabled", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fCount.name as string}
                                label="Additional space count"
                                hint={<>How many additional spaces to reveal — primary is always present (Steps 1–3). Slots above this count are hidden but values preserved.</>}
                                example={fCount.example}
                                preview={masterPreview}
                                helpBody={
                                    <>
                                        <p><strong>1 to 9 additional</strong> (10 total counting the primary). Reducing the count <em>hides</em> the higher slots without losing their persisted values — bump it back up to restore them.</p>
                                        <p><strong>Defaults to 3</strong> for backward compatibility with existing PBIPs that pre-date the count picker.</p>
                                        <p><strong>Performance note:</strong> in supervisor sync mode, every enabled slot fires its own AI call. Above ~5 simultaneous calls you may hit Databricks's per-workspace rate limits.</p>
                                    </>
                                }
                            >
                                <select
                                    value={String(draft.multiSpaceCount)}
                                    onChange={e => setNum("multiSpaceCount", parseInt(e.target.value, 10))}
                                    disabled={!draft.multiSpaceEnabled}
                                >
                                    {[1,2,3,4,5,6,7,8,9].map(n => (
                                        <option key={n} value={n}>{n} additional ({n + 1} total)</option>
                                    ))}
                                </select>
                            </FieldRow>

                            {populatedHiddenSlots > 0 && draft.multiSpaceEnabled && (
                                <div className="gn-setup-multispace-hidden-note">
                                    <strong>{populatedHiddenSlots} slot{populatedHiddenSlots === 1 ? "" : "s"} hidden</strong> — values preserved. Increase <em>Additional space count</em> to reveal them.
                                </div>
                            )}

                            {draft.multiSpaceEnabled && (() => {
                                // Render only the slots up to multiSpaceCount. Each slot is a
                                // 5-field block (label, profile, spaceId, host, token) — host
                                // and token inherit from the primary when blank, so they're
                                // marked optional in the field hints.
                                const slotIdx = Array.from({ length: Math.min(Math.max(draft.multiSpaceCount, 1), 9) }, (_, i) => i + 2);
                                const slotFieldNames = (n: number) => ({
                                    label: `space${n}Label` as keyof SetupDraft,
                                    profile: `space${n}AssistantProfile` as keyof SetupDraft,
                                    spaceId: `space${n}SpaceId` as keyof SetupDraft,
                                    host: `space${n}Host` as keyof SetupDraft,
                                    token: `space${n}Token` as keyof SetupDraft,
                                });
                                return (
                                    <div className="gn-setup-multispace-slots">
                                        {slotIdx.map(n => {
                                            const fns = slotFieldNames(n);
                                            const state = slotState(n);
                                            const stateLabel = state === "configured" ? "configured"
                                                : state === "incomplete" ? "incomplete — needs profile or space ID"
                                                : "blank";
                                            const stateClass = state === "configured" ? "customised"
                                                : state === "incomplete" ? "incomplete"
                                                : "defaults";
                                            return (
                                                <fieldset key={n} className="gn-setup-multispace-slot">
                                                    <legend>
                                                        Space {n}
                                                        <SectionStatus state={stateClass as any} label={stateLabel} />
                                                        <button
                                                            type="button"
                                                            className="gn-btn gn-btn--compact gn-setup-slot-validate"
                                                            disabled
                                                            title="Wired in 48.7 — pings the slot URL via the proxy or Direct mode"
                                                        >
                                                            Validate
                                                        </button>
                                                    </legend>
                                                    <div className="gn-setup-field">
                                                        <label>Label</label>
                                                        <input
                                                            type="text"
                                                            value={String(draft[fns.label] ?? "")}
                                                            onChange={e => setField(fns.label, e.target.value)}
                                                            placeholder={n === 2 ? "e.g. Customer" : n === 3 ? "e.g. HSE" : n === 4 ? "e.g. Operations" : `e.g. Space ${n}`}
                                                        />
                                                        <span className="gn-setup-field-hint">Short tab name. Leave blank to disable this slot at runtime.</span>
                                                    </div>
                                                    <div className="gn-setup-field">
                                                        <label>Proxy profile  <span className="gn-setup-field-optional">(optional)</span></label>
                                                        <input
                                                            type="text"
                                                            value={String(draft[fns.profile] ?? "")}
                                                            onChange={e => setField(fns.profile, e.target.value)}
                                                            onBlur={e => { const t = e.target.value.replace(/[ ]/g, " ").trim(); if (t !== e.target.value) setField(fns.profile, t); }}
                                                            placeholder="default"
                                                        />
                                                        <span className="gn-setup-field-hint">Profile name from the proxy's <code>config.json</code>. Leave blank to use the proxy's default profile.</span>
                                                    </div>
                                                    <div className="gn-setup-field">
                                                        <label>AI Workspace ID  <span className="gn-setup-field-optional">(Direct/Gateway only · 32-char lowercase hex)</span></label>
                                                        <input
                                                            type="text"
                                                            value={String(draft[fns.spaceId] ?? "")}
                                                            onChange={e => setField(fns.spaceId, e.target.value)}
                                                            onBlur={e => { const t = e.target.value.replace(/[ \s]+/g, "").trim(); if (t !== e.target.value) setField(fns.spaceId, t); }}
                                                            placeholder="01f1••••••••••••••••••••••••••••"
                                                        />
                                                        <span className="gn-setup-field-hint">Required for Direct and Gateway transports. In Proxy mode the profile resolves this server-side. Whitespace and NBSP from clipboard pastes are stripped on blur.</span>
                                                    </div>
                                                    <div className="gn-setup-field">
                                                        <label>Workspace URL  <span className="gn-setup-field-optional">(inherits primary if blank)</span></label>
                                                        <input
                                                            type="text"
                                                            value={String(draft[fns.host] ?? "")}
                                                            onChange={e => setField(fns.host, e.target.value)}
                                                            onBlur={e => { const t = e.target.value.replace(/[ \s]+/g, "").trim(); if (t !== e.target.value) setField(fns.host, t); }}
                                                            placeholder="(inherits primary)"
                                                        />
                                                        <span className="gn-setup-field-hint">Override only for cross-workspace setups. Leave blank to share the primary connection's host.</span>
                                                    </div>
                                                    <div className="gn-setup-field">
                                                        <label>Access token  <span className="gn-setup-field-optional">(Direct mode only · inherits if blank)</span></label>
                                                        <input
                                                            type="password"
                                                            value={String(draft[fns.token] ?? "")}
                                                            onChange={e => setField(fns.token, e.target.value)}
                                                            onBlur={e => { const t = e.target.value.replace(/[ \s]+/g, "").trim(); if (t !== e.target.value) setField(fns.token, t); }}
                                                            placeholder="(inherits primary)"
                                                        />
                                                        <span className="gn-setup-field-hint">Direct mode only. Leave blank to share the primary connection's PAT. ⚠ Stored in the .pbix file — prefer Proxy mode for production.</span>
                                                    </div>
                                                </fieldset>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                        </div>
                    </details>
                );
            })()}

            {/* Section E — Supervisor. Endpoint Validate stub (wired in 48.7
                via HEAD probe through proxy). Display preview shows whether the
                supervisor will run remote-agent or local-fusion. */}
            {(q ? matchingSections.has("E") : true) && (() => {
                const sectionE_state = sectionState("E");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fEndpoint = findMeta("supervisorEndpoint");
                const fName = findMeta("supervisorAgentName");
                const fProfile = findMeta("supervisorSynthesisProfile");
                const fAuto = findMeta("supervisorAutoFusion");
                const fPrompt = findMeta("supervisorSynthesisPrompt");
                const supervisorMode = draft.supervisorEndpoint.trim().length > 0
                    ? "Remote agent endpoint"
                    : "Local fusion (proxy-side)";
                return (
                    <details className="gn-setup-advanced-section gn-affinity-chat" data-affinity="chat" open={isOpen("E")} onToggle={onSectionToggle("E")}>
                        <summary title="Defines the supervisor endpoint, agent, synthesis profile, fusion behavior, and synthesis prompt. Use when multiple helper outputs need one combined answer.">
                            E. Chat: supervisor agent
                            <SectionStatus state={sectionE_state} />
                            <span className="gn-setup-advanced-summary-hint">Coordinate helper synthesis</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Multi-domain orchestration owner — anyone running a Mosaic AI supervisor agent or proxy-side multi-space fusion.">
                                Two distinct concerns live here. The <strong>endpoint</strong> field points at a remote
                                Databricks Mosaic AI agent that orchestrates queries server-side. The <strong>local
                                synthesis</strong> fields tune the proxy-side ⚡ Fuse step that runs when several AI
                                workspaces have answered the same question in sync mode. You can use either, both, or neither.
                            </SectionIntro>

                            {renderSectionTools("E")}

                            <FieldRow
                                name={fEndpoint.name as string}
                                label="Supervisor agent endpoint"
                                optional
                                hint={<>Databricks Mosaic AI serving endpoint URL that orchestrates queries server-side. Used only when Connection Mode is <em>Supervisor</em>.</>}
                                example={fEndpoint.example}
                                preview={supervisorMode}
                                helpBody={
                                    <>
                                        <p><strong>Remote-agent path:</strong> when set, the proxy forwards the user's question here. The supervisor decides which AI workspaces to call, queries them, and returns one unified answer. The visual shows progress as the supervisor's own breadcrumb stream.</p>
                                        <p><strong>Local-fusion fallback:</strong> when blank (and Connection Mode is not Supervisor), the proxy runs its own multi-space fan-out + fusion using the spaces declared in Section D and the local <em>Synthesis profile</em> below. Cheaper to set up; less powerful than a true Mosaic AI agent.</p>
                                        <p><strong>Format:</strong> full Databricks serving endpoint URL ending in <code>/invocations</code>. Auth is via the same proxy profile used for AI calls.</p>
                                    </>
                                }
                            >
                                <input
                                    type="text"
                                    value={draft.supervisorEndpoint}
                                    onChange={e => setField("supervisorEndpoint", e.target.value)}
                                    onBlur={e => { const t = e.target.value.replace(/[ \s]+/g, "").trim(); if (t !== e.target.value) setField("supervisorEndpoint", t); }}
                                    placeholder="https://dbc-xxx.cloud.databricks.com/serving-endpoints/dwd-supervisor/invocations"
                                />
                            </FieldRow>

                            <FieldRow
                                name={fName.name as string}
                                label="Supervisor display name"
                                hint={<>Name shown in the visual header and progress text. Defaults to "Supervisor" when blank.</>}
                                example={fName.example}
                                helpBody={
                                    <>
                                        <p>Cosmetic — controls the label on the supervisor's chat bubble and progress chip. Useful to brand the experience ("Sales Brain", "Ops Copilot") rather than the generic "Supervisor".</p>
                                    </>
                                }
                            >
                                <input
                                    type="text"
                                    value={draft.supervisorAgentName}
                                    onChange={e => setField("supervisorAgentName", e.target.value)}
                                    placeholder="Supervisor"
                                />
                            </FieldRow>

                            <FieldRow
                                name={fProfile.name as string}
                                label="Synthesis profile / space ID"
                                optional
                                hint={<>For the proxy-side local fusion. Profile or AI workspace ID that performs the synthesis call. Defaults to <code>space1</code>.</>}
                                example={fProfile.example}
                                helpBody={
                                    <>
                                        <p><strong>Local fusion only:</strong> this picks which space (from Section D) the proxy uses for the actual synthesis call after fanning out to other spaces. Has no effect when a remote-agent endpoint is set.</p>
                                        <p><strong>Pick the most capable model:</strong> using a high-quality space here (one tied to a stronger Databricks Foundation Model) often improves fusion quality more than tuning the synthesis prompt.</p>
                                    </>
                                }
                            >
                                <input
                                    type="text"
                                    value={draft.supervisorSynthesisProfile}
                                    onChange={e => setField("supervisorSynthesisProfile", e.target.value)}
                                    placeholder="space1"
                                />
                            </FieldRow>

                            <FieldRow
                                name={fAuto.name as string}
                                label="Auto-fuse synchronised answers"
                                kind="toggle"
                                hint={<>Trigger answer fusion automatically when 2+ spaces have responded. OFF = manual click.</>}
                                helpBody={
                                    <>
                                        <p><strong>ON:</strong> as soon as the last space's answer arrives, the proxy fires the synthesis call automatically. The user sees one extra spinner ("Fusing...") then the unified answer.</p>
                                        <p><strong>OFF:</strong> a "Fuse answers" button appears on the chat after the last per-space answer. Useful when fusion is expensive and you want the user to opt in.</p>
                                        <p><strong>No effect</strong> in single-space mode or when fewer than 2 spaces respond.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.supervisorAutoFusion}
                                    onChange={e => setBool("supervisorAutoFusion", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fPrompt.name as string}
                                label="Synthesis / fusion system prompt"
                                optional
                                hint={<>Instructions guiding the supervisor when synthesising multiple space answers. Controls tone and structure of the fused response.</>}
                                example={fPrompt.example}
                                helpBody={
                                    <>
                                        <p><strong>What it controls:</strong> the system prompt for the local-fusion synthesis call. Shapes how cross-source disagreements are handled, how numbers are reconciled, and the structure of the final answer.</p>
                                        <p><strong>Default behaviour</strong> (when blank): "lead with unified conclusion, highlight agreements, flag discrepancies, preserve all numbers." Good enough for most reports.</p>
                                        <p><strong>Tradeoff:</strong> longer prompts improve consistency but increase token cost on every fusion call.</p>
                                    </>
                                }
                            >
                                <textarea
                                    rows={5}
                                    value={draft.supervisorSynthesisPrompt}
                                    onChange={e => setField("supervisorSynthesisPrompt", e.target.value)}
                                    placeholder={"Synthesise these answers into a single complete response. Lead with the unified conclusion, highlight agreements, flag discrepancies, and preserve all numbers."}
                                />
                            </FieldRow>

                        </div>
                    </details>
                );
            })()}

            {/* Section F (Header & display) intentionally not exposed here. The
                Power BI format pane "Header & Layout" group already provides edit
                UIs for headerTitle, headerSubtitle, uiScale, compactMode, and
                showSetupAccess. Per the agreed direction (CLAUDE.md tripwire),
                presentation belongs in the format pane; the Setup tab focuses on
                operational config. The fields stay in SetupDraft so a draft Apply
                doesn't inadvertently null them out. */}

            {/* Section F — Developer surface. Each toggle's popover spells out
                exactly which connection modes honour it (the noOp metadata on
                STEP5_FIELDS). Bulk on/off buttons in the toolbar so authors
                can flip the entire dev surface in one click before publishing. */}
            {(q ? matchingSections.has("F") : true) && (() => {
                const sectionF_state = sectionState("F");
                const findMeta = (n: keyof SetupDraft) =>
                    STEP5_FIELDS.find(f => f.name === n)!;
                const fDev = findMeta("devMode");
                const fSql = findMeta("showSql");
                const fTrace = findMeta("showTrace");
                const fFilters = findMeta("showGuidedFilters");
                const fActions = findMeta("allowReportActions");
                const onCount = [draft.devMode, draft.showSql, draft.showTrace, draft.showGuidedFilters].filter(Boolean).length;
                const surfacePreview = `${onCount} of 4 dev tools enabled`;
                const flipAll = (value: boolean) => {
                    setBool("devMode", value);
                    setBool("showSql", value);
                    setBool("showTrace", value);
                    setBool("showGuidedFilters", value);
                };
                return (
                    <details className="gn-setup-advanced-section gn-affinity-shared" data-affinity="shared" open={isOpen("F")} onToggle={onSectionToggle("F")}>
                        <summary title="Controls SQL display, trace output, dev mode, report actions, and setup access. Use during testing, troubleshooting, or controlled author-facing deployments.">
                            F. Developer surface (shared)
                            <SectionStatus state={sectionF_state} />
                            <span className="gn-setup-advanced-summary-hint">Expose power-user controls</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="Report author / developer — turn ON during build, OFF before publishing.">
                                Power-user toggles for building, testing, and troubleshooting. <strong>Keep all OFF for
                                published end-user reports.</strong> The visual exposes diagnostics, raw SQL, and routing
                                trace only when these flags are set — none of them affect AI behaviour, just what the
                                user sees alongside answers.
                            </SectionIntro>

                            <SectionToolbar>
                                <button type="button" className="gn-btn gn-btn--compact" onClick={() => flipAll(true)} title="Turn dev mode + SQL + trace + filters all ON (review)">All ON</button>
                                <button type="button" className="gn-btn gn-btn--compact" onClick={() => flipAll(false)} title="Turn dev mode + SQL + trace + filters all OFF (publish-ready)">All OFF</button>
                            </SectionToolbar>
                            {renderSectionTools("F")}

                            <div className="gn-setup-features-gate-preview" aria-live="polite" style={{ marginBottom: 6 }}>
                                Surface state: <strong>{surfacePreview}</strong>
                            </div>

                            <FieldRow
                                name={fDev.name as string}
                                label="Developer mode"
                                kind="toggle"
                                hint={<>Shows the on-canvas diagnostics panel (setup guidance, context payload, routing info, orchestration trace). <strong>Turn OFF before publishing.</strong></>}
                                helpBody={
                                    <>
                                        <p><strong>What it shows:</strong> a side panel listing the connection mode, host, profile, last health-check result, the exact context payload sent on the most recent question, and a per-step orchestration trace.</p>
                                        <p><strong>Most useful during:</strong> initial setup, debugging "why the AI didn't know about X", verifying a profile change took effect.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.devMode}
                                    onChange={e => setBool("devMode", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fSql.name as string}
                                label="Show generated SQL"
                                kind="toggle"
                                hint={<>Displays the SQL query the AI generated for each answer. <strong>No effect</strong> for Azure OpenAI or AWS Bedrock modes (no SQL).</>}
                                helpBody={
                                    <>
                                        <p><strong>Where it appears:</strong> as a "SQL" tab on each answer card. Same content as the chart/table tabs, just rendered as the underlying query.</p>
                                        <p><strong>Useful for:</strong> auditing — confirming the AI picked the right joins, columns, and aggregations. Catches "the answer is plausible but the SQL is wrong" cases.</p>
                                        <p><strong>No-op modes:</strong> <code>azure-openai</code>, <code>bedrock</code>, <code>foundation-model</code> — these backends don't generate SQL; they answer from indexed knowledge bases or model-serving endpoints.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.showSql}
                                    onChange={e => setBool("showSql", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fTrace.name as string}
                                label="Show routing trace"
                                kind="toggle"
                                hint={<>Surfaces proxy routing and orchestration trace details alongside each response. <strong>No effect</strong> in Direct mode.</>}
                                helpBody={
                                    <>
                                        <p><strong>What's in the trace:</strong> proxy hop timing, profile selection, supervisor fan-out, helper-call ordering, fusion synthesis. Useful to debug latency and orchestration logic.</p>
                                        <p><strong>No-op:</strong> Direct mode bypasses the proxy entirely — there's no routing trace to show.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.showTrace}
                                    onChange={e => setBool("showTrace", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fFilters.name as string}
                                label="Show guided filter bar"
                                kind="toggle"
                                hint={<>Displays a filter selector below the chat area letting authors scope questions by dimension (region, time, segment).</>}
                                helpBody={
                                    <>
                                        <p><strong>What it adds:</strong> dropdown filters for the dimensions bound to the visual. Selections become part of the question's context — the AI answers as if the user typed "for Region=West, …".</p>
                                        <p><strong>Pairs with:</strong> the next toggle below (<em>Allow visual to apply report filters</em>) to push selections to the report page itself.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.showGuidedFilters}
                                    onChange={e => setBool("showGuidedFilters", e.target.checked)}
                                />
                            </FieldRow>

                            <FieldRow
                                name={fActions.name as string}
                                label="Allow visual to apply report filters"
                                kind="toggle"
                                hint={<>When ON, guided filter selections can push to the surrounding BI report or dashboard. When OFF, filters affect only the AI context.</>}
                                helpBody={
                                    <>
                                        <p><strong>ON:</strong> the visual gains write access to the surrounding report's filter state. Selecting "Region=West" in the guided bar filters every other visual on the page too.</p>
                                        <p><strong>OFF (default):</strong> selections shape the AI's context only. The rest of the report is untouched. Safer for embedded scenarios where the report state must not be modified.</p>
                                    </>
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.allowReportActions}
                                    onChange={e => setBool("allowReportActions", e.target.checked)}
                                />
                            </FieldRow>

                        </div>
                    </details>
                );
            })()}

            {/* Section G — Genie space sync. Edits to the upstream Genie space
                stored as JSON-string fields. Phase A (48.13-48.15) ships
                read-only sync (Load + Diff); Phase B (48.16) adds the gated
                push-to-space write path. */}
            {(q ? matchingSections.has("G") : true) && (() => {
                const sectionG_state = sectionState("G");
                return (
                    <details className="gn-setup-advanced-section gn-affinity-chat" data-affinity="chat" open={isOpen("G")} onToggle={onSectionToggle("G")}>
                        <summary title="Pulls instructions, sample questions, and trusted SQL from the upstream AI workspace for local editing and pushback. Use as the strongest hallucination-reducer.">
                            G. Chat: AI workspace sync
                            <SectionStatus state={sectionG_state} />
                            <span className="gn-setup-advanced-summary-hint">Sync trusted workspace context</span>
                        </summary>
                        <div className="gn-setup-advanced-body">

                            <SectionIntro audience="AI workspace owner — anyone who curates the upstream AI workspace's instructions, sample questions, and trusted queries.">
                                <strong>Most powerful hallucination-reducer available.</strong> The fields below are the
                                same fields the upstream Databricks workspace exposes — text instructions,
                                sample questions, and trusted SQL examples. Edits made here can be pushed back to
                                Databricks via the Push button (gated, lands in 48.16).
                            </SectionIntro>

                            {renderSectionTools("G")}

                            {/* Section G specific toolbar — sync controls (Load, Diff, Push). */}
                            <div className="gn-setup-section-g-sync-toolbar">
                                <button
                                    type="button"
                                    className="gn-btn gn-btn--compact gn-btn--primary"
                                    onClick={onLoadFromGenie}
                                    disabled={syncBusy || !draft.spaceId.trim()}
                                    title={!draft.spaceId.trim() ? "Set an AI Workspace ID first (Steps 1-3)" : "Fetch the upstream serialized_space and populate Section G fields"}
                                >
                                    {syncBusy ? "Loading..." : "Load from AI workspace"}
                                </button>
                                <button
                                    type="button"
                                    className="gn-btn gn-btn--compact"
                                    onClick={onShowSpaceDiff}
                                    disabled={!upstreamSpace}
                                    title={!upstreamSpace ? "Load from AI workspace first to compute the diff" : "Show local edits side-by-side with the upstream AI workspace"}
                                >
                                    {hasLocalChanges
                                        ? `Show diff: ${spaceDiff?.counts.added ?? 0} added, ${spaceDiff?.counts.modified ?? 0} modified, ${spaceDiff?.counts.removed ?? 0} removed`
                                        : "Show diff"}
                                </button>
                                <button
                                    type="button"
                                    className={`gn-btn gn-btn--compact${hasLocalChanges ? " gn-btn--danger" : ""}`}
                                    onClick={() => setPushConfirm(true)}
                                    disabled={syncBusy || !pushAllowed || !hasLocalChanges}
                                    title={
                                        !pushAllowed ? "Push not available for this connection mode"
                                        : !hasLocalChanges ? "No local changes to push"
                                        : "Push local edits to the upstream AI workspace (writes through serialized_space)"
                                    }
                                >
                                    Push to AI workspace
                                </button>
                            </div>

                            {syncResult && (
                                <div className={`gn-setup-step-paste-result gn-setup-step-paste-result--${syncResult.kind === "info" ? "ok" : syncResult.kind}`} aria-live="polite">
                                    {syncResult.msg}
                                </div>
                            )}

                            <SectionGEditor draft={draft} setField={setField} setNum={setNum} />

                            {/* Diff modal — opened by "Show diff" button */}
                            {showSpaceDiff && spaceDiff && (
                                <div className="gn-setup-step-modal" role="dialog" aria-label="AI workspace diff">
                                    <div className="gn-setup-step-modal-card">
                                        <div className="gn-setup-step-modal-header">
                                            <strong>AI workspace diff: {spaceDiff.counts.added} added, {spaceDiff.counts.modified} modified, {spaceDiff.counts.removed} removed</strong>
                                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setShowSpaceDiff(false)}>Close</button>
                                        </div>
                                        {spaceDiff.entries.length === 0 ? (
                                            <p className="gn-setup-field-hint">Local Section G state matches the upstream AI workspace exactly.</p>
                                        ) : (
                                            <table className="gn-setup-step-diff">
                                                <thead>
                                                    <tr><th>Op</th><th>Kind</th><th>Label</th><th>Before / After</th></tr>
                                                </thead>
                                                <tbody>
                                                    {spaceDiff.entries.map((e, i) => (
                                                        <tr key={i}>
                                                            <td><strong>{e.op}</strong></td>
                                                            <td><code>{e.kind}</code></td>
                                                            <td>{e.label}</td>
                                                            <td>
                                                                {e.op === "modified" ? (
                                                                    <>
                                                                        <code style={{ color: "#c92a2a" }}>− {(e.before || "").slice(0, 100)}</code><br />
                                                                        <code style={{ color: "#1f8a4b" }}>+ {(e.after || "").slice(0, 100)}</code>
                                                                    </>
                                                                ) : e.op === "added" ? (
                                                                    <code style={{ color: "#1f8a4b" }}>+ {(e.after || "").slice(0, 100)}</code>
                                                                ) : (
                                                                    <code style={{ color: "#c92a2a" }}>− {(e.before || "").slice(0, 100)}</code>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Push confirm modal — destructive, requires explicit ack */}
                            {pushConfirm && spaceDiff && (
                                <div className="gn-setup-step-modal" role="dialog" aria-label="Confirm push to AI workspace">
                                    <div className="gn-setup-step-modal-card">
                                        <div className="gn-setup-step-modal-header">
                                            <strong>Push {spaceDiff.counts.added + spaceDiff.counts.modified + spaceDiff.counts.removed} change{spaceDiff.counts.added + spaceDiff.counts.modified + spaceDiff.counts.removed === 1 ? "" : "s"} to upstream AI workspace?</strong>
                                            <button type="button" className="gn-btn gn-btn--compact" onClick={() => setPushConfirm(false)}>Close</button>
                                        </div>
                                        <p className="gn-setup-field-hint">
                                            <strong>This writes to a shared resource.</strong> Every viewer of this AI workspace will see the
                                            updated text instructions, sample questions, and SQL examples on their next session. Cannot be undone
                                            from the visual; you'd need to revert via the Databricks UI or another Push.
                                        </p>
                                        <p className="gn-setup-field-hint">
                                            Target space: <strong><code>{draft.spaceId}</code></strong>
                                            <br />
                                            Mode: <strong>{draft.connectionMode}</strong>
                                            {draft.assistantProfile && <> | profile <strong>{draft.assistantProfile}</strong></>}
                                        </p>
                                        <p className="gn-setup-field-hint">
                                            <strong>Summary:</strong> {spaceDiff.counts.added} added, {spaceDiff.counts.modified} modified, {spaceDiff.counts.removed} removed.
                                            Click <em>Show diff</em> first if you want to inspect each change.
                                        </p>
                                        <div className="gn-setup-step-modal-actions">
                                            <button type="button" className="gn-btn" onClick={() => setPushConfirm(false)}>Cancel</button>
                                            <button type="button" className="gn-btn gn-btn--danger" onClick={onPushToGenie}>Push to AI workspace</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </details>
                );
            })()}

            {!q && (
                <div className="gn-setup-advanced-footnote">
                    <strong>Header &amp; display settings</strong> (visual title / subtitle / UI scale / compact mode / Show Setup access toggle) live in the Power BI <strong>Format pane → Header &amp; Layout</strong> group. They're presentation, not operational, so the Setup tab keeps focused on AI behaviour and infrastructure.
                </div>
            )}

            {q && totalMatches === 0 && (
                <div className="gn-setup-step-search-empty">
                    No fields match <strong>"{searchQuery}"</strong>. Try a shorter query or clear the search.
                </div>
            )}
            </div>
        </section>
    );
}
