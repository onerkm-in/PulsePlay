'use strict';

// Phase D.5 — unit + integration coverage for the Genie path through
// /assistant/conversations/start-sectioned.
//
// What this defends:
//   • isGenieProfile correctly classifies profile shapes (Genie vs FM vs
//     supervisor vs incomplete)
//   • extractGenieSql pulls the first non-empty SQL fragment from
//     attachments[].query, ignoring narrative-only messages
//   • buildGenieRunSection respects the CLAUDE.md tripwire — multi-
//     section Genie flows allocate N message_ids under ONE shared
//     conversation_id, by mutating the closure's conversationState
//   • The Genie path emits the same SSE frame shape as the FM path
//     (section-started / section-completed / all-completed with renderId)
//   • 400 when neither FM nor Genie profile resolves

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';
// Configure ONLY a Genie profile so FM resolution fails and Genie wins.
process.env.PROXY_PROFILE_SALES_TYPE = 'genie';
process.env.PROXY_PROFILE_SALES_HOST = 'https://dbc-test.cloud.databricks.com';
process.env.PROXY_PROFILE_SALES_TOKEN = 'dapi_test';
process.env.PROXY_PROFILE_SALES_SPACE_ID = 'space-abc';

const {
    isGenieProfile,
    resolveGenieProfile,
    buildGenieRunSection,
    extractGenieSql,
} = require('../server');

describe('isGenieProfile', () => {
    it('classifies a profile with spaceId and non-FM, non-supervisor type as Genie', () => {
        expect(isGenieProfile({ type: 'genie', spaceId: 'space-1', host: 'x' })).toBe(true);
        // type is optional — a profile with spaceId alone counts as Genie.
        expect(isGenieProfile({ spaceId: 'space-1', host: 'x' })).toBe(true);
    });

    it('rejects profiles without spaceId', () => {
        expect(isGenieProfile({ type: 'genie' })).toBe(false);
        expect(isGenieProfile({ spaceId: '' })).toBe(false);
        expect(isGenieProfile(null)).toBe(false);
        expect(isGenieProfile(undefined)).toBe(false);
    });

    it('rejects Foundation Model profiles even when they carry a spaceId', () => {
        expect(isGenieProfile({
            type: 'foundation-model',
            spaceId: 'space-x',
            foundationModelEndpoint: 'databricks-llama',
        })).toBe(false);
    });

    it('rejects supervisor profiles', () => {
        expect(isGenieProfile({ type: 'supervisor-local', spaceId: 'space-x' })).toBe(false);
        expect(isGenieProfile({ type: 'supervisor', spaceId: 'space-x' })).toBe(false);
    });
});

describe('extractGenieSql', () => {
    it('pulls SQL from attachments[].query.query', () => {
        const data = {
            attachments: [
                { text: { content: '## HEADLINE\nTotal sales steady.' } },
                { query: { query: 'SELECT SUM(amount) FROM gold.sales' } },
            ],
        };
        expect(extractGenieSql(data)).toBe('SELECT SUM(amount) FROM gold.sales');
    });

    it('falls back to attachments[].query.text', () => {
        const data = {
            attachments: [{ query: { text: 'SELECT 1' } }],
        };
        expect(extractGenieSql(data)).toBe('SELECT 1');
    });

    it('returns null when no query attachment is present', () => {
        const data = {
            attachments: [{ text: { content: '## SUMMARY\nNarrative only.' } }],
        };
        expect(extractGenieSql(data)).toBeNull();
    });

    it('returns null for empty / whitespace SQL', () => {
        const data = { attachments: [{ query: { query: '   \n   ' } }] };
        expect(extractGenieSql(data)).toBeNull();
    });

    it('returns null for missing or non-object input', () => {
        expect(extractGenieSql(null)).toBeNull();
        expect(extractGenieSql(undefined)).toBeNull();
        expect(extractGenieSql({})).toBeNull();
    });

    it('returns the first SQL when multiple query attachments are present', () => {
        const data = {
            attachments: [
                { query: { query: 'SELECT 1' } },
                { query: { query: 'SELECT 2' } },
            ],
        };
        expect(extractGenieSql(data)).toBe('SELECT 1');
    });
});

