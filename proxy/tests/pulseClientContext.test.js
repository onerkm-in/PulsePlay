'use strict';

const {
    PULSE_CLIENT_CONTRACT_VERSION,
    SUPPORTED_PULSE_CLIENTS,
    sanitizeHeaderToken,
    sanitizeRequestId,
    normalizePulseClient,
    resolvePulseClientContext,
    resolvePulseRequestId,
    buildPulseClientCompatibilityResponse,
} = require('../lib/pulseClientContext');

describe('PX1 pulse client context helpers', () => {
    test('normalizes known client aliases without exposing arbitrary values', () => {
        expect(normalizePulseClient('pulseplay')).toBe('pulseplay');
        expect(normalizePulseClient('playground')).toBe('pulseplay');
        expect(normalizePulseClient('pulse-pbi')).toBe('pulse-pbi');
        expect(normalizePulseClient('PowerBI')).toBe('pulse-pbi');
        expect(normalizePulseClient('desktop')).toBe('pulseplay-desktop');
        expect(normalizePulseClient('unknown-team-tool')).toBe('unknown');
    });

    test('sanitizes version and request headers for logs/echo headers', () => {
        expect(sanitizeHeaderToken('1.2.3+build:7 <script>')).toBe('1.2.3+build:7script');
        expect(sanitizeRequestId('rid 123<>')).toBe('rid123');
        expect(sanitizeRequestId('x'.repeat(100))).toHaveLength(80);
    });

    test('resolves client context from lowercase Node request headers', () => {
        expect(resolvePulseClientContext({
            'x-pulse-client': 'pulse_pbi',
            'x-pulse-client-version': '2.0.0 beta',
        })).toEqual({
            clientApp: 'pulse-pbi',
            clientVersion: '2.0.0beta',
        });
    });

    test('prefers X-Request-Id but accepts X-Pulse-Request-Id fallback', () => {
        expect(resolvePulseRequestId({
            'x-request-id': 'classic-id',
            'x-pulse-request-id': 'pulse-id',
        }, () => 'fallback-id')).toBe('classic-id');

        expect(resolvePulseRequestId({
            'x-pulse-request-id': 'pulse id<>',
        }, () => 'fallback-id')).toBe('pulseid');

        expect(resolvePulseRequestId({
            'x-request-id': 'x'.repeat(81),
            'x-pulse-request-id': 'pulse-id',
        }, () => 'fallback-id')).toBe('pulse-id');

        expect(resolvePulseRequestId({}, () => 'fallback id<>')).toBe('fallbackid');
    });

    test('builds explicit compatibility metadata for every supported client', () => {
        expect(SUPPORTED_PULSE_CLIENTS).toEqual(['pulseplay', 'pulse-pbi', 'pulseplay-desktop']);

        for (const clientApp of SUPPORTED_PULSE_CLIENTS) {
            const response = buildPulseClientCompatibilityResponse({
                clientApp,
                clientVersion: '1.0.0',
                requestId: `rid-${clientApp}`,
            });
            expect(response.contractVersion).toBe(PULSE_CLIENT_CONTRACT_VERSION);
            expect(response.client.app).toBe(clientApp);
            expect(response.client.version).toBe('1.0.0');
            expect(response.client.requestId).toBe(`rid-${clientApp}`);
            expect(response.requestHeaders).toContain('X-Pulse-Client');
            expect(response.responseHeaders).toContain('X-Pulse-Request-Id');
        }
    });
});
