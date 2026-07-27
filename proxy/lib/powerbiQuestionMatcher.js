// @ts-check
'use strict';

/**
 * powerbiQuestionMatcher.js — NL question → DAX template + slots.
 *
 * Deterministic, no-LLM matcher. Given a natural-language question and the
 * probed Power BI dataset shape, returns `{ templateId, slots }` for the
 * highest-confidence template OR `null` when no match is found. Callers
 * fall back to a "I can answer these…" suggestion list (built from
 * `listTemplates()`).
 *
 * Strategy
 * ────────
 * Five passes, cheapest first:
 *
 *   1. Find a **measure** in the question — longest substring match
 *      against `probe.declaredKpis[].name`. Required for every template.
 *   2. Find a **time dimension** in the question — keywords (month,
 *      year, week, quarter, time, trend, over) OR a date-typed column
 *      mentioned by name. Routes to `trend` template.
 *   3. Find a **leading top-N** ("top 10", "top five", etc.) plus a
 *      regular dimension. Routes to `top-n`.
 *   4. Find a **regular dimension** ("by X", "for X") even without top-N.
 *      Routes to `aggregate-by`.
 *   5. Only a measure, no dimension. Routes to `total`.
 *
 * Tied results break by template priority above (trend > top-n >
 * aggregate-by > total).
 *
 * Failure mode
 * ────────────
 * Returns `{ matched: false, suggestions: [...] }` with example questions
 * pulled from the template registry, plus the names of probed measures
 * the user can try.
 */

const { listTemplates } = require('./powerbiDaxTemplates');

const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    fifteen: 15, twenty: 20, twentyfive: 25, fifty: 50, hundred: 100,
};
const TIME_KEYWORDS = new Set([
    'time', 'over', 'trend', 'trends', 'trending', 'history', 'historical', 'across',
]);
const TIME_DIMENSION_NAME_HINTS = [
    'date', 'datetime', 'timestamp', 'time', 'day', 'week', 'month', 'quarter',
    'year', 'period', 'fiscal',
];
const TOP_N_PHRASES = ['top', 'best', 'highest', 'leading'];

// Measure names in real semantic models carry unit suffixes the user never
// types: "Net Sales USD", "Order Fill Rate Pct", "GHG Emissions tCO2e",
// "Quality Complaint PPM", "Energy Intensity kWh per Unit". Strip these
// trailing tokens so "net sales" matches "Net Sales USD". Only pure unit
// tokens live here — meaningful words like "rate" or "ratio" are NOT stripped.
const MEASURE_UNIT_SUFFIX_TOKENS = new Set([
    'usd', 'pct', 'percent', 'tco2e', 'co2e', 'ppm', 'kwh', 'mwh', 'gwh',
]);
// Interchangeable measure tokens (question phrasing vs model naming).
const MEASURE_TOKEN_SYNONYMS = { qty: 'quantity' };

// Star-schema disambiguation: a fact's foreign key ("country_id") normalises to
// the same base token ("country") as its conformed dimension's descriptive
// column ("dim_country"."country"). Grouping a measure by the FK on a DIFFERENT
// fact table doesn't propagate through the shared dim, so the answer collapses
// to a repeated grand total. Prefer the dimension column: bonus dim tables,
// penalise FK-shaped columns. Tuning only affects tie-breaks — a sole candidate
// still wins regardless of sign.
const DIM_TABLE_BONUS = 8;
const FK_COLUMN_PENALTY = 12;

function isDimensionTable(name) {
    return typeof name === 'string' && /^(dim|dm)[_\s]/i.test(name.trim());
}
function isForeignKeyColumn(name) {
    if (typeof name !== 'string') return false;
    const n = name.trim().toLowerCase();
    return /(?:_id|_key|_fk)$/.test(n) || n === 'id' || n === 'key';
}

/**
 * Normalise free text to lowercase tokens with punctuation stripped but
 * spaces preserved.
 */
