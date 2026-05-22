#!/usr/bin/env node
// scripts/create-pbi-service-principal.mjs
//
// One-shot SP bootstrap for the powerbi-semantic-model connector.
// Does EVERYTHING in one device-code sign-in:
//
//   1. Device-code flow against Microsoft Graph (+ offline_access for refresh).
//   2. POST  https://graph.microsoft.com/v1.0/applications              → create app.
//   3. POST  https://graph.microsoft.com/v1.0/servicePrincipals         → instantiate SP.
//   4. POST  https://graph.microsoft.com/v1.0/applications/{id}/addPassword → mint client secret.
//   5. Exchange the captured refresh_token for a Power BI access token.
//   6. POST  https://api.powerbi.com/v1.0/myorg/groups/{groupId}/users  → add SP to workspace.
//   7. Write aadClientId + aadClientSecret into proxy/config.json (named profile).
//
// What's NOT automatable (Microsoft does not expose APIs for these):
//   - "Allow service principals to use Power BI APIs" tenant setting must be
//     enabled in the Power BI admin portal (Tenant settings → Developer settings).
//     The script reminds you at the end.
//
// Usage:
//   node scripts/create-pbi-service-principal.mjs --tenant <id> --profile powerbi-dwd
//
//   --tenant <id>       Required. Entra tenant GUID.
//   --profile <name>    Required. Profile in proxy/config.json to receive creds.
//                        Must already have powerbiGroupId + powerbiDatasetId set.
//   --app-name <name>   Optional. App registration display name. Default: "pulseplay-powerbi-sp".
//   --secret-months <n> Optional. Secret validity in months. Default: 6.
//   --dry-run           Optional. Print plan without making changes.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'proxy', 'config.json');

const AZURE_CLI_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default offline_access';
const PBI_RESOURCE = 'https://analysis.windows.net/powerbi/api/.default';

function parseArgs(argv) {
    const out = { appName: 'pulseplay-powerbi-sp', secretMonths: 6, dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tenant') out.tenant = argv[++i];
        else if (a === '--profile') out.profile = argv[++i];
        else if (a === '--app-name') out.appName = argv[++i];
        else if (a === '--secret-months') out.secretMonths = parseInt(argv[++i], 10);
        else if (a === '--dry-run') out.dryRun = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function help() {
    console.log(`
Usage: node scripts/create-pbi-service-principal.mjs --tenant <id> --profile <name> [options]

  --tenant <id>       Required. Entra tenant GUID.
  --profile <name>    Required. Profile in proxy/config.json (must already have powerbiGroupId + powerbiDatasetId).
  --app-name <name>   App registration name (default: pulseplay-powerbi-sp).
  --secret-months <n> Secret validity (default: 6).
  --dry-run           Show what would be done without making changes.

Example:
  node scripts/create-pbi-service-principal.mjs \\
    --tenant 2b983dc1-08a4-4b13-87d9-065f8db8f99b \\
    --profile powerbi-dwd
`);
}

/* ───── OAuth helpers ────────────────────────────────────────────── */

async function deviceCode(tenant, scope) {
    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/devicecode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: AZURE_CLI_PUBLIC_CLIENT_ID, scope }).toString(),
    });
    if (!r.ok) throw new Error(`Device-code request failed: ${r.status} ${await r.text()}`);
    return r.json();
}

async function pollForToken(tenant, dc) {
    const deadline = Date.now() + dc.expires_in * 1000;
    const interval = Math.max(1, Number(dc.interval) || 5) * 1000;
    while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, interval));
        const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: AZURE_CLI_PUBLIC_CLIENT_ID,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: dc.device_code,
            }).toString(),
        });
        if (r.ok) return r.json();
        let err = {}; try { err = await r.json(); } catch {}
        if (err.error === 'authorization_pending') continue;
        if (err.error === 'slow_down') { await new Promise(res => setTimeout(res, interval)); continue; }
        throw new Error(`Token poll failed: ${err.error || r.status} — ${err.error_description || 'unknown'}`);
    }
    throw new Error('Device code expired before sign-in completed');
}

async function exchangeRefreshForResource(tenant, refreshToken, scope) {
    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: AZURE_CLI_PUBLIC_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope,
        }).toString(),
    });
    if (!r.ok) throw new Error(`Refresh-token exchange (scope=${scope}) failed: ${r.status} ${await r.text()}`);
    return r.json();
}

/* ───── Graph + Power BI calls ───────────────────────────────────── */

async function graphPost(token, path, body) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Graph POST ${path} failed (${r.status}): ${(await r.text()).slice(0, 500)}`);
    return r.json();
}

async function pbiPost(token, path, body) {
    const r = await fetch(`https://api.powerbi.com/v1.0${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Power BI POST ${path} failed (${r.status}): ${(await r.text()).slice(0, 500)}`);
    // POST /groups/{id}/users returns 200 with empty body on success
    const text = await r.text();
    return text ? JSON.parse(text) : {};
}

/* ───── Config write-back ────────────────────────────────────────── */

