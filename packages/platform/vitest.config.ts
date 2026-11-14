import { defineConfig } from 'vitest/config';

// Platform unit tests: plain Node, no database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
