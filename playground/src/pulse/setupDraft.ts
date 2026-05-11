/**
 * setupDraft.ts
 *
 * Defines the SetupDraft shape (the in-progress edit state of the in-visual
 * Setup tab) and the hydration helper that copies persisted GenieVisualSettings
 * into a fresh draft.
 *
 * Extracted from visual.tsx so unit tests can import both the type and the
 * helper without pulling in the entire React tree. Single source of truth —
 * if a new operational field is added to GenieVisualSettings AND should be
 * editable in the Setup tab, add it both here and in setupDraftFromSettings
 * to keep hydration loss-free.
 *
 * Theme + Header/Display fields are intentionally NOT in SetupDraft; they
 * live in the Power BI format pane (Appearance + Header & Layout groups)
 * per the agreed direction (CLAUDE.md tripwire).
 */

import { GenieVisualSettings } from "./settings";

export type SetupDraft = {
    // Step 1-3 — Connection
    connectionMode: GenieVisualSettings["connectionMode"];
    apiBaseUrl: string;
    assistantProfile: string;
    host: string;
    spaceId: string;
    warehouseId: string;
    token: string;
    proxyKey: string;
    // Step 5 Section 0 — Feature gate (IDEA-022)
    enabledFeatures: GenieVisualSettings["enabledFeatures"];
    // Step 5A — AI Behaviour
    genieFields: string;
    domainGuidance: string;
    sendContextToGenie: boolean;
    insightsPrompt: string;
    /** 49.17 / IDEA-037 — domain label for the hybrid pipeline. */
    insightsDomain: string;
    /** 49.17 / IDEA-037 — JSON-stringified array of {name, instruction}. */
    insightsCustomSections: string;
    /** 49.19 / IDEA-037 phase 3 — authoring mode radio. */
    insightsAuthoringMode: "manual" | "preset" | "ai-assisted";
    /** IDEA-039 anomaly #3 — Insights-only domainGuidance override. */
    insightsDomainGuidance: string;
    /** IDEA-039 anomalies #6 + #9 — author-defined metric direction rules. */
    metricDirectionRules: string;
    /** Structured renderer-owned metric direction map. */
    insightsMetricDirections: string;
    /** Whether generated Insights sections show source/timestamp provenance. */
    insightsShowProvenanceFooter: boolean;
    // IDEA-043 — universal-stage visibility + per-stage prompt overrides.
    // Edited from the in-visual Setup tab via system-section cards in the
    // same Edit/Hide UI as custom sections.
    insightsShowHeadline: boolean;
    insightsShowTrends: boolean;
    insightsShowRisks: boolean;
    insightsShowActions: boolean;
    insightsHeadlineOverride: string;
    insightsTrendsOverride: string;
    insightsRisksOverride: string;
    insightsActionsOverride: string;
    insightsCacheTtlMinutes: number;
    refreshInsights: boolean;
    // Step 5B — Knowledge Base
    kbEnabled: boolean;
    kbChartRules: boolean;
    kbStatRules: boolean;
    kbReportingRules: boolean;
    // Step 5C — Security & access
    authMode: GenieVisualSettings["authMode"];
    ucRowFiltersEnforced: boolean;
    ucColumnMasksEnforced: boolean;
    // Wave 19 — runtime scope injection
    runtimeForbiddenColumns: string;
    runtimeMandatoryRowFilter: string;
    runtimeReadOnlyEnforced: boolean;
    // Wave 21 — SQL configuration (Section H)
    sqlCtePreamble: string;
    sqlForbiddenTables: string;
    sqlRlsHintEnabled: boolean;
    // Step 5D — Multi-space
    multiSpaceEnabled: boolean;
    multiSpaceCount: number;
    space2Label: string; space2AssistantProfile: string; space2SpaceId: string; space2Host: string; space2Token: string;
    space3Label: string; space3AssistantProfile: string; space3SpaceId: string; space3Host: string; space3Token: string;
    space4Label: string; space4AssistantProfile: string; space4SpaceId: string; space4Host: string; space4Token: string;
    space5Label: string; space5AssistantProfile: string; space5SpaceId: string; space5Host: string; space5Token: string;
    space6Label: string; space6AssistantProfile: string; space6SpaceId: string; space6Host: string; space6Token: string;
    space7Label: string; space7AssistantProfile: string; space7SpaceId: string; space7Host: string; space7Token: string;
    space8Label: string; space8AssistantProfile: string; space8SpaceId: string; space8Host: string; space8Token: string;
    space9Label: string; space9AssistantProfile: string; space9SpaceId: string; space9Host: string; space9Token: string;
    space10Label: string; space10AssistantProfile: string; space10SpaceId: string; space10Host: string; space10Token: string;
    // Step 5E — Supervisor
    supervisorEndpoint: string;
    supervisorAgentName: string;
    supervisorSynthesisProfile: string;
    supervisorAutoFusion: boolean;
    supervisorSynthesisPrompt: string;
    // Step 5F — Header & Display (kept in draft so Apply doesn't null them;
    // edit UI lives in the Power BI format pane Header & Layout group)
    headerTitle: string;
    headerSubtitle: string;
    uiScale: GenieVisualSettings["uiScale"];
    compactMode: GenieVisualSettings["compactMode"];
    showSetupAccess: boolean;
    // Step 5G — Developer surface
    devMode: boolean;
    showSql: boolean;
    showTrace: boolean;
    showGuidedFilters: boolean;
    allowReportActions: boolean;
    // Step 5 Section G — Genie space sync (48.13–48.16)
    genieTextInstructionsJson: string;
    genieSampleQuestionsJson: string;
    genieExampleSqlsJson: string;
    lastSpaceSyncAt: number;
};

