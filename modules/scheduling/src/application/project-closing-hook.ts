import { type ProjectId, Today, type UserId } from '@arv/kernel';
import { OrgApi } from '@arv/org';
import { type ClosingAllocation, type ClosingImpact, ProjectClosingHook } from '@arv/projects';
import { Effect, Layer, Option } from 'effect';
import {
  type Allocation,
  type AllocationUpdate,
  addDays,
  type IsoDate,
  type Segment,
  trimAt,
} from '../domain/allocation';
import { AllocationHistoryRepository, AllocationRepository } from './ports';

/** No allocation runs past this date: the open end of «after the close date». */
const END_OF_TIME: IsoDate = '9999-12-31';

/** An allocation of the closing project and what the close does to it. */
interface Trim {
  readonly allocation: Allocation;
  readonly update: AllocationUpdate;
}

/**
 * The project's allocations running past `closeDate`, each with what `trimAt` makes of it: ended
 * on the close date (`trimmed`) or removed when it starts after it (`removed`). By resource, then
 * id. `trimAt` refuses a close date before today; projects checks that first, so it is a defect.
 */
const trimsFor = (projectId: ProjectId, closeDate: IsoDate) =>
  Effect.gen(function* () {
    const today = yield* (yield* Today).date;
    const allocations = yield* AllocationRepository;
    const after = yield* allocations.listInWindow(
      { from: addDays(closeDate, 1), to: END_OF_TIME },
      { projectId },
    );
    const trims: Trim[] = [];
    for (const { id } of after) {
      // The window read holds only the segments past the close date; the trim needs them all.
      const stored = yield* allocations.findById(id);
      if (Option.isNone(stored)) continue;
      const { allocation } = stored.value;
      const update = yield* Effect.orDie(trimAt(allocation, closeDate, today));
      if (Option.isSome(update)) trims.push({ allocation, update: update.value });
    }
    return trims;
  });

/**
 * Critical flow 2, AC-25: what closing `projectId` on `closeDate` would do — the allocations that
 * will end on the close date and those starting after it that will be removed, each with its
 * resource and current dates. Read-only.
 */
export const previewProjectClose = (projectId: ProjectId, closeDate: IsoDate) =>
  Effect.gen(function* () {
    const trims = yield* trimsFor(projectId, closeDate);
    if (trims.length === 0) return { endingAtCloseDate: [], removed: [] } as ClosingImpact;
    const org = yield* OrgApi;

    const employeeIds = [...new Set(trims.map((t) => t.allocation.employeeId))];
    const { resources } = yield* org.employmentTerms(employeeIds, {
      from: closeDate,
      to: closeDate,
    });
    const teamIds = [...new Set(resources.flatMap((r) => (r.teamId === null ? [] : [r.teamId])))];
    const teams = yield* org.teamsByIds(teamIds);

    const toClosing = ({ allocation }: Trim): ClosingAllocation => {
      const resource = resources.find((r) => r.employeeId === allocation.employeeId);
      const team = teams.find((t) => t.id === resource?.teamId);
      return {
        allocationId: allocation.id,
        employee: {
          id: allocation.employeeId,
          // Employee records are never deleted (no FK across modules), so this is a fallback only.
          fullName: resource?.fullName ?? '',
          team: team === undefined ? null : { id: team.id, name: team.name },
        },
        startsOn: allocation.segments[0].startsOn,
        endsOn: allocation.segments[allocation.segments.length - 1]?.endsOn ?? closeDate,
      };
    };
    const isRemoval = (t: Trim) => t.update.history.changeKind === 'removed';
    const impact: ClosingImpact = {
      endingAtCloseDate: trims.filter((t) => !isRemoval(t)).map(toClosing),
      removed: trims.filter(isRemoval).map(toClosing),
    };
    return impact;
  });

/**
 * Critical flow 2, AC-25, AC-16: ends the project's allocations on `closeDate`, removes those
 * starting after it, and records each trim and removal in its history attributed to `closedBy`.
 * Opens no transaction of its own: called inside the close's `UnitOfWork` (ADR-0006), it commits
 * or rolls back with the close date. A version changed meanwhile is a defect, rolling the close
 * back with it.
 */
export const applyProjectClose = (projectId: ProjectId, closeDate: IsoDate, closedBy: UserId) =>
  Effect.gen(function* () {
    const trims = yield* trimsFor(projectId, closeDate);
    const allocations = yield* AllocationRepository;
    const history = yield* AllocationHistoryRepository;

    for (const { allocation, update } of trims) {
      const [first, ...rest] = update.segments;
      if (first === undefined) {
        yield* Effect.orDie(allocations.delete(allocation.id, allocation.version));
      } else {
        yield* Effect.orDie(
          allocations.update(
            allocation.id,
            allocation.version,
            [first, ...rest] as [Segment, ...Segment[]],
            closedBy,
          ),
        );
      }
      yield* history.append({
        allocationId: allocation.id,
        employeeId: allocation.employeeId,
        projectId: allocation.projectId,
        entry: update.history,
        changedBy: closedBy,
      });
    }
  });

/**
 * Scheduling's `ProjectClosingHook` for projects (ADR-0007), wired by the host. Captures the
 * repositories, the org facade and `Today` when built, so the port's methods need nothing; their
 * reads and writes join the caller's open `UnitOfWork`.
 */
export const ProjectClosingHookLive = Layer.effect(
  ProjectClosingHook,
  Effect.gen(function* () {
    const context = yield* Effect.context<
      AllocationRepository | AllocationHistoryRepository | OrgApi | Today
    >();
    return {
      preview: (projectId, closeDate) =>
        previewProjectClose(projectId, closeDate).pipe(Effect.provide(context)),
      apply: (projectId, closeDate, closedBy) =>
        applyProjectClose(projectId, closeDate, closedBy).pipe(Effect.provide(context)),
    };
  }),
);
