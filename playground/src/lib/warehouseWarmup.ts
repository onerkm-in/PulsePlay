// playground/src/lib/warehouseWarmup.ts
//
// Pre-warm the Databricks SQL warehouse associated with a Genie profile so
// the user's first Pulse / AI ask doesn't pay 30–60s of cold-start. The
// warehouse auto-suspends after ~10 idle minutes (default Databricks
// behaviour); when it's STOPPED, the proxy's `ensureWarehouseRunning`
// blocks the request handler until the warehouse reaches RUNNING. By
// firing the warm-up the moment the user picks a connector — typically
// 30+ seconds before they finish typing a question — the warehouse is
// already RUNNING when the Ask click lands, and the proxy short-circuits
// via its 5-minute "saw it RUNNING" cache.
//
// This module is intentionally fire-and-forget: it does NOT block any UI
// path, returns no useful value, and swallows errors (the worst case is
// that the user's first ask pays cold-start the way it does today). The
// proxy returns 400 if the profile has no `warehouseId` configured (e.g.
// Foundation Model or Bedrock profiles); we treat that as a no-op too.

const WARMUP_ENDPOINT = "/api/warehouse/start";

/**
 * Map of profile-name → AbortController for any in-flight warm-up so a
 * rapid switch between connectors aborts the stale request. Without this,
 * a user who picks Genie, then switches to Foundation Model within 2s,
 * leaves a pending warm-up that lingers for up to 5 min on the proxy.
 */
const inFlight = new Map<string, AbortController>();

/**
 * Fire a warm-up POST for the given assistant profile. Fire-and-forget;
 * returns immediately. The returned promise is exposed for tests but the
 * normal calling pattern is to NOT await it.
 *
 * @param profileName Name of the resolved assistant profile (e.g. "genie-default").
 * @returns Promise resolving to "warmed" / "no-warehouse" / "skipped" /
 *   "error" — useful for telemetry + tests, ignored in production.
 */
export async function warmGenieWarehouse(profileName: string): Promise<
    "warmed" | "no-warehouse" | "skipped" | "aborted" | "error"
> {
    const trimmed = (profileName || "").trim();
    if (!trimmed) return "skipped";

    // Abort any prior in-flight warm-up for THIS profile so we don't have
    // duplicate requests competing. (A different-profile warm-up firing
    // alongside is fine — they target different warehouses.)
    const prior = inFlight.get(trimmed);
    if (prior) {
        try { prior.abort(); } catch { /* swallow */ }
    }

    const ctrl = new AbortController();
    inFlight.set(trimmed, ctrl);

    try {
        const res = await fetch(WARMUP_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Assistant-Profile": trimmed,
            },
            body: JSON.stringify({ assistantProfile: trimmed }),
            signal: ctrl.signal,
        });
        if (res.status === 400) {
            // The proxy returns 400 when the profile has no warehouseId
            // (Foundation Model / Bedrock paths). Not an error — just a
            // signal that this profile doesn't have a Databricks warehouse
            // attached and warm-up isn't applicable.
            return "no-warehouse";
        }
        if (!res.ok) {
            return "error";
        }
        return "warmed";
    } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
            return "aborted";
        }
        return "error";
    } finally {
        // Only clear our slot if it's still our controller — a later call
        // may have replaced us.
        if (inFlight.get(trimmed) === ctrl) inFlight.delete(trimmed);
    }
}

/* ─── Keep-alive ping ───────────────────────────────────────────────── */
//
// The warmup above eliminates cold-start on the user's FIRST ask. The
// keep-alive ping below keeps the warehouse warm across the rest of the
// session so the SECOND-and-onward asks also skip cold-start when the
// user pauses for >~10 min between questions (lunch, meetings, deep
// reading the BI canvas).
//
// Defaults are tuned for Databricks' typical auto-stop:
//   • Warehouse auto-stops after 10 min idle (Databricks default).
//   • We ping every 4 min so the warehouse is touched well before
//     the auto-stop window closes. Two missed pings still leave a
//     2-min safety margin (4 + 4 = 8 < 10).
//   • Document.hidden tabs PAUSE pinging — no point keeping a
//     warehouse warm for a background tab the user isn't using;
//     when they return, the visibility-change handler fires an
//     immediate warmup so the next ask still benefits.

