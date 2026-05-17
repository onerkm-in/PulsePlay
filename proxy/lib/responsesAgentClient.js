// proxy/lib/responsesAgentClient.js
//
// 2025/2026 — Mosaic AI `ResponsesAgent` serving-endpoint client.
//
// What's new vs FoundationModelClient
// ───────────────────────────────────
// Mosaic AI Agent Framework's ResponsesAgent task type (released 2025) is
// Databricks' managed-agent replacement for the legacy ChatAgent that lived
// on `/chat/completions`. Same workspace, same auth chain, same
// `/serving-endpoints/<name>/invocations` path family — but a different
// REQUEST/RESPONSE schema modelled on OpenAI's Responses API rather than
// OpenAI's Chat Completions API.
//
// Key differences:
//   - Body uses `input` (Responses-API shape) instead of `messages` (Chat
//     Completions shape). `input` is an array of `{ role, content }` like
//     messages, but the field name signals to Databricks that this is the
//     Responses path.
//   - Body supports `custom_inputs` — a free-form object the agent sees
//     alongside the conversation input. Lets us pass the user's BI context
//     (active vendor, recent events, filter state) without serializing
//     into the prompt text.
//   - Response top-level field is `output` (array of message-shaped items)
//     instead of `choices[].message`. Each output item has its own
//     `content` array of typed parts (text, image, function call, …) —
//     not a single string. We flatten `output[*].content[*].text` for the
//     primary text response, preserving the richer items in `raw` for
//     advanced consumers.
//   - Response includes `custom_outputs` for agent-returned structured
//     metadata (e.g. a list of tool calls the agent decided not to make,
//     or grounding citations the agent collected).
//
// Distinct from PulsePlay's existing hand-rolled Supervisor template at
// `databricks-agents/supervisor/`: that's a LangGraph-based agent we
// deploy ourselves. ResponsesAgent is a Databricks-managed runtime. As
// Agent Bricks adoption grows, the Supervisor template becomes the
// "build-your-own" path while ResponsesAgent becomes the "ship-managed"
// path. Both coexist; they target different deployer profiles.
//
// Public surface
// ──────────────
//   callResponsesAgent(databricksRequestFn, profile, options) →
//     { content, raw, customOutputs?, usage? }
//
//   profile fields used:
//     - host                       Databricks workspace base URL
//     - responsesAgentEndpoint     serving endpoint name
//                                  (e.g. "knowledge-assistant-prod")
//     - token / authMode           inherited from databricksRequest
//
//   options:
//     - input             Array of { role, content } in Responses-API shape.
//                         OR `messages` (alias for compat with callers that
//                         already speak Chat-Completions shape; auto-mapped).
//     - instructions      Optional system-prompt-equivalent. Threaded as a
//                         top-level field rather than a `role: "system"`
//                         entry, per Responses-API contract.
//     - customInputs      Optional free-form object passed to the agent
//                         alongside the conversation input.
//     - temperature       0..2 — defaults to 0.2 (deterministic-leaning).
//     - maxOutputTokens   response token cap — defaults to 2048.
//     - requestId         X-Request-Id propagation.
//     - extra             Optional pass-through fields merged into the body
//                         (escape hatch for advanced callers).

'use strict';

function buildResponsesAgentBody(options) {
    const {
        input,
        messages,
        instructions = null,
        customInputs = null,
        temperature = 0.2,
        maxOutputTokens = 2048,
        extra = null,
    } = options || {};

    // Accept either `input` (Responses-API native) or `messages` (Chat
    // Completions alias) so existing callers can switch backends without
    // a payload-shape rewrite. When both supplied, `input` wins.
    const conversation = Array.isArray(input) && input.length > 0
        ? input
        : (Array.isArray(messages) ? messages : null);

    if (!conversation || conversation.length === 0) {
        throw new Error('ResponsesAgent: input[] (or messages[]) is required and must be non-empty.');
    }
    for (const m of conversation) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
            throw new Error('ResponsesAgent: each input entry must have string role + content.');
        }
    }

    const body = {
        input: conversation,
        temperature,
        max_output_tokens: maxOutputTokens,
    };
    if (instructions && typeof instructions === 'string' && instructions.trim()) {
        body.instructions = instructions.trim();
    }
    if (customInputs && typeof customInputs === 'object') {
        body.custom_inputs = customInputs;
    }
    if (extra && typeof extra === 'object') {
        Object.assign(body, extra);
    }
    return body;
}

