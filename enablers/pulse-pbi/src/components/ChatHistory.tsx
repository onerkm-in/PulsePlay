import * as React from "react";
import { GenieVisualSettings } from "../settings";
import { ChatMessage, FieldValidation, FeedbackRating } from "../visualTypes";
import { fmt } from "../visualHelpers";
import { GenieDataView } from "./GenieDataView";

interface ChatHistoryProps {
    chatRef: React.RefObject<HTMLDivElement | null>;
    messages: ChatMessage[];
    loading: boolean;
    progressStatus: string;
    fieldValidation: FieldValidation;
    settings: GenieVisualSettings;
    quickPrompts: string[];
    connectionReady: boolean;
    onQuickPrompt: (prompt: string) => void;
    onSubmitFeedback: (messageId: string, rating: FeedbackRating) => Promise<void>;
    onFinalizeFeedback: (messageId: string) => Promise<void>;
    onUpdateFeedbackComment: (messageId: string, comment: string) => void;
    onFollowUp?: (text: string) => void;
}

/** Try to extract the source view/table name from a SQL query */
function extractSourceView(sql: string | undefined): string | null {
    if (!sql) return null;
    const match = sql.match(/\bFROM\s+`?(\w+(?:\.\w+)*)`?/i);
    return match ? match[1] : null;
}

/**
 * Gather follow-up suggestions: prefer API-provided follow-ups,
 * fall back to detecting trailing questions from the response text.
 */
function getFollowUps(message: ChatMessage): string[] {
    // API-provided follow-ups take priority
    if (message.followUpQuestions && message.followUpQuestions.length > 0) {
        return message.followUpQuestions;
    }
    // Fall back to text-based detection
    const lines = message.content.trim().split("\n");
    if (lines.length < 2) return [];
    const candidates: string[] = [];
    // Check last 3 lines for question patterns
    for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.endsWith("?") && line.length > 15 && line.length < 300) {
            candidates.push(line);
        }
    }
    return candidates;
}

/** Strip detected follow-up lines from the response body */
function stripFollowUps(content: string, followUps: string[]): string {
    if (followUps.length === 0) return content;
    const lines = content.trim().split("\n");
    const followUpSet = new Set(followUps.map(f => f.trim()));
    const filtered = lines.filter(line => !followUpSet.has(line.trim()));
    return filtered.join("\n").trimEnd();
}

