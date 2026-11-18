import { type ProjectId, Today } from '@arv/kernel';
import { Context, Effect, Layer, Option } from 'effect';
import type { Project, ProjectType } from '../domain/project';
import { type ImportedProject, importProjects } from './import';
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

/** A project the import named: an open one it matched, or one it created (flow 13). */
export interface ImportedProjectInfo extends ProjectInfo {
  readonly created: boolean;
}

/**
 * Facade for other modules (scheduling). No permission check here — the caller's own use case has
 * already decided what the actor may do. Reads, plus the import command, which joins the caller's
 * `UnitOfWork` (ADR-0006). Add a method only when another module needs it.
 */
export class ProjectsApi extends Context.Tag('projects/ProjectsApi')<
  ProjectsApi,
  {
    readonly get: (id: ProjectId) => Effect.Effect<Option.Option<ProjectInfo>>;
    /** The projects among `ids`, by name; unknown ids are skipped (board, AC-02). */
    readonly listByIds: (
      ids: ReadonlyArray<ProjectId>,
    ) => Effect.Effect<ReadonlyArray<ProjectInfo>>;
    /**
     * Import command (flow 13, AC-30): creates the projects as open, reusing a project open today
     * with the same name (AC-24) as it is. Opens no transaction: call it inside the import's
     * `UnitOfWork`, so it commits or rolls back with the rest. One entry per distinct name.
     */
    readonly importProjects: (
      projects: ReadonlyArray<ImportedProject>,
    ) => Effect.Effect<ReadonlyArray<ImportedProjectInfo>>;
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
    const today = yield* Today;
    return {
      get: (id) => projects.findById(id).pipe(Effect.map(Option.map(toInfo))),
      listByIds: (ids) => projects.listByIds(ids).pipe(Effect.map((rows) => rows.map(toInfo))),
      importProjects: (imported) =>
        today.date.pipe(
          Effect.flatMap((date) => importProjects(imported, date)),
          Effect.provideService(ProjectRepository, projects),
          Effect.map((results) =>
            results.map(({ project, created }) => ({ ...toInfo(project), created })),
          ),
        ),
    };
  }),
);
