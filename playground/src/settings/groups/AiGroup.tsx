// playground/src/settings/groups/AiGroup.tsx
//
// Phase 4 — AI group fully wired.
//
//   - Provider picker filtered by allowlist.aiProfiles; selection persists
//     via settingsStore.setActiveAiProfile (closes L4 cleanup at the
//     primary UI path)
//   - Model / Agent leaf: Genie spaceId readout for direct profiles;
//     read-only Supervisor fan-out table for type=supervisor* profiles
//     (with the 2000 ms stagger from ADR-0003 documented in helper text)
//   - Connection test: single probe via TestConnectionPanel for Genie;
//     per-space probes + aggregate summary for Supervisor (closes the
//     "partial failure" requirement from SETTINGS_SPEC § 6.1.1)
//   - Knowledge pack: PackPicker rendered inline with allowlist filter
//     applied — author confirms selection; result writes to the same
//     `pulseplay:pack-selection` localStorage key used elsewhere
//   - AI Insights settings are edited here directly; the Pulse Console
//     links here instead of hosting a duplicate setup form.

import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../settingsStore";
import { CurrentValue, Leaf, OrphanBanner, SubSection } from "./BiGroup";
import { TestConnectionPanel } from "../../components/TestConnectionPanel";
import { PackPicker, type PackInfo, type PackSelection } from "../../components/PackPicker";
import { probeConnector } from "../../lib/probeClient";
import { useDatabricksCapabilities } from "../../lib/databricksCapabilities";
import { listMetricViews, type MetricViewSummary } from "../../lib/databricksAssets";
import type { ConnectorProbeResult } from "../../types/probe";
import {
    usePulseAiVisualSettings,
    type PulseAiVisualSettings,
    type PulseEnabledFeatures,
    type PulseInsightsAuthoringMode,
} from "../pulseVisualSettingsStore";

interface ProfileMetadata {
    name: string;
    displayName?: string;
    dataDomain?: string;
    description?: string;
    spaceId?: string;
    type?: string;
    spaces?: string[];
    agentName?: string;
}

interface PacksPayload {
    packs?: PackInfo[];
}

