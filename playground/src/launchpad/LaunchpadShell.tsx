import { useEffect, useMemo, useState } from "react";
import { navigateToApp } from "./launchpadRoute";
import { setEmbedConfig } from "../settings/embedConfigStore";

type AssetKind =
    | "lakeview-dashboard"
    | "genie-space"
    | "serving-endpoint"
    | "databricks-app"
    | "sql-warehouse";

interface LaunchpadAsset {
    kind: AssetKind;
    id: string;
    title: string;
    description?: string;
    path?: string;
    lifecycleState?: string;
    state?: string | Record<string, unknown>;
    workspaceUrl?: string;
    openUrl?: string;
    embedUrl?: string;
    raw?: Record<string, unknown>;
}

interface AssetSection {
    id: string;
    label: string;
    helper: string;
    endpoint: string;
    capabilityKey: string;
    items: LaunchpadAsset[];
    loading: boolean;
    error: string;
}

interface LaunchpadShellProps {
    activeAiProfile: string;
    onUseAiSource: (profile: string) => void;
    onUseBiSource: (vendor: string) => void;
}

const SECTIONS: Array<Omit<AssetSection, "items" | "loading" | "error">> = [
    {
        id: "dashboards",
        label: "AI/BI dashboards",
        helper: "Published Databricks dashboards that can become the active BI surface.",
        endpoint: "/api/assistant/lakeview/dashboards",
        capabilityKey: "lakeview",
    },
    {
        id: "genie",
        label: "Genie Spaces",
        helper: "Business-facing natural-language rooms. Embed as their own surface or use as the active AI context.",
        endpoint: "/api/assistant/genie/spaces",
        capabilityKey: "genie",
    },
    {
        id: "serving",
        label: "Serving endpoints",
        helper: "Model Serving and agent endpoints available to the workspace.",
        endpoint: "/api/assistant/serving-endpoints",
        capabilityKey: "servingEndpoints",
    },
    {
        id: "apps",
        label: "Databricks Apps",
        helper: "Internal apps deployed in Databricks that PulsePlay can launch or reference.",
        endpoint: "/api/assistant/apps",
        capabilityKey: "apps",
    },
    {
        id: "warehouses",
        label: "SQL warehouses",
        helper: "Query compute backing dashboards, Genie, metric views, and evidence.",
        endpoint: "/api/assistant/sql/warehouses",
        capabilityKey: "sqlWarehouses",
    },
];

function fetchJson<T>(url: string): Promise<T> {
    return fetch(url).then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as T;
    });
}

