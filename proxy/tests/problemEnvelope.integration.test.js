'use strict';

// End-to-end coverage for Slice 1b global error middleware. The unit
// tests in problemDetails.test.js exercise the helper module directly;
// these tests stand the full Express app up and verify the JSON-parse
// 400 handler and the 500 fallback handler write `application/problem+json`
// with the locked Error Intelligence Layer contract.
//
// Scope (locked Error Strategy doc §"Implementation Roadmap" Slice 1b):
//   - Malformed JSON body → 400 problem+json with `INVALID_JSON`
//   - Uncaught throw in a route → 500 problem+json with `UNEXPECTED_PROXY_ERROR`
//     and the verbatim safe sentinel for `detail`
//   - Legacy `error` field is preserved alongside the structured envelope
//   - Streaming carve-out: `sendProblem()` returns false when headers
//     are already sent (the helper's contract — the route's own catch
//     block must emit an in-band event instead).

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';

const request = require('supertest');
const { app, handleUnexpectedProxyError } = require('../server');
const { sendProblem, createProblem, UNEXPECTED_INTERNAL_SENTINEL } = require('../lib/problemDetails');

describe('Slice 1b — global Problem Details envelopes', () => {
    let consoleErrorSpy;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
        consoleErrorSpy?.mockRestore();
    });

    describe('Malformed JSON → INVALID_JSON problem', () => {
        it('returns 400 application/problem+json for an unparseable body', async () => {
            // /assistant routes are gated by auth, but the JSON parse error
            // fires BEFORE auth middleware so the malformed body never gets
            // there. Any POST path will do.
            const res = await request(app)
                .post('/assistant/conversations/start')
                .set('Content-Type', 'application/json')
                .send('{ this is not json'); // intentionally malformed

            expect(res.status).toBe(400);
            expect(res.type).toBe('application/problem+json');
            expect(res.headers['access-control-allow-origin']).toBe('*');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.body.code).toBe('INVALID_JSON');
            expect(res.body.category).toBe('validation');
            expect(res.body.title).toMatch(/Invalid JSON/i);
            // Locked contract: requestId must be set (echoed or minted).
            expect(typeof res.body.requestId).toBe('string');
            expect(res.body.requestId.length).toBeGreaterThan(0);
            // Pulse sibling compatibility — strategy doc "Migration note".
            expect(typeof res.body.error).toBe('string');
            expect(res.body.error.length).toBeGreaterThan(0);
        });

        it('echoes a sanitized incoming X-Request-Id back to the client', async () => {
            const res = await request(app)
                .post('/assistant/conversations/start')
                .set('Content-Type', 'application/json')
                .set('X-Request-Id', 'caller-supplied-id-abc')
                .send('not json');

            expect(res.headers['x-request-id']).toBe('caller-supplied-id-abc');
            expect(res.body.requestId).toBe('caller-supplied-id-abc');
        });

        it('does NOT leak the malformed body content into the response', async () => {
            const secretLike = '{ "token": "dapi-leaked-secret-do-not-show" } trailing junk';
            const res = await request(app)
                .post('/assistant/conversations/start')
                .set('Content-Type', 'application/json')
                .send(secretLike);

            expect(res.status).toBe(400);
            // The response must never echo back the raw payload, even when
            // it looks token-like. Same defence as redactProblemCause.
            const body = JSON.stringify(res.body);
            expect(body).not.toContain('dapi-leaked-secret-do-not-show');
        });
    });

    describe('Uncaught route throw → UNEXPECTED_PROXY_ERROR problem', () => {
        // We can't easily trigger this against an existing production route
        // without breaking it; instead we mount a single test-only route
        // that throws synchronously and verify the global handler catches
        // it. The handler is the same one that protects every production
        // route — wiring is identical.
        beforeAll(() => {
            app.post('/__test__/problem-envelope/throw-sync', () => {
                throw new Error('synchronous boom — should never reach client');
            });
            // Express dispatches error middleware in REGISTRATION order. The
            // production `app.use(handleUnexpectedProxyError)` mount happens
            // when server.js is first required — at that point the test route
            // above does not exist yet. We re-mount the handler AFTER the test
            // route so Express can find it when walking forward from the
            // thrown error. The original mount stays in place for production
            // routes; this just extends coverage to dynamically-registered
            // test routes.
            app.use(handleUnexpectedProxyError);
        });

        // Note on async throws: Express 4 does NOT auto-forward unhandled
        // rejections from async route handlers to the global error middleware
        // — handlers must catch + next(err) themselves, or be wrapped in an
        // express-async-handler-style decorator. Slice 1b does NOT change that;
        // fixing the codebase's existing async-throw exposure is a separate
        // hardening lane (sequenced after Slice 1d converts raw err.message
        // routes). Adding a test here would surface as an unhandled rejection
        // that crashes the worker — covered by issue tracker, not by test.

        it('returns 500 application/problem+json with the locked safe sentinel for a sync throw', async () => {
            const res = await request(app)
                .post('/__test__/problem-envelope/throw-sync')
                .set('Content-Type', 'application/json')
                .send({});

            expect(res.status).toBe(500);
            expect(res.type).toBe('application/problem+json');
            expect(res.body.code).toBe('UNEXPECTED_PROXY_ERROR');
            expect(res.body.category).toBe('unexpected_internal');
            // Locked: the *verbatim* safe sentinel — never the raw err.message.
            expect(res.body.detail).toBe(UNEXPECTED_INTERNAL_SENTINEL);
            expect(res.body.detail).not.toMatch(/boom/i);
            expect(res.body.error).toBe(UNEXPECTED_INTERNAL_SENTINEL);
        });

        it('echoes requestId for log correlation', async () => {
            const res = await request(app)
                .post('/__test__/problem-envelope/throw-sync')
                .set('Content-Type', 'application/json')
                .set('X-Request-Id', 'rid-trace-me-xyz')
                .send({});

            expect(res.headers['x-request-id']).toBe('rid-trace-me-xyz');
            expect(res.body.requestId).toBe('rid-trace-me-xyz');
        });

        it('exposes the handler as a 4-arg express error middleware', () => {
            // Express dispatches an error handler ONLY if it's defined with
            // exactly four parameters. This is the easiest invariant to
            // accidentally break (e.g. autoformat strips the `_next`).
            expect(typeof handleUnexpectedProxyError).toBe('function');
            expect(handleUnexpectedProxyError.length).toBe(4);
        });
    });

    describe('Streaming carve-out — sendProblem() returns false after headers sent', () => {
        // Strategy doc §"Streaming responses" requires that mid-flight stream
        // failures use in-band error events instead of attempting to write
        // Problem Details over a response that has already committed to 200.
        // sendProblem() enforces this by returning false; the 500 fallback
        // handler short-circuits to next(err) which lets Express's default
        // close the connection.

        it('returns false when res.headersSent is true', () => {
            const mockRes = {
                headersSent: true,
                status: jest.fn(),
                type: jest.fn(),
                json: jest.fn(),
            };
            const problem = createProblem({
                status: 500,
                code: 'STREAMING_TEST',
                title: 'test',
                detail: 'test',
                category: 'unexpected_internal',
            });
            const result = sendProblem(mockRes, problem);
            expect(result).toBe(false);
            // Critically — none of the write methods were called.
            expect(mockRes.status).not.toHaveBeenCalled();
            expect(mockRes.type).not.toHaveBeenCalled();
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('writes normally when res.headersSent is false', () => {
            const mockRes = {
                headersSent: false,
                status: jest.fn().mockReturnThis(),
                type: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnValue('written'),
            };
            const problem = createProblem({
                status: 500,
                code: 'STREAMING_TEST',
                title: 'test',
                detail: 'test',
                category: 'unexpected_internal',
            });
            const result = sendProblem(mockRes, problem);
            expect(result).toBe('written');
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.type).toHaveBeenCalledWith('application/problem+json');
            expect(mockRes.json).toHaveBeenCalledTimes(1);
        });
    });
});
