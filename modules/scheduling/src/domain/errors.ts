// Expected business failures, as `Schema.TaggedError`s. Map each one in `http/presenter.ts`.
import { Schema } from 'effect';

/**
 * A rule an allocation's input breaks (AC-09, AC-09b, AC-13, AC-25). The names match the
 * `RuleViolations.rules` values of the api contract where one exists.
 */
export const AllocationRule = Schema.Literal(
  // AC-09
  'end_before_start',
  'hours_not_positive',
  'hours_not_quarter_hour',
  'hours_over_24_per_day',
  'hours_over_24_per_working_day',
  // AC-09b: past plans are not rewritten
  'starts_before_today',
  'ends_before_today',
  // AC-13, AC-21b
  'outside_employment_period',
  // AC-25: open until the close date, not past it
  'past_project_close_date',
  'close_date_before_today',
);
export type AllocationRule = typeof AllocationRule.Type;

/**
 * The input breaks one or more allocation rules; nothing is saved. `lastBookableDate` is the last
 * date the resource (employment end, AC-13) or the project (close date) can still be allocated,
 * set when `outside_employment_period` or `past_project_close_date` is among the rules.
 */
export class AllocationRulesBroken extends Schema.TaggedError<AllocationRulesBroken>()(
  'AllocationRulesBroken',
  {
    rules: Schema.NonEmptyArray(AllocationRule),
    lastBookableDate: Schema.NullOr(Schema.String),
  },
) {}

/** The project's close date has passed: no new, changed or removed allocations (AC-11). */
export class ProjectClosed extends Schema.TaggedError<ProjectClosed>()('ProjectClosed', {
  projectId: Schema.String,
  closeDate: Schema.String,
}) {}

/** The allocation was changed since the user opened it at `expectedVersion` (AC-07b). */
export class AllocationVersionConflict extends Schema.TaggedError<AllocationVersionConflict>()(
  'AllocationVersionConflict',
  {
    allocationId: Schema.String,
    expectedVersion: Schema.Number,
    currentVersion: Schema.Number,
  },
) {}
