import { Actor, PermissionDenied, Unauthenticated } from '@arv/kernel';
import { Effect, Either, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import { FreeListQueryInvalid } from '../domain/errors';
import { TICKS_PER_HOUR } from '../domain/ticks';
import { EDIT_ALLOCATIONS, SEE_LEAVE_REASONS, VIEW_WHOLE_BOARD } from '../permissions';
import { FREE_LIST_QUERY_MESSAGE, type FreeListQuery, getFreeList } from './free-list';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

// Today (fakes) is Wednesday 28 October 2026. Over 2 weeks the period is Wed 28 October to
// Sun 8 November: 3 working days this week (24 h of 40) plus the next full week (40 h).
const H = 60;
const hours = (n: number) => n * TICKS_PER_HOUR;

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

const authorId = () => {
  const author = fakes.user([EDIT_ALLOCATIONS]);
  return author._tag === 'User' ? author.id : (undefined as never);
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
  viewer = fakes.user([VIEW_WHOLE_BOARD]);
});

describe('getFreeList (AC-04)', () => {
  it('ranks resources with at least X free hours, most free first, an overbooked week as zero', async () => {
    const by = authorId();
    const idle = fakes.seedResource({ fullName: 'Idle' });
    const half = fakes.seedResource({ fullName: 'Half' });
    const over = fakes.seedResource({ fullName: 'Over' });
    const busy = fakes.seedResource({ fullName: 'Busy' });
    const away = fakes.seedResource({ fullName: 'Away' });
    const client = fakes.seedProject();
    const annual = fakes.seedProject({ type: 'leave' });
    // Half: 20 h/week from today: 24 − 12 + 40 − 20 = 32 free.
    fakes.seedAllocation(half.employeeId, client.id, [week('2026-10-28', '2026-11-08', 20)], by);
    // Over: overbooked next week (60 of 40) counts zero, never −20: 24 free.
    fakes.seedAllocation(over.employeeId, client.id, [week('2026-11-02', '2026-11-08', 60)], by);
    // Busy: fully booked: 0 free, under 16.
    fakes.seedAllocation(busy.employeeId, client.id, [week('2026-10-26', '2026-11-08', 40)], by);
    // Away: leave the whole of next week: 24 free, not free while on leave (AC-15).
    fakes.seedAllocation(away.employeeId, annual.id, [leave('2026-11-02', '2026-11-06')], by);

    const list = right(await run(getFreeList({ weeks: 2, minFreeHours: 16 })));

    expect(list.from).toBe('2026-10-28');
    expect(list.to).toBe('2026-11-08');
    expect(list.weeks).toEqual(['2026-10-26', '2026-11-02']);
    expect(list.entries.map((e) => [e.resource.fullName, e.freeTotal])).toEqual([
      ['Idle', hours(64)],
      ['Half', hours(32)],
      // Ties keep the resources' order, by full name.
      ['Away', hours(24)],
      ['Over', hours(24)],
    ]);
    expect(list.entries[0]?.resource).toEqual({
      employeeId: idle.employeeId,
      fullName: 'Idle',
      teamId: null,
    });
    expect(list.entries.find((e) => e.resource.fullName === 'Over')?.freePerWeek).toEqual([
      { weekStart: '2026-10-26', free: hours(24) },
      { weekStart: '2026-11-02', free: 0 },
    ]);
  });

  it('keeps a resource with exactly X free hours and accepts fractional hours', async () => {
    const by = authorId();
    const r = fakes.seedResource({ fullName: 'Edge' });
    const client = fakes.seedProject();
    // 24 + (40 − 23.75) = 40.25 free.
    fakes.seedAllocation(r.employeeId, client.id, [week('2026-11-02', '2026-11-08', 23.75)], by);
    const at = right(await run(getFreeList({ weeks: 2, minFreeHours: 40.25 })));
    const above = right(await run(getFreeList({ weeks: 2, minFreeHours: 40.26 })));
    expect(at.entries.map((e) => e.resource.fullName)).toEqual(['Edge']);
    expect(above.entries).toEqual([]);
  });

  it('leaves out resources not employed in the period', async () => {
    fakes.seedResource({ fullName: 'Gone', employmentEnd: '2026-10-27' });
    fakes.seedResource({ fullName: 'Later', employmentStart: '2026-11-09' });
    const list = right(await run(getFreeList({ weeks: 2, minFreeHours: 0 })));
    expect(list.entries).toEqual([]);
  });
});

