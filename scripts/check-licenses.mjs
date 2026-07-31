// Licence gate that does not depend on a GitHub feature being switched on.
//
// `dependency-review` is the nicer gate — it comments on the PR and knows about
// severity — but it needs the repo's Dependency Graph enabled, and on this repo
// that API answers 403. It has failed every run since it was added, which is
// worse than having no gate: a check that is always red teaches everyone to
// ignore red.
//
// This reads the lockfiles directly, so it works today, offline, on any repo,
// with no dependencies and no third-party action. Keep BOTH: when the toggle is
// flipped, dependency-review adds PR annotations on top of this.
//
//   node scripts/check-licenses.mjs
//   node scripts/check-licenses.mjs --json
//
// Exit 1 if any dependency carries a licence outside the allowlist.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const LOCKFILES = [
    'proxy/package-lock.json',
    'playground/package-lock.json',
    'enablers/desktop/package-lock.json',
    'enablers/pulse-pbi/package-lock.json',
    'enablers/pulse-pbi-gn/package-lock.json',
];

// Permissive only. Mirrors .github/workflows/dependency-review.yml — if you edit
// one, edit the other. Derived from a sweep of the real tree, not a template:
// every licence below is already present, and no GPL/AGPL/SSPL is.
const ALLOWED = new Set([
    '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause',
    'CC0-1.0', 'CC-BY-4.0', 'ISC', 'MIT', 'MIT-0', 'MPL-2.0', 'Python-2.0',
    'Unlicense', 'WTFPL', 'Zlib',
]);

/**
 * Is an SPDX expression acceptable?
 *
 * A dual licence like "(MIT OR GPL-3.0-or-later)" is fine — we take the MIT
 * option. "(MIT AND Zlib)" needs BOTH to be allowed. Anything unparseable is
 * treated as not-allowed so a weird string gets a human's attention rather than
 * a free pass.
 */
export function isAllowed(expression) {
    if (!expression || typeof expression !== 'string') return false;

    const expr = expression.trim().replace(/^\(|\)$/g, '').trim();
    if (ALLOWED.has(expr)) return true;

    if (/\sOR\s/i.test(expr)) {
        return expr.split(/\s+OR\s+/i).some((part) => isAllowed(part));
    }
    if (/\sAND\s/i.test(expr)) {
        return expr.split(/\s+AND\s+/i).every((part) => isAllowed(part));
    }
    return false;
}

function scanLockfile(relPath) {
    const abs = join(repoRoot, relPath);
    if (!existsSync(abs)) return null;

    const lock = JSON.parse(readFileSync(abs, 'utf8'));
    const violations = [];
    let checked = 0;
    let unknown = 0;

    for (const [pkgPath, meta] of Object.entries(lock.packages || {})) {
        if (!pkgPath) continue;               // the root package itself
        if (meta.link) continue;              // workspace symlink, not a real dep

        const licence = meta.license;
        if (!licence) { unknown++; continue; }

        // npm sometimes records an array of licence objects (very old packages).
        const expr = Array.isArray(licence)
            ? licence.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ')
            : licence;

        checked++;
        if (!isAllowed(expr)) {
            violations.push({ pkg: pkgPath.replace(/^node_modules\//, ''), licence: expr });
        }
    }
    return { lockfile: relPath, checked, unknown, violations };
}

function main() {
const results = LOCKFILES.map(scanLockfile).filter(Boolean);
const allViolations = results.flatMap((r) => r.violations);
const totalChecked = results.reduce((n, r) => n + r.checked, 0);
const totalUnknown = results.reduce((n, r) => n + r.unknown, 0);

if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ results, totalChecked, totalUnknown, ok: allViolations.length === 0 }, null, 2));
} else {
    for (const r of results) {
        console.log(`${r.lockfile}: ${r.checked} licensed, ${r.unknown} unstated, ${r.violations.length} disallowed`);
    }
    console.log('');

    if (allViolations.length) {
        console.error(`DISALLOWED LICENCES (${allViolations.length}):`);
        for (const v of allViolations) console.error(`  ${v.pkg} — ${v.licence}`);
        console.error('');
        console.error('Either drop the dependency, or add the licence to ALLOWED in this file');
        console.error('AND to allow-licenses in .github/workflows/dependency-review.yml —');
        console.error('deliberately, because strong copyleft in the tree is a real constraint');
        console.error('on the Path C inner-source-now / public-OSS-later posture.');
    } else {
        console.log(`OK — ${totalChecked} licensed dependencies, all permissive.`);
    }

    // Unstated licences are reported, not fatal. Failing on them would be noise:
    // plenty of legitimate packages omit the field from the lockfile, and the
    // risk being defended against is copyleft ARRIVING, which is stated when it
    // does. A sudden jump in this number is still worth a look.
    if (totalUnknown) console.log(`(${totalUnknown} packages state no licence in the lockfile — reported, not gated.)`);
}

process.exit(allViolations.length ? 1 : 0);
}

// Only scan when run directly. Without this guard, importing isAllowed() for a
// unit test runs the whole scan and then process.exit()s out of the test run —
// which is exactly what happened the first time.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
