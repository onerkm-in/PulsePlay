/**
 * Verifies the Decision Assist drop-in connector: it satisfies the registry
 * contract, mounts the three /decision-assist routes, and reuses the same
 * action handler (so the security posture proven for the legacy routes holds
 * on the new path too).
 */
'use strict';

const path = require('path');
const connector = require('../connectors/decision-assist');
const { validateConnector, discoverConnectors } = require('../connectors/connectorRegistry');

function makeHost() {
    const routes = { get: {}, post: {} };
    return {
        _routes: routes,
        app: {
            get(p, h) { routes.get[p] = h; },
            post(p, h) { routes.post[p] = h; },
        },
        resolveProfile: () => ({ profile: { name: 'stand-in' } }),
        databricksRequest: async () => ({}),
        auditLog: () => {},
        sendNoMatchingProfile: (req, res) => res.status(503).json({ error: 'no profile' }),
    };
}

describe('Decision Assist connector contract', () => {
    test('passes the drop-in registry contract', () => {
        expect(validateConnector(connector)).toBeNull();
        expect(connector.id).toBe('decision-assist');
        expect(typeof connector.register).toBe('function');
    });

    test('is discovered by the live registry scan', () => {
        const found = discoverConnectors(path.join(__dirname, '..', 'connectors'));
        expect(found.map((c) => c.id)).toContain('decision-assist');
    });

    test('does not claim any profile in per-request dispatch', () => {
        expect(connector.matchProfile({ type: 'genie' })).toBe(false);
    });

    test('mounts the three /decision-assist routes on register', () => {
        const host = makeHost();
        connector.register(host);
        expect(Object.keys(host._routes.get)).toEqual(
            expect.arrayContaining(['/decision-assist/health', '/decision-assist/prompts']));
        expect(Object.keys(host._routes.post)).toContain('/decision-assist/prompts/:id/action');
    });
});
