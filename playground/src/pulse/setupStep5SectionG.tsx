/**
 * setupStep5SectionG.tsx
 *
 * Section G editor — the upstream Genie space sync surface.
 *
 * Three nested editors (G.1, G.2, G.3) operate on JSON-string fields
 * persisted in SetupDraft. Each editor parses its JSON on render, edits
 * the in-memory array, then re-serialises back to the draft on every
 * change so the standard Apply path persists cleanly.
 *
 * Phase A (this commit + 48.14-48.15):
 *   - G.1 text_instructions editor (list of textareas, add/remove/reorder)
 *   - G.2 sample_questions editor (list of plain inputs)
 *   - G.3 example_question_sqls editor (48.14 — full card with parameter table)
 *   - "Load from Genie" / "Show diff" buttons that hit the read-only
 *     /assistant/space-fetch passthrough.
 *
 * Phase B (48.16):
 *   - "Push to Genie space" with auth gate + confirm dialog + audit field.
 */

import * as React from "react";
import { ReactNode } from "react";
import { SetupDraft } from "./setupDraft";
import {
    TextInstruction,
    SampleQuestion,
    ExampleQuestionSQL,
    ExampleParameter,
    ExampleParameterType,
    generateGenieHexId,
    isValidGenieHexId,
    extractParameterKeywords,
} from "./genieSpaceTypes";

const PARAMETER_TYPES: ExampleParameterType[] = ["STRING", "DATE", "DATE_AND_TIME", "NUMERIC_DECIMAL", "NUMERIC_INTEGER"];

// ────────────────────────────────────────────────────────────────────────
// Helpers — parse / mutate / re-serialise the JSON-string fields
// ────────────────────────────────────────────────────────────────────────

