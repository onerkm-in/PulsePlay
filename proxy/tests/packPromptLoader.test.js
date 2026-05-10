'use strict';

/**
 * packPromptLoader.test.js — Cycle C backend.
 *
 * Exercises the prompt-context loader against:
 *   - The real `pulsepacks/cpg-fmcg/sub-verticals/supply-chain/prompt-context.md`
 *     (ships with the project — covers the happy path).
 *   - Synthetic packs roots written to a tmp directory for the missing-pack,
 *     glossary-fallback, and missing-pulsepacks-root cases.
 *   - `__rebuildCache()` semantics: second call with the same `packsRoot`
 *     should NOT re-read the file system.
 *
 * No fs mocks here — the loader's contract is "be defensive about real fs
 * failures" so we test against real fs whenever possible.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    loadPromptContext,
    __rebuildCache,
    DEFAULT_PACKS_ROOT,
    GLOSSARY_FALLBACK_MAX_CHARS,
} = require('../lib/packPromptLoader');

// Suppress the loader's warn() calls from console output during tests.
let _warnSpy;
beforeAll(() => {
    _warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
    _warnSpy?.mockRestore();
});

beforeEach(() => {
    __rebuildCache();
    _warnSpy.mockClear();
});

// ── tmp-packs helper ─────────────────────────────────────────────────────────
function makeTmpPacksRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsepacks-test-'));
    return root;
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('packPromptLoader.loadPromptContext — real cpg-fmcg pack', () => {
    test('loads cpg-fmcg/supply-chain/prompt-context.md', () => {
        const result = loadPromptContext('cpg-fmcg', 'supply-chain');
        expect(result).not.toBeNull();
        expect(result.source).toMatch(/sub-verticals[\\/]supply-chain[\\/]prompt-context\.md$/);
        expect(result.content).toMatch(/Supply Chain/);
        expect(result.content).toMatch(/OTIF|fill rate|service/i);
        expect(result.fallback).toBeFalsy();
    });

    test('loads cpg-fmcg/sustainability/prompt-context.md', () => {
        const result = loadPromptContext('cpg-fmcg', 'sustainability');
        expect(result).not.toBeNull();
        expect(result.source).toMatch(/sustainability[\\/]prompt-context\.md$/);
        expect(typeof result.content).toBe('string');
        expect(result.content.length).toBeGreaterThan(50);
    });
});

describe('packPromptLoader.loadPromptContext — null cases', () => {
    test('returns null for missing pack', () => {
        const result = loadPromptContext('this-pack-does-not-exist', 'supply-chain');
        expect(result).toBeNull();
    });

    test('returns null for null/undefined pack', () => {
        expect(loadPromptContext(null, 'supply-chain')).toBeNull();
        expect(loadPromptContext(undefined, 'supply-chain')).toBeNull();
        expect(loadPromptContext('', 'supply-chain')).toBeNull();
    });

    test('returns null for non-string pack', () => {
        // @ts-expect-error -- testing defensive coercion
        expect(loadPromptContext(42, 'sv')).toBeNull();
        // @ts-expect-error -- testing defensive coercion
        expect(loadPromptContext({}, 'sv')).toBeNull();
    });

    test('returns null for non-string subVertical (when not undefined/null)', () => {
        // @ts-expect-error -- testing defensive coercion
        expect(loadPromptContext('cpg-fmcg', 42)).toBeNull();
    });
});

describe('packPromptLoader — glossary fallback', () => {
    let tmpRoot;
    beforeEach(() => {
        tmpRoot = makeTmpPacksRoot();
    });
    afterEach(() => {
        rmrf(tmpRoot);
    });

    test('falls back to knowledge-base/glossary.md when sub-vertical context is missing', () => {
        // Pack has knowledge-base/glossary.md but no sub-verticals/<sv>/prompt-context.md
        writePackFile(tmpRoot, 'mypack/knowledge-base/glossary.md', '# Glossary\n\nSome terms here.');
        const result = loadPromptContext('mypack', 'unknown-sv', { packsRoot: tmpRoot });
        expect(result).not.toBeNull();
        expect(result.fallback).toBe(true);
        expect(result.source).toMatch(/glossary\.md$/);
        expect(result.content).toMatch(/Glossary/);
    });

    test('truncates glossary to ~2000 chars', () => {
        const huge = '# Glossary\n\n' + 'x'.repeat(GLOSSARY_FALLBACK_MAX_CHARS * 3);
        writePackFile(tmpRoot, 'big/knowledge-base/glossary.md', huge);
        const result = loadPromptContext('big', 'no-sv', { packsRoot: tmpRoot });
        expect(result).not.toBeNull();
        expect(result.fallback).toBe(true);
        // Content is capped; the cap allows a small trailing "[…glossary truncated]" marker.
        expect(result.content.length).toBeLessThanOrEqual(GLOSSARY_FALLBACK_MAX_CHARS + 50);
        expect(result.content).toMatch(/truncated/);
    });

    test('does not use glossary fallback when sub-vertical has its own prompt-context.md', () => {
        writePackFile(tmpRoot, 'mypack/sub-verticals/sales/prompt-context.md', '# Sales prompt\n\nUse sales vocab.');
        writePackFile(tmpRoot, 'mypack/knowledge-base/glossary.md', '# Glossary fallback (should NOT be used)');
        const result = loadPromptContext('mypack', 'sales', { packsRoot: tmpRoot });
        expect(result).not.toBeNull();
        expect(result.fallback).toBeFalsy();
        expect(result.content).toMatch(/Sales prompt/);
        expect(result.content).not.toMatch(/should NOT be used/);
    });

    test('returns null when sub-vertical context is missing AND pack has no glossary', () => {
        writePackFile(tmpRoot, 'mypack/sub-verticals/something-else/prompt-context.md', 'unrelated');
        const result = loadPromptContext('mypack', 'no-such-sv', { packsRoot: tmpRoot });
        expect(result).toBeNull();
    });
});

describe('packPromptLoader — caching', () => {
    let tmpRoot;
    let target;

    beforeEach(() => {
        tmpRoot = makeTmpPacksRoot();
        target = writePackFile(
            tmpRoot,
            'cached-pack/sub-verticals/sv1/prompt-context.md',
            '# Cached prompt context'
        );
    });
    afterEach(() => rmrf(tmpRoot));

    test('cache hit on second call — second call does not call fs.readFileSync', () => {
        const first = loadPromptContext('cached-pack', 'sv1', { packsRoot: tmpRoot });
        expect(first).not.toBeNull();
        expect(first.content).toMatch(/Cached prompt context/);

        // Spy AFTER the first read so the cache-population call isn't counted.
        const readSpy = jest.spyOn(fs, 'readFileSync');
        try {
            const second = loadPromptContext('cached-pack', 'sv1', { packsRoot: tmpRoot });
            expect(second).toBe(first); // same object reference — cached
            expect(readSpy).not.toHaveBeenCalled();
        } finally {
            readSpy.mockRestore();
        }
    });

    test('__rebuildCache forces a re-read', () => {
        const first = loadPromptContext('cached-pack', 'sv1', { packsRoot: tmpRoot });

        // Mutate the file to detect that re-read happened.
        fs.writeFileSync(target, '# Updated prompt context', 'utf8');

        // Without rebuild, cache returns the stale entry.
        const cached = loadPromptContext('cached-pack', 'sv1', { packsRoot: tmpRoot });
        expect(cached.content).toMatch(/Cached prompt context/);

        __rebuildCache();
        const fresh = loadPromptContext('cached-pack', 'sv1', { packsRoot: tmpRoot });
        expect(fresh.content).toMatch(/Updated prompt context/);
    });

    test('caches null results too (no repeated fs lookups for missing packs)', () => {
        const first = loadPromptContext('no-such-pack', 'sv', { packsRoot: tmpRoot });
        expect(first).toBeNull();

        const statSpy = jest.spyOn(fs, 'statSync');
        try {
            const second = loadPromptContext('no-such-pack', 'sv', { packsRoot: tmpRoot });
            expect(second).toBeNull();
            expect(statSpy).not.toHaveBeenCalled();
        } finally {
            statSpy.mockRestore();
        }
    });
});

describe('packPromptLoader — missing pulsepacks/ root', () => {
    test('tolerates missing pulsepacks/ directory entirely (returns null + warns once)', () => {
        const ghostRoot = path.join(os.tmpdir(), `ghost-pulsepacks-${Date.now()}-${Math.random()}`);
        // Confirm it really doesn't exist.
        expect(fs.existsSync(ghostRoot)).toBe(false);

        const result = loadPromptContext('cpg-fmcg', 'supply-chain', { packsRoot: ghostRoot });
        expect(result).toBeNull();
        expect(_warnSpy).toHaveBeenCalled();
        const warnLine = _warnSpy.mock.calls.map(c => c.join(' ')).join('\n');
        expect(warnLine).toMatch(/pulsepacks\/?\s*root not found/);
    });

    test('tolerates pulsepacks/ being a file rather than a directory', () => {
        const tmpFile = path.join(os.tmpdir(), `pulsepacks-asfile-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, 'not a directory', 'utf8');
        try {
            const result = loadPromptContext('cpg-fmcg', 'supply-chain', { packsRoot: tmpFile });
            expect(result).toBeNull();
            expect(_warnSpy).toHaveBeenCalled();
        } finally {
            rmrf(tmpFile);
        }
    });
});

describe('packPromptLoader — DEFAULT_PACKS_ROOT', () => {
    test('points at the project pulsepacks/ directory', () => {
        expect(DEFAULT_PACKS_ROOT).toMatch(/pulsepacks$/);
        expect(fs.existsSync(DEFAULT_PACKS_ROOT)).toBe(true);
    });
});