export function LaunchpadShell(props: LaunchpadShellProps): React.ReactElement {
    const [sections, setSections] = useState<AssetSection[]>(() =>
        SECTIONS.map(section => ({ ...section, items: [], loading: true, error: "" })),
    );
    const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
    const [liveNote, setLiveNote] = useState("");

    const query = useMemo(() => {
        const params = new URLSearchParams();
        if (props.activeAiProfile) params.set("assistantProfile", props.activeAiProfile);
        return params.toString();
    }, [props.activeAiProfile]);

    useEffect(() => {
        let cancelled = false;
        setLiveNote("");
        setSections(SECTIONS.map(section => ({ ...section, items: [], loading: true, error: "" })));

        void fetchJson<{ capabilities?: Record<string, boolean> }>(`/api/assistant/capabilities${query ? `?${query}` : ""}`)
            .then(data => { if (!cancelled) setCapabilities(data.capabilities || {}); })
            .catch(() => { if (!cancelled) setCapabilities({}); });

        for (const section of SECTIONS) {
            void fetchJson<{ items?: LaunchpadAsset[] }>(`${section.endpoint}${query ? `?${query}` : ""}`)
                .then(data => {
                    if (cancelled) return;
                    setSections(prev => prev.map(s =>
                        s.id === section.id
                            ? { ...s, items: Array.isArray(data.items) ? data.items : [], loading: false, error: "" }
                            : s,
                    ));
                })
                .catch(err => {
                    if (cancelled) return;
                    setSections(prev => prev.map(s =>
                        s.id === section.id
                            ? { ...s, items: [], loading: false, error: err instanceof Error ? err.message : String(err) }
                            : s,
                    ));
                });
        }
        return () => { cancelled = true; };
    }, [query]);

    const useDashboard = (asset: LaunchpadAsset) => {
        if (!asset.id || !asset.workspaceUrl) return;
        setEmbedConfig({
            vendor: "databricks-aibi",
            workspaceUrl: asset.workspaceUrl,
            dashboardId: asset.id,
            url: asset.embedUrl || undefined,
            title: asset.title,
        });
        try { window.localStorage.setItem("pulseplay:bi-vendor", "databricks-aibi"); } catch { /* swallow */ }
        props.onUseBiSource("databricks-aibi");
        try { window.dispatchEvent(new CustomEvent("pulseplay:bi-vendor-change", { detail: { vendor: "databricks-aibi" } })); } catch { /* swallow */ }
        setLiveNote(`Loaded ${asset.title} as the BI surface.`);
        navigateToApp();
    };

    const useGenie = (asset: LaunchpadAsset) => {
        if (!asset.embedUrl) {
            setLiveNote("This Genie Space is available, but Databricks did not return an embed URL. Use Share > Embed space in Databricks and paste the iframe in Settings.");
            return;
        }
        setEmbedConfig({
            vendor: "databricks-genie",
            url: asset.embedUrl,
            title: asset.title,
            allow: "clipboard-write",
        });
        try { window.localStorage.setItem("pulseplay:bi-vendor", "databricks-genie"); } catch { /* swallow */ }
        props.onUseBiSource("databricks-genie");
        try { window.dispatchEvent(new CustomEvent("pulseplay:bi-vendor-change", { detail: { vendor: "databricks-genie" } })); } catch { /* swallow */ }
        setLiveNote(`Loaded ${asset.title} as a Genie surface.`);
        navigateToApp();
    };

    return (
        <div className="pp-launchpad">
            <header className="pp-launchpad__header">
                <div>
                    <h1>Databricks Launchpad</h1>
                    <p>Live workspace discovery for PulsePlay enablement.</p>
                </div>
                <button type="button" onClick={navigateToApp}>Back to app</button>
            </header>
            {liveNote && <div className="pp-launchpad__note" role="status">{liveNote}</div>}
            <main className="pp-launchpad__main">
                {sections.map(section => (
                    <section className="pp-launchpad__section" key={section.id}>
                        <header>
                            <div>
                                <h2>{section.label}</h2>
                                <p>{section.helper}</p>
                            </div>
                            <span data-ready={capabilities[section.capabilityKey] ? "true" : "false"}>
                                {section.loading ? "checking" : capabilities[section.capabilityKey] ? "ready" : "observed"}
                            </span>
                        </header>
                        {section.loading && <div className="pp-launchpad__empty">Discovering live assets...</div>}
                        {section.error && <div className="pp-launchpad__error">{section.error}</div>}
                        {!section.loading && !section.error && section.items.length === 0 && (
                            <div className="pp-launchpad__empty">No assets returned from this workspace.</div>
                        )}
                        <div className="pp-launchpad__cards">
                            {section.items.map(asset => (
                                <article className="pp-launchpad__card" key={`${asset.kind}:${asset.id || asset.title}`}>
                                    <h3>{asset.title}</h3>
                                    <p>{asset.description || asset.path || asset.id}</p>
                                    <dl>
                                        <div><dt>Kind</dt><dd>{asset.kind}</dd></div>
                                        {asset.id && <div><dt>ID</dt><dd>{asset.id}</dd></div>}
                                        {asset.lifecycleState && <div><dt>Lifecycle</dt><dd>{asset.lifecycleState}</dd></div>}
                                        {asset.state && <div><dt>State</dt><dd>{typeof asset.state === "string" ? asset.state : JSON.stringify(asset.state)}</dd></div>}
                                    </dl>
                                    <div className="pp-launchpad__actions">
                                        {asset.openUrl && (
                                            <button type="button" onClick={() => window.open(asset.openUrl, "_blank", "noopener,noreferrer")}>
                                                Open in workspace
                                            </button>
                                        )}
                                        {asset.kind === "lakeview-dashboard" && (
                                            <button type="button" onClick={() => useDashboard(asset)}>Use as BI source</button>
                                        )}
                                        {asset.kind === "genie-space" && (
                                            <>
                                                <button type="button" onClick={() => props.onUseAiSource(props.activeAiProfile || "default")}>
                                                    Use as AI source
                                                </button>
                                                <button type="button" onClick={() => useGenie(asset)}>Float as pane</button>
                                            </>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </main>
        </div>
    );
}
