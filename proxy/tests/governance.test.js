'use strict';

// G3a — Contract tests for the proxy-side governance attestation builder.
//
// These tests pin the safety guarantees backend paths will rely on once
// G3b/G3c wires routes:
//   - `enforced: true` is always set; callers cannot override.
//   - authority allowlist is strict.
//   - `authority: "mock"` is forbidden in production.
//   - subjectRef / requestId / policyVersion get sanitized.
//   - cost estimates are validated structurally.
//   - the returned attestation is frozen.

const {
    GOVERNANCE_AUTHORITIES,
    GOVERNANCE_COST_UNITS,
    buildGovernanceAttestation,
} = require('../lib/governance');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('GOVERNANCE_AUTHORITIES + GOVERNANCE_COST_UNITS', () => {
    test('authorities list is the documented four, frozen', () => {
        expect(GOVERNANCE_AUTHORITIES).toEqual([
            'unity-catalog',
            'powerbi-semantic-model',
            'warehouse',
            'mock',
        ]);
        expect(Object.isFrozen(GOVERNANCE_AUTHORITIES)).toBe(true);
    });

    test('cost units list is the documented three, frozen', () => {
        expect(GOVERNANCE_COST_UNITS).toEqual(['rows-scanned', 'cached', 'usd']);
        expect(Object.isFrozen(GOVERNANCE_COST_UNITS)).toBe(true);
    });
});

describe('buildGovernanceAttestation — happy paths', () => {
    test('builds the minimal required-only attestation', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'user-hash-abc',
            requestId: 'req-2026-05-21-001',
        });
        expect(result).toEqual({
            enforced: true,
            authority: 'unity-catalog',
            subjectRef: 'user-hash-abc',
            requestId: 'req-2026-05-21-001',
        });
    });

    test('builds a fully-populated attestation', () => {
        const sourceRef = {
            kind: 'metric-view',
            fullName: 'main.finance.revenue_metrics',
            warehouseId: 'wh-prod-1',
            displayName: 'Revenue metrics',
            governance: { requiresAttestation: true },
        };
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'user-hash-abc',
            requestId: 'req-001',
            sourceRef,
            policyVersion: 'v2.3.0',
            rowLimitApplied: 10000,
            columnPolicyApplied: true,
            cacheHit: false,
            costEstimate: { unit: 'rows-scanned', value: 1234 },
        });
        expect(result.sourceRef).toBe(sourceRef);
        expect(result.policyVersion).toBe('v2.3.0');
        expect(result.rowLimitApplied).toBe(10000);
        expect(result.columnPolicyApplied).toBe(true);
        expect(result.cacheHit).toBe(false);
        expect(result.costEstimate).toEqual({ unit: 'rows-scanned', value: 1234 });
    });

    test.each(GOVERNANCE_AUTHORITIES.filter(a => a !== 'mock'))(
        'accepts authority=%s in any environment',
        (authority) => {
            process.env.NODE_ENV = 'production';
            const result = buildGovernanceAttestation({
                authority,
                subjectRef: 'u',
                requestId: 'r',
            });
            expect(result.authority).toBe(authority);
        },
    );

    test.each(GOVERNANCE_COST_UNITS)('accepts costEstimate.unit=%s', (unit) => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit, value: 100 },
        });
        expect(result.costEstimate).toEqual({ unit, value: 100 });
    });

    test('accepts costEstimate.value of zero', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit: 'cached', value: 0 },
        });
        expect(result.costEstimate.value).toBe(0);
    });

    test('accepts rowLimitApplied of zero', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            rowLimitApplied: 0,
        });
        expect(result.rowLimitApplied).toBe(0);
    });
});

describe('buildGovernanceAttestation — enforced is always true', () => {
    test('always emits enforced: true even when caller passes enforced: false', () => {
        const result = buildGovernanceAttestation({
            enforced: false, // caller cannot override
            authority: 'warehouse',
            subjectRef: 'sp-hash-xyz',
            requestId: 'srv-1',
        });
        expect(result.enforced).toBe(true);
    });

    test('always emits enforced: true even when caller passes "enforced: 1"', () => {
        const result = buildGovernanceAttestation({
            enforced: 1,
            authority: 'warehouse',
            subjectRef: 'sp',
            requestId: 'r',
        });
        expect(result.enforced).toBe(true);
    });
});

describe('buildGovernanceAttestation — production mock rejection', () => {
    test('rejects authority="mock" when NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';
        expect(() => buildGovernanceAttestation({
            authority: 'mock',
            subjectRef: 'u',
            requestId: 'r',
        })).toThrow(/mock.*production/i);
    });

    test('accepts authority="mock" when NODE_ENV=development', () => {
        process.env.NODE_ENV = 'development';
        const result = buildGovernanceAttestation({
            authority: 'mock',
            subjectRef: 'u',
            requestId: 'r',
        });
        expect(result.authority).toBe('mock');
    });

    test('accepts authority="mock" when NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';
        const result = buildGovernanceAttestation({
            authority: 'mock',
            subjectRef: 'u',
            requestId: 'r',
        });
        expect(result.authority).toBe('mock');
    });

    test('accepts authority="mock" when NODE_ENV is unset', () => {
        delete process.env.NODE_ENV;
        const result = buildGovernanceAttestation({
            authority: 'mock',
            subjectRef: 'u',
            requestId: 'r',
        });
        expect(result.authority).toBe('mock');
    });
});

