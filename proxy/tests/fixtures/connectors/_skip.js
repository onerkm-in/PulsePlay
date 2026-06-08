'use strict';
// Test fixture — a VALID connector that MUST be skipped purely because of its
// leading underscore (the `_template.js` convention). Proves the registry skips
// by filename, not by validity.
module.exports = {
    id: 'skip-conn',
    displayName: 'Skipped (fixture)',
    matchProfile() { return false; },
    register() {},
};
