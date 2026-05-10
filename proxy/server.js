// @ts-check
'use strict';

/**
 * UniBridge AI Proxy — auth fan-out + CORS bypass between the Power BI
 * custom visual and Databricks Genie / supervisor / OpenAI / Bedrock.
 *
 * Type-checking is opt-in (`// @ts-check` at the top) so this file plays
 * well with VS Code without a build step. JSDoc typedefs below describe
 * the load-bearing shapes; everything else relies on Express' own types.
 *
 * @typedef {Object} ProfileConfig
 * @property {string} [host]            Workspace base URL (Direct/Genie modes).
 * @property {string} [token]           PAT used when authMode is sharedPat.
 * @property {string} [spaceId]         Target Genie space ID for this profile.
 * @property {string} [type]            'supervisor-local' marks a profile reserved for supervisor synthesis.
 * @property {string} [warehouseId]     SQL warehouse ID for /warehouse routes.
 * @property {string} [tenantId]        Azure tenant for managed-identity auth.
 * @property {string} [clientId]        Azure client ID.
 * @property {string} [clientSecret]    Azure client secret.
 * @property {string} [agentName]       Supervisor display name.
 * @property {string} [synthesisEndpoint] Databricks model-serving endpoint used for supervisor synthesis.
 * @property {string[]} [spaces]        Helper space keys the supervisor can fan out to.
 *
 * @typedef {Object} ProxyConfig
 * @property {number} [port]
 * @property {string} [sharedKey]
 * @property {Record<string, ProfileConfig>} [profiles]
 * @property {{ spaces?: string[], staggerMs?: number }} [supervisor]
 * @property {{ key?: string, deploymentName?: string, endpoint?: string }} [openai]
 * @property {{ region?: string, accessKeyId?: string, secretAccessKey?: string, knowledgeBaseId?: string }} [bedrock]
 *
 * @typedef {Object} ConversationEntry
 * @property {string} conversationId
 * @property {string} profile
 * @property {string} spaceId
 * @property {number} createdAt
 */

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

let azureIdentity = null;
try {
    // @ts-ignore — optional peer dep; not present in PAT-only deployments.
    azureIdentity = require('@azure/identity');
} catch {
    // @azure/identity not installed — PAT-only mode
}

const CONFIG_PATH = path.join(__dirname, 'config.json');

// ── Supervisor strategy registry ─────────────────────────────────────────────
// All supervisor-flavour profile `type` values live in one place so adding a
// new variant doesn't require finding every conditional. Add to
// SUPERVISOR_TYPES to make a new type recognised everywhere; add to
// STREAMING_SUPERVISOR_TYPES if it can stream incremental progress.
//
//   - "supervisor"        : Real Databricks Mosaic AI agent (serving endpoint).
//                           No native fan-out telemetry; the proxy emits
//                           coarse "thinking…" events around a non-stream call.
//   - "supervisor-local"  : Proxy-side fan-out + synthesis. Emits per-helper
//                           events natively as it walks each Genie space.
const SUPERVISOR_TYPES = ['supervisor', 'supervisor-local'];
const STREAMING_SUPERVISOR_TYPES = ['supervisor', 'supervisor-local'];

/** @param {string | undefined} type */
function isSupervisorType(type) {
    return SUPERVISOR_TYPES.includes(String(type || ''));
}

/** @param {string | undefined} type */
function supportsStreamingFor(type) {
    return STREAMING_SUPERVISOR_TYPES.includes(String(type || ''));
}

// Returns the keys of every profile that can act as a supervisor helper —
// i.e. configured profiles that are not themselves supervisor-local. Used
// as the default for `supervisor.spaces` when the deployer has not pinned
// an explicit list. Lets a customer with profiles named e.g.
// `finance,risk,treasury` get a working supervisor without setting
// SUPERVISOR_SPACES.
function defaultSupervisorSpaces(profiles) {
    return Object.entries(profiles || {})
        .filter(([name, p]) => p && !SUPERVISOR_TYPES.includes(p.type) && !name.startsWith('_'))
        .map(([name]) => name);
}

function envConfig() {
    const host = process.env.DATABRICKS_HOST || '';
    const profileName = process.env.ASSISTANT_PROFILE || 'default';
    const warehouseId = process.env.WAREHOUSE_ID || process.env.DATABRICKS_WAREHOUSE_ID || '';
    /** @type {ProfileConfig} */
    const profile = {
        host,
        token: process.env.DATABRICKS_TOKEN || process.env.DATABRICKS_PAT || '',
        spaceId: process.env.GENIE_SPACE_ID || process.env.DATABRICKS_GENIE_SPACE_ID || '',
        warehouseId,
    };
    /** @type {Record<string, ProfileConfig>} */
    const profiles = { [profileName]: profile };
    if (profileName !== 'default') profiles.default = profile;

    // Layer in any PROXY_PROFILE_<NAME>_<FIELD> env vars. This is the only
    // path for multi-profile deploys when there's no config.json on disk
    // (e.g. Databricks Apps, containerised). Generic — supports any profile
    // names the deployer chooses.
    const envProfiles = loadEnvProfiles();
    for (const [name, envProfile] of Object.entries(envProfiles)) {
        profiles[name] = { ...(profiles[name] || {}), ...envProfile };
    }

    if (process.env.SUPERVISOR_ENABLED !== 'false') {
        const explicitSpaces = process.env.SUPERVISOR_SPACES;
        profiles.supervisor = {
            type: 'supervisor-local',
            host,
            token: profile.token,
            agentName: process.env.SUPERVISOR_AGENT_NAME || 'UniBridge AI Supervisor',
            synthesisEndpoint: process.env.SUPERVISOR_SYNTHESIS_ENDPOINT || 'databricks-gpt-5-4',
            spaces: explicitSpaces
                ? explicitSpaces.split(',').map(s => s.trim()).filter(Boolean)
                : defaultSupervisorSpaces(profiles),
        };
    }

    return {
        port: Number(process.env.PORT || process.env.DATABRICKS_APP_PORT || 8787),
        feedbackLog: process.env.FEEDBACK_LOG || '',
        sharedKey: process.env.GENIE_PROXY_SHARED_KEY || '',
        profiles,
        configSource: 'environment',
    };
}

/**
 * Generic env-var profile loader (IDEA-016 phase 2).
 *
 * Convention:  PROXY_PROFILE_<NAME>_<FIELD>=value
 *   PROXY_PROFILE_SALES_HOST=https://...
 *   PROXY_PROFILE_SALES_TOKEN=dapi...
 *   PROXY_PROFILE_SALES_SPACE_ID=01f1...
 *   PROXY_PROFILE_SALES_WAREHOUSE_ID=6510...
 *   PROXY_PROFILE_SALES_DISPLAY_NAME=Sales helper
 *   PROXY_PROFILE_SALES_DATA_DOMAIN=sales data
 *   PROXY_PROFILE_SALES_PROXY_KEY=...
 *   PROXY_PROFILE_SALES_TYPE=supervisor-local      (optional)
 *
 * Names are case-insensitive in the env var (NAME is uppercased) and
 * lower-cased on output to match the config.json convention. Underscored
 * field names map to camelCase: SPACE_ID -> spaceId, DATA_DOMAIN ->
 * dataDomain, etc. Unknown fields are ignored.
 *
 * Layering rule: env profiles MERGE into config.json profiles by name.
 * Per-field overrides are allowed (env wins). New profiles that don't
 * exist in config.json are appended. This lets a containerised deploy
 * override creds without rewriting config.json, and lets a fresh deploy
 * with no config.json work entirely from env vars.
 */
const ENV_PROFILE_FIELDS = {
    HOST: 'host',
    TOKEN: 'token',
    SPACE_ID: 'spaceId',
    SPACEID: 'spaceId',
    WAREHOUSE_ID: 'warehouseId',
    WAREHOUSEID: 'warehouseId',
    PROXY_KEY: 'proxyKey',
    PROXYKEY: 'proxyKey',
    DISPLAY_NAME: 'displayName',
    DISPLAYNAME: 'displayName',
    DATA_DOMAIN: 'dataDomain',
    DATADOMAIN: 'dataDomain',
    AGENT_NAME: 'agentName',
    AGENTNAME: 'agentName',
    SYNTHESIS_ENDPOINT: 'synthesisEndpoint',
    SYNTHESISENDPOINT: 'synthesisEndpoint',
    SPACES: 'spaces',
    TYPE: 'type',
    SUGGESTED_QUESTIONS: 'suggestedQuestions',
    SUGGESTEDQUESTIONS: 'suggestedQuestions',
    // Cycle 47.6 — Foundation Model serving endpoint name. Lets a
    // deployment set the endpoint without committing config.json (e.g.
    // Databricks Apps where every config field comes from env vars).
    FOUNDATION_MODEL_ENDPOINT: 'foundationModelEndpoint',
    FOUNDATIONMODELENDPOINT: 'foundationModelEndpoint'
};

function loadEnvProfiles(env = process.env) {
    const out = {};
    for (const key of Object.keys(env)) {
        if (!key.startsWith('PROXY_PROFILE_')) continue;
        const rest = key.slice('PROXY_PROFILE_'.length);
        // Match the longest known field suffix to disambiguate names that
        // contain underscores (e.g. PROXY_PROFILE_MY_SALES_SPACE_ID).
        const suffix = Object.keys(ENV_PROFILE_FIELDS)
            .sort((a, b) => b.length - a.length)
            .find(s => rest.endsWith(`_${s}`));
        if (!suffix) continue;
        const namePart = rest.slice(0, rest.length - suffix.length - 1);
        if (!namePart) continue;
        const profileName = namePart.toLowerCase();
        if (profileName.startsWith('_')) continue; // reserved for docs
        const fieldName = ENV_PROFILE_FIELDS[suffix];
        const value = env[key];
        if (value == null || value === '') continue;
        if (!out[profileName]) out[profileName] = {};
        if (fieldName === 'spaces' || fieldName === 'suggestedQuestions') {
            out[profileName][fieldName] = String(value).split(',').map(s => s.trim()).filter(Boolean);
        } else {
            out[profileName][fieldName] = String(value);
        }
    }
    return out;
}

function mergeConfigWithEnvironment(config) {
    const profiles = { ...(config.profiles || {}) };

    // Generic env-var profile layer (IDEA-016 phase 2). Per-field merge:
    // env wins for any field it sets; config.json values for unset fields
    // pass through unchanged. New profiles that don't exist in config.json
    // are appended whole.
    const envProfiles = loadEnvProfiles();
    for (const [name, envProfile] of Object.entries(envProfiles)) {
        profiles[name] = { ...(profiles[name] || {}), ...envProfile };
    }

    if (process.env.SUPERVISOR_ENABLED === 'true' && !profiles.supervisor) {
        const fallbackProfile = profiles.default || Object.values(profiles)[0] || {};
        const explicitSpaces = process.env.SUPERVISOR_SPACES;
        profiles.supervisor = {
            type: 'supervisor-local',
            host: process.env.DATABRICKS_HOST || fallbackProfile.host || '',
            token: process.env.DATABRICKS_TOKEN || process.env.DATABRICKS_PAT || fallbackProfile.token || '',
            agentName: process.env.SUPERVISOR_AGENT_NAME || 'UniBridge AI Supervisor',
            synthesisEndpoint: process.env.SUPERVISOR_SYNTHESIS_ENDPOINT || 'databricks-gpt-5-4',
            spaces: explicitSpaces
                ? explicitSpaces.split(',').map(s => s.trim()).filter(Boolean)
                : defaultSupervisorSpaces(profiles),
        };
    }

    return { ...config, profiles };
}

// loadEnvProfiles is added to the public exports object at the bottom of
// the file (test-only — not part of any wire API).

// Re-read config on every request so profile changes take effect without restart.
// A short in-memory TTL avoids re-parsing the JSON file 50+ times per Genie
// exchange (middleware, profile resolution, warehouse probe, each poll).
// In tests we bypass the cache so mocked fs.readFileSync values still flow
// through on every call.
const CONFIG_CACHE_TTL_MS = 30000;
let _cfgCache = null;
let _cfgCacheAt = 0;
function cfg() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return envConfig();
    }

    // Parse failures (mid-edit save, bad keystroke, partial write) must NOT
    // take the proxy down. Fall back to the last-good cached config when
    // available; otherwise fall back to env. The error is logged so an
    // operator watching the console sees what happened.
    const readAndMerge = () => {
        try {
            return { ...mergeConfigWithEnvironment(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))), configSource: 'config.json' };
        } catch (err) {
            console.error(`[config] Failed to read/parse config.json: ${err.message}`);
            if (_cfgCache) {
                console.warn('[config] Falling back to last-good cached config.');
                return _cfgCache;
            }
            console.warn('[config] No prior cache — falling back to env-only config.');
            return envConfig();
        }
    };

    if (process.env.NODE_ENV !== 'test') {
        const now = Date.now();
        if (_cfgCache && (now - _cfgCacheAt) < CONFIG_CACHE_TTL_MS) {
            return _cfgCache;
        }
        const fresh = readAndMerge();
        // Only update the cache when the read succeeded (configSource will
        // still say 'config.json'). On failure we returned the prior cache
        // unchanged, so the timestamp shouldn't slide.
        if (fresh.configSource === 'config.json') {
            _cfgCache = fresh;
            _cfgCacheAt = now;
        }
        return fresh;
    }
    return readAndMerge();
}

// ── In-memory conversation → context mapping ──────────────────────────────────
// Populated when a conversation starts so polling GETs can resolve the right
// space and profile even without a request body. Entries are TTL-bounded
// (24h) and pruned hourly so the Map can't grow unboundedly across a
// long-running proxy uptime.
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;
const conversationMap = new Map(); // conversationId → { spaceId, profileName, storedAt }

function storeConversation(conversationId, spaceId, profileName) {
    if (conversationId) {
        conversationMap.set(String(conversationId), { spaceId, profileName, storedAt: Date.now() });
    }
}

function pruneConversationMap() {
    const cutoff = Date.now() - CONVERSATION_TTL_MS;
    let removed = 0;
    for (const [id, entry] of conversationMap.entries()) {
        if (!entry?.storedAt || entry.storedAt < cutoff) {
            conversationMap.delete(id);
            removed++;
        }
    }
    if (removed > 0) {
        console.log(`[conversation-map] pruned ${removed} stale entries (size=${conversationMap.size})`);
    }
}

// Tests don't run a hot proxy, so skip the interval there to avoid
// dangling timers keeping the test process alive.
if (process.env.NODE_ENV !== 'test') {
    setInterval(pruneConversationMap, 60 * 60 * 1000).unref();
}

// ── Profile registry (IDEA-016) ───────────────────────────────────────────────
// All profile lookups in this server route through `profileRegistry` so we
// have a single hook point for future pluggable sources (env vars, Databricks
// SQL table, secret manager). Today the registry reads from cfg().profiles
// only — the API stays sync to avoid rippling async into every caller. When
// adding a new source later, wrap it in a sync facade or fail closed; never
// turn this into a Promise unless every caller in this file also moves.
//
// `_doc_*` keys are reserved for inline documentation in config.json and
// never returned by the registry — keeps doc entries from leaking into
// /assistant/profiles or being misinterpreted as a real profile.
const profileRegistry = {
    /** Resolve a single profile by its key. Returns null if missing. */
    get(name) {
        if (!name) return null;
        if (String(name).startsWith('_')) return null;
        const c = cfg();
        return c.profiles?.[name] ?? null;
    },
    /** All real profile entries (excludes _doc_* doc keys). */
    entries() {
        const c = cfg();
        return Object.entries(c.profiles ?? {}).filter(([k]) => !k.startsWith('_'));
    },
    /** Profile keys only — the public listing surface. */
    list() {
        return this.entries().map(([k]) => k);
    },
    /** Find by exact host match (used by /assistant/capabilities header routing). */
    findByHost(targetHost) {
        if (!targetHost) return null;
        const needle = String(targetHost).replace(/\/$/, '').toLowerCase();
        for (const [name, p] of this.entries()) {
            if (String(p.host || '').replace(/\/$/, '').toLowerCase() === needle) {
                return { profile: p, name };
            }
        }
        return null;
    }
};

function profileByName(name) {
    const p = profileRegistry.get(name);
    return p ? { profile: p, name } : null;
}

function profileByHost(targetHost) {
    const match = profileRegistry.findByHost(targetHost);
    return match ? { profile: match.profile, name: 'host-matched' } : null;
}

// ── Wave 31 — inline credentials from request headers ──────────────────────────
// Closes the "no-code deployment overstated" gap: lets a visual author send
// host/token/spaceId in headers so the proxy doesn't require config.json edits
// to onboard a new workspace. The token NEVER appears in audit lines or error
// responses (Wave 28 redaction; Wave 30 cycle 4 sanitization). Existing
// config.json deployments keep working unchanged — inline is checked first
// and only activates when ALL three of host/token/spaceId are present.
const INLINE_HEADER_MAX_LEN = 256;

/**
 * Sanitize a single inline-credential header value. Mirrors the existing
 * config-loader rules: strip control characters, drop anything that isn't
 * in the safe character class, and cap length. Returns '' for nullish or
 * non-string input so an absent header is indistinguishable from a
 * fully-stripped one — both fall through to the named-profile path.
 *
 * Character class is intentionally permissive enough for:
 *   - URLs (https://...)        host: schemes, dots, slashes, dashes
 *   - PATs (dapi…)              token: alnum + dash + underscore + dot
 *   - UUID-ish space IDs        spaceId: hex + dashes
 *   - Profile labels            profileName: alnum + dash + underscore + dot
 * but rejects whitespace, quotes, semicolons, control bytes, and anything
 * else that could break out of a header value or smuggle a payload.
 */
function sanitizeInlineHeader(value) {
    if (value == null) return '';
    let s = String(value);
    // Strip control characters and DEL (0x7F) — header injection / log poisoning vectors.
    s = s.replace(/[\x00-\x1F\x7F]/g, '');
    // Whitelist: alnum, dash, underscore, dot, slash, colon (URL-safe).
    s = s.replace(/[^A-Za-z0-9._:\/\-]/g, '');
    // Hard cap. Tokens, hosts, and IDs all fit comfortably inside 256 chars.
    if (s.length > INLINE_HEADER_MAX_LEN) s = s.slice(0, INLINE_HEADER_MAX_LEN);
    return s;
}

/**
 * Pull X-Databricks-Host / X-Databricks-Token / X-Genie-Space-Id /
 * X-Profile-Name from the request headers and return a transient
 * { profile, name } shaped exactly like a config.json entry, OR null
 * when any of the three required fields is missing.
 *
 * Profile name is informational only — it appears in audit logs (so an
 * operator can see "inline" requests) but is NOT used for any registry
 * lookup; the credentials come straight from headers.
 */
function extractInlineCredentials(headers) {
    if (!headers) return null;
    const host = sanitizeInlineHeader(headers['x-databricks-host']);
    const token = sanitizeInlineHeader(headers['x-databricks-token']);
    const spaceId = sanitizeInlineHeader(headers['x-genie-space-id']);
    if (!host || !token || !spaceId) return null;
    const rawName = sanitizeInlineHeader(headers['x-profile-name']);
    const name = rawName || 'inline';
    /** @type {ProfileConfig} */
    const profile = { host, token, spaceId };
    return { profile, name };
}

// ── Wave 36 — inline-credentials precedence inversion ─────────────────────────
// Wave 31 (cycle 7) shipped inline credentials with header-wins precedence:
// any visual that POSTed all three of X-Databricks-Host / X-Databricks-Token /
// X-Genie-Space-Id silently overrode the server-side config.json profile.
// That is the wrong default for shared / production deployments — anyone
// holding a copy of the .pbix could redirect traffic at will.
//
// Wave 36 inverts the precedence and exposes a mode flag:
//
//   PROXY_INLINE_CREDENTIALS_MODE=
//     "off"       — visual headers ignored entirely (production-recommended)
//     "fallback"  — server config tried first; for any field NOT set in the
//                   resolved profile, fill in from inline headers if available
//     "override"  — headers win (Wave 31 behaviour; lab / personal dev only)
//
// Smart defaults preserve Wave 31 UX for local-dev:
//   - PROXY_SHARED_KEY set            → "off"  (someone configured auth)
//   - WEBSITE_SITE_NAME set (Azure)   → "off"  (App Service runtime indicator)
//   - neither                         → "override"  (anonymous local dev)
//
// Per-profile opt-out is also supported:
//   profile.acceptInlineOverride = false  → headers ignored for that profile
//                                            even when global mode is "override"
const VALID_INLINE_MODES = new Set(['off', 'fallback', 'override']);

/**
 * Resolve the effective inline-credentials mode for the current request.
 * Honours the explicit env var first, then auto-detects.
 *
 * @returns {'off'|'fallback'|'override'}
 */
function resolveInlineCredentialsMode() {
    const explicit = String(process.env.PROXY_INLINE_CREDENTIALS_MODE || '').toLowerCase().trim();
    if (VALID_INLINE_MODES.has(explicit)) return explicit;
    // Auto-detect "shared / production-ish" environment.
    if (process.env.PROXY_SHARED_KEY) return 'off';
    if (process.env.GENIE_PROXY_SHARED_KEY) return 'off';
    if (process.env.WEBSITE_SITE_NAME) return 'off';
    // Local dev / anonymous default — Wave 31 behaviour preserved.
    return 'override';
}

/**
 * Apply the resolved inline-mode policy to a base profile.
 *
 * @param {{profile: object, name: string}|null} baseResolved
 *   The named/host-matched profile (may be null when no profile was found).
 * @param {object|null} inlineExtracted
 *   Output of extractInlineCredentials (full host+token+spaceId triple) or null.
 * @param {'off'|'fallback'|'override'} mode
 * @param {object} [rawHeaders] Raw request headers (needed for "fallback"
 *   mode where partial header sets are accepted to fill missing fields).
 * @returns {{profile: object, name: string, inline: {used: boolean, mode: string, fields: string[], reason?: string}}|null}
 */
