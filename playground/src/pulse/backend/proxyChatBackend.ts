/**
 * proxyChatBackend — shared base for proxy-routed chat-completion backends.
 *
 * Azure OpenAI and AWS Bedrock both surface a Genie-shaped response envelope
 * out of the proxy ({ conversation_id, message_id, status: 'COMPLETED',
 * content }). They differ only in the route prefix (`/openai/*` vs
 * `/bedrock/*`) and the noun used in error messages. This class encapsulates
 * the XHR plumbing so each concrete backend (OpenAIBackend, BedrockBackend)
 * is a 5-line subclass.
 *
 * Replaces the earlier throw-stub pattern in OpenAIBackend / BedrockBackend.
 * Calls the proxy routes that already exist in proxy/server.js — no proxy
 * code changes needed for these to work end-to-end.
 *
 * XHR-only (no fetch) per the project tripwire — Power BI Desktop's visual
 * sandbox blocks fetch.
 */

import {
    AssistantHomePayload,
    GenieConfig,
    GenieMessage,
} from "../genie";
import {
    ConversationOptions,
    ConversationResult,
    ProgressCallback,
    SingleSpaceBackend,
} from "./BackendAdapter";

interface ProxyChatResponse {
    conversation_id?: string;
    conversationId?: string;
    message_id?: string;
    messageId?: string;
    status?: string;
    content?: string;
    error?: string;
}

export class ProxyChatBackend implements SingleSpaceBackend {
    constructor(
        protected config: GenieConfig,
        /** Route prefix under apiBaseUrl: "openai" or "bedrock". */
        protected routePrefix: string,
        /** Display label used in error messages and the home payload. */
        protected backendLabel: string,
    ) {
        if (!config.apiBaseUrl) {
            throw new Error(`${backendLabel} backend requires apiBaseUrl (proxy URL).`);
        }
    }

    private inflightAborts: (() => void)[] = [];

    private xhrJson<T>(method: "GET" | "POST", path: string, body?: any): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const base = (this.config.apiBaseUrl || "").replace(/\/$/, "");
            xhr.open(method, `${base}${path}`, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this.config.proxyKey) xhr.setRequestHeader("X-Genie-Key", this.config.proxyKey);
            if (this.config.assistantProfile) xhr.setRequestHeader("X-Assistant-Profile", this.config.assistantProfile);
            // 2026-05-27 — promoted from 180s → COMPLEX (5 min) per the
            // central timeout policy. Proxy chat backend handles full
            // Genie/Foundation roundtrips; 5 min covers cold-cache cases.
            xhr.timeout = 300_000;  // COMPLEX_REQUEST_TIMEOUT_MS
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { reject(new Error(`${this.backendLabel}: non-JSON response (HTTP ${xhr.status})`)); }
                } else {
                    let detail = "";
                    try { detail = JSON.parse(xhr.responseText)?.error || ""; } catch { /* ignore */ }
                    reject(new Error(`${this.backendLabel}: HTTP ${xhr.status}${detail ? ` — ${detail}` : ""}`));
                }
            };
            xhr.onerror = () => reject(new Error(`${this.backendLabel}: network error reaching proxy`));
            xhr.ontimeout = () => reject(new Error(`${this.backendLabel}: request timed out`));
            const aborter = () => { try { xhr.abort(); } catch { /* ignore */ } };
            this.inflightAborts.push(aborter);
            xhr.send(body ? JSON.stringify(body) : undefined);
        });
    }

    async startConversation(request: any, options?: ConversationOptions): Promise<ConversationResult> {
        const content = typeof request === "string" ? request : (request?.content || "");
        const fullContent = options?.contextText ? `${options.contextText}\n\n${content}` : content;
        const data = await this.xhrJson<ProxyChatResponse>("POST", `/${this.routePrefix}/conversations/start`, {
            assistantProfile: this.config.assistantProfile,
            content: fullContent,
        });
        const convId = data.conversationId || data.conversation_id || "";
        const msgId = data.messageId || data.message_id || "";
        if (!convId) throw new Error(`${this.backendLabel}: proxy returned no conversation_id (${data.error || "unknown"})`);
        return { conversationId: convId, messageId: msgId };
    }

    async sendMessage(conversationId: string, request: any, options?: ConversationOptions): Promise<ConversationResult> {
        const content = typeof request === "string" ? request : (request?.content || "");
        const fullContent = options?.contextText ? `${options.contextText}\n\n${content}` : content;
        const data = await this.xhrJson<ProxyChatResponse>("POST", `/${this.routePrefix}/conversations/${encodeURIComponent(conversationId)}/messages`, {
            assistantProfile: this.config.assistantProfile,
            content: fullContent,
        });
        const msgId = data.messageId || data.message_id || "";
        if (!msgId) throw new Error(`${this.backendLabel}: proxy returned no message_id`);
        return { conversationId, messageId: msgId };
    }

    async waitForMessageWithProgress(_conversationId: string, messageId: string, _onProgress?: ProgressCallback): Promise<GenieMessage> {
        // Both proxy routes return the answer inline in message_id (JSON-packed)
        // because OpenAI / Bedrock are synchronous — no Genie-style polling.
        // Unpack here so callers receive a normal GenieMessage shape.
        try {
            const packed = JSON.parse(messageId);
            return {
                id: packed.id || messageId,
                status: packed.status || "COMPLETED",
                attachments: [{ text: { content: packed.content || "" } }],
                // Forward the failure cause so a FAILED synchronous (OpenAI /
                // Bedrock) answer surfaces the real reason instead of a blank
                // "failed" with no detail. Client error-extractors read `error`.
                ...(packed.error ? { error: packed.error } : {}),
            } as unknown as GenieMessage;
        } catch {
            // Older response shape — message_id is just the id string and
            // there's no inline content. Return COMPLETED with empty body.
            return {
                id: messageId,
                status: "COMPLETED",
                attachments: [{ text: { content: "" } }],
            } as unknown as GenieMessage;
        }
    }

    cancel(): void {
        const aborts = this.inflightAborts;
        this.inflightAborts = [];
        aborts.forEach(a => { try { a(); } catch { /* ignore */ } });
    }

    async testConnection(): Promise<{ ok: boolean; detail: string }> {
        try {
            const r = await this.xhrJson<{ ok?: boolean; error?: string; model?: string }>("GET", `/${this.routePrefix}/health`);
            if (r.ok === false) return { ok: false, detail: r.error || `${this.backendLabel} health failed` };
            return { ok: true, detail: `${this.backendLabel} reachable${r.model ? ` (model=${r.model})` : ""}` };
        } catch (err: any) {
            return { ok: false, detail: err?.message || "Network error" };
        }
    }

    async testQuestion(question?: string): Promise<{ ok: boolean; detail: string }> {
        try {
            const conv = await this.startConversation(question || "Reply with the single word OK.");
            const msg = await this.waitForMessageWithProgress(conv.conversationId, conv.messageId);
            const text = (msg as any)?.attachments?.[0]?.text?.content || "";
            return { ok: !!text, detail: text ? `${this.backendLabel} replied: ${text.slice(0, 80)}` : "Empty response" };
        } catch (err: any) {
            return { ok: false, detail: err?.message || "Test failed" };
        }
    }

    async getHome(_context: any): Promise<AssistantHomePayload> {
        // Cloud LLM backends don't have a Genie-style suggested-questions
        // home payload; resolve to a minimal one so the visual's home tab
        // doesn't break.
        return {
            cards: [],
            suggestedQuestions: [],
            landingMessage: `Connected to ${this.backendLabel} via proxy.`,
        } as unknown as AssistantHomePayload;
    }
}
