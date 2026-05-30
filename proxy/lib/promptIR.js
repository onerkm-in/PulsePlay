// @ts-check
'use strict';

/**
 * promptIR.js — Phase 11a.
 *
 * Author-neutral Prompt IR loader + schema validator + synthetic-IR builder.
 *
 * Reads `pulsepacks/<pack>/sub-verticals/<sv>/prompt-ir.yaml` (preferred) or
 * `prompt-ir.json` (also accepted). If neither exists, builds a synthetic IR
 * from the existing markdown files so packs that haven't migrated yet keep
 * working byte-identically through the Genie translator (see promptTranslators/genie.js).
 *
 * The IR shape is documented in docs/PROMPT_IR_ARCHITECTURE.md.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { isSafePackSegment } = require('./packRegistry');

const DEFAULT_PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');
const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);
const GLOSSARY_FALLBACK_MAX_CHARS = 2000;

// In-memory cache, keyed on (packsRoot, pack, subVertical, mtime). Tests
// reset via `__rebuildIRCache`.
const _cache = new Map();

function _cacheKey(packsRoot, pack, subVertical) {
    return `${packsRoot}::${pack}::${subVertical || ''}`;
}

/* ─── Public API ──────────────────────────────────────────────────────── */

/**
 * Load + validate a Prompt IR for `(pack, subVertical)`. Format precedence:
 *   1. `<sv-dir>/prompt-ir.yaml`
 *   2. `<sv-dir>/prompt-ir.json`
 *   3. Synthetic IR from existing markdown (`prompt-context.md` / `glossary.md`)
 *
 * Never throws. Validation failures fall through to the synthetic IR so
 * runtime never crashes on a malformed pack — the validation problems are
 * logged once and surfaced via `node scripts/check-prompt-ir.js` for the
 * author to act on.
 *
 * @param {string} pack
 * @param {string} subVertical
 * @param {{ packsRoot?: string, log?: (msg: string) => void }} [opts]
 * @returns {IR | null}
 */
function loadIR(pack, subVertical, opts = {}) {
    if (!isSafePackSegment(pack)) return null;
    if (subVertical && !isSafePackSegment(subVertical)) return null;

    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;
    const log = opts.log || (() => {});
    const cacheKey = _cacheKey(packsRoot, pack, subVertical);
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);

    const svDir = subVertical
        ? path.join(packsRoot, pack, 'sub-verticals', subVertical)
        : path.join(packsRoot, pack);

    // Try YAML first.
    const fromYaml = _tryLoadFile(path.join(svDir, 'prompt-ir.yaml'), 'yaml', log);
    if (fromYaml) {
        const problems = validateIR(fromYaml);
        if (problems.length === 0) {
            _cache.set(cacheKey, fromYaml);
            return fromYaml;
        }
        log(`[promptIR] ${pack}/${subVertical} prompt-ir.yaml failed validation: ${problems.join('; ')} — falling through to synthetic`);
    }

    // Then JSON.
    const fromJson = _tryLoadFile(path.join(svDir, 'prompt-ir.json'), 'json', log);
    if (fromJson) {
        if (fromYaml) {
            log(`[promptIR] ${pack}/${subVertical} has BOTH prompt-ir.yaml and prompt-ir.json — using whichever passed validation (preferred: YAML)`);
        }
        const problems = validateIR(fromJson);
        if (problems.length === 0) {
            _cache.set(cacheKey, fromJson);
            return fromJson;
        }
        log(`[promptIR] ${pack}/${subVertical} prompt-ir.json failed validation: ${problems.join('; ')} — falling through to synthetic`);
    }

    // Synthetic fallback.
    const synthetic = buildSyntheticIR(pack, subVertical, { packsRoot });
    _cache.set(cacheKey, synthetic);
    return synthetic;
}

/**
 * Hand-rolled schema validator. Returns an array of human-readable problem
 * strings; empty array means the IR is valid. Same style as configValidator.js.
 *
 * @param {unknown} ir
 * @returns {string[]}
 */
function validateIR(ir) {
    const problems = [];
    if (!_isPlainObject(ir)) {
        problems.push('IR must be an object');
        return problems;
    }
    const o = /** @type {Record<string, unknown>} */ (ir);

    if (!SUPPORTED_SCHEMA_VERSIONS.has(/** @type {number} */ (o.schemaVersion))) {
        problems.push(`schemaVersion must be one of [${[...SUPPORTED_SCHEMA_VERSIONS].join(', ')}] (got: ${JSON.stringify(o.schemaVersion)})`);
    }
    if (typeof o.id !== 'string' || !o.id.trim()) {
        problems.push('id must be a non-empty string (typically "<pack>/<sub-vertical>")');
    }

    _validateOptionalShape(problems, o, 'role', _validateRole);
    _validateOptionalShape(problems, o, 'task', _validateTask);
    _validateOptionalArray(problems, o, 'vocabulary', _validateVocabularyItem);
    _validateOptionalArray(problems, o, 'functions', _validateFunctionItem);
    _validateOptionalShape(problems, o, 'guardrails', _validateGuardrails);
    _validateOptionalShape(problems, o, 'output', _validateOutput);
    _validateOptionalArray(problems, o, 'examples', _validateExampleItem);
    _validateOptionalShape(problems, o, 'overrides', _validateOverrides);
    _validateOptionalShape(problems, o, 'meta', () => []);

    return problems;
}

