import { EmployeeId, ProjectId } from '@arv/kernel';
import { Either, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  Allocation,
  AllocationId,
  addDays,
  type BookingContext,
  bookLeave,
  changeFromToday,
  createAllocation,
  type NewAllocationTerms,
  removeFromToday,
  Segment,
  trimAt,
} from './allocation';
import { AllocationRulesBroken, AllocationVersionConflict, ProjectClosed } from './errors';

const projectId = ProjectId.make('01933b8e-0000-7000-8000-000000000501');
const employeeId = EmployeeId.make('01933b8e-0000-7000-8000-000000000301');
const allocationId = AllocationId.make('01933b8e-0000-7000-8000-000000000601');

const H = 60; // minutes per hour
const today = '2026-10-28';

const ctx: BookingContext = {
  today,
  employment: { startsOn: '2025-01-01', endsOn: null },
  workingDaysPerWeek: 5,
  projectCloseDate: null,
};

const seg = (
  startsOn: string,
  endsOn: string,
  hours: number,
  ratePeriod: 'day' | 'week' = 'week',
) => new Segment({ startsOn, endsOn, rateMinutes: hours * H, ratePeriod });

const allocation = (segments: readonly [Segment, ...Segment[]], version = 1) =>
  new Allocation({ id: allocationId, employeeId, projectId, version, segments });

/** AC-09b: 1 October–30 November at 20 hours per week. */
const octToNov = allocation([seg('2026-10-01', '2026-11-30', 20)]);

const weekly = (startsOn: string, endsOn: string, hours: number) => ({
  startsOn,
  endsOn,
  ratePeriod: 'week' as const,
  rateMinutes: hours * H,
});

const rulesOf = <A>(result: Either.Either<A, unknown>) => {
  if (Either.isRight(result)) return [];
  const error = result.left;
  return error instanceof AllocationRulesBroken
    ? [...error.rules]
    : [(error as { _tag: string })._tag];
};

