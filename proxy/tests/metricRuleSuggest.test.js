'use strict';

/**
 * metricRuleSuggest.test.js — Wave 41 PREP, IDEA-037 phase 4 extension.
 *
 * Coverage matrix:
 *   1. Happy-path LLM success     — orchestrator returns LLM rules unchanged.
 *   2. Malformed LLM falls back   — invalid JSON output from the LLM falls
 *                                    through to the heuristic engine.
 *   3. Sanitization               — DML keywords in measure names are stripped
 *                                    before reaching the prompt builder.
 *   4. Redaction                  — raw upstream errors NEVER reach the response
 *                                    body.
 *   5. Missing-space-id error     — caller can omit spaceId; route still works
 *                                    when measureNames is non-empty (no error).
 *                                    A truly empty body (no measures, no CTE)
 *                                    is rejected with 400.
 *   6. Heuristic alone covers known measure names — when no callLlm is supplied
 *                                    the engine still produces useful rules.
 *   7. Percent-format detection   — measures with `%` / `rate` get a percent
 *                                    classification + optional thresholds when
 *                                    a range is supplied.
 *   8. Source-attribution         — every emitted rule has a recognised `source`
 *                                    label and the route forwards it intact.
 */

// ── Mock fs the same way server.test.js does so the proxy boots cleanly. ──
const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abc',
            spaceId: 'space-default-123',
        },
        // analytics profile has openai creds so the route can wire a callLlm.
        analytics: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abc',
            spaceId: 'space-analytics-456',
            azureOpenAiEndpoint: 'https://test.openai.azure.com',
            azureOpenAiKey: 'fake-key',
            azureOpenAiDeployment: 'gpt-4o',
        },
    },
};

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn((p) => String(p).endsWith('config.json') ? true : actual.existsSync(p)),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)),
        appendFileSync: jest.fn(),
    };
});

jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

const request = require('supertest');
const heuristics = require('../lib/metricRuleHeuristics');
const orchestrator = require('../lib/llmOrchestrator');

// Silence noisy console output from negative-path tests.
let logSpy, errSpy, warnSpy;
beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
});

// ── 1. Happy-path LLM success ─────────────────────────────────────────────────
describe('suggestMetricRules — happy-path LLM success', () => {
    it('returns parsed rules from the LLM unchanged', async () => {
        const llmJson = {
            suggestedMetricRules: [
                { name: 'Revenue', higherIsBetter: true, aliases: ['sales'], confidence: 0.9, rationale: 'r1', source: 'measure-name' },
                { name: 'Cost',    higherIsBetter: false, aliases: [],       confidence: 0.85, rationale: 'r2', source: 'measure-name' },
                { name: 'Defect Rate', higherIsBetter: false, aliases: [], confidence: 0.8, rationale: 'r3', source: 'measure-name', amberPct: 0.05, redPct: 0.1 },
            ],
        };
        const callLlm = jest.fn().mockResolvedValue(JSON.stringify(llmJson));
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['Revenue', 'Cost', 'Defect Rate'],
            callLlm,
        });
        expect(callLlm).toHaveBeenCalledTimes(1);
        expect(out.source).toBe('llm');
        expect(out.llmOk).toBe(true);
        expect(out.rules).toHaveLength(3);
        expect(out.rules[0].name).toBe('Revenue');
        expect(out.rules[2].amberPct).toBeCloseTo(0.05);
        expect(out.rules[2].redPct).toBeCloseTo(0.1);
    });
});

// ── 2. Malformed LLM falls back to heuristics ─────────────────────────────────
describe('suggestMetricRules — malformed LLM output falls back', () => {
    it('falls back to the heuristic engine when the LLM emits unparseable text', async () => {
        const callLlm = jest.fn().mockResolvedValue('lol this is not JSON at all');
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['revenue', 'returns', 'churn'],
            callLlm,
        });
        expect(out.source).toBe('heuristic');
        expect(out.llmOk).toBe(true); // call succeeded; just produced garbage
        expect(out.rules.length).toBeGreaterThanOrEqual(1);
        // Heuristics will have classified at least the obvious ones.
        const names = out.rules.map(r => r.name.toLowerCase());
        expect(names).toEqual(expect.arrayContaining(['revenue', 'returns', 'churn']));
        const churn = out.rules.find(r => r.name.toLowerCase() === 'churn');
        expect(churn.higherIsBetter).toBe(false);
    });

    it('falls back to industry-pattern when LLM throws AND heuristics produce nothing', async () => {
        const callLlm = jest.fn().mockRejectedValue(new Error('upstream-down'));
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['xyz_zzz', 'opaque_123'], // no naming-convention match
            callLlm,
        });
        expect(out.source).toBe('heuristic');
        expect(out.llmOk).toBe(false);
        expect(out.rules.length).toBeGreaterThanOrEqual(2);
        expect(out.rules.every(r => r.source === 'industry-pattern')).toBe(true);
    });
});

