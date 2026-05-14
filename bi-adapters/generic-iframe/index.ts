// bi-adapters/generic-iframe/index.ts
//
// The escape hatch. Pass any URL, get an iframe. No vendor SDK, no
// embed token, no event bridge — but it always works for the "I just
// want to see this thing in PulsePlay" path. Useful for demoing,
// internal dashboards, hosted Looker Studios, public Tableau Public
// vizzes, anything with a permissive frame-ancestors policy.
//
// When you outgrow this adapter for a specific vendor, swap to the
// vendor-specific one (powerbi/tableau/qlik/looker) which uses the
// vendor's JS SDK to wire up event + command bridges.

import type {
    BIAdapter,
    BICapabilities,
    BICommand,
    BIEmbedConfig,
    BIEvent,
    BIEventType,
    BIMetadata,
} from "../../playground/src/biPanel/BIAdapter";
import { BI_ERR } from "../../playground/src/biPanel/BIAdapter";

interface GenericConfig extends BIEmbedConfig {
    url: string;
    /** Optional title shown in the panel header. Falls back to the URL host. */
    title?: string;
    /** Optional sandbox attribute override. Default is loose-but-safe:
     *  allow-scripts + allow-same-origin (needed for most vendor SDKs that
     *  load inside the iframe to talk to their own backend). */
    sandbox?: string;
    /** Defense-in-depth allowlist of permitted iframe hostnames. When
     *  non-empty, the adapter refuses to mount any URL whose hostname is
     *  not in this list — closes the L2 cleanup loophole where a caller
     *  could bypass BIPanel's pre-mount check. Empty/undefined = no check
     *  (callers that already validated upstream still work). */
    allowedOrigins?: string[];
}

/** Throws if `url`'s hostname is not in `allowedOrigins`. No-op when
 *  `allowedOrigins` is undefined or empty (callers that already validated
 *  upstream still work). Exported for reuse by vendor subclasses. */
export function assertIframeOriginAllowed(url: string, allowedOrigins: string[] | undefined): void {
    if (!allowedOrigins || allowedOrigins.length === 0) return;
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); }
    catch { throw new Error(`${BI_ERR.EMBED_FAILED}: embed URL is not a valid URL`); }
    const normalized = allowedOrigins.map(o => o.trim().toLowerCase()).filter(Boolean);
    if (!normalized.includes(host)) {
        throw new Error(
            `${BI_ERR.EMBED_FAILED}: embed URL hostname "${host}" is not in your organization's allowed origins. Allowed: ${normalized.join(", ") || "(empty)"}.`,
        );
    }
}

export class GenericIframeAdapter implements BIAdapter {
    // Typed as `string` (not literal "generic-iframe") so vendor-specific
    // subclasses (LookerAdapter, QlikAdapter, TableauAdapter) can override
    // these to their own labels without TS2416 errors.
    readonly vendor: string = "generic-iframe";
    readonly displayName: string = "Generic iframe";
    /** Vendor-specific subclasses override this with the minimum sandbox
     *  attribute their embed needs. `cfg.sandbox` (per-mount override) still
     *  wins over this; this is just the default the adapter ships with so
     *  deployers who don't tune per-mount get a vendor-tight default rather
     *  than the loose-but-safe baseline. */
    protected defaultSandbox: string = "allow-scripts allow-same-origin allow-forms allow-popups";
    private iframe: HTMLIFrameElement | null = null;
    private listeners = new Map<BIEventType, Set<(e: BIEvent) => void>>();

    capabilities(): BICapabilities {
        // Generic iframe has no vendor-specific event/command bridge, so
        // capabilities are minimal. The user can navigate inside the
        // iframe but PulsePlay doesn't know about it.
        return {
            canNavigatePages: false,
            canApplyFilters: false,
            canExport: false,
            canRefresh: true,           // we can force-reload the iframe
            canFullscreen: true,        // we can wrap the panel in fullscreen
            requiresContainerEl: true,  // we paint an iframe into the container
        };
    }

