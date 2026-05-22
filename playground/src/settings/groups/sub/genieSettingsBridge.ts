// playground/src/settings/groups/sub/genieSettingsBridge.ts
//
// Thin read/write bridge to pulseplay:visual-settings:genieSettings —
// the localStorage key the Pulse sibling project and PulsePlay both
// share. Lets sub-route pages persist arbitrary Pulse fields without
// each one re-implementing the same try/catch + custom-event plumbing.

import { useCallback, useEffect, useState } from "react";

const KEY = "pulseplay:visual-settings:genieSettings";
const EVENT = "pulseplay:visual-settings-change";

export function readGenieSettings(): Record<string, unknown> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function writeGenieSettingsPatch(patch: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    try {
        const existing = readGenieSettings();
        const next = { ...existing, ...patch };
        window.localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { properties: patch } }));
    } catch {
        // Caller surfaces errors via inline status — silent here is fine.
    }
}

/** Typed read helpers — safe coercion from unknown localStorage values. */
export function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}
export function asStr(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}
export function asNum(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/** React hook that snapshots a subset of genieSettings and re-reads on
 *  every dispatched change event. Returns [state, patch] where patch
 *  merges into the store and triggers a re-snapshot for ALL consumers. */
export function useGenieSettingsSlice<T extends object>(read: () => T): [T, (patch: Partial<T>) => void] {
    const [state, setState] = useState<T>(read);

    useEffect(() => {
        const sync = () => setState(read());
        window.addEventListener(EVENT, sync as EventListener);
        return () => window.removeEventListener(EVENT, sync as EventListener);
    // The read closure is intentionally captured once on mount — the
    // sub-route pages pass a pure projection function, not a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const patch = useCallback((next: Partial<T>) => {
        writeGenieSettingsPatch(next as Record<string, unknown>);
        // Optimistic local update so the input stays responsive even if
        // the storage event lands a tick later.
        setState(prev => ({ ...prev, ...next }));
    }, []);

    return [state, patch];
}
