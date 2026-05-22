// playground/src/workbench/__tests__/genieResponseMapper.test.ts

import { describe, it, expect } from 'vitest';
import {
    isGenieTerminal,
    mapGenieMessageToCandidate,
    type GenieMessage,
} from '../genieResponseMapper';
import { validateArtifact } from '../../lib/artifactValidator';

const SUPERSTORE_MESSAGE: GenieMessage = {
    id: 'msg-1',
    message_id: 'msg-1',
    conversation_id: 'conv-1',
    status: 'COMPLETED',
    created_timestamp: 1000,
    last_updated_timestamp: 1500,
    content: 'The top 3 product categories by total sales are Technology, Furniture, and Office Supplies.',
    attachments: [
        {
            attachment_id: 'a1',
            query: {
                query: 'SELECT category, SUM(sales) FROM x GROUP BY category',
                description: 'Top 3 categories by sales',
                statement_id: 'st-1',
                query_result_metadata: { row_count: 3 },
                thoughts: [
                    { thought_type: 'THOUGHT_TYPE_DESCRIPTION', content: 'You want the top 3 categories.' },
                    { thought_type: 'THOUGHT_TYPE_DATA_SOURCING', content: '- workspace.databrickspractice.vw_genie_sales_performance' },
                    { thought_type: 'THOUGHT_TYPE_STEPS', content: 'Sum sales, rank desc, take 3.' },
                ],
                result: {
                    columns: [{ name: 'category', type: 'STRING' }, { name: 'sales', type: 'DECIMAL' }],
                    data_table: [['Technology', '836154.03'], ['Furniture', '741999.80']],
                    row_count: 2,
                },
            },
        },
        { attachment_id: 'a2', suggested_questions: { questions: ['What about by region?', 'Profit margin trend?'] } },
    ],
};

// ─── isGenieTerminal ───────────────────────────────────────────────────

describe('isGenieTerminal', () => {
    it('returns true for COMPLETED / FAILED / CANCELLED', () => {
        expect(isGenieTerminal('COMPLETED')).toBe(true);
        expect(isGenieTerminal('FAILED')).toBe(true);
        expect(isGenieTerminal('CANCELLED')).toBe(true);
    });
    it('returns false for non-terminal statuses', () => {
        expect(isGenieTerminal('SUBMITTED')).toBe(false);
        expect(isGenieTerminal('EXECUTING')).toBe(false);
        expect(isGenieTerminal('FETCHING_METADATA')).toBe(false);
        expect(isGenieTerminal(undefined)).toBe(false);
        expect(isGenieTerminal('completed')).toBe(false); // case-sensitive on purpose
    });
});

// ─── mapper happy path ────────────────────────────────────────────────

describe('mapGenieMessageToCandidate — happy path', () => {
    it('produces a candidate that validates to verified status with citations + grounded SQL', () => {
        const { candidate } = mapGenieMessageToCandidate({ message: SUPERSTORE_MESSAGE, profile: 'default' });
        const result = validateArtifact(candidate);
        expect(result.artifact.status).toBe('verified');
        expect(result.artifact.tabs).toEqual(['answer', 'table', 'sql', 'evidence', 'reasoning']);
        expect(result.artifact.sql).toContain('SELECT category');
        expect(result.artifact.table?.rows).toHaveLength(2);
        expect(result.artifact.citations).toHaveLength(2);
        expect(result.artifact.citations?.[0].kind).toBe('sql');
        expect(result.artifact.citations?.[1].kind).toBe('result-rows');
        expect(result.artifact.reasoning?.steps).toHaveLength(3);
        expect(result.artifact.executionTimeMs).toBe(500);
        expect(result.artifact.rowCount).toBe(2);
        expect(result.artifact.sourceProfile).toBe('default');
        expect(result.artifact.sourceConnectorType).toBe('genie');
    });

    it('translates Genie thought types to friendly labels', () => {
        const { candidate } = mapGenieMessageToCandidate({ message: SUPERSTORE_MESSAGE, profile: 'default' });
        expect(candidate.reasoning?.steps.map((s) => s.label)).toEqual(['Intent', 'Sources', 'Plan']);
    });

    it('falls back to a text attachment when message.content is absent', () => {
        const message: GenieMessage = {
            id: 'm1',
            attachments: [{ text: { content: 'From the text attachment.' } }],
        };
        const { candidate } = mapGenieMessageToCandidate({ message, profile: 'p' });
        expect(candidate.answer?.markdown).toBe('From the text attachment.');
    });
});

