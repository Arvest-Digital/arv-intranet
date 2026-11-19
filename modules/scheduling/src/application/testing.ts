import { IdentityApi } from '@arv/identity';
import {
  Actor,
  CurrentActor,
  EmployeeId,
  type Permission,
  ProjectId,
  Today,
  UnitOfWork,
  UserId,
} from '@arv/kernel';
import { type Holiday, OrgApi, type ResourceTerms, TeamId, type TeamRef } from '@arv/org';
import { isOpenOn, type ProjectInfo, ProjectsApi, type ProjectType } from '@arv/projects';
import { Effect, Exit, Layer, Option } from 'effect';
import { Allocation, AllocationId, type Segment } from '../domain/allocation';
import { AllocationNotFound, AllocationVersionConflict } from '../domain/errors';
import {
  AllocationHistoryRepository,
  AllocationRepository,
  ImportRunRepository,
  type NewHistoryEntry,
  type StoredAllocation,
  type StoredHistoryEntry,
  type StoredImportRun,
} from './ports';

/**
 * In-memory fakes of every scheduling port plus the `identity`, `org` and `projects` facades and `Today`, for
 * use-case unit tests. One shared store; the fake `UnitOfWork` restores it when the wrapped effect
 * fails (like a Postgres rollback). Ids are deterministic (`…0001`, `…0002`, …).
 *
 *   const fakes = makeSchedulingFakes();
 *   await Effect.runPromise(useCase.pipe(Effect.provide(fakes.layer), Effect.provide(fakes.as(user))));
 */

export const TODAY = '2026-10-28';
const NOW = new Date('2026-10-28T09:00:00Z');

interface Store {
  allocations: Map<AllocationId, StoredAllocation>;
  history: Array<StoredHistoryEntry>;
  resources: Map<EmployeeId, ResourceTerms>;
  projects: Map<ProjectId, ProjectInfo>;
  holidays: Array<Holiday>;
  teams: Map<TeamId, TeamRef>;
  userNames: Map<UserId, string>;
  importRun: StoredImportRun | null;
}

const cloneStore = (store: Store): Store => ({
  allocations: new Map(store.allocations),
  history: [...store.history],
  resources: new Map(store.resources),
  projects: new Map(store.projects),
  holidays: [...store.holidays],
  teams: new Map(store.teams),
  userNames: new Map(store.userNames),
  importRun: store.importRun,
});

