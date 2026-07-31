/**
 * The claim shape the proxy actually reads, pinned against a real IdP's default.
 *
 * dev/idp/ stands up Keycloak so PROXY_AUTH_MODE=idp can finally be exercised
 * against genuinely signed tokens instead of only unit-tested fail-closed. Doing
 * that surfaced a trap worth a permanent test rather than a paragraph in a
 * README: Keycloak's DEFAULT token puts realm roles under `realm_access.roles`,
 * while normalizeIdpUserClaims reads a TOP-LEVEL `roles` claim (Entra-style).
 *
 * The failure mode is nasty precisely because nothing errors. Every user
 * authenticates, every token verifies, and everyone silently resolves to Planner
 * by the least-privilege default — so a Manager who cannot approve looks like a
 * permissions bug in our code rather than a missing protocol mapper in the realm.
 *
 * These tests make the mapper in realm-pulseplay.json load-bearing: if someone
 * removes it, or a future IdP is wired up without an equivalent, this goes red
 * with a message that names the cause.
 */
'use strict';

const { normalizeIdpUserClaims } = require('../server');
const { resolvePersona, MANAGER, PLANNER } = require('../lib/personaGate');

const reqFor = (payload) => ({
    headers: {},
    user: normalizeIdpUserClaims(payload),
    get: () => null,
});

// What Keycloak emits with no protocol mapper configured.
const keycloakDefault = {
    sub: 'f1e2d3',
    iss: 'http://127.0.0.1:7010/realms/pulseplay',
    aud: 'account',
    preferred_username: 'manager',
    email: 'manager@pulseplay.local',
    realm_access: { roles: ['supply-chain-manager', 'default-roles-pulseplay'] },
};

// What it emits once oidc-usermodel-realm-role-mapper writes claim.name=roles.
const keycloakMapped = {
    ...keycloakDefault,
    aud: 'pulseplay-proxy',
    roles: ['supply-chain-manager', 'default-roles-pulseplay'],
};

describe('IdP claim shape — realm_access vs a top-level roles claim', () => {
    test('Keycloak default shape yields NO roles: the mapper is load-bearing', () => {
        const user = normalizeIdpUserClaims(keycloakDefault);
        expect(user.roles).toBeNull();
    });

    test('and silently degrades a Manager to Planner rather than failing loudly', () => {
        const { persona, source } = resolvePersona(reqFor(keycloakDefault));
        expect(persona).toBe(PLANNER);
        expect(source).toBe('default');
    });

    test('the mapped shape carries the roles the proxy reads', () => {
        const user = normalizeIdpUserClaims(keycloakMapped);
        expect(user.roles).toContain('supply-chain-manager');
    });

    test('and resolves the approver from the verified role, not a header', () => {
        const { persona, source } = resolvePersona(reqFor(keycloakMapped));
        expect(persona).toBe(MANAGER);
        expect(source).toBe('idp-role');
    });
});

describe('the dev realm resolves to the personas it claims to', () => {
    test('supply-chain-planner is the proposer', () => {
        const { persona, source } = resolvePersona(reqFor({ ...keycloakMapped, roles: ['supply-chain-planner'] }));
        expect(persona).toBe(PLANNER);
        expect(source).toBe('idp-role');
    });

    test('supply-chain-manager is the approver', () => {
        expect(resolvePersona(reqFor({ ...keycloakMapped, roles: ['supply-chain-manager'] })).persona).toBe(MANAGER);
    });

    test('"supply-chain-manager" must not match the planner rule first', () => {
        // Both regexes could plausibly claim this string — the manager test runs
        // first by design. Ordering here is a correctness property, not style.
        const { persona } = resolvePersona(reqFor({ ...keycloakMapped, roles: ['supply-chain-manager'] }));
        expect(persona).not.toBe(PLANNER);
    });

    test('the norole user authenticates but gets least privilege', () => {
        const { persona, source } = resolvePersona(reqFor({ ...keycloakMapped, roles: [] }));
        expect(persona).toBe(PLANNER);
        expect(source).toBe('default');
    });
});

describe('identity comes from claims, never from the caller', () => {
    test('a browser-supplied persona header is ignored when a real role exists', () => {
        const req = reqFor(keycloakMapped);
        req.get = (h) => (h.toLowerCase() === 'x-pp-persona' ? PLANNER : null);
        // Verified MANAGER role wins over a claimed PLANNER; more importantly the
        // reverse (claiming MANAGER without the role) can never escalate.
        expect(resolvePersona(req).persona).toBe(MANAGER);
    });

    test('a claimed persona cannot escalate an unroled user', () => {
        const req = reqFor({ ...keycloakMapped, roles: [] });
        req.get = (h) => (h.toLowerCase() === 'x-pp-persona' ? MANAGER : null);
        const prior = process.env.AI_ALLOW_DEMO_PERSONA;
        delete process.env.AI_ALLOW_DEMO_PERSONA;
        try {
            expect(resolvePersona(req).persona).toBe(PLANNER);
        } finally {
            if (prior !== undefined) process.env.AI_ALLOW_DEMO_PERSONA = prior;
        }
    });
});
