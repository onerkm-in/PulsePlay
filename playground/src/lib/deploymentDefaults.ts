// playground/src/lib/deploymentDefaults.ts
//
// Make the DEPLOYMENT's own configuration the source of truth for which brain
// and which report a fresh browser starts on.
//
// Why this exists. Both axes used to be chosen per browser and stored in
// localStorage: `pulseplay:active-ai-profile` (X, the AI brain) and the embed
// target (Y, the Power BI report). Nothing on the server could express an
// intent, so a new user landed on "Setup needed" even when the deployment had a
// perfectly good Genie space and Power BI report wired in app.yaml, and a
// browser configured months ago kept its old choices after the whole stack was
// repointed. That is how a stale Superstore report kept showing next to AI
// answers computed from a different star schema.
//
// This reads the proxy's profile metadata once at boot and fills in ONLY what
// this browser has not already chosen. It never overrides an explicit choice.
//
// Cost: `/assistant/profiles` is routing metadata. It does not touch a
// warehouse and does not call a model, so it does not breach the
// no-spend-without-intent rule.

import { apiFetch } from "./apiClient";
import {
    seedEmbedConfigFromDeployment,
    getEmbedConfig as getEmbedConfigForCoherence,
    setEmbedConfig,
} from "../settings/embedConfigStore";

const ACTIVE_AI_PROFILE_KEY = "pulseplay:active-ai-profile";

/** The subset of profile metadata this module needs. */
export interface ProfileMeta {
    name: string;
    type?: string;
    powerbiGroupId?: string;
    powerbiReportId?: string;
}

export interface SyncResult {
    seededProfile: string | null;
    seededEmbed: boolean;
    /** Set when this browser shows a different report than the deployment
     *  declares. Reported, never auto-corrected. */
    embedMismatch: { storedReportId: string; expectedReportId: string } | null;
}

/** The deployment's declared embed target, cached from the last sync so a
 *  settings screen can offer "use it" without a second round-trip. */
let _deploymentTarget: ProfileMeta | null = null;
export function getDeploymentEmbedTarget(): ProfileMeta | null { return _deploymentTarget; }

/**
 * Pick the brain a deployment most likely means for the AI surfaces.
 *
 * Preference order, and the reasoning:
 *  1. a profile literally named "default" - the proxy's own convention, and
 *     what an empty `assistantProfile` already resolves to server-side, so
 *     seeding it makes the UI agree with what requests were doing anyway;
 *  2. any conversational profile;
 *  3. anything at all.
 *
 * `powerbi-semantic-model` is deliberately deprioritised. It is a deterministic
 * DAX brain with no LLM - excellent for the Dashboard axis, wrong as the default
 * answer engine for Decisions, AI Insights and Ask Pulse.
 */
export function pickDefaultProfile(profiles: ProfileMeta[]): string | null {
    if (!profiles.length) return null;
    const named = profiles.find(p => p.name === "default");
    if (named) return named.name;
    const conversational = profiles.find(p => p.type !== "powerbi-semantic-model");
    return (conversational || profiles[0]).name;
}

/** The profile that declares a Power BI report, if any. */
export function pickEmbedTarget(profiles: ProfileMeta[]): ProfileMeta | null {
    return profiles.find(p => p.powerbiReportId) || null;
}

/**
 * Is what this browser is showing coherent with what the AI reasons about?
 *
 * The failure this exists to catch is silent, which is what makes it dangerous:
 * a browser pointed at a report from a DIFFERENT semantic model than the one
 * the deployment answers from renders perfectly, reconciles with nothing, and
 * says nothing. Two panes quietly disagreeing is worse than either being
 * obviously broken.
 *
 * Deliberately reports rather than repairs. Pointing the Dashboard at another
 * report can be a legitimate choice, so the decision stays with the author -
 * but they are never left unaware of it.
 */
export function describeEmbedCoherence(
    stored: Record<string, unknown> | null | undefined,
    target: ProfileMeta | null | undefined,
): { coherent: true } | { coherent: false; storedReportId: string; expectedReportId: string } {
    const storedId = String(stored?.id || stored?.reportId || "").trim();
    const expected = String(target?.powerbiReportId || "").trim();
    if (!storedId || !expected || storedId === expected) return { coherent: true };
    return { coherent: false, storedReportId: storedId, expectedReportId: expected };
}

/**
 * Explicitly adopt the deployment's report, replacing whatever this browser
 * holds. This is the ONE path that overwrites an existing choice, and it only
 * runs when a human asks for it - which is the whole point: the fix should cost
 * one click, not a DevTools console.
 */
export function resetEmbedConfigToDeployment(): boolean {
    const target = _deploymentTarget;
    if (!target?.powerbiReportId) return false;
    const next: Record<string, unknown> = { id: target.powerbiReportId };
    if (target.powerbiGroupId) next.groupId = target.powerbiGroupId;
    setEmbedConfig(next);
    return true;
}

function readStoredProfile(): string {
    try { return (window.localStorage.getItem(ACTIVE_AI_PROFILE_KEY) || "").trim(); }
    catch { return ""; }
}

/**
 * Adopt the deployment's defaults for anything this browser has not set.
 * Safe to call on every boot: it is a no-op once both axes are chosen.
 */
export async function syncDeploymentDefaults(): Promise<SyncResult> {
    const result: SyncResult = { seededProfile: null, seededEmbed: false, embedMismatch: null };
    if (typeof window === "undefined") return result;

    let profiles: ProfileMeta[] = [];
    try {
        const res = await apiFetch("/api/assistant/profiles");
        if (!res.ok) return result;
        const body = await res.json();
        if (!Array.isArray(body)) return result;
        profiles = body.filter((p): p is ProfileMeta => !!p && typeof p.name === "string");
    } catch {
        // An unreachable proxy is not this module's problem to report - the
        // surfaces themselves surface connection errors with real context.
        return result;
    }
    if (!profiles.length) return result;

    if (!readStoredProfile()) {
        const pick = pickDefaultProfile(profiles);
        if (pick) {
            try {
                window.localStorage.setItem(ACTIVE_AI_PROFILE_KEY, pick);
                window.dispatchEvent(new CustomEvent("pulseplay:display-change", {
                    detail: { key: ACTIVE_AI_PROFILE_KEY, value: pick },
                }));
                result.seededProfile = pick;
            } catch { /* swallow */ }
        }
    }

    const target = pickEmbedTarget(profiles);
    _deploymentTarget = target;
    if (target) {
        result.seededEmbed = seedEmbedConfigFromDeployment(target);
        if (!result.seededEmbed) {
            const coherence = describeEmbedCoherence(
                getEmbedConfigForCoherence(), target,
            );
            if (!coherence.coherent) {
                result.embedMismatch = {
                    storedReportId: coherence.storedReportId,
                    expectedReportId: coherence.expectedReportId,
                };
            }
        }
    }

    return result;
}
