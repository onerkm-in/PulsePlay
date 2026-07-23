// playground/src/components/DecisionPromptCard.tsx
//
// Reusable "NEEDS YOUR DECISION" card — the hero component of the Decision Assist
// surface. Presentational only: it renders one governed Decision Prompt (the
// deterministic 10-part structure produced by the Python detection engine) and
// surfaces the server-authorized actions. All authorization is enforced
// server-side; this card only renders what `allowed_actions` permits.
//
// Styled to the Industry design system (docs/INDUSTRY_DESIGN_REMEDIATION_PROMPT.md):
// a blueprint frame with corner registration marks, a single steel accent voice
// (severity = accent-ramp rail + tag + text label, never a colour stoplight), and
// the shared token-driven CSS classes — no inline-style soup, no rounded pills.

import { useState } from "react";
import { SaveChannel } from "../canvas/SaveChannel";
import type { EligibleSection } from "../canvas/canvasTypes";
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

// Severity is one accent voice: rail step + tag tone + text label (no stoplight).
const SEV: Record<string, { rail: string; tag: string; label: string }> = {
    critical: { rail: "sev-critical", tag: "tag-accent", label: "CRITICAL" },
    high: { rail: "sev-high", tag: "tag-accent", label: "HIGH" },
    medium: { rail: "sev-medium", tag: "tag-neutral", label: "MEDIUM" },
    low: { rail: "sev-low", tag: "tag-neutral", label: "LOW" },
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
    const n = Math.round(value);
    if (unit === "USD") return "$" + n.toLocaleString();
    return n.toLocaleString() + " " + unit;
}

/** Pull the "ACTION QUESTION:" line out of the deterministic narrative. */
function actionQuestion(p: DecisionPrompt): string {
    const m = p.narrative.split("\n").find((l) => l.startsWith("ACTION QUESTION:"));
    if (m) return m.replace("ACTION QUESTION:", "").trim();
    return `Do you want me to ${p.recommended_action.toLowerCase()}?`;
}

function Corners() {
    return (<>
        <i className="corner tl" /><i className="corner tr" />
        <i className="corner bl" /><i className="corner br" />
    </>);
}

export function DecisionPromptCard({
    prompt, onAction, busy, maxImpact,
}: {
    prompt: DecisionPrompt;
    onAction: (promptId: string, action: string, rationale?: string) => void;
    busy: boolean;
    maxImpact: number;
}) {
    const [showEvidence, setShowEvidence] = useState(false);
    const sev = SEV[prompt.severity] || SEV.low;
    const allowed = prompt.allowed_actions || [];
    const primary = PRIMARY_ORDER.find((c) => allowed.includes(c));
    const secondaries = allowed.filter((c) => c !== primary && c !== "view_evidence");
    const impactPct = maxImpact > 0 ? Math.max(4, Math.round((prompt.business_impact_value / maxImpact) * 100)) : 0;
    const terminal = ["actioned", "rejected", "false-positive", "snoozed"].includes(prompt.status);

    return (
        <div className={`dpc blueprint${terminal ? " dpc--terminal" : ""}`}>
            <Corners />
            <span className={`sev-rail ${sev.rail}`} aria-hidden />
            <div className="dpc__body">
                <div className="dpc__head">
                    <div className="dpc__headline-col">
                        <span className="kicker">Needs your decision</span>
                        <h3 className="dpc__headline">{prompt.headline}</h3>
                    </div>
                    <div className="dpc__impact">
                        <div className="dpc__impact-value">{fmtImpact(prompt.business_impact_value, prompt.business_impact_unit)}</div>
                        <div className="dpc__impact-label">{prompt.business_impact_label}</div>
                        <div className="dpc__bar"><span className="dpc__bar-fill" style={{ width: `${impactPct}%` }} /></div>
                    </div>
                </div>

                <div className="dpc__issue">
                    <span className={`tag ${sev.tag}`}>{sev.label}</span>
                    <span>{prompt.issue}</span>
                </div>

                <div className="dpc__whyfix">
                    <strong>WHY</strong> {prompt.root_cause}
                    {"  ·  "}<strong>FIX</strong> {prompt.recommended_action}
                </div>

                <div className="dpc__question">{actionQuestion(prompt)}</div>

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
                        <SaveChannel compact eligible={eligibleFromPrompt(prompt)} />
                    </div>
                )}

                {terminal && (
                    <div className="dpc__terminal-status">Status: {prompt.status.replace("-", " ")}</div>
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
