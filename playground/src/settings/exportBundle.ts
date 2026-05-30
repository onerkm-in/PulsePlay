// playground/src/settings/exportBundle.ts
//
// "Export support bundle" — gathers Settings state, the live allowlist,
// proxy health (last seen), recent BI events, recent errors, all
// pulseplay:* localStorage keys, and basic browser info, then offers
// the result as a downloadable JSON blob.
//
// Redaction layers (applied in order to every fielded value that could
// carry sensitive data):
//   1. SENSITIVE_KEY_PATTERNS — any localStorage key OR nested object key
//      matching /token|secret|accesstoken|clientsecret|\bkey\b/i has its
//      value replaced with "[REDACTED]".
//   2. SENSITIVE_VALUE_PATTERNS — any string value containing a JWT,
//      Databricks PAT, or Bearer-token shape gets the matching substring
//      replaced with "[REDACTED]".
//   3. Length cap — string values are truncated to 4 KB to bound bundle
//      size and avoid leaking huge attachments.
//
// The redactDeep() walker applies (1)+(2) to ANY object/array tree —
// covering both nested localStorage JSON values and diagnostic event
// payloads. Depth is capped at 8 and array length at 200 to prevent
// runaway bundles from circular or massive structures.
//
// No network call — this is a pure browser action. The blob is created
// via URL.createObjectURL and an anchor click; the URL is revoked
// immediately after to avoid leaks.

import type { PulsePlayAllowlist } from "../types/allowlist";
import type { SettingsState } from "./settingsStore";
import { snapshotDiagnostics, type DiagnosticBiEvent } from "./diagnosticsBuffer";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERNS = [/token/i, /secret/i, /accesstoken/i, /clientsecret/i, /\bkey\b/i];
const SENSITIVE_VALUE_PATTERNS = [
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT
    /dapi[a-f0-9]{16,}/i,                                 // Databricks PAT
    /Bearer [A-Za-z0-9._-]+/i,                            // Bearer tokens
];
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_BYTES = 4000;

function redactStringValue(raw: string): string {
    let value = raw;
    if (value.length > MAX_STRING_BYTES) value = `${value.slice(0, MAX_STRING_BYTES)}…[truncated]`;
    for (const re of SENSITIVE_VALUE_PATTERNS) {
        value = value.replace(re, REDACTED);
    }
    return value;
}

function keyLooksSensitive(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some(re => re.test(key));
}

/**
 * Recursive object/array walker that applies the same redaction rules
 * everywhere — not just at the top-level localStorage key. Used for:
 *
 *   - Parsed JSON values of `pulseplay:*` localStorage entries (so a
 *     nested `{ config: { accessToken: "plain-secret" } }` gets caught
 *     instead of slipping through the outer-key-only filter).
 *   - `DiagnosticBiEvent.payload` — BI vendor events may carry filter
 *     values, dataset ids, or worst-case embed tokens.
 *   - `proxy.health` — typed `unknown`, whatever the /health route
 *     returns lands here.
 *
 * Depth + size caps keep the bundle bounded under any input.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
    if (depth >= MAX_DEPTH) return "[REDACTED:max-depth]";
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactStringValue(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        const out: unknown[] = [];
        const limit = Math.min(value.length, MAX_ARRAY_ITEMS);
        for (let i = 0; i < limit; i += 1) out.push(redactDeep(value[i], depth + 1));
        if (value.length > MAX_ARRAY_ITEMS) out.push(`[REDACTED:array-trimmed-${value.length - MAX_ARRAY_ITEMS}-more]`);
        return out;
    }
    if (typeof value === "object") {
        const src = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(src)) {
            if (keyLooksSensitive(k)) {
                out[k] = REDACTED;
                continue;
            }
            out[k] = redactDeep(src[k], depth + 1);
        }
        return out;
    }
    // Functions, symbols, bigints — unreachable in JSON-serializable payloads
    // but redact defensively to keep the bundle JSON-clean.
    return "[REDACTED:unsupported-type]";
}

interface BundleProxy {
    health: unknown;
    lastCheckedAt: string | null;
    error: string | null;
}

export interface ExportBundle {
    generatedAt: string;
    pulseplayVersion: string;
    settings: {
        biVendor: string;
        packSelection: SettingsState["packSelection"];
        uiMode: string;
        enabledComponents: string;
        layoutMode: string;
        biTileMode: string;
        activeAiProfile: string;
        orphans: SettingsState["orphans"];
    };
    allowlist: PulsePlayAllowlist | null;
    proxy: BundleProxy;
    diagnostics: ReturnType<typeof snapshotDiagnostics>;
    localStorage: Record<string, string>;
    browser: {
        userAgent: string;
        viewportWidth: number;
        viewportHeight: number;
        languages: string[];
    };
}

/**
 * Redact a raw localStorage value. If the OUTER key is sensitive the
 * value is dropped wholesale; otherwise we try to parse it as JSON and
 * walk the tree with redactDeep so nested sensitive fields don't slip
 * through. Non-JSON strings fall back to the substring redactor.
 *
 * The output is JSON-serialised so the bundle payload stays a flat
 * Record<string,string> (existing test contract).
 */
