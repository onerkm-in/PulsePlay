// proxy/lib/insightsValidator.js
//
// Cycle 44 (A) — JS mirror of genieChatVisual/src/insightsStageValidator.ts.
// Lives server-side so the OpenAI / Bedrock orchestrator paths in
// llmOrchestrator.js can run the SAME format-compliance checks the
// Genie hybrid pipeline already does in the visual. Connector-agnostic
// validation by construction.
//
// Pure functions, shape-only, no DOM, no React. Mirrors the TS module
// rule-by-rule. Update both modules together if you tune the validators.
// Tests should cover the parity (TODO: add proxy/tests/insightsValidator.test.js).

const IMPERATIVE_VERBS = new Set([
    'increase', 'reduce', 'reallocate', 'pilot', 'prioritize', 'audit',
    'cut', 'shift', 'renegotiate', 'launch', 'investigate', 'restructure',
    'replace', 'test', 'roll', 'rolled', 'rollout', 'defend', 'expand',
    'consolidate', 'eliminate', 'accelerate', 'deprioritize', 'freeze',
    'unfreeze', 'deploy', 'implement', 'monitor', 'negotiate', 'outsource',
    'insource', 'approve', 'reject', 'delay', 'fast-track', 'fasttrack',
    'scale', 'downscale', 'upscale', 'establish', 'adopt', 'abandon',
    'review', 'validate', 'rebalance', 'redirect', 'retain', 'decommission',
    'boost', 'strengthen', 'weaken', 'double', 'halve',
    'triple', 'quadruple', 'track', 'instrument', 'measure', 'benchmark',
    'set', 'target', 'raise', 'lower', 'lift', 'trim',
]);

const NOUN_PHRASE_PROSE_STARTS = [
    /^profit margins? vary/i,
    /^total sales (have|has) shown/i,
    /^sales performance has/i,
    /^the highest is/i,
    /^the lowest is/i,
    /^year[- ]over[- ]year/i,
    /^notable data points/i,
    /^observations? include/i,
    /^analysis shows/i,
    /^performance has been/i,
    /^this period saw/i,
    /^we observe/i,
    /^we see/i,
];

function isNumberedListBody(body) {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const firstContentLine = lines.find(l => !l.startsWith('#'));
    if (!firstContentLine) return false;
    return /^1\.\s+/.test(firstContentLine);
}

function countNumberedItems(body) {
    const matches = body.match(/^\s*[123]\.\s+/gm);
    return matches ? matches.length : 0;
}

function countBulletItems(body) {
    const matches = body.match(/^\s*[-*•]\s+/gm);
    return matches ? matches.length : 0;
}

function hasPipeTable(body) {
    return /^\s*\|.+\|\s*$\n^\s*\|[-:\s|]+\|\s*$/m.test(body);
}

function startsWithImperativeVerb(line) {
    const stripped = line
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\*\*/, '')
        .trim();
    const firstWord = stripped.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, '');
    if (!firstWord) return false;
    return IMPERATIVE_VERBS.has(firstWord);
}

function startsWithNounPhraseProse(body) {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const firstContentLine = lines.find(l => !l.startsWith('#'));
    if (!firstContentLine) return false;
    return NOUN_PHRASE_PROSE_STARTS.some(re => re.test(firstContentLine));
}

// ── Cycle 47.5 — semantic helpers (JS mirror of TS module) ────────────────
const NUMERIC_TOKEN_RE = /[$€£¥]?\d[\d,]*(?:\.\d+)?(?:%|pp|K|M|B)?/gi;

function countNumericTokens(text) {
    const m = String(text || '').match(NUMERIC_TOKEN_RE);
    return m ? m.length : 0;
}

function listItemBodies(body) {
    const out = [];
    const lines = String(body || '').split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        const numMatch = line.match(/^\d+\.\s+(.+)$/);
        const bulMatch = line.match(/^[-*•]\s+(.+)$/);
        if (numMatch) out.push(numMatch[1]);
        else if (bulMatch) out.push(bulMatch[1]);
    }
    return out;
}

