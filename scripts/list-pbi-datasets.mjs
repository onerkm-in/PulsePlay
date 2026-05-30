#!/usr/bin/env node
// List all workspaces + datasets the powerbi-dwd profile can see.
// Uses the existing user-refresh token in proxy/config.json. Prints
// workspace IDs + dataset IDs so we can find the GUID for the
// SalesPerformance dataset to point a new profile at.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'proxy', 'config.json');

const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const profile = cfg.profiles?.['powerbi-dwd'];
if (!profile) { console.error('powerbi-dwd profile missing'); process.exit(1); }

const tenant = profile.aadTenantId;
const clientId = profile.userClientId || '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const refreshToken = profile.userRefreshToken;
if (!refreshToken || refreshToken.startsWith('<')) {
    console.error('powerbi-dwd has no userRefreshToken'); process.exit(1);
}

console.log(`[1] Exchanging refresh token for access token (tenant=${tenant})...`);
const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'https://analysis.windows.net/powerbi/api/.default offline_access',
    }).toString(),
});
if (!tokenRes.ok) {
    console.error('Token exchange failed:', tokenRes.status, await tokenRes.text());
    process.exit(1);
}
const tokenJson = await tokenRes.json();
const accessToken = tokenJson.access_token;
console.log(`[1] OK — access token acquired (expires in ${tokenJson.expires_in}s)`);

console.log(`\n[2] Listing all workspaces...`);
const wsRes = await fetch('https://api.powerbi.com/v1.0/myorg/groups', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
});
if (!wsRes.ok) {
    console.error('Workspaces list failed:', wsRes.status, await wsRes.text());
    process.exit(1);
}
const wsJson = await wsRes.json();
const workspaces = wsJson.value || [];
console.log(`[2] Found ${workspaces.length} workspaces`);

console.log(`\n[3] Listing datasets per workspace...\n`);
let foundSalesPerf = null;
for (const ws of workspaces) {
    const dsRes = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${ws.id}/datasets`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!dsRes.ok) {
        console.log(`  [SKIP] ${ws.name} (${ws.id}) — list failed ${dsRes.status}`);
        continue;
    }
    const dsJson = await dsRes.json();
    const datasets = dsJson.value || [];
    if (datasets.length === 0) continue;
    console.log(`Workspace: ${ws.name}`);
    console.log(`  id: ${ws.id}`);
    console.log(`  datasets (${datasets.length}):`);
    for (const ds of datasets) {
        const marker = /sales\s*performance/i.test(ds.name) ? '  ← MATCH' : '';
        console.log(`    - ${ds.name.padEnd(30)} id: ${ds.id}${marker}`);
        if (/^salesperformance$/i.test(ds.name) || /sales\s*performance/i.test(ds.name)) {
            foundSalesPerf = { workspaceId: ws.id, workspaceName: ws.name, datasetId: ds.id, datasetName: ds.name };
        }
    }
    console.log('');
}

if (foundSalesPerf) {
    console.log(`\n[FOUND] SalesPerformance dataset:`);
    console.log(`  workspace: ${foundSalesPerf.workspaceName} (${foundSalesPerf.workspaceId})`);
    console.log(`  dataset:   ${foundSalesPerf.datasetName} (${foundSalesPerf.datasetId})`);
    console.log(`\nUpdate proxy/config.json profile "powerbi-dwd" with:`);
    console.log(`  "powerbiGroupId":   "${foundSalesPerf.workspaceId}",`);
    console.log(`  "powerbiDatasetId": "${foundSalesPerf.datasetId}"`);
} else {
    console.log(`\n[NOT FOUND] No dataset matching "Sales Performance" in any workspace.`);
}
