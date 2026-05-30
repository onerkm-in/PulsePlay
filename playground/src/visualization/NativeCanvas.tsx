// playground/src/visualization/NativeCanvas.tsx
//
// G4 — Native canvas + ECharts MVP.
//
// What this module owns
// ─────────────────────
//   • The React canvas that renders attested AI result envelopes into
//     one of five viz states: empty / text / table / kpi / chart.
//   • The "ungoverned-result-preview" badge overlay (dev/mock mode).
//   • The "blocked" render state (production + missing/invalid governance).
//   • A `mountNativeCanvas` helper the `.ts` adapter calls to mount this
//     React component without importing React itself.
//
// What this module does NOT own
// ─────────────────────────────
//   • Adapter lifecycle (mount/destroy plumbing) — `NativeBIAdapter.ts`.
//   • Chart-pick policy — `playground/src/visualization/chartAutoPick.ts`.
//   • Result-shape decisions — `playground/src/visualization/resultToVizIntent.ts`.
//   • Governance enforcement — handled in the adapter; the canvas just
//     renders whatever mode + state the adapter passes via props.
//   • Data fetching, SQL, vendor SDKs — renderer-only.
//
// Layering
// ────────
// This file is the only Native renderer module that imports React +
// ECharts. The `bi-adapters/native/*.ts` adapter files stay free of
// direct React/ECharts imports; they delegate to the typed mount helper
// exported here.
//
// Pulse PBI copy-port note
// ────────────────────────
// This file is NOT copy-port safe: it uses React 19, react-dom/client,
// and ECharts. Pulse PBI runs in a Power BI custom visual sandbox with
// different constraints (no native React 19 root, no fetch). Use the
// PURE contracts in `playground/src/visualization/` from Pulse PBI; do
// not import this file from the sibling project.

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CanvasGrid } from "./CanvasGrid";
import { canvasTileCount, CANVAS_TILES_EVENT } from "../lib/canvasTiles";
import { flushSync } from "react-dom";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import {
    isAIResultEnvelope,
    type AIResultEnvelope,
} from "./aiResultEnvelope";
import {
    resultToVizIntent,
    type VizIntent,
} from "./resultToVizIntent";
import {
    chartAutoPick,
    type ChartKind,
    type DataShape,
} from "./chartAutoPick";
import { ChartRationalePill } from "./ChartRationalePill";
import { validateChartRenderSpec, type ChartRenderSpec } from "./chartSpecValidation";
import { compileVegaLiteToECharts } from "../lib/vegaLiteToECharts";
import { sourceRefDisplayLabel } from "./sourceRef";

// Register only the chart types + components G4 actually surfaces.
// Adding a new chart kind means registering its module here AND
// extending `buildEChartsOption` below. Keeping this list tight means
// the bundle stays small for deployments that never render the more
// exotic chart types.
echarts.use([
    BarChart,
    HeatmapChart,
    LineChart,
    PieChart,
    ScatterChart,
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    CanvasRenderer,
]);

// ─── Props contract ───────────────────────────────────────────────────────

/** High-level display mode the adapter wants the canvas to show.
 *  Maps 1:1 to `NativeBIAdapter` renderStatus so adapter telemetry and
 *  canvas DOM state never disagree. */
export type NativeCanvasMode =
    | "empty"
    | "result-accepted"
    | "ungoverned-result-preview"
    | "result-blocked"
    | "spec-accepted";

export type NativeCanvasGovernanceState =
    | { state: "not-applicable" }
    | { state: "enforced"; authority: string; requestId: string }
    | { state: "preview"; reason: "no-governance-attestation" }
    | { state: "blocked"; reason: "no-governance-attestation" };

export interface NativeCanvasProps {
    /** Explicit display mode. Set by the adapter based on the last
     *  command + governance check. Canvas trusts this — it does not
     *  re-derive mode from envelope shape. */
    readonly mode: NativeCanvasMode;
    /** Last AI result the adapter accepted. Only consulted for
     *  `result-accepted` and `ungoverned-result-preview` modes. For
     *  `blocked` / `spec-accepted` / `empty`, the canvas ignores it. */
    readonly envelope?: unknown;
    /** Last chart spec the adapter accepted. Only consulted for
     *  `spec-accepted` mode. Specs are still validated before render. */
    readonly spec?: unknown;
    /** Governance state the adapter resolved. Drives the
     *  `data-native-governance` attribute and the preview badge.
     *  The canvas trusts the adapter — it does not re-validate. */
    readonly governanceState: NativeCanvasGovernanceState;
    /** Optional theme token forwarded to `data-native-theme` so CSS
     *  can react. The canvas does not interpret theme values. */
    readonly theme?: string | null;
}

