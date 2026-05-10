// @ts-check
'use strict';

/**
 * packMatcher.js — Smart Connect pack inference.
 *
 * Given a `ConnectorProbeResult`, score every (pack, sub-vertical) pair against
 * the probe's vocabulary signals and return the best match with a confidence
 * score and a human-readable `because[]` trace.
 *
 * Discovery: scans `pulsepacks/<pack>/pack.json` once at module load, parses
 * each pack's `knowledge-base/glossary.md` and per-sub-vertical `kpis.md` +
 * `sample-questions.md`, and caches an in-memory index. The index is rebuilt
 * if `rebuildPackIndex()` is called explicitly (used by tests).
 *
 * Matching is keyword-based, intentionally simple at v0:
 *   +10 per declared-KPI match
 *   +5  per schema-column match against glossary terms or KPI names
 *   +2  per description-text term match (case-insensitive substring)
 *   +1  per sample-question keyword match
 *
 * Confidence = min(1, score / 30).
 *
 * Agnostic-first: the matcher knows nothing about specific connectors. It
 * consumes the canonical `ConnectorProbeResult` shape.
 *
 * @typedef {Object} PackIndexEntry
 * @property {string} pack
 * @property {string} subVertical
 * @property {Set<string>} subTerms    Sub-vertical-specific lowercased terms (KPI names + sample-question keywords). These DIFFERENTIATE sub-verticals.
 * @property {Set<string>} packTerms   Pack-level lowercased glossary terms. These are SHARED across all sub-verticals of the same pack.
 * @property {Set<string>} kpiNames    Lowercased canonical KPI names.
 * @property {string[]} kpiDisplay     Original-case KPI display names for `because[]` traces.
 * @property {string[]} packTermDisplay Original-case glossary terms (subset, for traces).
 *
 * @typedef {Object} InferenceResult
 * @property {string|null} suggestedPack
 * @property {string|null} suggestedSubVertical
 * @property {number} confidence
 * @property {string[]} because
 * @property {Array<{ pack: string, subVertical: string, confidence: number }>} alternatives
 */

const fs = require('fs');
const path = require('path');

/**
 * Default packs root. Resolves to `pulsepacks/` at the project root (one level
 * above `proxy/`). Tests can pass a custom root via `matchPacksAgainstProbe`'s
 * options.
 */
const DEFAULT_PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');

// Cache: packsRoot -> PackIndexEntry[]
const _indexCache = new Map();

/**
 * Force-rebuild the in-memory index. Used by tests when the on-disk packs
 * directory changes between cases. Production code path uses the cached
 * index.
 */
function rebuildPackIndex(packsRoot = DEFAULT_PACKS_ROOT) {
    _indexCache.delete(packsRoot);
    return getPackIndex(packsRoot);
}

/**
 * Get the cached pack index, building it on first access.
 * Returns [] if `pulsepacks/` doesn't exist (defensive — early-development
 * deployments might not have shipped any packs yet).
 *
 * @returns {PackIndexEntry[]}
 */
function getPackIndex(packsRoot = DEFAULT_PACKS_ROOT) {
    const cached = _indexCache.get(packsRoot);
    if (cached) return cached;
    const built = buildPackIndex(packsRoot);
    _indexCache.set(packsRoot, built);
    return built;
}

/**
 * Walk packsRoot, parse manifests, build the index. Defensive against missing
 * files — packs without complete content are still indexed with whatever they
 * expose.
 *
 * @returns {PackIndexEntry[]}
 */
