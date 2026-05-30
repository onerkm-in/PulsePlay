// playground/src/components/workbench/FollowUpQuestions.tsx
//
// Renders Genie-supplied follow-up question chips below the artifact card.
// Clicking a chip re-submits via the workbench composer's ask() callback
// so the conversation continues with the same connector and context.
//
// Step 6 — additive Pulse asset reuse. The Pulse-PBI sibling renders
// suggested-question chips in its own pattern; this is a workbench-native
// equivalent driven off the same Genie response field.

import React from 'react';

export interface FollowUpQuestionsProps {
    /** Genie-supplied follow-up question strings, never fabricated. */
    readonly questions: ReadonlyArray<string>;
    /** Submit handler — typically the workbench composer's ask() callback. */
    readonly onAsk: (question: string) => void;
    /** When true, chips render in a disabled state (still visible). */
    readonly disabled?: boolean;
    /** Max number of chips to render; default 5. Excess is dropped, not truncated. */
    readonly maxChips?: number;
}

export const FollowUpQuestions: React.FC<FollowUpQuestionsProps> = ({ questions, onAsk, disabled, maxChips = 5 }) => {
    const list = (questions ?? []).filter((q) => typeof q === 'string' && q.trim().length > 0).slice(0, maxChips);
    if (list.length === 0) return null;

    return (
        <aside
            className="workbench-followups"
            data-testid="workbench-followups"
            aria-label="Genie-suggested follow-up questions"
        >
            <div className="workbench-followups-label">Try next:</div>
            <div className="workbench-followups-chips">
                {list.map((q, i) => (
                    <button
                        key={`${i}-${q.slice(0, 32)}`}
                        type="button"
                        className="workbench-followup-chip"
                        disabled={disabled}
                        onClick={() => onAsk(q)}
                        data-testid={`workbench-followup-chip-${i}`}
                        title={q}
                    >
                        {q}
                    </button>
                ))}
            </div>
        </aside>
    );
};
