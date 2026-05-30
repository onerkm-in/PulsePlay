// @ts-check
'use strict';

/**
 * discoveryEngine.js — Phase A of Discovery Loop.
 *
 * Fuses three inputs into a single DiscoverySnapshot:
 *   1. ConnectorProbeResult (AI brain side) — from connectorProbe.js
 *   2. BIMetadata (BI surface side) — from BIAdapter.getMetadata() (forwarded
 *      by the client; the proxy never reaches into the BI iframe)
 *   3. Pack KPI list — parsed from `pulsepacks/<pack>/<sv>/kpis.md`
 *
 * Output: reachable analysis frames (BCG / SWOT / Pareto / vertical presets)
 * with proposed parameter defaults. UI uses this to render the Frame dropdown
 * with greyed-out unreachable frames + tooltip explaining what's missing.
 *
 * See docs/DISCOVERY_LOOP.md for the full spec.
 *
 * No LLM calls. No SQL execution. Pure schema + metadata fusion.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { isSafePackSegment } = require('./packRegistry');

const DEFAULT_PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');
const DEFAULT_CACHE_TTL_MS = 60 * 1000;        // 60 sec — proxy-side absorb the herd
const DEFAULT_CACHE_MAX_ENTRIES = 200;
const SNAPSHOT_VERSION = 1;

/* ─── Frame prerequisites ────────────────────────────────────────────── */

/**
 * Hardcoded reachability prerequisites for known strategic + vertical
 * frames. Mirrors the preset library in
 * `playground/src/pulse/insightsPresetLibrary.ts` and
 * `playground/src/pulse/_packs/cpgFmcgPresets.ts`. Phase C migrates these
 * to the IR (`output.prerequisites`) so authors own the contract; until
 * then this table is the source of truth proxy-side.
 *
 * A prerequisite says: "this frame needs at least N visible signals of
 * the listed kinds." When all prerequisites are satisfied, the frame is
 * reachable. Otherwise the user sees a greyed entry with the missing-prereq
 * tooltip.
 *
 * @typedef {Object} FramePrerequisites
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} domain
 * @property {boolean} [alwaysReachable]
 *   When true, no schema/data prerequisite — the frame is qualitative or
 *   relies on author-curated content (SWOT, ontology-driven prompts).
 * @property {{kind: "currency" | "percent" | "count" | "ratio" | "rate", minCount: number}} [needsMeasure]
 * @property {boolean} [needsTimeDimension]
 * @property {{kinds: Array<"product" | "customer" | "channel" | "geography" | "any">, minCount: number}} [needsCategoricalDimension]
 * @property {string[]} [signalKeywords]
 *   Soft signals — when the probe's declaredKpis or BIMetadata.visibleMeasures
 *   contain any of these keywords, the frame's confidence increases.
 *   Currently informational only; future Phase C may use this to RANK
 *   reachable frames.
 */

