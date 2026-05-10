'use strict';
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    clearMocks: true,
    resetModules: true,
    // Some tests exercise real DNS resolution against fake hosts to assert
    // 500-class errors; allow time for OS resolver to fail on slow networks.
    testTimeout: 20000,
};
