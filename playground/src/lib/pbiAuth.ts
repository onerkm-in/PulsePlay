// playground/src/lib/pbiAuth.ts
//
// AAD SSO for the Power BI "Embed for your organization" (User-Owns-Data)
// pattern, per https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-organization-app.
//
// Why this exists
// ───────────────
// Service-principal embed tokens (the existing /assistant/embed-token/powerbi
// proxy route) give every viewer the same identity — RLS sees the SP, not
// the user. For seamless SSO with row-level security the right pattern is
// "Embed for your organization": each viewer signs in with AAD, MSAL.js
// silently issues a Power BI access token, and powerbi-client embeds with
// tokenType: TokenType.Aad. If the user already has a Microsoft 365
// session, sign-in is a silent redirect; otherwise it's a popup that takes
// one click.
//
// The PowerBI adapter already supports tokenType: "Aad" (see bi-adapters/
// powerbi/index.ts ctor). This helper just acquires the AAD token + the
// embedUrl from the Power BI REST API.
//
// Auth scope:
//   `https://analysis.windows.net/powerbi/api/.default`
//   reads "delegated permissions defined on the AAD app registration".
//   Typical permissions: Report.Read.All, Dataset.Read.All. The org's AAD
//   admin grants these once on the app; this module never asks for new
//   scopes at runtime.

import type { PublicClientApplication, AuthenticationResult, AccountInfo } from "@azure/msal-browser";

/** Config the caller supplies — typically wired from the EmbedConfigForm. */
export interface PbiAuthConfig {
    /** AAD application (client) ID. The org's admin registers an SPA app
     *  in Azure portal and grants delegated Power BI Service permissions. */
    clientId: string;
    /** Tenant ID. Defaults to "organizations" (any work/school account).
     *  Use a specific tenant GUID for single-tenant apps. */
    tenantId?: string;
    /** Redirect URI registered on the AAD app. Defaults to
     *  `window.location.origin` — register that in the AAD app's "SPA"
     *  platform config. */
    redirectUri?: string;
    /** Organization allowlist of permitted tenant IDs. When non-empty,
     *  `tenantId` (or the resolved authority tenant) MUST be in this list
     *  or sign-in is refused BEFORE MSAL is instantiated. Empty / undefined
     *  means "no allowlist enforced at this layer" (dev mode); the form
     *  layer always validates too, so this is defense in depth — it
     *  protects any future caller that uses signInAndPrepareEmbed without
     *  the EmbedConfigForm. Closes loophole L1 from SETTINGS_SPEC § 15. */
    allowedTenants?: string[];
}

/** Thrown by signInAndPrepareEmbed when the configured tenant is not in
 *  the organization allowlist. Distinct from generic Error so callers can
 *  surface it as a security message ("Your administrator restricts SSO to
 *  the organization's AAD tenant") rather than a generic auth failure. */
export class PbiAllowlistError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PbiAllowlistError";
    }
}

/** Pre-MSAL allowlist gate. Refuses sign-in if the requested tenant is not
 *  in the organization's allowlist. Called before any MSAL initialization
 *  so an attacker who tricks a user into pasting a malicious tenant ID
 *  never reaches Microsoft's login endpoint with attacker-controlled state. */
function assertTenantAllowed(config: PbiAuthConfig): void {
    const allowed = (config.allowedTenants || []).map(t => t.trim().toLowerCase()).filter(Boolean);
    if (allowed.length === 0) return; // no allowlist → permissive (dev fallback; form layer handles strict mode)
    const tenant = (config.tenantId || "").trim().toLowerCase();
    if (!tenant) {
        throw new PbiAllowlistError(
            "AAD SSO is restricted to your organization's tenant. Pick an allowed tenant before signing in.",
        );
    }
    if (!allowed.includes(tenant)) {
        throw new PbiAllowlistError(
            `AAD tenant "${config.tenantId}" is not in your organization's allowlist. Allowed: ${config.allowedTenants?.join(", ") || "(none)"}.`,
        );
    }
}

/** Power BI REST API scope — `.default` defers to the permissions the AAD
 *  admin has consented to on the app registration. The org sets these
 *  once; this module never asks for new scopes at runtime. */
const PBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";

/** Power BI REST API base used to fetch report metadata + embedUrl. */
const PBI_API_BASE = "https://api.powerbi.com/v1.0/myorg";

/** Result returned after a successful sign-in + report-metadata fetch. */
export interface PbiEmbedHandshake {
    /** AAD access token scoped to Power BI service. Pass to
     *  powerbi-client as `accessToken` with tokenType "Aad". */
    accessToken: string;
    /** Report's embed URL (e.g. https://app.powerbi.com/reportEmbed?…).
     *  Pulled from `GET /v1.0/myorg/groups/{groupId}/reports/{reportId}`. */
    embedUrl: string;
    /** Report ID (echoed back for convenience). */
    reportId: string;
    /** Dataset ID returned by the report metadata call. May be useful
     *  when constructing filter queries against the PBI REST API. */
    datasetId?: string;
    /** Signed-in user info — useful for surfacing "Signed in as …" UI. */
    account: AccountInfo | null;
    /** When the access token expires (ms since epoch). The MSAL silent
     *  refresh chain renews automatically before this is hit. */
    expiresOn: number;
}

/**
 * Singleton MSAL instance — created lazily so the page doesn't pay the
 * MSAL init cost (network for OpenID config) until the user actually
 * chooses SSO mode in the Setup form.
 */