function applyInlineMode(baseResolved, inlineExtracted, mode, rawHeaders) {
    const headers = rawHeaders || {};
    const meta = { used: false, mode, fields: [] };

    // Mode "off" → headers never participate. Even if all three are present.
    if (mode === 'off') {
        if (!baseResolved) return null;
        return { ...baseResolved, inline: { ...meta, reason: 'mode-off' } };
    }

    // Per-profile opt-out wins over a global "override" mode. The base
    // profile keeps serving the request; inline headers are dropped on the
    // floor (audit line still records the attempt under reason).
    const profileOptOut = baseResolved
        && baseResolved.profile
        && baseResolved.profile.acceptInlineOverride === false;
    if (profileOptOut && inlineExtracted) {
        return { ...baseResolved, inline: { ...meta, reason: 'profile-opt-out' } };
    }

    // Mode "override" → Wave 31 behaviour. Headers wholly replace the
    // resolved profile when fully present. If headers aren't fully present,
    // fall through to the named/host profile.
    if (mode === 'override' && inlineExtracted) {
        return {
            profile: { ...inlineExtracted.profile },
            name: inlineExtracted.name,
            inline: { used: true, mode, fields: ['host', 'token', 'spaceId'] },
        };
    }

    // Mode "fallback" → server config wins. Any field not set on the resolved
    // profile is filled in from headers if available. Headers can be partial
    // here (we accept individual fields without requiring the full triple).
    if (mode === 'fallback') {
        const partialHost    = sanitizeInlineHeader(headers['x-databricks-host']);
        const partialToken   = sanitizeInlineHeader(headers['x-databricks-token']);
        const partialSpaceId = sanitizeInlineHeader(headers['x-genie-space-id']);
        const haveAnyHeader  = Boolean(partialHost || partialToken || partialSpaceId);

        // No base profile + no headers → caller decides (returns null).
        if (!baseResolved && !haveAnyHeader) return null;

        // Build a merged profile (config wins per-field).
        const baseProfile = baseResolved ? { ...baseResolved.profile } : {};
        const merged = { ...baseProfile };
        const filled = [];
        if (!merged.host    && partialHost)    { merged.host    = partialHost;    filled.push('host'); }
        if (!merged.token   && partialToken)   { merged.token   = partialToken;   filled.push('token'); }
        if (!merged.spaceId && partialSpaceId) { merged.spaceId = partialSpaceId; filled.push('spaceId'); }

        const used = filled.length > 0;
        const name = baseResolved
            ? baseResolved.name
            : (sanitizeInlineHeader(headers['x-profile-name']) || 'inline');

        return {
            profile: merged,
            name,
            inline: { used, mode, fields: filled, reason: used ? 'fallback-fill' : 'config-complete' },
        };
    }

    // Mode "override" but no inline triple, OR mode "fallback" but no headers.
    if (!baseResolved) return null;
    return { ...baseResolved, inline: { ...meta, reason: 'no-inline-headers' } };
}

// Returns { profile, name, inline } or null.
// Resolution order (Wave 36):
//   1. Look up the named / host-matched / default profile from config.
//   2. Apply the inline-credentials mode policy (off | fallback | override).
//   3. Stash inline metadata on `req` (when supplied) so auditLog can stamp
//      `inlineCredsUsed` on the audit line for this request.
function resolveProfile(body, query, headers, req) {
    const mode = resolveInlineCredentialsMode();
    const inlineFull = extractInlineCredentials(headers);

    // Build the base (config-side) profile candidate.
    let base = null;
    const explicitName = body?.assistantProfile || query?.assistantProfile;
    if (explicitName) {
        base = profileByName(explicitName);
        // Explicit name was given but not found — in mode "override" with a
        // valid inline triple, fall through to inline (Wave 31 behaviour
        // when no config profile exists). Otherwise bail.
        if (!base && !(mode === 'override' && inlineFull)) {
            return null;
        }
    } else {
        const byHost = profileByHost(headers?.['x-genie-target-host']);
        base = byHost || profileByName('default');
    }

    // applyInlineMode needs raw headers to support partial fallback merges.
    const result = applyInlineMode(base, inlineFull, mode, headers || {});

    // Stash inline metadata onto the request so auditLog() can stamp it
    // automatically without every call site needing to thread it through.
    if (req && result) {
        req._inlineCredsMeta = result.inline;
    }
    return result;
}

// ── Token resolution ──────────────────────────────────────────────────────────
// Uses PAT if configured. Otherwise falls back to Azure Identity
// (Managed Identity / Service Principal / az login) to obtain an OAuth token.
const DATABRICKS_SCOPE = '2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default'; // Databricks resource ID
let azureCredential = null;
const tokenCache = new Map(); // host → { token, expiresAt }
const oauthTokenCache = new Map(); // host+client → { token, expiresAt, refreshPromise }

// Tier B Day 1 — refresh window. Refresh tokens 5min before they actually
// expire so a request that arrives at the boundary doesn't get a 401.
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;
// Wave 28 — cap the OAuth cache so a multi-tenant deployment with many
// rotating SPs can't grow it unbounded. LRU-evict oldest entry when full.
const OAUTH_CACHE_MAX = 1000;
function evictOldestOauthEntryIfFull() {
    if (oauthTokenCache.size < OAUTH_CACHE_MAX) return;
    const oldestKey = oauthTokenCache.keys().next().value;
    if (oldestKey !== undefined) oauthTokenCache.delete(oldestKey);
}

/**
 * Resolve a Databricks OAuth M2M (client_credentials) access token.
 * Source of credentials, in priority order:
 *   1. profile.authMode === "oauth-m2m" + profile.clientId + profile.clientSecret
 *      (per-profile config — preferred for multi-tenant deployments)
 *   2. process.env.DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET
 *      (legacy env-var path — backward compatible)
 *   3. null (no M2M creds available; caller falls back to PAT or Azure Identity)
 *
 * Single-flight: concurrent requests for the same cache key share one
 * /oidc/v1/token round-trip via a shared Promise. Prevents N parallel
 * token fetches when N requests arrive simultaneously after expiry.
 */
async function resolveDatabricksOAuthToken(profile) {
    const wantsProfileM2M = profile && profile.authMode === 'oauth-m2m';
    const clientId = (wantsProfileM2M && profile.clientId)
        || process.env.DATABRICKS_CLIENT_ID;
    const clientSecret = (wantsProfileM2M && profile.clientSecret)
        || process.env.DATABRICKS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const host = (profile.host || '').replace(/\/$/, '');
    if (!host) return null;
    const cacheKey = `${host}|${clientId}`;
    const cached = oauthTokenCache.get(cacheKey);

    // Hot path: cached token is still valid past the early-refresh window.
    if (cached && cached.token && cached.expiresAt > Date.now() + TOKEN_EARLY_REFRESH_MS) {
        return cached.token;
    }

    // Single-flight: if another request is already refreshing, await its result.
    if (cached && cached.refreshPromise) {
        return cached.refreshPromise;
    }

    const tokenUrl = `${host}/oidc/v1/token`;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const refreshPromise = (async () => {
        // Wave 28 — 10s timeout on /oidc/v1/token. Without this, a stalled
        // OAuth endpoint (DNS hang, network partition) hangs the whole
        // proxy-thread until the OS-level connection timeout fires.
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials&scope=all-apis',
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            const detail = await response.text();
            // Drop the stub cache entry so the next call retries cleanly.
            oauthTokenCache.delete(cacheKey);
            throw new Error(`Databricks OAuth token request failed (${response.status}): ${detail.slice(0, 300)}`);
        }
        const data = await response.json();
        const expiresInMs = Math.max(1, Number(data.expires_in || 3600)) * 1000;
        // Wave 28 — LRU evict when cache is at cap before inserting.
        evictOldestOauthEntryIfFull();
        oauthTokenCache.set(cacheKey, {
            token: data.access_token,
            expiresAt: Date.now() + expiresInMs,
            refreshPromise: null,
        });
        return data.access_token;
    })();
    // Reserve the cache slot with the in-flight Promise so concurrent callers see it.
    evictOldestOauthEntryIfFull();
    oauthTokenCache.set(cacheKey, { ...(cached || {}), refreshPromise });
    return refreshPromise;
}

/** Tier B Day 1 — invalidate a cached OAuth token. Called when an upstream
 *  request returns 401 (token revoked, SP secret rotated, etc.). The next
 *  resolve will fetch a fresh token. */
function invalidateOAuthCacheForProfile(profile) {
    const wantsProfileM2M = profile && profile.authMode === 'oauth-m2m';
    const clientId = (wantsProfileM2M && profile.clientId) || process.env.DATABRICKS_CLIENT_ID;
    if (!clientId) return false;
    const host = (profile.host || '').replace(/\/$/, '');
    const cacheKey = `${host}|${clientId}`;
    return oauthTokenCache.delete(cacheKey);
}

/**
 * Tier B Day 3 — opaque, stable, non-reversible identifier for a Service
 * Principal client_id. Audit log analysts need to group activity by SP
 * identity without ever writing the raw clientId to disk.
 *
 * SHA-256 of the clientId, truncated to the first 12 hex characters, prefixed
 * with `sp:` so log greps can locate SP-keyed records easily. Same SP →
 * same hash across processes / restarts (deterministic, no salt — which is
 * the desired property: log grouping). Returns null when there's no SP to
 * hash (PAT-only profiles or Azure-Identity profiles).
 *
 * Why 12 hex chars? 48 bits gives ~2.8e14 possible values: collision-safe
 * for any realistic SP population (<<1M SPs) and short enough to scan in
 * a tail-of-log eyeball. Privacy-wise, truncation eliminates rainbow-table
 * pre-image risk for non-trivial-length client_ids.
 *
 * @param {string} clientId
 * @returns {string|null}
 */
function hashServicePrincipalId(clientId) {
    if (!clientId || typeof clientId !== 'string') return null;
    try {
        const cryptoMod = require('crypto');
        const digest = cryptoMod.createHash('sha256').update(clientId).digest('hex');
        return `sp:${digest.slice(0, 12)}`;
    } catch {
        return null;
    }
}

/**
 * Tier B Day 3 — extract the SP identity hash from a resolved profile, if
 * the profile is OAuth M2M. Returns null for PAT or Azure-Identity profiles
 * so audit lines don't grow a noisy `spIdentityHash: null` field
 * everywhere; auditLog conditionally includes it.
 *
 * @param {{ authMode?: string, clientId?: string }|null|undefined} profile
 * @returns {string|null}
 */
function spHashForProfile(profile) {
    if (!profile || profile.authMode !== 'oauth-m2m') return null;
    if (!profile.clientId) return null;
    return hashServicePrincipalId(profile.clientId);
}

async function resolveToken(profile) {
    // If a PAT is explicitly configured, use it
    if (profile.token && profile.token.trim() && !profile.token.includes('YOUR_')) {
        return profile.token.trim();
    }

    const oauthToken = await resolveDatabricksOAuthToken(profile);
    if (oauthToken) {
        return oauthToken;
    }

    // Try Azure Identity
    if (!azureIdentity) {
        throw new Error(
            'No access token configured and @azure/identity is not installed. '
            + 'Either set a PAT in config.json, run inside Databricks Apps with service principal credentials, '
            + 'or run: npm install @azure/identity'
        );
    }

    const host = profile.host.replace(/\/$/, '').toLowerCase();
    const cached = tokenCache.get(host);
    if (cached && cached.expiresAt > Date.now() + 60000) {
        return cached.token;
    }

    if (!azureCredential) {
        azureCredential = new azureIdentity.DefaultAzureCredential();
        console.log('[auth] Using Azure Identity (DefaultAzureCredential) for token acquisition');
    }

    const accessToken = await azureCredential.getToken(DATABRICKS_SCOPE);
    tokenCache.set(host, {
        token: accessToken.token,
        expiresAt: accessToken.expiresOnTimestamp
    });
    console.log(`[auth] Acquired Azure token for ${host} (expires ${new Date(accessToken.expiresOnTimestamp).toISOString()})`);
    return accessToken.token;
}

// ── Databricks HTTP ───────────────────────────────────────────────────────────
// Persistent keep-alive agent: reuses TCP+TLS connections across requests,
// saving ~200-400ms per call vs creating a fresh handshake every time.
//
// `keepAliveMsecs` (default 1000) is how often we send a probe. Setting it
// lower than the idle period the upstream LB uses means a stale-half-open
// socket is detected before we try to reuse it. Set to 30s to balance probe
// traffic against catching idle drops during long Genie polls.
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 4,
    maxFreeSockets: 4
});

// Errors that indicate a transient socket/transport failure. Retrying once
// for idempotent methods (GET) cleanly fixes the long-poll ECONNRESET that
// would otherwise abort an AI Insights stage 60-90s into the run.
const TRANSIENT_NET_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'EAI_AGAIN'
]);
function isTransientNetError(err) {
    if (!err) return false;
    if (err.code && TRANSIENT_NET_CODES.has(err.code)) return true;
    // The underlying socket may have been silently closed and Node surfaces it
    // as `read ECONNRESET` in the message rather than the code. Catch both.
    const msg = String(err.message || '').toLowerCase();
    return /econnreset|epipe|etimedout|socket hang up/.test(msg);
}

function _databricksRequestOnce(profile, method, urlPath, body, requestId) {
    return new Promise(async (resolve, reject) => {
        let token;
        try {
            token = await resolveToken(profile);
        } catch (err) {
            return reject(err);
        }

        const base = profile.host.replace(/\/$/, '');
        let fullUrl;
        try {
            fullUrl = new URL(base + urlPath);
        } catch {
            return reject(new Error(`Invalid target URL: ${base + urlPath}`));
        }

        const isHttps = fullUrl.protocol === 'https:';
        const lib = isHttps ? https : http;
        const bodyStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: fullUrl.hostname,
            port: fullUrl.port || (isHttps ? 443 : 80),
            path: fullUrl.pathname + fullUrl.search,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                // Wave 30 cycle 5 — propagate X-Request-Id downstream so the
                // visual → proxy → Databricks chain is correlatable in DBR
                // request logs (Wave 28 tripwire was incomplete; this closes it).
                ...(requestId ? { 'X-Request-Id': String(requestId).slice(0, 80) } : {}),
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
            },
            timeout: 35000,
            agent: isHttps ? keepAliveAgent : undefined
        };

        const req = lib.request(options, resp => {
            const chunks = [];
            resp.on('data', c => chunks.push(c));
            resp.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                // Wave 30 cycle 5 — defence-in-depth token redaction. Strip
                // any inadvertent echo of Bearer / dapi / Authorization
                // before the body slice flows into the propagated Error
                // message. Some Databricks 4xx paths reflect inbound headers
                // back in the response body — without this they could surface
                // in the visual's chat bubble.
                const safeRaw = raw
                    .replace(/dapi[A-Fa-f0-9]{8,}/g, 'dapi[redacted]')
                    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
                    .replace(/(["']?[Aa]uthorization["']?\s*[:=]\s*)[^\s,"'}]+/g, '$1[redacted]');
                try {
                    const json = JSON.parse(raw);
                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(`Databricks ${resp.statusCode}: ${safeRaw.slice(0, 400)}`));
                    }
                } catch {
                    reject(new Error(`Non-JSON from Databricks (${resp.statusCode}): ${safeRaw.slice(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Databricks request timed out after 35s')));
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/**
 * Public wrapper. Retries idempotent (GET) requests once on transient
 * socket errors (ECONNRESET / EPIPE / ETIMEDOUT). Non-GET requests fail
 * fast — retrying a POST that may have already partially executed on the
 * server is unsafe. Long-poll callers (e.g. message status) only ever GET,
 * so this fully covers the AI Insights stale-keep-alive failure mode.
 */
async function databricksRequest(profile, method, urlPath, body, requestId) {
    const upper = String(method || '').toUpperCase();
    // 429 retry-with-exponential-backoff. Genie enforces ~5 req/min/workspace;
    // supervisor fan-out across 3-4 helpers reliably trips this on the second
    // consecutive call. Retrying is safe for both GET and POST against 429
    // because Databricks rejects the request before any state mutation —
    // unlike a partial-success POST where retry is unsafe. Backoff: 1s, 2s, 4s.
    const RATE_LIMIT_RETRIES = 3;
    let attempt = 0;
    for (;;) {
        try {
            return await _databricksRequestOnce(profile, method, urlPath, body, requestId);
        } catch (rawErr) {
            /** @type {any} */
            const err = rawErr;
            const msg = String(err?.message || '');
            const is429 = /Databricks\s+429/i.test(msg) || /REQUEST_LIMIT_EXCEEDED/i.test(msg);
            if (is429 && attempt < RATE_LIMIT_RETRIES) {
                const delayMs = 1000 * Math.pow(2, attempt);
                console.warn(`[databricksRequest] 429 retry ${attempt + 1}/${RATE_LIMIT_RETRIES} in ${delayMs}ms`, upper, urlPath);
                await new Promise(r => setTimeout(r, delayMs));
                attempt++;
                continue;
            }
            if (upper === 'GET' && isTransientNetError(err)) {
                console.warn('[databricksRequest] retry-once', upper, urlPath, err.code || err.message);
                // Brief pause so the keep-alive pool has a chance to drop the
                // bad socket before we redial.
                await new Promise(r => setTimeout(r, 250));
                return _databricksRequestOnce(profile, method, urlPath, body, requestId);
            }
            throw err;
        }
    }
}

// Normalize upstream Databricks auth failures so clients can distinguish
// invalid/expired credentials from generic transport errors.
function errorStatusFromDatabricks(err, fallbackStatus = 500, profile) {
    const message = String(err?.message || 'Unexpected proxy error');
    const m = message.match(/Databricks\s+(\d{3})\s*:/i);
    if (m) {
        const status = Number(m[1]);
        if (status === 401 || status === 403) {
            // Wave 28 — invalidate the OAuth M2M cache on 401 so a rotated
            // SP secret takes effect on the very next request, instead of
            // looping with the stale token until early-refresh fires.
            // (No-op for PAT profiles or when profile is omitted.)
            if (profile && status === 401) {
                try { invalidateOAuthCacheForProfile(profile); } catch { /* ignore */ }
            }
            return {
                status,
                error: 'Databricks authentication failed. Check token/client credentials for the selected profile.'
            };
        }
        if (status >= 400 && status < 600) {
            // Wave 28 — info-disclosure defence: redact column / table / schema
            // names from raw Databricks error messages before propagating to
            // the visual (which may show them to viewers without schema access).
            // E.g. "column 'CUSTOMER_AGE' not found in table 'SALES'" →
            //      "column [redacted] not found in table [redacted]".
            const redacted = message.replace(
                /((?:column|table|schema|view|database)\s+)['"`]?[A-Za-z0-9_.]+['"`]?/gi,
                '$1[redacted]'
            );
            return { status, error: redacted };
        }
    }
    return { status: fallbackStatus, error: message };
}

// ── Warehouse auto-start ──────────────────────────────────────────────────────
// If the profile has a warehouseId, check its state and start it if stopped.
// Returns immediately if already running. Polls until RUNNING or timeout.
//
// Cost guardrail: we memoise recent "started" events per warehouseId and
// refuse to re-issue a /start if the last attempt was within the cooldown
// window. Prevents a misbehaving visual (or a tight retry loop) from racking
// up DBU charges by repeatedly starting/stopping the same warehouse.
const WAREHOUSE_START_COOLDOWN_MS = 60 * 1000;
const warehouseStartLog = new Map(); // warehouseId → last-start timestamp (ms)

// Cache "we saw this warehouse RUNNING at time X" so we can skip the
// probe-before-every-Genie-call round trip. TTL is short (60s) because a
// warehouse auto-stops on idle — once it does, Databricks will surface the
// STOPPED state on the next request and we simply refill the cache.
const WAREHOUSE_RUNNING_TTL_MS = 5 * 60 * 1000;
const warehouseRunningLog = new Map(); // warehouseId → lastSeenRunning timestamp

async function ensureWarehouseRunning(profile) {
    const warehouseId = profile.warehouseId;
    if (!warehouseId) return; // No warehouse ID configured — skip

    // Fast path: we saw it RUNNING recently, skip the probe entirely.
    const lastRunning = warehouseRunningLog.get(warehouseId) || 0;
    if ((Date.now() - lastRunning) < WAREHOUSE_RUNNING_TTL_MS) {
        return;
    }

    try {
        const info = await databricksRequest(profile, 'GET', `/api/2.0/sql/warehouses/${warehouseId}`);
        const state = (info.state || '').toUpperCase();
        console.log(`[warehouse] ${warehouseId} state=${state}`);

        if (state === 'RUNNING') {
            warehouseRunningLog.set(warehouseId, Date.now());
            return;
        }

        if (state === 'STOPPED' || state === 'TERMINATED') {
            const lastStart = warehouseStartLog.get(warehouseId) || 0;
            const elapsed = Date.now() - lastStart;
            if (elapsed < WAREHOUSE_START_COOLDOWN_MS) {
                const waitSec = Math.ceil((WAREHOUSE_START_COOLDOWN_MS - elapsed) / 1000);
                console.log(`[warehouse] ${warehouseId} start skipped (cooldown, ${waitSec}s remaining)`);
            } else {
                console.log(`[warehouse] Starting ${warehouseId}...`);
                warehouseStartLog.set(warehouseId, Date.now());
                await databricksRequest(profile, 'POST', `/api/2.0/sql/warehouses/${warehouseId}/start`, {});
            }
        }

        // Poll until RUNNING (up to 5 minutes)
        const maxAttempts = 60;
        const interval = 5000;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, interval));
            const poll = await databricksRequest(profile, 'GET', `/api/2.0/sql/warehouses/${warehouseId}`);
            const currentState = (poll.state || '').toUpperCase();
            console.log(`[warehouse] Poll ${i + 1}/${maxAttempts}: ${currentState}`);
            if (currentState === 'RUNNING') {
                console.log(`[warehouse] ${warehouseId} is now RUNNING`);
                warehouseRunningLog.set(warehouseId, Date.now());
                return;
            }
            if (currentState === 'DELETED' || currentState === 'FAILED') {
                throw new Error(`Warehouse ${warehouseId} is in ${currentState} state`);
            }
        }
        throw new Error(`Warehouse ${warehouseId} did not start within 5 minutes`);
    } catch (err) {
        console.warn(`[warehouse] Auto-start issue: ${err.message}`);
        throw err;
    }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '4mb' }));

