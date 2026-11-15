import { Option } from 'effect';
import { addDays, type Holidays, type IsoDate, isoWeekStart } from './capacity';
import { subtractTicks, sumTicks, type Ticks, ZERO_TICKS } from './ticks';
import {
  type EndVisibility,
  FULL_VISIBILITY,
  type ResourceSchedule,
  type WeekFigures,
  weeklyFigures,
} from './weekly-figures';

/**
 * «Who is free» (AC-04, AC-06, AC-15, AC-21b): availability over the rest of the current week from
 * today plus the next N−1 full weeks, matching the board's week columns, ranked most free first.
 */

/** Today to the Sunday of the N-th week, counting today's week as the first (AC-04). */
export const freeListPeriod = (
  today: IsoDate,
  weeks: number,
): { readonly from: IsoDate; readonly to: IsoDate } => {
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new RangeError(`a free-list period needs a whole number of weeks ≥ 1, got ${weeks}`);
  }
  return { from: today, to: addDays(isoWeekStart(today), 7 * weeks - 1) };
};

/**
 * A week's availability: capacity minus allocated, where an overbooked week counts zero, never
 * negative (AC-04), and a week needing attention counts zero (AC-21b). Leave takes the full daily
 * capacity, so leave days are not free (AC-15). `None` for an incomplete record (AC-06).
 */
export const freeInWeek = (week: WeekFigures): Option.Option<Ticks> => {
  switch (week.state) {
    case 'incomplete-record':
      return Option.none();
    case 'needs-attention':
    case 'overbooked':
      return Option.some(ZERO_TICKS);
    default:
      return Option.map(week.capacity, (capacity) => subtractTicks(capacity, week.allocated));
  }
};

/** One resource the free list considers, with how its employment end shows to the viewer (AC-22). */
export interface FreeListCandidate<R> extends ResourceSchedule {
  readonly resource: R;
  readonly visibility?: EndVisibility;
}

export interface FreeWeek {
  readonly weekStart: IsoDate;
  readonly free: Ticks;
}

export interface FreeListEntry<R> {
  readonly resource: R;
  readonly freeTotal: Ticks;
  readonly freePerWeek: ReadonlyArray<FreeWeek>;
}

export interface FreeList<R> {
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** The Monday of each week in the period. */
  readonly weeks: ReadonlyArray<IsoDate>;
  /** At least `minFree` in total, most free first; ties keep the candidates' order. */
  readonly entries: ReadonlyArray<FreeListEntry<R>>;
  /** Left out because their capacity is unknown (AC-06), in the candidates' order. */
  readonly incompleteRecords: ReadonlyArray<R>;
}

/**
 * The free list over `weeks` weeks from `today` for `candidates`, keeping those with at least
 * `minFree` (≥, AC-04). The current week counts only from today. Validating `weeks` (1–12) and
 * `minFree` (≥ 0) against user input is the caller's job (AC-05).
 */
export const freeList = <R>(
  candidates: ReadonlyArray<FreeListCandidate<R>>,
  holidays: Holidays,
  today: IsoDate,
  weeks: number,
  minFree: Ticks,
): FreeList<R> => {
  const { from, to } = freeListPeriod(today, weeks);
  const entries: FreeListEntry<R>[] = [];
  const incompleteRecords: R[] = [];
  for (const candidate of candidates) {
    const figures = weeklyFigures(
      candidate,
      holidays,
      from,
      to,
      candidate.visibility ?? FULL_VISIBILITY,
    );
    const free = Option.all(figures.map(freeInWeek));
    if (Option.isNone(free)) {
      incompleteRecords.push(candidate.resource);
      continue;
    }
    const freeTotal = sumTicks(free.value);
    if (freeTotal < minFree) continue;
    entries.push({
      resource: candidate.resource,
      freeTotal,
      freePerWeek: figures.map((week, i) => ({
        weekStart: week.weekStart,
        free: free.value[i] ?? ZERO_TICKS,
      })),
    });
  }
  // Array.prototype.sort is stable, so ties keep the candidates' order.
  entries.sort((a, b) => b.freeTotal - a.freeTotal);
  const weekStarts: IsoDate[] = [];
  for (let monday = isoWeekStart(from); monday <= to; monday = addDays(monday, 7)) {
    weekStarts.push(monday);
  }
  return { from, to, weeks: weekStarts, entries, incompleteRecords };
};
