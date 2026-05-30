// playground/src/settings/groups/SystemGroup.tsx
//
// Phase 5 — fully wired System group:
//   - Proxy status: live /api/health poll (10 s cadence) with latency
//     badge, profile count, configSource, authMode, last-checked time
//   - Security posture: read-only allowlist + license posture (Phase 3)
//   - Diagnostics: rolling buffer of recent BI events + console.error
//   - Export bundle: one-click JSON download for support tickets

import { useEffect, useState } from "react";
import { useSettings } from "../settingsStore";
import { CurrentValue, Leaf, SubSection } from "./BiGroup";
import { useDiagnosticsBuffer } from "../diagnosticsBuffer";
import { buildExportBundle, downloadExportBundle } from "../exportBundle";
import { forceWizard } from "../../components/FirstRunWizard";
import { ReconDisclaimer } from "../../components/ReconDisclaimer";

interface HealthResponse {
    ok?: boolean;
    profiles?: string[];
    port?: number;
    configSource?: string;
    databricksApp?: boolean;
    appName?: string | null;
    appResources?: Record<string, string>;
    authMode?: "sharedKey" | "anonymous" | string;
}

interface HealthState {
    response: HealthResponse | null;
    error: string | null;
    latencyMs: number | null;
    lastCheckedAt: string | null;
    loading: boolean;
}

const HEALTH_POLL_MS = 10_000;

