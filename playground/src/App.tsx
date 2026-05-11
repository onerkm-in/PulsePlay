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
import { PulseShell } from "./components/PulseShell";

/** UI mode toggle — "pulse" mounts the full ported Pulse experience in
 *  the left panel (Insights tab + Chat tab + SetupPanel + all the
 *  iterated UX); "v0" mounts the Smart-Connect-flavoured v0 components
 *  we built in cycles B + C. Both modes keep the BI canvas on the right
 *  so the multi-BI host stays usable. Cycle F lets the panels be
 *  positioned freely (left/right/top/bottom/floating). */
type UiMode = "pulse" | "v0";
const UI_MODE_STORAGE_KEY = "pulseplay:ui-mode";

/** Cycle E.3 — analogous to Pulse's existing "Insights / Chat / Both"
 *  enabled-features toggle, but at the OUTER playground level: which
 *  panels render at all. "aiOnly" hides the BI canvas (handy for a
 *  chat-only deployment); "biOnly" hides the AI side (handy when
 *  embedding PulsePlay as a BI viewer in another shell); "both"
 *  (default) keeps everything visible. Persists in localStorage. */
type EnabledComponents = "aiOnly" | "biOnly" | "both";
const ENABLED_COMPONENTS_STORAGE_KEY = "pulseplay:enabled-components";

function readInitialUiMode(): UiMode {
    if (typeof window === "undefined") return "pulse";
    try {
        const stored = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
        if (stored === "pulse" || stored === "v0") return stored;
    } catch { /* swallow */ }
    return "pulse";
}