/** @type {FramePrerequisites[]} */
const FRAME_PREREQUISITES = [
    // ── Strategic frameworks (cross-cutting) ────────────────────────────────
    {
        id: 'swot-analysis',
        label: 'SWOT analysis',
        description: 'Strengths, weaknesses, opportunities, threats — quantified.',
        domain: 'Strategic Analysis',
        // SWOT works on any data; the LLM does the qualitative framing.
        // Even a thin schema can produce a usable SWOT given vocabulary.
        alwaysReachable: true,
        signalKeywords: ['margin', 'growth', 'profit', 'revenue', 'share'],
    },
    {
        id: 'bcg-matrix',
        label: 'BCG growth-share matrix',
        description: 'Stars, Cash Cows, Question Marks, Dogs — using median splits.',
        domain: 'Strategic Analysis',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsTimeDimension: true,
        needsCategoricalDimension: { kinds: ['product', 'customer', 'any'], minCount: 1 },
        signalKeywords: ['share', 'growth', 'revenue', 'margin'],
    },
    {
        id: 'rfm-segmentation',
        label: 'RFM customer segmentation',
        description: 'Recency / Frequency / Monetary clustering.',
        domain: 'Customer Success',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsTimeDimension: true,
        needsCategoricalDimension: { kinds: ['customer'], minCount: 1 },
        signalKeywords: ['customer', 'order', 'frequency', 'recency'],
    },
    {
        id: 'pareto-8020',
        label: 'Pareto 80/20 analysis',
        description: 'Concentration analysis — find the few that drive the many.',
        domain: 'Strategic Analysis',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsCategoricalDimension: { kinds: ['any'], minCount: 1 },
        signalKeywords: ['concentration', 'top', 'cumulative', 'share'],
    },
    {
        id: 'variance-bridge',
        label: 'Variance / waterfall analysis',
        description: 'Decompose YoY profit + revenue change into drivers.',
        domain: 'Financial Analysis',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsTimeDimension: true,
        signalKeywords: ['variance', 'bridge', 'volume', 'price', 'mix'],
    },
    {
        id: 'anomaly-detection',
        label: 'Anomaly / outlier detection',
        description: 'Statistical outliers across categories and time.',
        domain: 'Strategic Analysis',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsTimeDimension: true,
        signalKeywords: ['anomaly', 'outlier', 'spike', 'deviation'],
    },

    // ── CPG/FMCG vertical presets ────────────────────────────────────────────
    {
        id: 'cpg-fmcg-supply-chain',
        label: 'CPG · Supply chain',
        description: 'OTIF, fill rate, forecast accuracy, inventory health.',
        domain: 'CPG / Supply Chain',
        needsMeasure: { kind: 'percent', minCount: 1 },
        signalKeywords: ['otif', 'fill', 'forecast', 'inventory', 'service'],
    },
    {
        id: 'cpg-fmcg-procurement',
        label: 'CPG · Procurement',
        description: 'Spend, supplier risk, contract intelligence, savings pipeline.',
        domain: 'CPG / Procurement',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsCategoricalDimension: { kinds: ['any'], minCount: 1 },
        signalKeywords: ['spend', 'supplier', 'contract', 'savings'],
    },
    {
        id: 'cpg-fmcg-manufacturing',
        label: 'CPG · Manufacturing',
        description: 'OEE, yield, downtime decomposition, quality + safety.',
        domain: 'CPG / Manufacturing',
        needsMeasure: { kind: 'percent', minCount: 1 },
        signalKeywords: ['oee', 'yield', 'downtime', 'scrap'],
    },
    {
        id: 'cpg-fmcg-commercial-retail',
        label: 'CPG · Commercial & retail',
        description: 'Revenue growth, trade promo, retail execution, digital shelf.',
        domain: 'CPG / Commercial',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsCategoricalDimension: { kinds: ['customer', 'product'], minCount: 1 },
        signalKeywords: ['revenue', 'promo', 'retailer', 'digital shelf'],
    },
    {
        id: 'cpg-fmcg-finance-fpa',
        label: 'CPG · Finance & FP&A',
        description: 'Margin bridge, working capital, FP&A, scenarios.',
        domain: 'CPG / Finance',
        needsMeasure: { kind: 'currency', minCount: 1 },
        needsTimeDimension: true,
        signalKeywords: ['margin', 'working capital', 'cash', 'forecast'],
    },
    {
        id: 'cpg-fmcg-hr',
        label: 'CPG · HR & workforce',
        description: 'Headcount, attrition, hiring funnel, flight risk.',
        domain: 'CPG / HR',
        needsMeasure: { kind: 'count', minCount: 1 },
        signalKeywords: ['headcount', 'attrition', 'hiring', 'workforce'],
    },
    {
        id: 'cpg-fmcg-sustainability',
        label: 'CPG · Sustainability',
        description: 'Scope emissions, water, waste, packaging.',
        domain: 'CPG / Sustainability',
        signalKeywords: ['scope', 'emission', 'water', 'waste', 'packaging'],
        // Sustainability data shape varies a lot — leave needsMeasure unset,
        // alwaysReachable false, falls back to keyword-match scoring.
    },
];