function useProxyHealth(): HealthState & { reload: () => void } {
    const [state, setState] = useState<HealthState>({
        response: null,
        error: null,
        latencyMs: null,
        lastCheckedAt: null,
        loading: true,
    });

    const fetchOnce = async () => {
        setState(s => ({ ...s, loading: true }));
        const startedAt = Date.now();
        try {
            const res = await fetch("/api/health");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as HealthResponse;
            setState({
                response: json,
                error: null,
                latencyMs: Date.now() - startedAt,
                lastCheckedAt: new Date().toISOString(),
                loading: false,
            });
        } catch (err) {
            setState({
                response: null,
                error: err instanceof Error ? err.message : String(err),
                latencyMs: Date.now() - startedAt,
                lastCheckedAt: new Date().toISOString(),
                loading: false,
            });
        }
    };

    useEffect(() => {
        let cancelled = false;
        const tick = () => {
            if (cancelled) return;
            void fetchOnce();
        };
        tick();
        const id = window.setInterval(tick, HEALTH_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    return { ...state, reload: fetchOnce };
}

export function SystemGroup(): React.ReactElement {
    const settings = useSettings();
    const { allowlist, allowlistLoading, allowlistError } = settings;
    const health = useProxyHealth();
    const diagnostics = useDiagnosticsBuffer();

    const onExport = () => {
        const bundle = buildExportBundle({
            settings,
            proxy: {
                health: health.response,
                lastCheckedAt: health.lastCheckedAt,
                error: health.error,
            },
        });
        downloadExportBundle(bundle);
    };

    return (
        <section aria-labelledby="settings-system-title">
            <header style={{ marginBottom: 20 }}>
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — h2 + intro hidden. */}
                <h2 id="settings-system-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>System</h2>
                <p style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    Is it safe, and is anything broken — proxy health, governance, diagnostics, tools.
                </p>
            </header>

            {/* DX1b - the locked recon disclaimer (contract section 11). Renders only
                in EXE mode (no-op in browser). Not dismissable here; the persistent
                Settings instance is the always-visible policy reminder. */}
            <ReconDisclaimer variant="settings" />

            {/* ─── Tier 1: Status ───────────────────────────────────────── */}
            <SubSection
                label="Status"
                helper="Live signal from the PulsePlay proxy, governance allowlist, and auth posture."
            >

            <Leaf group="system" label="Proxy status" helper="Live /health from the PulsePlay proxy. Polled every 10 seconds; click Re-run to refresh immediately.">
                <ProxyStatusBlock state={health} onReload={health.reload} />
            </Leaf>

            <Leaf group="system" label="Network and auth" helper="Detected auth mode + how this proxy expects clients to authenticate. Read-only; configured via PROXY_AUTH_MODE / PROXY_IDP_* / PROXY_SHARED_KEY env vars on proxy startup.">
                <NetworkAuthBlock state={health} />
            </Leaf>

            </SubSection>

            {/* ─── Tier 2: Policy ─────────────────────────────────────── */}
            <SubSection
                label="Policy"
                helper="Allowlist contents and Power BI license posture. Read-only — configured by your admin in proxy/config.json."
            >

            <Leaf group="system" label="Security posture" helper="Read-only view of the organization-controlled allowlist. Configured via proxy/config.json. Do not edit here.">
                {allowlistLoading && <CurrentValue label="Status">Loading...</CurrentValue>}
                {allowlistError && (
                    <CurrentValue label="Status">
                        <span style={{ color: "#a01828" }}>{allowlistError}</span>
                    </CurrentValue>
                )}
                {allowlist && (
                    <>
                        <CurrentValue label="Enforcement">{allowlist.enforcement || "(unknown)"}</CurrentValue>
                        <CurrentValue label="BI providers">{allowlist.biProviders.join(" · ") || "(empty)"}</CurrentValue>
                        <CurrentValue label="AAD tenants">{allowlist.aadTenants.join(" · ") || "(empty)"}</CurrentValue>
                        <CurrentValue label="AI profiles">{allowlist.aiProfiles.join(" · ") || "(empty)"}</CurrentValue>
                        <CurrentValue label="Packs">{allowlist.packs.join(" · ") || "(empty)"}</CurrentValue>
                        {allowlist.powerbiWorkspaces && (
                            <CurrentValue label="PBI workspaces">{allowlist.powerbiWorkspaces.join(" · ") || "(any)"}</CurrentValue>
                        )}
                        {allowlist.genieSpaces && (
                            <CurrentValue label="Genie spaces">{allowlist.genieSpaces.join(" · ") || "(any)"}</CurrentValue>
                        )}
                        {allowlist.fetchedAt && (
                            <CurrentValue label="Fetched at">{allowlist.fetchedAt}</CurrentValue>
                        )}
                    </>
                )}
            </Leaf>

            {/* ── License posture (Phase 3) ─────────────────────────── */}
            <Leaf group="system" label="License posture" helper="What's licensed in this deployment. Read-only; configured by the admin via proxy/config.json allowlist.license.">
                {allowlist?.license?.powerbi ? (
                    <>
                        <CurrentValue label="PBI min tier">{allowlist.license.powerbi.minTier || "(unset)"}</CurrentValue>
                        <CurrentValue label="PBI allowed tiers">{allowlist.license.powerbi.allowedTiers?.join(" · ") || "(any)"}</CurrentValue>
                        <CurrentValue label="PBI embed SKU">{allowlist.license.powerbi.embedSku?.join(" · ") || "(unset)"}</CurrentValue>
                        <CurrentValue label="Fabric capability">
                            {allowlist.license.powerbi.fabricEnabled
                                ? "enabled"
                                : <span style={{ color: "#7a5b00" }}>NOT available in this deployment</span>}
                        </CurrentValue>
                        {allowlist.license.powerbi.fabricEnabled === false && (
                            <div
                                role="note"
                                style={{
                                    fontSize: 11,
                                    padding: "6px 10px",
                                    background: "rgba(250, 204, 21, 0.12)",
                                    border: "1px solid rgba(250, 204, 21, 0.4)",
                                    color: "#7a5b00",
                                    borderRadius: 4,
                                    marginTop: 4,
                                }}
                            >
                                Fabric features — Direct Lake datasets, Dataflow Gen2, semantic-link APIs — are not enabled in this deployment. Reports relying on them will not mount; contact your admin or use a non-Fabric report.
                            </div>
                        )}
                    </>
                ) : (
                    <CurrentValue label="License">(no license block in allowlist)</CurrentValue>
                )}
            </Leaf>

            </SubSection>

            {/* ─── Tier 3: Logs and traces ────────────────────────────── */}
            <SubSection
                label="Logs and traces"
                helper="What's been happening — proxy profiles, recent BI events, and errors. Read-only, for troubleshooting."
            >

            <Leaf group="system" label="Profile inventory" helper="Connector profiles the proxy loaded from config.json. Each profile is a (name, type) pair the AI sidebar can target. Configured via proxy/config.json or PROXY_PROFILE_* env vars.">
                <ProfileInventoryBlock profiles={health.response?.profiles ?? null} />
            </Leaf>

            <Leaf group="system" label="Diagnostics" helper="Last 20 BI events + last 20 console errors. Use Export bundle below to save a redacted snapshot for support.">
                <DiagnosticsBlock events={diagnostics.events} errors={diagnostics.errors} />
            </Leaf>

            </SubSection>

            {/* ─── Tier 4: Actions ────────────────────────────────────── */}
            <SubSection
                label="Actions"
                helper="Re-run setup or export a support bundle. Non-destructive."
            >

            {/* ── Re-run setup wizard ───────────────────────────────── */}
            <Leaf group="system" label="Setup wizard" helper="Re-run the first-run setup wizard to change your BI vendor, AI connector, persona, or knowledge pack. Clears the dismissal flag and any saved draft so you start fresh.">
                <button
                    type="button"
                    onClick={() => {
                        // forceWizard() sets WIZARD_FORCE_KEY + clears dismissal +
                        // clears draft so shouldShowWizard returns true on the next
                        // render even when embed config + connector already exist
                        // (RISK-P1 4.5 fix — the old hard-reload path was broken).
                        forceWizard();
                        window.location.href = "/";
                    }}
                    style={{
                        padding:       "6px 14px",
                        fontSize:      13,
                        fontWeight:    600,
                        border:        "1px solid rgba(0,0,0,0.18)",
                        background:    "transparent",
                        color:         "#0f172a",
                        borderRadius:  4,
                        cursor:        "pointer",
                        alignSelf:     "flex-start",
                    }}
                >
                    Re-run setup wizard
                </button>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    Takes you back to the Welcome screen. Your existing embed config and connector are preserved in localStorage — the wizard
                    just re-applies whatever you pick on Done.
                </div>
            </Leaf>

            {/* ── Export bundle ─────────────────────────────────────── */}
            <Leaf group="system" label="Export support bundle" helper="Download a redacted JSON snapshot of state for support tickets. Tokens and secrets are masked before download.">
                <button
                    type="button"
                    onClick={onExport}
                    style={{
                        padding: "6px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        border: "1px solid var(--pp-accent, #0078d4)",
                        background: "var(--pp-accent, #0078d4)",
                        color: "white",
                        borderRadius: 4,
                        cursor: "pointer",
                        alignSelf: "flex-start",
                    }}
                >
                    Download support bundle (.json)
                </button>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    Contains: settings, allowlist contents, proxy health, last 20 BI events, last 20 errors,
                    pulseplay:* localStorage keys (tokens redacted), browser info. Approx 10-50 KB.
                </div>
            </Leaf>

            </SubSection>
        </section>
    );
}

// ─── Network and auth sub-block ─────────────────────────────────────────

function NetworkAuthBlock(props: { state: HealthState }): React.ReactElement {
    const r = props.state.response;
    if (!r) {
        return <div style={{ fontSize: 12, opacity: 0.6 }}>(proxy unreachable — see Proxy status above)</div>;
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <CurrentValue label="Auth mode">{r.authMode || "(unknown)"}</CurrentValue>
            <CurrentValue label="Databricks App">{r.databricksApp ? "yes" : "no"}</CurrentValue>
            {r.appName && <CurrentValue label="App name">{r.appName}</CurrentValue>}
            {r.appResources && Object.keys(r.appResources).length > 0 && (
                <CurrentValue label="App resources">
                    {Object.keys(r.appResources).length} configured
                </CurrentValue>
            )}
            <CurrentValue label="Config source">{r.configSource || "(unknown)"}</CurrentValue>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, lineHeight: 1.5 }}>
                Detailed IdP fields (JWKS URL, issuer, audience, required) are configured via
                <code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: 3, margin: "0 3px" }}>PROXY_IDP_*</code>
                env vars on proxy startup and are not exposed by the <code>/health</code> route for security reasons.
                See <code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: 3 }}>docs/SECURITY.md</code>.
            </div>
        </div>
    );
}

