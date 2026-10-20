import { sql } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');

export const users = identity.table('users', {
  // uuidv7() (Postgres 18+): time-ordered, so new rows append to the end of the PK index.
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
