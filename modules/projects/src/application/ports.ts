import type { ProjectId } from '@arv/kernel';
import { Context, type Effect, type Option } from 'effect';
import type { NewProject, Project, ProjectNameKey, ProjectType } from '../domain/project';

// Ports have no database error channel: adapters turn DB failures into defects (`Effect.orDie`).
// Every method joins an open `UnitOfWork` through `query()`.

/** Projects of every type (data-model.md, Aggregate Project). */
export class ProjectRepository extends Context.Tag('projects/ProjectRepository')<
  ProjectRepository,
  {
    /**
     * Inserts the project as open (no close date, AC-23). Name uniqueness among open projects is
     * the use case's check (`findOpenByNameKey`); no index enforces it (data-model.md, AC-24).
     */
    readonly create: (input: NewProject) => Effect.Effect<Project>;
    readonly findById: (id: ProjectId) => Effect.Effect<Option.Option<Project>>;
    /** Every project, or only those of `type`, ordered by name key then id. */
    readonly list: (filter?: {
      readonly type?: ProjectType;
    }) => Effect.Effect<ReadonlyArray<Project>>;
    /** The projects among `ids` that exist, ordered by name key then id; unknown ids are skipped. */
    readonly listByIds: (ids: ReadonlyArray<ProjectId>) => Effect.Effect<ReadonlyArray<Project>>;
    /**
     * An open project on `date` (`YYYY-MM-DD`: no close date, or a close date on or after it)
     * whose `lower(btrim(name))` is `key` (AC-24). Projects closed by `date` are ignored.
     */
    readonly findOpenByNameKey: (
      key: ProjectNameKey,
      date: string,
    ) => Effect.Effect<Option.Option<Project>>;
    /**
     * Stores `closeDate` as the project's close date (AC-25); the domain's `closeProject` decides
     * whether it may. `None` when there is no such project.
     */
    readonly setCloseDate: (
      id: ProjectId,
      closeDate: string,
    ) => Effect.Effect<Option.Option<Project>>;
  }
>() {}
