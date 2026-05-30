#!/usr/bin/env node
// scripts/provision-azure-appservice.mjs
//
// Provision a $0 Azure App Service (Linux F1 Free) for PulsePlay via the
// ARM REST API. Uses a device-code sign-in for an ARM token, so it works
// on machines where `az` is blocked (e.g. Norton TLS interception) as long
// as Node runs with `--use-system-ca`.
//
// What it creates (idempotent PUTs):
//   1. Resource group
//   2. App Service plan — sku F1 (Free), Linux. $0, never consumes credit.
//   3. Web app — Node LTS, startup `node proxy/server.js`, HTTPS-only.
//   4. Base app settings (STATIC_DIR, PROXY_INLINE_CREDENTIALS_MODE=off,
//      PROXY_AUTH_MODE=none, SCM_DO_BUILD_DURING_DEPLOYMENT=false).
//
// It does NOT deploy code (see scripts/deploy-azure-zip.mjs) or enable
// Easy Auth (separate step). Secrets ride in the deployed config.json for
// the dev proof; production should move them to Key Vault refs.
//
// Run:
//   node --use-system-ca scripts/provision-azure-appservice.mjs \
//     --subscription 1ae0670a-e564-439b-93d1-ad2115aee5df \
//     --location centralindia
//
//   --resource-group <name>   default: pulseplay-rg
//   --plan <name>             default: pulseplay-f1
//   --app <name>              default: pulseplay-app-<random> (globally unique)
//   --runtime <linuxFx>       default: NODE|20-lts
//   --dry-run

import { writeFileSync } from 'node:fs';

const ARM = 'https://management.azure.com';
const AZURE_CLI_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const ARM_SCOPE = 'https://management.azure.com/.default offline_access';
const TENANT = 'organizations';

function parseArgs(argv) {
    // No region/subscription is hardcoded — both are required inputs so the
    // app can be provisioned in ANY datacenter (NA / EU / APAC / ...) per the
    // org's data-residency needs. `--location` is the data-residency knob.
    const out = {
        resourceGroup: 'pulseplay-rg',
        plan: 'pulseplay-f1',
        app: `pulseplay-app-${Math.random().toString(16).slice(2, 8)}`,
        location: undefined,
        runtime: 'NODE|20-lts',
        dryRun: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--subscription') out.subscription = argv[++i];
        else if (a === '--resource-group') out.resourceGroup = argv[++i];
        else if (a === '--plan') out.plan = argv[++i];
        else if (a === '--app') out.app = argv[++i];
        else if (a === '--location') out.location = argv[++i];
        else if (a === '--runtime') out.runtime = argv[++i];
        else if (a === '--dry-run') out.dryRun = true;
    }
    return out;
}

async function deviceCode() {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

let TOKEN = '';
async function arm(method, path, apiVersion, body) {
    const url = `${ARM}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
    const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : {};
}

async function main() {
    const a = parseArgs(process.argv);
    if (!a.subscription) { console.error('ERROR: --subscription is required.'); process.exit(2); }
    if (!a.location) {
        console.error('ERROR: --location is required (your data-residency region, e.g. eastus, westeurope, centralindia). Nothing is hardcoded to a region.');
        process.exit(2);
    }

    console.log('Plan:');
    console.log(`  Subscription: ${a.subscription}`);
    console.log(`  Location:     ${a.location}`);
    console.log(`  Resource grp: ${a.resourceGroup}`);
    console.log(`  Plan (F1):    ${a.plan}`);
    console.log(`  Web app:      ${a.app}  ->  https://${a.app}.azurewebsites.net`);
    console.log(`  Runtime:      ${a.runtime}`);
    if (a.dryRun) { console.log('\n--dry-run; no changes.'); return; }

    const dc = await deviceCode();
    console.log('\n' + '='.repeat(72));
    console.log('  SIGN-IN REQUIRED:');
    console.log('  ' + dc.message);
    console.log('='.repeat(72) + '\n');
    const tok = await pollToken(dc);
    TOKEN = tok.access_token;
    console.log('✔ Signed in. ARM token acquired.\n');

    const subPath = `/subscriptions/${a.subscription}`;

    console.log(`→ Resource group ${a.resourceGroup}...`);
    await arm('PUT', `${subPath}/resourcegroups/${a.resourceGroup}`, '2021-04-01', { location: a.location });
    console.log('  ✔ ok');

    console.log(`→ App Service plan ${a.plan} (F1 Linux, $0)...`);
    await arm('PUT', `${subPath}/resourceGroups/${a.resourceGroup}/providers/Microsoft.Web/serverfarms/${a.plan}`, '2023-12-01', {
        location: a.location,
        sku: { name: 'F1', tier: 'Free', size: 'F1', family: 'F', capacity: 0 },
        kind: 'linux',
        properties: { reserved: true }, // reserved:true => Linux
    });
    console.log('  ✔ ok');

    const planId = `${subPath}/resourceGroups/${a.resourceGroup}/providers/Microsoft.Web/serverfarms/${a.plan}`;
    console.log(`→ Web app ${a.app}...`);
    await arm('PUT', `${subPath}/resourceGroups/${a.resourceGroup}/providers/Microsoft.Web/sites/${a.app}`, '2023-12-01', {
        location: a.location,
        kind: 'app,linux',
        properties: {
            serverFarmId: planId,
            reserved: true,
            httpsOnly: true,
            siteConfig: {
                linuxFxVersion: a.runtime,
                appCommandLine: 'node proxy/server.js',
                alwaysOn: false,          // F1 does not support Always On
                minTlsVersion: '1.2',
                ftpsState: 'Disabled',
                http20Enabled: true,
            },
        },
    });
    console.log('  ✔ ok');

    console.log(`→ Base app settings...`);
    await arm('PUT', `${subPath}/resourceGroups/${a.resourceGroup}/providers/Microsoft.Web/sites/${a.app}/config/appsettings`, '2023-12-01', {
        properties: {
            STATIC_DIR: 'playground/dist',
            PROXY_INLINE_CREDENTIALS_MODE: 'off',
            PROXY_AUTH_MODE: 'none',
            SCM_DO_BUILD_DURING_DEPLOYMENT: 'false',
            WEBSITE_RUN_FROM_PACKAGE: '0',
        },
    });
    console.log('  ✔ ok');

    const site = await arm('GET', `${subPath}/resourceGroups/${a.resourceGroup}/providers/Microsoft.Web/sites/${a.app}`, '2023-12-01');
    const out = {
        subscription: a.subscription,
        resourceGroup: a.resourceGroup,
        plan: a.plan,
        app: a.app,
        location: a.location,
        defaultHostName: site.properties?.defaultHostName,
        url: `https://${site.properties?.defaultHostName}`,
        scmUrl: `https://${a.app}.scm.azurewebsites.net`,
        state: site.properties?.state,
    };
    writeFileSync(new URL('./.azure-appservice.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

    console.log('\n' + '='.repeat(72));
    console.log('  PROVISIONED (F1 Free, $0).');
    console.log(`  URL:  ${out.url}`);
    console.log(`  SCM:  ${out.scmUrl}`);
    console.log(`  State: ${out.state}`);
    console.log('  Wrote scripts/.azure-appservice.json (used by the deploy step).');
    console.log('  Next: zip-deploy the curated package, then enable Easy Auth.');
    console.log('='.repeat(72));
}

main().catch(e => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
