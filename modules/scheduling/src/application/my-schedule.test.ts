import { Actor, PermissionDenied, Unauthenticated } from '@arv/kernel';
import { Effect, Either, Layer, Option } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import { BoardWindowOutOfRange, NotSetUpAsResource } from '../domain/errors';
import { TICKS_PER_HOUR } from '../domain/ticks';
import { EDIT_ALLOCATIONS } from '../permissions';
import { getBoard } from './board';
import { getMySchedule } from './my-schedule';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

// Today (fakes) is Wednesday 28 October 2026; the current week starts Monday 26 October.
const H = 60;
const hours = (n: number) => n * TICKS_PER_HOUR;
const week = (startsOn: string, endsOn: string, perWeek: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: perWeek * H, ratePeriod: 'week' });
const leave = (startsOn: string, endsOn: string) =>
  new Segment({ startsOn, endsOn, rateMinutes: null, ratePeriod: 'full-day' });

let fakes: SchedulingFakes;

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

const idOf = (actor: Actor) => (actor._tag === 'User' ? actor.id : (undefined as never));

beforeEach(() => {
  fakes = makeSchedulingFakes();
});

describe('getMySchedule — own schedule (AC-17, AC-29)', () => {
  it('shows a resource without view-whole-board their own weeks, own leave type included', async () => {
    const me = fakes.user([]);
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const mine = fakes.seedResource({ fullName: 'Me', userId: idOf(me) });
    const other = fakes.seedResource({ fullName: 'Other' });
    const client = fakes.seedProject({ name: 'Client' });
    const sick = fakes.seedProject({ type: 'leave', name: 'Sick leave' });
    fakes.seedAllocation(
      mine.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-08', 20)],
      idOf(author),
    );
    fakes.seedAllocation(
      mine.employeeId,
      sick.id,
      [leave('2026-11-02', '2026-11-03')],
      idOf(author),
    );
    fakes.seedAllocation(
      other.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-08', 40)],
      idOf(author),
    );

    const schedule = right(await run(getMySchedule({ weeks: 2 }), me));

    expect(schedule).toMatchObject({
      from: '2026-10-26',
      to: '2026-11-08',
      weeks: ['2026-10-26', '2026-11-02'],
      employeeId: mine.employeeId,
      fullName: 'Me',
      employmentEnd: null,
      incomplete: false,
    });
    expect(schedule.cells.map((c) => [c.weekStart, c.allocated, c.capacity, c.leaveDays])).toEqual([
      ['2026-10-26', hours(20), Option.some(hours(40)), 0],
      ['2026-11-02', hours(20 + 16), Option.some(hours(40)), 2],
    ]);
    expect(schedule.allocations.map((a) => [a.project, a.away])).toEqual([
      [client, false],
      [sick, true],
    ]);

    // Read only: the same user may not open the board, let alone edit.
    expect(left(await run(getBoard(), me))).toBeInstanceOf(PermissionDenied);
  });

  it('hides their own employment end and allocations after it, as on the board (AC-22)', async () => {
    const me = fakes.user([]);
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const mine = fakes.seedResource({ userId: idOf(me), employmentEnd: '2026-11-04' });
    const client = fakes.seedProject();
    fakes.seedAllocation(
      mine.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-15', 40)],
      idOf(author),
    );

    const schedule = right(await run(getMySchedule({ weeks: 3 }), me));
    expect(schedule.employmentEnd).toBeNull();
    expect(schedule.cells.map((c) => c.allocated)).toEqual([hours(40), hours(24), 0]);
    expect(schedule.allocations[0]?.needsAttention).toBeNull();
  });
});

describe('getMySchedule — not a resource (AC-18)', () => {
  it('says the login is not set up as a resource', async () => {
    fakes.seedResource({ fullName: 'Someone else' });
    const me = fakes.user([]);
    const error = left(await run(getMySchedule(), me));
    expect(error).toEqual(new NotSetUpAsResource({ userId: idOf(me) }));
  });

  it('refuses an anonymous actor', async () => {
    expect(left(await run(getMySchedule(), Actor.Anonymous()))).toBeInstanceOf(Unauthenticated);
  });

  it('keeps the board window limits', async () => {
    const me = fakes.user([]);
    fakes.seedResource({ userId: idOf(me) });
    expect(left(await run(getMySchedule({ weeks: 13 }), me))).toBeInstanceOf(BoardWindowOutOfRange);
  });
});
