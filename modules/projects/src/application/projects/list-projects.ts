import { Permission, Today } from '@arv/kernel';
import { Effect } from 'effect';
import type { ProjectType } from '../../domain/project';
import { MANAGE_PROJECTS } from '../../permissions';
import { requireAnyPermission } from '../access';
import { type PageRequest, pageInOrder } from '../page';
import { ProjectRepository } from '../ports';
import { type ProjectStatus, type ProjectView, statusOn } from './views';

// The scheduling keys are spelled out because projects can't import scheduling (scheduling calls
// projects). A renamed key fails closed. See TODO.md.
const VIEW_WHOLE_BOARD = Permission.make('scheduling:view-whole-board');
const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');
const SEE_LEAVE_REASONS = Permission.make('scheduling:see-leave-reasons');

/** Who may list projects (openapi `listProjects`): project upkeep and the board's project filter. */
export const PROJECT_LIST_READERS = [MANAGE_PROJECTS, VIEW_WHOLE_BOARD, EDIT_ALLOCATIONS] as const;

/**
 * Who is offered leave-type projects (AC-29): those who see leave reasons, those who book leave
 * (they choose its type) and those who maintain projects. Everyone else sees leave only as
 * «away», so the leave projects' names never reach them.
 */
export const LEAVE_PROJECT_READERS = [
  SEE_LEAVE_REASONS,
  EDIT_ALLOCATIONS,
  MANAGE_PROJECTS,
] as const;

export interface ProjectListRequest extends PageRequest {
  /** Open or closed today; omitted → both. */
  readonly status?: ProjectStatus;
  readonly type?: ProjectType;
}

/**
 * A page of projects ordered by name, each with its status today.
 *
 * - Missing all of `PROJECT_LIST_READERS` → `PermissionDenied`, nothing read.
 * - Leave-type projects are left out unless the viewer holds one of `LEAVE_PROJECT_READERS`
 *   (AC-29); asking for `type: leave` without one is an empty page, not a refusal.
 */
export const listProjects = (request: ProjectListRequest = {}) =>
  Effect.gen(function* () {
    const held = yield* requireAnyPermission(PROJECT_LIST_READERS);
    const seesLeave = LEAVE_PROJECT_READERS.some((permission) => held.has(permission));
    const projects = yield* ProjectRepository;
    const today = yield* (yield* Today).date;

    const all = yield* projects.list(request.type === undefined ? {} : { type: request.type });
    const visible = all.filter(
      (project) =>
        (seesLeave || project.type !== 'leave') &&
        (request.status === undefined || statusOn(project, today) === request.status),
    );

    const page = pageInOrder(visible, request);
    return {
      ...page,
      items: page.items.map(
        (project): ProjectView => ({
          project,
          status: statusOn(project, today),
        }),
      ),
    };
  });
