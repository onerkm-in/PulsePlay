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

/** Test seam — abort + drop every in-flight warm-up. */
export function __resetWarehouseWarmupForTests(): void {
    for (const ctrl of inFlight.values()) {
        try { ctrl.abort(); } catch { /* swallow */ }
    }
    inFlight.clear();
}

export const WAREHOUSE_WARMUP_ENDPOINT = WARMUP_ENDPOINT;
