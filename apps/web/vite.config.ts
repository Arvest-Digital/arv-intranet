import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // Runs apps/api alongside web in dev so the API service binding works locally.
      auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }],
    }),
    reactRouter(),
  ],
});
