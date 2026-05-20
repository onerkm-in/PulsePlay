// ConnectorBrandGrid.tsx — Cycle 20 / S1 (2026-05-20).
//
// Renders the full connector catalogue as a category-grouped grid of
// ConnectorBrandCard components. Single consumer of the
// useConnectorManifests() hook. Drop-in for both the Setup wizard step
// AND the Settings → AI Provider section.

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
}

export function ConnectorBrandGrid(props: ConnectorBrandGridProps): React.ReactElement {
    const { loading, error, data, refetch } = useConnectorManifests();

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
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: 6,
                    background: "rgba(220, 38, 38, 0.06)",
                    color: "#7f1d1d",
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
                        border: "1px solid rgba(220, 38, 38, 0.4)",
                        background: "white",
                        borderRadius: 4,
                        cursor: "pointer",
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!data || data.manifests.length === 0) {
        return (
            <div style={{ fontSize: 13, opacity: 0.6, padding: 12 }}>
                No connectors in the catalogue. This should never happen — please report a bug.
            </div>
        );
    }

    const groups = groupManifestsByCategory(data.manifests);

    return (
        <div data-component="connector-brand-grid" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
