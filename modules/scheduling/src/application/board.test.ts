import { Actor, PermissionDenied, Unauthenticated } from '@arv/kernel';
import { TeamId } from '@arv/org';
import { Effect, Either, Layer, Option } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import { BoardWindowOutOfRange } from '../domain/errors';
import { TICKS_PER_HOUR } from '../domain/ticks';
import { EDIT_ALLOCATIONS, SEE_LEAVE_REASONS, VIEW_WHOLE_BOARD } from '../permissions';
import { type Board, type BoardRow, getBoard } from './board';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

// Today (fakes) is Wednesday 28 October 2026; the current week starts Monday 26 October.
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

const rowOf = (board: Board, name: string): BoardRow => {
  const row = board.rows.find((r) => r.fullName === name);
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
};
const cell = (row: BoardRow, weekStart: string) => {
  const found = row.cells.find((c) => c.weekStart === weekStart);
  if (found === undefined) throw new Error(`no cell for ${weekStart}`);
  return found;
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
  viewer = fakes.user([VIEW_WHOLE_BOARD]);
});

describe('getBoard — window (AC-01, ADR-0002)', () => {
  it('defaults to the current week and the 11 following', async () => {
    const board = right(await run(getBoard()));
    expect(board.from).toBe('2026-10-26');
    expect(board.to).toBe('2027-01-17');
    expect(board.weeks).toHaveLength(12);
    expect(board.weeks[0]).toBe('2026-10-26');
    expect(board.weeks[11]).toBe('2027-01-11');
  });

  it('starts on the Monday of the week of `from`', async () => {
    const board = right(await run(getBoard({ from: '2026-12-03', weeks: 2 })));
    expect(board.from).toBe('2026-11-30');
    expect(board.to).toBe('2026-12-13');
    expect(board.weeks).toEqual(['2026-11-30', '2026-12-07']);
  });

  it('scrolls back up to 12 months and forward up to 52 weeks', async () => {
    // 12 months before 28 Oct 2026 is 28 Oct 2025, in the week of Monday 27 Oct 2025.
    expect(Either.isRight(await run(getBoard({ from: '2025-10-27', weeks: 1 })))).toBe(true);
    // The last week may start 52 weeks after the current week: Monday 25 Oct 2027.
    expect(Either.isRight(await run(getBoard({ from: '2027-10-25', weeks: 1 })))).toBe(true);
    expect(Either.isRight(await run(getBoard({ from: '2027-08-09', weeks: 12 })))).toBe(true);

    for (const query of [
      { from: '2025-10-26', weeks: 1 },
      { from: '2027-11-01', weeks: 1 },
      { from: '2027-08-16', weeks: 12 },
      { weeks: 13 },
      { weeks: 0 },
      { weeks: 1.5 },
    ]) {
      const error = left(await run(getBoard(query)));
      expect(error).toBeInstanceOf(BoardWindowOutOfRange);
      expect(error).toMatchObject({
        earliestFrom: '2025-10-27',
        latestTo: '2027-10-31',
        maxWeeks: 12,
      });
    }
  });
});

