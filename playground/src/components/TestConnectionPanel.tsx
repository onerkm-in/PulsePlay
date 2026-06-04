// playground/src/components/TestConnectionPanel.tsx
//
// Smart Connect — Step 1 UI. Renders the result of a connector-agnostic
// probe in three sections (status, metadata snapshot, inference) per
// docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md.
//
// Connector-neutral by design: every label / status hint reads "connector"
// and "profile" — no Genie / OpenAI / Bedrock vocabulary leaks here. When
// metadata is sparse, fields gracefully say "not exposed by this connector"
// instead of going blank.

import { useEffect, useRef, useState } from "react";
import { probeConnector } from "../lib/probeClient";
import type {
    ConnectorProbeResult,
    ProbeMetadataAvailability,
} from "../types/probe";

export interface TestConnectionPanelProps {
    profile: string;
    onProbeComplete?: (result: ConnectorProbeResult) => void;
    /** Default true — runs probe on mount and whenever `profile` changes. */
    autoRun?: boolean;
}

type PanelState =
    | { kind: "idle" }
    | { kind: "loading"; startedAt: number }
    | { kind: "success"; result: ConnectorProbeResult }
    | { kind: "error"; message: string };

const NOT_EXPOSED = "not exposed by this connector";

export function TestConnectionPanel(props: TestConnectionPanelProps) {
    const autoRun = props.autoRun ?? true;
    const [state, setState] = useState<PanelState>({ kind: "idle" });
    const [elapsedMs, setElapsedMs] = useState(0);
    const [showBecause, setShowBecause] = useState(false);
    const onProbeCompleteRef = useRef(props.onProbeComplete);
    onProbeCompleteRef.current = props.onProbeComplete;

    const runProbe = async (profile: string) => {
        if (!profile) {
            setState({ kind: "error", message: "No connector profile selected." });
            return;
        }
        setShowBecause(false);
        setState({ kind: "loading", startedAt: Date.now() });
        setElapsedMs(0);
        try {
            const result = await probeConnector(profile);
            setState({ kind: "success", result });
            onProbeCompleteRef.current?.(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setState({ kind: "error", message });
        }
    };

    // Auto-run on mount and when `profile` changes (if autoRun).
    useEffect(() => {
        if (!autoRun) return;
        void runProbe(props.profile);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.profile, autoRun]);

    // Tick the elapsed-time counter while loading.
    useEffect(() => {
        if (state.kind !== "loading") return;
        const startedAt = state.startedAt;
        const id = window.setInterval(() => {
            setElapsedMs(Date.now() - startedAt);
        }, 100);
        return () => window.clearInterval(id);
    }, [state]);

    return (
        <section className="pp-test-connection">
            <header className="pp-test-connection__header">
                <h2 className="pp-test-connection__title">Test Connection</h2>
                <button
                    type="button"
                    className="pp-test-connection__rerun"
                    onClick={() => runProbe(props.profile)}
                    disabled={state.kind === "loading"}
                >
                    {state.kind === "loading" ? "Running..." : "Re-run"}
                </button>
            </header>

            {state.kind === "idle" && (
                <div className="pp-test-connection__idle">
                    Click Re-run to probe the connector.
                </div>
            )}

            {state.kind === "loading" && (
                <div className="pp-test-connection__loading">
                    Probing <strong>{props.profile || "(no profile)"}</strong>... ({formatSeconds(elapsedMs)})
                </div>
            )}

            {state.kind === "error" && (
                <div className="pp-test-connection__error" role="alert">
                    <div className="pp-test-connection__status pp-test-connection__status--error">
                        <span aria-hidden="true">{statusIcon("error")}</span>
                        <span>Connection failed</span>
                    </div>
                    <p className="pp-test-connection__error-message">{state.message}</p>
                    <button
                        type="button"
                        className="pp-test-connection__retry"
                        onClick={() => runProbe(props.profile)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {state.kind === "success" && (
                <SuccessView
                    result={state.result}
                    showBecause={showBecause}
                    onToggleBecause={() => setShowBecause(s => !s)}
                />
            )}
        </section>
    );
}

interface SuccessViewProps {
    result: ConnectorProbeResult;
    showBecause: boolean;
    onToggleBecause: () => void;
}

function SuccessView(props: SuccessViewProps) {
    const r = props.result;
    const availability = r.metadataAvailability;
    const statusKind = statusKindForAvailability(availability);
    const warnings = r.warnings ?? [];

    return (
        <div className="pp-test-connection__success">
            {/* ── Section 1: Connection status ──────────────────────── */}
            <div className={`pp-test-connection__status pp-test-connection__status--${statusKind}`}>
                <span aria-hidden="true">{statusIcon(statusKind)}</span>
                <span>{statusHeadline(availability, r.probeDurationMs)}</span>
            </div>
            <dl className="pp-test-connection__identity">
                <div className="pp-test-connection__row">
                    <dt>Connector type</dt>
                    <dd>{r.connectorType}</dd>
                </div>
                <div className="pp-test-connection__row">
                    <dt>Profile</dt>
                    <dd>{r.profile}</dd>
                </div>
                {r.displayName && (
                    <div className="pp-test-connection__row">
                        <dt>Display name</dt>
                        <dd>{r.displayName}</dd>
                    </div>
                )}
            </dl>
            {warnings.length > 0 && (
                <ul className="pp-test-connection__warnings">
                    {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            )}

            {/* ── Section 2: Metadata snapshot ──────────────────────── */}
            {/* UX-ARCH-0B.2 Phase F follow-up 2026-05-23 — rows that the
                connector does not expose are now collapsed into a single
                "Not exposed:" line at the bottom instead of taking one
                full row each (Schema / Declared KPIs / Sample questions
                were three separate "not exposed" rows = wasted vertical
                space when the connector simply doesn't surface metadata,
                which is the common case for Genie / Foundation Model). */}
            <h3 className="pp-test-connection__section-title">Metadata snapshot</h3>
            <dl className="pp-test-connection__snapshot">
                {(() => {
                    const rows: React.ReactNode[] = [];
                    const notExposed: string[] = [];
                    const desc = r.description?.trim();
                    if (desc) {
                        rows.push(
                            <div key="description" className="pp-test-connection__row">
                                <dt>Description</dt>
                                <dd>{desc}</dd>
                            </div>
                        );
                    } else {
                        notExposed.push("Description");
                    }
                    if (r.purpose) {
                        rows.push(
                            <div key="purpose" className="pp-test-connection__row">
                                <dt>Purpose</dt>
                                <dd>{r.purpose}</dd>
                            </div>
                        );
                    }
                    if (r.owner) {
                        rows.push(
                            <div key="owner" className="pp-test-connection__row">
                                <dt>Owner</dt>
                                <dd>{r.owner}</dd>
                            </div>
                        );
                    }
                    const schemaSummary = formatSchemaSummary(r);
                    if (schemaSummary && schemaSummary !== NOT_EXPOSED) {
                        rows.push(
                            <div key="schema" className="pp-test-connection__row">
                                <dt>Schema</dt>
                                <dd>{schemaSummary}</dd>
                            </div>
                        );
                    } else {
                        notExposed.push("Schema");
                    }
                    if (r.declaredKpis && r.declaredKpis.length > 0) {
                        rows.push(
                            <div key="kpis" className="pp-test-connection__row">
                                <dt>Declared KPIs</dt>
                                <dd>{String(r.declaredKpis.length)}</dd>
                            </div>
                        );
                    } else {
                        notExposed.push("Declared KPIs");
                    }
                    if (r.sampleQuestions && r.sampleQuestions.length > 0) {
                        rows.push(
                            <div key="samples" className="pp-test-connection__row">
                                <dt>Sample questions</dt>
                                <dd>{String(r.sampleQuestions.length)}</dd>
                            </div>
                        );
                    } else {
                        notExposed.push("Sample questions");
                    }
                    if (r.tools && r.tools.length > 0) {
                        rows.push(
                            <div key="tools" className="pp-test-connection__row">
                                <dt>Tools</dt>
                                <dd>{r.tools.length}</dd>
                            </div>
                        );
                    }
                    if (r.lastUpdated) {
                        rows.push(
                            <div key="updated" className="pp-test-connection__row">
                                <dt>Last updated</dt>
                                <dd>{r.lastUpdated}</dd>
                            </div>
                        );
                    }
                    if (notExposed.length > 0) {
                        rows.push(
                            <div key="not-exposed" className="pp-test-connection__row" style={{ opacity: 0.55, fontStyle: "italic" }}>
                                <dt>Not exposed</dt>
                                <dd title="This connector does not surface these fields. Common for Genie / Foundation Model profiles.">
                                    {notExposed.join(" · ")}
                                </dd>
                            </div>
                        );
                    }
                    return rows;
                })()}
            </dl>

            {/* ── Section 3: Inference ──────────────────────────────── */}
            <h3 className="pp-test-connection__section-title">Inference</h3>
            <InferenceBlock
                result={r}
                showBecause={props.showBecause}
                onToggleBecause={props.onToggleBecause}
            />
        </div>
    );
}

interface InferenceBlockProps {
    result: ConnectorProbeResult;
    showBecause: boolean;
    onToggleBecause: () => void;
}

function InferenceBlock(props: InferenceBlockProps) {
    const inference = props.result.inference;

    if (!inference || !inference.suggestedPack) {
        // UX-ARCH-0B.2 Phase F follow-up 2026-05-23 — clarified that
        // this is informational, not an error. Pack auto-detection
        // requires the connector to expose schema/KPIs/sample questions;
        // when it doesn't, the user just picks a pack manually in 03.
        return (
            <div className="pp-test-connection__inference pp-test-connection__inference--empty" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px" }}>
                <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.2, opacity: 0.7 }}>ℹ</span>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <strong>Pack auto-detect skipped.</strong>{" "}
                    This connector doesn't expose schema or sample questions, so the matcher has nothing to score against. Pick a pack manually in <em>03 Shared context</em>.
                </div>
            </div>
        );
    }

    const because = inference.because ?? [];
    const alternatives = inference.alternatives ?? [];

    return (
        <div className="pp-test-connection__inference">
            <div className="pp-test-connection__row">
                <dt>Suggested pack</dt>
                <dd>
                    {inference.suggestedPack}
                    {inference.suggestedSubVertical ? ` / ${inference.suggestedSubVertical}` : ""}
                    {" "}
                    <span className="pp-test-connection__confidence">
                        ({formatConfidence(inference.confidence)})
                    </span>
                </dd>
            </div>
            {because.length > 0 && (
                <div className="pp-test-connection__because">
                    <button
                        type="button"
                        className="pp-test-connection__because-toggle"
                        aria-expanded={props.showBecause}
                        onClick={props.onToggleBecause}
                    >
                        {props.showBecause ? "Hide why" : "Why"} ({because.length})
                    </button>
                    {props.showBecause && (
                        <ul className="pp-test-connection__because-list">
                            {because.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {alternatives.length > 0 && (
                <div className="pp-test-connection__row">
                    <dt>Alternatives</dt>
                    <dd>
                        {alternatives.map((alt, i) => (
                            <span key={i} className="pp-test-connection__alt">
                                {alt.subVertical ? `${alt.pack} / ${alt.subVertical}` : alt.pack}
                                {" "}({formatConfidence(alt.confidence)})
                                {i < alternatives.length - 1 ? ", " : ""}
                            </span>
                        ))}
                    </dd>
                </div>
            )}
        </div>
    );
}

// ── Pure helpers ────────────────────────────────────────────────────────

function formatSeconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatConfidence(c: number): string {
    if (Number.isNaN(c) || !Number.isFinite(c)) return "—";
    const pct = Math.round(Math.max(0, Math.min(1, c)) * 100);
    return `${pct}%`;
}

function statusKindForAvailability(a: ProbeMetadataAvailability): "ok" | "warn" | "error" {
    switch (a) {
        case "rich": return "ok";
        case "minimal": return "warn";
        case "none": return "warn";
    }
}

function statusIcon(kind: "ok" | "warn" | "error"): string {
    // Unicode-only — no icon libraries.
    switch (kind) {
        case "ok": return "✓";    // check mark
        case "warn": return "⚠";  // warning sign
        case "error": return "✗"; // cross
    }
}

function statusHeadline(a: ProbeMetadataAvailability, durationMs: number): string {
    // "Reachable", not "successful": the probe verifies the connector responds
    // and returns metadata — it does NOT execute a query, so it can't promise
    // that questions will run (e.g. a Genie space whose warehouse is disabled
    // still probes fine). Keeping the claim honest avoids a false green light.
    const took = `probe took ${formatSeconds(durationMs)}`;
    switch (a) {
        case "rich":
            return `Connector reachable — ${took}`;
        case "minimal":
            return `Connector reachable (limited metadata) — ${took}`;
        case "none":
            return `Connector reachable (no metadata) — ${took}`;
    }
}

function formatSchemaSummary(r: ConnectorProbeResult): string {
    if (!r.schema || !r.schema.tables || r.schema.tables.length === 0) {
        return NOT_EXPOSED;
    }
    const tableCount = r.schema.tables.length;
    const columnCount = r.schema.tables.reduce(
        (sum, t) => sum + (Array.isArray(t.columns) ? t.columns.length : 0),
        0,
    );
    const tableLabel = tableCount === 1 ? "table" : "tables";
    const columnLabel = columnCount === 1 ? "column" : "columns";
    return `${tableCount} ${tableLabel}, ${columnCount} ${columnLabel}`;
}
