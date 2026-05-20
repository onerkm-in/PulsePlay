// ConnectorBrandCard.tsx — Cycle 20 / S1 (2026-05-20).
//
// Generic brand card consuming a ConnectorManifest. Renders the connector
// identity (name + tagline + icon + maturity badge), the three-state
// configured indicator (✅ active / ⭕ available — not configured /
// ⚠️ degraded), and a "Show config snippet" disclosure with copy-paste
// JSON + env-var alternatives.
//
// One artifact, twelve cards — drop a new connector manifest into the
// proxy table and a new card appears here without UI code changes.

import { useState } from "react";
import {
    type ConfiguredProfileSummary,
    type ConnectorManifest,
    type ConnectorRuntimeState,
    buildProfileEnvSnippet,
    buildProfileJsonSnippet,
} from "../lib/connectorManifests";

type Status = "active" | "configured" | "configured-degraded" | "available";

function deriveStatus(runtime: ConnectorRuntimeState | undefined, activeProfileName: string | null): {
    status: Status;
    activeMatch: ConfiguredProfileSummary | null;
    configuredCount: number;
} {
    const configured = runtime?.configuredProfiles || [];
    const configuredCount = configured.length;
    if (configuredCount === 0) {
        return { status: "available", activeMatch: null, configuredCount: 0 };
    }
    const activeMatch = activeProfileName
        ? configured.find(p => p.name === activeProfileName) || null
        : null;
    const anyInvalid = configured.some(p => !p.valid);
    if (activeMatch) {
        return { status: anyInvalid ? "configured-degraded" : "active", activeMatch, configuredCount };
    }
    // Configured but the active profile isn't one of these.
    // Distinguish "valid but not picked" (configured) from "broken" (configured-degraded)
    // so the user sees that a click on the configured profile button is the
    // only step needed to activate this connector.
    return { status: anyInvalid ? "configured-degraded" : "configured", activeMatch: null, configuredCount };
}

const STATUS_META: Record<Status, { label: string; dot: string; tone: string; bg: string }> = {
    "active":              { label: "Active",                          dot: "#10b981", tone: "#065f46", bg: "rgba(16, 185, 129, 0.12)" },
    "configured":          { label: "Configured · pick to activate",   dot: "#3b82f6", tone: "#1e3a8a", bg: "rgba(59, 130, 246, 0.12)" },
    "configured-degraded": { label: "Configured · warnings",           dot: "#f59e0b", tone: "#92400e", bg: "rgba(245, 158, 11, 0.12)" },
    "available":           { label: "Available · not wired",           dot: "rgba(0, 0, 0, 0.35)", tone: "rgba(0, 0, 0, 0.65)", bg: "rgba(0, 0, 0, 0.04)" },
};

const MATURITY_META: Record<string, { label: string; bg: string; fg: string }> = {
    stable:  { label: "STABLE",  bg: "rgba(16, 185, 129, 0.15)", fg: "#065f46" },
    beta:    { label: "BETA",    bg: "rgba(59, 130, 246, 0.15)", fg: "#1e40af" },
    preview: { label: "PREVIEW", bg: "rgba(168, 85, 247, 0.15)", fg: "#6b21a8" },
};

export interface ConnectorBrandCardProps {
    manifest: ConnectorManifest;
    runtime: ConnectorRuntimeState | undefined;
    activeProfileName: string | null;
    onPickProfile?: (profileName: string) => void;
}

