// bi-adapters/powerbi/index.ts
//
// Power BI adapter — Cycle A graduation from iframe stub to the real
// powerbi-client SDK. Implements the full BIAdapter contract:
//
//   • mount()    — calls service.embed(containerEl, config) and stashes
//                  the returned Report instance for later command/event
//                  routing.
//   • on()       — subscribes to PBI-native events (loaded, error,
//                  pageChanged, filtersApplied, dataSelected,
//                  dataRefreshed) and translates each payload into the
//                  vendor-agnostic BIEvent shape the AI sidebar consumes.
//   • send()     — translates BICommand → report.setFilters /
//                  removeFilters / setPage / refresh / fullscreen.
//                  `export` is intentionally UNSUPPORTED in v0; the
//                  Power BI Export-to-File path needs a server route
//                  (next cycle).
//   • destroy()  — service.reset(containerEl) tears down the iframe
//                  the SDK injected and drops listeners.
//
// Why not extend GenericIframeAdapter anymore? The SDK manages its own
// iframe (with its own sandbox attribute, postMessage bridge, and
// teardown semantics). Inheriting iframe behaviour from the generic
// adapter would duplicate state and confuse cleanup.
//
// Embed token issuance happens server-side via /assistant/embed-token/powerbi
// (proxy route added in cycle A). The browser only ever sees the
// short-lived embed token; the Azure AD client secret never leaves the
// proxy.

// powerbi-client re-exports `models` (the powerbi-models module) as a
// named property, so we can pull both the service surface and the type
// vocabulary from a single dependency. Avoids dragging powerbi-models
// in as a separate root dep just for filter/permission enums.
import * as powerbi from "powerbi-client";
import { models as pbiModels } from "powerbi-client";
import type {
    BIAdapter,
    BICapabilities,
    BICommand,
    BIEmbedConfig,
    BIEvent,
    BIEventType,
} from "../../playground/src/biPanel/BIAdapter";
import { BI_ERR } from "../../playground/src/biPanel/BIAdapter";

/**
 * Shape the host passes to mount(). EmbedConfigForm produces this when
 * the user picks the Power BI vendor. Supported modes:
 *   • Secure embed quick preview: the Power BI portal's reportEmbed URL
 *     is rendered in a plain iframe. This is fast to configure but does
 *     not expose the JS SDK command/event surface.
 *   • SSO mode: MSAL obtains a user AAD token and the SDK embeds with
 *     tokenType "Aad".
 *   • Backend-issued mode: form posts to /assistant/embed-token/powerbi
 *     and fills accessToken + embedUrl from the response.
 *   • Manual paste mode (dev only): user pastes both values directly.
 *
 * `id` is the report ID; `permissions` controls View vs Edit. We default
 * to "report" embed type (dashboards / tiles need separate code paths
 * that v0 doesn't bother with).
 */
export interface PowerBIEmbedConfig extends BIEmbedConfig {
    /** Power BI report ID (GUID). */
    id?: string;
    /** Workspace (group) ID. Optional but recommended for non-personal workspaces. */
    groupId?: string;
    /** Dataset ID. Optional but recommended when the report is connected to a non-default dataset. */
    datasetId?: string;
    /** Embed URL - from the portal, metadata API, GenerateToken response, or manual paste. */
    embedUrl?: string;
    /** The embed token (short-lived JWT) or AAD user token. Not used by secure iframe mode. */
    accessToken?: string;
    /** Optional duplicate URL for iframe-style hosts. */
    url?: string;
    /** Explicitly select the portal secure-embed iframe path. */
    embedMode?: "secure" | "sdk";
    /** Legacy/host-friendly marker for the quick-preview path. */
    mode?: "secure-embed";
    /** What type of artifact is being embedded. v0 only supports "report". */
    type?: "report";
    /** Token type — almost always "Embed" for embed-tokens, but "Aad" is
     *  legal when embedding-for-your-org with a user AAD token. */
    tokenType?: "Embed" | "Aad";
    /** "View" (default) or "Edit". */
    permissions?: "View" | "Edit";
    /** Secure iframe title and sandbox override. */
    title?: string;
    sandbox?: string;
    /** Defense-in-depth allowlist of permitted iframe hostnames. Enforced
     *  by the secure-iframe mount path so a caller that bypasses BIPanel
     *  still gets the L2 gate. SDK embed mode is not affected — the SDK
     *  manages its own iframe whose URL is the validated embedUrl. */
    allowedOrigins?: string[];
}

