import { Schema } from 'effect';

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()('ProjectNotFound', {
  id: Schema.String,
}) {}

/** An open project already has the same name key, ignoring case and surrounding spaces (AC-24). */
export class ProjectNameTaken extends Schema.TaggedError<ProjectNameTaken>()('ProjectNameTaken', {
  name: Schema.String,
}) {}

/** A close date earlier than today would rewrite past plans (AC-25). */
export class CloseDateInPast extends Schema.TaggedError<CloseDateInPast>()('CloseDateInPast', {
  closeDate: Schema.String,
  today: Schema.String,
}) {}

/**
 * The project's close date has passed: it accepts no new, changed or removed allocations (AC-11)
 * and is never reopened or given a new close date.
 */
export class ProjectClosed extends Schema.TaggedError<ProjectClosed>()('ProjectClosed', {
  id: Schema.String,
  closeDate: Schema.String,
}) {}

/** The resource an allocation belongs to, as the close preview names it (openapi `EmployeeRef`). */
export const ClosingEmployee = Schema.Struct({
  id: Schema.String,
  fullName: Schema.String,
  /** Null = «no team» (AC-06). */
  team: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
});
export type ClosingEmployee = typeof ClosingEmployee.Type;

/** An allocation a close would trim or remove, with its current dates (openapi `ClosingAllocation`). */
export const ClosingAllocation = Schema.Struct({
  allocationId: Schema.String,
  employee: ClosingEmployee,
  startsOn: Schema.String,
  /** The current last day, before the trim. */
  endsOn: Schema.String,
});
export type ClosingAllocation = typeof ClosingAllocation.Type;

/**
 * `projects.closing_confirmation_required`: closing on `closeDate` would end these allocations on
 * the close date and remove those starting after it; nothing was saved until the user confirms
 * (AC-25, ADR-0010).
 */
export class ClosingConfirmationRequired extends Schema.TaggedError<ClosingConfirmationRequired>()(
  'ClosingConfirmationRequired',
  {
    closeDate: Schema.String,
    endingAtCloseDate: Schema.Array(ClosingAllocation),
    removed: Schema.Array(ClosingAllocation),
  },
) {}
