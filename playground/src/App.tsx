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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
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

/** Cycle F — author-picked layout. Where the AI panel sits relative to
 *  the BI canvas. Floating mode (drag-to-position) is a future iteration;
 *  the four split modes cover most needs. */
type LayoutMode = "ai-left" | "ai-right" | "ai-top" | "ai-bottom";
const LAYOUT_MODE_STORAGE_KEY = "pulseplay:layout-mode";

/** Cycle K — how many BI tiles render inside the BI pane. Authors who
 *  want side-by-side comparison (same dashboard with different filters,
 *  or two views from a chained drill-down) pick 2 or 4. v1 ships SHARED
 *  embed config — all tiles render the same source. Per-tile content
 *  (different URL per tile, mixing vendors per tile) is a future cycle. */
type BiTileMode = "1" | "2" | "4";
const BI_TILE_MODE_STORAGE_KEY = "pulseplay:bi-tile-mode";

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

function readInitialLayoutMode(): LayoutMode {
    if (typeof window === "undefined") return "ai-left";
    try {
        const stored = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
        if (stored === "ai-left" || stored === "ai-right" || stored === "ai-top" || stored === "ai-bottom") {
            return stored;
        }
    } catch { /* swallow */ }
    return "ai-left";
}

function readInitialBiTileMode(): BiTileMode {
    if (typeof window === "undefined") return "1";
    try {
        const stored = window.localStorage.getItem(BI_TILE_MODE_STORAGE_KEY);
        if (stored === "1" || stored === "2" || stored === "4") return stored;
    } catch { /* swallow */ }
    return "1";
}

