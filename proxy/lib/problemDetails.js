// @ts-check
'use strict';

const crypto = require('crypto');

const DEFAULT_TYPE_BASE = 'https://pulseplay.local/problems';
const UNEXPECTED_INTERNAL_SENTINEL = 'PulsePlay could not complete this request. Share the support code with your administrator.';

const REDACTION_PATTERNS = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /\bdapi[a-z0-9]{12,}\b/gi,
    /\b(token|secret|password|apikey|api_key|client_secret|authorization)\s*[:=]\s*['"]?[^'",\s}]+/gi,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

function generateRequestId() {
    if (typeof crypto.randomUUID === 'function') return `srv-${crypto.randomUUID()}`;
    return `srv-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function sanitizeRequestId(value) {
    const raw = typeof value === 'string' ? value : '';
    const clean = raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
    return clean || generateRequestId();
}

function ensureRequestId(req, res) {
    const headerRid = req?.headers?.['x-request-id'];
    const incoming = typeof req?.requestId === 'string'
        ? req.requestId
        : (typeof headerRid === 'string' ? headerRid : '');
    const requestId = sanitizeRequestId(incoming);
    if (req) req.requestId = requestId;
    if (res && !res.headersSent) res.setHeader('X-Request-Id', requestId);
    return requestId;
}

function supportCodeFor(requestId, code) {
    const suffix = String(requestId || 'unknown').replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'unknown';
    return `${String(code || 'PROBLEM').toUpperCase()}-${suffix}`;
}

function redactProblemCause(value) {
    if (value === undefined || value === null) return value;
    if (value instanceof Error) return redactProblemCause({ name: value.name, message: value.message, stack: value.stack });
    if (Array.isArray(value)) return value.map(item => redactProblemCause(item));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            if (/token|secret|password|apikey|api_key|authorization/i.test(key)) {
                out[key] = '[redacted]';
            } else {
                out[key] = redactProblemCause(nested);
            }
        }
        return out;
    }
    if (typeof value !== 'string') return value;
    return REDACTION_PATTERNS.reduce(
        (acc, pattern) => acc.replace(pattern, match => {
            if (/^Bearer\s+/i.test(match)) return 'Bearer [redacted]';
            const keyMatch = match.match(/^([^:=]+)([:=])/);
            if (keyMatch) return `${keyMatch[1]}${keyMatch[2]}[redacted]`;
            return '[redacted]';
        }),
        value,
    );
}

function isSafeCauseKey(key) {
    return /^(provider|route|method|upstreamStatus|status|code|category|retryable|target|operation)$/i.test(key);
}

function safeCauseObject(cause) {
    if (!cause || typeof cause !== 'object' || cause instanceof Error || Array.isArray(cause)) {
        return undefined;
    }
    const out = {};
    for (const [key, value] of Object.entries(cause)) {
        if (!isSafeCauseKey(key)) continue;
        out[key] = redactProblemCause(value);
    }
    return Object.keys(out).length ? out : undefined;
}

function createProblem(options = {}) {
    const status = Number(options.status || 500);
    const code = String(options.code || (status >= 500 ? 'UNEXPECTED_PROXY_ERROR' : 'REQUEST_FAILED')).toUpperCase();
    const requestId = options.requestId || '';
    const detail = String(options.detail || (status >= 500 ? UNEXPECTED_INTERNAL_SENTINEL : 'PulsePlay could not process this request.'));
    const title = String(options.title || (status >= 500 ? 'Unexpected proxy error' : 'Request failed'));
    const category = String(options.category || (status >= 500 ? 'unexpected_internal' : 'request_error'));
    const problem = {
        type: String(options.type || `${DEFAULT_TYPE_BASE}/${code.toLowerCase().replace(/_/g, '-')}`),
        title,
        status,
        detail,
        instance: String(options.instance || ''),
        code,
        category,
        severity: String(options.severity || (status >= 500 ? 'error' : 'warning')),
        retryable: Boolean(options.retryable),
        requestId,
        supportCode: String(options.supportCode || supportCodeFor(requestId, code)),
        error: String(options.error || detail),
    };
    const userAction = options.userAction;
    const operatorAction = options.operatorAction;
    const provider = options.provider;
    const upstreamStatus = options.upstreamStatus;
    const target = options.target;
    const links = options.links;
    const errors = options.errors;
    const cause = safeCauseObject(options.cause);
    if (userAction) problem.userAction = String(userAction);
    if (operatorAction) problem.operatorAction = String(operatorAction);
    if (provider) problem.provider = String(provider);
    if (upstreamStatus !== undefined) problem.upstreamStatus = Number(upstreamStatus);
    if (target) problem.target = String(target);
    if (links && typeof links === 'object') problem.links = links;
    if (Array.isArray(errors) && errors.length) problem.errors = errors;
    if (cause) problem.cause = cause;
    return problem;
}

/**
 * Write the problem envelope to Express. Returns whatever
 * `res.json()` returns when the response is written, or `false`
 * when headers were already flushed (streaming carve-out — the
 * locked Error Strategy doc §"Streaming responses" requires that
 * post-first-chunk failures use an in-band stream error event
 * instead of attempting to write Problem Details over a response
 * that has already committed to a 200 status). The 500 fallback
 * handler in server.js short-circuits to `next(err)` in that case;
 * future route migrations onto sendProblem() must do the same OR
 * accept this `false` return and emit an in-band event themselves.
 */
function sendProblem(res, problem, extras) {
    if (!res || typeof res.status !== 'function') {
        throw new TypeError('sendProblem requires an Express response');
    }
    if (res.headersSent) {
        return false;
    }
    const status = Number(problem?.status || 500);
    // Slice 1d — `extras` lets routes preserve legacy response fields
    // alongside the problem envelope (e.g. /history routes carry
    // `ok: false` and `table`). Extras are written FIRST so the problem
    // envelope wins on any key collision — `error`, `status`, etc. always
    // come from the canonical envelope, never from a route-local override.
    const body = (extras && typeof extras === 'object')
        ? { ...extras, ...problem }
        : problem;
    return res
        .status(status)
        .type('application/problem+json')
        .json(body);
}

function statusFromUpstreamError(err) {
    const candidates = [
        err?.status,
        err?.statusCode,
        err?.response?.status,
        err?.cause?.status,
        err?.cause?.statusCode,
    ];
    for (const value of candidates) {
        const n = Number(value);
        if (Number.isInteger(n) && n >= 400 && n <= 599) return n;
    }
    const msg = String(err?.message || '');
    const match = msg.match(/\b(4\d{2}|5\d{2})\b/);
    return match ? Number(match[1]) : 502;
}

function mapUpstreamError(err, context = {}) {
    const status = statusFromUpstreamError(err);
    const code = context.code || (status === 401 ? 'UPSTREAM_AUTH_FAILED' : status === 403 ? 'UPSTREAM_FORBIDDEN' : 'UPSTREAM_REQUEST_FAILED');
    const safeDetail = status >= 500
        ? 'An upstream service did not complete the request. Try again or share the support code with your administrator.'
        : 'An upstream service rejected the request. Check credentials, permissions, and configured resources.';
    return createProblem({
        status,
        code,
        title: context.title || 'Upstream service error',
        detail: context.detail || safeDetail,
        category: context.category || 'upstream_error',
        retryable: status === 429 || status >= 500,
        requestId: context.requestId || '',
        provider: context.provider,
        upstreamStatus: status,
        target: context.target,
        cause: {
            provider: context.provider,
            upstreamStatus: status,
            code,
            route: context.route,
            method: context.method,
        },
    });
}

module.exports = {
    UNEXPECTED_INTERNAL_SENTINEL,
    createProblem,
    ensureRequestId,
    mapUpstreamError,
    redactProblemCause,
    sendProblem,
    supportCodeFor,
};
