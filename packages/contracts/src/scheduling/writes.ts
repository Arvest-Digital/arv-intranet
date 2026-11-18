import { Schema } from 'effect';
import { IsoDate, strict } from '../org/values';
import { Allocation, Minutes, ProjectRef } from './reads';

// The scheduling write bodies and their error details (openapi.yaml `createAllocation`,
// `updateAllocation`, `removeAllocation`, `bookLeave`; ADR-0010). A save that overbooks answers
// `ConfirmationRequired` until it is re-sent with `confirm: true`.

/** Quarter hours from 15 minutes to a whole week (OpenAPI `AllocationCreate.rateMinutes`, AC-09). */
const RateMinutes = Schema.Int.pipe(Schema.between(15, 10080), Schema.multipleOf(15));

/** `day` / `week`: the periods a work allocation's hours are given in (`full-day` is leave's). */
export const WorkRatePeriod = Schema.Literal('day', 'week');
export type WorkRatePeriod = typeof WorkRatePeriod.Type;

const Version = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1));

/** `createAllocation` body (AC-07, AC-08, AC-09, AC-10). */
export const AllocationCreate = strict(
  Schema.Struct({
    employeeId: Schema.UUID,
    projectId: Schema.UUID,
    startsOn: IsoDate,
    endsOn: IsoDate,
    rateMinutes: RateMinutes,
    ratePeriod: WorkRatePeriod,
    confirm: Schema.optional(Schema.Boolean),
  }),
);
export type AllocationCreate = typeof AllocationCreate.Type;

/** `updateAllocation` body: the terms from today; fields left out keep their value (AC-07b, AC-09b). */
export const AllocationChange = strict(
  Schema.Struct({
    version: Version,
    startsOn: Schema.optional(IsoDate),
    endsOn: Schema.optional(IsoDate),
    rateMinutes: Schema.optional(RateMinutes),
    ratePeriod: Schema.optional(WorkRatePeriod),
    confirm: Schema.optional(Schema.Boolean),
  }),
);
export type AllocationChange = typeof AllocationChange.Type;

/** `removeAllocation` query: the version the allocation was opened at, as a query string (AC-07b). */
export const AllocationRemovalQuery = Schema.Struct({
  version: Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});
export type AllocationRemovalQuery = typeof AllocationRemovalQuery.Type;

/** `removeAllocation` 200 (AC-07a): `ended` yesterday, or `deleted` when it had not started. */
export const AllocationRemoval = Schema.Struct({
  allocationId: Schema.UUID,
  outcome: Schema.Literal('ended', 'deleted'),
  endsOn: Schema.NullOr(IsoDate),
});
export type AllocationRemoval = typeof AllocationRemoval.Type;
export type AllocationRemovalEncoded = typeof AllocationRemoval.Encoded;

/** `bookLeave` body: whole working days on an open leave-type project (AC-15). */
export const LeaveBooking = strict(
  Schema.Struct({
    employeeId: Schema.UUID,
    projectId: Schema.UUID,
    startsOn: IsoDate,
    endsOn: IsoDate,
    confirm: Schema.optional(Schema.Boolean),
  }),
);
export type LeaveBooking = typeof LeaveBooking.Type;

/** The allocation rules a save can break (OpenAPI `RuleViolations.rules`, AC-09, AC-09b, AC-13, AC-15, AC-25). */
export const AllocationRule = Schema.Literal(
  'end_before_start',
  'hours_over_24_per_day',
  'hours_over_24_per_working_day',
  'starts_before_today',
  'ends_before_today',
  'outside_employment_period',
  'past_project_close_date',
  'close_date_before_today',
  'not_a_leave_project',
);
export type AllocationRule = typeof AllocationRule.Type;

/**
 * `details` of `scheduling.invalid_allocation`, `past_not_rewritable`, `outside_employment_period`,
 * `past_project_close_date` and `not_a_leave_project` (OpenAPI `RuleViolations`): every rule the
 * input breaks, and the last date the resource or the project can be allocated (AC-13).
 */
export const AllocationRuleViolations = Schema.Struct({
  rules: Schema.NonEmptyArray(AllocationRule),
  lastBookableDate: Schema.optional(Schema.NullOr(IsoDate)),
});
export type AllocationRuleViolations = typeof AllocationRuleViolations.Type;

/** OpenAPI `WeekOver`: a week the save would overbook, in exact minutes (AC-10). */
export const WeekOver = Schema.Struct({
  weekStart: IsoDate,
  capacityMinutes: Minutes,
  allocatedMinutes: Minutes,
  overMinutes: Minutes,
});
export type WeekOver = typeof WeekOver.Type;

/**
 * OpenAPI `WorkOnLeaveDays` (AC-15): a work allocation with hours on leave days. `allocationId` is
 * null for the work allocation being created, which has no id yet.
 */
export const WorkOnLeaveDays = Schema.Struct({
  allocationId: Schema.NullOr(Schema.UUID),
  project: ProjectRef,
  days: Schema.Array(IsoDate),
});
export type WorkOnLeaveDays = typeof WorkOnLeaveDays.Type;

/** `details` of `scheduling.overbooking_confirmation_required` (OpenAPI `AllocationImpact`, AC-10, AC-15). */
export const AllocationImpact = Schema.Struct({
  overbookedWeeks: Schema.Array(WeekOver),
  workOnLeaveDays: Schema.Array(WorkOnLeaveDays),
});
export type AllocationImpact = typeof AllocationImpact.Type;

/** `details` of `scheduling.version_conflict` (OpenAPI `AllocationConflictDetails`, AC-07b). */
export const AllocationConflictDetails = Schema.Struct({ current: Allocation });
export type AllocationConflictDetails = typeof AllocationConflictDetails.Type;
export type AllocationConflictDetailsEncoded = typeof AllocationConflictDetails.Encoded;