/* ─── Pack KPI parsing ───────────────────────────────────────────────── */

/**
 * Parse `pulsepacks/<pack>/<sv>/kpis.md` into structured PackKpi entries.
 * Convention (per pack-spec): each KPI is a level-2 heading; the first
 * paragraph after the heading is the definition. Optional fields are
 * extracted with simple regex patterns from that paragraph.
 *
 * @typedef {Object} PackKpi
 * @property {string} name
 * @property {string} definition
 * @property {"percent" | "currency" | "count" | "ratio" | "days" | "score"} [units]
 * @property {"higher-is-better" | "lower-is-better" | "context-dependent"} [direction]
 *
 * @param {string} pack
 * @param {string} subVertical
 * @param {{ packsRoot?: string }} [opts]
 * @returns {PackKpi[]}
 */
function parsePackKpis(pack, subVertical, opts = {}) {
    if (!isSafePackSegment(pack)) return [];
    if (subVertical && !isSafePackSegment(subVertical)) return [];
    const packsRoot = opts.packsRoot || DEFAULT_PACKS_ROOT;
    const kpisPath = subVertical
        ? path.join(packsRoot, pack, 'sub-verticals', subVertical, 'kpis.md')
        : path.join(packsRoot, pack, 'kpis.md');

    let raw;
    try { raw = fs.readFileSync(kpisPath, 'utf8'); }
    catch { return []; }

    /** @type {PackKpi[]} */
    const out = [];
    // Split on level-2 headings. The first segment is preamble — skip.
    const blocks = raw.split(/^##\s+/m).slice(1);
    for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        const headerLine = lines[0].trim();
        if (!headerLine) continue;
        // Skip housekeeping headers.
        if (/^(cross-references?|notes|references|appendix)\b/i.test(headerLine)) continue;
        // Strip trailing `()` acronyms but keep the display form.
        const name = headerLine.replace(/\s*\([^)]+\)\s*$/, '').trim();
        if (!name) continue;

        // Definition = the next non-empty paragraph.
        const defLines = [];
        let inDef = false;
        for (let i = 1; i < lines.length; i++) {
            const ln = lines[i];
            if (/^##\s/.test(ln)) break;
            if (!inDef && ln.trim() === '') continue;
            if (inDef && ln.trim() === '') break;
            inDef = true;
            defLines.push(ln);
        }
        const definition = defLines.join(' ').trim();
        if (!definition) {
            out.push({ name, definition: '' });
            continue;
        }

        const kpi = /** @type {PackKpi} */ ({ name, definition });
        // Units detection — last word heuristic.
        if (/percentag(e|es)|\bpercent\b|\bpct\b|\b%\b|\bpp\b/i.test(definition)) kpi.units = 'percent';
        else if (/\bdays\b|\bweeks?\b/i.test(definition)) kpi.units = 'days';
        else if (/\bcost-?per|\$|currency|dollars?\b/i.test(definition)) kpi.units = 'currency';
        else if (/\bratio\b/i.test(definition)) kpi.units = 'ratio';
        else if (/\bscore\b|\bindex\b/i.test(definition)) kpi.units = 'score';
        else if (/\bcount\b|\bnumber of\b|\b#\b/i.test(definition)) kpi.units = 'count';

        // Direction detection.
        if (/higher\s+is\s+better|maximize|increase is good/i.test(definition)) kpi.direction = 'higher-is-better';
        else if (/lower\s+is\s+better|minimize|decrease is good/i.test(definition)) kpi.direction = 'lower-is-better';
        else if (/context-?dependent|depends on/i.test(definition)) kpi.direction = 'context-dependent';

        out.push(kpi);
    }
    return out;
}

/* ─── Fusion ──────────────────────────────────────────────────────────── */

/**
 * Build a complete DiscoverySnapshot from the three inputs.
 *
 * @typedef {Object} BIMetadata
 * @property {string | null} [activeViewId]
 * @property {Array<{name: string, kind?: string, format?: string, aggregation?: string}>} [visibleMeasures]
 * @property {Array<{name: string, kind?: string, cardinalityHint?: string}>} [visibleDimensions]
 * @property {Array<{field: string, value: unknown}>} [activeFilters]
 *
 * @typedef {Object} BuildSnapshotInput
 * @property {object | null} probe                  Output of probeConnector
 * @property {BIMetadata | null} [biMetadata]
 * @property {string} [pack]
 * @property {string} [subVertical]
 * @property {string} [cacheKey]                    Caller-computed cache key (sha256 hex)
 * @property {string[]} [warnings]                  Existing warnings (prepended)
 *
 * @param {BuildSnapshotInput} input
 * @param {{ packsRoot?: string, frames?: FramePrerequisites[] }} [opts]
 */
function buildSnapshot(input, opts = {}) {
    const warnings = Array.isArray(input.warnings) ? [...input.warnings] : [];
    const probe = input.probe || null;
    const biMetadata = input.biMetadata || null;
    const frames = opts.frames || FRAME_PREREQUISITES;
    const now = Date.now();

    const packKpis = (input.pack && input.subVertical)
        ? parsePackKpis(input.pack, input.subVertical, { packsRoot: opts.packsRoot })
        : (input.pack ? parsePackKpis(input.pack, '', { packsRoot: opts.packsRoot }) : []);

    // Fuse KPIs: pack KPIs win, augment with probe-only schema columns + BI surface measures.
    const fusedKpis = fuseKpis({ packKpis, probe, biMetadata });

    // Categorical dimensions (BI side primarily).
    const biDimensions = Array.isArray(biMetadata?.visibleDimensions)
        ? biMetadata.visibleDimensions.map(d => ({
            name: String(d?.name || ''),
            kind: typeof d?.kind === 'string' ? d.kind : null,
            cardinalityHint: typeof d?.cardinalityHint === 'string' ? d.cardinalityHint : null,
        })).filter(d => d.name)
        : [];

    // Time dimension detection: any dimension with kind==="time" OR
    // any column whose name contains "date" / "time" / "week" / "month" / "year".
    const hasTimeDim = _hasTimeDimension(biDimensions, probe);

    // Evaluate reachability per frame.
    /** @type {ReachableFrame[]} */
    const reachable = [];
    /** @type {UnreachableFrame[]} */
    const unreachable = [];
    for (const fr of frames) {
        const verdict = evaluateReachability(fr, { fusedKpis, biDimensions, hasTimeDim });
        if (verdict.ok) {
            reachable.push({
                frameId: fr.id,
                label: fr.label,
                description: fr.description,
                domain: fr.domain,
                rationale: verdict.rationale,
                params: {},   // Phase A: empty — Phase C populates via proposeParams()
            });
        } else {
            unreachable.push({
                frameId: fr.id,
                label: fr.label,
                description: fr.description,
                domain: fr.domain,
                blockedBy: verdict.blockedBy,
            });
        }
    }

    return {
        snapshotVersion: SNAPSHOT_VERSION,
        fetchedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),  // 15 min — matches client-side TTL
        cacheKey: input.cacheKey || null,
        sources: {
            probe: probe ? _summariseProbe(probe) : null,
            biMetadata,
            packKpis,
        },
        fused: {
            availableKpis: fusedKpis,
            reachableFrames: reachable,
            unreachableFrames: unreachable,
        },
        warnings,
    };
}