describe('getBoard — rows and cells (AC-01, AC-06)', () => {
  it('one row per resource employed in the window, by full name, each cell in one state', async () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const authorId = author._tag === 'User' ? author.id : (undefined as never);
    const bea = fakes.seedResource({ fullName: 'Bea' });
    const ada = fakes.seedResource({ fullName: 'Ada' });
    // Starts in the third week: capacity zero and nothing allocated before (non-working).
    fakes.seedResource({ fullName: 'Cy', employmentStart: '2026-11-09' });
    fakes.seedResource({ fullName: 'Gone', employmentEnd: '2026-10-25' });
    fakes.seedResource({ fullName: 'Later', employmentStart: '2027-01-18' });
    const client = fakes.seedProject({ name: 'Client' });
    const other = fakes.seedProject({ name: 'Other' });
    const annual = fakes.seedProject({ type: 'leave', name: 'Annual leave' });

    fakes.seedAllocation(
      ada.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-08', 20)],
      authorId,
    );
    // 40 + 40 in the second week: overbooked; 40 alone in the third: partly booked («40/40»).
    fakes.seedAllocation(
      bea.employeeId,
      client.id,
      [week('2026-11-02', '2026-11-15', 40)],
      authorId,
    );
    fakes.seedAllocation(
      bea.employeeId,
      other.id,
      [week('2026-11-02', '2026-11-08', 40)],
      authorId,
    );
    // Friday 30 October off.
    fakes.seedAllocation(ada.employeeId, annual.id, [leave('2026-10-30', '2026-10-30')], authorId);

    const board = right(await run(getBoard()));

    expect(board.rows.map((r) => r.fullName)).toEqual(['Ada', 'Bea', 'Cy']);
    const adaRow = rowOf(board, 'Ada');
    expect(cell(adaRow, '2026-10-26')).toMatchObject({
      state: 'partly-booked',
      allocated: hours(20 + 8),
      capacity: Option.some(hours(40)),
      leaveDays: 1,
    });
    expect(cell(adaRow, '2026-11-02')).toMatchObject({ state: 'partly-booked', leaveDays: 0 });
    expect(cell(adaRow, '2026-11-09')).toMatchObject({ state: 'free', allocated: 0 });

    const beaRow = rowOf(board, 'Bea');
    expect(cell(beaRow, '2026-10-26').state).toBe('free');
    expect(cell(beaRow, '2026-11-02')).toMatchObject({
      state: 'overbooked',
      allocated: hours(80),
    });
    expect(cell(beaRow, '2026-11-09')).toMatchObject({
      state: 'partly-booked',
      allocated: hours(40),
      capacity: Option.some(hours(40)),
    });

    const cyRow = rowOf(board, 'Cy');
    expect(cell(cyRow, '2026-10-26').state).toBe('non-working');
    expect(cell(cyRow, '2026-11-09').state).toBe('free');
    expect(cyRow.incomplete).toBe(false);

    const [work, away] = adaRow.allocations;
    expect(work).toMatchObject({
      project: client,
      away: false,
      // A view-whole-board viewer may not see needing-attention marks (AC-22).
      needsAttention: null,
      version: 1,
      lastChangedBy: authorId,
    });
    expect(work?.allocatedPerWeek.slice(0, 3)).toEqual([
      { weekStart: '2026-10-26', allocated: hours(20) },
      { weekStart: '2026-11-02', allocated: hours(20) },
      { weekStart: '2026-11-09', allocated: 0 },
    ]);
    expect(away).toMatchObject({ project: null, away: true });
  });

  it('marks an incomplete record and keeps its row (AC-06)', async () => {
    fakes.seedResource({ fullName: 'Ivy', contractMinutes: null });
    fakes.seedResource({ fullName: 'Jo', employmentStart: null });
    const board = right(await run(getBoard({ weeks: 1 })));
    for (const name of ['Ivy', 'Jo']) {
      const row = rowOf(board, name);
      expect(row.incomplete).toBe(true);
      expect(row.cells.map((c) => [c.state, c.capacity])).toEqual([
        ['incomplete-record', Option.none()],
      ]);
    }
  });
});

describe('getBoard — filters (AC-02)', () => {
  it('narrows to one team', async () => {
    const platform = TeamId.make('00000000-0000-7000-8000-0000000000aa');
    fakes.seedResource({ fullName: 'Ada', teamId: platform });
    fakes.seedResource({ fullName: 'Bea' });
    const board = right(await run(getBoard({ teamId: platform })));
    expect(board.rows.map((r) => r.fullName)).toEqual(['Ada']);
  });

  it('narrows to resources with an allocation to the project in the window, with all their figures', async () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const authorId = author._tag === 'User' ? author.id : (undefined as never);
    const ada = fakes.seedResource({ fullName: 'Ada' });
    const bea = fakes.seedResource({ fullName: 'Bea' });
    const cy = fakes.seedResource({ fullName: 'Cy' });
    const client = fakes.seedProject();
    const other = fakes.seedProject();
    fakes.seedAllocation(
      ada.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-01', 10)],
      authorId,
    );
    fakes.seedAllocation(
      ada.employeeId,
      other.id,
      [week('2026-10-26', '2026-11-01', 10)],
      authorId,
    );
    fakes.seedAllocation(
      bea.employeeId,
      other.id,
      [week('2026-10-26', '2026-11-01', 10)],
      authorId,
    );
    // On the project, but after the window.
    fakes.seedAllocation(
      cy.employeeId,
      client.id,
      [week('2027-02-01', '2027-02-07', 10)],
      authorId,
    );

    const board = right(await run(getBoard({ projectId: client.id })));
    expect(board.rows.map((r) => r.fullName)).toEqual(['Ada']);
    const adaRow = rowOf(board, 'Ada');
    expect(cell(adaRow, '2026-10-26').allocated).toBe(hours(20));
    expect(adaRow.allocations).toHaveLength(2);
  });
});

describe('getBoard — authorization (AC-03, AC-12b)', () => {
  it('refuses a viewer with neither view-whole-board nor edit-allocations', async () => {
    fakes.seedResource();
    const error = left(await run(getBoard(), fakes.user([SEE_LEAVE_REASONS])));
    expect(error).toEqual(new PermissionDenied({ permission: VIEW_WHOLE_BOARD }));
    expect(left(await run(getBoard(), Actor.Anonymous()))).toBeInstanceOf(Unauthenticated);
  });

  it('refuses before validating the window', async () => {
    const error = left(await run(getBoard({ weeks: 99 }), fakes.user([])));
    expect(error).toBeInstanceOf(PermissionDenied);
  });

  it('shows edit-allocations holders the board as view-whole-board holders see it', async () => {
    fakes.seedResource({ fullName: 'Ada' });
    const board = right(await run(getBoard(), fakes.user([EDIT_ALLOCATIONS])));
    expect(board.rows.map((r) => r.fullName)).toEqual(['Ada']);
  });
});

