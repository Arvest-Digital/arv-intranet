import { UnitOfWork, type UserId } from '@arv/kernel';
import { ProjectClosingHook } from '@arv/projects';
import { Effect, Exit, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import { ProjectClosingHookLive } from './project-closing-hook';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const H = 60;
const CLOSE_DATE = '2026-11-13';

const week = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod: 'week' });

let fakes: SchedulingFakes;

/** Runs `use` with the port as projects would get it: scheduling's Layer on the fakes. */
const withHook = <A, E>(
  use: (hook: ProjectClosingHook['Type']) => Effect.Effect<A, E, UnitOfWork>,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(ProjectClosingHook, use).pipe(
      Effect.provide(
        Layer.merge(ProjectClosingHookLive, fakes.layer).pipe(Layer.provide(fakes.layer)),
      ),
    ),
  );

const userIdOf = (actor: ReturnType<SchedulingFakes['user']>): UserId =>
  actor._tag === 'User' ? actor.id : (undefined as never);

/**
 * AC-25: a project with 3 allocations running past the close date (one that started in the past,
 * one inside the window, one with two segments), 2 starting after it, one ending on it, and an
 * allocation of another project that must stay untouched.
 */
const setup = () => {
  const planner = userIdOf(fakes.user([]));
  const closer = userIdOf(fakes.user([]));
  const platform = fakes.seedTeam('Platform');
  const ada = fakes.seedResource({ fullName: 'Ada Lovelace', teamId: platform.id });
  const alan = fakes.seedResource({ fullName: 'Alan Turing' });
  const grace = fakes.seedResource({ fullName: 'Grace Hopper' });
  const atlas = fakes.seedProject({ name: 'Atlas' });
  const other = fakes.seedProject({ name: 'Other' });

  const running = fakes.seedAllocation(
    ada.employeeId,
    atlas.id,
    [week('2026-10-01', '2026-12-31', 20)],
    planner,
  );
  const inside = fakes.seedAllocation(
    alan.employeeId,
    atlas.id,
    [week('2026-11-02', '2026-11-30', 16)],
    planner,
  );
  const split = fakes.seedAllocation(
    ada.employeeId,
    atlas.id,
    [week('2026-11-02', '2026-11-08', 8), week('2026-11-09', '2026-11-27', 12)],
    planner,
    3,
  );
  const later = fakes.seedAllocation(
    alan.employeeId,
    atlas.id,
    [week('2026-11-16', '2026-11-30', 8)],
    planner,
  );
  const muchLater = fakes.seedAllocation(
    grace.employeeId,
    atlas.id,
    [week('2026-12-01', '2026-12-31', 8)],
    planner,
  );
  const endsOnClose = fakes.seedAllocation(
    grace.employeeId,
    atlas.id,
    [week('2026-11-02', CLOSE_DATE, 8)],
    planner,
  );
  const otherProject = fakes.seedAllocation(
    ada.employeeId,
    other.id,
    [week('2026-11-01', '2026-12-31', 8)],
    planner,
  );
  return {
    closer,
    planner,
    platform,
    people: { ada, alan, grace },
    atlas,
    allocations: { running, inside, split, later, muchLater, endsOnClose, otherProject },
  };
};

beforeEach(() => {
  fakes = makeSchedulingFakes(); // today is 2026-10-28
});

