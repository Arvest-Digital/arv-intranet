import { Schema } from 'effect';

// Expected business failures, as `Schema.TaggedError`s; `http/presenter.ts` maps each one to its
// OpenAPI `ApiError.code` (named next to each class). `org.missing_permission` is the kernel's
// `PermissionDenied`; `org.version_conflict` is `EmployeeRecordVersionConflict` in
// `employee-record.ts`, because it carries the current record.

// --- AC-20: one error per rule an employee record's terms can break -----------------------------

/** Contract hours are not a whole number of minutes above 0 and at most 60 hours a week. */
export class ContractHoursOutOfRange extends Schema.TaggedError<ContractHoursOutOfRange>()(
  'ContractHoursOutOfRange',
  { contractMinutes: Schema.Number },
) {}

/** The working-day set is empty. */
export class NoWorkingDay extends Schema.TaggedError<NoWorkingDay>()('NoWorkingDay', {}) {}

/** The employment period ends before it starts. */
export class EmploymentEndsBeforeStart extends Schema.TaggedError<EmploymentEndsBeforeStart>()(
  'EmploymentEndsBeforeStart',
  { employmentStart: Schema.String, employmentEnd: Schema.String },
) {}

/** One rule of AC-20 an employee record breaks. */
export const EmployeeRecordRuleViolation = Schema.Union(
  ContractHoursOutOfRange,
  NoWorkingDay,
  EmploymentEndsBeforeStart,
);
export type EmployeeRecordRuleViolation = typeof EmployeeRecordRuleViolation.Type;

/** `org.invalid_employee_record`: every AC-20 rule the input breaks, so the user sees them all. */
export class InvalidEmployeeRecord extends Schema.TaggedError<InvalidEmployeeRecord>()(
  'InvalidEmployeeRecord',
  { violations: Schema.NonEmptyArray(EmployeeRecordRuleViolation) },
) {}

// --- Lookups -------------------------------------------------------------------------------------

/** `org.employee_record_not_found` */
export class EmployeeRecordNotFound extends Schema.TaggedError<EmployeeRecordNotFound>()(
  'EmployeeRecordNotFound',
  { id: Schema.String },
) {}

/** `org.user_not_found`: the login to link does not exist in identity. */
export class UserNotFound extends Schema.TaggedError<UserNotFound>()('UserNotFound', {
  id: Schema.String,
}) {}

/** `org.team_not_found` */
export class TeamNotFound extends Schema.TaggedError<TeamNotFound>()('TeamNotFound', {
  id: Schema.String,
}) {}

/** `org.team_lead_not_found`: the chosen team lead is not an employee record. */
export class TeamLeadNotFound extends Schema.TaggedError<TeamLeadNotFound>()('TeamLeadNotFound', {
  id: Schema.String,
}) {}

/** `org.holiday_not_found` */
export class PublicHolidayNotFound extends Schema.TaggedError<PublicHolidayNotFound>()(
  'PublicHolidayNotFound',
  { id: Schema.String },
) {}

// --- Conflicts with current state ----------------------------------------------------------------

/**
 * `org.login_already_linked`: one login belongs to exactly one employee record (AC-19b). Names
 * the record the login is already linked to.
 */
export class LoginAlreadyLinked extends Schema.TaggedError<LoginAlreadyLinked>()(
  'LoginAlreadyLinked',
  { userId: Schema.String, employeeId: Schema.String, fullName: Schema.String },
) {}

/** `org.duplicate_team_name`: another team has the same name key (AC-19d). */
export class DuplicateTeamName extends Schema.TaggedError<DuplicateTeamName>()(
  'DuplicateTeamName',
  { name: Schema.String },
) {}

/** `org.team_has_members`: a team is removed only when empty; names how many remain (AC-19d). */
export class TeamHasMembers extends Schema.TaggedError<TeamHasMembers>()('TeamHasMembers', {
  id: Schema.String,
  memberCount: Schema.Int.pipe(Schema.positive()),
}) {}

/** `org.duplicate_holiday_date`: the single company list has one holiday per date (US-09). */
export class DuplicateHolidayDate extends Schema.TaggedError<DuplicateHolidayDate>()(
  'DuplicateHolidayDate',
  { holidayDate: Schema.String },
) {}

/** A resource's week that a capacity change would overbook, by how many minutes (AC-19c). */
export const OverbookedWeek = Schema.Struct({
  employeeId: Schema.String,
  /** The Monday of the week, `YYYY-MM-DD`. */
  weekStart: Schema.String,
  overMinutes: Schema.Number.pipe(Schema.positive()),
});
export type OverbookedWeek = typeof OverbookedWeek.Type;

/**
 * `org.capacity_confirmation_required`: a change to contract hours, working days or the holiday
 * list would overbook these weeks; nothing was saved until the user confirms (AC-19c, AC-27).
 */
export class CapacityConfirmationRequired extends Schema.TaggedError<CapacityConfirmationRequired>()(
  'CapacityConfirmationRequired',
  { overbookedWeeks: Schema.NonEmptyArray(OverbookedWeek) },
) {}
