import { PermissionDenied, type UserId } from '@arv/kernel';
import { Effect, Either, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { type AllocationId, Segment } from '../domain/allocation';
import {
  AllocationNotFound,
  AllocationRulesBroken,
  EmployeeRecordNotFound,
  OverbookingConfirmationRequired,
  ProjectClosed,
} from '../domain/errors';
import { TICKS_PER_HOUR } from '../domain/ticks';
import { EDIT_ALLOCATIONS, VIEW_WHOLE_BOARD } from '../permissions';
import { changeAllocation, createAllocation, removeAllocation } from './allocations';
import { AllocationChangedMeanwhile } from './errors';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const H = 60;

const week = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod: 'week' });

let fakes: SchedulingFakes;
let planner: ReturnType<SchedulingFakes['user']>;
let plannerId: UserId;

/** Runs `effect` as `actor` and returns its result or failure. */
const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(Effect.either(effect));

const as = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  actor = planner,
): Promise<Either.Either<A, E>> =>
  run(
    effect.pipe(Effect.provide(Layer.merge(fakes.layer, fakes.as(actor)))) as Effect.Effect<
      A,
      E,
      never
    >,
  );

const left = <A, E>(result: Either.Either<A, E>): E => {
  if (Either.isRight(result))
    throw new Error(`expected a failure, got ${JSON.stringify(result.right)}`);
  return result.left;
};

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result))
    throw new Error(`expected success, got ${JSON.stringify(result.left)}`);
  return result.right;
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
  planner = fakes.user([EDIT_ALLOCATIONS]);
  plannerId = planner._tag === 'User' ? planner.id : (undefined as never);
});

describe('createAllocation', () => {
  it('saves the allocation with last changed by and a created history entry (AC-07)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();

    const saved = right(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-27',
          rateMinutes: 20 * H,
          ratePeriod: 'week',
        }),
      ),
    );

    expect(saved.allocation.version).toBe(1);
    expect(saved.allocation.segments).toEqual([week('2026-11-02', '2026-11-27', 20)]);
    expect(saved.lastChangedBy).toBe(plannerId);
    expect(saved.lastChangedAt).toBeInstanceOf(Date);
    expect(fakes.allocation(saved.allocation.id)).toEqual(saved);
    expect(fakes.history()).toMatchObject([
      {
        allocationId: saved.allocation.id,
        employeeId: resource.employeeId,
        projectId: project.id,
        changedBy: plannerId,
        entry: { changeKind: 'created', effectiveFrom: null, before: null },
      },
    ]);
  });

  it('names every broken AC-09 rule and saves nothing', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();

    const error = left(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-10',
          endsOn: '2026-11-02',
          rateMinutes: 10,
          ratePeriod: 'day',
        }),
      ),
    );

    expect(error).toBeInstanceOf(AllocationRulesBroken);
    expect((error as AllocationRulesBroken).rules).toEqual([
      'end_before_start',
      'hours_not_quarter_hour',
    ]);
    expect(fakes.allocations()).toEqual([]);
    expect(fakes.history()).toEqual([]);
  });

  it('refuses a start before today: past plans are not rewritten (AC-09b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();

    const error = left(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-10-26',
          endsOn: '2026-11-06',
          rateMinutes: 20 * H,
          ratePeriod: 'week',
        }),
      ),
    );

    expect((error as AllocationRulesBroken).rules).toEqual(['starts_before_today']);
    expect(fakes.allocations()).toEqual([]);
  });

  it('warns with every overbooked week, then saves on confirm (AC-10)', async () => {
    // 32 hours of capacity: 8 hours a day, Monday to Thursday.
    const resource = fakes.seedResource({ contractMinutes: 32 * H, workingDays: [1, 2, 3, 4] });
    const other = fakes.seedProject();
    const project = fakes.seedProject();
    fakes.seedAllocation(
      resource.employeeId,
      other.id,
      [week('2026-11-02', '2026-11-08', 24)],
      plannerId,
    );
    const input = {
      employeeId: resource.employeeId,
      projectId: project.id,
      startsOn: '2026-11-02',
      endsOn: '2026-11-15',
      rateMinutes: 16 * H,
      ratePeriod: 'week' as const,
    };

    const warning = left(await as(createAllocation(input)));
    expect(warning).toBeInstanceOf(OverbookingConfirmationRequired);
    expect((warning as OverbookingConfirmationRequired).overbookedWeeks).toEqual([
      {
        weekStart: '2026-11-02',
        capacity: 32 * TICKS_PER_HOUR,
        allocated: 40 * TICKS_PER_HOUR,
        over: 8 * TICKS_PER_HOUR,
      },
    ]);
    expect(fakes.allocations()).toHaveLength(1);
    expect(fakes.history()).toEqual([]);

    const saved = right(await as(createAllocation({ ...input, confirm: true })));
    expect(fakes.allocation(saved.allocation.id)).toBeDefined();
    expect(fakes.history()).toHaveLength(1);
  });

  it('saves without asking when the week stays within capacity', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();

    right(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-06',
          rateMinutes: 40 * H,
          ratePeriod: 'week',
        }),
      ),
    );
  });

  it('refuses a closed project (AC-11)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject({ closeDate: '2026-10-20' });

    const error = left(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-06',
          rateMinutes: 8 * H,
          ratePeriod: 'week',
        }),
      ),
    );

    expect(error).toBeInstanceOf(ProjectClosed);
    expect(fakes.allocations()).toEqual([]);
  });

  it('refuses a range past the employment end, naming the last bookable date (AC-13)', async () => {
    const resource = fakes.seedResource({ employmentEnd: '2026-11-15' });
    const project = fakes.seedProject();

    const error = left(
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-30',
          rateMinutes: 20 * H,
          ratePeriod: 'week',
        }),
      ),
    );

    expect(error).toBeInstanceOf(AllocationRulesBroken);
    expect(error).toMatchObject({
      rules: ['outside_employment_period'],
      lastBookableDate: '2026-11-15',
    });
    expect(fakes.allocations()).toEqual([]);
  });

  it('fails for an unknown resource', async () => {
    const project = fakes.seedProject();
    const resource = fakes.seedResource();

    const error = left(
      await as(
        createAllocation({
          employeeId: project.id as never,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-06',
          rateMinutes: 8 * H,
          ratePeriod: 'week',
        }),
      ),
    );

    expect(error).toBeInstanceOf(EmployeeRecordNotFound);
    expect(resource).toBeDefined();
  });
});

