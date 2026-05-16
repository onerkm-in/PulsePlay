// playground/src/settings/SettingsShell.tsx
//
// Full-page Settings surface. Mounted by App.tsx when the URL matches
// /settings*. Layout per docs/SETTINGS_SPEC.md § 3:
//
//   - Header strip: brand + Back-to-app button + Esc to close
//   - Search box (Cmd/Ctrl+/ to focus, Phase 2 filters by leaf label)
//   - Status strip: setup/readiness + BI · AI · Pack · Proxy · Security
//   - Left rail: Setup + BI + AI + Preferences + System + Advanced
//   - Content pane: renders the active group
//
// Search is intentionally lightweight in Phase 2 (substring match on group
// labels + leaf labels rendered today). It becomes load-bearing when leaf
// count crosses ~25 (SETTINGS_SPEC § 9).

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

const GROUP_LABELS: Record<SettingsGroupId, string> = {
    setup: "Setup",
    bi: "BI",
    ai: "AI",
    preferences: "Preferences",
    system: "System",
    advanced: "Advanced",
};

const GROUP_DESCRIPTIONS: Record<SettingsGroupId, string> = {
    setup: "Make BI + AI ready",
    bi: "What you're looking at",
    ai: "What's thinking",
    preferences: "How the playground is laid out",
    system: "Is it safe, is anything broken",
    advanced: "Reset + destructive",
};

// Leaf labels must match the `<Leaf label="…">` props rendered in each
// group file verbatim. The drift-prevention test in
// __tests__/leafLabels.drift.test.tsx scans the rendered DOM and asserts
// every leaf appears here. If you add or rename a Leaf in one of the
// groups, update this dictionary or the test will fail.
export const GROUP_LEAF_LABELS: Record<SettingsGroupId, string[]> = {
    setup: ["Readiness", "BI vertical", "AI vertical", "Experience controls"],
    bi: ["Provider", "Embed", "Authentication", "Canvas", "Status"],
    ai: ["Provider", "Model / Agent", "Connection test", "Knowledge pack", "AI Insights", "Browse library ↗"],
    preferences: ["UI mode", "Visible panels", "AI position", "Canvas tiles"],
    system: ["Proxy status", "Security posture", "License posture", "Diagnostics", "Setup wizard", "Export support bundle"],
    advanced: ["Local storage inspector", "Reset section", "Reset all", "Danger zone"],
};

export function SettingsShell(): React.ReactElement {
    const route = useSettingsRoute();
    const settings = useSettings();
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [search, setSearch] = useState("");

    // Esc to close, Cmd/Ctrl+/ to focus search.
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

    // Settings IA fix #2 — when the URL has a `/settings/<group>/<leaf>`
    // segment, scroll the matching leaf into view after the group renders.
    // The `<Leaf>` component renders `id="settings-<group>-<slug>"`; we
    // accept either the exact slug or any label that slugifies to it
    // (case-insensitive, separator-tolerant).
    useEffect(() => {
        if (!route.isSettingsRoute || !route.leaf) return;
        const wanted = leafSlug(route.leaf);
        if (!wanted) return;
        // Defer one frame so the active group has mounted and its leaves
        // are in the DOM before we look them up.
        const id = window.requestAnimationFrame(() => {
            const target = document.getElementById(`settings-${route.group}-${wanted}`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                // Visual highlight pulse so the user can spot the destination
                // when the layout is dense. Pure CSS transition; no JS timer
                // leak if the user navigates away.
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
        <div
            className="pp-settings"
            style={{
                position: "fixed",
                inset: 0,
                background: "var(--pp-bg, #fff)",
                color: "var(--pp-fg, #111)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1000,
            }}
        >
            <SettingsHeader />
            <SettingsSearchBar
                inputRef={searchInputRef}
                value={search}
                onChange={setSearch}
                resultsCount={filteredGroups.length}
            />
            <SettingsStatusStrip />
            <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
                <SettingsLeftRail
                    activeGroup={route.group}
                    visibleGroups={filteredGroups}
                    settingsLoaded={!settings.allowlistLoading}
                    hasOrphans={settings.orphans.length > 0}
                />
                <main
                    style={{
                        flex: "1 1 auto",
                        overflowY: "auto",
                        padding: "20px 28px 40px",
                        background: "var(--pp-bg, #fafafa)",
                    }}
                    aria-live="polite"
                >
                    <ActiveGroup group={route.group} />
                </main>
            </div>
        </div>
    );
}

// ─── Header strip ────────────────────────────────────────────────────────

function SettingsHeader(): React.ReactElement {
    return (
        <header
            style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px",
                borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
            }}
        >
            <div>
                <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.1 }}>PulsePlay Settings</h1>
                <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.6 }}>
                    Single source of truth for Setup · BI · AI · Preferences · System · Advanced
                </p>
            </div>
            <button
                type="button"
                onClick={navigateToApp}
                style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                    background: "transparent",
                    borderRadius: 4,
                    cursor: "pointer",
                }}
                title="Return to the playground (Esc)"
            >
                ← Back to app
            </button>
        </header>
    );
}

