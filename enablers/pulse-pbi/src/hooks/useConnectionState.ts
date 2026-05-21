import { useEffect, useMemo, useState } from "react";
import { GenieClient } from "../genie";
import { GenieVisualSettings } from "../settings";

export type ConnectionState = "checking" | "online" | "offline" | "not_configured";

const CONNECTION_CACHE_TTL_MS = 30_000;
const connectionHealthCache = new Map<string, { checkedAt: number; result: { ok: boolean; detail: string } }>();

function buildConnectionCacheKey(settings: GenieVisualSettings): string {
    return [
        settings.host.trim(),
        settings.apiBaseUrl.trim(),
        settings.assistantProfile.trim(),
        settings.spaceId.trim(),
        settings.proxyKey.trim() ? "proxy-key-present" : "proxy-key-missing",
        settings.token.trim() ? "token-present" : "token-missing"
    ].join("|");
}

export function useConnectionState(
    settings: GenieVisualSettings,
    client: GenieClient | null,
    connectionReady: boolean
): { connectionState: ConnectionState; connectionDetail: string } {
    const [connectionState, setConnectionState] = useState<ConnectionState>("not_configured");
    const [connectionDetail, setConnectionDetail] = useState("");

    const cacheKey = useMemo(() => buildConnectionCacheKey(settings), [settings]);

    useEffect(() => {
        if (!connectionReady || !client) {
            setConnectionState("not_configured");
            setConnectionDetail("");
            return;
        }

        const cached = connectionHealthCache.get(cacheKey);
        const now = Date.now();
        if (cached && now - cached.checkedAt < CONNECTION_CACHE_TTL_MS) {
            setConnectionState(cached.result.ok ? "online" : "offline");
            setConnectionDetail(cached.result.detail);
            return;
        }

        let cancelled = false;
        setConnectionState("checking");
        setConnectionDetail("Checking Genie reachability...");

        void client.testConnection().then(result => {
            if (cancelled) {
                return;
            }
            connectionHealthCache.set(cacheKey, { checkedAt: Date.now(), result });
            setConnectionState(result.ok ? "online" : "offline");
            setConnectionDetail(result.detail);
        });

        return () => {
            cancelled = true;
        };
    }, [client, connectionReady, cacheKey]);

    return { connectionState, connectionDetail };
}