const DEFAULT_KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

interface KeepaliveSession {
    profileName: string;
    intervalMs: number;
    timerId: ReturnType<typeof setInterval> | null;
    visibilityHandler: (() => void) | null;
}

/** Singleton keep-alive session. Replacing it (e.g. on connector swap)
 *  stops the prior session cleanly. */
let _activeKeepalive: KeepaliveSession | null = null;

/**
 * Start firing warm-up pings every `intervalMs` (default 4 min) for the
 * given profile. Replaces any prior keep-alive — the playground only
 * needs one warehouse warm at a time per session.
 *
 * Returns a stop function for callers that prefer that idiom (useEffect
 * cleanup, for instance). Calling `stopWarehouseKeepalive` directly is
 * equivalent.
 *
 * Visibility:
 *   • When `document.hidden` becomes true, the interval timer is
 *     suspended (saves pings while the tab is in background).
 *   • When the tab returns to visible, an immediate warm-up fires + the
 *     interval re-starts.
 */
export function startWarehouseKeepalive(
    profileName: string,
    intervalMs: number = DEFAULT_KEEPALIVE_INTERVAL_MS,
): () => void {
    const trimmed = (profileName || "").trim();
    if (!trimmed) return () => { /* no-op */ };

    // Replace any prior session (different profile or same profile being
    // re-started). This stops the old timer + listener before installing
    // the new one — no duplicate intervals.
    stopWarehouseKeepalive();

    const session: KeepaliveSession = {
        profileName: trimmed,
        intervalMs,
        timerId: null,
        visibilityHandler: null,
    };

    const armTimer = () => {
        if (session.timerId) return; // already armed
        session.timerId = setInterval(() => {
            void warmGenieWarehouse(session.profileName);
        }, session.intervalMs);
    };
    const disarmTimer = () => {
        if (session.timerId) {
            clearInterval(session.timerId);
            session.timerId = null;
        }
    };

    if (typeof document !== "undefined") {
        session.visibilityHandler = () => {
            if (document.hidden) {
                disarmTimer();
            } else {
                // Tab returned to visible — fire an immediate ping so the
                // next user ask doesn't pay cold-start if they paused
                // long enough for an auto-stop to fire, then re-arm.
                void warmGenieWarehouse(session.profileName);
                armTimer();
            }
        };
        document.addEventListener("visibilitychange", session.visibilityHandler);
        // Only arm immediately if the tab is currently visible.
        if (!document.hidden) armTimer();
    } else {
        armTimer();
    }

    _activeKeepalive = session;
    return () => stopWarehouseKeepalive();
}

/** Stop any active keep-alive session. Safe to call multiple times. */
export function stopWarehouseKeepalive(): void {
    const session = _activeKeepalive;
    if (!session) return;
    if (session.timerId) {
        clearInterval(session.timerId);
        session.timerId = null;
    }
    if (session.visibilityHandler && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", session.visibilityHandler);
        session.visibilityHandler = null;
    }
    _activeKeepalive = null;
}

/** Test seam — abort + drop every in-flight warm-up and stop keepalive. */
export function __resetWarehouseWarmupForTests(): void {
    for (const ctrl of inFlight.values()) {
        try { ctrl.abort(); } catch { /* swallow */ }
    }
    inFlight.clear();
    stopWarehouseKeepalive();
}

/** Test seam — peek at the active keepalive session (null when stopped). */
export function __getActiveKeepaliveForTests(): { profileName: string; intervalMs: number; armed: boolean } | null {
    if (!_activeKeepalive) return null;
    return {
        profileName: _activeKeepalive.profileName,
        intervalMs: _activeKeepalive.intervalMs,
        armed: _activeKeepalive.timerId !== null,
    };
}

export const WAREHOUSE_WARMUP_ENDPOINT = WARMUP_ENDPOINT;
export const WAREHOUSE_KEEPALIVE_INTERVAL_MS = DEFAULT_KEEPALIVE_INTERVAL_MS;