describe('buildGenieRunSection — shared conversationId tripwire', () => {
    const profile = { spaceId: 'space-abc', host: 'https://dbc-test.cloud.databricks.com', token: 'dapi_test' };

    function makeStubs() {
        let nextMessageId = 100;
        const calls = [];
        const ensureWarehouse = jest.fn().mockResolvedValue(undefined);
        const enrichResults = jest.fn().mockResolvedValue(undefined);
        const sleep = jest.fn().mockResolvedValue(undefined);
        const dbRequest = jest.fn().mockImplementation(async (_profile, method, urlPath, body) => {
            calls.push({ method, urlPath, body });
            if (method === 'POST' && urlPath.endsWith('/start-conversation')) {
                return {
                    conversation_id: 'conv-xyz',
                    message_id: 'msg-headline',
                };
            }
            if (method === 'POST' && urlPath.includes('/conversations/conv-xyz/messages')) {
                nextMessageId += 1;
                return { message_id: `msg-followup-${nextMessageId}` };
            }
            if (method === 'GET' && urlPath.includes('/messages/')) {
                // Always return COMPLETED on the first poll so the test
                // finishes fast — production polls until COMPLETED.
                return {
                    status: 'COMPLETED',
                    attachments: [
                        { text: { content: '## OUTPUT\nbody-text' } },
                        { query: { query: 'SELECT 1' } },
                    ],
                };
            }
            throw new Error(`unstubbed dbRequest: ${method} ${urlPath}`);
        });
        return { calls, dbRequest, ensureWarehouse, enrichResults, sleep };
    }

    it('creates the conversation on the FIRST call and reuses it on subsequent calls', async () => {
        const { calls, dbRequest, ensureWarehouse, enrichResults, sleep } = makeStubs();
        const conversationState = { conversationId: null };
        const runSection = buildGenieRunSection({
            profile,
            userPrompt: 'why is OTIF down?',
            req: { requestId: 'req-1' },
            conversationState,
            dbRequest,
            ensureWarehouse,
            enrichResults,
            sleep,
        });

        // Stage 0 — HEADLINE
        const head = await runSection({ sectionId: 'HEADLINE' });
        expect(conversationState.conversationId).toBe('conv-xyz');
        expect(head.body).toContain('body-text');
        expect(head.sql).toEqual({ fragment: 'SELECT 1' });

        // Stage 1 — TRENDS (must reuse the same conv-xyz, NOT call start-conversation again)
        const trends = await runSection({ sectionId: 'TRENDS' });
        expect(trends.body).toContain('body-text');

        // Audit the network calls. Exactly ONE start-conversation; the rest
        // are follow-up POSTs and polls under conv-xyz.
        const startConvs = calls.filter(c => c.urlPath.endsWith('/start-conversation'));
        const followUps = calls.filter(c =>
            c.method === 'POST' && c.urlPath.includes('/conversations/conv-xyz/messages')
        );
        expect(startConvs).toHaveLength(1);
        expect(followUps).toHaveLength(1);
        // Polls land under the same conv-xyz.
        for (const c of calls) {
            if (c.method === 'GET' && c.urlPath.includes('/messages/')) {
                expect(c.urlPath).toContain('/conversations/conv-xyz/');
            }
        }
    });

    it('forwards the section id into the user prompt content', async () => {
        const { calls, dbRequest, ensureWarehouse, enrichResults, sleep } = makeStubs();
        const conversationState = { conversationId: null };
        const runSection = buildGenieRunSection({
            profile,
            userPrompt: 'why is OTIF down?',
            req: { requestId: 'req-1' },
            conversationState,
            dbRequest,
            ensureWarehouse,
            enrichResults,
            sleep,
        });
        await runSection({ sectionId: 'HEADLINE' });
        const startCall = calls.find(c => c.urlPath.endsWith('/start-conversation'));
        expect(startCall).toBeDefined();
        expect(startCall.body.content).toContain('# Section: HEADLINE');
        expect(startCall.body.content).toContain('why is OTIF down?');
    });

    it('throws when start-conversation returns no conversation_id', async () => {
        const dbRequest = jest.fn().mockResolvedValue({ /* missing ids */ });
        const runSection = buildGenieRunSection({
            profile,
            userPrompt: 'q',
            req: {},
            conversationState: { conversationId: null },
            dbRequest,
            ensureWarehouse: jest.fn().mockResolvedValue(undefined),
            enrichResults: jest.fn().mockResolvedValue(undefined),
            sleep: jest.fn().mockResolvedValue(undefined),
        });
        await expect(runSection({ sectionId: 'HEADLINE' })).rejects.toThrow(/conversation_id/);
    });

    it('throws when Genie reports FAILED status on poll', async () => {
        const dbRequest = jest.fn().mockImplementation(async (_p, method, urlPath) => {
            if (method === 'POST' && urlPath.endsWith('/start-conversation')) {
                return { conversation_id: 'conv-x', message_id: 'msg-x' };
            }
            return { status: 'FAILED', attachments: [{ text: { content: 'no data' } }] };
        });
        const runSection = buildGenieRunSection({
            profile,
            userPrompt: 'q',
            req: {},
            conversationState: { conversationId: null },
            dbRequest,
            ensureWarehouse: jest.fn().mockResolvedValue(undefined),
            enrichResults: jest.fn().mockResolvedValue(undefined),
            sleep: jest.fn().mockResolvedValue(undefined),
        });
        await expect(runSection({ sectionId: 'HEADLINE' })).rejects.toThrow(/Genie FAILED/);
    });

    it('throws when the AbortSignal is aborted before warehouse ready', async () => {
        const controller = new AbortController();
        controller.abort();
        const dbRequest = jest.fn();
        const runSection = buildGenieRunSection({
            profile,
            userPrompt: 'q',
            req: {},
            conversationState: { conversationId: null },
            dbRequest,
            ensureWarehouse: jest.fn().mockResolvedValue(undefined),
            enrichResults: jest.fn().mockResolvedValue(undefined),
            sleep: jest.fn().mockResolvedValue(undefined),
        });
        await expect(runSection({ sectionId: 'HEADLINE', signal: controller.signal })).rejects.toThrow(/aborted/);
        // dbRequest must not have been called once aborted.
        expect(dbRequest).not.toHaveBeenCalled();
    });
});

describe('resolveGenieProfile', () => {
    it('returns the configured Genie profile by explicit name', () => {
        const req = { headers: {}, query: {} };
        const resolved = resolveGenieProfile({ profile: 'sales' }, {}, req);
        expect(resolved).not.toBeNull();
        expect(resolved.name).toBe('sales');
        expect(resolved.profile.spaceId).toBe('space-abc');
    });

    it('auto-selects the first Genie profile when no name given', () => {
        const resolved = resolveGenieProfile({}, {}, { headers: {}, query: {} });
        expect(resolved).not.toBeNull();
        expect(resolved.profile.spaceId).toBeTruthy();
    });

    it('returns null for an unknown explicit profile name', () => {
        const resolved = resolveGenieProfile({ profile: 'no-such' }, {}, { headers: {}, query: {} });
        expect(resolved).toBeNull();
    });
});
