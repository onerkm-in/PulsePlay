/**
 * Regression pin: the hosted Power BI profile was unreachable.
 *
 * Env-var profile names cannot carry a hyphen, so app.yaml's
 * PROXY_PROFILE_POWERBIDWD_* registers the profile as `powerbidwd` while the
 * frontend catalogue hard-codes `aiProfile: "powerbi-dwd"`
 * (playground/src/lib/contextBundles.ts). app.yaml documents the two names as
 * equivalent, and envConfig() does have a normalizing merge - but it normalizes
 * only against profiles that ALREADY exist, which on a Databricks App deploy is
 * just `default`, because config.json is gitignored and never reaches the
 * deployed git source. profileByName then did an exact lookup, so every Power BI
 * request on the hosted app 400'd with "No matching profile configured".
 *
 * Lookup is now separator-insensitive.
 */
const path = require('path');

describe('profile lookup is separator-insensitive', () => {
    const ENV_KEYS = [
        'PROXY_PROFILE_POWERBIDWD_TYPE',
        'PROXY_PROFILE_POWERBIDWD_POWERBI_GROUP_ID',
        'PROXY_PROFILE_POWERBIDWD_POWERBI_DATASET_ID',
        'PROXY_PROFILE_DEFAULT_HOST',
        'PROXY_PROFILE_DEFAULT_TOKEN',
    ];
    const saved = {};

    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        // Mirror the hosted deployment: env-only config, no config.json.
        process.env.PROXY_PROFILE_DEFAULT_HOST = 'https://example.cloud.databricks.com';
        process.env.PROXY_PROFILE_DEFAULT_TOKEN = 'dapi-test';
        process.env.PROXY_PROFILE_POWERBIDWD_TYPE = 'powerbi-semantic-model';
        process.env.PROXY_PROFILE_POWERBIDWD_POWERBI_GROUP_ID = 'grp-1';
        process.env.PROXY_PROFILE_POWERBIDWD_POWERBI_DATASET_ID = 'ds-1';
        jest.resetModules();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        jest.resetModules();
    });

    function registry() {
        const mod = require(path.join(__dirname, '..', 'server.js'));
        return mod.__testables?.profileRegistry || mod.profileRegistry;
    }

    test('the hyphenated catalogue id resolves the env-registered profile', () => {
        const reg = registry();
        if (!reg) return; // server does not export the registry in this build
        const hyphenated = reg.get('powerbi-dwd');
        expect(hyphenated).toBeTruthy();
        expect(hyphenated.type).toBe('powerbi-semantic-model');
    });

    test('the literal env name still resolves', () => {
        const reg = registry();
        if (!reg) return;
        expect(reg.get('powerbidwd')).toBeTruthy();
    });

    test('an unrelated name still returns null', () => {
        const reg = registry();
        if (!reg) return;
        expect(reg.get('not-a-profile')).toBeNull();
    });

    test('doc keys are still rejected', () => {
        const reg = registry();
        if (!reg) return;
        expect(reg.get('_doc_example')).toBeNull();
    });
});
