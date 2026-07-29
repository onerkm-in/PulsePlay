// playground/src/components/DecisionPromptCard.tsx
//
// Reusable "NEEDS YOUR DECISION" card — the hero component of the Decision Assist
// surface. Presentational only: it renders one governed Decision Prompt (the
// deterministic 10-part structure produced by the Python detection engine) and
// surfaces the server-authorized actions. All authorization is enforced
// server-side; this card only renders what `allowed_actions` permits.
//
// Styled for the My Decision Canvas cockpit (docs/MY_DECISION_CANVAS_DESIGN_APPROACH.md):
// an elevated white card on the neutral page, Barlow/Barlow Condensed type, and the
// controlled semantic palette for severity (Critical = bad, High = warn, Medium =
// violet — also the "AI" badge when the detection is AI-narrated). Steel stays the
// primary brand accent (primary action, links). Non-color cues: every severity has a
// text label; deterministic vs AI-narrated is shown explicitly.

import { useState } from "react";
import { SaveChannel } from "../canvas/SaveChannel";
import type { EligibleSection } from "../canvas/canvasTypes";
import { createSqlBackedTile } from "../lib/canvasTileActions";
import { bindDecisionEvidenceSql } from "../lib/decisionEvidenceSql";
import "./decisionPromptCard.css";

export interface DecisionPrompt {
    prompt_id: string;
    rule_id: string;
    kpi: string;
    severity: "critical" | "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
    headline: string;
    issue: string;
    root_cause: string;
    root_cause_category: string;
    recommended_action: string;
    action_code: string;
    action_level: number;
    approval_required: boolean;
    business_impact_value: number;
    business_impact_unit: string;
    business_impact_label: string;
    persona: string;
    owner: string;
    status: string;
    narrative: string;
    evidence_signature: string;
    evidence_sql?: string | null;
    category?: string | null;
    region?: string | null;
    month_key?: number;
    allowed_actions: string[];
    /** True when the detection was AI-narrated rather than deterministic DAX/SQL.
     *  Drives the "AI" chip so a generated finding is never mistaken for measured. */
}

export const ACTION_LABELS: Record<string, string> = {
    trigger_supplier_review: "Trigger supplier delivery review",
    trigger_replenishment: "Trigger replenishment review",
    trigger_forecast_review: "Trigger forecast bias review",
    trigger_supplier_perf: "Raise supplier performance review",
    trigger_inventory_review: "Raise SKU redistribution request",
    approve: "Approve & proceed",
    reject: "Reject",
    snooze: "Snooze",
    mark_false_positive: "Mark false positive",
    view_evidence: "View evidence",
};

// Severity maps to the controlled semantic palette + a text label (the non-color
// cue). Consistent everywhere: Critical = bad, High = warn, Medium = violet, Low =
// neutral. `sev` class drives the left rail + the solid severity chip.
const SEV: Record<string, { sev: string; label: string }> = {
    critical: { sev: "sev-bad", label: "CRITICAL" },
    high: { sev: "sev-warn", label: "HIGH" },
    medium: { sev: "sev-violet", label: "MEDIUM" },
    low: { sev: "sev-neutral", label: "LOW" },
};

const PRIMARY_ORDER = ["approve", "trigger_supplier_review", "trigger_replenishment",
    "trigger_forecast_review", "trigger_supplier_perf", "trigger_inventory_review"];

function eligibleFromPrompt(p: DecisionPrompt): EligibleSection {
    return {
        type: "decision_prompt",
        title: p.headline,
        source: { surface: "action-insights", prompt_id: p.prompt_id, rule_id: p.rule_id },
        provenance: {
            semantic_ref: `decision:${p.rule_id}`,
            evidence_ref: p.evidence_signature,
            classification: "internal",
        },
    };
}

function fmtImpact(value: number, unit: string): string {
    // The API can deliver impact values as strings — coerce before math.
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value) + (unit ? " " + unit : "");
    if (unit === "USD") return "$" + Math.round(n).toLocaleString("en-US");
    // % and pp both render with the % symbol ("6.5%", "1%") and keep a decimal
    // when small — rounding 6.5% up to "7 %" misstates the measured figure.
    // Percentage-metric changes use "%", never a "pp" suffix (product preference).
    if (unit === "%" || unit === "pp") {
        const v = Math.abs(n) < 10 ? String(parseFloat(n.toFixed(1))) : String(Math.round(n));
        return v + "%";
    }
    return Math.round(n).toLocaleString("en-US") + " " + unit;
}