// ─── Search bar ──────────────────────────────────────────────────────────

interface SettingsSearchBarProps {
    value: string;
    onChange: (next: string) => void;
    resultsCount: number;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

function SettingsSearchBar(props: SettingsSearchBarProps): React.ReactElement {
    const { value, onChange, resultsCount, inputRef } = props;
    return (
        <div
            style={{
                flex: "0 0 auto",
                padding: "10px 20px",
                display: "flex",
                gap: 10,
                alignItems: "center",
                borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
            }}
        >
            <input
                ref={inputRef}
                type="search"
                placeholder="Search settings… (Cmd/Ctrl+/)"
                value={value}
                onChange={e => onChange(e.target.value)}
                aria-label="Search settings"
                style={{
                    flex: "1 1 auto",
                    padding: "6px 10px",
                    fontSize: 13,
                    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                    borderRadius: 4,
                    outline: "none",
                    background: "var(--pp-input-bg, #fff)",
                }}
            />
            {value && (
                <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {resultsCount} group{resultsCount === 1 ? "" : "s"} matched
                </span>
            )}
        </div>
    );
}

// ─── Status strip ────────────────────────────────────────────────────────

function SettingsStatusStrip(): React.ReactElement {
    const { allowlist, allowlistLoading, allowlistError, biVendor, packSelection, activeAiProfile, orphans } = useSettings();
    const { embedConfig } = useEmbedConfig();
    const setupReadiness = getSetupReadiness({ biVendor, embedConfig, activeAiProfile });

    const biStatus = orphans.some(o => o.key === "pulseplay:bi-vendor")
        ? "warn"
        : setupReadiness.biReady
            ? "ok"
            : "missing";
    const aiStatus = orphans.some(o => o.key === "pulseplay:active-ai-profile")
        ? "warn"
        : setupReadiness.aiReady
            ? "ok"
            : "missing";
    const packStatus = orphans.some(o => o.key === "pulseplay:pack-selection")
        ? "warn"
        : packSelection
            ? "ok"
            : "missing";
    const proxyStatus = allowlistError ? "warn" : allowlistLoading ? "loading" : "ok";
    const securityStatus = allowlist?.enforcement === "strict" ? "ok" : "warn";

    // Settings IA fix #3 — each chip is a button that jumps to the matching
    // group. BI / AI / Preferences / System / Advanced. Pack lives under AI.
    return (
        <div
            style={{
                flex: "0 0 auto",
                display: "flex",
                gap: 8,
                padding: "8px 20px",
                borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
                flexWrap: "wrap",
            }}
        >
            <Chip label="Setup" status={setupReadiness.ready ? "ok" : "warn"} detail={setupReadiness.pillDetail} group="setup" />
            <Chip label="BI" status={biStatus} detail={biVendor || "(none)"} group="bi" />
            <Chip label="AI" status={aiStatus} detail={activeAiProfile || "(none)"} group="ai" />
            <Chip label="Pack" status={packStatus} detail={packSelection?.pack || "(none)"} group="ai" leaf="knowledge-pack" />
            <Chip label="Proxy" status={proxyStatus} detail={allowlistError || (allowlistLoading ? "loading" : "ok")} group="system" leaf="proxy-status" />
            <Chip label="Security" status={securityStatus} detail={allowlist?.enforcement || "(unknown)"} group="system" leaf="security-posture" />
        </div>
    );
}

type ChipStatus = "ok" | "warn" | "missing" | "loading";

function Chip(props: { label: string; status: ChipStatus; detail: string; group: SettingsGroupId; leaf?: string }): React.ReactElement {
    const colors: Record<ChipStatus, { dot: string; bg: string; fg: string }> = {
        ok: { dot: "#22c55e", bg: "rgba(34, 197, 94, 0.08)", fg: "#0f6b35" },
        warn: { dot: "#facc15", bg: "rgba(250, 204, 21, 0.12)", fg: "#7a5b00" },
        missing: { dot: "#ef4444", bg: "rgba(239, 68, 68, 0.08)", fg: "#a01828" },
        loading: { dot: "#888", bg: "rgba(0, 0, 0, 0.04)", fg: "#555" },
    };
    const c = colors[props.status];
    const target = props.leaf ? `${props.group} › ${props.label}` : `${props.label} group`;
    return (
        <button
            type="button"
            onClick={() => navigateToSettings(props.group, props.leaf)}
            aria-label={`Jump to ${target}`}
            title={`Jump to ${target}`}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: c.bg,
                color: c.fg,
                borderRadius: 14,
                fontSize: 11,
                fontWeight: 500,
                border: "1px solid transparent",
                cursor: "pointer",
                font: "inherit",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = c.dot; }}
            onBlur={e => { e.currentTarget.style.borderColor = "transparent"; }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.dot,
                    display: "inline-block",
                }}
            />
            <span style={{ fontWeight: 600 }}>{props.label}</span>
            <span style={{ opacity: 0.75 }}>{props.detail}</span>
        </button>
    );
}

