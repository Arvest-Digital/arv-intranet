-- Manual rollback, documentation only (no down migrations in this repo; roll back with a new forward migration).
ALTER TABLE org.employee_records DROP COLUMN IF EXISTS working_day_start_minute;
