-- Manual rollback, documentation only: the repo has no down migrations (`.claude/rules/backend/db.md`);
-- a real rollback ships as a new forward migration. Restores the rate columns and maps every interval
-- back to a daily rate (hours per day = interval length), leave back to full-day.
ALTER TABLE scheduling.allocation_segments ADD COLUMN IF NOT EXISTS rate_minutes integer;
ALTER TABLE scheduling.allocation_segments ADD COLUMN IF NOT EXISTS rate_period varchar(8);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'scheduling' AND table_name = 'allocation_segments' AND column_name = 'starts_at_minute'
  ) THEN
    UPDATE scheduling.allocation_segments
    SET rate_period = CASE WHEN starts_at_minute IS NULL THEN 'full-day' ELSE 'day' END,
        rate_minutes = ends_at_minute - starts_at_minute
    WHERE rate_period IS NULL;
  END IF;
END
$$;

ALTER TABLE scheduling.allocation_segments ALTER COLUMN rate_period SET NOT NULL;
ALTER TABLE scheduling.allocation_segments DROP COLUMN IF EXISTS ends_at_minute;
ALTER TABLE scheduling.allocation_segments DROP COLUMN IF EXISTS starts_at_minute;
