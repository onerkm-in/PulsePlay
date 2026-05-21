/**
 * Databricks Genie API client used by the Power BI custom visual.
 *
 * Power BI Desktop can block `fetch` inside the custom-visual sandbox even when
 * outbound web access is allowed. XHR remains the more reliable option here, so
 * this client keeps all browser calls on top of `XMLHttpRequest`.
 */

export interface GenieConfig {
    host: string;
    apiBaseUrl?: string;
    assistantProfile?: string;
    proxyKey?: string;
    token: string;
    spaceId: string;
}

export interface GenieMessage {
    id: string;
    status: string;
    content?: string;
    sqlQuery?: string;
    queryResult?: { columns: string[]; rows: any[][] };
    queryTitle?: string;
    followUpQuestions?: string[];
    error?: string;
}

export interface GenieFeedbackPayload {
    conversationId?: string | null;
    messageId?: string | null;
    rating: "up" | "down";
    comment?: string;
    question?: string;
    answer?: string;
    sql?: string;
    trace?: string[];
    scope?: string;
}

type HttpMethod = "GET" | "POST";

const PULSE_PBI_CLIENT = "pulse-pbi";
const PULSE_PBI_CLIENT_VERSION = "2.1.0.0";

let requestSequence = 0;

function createPulseRequestId(): string {
    return `pbi-${Date.now()}-${(++requestSequence).toString(36).padStart(4, "0")}`;
}

export class GenieClient {
    private host: string;
    private apiBaseUrl: string;
    private assistantProfile: string;
    private proxyKey: string;
    private token: string;
    private spaceId: string;

    constructor(config: GenieConfig) {
        this.host = config.host.replace(/\/$/, "");
        this.apiBaseUrl = (config.apiBaseUrl ?? "").replace(/\/$/, "");
        this.assistantProfile = (config.assistantProfile ?? "").trim();
        this.proxyKey = (config.proxyKey ?? "").trim();
        this.token = config.token;
        this.spaceId = config.spaceId;
    }

    private isProxyMode(): boolean {
        return this.apiBaseUrl.length > 0;
    }

    private directBaseUrl(): string {
        return `${this.host}/api/2.0/genie/spaces/${this.spaceId}`;
    }

    private assistantBaseUrl(): string {
        return `${this.apiBaseUrl}/assistant`;
    }

