// Client-side fetcher + types for the connector manifest discovery
// endpoint. Cycle 20 / S1 (2026-05-20). Single source of truth for the
// connector catalogue on the playground side; the Setup brand grid and
// Settings → AI Provider section both consume from this hook.

import { useEffect, useState } from "react";

export type ConnectorCategory = "microsoft" | "azure" | "aws" | "databricks" | "demo";
export type ConnectorMaturity = "stable" | "beta" | "preview";
export type ProfileFieldKind = "string" | "secret" | "url" | "guid" | "integer" | "boolean" | "enum" | "json";

export interface ProfileFieldDef {
    kind: ProfileFieldKind;
    required: boolean;
    label: string;
    help?: string;
    secret?: boolean;
}

export interface ConnectorRouteDescriptor {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    purpose:
        | "conversation-start"
        | "conversation-poll"
        | "embed-token"
        | "health-probe"
        | "discovery"
        | "fan-out-stream"
        | "admin";
}

export interface ConnectorManifest {
    id: string;
    version: string;
    displayName: string;
    tagline: string;
    description: string;
    icon: string;
    category: ConnectorCategory;
    maturity: ConnectorMaturity;
    profileType: string;
    profileTypes: string[];
    capabilities: Record<string, boolean>;
    profileSchema: Record<string, ProfileFieldDef>;
    setupSteps: string[];
    docsUrl: string;
    sharedCredentialHint?: string;
    envPrefix?: string;
    routes: ConnectorRouteDescriptor[];
}

export interface ConfiguredProfileSummary {
    name: string;
    valid: boolean;
    warnings: string[];
    source: "config.json" | "env";
    secretStatus: "present" | "missing" | "n/a";
    legacyCombined: boolean;
}

export interface ConnectorRuntimeState {
    loadStatus: "loaded" | "failed";
    configuredProfiles: ConfiguredProfileSummary[];
}

export interface ConnectorTypesResponse {
    manifests: ConnectorManifest[];
    runtime: Record<string, ConnectorRuntimeState>;
}

/**
 * Hook that fetches GET /api/assistant/connector-types once on mount.
 * The endpoint is read-only and idempotent so we don't bother with React
 * Query yet — a single in-component useState is enough for S1. If S2/S3
 * adds per-route refresh signals, swap in React Query.
 */
export function useConnectorManifests(): {
    loading: boolean;
    error: string | null;
    data: ConnectorTypesResponse | null;
    refetch: () => void;
} {
    const [data, setData] = useState<ConnectorTypesResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const res = await fetch("/api/assistant/connector-types");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = (await res.json()) as ConnectorTypesResponse;
                if (cancelled) return;
                setData(json);
                setLoading(false);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tick]);

    return { loading, error, data, refetch: () => setTick(n => n + 1) };
}

/**
 * Group manifests by category for the brand-grid layout. Returns the
 * categories in a deterministic order so the UI doesn't reshuffle on
 * each render.
 */
export function groupManifestsByCategory(manifests: ConnectorManifest[]): Array<{
    category: ConnectorCategory;
    manifests: ConnectorManifest[];
}> {
    const order: ConnectorCategory[] = ["microsoft", "azure", "aws", "databricks", "demo"];
    return order
        .map(category => ({
            category,
            manifests: manifests.filter(m => m.category === category),
        }))
        .filter(group => group.manifests.length > 0);
}

/**
 * Build a copy-paste JSON snippet for a manifest's profileSchema with
 * placeholders for required fields. The snippet wraps the profile in
 * `"name_placeholder": { ... }` so the deployer can paste it directly
 * into proxy/config.json under "profiles".
 *
 * Secret fields get YOUR_*_SECRET placeholders so the deployer knows
 * what to fill in.
 */
export function buildProfileJsonSnippet(manifest: ConnectorManifest): string {
    const placeholderFor = (fieldName: string, def: ProfileFieldDef): string => {
        if (def.kind === "secret") return `"YOUR_${fieldName.toUpperCase()}"`;
        if (def.kind === "guid") return `"YOUR_${fieldName.toUpperCase()}_GUID"`;
        if (def.kind === "url") return `"https://your-${fieldName.toLowerCase()}.example.com"`;
        if (def.kind === "boolean") return "false";
        if (def.kind === "integer") return "0";
        if (def.kind === "json") return "[]";
        if (def.kind === "enum") return `"option-a"`;
        return `"YOUR_${fieldName.toUpperCase()}"`;
    };
    const lines: string[] = [`"${manifest.id.replace(/-/g, "_")}_profile": {`];
    lines.push(`  "type": "${manifest.profileType}",`);
    const entries = Object.entries(manifest.profileSchema);
    entries.forEach(([fieldName, def], i) => {
        if (!def.required) return;
        const comma = i < entries.length - 1 ? "," : "";
        lines.push(`  "${fieldName}": ${placeholderFor(fieldName, def)}${comma}`);
    });
    // Trim a trailing comma if the last required field added one.
    const last = lines[lines.length - 1];
    if (last.endsWith(",")) lines[lines.length - 1] = last.slice(0, -1);
    lines.push(`}`);
    return lines.join("\n");
}

/**
 * Build a parallel env-var snippet listing PROXY_PROFILE_<NAME>_<FIELD>
 * exports per the proxy's env-mapper convention. Useful for containerized
 * deployments where committing config.json isn't possible.
 */
export function buildProfileEnvSnippet(manifest: ConnectorManifest): string {
    const name = manifest.id.replace(/-/g, "_").toUpperCase();
    const lines: string[] = [`# Profile: ${manifest.displayName}`];
    lines.push(`PROXY_PROFILE_${name}_TYPE=${manifest.profileType}`);
    for (const [fieldName, def] of Object.entries(manifest.profileSchema)) {
        if (!def.required) continue;
        const envKey = `PROXY_PROFILE_${name}_${fieldName.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
        const placeholder = def.kind === "secret" ? "YOUR_SECRET_HERE" : `YOUR_${fieldName.toUpperCase()}`;
        lines.push(`${envKey}=${placeholder}`);
    }
    return lines.join("\n");
}