/**
 * Build a synthetic IR from existing markdown so Phase 11a is fully
 * backward-compatible. Stores the raw `prompt-context.md` content (with
 * glossary fallback) in `overrides.genie.legacyPreamble` so the Genie
 * translator can emit byte-identical output to the legacy
 * `wrapAsGenieUserMessage` function.
 *
 * @param {string} pack
 * @param {string} subVertical
 * @param {{ packsRoot?: string }} [opts]
 * @returns {IR | null}
 */
function buildSyntheticIR(pack, subVertical, opts = {}) {
    if (!isSafePackSegment(pack)) return null;
    if (subVertical && !isSafePackSegment(subVertical)) return null;
    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;

    const svDir = path.join(packsRoot, pack, 'sub-verticals', subVertical || '');
    const promptContextPath = subVertical ? path.join(svDir, 'prompt-context.md') : null;
    const glossaryPath = path.join(packsRoot, pack, 'knowledge-base', 'glossary.md');

    let legacyPreamble = null;
    let legacySource = null;
    let usedFallback = false;

    if (promptContextPath) {
        const raw = _safeReadFile(promptContextPath);
        if (raw !== null) {
            legacyPreamble = raw;
            legacySource = promptContextPath;
        }
    }
    if (legacyPreamble === null) {
        const raw = _safeReadFile(glossaryPath);
        if (raw !== null) {
            legacyPreamble = raw.length > GLOSSARY_FALLBACK_MAX_CHARS
                ? raw.slice(0, GLOSSARY_FALLBACK_MAX_CHARS) + '\n\n[…glossary truncated]'
                : raw;
            legacySource = glossaryPath;
            usedFallback = true;
        }
    }

    if (legacyPreamble === null) {
        // No markdown to synthesise from → return null so callers can
        // treat this pack/subVertical as "no IR available."
        return null;
    }

    return {
        schemaVersion: 1,
        id: subVertical ? `${pack}/${subVertical}` : pack,
        role: { persona: 'data analyst' },
        task: { kind: 'answer-grounded' },
        vocabulary: [],
        functions: [],
        guardrails: { must: [], mustNot: [] },
        output: { format: 'free-text', sections: [] },
        examples: [],
        overrides: {
            genie: {
                // Carries the raw markdown verbatim so genie.translate emits
                // byte-identical output to the legacy wrapAsGenieUserMessage.
                legacyPreamble,
            },
        },
        meta: {
            synthetic: true,
            sourceFile: legacySource,
            fallback: usedFallback,
        },
    };
}

/** Test hook — clears the in-memory cache so tests can mutate fixtures freely. */
function __rebuildIRCache() {
    _cache.clear();
}

/* ─── Internals ───────────────────────────────────────────────────────── */

function _tryLoadFile(filePath, kind, log) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (kind === 'yaml') {
            // Use JSON_SCHEMA — no custom YAML tags, no code execution. Defends
            // against the historical YAML deserialisation CVE class.
            return yaml.load(raw, { schema: yaml.JSON_SCHEMA });
        }
        return JSON.parse(raw);
    } catch (err) {
        log(`[promptIR] failed to parse ${filePath}: ${err.message}`);
        return null;
    }
}

function _safeReadFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
}

function _isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _validateOptionalShape(problems, obj, key, sub) {
    if (obj[key] === undefined) return;
    if (!_isPlainObject(obj[key])) {
        problems.push(`${key} must be an object when present (got: ${typeof obj[key]})`);
        return;
    }
    for (const p of sub(obj[key])) problems.push(`${key}.${p}`);
}

function _validateOptionalArray(problems, obj, key, itemValidator) {
    if (obj[key] === undefined) return;
    if (!Array.isArray(obj[key])) {
        problems.push(`${key} must be an array when present`);
        return;
    }
    obj[key].forEach((item, i) => {
        for (const p of itemValidator(item)) problems.push(`${key}[${i}].${p}`);
    });
}

function _validateRole(role) {
    const problems = [];
    for (const k of ['persona', 'audience', 'tone']) {
        if (role[k] !== undefined && typeof role[k] !== 'string') {
            problems.push(`${k} must be a string when present`);
        }
    }
    return problems;
}

function _validateTask(task) {
    const problems = [];
    if (task.kind !== undefined) {
        const VALID = ['answer-grounded', 'summarise', 'recommend', 'classify', 'execute-sql'];
        if (typeof task.kind !== 'string' || !VALID.includes(task.kind)) {
            problems.push(`kind must be one of [${VALID.join(', ')}] (got: ${JSON.stringify(task.kind)})`);
        }
    }
    for (const k of ['scope', 'freshness']) {
        if (task[k] !== undefined && typeof task[k] !== 'string') {
            problems.push(`${k} must be a string when present`);
        }
    }
    return problems;
}

