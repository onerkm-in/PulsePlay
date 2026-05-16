// playground/src/lib/discoveryClient.ts
//
// Phase A — client wrapper for POST /api/assistant/discover. Adds a
// 15-min sessionStorage cache + in-flight request dedupe so multiple
// callers on the same dashboard share a single round-trip.
//
// Contract: see docs/DISCOVERY_LOOP.md. The client receives a
// DiscoverySnapshot from the proxy and surfaces:
//   • `getDiscoverySnapshot(input)` — async, cache-first
//   • `invalidateDiscoveryCache(input)` — for "Refresh" buttons
//   • `subscribeDiscoveryCache(handler)` — for UI components that want to
//     re-render when a snapshot lands
//
// Vendor-agnostic: this module knows nothing about Genie / OpenAI / Power
// BI / Tableau — it forwards opaque `biMetadata` from the active BIAdapter.

/* eslint-disable @typescript-eslint/no-explicit-any */

const STORAGE_PREFIX = "pulseplay:discovery:";
const SESSION_TTL_MS = 15 * 60 * 1000;     // 15 min — matches snapshot's expiresAt
const PROXY_UNREACHABLE_MESSAGE =
    "Proxy unreachable — is `node server.js` running on 127.0.0.1:8787?";

const PROFILE_NAME_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;
const PACK_SEGMENT_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface DiscoveryClientInput {
    assistantProfile: string;
    pack?: string;
    subVertical?: string;
    biMetadata?: BIMetadata | null;
    biUrl?: string;            // raw BI URL; client hashes it before sending
    bypassCache?: boolean;
}

export interface BIMetadata {
    activeViewId?: string | null;
    visibleMeasures?: Array<{
        name: string;
        kind?: string;
        format?: string;
        aggregation?: string;
    }>;
    visibleDimensions?: Array<{
        name: string;
        kind?: string;
        cardinalityHint?: string;
    }>;
    activeFilters?: Array<{ field: string; value: unknown }>;
}

export interface DiscoverySnapshot {
    snapshotVersion: 1;
    fetchedAt: string;
    expiresAt: string;
    cacheKey: string | null;
    sources: {
        /** Connector probe result snapshot — schema mirrors the
         *  ConnectorProbeResult from probeClient.ts but kept loose here
         *  (Record<string, unknown>) so we don't import probe types into
         *  the discovery contract. Discovery is pre-prompt; probe is
         *  pre-flight; they're orthogonal. */
        probe: Record<string, unknown> | null;
        biMetadata: BIMetadata | null;
        packKpis: PackKpi[];
    };
    fused: {
        availableKpis: FusedKpi[];
        reachableFrames: ReachableFrame[];
        unreachableFrames: UnreachableFrame[];
    };
    warnings: string[];
}

export interface PackKpi {
    name: string;
    definition: string;
    units?: string;
    direction?: string;
}

export interface FusedKpi {
    name: string;
    source: "pack" | "probe" | "bi-surface";
    definition?: string;
    units?: string;
    direction?: string;
    grounded: Array<{ table: string; column: string }>;
    aligned: boolean;
}

export interface ReachableFrame {
    frameId: string;
    label: string;
    description: string;
    domain: string;
    rationale: string;
    params: Record<string, unknown>;
}

export interface UnreachableFrame {
    frameId: string;
    label: string;
    description: string;
    domain: string;
    blockedBy: string;
}

export class DiscoveryInvalidInputError extends Error {
    constructor(field: string, value: string) {
        super(
            `Discovery client: invalid ${field} "${value.slice(0, 64)}" — ` +
            `rejected before network call. See docs/DISCOVERY_LOOP.md for the contract.`,
        );
        this.name = "DiscoveryInvalidInputError";
    }
}

/* ─── In-flight dedupe ──────────────────────────────────────────────── */

