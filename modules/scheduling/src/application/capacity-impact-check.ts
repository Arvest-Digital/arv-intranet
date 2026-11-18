import { type EmployeeId, Today } from '@arv/kernel';
import {
  type CalendarDate,
  CapacityImpactCheck,
  type EmployeeTerms,
  OrgApi,
  type OverbookedWeek,
} from '@arv/org';
import { Effect, Layer } from 'effect';
import type { IsoDate } from '../domain/allocation';
import {
  addDays,
  type EmploymentTerms,
  type Holidays,
  isoWeekday,
  isoWeekStart,
} from '../domain/capacity';
import { overbookedWeeks, type WeekOver } from '../domain/overbooking';
import { TICKS_PER_MINUTE } from '../domain/ticks';
import { type ScheduledAllocation, weeklyFigures } from '../domain/weekly-figures';
import { termsOf } from './allocations/context';
import { AllocationRepository } from './ports';

/** No allocation runs past this date: the open end of «from this week on». */
const END_OF_TIME: IsoDate = '9999-12-31';

/**
 * The weeks of `from`…`to` that are overbooked with `after` but were not with `before` (AC-19c:
 * «would become overbooked»). Judged on whole ISO weeks and exact ticks, like the board (ADR-0005).
 */
const newlyOverbooked = (
  employeeId: EmployeeId,
  allocations: ReadonlyArray<ScheduledAllocation>,
  before: { readonly terms: EmploymentTerms; readonly holidays: Holidays },
  after: { readonly terms: EmploymentTerms; readonly holidays: Holidays },
  from: IsoDate,
  to: IsoDate,
): ReadonlyArray<OverbookedWeek> => {
  const weeksOver = (side: typeof before): ReadonlyArray<WeekOver> =>
    overbookedWeeks(weeklyFigures({ terms: side.terms, allocations }, side.holidays, from, to));
  const already = new Set(weeksOver(before).map((week) => week.weekStart));
  return weeksOver(after)
    .filter((week) => !already.has(week.weekStart))
    .map((week) => ({
      employeeId,
      weekStart: week.weekStart,
      // Whole minutes for the warning; rounded up so a sliver over never reads as 0.
      overMinutes: Math.ceil(week.over / TICKS_PER_MINUTE),
    }));
};

const holidaySet = (holidays: ReadonlyArray<{ readonly holidayDate: CalendarDate }>): Holidays =>
  new Set(holidays.map((h) => h.holidayDate));

/**
 * Flow 9, AC-19c: the resource-weeks, from this week on, that `terms` would push over capacity
 * and that are not overbooked with the resource's current terms. Read-only: nothing is written and
 * no allocation history is recorded. Weeks needing attention or of an incomplete record are never
 * overbooked (AC-06, AC-21b).
 */
export const termsChangeImpact = (employeeId: EmployeeId, terms: EmployeeTerms) =>
  Effect.gen(function* () {
    const from = isoWeekStart(yield* (yield* Today).date);
    const allocations = yield* AllocationRepository;
    const org = yield* OrgApi;

    const ahead = yield* allocations.listInWindow(
      { from, to: END_OF_TIME },
      { employeeIds: [employeeId] },
    );
    const lastDay = ahead
      .flatMap((a) => a.segments.map((s) => s.endsOn))
      .sort()
      .at(-1);
    if (lastDay === undefined) return [];
    const to = addDays(isoWeekStart(lastDay), 6);

    const { resources, holidays } = yield* org.employmentTerms([employeeId], { from, to });
    const resource = resources.find((r) => r.employeeId === employeeId);
    if (resource === undefined) return [];
    const holidayDates = holidaySet(holidays);
    return newlyOverbooked(
      employeeId,
      ahead,
      { terms: termsOf(resource), holidays: holidayDates },
      { terms, holidays: holidayDates },
      from,
      to,
    );
  });

/**
 * Flow 12, AC-27, AC-19c: the resource-weeks a public holiday on `holidayDate` would push over
 * capacity. Only its own week loses capacity, and only for resources who work that weekday; a
 * holiday before this week changes nothing ahead. Read-only, like `termsChangeImpact`.
 */
export const holidayAddedImpact = (holidayDate: CalendarDate) =>
  Effect.gen(function* () {
    const thisWeek = isoWeekStart(yield* (yield* Today).date);
    const from = isoWeekStart(holidayDate);
    if (from < thisWeek) return [];
    const to = addDays(from, 6);
    const allocations = yield* AllocationRepository;
    const org = yield* OrgApi;

    const { resources, holidays } = yield* org.employedIn({ from, to });
    const weekday = isoWeekday(holidayDate);
    const affected = resources.filter((r) => r.workingDays.includes(weekday));
    if (affected.length === 0) return [];
    const inWeek = yield* allocations.listInWindow(
      { from, to },
      { employeeIds: affected.map((r) => r.employeeId) },
    );

    const before = holidaySet(holidays);
    const after = new Set([...before, holidayDate]);
    return affected.flatMap((resource) => {
      const terms = termsOf(resource);
      return newlyOverbooked(
        resource.employeeId,
        inWeek.filter((a) => a.employeeId === resource.employeeId),
        { terms, holidays: before },
        { terms, holidays: after },
        from,
        to,
      );
    });
  });

/**
 * Scheduling's `CapacityImpactCheck` for org (ADR-0007), wired by the host. Captures the
 * repositories, the org facade and `Today` when built, so the port's methods need nothing; their
 * reads join the caller's open `UnitOfWork`.
 */
export const CapacityImpactCheckLive = Layer.effect(
  CapacityImpactCheck,
  Effect.gen(function* () {
    const context = yield* Effect.context<AllocationRepository | OrgApi | Today>();
    return {
      termsChange: (employeeId, terms) =>
        termsChangeImpact(employeeId, terms).pipe(Effect.provide(context)),
      holidayAdded: (holidayDate) => holidayAddedImpact(holidayDate).pipe(Effect.provide(context)),
    };
  }),
);
