import { defineConfig, devices } from '@playwright/test';

/**
 * E2E base URL:
 * - Local: `PLAYWRIGHT_BASE_URL=http://localhost:4173` after `npm run build && npm run preview`
 * - CI: set in workflow (preview server or staging URL)
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['line']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'critical',
      testIgnore: /[/\\]optional[/\\]|\.optional\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'optional',
      testMatch: /[/\\]optional[/\\]|\.optional\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEB_SERVER
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
