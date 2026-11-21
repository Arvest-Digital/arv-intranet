import { Actor, PermissionDenied, Unauthenticated, UserId } from '@arv/kernel';
import { Effect, Either, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { AllocationId, HistoryEntry, Segment } from '../domain/allocation';
import { AllocationNotFound } from '../domain/errors';
import { EDIT_ALLOCATIONS, SEE_LEAVE_REASONS, VIEW_WHOLE_BOARD } from '../permissions';
import { getAllocation } from './get-allocation';
import { listAllocationHistory } from './history';
import { resolveRefs } from './refs';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

// Today (fakes) is Wednesday 28 October 2026.
const week = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * 60, ratePeriod: 'week' });
const leave = (startsOn: string, endsOn: string) =>
  new Segment({ startsOn, endsOn, rateMinutes: null, ratePeriod: 'full-day' });

let fakes: SchedulingFakes;
const changer = UserId.make('00000000-0000-7000-8000-00000000c0de');

const run = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor) =>
  Effect.runPromise(
    Effect.either(
      effect.pipe(Effect.provide(Layer.merge(fakes.layer, fakes.as(actor)))) as Effect.Effect<
        A,
        E,
        never
      >,
    ),
  );

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result)) throw new Error(`expected success, got ${String(result.left)}`);
  return result.right;
};
const left = <A, E>(result: Either.Either<A, E>): E => {
  if (Either.isRight(result)) throw new Error('expected a failure');
  return result.left;
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
});

describe('getAllocation (US-05, AC-07b, AC-12b)', () => {
  it('returns the allocation with its version and who changed it last', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const stored = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-12-31', 20)],
      changer,
      3,
    );

    const view = right(
      await run(getAllocation(stored.allocation.id), fakes.user([VIEW_WHOLE_BOARD])),
    );

    expect(view).toMatchObject({
      id: stored.allocation.id,
      employeeId: resource.employeeId,
      project,
      away: false,
      version: 3,
      lastChangedBy: changer,
      createdAt: stored.createdAt,
    });
    expect(view.segments).toEqual([week('2026-11-02', '2026-12-31', 20)]);
  });

  it('needs view-whole-board or edit-allocations, and a signed-in actor (AC-12b)', async () => {
    const stored = fakes.seedAllocation(
      fakes.seedResource().employeeId,
      fakes.seedProject().id,
      [week('2026-11-02', '2026-12-31', 20)],
      changer,
    );
    expect(left(await run(getAllocation(stored.allocation.id), fakes.user([])))).toBeInstanceOf(
      PermissionDenied,
    );
    expect(left(await run(getAllocation(stored.allocation.id), Actor.Anonymous()))).toBeInstanceOf(
      Unauthenticated,
    );
    expect(
      right(await run(getAllocation(stored.allocation.id), fakes.user([EDIT_ALLOCATIONS]))).id,
    ).toBe(stored.allocation.id);
  });

  it('fails AllocationNotFound for an unknown id', async () => {
    const id = AllocationId.make('00000000-0000-7000-8000-00000000ffff');
    expect(left(await run(getAllocation(id), fakes.user([VIEW_WHOLE_BOARD])))).toEqual(
      new AllocationNotFound({ allocationId: id }),
    );
  });

  it('shows leave as «away» unless the viewer sees leave reasons (AC-29)', async () => {
    const resource = fakes.seedResource();
    const sick = fakes.seedProject({ type: 'leave', name: 'Sick leave' });
    const stored = fakes.seedAllocation(
      resource.employeeId,
      sick.id,
      [leave('2026-11-09', '2026-11-13')],
      changer,
    );

    const hidden = right(
      await run(getAllocation(stored.allocation.id), fakes.user([VIEW_WHOLE_BOARD])),
    );
    expect(hidden).toMatchObject({ project: null, away: true });

    const shown = right(
      await run(
        getAllocation(stored.allocation.id),
        fakes.user([VIEW_WHOLE_BOARD, SEE_LEAVE_REASONS]),
      ),
    );
    expect(shown).toMatchObject({ project: sick, away: true });
  });

  it('cuts the segments at an employment end the viewer may not see, and hides the mark (AC-22)', async () => {
    const resource = fakes.seedResource({ employmentEnd: '2026-11-30' });
    const project = fakes.seedProject();
    const stored = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-12-31', 20)],
      changer,
    );

    const viewerSees = right(
      await run(getAllocation(stored.allocation.id), fakes.user([VIEW_WHOLE_BOARD])),
    );
    expect(viewerSees.segments).toEqual([week('2026-11-02', '2026-11-30', 20)]);
    expect(viewerSees.needsAttention).toBeNull();

    const plannerSees = right(
      await run(getAllocation(stored.allocation.id), fakes.user([EDIT_ALLOCATIONS])),
    );
    expect(plannerSees.segments).toEqual([week('2026-11-02', '2026-12-31', 20)]);
    expect(plannerSees.needsAttention).toBe(true);
  });

  it('is not found for a viewer when it lies wholly after a hidden employment end (AC-22)', async () => {
    const resource = fakes.seedResource({ employmentEnd: '2026-11-30' });
    const stored = fakes.seedAllocation(
      resource.employeeId,
      fakes.seedProject().id,
      [week('2026-12-07', '2026-12-31', 20)],
      changer,
    );
    expect(
      left(await run(getAllocation(stored.allocation.id), fakes.user([VIEW_WHOLE_BOARD]))),
    ).toBeInstanceOf(AllocationNotFound);
  });
});

