// playground/src/lib/__tests__/connectorCapabilities.test.ts
//
// Unified Ask Pulse Workbench — capability matrix + mode resolver invariants.
//
// These tests lock the contract for Step 1 of the workbench build sequence.
// Every change to the matrix or the resolver must come with an updated test.

import { describe, expect, it } from 'vitest';
import {
    CONNECTOR_CAPABILITIES,
    capabilitiesForConnector,
    connectorsMatching,
    resolveAssistantMode,
    supportedModes,
} from '../connectorCapabilities';
import {
    ASSISTANT_MODE_FIDELITY,
    CONNECTOR_TYPES,
    type AssistantMode,
    type ConnectorCapabilities,
    type ConnectorType,
} from '../../types/assistant';

// ─────────────────────────────────────────────────────────────────────────
// Matrix exhaustiveness + immutability
// ─────────────────────────────────────────────────────────────────────────

describe('CONNECTOR_CAPABILITIES — matrix exhaustiveness', () => {
    it('has one entry per known connector type', () => {
        for (const type of CONNECTOR_TYPES) {
            expect(CONNECTOR_CAPABILITIES[type]).toBeDefined();
        }
        // No extras in the matrix that aren't in the registry.
        const matrixKeys = Object.keys(CONNECTOR_CAPABILITIES) as ConnectorType[];
        expect(new Set(matrixKeys)).toEqual(new Set(CONNECTOR_TYPES));
    });

    it('exposes the canonical 10 connector types', () => {
        expect(CONNECTOR_TYPES).toHaveLength(10);
        expect(CONNECTOR_TYPES).toContain('genie');
        expect(CONNECTOR_TYPES).toContain('supervisor-local');
        expect(CONNECTOR_TYPES).toContain('supervisor');
        expect(CONNECTOR_TYPES).toContain('foundation-model');
        expect(CONNECTOR_TYPES).toContain('openai-chat');
        expect(CONNECTOR_TYPES).toContain('openai-analytics');
        expect(CONNECTOR_TYPES).toContain('bedrock-rag');
        expect(CONNECTOR_TYPES).toContain('bedrock-direct');
        expect(CONNECTOR_TYPES).toContain('responses-agent');
        expect(CONNECTOR_TYPES).toContain('generic');
    });

    it('exposes capabilitiesForConnector for every type', () => {
        for (const type of CONNECTOR_TYPES) {
            const caps = capabilitiesForConnector(type);
            expect(caps).toBeDefined();
            expect(typeof caps.supportsNativeChatEmbed).toBe('boolean');
            expect(typeof caps.supportsVerifiedArtifacts).toBe('boolean');
            expect(typeof caps.supportsHybrid).toBe('boolean');
            expect(typeof caps.supportsStreamingReasoning).toBe('boolean');
            expect(typeof caps.supportsGroundedSql).toBe('boolean');
        }
    });

    it('matrix entries are frozen', () => {
        for (const type of CONNECTOR_TYPES) {
            const caps = CONNECTOR_CAPABILITIES[type];
            expect(Object.isFrozen(caps)).toBe(true);
        }
        expect(Object.isFrozen(CONNECTOR_CAPABILITIES)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-capability invariants
// ─────────────────────────────────────────────────────────────────────────

describe('CONNECTOR_CAPABILITIES — cross-capability invariants', () => {
    it('Hybrid always implies both Native Embed and Verified', () => {
        for (const type of CONNECTOR_TYPES) {
            const caps = CONNECTOR_CAPABILITIES[type];
            if (caps.supportsHybrid) {
                expect(caps.supportsNativeChatEmbed).toBe(true);
                expect(caps.supportsVerifiedArtifacts).toBe(true);
            }
        }
    });

    it('Grounded SQL implies Verified', () => {
        for (const type of CONNECTOR_TYPES) {
            const caps = CONNECTOR_CAPABILITIES[type];
            if (caps.supportsGroundedSql) {
                expect(caps.supportsVerifiedArtifacts).toBe(true);
            }
        }
    });

    it('Generic connector advertises no capabilities', () => {
        const caps = CONNECTOR_CAPABILITIES['generic'];
        expect(caps.supportsNativeChatEmbed).toBe(false);
        expect(caps.supportsVerifiedArtifacts).toBe(false);
        expect(caps.supportsHybrid).toBe(false);
        expect(caps.supportsStreamingReasoning).toBe(false);
        expect(caps.supportsGroundedSql).toBe(false);
    });

    it('Chat-only connectors never advertise Grounded SQL', () => {
        const chatOnly: ConnectorType[] = ['openai-chat', 'bedrock-rag', 'bedrock-direct'];
        for (const type of chatOnly) {
            expect(CONNECTOR_CAPABILITIES[type].supportsGroundedSql).toBe(false);
        }
    });

    it('Only Genie supports Hybrid today (single-vendor lock)', () => {
        const hybridConnectors = connectorsMatching((caps) => caps.supportsHybrid);
        expect(hybridConnectors).toEqual(['genie']);
    });

    it('Only Genie supports Native Chat Embed today (single-vendor lock)', () => {
        const nativeConnectors = connectorsMatching((caps) => caps.supportsNativeChatEmbed);
        expect(nativeConnectors).toEqual(['genie']);
    });

    it('All non-generic connectors advertise Verified artifacts', () => {
        for (const type of CONNECTOR_TYPES) {
            if (type === 'generic') continue;
            expect(CONNECTOR_CAPABILITIES[type].supportsVerifiedArtifacts).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Mode fidelity ordering
// ─────────────────────────────────────────────────────────────────────────

describe('ASSISTANT_MODE_FIDELITY', () => {
    it('orders hybrid > verified > native-embed', () => {
        expect(ASSISTANT_MODE_FIDELITY.hybrid).toBeGreaterThan(ASSISTANT_MODE_FIDELITY.verified);
        expect(ASSISTANT_MODE_FIDELITY.verified).toBeGreaterThan(ASSISTANT_MODE_FIDELITY['native-embed']);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// supportedModes — ordering + derivation
// ─────────────────────────────────────────────────────────────────────────

describe('supportedModes', () => {
    it('returns hybrid + verified + native-embed for Genie, fidelity-ordered', () => {
        const modes = supportedModes(CONNECTOR_CAPABILITIES['genie']);
        expect(modes).toEqual(['hybrid', 'verified', 'native-embed']);
    });

    it('returns [verified] for verified-only connectors', () => {
        for (const type of ['supervisor-local', 'supervisor', 'foundation-model', 'openai-chat', 'openai-analytics', 'bedrock-rag', 'bedrock-direct', 'responses-agent'] as ConnectorType[]) {
            const modes = supportedModes(CONNECTOR_CAPABILITIES[type]);
            expect(modes).toEqual(['verified']);
        }
    });

    it('returns [] for generic (no modes available)', () => {
        const modes = supportedModes(CONNECTOR_CAPABILITIES['generic']);
        expect(modes).toEqual([]);
    });

    it('excludes hybrid when supportsHybrid is true but native/verified is false', () => {
        // Synthetic capability shape — protects against matrix authoring mistakes
        // where someone sets supportsHybrid=true without the prerequisites.
        const broken: ConnectorCapabilities = Object.freeze({
            supportsNativeChatEmbed: false,
            supportsVerifiedArtifacts: true,
            supportsHybrid: true,
            supportsStreamingReasoning: false,
            supportsGroundedSql: false,
        });
        expect(supportedModes(broken)).toEqual(['verified']);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveAssistantMode — policy
// ─────────────────────────────────────────────────────────────────────────

describe('resolveAssistantMode — capability-only resolution', () => {
    it('Genie defaults to Hybrid (highest fidelity)', () => {
        const out = resolveAssistantMode({ capabilities: CONNECTOR_CAPABILITIES['genie'] });
        expect(out).toEqual({ mode: 'hybrid', reason: 'capability' });
    });

    it('Verified-only connector defaults to verified', () => {
        const out = resolveAssistantMode({ capabilities: CONNECTOR_CAPABILITIES['foundation-model'] });
        expect(out).toEqual({ mode: 'verified', reason: 'capability' });
    });

    it('Generic connector returns null with reason no-mode-available', () => {
        const out = resolveAssistantMode({ capabilities: CONNECTOR_CAPABILITIES['generic'] });
        expect(out).toEqual({ mode: null, reason: 'no-mode-available' });
    });
});

describe('resolveAssistantMode — preference', () => {
    it('respects a supported preference', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            preference: 'native-embed',
        });
        expect(out).toEqual({ mode: 'native-embed', reason: 'preference' });
    });

    it('respects verified preference on Genie', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            preference: 'verified',
        });
        expect(out).toEqual({ mode: 'verified', reason: 'preference' });
    });

    it('ignores an unsupported preference and falls back to capability default', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['foundation-model'],
            preference: 'hybrid',
        });
        // foundation-model does not support hybrid, so resolver falls back.
        expect(out).toEqual({ mode: 'verified', reason: 'capability' });
    });

    it('ignores any preference on generic and returns no-mode-available', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['generic'],
            preference: 'verified',
        });
        expect(out).toEqual({ mode: null, reason: 'no-mode-available' });
    });
});

describe('resolveAssistantMode — requireVerified', () => {
    it('Genie + requireVerified prefers hybrid (which supports verified)', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            requireVerified: true,
        });
        // Both hybrid and verified pass the filter; hybrid is highest fidelity.
        expect(out).toEqual({ mode: 'hybrid', reason: 'capability' });
    });

    it('Verified-only connector + requireVerified returns verified', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['openai-analytics'],
            requireVerified: true,
        });
        expect(out).toEqual({ mode: 'verified', reason: 'capability' });
    });

    it('generic + requireVerified returns null with reason forced-verified', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['generic'],
            requireVerified: true,
        });
        expect(out).toEqual({ mode: null, reason: 'forced-verified' });
    });
});

