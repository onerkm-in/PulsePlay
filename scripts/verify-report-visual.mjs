#!/usr/bin/env node
// scripts/verify-report-visual.mjs
//
// Item 1 (report-visual render) — STEP 1: mint + verify the embed token (RUNNING).
// Proves the `powerbi-dwd` service principal can mint a View-scoped embed token
// for YOUR Premium report — i.e. the SP has Build+Read on that dataset (the most
// likely failure mode). The visual render (PIXEL) is STEP 2:
//   playground/public/verify-report-visual.html
//
// Prereq: the proxy is running →  cd proxy ; $env:PORT=7000 ; node server.js
//
// Provide your THREE real IDs as env vars (never hardcode them in the repo):
//   PBI_GROUP_ID   = <Premium workspace / group GUID>
//   PBI_REPORT_ID  = <report GUID in that workspace>
//   PBI_DATASET_ID = <that report's dataset GUID>
// Optional:
//   PROXY_URL   = http://127.0.0.1:7000   (default)
//   PBI_PROFILE = powerbi-dwd             (default; the SP whose creds mint the token)
//
// Run (PowerShell):
//   $env:PBI_GROUP_ID="..."; $env:PBI_REPORT_ID="..."; $env:PBI_DATASET_ID="..."; node scripts/verify-report-visual.mjs
// Run (bash):
//   PBI_GROUP_ID=... PBI_REPORT_ID=... PBI_DATASET_ID=... node scripts/verify-report-visual.mjs

const PROXY = (process.env.PROXY_URL || 'http://127.0.0.1:7000').replace(/\/$/, '');
const PROFILE = process.env.PBI_PROFILE || 'powerbi-dwd';
const groupId = (process.env.PBI_GROUP_ID || '').trim();
const reportId = (process.env.PBI_REPORT_ID || '').trim();
const datasetId = (process.env.PBI_DATASET_ID || '').trim();

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

// Refuse placeholders / missing IDs — never mint against an unknown target.
for (const [name, val] of [['PBI_GROUP_ID', groupId], ['PBI_REPORT_ID', reportId], ['PBI_DATASET_ID', datasetId]]) {
    if (!val) fail(`${name} is not set. Provide all three real GUIDs as env vars (see header).`);
    if (val.startsWith('<') || !GUID.test(val)) fail(`${name}="${val}" is not a GUID (looks like a placeholder). Provide the real value.`);
}

const maskToken = (t) => (typeof t === 'string' && t) ? `${t.slice(0, 6)}…${t.slice(-4)} (len ${t.length})` : '(none)';

// B5 — the strict host check the app enforces. The minted embedUrl must be on powerbi.com.
function isPowerBiEmbedHost(urlStr) {
    try {
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();
        return u.protocol === 'https:' && (host === 'powerbi.com' || host.endsWith('.powerbi.com'));
    } catch { return false; }
}

const body = { assistantProfile: PROFILE, groupId, reportId, datasetId, permissions: 'View' };
console.log(`\n→ POST ${PROXY}/assistant/embed-token/powerbi`);
console.log(`  profile=${PROFILE}  group=${groupId}  report=${reportId}  dataset=${datasetId}  permissions=View\n`);

let res, json;
try {
    res = await fetch(`${PROXY}/assistant/embed-token/powerbi`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-assistant-profile': PROFILE },
        body: JSON.stringify(body),
    });
    json = await res.json().catch(() => ({}));
} catch (e) {
    fail(`Could not reach the proxy at ${PROXY}. Is it up? (cd proxy ; $env:PORT=7000 ; node server.js)\n   ${e.message}`);
}

// The expected failure mode if permissions aren't granted yet:
if (res.status === 401 || res.status === 403) {
    console.error(`\n❌ ${res.status} — token mint REJECTED.`);
    console.error(`   Most likely: the ${PROFILE} service principal does NOT have Build + Read on dataset ${datasetId}`);
    console.error(`   (or isn't added to the workspace). Grant it in Power BI, then re-run. This is BLOCKED-pending-permission, not a code bug.`);
    console.error(`   Raw: ${JSON.stringify(json).slice(0, 300)}`);
    process.exit(2);
}
if (!res.ok) fail(`${res.status} from the embed-token route. Raw: ${JSON.stringify(json).slice(0, 400)}`);

// ---- RUNNING checks ----
const checks = [
    ['200 + embedToken minted (SP has permission)', !!json.embedToken, ''],
    ['embedUrl returned', !!json.embedUrl, ''],
    ['embedUrl host is powerbi.com (B5 host check)', isPowerBiEmbedHost(json.embedUrl || ''), ''],
    ['expiry returned (token is time-boxed)', !!json.expiry, ''],
];

// ---- LEAKAGE checks (server-observable) ----
// Response must carry ONLY {embedToken, embedUrl, expiry, cached} — never the SP
// secret, AAD access token, or any *secret/clientSecret/accessToken field.
const respKeys = Object.keys(json);
const allowed = new Set(['embedToken', 'embedUrl', 'expiry', 'cached']);
const unexpected = respKeys.filter((k) => !allowed.has(k));
const blob = JSON.stringify(json);
const leakPatterns = [/clientSecret/i, /aadClientSecret/i, /powerBiClientSecret/i, /"accessToken"/i, /dapi[a-f0-9]{16,}/i];
const leakedSecret = leakPatterns.find((re) => re.test(blob));
checks.push(['response carries no unexpected fields', unexpected.length === 0, unexpected.length ? `extra: ${unexpected.join(',')}` : '']);
checks.push(['response leaks no SP secret / AAD token', !leakedSecret, leakedSecret ? `matched ${leakedSecret}` : '']);

let allPass = true;
console.log('Results:');
for (const [label, ok, note] of checks) {
    if (!ok) allPass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${label}${note ? '  — ' + note : ''}`);
}
console.log(`\n  embedToken: ${maskToken(json.embedToken)}   (masked — never printed in full or written to disk)`);
console.log(`  embedUrl:   ${json.embedUrl || '(none)'}`);
console.log(`  expiry:     ${json.expiry || '(none)'}    scope: View / single report`);

if (!allPass) fail('One or more checks failed (see above).');

console.log(`\n✅ STEP 1 PASS — ${PROFILE} SP minted a View-scoped, single-report embed token; no secret in the response.`);
console.log(`\nNEXT — STEP 2 (the PIXEL render + browser leakage check):`);
console.log(`  1. Start the playground:  cd playground ; npm run dev      (serves http://127.0.0.1:7001)`);
console.log(`  2. Open in a browser:     http://127.0.0.1:7001/verify-report-visual.html`);
console.log(`  3. Paste the same three IDs → "Mint + Render" → watch the report paint, confirm`);
console.log(`     'loaded' + 'rendered' fire, and the harness asserts the token is NOT in localStorage.\n`);
