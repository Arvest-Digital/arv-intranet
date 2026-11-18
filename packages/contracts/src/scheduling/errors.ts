import { Schema } from 'effect';

/** Every `scheduling.*` error code the contract advertises (OpenAPI `ApiError.code`). */
export const SchedulingErrorCode = Schema.Literal(
  'scheduling.missing_permission',
  'scheduling.invalid_allocation',
  'scheduling.outside_employment_period',
  'scheduling.past_not_rewritable',
  'scheduling.past_project_close_date',
  'scheduling.not_a_leave_project',
  'scheduling.window_out_of_range',
  'scheduling.project_closed',
  'scheduling.overbooking_confirmation_required',
  'scheduling.version_conflict',
  'scheduling.allocation_not_found',
  'scheduling.employee_record_not_found',
  'scheduling.project_not_found',
  'scheduling.not_a_resource',
  'scheduling.import_already_completed',
  'scheduling.import_problem_rows',
  'scheduling.import_confirmation_required',
);
export type SchedulingErrorCode = typeof SchedulingErrorCode.Type;

/** The same codes as constants, so presenters and web never spell a code by hand. */
export const SchedulingErrorCodes = {
  missingPermission: 'scheduling.missing_permission',
  invalidAllocation: 'scheduling.invalid_allocation',
  outsideEmploymentPeriod: 'scheduling.outside_employment_period',
  pastNotRewritable: 'scheduling.past_not_rewritable',
  pastProjectCloseDate: 'scheduling.past_project_close_date',
  notALeaveProject: 'scheduling.not_a_leave_project',
  windowOutOfRange: 'scheduling.window_out_of_range',
  projectClosed: 'scheduling.project_closed',
  overbookingConfirmationRequired: 'scheduling.overbooking_confirmation_required',
  versionConflict: 'scheduling.version_conflict',
  allocationNotFound: 'scheduling.allocation_not_found',
  employeeRecordNotFound: 'scheduling.employee_record_not_found',
  projectNotFound: 'scheduling.project_not_found',
  notAResource: 'scheduling.not_a_resource',
  importAlreadyCompleted: 'scheduling.import_already_completed',
  importProblemRows: 'scheduling.import_problem_rows',
  importConfirmationRequired: 'scheduling.import_confirmation_required',
} as const satisfies Record<string, SchedulingErrorCode>;

/** `details` of `scheduling.window_out_of_range` (OpenAPI `RuleViolations`, AC-01). */
export const WindowRuleViolations = Schema.Struct({
  rules: Schema.NonEmptyArray(Schema.Literal('window_out_of_range')),
});
export type WindowRuleViolations = typeof WindowRuleViolations.Type;

/** `details` of `platform.validation_failed` (OpenAPI `ValidationIssues`), e.g. the free list (AC-05). */
export const ValidationIssues = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String })),
});
export type ValidationIssues = typeof ValidationIssues.Type;
