import type { ProjectId } from '@arv/kernel';
import { Context, Effect, Layer, Option } from 'effect';
import type { Project, ProjectType } from '../domain/project';
import { ProjectRepository } from './ports';

/**
 * A project as other modules see it. `closeDate` null = no close date; whether it is open on a
 * date is `isOpenOn` (exported next to the facade).
 */
export interface ProjectInfo {
  readonly id: ProjectId;
  readonly name: string;
  readonly type: ProjectType;
  readonly closeDate: string | null;
}

/**
 * Facade for other modules (scheduling). Reads only: no permission check here — the caller's own
 * use case has already decided what the actor may do. Add a method only when another module
 * needs it.
 */
export class ProjectsApi extends Context.Tag('projects/ProjectsApi')<
  ProjectsApi,
  {
    readonly get: (id: ProjectId) => Effect.Effect<Option.Option<ProjectInfo>>;
    /** The projects among `ids`, by name; unknown ids are skipped (board, AC-02). */
    readonly listByIds: (
      ids: ReadonlyArray<ProjectId>,
    ) => Effect.Effect<ReadonlyArray<ProjectInfo>>;
  }
>() {}

const toInfo = ({ id, name, type, closeDate }: Project): ProjectInfo => ({
  id,
  name,
  type,
  closeDate,
});

export const ProjectsApiLive = Layer.effect(
  ProjectsApi,
  Effect.gen(function* () {
    const projects = yield* ProjectRepository;
    return {
      get: (id) => projects.findById(id).pipe(Effect.map(Option.map(toInfo))),
      listByIds: (ids) => projects.listByIds(ids).pipe(Effect.map((rows) => rows.map(toInfo))),
    };
  }),
);
