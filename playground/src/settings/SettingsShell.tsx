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

// UX-ARCH-0B.2 Phase C — rail collapsed from 6 groups to 4 per user
// 2026-05-23 direction. Internal route IDs unchanged (so deep links + tests
// keep working) but the visible rail shows AI Setup / BI Setup / Advanced /
// Display. `setup` and `system` are hidden from the rail (absorbed by
// AI/BI Setup and Advanced respectively); their routes still resolve so
// existing handoff bundles and bookmarks don't break. The Phase D/E/F page
// rebuilds will physically merge content; this slice is nav-only.
const GROUP_LABELS: Record<SettingsGroupId, string> = {
    setup:       "Quick start",       // legacy route, hidden from rail
    bi:          "BI Setup",
    ai:          "AI Setup",
    preferences: "Display",
    system:      "System",            // legacy route, hidden from rail
    advanced:    "Advanced",
};

const GROUP_DESCRIPTIONS: Record<SettingsGroupId, string> = {
    setup:       "Legacy quick-start checklist (use AI Setup or BI Setup instead)",
    bi:          "BI vendor, embed, sandbox, governance — everything Y-axis",
    ai:          "Assistant, knowledge pack, AI Insights, Ask Pulse — everything X-axis",
    preferences: "Tabs, default landing, display policy",
    system:      "Legacy diagnostics (use Advanced instead)",
    advanced:    "Performance, developer tools, runtime guards, danger zone",
};

const GROUP_ICONS: Record<SettingsGroupId, string> = {
    setup:       "✦",
    bi:          "⬡",
    ai:          "◈",
    preferences: "◉",
    system:      "⬢",
    advanced:    "⚙",
};

// Phase C rail filter — order shown to users and which groups are HIDDEN.
// `setup` and `system` are not in this list (still routable for back-compat,
// just not in the rail). Order: AI Setup first (most users touch this most),
// BI Setup second, Advanced third, Display fourth.
const VISIBLE_RAIL_GROUPS: ReadonlyArray<SettingsGroupId> = [
    "ai",
    "bi",
    "advanced",
    "preferences",
];

