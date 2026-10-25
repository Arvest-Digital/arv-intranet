import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
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
