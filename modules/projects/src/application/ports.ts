import type { ProjectId, UserId } from '@arv/kernel';
import { Context, Effect, Layer, type Option } from 'effect';
import type { ClosingAllocation } from '../domain/errors';
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

/** What closing a project on a date does to its allocations (AC-25). */
export interface ClosingImpact {
  /** Allocations running past the close date: they will end on it. */
  readonly endingAtCloseDate: ReadonlyArray<ClosingAllocation>;
  /** Allocations starting after the close date: they will be removed. */
  readonly removed: ReadonlyArray<ClosingAllocation>;
}

/**
 * Trims a closing project's allocations (AC-25). Owned by projects, implemented by `scheduling`
 * and wired by the host (ADR-0007): projects can't call scheduling directly without a cycle.
 * Exported from the facade so scheduling can provide it.
 */
export class ProjectClosingHook extends Context.Tag('projects/ProjectClosingHook')<
  ProjectClosingHook,
  {
    /** Read-only: what closing `projectId` on `closeDate` would trim and remove. */
    readonly preview: (projectId: ProjectId, closeDate: string) => Effect.Effect<ClosingImpact>;
    /**
     * Ends the project's allocations on `closeDate`, removes those starting after it and records
     * the trims and removals in their history attributed to `closedBy` (AC-16). Called inside the
     * close's `UnitOfWork`, so it commits or rolls back with the close date.
     */
    readonly apply: (
      projectId: ProjectId,
      closeDate: string,
      closedBy: UserId,
    ) => Effect.Effect<void>;
  }
>() {}

/**
 * The default `ProjectClosingHook`: nothing to trim, so projects composes and tests without
 * scheduling. The host replaces it with scheduling's; left in place, closes skip the trim.
 */
export const ProjectClosingHookNoop = Layer.succeed(ProjectClosingHook, {
  preview: () => Effect.succeed({ endingAtCloseDate: [], removed: [] }),
  apply: () => Effect.void,
});
