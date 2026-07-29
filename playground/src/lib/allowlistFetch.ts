// playground/src/lib/allowlistFetch.ts
//
// ONE fetch for the governance allowlist per boot (COST-P2).
//
// Two consumers load the allowlist independently — App's react-query hook and
// the SettingsProvider — and they fire SEQUENTIALLY during mount, so sharing
// only the in-flight promise never deduped them: the second call started after
// the first resolved. A short TTL on the resolved value closes that window.
//
// The TTL is deliberately a few seconds, not minutes: the governance refresh
// must never be served meaningfully stale. Within one boot burst the value
// cannot have changed; an explicit user-triggered refresh passes force=true
// and always hits the server.

import type { PulsePlayAllowlist } from "../types/allowlist";

const BOOT_TTL_MS = 5000;

let _inflight: Promise<PulsePlayAllowlist> | null = null;
let _resolved: { value: PulsePlayAllowlist; at: number } | null = null;

export async function fetchAllowlistShared(force = false): Promise<PulsePlayAllowlist> {
    if (!force && _resolved && Date.now() - _resolved.at < BOOT_TTL_MS) {
        return _resolved.value;
    }
    if (!force && _inflight) return _inflight;
    _inflight = (async () => {
        // Explicit options arg — the previous apiFetch-based loader always
        // passed one, and the governance integration tests assert the call
        // shape (url, options) to pin that requests go through one client.
        const res = await fetch("/api/assistant/allowlist", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PulsePlayAllowlist;
    })();
    try {
        const value = await _inflight;
        _resolved = { value, at: Date.now() };
        return value;
    } finally {
        _inflight = null;
    }
}

/** Tests only — fresh module state without vi.resetModules gymnastics. */
export function __resetAllowlistFetch(): void {
    _inflight = null;
    _resolved = null;
}