    // Centralizes headers, timeout handling, and proxy behavior.
    private request(method: HttpMethod, url: string, body?: object, options?: { sharedProxy?: boolean }): Promise<any> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);

            if (options?.sharedProxy) {
                this.attachSharedProxyHeaders(xhr);
            } else if (this.token.trim()) {
                xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
            }
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.timeout = 30000;

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch {
                        resolve({ raw: xhr.responseText });
                    }
                    return;
                }

                let detail = xhr.responseText.substring(0, 300);
                try {
                    const parsed = JSON.parse(xhr.responseText);
                    detail = parsed?.error ?? parsed?.detail ?? parsed?.title ?? detail;
                } catch {
                    // Keep the raw slice above.
                }
                reject(new Error(
                    `${this.isProxyMode() ? "PulsePlay proxy" : "Databricks API"} returned ${xhr.status}: ${detail}`
                ));
            };

            xhr.onerror = () => {
                reject(new Error(
                    "Power BI Desktop blocked the browser request before Databricks returned an HTTP response. " +
                    "This is usually a custom-visual WebAccess, TLS, proxy, or CORS/preflight restriction rather than a bad Genie Space ID. " +
                    "If the host is reachable outside Power BI, use a backend proxy/service instead of direct browser calls."
                ));
            };

            xhr.ontimeout = () => {
                reject(new Error("Request timed out after 30 seconds. Check your network and Databricks host URL."));
            };

            xhr.send(body ? JSON.stringify(body) : null);
        });
    }

    private attachSharedProxyHeaders(xhr: XMLHttpRequest): void {
        const requestId = createPulseRequestId();
        xhr.setRequestHeader("X-Pulse-Client", PULSE_PBI_CLIENT);
        xhr.setRequestHeader("X-Pulse-Client-Version", PULSE_PBI_CLIENT_VERSION);
        xhr.setRequestHeader("X-Pulse-Request-Id", requestId);
        xhr.setRequestHeader("X-Request-Id", requestId);
        if (this.proxyKey) {
            xhr.setRequestHeader("X-PulsePlay-Key", this.proxyKey);
        }
        if (this.assistantProfile) {
            xhr.setRequestHeader("X-Assistant-Profile", this.assistantProfile);
        }
        this.attachInlineCredentialsHeaders(xhr);
    }

    private attachInlineCredentialsHeaders(xhr: XMLHttpRequest): void {
        const host = this.host.trim();
        const token = this.token.trim();
        const spaceId = this.spaceId.trim();
        if (!host || !token || !spaceId) {
            return;
        }

        xhr.setRequestHeader("X-Databricks-Host", host);
        xhr.setRequestHeader("X-Databricks-Token", token);
        xhr.setRequestHeader("X-Genie-Space-Id", spaceId);
        if (this.assistantProfile) {
            xhr.setRequestHeader("X-Profile-Name", this.assistantProfile);
        }
    }

    private proxyBody(content: string): Record<string, string> {
        return {
            content,
            ...(this.assistantProfile ? { assistantProfile: this.assistantProfile } : {}),
            ...(this.spaceId.trim() ? { spaceId: this.spaceId.trim() } : {})
        };
    }

    private proxyRequest(method: HttpMethod, path: string, body?: object): Promise<any> {
        return this.request(method, `${this.assistantBaseUrl()}${path}`, body, { sharedProxy: true });
    }

    async testConnection(): Promise<{ ok: boolean; detail: string }> {
        try {
            if (this.isProxyMode()) {
                const profile = this.assistantProfile || "default";
                const data = await this.proxyRequest("GET", `/capabilities?assistantProfile=${encodeURIComponent(profile)}`);
                return {
                    ok: true,
                    detail: `Connected through shared PulsePlay proxy. Profile: ${data.assistantProfile ?? profile}.`
                };
            }

            const data = await this.request("GET", `${this.directBaseUrl()}/conversations`);
            return {
                ok: true,
                detail: `Connected. ${(data.conversations || []).length} existing conversation(s) found.`
            };
        } catch (err: any) {
            return { ok: false, detail: err?.message ?? "Unknown error" };
        }
    }

    async startConversation(content: string): Promise<{ conversationId: string; messageId: string }> {
        const data = this.isProxyMode()
            ? await this.proxyRequest("POST", "/conversations/start", this.proxyBody(content))
            : await this.request("POST", `${this.directBaseUrl()}/start-conversation`, { content });
        return {
            conversationId: data.conversation_id ?? data.conversation?.id,
            messageId: data.message_id ?? data.message?.id ?? data.id
        };
    }

    async sendMessage(conversationId: string, content: string): Promise<string> {
        const data = this.isProxyMode()
            ? await this.proxyRequest("POST", `/conversations/${conversationId}/messages`, this.proxyBody(content))
            : await this.request(
                "POST",
                `${this.directBaseUrl()}/conversations/${conversationId}/messages`,
                { content }
            );
        return data.id ?? data.message_id;
    }

    async waitForMessage(conversationId: string, messageId: string): Promise<GenieMessage> {
        return this.waitForMessageWithProgress(conversationId, messageId);
    }

    async waitForMessageWithProgress(
        conversationId: string,
        messageId: string,
        onProgress?: (status: string, raw: any) => void
    ): Promise<GenieMessage> {
        const maxAttempts = 40;
        for (let i = 0; i < maxAttempts; i++) {
            // Poll every second so completed answers surface quickly without
            // adding a noticeable client-side delay on top of Genie latency.
            await sleep(1000);
            try {
                const data = this.isProxyMode()
                    ? await this.proxyRequest(
                        "GET",
                        `/conversations/${conversationId}/messages/${messageId}?assistantProfile=${encodeURIComponent(this.assistantProfile)}&spaceId=${encodeURIComponent(this.spaceId)}`
                    )
                    : await this.request(
                        "GET",
                        `${this.directBaseUrl()}/conversations/${conversationId}/messages/${messageId}`
                    );

                const status: string = (data.status ?? "").toUpperCase();
                onProgress?.(status, data);
                if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
                    const parsed = this.parseMessage(data);

                    // If there's a query attachment with no inline result, fetch it
                    // from the separate query-result endpoint.
                    if (parsed.sqlQuery && !parsed.queryResult) {
                        const attachmentId = this.findQueryAttachmentId(data);
                        if (attachmentId) {
                            const qr = await this.fetchQueryResult(conversationId, messageId, attachmentId);
                            if (qr) {
                                parsed.queryResult = qr;
                            }
                        }
                    }

                    return parsed;
                }
            } catch {
                // Ignore transient polling failures and continue waiting.
            }
        }

        throw new Error("Genie response timed out after 60 seconds.");
    }

    async submitFeedback(payload: GenieFeedbackPayload): Promise<boolean> {
        // Feedback capture is proxy-only so secrets and downstream logging stay
        // under server-side control instead of being handled in the browser.
        if (!this.isProxyMode()) {
            return false;
        }

        await this.request("POST", `${this.apiBaseUrl}/feedback`, {
            ...payload,
            ...(this.assistantProfile ? { assistantProfile: this.assistantProfile } : {}),
            ...(this.spaceId.trim() ? { spaceId: this.spaceId.trim() } : {})
        }, { sharedProxy: true });
        return true;
    }

    // Fetch the query result from the dedicated endpoint. Genie returns query
    // metadata inline in the message attachments but the actual result rows
    // live at a separate URL.
    private async fetchQueryResult(
        conversationId: string,
        messageId: string,
        attachmentId: string
    ): Promise<{ columns: string[]; rows: any[][] } | null> {
        try {
            const data = await this.request(
                "GET",
                `${this.directBaseUrl()}/conversations/${conversationId}/messages/${messageId}/query-result/${attachmentId}`
            );
            return this.parseQueryResultResponse(data);
        } catch {
            return null;
        }
    }

    // The query-result endpoint can return data in multiple formats depending
    // on the Databricks platform version. Handle all known shapes.
    private parseQueryResultResponse(data: any): { columns: string[]; rows: any[][] } | null {
        // Format 1: statement_response wrapper (most common)
        if (data.statement_response) {
            const sr = data.statement_response;
            const manifest = sr.manifest;
            const cols = manifest?.schema?.columns ?? manifest?.columns ?? [];
            const columns = cols.map((c: any) => c.name ?? String(c));
            const rows = sr.result?.data_array ?? sr.result?.data_table ?? [];
            if (columns.length > 0 && rows.length > 0) {
                return { columns, rows };
            }
        }

        // Format 2: direct columns + data_array
        if (data.columns && data.data_array) {
            return {
                columns: data.columns.map((c: any) => c.name ?? String(c)),
                rows: data.data_array
            };
        }

        // Format 3: direct columns + rows (legacy)
        if (data.columns && data.rows) {
            return {
                columns: data.columns.map((c: any) => c.name ?? String(c)),
                rows: data.rows
            };
        }

        return null;
    }

    // Find the attachment ID for the first query attachment.
    // Databricks uses `attachment_id` as the key, not `id`.
    private findQueryAttachmentId(data: any): string | null {
        if (!data.attachments) return null;
        for (const att of data.attachments) {
            if (att.query && (att.attachment_id ?? att.id)) {
                return att.attachment_id ?? att.id;
            }
        }
        return null;
    }

    // Genie responses can contain multiple attachment types. This parser extracts
    // the ones the visual can render directly: text, SQL, tabular results,
    // follow-up suggestions, and query metadata.
    private parseMessage(data: any): GenieMessage {
        const msg: GenieMessage = {
            id: data.id ?? data.message_id ?? "",
            status: data.status ?? "UNKNOWN"
        };

        if (typeof data.sqlQuery === "string" && data.sqlQuery.trim()) {
            msg.sqlQuery = data.sqlQuery;
        }
        if (typeof data.queryTitle === "string" && data.queryTitle.trim()) {
            msg.queryTitle = data.queryTitle;
        }
        const topLevelResult = this.parseTopLevelQueryResult(data.queryResult);
        if (topLevelResult) {
            msg.queryResult = topLevelResult;
        }

        // Follow-up suggestions can appear at the message level
        const followUps = data.follow_up_questions ?? data.followUpQuestions ?? data.suggested_questions;
        if (Array.isArray(followUps) && followUps.length > 0) {
            msg.followUpQuestions = followUps.map((q: any) => typeof q === "string" ? q : q.content ?? q.text ?? String(q));
        }

        if (data.attachments) {
            for (const att of data.attachments) {
                // Text attachment
                if (att.text?.content) {
                    msg.content = att.text.content;
                }

                // Query attachment — metadata and optional inline result
                if (att.query) {
                    if (att.query.query) {
                        msg.sqlQuery = att.query.query;
                    }
                    // Query title from Genie (used as chart title)
                    if (att.query.title) {
                        msg.queryTitle = att.query.title;
                    } else if (att.query.description) {
                        msg.queryTitle = att.query.description;
                    }

                    // Try inline result (some API versions embed it)
                    const result = att.query?.result;
                    if (result) {
                        // Direct data_table + columns
                        if (result.data_table && result.columns) {
                            msg.queryResult = {
                                columns: result.columns.map((c: any) => c.name ?? String(c)),
                                rows: result.data_table
                            };
                        }
                        // Wrapped in statement_response
                        else {
                            const parsed = this.parseQueryResultResponse(result);
                            if (parsed) {
                                msg.queryResult = parsed;
                            }
                        }
                    }
                }

                // Follow-up / suggested questions attachment
                // Databricks returns these as a separate attachment with key `suggested_questions`
                const followUpList = att.suggested_questions ?? att.follow_up_questions ?? att.followUpQuestions;
                if (Array.isArray(followUpList) && followUpList.length > 0) {
                    msg.followUpQuestions = followUpList.map((q: any) =>
                        typeof q === "string" ? q : q.content ?? q.text ?? String(q)
                    );
                }
            }
        }

        if (!msg.content && data.content) {
            msg.content = data.content;
        }

        if (data.status === "FAILED") {
            msg.error = data.error ?? "Genie returned an error.";
        }

        return msg;
    }

    private parseTopLevelQueryResult(data: any): { columns: string[]; rows: any[][] } | null {
        if (!data || typeof data !== "object") {
            return null;
        }
        if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) {
            return null;
        }
        return {
            columns: data.columns.map((c: any) => typeof c === "string" ? c : c?.name ?? String(c)),
            rows: data.rows
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
