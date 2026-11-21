import { Today } from '@arv/kernel';
import { Effect } from 'effect';
import { isOpenOn, type Project } from '../../domain/project';

/** Open or closed today (AC-25): closed after the end of the close date. */
export type ProjectStatus = 'open' | 'closed';

/** A project with its status today, as the endpoints answer it (openapi `Project`). */
export interface ProjectView {
  readonly project: Project;
  readonly status: ProjectStatus;
}

export const statusOn = (project: Project, date: string): ProjectStatus =>
  isOpenOn(project, date) ? 'open' : 'closed';

/** `project` with its status today. */
export const describeProject = (project: Project) =>
  Effect.flatMap(Today, (today) => today.date).pipe(
    Effect.map((date): ProjectView => ({ project, status: statusOn(project, date) })),
  );
