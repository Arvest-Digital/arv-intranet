import { pgSchema } from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `org.table(...)`. */
export const org = pgSchema('org');