const _inflight = new Map<string, Promise<DiscoverySnapshot>>();
type CacheListener = (snapshot: DiscoverySnapshot) => void;
const _listeners = new Set<CacheListener>();

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Fetch a DiscoverySnapshot for the given inputs. Cache-first:
 *   1. sessionStorage hit within TTL → returned synchronously (Promise.resolve)
 *   2. In-flight request → returned via the existing promise (dedupe)
 *   3. Cache miss → network call, store, return
 *
 * Validates `assistantProfile`, `pack`, `subVertical` client-side BEFORE any
 * network call. The proxy also validates server-side; this is defense in
 * depth + early UX feedback for typos.
 */
export async function getDiscoverySnapshot(
    input: DiscoveryClientInput,
): Promise<DiscoverySnapshot> {
    const profile = String(input.assistantProfile || "").trim();
    if (!profile || !PROFILE_NAME_REGEX.test(profile)) {
        throw new DiscoveryInvalidInputError("assistantProfile", profile);
    }
    const pack = String(input.pack || "").trim();
    if (pack && !PACK_SEGMENT_REGEX.test(pack)) {
        throw new DiscoveryInvalidInputError("pack", pack);
    }
    const subVertical = String(input.subVertical || "").trim();
    if (subVertical && !PACK_SEGMENT_REGEX.test(subVertical)) {
        throw new DiscoveryInvalidInputError("subVertical", subVertical);
    }

    const biUrlHash = input.biUrl ? await _sha256Hex(input.biUrl) : "";
    const clientCacheKey = `${profile}|${pack}|${subVertical}|${biUrlHash}`;

    if (!input.bypassCache) {
        const cached = _readSessionCache(clientCacheKey);
        if (cached) return cached;
    }

    // Dedupe in-flight requests sharing the same key.
    const existing = _inflight.get(clientCacheKey);
    if (existing) return existing;

    const promise = _fetchSnapshot({
        assistantProfile: profile,
        pack,
        subVertical,
        biMetadata: input.biMetadata ?? null,
        biUrlHash,
        bypassCache: input.bypassCache === true,
    })
        .then(snapshot => {
            _writeSessionCache(clientCacheKey, snapshot);
            _notifyListeners(snapshot);
            return snapshot;
        })
        .finally(() => {
            _inflight.delete(clientCacheKey);
        });
    _inflight.set(clientCacheKey, promise);
    return promise;
}

/**
 * Invalidate the cached snapshot for the given inputs. Use from a
 * "Refresh discovery" button or when the user changes pack / profile /
 * dashboard mid-session.
 */
export async function invalidateDiscoveryCache(input: DiscoveryClientInput): Promise<void> {
    const profile = String(input.assistantProfile || "").trim();
    const pack = String(input.pack || "").trim();
    const subVertical = String(input.subVertical || "").trim();
    const biUrlHash = input.biUrl ? await _sha256Hex(input.biUrl) : "";
    const clientCacheKey = `${profile}|${pack}|${subVertical}|${biUrlHash}`;
    _clearSessionCache(clientCacheKey);
    _inflight.delete(clientCacheKey);
}

/** Drop every cached entry (e.g. on tenant switch). */
export function clearAllDiscoveryCache(): void {
    try {
        if (typeof sessionStorage === "undefined") return;
        const keys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        for (const k of keys) sessionStorage.removeItem(k);
    } catch {
        // ignore — quota / private-mode etc.
    }
    _inflight.clear();
}

/**
 * Subscribe to cache writes. Returns an unsubscribe function. Components
 * use this to re-render when a snapshot arrives without polling.
 */
export function subscribeDiscoveryCache(handler: CacheListener): () => void {
    _listeners.add(handler);
    return () => { _listeners.delete(handler); };
}

/* ─── Internals ─────────────────────────────────────────────────────── */

interface FetchPayload {
    assistantProfile: string;
    pack: string;
    subVertical: string;
    biMetadata: BIMetadata | null;
    biUrlHash: string;
    bypassCache: boolean;
}

