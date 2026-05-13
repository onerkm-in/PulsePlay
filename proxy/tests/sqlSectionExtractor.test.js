'use strict';

/**
 * sqlSectionExtractor.test.js — Phase B.
 *
 * Exercises the SQL section extractor against canonical labelled-SQL
 * shapes the Genie + Foundation Model translators emit + a few hostile
 * inputs (malformed markers, no markers, empty input).
 */

const { extractSqlSections, annotateAgainstIR } = require('../lib/sqlSectionExtractor');

describe('extractSqlSections — happy paths', () => {
    test('extracts canonical CTE-labelled SQL with /* Section: X */ markers', () => {
        const sql = `
WITH
  /* Section: HEADLINE */
  headline_kpi AS (
    SELECT AVG(otif_pct) AS otif_avg FROM fct_otif_weekly
  ),

  /* Section: TRENDS */
  trends_series AS (
    SELECT week, AVG(otif_pct) FROM fct_otif_weekly GROUP BY week
  ),

  /* Section: RISKS */
  regional_gap AS (
    SELECT region FROM fct_otif_weekly WHERE otif_pct < 0.9
  )
SELECT * FROM headline_kpi;
`;
        const sections = extractSqlSections(sql);
        expect(sections).toHaveLength(3);
        expect(sections[0].sectionId).toBe('HEADLINE');
        expect(sections[0].cteName).toBe('headline_kpi');
        expect(sections[0].sqlFragment).toMatch(/AVG\(otif_pct\)/);
        expect(sections[1].sectionId).toBe('TRENDS');
        expect(sections[1].cteName).toBe('trends_series');
        expect(sections[2].sectionId).toBe('RISKS');
        expect(sections[2].cteName).toBe('regional_gap');
    });

    test('extracts -- line-comment markers', () => {
        const sql = `
-- section: HEADLINE
SELECT 1 AS h;

-- Section: TRENDS
SELECT 2 AS t;
`;
        const sections = extractSqlSections(sql);
        expect(sections).toHaveLength(2);
        expect(sections[0].sectionId).toBe('HEADLINE');
        expect(sections[1].sectionId).toBe('TRENDS');
    });

    test('case-insensitive on the word "section"', () => {
        const sql = `/* SECTION: HEADLINE */ select 1;`;
        const sections = extractSqlSections(sql);
        expect(sections[0].sectionId).toBe('HEADLINE');
    });

    test('section IDs are uppercased in the output regardless of source case', () => {
        const sql = `/* Section: headline */ /* Section: TRENDS */`;
        const sections = extractSqlSections(sql);
        expect(sections.map(s => s.sectionId)).toEqual(['HEADLINE', 'TRENDS']);
    });

    test('sqlFragment captures content between adjacent markers', () => {
        const sql = `
/* Section: A */
SELECT 1;
/* Section: B */
SELECT 2;
`;
        const sections = extractSqlSections(sql);
        expect(sections[0].sqlFragment).toContain('SELECT 1');
        expect(sections[0].sqlFragment).not.toContain('SELECT 2');
        expect(sections[1].sqlFragment).toContain('SELECT 2');
    });

    test('startOffset reports the marker position in the source', () => {
        const sql = 'WITH /* Section: HEADLINE */ x AS (SELECT 1)';
        const sections = extractSqlSections(sql);
        expect(sections[0].startOffset).toBe(sql.indexOf('/* Section'));
    });

    test('handles markers without a following CTE — cteName=null', () => {
        const sql = `
/* Section: FOOTER */
SELECT 1, 2, 3;
`;
        const sections = extractSqlSections(sql);
        expect(sections[0].cteName).toBeNull();
    });
});

describe('extractSqlSections — defensive', () => {
    test('returns [] for empty / non-string / no-marker input', () => {
        expect(extractSqlSections('')).toEqual([]);
        // @ts-expect-error — testing non-string input
        expect(extractSqlSections(null)).toEqual([]);
        // @ts-expect-error
        expect(extractSqlSections(undefined)).toEqual([]);
        expect(extractSqlSections('SELECT 1 FROM t;')).toEqual([]);
    });

    test('ignores markers whose section ID violates the regex', () => {
        const sql = `/* Section: bad name with spaces */ SELECT 1; /* Section: VALID */ SELECT 2;`;
        const sections = extractSqlSections(sql);
        // Only VALID survives; "bad name with spaces" fails [A-Z0-9_-]+
        expect(sections.map(s => s.sectionId)).toEqual(['VALID']);
    });

    test('handles single trailing marker (no following CTE/SQL)', () => {
        const sql = `SELECT 1; /* Section: SUMMARY */`;
        const sections = extractSqlSections(sql);
        expect(sections).toHaveLength(1);
        expect(sections[0].sectionId).toBe('SUMMARY');
        expect(sections[0].cteName).toBeNull();
    });

    test('allows underscores and hyphens in section IDs', () => {
        const sql = `/* Section: top-level_kpi */ select 1;`;
        const sections = extractSqlSections(sql);
        expect(sections[0].sectionId).toBe('TOP-LEVEL_KPI');
    });
});

describe('annotateAgainstIR', () => {
    test('reports unexpected sections that the IR did not declare', () => {
        const sql = `/* Section: HEADLINE */ select 1; /* Section: MYSTERY */ select 2;`;
        const sections = extractSqlSections(sql);
        const result = annotateAgainstIR(sections, {
            sections: [{ id: 'HEADLINE' }, { id: 'TRENDS' }],
        });
        expect(result.coverage.missing).toEqual(['TRENDS']);
        expect(result.coverage.unexpected).toEqual(['MYSTERY']);
    });

    test('matches each section to its IR spec entry', () => {
        const sql = `/* Section: HEADLINE */ select 1;`;
        const sections = extractSqlSections(sql);
        const result = annotateAgainstIR(sections, {
            sections: [{ id: 'HEADLINE', required: true, hint: 'One sentence.' }],
        });
        expect(result.annotated[0].matchedSpec).toEqual({ id: 'HEADLINE', required: true, hint: 'One sentence.' });
    });

    test('returns empty coverage when no IR spec provided', () => {
        const sql = `/* Section: HEADLINE */ select 1;`;
        const sections = extractSqlSections(sql);
        const result = annotateAgainstIR(sections);
        expect(result.coverage.missing).toEqual([]);
        expect(result.coverage.unexpected).toEqual(['HEADLINE']);
    });

    test('uppercase comparison for section ID matching', () => {
        const sql = `/* Section: HEADLINE */ select 1;`;
        const sections = extractSqlSections(sql);
        // IR has lowercase id; should still match.
        const result = annotateAgainstIR(sections, { sections: [{ id: 'headline' }] });
        expect(result.annotated[0].matchedSpec).toEqual({ id: 'headline' });
        expect(result.coverage.missing).toEqual([]);
        expect(result.coverage.unexpected).toEqual([]);
    });
});
