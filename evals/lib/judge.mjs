// LLM-as-judge v0: prompt builder + verdict parser, both pure and testable
// without credentials. The judge model call itself lives in run-judge.mjs and
// only ever happens on explicit invocation.
//
// Honest scope: this is a HEURISTIC judge — one model, one rubric, JSON-mode
// by instruction rather than schema enforcement. It scores what deterministic
// reconciliation cannot see (does the explanation follow from the evidence,
// is the answer actually answering the question), and its scores are treated
// as signal, not gate: run-judge reports, it does not fail CI. If judging
// ever needs to gate anything, that is the point where a purpose-built tool
// (promptfoo) earns its dependency tree — see README.

/**
 * Build the judge prompts for one answered case.
 * @param {{ question: string, answerText: string, expected?: number,
 *           rows?: { columns: string[], rows: any[][] } | null }} input
 */
export function buildJudgePrompt({ question, answerText, expected, rows }) {
    const systemPrompt = [
        'You are a strict evaluation judge for a BI assistant. Judge ONLY what is present.',
        'Score three dimensions from 0.0 to 1.0:',
        '- faithfulness: every claim follows from the supplied evidence; inventing or embellishing facts scores low',
        '- relevance: the answer addresses the question that was asked, without padding',
        '- coherence: the answer is internally consistent and readable',
        'Reply with ONLY a JSON object, no prose, no code fences:',
        '{"faithfulness": 0.0, "relevance": 0.0, "coherence": 0.0, "verdict": "pass" or "fail", "reasons": ["..."]}',
        'verdict is "pass" only when every dimension is 0.7 or higher.',
    ].join('\n');

    const evidence = [];
    if (rows && Array.isArray(rows.rows) && rows.rows.length) {
        evidence.push(`Evidence rows (columns: ${(rows.columns || []).join(', ')}):`);
        for (const r of rows.rows.slice(0, 50)) evidence.push(JSON.stringify(r));
    }
    if (Number.isFinite(expected)) {
        evidence.push(`Independently established true value for the question: ${expected}`);
    }

    const userPrompt = [
        `Question asked of the assistant:\n${question}`,
        evidence.length ? `\n${evidence.join('\n')}` : '\n(No evidence rows were available to the judge.)',
        `\nAssistant's answer to judge:\n${answerText}`,
    ].join('\n');

    return { systemPrompt, userPrompt };
}

/**
 * Parse the judge's reply. Tolerant of prose or fences around the JSON, strict
 * about the fields inside it. Returns null when no usable verdict exists —
 * callers report that as a judge failure, never as a silent pass.
 * @param {string} text
 */
export function parseJudgeVerdict(text) {
    if (typeof text !== 'string' || !text.trim()) return null;

    const start = text.indexOf('{');
    if (start < 0) return null;
    // Walk to the matching close brace so trailing prose doesn't break parsing.
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;

    let obj;
    try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return null; }

    const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
    const scores = {
        faithfulness: clamp(obj.faithfulness),
        relevance: clamp(obj.relevance),
        coherence: clamp(obj.coherence),
    };
    if (Object.values(scores).some((v) => v === null)) return null;

    const verdict = obj.verdict === 'pass' || obj.verdict === 'fail'
        ? obj.verdict
        : (Object.values(scores).every((v) => v >= 0.7) ? 'pass' : 'fail');

    return {
        scores,
        verdict,
        reasons: Array.isArray(obj.reasons) ? obj.reasons.filter((r) => typeof r === 'string').slice(0, 10) : [],
    };
}
