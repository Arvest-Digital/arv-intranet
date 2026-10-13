import { sql } from 'drizzle-orm';
import type { Db } from '../database';

/** Empties every application table. Call in `beforeEach` of DB-backed tests. */
export async function resetDatabase(db: Db) {
  await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`);
}
