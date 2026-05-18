// playground/src/components/ValidationGates.ts

import { VerifiedArtifact, ArtifactStatus } from '../types/assistant';

export class ValidationGates {
    static validate(artifact: Partial<VerifiedArtifact>): VerifiedArtifact {
        // Grounded check for Chart/Table - must have SQL/Data citation
        if (['Chart', 'Table'].includes(artifact.type || '')) {
            if (!artifact.sqlCitation && !artifact.dataCitation) {
                return {
                    ...artifact,
                    id: artifact.id || crypto.randomUUID(),
                    type: artifact.type as any,
                    content: artifact.content,
                    status: 'Blocked' as ArtifactStatus,
                    reasoning: 'Ungrounded artifact: Missing SQL or data citation.'
                } as VerifiedArtifact;
            }
        }
        
        // Add more rigorous validation later
        return {
            ...artifact,
            id: artifact.id || crypto.randomUUID(),
            type: artifact.type || 'Answer',
            content: artifact.content,
            status: artifact.status || 'Verified'
        } as VerifiedArtifact;
    }
}
