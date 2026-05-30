#!/usr/bin/env node
/* eslint-disable no-console */
// One-off probe to explore Genie's message lifecycle API.
// Goal: confirm whether multiple section calls within ONE conversation
// can share a single message_id, or whether Genie always allocates a
// new message_id on every POST .../messages.
//
// SAFE: only one start-conversation + one start-message + GET polls.

const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'proxy', 'config.json'), 'utf8'));
const p = cfg.profiles.default;
const host = p.host.replace(/\/$/, '');
const token = p.token;
const spaceId = p.spaceId;

async function call(method, urlPath, body) {
    const r = await fetch(`${host}${urlPath}`, {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* leave null */ }
    return { status: r.status, body: json ?? text };
}

(async () => {
    console.log('--- 1. GET space ---');
    const space = await call('GET', `/api/2.0/genie/spaces/${spaceId}`);
    console.log('status', space.status, 'keys', Object.keys(space.body || {}));

    console.log('\n--- 2. start-conversation ---');
    const start = await call('POST', `/api/2.0/genie/spaces/${spaceId}/start-conversation`, {
        content: 'Probe: what tables are in this space?',
    });
    console.log('status', start.status);
    console.log('response top-level keys:', Object.keys(start.body || {}));
    console.log('JSON:', JSON.stringify(start.body, null, 2).slice(0, 1200));
    const convId = start.body?.conversation_id;
    const firstMsgId = start.body?.message_id || start.body?.message?.id;
    console.log('\nconversation_id:', convId);
    console.log('first message_id:', firstMsgId);

    if (!convId || !firstMsgId) { console.error('No conv/msg id, aborting.'); process.exit(1); }

    console.log('\n--- 3. Poll first message until COMPLETED ---');
    for (let i = 0; i < 30; i++) {
        const m = await call('GET', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages/${firstMsgId}`);
        const status = m.body?.status;
        console.log(`  poll ${i}: status=${status}`);
        if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
            console.log('\nfinal message keys:', Object.keys(m.body || {}));
            console.log('attachments[]:', JSON.stringify(m.body?.attachments, null, 2).slice(0, 1200));
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n--- 4. POST a SECOND message to same conversation ---');
    const second = await call('POST', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages`, {
        content: 'Probe-2: based on prior context, list the top-level columns of the first table you mentioned.',
    });
    console.log('status', second.status);
    console.log('second response keys:', Object.keys(second.body || {}));
    console.log('second message_id:', second.body?.message_id || second.body?.message?.id);
    console.log('JSON:', JSON.stringify(second.body, null, 2).slice(0, 800));

    console.log('\n--- 5. Probe for "append/follow-up" on the FIRST message_id ---');
    // Try a few hypothetical endpoints to confirm none exist (expect 404/405):
    const tries = [
        ['POST', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages/${firstMsgId}/follow-up`, { content: 'append' }],
        ['POST', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages/${firstMsgId}/append`,    { content: 'append' }],
        ['POST', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages/${firstMsgId}/continue`,  { content: 'append' }],
        ['POST', `/api/2.0/genie/spaces/${spaceId}/conversations/${convId}/messages/${firstMsgId}/sections`,  { sectionId: 'TRENDS' }],
    ];
    for (const [m, u, b] of tries) {
        const r = await call(m, u, b);
        console.log(`  ${m} ${u} -> ${r.status}`);
    }

    console.log('\nDone.');
})().catch(e => { console.error('ERR', e); process.exit(1); });