// CORS — Power BI Desktop WebView requires permissive headers.
// Wave 28 cycle 4 — added `X-Request-Id` to Allow-Headers + Expose-Headers
// list. Without it, the visual's POST to /assistant/conversations/start
// triggered a preflight OPTIONS, the response said "X-Request-Id not
// allowed", and the browser killed the request → xhr.status === 0 →
// "Proxy Offline" false-positive even though /health (which doesn't
// add X-Request-Id) succeeded simultaneously.
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Wave 31 — added X-Databricks-Host, X-Databricks-Token, X-Genie-Space-Id,
    // X-Profile-Name for inline-credentials path. Without these in Allow-Headers,
    // the preflight OPTIONS response would block the headers and the visual would
    // silently fall through to the named-profile path even when the author
    // intended to use inline creds.
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Genie-Target-Host, X-Genie-Key, X-Assistant-Profile, X-Request-Id, X-Databricks-Host, X-Databricks-Token, X-Genie-Space-Id, X-Profile-Name');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ── Shared-key auth ──────────────────────────────────────────────────────────
// Opt-in protection: when config.json sets `sharedKey`, every /assistant/*,
// /warehouse/*, and /feedback call must send the matching X-Genie-Key header.
// Leaving `sharedKey` unset (the default for local dev) preserves existing
// behaviour — localhost-only binding is still the primary defence.
function sharedKeyMiddleware(req, res, next) {
    const required = cfg().sharedKey;
    if (!required || !String(required).trim()) return next();
    const provided = req.headers['x-genie-key'];
    // Wave 30 cycle 5 — constant-time comparison (see /admin/health-summary
    // for rationale). Required > provided length never matches; same direct fail.
    if (provided) {
        try {
            const cryptoMod = require('crypto');
            const a = Buffer.from(String(provided), 'utf8');
            const b = Buffer.from(String(required), 'utf8');
            if (a.length === b.length && cryptoMod.timingSafeEqual(a, b)) return next();
        } catch { /* fall through to 401 */ }
    }
    return res.status(401).json({
        error: 'Missing or invalid X-Genie-Key header. Set the Proxy Shared Key in the visual format pane.'
    });
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Localhost-only binding already prevents external abuse, but a runaway
// visual (bug loop / double-click) could still burn DBUs. Apply a per-IP
// sliding window limit on all /assistant/* routes.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120; // requests per IP per window
const rateLimitBuckets = new Map(); // ip → number[] (timestamps)

function rateLimitMiddleware(req, res, next) {
    // Tests bypass: unit tests fire many sequential requests through the
    // same loopback IP and would otherwise trip the limit and poison other
    // tests' assertions.
    if (process.env.NODE_ENV === 'test') return next();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const bucket = (rateLimitBuckets.get(ip) || []).filter(ts => ts > cutoff);
    if (bucket.length >= RATE_LIMIT_MAX) {
        res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
        return res.status(429).json({
            error: `Too many requests (limit ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW_MS / 1000}s). Slow down.`
        });
    }
    bucket.push(now);
    rateLimitBuckets.set(ip, bucket);
    next();
}

// Rate-limit any path that hits an LLM / warehouse / Genie space — these are
// the routes that burn DBUs or token cost per call. Health/profiles/list are
// cheap reads and stay open.
app.use('/assistant', rateLimitMiddleware);
app.use('/warehouse', rateLimitMiddleware);
app.use('/supervisor', rateLimitMiddleware);
app.use('/confidence', rateLimitMiddleware);
app.use('/openai', rateLimitMiddleware);
app.use('/bedrock', rateLimitMiddleware);
// Cycle 47.6 — Foundation Model serving endpoint (Mosaic AI Model Serving).
// Same cost posture as the other LLM paths: rate-limit + sharedKey-gate.
app.use('/foundation', rateLimitMiddleware);
// Wave 28 — /feedback and /history are write-heavy paths (append to log
// file + Databricks SQL row insert). Without rate-limit, a runaway
// client could spam them and bloat disk / poison the history table.
// sharedKey gates auth; rate-limit caps damage post-auth.
app.use('/feedback', rateLimitMiddleware);
app.use('/history', rateLimitMiddleware);
// Wave 30 cycle 5 — /admin endpoints are gated by sharedKey but were not
// rate-limited, leaving the same key as a brute-force target. Apply the
// rate limit here too so a runaway probe can't spam /admin/health-summary.
app.use('/admin', rateLimitMiddleware);

// Wave 28 — X-Request-Id correlation. Visual sets `X-Request-Id` on every
// outbound request; we echo it back in the response so the visual + proxy
// + downstream Databricks logs can all be joined on one ID. If the visual
// doesn't supply one, we mint a server-side fallback so audit lines are
// always traceable. Mounted before all routes so every response carries it.
app.use((req, res, next) => {
    let rid = req.headers['x-request-id'];
    if (!rid || typeof rid !== 'string' || rid.length > 80) {
        rid = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    // Sanitize: only safe header chars
    rid = String(rid).replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 80) || `srv-${Date.now()}`;
    req.requestId = rid;
    res.setHeader('X-Request-Id', rid);
    next();
});

// Shared-key auth. When the deployer sets `sharedKey` in config (or
// PROXY_SHARED_KEY env), every cost-bearing route requires the matching
// X-Genie-Key header. Missing previously: /supervisor, /confidence,
// /openai, /bedrock — meaning a sharedKey-protected deployment was still
// open on those paths. Now closed.
app.use('/assistant', sharedKeyMiddleware);
app.use('/warehouse', sharedKeyMiddleware);
app.use('/feedback', sharedKeyMiddleware);
app.use('/history', sharedKeyMiddleware);
app.use('/supervisor', sharedKeyMiddleware);
app.use('/confidence', sharedKeyMiddleware);
app.use('/openai', sharedKeyMiddleware);
app.use('/bedrock', sharedKeyMiddleware);
app.use('/foundation', sharedKeyMiddleware);
// Wave 41 PREP — /insights/* is the AI-assisted introspection family. Today
// it hosts /insights/suggest-metric-rules; future cycles will fold in the
// existing suggest-config call once the visual stops piggy-backing on the
// Genie conversation channel for that path. Same auth posture as every
// cost-bearing route.
app.use('/insights', rateLimitMiddleware);
app.use('/insights', sharedKeyMiddleware);

// ── Audit logging ─────────────────────────────────────────────────────────────
// Lightweight structured log: who (ip), what (route), which profile, and result.
// NOT a replacement for Databricks unified audit logs, but helps trace local
// development and misbehaving clients.
//
// M1 (Codex Review #1) — added in-process rolling counters keyed by route +
// status class. Kept tiny on purpose; aggregation belongs in a proper sink
// (Datadog, Loki, etc.) for any deploy beyond a single laptop.
const _auditCounters = {
    /** @type {Record<string, number>} */ byAction: {},
    /** @type {Record<string, number>} */ byStatusClass: {},
    /** @type {Record<string, number>} */ byProfile: {},
    /** @type {Array<{ ts: string, action: string, status: number|string|null, detail: string|null, profile: string|null }>} */
    recentErrors: [],
    startedAt: new Date().toISOString(),
    total: 0
};

function _statusClass(status) {
    const n = typeof status === 'number' ? status : Number(status);
    if (!Number.isFinite(n)) return 'unknown';
    if (n >= 200 && n < 300) return '2xx';
    if (n >= 300 && n < 400) return '3xx';
    if (n >= 400 && n < 500) return '4xx';
    if (n >= 500) return '5xx';
    return 'other';
}

/**
 * @param {import('express').Request} req
 * @param {{ profileName?: string|null, spaceId?: string|null, action: string, status?: number|string|null, detail?: string|null, spIdentityHash?: string|null }} args
 */
function auditLog(req, { profileName, spaceId, action, status, detail, spIdentityHash }) {
    const ts = new Date().toISOString();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const ua = (req.headers['user-agent'] || '').slice(0, 80);
    // Wave 28 — include request-id (set by the X-Request-Id middleware)
    // so audit lines can be correlated to visual session log + downstream
    // Databricks request log on a single ID.
    const requestId = req.requestId || null;
    // Tier B Day 3 — when the profile is OAuth M2M, stamp the audit line
    // with an opaque SHA-256 hash of the Service Principal client_id. This
    // lets analysts group activity by SP identity without persisting the
    // raw clientId. PAT / Azure-Identity profiles produce null and the key
    // is omitted entirely (clean log line, no noise).
    const baseLine = {
        ts, ip, ua, requestId, action, route: `${req.method} ${req.originalUrl}`,
        profile: profileName || null, spaceId: spaceId || null,
        status: status ?? null, detail: detail ?? null,
    };
    if (spIdentityHash) baseLine.spIdentityHash = spIdentityHash;
    // Wave 36 — stamp inline-credentials usage on the audit line. Set by
    // resolveProfile() when the request was resolved through the inline path
    // in fallback or override mode. The token NEVER leaks here — only the
    // *fact* of inline use and which fields came from headers (host / token
    // / spaceId labels, not their values).
    const inlineMeta = req && req._inlineCredsMeta;
    if (inlineMeta && inlineMeta.used) {
        baseLine.inlineCredsUsed = true;
        baseLine.inlineCredsMode = inlineMeta.mode || null;
        if (Array.isArray(inlineMeta.fields) && inlineMeta.fields.length > 0) {
            baseLine.inlineCredsFields = inlineMeta.fields.slice();
        }
    }
    const line = JSON.stringify(baseLine);
    console.log('[audit]', line);

    // M1 — counters
    _auditCounters.total++;
    _auditCounters.byAction[action] = (_auditCounters.byAction[action] || 0) + 1;
    const sc = _statusClass(status);
    _auditCounters.byStatusClass[sc] = (_auditCounters.byStatusClass[sc] || 0) + 1;
    if (profileName) {
        _auditCounters.byProfile[profileName] = (_auditCounters.byProfile[profileName] || 0) + 1;
    }
    if (sc === '4xx' || sc === '5xx') {
        _auditCounters.recentErrors.push({
            ts, action, status: status ?? null, detail: detail ?? null, profile: profileName || null
        });
        if (_auditCounters.recentErrors.length > 25) _auditCounters.recentErrors.shift();
    }
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    const c = cfg();
    // authMode is whether the proxy enforces an X-Genie-Key shared secret.
    // We never reveal the secret itself — just whether it's configured.
    const authMode = (process.env.PROXY_SHARED_KEY || c.sharedKey) ? 'sharedKey' : 'anonymous';
    // Route through the registry so doc keys never leak (IDEA-016).
    const profileNames = profileRegistry.list();
    res.json({
        ok: true,
        profiles: profileNames,
        port: c.port,
        configSource: c.configSource || 'config.json',
        databricksApp: Boolean(process.env.DATABRICKS_APP_NAME),
        appName: process.env.DATABRICKS_APP_NAME || null,
        authMode,
    });
});

// ── Admin health summary (M1) ─────────────────────────────────────────────────
// Aggregates the in-process audit counters so an operator can answer
// "is the proxy healthy and what's been failing?" with a single curl.
// Gated behind sharedKey when one is configured — the summary contains no
// secrets but does expose request volume by profile, which is mildly
// sensitive in multi-tenant deploys.
app.get('/admin/health-summary', (req, res) => {
    const c = cfg();
    const expected = process.env.PROXY_SHARED_KEY || c.sharedKey;
    if (expected) {
        const provided = req.headers['x-genie-key'];
        // Wave 30 cycle 5 — constant-time comparison closes a timing oracle
        // on the shared key. Plain `!==` leaks per-byte equality timing,
        // measurable over enough probes; timingSafeEqual normalizes work.
        // Lengths must match before comparison; mismatching lengths is a
        // direct fail (and itself a length-only oracle, which is acceptable).
        let ok = false;
        try {
            const cryptoMod = require('crypto');
            const a = Buffer.from(String(provided || ''), 'utf8');
            const b = Buffer.from(String(expected), 'utf8');
            ok = a.length === b.length && cryptoMod.timingSafeEqual(a, b);
        } catch { ok = false; }
        if (!ok) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    const uptimeSec = Math.floor(process.uptime());
    res.json({
        ok: true,
        startedAt: _auditCounters.startedAt,
        uptimeSec,
        totalAudited: _auditCounters.total,
        byStatusClass: _auditCounters.byStatusClass,
        byAction: _auditCounters.byAction,
        byProfile: _auditCounters.byProfile,
        recentErrors: _auditCounters.recentErrors,
        memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version
    });
});

// ── Capabilities (visual connection test) ─────────────────────────────────────
// Cycle 40 — query history audit endpoint. Proxies the Databricks SQL
// History API so the visual's "Query Audit" panel (Setup → Developer
// Tools) can show recent SQL Genie ran on the user's behalf — copy-
// pasteable for bug fixing / tracing. Same shared-key gate as
// /admin/health-summary so it's author-only when a key is configured.
//
// Query params:
//   profile=<assistantProfile>  (default: first configured profile)
//   maxResults=<n>              (default 50, max 100)
//   sinceMinutes=<n>            (default 60 = last hour)
//
// Returns:
//   { queries: [{ statement_id, query_text, status, duration_ms,
//                 executed_at_ms, error_message, user_name }], ...meta }
app.get('/admin/query-history', async (req, res) => {
    // Shared-key gate (constant-time, mirrors /admin/health-summary).
    const c = cfg();
    const expected = process.env.PROXY_SHARED_KEY || c.sharedKey;
    if (expected) {
        const provided = req.headers['x-genie-key'];
        let ok = false;
        try {
            const cryptoMod = require('crypto');
            const a = Buffer.from(String(provided || ''), 'utf8');
            const b = Buffer.from(String(expected), 'utf8');
            ok = a.length === b.length && cryptoMod.timingSafeEqual(a, b);
        } catch { ok = false; }
        if (!ok) return res.status(401).json({ error: 'Unauthorized' });
    }
    const profileName = String(req.query.profile || '').trim()
        || (Object.keys(c.profiles || {})[0]);
    const profile = (c.profiles || {})[profileName];
    if (!profile) {
        return res.status(400).json({ error: `Unknown profile "${profileName}"` });
    }
    const maxResults = Math.min(100, Math.max(1, parseInt(String(req.query.maxResults || '50'), 10) || 50));
    const sinceMinutes = Math.max(1, parseInt(String(req.query.sinceMinutes || '60'), 10) || 60);
    const startTimeMs = Date.now() - (sinceMinutes * 60 * 1000);
    try {
        // Cycle 42 — simplified URL. The earlier `filter_by` JSON-in-query
        // string broke against some Databricks workspaces (returns 502
        // because the API can't parse the encoded JSON object). Now we
        // fetch the most recent maxResults queries (Databricks returns
        // them most-recent-first by default) and filter by timestamp
        // client-side in the proxy. Cleaner, more compatible.
        const data = await databricksRequest(
            profile,
            'GET',
            `/api/2.0/sql/history/queries?max_results=${maxResults}`,
            null,
            req.headers['x-request-id']
        );
        // Normalise to a slim, copy-friendly shape. Truncate query_text only
        // when it's absurdly large (1MB+ kills the visual's render).
        const allRaw = Array.isArray(data?.res) ? data.res : (Array.isArray(data?.queries) ? data.queries : []);
        // Client-side time filter — drop anything older than sinceMinutes.
        const raw = allRaw.filter(q => {
            const ts = q.query_start_time_ms || q.execution_start_time_ms || 0;
            return ts >= startTimeMs;
        });
        const queries = raw.map(q => ({
            statement_id: q.query_id || q.statement_id || null,
            query_text: typeof q.query_text === 'string'
                ? (q.query_text.length > 200000 ? q.query_text.slice(0, 200000) + '\n-- [truncated]' : q.query_text)
                : '',
            status: q.status || q.state || 'UNKNOWN',
            duration_ms: q.duration || q.execution_time_ms || null,
            executed_at_ms: q.query_start_time_ms || q.execution_start_time_ms || null,
            error_message: q.error_message || q.error || null,
            user_name: q.user_name || q.executed_as_user_name || null,
            warehouse_id: q.warehouse_id || q.endpoint_id || null,
            statement_type: q.statement_type || null,
            rows_produced: q.rows_produced || q.row_count || null
        }));
        res.json({
            ok: true,
            profileName,
            sinceMinutes,
            maxResults,
            count: queries.length,
            queries,
            // Echo whether more results exist so the panel can show a hint.
            hasMore: !!(data?.has_next_page || data?.next_page_token)
        });
    } catch (err) {
        console.warn('[admin/query-history]', err.message);
        // Cycle 42 — propagate more of the Databricks error so the visual
        // can show actionable detail. Token redaction (Wave 30 cycle 4)
        // already runs INSIDE databricksRequest's response parser before
        // the error is thrown, so what we see here is already sanitised
        // (no raw Bearer/dapi/Authorization values). Cap at 600 chars
        // — enough to convey 'permission denied' / 'bad request' detail
        // without leaking giant stack traces. Also extract the HTTP
        // status code from the message if present (databricksRequest
        // formats errors as 'Databricks 401: <body>').
        const raw = err.message || 'Unexpected proxy error';
        const m = raw.match(/Databricks\s+(\d{3})\s*:\s*(.*)/i);
        const friendly = m
            ? `Databricks ${m[1]}: ${m[2].slice(0, 500)}`
            : raw.slice(0, 600);
        res.status(502).json({ error: friendly });
    }
});

// Cycle 45 (Option 2) — server-side AI Insights stage validator endpoint.
// Visual / any other client posts {title, body} — proxy returns
// {ok, reason?, retryDirective?} from proxy/lib/insightsValidator.js.
// Same shape-only checks as visual-side (insightsStageValidator.ts) so
// validation rules have one canonical source: the JS module.
//
// Why server-side: lets you tune validation rules WITHOUT re-deploying
// the .pbiviz. Just edit insightsValidator.js + restart proxy. Visual
// can call this endpoint as the rule authority instead of (or alongside)
// its local validator.
//
// No auth required — purely shape-checking, no secrets touched. Light
// rate limiting via the existing per-IP middleware applies.
const insightsValidator = require('./lib/insightsValidator');
app.post('/assistant/validate', (req, res) => {
    try {
        const { title, body } = req.body || {};
        if (typeof title !== 'string' || typeof body !== 'string') {
            return res.status(400).json({ error: 'Body must be { title: string, body: string }' });
        }
        const result = insightsValidator.validateStageOutput(title, body);
        res.json({
            ...result,
            // Cycle 45 — echo title back so client can route the response
            // when multiple validations are in flight. Trace-friendly.
            title: String(title || '').trim().toUpperCase(),
            validatedAt: Date.now(),
            validatorVersion: 'cycle45',
        });
    } catch (err) {
        console.warn('[assistant/validate]', err.message);
        res.status(500).json({ error: 'Validator internal error' });
    }
});

// Cycle 45 (Option 2 cont.) — composite multi-section validator. Posts
// the WHOLE assembled markdown ({content}); proxy splits into sections
// + validates each. Returns aggregated diagnostics. Useful for clients
// that have a composite response and want a single round-trip.
app.post('/assistant/validate-composite', (req, res) => {
    try {
        const { content } = req.body || {};
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Body must be { content: string }' });
        }
        const result = insightsValidator.validateCompositeResponse(content);
        res.json({
            ...result,
            validatedAt: Date.now(),
            validatorVersion: 'cycle45',
        });
    } catch (err) {
        console.warn('[assistant/validate-composite]', err.message);
        res.status(500).json({ error: 'Validator internal error' });
    }
});

app.get('/assistant/capabilities', (req, res) => {
    const resolved = resolveProfile({}, req.query, req.headers, req);
    if (!resolved) return res.status(404).json({ error: 'No matching profile configured. Check config.json.' });
    res.json({ assistantProfile: req.query.assistantProfile || 'default', spaceId: resolved.profile.spaceId, ok: true });
});

