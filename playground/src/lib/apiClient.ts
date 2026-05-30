// Defines the RFC 9457 Problem Details shape the proxy returns.
export interface ProblemDetails extends Error {
    type?: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    code?: string;
    category?: string;
    retryable?: boolean;
    requestId?: string;
    traceId?: string;
    // Legacy compatibility field kept for Pulse-PBI clients.
    error?: string;
}

export class ApiError extends Error implements ProblemDetails {
    public status: number;
    public type?: string;
    public title: string;
    public detail?: string;
    public instance?: string;
    public code?: string;
    public category?: string;
    public retryable?: boolean;
    public requestId?: string;
    public traceId?: string;
    public error?: string;

    constructor(init: Partial<ProblemDetails> & { status: number; title: string }) {
        super(init.detail || init.title);
        this.name = 'ApiError';
        this.status = init.status;
        this.type = init.type;
        this.title = init.title;
        this.detail = init.detail;
        this.instance = init.instance;
        this.code = init.code;
        this.category = init.category;
        this.retryable = init.retryable;
        this.requestId = init.requestId;
        this.traceId = init.traceId;
        this.error = init.error;
    }
}

/**
 * Standardized fetch wrapper that intercepts RFC 9457 Problem Details
 * and generates a unique Request-ID per call.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (!headers.has("X-Request-Id")) {
        headers.set("X-Request-Id", createRequestId());
    }

    const response = await fetch(input, { ...init, headers });

    if (!response.ok) {
        let problem: Partial<ProblemDetails> = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/problem+json")) {
            try {
                problem = await response.json();
            } catch {
                // Ignore parse error
            }
        } else if (contentType && contentType.includes("application/json")) {
            try {
                const body = await response.json();
                if (body && typeof body === 'object') {
                    // Legacy error shape { error: '...' } mapping
                    if (body.error && !body.detail) {
                        body.detail = body.error;
                    }
                    problem = body;
                }
            } catch {
                // Ignore parse error
            }
        }
        
        throw new ApiError({
            ...problem,
            status: response.status,
            title: problem.title || response.statusText || "API Error",
        });
    }

    return response;
}

function createRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
