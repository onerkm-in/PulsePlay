// playground/src/settings/pulseVisualSettingsStore.ts
//
// Bridge for the legacy Pulse visual settings namespace:
// `pulseplay:visual-settings:genieSettings`.
//
// Direction locked 2026-05-16: the full-page Settings surface is the
// canonical place to edit configuration. Pulse's centered Console remains
// operational (status/diagnostics/session/SQL trace), not a second setup
// editor. This module lets Settings read/write the flattened genieSettings
// object that PulseHostStub.persistProperties already uses.

import { useCallback, useEffect, useState } from "react";

const PULSE_GENIE_SETTINGS_KEY = "pulseplay:visual-settings:genieSettings";
const PULSE_SETTINGS_EVENT = "pulseplay:visual-settings-change";

export type PulseEnabledFeatures = "both" | "insightsOnly" | "chatOnly";
export type PulseInsightsAuthoringMode = "preset" | "ai-assisted" | "manual";

export interface PulseAiVisualSettings {
    assistantProfile: string;
    enabledFeatures: PulseEnabledFeatures;
    insightsAuthoringMode: PulseInsightsAuthoringMode;
    insightsDomain: string;
    insightsPrompt: string;
    insightsDomainGuidance: string;
    insightsCustomSections: string;
    metricDirectionRules: string;
    insightsMetricDirections: string;
    insightsShowProvenanceFooter: boolean;
    insightsCacheTtlMinutes: number;
    insightsShowHeadline: boolean;
    insightsShowTrends: boolean;
    insightsShowRisks: boolean;
    insightsShowActions: boolean;
    insightsHeadlineOverride: string;
    insightsTrendsOverride: string;
    insightsRisksOverride: string;
    insightsActionsOverride: string;
    kbVectorSearchIndex: string;
    ucMetricView: string;
    /** 2026-05-28 — Unity Catalog catalog + schema for metric-view
     *  discovery. Surfaces what was previously hardcoded ("workspace" /
     *  "databrickspractice") so other workspaces can override per
     *  profile. Read by the MetricDirectionAutoDetectChip's UC fallback
     *  AND by the UCMetricViewExplorer leaf for its initial fetch.
     *  Empty string falls back to the legacy defaults so existing
     *  sessions don't break. */
    insightsUcCatalog: string;
    insightsUcSchema: string;
    /** 2026-05-28 — DevTools toggles surfaced from GenieVisualSettings
     *  audit. Each carries a Settings checkbox in System → Developer Tools.
     *  Previously only togglable via Power BI format pane. */
    /** Render generated SQL on every AI section (verbose; off by default). */
    showSql: boolean;
    /** Diagnostic trace for Agent Mode / Supervisor (verbose; off by default). */
    showTrace: boolean;
    /** Developer mode — extra logging + dev-only UI affordances. */
    devMode: boolean;
    /** AI is allowed to push filter / drill / focus actions into the
     *  host BI surface. SECURITY-SENSITIVE: enables agent → BI write
     *  path. Defaults off; flip only when you trust the AI provider. */
    allowReportActions: boolean;
    /** Banner shown when the chosen connector lacks features the current
     *  section needs (e.g. SQL section + non-Genie connector). Defaults
     *  on — useful for end users. */
    showConnectorCompatibilityWarnings: boolean;
    /** When true and a Genie message's `attachments[].reasoning_traces` field
     *  is populated (Databricks added this field 2026-04-16 — it's the first
     *  programmatic surface for Genie Agent Mode / Research Agent output),
     *  Pulse renders a "Research Agent reasoning" section above the regular
     *  message body. PulsePlay does not trigger Agent Mode itself (REST API
     *  still doesn't expose that), but surfaces the trace when present.
     *  Default true so the trace appears automatically when available;
     *  authors who want to hide it can opt out in Settings → Preferences →
     *  Mix composition. */
    insightsShowResearchTraces: boolean;
    /** Phase E.1 — client-side progressive reveal of single-shot Genie
     *  answers. Default true; opt out for instant render. */
    insightsStagedRevealEnabled: boolean;
    /** 2026-05-28 — author gate for the Chat (v0 / UnifiedAssistantSurface)
     *  surface. Workbench (pulse) is the default surface; Chat is kept
     *  wired but only OFFERED to end users when an author flips this on.
     *  When true, the top-bar Workbench⇄Chat chip renders so users can
     *  switch; when false (default) the chip is hidden and end users only
     *  ever see Workbench. Author-only — set in Settings, never exposed
     *  to end users as a surface control. */
    allowChatSurface: boolean;
    /** 2026-05-29 — author gate for the chat "Show history" button. Default
     *  false (hidden) so the chat surface stays clean; flip ON in Settings →
     *  Preferences → Surface to expose the history toggle to end users. */
    showHistoryButton: boolean;
}