describe('resolveAssistantMode — requireNativeEmbed', () => {
    it('Genie + requireNativeEmbed prefers hybrid (which embeds native)', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            requireNativeEmbed: true,
        });
        expect(out).toEqual({ mode: 'hybrid', reason: 'capability' });
    });

    it('Genie + requireNativeEmbed + native-embed preference returns native-embed', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            requireNativeEmbed: true,
            preference: 'native-embed',
        });
        expect(out).toEqual({ mode: 'native-embed', reason: 'preference' });
    });

    it('foundation-model + requireNativeEmbed returns null with reason forced-native-embed', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['foundation-model'],
            requireNativeEmbed: true,
        });
        expect(out).toEqual({ mode: null, reason: 'forced-native-embed' });
    });
});

describe('resolveAssistantMode — combined constraints', () => {
    it('requireVerified + requireNativeEmbed on Genie returns hybrid (the only mode that satisfies both)', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['genie'],
            requireVerified: true,
            requireNativeEmbed: true,
        });
        expect(out).toEqual({ mode: 'hybrid', reason: 'capability' });
    });

    it('requireVerified + requireNativeEmbed on foundation-model returns null', () => {
        const out = resolveAssistantMode({
            capabilities: CONNECTOR_CAPABILITIES['foundation-model'],
            requireVerified: true,
            requireNativeEmbed: true,
        });
        // Filtered out by requireVerified? No, foundation-model supports verified.
        // But requireNativeEmbed removes verified (which doesn't embed native),
        // leaving nothing.
        expect(out).toEqual({ mode: null, reason: 'forced-native-embed' });
    });
});

