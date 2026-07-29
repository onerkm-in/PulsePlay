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
import {
    readRawGenieSettings,
    writeRawGenieSettingsPatch,
} from "../settings/pulseVisualSettingsStore";

const ACTIVE_AI_PROFILE_KEY = "pulseplay:active-ai-profile";

/** The subset of profile metadata this module needs. */
export interface ProfileMeta {
    name: string;
    type?: string;
    powerbiGroupId?: string;
    powerbiReportId?: string;
    /** All-Databricks pair (see embedConfigStore.DeploymentEmbedTarget). */
    lakeviewDashboardId?: string;
    workspaceUrl?: string;
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
    // Genie before other conversational types: a Genie profile carries a SQL
    // warehouse, which three of the four surfaces need (Decisions' prompt
    // store, Ask Pulse's NL→SQL, grounded briefings). A foundation-model
    // profile listed first used to win here, landing a fresh browser on a
    // brain whose Decisions surface can only apologise.
    // Among genie profiles, the one that also declares a Lakeview dashboard is
    // the deployment's marked showcase — the coherent 4-surface pair.
    const genie = profiles.find(p => p.type === "genie" && p.lakeviewDashboardId)
        || profiles.find(p => p.type === "genie");
    if (genie) return genie.name;
    const conversational = profiles.find(p => p.type !== "powerbi-semantic-model");
    return (conversational || profiles[0]).name;
}

/** The profile that declares a Dashboard target, if any.
 *
 *  Preference order:
 *   1. the ACTIVE profile's own Lakeview dashboard — the all-Databricks pair,
 *      and the only choice guaranteed coherent with what the AI answers from
 *      (same workspace, same star schema);
 *   2. any profile's Lakeview dashboard;
 *   3. any profile's Power BI report (needs SP creds server-side to embed).
 */
export function pickEmbedTarget(profiles: ProfileMeta[], activeProfile?: string): ProfileMeta | null {
    const active = activeProfile
        ? profiles.find(p => p.name === activeProfile && p.lakeviewDashboardId)
        : null;
    return active
        || profiles.find(p => p.lakeviewDashboardId)
        || profiles.find(p => p.powerbiReportId)
        || null;
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
                // The Pulse-ported surfaces (AI Insights, Ask Pulse) gate on
                // their own genieSettings `isConfigured` check — the profile
                // key alone leaves them stuck on "Connect an AI assistant".
                // Mirror what settingsStore.setActiveAiProfile writes, but
                // only into fields this browser has not set.
                const raw = readRawGenieSettings();
                const patch: Record<string, unknown> = {};
                if (!raw.connectionMode) patch.connectionMode = "proxy";
                if (!raw.apiBaseUrl && window.location?.origin) patch.apiBaseUrl = `${window.location.origin}/api`;
                if (!raw.assistantProfile) patch.assistantProfile = pick;
                if (Object.keys(patch).length) writeRawGenieSettingsPatch(patch);
            } catch { /* swallow */ }
        }
    }

    // Pass the profile the browser will actually use, so its own Lakeview
    // declaration (the coherent all-Databricks pair) wins over another
    // profile's Power BI report.
    const target = pickEmbedTarget(profiles, readStoredProfile() || result.seededProfile || undefined);
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