const DEFAULTS: PulseAiVisualSettings = {
    assistantProfile: "",
    enabledFeatures: "both",
    insightsAuthoringMode: "preset",
    insightsDomain: "",
    insightsPrompt: "",
    insightsDomainGuidance: "",
    insightsCustomSections: "",
    metricDirectionRules: "",
    insightsMetricDirections: "",
    insightsShowProvenanceFooter: true,
    insightsCacheTtlMinutes: 30,
    insightsShowHeadline: true,
    insightsShowTrends: true,
    insightsShowRisks: true,
    insightsShowActions: true,
    insightsHeadlineOverride: "",
    insightsTrendsOverride: "",
    insightsRisksOverride: "",
    insightsActionsOverride: "",
    kbVectorSearchIndex: "",
    ucMetricView: "",
    insightsUcCatalog: "",
    insightsUcSchema: "",
    showSql: false,
    showTrace: false,
    devMode: false,
    allowReportActions: false,
    showConnectorCompatibilityWarnings: true,
    insightsShowResearchTraces: true,
    insightsStagedRevealEnabled: true,
    allowChatSurface: false,
    showHistoryButton: false,
};

function readRawGenieSettings(): Record<string, unknown> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(PULSE_GENIE_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function asEnabledFeatures(value: unknown): PulseEnabledFeatures {
    return value === "insightsOnly" || value === "chatOnly" || value === "both"
        ? value
        : DEFAULTS.enabledFeatures;
}

function asAuthoringMode(value: unknown): PulseInsightsAuthoringMode {
    return value === "manual" || value === "ai-assisted" || value === "preset"
        ? value
        : DEFAULTS.insightsAuthoringMode;
}

function asTtl(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULTS.insightsCacheTtlMinutes;
    return Math.round(parsed);
}

export function readPulseAiVisualSettings(): PulseAiVisualSettings {
    const raw = readRawGenieSettings();
    return {
        assistantProfile: asString(raw.assistantProfile, DEFAULTS.assistantProfile),
        enabledFeatures: asEnabledFeatures(raw.enabledFeatures),
        insightsAuthoringMode: asAuthoringMode(raw.insightsAuthoringMode),
        insightsDomain: asString(raw.insightsDomain, DEFAULTS.insightsDomain),
        insightsPrompt: asString(raw.insightsPrompt, DEFAULTS.insightsPrompt),
        insightsDomainGuidance: asString(raw.insightsDomainGuidance, DEFAULTS.insightsDomainGuidance),
        insightsCustomSections: asString(raw.insightsCustomSections, DEFAULTS.insightsCustomSections),
        metricDirectionRules: asString(raw.metricDirectionRules, DEFAULTS.metricDirectionRules),
        insightsMetricDirections: asString(raw.insightsMetricDirections, DEFAULTS.insightsMetricDirections),
        insightsShowProvenanceFooter: asBool(raw.insightsShowProvenanceFooter, DEFAULTS.insightsShowProvenanceFooter),
        insightsCacheTtlMinutes: asTtl(raw.insightsCacheTtlMinutes),
        insightsShowHeadline: asBool(raw.insightsShowHeadline, DEFAULTS.insightsShowHeadline),
        insightsShowTrends: asBool(raw.insightsShowTrends, DEFAULTS.insightsShowTrends),
        insightsShowRisks: asBool(raw.insightsShowRisks, DEFAULTS.insightsShowRisks),
        insightsShowActions: asBool(raw.insightsShowActions, DEFAULTS.insightsShowActions),
        insightsHeadlineOverride: asString(raw.insightsHeadlineOverride, DEFAULTS.insightsHeadlineOverride),
        insightsTrendsOverride: asString(raw.insightsTrendsOverride, DEFAULTS.insightsTrendsOverride),
        insightsRisksOverride: asString(raw.insightsRisksOverride, DEFAULTS.insightsRisksOverride),
        insightsActionsOverride: asString(raw.insightsActionsOverride, DEFAULTS.insightsActionsOverride),
        kbVectorSearchIndex: asString(raw.kbVectorSearchIndex, DEFAULTS.kbVectorSearchIndex),
        ucMetricView: asString(raw.ucMetricView, DEFAULTS.ucMetricView),
        insightsUcCatalog: asString(raw.insightsUcCatalog, DEFAULTS.insightsUcCatalog),
        insightsUcSchema: asString(raw.insightsUcSchema, DEFAULTS.insightsUcSchema),
        showSql: asBool(raw.showSql, DEFAULTS.showSql),
        showTrace: asBool(raw.showTrace, DEFAULTS.showTrace),
        devMode: asBool(raw.devMode, DEFAULTS.devMode),
        allowReportActions: asBool(raw.allowReportActions, DEFAULTS.allowReportActions),
        showConnectorCompatibilityWarnings: asBool(raw.showConnectorCompatibilityWarnings, DEFAULTS.showConnectorCompatibilityWarnings),
        insightsShowResearchTraces: asBool(raw.insightsShowResearchTraces, DEFAULTS.insightsShowResearchTraces),
        insightsStagedRevealEnabled: asBool(raw.insightsStagedRevealEnabled, DEFAULTS.insightsStagedRevealEnabled),
        allowChatSurface: asBool(raw.allowChatSurface, DEFAULTS.allowChatSurface),
        showHistoryButton: asBool(raw.showHistoryButton, DEFAULTS.showHistoryButton),
    };
}

export function writePulseAiVisualSettingsPatch(patch: Partial<PulseAiVisualSettings>): PulseAiVisualSettings {
    if (typeof window === "undefined") return { ...DEFAULTS, ...patch };
    const existing = readRawGenieSettings();
    const next = { ...existing, ...patch };
    try {
        window.localStorage.setItem(PULSE_GENIE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
        /* swallow */
    }
    try {
        window.dispatchEvent(new CustomEvent(PULSE_SETTINGS_EVENT, {
            detail: {
                objectName: "genieSettings",
                properties: patch,
            },
        }));
    } catch {
        /* swallow */
    }
    return readPulseAiVisualSettings();
}

/**
 * Write arbitrary genieSettings fields (NOT just the Insights-tab subset
 * tracked by PulseAiVisualSettings). Used by settingsStore.setActiveAiProfile
 * to auto-populate connectionMode + apiBaseUrl when the user picks an AI
 * profile via Settings → AI → Provider — those fields aren't part of the
 * typed Insights surface but Pulse's `isConfigured` check needs them set
 * for the proxy-mode branch to activate.
 *
 * Patch keys flow into `pulseplay:visual-settings:genieSettings` directly;
 * the function fires the same `pulseplay:visual-settings-change` event
 * `writePulseAiVisualSettingsPatch` does, so consumers of either bridge
 * stay in sync.
 */
export function writeRawGenieSettingsPatch(patch: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    const existing = readRawGenieSettings();
    const next = { ...existing, ...patch };
    try {
        window.localStorage.setItem(PULSE_GENIE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
        /* swallow */
    }
    try {
        window.dispatchEvent(new CustomEvent(PULSE_SETTINGS_EVENT, {
            detail: {
                objectName: "genieSettings",
                properties: patch,
            },
        }));
    } catch {
        /* swallow */
    }
}

export function usePulseAiVisualSettings(): {
    value: PulseAiVisualSettings;
    update: (patch: Partial<PulseAiVisualSettings>) => void;
} {
    const [value, setValue] = useState<PulseAiVisualSettings>(() => readPulseAiVisualSettings());

    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setValue(readPulseAiVisualSettings());
        const onStorage = (event: StorageEvent) => {
            if (event.key === PULSE_GENIE_SETTINGS_KEY) sync();
        };
        window.addEventListener(PULSE_SETTINGS_EVENT, sync as EventListener);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(PULSE_SETTINGS_EVENT, sync as EventListener);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const update = useCallback((patch: Partial<PulseAiVisualSettings>) => {
        setValue(writePulseAiVisualSettingsPatch(patch));
    }, []);

    return { value, update };
}

export const PULSE_VISUAL_SETTINGS_EVENT = PULSE_SETTINGS_EVENT;
