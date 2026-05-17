'use strict';

/**
 * foundationSqlSections.test.js — Phase 11b FM symmetry.
 *
 * Verifies the /foundation/section route surfaces parsed `sqlSections`
 * when the FM response markdown contains `/* Section: X *​/` markers
 * inside ```sql code fences. Mirrors the contract that
 * normalizeGenieResponse now upholds for Genie attachments[].query.query.
 *
 * Coverage:
 *   - Sectioned SQL fence in FM response → top-level sqlSections populated
 *   - Multi-section single-fence (single-call structured-output shape)
 *   - No markers → no sqlSections field (clean fallback)
 *   - Raw `content` and `rawContent` always preserved untouched as
 *     fallback for legacy clients
 *   - FM client wiring goes through the same callFoundationModel +
 *     databricksRequest path that production uses (mocked to deterministic
 *     output so we test the route's normalization layer, not the model)
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';
process.env.PROXY_PROFILE_FOUNDATION_TYPE = 'foundation-model';
process.env.PROXY_PROFILE_FOUNDATION_HOST = 'https://dbc-test.cloud.databricks.com';
process.env.PROXY_PROFILE_FOUNDATION_TOKEN = 'dapi_test';
process.env.PROXY_PROFILE_FOUNDATION_FOUNDATION_MODEL_ENDPOINT = 'databricks-meta-llama-3-1-405b-instruct';

const request = require('supertest');

// Stub callFoundationModel BEFORE the server is required so the require()
// of foundationModelClient inside server.js picks up the mock.
jest.mock('../lib/foundationModelClient', () => {
    const real = jest.requireActual('../lib/foundationModelClient');
    return {
        ...real,
        callFoundationModel: jest.fn(),
    };
});

const { callFoundationModel } = require('../lib/foundationModelClient');
const { app } = require('../server');

describe('POST /foundation/section — sqlSections surfacing (Phase 11b FM symmetry)', () => {
    beforeEach(() => {
        callFoundationModel.mockReset();
    });

    test('surfaces a HEADLINE section from a fenced SQL block in the FM response', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: [
                'Top-line: Sales of $2.30M are on-track.',
                '',
                'SQL backing this section:',
                '```sql',
                '/* Section: HEADLINE */',
                'WITH headline_data AS (SELECT SUM(amount) AS total FROM gold.sales)',
                'SELECT * FROM headline_data;',
                '```',
            ].join('\n'),
            parsedJson: null,
            usage: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({
                profile: 'foundation',
                userPrompt: 'Summarize the headline.',
                sectionTitle: 'HEADLINE',
            });

        expect(res.status).toBe(200);
        expect(res.body.profile).toBe('foundation');
        expect(res.body.endpoint).toBe('databricks-meta-llama-3-1-405b-instruct');
        // sqlSections lives at top level (FM has no attachments[]).
        expect(Array.isArray(res.body.sqlSections)).toBe(true);
        expect(res.body.sqlSections).toHaveLength(1);
        expect(res.body.sqlSections[0]).toMatchObject({
            sectionId: 'HEADLINE',
            cteName: 'headline_data',
        });
        expect(res.body.sqlSections[0].sqlFragment).toContain('SUM(amount)');
        // Raw markdown preserved untouched as fallback.
        expect(res.body.rawContent).toContain('/* Section: HEADLINE */');
        expect(res.body.content).toBeTruthy();
    });

    test('surfaces all four sections when the response carries a single-call structured SQL fence', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: [
                'Full briefing follows. Backing SQL:',
                '',
                '```sql',
                '/* Section: HEADLINE */',
                'WITH headline_data AS (SELECT SUM(amount) AS total FROM gold.sales),',
                '/* Section: TRENDS */',
                'trends_data AS (SELECT month, SUM(amount) FROM gold.sales GROUP BY month),',
                '/* Section: RISKS */',
                'risks_data AS (SELECT region, AVG(margin) FROM gold.sales GROUP BY region),',
                '/* Section: ACTIONS */',
                'actions_data AS (SELECT product, MIN(stock) FROM gold.inventory GROUP BY product)',
                'SELECT * FROM headline_data;',
                '```',
            ].join('\n'),
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Full briefing please.' });

        expect(res.status).toBe(200);
        expect(res.body.sqlSections.map(s => s.sectionId)).toEqual([
            'HEADLINE', 'TRENDS', 'RISKS', 'ACTIONS',
        ]);
        expect(res.body.sqlSections.map(s => s.cteName)).toEqual([
            'headline_data', 'trends_data', 'risks_data', 'actions_data',
        ]);
    });

    test('omits sqlSections entirely when no markers are present (clean fallback for legacy callers)', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: 'Just a narrative answer — no SQL backing required.',
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'narrative please' });

        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('sqlSections');
        expect(res.body.content).toBe('Just a narrative answer — no SQL backing required.');
    });

    test('omits sqlSections when an SQL fence is present but contains no section markers', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: [
                'Result:',
                '```sql',
                'SELECT SUM(amount) FROM gold.sales;', // unlabelled SQL
                '```',
            ].join('\n'),
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Just SQL no labels.' });

        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('sqlSections');
        // Raw blob still in rawContent for diagnostic UIs.
        expect(res.body.rawContent).toContain('SELECT SUM(amount)');
    });

    test('does not scan inside non-sql code fences (defends against JS string markers being parsed as SQL sections)', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: [
                'Example of how we label sections in the codebase:',
                '```javascript',
                'const marker = "/* Section: TRENDS */"; // string literal, NOT SQL',
                '```',
            ].join('\n'),
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'show me the convention' });

        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('sqlSections');
    });
});
