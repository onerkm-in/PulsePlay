// playground/src/components/workbench/GenieNativeEmbed.tsx
//
// Native Embed renderer for the Unified Workbench.
//
// Renders Databricks Genie's published iframe (Embed Genie preview) inside
// the workbench. The sandbox is intentionally narrower than the BI-axis
// adapter's: assistant-axis embeds do not need forms or popups; clipboard
// access is granted via the `allow` attribute instead of opening the sandbox.
//
// Step 2 of the Unified Ask Pulse Workbench build sequence.
// See: docs/UNIFIED_ASK_PULSE_WORKBENCH.md and docs/adr/0008-...

import React from 'react';
import type { AssistantConnectorDescriptor } from '../../types/assistant';

export interface GenieNativeEmbedProps {
    /**
     * Connector descriptor. The component reads `nativeEmbedUrl` and renders
     * an empty state when it is absent. Does NOT trust the descriptor for
     * security posture; the sandbox is hard-coded.
     */
    readonly descriptor: AssistantConnectorDescriptor;
    /** Optional iframe title for assistive technologies. */
    readonly title?: string;
    /** Optional inline style overrides for the iframe container. */
    readonly style?: React.CSSProperties;
}

/**
 * Narrow sandbox for assistant-axis embeds. Intentionally tighter than the
 * BI-axis Genie adapter (`allow-forms allow-popups` are excluded). If a
 * future Embed Genie feature requires a token, add it with a comment
 * explaining why.
 */
export const GENIE_NATIVE_EMBED_SANDBOX = 'allow-scripts allow-same-origin';

/** Permissions policy for the iframe. Clipboard-write only. */
export const GENIE_NATIVE_EMBED_ALLOW = 'clipboard-write';

export const GenieNativeEmbed: React.FC<GenieNativeEmbedProps> = ({ descriptor, title, style }) => {
    if (descriptor.connectorType !== 'genie') {
        return (
            <div
                role="status"
                className="workbench-native-embed-empty"
                data-testid="genie-native-embed-wrong-connector"
            >
                Native chat embed is only available for Databricks Genie connectors.
            </div>
        );
    }

    if (!descriptor.capabilities.supportsNativeChatEmbed) {
        return (
            <div
                role="status"
                className="workbench-native-embed-empty"
                data-testid="genie-native-embed-no-capability"
            >
                This connector does not advertise a native chat embed.
            </div>
        );
    }

    const url = descriptor.nativeEmbedUrl;
    if (!url || !url.trim()) {
        return (
            <div
                role="status"
                className="workbench-native-embed-empty"
                data-testid="genie-native-embed-no-url"
            >
                Add the Embed Genie iframe URL in Settings to render the native chat surface.
            </div>
        );
    }

    return (
        <iframe
            src={url}
            title={title ?? `${descriptor.displayName ?? descriptor.profile} — Native Genie Chat`}
            className="workbench-native-embed-frame"
            data-testid="genie-native-embed-frame"
            sandbox={GENIE_NATIVE_EMBED_SANDBOX}
            allow={GENIE_NATIVE_EMBED_ALLOW}
            style={{ width: '100%', height: '100%', border: 'none', ...style }}
        />
    );
};
