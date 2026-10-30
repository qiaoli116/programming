import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './tests',
  // The tests share one database, so they run one at a time and reseed before each test.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    // Use the Chrome that is already installed (the test plan scopes testing to Chrome).
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx start-server.ts',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
