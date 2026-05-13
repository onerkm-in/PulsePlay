'use strict';

/**
 * promptIR.test.js — Phase 11a.
 *
 * Exercises the Prompt IR loader, schema validator, and synthetic-IR
 * builder against:
 *   - The real `pulsepacks/cpg-fmcg/sub-verticals/supply-chain/prompt-ir.yaml`
 *     (ships with the project — covers the canonical authored happy path).
 *   - A real legacy `prompt-context.md` (cpg-fmcg/sustainability) which
 *     should fall through to a synthetic IR.
 *   - Synthetic packs roots written to a tmp directory for JSON parity,
 *     malformed-YAML, validation-failure, and missing-pack cases.
 *
 * Mirrors the patterns established in packPromptLoader.test.js (real fs
 * over fs mocks; cache reset between tests).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    loadIR,
    validateIR,
    buildSyntheticIR,
    __rebuildIRCache,
    SUPPORTED_SCHEMA_VERSIONS,
    DEFAULT_PACKS_ROOT,
} = require('../lib/promptIR');

// Suppress log() calls plumbed through from the loader so console stays clean.
const _logSink = jest.fn();

beforeEach(() => {
    __rebuildIRCache();
    _logSink.mockClear();
});

// ── tmp-packs helper ─────────────────────────────────────────────────────────
function makeTmpPacksRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pulseplay-ir-test-'));
}

function writePackFile(root, relPath, content) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
}

function rmrf(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

/* ─── validateIR ──────────────────────────────────────────────────────── */

describe('validateIR — schema validation', () => {
    test('flags non-object input', () => {
        expect(validateIR(null)).toEqual(['IR must be an object']);
        expect(validateIR('string')).toEqual(['IR must be an object']);
        expect(validateIR(42)).toEqual(['IR must be an object']);
        expect(validateIR([])).toEqual(['IR must be an object']);
    });

    test('flags missing/invalid schemaVersion', () => {
        const ir = { id: 'a/b', schemaVersion: 99 };
        const problems = validateIR(ir);
        expect(problems.some(p => p.includes('schemaVersion'))).toBe(true);
    });

    test('flags missing id', () => {
        const ir = { schemaVersion: 1 };
        const problems = validateIR(ir);
        expect(problems.some(p => p.includes('id'))).toBe(true);
    });

    test('accepts minimal valid IR', () => {
        expect(validateIR({ schemaVersion: 1, id: 'a/b' })).toEqual([]);
    });

    test('flags non-string role.persona', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            role: { persona: 42 },
        });
        expect(problems.some(p => p.includes('role.persona'))).toBe(true);
    });

    test('flags unknown task.kind', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            task: { kind: 'mystery-task' },
        });
        expect(problems.some(p => p.includes('task.kind'))).toBe(true);
    });

    test('accepts all valid task.kind values', () => {
        for (const kind of ['answer-grounded', 'summarise', 'recommend', 'classify', 'execute-sql']) {
            expect(validateIR({ schemaVersion: 1, id: 'a/b', task: { kind } })).toEqual([]);
        }
    });

    test('flags vocabulary items missing required fields', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            vocabulary: [{ definition: 'no term' }],
        });
        expect(problems.some(p => p.includes('vocabulary[0]') && p.includes('term'))).toBe(true);
    });

    test('flags vocabulary direction values outside the allowed set', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            vocabulary: [{ term: 'x', definition: 'y', direction: 'sideways' }],
        });
        expect(problems.some(p => p.includes('direction'))).toBe(true);
    });

    test('accepts vocabulary with all valid direction values', () => {
        for (const direction of ['higher-is-better', 'lower-is-better', 'target', 'context-dependent']) {
            expect(validateIR({
                schemaVersion: 1, id: 'a/b',
                vocabulary: [{ term: 'x', definition: 'y', direction }],
            })).toEqual([]);
        }
    });

    test('flags function names outside the identifier regex', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            functions: [{ name: '9bad', description: 'starts with digit' }],
        });
        expect(problems.some(p => p.includes('functions[0]') && p.includes('name'))).toBe(true);
    });

    test('flags guardrails non-string entries', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            guardrails: { must: ['ok', 42], mustNot: [{ rule: 'no' }] },
        });
        expect(problems.some(p => p.includes('guardrails.must[1]'))).toBe(true);
        expect(problems.some(p => p.includes('guardrails.mustNot[0]'))).toBe(true);
    });

    test('flags invalid output.format', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            output: { format: 'unknown' },
        });
        expect(problems.some(p => p.includes('output.format'))).toBe(true);
    });

    test('flags output.sections missing id', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            output: { format: 'structured-sections', sections: [{ maxChars: 100 }] },
        });
        expect(problems.some(p => p.includes('sections[0]') && p.includes('id'))).toBe(true);
    });

    test('flags output.sections.maxChars not a positive number', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            output: { format: 'structured-sections', sections: [{ id: 'X', maxChars: -5 }] },
        });
        expect(problems.some(p => p.includes('maxChars'))).toBe(true);
    });

    test('flags example items missing q or a', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            examples: [{ q: 'question only' }],
        });
        expect(problems.some(p => p.includes('examples[0]') && p.includes('a is required'))).toBe(true);
    });

    test('flags overrides values that are not objects', () => {
        const problems = validateIR({
            schemaVersion: 1, id: 'a/b',
            overrides: { genie: 'a string' },
        });
        expect(problems.some(p => p.includes('overrides.genie'))).toBe(true);
    });

    test('SUPPORTED_SCHEMA_VERSIONS exposes the supported set', () => {
        expect(SUPPORTED_SCHEMA_VERSIONS instanceof Set).toBe(true);
        expect(SUPPORTED_SCHEMA_VERSIONS.has(1)).toBe(true);
    });
});

