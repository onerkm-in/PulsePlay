import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed } from '../check-licenses.mjs';

// The SPDX expression parsing is the part that could silently wave a GPL
// through, so it gets tested rather than trusted. Every string below appears in
// the project's own lockfiles.

test('plain permissive licences pass', () => {
    for (const l of ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'MPL-2.0', 'BlueOak-1.0.0', '0BSD']) {
        assert.equal(isAllowed(l), true, l);
    }
});

test('strong copyleft is refused', () => {
    for (const l of ['GPL-3.0', 'GPL-3.0-or-later', 'AGPL-3.0', 'AGPL-3.0-only', 'SSPL-1.0', 'LGPL-2.1']) {
        assert.equal(isAllowed(l), false, l);
    }
});

test('a dual licence passes when EITHER option is permissive', () => {
    // Real entry in the tree — we take the MIT option.
    assert.equal(isAllowed('(MIT OR GPL-3.0-or-later)'), true);
    assert.equal(isAllowed('(MIT OR CC0-1.0)'), true);
    assert.equal(isAllowed('(BSD-2-Clause OR MIT OR Apache-2.0)'), true);
});

test('a dual licence fails when NO option is permissive', () => {
    assert.equal(isAllowed('(GPL-3.0 OR AGPL-3.0)'), false);
});

test('an AND expression needs every part to be permissive', () => {
    assert.equal(isAllowed('(MIT AND Zlib)'), true);
    assert.equal(isAllowed('(MIT AND GPL-3.0)'), false);
});

test('surrounding parentheses and whitespace do not change the verdict', () => {
    assert.equal(isAllowed('  (MIT)  '), true);
    assert.equal(isAllowed('(WTFPL OR MIT)'), true);
});

test('anything unparseable is refused rather than waved through', () => {
    for (const l of ['', null, undefined, 'SEE LICENSE IN LICENSE.md', 'UNLICENSED', 'Commercial']) {
        assert.equal(isAllowed(l), false, String(l));
    }
});

test('case-insensitive operators, because SPDX in the wild is inconsistent', () => {
    assert.equal(isAllowed('MIT or GPL-3.0'), true);
    assert.equal(isAllowed('MIT and Zlib'), true);
});
