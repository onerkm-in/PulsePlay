// playground/src/multipane/SurfaceConnectorBar.tsx
//
// Part C P2 (2026-06-05) — the per-surface connector control. Renders ONLY when
// the multiConnectorPanes flag is ON; otherwise returns null so the header is
// unchanged. Lets the author bind AI Insights and Ask Pulse to DIFFERENT
// connectors at the same time (e.g. AI Insights → Power BI, Ask Pulse → Genie).
//
// Each surface defaults to "(shared)" — inherit the single active connector —
// so binding is purely additive: leaving both on "(shared)" is identical to the
// pre-flag behavior.

import { useFeatureFlag } from "../featureFlags";
import { useEffect, useMemo, useState } from "react";
import {
    useSurfaceConnectors,
    setSurfaceProfile,
    type ConnectorSurfaceId,
} from "./surfaceConnectors";

interface SurfaceConnectorBarProps {
    /** Available AI profiles (proxy profile keys) from the governance allowlist. */
    aiProfiles: string[];
    /** The single shared connector — shown as the "(shared)" default label. */
    sharedProfile: string;
}

const SURFACES: { id: ConnectorSurfaceId; label: string }[] = [
    { id: "ai-insights", label: "AI Insights" },
    { id: "ask-pulse", label: "Ask Pulse" },
];

/** Live profile list. The governance allowlist often doesn't enumerate
 *  aiProfiles in dev, so the picker would otherwise be empty — fetch the real
 *  configured profiles from the proxy (GET /assistant/profiles) and merge with
 *  the allowlist + the shared profile so the dropdown is always usable. */
function useAvailableProfiles(fallback: string[], shared: string): string[] {
    const [fetched, setFetched] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/assistant/profiles")
            .then(r => (r.ok ? r.json() : []))
            .then((rows: Array<{ name?: string }>) => {
                if (cancelled || !Array.isArray(rows)) return;
                setFetched(rows.map(r => String(r?.name || "")).filter(Boolean));
            })
            .catch(() => { /* offline / not-configured — fall back below */ });
        return () => { cancelled = true; };
    }, []);
    return useMemo(() => {
        const set = new Set<string>();
        for (const p of fetched) set.add(p);
        for (const p of fallback) if (p) set.add(p);
        if (shared) set.add(shared);
        return Array.from(set);
    }, [fetched, fallback, shared]);
}

export function SurfaceConnectorBar(props: SurfaceConnectorBarProps): React.ReactElement | null {
    const flagOn = useFeatureFlag("multiConnectorPanes");
    const bindings = useSurfaceConnectors();
    const profiles = useAvailableProfiles(props.aiProfiles, props.sharedProfile);
    if (!flagOn) return null;

    const sharedLabel = props.sharedProfile ? `(shared: ${props.sharedProfile})` : "(shared)";

    return (
        <div data-testid="surface-connector-bar" style={bar} role="group" aria-label="Per-surface connectors">
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--pp-text-muted, #64748b)" }}>
                Per-surface connectors
            </span>
            {SURFACES.map(s => (
                <label key={s.id} style={row}>
                    <span style={{ fontSize: 12, color: "var(--pp-text, #0f172a)" }}>{s.label}</span>
                    <select
                        data-testid={`surface-connector-${s.id}`}
                        value={bindings[s.id] ?? ""}
                        onChange={e => setSurfaceProfile(s.id, e.target.value)}
                        style={select}
                    >
                        <option value="">{sharedLabel}</option>
                        {profiles.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </label>
            ))}
        </div>
    );
}

const bar: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "6px 12px",
    background: "var(--pp-surface-raised, #fff)",
    border: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
    borderRadius: 8,
};
const row: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
const select: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--pp-border, rgba(0,0,0,0.12))",
    background: "var(--pp-surface, #fff)",
    color: "var(--pp-text, #0f172a)",
    fontSize: 12,
};