/**
 * Flatten ResponsesAgent's `output[*].content[*]` into a single text string.
 *
 * The Responses API returns `output` as an array of message-shaped items,
 * each with its own `content` array of typed parts. We concatenate all
 * text parts in order, separated by single newlines — this matches what
 * the model would have emitted if we'd asked for a single text response.
 * Non-text parts (image, function_call, tool_use) are preserved in the
 * raw response for advanced consumers but skipped here.
 */
function extractResponsesAgentText(rawResponse) {
    if (!rawResponse || typeof rawResponse !== 'object') return '';
    const output = rawResponse.output;
    if (!Array.isArray(output) || output.length === 0) return '';
    const parts = [];
    for (const item of output) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            // Tolerate both `{ type: "output_text", text }` (Responses API
            // canonical) and `{ text }` (defensive, some Databricks
            // endpoints elide the type discriminator on simple text outputs).
            const text = typeof part?.text === 'string' ? part.text
                : (typeof part?.output_text === 'string' ? part.output_text : '');
            if (text) parts.push(text);
        }
    }
    return parts.join('\n').trim();
}

/** Extract `custom_outputs` if the agent returned any. Tolerates both
 *  camelCase and snake_case. */
function extractCustomOutputs(rawResponse) {
    if (!rawResponse || typeof rawResponse !== 'object') return null;
    const co = rawResponse.custom_outputs ?? rawResponse.customOutputs;
    return co && typeof co === 'object' ? co : null;
}

/** Extract usage block. Responses API uses `input_tokens` / `output_tokens`
 *  rather than `prompt_tokens` / `completion_tokens`; we accept both. */
function extractUsage(rawResponse) {
    const u = rawResponse?.usage;
    if (!u || typeof u !== 'object') return null;
    const out = {};
    const fields = ['prompt_tokens', 'completion_tokens', 'total_tokens', 'input_tokens', 'output_tokens'];
    let anyPresent = false;
    for (const k of fields) {
        const v = u[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
            out[k] = Math.floor(v);
            anyPresent = true;
        }
    }
    return anyPresent ? out : null;
}

/**
 * Hit a Mosaic AI ResponsesAgent serving endpoint.
 *
 * @param {Function} databricksRequestFn — `(profile, method, urlPath, body, requestId) => Promise<json>`
 * @param {object}   profile             — must include host + responsesAgentEndpoint
 * @param {object}   options             — see file-level docstring
 * @returns {Promise<{ content: string, raw: object, customOutputs?: object, usage?: object }>}
 */
async function callResponsesAgent(databricksRequestFn, profile, options) {
    if (typeof databricksRequestFn !== 'function') {
        throw new Error('ResponsesAgent: databricksRequest function not supplied.');
    }
    if (!profile || typeof profile !== 'object') {
        throw new Error('ResponsesAgent: profile required.');
    }
    const endpoint = profile.responsesAgentEndpoint;
    if (!endpoint || typeof endpoint !== 'string') {
        throw new Error('ResponsesAgent: profile.responsesAgentEndpoint required (e.g. "knowledge-assistant-prod" or "supervisor-agent-managed").');
    }

    const body = buildResponsesAgentBody(options);
    const path = `/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`;

    let raw;
    try {
        raw = await databricksRequestFn(profile, 'POST', path, body, options?.requestId);
    } catch (err) {
        const msg = String(err?.message || 'unknown error').slice(0, 600);
        throw new Error(`ResponsesAgent invocation failed (${endpoint}): ${msg}`);
    }

    const content = extractResponsesAgentText(raw);
    const customOutputs = extractCustomOutputs(raw);
    const usage = extractUsage(raw);
    const result = { content, raw };
    if (customOutputs) result.customOutputs = customOutputs;
    if (usage) result.usage = usage;
    return result;
}

module.exports = {
    callResponsesAgent,
    // Exported for unit-test access to the pure transforms without spinning
    // up a full mock databricksRequest. Keeps tests fast + focused.
    buildResponsesAgentBody,
    extractResponsesAgentText,
    extractCustomOutputs,
    extractUsage,
};
