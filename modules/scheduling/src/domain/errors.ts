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
  // AC-15: leave is booked only on a leave-type project
  'not_a_leave_project',
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

/** No allocation with this id: it never existed or was removed meanwhile (AC-07a). */
export class AllocationNotFound extends Schema.TaggedError<AllocationNotFound>()(
  'AllocationNotFound',
  { allocationId: Schema.String },
) {}

/** A week the save would overbook, in exact ticks (AC-10: «8 hours over in that week»). */
export const OverbookedWeek = Schema.Struct({
  /** The Monday of the week, `YYYY-MM-DD`. */
  weekStart: Schema.String,
  capacity: Schema.Number,
  allocated: Schema.Number,
  over: Schema.Number,
});
export type OverbookedWeek = typeof OverbookedWeek.Type;

/**
 * A work allocation with hours on leave days (AC-15). `allocationId` is null for the allocation
 * being created, which has no id yet.
 */
export const WorkOnLeaveDays = Schema.Struct({
  allocationId: Schema.NullOr(Schema.String),
  projectId: Schema.String,
  days: Schema.NonEmptyArray(Schema.String),
});
export type WorkOnLeaveDays = typeof WorkOnLeaveDays.Type;

/**
 * `scheduling.overbooking_confirmation_required`: the save would overbook these weeks or put work
 * on leave days; nothing was saved until the request is re-sent with `confirm` (AC-10, AC-15,
 * ADR-0010). At least one of the two lists is non-empty.
 */
export class OverbookingConfirmationRequired extends Schema.TaggedError<OverbookingConfirmationRequired>()(
  'OverbookingConfirmationRequired',
  {
    overbookedWeeks: Schema.Array(OverbookedWeek),
    workOnLeaveDays: Schema.Array(WorkOnLeaveDays),
  },
) {}

/** No employee record with this id: the resource to allocate is unknown. */
export class EmployeeRecordNotFound extends Schema.TaggedError<EmployeeRecordNotFound>()(
  'EmployeeRecordNotFound',
  { employeeId: Schema.String },
) {}

/** No project with this id. */
export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()('ProjectNotFound', {
  projectId: Schema.String,
}) {}

/**
 * `scheduling.window_out_of_range` (AC-01, ADR-0002): the board shows 1 to 12 week columns,
 * starting no earlier than `earliestFrom` (12 months back) and ending no later than `latestTo`
 * (52 weeks ahead of the current week).
 */
export class BoardWindowOutOfRange extends Schema.TaggedError<BoardWindowOutOfRange>()(
  'BoardWindowOutOfRange',
  {
    earliestFrom: Schema.String,
    latestTo: Schema.String,
    maxWeeks: Schema.Number,
  },
) {}

/** Which free-list input is out of range (AC-05). */
export const FreeListQueryIssue = Schema.Struct({
  path: Schema.Literal('weeks', 'minFreeHours'),
  message: Schema.String,
});
export type FreeListQueryIssue = typeof FreeListQueryIssue.Type;

/**
 * The free-list query asks for a number of weeks outside 1 to 12, or a minimum of free hours
 * that is negative or not a number; no results (AC-05).
 */
export class FreeListQueryInvalid extends Schema.TaggedError<FreeListQueryInvalid>()(
  'FreeListQueryInvalid',
  {
    message: Schema.String,
    issues: Schema.NonEmptyArray(FreeListQueryIssue),
  },
) {}