/** L2 defense-in-depth allowlist gate for the secure-iframe path. Mirrors
 *  the generic-iframe adapter's helper so the powerbi adapter doesn't
 *  reach across the bi-adapters/ tree at runtime. */
function assertPowerBIOriginAllowed(url: string, allowedOrigins: string[] | undefined): void {
    if (!allowedOrigins || allowedOrigins.length === 0) return;
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); }
    catch { throw new Error(`${BI_ERR.EMBED_FAILED}: powerbi secure embed URL is not a valid URL`); }
    const normalized = allowedOrigins.map(o => o.trim().toLowerCase()).filter(Boolean);
    if (!normalized.includes(host)) {
        throw new Error(
            `${BI_ERR.EMBED_FAILED}: powerbi secure embed hostname "${host}" is not in your organization's allowed origins. Allowed: ${normalized.join(", ") || "(empty)"}.`,
        );
    }
}

/** Resolve the Power BI factory once. The SDK exposes a singleton
 *  `service.Service` we instantiate with default factories. Tests inject
 *  a fake via __setPowerBIServiceForTests below. */
let _service: powerbi.service.Service | null = null;
function getService(): powerbi.service.Service {
    if (_service) return _service;
    _service = new powerbi.service.Service(
        powerbi.factories.hpmFactory,
        powerbi.factories.wpmpFactory,
        powerbi.factories.routerFactory
    );
    return _service;
}

/** Test seam — swap in a fake service so unit tests can drive embed/reset
 *  without instantiating the real SDK against jsdom (which doesn't have
 *  the postMessage bridge powerbi-client expects). */
export function __setPowerBIServiceForTests(svc: powerbi.service.Service | null): void {
    _service = svc;
}

// PBI native event names we care about. Keep this map in one place so
// future event types (e.g. `bookmarkApplied`) only need to be added once.
const PBI_EVENT_MAP: Record<BIEventType, string[]> = {
    loaded: ["loaded", "rendered"],
    "page-changed": ["pageChanged"],
    "filter-applied": ["filtersApplied"],
    "selection-made": ["dataSelected"],
    "data-refreshed": ["dataRefreshed"],
    error: ["error"],
};

const FULL_SDK_CAPABILITIES: BICapabilities = {
    canNavigatePages: true,
    canApplyFilters: true,
    canExport: false,           // v0 - server-side Export-to-File comes later
    canRefresh: true,
    canFullscreen: true,
    requiresContainerEl: true,
};

const SECURE_IFRAME_CAPABILITIES: BICapabilities = {
    canNavigatePages: false,
    canApplyFilters: false,
    canExport: false,
    canRefresh: true,
    canFullscreen: true,
    requiresContainerEl: true,
};

const DEFAULT_SECURE_IFRAME_SANDBOX = [
    "allow-scripts",
    "allow-same-origin",
    "allow-forms",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
].join(" ");

type PowerBIMountMode = "unmounted" | "sdk" | "secure-iframe";

export interface PowerBIDeveloperSnapshot {
    vendor: "powerbi";
    displayName: "Power BI";
    mountMode: PowerBIMountMode;
    permissions: "View" | "Edit";
    capabilities: BICapabilities;
    iframe?: { src: string };
    pages?: Array<{ name?: string; displayName?: string; isActive?: boolean }>;
    activePage?: { name?: string; displayName?: string };
    filters?: unknown[];
    notes: string[];
    errors: string[];
}

/** Vendor-neutral shape of the event payload powerbi-client passes to
 *  `report.on(name, handler)`. The SDK types this as `IEvent<TDetail>`
 *  in service.d.ts but doesn't re-export it from `powerbi-client`'s
 *  top-level — so we declare a minimal local interface and cast at
 *  the boundary. The `detail` is whatever the SDK forwards (page info,
 *  filter array, datapoints, etc.); each event-type handler narrows
 *  it via `normalizeEventPayload()`. */
interface PbiCustomEvent {
    detail: unknown;
}

/** Tracks live event subscriptions so destroy() can detach them all. */
interface SubscriptionRecord {
    eventType: BIEventType;
    pbiEventName: string;
    pbiHandler: (event: PbiCustomEvent | undefined) => void;
}

export class PowerBIAdapter implements BIAdapter {
    readonly vendor = "powerbi";
    readonly displayName = "Power BI";