describe('getFreeList — validation (AC-05)', () => {
  it.each<[FreeListQuery, ReadonlyArray<string>]>([
    [{ weeks: 0, minFreeHours: 16 }, ['weeks']],
    [{ weeks: 13, minFreeHours: 16 }, ['weeks']],
    [{ weeks: 1.5, minFreeHours: 16 }, ['weeks']],
    [{ weeks: 2, minFreeHours: -1 }, ['minFreeHours']],
    [{ weeks: 2, minFreeHours: Number.NaN }, ['minFreeHours']],
    [{ weeks: 99, minFreeHours: Number.POSITIVE_INFINITY }, ['weeks', 'minFreeHours']],
  ])('rejects %j with the allowed ranges and no results', async (query, paths) => {
    fakes.seedResource();
    const error = left(await run(getFreeList(query)));
    expect(error).toBeInstanceOf(FreeListQueryInvalid);
    const invalid = error as FreeListQueryInvalid;
    expect(invalid.message).toBe(
      'The number of weeks must be from 1 to 12 and the free hours must be zero or more',
    );
    expect(invalid.message).toBe(FREE_LIST_QUERY_MESSAGE);
    expect(invalid.issues.map((i) => i.path)).toEqual(paths);
  });

  it('accepts the bounds: 1 and 12 weeks, zero hours', async () => {
    fakes.seedResource();
    for (const weeks of [1, 12]) {
      const list = right(await run(getFreeList({ weeks, minFreeHours: 0 })));
      expect(list.weeks).toHaveLength(weeks);
    }
  });
});

describe('getFreeList — incomplete records (AC-06)', () => {
  it('leaves them out with a note that their capacity is unknown', async () => {
    fakes.seedResource({ fullName: 'Ada' });
    const ivy = fakes.seedResource({ fullName: 'Ivy', contractMinutes: null });
    const jo = fakes.seedResource({ fullName: 'Jo', employmentStart: null });
    const list = right(await run(getFreeList({ weeks: 2, minFreeHours: 0 })));
    expect(list.entries.map((e) => e.resource.fullName)).toEqual(['Ada']);
    expect(list.incompleteRecords.map((r) => r.employeeId)).toEqual([
      ivy.employeeId,
      jo.employeeId,
    ]);
  });
});

describe('getFreeList — employment end (AC-21b, AC-22)', () => {
  // Employment ends Wednesday 4 November; 16 h are booked after it, Thursday to Sunday.
  const seed = () => {
    const leaver = fakes.seedResource({ fullName: 'Leaver', employmentEnd: '2026-11-04' });
    const client = fakes.seedProject();
    fakes.seedAllocation(
      leaver.employeeId,
      client.id,
      [week('2026-11-05', '2026-11-08', 16)],
      authorId(),
    );
  };

  it('counts a week needing attention as zero for viewers who may see the end', async () => {
    seed();
    const list = right(
      await run(getFreeList({ weeks: 2, minFreeHours: 0 }), fakes.user([EDIT_ALLOCATIONS])),
    );
    expect(list.entries[0]?.freePerWeek.map((w) => w.free)).toEqual([hours(24), 0]);
  });

  it('shows other viewers only zero capacity after the end, no allocations past it', async () => {
    seed();
    const list = right(await run(getFreeList({ weeks: 2, minFreeHours: 0 })));
    // Mon–Wed before the end: 24 h free; the hours booked after it do not count.
    expect(list.entries[0]?.freePerWeek.map((w) => w.free)).toEqual([hours(24), hours(24)]);
    expect(list.entries[0]?.resource).not.toHaveProperty('employmentEnd');
  });
});

describe('getFreeList — authorization (AC-03, AC-12b)', () => {
  it('refuses viewers with neither view-whole-board nor edit-allocations, before validating', async () => {
    const error = left(
      await run(getFreeList({ weeks: 99, minFreeHours: -1 }), fakes.user([SEE_LEAVE_REASONS])),
    );
    expect(error).toEqual(new PermissionDenied({ permission: VIEW_WHOLE_BOARD }));
    expect(
      left(await run(getFreeList({ weeks: 2, minFreeHours: 0 }), Actor.Anonymous())),
    ).toBeInstanceOf(Unauthenticated);
  });

  it('answers edit-allocations holders like view-whole-board holders', async () => {
    fakes.seedResource({ fullName: 'Ada' });
    const list = right(
      await run(getFreeList({ weeks: 2, minFreeHours: 0 }), fakes.user([EDIT_ALLOCATIONS])),
    );
    expect(list.entries.map((e) => e.resource.fullName)).toEqual(['Ada']);
  });
});
