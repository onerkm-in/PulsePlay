// playground/src/settings/workbenchTemplates.ts
//
// Workbench templates — author-only named configurations of the Workbench
// surface. Picked in Settings → Display; never exposed to end users as a
// surface control. Each template bundles FOUR things (per 2026-05-28 user
// direction "Tabs + landing + scope + section preset"):
//
//   1. tabVisibility       — which of the 3 Workbench tabs render
//                            (AI Insights / Ask Pulse / Dashboard)
//   2. defaultLanding      — which enabled tab a fresh visitor lands on
//   3. enabledFeatures     — Pulse insights/chat feature scope
//   4. sectionPresetId?    — optional AI Insights section preset to pre-load
//                            (resolved against CUSTOM_SECTION_PRESETS)
//
// This supersedes the older `layoutPresets.ts` facade (which mapped to the
// pre-2026-05-25 enabledComponents model and was never given a picker). The
// canonical layout is now the per-tab-visibility model, so templates write
// `tabVisibility` + `defaultLandingSurface` instead of enabledComponents.

import type { TabVisibility, DefaultLandingSurface } from "./settingsStore";
import {
    writePulseAiVisualSettingsPatch,
    type PulseEnabledFeatures,
    type PulseAiVisualSettings,
} from "./pulseVisualSettingsStore";
import {
    CUSTOM_SECTION_PRESETS,
    interpolatePreset,
    defaultParamValues,
} from "../pulse/insightsPresetLibrary";

export type WorkbenchTemplateId =
    | "balanced"
    | "exec-briefing"
    | "analyst"
    | "ask-first"
    | "dashboard-kiosk";

export type WorkbenchTemplateOrCustom = WorkbenchTemplateId | "custom";

export interface WorkbenchTemplate {
    id: WorkbenchTemplateId;
    /** Author-facing label shown in the picker. */
    label: string;
    /** One-sentence helper describing who the template is for. */
    description: string;
    /** Which of the 3 Workbench tabs render. */
    tabVisibility: TabVisibility;
    /** Which enabled tab a fresh visitor lands on. */
    defaultLanding: DefaultLandingSurface;
    /** Pulse insights/chat feature scope. */
    enabledFeatures: PulseEnabledFeatures;
    /** Optional AI Insights section preset id (from CUSTOM_SECTION_PRESETS)
     *  pre-loaded when the template is applied. Omit to leave the author's
     *  current section config untouched. */
    sectionPresetId?: string;
}

/** The catalog. Order is intentional: the everyday default first, then
 *  the focused single-purpose deployments. */
export const WORKBENCH_TEMPLATES: ReadonlyArray<WorkbenchTemplate> = [
    {
        id: "balanced",
        label: "Balanced",
        description: "All three tabs available — AI Insights, Ask Pulse, Dashboard. The everyday default; lands on AI Insights. No section preset is forced, so your own Insights configuration is preserved.",
        tabVisibility: { aiInsights: true, askPulse: true, dashboard: true },
        defaultLanding: "ai-insights",
        enabledFeatures: "both",
        // No sectionPresetId — Balanced keeps whatever sections the author set.
    },
    {
        id: "exec-briefing",
        label: "Executive briefing",
        description: "AI Insights + Dashboard, no Ask Pulse. Lands on AI Insights and pre-loads an executive-brief section set. For leadership read-outs where the briefing IS the product.",
        tabVisibility: { aiInsights: true, askPulse: false, dashboard: true },
        defaultLanding: "ai-insights",
        enabledFeatures: "insightsOnly",
        sectionPresetId: "superstore-executive-brief",
    },
    {
        id: "analyst",
        label: "Analyst workbench",
        description: "All three tabs, lands on Ask Pulse, and pre-loads an operational-drilldown section set. For analysts who arrive with specific questions but want the briefing + dashboard on hand.",
        tabVisibility: { aiInsights: true, askPulse: true, dashboard: true },
        defaultLanding: "ask-pulse",
        enabledFeatures: "both",
        sectionPresetId: "superstore-operational-drilldown",
    },
    {
        id: "ask-first",
        label: "Ask-first",
        description: "Ask Pulse only — no Insights tab, no Dashboard. Chat-first internal tool for teams who come in with a question and want a direct answer.",
        tabVisibility: { aiInsights: false, askPulse: true, dashboard: false },
        defaultLanding: "ask-pulse",
        enabledFeatures: "chatOnly",
    },
    {
        id: "dashboard-kiosk",
        label: "Dashboard kiosk",
        description: "Dashboard only — AI hidden. Viewer-only kiosk or governed deployment where the embedded BI surface is all end users should see.",
        tabVisibility: { aiInsights: false, askPulse: false, dashboard: true },
        defaultLanding: "bi-viz",
        enabledFeatures: "both",
    },
];