export function AiGroup(): React.ReactElement {
    const settings = useSettings();
    const { allowlist, activeAiProfile, packSelection, orphans, setActiveAiProfile, setPackSelection } = settings;
    const pulseAi = usePulseAiVisualSettings();
    const databricksCapabilities = useDatabricksCapabilities(activeAiProfile || "default");
    const aiOrphan = orphans.find(o => o.key === "pulseplay:active-ai-profile");
    const packOrphan = orphans.find(o => o.key === "pulseplay:pack-selection");

    const [profiles, setProfiles] = useState<ProfileMetadata[]>([]);
    const [profilesError, setProfilesError] = useState<string>("");
    const [profilesLoading, setProfilesLoading] = useState(true);

    const [packs, setPacks] = useState<PackInfo[]>([]);
    const [packsLoading, setPacksLoading] = useState(true);

    // Load profile metadata so we can render the supervisor fan-out table
    // and the genie-space readout. The endpoint is allowlist-filtered
    // proxy-side.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/assistant/profiles");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as ProfileMetadata[];
                if (!cancelled) {
                    setProfiles(Array.isArray(data) ? data : []);
                    setProfilesError("");
                    setProfilesLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setProfilesError(err instanceof Error ? err.message : String(err));
                    setProfilesLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Load allowlist-filtered packs from the proxy (Phase 7 endpoint).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/assistant/knowledge/packs");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as PacksPayload;
                if (!cancelled) {
                    setPacks(Array.isArray(data.packs) ? data.packs : []);
                    setPacksLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setPacks([]);
                    setPacksLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const allowedProfileNames = useMemo(() => {
        const fromAllowlist = allowlist?.aiProfiles || [];
        if (!profilesLoading && profiles.length > 0) {
            // Intersect for the UI — proxy already filters but the
            // intersection keeps order from the live /profiles fetch.
            return profiles
                .map(p => p.name)
                .filter(n => fromAllowlist.length === 0 || fromAllowlist.includes(n));
        }
        return fromAllowlist;
    }, [profiles, profilesLoading, allowlist]);

    const activeProfileMeta = useMemo(
        () => profiles.find(p => p.name === activeAiProfile) || null,
        [profiles, activeAiProfile],
    );

    const isSupervisor =
        !!activeProfileMeta && (activeProfileMeta.type === "supervisor" || activeProfileMeta.type === "supervisor-local");
    const vectorSearchDetail = databricksCapabilities.details.vectorSearch;
    const vectorSearchReady = databricksCapabilities.capabilities.vectorSearch === true && (vectorSearchDetail?.count || 0) > 0;

    return (
        <section aria-labelledby="settings-ai-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-ai-title" style={{ margin: 0, fontSize: 20 }}>AI</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    What's thinking, and what it knows — provider, model, knowledge, behavior. MVP 0.2: Databricks Genie + Supervisor only.
                </p>
            </header>

            {/* ─── Tier 1: Connect and test ───────────────────────────── */}
            <SubSection
                label="Connect and test"
                helper="Pick the AI brain and the knowledge bundle it grounds answers in."
            >

            {/* ── Provider ──────────────────────────────────────────── */}
            <Leaf
                group="ai"
                label="Provider"
                helper="The AI brain that answers your questions. Restricted to the providers your organization allows."
            >
                {profilesLoading && <CurrentValue label="Loading">…</CurrentValue>}
                {profilesError && (
                    <CurrentValue label="Error">
                        <span style={{ color: "#a01828" }}>{profilesError}</span>
                    </CurrentValue>
                )}
                {!profilesLoading && allowedProfileNames.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                        No AI providers available. Contact your administrator.
                    </div>
                )}
                {allowedProfileNames.length > 0 && (
                    <ProviderPicker
                        options={profiles.filter(p => allowedProfileNames.includes(p.name))}
                        value={activeAiProfile}
                        onChange={(name) => {
                            const result = setActiveAiProfile(name);
                            if (!result.ok) {
                                // The store guards against allowlist-bypass.
                                console.warn(result.reason);
                            }
                        }}
                    />
                )}
                {aiOrphan && <OrphanBanner reason={aiOrphan.reason} />}
            </Leaf>

            {/* ── Model / Agent ─────────────────────────────────────── */}
            <Leaf
                group="ai"
                label="Model / Agent"
                helper={
                    isSupervisor
                        ? "Supervisor fans queries across multiple Genie spaces. The list is admin-configured and shown read-only — request changes via the platform team."
                        : "For Genie: the single Genie space this profile is bound to. Configured server-side via proxy/config.json."
                }
            >
                {!activeProfileMeta && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                        Pick a provider above to see the model / agent details.
                    </div>
                )}
                {activeProfileMeta && !isSupervisor && (
                    <>
                        <CurrentValue label="Display name">{activeProfileMeta.displayName || activeProfileMeta.name}</CurrentValue>
                        <CurrentValue label="Data domain">{activeProfileMeta.dataDomain || "(unset)"}</CurrentValue>
                        <CurrentValue label="Genie space">{activeProfileMeta.spaceId || "(none)"}</CurrentValue>
                    </>
                )}
                {activeProfileMeta && isSupervisor && (
                    <SupervisorFanOutTable profile={activeProfileMeta} allowedGenieSpaces={allowlist?.genieSpaces} />
                )}
            </Leaf>

            {/* ── Knowledge pack ────────────────────────────────────── */}
            <Leaf
                group="ai"
                label="Knowledge pack"
                helper="Vertical domain bundle the AI uses for vocabulary, KPIs, and starter questions. Restricted to packs your organization installs."
            >
                {packsLoading && <CurrentValue label="Loading">…</CurrentValue>}
                {!packsLoading && packs.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                        No packs installed for this deployment. Contact your administrator to install a pack.
                    </div>
                )}
                {packs.length > 0 && (
                    <PackPicker
                        availablePacks={packs}
                        value={packSelection}
                        onChange={(next: PackSelection) => {
                            const result = setPackSelection(next);
                            if (!result.ok) console.warn(result.reason);
                        }}
                    />
                )}
                {packOrphan && <OrphanBanner reason={packOrphan.reason} />}
            </Leaf>

            {vectorSearchReady && (
                <Leaf
                    group="ai"
                    label="Vector Search KB"
                    helper="Databricks Vector Search grounding is available for this profile. Configure the approved index for retrieval-augmented answers."
                >
                    <CurrentValue label="Status">Available</CurrentValue>
                    <CurrentValue label="Endpoints">{String(vectorSearchDetail?.count || 0)}</CurrentValue>
                    <SettingsTextInput
                        label="Vector Search index"
                        value={pulseAi.value.kbVectorSearchIndex}
                        placeholder="catalog.schema.index_name"
                        onChange={kbVectorSearchIndex => pulseAi.update({ kbVectorSearchIndex })}
                    />
                    <div style={{ fontSize: 11, color: "#58616f" }}>
                        Queries go through the proxy route <code>/assistant/vector-search/query</code>; no Databricks token is exposed in the browser.
                    </div>
                </Leaf>
            )}
            {!vectorSearchReady && (
                <Leaf
                    group="ai"
                    label="Vector Search KB"
                    helper="Databricks Vector Search is not currently live in this workspace. Keep the target index here so the feature wakes up cleanly when an endpoint is enabled."
                >
                    <CurrentValue label="Status">Hibernating</CurrentValue>
                    <CurrentValue label="Endpoints">{String(vectorSearchDetail?.count || 0)}</CurrentValue>
                    <SettingsTextInput
                        label="Planned Vector Search index"
                        value={pulseAi.value.kbVectorSearchIndex}
                        placeholder="catalog.schema.index_name"
                        onChange={kbVectorSearchIndex => pulseAi.update({ kbVectorSearchIndex })}
                    />
                </Leaf>
            )}

            </SubSection>

            {/* ─── Tier 2: Test and validate ──────────────────────────── */}
            <SubSection
                label="Test and validate"
                helper="Probe the active connector. Fast and safe — uses the same path the AI sidebar's discovery loop runs on every conversation start."
            >

            {/* ── Connection test ───────────────────────────────────── */}
            <Leaf
                group="ai"
                label="Connection test"
                helper={
                    isSupervisor
                        ? "Per-space probes run in parallel with a 2-second stagger between launches (per ADR-0003). Partial failures are visible — the rest still answer."
                        : "Live probe against the proxy. Shows reachability, schema hints, and the inferred pack."
                }
            >
                {!activeAiProfile && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                        Pick a provider first.
                    </div>
                )}
                {activeAiProfile && !isSupervisor && (
                    <TestConnectionPanel profile={activeAiProfile} autoRun={false} />
                )}
                {activeAiProfile && isSupervisor && activeProfileMeta?.spaces && (
                    <SupervisorProbeMatrix spaces={activeProfileMeta.spaces} />
                )}
            </Leaf>

            </SubSection>

            {/* ─── Tier 3: Generation behavior ────────────────────────── */}
            <SubSection
                label="Generation behavior"
                helper="How the AI talks back — prompt strategy, domain guidance, sections, metric semantics. Saves to Pulse genieSettings and live-updates the playground."
            >

            {/* ── Shared assistant behavior (used by BOTH AI Insights and Ask Pulse) ─
              * 2026-05-19 Codex naming audit:
              *   "rename the shared leaf to 'Response behavior'; split common
              *    grounding from surface-specific controls."
              * Label was "AI Insights" which implied it only affected the
              * proactive-briefing surface. The actual scope is broader: prompt
              * strategy, domain guidance, metric semantics, evidence display,
              * sections — all of these flow through to Ask Pulse responses too.
              * The full IA restructure (Assistant / Shared context / Response
              * behavior / Surface-specific) is queued for a follow-up cycle;
              * this rename clarifies the scope without the deeper refactor. */}
            <Leaf
                group="ai"
                label="Response behavior"
                helper="Shared with both AI Insights and Ask Pulse. Controls prompt strategy, domain guidance, section schema, metric semantics, and evidence display. Saves to Pulse genieSettings and live-updates the playground."
            >
                <PulseAiInsightsSettingsPanel
                    value={pulseAi.value}
                    onChange={pulseAi.update}
                    activeAiProfile={activeAiProfile}
                />
            </Leaf>

            <Leaf
                group="ai"
                label="UC Metric View"
                helper="Discover governed Databricks metric views and use one as the semantic source for AI Insights."
            >
                <MetricViewPicker
                    activeAiProfile={activeAiProfile}
                    value={pulseAi.value.ucMetricView}
                    onChange={ucMetricView => pulseAi.update({ ucMetricView })}
                />
            </Leaf>

            <Leaf group="ai" label="Browse library" helper="Open the Knowledge Base content browser — glossary, ontology, KPIs, sample questions per pack.">
                <DeepLinkButton
                    label={packSelection?.pack ? `Browse ${packSelection.pack}` : "Browse Knowledge Base"}
                    onClick={() => {
                        if (typeof window === "undefined") return;
                        const target = packSelection?.pack
                            ? `/knowledge/${encodeURIComponent(packSelection.pack)}`
                            : "/knowledge";
                        window.history.pushState({}, "", target);
                        try {
                            window.dispatchEvent(new CustomEvent("pulseplay:knowledge-navigate"));
                        } catch { /* swallow */ }
                    }}
                />
            </Leaf>

            </SubSection>
        </section>
    );
}