/* ─── Fusion internals ───────────────────────────────────────────────── */

function fuseKpis({ packKpis, probe, biMetadata }) {
    /** @type {Array<{name: string, source: string, definition?: string, units?: string, direction?: string, grounded: Array<{table:string, column:string}>, aligned: boolean}>} */
    const out = [];
    const seen = new Set();
    const schemaColumns = _flatSchemaColumns(probe);
    const biMeasureNames = Array.isArray(biMetadata?.visibleMeasures)
        ? biMetadata.visibleMeasures.map(m => String(m?.name || '').trim()).filter(Boolean)
        : [];

    // Layer 1: pack KPIs — highest trust.
    for (const k of packKpis) {
        const grounded = schemaColumns.filter(c => _kpiMatchesColumn(k.name, c.column));
        const aligned = grounded.length > 0
            || biMeasureNames.some(n => _fuzzyEqual(k.name, n));
        out.push({
            name: k.name,
            source: 'pack',
            definition: k.definition,
            units: k.units,
            direction: k.direction,
            grounded,
            aligned,
        });
        seen.add(_normaliseName(k.name));
    }

    // Layer 2: declared KPIs in probe — augment.
    const declared = Array.isArray(probe?.declaredKpis) ? probe.declaredKpis : [];
    for (const d of declared) {
        const name = typeof d === 'string' ? d : (d?.name || '');
        if (!name) continue;
        const key = _normaliseName(name);
        if (seen.has(key)) continue;
        out.push({
            name,
            source: 'probe',
            definition: typeof d === 'object' ? (d?.description || '') : '',
            grounded: schemaColumns.filter(c => _kpiMatchesColumn(name, c.column)),
            aligned: false,
        });
        seen.add(key);
    }

    // Layer 3: BI-visible measures the pack/probe didn't know about.
    for (const name of biMeasureNames) {
        const key = _normaliseName(name);
        if (seen.has(key)) continue;
        out.push({
            name,
            source: 'bi-surface',
            grounded: schemaColumns.filter(c => _kpiMatchesColumn(name, c.column)),
            aligned: false,
        });
        seen.add(key);
    }

    return out;
}

