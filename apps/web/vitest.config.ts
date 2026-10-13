import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: tests run in jsdom, not in the Workers runtime.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}'],
  },
});