// ─── AI Insights settings editor ────────────────────────────────────────

function PulseAiInsightsSettingsPanel(props: {
    value: PulseAiVisualSettings;
    onChange: (patch: Partial<PulseAiVisualSettings>) => void;
    activeAiProfile: string;
}): React.ReactElement {
    const { value, onChange } = props;
    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div
                role="note"
                style={{
                    fontSize: 11,
                    opacity: 0.74,
                    background: "rgba(0,0,0,0.035)",
                    padding: "8px 10px",
                    borderRadius: 5,
                    lineHeight: 1.45,
                }}
            >
                This replaces the old Pulse Console setup tab. Provider selection above writes the same
                <code> genieSettings.assistantProfile </code> value used by Pulse at runtime.
            </div>

            <CurrentValue label="Runtime profile">
                {value.assistantProfile || props.activeAiProfile || "(provider not selected)"}
            </CurrentValue>

            <SettingsSelect<PulseEnabledFeatures>
                label="Available AI surfaces"
                value={value.enabledFeatures}
                onChange={enabledFeatures => onChange({ enabledFeatures })}
                options={[
                    { value: "both", label: "Both — AI Insights + Ask Pulse" },
                    { value: "insightsOnly", label: "AI Insights only" },
                    { value: "chatOnly", label: "Ask Pulse only" },
                ]}
            />

            <SettingsSelect<PulseInsightsAuthoringMode>
                label="Authoring mode"
                value={value.insightsAuthoringMode}
                onChange={insightsAuthoringMode => onChange({ insightsAuthoringMode })}
                options={[
                    { value: "preset", label: "Preset — pick domain + sections" },
                    { value: "ai-assisted", label: "AI-assisted — infer from data" },
                    { value: "manual", label: "Manual — write prompt" },
                ]}
            />

            <SettingsTextInput
                label="Analytics domain"
                value={value.insightsDomain}
                placeholder="Example: cpg-fmcg, finance, supply-chain"
                onChange={insightsDomain => onChange({ insightsDomain })}
            />

            <SettingsTextarea
                label="Custom insights prompt"
                value={value.insightsPrompt}
                placeholder={"## Objective\nExplain what the AI should prioritize.\n\n## Required output\n- HEADLINE\n- TRENDS\n- RISKS\n- ACTIONS"}
                rows={5}
                onChange={insightsPrompt => onChange({ insightsPrompt })}
            />

            <SettingsTextarea
                label="Domain guidance"
                value={value.insightsDomainGuidance}
                placeholder={"## Business rules\nDefine KPI semantics and exception handling.\n\n## Formatting standards\nMetric | Format | Direction"}
                rows={5}
                onChange={insightsDomainGuidance => onChange({ insightsDomainGuidance })}
            />

            <SettingsTextarea
                label="Custom sections JSON"
                value={value.insightsCustomSections}
                placeholder={'[{"id":"headline","title":"HEADLINE","instruction":"Summarize the key movement."}]'}
                rows={4}
                mono
                onChange={insightsCustomSections => onChange({ insightsCustomSections })}
            />

            <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Included stages</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <SettingsCheckbox
                        label="HEADLINE"
                        checked={value.insightsShowHeadline}
                        onChange={insightsShowHeadline => onChange({ insightsShowHeadline })}
                    />
                    <SettingsCheckbox
                        label="TRENDS"
                        checked={value.insightsShowTrends}
                        onChange={insightsShowTrends => onChange({ insightsShowTrends })}
                    />
                    <SettingsCheckbox
                        label="RISKS"
                        checked={value.insightsShowRisks}
                        onChange={insightsShowRisks => onChange({ insightsShowRisks })}
                    />
                    <SettingsCheckbox
                        label="ACTIONS"
                        checked={value.insightsShowActions}
                        onChange={insightsShowActions => onChange({ insightsShowActions })}
                    />
                </div>
            </div>

            <SettingsTextarea
                label="Metric direction rules"
                value={value.metricDirectionRules}
                placeholder={"Revenue: higher is better\nReturns: lower is better\nInventory days: lower is better"}
                rows={3}
                onChange={metricDirectionRules => onChange({ metricDirectionRules })}
            />

            <SettingsTextarea
                label="Metric direction map JSON"
                value={value.insightsMetricDirections}
                placeholder={'{"Revenue":{"good":"up"},"Returns":{"good":"down"}}'}
                rows={3}
                mono
                onChange={insightsMetricDirections => onChange({ insightsMetricDirections })}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <SettingsCheckbox
                    label="Show provenance footer"
                    checked={value.insightsShowProvenanceFooter}
                    onChange={insightsShowProvenanceFooter => onChange({ insightsShowProvenanceFooter })}
                />
                <SettingsSelect<number>
                    label="Cache TTL"
                    value={value.insightsCacheTtlMinutes}
                    onChange={insightsCacheTtlMinutes => onChange({ insightsCacheTtlMinutes })}
                    options={[
                        { value: 0, label: "Disabled" },
                        { value: 5, label: "5 minutes" },
                        { value: 15, label: "15 minutes" },
                        { value: 30, label: "30 minutes" },
                        { value: 60, label: "1 hour" },
                        { value: 120, label: "2 hours" },
                    ]}
                />
            </div>

            <details>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Stage-specific instruction overrides</summary>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    <SettingsTextarea label="HEADLINE override" value={value.insightsHeadlineOverride} rows={3} onChange={insightsHeadlineOverride => onChange({ insightsHeadlineOverride })} />
                    <SettingsTextarea label="TRENDS override" value={value.insightsTrendsOverride} rows={3} onChange={insightsTrendsOverride => onChange({ insightsTrendsOverride })} />
                    <SettingsTextarea label="RISKS override" value={value.insightsRisksOverride} rows={3} onChange={insightsRisksOverride => onChange({ insightsRisksOverride })} />
                    <SettingsTextarea label="ACTIONS override" value={value.insightsActionsOverride} rows={3} onChange={insightsActionsOverride => onChange({ insightsActionsOverride })} />
                </div>
            </details>
        </div>
    );
}

