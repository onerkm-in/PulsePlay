// The judge's pure halves — prompt builder and verdict parser — tested without
// credentials. The model call itself is explicit-invocation only and untested
// here on purpose: there is nothing deterministic to assert about it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgePrompt, parseJudgeVerdict } from '../lib/judge.mjs';

test('prompt carries question, evidence rows, expected value, and the answer', () => {
    const { systemPrompt, userPrompt } = buildJudgePrompt({
        question: 'What was OTIF in 2026 YTD?',
        answerText: 'OTIF held at 94.45%.',
        expected: 94.45,
        rows: { columns: ['measure', 'value'], rows: [['OTIF Pct', 94.45]] },
    });
    assert.match(systemPrompt, /faithfulness/);
    assert.match(systemPrompt, /ONLY a JSON object/);
    assert.match(userPrompt, /What was OTIF in 2026 YTD\?/);
    assert.match(userPrompt, /OTIF Pct/);
    assert.match(userPrompt, /94\.45/);
    assert.match(userPrompt, /OTIF held at 94\.45%/);
});

test('prompt says plainly when no evidence exists', () => {
    const { userPrompt } = buildJudgePrompt({ question: 'q', answerText: 'a' });
    assert.match(userPrompt, /No evidence rows were available/);
});

test('parses a clean verdict', () => {
    const v = parseJudgeVerdict('{"faithfulness":0.9,"relevance":1,"coherence":0.8,"verdict":"pass","reasons":["cites only supplied figures"]}');
    assert.equal(v.verdict, 'pass');
    assert.equal(v.scores.faithfulness, 0.9);
    assert.deepEqual(v.reasons, ['cites only supplied figures']);
});

test('tolerates prose and fences around the JSON', () => {
    const v = parseJudgeVerdict('Here is my assessment:\n```json\n{"faithfulness":0.5,"relevance":0.9,"coherence":0.9,"verdict":"fail","reasons":[]}\n```\nHope that helps.');
    assert.equal(v.verdict, 'fail');
    assert.equal(v.scores.faithfulness, 0.5);
});

test('derives the verdict from the 0.7 threshold when the model omits it', () => {
    assert.equal(parseJudgeVerdict('{"faithfulness":0.9,"relevance":0.8,"coherence":0.7}').verdict, 'pass');
    assert.equal(parseJudgeVerdict('{"faithfulness":0.6,"relevance":0.9,"coherence":0.9}').verdict, 'fail');
});

test('clamps out-of-range scores instead of trusting them', () => {
    const v = parseJudgeVerdict('{"faithfulness":1.7,"relevance":-2,"coherence":0.5,"verdict":"fail"}');
    assert.equal(v.scores.faithfulness, 1);
    assert.equal(v.scores.relevance, 0);
});

test('missing or non-numeric dimensions are unusable, never a silent pass', () => {
    assert.equal(parseJudgeVerdict('{"faithfulness":0.9,"verdict":"pass"}'), null);
    assert.equal(parseJudgeVerdict('{"faithfulness":"high","relevance":1,"coherence":1}'), null);
    assert.equal(parseJudgeVerdict('no json here at all'), null);
    assert.equal(parseJudgeVerdict(''), null);
});
