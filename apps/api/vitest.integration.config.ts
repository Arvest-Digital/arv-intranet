import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv_test';

// Integration tests run inside workerd against the real Worker and a real Postgres (arv_test).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { hyperdrives: { HYPERDRIVE: TEST_DATABASE_URL } },
    }),
  ],
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Files share one database; run them one at a time.
    fileParallelism: false,
  },
});
