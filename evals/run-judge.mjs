// LLM-as-judge run. Explicit invocation only — and doubly so: every case is
// TWO model round-trips (the answer under test, then the judge call), plus a
// warehouse query for SQL-truth cases. No CI job, no schedule, no timer.
//
//   cd evals
//   npm run judge -- --case fm-otif-cite
//   npm run judge -- --golden fm-grounded.json --judge-profile foundation
//
// The judge is the Foundation Model connector via /foundation/section — the
// same proxy path the product uses, so a judge run is also evidence the FM
// path works. Scores are SIGNAL, not gate: the run prints them and exits 0
// unless the judge itself could not be reached or returned nothing usable.
// Deterministic gates (reconcile, grounding, notation) live in run-live.mjs;
// this tier covers what they cannot see — whether the explanation follows
// from the evidence and answers the actual question.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ask, referenceSql, proxyReachable, answerTextFrom } from './lib/proxyClient.mjs';
import { groundTruthFromRows } from './lib/reconcile.mjs';
import { buildJudgePrompt, parseJudgeVerdict } from './lib/judge.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] || true) : null;
};
const verbose = args.includes('--verbose');
const onlyCase = flag('case');
const onlyGolden = flag('golden');
const cliProfile = flag('profile') || process.env.PULSEPLAY_PROFILE || null;
const judgeProfile = flag('judge-profile') || process.env.PULSEPLAY_JUDGE_PROFILE || 'foundation';

const goldenDir = join(here, 'golden');
const goldenFiles = onlyGolden
    ? [onlyGolden]
    : (await readdir(goldenDir)).filter((f) => f.endsWith('.json')).sort();

const suites = [];
for (const file of goldenFiles) {
    const suite = JSON.parse(await readFile(join(goldenDir, file), 'utf8'));
    const cases = (suite.cases || []).filter((c) => !onlyCase || c.id === onlyCase);
    if (cases.length) suites.push({ file, suite, cases });
}

if (!suites.length) {
    console.error(onlyCase ? `No case with id "${onlyCase}".` : 'No golden cases found.');
    process.exit(2);
}
if (!(await proxyReachable())) {
    console.error('No proxy answering. Start it first: cd proxy && $env:PORT=7000; node server.js');
    process.exit(2);
}

async function callJudge({ systemPrompt, userPrompt }) {
    const base = (process.env.PULSEPLAY_PROXY_BASE || 'http://127.0.0.1:7000').replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.PULSEPLAY_PROXY_KEY) headers['X-PulsePlay-Key'] = process.env.PULSEPLAY_PROXY_KEY;
    if (process.env.PULSEPLAY_BEARER) headers.Authorization = `Bearer ${process.env.PULSEPLAY_BEARER}`;
    const res = await fetch(`${base}/foundation/section`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            userPrompt, systemPrompt,
            section: 'JUDGE',
            profile: judgeProfile, assistantProfile: judgeProfile,
        }),
        signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`judge call failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return answerTextFrom(json) || text;
}

let judged = 0;
let unusable = 0;
const scores = { faithfulness: [], relevance: [], coherence: [] };

for (const { file, suite, cases } of suites) {
    console.log(`\n${file} — judging ${cases.length} case(s) with judge profile "${judgeProfile}"`);

    for (const c of cases) {
        const answerProfile = c.answerProfile || cliProfile || suite.answerProfile || null;
        const truthProfile = c.truthProfile || suite.truthProfile || answerProfile;
        process.stdout.write(`  ${c.id} … `);
        try {
            let expected = Number.isFinite(c.expected) ? c.expected : undefined;
            if (expected === undefined && c.referenceSql) {
                try {
                    const rows = await referenceSql({ sql: c.referenceSql, profile: truthProfile });
                    const v = groundTruthFromRows(rows, c.column);
                    if (Number.isFinite(v)) expected = v;
                } catch { /* judge still works without the reference value */ }
            }

            const answer = await ask({
                question: c.question,
                profile: answerProfile,
                extraBody: c.groundedData ? { groundedData: c.groundedData } : {},
            });

            const prompts = buildJudgePrompt({
                question: c.question,
                answerText: answer.text,
                expected,
                rows: c.groundedData || answer.rows,
            });
            const verdict = parseJudgeVerdict(await callJudge(prompts));
            if (!verdict) {
                unusable++;
                console.log('NO-VERDICT (judge returned nothing parseable)');
                continue;
            }
            judged++;
            for (const k of Object.keys(scores)) scores[k].push(verdict.scores[k]);
            console.log(`${verdict.verdict.toUpperCase()}  f=${verdict.scores.faithfulness.toFixed(2)} r=${verdict.scores.relevance.toFixed(2)} c=${verdict.scores.coherence.toFixed(2)}`);
            if (verdict.verdict === 'fail' || verbose) {
                for (const r of verdict.reasons) console.log(`      ${r}`);
            }
        } catch (err) {
            unusable++;
            console.log(`ERROR ${err.message}`);
        }
    }
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
console.log(`\n${judged} judged, ${unusable} unusable.`);
if (judged) {
    console.log(`mean faithfulness ${avg(scores.faithfulness).toFixed(2)} · relevance ${avg(scores.relevance).toFixed(2)} · coherence ${avg(scores.coherence).toFixed(2)}`);
}
console.log('');

// Signal, not gate: only a judge that produced NOTHING usable fails the run.
process.exit(judged > 0 ? 0 : 1);
