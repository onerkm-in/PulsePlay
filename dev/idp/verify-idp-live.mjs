// Round-trip proof that PROXY_AUTH_MODE=idp verifies real signed tokens.
//
//   node dev/idp/verify-idp-live.mjs
//
// The jest suite deliberately never reaches the verification code: idpMiddleware
// short-circuits under NODE_ENV=test, so every idp unit test exercises claim
// shapes and mode contracts, not signatures. This script is the other half. It
// needs the dev IdP up (docker compose, or run-keycloak-nodocker.ps1), spawns
// the proxy itself with the right env, and asserts the things only a real
// issuer can prove:
//
//   1. no token            -> 401 on a protected route
//   2. valid signed token  -> passes auth (and the realm mappers put roles +
//                             audience where the proxy reads them)
//   3. tampered signature  -> 401
//   4. wrong audience      -> 401 (second proxy spawn with a different
//                             PROXY_IDP_AUDIENCE, same otherwise-valid token)
//
// Zero dependencies. Exit 0 = all pass, 1 = a check failed, 2 = IdP not up.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const proxyDir = join(here, '..', '..', 'proxy');

const IDP_BASE = process.env.PP_IDP_BASE || 'http://127.0.0.1:7010';
const REALM = `${IDP_BASE}/realms/pulseplay`;
const PROXY_PORT = Number(process.env.PP_IDP_PROXY_PORT || 7099);

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function idpReady() {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${REALM}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) return true;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
}

async function mintToken(user) {
    const body = new URLSearchParams({
        grant_type: 'password', client_id: 'pulseplay-proxy', username: user, password: user,
    });
    const res = await fetch(`${REALM}/protocol/openid-connect/token`, {
        method: 'POST', body, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`token grant for ${user} failed: HTTP ${res.status}`);
    return (await res.json()).access_token;
}

function decodePayload(token) {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function tamper(token) {
    const flip = (c) => (c === 'a' ? 'b' : 'a');
    return token.slice(0, -1) + flip(token.slice(-1));
}

function spawnProxy(extraEnv) {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: proxyDir,
        env: {
            ...process.env,
            NODE_ENV: 'development',
            PORT: String(PROXY_PORT),
            PROXY_AUTH_MODE: 'idp',
            PROXY_IDP_JWKS_URL: `${REALM}/protocol/openid-connect/certs`,
            PROXY_IDP_ISSUER: REALM,
            PROXY_IDP_AUDIENCE: 'pulseplay-proxy',
            ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', (d) => { logs += d; });
    child.stderr.on('data', (d) => { logs += d; });
    return { child, logs: () => logs };
}

async function proxyReady() {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PROXY_PORT}/health`, { signal: AbortSignal.timeout(1000) });
            if (res.status < 500) return true;
        } catch { /* not listening yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

// A protected route: sharedKeyMiddleware guards the cost-bearing prefixes, and
// which exact routes it covers is the proxy's business, not this script's — so
// probe a few candidates and use the first one that 401s anonymously.
const CANDIDATE_ROUTES = ['/assistant/capabilities', '/conversations', '/assistant/spend'];

async function callRoute(route, token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`http://127.0.0.1:${PROXY_PORT}${route}`, { headers, signal: AbortSignal.timeout(10000) });
    return res.status;
}

async function main() {
    console.log(`IdP: ${REALM}`);
    if (!(await idpReady())) {
        console.error('IdP is not reachable. Start it first (docker compose, or run-keycloak-nodocker.ps1).');
        process.exit(2);
    }

    const managerToken = await mintToken('manager');
    const noroleToken = await mintToken('norole');

    // The two Keycloak traps, checked at the source: the realm mappers must put
    // roles top-level and the client into aud, or the proxy checks below would
    // pass for the wrong reason (least-privilege fallback) or fail confusingly.
    const claims = decodePayload(managerToken);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    record('realm mapper: top-level roles claim', Array.isArray(claims.roles) && claims.roles.includes('supply-chain-manager'),
        `roles=${JSON.stringify(claims.roles)}`);
    record('realm mapper: audience includes pulseplay-proxy', aud.includes('pulseplay-proxy'), `aud=${JSON.stringify(claims.aud)}`);

    const proxy = spawnProxy();
    try {
        if (!(await proxyReady())) {
            console.error('Proxy did not come up. Logs:\n' + proxy.logs());
            process.exit(1);
        }

        let route = null;
        for (const candidate of CANDIDATE_ROUTES) {
            if ((await callRoute(candidate, null)) === 401) { route = candidate; break; }
        }
        record('anonymous request is rejected (401)', route !== null,
            route ? `route=${route}` : `none of ${CANDIDATE_ROUTES.join(', ')} returned 401`);
        if (!route) process.exit(finish());

        const validStatus = await callRoute(route, managerToken);
        record('valid manager token passes auth', validStatus !== 401 && validStatus !== 403, `HTTP ${validStatus}`);

        const noroleStatus = await callRoute(route, noroleToken);
        record('authenticated norole user passes auth (authorisation is a later gate)',
            noroleStatus !== 401 && noroleStatus !== 403, `HTTP ${noroleStatus}`);

        const tamperedStatus = await callRoute(route, tamper(managerToken));
        record('tampered signature is rejected (401)', tamperedStatus === 401, `HTTP ${tamperedStatus}`);

        proxy.child.kill();

        const wrongAud = spawnProxy({ PROXY_IDP_AUDIENCE: 'some-other-api' });
        try {
            if (!(await proxyReady())) {
                console.error('Wrong-audience proxy did not come up. Logs:\n' + wrongAud.logs());
                process.exit(1);
            }
            const wrongAudStatus = await callRoute(route, managerToken);
            record('audience enforcement: valid token, wrong expected aud -> 401', wrongAudStatus === 401, `HTTP ${wrongAudStatus}`);
        } finally {
            wrongAud.child.kill();
        }
    } finally {
        proxy.child.kill();
    }

    process.exit(finish());
}

function finish() {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    return failed.length ? 1 : 0;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
