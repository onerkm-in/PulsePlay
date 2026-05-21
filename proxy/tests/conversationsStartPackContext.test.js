'use strict';

/**
 * conversationsStartPackContext.test.js — Cycle C backend.
 *
 * End-to-end coverage for the pack-context injection added to the three
 * start-conversation routes:
 *   - POST /assistant/conversations/start  (Genie)
 *   - POST /openai/conversations/start     (OpenAI orchestrator + chat-only)
 *   - POST /bedrock/conversations/start    (Bedrock direct, RAG, and analytics)
 *
 * The supervisor / supervisor-stream routes are intentionally excluded for
 * v0.5 (their context-shaping is independent — see HANDOVER for the next
 * cycle's note).
 *
 * Strategy:
 *   - fs is mocked at module scope so cfg() returns a controlled config.
 *   - The Genie route is exercised by intercepting https.request via
 *     jest.spyOn(https, 'request'); the inspector captures the JSON body.
 *   - OpenAI + Bedrock routes are exercised by mocking global.fetch.
 *   - The pack loader is pointed at the real pulsepacks/cpg-fmcg tree on disk
 *     (the Smart Connect pack ships with the project, so this is a real
 *     end-to-end test of the loader + injector + route handlers).
 */

// ── Config mock ────────────────────────────────────────────────────────────
const MOCK_CONFIG = {
    port: 0,
    profiles: {
        // Genie-shape default profile.
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abcdef',
            spaceId: 'space-default-123',
        },
        // OpenAI chat-only.
        'oai-chat': {
            azureOpenAiEndpoint: 'https://aoai.openai.azure.com',
            azureOpenAiKey: 'fake-key',
            azureOpenAiDeployment: 'gpt-4o',
        },
        // Bedrock direct chat (no analytics, no schemaContext).
        'bedrock-direct': {
            bedrockAccessKeyId: 'AKIA-FAKE',
            bedrockSecretAccessKey: 'fake-secret',
            bedrockRegion: 'us-east-1',
        },
        // Bedrock RAG (KB-coupled).
        'bedrock-rag': {
            bedrockKnowledgeBaseId: 'kb-1234',
            bedrockRegion: 'us-east-1',
            bedrockAccessKeyId: 'AKIA-FAKE',
            bedrockSecretAccessKey: 'fake-secret',
        },
    },
};

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn((filePath) =>
            String(filePath).endsWith('config.json') ? true : actual.existsSync(filePath)
        ),
        readFileSync: jest.fn((filePath, ...rest) => {
            if (String(filePath).endsWith('config.json')) {
                return JSON.stringify(MOCK_CONFIG);
            }
            return actual.readFileSync(filePath, ...rest);
        }),
        appendFileSync: jest.fn(),
    };
});

jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

// SUPERVISOR_ENABLED=false so the env layer doesn't auto-inject a supervisor
// profile that might collide with our mock entries.
process.env.SUPERVISOR_ENABLED = 'false';

const request = require('supertest');
const https = require('https');
const { app } = require('../server');
const { __rebuildCache: rebuildPackCache } = require('../lib/packPromptLoader');

// ── Console silencing ─────────────────────────────────────────────────────
let _logSpy, _errSpy, _warnSpy;
beforeAll(() => {
    _logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    _errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    _warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
    _logSpy?.mockRestore();
    _errSpy?.mockRestore();
    _warnSpy?.mockRestore();
});

beforeEach(() => {
    rebuildPackCache();
    _logSpy.mockClear();
    _errSpy.mockClear();
    _warnSpy.mockClear();
});

// ── Audit-log capture helper ───────────────────────────────────────────────
function captureAuditLines(fn) {
    const captured = [];
    _logSpy.mockImplementation((tag, line) => {
        if (tag === '[audit]' && typeof line === 'string') {
            try { captured.push(JSON.parse(line)); }
            catch { /* ignore */ }
        }
    });
    return fn().then(res => ({ res, audit: captured }));
}