function buildPackIndex(packsRoot) {
    /** @type {PackIndexEntry[]} */
    const index = [];
    let packDirs;
    try {
        packDirs = fs.readdirSync(packsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
    } catch {
        // pulsepacks dir missing entirely — nothing to match against.
        return index;
    }

    for (const packName of packDirs) {
        const packDir = path.join(packsRoot, packName);
        const manifestPath = path.join(packDir, 'pack.json');
        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch {
            // Not a valid pack — skip silently.
            continue;
        }
        if (!manifest || !manifest.name || !Array.isArray(manifest.subVerticals)) {
            continue;
        }

        // Parse pack-level glossary once; it applies to every sub-vertical.
        const glossaryTerms = parseGlossaryTerms(packDir, manifest.knowledgeBase?.glossary);

        // Pack-level: glossary terms shared by every sub-vertical.
        const packTerms = new Set();
        const packTermDisplay = [];
        for (const t of glossaryTerms) {
            const lower = t.toLowerCase();
            if (lower.length < 3) continue;
            if (!packTerms.has(lower)) {
                packTerms.add(lower);
                packTermDisplay.push(t);
            }
        }

        for (const sv of manifest.subVerticals) {
            if (!sv?.name) continue;
            const subDir = path.join(packDir, sv.path || `sub-verticals/${sv.name}`);
            const { kpiNames, kpiDisplay } = parseKpiNames(subDir);
            const sampleKeywords = parseSampleQuestionKeywords(subDir);

            // Sub-vertical specific terms — these are what differentiate
            // supply-chain from procurement within the same pack.
            const subTerms = new Set();
            for (const k of kpiNames) {
                if (k.length >= 3) subTerms.add(k);
            }
            for (const w of sampleKeywords) {
                if (w.length >= 4) subTerms.add(w);
            }

            index.push({
                pack: manifest.name,
                subVertical: sv.name,
                subTerms,
                packTerms,
                kpiNames: new Set(kpiNames),
                kpiDisplay,
                packTermDisplay,
            });
        }
    }

    return index;
}

// ── Parsers ──────────────────────────────────────────────────────────────────
// Each parser is defensive: missing files return empty arrays. We never throw
// at index-build time; an incomplete pack just contributes weaker signals.

/**
 * Extract bold-bracketed terms from `knowledge-base/glossary.md`. The pack
 * spec requires every glossary entry to start with `**Term**` (Markdown
 * bold). We strip parenthetical acronym expansions ("OEE (Overall Equipment
 * Effectiveness)") into two terms — both the abbreviation and the expansion —
 * so probes that mention either signal the match.
 */
function parseGlossaryTerms(packDir, relativeGlossaryPath) {
    const glossaryPath = path.join(packDir, relativeGlossaryPath || 'knowledge-base/glossary.md');
    let raw;
    try { raw = fs.readFileSync(glossaryPath, 'utf8'); }
    catch { return []; }

    /** @type {string[]} */
    const out = [];
    // Match leading **Term** at the start of a line. Regex is intentionally
    // tolerant — markdown linters allow either ** or __ for bold; we accept
    // either.
    const re = /^\*\*([^*]+?)\*\*|^__([^_]+?)__/gm;
    for (const m of raw.matchAll(re)) {
        const term = (m[1] || m[2] || '').trim();
        if (!term) continue;
        // Split into surface form + expansion when the form is "ABBR (Expansion)".
        const acronymMatch = term.match(/^([A-Z][A-Z0-9/&\-]+)\s*\(([^)]+)\)\s*$/);
        if (acronymMatch) {
            out.push(acronymMatch[1].trim());
            out.push(acronymMatch[2].trim());
        } else {
            out.push(term);
        }
    }
    return out;
}

/**
 * Extract canonical KPI names from `kpis.md`. The pack spec uses level-2
 * headers (`## OTIF (On-Time In-Full)`) for each KPI. We capture both the
 * surface form and the expansion, mirroring the glossary parser.
 *
 * @returns {{ kpiNames: string[], kpiDisplay: string[] }}
 */
function parseKpiNames(subDir) {
    const kpisPath = path.join(subDir, 'kpis.md');
    let raw;
    try { raw = fs.readFileSync(kpisPath, 'utf8'); }
    catch { return { kpiNames: [], kpiDisplay: [] }; }

    /** @type {string[]} */
    const lower = [];
    /** @type {string[]} */
    const display = [];
    // Match level-2 headers only — level-1 is the file title, and level-3+
    // are sub-sections of a single KPI.
    const re = /^##\s+(.+?)\s*$/gm;
    for (const m of raw.matchAll(re)) {
        const heading = m[1].trim();
        // Skip cross-reference / appendix headers — convention: "Cross-references", "Notes".
        if (/^(cross-references?|notes|references|appendix)\b/i.test(heading)) continue;
        display.push(heading);
        const acronymMatch = heading.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
        if (acronymMatch) {
            lower.push(acronymMatch[1].trim().toLowerCase());
            lower.push(acronymMatch[2].trim().toLowerCase());
        } else {
            lower.push(heading.toLowerCase());
        }
    }
    return { kpiNames: lower, kpiDisplay: display };
}

