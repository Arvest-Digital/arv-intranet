import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  // Scan every app module for dependencies at dev-server start. Otherwise a dependency first met
  // on a later page (e.g. a `@base-ui/react/*` subpath) is optimized mid-session and Vite reloads
  // the page, which drops an open dialog or a navigation (seen in e2e on a cold cache in CI).
  optimizeDeps: { entries: ['app/**/*.tsx', '!app/**/*.test.tsx'] },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // Runs apps/api alongside web in dev so the API service binding works locally.
      auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
    }),
    tailwindcss(),
    reactRouter(),
  ],
});