/* ─── loadIR — authored YAML (real cpg-fmcg pack) ─────────────────────── */

describe('loadIR — real cpg-fmcg/supply-chain (authored YAML)', () => {
    test('loads + validates the project-shipped prompt-ir.yaml', () => {
        const ir = loadIR('cpg-fmcg', 'supply-chain', { log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.schemaVersion).toBe(1);
        expect(ir.id).toBe('cpg-fmcg/supply-chain');
        expect(ir.role?.persona).toMatch(/supply chain/i);
        expect(Array.isArray(ir.vocabulary)).toBe(true);
        expect(ir.vocabulary.find(v => v.term === 'OTIF')).toBeTruthy();
        expect(Array.isArray(ir.functions)).toBe(true);
        expect(ir.functions.find(f => f.name === 'compute_kpi')).toBeTruthy();
        expect(ir.meta?.synthetic).toBeFalsy();
        expect(validateIR(ir)).toEqual([]);
    });

    test('DEFAULT_PACKS_ROOT points at the project pulsepacks/ directory', () => {
        expect(DEFAULT_PACKS_ROOT).toMatch(/pulsepacks$/);
        expect(fs.existsSync(DEFAULT_PACKS_ROOT)).toBe(true);
    });
});

/* ─── loadIR — synthetic IR (legacy markdown) ─────────────────────────── */

describe('loadIR — synthetic IR built from legacy markdown', () => {
    // Note: when this test file was first written (Phase 11a) we exercised the
    // synthetic-IR path against the real cpg-fmcg/sustainability pack, which
    // shipped with prompt-context.md but no authored YAML. In a later cycle
    // (batch 3 of the 9-IR closure) every cpg-fmcg sub-vertical received an
    // authored prompt-ir.yaml, so the real fixtures no longer trigger the
    // synthetic fallback. These tests now use a tmp packs root with markdown
    // ONLY so the synthetic IR path stays under regression coverage.

    let tmpRoot;
    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('sub-vertical without prompt-ir.yaml → synthetic IR with legacy preamble', () => {
        const markdown = '# Synthetic context test\n\nSome curated prose long enough to clear the 20-char floor.';
        writePackFile(tmpRoot, 'mypack/sub-verticals/sv/prompt-context.md', markdown);
        const ir = loadIR('mypack', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.meta?.synthetic).toBe(true);
        expect(typeof ir?.overrides?.genie?.legacyPreamble).toBe('string');
        expect(ir.overrides.genie.legacyPreamble.length).toBeGreaterThan(20);
        expect(ir.id).toBe('mypack/sv');
    });

    test('synthetic IR carries source file path in meta', () => {
        writePackFile(tmpRoot, 'mypack/sub-verticals/sv/prompt-context.md', '# context');
        const ir = loadIR('mypack', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.meta.sourceFile).toMatch(/sv[\\/]prompt-context\.md$/);
    });
});

/* ─── loadIR — JSON parity ────────────────────────────────────────────── */

describe('loadIR — YAML/JSON parity', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('YAML and JSON produce identical IR shapes for the same content', () => {
        const yamlText = [
            'schemaVersion: 1',
            'id: parity/test',
            'role:',
            '  persona: "test persona"',
            'vocabulary:',
            '  - term: KPI',
            '    definition: "Key Performance Indicator."',
            '    direction: higher-is-better',
        ].join('\n');
        const jsonText = JSON.stringify({
            schemaVersion: 1,
            id: 'parity/test',
            role: { persona: 'test persona' },
            vocabulary: [{ term: 'KPI', definition: 'Key Performance Indicator.', direction: 'higher-is-better' }],
        });

        writePackFile(tmpRoot, 'parity/sub-verticals/test/prompt-ir.yaml', yamlText);
        const fromYaml = loadIR('parity', 'test', { packsRoot: tmpRoot, log: _logSink });
        expect(fromYaml).not.toBeNull();

        __rebuildIRCache();
        rmrf(path.join(tmpRoot, 'parity/sub-verticals/test/prompt-ir.yaml'));
        writePackFile(tmpRoot, 'parity/sub-verticals/test/prompt-ir.json', jsonText);
        const fromJson = loadIR('parity', 'test', { packsRoot: tmpRoot, log: _logSink });
        expect(fromJson).not.toBeNull();

        expect(fromJson.schemaVersion).toBe(fromYaml.schemaVersion);
        expect(fromJson.id).toBe(fromYaml.id);
        expect(fromJson.role).toEqual(fromYaml.role);
        expect(fromJson.vocabulary).toEqual(fromYaml.vocabulary);
    });

    test('YAML wins when both files exist (precedence)', () => {
        writePackFile(tmpRoot, 'both/sub-verticals/sv/prompt-ir.yaml', 'schemaVersion: 1\nid: from-yaml\n');
        writePackFile(tmpRoot, 'both/sub-verticals/sv/prompt-ir.json', JSON.stringify({ schemaVersion: 1, id: 'from-json' }));
        const ir = loadIR('both', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir.id).toBe('from-yaml');
    });

    test('JSON-only pack loads from JSON', () => {
        writePackFile(tmpRoot, 'jsononly/sub-verticals/sv/prompt-ir.json', JSON.stringify({
            schemaVersion: 1,
            id: 'jsononly/sv',
            task: { kind: 'summarise' },
        }));
        const ir = loadIR('jsononly', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.id).toBe('jsononly/sv');
        expect(ir.task.kind).toBe('summarise');
    });
});

