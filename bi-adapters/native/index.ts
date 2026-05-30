export { NativeBIAdapter, type NativeBIAdapterOptions } from "./NativeBIAdapter";
export {
    NATIVE_BI_CAPABILITIES,
    NATIVE_RENDERER_CAPABILITIES,
    type NativeRendererCapabilities,
} from "./nativeCapabilities";
export {
    NATIVE_FORBIDDEN_COMMAND_KINDS,
    NATIVE_RENDERER_COMMAND_KINDS,
    commandKind,
    isNativeRendererCommand,
    type NativeBICommand,
    type NativeRendererCommand,
    type NativeRendererCommandKind,
} from "./nativeCommands";
export {
    NATIVE_EVENT_TYPES,
    toBIEvent,
    type NativeEvent,
    type NativeEventHandler,
    type NativeEventType,
} from "./nativeEvents";
// NativeCanvas lives in `playground/src/visualization/NativeCanvas.tsx`
// because the React/ECharts runtime is resolved from playground's
// node_modules tree. Re-exporting types here keeps the bi-adapters
// barrel coherent for consumers that import via `bi-adapters/native`.
export {
    mountNativeCanvas,
    NativeCanvas,
    type NativeCanvasGovernanceState,
    type NativeCanvasHandle,
    type NativeCanvasMode,
    type NativeCanvasProps,
} from "../../playground/src/visualization/NativeCanvas";