describe('getBoard — employment end (AC-21, AC-22)', () => {
  // Employment ends Wednesday 4 November; an allocation of 40 h/week runs to 15 November.
  const seed = () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const authorId = author._tag === 'User' ? author.id : (undefined as never);
    const leaver = fakes.seedResource({ fullName: 'Leaver', employmentEnd: '2026-11-04' });
    const client = fakes.seedProject();
    fakes.seedAllocation(
      leaver.employeeId,
      client.id,
      [week('2026-10-26', '2026-11-15', 40)],
      authorId,
    );
    // Starts after the end date: hidden altogether from viewers who may not see it.
    const late = fakes.seedProject();
    fakes.seedAllocation(
      leaver.employeeId,
      late.id,
      [week('2026-11-09', '2026-11-15', 8)],
      authorId,
    );
    return { late };
  };

  it('shows the end date and needing-attention marks to edit-allocations holders', async () => {
    seed();
    const board = right(await run(getBoard({ weeks: 3 }), fakes.user([EDIT_ALLOCATIONS])));
    const row = rowOf(board, 'Leaver');
    expect(row.employmentEnd).toBe('2026-11-04');
    expect(row.cells.map((c) => c.state)).toEqual([
      'partly-booked',
      'needs-attention',
      'needs-attention',
    ]);
    expect(row.allocations.map((a) => a.needsAttention)).toEqual([true, true]);
  });

  it('hides the end date, later allocations and marks from other viewers: only zero capacity', async () => {
    const { late } = seed();
    const board = right(await run(getBoard({ weeks: 3 })));
    const row = rowOf(board, 'Leaver');
    expect(row.employmentEnd).toBeNull();
    // Mon–Wed of the second week: 24 h of 24 h capacity; then nothing.
    expect(row.cells.map((c) => [c.state, c.allocated, c.capacity])).toEqual([
      ['partly-booked', hours(40), Option.some(hours(40))],
      ['partly-booked', hours(24), Option.some(hours(24))],
      ['non-working', 0, Option.some(0)],
    ]);
    expect(row.allocations).toHaveLength(1);
    const [only] = row.allocations;
    expect(only?.needsAttention).toBeNull();
    expect(only?.segments.map((s) => [s.startsOn, s.endsOn])).toEqual([
      ['2026-10-26', '2026-11-04'],
    ]);
    expect(only?.allocatedPerWeek.map((w) => w.allocated)).toEqual([hours(40), hours(24), 0]);

    // Nor does an allocation after the end put the resource on a project-filtered board.
    const filtered = right(await run(getBoard({ weeks: 3, projectId: late.id })));
    expect(filtered.rows).toEqual([]);
    const forEditor = right(
      await run(getBoard({ weeks: 3, projectId: late.id }), fakes.user([EDIT_ALLOCATIONS])),
    );
    expect(forEditor.rows.map((r) => r.fullName)).toEqual(['Leaver']);
  });
});

describe('getBoard — leave type (AC-29)', () => {
  const seed = () => {
    const author = fakes.user([EDIT_ALLOCATIONS]);
    const authorId = author._tag === 'User' ? author.id : (undefined as never);
    const sickLogin = fakes.user([VIEW_WHOLE_BOARD]);
    const sickUserId = sickLogin._tag === 'User' ? sickLogin.id : (undefined as never);
    const resource = fakes.seedResource({ fullName: 'Sick', userId: sickUserId });
    const sick = fakes.seedProject({ type: 'leave', name: 'Sick leave' });
    fakes.seedAllocation(
      resource.employeeId,
      sick.id,
      [leave('2026-11-02', '2026-11-06')],
      authorId,
    );
    return { sick, sickLogin };
  };

  it('shows «away» without the leave project to viewers without see-leave-reasons', async () => {
    seed();
    const board = right(await run(getBoard({ weeks: 2 }), fakes.user([EDIT_ALLOCATIONS])));
    const row = rowOf(board, 'Sick');
    expect(row.allocations.map((a) => [a.project, a.away])).toEqual([[null, true]]);
    expect(cell(row, '2026-11-02').leaveDays).toBe(5);
  });

  it('shows the leave type to see-leave-reasons holders and to the resource themselves', async () => {
    const { sick, sickLogin } = seed();
    for (const actor of [fakes.user([VIEW_WHOLE_BOARD, SEE_LEAVE_REASONS]), sickLogin]) {
      const board = right(await run(getBoard({ weeks: 2 }), actor));
      expect(rowOf(board, 'Sick').allocations.map((a) => [a.project, a.away])).toEqual([
        [sick, true],
      ]);
    }
  });

  it('does not narrow by a leave project for viewers without see-leave-reasons', async () => {
    const { sick, sickLogin } = seed();
    // Not even the resource: the filter lists projects across all resources.
    for (const actor of [viewer, sickLogin]) {
      expect(right(await run(getBoard({ projectId: sick.id }), actor)).rows).toEqual([]);
    }
    const holder = fakes.user([VIEW_WHOLE_BOARD, SEE_LEAVE_REASONS]);
    const board = right(await run(getBoard({ projectId: sick.id }), holder));
    expect(board.rows.map((r) => r.fullName)).toEqual(['Sick']);
  });
});