function redactValue(key: string, raw: string): string {
    if (keyLooksSensitive(key)) return REDACTED;
    // Try to parse JSON so nested fields like `{config:{accessToken:"…"}}`
    // get the deep walker. JSON.parse is forgiving of trailing whitespace
    // but throws on plain strings — fall back to the substring redactor
    // for non-JSON values (which keeps existing behavior for opaque
    // tokens like JWTs stored directly).
    try {
        const parsed = JSON.parse(raw);
        if (parsed !== null && (typeof parsed === "object" || Array.isArray(parsed))) {
            const redacted = redactDeep(parsed);
            return JSON.stringify(redacted);
        }
    } catch {
        /* not JSON — fall through to substring redaction */
    }
    return redactStringValue(raw);
}

function readPulseplayLocalStorage(): Record<string, string> {
    const out: Record<string, string> = {};
    if (typeof window === "undefined") return out;
    try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith("pulseplay:")) continue;
            const raw = window.localStorage.getItem(key) || "";
            out[key] = redactValue(key, raw);
        }
    } catch {
        /* swallow */
    }
    return out;
}

/** Apply redactDeep to every diagnostic event's payload field. The
 *  envelope (at/vendor/type) is plain metadata and stays intact. */
function redactDiagnosticEvents(events: DiagnosticBiEvent[]): DiagnosticBiEvent[] {
    return events.map(e => ({
        at: e.at,
        vendor: e.vendor,
        type: e.type,
        payload: e.payload === undefined ? undefined : redactDeep(e.payload),
    }));
}

export interface BuildExportBundleArgs {
    settings: SettingsState;
    proxy: BundleProxy;
}

export function buildExportBundle(args: BuildExportBundleArgs): ExportBundle {
    const settings = args.settings;
    const rawDiagnostics = snapshotDiagnostics();
    return {
        generatedAt: new Date().toISOString(),
        pulseplayVersion: "v0.1.3-mvp-0.2",
        settings: {
            biVendor: settings.biVendor,
            packSelection: settings.packSelection,
            uiMode: settings.uiMode,
            enabledComponents: settings.enabledComponents,
            layoutMode: settings.layoutMode,
            biTileMode: settings.biTileMode,
            activeAiProfile: settings.activeAiProfile,
            orphans: settings.orphans,
        },
        allowlist: settings.allowlist,
        proxy: {
            // proxy.health is typed `unknown` — the upstream /health
            // payload may carry anything. Walk it through redactDeep so
            // a misconfigured proxy that surfaces a `clientSecret` or
            // bearer token in /health diagnostics can't bleed into the
            // bundle. lastCheckedAt + error are plain metadata.
            health: redactDeep(args.proxy.health),
            lastCheckedAt: args.proxy.lastCheckedAt,
            error: args.proxy.error,
        },
        diagnostics: {
            events: redactDiagnosticEvents(rawDiagnostics.events),
            errors: rawDiagnostics.errors,
        },
        localStorage: readPulseplayLocalStorage(),
        browser: {
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            viewportWidth: typeof window !== "undefined" ? window.innerWidth : 0,
            viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
            languages: typeof navigator !== "undefined" ? [...(navigator.languages || [])] : [],
        },
    };
}

/** Download the bundle as a JSON file. Browser-side only. */
export function downloadExportBundle(bundle: ExportBundle): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulseplay-support-bundle-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
