// playground/src/lib/__tests__/artifactValidator.test.ts
//
// Step 4 — Artifact validator invariants. Tests cover:
//   1. The four status fixtures: verified / grounded-draft / suggestion / blocked.
//   2. The locked rule: LLM cannot self-declare a status the validator does
//      not also derive from the payload.
//   3. Markdown sanitization (defense in depth).
//   4. Tab derivation (validator strips blocked tabs).
//   5. Problem Details emission shape.

import { describe, it, expect } from 'vitest';
import { sanitizeMarkdown, validateArtifact, type CandidateArtifact } from '../artifactValidator';
import { WORKBENCH_PROBLEM_TYPE_PREFIX } from '../problemDetails';

// ─── The four status fixtures ──────────────────────────────────────────

describe('validateArtifact — verified status', () => {
    it('emits verified when chart + table + sql + citation all present', () => {
        const candidate: CandidateArtifact = {
            id: 'fx-verified-1',
            answer: { markdown: 'Top 3 by sales: Tech, Furniture, Office Supplies.' },
            chart: { mark: 'bar', data: { values: [] }, encoding: {} },
            table: {
                columns: [{ name: 'category', type: 'STRING' }, { name: 'sales', type: 'DECIMAL' }],
                rows: [['Tech', 836154.03]],
            },
            sql: 'SELECT category, SUM(sales) FROM x GROUP BY category',
            citations: [
                { kind: 'sql', statement: 'SELECT category, SUM(sales) FROM x GROUP BY category', statementId: 'st1' },
                { kind: 'result-rows', statementId: 'st1', rowCount: 3 },
            ],
            rowCount: 3,
            executionTimeMs: 1234,
            sourceProfile: 'default',
            sourceConnectorType: 'genie',
        };
        const result = validateArtifact(candidate);
        expect(result.artifact.status).toBe('verified');
        expect(result.problem).toBeUndefined();
        expect(result.artifact.tabs).toEqual(['answer', 'chart', 'table', 'sql', 'evidence']);
    });

    it('emits verified for sql-only + citation (no chart, no table)', () => {
        const result = validateArtifact({
            id: 'fx-verified-2',
            answer: { markdown: 'Statement executed.' },
            sql: 'SELECT 1',
            citations: [{ kind: 'sql', statement: 'SELECT 1' }],
        });
        expect(result.artifact.status).toBe('verified');
        expect(result.artifact.tabs).toEqual(['answer', 'sql', 'evidence']);
    });
});

describe('validateArtifact — grounded-draft status', () => {
    it('emits grounded-draft when answer + citations but no chart/table/sql payload', () => {
        const result = validateArtifact({
            id: 'fx-draft-1',
            answer: { markdown: 'Synthesized observation backed by these sources.' },
            citations: [{ kind: 'pack', packId: 'cpg-fmcg', moduleId: 'kpis' }],
        });
        expect(result.artifact.status).toBe('grounded-draft');
        expect(result.problem).toBeUndefined();
        expect(result.artifact.tabs).toEqual(['answer', 'evidence']);
    });

    it('emits grounded-draft when only vector citation is attached', () => {
        const result = validateArtifact({
            id: 'fx-draft-2',
            answer: { markdown: 'A retrieved chunk informs the answer.' },
            citations: [{ kind: 'vector', indexName: 'kb', chunkId: 'c1' }],
        });
        expect(result.artifact.status).toBe('grounded-draft');
    });
});

describe('validateArtifact — suggestion status', () => {
    it('emits suggestion when only answer is present and no citations', () => {
        const result = validateArtifact({
            id: 'fx-suggest-1',
            answer: { markdown: 'You might also explore profit margin trends.' },
        });
        expect(result.artifact.status).toBe('suggestion');
        expect(result.problem).toBeUndefined();
        expect(result.artifact.tabs).toEqual(['answer']);
    });
});

