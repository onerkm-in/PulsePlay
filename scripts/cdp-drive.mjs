#!/usr/bin/env node
// scripts/cdp-drive.mjs — tiny Chrome DevTools Protocol driver (Node 24 built-in WebSocket).
// Drives the already-open visible Chrome (--remote-debugging-port=9222) so the user can watch.
//
// Usage:
//   node scripts/cdp-drive.mjs shot <outfile.png>          # screenshot the active page
//   node scripts/cdp-drive.mjs eval "<js expression>"      # evaluate JS, print JSON result
//   node scripts/cdp-drive.mjs summary                     # print title/url/tabs/errors
//   node scripts/cdp-drive.mjs click "<css selector>"      # click first match (by text-or-selector)
//   node scripts/cdp-drive.mjs goto <url>                  # navigate the page

import { writeFileSync } from 'node:fs';

const PORT = 9222;
const [, , cmd, arg] = process.argv;

async function pageTarget() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const pages = list.filter(t => t.type === 'page');
    // Prefer the 7001 app page, else first page.
    return pages.find(p => /127\.0\.0\.1:7001/.test(p.url)) || pages[0];
}

function cdp(ws, id, method, params) {
    return new Promise((resolve, reject) => {
        const onMsg = ev => {
            const m = JSON.parse(ev.data);
            if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
}

const tgt = await pageTarget();
if (!tgt) { console.log('No page target — is Chrome open on :9222?'); process.exit(1); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let _id = 0; const next = () => ++_id;
await cdp(ws, next(), 'Page.enable');
await cdp(ws, next(), 'Runtime.enable');

async function evaluate(expr) {
    const r = await cdp(ws, next(), 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
}

if (cmd === 'shot') {
    const r = await cdp(ws, next(), 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(arg || 'shot.png', Buffer.from(r.data, 'base64'));
    console.log('screenshot ->', arg || 'shot.png');
} else if (cmd === 'goto') {
    await cdp(ws, next(), 'Page.navigate', { url: arg });
    await new Promise(r => setTimeout(r, 2500));
    console.log('navigated ->', arg);
} else if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(arg), null, 2));
} else if (cmd === 'click') {
    const ok = await evaluate(`(()=>{
        const sel=${JSON.stringify(arg)};
        let el=document.querySelector(sel);
        if(!el){ el=[...document.querySelectorAll('button,a,[role=tab],[role=button]')].find(e=>e.textContent.trim().toLowerCase().includes(sel.toLowerCase())); }
        if(!el) return 'not-found';
        el.scrollIntoView({block:'center'}); el.click(); return 'clicked:'+(el.textContent||el.tagName).trim().slice(0,40);
    })()`);
    console.log(ok);
} else if (cmd === 'enter') {
    await evaluate("(()=>{const t=document.querySelector('textarea'); if(t){t.focus();} return !!t;})()");
    await cdp(ws, next(), 'Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' });
    await cdp(ws, next(), 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' });
    console.log('real Enter dispatched to textarea');
} else { // summary
    const sum = await evaluate(`(()=>{
        const tabs=[...document.querySelectorAll('[role=tab],nav button,.pp-tabs button,[class*=tab] button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,12);
        const errs=[...document.querySelectorAll('[role=alert],.error,[class*=error]')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,6);
        return { title: document.title, url: location.href, hasRoot: !!document.querySelector('#root'), rootChildren: (document.querySelector('#root')||{}).childElementCount, tabs, errorsOnScreen: errs, bodyTextLen: document.body.innerText.length };
    })()`);
    console.log(JSON.stringify(sum, null, 2));
}
ws.close();
