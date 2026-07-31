// Live answer-correctness run. Explicit invocation only.
//
// SPEND: this costs real money. Every case is one model round-trip plus one
// warehouse query, against whichever profile is active. It is a `npm run live`
// command and nothing else — no CI job, no schedule, no page load, no timer.
// That is the project's no-spend-without-intent rule, and this file is exactly
// the kind of thing that rule exists to keep on a leash.
//
//   cd evals
//   npm run live                          # all cases, default profile
//   npm run live -- --case otif-weighted-latest
//   npm run live -- --profile genie-scm-poc --verbose
//
// Needs a proxy running on 127.0.0.1:7000 with a live connector. Set
// PULSEPLAY_PROXY_BASE to point elsewhere.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ask, referenceSql, proxyReachable } from './lib/proxyClient.mjs';
import { reconcile, groundTruthFromRows } from './lib/reconcile.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] || true) : null;
};
const verbose = args.includes('--verbose');
const onlyCase = flag('case');
const profile = flag('profile') || process.env.PULSEPLAY_PROFILE || null;

const suite = JSON.parse(await readFile(join(here, 'golden', flag('golden') || 'scm.json'), 'utf8'));
const cases = suite.cases.filter((c) => !onlyCase || c.id === onlyCase);

if (!cases.length) {
    console.error(onlyCase ? `No case with id "${onlyCase}".` : 'Golden set is empty.');
    process.exit(2);
}

if (!(await proxyReachable())) {
    console.error('No proxy answering. Start it first:');
    console.error('  cd proxy && $env:PORT=7000; node server.js');
    console.error(`(tried ${process.env.PULSEPLAY_PROXY_BASE || 'http://127.0.0.1:7000'})`);
    process.exit(2);
}

console.log(`\nReconciling ${cases.length} case(s) against ${suite.table}`);
if (profile) console.log(`profile: ${profile}`);
console.log('');

const results = [];
for (const c of cases) {
    process.stdout.write(`  ${c.id} … `);
    try {
        // Ground truth FIRST. If the warehouse cannot answer, there is nothing to
        // check the model against and spending a model call would be waste.
        const rows = await referenceSql({ sql: c.referenceSql, profile });
        const expected = groundTruthFromRows(rows, c.column);

        if (!Number.isFinite(expected)) {
            console.log('SKIP (reference SQL returned no usable value)');
            results.push({ id: c.id, ok: false, skipped: true, detail: 'no ground truth' });
            continue;
        }

        const answer = await ask({ question: c.question, profile });
        const verdict = reconcile({
            answerText: answer.text,
            expected,
            tolerancePct: c.tolerancePct ?? 1,
            expectPercent: c.expectPercent ?? null,
        });

        console.log(verdict.ok ? 'PASS' : 'FAIL');
        if (!verdict.ok || verbose) console.log(`      ${verdict.detail}`);
        if (verdict.violations.length) {
            for (const v of verdict.violations) console.log(`      notation: ${v}`);
        }
        if (verbose) console.log(`      answer: ${answer.text.slice(0, 400).replace(/\n/g, ' ')}`);

        results.push({ id: c.id, ok: verdict.ok, violations: verdict.violations, detail: verdict.detail });
    } catch (err) {
        console.log('ERROR');
        console.log(`      ${err.message}`);
        results.push({ id: c.id, ok: false, detail: err.message });
    }
}

const passed = results.filter((r) => r.ok).length;
const notated = results.filter((r) => (r.violations || []).length).length;

console.log(`\n${passed}/${results.length} reconciled against the warehouse.`);
if (notated) console.log(`${notated} answer(s) broke the number-notation convention.`);
console.log('');

// A notation violation is a real defect — it produced a 1000x contradiction on
// one screen once already — so it fails the run even when the magnitude agreed.
process.exit(passed === results.length && notated === 0 ? 0 : 1);