describe('validateArtifact — blocked status', () => {
    it('blocks an empty artifact', () => {
        const result = validateArtifact({ id: 'fx-empty-1' });
        expect(result.artifact.status).toBe('blocked');
        expect(result.artifact.tabs).toEqual([]);
        expect(result.problem).toBeDefined();
        expect(result.problem!.type).toBe(`${WORKBENCH_PROBLEM_TYPE_PREFIX}empty-artifact`);
        expect(result.problem!.category).toBe('workbench.validation');
        expect(result.problem!.status).toBe(422);
        expect(result.artifact.statusReason).toBe(result.problem!.detail);
    });

    it('blocks a chart without any data-bearing citation', () => {
        const result = validateArtifact({
            id: 'fx-chart-ungrounded',
            answer: { markdown: 'Here is your chart.' },
            chart: { mark: 'bar', data: { values: [{ x: 1 }] }, encoding: {} },
        });
        expect(result.artifact.status).toBe('blocked');
        expect(result.problem!.type).toBe(`${WORKBENCH_PROBLEM_TYPE_PREFIX}ungrounded-data-payload`);
        expect(result.problem!.extensions?.blockedTabs).toEqual(['chart']);
        // Chart payload is stripped from the validated artifact even though
        // the candidate had one — tab strip must reflect that.
        expect(result.artifact.tabs).not.toContain('chart');
        expect(result.artifact.chart).toBeUndefined();
    });

    it('blocks a table without any data-bearing citation', () => {
        const result = validateArtifact({
            id: 'fx-table-ungrounded',
            table: { columns: [{ name: 'x', type: 'STRING' }], rows: [['a']] },
        });
        expect(result.artifact.status).toBe('blocked');
        expect(result.problem!.extensions?.blockedTabs).toEqual(['table']);
        expect(result.artifact.table).toBeUndefined();
    });

    it('blocks chart+table together when both lack grounding', () => {
        const result = validateArtifact({
            id: 'fx-both-ungrounded',
            chart: { mark: 'line', data: {}, encoding: {} },
            table: { columns: [{ name: 'a', type: 'STRING' }], rows: [['x']] },
        });
        expect(result.artifact.status).toBe('blocked');
        expect(result.problem!.extensions?.blockedTabs).toEqual(['chart', 'table']);
    });

    it('chart with only a pack citation is still blocked (pack is not data-bearing)', () => {
        const result = validateArtifact({
            id: 'fx-chart-pack-only',
            chart: { mark: 'bar', data: {}, encoding: {} },
            citations: [{ kind: 'pack', packId: 'cpg-fmcg', moduleId: 'chart-rules' }],
        });
        expect(result.artifact.status).toBe('blocked');
    });
});

// ─── The locked anti-self-declaration rule ─────────────────────────────

describe('validateArtifact — LLM cannot self-declare status', () => {
    it('overrides llmClaimedStatus=verified when payload is unsupported', () => {
        const result = validateArtifact({
            id: 'fx-llm-claim-verified',
            llmClaimedStatus: 'verified',
            chart: { mark: 'bar', data: {}, encoding: {} }, // no citations
        });
        expect(result.artifact.status).toBe('blocked');
        expect(result.overrodeLlmStatus).toBe(true);
    });

    it('overrides llmClaimedStatus=verified on an empty artifact', () => {
        const result = validateArtifact({ id: 'fx-llm-empty', llmClaimedStatus: 'verified' });
        expect(result.artifact.status).toBe('blocked');
        expect(result.overrodeLlmStatus).toBe(true);
    });

    it('overrides llmClaimedStatus=verified on a suggestion-only answer', () => {
        const result = validateArtifact({
            id: 'fx-llm-suggest',
            llmClaimedStatus: 'verified',
            answer: { markdown: 'I think it is X.' },
        });
        expect(result.artifact.status).toBe('suggestion');
        expect(result.overrodeLlmStatus).toBe(true);
    });

    it('reports overrodeLlmStatus=false when llmClaimedStatus matches authoritative', () => {
        const result = validateArtifact({
            id: 'fx-llm-match',
            llmClaimedStatus: 'verified',
            answer: { markdown: 'a' },
            sql: 'SELECT 1',
            citations: [{ kind: 'sql', statement: 'SELECT 1' }],
        });
        expect(result.artifact.status).toBe('verified');
        expect(result.overrodeLlmStatus).toBe(false);
    });

    it('reports overrodeLlmStatus=false when no llmClaimedStatus was supplied', () => {
        const result = validateArtifact({
            id: 'fx-no-llm-claim',
            answer: { markdown: 'a' },
        });
        expect(result.overrodeLlmStatus).toBe(false);
    });
});

