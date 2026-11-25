-- schedule-daily-view, stage 3 — scheduling.allocation_segments: daily time interval replaces the rate.
-- ADR-0002 (minutes from midnight, no stored rate), ADR-0003 (no conversion: pre-production only),
-- SAD §2 override (one-step, non-additive), SAD §7 release sequence (steps 0–1 run BEFORE this file).
--
-- STAGED SPEC, not a live migration. At promote time: change modules/scheduling/src/infrastructure/schema.ts,
-- run `pnpm db:generate`, diff the generated SQL against this file, and hand-add the guard block below
-- to the generated file before it is applied anywhere.
--
-- Domain invariants (no CHECK, `.claude/rules/backend/db.md`): both minutes NULL ⇔ leave segment;
-- otherwise 0 <= starts_at_minute < ends_at_minute <= 1440, both multiples of 15.

-- Guard (ADR-0003 precondition, SAD §11 High risk): refuse to drop the rate while any work segment exists,
-- so a skipped release step 1 cannot silently lose a plan. Runs only while rate_period still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'scheduling' AND table_name = 'allocation_segments' AND column_name = 'rate_period'
  ) THEN
    IF EXISTS (SELECT 1 FROM scheduling.allocation_segments WHERE rate_period <> 'full-day') THEN
      RAISE EXCEPTION 'stage 3: work allocation segments still exist; run SAD §7 release steps 0-1 first (ADR-0003)';
    END IF;
  END IF;
END
$$;

ALTER TABLE scheduling.allocation_segments ADD COLUMN IF NOT EXISTS starts_at_minute integer;
ALTER TABLE scheduling.allocation_segments ADD COLUMN IF NOT EXISTS ends_at_minute integer;
ALTER TABLE scheduling.allocation_segments DROP COLUMN IF EXISTS rate_minutes;
ALTER TABLE scheduling.allocation_segments DROP COLUMN IF EXISTS rate_period;
