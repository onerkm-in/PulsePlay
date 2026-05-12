// playground/src/biPanel/BIPanel.tsx
//
// Generic host component that mounts ANY BIAdapter. The host doesn't
// know whether the adapter renders an iframe, runs a vendor SDK, or
// paints a custom canvas — it just provides a container DOM ref and
// lets the adapter take over.

import { useEffect, useRef, useState } from "react";
import type { BIAdapter, BIEmbedConfig, BIEvent } from "./BIAdapter";
import { loadAdapter } from "./registry";

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
}

export function BIPanel(props: BIPanelProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const adapterRef = useRef<BIAdapter | null>(null);
    const onAdapterReadyRef = useRef(props.onAdapterReady);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string>("");

    useEffect(() => {
        onAdapterReadyRef.current = props.onAdapterReady;
    }, [props.onAdapterReady]);

    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        setErrorMsg("");

        (async () => {
            try {
                const adapter = await loadAdapter(props.vendor);
                if (cancelled) {
                    adapter.destroy();
                    return;
                }
                adapterRef.current = adapter;
                await adapter.mount(containerRef.current, props.embedConfig);
                if (cancelled) {
                    adapter.destroy();
                    adapterRef.current = null;
                    return;
                }
                setStatus("ready");
                onAdapterReadyRef.current?.(adapter);

                // Wire vendor → host event bridge if the host is listening.
                if (props.onEvent) {
                    const eventTypes = ["loaded", "page-changed", "filter-applied", "selection-made", "data-refreshed", "error"] as const;
                    for (const t of eventTypes) {
                        adapter.on(t, props.onEvent);
                    }
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
    }, [props.vendor, props.embedConfig, props.onEvent]);

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
