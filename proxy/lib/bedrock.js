/**
 * bedrock.js — AWS Bedrock client helpers (SigV4-signed).
 *
 * IDEA-040 Phase 2 — extracts the previously-inlined Bedrock signing code
 * from server.js into a small, reusable module and adds a SECOND code path
 * (`bedrockInvokeModel`) that calls Bedrock's raw model-invocation API
 * (no Knowledge Base coupling) so the analytics orchestrator can use a
 * Claude / Llama / Titan model directly.
 *
 * Two entry points:
 *   - bedrockRetrieveAndGenerate(profile, input, sessionId)
 *       Existing KB-coupled "RAG" path — preserved unchanged.
 *   - bedrockInvokeModel(profile, messages, opts)
 *       New direct-LLM path. Uses the Anthropic Messages-style payload
 *       contract that all current Claude-on-Bedrock model IDs accept.
 *
 * Both paths share the SigV4 signing primitive (`signAwsRequest`) so
 * future migrations (e.g. SSO/role-credential support) only need to
 * touch one place. Signing is intentionally minimal — no third-party
 * SDK — to keep the proxy's dependency footprint at zero (express only).
 *
 * ADDITION-ONLY: existing RetrieveAndGenerate behavior is byte-identical
 * to the inline implementation; server.js continues to require its
 * old function name via a thin wrapper (kept inline for compatibility
 * during the cut-over). New direct-mode requests dispatch through
 * `bedrockInvokeModel`.
 */

'use strict';

const crypto = require('crypto');

// ── Shared SigV4 primitives ───────────────────────────────────────────────────

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(secret, dateStamp, region, service) {
    const kDate = hmac('AWS4' + secret, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}

/**
 * Build the AWS SigV4 Authorization header + the X-Amz-* metadata headers
 * for a POST request. This is the "minimum viable" signer — host header is
 * always derived from `host`, query string is empty, and only Content-Type
 * is added to the signed-headers set on top of the AWS-required ones.
 *
 * @param {object} args
 * @param {string} args.host          e.g. bedrock-runtime.us-east-1.amazonaws.com
 * @param {string} args.region        e.g. us-east-1
 * @param {string} args.service       e.g. bedrock
 * @param {string} args.path          URL path beginning with '/'
 * @param {string} args.bodyStr       JSON-stringified body
 * @param {string} args.accessKeyId
 * @param {string} args.secretAccessKey
 * @returns {{ headers: Record<string,string>, amzDate: string, payloadHash: string }}
 */
function signAwsRequest({ host, region, service, path, bodyStr, accessKeyId, secretAccessKey }) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    const canonicalHeaders =
        `content-type:application/json\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = hmac(signingKey, strToSign).toString('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        headers: {
            'Content-Type': 'application/json',
            'X-Amz-Date': amzDate,
            'X-Amz-Content-Sha256': payloadHash,
            'Authorization': authHeader,
        },
        amzDate,
        payloadHash,
    };
}

// ── RetrieveAndGenerate (KB-coupled — existing behavior) ──────────────────────

async function bedrockRetrieveAndGenerate(profile, input, sessionId, fetchImpl) {
    const region = profile.bedrockRegion || 'us-east-1';
    const host = `bedrock-agent-runtime.${region}.amazonaws.com`;
    const path = '/retrieveAndGenerate';
    const url = `https://${host}${path}`;

    const body = {
        input: { text: input },
        retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
                knowledgeBaseId: profile.bedrockKnowledgeBaseId,
                modelArn: profile.bedrockModelArn || `anthropic.claude-3-5-sonnet-20241022-v2:0`,
            },
        },
    };
    if (sessionId) body.sessionId = sessionId;
    const bodyStr = JSON.stringify(body);

    const { headers } = signAwsRequest({
        host, region, service: 'bedrock', path, bodyStr,
        accessKeyId: profile.bedrockAccessKeyId,
        secretAccessKey: profile.bedrockSecretAccessKey,
    });

    const f = fetchImpl || globalThis.fetch;
    const response = await f(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`AWS Bedrock returned ${response.status}: ${text.substring(0, 300)}`);
    }
    return response.json();
}

// ── InvokeModel (raw LLM, no KB) ──────────────────────────────────────────────

/**
 * Call Bedrock's InvokeModel API for direct LLM access (no Knowledge Base).
 * Uses the Anthropic Messages payload contract — supported by every Claude
 * model on Bedrock and the recommended shape going forward.
 *
 * @param {object} profile  Profile with bedrockRegion / bedrockAccessKeyId /
 *                          bedrockSecretAccessKey / bedrockModelId.
 * @param {Array<{role:string,content:string}>} messages
 *                          Standard chat messages. The first message with
 *                          role "system" is mapped to Anthropic's top-level
 *                          `system` field; the rest are forwarded as-is.
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=2048]
 * @param {number} [opts.temperature=0.2]
 * @param {function} [opts.fetchImpl]   Test injection seam.
 * @returns {Promise<string>}            Plain-text content of the response.
 */
async function bedrockInvokeModel(profile, messages, opts = {}) {
    const region = profile.bedrockRegion || 'us-east-1';
    const modelId = profile.bedrockModelId
        || profile.bedrockModelArn
        || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const path = `/model/${encodeURIComponent(modelId)}/invoke`;
    const url = `https://${host}${path}`;

    const sysMsgs = (messages || []).filter(m => m && m.role === 'system');
    const nonSys = (messages || []).filter(m => m && m.role !== 'system');
    const systemText = sysMsgs.map(m => m.content).filter(Boolean).join('\n\n');

    const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: opts.maxTokens || 2048,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
        messages: nonSys.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content ?? ''),
        })),
    };
    if (systemText) body.system = systemText;
    const bodyStr = JSON.stringify(body);

    const { headers } = signAwsRequest({
        host, region, service: 'bedrock', path, bodyStr,
        accessKeyId: profile.bedrockAccessKeyId,
        secretAccessKey: profile.bedrockSecretAccessKey,
    });

    const f = opts.fetchImpl || globalThis.fetch;
    const response = await f(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const text = await response.text();
        // Wave 30 cycle 4 — never propagate raw upstream bodies (may carry
        // PII / credential fragments). Caller wraps the returned message
        // in errorStatusFromDatabricks-style redaction before user surface.
        throw new Error(`AWS Bedrock InvokeModel returned ${response.status}: ${text.substring(0, 300)}`);
    }

    const data = await response.json();
    // Anthropic-on-Bedrock returns `{ content: [{type:'text', text:'...'}] }`
    if (Array.isArray(data?.content)) {
        const txt = data.content
            .filter(b => b && b.type === 'text')
            .map(b => b.text)
            .join('');
        if (txt) return txt;
    }
    // Titan / Llama families return `{ outputs:[{text}] }` or `{ generation }`
    if (data?.generation) return String(data.generation);
    if (Array.isArray(data?.outputs) && data.outputs[0]?.text) return String(data.outputs[0].text);
    return JSON.stringify(data);
}

module.exports = {
    bedrockRetrieveAndGenerate,
    bedrockInvokeModel,
    signAwsRequest,
    __test_internals: { hmac, getSignatureKey },
};