// Safe profile discovery for the in-visual Setup screen. Never returns tokens
// or secrets from config.json; only names, lightly masked routing hints,
// and optional friendly display metadata (displayName + dataDomain) used
// by the visual's progress widget so we never leak the raw profile key
// or "Genie space" wording into user-facing surfaces (BUG-013 generic).
//
// Keys starting with "_doc_" are treated as in-file documentation and
// skipped — see config.example.json for the convention.
app.get('/assistant/profiles', (_req, res) => {
    const profiles = profileRegistry.entries().map(([name, profile]) => {
        const host = String(profile.host || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        const spaceId = String(profile.spaceId || '');
        const displayName = (profile.displayName && String(profile.displayName).trim())
            || titleCaseProfileKey(name);
        const dataDomain = (profile.dataDomain && String(profile.dataDomain).trim()) || undefined;
        return {
            name,
            displayName,
            dataDomain,
            description: profile.type === 'supervisor-local'
                ? 'Genie Supervisor Agent'
                : host || undefined,
            spaceId: spaceId
                ? `${spaceId.slice(0, 6)}...${spaceId.slice(-6)}`
                : undefined,
        };
    });
    res.json(profiles);
});

function titleCaseProfileKey(name) {
    return String(name || '')
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

// ── Home (welcome screen snapshot) ───────────────────────────────────────────
// IDEA-006: profiles can declare a `suggestedQuestions: ["...", "..."]`
// array in config.json (or via the env-var loader as
// PROXY_PROFILE_<NAME>_SUGGESTED_QUESTIONS, comma-separated). When present,
// they're surfaced here as `suggestedActions` so the visual's Welcome
// pane / Try-Asking strip shows space-specific starter questions instead
// of the generic static set.
app.post('/assistant/home', (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    const curated = resolved?.profile?.suggestedQuestions;
    let suggestedActions = [];
    if (Array.isArray(curated) && curated.length > 0) {
        suggestedActions = curated
            .map(q => typeof q === 'string' ? q.trim() : '')
            .filter(Boolean)
            .slice(0, 8)
            .map((q, i) => ({
                id: `curated-${i}`,
                label: q.length > 60 ? q.slice(0, 57) + '…' : q,
                kind: 'ask',
                prompt: q,
                intent: 'summary'
            }));
    }
    res.json({
        snapshot: [],
        risks: [],
        opportunities: [],
        changes: [],
        suggestedActions,
        generatedBy: 'proxy',
        assistantProfile: resolved?.name || 'default'
    });
});

// ── Warehouse status ──────────────────────────────────────────────────────────
app.get('/warehouse/status', async (req, res) => {
    const resolved = resolveProfile({}, req.query, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });
    const warehouseId = resolved.profile.warehouseId;
    if (!warehouseId) return res.json({ configured: false, state: 'unknown' });

    try {
        const info = await databricksRequest(resolved.profile, 'GET', `/api/2.0/sql/warehouses/${warehouseId}`);
        res.json({ configured: true, state: info.state, name: info.name, warehouseId });
    } catch (err) {
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// ── Warehouse start (manual trigger) ─────────────────────────────────────────
app.post('/warehouse/start', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });
    const warehouseId = resolved.profile.warehouseId;
    if (!warehouseId) return res.status(400).json({ error: 'No warehouseId configured in profile' });

    try {
        await ensureWarehouseRunning(resolved.profile);
        res.json({ ok: true, state: 'RUNNING' });
    } catch (err) {
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// ── Start conversation ────────────────────────────────────────────────────────
// ── Genie space sync (Section G) ──────────────────────────────────────────────
// Read-only passthrough so the visual can fetch the upstream serialized_space
// without browser-direct PAT exposure. Keeps the same security posture as
// every cost-bearing /assistant route — rateLimitMiddleware + sharedKeyMiddleware
// already gate this path. Phase B (commit 48.16) adds the matching write
// path (POST /assistant/space-update) behind an explicit auth gate.
app.get('/assistant/space-fetch', async (req, res) => {
    const resolved = resolveProfile({}, req.query, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });

    const spaceId = String(req.query.spaceId || resolved.profile.spaceId || '').trim();
    if (!spaceId) return res.status(400).json({ error: 'spaceId is required' });

    try {
        const data = await databricksRequest(
            resolved.profile, 'GET',
            `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}?include_serialized_space=true`
        );
        console.log(`[space-fetch] profile=${resolved.name} space=${spaceId}`);
        res.json(data);
    } catch (err) {
        console.error('[space-fetch]', err.message);
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// Phase B (48.16) — write path. Pushes a fresh serialized_space blob to
// the upstream Genie space. Same auth posture as the read passthrough
// (rateLimitMiddleware + sharedKeyMiddleware via the /assistant prefix).
// The visual gates this at the UI level with a confirm modal; the proxy
// trusts the visual to have done so by the time the request lands here.
app.post('/assistant/space-update', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });

    const spaceId = String(req.body.spaceId || resolved.profile.spaceId || '').trim();
    if (!spaceId) return res.status(400).json({ error: 'spaceId is required' });

    const serialized = req.body.serialized_space;
    if (!serialized || typeof serialized !== 'string') {
        return res.status(400).json({ error: 'serialized_space (JSON string) is required' });
    }
    // Light validation — confirm it's parseable. Genie will do its own
    // schema validation but we want to fail fast on obviously broken input.
    try {
        const parsed = JSON.parse(serialized);
        if (!parsed || parsed.version !== 2) {
            return res.status(400).json({ error: 'serialized_space must be a v2 JSON object' });
        }
    } catch (e) {
        return res.status(400).json({ error: `serialized_space JSON parse failed: ${e.message}` });
    }

    try {
        const data = await databricksRequest(
            resolved.profile, 'PATCH',
            `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}`,
            { serialized_space: serialized }
        );
        console.log(`[space-update] profile=${resolved.name} space=${spaceId} serialized=${serialized.length} bytes`);
        res.json(data);
    } catch (err) {
        console.error('[space-update]', err.message);
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

app.post('/assistant/conversations/start', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });

    const { spaceId, content, contextText } = req.body;
    if (!content || !String(content).trim()) {
        return res.status(400).json({ error: 'Question content is required' });
    }
    const targetSpaceId = spaceId || resolved.profile.spaceId;
    const fullContent = [contextText, content].filter(Boolean).join('\n\n');

    try {
        await ensureWarehouseRunning(resolved.profile);
        const data = await databricksRequest(
            resolved.profile, 'POST',
            `/api/2.0/genie/spaces/${targetSpaceId}/start-conversation`,
            { content: fullContent },
            req.requestId  // Wave 30 cycle 5 — propagate correlation id downstream
        );
        const convId = data.conversation_id ?? data.conversation?.id;
        storeConversation(convId, targetSpaceId, resolved.name);
        console.log(`[start] profile=${resolved.name} space=${targetSpaceId} conv=${convId}`);
        res.json(data);
    } catch (err) {
        console.error('[start-conversation]', err.message);
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// ── Send message ──────────────────────────────────────────────────────────────
app.post('/assistant/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });

    const stored = conversationMap.get(conversationId);
    const targetSpaceId = stored?.spaceId || req.body.spaceId || resolved.profile.spaceId;
    const { content, contextText } = req.body;
    if (!content || !String(content).trim()) {
        return res.status(400).json({ error: 'Question content is required' });
    }
    const fullContent = [contextText, content].filter(Boolean).join('\n\n');

    try {
        await ensureWarehouseRunning(resolved.profile);
        const data = await databricksRequest(
            resolved.profile, 'POST',
            `/api/2.0/genie/spaces/${targetSpaceId}/conversations/${conversationId}/messages`,
            { content: fullContent },
            req.requestId  // Wave 30 cycle 5 — propagate correlation id downstream
        );
        storeConversation(conversationId, targetSpaceId, resolved.name);
        console.log(`[send] profile=${resolved.name} space=${targetSpaceId} conv=${conversationId}`);
        res.json(data);
    } catch (err) {
        console.error('[send-message]', err.message);
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// ── Query result enrichment ───────────────────────────────────────────────────
// The Genie message poll returns text + SQL in attachments, but the actual
// query result data lives behind a separate endpoint.  This function detects
// completed messages with query attachments, fetches the result, and injects
// it inline so the visual doesn't need a second round-trip.
async function enrichQueryResults(profile, spaceId, conversationId, messageId, data) {
    const status = (data.status || '').toUpperCase();
    if (status !== 'COMPLETED' || !data.attachments) return data;

    for (let i = 0; i < data.attachments.length; i++) {
        const att = data.attachments[i];
        if (!att.query || att.query.result?.data_table) continue;

        try {
            const result = await databricksRequest(
                profile, 'GET',
                `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}/query-result`
            );

            const stmt = result.statement_response || result;
            const columns = stmt.manifest?.schema?.columns || [];
            const typedRows = stmt.result?.data_typed_array || stmt.result?.data_array || [];

            if (columns.length > 0) {
                const rows = typedRows.map(row =>
                    Array.isArray(row)
                        ? row
                        : (row.values || []).map(v => v.str ?? v.value ?? null)
                );

                att.query.result = {
                    columns: columns.map(c => ({ name: c.name, type: c.type_name })),
                    data_table: rows
                };

                console.log(`[poll] msg=${messageId} att#${i} enriched: ${columns.length} cols, ${rows.length} rows`);
            } else {
                // Surface the shape so the visual can show a useful error rather
                // than silently displaying "no data".
                att.query.result = att.query.result || {};
                att.query.result.enrichmentWarning =
                    'Genie returned a COMPLETED status but the query-result payload had no columns.';
                console.warn(`[poll] msg=${messageId} att#${i} enrichment produced no columns`);
            }
        } catch (err) {
            // Attach the failure to the attachment so the visual can distinguish
            // "query still running" from "fetch of ready data failed".
            att.query.result = att.query.result || {};
            att.query.result.enrichmentError = err.message;
            console.warn(`[poll] msg=${messageId} att#${i} enrichment failed: ${err.message}`);
        }
    }

    return data;
}

// BUG-003: Databricks Genie poll returns the *user's question* in `data.content`
// and the AI answer inside `attachments[].text.content`. The visual reads
// `message.content` as the answer, so without this rewrite the system prompt
// leaks into the HEADLINE card. This helper replaces `data.content` with the
// joined text-attachment content (or '' when no answer text is present) and
// leaves attachments intact for downstream SQL/table rendering.
function normalizeGenieResponse(data) {
    if (!data || typeof data !== 'object') return data;
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const parts = [];
    for (const att of attachments) {
        const text = att?.text;
        if (typeof text === 'string' && text.trim()) {
            parts.push(text.trim());
        } else if (text && typeof text === 'object' && text.content && String(text.content).trim()) {
            parts.push(String(text.content).trim());
        }
    }
    data.content = parts.length ? parts.join('\n\n') : '';
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle 45 (Option 3) — server-side AI Insights validation helper.
//
// Called from the Genie-message-poll route below, AFTER
// normalizeGenieResponse has set `data.content` from attachments.
//
// Behavior:
//   1. Bail early if status !== COMPLETED, content is empty, or content
//      has no `## SECTION` headings (means it's a Chat-style answer,
//      not multi-section AI Insights).
//   2. Bail early if env var GENIE_POLL_VALIDATE_RETRIES = 0 (default).
//   3. Run validateCompositeResponse on the content. If any section
//      fails AND retry budget remains, send a follow-up message in the
//      SAME Genie conversation with a stronger directive that includes
//      the failed section as evidence.
//   4. Wait for the retry message to complete (poll Databricks).
//   5. If the retry's content fails fewer sections than the original,
//      replace `data.content` with the retry. Annotate
//      `data.validationDiagnostics` with attempt count + failure reasons
//      so the visual can surface the diagnostic inline.
//   6. Mutates `data` in place. Always non-throwing — validation
//      failures are logged but never break the original poll response.
//
// Coordination with visual-side cycle 44 B:
//   When visual sees data.validationDiagnostics with retried=true, it
//   should treat the response as "already retried server-side" and not
//   double-retry from the visual's own budget. (Visual-side coordination
//   is a small follow-up — for cycle 45 we just emit the diagnostic.)
// ─────────────────────────────────────────────────────────────────────────────
async function maybeValidateGeniePollResponse({ data, actualProfile, targetSpaceId, conversationId, requestId }) {
    // 1. Cheap eligibility checks first.
    if (!data || (data.status || '').toUpperCase() !== 'COMPLETED') return;
    const content = data.content;
    if (!content || typeof content !== 'string' || !/^#{1,3}\s/m.test(content)) return;

    // 2. Opt-in via env var.
    const retryBudget = Math.max(0, Math.min(3, parseInt(process.env.GENIE_POLL_VALIDATE_RETRIES || '0', 10) || 0));
    if (retryBudget === 0) return;

    let validator;
    try { validator = require('./lib/insightsValidator'); }
    catch (e) { console.warn(`[poll-validate] validator load failed: ${e.message}`); return; }

    const composite = validator.validateCompositeResponse(content);
    if (composite.ok) {
        // Pass-through. Annotate so visual knows server-side validation ran cleanly.
        data.validationDiagnostics = { ok: true, attempts: 1, source: 'genie-poll' };
        return;
    }

    // 3. Validation failed + budget allows. Retry once via follow-up message.
    const firstFail = composite.firstFailure;
    console.log(`[poll-validate] conv=${conversationId} validation FAILED for "${firstFail.title}" (${firstFail.validation.reason}); sending refinement`);
    const retryDirective = validator.buildRetryPrompt(
        '(your previous response on this conversation)',
        firstFail.title,
        firstFail.body,
        firstFail.validation
    );

    let retryContent = null;
    try {
        // Send refinement as a new message in the same conversation. Genie
        // treats it as a follow-up turn with conversation memory intact.
        const refinementBody = { content: retryDirective };
        const refinementStart = await databricksRequest(
            actualProfile, 'POST',
            `/api/2.0/genie/spaces/${targetSpaceId}/conversations/${conversationId}/messages`,
            refinementBody, requestId
        );
        const refMsgId = refinementStart?.message_id || refinementStart?.id;
        if (!refMsgId) throw new Error('Refinement start returned no message_id');

        // Synchronously poll for refinement completion (cap at 90s so we
        // don't hang the original visual poll forever).
        const POLL_DEADLINE_MS = 90 * 1000;
        const POLL_INTERVAL_MS = 2000;
        const startedAt = Date.now();
        while (Date.now() - startedAt < POLL_DEADLINE_MS) {
            const refData = await databricksRequest(
                actualProfile, 'GET',
                `/api/2.0/genie/spaces/${targetSpaceId}/conversations/${conversationId}/messages/${refMsgId}`,
                null, requestId
            );
            const refStatus = (refData.status || '').toUpperCase();
            if (refStatus === 'COMPLETED') {
                normalizeGenieResponse(refData);
                retryContent = refData.content || '';
                break;
            }
            if (refStatus === 'FAILED' || refStatus === 'CANCELLED') break;
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
    } catch (e) {
        console.warn(`[poll-validate] refinement call failed: ${e.message}`);
    }

    // 4. Pick the better attempt.
    if (retryContent && retryContent.trim()) {
        const retryComposite = validator.validateCompositeResponse(retryContent);
        if (retryComposite.failureCount < composite.failureCount) {
            data.content = retryContent;
            data.validationDiagnostics = {
                ok: retryComposite.ok,
                failureCount: retryComposite.failureCount,
                attempts: 2,
                retried: true,
                source: 'genie-poll',
                originalFailureReason: firstFail.validation.reason,
            };
            console.log(`[poll-validate] retry IMPROVED — failures ${composite.failureCount} → ${retryComposite.failureCount}`);
            return;
        }
    }

    // 5. Retry didn't improve. Keep original; emit diagnostic so visual
    //    can surface inline banner + offer manual retry.
    data.validationDiagnostics = {
        ok: false,
        failureCount: composite.failureCount,
        attempts: 2,
        retried: true,
        retriedNoImprovement: true,
        source: 'genie-poll',
        firstFailureReason: firstFail.validation.reason,
        firstFailureTitle: firstFail.title,
    };
}

// ── Poll message status ───────────────────────────────────────────────────────
// The visual sends ?assistantProfile and ?spaceId as query params (see genie.ts)
// so this works even after a proxy restart clears the in-memory map.
app.get('/assistant/conversations/:conversationId/messages/:messageId', async (req, res) => {
    const { conversationId, messageId } = req.params;

    const stored = conversationMap.get(conversationId);
    const profileName = stored?.profileName || req.query.assistantProfile;
    const resolved = profileByName(profileName)
        || profileByHost(req.headers['x-genie-target-host'])
        || profileByName('default');

    if (!resolved) return res.status(400).json({ error: 'Cannot resolve profile for this conversation' });
    const actualProfile = resolved.profile;

    const targetSpaceId = stored?.spaceId || req.query.spaceId || actualProfile.spaceId;

    try {
        const data = await databricksRequest(
            actualProfile, 'GET',
            `/api/2.0/genie/spaces/${targetSpaceId}/conversations/${conversationId}/messages/${messageId}`
        );
        await enrichQueryResults(actualProfile, targetSpaceId, conversationId, messageId, data);
        normalizeGenieResponse(data);

        // ─────────────────────────────────────────────────────────────
        // Cycle 45 (Option 3) — server-side AI Insights validation
        // on Genie poll completion.
        //
        // What it does:
        //   When status === COMPLETED + content has section headings,
        //   run the same insightsValidator (proxy/lib/insightsValidator.js)
        //   the visual + orchestrator use. If validation fails AND
        //   server-side retry is enabled, send a follow-up message in
        //   the SAME Genie conversation with a stronger directive,
        //   then return the better of the two attempts.
        //
        // Default behavior:
        //   Off (env var GENIE_POLL_VALIDATE_RETRIES = 0). Existing
        //   visual-side validator (cycle 23 + 44 B) continues to handle
        //   format compliance. Set the env var to 1-3 to enable
        //   server-side enforcement on top.
        //
        // Why opt-in:
        //   Adds 10-25s latency on the visual's poll when a retry
        //   fires. Visual is waiting for this poll to return — extra
        //   server time = visual perceived latency. Default off
        //   preserves current behaviour.
        //
        // Coordination with visual-side retries (cycle 44 B):
        //   Server-side retry happens BEFORE the response leaves the
        //   proxy. Visual sees the better attempt. If the server
        //   retried, we annotate `validationDiagnostics` so the visual
        //   knows + can decide whether to also retry per its budget
        //   (avoids double-retry of an already-retried response).
        // ─────────────────────────────────────────────────────────────
        await maybeValidateGeniePollResponse({
            data, actualProfile, targetSpaceId, conversationId, requestId: req.headers['x-request-id'],
        });

        auditLog(req, {
            profileName: resolved.name,
            spaceId: targetSpaceId,
            action: 'poll',
            status: (data.status || '').toUpperCase(),
            spIdentityHash: spHashForProfile(actualProfile),
        });
        res.json(data);
    } catch (err) {
        console.error('[poll]', err.message);
        auditLog(req, {
            profileName: resolved.name,
            spaceId: targetSpaceId,
            action: 'poll',
            status: 'ERROR',
            detail: err.message,
            spIdentityHash: spHashForProfile(actualProfile),
        });
        const mapped = errorStatusFromDatabricks(err, 500);
        res.status(mapped.status).json({ error: mapped.error });
    }
});

// ── Feedback log ──────────────────────────────────────────────────────────────
// Writes redacted feedback events to a rotating log. Caps total size so a
// noisy visual (or a disk-full attacker) can't fill the host filesystem.
const FEEDBACK_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file
const FEEDBACK_LOG_KEEP = 3;                    // feedback.log + .1 + .2
const TOKEN_REDACT_RE = /\b(dapi[a-f0-9]{16,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)\b/g;
// Wave 28 — PII patterns. Authors / users sometimes paste email or phone
// numbers into feedback / history / chat. Redact before persisting.
const EMAIL_REDACT_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REDACT_RE = /\b(?:\+?\d{1,3}[\s.\-]?)?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}\b/g;

function redactFeedbackPayload(body) {
    // Stringify → redact tokens / emails / phones → parse back. Covers
    // nested fields without a recursive walker. Falls back to the raw
    // body if parsing fails. Wave 28 added email + phone patterns.
    try {
        const json = JSON.stringify(body);
        const safe = json
            .replace(TOKEN_REDACT_RE, '[REDACTED-TOKEN]')
            .replace(EMAIL_REDACT_RE, '[REDACTED-EMAIL]')
            .replace(PHONE_REDACT_RE, '[REDACTED-PHONE]');
        return JSON.parse(safe);
    } catch {
        return body;
    }
}

function rotateFeedbackLog(logPath) {
    try {
        if (!fs.existsSync(logPath)) return;
        const stat = fs.statSync(logPath);
        if (stat.size < FEEDBACK_LOG_MAX_BYTES) return;
        for (let i = FEEDBACK_LOG_KEEP - 1; i >= 1; i--) {
            const src = i === 1 ? logPath : `${logPath}.${i - 1}`;
            const dst = `${logPath}.${i}`;
            if (fs.existsSync(src)) {
                try { fs.renameSync(src, dst); } catch { /* best effort */ }
            }
        }
    } catch (err) {
        console.warn('[feedback] log rotation failed:', err.message);
    }
}

app.post('/feedback', (req, res) => {
    try {
        const c = cfg();
        if (c.feedbackLog) {
            const safeName = path.basename(c.feedbackLog);
            const logPath = path.resolve(__dirname, safeName);
            rotateFeedbackLog(logPath);
            const safeBody = redactFeedbackPayload(req.body);
            fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...safeBody }) + '\n', 'utf8');
        }
    } catch (err) {
        console.warn('[feedback] log write failed:', err.message);
    }
    res.json({ ok: true });
});

// ── Chat history storage ─────────────────────────────────────────────────────
// Production path writes to a Databricks SQL table configured as
// c.chatHistoryTable (or profile.chatHistoryTable). Retrieval is scoped to
// the viewerUserKey unless viewerRole is author/admin and includeAll=true.
//
// No demo-coupled fallback. If a customer hasn't configured a table, we
// surface "history disabled — set chatHistoryTable" rather than silently
// trying to write to a workspace.schema that doesn't exist in their account.

function sqlString(value, max = 12000) {
    if (value === undefined || value === null) return 'NULL';
    const s = String(value).slice(0, max).replace(/'/g, "''");
    return `'${s}'`;
}

function historyTableFor(config, profile) {
    return profile?.chatHistoryTable || config.chatHistoryTable || null;
}

/**
 * Pick the right profile to run a history SQL statement against (BUG-009).
 *
 * The active profile may be a supervisor (`type: "supervisor-local"`) that
 * doesn't configure its own SQL warehouse — supervisor profiles route to
 * Genie via shared host + token but don't query a warehouse directly.
 * For history writes we need a warehouseId, so fall back to the default
 * profile or the first profile that has one. If no profile has a warehouse
 * configured, return null so the caller can surface a clear error.
 */
function pickHistoryProfile(activeProfile) {
    if (activeProfile?.warehouseId) return activeProfile;
    const c = cfg();
    const fallback = c.profiles?.default;
    if (fallback?.warehouseId) return fallback;
    for (const p of profileRegistry.entries().map(([, v]) => v)) {
        if (p?.warehouseId) return p;
    }
    return null;
}

function isHistoryAdmin(role) {
    return /^(author|admin|administrator|owner|superuser|super-user|developer)$/i.test(String(role || '').trim());
}

async function runSql(profile, statement) {
    if (!profile?.warehouseId) {
        throw new Error('No warehouseId configured for history SQL storage.');
    }
    const submitted = await databricksRequest(profile, 'POST', '/api/2.0/sql/statements', {
        warehouse_id: profile.warehouseId,
        statement,
        wait_timeout: '30s',
        on_wait_timeout: 'CONTINUE',
    });
    let current = submitted;
    let state = current.status?.state;
    const statementId = current.statement_id;
    for (let i = 0; i < 60 && (state === 'PENDING' || state === 'RUNNING'); i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        current = await databricksRequest(profile, 'GET', `/api/2.0/sql/statements/${statementId}`);
        state = current.status?.state;
    }
    if (state !== 'SUCCEEDED') {
        throw new Error(current.status?.error?.message || `SQL statement ended with state ${state}`);
    }
    return current;
}

app.post('/history', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) {
        console.warn('[history] POST: no matching profile resolved');
        return res.status(400).json({ error: 'No matching profile configured' });
    }

    const c = cfg();
    const table = historyTableFor(c, resolved.profile);
    if (!table) {
        const msg = `Chat history is disabled — no chatHistoryTable is configured for profile '${resolved.name}'. Set chatHistoryTable in the proxy config (per-profile or top-level) to enable persistence.`;
        console.warn('[history] POST:', msg);
        return res.status(400).json({ ok: false, error: msg });
    }
    // BUG-009: supervisor profiles typically don't configure a warehouseId
    // because they don't query Genie spaces directly. For history SQL writes
    // we need one — fall back to the default profile's warehouse so saves
    // succeed in supervisor mode without forcing every supervisor config to
    // duplicate a warehouseId.
    const sqlProfile = pickHistoryProfile(resolved.profile);
    const body = redactFeedbackPayload(req.body);
    const id = body.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const feedbackComment = body.rating === 'up' ? (body.feedbackComment || body.comment || '') : '';
    const feedbackReason = body.rating === 'down' ? (body.feedbackReason || body.comment || '') : '';

    if (!sqlProfile) {
        // Detailed error so the visual's WARN log surfaces the actual reason
        // instead of a generic "Chat history could not be saved" (BUG-009).
        const msg = `No warehouseId configured for history SQL storage (active profile: ${resolved.name}, type: ${resolved.profile?.type || 'genie'}). Add a warehouseId to the default profile or the active profile.`;
        console.warn('[history] POST:', msg);
        return res.status(400).json({ ok: false, error: msg });
    }
    console.log(`[history] POST id=${id} profile=${resolved.name} type=${resolved.profile?.type || 'genie'} sqlProfileWarehouse=${sqlProfile.warehouseId} table=${table}`);

    const statement = `
INSERT INTO ${table}
SELECT
  ${sqlString(id, 128)} AS history_id,
  TIMESTAMP(${sqlString(now, 64)}) AS event_ts,
  ${sqlString(body.viewerUserKey || 'unknown', 512)} AS viewer_user_key,
  ${sqlString(body.viewerRole || '', 128)} AS viewer_role,
  ${sqlString(body.assistantProfile || resolved.name, 128)} AS assistant_profile,
  ${sqlString(body.spaceLabel || '', 128)} AS space_label,
  ${sqlString(body.conversationId || '', 256)} AS conversation_id,
  ${sqlString(body.messageId || '', 512)} AS message_id,
  ${sqlString(body.question || '', 12000)} AS question,
  ${sqlString(body.answer || '', 12000)} AS answer,
  ${sqlString(body.sql || '', 12000)} AS generated_sql,
  ${sqlString(body.scope || '', 4000)} AS scope_text,
  ${sqlString(body.rating || '', 16)} AS rating,
  ${sqlString(feedbackComment, 4000)} AS feedback_comment,
  ${sqlString(feedbackReason, 4000)} AS feedback_reason,
  ${sqlString(body.routeLabel || '', 256)} AS route_label,
  ${sqlString(JSON.stringify(body.trace || []), 4000)} AS trace_json
`;

    try {
        await runSql(sqlProfile, statement);
        console.log(`[history] POST id=${id} OK`);
        res.json({ ok: true, id, storage: table });
    } catch (err) {
        // BUG-009: surface the actual cause to the visual so authors can act
        // (table missing, permission denied, warehouse not running, etc.).
        console.warn(`[history] POST id=${id} table=${table} FAILED: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message, table });
    }
});

app.get('/history', async (req, res) => {
    const resolved = resolveProfile({}, req.query, req.headers, req);
    if (!resolved) return res.status(400).json({ error: 'No matching profile configured' });

    const c = cfg();
    const table = historyTableFor(c, resolved.profile);
    if (!table) {
        // No table configured → return an empty list rather than a 500. This
        // makes "history disabled" a graceful no-op for the visual instead of
        // looking like a transient server error.
        return res.json([]);
    }
    const viewerUserKey = String(req.query.viewerUserKey || '').trim().toLowerCase();
    const viewerRole = String(req.query.viewerRole || '').trim().toLowerCase();
    const includeAll = String(req.query.includeAll || '').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const canSeeAll = includeAll && isHistoryAdmin(viewerRole);

    if (!viewerUserKey && !canSeeAll) {
        return res.status(400).json({ error: 'viewerUserKey is required to retrieve personal history.' });
    }

    const where = canSeeAll ? '1 = 1' : `lower(viewer_user_key) = lower(${sqlString(viewerUserKey, 512)})`;
    const statement = `
SELECT
  history_id, CAST(event_ts AS STRING) AS event_ts, viewer_user_key, viewer_role,
  assistant_profile, space_label, conversation_id, message_id, question, answer,
  generated_sql, scope_text, rating, feedback_comment, feedback_reason, route_label
FROM ${table}
WHERE ${where}
ORDER BY event_ts DESC
LIMIT ${limit}
`;

    // BUG-009: same fallback as POST — supervisor profiles need the
    // default profile's warehouse for history reads too.
    const sqlProfile = pickHistoryProfile(resolved.profile);
    if (!sqlProfile) {
        return res.status(400).json({ error: `No warehouseId configured for history SQL access (profile: ${resolved.name}).` });
    }
    try {
        const result = await runSql(sqlProfile, statement);
        const columns = result.manifest?.schema?.columns?.map(col => col.name) || [];
        const rows = result.result?.data_array || [];
        const items = rows.map(row => {
            const record = {};
            columns.forEach((name, i) => { record[name] = row[i]; });
            return {
                id: record.history_id,
                ts: record.event_ts,
                viewerUserKey: record.viewer_user_key,
                viewerRole: record.viewer_role,
                assistantProfile: record.assistant_profile,
                spaceLabel: record.space_label,
                conversationId: record.conversation_id,
                messageId: record.message_id,
                question: record.question,
                answer: record.answer,
                sql: record.generated_sql,
                scope: record.scope_text,
                rating: record.rating,
                feedbackComment: record.feedback_comment,
                feedbackReason: record.feedback_reason,
                routeLabel: record.route_label,
            };
        });
        res.json({ ok: true, items, canSeeAll });
    } catch (err) {
        console.warn('[history] read failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Custom SQL Authoring Mode (Wave 35 Phase 3) ───────────────────────────────
// POST /sql/preview — execute a Custom SQL section body and return up to 100
//                     rows for inline preview in the Setup editor + the
//                     AI Insights renderer's KPI/Table/Chart cards.
// POST /sql/explain — pre-save dry-run validation. No warehouse round-trip.
//
// Profile auth: same path as /assistant — `resolveProfile` from headers /
// body. Section H CTE preamble is auto-prepended by the helper. The visual
// sends `{ sql, sectionH_cteHeader, profileName }` and (optionally) the
// inline-credentials triple via X-Databricks-* headers (Wave 31).
//
// Wave 22 sanitization wraps every untrusted input; Wave 30 cycle 4
// redaction wraps every error before propagation.
const { previewSectionSql, validateSectionSql, PREVIEW_MAX_ROWS } = require('./lib/sqlSectionPreview');

app.use('/sql', rateLimitMiddleware);
app.use('/sql', sharedKeyMiddleware);

app.post('/sql/explain', (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ ok: false, error: 'No matching profile configured' });
    const sql = req.body?.sql;
    const cteHeader = req.body?.sectionH_cteHeader || req.body?.cteHeader || '';
    const validation = validateSectionSql({ cteHeader, sql });
    auditLog(req, {
        profileName: resolved.name,
        action: 'sql.explain',
        status: validation.ok ? 200 : 400,
        detail: validation.ok ? null : validation.errors.join(' '),
    });
    return res.json({
        ok: validation.ok,
        errors: validation.errors,
        composedLength: validation.sql ? validation.sql.length : 0,
    });
});

app.post('/sql/preview', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) return res.status(400).json({ ok: false, error: 'No matching profile configured' });
    const sql = req.body?.sql;
    const cteHeader = req.body?.sectionH_cteHeader || req.body?.cteHeader || '';
    try {
        const result = await previewSectionSql({
            profile: resolved.profile,
            cteHeader,
            sql,
            databricksRequest: (profile, method, path, body) => databricksRequest(profile, method, path, body, req.requestId),
        });
        // Cap response to PREVIEW_MAX_ROWS as a defence in depth.
        const capped = (result.rows || []).slice(0, PREVIEW_MAX_ROWS);
        auditLog(req, {
            profileName: resolved.name,
            action: 'sql.preview',
            status: result.ok ? 200 : 400,
            detail: result.ok ? `${capped.length}rows` : result.error,
        });
        return res.json({
            ok: result.ok,
            columns: result.columns,
            rows: capped,
            truncated: result.truncated || (result.rows || []).length > PREVIEW_MAX_ROWS,
            totalRowCount: result.totalRowCount,
            executionTimeMs: result.executionTimeMs,
            error: result.error,
        });
    } catch (err) {
        // previewSectionSql swallows expected errors into ok:false; this
        // catch is the safety net for genuinely unexpected throws (mock
        // misconfiguration etc.). Do not propagate raw error bodies.
        console.error('[sql/preview]', err.message);
        return res.status(500).json({
            ok: false,
            columns: [],
            rows: [],
            error: 'Unexpected proxy error during SQL preview. See proxy logs.',
        });
    }
});

// ── Insights — metric-rule suggest (Wave 41 PREP) ─────────────────────────────
// IDEA-037 phase 4 extension. Companion to the existing in-visual
// `suggestInsightsConfig` path. Accepts bound measure/dimension names plus
// (optionally) the Genie space ID and Section H CTE preamble, and returns a
// list of suggested metric direction rules. Heuristic-only when no LLM is
// configured for the resolved profile; LLM-augmented (with heuristic
// fallback / top-up) when openai or bedrock-direct is wired in.
//
// Wave 22 sanitization: every untrusted string is stripped of control chars
// + length-capped before it touches the prompt builder. Wave 30 cycle 4:
// every error path returns a friendly mapped string — raw upstream errors
// never reach the visual.
//
// CRITICAL: This route is ADDITION-ONLY. The existing in-visual
// suggestInsightsConfig() call (genie.ts ~line 755) continues to work
// unchanged. Cycle 12 will wire the visual to call this route in addition
// to the existing one and merge the responses.
const SUGGEST_MAX_NAMES = 64;
const SUGGEST_MAX_NAME_LEN = 200;
const SUGGEST_MAX_CTE_LEN = 5000;

function _sanitizeSuggestName(s) {
    if (s == null) return '';
    let v = String(s);
    // Strip control chars + DEL.
    v = v.replace(/[\x00-\x1F\x7F]/g, '');
    // Defeat prompt injection: strip backticks and explicit DML keywords.
    if (/\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE)\b/i.test(v)) {
        v = v.replace(/\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE)\b/gi, '');
    }
    v = v.replace(/[`]/g, '');
    if (v.length > SUGGEST_MAX_NAME_LEN) v = v.slice(0, SUGGEST_MAX_NAME_LEN);
    return v.trim();
}

function _sanitizeSuggestCte(s) {
    if (s == null) return '';
    let v = String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (v.length > SUGGEST_MAX_CTE_LEN) v = v.slice(0, SUGGEST_MAX_CTE_LEN);
    return v;
}

function _sanitizeNameList(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
        if (out.length >= SUGGEST_MAX_NAMES) break;
        const cleaned = _sanitizeSuggestName(item);
        if (cleaned) out.push(cleaned);
    }
    return out;
}

/** Map a profile to a callLlm function (messages → text) when the profile
 *  has openai or bedrock-direct credentials. Returns null when no LLM is
 *  configured — the suggest path then runs heuristic-only. */
function _resolveCallLlmForProfile(profile) {
    if (!profile) return null;
    const engine = resolveEngine(profile);
    if (engine === 'openai') {
        return async (messages) => {
            const data = await azureOpenAiRequest(profile, messages);
            return data?.choices?.[0]?.message?.content ?? '';
        };
    }
    if (engine === 'bedrock-direct') {
        return async (messages) => bedrockInvokeModelCall(profile, messages);
    }
    // bedrock-rag is RetrieveAndGenerate (KB-coupled) and is not appropriate
    // for the strict-JSON suggest prompt. Skip it.
    return null;
}

/** Fetch the Genie space description + instructions when a spaceId is
 *  supplied. Failure here is non-fatal — we just omit the metadata from
 *  the prompt and let the heuristic engine carry the load.
 *  Returns { description: string, instructions: string }. */
async function _fetchSpaceMetadata(profile, spaceId, requestId) {
    if (!profile || !spaceId) return { description: '', instructions: '' };
    try {
        const data = await databricksRequest(
            profile, 'GET',
            `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}?include_serialized_space=true`,
            null, requestId
        );
        // Description lives at the top level; instructions live inside
        // serialized_space (JSON-string) under .instructions or .general_instructions
        // depending on the space schema version. Best-effort extraction.
        const description = String(data?.description || data?.title || '').slice(0, 4000);
        let instructions = '';
        const ss = data?.serialized_space;
        if (ss) {
            try {
                const parsed = typeof ss === 'string' ? JSON.parse(ss) : ss;
                instructions = String(
                    parsed?.instructions
                    || parsed?.general_instructions
                    || parsed?.context
                    || ''
                ).slice(0, 4000);
            } catch { /* serialized_space malformed — skip silently */ }
        }
        return { description, instructions };
    } catch (err) {
        // Wave 30 cycle 4 — never propagate the raw Databricks error body.
        console.warn('[insights/suggest-metric-rules] space metadata fetch failed:', err?.message || String(err));
        return { description: '', instructions: '' };
    }
}

app.post('/insights/suggest-metric-rules', async (req, res) => {
    const resolved = resolveProfile(req.body, {}, req.headers, req);
    if (!resolved) {
        auditLog(req, { action: 'insights.suggest-metric-rules', status: 400, detail: 'no-profile' });
        return res.status(400).json({ error: 'No matching profile configured' });
    }

    const measureNames = _sanitizeNameList(req.body?.measureNames);
    const dimensionNames = _sanitizeNameList(req.body?.dimensionNames);
    const sectionHCte = _sanitizeSuggestCte(req.body?.sectionHCte);
    const spaceId = _sanitizeSuggestName(req.body?.spaceId || resolved.profile.spaceId || '');

    // Caller must supply at least one measure OR a sectionHCte hint;
    // otherwise the heuristic engine has nothing to chew on.
    if (measureNames.length === 0 && !sectionHCte) {
        auditLog(req, {
            profileName: resolved.name,
            action: 'insights.suggest-metric-rules',
            status: 400,
            detail: 'no-measures'
        });
        return res.status(400).json({
            error: 'measureNames is required (and must contain at least one non-empty string), or sectionHCte must be provided.'
        });
    }

    try {
        const callLlm = _resolveCallLlmForProfile(resolved.profile);
        // Best-effort space metadata fetch. Non-fatal failure → empty strings.
        const meta = spaceId
            ? await _fetchSpaceMetadata(resolved.profile, spaceId, req.requestId)
            : { description: '', instructions: '' };

        const { suggestMetricRules } = require('./lib/llmOrchestrator');
        const result = await suggestMetricRules({
            measureNames,
            dimensionNames,
            spaceDescription: meta.description,
            spaceInstructions: meta.instructions,
            sectionHCte,
            callLlm: callLlm || undefined,
        });

        auditLog(req, {
            profileName: resolved.name,
            spaceId: spaceId || null,
            action: 'insights.suggest-metric-rules',
            status: 200,
            detail: `rules=${result.rules.length} source=${result.source} llmOk=${result.llmOk}`,
        });
        return res.json({
            ok: true,
            suggestedMetricRules: result.rules,
            source: result.source,
            llmAvailable: Boolean(callLlm),
            llmOk: result.llmOk,
            spaceMetadataUsed: Boolean(meta.description || meta.instructions),
        });
    } catch (err) {
        // Top-level safety net — suggestMetricRules itself is no-throw, but
        // a defensive catch keeps the route bulletproof if a downstream
        // require() ever throws synchronously.
        const msg = String(err?.message || err);
        console.error('[insights/suggest-metric-rules]', msg);
        auditLog(req, {
            profileName: resolved.name,
            action: 'insights.suggest-metric-rules',
            status: 500,
            detail: msg.slice(0, 200),
        });
        return res.status(500).json({
            error: 'Suggest pipeline failed unexpectedly. The proxy logged the cause; nothing was changed in your report.',
        });
    }
});

// ── Azure OpenAI routes ───────────────────────────────────────────────────────
// The visual sends questions to /openai/conversations/* when connectionMode is
// "azure-openai". The proxy holds the Azure OpenAI endpoint + API key in its
// profile config so no secrets are stored in the .pbix file.
//
// Profile fields used (add to config.json profiles):
//   azureOpenAiEndpoint  — e.g. https://<resource>.openai.azure.com
//   azureOpenAiKey       — Azure OpenAI API key
//   azureOpenAiDeployment — deployment name, e.g. gpt-4o
//   azureOpenAiApiVersion — e.g. 2024-02-01 (defaults below if omitted)
//
// The proxy maintains a simple in-memory conversation history keyed by
// conversationId so follow-up questions carry full context.

const SESSION_STATE_TTL_MS = 24 * 60 * 60 * 1000;
const openAiConversationHistory = new Map(); // conversationId → { messages, storedAt }

// IDEA-040 Phase 2 — engine dispatch.
// `engine` is an additive field on profiles. When unset, behavior is
// inferred from the legacy fields (azureOpenAiEndpoint → openai;
// bedrockKnowledgeBaseId → bedrock-rag) so existing configs keep working.
//
// Recognised values:
//   "openai"          — Azure OpenAI chat completions
//   "bedrock-rag"     — Bedrock RetrieveAndGenerate (KB-coupled)
//   "bedrock-direct"  — Bedrock InvokeModel (raw LLM, no KB)
function resolveEngine(profile) {
    if (!profile) return null;
    if (profile.engine) return profile.engine;
    if (profile.azureOpenAiEndpoint) return 'openai';
    if (profile.bedrockKnowledgeBaseId) return 'bedrock-rag';
    if (profile.bedrockAccessKeyId && profile.bedrockSecretAccessKey) return 'bedrock-direct';
    return null;
}

function resolveOpenAiProfile(body, headers) {
    const profileName = headers['x-assistant-profile'] || body?.assistantProfile || 'default';
    const c = cfg();
    const profile = c.profiles?.[profileName] || c.profiles?.['default'];
    if (!profile?.azureOpenAiEndpoint) return null;
    return { profile, name: profileName };
}

async function azureOpenAiRequest(profile, messages) {
    const endpoint = profile.azureOpenAiEndpoint.replace(/\/$/, '');
    const deployment = profile.azureOpenAiDeployment || 'gpt-4o';
    const apiVersion = profile.azureOpenAiApiVersion || '2024-02-01';
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    // Wave 28 — 30s timeout. The visual has a 5min hard ceiling; proxy
    // closes ~10s shorter so the proxy's friendly error wins the race.
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': profile.azureOpenAiKey
        },
        body: JSON.stringify({ messages, max_tokens: 2048 }),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Azure OpenAI returned ${response.status}: ${text.substring(0, 300)}`);
    }
    return response.json();
}

app.get('/openai/health', (req, res) => {
    const resolved = resolveOpenAiProfile({}, req.headers);
    if (!resolved) {
        return res.status(503).json({ ok: false, error: 'No Azure OpenAI profile configured. Add azureOpenAiEndpoint, azureOpenAiKey, and azureOpenAiDeployment to the proxy profile.' });
    }
    res.json({ ok: true, model: resolved.profile.azureOpenAiDeployment || 'gpt-4o' });
});

// IDEA-040 Phase 2 — shared analytics-mode entry point used by both the
// OpenAI route and the Bedrock-direct route. Wraps the orchestrator with
// retry-on-bad-SQL and auto-introspection-when-missing.
async function runAnalyticsOrchestrator({ profile, content, callLlm, convId, msgId }) {
    const { orchestrateGroundedAnswer, withRetryOnBadSql } = require('./lib/llmOrchestrator');

    // Resolve schema context: explicit profile.schemaContext wins; otherwise
    // we attempt INFORMATION_SCHEMA introspection (cached 6h). Failure here
    // is non-fatal — we fall through to the orchestrator's own
    // "schema required" error so users see a clear message.
    let schemaContext = profile.schemaContext;
    if (!schemaContext && profile.warehouseId && (profile.catalog || profile.databricksCatalog)) {
        try {
            const { getSchemaForProfile, formatSchemaForPrompt } = require('./lib/schemaIntrospector');
            const schemaObj = await getSchemaForProfile({ profile, databricksRequest });
            schemaContext = formatSchemaForPrompt(schemaObj);
        } catch (introspectErr) {
            console.warn('[analytics] auto-introspection failed:', introspectErr.message);
        }
    }

    const orchestratorArgs = {
        profile, question: content, schemaContext,
        callLlm, databricksRequest, convId, msgId,
    };

    // Retry-on-bad-SQL is opt-out: profile.disableSqlRetry === true skips it.
    if (profile.disableSqlRetry === true) {
        const result = await orchestrateGroundedAnswer(orchestratorArgs);
        return { result, attempts: 1, retried: false };
    }
    return withRetryOnBadSql(orchestrateGroundedAnswer, orchestratorArgs);
}

app.post('/openai/conversations/start', async (req, res) => {
    const resolved = resolveOpenAiProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No Azure OpenAI profile configured.' });

    const { content } = req.body;
    const convId = `aoai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // IDEA-040 Cycle 7 — analytics-grounding mode. When the profile has
    // `mode: "analytics"` (and either an explicit schemaContext or the
    // catalog/schema needed for auto-introspection), route through the
    // orchestrator (LLM → SQL → execute → LLM → narrative) instead of
    // the chat-only path. Existing chat-only profiles are unaffected.
    //
    // Phase 2 adds retry-on-bad-SQL + INFORMATION_SCHEMA auto-discovery.
    const hasAnalyticsContext =
        resolved.profile.schemaContext ||
        (resolved.profile.warehouseId && (resolved.profile.catalog || resolved.profile.databricksCatalog));
    if (resolved.profile.mode === 'analytics' && hasAnalyticsContext) {
        try {
            const msgId = `aoai-msg-${Date.now()}`;
            const callLlm = async (messages) => {
                const data = await azureOpenAiRequest(resolved.profile, messages);
                return data.choices?.[0]?.message?.content ?? '';
            };
            const { result, retried, attempts } = await runAnalyticsOrchestrator({
                profile: resolved.profile, content, callLlm, convId, msgId,
            });
            // Pack the COMPLETED response into message_id so the visual's
            // waitForMessageWithProgress() path returns immediately (matches
            // the supervisor-sync pattern).
            const responsePayload = {
                conversation_id: convId,
                message_id: JSON.stringify(result),
                status: result.status,
                content: result.content,
                sqlQuery: result.sqlQuery,
            };
            console.log(`[openai/analytics] profile=${resolved.name} conv=${convId} status=${result.status} attempts=${attempts} retried=${retried}`);
            return res.json(responsePayload);
        } catch (err) {
            console.error('[openai/analytics]', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    // Chat-only path (unchanged).
    const messages = [{ role: 'user', content }];
    openAiConversationHistory.set(convId, { messages, storedAt: Date.now() });

    try {
        const data = await azureOpenAiRequest(resolved.profile, messages);
        const answer = data.choices?.[0]?.message?.content ?? '';
        messages.push({ role: 'assistant', content: answer });

        const responsePayload = {
            conversation_id: convId,
            message_id: JSON.stringify({ id: convId, status: 'COMPLETED', content: answer }),
            status: 'COMPLETED',
            content: answer
        };
        console.log(`[openai/start] profile=${resolved.name} conv=${convId}`);
        res.json(responsePayload);
    } catch (err) {
        console.error('[openai/start]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/openai/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    const resolved = resolveOpenAiProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No Azure OpenAI profile configured.' });

    const { content } = req.body;
    const entry = openAiConversationHistory.get(conversationId);
    const history = Array.isArray(entry?.messages) ? entry.messages : [];
    history.push({ role: 'user', content });

    try {
        const data = await azureOpenAiRequest(resolved.profile, history);
        const answer = data.choices?.[0]?.message?.content ?? '';
        history.push({ role: 'assistant', content: answer });
        openAiConversationHistory.set(conversationId, { messages: history, storedAt: Date.now() });

        const msgId = JSON.stringify({ id: `${conversationId}-${history.length}`, status: 'COMPLETED', content: answer });
        console.log(`[openai/send] profile=${resolved.name} conv=${conversationId}`);
        res.json({ conversation_id: conversationId, message_id: msgId, status: 'COMPLETED', content: answer });
    } catch (err) {
        console.error('[openai/send]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── AWS Bedrock routes ────────────────────────────────────────────────────────
// Routes requests to AWS Bedrock Knowledge Bases via RetrieveAndGenerate API.
// Conversation history is maintained in-memory so follow-up questions work.
//
// Profile fields used (add to config.json profiles):
//   bedrockRegion         — AWS region, e.g. us-east-1
//   bedrockKnowledgeBaseId — Knowledge Base ID from AWS console
//   bedrockModelArn       — Model ARN, e.g. anthropic.claude-3-5-sonnet-20241022-v2:0
//   bedrockAccessKeyId    — AWS access key ID
//   bedrockSecretAccessKey — AWS secret access key
//
// For production, prefer IAM role via Lambda/API Gateway rather than static keys.

const bedrockSessionMap = new Map(); // conversationId → { sessionId, storedAt }

function resolveBedrockProfile(body, headers) {
    const profileName = headers['x-assistant-profile'] || body?.assistantProfile || 'default';
    const c = cfg();
    const profile = c.profiles?.[profileName] || c.profiles?.['default'];
    // IDEA-040 Phase 2 — accept either KB-coupled (RAG) profiles or
    // bedrock-direct profiles (only requires AWS creds + region; KB id
    // not needed).
    if (!profile) return null;
    const engine = resolveEngine(profile);
    if (engine === 'bedrock-rag' || engine === 'bedrock-direct') {
        return { profile, name: profileName };
    }
    if (profile.bedrockKnowledgeBaseId) return { profile, name: profileName };
    return null;
}

async function bedrockRetrieveAndGenerate(profile, input, sessionId) {
    const region = profile.bedrockRegion || 'us-east-1';
    const url = `https://bedrock-agent-runtime.${region}.amazonaws.com/retrieveAndGenerate`;

    const body = {
        input: { text: input },
        retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
                knowledgeBaseId: profile.bedrockKnowledgeBaseId,
                modelArn: profile.bedrockModelArn || `anthropic.claude-3-5-sonnet-20241022-v2:0`
            }
        }
    };
    if (sessionId) body.sessionId = sessionId;

    // AWS Signature V4 signing
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const bodyStr = JSON.stringify(body);
    const crypto = require('crypto');

    function hmac(key, data) {
        return crypto.createHmac('sha256', key).update(data).digest();
    }
    function sign(key, msg) { return hmac(key, msg); }
    function getSignatureKey(secret, date, region, service) {
        return sign(sign(sign(sign('AWS4' + secret, date), region), service), 'aws4_request');
    }

    const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:bedrock-agent-runtime.${region}.amazonaws.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `POST\n/retrieveAndGenerate\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credScope = `${dateStamp}/${region}/bedrock/aws4_request`;
    const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const signingKey = getSignatureKey(profile.bedrockSecretAccessKey, dateStamp, region, 'bedrock');
    const signature = hmac(signingKey, strToSign).toString('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${profile.bedrockAccessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Wave 28 — 30s timeout (matches Azure OpenAI). Without this, a stalled
    // Bedrock endpoint hangs the proxy thread until OS-level connection
    // timeout fires.
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Amz-Date': amzDate,
            'X-Amz-Content-Sha256': payloadHash,
            'Authorization': authHeader
        },
        body: bodyStr,
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`AWS Bedrock returned ${response.status}: ${text.substring(0, 300)}`);
    }
    return response.json();
}

app.get('/bedrock/health', (req, res) => {
    const resolved = resolveBedrockProfile({}, req.headers);
    if (!resolved) {
        return res.status(503).json({ ok: false, error: 'No AWS Bedrock profile configured. Add bedrockKnowledgeBaseId, bedrockRegion, bedrockModelArn, bedrockAccessKeyId, and bedrockSecretAccessKey to the proxy profile.' });
    }
    const engine = resolveEngine(resolved.profile);
    res.json({
        ok: true,
        engine: engine || 'bedrock-rag',
        model: resolved.profile.bedrockModelArn || resolved.profile.bedrockModelId || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        knowledgeBaseId: resolved.profile.bedrockKnowledgeBaseId || null,
    });
});

// IDEA-040 Phase 2 — direct-mode helper. Calls Bedrock InvokeModel
// (the new lib/bedrock.js entry point) and returns plain text.
async function bedrockInvokeModelCall(profile, messages) {
    const { bedrockInvokeModel } = require('./lib/bedrock');
    return bedrockInvokeModel(profile, messages);
}

app.post('/bedrock/conversations/start', async (req, res) => {
    const resolved = resolveBedrockProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No AWS Bedrock profile configured.' });

    const { content } = req.body;
    const convId = `bedrock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const engine = resolveEngine(resolved.profile) || 'bedrock-rag';

    // Phase 2 — bedrock-direct + analytics mode → orchestrator path.
    const hasAnalyticsContext =
        resolved.profile.schemaContext ||
        (resolved.profile.warehouseId && (resolved.profile.catalog || resolved.profile.databricksCatalog));
    if (engine === 'bedrock-direct' && resolved.profile.mode === 'analytics' && hasAnalyticsContext) {
        try {
            const msgId = `bedrock-msg-${Date.now()}`;
            const callLlm = (messages) => bedrockInvokeModelCall(resolved.profile, messages);
            const { result, retried, attempts } = await runAnalyticsOrchestrator({
                profile: resolved.profile, content, callLlm, convId, msgId,
            });
            const responsePayload = {
                conversation_id: convId,
                message_id: JSON.stringify(result),
                status: result.status,
                content: result.content,
                sqlQuery: result.sqlQuery,
            };
            console.log(`[bedrock/analytics] profile=${resolved.name} conv=${convId} status=${result.status} attempts=${attempts} retried=${retried}`);
            return res.json(responsePayload);
        } catch (err) {
            console.error('[bedrock/analytics]', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    // Phase 2 — bedrock-direct chat-only (no analytics): plain InvokeModel
    if (engine === 'bedrock-direct') {
        try {
            const messages = [{ role: 'user', content }];
            const answer = await bedrockInvokeModelCall(resolved.profile, messages);
            const msgId = JSON.stringify({ id: convId, status: 'COMPLETED', content: answer });
            console.log(`[bedrock/direct/start] profile=${resolved.name} conv=${convId}`);
            return res.json({ conversation_id: convId, message_id: msgId, status: 'COMPLETED', content: answer });
        } catch (err) {
            console.error('[bedrock/direct/start]', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    // Existing RAG path (unchanged).
    try {
        const data = await bedrockRetrieveAndGenerate(resolved.profile, content, null);
        const answer = data.output?.text ?? '';
        const sessionId = data.sessionId;
        if (sessionId) bedrockSessionMap.set(convId, { sessionId, storedAt: Date.now() });

        const msgId = JSON.stringify({ id: convId, status: 'COMPLETED', content: answer, citations: data.citations ?? [] });
        console.log(`[bedrock/start] profile=${resolved.name} conv=${convId} session=${sessionId}`);
        res.json({ conversation_id: convId, message_id: msgId, status: 'COMPLETED', content: answer });
    } catch (err) {
        console.error('[bedrock/start]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/bedrock/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    const resolved = resolveBedrockProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No AWS Bedrock profile configured.' });

    const { content } = req.body;
    const sessionEntry = bedrockSessionMap.get(conversationId);
    const sessionId = sessionEntry?.sessionId || null;
    const engine = resolveEngine(resolved.profile) || 'bedrock-rag';

    // Phase 2 — bedrock-direct chat follow-up (no session map; one-shot).
    if (engine === 'bedrock-direct') {
        try {
            const messages = [{ role: 'user', content }];
            const answer = await bedrockInvokeModelCall(resolved.profile, messages);
            const msgId = JSON.stringify({ id: `${conversationId}-${Date.now()}`, status: 'COMPLETED', content: answer });
            console.log(`[bedrock/direct/send] profile=${resolved.name} conv=${conversationId}`);
            return res.json({ conversation_id: conversationId, message_id: msgId, status: 'COMPLETED', content: answer });
        } catch (err) {
            console.error('[bedrock/direct/send]', err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    try {
        const data = await bedrockRetrieveAndGenerate(resolved.profile, content, sessionId);
        const answer = data.output?.text ?? '';
        const newSessionId = data.sessionId;
        if (newSessionId) bedrockSessionMap.set(conversationId, { sessionId: newSessionId, storedAt: Date.now() });

        const msgId = JSON.stringify({ id: `${conversationId}-${Date.now()}`, status: 'COMPLETED', content: answer, citations: data.citations ?? [] });
        console.log(`[bedrock/send] profile=${resolved.name} conv=${conversationId}`);
        res.json({ conversation_id: conversationId, message_id: msgId, status: 'COMPLETED', content: answer });
    } catch (err) {
        console.error('[bedrock/send]', err.message);
        res.status(500).json({ error: err.message });
    }
});

function pruneSessionMaps() {
    const cutoff = Date.now() - SESSION_STATE_TTL_MS;
    for (const [id, entry] of openAiConversationHistory.entries()) {
        if (!entry?.storedAt || entry.storedAt < cutoff) {
            openAiConversationHistory.delete(id);
        }
    }
    for (const [id, entry] of bedrockSessionMap.entries()) {
        if (!entry?.storedAt || entry.storedAt < cutoff) {
            bedrockSessionMap.delete(id);
        }
    }
}

if (process.env.NODE_ENV !== 'test') {
    setInterval(pruneSessionMaps, 60 * 60 * 1000).unref();
}

// ── Foundation Model serving endpoint (Cycle 47.6 + 47.7) ─────────────────────
// A direct path to a Databricks Mosaic AI foundation-model serving endpoint
// (Llama 3.1 405B, Claude Sonnet 4.7, etc. depending on what your workspace
// has provisioned). OpenAI-compatible chat-completions schema + optional
// JSON-schema structured output.
//
// Why this exists: Genie's Agent Mode (Deep Research) is UI-only during
// public preview. For sections that need real reasoning + format guarantees
// (RECOMMENDED ACTIONS, RISKS, OPPORTUNITIES) the foundation-model path
// gives us a stronger reasoning model under our own system prompt + the
// option of structured output to eliminate format retries entirely.
//
// Profile shape (in config.json profiles section):
//   "foundation_llama": {
//       "type": "foundation-model",
//       "host": "https://dbc-xxx...",
//       "token": "dapi...",                                     // or authMode: "oauth-m2m"
//       "foundationModelEndpoint": "databricks-meta-llama-3-1-405b-instruct"
//   }
//
// Endpoint:
//   POST /foundation/section
//   Body: {
//     profile?: string,                 // profile name; auto-selects first foundation-model profile if omitted
//     systemPrompt?: string,            // optional; sensible default applied per sectionTitle
//     userPrompt: string,               // the prompt + bound-data context
//     sectionTitle?: string,            // "RECOMMENDED ACTIONS" | "RISKS" | "OPPORTUNITIES" — drives default schema + renderer
//     responseFormat?: object,          // explicit OpenAI response_format (overrides preset)
//     useStructuredOutput?: boolean,    // when true + sectionTitle is a preset, sends structured-output schema
//     temperature?: number, maxTokens?: number, extra?: object
//   }
//   Response: { content, rawContent, parsedJson, endpoint, profile }

const {
    callFoundationModel,
    RESPONSE_SCHEMAS: FOUNDATION_RESPONSE_SCHEMAS,
    SECTION_RENDERERS: FOUNDATION_SECTION_RENDERERS,
} = require('./lib/foundationModelClient');

function isFoundationModelProfile(profile) {
    return profile && (profile.type === 'foundation-model' || profile.type === 'foundation') && !!profile.foundationModelEndpoint;
}

function resolveFoundationModelProfile(body, headers) {
    const explicitName = body?.profile || headers?.['x-foundation-profile'] || headers?.['x-assistant-profile'];
    if (explicitName) {
        const p = profileRegistry.get(explicitName);
        if (p && isFoundationModelProfile(p)) return { name: explicitName, profile: p };
        return null;
    }
    // Auto-select the first configured foundation-model profile.
    for (const [name, profile] of profileRegistry.entries()) {
        if (isFoundationModelProfile(profile)) return { name, profile };
    }
    return null;
}

function defaultSystemPromptForSection(sectionTitle) {
    const upper = String(sectionTitle || '').trim().toUpperCase();
    const baseHeader = 'You are an analytics formatting assistant. Take the data the user provides and produce ONLY the requested structured output. Do not add preamble, explanation, or closing summary. Use the exact data values verbatim.';
    if (upper === 'RECOMMENDED ACTIONS') {
        return baseHeader + ' Each action MUST start with an imperative verb (Reallocate, Reduce, Increase, Pilot, Audit, Cut, Shift, Renegotiate, Launch, Investigate, Restructure, Replace, Test, Defend, Expand, Consolidate, Eliminate, Accelerate, Prioritize, Roll out), name a specific target from the data, and cite an expected impact in concrete numbers.';
    }
    if (upper === 'RISKS') {
        return baseHeader + ' Each risk MUST cite a numeric magnitude (percentage, gap in pp, dollar value, count). No vague qualitative bullets.';
    }
    if (upper === 'OPPORTUNITIES') {
        return baseHeader + ' Each opportunity MUST cite the supporting data evidence and a "why now" rationale.';
    }
    return baseHeader;
}

app.get('/foundation/health', (_req, res) => {
    const resolved = resolveFoundationModelProfile({}, {});
    const configured = profileRegistry.entries()
        .filter(([, p]) => isFoundationModelProfile(p))
        .map(([n, p]) => ({ profile: n, endpoint: p.foundationModelEndpoint, host: p.host }));
    res.json({
        ok: configured.length > 0,
        configuredProfiles: configured,
        defaultProfile: resolved?.name || null,
        sectionPresets: Object.keys(FOUNDATION_RESPONSE_SCHEMAS),
    });
});

app.post('/foundation/section', async (req, res) => {
    const resolved = resolveFoundationModelProfile(req.body, req.headers);
    if (!resolved) {
        return res.status(400).json({
            error: 'No foundation-model profile configured. Add one with type "foundation-model" + foundationModelEndpoint to proxy/config.json.',
        });
    }
    const {
        userPrompt,
        sectionTitle,
        systemPrompt,
        responseFormat,
        useStructuredOutput,
        temperature,
        maxTokens,
        extra,
    } = req.body || {};

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
        return res.status(400).json({ error: 'userPrompt is required.' });
    }

    const upperTitle = String(sectionTitle || '').trim().toUpperCase();
    const presetKey = upperTitle === 'RECOMMENDED ACTIONS' ? 'recommendedActions'
        : upperTitle === 'RISKS' ? 'risks'
        : upperTitle === 'OPPORTUNITIES' ? 'opportunities'
        : null;

    const effectiveResponseFormat = responseFormat
        || (useStructuredOutput && presetKey ? FOUNDATION_RESPONSE_SCHEMAS[presetKey] : null);
    const effectiveSystemPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim())
        ? systemPrompt
        : defaultSystemPromptForSection(sectionTitle);

    const messages = [
        { role: 'system', content: effectiveSystemPrompt },
        { role: 'user', content: userPrompt },
    ];

    try {
        const result = await callFoundationModel(databricksRequest, resolved.profile, {
            messages,
            temperature: typeof temperature === 'number' ? temperature : 0.2,
            maxTokens: typeof maxTokens === 'number' ? maxTokens : 2048,
            responseFormat: effectiveResponseFormat,
            extra,
            requestId: req.requestId,
        });

        // When structured output succeeded AND we have a renderer for this
        // section title, format the parsed JSON as markdown so visual
        // callers can paste the response directly into a section card.
        let renderedContent = result.content;
        if (result.parsedJson && upperTitle && FOUNDATION_SECTION_RENDERERS[upperTitle]) {
            const renderer = FOUNDATION_SECTION_RENDERERS[upperTitle];
            const md = renderer(result.parsedJson);
            if (md && md.trim()) renderedContent = md;
        }

        console.log(`[foundation/section] profile=${resolved.name} endpoint=${resolved.profile.foundationModelEndpoint} title=${upperTitle || '-'} structured=${!!effectiveResponseFormat}`);
        res.json({
            content: renderedContent,
            rawContent: result.content,
            parsedJson: result.parsedJson || null,
            endpoint: resolved.profile.foundationModelEndpoint,
            profile: resolved.name,
            structured: !!effectiveResponseFormat,
        });
    } catch (err) {
        console.error('[foundation/section]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Supervisor Agent (Databricks Mosaic AI serving endpoint) ──────────────────
// The supervisor is a Mosaic AI Agent registered as a Databricks serving endpoint.
// It receives a plain chat message and internally decides which Genie spaces to
// query, runs them in parallel as tool calls, synthesises the result, and returns
// a single unified ChatAgent response.
//
// Profile shape (in config.json profiles section):
//   "supervisor": {
//       "type": "supervisor",               // identifies this as a supervisor profile
//       "host": "https://dbc-xxx...",        // Databricks workspace
//       "token": "dapi...",                  // PAT with CAN QUERY on the endpoint
//       "endpoint": "/serving-endpoints/dwd-supervisor/invocations",
//       "agentName": "DwD Supervisor"        // display label (optional)
//   }

function resolveSupervisorProfile(body, headers) {
    const name = body?.assistantProfile || headers?.['x-assistant-profile'] || 'supervisor';
    const c = cfg();
    const p = c.profiles?.[name];
    if (p && isSupervisorType(p.type)) return { profile: p, name };
    // fallback: scan all profiles for type=supervisor
    for (const [k, v] of Object.entries(c.profiles ?? {})) {
        if (isSupervisorType(v.type)) return { profile: v, name: k };
    }
    return null;
}

function extractGenieText(data) {
    const parts = [];
    for (const att of data?.attachments || []) {
        const text = att.text;
        if (typeof text === 'string' && text.trim()) parts.push(text.trim());
        if (text && typeof text === 'object' && text.content) parts.push(String(text.content).trim());
        const query = att.query?.query || att.query?.text;
        if (query) parts.push(`SQL:\n${query}`);
    }
    if (data?.content) parts.push(String(data.content).trim());
    return parts.filter(Boolean).join('\n\n') || '(No text answer returned.)';
}

async function askGenieProfile(profileName, question) {
    const resolved = profileByName(profileName);
    if (!resolved?.profile?.spaceId) {
        return { profileName, ok: false, answer: `Profile '${profileName}' is not configured with a Genie space.` };
    }

    await ensureWarehouseRunning(resolved.profile);
    const started = await databricksRequest(
        resolved.profile,
        'POST',
        `/api/2.0/genie/spaces/${resolved.profile.spaceId}/start-conversation`,
        { content: question }
    );
    const conversationId = started.conversation_id ?? started.conversation?.id;
    const messageId = started.message_id ?? started.message?.id;
    if (!conversationId || !messageId) {
        return { profileName, ok: false, answer: 'Genie did not return a conversation/message id.' };
    }

    const deadline = Date.now() + 160000;
    let poll = started;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        poll = await databricksRequest(
            resolved.profile,
            'GET',
            `/api/2.0/genie/spaces/${resolved.profile.spaceId}/conversations/${conversationId}/messages/${messageId}`
        );
        const status = String(poll.status || '').toUpperCase();
        if (status === 'COMPLETED') {
            await enrichQueryResults(resolved.profile, resolved.profile.spaceId, conversationId, messageId, poll);
            return {
                profileName,
                ok: true,
                status,
                conversationId,
                messageId,
                answer: extractGenieText(poll),
            };
        }
        if (status === 'FAILED' || status === 'CANCELLED') {
            return { profileName, ok: false, status, conversationId, messageId, answer: extractGenieText(poll) };
        }
    }

    return { profileName, ok: false, status: 'TIMEOUT', conversationId, messageId, answer: 'Timed out waiting for Genie.' };
}

// Demo-only fallback schemas. New deployments should set
// `profile.schemaContext = { domain, keyColumns, salesColumn, profitColumn,
// grain }` per profile in config.json (or via PROXY_PROFILE_<NAME>_SCHEMA_*
// env vars in a future phase). Only used when a profile name in this map
// has no schemaContext configured — preserves the bundled SuperStore
// demo's behaviour. Will be removed once the demo PBIPs migrate.
const LEGACY_DEMO_SCHEMAS = {
    sales: {
        domain: 'Sales, profit, margin, category, product, customer, and regional performance',
        keyColumns: ['order_id','order_date','order_year','region','segment','category','sub_category',
                     'customer_name','product_name','sales','profit','quantity','discount',
                     'profit_margin','is_returned'],
        salesColumn: 'sales',
        profitColumn: 'profit',
        grain: 'order line-item',
    },
    customer: {
        domain: 'Customer experience, returns, NPS, complaints, and churn risk',
        keyColumns: ['order_id','order_date','order_year','customer_id','customer_name','segment',
                     'region','state','category','sales','profit','is_returned',
                     'nps_score','churn_risk_score','complaint_count','promoter_count','detractor_count'],
        salesColumn: 'sales',
        profitColumn: 'profit',
        grain: 'order line-item with CX synthetic metrics',
    },
    ops: {
        domain: 'Monthly targets, fulfillment, HSE incidents, on-time rate, and attainment',
        keyColumns: ['metric_date','metric_year','metric_month','region','category',
                     'actual_sales','actual_profit','target_sales','target_profit',
                     'target_attainment','order_count','shipment_count','delayed_shipment_count',
                     'near_miss_count','incident_count','on_time_rate','hse_risk_score'],
        salesColumn: 'actual_sales',
        profitColumn: 'actual_profit',
        grain: 'region × category × month aggregate',
    },
    hse: {
        domain: 'Hybrid flat superstore — orders, shipping, targets, and fulfillment',
        keyColumns: ['order_id','order_date','ship_date','days_to_ship','order_year','order_quarter',
                     'order_month','customer_id','customer_name','segment','product_name',
                     'category','sub_category','region','state','sales','profit',
                     'quantity','discount','ship_mode','manager_name'],
        salesColumn: 'sales',
        profitColumn: 'profit',
        grain: 'order line-item',
    },
};

// Resolves the schema metadata for a profile, preferring a
// customer-supplied `profile.schemaContext` from config over the legacy
// demo map. Returns null when neither source has anything to say.
function getSchemaForProfile(profileName) {
    const p = profileRegistry.get(profileName);
    const ctx = p?.schemaContext;
    if (ctx && typeof ctx === 'object') {
        return {
            domain: ctx.domain || LEGACY_DEMO_SCHEMAS[profileName]?.domain || '',
            keyColumns: Array.isArray(ctx.keyColumns) ? ctx.keyColumns : (LEGACY_DEMO_SCHEMAS[profileName]?.keyColumns || []),
            salesColumn: ctx.salesColumn || LEGACY_DEMO_SCHEMAS[profileName]?.salesColumn || '',
            profitColumn: ctx.profitColumn || LEGACY_DEMO_SCHEMAS[profileName]?.profitColumn || '',
            grain: ctx.grain || LEGACY_DEMO_SCHEMAS[profileName]?.grain || '',
        };
    }
    return LEGACY_DEMO_SCHEMAS[profileName] || null;
}

function domainHint(profileName) {
    const p = profileRegistry.get(profileName);
    if (p?.dataDomain && String(p.dataDomain).trim()) return String(p.dataDomain).trim();
    return getSchemaForProfile(profileName)?.domain || 'General Data Source';
}

// Look up the user-facing display name for a profile from cfg(). Falls back
// to a title-cased profile key so we never leak the raw key ("sales",
// "ops") into supervisor synthesis output (BUG-013 generic).
function profileDisplayName(profileName) {
    const p = profileRegistry.get(profileName);
    const fromConfig = p?.displayName && String(p.displayName).trim();
    if (fromConfig) return fromConfig;
    return titleCaseProfileKey(profileName) || 'Helper';
}

function buildSchemaContext(spaceResults, supervisorProfile) {
    // Build a schema summary block per source so the LLM knows which
    // columns each one has. Headings use the friendly displayName (never
    // the raw profile key) so the model never echoes internal identifiers.
    const lines = ['## Source Schema Context (for mismatch detection)'];
    for (const r of spaceResults) {
        const schema = getSchemaForProfile(r.profileName);
        if (!schema) continue;
        const label = profileDisplayName(r.profileName);
        const grainPart = schema.grain ? ` (grain: ${schema.grain})` : '';
        lines.push(`\n**${label}**${grainPart}`);
        if (schema.salesColumn || schema.profitColumn) {
            lines.push(`- Sales metric: \`${schema.salesColumn || 'n/a'}\` | Profit metric: \`${schema.profitColumn || 'n/a'}\``);
        }
        if (schema.keyColumns?.length) {
            lines.push(`- Key columns: ${schema.keyColumns.slice(0, 10).join(', ')}${schema.keyColumns.length > 10 ? '…' : ''}`);
        }
    }

    // Cross-domain divergence note. Customers can supply free-form
    // guidance via supervisorProfile.crossDomainNotes (string or array).
    // If unset, fall back to the legacy demo's ops-vs-orders note when
    // those exact profile keys are present — preserves bundled-demo
    // behaviour without baking it into every deployment.
    const customNotes = supervisorProfile?.crossDomainNotes;
    if (customNotes) {
        const arr = Array.isArray(customNotes) ? customNotes : [String(customNotes)];
        for (const note of arr.map(s => String(s).trim()).filter(Boolean)) {
            lines.push(`\n⚠ ${note}`);
        }
    } else {
        const hasOps = spaceResults.some(r => r.profileName === 'ops' && r.ok);
        const hasOther = spaceResults.some(r => r.profileName !== 'ops' && r.ok);
        if (hasOps && hasOther) {
            const opsName = profileDisplayName('ops');
            lines.push(`\n⚠ **Known divergence**: \`actual_sales\` from the **${opsName}** source is a monthly regional aggregate rounded to 2 decimal places, while \`sales\` from the order-level sources is at higher precision. Small numeric differences between these sources for the same region are expected and normal — do NOT flag these as a discrepancy unless the difference exceeds 1%.`);
        }
    }
    return lines.join('\n');
}

// Belt-and-braces over the system prompt's anti-jargon rules. The smoke
// battery showed the LLM occasionally still emits "Genie space" / "space_id"
// despite explicit prompt instructions (intermittent — BUG-013 regression).
// This rewrites the offending phrases to neutral wording before the answer
// reaches the user, so a one-off prompt slip doesn't ship to the chat.
function scrubInternalJargon(text) {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/\bGenie\s+spaces?\b/gi, 'data source')
        .replace(/\bspace[_\s]?ids?\b/gi, 'source id')
        .replace(/\bagent\s+endpoints?\b/gi, 'data source')
        .replace(/\bprofile\s+keys?\b/gi, 'source label');
}

async function synthesizeSupervisorAnswer(supervisorProfile, question, spaceResults) {
    // Default to a known-existing Databricks foundation-model endpoint.
    // Was `databricks-meta-llama-3-3-70b-instruct` which was decommissioned
    // and now returns ENDPOINT_NOT_FOUND on synthesis. The 405b variant is
    // the closest current Llama generation in the public Databricks
    // foundation-model catalog. Override per-deployment via
    // supervisorProfile.synthesisEndpoint when a different model is preferred.
    const configuredEndpoint = supervisorProfile.synthesisEndpoint || 'databricks-meta-llama-3.1-405b-instruct';
    const successful = spaceResults.filter(r => r.ok);

    // Build source blocks with friendly display names + domain hints. The
    // raw profile key never appears in source-block headings — replaced
    // with displayName so the model never echoes internal identifiers
    // when it cites a source.
    //
    // Wave 22 cycle 5c (security): wrap each helper answer in a fenced code
    // block AND strip [MANDATORY] / [Context] markers so a hostile or
    // compromised helper space can't inject directives that influence the
    // synthesis LLM. The fenced block visually + semantically signals
    // "this is data to summarize, not instructions to follow".
    const sanitizeHelperAnswer = (s) => String(s || '')
        .replace(/\[MANDATORY\]/gi, '[helper-flagged]')
        .replace(/\[Context\]/gi, '[helper-context]')
        .replace(/```/g, '`​``');  // neutralize embedded fences
    const sourceBlocks = spaceResults.map(r => {
        const status = r.ok ? 'OK' : `UNAVAILABLE (${r.status || 'ERROR'})`;
        const label = profileDisplayName(r.profileName);
        const safeAnswer = sanitizeHelperAnswer(r.answer);
        return `### ${label} — ${domainHint(r.profileName)}\nStatus: ${status}\n\`\`\`\n${safeAnswer}\n\`\`\``;
    }).join('\n\n');

    if (successful.length === 0) {
        return `I could not get a completed answer from any configured source.\n\n${sourceBlocks}`;
    }

    const schemaContext = buildSchemaContext(spaceResults, supervisorProfile);

    try {
        const profileForLlm = {
            host: supervisorProfile.host || profileByName(successful[0].profileName)?.profile?.host || '',
            token: supervisorProfile.token || '',
        };
        const data = await databricksRequest(
            profileForLlm,
            'POST',
            `/serving-endpoints/${configuredEndpoint}/invocations`,
            {
                messages: [
                    {
                        role: 'system',
                        content: [
                            'You are UniBridge AI Supervisor, an enterprise BI supervisor agent.',
                            'You synthesize answers from multiple sources into one unified, accurate response.',
                            '',
                            'Rules:',
                            '1. Use only the supplied source outputs — do not invent numbers.',
                            '2. Lead with the unified answer. When citing a source, refer to it by',
                            '   its supplied display name from the source blocks below — never use',
                            '   raw profile keys or the phrase "Genie space".',
                            '3. If sources report different values for the same metric, explicitly flag the discrepancy,',
                            '   explain which column each source used (using the Schema Context), and recommend the most',
                            '   reliable source for that specific metric.',
                            '4. If a source was unavailable, note it briefly — do not dwell on it.',
                            '5. Never ask clarifying questions. State assumptions inline.',
                            '6. Highlight cross-domain insights when patterns from one source reinforce or contradict another.',
                            '7. Keep the answer concise and business-facing (≤300 words unless depth is required).',
                            '8. Never refer to internal mechanisms ("Genie space", "profile", "agent endpoint") in the answer.',
                        ].join('\n')
                    },
                    {
                        role: 'user',
                        content: [
                            `Question: ${question}`,
                            '',
                            schemaContext,
                            '',
                            '## Source Outputs',
                            sourceBlocks,
                        ].join('\n')
                    }
                ],
                max_tokens: 1400,
                temperature: 0.15,
            }
        );
        const raw = data.choices?.[0]?.message?.content
            || data.output?.content
            || data.content
            || JSON.stringify(data);
        return scrubInternalJargon(raw);
    } catch (err) {
        // Fallback: return structured raw results so no information is lost.
        // Phrasing intentionally avoids "Genie space" wording (BUG-013).
        return [
            'Supervisor synthesis model was unavailable — showing the raw source results below.',
            `Synthesis error: ${err.message}`,
            '',
            schemaContext,
            '',
            sourceBlocks
        ].join('\n\n');
    }
}

/**
 * Local fan-out supervisor. Walks each configured helper profile in parallel,
 * collects their answers, then synthesizes a unified response.
 *
 * GOVERNANCE PREFIX PROPAGATION (Wave 22): the `content` argument arrives from
 * the visual already prefixed with the runtime governance block (forbidden
 * columns, mandatory row filter, CTE preamble, role context, etc.) — see
 * genie.ts buildRuntimeScopePrefix. Because we forward `content` verbatim to
 * every helper via askGenieProfile(), the same prefix reaches every fan-out
 * target. Do NOT strip or reformat content here — that would silently weaken
 * the governance contract for multi-space queries.
 */
async function runLocalSupervisor(supervisorProfile, content, onEvent) {
    // If `spaces` is unset/empty, fan out to every configured non-supervisor
    // profile by default so a deployer with arbitrary profile names doesn't
    // need to maintain a parallel SUPERVISOR_SPACES list.
    let configuredSpaces;
    if (Array.isArray(supervisorProfile.spaces) && supervisorProfile.spaces.length) {
        configuredSpaces = supervisorProfile.spaces;
    } else if (typeof supervisorProfile.spaces === 'string' && supervisorProfile.spaces.trim()) {
        configuredSpaces = supervisorProfile.spaces.split(',');
    } else {
        configuredSpaces = defaultSupervisorSpaces(cfg().profiles);
    }
    const spaces = configuredSpaces
        .map(s => String(s).trim())
        .filter(Boolean)
        .filter(name => profileByName(name)?.profile?.spaceId);

    if (spaces.length === 0) {
        throw new Error('Supervisor has no configured helper profiles.');
    }

    // Resolve each helper's display metadata up front so streaming events
    // never carry the raw profile key as a user-facing label (BUG-013).
    // Route through profileRegistry so the lookup stays consistent with
    // every other profile read (IDEA-016).
    const helperMeta = spaces.map(name => {
        const p = profileRegistry.get(name) || {};
        return {
            name,
            displayName: (p.displayName && String(p.displayName).trim()) || titleCaseProfileKey(name),
            dataDomain: (p.dataDomain && String(p.dataDomain).trim()) || undefined,
        };
    });

    const emit = (evt) => { if (typeof onEvent === 'function') { try { onEvent(evt); } catch { /* ignore */ } } };

    // Announce the fan-out so the visual can render N pending helper chips.
    emit({ type: 'fanout.start', helpers: helperMeta });

    // Stagger space calls to stay under the Genie 5 req/min/workspace rate
    // limit when fanning out. History: 350ms (single-call fine, iterative
    // load broke) → 800ms (still tripped 429s in live testing on consecutive
    // supervisor calls — the rolling 60s window catches start-conversation +
    // poll bursts from the *previous* call still in flight) → 2000ms.
    // 2000ms spaces a 4-helper fan-out across 8s; combined with the new
    // 429 retry-with-backoff in databricksRequest, the supervisor now
    // recovers gracefully even if a burst happens to land on the limit.
    const STAGGER_MS = supervisorProfile.staggerMs ?? 2000;
    const startedAt = Date.now();
    const staggeredPromises = spaces.map((space, i) => {
        const meta = helperMeta[i];
        return new Promise(resolve => setTimeout(resolve, i * STAGGER_MS))
            .then(() => {
                const helperStart = Date.now();
                emit({ type: 'helper.start', helper: meta });
                return askGenieProfile(space, content)
                    .then(value => {
                        const elapsedMs = Date.now() - helperStart;
                        emit({ type: 'helper.done', helper: meta, ok: !!value.ok, status: value.status || (value.ok ? 'COMPLETED' : 'ERROR'), elapsedMs });
                        return value;
                    })
                    .catch(err => {
                        const elapsedMs = Date.now() - helperStart;
                        emit({ type: 'helper.done', helper: meta, ok: false, status: 'ERROR', elapsedMs });
                        throw err;
                    });
            });
    });
    const settled = await Promise.allSettled(staggeredPromises);
    const results = settled.map((item, index) => {
        if (item.status === 'fulfilled') return item.value;
        return { profileName: spaces[index], ok: false, answer: item.reason?.message || String(item.reason) };
    });

    emit({ type: 'synthesis.start', helperCount: results.filter(r => r.ok).length });
    const synthStart = Date.now();
    const answer = await synthesizeSupervisorAnswer(supervisorProfile, content, results);
    emit({ type: 'synthesis.done', elapsedMs: Date.now() - synthStart, totalElapsedMs: Date.now() - startedAt });
    return { answer, results };
}

// ── Confidence evaluation ─────────────────────────────────────────────────────
// POST /confidence
// Body: { attachments[], profileName, conversationId, messageId, question }
// Phase 1 (sync, 0 tokens): structural signals from SQL + result shape.
// Phase 2 (async, ~200 tokens): business-language reasons via short Genie
//   follow-up on the same conversation. Streamed back as two JSON lines so the
//   visual can update the chip immediately and enrich the tooltip later.
//
// Never blocks the answer — the visual fires this after the answer renders.

// Demo-only fallback for which result columns count as "synthetic estimates"
// (i.e. derived from patterns rather than measured). Customers should set
// `profile.syntheticIndicators = { columns: string[], message?: string }`
// in config so this works for arbitrary domains. Used only when neither the
// profile's syntheticIndicators is set nor a mapped legacy demo name applies.
const LEGACY_DEMO_SYNTHETIC_FIELDS = {
    customer: ['churn_risk_score','nps_score','complaint_count','promoter_count','detractor_count'],
    ops: ['hse_risk_score','near_miss_count','incident_count','target_sales','target_profit'],
};

function resolveSyntheticIndicators(profileName) {
    const p = profileRegistry.get(profileName);
    const ind = p?.syntheticIndicators;
    if (ind && Array.isArray(ind.columns) && ind.columns.length) {
        return {
            columns: ind.columns.map(c => String(c).toLowerCase()),
            message: typeof ind.message === 'string' && ind.message.trim()
                ? ind.message.trim()
                : 'Some figures shown are synthetic estimates derived from patterns in the data, not recorded measurements.',
        };
    }
    const legacy = LEGACY_DEMO_SYNTHETIC_FIELDS[profileName];
    if (legacy) {
        return {
            columns: legacy.map(c => c.toLowerCase()),
            message: 'Some figures shown (e.g. churn risk, NPS, HSE scores) are synthetic estimates derived from patterns in the data, not recorded measurements.',
        };
    }
    return null;
}

function structuralConfidence(attachments, profileName) {
    const schema   = getSchemaForProfile(profileName) || {};
    const signals  = [];
    let   score    = 100;

    if (!attachments || attachments.length === 0) {
        return { score: 40, level: 'low', signals: ['No result attachments returned from the data source.'] };
    }

    for (const att of attachments) {
        // Text-only answer — no SQL generated
        if (!att.query) {
            signals.push('Answer is text-only — no SQL query was generated. Results may be based on general knowledge rather than your data.');
            score -= 20;
            continue;
        }

        const sql        = att.query?.query || '';
        const cols       = att.query?.result?.columns || [];
        const rows       = att.query?.result?.data_table || [];
        const colNames   = cols.map(c => (typeof c === 'string' ? c : c.name || '').toLowerCase());
        const knownCols  = (schema.keyColumns || []).map(c => c.toLowerCase());

        // No rows returned
        if (rows.length === 0) {
            signals.push('The query returned no data. The data source may not contain records matching the filters applied.');
            score -= 25;
        }

        // Very large result — possible missing filter
        if (rows.length > 50000) {
            signals.push('The query returned a very large number of rows. Results may be unfiltered and could affect accuracy.');
            score -= 10;
        }

        // Enrichment warning (no columns despite COMPLETED status)
        if (att.query?.result?.enrichmentWarning) {
            signals.push('The data source returned a completed status but the result had no column definitions. Data may be incomplete.');
            score -= 30;
        }

        // Enrichment error (fetch of query-result failed)
        if (att.query?.result?.enrichmentError) {
            signals.push('The detailed result could not be retrieved from the data source. The answer may be based on a summary only.');
            score -= 20;
        }

        // Columns returned that are not in the declared schema
        const unknownCols = colNames.filter(c => c && !knownCols.includes(c));
        if (knownCols.length > 0 && unknownCols.length > 0) {
            signals.push(`The answer references ${unknownCols.length} field(s) not listed in the space schema — definitions may be incomplete or assumed.`);
            score -= 10 * Math.min(unknownCols.length, 3);
        }

        // Synthetic field used — flag for user awareness. Field list +
        // wording resolve from config (profile.syntheticIndicators).
        const indicators = resolveSyntheticIndicators(profileName);
        if (indicators) {
            const syntheticUsed = colNames.filter(c => indicators.columns.includes(c));
            if (syntheticUsed.length > 0) {
                signals.push(indicators.message);
                score -= 8;
            }
        }

        // SQL has no WHERE clause — likely full-table scan
        if (sql && !/\bWHERE\b/i.test(sql)) {
            signals.push('The query scanned the full dataset without filters. Results reflect all available records, which may be broader than intended.');
            score -= 5;
        }

        // Multiple JOINs — increased risk of grain mismatch
        const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
        if (joinCount >= 3) {
            signals.push('The query combines data from several sources. Cross-source comparisons may reflect different time periods or aggregation levels.');
            score -= 8;
        }
    }

    score = Math.max(0, Math.min(100, score));
    const level = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    return { score, level, signals };
}

app.post('/confidence', async (req, res) => {
    const { attachments, profileName, conversationId, question } = req.body || {};

    // Phase 1 — structural check, synchronous, 0 tokens
    const phase1 = structuralConfidence(attachments, profileName);

    // Stream Phase 1 immediately so the visual can update the chip colour
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write(JSON.stringify({ phase: 1, ...phase1 }) + '\n');

    // Phase 2 — business-language reasons via short Genie follow-up
    // Only if score is not already high and we have a conversation to follow up on
    if (phase1.score < 80 && conversationId && profileName) {
        try {
            const resolved = profileByName(profileName);
            if (!resolved) { res.end(); return; }

            const { profile } = resolved;
            const spaceId = profile.spaceId || profile.genieSpaceId;
            if (!spaceId) { res.end(); return; }

            const signals = phase1.signals.join(' ');
            const followUp =
                `In one short paragraph of plain business English (no bullet points, no column names, no SQL), ` +
                `explain to a business user why the previous answer may have limited confidence. ` +
                `Context: ${signals || 'the result may be incomplete'}. ` +
                `Use the data definitions and business context you know about this space. ` +
                `Do not mention technical terms. Keep it under 60 words.`;

            // Send follow-up message on the existing conversation
            const msgResp = await databricksRequest(
                profile, 'POST',
                `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages`,
                { content: followUp }
            );

            const followMsgId = msgResp.message_id;
            if (!followMsgId) { res.end(); return; }

            // Poll for follow-up answer (max 10s, 500ms intervals)
            const deadline = Date.now() + 10000;
            let businessReason = null;

            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 500));
                const poll = await databricksRequest(
                    profile, 'GET',
                    `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${followMsgId}`
                );
                const status = (poll.status || '').toUpperCase();
                if (status === 'COMPLETED') {
                    for (const att of poll.attachments || []) {
                        if (att.text?.content) { businessReason = att.text.content.trim(); break; }
                    }
                    break;
                }
                if (['FAILED','CANCELLED','TIMEOUT'].includes(status)) break;
            }

            if (businessReason) {
                res.write(JSON.stringify({ phase: 2, businessReason }) + '\n');
            }
        } catch (_err) {
            // Phase 2 failure is silent — Phase 1 score already sent.
            // Tier B Day 4 — but if upstream surfaced a 401, invalidate the
            // OAuth cache so the next /confidence call re-auths cleanly.
            // (No-op when the resolved profile is PAT-based, but cheap.)
            try {
                const msg = String(_err?.message || '');
                if (/\b401\b/.test(msg) && profileName) {
                    const r = profileByName(profileName);
                    if (r?.profile) invalidateOAuthCacheForProfile(r.profile);
                }
            } catch { /* invalidation must never throw */ }
        }
    }

    res.end();
});

// GET /supervisor/health — connection test
app.get('/supervisor/health', (req, res) => {
    const resolved = resolveSupervisorProfile({}, req.headers);
    if (!resolved) return res.status(404).json({ error: 'No supervisor profile configured. Add a profile with type: "supervisor" to config.json.' });
    res.json({
        ok: true,
        agentName: resolved.profile.agentName || 'Supervisor',
        endpoint: resolved.profile.endpoint || 'local-app-supervisor',
        mode: resolved.profile.type === 'supervisor-local' ? 'local-app-supervisor' : 'serving-endpoint',
        spaces: resolved.profile.spaces || [],
        profile: resolved.name
    });
});

// POST /supervisor/conversations/start-stream — supervisor with NDJSON
// progress events. Same fan-out + synthesis as /start, but emits one JSON
// object per line (Newline-Delimited JSON) so the visual can show
// per-helper chips + a streaming step timeline (IDEA-020 Phase 5).
//
// Event types:
//   { type: 'fanout.start',    helpers: [{name, displayName, dataDomain}, …] }
//   { type: 'helper.start',    helper:  {name, displayName, dataDomain}        }
//   { type: 'helper.done',     helper:  {…}, ok, status, elapsedMs              }
//   { type: 'synthesis.start', helperCount                                      }
//   { type: 'synthesis.done',  elapsedMs, totalElapsedMs                        }
//   { type: 'result', conversation_id, message_id, status, content, attachments, route }
//   { type: 'error', message }                  (terminal error before completion)
//
// Local-supervisor only — serving-endpoint supervisor flows still go to
// /supervisor/conversations/start. The visual auto-detects which by
// looking at /supervisor/health.mode.
app.post('/supervisor/conversations/start-stream', async (req, res) => {
    const resolved = resolveSupervisorProfile(req.body, req.headers);
    if (!resolved) {
        res.status(400).json({ error: 'No supervisor profile configured.' });
        return;
    }
    if (!supportsStreamingFor(resolved.profile.type)) {
        res.status(400).json({ error: `Streaming not supported for profile type "${resolved.profile.type}".` });
        return;
    }

    const { content, contextText } = req.body;
    if (!content || !String(content).trim()) {
        res.status(400).json({ error: 'Question content is required.' });
        return;
    }
    const fullContent = [contextText, content].filter(Boolean).join('\n\n');

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');           // disable nginx buffering if any
    res.flushHeaders?.();

    // ~5-minute wall-clock fail-safe. Set ~10s shorter than the visual's
    // 300s ceiling so the friendly error event lands before the visual
    // races it to throw its own timeout. Each helper still has its 160s
    // cap inside askGenieProfile. Override per-profile via streamDeadlineMs.
    const STREAM_DEADLINE_MS = resolved.profile.streamDeadlineMs ?? 290_000;

    const writeEvent = (obj) => {
        try {
            res.write(JSON.stringify(obj) + '\n');
            // Flush after every event so the visual sees it immediately
            // through XHR's progressive responseText reads.
            if (typeof res.flush === 'function') res.flush();
        } catch { /* client disconnected */ }
    };

    let timedOut = false;
    const deadlineTimer = setTimeout(() => {
        timedOut = true;
        console.warn(`[supervisor/stream] hit ${STREAM_DEADLINE_MS}ms wall-clock deadline; closing stream`);
        writeEvent({
            type: 'error',
            message: "We're still waiting on a response after 5 minutes — one or more sources may be slow or busy. Please try again, or simplify the question.",
        });
        try { res.end(); } catch { /* already ended */ }
    }, STREAM_DEADLINE_MS);

    try {
        let convId, msgId, answer, spaceResults;

        if (resolved.profile.type === 'supervisor-local') {
            // Local proxy-side fan-out — emits per-helper events natively
            // as it walks each Genie space.
            const supervisor = await runLocalSupervisor(resolved.profile, fullContent, writeEvent);
            if (timedOut) return;
            convId = `sv-${Date.now()}`;
            msgId = `sv-msg-${Date.now()}`;
            answer = supervisor.answer;
            spaceResults = supervisor.results.map(r => ({
                profileName: r.profileName,
                ok: r.ok,
                status: r.status || (r.ok ? 'COMPLETED' : 'ERROR'),
            }));
            storeConversation(convId, 'supervisor-local', resolved.name);
            console.log(`[supervisor/stream] local profile=${resolved.name} conv=${convId} helpers=${supervisor.results.length}`);
        } else {
            // Real Mosaic AI agent endpoint (type === 'supervisor'). The agent
            // is opaque — we can't see which helpers it picks. Emit coarse
            // "thinking…" events so the visual still shows activity, then
            // forward the agent's final answer as the result.
            //
            // The visual passes a `stageLabel` field (e.g. "HEADLINE",
            // "TRENDS", "RISKS") so the synthetic helper.start event can
            // surface the active stage instead of a generic agent name.
            const stageLabel = req.body?.stageLabel;
            const helperDisplayName = stageLabel
                ? `${resolved.profile.agentName || 'Supervisor Agent'} — ${stageLabel}`
                : (resolved.profile.agentName || 'Supervisor Agent');
            writeEvent({ type: 'fanout.start', helpers: [{ profileName: resolved.name, displayName: helperDisplayName, dataDomain: resolved.profile.dataDomain || 'all sources' }] });
            writeEvent({ type: 'helper.start', helper: { profileName: resolved.name, displayName: helperDisplayName } });
            const synthStart = Date.now();
            // Re-use the non-stream supervisor handler's invocation logic by
            // calling it through the same code path. Here we inline because
            // the non-stream handler writes to res directly.
            const host = resolved.profile.host?.replace(/\/$/, '');
            const ep = resolved.profile.endpoint;
            const token = resolved.profile.token;
            if (!host || !ep) throw new Error('Real-supervisor profile requires host and endpoint.');
            const data = await new Promise((resolve, reject) => {
                const url = new URL(`${host}${ep}`);
                const body = JSON.stringify({ messages: [{ role: 'user', content: fullContent }], stream: false });
                const opts = {
                    hostname: url.hostname,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                    },
                };
                const proto = url.protocol === 'https:' ? https : http;
                const request = proto.request(opts, r => {
                    let raw = '';
                    r.on('data', d => raw += d);
                    r.on('end', () => {
                        try { resolve(JSON.parse(raw)); }
                        catch { reject(new Error(`Non-JSON response: ${raw.slice(0, 200)}`)); }
                    });
                });
                request.on('error', reject);
                request.write(body);
                request.end();
            });
            const elapsedMs = Date.now() - synthStart;
            writeEvent({ type: 'helper.done', helper: { profileName: resolved.name, displayName: helperDisplayName }, ok: true, status: 'COMPLETED', elapsedMs });
            writeEvent({ type: 'synthesis.start', helperCount: 1 });
            writeEvent({ type: 'synthesis.done', elapsedMs: 0, totalElapsedMs: elapsedMs });
            if (timedOut) return;
            // Same unwrap logic as the non-stream path — supports
            // ChatCompletionResponse and ChatAgentResponse shapes.
            answer = data.choices?.[0]?.message?.content
                  || data.output?.content
                  || data.content;
            if (!answer && Array.isArray(data.messages) && data.messages.length) {
                const lastAssistant = [...data.messages].reverse().find(
                    m => m && (m.role === 'assistant' || !m.role)
                );
                answer = lastAssistant?.content;
            }
            if (!answer) answer = JSON.stringify(data);
            convId = data.conversation_id || `sv-${Date.now()}`;
            msgId = data.message_id || `sv-msg-${Date.now()}`;
            spaceResults = [{ profileName: resolved.name, ok: true, status: 'COMPLETED' }];
            storeConversation(convId, resolved.profile.endpoint, resolved.name);
            console.log(`[supervisor/stream] agent profile=${resolved.name} conv=${convId}`);
        }

        writeEvent({
            type: 'result',
            conversation_id: convId,
            conversationId: convId,
            message_id: msgId,
            messageId: msgId,
            status: 'COMPLETED',
            content: answer,
            attachments: [{ text: { content: answer } }],
            route: {
                assistantProfile: resolved.name,
                routeLabel: resolved.profile.agentName || 'Supervisor',
                spaceResults,
            },
        });
    } catch (err) {
        // Tier B Day 4 — extend the OAuth 401-invalidation policy from
        // databricksRequest into the supervisor stream call site. If the
        // resolved supervisor profile uses OAuth M2M and the upstream
        // surfaced a 401, drop the cached token so the next stream request
        // re-auths against /oidc/v1/token. PAT-based supervisor profiles
        // are unaffected (no-op).
        try {
            const msg = String(err?.message || '');
            if (/\b401\b/.test(msg) && resolved?.profile) {
                invalidateOAuthCacheForProfile(resolved.profile);
            }
        } catch { /* invalidation must never throw */ }
        if (!timedOut) writeEvent({ type: 'error', message: err?.message || String(err) });
    } finally {
        clearTimeout(deadlineTimer);
        if (!timedOut) {
            try { res.end(); } catch { /* already ended */ }
        }
    }
});

// POST /supervisor/conversations/start — begin a new supervisor conversation
app.post('/supervisor/conversations/start', async (req, res) => {
    const resolved = resolveSupervisorProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No supervisor profile configured.' });

    const { content, contextText } = req.body;
    if (!content || !String(content).trim()) {
        return res.status(400).json({ error: 'Question content is required.' });
    }

    const fullContent = [contextText, content].filter(Boolean).join('\n\n');
    const host  = resolved.profile.host.replace(/\/$/, '');
    const token = resolved.profile.token;
    const ep    = resolved.profile.endpoint;

    try {
        if (resolved.profile.type === 'supervisor-local') {
            const supervisor = await runLocalSupervisor(resolved.profile, fullContent);
            const convId = `sv-${Date.now()}`;
            const msgId = `sv-msg-${Date.now()}`;
            storeConversation(convId, 'supervisor-local', resolved.name);
            console.log(`[supervisor/local] profile=${resolved.name} conv=${convId} spaces=${supervisor.results.map(r => r.profileName).join(',')}`);
            return res.json({
                conversation_id: convId,
                conversationId: convId,
                message_id: msgId,
                messageId: msgId,
                status: 'COMPLETED',
                content: supervisor.answer,
                attachments: [{ text: { content: supervisor.answer } }],
                route: {
                    assistantProfile: resolved.name,
                    routeLabel: resolved.profile.agentName || 'Supervisor',
                    spaceResults: supervisor.results.map(r => ({
                        profileName: r.profileName,
                        ok: r.ok,
                        status: r.status || (r.ok ? 'COMPLETED' : 'ERROR'),
                    })),
                },
            });
        }

        if (!host || !ep) {
            return res.status(400).json({ error: 'Supervisor serving endpoint profile requires host and endpoint.' });
        }

        const body = JSON.stringify({
            messages: [{ role: 'user', content: fullContent }],
            stream: false
        });
        const data = await new Promise((resolve, reject) => {
            const url = new URL(`${host}${ep}`);
            const opts = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };
            const proto = url.protocol === 'https:' ? https : http;
            const request = proto.request(opts, r => {
                let raw = '';
                r.on('data', d => raw += d);
                r.on('end', () => {
                    try { resolve(JSON.parse(raw)); }
                    catch { reject(new Error(`Non-JSON response: ${raw.slice(0, 200)}`)); }
                });
            });
            request.on('error', reject);
            request.write(body);
            request.end();
        });

        // Normalise to the same shape genie.ts expects.
        // Supports four upstream response shapes:
        //   1. ChatCompletionResponse  → data.choices[0].message.content
        //   2. ChatAgentResponse        → data.messages[<last assistant>].content
        //   3. Mosaic legacy output     → data.output.content
        //   4. Bare content string      → data.content
        // When the agent returns an empty assistant message (which happens
        // on intermediate stage hits where the LLM punted), surface a
        // friendly "no content" sentinel rather than dumping raw JSON to
        // the visual — that JSON used to surface inside RISKS / etc.
        const convId  = data.conversation_id || `sv-${Date.now()}`;
        const msgId   = data.message_id      || `sv-msg-${Date.now()}`;
        let answer = data.choices?.[0]?.message?.content
                  || data.output?.content
                  || data.content;
        let agentReturnedEmpty = false;
        if (!answer && Array.isArray(data.messages) && data.messages.length) {
            // ChatAgentResponse — take the last assistant message
            const lastAssistant = [...data.messages].reverse().find(
                m => m && (m.role === 'assistant' || !m.role)
            );
            const candidate = lastAssistant?.content;
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                answer = candidate;
            } else if (candidate !== undefined) {
                // Assistant message present but content is empty / whitespace.
                agentReturnedEmpty = true;
            }
        }
        if (!answer) {
            if (agentReturnedEmpty || (Array.isArray(data.messages) && data.messages.length)) {
                // Don't leak the raw upstream payload into the visual.
                // Log it here so engineers can still debug from proxy.out.log.
                console.warn(`[supervisor/start] empty assistant content from agent — payload sample:`, JSON.stringify(data).slice(0, 500));
                answer = `_(The supervisor agent returned no content for this stage. Try simplifying the question, or re-run the stage.)_`;
            } else {
                // Truly unknown shape — fall back to stringifying as a debug aid.
                console.warn(`[supervisor/start] unrecognised response shape — stringifying:`, JSON.stringify(data).slice(0, 500));
                answer = JSON.stringify(data);
            }
        }

        storeConversation(convId, resolved.profile.endpoint, resolved.name);
        console.log(`[supervisor/start] profile=${resolved.name} conv=${convId}`);
        res.json({
            conversation_id: convId,
            conversationId:  convId,
            message_id:      msgId,
            messageId:       msgId,
            status:          'COMPLETED',
            content:         answer,
            attachments:     [{ text: { content: answer } }],
            route:           { assistantProfile: resolved.name, routeLabel: resolved.profile.agentName || 'Supervisor' }
        });
    } catch (err) {
        console.error('[supervisor/start]', err.message);
        // Tier B Day 4 — same 401-invalidation policy as the stream path.
        try {
            const msg = String(err?.message || '');
            if (/\b401\b/.test(msg) && resolved?.profile) {
                invalidateOAuthCacheForProfile(resolved.profile);
            }
        } catch { /* invalidation must never throw */ }
        res.status(500).json({ error: err.message });
    }
});

// POST /supervisor/conversations/:conversationId/messages — follow-up turn
app.post('/supervisor/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    const resolved = resolveSupervisorProfile(req.body, req.headers);
    if (!resolved) return res.status(400).json({ error: 'No supervisor profile configured.' });

    const { content, contextText } = req.body;
    if (!content || !String(content).trim()) {
        return res.status(400).json({ error: 'Question content is required.' });
    }

    // For stateless serving endpoints, each turn is a fresh call.
    // We send a user message; the supervisor handles its own memory.
    req.body.assistantProfile = resolved.name;
    return app._router.handle(Object.assign(req, { url: '/supervisor/conversations/start', path: '/supervisor/conversations/start', method: 'POST' }), res, () => {});
});

// GET /supervisor/conversations/:conversationId/messages/:messageId — poll
// Supervisor responses are synchronous (COMPLETED on the start call) so this
// endpoint returns the cached response immediately for polling compatibility.
app.get('/supervisor/conversations/:conversationId/messages/:messageId', (req, res) => {
    // The visual polls after startConversation — return COMPLETED immediately
    // since the supervisor response was already resolved synchronously.
    const msgId = req.params.messageId;
    res.json({
        id:              msgId,
        message_id:      msgId,
        status:          'COMPLETED',
        content:         '(Supervisor answer was returned synchronously on conversation start.)',
        attachments:     [],
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
    const config = cfg();
    const port = Number(process.env.PORT || process.env.DATABRICKS_APP_PORT || config.port || 8787);
    const runAsDatabricksApp = Boolean(process.env.PORT || process.env.DATABRICKS_APP_PORT);

    // Wave 28 — graceful shutdown. Track the active server(s) so SIGTERM
    // can let in-flight requests finish before exiting. Without this, a
    // K8s rolling update or container stop drops requests mid-response.
    const activeServers = [];
    function gracefulShutdown(signal) {
        console.log(`[shutdown] ${signal} received, closing connections (max 30s)...`);
        let pending = activeServers.length;
        if (pending === 0) return process.exit(0);
        const force = setTimeout(() => {
            console.error('[shutdown] Timed out waiting for connections; forcing exit.');
            process.exit(1);
        }, 30000);
        activeServers.forEach(srv => {
            try {
                srv.close(() => {
                    pending -= 1;
                    if (pending === 0) {
                        clearTimeout(force);
                        console.log('[shutdown] All servers closed cleanly.');
                        process.exit(0);
                    }
                });
            } catch { pending -= 1; if (pending === 0) { clearTimeout(force); process.exit(0); } }
        });
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    if (runAsDatabricksApp) {
        const srv = http.createServer(app);
        activeServers.push(srv);
        srv.listen(port, '0.0.0.0', () => {
            console.log(`UniBridge AI Proxy running for Databricks Apps on 0.0.0.0:${port}`);
            console.log(`Profiles → ${Object.keys(config.profiles ?? {}).join(', ')}`);
            console.log(`Config   → ${config.configSource || 'config.json'}`);
        });
    } else {
        // Bind IPv4 loopback — primary address; use http://127.0.0.1:<port> in clients.
        // Using 127.0.0.1 explicitly avoids the ~2s Windows localhost/IPv6 fallback
        // penalty that occurs when clients use the "localhost" hostname.
        const srv4 = http.createServer(app);
        activeServers.push(srv4);
        srv4.listen(port, '127.0.0.1', () => {
            console.log(`\nUniBridge AI Proxy  →  http://127.0.0.1:${port}`);
            console.log(`Profiles     →  ${Object.keys(config.profiles ?? {}).join(', ')}`);
            console.log(`Auth         →  ${azureIdentity ? 'PAT + Azure Identity fallback' : 'PAT only (install @azure/identity for managed identity)'}`);
            console.log(`Health check →  http://127.0.0.1:${port}/health`);
            console.log(`Visual URL   →  set apiBaseUrl = http://127.0.0.1:${port} (NOT localhost)\n`);
            // G7 — security posture warning. Detect user-PAT pattern (dapi*)
            // in any profile token and warn that a service-principal token in
            // a Databricks secret scope is preferred for production. Won't
            // fire for OAuth client_id/client_secret or empty tokens.
            try {
                const dapiProfiles = Object.entries(config.profiles ?? {})
                    .filter(([_, p]) => typeof p?.token === 'string' && /^dapi[a-z0-9]{20,}$/i.test(p.token))
                    .map(([name]) => name);
                if (dapiProfiles.length > 0) {
                    console.log(`⚠  Security: ${dapiProfiles.length} profile(s) using user PAT (dapi*): ${dapiProfiles.join(', ')}`);
                    console.log(`   PATs rotate with the user's TTL (~14 days) and inherit the user's permissions.`);
                    console.log(`   For production, switch to a service-principal token stored in a Databricks secret scope.`);
                    console.log(`   See databricks-agents/supervisor/README.md for the SP setup pattern.\n`);
                }
            } catch { /* never block startup on this */ }
        });

        // Also bind IPv6 loopback so clients using "localhost" (which resolves to ::1
        // first on Windows) connect immediately instead of timing out and retrying.
        const server6 = http.createServer(app);
        server6.on('error', () => {}); // IPv6 loopback may be disabled; silently skip
        server6.listen(port, '::1');
        activeServers.push(server6);
    }
}

module.exports = {
    app,
    conversationMap,
    normalizeGenieResponse,
    loadEnvProfiles,
    isTransientNetError,
    // Wave 31 — exported so the inline-credentials unit tests can exercise
    // the sanitizer directly without spinning up a full request.
    sanitizeInlineHeader,
    extractInlineCredentials,
    INLINE_HEADER_MAX_LEN,
    // Wave 36 — exported so precedence tests can exercise mode resolution
    // and applyInlineMode without standing up a full request stack.
    resolveInlineCredentialsMode,
    applyInlineMode,
    resolveProfile,
    VALID_INLINE_MODES,
    // Tier B Day 2 — exported so the OAuth M2M unit tests can drive the
    // helper directly with mocked fetch (real /oidc/v1/token round-trips
    // are infeasible from CI).
    resolveDatabricksOAuthToken,
    invalidateOAuthCacheForProfile,
    oauthTokenCache,
    OAUTH_CACHE_MAX,
    // Tier B Day 3 — exported so the SP-identity-hashing tests can verify
    // determinism + irreversibility without re-implementing the helper.
    hashServicePrincipalId,
    spHashForProfile,
    auditLog,
    errorStatusFromDatabricks,
    // IDEA-040 Phase 2 — engine dispatcher exported for unit tests so the
    // legacy-fields → engine inference logic can be exercised without
    // standing up the whole route stack.
    resolveEngine,
    // Cycle 47.6 — exported so foundation-route tests can patch in
    // foundationModelEndpoint on env-loaded profiles (env var convention
    // doesn't currently include that field).
    profileRegistry,
};