// ─── Profile inventory sub-block ────────────────────────────────────────

function ProfileInventoryBlock(props: { profiles: string[] | null }): React.ReactElement {
    if (!props.profiles) {
        return <div style={{ fontSize: 12, opacity: 0.6 }}>(proxy unreachable — see Proxy status above)</div>;
    }
    if (props.profiles.length === 0) {
        return <div style={{ fontSize: 12, opacity: 0.6 }}>(no profiles configured in proxy/config.json)</div>;
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <CurrentValue label="Count">{props.profiles.length}</CurrentValue>
            <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Profiles:</div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, fontFamily: "var(--pp-mono, monospace)" }}>
                    {props.profiles.map(name => (
                        <li key={name} style={{ marginBottom: 2 }}>{name}</li>
                    ))}
                </ul>
            </div>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6, lineHeight: 1.5 }}>
                Per-profile details (type, space ID, warehouse ID, host) live in proxy/config.json and
                are not exposed by the <code>/health</code> route. See <code style={{ background: "rgba(0,0,0,0.05)", padding: "1px 5px", borderRadius: 3 }}>docs/PROXY_REFERENCE.md</code>.
            </div>
        </div>
    );
}

// ─── Proxy status sub-block ─────────────────────────────────────────────

function ProxyStatusBlock(props: { state: HealthState; onReload: () => void }): React.ReactElement {
    const { state, onReload } = props;
    const status: "ok" | "warn" | "error" | "loading" =
        state.loading && !state.response ? "loading"
        : state.error ? "error"
        : state.response?.ok ? "ok"
        : "warn";
    const latencyColor = !state.latencyMs ? "#888"
        : state.latencyMs < 100 ? "#0f6b35"
        : state.latencyMs < 500 ? "#7a5b00"
        : "#a01828";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusDot status={status} />
                <strong style={{ fontSize: 13 }}>
                    {status === "loading" && "Checking…"}
                    {status === "ok" && "Reachable"}
                    {status === "warn" && "Reachable (degraded)"}
                    {status === "error" && "Unreachable"}
                </strong>
                {state.latencyMs !== null && (
                    <span style={{ fontSize: 11, color: latencyColor, fontFamily: "var(--pp-mono, monospace)" }}>
                        {state.latencyMs}ms
                    </span>
                )}
                <button
                    type="button"
                    onClick={onReload}
                    disabled={state.loading}
                    style={{
                        marginLeft: "auto",
                        padding: "4px 10px",
                        fontSize: 11,
                        border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                        background: "transparent",
                        borderRadius: 4,
                        cursor: state.loading ? "default" : "pointer",
                    }}
                >
                    {state.loading ? "Checking…" : "Re-run"}
                </button>
            </div>
            {state.error && (
                <div style={{ fontSize: 11, color: "#a01828" }}>Error: {state.error}</div>
            )}
            {state.response && (
                <>
                    <CurrentValue label="Profiles configured">{state.response.profiles?.length || 0}</CurrentValue>
                    <CurrentValue label="Config source">{state.response.configSource || "(unknown)"}</CurrentValue>
                    <CurrentValue label="Auth mode">{state.response.authMode || "(unknown)"}</CurrentValue>
                    <CurrentValue label="Port">{String(state.response.port || "(unknown)")}</CurrentValue>
                    {state.response.appName && (
                        <CurrentValue label="App name">{state.response.appName}</CurrentValue>
                    )}
                </>
            )}
            {state.lastCheckedAt && (
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                    Last checked: {new Date(state.lastCheckedAt).toLocaleTimeString()}
                </div>
            )}
        </div>
    );
}

