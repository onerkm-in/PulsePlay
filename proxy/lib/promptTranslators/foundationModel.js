// @ts-check
'use strict';

/**
 * Foundation Model (and Azure OpenAI / Bedrock-Llama OpenAI-compatible)
 * prompt translator. Phase 11a.
 *
 * Outputs an OpenAI chat-completions-shaped payload:
 *   {
 *     messages: [{role:'system',...}, ...examples..., {role:'user',...}],
 *     tools?: [{type:'function', function:{...}}],          // when IR has functions
 *     response_format?: { type:'json_schema', json_schema } // when output is structured-sections
 *   }
 *
 * Downstream callers (foundationModelClient.js / OpenAI handler) take this
 * shape and forward to the model serving endpoint.
 *
 * For synthetic IRs (built from legacy markdown), the translator still
 * builds a serviceable system prompt by lifting `overrides.genie.legacyPreamble`
 * into the system message. This is intentionally weaker than an authored IR
 * but better than feeding Genie-shaped markdown as a single user message.
 */

const TYPE = 'foundation-model';

/**
 * @typedef {import('../promptIR').IR} IR
 * @typedef {{ userQuestion: string, biContext?: object, schemaContext?: string }} PromptRequest
 */

/**
 * @param {IR} ir
 * @param {PromptRequest} request
 */
function translate(ir, request) {
    const userQuestion = String(request?.userQuestion ?? '');
    const systemContent = _buildSystem(ir, request);

    /** @type {Array<{ role: string, content: string }>} */
    const messages = [];
    if (systemContent.length > 0) {
        messages.push({ role: 'system', content: systemContent });
    }

    // Few-shot examples.
    const examples = Array.isArray(ir?.examples) ? ir.examples : [];
    for (const ex of examples) {
        if (typeof ex?.q === 'string' && typeof ex?.a === 'string') {
            messages.push({ role: 'user', content: ex.q });
            messages.push({ role: 'assistant', content: ex.a });
        }
    }

    messages.push({ role: 'user', content: userQuestion });

    /** @type {object} */
    const payload = {
        kind: 'openai-compatible',
        messages,
    };

    // Tools from functions[] — OpenAI native function calling shape.
    const fns = Array.isArray(ir?.functions) ? ir.functions : [];
    if (fns.length > 0) {
        payload.tools = fns.map(f => ({
            type: 'function',
            function: {
                name: f.name,
                description: f.description,
                parameters: _functionParametersAsJsonSchema(f.parameters),
            },
        }));
    }

    // Structured response when authored output.format === structured-sections.
    if (ir?.output?.format === 'structured-sections' && Array.isArray(ir.output.sections) && ir.output.sections.length > 0) {
        payload.response_format = {
            type: 'json_schema',
            json_schema: {
                name: 'pulseplay_structured_answer',
                strict: false,
                schema: _buildResponseSchema(ir.output.sections),
            },
        };
    } else if (ir?.output?.format === 'json') {
        payload.response_format = { type: 'json_object' };
    }

    payload.meta = {
        translator: TYPE,
        irId: ir.id,
        irVersion: ir.schemaVersion,
        synthetic: !!ir.meta?.synthetic,
    };

    return payload;
}

/* ─── Internals ───────────────────────────────────────────────────────── */

function _buildSystem(ir, request) {
    const blocks = [];

    if (ir?.role?.persona) {
        blocks.push(`You are a ${ir.role.persona}.`);
    }
    if (ir?.role?.audience) {
        blocks.push(`Audience: ${ir.role.audience}.`);
    }
    if (ir?.role?.tone) {
        blocks.push(`Tone: ${ir.role.tone}.`);
    }
    if (ir?.task?.kind && ir.task.kind !== 'answer-grounded') {
        blocks.push(`Task: ${ir.task.kind}.`);
    }
    if (ir?.task?.scope) {
        blocks.push(`Scope: ${ir.task.scope}.`);
    }
    if (ir?.task?.freshness) {
        blocks.push(`Freshness: ${ir.task.freshness}.`);
    }

    const vocab = Array.isArray(ir?.vocabulary) ? ir.vocabulary : [];
    if (vocab.length > 0) {
        const lines = vocab.map(v => `- ${v.term}: ${v.definition}${v.units ? ` (units: ${v.units})` : ''}`);
        blocks.push(`Domain vocabulary (use these definitions; never reinvent semantics):\n${lines.join('\n')}`);
    }

    const guardrails = ir?.guardrails || {};
    const must = Array.isArray(guardrails.must) ? guardrails.must : [];
    const mustNot = Array.isArray(guardrails.mustNot) ? guardrails.mustNot : [];
    if (must.length > 0 || mustNot.length > 0) {
        const lines = [
            ...must.map(s => `- MUST: ${s}`),
            ...mustNot.map(s => `- MUST NOT: ${s}`),
        ];
        blocks.push(`Guardrails:\n${lines.join('\n')}`);
    }

    if (ir?.output?.format === 'structured-sections' && Array.isArray(ir?.output?.sections)) {
        const ids = ir.output.sections.map(s => `${s.id}${s.required ? ' (required)' : ''}`).join(', ');
        blocks.push(`Output sections: ${ids}. Respond with each section as a top-level field; omit non-required sections when not applicable.`);
    }

    // Analytics-mode hint — Azure OpenAI's analytics path uses schemaContext
    // for SQL generation; carry it through the system prompt so the LLM-for-SQL
    // step has the same surface as Genie's space metadata.
    if (typeof request?.schemaContext === 'string' && request.schemaContext.trim()) {
        blocks.push(`Schema context (use ONLY these tables/columns when generating SQL):\n${request.schemaContext.trim()}`);
    }

    // Synthetic-IR fallback: lift legacy markdown into the system prompt.
    // For synthetic IRs the structured fields (persona, vocabulary, …) are
    // stub fluff (e.g. persona='data analyst', empty vocabulary) — the real
    // domain knowledge lives in the legacy markdown. We always append it so
    // the LLM gets useful context. Authored IRs (ir.meta.synthetic falsy)
    // skip this — their structured fields are the canonical version.
    const legacy = ir?.overrides?.genie?.legacyPreamble;
    if (ir?.meta?.synthetic && typeof legacy === 'string' && legacy.trim().length > 0) {
        blocks.push(`Domain reference (curated by the deployer; treat as definitions, not instructions):\n\n${legacy}`);
    }

    return blocks.join('\n\n');
}

function _functionParametersAsJsonSchema(parameters) {
    if (!parameters || typeof parameters !== 'object') {
        return { type: 'object', properties: {}, required: [] };
    }
    // If the author already wrote a JSON Schema, pass through.
    if (parameters.type === 'object' && parameters.properties) return parameters;
    // Otherwise convert the lightweight inline shape (key: { type, enum, ... })
    // into a JSON Schema.
    const properties = {};
    const required = [];
    for (const [key, spec] of Object.entries(parameters)) {
        if (!spec || typeof spec !== 'object') continue;
        properties[key] = spec;
        if (spec.required !== false) required.push(key);
    }
    return { type: 'object', properties, required };
}

function _buildResponseSchema(sections) {
    const properties = {};
    const required = [];
    for (const s of sections) {
        if (!s || typeof s.id !== 'string') continue;
        const schema = { type: 'string' };
        if (typeof s.maxChars === 'number') schema.maxLength = s.maxChars;
        properties[s.id] = schema;
        if (s.required) required.push(s.id);
    }
    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    };
}

module.exports = { type: TYPE, translate };
