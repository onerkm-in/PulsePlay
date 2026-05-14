// playground/src/biPanel/BIPanel.tsx
//
// Generic host component that mounts ANY BIAdapter. The host doesn't
// know whether the adapter renders an iframe, runs a vendor SDK, or
// paints a custom canvas — it just provides a container DOM ref and
// lets the adapter take over.

import { useEffect, useRef, useState } from "react";
import type { BIAdapter, BIEmbedConfig, BIEvent } from "./BIAdapter";
import { loadAdapter } from "./registry";
import type { PulsePlayAllowlist } from "../types/allowlist";

interface BIPanelProps {
    /** Vendor identifier — must match a registry entry. */
    vendor: string;
    /** Adapter-specific embed configuration (URL, embed token, view path, etc.). */
    embedConfig: BIEmbedConfig;
    /** Optional event callback — the AI sidebar uses this to know what
     *  page/filter the user is looking at so its prompts can be context-aware. */
    onEvent?: (event: BIEvent) => void;
    /** Optional lifecycle callback for host-level command routing. PulsePlay
     *  uses this to let the ported Pulse UI apply filters to the active BI
     *  adapter through the generic BIAdapter contract. */
    onAdapterReady?: (adapter: BIAdapter | null) => void;
    /** Defense in depth: refuse to mount iframe/sdk URLs outside the org
     *  allowlist even if embedConfig was injected outside the setup UI. */
    allowlist?: PulsePlayAllowlist | null;
    /** Allowlist fail-closed (P1). When true, the governance allowlist is
     *  unreachable and the BIPanel must refuse to mount — even if the
     *  embedConfig superficially looks fine — to avoid loading a BI surface
     *  the org may not actually permit. Wired from `isAllowlistFailClosed(state)`
     *  in `settingsStore`. */
    allowlistFailClosed?: boolean;
}

function blockedEmbedOrigin(vendor: string, embedConfig: BIEmbedConfig, allowlist?: PulsePlayAllowlist | null): string | null {
    if (!allowlist?.configured) return null;
    const rawUrl = (embedConfig.url || embedConfig.embedUrl) as string | undefined;
    if (!rawUrl) return null;
    let host = "";
    try { host = new URL(rawUrl).hostname.toLowerCase(); }
    catch { return "Embed URL is not a valid URL."; }
    const allowed = allowlist.embedOrigins?.[vendor] || [];
    if (allowed.includes(host)) return null;
    return `URL hostname "${host}" is not in your organization's allowed origins. Allowed: ${allowed.join(", ") || "none configured"}.`;
}

/** Stable key derived from embedConfig content. The mount effect re-runs
 *  on real config changes (a new URL, a new token mode, etc.) but NOT on
 *  parent re-renders that happen to recreate the same-shaped object —
 *  e.g. a recentEvents push in App.tsx that does not touch embedConfig
 *  but causes a re-render. Stringifying is cheap (embedConfig is small);
 *  the alternative is shallow-equality per known field which is fragile
 *  every time a new field is added to BIEmbedConfig.
 *
 *  Perf rationale: before this fix, BIPanel re-mounted the adapter every
 *  time the parent re-rendered with a fresh `embedConfig` reference even
 *  when the content was unchanged. For Power BI, "re-mount" = full SDK
 *  re-init + iframe reload mid-session, which is the biggest single
 *  source of user-visible jank per the 2026-05-13 perf audit. */
function embedConfigKey(cfg: BIEmbedConfig): string {
    try { return JSON.stringify(cfg); }
    catch { return "[unserialisable-embed-config]"; }
}

