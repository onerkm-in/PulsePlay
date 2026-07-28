/**
 * runtimeScopePrefix — the server-owned governance floor for NL→SQL.
 *
 * The property that matters most is PARITY: the server must emit the same text
 * the browser's buildRuntimeScopePrefix (genie.ts, Wave 22) emits for the same
 * config, or governance would differ by which client called. Wording is
 * asserted verbatim here; if it changes, genie.ts must change in the same
 * commit.
 */
'use strict';

const {
    GOVERNANCE_HEADER,
    buildServerScopePrefix,
    hasGovernancePrefix,
    applyServerScopePrefix,
    __internals,
} = require('../lib/runtimeScopePrefix');

const FULL_PROFILE = {
    runtimeForbiddenColumns: 'salary, ssn',
    runtimeMandatoryRowFilter: "region = 'EMEA'",
    runtimeReadOnlyEnforced: true,
    sqlCtePreamble: 'WITH scoped AS (SELECT * FROM t WHERE tenant = 1)',
    sqlForbiddenTables: 'hr.salaries',
    sqlRlsHintEnabled: true,
};

describe('buildServerScopePrefix — client parity (verbatim wording)', () => {
    test('forbidden columns clause matches the client text', () => {
        const p = buildServerScopePrefix({ runtimeForbiddenColumns: 'salary, ssn' });
        expect(p).toContain('[MANDATORY] DO NOT query, reference, or expose the following columns in any SQL or answer: salary, ssn.');
        expect(p.startsWith(GOVERNANCE_HEADER)).toBe(true);
        expect(p.endsWith('\n\n')).toBe(true);
    });

    test('row filter clause matches, including the AND alternative', () => {
        const p = buildServerScopePrefix({ runtimeMandatoryRowFilter: "region = 'EMEA'" });
        // Quotes survive: the row filter goes through sanitizeInstructionText
        // (quotes are legitimate in a WHERE clause) — matching the client, which
        // uses the same sanitizer for this field.
        expect(p).toContain("Every SQL query MUST include the filter: WHERE region = 'EMEA' (or AND region = 'EMEA' if there is already a WHERE clause).");
    });

    test('read-only clause matches', () => {
        const p = buildServerScopePrefix({ runtimeReadOnlyEnforced: true });
        expect(p).toContain('[MANDATORY] Only SELECT statements are permitted. Do NOT generate INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, or MERGE statements for any reason.');
    });

    test('forbidden tables clause matches', () => {
        const p = buildServerScopePrefix({ sqlForbiddenTables: 'hr.salaries' });
        expect(p).toContain('[MANDATORY] DO NOT reference or query the following tables/views in any SQL: hr.salaries.');
    });

    test('RLS hint appears only when a role is available', () => {
        expect(buildServerScopePrefix({ sqlRlsHintEnabled: true })).toBe('');
        const p = buildServerScopePrefix({ sqlRlsHintEnabled: true }, 'Supply Chain Planner');
        expect(p).toContain('[Context] Current viewer role: "Supply Chain Planner".');
    });

    test('numbered list, in the client\'s section order', () => {
        const p = buildServerScopePrefix(FULL_PROFILE, 'analyst');
        const order = ['1. [MANDATORY] DO NOT query', '2. [MANDATORY] Every SQL query', '3. [MANDATORY] Only SELECT', '4. [MANDATORY] You MUST use the following CTE preamble', '5. [MANDATORY] DO NOT reference', '6. [Context] Current viewer role'];
        let last = -1;
        for (const frag of order) {
            const i = p.indexOf(frag);
            expect(i).toBeGreaterThan(last);
            last = i;
        }
    });

    test('empty profile yields empty string, not an empty-shell header', () => {
        expect(buildServerScopePrefix({})).toBe('');
        expect(buildServerScopePrefix(null)).toBe('');
    });
});

describe('sanitizers — hostile input cannot ride the prefix', () => {
    test('identifier list rejects injection-shaped entries', () => {
        const cols = __internals.sanitizeIdentifierList('good_col, bad col; DROP TABLE x, `ok.col`', 2000);
        expect(cols).toEqual(['good_col', '`ok.col`']);
    });

    test('template role value strips SQL keywords and quotes', () => {
        const v = __internals.sanitizeTemplateValue("admin'; DROP TABLE users --");
        expect(v).not.toMatch(/DROP|;|'|--/);
    });

    test('{{role}} substitution uses the sanitized role', () => {
        const out = __internals.applyTemplateVars('WHERE owner = {{role}}', "x'; DELETE FROM t");
        expect(out).not.toMatch(/DELETE|'|;/);
    });

    test('{{year}} and {{currentDate}} substitute real values', () => {
        const out = __internals.applyTemplateVars('y={{year}} d={{currentDate}}', 'viewer');
        expect(out).toMatch(/y=\d{4} d=\d{4}-\d{2}-\d{2}/);
    });
});

describe('applyServerScopePrefix — never strips, never doubles', () => {
    test('client-applied prefix passes through verbatim', () => {
        const content = `${GOVERNANCE_HEADER}\n1. [MANDATORY] client rule\n\nWhat is OTIF?`;
        const r = applyServerScopePrefix({ content, profile: FULL_PROFILE, userRole: 'analyst' });
        expect(r.applied).toBe(false);
        expect(r.source).toBe('client');
        expect(r.content).toBe(content);
        expect(r.content.match(new RegExp('\\[Governance rules', 'g'))).toHaveLength(1);
    });

    test('bare content + governed profile gets the server floor', () => {
        const r = applyServerScopePrefix({ content: 'What is OTIF?', profile: FULL_PROFILE, userRole: 'analyst' });
        expect(r.applied).toBe(true);
        expect(r.source).toBe('server');
        expect(r.content.startsWith(GOVERNANCE_HEADER)).toBe(true);
        expect(r.content.endsWith('What is OTIF?')).toBe(true);
    });

    test('bare content + ungoverned profile is a no-op', () => {
        const r = applyServerScopePrefix({ content: 'What is OTIF?', profile: { host: 'x' } });
        expect(r.applied).toBe(false);
        expect(r.source).toBe('none');
        expect(r.content).toBe('What is OTIF?');
    });

    test('non-string content never throws', () => {
        expect(applyServerScopePrefix({ content: undefined, profile: FULL_PROFILE }).content).toContain(GOVERNANCE_HEADER);
        expect(applyServerScopePrefix({ content: null, profile: {} }).content).toBe('');
    });

    test('hasGovernancePrefix detects the header anywhere in the content', () => {
        expect(hasGovernancePrefix(`intro\n${GOVERNANCE_HEADER}\nrules`)).toBe(true);
        expect(hasGovernancePrefix('no rules here')).toBe(false);
        expect(hasGovernancePrefix(null)).toBe(false);
    });
});