describe('changeAllocation', () => {
  it('applies a change only from today and records it effective today (AC-09b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-10-01', '2026-11-30', 20)],
      plannerId,
    );
    const editor = fakes.user([EDIT_ALLOCATIONS]);

    const saved = right(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H }), editor),
    );

    expect(saved.allocation.version).toBe(2);
    expect(saved.allocation.segments).toEqual([
      week('2026-10-01', '2026-10-27', 20),
      week('2026-10-28', '2026-11-30', 10),
    ]);
    expect(saved.lastChangedBy).toBe(editor._tag === 'User' ? editor.id : undefined);
    expect(fakes.history()).toMatchObject([
      {
        allocationId: allocation.id,
        entry: { changeKind: 'changed', effectiveFrom: '2026-10-28' },
      },
    ]);
  });

  it('refuses moving the start of a running allocation (AC-09b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-10-01', '2026-11-30', 20)],
      plannerId,
    );

    const error = left(
      await as(changeAllocation(allocation.id, { version: 1, startsOn: '2026-10-05' })),
    );

    expect((error as AllocationRulesBroken).rules).toContain('starts_before_today');
    expect(fakes.allocation(allocation.id)?.allocation.version).toBe(1);
  });

  it('keeps the first change and refuses the second with the current values (AC-07b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-27', 20)],
      plannerId,
    );
    const first = fakes.user([EDIT_ALLOCATIONS]);
    const second = fakes.user([EDIT_ALLOCATIONS]);

    right(await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H }), first));
    const error = left(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 30 * H }), second),
    );

    expect(error).toBeInstanceOf(AllocationChangedMeanwhile);
    const { current, expectedVersion } = error as AllocationChangedMeanwhile;
    expect(expectedVersion).toBe(1);
    expect(current.allocation.version).toBe(2);
    expect(current.allocation.segments).toEqual([week('2026-11-02', '2026-11-27', 10)]);
    expect(current.lastChangedBy).toBe(first._tag === 'User' ? first.id : undefined);
    expect(fakes.history()).toHaveLength(1);
  });

  it('refuses with the current values when another save lands between read and write (AC-07b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-27', 20)],
      plannerId,
    );
    const other = fakes.user([EDIT_ALLOCATIONS]);
    const otherId = other._tag === 'User' ? other.id : (undefined as never);
    let once = true;
    fakes.hooks.beforeWrite = () => {
      if (once) fakes.saveAsOther(allocation.id, otherId);
      once = false;
    };

    const error = left(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H })),
    );

    expect(error).toBeInstanceOf(AllocationChangedMeanwhile);
    expect((error as AllocationChangedMeanwhile).current.lastChangedBy).toBe(otherId);
    expect(fakes.history()).toEqual([]);
  });

  it('warns when growing hours overbook, then saves on confirm (AC-10)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const other = fakes.seedProject();
    fakes.seedAllocation(
      resource.employeeId,
      other.id,
      [week('2026-11-02', '2026-11-08', 30)],
      plannerId,
    );
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-08', 10)],
      plannerId,
    );

    const warning = left(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 20 * H })),
    );
    expect((warning as OverbookingConfirmationRequired).overbookedWeeks).toEqual([
      {
        weekStart: '2026-11-02',
        capacity: 40 * TICKS_PER_HOUR,
        allocated: 50 * TICKS_PER_HOUR,
        over: 10 * TICKS_PER_HOUR,
      },
    ]);
    expect(fakes.allocation(allocation.id)?.allocation.version).toBe(1);

    right(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 20 * H, confirm: true })),
    );
    expect(fakes.allocation(allocation.id)?.allocation.version).toBe(2);
  });

  it('does not ask when shrinking hours in an already overbooked week', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const other = fakes.seedProject();
    fakes.seedAllocation(
      resource.employeeId,
      other.id,
      [week('2026-11-02', '2026-11-08', 40)],
      plannerId,
    );
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-08', 20)],
      plannerId,
    );

    right(await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H })));
  });

  it('refuses changes to an allocation of a closed project (AC-11)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-10-01', '2026-11-30', 20)],
      plannerId,
    );
    fakes.setCloseDate(project.id, '2026-10-27');

    const error = left(
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H })),
    );

    expect(error).toBeInstanceOf(ProjectClosed);
    expect(fakes.allocation(allocation.id)?.allocation.version).toBe(1);
  });

  describe('an allocation needing attention past the employment end (AC-21b)', () => {
    const setUp = () => {
      const resource = fakes.seedResource({ employmentEnd: '2026-11-15' });
      const project = fakes.seedProject();
      return fakes.seedAllocation(
        resource.employeeId,
        project.id,
        [week('2026-11-02', '2026-11-30', 20)],
        plannerId,
      ).allocation;
    };

    it('saves a shortening to the end date', async () => {
      const allocation = setUp();
      const saved = right(
        await as(changeAllocation(allocation.id, { version: 1, endsOn: '2026-11-15' })),
      );
      expect(saved.allocation.segments).toEqual([week('2026-11-02', '2026-11-15', 20)]);
    });

    it('refuses a change that leaves it running past the end date (AC-13)', async () => {
      const allocation = setUp();
      const error = left(
        await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H })),
      );
      expect(error).toMatchObject({
        _tag: 'AllocationRulesBroken',
        rules: ['outside_employment_period'],
        lastBookableDate: '2026-11-15',
      });
      expect(fakes.allocation(allocation.id)?.allocation.version).toBe(1);
    });

    it('saves a removal', async () => {
      const allocation = setUp();
      right(await as(removeAllocation(allocation.id, 1)));
      expect(fakes.allocation(allocation.id)).toBeUndefined();
    });
  });

  it('fails for an unknown allocation', async () => {
    const error = left(
      await as(
        changeAllocation('00000000-0000-7000-8000-999999999999' as AllocationId, { version: 1 }),
      ),
    );
    expect(error).toBeInstanceOf(AllocationNotFound);
  });
});

