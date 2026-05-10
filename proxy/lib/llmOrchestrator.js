/**
 * llmOrchestrator.js — analytics-grade pipeline for OpenAI / Bedrock.
 *
 * Wraps a chat-only LLM endpoint into a Genie-equivalent grounded answer:
 *   1. Build SQL prompt (schema + question + SELECT-only constraint)
 *   2. Call LLM, extract SQL from response
 *   3. Validate SELECT-only via sqlExecutor.isSelectOnly
 *   4. Execute SQL via sqlExecutor.executeSqlStatement
 *   5. Build narrative prompt (question + SQL + result rows)
 *   6. Call LLM again for the narrative
 *   7. Return Genie-shape response (status, content, sqlQuery, queryResult)
 *
 * IDEA-040 Cycle 7 — Phase 1 MVP. Happy path only — Phase 2 will add
 * retry-on-bad-SQL, large-result truncation handling, and Bedrock support.
 *
 * The visual code is unchanged: it reads `content + sqlQuery + queryResult`
 * from the proxy response, which matches the existing Genie shape.
 */

const { executeSqlStatement, isSelectOnly } = require('./sqlExecutor');

const SQL_SYSTEM_PROMPT = `You are a SQL writer for a Databricks SQL warehouse.
Given the schema below and a user question, output ONLY a single Databricks
SQL SELECT statement that answers the question. Rules:
- Only SELECT (no INSERT / UPDATE / DELETE / DROP / etc.).
- Use the exact table and column names from the schema.
- Wrap your SQL in a markdown code fence \`\`\`sql ... \`\`\`.
- No prose, no comments outside the fence, no preamble.
- If the schema cannot answer the question, return the literal string
  "-- INSUFFICIENT SCHEMA --" inside the fence.`;

const NARRATIVE_SYSTEM_PROMPT = `You are an analytics assistant.
Given a user question, the SQL that was run to answer it, and the result
rows, write a concise (<= 200 words) plain-English answer. Rules:
- Lead with the bottom-line answer.
- Cite specific numbers from the result.
- If the result is empty, say so politely and suggest a refinement.
- If the result was truncated, mention the cap.
- No SQL in the answer; the user already sees it separately.`;

/** Extract a SQL statement from LLM response text. Looks for a fenced
 *  code block (```sql ... ``` or ``` ... ```), falls back to the whole
 *  response if no fence is found and the response begins with SELECT. */
function extractSqlFromResponse(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        const sql = fenced[1].trim();
        return sql || null;
    }
    const trimmed = text.trim();
    if (/^(select|with)\s/i.test(trimmed)) return trimmed;
    return null;
}

/** Build the second-call prompt. Caps result rows in the prompt context
 *  to ~100 rows so we don't blow the LLM's token budget on big result sets;
 *  the visual still receives the full row set for table rendering. */
function buildNarrativePrompt(question, sql, columns, rows, truncated, totalRowCount) {
    const sampleRows = rows.slice(0, 100);
    const tableMd = renderRowsAsMarkdown(columns, sampleRows);
    const truncNote = truncated
        ? `\n\nNOTE: Result was truncated to ${rows.length} rows (full size: ${totalRowCount}). Mention this in your answer.`
        : '';
    const sampleNote = rows.length > sampleRows.length
        ? `\n\nNOTE: Only the first ${sampleRows.length} of ${rows.length} returned rows are shown to you; reason about the visible sample.`
        : '';
    return `Question: ${question}

SQL executed:
\`\`\`sql
${sql}
\`\`\`

Result (${rows.length} row${rows.length === 1 ? '' : 's'}):
${tableMd}${truncNote}${sampleNote}`;
}

function renderRowsAsMarkdown(columns, rows) {
    if (!columns?.length) return '_no result columns_';
    if (!rows?.length) return '_no rows returned_';
    const header = `| ${columns.join(' | ')} |`;
    const sep = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map(r => `| ${r.map(v => v === null || v === undefined ? '' : String(v)).join(' | ')} |`).join('\n');
    return [header, sep, body].join('\n');
}

/** The full happy-path orchestration. Returns the Genie-shape response
 *  the visual already knows how to render. */
