// playground/src/types/assistant.ts

export type AssistantMode = 'nativeEmbed' | 'pulsePlayVerified' | 'hybrid';

export interface ConnectorCapabilities {
    supportsNativeEmbed: boolean;
    supportsVerifiedArtifacts: boolean;
    supportsHybrid: boolean;
    supportsStreaming: boolean;
    requiresValidationGate: boolean;
}

export type ArtifactStatus = 'Verified' | 'Grounded draft' | 'Suggestion' | 'Blocked';

export interface VerifiedArtifact {
    id: string;
    type: 'Answer' | 'Chart' | 'Table' | 'SQL' | 'Evidence' | 'Reasoning';
    content: any; // ECharts definition, data array, markdown, etc.
    status: ArtifactStatus;
    sqlCitation?: string;
    dataCitation?: string;
    executionTimeMs?: number;
    rowCount?: number;
}
