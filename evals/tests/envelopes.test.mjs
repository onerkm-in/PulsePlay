// Envelope handling is where a multi-connector harness quietly rots: each
// backend shapes its response differently, and a carrier the client stops
// reading turns into silent SKIPs. These tests pin the three shapes the live
// runner consumes — no network, no credentials.

import test from 'node:test';
import assert from 'node:assert/strict';
import { answerTextFrom, rowsFrom } from '../lib/proxyClient.mjs';

test('answerTextFrom reads plain content', () => {
    assert.equal(answerTextFrom({ content: 'OTIF was 95.2%.' }), 'OTIF was 95.2%.');
});

test('answerTextFrom decodes the PBI/FM message_id JSON blob', () => {
    const payload = {
        message_id: JSON.stringify({ id: 'm1', status: 'COMPLETED', content: 'Total is 2,297,201.' }),
    };
    assert.equal(answerTextFrom(payload), 'Total is 2,297,201.');
});

test('answerTextFrom leaves a real (non-blob) Genie message_id alone', () => {
    const payload = { message_id: '01f0a1b2c3', content: 'from poll' };
    assert.equal(answerTextFrom(payload), 'from poll');
});

test('answerTextFrom reads Genie attachment text', () => {
    const payload = { attachments: [{ text: { content: 'Backorders were 128,400 units.' } }] };
    assert.equal(answerTextFrom(payload), 'Backorders were 128,400 units.');
});

test('rowsFrom normalizes a PBI/FM queryResult', () => {
    const payload = {
        queryResult: { columns: ['measure', 'value'], rows: [['Total Sales', 2297200.86]] },
    };
    assert.deepEqual(rowsFrom(payload), {
        columns: ['measure', 'value'],
        rows: [['Total Sales', 2297200.86]],
    });
});

test('rowsFrom normalizes Genie attachment result with {name} columns and data_table', () => {
    const payload = {
        attachments: [{
            query: {
                result: {
                    columns: [{ name: 'month_key', type: 'INT' }, { name: 'otif_pct', type: 'DOUBLE' }],
                    data_table: [[202606, 95.21]],
                },
            },
        }],
    };
    assert.deepEqual(rowsFrom(payload), {
        columns: ['month_key', 'otif_pct'],
        rows: [[202606, 95.21]],
    });
});

test('rowsFrom returns null when there is no tabular result', () => {
    assert.equal(rowsFrom({ content: 'prose only' }), null);
    assert.equal(rowsFrom({ queryResult: { columns: [], rows: [] } }), null);
    assert.equal(rowsFrom(null), null);
});
