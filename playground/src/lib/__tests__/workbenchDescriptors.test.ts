// playground/src/lib/__tests__/workbenchDescriptors.test.ts
//
// Step 2 — descriptor builder invariants.

import { describe, it, expect } from 'vitest';
import {
    buildConnectorDescriptor,
    buildGenieDescriptor,
} from '../workbenchDescriptors';
import { capabilitiesForConnector } from '../connectorCapabilities';
import { CONNECTOR_TYPES, type ConnectorType } from '../../types/assistant';

// ─── buildGenieDescriptor ──────────────────────────────────────────────

describe('buildGenieDescriptor', () => {
    it('attaches Genie capabilities from the matrix', () => {
        const desc = buildGenieDescriptor({ profile: 'default' });
        expect(desc.capabilities).toEqual(capabilitiesForConnector('genie'));
        expect(desc.connectorType).toBe('genie');
        expect(desc.profile).toBe('default');
    });

    it('resolves nativeEmbedUrl from a direct url field', () => {
        const desc = buildGenieDescriptor({
            profile: 'p',
            embed: { url: 'https://workspace.example/embed/genie/space/abc' },
        });
        expect(desc.nativeEmbedUrl).toBe('https://workspace.example/embed/genie/space/abc');
    });

    it('resolves nativeEmbedUrl from an iframe html snippet', () => {
        const desc = buildGenieDescriptor({
            profile: 'p',
            embed: { iframe: '<iframe src="https://workspace.example/embed/genie/space/xyz" allow="clipboard-write"></iframe>' },
        });
        expect(desc.nativeEmbedUrl).toBe('https://workspace.example/embed/genie/space/xyz');
    });

    it('resolves nativeEmbedUrl from workspaceUrl + spaceId + embedPath', () => {
        const desc = buildGenieDescriptor({
            profile: 'p',
            embed: {
                workspaceUrl: 'https://workspace.example/',
                spaceId: 'abc',
                embedPath: '/embed/genie/space/{spaceId}',
            },
        });
        expect(desc.nativeEmbedUrl).toBe('https://workspace.example/embed/genie/space/abc');
    });

    it('omits nativeEmbedUrl when no embed config is supplied', () => {
        const desc = buildGenieDescriptor({ profile: 'p' });
        expect(desc.nativeEmbedUrl).toBeUndefined();
    });

    it('omits nativeEmbedUrl when the embed config is unresolvable (does not throw)', () => {
        const desc = buildGenieDescriptor({
            profile: 'p',
            embed: { workspaceUrl: 'https://workspace.example' /* no spaceId / embedPath */ },
        });
        expect(desc.nativeEmbedUrl).toBeUndefined();
    });

    it('decodes ampersand entities in iframe src (parity with bi-adapter)', () => {
        const desc = buildGenieDescriptor({
            profile: 'p',
            embed: { iframe: '<iframe src="https://workspace.example/embed/genie/space/abc?foo=1&amp;bar=2"></iframe>' },
        });
        expect(desc.nativeEmbedUrl).toBe('https://workspace.example/embed/genie/space/abc?foo=1&bar=2');
    });

    it('propagates displayName', () => {
        const desc = buildGenieDescriptor({ profile: 'p', displayName: 'Sales Genie' });
        expect(desc.displayName).toBe('Sales Genie');
    });
});

// ─── buildConnectorDescriptor ──────────────────────────────────────────

describe('buildConnectorDescriptor', () => {
    it('returns matrix capabilities for every connector type', () => {
        for (const type of CONNECTOR_TYPES) {
            const desc = buildConnectorDescriptor({ profile: 'x', connectorType: type });
            expect(desc.capabilities).toEqual(capabilitiesForConnector(type));
            expect(desc.connectorType).toBe(type);
        }
    });

    it('attaches nativeEmbedUrl only for connectors that support native chat embed', () => {
        const url = 'https://workspace.example/embed/genie/space/abc';
        for (const type of CONNECTOR_TYPES) {
            const desc = buildConnectorDescriptor({ profile: 'x', connectorType: type, nativeEmbedUrl: url });
            if (capabilitiesForConnector(type).supportsNativeChatEmbed) {
                expect(desc.nativeEmbedUrl).toBe(url);
            } else {
                expect(desc.nativeEmbedUrl).toBeUndefined();
            }
        }
    });

    it('does not invent a nativeEmbedUrl when none is supplied even for capable connectors', () => {
        const desc = buildConnectorDescriptor({ profile: 'g', connectorType: 'genie' });
        expect(desc.nativeEmbedUrl).toBeUndefined();
    });

    it('preserves displayName', () => {
        const desc = buildConnectorDescriptor({
            profile: 'fm',
            connectorType: 'foundation-model',
            displayName: 'Llama 3.1 405B',
        });
        expect(desc.displayName).toBe('Llama 3.1 405B');
    });

    // Defensive guard: a connector that is not in the registry should produce
    // a runtime failure rather than a silent undefined-capabilities descriptor.
    it('throws when handed an unknown connector type', () => {
        expect(() => buildConnectorDescriptor({
            profile: 'x',
            connectorType: 'totally-made-up' as ConnectorType,
        })).toThrow();
    });
});