function validateRecommendedActions(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    if (!isNumberedListBody(body)) {
        return {
            ok: false,
            reason: 'body does not start with `1.` numbered list',
            retryDirective:
                'STRUCTURAL FAILURE: your previous output for RECOMMENDED ACTIONS did NOT begin with `1.`. ' +
                'The body MUST be a NUMBERED LIST of EXACTLY 3 items starting with `1.`, `2.`, `3.`. ' +
                'Each item MUST start with an IMPERATIVE VERB (Reallocate, Audit, Pilot, Investigate, ' +
                'Reduce, Cut, Shift, Launch, Defend, Eliminate, etc.).',
        };
    }
    const numItems = countNumberedItems(body);
    if (numItems < 2 || numItems > 4) {
        return {
            ok: false,
            reason: `expected 3 numbered items, got ${numItems}`,
            retryDirective:
                `STRUCTURAL FAILURE: your previous output had ${numItems} numbered items. ` +
                'The contract requires EXACTLY 3 numbered items in RECOMMENDED ACTIONS.',
        };
    }
    if (startsWithNounPhraseProse(body)) {
        return {
            ok: false,
            reason: 'body looks like descriptive prose, not actions',
            retryDirective:
                'STRUCTURAL FAILURE: your previous output read as a descriptive paragraph. ' +
                'RECOMMENDED ACTIONS is NOT analysis — it is 3 numbered imperative actions.',
        };
    }
    const firstItemMatch = body.match(/^\s*1\.\s+(.+)$/m);
    if (firstItemMatch && !startsWithImperativeVerb(firstItemMatch[1])) {
        return {
            ok: false,
            reason: 'first action does not start with an imperative verb',
            retryDirective:
                'STRUCTURAL FAILURE: your first numbered action did not start with an imperative verb. ' +
                'Each item MUST begin with an imperative verb (Reallocate, Audit, Pilot, Investigate, etc.).',
        };
    }
    // Cycle 47.5 — semantic check: each action should name a NUMERIC
    // expected impact. Floor: at least one item must contain a number.
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric === 0) {
        return {
            ok: false,
            reason: 'no actions cite a numeric target or impact',
            retryDirective:
                'SEMANTIC FAILURE: none of your numbered actions cite a NUMERIC target or expected impact ' +
                '(e.g. `lift margin by 1pp`, `recover $50K`). Each action MUST include at least one specific metric value.',
        };
    }
    return { ok: true };
}

function validateRisks(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected ~3 bullet/numbered items, got ${numItems}`,
            retryDirective: 'STRUCTURAL FAILURE: RISKS body must be a list of EXACTLY 3 risks (numbered or bulleted).',
        };
    }
    // Cycle 47.5 — semantic check: at least one risk should cite a numeric magnitude.
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric === 0) {
        return {
            ok: false,
            reason: 'no risks cite a numeric magnitude',
            retryDirective:
                'SEMANTIC FAILURE: none of your risk bullets cite a numeric magnitude (e.g. `2.49% margin`, ' +
                '`14.9pp gap`, `top 5 customers = 18% of sales`). Risks without numbers are unverifiable.',
        };
    }
    return { ok: true };
}

function validateTrends(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    // Cycle 47.5 — upgraded from "any digit" to "≥2 numeric tokens".
    // Year-over-year, deltas, growth comparisons all require contrasting
    // at least two values. A single number is insufficient.
    const numericCount = countNumericTokens(body);
    if (numericCount < 2) {
        return {
            ok: false,
            reason: `expected ≥2 numeric tokens, got ${numericCount}`,
            retryDirective:
                'STRUCTURAL FAILURE: TRENDS must cite at least TWO specific numeric values (typically ' +
                'a current value AND a prior value to show the trend). Rewrite citing ≥3 metric values ' +
                'with year-over-year, period-over-period, or delta framing.',
        };
    }
    return { ok: true };
}

function validateKpiSnapshot(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    if (hasPipeTable(body)) return { ok: true };
    const numericMatches = body.match(/[$€£¥]?[\d,]+(\.\d+)?%?/g);
    if (!numericMatches || numericMatches.length < 3) {
        return {
            ok: false,
            reason: 'no table and < 3 metric values',
            retryDirective: 'STRUCTURAL FAILURE: KPI SNAPSHOT must surface key metrics either as a markdown pipe-table OR as a bullet list with ≥3 metric values.',
        };
    }
    return { ok: true };
}

function validateHeadline(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    if (isNumberedListBody(body)) {
        return {
            ok: false,
            reason: 'HEADLINE leaked into a numbered-list format',
            retryDirective: 'STRUCTURAL FAILURE: HEADLINE is a paragraph, NOT a numbered list.',
        };
    }
    return { ok: true };
}

function validateOpportunities(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected ~3 list items, got ${numItems}`,
            retryDirective: 'STRUCTURAL FAILURE: OPPORTUNITIES must be a list of 3 opportunities (numbered or bulleted).',
        };
    }
    return { ok: true };
}

