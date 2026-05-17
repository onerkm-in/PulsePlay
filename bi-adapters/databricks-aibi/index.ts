// bi-adapters/databricks-aibi/index.ts
//
// Databricks AI/BI Dashboards adapter.
//
// Databricks documents external dashboard embedding with a dedicated npm SDK
// (`@databricks/aibi-client`) and a published dashboard tokeninfo endpoint
// (`/api/2.0/lakeview/dashboards/{id}/published/tokeninfo`). This is the
// first-class BI surface from Databricks itself — distinct from us pointing
// Power BI / Tableau / Qlik / Looker at Databricks SQL as a data source.
//
// v0 (this file): iframe-based embed via the published share URL pattern,
//                 consistent with the existing Tableau / Qlik / Looker stubs.
//                 Works for dashboards that are published with public-access
//                 enabled, OR when paired with a workspace that has SSO.
//
// v1 (next cycle): swap to the `@databricks/aibi-client` SDK for proper
//                  token-refresh, M2M auth, and the event bridge documented
//                  by Databricks. The SDK gives us:
//                    - `DashboardEmbedClient({ instanceUrl, dashboardId,
//                       token, container, getNewToken })` — auto-refreshes
//                       tokens ~5 min before expiry
//                    - `hideDatabricksLogo` option (2026 addition)
//                    - Real event hooks (selection / filter / drill-through)
//                  Token issuance lives in the proxy at
//                  `/assistant/embed-token/databricks-aibi` — mirrors the
//                  existing `/assistant/embed-token/powerbi` server-side
//                  pattern. Doing it server-side keeps client secrets out
//                  of the browser bundle, per the "embed tokens are
//                  server-side only" tripwire in CLAUDE.md.
//
// Per-tile cherry-pick (the Mix-mode "Per-tile cherry-pick" toggle in
// Settings → Preferences → Mix composition) is NOT yet supported by the
// Databricks public embed surface — only whole-dashboard embed. We'd
// surface that toggle when Databricks ships tile-level embed.
//
// Embed URL pattern (v0):
//   {workspaceUrl}/embed/dashboardsv3/{dashboardId}?o={orgId}
//
// embedConfig fields (in addition to the base BIEmbedConfig):
//   url        — full published URL (already constructed) OR
//   workspaceUrl + dashboardId [+ orgId] — adapter constructs the URL
//   accessToken — published-dashboard token from the proxy (v1)

import { GenericIframeAdapter } from "../generic-iframe/index";
import type { BIEmbedConfig } from "../../playground/src/biPanel/BIAdapter";
import { BI_ERR } from "../../playground/src/biPanel/BIAdapter";

interface AibiConfig extends BIEmbedConfig {
    /** Pre-built published dashboard URL. If provided, takes precedence
     *  over workspaceUrl/dashboardId construction. */
    url?: string;
    /** Databricks workspace URL, e.g. https://adb-1234.5.azuredatabricks.net.
     *  Used together with `dashboardId` (and optional `orgId`) to build the
     *  embed URL when `url` isn't provided. */
    workspaceUrl?: string;
    /** Lakeview dashboard ID (UUID-shaped). */
    dashboardId?: string;
    /** Workspace organization ID (the `?o=` query param). Required for
     *  workspaces that have multi-org routing; harmless when absent. */
    orgId?: string;
    /** Published-dashboard token from `/api/2.0/lakeview/dashboards/{id}/
     *  published/tokeninfo`. Currently not consumed by the iframe path
     *  (Databricks delegates auth to the workspace SSO for iframe embeds);
     *  threaded through here so the v1 SDK path doesn't need a config
     *  shape change when it lands. */
    accessToken?: string;
    token?: string;
    workspaceId?: string;
    instanceUrl?: string;
    hideDatabricksLogo?: boolean;
}

/**
 * Build the iframe URL from structured config fields. Exported for the
 * adapter's tests + the proxy's URL pre-validator.
 */
export function buildAibiEmbedUrl(cfg: AibiConfig): string {
    if (cfg.url && cfg.url.trim()) return cfg.url.trim();
    if (!cfg.workspaceUrl || !cfg.dashboardId) {
        throw new Error(`${BI_ERR.EMBED_FAILED}: databricks-aibi requires either { url } or { workspaceUrl + dashboardId }`);
    }
    const base = cfg.workspaceUrl.replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (cfg.orgId) params.set("o", cfg.orgId);
    const query = params.toString();
    return `${base}/embed/dashboardsv3/${encodeURIComponent(cfg.dashboardId)}${query ? `?${query}` : ""}`;
}

export class DatabricksAibiAdapter extends GenericIframeAdapter {
    readonly vendor = "databricks-aibi";
    readonly displayName = "Databricks AI/BI";
    // Databricks AI/BI dashboards need scripts + same-origin for the
    // workspace's SSO flow, forms for any inline filter inputs, and
    // popups for the optional "Open in workspace" drill-through. Deployers
    // that don't expose drill-through can tighten this via cfg.sandbox.
    protected defaultSandbox = "allow-scripts allow-same-origin allow-forms allow-popups";
    private sdkContainer: HTMLDivElement | null = null;
    private sdkDashboard: { destroy?: () => void; dispose?: () => void } | null = null;

    /** Override mount to translate the structured Databricks AI/BI config
     *  shape into the GenericIframeAdapter's `url`-keyed shape. */
    async mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void> {
        const cfg = embedConfig as AibiConfig;
        const token = cfg.accessToken || cfg.token;
        const instanceUrl = cfg.instanceUrl || cfg.workspaceUrl;
        if (token && instanceUrl && cfg.workspaceId && cfg.dashboardId && containerEl) {
            const moduleName = "@databricks/aibi-client";
            try {
                const mod = await import(/* @vite-ignore */ moduleName) as {
                    DatabricksDashboard?: new (args: Record<string, unknown>) => { initialize?: () => Promise<void> | void; destroy?: () => void; dispose?: () => void };
                };
                if (!mod.DatabricksDashboard) throw new Error("DatabricksDashboard export missing");
                const sdkContainer = document.createElement("div");
                sdkContainer.style.width = "100%";
                sdkContainer.style.height = "100%";
                containerEl.appendChild(sdkContainer);
                const dashboard = new mod.DatabricksDashboard({
                    instanceUrl,
                    workspaceId: cfg.workspaceId,
                    dashboardId: cfg.dashboardId,
                    token,
                    container: sdkContainer,
                    config: {
                        version: 1,
                        hideDatabricksLogo: cfg.hideDatabricksLogo === true,
                    },
                });
                this.sdkContainer = sdkContainer;
                this.sdkDashboard = dashboard;
                await dashboard.initialize?.();
                return;
            } catch (err) {
                if (!cfg.url && !cfg.workspaceUrl) {
                    throw new Error(`${BI_ERR.EMBED_FAILED}: Databricks AI/BI SDK load failed and no iframe fallback URL was provided (${err instanceof Error ? err.message : String(err)}).`);
                }
            }
        }
        const resolvedUrl = buildAibiEmbedUrl(cfg);
        return super.mount(containerEl, { ...cfg, url: resolvedUrl });
    }

    destroy(): void {
        if (this.sdkDashboard) {
            try { this.sdkDashboard.destroy?.(); }
            catch { /* vendor cleanup should not break host unmount */ }
            try { this.sdkDashboard.dispose?.(); }
            catch { /* vendor cleanup should not break host unmount */ }
            this.sdkDashboard = null;
        }
        if (this.sdkContainer?.parentElement) this.sdkContainer.parentElement.removeChild(this.sdkContainer);
        this.sdkContainer = null;
        super.destroy();
    }
}