async function _fetchSnapshot(payload: FetchPayload): Promise<DiscoverySnapshot> {
    let response: Response;
    try {
        response = await fetch("/api/assistant/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`${PROXY_UNREACHABLE_MESSAGE} (${detail})`);
    }

    if (!response.ok) {
        let msg = `Discovery request failed: HTTP ${response.status}`;
        try {
            const body = await response.json();
            if (body?.error) msg = String(body.error);
        } catch {
            // non-JSON error; use the default.
        }
        throw new Error(msg);
    }

    const body = await response.json();
    if (!_isSnapshotShape(body)) {
        throw new Error("Discovery returned an unexpected shape — missing required fields.");
    }
    return body;
}

function _readSessionCache(key: string): DiscoverySnapshot | null {
    try {
        if (typeof sessionStorage === "undefined") return null;
        const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const wrapper = JSON.parse(raw);
        if (!wrapper || typeof wrapper !== "object") return null;
        if (typeof wrapper.expiresAtMs !== "number") return null;
        if (Date.now() > wrapper.expiresAtMs) {
            sessionStorage.removeItem(STORAGE_PREFIX + key);
            return null;
        }
        if (!_isSnapshotShape(wrapper.snapshot)) return null;
        return wrapper.snapshot as DiscoverySnapshot;
    } catch {
        return null;
    }
}

function _writeSessionCache(key: string, snapshot: DiscoverySnapshot): void {
    try {
        if (typeof sessionStorage === "undefined") return;
        const wrapper = {
            expiresAtMs: Date.now() + SESSION_TTL_MS,
            snapshot,
        };
        sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(wrapper));
    } catch {
        // QuotaExceededError, private mode, etc. — silently skip.
    }
}

function _clearSessionCache(key: string): void {
    try {
        if (typeof sessionStorage === "undefined") return;
        sessionStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
        // ignore
    }
}

function _notifyListeners(snapshot: DiscoverySnapshot): void {
    for (const fn of _listeners) {
        try { fn(snapshot); } catch { /* listener errors don't break dispatch */ }
    }
}

async function _sha256Hex(value: string): Promise<string> {
    // Use SubtleCrypto when available (browsers + recent Node) — falls back
    // to a tiny FNV-1a hash when not (test envs without WebCrypto). The
    // hash only needs to be stable + collision-resistant within a session;
    // not cryptographically critical here (server validates allowlist).
    try {
        const enc = new TextEncoder().encode(value);
        const buf = await crypto.subtle.digest("SHA-256", enc);
        const bytes = new Uint8Array(buf);
        let out = "";
        for (const b of bytes) out += b.toString(16).padStart(2, "0");
        return out;
    } catch {
        // Fallback FNV-1a 32-bit.
        let h = 0x811c9dc5;
        for (let i = 0; i < value.length; i++) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, "0");
    }
}

function _isSnapshotShape(x: unknown): x is DiscoverySnapshot {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (o.snapshotVersion !== 1) return false;
    if (typeof o.fetchedAt !== "string") return false;
    if (typeof o.expiresAt !== "string") return false;
    if (!o.sources || typeof o.sources !== "object") return false;
    if (!o.fused || typeof o.fused !== "object") return false;
    const fused = o.fused as Record<string, unknown>;
    if (!Array.isArray(fused.availableKpis)) return false;
    if (!Array.isArray(fused.reachableFrames)) return false;
    if (!Array.isArray(fused.unreachableFrames)) return false;
    return true;
}

/** Test-only hook — clears the in-flight map. Not for production callers. */
export function __resetDiscoveryClientForTests(): void {
    _inflight.clear();
    _listeners.clear();
    try {
        if (typeof sessionStorage !== "undefined") {
            const keys: string[] = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
            }
            for (const k of keys) sessionStorage.removeItem(k);
        }
    } catch {
        // ignore
    }
}
