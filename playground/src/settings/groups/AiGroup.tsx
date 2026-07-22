// AI-side Settings group: connector catalogue, model/agent readout,
// connection test (per-space probes for Supervisor), knowledge pack, and
// response-behavior settings. AI Insights settings are edited here directly;
// the Pulse Console links here instead of hosting a duplicate setup form.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSettings } from "../settingsStore";
import { CurrentValue, Leaf, OrphanBanner, SubSection } from "./BiGroup";
import { BookmarkNav, type BookmarkSection } from "../primitives/BookmarkNav";
import { ProgressiveSection } from "../primitives/ProgressiveSection";
import { HelpTip } from "../primitives/HelpTip";
import { TestConnectionPanel } from "../../components/TestConnectionPanel";
import { PackPicker, type PackInfo, type PackSelection } from "../../components/PackPicker";
import { probeConnector } from "../../lib/probeClient";
import { useDatabricksCapabilities } from "../../lib/databricksCapabilities";
import { listMetricViews, fetchMetricViewDetail, extractMeasureNamesFromMetricView, type MetricViewSummary } from "../../lib/databricksAssets";
import type { ConnectorProbeResult } from "../../types/probe";
import { navigateToPowerBiQna } from "../../powerbi/PowerBiQnARoute";
import { ACTIVATOR_DESCRIPTORS, buildGuidancePlaceholder } from "../../pulse/guidanceActivators";
import { SectionMarkdownEditor } from "../components/SectionMarkdownEditor";
import { SqlSectionsEditor } from "../components/SqlSectionsEditor";
import { ConnectorBrandGrid } from "../../setup/ConnectorBrandGrid";
import { GenieSpacesManager } from "../components/GenieSpacesManager";
import {
    usePulseAiVisualSettings,
    type PulseAiVisualSettings,
    type PulseEnabledFeatures,
    type PulseInsightsAuthoringMode,
} from "../pulseVisualSettingsStore";
import { AiAssistedSuggestionPanel } from "../../pulse/setupStep5";
import { CustomSectionPresetCombobox, MetricDirectionPresetCombobox } from "../components/PresetCombobox";
import { suggestInsightsConfigViaProxy } from "../../lib/insightsSuggestClient";
import { buildPromptDrafts, type PromptDrafts } from "../../lib/promptDraftGenerator";
import { MetricDirectionAutoDetectChip } from "../../components/MetricDirectionAutoDetectChip";
import { getDiscoverySnapshot, type DiscoverySnapshot } from "../../lib/discoveryClient";

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

    // Load allowlist-filtered packs from the proxy.
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
            // Intersect for the UI. The proxy already filters, but the
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
    const isPowerBiSemanticModel =
        !!activeProfileMeta && activeProfileMeta.type === "powerbi-semantic-model";
    const vectorSearchDetail = databricksCapabilities.details.vectorSearch;
    const vectorSearchReady = databricksCapabilities.capabilities.vectorSearch === true && (vectorSearchDetail?.count || 0) > 0;

    // Progressive setup gates for the AI Setup header, rendered as numbered
    // pills.
    const aiSetupGates = [
        { n: 1, label: "Connector",       done: !!activeAiProfile,        hint: "Pick from the catalogue below" },
        { n: 2, label: "Knowledge pack",  done: !!packSelection?.pack,    hint: "Optional but recommended" },
        { n: 3, label: "Ready to ask",    done: !!activeAiProfile,        hint: "Auto-completes when a connector is active" },
    ];
    const completedGates = aiSetupGates.filter(g => g.done).length;

    // Progressive sections default to "all expanded" so a returning author
    // sees every configured control without re-expanding. Bookmark jump only
    // scrolls, never toggles, so users don't lose context they had open
    // elsewhere.
    const ALL_AI_SECTION_IDS = ["connector", "assistant", "context", "response", "surface"] as const;
    const [expandedAiSections, setExpandedAiSections] = useState<Set<string>>(() => new Set(ALL_AI_SECTION_IDS));
    const aiBookmarks: ReadonlyArray<BookmarkSection> = useMemo(() => [
        { id: "connector", step: 1, label: "Connector",        checked: !!activeAiProfile,     active: expandedAiSections.has("connector") },
        { id: "assistant", step: 2, label: "Assistant",        checked: !!activeAiProfile,     active: expandedAiSections.has("assistant") },
        { id: "context",   step: 3, label: "Shared context",   checked: !!packSelection?.pack, active: expandedAiSections.has("context")   },
        { id: "response",  step: 4, label: "Response",         checked: !!activeAiProfile,     active: expandedAiSections.has("response")  },
        { id: "surface",   step: 5, label: "Surface-specific", checked: !!activeAiProfile,     active: expandedAiSections.has("surface")   },
    ], [activeAiProfile, packSelection, expandedAiSections]);
    const jumpToAiSection = useCallback((id: string) => {
        setExpandedAiSections(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev); next.add(id); return next;
        });
        if (typeof document !== "undefined") {
            const el = document.getElementById(`pp-setup-section-${id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);
    const toggleAiSection = useCallback((id: string) => {
        setExpandedAiSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);
    const isAiSectionActive = (id: string) => expandedAiSections.has(id);

    return (
        <section aria-labelledby="settings-ai-title">
            {/* h2 kept for a11y but visually hidden: the rail already marks
                the active group, so a visible heading would be duplicate
                chrome. Intro text lives on the (i) HelpTip. */}
            <h2 id="settings-ai-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>AI Setup</h2>
            <header style={{ marginBottom: 16 }}>
                <div
                    role="status"
                    aria-label={`AI setup progress: ${completedGates} of ${aiSetupGates.length} steps complete`}
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                        padding: "8px 12px",
                        background: completedGates === aiSetupGates.length
                            ? "rgba(34, 197, 94, 0.06)"
                            : "rgba(245, 158, 11, 0.05)",
                        border: `1px solid ${completedGates === aiSetupGates.length ? "rgba(34, 197, 94, 0.25)" : "rgba(245, 158, 11, 0.20)"}`,
                        borderRadius: 6,
                        fontSize: 12,
                    }}
                >
                    <span style={{ fontWeight: 600, color: "var(--pp-text)" }}>
                        {completedGates === aiSetupGates.length
                            ? "✓ AI ready"
                            : `${completedGates} of ${aiSetupGates.length} steps`}
                    </span>
                    {aiSetupGates.map(g => (
                        <span
                            key={g.n}
                            title={g.hint}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 8px",
                                background: g.done ? "rgba(34, 197, 94, 0.12)" : "transparent",
                                color: g.done ? "#166534" : "var(--pp-text-muted, #6b7280)",
                                border: `1px solid ${g.done ? "rgba(34, 197, 94, 0.30)" : "rgba(0,0,0,0.10)"}`,
                                borderRadius: 999,
                                fontWeight: g.done ? 600 : 400,
                            }}
                        >
                            <span aria-hidden="true">{g.done ? "✓" : g.n}</span>
                            <span>{g.label}</span>
                        </span>
                    ))}
                    <div style={{ marginLeft: "auto" }}>
                        <HelpTip
                            label="About AI Setup"
                            title="AI Setup"
                            body={[
                                "Everything AI-side — connector, knowledge pack, AI Insights config, Ask Pulse config, Vector Search, UC Metric View.",
                                "One assistant powers both AI Insights and Ask Pulse; change once, both benefit.",
                            ]}
                        />
                    </div>
                </div>
                <div style={{ marginTop: 12 }}>
                    <BookmarkNav
                        sections={aiBookmarks}
                        onJump={(id) => jumpToAiSection(id)}
                        ariaLabel="AI Setup sections"
                    />
                </div>
            </header>

            {/* Connector catalogue. Surfaces every connector type from
              * /api/assistant/connector-types whether configured or not. Drop
              * a new manifest into proxy/lib/connectorManifests.js and a new
              * card appears here without any UI code change. Sits above the
              * Assistant tier so users see the full menu before picking.
              */}
            <ProgressiveSection
                anchorId="connector"
                number="01"
                title="Connector catalogue"
                subtitle={activeAiProfile ? `Active: ${activeAiProfile}` : "Pick a connector to power the assistant"}
                active={isAiSectionActive("connector")}
                checked={!!activeAiProfile}
                onToggle={() => toggleAiSection("connector")}
                metadata={{
                    source: activeAiProfile ? "Selected proxy profile" : "No profile selected",
                    freshness: activeAiProfile ? "Current session" : "Pending setup",
                    owner: "AI platform owner",
                    nextAction: activeAiProfile ? "Test connection in section 02" : "Pick a configured connector below",
                }}
            >
                <ConnectorBrandGrid
                    activeProfileName={activeAiProfile || null}
                    onPickProfile={(name) => {
                        const result = setActiveAiProfile(name);
                        if (!result.ok) console.warn(result.reason);
                    }}
                    showOnlyConfiguredByDefault
                />
            </ProgressiveSection>

            {/* Multi-Genie spaces: add and manage several Genie spaces as
              * selectable connectors without editing config.json. Stored
              * client-side, used via inline credentials (the same mechanism
              * GenieClient.attachInlineCredentialsHeaders already sends). The
              * config.json profile pattern remains the path for shared/server
              * deployments. */}
            <ProgressiveSection
                anchorId="genie-spaces"
                number="01b"
                title="Genie spaces (multi-space)"
                subtitle="Add several Databricks Genie spaces as switchable connectors"
                active={isAiSectionActive("genie-spaces")}
                checked={false}
                onToggle={() => toggleAiSection("genie-spaces")}
                metadata={{
                    source: "Browser-stored inline connections",
                    freshness: "This browser only",
                    owner: "AI platform owner",
                    nextAction: "Add a space, then click Use to switch",
                }}
            >
                <GenieSpacesManager />
            </ProgressiveSection>

            {/* Assistant: who is answering. Sits ahead of context and
              * response tuning because nothing else matters until a working
              * assistant is wired.
              */}
            <ProgressiveSection
                anchorId="assistant"
                number="02"
                title="Assistant"
                subtitle={activeAiProfile ? "Model / Agent + Connection test" : "Pick a connector first"}
                active={isAiSectionActive("assistant")}
                checked={!!activeAiProfile}
                onToggle={() => toggleAiSection("assistant")}
                metadata={{
                    source: activeProfileMeta ? (activeProfileMeta.displayName || activeProfileMeta.name) : "(none)",
                    freshness: activeAiProfile ? "Live probe ready" : "Pending",
                    owner: "AI platform owner",
                    nextAction: activeAiProfile ? "Run the connection test" : "Pick a connector in 01",
                }}
            >

            {/* Orphan banner surfaces when a stale pulseplay:active-ai-profile
              * localStorage key references a removed profile. */}
            {aiOrphan && <OrphanBanner reason={aiOrphan.reason} />}

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
                        Pick a connector in the catalogue above to see the model / agent details.
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

            {/* Connection test lives inside the Assistant tier because the
              * connection is part of "who is answering". */}
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
                        Pick a connector in the catalogue above first.
                    </div>
                )}
                {activeAiProfile && !isSupervisor && (
                    <TestConnectionPanel profile={activeAiProfile} autoRun={false} />
                )}
                {activeAiProfile && isSupervisor && activeProfileMeta?.spaces && (
                    <SupervisorProbeMatrix spaces={activeProfileMeta.spaces} />
                )}
            </Leaf>

            {/* Power BI Q&A launch. Renders only for the
              * `powerbi-semantic-model` profile. Opens /powerbi/qna; the proxy
              * mints the dataset-scoped embed token, and this path makes zero
              * LLM calls. */}
            {isPowerBiSemanticModel && (
                <Leaf
                    group="ai"
                    label="Power BI Q&A"
                    helper="Open Microsoft's natural-language Q&A surface bound to this dataset. The token mint stays server-side; PulsePlay makes no LLM call on this path. Microsoft is retiring Q&A on 31 Dec 2026 — for durable PBI natural-language work, use the powerbi-semantic-model deterministic DAX path."
                >
                    {/* Q&A end-of-life countdown chip. Deprecation research
                     *  lives in docs/research/EXTERNAL_REFERENCES.md. */}
                    <div
                        role="status"
                        data-testid="powerbi-qna-eol-chip"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            marginBottom: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#92400e",
                            background: "#fffbe6",
                            border: "1px solid #ffe58f",
                            borderLeft: "3px solid #b45309",
                            borderRadius: 4,
                        }}
                    >
                        <span aria-hidden="true">⚠</span>
                        Microsoft retires this feature on 31 Dec 2026.{" "}
                        <a
                            href="https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#92400e", textDecoration: "underline" }}
                        >
                            Microsoft announcement →
                        </a>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigateToPowerBiQna()}
                        data-action="open-powerbi-qna"
                        style={{
                            display: "block",
                            padding: "8px 16px",
                            fontSize: 13,
                            fontWeight: 600,
                            border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                            background: "var(--pp-accent, #f3b5e3)",
                            color: "var(--pp-accent-fg, #211322)",
                            borderRadius: 4,
                            cursor: "pointer",
                        }}
                    >
                        Open Power BI Q&amp;A →
                    </button>
                </Leaf>
            )}

            </ProgressiveSection>

            <ProgressiveSection
                anchorId="context"
                number="03"
                title="Shared context"
                subtitle={packSelection?.pack ? `Pack: ${packSelection.pack}` : "Knowledge pack, Vector Search, UC Metric View"}
                active={isAiSectionActive("context")}
                checked={!!packSelection?.pack}
                onToggle={() => toggleAiSection("context")}
                metadata={{
                    source: packSelection?.pack ? "Selected knowledge pack" : "No pack selected",
                    freshness: packSelection?.pack ? "Current session" : "Optional",
                    owner: "Data product owner",
                    nextAction: packSelection?.pack ? "Tune response behavior in 04" : "Pick a knowledge pack (optional)",
                }}
            >

            <Leaf
                group="ai"
                label="Knowledge pack"
                helper="The industry-domain bundle the assistant uses for vocabulary, KPIs, and starter questions. Used by both AI Insights and Ask Pulse. Restricted to packs your organization installs."
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
                    helper="Databricks Vector Search grounding. Available for this profile — configure the approved index for retrieval-augmented answers. Used by both AI Insights and Ask Pulse."
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

            <Leaf
                group="ai"
                label="UC Metric View"
                helper="Discover governed Databricks metric views and use one as the semantic source for the assistant. Used by both AI Insights and Ask Pulse."
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

            </ProgressiveSection>

            <ProgressiveSection
                anchorId="response"
                number="04"
                title="Response behavior"
                subtitle="Prompt strategy, sections, metric rules, domain guidance"
                active={isAiSectionActive("response")}
                checked={!!activeAiProfile}
                onToggle={() => toggleAiSection("response")}
                metadata={{
                    source: "Pulse AI settings",
                    freshness: "Saved locally",
                    owner: "AI Insights / Ask Pulse author",
                    nextAction: "Tune authoring mode, sections, metric rules",
                }}
            >

            <Leaf
                group="ai"
                label="Response behavior"
                helper="Shared with both AI Insights and Ask Pulse. Controls prompt strategy, domain guidance, section schema, metric semantics, and evidence display. Surface-specific knobs (Insights stages, Ask Pulse chat behavior) live in the next section."
            >
                <PulseAiInsightsSettingsPanel
                    value={pulseAi.value}
                    onChange={pulseAi.update}
                    activeAiProfile={activeAiProfile}
                    packSelection={packSelection}
                    profileNames={allowedProfileNames}
                />
            </Leaf>

            </ProgressiveSection>

            <ProgressiveSection
                anchorId="surface"
                number="05"
                title="Surface-specific behavior"
                subtitle="Supervisor Fusion, Knowledge Base toggles"
                active={isAiSectionActive("surface")}
                checked={!!activeAiProfile}
                onToggle={() => toggleAiSection("surface")}
                metadata={{
                    source: "Per-surface sub-pages",
                    freshness: "Saved locally",
                    owner: "AI platform owner",
                    nextAction: "Tune surface-specific knobs when needed",
                }}
            >
                <Leaf
                    group="ai"
                    label="Supervisor Fusion"
                    helper="Supervisor-only fan-out behavior — synthesis, auto-fusion, and per-space overrides. Only relevant when the active profile is a Supervisor."
                >
                    <DeepLinkButton
                        label="Open Supervisor Fusion"
                        onClick={() => {
                            if (typeof window === "undefined") return;
                            window.history.pushState({}, "", "/settings/ai/supervisor-fusion");
                            try { window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate")); } catch { /* swallow */ }
                        }}
                    />
                </Leaf>

                <Leaf
                    group="ai"
                    label="Knowledge Base"
                    helper="Analytics-knowledge toggles (chart rules / stats rules / reporting rules) used by AI Insights primarily, with knock-on effects on Ask Pulse when grounded answers reference them."
                >
                    <DeepLinkButton
                        label="Open Knowledge Base"
                        onClick={() => {
                            if (typeof window === "undefined") return;
                            window.history.pushState({}, "", "/settings/ai/knowledge-base");
                            try { window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate")); } catch { /* swallow */ }
                        }}
                    />
                </Leaf>
            </ProgressiveSection>
        </section>
    );
}

// AI Insights settings editor

function PulseAiInsightsSettingsPanel(props: {
    value: PulseAiVisualSettings;
    onChange: (patch: Partial<PulseAiVisualSettings>) => void;
    activeAiProfile: string;
    packSelection: PackSelection | null;
    /** Allowed connector profile names, selectable as per-SQL-section targets. */
    profileNames: ReadonlyArray<string>;
}): React.ReactElement {
    const { value, onChange } = props;
    const resolvedProfile = (value.assistantProfile || props.activeAiProfile || "").trim();
    // Proxy base URL for the SQL Validate dry-run.
    const sqlApiBaseUrl = useMemo(() => {
        try { return (window.localStorage.getItem("pulseplay:api-base-url") || "").trim() || "/api"; }
        catch { return "/api"; }
    }, []);
    const sqlProfileOptions = useMemo(
        () => props.profileNames.map(n => ({ value: n, label: n })),
        [props.profileNames],
    );
    const onSuggest = useCallback(async () => {
        if (!resolvedProfile) return null;
        return suggestInsightsConfigViaProxy({
            profile: resolvedProfile,
            pack: props.packSelection?.pack,
            subVertical: props.packSelection?.subVertical,
            domainHint: value.insightsDomain || undefined,
        });
    }, [resolvedProfile, props.packSelection?.pack, props.packSelection?.subVertical, value.insightsDomain]);

    // Deterministic prompt drafts templated from the cached DiscoverySnapshot
    // (no LLM call, works on every backend path incl. the no-LLM Power BI
    // connector). Returns null when there is no usable signal so the panel
    // can render an honest empty state.
    const onGeneratePromptDrafts = useCallback(async (): Promise<PromptDrafts | null> => {
        if (!resolvedProfile) return null;
        let snap: DiscoverySnapshot | null = null;
        try {
            snap = await getDiscoverySnapshot({
                assistantProfile: resolvedProfile,
                pack: props.packSelection?.pack,
                subVertical: props.packSelection?.subVertical,
            });
        } catch {
            snap = null; // hint-only generation still possible below
        }
        return buildPromptDrafts(snap, value.insightsDomain || undefined);
    }, [resolvedProfile, props.packSelection?.pack, props.packSelection?.subVertical, value.insightsDomain]);

    // Cache-first read of the discovery snapshot for the metric-direction
    // auto-detect chip. Settings never prefetches; the chip only shows when
    // discovery already ran elsewhere (App / UnifiedAssistantSurface).
    const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
    const [autoDetectDismissed, setAutoDetectDismissed] = useState(false);
    useEffect(() => {
        if (!resolvedProfile) {
            setSnapshot(null);
            return;
        }
        let cancelled = false;
        getDiscoverySnapshot({
            assistantProfile: resolvedProfile,
            pack: props.packSelection?.pack,
            subVertical: props.packSelection?.subVertical,
        })
            .then(snap => { if (!cancelled) setSnapshot(snap); })
            .catch(() => { /* swallow; the chip just stays hidden */ });
        return () => { cancelled = true; };
    }, [resolvedProfile, props.packSelection?.pack, props.packSelection?.subVertical]);

    // Third fallback signal: UC Metric View measure names, not view titles,
    // which are often technical (`vw_metric_*_flat`) and carry no semantic
    // content the heuristic can match. Cost is 1 list call plus N detail
    // calls, limited to the first 5 views to avoid runaway fetching on large
    // catalogs. If the catalog/schema defaults don't fit the user's profile,
    // the fetch fails silently and the chip stays hidden, with no error
    // noise.
    const [ucMetricMeasureNames, setUcMetricMeasureNames] = useState<string[]>([]);
    useEffect(() => {
        if (!resolvedProfile) {
            setUcMetricMeasureNames([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const payload = await listMetricViews({
                    assistantProfile: resolvedProfile,
                    catalog: (value.insightsUcCatalog || "").trim() || "workspace",
                    schema: (value.insightsUcSchema || "").trim() || "databrickspractice",
                });
                if (cancelled) return;
                const views = (payload.items ?? []).slice(0, 5);
                const detailPromises = views.map(v =>
                    fetchMetricViewDetail({
                        assistantProfile: resolvedProfile,
                        fullName: v.fullName,
                    }).catch(() => ({ item: undefined })),
                );
                const details = await Promise.all(detailPromises);
                if (cancelled) return;
                const allMeasures: string[] = [];
                for (const d of details) {
                    for (const name of extractMeasureNamesFromMetricView(d)) {
                        allMeasures.push(name);
                    }
                }
                setUcMetricMeasureNames(allMeasures);
            } catch {
                if (!cancelled) setUcMetricMeasureNames([]);
            }
        })();
        return () => { cancelled = true; };
    }, [resolvedProfile, value.insightsUcCatalog, value.insightsUcSchema]);

    // Fallback chain for the metric-direction auto-detect chip:
    //   1. BI adapter's visibleMeasures (Power BI SDK / etc.)
    //   2. fused.availableKpis (pack + probe + bi-surface signals)
    //   3. UC Metric View titles (Databricks Unity Catalog)
    // Dedup case-insensitively to avoid duplicate rules when a name
    // appears in more than one source.
    const measureNames = useMemo(() => {
        const fromBiMetadata = (snapshot?.sources?.biMetadata?.visibleMeasures ?? [])
            .map(m => m?.name || "")
            .filter(s => s.trim().length > 0);
        if (fromBiMetadata.length > 0) return fromBiMetadata;
        const fromAvailableKpis = (snapshot?.fused?.availableKpis ?? [])
            .map(k => k?.name || "")
            .filter(s => s.trim().length > 0);
        const allCandidates = fromAvailableKpis.length > 0
            ? fromAvailableKpis
            : ucMetricMeasureNames;
        // Dedup case-insensitively while preserving the first appearance's
        // original casing for the rules string output.
        const seen = new Set<string>();
        const out: string[] = [];
        for (const name of allCandidates) {
            const key = name.trim().toUpperCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name.trim());
        }
        return out;
    }, [snapshot, ucMetricMeasureNames]);
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

            {value.insightsAuthoringMode === "ai-assisted" && (
                <AiAssistedSuggestionPanel
                    onSuggest={resolvedProfile ? onSuggest : undefined}
                    currentDomain={value.insightsDomain}
                    currentSectionsJson={value.insightsCustomSections}
                    onApplyDomain={insightsDomain => onChange({ insightsDomain })}
                    onApplySections={insightsCustomSections => onChange({ insightsCustomSections })}
                    currentMetricRulesText={value.metricDirectionRules}
                    currentMetricRulesJson={value.insightsMetricDirections}
                    onApplyMetricRulesText={metricDirectionRules => onChange({ metricDirectionRules })}
                    onApplyMetricRulesJson={insightsMetricDirections => onChange({ insightsMetricDirections })}
                />
            )}

            <SettingsTextInput
                label="Analytics domain"
                value={value.insightsDomain}
                placeholder="Example: cpg-fmcg, finance, supply-chain"
                onChange={insightsDomain => onChange({ insightsDomain })}
            />

            <PromptDraftPanel
                onGenerate={resolvedProfile ? onGeneratePromptDrafts : undefined}
                currentInsightsPrompt={value.insightsPrompt}
                currentGuidance={value.insightsDomainGuidance}
                onApplyInsightsPrompt={insightsPrompt => onChange({ insightsPrompt })}
                onApplyGuidance={insightsDomainGuidance => onChange({ insightsDomainGuidance })}
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
                placeholder={buildGuidancePlaceholder()}
                rows={9}
                mono
                help={(
                    <HelpTip
                        label="Guidance keyword help"
                        title="Guidance keywords (## activators)"
                        width={380}
                        body={[
                            ...ACTIVATOR_DESCRIPTORS.flatMap(d => [
                                `## ${d.keyword}${d.status === "reserved" ? "  (recognized — enforcement coming)" : ""}`,
                                d.description,
                                ...(d.caveat ? [`Note: ${d.caveat}`] : []),
                            ]),
                            "Anything outside a ## keyword block is treated as normal business guidance.",
                        ]}
                    />
                )}
                onChange={insightsDomainGuidance => onChange({ insightsDomainGuidance })}
            />

            {/* Same preset library as the Pulse setupStep5 pane
              * (insightsPresetLibrary.ts: SWOT/BCG/RFM/Pareto plus pack
              * presets) and the same parameter editor. */}
            <Leaf
                group="ai"
                label="Custom sections preset library"
                summary="SWOT / BCG / RFM / Pareto / pack-specific presets — pick one to populate the Custom sections JSON below. Bundled metric direction rules (when the preset declares them) auto-apply to the Metric direction field too."
            >
                <CustomSectionPresetCombobox
                    currentDomain={value.insightsDomain}
                    onApplyDomain={insightsDomain => onChange({ insightsDomain })}
                    onApplySections={insightsCustomSections => onChange({ insightsCustomSections })}
                    onApplyMetricRules={metricDirectionRules => onChange({ metricDirectionRules })}
                />
            </Leaf>

            {/* Markdown section authoring writes the same canonical
              * insightsCustomSections JSON the runtime consumes, preserving
              * any SQL/config-item sections. The raw JSON view below stays
              * as an advanced escape hatch. */}
            <Leaf
                group="ai"
                label="AI Insights sections"
                summary="Define each section as a ## heading plus the AI prompt for it. Every heading becomes a card on the AI Insights screen, in order. SQL / config-item sections are authored under 'SQL sections' and preserved when you edit here."
            >
                <SectionMarkdownEditor
                    value={value.insightsCustomSections}
                    onChange={insightsCustomSections => onChange({ insightsCustomSections })}
                />
            </Leaf>

            {/* SQL / config-item sections run a read-only SELECT (no LLM)
              * and write the same insightsCustomSections JSON, preserving
              * AI sections. */}
            <Leaf
                group="ai"
                label="SQL sections"
                summary="Config-item sections backed by a read-only SELECT instead of the AI. Each fetches KPIs from a connector profile's warehouse (a Genie space or direct/underlying data) and renders as a card. Validate runs the query against the warehouse."
            >
                <SqlSectionsEditor
                    value={value.insightsCustomSections}
                    onChange={insightsCustomSections => onChange({ insightsCustomSections })}
                    apiBaseUrl={sqlApiBaseUrl}
                    assistantProfile={resolvedProfile}
                    profiles={sqlProfileOptions}
                />
            </Leaf>

            <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
                    Advanced — raw sections JSON
                </summary>
                <div style={{ marginTop: 8 }}>
                    <SettingsTextarea
                        label="Custom sections JSON"
                        value={value.insightsCustomSections}
                        placeholder={'[{"name":"HEADLINE","instruction":"Summarize the key movement.","kind":"ai"}]'}
                        rows={4}
                        mono
                        onChange={insightsCustomSections => onChange({ insightsCustomSections })}
                    />
                </div>
            </details>

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

            <Leaf
                group="ai"
                label="Metric direction preset library"
                summary="Pre-baked metric-direction rule sets (Sales / Operations / Healthcare) — pick one to populate the rules below. Or use auto-detection if your dataset has bound metrics."
            >
                {!autoDetectDismissed && (
                    <MetricDirectionAutoDetectChip
                        measureNames={measureNames}
                        onApply={metricDirectionRules => onChange({ metricDirectionRules })}
                        onDismiss={() => setAutoDetectDismissed(true)}
                    />
                )}
                <MetricDirectionPresetCombobox
                    currentDomain={value.insightsDomain}
                    onApplyDomain={insightsDomain => onChange({ insightsDomain })}
                    onApplyRules={metricDirectionRules => onChange({ metricDirectionRules })}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <SettingsTextInput
                        label="UC catalog (auto-detect source)"
                        value={value.insightsUcCatalog}
                        placeholder="workspace"
                        onChange={insightsUcCatalog => onChange({ insightsUcCatalog })}
                    />
                    <SettingsTextInput
                        label="UC schema (auto-detect source)"
                        value={value.insightsUcSchema}
                        placeholder="databrickspractice"
                        onChange={insightsUcSchema => onChange({ insightsUcSchema })}
                    />
                </div>
            </Leaf>

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
                <SettingsCheckbox
                    label="Staged reveal animation"
                    checked={value.insightsStagedRevealEnabled}
                    onChange={insightsStagedRevealEnabled => onChange({ insightsStagedRevealEnabled })}
                />
                <SettingsCheckbox
                    label="Show Research Agent traces"
                    checked={value.insightsShowResearchTraces}
                    onChange={insightsShowResearchTraces => onChange({ insightsShowResearchTraces })}
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

