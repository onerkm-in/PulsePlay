// playground/src/settings/diagnosticsBuffer.ts
//
// Small ring buffer of recent BI events + console-error messages that
// the System › Diagnostics leaf renders. The buffer subscribes to a
// custom `pulseplay:bi-event` window event the BIPanel dispatches on
// every emit, so Settings doesn't need to thread shell state through a
// Context. Errors are captured by monkey-patching `console.error` once
// at module load — the wrapped function still calls through to the
// original so existing logging behavior is preserved.

import { useEffect, useState } from "react";

const MAX_EVENTS = 20;
const MAX_ERRORS = 20;

export interface DiagnosticBiEvent {
    at: string;
    vendor: string;
    type: string;
    payload?: unknown;
}

export interface DiagnosticError {
    at: string;
    message: string;
}

interface Buffer {
    events: DiagnosticBiEvent[];
    errors: DiagnosticError[];
}

const _buffer: Buffer = { events: [], errors: [] };
const _listeners = new Set<() => void>();

function notify(): void {
    _listeners.forEach(fn => {
        try { fn(); } catch { /* listener errors don't break the buffer */ }
    });
}

if (typeof window !== "undefined") {
    window.addEventListener("pulseplay:bi-event", (raw: Event) => {
        const e = raw as CustomEvent<{ vendor?: string; event?: { type?: string; payload?: unknown } }>;
        const detail = e.detail || {};
        const entry: DiagnosticBiEvent = {
            at: new Date().toISOString(),
            vendor: String(detail.vendor || "(unknown)"),
            type: String(detail.event?.type || "unknown"),
            payload: detail.event?.payload,
        };
        _buffer.events.unshift(entry);
        if (_buffer.events.length > MAX_EVENTS) _buffer.events.length = MAX_EVENTS;
        notify();
    });

    const _origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        try {
            const message = args.map(a => {
                if (a instanceof Error) return a.message;
                if (typeof a === "string") return a;
                try { return JSON.stringify(a); }
                catch { return String(a); }
            }).join(" ");
            _buffer.errors.unshift({ at: new Date().toISOString(), message: truncate(message, 400) });
            if (_buffer.errors.length > MAX_ERRORS) _buffer.errors.length = MAX_ERRORS;
            notify();
        } catch {
            /* never break console.error itself */
        }
        _origError(...args);
    };
}

function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return `${s.slice(0, n - 1)}…`;
}

/** React hook — returns the latest buffer state and re-renders on every
 *  push. The hook deliberately copies the arrays so consumers don't
 *  mutate the singleton accidentally. */
export function useDiagnosticsBuffer(): { events: DiagnosticBiEvent[]; errors: DiagnosticError[] } {
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick(t => t + 1);
        _listeners.add(handler);
        return () => { _listeners.delete(handler); };
    }, []);
    return { events: [..._buffer.events], errors: [..._buffer.errors] };
}

/** Pure read for the export-bundle helper (no React). */
export function snapshotDiagnostics(): { events: DiagnosticBiEvent[]; errors: DiagnosticError[] } {
    return { events: [..._buffer.events], errors: [..._buffer.errors] };
}

/** Test seam — clears the rolling buffer. Not exported via index since
 *  callers shouldn't usually need it. */
export function __clearDiagnosticsBufferForTests(): void {
    _buffer.events.length = 0;
    _buffer.errors.length = 0;
    notify();
}
