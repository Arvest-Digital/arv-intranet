import { sql } from 'drizzle-orm';
import { date, index, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `projectsSchema.table(...)`. */
export const projectsSchema = pgSchema('projects');

// Projects of every type, open until the end of their close date.
export const projects = projectsSchema.table(
  'projects',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    name: varchar({ length: 200 }).notNull(),
    // client | internal | bench | training | leave; validated in the domain.
    type: varchar({ length: 16 }).notNull(),
    // Null while open with no planned end.
    closeDate: date({ mode: 'string' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // AC-24: "open project with the same name ignoring case and surrounding spaces".
    // Not UNIQUE: uniqueness holds only among open projects, and "open" depends on today's date.
    index('idx_projects_name_key').on(sql`lower(btrim(${t.name}))`),
  ],
);