let _msalInstance: PublicClientApplication | null = null;
let _msalInitPromise: Promise<PublicClientApplication> | null = null;

/**
 * Lazily import + initialise the MSAL PublicClientApplication. Marked
 * async so the @azure/msal-browser bundle code-splits per the vite.config
 * manualChunks rule.
 */
async function getMsal(config: PbiAuthConfig): Promise<PublicClientApplication> {
    // Allowlist gate runs BEFORE any MSAL init or network call so an
    // attacker-controlled tenant ID never reaches login.microsoftonline.com.
    assertTenantAllowed(config);
    if (_msalInstance) return _msalInstance;
    if (_msalInitPromise) return _msalInitPromise;
    _msalInitPromise = (async () => {
        const { PublicClientApplication } = await import("@azure/msal-browser");
        const instance = new PublicClientApplication({
            auth: {
                clientId: config.clientId,
                authority: `https://login.microsoftonline.com/${config.tenantId || "organizations"}`,
                redirectUri: config.redirectUri || window.location.origin,
            },
            cache: {
                // sessionStorage keeps the token across page refreshes but
                // not across tabs (safer default than localStorage for SSO
                // tokens — limits blast radius if XSS ever happens).
                cacheLocation: "sessionStorage",
            },
        });
        await instance.initialize();
        _msalInstance = instance;
        return instance;
    })();
    return _msalInitPromise;
}

/**
 * Acquire a Power BI access token for the signed-in user. Tries silent
 * first (refresh token cached in sessionStorage); falls back to a popup
 * if interaction is required. Returns the raw MSAL result so callers
 * can read account info + expiry.
 */
export async function acquirePbiAccessToken(config: PbiAuthConfig): Promise<AuthenticationResult> {
    const msal = await getMsal(config);
    const accounts = msal.getAllAccounts();
    const account = accounts[0];

    if (account) {
        try {
            return await msal.acquireTokenSilent({
                scopes: [PBI_SCOPE],
                account,
            });
        } catch {
            // Fall through to popup — silent failed (expired refresh,
            // consent revoked, etc.). The popup re-authenticates the
            // same account when possible.
        }
    }
    return msal.acquireTokenPopup({
        scopes: [PBI_SCOPE],
        prompt: account ? "none" : "select_account",
    });
}

/**
 * Fetch report metadata from the Power BI REST API. Returns the
 * embedUrl (used to construct the iframe src) and datasetId (used by
 * the host if it needs to issue dataset-level filter queries).
 *
 * Endpoint: GET https://api.powerbi.com/v1.0/myorg/groups/{groupId}/reports/{reportId}
 * Docs:     https://learn.microsoft.com/rest/api/power-bi/reports/get-report-in-group
 */
export async function fetchReportEmbedInfo(
    accessToken: string,
    groupId: string,
    reportId: string,
): Promise<{ embedUrl: string; datasetId?: string; name?: string }> {
    const url = `${PBI_API_BASE}/groups/${encodeURIComponent(groupId)}/reports/${encodeURIComponent(reportId)}`;
    const resp = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        },
    });
    if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        throw new Error(`Power BI GET report failed (${resp.status}): ${detail.slice(0, 240) || resp.statusText}`);
    }
    const data = await resp.json() as { embedUrl?: string; datasetId?: string; name?: string };
    if (!data.embedUrl) {
        throw new Error("Power BI report metadata missing `embedUrl`.");
    }
    return { embedUrl: data.embedUrl, datasetId: data.datasetId, name: data.name };
}

/**
 * Convenience — sign in (silent first, popup fallback), then fetch the
 * report metadata in one call. Returns everything the EmbedConfigForm
 * needs to hand off to PowerBIAdapter. Throws on any failure with a
 * caller-friendly message; the form surfaces it as inline error text.
 */
export async function signInAndPrepareEmbed(
    config: PbiAuthConfig,
    groupId: string,
    reportId: string,
): Promise<PbiEmbedHandshake> {
    if (!config.clientId.trim()) throw new Error("AAD App Client ID is required for SSO mode.");
    if (!groupId.trim()) throw new Error("Workspace (group) ID is required.");
    if (!reportId.trim()) throw new Error("Report ID is required.");

    // Defense in depth: re-assert tenant allowlist at the public entry
    // point too, so a future caller that constructs PbiAuthConfig
    // dynamically still hits the gate even before getMsal() runs.
    assertTenantAllowed(config);

    const auth = await acquirePbiAccessToken(config);
    const meta = await fetchReportEmbedInfo(auth.accessToken, groupId.trim(), reportId.trim());
    return {
        accessToken: auth.accessToken,
        embedUrl: meta.embedUrl,
        reportId: reportId.trim(),
        datasetId: meta.datasetId,
        account: auth.account,
        expiresOn: auth.expiresOn?.getTime() ?? (Date.now() + 60 * 60 * 1000),
    };
}

/**
 * Sign the user out (clears MSAL cache for this account). Optional — the
 * Setup form can offer a "Sign out" button next to the signed-in chip.
 */
export async function signOutPbi(config: PbiAuthConfig): Promise<void> {
    const msal = await getMsal(config);
    const accounts = msal.getAllAccounts();
    if (accounts.length === 0) return;
    await msal.logoutPopup({ account: accounts[0], mainWindowRedirectUri: window.location.origin });
}
