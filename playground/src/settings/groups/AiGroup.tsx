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
//   - AI Insights setup ↗ + Browse library ↗ stay as Phase 8 placeholders
//
// Out of scope: editing the underlying Pulse `genieSettings.assistantProfile`
// (still owned by Pulse persistProperties). The store mirrors it on load
// so a returning Pulse user lands on their existing selection.

import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../settingsStore";
import { CurrentValue, Leaf, OrphanBanner } from "./BiGroup";
import { TestConnectionPanel } from "../../components/TestConnectionPanel";
import { PackPicker, type PackInfo, type PackSelection } from "../../components/PackPicker";
import { probeConnector } from "../../lib/probeClient";
import type { ConnectorProbeResult } from "../../types/probe";

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

    return (
        <section aria-labelledby="settings-ai-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-ai-title" style={{ margin: 0, fontSize: 20 }}>AI</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    What's thinking, and what it knows. MVP 0.2: Databricks Genie + Supervisor only.
                </p>
            </header>

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

            {/* ── Deep-link rows (unchanged) ────────────────────────── */}
            <Leaf group="ai" label="AI Insights setup ↗" helper="Open Pulse Setup for detailed prompt, KPI rule, and validator configuration.">
                <DeepLinkButton label="Open Pulse Setup" onClick={() => {
                    // Phase 5 wires this to a Pulse Setup hash route. For
                    // now navigate to / and rely on the user opening Pulse.
                    window.location.pathname = "/";
                }} />
            </Leaf>

            <Leaf group="ai" label="Browse library ↗" helper="Open the Knowledge Base content browser — glossary, ontology, KPIs, sample questions per pack.">
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
        </section>
    );
}

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
