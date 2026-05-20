// playground/src/components/SectionedAnswer.tsx
//
// Phase D.3 — staged-rendering UI primitive.
//
// Pure render component. Owns no network state. Consumers (AISidebar,
// workbench panels) drive it by passing a `sections` map keyed by sectionId
// whose values describe the current lifecycle state per section.
//
// Lifecycle per section:
//   pending     → skeleton placeholder ("waiting for stage N")
//   streaming   → spinner + "generating…" label (we ship tokens later)
//   completed   → final body + optional usage + per-section regenerate button
//   failed      → inline error envelope + regenerate button (retry)
//
// The component is shape-agnostic about `body` — it accepts string, JSX,
// or an object the caller pre-formats. The parent component knows the
// section's expected shape (HEADLINE = string, RECOMMENDED_ACTIONS = list,
// etc.) and is responsible for stringifying / rendering it.

import * as React from "react";

export type SectionStatus = "pending" | "streaming" | "completed" | "failed";

export interface SectionState {
    status: SectionStatus;
    /** Final body (any shape). Only meaningful when status === 'completed'. */
    body?: unknown;
    /** Failure envelope. Only meaningful when status === 'failed'. */
    error?: { message: string; code?: string };
    /** Stage-tier informational fields (rendered when present). */
    durationMs?: number;
    usage?: { input_tokens?: number; output_tokens?: number } & Record<string, unknown>;
}

export interface SectionDescriptor {
    id: string;
    /** Human-readable label, e.g. "Headline", "Trends". */
    title?: string;
}

export interface SectionedAnswerProps {
    /** Ordered list of sections to render. Determines vertical order. */
    sections: SectionDescriptor[];
    /** Lifecycle state per section. Sections absent from the map render as `pending`. */
    sectionStates: Record<string, SectionState>;
    /** Optional callback when the user clicks the per-section regenerate button. */
    onRegenerate?: (sectionId: string) => void;
    /** Render override for completed bodies. Defaults to JSON or string. */
    renderBody?: (sectionId: string, body: unknown) => React.ReactNode;
    /** True once the stream has finished (used to disable Regenerate while live). */
    isStreaming?: boolean;
}

function defaultRenderBody(_sectionId: string, body: unknown): React.ReactNode {
    if (body == null) return null;
    if (typeof body === "string") return body;
    if (React.isValidElement(body)) return body;
    try {
        return <pre className="pp-sectioned-body-json">{JSON.stringify(body, null, 2)}</pre>;
    } catch {
        return String(body);
    }
}

function titleForSection(d: SectionDescriptor): string {
    if (d.title) return d.title;
    // Convert e.g. RECOMMENDED_ACTIONS → "Recommended Actions"
    return d.id
        .split(/[_\s]+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
        .join(" ");
}

function statusLabel(s: SectionStatus): string {
    switch (s) {
        case "pending": return "Waiting…";
        case "streaming": return "Generating…";
        case "completed": return "";
        case "failed": return "Failed";
    }
}

export const SectionedAnswer: React.FC<SectionedAnswerProps> = ({
    sections,
    sectionStates,
    onRegenerate,
    renderBody = defaultRenderBody,
    isStreaming = false,
}) => {
    return (
        <ol className="pp-sectioned-answer" data-testid="pp-sectioned-answer">
            {sections.map((sec) => {
                const state = sectionStates[sec.id] ?? { status: "pending" as const };
                const status = state.status;
                const label = titleForSection(sec);

                return (
                    <li
                        key={sec.id}
                        className={`pp-sectioned-item pp-sectioned-item--${status}`}
                        data-testid={`pp-sectioned-item-${sec.id}`}
                        data-status={status}
                        aria-busy={status === "pending" || status === "streaming"}
                    >
                        <div className="pp-sectioned-head">
                            <span className="pp-sectioned-title">{label}</span>
                            {status !== "completed" && (
                                <span className="pp-sectioned-status">{statusLabel(status)}</span>
                            )}
                            {status === "completed" && onRegenerate && (
                                <button
                                    type="button"
                                    className="pp-sectioned-regen"
                                    data-testid={`pp-sectioned-regen-${sec.id}`}
                                    onClick={() => onRegenerate(sec.id)}
                                    disabled={isStreaming}
                                    aria-label={`Regenerate ${label}`}
                                    title="Regenerate this section"
                                >
                                    ↻ Regenerate
                                </button>
                            )}
                        </div>

                        {status === "pending" && (
                            <div className="pp-sectioned-skeleton" aria-hidden="true">
                                <div className="pp-skel-line" />
                                <div className="pp-skel-line pp-skel-line--short" />
                            </div>
                        )}

                        {status === "streaming" && (
                            <div className="pp-sectioned-streaming">
                                <div className="pp-skel-line pp-skel-line--pulse" />
                            </div>
                        )}

                        {status === "completed" && (
                            <div className="pp-sectioned-body" data-testid={`pp-sectioned-body-${sec.id}`}>
                                {renderBody(sec.id, state.body)}
                                {(state.durationMs != null || state.usage) && (
                                    <div className="pp-sectioned-meta">
                                        {state.durationMs != null && (
                                            <span>{Math.round(state.durationMs)} ms</span>
                                        )}
                                        {state.usage?.output_tokens != null && (
                                            <span>· {state.usage.output_tokens} tokens out</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {status === "failed" && (
                            <div className="pp-sectioned-error" role="alert">
                                <span className="pp-sectioned-error-msg">
                                    {state.error?.message ?? "Section failed."}
                                </span>
                                {onRegenerate && (
                                    <button
                                        type="button"
                                        className="pp-sectioned-regen"
                                        data-testid={`pp-sectioned-regen-${sec.id}`}
                                        onClick={() => onRegenerate(sec.id)}
                                        disabled={isStreaming}
                                    >
                                        ↻ Retry
                                    </button>
                                )}
                            </div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};

export default SectionedAnswer;
