// ─── Context bundles — the "AI & BI enabler" binding layer (ADR-0011) ─────
//
// A Context Bundle is a NAMED, CURATED pairing of a BI surface (Y axis,
// `biVendor`) with an AI brain (X axis, `aiProfile`), optionally a pack. It is
// the unit PulsePlay's "enabler" framing cares about: the user thinks in a
// bound pair ("Power BI × Genie"), not two independent knobs.
//
// LOAD-BEARING DESIGN CONSTRAINT (ADR-0011): a bundle introduces NO new
// persisted state. The "active bundle" is a PURE PROJECTION — derived by
// matching the current (biVendor, aiProfile) against the registry
// (`resolveActiveBundle`). Switching a bundle just calls the existing
// governance-aware setters. This keeps bundles a *preset over independent
// axes*, never a hard binding — delete the switcher and the axes still work.
//
// Candidate bundles are FILTERED by the org allowlist, so only pairings the
// org's creds actually light up appear (this is what makes plug-and-play
// legible). Dev/admin can extend the set via `pulseplay:context-bundles`.

import type { PulsePlayAllowlist } from "../types/allowlist";

export interface ContextBundle {
    /** Stable id, derived from the pair: `${biVendor}::${aiProfile}`. */
    id: string;
    /** Human label for the chained chip, e.g. "Power BI × Genie". */
    label: string;
    /** Y axis — the BI vendor id (matches `biVendor` / allowlist.biProviders). */
    biVendor: string;
    /** X axis — the AI profile name (matches `activeAiProfile` / allowlist.aiProfiles). */
    aiProfile: string;
    /** Optional pack id to apply with the bundle. */
    pack?: string;
    /** Author-supplied (vs derived from a curated candidate). */
    custom?: boolean;
}

/** localStorage key for dev/admin-authored bundles (JSON array). */
export const CONTEXT_BUNDLES_STORAGE_KEY = "pulseplay:context-bundles";

/** Humanize known ids; fall back to a title-cased raw id. */
const VENDOR_LABELS: Record<string, string> = {
    powerbi: "Power BI",
    tableau: "Tableau",
    qlik: "Qlik",
    looker: "Looker",
    "generic-iframe": "Embedded",
};
const PROFILE_LABELS: Record<string, string> = {
    default: "Genie",
    genie: "Genie",
    "powerbi-dwd": "Semantic Q&A",
    "azure-openai": "Azure OpenAI",
    bedrock: "Bedrock",
    "foundation-model": "Foundation Model",
    supervisor: "Supervisor",
};

function titleCase(id: string): string {
    return id
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

export function vendorLabel(id: string): string {
    return VENDOR_LABELS[id] ?? titleCase(id);
}
export function profileLabel(id: string): string {
    return PROFILE_LABELS[id] ?? titleCase(id);
}

function bundleId(biVendor: string, aiProfile: string): string {
    return `${biVendor}::${aiProfile}`;
}

function makeBundle(biVendor: string, aiProfile: string, opts?: { pack?: string; custom?: boolean; label?: string }): ContextBundle {
    return {
        id: bundleId(biVendor, aiProfile),
        label: opts?.label ?? `${vendorLabel(biVendor)} × ${profileLabel(aiProfile)}`,
        biVendor,
        aiProfile,
        ...(opts?.pack ? { pack: opts.pack } : {}),
        ...(opts?.custom ? { custom: true } : {}),
    };
}

// Curated default pairings (real ids in this repo). The allowlist filter below
// drops any whose axes aren't permitted, so an org only ever sees the bundles
// its creds enable. Dev/admin curates further via CONTEXT_BUNDLES_STORAGE_KEY.
const CANDIDATE_PAIRS: ReadonlyArray<{ biVendor: string; aiProfile: string }> = [
    { biVendor: "powerbi", aiProfile: "default" },
    { biVendor: "powerbi", aiProfile: "powerbi-dwd" },
    { biVendor: "tableau", aiProfile: "default" },
    { biVendor: "qlik", aiProfile: "default" },
    { biVendor: "looker", aiProfile: "default" },
];

// Mirrors settingsStore `passesAllowlist`: empty/absent list = permissive
// (matches proxy "warn" mode + the dev-unconfigured path).
function allowed(value: string, list: string[] | undefined): boolean {
    if (!list || list.length === 0) return true;
    return list.includes(value);
}

function bundlePassesAllowlist(b: ContextBundle, allowlist: PulsePlayAllowlist | null): boolean {
    if (!allowlist) return true; // unconfigured/dev = permissive
    return allowed(b.biVendor, allowlist.biProviders) && allowed(b.aiProfile, allowlist.aiProfiles);
}

/** Parse dev/admin-authored bundles from a raw localStorage string (defensive). */
export function parseAuthoredBundles(raw: string | null | undefined): ContextBundle[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        const out: ContextBundle[] = [];
        for (const e of arr) {
            if (!e || typeof e !== "object") continue;
            const biVendor = String((e as Record<string, unknown>).biVendor || "").trim();
            const aiProfile = String((e as Record<string, unknown>).aiProfile || "").trim();
            if (!biVendor || !aiProfile) continue;
            const pack = (e as Record<string, unknown>).pack;
            const label = (e as Record<string, unknown>).label;
            out.push(makeBundle(biVendor, aiProfile, {
                pack: typeof pack === "string" && pack ? pack : undefined,
                label: typeof label === "string" && label ? label : undefined,
                custom: true,
            }));
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * The available bundles for this deployment: curated candidates + any
 * dev/admin-authored bundles, FILTERED by the allowlist and de-duped by id
 * (authored wins on id collision so a curated pair can be relabeled).
 */
export function deriveBundles(
    allowlist: PulsePlayAllowlist | null,
    opts?: { authoredRaw?: string | null },
): ContextBundle[] {
    const authored = parseAuthoredBundles(opts?.authoredRaw);
    const authoredIds = new Set(authored.map(b => b.id));
    const curated = CANDIDATE_PAIRS
        .map(p => makeBundle(p.biVendor, p.aiProfile))
        .filter(b => !authoredIds.has(b.id)); // authored relabel/override wins
    return [...authored, ...curated].filter(b => bundlePassesAllowlist(b, allowlist));
}

/**
 * The active bundle = the one whose pair matches the current selection, or
 * null ("Custom"/unlocked) when the current pair isn't a known bundle. PURE
 * PROJECTION — no stored "activeBundleId".
 */
export function resolveActiveBundle(
    bundles: ReadonlyArray<ContextBundle>,
    biVendor: string,
    aiProfile: string,
): ContextBundle | null {
    return bundles.find(b => b.biVendor === biVendor && b.aiProfile === aiProfile) ?? null;
}