export function ChatHistory({
    chatRef,
    messages,
    loading,
    progressStatus,
    fieldValidation,
    settings,
    quickPrompts,
    connectionReady,
    onQuickPrompt,
    onSubmitFeedback,
    onFinalizeFeedback,
    onUpdateFeedbackComment,
    onFollowUp
}: ChatHistoryProps): React.JSX.Element {
    return (
        <div className="rx-chat" ref={chatRef}>
            {messages.length === 0 && !loading && (
                <div className="rx-empty-state" role="status" aria-live="polite">
                    {!connectionReady ? (
                        <>
                            <div className="rx-empty-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                            </div>
                            <div className="rx-empty-kicker">Setup required</div>
                            <h3>Configure this visual</h3>
                            <p>Open <strong>Format visual &gt; Genie Settings</strong> to set workspace URL, token, and Genie Space ID.</p>
                        </>
                    ) : !fieldValidation.hasAssignedFields ? (
                        <>
                            <div className="rx-empty-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                                </svg>
                            </div>
                            <div className="rx-empty-kicker">Almost ready</div>
                            <h3>Add data fields</h3>
                            <p>Drag at least one measure or dimension into this visual's data wells to provide report context for Genie.</p>
                        </>
                    ) : (
                        <>
                            <div className="rx-empty-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <div className="rx-empty-kicker">Ready</div>
                            <h3>Ask Genie a question</h3>
                            <p>Ask a business question below or pick a suggestion to get started.</p>
                            {quickPrompts.length > 0 && (
                                <div className="rx-prompt-row">
                                    {quickPrompts.map(prompt => (
                                        <button
                                            key={prompt}
                                            className="rx-prompt"
                                            aria-label={`Use quick prompt: ${prompt}`}
                                            onClick={() => onQuickPrompt(prompt)}
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {messages.map((message, index) => {
                if (message.role === "user") {
                    return (
                        <div key={message.id || `${message.role}-${index}`} className="rx-msg rx-msg--user">
                            <div className="rx-user-bubble">
                                {message.content}
                            </div>
                        </div>
                    );
                }

                // Assistant / system message — Genie-style layout
                const followUps = getFollowUps(message);
                const body = stripFollowUps(message.content, followUps);
                const sourceView = extractSourceView(message.sql);

                return (
                    <div key={message.id || `${message.role}-${index}`} className="rx-msg rx-msg--assistant">
                        <div className="rx-genie-response">
                            {/* Analysis header — shows source view and SQL */}
                            {message.sql && (
                                <details className="rx-analysis">
                                    <summary className="rx-analysis-summary">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                        <span>Analysis (click to view)</span>
                                        {sourceView && (
                                            <span className="rx-analysis-source">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                                                {sourceView}
                                            </span>
                                        )}
                                        <span className="rx-analysis-tag">SQL Query</span>
                                    </summary>
                                    <pre className="rx-sql-block">{message.sql}</pre>
                                </details>
                            )}

                            {/* Text response */}
                            <div className="rx-response-text" dangerouslySetInnerHTML={{ __html: fmt(body) }} />

                            {/* Data view (table + chart) */}
                            {message.data && (
                                <GenieDataView
                                    data={message.data}
                                    sql={message.sql}
                                    showSql={settings.showSql}
                                    title={message.queryTitle}
                                />
                            )}

                            {/* Follow-up suggestions */}
                            {followUps.length > 0 && onFollowUp && (
                                <div className="rx-followups">
                                    {followUps.map((q, i) => (
                                        <button key={i} className="rx-followup" onClick={() => onFollowUp(q)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 18 15 12 9 6" />
                                            </svg>
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Feedback row */}
                            <div className="rx-feedback">
                                {message.feedback?.submitted ? (
                                    <span className="rx-feedback-label rx-feedback-label--done">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        Feedback saved
                                    </span>
                                ) : (
                                    <>
                                        <span className="rx-feedback-label">Was this helpful?</span>
                                        <button
                                            className={`rx-feedback-btn${message.feedback?.rating === "up" ? " rx-feedback-btn--active" : ""}`}
                                            disabled={message.feedback?.submitted}
                                            onClick={() => void onSubmitFeedback(message.id, "up")}
                                            aria-label="Thumbs up"
                                            title="Helpful"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                            </svg>
                                        </button>
                                        <button
                                            className={`rx-feedback-btn${message.feedback?.rating === "down" ? " rx-feedback-btn--active" : ""}`}
                                            disabled={message.feedback?.submitted}
                                            onClick={() => void onSubmitFeedback(message.id, "down")}
                                            aria-label="Thumbs down"
                                            title="Not helpful"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Feedback comment form for thumbs down */}
                            {message.feedback?.rating === "down" && !message.feedback.submitted && (
                                <div className="rx-feedback-form">
                                    <textarea
                                        className="rx-textarea rx-textarea--feedback"
                                        value={message.feedback.comment}
                                        onChange={event => onUpdateFeedbackComment(message.id, event.target.value)}
                                        placeholder="What was wrong with this response?"
                                    />
                                    <button className="rx-btn rx-btn--primary rx-btn--sm" onClick={() => void onFinalizeFeedback(message.id)}>Submit</button>
                                </div>
                            )}
                            {message.feedback?.error && (
                                <p className="rx-feedback-error">{message.feedback.error}</p>
                            )}
                        </div>
                    </div>
                );
            })}

            {loading && (
                <div className="rx-msg rx-msg--assistant">
                    <div className="rx-genie-response rx-genie-response--loading">
                        <div className="rx-loading-dots">
                            <span /><span /><span />
                        </div>
                        <span className="rx-loading-text">{progressStatus || "Thinking..."}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