describe('removeAllocation', () => {
  it('deletes a future allocation and keeps its history with the remover (AC-07a)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-27', 20)],
      plannerId,
    );
    const remover = fakes.user([EDIT_ALLOCATIONS]);

    const removed = right(await as(removeAllocation(allocation.id, 1), remover));

    expect(removed).toEqual({ allocationId: allocation.id, outcome: 'deleted', endsOn: null });
    expect(fakes.allocation(allocation.id)).toBeUndefined();
    expect(fakes.history()).toMatchObject([
      {
        allocationId: allocation.id,
        changedBy: remover._tag === 'User' ? remover.id : undefined,
        entry: { changeKind: 'removed', effectiveFrom: '2026-10-28', after: null },
      },
    ]);
  });

  it('ends a running allocation yesterday, keeping the past booked (AC-09b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-10-01', '2026-11-30', 20)],
      plannerId,
    );

    const removed = right(await as(removeAllocation(allocation.id, 1)));

    expect(removed).toEqual({
      allocationId: allocation.id,
      outcome: 'ended',
      endsOn: '2026-10-27',
    });
    expect(fakes.allocation(allocation.id)?.allocation.segments).toEqual([
      week('2026-10-01', '2026-10-27', 20),
    ]);
  });

  it('refuses a stale version with the current values (AC-07b)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-27', 20)],
      plannerId,
      3,
    );

    const error = left(await as(removeAllocation(allocation.id, 2)));

    expect(error).toBeInstanceOf(AllocationChangedMeanwhile);
    expect((error as AllocationChangedMeanwhile).current.allocation.version).toBe(3);
    expect(fakes.allocation(allocation.id)).toBeDefined();
  });

  it('refuses removing an allocation of a closed project (AC-11)', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-10-01', '2026-10-20', 20)],
      plannerId,
    );
    fakes.setCloseDate(project.id, '2026-10-20');

    const error = left(await as(removeAllocation(allocation.id, 1)));

    expect(error).toBeInstanceOf(ProjectClosed);
    expect(fakes.allocation(allocation.id)).toBeDefined();
  });
});