function readInitialEnabledComponents(): EnabledComponents {
    if (typeof window === "undefined") return "both";
    try {
        const stored = window.localStorage.getItem(ENABLED_COMPONENTS_STORAGE_KEY);
        if (stored === "aiOnly" || stored === "biOnly" || stored === "both") return stored;
    } catch { /* swallow */ }
    return "both";
}

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
    // UI mode persists across reloads. Pulse is default — that's the
    // user-confirmed direction (port carries forward).
    const [uiMode, setUiMode] = useState<UiMode>(() => readInitialUiMode());
    const [enabledComponents, setEnabledComponents] = useState<EnabledComponents>(
        () => readInitialEnabledComponents(),
    );
    // Bumping renderToken nudges PulseShell to re-call visual.update(),
    // used after settings save events from PulseHostStub.persistProperties.
    const [pulseRenderToken, setPulseRenderToken] = useState(0);
    const handleUiModeChange = useCallback((next: UiMode) => {
        setUiMode(next);
        try { window.localStorage.setItem(UI_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);
    const handleEnabledComponentsChange = useCallback((next: EnabledComponents) => {
        setEnabledComponents(next);
        try { window.localStorage.setItem(ENABLED_COMPONENTS_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);

    const aiVisible = enabledComponents === "aiOnly" || enabledComponents === "both";
    const biVisible = enabledComponents === "biOnly" || enabledComponents === "both";
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
            {aiVisible && (
            <aside className="pp-app__sidebar" style={{ minWidth: 380, maxWidth: 560, width: biVisible ? "32%" : "100%" }}>
                <header className="pp-app__brand" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0 }}>PulsePlay</h1>
                        <p className="pp-app__brand-tag" style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.7 }}>
                            AI playground · multi-BI host
                        </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <UiModeToggle value={uiMode} onChange={handleUiModeChange} />
                        <EnabledComponentsToggle value={enabledComponents} onChange={handleEnabledComponentsChange} />
                    </div>
                </header>

                {uiMode === "pulse" ? (
                    <PulseShell
                        renderToken={pulseRenderToken}
                        onSettingsChange={() => setPulseRenderToken(t => t + 1)}
                    />
                ) : (
                    <>
                        <VendorPicker
                            vendors={vendors}
                            activeVendor={activeVendor}
                            onChange={(v) => {
                                setActiveVendor(v);
                                setEmbedConfig({});
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
                    </>
                )}
            </aside>
            )}
            {biVisible && (
            <main className="pp-app__canvas">
                {hasEmbedConfig ? (
                    <BIPanel
                        vendor={activeVendor}
                        embedConfig={embedConfig}
                        onEvent={handleBIEvent}
                    />
                ) : (
                    <div className="pp-app__empty">
                        {aiVisible ? (
                            <>
                                <h2>Pick a BI tool and supply embed config</h2>
                                <p>
                                    PulsePlay can host {vendors.map(v => v.displayName).join(" · ")} as guests.
                                    Choose a vendor on the left, fill in its embed config, and the AI
                                    assistant will reason about whatever you load.
                                </p>
                                {uiMode === "pulse" && (
                                    <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
                                        Pulse UI is active in the left panel. Configure the connection
                                        via its Setup tab; the embedded BI surface will appear here.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <h2>BI-only mode</h2>
                                <p>
                                    AI components are hidden. Embed any BI URL below — PulsePlay is acting
                                    as a thin multi-vendor BI host. Switch back to "Both" or "AI only" via
                                    the top toggle to re-enable Pulse / v0.
                                </p>
                                <p style={{ marginTop: 12 }}>
                                    Vendors: {vendors.map(v => v.displayName).join(" · ")}
                                </p>
                            </>
                        )}
                    </div>
                )}
            </main>
            )}
            {!aiVisible && !biVisible && (
                <main className="pp-app__canvas">
                    <div className="pp-app__empty">
                        <h2>Both panels hidden</h2>
                        <p>Re-enable AI or BI via the top toggle.</p>
                    </div>
                </main>
            )}
        </div>
    );
}

/** Cycle E.3 — outer-panel enabled-components toggle (AI / BI / Both).
 *  Parallel to Pulse's existing "Insights / Chat / Both" feature toggle
 *  but at a layer above: this hides the entire AI side or the entire
 *  BI canvas. Persists in localStorage. Cycle F replaces this with a
 *  positionable layout that subsumes the binary toggle. */
function EnabledComponentsToggle(props: { value: EnabledComponents; onChange: (next: EnabledComponents) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "3px 7px",
        fontSize: 10,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    return (
        <div role="group" aria-label="Enabled components" style={{ display: "inline-flex", gap: 3 }}>
            <span style={{ fontSize: 10, opacity: 0.6, marginRight: 4, alignSelf: "center" }}>show:</span>
            <button
                type="button"
                style={props.value === "aiOnly" ? activeBtn : baseBtn}
                onClick={() => props.onChange("aiOnly")}
                aria-pressed={props.value === "aiOnly"}
                title="Show only the AI panel"
            >
                AI
            </button>
            <button
                type="button"
                style={props.value === "biOnly" ? activeBtn : baseBtn}
                onClick={() => props.onChange("biOnly")}
                aria-pressed={props.value === "biOnly"}
                title="Show only the BI canvas"
            >
                BI
            </button>
            <button
                type="button"
                style={props.value === "both" ? activeBtn : baseBtn}
                onClick={() => props.onChange("both")}
                aria-pressed={props.value === "both"}
                title="Show both AI and BI panels"
            >
                Both
            </button>
        </div>
    );
}

/** Small top-right toggle to flip between the ported Pulse UI and the
 *  v0 Smart-Connect-flavoured components from cycles B + C. Persists
 *  via UI_MODE_STORAGE_KEY in localStorage so the choice survives
 *  reloads. Cycle F replaces this with a free-floating layout. */
function UiModeToggle(props: { value: UiMode; onChange: (next: UiMode) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "4px 8px",
        fontSize: 11,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    return (
        <div role="group" aria-label="UI mode" style={{ display: "inline-flex", gap: 4 }}>
            <button
                type="button"
                style={props.value === "pulse" ? activeBtn : baseBtn}
                onClick={() => props.onChange("pulse")}
                aria-pressed={props.value === "pulse"}
                title="Use the ported Pulse UI (Setup + Insights + Chat)"
            >
                Pulse
            </button>
            <button
                type="button"
                style={props.value === "v0" ? activeBtn : baseBtn}
                onClick={() => props.onChange("v0")}
                aria-pressed={props.value === "v0"}
                title="Use the v0 Smart-Connect components from cycles B + C"
            >
                v0
            </button>
        </div>
    );
}
