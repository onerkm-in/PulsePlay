import * as React from "react";
import { FieldValidation } from "../visualTypes";

interface ComposeAreaProps {
    question: string;
    status: string;
    canInteract: boolean;
    loading: boolean;
    connectionReady: boolean;
    fieldValidation: FieldValidation;
    onQuestionChange: (value: string) => void;
    onSend: (text: string) => void;
}

export function ComposeArea({
    question,
    status,
    canInteract,
    loading,
    connectionReady,
    fieldValidation,
    onQuestionChange,
    onSend
}: ComposeAreaProps): React.JSX.Element {
    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canInteract && !loading && question.trim()) {
                onSend(question);
            }
        }
    }

    return (
        <div className="rx-compose">
            {status && <div className="rx-status">{status}</div>}
            <div className="rx-compose-row">
                <textarea
                    className="rx-textarea rx-textarea--compose"
                    aria-label="Question for Genie"
                    value={question}
                    onChange={event => onQuestionChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        !connectionReady
                            ? "Configure settings in Format > Genie Settings first."
                            : !fieldValidation.hasAssignedFields
                                ? "Add data fields to the visual to get started."
                                : "Ask a question..."
                    }
                    rows={1}
                />
                <div className="rx-compose-actions">
                    <button
                        className="rx-btn rx-btn--primary"
                        aria-label="Send question to Genie"
                        disabled={!canInteract || loading || !question.trim()}
                        onClick={() => onSend(question)}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
