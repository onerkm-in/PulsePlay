// Structural gate for every golden suite. Runs in CI with no credentials, so a
// malformed case fails the PR instead of failing silently at live-run time
// (where a broken case would just SKIP and quietly shrink coverage).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden');
const files = (await readdir(goldenDir)).filter((f) => f.endsWith('.json')).sort();

test('there is more than one suite (multi-connector coverage exists)', () => {
    assert.ok(files.length >= 3, `expected >=3 golden suites, found ${files.length}: ${files.join(', ')}`);
});

const allIds = new Set();
let totalCases = 0;

for (const file of files) {
    test(`${file} is a well-formed suite`, async () => {
        const suite = JSON.parse(await readFile(join(goldenDir, file), 'utf8'));
        assert.ok(Array.isArray(suite.cases) && suite.cases.length > 0, 'has a non-empty cases array');

        for (const c of suite.cases) {
            const label = `${file}:${c.id}`;
            assert.ok(typeof c.id === 'string' && c.id, `${label} has an id`);
            assert.ok(!allIds.has(c.id), `${label} id is globally unique (--case addresses it)`);
            allIds.add(c.id);
            totalCases++;

            assert.ok(typeof c.question === 'string' && c.question.trim(), `${label} has a question`);
            assert.ok(typeof c.why === 'string' && c.why.trim(), `${label} says why it exists`);

            const hasSqlTruth = typeof c.referenceSql === 'string' && typeof c.column === 'string';
            const hasLiteralTruth = Number.isFinite(c.expected);
            assert.ok(hasSqlTruth || hasLiteralTruth,
                `${label} carries a truth source (referenceSql+column, or a literal expected)`);

            if (c.groundedData !== undefined) {
                assert.ok(Array.isArray(c.groundedData.columns) && Array.isArray(c.groundedData.rows)
                    && c.groundedData.rows.length > 0,
                `${label} groundedData has columns[] and non-empty rows[]`);
                assert.ok(hasLiteralTruth,
                    `${label} groundedData cases use literal expected (the rows ARE the truth)`);
            }

            if (c.tolerancePct !== undefined) {
                assert.ok(Number.isFinite(c.tolerancePct) && c.tolerancePct > 0, `${label} tolerancePct is a positive number`);
            }
            if (c.expectPercent !== undefined) {
                assert.equal(typeof c.expectPercent, 'boolean', `${label} expectPercent is boolean`);
            }
        }
    });
}

test('the golden set has grown past the 4-case proof of concept', () => {
    // QUALITY.md's honest gap was "four SCM cases against one connector".
    // This pins the widened floor so a future pruning is a deliberate,
    // test-visible decision rather than quiet erosion.
    assert.ok(totalCases >= 30, `expected >=30 cases across suites, found ${totalCases}`);
});