/* ─── loadIR — failure modes ─────────────────────────────────────────── */

describe('loadIR — failure modes', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('malformed YAML falls through to synthetic IR if markdown exists', () => {
        writePackFile(tmpRoot, 'bad/sub-verticals/sv/prompt-ir.yaml', '!!: this is :: broken yaml: [');
        writePackFile(tmpRoot, 'bad/sub-verticals/sv/prompt-context.md', '# fallback markdown\nUse this on broken YAML.');
        const ir = loadIR('bad', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.meta?.synthetic).toBe(true);
        expect(ir.overrides.genie.legacyPreamble).toMatch(/fallback markdown/);
        expect(_logSink).toHaveBeenCalled();
    });

    test('validation failures fall through to synthetic IR', () => {
        // YAML parses fine but fails schema validation (missing id).
        writePackFile(tmpRoot, 'bad2/sub-verticals/sv/prompt-ir.yaml', 'schemaVersion: 1\nrole: {}\n');
        writePackFile(tmpRoot, 'bad2/sub-verticals/sv/prompt-context.md', '# synthetic fallback content');
        const ir = loadIR('bad2', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).not.toBeNull();
        expect(ir.meta?.synthetic).toBe(true);
    });

    test('unsafe pack segments return null', () => {
        expect(loadIR('../etc', 'sv', { packsRoot: tmpRoot })).toBeNull();
        expect(loadIR('cpg-fmcg', '../escape', { packsRoot: tmpRoot })).toBeNull();
        expect(loadIR('', 'sv', { packsRoot: tmpRoot })).toBeNull();
        expect(loadIR(null, 'sv', { packsRoot: tmpRoot })).toBeNull();
        expect(loadIR('UPPER', 'sv', { packsRoot: tmpRoot })).toBeNull();
    });

    test('pack with no IR and no markdown returns null', () => {
        writePackFile(tmpRoot, 'empty/sub-verticals/sv/.keep', '');
        const ir = loadIR('empty', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(ir).toBeNull();
    });
});