export const makeSchedulingFakes = () => {
  let store: Store = {
    allocations: new Map(),
    history: [],
    resources: new Map(),
    projects: new Map(),
    holidays: [],
    teams: new Map(),
    userNames: new Map(),
    importRun: null,
  };
  let sequence = 0;
  const nextUuid = () => `00000000-0000-7000-8000-${String(++sequence).padStart(12, '0')}`;
  const clock = { today: TODAY };
  /** Runs just before a guarded write: simulate another user's save in between (AC-07b). */
  const hooks = {
    beforeWrite: (): void => undefined,
    /** Runs before each allocation `insertMany` stores: throw to simulate a failing row mid-commit. */
    beforeInsertMany: (): void => undefined,
  };

  const store_ = (allocation: Allocation, changedBy: UserId): StoredAllocation => {
    const createdAt = store.allocations.get(allocation.id)?.createdAt ?? NOW;
    const stored = { allocation, lastChangedBy: changedBy, lastChangedAt: NOW, createdAt };
    store.allocations.set(allocation.id, stored);
    return stored;
  };

  const guard = (
    id: AllocationId,
    expectedVersion: number,
  ): Effect.Effect<StoredAllocation, AllocationVersionConflict | AllocationNotFound> => {
    hooks.beforeWrite();
    const current = store.allocations.get(id);
    if (current === undefined) return Effect.fail(new AllocationNotFound({ allocationId: id }));
    if (current.allocation.version !== expectedVersion) {
      return Effect.fail(
        new AllocationVersionConflict({
          allocationId: id,
          expectedVersion,
          currentVersion: current.allocation.version,
        }),
      );
    }
    return Effect.succeed(current);
  };

  const allocations: AllocationRepository['Type'] = {
    findById: (id) => Effect.sync(() => Option.fromNullable(store.allocations.get(id))),
    listInWindow: (window, filter = {}) =>
      Effect.sync(() =>
        [...store.allocations.values()]
          .map(({ allocation, lastChangedBy, lastChangedAt }) => ({
            id: allocation.id,
            employeeId: allocation.employeeId,
            projectId: allocation.projectId,
            version: allocation.version,
            lastChangedBy,
            lastChangedAt,
            segments: allocation.segments.filter(
              (s) => s.endsOn >= window.from && s.startsOn <= window.to,
            ),
          }))
          .filter(
            (a) =>
              a.segments.length > 0 &&
              (filter.employeeIds === undefined || filter.employeeIds.includes(a.employeeId)) &&
              (filter.projectId === undefined || filter.projectId === a.projectId),
          )
          // Same order as the Drizzle adapter: employee, then project, then id.
          .sort(
            (a, b) =>
              a.employeeId.localeCompare(b.employeeId) ||
              a.projectId.localeCompare(b.projectId) ||
              a.id.localeCompare(b.id),
          ),
      ),
    insert: (input, changedBy) =>
      Effect.sync(() =>
        store_(
          new Allocation({
            id: AllocationId.make(nextUuid()),
            employeeId: input.employeeId,
            projectId: input.projectId,
            version: 1,
            segments: input.segments,
          }),
          changedBy,
        ),
      ),
    insertMany: (inputs, changedBy) =>
      Effect.sync(() =>
        inputs.map((input) => {
          hooks.beforeInsertMany();
          return store_(
            new Allocation({
              id: AllocationId.make(nextUuid()),
              employeeId: input.employeeId,
              projectId: input.projectId,
              version: 1,
              segments: input.segments,
            }),
            changedBy,
          ).allocation.id;
        }),
      ),
    update: (id, expectedVersion, segments, changedBy) =>
      Effect.suspend(() => guard(id, expectedVersion)).pipe(
        Effect.map((current) =>
          store_(
            new Allocation({
              ...current.allocation,
              version: current.allocation.version + 1,
              segments,
            }),
            changedBy,
          ),
        ),
      ),
    delete: (id, expectedVersion) =>
      Effect.suspend(() => guard(id, expectedVersion)).pipe(
        Effect.flatMap(() => Effect.sync(() => void store.allocations.delete(id))),
      ),
  };

  const history: AllocationHistoryRepository['Type'] = {
    append: (entry) =>
      Effect.sync(() => {
        store.history.push({ ...entry, id: nextUuid(), createdAt: NOW });
      }),
    appendMany: (entries) =>
      Effect.sync(() => {
        for (const entry of entries)
          store.history.push({ ...entry, id: nextUuid(), createdAt: NOW });
      }),
    listForAllocation: (allocationId, since) =>
      Effect.sync(() =>
        store.history.filter((h) => h.allocationId === allocationId && h.createdAt >= since),
      ),
    deleteBefore: (cutOff) =>
      Effect.sync(() => {
        const before = store.history.length;
        store.history = store.history.filter((h) => h.createdAt >= cutOff);
        return before - store.history.length;
      }),
    oldestCreatedAt: () =>
      Effect.sync(() =>
        store.history.reduce<Date | null>(
          (oldest, h) => (oldest === null || h.createdAt < oldest ? h.createdAt : oldest),
          null,
        ),
      ),
  };

  const importRuns: ImportRunRepository['Type'] = {
    findCompleted: () => Effect.sync(() => Option.fromNullable(store.importRun)),
    insert: (input) =>
      Effect.suspend(() => {
        // The one-time unique index (AC-32): a second run is a defect.
        if (store.importRun !== null)
          return Effect.dieMessage('a completed import run already exists');
        store.importRun = { ...input, id: nextUuid(), createdAt: NOW };
        return Effect.succeed(store.importRun);
      }),
  };

  const org: OrgApi['Type'] = {
    employmentTerms: (employeeIds, window) =>
      Effect.sync(() => ({
        resources: [...store.resources.values()].filter((r) => employeeIds.includes(r.employeeId)),
        holidays: store.holidays.filter(
          (h) => h.holidayDate >= window.from && h.holidayDate <= window.to,
        ),
      })),
    employedIn: (window, teamId) =>
      Effect.sync(() => ({
        resources: [...store.resources.values()]
          .filter(
            (r) =>
              (teamId === undefined || r.teamId === teamId) &&
              (r.employmentStart === null || r.employmentStart <= window.to) &&
              (r.employmentEnd === null || r.employmentEnd >= window.from),
          )
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
        holidays: store.holidays.filter(
          (h) => h.holidayDate >= window.from && h.holidayDate <= window.to,
        ),
      })),
    allResources: (window) =>
      Effect.sync(() => ({
        resources: [...store.resources.values()].sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
        holidays: store.holidays.filter(
          (h) => h.holidayDate >= window.from && h.holidayDate <= window.to,
        ),
      })),
    employeeByLogin: (userId) =>
      Effect.sync(() =>
        Option.fromNullable([...store.resources.values()].find((r) => r.userId === userId)),
      ),
    resourcesInTeam: (teamId) =>
      Effect.sync(() => [...store.resources.values()].filter((r) => r.teamId === teamId)),
    teamsByIds: (teamIds) =>
      Effect.sync(() =>
        [...store.teams.values()]
          .filter((t) => teamIds.includes(t.id))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    // Like org's command: teams matched by name ignoring case and surrounding spaces, the rest
    // created; every record created, in input order.
    importRecords: (input, _importedBy) =>
      Effect.sync(() => {
        const key = (name: string) => name.trim().toLowerCase();
        const teams = new Map<string, { team: TeamRef; created: boolean }>();
        for (const name of [...input.teams, ...input.records.flatMap((r) => r.teamName ?? [])]) {
          if (teams.has(key(name))) continue;
          const existing = [...store.teams.values()].find((t) => key(t.name) === key(name));
          const team = existing ?? { id: TeamId.make(nextUuid()), name };
          if (existing === undefined) store.teams.set(team.id, team);
          teams.set(key(name), { team, created: existing === undefined });
        }
        const records = input.records.map((record) => {
          const resource: ResourceTerms = {
            employeeId: EmployeeId.make(nextUuid()),
            fullName: record.fullName,
            userId: null,
            teamId:
              record.teamName === null ? null : (teams.get(key(record.teamName))?.team.id ?? null),
            contractMinutes: record.contractMinutes,
            workingDays: record.workingDays ?? [1, 2, 3, 4, 5],
            employmentStart: record.employmentStart,
            employmentEnd: record.employmentEnd,
          };
          store.resources.set(resource.employeeId, resource);
          return resource;
        });
        return {
          teams: [...teams.values()].map(({ team, created }) => ({ ...team, created })),
          records,
        };
      }),
  };

  const projects: ProjectsApi['Type'] = {
    get: (id) => Effect.sync(() => Option.fromNullable(store.projects.get(id))),
    listByIds: (ids) =>
      Effect.sync(() => [...store.projects.values()].filter((p) => ids.includes(p.id))),
    listOpenOn: (date) =>
      Effect.sync(() =>
        [...store.projects.values()]
          .filter((p) => isOpenOn(p, date))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    // Like projects' command: an open project with the same name key is reused, else created.
    importProjects: (imported) =>
      Effect.sync(() => {
        const key = (name: string) => name.trim().toLowerCase();
        const results = new Map<string, ProjectInfo & { created: boolean }>();
        for (const { name, type } of imported) {
          if (results.has(key(name))) continue;
          const open = [...store.projects.values()].find(
            (p) => key(p.name) === key(name) && isOpenOn(p, clock.today),
          );
          if (open !== undefined) {
            results.set(key(name), { ...open, created: false });
            continue;
          }
          const project: ProjectInfo = {
            id: ProjectId.make(nextUuid()),
            name,
            type,
            closeDate: null,
          };
          store.projects.set(project.id, project);
          results.set(key(name), { ...project, created: true });
        }
        return [...results.values()];
      }),
  };

  const identity: IdentityApi['Type'] = {
    resolveActor: () => Effect.die(new Error('resolveActor is not faked')),
    userExists: (id) => Effect.sync(() => store.userNames.has(id)),
    userNames: (ids) =>
      Effect.sync(() =>
        [...new Set(ids)].flatMap((id) => {
          const name = store.userNames.get(id);
          return name === undefined ? [] : [{ id, name }];
        }),
      ),
  };

  const unitOfWork: UnitOfWork['Type'] = {
    transactional: (effect) =>
      Effect.suspend(() => {
        const before = cloneStore(store);
        return effect.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isFailure(exit)) store = before;
            }),
          ),
        );
      }),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(AllocationRepository, allocations),
    Layer.succeed(AllocationHistoryRepository, history),
    Layer.succeed(ImportRunRepository, importRuns),
    Layer.succeed(IdentityApi, identity),
    Layer.succeed(OrgApi, org),
    Layer.succeed(ProjectsApi, projects),
    Layer.succeed(Today, { date: Effect.sync(() => clock.today) }),
    Layer.succeed(UnitOfWork, unitOfWork),
  );

  return {
    layer,
    clock,
    hooks,
    /** A signed-in user holding `permissions`. */
    user: (permissions: ReadonlyArray<Permission>, id = UserId.make(nextUuid())) =>
      Actor.User({ id, permissions: new Set(permissions) }),
    /** `CurrentActor` for one call (AC-14: the actor is read per call). */
    as: (actor: Actor) => Layer.succeed(CurrentActor, actor),
    seedResource: (input: Partial<Omit<ResourceTerms, 'employeeId'>> = {}): ResourceTerms => {
      const resource: ResourceTerms = {
        employeeId: EmployeeId.make(nextUuid()),
        fullName: 'Ada Lovelace',
        userId: null,
        teamId: null,
        contractMinutes: 40 * 60,
        workingDays: [1, 2, 3, 4, 5],
        employmentStart: '2025-01-06',
        employmentEnd: null,
        ...input,
      };
      store.resources.set(resource.employeeId, resource);
      return resource;
    },
    seedProject: (
      input: { type?: ProjectType; closeDate?: string | null; name?: string } = {},
    ): ProjectInfo => {
      const project: ProjectInfo = {
        id: ProjectId.make(nextUuid()),
        name: input.name ?? `Project ${sequence}`,
        type: input.type ?? 'client',
        closeDate: input.closeDate ?? null,
      };
      store.projects.set(project.id, project);
      return project;
    },
    seedTeam: (name: string): TeamRef => {
      const team: TeamRef = { id: TeamId.make(nextUuid()), name };
      store.teams.set(team.id, team);
      return team;
    },
    /** The intranet user's display name, as identity answers it. */
    seedUserName: (id: UserId, name: string) => {
      store.userNames.set(id, name);
    },
    seedHoliday: (holidayDate: string, name = 'Holiday') => {
      store.holidays.push({ holidayDate, name });
    },
    seedAllocation: (
      employeeId: EmployeeId,
      projectId: ProjectId,
      segments: readonly [Segment, ...Segment[]],
      changedBy: UserId,
      version = 1,
    ): StoredAllocation =>
      store_(
        new Allocation({
          id: AllocationId.make(nextUuid()),
          employeeId,
          projectId,
          version,
          segments,
        }),
        changedBy,
      ),
    /** A completed import run (AC-32). */
    seedImportRun: (importedBy: UserId, createdAt = NOW): StoredImportRun => {
      store.importRun = {
        id: nextUuid(),
        importedBy,
        employeeRecordsCreated: 1,
        projectsCreated: 1,
        allocationsCreated: 1,
        createdAt,
      };
      return store.importRun;
    },
    importRun: () => store.importRun,
    resources: () => [...store.resources.values()],
    projects: () => [...store.projects.values()],
    /** The stored allocation, read straight from the store. */
    allocation: (id: AllocationId) => store.allocations.get(id),
    allocations: () => [...store.allocations.values()],
    history: () => [...store.history],
    /** A history entry recorded at `createdAt`, e.g. a trim or an import written elsewhere. */
    seedHistory: (entry: NewHistoryEntry, createdAt: Date) => {
      store.history.push({ ...entry, id: nextUuid(), createdAt });
    },
    /** Another user's save of `id` (AC-07b): bumps its version and stamps `changedBy`. */
    saveAsOther: (id: AllocationId, changedBy: UserId) => {
      const current = store.allocations.get(id);
      if (current === undefined) return;
      store_(
        new Allocation({ ...current.allocation, version: current.allocation.version + 1 }),
        changedBy,
      );
    },
    /** Closes a project from the outside, e.g. after the form was opened. */
    setCloseDate: (id: ProjectId, closeDate: string) => {
      const project = store.projects.get(id);
      if (project !== undefined) store.projects.set(id, { ...project, closeDate });
    },
  };
};

export type SchedulingFakes = ReturnType<typeof makeSchedulingFakes>;
