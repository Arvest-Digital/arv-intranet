import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `scheduling.table(...)`. */
export const scheduling = pgSchema('scheduling');

// The allocation aggregate root (ADR-0008). employee_id / project_id point into the org /
// projects schemas: no cross-schema foreign keys.
export const allocations = scheduling.table(
  'allocations',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    employeeId: uuid().notNull(),
    projectId: uuid().notNull(),
    // Optimistic concurrency (AC-07b) and «last changed by» (AC-07).
    version: integer().notNull(),
    lastChangedBy: uuid().notNull(),
    lastChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_allocations_employee_id').on(t.employeeId),
    index('idx_allocations_project_id').on(t.projectId),
  ],
);

// Effective-dated segments of an allocation; they go with it.
export const allocationSegments = scheduling.table(
  'allocation_segments',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    allocationId: uuid()
      .notNull()
      .references(() => allocations.id, { onDelete: 'cascade' }),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    // Null only when rate_period is full-day (leave takes the full daily capacity, AC-15).
    rateMinutes: integer(),
    // day | week | full-day; validated in the domain.
    ratePeriod: varchar({ length: 8 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_allocation_segments_allocation_id').on(t.allocationId),
    // Window overlap reads: ends_on >= :from AND starts_on <= :to (board, free list, close preview, capacity impact).
    index('idx_allocation_segments_ends_on_starts_on').on(t.endsOn, t.startsOn),
  ],
);

// Allocation change history, kept 12 months then purged (AC-16). allocation_id has no foreign
// key on purpose: the "removed" entry must outlive a deleted allocation (AC-07a, AC-25).
export const allocationHistory = scheduling.table(
  'allocation_history',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    allocationId: uuid().notNull(),
    employeeId: uuid().notNull(),
    projectId: uuid().notNull(),
    // created | imported | changed | trimmed | removed; validated in the domain.
    changeKind: varchar({ length: 16 }).notNull(),
    effectiveFrom: date({ mode: 'string' }),
    // Opaque snapshots of the allocation before / after the change.
    beforeValues: jsonb(),
    afterValues: jsonb(),
    changedBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An allocation's entries of the last 12 months, in order.
    index('idx_allocation_history_allocation_id_created_at').on(t.allocationId, t.createdAt),
    // Monthly purge: DELETE ... WHERE created_at < :cutoff.
    index('idx_allocation_history_created_at').on(t.createdAt),
  ],
);

// The one-time spreadsheet import (US-11). Only completed runs are stored.
export const importRuns = scheduling.table(
  'import_runs',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    importedBy: uuid().notNull(),
    employeeRecordsCreated: integer().notNull(),
    projectsCreated: integer().notNull(),
    allocationsCreated: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // AC-32: at most one completed import, even if two imports commit concurrently.
  () => [uniqueIndex('import_runs_one_time_unique').on(sql`(true)`)],
);
