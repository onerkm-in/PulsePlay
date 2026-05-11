/**
 * insightsStageValidator.ts — Cycle 23
 *
 * Per-stage format-compliance validation for the AI Insights pipeline.
 *
 * Background: each universal stage (HEADLINE / KPI SNAPSHOT / TRENDS /
 * RISKS / OPPORTUNITIES / DRIVERS / RECOMMENDED ACTIONS / etc.) has a
 * deliberate format contract baked into its prompt — RECOMMENDED ACTIONS
 * must be 3 numbered items starting with imperative verbs, RISKS must be
 * top-3 ≤20-word bullets, KPI SNAPSHOT must contain a table or
 * structured metric list, etc. Genie's underlying model is probabilistic
 * and sometimes ignores the format rule, e.g. emitting a descriptive
 * "Profit margins vary widely across segments..." paragraph in the
 * RECOMMENDED ACTIONS slot. Live tests caught this on multiple stages,
 * not just actions.
 *
 * Cycle 23 introduces a small validator module. The runStage path in
 * visual.tsx calls validateStageOutput(title, body) the moment a stage
 * completes. If the validator returns { ok: false }, the runner fires
 * exactly ONE retry with a stronger "you just wrote X, that broke the
 * contract for STAGE — rewrite as [expected format]" directive prepended
 * to the original prompt. Custom AI sections (author-defined names) are
 * not validated — author instructions are arbitrary, we have no contract
 * to check against.
 *
 * Design principles:
 *   • Pure functions, no React or DOM. Easy to unit-test.
 *   • Shape-only checks (length, presence of markers). Semantic
 *     correctness is out of scope; we are catching format breaks, not
 *     answer correctness.
 *   • Conservative — when in doubt, return ok:true so we never block
 *     a valid section from rendering.
 *   • Per-section retry directives encode the worked-example fixes the
 *     prompt-engineering already settled on.
 *
 * Public surface:
 *   • validateStageOutput(title, body) → ValidationResult
 *   • buildRetryPrompt(originalPrompt, title, failedBody, validation) → string
 *   • UNIVERSAL_VALIDATED_TITLES — Set<string> of titles we currently
 *     know how to validate. Useful for tests and call-site gating.
 */

export interface ValidationResult {
    ok: boolean;
    /** Short, single-sentence diagnosis used for telemetry + the retry directive. */
    reason?: string;
    /** Section-specific retry directive injected at the top of the retry prompt. */
    retryDirective?: string;
}