async function orchestrateGroundedAnswer({
    profile,
    question,
    schemaContext,
    callLlm,           // (messages) => Promise<string> — provider-specific
    databricksRequest, // shared helper from server.js
    convId,
    msgId,
}) {
    if (!schemaContext || !schemaContext.trim()) {
        throw new Error('Schema context is required for grounded answers. Set profile.schemaContext in config.json.');
    }

    // Step 1+2: get SQL from LLM.
    const sqlMessages = [
        { role: 'system', content: SQL_SYSTEM_PROMPT },
        { role: 'user', content: `Schema:\n${schemaContext}\n\nQuestion: ${question}` },
    ];
    const sqlResponse = await callLlm(sqlMessages);
    const extractedSql = extractSqlFromResponse(sqlResponse);
    if (!extractedSql) {
        return {
            conversation_id: convId,
            message_id: msgId,
            status: 'COMPLETED',
            content: `I could not produce a SQL query for that question. Try rephrasing or scoping it more narrowly.\n\nLLM raw response:\n${sqlResponse?.slice(0, 500) || '(empty)'}`,
        };
    }
    if (extractedSql.includes('-- INSUFFICIENT SCHEMA --')) {
        return {
            conversation_id: convId,
            message_id: msgId,
            status: 'COMPLETED',
            content: `That question can't be answered from the configured schema. Add the missing tables/columns to profile.schemaContext or ask a different question.`,
        };
    }

    // Step 3: SELECT-only enforcement.
    if (!isSelectOnly(extractedSql)) {
        return {
            conversation_id: convId,
            message_id: msgId,
            status: 'FAILED',
            content: `The model produced a non-SELECT statement, which is not permitted. Refusing to execute.\n\n\`\`\`sql\n${extractedSql}\n\`\`\``,
            sqlQuery: extractedSql,
        };
    }

    // Step 4: execute.
    let execResult;
    try {
        execResult = await executeSqlStatement({ profile, sql: extractedSql, databricksRequest });
    } catch (err) {
        return {
            conversation_id: convId,
            message_id: msgId,
            status: 'FAILED',
            content: `SQL execution failed: ${err.message}`,
            sqlQuery: extractedSql,
            error: err.message,
        };
    }

    // Step 5+6: get narrative from LLM.
    const narrativePrompt = buildNarrativePrompt(
        question,
        extractedSql,
        execResult.columns,
        execResult.rows,
        execResult.truncated,
        execResult.totalRowCount
    );
    const narrativeMessages = [
        { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
        { role: 'user', content: narrativePrompt },
    ];
    let narrative;
    try {
        narrative = await callLlm(narrativeMessages);
    } catch (err) {
        // SQL succeeded but narrative failed — return the data with a fallback message.
        narrative = `SQL ran successfully but the narrative pass failed: ${err.message}. The data is shown below.`;
    }

    // Cycle 45 (Option 1) — server-side narrative validation + retry.
    // Opt-in via env var ORCHESTRATOR_VALIDATE_RETRIES (default 0 = off
    // so existing behavior is preserved). When enabled, splits the
    // narrative into sections + validates each. If any section fails,
    // re-call the LLM ONCE with a stronger directive that includes the
    // failed body so the model can fix itself. Returns the better
    // attempt; logs validation diagnostics so the visual can surface
    // them inline.
    const orchestratorRetryBudget = Math.max(0, Math.min(3, parseInt(process.env.ORCHESTRATOR_VALIDATE_RETRIES || '0', 10) || 0));
    let validationDiagnostics = null;
    if (orchestratorRetryBudget > 0 && narrative && /^#{1,3}\s/m.test(narrative)) {
        try {
            const insightsValidator = require('./insightsValidator');
            const composite = insightsValidator.validateCompositeResponse(narrative);
            validationDiagnostics = {
                ok: composite.ok,
                failureCount: composite.failureCount,
                attempts: 1,
            };
            if (!composite.ok && composite.firstFailure) {
                const firstFail = composite.firstFailure;
                console.log(`[orchestrator] validation FAILED for "${firstFail.title}" (${firstFail.validation.reason}) — retrying narrative pass`);
                const retryDirective = insightsValidator.buildRetryPrompt(
                    narrativePrompt,
                    firstFail.title,
                    firstFail.body,
                    firstFail.validation
                );
                const retryMessages = [
                    { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
                    { role: 'user', content: retryDirective },
                ];
                try {
                    const retryNarrative = await callLlm(retryMessages);
                    if (retryNarrative && retryNarrative.trim()) {
                        // Re-validate the retry; pick the better of the two
                        // (retry usually wins because we steered with the
                        // failed body as evidence).
                        const retryComposite = insightsValidator.validateCompositeResponse(retryNarrative);
                        if (retryComposite.failureCount < composite.failureCount) {
                            narrative = retryNarrative;
                            validationDiagnostics = {
                                ok: retryComposite.ok,
                                failureCount: retryComposite.failureCount,
                                attempts: 2,
                                retried: true,
                            };
                        } else {
                            validationDiagnostics.attempts = 2;
                            validationDiagnostics.retriedNoImprovement = true;
                        }
                    }
                } catch (retryErr) {
                    console.warn(`[orchestrator] retry call failed: ${retryErr.message}`);
                    validationDiagnostics.retryError = retryErr.message;
                }
            }
        } catch (vErr) {
            console.warn(`[orchestrator] validator load/run failed: ${vErr.message}`);
            validationDiagnostics = { error: vErr.message };
        }
    }

    // Step 7: Genie-shape response.
    return {
        conversation_id: convId,
        message_id: msgId,
        status: 'COMPLETED',
        content: narrative,
        sqlQuery: extractedSql,
        queryResult: {
            columns: execResult.columns,
            rows: execResult.rows,
        },
        statement_id: execResult.statementId,
        execution_time_ms: execResult.executionTimeMs,
        truncated: execResult.truncated,
        rows_returned: execResult.rowsReturned,
        // Cycle 45 — validation diagnostics (null when retry budget = 0
        // OR narrative isn't multi-section). Visual can surface inline.
        ...(validationDiagnostics ? { validationDiagnostics } : {}),
    };
}

// ── Retry-on-bad-SQL wrapper (IDEA-040 Phase 2) ───────────────────────────────
// When the LLM emits SQL that fails to execute against Databricks with a
// SYNTACTIC error (column-not-found, table-not-found, syntax-error), we
// retry ONCE with the error message appended to the user prompt so the
// model can self-correct. Permission/auth failures are NOT retried — the
// model can't fix them, and looping wastes tokens.
//
// Single retry only. If the second attempt also fails we propagate the
// failure unchanged. No infinite loops.

const SYNTACTIC_ERROR_PATTERNS = [
    /UNRESOLVED_COLUMN/i,
    /COLUMN_NOT_FOUND/i,
    /column\s+(?:['"`]?[\w.]+['"`]?\s+)?(?:cannot be resolved|is not found|does not exist|not found)/i,
    /TABLE_OR_VIEW_NOT_FOUND/i,
    /table\s+(?:['"`]?[\w.]+['"`]?\s+)?(?:cannot be resolved|is not found|does not exist|not found)/i,
    /no such (?:table|view|column)/i,
    /PARSE_SYNTAX_ERROR/i,
    /SYNTAX_ERROR/i,
    /syntax error/i,
    /UNRESOLVED_REFERENCE/i,
    /AMBIGUOUS_REFERENCE/i,
    /MISSING_COLUMN/i,
    /AnalysisException/i,
    /ParseException/i,
];

const NON_RETRYABLE_PATTERNS = [
    /UNAUTHORIZED/i,
    /FORBIDDEN/i,
    /PERMISSION_DENIED/i,
    /access (?:denied|forbidden)/i,
    /authentication failed/i,
    /\b401\b/,
    /\b403\b/,
    /Insufficient privileges/i,
    /not authorized/i,
];

function isSyntacticSqlError(message) {
    if (!message || typeof message !== 'string') return false;
    // Auth failures ALWAYS dominate — never retry them even if the upstream
    // response contains a syntax-flavoured word as well.
    if (NON_RETRYABLE_PATTERNS.some(re => re.test(message))) return false;
    return SYNTACTIC_ERROR_PATTERNS.some(re => re.test(message));
}

/**
 * Wrap a grounded-answer handler so that a single retry is performed when
 * the SQL fails with a syntactic error. The retry prepends the error to
 * the user question so the LLM can self-correct.
 *
 * @param {function} handler  An (args) => Promise<resultShape> that runs
 *   the full LLM → SQL → execute → narrative pipeline (e.g. orchestrateGroundedAnswer).
 * @param {object} args  Same args object passed to the handler. The wrapper
 *   only mutates a copy of args.question for the retry attempt.
 * @returns {Promise<{result, attempts, retried}>}
 */
async function withRetryOnBadSql(handler, args) {
    const first = await handler(args);
    // Result must have status 'FAILED' with an error string for retry to apply.
    const failed = first && first.status === 'FAILED' && typeof first.error === 'string';
    if (!failed) {
        return { result: first, attempts: 1, retried: false };
    }
    if (!isSyntacticSqlError(first.error)) {
        return { result: first, attempts: 1, retried: false };
    }

    const previousSql = first.sqlQuery || '(unknown)';
    const trimmedErr = String(first.error).slice(0, 500);
    // Wave 22 — append the prior failure as opaque text. We do NOT inject
    // raw error JSON; the orchestrator's prompt template controls quoting.
    const augmentedQuestion =
        `${args.question}\n\nNOTE: A previous attempt failed.\n` +
        `Previous SQL:\n${previousSql}\n\n` +
        `Error message: ${trimmedErr}\n` +
        `Please correct the SQL and try again — do not repeat the same error.`;

    const second = await handler({ ...args, question: augmentedQuestion });
    return { result: second, attempts: 2, retried: true };
}

// ── Wave 41 PREP — metric-rule suggest helper ────────────────────────────────
// IDEA-037 phase 4 extension. Builds the LLM prompt that asks for both the
// existing domain/sections suggestion AND a list of metric direction rules,
// parses the result, and falls back to the deterministic heuristic engine
// in proxy/lib/metricRuleHeuristics.js when the LLM is unreachable / returns
// malformed JSON / returns an empty rules array.
//
// CONSTRAINTS:
//  - Inputs must already be sanitized by the caller (Wave 22). This helper
//    assembles the prompt verbatim from the supplied strings.
//  - Errors are mapped to user-friendly strings (Wave 30 cycle 4) — raw
//    LLM error bodies never propagate.
//  - The heuristic fallback is ALWAYS run when the LLM path produces zero
//    rules so the visual sees a non-empty array on every successful call.

/** Keyword-match aliases for direction-rule mentions inside a Genie space's
 *  description / instructions. We scan for short imperative phrases like
 *  "lower is better", "higher is better", "minimise X", "track Y as up" so
 *  the prompt can echo them back to the LLM as authoritative context. */
const SPACE_DIRECTION_HINTS = [
    { re: /\b(lower|less|fewer)\s+is\s+better\b/i, direction: 'lower' },
    { re: /\b(higher|more|greater)\s+is\s+better\b/i, direction: 'higher' },
    { re: /\bminimi[sz]e\b/i, direction: 'lower' },
    { re: /\bmaximi[sz]e\b/i, direction: 'higher' },
];

/** Pull short hints from a Genie-space description / instructions blob.
 *  Returns at most a handful so the prompt budget stays bounded. */
function extractDirectionHintsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const out = [];
    for (const h of SPACE_DIRECTION_HINTS) {
        if (h.re.test(text)) out.push(h.direction);
        if (out.length >= 4) break;
    }
    return out;
}

/** Strict-shape coercion of a single LLM-suggested metric rule. Returns null
 *  when the candidate is malformed; the caller filters those out. */
function coerceMetricRule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = /** @type {Record<string, any>} */ (raw);
    const name = String(r.name || '').trim();
    if (!name) return null;
    // Treat truthy/loose values as "higher is better" inputs without throwing.
    const higherIsBetter = r.higherIsBetter === true || r.higher_is_better === true
        || String(r.higherIsBetter || r.direction || '').toLowerCase() === 'higher';
    const aliasesRaw = Array.isArray(r.aliases) ? r.aliases : [];
    const aliases = aliasesRaw
        .map(a => String(a || '').trim())
        .filter(Boolean)
        .slice(0, 8);
    const conf = Number(r.confidence);
    const confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5;
    const rationale = String(r.rationale || '').trim().slice(0, 400);
    const allowedSources = new Set([
        'space-instructions', 'measure-name', 'data-distribution',
        'industry-pattern', 'section-h-cte',
    ]);
    const sourceRaw = String(r.source || '').trim();
    const source = allowedSources.has(sourceRaw) ? sourceRaw : 'measure-name';
    /** @type {{ name: string, higherIsBetter: boolean, aliases: string[], confidence: number, rationale: string, source: string, amberPct?: number, redPct?: number }} */
    const out = { name, higherIsBetter, aliases, confidence, rationale, source };
    const amber = Number(r.amberPct ?? r.amber_pct);
    const red = Number(r.redPct ?? r.red_pct);
    if (Number.isFinite(amber)) out.amberPct = Math.max(0, Math.min(1, amber));
    if (Number.isFinite(red)) out.redPct = Math.max(0, Math.min(1, red));
    return out;
}

/** Defensive parser for the LLM's metric-rule suggestion blob. Tolerates
 *  preamble / code fences / a wrapping object. Returns [] on any failure. */
function parseSuggestedMetricRules(text) {
    if (!text || typeof text !== 'string') return [];
    let raw = text.trim().replace(/```json\s*/i, '').replace(/```/g, '').trim();
    // Locate the rules array. Two acceptable shapes:
    //   1. A bare JSON array            [ {...}, {...} ]
    //   2. An object with .suggestedMetricRules or .metricRules
    let candidate = null;
    try {
        const firstBracket = raw.indexOf('[');
        const firstBrace = raw.indexOf('{');
        if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
            const lastBracket = raw.lastIndexOf(']');
            if (lastBracket > firstBracket) {
                candidate = JSON.parse(raw.slice(firstBracket, lastBracket + 1));
            }
        } else if (firstBrace >= 0) {
            const lastBrace = raw.lastIndexOf('}');
            if (lastBrace > firstBrace) {
                const obj = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
                candidate = obj?.suggestedMetricRules || obj?.metricRules || null;
            }
        }
    } catch { return []; }
    if (!Array.isArray(candidate)) return [];
    return candidate.map(coerceMetricRule).filter(Boolean);
}

/** Assemble the system+user prompt that asks for metric-rule suggestions.
 *  Caller has already sanitized every string. Output goes straight into
 *  the orchestrator's chat-only LLM call. */
function buildMetricRulePrompt({ measureNames, dimensionNames, spaceDescription, spaceInstructions, sectionHCte }) {
    const measures = (Array.isArray(measureNames) ? measureNames : []).filter(Boolean);
    const dimensions = (Array.isArray(dimensionNames) ? dimensionNames : []).filter(Boolean);
    const spaceText = [spaceDescription, spaceInstructions].filter(Boolean).join('\n').slice(0, 4000);
    const cte = (sectionHCte || '').slice(0, 2000);
    const directionHints = extractDirectionHintsFromText(spaceText);

    const lines = [
        'You are analysing a Power BI dashboard\'s measures + Genie space metadata to suggest metric direction rules.',
        '',
        `Bound measures: ${measures.length ? measures.join(', ') : '(none)'}`,
        `Bound dimensions: ${dimensions.length ? dimensions.join(', ') : '(none)'}`,
        '',
        'Look at the bound measure names and their typical conventions (return rate → lower-is-better; revenue → higher-is-better; profit → higher-is-better).',
        'Check the Genie space description for direction-rule mentions (phrases like "lower is better", "minimise", "track X as up").',
        'If Section H CTE preamble has filters like `WHERE x >= N`, treat that as a green threshold hint for measure x.',
        '',
        spaceText ? `Genie space metadata (description + instructions):\n${spaceText}` : '',
        directionHints.length ? `Detected direction hints in metadata: ${directionHints.join(', ')}` : '',
        cte ? `Section H CTE preamble (use thresholds it implies):\n\`\`\`sql\n${cte}\n\`\`\`` : '',
        '',
        'Output 3 to 7 suggested metric rules. Respond with strict JSON ONLY:',
        '{',
        '  "suggestedMetricRules": [',
        '    {',
        '      "name": "<measure name>",',
        '      "higherIsBetter": <true|false>,',
        '      "aliases": ["<alternate spelling>", "..."],',
        '      "amberPct": <0..1 or omit>,',
        '      "redPct":   <0..1 or omit>,',
        '      "confidence": <0..1>,',
        '      "rationale": "<one sentence>",',
        '      "source": "space-instructions" | "measure-name" | "data-distribution" | "industry-pattern" | "section-h-cte"',
        '    }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Use "space-instructions" only when the rationale is grounded in the supplied Genie space text.',
        '- Use "section-h-cte" only when the threshold came from a CTE WHERE clause.',
        '- Use "measure-name" for naming-convention defaults.',
        '- Use "industry-pattern" for generic templates when bindings are too opaque to classify.',
        '- aliases is for alternate spellings of the same measure (e.g. revenue / sales / gross_revenue).',
        '- No preamble, no code fences, no commentary.',
    ];
    return lines.filter(Boolean).join('\n');
}

const METRIC_RULE_SYSTEM_PROMPT =
    'You are an analytics assistant that suggests metric direction rules ' +
    '(higher-is-better vs lower-is-better, optional amber/red thresholds) ' +
    'for KPIs bound to a Power BI dashboard. Output strict JSON only.';

/**
 * Suggest metric direction rules. LLM-first with deterministic heuristic
 * fallback. Always returns an array; never throws — errors are mapped to
 * a friendly string and logged by the caller.
 *
 * @param {{
 *   measureNames: string[],
 *   dimensionNames?: string[],
 *   spaceDescription?: string,
 *   spaceInstructions?: string,
 *   sectionHCte?: string,
 *   ranges?: Record<string, { p25?: number, p75?: number }>,
 *   callLlm?: (messages: Array<{role:string, content:string}>) => Promise<string>
 * }} args
 * @returns {Promise<{ rules: object[], source: 'llm' | 'heuristic' | 'mixed', llmOk: boolean }>}
 */
async function suggestMetricRules(args) {
    const measureNames = Array.isArray(args?.measureNames) ? args.measureNames : [];
    const heuristics = require('./metricRuleHeuristics');

    /** @type {object[]} */
    let llmRules = [];
    let llmOk = false;
    if (typeof args?.callLlm === 'function' && measureNames.length > 0) {
        try {
            const userPrompt = buildMetricRulePrompt({
                measureNames,
                dimensionNames: args.dimensionNames,
                spaceDescription: args.spaceDescription,
                spaceInstructions: args.spaceInstructions,
                sectionHCte: args.sectionHCte,
            });
            const text = await args.callLlm([
                { role: 'system', content: METRIC_RULE_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ]);
            llmRules = parseSuggestedMetricRules(text || '');
            llmOk = true;
        } catch {
            // Wave 30 cycle 4: swallow raw error; caller logs friendly summary.
            llmRules = [];
            llmOk = false;
        }
    }

    if (llmRules.length === 0) {
        const heuristicRules = heuristics.suggestRules(measureNames, { ranges: args?.ranges });
        const padded = heuristicRules.length === 0
            ? heuristics.industryPatternFallback(3)
            : heuristicRules;
        return { rules: padded, source: 'heuristic', llmOk };
    }

    // LLM produced something — keep it. If it produced fewer than 3 rules
    // we top up from the heuristic engine (mixed) so the panel always has
    // enough to render.
    if (llmRules.length < 3) {
        const heuristicRules = heuristics.suggestRules(measureNames, { ranges: args?.ranges });
        const seenLower = new Set(llmRules.map(r => r.name.toLowerCase()));
        for (const h of heuristicRules) {
            if (seenLower.has(h.name.toLowerCase())) continue;
            llmRules.push(h);
            if (llmRules.length >= 5) break;
        }
        return { rules: llmRules, source: 'mixed', llmOk };
    }
    return { rules: llmRules, source: 'llm', llmOk };
}

module.exports = {
    orchestrateGroundedAnswer,
    extractSqlFromResponse,
    buildNarrativePrompt,
    renderRowsAsMarkdown,
    SQL_SYSTEM_PROMPT,
    NARRATIVE_SYSTEM_PROMPT,
    // Phase 2 additions
    withRetryOnBadSql,
    isSyntacticSqlError,
    __retry_internals: { SYNTACTIC_ERROR_PATTERNS, NON_RETRYABLE_PATTERNS },
    // Wave 41 PREP additions
    suggestMetricRules,
    buildMetricRulePrompt,
    parseSuggestedMetricRules,
    coerceMetricRule,
    extractDirectionHintsFromText,
    METRIC_RULE_SYSTEM_PROMPT,
};
