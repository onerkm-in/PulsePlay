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

async function postJson(path, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl()}${path}`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
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

/**
 * Ask a question through the normal assistant path.
 *
 * Timeout defaults high because a cold serverless warehouse was measured at
 * 9.3s just to wake, before any model work.
 */
export async function ask({ question, profile, timeoutMs = 120_000 }) {
    const res = await postJson('/assistant/conversations/start', {
        content: question,
        ...(profile ? { profile } : {}),
    }, timeoutMs);

    if (!res.ok) {
        throw new Error(`ask failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
    }
    return {
        raw: res.json,
        text: answerTextFrom(res.json),
        conversationId: res.json?.conversation_id || res.json?.conversationId || null,
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
        ...(profile ? { profile } : {}),
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

    for (const att of payload.attachments || []) {
        push(att.text?.content);
        push(att.content);
    }
    return parts.join('\n\n');
}