describe('listAllocationHistory paging', () => {
  it('cuts the history oldest first into cursor pages', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const allocationId = AllocationId.make('00000000-0000-7000-8000-00000000a110');
    for (const day of ['2026-10-01', '2026-10-05', '2026-10-09']) {
      fakes.seedHistory(
        {
          allocationId,
          employeeId: resource.employeeId,
          projectId: project.id,
          changedBy: changer,
          entry: new HistoryEntry({
            changeKind: 'changed',
            effectiveFrom: day,
            before: [week('2026-10-01', '2026-12-31', 20)],
            after: [week('2026-10-01', '2026-12-31', 10)],
          }),
        },
        new Date(`${day}T09:00:00Z`),
      );
    }
    const viewer = fakes.user([VIEW_WHOLE_BOARD]);

    const first = right(await run(listAllocationHistory(allocationId, { limit: 2 }), viewer));
    expect(first.items.map((i) => i.effectiveFrom)).toEqual(['2026-10-01', '2026-10-05']);
    expect(first).toMatchObject({ hasNext: true, hasPrev: false });

    const second = right(
      await run(
        listAllocationHistory(allocationId, { after: first.nextCursor ?? '', limit: 2 }),
        viewer,
      ),
    );
    expect(second.items.map((i) => i.effectiveFrom)).toEqual(['2026-10-09']);
    expect(second).toMatchObject({ hasNext: false, hasPrev: true, nextCursor: null });
  });
});

describe('resolveRefs', () => {
  it('names teams, resources and changers; a removed login has no name', async () => {
    const team = fakes.seedTeam('Platform');
    const resource = fakes.seedResource({ fullName: 'Test User 1', teamId: team.id });
    const gone = UserId.make('00000000-0000-7000-8000-00000000dead');
    fakes.seedUserName(changer, 'Test User 2');

    const refs = right(
      await run(
        resolveRefs({ employeeIds: [resource.employeeId], userIds: [changer, gone] }),
        fakes.user([]),
      ),
    );

    expect(refs.employee(resource.employeeId)).toEqual({
      id: resource.employeeId,
      fullName: 'Test User 1',
      team,
    });
    expect(refs.team(team.id)).toEqual(team);
    expect(refs.team(null)).toBeNull();
    expect(refs.user(changer)).toEqual({ id: changer, name: 'Test User 2' });
    expect(refs.user(gone)).toEqual({ id: gone, name: null });
  });
});
