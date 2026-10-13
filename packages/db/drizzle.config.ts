import { defineConfig } from 'drizzle-kit';

// drizzle-kit talks to Postgres directly (Neon direct URL in prod), never through Hyperdrive.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv',
  },
  casing: 'snake_case',
});
