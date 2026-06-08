'use strict';
// Test fixture — a VALID drop-in connector. Not a real backend; used by
// connectorRegistry.test.js to prove discovery + validation. (Not a *.test.js
// file, so jest's testMatch never runs it as a suite.)
module.exports = {
    id: 'sample-conn',
    displayName: 'Sample (fixture)',
    matchProfile(profile) { return profile && profile.type === 'sample'; },
    async probe() { return { ok: true, detail: 'fixture' }; },
    register(host) { if (host && host.__registered) host.__registered.push('sample-conn'); },
};