/**
 * Extract loose keywords from `sample-questions.md`. We pull all bullet lines
 * (lines starting with `-` or `*`) and harvest content words >= 4 chars,
 * lowercased. Stop-words are filtered. This is intentionally fuzzy — the
 * sample-question signal is the lowest weight in the matcher.
 */
function parseSampleQuestionKeywords(subDir) {
    const path1 = path.join(subDir, 'sample-questions.md');
    let raw;
    try { raw = fs.readFileSync(path1, 'utf8'); }
    catch { return []; }

    const STOP = new Set([
        'this','that','with','from','what','which','when','where','have','been',
        'will','show','tell','give','some','more','than','were','they','them',
        'about','their','these','those','last','next','past','also','into','only',
        'across','versus','using','using','over','under','question','questions',
        'descriptive','diagnostic','predictive','prescriptive','exploratory',
        'chat','completion','conversation','agent','mcp',
    ]);
    const out = new Set();
    for (const line of raw.split(/\r?\n/)) {
        if (!/^\s*[-*]\s+/.test(line)) continue;
        const tokens = line.toLowerCase().match(/[a-z][a-z_]{3,}/g) || [];
        for (const t of tokens) {
            if (STOP.has(t)) continue;
            out.add(t);
        }
    }
    return Array.from(out);
}

// ── Matcher ──────────────────────────────────────────────────────────────────

/**
 * The minimum confidence below which we suppress the suggestion entirely.
 * Documented in the design spec ("confidence < 0.40 → no suggestion").
 */
const NO_SUGGESTION_THRESHOLD = 0.40;

/** Maximum raw score we treat as "perfect match". Tunable.
 *  Calibration: a single KPI hit (+10) should land mid-confidence so a
 *  schema-only probe with one strong KPI column still surfaces. Two KPI
 *  hits should comfortably exceed the 0.40 threshold. A rich description
 *  with multiple KPI mentions saturates near 1.0. */
const SCORE_NORMALIZATION_DIVISOR = 20;

/**
 * Score a single (pack, sub-vertical) entry against a probe result.
 *
 * Weighting strategy:
 *   - Declared KPI match           +10 (sub-vertical-specific)
 *   - Schema column matches KPI     +5 (sub-vertical-specific)
 *   - Schema column matches glossary +1 (pack-wide; doesn't differentiate sub-vertical)
 *   - Description/purpose KPI hit   +3 (sub-vertical-specific)
 *   - Description/purpose glossary  +1 (pack-wide)
 *   - Sample-question KPI hit       +2 (sub-vertical-specific)
 *
 * Pack-wide glossary signals contribute to ALL sub-verticals of the same
 * pack equally, which is correct: "OTIF" appearing in a description signals
 * "this is a CPG-FMCG dataset" but doesn't tell you whether to suggest
 * supply-chain or procurement. Sub-vertical-specific KPI / sample-question
 * signals do the actual differentiation.
 *
 * @param {PackIndexEntry} entry
 * @param {object} probe
 * @returns {{ score: number, because: string[] }}
 */