// ── Genie route ───────────────────────────────────────────────────────────
describe('POST /assistant/conversations/start — pack-context injection', () => {
    let httpsSpy;
    let lastBody;
    let lastUrlPath;

    beforeEach(() => {
        lastBody = null;
        lastUrlPath = null;
        httpsSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
            lastUrlPath = options.path;
            const fakeReq = {
                _writtenChunks: [],
                on: jest.fn(),
                write(chunk) { this._writtenChunks.push(chunk); },
                end() {
                    lastBody = this._writtenChunks.join('');
                    // Synthesise a 200 OK with a Genie start-conversation response.
                    const fakeRes = {
                        statusCode: 200,
                        on: (event, handler) => {
                            if (event === 'data') {
                                handler(Buffer.from(JSON.stringify({
                                    conversation_id: 'conv-fake-001',
                                    conversation: { id: 'conv-fake-001' },
                                })));
                            }
                            if (event === 'end') {
                                handler();
                            }
                        },
                    };
                    callback(fakeRes);
                },
                destroy: jest.fn(),
            };
            return fakeReq;
        });
    });
    afterEach(() => {
        httpsSpy?.mockRestore();
    });

    test('prepends pack-context as user-message header when pack + subVertical resolve', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/assistant/conversations/start')
            .send({
                assistantProfile: 'default',
                content: 'What is fill rate trending this quarter?',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
        }));
        expect(res.status).toBe(200);
        expect(res.body.conversation_id).toBe('conv-fake-001');
        expect(res.body.governance).toMatchObject({
            enforced: true,
            authority: 'unity-catalog',
            subjectRef: 'local-dev',
            sourceRef: {
                kind: 'genie-space',
                spaceId: 'space-default-123',
                governance: { requiresAttestation: true },
            },
        });

        // Inspect the JSON the proxy forwarded to Databricks.
        expect(lastBody).toBeTruthy();
        const parsed = JSON.parse(lastBody);
        expect(parsed.content).toMatch(/^\[Pack Context: cpg-fmcg\/supply-chain\]/);
        expect(parsed.content).toMatch(/Supply Chain/);
        expect(parsed.content).toMatch(/\[User Question\]/);
        expect(parsed.content).toMatch(/What is fill rate trending this quarter\?/);
        expect(lastUrlPath).toMatch(/start-conversation/);

        // Audit log records the injection.
        const injectionAudits = audit.filter(a => a.action === 'pack-context-inject');
        expect(injectionAudits.length).toBe(1);
        expect(injectionAudits[0].status).toBe('OK');
        expect(injectionAudits[0].profile).toBe('default');
        const detail = JSON.parse(injectionAudits[0].detail);
        expect(detail.pack).toBe('cpg-fmcg');
        expect(detail.subVertical).toBe('supply-chain');
        expect(detail.contextLength).toBeGreaterThan(50);
        expect(detail.backend).toBe('genie');
        expect(detail.fallback).toBe(false);
    });

    test('proceeds normally with no context when pack/subVertical are omitted', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/assistant/conversations/start')
            .send({
                assistantProfile: 'default',
                content: 'Plain question.',
            }));
        expect(res.status).toBe(200);
        const parsed = JSON.parse(lastBody);
        expect(parsed.content).toBe('Plain question.');
        // No injection audit at all (we only audit when caller asked for context).
        expect(audit.find(a => a.action === 'pack-context-inject')).toBeUndefined();
    });

    test('proceeds normally + WARN-audit when pack does not exist', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/assistant/conversations/start')
            .send({
                assistantProfile: 'default',
                content: 'Plain question.',
                pack: 'no-such-pack',
                subVertical: 'no-such-sv',
            }));
        expect(res.status).toBe(200);
        const parsed = JSON.parse(lastBody);
        // Pack lookup failed → request body MUST equal the original content
        // (no header, no pack reference at all).
        expect(parsed.content).toBe('Plain question.');
        expect(parsed.content).not.toMatch(/Pack Context/);

        const injectionAudits = audit.filter(a => a.action === 'pack-context-inject');
        expect(injectionAudits.length).toBe(1);
        expect(injectionAudits[0].status).toBe('WARN');
        const detail = JSON.parse(injectionAudits[0].detail);
        expect(detail.resolved).toBe(false);
        expect(detail.contextLength).toBe(0);
    });

    test('does not inject when only subVertical (no pack) is provided', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/assistant/conversations/start')
            .send({
                assistantProfile: 'default',
                content: 'Plain question.',
                subVertical: 'supply-chain',
            }));
        expect(res.status).toBe(200);
        const parsed = JSON.parse(lastBody);
        expect(parsed.content).toBe('Plain question.');
        // The injector reports `requested:true` when EITHER field is set so
        // that misuse leaves an audit trail.
        const injectionAudits = audit.filter(a => a.action === 'pack-context-inject');
        expect(injectionAudits.length).toBe(1);
        expect(injectionAudits[0].status).toBe('WARN');
    });

    test('contextText (pre-existing prefix) is preserved INSIDE the user-question slot', async () => {
        await request(app)
            .post('/assistant/conversations/start')
            .send({
                assistantProfile: 'default',
                content: 'Question?',
                contextText: 'Prior chat history',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
            });
        const parsed = JSON.parse(lastBody);
        // Pack header dominates; contextText + content are joined as the body.
        expect(parsed.content).toMatch(/^\[Pack Context: cpg-fmcg\/supply-chain\]/);
        expect(parsed.content).toMatch(/\[User Question\]\s+Prior chat history\s+Question\?/);
    });
});

