import { pgSchema } from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `projects.table(...)`. */
export const projects = pgSchema('projects');
