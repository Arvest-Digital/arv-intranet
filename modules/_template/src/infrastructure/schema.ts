import { pgSchema } from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `skeleton.table(...)`. */
export const skeleton = pgSchema('skeleton');
