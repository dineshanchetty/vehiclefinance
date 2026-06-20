import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the Claimtec FinOps dashboard.
 *
 * Two modes:
 *  - `pnpm e2e`            — runs against `pnpm dev` on http://localhost:5173
 *  - `pnpm e2e:prod`       — runs against the deployed Azure SWA
 *                            (https://orange-bay-0066a4b03.7.azurestaticapps.net)
 *
 * Auth is via Supabase magic link. For CI we use a pre-seeded test
 * account whose session is captured into `e2e/.auth/admin.json` by the
 * `auth.setup.ts` project. Specs that need auth start from that storage state.
 */
const PROD_URL = 'https://orange-bay-0066a4b03.7.azurestaticapps.net'
const LOCAL_URL = 'http://localhost:5173'
const baseURL = process.env.E2E_BASE_URL ?? LOCAL_URL

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.test-results',
  timeout: 30_000,
  expect: { timeout: 7_500 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e/.report', open: 'never' }],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 7_500,
    navigationTimeout: 15_000,
  },

  projects: [
    // 1. Setup project — captures Supabase auth state into .auth/admin.json
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // 2. Authenticated specs — start with the stored session
    {
      name: 'chromium-auth',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
      testIgnore: /unauth\.spec\.ts/,
    },

    // 3. Unauthenticated specs — login + redirect tests
    {
      name: 'chromium-unauth',
      use: devices['Desktop Chrome'],
      testMatch: /unauth\.spec\.ts/,
    },

    // 4. Mobile narrow breakpoint smoke
    {
      name: 'mobile-smoke',
      use: { ...devices['iPhone 13'], storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  // Only spin up the dev server when running locally
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: LOCAL_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