export function BIPanel(props: BIPanelProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const adapterRef = useRef<BIAdapter | null>(null);
    const onAdapterReadyRef = useRef(props.onAdapterReady);
    // Phase 5+ perf — mirror the onAdapterReady ref pattern for the other
    // optional handlers / cross-cutting context so they don't fall into
    // the mount effect's dep array and trigger spurious remounts. The
    // adapter still sees the LATEST value at event time because we read
    // through the ref inside the handler closures below.
    const onEventRef = useRef(props.onEvent);
    const allowlistRef = useRef(props.allowlist);
    const embedConfigRef = useRef(props.embedConfig);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Sync refs every render — these stay current without invalidating
    // the mount effect's dep array.
    useEffect(() => { onAdapterReadyRef.current = props.onAdapterReady; }, [props.onAdapterReady]);
    useEffect(() => { onEventRef.current = props.onEvent; }, [props.onEvent]);
    useEffect(() => { allowlistRef.current = props.allowlist; }, [props.allowlist]);
    useEffect(() => { embedConfigRef.current = props.embedConfig; }, [props.embedConfig]);

    const configKey = embedConfigKey(props.embedConfig);
    const vendor = props.vendor;
    const failClosed = !!props.allowlistFailClosed;

    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        setErrorMsg("");

        // Allowlist fail-closed P1 — refuse to mount when the governance
        // allowlist is unreachable. The Settings layer surfaces a
        // recovery banner; BIPanel just becomes a placeholder until the
        // proxy comes back.
        if (failClosed) {
            setStatus("error");
            setErrorMsg("Governance allowlist is unreachable — refusing to mount until the proxy responds.");
            return () => { cancelled = true; };
        }

        (async () => {
            try {
                const embedConfig = embedConfigRef.current;
                const allowlist = allowlistRef.current;
                const blocked = blockedEmbedOrigin(vendor, embedConfig, allowlist);
                if (blocked) throw new Error(blocked);
                const adapter = await loadAdapter(vendor);
                if (cancelled) {
                    adapter.destroy();
                    return;
                }
                adapterRef.current = adapter;
                // L2 defense-in-depth — forward the per-vendor allowlist
                // into the adapter's mount() so the adapter performs the
                // hostname check too. If a future caller imports the
                // adapter directly and bypasses BIPanel, the gate still
                // fires. The adapter-side helpers fall through cleanly
                // when allowedOrigins is missing.
                const allowedOrigins =
                    allowlist?.configured
                        ? allowlist.embedOrigins?.[vendor] || []
                        : undefined;
                const embedConfigWithAllowlist = allowedOrigins && allowedOrigins.length > 0
                    ? { ...embedConfig, allowedOrigins }
                    : embedConfig;
                await adapter.mount(containerRef.current, embedConfigWithAllowlist);
                if (cancelled) {
                    adapter.destroy();
                    adapterRef.current = null;
                    return;
                }
                setStatus("ready");
                onAdapterReadyRef.current?.(adapter);

                // Wire vendor → host event bridge. The handler reads
                // `onEventRef.current` so callers can swap their onEvent
                // callback (e.g. via useCallback identity churn) without
                // triggering an adapter remount.
                // Phase 5 — also broadcast a `pulseplay:bi-event` window
                // event so Settings › System › Diagnostics can subscribe
                // to the rolling-buffer view without a SettingsHostContext.
                const eventTypes = ["loaded", "page-changed", "filter-applied", "selection-made", "data-refreshed", "error"] as const;
                for (const t of eventTypes) {
                    adapter.on(t, (event) => {
                        onEventRef.current?.(event);
                        try {
                            window.dispatchEvent(
                                new CustomEvent("pulseplay:bi-event", {
                                    detail: { vendor, event },
                                }),
                            );
                        } catch { /* swallow */ }
                    });
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!cancelled) {
                    setErrorMsg(msg);
                    setStatus("error");
                }
            }
        })();

        return () => {
            cancelled = true;
            onAdapterReadyRef.current?.(null);
            adapterRef.current?.destroy();
            adapterRef.current = null;
        };
        // Intentionally minimal deps: vendor (primitive) + configKey (value
        // hash of embedConfig) + failClosed (so a transition from
        // governance-unreachable → reachable triggers a fresh mount, and
        // vice-versa cleanly tears down). onEvent, allowlist (origin-check
        // only), and onAdapterReady flow through refs and don't trigger
        // remounts. See per-ref useEffects above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendor, configKey, failClosed]);

    // Allowlist late-arrival revalidation (P1). The mount effect above
    // reads `allowlistRef.current` at mount time — if the allowlist was
    // null/loading then and arrives later, the panel stays mounted but
    // may now be embedding a URL the new allowlist would block. Watch
    // props.allowlist + props.embedConfig and force an error state when
    // an already-mounted panel no longer passes blockedEmbedOrigin. We
    // do NOT silently re-mount; the user sees the block + the URL so
    // they understand why.
    const allowlistConfiguredVersion = props.allowlist?.fetchedAt || (props.allowlist?.configured ? "configured" : "null");
    useEffect(() => {
        if (status !== "ready") return; // only relevant once a successful mount exists
        const blocked = blockedEmbedOrigin(vendor, props.embedConfig, props.allowlist);
        if (blocked) {
            adapterRef.current?.destroy();
            adapterRef.current = null;
            onAdapterReadyRef.current?.(null);
            setStatus("error");
            setErrorMsg(`Governance update blocked this BI surface: ${blocked}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowlistConfiguredVersion, configKey, vendor]);

    return (
        <div className="pp-bi-panel" data-status={status}>
            {status === "loading" && <div className="pp-bi-panel__loading">Loading {props.vendor}…</div>}
            {status === "error" && (
                <div className="pp-bi-panel__error" role="alert">
                    Failed to embed {props.vendor}: {errorMsg}
                </div>
            )}
            <div ref={containerRef} className="pp-bi-panel__container" />
        </div>
    );
}
