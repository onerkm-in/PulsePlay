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
import {
    NATIVE_BI_CAPABILITIES,
    NATIVE_RENDERER_CAPABILITIES,
} from "./nativeCapabilities";
import {
    commandKind,
    isNativeRendererCommand,
    type NativeBICommand,
    type NativeRendererCommand,
} from "./nativeCommands";
import type { NativeEvent, NativeEventHandler, NativeEventType } from "./nativeEvents";

type NativeRenderStatus = "empty" | "result-accepted" | "spec-accepted";

export class NativeBIAdapter implements BIAdapter {
    readonly vendor = "native";
    readonly displayName = "Native result canvas";

    private containerEl: HTMLElement | null = null;
    private rootEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private listeners = new Map<NativeEventType, Set<NativeEventHandler>>();
    private renderStatus: NativeRenderStatus = "empty";

    capabilities(): BICapabilities {
        return { ...NATIVE_BI_CAPABILITIES };
    }

    nativeCapabilities(): typeof NATIVE_RENDERER_CAPABILITIES {
        return NATIVE_RENDERER_CAPABILITIES;
    }

    async mount(containerEl: HTMLElement | null, _embedConfig: BIEmbedConfig): Promise<void> {
        if (!containerEl) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: NativeBIAdapter requires a container element`);
        }

        this.detachDom();
        this.containerEl = containerEl;

        const root = document.createElement("section");
        root.className = "pp-native-bi";
        root.setAttribute("data-native-bi-adapter", "true");
        root.setAttribute("role", "region");
        root.setAttribute("aria-label", "Native result canvas");
        root.style.width = "100%";
        root.style.height = "100%";
        root.style.display = "grid";
        root.style.placeItems = "center";
        root.style.padding = "24px";
        root.style.boxSizing = "border-box";

        const message = document.createElement("div");
        message.className = "pp-native-bi__empty";
        message.style.maxWidth = "460px";
        message.style.textAlign = "center";
        message.style.color = "var(--pp-text-muted, #475569)";

        const title = document.createElement("strong");
        title.textContent = "Native result canvas";
        title.style.display = "block";
        title.style.marginBottom = "6px";
        title.style.color = "var(--pp-text, #0f172a)";

        const status = document.createElement("span");
        status.setAttribute("data-native-bi-status", "empty");
        status.textContent = "Ask Pulse a question to render the AI result here.";

        message.appendChild(title);
        message.appendChild(status);
        root.appendChild(message);
        containerEl.appendChild(root);

        this.rootEl = root;
        this.statusEl = status;
        this.renderStatus = "empty";

        this.emit({ type: "loaded", payload: { mode: "native", status: this.renderStatus } });
        this.emit({ type: "ready", payload: { mode: "native", capabilities: NATIVE_RENDERER_CAPABILITIES } });
    }

    on(eventType: BIEventType, handler: (event: BIEvent) => void): () => void;
    on(eventType: NativeEventType, handler: NativeEventHandler): () => void;
    on(eventType: NativeEventType, handler: NativeEventHandler | ((event: BIEvent) => void)): () => void {
        const nativeHandler = handler as NativeEventHandler;
        if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set());
        this.listeners.get(eventType)!.add(nativeHandler);
        return () => this.listeners.get(eventType)?.delete(nativeHandler);
    }

    async send(command: BICommand): Promise<void>;
    async send(command: NativeBICommand): Promise<void>;
    async send(command: NativeBICommand): Promise<void> {
        if (!this.rootEl) {
            throw new Error(`${BI_ERR.NOT_MOUNTED}: native adapter not mounted`);
        }

        if (!isNativeRendererCommand(command)) {
            const kind = commandKind(command);
            this.emit({
                type: "error",
                payload: {
                    code: BI_ERR.UNSUPPORTED_COMMAND,
                    command: kind,
                    reason: "native adapter is renderer-only",
                },
            });
            throw new Error(`${BI_ERR.UNSUPPORTED_COMMAND}: native adapter rejects ${kind}`);
        }

        this.handleRendererCommand(command);
    }

    destroy(): void {
        this.listeners.clear();
        this.detachDom();
    }

    private detachDom(): void {
        if (this.rootEl?.parentElement) {
            this.rootEl.parentElement.removeChild(this.rootEl);
        }
        this.containerEl = null;
        this.rootEl = null;
        this.statusEl = null;
        this.renderStatus = "empty";
    }

    async getMetadata(): Promise<BIMetadata | null> {
        if (!this.rootEl) return null;
        return {
            activeViewId: "native-result-canvas",
            visibleMeasures: [],
            visibleDimensions: [],
            activeFilters: [],
        };
    }

    private handleRendererCommand(command: NativeRendererCommand): void {
        switch (command.kind) {
            case "renderResult":
                this.renderStatus = "result-accepted";
                this.setStatus("AI result accepted.");
                this.emitRendered("result");
                return;
            case "renderSpec":
                this.renderStatus = "spec-accepted";
                this.setStatus("Chart render spec accepted.");
                this.emitRendered("spec");
                return;
            case "clear":
                this.renderStatus = "empty";
                this.setStatus("Ask Pulse a question to render the AI result here.");
                this.statusEl?.setAttribute("data-native-bi-status", "empty");
                this.emit({ type: "view-context", payload: { status: this.renderStatus } });
                return;
            case "setTheme":
                if (command.theme) this.rootEl?.setAttribute("data-native-theme", command.theme);
                this.emit({ type: "view-context", payload: { status: this.renderStatus, theme: command.theme ?? null } });
                return;
            case "resize":
                this.emit({
                    type: "view-context",
                    payload: {
                        status: this.renderStatus,
                        width: command.width ?? null,
                        height: command.height ?? null,
                    },
                });
                return;
        }
    }

    private setStatus(text: string): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.setAttribute("data-native-bi-status", this.renderStatus);
    }

    private emitRendered(source: "result" | "spec"): void {
        const payload = { mode: "native", status: this.renderStatus, source };
        this.emit({ type: "rendered", payload });
        this.emit({ type: "view-context", payload });
    }

    private emit(event: NativeEvent): void {
        this.listeners.get(event.type)?.forEach(handler => {
            try { handler(event); } catch { /* listener errors must not break adapter lifecycle */ }
        });
    }
}
