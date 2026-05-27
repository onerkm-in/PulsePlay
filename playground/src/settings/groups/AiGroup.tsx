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
import { listMetricViews, type MetricViewSummary } from "../../lib/databricksAssets";
import type { ConnectorProbeResult } from "../../types/probe";
import { navigateToPowerBiQna } from "../../powerbi/PowerBiQnARoute";
import { ConnectorBrandGrid } from "../../setup/ConnectorBrandGrid";
import {
    usePulseAiVisualSettings,
    type PulseAiVisualSettings,
    type PulseEnabledFeatures,
    type PulseInsightsAuthoringMode,
} from "../pulseVisualSettingsStore";
import { AiAssistedSuggestionPanel, CustomSectionPresetPicker, MetricDirectionPresetPicker } from "../../pulse/setupStep5";
import { suggestInsightsConfigViaProxy } from "../../lib/insightsSuggestClient";
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
    // Cycle 17 — surface a launch button to /powerbi/qna when the active
    // assistant is a Power BI semantic-model profile. Route + token-mint
    // landed in cycle 15.5; this just exposes the entry point.
    const isPowerBiSemanticModel =
        !!activeProfileMeta && activeProfileMeta.type === "powerbi-semantic-model";
    const vectorSearchDetail = databricksCapabilities.details.vectorSearch;
    const vectorSearchReady = databricksCapabilities.capabilities.vectorSearch === true && (vectorSearchDetail?.count || 0) > 0;

    // UX-ARCH-0B.2 Phase D 2026-05-23 — progressive setup state for the
    // AI Setup page header. Three gates: connector picked, pack picked,
    // assistant test-connection passed. Each gate is glanceable as a small
    // numbered pill so the user sees at-a-glance what's left without
    // scrolling. Mirrors the legacy `/settings/setup` AI-side checklist
    // but in-place inside the page that absorbs that checklist.
    const aiSetupGates = [
        { n: 1, label: "Connector",       done: !!activeAiProfile,        hint: "Pick from the catalogue below" },
        { n: 2, label: "Knowledge pack",  done: !!packSelection?.pack,    hint: "Optional but recommended" },
        { n: 3, label: "Ready to ask",    done: !!activeAiProfile,        hint: "Auto-completes when a connector is active" },
    ];
    const completedGates = aiSetupGates.filter(g => g.done).length;

    // 2026-05-27 — aiIntroText now lives in the HelpTip body directly
    // (see AI Setup header below). Raw title-based info button retired
    // per Codex audit P0.

    // UX-ARCH-0B.2 Phase F 2026-05-23 — universal progressive-section
    // pattern: numbered bookmark chips at top, numbered collapsible cards
    // below. Default is "all sections expanded" so a returning author sees
    // every control they configured without re-expanding each time; the
    // collapse affordance is opt-in for de-cluttering. Jump-to-section
    // (bookmark click) just scrolls — doesn't toggle — so users don't lose
    // context they had open elsewhere.
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
            {/* UX-ARCH-0B.2 follow-up 2026-05-23 — h2 + intro paragraph now
                visually hidden. The page already shows "Settings" + gear at
                top and the rail marks the active group; a duplicate "AI Setup"
                heading was wasted space. Intro text lives on the (i) button's
                tooltip + the gate ribbon's own labels carry the same scope info. */}
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
                    {/* 2026-05-27 — raw title-based `i` replaced with shared
                        HelpTip (Codex audit P0). */}
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
                {/* Phase F — bookmark navigation for the 5 progressive
                    sections below. Mirrors the SetupGroup pattern users
                    flagged as "slick design". */}
                <div style={{ marginTop: 12 }}>
                    <BookmarkNav
                        sections={aiBookmarks}
                        onJump={(id) => jumpToAiSection(id)}
                        ariaLabel="AI Setup sections"
                    />
                </div>
            </header>

            {/* ─── Cycle 20 / S1: Connector catalogue (brand grid) ──────
              * Surfaces ALL 12 connector types from /api/assistant/connector-types
              * regardless of whether they're configured. Each card has a
              * three-state status (Active / Configured-degraded / Available
              * not wired) and a copy-paste config snippet. Drop a new manifest
              * into proxy/lib/connectorManifests.js → a new card appears here
              * without any UI code change.
              *
              * Lives ABOVE the existing Assistant tier so users see the full
              * menu of providers before picking one. The legacy Provider
              * picker below stays as the "configured profiles only" shortcut
              * for users who already know which profile they want.
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

            {/* ─── Tier 1: Assistant — who is answering ─────────────────
              * 2026-05-19 Codex IA restructure: pick the assistant (provider,
              * model/agent) and prove it can answer. Sits ahead of any
              * context or response tuning because nothing else matters until
              * a working assistant is wired.
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

            {/* ── Provider picker removed 2026-05-20 (cycle 20 follow-up) ──
              * The Connector catalogue above renders all 12 connectors with
              * clickable configured-profile buttons; selecting one fires the
              * same setActiveAiProfile() that the legacy ProviderPicker did.
              * Keeping both surfaces showed duplicate Provider UI; the
              * catalogue is the single source.
              *
              * Orphan banner moved up so it still surfaces when a stale
              * pulseplay:active-ai-profile localStorage key references a
              * removed profile.
              */}
            {aiOrphan && <OrphanBanner reason={aiOrphan.reason} />}

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

            {/* ── Connection test ──────────────────────────────────────
              * Kept inside the Assistant tier — the connection IS part of
              * "who is answering". Moved here from the legacy "Test and
              * validate" tier so authors don't have to scroll past unrelated
              * sections to verify the assistant is reachable.
              */}
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

            {/* ── Power BI Q&A launch (cycle 17, conditional after cycle 20) ─
              * Renders ONLY when the active profile is `powerbi-semantic-model`.
              * The launch button opens the full-page Q&A surface at /powerbi/qna.
              * The proxy mints the dataset-scoped embed token; PulsePlay makes
              * zero LLM calls on this path.
              *
              * 2026-05-20 cycle 20 cleanup: the "wrong-profile" disabled state
              * was removed because the Connector catalogue above now hosts the
              * Power BI Q&A brand card with the same config snippet for users
              * who aren't on a PBI semantic-model profile. Keeping both was
              * pure duplication.
              */}
            {isPowerBiSemanticModel && (
                <Leaf
                    group="ai"
                    label="Power BI Q&A"
                    helper="Open Microsoft's natural-language Q&A surface bound to this dataset. The token mint stays server-side; PulsePlay makes no LLM call on this path. Microsoft is retiring Q&A on 31 Dec 2026 — for durable PBI natural-language work, use the powerbi-semantic-model deterministic DAX path."
                >
                    {/* 2026-05-22 — EOL countdown chip per the research-
                     *  first finding. Microsoft officially deprecated Power
                     *  BI Q&A on 2025-12-01 with hard end-of-life
                     *  2026-12-31. Full research with 24 URL signatures in
                     *  docs/research/EXTERNAL_REFERENCES.md "Power BI Q&A
                     *  readiness assessment + deprecation finding". */}
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

            {/* ── Knowledge pack (Domain knowledge) ──────────────────── */}
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

// ─── AI Insights settings editor ────────────────────────────────────────

function PulseAiInsightsSettingsPanel(props: {
    value: PulseAiVisualSettings;
    onChange: (patch: Partial<PulseAiVisualSettings>) => void;
    activeAiProfile: string;
    packSelection: PackSelection | null;
}): React.ReactElement {
    const { value, onChange } = props;
    const resolvedProfile = (value.assistantProfile || props.activeAiProfile || "").trim();
    const onSuggest = useCallback(async () => {
        if (!resolvedProfile) return null;
        return suggestInsightsConfigViaProxy({
            profile: resolvedProfile,
            pack: props.packSelection?.pack,
            subVertical: props.packSelection?.subVertical,
            domainHint: value.insightsDomain || undefined,
        });
    }, [resolvedProfile, props.packSelection?.pack, props.packSelection?.subVertical, value.insightsDomain]);

    // 2026-05-28 — read the cached discovery snapshot so the metric
    // direction auto-detect chip can render. Cache-first; if it's been
    // fetched recently by App or UnifiedAssistantSurface, this is
    // synchronous via sessionStorage. No prefetch from Settings — we
    // only show the chip when discovery already ran elsewhere.
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
            .catch(() => { /* swallow — chip just stays hidden */ });
        return () => { cancelled = true; };
    }, [resolvedProfile, props.packSelection?.pack, props.packSelection?.subVertical]);

    // 2026-05-28 — primary signal: BI adapter's visibleMeasures (Power BI
    // SDK, Tableau Embedding API, etc.). When the adapter doesn't expose
    // metadata (Genie-only profiles, iframe-only vendors), fall back to
    // fused.availableKpis — KPIs the discovery loop synthesized from the
    // pack + probe results + any bi-surface signals. Dedup by upper-cased
    // name so a metric in both sources doesn't generate duplicate rules.
    const measureNames = useMemo(() => {
        const fromBiMetadata = (snapshot?.sources?.biMetadata?.visibleMeasures ?? [])
            .map(m => m?.name || "")
            .filter(s => s.trim().length > 0);
        if (fromBiMetadata.length > 0) return fromBiMetadata;
        const fromAvailableKpis = (snapshot?.fused?.availableKpis ?? [])
            .map(k => k?.name || "")
            .filter(s => s.trim().length > 0);
        // Dedup case-insensitively while preserving the first appearance's
        // original casing for the rules string output.
        const seen = new Set<string>();
        const out: string[] = [];
        for (const name of fromAvailableKpis) {
            const key = name.trim().toUpperCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name.trim());
        }
        return out;
    }, [snapshot]);
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

            {/* 2026-05-28 — port the CustomSectionPresetPicker from setupStep5
              * (PulseShell PBI format pane) into PulsePlay-native Settings.
              * Closes parity gap reported in live test: "where can I select
              * the strategy like SWOT or BCG etc but I don't see that
              * dropdown selection." Same component, same preset library
              * (insightsPresetLibrary.ts — SWOT/BCG/RFM/Pareto + pack
              * presets), same parameter editor. */}
            <Leaf
                group="ai"
                label="Custom sections preset library"
                summary="SWOT / BCG / RFM / Pareto / pack-specific presets — pick one to populate the Custom sections JSON below. Bundled metric direction rules (when the preset declares them) auto-apply to the Metric direction field too."
            >
                <CustomSectionPresetPicker
                    currentDomain={value.insightsDomain}
                    onApplyDomain={insightsDomain => onChange({ insightsDomain })}
                    onApplySections={insightsCustomSections => onChange({ insightsCustomSections })}
                    onApplyMetricRules={metricDirectionRules => onChange({ metricDirectionRules })}
                />
            </Leaf>

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
                <MetricDirectionPresetPicker
                    currentDomain={value.insightsDomain}
                    onApplyDomain={insightsDomain => onChange({ insightsDomain })}
                    onApplyRules={metricDirectionRules => onChange({ metricDirectionRules })}
                />
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

// ProviderPicker — removed 2026-05-20 cycle 20 cleanup. The Connector
// catalogue's brand cards now host the same chip-style picker via their
// configured-profile buttons, and a single Provider UI is less confusing
// than two surfaces fighting for the same job. Git history preserves the
// component if it's ever needed again.

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