    private report: powerbi.Report | null = null;
    private iframe: HTMLIFrameElement | null = null;
    private containerEl: HTMLElement | null = null;
    private listeners = new Map<BIEventType, Set<(e: BIEvent) => void>>();
    private subs: SubscriptionRecord[] = [];
    private permissionsLevel: "View" | "Edit" = "View";
    private mountMode: PowerBIMountMode = "unmounted";

    capabilities(): BICapabilities {
        return this.mountMode === "secure-iframe"
            ? { ...SECURE_IFRAME_CAPABILITIES }
            : { ...FULL_SDK_CAPABILITIES };
    }

    async mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void> {
        if (!containerEl) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: PowerBIAdapter requires a container element`);
        }
        const cfg = embedConfig as PowerBIEmbedConfig;
        if (isSecureEmbedConfig(cfg)) {
            this.mountSecureIframe(containerEl, cfg);
            return;
        }

        if (!cfg.id || !cfg.embedUrl || !cfg.accessToken) {
            throw new Error(
                `${BI_ERR.EMBED_FAILED}: powerbi adapter requires { id, embedUrl, accessToken }`
            );
        }

        this.containerEl = containerEl;
        this.permissionsLevel = cfg.permissions || "View";
        this.mountMode = "sdk";

        const tokenType = cfg.tokenType === "Aad"
            ? pbiModels.TokenType.Aad
            : pbiModels.TokenType.Embed;
        const permissions = this.permissionsLevel === "Edit"
            ? pbiModels.Permissions.All
            : pbiModels.Permissions.Read;

        // The SDK accepts an IReportEmbedConfiguration. We declare type:"report"
        // explicitly — dashboards / tiles need separate code paths v0 doesn't
        // implement.
        const embedConfiguration: pbiModels.IReportEmbedConfiguration = {
            type: "report",
            id: cfg.id,
            embedUrl: cfg.embedUrl,
            accessToken: cfg.accessToken,
            tokenType,
            permissions,
            settings: {
                // Filter pane visibility defaults to true — let the user see
                // what filters are applied. Authors can tweak via the SDK
                // post-mount if they really want a stripped UI.
                panes: {
                    filters: { visible: true },
                    pageNavigation: { visible: true },
                },
            },
        };

        const svc = getService();
        const embedded = svc.embed(containerEl, embedConfiguration);
        // Type narrowing: svc.embed() returns Embed which Report extends.
        // The cast is documented at the boundary because powerbi-client's
        // public surface returns the base class.
        this.report = embedded as powerbi.Report;

        // The Power BI SDK fires "loaded" once the model + visuals are
        // initialised. We mirror it through our canonical pipeline so the
        // host's onEvent callback sees it (BIPanel subscribes after mount).
        // No need to pre-emit here — when the host calls `on("loaded", …)`
        // the subscription will catch the SDK's own loaded event.
    }

    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void {
        // Keep the host-facing listener set so destroy() can clear it cleanly.
        if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set());
        this.listeners.get(eventType)!.add(handler);

        // Lazily attach the SDK-side event handler the first time anyone
        // subscribes for this event type. Subsequent host subscriptions
        // share the same SDK handler — the listeners-set fans out.
        const alreadyBridged = this.subs.some(s => s.eventType === eventType);
        if (!alreadyBridged && this.report) {
            for (const pbiEventName of PBI_EVENT_MAP[eventType]) {
                const pbiHandler = (event: PbiCustomEvent | undefined) => {
                    this.emit({
                        type: eventType,
                        payload: this.normalizeEventPayload(eventType, pbiEventName, event),
                    });
                };
                this.report.on(pbiEventName, pbiHandler);
                this.subs.push({ eventType, pbiEventName, pbiHandler });
            }
        }

        return () => {
            this.listeners.get(eventType)?.delete(handler);
        };
    }

    async send(command: BICommand): Promise<void> {
        if (this.mountMode === "secure-iframe") {
            return this.sendSecureIframeCommand(command);
        }
        if (!this.report) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: powerbi adapter not mounted`);
        }
        switch (command.kind) {
            case "navigate-to-page": {
                await this.report.setPage(command.pageId);
                return;
            }
            case "apply-filter": {
                const filter = buildBasicFilter(command.field, command.values);
                // setFilters replaces the report-level filter set; updateFilters
                // would patch in additive mode but the SDK's typings around it
                // are inconsistent across 2.x. setFilters with the full intended
                // set is the safest portable option for v0.
                await this.report.setFilters([filter]);
                return;
            }
            case "clear-filter": {
                if (!command.field) {
                    await this.report.removeFilters();
                    return;
                }
                // Filter field-level removal: PBI's removeFilters doesn't take
                // a target by field, so we read current filters, drop matching
                // ones, and set the remainder.
                const current = await this.report.getFilters();
                const remaining = current.filter((f: pbiModels.IFilter) => {
                    const target = f.target as pbiModels.IFilterColumnTarget | undefined;
                    return !target || target.column !== command.field;
                });
                await this.report.setFilters(remaining);
                return;
            }
            case "refresh": {
                await this.report.refresh();
                return;
            }
            case "fullscreen": {
                if (command.on) this.report.fullscreen();
                else this.report.exitFullscreen();
                return;
            }
            case "export": {
                // v0 — Power BI's Export-to-File needs a server-side
                // /reports/{id}/ExportTo path; punt to next cycle.
                throw new Error(`${BI_ERR.UNSUPPORTED_COMMAND}: powerbi export-to-file not yet wired`);
            }
            default: {
                // Exhaustiveness — TypeScript will surface a never-type error
                // here if a new BICommand variant is added without a case.
                const _exhaustive: never = command;
                void _exhaustive;
                throw new Error(`${BI_ERR.UNSUPPORTED_COMMAND}: unknown command`);
            }
        }
    }

    async getDeveloperSnapshot(): Promise<PowerBIDeveloperSnapshot> {
        const snapshot: PowerBIDeveloperSnapshot = {
            vendor: "powerbi",
            displayName: "Power BI",
            mountMode: this.mountMode,
            permissions: this.permissionsLevel,
            capabilities: this.capabilities(),
            notes: [],
            errors: [],
        };

        if (this.mountMode === "secure-iframe") {
            snapshot.iframe = { src: this.iframe?.src || "" };
            snapshot.notes.push("Secure embed preview is iframe-only. Use AAD SSO or service-principal mode for Power BI JavaScript API calls.");
            return snapshot;
        }

        if (!this.report) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: powerbi adapter not mounted`);
        }

        const report = this.report as unknown as {
            getPages?: () => Promise<Array<{ name?: string; displayName?: string; isActive?: boolean }>>;
            getActivePage?: () => Promise<{ name?: string; displayName?: string }>;
            getFilters?: () => Promise<unknown[]>;
        };

        if (typeof report.getPages === "function") {
            try {
                snapshot.pages = await report.getPages();
            } catch (err) {
                snapshot.errors.push(`getPages failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (typeof report.getActivePage === "function") {
            try {
                snapshot.activePage = await report.getActivePage();
            } catch (err) {
                snapshot.errors.push(`getActivePage failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (typeof report.getFilters === "function") {
            try {
                snapshot.filters = await report.getFilters();
            } catch (err) {
                snapshot.errors.push(`getFilters failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        snapshot.notes.push("Snapshot comes from the live powerbi-client report instance.");
        return snapshot;
    }

    destroy(): void {
        // Remove every PBI-native listener we attached so subsequent
        // mounts don't double-fire.
        if (this.report) {
            for (const sub of this.subs) {
                try { this.report.off(sub.pbiEventName, sub.pbiHandler); } catch { /* best effort */ }
            }
        }
        this.subs = [];
        this.listeners.clear();

        // Tear down the SDK iframe (when SDK mode injected it) plus local
        // secure iframe bookkeeping.
        if (this.containerEl && this.report) {
            try { getService().reset(this.containerEl); } catch { /* best effort */ }
        }
        if (this.iframe?.parentElement) {
            try { this.iframe.parentElement.removeChild(this.iframe); } catch { /* best effort */ }
        }
        this.iframe = null;
        this.report = null;
        this.containerEl = null;
        this.mountMode = "unmounted";
    }

    private mountSecureIframe(containerEl: HTMLElement, cfg: PowerBIEmbedConfig): void {
        const src = String(cfg.embedUrl || cfg.url || "").trim();
        if (!src) {
            throw new Error(
                `${BI_ERR.EMBED_FAILED}: powerbi secure embed requires a reportEmbed URL`
            );
        }
        if (!isPowerBIReportEmbedUrl(src)) {
            throw new Error(
                `${BI_ERR.EMBED_FAILED}: powerbi secure embed URL must be an app.powerbi.com/reportEmbed URL`
            );
        }
        assertPowerBIOriginAllowed(src, cfg.allowedOrigins);

        this.containerEl = containerEl;
        this.permissionsLevel = "View";
        this.mountMode = "secure-iframe";

        containerEl.textContent = "";
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.title = cfg.title || "Power BI secure embed";
        iframe.setAttribute("sandbox", cfg.sandbox || DEFAULT_SECURE_IFRAME_SANDBOX);
        iframe.setAttribute("allow", "fullscreen");
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.minHeight = "420px";
        iframe.style.border = "0";
        iframe.addEventListener("load", () => {
            this.emit({
                type: "loaded",
                payload: { embedMode: "secure", url: src },
            });
        });
        containerEl.appendChild(iframe);
        this.iframe = iframe;
    }

    private async sendSecureIframeCommand(command: BICommand): Promise<void> {
        if (!this.iframe) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: powerbi secure embed not mounted`);
        }
        switch (command.kind) {
            case "refresh": {
                const currentSrc = this.iframe.src;
                this.iframe.src = currentSrc;
                return;
            }
            case "fullscreen": {
                const target = this.containerEl || this.iframe;
                if (command.on) {
                    await target.requestFullscreen?.();
                } else {
                    await document.exitFullscreen?.();
                }
                return;
            }
            case "navigate-to-page":
            case "apply-filter":
            case "clear-filter":
            case "export": {
                throw new Error(
                    `${BI_ERR.UNSUPPORTED_COMMAND}: powerbi secure embed is preview-only; use AAD SSO or service-principal mode for SDK commands`
                );
            }
            default: {
                const _exhaustive: never = command;
                void _exhaustive;
                throw new Error(`${BI_ERR.UNSUPPORTED_COMMAND}: unknown command`);
            }
        }
    }

    private emit(event: BIEvent): void {
        this.listeners.get(event.type)?.forEach(h => {
            try { h(event); } catch { /* listener errors don't break the adapter */ }
        });
    }

    /** Translate a Power BI event payload into a vendor-agnostic shape so
     *  the AI sidebar can reason about it without learning PBI's event
     *  vocabulary. We keep the raw payload available as `raw` for any
     *  callers that DO want vendor specifics. */
    private normalizeEventPayload(
        eventType: BIEventType,
        pbiEventName: string,
        event: PbiCustomEvent | undefined,
    ): unknown {
        const raw = event?.detail;
        switch (eventType) {
            case "page-changed": {
                const detail = (raw || {}) as { newPage?: { name?: string; displayName?: string } };
                return {
                    pageId: detail.newPage?.name,
                    pageName: detail.newPage?.displayName,
                    pbiEventName,
                    raw,
                };
            }
            case "filter-applied": {
                const detail = (raw || {}) as { filters?: unknown[] };
                return {
                    filters: detail.filters,
                    pbiEventName,
                    raw,
                };
            }
            case "selection-made": {
                const detail = (raw || {}) as { dataPoints?: unknown[] };
                return {
                    dataPoints: detail.dataPoints,
                    pbiEventName,
                    raw,
                };
            }
            case "loaded":
            case "data-refreshed":
            case "error":
            default: {
                return { pbiEventName, raw };
            }
        }
    }
}

function isSecureEmbedConfig(cfg: PowerBIEmbedConfig): boolean {
    if (cfg.embedMode === "secure" || cfg.mode === "secure-embed") return true;
    const url = String(cfg.embedUrl || cfg.url || "").trim();
    return !cfg.accessToken && isPowerBIReportEmbedUrl(url);
}

function isPowerBIReportEmbedUrl(input: string): boolean {
    try {
        const parsed = new URL(input);
        return parsed.protocol === "https:"
            && parsed.hostname.toLowerCase().endsWith("powerbi.com")
            && /\/reportEmbed$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * Build an IBasicFilter for `report.setFilters`. Single-column equality
 * is what the canonical BICommand vocabulary expresses; PBI's filter
 * tree is much richer but v0 doesn't need that complexity.
 *
 * The `target` is a column target — table is left empty so the SDK
 * resolves the column against whichever table actually has it. Authors
 * who need disambiguated targets (two tables, same column name) can
 * call report.setFilters directly.
 */
function buildBasicFilter(
    field: string,
    values: string[] | string | number | number[],
): pbiModels.IBasicFilter {
    const valueArray: (string | number)[] = Array.isArray(values) ? values : [values];
    return {
        $schema: "http://powerbi.com/product/schema#basic",
        target: { table: "", column: field },
        filterType: pbiModels.FilterType.Basic,
        operator: "In",
        values: valueArray,
        requireSingleSelection: false,
    };
}
