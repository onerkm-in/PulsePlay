'use strict';
// Test fixture — a MALFORMED connector (has id + matchProfile but no
// register()). Must be skipped by validateConnector() with a warning, not
// crash discovery.
module.exports = {
    id: 'bad-conn',
    matchProfile() { return true; },
    // register intentionally missing
};