describe('addDays', () => {
  it.each([
    ['2026-10-28', -1, '2026-10-27'],
    ['2026-11-01', -1, '2026-10-31'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
  ])('%s %+d → %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('createAllocation', () => {
  it('creates one segment and a «created» history entry (AC-07)', () => {
    const result = Either.getOrThrow(
      createAllocation(projectId, weekly('2026-11-02', '2026-11-27', 20), ctx),
    );
    expect(result.segments).toEqual([seg('2026-11-02', '2026-11-27', 20)]);
    expect(result.history.changeKind).toBe('created');
    expect(result.history.effectiveFrom).toBeNull();
    expect(result.history.before).toBeNull();
    expect(result.history.after).toEqual(result.segments);
  });

  it('accepts a full-day (leave) rate with no hours (AC-15)', () => {
    const result = createAllocation(
      projectId,
      { startsOn: today, endsOn: '2026-11-03', ratePeriod: 'full-day', rateMinutes: null },
      ctx,
    );
    expect(Either.getOrThrow(result).segments[0]?.rateMinutes).toBeNull();
  });

  // AC-09: every input rule, one row each. 5 working days → weekly limit 120 h.
  it.each<[string, NewAllocationTerms, string[]]>([
    ['end before start', weekly('2026-11-10', '2026-11-09', 20), ['end_before_start']],
    ['zero hours', weekly(today, '2026-11-30', 0), ['hours_not_positive']],
    [
      'negative hours',
      { ...weekly(today, '2026-11-30', 0), rateMinutes: -10 },
      ['hours_not_positive', 'hours_not_quarter_hour'],
    ],
    [
      'not a quarter hour',
      { ...weekly(today, '2026-11-30', 0), rateMinutes: 20 * H + 10 },
      ['hours_not_quarter_hour'],
    ],
    [
      'more than 24 h per day',
      { startsOn: today, endsOn: '2026-11-30', ratePeriod: 'day', rateMinutes: 24 * H + 15 },
      ['hours_over_24_per_day'],
    ],
    [
      'more than 24 h per working day per week',
      weekly(today, '2026-11-30', 120.25),
      ['hours_over_24_per_working_day'],
    ],
    [
      'starts before today (AC-09b)',
      weekly('2026-10-27', '2026-11-30', 20),
      ['starts_before_today'],
    ],
    [
      'several rules at once',
      { startsOn: '2026-11-10', endsOn: '2026-11-09', ratePeriod: 'day', rateMinutes: 0 },
      ['end_before_start', 'hours_not_positive'],
    ],
  ])('refuses %s', (_name, terms, rules) => {
    expect(rulesOf(createAllocation(projectId, terms, ctx))).toEqual(rules);
  });

  it.each<[string, NewAllocationTerms]>([
    ['a quarter hour', weekly(today, today, 0.25)],
    [
      'exactly 24 h per day',
      { startsOn: today, endsOn: today, ratePeriod: 'day', rateMinutes: 24 * H },
    ],
    ['exactly 24 h × working days per week', weekly(today, today, 120)],
    ['a one-day allocation starting today', weekly(today, today, 8)],
  ])('accepts %s (AC-09 limits)', (_name, terms) => {
    expect(Either.isRight(createAllocation(projectId, terms, ctx))).toBe(true);
  });

  it('uses the resource’s working days for the weekly limit (AC-09)', () => {
    const threeDays = { ...ctx, workingDaysPerWeek: 3 };
    expect(rulesOf(createAllocation(projectId, weekly(today, today, 72), threeDays))).toEqual([]);
    expect(rulesOf(createAllocation(projectId, weekly(today, today, 72.25), threeDays))).toEqual([
      'hours_over_24_per_working_day',
    ]);
  });

  describe('employment period (AC-13)', () => {
    const endsOn15th = { ...ctx, employment: { startsOn: '2025-01-01', endsOn: '2026-11-15' } };

    it('refuses a range past the 15th and names the 15th as the last bookable date', () => {
      const result = createAllocation(projectId, weekly(today, '2026-11-30', 20), endsOn15th);
      expect(result).toEqual(
        Either.left(
          new AllocationRulesBroken({
            rules: ['outside_employment_period'],
            lastBookableDate: '2026-11-15',
          }),
        ),
      );
    });

    it('accepts a range ending on the 15th', () => {
      const result = createAllocation(projectId, weekly(today, '2026-11-15', 20), endsOn15th);
      expect(Either.isRight(result)).toBe(true);
    });

    it('refuses a range before the employment start', () => {
      const joiner = { ...ctx, employment: { startsOn: '2026-11-02', endsOn: null } };
      const result = createAllocation(projectId, weekly(today, '2026-11-30', 20), joiner);
      expect(result).toEqual(
        Either.left(
          new AllocationRulesBroken({
            rules: ['outside_employment_period'],
            lastBookableDate: null,
          }),
        ),
      );
    });
  });

  describe('project close date (AC-11, AC-25)', () => {
    it('refuses a closed project (close date passed)', () => {
      const closed = { ...ctx, projectCloseDate: '2026-10-27' };
      expect(createAllocation(projectId, weekly(today, '2026-11-30', 20), closed)).toEqual(
        Either.left(new ProjectClosed({ projectId, closeDate: '2026-10-27' })),
      );
    });

    it('keeps the project open on its close date, but not past it', () => {
      const closingToday = { ...ctx, projectCloseDate: today };
      expect(
        Either.isRight(createAllocation(projectId, weekly(today, today, 8), closingToday)),
      ).toBe(true);
      expect(createAllocation(projectId, weekly(today, '2026-10-29', 8), closingToday)).toEqual(
        Either.left(
          new AllocationRulesBroken({
            rules: ['past_project_close_date'],
            lastBookableDate: today,
          }),
        ),
      );
    });

    it('names the earlier of the employment end and the close date', () => {
      const both = {
        ...ctx,
        employment: { startsOn: null, endsOn: '2026-11-15' },
        projectCloseDate: '2026-11-10',
      };
      const result = createAllocation(projectId, weekly(today, '2026-11-30', 20), both);
      expect(result).toEqual(
        Either.left(
          new AllocationRulesBroken({
            rules: ['outside_employment_period', 'past_project_close_date'],
            lastBookableDate: '2026-11-10',
          }),
        ),
      );
    });
  });
});

describe('bookLeave (AC-15)', () => {
  const period = { startsOn: '2026-11-09', endsOn: '2026-11-13' };

  it('books one full-day segment with a created entry', () => {
    const update = Either.getOrThrow(bookLeave(projectId, true, period, ctx));
    const leave = new Segment({ ...period, rateMinutes: null, ratePeriod: 'full-day' });
    expect(update.segments).toEqual([leave]);
    expect(update.history).toMatchObject({ changeKind: 'created', before: null, after: [leave] });
  });

  it('refuses a project that is not of the leave type', () => {
    const result = bookLeave(projectId, false, period, ctx);
    expect(Either.getLeft(result)).toEqual(
      Option.some(
        new AllocationRulesBroken({ rules: ['not_a_leave_project'], lastBookableDate: null }),
      ),
    );
  });

  it('lists the leave-type rule with the other broken rules', () => {
    const result = bookLeave(
      projectId,
      false,
      { startsOn: '2026-10-27', endsOn: '2026-10-26' },
      ctx,
    );
    expect(
      Either.getLeft(result).pipe(Option.map((e) => (e as AllocationRulesBroken).rules)),
    ).toEqual(Option.some(['not_a_leave_project', 'starts_before_today', 'end_before_start']));
  });
});

describe('changeFromToday (AC-09b)', () => {
  it('keeps 1–27 October at 20 h and applies 10 h from today', () => {
    const result = Either.getOrThrow(
      changeFromToday(octToNov, 1, { rate: { ratePeriod: 'week', rateMinutes: 10 * H } }, ctx),
    );
    expect(result.segments).toEqual([
      seg('2026-10-01', '2026-10-27', 20),
      seg('2026-10-28', '2026-11-30', 10),
    ]);
    expect(result.history).toMatchObject({
      changeKind: 'changed',
      effectiveFrom: today,
      before: octToNov.segments,
      after: result.segments,
    });
  });

  it('extends the current segment when only the end date changes', () => {
    const result = Either.getOrThrow(changeFromToday(octToNov, 1, { endsOn: '2026-12-18' }, ctx));
    expect(result.segments).toEqual([seg('2026-10-01', '2026-12-18', 20)]);
  });

  it('never changes segments that ended before today', () => {
    const changedBefore = allocation([
      seg('2026-10-01', '2026-10-13', 20),
      seg('2026-10-14', '2026-11-30', 30),
    ]);
    const result = Either.getOrThrow(
      changeFromToday(changedBefore, 1, { rate: { ratePeriod: 'week', rateMinutes: 10 * H } }, ctx),
    );
    expect(result.segments).toEqual([
      seg('2026-10-01', '2026-10-13', 20),
      seg('2026-10-14', '2026-10-27', 30),
      seg('2026-10-28', '2026-11-30', 10),
    ]);
  });

  it('replaces a segment that started today rather than leaving an empty one', () => {
    const changedToday = allocation([
      seg('2026-10-01', '2026-10-27', 20),
      seg('2026-10-28', '2026-11-30', 10),
    ]);
    const result = Either.getOrThrow(
      changeFromToday(changedToday, 1, { rate: { ratePeriod: 'week', rateMinutes: 15 * H } }, ctx),
    );
    expect(result.segments).toEqual([
      seg('2026-10-01', '2026-10-27', 20),
      seg('2026-10-28', '2026-11-30', 15),
    ]);
  });

  it('replaces an allocation that has not started yet and may move its start', () => {
    const future = allocation([seg('2026-11-02', '2026-11-27', 20)]);
    const result = Either.getOrThrow(
      changeFromToday(future, 1, { startsOn: today, endsOn: '2026-11-13' }, ctx),
    );
    expect(result.segments).toEqual([seg(today, '2026-11-13', 20)]);
  });

  it.each<[string, Allocation, Parameters<typeof changeFromToday>[2], string[]]>([
    [
      'a changed start date before today',
      octToNov,
      { startsOn: '2026-10-05' },
      ['starts_before_today'],
    ],
    [
      'moving a future start before today',
      allocation([seg('2026-11-02', '2026-11-27', 20)]),
      { startsOn: '2026-10-27' },
      ['starts_before_today'],
    ],
    ['a new end before today', octToNov, { endsOn: '2026-10-20' }, ['ends_before_today']],
    [
      'an allocation that already ended',
      allocation([seg('2026-10-01', '2026-10-27', 20)]),
      { endsOn: '2026-11-30' },
      ['ends_before_today'],
    ],
    [
      'hours that break AC-09',
      octToNov,
      { rate: { ratePeriod: 'week', rateMinutes: 10 * H + 5 } },
      ['hours_not_quarter_hour'],
    ],
    [
      'an end before a future start',
      allocation([seg('2026-11-02', '2026-11-27', 20)]),
      { endsOn: '2026-11-01' },
      ['end_before_start'],
    ],
  ])('refuses %s', (_name, current, change, rules) => {
    expect(rulesOf(changeFromToday(current, current.version, change, ctx))).toEqual(rules);
  });

  it('accepts the unchanged start date of a running allocation', () => {
    const result = changeFromToday(
      octToNov,
      1,
      { startsOn: '2026-10-01', endsOn: '2026-11-20' },
      ctx,
    );
    expect(Either.getOrThrow(result).segments).toEqual([seg('2026-10-01', '2026-11-20', 20)]);
  });

  it('refuses a stale version (AC-07b)', () => {
    const changed = allocation(octToNov.segments, 3);
    expect(changeFromToday(changed, 2, { endsOn: '2026-11-20' }, ctx)).toEqual(
      Either.left(
        new AllocationVersionConflict({ allocationId, expectedVersion: 2, currentVersion: 3 }),
      ),
    );
  });

  it('refuses any change on a closed project (AC-11)', () => {
    const closed = { ...ctx, projectCloseDate: '2026-10-27' };
    expect(rulesOf(changeFromToday(octToNov, 1, { endsOn: '2026-11-20' }, closed))).toEqual([
      'ProjectClosed',
    ]);
  });

  // AC-21b: employment ends on the 15th, the allocation (marked as needing attention) runs to the 30th.
  describe('past the employment end date (AC-21b)', () => {
    const endsOn15th = { ...ctx, employment: { startsOn: '2025-01-01', endsOn: '2026-11-15' } };

    it.each([
      ['shortening to the 15th', { endsOn: '2026-11-15' }],
      ['shortening to before the 15th', { endsOn: '2026-11-06' }],
    ])('saves %s', (_name, change) => {
      expect(Either.isRight(changeFromToday(octToNov, 1, change, endsOn15th))).toBe(true);
    });

    it.each<[string, Parameters<typeof changeFromToday>[2]]>([
      [
        'a rate change that keeps it past the 15th',
        { rate: { ratePeriod: 'week', rateMinutes: 10 * H } },
      ],
      ['shortening that still runs past the 15th', { endsOn: '2026-11-20' }],
    ])('refuses %s as in AC-13, naming the 15th', (_name, change) => {
      expect(changeFromToday(octToNov, 1, change, endsOn15th)).toEqual(
        Either.left(
          new AllocationRulesBroken({
            rules: ['outside_employment_period'],
            lastBookableDate: '2026-11-15',
          }),
        ),
      );
    });

    it('saves a removal', () => {
      expect(Either.isRight(removeFromToday(octToNov, 1, endsOn15th))).toBe(true);
    });
  });
});

describe('removeFromToday (AC-07a, AC-09b)', () => {
  it('keeps 1–27 October booked and ends the allocation yesterday', () => {
    const result = Either.getOrThrow(removeFromToday(octToNov, 1, ctx));
    expect(result.outcome).toBe('ended');
    expect(result.segments).toEqual([seg('2026-10-01', '2026-10-27', 20)]);
    expect(result.history).toMatchObject({
      changeKind: 'removed',
      effectiveFrom: today,
      before: octToNov.segments,
      after: null,
    });
  });

  it.each([
    ['starts today', allocation([seg(today, '2026-11-30', 20)])],
    ['starts later', allocation([seg('2026-11-02', '2026-11-30', 20)])],
  ])('deletes an allocation that %s', (_name, current) => {
    const result = Either.getOrThrow(removeFromToday(current, 1, ctx));
    expect(result.outcome).toBe('deleted');
    expect(result.segments).toEqual([]);
  });

  it.each<[string, Allocation, number, Partial<BookingContext>, string]>([
    [
      'an allocation that already ended',
      allocation([seg('2026-10-01', '2026-10-27', 20)]),
      1,
      {},
      'ends_before_today',
    ],
    [
      'on a closed project (AC-11)',
      octToNov,
      1,
      { projectCloseDate: '2026-10-27' },
      'ProjectClosed',
    ],
    ['a stale version (AC-07b)', octToNov, 2, {}, 'AllocationVersionConflict'],
  ])('refuses %s', (_name, current, version, overrides, rule) => {
    expect(rulesOf(removeFromToday(current, version, { ...ctx, ...overrides }))).toEqual([rule]);
  });
});

describe('trimAt (AC-25)', () => {
  it('ends the allocation on the close date and drops later segments', () => {
    const split = allocation([
      seg('2026-10-01', '2026-10-27', 20),
      seg('2026-10-28', '2026-11-30', 10),
    ]);
    const result = Option.getOrThrow(Either.getOrThrow(trimAt(split, '2026-11-13', today)));
    expect(result.segments).toEqual([
      seg('2026-10-01', '2026-10-27', 20),
      seg('2026-10-28', '2026-11-13', 10),
    ]);
    expect(result.history).toMatchObject({
      changeKind: 'trimmed',
      effectiveFrom: '2026-11-14',
      after: result.segments,
    });
  });

  it('removes an allocation that starts after the close date', () => {
    const later = allocation([seg('2026-11-16', '2026-11-30', 20)]);
    const result = Option.getOrThrow(Either.getOrThrow(trimAt(later, '2026-11-13', today)));
    expect(result.segments).toEqual([]);
    expect(result.history).toMatchObject({ changeKind: 'removed', after: null });
  });

  it('leaves an allocation that already ends by the close date', () => {
    expect(trimAt(octToNov, '2026-11-30', today)).toEqual(Either.right(Option.none()));
  });

  it('refuses a close date before today, so the past is never rewritten', () => {
    expect(rulesOf(trimAt(octToNov, '2026-10-27', today))).toEqual(['close_date_before_today']);
  });
});