// ── 3. Sanitization (Wave 22) ─────────────────────────────────────────────────
describe('POST /insights/suggest-metric-rules — sanitization', () => {
    let appRef;
    beforeAll(() => { appRef = require('../server').app; });

    it('strips DML keywords + control chars before they reach heuristics / prompt', async () => {
        // Send measure names laced with DML keywords + backticks + control chars.
        // The route's _sanitizeNameList strips them all before buildMetricRulePrompt
        // sees the strings. We assert the route still returns 200 and the rules
        // it produced did NOT contain the DML payload anywhere.
        const res = await request(appRef)
            .post('/insights/suggest-metric-rules')
            .send({
                measureNames: ['Revenue DROP TABLE x', 'Profit; DELETE * FROM y', '`Cost`'],
                dimensionNames: ['Region'],
            });
        expect(res.status).toBe(200);
        const blob = JSON.stringify(res.body);
        // No DML keyword should appear anywhere in the response body —
        // would only land there if the sanitizer let it through into the
        // suggested rule's `name` field.
        expect(blob).not.toMatch(/\bDROP\b/i);
        expect(blob).not.toMatch(/\bDELETE\b/i);
        // Backticks must not appear in any rule name either.
        for (const r of res.body.suggestedMetricRules || []) {
            expect(r.name).not.toMatch(/`/);
        }
    });

    it('caps oversize measure-name arrays', async () => {
        const giant = Array.from({ length: 200 }, (_, i) => `m${i}`);
        const res = await request(appRef)
            .post('/insights/suggest-metric-rules')
            .send({ measureNames: giant });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.suggestedMetricRules)).toBe(true);
    });
});

// ── 4. Redaction (Wave 30 cycle 4) ────────────────────────────────────────────
describe('suggestMetricRules — error redaction', () => {
    it('never propagates raw upstream LLM errors when callLlm rejects', async () => {
        // The orchestrator MUST NOT propagate the rejection. It catches it,
        // sets llmOk=false, and falls through to heuristics. The PII-ish
        // string in the original error must not leak via any path.
        const callLlm = jest.fn().mockRejectedValue(
            new Error('Authorization: Bearer dapi-secret-12345 — full request payload visible')
        );
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['Revenue', 'Cost'],
            callLlm,
        });
        // No throw; result is a plain object whose JSON form must not
        // contain the secret anywhere.
        const blob = JSON.stringify(out);
        expect(blob).not.toMatch(/dapi-secret-12345/);
        expect(blob).not.toMatch(/Authorization/);
        expect(out.llmOk).toBe(false);
        expect(out.source).toBe('heuristic');
    });

    it('never propagates upstream LLM errors that look like raw HTML / stack traces', async () => {
        const callLlm = jest.fn().mockRejectedValue(
            new Error('<html><body><h1>500 Internal Server Error</h1>Stacktrace: at /etc/passwd</body></html>')
        );
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['Returns', 'Defects'],
            callLlm,
        });
        const blob = JSON.stringify(out);
        expect(blob).not.toMatch(/<html>/);
        expect(blob).not.toMatch(/etc\/passwd/);
        expect(out.llmOk).toBe(false);
    });
});

// ── 5. Missing-input validation ───────────────────────────────────────────────
describe('POST /insights/suggest-metric-rules — input validation', () => {
    let appRef;
    beforeAll(() => { appRef = require('../server').app; });

    it('400s when measureNames is missing AND no sectionHCte is provided', async () => {
        const res = await request(appRef)
            .post('/insights/suggest-metric-rules')
            .send({ dimensionNames: ['Region'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/measureNames/);
    });

    it('200s when spaceId is omitted but measureNames is non-empty', async () => {
        const res = await request(appRef)
            .post('/insights/suggest-metric-rules')
            .send({ measureNames: ['Revenue', 'Cost'] }); // no spaceId — route uses profile.spaceId
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.suggestedMetricRules)).toBe(true);
        expect(res.body.suggestedMetricRules.length).toBeGreaterThan(0);
    });
});

// ── 6. Heuristic-alone (no LLM configured) covers known names ─────────────────
describe('metricRuleHeuristics — heuristic-only coverage', () => {
    it('classifies known measure names correctly without any LLM', () => {
        const rules = heuristics.suggestRules(['Revenue', 'Returns', 'Churn', 'Profit', 'Cost']);
        const byName = Object.fromEntries(rules.map(r => [r.name.toLowerCase(), r]));
        expect(byName.revenue.higherIsBetter).toBe(true);
        expect(byName.profit.higherIsBetter).toBe(true);
        expect(byName.returns.higherIsBetter).toBe(false);
        expect(byName.churn.higherIsBetter).toBe(false);
        expect(byName.cost.higherIsBetter).toBe(false);
        expect(rules.every(r => r.confidence === 0.7)).toBe(true);
        expect(rules.every(r => r.source === 'measure-name')).toBe(true);
    });

    it('returns empty when no input measure matches any pattern', () => {
        const rules = heuristics.suggestRules(['xxx', 'opaque_metric_42']);
        expect(rules).toEqual([]);
    });

    it('industryPatternFallback returns generic templates with low confidence', () => {
        const tmpl = heuristics.industryPatternFallback(3);
        expect(tmpl).toHaveLength(3);
        expect(tmpl.every(r => r.source === 'industry-pattern')).toBe(true);
        expect(tmpl.every(r => r.confidence < 0.5)).toBe(true);
    });
});

// ── 7. Percent-format detection + threshold derivation ────────────────────────
describe('metricRuleHeuristics — percent-format detection', () => {
    it('marks measures with `rate` / `%` and emits thresholds when a range is supplied', () => {
        const rules = heuristics.suggestRules(
            ['Conversion Rate', 'Return %'],
            { ranges: { 'Conversion Rate': { p25: 0.1, p75: 0.4 }, 'Return %': { p25: 0.02, p75: 0.08 } } },
        );
        const conv = rules.find(r => r.name === 'Conversion Rate');
        const ret = rules.find(r => r.name === 'Return %');
        expect(conv.source).toBe('data-distribution');
        expect(conv.higherIsBetter).toBe(true);
        // higher-is-better: amber = p75 (good), red = p25 (bad).
        expect(conv.amberPct).toBeCloseTo(0.4);
        expect(conv.redPct).toBeCloseTo(0.1);
        expect(ret.source).toBe('data-distribution');
        expect(ret.higherIsBetter).toBe(false);
        // lower-is-better flips: amber = p25 (good — low is fine), red = p75.
        expect(ret.amberPct).toBeCloseTo(0.02);
        expect(ret.redPct).toBeCloseTo(0.08);
    });

    it('omits thresholds when no range is supplied', () => {
        const rules = heuristics.suggestRules(['Conversion Rate']);
        expect(rules[0].source).toBe('measure-name'); // no data-distribution upgrade
        expect(rules[0].amberPct).toBeUndefined();
        expect(rules[0].redPct).toBeUndefined();
    });
});

// ── 8. Source-attribution preserved end-to-end ────────────────────────────────
describe('suggestMetricRules — source attribution preservation', () => {
    it('keeps the LLM-supplied source label as long as it is in the allowed set', async () => {
        const llmRules = [
            { name: 'Revenue',     higherIsBetter: true,  aliases: [], confidence: 0.9, rationale: 'space says so', source: 'space-instructions' },
            { name: 'Lead Time',   higherIsBetter: false, aliases: [], confidence: 0.8, rationale: 'cte filter',     source: 'section-h-cte', amberPct: 0.5, redPct: 0.2 },
            { name: 'Throughput',  higherIsBetter: true,  aliases: [], confidence: 0.7, rationale: 'industry',       source: 'industry-pattern' },
        ];
        const callLlm = jest.fn().mockResolvedValue(JSON.stringify({ suggestedMetricRules: llmRules }));
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['Revenue', 'Lead Time', 'Throughput'],
            callLlm,
        });
        expect(out.source).toBe('llm');
        const sources = out.rules.map(r => r.source);
        expect(sources).toEqual(['space-instructions', 'section-h-cte', 'industry-pattern']);
    });

    it('clamps unknown source labels to "measure-name"', async () => {
        const llmRules = [
            { name: 'Revenue', higherIsBetter: true, aliases: [], confidence: 0.9, rationale: 'r', source: 'made-up-source' },
            { name: 'Cost',    higherIsBetter: false, aliases: [], confidence: 0.9, rationale: 'r', source: 42 },
            { name: 'Returns', higherIsBetter: false, aliases: [], confidence: 0.9, rationale: 'r' /* no source */ },
        ];
        const callLlm = jest.fn().mockResolvedValue(JSON.stringify({ suggestedMetricRules: llmRules }));
        const out = await orchestrator.suggestMetricRules({
            measureNames: ['Revenue', 'Cost', 'Returns'],
            callLlm,
        });
        expect(out.rules.every(r => r.source === 'measure-name')).toBe(true);
    });
});

// ── Bonus: integration smoke through the proxy route ──────────────────────────
describe('POST /insights/suggest-metric-rules — end-to-end integration smoke', () => {
    let appRef;
    beforeAll(() => { appRef = require('../server').app; });

    it('returns suggestedMetricRules and a recognised source when only measure names are supplied', async () => {
        const res = await request(appRef)
            .post('/insights/suggest-metric-rules')
            .send({
                measureNames: ['Revenue', 'Returns', 'Churn'],
                dimensionNames: ['Region', 'Product'],
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(['llm', 'heuristic', 'mixed']).toContain(res.body.source);
        expect(Array.isArray(res.body.suggestedMetricRules)).toBe(true);
        expect(res.body.suggestedMetricRules.length).toBeGreaterThan(0);
        for (const r of res.body.suggestedMetricRules) {
            expect(typeof r.name).toBe('string');
            expect(typeof r.higherIsBetter).toBe('boolean');
            expect(Array.isArray(r.aliases)).toBe(true);
            expect(typeof r.confidence).toBe('number');
            expect(['space-instructions', 'measure-name', 'data-distribution', 'industry-pattern', 'section-h-cte'])
                .toContain(r.source);
        }
    });
});
