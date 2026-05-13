import { useEffect, useState } from "react";
import type { BIEmbedConfig } from "../biPanel/BIAdapter";
import { signInAndPrepareEmbed, signOutPbi } from "../lib/pbiAuth";
import type { PulsePlayAllowlist } from "../types/allowlist";

// Vendor-aware embed-config form.
//
// Power BI embed modes (in order of preference for production):
//   0. Secure embed link - paste the Power BI portal's website/portal link
//      or iframe for a quick authenticated preview. It is intentionally
//      limited: the report renders, but SDK commands such as AI-applied
//      filters and page navigation need SSO or backend-issued mode.
//   1. SSO (AAD User-Owns-Data) — MSAL.js signs the viewer in with their
//      AAD identity. Power BI applies the user's own RLS + dataset
//      permissions. Seamless when the viewer already has an M365 session.
//      Per https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-organization-app
//   2. Backend-issued (Service Principal) — proxy mints an embed token
//      via Azure AD client-credentials flow. The proxy may derive RLS
//      effective identities from verified server-side user claims. The
//      browser never sees the SP secret and never supplies RLS identities.
//   3. Manual paste — dev / lab only, hidden unless explicitly enabled
//      with VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true outside production.
//
// Other vendors (generic / Tableau / Qlik / Looker) — single URL field
// (the iframe fallback path; v1 wires real SDKs).
//
// The shape this form emits matches PowerBIEmbedConfig in
// bi-adapters/powerbi/index.ts so the adapter can mount() it directly.

interface EmbedConfigFormProps {
    vendor: string;
    value: BIEmbedConfig;
    onChange: (next: BIEmbedConfig) => void;
    /** Optional override for the AI proxy base URL — same env-driven
     *  pattern AISidebar uses so dev/prod deployments line up. */
    apiBaseUrl?: string;
    /** Currently active connector / assistant profile. The proxy embed-
     *  token route resolves AAD credentials from this profile, so it has
     *  to be passed through. Empty string is allowed (then the proxy
     *  falls back to "default"). */
    assistantProfile?: string;
    /** Organization allowlist fetched from the proxy. When present, the
     *  form refuses values the proxy will reject anyway. */
    allowlist?: PulsePlayAllowlist | null;
}

type PowerBITokenMode = "secure" | "sso" | "backend" | "manual";

function isManualPowerBIModeEnabled(): boolean {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    return env.VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN === "true"
        && env.MODE !== "production";
}

interface PowerBIFormState {
    groupId: string;
    reportId: string;
    datasetId: string;
    permissions: "View" | "Edit";
    tokenMode: PowerBITokenMode;
    secureEmbedInput: string;
    manualEmbedUrl: string;
    manualAccessToken: string;
    /** SSO: AAD app client ID. Persisted in localStorage so the author
     *  enters it once per browser. */
    aadClientId: string;
    /** SSO: AAD tenant ID. Defaults to "organizations" (any work/school
     *  account). Persisted alongside clientId. */
    aadTenantId: string;
}

const PBI_SSO_STORAGE_KEY = "pulseplay:pbi-sso-config";

interface PersistedSsoConfig {
    aadClientId?: string;
    aadTenantId?: string;
}

function readPersistedSso(): PersistedSsoConfig {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(PBI_SSO_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
}

function writePersistedSso(value: PersistedSsoConfig): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(PBI_SSO_STORAGE_KEY, JSON.stringify(value)); } catch { /* swallow */ }
}

function normalizePowerBISecureEmbedInput(input: string): string {
    const raw = input.trim();
    const srcMatch = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    return (srcMatch?.[1] || raw).trim().replace(/&amp;/g, "&");
}

