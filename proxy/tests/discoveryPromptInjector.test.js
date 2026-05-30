// @ts-check
'use strict';

const {
    formatDiscoveryContext,
    buildAuditDetail,
    MAX_KPIS,
    MAX_FRAMES,
} = require('../lib/discoveryPromptInjector');

describe('discoveryPromptInjector.formatDiscoveryContext', () => {
    test('returns null on null / undefined / non-object input', () => {
        expect(formatDiscoveryContext(null)).toBeNull();
        expect(formatDiscoveryContext(undefined)).toBeNull();
        expect(formatDiscoveryContext('not an object')).toBeNull();
        expect(formatDiscoveryContext(42)).toBeNull();
    });

    test('returns null on empty / no-signal object', () => {
        expect(formatDiscoveryContext({})).toBeNull();
        expect(formatDiscoveryContext({ sources: {} })).toBeNull();
        expect(formatDiscoveryContext({ sources: { probe: null } })).toBeNull();
        expect(formatDiscoveryContext({ availableKpis: [], reachableFrames: [] })).toBeNull();
    });

    test('formats connector probe details', () => {
        const out = formatDiscoveryContext({
            sources: {
                probe: {
                    connectorType: 'genie',
                    displayName: 'Sales space',
                    metadataAvailability: 'rich',
                    tableCount: 12,
                },
            },
        });
        expect(out).toContain('- Connector:');
        expect(out).toContain('genie');
        expect(out).toContain('"Sales space"');
        expect(out).toContain('metadata=rich');
        expect(out).toContain('12 table(s)');
    });

    test('omits table count when zero or missing', () => {
        const out = formatDiscoveryContext({
            sources: { probe: { connectorType: 'foundation-model', tableCount: 0 } },
        });
        expect(out).toContain('foundation-model');
        expect(out).not.toContain('table(s)');
    });

    test('lists available KPIs separated by commas', () => {
        const out = formatDiscoveryContext({
            availableKpis: ['Revenue', 'Profit Margin', 'OTIF'],
        });
        expect(out).toContain('- Available KPIs: Revenue, Profit Margin, OTIF');
    });

    test('caps KPI list at MAX_KPIS', () => {
        const many = Array.from({ length: MAX_KPIS + 5 }, (_, i) => `KPI${i}`);
        const out = formatDiscoveryContext({ availableKpis: many });
        expect(out).toContain('KPI0');
        expect(out).toContain(`KPI${MAX_KPIS - 1}`);
        expect(out).not.toContain(`KPI${MAX_KPIS}`);
        expect(out).not.toContain(`KPI${MAX_KPIS + 4}`);
    });

    test('lists reachable frames separated by commas, capped at MAX_FRAMES', () => {
        const frames = Array.from({ length: MAX_FRAMES + 3 }, (_, i) => `Frame${i}`);
        const out = formatDiscoveryContext({ reachableFrames: frames });
        expect(out).toContain('- Reachable analysis frames:');
        expect(out).toContain('Frame0');
        expect(out).toContain(`Frame${MAX_FRAMES - 1}`);
        expect(out).not.toContain(`Frame${MAX_FRAMES}`);
    });

    test('filters non-string entries silently', () => {
        const out = formatDiscoveryContext({
            availableKpis: ['Revenue', null, undefined, '', 42, 'Margin'],
        });
        expect(out).toContain('Revenue, Margin');
        expect(out).not.toContain('null');
        expect(out).not.toContain('undefined');
    });

    test('emits a connector line even with metadataAvailability=none and no KPIs', () => {
        const out = formatDiscoveryContext({
            sources: { probe: { connectorType: 'bedrock-direct', metadataAvailability: 'none' } },
        });
        expect(out).toContain('bedrock-direct');
        expect(out).toContain('metadata=none');
    });

    test('combines all signals in the canonical order', () => {
        const out = formatDiscoveryContext({
            sources: {
                probe: { connectorType: 'genie', metadataAvailability: 'rich', tableCount: 8 },
            },
            availableKpis: ['Revenue'],
            reachableFrames: ['BCG matrix'],
        });
        const lines = out.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('Connector');
        expect(lines[1]).toContain('Available KPIs');
        expect(lines[2]).toContain('Reachable analysis frames');
    });

    test('truncates oversized display name to 80 chars', () => {
        const longName = 'A'.repeat(120);
        const out = formatDiscoveryContext({
            sources: { probe: { connectorType: 'genie', displayName: longName } },
        });
        const matched = out.match(/"(A+)"/);
        expect(matched).not.toBeNull();
        if (matched) expect(matched[1].length).toBeLessThanOrEqual(80);
    });
});

describe('discoveryPromptInjector.buildAuditDetail', () => {
    test('null block → resolved=false, length=0', () => {
        expect(buildAuditDetail(null)).toEqual({ resolved: false, contextLength: 0 });
    });

    test('non-empty block → resolved=true, length matches', () => {
        const block = 'hello world';
        expect(buildAuditDetail(block)).toEqual({ resolved: true, contextLength: block.length });
    });
});
