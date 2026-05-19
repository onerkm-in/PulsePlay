// playground/src/settings/SettingsShell.tsx
//
// Full-page Settings surface. Mounted by App.tsx when the URL matches
// /settings*. All structural styles live in settings.css (class-based).
// Layout per docs/SETTINGS_SPEC.md § 3.

import { useEffect, useMemo, useRef, useState } from "react";
import {
    navigateToApp,
    navigateToSettings,
    parseSettingsRoute,
    SETTINGS_GROUP_IDS,
    useSettingsRoute,
    type SettingsGroupId,
} from "./settingsRoute";
import { useSettings } from "./settingsStore";
import { useEmbedConfig } from "./embedConfigStore";
import { getSetupReadiness } from "./setupReadiness";
import { BiGroup, leafSlug } from "./groups/BiGroup";
import { SetupGroup } from "./groups/SetupGroup";
import { AiGroup } from "./groups/AiGroup";
import { PreferencesGroup } from "./groups/PreferencesGroup";
import { SystemGroup } from "./groups/SystemGroup";
import { AdvancedGroup } from "./groups/AdvancedGroup";
import { useSettingsDraft } from "./useSettingsDraft";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { AiKnowledgeBase } from "./groups/sub/AiKnowledgeBase";
import { AiSupervisorFusion } from "./groups/sub/AiSupervisorFusion";
import { PreferencesAppearance } from "./groups/sub/PreferencesAppearance";
import { SystemDeveloper } from "./groups/sub/SystemDeveloper";
import { BiGovernance } from "./groups/sub/BiGovernance";
import "./settings.css";

const GROUP_LABELS: Record<SettingsGroupId, string> = {
    setup:       "Setup",
    bi:          "BI",
    ai:          "AI",
    preferences: "Preferences",
    system:      "System",
    advanced:    "Advanced",
};

const GROUP_DESCRIPTIONS: Record<SettingsGroupId, string> = {
    setup:       "Get PulsePlay ready in two short steps",
    bi:          "Pick a BI tool and wire its embed",
    ai:          "Configure the assistant powering Insights and Ask Pulse",
    preferences: "Layout, visible panels, and display policy",
    system:      "Network, governance, and diagnostics",
    advanced:    "Developer tools and reset utilities",
};

const GROUP_ICONS: Record<SettingsGroupId, string> = {
    setup:       "✦",
    bi:          "⬡",
    ai:          "◈",
    preferences: "◉",
    system:      "⬢",
    advanced:    "⚙",
};

// Decorative rail glyph CSS spacing — rendered via the .pp-settings-rail__glyph
// class so the visible label keeps a clean accessible name. Inline margin is
// kept here rather than the CSS file to avoid pulling settings.css on every
// rail render; tiny enough to inline.
// Accent color for the readiness dot on each rail item.
const READINESS_DOT: Record<"ready" | "needed" | "info", string> = {
    ready:  "#10b981",
    needed: "#ef4444",
    info:   "rgba(0, 0, 0, 0.18)",
};

const READINESS_LABEL: Record<"ready" | "needed" | "info", string> = {
    ready:  "Ready",
    needed: "Setup needed",
    info:   "Informational",
};

export const GROUP_LEAF_LABELS: Record<SettingsGroupId, string[]> = {
    // Setup uses inline FieldCards (BI tool / AI brain / Knowledge pack) rather
    // than the per-leaf navigation pattern — search still finds it via the
    // group label + description.
    setup: [],
    bi: ["Provider", "Embed", "Authentication", "Canvas", "Status", "Governance"],
    ai: ["Provider", "Model / Agent", "Knowledge pack", "Knowledge Base", "Vector Search KB", "Connection test", "Response behavior", "Supervisor Fusion", "UC Metric View", "Browse library"],
    preferences: [
        "UI mode",
        "Layout preset",
        "Visible panels",
        "AI position",
        "AI surfaces",
        "Research Agent traces",
        "Managed agent surface",
        "BI composition",
        "Canvas tiles",
        "Appearance",
    ],
    system: ["Proxy status", "Network and auth", "Security posture", "License posture", "Profile inventory", "Diagnostics", "Setup wizard", "Export support bundle", "Developer Tools"],
    advanced: ["Local storage inspector", "Reset section", "Reset all", "Danger zone"],
};

