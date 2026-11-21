import { ProjectId } from '@arv/kernel';
import { type Brand, Either, Schema } from 'effect';
import { CloseDateInPast, ProjectClosed } from './errors';

export const PROJECT_NAME_MAX_LENGTH = 200;

/** Anything a resource's hours can be booked against (CONTEXT.md «project»). */
export const ProjectType = Schema.Literal('client', 'internal', 'bench', 'training', 'leave');
export type ProjectType = typeof ProjectType.Type;

/**
 * A calendar date, `YYYY-MM-DD` — the form `Today` and Postgres `date` use, so dates compare
 * correctly as strings.
 */
export const CalendarDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
);

/** The display form of a project name: trimmed, non-empty, at most 200 characters. Decoding trims. */
export const ProjectName = Schema.Trim.pipe(
  Schema.compose(
    Schema.String.pipe(
      Schema.nonEmptyString(),
      Schema.maxLength(PROJECT_NAME_MAX_LENGTH),
      Schema.brand('ProjectName'),
    ),
  ),
);
export type ProjectName = typeof ProjectName.Type;

/** What open project names are unique on: `lower(trim(name))` (AC-24). */
export type ProjectNameKey = string & Brand.Brand<'ProjectNameKey'>;

/** `'Atlas'` and `'atlas '` share the key `'atlas'`. */
export const projectNameKey = (name: string): ProjectNameKey =>
  name.trim().toLowerCase() as ProjectNameKey;

export class Project extends Schema.Class<Project>('Project')({
  id: ProjectId,
  name: Schema.String,
  type: ProjectType,
  /** Null while open with no planned end; once set it is never cleared (no reopening). */
  closeDate: Schema.NullOr(CalendarDate),
  createdAt: Schema.DateFromSelf,
}) {}

/** What a new project is created from; the database assigns `id` and `createdAt`. */
export type NewProject = { readonly name: ProjectName; readonly type: ProjectType };

/**
 * Whether `project` can be booked on `date` (`YYYY-MM-DD`): open through the end of its close
 * date, closed from the day after (AC-25, AC-11).
 */
export const isOpenOn = (project: Pick<Project, 'closeDate'>, date: string): boolean =>
  project.closeDate === null || date <= project.closeDate;

/** `isOpenOn` as a check: refuses a project closed on `date` with `ProjectClosed` (AC-11). */
export const ensureOpenOn = (
  project: Pick<Project, 'id' | 'closeDate'>,
  date: string,
): Either.Either<void, ProjectClosed> =>
  project.closeDate === null || date <= project.closeDate
    ? Either.void
    : Either.left(new ProjectClosed({ id: project.id, closeDate: project.closeDate }));

/**
 * Sets `project`'s close date (AC-25). Refused with `ProjectClosed` when the project is already
 * closed on `today` (a closed project is never reopened), and with `CloseDateInPast` when
 * `closeDate` is before `today`, so past plans are never rewritten. There is no way to clear it.
 */
export const closeProject = (
  project: Project,
  closeDate: string,
  today: string,
): Either.Either<Project, CloseDateInPast | ProjectClosed> =>
  Either.flatMap(ensureOpenOn(project, today), () =>
    closeDate < today
      ? Either.left(new CloseDateInPast({ closeDate, today }))
      : Either.right(new Project({ ...project, closeDate })),
  );
