'use strict';

/**
 * confidencePhase2Stream.test.js — Slice 1c Item 2 coverage.
 *
 * The /confidence route streams phase 1 (structural confidence)
 * synchronously, then attempts a phase-2 Genie follow-up for the
 * business-language reasoning. Phase 2's silent catch at line ~6200
 * previously swallowed failures with no diagnostic surface — the
 * visual would render the phase-1 score and the user would never
 * know that "Reasoning unavailable" was supposed to come second.
 *
 * Slice 1c Item 2 emits an in-band NDJSON error event on phase-2
 * failure. Phase 1's score chunk has already flushed (response
 * status is committed to 200), so the locked Error Strategy
 * §"Streaming responses" mandates a structured in-band event
 * rather than a status code rewrite.
 *
 * This file pins:
 *   - The exact event shape (so the playground can rely on it)
 *   - That raw err.message never reaches the wire — only the
 *     verbatim safe sentinel from problemDetails.createProblem
 *   - That the builder is pure and never throws on edge inputs
 *
 * The route's integration path is exercised indirectly: the catch
 * block calls buildConfidencePhase2ErrorEvent → writes the JSON.
 * The function is exported for direct testing so we don't need a
 * full https.request mock harness for the shape contract.
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';

const { buildConfidencePhase2ErrorEvent } = require('../server');

describe('buildConfidencePhase2ErrorEvent — Slice 1c Item 2 streaming carve-out', () => {
    test('produces the locked NDJSON event shape with requestId echoed', () => {
        const evt = buildConfidencePhase2ErrorEvent('rid-trace-confidence-001');
        // Top-level event envelope — stream protocol contract.
        expect(evt).toMatchObject({
            type: 'error',
            phase: 2,
        });
        // Nested problem envelope — same RFC 9457 + PulsePlay extensions
        // shape Slice 1b ships for non-streaming routes.
        expect(evt.problem).toMatchObject({
            status: 502,
            code: 'CONFIDENCE_PHASE2_FAILED',
            category: 'upstream_unavailable',
            retryable: true,
            requestId: 'rid-trace-confidence-001',
        });
    });

    test('detail is the verbatim safe sentinel — NEVER raw err.message', () => {
        const evt = buildConfidencePhase2ErrorEvent('rid-1');
        // Critical security property — locked strategy doc §"Redaction
        // rules for unexpected_internal" requires that any post-first-
        // chunk failure surfaces only the safe sentinel, never the
        // upstream error text.
        expect(evt.problem.detail).toMatch(/PulsePlay could not retrieve the business-language reasoning/);
        // Mirror Pulse-sibling compat — short error string for legacy clients.
        expect(typeof evt.problem.error).toBe('string');
        expect(evt.problem.error.length).toBeGreaterThan(0);
        // Defence-in-depth: even if a future refactor accidentally
        // splices an err into createProblem, the test guards against
        // common upstream error tokens leaking through.
        const serialized = JSON.stringify(evt);
        expect(serialized).not.toMatch(/dapi[a-f0-9]/i);
        expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9]/i);
    });

    test('flags the chip as not-fatal: phase-1 score remains valid', () => {
        // The user-facing meaning is "phase 2 enrichment failed,
        // phase 1 score above is still good". The `detail` text and
        // the `retryable: true` signal together carry that nuance.
        const evt = buildConfidencePhase2ErrorEvent('rid-2');
        expect(evt.problem.detail).toMatch(/phase 1 score above is unaffected/i);
        expect(evt.problem.retryable).toBe(true);
    });

    test('NDJSON-serializable — no circular refs, no functions, every key string-safe', () => {
        const evt = buildConfidencePhase2ErrorEvent('rid-3');
        // Should be writable as a single JSON line + newline, exactly
        // how the route's res.write call composes it.
        const line = JSON.stringify(evt) + '\n';
        expect(line.endsWith('\n')).toBe(true);
        // Round-trip — parses back into an equivalent object.
        const parsed = JSON.parse(line.trim());
        expect(parsed).toEqual(evt);
    });

    test('tolerates missing/empty requestId (defensive — req.requestId might be undefined in edge paths)', () => {
        expect(() => buildConfidencePhase2ErrorEvent(undefined)).not.toThrow();
        expect(() => buildConfidencePhase2ErrorEvent('')).not.toThrow();
        expect(() => buildConfidencePhase2ErrorEvent(null)).not.toThrow();

        const evt = buildConfidencePhase2ErrorEvent(undefined);
        // requestId becomes '' rather than the literal "undefined" — createProblem
        // already handles missing requestId by skipping the field; the event
        // remains structurally valid for streaming.
        expect(evt.type).toBe('error');
        expect(evt.phase).toBe(2);
        expect(evt.problem.code).toBe('CONFIDENCE_PHASE2_FAILED');
    });

    test('event type and phase are LITERAL, not computed — pins the stream protocol contract', () => {
        // If a future refactor parameterizes these, the playground stream
        // consumer would silently miss the event. Lock them.
        const evt = buildConfidencePhase2ErrorEvent('rid-pin');
        expect(evt.type).toBe('error');
        expect(evt.phase).toBe(2);
    });
});