export function SettingsShell(): React.ReactElement {
    const route = useSettingsRoute();
    const settings = useSettings();
    const { embedConfig } = useEmbedConfig();
    const draft = useSettingsDraft();
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [search, setSearch] = useState("");

    const readiness = useMemo(
        () => getSetupReadiness({
            biVendor: settings.biVendor,
            embedConfig,
            activeAiProfile: settings.activeAiProfile,
        }),
        [settings.biVendor, embedConfig, settings.activeAiProfile],
    );

    const readinessByGroup: Record<SettingsGroupId, "ready" | "needed" | "info"> = useMemo(() => ({
        setup:       readiness.ready   ? "ready" : "needed",
        bi:          readiness.biReady ? "ready" : "needed",
        ai:          readiness.aiReady ? "ready" : "needed",
        preferences: "info",
        system:      "info",
        advanced:    "info",
    }), [readiness.ready, readiness.biReady, readiness.aiReady]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                navigateToApp();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "/") {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        if (!route.isSettingsRoute || !route.leaf) return;
        const wanted = leafSlug(route.leaf);
        if (!wanted) return;
        const id = window.requestAnimationFrame(() => {
            const target = document.getElementById(`settings-${route.group}-${wanted}`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                target.setAttribute("data-leaf-just-scrolled", "true");
                setTimeout(() => target.removeAttribute("data-leaf-just-scrolled"), 2000);
            }
        });
        return () => window.cancelAnimationFrame(id);
    }, [route.isSettingsRoute, route.group, route.leaf]);

    const filteredGroups = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return SETTINGS_GROUP_IDS;
        return SETTINGS_GROUP_IDS.filter(id => {
            const groupMatches =
                GROUP_LABELS[id].toLowerCase().includes(needle) ||
                GROUP_DESCRIPTIONS[id].toLowerCase().includes(needle);
            const leafMatches = GROUP_LEAF_LABELS[id].some(label => label.toLowerCase().includes(needle));
            return groupMatches || leafMatches;
        });
    }, [search]);

    return (
        <div className="pp-settings">
            <style>{`@keyframes pp-save-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.35)}}`}</style>
            <SettingsHeader />
            <SettingsSearchBar
                inputRef={searchInputRef}
                value={search}
                onChange={setSearch}
                resultsCount={filteredGroups.length}
            />
            <SettingsStatusStrip />
            <div className="pp-settings-body">
                <SettingsLeftRail
                    activeGroup={route.group}
                    activeLeaf={route.leaf}
                    visibleGroups={filteredGroups}
                    settingsLoaded={!settings.allowlistLoading}
                    hasOrphans={settings.orphans.length > 0}
                    readinessByGroup={readinessByGroup}
                />
                <main className="pp-settings-main" aria-live="polite">
                    <ActiveGroup group={route.group} leaf={route.leaf} />
                </main>
            </div>
            <SettingsSaveBar draft={draft} />
        </div>
    );
}

// ─── Header ──────────────────────────────────────────────────────