function evaluateReachability(frame, ctx) {
    if (frame.alwaysReachable) {
        return { ok: true, rationale: 'Always reachable — qualitative or vocabulary-driven frame.' };
    }
    const reasons = [];

    if (frame.needsMeasure) {
        const matched = ctx.fusedKpis.filter(k => k.units && k.units === frame.needsMeasure.kind);
        if (matched.length < frame.needsMeasure.minCount) {
            return {
                ok: false,
                blockedBy: `Needs at least ${frame.needsMeasure.minCount} ${frame.needsMeasure.kind} measure(s); found ${matched.length}.`,
            };
        }
        reasons.push(`${matched.length} ${frame.needsMeasure.kind} measure(s) available`);
    }
    if (frame.needsTimeDimension && !ctx.hasTimeDim) {
        return { ok: false, blockedBy: 'Needs a time dimension (date / week / month / year); none detected.' };
    }
    if (frame.needsTimeDimension) reasons.push('time dimension present');

    if (frame.needsCategoricalDimension) {
        const kinds = frame.needsCategoricalDimension.kinds;
        const matched = ctx.biDimensions.filter(d => {
            // Time dimensions are never categorical — exclude them even when
            // prereq is "any". A BCG chart needs a product/customer/region
            // axis, not the time axis it's also using for the growth axis.
            if (d.kind === 'time') return false;
            if (!d.kind) return kinds.includes('any');
            return kinds.includes('any') || kinds.includes(d.kind);
        });
        if (matched.length < frame.needsCategoricalDimension.minCount) {
            return {
                ok: false,
                blockedBy: `Needs at least ${frame.needsCategoricalDimension.minCount} ${kinds.join('/')} dimension(s); found ${matched.length}.`,
            };
        }
        reasons.push(`${matched.length} categorical dimension(s) match`);
    }

    return { ok: true, rationale: reasons.length > 0 ? reasons.join('; ') : 'No specific prerequisites declared.' };
}

function _hasTimeDimension(biDimensions, probe) {
    if (biDimensions.some(d => d.kind === 'time')) return true;
    if (biDimensions.some(d => _looksTemporal(d.name))) return true;
    const cols = _flatSchemaColumns(probe);
    if (cols.some(c => _looksTemporal(c.column))) return true;
    return false;
}

