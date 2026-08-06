// Hallucination check: every number the answer cites must exist in — or be
// directly derivable from — the rows the answer was grounded on.
//
// The checker itself lives in proxy/lib/groundingVerifier.js, where the FM
// grounding path already uses it in production. Reusing it here is deliberate:
// the eval grades answers with the SAME verifier users see trust stamps from,
// so an eval pass and a UI "grounded" badge cannot drift apart. This is a
// same-repo source import via createRequire, not a dependency — the zero-dep
// policy of this package is about npm trees, and none is added.
//
// Scale is 'roman' because answers are graded under the product's notation
// convention (M = thousand, MM = million, B = billion).

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifyGrounding } = require('../../proxy/lib/groundingVerifier.js');

/**
 * @param {string} answerText
 * @param {{ columns?: string[], rows?: any[][] }} rows
 * @returns {{ status: string, grounded: boolean, checked: number, matched: number,
 *             unmatched: Array<{raw: string, value: number}> }}
 */
export function checkGrounding(answerText, rows) {
    return verifyGrounding(answerText, rows, { scale: 'roman' });
}