// ─── Left rail ───────────────────────────────────────────────────────────

interface SettingsLeftRailProps {
    activeGroup: SettingsGroupId;
    visibleGroups: ReadonlyArray<SettingsGroupId>;
    settingsLoaded: boolean;
    hasOrphans: boolean;
}

function SettingsLeftRail(props: SettingsLeftRailProps): React.ReactElement {
    return (
        <nav
            aria-label="Settings sections"
            style={{
                flex: "0 0 220px",
                padding: "12px 8px",
                borderRight: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
                background: "var(--pp-bg, #fff)",
                overflowY: "auto",
            }}
        >
            {props.visibleGroups.map(id => {
                const active = id === props.activeGroup;
                const setupNeeded = (id === "setup" || id === "system") && props.hasOrphans;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => navigateToSettings(id)}
                        aria-current={active ? "page" : undefined}
                        style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            margin: "2px 0",
                            border: 0,
                            borderRadius: 6,
                            background: active ? "var(--pp-accent, #0078d4)" : "transparent",
                            color: active ? "white" : "inherit",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: active ? 600 : 500,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>{GROUP_LABELS[id]}</span>
                            {setupNeeded && (
                                <span
                                    aria-label="Setup needed"
                                    style={{
                                        fontSize: 9,
                                        padding: "1px 6px",
                                        background: active ? "rgba(255,255,255,0.25)" : "rgba(220, 53, 69, 0.15)",
                                        color: active ? "white" : "#a01828",
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Setup
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: 10,
                                opacity: active ? 0.85 : 0.55,
                                marginTop: 2,
                                fontWeight: 400,
                            }}
                        >
                            {GROUP_DESCRIPTIONS[id]}
                        </div>
                    </button>
                );
            })}
            {!props.settingsLoaded && (
                <div style={{ fontSize: 11, opacity: 0.5, padding: "12px", textAlign: "center" }}>
                    Loading allowlist…
                </div>
            )}
        </nav>
    );
}

// ─── Active group resolver ───────────────────────────────────────────────

function ActiveGroup(props: { group: SettingsGroupId }): React.ReactElement {
    switch (props.group) {
        case "setup":
            return <SetupGroup />;
        case "bi":
            return <BiGroup />;
        case "ai":
            return <AiGroup />;
        case "preferences":
            return <PreferencesGroup />;
        case "system":
            return <SystemGroup />;
        case "advanced":
            return <AdvancedGroup />;
        default:
            return <SetupGroup />;
    }
}

/** Pure helper exposed for tests — exercises parseSettingsRoute through
 *  the public route surface. Kept in this file to avoid a separate
 *  helper module just for one function. */
export function __resolveActiveGroup(pathname: string): SettingsGroupId {
    return parseSettingsRoute(pathname).group;
}
