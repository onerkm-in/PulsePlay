#!/usr/bin/env node
// scripts/get-pbi-user-refresh-token.mjs
//
// One-shot MSAL device-code flow against Power BI. Prints the access_token
// (informational) AND refresh_token. Use the refresh_token to populate the
// `userRefreshToken` field on a powerbi-semantic-model profile that has
// `authMode: "user-refresh"`.
//
// Usage:
//   node scripts/get-pbi-user-refresh-token.mjs --tenant <tenant-guid> [--profile powerbi-dwd] [--write]
//
//   --tenant <id>     Tenant ID (or use AAD_TENANT_ID env var).
//   --profile <name>  Profile name in proxy/config.json to write into.
//   --write           Write refresh_token straight into proxy/config.json
//                     (otherwise just prints it; you paste manually).
//
// Public client used: Azure CLI's well-known app (04b07795-...). It has
// pre-consented Power BI delegated permissions in most tenants. Requesting
// `offline_access` ensures a refresh_token comes back. Refresh-token TTL is
// 14-90 days depending on tenant conditional-access policy.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'proxy', 'config.json');

const AZURE_CLI_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const SCOPE = 'https://analysis.windows.net/powerbi/api/.default offline_access';

function parseArgs(argv) {
    const out = { write: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tenant') out.tenant = argv[++i];
        else if (a === '--profile') out.profile = argv[++i];
        else if (a === '--write') out.write = true;
        else if (a === '--help' || a === '-h') { out.help = true; }
    }
    return out;
}

function help() {
    console.log(`
Usage: node scripts/get-pbi-user-refresh-token.mjs --tenant <tenant-guid> [--profile <name>] [--write]

  --tenant <id>     Required. Entra ID tenant GUID. Or set AAD_TENANT_ID env var.
  --profile <name>  Optional. Profile name in proxy/config.json to target.
  --write           Optional. Write refresh_token directly into the named profile.
                    Without --write, just prints token to stdout.

Examples:
  node scripts/get-pbi-user-refresh-token.mjs --tenant 2b983dc1-08a4-4b13-87d9-065f8db8f99b
  node scripts/get-pbi-user-refresh-token.mjs --tenant 2b983dc1-...-065f8db8f99b --profile powerbi-dwd --write
`);
}

async function deviceCode(tenant) {
    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/devicecode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: AZURE_CLI_PUBLIC_CLIENT_ID, scope: SCOPE }).toString(),
    });
    if (!r.ok) throw new Error(`Device-code request failed: ${r.status} ${await r.text()}`);
    return r.json();
}

async function pollForToken(tenant, deviceCodeData) {
    const deadline = Date.now() + deviceCodeData.expires_in * 1000;
    const interval = Math.max(1, Number(deviceCodeData.interval) || 5) * 1000;
    while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, interval));
        const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: AZURE_CLI_PUBLIC_CLIENT_ID,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: deviceCodeData.device_code,
            }).toString(),
        });
        if (r.ok) return r.json();
        let err = {};
        try { err = await r.json(); } catch {}
        if (err.error === 'authorization_pending') continue;
        if (err.error === 'slow_down') { await new Promise(res => setTimeout(res, interval)); continue; }
        throw new Error(`Token poll failed: ${err.error || r.status} — ${err.error_description || 'unknown'}`);
    }
    throw new Error('Device code expired before sign-in completed');
}

function writeRefreshTokenToProfile(profileName, refreshToken) {
    if (!existsSync(CONFIG_PATH)) throw new Error(`config.json not found at ${CONFIG_PATH}`);
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    if (!cfg.profiles?.[profileName]) {
        throw new Error(`Profile "${profileName}" not found in proxy/config.json. Available: ${Object.keys(cfg.profiles || {}).join(', ')}`);
    }
    cfg.profiles[profileName].authMode = 'user-refresh';
    cfg.profiles[profileName].userRefreshToken = refreshToken;
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    console.log(`✔ Updated ${CONFIG_PATH} → profiles.${profileName}.authMode = "user-refresh" (token stored)`);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { help(); return; }
    const tenant = args.tenant || process.env.AAD_TENANT_ID;
    if (!tenant) {
        console.error('ERROR: --tenant is required (or set AAD_TENANT_ID).');
        help();
        process.exit(2);
    }

    console.log(`→ Requesting device code from tenant ${tenant}...`);
    const dc = await deviceCode(tenant);
    console.log('\n' + '='.repeat(72));
    console.log('  SIGN-IN REQUIRED:');
    console.log('  ' + dc.message);
    console.log('='.repeat(72) + '\n');
    console.log('  (waiting for sign-in to complete; expires in ' + dc.expires_in + ' sec)\n');

    const tok = await pollForToken(tenant, dc);
    console.log('✔ Sign-in successful.');
    console.log(`  access_token  expires in ${tok.expires_in} sec`);
    console.log(`  refresh_token length: ${(tok.refresh_token || '').length} chars`);
    console.log('');

    if (args.profile && args.write) {
        writeRefreshTokenToProfile(args.profile, tok.refresh_token);
    } else {
        console.log('REFRESH TOKEN (paste into proxy/config.json profile.userRefreshToken):');
        console.log('────────────────────────────────────────────────────────────────────────');
        console.log(tok.refresh_token);
        console.log('────────────────────────────────────────────────────────────────────────');
        if (args.profile) {
            console.log(`\nTo write automatically next time:`);
            console.log(`  node scripts/get-pbi-user-refresh-token.mjs --tenant ${tenant} --profile ${args.profile} --write`);
        }
    }
}

main().catch(err => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
});
