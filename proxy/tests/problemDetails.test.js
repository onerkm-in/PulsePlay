'use strict';

const {
    UNEXPECTED_INTERNAL_SENTINEL,
    createProblem,
    ensureRequestId,
    mapUpstreamError,
    redactProblemCause,
    sendProblem,
} = require('../lib/problemDetails');

describe('problemDetails helper', () => {
    it('creates an RFC-style problem envelope while preserving the legacy error field', () => {
        const problem = createProblem({
            status: 400,
            code: 'INVALID_JSON',
            title: 'Invalid JSON body',
            detail: 'The request body is not valid JSON.',
            category: 'validation',
            requestId: 'req-123',
        });

        expect(problem).toMatchObject({
            type: 'https://pulseplay.local/problems/invalid-json',
            title: 'Invalid JSON body',
            status: 400,
            detail: 'The request body is not valid JSON.',
            code: 'INVALID_JSON',
            category: 'validation',
            requestId: 'req-123',
            error: 'The request body is not valid JSON.',
        });
        expect(problem.supportCode).toMatch(/^INVALID_JSON-/);
    });

    it('redacts tokens and secrets from nested diagnostic causes', () => {
        const cause = redactProblemCause({
            message: 'Databricks 401: Bearer abc.def.ghi dapi12345678901234567890 client_secret=topsecret',
            token: 'dapi12345678901234567890',
            nested: {
                authorization: 'Bearer another-secret',
                safe: 'status 401',
            },
        });

        expect(JSON.stringify(cause)).not.toContain('topsecret');
        expect(JSON.stringify(cause)).not.toContain('dapi12345678901234567890');
        expect(JSON.stringify(cause)).not.toContain('another-secret');
        expect(cause.nested.safe).toBe('status 401');
    });

    it('mints and echoes a sanitized request id when middleware has not run yet', () => {
        const req = { headers: { 'x-request-id': 'bad id<>with spaces' } };
        const res = { headersSent: false, setHeader: jest.fn() };

        const requestId = ensureRequestId(req, res);

        expect(requestId).toBe('badidwithspaces');
        expect(req.requestId).toBe('badidwithspaces');
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'badidwithspaces');
    });

    it('maps upstream failures to safe details without surfacing raw upstream messages', () => {
        const problem = mapUpstreamError(
            new Error('Databricks 401: client_secret=do-not-show'),
            { requestId: 'rid-1', provider: 'databricks', route: '/api/2.0/token' },
        );

        expect(problem.status).toBe(401);
        expect(problem.code).toBe('UPSTREAM_AUTH_FAILED');
        expect(problem.detail).toContain('upstream service rejected');
        expect(JSON.stringify(problem)).not.toContain('do-not-show');
    });

    it('sends application/problem+json with the chosen status', () => {
        const res = {
            status: jest.fn().mockReturnThis(),
            type: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnValue('sent'),
        };
        const problem = createProblem({ status: 500, requestId: 'rid-2', detail: UNEXPECTED_INTERNAL_SENTINEL });

        expect(sendProblem(res, problem)).toBe('sent');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.type).toHaveBeenCalledWith('application/problem+json');
        expect(res.json).toHaveBeenCalledWith(problem);
    });
});
