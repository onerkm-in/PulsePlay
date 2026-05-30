// playground/src/components/PowerBiQnA.tsx
//
// Cycle 15.5 — Power BI Q&A embed surface.
//
// Mounts Microsoft's Q&A NLP visual inside a div via the powerbi-client
// SDK. The user types natural-language questions and Microsoft handles
// the NL → DAX → visual rendering inside the iframe. PulsePlay's proxy
// only mints the embed token; no LLM call originates from PulsePlay.
//
// State machine
// ─────────────
//   idle       → mount + token fetch fires on prop / profile change
//   loading    → token fetch in flight
//   ready      → iframe embedded; Microsoft renders Q&A
//   failed     → token fetch or embed errored; show retry
//   empty      → no profile configured (caller-passed null/empty)
//
// Token expiry
// ────────────
// Microsoft embed tokens last ~1 h. We schedule a re-fetch at
// expiresAt - 5 min so the user never lands on an expired token. The
// fetch is best-effort; if it fails we surface a banner but keep the
// (still-valid) old token rendered.

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchQnAEmbedConfig, type PowerBiQnAEmbedConfig } from "../lib/powerbiQnAClient";

// Lazy-load the powerbi-client SDK so the main bundle isn't paying for
// it on every page. The SDK is ~200 KB and only needed when a deployer
// actually mounts a PBI Q&A surface.
type PowerBiSdk = typeof import("powerbi-client");
type PowerBiService = import("powerbi-client").service.Service;
type PowerBiEmbed = import("powerbi-client").Embed;

let _sdkPromise: Promise<PowerBiSdk> | null = null;
function loadPowerBiSdk(): Promise<PowerBiSdk> {
    if (!_sdkPromise) _sdkPromise = import("powerbi-client");
    return _sdkPromise;
}

let _serviceCache: PowerBiService | null = null;
async function getPbiService(): Promise<PowerBiService> {
    if (_serviceCache) return _serviceCache;
    const sdk = await loadPowerBiSdk();
    _serviceCache = new sdk.service.Service(
        sdk.factories.hpmFactory,
        sdk.factories.wpmpFactory,
        sdk.factories.routerFactory,
    );
    return _serviceCache;
}

export interface PowerBiQnAProps {
    /** Profile name to embed. When omitted, the proxy auto-resolves the
     *  first powerbi-semantic-model profile in the allowlist. */
    profile?: string;
    /** Optional CSS height (default 480). */
    height?: number | string;
    /** Optional CSS class for the outer wrapper. */
    className?: string;
}

type Phase = "idle" | "loading" | "ready" | "failed";

