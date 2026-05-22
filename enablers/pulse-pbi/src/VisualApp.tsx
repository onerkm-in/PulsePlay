import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GenieFeedbackPayload, GenieMessage } from "./genie";
import { QUICK_PROMPTS } from "./visualConstants";
import {
    buildFeedbackPayload,
    buildFullContext,
    buildGenieRequest,
    createGenieClient,
    createMessageMeta,
    createUserMessage,
    describeScope,
    formatGenieProgress,
    getConfigIssues,
    validateAssignedFields
} from "./visualHelpers";
import { AppProps, ChatMessage, FeedbackRating, SelectableContextItem } from "./visualTypes";
import { ChatHistory } from "./components/ChatHistory";
import { ComposeArea } from "./components/ComposeArea";
import { ContextStrip } from "./components/ContextStrip";
import { ConnectionState, useConnectionState } from "./hooks/useConnectionState";

/**
 * Main UI container — a clean chat interface with minimal chrome.
 */
export function VisualApp(props: AppProps): React.JSX.Element {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [question, setQuestion] = useState("");
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [progressStatus, setProgressStatus] = useState("");
    const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
    const chatRef = useRef<HTMLDivElement | null>(null);

    const missingConfig = useMemo(() => getConfigIssues(props.settings), [props.settings]);
    const fieldValidation = useMemo(
        () => validateAssignedFields(props.context, props.settings.genieFields),
        [props.context, props.settings.genieFields]
    );
    const connectionReady = missingConfig.length === 0;
    const client = useMemo(
        () => (connectionReady ? createGenieClient(props.settings) : null),
        [connectionReady, props.settings]
    );
    const scope = useMemo(() => describeScope(props.context), [props.context]);
    const contextText = useMemo(
        () => buildFullContext(props.context, props.settings.domainGuidance),
        [props.context, props.settings.domainGuidance]
    );
    const contextLines = useMemo(
        () => contextText.split("\n").filter(Boolean).length,
        [contextText]
    );
    const canInteract = connectionReady
        && fieldValidation.hasAssignedFields
        && (!fieldValidation.hasConfiguredGenieFields || fieldValidation.hasAnyMatch);

    const { connectionState, connectionDetail } = useConnectionState(props.settings, client, connectionReady);

    useEffect(() => {
        if (missingConfig.length > 0) {
            setStatus("Complete the visual settings in Format > Genie Settings.");
        } else if (!fieldValidation.hasAssignedFields) {
            setStatus("Add at least one field to the visual's data wells.");
        } else if (fieldValidation.hasAssignedFields && !fieldValidation.hasAnyMatch) {
            setStatus("Bound fields do not match the configured Genie view.");
        } else {
            setStatus("");
        }
    }, [missingConfig.length, fieldValidation.hasAssignedFields, fieldValidation.hasAnyMatch]);

    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [messages, loading]);

    useEffect(() => {
        const availableIds = new Set(props.selectableContext.map(item => item.id));
        setSelectedContextIds(current => current.filter(id => availableIds.has(id)));
    }, [props.selectableContext]);

    async function sendQuestion(text: string): Promise<void> {
        const trimmed = text.trim();
        if (!trimmed || !canInteract) {
            return;
        }

        const requestContent = buildGenieRequest(trimmed, contextText);
        setMessages(current => [...current, createUserMessage(trimmed)]);
        setQuestion("");
        setLoading(true);
        setProgressStatus("");

        setStatus("Sending request to Genie...");
        let requestTrace: string[] = [];

        try {
            if (!client) {
                throw new Error("Connection is not fully configured.");
            }

            let messageId: string;
            let nextConversationId = conversationId;

            if (!nextConversationId) {
                const start = await client.startConversation(requestContent);
                nextConversationId = start.conversationId;
                messageId = start.messageId;
                setConversationId(start.conversationId);
            } else {
                messageId = await client.sendMessage(nextConversationId, requestContent);
            }

            setStatus("Waiting for Genie to answer...");
            const directResult: GenieMessage = await client.waitForMessageWithProgress(
                nextConversationId!,
                messageId,
                rawStatus => {
                    const friendly = formatGenieProgress(rawStatus);
                    setProgressStatus(friendly);
                    if (requestTrace[requestTrace.length - 1] !== friendly) {
                        requestTrace = [...requestTrace, friendly];
                    }
                    setStatus(`Waiting for Genie... ${friendly}`);
                }
            );

            if (directResult.error) {
                setMessages(current => [...current, {
                    id: `assistant-error-${Date.now()}`,
                    role: "assistant",
                    content: `Request failed.\n${directResult.error ?? "Genie did not return a successful answer."}`,
                    sql: directResult.sqlQuery,
                    feedback: { comment: "", submitted: false },
                    data: directResult.queryResult,
                    queryTitle: directResult.queryTitle,
                    followUpQuestions: directResult.followUpQuestions,
                    meta: createMessageMeta(nextConversationId, directResult.id, scope, contextLines, requestTrace, trimmed)
                }]);
                setStatus("Genie returned an error.");
            } else {
                setMessages(current => [...current, {
                    id: `assistant-${directResult.id || Date.now()}`,
                    role: "assistant",
                    content: directResult.content ?? "(No text response returned.)",
                    sql: directResult.sqlQuery,
                    feedback: { comment: "", submitted: false },
                    data: directResult.queryResult,
                    queryTitle: directResult.queryTitle,
                    followUpQuestions: directResult.followUpQuestions,
                    meta: createMessageMeta(nextConversationId, directResult.id, scope, contextLines, requestTrace, trimmed)
                }]);
                setStatus("");
            }
        } catch (error: any) {
            const message = error?.message ?? "Unknown error";
            const networkHint = /fetch|network|cors|blocked/i.test(message)
                ? "\n\nThe request was blocked before reaching Databricks. Check WebAccess policy, proxy configuration, or CORS settings."
                : "";
            setMessages(current => [...current, {
                id: `assistant-network-${Date.now()}`,
                role: "assistant",
                content: `Request failed.\n${message}${networkHint}`,
                feedback: { comment: "", submitted: false }
            }]);
            setStatus("Network or configuration error.");
        } finally {
            setLoading(false);
            setProgressStatus("");
        }
    }

    function resetConversation(): void {
        setConversationId(null);
        setMessages([]);
        setStatus("");
    }

    async function submitFeedback(messageId: string, rating: FeedbackRating): Promise<void> {
        const message = messages.find(item => item.id === messageId);
        if (!message || message.role !== "assistant") {
            return;
        }
        setMessages(current => current.map(item =>
            item.id === messageId
                ? { ...item, feedback: { rating, comment: item.feedback?.comment ?? "", submitted: rating === "up" ? item.feedback?.submitted ?? false : false, error: undefined } }
                : item
        ));
        if (rating === "down") {
            return;
        }
        await finalizeFeedback(messageId, "up");
    }

    async function finalizeFeedback(messageId: string, forcedRating?: FeedbackRating): Promise<void> {
        const message = messages.find(item => item.id === messageId);
        if (!message || message.role !== "assistant") {
            return;
        }
        const rating = forcedRating ?? message.feedback?.rating;
        if (!rating) {
            return;
        }
        if (rating === "down" && !message.feedback?.comment.trim()) {
            setMessages(current => current.map(item =>
                item.id === messageId
                    ? { ...item, feedback: { rating, comment: item.feedback?.comment ?? "", submitted: false, error: "Comment is required for thumbs down feedback." } }
                    : item
            ));
            return;
        }
        const payload: GenieFeedbackPayload = buildFeedbackPayload(message, rating);
        try {
            const submitted = client ? await client.submitFeedback(payload) : false;
            setMessages(current => current.map(item =>
                item.id === messageId
                    ? { ...item, feedback: { rating, comment: item.feedback?.comment ?? "", submitted, error: submitted ? undefined : "Feedback capture requires proxy mode with API Base URL Override." } }
                    : item
            ));
        } catch (error: any) {
            setMessages(current => current.map(item =>
                item.id === messageId
                    ? { ...item, feedback: { rating, comment: item.feedback?.comment ?? "", submitted: false, error: error?.message ?? "Failed to submit feedback." } }
                    : item
            ));
        }
    }

    function updateFeedbackComment(messageId: string, comment: string): void {
        setMessages(current => current.map(item =>
            item.id === messageId
                ? { ...item, feedback: { rating: item.feedback?.rating, comment, submitted: false, error: undefined } }
                : item
        ));
    }

    async function handleContextSelection(item: SelectableContextItem): Promise<void> {
        await props.onSelectContext(item);
        setSelectedContextIds([item.id]);
    }

    async function handleClearContextSelection(): Promise<void> {
        await props.onClearContextSelection();
        setSelectedContextIds([]);
    }

    return (
        <div className={`rx-shell${props.compact ? " rx-shell--compact" : ""}${props.settings.darkMode ? " rx-shell--dark" : ""}`}>
            <header className="rx-header">
                <div className="rx-header-left">
                    <div className="rx-title">Genie</div>
                </div>
                <div className="rx-header-actions">
                    <div
                        className={getConnectionIndicatorClass(connectionState)}
                        title={connectionDetail || getConnectionIndicatorLabel(connectionState)}
                        aria-label={connectionDetail || getConnectionIndicatorLabel(connectionState)}
                    >
                        <span className="rx-connection-dot" />
                        <span>{getConnectionIndicatorLabel(connectionState)}</span>
                    </div>
                    <button className="rx-btn rx-btn--ghost rx-btn--sm" onClick={resetConversation} title="Start a new conversation">
                        New chat
                    </button>
                </div>
            </header>

            <div className="rx-chat-body">
                {props.selectableContext.length > 0 && (
                    <ContextStrip
                        selectableContext={props.selectableContext}
                        selectedContextIds={selectedContextIds}
                        onSelect={item => void handleContextSelection(item)}
                        onClear={() => void handleClearContextSelection()}
                    />
                )}

                <ChatHistory
                    chatRef={chatRef}
                    messages={messages}
                    loading={loading}
                    progressStatus={progressStatus}
                    fieldValidation={fieldValidation}
                    settings={props.settings}
                    quickPrompts={QUICK_PROMPTS}
                    connectionReady={connectionReady}
                    onQuickPrompt={text => void sendQuestion(text)}
                    onSubmitFeedback={submitFeedback}
                    onFinalizeFeedback={finalizeFeedback}
                    onUpdateFeedbackComment={updateFeedbackComment}
                    onFollowUp={text => void sendQuestion(text)}
                />

                <ComposeArea
                    question={question}
                    status={status}
                    canInteract={canInteract}
                    loading={loading}
                    connectionReady={connectionReady}
                    fieldValidation={fieldValidation}
                    onQuestionChange={setQuestion}
                    onSend={text => void sendQuestion(text)}
                />
            </div>
        </div>
    );
}

function getConnectionIndicatorClass(state: ConnectionState): string {
    switch (state) {
        case "online":
            return "rx-connection-indicator rx-connection-indicator--online";
        case "offline":
        case "not_configured":
            return "rx-connection-indicator rx-connection-indicator--offline";
        case "checking":
        default:
            return "rx-connection-indicator rx-connection-indicator--checking";
    }
}

function getConnectionIndicatorLabel(state: ConnectionState): string {
    switch (state) {
        case "online":
            return "Connected";
        case "offline":
            return "Unavailable";
        case "checking":
            return "Checking";
        case "not_configured":
        default:
            return "Not configured";
    }
}
