// playground/src/components/workbench/__tests__/GenieNativeEmbed.test.tsx
//
// Step 2 — GenieNativeEmbed component invariants.
// Follows the project convention of react-dom/client + act() rather than
// @testing-library (not a project dep).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import {
    GENIE_NATIVE_EMBED_ALLOW,
    GENIE_NATIVE_EMBED_SANDBOX,
    GenieNativeEmbed,
} from '../GenieNativeEmbed';
import type { AssistantConnectorDescriptor, ConnectorCapabilities } from '../../../types/assistant';
import { capabilitiesForConnector } from '../../../lib/connectorCapabilities';

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}

function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

let mounted: MountState | null = null;
beforeEach(() => { mounted = null; });
afterEach(() => { if (mounted) unmount(mounted); mounted = null; });

function genieDescriptor(overrides: Partial<AssistantConnectorDescriptor> = {}): AssistantConnectorDescriptor {
    return {
        profile: 'default',
        connectorType: 'genie',
        capabilities: capabilitiesForConnector('genie'),
        displayName: 'Default Genie',
        nativeEmbedUrl: 'https://workspace.example.databricks.com/embed/genie/space/abc',
        ...overrides,
    };
}

// ─── Rendering ─────────────────────────────────────────────────────────

describe('GenieNativeEmbed — happy path', () => {
    it('renders an iframe with the descriptor.nativeEmbedUrl', () => {
        mounted = mount(<GenieNativeEmbed descriptor={genieDescriptor()} />);
        const iframe = mounted.container.querySelector('iframe[data-testid="genie-native-embed-frame"]');
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute('src')).toBe('https://workspace.example.databricks.com/embed/genie/space/abc');
    });

    it('uses the narrow sandbox (no forms, no popups)', () => {
        mounted = mount(<GenieNativeEmbed descriptor={genieDescriptor()} />);
        const iframe = mounted.container.querySelector('iframe[data-testid="genie-native-embed-frame"]')!;
        expect(iframe.getAttribute('sandbox')).toBe(GENIE_NATIVE_EMBED_SANDBOX);
        expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
        // Hard lock: never allow-forms / allow-popups on the assistant-axis embed.
        expect(iframe.getAttribute('sandbox')).not.toContain('allow-forms');
        expect(iframe.getAttribute('sandbox')).not.toContain('allow-popups');
    });

    it('sets allow="clipboard-write"', () => {
        mounted = mount(<GenieNativeEmbed descriptor={genieDescriptor()} />);
        const iframe = mounted.container.querySelector('iframe[data-testid="genie-native-embed-frame"]')!;
        expect(iframe.getAttribute('allow')).toBe(GENIE_NATIVE_EMBED_ALLOW);
        expect(iframe.getAttribute('allow')).toBe('clipboard-write');
    });

    it('defaults the iframe title to the displayName + suffix', () => {
        mounted = mount(<GenieNativeEmbed descriptor={genieDescriptor({ displayName: 'Sales Space' })} />);
        const iframe = mounted.container.querySelector('iframe[data-testid="genie-native-embed-frame"]')!;
        expect(iframe.getAttribute('title')).toBe('Sales Space — Native Genie Chat');
    });

    it('honors an explicit title prop', () => {
        mounted = mount(<GenieNativeEmbed descriptor={genieDescriptor()} title="My Native Chat" />);
        const iframe = mounted.container.querySelector('iframe[data-testid="genie-native-embed-frame"]')!;
        expect(iframe.getAttribute('title')).toBe('My Native Chat');
    });
});

// ─── Empty states ──────────────────────────────────────────────────────

describe('GenieNativeEmbed — empty states', () => {
    it('renders wrong-connector empty state when descriptor is not Genie', () => {
        const desc: AssistantConnectorDescriptor = {
            profile: 'fm',
            connectorType: 'foundation-model',
            capabilities: capabilitiesForConnector('foundation-model'),
            nativeEmbedUrl: 'https://example/should-not-render',
        };
        mounted = mount(<GenieNativeEmbed descriptor={desc} />);
        expect(mounted.container.querySelector('[data-testid="genie-native-embed-wrong-connector"]')).not.toBeNull();
        expect(mounted.container.querySelector('iframe')).toBeNull();
    });

    it('renders no-capability empty state when supportsNativeChatEmbed is false (synthetic)', () => {
        const synthetic: ConnectorCapabilities = Object.freeze({
            supportsNativeChatEmbed: false,
            supportsVerifiedArtifacts: true,
            supportsHybrid: false,
            supportsStreamingReasoning: true,
            supportsGroundedSql: true,
        });
        const desc: AssistantConnectorDescriptor = {
            profile: 'genie-no-embed',
            connectorType: 'genie',
            capabilities: synthetic,
            nativeEmbedUrl: 'https://example/should-not-render',
        };
        mounted = mount(<GenieNativeEmbed descriptor={desc} />);
        expect(mounted.container.querySelector('[data-testid="genie-native-embed-no-capability"]')).not.toBeNull();
        expect(mounted.container.querySelector('iframe')).toBeNull();
    });

    it('renders no-url empty state when nativeEmbedUrl is missing', () => {
        const desc = genieDescriptor({ nativeEmbedUrl: undefined });
        mounted = mount(<GenieNativeEmbed descriptor={desc} />);
        expect(mounted.container.querySelector('[data-testid="genie-native-embed-no-url"]')).not.toBeNull();
        expect(mounted.container.querySelector('iframe')).toBeNull();
    });

    it('renders no-url empty state when nativeEmbedUrl is whitespace only', () => {
        const desc = genieDescriptor({ nativeEmbedUrl: '   ' });
        mounted = mount(<GenieNativeEmbed descriptor={desc} />);
        expect(mounted.container.querySelector('[data-testid="genie-native-embed-no-url"]')).not.toBeNull();
        expect(mounted.container.querySelector('iframe')).toBeNull();
    });
});