const IMPERATIVE_VERBS = new Set([
    "increase", "reduce", "reallocate", "pilot", "prioritize", "audit",
    "cut", "shift", "renegotiate", "launch", "investigate", "restructure",
    "replace", "test", "roll", "rolled", "rollout", "defend", "expand",
    "consolidate", "eliminate", "accelerate", "deprioritize", "freeze",
    "unfreeze", "deploy", "implement", "monitor", "negotiate", "outsource",
    "insource", "approve", "reject", "delay", "fast-track", "fasttrack",
    "scale", "downscale", "upscale", "establish", "adopt", "abandon",
    "review", "validate", "rebalance", "redirect", "retain", "decommission",
    "increase", "boost", "strengthen", "weaken", "double", "halve",
    "triple", "quadruple", "track", "instrument", "measure", "benchmark",
    "set", "target", "raise", "lower", "lift", "trim",
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

function isNumberedListBody(body: string): boolean {
    // First non-empty line that is not a heading.
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    const firstContentLine = lines.find(l => !l.startsWith("#"));
    if (!firstContentLine) return false;
    return /^1\.\s+/.test(firstContentLine);
}

function countNumberedItems(body: string): number {
    const matches = body.match(/^\s*[123]\.\s+/gm);
    return matches ? matches.length : 0;
}

function countBulletItems(body: string): number {
    const matches = body.match(/^\s*[-*•]\s+/gm);
    return matches ? matches.length : 0;
}

function hasPipeTable(body: string): boolean {
    // Pipe table requires a header row + a separator row of dashes.
    return /^\s*\|.+\|\s*$\n^\s*\|[-:\s|]+\|\s*$/m.test(body);
}

function startsWithImperativeVerb(line: string): boolean {
    // Strip leading numbering / bullet / bold and then check the first word.
    const stripped = line
        .replace(/^\s*\d+\.\s*/, "")
        .replace(/^\s*[-*•]\s*/, "")
        .replace(/^\*\*/, "")
        .trim();
    const firstWord = stripped.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "");
    if (!firstWord) return false;
    return IMPERATIVE_VERBS.has(firstWord);
}

function startsWithNounPhraseProse(body: string): boolean {
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    const firstContentLine = lines.find(l => !l.startsWith("#"));
    if (!firstContentLine) return false;
    return NOUN_PHRASE_PROSE_STARTS.some(re => re.test(firstContentLine));
}

// ── Cycle 47.5 — semantic helpers ───────────────────────────────────
// Tokens like 12, 12%, 12.5%, 1pp, $1.2K, 1,234, 17.40, -4.70 — covers
// the metric shapes our prompts produce. Currency prefix, commas, decimals,
// optional % or pp suffix. Conservative: a bare year like "2017" still
// counts as a number; we don't try to distinguish "metric-bearing" digits
// from incidental ones, so the check stays a floor not a ceiling.
const NUMERIC_TOKEN_RE = /[$€£¥]?\d[\d,]*(?:\.\d+)?(?:%|pp|K|M|B)?/gi;

function countNumericTokens(text: string): number {
    const m = text.match(NUMERIC_TOKEN_RE);
    return m ? m.length : 0;
}

function listItemBodies(body: string): string[] {
    // Pull the body text of each numbered or bulleted item (everything
    // after the marker on that line). Used by the per-item semantic
    // checks below.
    const out: string[] = [];
    const lines = body.split("\n");
    for (const raw of lines) {
        const line = raw.trim();
        const numMatch = line.match(/^\d+\.\s+(.+)$/);
        const bulMatch = line.match(/^[-*•]\s+(.+)$/);
        if (numMatch) out.push(numMatch[1]);
        else if (bulMatch) out.push(bulMatch[1]);
    }
    return out;
}

// ── Per-section validators ──────────────────────────────────────────

function validateRecommendedActions(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    if (!isNumberedListBody(body)) {
        return {
            ok: false,
            reason: "body does not start with `1.` numbered list",
            retryDirective:
                "STRUCTURAL FAILURE: your previous output for RECOMMENDED ACTIONS did NOT begin with `1.`. " +
                "The body MUST be a NUMBERED LIST of EXACTLY 3 items starting with `1.`, `2.`, `3.`. " +
                "Each item MUST start with an IMPERATIVE VERB (Reallocate, Audit, Pilot, Investigate, " +
                "Reduce, Cut, Shift, Launch, Defend, Eliminate, etc.) and name a TARGET segment / metric " +
                "from the bound data plus an EXPECTED IMPACT. ≤25 words per item.",
        };
    }
    const numItems = countNumberedItems(body);
    if (numItems < 2 || numItems > 4) {
        return {
            ok: false,
            reason: `expected 3 numbered items, got ${numItems}`,
            retryDirective:
                `STRUCTURAL FAILURE: your previous output had ${numItems} numbered items. ` +
                "The contract requires EXACTLY 3 numbered items in RECOMMENDED ACTIONS. Rewrite with 3 actions.",
        };
    }
    if (startsWithNounPhraseProse(body)) {
        return {
            ok: false,
            reason: "body looks like descriptive prose, not actions",
            retryDirective:
                "STRUCTURAL FAILURE: your previous output read as a descriptive paragraph (e.g. `Profit margins vary widely…`, " +
                "`Total sales have shown…`). RECOMMENDED ACTIONS is NOT analysis — it is 3 numbered imperative actions. " +
                "Rewrite as: `1. {Imperative verb} {target} {expected impact}` × 3.",
        };
    }
    // Spot-check the first numbered item for an imperative verb.
    const firstItemMatch = body.match(/^\s*1\.\s+(.+)$/m);
    if (firstItemMatch && !startsWithImperativeVerb(firstItemMatch[1])) {
        return {
            ok: false,
            reason: "first action does not start with an imperative verb",
            retryDirective:
                "STRUCTURAL FAILURE: your first numbered action did not start with an imperative verb " +
                "(Reallocate, Audit, Pilot, Investigate, Reduce, Cut, Shift, Launch, etc.). " +
                "Each of the 3 items MUST begin with an imperative verb followed by a target and expected impact.",
        };
    }
    // Cycle 47.5 — semantic check: each action should name an EXPECTED
    // IMPACT, which the contract says is a metric ("lift margin by 1pp",
    // "recover $50K", "defend 600-order base"). Live-test failure mode:
    // the model emits imperative verbs but no metrics ("1. Reallocate
    // budget to improve performance"). Floor: at least one item must
    // contain a numeric token. Ceiling not enforced (the impact phrase
    // sometimes shifts to "by Q4" / "this week" without numbers).
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric === 0) {
        return {
            ok: false,
            reason: "no actions cite a numeric target or impact",
            retryDirective:
                "SEMANTIC FAILURE: none of your numbered actions cite a NUMERIC target or expected impact " +
                "(e.g. `lift margin by 1pp`, `recover $50K`, `defend 600-order base`). The contract requires " +
                "each action to name a target metric and an expected impact in concrete numbers from the bound data. " +
                "Rewrite each action with at least one specific metric value.",
        };
    }
    return { ok: true };
}

