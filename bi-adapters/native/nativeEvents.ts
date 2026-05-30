import type { BIEvent, BIEventType } from "../../playground/src/biPanel/BIAdapter";

export const NATIVE_EVENT_TYPES = Object.freeze([
    "loaded",
    "error",
    "ready",
    "rendered",
    "view-context",
] as const);

export type NativeEventType = BIEventType | typeof NATIVE_EVENT_TYPES[number];

export interface NativeEvent {
    type: NativeEventType;
    payload?: unknown;
}

export type NativeEventHandler = (event: NativeEvent) => void;

export function toBIEvent(event: NativeEvent): BIEvent | null {
    if (
        event.type === "loaded"
        || event.type === "page-changed"
        || event.type === "filter-applied"
        || event.type === "selection-made"
        || event.type === "data-refreshed"
        || event.type === "error"
    ) {
        return event as BIEvent;
    }
    return null;
}