/**
 * Build a fully-populated SetupDraft from the persisted settings. Used by
 * both the App-level useState initializer and the persisted-settings
 * re-sync useEffect. Single source of truth for hydration — if a new
 * field is added to SetupDraft, it must also be added here, otherwise
 * the field will silently default to undefined and Power BI will store
 * it as a blank.
 */
export function setupDraftFromSettings(s: GenieVisualSettings): SetupDraft {
    return {
        connectionMode: s.connectionMode,
        apiBaseUrl: s.apiBaseUrl,
        assistantProfile: s.assistantProfile,
        host: s.host,
        spaceId: s.spaceId,
        warehouseId: s.warehouseId,
        token: s.token,
        proxyKey: s.proxyKey,
        enabledFeatures: s.enabledFeatures,
        genieFields: s.genieFields,
        domainGuidance: s.domainGuidance,
        sendContextToGenie: s.sendContextToGenie,
        insightsPrompt: s.insightsPrompt,
        insightsDomain: s.insightsDomain ?? "",
        insightsCustomSections: s.insightsCustomSections ?? "[]",
        insightsAuthoringMode: s.insightsAuthoringMode ?? "preset",
        insightsDomainGuidance: s.insightsDomainGuidance ?? "",
        metricDirectionRules: s.metricDirectionRules ?? "",
        insightsMetricDirections: s.insightsMetricDirections ?? "",
        insightsShowProvenanceFooter: s.insightsShowProvenanceFooter ?? true,
        insightsShowHeadline:    (s as any).insightsShowHeadline   ?? true,
        insightsShowTrends:      (s as any).insightsShowTrends     ?? true,
        insightsShowRisks:       (s as any).insightsShowRisks      ?? true,
        insightsShowActions:     (s as any).insightsShowActions    ?? true,
        insightsHeadlineOverride:(s as any).insightsHeadlineOverride ?? "",
        insightsTrendsOverride:  (s as any).insightsTrendsOverride   ?? "",
        insightsRisksOverride:   (s as any).insightsRisksOverride    ?? "",
        insightsActionsOverride: (s as any).insightsActionsOverride  ?? "",
        insightsCacheTtlMinutes: s.insightsCacheTtlMinutes,
        refreshInsights: s.refreshInsights,
        kbEnabled: s.kbEnabled,
        kbChartRules: s.kbChartRules,
        kbStatRules: s.kbStatRules,
        kbReportingRules: s.kbReportingRules,
        authMode: s.authMode,
        ucRowFiltersEnforced: s.ucRowFiltersEnforced,
        ucColumnMasksEnforced: s.ucColumnMasksEnforced,
        runtimeForbiddenColumns: s.runtimeForbiddenColumns,
        runtimeMandatoryRowFilter: s.runtimeMandatoryRowFilter,
        runtimeReadOnlyEnforced: s.runtimeReadOnlyEnforced,
        sqlCtePreamble: s.sqlCtePreamble,
        sqlForbiddenTables: s.sqlForbiddenTables,
        sqlRlsHintEnabled: s.sqlRlsHintEnabled,
        multiSpaceEnabled: s.multiSpaceEnabled,
        multiSpaceCount: s.multiSpaceCount,
        space2Label: s.space2Label, space2AssistantProfile: s.space2AssistantProfile, space2SpaceId: s.space2SpaceId, space2Host: s.space2Host, space2Token: s.space2Token,
        space3Label: s.space3Label, space3AssistantProfile: s.space3AssistantProfile, space3SpaceId: s.space3SpaceId, space3Host: s.space3Host, space3Token: s.space3Token,
        space4Label: s.space4Label, space4AssistantProfile: s.space4AssistantProfile, space4SpaceId: s.space4SpaceId, space4Host: s.space4Host, space4Token: s.space4Token,
        space5Label: s.space5Label, space5AssistantProfile: s.space5AssistantProfile, space5SpaceId: s.space5SpaceId, space5Host: s.space5Host, space5Token: s.space5Token,
        space6Label: s.space6Label, space6AssistantProfile: s.space6AssistantProfile, space6SpaceId: s.space6SpaceId, space6Host: s.space6Host, space6Token: s.space6Token,
        space7Label: s.space7Label, space7AssistantProfile: s.space7AssistantProfile, space7SpaceId: s.space7SpaceId, space7Host: s.space7Host, space7Token: s.space7Token,
        space8Label: s.space8Label, space8AssistantProfile: s.space8AssistantProfile, space8SpaceId: s.space8SpaceId, space8Host: s.space8Host, space8Token: s.space8Token,
        space9Label: s.space9Label, space9AssistantProfile: s.space9AssistantProfile, space9SpaceId: s.space9SpaceId, space9Host: s.space9Host, space9Token: s.space9Token,
        space10Label: s.space10Label, space10AssistantProfile: s.space10AssistantProfile, space10SpaceId: s.space10SpaceId, space10Host: s.space10Host, space10Token: s.space10Token,
        supervisorEndpoint: s.supervisorEndpoint,
        supervisorAgentName: s.supervisorAgentName,
        supervisorSynthesisProfile: s.supervisorSynthesisProfile,
        supervisorAutoFusion: s.supervisorAutoFusion,
        supervisorSynthesisPrompt: s.supervisorSynthesisPrompt,
        headerTitle: s.headerTitle,
        headerSubtitle: s.headerSubtitle,
        uiScale: s.uiScale,
        compactMode: s.compactMode,
        showSetupAccess: s.showSetupAccess,
        devMode: s.devMode,
        showSql: s.showSql,
        showTrace: s.showTrace,
        showGuidedFilters: s.showGuidedFilters,
        allowReportActions: s.allowReportActions,
        genieTextInstructionsJson: s.genieTextInstructionsJson,
        genieSampleQuestionsJson: s.genieSampleQuestionsJson,
        genieExampleSqlsJson: s.genieExampleSqlsJson,
        lastSpaceSyncAt: s.lastSpaceSyncAt,
    };
}