function validateRisks(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected ~3 bullet/numbered items, got ${numItems}`,
            retryDirective:
                "STRUCTURAL FAILURE: RISKS body must be a list of EXACTLY 3 risks (numbered or bulleted), " +
                "each ≤20 words, leading with the risk in bold (`**risk name**: …`). Rewrite as a 3-item list.",
        };
    }
    // Cycle 47.5 — semantic check: at least one risk should cite a
    // magnitude in numbers. Live-test failure mode: vague qualitative
    // bullets ("**Customer concentration**: a few customers drive most
    // sales") without the actual concentration percentage. Conservative
    // floor — only fails if NONE of the risks have a number.
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric === 0) {
        return {
            ok: false,
            reason: "no risks cite a numeric magnitude",
            retryDirective:
                "SEMANTIC FAILURE: none of your risk bullets cite a numeric magnitude (e.g. `2.49% margin`, " +
                "`14.9pp gap`, `top 5 customers = 18% of sales`). Risks without numbers are unverifiable. " +
                "Rewrite each risk to include the metric value that makes the risk concrete.",
        };
    }
    return { ok: true };
}

function validateTrends(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    // Cycle 47.5 — upgraded from "any digit" to "≥2 distinct numeric
    // tokens". Year-over-year, deltas, growth comparisons all require
    // contrasting at least two values. A single number is insufficient
    // (could be a date, a count without context, etc.).
    const numericCount = countNumericTokens(body);
    if (numericCount < 2) {
        return {
            ok: false,
            reason: `expected ≥2 numeric tokens, got ${numericCount}`,
            retryDirective:
                "STRUCTURAL FAILURE: TRENDS must cite at least TWO specific numeric values from the bound data " +
                "(typically a current value AND a prior value to show the trend). Your previous output had " +
                `${numericCount} numeric reference${numericCount === 1 ? "" : "s"}. Rewrite citing ≥3 metric values ` +
                "with year-over-year, period-over-period, or delta framing.",
        };
    }
    return { ok: true };
}

function validateKpiSnapshot(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    // Either a pipe-table OR a metric-bullet list with at least 3 numbers.
    if (hasPipeTable(body)) return { ok: true };
    const numericMatches = body.match(/[$€£¥]?[\d,]+(\.\d+)?%?/g);
    if (!numericMatches || numericMatches.length < 3) {
        return {
            ok: false,
            reason: "no table and < 3 metric values",
            retryDirective:
                "STRUCTURAL FAILURE: KPI SNAPSHOT must surface key metrics either as a markdown pipe-table " +
                "OR as a bullet list with ≥3 metric values from the bound data. Your previous output had neither. " +
                "Rewrite with the top 3-5 KPIs as either a `| metric | value |` table or `- **metric:** value` bullets.",
        };
    }
    return { ok: true };
}

function validateHeadline(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    // HEADLINE is a paragraph; main check is non-emptiness + no leading
    // numbered-list (which would be a leak from RECOMMENDED ACTIONS).
    if (isNumberedListBody(body)) {
        return {
            ok: false,
            reason: "HEADLINE leaked into a numbered-list format",
            retryDirective:
                "STRUCTURAL FAILURE: HEADLINE is a paragraph, NOT a numbered list. Your previous output started " +
                "with `1.` which is the RECOMMENDED ACTIONS format. Rewrite as 1-2 short paragraphs: a bolded " +
                "lede sentence (≤25 words) plus a 1-sentence implication.",
        };
    }
    return { ok: true };
}

function validateOpportunities(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected ~3 list items, got ${numItems}`,
            retryDirective:
                "STRUCTURAL FAILURE: OPPORTUNITIES must be a list of 3 opportunities (numbered or bulleted), " +
                "each ≤20 words, leading with the opportunity in bold. Rewrite as a 3-item list.",
        };
    }
    return { ok: true };
}

