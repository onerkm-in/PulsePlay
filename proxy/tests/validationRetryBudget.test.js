// @ts-check
'use strict';

const {
    resolveBudget,
    parseEnvBudget,
    MIN_BUDGET,
    MAX_BUDGET,
} = require('../lib/validationRetryBudget');

describe('parseEnvBudget', () => {
    test('returns 0 for undefined / empty / non-numeric input', () => {
        expect(parseEnvBudget(undefined)).toBe(0);
        expect(parseEnvBudget('')).toBe(0);
        expect(parseEnvBudget('not a number')).toBe(0);
        expect(parseEnvBudget(null)).toBe(0);
    });

    test('parses a valid integer string', () => {
        expect(parseEnvBudget('0')).toBe(0);
        expect(parseEnvBudget('1')).toBe(1);
        expect(parseEnvBudget('3')).toBe(3);
    });

    test('clamps out-of-range values', () => {
        expect(parseEnvBudget('999')).toBe(MAX_BUDGET);
        expect(parseEnvBudget('-5')).toBe(MIN_BUDGET);
    });
});

describe('resolveBudget', () => {
    test('returns envValue when clientValue is null/undefined', () => {
        expect(resolveBudget({ envValue: '2', clientValue: null })).toBe(2);
        expect(resolveBudget({ envValue: '2', clientValue: undefined })).toBe(2);
    });

    test('client override wins over env when supplied', () => {
        expect(resolveBudget({ envValue: '3', clientValue: 0 })).toBe(0);
        expect(resolveBudget({ envValue: '0', clientValue: 2 })).toBe(2);
        expect(resolveBudget({ envValue: '1', clientValue: 3 })).toBe(3);
    });

    test('client value 0 is honored (lever turns retries OFF even when env enabled)', () => {
        expect(resolveBudget({ envValue: '3', clientValue: 0 })).toBe(0);
    });

    test('client value is clamped 0..3', () => {
        expect(resolveBudget({ envValue: '0', clientValue: 999 })).toBe(MAX_BUDGET);
        expect(resolveBudget({ envValue: '0', clientValue: -5 })).toBe(MIN_BUDGET);
    });

    test('non-finite client value falls back to env', () => {
        expect(resolveBudget({ envValue: '2', clientValue: NaN })).toBe(2);
        expect(resolveBudget({ envValue: '2', clientValue: Infinity })).toBe(2);
    });

    test('non-number client value (string / object) falls back to env', () => {
        // @ts-expect-error — purposely passing wrong type
        expect(resolveBudget({ envValue: '1', clientValue: '2' })).toBe(1);
        // @ts-expect-error — purposely passing wrong type
        expect(resolveBudget({ envValue: '1', clientValue: { value: 3 } })).toBe(1);
    });

    test('both env and client absent → 0 (retries off)', () => {
        expect(resolveBudget({ envValue: undefined, clientValue: null })).toBe(0);
    });

    test('floors fractional client value before clamping', () => {
        expect(resolveBudget({ envValue: '0', clientValue: 2.9 })).toBe(2);
        expect(resolveBudget({ envValue: '0', clientValue: 0.5 })).toBe(0);
    });
});