// ─── suggested follow-up questions ─────────────────────────────────────

describe('mapGenieMessageToCandidate — suggested follow-up questions', () => {
    it('extracts non-empty questions from suggested_questions attachment', () => {
        const { suggestedQuestions } = mapGenieMessageToCandidate({ message: SUPERSTORE_MESSAGE, profile: 'p' });
        expect(suggestedQuestions).toEqual(['What about by region?', 'Profit margin trend?']);
    });

    it('returns an empty array when no suggested_questions attachment is present', () => {
        const { suggestedQuestions } = mapGenieMessageToCandidate({
            message: { id: 'm1', content: 'hi' },
            profile: 'p',
        });
        expect(suggestedQuestions).toEqual([]);
    });

    it('drops empty / whitespace-only / non-string questions', () => {
        const { suggestedQuestions } = mapGenieMessageToCandidate({
            message: {
                id: 'm1',
                attachments: [{
                    suggested_questions: { questions: ['good one', '', '   ', null as unknown as string, 'another'] },
                }],
            },
            profile: 'p',
        });
        expect(suggestedQuestions).toEqual(['good one', 'another']);
    });

    it('collects questions across multiple suggested_questions attachments', () => {
        const { suggestedQuestions } = mapGenieMessageToCandidate({
            message: {
                id: 'm1',
                attachments: [
                    { suggested_questions: { questions: ['q1'] } },
                    { suggested_questions: { questions: ['q2', 'q3'] } },
                ],
            },
            profile: 'p',
        });
        expect(suggestedQuestions).toEqual(['q1', 'q2', 'q3']);
    });
});

// ─── labelled SQL sections ────────────────────────────────────────────

describe('mapGenieMessageToCandidate — labelled SQL sections', () => {
    it('emits sqlSections from attachments[].query.sqlSections (Phase 11b shape)', () => {
        const message: GenieMessage = {
            id: 'm1',
            attachments: [{
                query: {
                    query: 'WITH headline AS (...), trends AS (...) SELECT * FROM headline UNION ALL SELECT * FROM trends',
                    sqlSections: [
                        { sectionId: 'HEADLINE', cteName: 'headline', sqlFragment: 'SELECT 1 AS headline_kpi' },
                        { sectionId: 'TRENDS', sqlFragment: 'SELECT month, value FROM trend_view' },
                    ],
                },
            }],
        };
        const { candidate, sqlSections } = mapGenieMessageToCandidate({ message, profile: 'p' });
        expect(sqlSections).toHaveLength(2);
        expect(sqlSections[0]).toEqual({ sectionId: 'HEADLINE', cteName: 'headline', sqlFragment: 'SELECT 1 AS headline_kpi' });
        expect(sqlSections[1]).toEqual({ sectionId: 'TRENDS', sqlFragment: 'SELECT month, value FROM trend_view' });
        expect(candidate.sqlSections).toEqual(sqlSections);
    });

    it('returns empty sqlSections when attachments expose no sqlSections array', () => {
        const { sqlSections, candidate } = mapGenieMessageToCandidate({ message: SUPERSTORE_MESSAGE, profile: 'p' });
        expect(sqlSections).toEqual([]);
        expect(candidate.sqlSections).toBeUndefined();
    });

    it('drops sections with missing sectionId or empty sqlFragment', () => {
        const message: GenieMessage = {
            id: 'm1',
            attachments: [{
                query: {
                    query: 'SELECT 1',
                    sqlSections: [
                        { sectionId: '', sqlFragment: 'still has sql' },
                        { sectionId: 'OK', sqlFragment: '' },
                        { sectionId: 'GOOD', sqlFragment: 'SELECT 2' },
                    ],
                },
            }],
        };
        const { sqlSections } = mapGenieMessageToCandidate({ message, profile: 'p' });
        expect(sqlSections).toHaveLength(1);
        expect(sqlSections[0].sectionId).toBe('GOOD');
    });
});

