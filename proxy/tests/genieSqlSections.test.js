'use strict';

// Phase 11b — verify normalizeGenieResponse() surfaces per-section SQL
// provenance for the staged-rendering flow (docs/STAGED_RENDERING.md +
// docs/DISCOVERY_LOOP.md).
//
// Architectural reminder (the contract these tests defend):
//   - HEADLINE fires `/start` and creates the conversationId
//   - TRENDS / RISKS / RECOMMENDED ACTIONS fire `/follow-up` on that same
//     conversationId; each gets its OWN messageId (Genie's API is one LLM
//     turn = one message)
//   - Each follow-up's response carries SQL on `attachments[].query.query`
//   - The Genie + Foundation Model prompt translators inject
//     `/* Section: X */` markers into the SQL when the IR carries
//     structured-sections output
//   - sqlSectionExtractor parses those markers; normalizeGenieResponse now
//     surfaces the parsed sections as `att.query.sqlSections`
//
// What "associated back to the same conversation" means in practice:
//   - The proxy passes `data.conversation_id` + `data.message_id` through
//     unchanged on every poll response
//   - When the playground stitches 4 messages back together by
//     conversationId, each message's sqlSections joins the correct section
//     to the correct briefing
//   - These tests verify the unit (extraction per message); the join is
//     a property of the conversation-id pass-through, exercised elsewhere

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';

const { normalizeGenieResponse } = require('../server');