describe('permissions (AC-12, AC-14)', () => {
  it('refuses every command without edit-allocations and leaves the plan unchanged', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const { allocation } = fakes.seedAllocation(
      resource.employeeId,
      project.id,
      [week('2026-11-02', '2026-11-27', 20)],
      plannerId,
    );
    const viewer = fakes.user([VIEW_WHOLE_BOARD]);
    const before = fakes.allocations();

    const results: ReadonlyArray<Either.Either<unknown, unknown>> = [
      await as(
        createAllocation({
          employeeId: resource.employeeId,
          projectId: project.id,
          startsOn: '2026-11-02',
          endsOn: '2026-11-06',
          rateMinutes: 8 * H,
          ratePeriod: 'week',
        }),
        viewer,
      ),
      await as(changeAllocation(allocation.id, { version: 1, rateMinutes: 10 * H }), viewer),
      await as(removeAllocation(allocation.id, 1), viewer),
    ];

    for (const result of results) {
      expect(left(result)).toEqual(new PermissionDenied({ permission: EDIT_ALLOCATIONS }));
    }
    expect(fakes.allocations()).toEqual(before);
    expect(fakes.history()).toEqual([]);
  });

  it('reads the permission from the actor of each call: a revoked grant refuses the next save', async () => {
    const resource = fakes.seedResource();
    const project = fakes.seedProject();
    const input = {
      employeeId: resource.employeeId,
      projectId: project.id,
      startsOn: '2026-11-02',
      endsOn: '2026-11-06',
      rateMinutes: 8 * H,
      ratePeriod: 'week' as const,
    };

    const saved = right(await as(createAllocation(input), planner));
    // Same user, same session; the role lost edit-allocations in the meantime.
    const revoked = fakes.user([VIEW_WHOLE_BOARD], plannerId);
    const error = left(
      await as(changeAllocation(saved.allocation.id, { version: 1, rateMinutes: 4 * H }), revoked),
    );

    expect(error).toBeInstanceOf(PermissionDenied);
    expect(fakes.allocation(saved.allocation.id)?.allocation.version).toBe(1);
  });
});
