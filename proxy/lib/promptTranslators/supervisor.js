// @ts-check
'use strict';

/**
 * Supervisor prompt translator. Phase 11a.
 *
 * A Supervisor profile fans queries across multiple Genie spaces and then
 * synthesises the answers. This translator emits a structured payload that
 * the proxy's supervisor handler consumes:
 *
 *   {
 *     kind: 'supervisor',
 *     fanOut: [{ space: <profile-name>, payload: <Genie payload> }, ...],
 *     synthesis: <Foundation Model payload>  // for the synthesis-LLM step
 *   }
 *
 * The Genie translator handles each constituent space's request. The
 * Foundation Model translator handles the synthesis step (we deliberately
 * adjust task.kind to 'summarise' so the synthesis-layer system prompt
 * reads "summarise these N answers" instead of "answer the question").
 */

const genie = require('./genie');
const foundationModel = require('./foundationModel');

const TYPE = 'supervisor';

/**
 * @typedef {import('../promptIR').IR} IR
 * @typedef {{ userQuestion: string, spaces?: string[], synthesisEndpoint?: string }} PromptRequest
 */

/**
 * @param {IR} ir
 * @param {PromptRequest} request
 */
function translate(ir, request) {
    const spaces = Array.isArray(request?.spaces) ? request.spaces : [];
    const fanOut = spaces.map(space => ({
        space,
        payload: genie.translate(ir, request),
    }));

    // Synthesis step uses Foundation Model translator with task.kind=summarise.
    const synthesisIR = {
        ...ir,
        task: { ...(ir.task || {}), kind: 'summarise' },
    };
    const synthesis = foundationModel.translate(synthesisIR, request);

    return {
        kind: 'supervisor',
        fanOut,
        synthesis,
        meta: {
            translator: TYPE,
            irId: ir.id,
            irVersion: ir.schemaVersion,
            synthetic: !!ir.meta?.synthetic,
            spaceCount: spaces.length,
        },
    };
}

module.exports = { type: TYPE, translate };