function StatusDot(props: { status: "ok" | "warn" | "error" | "loading" }): React.ReactElement {
    const colors: Record<string, string> = {
        ok: "#22c55e",
        warn: "#facc15",
        error: "#ef4444",
        loading: "#888",
    };
    return (
        <span
            aria-hidden="true"
            style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: colors[props.status],
                display: "inline-block",
            }}
        />
    );
}

// ─── Diagnostics sub-block ──────────────────────────────────────────────

function DiagnosticsBlock(props: {
    events: { at: string; vendor: string; type: string }[];
    errors: { at: string; message: string }[];
}): React.ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DiagSection title={`Recent BI events (${props.events.length})`}>
                {props.events.length === 0 ? (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>No events captured yet. Load a BI report to start receiving events.</span>
                ) : (
                    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ textAlign: "left", opacity: 0.6 }}>
                                <th style={{ padding: "3px 6px" }}>Time</th>
                                <th style={{ padding: "3px 6px" }}>Vendor</th>
                                <th style={{ padding: "3px 6px" }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {props.events.map((e, i) => (
                                <tr key={`${e.at}-${i}`} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                                    <td style={{ padding: "3px 6px", fontFamily: "var(--pp-mono, monospace)" }}>
                                        {new Date(e.at).toLocaleTimeString()}
                                    </td>
                                    <td style={{ padding: "3px 6px" }}>{e.vendor}</td>
                                    <td style={{ padding: "3px 6px" }}>{e.type}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DiagSection>

            <DiagSection title={`Last errors (${props.errors.length})`}>
                {props.errors.length === 0 ? (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>No errors captured this session.</span>
                ) : (
                    <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11 }}>
                        {props.errors.map((err, i) => (
                            <li key={`${err.at}-${i}`} style={{ marginBottom: 4 }}>
                                <span style={{ opacity: 0.6, fontFamily: "var(--pp-mono, monospace)" }}>
                                    {new Date(err.at).toLocaleTimeString()}
                                </span>
                                {" "}
                                <span style={{ color: "#a01828" }}>{err.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </DiagSection>
        </div>
    );
}

function DiagSection(props: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>{props.title}</div>
            {props.children}
        </div>
    );
}
