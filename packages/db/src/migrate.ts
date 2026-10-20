import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDb } from './database';

// Read by path from the @arv/migrations leaf package, which nothing depends on.
// Plain string path (no node:url) so this file also typechecks under Workers types.
const migrationsFolder = decodeURIComponent(
  new URL('../../migrations/drizzle', import.meta.url).pathname,
);

/** Applies all migrations (Node only, used by test setup). */
export async function migrateDatabase(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await migrate(createDb(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
