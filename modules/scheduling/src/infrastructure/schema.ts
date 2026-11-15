import { pgSchema } from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `scheduling.table(...)`. */
export const scheduling = pgSchema('scheduling');