export function PowerBiQnA(props: PowerBiQnAProps): React.ReactElement {
    const [phase, setPhase] = useState<Phase>("idle");
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [config, setConfig] = useState<PowerBiQnAEmbedConfig | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const embedRef = useRef<PowerBiEmbed | null>(null);
    const refreshTimerRef = useRef<number | null>(null);

    // ─── Token fetch ─────────────────────────────────────────────────
    const loadToken = useCallback(async () => {
        setPhase("loading");
        setErrorMsg("");
        try {
            const cfg = await fetchQnAEmbedConfig(props.profile);
            setConfig(cfg);
            setPhase("ready");
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setPhase("failed");
        }
    }, [props.profile]);

    useEffect(() => {
        void loadToken();
        return () => {
            if (refreshTimerRef.current != null) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [loadToken]);

    // ─── Embed ───────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== "ready" || !config || !containerRef.current) return;
        let cancelled = false;
        let cleanupContainer: HTMLDivElement | null = null;

        (async () => {
            try {
                const sdk = await loadPowerBiSdk();
                const service = await getPbiService();
                if (cancelled || !containerRef.current) return;

                // Reset previous embed (token refresh path).
                if (embedRef.current) {
                    try { service.reset(containerRef.current); } catch { /* ignore */ }
                    embedRef.current = null;
                }

                const embedConfig = {
                    type: "qna" as const,
                    accessToken: config.accessToken,
                    embedUrl: config.embedUrl,
                    datasetIds: [config.datasetId],
                    tokenType: sdk.models.TokenType.Embed,
                    viewMode: sdk.models.QnaMode.Interactive,
                };
                embedRef.current = service.embed(containerRef.current, embedConfig);
                cleanupContainer = containerRef.current;

                // Schedule a token refresh 5 min before expiry. Microsoft
                // tokens last ~1h so this gives the user a no-flicker
                // handoff.
                const msUntilRefresh = Math.max(15_000, config.expiresAt - Date.now() - 5 * 60_000);
                if (refreshTimerRef.current != null) {
                    window.clearTimeout(refreshTimerRef.current);
                }
                refreshTimerRef.current = window.setTimeout(() => {
                    if (!cancelled) void loadToken();
                }, msUntilRefresh);
            } catch (err) {
                if (cancelled) return;
                setErrorMsg(err instanceof Error ? err.message : String(err));
                setPhase("failed");
            }
        })();

        return () => {
            cancelled = true;
            if (cleanupContainer && embedRef.current) {
                try {
                    (async () => {
                        const service = await getPbiService();
                        service.reset(cleanupContainer);
                    })();
                } catch { /* ignore */ }
                embedRef.current = null;
            }
        };
    }, [phase, config, loadToken]);

    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        width: "100%",
        height: typeof props.height === "number" ? `${props.height}px` : (props.height || "480px"),
        background: "var(--pp-surface, #fafafa)",
        border: "1px solid var(--pp-border, rgba(0,0,0,0.12))",
        borderRadius: 6,
        overflow: "hidden",
    };

    return (
        <div className={props.className} style={wrapperStyle} data-component="powerbi-qna">
            {/* Microsoft mounts its iframe inside this div. */}
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} data-pbi-embed-target="qna" />

            {phase === "loading" && (
                <div style={overlayStyle} data-state="loading">
                    <span>Loading Power BI Q&amp;A…</span>
                </div>
            )}
            {phase === "failed" && (() => {
                // UX-ARCH-0B.2 follow-up 2026-05-23 — surface a remediation
                // hint when the failure is the typical Azure-AD config one
                // ("Azure AD token request failed (400, mode=service-principal)").
                // The error is a deployer-side credentials issue; the user
                // needs to fix proxy/config.json, not retry the embed.
                const isTokenMintFailure = /azure ad token request failed|service-principal|powerbi.*token|powerbi-qna-token/i.test(errorMsg);
                const isProxyDown = /proxy unreachable/i.test(errorMsg);
                return (
                    <div style={{ ...overlayStyle, color: "#a01828", padding: 24, textAlign: "left", alignItems: "flex-start" }} data-state="failed">
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>
                            {isTokenMintFailure ? "Power BI Q&A token mint failed" : "Couldn't load Power BI Q&A"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 600, marginBottom: 12 }}>
                            {errorMsg || "Unknown error"}
                        </div>
                        {isTokenMintFailure && (
                            <div
                                style={{
                                    fontSize: 12,
                                    background: "rgba(245, 158, 11, 0.08)",
                                    border: "1px solid rgba(245, 158, 11, 0.30)",
                                    borderLeft: "3px solid rgba(245, 158, 11, 0.85)",
                                    padding: "8px 12px",
                                    borderRadius: 4,
                                    color: "#7a5b00",
                                    maxWidth: 600,
                                    marginBottom: 12,
                                }}
                            >
                                <strong>What this means:</strong> Azure AD rejected the proxy's service-principal credentials. This is a deployment / config issue, not a code problem. Check the active Power BI profile in <code>proxy/config.json</code> — the <code>tenantId</code>, <code>clientId</code>, and <code>clientSecret</code> all need to match an Azure AD app registration with Power BI API access. Common fixes: rotated secret expired, app not granted Power BI permissions, wrong tenant.
                            </div>
                        )}
                        {isProxyDown && (
                            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
                                Make sure the proxy is running (<code>node proxy/server.js</code> on 127.0.0.1:8787).
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                type="button"
                                onClick={loadToken}
                                style={{
                                    padding: "6px 14px",
                                    fontSize: 12,
                                    border: "1px solid #a01828",
                                    background: "transparent",
                                    color: "#a01828",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                }}
                                data-action="retry"
                            >
                                Retry
                            </button>
                            {isTokenMintFailure && (
                                <a
                                    href="/settings/ai"
                                    style={{
                                        padding: "6px 14px",
                                        fontSize: 12,
                                        border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                                        background: "var(--pp-surface, #fff)",
                                        color: "var(--pp-text, #111827)",
                                        borderRadius: 4,
                                        textDecoration: "none",
                                    }}
                                >
                                    Open AI Setup →
                                </a>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--pp-surface, #fafafa)",
    color: "var(--pp-text, #1d1d1f)",
    fontSize: 13,
};
