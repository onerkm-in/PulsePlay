'use strict';

/**
 * rawErrLeakInvariant.test.js — Slice 1d invariant.
 *
 * Pins the locked Error Intelligence Layer contract by scanning the
 * proxy source for the raw `err.message` leak patterns that Slice 1d
 * converted to `sendProblem()`. Any future commit that re-introduces
 * one of these patterns fails this test loudly.
 *
 * Why a source-level invariant instead of per-route behavioural tests:
 * the conversion is mechanical (13 routes, identical shape) and the
 * helper (`createProblem` + `sendProblem`) is already covered by
 * `problemDetails.test.js` + `problemEnvelope.integration.test.js`.
 * Behavioural tests on 13 separate routes would require 13 separate
 * mock harnesses; the source-level invariant catches drift on all 13
 * (and any future route added under the same anti-pattern) with one
 * regex.
 *
 * This is the same pattern as the BUG-015 invariant test for auth
 * middleware mounting — structural assertions to prevent silent drift.
 *
 * The scan strips line + block comments before matching so commented-
 * out historical examples or documentation snippets don't trigger
 * false positives.
 */

const fs = require('fs');
const path = require('path');

const SERVER_JS_PATH = path.join(__dirname, '..', 'server.js');

function loadServerSourceStripped() {
    const raw = fs.readFileSync(SERVER_JS_PATH, 'utf8');
    return raw
        .replace(/\/\/.*$/gm, '')                  // line comments
        .replace(/\/\*[\s\S]*?\*\//g, '');          // block comments
}

describe('Slice 1d invariant — raw err.message leak patterns', () => {
    let source;
    beforeAll(() => { source = loadServerSourceStripped(); });

    test('no `res.status(500).json({ error: err.message })` patterns remain', () => {
        // Direct shape used by /openai, /bedrock, /foundation,
        // /responses-agent, /supervisor before Slice 1d.
        const offenders = source.match(
            /res\.status\(\s*500\s*\)\.json\(\s*\{\s*error:\s*err\.message\s*\}\s*\)/g,
        );
        expect(offenders || []).toEqual([]);
    });

    test('no `res.status(500).json({ ok: false, error: err.message ... })` patterns remain', () => {
        // Variant used by /history POST + GET before Slice 1d.
        const offenders = source.match(
            /res\.status\(\s*500\s*\)\.json\(\s*\{\s*ok:\s*false\s*,\s*error:\s*err\.message/g,
        );
        expect(offenders || []).toEqual([]);
    });

    test('no `return res.status(500).json({ error: err.message })` patterns remain', () => {
        // Variant with `return` prefix used by some routes.
        const offenders = source.match(
            /return\s+res\.status\(\s*500\s*\)\.json\(\s*\{\s*error:\s*err\.message\s*\}\s*\)/g,
        );
        expect(offenders || []).toEqual([]);
    });

    test('errorStatusFromDatabricks fallback returns the safe sentinel, not raw message', () => {
        // The function's last return statement (the fallback path) must
        // use UNEXPECTED_INTERNAL_SENTINEL. If a future change reverts
        // to `error: message` the test fails.
        const fallbackRegex = /return\s*\{\s*status:\s*fallbackStatus\s*,\s*error:\s*([A-Za-z_]\w*)\s*\}/;
        const match = source.match(fallbackRegex);
        expect(match).not.toBeNull();
        // The identifier captured in group 1 must NOT be `message`.
        expect(match[1]).not.toBe('message');
        // Strong form: it MUST be the canonical sentinel constant.
        expect(match[1]).toBe('UNEXPECTED_INTERNAL_SENTINEL');
    });

    test('Slice 1d converted routes use sendProblem + createProblem', () => {
        // Smoke check that the conversions actually went through to
        // sendProblem(). Count the sendProblem call sites; should be
        // ≥ 13 (the routes I converted) plus the 2 that existed before
        // Slice 1d in the JSON-parse + global fallback handlers — so 15+.
        const sendProblemCalls = source.match(/sendProblem\s*\(\s*res\s*,/g) || [];
        expect(sendProblemCalls.length).toBeGreaterThanOrEqual(15);
    });
});
