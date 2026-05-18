// playground/src/components/UnifiedAssistantSurface.tsx

import React, { useState } from "react";
import { AssistantMode, ConnectorCapabilities } from "../types/assistant";

export const UnifiedAssistantSurface: React.FC<{
    selectedProfile: string;
    mode: AssistantMode;
    capabilities: ConnectorCapabilities;
}> = ({ selectedProfile, mode, capabilities }) => {

    const renderNativeEmbed = () => {
        // Placeholder for Databricks Genie iframe
        return <div className="native-genie-embed-placeholder"><p>Native Genie Iframe Embed</p></div>;
    };

    const renderVerified = () => {
        return <div className="pulseplay-verified-surface"><p>PulsePlay Verified Artifacts</p></div>;
    };

    const renderHybrid = () => {
        return (
            <div className="hybrid-surface">
                {renderNativeEmbed()}
                <div className="pulseplay-rails">
                    <p>PulsePlay Rails & Inspector</p>
                </div>
            </div>
        );
    };

    return (
        <div className="unified-assistant-workbench">
            {mode === 'nativeEmbed' && capabilities.supportsNativeEmbed && renderNativeEmbed()}
            {mode === 'pulsePlayVerified' && capabilities.supportsVerifiedArtifacts && renderVerified()}
            {mode === 'hybrid' && capabilities.supportsHybrid && renderHybrid()}
        </div>
    );
};
