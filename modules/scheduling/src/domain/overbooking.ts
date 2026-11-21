import { Option } from 'effect';
import {
  addDays,
  allocatedOn,
  type EmploymentTerms,
  eachDay,
  type Holidays,
  type IsoDate,
  isoWeekStart,
} from './capacity';
import { subtractTicks, type Ticks, ZERO_TICKS } from './ticks';
import {
  isLeaveDayOf,
  type ResourceSchedule,
  type ScheduledAllocation,
  type WeekFigures,
  weeklyFigures,
} from './weekly-figures';

/**
 * Overbooking impact (AC-10, AC-15, AC-19c): the overbooked weeks and the work allocations that fall
 * on leave days. Judged on exact ticks over whole ISO weeks (AC-10: overbooking is per week).
 */

/** An overbooked week with its exact figures (AC-10: «8 hours over in that week»). */
export interface WeekOver {
  readonly weekStart: IsoDate;
  readonly capacity: Ticks;
  readonly allocated: Ticks;
  readonly over: Ticks;
}

/**
 * The overbooked weeks among `weeks`. A week needing attention or of an incomplete record is never
 * overbooked (AC-06, AC-21b): its state says so.
 */
export const overbookedWeeks = (weeks: ReadonlyArray<WeekFigures>): ReadonlyArray<WeekOver> =>
  weeks.flatMap((week) =>
    week.state === 'overbooked' && Option.isSome(week.capacity)
      ? [
          {
            weekStart: week.weekStart,
            capacity: week.capacity.value,
            allocated: week.allocated,
            over: subtractTicks(week.allocated, week.capacity.value),
          },
        ]
      : [],
  );

/** First and last day `segments` cover from `from` on; `None` when nothing is left by then. */
const spanFrom = (
  segments: ScheduledAllocation['segments'],
  from: IsoDate,
): Option.Option<{ readonly from: IsoDate; readonly to: IsoDate }> => {
  const live = segments.filter((segment) => segment.endsOn >= from);
  const first = live.map((s) => s.startsOn).sort()[0];
  const last = live
    .map((s) => s.endsOn)
    .sort()
    .at(-1);
  if (first === undefined || last === undefined) return Option.none();
  return Option.some({ from: first < from ? from : first, to: last });
};

/** A work allocation whose hours fall on leave days (AC-15). */
export interface WorkOnLeave<A extends ScheduledAllocation> {
  readonly allocation: A;
  readonly days: ReadonlyArray<IsoDate>;
}

/**
 * The `work` allocations with hours on a day that one of the `leave` allocations books as leave,
 * over `from`…`to`, each with those days (AC-15). Named even when the week stays within capacity.
 * Leave on a non-working day or a public holiday takes no day, so nothing conflicts there.
 */
export const workOnLeaveDays = <A extends ScheduledAllocation>(
  work: ReadonlyArray<A>,
  leave: ReadonlyArray<ScheduledAllocation>,
  terms: EmploymentTerms,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
): ReadonlyArray<WorkOnLeave<A>> => {
  const leaveDays = eachDay(from, to).filter((date) =>
    leave.some((a) => a.segments.some((s) => isLeaveDayOf(s, terms, holidays, date))),
  );
  return work.flatMap((allocation) => {
    const days = leaveDays.filter((date) =>
      allocation.segments.some(
        (s) =>
          s.ratePeriod !== 'full-day' &&
          Option.getOrElse(allocatedOn(s, terms, holidays, date), () => 0) > 0,
      ),
    );
    return days.length > 0 ? [{ allocation, days }] : [];
  });
};

const isLeave = (allocation: ScheduledAllocation): boolean =>
  allocation.segments.some((segment) => segment.ratePeriod === 'full-day');

/** What saving `proposed` would cause, as the overbooking warning lists it (AC-10, AC-15). */
export interface AllocationImpact<A extends ScheduledAllocation> {
  readonly overbookedWeeks: ReadonlyArray<WeekOver>;
  /** Leave proposed: the existing work on its days; work proposed: itself on existing leave days. */
  readonly workOnLeaveDays: ReadonlyArray<WorkOnLeave<A>>;
}

/**
 * The impact of saving `proposed` (its segments after the change) next to the resource's other
 * allocations in `schedule` (without the one being changed). Only days from `today` on count: the
 * past is not rewritten (AC-09b). Every whole ISO week the proposal touches from today is judged,
 * so an allocation starting mid-week is judged on its week's total. Nothing is overbooked for an
 * incomplete record, whose capacity is unknown (AC-06). An empty impact means it fits.
 */
export const allocationImpact = <A extends ScheduledAllocation>(
  schedule: ResourceSchedule<A>,
  proposed: A,
  holidays: Holidays,
  today: IsoDate,
): AllocationImpact<A> => {
  const span = spanFrom(proposed.segments, today);
  if (Option.isNone(span)) return { overbookedWeeks: [], workOnLeaveDays: [] };
  const { from, to } = span.value;
  const weeks = weeklyFigures(
    { terms: schedule.terms, allocations: [...schedule.allocations, proposed] },
    holidays,
    isoWeekStart(from),
    addDays(isoWeekStart(to), 6),
  );
  const conflicts = isLeave(proposed)
    ? workOnLeaveDays(
        schedule.allocations.filter((a) => !isLeave(a)),
        [proposed],
        schedule.terms,
        holidays,
        from,
        to,
      )
    : workOnLeaveDays(
        [proposed],
        schedule.allocations.filter(isLeave),
        schedule.terms,
        holidays,
        from,
        to,
      );
  return { overbookedWeeks: overbookedWeeks(weeks), workOnLeaveDays: conflicts };
};

/**
 * The impact of replacing `current` with `proposed` (flow 5): only what the change makes worse, so
 * shrinking or moving hours never asks for a confirmation (AC-10 «growing hours»). An overbooked
 * week counts when the resource's allocated hours in it grow; a work-on-leave day counts when it
 * was not one before. `schedule` holds the resource's other allocations, without `current`.
 */
export const changeImpact = <A extends ScheduledAllocation>(
  schedule: ResourceSchedule<A>,
  current: A,
  proposed: A,
  holidays: Holidays,
  today: IsoDate,
): AllocationImpact<A> => {
  const after = allocationImpact(schedule, proposed, holidays, today);
  const before = allocationImpact(schedule, current, holidays, today);

  const allocatedBefore = (weekStart: IsoDate): Ticks =>
    weeklyFigures(
      { terms: schedule.terms, allocations: [...schedule.allocations, current] },
      holidays,
      weekStart,
      addDays(weekStart, 6),
    )[0]?.allocated ?? ZERO_TICKS;

  // `current` and `proposed` are the same allocation: match their conflicts with one key.
  const self = Symbol('self');
  const keyOf = (a: A): unknown => (a === current || a === proposed ? self : a);
  const daysBefore = new Map(before.workOnLeaveDays.map((c) => [keyOf(c.allocation), c.days]));

  return {
    overbookedWeeks: after.overbookedWeeks.filter(
      (week) => week.allocated > allocatedBefore(week.weekStart),
    ),
    workOnLeaveDays: after.workOnLeaveDays.flatMap((conflict) => {
      const known = new Set(daysBefore.get(keyOf(conflict.allocation)) ?? []);
      const days = conflict.days.filter((day) => !known.has(day));
      return days.length > 0 ? [{ allocation: conflict.allocation, days }] : [];
    }),
  };
};