describe('Phase 11b — Genie SQL section extraction in normalizeGenieResponse', () => {
    describe('Per-message section extraction (staged-render contract)', () => {
        it('surfaces a HEADLINE section when the /start message SQL carries a marker', () => {
            const data = {
                status: 'COMPLETED',
                conversation_id: 'conv-briefing-001',
                message_id: 'msg-headline',
                content: 'leaked system prompt',
                attachments: [
                    { text: { content: '## HEADLINE\nTotal Sales of $2.30M are on-track.' } },
                    {
                        query: {
                            query:
                                '/* Section: HEADLINE */\nWITH headline_data AS (\n  SELECT SUM(amount) AS total\n  FROM gold.sales\n)\nSELECT * FROM headline_data;',
                        },
                    },
                ],
            };

            normalizeGenieResponse(data);

            // Conversation/message identity preserved for downstream join.
            expect(data.conversation_id).toBe('conv-briefing-001');
            expect(data.message_id).toBe('msg-headline');

            // Per-section SQL surfaced; raw blob preserved as fallback.
            const queryAtt = data.attachments[1];
            expect(queryAtt.query.query).toContain('/* Section: HEADLINE */');
            expect(queryAtt.query.sqlSections).toHaveLength(1);
            expect(queryAtt.query.sqlSections[0]).toMatchObject({
                sectionId: 'HEADLINE',
                cteName: 'headline_data',
            });
            expect(queryAtt.query.sqlSections[0].sqlFragment).toContain('/* Section: HEADLINE */');
            expect(queryAtt.query.sqlSections[0].sqlFragment).toContain('SUM(amount)');
        });

        it('surfaces a TRENDS section on a follow-up message of the same conversation', () => {
            const data = {
                status: 'COMPLETED',
                conversation_id: 'conv-briefing-001',
                message_id: 'msg-trends',
                content: 'irrelevant — visual reads text attachment',
                attachments: [
                    { text: { content: '## TRENDS\nYoY growth of 12.4% sustained.' } },
                    {
                        query: {
                            query: '-- Section: TRENDS\nSELECT month, SUM(amount) AS m_total\nFROM gold.sales\nGROUP BY month\nORDER BY month;',
                        },
                    },
                ],
            };

            normalizeGenieResponse(data);

            expect(data.conversation_id).toBe('conv-briefing-001');
            expect(data.message_id).toBe('msg-trends');
            const sections = data.attachments[1].query.sqlSections;
            expect(sections).toHaveLength(1);
            expect(sections[0].sectionId).toBe('TRENDS');
            // -- Section: ... form doesn't introduce a CTE name; cteName is null.
            expect(sections[0].cteName).toBeNull();
        });

        it('handles single-call structured response with all four sections in one SQL blob (Foundation Model path)', () => {
            // The original single-call structured approach (still used by
            // FM backends that don't support follow-ups) returns all four
            // sections in one SQL. The extractor must surface all four.
            const data = {
                status: 'COMPLETED',
                conversation_id: 'conv-briefing-002',
                message_id: 'msg-single-call',
                content: 'briefing',
                attachments: [
                    {
                        query: {
                            query: [
                                '/* Section: HEADLINE */',
                                'WITH headline_data AS (SELECT SUM(amount) AS total FROM gold.sales),',
                                '/* Section: TRENDS */',
                                'trends_data AS (SELECT month, SUM(amount) AS m FROM gold.sales GROUP BY month),',
                                '/* Section: RISKS */',
                                'risks_data AS (SELECT region, AVG(margin) AS avg_m FROM gold.sales GROUP BY region),',
                                '/* Section: ACTIONS */',
                                'actions_data AS (SELECT product, MIN(stock) AS low FROM gold.inventory GROUP BY product)',
                                'SELECT * FROM headline_data;',
                            ].join('\n'),
                        },
                    },
                ],
            };

            normalizeGenieResponse(data);

            const sections = data.attachments[0].query.sqlSections;
            expect(sections).toHaveLength(4);
            expect(sections.map(s => s.sectionId)).toEqual(['HEADLINE', 'TRENDS', 'RISKS', 'ACTIONS']);
            expect(sections.map(s => s.cteName)).toEqual([
                'headline_data',
                'trends_data',
                'risks_data',
                'actions_data',
            ]);
        });

        it('does NOT add sqlSections when no markers are present (raw blob fallback)', () => {
            const data = {
                status: 'COMPLETED',
                conversation_id: 'conv-legacy',
                message_id: 'msg-legacy',
                attachments: [
                    {
                        query: {
                            query: 'SELECT SUM(amount) FROM gold.sales WHERE month = 2024;',
                        },
                    },
                ],
            };

            normalizeGenieResponse(data);

            // Raw blob preserved.
            expect(data.attachments[0].query.query).toBe('SELECT SUM(amount) FROM gold.sales WHERE month = 2024;');
            // No sqlSections key was added (clean fallback for legacy clients).
            expect(data.attachments[0].query.sqlSections).toBeUndefined();
        });

        it('silently ignores malformed markers without breaking response normalization', () => {
            // A marker that fails the [A-Z0-9_-]{1,64} sectionId regex
            // (lower-case, too long, special chars) is dropped silently.
            const data = {
                status: 'COMPLETED',
                conversation_id: 'conv-malformed',
                message_id: 'msg-malformed',
                content: 'leaked',
                attachments: [
                    { text: { content: 'fallback answer text' } },
                    {
                        query: {
                            query: '/* section: this is not a valid id! */\nSELECT 1',
                        },
                    },
                ],
            };

            // Must not throw.
            expect(() => normalizeGenieResponse(data)).not.toThrow();

            // content extraction still works (BUG-003 protection).
            expect(data.content).toBe('fallback answer text');
            // Malformed markers → no sqlSections field added.
            expect(data.attachments[1].query.sqlSections).toBeUndefined();
        });
    });

    describe('Cross-message conversation join (the user-facing payoff)', () => {
        it('preserves conversationId across four staged-render messages so per-section SQL stitches back to one briefing', () => {
            const conversationId = 'conv-exec-briefing-2026-05-17';

            // Four poll responses arriving in sequence, mirroring the
            // 1-conversation / 4-message staged contract.
            const messages = [
                {
                    conversation_id: conversationId,
                    message_id: 'msg-headline',
                    status: 'COMPLETED',
                    attachments: [
                        { text: { content: '## HEADLINE\nTotal Sales of $2.30M on-track.' } },
                        { query: { query: '/* Section: HEADLINE */\nWITH headline_data AS (SELECT SUM(amount) AS total FROM gold.sales)\nSELECT * FROM headline_data;' } },
                    ],
                },
                {
                    conversation_id: conversationId,
                    message_id: 'msg-trends',
                    status: 'COMPLETED',
                    attachments: [
                        { text: { content: '## TRENDS\nYoY +12.4% sustained.' } },
                        { query: { query: '-- Section: TRENDS\nSELECT month, SUM(amount) FROM gold.sales GROUP BY month;' } },
                    ],
                },
                {
                    conversation_id: conversationId,
                    message_id: 'msg-risks',
                    status: 'COMPLETED',
                    attachments: [
                        { text: { content: '## RISKS\nMargin pressure in EMEA.' } },
                        { query: { query: '/* Section: RISKS */\nWITH risks_data AS (SELECT region, AVG(margin) AS m FROM gold.sales GROUP BY region)\nSELECT * FROM risks_data;' } },
                    ],
                },
                {
                    conversation_id: conversationId,
                    message_id: 'msg-actions',
                    status: 'COMPLETED',
                    attachments: [
                        { text: { content: '## ACTIONS\nRebalance EMEA pricing.' } },
                        { query: { query: '-- Section: ACTIONS\nSELECT product, MIN(stock) FROM gold.inventory GROUP BY product;' } },
                    ],
                },
            ];

            messages.forEach(normalizeGenieResponse);

            // Every message preserves the same conversationId — clients
            // can join the four sections into one briefing by this key.
            for (const msg of messages) {
                expect(msg.conversation_id).toBe(conversationId);
            }

            // Each message carries exactly one section, matching its role.
            const sectionByMessageId = Object.fromEntries(
                messages.map(m => [m.message_id, m.attachments[1].query.sqlSections]),
            );
            expect(sectionByMessageId['msg-headline'][0].sectionId).toBe('HEADLINE');
            expect(sectionByMessageId['msg-trends'][0].sectionId).toBe('TRENDS');
            expect(sectionByMessageId['msg-risks'][0].sectionId).toBe('RISKS');
            expect(sectionByMessageId['msg-actions'][0].sectionId).toBe('ACTIONS');

            // The union across all four messages is the full section set
            // — what a "clean lean strong" audit trail looks like.
            const allSectionIds = messages.flatMap(m => m.attachments[1].query.sqlSections.map(s => s.sectionId));
            expect(allSectionIds.sort()).toEqual(['ACTIONS', 'HEADLINE', 'RISKS', 'TRENDS']);
        });
    });

    describe('Coexistence with existing normalizeGenieResponse contracts', () => {
        it('does not regress BUG-003 (system-prompt-leak fix still works on a multi-attachment message)', () => {
            const data = {
                status: 'COMPLETED',
                content: 'You are Azure Databricks Genie operating inside a custom visual...',
                attachments: [
                    { text: { content: '## HEADLINE\nReal answer.' } },
                    { query: { query: '/* Section: HEADLINE */\nSELECT 1' } },
                ],
            };

            normalizeGenieResponse(data);

            // BUG-003 — content replaced with attachment text, not system prompt.
            expect(data.content).toBe('## HEADLINE\nReal answer.');
            // Extractor still ran in the same pass.
            expect(data.attachments[1].query.sqlSections).toHaveLength(1);
            expect(data.attachments[1].query.sqlSections[0].sectionId).toBe('HEADLINE');
        });

        it('preserves attachments object identity (no clone) so downstream rendering keeps references', () => {
            const sqlAtt = { query: { query: '/* Section: HEADLINE */\nSELECT 1' } };
            const textAtt = { text: { content: 'answer' } };
            const data = {
                status: 'COMPLETED',
                content: 'leaked',
                attachments: [textAtt, sqlAtt],
            };

            normalizeGenieResponse(data);

            // Object identity preserved — same reference, just augmented with sqlSections.
            expect(data.attachments[0]).toBe(textAtt);
            expect(data.attachments[1]).toBe(sqlAtt);
            // Raw blob untouched (the fallback for clients that don't read sqlSections yet).
            expect(data.attachments[1].query.query).toBe('/* Section: HEADLINE */\nSELECT 1');
        });
    });
});
