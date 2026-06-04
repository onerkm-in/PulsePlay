// ConnectorBrandGrid.tsx — Cycle 20 / S1 (2026-05-20).
//
// Renders the full connector catalogue as a category-grouped grid of
// ConnectorBrandCard components. Single consumer of the
// useConnectorManifests() hook. Drop-in for both the Setup wizard step
// AND the Settings → AI Provider section.

import { useState } from "react";
import { useConnectorManifests, groupManifestsByCategory } from "../lib/connectorManifests";
import { ConnectorBrandCard } from "./ConnectorBrandCard";

const CATEGORY_LABEL: Record<string, string> = {
    microsoft: "Microsoft",
    azure:     "Azure",
    aws:       "AWS",
    databricks:"Databricks",
    demo:      "Demo",
};

const CATEGORY_HELPER: Record<string, string> = {
    microsoft:  "Power BI semantic-model brains. Microsoft handles NLP for Q&A; PulsePlay runs deterministic DAX for the rest.",
    azure:      "Azure OpenAI deployments. Pick chat for free-form Ask Pulse, analytics for grounded SQL + narrative.",
    aws:        "AWS Bedrock-hosted models. Direct invocation or grounded answers through a Knowledge Base.",
    databricks: "Databricks-native assistants. Genie spaces, Mosaic Foundation Models, Supervisor fan-out, ResponsesAgent.",
    demo:       "Try PulsePlay without any cloud credentials.",
};

export interface ConnectorBrandGridProps {
    activeProfileName: string | null;
    onPickProfile?: (profileName: string) => void;
    /**
     * When true, only renders cards with at least one configured profile by
     * default (active / configured / configured-degraded). Cards with no
     * configured profiles (`status === "available"`) are hidden behind a
     * "+ Show all N connectors" button. Defaults to true — the 12-card
     * grid is overwhelming at first glance; configured + active are what
     * day-to-day users care about. Set to false in Setup-wizard contexts
     * where the full catalogue IS the point.
     */
    showOnlyConfiguredByDefault?: boolean;
}

export function ConnectorBrandGrid(props: ConnectorBrandGridProps): React.ReactElement {
    const { loading, error, data, refetch } = useConnectorManifests();
    const [showAll, setShowAll] = useState(props.showOnlyConfiguredByDefault === false);

    if (loading) {
        return (
            <div style={{ fontSize: 13, opacity: 0.6, padding: 12 }}>
                Loading connector catalogue…
            </div>
        );
    }

    if (error) {
        return (
            <div
                data-state="connector-catalogue-error"
                role="alert"
                style={{
                    fontSize: 13,
                    padding: 12,
                    // Theme-aware error tokens — #7f1d1d on a faint red tint was
                    // dark-red-on-dark (illegible) under data-pp-theme=dark.
                    // --pp-error is #dc2626 in light, #f85149 (light red) in dark.
                    border: "1px solid var(--pp-error-border)",
                    borderRadius: 6,
                    background: "var(--pp-error-soft)",
                    color: "var(--pp-error)",
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Couldn't load the connector catalogue
                </div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Error: {error}. The proxy may be down or the connector-types endpoint may be unreachable.
                </div>
                <button
                    type="button"
                    onClick={refetch}
                    style={{
                        marginTop: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        border: "1px solid var(--pp-error-border)",
                        // was background:"white" — a glaring white chip in the
                        // dark error card; track the theme surface instead.
                        background: "var(--pp-surface-raised)",
                        color: "var(--pp-error)",
                        borderRadius: 4,
                        cursor: "pointer",
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!data || !Array.isArray(data.manifests) || data.manifests.length === 0) {
        return (
            <div style={{ fontSize: 13, opacity: 0.6, padding: 12 }}>
                No connectors in the catalogue. This should never happen — please report a bug.
            </div>
        );
    }

    // Per-manifest "is this configured?" derivation (mirrors deriveStatus()
    // in ConnectorBrandCard so the filter agrees with the badge).
    const isConfigured = (id: string): boolean => {
        const profiles = data.runtime[id]?.configuredProfiles || [];
        return profiles.length > 0;
    };

    const totalCount = data.manifests.length;
    const configuredCount = data.manifests.filter(m => isConfigured(m.id)).length;
    const hiddenCount = totalCount - configuredCount;

    // When the user has nothing configured (fresh install), there's nothing
    // to show in the compact view — so we MUST show all cards or the grid
    // looks empty. Compute the effective filter rather than letting the
    // user stare at a blank surface.
    const effectiveShowAll = showAll || configuredCount === 0;

    const filteredManifests = effectiveShowAll
        ? data.manifests
        : data.manifests.filter(m => isConfigured(m.id));

    const groups = groupManifestsByCategory(filteredManifests);

    return (
        <div data-component="connector-brand-grid" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {!effectiveShowAll && hiddenCount > 0 && (
                <div
                    data-component="brand-grid-filter-summary"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "rgba(59, 130, 246, 0.06)",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                        borderRadius: 6,
                        fontSize: 12,
                    }}
                >
                    <span>
                        Showing <strong>{configuredCount}</strong> configured connector{configuredCount === 1 ? "" : "s"}.{" "}
                        <span style={{ opacity: 0.7 }}>
                            {hiddenCount} more available — not yet wired.
                        </span>
                    </span>
                    <button
                        type="button"
                        data-action="show-all-connectors"
                        onClick={() => setShowAll(true)}
                        style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            border: "1px solid rgba(59, 130, 246, 0.4)",
                            background: "white",
                            color: "#1e40af",
                            borderRadius: 4,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        + Show all {totalCount} →
                    </button>
                </div>
            )}
            {effectiveShowAll && configuredCount > 0 && configuredCount < totalCount && (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        fontSize: 11,
                    }}
                >
                    <button
                        type="button"
                        data-action="show-only-configured"
                        onClick={() => setShowAll(false)}
                        style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            border: "1px solid rgba(0, 0, 0, 0.15)",
                            background: "white",
                            color: "rgba(0, 0, 0, 0.7)",
                            borderRadius: 3,
                            cursor: "pointer",
                        }}
                    >
                        Showing all {totalCount} · only show configured
                    </button>
                </div>
            )}

            {groups.map(group => (
                <section key={group.category} aria-labelledby={`connector-cat-${group.category}`}>
                    <header style={{ marginBottom: 8 }}>
                        <h4
                            id={`connector-cat-${group.category}`}
                            style={{
                                margin: 0,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                                opacity: 0.7,
                            }}
                        >
                            {CATEGORY_LABEL[group.category] || group.category}
                        </h4>
                        {CATEGORY_HELPER[group.category] && (
                            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                                {CATEGORY_HELPER[group.category]}
                            </div>
                        )}
                    </header>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                            gap: 12,
                        }}
                    >
                        {group.manifests.map(manifest => (
                            <ConnectorBrandCard
                                key={manifest.id}
                                manifest={manifest}
                                runtime={data.runtime[manifest.id]}
                                activeProfileName={props.activeProfileName}
                                onPickProfile={props.onPickProfile}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