export function getWorkbenchTemplate(id: WorkbenchTemplateId): WorkbenchTemplate | undefined {
    return WORKBENCH_TEMPLATES.find(t => t.id === id);
}

function sameTabs(a: TabVisibility, b: TabVisibility): boolean {
    return a.aiInsights === b.aiInsights
        && a.askPulse === b.askPulse
        && a.dashboard === b.dashboard;
}

/** Derive which template (if any) matches the current settings. Matches on
 *  tabs + landing + feature scope — NOT the section preset, since an author
 *  can re-author sections after applying a template without that meaning
 *  they've left the template. Returns "custom" when nothing matches. */
export function detectActiveWorkbenchTemplate(input: {
    tabVisibility: TabVisibility;
    defaultLanding: DefaultLandingSurface | null;
    enabledFeatures: PulseEnabledFeatures;
}): WorkbenchTemplateOrCustom {
    // A null landing surface (author hasn't set one) behaves as the app's
    // implicit fallback, "ai-insights" — so coalesce it for matching, which
    // lets a fresh install correctly read as "Balanced" instead of "Custom".
    const landing: DefaultLandingSurface = input.defaultLanding ?? "ai-insights";
    for (const t of WORKBENCH_TEMPLATES) {
        if (sameTabs(t.tabVisibility, input.tabVisibility)
            && t.enabledFeatures === input.enabledFeatures
            && t.defaultLanding === landing) {
            return t.id;
        }
    }
    return "custom";
}

export interface ApplyWorkbenchTemplateDeps {
    setTabVisibility: (value: TabVisibility) => void;
    setDefaultLandingSurface: (value: DefaultLandingSurface) => void;
}

/** Apply a template: writes tab visibility + default landing via the passed
 *  setters (from useSettings), and writes feature scope + the optional
 *  section preset to the Pulse visual-settings bridge. Each write persists
 *  immediately and fires its normal change event, so live consumers
 *  (App.tsx, PulseShell) re-render without a reload. */
export function applyWorkbenchTemplate(
    template: WorkbenchTemplate,
    deps: ApplyWorkbenchTemplateDeps,
): void {
    deps.setTabVisibility({ ...template.tabVisibility });
    deps.setDefaultLandingSurface(template.defaultLanding);

    const patch: Partial<PulseAiVisualSettings> = {
        enabledFeatures: template.enabledFeatures,
    };

    if (template.sectionPresetId) {
        const preset = CUSTOM_SECTION_PRESETS.find(p => p.id === template.sectionPresetId);
        if (preset) {
            try {
                const sections = preset.params
                    ? interpolatePreset(preset, defaultParamValues(preset))
                    : preset.sections;
                patch.insightsCustomSections = JSON.stringify(sections, null, 2);
                if (preset.domain) patch.insightsDomain = preset.domain;
                if (preset.metricDirectionRules) patch.metricDirectionRules = preset.metricDirectionRules;
            } catch {
                /* never let a malformed preset break template application */
            }
        }
    }

    writePulseAiVisualSettingsPatch(patch);
}
