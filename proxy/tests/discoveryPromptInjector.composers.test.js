// @ts-check
'use strict';

const {
    composeUserMessageWithContext,
    composeSystemPromptWithContext,
} = require('../lib/discoveryPromptInjector');

describe('composeUserMessageWithContext', () => {
    test('returns userQuestion byte-identically when no blocks provided', () => {
        expect(composeUserMessageWithContext({
            discoveryBlock: null,
            packBlock: null,
            packTag: null,
            userQuestion: 'why did revenue drop?',
        })).toBe('why did revenue drop?');
    });

    test('treats empty strings the same as null (no header injected)', () => {
        expect(composeUserMessageWithContext({
            discoveryBlock: '',
            packBlock: '',
            packTag: '',
            userQuestion: 'hi',
        })).toBe('hi');
    });

    test('emits discovery block above the user question header when present', () => {
        const out = composeUserMessageWithContext({
            discoveryBlock: '- Connector: genie',
            packBlock: null,
            packTag: null,
            userQuestion: 'What changed?',
        });
        expect(out).toContain('[Discovery Context]');
        expect(out).toContain('- Connector: genie');
        expect(out).toContain('[User Question]');
        expect(out).toContain('What changed?');
        // Discovery first, user-question last
        expect(out.indexOf('[Discovery Context]')).toBeLessThan(out.indexOf('[User Question]'));
    });

    test('emits pack block above user question when present alone', () => {
        const out = composeUserMessageWithContext({
            discoveryBlock: null,
            packBlock: 'Vertical = CPG. KPIs: revenue, profit margin.',
            packTag: 'cpg-fmcg/supply-chain',
            userQuestion: 'Top risks?',
        });
        expect(out).toContain('[Pack Context: cpg-fmcg/supply-chain]');
        expect(out).toContain('Vertical = CPG.');
        expect(out).toContain('[User Question]');
        expect(out).not.toContain('[Discovery Context]');
    });

    test('stacks discovery above pack above user question when both blocks present', () => {
        const out = composeUserMessageWithContext({
            discoveryBlock: 'D',
            packBlock: 'P',
            packTag: 'cpg/sc',
            userQuestion: 'Q',
        });
        const idxD = out.indexOf('[Discovery Context]');
        const idxP = out.indexOf('[Pack Context: cpg/sc]');
        const idxU = out.indexOf('[User Question]');
        expect(idxD).toBeGreaterThanOrEqual(0);
        expect(idxP).toBeGreaterThan(idxD);
        expect(idxU).toBeGreaterThan(idxP);
    });

    test('defaults pack tag to "pack" when omitted but packBlock present', () => {
        const out = composeUserMessageWithContext({
            discoveryBlock: null,
            packBlock: 'P',
            packTag: null,
            userQuestion: 'Q',
        });
        expect(out).toContain('[Pack Context: pack]');
    });
});

describe('composeSystemPromptWithContext', () => {
    test('returns original system prompt byte-identically when no blocks provided', () => {
        expect(composeSystemPromptWithContext({
            systemPrompt: 'You are a careful analyst.',
            discoveryBlock: null,
            packBlock: null,
            packTag: null,
        })).toBe('You are a careful analyst.');
    });

    test('returns empty string when original is null and no blocks provided', () => {
        expect(composeSystemPromptWithContext({
            systemPrompt: null,
            discoveryBlock: null,
            packBlock: null,
            packTag: null,
        })).toBe('');
    });

    test('appends discovery block below the original system prompt', () => {
        const out = composeSystemPromptWithContext({
            systemPrompt: 'You are a careful analyst.',
            discoveryBlock: '- Connector: foundation-model',
            packBlock: null,
        });
        expect(out.indexOf('You are a careful')).toBeLessThan(out.indexOf('[Discovery Context]'));
        expect(out).toContain('- Connector: foundation-model');
    });

    test('omits an empty system prompt and emits only the context blocks', () => {
        const out = composeSystemPromptWithContext({
            systemPrompt: '',
            discoveryBlock: '- Connector: openai',
            packBlock: null,
        });
        expect(out.startsWith('[Discovery Context]')).toBe(true);
    });

    test('emits both context blocks below the original prompt', () => {
        const out = composeSystemPromptWithContext({
            systemPrompt: 'Analyst.',
            discoveryBlock: 'D',
            packBlock: 'P',
            packTag: 'cpg/sc',
        });
        const idxOrig = out.indexOf('Analyst.');
        const idxD = out.indexOf('[Discovery Context]');
        const idxP = out.indexOf('[Pack Context: cpg/sc]');
        expect(idxOrig).toBeGreaterThanOrEqual(0);
        expect(idxD).toBeGreaterThan(idxOrig);
        expect(idxP).toBeGreaterThan(idxD);
    });

    test('whitespace-only system prompt is treated as empty', () => {
        const out = composeSystemPromptWithContext({
            systemPrompt: '   \n  \t',
            discoveryBlock: 'D',
            packBlock: null,
        });
        expect(out.startsWith('[Discovery Context]')).toBe(true);
    });

    test('non-string system prompt is tolerated and treated as empty', () => {
        // @ts-expect-error — purposely passing wrong type
        const out = composeSystemPromptWithContext({
            systemPrompt: { not: 'a string' },
            discoveryBlock: 'D',
            packBlock: null,
        });
        expect(out).toBe('[Discovery Context]\nD');
    });
});
