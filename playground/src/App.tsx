// playground/src/App.tsx
//
// PulsePlay shell — left sidebar with the AI assistant, main canvas with
// the active BI panel. Vendor picker top-left lets the user switch
// between Power BI / Tableau / Qlik / Looker / generic iframe; the
// embed config form right below it is vendor-specific (rendered by the
// adapter's optional configurator component, or a simple URL field for
// the generic-iframe fallback).
//
// The AI sidebar is the WHOLE point of PulsePlay — it stays mounted as
// the user switches vendors, accumulating context (which page they
// looked at, which filters they applied) across the session and using
// the same proxy backend (Genie / Azure OpenAI / Bedrock / foundation
// model) we proved out in DwD_AI_Assistant_for_PBI cycles 1-47.

import { useCallback, useMemo, useState } from "react";
import { BIPanel } from "./biPanel/BIPanel";
import { listVendors } from "./biPanel/registry";
import type { BIEvent, BIEmbedConfig } from "./biPanel/BIAdapter";
import { AISidebar } from "./components/AISidebar";
import { VendorPicker } from "./components/VendorPicker";
import { ConnectorPicker } from "./components/ConnectorPicker";
import { EmbedConfigForm } from "./components/EmbedConfigForm";
import { TestConnectionPanel } from "./components/TestConnectionPanel";
import { PackPicker, DEFAULT_AVAILABLE_PACKS } from "./components/PackPicker";
import type { PackSelection } from "./components/PackPicker";
import type { ConnectorProbeResult } from "./types/probe";

export function App() {
    const vendors = useMemo(() => listVendors(), []);
    // PulsePlay's 2-axis abstraction:
    //   activeVendor    = Y-axis: which BI tool is loaded in the canvas
    //   activeConnector = X-axis: which AI brain the sidebar talks to
    // Both pickers are independent — any cell of the matrix is valid.
    const [activeVendor, setActiveVendor] = useState<string>("generic-iframe");
    const [activeConnector, setActiveConnector] = useState<string>("");
    const [embedConfig, setEmbedConfig] = useState<BIEmbedConfig>({});
    const [recentEvents, setRecentEvents] = useState<BIEvent[]>([]);
    // Smart Connect state — populated by TestConnectionPanel's probe and the
    // user's pack confirmation (which may override the inferred suggestion).
    // See docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md for the design.
    const [probeResult, setProbeResult] = useState<ConnectorProbeResult | null>(null);
    const [packSelection, setPackSelection] = useState<PackSelection | null>(null);

    // Buffer the last ~20 BI events so the AI sidebar can include "what is
    // the user actually looking at right now?" in its prompt context. Same
    // pattern as DwD_AI_Assistant_for_PBI's contextBuilder, just sourced
    // from BI vendor events instead of Power BI's DataView.
    const handleBIEvent = useCallback((event: BIEvent) => {
        setRecentEvents(prev => {
            const next = [...prev, event];
            return next.length > 20 ? next.slice(-20) : next;
        });
    }, []);

    // Probe completion: persist the result and preselect the pack ONLY if
    // the user hasn't already chosen one (author-final-say rule from
    // CONNECTOR_PROBE_AND_SMART_CONNECT.md).
    const handleProbeComplete = useCallback((result: ConnectorProbeResult) => {
        setProbeResult(result);
        const inferred = result.inference;
        if (inferred?.suggestedPack) {
            setPackSelection(prev => prev ?? {
                pack: inferred.suggestedPack as string,
                subVertical: inferred.suggestedSubVertical,
            });
        }
    }, []);

    // Switching connectors invalidates probe + pack selection so the next
    // probe runs fresh against the new profile.
    const handleConnectorChange = useCallback((next: string) => {
        setActiveConnector(next);
        setProbeResult(null);
        setPackSelection(null);
    }, []);

    const hasEmbedConfig = Object.keys(embedConfig).length > 0;
    const probeSuggested: PackSelection | undefined =
        probeResult?.inference?.suggestedPack
            ? {
                  pack: probeResult.inference.suggestedPack,
                  subVertical: probeResult.inference.suggestedSubVertical,
              }
            : undefined;

    return (
        <div className="pp-app">
            <aside className="pp-app__sidebar">
                <header className="pp-app__brand">
                    <h1>PulsePlay</h1>
                    <p className="pp-app__brand-tag">AI playground · multi-BI host</p>
                </header>
                <VendorPicker
                    vendors={vendors}
                    activeVendor={activeVendor}
                    onChange={(v) => {
                        setActiveVendor(v);
                        setEmbedConfig({}); // reset config when switching vendors
                        setRecentEvents([]);
                    }}
                />
                <EmbedConfigForm
                    vendor={activeVendor}
                    value={embedConfig}
                    onChange={setEmbedConfig}
                    assistantProfile={activeConnector}
                />
                <ConnectorPicker
                    activeConnector={activeConnector}
                    onChange={handleConnectorChange}
                />
                {activeConnector && (
                    <TestConnectionPanel
                        profile={activeConnector}
                        onProbeComplete={handleProbeComplete}
                    />
                )}
                {activeConnector && (
                    <PackPicker
                        availablePacks={DEFAULT_AVAILABLE_PACKS}
                        suggested={probeSuggested}
                        value={packSelection}
                        onChange={setPackSelection}
                    />
                )}
                <AISidebar
                    activeVendor={activeVendor}
                    activeConnector={activeConnector}
                    recentEvents={recentEvents}
                    packSelection={packSelection}
                />
            </aside>
            <main className="pp-app__canvas">
                {hasEmbedConfig ? (
                    <BIPanel
                        vendor={activeVendor}
                        embedConfig={embedConfig}
                        onEvent={handleBIEvent}
                    />
                ) : (
                    <div className="pp-app__empty">
                        <h2>Pick a BI tool and supply embed config</h2>
                        <p>
                            PulsePlay can host {vendors.map(v => v.displayName).join(" · ")} as guests.
                            Choose a vendor on the left, fill in its embed config, and the AI
                            assistant will reason about whatever you load.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