/** Pull the "ACTION QUESTION:" line out of the deterministic narrative. */
function actionQuestion(p: DecisionPrompt): string {
    const m = p.narrative.split("\n").find((l) => l.startsWith("ACTION QUESTION:"));
    if (m) return m.replace("ACTION QUESTION:", "").trim();
    // Strip the action's own terminal punctuation — otherwise a fix text
    // ending in "." renders "…coverage.?".
    const action = p.recommended_action.trim().replace(/[.!?\s]+$/, "");
    return `Do you want me to ${action.toLowerCase()}?`;
}

export function DecisionPromptCard({
    prompt, onAction, busy, maxImpact, connectorProfileId,
}: {
    prompt: DecisionPrompt;
    onAction: (promptId: string, action: string, rationale?: string) => void;
    busy: boolean;
    maxImpact: number;
    /** Warehouse-capable profile the prompt's evidence SQL runs against when
     *  pinned to the canvas. Pin is offered only when this AND evidence_sql
     *  are present — the pinned tile refreshes deterministically (no LLM). */
    connectorProfileId?: string;
}) {
    const [showEvidence, setShowEvidence] = useState(false);
    const [pinState, setPinState] = useState<"idle" | "pinning" | "pinned" | "error">("idle");
    const [pinError, setPinError] = useState<string | null>(null);
    const sev = SEV[prompt.severity] || SEV.low;
    const allowed = prompt.allowed_actions || [];
    const primary = PRIMARY_ORDER.find((c) => allowed.includes(c));
    const secondaries = allowed.filter((c) => c !== primary && c !== "view_evidence");
    const impactPct = maxImpact > 0 ? Math.max(4, Math.round((prompt.business_impact_value / maxImpact) * 100)) : 0;
    const terminal = ["actioned", "rejected", "false-positive", "snoozed"].includes(prompt.status);
    // `pending-approval` is NOT terminal (the owner can still approve), but it
    // must still SAY so: a planner who triggers an L3 action sees every button
    // disappear (they cannot self-approve) and, without this, no explanation at
    // all — the click looked like it did nothing. Live repro 2026-07-27.
    const awaitingApproval = prompt.status === "pending-approval";

    // Pin the decision's evidence to the canvas as a SQL-backed, refreshable
    // tile — deterministic (the evidence SELECT re-runs on the warehouse, no
    // LLM). Only reachable when the prompt carries evidence_sql AND a
    // warehouse profile is bound.
    const canPin = !!prompt.evidence_sql && !!connectorProfileId;
    const pinToCanvas = async () => {
        if (!prompt.evidence_sql || !connectorProfileId) return;
        setPinState("pinning"); setPinError(null);
        // The evidence SQL is a parameterized template (:mk / :pmk / …). Bind
        // it from the prompt's own fields the same way the engine does, and
        // refuse rather than run a partially-bound query.
        const bound = bindDecisionEvidenceSql(prompt);
        if (!bound.ok || !bound.sql) {
            setPinState("error");
            setPinError(bound.error || "Couldn't prepare the evidence query.");
            return;
        }
        const res = await createSqlBackedTile({
            title: prompt.headline || prompt.kpi || "Decision evidence",
            sql: bound.sql,
            profile: connectorProfileId,
            renderAs: "table",
            sourceQuestion: `Decision ${prompt.rule_id}`,
        });
        if (res.ok) {
            setPinState("pinned");
        } else {
            setPinState("error");
            setPinError(res.error || "Couldn't pin to canvas.");
        }
    };

    return (
        <div className={`dpc ${sev.sev}${terminal ? " dpc--terminal" : ""}`}>
            <span className="dpc__rail" aria-hidden />
            <div className="dpc__body">
                {/* Severity reads as a tinted header strip rather than a coloured
                    left edge. The strip carries the label, the metric it concerns
                    and where it applies, so the top line answers "how bad, about
                    what, and where" before any prose is read. */}
                <div className="dpc__strip">
                    <span className="dpc__sevchip">{sev.label}</span>
                    <span className="dpc__strip-kpi">{prompt.kpi}</span>
                    {(prompt.region || prompt.category) && (
                        <span className="dpc__strip-where">
                            {[prompt.region, prompt.category].filter(Boolean).join(" · ")}
                        </span>
                    )}
                </div>
                <h3 className="dpc__headline">{prompt.headline}</h3>

                <div className="dpc__issue">{prompt.issue}</div>

                <div className="dpc__whyfix">
                    <strong>WHY</strong> {prompt.root_cause}
                    {"  ·  "}<strong>FIX</strong> {prompt.recommended_action}
                </div>

                {/* The stake and the question belong side by side (Canvas v4): the
                    number is what makes the question worth answering, and reading
                    them together is the whole decision. Split across the card - the
                    figure floating top-right, the question further down - they read
                    as two unrelated facts. */}
                <div className="dpc__ask">
                    <div className="dpc__impact">
                        <div className="dpc__impact-value">{fmtImpact(prompt.business_impact_value, prompt.business_impact_unit)}</div>
                        <div className="dpc__impact-label">{prompt.business_impact_label}</div>
                        <div className="dpc__bar" role="img"
                            aria-label={`Relative size of this decision: ${impactPct}% of the largest open one`}>
                            <span className="dpc__bar-fill" style={{ width: `${impactPct}%` }} />
                        </div>
                    </div>
                    <div className="dpc__question">{actionQuestion(prompt)}</div>
                </div>

                {!terminal && (
                    <div className="dpc__actions">
                        {primary && (
                            <button
                                type="button" disabled={busy}
                                onClick={() => onAction(prompt.prompt_id, primary)}
                                className="btn btn-primary btn-sm"
                            >{ACTION_LABELS[primary] || primary}{prompt.approval_required && primary !== "approve" ? " →" : ""}</button>
                        )}
                        {secondaries.map((c) => (
                            <button
                                type="button" key={c} disabled={busy}
                                onClick={() => onAction(prompt.prompt_id, c)}
                                className="btn btn-secondary btn-sm"
                            >{ACTION_LABELS[c] || c}</button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setShowEvidence((v) => !v)}
                            className="btn btn-ghost btn-sm dpc__evidence-toggle"
                        >{showEvidence ? "Hide evidence" : "View evidence"}</button>
                        {canPin && (
                            <button
                                type="button"
                                onClick={pinToCanvas}
                                disabled={pinState === "pinning" || pinState === "pinned"}
                                className="btn btn-ghost btn-sm dpc__pin"
                                title="Pin this decision's evidence to the Dashboard canvas as a SQL-backed tile (no AI, refreshes deterministically)"
                            >{pinState === "pinning" ? "Pinning…" : pinState === "pinned" ? "Pinned to canvas ✓" : "Pin to canvas"}</button>
                        )}
                        <SaveChannel compact eligible={eligibleFromPrompt(prompt)} />
                    </div>
                )}

                {pinState === "error" && pinError && (
                    <div className="dpc__pin-error" role="status">{pinError}</div>
                )}

                {terminal && (
                    <div className="dpc__terminal-status">Status: {prompt.status.replace("-", " ")}</div>
                )}

                {awaitingApproval && (
                    <div className="dpc__terminal-status dpc__awaiting" role="status">
                        Submitted - awaiting approval from {prompt.owner || "the owner"}.
                    </div>
                )}

                {showEvidence && (
                    <div className="dpc__evidence">
                        {prompt.evidence_sql && (<>
                            <div className="kicker">Detection SQL · measured · deterministic</div>
                            <pre className="dpc__pre">{prompt.evidence_sql}</pre>
                        </>)}
                        <div className="kicker">Evidence · audit note</div>
                        <pre className="dpc__pre">{prompt.narrative}</pre>
                    </div>
                )}

                <div className="dpc__meta">
                    <span className="card-meta">confidence {prompt.confidence} · Level {prompt.action_level} · {prompt.rule_id} · owner {prompt.owner} · {prompt.status}</span>
                    {terminal && <SaveChannel compact eligible={eligibleFromPrompt(prompt)} />}
                </div>
            </div>
        </div>
    );
}