/** Cycle J — layoutMode now controls the PanelGroup direction + which
 *  panel sits first (see `renderSplitLayout` below). The flex-based
 *  layout helpers and hard sidebar caps are gone; the user drags the
 *  divider to size each pane, and the choice persists via PanelGroup's
 *  `autoSaveId`. */

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
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => readInitialLayoutMode());
    const [biTileMode, setBiTileMode] = useState<BiTileMode>(() => readInitialBiTileMode());
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
    const handleLayoutModeChange = useCallback((next: LayoutMode) => {
        setLayoutMode(next);
        try { window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, next); } catch { /* swallow */ }
    }, []);

    // Cycle H — the Display tab inside Pulse's Developer Tools modal writes
    // the same three localStorage keys this component owns and dispatches a
    // `pulseplay:display-change` window event. We listen and sync React
    // state so toggles from the Display tab take effect immediately without
    // a reload.
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string; value?: string }>).detail;
            if (!detail || typeof detail.value !== "string") return;
            if (detail.key === UI_MODE_STORAGE_KEY && (detail.value === "pulse" || detail.value === "v0")) {
                setUiMode(detail.value);
            } else if (detail.key === ENABLED_COMPONENTS_STORAGE_KEY && (detail.value === "aiOnly" || detail.value === "biOnly" || detail.value === "both")) {
                setEnabledComponents(detail.value);
            } else if (detail.key === LAYOUT_MODE_STORAGE_KEY && (detail.value === "ai-left" || detail.value === "ai-right" || detail.value === "ai-top" || detail.value === "ai-bottom")) {
                setLayoutMode(detail.value);
            } else if (detail.key === BI_TILE_MODE_STORAGE_KEY && (detail.value === "1" || detail.value === "2" || detail.value === "4")) {
                setBiTileMode(detail.value);
            }
        };
        window.addEventListener("pulseplay:display-change", handler as EventListener);
        return () => window.removeEventListener("pulseplay:display-change", handler as EventListener);
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
        <div className="pp-app" style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* PulsePlay top bar — full-width header strip. Branding on
              * the left; the connection pill (rendered by Pulse via
              * position: fixed) lands on the right inline with this
              * branding. Replaces the in-AI-pane brand block so the
              * header reads as a single horizontal row across the app. */}
            <header
                className="pp-top-bar"
                style={{
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    background: "transparent",
                }}
            >
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>PulsePlay</h1>
                    <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.7 }}>
                        AI playground · multi-BI host
                    </p>
                </div>
                {/* Right slot — the pill drops in here visually via
                  *  `position: fixed` from inside Pulse. We leave the slot
                  *  empty so when the pill ISN'T mounted (v0 mode, or
                  *  biOnly without Pulse) the bar stays clean. */}
                <div style={{ minWidth: 1 }} aria-hidden="true" />
            </header>
            {/* Floating gear — shown when the pill won't be available:
              * v0 mode (no Pulse), or biOnly mode (Pulse not mounted).
              * Otherwise the pill in the top bar is the single entry. */}
            {(uiMode === "v0" || !aiVisible) && (
                <PulsePlaySettingsGear
                    uiMode={uiMode}
                    onUiModeChange={handleUiModeChange}
                    enabledComponents={enabledComponents}
                    onEnabledComponentsChange={handleEnabledComponentsChange}
                    layoutMode={layoutMode}
                    onLayoutModeChange={handleLayoutModeChange}
                />
            )}
            <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}>
            <SplitLayout
                aiVisible={aiVisible}
                biVisible={biVisible}
                layoutMode={layoutMode}
                aiContent={(
                    <aside className="pp-app__sidebar" style={panelInnerStyle()}>
                        {uiMode === "pulse" ? (
                            <PulseShell
                                renderToken={pulseRenderToken}
                                onSettingsChange={() => setPulseRenderToken(t => t + 1)}
                                biEvents={recentEvents}
                                biVendor={activeVendor}
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
                biContent={(
                    <main className="pp-app__canvas" style={panelInnerStyle()}>
                        {hasEmbedConfig ? (
                            <BITileGrid
                                tileMode={biTileMode}
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
                                            assistant will reason about whatever you load. Drag the divider to
                                            resize either pane; multi-frame BI is coming next.
                                        </p>
                                        {uiMode === "pulse" && (
                                            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
                                                Pulse UI is active in the AI pane. Configure the connection
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
                                            the Display tab to re-enable Pulse / v0.
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
                emptyContent={(
                    <main className="pp-app__canvas">
                        <div className="pp-app__empty">
                            <h2>Both panels hidden</h2>
                            <p>Re-enable AI or BI via the Display tab (open via the connection pill).</p>
                        </div>
                    </main>
                )}
            />
            </div>
        </div>
    );
}

// Cycle J — single resizable layout. When both panels are visible we
// wrap them in a `Group` from `react-resizable-panels` so the author
// can drag the divider to taste; layoutMode controls which side AI is
// on (left/right/top/bottom). When only one panel is visible we render
// it full-canvas without the group, since there's nothing to split.
// `useDefaultLayout` persists the split ratio per orientation in
// localStorage so the author's choice survives reloads.
function SplitLayout(props: {
    aiVisible: boolean;
    biVisible: boolean;
    layoutMode: LayoutMode;
    aiContent: React.ReactNode;
    biContent: React.ReactNode;
    emptyContent: React.ReactNode;
}): React.ReactElement {
    const { aiVisible, biVisible, layoutMode, aiContent, biContent, emptyContent } = props;

    const orientation: "horizontal" | "vertical" =
        layoutMode === "ai-top" || layoutMode === "ai-bottom" ? "vertical" : "horizontal";
    // Persist split ratio per orientation. Switching between row/column
    // layouts gets independent saved sizes so each feels natural.
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: `pulseplay:split:${orientation}`,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });

    if (!aiVisible && !biVisible) return <>{emptyContent}</>;
    if (aiVisible && !biVisible) return <>{aiContent}</>;
    if (!aiVisible && biVisible) return <>{biContent}</>;

    const aiFirst = layoutMode === "ai-left" || layoutMode === "ai-top";
    const aiDefaultSize = orientation === "horizontal" ? 35 : 40;
    const biDefaultSize = 100 - aiDefaultSize;

    const sepStyle: React.CSSProperties = orientation === "horizontal"
        ? { width: 6, background: "transparent", cursor: "col-resize", position: "relative", flexShrink: 0 }
        : { height: 6, background: "transparent", cursor: "row-resize", position: "relative", flexShrink: 0 };
    const sepInnerStyle: React.CSSProperties = orientation === "horizontal"
        ? { position: "absolute", left: 2, top: 0, width: 2, height: "100%", background: "rgba(0,0,0,0.08)" }
        : { position: "absolute", top: 2, left: 0, height: 2, width: "100%", background: "rgba(0,0,0,0.08)" };

    const aiPanel = (
        <Panel defaultSize={`${aiDefaultSize}%`} minSize="15%" id="ai">{aiContent}</Panel>
    );
    const biPanel = (
        <Panel defaultSize={`${biDefaultSize}%`} minSize="15%" id="bi">{biContent}</Panel>
    );
    const separator = (
        <Separator style={sepStyle}>
            <div style={sepInnerStyle} />
        </Separator>
    );

    return (
        <Group
            orientation={orientation}
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            style={{ width: "100%", height: "100%" }}
        >
            {aiFirst ? aiPanel : biPanel}
            {separator}
            {aiFirst ? biPanel : aiPanel}
        </Group>
    );
}

/** Inner styling for a panel's content. Removes the old hard width/height
 *  caps from sidebarStyle since the surrounding Panel now governs size;
 *  we only need the inner element to fill its panel and scroll when
 *  content overflows. */
function panelInnerStyle(): React.CSSProperties {
    return { width: "100%", height: "100%", minHeight: 0, overflow: "auto" };
}

/** Cycle K.1 — multi-tile BI grid. `tileMode` = "1" renders a single
 *  BIPanel filling the canvas (the v0 behaviour, no extra DOM). "2"
 *  renders two side-by-side; "4" renders a 2×2 grid. All tiles share
 *  the same `embedConfig` in K.1 — the value of multi-tile in v1 is
 *  side-by-side comparison of the same source under different
 *  interactions (filter A vs filter B). K.2 will introduce per-tile
 *  configs for genuinely different content per tile. */
function BITileGrid(props: {
    tileMode: BiTileMode;
    vendor: string;
    embedConfig: BIEmbedConfig;
    onEvent: (e: BIEvent) => void;
}): React.ReactElement {
    const { tileMode, vendor, embedConfig, onEvent } = props;
    if (tileMode === "1") {
        return <BIPanel vendor={vendor} embedConfig={embedConfig} onEvent={onEvent} />;
    }
    const tileCount = tileMode === "2" ? 2 : 4;
    const columns = tileMode === "2" ? 2 : 2;
    const rows = tileMode === "2" ? 1 : 2;
    const gridStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gap: 8,
        padding: 8,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
    };
    const tileStyle: React.CSSProperties = {
        minHeight: 0,
        minWidth: 0,
        position: "relative",
        background: "rgba(0,0,0,0.02)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 4,
        overflow: "hidden",
    };
    return (
        <div style={gridStyle}>
            {Array.from({ length: tileCount }, (_, i) => (
                <div key={i} className="pp-bi-tile" style={tileStyle}>
                    {/* Re-mounting each tile with its own key keeps adapters
                     *  independent — a filter applied in one tile doesn't
                     *  trigger a refetch in another, even though both speak
                     *  to the same source. */}
                    <BIPanel
                        key={`tile-${i}`}
                        vendor={vendor}
                        embedConfig={embedConfig}
                        onEvent={onEvent}
                    />
                </div>
            ))}
        </div>
    );
}

/** Cycle F — AI panel position picker. Four split modes (left/right/
 *  top/bottom). Floating + drag-to-reposition is a follow-up. */
function LayoutModeToggle(props: { value: LayoutMode; onChange: (next: LayoutMode) => void }) {
    const baseBtn: React.CSSProperties = {
        padding: "3px 7px",
        fontSize: 10,
        border: "1px solid var(--pp-border, #ccc)",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 3,
        minWidth: 36,
    };
    const activeBtn: React.CSSProperties = {
        ...baseBtn,
        background: "var(--pp-accent, #0078d4)",
        color: "white",
        borderColor: "var(--pp-accent, #0078d4)",
    };
    const modes: { value: LayoutMode; label: string; title: string }[] = [
        { value: "ai-left",   label: "Left",   title: "AI on the left, BI on the right (default)" },
        { value: "ai-right",  label: "Right",  title: "AI on the right, BI on the left" },
        { value: "ai-top",    label: "Top",    title: "AI on top (full width), BI underneath" },
        { value: "ai-bottom", label: "Bottom", title: "BI on top, AI on the bottom" },
    ];
    return (
        <div role="group" aria-label="AI panel position" style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>
            {modes.map(m => (
                <button
                    key={m.value}
                    type="button"
                    style={props.value === m.value ? activeBtn : baseBtn}
                    onClick={() => props.onChange(m.value)}
                    aria-pressed={props.value === m.value}
                    title={m.title}
                >
                    {m.label}
                </button>
            ))}
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

/** Floating gear in the viewport corner. Click to open a popover with
 *  the PulsePlay-level toggles (Pulse/v0 + AI/BI/Both). Click-outside
 *  or Escape closes it. Lives outside the sidebar so it stays visible
 *  in every layout mode — including biOnly (no sidebar) and aiOnly
 *  (full-width Pulse panel). */
function PulsePlaySettingsGear(props: {
    uiMode: UiMode;
    onUiModeChange: (next: UiMode) => void;
    enabledComponents: EnabledComponents;
    onEnabledComponentsChange: (next: EnabledComponents) => void;
    layoutMode: LayoutMode;
    onLayoutModeChange: (next: LayoutMode) => void;
}) {
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement | null>(null);

    // Click-outside + Escape to close.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div
            ref={popoverRef}
            style={{
                position: "fixed",
                top: 12,
                right: 12,
                zIndex: 1000,
            }}
        >
            <button
                type="button"
                aria-label="PulsePlay settings"
                aria-expanded={open}
                title="PulsePlay display settings"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "1px solid var(--pp-border, #ccc)",
                    background: open ? "var(--pp-accent, #0078d4)" : "rgba(255,255,255,0.92)",
                    color: open ? "white" : "inherit",
                    cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    padding: 0,
                }}
            >
                ⚙
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label="PulsePlay display settings"
                    style={{
                        position: "absolute",
                        top: 40,
                        right: 0,
                        minWidth: 220,
                        background: "white",
                        border: "1px solid var(--pp-border, #ccc)",
                        borderRadius: 6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        fontSize: 12,
                    }}
                >
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>UI</div>
                        <UiModeToggle value={props.uiMode} onChange={props.onUiModeChange} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Panels visible</div>
                        <EnabledComponentsToggle value={props.enabledComponents} onChange={props.onEnabledComponentsChange} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>AI position</div>
                        <LayoutModeToggle value={props.layoutMode} onChange={props.onLayoutModeChange} />
                    </div>
                    <p style={{ margin: 0, fontSize: 10, opacity: 0.6, lineHeight: 1.4 }}>
                        These outer-layout settings will move into Pulse's Setup tab in a future cycle.
                    </p>
                </div>
            )}
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
