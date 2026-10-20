import { defineConfig } from 'vitest/config';

// Unit tests for host code: plain Node, no Workers runtime and no database.
// Module logic is tested in modules/*; routes and adapters in test/integration.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