function SettingsTextInput(props: {
    label: string;
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
}): React.ReactElement {
    return (
        <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{props.label}</span>
            <input
                value={props.value}
                placeholder={props.placeholder}
                onChange={e => props.onChange(e.target.value)}
                style={settingsInputStyle}
            />
        </label>
    );
}

function SettingsTextarea(props: {
    label: string;
    value: string;
    rows?: number;
    mono?: boolean;
    placeholder?: string;
    onChange: (next: string) => void;
}): React.ReactElement {
    return (
        <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{props.label}</span>
            <textarea
                value={props.value}
                rows={props.rows ?? 4}
                placeholder={props.placeholder}
                onChange={e => props.onChange(e.target.value)}
                style={{
                    ...settingsInputStyle,
                    minHeight: 72,
                    resize: "vertical",
                    fontFamily: props.mono ? "var(--pp-mono, ui-monospace, SFMono-Regular, Consolas, monospace)" : "inherit",
                    lineHeight: 1.45,
                }}
            />
        </label>
    );
}

function SettingsSelect<T extends string | number>(props: {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (next: T) => void;
}): React.ReactElement {
    return (
        <label style={{ display: "grid", gap: 4, minWidth: 220 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{props.label}</span>
            <select
                value={String(props.value)}
                onChange={e => {
                    const match = props.options.find(opt => String(opt.value) === e.target.value);
                    if (match) props.onChange(match.value);
                }}
                style={settingsInputStyle}
            >
                {props.options.map(opt => (
                    <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                ))}
            </select>
        </label>
    );
}

function SettingsCheckbox(props: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}): React.ReactElement {
    return (
        <label
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "6px 10px",
                border: "1px solid var(--pp-border, rgba(0,0,0,0.14))",
                borderRadius: 5,
                background: props.checked ? "rgba(0,120,212,0.08)" : "transparent",
            }}
        >
            <input
                type="checkbox"
                checked={props.checked}
                onChange={e => props.onChange(e.target.checked)}
            />
            {props.label}
        </label>
    );
}

