// playground/src/components/ConnectorPicker.tsx
//
// The X-axis of PulsePlay's 2-axis abstraction. The user picks WHICH
// AI connector the sidebar talks to — Databricks Genie, Azure OpenAI,
// AWS Bedrock, a Mosaic AI Foundation Model serving endpoint, or a
// Supervisor agent that orchestrates several. Independent of the
// Y-axis (which BI vendor is loaded in the canvas).
//
// Connector list is fetched from the proxy's /assistant/profiles
// endpoint at startup so the picker always reflects what the deployer
// has actually configured (no hardcoded list, no drift).

import { useEffect, useState } from "react";

interface Profile {
    name: string;
    displayName?: string;
    dataDomain?: string;
    description?: string;
}

interface ConnectorPickerProps {
    activeConnector: string;
    onChange: (connectorName: string) => void;
}

export function ConnectorPicker(props: ConnectorPickerProps) {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/assistant/profiles");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json() as Profile[];
                if (!cancelled) {
                    setProfiles(data);
                    if (data.length > 0 && !props.activeConnector) {
                        props.onChange(data[0].name);
                    }
                    setLoading(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <section className="pp-connector-picker">
            <label htmlFor="pp-connector" className="pp-connector-picker__label">AI connector</label>
            {loading && <div className="pp-connector-picker__loading">Loading…</div>}
            {error && <div className="pp-connector-picker__error">Proxy unreachable: {error}</div>}
            {!loading && !error && (
                <>
                    <select
                        id="pp-connector"
                        className="pp-connector-picker__select"
                        value={props.activeConnector}
                        onChange={(e) => props.onChange(e.target.value)}
                    >
                        {profiles.map(p => (
                            <option key={p.name} value={p.name}>
                                {p.displayName || p.name}
                            </option>
                        ))}
                    </select>
                    <p className="pp-connector-picker__desc">
                        {profiles.find(p => p.name === props.activeConnector)?.dataDomain || "—"}
                    </p>
                </>
            )}
        </section>
    );
}
