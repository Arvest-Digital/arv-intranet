import {
  Actor,
  type EmployeeId,
  PermissionDenied,
  type ProjectId,
  Unauthenticated,
} from '@arv/kernel';
import { Effect, Either, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { AllocationId, type ChangeKind, HistoryEntry, Segment } from '../domain/allocation';
import { EDIT_ALLOCATIONS, SEE_LEAVE_REASONS, VIEW_WHOLE_BOARD } from '../permissions';
import { getAllocationHistory } from './history';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

// Today (fakes) is Wednesday 28 October 2026: history reaches back to 28 October 2025.
const H = 60;
const week = (startsOn: string, endsOn: string, perWeek: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: perWeek * H, ratePeriod: 'week' });
const leave = (startsOn: string, endsOn: string) =>
  new Segment({ startsOn, endsOn, rateMinutes: null, ratePeriod: 'full-day' });

let fakes: SchedulingFakes;
let viewer: Actor;

const run = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor = viewer) =>
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

const idOf = (actor: Actor) => (actor._tag === 'User' ? actor.id : (undefined as never));

const record = (
  allocationId: AllocationId,
  employeeId: EmployeeId,
  projectId: ProjectId,
  by: Actor,
  at: string,
  changeKind: ChangeKind,
  effectiveFrom: string | null,
  before: ReadonlyArray<Segment> | null,
  after: ReadonlyArray<Segment> | null,
) =>
  fakes.seedHistory(
    {
      allocationId,
      employeeId,
      projectId,
      changedBy: idOf(by),
      entry: new HistoryEntry({ changeKind, effectiveFrom, before, after }),
    },
    new Date(at),
  );

const allocationId = AllocationId.make('00000000-0000-7000-8000-00000000a110');

beforeEach(() => {
  fakes = makeSchedulingFakes();
  viewer = fakes.user([VIEW_WHOLE_BOARD]);
});

describe('getAllocationHistory — order and attribution (AC-16)', () => {
  it('lists every change of the last 12 months oldest first, the trim by the closer', async () => {
    const creator = fakes.user([EDIT_ALLOCATIONS]);
    const changer = fakes.user([EDIT_ALLOCATIONS]);
    const closer = fakes.user([]);
    const ada = fakes.seedResource({ fullName: 'Ada' });
    const client = fakes.seedProject({ name: 'Client' });
    const created = [week('2026-03-02', '2026-12-31', 20)];
    const changed = [week('2026-03-02', '2026-06-30', 20), week('2026-07-01', '2026-12-31', 30)];
    const trimmed = [week('2026-03-02', '2026-06-30', 20), week('2026-07-01', '2026-11-30', 30)];
    // Recorded out of order: the use case orders by when each change was made.
    record(
      allocationId,
      ada.employeeId,
      client.id,
      closer,
      '2026-10-20T10:00:00Z',
      'trimmed',
      '2026-12-01',
      changed,
      trimmed,
    );
    record(
      allocationId,
      ada.employeeId,
      client.id,
      creator,
      '2026-02-20T09:00:00Z',
      'created',
      null,
      null,
      created,
    );
    record(
      allocationId,
      ada.employeeId,
      client.id,
      changer,
      '2026-07-01T09:00:00Z',
      'changed',
      '2026-07-01',
      created,
      changed,
    );
    // Another allocation's entry is not listed.
    record(
      AllocationId.make('00000000-0000-7000-8000-00000000b220'),
      ada.employeeId,
      client.id,
      creator,
      '2026-05-01T09:00:00Z',
      'created',
      null,
      null,
      created,
    );

    const items = right(await run(getAllocationHistory(allocationId)));

    expect(items.map((i) => [i.changeKind, i.changedBy, i.changedAt.toISOString()])).toEqual([
      ['created', idOf(creator), '2026-02-20T09:00:00.000Z'],
      ['changed', idOf(changer), '2026-07-01T09:00:00.000Z'],
      ['trimmed', idOf(closer), '2026-10-20T10:00:00.000Z'],
    ]);
    expect(items[0]).toMatchObject({ effectiveFrom: null, before: null, after: created });
    expect(items[1]).toMatchObject({
      effectiveFrom: '2026-07-01',
      before: created,
      after: changed,
    });
    expect(items[2]).toMatchObject({
      allocationId,
      employeeId: ada.employeeId,
      project: client,
      away: false,
      effectiveFrom: '2026-12-01',
      before: changed,
      after: trimmed,
    });
  });

  it('shows «imported» first while within 12 months, leaves older entries out, and outlives a removal', async () => {
    const importer = fakes.user([EDIT_ALLOCATIONS]);
    const remover = fakes.user([EDIT_ALLOCATIONS]);
    const ada = fakes.seedResource();
    const client = fakes.seedProject();
    const imported = [week('2025-09-01', '2026-11-30', 10)];
    record(
      allocationId,
      ada.employeeId,
      client.id,
      importer,
      '2025-11-03T08:00:00Z',
      'imported',
      null,
      null,
      imported,
    );
    record(
      allocationId,
      ada.employeeId,
      client.id,
      remover,
      '2026-10-27T08:00:00Z',
      'removed',
      '2026-10-27',
      imported,
      null,
    );

    const items = right(await run(getAllocationHistory(allocationId)));
    expect(items.map((i) => [i.changeKind, i.changedBy])).toEqual([
      ['imported', idOf(importer)],
      ['removed', idOf(remover)],
    ]);
    expect(items[1]?.after).toBeNull();

    // A year on, the import entry is older than 12 months and no longer listed.
    fakes.clock.today = '2026-11-04';
    const later = right(await run(getAllocationHistory(allocationId)));
    expect(later.map((i) => i.changeKind)).toEqual(['removed']);
  });

  it('gives no entries for an unknown allocation', async () => {
    expect(right(await run(getAllocationHistory(allocationId)))).toEqual([]);
  });
});