    async mount(containerEl: HTMLElement | null, embedConfig: BIEmbedConfig): Promise<void> {
        if (!containerEl) throw new Error(`${BI_ERR.NOT_MOUNTED}: GenericIframeAdapter requires a container element`);
        const cfg = embedConfig as GenericConfig;
        if (!cfg.url) throw new Error(`${BI_ERR.EMBED_FAILED}: generic-iframe requires { url }`);
        // L2 defense in depth — refuse to mount any URL whose hostname is
        // outside the per-vendor allowlist. BIPanel performs the same
        // check before calling mount; this is the lower-layer gate so a
        // caller that imports the adapter directly still hits it.
        assertIframeOriginAllowed(cfg.url, cfg.allowedOrigins);

        const iframe = document.createElement("iframe");
        iframe.src = cfg.url;
        iframe.title = cfg.title || `Embedded view (${new URL(cfg.url).host})`;
        iframe.setAttribute("sandbox", cfg.sandbox || this.defaultSandbox);
        iframe.setAttribute("loading", "lazy");
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "0";

        // Best-effort load notification — `load` fires for any same-origin
        // navigation; for cross-origin it fires once. Either way, it's a
        // useful "the iframe started rendering something" signal.
        iframe.addEventListener("load", () => {
            this.emit({ type: "loaded", payload: { url: cfg.url } });
        });

        containerEl.appendChild(iframe);
        this.iframe = iframe;
    }

    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void {
        if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set());
        this.listeners.get(eventType)!.add(handler);
        return () => this.listeners.get(eventType)?.delete(handler);
    }

    async send(command: BICommand): Promise<void> {
        // Contract gate (BIAdapter conformance) — commands issued before
        // mount or after destroy must reject with NOT_MOUNTED, not
        // UNSUPPORTED_COMMAND. Mount state is what's actually missing.
        if (!this.iframe) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: generic-iframe adapter not mounted`);
        }
        if (command.kind === "refresh") {
            // Force reload by reassigning src
            const src = this.iframe.src;
            this.iframe.src = "about:blank";
            // micro-task gap so the unload registers
            await new Promise(r => setTimeout(r, 0));
            this.iframe.src = src;
            return;
        }
        if (command.kind === "fullscreen") {
            const target = this.iframe.parentElement;
            if (target) {
                if (command.on && document.fullscreenEnabled) await target.requestFullscreen();
                else if (!command.on && document.fullscreenElement) await document.exitFullscreen();
            }
            return;
        }
        // Navigation / filter / export aren't reachable via a generic
        // iframe — vendor SDK would be needed.
        throw new Error(`${BI_ERR.UNSUPPORTED_COMMAND}: generic-iframe cannot ${command.kind}`);
    }

    destroy(): void {
        this.listeners.clear();
        if (this.iframe?.parentElement) {
            this.iframe.parentElement.removeChild(this.iframe);
        }
        this.iframe = null;
    }

    /**
     * Iframe-only adapters (GenericIframeAdapter + Tableau/Qlik/Looker
     * vendor stubs that extend it) cannot introspect what the user is
     * looking at — there is no vendor SDK to query for visible measures,
     * dimensions, or active filters. Returning `null` here is explicit:
     * downstream Discovery Loop falls back to pack-only signals and the
     * FramePicker honestly reports unreachable analysis frames that need
     * live metadata.
     *
     * Vendor adapters that graduate from iframe stubs (e.g. when the
     * Tableau Embedding API v3 wiring lands in v0.3+) override this with
     * a real implementation reading from their SDK. The PowerBIAdapter
     * already overrides this with a `getActivePage` + `getVisuals` +
     * `getFilters` walk — see `bi-adapters/powerbi/index.ts`.
     */
    async getMetadata(): Promise<BIMetadata | null> {
        return null;
    }

    private emit(event: BIEvent): void {
        this.listeners.get(event.type)?.forEach(h => {
            try { h(event); } catch { /* listener errors don't break the adapter */ }
        });
    }
}
