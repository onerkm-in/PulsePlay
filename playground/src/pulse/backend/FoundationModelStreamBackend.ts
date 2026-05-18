/**
 * FoundationModelStreamBackend — SingleSpaceBackend that streams tokens
 * from the proxy's `/foundation/conversations/start-stream` NDJSON route.
 *
 * Why this exists:
 *   The standard FoundationModelBackend (and all other backends) are
 *   poll-based or request-response — no content appears until the full
 *   response arrives. For Foundation Model endpoints (Databricks Mosaic AI
 *   serving) the LLM can emit the first token within 2-3s. This backend
 *   consumes those tokens via XHR `onprogress` and fires the optional
 *   `onContentChunk` callback (BackendAdapter.ContentChunkCallback) so the
 *   visual can render sections as they arrive rather than waiting 60-90s
 *   for the complete response.
 *
 * XHR (not fetch) — kept compatible with the Power BI Desktop visual
 * sandbox that blocks fetch. `onprogress` is supported in all XHR
 * implementations including the PBI sandbox.
 *
 * Protocol:
 *   POST /foundation/conversations/start-stream
 *   Response: application/x-ndjson, one JSON object per line:
 *     {"t":"token"}           — content token, accumulated by this class
 *     {"s":"SECTION NAME"}    — section boundary (informational for now)
 *     {"done":true,"content":"...","usage":{...}}  — terminal event
 *     {"error":"message"}     — upstream failure
 *
 * Integration:
 *   BackendFactory returns this class when connectionMode is
 *   "foundation-stream". The visual.tsx runStage passes a 4th
 *   `onContentChunk` callback to waitForMessageWithProgress; this backend
 *   calls it with the accumulated content after each token so the stage's
 *   content slot updates in real time.
 */

import type { GenieConfig, GenieMessage, AssistantHomePayload } from "../genie";
import type { ConversationOptions, ConversationResult, ProgressCallback, ContentChunkCallback, SingleSpaceBackend } from "./BackendAdapter";

/** NDJSON line shapes emitted by /foundation/conversations/start-stream. */
interface StreamToken  { t: string }
interface StreamSection { s: string }
interface StreamDone   { done: true; content: string; usage?: Record<string, number> }
interface StreamError  { error: string }
type StreamEvent = StreamToken | StreamSection | StreamDone | StreamError;

export class FoundationModelStreamBackend implements SingleSpaceBackend {
    private readonly apiBase: string;
    private readonly config: GenieConfig;
    /** Holds the in-flight streaming XHR so cancel() can abort it. */
    private inflightXhr: XMLHttpRequest | null = null;

    constructor(config: GenieConfig) {
        this.config = config;
        if (!config.apiBaseUrl) {
            throw new Error("FoundationModelStreamBackend requires apiBaseUrl (proxy URL).");
        }
        this.apiBase = config.apiBaseUrl.replace(/\/$/, "");
    }

    /**
     * Fires the streaming request and returns a fake ConversationResult
     * immediately. The actual streaming happens in waitForMessageWithProgress.
     * We pack the full userPrompt into the messageId so the wait call can
     * re-issue the same streaming request (the upstream route is stateless).
     */
    async startConversation(request: any, options?: ConversationOptions): Promise<ConversationResult> {
        const content = typeof request === "string" ? request : (request?.content || "");
        const fullContent = options?.contextText ? `${options.contextText}\n\n${content}` : content;
        // Pack prompt into messageId — waitForMessageWithProgress unpacks it.
        return {
            conversationId: "fm-stream",
            messageId: JSON.stringify({ prompt: fullContent }),
        };
    }

    async sendMessage(_conversationId: string, request: any, options?: ConversationOptions): Promise<ConversationResult> {
        return this.startConversation(request, options);
    }

