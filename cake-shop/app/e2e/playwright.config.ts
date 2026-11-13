import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3100', channel: 'chrome', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npx tsx start-server.ts', url: 'http://localhost:3100/api/baker/session', reuseExistingServer: false, ignoreHTTPSErrors: true, timeout: 60_000, stdout: 'pipe', stderr: 'pipe', env: { ASSISTANT_PROVIDER: 'fake', PORT: '3100' }, gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 } },
});