function writeProfileCreds(profileName, clientId, clientSecret) {
    if (!existsSync(CONFIG_PATH)) throw new Error(`config.json not found at ${CONFIG_PATH}`);
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    if (!cfg.profiles?.[profileName]) {
        throw new Error(`Profile "${profileName}" not found. Available: ${Object.keys(cfg.profiles || {}).join(', ')}`);
    }
    cfg.profiles[profileName].authMode = 'service-principal';
    cfg.profiles[profileName].aadClientId = clientId;
    cfg.profiles[profileName].aadClientSecret = clientSecret;
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

/* ───── Main ─────────────────────────────────────────────────────── */

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { help(); return; }
    if (!args.tenant) { console.error('ERROR: --tenant is required.'); help(); process.exit(2); }
    if (!args.profile) { console.error('ERROR: --profile is required.'); help(); process.exit(2); }

    if (!existsSync(CONFIG_PATH)) throw new Error(`proxy/config.json not found at ${CONFIG_PATH}`);
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const profile = cfg.profiles?.[args.profile];
    if (!profile) throw new Error(`Profile "${args.profile}" not found in proxy/config.json. Available: ${Object.keys(cfg.profiles || {}).join(', ')}`);
    const groupId = profile.powerbiGroupId || profile.powerBiGroupId;
    if (!groupId) throw new Error(`Profile "${args.profile}" missing powerbiGroupId (workspace GUID).`);

    console.log(`Plan:`);
    console.log(`  Tenant:      ${args.tenant}`);
    console.log(`  Profile:     ${args.profile}`);
    console.log(`  Workspace:   ${groupId}`);
    console.log(`  App name:    ${args.appName}`);
    console.log(`  Secret TTL:  ${args.secretMonths} months`);
    if (args.dryRun) { console.log('\n--dry-run; exiting without changes.'); return; }

    /* 1. Device-code → Graph + offline_access token */
    console.log(`\n→ Requesting device code (Microsoft Graph scope)...`);
    const dc = await deviceCode(args.tenant, GRAPH_SCOPE);
    console.log('\n' + '='.repeat(72));
    console.log('  SIGN-IN REQUIRED:');
    console.log('  ' + dc.message);
    console.log('='.repeat(72) + '\n');
    const tok = await pollForToken(args.tenant, dc);
    console.log('✔ Signed in. Graph token + refresh_token captured.\n');
    const graphToken = tok.access_token;
    const refreshToken = tok.refresh_token;

    /* 2. Create App Registration */
    console.log(`→ Creating app registration "${args.appName}"...`);
    const app = await graphPost(graphToken, '/applications', {
        displayName: args.appName,
        signInAudience: 'AzureADMyOrg',
    });
    console.log(`  ✔ App created. appId=${app.appId}  objectId=${app.id}`);

    /* 3. Create Service Principal */
    console.log(`→ Creating service principal for the app...`);
    const sp = await graphPost(graphToken, '/servicePrincipals', { appId: app.appId });
    console.log(`  ✔ SP created. objectId=${sp.id}  appOwnerOrgId=${sp.appOwnerOrganizationId || 'n/a'}`);

    /* 4. Mint client secret */
    console.log(`→ Minting client secret (${args.secretMonths} months)...`);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + args.secretMonths);
    const pwdResp = await graphPost(graphToken, `/applications/${app.id}/addPassword`, {
        passwordCredential: { displayName: 'pulseplay-bootstrap', endDateTime: expiry.toISOString() },
    });
    const clientSecret = pwdResp.secretText;
    console.log(`  ✔ Secret created. Expires ${expiry.toISOString().slice(0, 10)}.`);

    /* 5. Exchange refresh_token for Power BI token */
    console.log(`\n→ Exchanging refresh token for Power BI access token...`);
    const pbiTok = await exchangeRefreshForResource(args.tenant, refreshToken, PBI_RESOURCE);
    console.log(`  ✔ Power BI token acquired.`);

    /* 6. Add SP to workspace */
    console.log(`→ Adding SP to workspace ${groupId}...`);
    try {
        await pbiPost(pbiTok.access_token, `/myorg/groups/${groupId}/users`, {
            identifier: sp.id,
            principalType: 'App',
            groupUserAccessRight: 'Member',
        });
        console.log(`  ✔ SP added as Member of the workspace.`);
    } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('401') || msg.includes('PowerBINotAuthorizedException')) {
            console.log(`  ⚠ Workspace-add failed with 401. This is the well-known "tenant SP toggle not enabled" error.`);
            console.log(`    The app + SP + secret were created successfully — you can still do this step manually after`);
            console.log(`    flipping the tenant setting (see reminder below).`);
        } else {
            console.log(`  ⚠ Workspace-add failed: ${msg}`);
            console.log(`    The app + SP + secret were created successfully.`);
        }
    }

    /* 7. Write to config.json */
    console.log(`\n→ Writing creds into proxy/config.json profiles.${args.profile}...`);
    writeProfileCreds(args.profile, app.appId, clientSecret);
    console.log(`  ✔ Wrote aadClientId + aadClientSecret. authMode set to "service-principal".`);

    /* 8. Reminders */
    console.log('\n' + '='.repeat(72));
    console.log('  DONE. Two manual prereqs remain (one-time, Power BI tenant admin):');
    console.log('');
    console.log('  1. Power BI Admin Portal → Tenant settings → Developer settings →');
    console.log('     "Allow service principals to use Power BI APIs" → ENABLED.');
    console.log('     Scope to a security group containing the new SP.');
    console.log('     URL: https://app.powerbi.com/admin-portal/tenantSettings');
    console.log('');
    console.log('  2. If the workspace-add step above logged a 401, redo it via the workspace');
    console.log('     "Manage access" UI: add the "' + args.appName + '" app as Member.');
    console.log('');
    console.log('  After both, restart the proxy and the powerbi-semantic-model connector is live.');
    console.log('='.repeat(72));
}

main().catch(err => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
});
