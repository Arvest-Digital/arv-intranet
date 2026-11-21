import { Option } from 'effect';
import {
  allocatedOn,
  dailyCapacity,
  type EmploymentTerms,
  eachDay,
  type Holidays,
  type IsoDate,
  isoWeeksInRange,
  isWorkingDay,
  type RateSegment,
  type WeekSlice,
} from './capacity';
import { addTicks, sumTicks, type Ticks, ZERO_TICKS } from './ticks';
import type { EmploymentEndView } from './visibility';

/**
 * Weekly figures and cell states (AC-01, AC-06, AC-15, AC-21, AC-21b, AC-22): one rule set for the
 * board, my schedule, the free list, overbooking warnings and the import preview (ADR-0005).
 * Figures are built per day from the capacity calendar and summed by ISO week, so a later
 * day-level view reuses the same per-day rules (PRD §8). Everything stays in exact ticks.
 */

/** Exactly one per resource-week (AC-01, AC-06, AC-21b); the values match the api's `CellState`. */
export type CellState =
  | 'free'
  | 'partly-booked'
  | 'overbooked'
  | 'non-working'
  | 'incomplete-record'
  | 'needs-attention';

/** An allocation as the figures need it; its `full-day` segments are leave (AC-15). */
export interface ScheduledAllocation {
  readonly segments: ReadonlyArray<RateSegment>;
}

/** One resource: the employment terms `org` hands over and the resource's allocations. */
export interface ResourceSchedule<A extends ScheduledAllocation = ScheduledAllocation> {
  readonly terms: EmploymentTerms;
  readonly allocations: ReadonlyArray<A>;
}

/** The part of `employmentEndView` (visibility.ts) the figures apply (AC-22). */
export type EndVisibility = Pick<EmploymentEndView, 'allocationsUntil' | 'needingAttention'>;

/** A viewer who may see the employment end: every allocation counts and marks show. */
export const FULL_VISIBILITY: EndVisibility = { allocationsUntil: null, needingAttention: true };

/**
 * Outside the employment period (AC-13, AC-21). An unknown start (incomplete record) is not «outside»:
 * the incomplete-record state already covers it.
 */
const isOutsideEmployment = (terms: EmploymentTerms, date: IsoDate): boolean =>
  (terms.employmentStart !== null && date < terms.employmentStart) ||
  (terms.employmentEnd !== null && date > terms.employmentEnd);

/** `segment` books leave on `date`: a leave day on one of the resource's working days (AC-15). */
export const isLeaveDayOf = (
  segment: RateSegment,
  terms: EmploymentTerms,
  holidays: Holidays,
  date: IsoDate,
): boolean =>
  segment.ratePeriod === 'full-day' &&
  date >= segment.startsOn &&
  date <= segment.endsOn &&
  isWorkingDay(terms, holidays, date);

/** One resource-day. */
export interface DayFigures {
  readonly date: IsoDate;
  /** `None` for an incomplete record (AC-06). */
  readonly capacity: Option.Option<Ticks>;
  /** Work plus leave. Leave on unknown contract hours has no size, so it counts zero here. */
  readonly allocated: Ticks;
  /** A leave day, shown as «away» (AC-01, AC-15). */
  readonly away: boolean;
  /** Hours or leave outside the employment period, and the viewer may see the mark (AC-21, AC-22). */
  readonly needsAttention: boolean;
}

/**
 * The figures of one day. Allocations after `visibility.allocationsUntil` do not count at all, so a
 * viewer who may not see the employment end sees only zero capacity after it (AC-22).
 */
