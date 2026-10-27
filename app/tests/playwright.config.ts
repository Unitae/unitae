import { defineConfig, devices } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // A stray test.only must fail CI, not silently skip the rest of the suite.
  forbidOnly: Boolean(process.env.CI),
  // One retry absorbs infrastructure noise (one shared database and server), but a flake must not
  // read as a pass: the skip-summary reporter names every test that only passed on retry, and the
  // HTML report keeps the failed attempt's trace. Both folders sit at the repo root, where the CI
  // job uploads them from (paths here resolve against this file's directory).
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['./e2e/helpers/skip-summary-reporter.ts'],
        ['html', { open: 'never', outputFolder: '../../playwright-report' }],
      ]
    : [['list'], ['./e2e/helpers/skip-summary-reporter.ts']],
  outputDir: '../../test-results',
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /app-setup\.spec\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm start:dev',
    url: baseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