function SettingsHeader(): React.ReactElement {
    return (
        <header className="pp-settings-header">
            <div className="pp-settings-header__brand">
                <h1 className="pp-settings-header__title">
                    {/* Decorative settings glyph — Codex naming audit:
                      * keep visual but never duplicate or pollute the
                      * accessible name. SVG cog replaces the U+2699 "⚙"
                      * character so text-content snapshots don't pick
                      * it up. */}
                    <span className="pp-settings-header__title-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </span>
                    Settings
                </h1>
                <p className="pp-settings-header__subtitle">
                    Configure how PulsePlay looks, what it embeds, and how it reasons.
                </p>
            </div>
            <button
                type="button"
                className="pp-settings-header__back"
                onClick={navigateToApp}
                title="Return to the playground (Esc)"
            >
                {/* Decorative arrow glyph kept as an SVG icon (aria-hidden);
                  * visible label is just "Back to app" so screen readers
                  * + text snapshots stay clean. */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to app
            </button>
        </header>
    );
}

// ─── Search ──────────────────────────────────────────────────────

interface SettingsSearchBarProps {
    value: string;
    onChange: (next: string) => void;
    resultsCount: number;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

function SettingsSearchBar(props: SettingsSearchBarProps): React.ReactElement {
    const { value, onChange, resultsCount, inputRef } = props;
    const totalLeafCount = useMemo(
        () => SETTINGS_GROUP_IDS.reduce((sum, id) => sum + GROUP_LEAF_LABELS[id].length, 0),
        [],
    );
    const isMac = useMemo(() => {
        if (typeof navigator === "undefined") return false;
        return /Mac|iPad|iPhone|iPod/.test(navigator.platform || navigator.userAgent || "");
    }, []);

    return (
        <div className="pp-settings-search">
            <div className="pp-settings-search__wrap">
                <span className="pp-settings-search__icon" aria-hidden="true">🔍</span>
                <input
                    ref={inputRef}
                    type="search"
                    className="pp-settings-search__input"
                    placeholder={`Search ${totalLeafCount} settings across 6 groups…`}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    aria-label="Search settings"
                />
                <kbd className="pp-settings-search__kbd" aria-hidden="true">
                    {isMac ? "⌘ /" : "Ctrl /"}
                </kbd>
            </div>
            {value && (
                <span className="pp-settings-search__count">
                    {resultsCount} group{resultsCount === 1 ? "" : "s"} matched
                </span>
            )}
        </div>
    );
}

// ─── Status strip ────────────────────────────────────────────────

function SettingsStatusStrip(): React.ReactElement {
    const { allowlist, allowlistLoading, allowlistError, biVendor, packSelection, activeAiProfile, orphans } = useSettings();
    const { embedConfig } = useEmbedConfig();
    const setupReadiness = getSetupReadiness({ biVendor, embedConfig, activeAiProfile });

    const biStatus = orphans.some(o => o.key === "pulseplay:bi-vendor")
        ? "warn" : setupReadiness.biReady ? "ok" : "missing";
    const aiStatus = orphans.some(o => o.key === "pulseplay:active-ai-profile")
        ? "warn" : setupReadiness.aiReady ? "ok" : "missing";
    const packStatus = orphans.some(o => o.key === "pulseplay:pack-selection")
        ? "warn" : packSelection ? "ok" : "missing";
    const proxyStatus = allowlistError ? "warn" : allowlistLoading ? "loading" : "ok";
    const securityStatus = allowlist?.enforcement === "strict" ? "ok" : "warn";

    return (
        <div className="pp-settings-status">
            <Chip label="Setup"    status={setupReadiness.ready ? "ok" : "warn"} detail={setupReadiness.pillDetail} group="setup" />
            <Chip label="BI"       status={biStatus}       detail={biVendor ? formatVendorName(biVendor) : "Not configured"}    group="bi" />
            <Chip label="AI"       status={aiStatus}       detail={activeAiProfile ? formatProfileName(activeAiProfile) : "Not configured"} group="ai" />
            <Chip label="Pack"     status={packStatus}     detail={packSelection?.pack ? formatPackName(packSelection.pack) : "No knowledge source"} group="ai" leaf="knowledge-pack" />
            <Chip label="Proxy"    status={proxyStatus}    detail={allowlistError ? "Unreachable" : (allowlistLoading ? "Checking…" : "Connected")} group="system" leaf="proxy-status" />
            <Chip label="Security" status={securityStatus} detail={allowlist?.enforcement === "strict" ? "Enforced" : allowlist?.enforcement === "permissive" ? "Permissive" : "Unknown"} group="system" leaf="security-posture" />
        </div>
    );
}

type ChipStatus = "ok" | "warn" | "missing" | "loading";

function Chip(props: { label: string; status: ChipStatus; detail: string; group: SettingsGroupId; leaf?: string }): React.ReactElement {
    const target = props.leaf ? `${props.group} › ${props.label}` : `${props.label} group`;
    return (
        <button
            type="button"
            className={`pp-settings-chip pp-settings-chip--${props.status}`}
            onClick={() => navigateToSettings(props.group, props.leaf)}
            aria-label={`Jump to ${target}`}
            title={`Jump to ${target}`}
        >
            <span className="pp-settings-chip__dot" aria-hidden="true" />
            <span className="pp-settings-chip__label">{props.label}</span>
            <span className="pp-settings-chip__detail">{props.detail}</span>
        </button>
    );
}

// ─── Left rail ───────────────────────────────────────────────────

interface SettingsLeftRailProps {
    activeGroup: SettingsGroupId;
    visibleGroups: ReadonlyArray<SettingsGroupId>;
    settingsLoaded: boolean;
    hasOrphans: boolean;
    readinessByGroup: Record<SettingsGroupId, "ready" | "needed" | "info">;
}

function SettingsLeftRail(props: SettingsLeftRailProps & { activeLeaf?: string | null }): React.ReactElement {
    return (
        <nav className="pp-settings-rail" aria-label="Settings sections">
            {props.visibleGroups.map(id => {
                const active = id === props.activeGroup;
                const readiness = props.readinessByGroup[id];
                const showOrphan = (id === "setup" || id === "advanced") && props.hasOrphans;
                const subLeaves = GROUP_LEAF_LABELS[id];
                return (
                    <div key={id} className="pp-settings-rail__group">
                        <button
                            type="button"
                            className={`pp-settings-rail__item${active ? " pp-settings-rail__item--active" : ""}`}
                            onClick={() => navigateToSettings(id)}
                            aria-current={active ? "page" : undefined}
                        >
                            <div className="pp-settings-rail__item-row">
                                <span className="pp-settings-rail__item-left">
                                    <span
                                        className="pp-settings-rail__dot"
                                        aria-label={READINESS_LABEL[readiness]}
                                        title={READINESS_LABEL[readiness]}
                                        style={{ background: active ? undefined : READINESS_DOT[readiness] }}
                                    />
                                    {/* Decorative glyph hidden from screen readers; visible label
                                  * carries the accessible name. Codex 2026-05-19 naming audit:
                                  * "use real icon components with aria-hidden where decorative". */}
                                <span aria-hidden="true" className="pp-settings-rail__glyph">{GROUP_ICONS[id]}</span>
                                <span>{GROUP_LABELS[id]}</span>
                                </span>
                                {showOrphan && (
                                    <span className="pp-settings-rail__orphan-badge" aria-label="Orphaned settings">
                                        Orphans
                                    </span>
                                )}
                            </div>
                            <div className="pp-settings-rail__desc">
                                {GROUP_DESCRIPTIONS[id]}
                            </div>
                        </button>
                        {active && subLeaves.length > 0 && (
                            <div className="pp-settings-rail__sub" role="list">
                                {subLeaves.map(label => {
                                    const slug = leafSlugify(label);
                                    const subActive = props.activeLeaf === slug;
                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                            role="listitem"
                                            className={`pp-settings-rail__subitem${subActive ? " pp-settings-rail__subitem--active" : ""}`}
                                            onClick={() => navigateToSettings(id, slug)}
                                            aria-current={subActive ? "page" : undefined}
                                        >
                                            <span className="pp-settings-rail__subdot" aria-hidden="true" />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            {!props.settingsLoaded && (
                <div className="pp-settings-rail__loading">Loading allowlist…</div>
            )}
        </nav>
    );
}

function leafSlugify(label: string): string {
    return label.toLowerCase()
        .replace(/[↗→]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// Codex 2026-05-19 naming audit: status chips were exposing raw enum keys
// like `powerbi`, `default`, `strict`, `ok` as primary visible copy. These
// helpers map them to friendly product names so the strip reads like a
// status summary, not a debug dump.
const VENDOR_DISPLAY: Record<string, string> = {
    "powerbi":          "Power BI",
    "databricks-aibi":  "Databricks AI/BI",
    "databricks-genie": "Databricks Genie",
    "tableau":          "Tableau",
    "qlik":             "Qlik Sense",
    "looker":           "Looker",
    "generic-iframe":   "Generic iframe",
};

function formatVendorName(vendor: string): string {
    return VENDOR_DISPLAY[vendor] ?? vendor;
}

function formatProfileName(profile: string): string {
    // Profile keys are user-facing slugs (default / supervisor / foundation-stream).
    // Map known internal names to friendlier display; otherwise capitalize words.
    const known: Record<string, string> = {
        "default":           "Default profile",
        "supervisor":        "Supervisor",
        "foundation-stream": "Foundation Model",
    };
    if (known[profile]) return known[profile];
    return profile.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPackName(pack: string): string {
    // Pack names are usually slug-cased (cpg-fmcg, retail, financial-services).
    // Title-case them; consumers can override with allowlist.packs metadata later.
    return pack.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Active group resolver ───────────────────────────────────────

function ActiveGroup(props: { group: SettingsGroupId; leaf?: string | null }): React.ReactElement {
    // Sub-route dispatch — when leaf matches a dedicated sub-page, render
    // that instead of the parent group. Leaves without a dedicated handler
    // fall through and rely on the group's own scroll-into-view behavior.
    if (props.group === "ai"          && props.leaf === "knowledge-base")    return <AiKnowledgeBase />;
    if (props.group === "ai"          && props.leaf === "supervisor-fusion") return <AiSupervisorFusion />;
    if (props.group === "preferences" && props.leaf === "appearance")        return <PreferencesAppearance />;
    if (props.group === "system"      && props.leaf === "developer-tools")   return <SystemDeveloper />;
    if (props.group === "bi"          && props.leaf === "governance")        return <BiGovernance />;
    switch (props.group) {
        case "setup":       return <SetupGroup />;
        case "bi":          return <BiGroup />;
        case "ai":          return <AiGroup />;
        case "preferences": return <PreferencesGroup />;
        case "system":      return <SystemGroup />;
        case "advanced":    return <AdvancedGroup />;
        default:            return <SetupGroup />;
    }
}

export function __resolveActiveGroup(pathname: string): SettingsGroupId {
    return parseSettingsRoute(pathname).group;
}
