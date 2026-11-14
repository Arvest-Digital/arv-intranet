import { defineConfig } from 'vitest/config';

// Kernel unit tests: plain Node, no database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
