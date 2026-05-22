// @ts-check
'use strict';

/**
 * packPromptLoader.js — Cycle C backend.
 *
 * Loads + caches `prompt-context.md` content from `pulsepacks/<pack>/sub-verticals/<sv>/`
 * so the assistant routes can prepend pack-specific vocabulary to the LLM
 * call BEFORE it is dispatched (Genie / OpenAI / Bedrock — connector-agnostic).
 *
 * Discovery is on-demand and per-key. Each `(pack, subVertical)` pair is
 * resolved + read once per process and cached in memory; cache invalidation
 * is process-restart only. Tests can clear via `__rebuildCache()`.
 *
 * Fallback chain:
 *   1. `pulsepacks/<pack>/sub-verticals/<sv>/prompt-context.md`
 *   2. (if 1 missing) `pulsepacks/<pack>/knowledge-base/glossary.md`
 *      truncated to ~2000 characters — covers packs that haven't authored
 *      per-sub-vertical context yet.
 *   3. `null`
 *
 * Tolerates a missing `pulsepacks/` directory entirely (returns null and
 * logs a one-shot warning) so the proxy can be deployed without packs.
 */

const fs = require('fs');
const path = require('path');

/**
 * Default packs root. Resolves to `pulsepacks/` at the project root (one
 * level above `proxy/`). Tests can pass a custom root via
 * `loadPromptContext(pack, sv, { packsRoot })`.
 */
const DEFAULT_PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');

/** Glossary fallback truncation cap. */
const GLOSSARY_FALLBACK_MAX_CHARS = 2000;

// Cache: `${packsRoot}::${pack}::${subVertical || ''}` -> { content, source } | null
const _cache = new Map();

// Whether we've already logged the missing-pulsepacks warning. Bounded so
// a misconfigured deployment doesn't flood the audit log on every request.
let _missingPacksRootWarned = false;

/**
 * @typedef {Object} PromptContext
 * @property {string} content   The prompt-context body to inject.
 * @property {string} source    Absolute path to the file the content was read from.
 * @property {boolean} [fallback]  True when the glossary fallback was used instead of a sub-vertical context.
 */

/**
 * Read prompt-context for a `(pack, subVertical)` pair. Always non-throwing —
 * any I/O failure is treated as "context unavailable" so the route handler
 * can proceed without context.
 *
 * @param {string} pack          Pack id (e.g. `cpg-fmcg`).
 * @param {string} [subVertical] Sub-vertical id (e.g. `supply-chain`).
 * @param {{ packsRoot?: string }} [opts]
 * @returns {PromptContext | null}
 */
// L15 closure — pack/subVertical identifiers must match a strict allowlist
// regex before they're passed to path.join. `_safeIsDirectory` already
// catches non-existent directories, but a malicious value like
// `../../etc/passwd` could traverse if the layout ever changes. The
// regex keeps the boundary tight: lowercase alphanumeric + hyphens only.
const PACK_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

function isValidPackIdentifier(value) {
    return typeof value === 'string' && PACK_NAME_REGEX.test(value);
}

function loadPromptContext(pack, subVertical, opts) {
    const packsRoot = (opts && opts.packsRoot) || DEFAULT_PACKS_ROOT;

    if (!pack || typeof pack !== 'string') return null;
    if (subVertical !== undefined && subVertical !== null && typeof subVertical !== 'string') return null;

    // L15 — reject path-traversal-shaped identifiers BEFORE constructing any
    // filesystem path. The proxy allowlist (`allowlist.packs`) is the
    // primary gate; this is defense in depth so a misconfigured allowlist
    // can't expose the filesystem.
    if (!isValidPackIdentifier(pack)) {
        console.warn(`[packPromptLoader] rejected pack identifier (regex fail): ${JSON.stringify(pack).slice(0, 80)}`);
        return null;
    }
    if (subVertical && !isValidPackIdentifier(subVertical)) {
        console.warn(`[packPromptLoader] rejected subVertical identifier (regex fail): ${JSON.stringify(subVertical).slice(0, 80)}`);
        return null;
    }

    const cacheKey = `${packsRoot}::${pack}::${subVertical || ''}`;
    if (_cache.has(cacheKey)) {
        return _cache.get(cacheKey);
    }

    // Tolerate missing pulsepacks/ directory entirely.
    let packsRootStat;
    try {
        packsRootStat = fs.statSync(packsRoot);
    } catch {
        if (!_missingPacksRootWarned) {
            console.warn(`[packPromptLoader] pulsepacks/ root not found at ${packsRoot} — pack-context injection disabled`);
            _missingPacksRootWarned = true;
        }
        _cache.set(cacheKey, null);
        return null;
    }
    if (!packsRootStat.isDirectory()) {
        if (!_missingPacksRootWarned) {
            console.warn(`[packPromptLoader] pulsepacks/ root at ${packsRoot} is not a directory — pack-context injection disabled`);
            _missingPacksRootWarned = true;
        }
        _cache.set(cacheKey, null);
        return null;
    }

    const packDir = path.join(packsRoot, pack);
    if (!_safeIsDirectory(packDir)) {
        // Pack itself is unknown — null + warn (low-volume; bad pack name is a programming error).
        console.warn(`[packPromptLoader] unknown pack "${pack}" — no directory at ${packDir}`);
        _cache.set(cacheKey, null);
        return null;
    }

    /** @type {PromptContext | null} */
    let result = null;

    // Step 1: prompt-context.md for the requested sub-vertical.
    if (subVertical) {
        const candidate = path.join(packDir, 'sub-verticals', subVertical, 'prompt-context.md');
        const content = _safeReadFile(candidate);
        if (content !== null) {
            result = { content, source: candidate };
        }
    }

    // Step 2: glossary fallback (truncated).
    if (!result) {
        const glossary = path.join(packDir, 'knowledge-base', 'glossary.md');
        const raw = _safeReadFile(glossary);
        if (raw !== null) {
            const truncated = raw.length > GLOSSARY_FALLBACK_MAX_CHARS
                ? raw.slice(0, GLOSSARY_FALLBACK_MAX_CHARS) + '\n\n[…glossary truncated]'
                : raw;
            result = { content: truncated, source: glossary, fallback: true };
        }
    }

    _cache.set(cacheKey, result);
    return result;
}

/** Test hook — clears the in-memory cache + missing-root warning latch. */
function __rebuildCache() {
    _cache.clear();
    _missingPacksRootWarned = false;
}

// ── Internals ────────────────────────────────────────────────────────────────

function _safeIsDirectory(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function _safeReadFile(p) {
    try {
        const buf = fs.readFileSync(p, 'utf8');
        return typeof buf === 'string' ? buf : null;
    } catch {
        return null;
    }
}

module.exports = {
    loadPromptContext,
    __rebuildCache,
    isValidPackIdentifier,
    // Exposed for tests / observability.
    DEFAULT_PACKS_ROOT,
    GLOSSARY_FALLBACK_MAX_CHARS,
};
