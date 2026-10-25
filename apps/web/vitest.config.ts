import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: tests run in jsdom, not in the Workers runtime.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}'],
  },
});