/* ─── loadIR — caching ───────────────────────────────────────────────── */

describe('loadIR — caching', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('cached on second call — second call does not call fs.readFileSync', () => {
        writePackFile(tmpRoot, 'cached/sub-verticals/sv/prompt-ir.yaml', 'schemaVersion: 1\nid: cached/sv\n');
        const first = loadIR('cached', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(first).not.toBeNull();
        const readSpy = jest.spyOn(fs, 'readFileSync');
        try {
            const second = loadIR('cached', 'sv', { packsRoot: tmpRoot, log: _logSink });
            expect(second).toBe(first); // identity — cached.
            expect(readSpy).not.toHaveBeenCalled();
        } finally {
            readSpy.mockRestore();
        }
    });

    test('__rebuildIRCache forces a re-read', () => {
        const target = writePackFile(tmpRoot, 'cached2/sub-verticals/sv/prompt-ir.yaml', 'schemaVersion: 1\nid: first\n');
        const first = loadIR('cached2', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(first.id).toBe('first');

        fs.writeFileSync(target, 'schemaVersion: 1\nid: second\n', 'utf8');
        const stillCached = loadIR('cached2', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(stillCached.id).toBe('first');

        __rebuildIRCache();
        const fresh = loadIR('cached2', 'sv', { packsRoot: tmpRoot, log: _logSink });
        expect(fresh.id).toBe('second');
    });
});

/* ─── buildSyntheticIR ───────────────────────────────────────────────── */

describe('buildSyntheticIR', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('returns null when pack/sub-vertical has no markdown anywhere', () => {
        writePackFile(tmpRoot, 'ghost/sub-verticals/sv/.keep', '');
        expect(buildSyntheticIR('ghost', 'sv', { packsRoot: tmpRoot })).toBeNull();
    });

    test('prefers prompt-context.md over glossary.md', () => {
        writePackFile(tmpRoot, 'pref/sub-verticals/sv/prompt-context.md', '# sub-vertical prompt context');
        writePackFile(tmpRoot, 'pref/knowledge-base/glossary.md', '# glossary fallback should not be used');
        const ir = buildSyntheticIR('pref', 'sv', { packsRoot: tmpRoot });
        expect(ir).not.toBeNull();
        expect(ir.overrides.genie.legacyPreamble).toMatch(/sub-vertical prompt context/);
        expect(ir.overrides.genie.legacyPreamble).not.toMatch(/glossary fallback/);
        expect(ir.meta.fallback).toBeFalsy();
    });

    test('falls back to glossary.md when sub-vertical has no prompt-context.md', () => {
        writePackFile(tmpRoot, 'fb/knowledge-base/glossary.md', '# glossary content\nUse this.');
        const ir = buildSyntheticIR('fb', 'sv-missing', { packsRoot: tmpRoot });
        expect(ir).not.toBeNull();
        expect(ir.overrides.genie.legacyPreamble).toMatch(/glossary content/);
        expect(ir.meta.fallback).toBe(true);
    });

    test('id is pack/sub-vertical for sub-vertical IRs', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/prompt-context.md', '# content');
        const ir = buildSyntheticIR('p', 'sv', { packsRoot: tmpRoot });
        expect(ir.id).toBe('p/sv');
    });

    test('id is just pack for pack-level IRs', () => {
        writePackFile(tmpRoot, 'p/knowledge-base/glossary.md', '# glossary');
        const ir = buildSyntheticIR('p', '', { packsRoot: tmpRoot });
        expect(ir.id).toBe('p');
    });

    test('truncates long glossary fallback', () => {
        const huge = '# Glossary\n\n' + 'x'.repeat(8000);
        writePackFile(tmpRoot, 'big/knowledge-base/glossary.md', huge);
        const ir = buildSyntheticIR('big', 'no-sv', { packsRoot: tmpRoot });
        expect(ir.overrides.genie.legacyPreamble.length).toBeLessThan(huge.length);
        expect(ir.overrides.genie.legacyPreamble).toMatch(/glossary truncated/);
    });

    test('rejects unsafe pack segments', () => {
        expect(buildSyntheticIR('../etc', 'sv', { packsRoot: tmpRoot })).toBeNull();
        expect(buildSyntheticIR('pack', '../sv', { packsRoot: tmpRoot })).toBeNull();
    });
});
