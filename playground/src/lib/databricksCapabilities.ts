import { useCallback, useEffect, useMemo, useState } from "react";

export type DatabricksCapabilityStatus = "available" | "absent" | "forbidden" | "error";

export interface DatabricksCapabilityDetail {
    key: string;
    path: string;
    status: DatabricksCapabilityStatus;
    available: boolean;
    ready: boolean;
    httpStatus?: number | null;
    count: number;
    error?: string;
}

export interface DatabricksCapabilitiesSnapshot {
    ok: boolean;
    assistantProfile: string;
    spaceId?: string;
    capabilities: Record<string, boolean>;
    details: Record<string, DatabricksCapabilityDetail>;
    counts: Record<string, number>;
    ttlMs?: number;
    fetchedAt?: string;
    cacheExpiresAt?: string;
    cached?: boolean;
}

export interface DatabricksCapabilitiesState {
    loading: boolean;
    error: string;
    snapshot: DatabricksCapabilitiesSnapshot | null;
    capabilities: Record<string, boolean>;
    details: Record<string, DatabricksCapabilityDetail>;
    refresh: () => Promise<void>;
}

export const DATABRICKS_CAPABILITIES_STORAGE_PREFIX = "pulseplay:databricks-capabilities";
export const DATABRICKS_CAPABILITIES_EVENT = "pulseplay:databricks-capabilities-change";

function profileKey(profile?: string): string {
    return (profile || "default").trim() || "default";
}

export function databricksCapabilitiesStorageKey(profile?: string): string {
    return `${DATABRICKS_CAPABILITIES_STORAGE_PREFIX}:${profileKey(profile)}`;
}

function readCachedSnapshot(profile?: string): DatabricksCapabilitiesSnapshot | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(databricksCapabilitiesStorageKey(profile));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as DatabricksCapabilitiesSnapshot;
        if (!parsed || typeof parsed !== "object" || !parsed.capabilities || !parsed.details) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCachedSnapshot(profile: string | undefined, snapshot: DatabricksCapabilitiesSnapshot): void {
    if (typeof window === "undefined") return;
    const key = databricksCapabilitiesStorageKey(profile);
    const payload = JSON.stringify(snapshot);
    try {
        window.localStorage.setItem(key, payload);
    } catch {
        // Storage is a sync/cache optimization; the hook state remains source of truth.
    }
    window.dispatchEvent(new CustomEvent(DATABRICKS_CAPABILITIES_EVENT, {
        detail: { key, profile: profileKey(profile), snapshot },
    }));
}

async function fetchCapabilities(profile?: string): Promise<DatabricksCapabilitiesSnapshot> {
    const params = new URLSearchParams();
    if (profile) params.set("assistantProfile", profile);
    const url = `/api/assistant/capabilities${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DatabricksCapabilitiesSnapshot;
}

export function useDatabricksCapabilities(assistantProfile?: string): DatabricksCapabilitiesState {
    const [snapshot, setSnapshot] = useState<DatabricksCapabilitiesSnapshot | null>(() => readCachedSnapshot(assistantProfile));
    const [loading, setLoading] = useState<boolean>(!snapshot);
    const [error, setError] = useState<string>("");
    const activeProfile = profileKey(assistantProfile);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const next = await fetchCapabilities(activeProfile);
            setSnapshot(next);
            setError("");
            writeCachedSnapshot(activeProfile, next);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [activeProfile]);

    useEffect(() => {
        let cancelled = false;
        setSnapshot(readCachedSnapshot(activeProfile));
        setLoading(true);
        (async () => {
            try {
                const next = await fetchCapabilities(activeProfile);
                if (cancelled) return;
                setSnapshot(next);
                setError("");
                writeCachedSnapshot(activeProfile, next);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeProfile]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const key = databricksCapabilitiesStorageKey(activeProfile);
        const onStorage = (event: StorageEvent) => {
            if (event.key !== key || !event.newValue) return;
            try {
                const next = JSON.parse(event.newValue) as DatabricksCapabilitiesSnapshot;
                if (next?.capabilities && next?.details) setSnapshot(next);
            } catch {
                // Ignore malformed cross-tab payloads.
            }
        };
        const onCustom = (event: Event) => {
            const detail = (event as CustomEvent<{ key?: string; snapshot?: DatabricksCapabilitiesSnapshot }>).detail;
            if (detail?.key === key && detail.snapshot?.capabilities && detail.snapshot?.details) {
                setSnapshot(detail.snapshot);
            }
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener(DATABRICKS_CAPABILITIES_EVENT, onCustom);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(DATABRICKS_CAPABILITIES_EVENT, onCustom);
        };
    }, [activeProfile]);

    return useMemo(() => ({
        loading,
        error,
        snapshot,
        capabilities: snapshot?.capabilities || {},
        details: snapshot?.details || {},
        refresh,
    }), [loading, error, snapshot, refresh]);
}