// Generate prompts from data context.
//
// Deterministic draft generation for the two prompt textareas, templated
// from the cached DiscoverySnapshot (real measure/dimension/KPI names only;
// see the honesty contract in promptDraftGenerator.ts). Applying never
// happens silently over existing text: non-empty targets get explicit
// Replace / Append choices, empty targets a plain Apply.

function PromptDraftPanel(props: {
    /** Undefined when no profile is resolved; the button is disabled with a hint. */
    onGenerate?: () => Promise<PromptDrafts | null>;
    currentInsightsPrompt: string;
    currentGuidance: string;
    onApplyInsightsPrompt: (next: string) => void;
    onApplyGuidance: (next: string) => void;
}): React.ReactElement {
    const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
    const [drafts, setDrafts] = useState<PromptDrafts | null>(null);
    const [applied, setApplied] = useState<{ prompt: boolean; guidance: boolean }>({ prompt: false, guidance: false });

    const run = useCallback(async () => {
        if (!props.onGenerate) return;
        setState("loading");
        setApplied({ prompt: false, guidance: false });
        try {
            const result = await props.onGenerate();
            if (!result) {
                setDrafts(null);
                setState("empty");
                return;
            }
            setDrafts(result);
            setState("ready");
        } catch {
            setDrafts(null);
            setState("error");
        }
    }, [props.onGenerate]);

    const smallButton: React.CSSProperties = {
        padding: "4px 10px",
        fontSize: 11,
        border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
        background: "transparent",
        borderRadius: 4,
        cursor: "pointer",
    };

    const applyRow = (
        label: string,
        draft: string,
        current: string,
        apply: (next: string) => void,
        key: "prompt" | "guidance",
    ) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, minWidth: 150 }}>{label}</span>
            {applied[key] ? (
                <span style={{ fontSize: 11, opacity: 0.7 }}>Applied — edit it below.</span>
            ) : current.trim() ? (
                <>
                    <button type="button" style={smallButton} onClick={() => { apply(draft); setApplied(a => ({ ...a, [key]: true })); }}>
                        Replace existing
                    </button>
                    <button type="button" style={smallButton} onClick={() => { apply(`${current.trimEnd()}\n\n${draft}`); setApplied(a => ({ ...a, [key]: true })); }}>
                        Append below existing
                    </button>
                </>
            ) : (
                <button type="button" style={smallButton} onClick={() => { apply(draft); setApplied(a => ({ ...a, [key]: true })); }}>
                    Apply
                </button>
            )}
        </div>
    );

    return (
        <div
            style={{
                display: "grid",
                gap: 8,
                padding: "10px 12px",
                border: "1px dashed var(--pp-border, rgba(0,0,0,0.18))",
                borderRadius: 6,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Generate prompts from data context</span>
                <button
                    type="button"
                    style={{ ...smallButton, opacity: props.onGenerate ? 1 : 0.5 }}
                    disabled={!props.onGenerate || state === "loading"}
                    title={props.onGenerate
                        ? "Draft the insights prompt + domain guidance from the connected data's measures, dimensions, and KPIs"
                        : "Select an AI provider first"}
                    onClick={run}
                >
                    {state === "loading" ? "Reading data context…" : drafts ? "Regenerate" : "Generate from data context"}
                </button>
            </div>
            {state === "idle" && (
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Drafts the two prompt fields below from the connected data (measures, dimensions, KPI definitions).
                    Deterministic — no AI call, nothing invented. You review and edit before saving.
                </span>
            )}
            {state === "empty" && (
                <span style={{ fontSize: 11, color: "var(--pp-error, #c92a2a)" }}>
                    No data context available yet. Connect a backend (Test Connection) or type an Analytics
                    domain above, then try again.
                </span>
            )}
            {state === "error" && (
                <span style={{ fontSize: 11, color: "var(--pp-error, #c92a2a)" }}>
                    Draft generation failed unexpectedly. Check that the proxy is running, then retry.
                </span>
            )}
            {state === "ready" && drafts && (
                <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Drafted from: {drafts.summary}</span>
                    {applyRow("Custom insights prompt", drafts.insightsPrompt, props.currentInsightsPrompt, props.onApplyInsightsPrompt, "prompt")}
                    {applyRow("Domain guidance", drafts.guidance, props.currentGuidance, props.onApplyGuidance, "guidance")}
                    <details>
                        <summary style={{ cursor: "pointer", fontSize: 11, opacity: 0.8 }}>Preview drafts</summary>
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: "6px 0 0", opacity: 0.85 }}>
                            {`── Custom insights prompt ──\n${drafts.insightsPrompt}\n\n── Domain guidance ──\n${drafts.guidance}`}
                        </pre>
                    </details>
                </div>
            )}
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
    /** Optional trailing affordance beside the label (e.g. an ⓘ HelpTip). */
    help?: React.ReactNode;
    onChange: (next: string) => void;
}): React.ReactElement {
    return (
        <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {props.label}
                {props.help}
            </span>
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
    // This background has to stay theme-aware. A hardcoded near-white value
    // here made every settings select/input/textarea white-on-white in dark
    // mode (inherited light --pp-text). --pp-surface-raised is #fff in
    // light, #1c2128 in dark, so text stays legible in both.
    background: "var(--pp-surface-raised, #fff)",
    boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04)",
    color: "var(--pp-text, #0f172a)",
    fontSize: 12,
};

// Supervisor fan-out table (read-only)

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

// Supervisor probe matrix

interface ProbeState {
    space: string;
    kind: "idle" | "loading" | "ok" | "error";
    durationMs?: number;
    message?: string;
    inferredPack?: string | null;
}

const SUPERVISOR_STAGGER_MS = 2000; // see docs/adr/0003-supervisor-stagger.md

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

        // Staggered parallel launch: each probe starts SUPERVISOR_STAGGER_MS
        // after the previous so a thundering herd doesn't spike the proxy.
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

// Small deep-link button

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
