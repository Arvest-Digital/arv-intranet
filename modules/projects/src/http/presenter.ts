import {
  type CloseDateRuleViolations,
  ProjectClosingImpact,
  Project as ProjectDto,
  ProjectPage,
  ProjectsErrorCodes,
} from '@arv/contracts/projects';
import { ConfirmationRequired, Conflict, Invalid, NotFound } from '@arv/contracts/shared';
import { Effect, Schema } from 'effect';
import type { Page } from '../application/page';
import type { ProjectView } from '../application/projects';
import type {
  CloseDateInPast,
  ClosingConfirmationRequired,
  ProjectClosed,
  ProjectNameTaken,
  ProjectNotFound,
} from '../domain/errors';

// Domain → contract DTO (`Schema.encodeSync`) and domain error → shared contract error. Messages
// are the contract's (openapi.yaml `components.examples`).

const toProjectDto = ({ project, status }: ProjectView) => ({
  id: project.id,
  name: project.name,
  type: project.type,
  closeDate: project.closeDate,
  status,
  createdAt: project.createdAt,
});

/** OpenAPI `Project`. */
export const presentProject = (view: ProjectView) =>
  Schema.encodeSync(ProjectDto)(toProjectDto(view));

/** OpenAPI `ProjectPage`. */
export const presentProjectPage = (page: Page<ProjectView>) =>
  Schema.encodeSync(ProjectPage)({ ...page, items: page.items.map(toProjectDto) });

/** Every projects failure a route can produce; each maps without looking anything up. */
export type ProjectsError =
  | ProjectNotFound
  | ProjectNameTaken
  | CloseDateInPast
  | ProjectClosed
  | ClosingConfirmationRequired;

const PROJECTS_ERROR_TAGS: ReadonlySet<string> = new Set<ProjectsError['_tag']>([
  'ProjectNotFound',
  'ProjectNameTaken',
  'CloseDateInPast',
  'ProjectClosed',
  'ClosingConfirmationRequired',
]);

export const isProjectsError = (error: { readonly _tag: string }): error is ProjectsError =>
  PROJECTS_ERROR_TAGS.has(error._tag);

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** AC-25: the allocations that will end on the close date and those that will be removed. */
const closingConfirmationRequired = (error: ClosingConfirmationRequired) => {
  const ending = error.endingAtCloseDate.length;
  const removed = error.removed.length;
  return new ConfirmationRequired({
    message: `${plural(ending, 'allocation')} will end on ${error.closeDate} and ${removed} will be removed`,
    code: ProjectsErrorCodes.closingConfirmationRequired,
    details: Schema.encodeSync(ProjectClosingImpact)({
      closeDate: error.closeDate,
      endingAtCloseDate: error.endingAtCloseDate,
      removed: error.removed,
    }),
  });
};

export const toProjectsContractError = (error: ProjectsError) => {
  switch (error._tag) {
    case 'ProjectNotFound':
      return new NotFound({
        resource: 'Project',
        id: error.id,
        code: ProjectsErrorCodes.projectNotFound,
      });
    case 'ProjectNameTaken':
      return new Conflict({
        message: `An open project named «${error.name}» already exists`,
        code: ProjectsErrorCodes.duplicateOpenName,
      });
    case 'CloseDateInPast': {
      const details: CloseDateRuleViolations = { rules: ['close_date_before_today'] };
      return new Invalid({
        message: 'The close date cannot be earlier than today; past plans are never rewritten',
        code: ProjectsErrorCodes.closeDateInPast,
        details,
      });
    }
    case 'ProjectClosed':
      return new Conflict({
        message: 'The project is closed and cannot be reopened',
        code: ProjectsErrorCodes.projectClosed,
      });
    case 'ClosingConfirmationRequired':
      return closingConfirmationRequired(error);
  }
};

/**
 * Maps projects' domain failures to contract errors and lets every other failure through (the
 * kernel's access errors, which `runEffect` maps once).
 */
export const mapProjectsErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.mapError(effect, (error) =>
    isProjectsError(error) ? toProjectsContractError(error) : (error as Exclude<E, ProjectsError>),
  );
