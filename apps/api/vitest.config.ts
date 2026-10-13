import { defineConfig } from 'vitest/config';

// Unit tests: plain Node, no Workers runtime and no database (repos are mocked via Layers).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
