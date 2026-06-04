// playground/src/settings/groups/AdvancedGroup.tsx
//
// Phase 5 — Advanced group fully wired. Three destructive action
// classes, each gated by a type-to-confirm input so a slipped click
// can't nuke author state:
//
//   - Local storage inspector (read-only, unchanged from Phase 2)
//   - Reset section: clear the localStorage keys owned by ONE group
//   - Reset all: remove every pulseplay:* key on this origin
//   - Danger zone: clear MSAL sessionStorage + sign out
//
// Per SETTINGS_SPEC § 5.3, destructive actions require the user to type
// the leaf name verbatim. That keeps the UI from feeling adversarial
// (no double-click prompts, no "are you sure?" overlays) while still
// requiring deliberate intent.

import { useEffect, useState } from "react";
import { Leaf } from "./BiGroup";
import { signOutPbi } from "../../lib/pbiAuth";
import {
    loadPerformanceLevers,
    savePerformanceLevers,
    resetPerformanceLevers,
    PERFORMANCE_LEVERS_EVENT,
    PERFORMANCE_LEVERS_BOUNDS,
    PERFORMANCE_LEVERS_DEFAULTS,
    type PerformanceLevers,
    type RevealCadence,
} from "../performanceLevers";
import { writePulseAiVisualSettingsPatch } from "../pulseVisualSettingsStore";

const PULSEPLAY_KEY_PREFIX = "pulseplay:";
const PULSE_VISUAL_PREFIX = "pulseplay:visual-settings:";

const SECTION_KEYS: Record<string, string[]> = {
    // bi-embed-config (the Power BI embed URL/token) + active-connector were
    // owned by these sections but missing from the reset lists (B4) — a section
    // reset left stale embed config / connector selection behind.
    bi: ["pulseplay:bi-vendor", "pulseplay:bi-surface-mode", "pulseplay:pbi-sso-config", "pulseplay:bi-tile-mode", "pulseplay:bi-embed-config"],
    ai: ["pulseplay:active-ai-profile", "pulseplay:pack-selection", "pulseplay:active-connector"],
    preferences: ["pulseplay:ui-mode", "pulseplay:enabled-components", "pulseplay:layout-mode", "pulseplay:split:horizontal", "pulseplay:split:vertical"],
    system: [],
    advanced: [],
};

export function AdvancedGroup(): React.ReactElement {
    const entries = useLiveLocalStorage();

    return (
        <section aria-labelledby="settings-advanced-title">
            <header style={{ marginBottom: 20 }}>
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — h2 + intro hidden. */}
                <h2 id="settings-advanced-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Advanced</h2>
                <p style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    Performance levers, diagnostics, developer tools, and destructive maintenance.
                </p>
            </header>

            <Leaf group="advanced" label="Performance levers" helper="Author-selectable speed-vs-completeness knobs. Each lever is persisted under pulseplay:performance-levers and broadcast on save, so changes take effect mid-session without a reload.">
                <PerformanceLeversPanel />
            </Leaf>

            <Leaf group="advanced" label="Local storage inspector" helper="Every PulsePlay localStorage key on this origin. Read-only.">
                <LocalStorageTable entries={entries} />
            </Leaf>

            <Leaf group="advanced" label="Reset section" helper="Clear localStorage keys owned by one settings group. The other groups keep their state.">
                <ResetSectionAction />
            </Leaf>

            <Leaf group="advanced" label="Reset all" helper="Clear every PulsePlay setting on this origin. The app's BI and AI selections, layout, and pack will all be gone. Pulse's persisted visual-settings keys also clear.">
                <TypeToConfirmAction
                    name="Reset all"
                    label="Clear all PulsePlay settings"
                    danger
                    onConfirm={() => {
                        clearByPrefix(PULSEPLAY_KEY_PREFIX);
                        broadcastReset("all");
                    }}
                />
            </Leaf>

            <Leaf group="advanced" label="Danger zone" helper="Sign out of Power BI and clear cached MSAL sessions. The browser drops the AAD session — you'll need to sign in again to embed.">
                <DangerZoneActions />
            </Leaf>
        </section>
    );
}

