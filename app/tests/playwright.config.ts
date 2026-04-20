import { defineConfig, devices } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    // biome-ignore lint/style/useNamingConvention: playwright config property
    baseURL: baseUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm start:dev',
        url: baseUrl,
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
