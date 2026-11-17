import { Schema } from 'effect';
import { EmployeeRef, IsoDate } from '../org/values';

/** Every `projects.*` error code the contract advertises (OpenAPI `ApiError.code`). */
export const ProjectsErrorCode = Schema.Literal(
  'projects.missing_permission',
  'projects.duplicate_open_name',
  'projects.close_date_in_past',
  'projects.project_not_found',
  'projects.project_closed',
  'projects.closing_confirmation_required',
);
export type ProjectsErrorCode = typeof ProjectsErrorCode.Type;

/** The same codes as constants, so presenters and web never spell a code by hand. */
export const ProjectsErrorCodes = {
  missingPermission: 'projects.missing_permission',
  duplicateOpenName: 'projects.duplicate_open_name',
  closeDateInPast: 'projects.close_date_in_past',
  projectNotFound: 'projects.project_not_found',
  projectClosed: 'projects.project_closed',
  closingConfirmationRequired: 'projects.closing_confirmation_required',
} as const satisfies Record<string, ProjectsErrorCode>;

/** `details` of `projects.close_date_in_past` (OpenAPI `RuleViolations`, AC-25). */
export const CloseDateRuleViolations = Schema.Struct({
  rules: Schema.NonEmptyArray(Schema.Literal('close_date_before_today')),
});
export type CloseDateRuleViolations = typeof CloseDateRuleViolations.Type;

/** OpenAPI `ClosingAllocation`: an allocation a close would trim or remove, with its current dates. */
export const ClosingAllocation = Schema.Struct({
  allocationId: Schema.UUID,
  employee: EmployeeRef,
  startsOn: IsoDate,
  /** The current last day, before the trim. */
  endsOn: IsoDate,
});
export type ClosingAllocation = typeof ClosingAllocation.Type;

/** `details` of `projects.closing_confirmation_required` (OpenAPI `ProjectClosingImpact`, AC-25). */
export const ProjectClosingImpact = Schema.Struct({
  closeDate: IsoDate,
  endingAtCloseDate: Schema.Array(ClosingAllocation),
  removed: Schema.Array(ClosingAllocation),
});
export type ProjectClosingImpact = typeof ProjectClosingImpact.Type;