// ── OpenAI route (chat-only path) ─────────────────────────────────────────
describe('POST /openai/conversations/start — pack-context injection (chat-only)', () => {
    let originalFetch;
    let lastFetchBody;

    beforeEach(() => {
        originalFetch = global.fetch;
        lastFetchBody = null;
        global.fetch = jest.fn().mockImplementation(async (_url, init) => {
            lastFetchBody = init?.body || null;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ message: { content: 'OpenAI answer.' } }],
                }),
                text: async () => '',
            };
        });
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('prepends pack-context as a system message when pack + subVertical resolve', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/openai/conversations/start')
            .send({
                assistantProfile: 'oai-chat',
                content: 'Why is OTIF dropping?',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
            }));
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('COMPLETED');
        expect(res.body.governance).toMatchObject({
            enforced: true,
            authority: 'warehouse',
            subjectRef: 'local-dev',
        });
        expect(global.fetch).toHaveBeenCalled();

        const fetchPayload = JSON.parse(lastFetchBody);
        expect(Array.isArray(fetchPayload.messages)).toBe(true);
        expect(fetchPayload.messages[0].role).toBe('system');
        expect(fetchPayload.messages[0].content).toMatch(/Supply Chain|OTIF|fill rate/i);
        expect(fetchPayload.messages[1].role).toBe('user');
        expect(fetchPayload.messages[1].content).toBe('Why is OTIF dropping?');

        const inj = audit.find(a => a.action === 'pack-context-inject');
        expect(inj).toBeTruthy();
        const detail = JSON.parse(inj.detail);
        expect(detail.backend).toBe('openai');
        expect(detail.pack).toBe('cpg-fmcg');
        expect(detail.subVertical).toBe('supply-chain');
        expect(detail.resolved).toBe(true);
    });

    test('omits the system message when no pack is supplied', async () => {
        const { res } = await captureAuditLines(() => request(app)
            .post('/openai/conversations/start')
            .send({
                assistantProfile: 'oai-chat',
                content: 'Plain question.',
            }));
        expect(res.status).toBe(200);
        expect(res.body.governance).toMatchObject({
            enforced: true,
            authority: 'warehouse',
            subjectRef: 'local-dev',
        });
        const fetchPayload = JSON.parse(lastFetchBody);
        expect(fetchPayload.messages.length).toBe(1);
        expect(fetchPayload.messages[0].role).toBe('user');
    });

    test('omits the system message + WARN-audits when pack lookup fails', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/openai/conversations/start')
            .send({
                assistantProfile: 'oai-chat',
                content: 'Plain question.',
                pack: 'ghost-pack',
                subVertical: 'ghost-sv',
            }));
        expect(res.status).toBe(200);
        const fetchPayload = JSON.parse(lastFetchBody);
        expect(fetchPayload.messages.length).toBe(1);
        expect(fetchPayload.messages[0].role).toBe('user');

        const inj = audit.find(a => a.action === 'pack-context-inject');
        expect(inj).toBeTruthy();
        expect(inj.status).toBe('WARN');
    });
});