function safeParseArray<T>(raw: string): T[] {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function serialiseArray<T>(arr: T[]): string {
    return arr.length === 0 ? "" : JSON.stringify(arr);
}

// ────────────────────────────────────────────────────────────────────────
// Section G editor
// ────────────────────────────────────────────────────────────────────────

export interface SectionGEditorProps {
    draft: SetupDraft;
    setField: (name: keyof SetupDraft, value: string) => void;
    setNum: (name: keyof SetupDraft, value: number) => void;
}

export function SectionGEditor(props: SectionGEditorProps) {
    const { draft, setField } = props;

    // Parse on every render — cheap enough for the data sizes involved
    // (Databricks caps at 100 instructions per space). Keeps the JSON
    // strings as single source of truth so persistProperties round-trips
    // cleanly via the existing Apply path.
    const textInstructions = safeParseArray<TextInstruction>(draft.genieTextInstructionsJson);
    const sampleQuestions = safeParseArray<SampleQuestion>(draft.genieSampleQuestionsJson);
    const exampleSqls = safeParseArray<ExampleQuestionSQL>(draft.genieExampleSqlsJson);

    const slotCount = textInstructions.length + exampleSqls.length;
    const SLOT_LIMIT = 100;
    const SLOT_WARN = 80;

    // ── G.1 mutators ────────────────────────────────────────────────────
    const updateTextInstructions = (next: TextInstruction[]) => {
        setField("genieTextInstructionsJson", serialiseArray(next));
    };
    const addTextInstruction = () => {
        updateTextInstructions([
            ...textInstructions,
            { id: generateGenieHexId(), content: [""] },
        ]);
    };
    const removeTextInstruction = (idx: number) => {
        updateTextInstructions(textInstructions.filter((_, i) => i !== idx));
    };
    const editTextInstruction = (idx: number, content: string) => {
        const next = textInstructions.map((ti, i) =>
            i === idx ? { ...ti, content: content ? [content] : [] } : ti
        );
        updateTextInstructions(next);
    };
    const moveTextInstruction = (idx: number, dir: -1 | 1) => {
        const next = [...textInstructions];
        const target = idx + dir;
        if (target < 0 || target >= next.length) return;
        [next[idx], next[target]] = [next[target], next[idx]];
        updateTextInstructions(next);
    };

    // ── G.2 mutators ────────────────────────────────────────────────────
    const updateSampleQuestions = (next: SampleQuestion[]) => {
        setField("genieSampleQuestionsJson", serialiseArray(next));
    };
    const addSampleQuestion = () => {
        updateSampleQuestions([
            ...sampleQuestions,
            { id: generateGenieHexId(), question: [""] },
        ]);
    };
    const removeSampleQuestion = (idx: number) => {
        updateSampleQuestions(sampleQuestions.filter((_, i) => i !== idx));
    };
    const editSampleQuestion = (idx: number, q: string) => {
        const next = sampleQuestions.map((sq, i) =>
            i === idx ? { ...sq, question: [q] } : sq
        );
        updateSampleQuestions(next);
    };

    return (
        <div className="gn-setup-section-g">

            {/* Slot limit indicator — The upstream Genie space caps total instructions at 100 */}
            <div className={`gn-setup-section-g-slots${slotCount >= SLOT_LIMIT ? " gn-setup-section-g-slots--full" : slotCount >= SLOT_WARN ? " gn-setup-section-g-slots--warn" : ""}`}>
                <strong>{slotCount}</strong> of {SLOT_LIMIT} instruction slots used
                {slotCount >= SLOT_LIMIT && <> · <em>limit reached — remove entries to add more</em></>}
                {slotCount >= SLOT_WARN && slotCount < SLOT_LIMIT && <> · <em>approaching the limit</em></>}
            </div>

            {/* G.1 — Text instructions */}
            <details className="gn-setup-section-g-area" open>
                <summary>
                    G.1 · Text instructions <span className="gn-setup-advanced-summary-hint">{textInstructions.length} entr{textInstructions.length === 1 ? "y" : "ies"}</span>
                </summary>
                <div className="gn-setup-section-g-body">
                    <p className="gn-setup-field-hint">
                        Free-form domain guidance pushed to the upstream Genie space's
                        <code> instructions.text_instructions[]</code>. Each entry is sent verbatim as a system-level
                        instruction on every Genie session for this space.
                    </p>
                    {textInstructions.length === 0 && (
                        <div className="gn-setup-section-g-empty">No text instructions yet. Use <strong>Load from Genie</strong> in the toolbar above to pull existing entries, or <strong>Add instruction</strong> below to author one locally.</div>
                    )}
                    {textInstructions.map((ti, idx) => (
                        <SectionGCard
                            key={ti.id}
                            id={ti.id}
                            valid={isValidGenieHexId(ti.id)}
                            onMoveUp={idx > 0 ? () => moveTextInstruction(idx, -1) : undefined}
                            onMoveDown={idx < textInstructions.length - 1 ? () => moveTextInstruction(idx, 1) : undefined}
                            onRemove={() => removeTextInstruction(idx)}
                        >
                            <textarea
                                rows={4}
                                value={(ti.content || []).join("\n")}
                                onChange={e => editTextInstruction(idx, e.target.value)}
                                placeholder={"e.g. Use FISCAL_YEAR not CALENDAR_YEAR.\nNet sales = SUM(sales) − SUM(returned_sales)."}
                            />
                        </SectionGCard>
                    ))}
                    <button
                        type="button"
                        className="gn-btn gn-btn--compact"
                        onClick={addTextInstruction}
                        disabled={slotCount >= SLOT_LIMIT}
                        title={slotCount >= SLOT_LIMIT ? "Instruction slot limit reached" : "Add a new text instruction"}
                    >
                        + Add instruction
                    </button>
                </div>
            </details>

            {/* G.2 — Sample questions */}
            <details className="gn-setup-section-g-area">
                <summary>
                    G.2 · Sample questions <span className="gn-setup-advanced-summary-hint">{sampleQuestions.length} entr{sampleQuestions.length === 1 ? "y" : "ies"}</span>
                </summary>
                <div className="gn-setup-section-g-body">
                    <p className="gn-setup-field-hint">
                        Curated suggestions surfaced in the Databricks Genie UI as
                        <code> config.sample_questions[]</code>. Also used as starter prompts in this visual's
                        Welcome pane when present (IDEA-006).
                    </p>
                    {sampleQuestions.length === 0 && (
                        <div className="gn-setup-section-g-empty">No sample questions yet. Add starter questions that demonstrate what the space can answer.</div>
                    )}
                    {sampleQuestions.map((sq, idx) => (
                        <SectionGCard
                            key={sq.id}
                            id={sq.id}
                            valid={isValidGenieHexId(sq.id)}
                            onRemove={() => removeSampleQuestion(idx)}
                        >
                            <input
                                type="text"
                                value={(sq.question || [""])[0] || ""}
                                onChange={e => editSampleQuestion(idx, e.target.value)}
                                placeholder="e.g. What is total sales by region for the last quarter?"
                            />
                        </SectionGCard>
                    ))}
                    <button type="button" className="gn-btn gn-btn--compact" onClick={addSampleQuestion}>
                        + Add sample question
                    </button>
                </div>
            </details>

            {/* G.3 — Trusted SQL examples. Full editor with parameter table. */}
            <details className="gn-setup-section-g-area">
                <summary>
                    G.3 · Trusted SQL examples <span className="gn-setup-advanced-summary-hint">{exampleSqls.length} entr{exampleSqls.length === 1 ? "y" : "ies"} · the strongest hallucination-reducer available in Genie</span>
                </summary>
                <div className="gn-setup-section-g-body">
                    <p className="gn-setup-field-hint">
                        Parameterised SQL templates Genie can run directly (when the user's question matches exactly,
                        the answer is labelled <em>Trusted</em>) or use as few-shot exemplars (for similar but
                        non-identical questions). The strongest hallucination-reducer available in Genie — populate
                        sparingly with known-good queries that you'd hand-write yourself.
                    </p>
                    {exampleSqls.length === 0 && (
                        <div className="gn-setup-section-g-empty">
                            No trusted SQL examples yet. Use <strong>Load from Genie</strong> in the toolbar above to
                            pull existing entries from the upstream Genie space, or <strong>Add SQL example</strong> below
                            to author one locally.
                        </div>
                    )}
                    {exampleSqls.map((eq, idx) => (
                        <ExampleSqlCard
                            key={eq.id}
                            example={eq}
                            onChange={(next) => {
                                const arr = exampleSqls.map((e, i) => i === idx ? next : e);
                                setField("genieExampleSqlsJson", serialiseArray(arr));
                            }}
                            onRemove={() => {
                                const arr = exampleSqls.filter((_, i) => i !== idx);
                                setField("genieExampleSqlsJson", serialiseArray(arr));
                            }}
                        />
                    ))}
                    <button
                        type="button"
                        className="gn-btn gn-btn--compact"
                        disabled={slotCount >= SLOT_LIMIT}
                        title={slotCount >= SLOT_LIMIT ? "Instruction slot limit reached" : "Add a new SQL example"}
                        onClick={() => {
                            const next: ExampleQuestionSQL[] = [
                                ...exampleSqls,
                                {
                                    id: generateGenieHexId(),
                                    question: "",
                                    sql: "",
                                    parameters: [],
                                    usage_guidance: "",
                                },
                            ];
                            setField("genieExampleSqlsJson", serialiseArray(next));
                        }}
                    >
                        + Add SQL example
                    </button>
                </div>
            </details>

            {/* Last sync timestamp — informational. Updated by the Push button (48.16). */}
            {draft.lastSpaceSyncAt > 0 && (
                <div className="gn-setup-section-g-sync-info">
                    Last pushed to AI: <strong>{new Date(draft.lastSpaceSyncAt).toLocaleString()}</strong>
                </div>
            )}

        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// SectionGCard — generic wrapper for an editable instruction entry.
// Renders the entry's id (truncated), reorder/remove controls, and
// passes children for the editor surface (textarea / input / SQL block).
// ────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────
// ExampleSqlCard — one trusted SQL example with parameter table.
// Auto-detects :name tokens from the SQL on blur and pre-populates the
// parameter rows. The author confirms the type per parameter.
// ────────────────────────────────────────────────────────────────────────

function ExampleSqlCard(props: {
    example: ExampleQuestionSQL;
    onChange: (next: ExampleQuestionSQL) => void;
    onRemove: () => void;
}) {
    const { example, onChange, onRemove } = props;
    const idPreview = example.id.length === 32 ? example.id.slice(0, 8) + "…" : example.id;
    const idValid = isValidGenieHexId(example.id);

    const parameters = example.parameters || [];
    const sqlKeywords = extractParameterKeywords(example.sql);
    const declaredKeywords = new Set(parameters.map(p => p.keyword));

    // Two warning conditions that authors should resolve before pushing:
    //   1. SQL references :name but the parameter row is missing.
    //   2. A parameter row exists for a name that's not in the SQL.
    const missingDecl = sqlKeywords.filter(k => !declaredKeywords.has(k));
    const orphanDecl = parameters.filter(p => !sqlKeywords.includes(p.keyword));

    // Auto-populate on blur — adds rows for any :name tokens that don't
    // already have a declaration. Defaults to STRING; author tunes the type.
    const autoPopulateParameters = () => {
        const newParams = [...parameters];
        for (const k of sqlKeywords) {
            if (!declaredKeywords.has(k)) {
                newParams.push({
                    keyword: k,
                    display_name: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                    type: "STRING",
                });
            }
        }
        onChange({ ...example, parameters: newParams });
    };

    const updateParameter = (idx: number, patch: Partial<ExampleParameter>) => {
        const next = parameters.map((p, i) => i === idx ? { ...p, ...patch } : p);
        onChange({ ...example, parameters: next });
    };
    const removeParameter = (idx: number) => {
        const next = parameters.filter((_, i) => i !== idx);
        onChange({ ...example, parameters: next });
    };
    const addParameterRow = () => {
        onChange({
            ...example,
            parameters: [...parameters, { keyword: "", display_name: "", type: "STRING" }],
        });
    };

    return (
        <fieldset className="gn-setup-section-g-card gn-setup-section-g-sql-card">
            <legend>
                <code title={example.id}>{idPreview}</code>
                {!idValid && (
                    <span className="gn-setup-section-g-card-warning">⚠ malformed id</span>
                )}
                <span className="gn-setup-section-g-card-actions">
                    <button type="button" className="gn-btn gn-btn--compact" disabled title="Wired in 48.16 — runs the SQL with placeholder param values via the warehouse">Validate</button>
                    <button type="button" className="gn-btn gn-btn--compact" onClick={onRemove} aria-label="Remove">✕</button>
                </span>
            </legend>

            <div className="gn-setup-field">
                <label>Question</label>
                <input
                    type="text"
                    value={example.question}
                    onChange={e => onChange({ ...example, question: e.target.value })}
                    placeholder="e.g. Top 10 customers by revenue"
                />
                <span className="gn-setup-field-hint">
                    Natural-language form of the question this SQL answers. Genie matches user questions against this string for exact-match firing.
                </span>
            </div>

            <div className="gn-setup-field">
                <label>SQL <span className="gn-setup-field-optional">(use <code>:name</code> for parameters)</span></label>
                <textarea
                    rows={6}
                    value={example.sql}
                    onChange={e => onChange({ ...example, sql: e.target.value })}
                    onBlur={autoPopulateParameters}
                    placeholder={"SELECT customer_id, SUM(amount) AS revenue\nFROM main.sales.orders\nWHERE order_date >= :start_date\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 10"}
                    spellCheck={false}
                    style={{ fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace", fontSize: 11 }}
                />
                <span className="gn-setup-field-hint">
                    Read-only Databricks SQL. Use <code>:name</code> for bind parameters. The parameter table below is auto-populated when you blur out of this field.
                </span>
            </div>

            {/* Parameter table — keyword + display name + type dropdown */}
            <div className="gn-setup-field">
                <label>
                    Parameters
                    {(missingDecl.length > 0 || orphanDecl.length > 0) && (
                        <span className="gn-setup-section-g-card-warning" style={{ marginLeft: 8 }}>
                            {missingDecl.length > 0 && <>⚠ missing declarations: {missingDecl.map(k => `:${k}`).join(", ")} </>}
                            {orphanDecl.length > 0 && <>⚠ orphan rows: {orphanDecl.map(p => `:${p.keyword}`).join(", ")}</>}
                        </span>
                    )}
                </label>
                {parameters.length === 0 && (
                    <div className="gn-setup-section-g-empty" style={{ padding: 8 }}>
                        No parameters declared. {sqlKeywords.length > 0 && <>SQL contains {sqlKeywords.length} <code>:name</code> token(s); blur out of the SQL field to auto-populate, or click <strong>Add row</strong>.</>}
                    </div>
                )}
                {parameters.length > 0 && (
                    <table className="gn-setup-section-g-param-table">
                        <thead>
                            <tr>
                                <th>Keyword (<code>:name</code>)</th>
                                <th>Display name</th>
                                <th>Type</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {parameters.map((p, i) => (
                                <tr key={i}>
                                    <td>
                                        <input
                                            type="text"
                                            value={p.keyword}
                                            onChange={e => updateParameter(i, { keyword: e.target.value })}
                                            placeholder="start_date"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={p.display_name}
                                            onChange={e => updateParameter(i, { display_name: e.target.value })}
                                            placeholder="Start date"
                                        />
                                    </td>
                                    <td>
                                        <select
                                            value={p.type}
                                            onChange={e => updateParameter(i, { type: e.target.value as ExampleParameterType })}
                                        >
                                            {PARAMETER_TYPES.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <button type="button" className="gn-btn gn-btn--compact" onClick={() => removeParameter(i)} aria-label="Remove parameter">✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <button type="button" className="gn-btn gn-btn--compact" onClick={addParameterRow} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    + Add row
                </button>
            </div>

            <div className="gn-setup-field">
                <label>Usage guidance <span className="gn-setup-field-optional">(optional)</span></label>
                <input
                    type="text"
                    value={example.usage_guidance ?? ""}
                    onChange={e => onChange({ ...example, usage_guidance: e.target.value })}
                    placeholder="e.g. Use when user asks ranking by revenue"
                />
                <span className="gn-setup-field-hint">
                    Helps Genie pick when to apply this template. Plain English — what kind of question this answers.
                </span>
            </div>
        </fieldset>
    );
}

function SectionGCard(props: {
    id: string;
    valid: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRemove: () => void;
    children: ReactNode;
}) {
    const idPreview = props.id.length === 32 ? props.id.slice(0, 8) + "…" : props.id;
    return (
        <fieldset className="gn-setup-section-g-card">
            <legend>
                <code title={props.id}>{idPreview}</code>
                {!props.valid && (
                    <span className="gn-setup-section-g-card-warning" title="ID is not a valid 32-char lowercase hex — The upstream Genie service will reject this entry on Push">
                        ⚠ malformed id
                    </span>
                )}
                <span className="gn-setup-section-g-card-actions">
                    {props.onMoveUp && (
                        <button type="button" className="gn-btn gn-btn--compact" onClick={props.onMoveUp} aria-label="Move up">↑</button>
                    )}
                    {props.onMoveDown && (
                        <button type="button" className="gn-btn gn-btn--compact" onClick={props.onMoveDown} aria-label="Move down">↓</button>
                    )}
                    <button type="button" className="gn-btn gn-btn--compact" onClick={props.onRemove} aria-label="Remove">✕</button>
                </span>
            </legend>
            {props.children}
        </fieldset>
    );
}