function _looksTemporal(name) {
    return /\b(date|datetime|timestamp|time|day|week|month|quarter|year|period|fiscal)\b/i.test(String(name || ''));
}

function _flatSchemaColumns(probe) {
    const out = [];
    const tables = probe?.schema?.tables;
    if (!Array.isArray(tables)) return out;
    for (const t of tables) {
        const tableName = t?.name || '';
        const cols = Array.isArray(t?.columns) ? t.columns : [];
        for (const c of cols) {
            const col = c?.name || '';
            if (!col) continue;
            out.push({ table: tableName, column: col });
        }
    }
    return out;
}

function _kpiMatchesColumn(kpiName, columnName) {
    return _fuzzyEqual(kpiName, columnName);
}

function _fuzzyEqual(a, b) {
    return _normaliseName(a) === _normaliseName(b);
}

function _normaliseName(s) {
    return String(s || '').toLowerCase().replace(/[\s_\-.]+/g, '');
}

function _summariseProbe(probe) {
    // The full ConnectorProbeResult can be sizeable. The snapshot keeps only
    // the fields downstream UI needs; raw probe is accessible via
    // /assistant/probe directly when callers want everything.
    return {
        profile: probe.profile || null,
        connectorType: probe.connectorType || null,
        metadataAvailability: probe.metadataAvailability || 'none',
        displayName: probe.displayName || null,
        tableCount: Array.isArray(probe.schema?.tables) ? probe.schema.tables.length : 0,
        declaredKpiCount: Array.isArray(probe.declaredKpis) ? probe.declaredKpis.length : 0,
        sampleQuestionCount: Array.isArray(probe.sampleQuestions) ? probe.sampleQuestions.length : 0,
        warnings: Array.isArray(probe.warnings) ? probe.warnings.slice(0, 10) : [],
    };
}

/* ─── Cache ──────────────────────────────────────────────────────────── */

/**
 * Proxy-side in-memory cache. Keyed on caller-computed sha256 of
 * (assistantProfile, pack, subVertical, biUrlHash). 60-sec TTL absorbs
 * "5 users on the same dashboard" thundering herds without hammering Genie.
 * LRU eviction at 200 entries.
 */
const _snapshotCache = new Map(); // key → { snapshot, expiresAt }

function computeCacheKey({ assistantProfile, pack, subVertical, biUrlHash }) {
    const parts = [
        String(assistantProfile || ''),
        String(pack || ''),
        String(subVertical || ''),
        String(biUrlHash || ''),
    ];
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function getCachedSnapshot(key, now = Date.now()) {
    if (!key) return null;
    const entry = _snapshotCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
        _snapshotCache.delete(key);
        return null;
    }
    // Re-insert to refresh LRU order.
    _snapshotCache.delete(key);
    _snapshotCache.set(key, entry);
    return entry.snapshot;
}

function setCachedSnapshot(key, snapshot, ttlMs = DEFAULT_CACHE_TTL_MS) {
    if (!key) return;
    if (_snapshotCache.size >= DEFAULT_CACHE_MAX_ENTRIES) {
        const oldest = _snapshotCache.keys().next().value;
        if (oldest !== undefined) _snapshotCache.delete(oldest);
    }
    _snapshotCache.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
}

function __resetCacheForTests() {
    _snapshotCache.clear();
}

module.exports = {
    // Public API
    buildSnapshot,
    parsePackKpis,
    computeCacheKey,
    getCachedSnapshot,
    setCachedSnapshot,
    evaluateReachability,
    fuseKpis,
    // Constants
    FRAME_PREREQUISITES,
    DEFAULT_CACHE_TTL_MS,
    DEFAULT_CACHE_MAX_ENTRIES,
    SNAPSHOT_VERSION,
    // Test hooks
    __resetCacheForTests,
};
