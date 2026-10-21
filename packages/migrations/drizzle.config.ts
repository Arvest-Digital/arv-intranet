import { readdirSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Module tables are loaded by path, so this leaf package depends on no module.
// Folders starting with `_` (e.g. `_template`) are not modules.
const moduleSchemas = readdirSync('../../modules', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => `../../modules/${entry.name}/src/infrastructure/schema.ts`);

// drizzle-kit talks to Postgres directly (Neon direct URL in prod), never through Hyperdrive.
export default defineConfig({
  dialect: 'postgresql',
  schema: moduleSchemas,
  // One Postgres schema per module. Add a new module's schema name here.
  schemaFilter: ['identity'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://arv:arv@localhost:5432/arv',
  },
  casing: 'snake_case',
});
