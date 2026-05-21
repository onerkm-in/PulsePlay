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
    isGovernanceAttestation,
    type GovernanceAttestation,
} from "../../playground/src/visualization/governance";
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
import {
    mountNativeCanvas,
    type NativeCanvasGovernanceState,
    type NativeCanvasHandle,
    type NativeCanvasMode,
} from "../../playground/src/visualization/NativeCanvas";

type NativeRenderStatus = NativeCanvasMode;
type NativeGovernanceState = NativeCanvasGovernanceState;

export interface NativeBIAdapterOptions {
    readonly requireGovernanceAttestation?: boolean;
}

function defaultRequireGovernanceAttestation(): boolean {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env || {};
    return env.PROD === true
        || env.MODE === "production"
        || env.VITE_PULSEPLAY_REQUIRE_GOVERNANCE === "true";
}

function governanceFromResult(result: unknown): GovernanceAttestation | null {
    if (!result || typeof result !== "object") return null;
    const governance = (result as { governance?: unknown }).governance;
    return isGovernanceAttestation(governance) ? governance : null;
}

export class NativeBIAdapter implements BIAdapter {
    readonly vendor = "native";
    readonly displayName = "Native result canvas";

    private readonly requireGovernanceAttestation: boolean;
    private containerEl: HTMLElement | null = null;
    private canvasHandle: NativeCanvasHandle | null = null;
    private listeners = new Map<NativeEventType, Set<NativeEventHandler>>();
    private renderStatus: NativeRenderStatus = "empty";
    private governanceState: NativeGovernanceState = { state: "not-applicable" };
    private currentEnvelope: unknown = null;
    private currentTheme: string | null = null;

    constructor(options: NativeBIAdapterOptions = {}) {
        this.requireGovernanceAttestation = options.requireGovernanceAttestation ?? defaultRequireGovernanceAttestation();
    }

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
        this.renderStatus = "empty";
        this.governanceState = { state: "not-applicable" };
        this.currentEnvelope = null;
        this.currentTheme = null;

        // Mount the React canvas inside the host container. NativeCanvas
        // owns DOM construction from here on; this adapter only updates
        // canvas props in response to renderer commands.
        this.canvasHandle = mountNativeCanvas(containerEl, this.canvasProps());

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
        if (!this.canvasHandle) {
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
        if (this.canvasHandle) {
            this.canvasHandle.unmount();
            this.canvasHandle = null;
        }
        // React's createRoot.unmount empties the container, but be
        // belt-and-braces in case a future React version leaves
        // residue: clear leftover children so existing tests that
        // assert `containerEl.querySelector('[data-native-bi-adapter]')`
        // returns null after destroy stay green.
        if (this.containerEl) {
            while (this.containerEl.firstChild) {
                this.containerEl.removeChild(this.containerEl.firstChild);
            }
        }
        this.containerEl = null;
        this.renderStatus = "empty";
        this.governanceState = { state: "not-applicable" };
        this.currentEnvelope = null;
        this.currentTheme = null;
    }

    async getMetadata(): Promise<BIMetadata | null> {
        if (!this.canvasHandle) return null;
        return {
            activeViewId: "native-result-canvas",
            visibleMeasures: [],
            visibleDimensions: [],
            activeFilters: [],
        };
    }

