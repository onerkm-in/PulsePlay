// Talking to a running PulsePlay proxy.
//
// Uses the same public routes the browser uses — no test-only backdoor — so a
// passing eval is evidence about the real request path, including the
// server-side scope prefix and governance attestation. If this file needed a
// special endpoint to work, the result would not mean much.

const DEFAULT_BASE = 'http://127.0.0.1:7000';

function baseUrl() {
    return (process.env.PULSEPLAY_PROXY_BASE || DEFAULT_BASE).replace(/\/$/, '');
}

function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    // Only whichever the local proxy is actually configured for; both are
    // optional so a PROXY_AUTH_MODE=none dev proxy needs no setup at all.
    if (process.env.PULSEPLAY_PROXY_KEY) headers['X-PulsePlay-Key'] = process.env.PULSEPLAY_PROXY_KEY;
    if (process.env.PULSEPLAY_BEARER) headers.Authorization = `Bearer ${process.env.PULSEPLAY_BEARER}`;
    return headers;
}

async function request(method, path, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl()}${path}`, {
            method,
            headers: authHeaders(),
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
        return { status: res.status, ok: res.ok, json, text };
    } finally {
        clearTimeout(timer);
    }
}

const postJson = (path, body, timeoutMs) => request('POST', path, body, timeoutMs);
const getJson = (path, timeoutMs) => request('GET', path, undefined, timeoutMs);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Does this envelope already carry an answer, or is it still cooking? */
function isPending(payload) {
    const status = String(payload?.status || '').toUpperCase();
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') return false;
    return !answerTextFrom(payload);
}

/**
 * Ask a question through the normal assistant path.
 *
 * Timeout defaults high because a cold serverless warehouse was measured at
 * 9.3s just to wake, before any model work.
 *
 * The profile is sent as `assistantProfile` because that is the field
 * resolveProfile actually reads; the old `profile` name silently fell through
 * to host/default resolution, which made --profile a no-op.
 *
 * FM and PBI answer synchronously from the start route. Genie does not: the
 * start response is the raw start-conversation envelope (conversation_id +
 * message_id, no content), and the answer only exists on the poll route after
 * Genie finishes. So when the start response carries no answer, poll.
 */
export async function ask({ question, profile, extraBody = {}, timeoutMs = 120_000 }) {
    const deadline = Date.now() + timeoutMs;
    const res = await postJson('/assistant/conversations/start', {
        content: question,
        ...(profile ? { assistantProfile: profile, profile } : {}),
        ...extraBody,
    }, timeoutMs);

    if (!res.ok) {
        throw new Error(`ask failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
    }

    let payload = res.json;
    const conversationId = payload?.conversation_id || payload?.conversationId || null;
    const messageId = payload?.message_id || payload?.messageId || null;

    if (isPending(payload) && conversationId && messageId && typeof messageId === 'string' && !messageId.trim().startsWith('{')) {
        const qs = profile ? `?assistantProfile=${encodeURIComponent(profile)}` : '';
        while (Date.now() < deadline) {
            await sleep(2500);
            const poll = await getJson(
                `/assistant/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}${qs}`,
                Math.max(5_000, deadline - Date.now()),
            );
            if (!poll.ok) {
                throw new Error(`poll failed: HTTP ${poll.status} ${poll.text.slice(0, 300)}`);
            }
            payload = poll.json;
            const status = String(payload?.status || '').toUpperCase();
            if (status === 'FAILED' || status === 'CANCELLED') {
                throw new Error(`conversation ${status.toLowerCase()}: ${poll.text.slice(0, 300)}`);
            }
            if (!isPending(payload)) break;
        }
        if (isPending(payload)) throw new Error(`answer still pending after ${timeoutMs}ms`);
    }

    return {
        raw: payload,
        text: answerTextFrom(payload),
        rows: rowsFrom(payload),
        conversationId,
    };
}

/**
 * Run reference SQL for ground truth.
 *
 * The browser never sends SQL in normal operation — this route exists for the
 * preview path and is used here deliberately, by a local developer harness, to
 * establish truth independent of the model.
 */
export async function referenceSql({ sql, profile, timeoutMs = 120_000 }) {
    const res = await postJson('/sql/preview', {
        sql,
        ...(profile ? { assistantProfile: profile, profile } : {}),
    }, timeoutMs);

    if (!res.ok || !res.json?.ok) {
        throw new Error(`reference SQL failed: HTTP ${res.status} ${res.json?.error || res.text.slice(0, 300)}`);
    }
    return { columns: res.json.columns || [], rows: res.json.rows || [] };
}

/** Is a proxy actually listening? Gives a clear skip instead of 20 timeouts. */
export async function proxyReachable(timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl()}/assistant/capabilities`, {
            headers: authHeaders(),
            signal: controller.signal,
        });
        return res.status < 500;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

// Answer text lives in different places per backend — Genie, Foundation Model
// and the deterministic DAX path all shape their envelope differently. Collect
// every plausible carrier rather than guessing one.
export function answerTextFrom(payload) {
    if (!payload) return '';
    const parts = [];
    const push = (v) => { if (typeof v === 'string' && v.trim()) parts.push(v); };

    push(payload.answer);
    push(payload.content);
    push(payload.text);
    push(payload.message?.content);
    push(payload.result?.answer);

    // PBI and FM use message_id as a client-facing JSON blob {id,status,content}.
    if (typeof payload.message_id === 'string' && payload.message_id.trim().startsWith('{')) {
        try { push(JSON.parse(payload.message_id).content); } catch { /* not a blob */ }
    }

    for (const att of payload.attachments || []) {
        push(att.text?.content);
        push(att.content);
    }
    return parts.join('\n\n');
}

/**
 * The rows an answer was (or should have been) grounded on, normalized to
 * { columns: string[], rows: any[][] } — the shape the grounding verifier
 * takes. PBI/FM echo `queryResult`; Genie carries attachments[].query.result.
 * Null when the envelope carries no tabular result at all.
 */
export function rowsFrom(payload) {
    if (!payload) return null;

    const normalize = (result) => {
        if (!result) return null;
        const rows = result.rows || result.data_table || result.data_array || null;
        if (!Array.isArray(rows) || !rows.length) return null;
        const columns = (result.columns || []).map((c) => (typeof c === 'string' ? c : c?.name || ''));
        return { columns, rows };
    };

    const direct = normalize(payload.queryResult);
    if (direct) return direct;

    for (const att of payload.attachments || []) {
        const fromAttachment = normalize(att.query?.result || att.query?.statement_response?.result);
        if (fromAttachment) return fromAttachment;
    }
    return null;
}