describe('getAllocationHistory — authorization (AC-03, AC-12b)', () => {
  it('lets edit-allocations holders read history as view-whole-board holders do', async () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const ada = fakes.seedResource();
    const client = fakes.seedProject();
    record(
      allocationId,
      ada.employeeId,
      client.id,
      author,
      '2026-10-01T09:00:00Z',
      'created',
      null,
      null,
      [week('2026-10-05', '2026-12-31', 8)],
    );

    const asViewer = right(await run(getAllocationHistory(allocationId)));
    const asEditor = right(await run(getAllocationHistory(allocationId), author));
    expect(asEditor).toEqual(asViewer);
    expect(asEditor).toHaveLength(1);
  });

  it('refuses a viewer with neither view-whole-board nor edit-allocations', async () => {
    const error = left(
      await run(getAllocationHistory(allocationId), fakes.user([SEE_LEAVE_REASONS])),
    );
    expect(error).toEqual(new PermissionDenied({ permission: VIEW_WHOLE_BOARD }));
    expect(left(await run(getAllocationHistory(allocationId), Actor.Anonymous()))).toBeInstanceOf(
      Unauthenticated,
    );
  });
});

describe('getAllocationHistory — leave type (AC-29)', () => {
  const seed = () => {
    const booker = fakes.user([EDIT_ALLOCATIONS]);
    const sickLogin = fakes.user([VIEW_WHOLE_BOARD]);
    const resource = fakes.seedResource({ fullName: 'Sick', userId: idOf(sickLogin) });
    const sick = fakes.seedProject({ type: 'leave', name: 'Sick leave' });
    record(
      allocationId,
      resource.employeeId,
      sick.id,
      booker,
      '2026-10-27T09:00:00Z',
      'created',
      null,
      null,
      [leave('2026-11-02', '2026-11-06')],
    );
    return { booker, sick, sickLogin };
  };

  it('shows «away» without the leave project to viewers without see-leave-reasons, the booker included', async () => {
    const { booker } = seed();
    for (const actor of [viewer, booker]) {
      const [entry] = right(await run(getAllocationHistory(allocationId), actor));
      expect(entry).toMatchObject({ project: null, away: true });
      expect(JSON.stringify(entry)).not.toContain('Sick leave');
    }
  });

  it('shows the leave type to see-leave-reasons holders and to the resource themselves', async () => {
    const { sick, sickLogin } = seed();
    for (const actor of [fakes.user([VIEW_WHOLE_BOARD, SEE_LEAVE_REASONS]), sickLogin]) {
      const [entry] = right(await run(getAllocationHistory(allocationId), actor));
      expect(entry).toMatchObject({ project: sick, away: true });
    }
  });
});

describe('getAllocationHistory — employment end (AC-22)', () => {
  it('cuts values at an end the viewer may not see and leaves out changes after it', async () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const leaver = fakes.seedResource({ employmentEnd: '2026-11-04' });
    const client = fakes.seedProject();
    const created = [week('2026-10-05', '2026-11-30', 40)];
    const changed = [week('2026-10-05', '2026-11-08', 40), week('2026-11-09', '2026-11-30', 20)];
    record(
      allocationId,
      leaver.employeeId,
      client.id,
      author,
      '2026-10-01T09:00:00Z',
      'created',
      null,
      null,
      created,
    );
    record(
      allocationId,
      leaver.employeeId,
      client.id,
      author,
      '2026-10-20T09:00:00Z',
      'changed',
      '2026-11-09',
      created,
      changed,
    );

    const hidden = right(await run(getAllocationHistory(allocationId)));
    expect(hidden.map((i) => i.changeKind)).toEqual(['created']);
    expect(hidden[0]?.after).toEqual([week('2026-10-05', '2026-11-04', 40)]);

    const shown = right(await run(getAllocationHistory(allocationId), author));
    expect(shown.map((i) => i.changeKind)).toEqual(['created', 'changed']);
    expect(shown[0]?.after).toEqual(created);
  });
});
