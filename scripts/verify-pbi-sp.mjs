#!/usr/bin/env node
// scripts/verify-pbi-sp.mjs
//
// Verifies the powerbi-dwd service-principal path end-to-end, independent
// of the proxy. Proves whether the two manual Power BI admin steps took:
//   (1) tenant toggle "Allow service principals to use Power BI APIs"
//   (2) SP added as Member of the target workspace
//
// Steps:
//   1. client_credentials grant against AAD for the Power BI resource
//      using aadClientId/aadClientSecret/aadTenantId from the profile.
//   2. GET /myorg/groups/{groupId}/datasets  — proves workspace visibility.
//   3. GET /myorg/groups/{groupId}/reports   — lists reports (for the embed
//      path; surfaces a reportId to render).
//
// Run AFTER enabling the tenant toggle + adding the SP to the workspace
// (allow ~15 min for the tenant setting to propagate):
//   node --use-system-ca scripts/verify-pbi-sp.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'proxy', 'config.json');

const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const p = cfg.profiles?.['powerbi-dwd'];
if (!p) { console.error('powerbi-dwd profile missing'); process.exit(1); }

const tenant = p.aadTenantId || p.powerBiTenantId;
const clientId = p.aadClientId || p.powerBiClientId;
const clientSecret = p.aadClientSecret || p.powerBiClientSecret;
const groupId = p.powerbiGroupId;
const datasetId = p.powerbiDatasetId;
const reportId = p.powerbiReportId;
if (!tenant || !clientId || !clientSecret || clientId.startsWith('<')) {
    console.error('powerbi-dwd missing SP creds (aadTenantId/aadClientId/aadClientSecret).'); process.exit(1);
}

console.log(`[1] client_credentials grant (tenant=${tenant}, clientId=${clientId})...`);
const tokRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://analysis.windows.net/powerbi/api/.default',
    }).toString(),
});
if (!tokRes.ok) {
    console.error(`[1] FAIL — token grant ${tokRes.status}: ${(await tokRes.text()).slice(0, 400)}`);
    process.exit(1);
}
const tok = await tokRes.json();
console.log(`[1] OK — SP access token acquired (expires in ${tok.expires_in}s)`);

console.log(`\n[2] GET datasets in workspace ${groupId}...`);
const dsRes = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${groupId}/datasets`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
});
const dsText = await dsRes.text();
if (!dsRes.ok) {
    console.error(`[2] FAIL — ${dsRes.status}: ${dsText.slice(0, 400)}`);
    console.error(`    403 "Failed to get service principal details from AAD" => tenant toggle still OFF / not propagated.`);
    console.error(`    401/PowerBINotAuthorized => SP not a Member of the workspace yet.`);
    process.exit(1);
}
const datasets = (JSON.parse(dsText).value) || [];
console.log(`[2] OK — SP sees ${datasets.length} dataset(s):`);
for (const d of datasets) console.log(`      - ${String(d.name).padEnd(28)} id: ${d.id}`);

console.log(`\n[3] GET reports in workspace ${groupId}...`);
const rpRes = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
});
if (!rpRes.ok) {
    console.log(`[3] reports list ${rpRes.status} (non-fatal): ${(await rpRes.text()).slice(0, 200)}`);
} else {
    const reports = (await rpRes.json()).value || [];
    console.log(`[3] OK — ${reports.length} report(s):`);
    for (const r of reports) {
        console.log(`      - ${String(r.name).padEnd(28)} reportId: ${r.id}`);
        console.log(`        embedUrl: ${r.embedUrl}`);
    }
}

// [4] executeQueries — the deterministic DAX brain path (Ask Pulse / AI Insights).
if (datasetId) {
    console.log(`\n[4] POST executeQueries on dataset ${datasetId} (the DAX brain path)...`);
    const daxRes = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${groupId}/datasets/${datasetId}/executeQueries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [{ query: 'EVALUATE ROW("OFR", [Order Fill Rate Pct])' }], serializerSettings: { includeNulls: true } }),
    });
    const daxText = await daxRes.text();
    if (!daxRes.ok) {
        console.error(`[4] FAIL — ${daxRes.status}: ${daxText.slice(0, 300)}`);
        console.error(`    The SP needs BUILD permission on the dataset (workspace Member usually grants it; else grant Build in the dataset settings).`);
        process.exit(1);
    }
    const row = JSON.parse(daxText)?.results?.[0]?.tables?.[0]?.rows?.[0];
    console.log(`[4] OK — DAX ran under the SP. OFR grand total = ${JSON.stringify(row)} (expect ~98.12).`);
} else {
    console.log(`\n[4] SKIP — profile has no powerbiDatasetId.`);
}

// [5] GenerateToken — the report embed path (Config C: Power BI as the Dashboard).
if (reportId) {
    console.log(`\n[5] POST reports/${reportId}/GenerateToken (the report-embed path)...`);
    const embRes = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/GenerateToken`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'View' }),
    });
    const embText = await embRes.text();
    if (!embRes.ok) {
        console.log(`[5] embed-token ${embRes.status} (non-fatal for the DAX brain): ${embText.slice(0, 200)}`);
        console.log(`    Needed only for Config C (embedding the report). The brain path [4] can still be live.`);
    } else {
        const t = JSON.parse(embText);
        console.log(`[5] OK — embed token minted (expires ${t.expiration}). Config C report-embed unblocked.`);
    }
} else {
    console.log(`\n[5] SKIP — profile has no powerbiReportId.`);
}

console.log(`\n✅ SP path verified — tenant toggle + workspace access are live.`);
