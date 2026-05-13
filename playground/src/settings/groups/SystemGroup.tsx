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
import { CurrentValue, Leaf } from "./BiGroup";
import { useDiagnosticsBuffer } from "../diagnosticsBuffer";
import { buildExportBundle, downloadExportBundle } from "../exportBundle";

interface HealthResponse {
    ok?: boolean;
    profiles?: string[];
    port?: number;
    configSource?: string;
    databricksApp?: boolean;
    appName?: string | null;
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
                <h2 id="settings-system-title" style={{ margin: 0, fontSize: 20 }}>System</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    Is it safe, and is anything broken — proxy status, security posture, diagnostics, export bundle.
                </p>
            </header>

            {/* ── Proxy status ──────────────────────────────────────── */}
            <Leaf label="Proxy status" helper="Live /health from the PulsePlay proxy. Polled every 10 seconds; click Re-run to refresh immediately.">
                <ProxyStatusBlock state={health} onReload={health.reload} />
            </Leaf>

            {/* ── Security posture (unchanged from Phase 3) ─────────── */}
            <Leaf label="Security posture" helper="Read-only view of the organization-controlled allowlist. Configured via proxy/config.json. Do not edit here.">
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
            <Leaf label="License posture" helper="What's licensed in this deployment. Read-only; configured by the admin via proxy/config.json allowlist.license.">
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

            {/* ── Diagnostics ───────────────────────────────────────── */}
            <Leaf label="Diagnostics" helper="Last 20 BI events + last 20 console errors. Use Export bundle below to save a redacted snapshot for support.">
                <DiagnosticsBlock events={diagnostics.events} errors={diagnostics.errors} />
            </Leaf>

            {/* ── Export bundle ─────────────────────────────────────── */}
            <Leaf label="Export support bundle" helper="Download a redacted JSON snapshot of state for support tickets. Tokens and secrets are masked before download.">
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
        </section>
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
