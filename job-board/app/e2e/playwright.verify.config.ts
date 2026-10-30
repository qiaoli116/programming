// Verification run (Stage 4): the same browser tests plus the manual checklist, performed in an open Chrome
// at human speed. Started by `npm run verify` (see scripts/verify.ts), which also writes the HTML test result.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Slow motion makes every test take much longer than a normal run.
  timeout: 240_000,
  expect: { timeout: 10_000 },
  outputDir: 'results/playwright',
  reporter: [['list'], ['json', { outputFile: 'results/playwright.json' }]],
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: 'npx tsx start-server.ts',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
