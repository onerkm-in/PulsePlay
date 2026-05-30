import type { BICommand } from "../../playground/src/biPanel/BIAdapter";

export const NATIVE_RENDERER_COMMAND_KINDS = Object.freeze([
    "renderResult",
    "renderSpec",
    "clear",
    "setTheme",
    "resize",
] as const);

export type NativeRendererCommandKind = typeof NATIVE_RENDERER_COMMAND_KINDS[number];

export type NativeRendererCommand =
    | { kind: "renderResult"; result: unknown }
    | { kind: "renderSpec"; spec: unknown }
    | { kind: "clear" }
    | { kind: "setTheme"; theme?: string; tokens?: Record<string, string> }
    | { kind: "resize"; width?: number; height?: number };

export type NativeBICommand = BICommand | NativeRendererCommand;

export const NATIVE_FORBIDDEN_COMMAND_KINDS = Object.freeze([
    "setFilter",
    "drill",
    "saveLayout",
    "executeQuery",
    "createMeasure",
    "navigate-to-page",
    "apply-filter",
    "clear-filter",
    "refresh",
    "fullscreen",
    "export",
] as const);

export function isNativeRendererCommand(command: unknown): command is NativeRendererCommand {
    if (!command || typeof command !== "object") return false;
    const kind = (command as { kind?: unknown }).kind;
    return typeof kind === "string"
        && (NATIVE_RENDERER_COMMAND_KINDS as readonly string[]).includes(kind);
}

export function commandKind(command: unknown): string {
    if (!command || typeof command !== "object") return "(unknown)";
    const kind = (command as { kind?: unknown }).kind;
    return typeof kind === "string" && kind.trim() ? kind : "(unknown)";
}