// ─── Public mount helper (the only API the adapter needs) ──────────────────

export interface NativeCanvasHandle {
    /** Replace the current props and re-render. Idempotent. */
    update(next: NativeCanvasProps): void;
    /** Tear down the React root. Idempotent. */
    unmount(): void;
}

export function mountNativeCanvas(
    container: HTMLElement,
    initial: NativeCanvasProps,
): NativeCanvasHandle {
    const root: Root = createRoot(container);
    let current = initial;
    // Wrap render in flushSync so React 19's concurrent commit phase
    // completes before the call returns. Without this, the BI adapter's
    // synchronous tests + telemetry observers would see an empty
    // container right after mount/update — render would complete on a
    // later microtask. flushSync is the supported way to force a sync
    // commit in test + DOM-introspection scenarios.
    const render = (): void => {
        flushSync(() => { root.render(<NativeCanvas {...current} />); });
    };
    render();
    let unmounted = false;
    return {
        update(next) {
            if (unmounted) return;
            current = next;
            render();
        },
        unmount() {
            if (unmounted) return;
            unmounted = true;
            // React 19's createRoot.unmount is synchronous; safe to call
            // immediately. Wrap in try/catch so a thrown error during
            // unmount cannot break the adapter's destroy() lifecycle.
            try { root.unmount(); } catch { /* swallow */ }
        },
    };
}

// ─── Top-level component ──────────────────────────────────────────────────

