import { PermissionDenied } from '@arv/kernel';
import { Effect, Either, Layer, Option } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { Segment } from '../domain/allocation';
import {
  AllocationRulesBroken,
  OverbookingConfirmationRequired,
  ProjectClosed,
} from '../domain/errors';
import { TICKS_PER_HOUR } from '../domain/ticks';
import { weeklyFigures } from '../domain/weekly-figures';
import { EDIT_ALLOCATIONS, VIEW_WHOLE_BOARD } from '../permissions';
import { bookLeave } from './leave';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const H = 60;

const week = (startsOn: string, endsOn: string, hours: number) =>
  new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod: 'week' });

let fakes: SchedulingFakes;
let planner: ReturnType<SchedulingFakes['user']>;

const as = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  actor = planner,
): Promise<Either.Either<A, E>> =>
  Effect.runPromise(
    Effect.either(
      effect.pipe(Effect.provide(Layer.merge(fakes.layer, fakes.as(actor)))) as Effect.Effect<
        A,
        E,
        never
      >,
    ),
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

const userId = (actor: typeof planner) => (actor._tag === 'User' ? actor.id : (undefined as never));

beforeEach(() => {
  fakes = makeSchedulingFakes();
  planner = fakes.user([EDIT_ALLOCATIONS]);
});

describe('bookLeave', () => {
  it('books 5 working days, each at the full daily capacity (AC-15)', async () => {
    const resource = fakes.seedResource({ contractMinutes: 40 * H, workingDays: [1, 2, 3, 4, 5] });
    const annual = fakes.seedProject({ type: 'leave' });

    const saved = right(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-11-09',
          endsOn: '2026-11-13',
        }),
      ),
    );

    expect(saved.allocation.projectId).toBe(annual.id);
    expect(saved.allocation.segments).toEqual([
      new Segment({
        startsOn: '2026-11-09',
        endsOn: '2026-11-13',
        rateMinutes: null,
        ratePeriod: 'full-day',
      }),
    ]);
    expect(saved.lastChangedBy).toBe(userId(planner));
    expect(fakes.history()).toMatchObject([
      {
        allocationId: saved.allocation.id,
        employeeId: resource.employeeId,
        projectId: annual.id,
        entry: { changeKind: 'created', effectiveFrom: null, before: null },
      },
    ]);

    const [figures] = weeklyFigures(
      {
        terms: {
          contractMinutes: resource.contractMinutes,
          workingDays: resource.workingDays,
          employmentStart: resource.employmentStart,
          employmentEnd: resource.employmentEnd,
        },
        allocations: [saved.allocation],
      },
      new Set(),
      '2026-11-09',
      '2026-11-15',
    );
    expect(figures?.capacity).toEqual(Option.some(40 * TICKS_PER_HOUR));
    expect(figures?.allocated).toBe(40 * TICKS_PER_HOUR);
    expect(figures?.leaveDays).toBe(5);
  });

  it('names a work allocation on the leave days even when the week fits, then saves on confirm (AC-15)', async () => {
    const resource = fakes.seedResource();
    const client = fakes.seedProject();
    const annual = fakes.seedProject({ type: 'leave' });
    const work = fakes.seedAllocation(
      resource.employeeId,
      client.id,
      [week('2026-11-02', '2026-11-13', 8)],
      userId(planner),
    );
    const input = {
      employeeId: resource.employeeId,
      projectId: annual.id,
      startsOn: '2026-11-04',
      endsOn: '2026-11-04',
    };

    const warning = left(await as(bookLeave(input)));
    expect(warning).toBeInstanceOf(OverbookingConfirmationRequired);
    expect(warning as OverbookingConfirmationRequired).toMatchObject({
      overbookedWeeks: [],
      workOnLeaveDays: [
        { allocationId: work.allocation.id, projectId: client.id, days: ['2026-11-04'] },
      ],
    });
    expect(fakes.allocations()).toHaveLength(1);
    expect(fakes.history()).toEqual([]);

    const saved = right(await as(bookLeave({ ...input, confirm: true })));
    expect(fakes.allocation(saved.allocation.id)).toBeDefined();
    expect(fakes.history()).toHaveLength(1);
  });

  it('warns when the leave overbooks a week (AC-15)', async () => {
    const resource = fakes.seedResource();
    const client = fakes.seedProject();
    const annual = fakes.seedProject({ type: 'leave' });
    fakes.seedAllocation(
      resource.employeeId,
      client.id,
      [week('2026-11-09', '2026-11-13', 40)],
      userId(planner),
    );

    const warning = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-11-13',
          endsOn: '2026-11-13',
        }),
      ),
    );

    expect((warning as OverbookingConfirmationRequired).overbookedWeeks).toEqual([
      {
        weekStart: '2026-11-09',
        capacity: 40 * TICKS_PER_HOUR,
        allocated: 48 * TICKS_PER_HOUR,
        over: 8 * TICKS_PER_HOUR,
      },
    ]);
  });

  it('refuses leave on a project that is not of the leave type', async () => {
    const resource = fakes.seedResource();
    const client = fakes.seedProject({ type: 'client' });

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: client.id,
          startsOn: '2026-11-09',
          endsOn: '2026-11-13',
        }),
      ),
    );

    expect(error).toBeInstanceOf(AllocationRulesBroken);
    expect((error as AllocationRulesBroken).rules).toEqual(['not_a_leave_project']);
    expect(fakes.allocations()).toEqual([]);
    expect(fakes.history()).toEqual([]);
  });

  it('lists every broken rule at once, including the leave-type one', async () => {
    const resource = fakes.seedResource();
    const client = fakes.seedProject({ type: 'client' });

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: client.id,
          startsOn: '2026-10-26',
          endsOn: '2026-10-30',
        }),
      ),
    );

    expect((error as AllocationRulesBroken).rules).toEqual([
      'not_a_leave_project',
      'starts_before_today',
    ]);
  });

  it('refuses leave starting before today: past plans are not rewritten (AC-09b)', async () => {
    const resource = fakes.seedResource();
    const annual = fakes.seedProject({ type: 'leave' });

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-10-27',
          endsOn: '2026-10-30',
        }),
      ),
    );

    expect(error).toBeInstanceOf(AllocationRulesBroken);
    expect((error as AllocationRulesBroken).rules).toEqual(['starts_before_today']);
    expect(fakes.allocations()).toEqual([]);
  });

  it('refuses leave past the employment end, naming the last bookable date (AC-13)', async () => {
    const resource = fakes.seedResource({ employmentEnd: '2026-11-10' });
    const annual = fakes.seedProject({ type: 'leave' });

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-11-09',
          endsOn: '2026-11-13',
        }),
      ),
    );

    expect(error).toMatchObject({
      rules: ['outside_employment_period'],
      lastBookableDate: '2026-11-10',
    });
  });

  it('refuses a closed leave project (AC-11)', async () => {
    const resource = fakes.seedResource();
    const annual = fakes.seedProject({ type: 'leave', closeDate: '2026-10-20' });

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-11-09',
          endsOn: '2026-11-13',
        }),
      ),
    );

    expect(error).toBeInstanceOf(ProjectClosed);
  });

  it('refuses without edit-allocations and saves nothing (AC-12)', async () => {
    const resource = fakes.seedResource();
    const annual = fakes.seedProject({ type: 'leave' });
    const viewer = fakes.user([VIEW_WHOLE_BOARD]);

    const error = left(
      await as(
        bookLeave({
          employeeId: resource.employeeId,
          projectId: annual.id,
          startsOn: '2026-11-09',
          endsOn: '2026-11-13',
          confirm: true,
        }),
        viewer,
      ),
    );

    expect(error).toBeInstanceOf(PermissionDenied);
    expect(fakes.allocations()).toEqual([]);
    expect(fakes.history()).toEqual([]);
  });
});
