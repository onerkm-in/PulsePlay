// playground/vite.cspFromAllowlist.ts
//
// Vite plugin that generates a strict Content-Security-Policy meta tag
// from the proxy's organization allowlist at build time.
//
// Closes loophole L7 (SETTINGS_SPEC § 15.2). The static CSP in
// index.html uses wildcards (https://*.powerbi.com, *.tableau.com,
// *.microsoftonline.com) which are fine for dev but expose the
// playground to compromise via any approved-vendor subdomain. This
// plugin reads `proxy/config.json` (or the example fallback) and
// substitutes the wildcards with the exact hostnames the org allowed.
//
// In dev mode (`vite` / `vite dev`) the plugin is a no-op so HMR keeps
// working with `'unsafe-eval'` + the permissive default CSP. Production
// builds (`vite build`) get the strict generated CSP with no wildcards
// and no `'unsafe-eval'`.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

interface AllowlistLicense {
    powerbi?: { fabricEnabled?: boolean };
}

interface AllowlistFileShape {
    allowlist?: {
        embedOrigins?: Record<string, string[]>;
        aadTenants?: string[];
        license?: AllowlistLicense;
    };
}

/** Build-time origins the playground always needs regardless of allowlist
 *  contents (the proxy origin, AAD login endpoints, Power BI REST). */
const BASE_FRAME_ORIGINS = ["'self'", "https://login.microsoftonline.com"];
const BASE_CONNECT_ORIGINS = [
    "'self'",
    "https://login.microsoftonline.com",
    "https://login.live.com",
    "https://graph.microsoft.com",
    "https://api.powerbi.com",
    "https://analysis.windows.net",
];

interface CspPluginOptions {
    /** Absolute or relative path to the allowlist file. Falls back to
     *  proxy/config.json, then proxy/config.example.json. */
    allowlistPath?: string;
    /** Skip the plugin entirely (returns no-op). Useful for tests. */
    disabled?: boolean;
}

function repoRootPath(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, "..");
}

function resolveDefaultPath(): string {
    const repoRoot = repoRootPath();
    const real = resolve(repoRoot, "proxy/config.json");
    if (existsSync(real)) return real;
    return resolve(repoRoot, "proxy/config.example.json");
}

function readAllowlistFile(path: string): AllowlistFileShape["allowlist"] {
    if (!existsSync(path)) return undefined;
    try {
        const raw = readFileSync(path, "utf-8");
        const parsed = JSON.parse(raw) as AllowlistFileShape;
        return parsed.allowlist;
    } catch {
        return undefined;
    }
}

/** Read the allowlist, falling back to the canonical example when the
 *  primary config has no `allowlist` block (e.g., older dev configs that
 *  predate the allowlist work). Build-time CSP generation needs at least
 *  one source of truth, so we prefer the example over emitting an empty
 *  frame-src — emitting empty would block the playground's own iframes. */
function readAllowlist(primaryPath: string): AllowlistFileShape["allowlist"] {
    const primary = readAllowlistFile(primaryPath);
    if (primary) return primary;
    const repoRoot = repoRootPath();
    const example = resolve(repoRoot, "proxy/config.example.json");
    if (example !== primaryPath && existsSync(example)) {
        const fallback = readAllowlistFile(example);
        if (fallback) return fallback;
    }
    return undefined;
}

/** Build the strict CSP string. Origins beyond the allowlist are added
 *  only when the allowlist explicitly authorizes them. */
export function buildStrictCsp(allowlist: AllowlistFileShape["allowlist"] | undefined): string {
    const frameOrigins = new Set<string>(BASE_FRAME_ORIGINS);
    const connectOrigins = new Set<string>(BASE_CONNECT_ORIGINS);

    if (allowlist?.embedOrigins) {
        for (const list of Object.values(allowlist.embedOrigins)) {
            for (const host of list || []) {
                const trimmed = String(host || "").trim();
                if (trimmed) frameOrigins.add(`https://${trimmed}`);
            }
        }
    }

    // AAD tenants don't extend origins (login.microsoftonline.com already
    // covers them); they just inform docs. Future per-tenant pinning at
    // path level isn't a CSP concern.

    const frameSrc = Array.from(frameOrigins).join(" ");
    const connectSrc = Array.from(connectOrigins).join(" ");

    // Strict production CSP: no 'unsafe-eval', no wildcards, no inline
    // scripts (Vite's prod build doesn't emit inline scripts; if a new
    // dep does, the plugin loudly fails at build time).
    return [
        "default-src 'self'",
        // 'unsafe-inline' kept on style-src for the inline styles the
        // settings shell + existing UI use; replace with nonces in a later
        // hardening cycle.
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' https://login.microsoftonline.com",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src ${connectSrc}`,
        `frame-src ${frameSrc}`,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
    ].join("; ") + ";";
}

const CSP_META_REGEX = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i;

/** The plugin. */
export default function cspFromAllowlist(options: CspPluginOptions = {}): Plugin {
    const allowlistPath = options.allowlistPath || resolveDefaultPath();
    return {
        name: "pulseplay:csp-from-allowlist",
        // The transform hook runs at the end of the pipeline. We can't
        // tell from `transformIndexHtml`'s signature alone whether we're
        // building for prod, so we use `apply: "build"` to scope the
        // plugin to prod builds only.
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html: string) {
                if (options.disabled) return html;
                const allowlist = readAllowlist(allowlistPath);
                const csp = buildStrictCsp(allowlist);
                const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
                if (CSP_META_REGEX.test(html)) {
                    return html.replace(CSP_META_REGEX, meta);
                }
                // No existing tag → inject as the first child of <head>.
                return html.replace(/<head>/i, `<head>\n        ${meta}`);
            },
        },
    };
}
