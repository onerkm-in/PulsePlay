'use strict';

const {
    normalizeAllowlist,
    startupAllowlistProblem,
    buildVisibleAllowlist,
    isAiProfileAllowed,
    isPackAllowed,
    isEmbedOriginAllowed,
    isPowerBIWorkspaceAllowed,
    isPowerBIReportAllowed,
} = require('../lib/allowlist');

describe('allowlist helpers', () => {
    const config = {
        allowlist: {
            biProviders: ['powerbi'],
            embedOrigins: { powerbi: ['https://app.powerbi.com'] },
            powerbiWorkspaces: ['WSP-1'],
            powerbiReports: [],
            aadTenants: ['TENANT-1'],
            aiProfiles: {
                default: ['sales-genie'],
                byGroup: {
                    'app.pulseplay.finance': ['finance-genie'],
                },
            },
            genieSpaces: ['SPACE-1'],
            supervisorProfiles: ['org-supervisor-v1'],
            packs: ['cpg-fmcg'],
            knowledgeSources: [],
            display: { biTileMode: '2' },
        },
        allowlistEnforcement: 'strict',
    };

    test('normalizes configured allowlists', () => {
        const normalized = normalizeAllowlist(config, { NODE_ENV: 'development' });
        expect(normalized.active).toBe(true);
        expect(normalized.biProviders).toEqual(['powerbi']);
        expect(normalized.embedOrigins.powerbi).toEqual(['app.powerbi.com']);
        expect(normalized.powerbiWorkspaces).toEqual(['wsp-1']);
        expect(normalized.display).toEqual({ biTileMode: '2' });
    });

    test('production refuses to start without a configured allowlist', () => {
        expect(startupAllowlistProblem({}, { NODE_ENV: 'production' })).toMatch(/allowlist is required/);
        expect(startupAllowlistProblem(config, { NODE_ENV: 'production' })).toBeNull();
    });

    test('filters ai profiles by group claims plus supervisorProfiles', () => {
        const req = { user: { groups: ['app.pulseplay.finance'] } };
        expect(buildVisibleAllowlist(config, req).aiProfiles).toEqual(
            expect.arrayContaining(['sales-genie', 'finance-genie', 'org-supervisor-v1']),
        );
        expect(buildVisibleAllowlist(config, req).display).toEqual({ biTileMode: '2' });
        expect(isAiProfileAllowed(config, req, 'finance-genie').ok).toBe(true);
        expect(isAiProfileAllowed(config, { user: { groups: [] } }, 'finance-genie').ok).toBe(false);
    });

    test('enforces packs, origins, workspaces, and report semantics', () => {
        expect(isPackAllowed(config, {}, 'cpg-fmcg').ok).toBe(true);
        expect(isPackAllowed(config, {}, 'ghost-pack').ok).toBe(false);
        expect(isEmbedOriginAllowed(config, {}, 'powerbi', 'https://app.powerbi.com/reportEmbed?x=1').ok).toBe(true);
        expect(isEmbedOriginAllowed(config, {}, 'powerbi', 'https://evil.example.com/embed').ok).toBe(false);
        expect(isPowerBIWorkspaceAllowed(config, {}, 'wsp-1').ok).toBe(true);
        expect(isPowerBIWorkspaceAllowed(config, {}, 'wsp-2').ok).toBe(false);
        expect(isPowerBIReportAllowed(config, {}, 'any-report-inside-allowed-workspace').ok).toBe(true);
    });

    test('warn mode allows but marks out-of-list values', () => {
        const warnConfig = { ...config, allowlistEnforcement: 'warn' };
        const result = isPackAllowed(warnConfig, {}, 'ghost-pack');
        expect(result.ok).toBe(true);
        expect(result.warn).toBe(true);
    });
});