// ─── Markdown sanitization ─────────────────────────────────────────────

describe('sanitizeMarkdown', () => {
    it('strips <script> tags', () => {
        const out = sanitizeMarkdown({ markdown: 'hello <script>alert(1)</script> world' });
        expect(out!.markdown).not.toContain('<script>');
        expect(out!.markdown).toContain('hello');
        expect(out!.markdown).toContain('world');
    });

    it('strips <iframe> tags', () => {
        const out = sanitizeMarkdown({ markdown: 'before <iframe src="bad"></iframe> after' });
        expect(out!.markdown).not.toContain('<iframe');
    });

    it('strips on* handler attributes', () => {
        const out = sanitizeMarkdown({ markdown: '<div onclick="x()">click</div>' });
        expect(out!.markdown).not.toMatch(/onclick/);
    });

    it('strips javascript: pseudo-protocol', () => {
        const out = sanitizeMarkdown({ markdown: 'click [here](javascript:alert(1))' });
        expect(out!.markdown).not.toContain('javascript:');
    });

    it('returns undefined for undefined input', () => {
        expect(sanitizeMarkdown(undefined)).toBeUndefined();
    });
});

describe('validateArtifact — sanitizes answer markdown', () => {
    it('strips injection vectors before emitting the artifact', () => {
        const result = validateArtifact({
            id: 'fx-sanitize',
            answer: { markdown: 'Hi <script>evil()</script> there.' },
        });
        expect(result.artifact.answer?.markdown).not.toContain('<script>');
        expect(result.artifact.answer?.markdown).toContain('Hi');
        expect(result.artifact.answer?.markdown).toContain('there.');
    });
});

// ─── Tab derivation under blocking ─────────────────────────────────────

describe('validateArtifact — tab derivation under blocking', () => {
    it('keeps non-blocked tabs when one payload is blocked', () => {
        const result = validateArtifact({
            id: 'fx-mixed',
            answer: { markdown: 'Answer.' },
            chart: { mark: 'bar', data: {}, encoding: {} },
            sql: 'SELECT 1',
            citations: [{ kind: 'pack', packId: 'cpg-fmcg', moduleId: 'chart-rules' }],
        });
        // Chart is blocked (pack-only citation). SQL has no data-bearing
        // citation either, so the whole thing trips the chart-block rule
        // first.
        expect(result.artifact.status).toBe('blocked');
        expect(result.artifact.tabs).not.toContain('chart');
    });

    it('keeps reasoning tab when present even if answer is absent', () => {
        const result = validateArtifact({
            id: 'fx-reasoning-only',
            reasoning: { steps: [{ label: 'Plan', content: 'Look up sales' }] },
            citations: [{ kind: 'pack', packId: 'cpg-fmcg', moduleId: 'rules' }],
        });
        expect(result.artifact.tabs).toContain('reasoning');
    });

    it('drops reasoning tab when steps array is empty', () => {
        const result = validateArtifact({
            id: 'fx-reasoning-empty',
            answer: { markdown: 'hi' },
            reasoning: { steps: [] },
        });
        expect(result.artifact.tabs).not.toContain('reasoning');
    });
});

// ─── Footer telemetry pass-through ─────────────────────────────────────

describe('validateArtifact — preserves telemetry fields', () => {
    it('forwards rowCount / executionTimeMs / source profile / connector type', () => {
        const result = validateArtifact({
            id: 'fx-telemetry',
            answer: { markdown: 'a' },
            rowCount: 3,
            executionTimeMs: 1234,
            sourceProfile: 'default',
            sourceConnectorType: 'genie',
        });
        expect(result.artifact.rowCount).toBe(3);
        expect(result.artifact.executionTimeMs).toBe(1234);
        expect(result.artifact.sourceProfile).toBe('default');
        expect(result.artifact.sourceConnectorType).toBe('genie');
    });
});
