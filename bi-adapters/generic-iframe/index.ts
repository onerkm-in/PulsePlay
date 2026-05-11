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
}

export class GenericIframeAdapter implements BIAdapter {
    // Typed as `string` (not literal "generic-iframe") so vendor-specific
    // subclasses (LookerAdapter, QlikAdapter, TableauAdapter) can override
    // these to their own labels without TS2416 errors.
    readonly vendor: string = "generic-iframe";
    readonly displayName: string = "Generic iframe";
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

        const iframe = document.createElement("iframe");
        iframe.src = cfg.url;
        iframe.title = cfg.title || `Embedded view (${new URL(cfg.url).host})`;
        iframe.setAttribute("sandbox", cfg.sandbox || "allow-scripts allow-same-origin allow-forms allow-popups");
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

    private emit(event: BIEvent): void {
        this.listeners.get(event.type)?.forEach(h => {
            try { h(event); } catch { /* listener errors don't break the adapter */ }
        });
    }
}