// ─────────────────────────────────────────────────────────────────────────
// connectorsMatching helper
// ─────────────────────────────────────────────────────────────────────────

describe('connectorsMatching', () => {
    it('returns connectors whose capabilities match the predicate', () => {
        const verified = connectorsMatching((caps) => caps.supportsVerifiedArtifacts);
        expect(verified).toContain('genie');
        expect(verified).toContain('foundation-model');
        expect(verified).not.toContain('generic');
    });

    it('returns empty array when no connector matches', () => {
        const match = connectorsMatching(() => false);
        expect(match).toEqual([]);
    });

    it('passes the connector type as the second argument', () => {
        const seen: ConnectorType[] = [];
        connectorsMatching((_caps, type) => {
            seen.push(type);
            return false;
        });
        expect(new Set(seen)).toEqual(new Set(CONNECTOR_TYPES));
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Type-level sanity (compile-time guard via runtime probe)
// ─────────────────────────────────────────────────────────────────────────

describe('type registry stability', () => {
    it('AssistantMode literal set has exactly three members', () => {
        // If a future change adds or removes an assistant mode, this test
        // forces the author to update the fidelity table and the workbench
        // shell at the same time.
        const modes: AssistantMode[] = ['native-embed', 'verified', 'hybrid'];
        expect(Object.keys(ASSISTANT_MODE_FIDELITY).sort()).toEqual([...modes].sort());
    });
});