// ── Bedrock route (direct chat-only path) ─────────────────────────────────
describe('POST /bedrock/conversations/start — pack-context injection (bedrock-direct)', () => {
    let originalFetch;
    let lastFetchBody;

    beforeEach(() => {
        originalFetch = global.fetch;
        lastFetchBody = null;
        global.fetch = jest.fn().mockImplementation(async (_url, init) => {
            lastFetchBody = init?.body || null;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    content: [{ type: 'text', text: 'Bedrock answer.' }],
                }),
                text: async () => '',
            };
        });
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('prepends pack-context as a system message in the InvokeModel payload', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/bedrock/conversations/start')
            .send({
                assistantProfile: 'bedrock-direct',
                content: 'Why is OTIF dropping?',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
            }));
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('COMPLETED');
        expect(res.body.governance).toMatchObject({
            enforced: true,
            authority: 'warehouse',
            subjectRef: 'local-dev',
        });
        expect(global.fetch).toHaveBeenCalled();

        const fetchPayload = JSON.parse(lastFetchBody);
        // Anthropic-on-Bedrock takes top-level `system` for system text and
        // `messages` for the user/assistant turns. lib/bedrock collapses
        // role:system messages into the top-level field.
        expect(typeof fetchPayload.system).toBe('string');
        expect(fetchPayload.system).toMatch(/Supply Chain|OTIF|fill rate/i);
        expect(fetchPayload.messages[0].role).toBe('user');
        expect(fetchPayload.messages[0].content).toBe('Why is OTIF dropping?');

        const inj = audit.find(a => a.action === 'pack-context-inject');
        expect(inj).toBeTruthy();
        const detail = JSON.parse(inj.detail);
        expect(detail.backend).toBe('bedrock');
        expect(detail.engine).toBe('bedrock-direct');
        expect(detail.resolved).toBe(true);
    });

    test('proceeds normally when no pack supplied', async () => {
        const { res } = await captureAuditLines(() => request(app)
            .post('/bedrock/conversations/start')
            .send({
                assistantProfile: 'bedrock-direct',
                content: 'Plain question.',
            }));
        expect(res.status).toBe(200);
        const fetchPayload = JSON.parse(lastFetchBody);
        // No system text + only the user message.
        expect(fetchPayload.system).toBeUndefined();
        expect(fetchPayload.messages.length).toBe(1);
        expect(fetchPayload.messages[0].role).toBe('user');
    });
});

// ── Bedrock RAG path (KB-coupled) ─────────────────────────────────────────
describe('POST /bedrock/conversations/start — pack-context injection (bedrock-rag)', () => {
    let originalFetch;
    let lastFetchBody;

    beforeEach(() => {
        originalFetch = global.fetch;
        lastFetchBody = null;
        global.fetch = jest.fn().mockImplementation(async (_url, init) => {
            lastFetchBody = init?.body || null;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    output: { text: 'RAG answer.' },
                    sessionId: 'sess-001',
                    citations: [],
                }),
                text: async () => '',
            };
        });
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('prepends pack-context as a header inside the input.text for RAG', async () => {
        const { res, audit } = await captureAuditLines(() => request(app)
            .post('/bedrock/conversations/start')
            .send({
                assistantProfile: 'bedrock-rag',
                content: 'Tell me about fill rate.',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
            }));
        expect(res.status).toBe(200);
        const fetchPayload = JSON.parse(lastFetchBody);
        // RetrieveAndGenerate takes `input.text`; the proxy prepends the pack
        // header inline (no system slot in the v1 KB-coupled API).
        expect(typeof fetchPayload.input?.text).toBe('string');
        expect(fetchPayload.input.text).toMatch(/^\[Pack Context: cpg-fmcg\/supply-chain\]/);
        expect(fetchPayload.input.text).toMatch(/\[User Question\]/);
        expect(fetchPayload.input.text).toMatch(/Tell me about fill rate\./);

        const inj = audit.find(a => a.action === 'pack-context-inject');
        expect(inj).toBeTruthy();
        const detail = JSON.parse(inj.detail);
        expect(detail.backend).toBe('bedrock');
        expect(detail.engine).toBe('bedrock-rag');
    });
});

