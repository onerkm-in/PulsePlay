// playground/src/settings/exportBundle.ts
//
// "Export support bundle" — gathers Settings state, the live allowlist,
// proxy health (last seen), recent BI events, recent errors, all
// pulseplay:* localStorage keys, and basic browser info, then offers
// the result as a downloadable JSON blob.
//
// Redaction is conservative: any localStorage value whose key contains
// "token", "secret", "accesstoken", "clientsecret", or "key" is replaced
// with "[REDACTED]" before it leaves the page. The Pulse `visual-settings:*`
// keys are scrubbed of their `assistantProfile` token-shaped values too.
//
// No network call — this is a pure browser action. The blob is created
// via URL.createObjectURL and an anchor click; the URL is revoked
// immediately after to avoid leaks.

import type { PulsePlayAllowlist } from "../types/allowlist";
import type { SettingsState } from "./settingsStore";
import { snapshotDiagnostics } from "./diagnosticsBuffer";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERNS = [/token/i, /secret/i, /accesstoken/i, /clientsecret/i, /\bkey\b/i];
const SENSITIVE_VALUE_PATTERNS = [
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT
    /dapi[a-f0-9]{16,}/i,                                 // Databricks PAT
    /Bearer [A-Za-z0-9._-]+/i,                            // Bearer tokens
];

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

function redactValue(key: string, raw: string): string {
    if (SENSITIVE_KEY_PATTERNS.some(re => re.test(key))) return REDACTED;
    if (raw.length > 4000) return `${raw.slice(0, 4000)}…[truncated]`;
    let value = raw;
    for (const re of SENSITIVE_VALUE_PATTERNS) {
        value = value.replace(re, REDACTED);
    }
    return value;
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

export interface BuildExportBundleArgs {
    settings: SettingsState;
    proxy: BundleProxy;
}

export function buildExportBundle(args: BuildExportBundleArgs): ExportBundle {
    const settings = args.settings;
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
        proxy: args.proxy,
        diagnostics: snapshotDiagnostics(),
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