function isPowerBISecureEmbedUrl(input: string): boolean {
    try {
        const parsed = new URL(input);
        return parsed.protocol === "https:"
            && parsed.hostname.toLowerCase().endsWith("powerbi.com")
            && /\/reportEmbed$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

function extractReportIdFromPowerBIUrl(input: string): string | undefined {
    try {
        return new URL(input).searchParams.get("reportId") || undefined;
    } catch {
        return undefined;
    }
}

/** L3 — Power BI portal "embed in website or portal" URLs carry the
 *  workspace (group) ID as a `groupId` query param. Pull it so we can
 *  validate the secure-embed path against `allowlist.powerbiWorkspaces`
 *  the same way SSO + service-principal modes do. */
function extractGroupIdFromPowerBIUrl(input: string): string | undefined {
    try {
        return new URL(input).searchParams.get("groupId") || undefined;
    } catch {
        return undefined;
    }
}

function allowlistActive(allowlist?: PulsePlayAllowlist | null): boolean {
    return !!allowlist?.configured;
}

function hostnameFromUrl(input: string): string {
    try { return new URL(input).hostname.toLowerCase(); }
    catch { return ""; }
}

function isEmbedOriginAllowed(allowlist: PulsePlayAllowlist | null | undefined, vendor: string, url: string): boolean {
    if (!allowlistActive(allowlist)) return true;
    const allowed = allowlist?.embedOrigins?.[vendor] || [];
    return allowed.includes(hostnameFromUrl(url));
}

function allowlistContains(values: string[] | undefined, value: string): boolean {
    const needle = value.trim().toLowerCase();
    return !!needle && (values || []).map(v => v.toLowerCase()).includes(needle);
}

function powerBIWorkspaceAllowed(allowlist: PulsePlayAllowlist | null | undefined, groupId: string): boolean {
    if (!allowlistActive(allowlist)) return true;
    return allowlistContains(allowlist?.powerbiWorkspaces, groupId);
}

function powerBIReportAllowed(allowlist: PulsePlayAllowlist | null | undefined, reportId: string): boolean {
    if (!allowlistActive(allowlist)) return true;
    const reports = allowlist?.powerbiReports || [];
    if (reports.length === 0) return !!reportId.trim();
    return allowlistContains(reports, reportId);
}

function aadTenantAllowed(allowlist: PulsePlayAllowlist | null | undefined, tenantId: string): boolean {
    if (!allowlistActive(allowlist)) return true;
    return allowlistContains(allowlist?.aadTenants, tenantId);
}

const EMPTY_PBI: PowerBIFormState = {
    groupId: "",
    reportId: "",
    datasetId: "",
    permissions: "View",
    // Default mode is the secure portal link/iframe path so a novice
    // author can paste what Power BI gives them and see the report first.
    // SSO/backend remain the production SDK paths for AI-applied filters,
    // page navigation, and richer events.
    tokenMode: "secure",
    secureEmbedInput: "",
    manualEmbedUrl: "",
    manualAccessToken: "",
    aadClientId: "",
    aadTenantId: "",
};

export function EmbedConfigForm(props: EmbedConfigFormProps) {
    if (props.vendor === "powerbi") {
        return <PowerBIEmbedForm {...props} />;
    }
    return <GenericUrlForm {...props} />;
}

// ── Power BI ───────────────────────────────────────────────────────────────

function PowerBIEmbedForm(props: EmbedConfigFormProps) {
    const [state, setState] = useState<PowerBIFormState>(() => hydratePbiState(props.value));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>("");
    const [lastIssuedAt, setLastIssuedAt] = useState<number | null>(null);
    const manualModeEnabled = isManualPowerBIModeEnabled();

    // Re-hydrate when the parent reset the embedConfig (e.g. user changed
    // vendor and came back). Avoids stale form values overwriting a fresh
    // empty state.
    useEffect(() => {
        if (Object.keys(props.value).length === 0) {
            setState(EMPTY_PBI);
            setLastIssuedAt(null);
            setError("");
        }
    }, [props.value]);

    useEffect(() => {
        if (!manualModeEnabled && state.tokenMode === "manual") {
            setState(s => ({ ...s, tokenMode: "secure", permissions: "View" }));
        }
    }, [manualModeEnabled, state.tokenMode]);

    const apiBase = props.apiBaseUrl || "/api";

    const set = <K extends keyof PowerBIFormState>(key: K, val: PowerBIFormState[K]) => {
        setState(s => ({ ...s, [key]: val }));
    };

    const setTokenMode = (mode: PowerBITokenMode) => {
        const nextMode = mode === "manual" && !manualModeEnabled ? "secure" : mode;
        setState(s => ({
            ...s,
            tokenMode: nextMode,
            permissions: nextMode === "backend" ? "View" : s.permissions,
        }));
    };

    const apply = async () => {
        setError("");
        if (state.tokenMode === "secure") {
            const embedUrl = normalizePowerBISecureEmbedInput(state.secureEmbedInput);
            if (!embedUrl) {
                setError("Paste the secure Power BI embed link or iframe from the portal.");
                return;
            }
            if (!isPowerBISecureEmbedUrl(embedUrl)) {
                setError("Secure embed mode needs a Power BI reportEmbed URL from app.powerbi.com.");
                return;
            }
            if (!isEmbedOriginAllowed(props.allowlist, "powerbi", embedUrl)) {
                const allowed = props.allowlist?.embedOrigins?.powerbi || [];
                setError(`Power BI URL hostname is not allowed by your organization. Allowed: ${allowed.join(", ") || "none configured"}.`);
                return;
            }
            const extractedGroupId = extractGroupIdFromPowerBIUrl(embedUrl);
            const effectiveGroupId = state.groupId.trim() || extractedGroupId || "";
            // L3 — workspace allowlist applies to secure-embed too. Without
            // this gate, a user could paste a portal URL pointing at a
            // workspace the org didn't authorize for embedding.
            if (effectiveGroupId && !powerBIWorkspaceAllowed(props.allowlist, effectiveGroupId)) {
                setError(
                    `Workspace "${effectiveGroupId}" extracted from the secure embed URL is not in your organization's Power BI workspace allowlist.`,
                );
                return;
            }
            const extractedReportId = state.reportId.trim() || extractReportIdFromPowerBIUrl(embedUrl);
            if (extractedReportId && !powerBIReportAllowed(props.allowlist, extractedReportId)) {
                setError(
                    `Report "${extractedReportId}" extracted from the secure embed URL is not in your organization's Power BI report allowlist.`,
                );
                return;
            }
            const reportId = extractedReportId || "secure-powerbi-report";
            props.onChange({
                type: "report",
                mode: "secure-embed",
                embedMode: "secure",
                id: reportId,
                groupId: effectiveGroupId || undefined,
                embedUrl,
                url: embedUrl,
                permissions: "View",
            });
            setLastIssuedAt(Date.now());
            return;
        }

        if (!state.reportId.trim()) {
            setError("Report ID is required.");
            return;
        }
        if (!powerBIReportAllowed(props.allowlist, state.reportId)) {
            setError("This report is not in your organization's Power BI report allowlist.");
            return;
        }

        if (state.tokenMode === "manual") {
            if (!manualModeEnabled) {
                setError("Manual Power BI token mode is disabled for this build.");
                return;
            }
            if (!state.manualEmbedUrl.trim() || !state.manualAccessToken.trim()) {
                setError("Manual mode needs both an embed URL and an access token.");
                return;
            }
            if (!isEmbedOriginAllowed(props.allowlist, "powerbi", state.manualEmbedUrl)) {
                const allowed = props.allowlist?.embedOrigins?.powerbi || [];
                setError(`Embed URL hostname is not allowed by your organization. Allowed: ${allowed.join(", ") || "none configured"}.`);
                return;
            }
            props.onChange({
                type: "report",
                mode: "manual",
                embedMode: "manual",
                tokenType: "Embed",
                id: state.reportId.trim(),
                groupId: state.groupId.trim() || undefined,
                datasetId: state.datasetId.trim() || undefined,
                embedUrl: state.manualEmbedUrl.trim(),
                accessToken: state.manualAccessToken.trim(),
                permissions: state.permissions,
            });
            setLastIssuedAt(Date.now());
            return;
        }

        // SSO mode — sign the viewer in with AAD via MSAL, acquire a
        // Power BI access token, fetch the report metadata from the
        // PBI REST API, then hand off to PowerBIAdapter with
        // tokenType: "Aad". RLS applies per-user. Per
        // https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-organization-app
        if (state.tokenMode === "sso") {
            if (!state.aadClientId.trim()) {
                setError("AAD App Client ID is required. Register an SPA app in Azure AD with Power BI Service API permissions.");
                return;
            }
            if (!state.groupId.trim()) {
                setError("Workspace (group) ID is required.");
                return;
            }
            if (!powerBIWorkspaceAllowed(props.allowlist, state.groupId)) {
                setError("This workspace is not in your organization's Power BI workspace allowlist.");
                return;
            }
            const effectiveTenantId = state.aadTenantId.trim()
                || (allowlistActive(props.allowlist) && props.allowlist?.aadTenants?.length === 1
                    ? props.allowlist.aadTenants[0]
                    : "");
            if (allowlistActive(props.allowlist) && !aadTenantAllowed(props.allowlist, effectiveTenantId)) {
                setError("AAD SSO is restricted to your organization's tenant. Enter an allowlisted tenant ID.");
                return;
            }
            // Persist AAD app config so the author enters it once per browser.
            writePersistedSso({
                aadClientId: state.aadClientId.trim(),
                aadTenantId: effectiveTenantId,
            });
            setBusy(true);
            try {
                const handshake = await signInAndPrepareEmbed(
                    {
                        clientId: state.aadClientId.trim(),
                        tenantId: effectiveTenantId || undefined,
                        // Defense in depth — passing the live allowlist
                        // lets pbiAuth.signInAndPrepareEmbed re-assert the
                        // tenant gate even if some future caller bypasses
                        // this form. Closes loophole L1 at the lower layer.
                        allowedTenants: props.allowlist?.aadTenants,
                    },
                    state.groupId.trim(),
                    state.reportId.trim(),
                );
                props.onChange({
                    type: "report",
                    tokenType: "Aad",
                    id: handshake.reportId,
                    groupId: state.groupId.trim(),
                    datasetId: state.datasetId.trim() || handshake.datasetId,
                    embedUrl: handshake.embedUrl,
                    accessToken: handshake.accessToken,
                    permissions: state.permissions,
                });
                setLastIssuedAt(Date.now());
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setBusy(false);
            }
            return;
        }

        // Backend-issued: POST to the proxy. The proxy resolves AAD service
        // principal credentials via the active profile and returns a short-
        // lived embed token. The browser never sees the AAD secret, never
        // supplies RLS identities, and requests View unless the proxy profile
        // has an explicit server-side Edit policy.
        if (!state.groupId.trim()) {
            setError("Workspace (group) ID is required for backend-issued tokens.");
            return;
        }
        if (!powerBIWorkspaceAllowed(props.allowlist, state.groupId)) {
            setError("This workspace is not in your organization's Power BI workspace allowlist.");
            return;
        }
        setBusy(true);
        try {
            const resp = await fetch(`${apiBase}/assistant/embed-token/powerbi`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groupId: state.groupId.trim(),
                    reportId: state.reportId.trim(),
                    datasetId: state.datasetId.trim() || undefined,
                    permissions: "View",
                    assistantProfile: props.assistantProfile || undefined,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const detail = typeof data?.error === "string" ? data.error : `HTTP ${resp.status}`;
                setError(detail);
                return;
            }
            if (!data?.embedToken || !data?.embedUrl) {
                setError("Proxy returned an incomplete response (missing embedToken or embedUrl).");
                return;
            }
            props.onChange({
                type: "report",
                mode: "backend-issued",
                embedMode: "backend",
                tokenType: "Embed",
                id: state.reportId.trim(),
                groupId: state.groupId.trim(),
                datasetId: state.datasetId.trim() || undefined,
                embedUrl: String(data.embedUrl),
                accessToken: String(data.embedToken),
                permissions: "View",
            });
            setLastIssuedAt(Date.now());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const handleSignOut = async () => {
        if (!state.aadClientId.trim()) return;
        try {
            await signOutPbi({
                clientId: state.aadClientId.trim(),
                tenantId: state.aadTenantId.trim() || undefined,
            });
            setLastIssuedAt(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <section className="pp-embed-config pp-embed-config--powerbi">
            <h3 className="pp-embed-config__heading">Power BI embed</h3>
            <label className="pp-embed-config__label" htmlFor="pp-pbi-mode">Embed mode</label>
            <select
                id="pp-pbi-mode"
                className="pp-embed-config__input"
                value={state.tokenMode}
                onChange={e => setTokenMode(e.target.value as PowerBITokenMode)}
            >
                <option value="secure">Secure embed link - quick preview</option>
                <option value="sso">AAD SSO — Embed for your organization (seamless)</option>
                <option value="backend">Service principal — Embed for your customers (proxy)</option>
                {manualModeEnabled && <option value="manual">Manual paste (dev only)</option>}
            </select>

            {state.tokenMode === "secure" && (
                <>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-secure-url">Secure embed link or iframe</label>
                    <textarea
                        id="pp-pbi-secure-url"
                        className="pp-embed-config__input pp-embed-config__input--textarea"
                        value={state.secureEmbedInput}
                        onChange={e => set("secureEmbedInput", e.target.value)}
                        placeholder={'https://app.powerbi.com/reportEmbed?... or <iframe src="https://app.powerbi.com/reportEmbed?...">'}
                        rows={4}
                    />
                    <p className="pp-embed-config__hint" style={{ fontSize: 11, opacity: 0.7, margin: "4px 0 8px" }}>
                        Quick preview uses Power BI's website/portal embed. Viewers authenticate with Power BI, but SDK commands such as AI-applied filters and page navigation need AAD SSO or service-principal mode.
                    </p>
                </>
            )}

            {state.tokenMode !== "secure" && (
                <>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-group">Workspace ID</label>
                    <input
                        id="pp-pbi-group"
                        className="pp-embed-config__input"
                        type="text"
                        value={state.groupId}
                        onChange={e => set("groupId", e.target.value)}
                        placeholder="01234567-89ab-cdef-0123-456789abcdef"
                    />

                    <label className="pp-embed-config__label" htmlFor="pp-pbi-report">Report ID</label>
                    <input
                        id="pp-pbi-report"
                        className="pp-embed-config__input"
                        type="text"
                        value={state.reportId}
                        onChange={e => set("reportId", e.target.value)}
                        placeholder="01234567-89ab-cdef-0123-456789abcdef"
                    />

                    <label className="pp-embed-config__label" htmlFor="pp-pbi-dataset">Dataset ID</label>
                    <input
                        id="pp-pbi-dataset"
                        className="pp-embed-config__input"
                        type="text"
                        value={state.datasetId}
                        onChange={e => set("datasetId", e.target.value)}
                        placeholder="optional — needed for cross-workspace datasets"
                    />

                    <label className="pp-embed-config__label" htmlFor="pp-pbi-perms">Permissions</label>
                    <select
                        id="pp-pbi-perms"
                        className="pp-embed-config__input"
                        value={state.tokenMode === "backend" ? "View" : state.permissions}
                        onChange={e => {
                            const next = e.target.value as "View" | "Edit";
                            if (state.tokenMode === "backend" && next === "Edit") {
                                set("permissions", "View");
                                return;
                            }
                            set("permissions", next);
                        }}
                    >
                        <option value="View">View</option>
                        <option value="Edit" disabled={state.tokenMode === "backend"}>Edit</option>
                    </select>
                </>
            )}

            {state.tokenMode === "sso" && (
                <>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-aad-client">AAD App Client ID</label>
                    <input
                        id="pp-pbi-aad-client"
                        className="pp-embed-config__input"
                        type="text"
                        value={state.aadClientId}
                        onChange={e => set("aadClientId", e.target.value)}
                        placeholder="01234567-89ab-cdef-0123-456789abcdef"
                    />
                    <p className="pp-embed-config__hint" style={{ fontSize: 11, opacity: 0.7, margin: "4px 0 8px" }}>
                        Register an <strong>SPA</strong> app in Azure AD with redirect URI <code>{typeof window !== "undefined" ? window.location.origin : ""}</code>. Grant delegated Power BI Service permissions (Report.Read.All at minimum).
                    </p>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-aad-tenant">AAD Tenant ID (optional)</label>
                    <input
                        id="pp-pbi-aad-tenant"
                        className="pp-embed-config__input"
                        type="text"
                        value={state.aadTenantId}
                        onChange={e => set("aadTenantId", e.target.value)}
                        placeholder="leave blank for any work/school account"
                    />
                </>
            )}

            {state.tokenMode === "manual" && (
                <>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-url">Embed URL</label>
                    <input
                        id="pp-pbi-url"
                        className="pp-embed-config__input"
                        type="url"
                        value={state.manualEmbedUrl}
                        onChange={e => set("manualEmbedUrl", e.target.value)}
                        placeholder="https://app.powerbi.com/reportEmbed?reportId=…"
                    />
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-token">Embed access token</label>
                    <textarea
                        id="pp-pbi-token"
                        className="pp-embed-config__input pp-embed-config__input--textarea"
                        value={state.manualAccessToken}
                        onChange={e => set("manualAccessToken", e.target.value)}
                        placeholder="eyJ…  (short-lived embed token; never paste a Power BI master/PAT)"
                        rows={3}
                    />
                </>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                    type="button"
                    className="pp-embed-config__apply"
                    onClick={apply}
                    disabled={busy}
                >
                    {busy ? (state.tokenMode === "sso" ? "Signing in…" : "Issuing token…")
                          : (state.tokenMode === "sso"
                              ? "Sign in & embed"
                              : state.tokenMode === "secure"
                                  ? "Load secure embed"
                                  : "Load report")}
                </button>
                {state.tokenMode === "sso" && lastIssuedAt && (
                    <button
                        type="button"
                        className="pp-embed-config__apply"
                        onClick={handleSignOut}
                        disabled={busy}
                        style={{ background: "transparent", color: "#0078d4", border: "1px solid #0078d4" }}
                    >
                        Sign out
                    </button>
                )}
            </div>

            {error && (
                <p className="pp-embed-config__error" role="alert">{error}</p>
            )}
            {lastIssuedAt && !error && (
                <p className="pp-embed-config__hint">
                    Loaded at {new Date(lastIssuedAt).toLocaleTimeString()}.
                </p>
            )}
            {state.tokenMode !== "secure" && (
                <p className="pp-embed-config__hint">
                    Backend-issued mode: the proxy uses an Azure AD service principal
                    (powerBiClientId / powerBiClientSecret / powerBiTenantId on the
                    active profile). The browser only ever sees the short-lived
                    embed token.
                </p>
            )}
        </section>
    );
}

function hydratePbiState(value: BIEmbedConfig): PowerBIFormState {
    // Best-effort rehydrate — useful when the parent persists embedConfig
    // across re-renders (e.g. after a vendor switch and back). When no
    // value is present we default to secure quick preview so authors can
    // paste the portal iframe/link first. We never auto-flip to "manual"
    // unless an access token is present since that's the dev-only escape
    // hatch. Persisted AAD app config is read separately so it survives
    // across sessions even after the embedConfig is reset.
    const persistedSso = readPersistedSso();
    const tokenType = (value.tokenType as string) || "";
    const isSecureEmbed = value.mode === "secure-embed" || value.embedMode === "secure";
    const isBackendIssued = value.mode === "backend-issued" || value.embedMode === "backend";
    const isManualEmbed = value.mode === "manual" || value.embedMode === "manual";
    const embedUrl = (value.embedUrl as string) || (value.url as string) || "";
    const inferredMode: PowerBITokenMode =
        isSecureEmbed ? "secure"
            : tokenType === "Aad" ? "sso"
            : isBackendIssued ? "backend"
            : isManualEmbed && value.accessToken && isManualPowerBIModeEnabled() ? "manual"
            : "secure";
    return {
        groupId: (value.groupId as string) || "",
        reportId: (value.id as string) || "",
        datasetId: (value.datasetId as string) || "",
        permissions: (value.permissions as "View" | "Edit") || "View",
        tokenMode: inferredMode,
        secureEmbedInput: isSecureEmbed ? embedUrl : "",
        manualEmbedUrl: embedUrl,
        manualAccessToken: (value.accessToken as string) || "",
        aadClientId: persistedSso.aadClientId || "",
        aadTenantId: persistedSso.aadTenantId || "",
    };
}

// ── Generic / non-PBI vendors ─────────────────────────────────────────────

function GenericUrlForm(props: EmbedConfigFormProps) {
    const [url, setUrl] = useState<string>((props.value.url as string) || "");

    const apply = () => {
        if (!url.trim()) return;
        if (!isEmbedOriginAllowed(props.allowlist, props.vendor, url.trim())) {
            return;
        }
        props.onChange({ url: url.trim() });
    };

    const placeholder = (() => {
        switch (props.vendor) {
            case "tableau":   return "https://server/views/Workbook/View";
            case "qlik":      return "https://tenant.qlikcloud.com/sense/app/<id>/sheet/<id>";
            case "looker":    return "https://looker.example.com/embed/dashboards/123";
            default:          return "https://any-bi-url.example.com/embed/...";
        }
    })();

    return (
        <section className="pp-embed-config">
            <label htmlFor="pp-embed-url" className="pp-embed-config__label">Embed URL</label>
            <input
                id="pp-embed-url"
                type="url"
                className="pp-embed-config__input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={apply}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                placeholder={placeholder}
            />
            <button type="button" className="pp-embed-config__apply" onClick={apply}>
                Load
            </button>
            {allowlistActive(props.allowlist) && url.trim() && !isEmbedOriginAllowed(props.allowlist, props.vendor, url.trim()) && (
                <p className="pp-embed-config__error" role="alert">
                    URL hostname is not in your organization's allowed origins. Allowed: {(props.allowlist?.embedOrigins?.[props.vendor] || []).join(", ") || "none configured"}.
                </p>
            )}
            <p className="pp-embed-config__hint">
                v0: paste any embed URL. v1 will add per-vendor credential helpers + token issuance via the proxy.
            </p>
        </section>
    );
}
