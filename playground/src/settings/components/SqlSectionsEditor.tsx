// playground/src/settings/components/SqlSectionsEditor.tsx
//
// Native-Settings authoring for SQL / config-item AI Insights sections
// (2026-05-28, Slice 3). Each SQL section runs a read-only SELECT against the
// Databricks warehouse via the proxy `/sql/preview` route and renders the
// result as a KPI / table / chart card on the AI Insights screen — no LLM.
//
// Previously these were only authorable in the old Pulse setupStep5 surface.
// This editor writes the same canonical `insightsCustomSections` JSON the
// runtime consumes (preserving AI sections), and finally wires the "Validate"
// dry-run that was stubbed in setupStep5 ("Wired in 48.16").

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    readSqlSections,
    mergeSqlSectionsIntoCustomSectionsJson,
    type SqlSectionInput,
    type SqlResultRender,
} from "../../pulse/sectionMarkdown";
import { validateSqlSection, type SqlSection } from "../../pulse/sqlSection";
import { validateSqlViaPreview } from "../../lib/sqlPreviewClient";

export interface SqlSectionsEditorProps {
    /** Canonical insightsCustomSections JSON string. */
    value: string;
    onChange: (nextJson: string) => void;
    /** Proxy base URL (e.g. "/api") for the Validate dry-run. */
    apiBaseUrl: string;
    /** Active assistant profile — the default warehouse routing when a
     *  section doesn't specify its own target profile. */
    assistantProfile?: string;
    /** Selectable target profiles (Genie spaces / direct warehouses) the
     *  author can point a section at. Empty = only the active profile. */
    profiles?: ReadonlyArray<{ value: string; label: string }>;
}

type ValidateState =
    | { kind: "idle" }
    | { kind: "linting"; errors: string[] }
    | { kind: "validating" }
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string };

const RENDER_OPTIONS: SqlResultRender[] = ["kpi", "table", "chart"];

