import { defineConfig } from 'vitest/config';

// Domain and application tests: plain Node, no database (ports are faked with Layers).
// Adapters and routes are covered by apps/api/test/integration/skeleton.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
