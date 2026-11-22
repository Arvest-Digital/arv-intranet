-- schedule-daily-view, stage 3 — org.employee_records: working-day start in minutes from midnight.
-- ADR-0002, AC-27, AC-27b. Working-day end = start + daily capacity, computed, never stored.
--
-- STAGED SPEC, not a live migration. At promote time: change modules/org/src/infrastructure/schema.ts
-- (integer().notNull(), NO .default()), run `pnpm db:generate`, then hand-edit the generated ADD COLUMN
-- into the two statements below (drizzle-kit alone emits a bare NOT NULL that fails on a non-empty table).
--
-- DEFAULT 540 is a one-shot backfill, dropped in the same migration, so the table keeps no business
-- default (`.claude/rules/backend/db.md`). 09:00 for a new record is set in the org domain (AC-27).
-- One step instead of nullable -> backfill -> NOT NULL: SAD §2 pre-production override, extended to org
-- (author decision 2026-11-22). Domain invariants (no CHECK): multiple of 15; start + daily capacity <= 1440.
ALTER TABLE org.employee_records ADD COLUMN IF NOT EXISTS working_day_start_minute integer NOT NULL DEFAULT 540;
ALTER TABLE org.employee_records ALTER COLUMN working_day_start_minute DROP DEFAULT;
