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
import "./connectorBrandCard.css";
import {
    type ConfiguredProfileSummary,
    type ConnectorManifest,
    type ConnectorRuntimeState,
    type ConnectorLiveStatus,
    buildProfileEnvSnippet,
    buildProfileJsonSnippet,
    getConnectorLiveStatus,
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

// Honest live-verification chip — separate from the (aspirational) maturity badge.
const LIVE_STATUS_META: Record<ConnectorLiveStatus, { dot: string; tone: string; bg: string }> = {
    verified:   { dot: "#10b981", tone: "#065f46", bg: "rgba(16, 185, 129, 0.12)" },
    unverified: { dot: "#9ca3af", tone: "#4b5563", bg: "rgba(107, 114, 128, 0.12)" },
    demo:       { dot: "#a855f7", tone: "#6b21a8", bg: "rgba(168, 85, 247, 0.12)" },
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
    const liveStatus = getConnectorLiveStatus(manifest.id);
    const liveMeta = LIVE_STATUS_META[liveStatus.status];

    const configuredProfiles = runtime?.configuredProfiles || [];

    return (
        <article
            data-connector-id={manifest.id}
            data-status={status}
            style={{
                // Theme-aware surface — was hardcoded `background:"white"` +
                // a black-tint border, so in dark mode the card rendered pure
                // white (rgb(255,255,255), opacity 1) with the inherited light
                // --pp-text title on top = invisible. Pinned live 2026-06-04
                // (iter-3): NOT inactive-dimming as iter-2 guessed — a real
                // white-on-white. --pp-surface-raised is the correct elevation.
                border: "1px solid var(--pp-border, rgba(0, 0, 0, 0.12))",
                borderRadius: 6,
                padding: 10,
                background: "var(--pp-surface-raised, #fff)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
            }}
        >
            {/* UX-ARCH-0B.2 follow-up 2026-05-23 — card compacted. minHeight:
                180 removed; padding 14 → 10; status row + tagline merged into
                one line; description moved behind a `title` tooltip on the
                card header (no longer rendered as a separate paragraph). */}
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }} title={manifest.description}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
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
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{manifest.displayName}</h3>
                </div>
                <span
                    data-maturity={manifest.maturity}
                    className="pp-cbc-badge pp-cbc-maturity"
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        padding: "1px 5px",
                        borderRadius: 3,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                    }}
                >
                    {maturityMeta.label}
                </span>
            </header>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--pp-text-muted, #6b7280)" }}>
                <span
                    data-status={status}
                    className="pp-cbc-badge pp-cbc-status"
                    style={{
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontWeight: 600,
                    }}
                >
                    {statusMeta.label}
                </span>
                <span
                    data-live-status={liveStatus.status}
                    title={liveStatus.note}
                    className="pp-cbc-badge pp-cbc-live"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontWeight: 600,
                        cursor: "help",
                    }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: liveMeta.dot, flexShrink: 0 }} />
                    {liveStatus.label}
                </span>
                {configuredCount > 0 && (
                    <span style={{ opacity: 0.7 }}>
                        · {configuredCount} profile{configuredCount === 1 ? "" : "s"}
                    </span>
                )}
                <span style={{ opacity: 0.6, marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{manifest.tagline}</span>
            </div>

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
                                <div style={{ fontSize: 11, marginTop: 2, color: "var(--pp-warning-text, #92400e)" }}>
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
                    // Theme-aware — was white bg with NO color (inherited the
                    // light --pp-text), so the label was invisible in dark mode.
                    border: "1px solid var(--pp-border, rgba(0, 0, 0, 0.18))",
                    background: "var(--pp-surface-raised, #fff)",
                    color: "var(--pp-text, #1f2937)",
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
