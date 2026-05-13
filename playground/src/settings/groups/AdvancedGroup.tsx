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

const PULSEPLAY_KEY_PREFIX = "pulseplay:";
const PULSE_VISUAL_PREFIX = "pulseplay:visual-settings:";

const SECTION_KEYS: Record<string, string[]> = {
    bi: ["pulseplay:bi-vendor", "pulseplay:pbi-sso-config", "pulseplay:bi-tile-mode"],
    ai: ["pulseplay:active-ai-profile", "pulseplay:pack-selection"],
    preferences: ["pulseplay:ui-mode", "pulseplay:enabled-components", "pulseplay:layout-mode", "pulseplay:split:horizontal", "pulseplay:split:vertical"],
    system: [],
    advanced: [],
};

export function AdvancedGroup(): React.ReactElement {
    const entries = useLiveLocalStorage();

    return (
        <section aria-labelledby="settings-advanced-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-advanced-title" style={{ margin: 0, fontSize: 20 }}>Advanced</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    Destructive + maintenance actions. Each requires typing the action name to confirm.
                </p>
            </header>

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

function LocalStorageTable(props: { entries: Array<[string, string]> }): React.ReactElement {
    if (props.entries.length === 0) {
        return <div style={{ fontSize: 12, opacity: 0.5 }}>(no pulseplay:* keys persisted yet)</div>;
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontFamily: "var(--pp-mono, monospace)" }}>
            {props.entries.map(([key, value]) => (
                <div key={key} style={{ display: "flex", gap: 12 }}>
                    <span style={{ minWidth: 240, opacity: 0.6 }}>{key}</span>
                    <span style={{ wordBreak: "break-all" }}>{truncate(value, 240)}</span>
                </div>
            ))}
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

function clearByPrefix(prefix: string): void {
    if (typeof window === "undefined") return;
    const toRemove: string[] = [];
    try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(prefix)) toRemove.push(key);
        }
        for (const key of toRemove) window.localStorage.removeItem(key);
    } catch { /* swallow */ }
}

function broadcastReset(scope: string): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent("pulseplay:settings-reset", { detail: { scope } }));
    } catch { /* swallow */ }
}