export function ConnectorBrandCard({
    manifest,
    runtime,
    activeProfileName,
    onPickProfile,
}: ConnectorBrandCardProps): React.ReactElement {
    const [expanded, setExpanded] = useState(false);
    const { status, activeMatch, configuredCount } = deriveStatus(runtime, activeProfileName);
    const statusMeta = STATUS_META[status];
    const maturityMeta = MATURITY_META[manifest.maturity] || MATURITY_META.preview;

    const configuredProfiles = runtime?.configuredProfiles || [];

    return (
        <article
            data-connector-id={manifest.id}
            data-status={status}
            style={{
                border: "1px solid rgba(0, 0, 0, 0.12)",
                borderRadius: 8,
                padding: 14,
                background: "white",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 180,
            }}
        >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{manifest.displayName}</h3>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{manifest.tagline}</div>
                </div>
                <span
                    data-maturity={manifest.maturity}
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: maturityMeta.bg,
                        color: maturityMeta.fg,
                        whiteSpace: "nowrap",
                    }}
                >
                    {maturityMeta.label}
                </span>
            </header>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: statusMeta.dot,
                        flexShrink: 0,
                    }}
                />
                <span
                    style={{
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: statusMeta.bg,
                        color: statusMeta.tone,
                        fontWeight: 600,
                    }}
                >
                    {statusMeta.label}
                </span>
                {configuredCount > 0 && (
                    <span style={{ opacity: 0.7 }}>
                        {configuredCount} profile{configuredCount === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.8 }}>{manifest.description}</p>

            {configuredProfiles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, opacity: 0.6 }}>CONFIGURED PROFILES</div>
                    {configuredProfiles.map(p => (
                        <button
                            key={p.name}
                            type="button"
                            data-action="pick-profile"
                            data-profile-name={p.name}
                            data-profile-valid={p.valid}
                            data-active={activeMatch?.name === p.name}
                            disabled={!onPickProfile || !p.valid}
                            onClick={() => onPickProfile?.(p.name)}
                            style={{
                                textAlign: "left",
                                padding: "6px 8px",
                                fontSize: 12,
                                background: activeMatch?.name === p.name ? "rgba(59, 130, 246, 0.12)" : "rgba(0, 0, 0, 0.03)",
                                border: activeMatch?.name === p.name ? "1px solid rgba(59, 130, 246, 0.6)" : "1px solid rgba(0, 0, 0, 0.1)",
                                borderRadius: 4,
                                cursor: onPickProfile && p.valid ? "pointer" : "default",
                                fontWeight: activeMatch?.name === p.name ? 600 : 400,
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                <span>{p.name}</span>
                                <span style={{ fontSize: 9, opacity: 0.6 }}>{p.source}</span>
                            </div>
                            {p.warnings.length > 0 && (
                                <div style={{ fontSize: 11, marginTop: 2, color: "#92400e" }}>
                                    {p.warnings.join(" · ")}
                                </div>
                            )}
                            {p.legacyCombined && (
                                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.6 }}>
                                    Legacy combined profile — split-profile snippets available below.
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <details
                open={expanded}
                onToggle={e => setExpanded((e.target as HTMLDetailsElement).open)}
                style={{ fontSize: 12 }}
            >
                <summary style={{ cursor: "pointer", fontWeight: 600, opacity: 0.85 }}>
                    {configuredCount > 0 ? "Add another profile / view JSON" : "Configure this connector →"}
                </summary>
                <ConfigSnippet manifest={manifest} />
            </details>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.65, marginTop: "auto" }}>
                <a href={manifest.docsUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    Docs ↗
                </a>
                <span data-version={manifest.version}>v{manifest.version}</span>
            </div>
        </article>
    );
}

function ConfigSnippet({ manifest }: { manifest: ConnectorManifest }): React.ReactElement {
    const [mode, setMode] = useState<"json" | "env">("json");
    const snippet = mode === "json" ? buildProfileJsonSnippet(manifest) : buildProfileEnvSnippet(manifest);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 11, opacity: 0.75, lineHeight: 1.55 }}>
                {manifest.setupSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                ))}
            </ol>

            <div style={{ display: "flex", gap: 6 }}>
                <button
                    type="button"
                    data-mode="json"
                    aria-pressed={mode === "json"}
                    onClick={() => setMode("json")}
                    style={tabStyle(mode === "json")}
                >
                    JSON
                </button>
                <button
                    type="button"
                    data-mode="env"
                    aria-pressed={mode === "env"}
                    onClick={() => setMode("env")}
                    style={tabStyle(mode === "env")}
                >
                    Env vars
                </button>
            </div>

            <pre
                data-snippet-mode={mode}
                style={{
                    margin: 0,
                    padding: 10,
                    fontSize: 11,
                    fontFamily: "Consolas, 'Cascadia Mono', monospace",
                    background: "rgba(0, 0, 0, 0.04)",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: 4,
                    whiteSpace: "pre",
                    overflowX: "auto",
                }}
            >
                {snippet}
            </pre>

            <button
                type="button"
                data-action="copy-snippet"
                onClick={async (e) => {
                    try {
                        await navigator.clipboard.writeText(snippet);
                        e.currentTarget.textContent = "Copied ✓";
                        setTimeout(() => {
                            if (e.currentTarget) e.currentTarget.textContent = "Copy snippet";
                        }, 1500);
                    } catch {
                        e.currentTarget.textContent = "Copy failed — select and ⌘C";
                    }
                }}
                style={{
                    alignSelf: "flex-start",
                    padding: "4px 10px",
                    fontSize: 11,
                    border: "1px solid rgba(0, 0, 0, 0.18)",
                    background: "white",
                    borderRadius: 4,
                    cursor: "pointer",
                }}
            >
                Copy snippet
            </button>

            {manifest.sharedCredentialHint && (
                <div style={{ fontSize: 11, opacity: 0.65 }}>
                    Shares credentials with other connectors marked
                    <code> {manifest.sharedCredentialHint}</code> — you can reuse the same service principal.
                </div>
            )}
        </div>
    );
}

function tabStyle(active: boolean): React.CSSProperties {
    return {
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 600,
        border: "1px solid " + (active ? "rgba(59, 130, 246, 0.6)" : "rgba(0, 0, 0, 0.15)"),
        background: active ? "rgba(59, 130, 246, 0.12)" : "white",
        color: active ? "#1e40af" : "rgba(0, 0, 0, 0.7)",
        borderRadius: 3,
        cursor: "pointer",
    };
}
