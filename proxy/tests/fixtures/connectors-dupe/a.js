'use strict';
// Test fixture — shares id "dup" with b.js to exercise dedup (first wins).
module.exports = {
    id: 'dup',
    displayName: 'Dupe A',
    matchProfile() { return false; },
    register() {},
};