describe('buildGovernanceAttestation — authority allowlist', () => {
    test('rejects unknown authority', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'rogue',
            subjectRef: 'u',
            requestId: 'r',
        })).toThrow(/authority/);
    });

    test('rejects non-string authority', () => {
        expect(() => buildGovernanceAttestation({
            authority: 42,
            subjectRef: 'u',
            requestId: 'r',
        })).toThrow(/authority/);
    });

    test('rejects missing authority', () => {
        expect(() => buildGovernanceAttestation({
            subjectRef: 'u',
            requestId: 'r',
        })).toThrow(/authority/);
    });
});

describe('buildGovernanceAttestation — subjectRef / requestId sanitization', () => {
    test('sanitizes dangerous chars in subjectRef but preserves identity chars', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'user@org.com<script>alert(1)</script>',
            requestId: 'r',
        });
        // < > ( ) = ; ! are stripped; letters/at/period/slash kept
        expect(result.subjectRef).toBe('user@org.comscriptalert1/script');
    });

    test('sanitizes dangerous chars in requestId', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'req 123\n<bad>',
        });
        expect(result.requestId).toBe('req123bad');
    });

    test('truncates overly long subjectRef to 200 chars', () => {
        const long = 'x'.repeat(500);
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: long,
            requestId: 'r',
        });
        expect(result.subjectRef).toHaveLength(200);
    });

    test('throws on empty subjectRef after sanitization', () => {
        // Every char in this fixture is OUTSIDE the allowed charset
        // [A-Za-z0-9._:+@/-], so sanitization produces an empty string.
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: '<>!#$%^&*()',
            requestId: 'r',
        })).toThrow(/subjectRef.*empty/i);
    });

    test('throws on non-string subjectRef', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 123,
            requestId: 'r',
        })).toThrow(/subjectRef/);
    });

    test('throws on missing subjectRef', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            requestId: 'r',
        })).toThrow(/subjectRef/);
    });

    test('throws on missing requestId', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
        })).toThrow(/requestId/);
    });
});

describe('buildGovernanceAttestation — optional field validation', () => {
    test('throws on non-object sourceRef when present', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            sourceRef: 'main.finance.metrics',
        })).toThrow(/sourceRef/);
    });

    test('throws on array sourceRef when present', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            sourceRef: [],
        })).toThrow(/sourceRef/);
    });

    test('throws on negative rowLimitApplied', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            rowLimitApplied: -1,
        })).toThrow(/rowLimitApplied/);
    });

    test('throws on non-finite rowLimitApplied', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            rowLimitApplied: Infinity,
        })).toThrow(/rowLimitApplied/);
    });

    test('throws on non-boolean columnPolicyApplied', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            columnPolicyApplied: 'yes',
        })).toThrow(/columnPolicyApplied/);
    });

    test('throws on non-boolean cacheHit', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            cacheHit: 1,
        })).toThrow(/cacheHit/);
    });
});

describe('buildGovernanceAttestation — costEstimate validation', () => {
    test('throws on unknown cost unit', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit: 'rogue', value: 100 },
        })).toThrow(/costEstimate\.unit/);
    });

    test('throws on negative cost value', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit: 'usd', value: -0.01 },
        })).toThrow(/costEstimate\.value/);
    });

    test('throws on non-finite cost value', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit: 'rows-scanned', value: Infinity },
        })).toThrow(/costEstimate\.value/);
    });

    test('throws on non-object costEstimate', () => {
        expect(() => buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: 'free',
        })).toThrow(/costEstimate/);
    });
});

describe('buildGovernanceAttestation — output is frozen', () => {
    test('top-level attestation is frozen', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
        });
        expect(Object.isFrozen(result)).toBe(true);
    });

    test('nested costEstimate is frozen', () => {
        const result = buildGovernanceAttestation({
            authority: 'unity-catalog',
            subjectRef: 'u',
            requestId: 'r',
            costEstimate: { unit: 'usd', value: 42 },
        });
        expect(Object.isFrozen(result.costEstimate)).toBe(true);
    });
});

describe('buildGovernanceAttestation — non-object input', () => {
    test.each([
        ['null',      null],
        ['undefined', undefined],
        ['number',    42],
        ['string',    'authority'],
        ['array',     []],
    ])('throws on %s input', (_label, input) => {
        expect(() => buildGovernanceAttestation(input)).toThrow(/input object/i);
    });
});
