import { sql } from 'drizzle-orm';
import type { Db } from '../database';

/**
 * Empties every application table, in every schema except Postgres' own and drizzle's migration
 * journal. Tables are discovered at run time, so new modules need no registration here.
 * Call in `beforeEach` of DB-backed tests.
 */
export async function resetDatabase(db: Db) {
  const { rows } = await db.execute<{ name: string }>(sql`
    SELECT format('%I.%I', table_schema, table_name) AS name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')
      AND table_schema NOT LIKE 'pg\_%'
  `);
  if (rows.length === 0) return;
  const tables = rows.map((row) => row.name).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`));
}