    /**
     * Opens the streaming XHR, fires onContentChunk as tokens arrive, and
     * resolves with a GenieMessage when {"done":true} is received.
     *
     * onProgress — called with human-readable status strings ("Streaming…").
     * onContentChunk — called with the full accumulated content after each
     *   token so the caller can update the rendered section in real time.
     */
    waitForMessageWithProgress(
        _conversationId: string,
        messageId: string,
        onProgress?: ProgressCallback,
        onContentChunk?: ContentChunkCallback,
    ): Promise<GenieMessage> {
        return new Promise<GenieMessage>((resolve, reject) => {
            let userPrompt = messageId;
            try {
                const packed = JSON.parse(messageId);
                if (packed?.prompt) userPrompt = packed.prompt;
            } catch { /* messageId is raw prompt string */ }

            const xhr = new XMLHttpRequest();
            this.inflightXhr = xhr;

            xhr.open("POST", `${this.apiBase}/foundation/conversations/start-stream`, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this.config.proxyKey) xhr.setRequestHeader("X-Genie-Key", this.config.proxyKey);
            if (this.config.assistantProfile) xhr.setRequestHeader("X-Assistant-Profile", this.config.assistantProfile);
            xhr.timeout = 120000;

            let parsedOffset = 0;
            let accumulated = "";
            let resolved = false;

            const parseNewLines = () => {
                const newText = xhr.responseText.slice(parsedOffset);
                if (!newText) return;

                const lines = newText.split("\n");
                // Last element may be incomplete — leave it in the buffer.
                const completeLines = lines.slice(0, -1);
                parsedOffset += newText.length - lines[lines.length - 1].length;

                for (const line of completeLines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    let event: StreamEvent;
                    try {
                        event = JSON.parse(trimmed) as StreamEvent;
                    } catch {
                        continue; // malformed — skip
                    }

                    if ("t" in event) {
                        accumulated += event.t;
                        onContentChunk?.(accumulated);
                    } else if ("s" in event) {
                        onProgress?.(`Streaming ${event.s}…`);
                    } else if ("done" in event && event.done) {
                        if (!resolved) {
                            resolved = true;
                            this.inflightXhr = null;
                            resolve({
                                id: "fm-stream-result",
                                status: "COMPLETED",
                                content: event.content || accumulated,
                                attachments: [{ text: { content: event.content || accumulated } }],
                            } as unknown as GenieMessage);
                        }
                    } else if ("error" in event) {
                        if (!resolved) {
                            resolved = true;
                            this.inflightXhr = null;
                            reject(new Error(`Foundation Model stream: ${event.error}`));
                        }
                    }
                }
            };

            xhr.onprogress = () => {
                onProgress?.("Streaming response…");
                parseNewLines();
            };

            xhr.onload = () => {
                parseNewLines(); // flush any remaining complete lines
                if (!resolved) {
                    resolved = true;
                    this.inflightXhr = null;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve({
                            id: "fm-stream-result",
                            status: "COMPLETED",
                            content: accumulated,
                            attachments: [{ text: { content: accumulated } }],
                        } as unknown as GenieMessage);
                    } else {
                        reject(new Error(`Foundation Model stream: HTTP ${xhr.status}`));
                    }
                }
            };

            xhr.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    this.inflightXhr = null;
                    reject(new Error("Foundation Model stream: network error"));
                }
            };

            xhr.ontimeout = () => {
                if (!resolved) {
                    resolved = true;
                    this.inflightXhr = null;
                    reject(new Error("Foundation Model stream: request timed out after 120s"));
                }
            };

            onProgress?.("Connecting to Foundation Model…");

            xhr.send(JSON.stringify({
                assistantProfile: this.config.assistantProfile || "",
                userPrompt,
            }));
        });
    }

    cancel(): void {
        try { this.inflightXhr?.abort(); } catch { /* ignore */ }
        this.inflightXhr = null;
    }

    async testConnection(): Promise<{ ok: boolean; detail: string }> {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", `${this.apiBase}/foundation/health`, true);
            xhr.timeout = 8000;
            xhr.onload = () => {
                try {
                    const r = JSON.parse(xhr.responseText);
                    resolve({ ok: r.configured !== false, detail: `FM stream reachable (${r.defaultProfile || "no profile"})` });
                } catch {
                    resolve({ ok: xhr.status < 300, detail: `HTTP ${xhr.status}` });
                }
            };
            xhr.onerror = () => resolve({ ok: false, detail: "Network error reaching proxy" });
            xhr.ontimeout = () => resolve({ ok: false, detail: "Health check timed out" });
            xhr.send();
        });
    }

    async testQuestion(question?: string): Promise<{ ok: boolean; detail: string }> {
        try {
            const conv = await this.startConversation(question || "Reply with the single word OK.");
            const msg = await this.waitForMessageWithProgress(conv.conversationId, conv.messageId);
            const text = (msg as any)?.content || "";
            return { ok: !!text, detail: text ? `FM stream replied: ${text.slice(0, 80)}` : "Empty response" };
        } catch (err: any) {
            return { ok: false, detail: err?.message || "Test failed" };
        }
    }

    async getHome(_context: any): Promise<AssistantHomePayload> {
        return {
            cards: [],
            suggestedQuestions: [],
            landingMessage: "Connected to Foundation Model (streaming) via proxy.",
        } as unknown as AssistantHomePayload;
    }
}
