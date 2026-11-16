import { Schema } from 'effect';
import { EmployeeRecord } from './employee-records';
import { EmployeeRef, IsoDate } from './values';

/** Every `org.*` error code the contract advertises (OpenAPI `ApiError.code`). */
export const OrgErrorCode = Schema.Literal(
  'org.missing_permission',
  'org.invalid_employee_record',
  'org.employee_record_not_found',
  'org.user_not_found',
  'org.team_not_found',
  'org.team_lead_not_found',
  'org.login_already_linked',
  'org.version_conflict',
  'org.capacity_confirmation_required',
  'org.duplicate_team_name',
  'org.team_has_members',
  'org.duplicate_holiday_date',
  'org.holiday_not_found',
);
export type OrgErrorCode = typeof OrgErrorCode.Type;

/** The same codes as constants, so presenters and web never spell a code by hand. */
export const OrgErrorCodes = {
  missingPermission: 'org.missing_permission',
  invalidEmployeeRecord: 'org.invalid_employee_record',
  employeeRecordNotFound: 'org.employee_record_not_found',
  userNotFound: 'org.user_not_found',
  teamNotFound: 'org.team_not_found',
  teamLeadNotFound: 'org.team_lead_not_found',
  loginAlreadyLinked: 'org.login_already_linked',
  versionConflict: 'org.version_conflict',
  capacityConfirmationRequired: 'org.capacity_confirmation_required',
  duplicateTeamName: 'org.duplicate_team_name',
  teamHasMembers: 'org.team_has_members',
  duplicateHolidayDate: 'org.duplicate_holiday_date',
  holidayNotFound: 'org.holiday_not_found',
} as const satisfies Record<string, OrgErrorCode>;

/** `details` of `org.invalid_employee_record` (OpenAPI `RuleViolations`, AC-20). */
export const EmployeeRecordRuleViolations = Schema.Struct({
  rules: Schema.NonEmptyArray(Schema.Literal('end_before_start')),
});
export type EmployeeRecordRuleViolations = typeof EmployeeRecordRuleViolations.Type;

/** `details` of `org.login_already_linked` (AC-19b): the record the login belongs to. */
export const LoginAlreadyLinkedDetails = Schema.Struct({ employeeRecord: EmployeeRef });
export type LoginAlreadyLinkedDetails = typeof LoginAlreadyLinkedDetails.Type;

/** `details` of `org.version_conflict`: the current values and who changed them. */
export const EmployeeRecordConflictDetails = Schema.Struct({ current: EmployeeRecord });
export type EmployeeRecordConflictDetails = typeof EmployeeRecordConflictDetails.Type;
export type EmployeeRecordConflictDetailsEncoded = typeof EmployeeRecordConflictDetails.Encoded;

/** OpenAPI `ResourceWeekOver`: a resource's week and how many minutes it would be over. */
export const ResourceWeekOver = Schema.Struct({
  employee: EmployeeRef,
  /** Monday of the ISO week. */
  weekStart: IsoDate,
  overMinutes: Schema.Number.pipe(Schema.nonNegative()),
});

/** `details` of `org.capacity_confirmation_required` (OpenAPI `CapacityImpact`; AC-19c, AC-27). */
export const CapacityImpact = Schema.Struct({ overbookedWeeks: Schema.Array(ResourceWeekOver) });
export type CapacityImpact = typeof CapacityImpact.Type;

/** `details` of `org.team_has_members` (AC-19d). */
export const TeamMembersDetails = Schema.Struct({
  memberCount: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
});
export type TeamMembersDetails = typeof TeamMembersDetails.Type;
