import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  pgSchema,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** This module's Postgres schema. Define its tables with `org.table(...)`. */
export const org = pgSchema('org');

export const teams = org.table(
  'teams',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    name: varchar({ length: 100 }).notNull(),
    // Closes the teams ↔ employee_records cycle; a lead can't be deleted while leading.
    teamLeadId: uuid().references((): AnyPgColumn => employeeRecords.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // AC-19d: team names are compared ignoring letter case and leading/trailing spaces.
    uniqueIndex('teams_name_key_unique').on(sql`lower(btrim(${t.name}))`),
    index('idx_teams_team_lead_id').on(t.teamLeadId),
  ],
);

export const employeeRecords = org.table(
  'employee_records',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    fullName: varchar({ length: 200 }).notNull(),
    // identity.users id; no cross-schema FK.
    userId: uuid(),
    teamId: uuid().references((): AnyPgColumn => teams.id, { onDelete: 'restrict' }),
    // Nullable: an incomplete record (AC-06) is kept but left off the board.
    contractMinutes: integer(),
    // ISO weekdays 1–7; validated in the domain.
    workingDays: smallint().array().notNull(),
    employmentStart: date({ mode: 'string' }),
    employmentEnd: date({ mode: 'string' }),
    // Optimistic concurrency and «last changed by» (AC-19a).
    version: integer().notNull(),
    lastChangedBy: uuid().notNull(),
    lastChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // AC-19b: one login belongs to exactly one employee record; also serves "employee by login".
    uniqueIndex('employee_records_user_id_unique').on(t.userId),
    index('idx_employee_records_team_id').on(t.teamId),
  ],
);

// The single company-wide public-holiday list (US-09).
export const publicHolidays = org.table(
  'public_holidays',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    holidayDate: date({ mode: 'string' }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // One entry per date; also serves "holidays in a period" range reads.
  (t) => [uniqueIndex('public_holidays_holiday_date_unique').on(t.holidayDate)],
);