function MetricViewPicker(props: {
    activeAiProfile: string;
    value: string;
    onChange: (next: string) => void;
}): React.ReactElement {
    const [catalog, setCatalog] = useState("workspace");
    const [schema, setSchema] = useState("databrickspractice");
    const [items, setItems] = useState<MetricViewSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const runDiscovery = async () => {
        setLoading(true);
        setError("");
        try {
            const data = await listMetricViews({
                assistantProfile: props.activeAiProfile || "default",
                catalog,
                schema,
            });
            setItems(Array.isArray(data.items) ? data.items : []);
        } catch (err) {
            setItems([]);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void runDiscovery();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr)) auto", gap: 8, alignItems: "end" }}>
                <SettingsTextInput label="Catalog" value={catalog} onChange={setCatalog} />
                <SettingsTextInput label="Schema" value={schema} onChange={setSchema} />
                <button
                    type="button"
                    onClick={() => void runDiscovery()}
                    disabled={loading || !catalog.trim() || !schema.trim()}
                    style={{
                        minHeight: 34,
                        padding: "7px 12px",
                        border: "1px solid var(--pp-accent, #0078d4)",
                        background: "var(--pp-accent, #0078d4)",
                        color: "white",
                        borderRadius: 4,
                        cursor: loading ? "wait" : "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                    }}
                >
                    {loading ? "Discovering" : "Discover"}
                </button>
            </div>
            <SettingsTextInput
                label="Selected metric view"
                value={props.value}
                placeholder="catalog.schema.metric_view"
                onChange={props.onChange}
            />
            {error && <div role="alert" style={{ color: "#a01828", fontSize: 12 }}>{error}</div>}
            {!error && items.length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.62 }}>
                    No metric views returned for this catalog/schema.
                </div>
            )}
            {items.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                    {items.map(item => (
                        <button
                            key={item.fullName || item.id}
                            type="button"
                            onClick={() => props.onChange(item.fullName || item.id)}
                            aria-pressed={props.value === (item.fullName || item.id)}
                            style={{
                                display: "grid",
                                gap: 2,
                                padding: "8px 10px",
                                textAlign: "left",
                                border: "1px solid var(--pp-border, rgba(0,0,0,0.14))",
                                borderRadius: 5,
                                background: props.value === (item.fullName || item.id) ? "rgba(0,120,212,0.08)" : "transparent",
                                cursor: "pointer",
                                color: "inherit",
                            }}
                        >
                            <strong style={{ fontSize: 12 }}>{item.fullName || item.id}</strong>
                            {item.comment && <span style={{ fontSize: 11, opacity: 0.65 }}>{item.comment}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const settingsInputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
    borderRadius: 5,
    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
    boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04)",
    color: "inherit",
    fontSize: 12,
};

// ─── Provider picker ────────────────────────────────────────────────────

interface ProviderPickerProps {
    options: ProfileMetadata[];
    value: string;
    onChange: (next: string) => void;
}

function ProviderPicker(props: ProviderPickerProps): React.ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {props.options.map(p => {
                const active = p.name === props.value;
                const isSup = p.type === "supervisor" || p.type === "supervisor-local";
                return (
                    <button
                        key={p.name}
                        type="button"
                        onClick={() => props.onChange(p.name)}
                        aria-pressed={active}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                            background: active ? "var(--pp-accent, #0078d4)" : "transparent",
                            color: active ? "white" : "inherit",
                            borderRadius: 4,
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 13,
                        }}
                    >
                        <span>
                            <strong>{p.displayName || p.name}</strong>
                            <span style={{ opacity: 0.7, fontSize: 11, marginLeft: 6 }}>
                                {p.dataDomain || p.description || p.name}
                            </span>
                        </span>
                        {isSup && (
                            <span
                                style={{
                                    fontSize: 10,
                                    padding: "2px 8px",
                                    background: active ? "rgba(255,255,255,0.25)" : "rgba(0, 120, 212, 0.15)",
                                    color: active ? "white" : "var(--pp-accent, #0078d4)",
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                }}
                            >
                                Supervisor ·{" "}
                                {Array.isArray(p.spaces) ? p.spaces.length : "?"} spaces
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Supervisor fan-out table (read-only) ───────────────────────────────

interface SupervisorFanOutTableProps {
    profile: ProfileMetadata;
    allowedGenieSpaces?: string[];
}

function SupervisorFanOutTable(props: SupervisorFanOutTableProps): React.ReactElement {
    const spaces = props.profile.spaces || [];
    return (
        <div style={{ fontSize: 12 }}>
            <CurrentValue label="Agent">{props.profile.agentName || props.profile.displayName || props.profile.name}</CurrentValue>
            <CurrentValue label="Routing">parallel fan-out (2 s stagger, ADR-0003)</CurrentValue>
            <CurrentValue label="Configured spaces">{spaces.length || "(none)"}</CurrentValue>
            {spaces.length > 0 && (
                <table style={{ width: "100%", marginTop: 8, fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ textAlign: "left", opacity: 0.6 }}>
                            <th style={{ padding: "4px 6px" }}>Space / Profile</th>
                            <th style={{ padding: "4px 6px" }}>Allowlist</th>
                        </tr>
                    </thead>
                    <tbody>
                        {spaces.map(name => {
                            const lower = String(name || "").toLowerCase();
                            const inAllowlist = !props.allowedGenieSpaces || props.allowedGenieSpaces.length === 0
                                ? null
                                : props.allowedGenieSpaces.map(s => s.toLowerCase()).includes(lower);
                            return (
                                <tr key={name} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                                    <td style={{ padding: "4px 6px", fontFamily: "var(--pp-mono, monospace)" }}>{name}</td>
                                    <td style={{ padding: "4px 6px" }}>
                                        {inAllowlist === null && <span style={{ opacity: 0.5 }}>(no allowlist)</span>}
                                        {inAllowlist === true && <span style={{ color: "#0f6b35" }}>allowed</span>}
                                        {inAllowlist === false && <span style={{ color: "#a01828" }}>not in allowlist</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ─── Supervisor probe matrix ────────────────────────────────────────────

interface ProbeState {
    space: string;
    kind: "idle" | "loading" | "ok" | "error";
    durationMs?: number;
    message?: string;
    inferredPack?: string | null;
}

const SUPERVISOR_STAGGER_MS = 2000; // ADR-0003

function SupervisorProbeMatrix(props: { spaces: string[] }): React.ReactElement {
    const [states, setStates] = useState<ProbeState[]>(() =>
        props.spaces.map(s => ({ space: s, kind: "idle" })),
    );
    const [running, setRunning] = useState(false);

    useEffect(() => {
        setStates(props.spaces.map(s => ({ space: s, kind: "idle" })));
    }, [props.spaces]);

    const run = async () => {
        if (running) return;
        setRunning(true);
        setStates(props.spaces.map(s => ({ space: s, kind: "loading" })));

        const launch = async (idx: number, name: string) => {
            const startedAt = Date.now();
            try {
                const result: ConnectorProbeResult = await probeConnector(name);
                setStates(prev => prev.map((s, i) => i === idx ? {
                    space: name,
                    kind: "ok",
                    durationMs: Date.now() - startedAt,
                    inferredPack: result.inference?.suggestedPack
                        ? `${result.inference.suggestedPack}${result.inference.suggestedSubVertical ? "/" + result.inference.suggestedSubVertical : ""}`
                        : null,
                } : s));
            } catch (err) {
                setStates(prev => prev.map((s, i) => i === idx ? {
                    space: name,
                    kind: "error",
                    durationMs: Date.now() - startedAt,
                    message: err instanceof Error ? err.message : String(err),
                } : s));
            }
        };

        // Staggered parallel launch — each probe starts SUPERVISOR_STAGGER_MS
        // after the previous so a thundering-herd doesn't spike the proxy.
        const promises: Promise<void>[] = [];
        for (let i = 0; i < props.spaces.length; i += 1) {
            const name = props.spaces[i];
            const delay = i * SUPERVISOR_STAGGER_MS;
            promises.push(
                new Promise<void>(resolve => {
                    window.setTimeout(() => {
                        launch(i, name).finally(resolve);
                    }, delay);
                }),
            );
        }
        await Promise.allSettled(promises);
        setRunning(false);
    };

    const aggregate = useMemo(() => {
        const ok = states.filter(s => s.kind === "ok").length;
        const err = states.filter(s => s.kind === "error").length;
        const total = states.length;
        return { ok, err, total };
    }, [states]);

    return (
        <div style={{ fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <button
                    type="button"
                    onClick={run}
                    disabled={running}
                    style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        border: "1px solid var(--pp-accent, #0078d4)",
                        background: running ? "transparent" : "var(--pp-accent, #0078d4)",
                        color: running ? "var(--pp-accent, #0078d4)" : "white",
                        borderRadius: 4,
                        cursor: running ? "default" : "pointer",
                        fontWeight: 600,
                    }}
                >
                    {running ? "Probing…" : "Run probe across all spaces"}
                </button>
                {aggregate.total > 0 && !running && (
                    <span style={{ opacity: 0.75 }}>
                        {aggregate.ok > 0 || aggregate.err > 0
                            ? `${aggregate.ok}/${aggregate.total} reachable · ${aggregate.err} failed`
                            : "Not run yet"}
                    </span>
                )}
            </div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ textAlign: "left", opacity: 0.6 }}>
                        <th style={{ padding: "4px 6px" }}>Space</th>
                        <th style={{ padding: "4px 6px" }}>Status</th>
                        <th style={{ padding: "4px 6px" }}>Latency</th>
                        <th style={{ padding: "4px 6px" }}>Inferred pack</th>
                    </tr>
                </thead>
                <tbody>
                    {states.map(s => (
                        <tr key={s.space} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                            <td style={{ padding: "4px 6px", fontFamily: "var(--pp-mono, monospace)" }}>{s.space}</td>
                            <td style={{ padding: "4px 6px" }}>
                                {s.kind === "idle" && <span style={{ opacity: 0.5 }}>idle</span>}
                                {s.kind === "loading" && <span style={{ opacity: 0.6 }}>probing…</span>}
                                {s.kind === "ok" && <span style={{ color: "#0f6b35" }}>✓ reachable</span>}
                                {s.kind === "error" && <span style={{ color: "#a01828" }}>✗ {s.message?.slice(0, 80) || "failed"}</span>}
                            </td>
                            <td style={{ padding: "4px 6px" }}>{typeof s.durationMs === "number" ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{s.inferredPack || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Small deep-link button ─────────────────────────────────────────────

function DeepLinkButton(props: { label: string; onClick: () => void }): React.ReactElement {
    return (
        <button
            type="button"
            onClick={props.onClick}
            style={{
                padding: "6px 12px",
                fontSize: 12,
                border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                background: "transparent",
                borderRadius: 4,
                cursor: "pointer",
                alignSelf: "flex-start",
            }}
        >
            {props.label} →
        </button>
    );
}
