import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Look for test files in the root directory and subdirectories
  testDir: '.',

  // An explicit glob pattern to match test files. This can help in complex setups.
  testMatch: /.*\.spec\.ts/,

  fullyParallel: true,
  retries: process.env.CI ? 2 : 0, // No retries on local, 2 on CI
  reporter: 'html',

  // Shared settings for all the projects below.
  use: {
    baseURL: 'https://localhost:8080', // Default port for `pbiviz start`
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true, // Required for local self-signed certs used by Power BI visual tools
  },

  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server before starting the tests.
  webServer: {
    command: 'npm run start',
    url: 'https://localhost:8080/assets/status',
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 120 * 1000, // Give pbiviz start time to initialize
  },
});