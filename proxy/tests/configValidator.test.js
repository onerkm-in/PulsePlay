// proxy/tests/configValidator.test.js
//
// L17 closure tests — validateConfigShape rejects obviously-malformed
// config blocks. The validator is permissive on optional fields and
// strict on fields whose wrong types cause runtime crashes.

const { validateConfigShape } = require('../lib/configValidator');

describe('validateConfigShape — top-level shape', () => {
    test('returns empty for a valid minimal config', () => {
        expect(validateConfigShape({ profiles: {} })).toEqual([]);
    });

    test('returns empty for the canonical MVP 0.2 shape', () => {
        const config = {
            port: 8787,
            feedbackLog: 'feedback.log',
            allowlistEnforcement: 'strict',
            allowlist: {
                biProviders: ['powerbi'],
                embedOrigins: { powerbi: ['app.powerbi.com'] },
                aadTenants: ['tenant-1'],
                aiProfiles: { default: ['default'], byGroup: {} },
                packs: ['cpg-fmcg'],
            },
            profiles: {
                default: { host: 'https://x', token: 'y' },
            },
        };
        expect(validateConfigShape(config)).toEqual([]);
    });

    test('flags non-object root', () => {
        expect(validateConfigShape(null)[0]).toMatch(/must be an object/);
        expect(validateConfigShape('a string')[0]).toMatch(/must be an object/);
    });
});

describe('validateConfigShape — port', () => {
    test('flags non-integer port', () => {
        const errs = validateConfigShape({ port: 'eight-seven-eight-seven', profiles: {} });
        expect(errs[0]).toMatch(/port must be an integer/);
    });

    test('flags out-of-range port', () => {
        const errs = validateConfigShape({ port: 70000, profiles: {} });
        expect(errs[0]).toMatch(/port must be an integer in 1\.\.65535/);
    });

    test('accepts undefined port (uses default)', () => {
        expect(validateConfigShape({ profiles: {} })).toEqual([]);
    });
});

describe('validateConfigShape — allowlist', () => {
    test('flags non-object allowlist', () => {
        const errs = validateConfigShape({ allowlist: 'not-an-object', profiles: {} });
        expect(errs[0]).toMatch(/allowlist must be an object/);
    });

    test('flags non-array embedOrigins entries', () => {
        const errs = validateConfigShape({
            allowlist: { embedOrigins: { powerbi: 'app.powerbi.com' } },
            profiles: {},
        });
        expect(errs[0]).toMatch(/embedOrigins.*must be an array/);
    });

    test('flags non-array packs', () => {
        const errs = validateConfigShape({ allowlist: { packs: 'cpg-fmcg' }, profiles: {} });
        expect(errs[0]).toMatch(/packs must be an array/);
    });

    test('accepts legacy aiProfiles as array', () => {
        const errs = validateConfigShape({
            allowlist: { aiProfiles: ['default', 'sales'] },
            profiles: {},
        });
        expect(errs).toEqual([]);
    });

    test('flags non-object aiProfiles.byGroup', () => {
        const errs = validateConfigShape({
            allowlist: { aiProfiles: { default: ['a'], byGroup: ['not', 'an', 'object'] } },
            profiles: {},
        });
        expect(errs[0]).toMatch(/byGroup must be an object/);
    });
});

describe('validateConfigShape — profiles', () => {
    test('flags non-object profiles', () => {
        const errs = validateConfigShape({ profiles: 'oops' });
        expect(errs[0]).toMatch(/profiles must be an object/);
    });

    test('flags non-string field in a profile', () => {
        const errs = validateConfigShape({
            profiles: { default: { host: 12345 } },
        });
        expect(errs[0]).toMatch(/profiles\["default"\]\.host must be a string/);
    });

    test('accepts _doc keys without validation', () => {
        const errs = validateConfigShape({
            profiles: {
                _doc_example: 'free-form documentation string',
                real: { host: 'https://x' },
            },
        });
        expect(errs).toEqual([]);
    });

    test('flags non-array supervisor spaces field', () => {
        const errs = validateConfigShape({
            profiles: { supervisor: { type: 'supervisor-local', spaces: 'sales' } },
        });
        expect(errs[0]).toMatch(/spaces must be an array/);
    });
});
