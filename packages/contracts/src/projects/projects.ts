import { Schema } from 'effect';
import { IsoDate } from '../org/values';
import { pageQueryWith } from '../shared/page';
import { strict } from '../shared/strict';

/** Anything a resource's hours can be booked against (OpenAPI `ProjectType`). */
export const ProjectType = Schema.Literal('client', 'internal', 'bench', 'training', 'leave');
export type ProjectType = typeof ProjectType.Type;

/** Computed: closed after the end of `closeDate` (OpenAPI `ProjectStatus`, AC-25). */
export const ProjectStatus = Schema.Literal('open', 'closed');
export type ProjectStatus = typeof ProjectStatus.Type;

/** A project (OpenAPI `Project`); `closeDate: null` = no close date. */
export const Project = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  type: ProjectType,
  closeDate: Schema.NullOr(IsoDate),
  status: ProjectStatus,
  createdAt: Schema.Date,
});
export type Project = typeof Project.Type;
export type ProjectEncoded = typeof Project.Encoded;

/** `listProjects` 200: a cursor page, ordered by name. */
export const ProjectPage = Schema.Struct({
  items: Schema.Array(Project),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type ProjectPage = typeof ProjectPage.Type;
export type ProjectPageEncoded = typeof ProjectPage.Encoded;

/** `listProjects` query: open or closed today (omitted → both), a type, and the page. */
export const ProjectListQuery = pageQueryWith({
  status: Schema.optional(ProjectStatus),
  type: Schema.optional(ProjectType),
});
export type ProjectListQuery = typeof ProjectListQuery.Type;

/**
 * A project name as a request sends it: surrounding spaces are trimmed (open names are compared
 * ignoring them and letter case, AC-24), then 1 to 200 characters remain.
 */
export const ProjectNameInput = Schema.Trim.pipe(
  Schema.minLength(1, { message: () => 'Enter a project name' }),
  Schema.maxLength(200),
);

/** `createProject` body (AC-23). */
export const ProjectCreate = strict(Schema.Struct({ name: ProjectNameInput, type: ProjectType }));
export type ProjectCreate = typeof ProjectCreate.Type;

/** `closeProject` body (AC-25): the last bookable day; `confirm` after seeing the impact. */
export const ProjectClose = strict(
  Schema.Struct({
    closeDate: IsoDate,
    confirm: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  }),
);
export type ProjectClose = typeof ProjectClose.Type;

/** `projectId` path parameter. */
export const ProjectIdPath = Schema.Struct({ projectId: Schema.UUID });