function validateDrivers(body) {
    if (!body.trim()) return { ok: false, reason: 'empty body' };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected 2-3 driver items, got ${numItems}`,
            retryDirective: 'STRUCTURAL FAILURE: DRIVERS must be a list of 2-3 top contributors with metric values.',
        };
    }
    // Cycle 47.5 — semantic check: drivers must be quantitative.
    // Floor: at least HALF the items should cite a number.
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric * 2 < items.length) {
        return {
            ok: false,
            reason: `only ${itemsWithMetric}/${items.length} drivers cite a metric value`,
            retryDirective:
                'SEMANTIC FAILURE: a top-contributors list must cite the actual metric values that make a ' +
                'contributor a top contributor. Rewrite each driver as `**name**: contribution number`.',
        };
    }
    return { ok: true };
}

const UNIVERSAL_VALIDATED_TITLES = new Set([
    'RECOMMENDED ACTIONS',
    'RISKS',
    'TRENDS',
    'KPI SNAPSHOT',
    'HEADLINE',
    'OPPORTUNITIES',
    'DRIVERS',
    'HEADLINE + KPI SNAPSHOT',
]);

function validateStageOutput(title, body) {
    const upper = (title || '').trim().toUpperCase();
    if (!upper) return { ok: true };
    if (!UNIVERSAL_VALIDATED_TITLES.has(upper)) return { ok: true };
    switch (upper) {
        case 'RECOMMENDED ACTIONS':         return validateRecommendedActions(body);
        case 'RISKS':                       return validateRisks(body);
        case 'TRENDS':                      return validateTrends(body);
        case 'KPI SNAPSHOT':                return validateKpiSnapshot(body);
        case 'HEADLINE':                    return validateHeadline(body);
        case 'HEADLINE + KPI SNAPSHOT': {
            const head = validateHeadline(body);
            return head.ok ? validateKpiSnapshot(body) : head;
        }
        case 'OPPORTUNITIES':               return validateOpportunities(body);
        case 'DRIVERS':                     return validateDrivers(body);
        default:                            return { ok: true };
    }
}

function buildRetryPrompt(originalPrompt, title, failedBody, validation) {
    const directive = validation.retryDirective || `Your previous output for ${title} did not follow the section contract.`;
    const failedBodyTrimmed = (failedBody || '').trim().slice(0, 1500);
    return [
        'RETRY (LAST CHANCE) — read this preamble before re-emitting.',
        '',
        directive,
        '',
        'YOUR PREVIOUS OUTPUT (the one that broke the contract):',
        '```',
        failedBodyTrimmed || '(empty)',
        '```',
        '',
        'Now re-read the original instructions below and emit the CORRECT shape this time.',
        '',
        '─────────────── ORIGINAL INSTRUCTIONS ───────────────',
        '',
        originalPrompt,
    ].join('\n');
}

/**
 * Cycle 44 (A) — server-side multi-section validation. Splits an
 * orchestrator response (composite multi-section markdown) into
 * sections and validates each. Returns aggregated diagnostics so the
 * caller can decide whether to retry the whole composite call or
 * accept and let the visual surface inline warnings per section.
 *
 * Used by llmOrchestrator.js for OpenAI / Bedrock paths.
 */
function validateCompositeResponse(content) {
    if (!content || typeof content !== 'string') return { ok: true, sections: [] };
    const parts = content.split(/^#{1,3}\s+/m);
    const sections = [];
    parts.shift(); // drop preamble
    for (const chunk of parts) {
        const nl = chunk.indexOf('\n');
        const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().toUpperCase();
        const body = nl === -1 ? '' : chunk.slice(nl + 1).trim();
        if (!title) continue;
        const validation = validateStageOutput(title, body);
        sections.push({ title, body, validation });
    }
    const failures = sections.filter(s => !s.validation.ok);
    return {
        ok: failures.length === 0,
        sections,
        failures,
        failureCount: failures.length,
        firstFailure: failures[0] || null,
    };
}

module.exports = {
    validateStageOutput,
    validateCompositeResponse,
    buildRetryPrompt,
    UNIVERSAL_VALIDATED_TITLES,
    // Internals exposed for testing
    __test_internals: {
        IMPERATIVE_VERBS,
        NOUN_PHRASE_PROSE_STARTS,
    },
};
