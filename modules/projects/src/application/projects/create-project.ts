import { requirePermission, Today, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { ProjectNameTaken } from '../../domain/errors';
import { type ProjectName, type ProjectType, projectNameKey } from '../../domain/project';
import { MANAGE_PROJECTS } from '../../permissions';
import { ProjectRepository } from '../ports';

export interface CreateProjectInput {
  readonly name: ProjectName;
  readonly type: ProjectType;
}

/**
 * Flow 11, AC-23: creates an open project, available for new allocations at once.
 *
 * - Missing `projects:manage-projects` → `PermissionDenied`, nothing read (AC-26).
 * - An open project has the same name ignoring case and surrounding spaces → `ProjectNameTaken`
 *   (AC-24). A closed project's name is free again. Concurrent creates of one name are
 *   last-write-wins (data-model.md, sad §8 accepted debt).
 */
export const createProject = (input: CreateProjectInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_PROJECTS);
    const projects = yield* ProjectRepository;
    const today = yield* Today;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const date = yield* today.date;
        const taken = yield* projects.findOpenByNameKey(projectNameKey(input.name), date);
        if (Option.isSome(taken)) return yield* new ProjectNameTaken({ name: input.name });
        return yield* projects.create({ name: input.name, type: input.type });
      }),
    );
  });