export const dayFigures = (
  schedule: ResourceSchedule,
  holidays: Holidays,
  date: IsoDate,
  visibility: EndVisibility = FULL_VISIBILITY,
): DayFigures => {
  const { terms } = schedule;
  const capacity = dailyCapacity(terms, holidays, date);
  let allocated = ZERO_TICKS;
  let away = false;
  if (visibility.allocationsUntil === null || date <= visibility.allocationsUntil) {
    for (const allocation of schedule.allocations) {
      for (const segment of allocation.segments) {
        const ticks = allocatedOn(segment, terms, holidays, date);
        allocated = addTicks(
          allocated,
          Option.getOrElse(ticks, () => ZERO_TICKS),
        );
        if (isLeaveDayOf(segment, terms, holidays, date)) away = true;
      }
    }
  }
  const booked = allocated > 0 || away;
  return {
    date,
    capacity,
    allocated,
    away,
    needsAttention: visibility.needingAttention && booked && isOutsideEmployment(terms, date),
  };
};

/** Every day of `from`…`to` (inclusive). */
export const dailyFigures = (
  schedule: ResourceSchedule,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
  visibility: EndVisibility = FULL_VISIBILITY,
): ReadonlyArray<DayFigures> =>
  eachDay(from, to).map((date) => dayFigures(schedule, holidays, date, visibility));

/** One resource-week, possibly clipped to a range at its edges (`from`/`to`). */
export interface WeekFigures extends WeekSlice {
  /** `None` for an incomplete record (AC-06). */
  readonly capacity: Option.Option<Ticks>;
  readonly allocated: Ticks;
  /** Days shown as «away» (AC-01). */
  readonly leaveDays: number;
  readonly needsAttention: boolean;
  readonly state: CellState;
}

/**
 * The one state of a week (AC-01), in order: incomplete record (capacity unknown, AC-06); needing
 * attention instead of overbooked while hours fall outside the employment period (AC-21b);
 * overbooked (allocated above capacity, on exact ticks); partly booked (above zero and at most
 * capacity, so «40/40» is partly booked); free (nothing allocated, capacity above zero);
 * non-working (capacity zero and nothing allocated).
 */
export const cellState = (week: {
  readonly capacity: Option.Option<Ticks>;
  readonly allocated: Ticks;
  readonly needsAttention: boolean;
}): CellState => {
  if (Option.isNone(week.capacity)) return 'incomplete-record';
  if (week.needsAttention) return 'needs-attention';
  if (week.allocated > week.capacity.value) return 'overbooked';
  if (week.allocated > 0) return 'partly-booked';
  return week.capacity.value > 0 ? 'free' : 'non-working';
};

/** Sums the days of one week slice into its figures and state. */
export const summariseWeek = (week: WeekSlice, days: ReadonlyArray<DayFigures>): WeekFigures => {
  const capacity = Option.map(
    Option.all(days.map((day) => day.capacity)),
    (values): Ticks => sumTicks(values),
  );
  const allocated = sumTicks(days.map((day) => day.allocated));
  const needsAttention = days.some((day) => day.needsAttention);
  return {
    ...week,
    capacity,
    allocated,
    leaveDays: days.filter((day) => day.away).length,
    needsAttention,
    state: cellState({ capacity, allocated, needsAttention }),
  };
};

/**
 * The ISO weeks of `from`…`to` with their figures and states. Edge weeks are clipped to the range:
 * pass whole weeks (Monday to Sunday) for board cells.
 */
export const weeklyFigures = (
  schedule: ResourceSchedule,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
  visibility: EndVisibility = FULL_VISIBILITY,
): ReadonlyArray<WeekFigures> => {
  const days = dailyFigures(schedule, holidays, from, to, visibility);
  return isoWeeksInRange(from, to).map((week) =>
    summariseWeek(
      week,
      days.filter((day) => day.date >= week.from && day.date <= week.to),
    ),
  );
};

/** An allocation runs past the employment end date: its needing-attention mark (AC-21). */
export const runsPastEmploymentEnd = (
  allocation: ScheduledAllocation,
  terms: EmploymentTerms,
): boolean =>
  terms.employmentEnd !== null &&
  allocation.segments.some((segment) => segment.endsOn > (terms.employmentEnd as IsoDate));
