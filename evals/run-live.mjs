// Live answer-correctness run. Explicit invocation only.
//
// SPEND: this costs real money. Every case is one model round-trip plus (for
// SQL-truth cases) one warehouse query, against whichever profile the case
// resolves. It is a `npm run live` command and nothing else — no CI job, no
// schedule, no page load, no timer. That is the project's
// no-spend-without-intent rule, and this file is exactly the kind of thing
// that rule exists to keep on a leash.
//
//   cd evals
//   npm run live                                    # every golden/*.json suite
//   npm run live -- --golden scm.json               # one suite
//   npm run live -- --case otif-weighted-latest
//   npm run live -- --profile genie-scm-poc --verbose
//   npm run live -- --strict-grounding              # 'partial' grounding fails too
//
// Needs a proxy running on 127.0.0.1:7000 with a live connector. Set
// PULSEPLAY_PROXY_BASE to point elsewhere.
//
// Profile resolution, per case:
//   answer:  case.answerProfile  > --profile / PULSEPLAY_PROFILE > suite.answerProfile
//   truth:   case.truthProfile   > --truth-profile               > suite.truthProfile > answer
// The split exists because ground truth needs a warehouse (`/sql/preview`
// requires a profile with a warehouseId) while the answer under test may come
// from a connector that has none — PBI-DAX and FM cases answer on their own
// profile and reconcile against the Genie/warehouse profile.
//
// Ground truth, per case, first match wins:
//   1. `expected` (number)   — literal truth; used with `groundedData`, where
//      the supplied rows ARE the truth and SQL would prove nothing extra
//   2. `referenceSql` + `column` — the warehouse establishes truth
//
// Grounding gate: when an answer comes with rows (`groundedData` from the
// case, or the envelope's queryResult / Genie attachment), every number the
// answer cites is checked against those rows. 'unverified' (claims exist,
// none match) fails the case; 'partial' warns, or fails under
// --strict-grounding. Reconciliation catches a wrong headline number; this
// catches a right headline number decorated with invented ones.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ask, referenceSql, proxyReachable } from './lib/proxyClient.mjs';
import { reconcile, groundTruthFromRows } from './lib/reconcile.mjs';
import { checkGrounding } from './lib/grounding.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] || true) : null;
};
const verbose = args.includes('--verbose');
const strictGrounding = args.includes('--strict-grounding');
const onlyCase = flag('case');
const cliProfile = flag('profile') || process.env.PULSEPLAY_PROFILE || null;
const cliTruthProfile = flag('truth-profile') || null;
const onlyGolden = flag('golden');

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
    console.error('No proxy answering. Start it first:');
    console.error('  cd proxy && $env:PORT=7000; node server.js');
    console.error(`(tried ${process.env.PULSEPLAY_PROXY_BASE || 'http://127.0.0.1:7000'})`);
    process.exit(2);
}

const results = [];

for (const { file, suite, cases } of suites) {
    console.log(`\n${file} — ${cases.length} case(s)${suite.table ? ` against ${suite.table}` : ''}${suite.connector ? ` [${suite.connector}]` : ''}`);

    for (const c of cases) {
        const answerProfile = c.answerProfile || cliProfile || suite.answerProfile || null;
        const truthProfile = c.truthProfile || cliTruthProfile || suite.truthProfile || answerProfile;

        process.stdout.write(`  ${c.id} … `);
        try {
            // Ground truth FIRST. If truth cannot be established, there is
            // nothing to check the model against and a model call would be waste.
            let expected;
            if (Number.isFinite(c.expected)) {
                expected = c.expected;
            } else {
                const rows = await referenceSql({ sql: c.referenceSql, profile: truthProfile });
                expected = groundTruthFromRows(rows, c.column);
            }

            if (!Number.isFinite(expected)) {
                console.log('SKIP (reference SQL returned no usable value)');
                results.push({ id: c.id, ok: false, skipped: true, detail: 'no ground truth' });
                continue;
            }

            const answer = await ask({
                question: c.question,
                profile: answerProfile,
                extraBody: c.groundedData ? { groundedData: c.groundedData } : {},
            });
            const verdict = reconcile({
                answerText: answer.text,
                expected,
                tolerancePct: c.tolerancePct ?? 1,
                expectPercent: c.expectPercent ?? null,
            });

            // Hallucination gate — only when there are rows to check against.
            const groundingRows = c.groundedData || answer.rows;
            const grounding = groundingRows ? checkGrounding(answer.text, groundingRows) : null;
            const groundingFail = grounding
                && (grounding.status === 'unverified' || (strictGrounding && grounding.status === 'partial'));

            const ok = verdict.ok && !groundingFail;
            console.log(ok ? 'PASS' : 'FAIL');
            if (!verdict.ok || verbose) console.log(`      ${verdict.detail}`);
            if (grounding && (grounding.status === 'partial' || grounding.status === 'unverified' || verbose)) {
                const cited = grounding.unmatched.map((u) => u.raw).join(', ');
                console.log(`      grounding: ${grounding.status} (${grounding.matched}/${grounding.checked} claims matched${cited ? `; unmatched: ${cited}` : ''})`);
            }
            if (verdict.violations.length) {
                for (const v of verdict.violations) console.log(`      notation: ${v}`);
            }
            if (verbose) console.log(`      answer: ${answer.text.slice(0, 400).replace(/\n/g, ' ')}`);

            results.push({
                id: c.id, ok, violations: verdict.violations,
                grounding: grounding?.status || null, detail: verdict.detail,
            });
        } catch (err) {
            console.log('ERROR');
            console.log(`      ${err.message}`);
            results.push({ id: c.id, ok: false, detail: err.message });
        }
    }
}

const passed = results.filter((r) => r.ok).length;
const notated = results.filter((r) => (r.violations || []).length).length;
const hallucinated = results.filter((r) => r.grounding === 'unverified' || (strictGrounding && r.grounding === 'partial')).length;

console.log(`\n${passed}/${results.length} reconciled.`);
if (hallucinated) console.log(`${hallucinated} answer(s) cited numbers not present in their grounding rows.`);
if (notated) console.log(`${notated} answer(s) broke the number-notation convention.`);
console.log('');

// A notation violation is a real defect — it produced a 1000x contradiction on
// one screen once already — so it fails the run even when the magnitude agreed.
process.exit(passed === results.length && notated === 0 ? 0 : 1);