export function SqlSectionsEditor({ value, onChange, apiBaseUrl, assistantProfile, profiles = [] }: SqlSectionsEditorProps): React.ReactElement {
    const lastEmittedRef = useRef<string>("");
    const [rows, setRows] = useState<SqlSectionInput[]>(() => readSqlSections(value));
    const [validate, setValidate] = useState<Record<number, ValidateState>>({});

    // Re-seed from an external change (e.g. preset picker / markdown editor),
    // not from our own emit, so we don't clobber in-progress edits.
    useEffect(() => {
        if (value !== lastEmittedRef.current) setRows(readSqlSections(value));
    }, [value]);

    const emit = (next: SqlSectionInput[]) => {
        setRows(next);
        const json = mergeSqlSectionsIntoCustomSectionsJson(next, value);
        lastEmittedRef.current = json;
        onChange(json);
    };

    const update = (i: number, patch: Partial<SqlSectionInput>) => {
        emit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
        setValidate(v => ({ ...v, [i]: { kind: "idle" } }));
    };
    const add = () => emit([...rows, { name: "", sql: "", resultRender: "kpi" }]);
    const remove = (i: number) => {
        emit(rows.filter((_, idx) => idx !== i));
        setValidate(v => { const n = { ...v }; delete n[i]; return n; });
    };

    const runValidate = async (i: number) => {
        const row = rows[i];
        // Instant client-side lint first (DML keywords, paren balance, length).
        const asSection: SqlSection = { kind: "sql", title: row.name || "untitled", sql: row.sql, resultRender: row.resultRender };
        const lintErrors = validateSqlSection(asSection);
        if (lintErrors.length > 0) {
            setValidate(v => ({ ...v, [i]: { kind: "linting", errors: lintErrors } }));
            return;
        }
        setValidate(v => ({ ...v, [i]: { kind: "validating" } }));
        // Per-section target profile when set, else the active profile.
        const result = await validateSqlViaPreview({ apiBaseUrl, sql: row.sql, assistantProfile: row.profile?.trim() || assistantProfile });
        if (result.ok) {
            const n = result.totalRowCount ?? result.rows.length;
            const ms = result.executionTimeMs ? ` in ${result.executionTimeMs}ms` : "";
            setValidate(v => ({ ...v, [i]: { kind: "ok", message: `Returned ${n} row${n === 1 ? "" : "s"}, ${result.columns.length} column${result.columns.length === 1 ? "" : "s"}${ms}.` } }));
        } else {
            setValidate(v => ({ ...v, [i]: { kind: "error", message: result.error || "Validation failed." } }));
        }
    };

    const proxyReady = useMemo(() => !!apiBaseUrl.trim(), [apiBaseUrl]);
    // 2026-05-28 — capability greying (featureRegistry `custom-sql-sections`
    // gate, surfaced not hidden). SQL sections run a SELECT against a profile's
    // warehouse via /sql/preview; with no connected AI profile there's no
    // warehouse to route to. Rather than let the author discover that via a
    // cryptic Validate error, surface the prerequisite up front + disable
    // Validate. The editor stays visible so authors can still draft sections.
    const profileConnected = !!(assistantProfile && assistantProfile.trim());
    const canValidate = proxyReady && profileConnected;

    return (
        <div style={{ display: "grid", gap: 12 }} data-testid="pp-sql-sections-editor">
            {!profileConnected && (
                <div
                    role="note"
                    data-testid="pp-sql-capability-notice"
                    style={{
                        display: "flex", gap: 8, alignItems: "flex-start",
                        fontSize: 11.5, lineHeight: 1.45,
                        padding: "8px 10px", borderRadius: 6,
                        border: "1px solid rgba(217,119,6,0.30)",
                        background: "rgba(217,119,6,0.06)",
                        color: "var(--pp-warning-text, #92400e)",
                    }}
                >
                    <span aria-hidden="true">⚠</span>
                    <span>
                        <strong>Requires a connected AI profile with a warehouse.</strong>{" "}
                        SQL sections run a read-only SELECT against the profile's Databricks warehouse — connect one in
                        {" "}<strong>AI → Provider</strong> to validate + run them. You can still draft sections below; they'll
                        execute once a profile is connected.
                    </span>
                </div>
            )}
            {rows.length === 0 && (
                <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--pp-text-muted, #64748b)" }}>
                    No SQL sections yet. Add one to fetch KPIs with a read-only SELECT against the warehouse — it renders as a card on the AI Insights screen.
                </div>
            )}
            {rows.map((row, i) => {
                const vs = validate[i] ?? { kind: "idle" };
                return (
                    <div
                        key={i}
                        data-testid={`pp-sql-section-${i}`}
                        style={{ border: "1px solid var(--pp-border-subtle, #e4e9ef)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}
                    >
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                                type="text"
                                value={row.name}
                                placeholder="Section name (e.g. Revenue KPI)"
                                aria-label={`SQL section ${i + 1} name`}
                                onChange={e => update(i, { name: e.target.value })}
                                style={{ flex: "1 1 200px", minWidth: 160, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--pp-border, rgba(0,0,0,0.18))", fontSize: 13 }}
                            />
                            <select
                                value={row.resultRender}
                                aria-label={`SQL section ${i + 1} render`}
                                onChange={e => update(i, { resultRender: e.target.value as SqlResultRender })}
                                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--pp-border, rgba(0,0,0,0.18))", fontSize: 13 }}
                            >
                                {RENDER_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                            </select>
                            {profiles.length > 0 && (
                                <select
                                    value={row.profile ?? ""}
                                    aria-label={`SQL section ${i + 1} target profile`}
                                    title="Which connector profile's warehouse this SQL runs against — a Genie space or a direct/underlying-data warehouse. Default uses the active profile."
                                    onChange={e => update(i, { profile: e.target.value })}
                                    style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--pp-border, rgba(0,0,0,0.18))", fontSize: 13, maxWidth: 220 }}
                                >
                                    <option value="">Active profile (default)</option>
                                    {profiles.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            )}
                            <button
                                type="button"
                                onClick={() => remove(i)}
                                aria-label={`Remove SQL section ${i + 1}`}
                                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--pp-border, rgba(0,0,0,0.18))", background: "transparent", cursor: "pointer", fontSize: 12 }}
                            >
                                Remove
                            </button>
                        </div>
                        <textarea
                            value={row.sql}
                            placeholder={"select sum(revenue) as total_revenue\nfrom sales\nwhere fiscal_year = 2024"}
                            aria-label={`SQL section ${i + 1} query`}
                            data-testid={`pp-sql-section-${i}-sql`}
                            rows={4}
                            onChange={e => update(i, { sql: e.target.value })}
                            style={{
                                width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6,
                                border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                                fontFamily: "var(--pp-mono, ui-monospace, SFMono-Regular, Consolas, monospace)",
                                fontSize: 12.5, lineHeight: 1.5, resize: "vertical", minHeight: 80,
                            }}
                        />
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={() => runValidate(i)}
                                disabled={vs.kind === "validating" || !canValidate}
                                title={!proxyReady ? "Configure the proxy URL first"
                                    : !profileConnected ? "Connect an AI profile with a warehouse (AI → Provider) to validate"
                                    : "Run the SQL against the warehouse to validate it"}
                                data-testid={`pp-sql-section-${i}-validate`}
                                style={{
                                    padding: "6px 12px", borderRadius: 6, border: "1px solid var(--pp-accent, #0078d4)",
                                    background: vs.kind === "validating" ? "var(--pp-border-subtle, #e4e9ef)" : "rgba(0,120,212,0.06)",
                                    color: "var(--pp-accent, #0078d4)", cursor: vs.kind === "validating" ? "default" : "pointer", fontSize: 12, fontWeight: 600,
                                }}
                            >
                                {vs.kind === "validating" ? "Validating…" : "Validate"}
                            </button>
                            <ValidateBadge state={vs} />
                        </div>
                    </div>
                );
            })}
            <div>
                <button
                    type="button"
                    onClick={add}
                    data-testid="pp-sql-section-add"
                    style={{ padding: "7px 14px", borderRadius: 6, border: "1px dashed var(--pp-border, rgba(0,0,0,0.3))", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                    + Add SQL section
                </button>
            </div>
        </div>
    );
}

function ValidateBadge({ state }: { state: ValidateState }): React.ReactElement | null {
    if (state.kind === "idle" || state.kind === "validating") return null;
    if (state.kind === "ok") {
        return <span style={{ fontSize: 11.5, color: "#166534", fontWeight: 600 }}>✓ {state.message}</span>;
    }
    if (state.kind === "linting") {
        return (
            <span style={{ fontSize: 11.5, color: "#b45309" }}>
                ⚠ {state.errors.join(" ")}
            </span>
        );
    }
    return <span style={{ fontSize: 11.5, color: "#b91c1c" }}>✗ {state.message}</span>;
}
