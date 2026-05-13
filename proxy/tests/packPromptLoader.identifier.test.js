// proxy/tests/packPromptLoader.identifier.test.js
//
// L15 closure tests — pack + subVertical identifiers must match the
// strict allowlist regex BEFORE the loader constructs any filesystem
// path. Defends against path-traversal even if `allowlist.packs` were
// ever misconfigured.

const { isValidPackIdentifier, loadPromptContext, __rebuildCache } = require('../lib/packPromptLoader');

beforeEach(() => __rebuildCache());

describe('isValidPackIdentifier (L15)', () => {
    test('accepts lowercase alphanumeric with hyphens', () => {
        expect(isValidPackIdentifier('cpg-fmcg')).toBe(true);
        expect(isValidPackIdentifier('supply-chain')).toBe(true);
        expect(isValidPackIdentifier('a')).toBe(true);
        expect(isValidPackIdentifier('a1')).toBe(true);
    });

    test('rejects path-traversal attempts', () => {
        expect(isValidPackIdentifier('../etc/passwd')).toBe(false);
        expect(isValidPackIdentifier('..')).toBe(false);
        expect(isValidPackIdentifier('cpg/../other')).toBe(false);
        expect(isValidPackIdentifier('cpg\\other')).toBe(false);
    });

    test('rejects uppercase, dots, underscores, spaces', () => {
        expect(isValidPackIdentifier('CPG')).toBe(false);
        expect(isValidPackIdentifier('cpg.fmcg')).toBe(false);
        expect(isValidPackIdentifier('cpg_fmcg')).toBe(false);
        expect(isValidPackIdentifier('cpg fmcg')).toBe(false);
    });

    test('rejects empty / null / non-string', () => {
        expect(isValidPackIdentifier('')).toBe(false);
        expect(isValidPackIdentifier(null)).toBe(false);
        expect(isValidPackIdentifier(undefined)).toBe(false);
        expect(isValidPackIdentifier(123)).toBe(false);
    });

    test('rejects identifiers > 63 chars', () => {
        expect(isValidPackIdentifier('a'.repeat(63))).toBe(true);
        expect(isValidPackIdentifier('a'.repeat(64))).toBe(false);
    });

    test('rejects identifiers starting with hyphen', () => {
        expect(isValidPackIdentifier('-leading-hyphen')).toBe(false);
    });
});

describe('loadPromptContext gates path traversal', () => {
    test('returns null for malicious pack name without touching the filesystem', () => {
        // Even with a real packsRoot, the regex gate fires first.
        const result = loadPromptContext('../../etc/passwd', undefined);
        expect(result).toBeNull();
    });

    test('returns null for malicious subVertical name', () => {
        // Pack name passes the regex; subVertical fails it.
        const result = loadPromptContext('cpg-fmcg', '../../../something');
        expect(result).toBeNull();
    });
});