// ─── mapper does NOT fabricate ────────────────────────────────────────

describe('mapGenieMessageToCandidate — never fabricates', () => {
    it('emits no chart when Genie returns no chart spec', () => {
        const { candidate } = mapGenieMessageToCandidate({ message: SUPERSTORE_MESSAGE, profile: 'default' });
        expect(candidate.chart).toBeUndefined();
    });

    it('emits no citations when Genie returns no query/result', () => {
        const message: GenieMessage = {
            id: 'm1',
            status: 'COMPLETED',
            content: 'Some narrative.',
            attachments: [],
        };
        const { candidate } = mapGenieMessageToCandidate({ message, profile: 'default' });
        expect(candidate.citations).toBeUndefined();
        expect(candidate.sql).toBeUndefined();
        expect(candidate.table).toBeUndefined();
    });

    it('answer-only with no citations validates to suggestion (no ungrounded promotion)', () => {
        const message: GenieMessage = {
            id: 'm1',
            status: 'COMPLETED',
            content: 'You might consider profit margin trends.',
        };
        const { candidate } = mapGenieMessageToCandidate({ message, profile: 'default' });
        const result = validateArtifact(candidate);
        expect(result.artifact.status).toBe('suggestion');
        expect(result.artifact.tabs).toEqual(['answer']);
    });
});

// ─── mapper handles missing/odd fields gracefully ────────────────────

describe('mapGenieMessageToCandidate — defensive coding', () => {
    it('uses a stable id when message.id / message_id are missing', () => {
        const { candidate } = mapGenieMessageToCandidate({ message: { status: 'COMPLETED' }, profile: 'p' });
        expect(candidate.id).toMatch(/^genie-/);
    });

    it('skips empty thoughts', () => {
        const { candidate } = mapGenieMessageToCandidate({
            message: {
                id: 'm1',
                attachments: [{ query: { query: 'SELECT 1', thoughts: [{ content: '' }, { content: 'real' }] } }],
            },
            profile: 'p',
        });
        expect(candidate.reasoning?.steps).toHaveLength(1);
        expect(candidate.reasoning?.steps[0].content).toBe('real');
    });

    it('omits executionTimeMs when timestamps are missing or inverted', () => {
        const { candidate: noTimes } = mapGenieMessageToCandidate({ message: { id: 'm1' }, profile: 'p' });
        expect(noTimes.executionTimeMs).toBeUndefined();
        const { candidate: inverted } = mapGenieMessageToCandidate({
            message: { id: 'm1', created_timestamp: 1000, last_updated_timestamp: 500 },
            profile: 'p',
        });
        expect(inverted.executionTimeMs).toBeUndefined();
    });

    it('normalizes table cells: null preserved, non-string non-number stringified', () => {
        const message: GenieMessage = {
            id: 'm1',
            attachments: [{
                query: {
                    query: 'SELECT 1',
                    result: {
                        columns: [{ name: 'a', type: 'STRING' }],
                        data_table: [[null], [42], ['hello'], [true as unknown as string]],
                    },
                },
            }],
        };
        const { candidate } = mapGenieMessageToCandidate({ message, profile: 'p' });
        expect(candidate.table?.rows[0][0]).toBeNull();
        expect(candidate.table?.rows[1][0]).toBe(42);
        expect(candidate.table?.rows[2][0]).toBe('hello');
        expect(candidate.table?.rows[3][0]).toBe('true');
    });
});