// Phase C absorption map — when a search query matches a legacy group, the
// rail surfaces the absorbing destination instead. `setup` content is being
// split across AI Setup and BI Setup; for the nav-first phase it absorbs to
// AI Setup since that's where the connector+pack quick-start lives. `system`
// surfaces are diagnostic/dev (matches Advanced naturally).
const GROUP_ABSORPTION: Record<SettingsGroupId, SettingsGroupId> = {
    setup:       "ai",          // Phase D will split AI vs BI content explicitly
    bi:          "bi",
    ai:          "ai",
    preferences: "preferences",
    system:      "advanced",
    advanced:    "advanced",
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
    // 2026-05-20 cycle 20.1 follow-up — order MUST mirror the visual sequence
    // in groups/AiGroup.tsx so clicking a rail item scrolls to the matching
    // anchor in the main panel. Previous order interleaved Assistant-tier
    // leaves with Shared-context leaves which made the rail feel random.
    // Actual rendered order today:
    //   §Connector catalogue (SubSection)
    //   §Assistant
    //     Model / Agent → Connection test → (Power BI Q&A when active is PBI)
    //   §Shared context
    //     Knowledge pack → Vector Search KB → UC Metric View → Browse library
    //   §Response behavior
    //     Response behavior
    //   §Surface-specific behavior
    //     Supervisor Fusion → Knowledge Base
    ai: [
        "Connector catalogue",
        "Model / Agent",
        "Connection test",
        "Power BI Q&A",
        "Knowledge pack",
        "Vector Search KB",
        "UC Metric View",
        "Browse library",
        "Response behavior",
        // 2026-05-28 — preset pickers ported from setupStep5.tsx (the
        // PulseShell PBI format pane) into PulsePlay-native Settings.
        // Closes parity gap: "where is the SWOT/BCG preset dropdown."
        "Custom sections preset library",
        "Metric direction preset library",
        // 2026-05-28 — Slice 2: markdown section authoring (## Section + prompt).
        "AI Insights sections",
        // 2026-05-28 — Slice 3: SQL/config-item sections (warehouse-backed).
        "SQL sections",
        "Supervisor Fusion",
        "Knowledge Base",
    ],
    // PreferencesGroup.tsx renders: Tabs (Visible tabs + Default landing
    // tab) → Display policy (Canvas tiles).
    preferences: [
        // 2026-05-25 (Commit 2 of per-tab-visibility ship) — collapsed
        // 7 redundant pickers (Layout preset / Visible panels / AI position
        // / Mix-composition AI surfaces / Research Agent traces / Managed
        // agent / BI composition) into ONE per-tab-visibility control.
        // The PulseShell 3-tab strip is the sole canonical layout; per-tab
        // visibility decides which of AI Insights / Ask Pulse / Dashboard
        // render. Removed leaves are not relocated; advanced toggles
        // (Research Agent traces, etc.) move to Settings → AI in a
        // follow-up commit.
        // 2026-05-28 — author-only Workbench template picker (tabs +
        // landing + scope + section preset bundled per named template).
        "Workbench template",
        "Visible tabs",
        "Default landing tab",
        // 2026-05-28 — author gate for the Chat (v0) surface. Workbench is
        // the default; this exposes the optional Workbench⇄Chat switcher.
        "Chat surface",
        "Canvas tiles",
        "Appearance",
    ],
    system: ["Proxy status", "Network and auth", "Security posture", "License posture", "Profile inventory", "Diagnostics", "Setup wizard", "Export support bundle", "Developer Tools"],
    advanced: ["Performance levers", "Local storage inspector", "Reset section", "Reset all", "Danger zone"],
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
                return;
            }
            // 2026-05-20 cycle 20.1 — fallback for conditional leaves. Some
            // rail entries (e.g. "Power BI Q&A") map to a Leaf that only
            // renders for specific active profiles; when the Leaf isn't in
            // the DOM, scroll-to-anchor would silently no-op, leaving the
            // user on whatever section was previously visible. Fall back to
            // the Connector catalogue SubSection so they at least land on a
            // surface that lets them configure the connector.
            const catalogue = document.getElementById(`settings-${route.group}-connector-catalogue`);
            if (catalogue) {
                catalogue.scrollIntoView({ behavior: "smooth", block: "start" });
                catalogue.setAttribute("data-leaf-just-scrolled", "true");
                setTimeout(() => catalogue.removeAttribute("data-leaf-just-scrolled"), 2000);
            }
        });
        return () => window.cancelAnimationFrame(id);
    }, [route.isSettingsRoute, route.group, route.leaf]);

    const filteredGroups = useMemo(() => {
        const needle = search.trim().toLowerCase();
        // Phase C — rail shows 4 visible groups. When the user types in the
        // search box, we DO scan all 6 internal groups (including legacy
        // `setup` and `system`) so no settings disappear from discoverability
        // — but we only RETURN matches that resolve through the visible 4.
        // Legacy-group matches surface under their absorbing destination
        // (setup → ai, system → advanced) per the GROUP_ABSORPTION map below.
        if (!needle) return VISIBLE_RAIL_GROUPS;
        const visibleSet = new Set<SettingsGroupId>(VISIBLE_RAIL_GROUPS);
        const matched = new Set<SettingsGroupId>();
        for (const id of SETTINGS_GROUP_IDS) {
            const groupMatches =
                GROUP_LABELS[id].toLowerCase().includes(needle) ||
                GROUP_DESCRIPTIONS[id].toLowerCase().includes(needle);
            const leafMatches = GROUP_LEAF_LABELS[id].some(label => label.toLowerCase().includes(needle));
            if (!groupMatches && !leafMatches) continue;
            const dest = visibleSet.has(id) ? id : GROUP_ABSORPTION[id];
            matched.add(dest);
        }
        // Preserve the configured rail order (ai → bi → advanced → preferences).
        return VISIBLE_RAIL_GROUPS.filter(id => matched.has(id));
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
                {/* Audit 2026-05-19: was raw "🔍" emoji; replaced with the
                  * same SVG-icon discipline the header cog uses (and that the
                  * Codex 09:14 + 18:40 glyph sweeps applied to AI Insights /
                  * Knowledge / Sustainability). aria-hidden so screen readers
                  * still rely on the input's aria-label. */}
                <span className="pp-settings-search__icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </span>
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
    // UX-ARCH-0B.2 follow-up 2026-05-23 — rail leaves are now collapsible
    // per group. Default state is COLLAPSED so the rail stays compact even
    // when a group is active (the previous default of "auto-expand on active"
    // surfaced 11 leaves under AI Setup that nobody asked for). The user's
    // current section is still in view via the main page; the rail leaves
    // are just deep-link shortcuts. Track expanded state in memory; the
    // currently-active leaf forces its group expanded so a deep-link still
    // shows context.
    const [expandedGroups, setExpandedGroups] = useState<Set<SettingsGroupId>>(() => new Set());
    return (
        <nav className="pp-settings-rail" aria-label="Settings sections">
            {props.visibleGroups.map(id => {
                const active = id === props.activeGroup;
                const readiness = props.readinessByGroup[id];
                const showOrphan = (id === "setup" || id === "advanced") && props.hasOrphans;
                const subLeaves = GROUP_LEAF_LABELS[id];
                const hasActiveLeaf = active && !!props.activeLeaf;
                const isExpanded = expandedGroups.has(id) || hasActiveLeaf;
                const toggleExpanded = () => {
                    setExpandedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id); else next.add(id);
                        return next;
                    });
                };
                return (
                    <div key={id} className="pp-settings-rail__group">
                        <div className={`pp-settings-rail__item${active ? " pp-settings-rail__item--active" : ""}`} style={{ display: "flex", alignItems: "stretch", padding: 0 }}>
                            <button
                                type="button"
                                onClick={() => navigateToSettings(id)}
                                aria-current={active ? "page" : undefined}
                                style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", padding: "8px 4px 8px 12px", cursor: "pointer", color: "inherit", font: "inherit" }}
                            >
                                <div className="pp-settings-rail__item-row">
                                    <span className="pp-settings-rail__item-left">
                                        <span
                                            className="pp-settings-rail__dot"
                                            aria-label={READINESS_LABEL[readiness]}
                                            title={READINESS_LABEL[readiness]}
                                            style={{ background: active ? undefined : READINESS_DOT[readiness] }}
                                        />
                                        <span aria-hidden="true" className="pp-settings-rail__glyph">{GROUP_ICONS[id]}</span>
                                        <span>{GROUP_LABELS[id]}</span>
                                    </span>
                                    {showOrphan && (
                                        <span className="pp-settings-rail__orphan-badge" aria-label="Orphaned settings">
                                            Orphans
                                        </span>
                                    )}
                                </div>
                            </button>
                            {subLeaves.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleExpanded}
                                    aria-label={isExpanded ? `Collapse ${GROUP_LABELS[id]} leaves` : `Expand ${GROUP_LABELS[id]} leaves`}
                                    aria-expanded={isExpanded}
                                    title={isExpanded ? "Collapse" : `Show ${subLeaves.length} shortcuts`}
                                    style={{
                                        width: 28,
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        color: "var(--pp-text-muted, #6b7280)",
                                        fontSize: 10,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "transform 120ms ease",
                                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                    }}
                                >
                                    ▶
                                </button>
                            )}
                        </div>
                        {isExpanded && subLeaves.length > 0 && (
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

    // Phase C migration banner — legacy `setup` and `system` groups are
    // being absorbed (Phase D folds Setup quick-start checklist into
    // AI/BI Setup; Phase F folds System diagnostics + dev tools into
    // Advanced). Show a one-row banner so users landing on legacy deep
    // links know where the content is heading.
    switch (props.group) {
        case "setup":
            return (
                <>
                    <LegacyGroupBanner kind="setup" />
                    <SetupGroup />
                </>
            );
        case "system":
            return (
                <>
                    <LegacyGroupBanner kind="system" />
                    <SystemGroup />
                </>
            );
        case "bi":          return <BiGroup />;
        case "ai":          return <AiGroup />;
        case "preferences": return <PreferencesGroup />;
        case "advanced":    return <AdvancedGroup />;
        default:            return <AiGroup />;
    }
}

function LegacyGroupBanner(props: { kind: "setup" | "system" }): React.ReactElement {
    const dest = props.kind === "setup"
        ? { label: "AI Setup or BI Setup", id: "ai" as const }
        : { label: "Advanced", id: "advanced" as const };
    return (
        <div
            role="status"
            style={{
                margin: "0 0 16px",
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.30)",
                borderLeft: "3px solid rgba(245, 158, 11, 0.85)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--pp-text, #111827)",
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
            }}
        >
            <span aria-hidden="true">⚠</span>
            <span style={{ flex: 1, minWidth: 240 }}>
                This page is being folded into <strong>{dest.label}</strong>. Existing
                deep links keep working; the rebuilt view is being rolled out
                progressively. Open the new home →
            </span>
            <button
                type="button"
                onClick={() => navigateToSettings(dest.id)}
                style={{
                    padding: "4px 12px",
                    background: "var(--pp-accent, #2563eb)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                }}
            >
                Go to {dest.label}
            </button>
        </div>
    );
}

export function __resolveActiveGroup(pathname: string): SettingsGroupId {
    return parseSettingsRoute(pathname).group;
}
