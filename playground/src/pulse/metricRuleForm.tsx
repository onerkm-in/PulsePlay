/**
 * metricRuleForm.tsx - Wave 40
 *
 * Form-first editor for metric direction rules. Replaces the dual-textarea
 * UX (free-text rules + structured JSON map kept in sync via a one-way
 * "Generate from text" button) with a single source of truth: an array of
 * MetricRule cards that derives both legacy fields on every change.
 *
 * Public API:
 *   <MetricRuleForm
 *     rules={MetricRule[]}
 *     onChange={(rules) => void}
 *     onProseDerived?={(prose: string) => void}
 *     onJsonDerived?={(json: string) => void}
 *   />
 *
 * The host (Section B in setupStep5.tsx) provides the legacy field setters
 * via onProseDerived + onJsonDerived; the form fires both on every change so
 * the prompt builder (reads metricDirectionRules text) and the AI Insights
 * renderer (reads insightsMetricDirections JSON) see consistent data with
 * zero manual sync.
 *
 * Wave 22 contract: every onChange routes through scrubField() before state
 * is updated, so persisted draft values are already sanitised when downstream
 * consumers pick them up.
 */

import * as React from "react";
import {
    MetricRule,
    ValidationError,
    createBlankRule,
    rulesToProse,
    rulesToJson,
    proseToRules,
    validateRules,
    scrubField,
    MAX_NAME_LEN,
    MAX_ALIAS_LEN,
    MAX_RULES,
    DEFAULT_GREEN,
    DEFAULT_AMBER,
    DEFAULT_RED
} from "./metricRulesEngine";

export interface MetricRuleFormProps {
    rules: MetricRule[];
    onChange: (rules: MetricRule[]) => void;
    /** Optional: fires after every change with the derived prose. */
    onProseDerived?: (prose: string) => void;
    /** Optional: fires after every change with the derived JSON. */
    onJsonDerived?: (json: string) => void;
    /** Optional: when set, the "Suggest from data" button is rendered.
     *  Wave 41 cycle 12: now accepts a Promise return so the host can call
     *  the proxy /insights/suggest-metric-rules route for a single metric.
     *  Sync return (Wave 40 stub) is still supported for backward compat. */
    onSuggestForCard?: (rule: MetricRule, idx: number) =>
        | MetricRule
        | undefined
        | Promise<MetricRule | undefined>;
    /** Optional: disables editing (read-only preview). */
    readOnly?: boolean;
}

