// proxy/lib/foundationModelClient.js
//
// Cycle 47.6 + 47.7 — Foundation Model serving endpoint client.
//
// Wraps a Databricks Mosaic AI Model Serving endpoint (OpenAI-compatible)
// so the proxy can ask a foundation model to format a section instead of
// (or alongside) Genie Chat. Built on the project's existing
// databricksRequest() so it inherits keep-alive, OAuth M2M token
// resolution, request-id propagation, error redaction, and 429 retry.
//
// Why this exists
// ───────────────
// Databricks Genie's Agent Mode ("Deep Research") is UI-only during
// public preview — the public REST API silently swallows the
// `force_deep_research_planning` flag. RECOMMENDED ACTIONS / RISKS
// reasoning therefore can't ride on Genie Agent Mode today. The
// workaround: use Genie Chat to fetch DATA, then ask a foundation model
// (Llama 3.1 405B / Claude Sonnet 4.7 etc., served via Mosaic AI Model
// Serving in the same workspace) to FORMAT it as imperative actions or
// quantified risks under our control.
//
// Mosaic AI Model Serving exposes an OpenAI-compatible chat-completions
// schema, so the request body is portable and structured-output is
// available via `response_format: { type: "json_schema", ... }`.
//
// Public surface
// ──────────────
//   callFoundationModel(profile, options) → { content, raw, parsedJson? }
//
//   profile fields used:
//     - host                       Databricks workspace base URL
//     - foundationModelEndpoint    serving endpoint name
//                                  (e.g. "databricks-meta-llama-3-1-405b-instruct")
//     - token / authMode           inherited from databricksRequest auth chain
//
//   options:
//     - messages          Array of { role, content } in OpenAI shape
//     - temperature       0..2 — defaults to 0.2 (deterministic-leaning)
//     - maxTokens         response token cap — defaults to 2048
//     - responseFormat    optional OpenAI structured-output spec, e.g.
//                         { type: "json_schema", json_schema: { name, schema } }
//                         When present and the response parses as JSON,
//                         the result includes `parsedJson`.
//     - requestId         X-Request-Id propagation
//     - extra             optional pass-through fields merged into the body
//                         (e.g. top_p, stop, n) — escape hatch for advanced
//                         callers without rev'ing this module.
//
// Returns
// ───────
//   {
//     content: "<assistant message text>",
//     raw:     <full upstream JSON response>,
//     parsedJson: <parsed object>   // only when responseFormat was provided
//                                   // AND the content was valid JSON
//   }
//
// Errors propagate as Error("Foundation model …") so callers can
// distinguish them from Genie failures in their catch blocks.

function buildFoundationModelBody(options) {
    const {
        messages,
        temperature = 0.2,
        maxTokens = 2048,
        responseFormat = null,
        extra = null,
    } = options || {};

    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Foundation model: messages[] is required and must be non-empty.');
    }
    for (const m of messages) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
            throw new Error('Foundation model: each message must have string role + content.');
        }
    }

    const body = {
        messages,
        temperature,
        max_tokens: maxTokens,
    };
    if (responseFormat) body.response_format = responseFormat;
    if (extra && typeof extra === 'object') Object.assign(body, extra);
    return body;
}

function extractAssistantContent(rawResponse) {
    // OpenAI-compatible: choices[0].message.content
    if (!rawResponse || typeof rawResponse !== 'object') return '';
    const choices = rawResponse.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const msg = choices[0]?.message;
    if (!msg || typeof msg.content !== 'string') return '';
    return msg.content;
}

/**
 * Extract the `usage` block from an OpenAI-compatible response. Returns
 * the shape `{ prompt_tokens, completion_tokens, total_tokens }` when
 * present; null otherwise. Consumed by the SustainabilityIndicator UI via
 * the conversation response payload.
 *
 * Defensive: tolerates partial usage blocks (some self-hosted endpoints
 * only report total) and ignores non-numeric values.
 */
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

function tryParseJson(content) {
    if (typeof content !== 'string' || !content.trim()) return null;
    try {
        return JSON.parse(content);
    } catch {
        // Some models wrap JSON in markdown fences even when given a
        // structured-output schema. Try to peel off the most common
        // wrapper before giving up.
        const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced && fenced[1]) {
            try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
        }
        return null;
    }
}

/**
 * Hit a Databricks Mosaic AI Model Serving foundation-model endpoint.
 *
 * Caller injects the project's `databricksRequest` to keep this module
 * pure (no direct https / fetch in here — easier to unit-test).
 *
 * @param {Function} databricksRequestFn — `(profile, method, urlPath, body, requestId) => Promise<json>`
 * @param {object}   profile             — must include host + foundationModelEndpoint
 * @param {object}   options             — see file-level docstring
 */