describe('ProjectClosingHook.preview', () => {
  it('lists the 3 allocations ending at the close date and the later ones removed, writing nothing (AC-25)', async () => {
    const { atlas, platform, people, allocations } = setup();
    const before = fakes.allocations();

    const impact = await withHook((hook) => hook.preview(atlas.id, CLOSE_DATE));

    const ada = { id: people.ada.employeeId, fullName: 'Ada Lovelace', team: platform };
    const alan = { id: people.alan.employeeId, fullName: 'Alan Turing', team: null };
    const grace = { id: people.grace.employeeId, fullName: 'Grace Hopper', team: null };
    expect(impact).toEqual(
      Exit.succeed({
        endingAtCloseDate: [
          {
            allocationId: allocations.running.allocation.id,
            employee: ada,
            startsOn: '2026-10-01',
            endsOn: '2026-12-31',
          },
          {
            allocationId: allocations.inside.allocation.id,
            employee: alan,
            startsOn: '2026-11-02',
            endsOn: '2026-11-30',
          },
          {
            allocationId: allocations.split.allocation.id,
            employee: ada,
            startsOn: '2026-11-02',
            endsOn: '2026-11-27',
          },
        ],
        removed: [
          {
            allocationId: allocations.later.allocation.id,
            employee: alan,
            startsOn: '2026-11-16',
            endsOn: '2026-11-30',
          },
          {
            allocationId: allocations.muchLater.allocation.id,
            employee: grace,
            startsOn: '2026-12-01',
            endsOn: '2026-12-31',
          },
        ],
      }),
    );
    expect(fakes.allocations()).toEqual(before);
    expect(fakes.history()).toEqual([]);
  });

  it('lists nothing for a project with no allocation past the close date', async () => {
    const { allocations } = setup();
    const quiet = fakes.seedProject();

    const impact = await withHook((hook) =>
      hook.preview(allocations.otherProject.allocation.projectId, '2026-12-31'),
    );
    const empty = await withHook((hook) => hook.preview(quiet.id, CLOSE_DATE));

    expect(impact).toEqual(Exit.succeed({ endingAtCloseDate: [], removed: [] }));
    expect(empty).toEqual(Exit.succeed({ endingAtCloseDate: [], removed: [] }));
  });
});

describe('ProjectClosingHook.apply', () => {
  it('trims and removes, recording `trimmed` / `removed` history by the closer (AC-25, AC-16)', async () => {
    const { atlas, closer, allocations } = setup();
    const untouched = [allocations.endsOnClose, allocations.otherProject];

    const exit = await withHook((hook) => hook.apply(atlas.id, CLOSE_DATE, closer));

    expect(Exit.isSuccess(exit)).toBe(true);
    const stored = (a: typeof allocations.running) => fakes.allocation(a.allocation.id);
    expect(stored(allocations.running)).toMatchObject({
      allocation: {
        version: 2,
        segments: [week('2026-10-01', CLOSE_DATE, 20)],
      },
      lastChangedBy: closer,
    });
    expect(stored(allocations.inside)?.allocation.segments).toEqual([
      week('2026-11-02', CLOSE_DATE, 16),
    ]);
    expect(stored(allocations.split)).toMatchObject({
      allocation: {
        version: 4,
        segments: [week('2026-11-02', '2026-11-08', 8), week('2026-11-09', CLOSE_DATE, 12)],
      },
      lastChangedBy: closer,
    });
    expect(stored(allocations.later)).toBeUndefined();
    expect(stored(allocations.muchLater)).toBeUndefined();
    for (const a of untouched) expect(stored(a)).toEqual(a);

    const history = fakes.history();
    expect(history.map((h) => [h.allocationId, h.entry.changeKind, h.changedBy])).toEqual([
      [allocations.running.allocation.id, 'trimmed', closer],
      [allocations.inside.allocation.id, 'trimmed', closer],
      [allocations.split.allocation.id, 'trimmed', closer],
      [allocations.later.allocation.id, 'removed', closer],
      [allocations.muchLater.allocation.id, 'removed', closer],
    ]);
    expect(history[0]).toMatchObject({
      employeeId: allocations.running.allocation.employeeId,
      projectId: atlas.id,
      entry: {
        effectiveFrom: '2026-11-14',
        before: [week('2026-10-01', '2026-12-31', 20)],
        after: [week('2026-10-01', CLOSE_DATE, 20)],
      },
    });
    expect(history[3]).toMatchObject({
      entry: {
        effectiveFrom: '2026-11-16',
        before: [week('2026-11-16', '2026-11-30', 8)],
        after: null,
      },
    });
  });

  it('rolls back with the caller’s unit of work (ADR-0006)', async () => {
    const { atlas, closer } = setup();
    const before = fakes.allocations();

    const exit = await withHook((hook) =>
      Effect.flatMap(UnitOfWork, (uow) =>
        uow.transactional(
          hook
            .apply(atlas.id, CLOSE_DATE, closer)
            .pipe(Effect.zipRight(Effect.fail('close failed'))),
        ),
      ),
    );

    expect(exit).toEqual(Exit.fail('close failed'));
    expect(fakes.allocations()).toEqual(before);
    expect(fakes.history()).toEqual([]);
  });
});
