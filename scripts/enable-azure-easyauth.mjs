#!/usr/bin/env node
// scripts/enable-azure-easyauth.mjs
//
// Enable Azure App Service Authentication (Easy Auth) with Microsoft Entra,
// single-tenant, "require authentication" — so the public URL is org-only.
// Programmatic equivalent of the portal's 5-click express setup.
//
// One device-code sign-in (offline_access); the refresh token is exchanged
// for BOTH a Graph token (create the auth app registration + secret) and an
// ARM token (store the secret app setting + write authsettingsV2). Works
// through Norton TLS with `node --use-system-ca`. Tenant is derived from the
// token (not hardcoded); target app comes from scripts/.azure-appservice.json.
//
// Run:
//   node --use-system-ca scripts/enable-azure-easyauth.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const meta = JSON.parse(readFileSync(resolve(__dirname, '.azure-appservice.json'), 'utf-8'));
const CLIENT = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const TENANT_AUTH = 'organizations';
const ARM = 'https://management.azure.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function decodeTid(jwt) {
    try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).tid; }
    catch { return null; }
}

async function deviceCode(scope) {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT_AUTH}/oauth2/v2.0/devicecode`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT, scope }).toString(),
    });
    if (!r.ok) throw new Error(`devicecode: ${r.status} ${await r.text()}`);
    return r.json();
}
async function pollToken(dc) {
    const deadline = Date.now() + dc.expires_in * 1000;
    const interval = Math.max(1, Number(dc.interval) || 5) * 1000;
    while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, interval));
        const r = await fetch(`https://login.microsoftonline.com/${TENANT_AUTH}/oauth2/v2.0/token`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: CLIENT, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: dc.device_code }).toString(),
        });
        if (r.ok) return r.json();
        const e = await r.json().catch(() => ({}));
        if (e.error === 'authorization_pending' || e.error === 'slow_down') continue;
        throw new Error(`token poll: ${e.error} ${e.error_description || ''}`);
    }
    throw new Error('device code expired');
}
async function refreshFor(refreshToken, scope) {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT_AUTH}/oauth2/v2.0/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT, grant_type: 'refresh_token', refresh_token: refreshToken, scope }).toString(),
    });
    if (!r.ok) throw new Error(`refresh (scope=${scope}): ${r.status} ${await r.text()}`);
    return r.json();
}
async function api(token, url, method, body) {
    const r = await fetch(url, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${url.replace(ARM, '').replace('https://graph.microsoft.com/v1.0', 'graph')} -> ${r.status}: ${t.slice(0, 500)}`);
    return t ? JSON.parse(t) : {};
}

async function main() {
    const host = meta.defaultHostName;
    const redirect = `https://${host}/.auth/login/aad/callback`;

    const dc = await deviceCode('https://graph.microsoft.com/.default offline_access');
    console.log('\n' + '='.repeat(72));
    console.log('  SIGN-IN REQUIRED:');
    console.log('  ' + dc.message);
    console.log('='.repeat(72) + '\n');
    const tok = await pollToken(dc);
    const graphToken = tok.access_token;
    const refresh = tok.refresh_token;
    const tenantId = decodeTid(graphToken);
    if (!tenantId) throw new Error('could not derive tenant id from token');
    console.log(`✔ Signed in. Tenant ${tenantId}.`);

    console.log(`→ Creating Entra app registration (single-tenant, redirect ${redirect})...`);
    const app = await api(graphToken, `${GRAPH}/applications`, 'POST', {
        displayName: `${meta.app}-easyauth`,
        signInAudience: 'AzureADMyOrg',
        web: { redirectUris: [redirect], implicitGrantSettings: { enableIdTokenIssuance: true } },
    });
    console.log(`  ✔ appId=${app.appId}`);

    try { await api(graphToken, `${GRAPH}/servicePrincipals`, 'POST', { appId: app.appId }); console.log('  ✔ service principal created'); }
    catch (e) { console.log('  ⚠ SP create skipped/failed (often already exists):', e.message.slice(0, 120)); }

    const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 6);
    const pwd = await api(graphToken, `${GRAPH}/applications/${app.id}/addPassword`, 'POST', {
        passwordCredential: { displayName: 'easyauth', endDateTime: expiry.toISOString() },
    });
    console.log('  ✔ client secret minted');

    console.log('→ Exchanging for ARM token...');
    const armTok = await refreshFor(refresh, 'https://management.azure.com/.default');
    const armToken = armTok.access_token;

    const site = `${ARM}/subscriptions/${meta.subscription}/resourceGroups/${meta.resourceGroup}/providers/Microsoft.Web/sites/${meta.app}`;

    console.log('→ Storing client secret as app setting (merge, no clobber)...');
    const cur = await api(armToken, `${site}/config/appsettings/list?api-version=2023-12-01`, 'POST');
    const merged = { ...(cur.properties || {}), MICROSOFT_PROVIDER_AUTHENTICATION_SECRET: pwd.secretText };
    await api(armToken, `${site}/config/appsettings?api-version=2023-12-01`, 'PUT', { properties: merged });
    console.log('  ✔ ok');

    console.log('→ Writing authsettingsV2 (require authentication)...');
    await api(armToken, `${site}/config/authsettingsV2?api-version=2023-12-01`, 'PUT', {
        properties: {
            platform: { enabled: true },
            globalValidation: {
                requireAuthentication: true,
                unauthenticatedClientAction: 'RedirectToLoginPage',
                redirectToProvider: 'azureactivedirectory',
            },
            identityProviders: {
                azureActiveDirectory: {
                    enabled: true,
                    registration: {
                        openIdIssuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
                        clientId: app.appId,
                        clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET',
                    },
                    validation: { allowedAudiences: [app.appId, `api://${app.appId}`] },
                },
            },
            login: { tokenStore: { enabled: true } },
        },
    });
    console.log('  ✔ ok');

    console.log('\n' + '='.repeat(72));
    console.log('  EASY AUTH ENABLED — the app now requires Entra sign-in (org-only).');
    console.log(`  appId: ${app.appId}  (secret expires ${expiry.toISOString().slice(0, 10)})`);
    console.log(`  Verify: open ${meta.url} in a fresh browser -> Microsoft sign-in.`);
    console.log('='.repeat(72));
}

main().catch(e => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
