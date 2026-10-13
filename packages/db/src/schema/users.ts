import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  // uuidv7() (Postgres 18+): time-ordered, so new rows append to the end of the PK index.
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