function scoreEntry(entry, probe) {
    let score = 0;
    /** @type {string[]} */
    const because = [];

    const description = `${probe.description || ''}\n${probe.purpose || ''}`.toLowerCase();
    const declaredKpis = Array.isArray(probe.declaredKpis) ? probe.declaredKpis : [];
    const tables = probe.schema?.tables || [];

    // 1. Declared-KPI matches (+10 each). Highest weight.
    for (const kpi of declaredKpis) {
        const name = String(kpi?.name || '').toLowerCase().trim();
        if (!name) continue;
        let matched = false;
        if (entry.kpiNames.has(name)) {
            score += 10;
            because.push(`Declared KPI '${kpi.name}' matches ${entry.subVertical} canonical KPI`);
            matched = true;
        } else {
            // Looser match: entry KPI name is a substring of declared KPI name (or vice versa).
            for (const k of entry.kpiNames) {
                if (k.length >= 4 && (name.includes(k) || k.includes(name))) {
                    score += 10;
                    because.push(`Declared KPI '${kpi.name}' aligns with ${entry.subVertical} KPI '${k}'`);
                    matched = true;
                    break;
                }
            }
        }
        // Pack-wide glossary credit only when no KPI matched, to avoid
        // double-counting the same signal.
        if (!matched && entry.packTerms.has(name)) {
            score += 2;
            because.push(`Declared KPI '${kpi.name}' is a known ${entry.pack} glossary term`);
        }
    }

    // 2. Schema column matches.
    //
    // Match strategy (most specific wins):
    //   a. Whole column name (snake → space) against KPI names — catches
    //      `service_level` → "service level".
    //   b. Token-by-token against sub-vertical KPI / sample-question vocab —
    //      catches `otif_pct` → "otif".
    //   c. Token-by-token against pack glossary (lower weight; pack-wide).
    for (const table of tables) {
        const cols = Array.isArray(table?.columns) ? table.columns : [];
        for (const col of cols) {
            const cname = String(col?.name || '').toLowerCase().trim();
            if (!cname) continue;
            const spaced = cname.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
            const tokens = cname.split(/[_\s\-.]+/).filter(t => t.length >= 3);
            let kpiHit = false;
            let glossaryHit = false;
            let hitTok = null;

            // (a) whole-name KPI match.
            if (spaced && entry.kpiNames.has(spaced)) {
                kpiHit = true;
                hitTok = spaced;
            } else {
                // KPI partial match: any KPI name contained inside the spaced column
                // name (handles "supplier_otd" → "otd", "otif_pct" → "otif").
                for (const k of entry.kpiNames) {
                    if (k.length < 3) continue;
                    const re = new RegExp(`\\b${escapeRegExp(k)}\\b`);
                    if (re.test(spaced)) {
                        kpiHit = true;
                        hitTok = k;
                        break;
                    }
                }
            }

            // (b) token-by-token against sub-vertical KPI vocabulary.
            if (!kpiHit) {
                for (const tok of tokens) {
                    if (entry.subTerms.has(tok) || entry.kpiNames.has(tok)) {
                        kpiHit = true;
                        hitTok = tok;
                        break;
                    }
                }
            }

            // (c) glossary-term token match (pack-wide; lower weight).
            if (!kpiHit) {
                for (const tok of tokens) {
                    if (entry.packTerms.has(tok)) {
                        glossaryHit = true;
                        hitTok = tok;
                        break;
                    }
                }
            }

            if (kpiHit) {
                score += 5;
                because.push(`Schema column '${col.name}' matches ${entry.subVertical} KPI vocabulary ('${hitTok}')`);
            } else if (glossaryHit) {
                score += 1;
                because.push(`Schema column '${col.name}' matches ${entry.pack} glossary term '${hitTok}'`);
            }
        }
    }

    // 3. Description / purpose text matches.
    if (description.trim()) {
        // Sub-vertical-specific KPI display forms (e.g. "OTIF (On-Time In-Full)").
        for (const kpi of entry.kpiDisplay) {
            const lower = kpi.toLowerCase();
            if (lower.length < 3) continue;
            if (description.includes(lower)) {
                score += 3;
                because.push(`${entry.subVertical} KPI '${kpi}' appears in connector description`);
            }
        }
        // KPI short-forms / acronyms (entries in kpiNames not already
        // covered by kpiDisplay match). Word-boundary check so "fill" doesn't
        // match inside "fulfilment".
        const alreadyCreditedDisplay = new Set(
            entry.kpiDisplay.map(d => d.toLowerCase()).filter(d => description.includes(d))
        );
        for (const kpiLower of entry.kpiNames) {
            if (kpiLower.length < 3) continue;
            if ([...alreadyCreditedDisplay].some(d => d.includes(kpiLower))) continue;
            const re = new RegExp(`\\b${escapeRegExp(kpiLower)}\\b`);
            if (re.test(description)) {
                score += 3;
                because.push(`${entry.subVertical} KPI term '${kpiLower}' appears in connector description`);
            }
        }
        // Pack-wide glossary terms (lower weight, applies to every sub-vertical
        // of the pack equally, but credits the pack-level signal).
        const seenGloss = new Set();
        for (const term of entry.packTermDisplay) {
            const lower = term.toLowerCase();
            if (lower.length < 3) continue;
            if (seenGloss.has(lower)) continue;
            // Word boundary to avoid sub-string false-positives.
            const re = new RegExp(`\\b${escapeRegExp(lower)}\\b`);
            if (re.test(description)) {
                score += 1;
                seenGloss.add(lower);
                if (because.length < 15) {
                    because.push(`${entry.pack} glossary term '${term}' appears in connector description`);
                }
            }
        }
    }

    // 4. Sample-question keyword matches (+2 each, sub-vertical-specific).
    const probeQuestions = Array.isArray(probe.sampleQuestions) ? probe.sampleQuestions : [];
    if (probeQuestions.length) {
        const seenTokens = new Set();
        for (const q of probeQuestions) {
            const tokens = String(q || '').toLowerCase().match(/[a-z][a-z_]{3,}/g) || [];
            for (const tok of tokens) {
                if (seenTokens.has(tok)) continue;
                if (entry.subTerms.has(tok)) {
                    score += 2;
                    seenTokens.add(tok);
                    if (because.length < 15) {
                        because.push(`Sample-question keyword '${tok}' matches ${entry.subVertical} vocabulary`);
                    }
                }
            }
        }
    }

    return { score, because };
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run the matcher.
 *
 * @param {object} probeResult — ConnectorProbeResult.
 * @param {{ packsRoot?: string, debug?: boolean }} [options]
 * @returns {InferenceResult}
 */
function matchPacksAgainstProbe(probeResult, options = {}) {
    const empty = {
        suggestedPack: null,
        suggestedSubVertical: null,
        confidence: 0,
        because: [],
        alternatives: [],
    };

    if (!probeResult || typeof probeResult !== 'object') return empty;

    // Probes with no metadata cannot be matched. Don't pretend.
    if (probeResult.metadataAvailability === 'none') {
        return {
            ...empty,
            because: ['Connector returned no introspectable metadata; pack inference skipped'],
        };
    }

    const index = getPackIndex(options.packsRoot);
    if (index.length === 0) {
        return {
            ...empty,
            because: ['No packs installed at pulsepacks/'],
        };
    }

    const scored = index.map(entry => {
        const { score, because } = scoreEntry(entry, probeResult);
        const confidence = Math.min(1, score / SCORE_NORMALIZATION_DIVISOR);
        return {
            pack: entry.pack,
            subVertical: entry.subVertical,
            score,
            confidence,
            because,
        };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const alternatives = scored.slice(1, 3)
        .filter(s => s.score > 0)
        .map(s => ({ pack: s.pack, subVertical: s.subVertical, confidence: s.confidence }));

    if (!best || best.confidence < NO_SUGGESTION_THRESHOLD) {
        return {
            suggestedPack: null,
            suggestedSubVertical: null,
            confidence: best?.confidence || 0,
            because: ['No strong vocabulary matches found'],
            alternatives,
        };
    }

    return {
        suggestedPack: best.pack,
        suggestedSubVertical: best.subVertical,
        confidence: best.confidence,
        because: best.because.slice(0, 5),
        alternatives,
    };
}

module.exports = {
    matchPacksAgainstProbe,
    rebuildPackIndex,
    // Exported for tests; not for production callers.
    __internals: {
        buildPackIndex,
        parseGlossaryTerms,
        parseKpiNames,
        parseSampleQuestionKeywords,
        scoreEntry,
        NO_SUGGESTION_THRESHOLD,
        SCORE_NORMALIZATION_DIVISOR,
    },
};
