import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  },
  projects: [
    { name: 'game', testMatch: '**/e2e/**/*.spec.ts' },
    { name: 'accessibility', testMatch: '**/a11y/**/*.spec.ts' },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