async function callFoundationModel(databricksRequestFn, profile, options) {
    if (typeof databricksRequestFn !== 'function') {
        throw new Error('Foundation model: databricksRequest function not supplied.');
    }
    if (!profile || typeof profile !== 'object') {
        throw new Error('Foundation model: profile required.');
    }
    const endpoint = profile.foundationModelEndpoint;
    if (!endpoint || typeof endpoint !== 'string') {
        throw new Error('Foundation model: profile.foundationModelEndpoint required (e.g. "databricks-meta-llama-3-1-405b-instruct").');
    }

    const body = buildFoundationModelBody(options);
    const path = `/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`;

    let raw;
    try {
        raw = await databricksRequestFn(profile, 'POST', path, body, options?.requestId);
    } catch (err) {
        const msg = String(err?.message || 'unknown error').slice(0, 600);
        throw new Error(`Foundation model invocation failed (${endpoint}): ${msg}`);
    }

    const content = extractAssistantContent(raw);
    const usage = extractUsage(raw);
    const result = { content, raw };
    if (usage) result.usage = usage;
    if (options?.responseFormat) {
        const parsed = tryParseJson(content);
        if (parsed !== null) result.parsedJson = parsed;
    }
    return result;
}

// JSON schema presets for the canonical reasoning sections. Authors
// can pass these directly via the /foundation/section endpoint or
// supply their own. Schemas are conservative (required fields only,
// short maxLengths) so structured-output decoding stays inside what
// most foundation models can reliably emit.
const RESPONSE_SCHEMAS = Object.freeze({
    recommendedActions: {
        type: 'json_schema',
        json_schema: {
            name: 'recommended_actions',
            strict: true,
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['actions'],
                properties: {
                    actions: {
                        type: 'array',
                        minItems: 3,
                        maxItems: 3,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['verb', 'target', 'expected_impact'],
                            properties: {
                                verb: { type: 'string', maxLength: 24 },
                                target: { type: 'string', maxLength: 160 },
                                expected_impact: { type: 'string', maxLength: 160 },
                            },
                        },
                    },
                },
            },
        },
    },
    risks: {
        type: 'json_schema',
        json_schema: {
            name: 'risks',
            strict: true,
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['risks'],
                properties: {
                    risks: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 5,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['title', 'magnitude', 'evidence'],
                            properties: {
                                title: { type: 'string', maxLength: 80 },
                                magnitude: { type: 'string', maxLength: 80 },
                                evidence: { type: 'string', maxLength: 200 },
                            },
                        },
                    },
                },
            },
        },
    },
    opportunities: {
        type: 'json_schema',
        json_schema: {
            name: 'opportunities',
            strict: true,
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['opportunities'],
                properties: {
                    opportunities: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 5,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['title', 'evidence', 'why_now'],
                            properties: {
                                title: { type: 'string', maxLength: 80 },
                                evidence: { type: 'string', maxLength: 200 },
                                why_now: { type: 'string', maxLength: 200 },
                            },
                        },
                    },
                },
            },
        },
    },
});

// Markdown renderers — convert the structured JSON back into the
// markdown shape the visual already knows how to render. Keeps the
// foundation-model path contract-compatible with the existing Genie
// path so swapping backends doesn't require visual changes.
function renderActionsMarkdown(parsed) {
    if (!parsed || !Array.isArray(parsed.actions)) return '';
    const items = parsed.actions.map((a, i) => {
        const verb = String(a.verb || '').trim();
        const target = String(a.target || '').trim();
        const impact = String(a.expected_impact || '').trim();
        return `${i + 1}. ${verb} ${target} to ${impact}.`.replace(/\s+/g, ' ').trim();
    });
    return ['## RECOMMENDED ACTIONS', ...items].join('\n');
}

function renderRisksMarkdown(parsed) {
    if (!parsed || !Array.isArray(parsed.risks)) return '';
    const items = parsed.risks.map(r => {
        const title = String(r.title || '').trim();
        const mag = String(r.magnitude || '').trim();
        const ev = String(r.evidence || '').trim();
        return `- **${title}** (${mag}): ${ev}`;
    });
    return ['## RISKS', ...items].join('\n');
}

function renderOpportunitiesMarkdown(parsed) {
    if (!parsed || !Array.isArray(parsed.opportunities)) return '';
    const items = parsed.opportunities.map(o => {
        const title = String(o.title || '').trim();
        const ev = String(o.evidence || '').trim();
        const why = String(o.why_now || '').trim();
        return `- **${title}** — ${ev}. _Why now:_ ${why}`;
    });
    return ['## OPPORTUNITIES', ...items].join('\n');
}

const SECTION_RENDERERS = Object.freeze({
    'RECOMMENDED ACTIONS': renderActionsMarkdown,
    RISKS: renderRisksMarkdown,
    OPPORTUNITIES: renderOpportunitiesMarkdown,
});

module.exports = {
    callFoundationModel,
    extractUsage,
    RESPONSE_SCHEMAS,
    SECTION_RENDERERS,
    // Internals exposed for tests
    __test_internals: {
        buildFoundationModelBody,
        extractAssistantContent,
        extractUsage,
        tryParseJson,
        renderActionsMarkdown,
        renderRisksMarkdown,
        renderOpportunitiesMarkdown,
    },
};