// ── Orchestrator system-prompt augmentation ───────────────────────────────
describe('llmOrchestrator.orchestrateGroundedAnswer — packContext parameter', () => {
    const { orchestrateGroundedAnswer } = require('../lib/llmOrchestrator');
    const profile = { host: 'https://x', token: 't', warehouseId: 'w1' };
    const schema = 'TABLE shipments (lane STRING, otif_pct FLOAT)';

    test('appends packContext to the SQL system prompt', async () => {
        const callLlm = jest.fn()
            .mockResolvedValueOnce('```sql\nSELECT lane FROM shipments\n```')
            .mockResolvedValueOnce('Lane analysis result.');
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 'stmt-1',
            status: { state: 'SUCCEEDED' },
            manifest: { schema: { columns: [{ name: 'lane' }] }, total_row_count: 1 },
            result: { data_array: [['LANE-1']] },
        });
        await orchestrateGroundedAnswer({
            profile, question: 'Top lane?', schemaContext: schema,
            callLlm, databricksRequest, convId: 'c', msgId: 'm',
            packContext: 'CONTEXT-MARKER: assist a CPG supply-chain team.',
        });

        // First LLM call is SQL — its system message must include the pack context.
        const sqlSystemMsg = callLlm.mock.calls[0][0][0];
        expect(sqlSystemMsg.role).toBe('system');
        expect(sqlSystemMsg.content).toMatch(/SQL writer/);
        expect(sqlSystemMsg.content).toMatch(/CONTEXT-MARKER/);

        // Second LLM call is narrative — same.
        const narSystemMsg = callLlm.mock.calls[1][0][0];
        expect(narSystemMsg.role).toBe('system');
        expect(narSystemMsg.content).toMatch(/analytics assistant/);
        expect(narSystemMsg.content).toMatch(/CONTEXT-MARKER/);
    });

    test('omits packContext cleanly when not supplied (back-compat)', async () => {
        const callLlm = jest.fn()
            .mockResolvedValueOnce('```sql\nSELECT 1\n```')
            .mockResolvedValueOnce('Answer.');
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 's',
            status: { state: 'SUCCEEDED' },
            manifest: { schema: { columns: [{ name: 'one' }] }, total_row_count: 1 },
            result: { data_array: [[1]] },
        });
        await orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: schema,
            callLlm, databricksRequest, convId: 'c', msgId: 'm',
            // packContext intentionally omitted
        });
        const sqlSystemMsg = callLlm.mock.calls[0][0][0];
        // System prompt is verbatim — no extra newlines or appended text.
        expect(sqlSystemMsg.content).toMatch(/^You are a SQL writer/);
        expect(sqlSystemMsg.content).not.toMatch(/\n\n[A-Z]/); // no appended block
    });

    test('treats empty / whitespace-only packContext as absent', async () => {
        const callLlm = jest.fn()
            .mockResolvedValueOnce('```sql\nSELECT 1\n```')
            .mockResolvedValueOnce('Answer.');
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 's',
            status: { state: 'SUCCEEDED' },
            manifest: { schema: { columns: [{ name: 'one' }] }, total_row_count: 1 },
            result: { data_array: [[1]] },
        });
        await orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: schema,
            callLlm, databricksRequest, convId: 'c', msgId: 'm',
            packContext: '   \n\t  ',
        });
        const sqlSystemMsg = callLlm.mock.calls[0][0][0];
        expect(sqlSystemMsg.content).toMatch(/^You are a SQL writer/);
        expect(sqlSystemMsg.content).not.toMatch(/\n\n /);
    });
});
