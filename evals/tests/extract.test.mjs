import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNumbers, notationViolations } from '../lib/extract.mjs';

// The strings below are not invented. They are shapes this project has actually
// shipped or chased — the "854.42 K" / "854.42 M" contradiction from DEC-UNITS,
// the literal-asterisk Genie answer from the latest+37 headed pass, the cockpit's
// "$10.62 M". Characterising them here is what stops the harness from being
// tested against a tidier world than the one it runs in.

test('Roman scale: M is thousand, MM is million, B is billion', () => {
    assert.equal(extractNumbers('854.42 MM tCO2e')[0].value, 854_420_000);
    assert.equal(extractNumbers('$10.62 M at risk')[0].value, 10_620);
    assert.equal(extractNumbers('Net Sales 1.9 B')[0].value, 1_900_000_000);
});

test('MM is matched before M, so a million is never read as a thousand', () => {
    const [n] = extractNumbers('854.42 MM');
    assert.equal(n.scale, 'MM');
    assert.equal(n.value, 854_420_000);
});

test('K parses as thousand but is reported as a convention violation', () => {
    const [n] = extractNumbers('854.42 K tCO2e');
    assert.equal(n.value, 854_420);
    assert.equal(n.violations.length, 1);
    assert.match(n.violations[0], /forbidden/);
});

test('legacy MN still parses as million, flagged as non-canonical', () => {
    const [n] = extractNumbers('prior 1.29 MN');
    assert.equal(n.value, 1_290_000);
    assert.match(n.violations[0], /MM/);
});

test('canonical notation produces no violations', () => {
    assert.deepEqual(notationViolations('OTIF 93.4%, impact $10.62 M, GHG 854.42 MM'), []);
});

test('percentages keep their face value rather than becoming a fraction', () => {
    const [n] = extractNumbers('OTIF was 98.11%');
    assert.equal(n.value, 98.11);
    assert.equal(n.isPercent, true);
});

test('markdown bold does not fragment a number', () => {
    // Genie returns "**Uruguay (UY)**, 59.8%" — the literal-asterisk bug from
    // the latest+37 pass proved this arrives unrendered.
    const nums = extractNumbers('**Uruguay (UY)**, 59.8%');
    assert.equal(nums.at(-1).value, 59.8);
    assert.equal(nums.at(-1).isPercent, true);
});

test('currency symbols and thousands separators survive', () => {
    assert.equal(extractNumbers('$1,234,567 in penalties')[0].value, 1_234_567);
});

test('negatives parse, because a decline is a real answer', () => {
    assert.equal(extractNumbers('down -4.2% year on year')[0].value, -4.2);
});

test('prose with no numbers yields nothing rather than throwing', () => {
    assert.deepEqual(extractNumbers('I could not answer that question.'), []);
    assert.deepEqual(extractNumbers(null), []);
    assert.deepEqual(extractNumbers(''), []);
});

test('a multi-number answer returns every number in order', () => {
    const nums = extractNumbers('OTIF 93.4% against a 95% target, costing $2.1 MM');
    assert.deepEqual(nums.map((n) => n.value), [93.4, 95, 2_100_000]);
});