function _validateVocabularyItem(item) {
    const problems = [];
    if (!_isPlainObject(item)) { problems.push('must be an object'); return problems; }
    if (typeof item.term !== 'string' || !item.term.trim()) problems.push('term is required');
    if (typeof item.definition !== 'string' || !item.definition.trim()) problems.push('definition is required');
    if (item.units !== undefined && typeof item.units !== 'string') problems.push('units must be a string when present');
    if (item.direction !== undefined) {
        const VALID = ['higher-is-better', 'lower-is-better', 'target', 'context-dependent'];
        if (!VALID.includes(item.direction)) {
            problems.push(`direction must be one of [${VALID.join(', ')}] (got: ${JSON.stringify(item.direction)})`);
        }
    }
    return problems;
}

function _validateFunctionItem(item) {
    const problems = [];
    if (!_isPlainObject(item)) { problems.push('must be an object'); return problems; }
    if (typeof item.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(item.name)) {
        problems.push('name must match /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/');
    }
    if (typeof item.description !== 'string' || !item.description.trim()) problems.push('description is required');
    if (item.parameters !== undefined && !_isPlainObject(item.parameters)) {
        problems.push('parameters must be an object when present');
    }
    return problems;
}

function _validateGuardrails(g) {
    const problems = [];
    for (const k of ['must', 'mustNot']) {
        if (g[k] === undefined) continue;
        if (!Array.isArray(g[k])) { problems.push(`${k} must be an array`); continue; }
        g[k].forEach((s, i) => {
            if (typeof s !== 'string') problems.push(`${k}[${i}] must be a string`);
        });
    }
    return problems;
}

function _validateOutput(output) {
    const problems = [];
    if (output.format !== undefined) {
        const VALID = ['structured-sections', 'free-text', 'json'];
        if (!VALID.includes(output.format)) {
            problems.push(`format must be one of [${VALID.join(', ')}] (got: ${JSON.stringify(output.format)})`);
        }
    }
    if (output.sections !== undefined) {
        if (!Array.isArray(output.sections)) {
            problems.push('sections must be an array when present');
        } else {
            output.sections.forEach((s, i) => {
                if (!_isPlainObject(s)) { problems.push(`sections[${i}] must be an object`); return; }
                if (typeof s.id !== 'string' || !s.id.trim()) problems.push(`sections[${i}].id is required`);
                if (s.required !== undefined && typeof s.required !== 'boolean') problems.push(`sections[${i}].required must be boolean`);
                if (s.maxChars !== undefined && (typeof s.maxChars !== 'number' || s.maxChars < 1)) {
                    problems.push(`sections[${i}].maxChars must be a positive number`);
                }
                if (s.maxItems !== undefined && (typeof s.maxItems !== 'number' || s.maxItems < 1)) {
                    problems.push(`sections[${i}].maxItems must be a positive number`);
                }
            });
        }
    }
    return problems;
}

function _validateExampleItem(item) {
    const problems = [];
    if (!_isPlainObject(item)) { problems.push('must be an object'); return problems; }
    if (typeof item.q !== 'string' || !item.q.trim()) problems.push('q is required');
    if (typeof item.a !== 'string' || !item.a.trim()) problems.push('a is required');
    return problems;
}

function _validateOverrides(overrides) {
    const problems = [];
    for (const [backend, val] of Object.entries(overrides)) {
        if (!_isPlainObject(val)) {
            problems.push(`${backend} must be an object`);
            continue;
        }
        // Per-backend override shapes are loose — translators document what
        // they read. We just enforce that each value is an object.
    }
    return problems;
}

/**
 * @typedef {Object} IR
 * @property {number} schemaVersion
 * @property {string} id
 * @property {{ persona?: string, audience?: string, tone?: string }} [role]
 * @property {{ kind?: string, scope?: string, freshness?: string }} [task]
 * @property {Array<{ term: string, definition: string, units?: string, direction?: string }>} [vocabulary]
 * @property {Array<{ name: string, description: string, parameters?: object, returns?: object }>} [functions]
 * @property {{ must?: string[], mustNot?: string[] }} [guardrails]
 * @property {{ format?: string, sections?: Array<{ id: string, required?: boolean, maxChars?: number, maxItems?: number, hint?: string, itemShape?: string }> }} [output]
 * @property {Array<{ q: string, a: string }>} [examples]
 * @property {Record<string, object>} [overrides]
 * @property {{ synthetic?: boolean, sourceFile?: string, fallback?: boolean }} [meta]
 */

module.exports = {
    loadIR,
    validateIR,
    buildSyntheticIR,
    __rebuildIRCache,
    SUPPORTED_SCHEMA_VERSIONS,
    DEFAULT_PACKS_ROOT,
};
