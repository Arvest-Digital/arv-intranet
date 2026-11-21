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

/**
 * `scheduling.not_a_resource` (AC-18): the signed-in login is not linked to any employee record,
 * so there is no own schedule; someone with manage-employee-records can link it.
 */
export class NotSetUpAsResource extends Schema.TaggedError<NotSetUpAsResource>()(
  'NotSetUpAsResource',
  { userId: Schema.String },
) {}

// ─── One-time import (US-11) ─────────────────────────────────────────────────────────────────

/**
 * Why a spreadsheet row stops the import (AC-31). The values match the contract's
 * `ImportProblemRowsDetails.reason`.
 */
export const ImportProblemReason = Schema.Literal(
  'empty_hours',
  'end_before_start',
  'similar_name',
  'invalid_allocation',
  'outside_employment_period',
  'invalid_employee_record',
);
export type ImportProblemReason = typeof ImportProblemReason.Type;

/** One problem on one spreadsheet row; a row with several problems appears once per problem. */
export const ImportProblemRow = Schema.Struct({
  /** The spreadsheet row number; the header is row 1. */
  row: Schema.Int,
  reason: ImportProblemReason,
  message: Schema.String,
});
export type ImportProblemRow = typeof ImportProblemRow.Type;

/**
 * `scheduling.import_problem_rows` (AC-31): rows break the manual-entry rules or carry names that
 * look like different spellings of one person or project. Nothing is imported; the user fixes the
 * spreadsheet and tries again. Rows are in row order.
 */
export class ImportProblemRows extends Schema.TaggedError<ImportProblemRows>()(
  'ImportProblemRows',
  { rows: Schema.NonEmptyArray(ImportProblemRow) },
) {}

/**
 * `platform.validation_failed`: the file cannot be read as the planning spreadsheet at all — not
 * CSV, a header column missing, no rows, or too many — so there are no rows to report on.
 */
export class ImportFileInvalid extends Schema.TaggedError<ImportFileInvalid>()(
  'ImportFileInvalid',
  { message: Schema.String },
) {}

/**
 * `scheduling.missing_permission` (AC-33): the import needs edit-allocations,
 * manage-employee-records and manage-projects; `missing` names every one the actor lacks.
 */
export class ImportPermissionsMissing extends Schema.TaggedError<ImportPermissionsMissing>()(
  'ImportPermissionsMissing',
  { missing: Schema.NonEmptyArray(Schema.String) },
) {}

/**
 * `scheduling.import_already_completed` (AC-32): the import is one time; later changes are made on
 * the board. `completedAt` is when the completed run was recorded.
 */
export class ImportAlreadyCompleted extends Schema.TaggedError<ImportAlreadyCompleted>()(
  'ImportAlreadyCompleted',
  { completedAt: Schema.DateFromSelf },
) {}

/** A resource-week the import would overbook; named by the spreadsheet's full name (AC-30). */
export const ImportWeekOver = Schema.Struct({
  fullName: Schema.String,
  weekStart: Schema.String,
  /** Exact minutes, possibly fractional (ADR-0009). */
  overMinutes: Schema.Number,
});

/**
 * `scheduling.import_confirmation_required` (AC-30, ADR-0010): the file is clean; this is the
 * preview the user confirms once. Nothing was imported until the file is uploaded again with
 * `confirm`.
 */
export class ImportConfirmationRequired extends Schema.TaggedError<ImportConfirmationRequired>()(
  'ImportConfirmationRequired',
  {
    employeeRecordsToCreate: Schema.Int,
    projectsToCreate: Schema.Int,
    allocationsToCreate: Schema.Int,
    incompleteRecords: Schema.Int,
    overbookedWeeks: Schema.Array(ImportWeekOver),
  },
) {}
