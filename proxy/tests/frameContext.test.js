'use strict';

/**
 * frameContext.test.js — Phase 11b prep coverage.
 *
 * Unit tests for proxy/lib/frameContext.js. The route integration is
 * verified end-to-end by manual smoke; these tests lock the helper
 * contracts so byte-identity for free-text (no frame) is preserved and
 * defensive validation doesn't regress.
 */

const {
    validateFrame,
    prependFrameContext,
    formatFrameBlock,
    buildFrameAuditDetail,
    FRAME_CONTENT_MARKER,
} = require('../lib/frameContext');

describe('validateFrame', () => {
    test('returns null for absent / non-object / array / wrong-type inputs', () => {
        expect(validateFrame(undefined)).toBeNull();
        expect(validateFrame(null)).toBeNull();
        expect(validateFrame('string')).toBeNull();
        expect(validateFrame(42)).toBeNull();
        expect(validateFrame(true)).toBeNull();
        expect(validateFrame([{ frameId: 'bcg' }])).toBeNull(); // arrays rejected
    });

    test('rejects objects with missing / non-string / empty / over-long frameId', () => {
        expect(validateFrame({})).toBeNull();
        expect(validateFrame({ frameId: 42 })).toBeNull();
        expect(validateFrame({ frameId: '' })).toBeNull();
        expect(validateFrame({ frameId: '   ' })).toBeNull();
        expect(validateFrame({ frameId: 'x'.repeat(129) })).toBeNull();
    });

    test('accepts a minimal valid frame and trims whitespace', () => {
        const out = validateFrame({ frameId: '  bcg  ' });
        expect(out).toEqual({ frameId: 'bcg' });
    });

    test('passes through label / domain (trimmed + 256-cap)', () => {
        const out = validateFrame({
            frameId: 'bcg',
            label: '  BCG growth–share matrix  ',
            domain: 'portfolio',
        });
        expect(out).toEqual({
            frameId: 'bcg',
            label: 'BCG growth–share matrix',
            domain: 'portfolio',
        });

        const longLabel = 'a'.repeat(300);
        const out2 = validateFrame({ frameId: 'bcg', label: longLabel });
        expect(out2.label.length).toBe(256);
    });

    test('accepts safe params (primitives + arrays of primitives), drops nested objects + dangerous keys', () => {
        const out = validateFrame({
            frameId: 'bcg',
            params: {
                metric: 'revenue',
                top: 5,
                ascending: true,
                tags: ['cpg', 'fmcg'],
                evil: { nested: 'object' },                  // dropped (nested object)
                arrayOfObjects: [{ x: 1 }],                  // dropped (nested in array)
                __proto__: 'pollute',                        // dropped (dangerous key)
                constructor: 'pollute',                      // dropped (dangerous key)
            },
        });
        expect(out.params).toEqual({
            metric: 'revenue',
            top: 5,
            ascending: true,
            tags: ['cpg', 'fmcg'],
        });
    });

    test('truncates string params past 512 chars + caps params count at 32', () => {
        const longString = 'a'.repeat(600);
        const params = { huge: longString };
        for (let i = 0; i < 40; i += 1) params[`k${i}`] = i;
        const out = validateFrame({ frameId: 'bcg', params });
        expect(out.params.huge.length).toBe(512);
        // 32 total params (huge + ~31 of k0..k39); exact subset depends on
        // iteration order but the cap must hold.
        expect(Object.keys(out.params).length).toBeLessThanOrEqual(32);
    });

    test('omits params field entirely when empty', () => {
        const out = validateFrame({ frameId: 'bcg', params: {} });
        expect(out).toEqual({ frameId: 'bcg' });
        expect('params' in out).toBe(false);
    });
});

describe('formatFrameBlock', () => {
    test('produces the same [Selected analysis frame] block the frontend AISidebar emits', () => {
        const frame = {
            frameId: 'bcg',
            label: 'BCG growth–share matrix',
            domain: 'portfolio',
            params: { metric: 'revenue', grouping: 'sku' },
        };
        const out = formatFrameBlock(frame);
        expect(out).toContain(FRAME_CONTENT_MARKER);
        expect(out).toContain('Frame: BCG growth–share matrix (bcg)');
        expect(out).toContain('Domain: portfolio');
        expect(out).toContain('metric: revenue');
        expect(out).toContain('grouping: sku');
    });

    test('falls back to frameId when label is missing', () => {
        const out = formatFrameBlock({ frameId: 'bcg' });
        expect(out).toContain('Frame: bcg (bcg)');
        // No Domain / Params lines when those fields are absent.
        expect(out).not.toContain('Domain:');
        expect(out).not.toContain('Params:');
    });
});

describe('prependFrameContext', () => {
    test('no-op when frame is null (byte-identical content preserved)', () => {
        const content = '[Question]\nwhat is OTIF?';
        expect(prependFrameContext(content, null)).toBe(content);
    });

    test('no-op when content already contains the marker (idempotent for AISidebar-built requests)', () => {
        const content = [
            '[Selected analysis frame]',
            '- Frame: BCG growth–share matrix (bcg)',
            '',
            '[Question]',
            'what about Q4?',
        ].join('\n');
        const frame = { frameId: 'bcg', label: 'BCG growth–share matrix', domain: 'portfolio' };
        // Content already carries the marker — prependFrameContext must NOT
        // duplicate it (the frontend already did the work; this is the
        // idempotency guarantee for AISidebar-built requests).
        expect(prependFrameContext(content, frame)).toBe(content);
    });

    test('prepends a [Frame Context] block when content has no marker (direct API caller path)', () => {
        const content = '[Question]\nshow me the top SKUs';
        const frame = { frameId: 'bcg', label: 'BCG growth–share matrix', domain: 'portfolio' };
        const out = prependFrameContext(content, frame);
        expect(out).toContain('[Frame Context]');
        expect(out).toContain('Frame: BCG growth–share matrix (bcg)');
        // Original content is preserved at the end.
        expect(out.endsWith(content)).toBe(true);
    });

    test('returns content unchanged when content is not a string (defense in depth)', () => {
        const frame = { frameId: 'bcg' };
        expect(prependFrameContext(null, frame)).toBeNull();
        expect(prependFrameContext(undefined, frame)).toBeUndefined();
    });
});

describe('buildFrameAuditDetail', () => {
    test('returns a zero-filled shape for null/undefined frame', () => {
        const out = buildFrameAuditDetail(null);
        expect(out).toEqual({
            frameId: null,
            label: null,
            domain: null,
            paramCount: 0,
            paramKeys: [],
        });
    });

    test('captures frameId/label/domain + paramKeys but NEVER param values (audit privacy)', () => {
        const frame = {
            frameId: 'bcg',
            label: 'BCG growth–share matrix',
            domain: 'portfolio',
            params: { metric: 'revenue', grouping: 'sku', leakingSecret: 'do-not-log-this' },
        };
        const out = buildFrameAuditDetail(frame);
        expect(out.frameId).toBe('bcg');
        expect(out.label).toBe('BCG growth–share matrix');
        expect(out.domain).toBe('portfolio');
        expect(out.paramCount).toBe(3);
        // Keys yes — values no.
        expect(out.paramKeys).toEqual(['metric', 'grouping', 'leakingSecret']);
        // Defense-in-depth: the JSON dump must not contain any param value.
        const json = JSON.stringify(out);
        expect(json).not.toContain('do-not-log-this');
        expect(json).not.toContain('revenue');
        expect(json).not.toContain('sku');
    });
});