function tokenise(raw) {
    if (typeof raw !== 'string') return '';
    return raw.toLowerCase().replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameVariants(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const rawBase = tokenise(raw);
    const camelSpaced = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    const base = tokenise(camelSpaced);
    const spaced = tokenise(camelSpaced.replace(/[_\-.]+/g, ' '));
    const stripped = spaced.replace(/^(dim|fact)\s+/, '').trim();
    const withoutNameOrId = stripped.replace(/\s+(name|id|key)$/, '').trim();
    return Array.from(new Set([rawBase, base, spaced, stripped, withoutNameOrId].filter(Boolean)));
}

/**
 * Best-effort English plural for a tokenised noun. Used so a column named
 * "Category" matches a user question saying "categories", and vice versa.
 * Not linguistically perfect; good enough for column-name fuzzy match.
 */
function pluraliseLower(noun) {
    if (typeof noun !== 'string' || !noun) return '';
    const n = noun.toLowerCase();
    if (n.endsWith('y') && n.length > 1 && !'aeiou'.includes(n[n.length - 2])) {
        return n.slice(0, -1) + 'ies';
    }
    if (n.endsWith('s') || n.endsWith('x') || n.endsWith('z') || n.endsWith('ch') || n.endsWith('sh')) {
        return n + 'es';
    }
    return n + 's';
}

/** Best-effort English singular — inverse of pluraliseLower. */
function singulariseLower(noun) {
    if (typeof noun !== 'string' || !noun) return '';
    const n = noun.toLowerCase();
    if (n.endsWith('ies') && n.length > 3) return n.slice(0, -3) + 'y';
    if (n.endsWith('es') && n.length > 2) return n.slice(0, -2);
    if (n.endsWith('s') && n.length > 1) return n.slice(0, -1);
    return n;
}

/** True iff `q` contains `term` OR its plural OR its singular form. */
function questionMentions(q, term) {
    if (!term) return false;
    const t = term.toLowerCase();
    if (q.includes(t)) return true;
    const plural = pluraliseLower(t);
    if (plural !== t && q.includes(plural)) return true;
    const singular = singulariseLower(t);
    if (singular !== t && q.includes(singular)) return true;
    return false;
}

/**
 * Expand a measure name into the forms a user might actually type. Always
 * includes the full tokenised name; additionally strips trailing unit suffixes
 * ("Net Sales USD" → "net sales") and a trailing "per <unit>" ratio tail
 * ("Energy Intensity kWh per Unit" → "energy intensity"), plus a qty↔quantity
 * synonym. Purely additive — the full name stays the longest variant, so
 * longest-match tie-breaking is unchanged for suffix-free names.
 */
function measureVariants(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    // Two starting forms: the raw tokenisation (keeps unit tokens like "tco2e"
    // and "kwh" intact) and a camelCase-split base (splits "NetSalesUSD" →
    // "net sales usd"). Strip both — camelCase-splitting mangles glued units
    // (tCO2e → "t co2e"), so the raw form is what actually reaches the core.
    const camelSpaced = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    const rawTok = tokenise(raw);
    const base = tokenise(camelSpaced.replace(/[_\-.]+/g, ' '));
    const variants = new Set([rawTok, base].filter(Boolean));
    for (const start of [rawTok, base]) {
        if (!start) continue;
        let toks = start.split(' ').filter(Boolean);
        // Drop a trailing "per <unit>" ratio tail, then keep stripping the head.
        const perIdx = toks.indexOf('per');
        if (perIdx > 0) {
            toks = toks.slice(0, perIdx);
            variants.add(toks.join(' '));
        }
        // Iteratively strip trailing pure-unit tokens (keep at least one word).
        while (toks.length > 1 && MEASURE_UNIT_SUFFIX_TOKENS.has(toks[toks.length - 1])) {
            toks = toks.slice(0, -1);
            variants.add(toks.join(' '));
        }
        // Synonym expansion on the stripped core (qty ↔ quantity).
        const syn = toks.map(t => MEASURE_TOKEN_SYNONYMS[t] || t);
        if (syn.join(' ') !== toks.join(' ')) variants.add(syn.join(' '));
    }
    return Array.from(variants).filter(Boolean);
}

/**
 * Find a measure mention in the question. Returns the matching declaredKpi
 * name or null. Longest matched variant wins so "Total Revenue" beats
 * "Revenue" and "Net Sales USD" (via "net sales") beats "Sales".
 */
function findMeasure(question, declaredKpis) {
    if (!Array.isArray(declaredKpis) || declaredKpis.length === 0) return null;
    const q = tokenise(question);
    if (!q) return null;
    let best = null;
    let bestLen = 0;
    for (const kpi of declaredKpis) {
        const name = kpi?.name;
        if (typeof name !== 'string' || !name) continue;
        for (const variant of measureVariants(name)) {
            if (variant && q.includes(variant) && variant.length > bestLen) {
                best = name;
                bestLen = variant.length;
            }
        }
    }
    return best;
}

/**
 * Find a dimension (table.column) mention. Returns { table, column, isTime }
 * or null. `isTime` is true when the column name OR the surrounding question
 * matches time keywords.
 *
 * Prefers "by X" matches first, then any name-substring match.
 */
function findDimension(question, schemaTables, opts = {}) {
    if (!Array.isArray(schemaTables) || schemaTables.length === 0) return null;
    const q = tokenise(question);
    if (!q) return null;
    const candidates = [];
    const skipMeasure = tokenise(opts.skipMeasure || '');

    // Pass 1 — explicit column-name match (singular OR plural form).
    for (const t of schemaTables) {
        const tname = t?.name;
        if (typeof tname !== 'string' || !tname) continue;
        for (const c of (t.columns || [])) {
            const cname = c?.name;
            if (typeof cname !== 'string' || !cname) continue;
            const needleC = tokenise(cname);
            if (!needleC) continue;
            if (opts.skipColumn && needleC === tokenise(opts.skipColumn)) continue;
            if (isMeasureInputColumn(cname, c.type)) continue; // measure input, not a group-by dim
            const isTime = isTimeColumn(cname, c.type);
            const variants = nameVariants(cname);
            const explicitBy = variants.some(v =>
                q.includes(`by ${v}`)
                || q.includes(`per ${v}`)
                || q.includes(`by ${pluraliseLower(v)}`),
            );
            // A measure like "Sales YTD" or "Total Sales" naturally contains
            // the base column token "sales". That is not a grouping dimension
            // unless the user explicitly says "by sales".
            if (skipMeasure && variants.some(v => skipMeasure.includes(v)) && !explicitBy) continue;
            const isMatch = variants.some(v => questionMentions(q, v)) || explicitBy;
            if (isMatch) {
                const bonus = explicitBy ? 10 : 0;
                const dimBonus = isDimensionTable(tname) ? DIM_TABLE_BONUS : 0;
                const fkPenalty = isForeignKeyColumn(cname) ? FK_COLUMN_PENALTY : 0;
                const score = Math.max(...variants.map(v => v.length));
                candidates.push({ table: tname, column: cname, isTime, score: score + bonus + dimBonus - fkPenalty });
            }
        }
    }

    // Pass 2 — table-name match. Catches "top 10 customers by revenue" where
    // the user names the entity (Customers table) but not the specific column
    // (CustomerName). Picks the table's most identifying column: first column
    // whose name contains the table's singular form, otherwise the first
    // non-time column.
    if (candidates.length === 0) {
        for (const t of schemaTables) {
            const tname = t?.name;
            if (typeof tname !== 'string' || !tname) continue;
            const needleT = tokenise(tname);
            const tableVariants = nameVariants(tname);
            const singular = needleT.endsWith('s') ? needleT.slice(0, -1) : needleT;
            const matches = q.includes(needleT)
                || q.includes(singular)
                || q.includes(`by ${needleT}`)
                || q.includes(`by ${singular}`)
                || tableVariants.some(v => questionMentions(q, v) || q.includes(`by ${v}`));
            if (!matches) continue;
            const cols = t.columns || [];
            // Prefer a column whose name embeds the singular table name
            // (Customers → CustomerName), then any non-time column.
            const preferred = cols.find(c => {
                if (typeof c?.name !== 'string') return false;
                const n = tokenise(c.name);
                const variants = nameVariants(c.name);
                if (opts.skipColumn && n === tokenise(opts.skipColumn)) return false;
                if (skipMeasure && variants.some(v => skipMeasure.includes(v))) return false;
                if (isMeasureInputColumn(c.name, c.type)) return false;
                return (n.includes(singular) || variants.some(v => tableVariants.some(tv => v.includes(tv))))
                    && !isTimeColumn(c.name, c.type);
            }) || cols.find(c => {
                if (typeof c?.name !== 'string') return false;
                const variants = nameVariants(c.name);
                if (opts.skipColumn && tokenise(c.name) === tokenise(opts.skipColumn)) return false;
                if (skipMeasure && variants.some(v => skipMeasure.includes(v))) return false;
                if (isMeasureInputColumn(c.name, c.type)) return false;
                return !isTimeColumn(c.name, c.type);
            });
            if (preferred?.name) {
                const isTime = isTimeColumn(preferred.name, preferred.type);
                const dimBonus = isDimensionTable(tname) ? DIM_TABLE_BONUS : 0;
                const fkPenalty = isForeignKeyColumn(preferred.name) ? FK_COLUMN_PENALTY : 0;
                candidates.push({ table: tname, column: preferred.name, isTime, score: 5 + dimBonus - fkPenalty });
            }
        }
    }

    if (candidates.length === 0) {
        // Pass 3 — heuristic fallback: pick a time column if the question
        // has time keywords (used by the trend route).
        if (opts.timeKeywordsOnly) {
            for (const t of schemaTables) {
                for (const c of (t.columns || [])) {
                    if (isTimeColumn(c?.name, c?.type)) {
                        return { table: t.name, column: c.name, isTime: true };
                    }
                }
            }
        }
        return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];
    return { table: winner.table, column: winner.column, isTime: winner.isTime };
}

function isTimeColumn(name, type) {
    if (typeof name === 'string') {
        const n = name.toLowerCase();
        if (TIME_DIMENSION_NAME_HINTS.some(h => n.includes(h))) return true;
    }
    if (typeof type === 'string') {
        const t = type.toLowerCase();
        if (t.includes('date') || t.includes('time')) return true;
    }
    return false;
}

// Power BI INFO.COLUMNS reports types like "Integer", "Double", "Decimal",
// "Text", "Date". A numeric column that is NOT a time grain (year/month) is a
// measure INPUT, never a grouping dimension — grouping a measure by another
// measure-input column produces nonsense (e.g. "Top 5 <dim> by Ordered Qty"
// mis-parsed as group-by ordered_qty → "Top 5 ordered_qty by ordered qty").
// Missing/opaque type → not excluded (fall back to name-based ranking).
const NUMERIC_COLUMN_TYPE_RE = /(int|long|double|decimal|float|number|currency|money)/i;
function isMeasureInputColumn(name, type) {
    if (isTimeColumn(name, type)) return false;
    return typeof type === 'string' && NUMERIC_COLUMN_TYPE_RE.test(type);
}

function hasTimeKeyword(question) {
    const q = tokenise(question);
    return q.split(' ').some(tok => TIME_KEYWORDS.has(tok));
}

/**
 * Extract a leading top-N count from the question (number or word).
 * Returns the integer or null.
 */
function findTopN(question) {
    const q = tokenise(question);
    // "top 10" / "top ten" / "best 5" / "leading 20"
    for (const phrase of TOP_N_PHRASES) {
        const re = new RegExp(`\\b${phrase}\\s+(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\b`);
        const m = q.match(re);
        if (m) {
            const tok = m[1];
            const n = NUMBER_WORDS[tok] != null ? NUMBER_WORDS[tok] : parseInt(tok, 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }
    // "top X" without a number → default 10
    for (const phrase of TOP_N_PHRASES) {
        const re = new RegExp(`\\b${phrase}\\b`);
        if (re.test(q)) return 10;
    }
    return null;
}

/* ───── Public API ─────────────────────────────────────────────────── */

/**
 * Match a question against the probed Power BI schema.
 *
 * @param {string} question
 * @param {{ declaredKpis?: Array<{ name: string }>, schema?: { tables: Array<{ name: string, columns: Array<{ name: string, type?: string }> }> } }} probe
 * @returns {{ matched: true, templateId: string, slots: object } | { matched: false, suggestions: Array<{ id: string, label: string, examples: string[] }>, reason: string, kpis: string[] }}
 */
/** Power BI internal per-table `RowNumber-<guid>` column. The prober
 *  filters these at the source (connectorProbe), but clients can send a
 *  STALE cached probe inline (`probeSource: "inline"`) that still carries
 *  them — and a RowNumber grouper makes every aggregate-by/top-n DAX
 *  query 400. Defense in depth: never treat one as a dimension here. */
const PBI_INTERNAL_COLUMN_REGEX = /^RowNumber-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripInternalColumns(tables) {
    return tables.map(t => ({
        ...t,
        columns: (t.columns || []).filter(c => !PBI_INTERNAL_COLUMN_REGEX.test(String(c?.name || ''))),
    }));
}

function matchQuestion(question, probe) {
    const measures = Array.isArray(probe?.declaredKpis) ? probe.declaredKpis : [];
    const tables = stripInternalColumns(Array.isArray(probe?.schema?.tables) ? probe.schema.tables : []);

    const measure = findMeasure(question, measures);
    if (!measure) {
        return {
            matched: false,
            reason: 'No known measure was mentioned in the question.',
            suggestions: listTemplates(),
            kpis: measures.map(k => k.name).filter(Boolean).slice(0, 20),
        };
    }

    const timeKw = hasTimeKeyword(question);
    const dimension = findDimension(question, tables, { skipColumn: measure, skipMeasure: measure });
    const isTimeDimension = dimension?.isTime || (timeKw && !!dimension);

    const topN = findTopN(question);

    // Decision tree.
    if (isTimeDimension && dimension) {
        return {
            matched: true,
            templateId: 'trend',
            slots: { measure, dateTable: dimension.table, dateColumn: dimension.column },
        };
    }
    if (timeKw && !dimension) {
        // Time-keyword in question but no explicit time column matched —
        // try a fallback to find any date column in the schema.
        const fallback = findDimension(question, tables, { timeKeywordsOnly: true, skipColumn: measure, skipMeasure: measure });
        if (fallback?.isTime) {
            return {
                matched: true,
                templateId: 'trend',
                slots: { measure, dateTable: fallback.table, dateColumn: fallback.column },
            };
        }
    }
    if (topN != null && dimension) {
        return {
            matched: true,
            templateId: 'top-n',
            slots: { measure, dimensionTable: dimension.table, dimensionColumn: dimension.column, n: topN },
        };
    }
    if (dimension) {
        return {
            matched: true,
            templateId: 'aggregate-by',
            slots: { measure, dimensionTable: dimension.table, dimensionColumn: dimension.column },
        };
    }
    // Measure only, no dimension and no time intent.
    return {
        matched: true,
        templateId: 'total',
        slots: { measure },
    };
}

/**
 * A2 — Deterministic DAX templates compute a measure, optionally grouped by a
 * dimension or top-N. They NEVER apply a value/row filter (no WHERE on values).
 * So a "for the X" / "in X" / "where X" qualifier in the question is always
 * DROPPED — the answer is computed over the full dataset. This detector surfaces
 * such filter intent (minus the matched dimension itself) so the caller can
 * DISCLOSE the unscoped answer rather than silently answering as if the filter
 * applied. Conservative: only fires on explicit for/in/within/where triggers,
 * and excludes the exact matched dimension column/table.
 *
 * @param {string} question
 * @param {{ dimensionColumn?: string, dateColumn?: string, dimensionTable?: string, dateTable?: string }} [slots]
 * @returns {string[]} dropped qualifier phrases (deduped, max 3); empty when none
 */
function detectDroppedScope(question, slots) {
    const dimCol = String(slots?.dimensionColumn || slots?.dateColumn || '').toLowerCase().trim();
    const dimTable = String(slots?.dimensionTable || slots?.dateTable || '').toLowerCase().trim();
    const re = /\b(?:for|in|within|where|filtered to|restricted to|only for|just for)\s+(?:the\s+)?([a-z0-9][a-z0-9 '&_-]{1,40}?)(?=[.,?!]|$|\s+(?:and|or|by|per|grouped|broken|over)\b)/gi;
    const dropped = [];
    let m;
    while ((m = re.exec(String(question || ''))) !== null) {
        const phrase = m[1].trim().replace(/\s+/g, ' ');
        const low = phrase.toLowerCase();
        if (low.length < 2) continue;
        if (low === dimCol || low === dimTable) continue; // it's the matched dimension, not a value filter
        dropped.push(phrase);
    }
    return [...new Set(dropped)].slice(0, 3);
}

module.exports = {
    matchQuestion,
    detectDroppedScope,
    __internals: {
        tokenise,
        nameVariants,
        measureVariants,
        findMeasure,
        findDimension,
        findTopN,
        hasTimeKeyword,
        isTimeColumn,
        isDimensionTable,
        isForeignKeyColumn,
        isMeasureInputColumn,
    },
};
