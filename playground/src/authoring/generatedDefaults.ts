// playground/src/authoring/generatedDefaults.ts
//
// Pure TypeScript module for projecting defaults and handling author overrides
// dynamically and deterministically. Zero React, DOM, or localStorage dependencies.

import type { BusinessContextProfile } from "./businessContextProfile";

export interface AuthorOverrides {
    kpis?: Array<{
        id: string;
        label?: string;
        formula?: string;
        direction?: "higher-is-better" | "lower-is-better" | "target-band" | "neutral";
        thresholds?: Array<{ tone: "good" | "watch" | "risk"; expression: string }>;
    }>;
    insightTemplates?: Array<{
        id: string;
        label?: string;
        sections?: Array<{ name: string; instruction: string }>;
    }>;
    starterQuestions?: Array<{
        id: string;
        label?: string;
        prompt?: string;
        intent?: "summary" | "diagnostic" | "risk" | "opportunity" | "what-if" | "follow-up";
    }>;
    guidedFilters?: Array<{
        field: string;
        label?: string;
        reason?: string;
    }>;
    retrievalPolicy?: {
        citationMode?: "required" | "when-available" | "off";
        freshnessExpectation?: string;
        allowedSourceTiers?: string[];
    };
}

/**
 * Projects the raw active configurations for the Viewer surface from a BusinessContextProfile.
 * Merges primary context and cross-cutting overlays deterministically.
 */
export function generateDefaults(profile: BusinessContextProfile) {
    return {
        insightTemplates: profile.insightTemplates.map(t => ({
            ...t,
            generatedFrom: t.generatedFrom || ("pack" as const)
        })),
        starterQuestions: profile.starterQuestions.map(q => ({
            ...q
        })),
        guidedFilters: profile.guidedFilters.map(f => ({
            ...f,
            source: f.source || ("pack" as const)
        })),
        kpiBehaviors: profile.kpis.map(k => ({
            id: k.id,
            label: k.label,
            formula: k.formula,
            direction: k.direction,
            thresholds: k.thresholds ? [...k.thresholds] : undefined,
            sourceIds: [...k.sourceIds]
        })),
        retrievalPolicy: {
            ...profile.retrievalPolicy
        }
    };
}

/**
 * Applies explicit Author Overrides on top of a base BusinessContextProfile.
 * This function returns a NEW profile object and does NOT mutate the original profile or pack registries,
 * satisfying the key constraint that overrides are stored separately.
 */
export function applyAuthorOverrides(
    profile: BusinessContextProfile,
    overrides: AuthorOverrides
): BusinessContextProfile {
    // 1. Deep clone base collections
    const glossary = [...profile.glossary];
    const kpis = profile.kpis.map(k => ({ ...k, thresholds: k.thresholds ? [...k.thresholds] : undefined }));
    const insightTemplates = profile.insightTemplates.map(t => ({ ...t, sections: [...t.sections] }));
    const starterQuestions = profile.starterQuestions.map(q => ({ ...q }));
    const guidedFilters = profile.guidedFilters.map(f => ({ ...f }));
    const retrievalPolicy = { ...profile.retrievalPolicy };

    // Track if any override was applied to elevate provenance to "author-override"
    let hasOverrides = false;

    // 2. Merge KPI overrides
    if (overrides.kpis) {
        for (const overKpi of overrides.kpis) {
            const index = kpis.findIndex(k => k.id === overKpi.id);
            if (index !== -1) {
                hasOverrides = true;
                const baseKpi = kpis[index];
                kpis[index] = {
                    ...baseKpi,
                    label: overKpi.label !== undefined ? overKpi.label : baseKpi.label,
                    formula: overKpi.formula !== undefined ? overKpi.formula : baseKpi.formula,
                    direction: overKpi.direction !== undefined ? overKpi.direction : baseKpi.direction,
                    thresholds: overKpi.thresholds !== undefined ? overKpi.thresholds : baseKpi.thresholds
                };
            }
        }
    }

    // 3. Merge template overrides
    if (overrides.insightTemplates) {
        for (const overTpl of overrides.insightTemplates) {
            const index = insightTemplates.findIndex(t => t.id === overTpl.id);
            if (index !== -1) {
                hasOverrides = true;
                const baseTpl = insightTemplates[index];
                insightTemplates[index] = {
                    ...baseTpl,
                    label: overTpl.label !== undefined ? overTpl.label : baseTpl.label,
                    sections: overTpl.sections !== undefined ? overTpl.sections : baseTpl.sections,
                    generatedFrom: "author-override" as const
                };
            }
        }
    }

    // 4. Merge question overrides
    if (overrides.starterQuestions) {
        for (const overQ of overrides.starterQuestions) {
            const index = starterQuestions.findIndex(q => q.id === overQ.id);
            if (index !== -1) {
                hasOverrides = true;
                const baseQ = starterQuestions[index];
                starterQuestions[index] = {
                    ...baseQ,
                    label: overQ.label !== undefined ? overQ.label : baseQ.label,
                    prompt: overQ.prompt !== undefined ? overQ.prompt : baseQ.prompt,
                    intent: overQ.intent !== undefined ? overQ.intent : baseQ.intent
                };
            }
        }
    }

    // 5. Merge filter overrides
    if (overrides.guidedFilters) {
        for (const overF of overrides.guidedFilters) {
            const index = guidedFilters.findIndex(f => f.field === overF.field);
            if (index !== -1) {
                hasOverrides = true;
                const baseF = guidedFilters[index];
                guidedFilters[index] = {
                    ...baseF,
                    label: overF.label !== undefined ? overF.label : baseF.label,
                    reason: overF.reason !== undefined ? overF.reason : baseF.reason,
                    source: "author-override" as const
                };
            }
        }
    }

    // 6. Merge retrieval policy overrides
    if (overrides.retrievalPolicy) {
        hasOverrides = true;
        if (overrides.retrievalPolicy.citationMode !== undefined) {
            retrievalPolicy.citationMode = overrides.retrievalPolicy.citationMode;
        }
        if (overrides.retrievalPolicy.freshnessExpectation !== undefined) {
            retrievalPolicy.freshnessExpectation = overrides.retrievalPolicy.freshnessExpectation;
        }
        if (overrides.retrievalPolicy.allowedSourceTiers !== undefined) {
            retrievalPolicy.allowedSourceTiers = overrides.retrievalPolicy.allowedSourceTiers;
        }
    }

    // Return the new overridden profile object
    return {
        ...profile,
        confidence: hasOverrides ? "author-confirmed" : profile.confidence,
        glossary,
        kpis,
        insightTemplates,
        starterQuestions,
        guidedFilters,
        retrievalPolicy
    };
}
