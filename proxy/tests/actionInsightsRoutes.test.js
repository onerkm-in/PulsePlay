/**
 * Route-level security tests for the Action Insights / Decision Assist action
 * endpoint. These reproduce the two P0 findings from the master execution prompt
 * (ACT-02 HITL approval bypass, SEC-01 client-selected persona authority) and
 * prove the server-owned authority holds against forged client input.
 *
 * The Databricks SQL layer is mocked so the full route logic runs deterministically
 * and we can assert exactly which statements executed (e.g. that a denied action
 * runs NO UPDATE before returning 403).
 */
'use strict';

// Capture every SQL statement the module executes, and script the responses.
// jest hoists jest.mock() above imports, so shared state referenced inside the
// factory must use the `mock` name prefix to be allowed out of scope.
const mockSqlCalls = [];
let mockPromptFixture = {};

jest.mock('../lib/sqlExecutor', () => ({
    executeSqlStatement: jest.fn(async ({ sql }) => {
        mockSqlCalls.push(sql);
        const s = sql.trim();
        if (/^SELECT rule_id, status, evidence_signature/.test(s)) {
            // the server-side "load current prompt" read
            return {
                columns: ['rule_id', 'status', 'evidence_signature', 'approval_required', 'action_code'],
                rows: [[
                    mockPromptFixture.rule_id, mockPromptFixture.status,
                    mockPromptFixture.evidence_signature, mockPromptFixture.approval_required,
                    mockPromptFixture.action_code,
                ]],
            };
        }
        if (/^SELECT COUNT/.test(s)) return { columns: ['c'], rows: [[1]] };
        if (/^UPDATE/.test(s) || /^INSERT/.test(s)) return { columns: [], rows: [] };
        // list query
        return { columns: ['prompt_id'], rows: [] };
    }),
}));

function makeApp() {
    const routes = { get: {}, post: {} };
    return {
        _routes: routes,
        get(path, handler) { routes.get[path] = handler; },
        post(path, handler) { routes.post[path] = handler; },
    };
}

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}

function makeReq({ params = {}, body = {}, query = {}, headers = {}, user = {} } = {}) {
    return {
        params, body, query, headers, user,
        get: (h) => headers[h.toLowerCase()] || null,
    };
}

const deps = {
    resolveProfile: () => ({ profile: { name: 'stand-in' } }),
    databricksRequest: async () => ({}),
    auditLog: () => {},
    sendNoMatchingProfile: (req, res) => res.status(503).json({ error: 'no profile' }),
};

function loadModuleFresh() {
    jest.resetModules();
    return require('../lib/actionInsights');
}

function mountAndGetActionHandler() {
    const mod = loadModuleFresh();
    const app = makeApp();
    mod.register(app, deps);
    return app._routes.post['/insights/action-insights/:id/action'];
}

function mountAndGetListHandler(profile) {
    const mod = loadModuleFresh();
    const app = makeApp();
    mod.register(app, { ...deps, resolveProfile: () => ({ name: profile.name, profile }) });
    return app._routes.get['/insights/action-insights'];
}

const VALID_ID = '0123456789abcdef';

beforeEach(() => {
    mockSqlCalls.length = 0;
    mockPromptFixture = {
        rule_id: 'SCM-OTIF-001',
        status: 'new',
        evidence_signature: 'sig1',
        approval_required: 'true',
        action_code: 'trigger_supplier_review',
    };
    delete process.env.AI_ALLOW_DEMO_PERSONA;
});

describe('ACT-02 — HITL approval bypass is not possible', () => {
    test('an L3 trigger with forged approvalRequired:false still lands on pending-approval, never actioned', async () => {
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({
            params: { id: VALID_ID },
            // forged client authority — must be ignored
            body: { action: 'trigger_supplier_review', approvalRequired: false, approval_required: false, action_level: 1 },
        }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('pending-approval');
        expect(res.body.status).not.toBe('actioned');
        // the UPDATE must set pending-approval, proving server-derived status won
        const update = mockSqlCalls.find((s) => /^UPDATE/.test(s.trim()));
        expect(update).toMatch(/pending-approval/);
        expect(update).not.toMatch(/actioned/);
    });

    test('approve on a NEW prompt is rejected (cannot skip the pending-approval gate)', async () => {
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({
            params: { id: VALID_ID },
            body: { action: 'approve' },
        }), res);

        expect(res.statusCode).toBe(403);
        // 403 BEFORE any state mutation
        expect(mockSqlCalls.some((s) => /^UPDATE/.test(s.trim()))).toBe(false);
    });
});

describe('SEC-01 — client-selected persona cannot grant authority', () => {
    test('forged x-pp-persona=Manager cannot approve when demo mode is off', async () => {
        mockPromptFixture.status = 'pending-approval';
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({
            params: { id: VALID_ID },
            body: { action: 'approve' },
            headers: { 'x-pp-persona': 'Supply Chain Manager' },
            query: { persona: 'Supply Chain Manager' },
        }), res);

        expect(res.statusCode).toBe(403);
        expect(mockSqlCalls.some((s) => /^UPDATE/.test(s.trim()))).toBe(false);
        // a denied attempt is still audited
        expect(mockSqlCalls.some((s) => /^INSERT INTO/.test(s.trim()))).toBe(true);
    });

    test('a verified Manager IdP role CAN approve a pending-approval prompt', async () => {
        mockPromptFixture.status = 'pending-approval';
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({
            params: { id: VALID_ID },
            body: { action: 'approve' },
            user: { roles: ['S&OP Approver'], email: 'mgr@x.com' },
        }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('actioned');
        expect(mockSqlCalls.some((s) => /^UPDATE.*actioned/.test(s.trim()))).toBe(true);
    });
});

describe('graceful degradation — Decisions require a Databricks warehouse', () => {
    test('a Power BI profile (no warehouse) → 200 unavailable + notice, no SQL', async () => {
        const handler = mountAndGetListHandler({ name: 'powerbi-dwd', type: 'powerbi-semantic-model' });
        const res = makeRes();
        await handler(makeReq({ query: {} }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.unavailable).toBe(true);
        expect(res.body.notice).toMatch(/Databricks/i);
        expect(res.body.prompts).toEqual([]);
        expect(mockSqlCalls.length).toBe(0); // never touched the store
    });

    test('a Databricks/Genie profile (host + warehouseId) → proceeds to the store', async () => {
        const handler = mountAndGetListHandler({
            name: 'genie-scm-poc',
            host: 'https://dbc-x.cloud.databricks.com',
            warehouseId: 'wh1',
        });
        const res = makeRes();
        await handler(makeReq({ query: {} }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.unavailable).toBeUndefined();
        expect(mockSqlCalls.length).toBeGreaterThan(0); // list query ran
    });
});

describe('input validation + governance ceiling', () => {
    test('invalid prompt id → 400, no SQL', async () => {
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({ params: { id: "abc'; DROP TABLE x" }, body: { action: 'approve' } }), res);
        expect(res.statusCode).toBe(400);
        expect(mockSqlCalls.length).toBe(0);
    });

    test('unknown action → 400', async () => {
        const handler = mountAndGetActionHandler();
        const res = makeRes();
        await handler(makeReq({ params: { id: VALID_ID }, body: { action: 'delete_everything' } }), res);
        expect(res.statusCode).toBe(400);
    });
});