export function MetricRuleForm(props: MetricRuleFormProps) {
    const { rules, onChange, onProseDerived, onJsonDerived, onSuggestForCard, readOnly } = props;

    // ── Helpers that propagate change + derive prose/json in one call ──
    const propagate = React.useCallback((next: MetricRule[]) => {
        onChange(next);
        if (onProseDerived) onProseDerived(rulesToProse(next));
        if (onJsonDerived) onJsonDerived(rulesToJson(next));
    }, [onChange, onProseDerived, onJsonDerived]);

    const updateRule = (idx: number, patch: Partial<MetricRule>) => {
        const next = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
        propagate(next);
    };

    const addRule = () => {
        if (rules.length >= MAX_RULES) return;
        propagate([...rules, createBlankRule()]);
    };

    const removeRule = (idx: number) => {
        propagate(rules.filter((_, i) => i !== idx));
    };

    const moveRule = (idx: number, direction: -1 | 1) => {
        const target = idx + direction;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[idx], next[target]] = [next[target], next[idx]];
        propagate(next);
    };

    // ── Quick-paste prose flow ───────────────────────────────────────
    const [pasteOpen, setPasteOpen] = React.useState(false);
    const [pasteText, setPasteText] = React.useState("");
    const [pasteError, setPasteError] = React.useState<string | null>(null);
    const applyPaste = () => {
        if (!pasteText.trim()) {
            setPasteError("Paste prose first — e.g. 'Margin %: higher is better. Return Rate: lower is better.'");
            return;
        }
        const parsed = proseToRules(pasteText);
        if (!parsed.length) {
            setPasteError("Couldn't extract any rules from this prose. Use 'X higher is better' or 'X lower is better' phrasing.");
            return;
        }
        propagate(parsed);
        setPasteOpen(false);
        setPasteText("");
        setPasteError(null);
    };

    // Wave 41 cycle 12: per-card Suggest pending flag. Indexed by card
    // index. Used to disable the button + render an inline status while the
    // async host-supplied callback resolves.
    const [suggestPending, setSuggestPending] = React.useState<Record<number, boolean>>({});

    const handleSuggestForCard = React.useCallback(async (rule: MetricRule, idx: number) => {
        if (!onSuggestForCard) return;
        setSuggestPending(prev => ({ ...prev, [idx]: true }));
        try {
            const result = onSuggestForCard(rule, idx);
            const resolved = await Promise.resolve(result);
            if (resolved) {
                // Scrub merged-in fields through the same sanitiser the form
                // uses on every keystroke. Defence-in-depth: the proxy already
                // sanitises but we re-scrub here so any future direct callers
                // (tests, fixtures) can't bypass the Wave 22 contract.
                const safe: Partial<MetricRule> = {
                    name: scrubField(resolved.name || rule.name, MAX_NAME_LEN),
                    higherIsBetter: !!resolved.higherIsBetter,
                    aliases: (resolved.aliases || []).map(a => scrubField(a, MAX_ALIAS_LEN)).filter(Boolean),
                    greenPct: typeof resolved.greenPct === "number" ? resolved.greenPct : rule.greenPct,
                    amberPct: typeof resolved.amberPct === "number" ? resolved.amberPct : rule.amberPct,
                    redPct: typeof resolved.redPct === "number" ? resolved.redPct : rule.redPct
                };
                // Re-derive next array inline so the change propagates through
                // the same `propagate` channel and downstream prose/json fire.
                const next = rules.map((r, i) => (i === idx ? { ...r, ...safe } : r));
                propagate(next);
            }
        } finally {
            setSuggestPending(prev => {
                const copy = { ...prev };
                delete copy[idx];
                return copy;
            });
        }
    }, [onSuggestForCard, rules, propagate]);

    // Computed prose / JSON for the read-only preview disclosures.
    const previewProse = React.useMemo(() => rulesToProse(rules), [rules]);
    const previewJson = React.useMemo(() => rulesToJson(rules), [rules]);
    const errors = React.useMemo(() => validateRules(rules), [rules]);
    const errorByIndex = React.useMemo(() => {
        const map = new Map<number, ValidationError[]>();
        errors.forEach(e => {
            const list = map.get(e.index) || [];
            list.push(e);
            map.set(e.index, list);
        });
        return map;
    }, [errors]);

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div className="gn-metric-rule-form" data-testid="metric-rule-form">
            <div className="gn-metric-rule-form-toolbar">
                <button
                    type="button"
                    className="gn-btn gn-btn--compact"
                    onClick={addRule}
                    disabled={readOnly || rules.length >= MAX_RULES}
                    aria-label="Add metric rule"
                    title={rules.length >= MAX_RULES ? `Maximum ${MAX_RULES} rules reached` : "Add a new metric rule"}
                >
                    + Add metric
                </button>
                <button
                    type="button"
                    className="gn-btn gn-btn--compact gn-btn--ghost"
                    onClick={() => { setPasteOpen(o => !o); setPasteError(null); }}
                    disabled={readOnly}
                    aria-expanded={pasteOpen}
                    title="Paste a block of prose and parse it into rules"
                >
                    {pasteOpen ? "Hide" : "Show"} quick paste from prose
                </button>
                <span className="gn-metric-rule-form-count">
                    {rules.length} {rules.length === 1 ? "rule" : "rules"}
                </span>
            </div>

            {pasteOpen && (
                <div className="gn-metric-rule-form-paste" role="region" aria-label="Quick paste prose">
                    <textarea
                        rows={3}
                        value={pasteText}
                        onChange={e => { setPasteText(e.target.value); setPasteError(null); }}
                        placeholder="Example: Margin % is higher-is-better: green at or above 15%, amber at 8-15%, red below 8%. Return Rate is lower-is-better: green at or below 4%, amber at 4-8%, red above 8%."
                        disabled={readOnly}
                    />
                    <div className="gn-metric-rule-form-paste-actions">
                        <button type="button" className="gn-btn gn-btn--compact" onClick={applyPaste} disabled={readOnly}>
                            Parse into form
                        </button>
                        <button type="button" className="gn-btn gn-btn--compact gn-btn--ghost" onClick={() => { setPasteOpen(false); setPasteText(""); setPasteError(null); }}>
                            Cancel
                        </button>
                        {pasteError && <span className="gn-metric-rule-form-error" role="alert">{pasteError}</span>}
                    </div>
                </div>
            )}

            {rules.length === 0 ? (
                <div className="gn-metric-rule-form-empty">
                    <p>No metric rules yet. Click <strong>+ Add metric</strong> to define your first rule, or use <strong>Quick paste from prose</strong> to migrate a block of free-text rules in one step.</p>
                </div>
            ) : (
                <ul className="gn-metric-rule-form-list">
                    {rules.map((rule, idx) => {
                        const cardErrors = errorByIndex.get(idx) || [];
                        const nameError = cardErrors.find(e => e.field === "name");
                        const thresholdError = cardErrors.find(e => e.field === "thresholds");
                        return (
                            <li key={idx} className={`gn-metric-rule-card${nameError || thresholdError ? " gn-metric-rule-card--error" : ""}`}>
                                <div className="gn-metric-rule-card-row">
                                    <label className="gn-metric-rule-card-name">
                                        <span className="gn-metric-rule-card-label">Metric name</span>
                                        <input
                                            type="text"
                                            value={rule.name}
                                            onChange={e => updateRule(idx, { name: scrubField(e.target.value, MAX_NAME_LEN) })}
                                            placeholder="e.g. Margin %"
                                            maxLength={MAX_NAME_LEN}
                                            disabled={readOnly}
                                            aria-invalid={Boolean(nameError)}
                                        />
                                        {nameError && <span className="gn-metric-rule-form-error">{nameError.message}</span>}
                                    </label>
                                    <div className="gn-metric-rule-card-direction" role="radiogroup" aria-label="Direction">
                                        <span className="gn-metric-rule-card-label">Direction</span>
                                        <label>
                                            <input
                                                type="radio"
                                                name={`gn-rule-dir-${idx}`}
                                                checked={rule.higherIsBetter}
                                                onChange={() => updateRule(idx, { higherIsBetter: true })}
                                                disabled={readOnly}
                                            />
                                            <span>Higher is better</span>
                                        </label>
                                        <label>
                                            <input
                                                type="radio"
                                                name={`gn-rule-dir-${idx}`}
                                                checked={!rule.higherIsBetter}
                                                onChange={() => updateRule(idx, { higherIsBetter: false })}
                                                disabled={readOnly}
                                            />
                                            <span>Lower is better</span>
                                        </label>
                                    </div>
                                    <div className="gn-metric-rule-card-actions">
                                        <button
                                            type="button"
                                            className="gn-btn gn-btn--compact gn-btn--ghost"
                                            onClick={() => moveRule(idx, -1)}
                                            disabled={readOnly || idx === 0}
                                            aria-label="Move rule up"
                                            title="Move up"
                                        >↑</button>
                                        <button
                                            type="button"
                                            className="gn-btn gn-btn--compact gn-btn--ghost"
                                            onClick={() => moveRule(idx, 1)}
                                            disabled={readOnly || idx === rules.length - 1}
                                            aria-label="Move rule down"
                                            title="Move down"
                                        >↓</button>
                                        {onSuggestForCard && (
                                            <button
                                                type="button"
                                                className="gn-btn gn-btn--compact gn-btn--ghost"
                                                onClick={() => { void handleSuggestForCard(rule, idx); }}
                                                disabled={readOnly || !!suggestPending[idx]}
                                                title="Ask the AI for a plausible direction and thresholds for this metric"
                                                data-testid={`metric-rule-suggest-${idx}`}
                                            >{suggestPending[idx] ? "Suggesting..." : "Suggest"}</button>
                                        )}
                                        <button
                                            type="button"
                                            className="gn-btn gn-btn--compact gn-btn--ghost"
                                            onClick={() => removeRule(idx)}
                                            disabled={readOnly}
                                            aria-label="Remove rule"
                                            title="Remove rule"
                                        >Remove</button>
                                    </div>
                                </div>

                                <div className="gn-metric-rule-card-row gn-metric-rule-card-row--thresholds">
                                    <ThresholdInput
                                        label="Green at or beyond"
                                        value={rule.greenPct}
                                        placeholder={String(DEFAULT_GREEN)}
                                        onChange={n => updateRule(idx, { greenPct: n })}
                                        disabled={readOnly}
                                    />
                                    <ThresholdInput
                                        label="Amber at"
                                        value={rule.amberPct}
                                        placeholder={String(DEFAULT_AMBER)}
                                        onChange={n => updateRule(idx, { amberPct: n })}
                                        disabled={readOnly}
                                    />
                                    <ThresholdInput
                                        label="Red at or beyond"
                                        value={rule.redPct}
                                        placeholder={String(DEFAULT_RED)}
                                        onChange={n => updateRule(idx, { redPct: n })}
                                        disabled={readOnly}
                                    />
                                </div>
                                {thresholdError && <div className="gn-metric-rule-form-error">{thresholdError.message}</div>}

                                <div className="gn-metric-rule-card-row gn-metric-rule-card-row--aliases">
                                    <label className="gn-metric-rule-card-aliases">
                                        <span className="gn-metric-rule-card-label">Aliases (comma-separated)</span>
                                        <input
                                            type="text"
                                            value={(rule.aliases || []).join(", ")}
                                            onChange={e => {
                                                const parts = e.target.value
                                                    .split(",")
                                                    .map(s => scrubField(s, MAX_ALIAS_LEN))
                                                    .filter(Boolean);
                                                updateRule(idx, { aliases: parts });
                                            }}
                                            placeholder="e.g. Returns %, Return Pct"
                                            disabled={readOnly}
                                        />
                                    </label>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <details className="gn-metric-rule-form-derived">
                <summary>Show generated prose (read-only)</summary>
                <pre className="gn-metric-rule-form-derived-pre">{previewProse || "No rules"}</pre>
            </details>
            <details className="gn-metric-rule-form-derived">
                <summary>Show structured JSON (read-only)</summary>
                <pre className="gn-metric-rule-form-derived-pre">{previewJson || "No rules"}</pre>
            </details>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ThresholdInput(props: {
    label: string;
    value: number | undefined;
    placeholder: string;
    onChange: (v: number | undefined) => void;
    disabled?: boolean;
}) {
    const display = typeof props.value === "number" && Number.isFinite(props.value) ? String(props.value) : "";
    return (
        <label className="gn-metric-rule-card-threshold">
            <span className="gn-metric-rule-card-label">{props.label}</span>
            <span className="gn-metric-rule-card-threshold-input">
                <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={display}
                    placeholder={props.placeholder}
                    onChange={e => {
                        const raw = e.target.value.trim();
                        if (raw === "") { props.onChange(undefined); return; }
                        const n = Number(raw);
                        if (!Number.isFinite(n)) { props.onChange(undefined); return; }
                        props.onChange(n);
                    }}
                    disabled={props.disabled}
                    aria-label={props.label}
                />
                <span className="gn-metric-rule-card-threshold-suffix">%</span>
            </span>
        </label>
    );
}