function validateDrivers(body: string): ValidationResult {
    if (!body.trim()) return { ok: false, reason: "empty body" };
    const numItems = countBulletItems(body) + countNumberedItems(body);
    if (numItems < 2) {
        return {
            ok: false,
            reason: `expected 2-3 driver items, got ${numItems}`,
            retryDirective:
                "STRUCTURAL FAILURE: DRIVERS must be a list of 2-3 top contributors with metric values. " +
                "Rewrite as a 2-3 item bullet or numbered list.",
        };
    }
    // Cycle 47.5 — semantic check: drivers MUST be quantitative. The
    // contract calls for "top contributors with metric values"; bullets
    // like "**Region A**: leads sales" without numbers are insufficient.
    // Floor: at least HALF the items should cite a number.
    const items = listItemBodies(body);
    const itemsWithMetric = items.filter(line => countNumericTokens(line) > 0).length;
    if (items.length >= 2 && itemsWithMetric * 2 < items.length) {
        return {
            ok: false,
            reason: `only ${itemsWithMetric}/${items.length} drivers cite a metric value`,
            retryDirective:
                "SEMANTIC FAILURE: a top-contributors list must cite the actual metric values that make a " +
                "contributor a top contributor (sales amount, % of total, profit dollars, etc.). " +
                "Most of your driver items had no numbers. Rewrite each driver as `**name**: contribution number`.",
        };
    }
    return { ok: true };
}

// ── Public dispatch ─────────────────────────────────────────────────

export const UNIVERSAL_VALIDATED_TITLES: ReadonlySet<string> = new Set([
    "RECOMMENDED ACTIONS",
    "RISKS",
    "TRENDS",
    "KPI SNAPSHOT",
    "HEADLINE",
    "OPPORTUNITIES",
    "DRIVERS",
    "HEADLINE + KPI SNAPSHOT",
]);

export function validateStageOutput(title: string, body: string): ValidationResult {
    const upper = (title || "").trim().toUpperCase();
    if (!upper) return { ok: true };
    // Custom author-defined sections — no contract to check against.
    if (!UNIVERSAL_VALIDATED_TITLES.has(upper)) return { ok: true };
    switch (upper) {
        case "RECOMMENDED ACTIONS":         return validateRecommendedActions(body);
        case "RISKS":                       return validateRisks(body);
        case "TRENDS":                      return validateTrends(body);
        case "KPI SNAPSHOT":                return validateKpiSnapshot(body);
        case "HEADLINE":                    return validateHeadline(body);
        case "HEADLINE + KPI SNAPSHOT":     // legacy combined stage from non-hybrid pipeline
            return validateHeadline(body).ok ? validateKpiSnapshot(body) : validateHeadline(body);
        case "OPPORTUNITIES":               return validateOpportunities(body);
        case "DRIVERS":                     return validateDrivers(body);
        default:                            return { ok: true };
    }
}

/**
 * Build the retry prompt by prepending a stronger directive to the
 * original stage prompt. The failed body is included so the model has
 * concrete evidence of what it just did wrong, plus the directive
 * that steers it toward the contract.
 */
export function buildRetryPrompt(
    originalPrompt: string,
    title: string,
    failedBody: string,
    validation: ValidationResult
): string {
    const directive = validation.retryDirective || `Your previous output for ${title} did not follow the section contract. Re-read the format rules and emit the correct shape this time.`;
    const failedBodyTrimmed = (failedBody || "").trim().slice(0, 1500); // cap so we don't blow the context
    return [
        "RETRY (LAST CHANCE) — read this preamble before re-emitting.",
        "",
        directive,
        "",
        "YOUR PREVIOUS OUTPUT (the one that broke the contract):",
        "```",
        failedBodyTrimmed || "(empty)",
        "```",
        "",
        "Now re-read the original instructions below and emit the CORRECT shape this time. Do NOT repeat the previous output.",
        "",
        "─────────────── ORIGINAL INSTRUCTIONS ───────────────",
        "",
        originalPrompt,
    ].join("\n");
}
