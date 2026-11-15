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
