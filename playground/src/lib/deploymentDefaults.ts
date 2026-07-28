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
import { seedEmbedConfigFromDeployment } from "../settings/embedConfigStore";

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
}

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

function readStoredProfile(): string {
    try { return (window.localStorage.getItem(ACTIVE_AI_PROFILE_KEY) || "").trim(); }
    catch { return ""; }
}

/**
 * Adopt the deployment's defaults for anything this browser has not set.
 * Safe to call on every boot: it is a no-op once both axes are chosen.
 */
export async function syncDeploymentDefaults(): Promise<SyncResult> {
    const result: SyncResult = { seededProfile: null, seededEmbed: false };
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
    if (target) result.seededEmbed = seedEmbedConfigFromDeployment(target);

    return result;
}