    private handleRendererCommand(command: NativeRendererCommand): void {
        // ─── Governance gate tripwire ──────────────────────────────────
        // The G3 governance gate runs ONLY on `renderResult`. `renderSpec`
        // is intentionally NOT gated here because renderer specs are not
        // trusted AI result envelopes — they are compiled chart shapes
        // already produced by the visualization pipeline FROM an attested
        // envelope. The contract is:
        //
        //   1. Host calls `renderResult` with the AI result envelope.
        //   2. Adapter checks `envelope.governance` here. Production with
        //      missing/invalid attestation throws NATIVE_GOVERNANCE_REQUIRED.
        //   3. Once governance is confirmed, the host may optionally call
        //      `renderSpec` with a compiled chart spec derived from the
        //      already-attested envelope.
        //
        // If a future caller starts sending raw or semi-trusted shapes
        // directly through `renderSpec` (bypassing `renderResult`), the
        // spec MUST either carry its own governance attestation OR this
        // code MUST be tightened to gate `renderSpec` too. Do not silently
        // widen the trust surface.
        // ───────────────────────────────────────────────────────────────
        switch (command.kind) {
            case "renderResult":
                this.acceptResult(command.result);
                return;
            case "renderSpec":
                this.renderStatus = "spec-accepted";
                this.governanceState = { state: "not-applicable" };
                this.currentEnvelope = null;
                this.syncCanvas();
                this.emitRendered("spec");
                return;
            case "clear":
                this.renderStatus = "empty";
                this.governanceState = { state: "not-applicable" };
                this.currentEnvelope = null;
                this.syncCanvas();
                this.emit({ type: "view-context", payload: { status: this.renderStatus, governance: this.governanceState } });
                return;
            case "setTheme":
                this.currentTheme = command.theme ?? null;
                this.syncCanvas();
                this.emit({ type: "view-context", payload: { status: this.renderStatus, theme: command.theme ?? null, governance: this.governanceState } });
                return;
            case "resize":
                // Canvas re-rendering is handled by ResizeObserver inside
                // the chart state; nothing the adapter needs to push here.
                // Still emit the view-context event so observers can
                // track sizing if they care.
                this.emit({
                    type: "view-context",
                    payload: {
                        status: this.renderStatus,
                        width: command.width ?? null,
                        height: command.height ?? null,
                        governance: this.governanceState,
                    },
                });
                return;
        }
    }

    private acceptResult(result: unknown): void {
        const attestation = governanceFromResult(result);
        if (!attestation && this.requireGovernanceAttestation) {
            this.renderStatus = "result-blocked";
            this.governanceState = { state: "blocked", reason: "no-governance-attestation" };
            this.currentEnvelope = null;
            this.syncCanvas();
            const payload = {
                mode: "native",
                status: this.renderStatus,
                source: "result" as const,
                governance: this.governanceState,
            };
            this.emit({
                type: "error",
                payload: {
                    code: "NATIVE_GOVERNANCE_REQUIRED",
                    reason: "no-governance-attestation",
                },
            });
            this.emit({ type: "view-context", payload });
            throw new Error("NATIVE_GOVERNANCE_REQUIRED: native adapter requires proxy governance attestation");
        }

        if (!attestation) {
            this.renderStatus = "ungoverned-result-preview";
            this.governanceState = { state: "preview", reason: "no-governance-attestation" };
            this.currentEnvelope = result;
            this.syncCanvas();
            this.emitRendered("result");
            return;
        }

        this.renderStatus = "result-accepted";
        this.governanceState = {
            state: "enforced",
            authority: attestation.authority,
            requestId: attestation.requestId,
        };
        this.currentEnvelope = result;
        this.syncCanvas();
        this.emitRendered("result");
    }

    private canvasProps() {
        return {
            mode: this.renderStatus,
            envelope: this.currentEnvelope,
            governanceState: this.governanceState,
            theme: this.currentTheme,
        } as const;
    }

    private syncCanvas(): void {
        this.canvasHandle?.update(this.canvasProps());
    }

    private emitRendered(source: "result" | "spec"): void {
        const payload = { mode: "native", status: this.renderStatus, source, governance: this.governanceState };
        this.emit({ type: "rendered", payload });
        this.emit({ type: "view-context", payload });
    }

    private emit(event: NativeEvent): void {
        const handlers = this.listeners.get(event.type);
        if (!handlers) return;
        // Snapshot to an Array before iterating to deterministically
        // exclude additions made during emit. Re-check Set membership
        // before each handler call so deletions made during emit DO
        // still take effect for handlers that haven't fired yet.
        //
        // Net contract:
        //   - handlers subscribed BEFORE emit fire (unless unsubscribed
        //     by an earlier handler in the same emit)
        //   - handlers subscribed DURING emit do NOT fire in this cycle;
        //     they fire on the next emit
        //   - handlers unsubscribed DURING emit do NOT fire if their
        //     turn hasn't come yet
        Array.from(handlers).forEach(handler => {
            if (!handlers.has(handler)) return;
            try { handler(event); } catch { /* listener errors must not break adapter lifecycle */ }
        });
    }
}
