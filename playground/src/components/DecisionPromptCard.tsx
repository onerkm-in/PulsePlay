// playground/src/components/DecisionPromptCard.tsx
//
// Reusable "NEEDS YOUR DECISION" card for the Action Insights surface.
// Presentational only: renders one governed Decision Prompt (the deterministic
// 10-part structure produced by the Python detection engine) and surfaces the
// server-authorized actions. All authorization is enforced server-side; this
// card only renders what `allowed_actions` permits and posts intent back.

import { useState } from "react";
import { SaveChannel } from "../canvas/SaveChannel";
import type { EligibleSection } from "../canvas/canvasTypes";

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

const SEV: Record<string, { fg: string; bg: string; label: string }> = {
    critical: { fg: "#b42318", bg: "rgba(180,35,24,0.10)", label: "CRITICAL" },
    high: { fg: "#b54708", bg: "rgba(181,71,8,0.10)", label: "HIGH" },
    medium: { fg: "#854d0e", bg: "rgba(133,77,14,0.10)", label: "MEDIUM" },
    low: { fg: "#475467", bg: "rgba(71,84,103,0.10)", label: "LOW" },
};

const PRIMARY_ORDER = ["approve", "trigger_supplier_review", "trigger_replenishment",
    "trigger_forecast_review", "trigger_supplier_perf", "trigger_inventory_review"];

/** Governed, non-sensitive descriptor for pinning a decision prompt. No rows/SQL —
 *  just the prompt identity + evidence reference the server can re-resolve. */
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
        <div style={{
            display: "flex", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12,
            overflow: "hidden", background: "var(--pp-card-bg, rgba(127,127,127,0.04))",
            marginBottom: 14, opacity: terminal ? 0.72 : 1,
        }}>
            <div style={{ width: 6, background: sev.fg, flex: "0 0 auto" }} aria-hidden />
            <div style={{ padding: "14px 16px", flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10.5, letterSpacing: 0.8, fontWeight: 700, color: sev.fg }}>
                            NEEDS YOUR DECISION
                        </div>
                        <div style={{ fontSize: 15.5, fontWeight: 650, marginTop: 4, lineHeight: 1.3 }}>
                            {prompt.headline}
                        </div>
                    </div>
                    <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                        <div style={{
                            fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 700, color: sev.fg,
                        }}>
                            {fmtImpact(prompt.business_impact_value, prompt.business_impact_unit)}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--pp-muted,#667085)", maxWidth: 160 }}>
                            {prompt.business_impact_label}
                        </div>
                        <div style={{ height: 4, background: "rgba(128,128,128,0.15)", borderRadius: 3, marginTop: 5 }}>
                            <div style={{ height: 4, width: `${impactPct}%`, background: sev.fg, borderRadius: 3 }} />
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--pp-muted,#667085)" }}>
                    <span style={{
                        display: "inline-block", padding: "1px 7px", borderRadius: 6, marginRight: 8,
                        background: sev.bg, color: sev.fg, fontSize: 10.5, fontWeight: 700,
                    }}>{sev.label}</span>
                    {prompt.issue}
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: "var(--pp-muted,#8a94a6)" }}>
                    <strong style={{ fontWeight: 600 }}>WHY</strong> {prompt.root_cause}
                    {"  ·  "}<strong style={{ fontWeight: 600 }}>FIX</strong> {prompt.recommended_action}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 550 }}>{actionQuestion(prompt)}</div>

                {!terminal && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        {primary && (
                            <button
                                disabled={busy}
                                onClick={() => onAction(prompt.prompt_id, primary)}
                                style={{
                                    padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                                    background: sev.fg, color: "#fff", fontWeight: 600, fontSize: 12.5,
                                    opacity: busy ? 0.6 : 1,
                                }}
                            >{ACTION_LABELS[primary] || primary}{prompt.approval_required && primary !== "approve" ? " →" : ""}</button>
                        )}
                        {secondaries.map((c) => (
                            <button
                                key={c}
                                disabled={busy}
                                onClick={() => onAction(prompt.prompt_id, c)}
                                style={{
                                    padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                                    border: "1px solid rgba(128,128,128,0.35)", background: "transparent",
                                    color: "inherit", fontSize: 12, opacity: busy ? 0.6 : 0.9,
                                }}
                            >{ACTION_LABELS[c] || c}</button>
                        ))}
                        <button
                            onClick={() => setShowEvidence((v) => !v)}
                            style={{
                                marginLeft: "auto", padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                                border: "none", background: "transparent", color: "var(--pp-muted,#667085)",
                                fontSize: 12, textDecoration: "underline",
                            }}
                        >{showEvidence ? "Hide evidence" : "View evidence"}</button>
                    </div>
                )}

                {terminal && (
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: sev.fg }}>
                        Status: {prompt.status.replace("-", " ")}
                    </div>
                )}

                {showEvidence && (
                    <div style={{ marginTop: 10 }}>
                        {prompt.evidence_sql && (
                            <>
                                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
                                    color: "var(--pp-muted,#667085)", marginBottom: 4 }}>DETECTION SQL</div>
                                <pre style={{
                                    padding: 10, borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                                    whiteSpace: "pre-wrap", background: "rgba(128,128,128,0.10)",
                                    color: "var(--pp-muted,#344054)", overflowX: "auto", marginBottom: 8,
                                }}>{prompt.evidence_sql}</pre>
                            </>
                        )}
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
                            color: "var(--pp-muted,#667085)", marginBottom: 4 }}>EVIDENCE · AUDIT NOTE</div>
                        <pre style={{
                            padding: 10, borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                            whiteSpace: "pre-wrap", background: "rgba(128,128,128,0.08)",
                            color: "var(--pp-muted,#475467)", overflowX: "auto",
                        }}>{prompt.narrative}</pre>
                    </div>
                )}

                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 10.5, color: "var(--pp-muted,#98a2b3)" }}>
                        confidence {prompt.confidence} · Level {prompt.action_level} · {prompt.rule_id} · owner {prompt.owner} · {prompt.status}
                    </div>
                    <SaveChannel compact eligible={eligibleFromPrompt(prompt)} />
                </div>
            </div>
        </div>
    );
}
