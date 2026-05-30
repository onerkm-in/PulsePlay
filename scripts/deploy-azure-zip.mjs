#!/usr/bin/env node
// scripts/deploy-azure-zip.mjs
//
// Zip-deploy the curated PulsePlay package to the App Service provisioned by
// provision-azure-appservice.mjs. Reads scripts/.azure-appservice.json for the
// target. Device-code sign-in for an ARM token (works through Norton TLS with
// `node --use-system-ca`). Pushes the zip to Kudu /api/zipdeploy using a Bearer
// token; falls back to basic publishing credentials if AAD-to-SCM is blocked.
//
// Nothing is region/host hardcoded — the target comes entirely from the
// provisioning metadata file.
//
// Run (after building pulseplay-deploy.zip):
//   node --use-system-ca scripts/deploy-azure-zip.mjs [--zip <path>]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const META = resolve(__dirname, '.azure-appservice.json');
const AZURE_CLI_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const ARM_SCOPE = 'https://management.azure.com/.default offline_access';
const TENANT = 'organizations';
const ARM = 'https://management.azure.com';

let zipPath = resolve(__dirname, '..', 'pulseplay-deploy.zip');
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--zip') zipPath = resolve(process.argv[++i]);
}

const meta = JSON.parse(readFileSync(META, 'utf-8'));
const zip = readFileSync(zipPath);
console.log(`Target: ${meta.app}  (${meta.url})`);
console.log(`Zip:    ${zipPath}  (${(zip.length / 1048576).toFixed(1)} MB)`);

async function deviceCode() {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: AZURE_CLI_PUBLIC_CLIENT_ID, scope: ARM_SCOPE }).toString(),
    });
    if (!r.ok) throw new Error(`devicecode failed: ${r.status} ${await r.text()}`);
    return r.json();
}
async function pollToken(dc) {
    const deadline = Date.now() + dc.expires_in * 1000;
    const interval = Math.max(1, Number(dc.interval) || 5) * 1000;
    while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, interval));
        const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: AZURE_CLI_PUBLIC_CLIENT_ID,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: dc.device_code,
            }).toString(),
        });
        if (r.ok) return r.json();
        const e = await r.json().catch(() => ({}));
        if (e.error === 'authorization_pending' || e.error === 'slow_down') continue;
        throw new Error(`token poll failed: ${e.error} ${e.error_description || ''}`);
    }
    throw new Error('device code expired');
}

async function main() {
    const dc = await deviceCode();
    console.log('\n' + '='.repeat(72));
    console.log('  SIGN-IN REQUIRED:');
    console.log('  ' + dc.message);
    console.log('='.repeat(72) + '\n');
    const tok = await pollToken(dc);
    const token = tok.access_token;
    console.log('✔ Signed in. ARM token acquired.\n');

    const scm = meta.scmUrl.replace(/\/+$/, '');
    const zipDeployUrl = `${scm}/api/zipdeploy`;

    console.log(`→ Pushing zip to ${zipDeployUrl} (Bearer)...`);
    let r = await fetch(zipDeployUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
        body: zip,
    });

    if (r.status === 401 || r.status === 403) {
        console.log(`  Bearer to SCM rejected (${r.status}); fetching basic publishing credentials via ARM...`);
        const credPath = `${ARM}/subscriptions/${meta.subscription}/resourceGroups/${meta.resourceGroup}/providers/Microsoft.Web/sites/${meta.app}/config/publishingcredentials/list?api-version=2023-12-01`;
        const cr = await fetch(credPath, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (!cr.ok) throw new Error(`publishingcredentials/list failed: ${cr.status} ${(await cr.text()).slice(0, 300)}`);
        const creds = await cr.json();
        const user = creds.properties?.publishingUserName;
        const pass = creds.properties?.publishingPassword;
        const basic = Buffer.from(`${user}:${pass}`).toString('base64');
        console.log('  Retrying zipdeploy with basic auth...');
        r = await fetch(zipDeployUrl, {
            method: 'POST',
            headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/zip' },
            body: zip,
        });
    }

    const body = await r.text();
    if (!r.ok) throw new Error(`zipdeploy failed: ${r.status} ${body.slice(0, 600)}`);
    console.log(`  ✔ zipdeploy accepted (HTTP ${r.status}).`);

    console.log('\n' + '='.repeat(72));
    console.log('  DEPLOYED. The app will cold-start on first request (F1, no Always On).');
    console.log(`  URL:  ${meta.url}`);
    console.log(`  Health: ${meta.url}/health`);
    console.log('='.repeat(72));
}

main().catch(e => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