export function NativeCanvas(props: NativeCanvasProps): React.ReactElement {
    const { mode, envelope, governanceState, theme } = props;
    const govAttr = governanceAttribute(governanceState);

    // Pin-to-canvas — when the user has pinned tiles, the saved canvas IS the
    // Dashboard content. Subscribe so the grid appears/clears live as tiles are
    // pinned/removed (NativeCanvas otherwise only re-renders on prop updates).
    const [tileCount, setTileCount] = useState<number>(() => canvasTileCount());
    useEffect(() => {
        const refresh = () => setTileCount(canvasTileCount());
        window.addEventListener(CANVAS_TILES_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(CANVAS_TILES_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
    if (tileCount > 0) {
        return renderRootSection({
            statusKey: "canvas",
            governanceAttribute: govAttr,
            theme,
            children: <CanvasGrid />,
        });
    }

    // Mode dispatch. Each branch picks a body + the data-native-bi-status
    // attribute value. The adapter's renderStatus already matches these
    // mode names, so the DOM attribute and adapter telemetry stay in sync.
    if (mode === "result-blocked") {
        return renderRootSection({
            statusKey: "result-blocked",
            governanceAttribute: govAttr,
            theme,
            children: <BlockedState />,
        });
    }

    if (mode === "spec-accepted") {
        return renderRootSection({
            statusKey: "spec-accepted",
            governanceAttribute: govAttr,
            theme,
            children: <SpecState spec={props.spec} />,
        });
    }

    if (mode === "empty") {
        return renderRootSection({
            statusKey: "empty",
            governanceAttribute: govAttr,
            theme,
            children: <EmptyState />,
        });
    }

    // result-accepted or ungoverned-result-preview from here on.
    const isPreview = mode === "ungoverned-result-preview";
    const renderedBody = renderEnvelopeBody(envelope);

    // G6 fusion-lite: when the envelope carries BOTH chart-renderable
    // rows AND a narrative answer, dock the body alongside a commentary
    // card bound by `envelope.id`. The chart half stays exactly the
    // same component used in non-fusion mode — fusion is purely a
    // layout wrapper. Future cycles can split structured insights into
    // multiple cards; G6 ships the single-card MVP.
    const fusionCommentary = isAIResultEnvelope(envelope)
        ? buildFusionCommentary(envelope, renderedBody.intent, governanceState)
        : null;

    return renderRootSection({
        statusKey: mode,
        governanceAttribute: govAttr,
        theme,
        children: (
            <>
                {fusionCommentary
                    ? (
                        <FusionLayout
                            resultId={fusionCommentary.resultId}
                            chart={renderedBody.element}
                            commentary={fusionCommentary}
                        />
                    )
                    : renderedBody.element}
                {isPreview && <PreviewBadge />}
            </>
        ),
    });
}

interface RenderedEnvelopeBody {
    readonly element: React.ReactElement;
    readonly intent: "empty" | "text" | "table" | "kpi" | "chart" | "fallback";
}

function renderEnvelopeBody(envelope: unknown): RenderedEnvelopeBody {
    // Adapter may pass a partially-shaped result through (e.g., the
    // existing G3 tests use `{ rows: [] }` which is not a valid
    // AIResultEnvelope but is a legitimate "accepted" message). Fall
    // back to AcceptedFallback so the user gets the "AI result accepted"
    // signal even when there is nothing renderable.
    if (!isAIResultEnvelope(envelope)) {
        return { element: <AcceptedFallback />, intent: "fallback" };
    }
    const intent = resultToVizIntent(envelope);
    switch (intent.kind) {
        case "empty": return { element: <AcceptedFallback />, intent: "empty" };
        case "text":  return { element: <TextState answer={envelope.answer ?? ""} />, intent: "text" };
        case "table": return { element: <TableState envelope={envelope} />, intent: "table" };
        case "kpi":   return { element: <KpiState envelope={envelope} />, intent: "kpi" };
        case "chart": return { element: <ChartState envelope={envelope} intent={intent} />, intent: "chart" };
    }
}

// ─── Fusion-lite (G6) ─────────────────────────────────────────────────────

/** Decision: should this envelope render in fusion-lite layout?
 *  Yes when ALL three hold:
 *    - The envelope rendered as a chart, KPI, or table (it has data
 *      worth pairing commentary with). Pure text/empty intents already
 *      surface the answer in their own body, so docking would duplicate.
 *    - The envelope carries a non-empty `answer` narrative.
 *    - Governance state is enforced or preview (NOT blocked) — blocked
 *      renders BlockedState only, never fusion.
 *  Returns the commentary payload + the result id binding, or null. */
interface FusionCommentaryPayload {
    readonly resultId: string;
    readonly answer: string;
    readonly sourceRefLabel: string | null;
    readonly governanceAuthority: string | null;
    readonly isPreview: boolean;
}

function buildFusionCommentary(
    envelope: AIResultEnvelope,
    bodyIntent: RenderedEnvelopeBody["intent"],
    governanceState: NativeCanvasGovernanceState,
): FusionCommentaryPayload | null {
    if (bodyIntent !== "chart" && bodyIntent !== "kpi" && bodyIntent !== "table") return null;
    const answer = typeof envelope.answer === "string" ? envelope.answer.trim() : "";
    if (!answer) return null;
    if (governanceState.state === "blocked") return null;
    const sourceRefLabel = envelope.sourceRef ? sourceRefDisplayLabel(envelope.sourceRef) : null;
    const governanceAuthority = governanceState.state === "enforced"
        ? governanceState.authority
        : null;
    return {
        resultId: envelope.id,
        answer,
        sourceRefLabel,
        governanceAuthority,
        isPreview: governanceState.state === "preview",
    };
}

/** Side-by-side wrapper that binds chart + commentary by `data-result-id`.
 *  Stacks vertically below ~720px (responsive without media queries by
 *  using flex-wrap). Chart half grows; commentary card has a max width
 *  so it doesn't dominate on very wide viewports. */
function FusionLayout({
    resultId,
    chart,
    commentary,
}: {
    resultId: string;
    chart: React.ReactElement;
    commentary: FusionCommentaryPayload;
}): React.ReactElement {
    return (
        <div
            className="pp-native-bi__fusion"
            data-testid="pp-native-bi-fusion"
            data-result-id={resultId}
            style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 16,
                width: "100%",
                height: "100%",
                alignItems: "stretch",
            }}
        >
            <div
                className="pp-native-bi__fusion-chart"
                data-result-id={resultId}
                style={{
                    flex: "1 1 380px",
                    minWidth: 280,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {chart}
            </div>
            <FusionCommentaryCard commentary={commentary} />
        </div>
    );
}

/** Single commentary card. Shows envelope.answer prominently, plus
 *  optional sourceRef display label and governance authority chip.
 *  Bound to the chart by `data-result-id` so future hover/highlight
 *  code can sync the two halves. */
function FusionCommentaryCard({
    commentary,
}: {
    commentary: FusionCommentaryPayload;
}): React.ReactElement {
    return (
        <aside
            className="pp-native-bi__fusion-card"
            data-testid="pp-native-bi-fusion-card"
            data-result-id={commentary.resultId}
            role="complementary"
            aria-label="AI commentary"
            style={{
                flex: "0 1 320px",
                minWidth: 240,
                maxWidth: 380,
                padding: "12px 14px",
                background: "var(--pp-surface-subtle, rgba(15,23,42,0.04))",
                border: "1px solid var(--pp-border-subtle, rgba(15,23,42,0.08))",
                borderRadius: 6,
                color: "var(--pp-text, #0f172a)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
            }}
        >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <strong style={{ fontSize: 13, color: "var(--pp-text, #0f172a)" }}>
                    AI commentary
                </strong>
                {commentary.governanceAuthority && (
                    <span
                        data-testid="pp-native-bi-fusion-card-authority"
                        style={{
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            borderRadius: 3,
                            background: "rgba(34, 197, 94, 0.12)",
                            color: "rgba(21, 128, 61, 0.95)",
                        }}
                    >
                        {commentary.governanceAuthority}
                    </span>
                )}
                {commentary.isPreview && (
                    <span
                        data-testid="pp-native-bi-fusion-card-preview"
                        style={{
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            borderRadius: 3,
                            background: "rgba(202, 138, 4, 0.18)",
                            color: "rgba(146, 64, 14, 0.95)",
                        }}
                    >
                        DEV preview
                    </span>
                )}
            </div>
            <p
                style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "var(--pp-text, #0f172a)",
                }}
                data-testid="pp-native-bi-fusion-card-answer"
            >
                {commentary.answer}
            </p>
            {commentary.sourceRefLabel && (
                <p
                    style={{
                        margin: 0,
                        fontSize: 11,
                        color: "var(--pp-text-muted, #475569)",
                    }}
                    data-testid="pp-native-bi-fusion-card-source"
                >
                    Source: {commentary.sourceRefLabel}
                </p>
            )}
        </aside>
    );
}

// ─── Root section wrapper — owns the stable selectors existing tests use ──

interface RootSectionProps {
    readonly statusKey: string;
    readonly governanceAttribute: string | null;
    readonly theme?: string | null;
    readonly children: React.ReactNode;
}

function renderRootSection(props: RootSectionProps): React.ReactElement {
    return (
        <section
            className="pp-native-bi"
            data-native-bi-adapter="true"
            data-native-bi-status={props.statusKey}
            data-native-governance={props.governanceAttribute ?? undefined}
            data-native-theme={props.theme ?? undefined}
            role="region"
            aria-label="Native result canvas"
            style={{
                width: "100%",
                height: "100%",
                display: "grid",
                placeItems: "stretch",
                padding: "24px",
                boxSizing: "border-box",
                position: "relative",
            }}
        >
            {props.children}
        </section>
    );
}

function governanceAttribute(state: NativeCanvasGovernanceState): string | null {
    if (state.state === "not-applicable") return null;
    return state.state;
}

// ─── Empty / Text / Blocked / Preview / Spec states ───────────────────────

function EmptyState(): React.ReactElement {
    // 2026-05-25 — copy revised after the per-tab-visibility ship made
    // it clear the prior wording ("Ask Pulse a question to render the AI
    // result here") read as orphan cross-tab context on the Dashboard
    // tab. The Native canvas IS specifically the AI-result rendering
    // surface (not a real BI vendor like Power BI/Tableau); the new
    // copy spells out the cross-tab relationship explicitly + names
    // the originating tab so the user knows exactly where to go.
    return (
        <div className="pp-native-bi__empty" style={emptyMessageStyle}>
            <strong style={titleStyle}>Pulse Canvas</strong>
            <span data-native-bi-status="empty">
                Ask Pulse can render governed charts, tables, KPIs, and narratives here. Embedded BI reports use the same Dashboard tab when connected.
            </span>
        </div>
    );
}

function BlockedState(): React.ReactElement {
    return (
        <div className="pp-native-bi__blocked" style={emptyMessageStyle} role="alert">
            <strong style={titleStyle}>Render blocked</strong>
            <span data-native-bi-status="result-blocked">
                Governance attestation missing or invalid. Native render blocked.
            </span>
        </div>
    );
}

function SpecState({ spec }: { spec?: unknown }): React.ReactElement {
    const validation = validateChartRenderSpec(spec);
    if (!validation.ok) {
        return <SpecUnsupportedState message={validation.errors[0]?.message ?? "Invalid chart render spec."} />;
    }

    const compiled = compileVegaLiteToECharts(validation.spec);
    if (!compiled.ok || !compiled.option) {
        return <SpecUnsupportedState message={compiled.reason ?? "Spec could not be compiled for ECharts."} />;
    }

    return <SpecChartState spec={validation.spec} option={compiled.option} />;
}

function SpecUnsupportedState({ message }: { message: string }): React.ReactElement {
    return (
        <div className="pp-native-bi__spec pp-native-bi__spec--unsupported" style={emptyMessageStyle} role="alert">
            <strong style={titleStyle}>Chart spec could not be rendered.</strong>
            <span data-native-bi-status="spec-accepted">
                {message}
            </span>
        </div>
    );
}

function SpecChartState({
    spec,
    option,
}: {
    spec: ChartRenderSpec;
    option: EChartsOption;
}): React.ReactElement {
    const mark = typeof spec.mark === "string" ? spec.mark : spec.mark.type;
    return (
        <div className="pp-native-bi__spec" style={{ width: "100%", height: "100%" }}>
            <strong style={{ ...titleStyle, marginBottom: "4px" }}>Pulse chart</strong>
            <EChartsOptionView
                option={option}
                chartKind={spec.chartType ?? mark}
                testId="pp-native-bi-spec-chart"
            />
        </div>
    );
}

function AcceptedFallback(): React.ReactElement {
    // Used when the adapter accepted a result whose envelope shape is
    // not renderable (no rows, malformed schema, etc.).
    return (
        <div className="pp-native-bi__accepted" style={textBlockStyle}>
            <strong style={titleStyle}>Pulse artifact received</strong>
            <p style={mutedParagraphStyle}>(no renderable rows)</p>
        </div>
    );
}

function PreviewBadge(): React.ReactElement {
    // Visible signal that this render is ungoverned. Tests assert the
    // literal text. Intentionally obtrusive — authors must not get
    // used to ignoring it.
    return (
        <div
            className="pp-native-bi__preview-badge"
            role="note"
            style={previewBadgeStyle}
        >
            DEV ONLY · Ungoverned result preview
        </div>
    );
}

function TextState({ answer }: { answer: string }): React.ReactElement {
    return (
        <div className="pp-native-bi__text" style={textBlockStyle}>
            <strong style={titleStyle}>Pulse narrative</strong>
            <p style={{ marginTop: "8px", whiteSpace: "pre-wrap", color: "var(--pp-text, #0f172a)" }}>
                {answer || "(no answer text)"}
            </p>
        </div>
    );
}

// ─── Table state ──────────────────────────────────────────────────────────

function TableState({ envelope }: { envelope: AIResultEnvelope }): React.ReactElement {
    const schema = envelope.schema ?? [];
    const rows = envelope.rows ?? [];
    // Cap rendered rows at 100 to keep DOM cost bounded for MVP. Larger
    // result sets should paginate or downsample in a later cycle.
    const CAP = 100;
    const visibleRows = rows.slice(0, CAP);
    return (
        <div className="pp-native-bi__table" style={{ width: "100%", overflow: "auto" }}>
            <strong style={titleStyle}>Pulse table</strong>
            <table
                style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px", fontSize: "13px" }}
                data-testid="pp-native-bi-table"
            >
                <thead>
                    <tr>
                        {schema.map((col) => (
                            <th
                                key={col.name}
                                style={{
                                    textAlign: "left",
                                    padding: "6px 8px",
                                    borderBottom: "1px solid var(--pp-border, rgba(15,23,42,0.12))",
                                    color: "var(--pp-text-muted, #475569)",
                                    fontWeight: 600,
                                }}
                            >
                                {col.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {visibleRows.map((row, ri) => (
                        <tr key={ri}>
                            {schema.map((col, ci) => (
                                <td
                                    key={col.name}
                                    style={{
                                        padding: "6px 8px",
                                        borderBottom: "1px solid var(--pp-border-subtle, rgba(15,23,42,0.06))",
                                        color: "var(--pp-text, #0f172a)",
                                    }}
                                >
                                    {formatCell(row[ci])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > CAP && (
                <p style={mutedParagraphStyle}>Showing first {CAP} of {rows.length} rows.</p>
            )}
        </div>
    );
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") {
        return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : String(value);
    }
    return String(value);
}

// ─── KPI state ────────────────────────────────────────────────────────────

function KpiState({ envelope }: { envelope: AIResultEnvelope }): React.ReactElement {
    const schema = envelope.schema ?? [];
    const rows = envelope.rows ?? [];
    // KPI intent guarantees rowCount === 1 and exactly one numeric column.
    // Find the first numeric cell + its column label.
    const numericIndex = schema.findIndex((_, i) => {
        const cell = rows[0]?.[i];
        return typeof cell === "number"
            || (typeof cell === "string" && cell.trim() !== "" && !Number.isNaN(Number(cell.trim())));
    });
    const idx = numericIndex >= 0 ? numericIndex : 0;
    const label = schema[idx]?.name ?? "Value";
    const rawCell = rows[0]?.[idx];
    const numericValue = typeof rawCell === "number"
        ? rawCell
        : typeof rawCell === "string"
            ? Number(rawCell)
            : NaN;
    const formatted = Number.isFinite(numericValue)
        ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numericValue)
        : String(rawCell ?? "—");
    return (
        <div
            className="pp-native-bi__kpi"
            data-testid="pp-native-bi-kpi"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "12px",
            }}
        >
            <strong style={titleStyle}>Pulse KPI</strong>
            <span
                style={{
                    fontSize: "13px",
                    color: "var(--pp-text-muted, #475569)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                }}
            >
                {label}
            </span>
            <strong
                style={{
                    fontSize: "40px",
                    color: "var(--pp-text, #0f172a)",
                    fontWeight: 700,
                    lineHeight: 1.1,
                }}
                data-testid="pp-native-bi-kpi-value"
            >
                {formatted}
            </strong>
        </div>
    );
}

// ─── Chart state ──────────────────────────────────────────────────────────

function ChartState({
    envelope,
    intent,
}: {
    envelope: AIResultEnvelope;
    intent: VizIntent;
}): React.ReactElement {
    // Memo the option so changing only `theme` higher up does not retrigger
    // chart init. Adapter swaps envelope on real updates.
    const { option, pickedKind, columns, rows } = useMemo(() => {
        const cols = (envelope.schema ?? []).map(c => c.name);
        const rs = envelope.rows ?? [];
        const ap = chartAutoPick(cols, rs);
        const kind: ChartKind = intent.chartType ?? ap.chartType;
        return {
            option: buildEChartsOption(kind, ap.dataShape),
            pickedKind: kind,
            columns: cols,
            rows: rs,
        };
    }, [envelope, intent]);

    return (
        <div className="pp-native-bi__chart-wrap" style={{ width: "100%", height: "100%", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <strong style={titleStyle}>Pulse chart</strong>
                <ChartRationalePill
                    columns={columns}
                    rows={rows}
                    pickedKind={pickedKind}
                />
            </div>
            <EChartsOptionView
                option={option}
                chartKind={pickedKind}
                testId="pp-native-bi-chart"
            />
        </div>
    );
}

function EChartsOptionView({
    option,
    chartKind,
    testId,
}: {
    option: EChartsOption;
    chartKind: string;
    testId: string;
}): React.ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<echarts.ECharts | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const instance = echarts.init(el);
        instanceRef.current = instance;
        instance.setOption(option, { notMerge: true });

        const ro = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => instance.resize())
            : null;
        ro?.observe(el);

        return () => {
            ro?.disconnect();
            try { instance.dispose(); } catch { /* swallow */ }
            instanceRef.current = null;
        };
    }, [option]);

    return (
        <div
            ref={containerRef}
            className="pp-native-bi__chart"
            data-testid={testId}
            data-chart-kind={chartKind}
            style={{ width: "100%", height: "100%", minHeight: 240 }}
        />
    );
}

// ─── ECharts option builders ─────────────────────────────────────────────

/** Build a minimal ECharts option for the chosen chart kind. MVP scope:
 *  bar / column / clustered-bar / line / area / pie / donut. Unsupported
 *  kinds fall back to bar so the canvas always renders SOMETHING for an
 *  attested result rather than going blank. */
function buildEChartsOption(kind: ChartKind, shape: DataShape): EChartsOption {
    switch (kind) {
        case "line":
        case "area":
            return lineOption(shape, kind === "area");
        case "pie":
            return pieOption(shape, false);
        case "donut":
            return pieOption(shape, true);
        case "clustered-bar":
            return clusteredBarOption(shape);
        case "column":
            return barOption(shape, false);
        case "bar":
        default:
            return barOption(shape, true);
    }
}

function barOption(shape: DataShape, horizontal: boolean): EChartsOption {
    return {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: 48, right: 16, top: 24, bottom: 36, containLabel: true },
        xAxis: horizontal
            ? { type: "value" }
            : { type: "category", data: shape.series.map(p => p.label) },
        yAxis: horizontal
            ? { type: "category", data: shape.series.map(p => p.label) }
            : { type: "value" },
        series: [
            {
                type: "bar",
                data: shape.series.map(p => p.value),
            },
        ],
    };
}

function lineOption(shape: DataShape, area: boolean): EChartsOption {
    return {
        tooltip: { trigger: "axis" },
        grid: { left: 48, right: 16, top: 24, bottom: 36, containLabel: true },
        xAxis: { type: "category", data: shape.series.map(p => p.label) },
        yAxis: { type: "value" },
        series: [
            {
                type: "line",
                data: shape.series.map(p => p.value),
                smooth: true,
                ...(area ? { areaStyle: {} } : {}),
            },
        ],
    };
}

function pieOption(shape: DataShape, donut: boolean): EChartsOption {
    return {
        tooltip: { trigger: "item" },
        legend: { bottom: 0, type: "scroll" },
        series: [
            {
                type: "pie",
                radius: donut ? ["45%", "70%"] : "65%",
                data: shape.series.map(p => ({ name: p.label, value: p.value })),
                avoidLabelOverlap: true,
            },
        ],
    };
}

function clusteredBarOption(shape: DataShape): EChartsOption {
    if (shape.clustered.length === 0) return barOption(shape, false);
    const seriesNames = shape.clustered[0].values.map(v => v.name);
    return {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        legend: { bottom: 0, type: "scroll" },
        grid: { left: 48, right: 16, top: 24, bottom: 48, containLabel: true },
        xAxis: { type: "category", data: shape.clustered.map(c => c.label) },
        yAxis: { type: "value" },
        series: seriesNames.map((seriesName) => ({
            name: seriesName,
            type: "bar",
            data: shape.clustered.map(c => {
                const match = c.values.find(v => v.name === seriesName);
                return match?.value ?? 0;
            }),
        })),
    };
}

// ─── Local styles (inline so the canvas works without a CSS bundle) ──────

// 2026-05-26 — was alignSelf: "center" which dropped the "AI chart
// canvas" empty-state copy in the vertical middle of the (tall) grid
// parent, with ~500px of dead space above and below. Anchor to the top
// of the grid so the empty-state message reads immediately under the
// tab strip, matching the Ask Pulse + AI Insights top-anchor fixes.
const emptyMessageStyle: React.CSSProperties = {
    maxWidth: 460,
    textAlign: "center",
    color: "var(--pp-text-muted, #475569)",
    alignSelf: "start",
    justifySelf: "center",
    marginTop: 56,
};

const titleStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    color: "var(--pp-text, #0f172a)",
};

const textBlockStyle: React.CSSProperties = {
    maxWidth: 760,
    margin: "0 auto",
    padding: "12px",
};

const mutedParagraphStyle: React.CSSProperties = {
    marginTop: "6px",
    fontSize: "12px",
    color: "var(--pp-text-muted, #475569)",
};

const previewBadgeStyle: React.CSSProperties = {
    position: "absolute",
    top: 12,
    right: 12,
    padding: "6px 10px",
    background: "rgba(202, 138, 4, 0.95)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    borderRadius: 4,
    textTransform: "uppercase",
    zIndex: 2,
    pointerEvents: "none",
};
