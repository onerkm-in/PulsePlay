'use strict';

const { toStatementParameters } = require('../lib/sqlExecutor');

describe('toStatementParameters (Statement API named markers)', () => {
    test('returns null for no params', () => {
        expect(toStatementParameters(undefined)).toBeNull();
        expect(toStatementParameters({})).toBeNull();
    });
    test('types strings/ints/doubles/booleans/null', () => {
        const out = toStatementParameters({ s: 'x', i: 3, d: 1.5, b: true, n: null });
        expect(out).toEqual(expect.arrayContaining([
            { name: 's', value: 'x' },
            { name: 'i', value: '3', type: 'INT' },
            { name: 'd', value: '1.5', type: 'DOUBLE' },
            { name: 'b', value: 'true', type: 'BOOLEAN' },
            { name: 'n', value: null },
        ]));
    });
    test('stringifies non-scalar defensively', () => {
        const out = toStatementParameters({ j: { a: 1 } });
        expect(out[0].name).toBe('j');
        expect(typeof out[0].value).toBe('string');
    });
});
