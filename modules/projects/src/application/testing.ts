import { ProjectId, Today, UnitOfWork, type UserId } from '@arv/kernel';
import { Effect, Exit, Layer, Option } from 'effect';
import { Project, type ProjectType, projectNameKey } from '../domain/project';
import { type ClosingImpact, ProjectClosingHook, ProjectRepository } from './ports';

/**
 * In-memory fakes of every projects port plus `Today`, for use-case unit tests. The fake
 * `UnitOfWork` restores the store when the wrapped effect fails (like a Postgres rollback) and
 * tracks whether a transaction is open, so tests can assert the hook ran inside it.
 *
 *   const fakes = makeProjectsFakes();
 *   await Effect.runPromise(useCase.pipe(Effect.provide(fakes.layer)));
 */

export const TODAY = '2026-11-16';
const NOW = new Date('2026-11-16T09:00:00Z');

const byName = (a: Project, b: Project) =>
  projectNameKey(a.name).localeCompare(projectNameKey(b.name)) || a.id.localeCompare(b.id);

export const makeProjectsFakes = () => {
  let store = new Map<ProjectId, Project>();
  let sequence = 0;
  let openTransactions = 0;
  const nextId = () =>
    ProjectId.make(`00000000-0000-7000-8000-${String(++sequence).padStart(12, '0')}`);

  /** What the fake closing hook answers (set per test) and what it was asked. */
  const hook = {
    impact: { endingAtCloseDate: [], removed: [] } as ClosingImpact,
    previews: [] as Array<{ projectId: ProjectId; closeDate: string }>,
    applied: [] as Array<{
      projectId: ProjectId;
      closeDate: string;
      closedBy: UserId;
      inTransaction: boolean;
      /** The project's close date as `apply` saw it: already recorded in the same transaction. */
      storedCloseDate: string | null | undefined;
    }>,
    /** Make `apply` die, to check the close date rolls back with it. */
    failApply: false,
  };

  const projects: ProjectRepository['Type'] = {
    create: (input) =>
      Effect.sync(() => {
        const project = new Project({ ...input, id: nextId(), closeDate: null, createdAt: NOW });
        store.set(project.id, project);
        return project;
      }),
    findById: (id) => Effect.sync(() => Option.fromNullable(store.get(id))),
    list: (filter = {}) =>
      Effect.sync(() =>
        [...store.values()]
          .filter((p) => filter.type === undefined || p.type === filter.type)
          .sort(byName),
      ),
    listByIds: (ids) =>
      Effect.sync(() => [...store.values()].filter((p) => ids.includes(p.id)).sort(byName)),
    findOpenByNameKey: (key, date) =>
      Effect.sync(() =>
        Option.fromNullable(
          [...store.values()].find(
            (p) => projectNameKey(p.name) === key && (p.closeDate === null || p.closeDate >= date),
          ),
        ),
      ),
    setCloseDate: (id, closeDate) =>
      Effect.sync(() => {
        const project = store.get(id);
        if (project === undefined) return Option.none();
        const closed = new Project({ ...project, closeDate });
        store.set(id, closed);
        return Option.some(closed);
      }),
  };

  const closingHook: ProjectClosingHook['Type'] = {
    preview: (projectId, closeDate) =>
      Effect.sync(() => {
        hook.previews.push({ projectId, closeDate });
        return hook.impact;
      }),
    apply: (projectId, closeDate, closedBy) =>
      Effect.suspend(() => {
        hook.applied.push({
          projectId,
          closeDate,
          closedBy,
          inTransaction: openTransactions > 0,
          storedCloseDate: store.get(projectId)?.closeDate,
        });
        return hook.failApply ? Effect.dieMessage('apply failed') : Effect.void;
      }),
  };

  const unitOfWork: UnitOfWork['Type'] = {
    transactional: (effect) =>
      Effect.suspend(() => {
        const before = new Map(store);
        openTransactions += 1;
        return effect.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              openTransactions -= 1;
              if (Exit.isFailure(exit)) store = before;
            }),
          ),
        );
      }),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, projects),
    Layer.succeed(ProjectClosingHook, closingHook),
    Layer.succeed(UnitOfWork, unitOfWork),
    Layer.succeed(Today, { date: Effect.succeed(TODAY) }),
  );

  return {
    layer,
    projects,
    hook,
    seedProject: (name: string, type: ProjectType = 'client', closeDate: string | null = null) => {
      const project = new Project({ id: nextId(), name, type, closeDate, createdAt: NOW });
      store.set(project.id, project);
      return project;
    },
    /** The current project, read straight from the store. */
    project: (id: ProjectId) => store.get(id),
    /** Every project, as plain data, so «nothing changed» is one deep comparison. */
    snapshot: () => [...store.values()].map((p) => ({ ...p })),
  };
};

export type ProjectsFakes = ReturnType<typeof makeProjectsFakes>;
