'use strict';
// Test fixture — duplicate id "dup" (see a.js). Discovery sorts filenames, so
// a.js wins and b.js is skipped with a duplicate-id warning.
module.exports = {
    id: 'dup',
    displayName: 'Dupe B',
    matchProfile() { return false; },
    register() {},
};