// ─── Local storage table ─────────────────────────────────────────────────

/** Semantic categories for the local-storage inspector. Each key is placed
 *  in the first bucket whose predicate matches; falls through to "other"
 *  if nothing claims it. The order here is also the display order. */
const STORAGE_BUCKETS: Array<{
    id:       string;
    label:    string;
    helper:   string;
    matches:  (key: string) => boolean;
}> = [
    {
        id:      "wizard",
        label:   "Wizard state",
        helper:  "First-run setup wizard dismissal + draft + force flag + last-chosen persona.",
        matches: k => k.startsWith("pulseplay:wizard-") || k === "pulseplay:last-persona",
    },
    {
        id:      "bi",
        label:   "BI selections",
        helper:  "What you're looking at — surface mode + vendor + embed config + SSO + canvas tile preference.",
        matches: k => k === "pulseplay:bi-vendor"
                   || k === "pulseplay:bi-surface-mode"
                   || k === "pulseplay:bi-embed-config"
                   || k === "pulseplay:pbi-sso-config"
                   || k === "pulseplay:bi-tile-mode",
    },
    {
        id:      "ai",
        label:   "AI selections",
        helper:  "What's thinking — active profile, knowledge pack, and the full Pulse genieSettings JSON.",
        matches: k => k === "pulseplay:active-ai-profile"
                   || k === "pulseplay:pack-selection"
                   || k === "pulseplay:active-connector"
                   || k.startsWith("pulseplay:visual-settings:"),
    },
    {
        id:      "layout",
        label:   "Layout state",
        helper:  "How the playground is laid out — UI mode, visible panels, AI position, pane focus.",
        matches: k => k === "pulseplay:ui-mode"
                   || k === "pulseplay:layout-mode"
                   || k === "pulseplay:enabled-components"
                   || k === "pulseplay:pinned-viewport-pane"
                   || k.startsWith("pulseplay:split:"),
    },
    {
        id:      "navigation",
        label:   "Navigation memory",
        helper:  "Where you were last in Settings; not a feature setting.",
        matches: k => k === "pulseplay:settings-last-group",
    },
    {
        id:      "other",
        label:   "Other",
        helper:  "Keys that don't fit a known bucket — usually new features or legacy entries.",
        matches: () => true, // catch-all; must be last
    },
];

