import { defineConfig, devices } from '@playwright/test';
import { TEST_DATABASE_URL } from './db';

const PORT = 5175;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @arv/web dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: TEST_DATABASE_URL,
      // The api builds its Google adapter per request and refuses an empty secret. Google is
      // never called in e2e (sessions are seeded), so placeholders stand in for `.dev.vars`,
      // which CI doesn't have. Passed to the Workers as bindings from the process env.
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
      GOOGLE_CLIENT_ID: 'e2e-client.apps.example.test',
      GOOGLE_CLIENT_SECRET: 'e2e-placeholder-secret',
    },
  },
});
