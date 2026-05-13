// @ts-check
'use strict';

/**
 * Genie prompt translator. Phase 11a.
 *
 * Backward-compatibility contract: when fed a synthetic IR (built from
 * `prompt-context.md` + `glossary.md` fallback by promptIR.buildSyntheticIR),
 * the translator MUST emit byte-identical output to the legacy
 * `packPromptInjector.wrapAsGenieUserMessage`. That guarantee is locked by
 * a regression test in proxy/tests/promptTranslator.genie.test.js.
 *
 * When fed an authored IR (with vocabulary, guardrails, functions, etc.),
 * the translator builds a richer single user message. Genie has no system-
 * prompt API, so everything lives in the user message — clearly fenced so
 * Genie's NL-to-SQL can distinguish curated vocabulary from the question.
 */

const TYPE = 'genie';

/**
 * @typedef {import('../promptIR').IR} IR
 * @typedef {{ userQuestion: string }} PromptRequest
 * @typedef {{ kind: 'genie', userMessage: string, meta: { translator: string, irId: string, irVersion: number, synthetic: boolean } }} GeniePayload
 */

/**
 * @param {IR} ir
 * @param {PromptRequest} request
 * @returns {GeniePayload}
 */
function translate(ir, request) {
    const userQuestion = String(request?.userQuestion ?? '');

    // Backward-compat path: synthetic IR carries the legacy preamble verbatim.
    // We emit the exact format wrapAsGenieUserMessage uses.
    const legacy = ir?.overrides?.genie?.legacyPreamble;
    if (typeof legacy === 'string' && legacy.length > 0) {
        const tag = _tagFromId(ir.id);
        const out = legacy.trim().length > 0
            ? `[Pack Context: ${tag}]\n\n${legacy}\n\n[User Question]\n\n${userQuestion}`
            : userQuestion;
        return {
            kind: 'genie',
            userMessage: out,
            meta: {
                translator: TYPE,
                irId: ir.id,
                irVersion: ir.schemaVersion,
                synthetic: !!ir.meta?.synthetic,
            },
        };
    }

    // Authored-IR path: build a structured single user message.
    const blocks = [];
    if (ir?.role?.persona) {
        blocks.push(_section('Persona', ir.role.persona));
    }
    if (ir?.task?.kind && ir.task.kind !== 'answer-grounded') {
        blocks.push(_section('Task', `kind=${ir.task.kind}${ir.task.scope ? `, scope=${ir.task.scope}` : ''}`));
    }
    if (Array.isArray(ir?.vocabulary) && ir.vocabulary.length > 0) {
        const lines = ir.vocabulary.map(v => {
            const dir = v.direction ? ` [${v.direction}]` : '';
            const units = v.units ? ` (units: ${v.units})` : '';
            return `- ${v.term}: ${v.definition}${units}${dir}`;
        });
        blocks.push(_section('Vocabulary', lines.join('\n')));
    }
    if (Array.isArray(ir?.functions) && ir.functions.length > 0) {
        // Genie can't call functions — list them as concept hints so the
        // model surfaces the relevant terms in its answer.
        const lines = ir.functions.map(f => `- ${f.name}: ${f.description}`);
        blocks.push(_section('Available concepts', lines.join('\n')));
    }
    if (ir?.guardrails) {
        const must = Array.isArray(ir.guardrails.must) ? ir.guardrails.must : [];
        const mustNot = Array.isArray(ir.guardrails.mustNot) ? ir.guardrails.mustNot : [];
        const lines = [
            ...must.map(s => `- DO: ${s}`),
            ...mustNot.map(s => `- AVOID: ${s}`),
        ];
        if (lines.length > 0) {
            blocks.push(_section('Guardrails', lines.join('\n')));
        }
    }
    const extra = ir?.overrides?.genie?.extraUserPreamble;
    if (typeof extra === 'string' && extra.trim().length > 0) {
        blocks.push(_section('Notes', extra.trim()));
    }
    if (Array.isArray(ir?.output?.sections) && ir.output.sections.length > 0) {
        const ids = ir.output.sections.map(s => s.id).join(', ');
        blocks.push(_section('Output format', `Respond with sections: ${ids}`));
    }
    blocks.push(_section('Question', userQuestion));

    const userMessage = blocks.length === 1
        ? userQuestion // No IR content at all — just send the question through.
        : blocks.join('\n\n');

    return {
        kind: 'genie',
        userMessage,
        meta: {
            translator: TYPE,
            irId: ir.id,
            irVersion: ir.schemaVersion,
            synthetic: !!ir.meta?.synthetic,
        },
    };
}

function _section(label, body) {
    return `[${label}]\n\n${body}`;
}

function _tagFromId(id) {
    // The legacy wrapAsGenieUserMessage built tags as "pack/subVertical".
    // The IR's id already has that shape — pass through verbatim, fall back
    // to literal "pack" if id is missing/empty.
    return typeof id === 'string' && id.trim().length > 0 ? id : 'pack';
}

module.exports = { type: TYPE, translate };
