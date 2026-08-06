// Doc claims vs code — the automated version of the 2026-07-31 hand audit.
//
//   node scripts/check-doc-claims.mjs
//
// That audit (93042b6) found docs asserting controls that did not exist, and
// its commit message named the defect class: "a doc asserting a control that
// does not exist... found by reading server.js rather than by reading other
// docs." Nothing then prevented the same drift recurring. This does, for the
// classes that can be checked mechanically:
//
//   1. Every path in CLAUDE.md's directory tables exists.
//   2. Every local markdown link in CLAUDE.md and README.md resolves.
//   3. Anchored claims: where a doc states a specific code fact (a constant,
//      a port, a wiring), the code must still say the same thing.
//
// Zero dependencies, node:* only — same posture as check-licenses.mjs. It
// cannot catch every drift (test counts, prose claims about behaviour); it
// catches the ones with a mechanical anchor, and the ANCHORS list below is
// where a new claim gets pinned when a doc starts asserting it.

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
let checks = 0;

async function exists(rel) {
    try { await access(join(root, rel)); return true; } catch { return false; }
}

function fail(msg) { failures.push(msg); }

/* 1 + 2 — CLAUDE.md directory tables and local links, README.md local links. */

async function checkDocPaths(docRel) {
    const text = await readFile(join(root, docRel), 'utf8');

    // Table rows whose first cell is a backticked path: | `proxy/server.js` | ...
    // A `{a,b}` brace set expands to one path per alternative.
    for (const m of text.matchAll(/^\|\s*`([^`\s|*]+)`\s*(?:\/?\s*)?\|/gm)) {
        const raw = m[1].replace(/\/$/, '');
        if (!/[\\/.]/.test(raw)) continue; // a bare word, not a path
        const brace = raw.match(/^(.*)\{([^}]+)\}(.*)$/);
        const paths = brace
            ? brace[2].split(',').map((alt) => `${brace[1]}${alt.trim()}${brace[3]}`)
            : [raw];
        for (const p of paths) {
            checks++;
            if (!(await exists(p))) fail(`${docRel}: directory-table path does not exist: ${p}`);
        }
    }

    // Local markdown links: [x](docs/FOO.md) or [x](path#L12) — repo files only.
    for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)\s]*)?\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/i.test(target)) continue;   // http(s), mailto
        if (target.startsWith('#')) continue;
        if (target.includes('path/to/')) continue; // illustrative example, not a claim
        checks++;
        if (!(await exists(target))) fail(`${docRel}: markdown link target does not exist: ${target}`);
    }
}

/* 3 — anchored claims. Each entry: the doc must still make the claim (docRe),
 * and the code must still satisfy it (codeRe). If the doc drops the claim the
 * anchor goes stale-but-silent (that is fine — nothing is being claimed); if
 * the code drifts while the doc still claims it, this fails the build. */

const ANCHORS = [
    {
        name: 'supervisor stagger default is 2000 ms',
        doc: 'CLAUDE.md', docRe: /stagger is 2000 ms/i,
        code: 'proxy/server.js', codeRe: /staggerMs\s*\?\?\s*2000/,
    },
    {
        name: 'vite dev proxy targets the canonical proxy port 7000',
        doc: 'CLAUDE.md', docRe: /`\/api\/\*`\s*→\s*`?127\.0\.0\.1:7000/,
        code: 'playground/vite.config.ts', codeRe: /127\.0\.0\.1:7000/,
    },
    {
        name: 'proxy default port constant is still 8787 (the PORT=7000 tripwire)',
        doc: 'CLAUDE.md', docRe: /default port constant is still `?8787`?/i,
        code: 'proxy/server.js', codeRe: /8787/,
    },
    {
        name: 'evals live runner is explicit-invocation only (no CI wiring)',
        doc: 'evals/README.md', docRe: /no CI job, no schedule/i,
        code: '.github/workflows/test.yml', codeRe: /node --test tests\/\*\.test\.mjs/,
        // The code anchor proves the CI job runs the credential-free tests;
        // the absence check proves no step EXECUTES the live runner (comments
        // explaining why it is not wired are fine and expected).
        codeAbsentRe: /run:\s*[^\n]*(run-live|run-judge|npm run live|npm run judge)/,
    },
    {
        name: 'grounding verifier exposes the Roman-scale mode evals relies on',
        doc: 'evals/README.md', docRe: /Roman-scale mode/,
        code: 'proxy/lib/groundingVerifier.js', codeRe: /ROMAN_SUFFIX_MULTIPLIER/,
    },
];

async function checkAnchors() {
    for (const a of ANCHORS) {
        const docText = await readFile(join(root, a.doc), 'utf8');
        if (!a.docRe.test(docText)) {
            // The doc no longer makes the claim — nothing to hold the code to.
            // Print it so a deliberate doc change prompts pruning the anchor.
            console.log(`  note: ${a.doc} no longer claims "${a.name}" — anchor is inert, consider removing it`);
            continue;
        }
        checks++;
        const codeText = await readFile(join(root, a.code), 'utf8');
        if (!a.codeRe.test(codeText)) {
            fail(`${a.doc} claims "${a.name}" but ${a.code} no longer matches ${a.codeRe}`);
        }
        if (a.codeAbsentRe && a.codeAbsentRe.test(codeText)) {
            fail(`${a.doc} claims "${a.name}" but ${a.code} matches forbidden ${a.codeAbsentRe}`);
        }
    }
}

await checkDocPaths('CLAUDE.md');
await checkDocPaths('README.md');
await checkAnchors();

if (failures.length) {
    console.error(`\n${failures.length} doc claim(s) no longer hold (${checks} checked):\n`);
    for (const f of failures) console.error(`  FAIL ${f}`);
    console.error('\nFix the doc or the code — whichever is lying.');
    process.exit(1);
}
console.log(`doc-claims: ${checks} checks passed.`);
