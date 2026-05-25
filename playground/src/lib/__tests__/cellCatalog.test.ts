// playground/src/lib/__tests__/cellCatalog.test.ts
//
// Unit tests for the Cell Catalog registry and capability validators.
// Locks the contracts for named product cells like Power BI + Genie.

import { describe, expect, it } from 'vitest';
import {
    CELL_CATALOG,
    getCellEntry,
    matchActiveCell,
    auditCellCompliance,
} from '../cellCatalog';

describe('CELL_CATALOG — manifest structure and invariants', () => {
    it('has the canonical cells loaded', () => {
        expect(CELL_CATALOG).toHaveLength(5);
        
        const ids = CELL_CATALOG.map(c => c.id);
        expect(ids).toContain('powerbi-genie');
        expect(ids).toContain('tableau-foundation');
        expect(ids).toContain('qlik-bedrock');
        expect(ids).toContain('looker-supervisor');
        expect(ids).toContain('generic-iframe-responses');
    });

    it('every cell contains frozen required metadata', () => {
        CELL_CATALOG.forEach(cell => {
            expect(cell.id).toBeDefined();
            expect(cell.label).toBeDefined();
            expect(cell.surface.vendor).toBeDefined();
            expect(cell.assistant.profileType).toBeDefined();
            expect(cell.capabilities.required).toBeDefined();
            expect(Object.isFrozen(cell)).toBe(true);
        });
    });

    it('getCellEntry correctly retrieves cells by id', () => {
        const pbiGenie = getCellEntry('powerbi-genie');
        expect(pbiGenie).toBeDefined();
        expect(pbiGenie?.label).toBe('Power BI + Genie');

        const unknown = getCellEntry('non-existent');
        expect(unknown).toBeUndefined();
    });

    it('matchActiveCell correctly resolves active configurations', () => {
        const matched = matchActiveCell('powerbi', 'genie');
        expect(matched).toBeDefined();
        expect(matched?.id).toBe('powerbi-genie');

        const matchedTableau = matchActiveCell('tableau', 'foundation');
        expect(matchedTableau).toBeDefined();
        expect(matchedTableau?.id).toBe('tableau-foundation');

        const unmatched = matchActiveCell('powerbi', 'unknown-connector');
        expect(unmatched).toBeUndefined();
    });

    it('auditCellCompliance detects missing required capabilities', () => {
        const pbiGenie = getCellEntry('powerbi-genie')!;
        
        // Satisfy all required
        const audit1 = auditCellCompliance(pbiGenie, {
            'chat': true,
            'sectioned-chat': true,
            'trust-badges': true,
        });
        expect(audit1.conforms).toBe(true);
        expect(audit1.missingRequired).toHaveLength(0);

        // Missing sectioned-chat
        const audit2 = auditCellCompliance(pbiGenie, {
            'chat': true,
            'trust-badges': true,
        });
        expect(audit2.conforms).toBe(false);
        expect(audit2.missingRequired).toContain('sectioned-chat');
    });

    it('auditCellCompliance issues warnings for missing optional capabilities', () => {
        const pbiGenie = getCellEntry('powerbi-genie')!;
        
        // Satisfy all required and optional
        const audit1 = auditCellCompliance(pbiGenie, {
            'chat': true,
            'sectioned-chat': true,
            'trust-badges': true,
            'embed-token-server': true,
        });
        expect(audit1.conforms).toBe(true);
        expect(audit1.warnings).toHaveLength(0);

        // Missing optional capability
        const audit2 = auditCellCompliance(pbiGenie, {
            'chat': true,
            'sectioned-chat': true,
            'trust-badges': true,
        });
        expect(audit2.conforms).toBe(true);
        expect(audit2.warnings).toHaveLength(1);
        expect(audit2.warnings[0]).toContain('embed-token-server');
    });
});