function LocalStorageTable(props: { entries: Array<[string, string]> }): React.ReactElement {
    if (props.entries.length === 0) {
        return <div style={{ fontSize: 12, opacity: 0.5 }}>(no pulseplay:* keys persisted yet)</div>;
    }
    // Bucket every key into the first matching category.
    const bucketed = new Map<string, Array<[string, string]>>();
    for (const bucket of STORAGE_BUCKETS) bucketed.set(bucket.id, []);
    for (const [key, value] of props.entries) {
        for (const bucket of STORAGE_BUCKETS) {
            if (bucket.matches(key)) {
                bucketed.get(bucket.id)!.push([key, value]);
                break;
            }
        }
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {STORAGE_BUCKETS.map(bucket => {
                const rows = bucketed.get(bucket.id) || [];
                if (rows.length === 0) return null;
                return (
                    <div key={bucket.id} data-storage-bucket={bucket.id}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                            <h4 style={{
                                margin:         0,
                                fontSize:       11,
                                fontWeight:     700,
                                textTransform:  "uppercase",
                                letterSpacing:  0.6,
                                color:          "#475569",
                            }}>
                                {bucket.label}
                            </h4>
                            <span style={{ fontSize: 10.5, opacity: 0.5 }}>
                                {rows.length} key{rows.length === 1 ? "" : "s"}
                            </span>
                        </div>
                        <p style={{ margin: "0 0 6px", fontSize: 11, opacity: 0.6, lineHeight: 1.45 }}>{bucket.helper}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontFamily: "var(--pp-mono, monospace)" }}>
                            {rows.map(([key, value]) => (
                                <div key={key} style={{ display: "flex", gap: 12 }}>
                                    <span style={{ minWidth: 240, opacity: 0.6 }}>{key}</span>
                                    <span style={{ wordBreak: "break-all" }}>{truncate(value, 240)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function truncate(value: string, limit: number): string {
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1)}…`;
}

function useLiveLocalStorage(): Array<[string, string]> {
    const [entries, setEntries] = useState<Array<[string, string]>>(() => readEntries());
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setEntries(readEntries());
        window.addEventListener("storage", sync);
        window.addEventListener("pulseplay:display-change", sync as EventListener);
        window.addEventListener("pulseplay:settings-reset", sync as EventListener);
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("pulseplay:display-change", sync as EventListener);
            window.removeEventListener("pulseplay:settings-reset", sync as EventListener);
        };
    }, []);
    return entries;
}

function readEntries(): Array<[string, string]> {
    if (typeof window === "undefined") return [];
    const out: Array<[string, string]> = [];
    try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith(PULSEPLAY_KEY_PREFIX)) continue;
            out.push([key, window.localStorage.getItem(key) || ""]);
        }
    } catch { /* swallow */ }
    out.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
}

// ─── Type-to-confirm primitive ───────────────────────────────────────────

interface TypeToConfirmActionProps {
    /** Phrase the user must type verbatim before the button activates. */
    name: string;
    /** Button label shown when enabled. */
    label: string;
    /** When true, button uses a red palette and a stronger callout. */
    danger?: boolean;
    onConfirm: () => void;
}

function TypeToConfirmAction(props: TypeToConfirmActionProps): React.ReactElement {
    const [typed, setTyped] = useState("");
    const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
    const matches = typed.trim() === props.name;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Type <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 6px", borderRadius: 3 }}>{props.name}</code> to enable:
                </span>
                <input
                    type="text"
                    aria-label={`Type ${props.name} to confirm`}
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                        borderRadius: 4,
                        width: 160,
                    }}
                />
                <button
                    type="button"
                    disabled={!matches}
                    onClick={() => {
                        props.onConfirm();
                        setTyped("");
                        setConfirmedAt(Date.now());
                    }}
                    style={{
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        border: `1px solid ${props.danger ? "#a01828" : "var(--pp-accent, #0078d4)"}`,
                        background: matches ? (props.danger ? "#a01828" : "var(--pp-accent, #0078d4)") : "transparent",
                        color: matches ? "white" : "var(--pp-border, rgba(0,0,0,0.4))",
                        borderRadius: 4,
                        cursor: matches ? "pointer" : "not-allowed",
                    }}
                >
                    {props.label}
                </button>
            </div>
            {confirmedAt && Date.now() - confirmedAt < 5000 && (
                <span style={{ fontSize: 11, color: "#0f6b35" }}>✓ Done.</span>
            )}
        </div>
    );
}

// ─── Reset section ───────────────────────────────────────────────────────

function ResetSectionAction(): React.ReactElement {
    const [section, setSection] = useState<keyof typeof SECTION_KEYS>("bi");
    const sectionKeys = SECTION_KEYS[section];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>
                Section to reset:{" "}
                <select
                    value={section}
                    onChange={e => setSection(e.target.value as keyof typeof SECTION_KEYS)}
                    style={{ padding: "3px 8px", fontSize: 12, marginLeft: 4 }}
                >
                    <option value="bi">BI ({SECTION_KEYS.bi.length} keys)</option>
                    <option value="ai">AI ({SECTION_KEYS.ai.length} keys)</option>
                    <option value="preferences">Preferences ({SECTION_KEYS.preferences.length} keys)</option>
                </select>
            </label>
            <div style={{ fontSize: 11, opacity: 0.55, fontFamily: "var(--pp-mono, monospace)" }}>
                Keys to clear: {sectionKeys.join(", ") || "(none)"}
            </div>
            <TypeToConfirmAction
                name={`Reset ${section}`}
                label={`Clear ${sectionKeys.length} key${sectionKeys.length === 1 ? "" : "s"}`}
                onConfirm={() => {
                    for (const key of sectionKeys) {
                        try { window.localStorage.removeItem(key); } catch { /* swallow */ }
                        try {
                            window.dispatchEvent(
                                new CustomEvent("pulseplay:display-change", { detail: { key, value: null } }),
                            );
                        } catch { /* swallow */ }
                    }
                    broadcastReset(section);
                }}
            />
        </div>
    );
}

// ─── Danger zone ─────────────────────────────────────────────────────────

function DangerZoneActions(): React.ReactElement {
    const [signOutBusy, setSignOutBusy] = useState(false);
    const [signOutError, setSignOutError] = useState<string>("");

    const onSignOut = async () => {
        setSignOutBusy(true);
        setSignOutError("");
        try {
            // The SSO config is persisted under pulseplay:pbi-sso-config.
            // If absent, signOutPbi short-circuits inside (no MSAL init).
            const raw = window.localStorage.getItem("pulseplay:pbi-sso-config");
            const parsed = raw ? JSON.parse(raw) : null;
            await signOutPbi({
                clientId: parsed?.aadClientId || "",
                tenantId: parsed?.aadTenantId || undefined,
                // Empty allowedTenants → no-op gate; sign-OUT is always permitted.
            });
        } catch (err) {
            setSignOutError(err instanceof Error ? err.message : String(err));
        } finally {
            setSignOutBusy(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                    Sign out of Power BI (clears MSAL sessionStorage):
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={onSignOut}
                        disabled={signOutBusy}
                        style={{
                            padding: "5px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            border: "1px solid #a01828",
                            background: signOutBusy ? "transparent" : "#a01828",
                            color: signOutBusy ? "#a01828" : "white",
                            borderRadius: 4,
                            cursor: signOutBusy ? "default" : "pointer",
                            alignSelf: "flex-start",
                        }}
                    >
                        {signOutBusy ? "Signing out…" : "Sign out Power BI"}
                    </button>
                    {signOutError && (
                        <span style={{ fontSize: 11, color: "#a01828" }}>{signOutError}</span>
                    )}
                </div>
            </div>

            <TypeToConfirmAction
                name="Clear Pulse settings"
                label="Clear Pulse persisted settings"
                danger
                onConfirm={() => {
                    clearByPrefix(PULSE_VISUAL_PREFIX);
                    broadcastReset("pulse-visual");
                }}
            />
        </div>
    );
}

// ─── Shared helpers ──────────────────────────────────────────────────────

// Session auth, NOT a PulsePlay "setting" — preserved across resets so a
// "reset all" doesn't drop the running desktop EXE session. No-op in a normal
// browser (key absent). Must match desktopRuntimeClient's LAUNCH_TOKEN_KEY.
const PRESERVE_ON_RESET = new Set<string>(["pulseplay:desktop-launch-token"]);

function clearByPrefix(prefix: string): void {
    if (typeof window === "undefined") return;
    // Clear BOTH localStorage AND sessionStorage (B4): the discovery cache lives
    // in sessionStorage under pulseplay:discovery:*, so a localStorage-only
    // sweep left stale discovery snapshots behind after a reset.
    for (const store of [window.localStorage, window.sessionStorage]) {
        const toRemove: string[] = [];
        try {
            for (let i = 0; i < store.length; i += 1) {
                const key = store.key(i);
                if (key && key.startsWith(prefix) && !PRESERVE_ON_RESET.has(key)) toRemove.push(key);
            }
            for (const key of toRemove) store.removeItem(key);
        } catch { /* best-effort reset — storage may be unavailable (private mode) */ }
    }
}

function broadcastReset(scope: string): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent("pulseplay:settings-reset", { detail: { scope } }));
    } catch { /* swallow */ }
}

// ─── Performance levers panel ────────────────────────────────────────────

// 2026-05-28 — taglines updated to reflect that the cadence preset
// now drives BOTH frontend reveal animation AND backend batch timing
// (single source of truth — see performanceLevers.getBackendStagingFromCadence).
const CADENCE_LABELS: Record<RevealCadence, { title: string; tagline: string }> = {
    instant:  { title: "Instant",  tagline: "All sections in one Genie call — single-shot bundle" },
    fast:     { title: "Fast",     tagline: "Lead first, then batches of 3 with 3s delay" },
    balanced: { title: "Balanced", tagline: "Default — lead first, then batches of 2 with 6s delay" },
    full:     { title: "Full",     tagline: "Lead first, then 1 section per batch with 8s delay" },
};

function PerformanceLeversPanel(): React.ReactElement {
    const [levers, setLevers] = useState<PerformanceLevers>(loadPerformanceLevers);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setLevers(loadPerformanceLevers());
        window.addEventListener(PERFORMANCE_LEVERS_EVENT, sync);
        window.addEventListener("pulseplay:settings-reset", sync as EventListener);
        return () => {
            window.removeEventListener(PERFORMANCE_LEVERS_EVENT, sync);
            window.removeEventListener("pulseplay:settings-reset", sync as EventListener);
        };
    }, []);

    const onCadence = (value: RevealCadence) => {
        setLevers(savePerformanceLevers({ revealCadence: value }));
    };
    const onPrewarmToggle = (next: boolean) => {
        setLevers(savePerformanceLevers({ discoveryPrewarmEnabled: next }));
    };
    const onTtl = (n: number) => {
        const saved = savePerformanceLevers({ insightsCacheTtlMinutes: n });
        // Keep the legacy PulseAiVisualSettings field in sync so the existing
        // insights-cache code (which reads from there) doesn't drift.
        try { writePulseAiVisualSettingsPatch({ insightsCacheTtlMinutes: saved.insightsCacheTtlMinutes }); }
        catch { /* non-fatal */ }
        setLevers(saved);
    };
    const onRetries = (n: number) => {
        setLevers(savePerformanceLevers({ maxValidationRetries: n }));
    };
    const onResetAll = () => {
        const reset = resetPerformanceLevers();
        try { writePulseAiVisualSettingsPatch({ insightsCacheTtlMinutes: reset.insightsCacheTtlMinutes }); }
        catch { /* non-fatal */ }
        setLevers(reset);
    };

    const ttlBounds = PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes;
    const retryBounds = PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries;
    const isDefault =
        levers.revealCadence === PERFORMANCE_LEVERS_DEFAULTS.revealCadence
        && levers.discoveryPrewarmEnabled === PERFORMANCE_LEVERS_DEFAULTS.discoveryPrewarmEnabled
        && levers.insightsCacheTtlMinutes === PERFORMANCE_LEVERS_DEFAULTS.insightsCacheTtlMinutes
        && levers.maxValidationRetries === PERFORMANCE_LEVERS_DEFAULTS.maxValidationRetries;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <fieldset style={leverFieldset} data-lever="reveal-cadence">
                <legend style={leverLegend}>Insights reveal cadence</legend>
                <p style={leverHelper}>How aggressively the rendered Insights answer staggers its sections. Doesn't change the LLM cost or wall-clock — only when each section becomes visible after the answer lands.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(PERFORMANCE_LEVERS_BOUNDS.revealCadence).map(c => {
                        const meta = CADENCE_LABELS[c];
                        const selected = levers.revealCadence === c;
                        return (
                            <button
                                key={c}
                                type="button"
                                onClick={() => onCadence(c)}
                                aria-pressed={selected}
                                data-cadence={c}
                                style={{
                                    textAlign: "left",
                                    padding: "8px 12px",
                                    border: `1px solid ${selected ? "var(--pp-accent, #0078d4)" : "var(--pp-border, rgba(0,0,0,0.18))"}`,
                                    background: selected ? "rgba(0,120,212,0.08)" : "transparent",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                }}
                            >
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.title}{selected ? " ✓" : ""}</span>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>{meta.tagline}</span>
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset style={leverFieldset} data-lever="discovery-prewarm">
                <legend style={leverLegend}>Discovery prewarm on screen load</legend>
                <p style={leverHelper}>Fires one DiscoverySnapshot call right after the probe completes so subsequent queries hit the warm cache. Off = the first user query pays the cold round-trip itself.</p>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <input
                        type="checkbox"
                        checked={levers.discoveryPrewarmEnabled}
                        onChange={e => onPrewarmToggle(e.target.checked)}
                        data-control="discovery-prewarm"
                    />
                    Prewarm enabled
                </label>
            </fieldset>

            <fieldset style={leverFieldset} data-lever="insights-cache-ttl">
                <legend style={leverLegend}>Insights cache freshness</legend>
                <p style={leverHelper}>Cached Insights answers are reused for this many minutes before re-running. Higher = faster repeat-questions; lower = fresher data.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                        type="range"
                        min={ttlBounds.min}
                        max={ttlBounds.max}
                        step={1}
                        value={levers.insightsCacheTtlMinutes}
                        onChange={e => onTtl(parseInt(e.target.value, 10) || 0)}
                        data-control="insights-cache-ttl"
                        style={{ flex: 1 }}
                    />
                    <span style={{ fontFamily: "var(--pp-mono, monospace)", fontSize: 12, minWidth: 56, textAlign: "right" }}>
                        {levers.insightsCacheTtlMinutes} min
                    </span>
                </div>
            </fieldset>

            <fieldset style={leverFieldset} data-lever="max-validation-retries">
                <legend style={leverLegend}>Validation retry budget</legend>
                <p style={leverHelper}>How many times the proxy retries a section that the validator flagged as Suggestion / Blocked. 0 = ship the first answer verbatim (fastest); 3 = retry up to three times (highest quality, slowest).</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                        type="range"
                        min={retryBounds.min}
                        max={retryBounds.max}
                        step={1}
                        value={levers.maxValidationRetries}
                        onChange={e => onRetries(parseInt(e.target.value, 10) || 0)}
                        data-control="max-validation-retries"
                        style={{ flex: 1 }}
                    />
                    <span style={{ fontFamily: "var(--pp-mono, monospace)", fontSize: 12, minWidth: 56, textAlign: "right" }}>
                        {levers.maxValidationRetries} retr{levers.maxValidationRetries === 1 ? "y" : "ies"}
                    </span>
                </div>
            </fieldset>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                    type="button"
                    onClick={onResetAll}
                    disabled={isDefault}
                    data-control="reset-performance-levers"
                    style={{
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                        background: "transparent",
                        color: isDefault ? "var(--pp-border, rgba(0,0,0,0.4))" : "var(--pp-text, #1d1d1f)",
                        borderRadius: 4,
                        cursor: isDefault ? "default" : "pointer",
                    }}
                >
                    {isDefault ? "All defaults" : "Reset to defaults"}
                </button>
            </div>
        </div>
    );
}

const leverFieldset: React.CSSProperties = {
    border: "1px solid var(--pp-border, rgba(0,0,0,0.12))",
    borderRadius: 6,
    padding: "10px 14px 12px",
    margin: 0,
};
const leverLegend: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "0 6px",
    color: "var(--pp-text, #1d1d1f)",
};
const leverHelper: React.CSSProperties = {
    margin: "0 0 8px",
    fontSize: 11,
    opacity: 0.7,
    lineHeight: 1.45,
};
